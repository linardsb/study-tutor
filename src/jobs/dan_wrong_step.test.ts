import { expect, spyOn, test } from "bun:test";
import type { Misconception } from "../content/types";
import {
  chatReply,
  down,
  mockFetch,
  NO_MODEL,
  NOW,
  OPENAI,
  sentinelItem,
  withData,
} from "./__fixtures__/provider";
import {
  DAN_VOICE,
  type DanInput,
  danWrongStep,
  reaches,
} from "./dan_wrong_step";
import { PRE_ATTEMPT_GUARD } from "./define";
import { jobItem } from "./view";

const WRONG: Misconception = { answer: "4.5", message: "SENTINEL-MESSAGE" };

/** The sentinel item with a numeric wrong answer, so `reaches` has a number to look for. */
function input(over: Parameters<typeof sentinelItem>[0] = {}): DanInput {
  const item = sentinelItem({ misconceptions: [WRONG], ...over });
  const j = jobItem([], item);
  if (j.attempted) throw new Error("expected a pre-attempt view");
  const wrong = item.misconceptions[0];
  if (wrong === undefined) throw new Error("no misconception");
  return { view: j.view, topic: "Percentage of an amount", wrong };
}
const FALLBACK = { lines: ["10% of 45 = 4.5.", "I get 4.5."] };

/** Runs the job against one canned reply with console.error quiet; returns the verdict and the call count. */
async function refused(data: string, content: string) {
  const quiet = spyOn(console, "error").mockImplementation(() => {});
  try {
    const { f, calls } = mockFetch(chatReply(content));
    const v = await danWrongStep.run(input(), {
      dataDir: data,
      fetch: f,
      now: NOW,
    });
    return { v, calls: calls.length };
  } finally {
    quiet.mockRestore();
  }
}

test(
  "dan: a valid reply that reaches the bank's wrong answer is the model's lines",
  withData(OPENAI, async (data) => {
    const { f } = mockFetch(
      chatReply('{"lines":["10% of 45 is 4.5.","So 20% of 45 is 4.5."]}'),
    );
    const v = await danWrongStep.run(input(), {
      dataDir: data,
      fetch: f,
      now: NOW,
    });
    expect(v).toEqual({
      by: "model",
      value: { lines: ["10% of 45 is 4.5.", "So 20% of 45 is 4.5."] },
    });
  }),
);

test(
  "dan (R8): a reply that reaches a different answer is refused as shape, retried, then the fallback",
  withData(OPENAI, async (data) => {
    // 45 is in the stem, so the guard alone would pass it; only `reaches` refuses it.
    const { v, calls } = await refused(data, '{"lines":["I get 45."]}');
    expect(v).toEqual({ by: "fallback", value: FALLBACK, reason: "shape" });
    expect(calls).toBe(2);
  }),
);

test(
  "dan: invalid JSON twice → the fallback line",
  withData(OPENAI, async (data) => {
    const { v, calls } = await refused(data, "oops");
    expect(v).toEqual({ by: "fallback", value: FALLBACK, reason: "not-json" });
    expect(calls).toBe(2);
  }),
);

test(
  "dan: provider down → the fallback line, one call",
  withData(OPENAI, async (data) => {
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    try {
      const { f, calls } = mockFetch(down);
      const v = await danWrongStep.run(input(), {
        dataDir: data,
        fetch: f,
        now: NOW,
      });
      expect(v).toEqual({ by: "fallback", value: FALLBACK, reason: "network" });
      expect(calls.length).toBe(1);
    } finally {
      quiet.mockRestore();
    }
  }),
);

test(
  "dan: preset none → the fallback line, no fetch",
  withData(NO_MODEL, async (data) => {
    const { f, calls } = mockFetch(chatReply('{"lines":["x"]}'));
    const v = await danWrongStep.run(input(), {
      dataDir: data,
      fetch: f,
      now: NOW,
    });
    expect(v).toEqual({ by: "fallback", value: FALLBACK, reason: "no-model" });
    expect(calls.length).toBe(0);
  }),
);

test(
  "dan: a fourth line, an empty line and a 161-character line are each a shape refusal",
  withData(OPENAI, async (data) => {
    const long = `I get 4.5 ${"x".repeat(151)}`;
    expect(long.length).toBe(161);
    for (const lines of [
      ["4.5", "4.5", "4.5", "4.5"],
      ["I get 4.5.", ""],
      [long],
    ]) {
      const { v } = await refused(data, JSON.stringify({ lines }));
      expect({ lines, v }).toEqual({
        lines,
        v: { by: "fallback", value: FALLBACK, reason: "shape" },
      });
    }
  }),
);

test(
  "dan: the note echoed verbatim is a shape refusal",
  withData(OPENAI, async (data) => {
    const { v } = await refused(
      data,
      '{"lines":["I get 4.5. SENTINEL-MESSAGE"]}',
    );
    expect(v).toEqual({ by: "fallback", value: FALLBACK, reason: "shape" });
  }),
);

test(
  "dan: a number in no source is a guard refusal",
  withData(OPENAI, async (data) => {
    // derived from sentinelItem: stem 20, 45; scaffold 10, 45, 4.5; hint 20, 10; answer 4.5; note none. 6.3 is new.
    const { v } = await refused(data, '{"lines":["I get 4.5, so 6.3 next."]}');
    expect(v).toEqual({ by: "fallback", value: FALLBACK, reason: "guard" });
  }),
);

test(
  "dan: the prompt carries the wrong answer and note only; the system message speaks as Dan with the guard line",
  withData(OPENAI, async (data) => {
    const item = sentinelItem();
    const j = jobItem([], item);
    if (j.attempted) throw new Error("expected a pre-attempt view");
    const wrong = item.misconceptions[0] as Misconception;
    const { f, calls } = mockFetch(
      chatReply('{"lines":["I get SENTINEL-WRONG."]}'),
    );
    await danWrongStep.run(
      { view: j.view, topic: "Percentage of an amount", wrong },
      { dataDir: data, fetch: f, now: NOW },
    );
    const { messages } = JSON.parse(String(calls[0]?.init.body)) as {
      messages: { role: string; content: string }[];
    };
    const sent = JSON.stringify(messages);
    expect(sent).toContain("SENTINEL-WRONG");
    expect(sent).toContain("SENTINEL-MESSAGE");
    for (const s of [
      "SENTINEL-ANSWER-731",
      "SENTINEL-WORKING",
      "SENTINEL-SCHEME",
    ])
      expect(sent).not.toContain(s);
    expect(messages[0]?.content).toContain(PRE_ATTEMPT_GUARD);
    expect(messages[0]?.content).toContain(DAN_VOICE);
    expect(messages[0]?.content).not.toContain("maths tutor");
  }),
);

test("reaches: numbers must all appear; a text answer is matched normalised", () => {
  expect(reaches(["3 : 4 is the ratio"], "3:4")).toBe(true);
  expect(reaches(["I get 4.5"], "4.5")).toBe(true);
  expect(reaches(["I get 45"], "4.5")).toBe(false);
  expect(reaches(["I get 1,200"], "1200")).toBe(true);
  expect(reaches(["So it is a straight line"], "straight line")).toBe(true);
  expect(reaches(["So it is a curve"], "straight line")).toBe(false);
});
