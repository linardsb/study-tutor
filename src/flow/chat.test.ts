import { expect, spyOn, test } from "bun:test";
import { loadCasePack } from "../api/case";
import { lcg } from "../content/generators";
import { appendEvent, readLines } from "../events/append";
import { parseEvent } from "../events/types";
import {
  attemptLine,
  chatReply,
  countUsage,
  mockFetch,
  NO_MODEL,
  NOW,
  OPENAI,
  withData,
} from "../jobs/__fixtures__/provider";
import { FALLBACK_GUESS } from "../jobs/guess_first";
import { CALL_POINT, CHAT_JOBS, type ChatAsk, chat, findItem } from "./chat";

const pack = await loadCasePack("maths");
const TOPIC = "1MA1/R9/of-an-amount";
const DAY = "2026-10-05";

function item(id = `${TOPIC}#1`, seed?: number) {
  const found = findItem(pack, id, seed);
  if (found === null) throw new Error(`no item ${id}`);
  return found;
}
const ask = (
  job: ChatAsk["job"],
  it = item(),
  text = "10% first",
): ChatAsk => ({
  job,
  item: it,
  topic: "Percentage of an amount",
  text,
});

test("CALL_POINT names a point for every chat job", () => {
  expect(Object.keys(CALL_POINT).sort()).toEqual([...CHAT_JOBS].sort());
});

test("findItem: items-file ids, generated ids with a seed, and the misses", () => {
  expect(findItem(pack, `${TOPIC}#1`)?.stem).toStartWith("Find 20% of 45");
  expect(findItem(pack, `${TOPIC}#999`)).toBeNull();
  expect(findItem(pack, "nope")).toBeNull();
  const topic = pack.topics.find((t) => t.id === TOPIC);
  const gen = pack.gens[topic?.aliases[0] ?? ""];
  if (!gen) throw new Error("the topic has no generator");
  expect(findItem(pack, `${TOPIC}#gen`, 5)?.stem).toBe(gen(lcg(5)).stem);
  expect(findItem(pack, `${TOPIC}#gen`, 5)?.seed).toBe(5);
  expect(findItem(pack, `${TOPIC}#gen`)).toBeNull();
  expect(findItem(pack, `${TOPIC}#gen`, -1)).toBeNull();
  expect(findItem(pack, `${TOPIC}#gen`, 2 ** 32 + 5)).toBeNull();
  expect(findItem(pack, `${TOPIC}#gen`, 2 ** 32 - 1)).not.toBeNull();
  // Every maths topic has a generator today, so the miss is shown on a copy with an empty table.
  expect(findItem({ ...pack, gens: {} }, `${TOPIC}#gen`, 5)).toBeNull();
});

test(
  "call points: hint after an attempt and teach-back before one are refused with no provider call",
  withData(OPENAI, async (data) => {
    const { f, calls } = mockFetch(chatReply('{"text":"x"}'));
    const deps = { dataDir: data, fetch: f, now: NOW };
    expect(
      await chat(ask("teachback_mark"), readLines(data), DAY, deps),
    ).toEqual({ kind: "refused", reason: "attempt-first" });
    appendEvent(data, attemptLine(item()), NOW);
    expect(await chat(ask("hint"), readLines(data), DAY, deps)).toEqual({
      kind: "refused",
      reason: "already-attempted",
    });
    expect(await chat(ask("guess_first"), readLines(data), DAY, deps)).toEqual({
      kind: "refused",
      reason: "already-attempted",
    });
    expect(calls.length).toBe(0);
  }),
);

test(
  "a generated item is unlocked by an attempt at its own seed only",
  withData(NO_MODEL, async (data) => {
    const id = `${TOPIC}#gen`;
    appendEvent(data, attemptLine(item(id, 5), 5), NOW);
    const deps = { dataDir: data, now: NOW };
    const other = await chat(
      ask("teachback_mark", item(id, 6)),
      readLines(data),
      DAY,
      deps,
    );
    expect(other).toEqual({ kind: "refused", reason: "attempt-first" });
    const own = await chat(
      ask("teachback_mark", item(id, 5)),
      readLines(data),
      DAY,
      deps,
    );
    expect(own.kind).toBe("no-verdict");
  }),
);

for (const [name, setup] of [
  ["preset none", NO_MODEL],
  ["no config.json", null],
] as const)
  test(
    `no key set (${name}): every path runs its fallback and makes no provider call`,
    withData(setup, async (data) => {
      const { f, calls } = mockFetch(chatReply('{"text":"x"}'));
      const deps = { dataDir: data, fetch: f, now: NOW };
      const it = item();
      expect(await chat(ask("hint"), readLines(data), DAY, deps)).toEqual({
        kind: "text",
        by: "fallback",
        text: it.hint as string,
      });
      expect(
        await chat(ask("guess_first"), readLines(data), DAY, deps),
      ).toEqual({ kind: "text", by: "fallback", text: FALLBACK_GUESS });
      appendEvent(data, attemptLine(it), NOW);
      expect(
        await chat(ask("teachback_mark"), readLines(data), DAY, deps),
      ).toEqual({ kind: "no-verdict", working: it.working ?? null });
      expect(calls.length).toBe(0);
      expect(countUsage(data)).toBe(0);
    }),
  );

test(
  "a teach-back verdict gives the score and a record that replays; blank lines are dropped and at most 8 lines go",
  withData(OPENAI, async (data) => {
    appendEvent(data, attemptLine(item()), NOW);
    const rows = [
      { mark: 1, note: "" },
      { mark: 0, note: "Say what the 10% is of." },
      { mark: 1, note: "" },
    ];
    const { f, calls } = mockFetch(chatReply(JSON.stringify({ lines: rows })));
    const r = await chat(
      ask(
        "teachback_mark",
        item(),
        "Find 10% of 45\n\n  \n10% is 4.5\nDouble it\n",
      ),
      readLines(data),
      DAY,
      { dataDir: data, fetch: f, now: NOW },
    );
    if (r.kind !== "marks") throw new Error(`expected marks, got ${r.kind}`);
    expect([r.score, r.of]).toEqual([2, 3]);
    expect(
      parseEvent(JSON.stringify({ ...r.record, t: NOW() })),
    ).not.toBeNull();
    expect(r.record).toMatchObject({ item: `${TOPIC}#1`, marks: 2, of: 3 });
    expect(r.per).toBe("line");

    const many = Array.from({ length: 12 }, (_, i) => `step ${i + 1}`).join(
      "\n",
    );
    // The mock still answers 3 marks, so this reply is refused as the wrong shape; only the prompt matters here.
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    try {
      await chat(ask("teachback_mark", item(), many), readLines(data), DAY, {
        dataDir: data,
        fetch: f,
        now: NOW,
      });
    } finally {
      quiet.mockRestore();
    }
    const sent = JSON.parse(String(calls[1]?.init.body)) as {
      messages: { content: string }[];
    };
    expect(sent.messages[0]?.content).toContain("exactly 8 entries");
  }),
);

test(
  "#52: a mark-scheme item is scored out of the scheme's marks, not the pupil's line count",
  withData(OPENAI, async (data) => {
    const science = await loadCasePack("science");
    const found = findItem(science, "8464/4.1.1.2#6");
    if (found === null) throw new Error("no science item #6");
    appendEvent(
      data,
      {
        v: 2,
        type: "attempt",
        item: found.id,
        topic: found.topic,
        correct: null,
        sure: true,
        answer: "No light underground",
      },
      NOW,
    );
    // One of three lines makes both points: 2 of 2, where per-line marking could give at most 1 of 3.
    const rows = [
      { mark: 1, note: "" },
      { mark: 1, note: "" },
    ];
    const { f } = mockFetch(chatReply(JSON.stringify({ lines: rows })));
    const r = await chat(
      {
        job: "teachback_mark",
        item: found,
        topic: "Plant cells",
        text: "They are cells\nUnderground there is no light for photosynthesis, so chloroplasts do nothing\nThey take in water",
      },
      readLines(data),
      DAY,
      { dataDir: data, fetch: f, now: NOW },
    );
    if (r.kind !== "marks") throw new Error(`expected marks, got ${r.kind}`);
    expect([r.per, r.score, r.of]).toEqual(["point", 2, 2]);
    expect(r.record).toMatchObject({ marks: 2, of: 2 });
  }),
);

test(
  "one teach-back verdict per item per London day, refused before any provider call",
  withData(OPENAI, async (data) => {
    const it = item();
    appendEvent(data, attemptLine(it), NOW);
    appendEvent(
      data,
      { v: 1, type: "teachback", topic: TOPIC, item: it.id, marks: 1, of: 2 },
      () => "2026-10-05T16:00:00Z",
    );
    const { f, calls } = mockFetch(
      chatReply(JSON.stringify({ lines: [{ mark: 1, note: "" }] })),
    );
    const deps = { dataDir: data, fetch: f, now: NOW };
    const one = ask("teachback_mark", it, "Find 10% of 45");
    expect(await chat(one, readLines(data), "2026-10-05", deps)).toEqual({
      kind: "refused",
      reason: "taught-today",
    });
    expect(calls.length).toBe(0);
    expect((await chat(one, readLines(data), "2026-10-06", deps)).kind).toBe(
      "marks",
    );

    // 23:30 UTC in October is 00:30 the next day in London (BST).
    appendEvent(
      data,
      { v: 1, type: "teachback", topic: TOPIC, item: it.id, marks: 1, of: 1 },
      () => "2026-10-06T23:30:00Z",
    );
    expect(await chat(one, readLines(data), "2026-10-07", deps)).toEqual({
      kind: "refused",
      reason: "taught-today",
    });
  }),
);
