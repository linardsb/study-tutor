import { expect, spyOn, test } from "bun:test";
import {
  chatReply,
  down,
  mockFetch,
  NO_MODEL,
  NOW,
  OPENAI,
  SENTINELS,
  sentinelItem,
  withData,
} from "./__fixtures__/provider";
import { PRE_ATTEMPT_GUARD } from "./define";
import { FALLBACK_HINT, type HintInput, hint } from "./hint";
import { jobItem } from "./view";

function input(over: Parameters<typeof sentinelItem>[0] = {}): HintInput {
  const j = jobItem([], sentinelItem(over));
  if (j.attempted) throw new Error("expected a pre-attempt view");
  return { view: j.view, topic: "Percentage of an amount", working: "" };
}
const LESSON_HINT = "20% is two lots of 10%.";

test(
  "hint: a valid reply is the model's text",
  withData(OPENAI, async (data) => {
    const { f } = mockFetch(chatReply('{"text":"Start with 10% of 45."}'));
    const v = await hint.run(input(), { dataDir: data, fetch: f, now: NOW });
    expect(v).toEqual({
      by: "model",
      value: { text: "Start with 10% of 45." },
    });
  }),
);

test(
  "hint: invalid JSON twice → the lesson's hint",
  withData(OPENAI, async (data) => {
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    try {
      const { f, calls } = mockFetch(chatReply("oops"));
      const v = await hint.run(input(), { dataDir: data, fetch: f, now: NOW });
      expect(v.value).toEqual({ text: LESSON_HINT });
      expect(calls.length).toBe(2);
    } finally {
      quiet.mockRestore();
    }
  }),
);

test(
  "hint: a number the question never gave is refused, retried, then the lesson's hint",
  withData(OPENAI, async (data) => {
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    try {
      const { f, calls } = mockFetch(chatReply('{"text":"Multiply by 6.3."}'));
      const v = await hint.run(input(), { dataDir: data, fetch: f, now: NOW });
      expect(v).toEqual({
        by: "fallback",
        value: { text: LESSON_HINT },
        reason: "guard",
      });
      expect(calls.length).toBe(2);
    } finally {
      quiet.mockRestore();
    }
  }),
);

test(
  "hint: provider down → the lesson's hint",
  withData(OPENAI, async (data) => {
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    try {
      const { f } = mockFetch(down);
      const v = await hint.run(input(), { dataDir: data, fetch: f, now: NOW });
      expect(v.value).toEqual({ text: LESSON_HINT });
    } finally {
      quiet.mockRestore();
    }
  }),
);

test(
  "hint: preset none → the lesson's hint, no fetch; no lesson hint → FALLBACK_HINT",
  withData(NO_MODEL, async (data) => {
    const { f, calls } = mockFetch(chatReply('{"text":"x"}'));
    const v = await hint.run(input(), { dataDir: data, fetch: f, now: NOW });
    expect(v.value).toEqual({ text: LESSON_HINT });
    expect(calls.length).toBe(0);
    const bare = await hint.run(input({ hint: undefined }), {
      dataDir: data,
      fetch: f,
    });
    expect(bare.value).toEqual({ text: FALLBACK_HINT });
  }),
);

test(
  "hint: no answer-side field reaches the prompt, and the guard line is in the system message",
  withData(OPENAI, async (data) => {
    const { f, calls } = mockFetch(chatReply('{"text":"Start with 10%."}'));
    await hint.run(
      { ...input(), working: "10% of 45 is 4.5" },
      { dataDir: data, fetch: f, now: NOW },
    );
    const { messages } = JSON.parse(String(calls[0]?.init.body)) as {
      messages: { role: string; content: string }[];
    };
    const sent = JSON.stringify(messages);
    for (const s of SENTINELS) expect(sent).not.toContain(s);
    expect(messages[0]?.content).toContain(PRE_ATTEMPT_GUARD);
    expect(sent).toContain("Find 20% of 45.");
  }),
);
