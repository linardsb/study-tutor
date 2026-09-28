import { expect, spyOn, test } from "bun:test";
import { appendEvent, readLines } from "../events/append";
import {
  attemptLine,
  chatReply,
  KEY,
  mockFetch,
  NO_MODEL,
  NOW,
  OPENAI,
  withData,
} from "../jobs/__fixtures__/provider";
import { loadCasePack } from "./case";
import { getChat, postChat } from "./chat";

const pack = await loadCasePack("maths");
const ID = "1MA1/R9/of-an-amount#1";
const TOPIC = "1MA1/R9/of-an-amount";
const ANSWER_KEYS = ["answers", "working", "mark_scheme", "misconceptions"];

const events = (data: string) => readLines(data).map((l) => JSON.parse(l));

test(
  "postChat: a malformed request is a 400 before any job runs",
  withData(OPENAI, async (data) => {
    const { f, calls } = mockFetch(chatReply('{"text":"x"}'));
    const deps = { dataDir: data, fetch: f, now: NOW };
    const bodies: unknown[] = [
      null,
      "hint",
      { job: "solve", item: ID, text: "x" },
      { job: "hint", text: "x" },
      { job: "hint", item: ID, text: "" },
      { job: "hint", item: ID, text: "   " },
      { job: "hint", item: ID },
      { job: "hint", item: `${TOPIC}#gen`, text: "x" },
      { job: "hint", item: `${TOPIC}#gen`, seed: -1, text: "x" },
      { job: "hint", item: `${TOPIC}#gen`, seed: 1.5, text: "x" },
      { job: "hint", item: ID, text: "x".repeat(2001) },
      { preset: "nope", key: KEY },
    ];
    for (const body of bodies)
      expect({
        body,
        s: (await postChat(body, data, pack, deps)).status,
      }).toEqual({
        body,
        s: 400,
      });
    expect(calls.length).toBe(0);
    expect(readLines(data)).toEqual([]);
  }),
);

test(
  "postChat: an unknown item is a 404; the call points are 409s",
  withData(NO_MODEL, async (data) => {
    const deps = { dataDir: data, now: NOW };
    expect(
      (
        await postChat(
          { job: "hint", item: `${TOPIC}#999`, text: "x" },
          data,
          pack,
          deps,
        )
      ).status,
    ).toBe(404);
    const early = await postChat(
      { job: "teachback_mark", item: ID, text: "x" },
      data,
      pack,
      deps,
    );
    expect(early).toEqual({
      status: 409,
      body: { error: "Try the question first." },
    });
    appendEvent(data, attemptLine({ id: ID, topic: TOPIC }), NOW);
    const late = await postChat(
      { job: "hint", item: ID, text: "x" },
      data,
      pack,
      deps,
    );
    expect(late.status).toBe(409);
    appendEvent(
      data,
      { v: 1, type: "teachback", topic: TOPIC, item: ID, marks: 1, of: 1 },
      NOW,
    );
    const again = await postChat(
      { job: "teachback_mark", item: ID, text: "x" },
      data,
      pack,
      deps,
    );
    expect(again).toEqual({
      status: 409,
      body: {
        error: "You have explained this one today. Try another question.",
      },
    });
  }),
);

test(
  "getChat: the question side only, before and after an attempt; attempted flips",
  withData(NO_MODEL, async (data) => {
    const q = new URLSearchParams({ item: ID });
    const before = getChat(data, pack, q) as {
      status: number;
      body: Record<string, unknown>;
    };
    expect(before.status).toBe(200);
    expect(before.body).toMatchObject({
      item: ID,
      topic: TOPIC,
      title: "Percentage of an amount",
      attempted: false,
      model: false,
    });
    appendEvent(data, attemptLine({ id: ID, topic: TOPIC }), NOW);
    const after = getChat(data, pack, q) as { body: Record<string, unknown> };
    expect(after.body.attempted).toBe(true);
    for (const body of [before.body, after.body])
      for (const k of ANSWER_KEYS) expect(Object.keys(body)).not.toContain(k);

    const gen = getChat(
      data,
      pack,
      new URLSearchParams({ item: `${TOPIC}#gen`, seed: "5" }),
    ) as { status: number; body: Record<string, unknown> };
    expect(gen.status).toBe(200);
    expect(gen.body.seed).toBe(5);
    expect(getChat(data, pack, new URLSearchParams()).status).toBe(400);
    expect(
      getChat(
        data,
        pack,
        new URLSearchParams({ item: `${TOPIC}#gen`, seed: "x" }),
      ).status,
    ).toBe(400);
    expect(
      getChat(data, pack, new URLSearchParams({ item: `${TOPIC}#9` })).status,
    ).toBe(404);
  }),
);

test(
  "postChat: a teach-back verdict saves teachback@1 and one xp line of 15; the reply carries the working and never the key",
  withData(OPENAI, async (data) => {
    appendEvent(data, attemptLine({ id: ID, topic: TOPIC }), NOW);
    const rows = [
      { mark: 1, note: "" },
      { mark: 0, note: "Say what you double." },
    ];
    const { f } = mockFetch(chatReply(JSON.stringify({ lines: rows })));
    const r = await postChat(
      { job: "teachback_mark", item: ID, text: "10% of 45 is 4.5\nDouble it" },
      data,
      pack,
      { dataDir: data, fetch: f, now: NOW },
    );
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      kind: "marks",
      score: 1,
      of: 2,
      saved: true,
    });
    expect((r.body as { working: string }).working).toContain("4.5");
    expect(JSON.stringify(r.body)).not.toContain(KEY);
    const log = events(data);
    expect(log.filter((e) => e.type === "teachback")).toMatchObject([
      { v: 1, item: ID, topic: TOPIC, marks: 1, of: 2 },
    ]);
    expect(log.filter((e) => e.type === "xp")).toMatchObject([
      { amount: 15, reason: "teachback" },
    ]);
  }),
);

test(
  "postChat: with no model a teach-back is no verdict and writes nothing",
  withData(NO_MODEL, async (data) => {
    appendEvent(data, attemptLine({ id: ID, topic: TOPIC }), NOW);
    const r = await postChat(
      { job: "teachback_mark", item: ID, text: "10% first\nDouble it" },
      data,
      pack,
      { dataDir: data, now: NOW },
    );
    expect(r.status).toBe(200);
    expect((r.body as { kind: string }).kind).toBe("no-verdict");
    expect(events(data).map((e) => e.type)).toEqual(["attempt"]);
  }),
);

test(
  "postChat: two teach-backs in flight for one item save one record and one xp line",
  withData(OPENAI, async (data) => {
    appendEvent(data, attemptLine({ id: ID, topic: TOPIC }), NOW);
    const rows = [
      { mark: 1, note: "" },
      { mark: 1, note: "" },
    ];
    const { f } = mockFetch(chatReply(JSON.stringify({ lines: rows })));
    const tb = {
      job: "teachback_mark",
      item: ID,
      text: "Find 10% of 45\nDouble it",
    };
    const deps = { dataDir: data, fetch: f, now: NOW };
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    try {
      const both = await Promise.all([
        postChat(tb, data, pack, deps),
        postChat(tb, data, pack, deps),
      ]);
      expect(
        both.map((r) => (r.body as { saved: boolean }).saved).sort(),
      ).toEqual([false, true]);
    } finally {
      quiet.mockRestore();
    }
    const log = events(data);
    expect(log.filter((e) => e.type === "teachback")).toHaveLength(1);
    expect(
      log.filter((e) => e.type === "xp" && e.reason === "teachback"),
    ).toHaveLength(1);
  }),
);

test(
  "postChat: a teach-back that runs past London midnight checks the day it saves on",
  withData(OPENAI, async (data) => {
    appendEvent(data, attemptLine({ id: ID, topic: TOPIC }), NOW);
    // 23:00Z is London midnight in October (BST). Another tab saves on the new day while this job runs.
    let t = "2026-10-05T22:59:50Z";
    const clock = () => t;
    const reply = chatReply(JSON.stringify({ lines: [{ mark: 1, note: "" }] }));
    const { f } = mockFetch(() => {
      t = "2026-10-05T23:00:10Z";
      appendEvent(
        data,
        { v: 1, type: "teachback", topic: TOPIC, item: ID, marks: 1, of: 1 },
        () => "2026-10-05T23:00:05Z",
      );
      return reply();
    });
    const r = await postChat(
      { job: "teachback_mark", item: ID, text: "Find 10% of 45" },
      data,
      pack,
      { dataDir: data, fetch: f, now: clock },
    );
    expect((r.body as { saved: boolean }).saved).toBe(false);
    expect(events(data).filter((e) => e.type === "teachback")).toHaveLength(1);
  }),
);
