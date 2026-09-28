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
import { FALLBACK_GUESS, type GuessInput, guessFirst } from "./guess_first";
import { jobItem } from "./view";

function input(): GuessInput {
  const j = jobItem([], sentinelItem());
  if (j.attempted) throw new Error("expected a pre-attempt view");
  return {
    view: j.view,
    topic: "Percentage of an amount",
    guess: "Divide 45 by 20",
  };
}
const fallback = { text: FALLBACK_GUESS };

test(
  "guess_first: a valid reply is the model's text",
  withData(OPENAI, async (data) => {
    const text =
      "Using 45 is right. Dividing by 20 is not it: try 10% of 45 first.";
    const { f } = mockFetch(chatReply(JSON.stringify({ text })));
    const v = await guessFirst.run(input(), {
      dataDir: data,
      fetch: f,
      now: NOW,
    });
    expect(v).toEqual({ by: "model", value: { text } });
  }),
);

test(
  "guess_first: invalid JSON twice → FALLBACK_GUESS",
  withData(OPENAI, async (data) => {
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    try {
      const { f, calls } = mockFetch(chatReply("oops"));
      const v = await guessFirst.run(input(), {
        dataDir: data,
        fetch: f,
        now: NOW,
      });
      expect(v.value).toEqual(fallback);
      expect(calls.length).toBe(2);
    } finally {
      quiet.mockRestore();
    }
  }),
);

test(
  "guess_first: provider down → FALLBACK_GUESS",
  withData(OPENAI, async (data) => {
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    try {
      const v = await guessFirst.run(input(), {
        dataDir: data,
        fetch: mockFetch(down).f,
        now: NOW,
      });
      expect(v.value).toEqual(fallback);
    } finally {
      quiet.mockRestore();
    }
  }),
);

test(
  "guess_first: preset none → FALLBACK_GUESS, no fetch",
  withData(NO_MODEL, async (data) => {
    const { f, calls } = mockFetch(chatReply('{"text":"x"}'));
    const v = await guessFirst.run(input(), { dataDir: data, fetch: f });
    expect(v.value).toEqual(fallback);
    expect(calls.length).toBe(0);
  }),
);

test(
  "guess_first: no answer-side field reaches the prompt, and the guard line is in the system message",
  withData(OPENAI, async (data) => {
    const { f, calls } = mockFetch(chatReply('{"text":"Try 10% first."}'));
    await guessFirst.run(input(), { dataDir: data, fetch: f, now: NOW });
    const { messages } = JSON.parse(String(calls[0]?.init.body)) as {
      messages: { role: string; content: string }[];
    };
    const sent = JSON.stringify(messages);
    for (const s of SENTINELS) expect(sent).not.toContain(s);
    expect(messages[0]?.content).toContain(PRE_ATTEMPT_GUARD);
    expect(sent).toContain("Divide 45 by 20");
  }),
);
