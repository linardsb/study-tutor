import { expect, spyOn, test } from "bun:test";
import {
  attemptLine,
  chatReply,
  down,
  mockFetch,
  NO_MODEL,
  NOW,
  OPENAI,
  sentinelItem,
  withData,
} from "./__fixtures__/provider";
import { PRE_ATTEMPT_GUARD } from "./define";
import { type TeachbackInput, teachbackMark } from "./teachback_mark";
import { jobItem } from "./view";

const LINES = ["Find 10% of 45", "10% is 4.5", "Double it"];

function input(
  lines: readonly string[] = LINES,
  over: Parameters<typeof sentinelItem>[0] = {},
): TeachbackInput {
  const item = sentinelItem({ stem: "Find 20% of 45.", ...over });
  const j = jobItem([JSON.stringify({ ...attemptLine(item), t: NOW() })], item);
  if (!j.attempted) throw new Error("expected a post-attempt item");
  return { item: j.item, topic: "Percentage of an amount", lines };
}
const marks = (rows: unknown[]) => chatReply(JSON.stringify({ lines: rows }));
const three = [
  { mark: 1, note: "" },
  { mark: 1, note: "" },
  { mark: 0, note: "Say what you double." },
];

/** Runs the job with the console quiet: refusals and failures log by design. */
async function run(data: string, ...replies: Parameters<typeof mockFetch>) {
  const quiet = spyOn(console, "error").mockImplementation(() => {});
  try {
    const { f, calls } = mockFetch(...replies);
    const v = await teachbackMark.run(input(), {
      dataDir: data,
      fetch: f,
      now: NOW,
    });
    return { v, calls };
  } finally {
    quiet.mockRestore();
  }
}

test(
  "teachback_mark: 3 lines in, 3 marks out",
  withData(OPENAI, async (data) => {
    const { v } = await run(data, marks(three));
    expect(v).toEqual({
      by: "model",
      value: {
        lines: [
          { mark: 1, note: "" },
          { mark: 1, note: "" },
          { mark: 0, note: "Say what you double." },
        ],
      },
    });
  }),
);

test(
  "teachback_mark: 4 marks for 3 lines twice → no verdict (shape)",
  withData(OPENAI, async (data) => {
    const { v, calls } = await run(data, marks([...three, three[0]]));
    expect(v).toEqual({ by: "fallback", value: null, reason: "shape" });
    expect(calls.length).toBe(2);
  }),
);

test(
  "teachback_mark: a mark that is 2, true or '1' is the wrong shape",
  withData(OPENAI, async (data) => {
    for (const bad of [2, true, "1"]) {
      const { v } = await run(
        data,
        marks([{ mark: bad, note: "" }, ...three.slice(1)]),
      );
      expect(v).toEqual({ by: "fallback", value: null, reason: "shape" });
    }
  }),
);

test(
  "teachback_mark: a note bringing in a number the pupil never wrote is refused, then no verdict",
  withData(OPENAI, async (data) => {
    const { v } = await run(
      data,
      marks([three[0], three[1], { mark: 0, note: "The goal is 9." }]),
    );
    expect(v).toEqual({ by: "fallback", value: null, reason: "guard" });
  }),
);

test(
  "teachback_mark: invalid JSON twice → null",
  withData(OPENAI, async (data) => {
    const { v, calls } = await run(data, chatReply("oops"));
    expect(v.value).toBeNull();
    expect(calls.length).toBe(2);
  }),
);

test(
  "teachback_mark: provider down → null",
  withData(OPENAI, async (data) => {
    const { v } = await run(data, down);
    expect(v).toEqual({ by: "fallback", value: null, reason: "network" });
  }),
);

test(
  "teachback_mark: preset none → null, no fetch",
  withData(NO_MODEL, async (data) => {
    const { v, calls } = await run(data, marks(three));
    expect(v.value).toBeNull();
    expect(calls.length).toBe(0);
  }),
);

test(
  "teachback_mark: the post-attempt prompt carries the working and no pre-attempt guard line",
  withData(OPENAI, async (data) => {
    const { calls } = await run(data, marks(three));
    const { messages } = JSON.parse(String(calls[0]?.init.body)) as {
      messages: { role: string; content: string }[];
    };
    expect(messages[0]?.content).not.toContain(PRE_ATTEMPT_GUARD);
    expect(messages[0]?.content).toContain("exactly 3 entries");
    // sentinelItem has a mark_scheme; it wins over the working.
    expect(messages[1]?.content).toContain("Mark scheme: SENTINEL-SCHEME");
    expect(messages[1]?.content).toContain("3. Double it");
  }),
);

// What every maths item has today: no mark_scheme, a working whose last number is the answer.
const WORKING = "10% of 45 = 4.5. 20% = 2 × 4.5 = 9.";

test(
  "teachback_mark: with no mark_scheme the working is the scheme, and a note may not take its answer",
  withData(OPENAI, async (data) => {
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    try {
      const { f, calls } = mockFetch(
        marks([three[0], three[1], { mark: 0, note: "The goal is 9." }]),
      );
      const v = await teachbackMark.run(
        input(LINES, { mark_scheme: undefined, working: WORKING }),
        { dataDir: data, fetch: f, now: NOW },
      );
      const { messages } = JSON.parse(String(calls[0]?.init.body)) as {
        messages: { content: string }[];
      };
      expect(messages[1]?.content).toContain(`Mark scheme: ${WORKING}`);
      // 9 is in the scheme and not in the pupil's lines, so the note is refused.
      expect(v).toEqual({ by: "fallback", value: null, reason: "guard" });
    } finally {
      quiet.mockRestore();
    }
  }),
);
