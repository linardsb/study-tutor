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
import {
  type ExaminerInput,
  type ExaminerOutput,
  examinerMark,
  score,
} from "./examiner_mark";
import { jobItem } from "./view";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
// What every maths item has today: no mark_scheme, a working whose last number is the answer.
const WORKING = "10% of 45 = 4.5. 20% = 2 × 4.5 = 9.";

function input(over: Parameters<typeof sentinelItem>[0] = {}): ExaminerInput {
  const item = sentinelItem({ stem: "Find 20% of 45.", ...over });
  const j = jobItem([JSON.stringify({ ...attemptLine(item), t: NOW() })], item);
  if (!j.attempted) throw new Error("expected a post-attempt item");
  return {
    item: j.item,
    topic: "Percentage of an amount",
    photo: { bytes: JPEG, mime: "image/jpeg" },
  };
}
const reply = (rows: unknown[]) => chatReply(JSON.stringify({ lines: rows }));
const FIVE = [
  { kind: "method", mark: 1, note: "" },
  { kind: "accuracy", mark: 0, note: "Check the last multiplication." },
  { kind: "answer", mark: 1, note: "" },
  { kind: "units", mark: null, note: "" },
  { kind: "sense", mark: 1, note: "" },
];
const withRow = (i: number, row: unknown) =>
  FIVE.map((r, j) => (j === i ? row : r));

type Sent = {
  messages: {
    role: string;
    content:
      | string
      | { type: string; text?: string; image_url?: { url: string } }[];
  }[];
};

/** Runs the job with the console quiet: refusals and failures log by design. */
async function run(
  data: string,
  replies: Parameters<typeof mockFetch>,
  over: Parameters<typeof sentinelItem>[0] = {},
) {
  const quiet = spyOn(console, "error").mockImplementation(() => {});
  try {
    const { f, calls } = mockFetch(...replies);
    const v = await examinerMark.run(input(over), {
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
  "examiner_mark: five lines in order → the model's marks, 4 of 5, clean",
  withData(OPENAI, async (data) => {
    const { v } = await run(data, [reply(FIVE)]);
    expect(v).toEqual({
      by: "model",
      value: { lines: FIVE } as ExaminerOutput,
    });
    // 1 + 0 + 1 + 1 (units not needed) + 1
    expect(score(v.value as ExaminerOutput)).toEqual({
      marks: 4,
      of: 5,
      clean: true,
    });
  }),
);

test(
  "examiner_mark: units missing → 3 of 5, not clean",
  withData(OPENAI, async (data) => {
    const { v } = await run(data, [
      reply(withRow(3, { kind: "units", mark: 0, note: "Write the units." })),
    ]);
    expect(score(v.value as ExaminerOutput)).toEqual({
      marks: 3,
      of: 5,
      clean: false,
    });
  }),
);

test(
  "examiner_mark: four rows twice → no verdict (shape), 2 calls",
  withData(OPENAI, async (data) => {
    const { v, calls } = await run(data, [reply(FIVE.slice(0, 4))]);
    expect(v).toEqual({ by: "fallback", value: null, reason: "shape" });
    expect(calls.length).toBe(2);
  }),
);

test.each([
  ["rows in the wrong order", [FIVE[1], FIVE[0], ...FIVE.slice(2)]],
  ["six rows", [...FIVE, FIVE[4]]],
  ["an unknown kind", withRow(2, { kind: "presentation", mark: 1, note: "" })],
  ["mark 2", withRow(0, { kind: "method", mark: 2, note: "" })],
  ["mark true", withRow(0, { kind: "method", mark: true, note: "" })],
  ["mark '1'", withRow(0, { kind: "method", mark: "1", note: "" })],
  [
    "null off the units line",
    withRow(0, { kind: "method", mark: null, note: "" }),
  ],
])("examiner_mark: %s is the wrong shape", async (_name, rows) =>
  withData(OPENAI, async (data) => {
    const { v } = await run(data, [reply(rows)]);
    expect(v).toEqual({ by: "fallback", value: null, reason: "shape" });
  })(),
);

test(
  "examiner_mark: a note that states the answer from the working is refused (guard)",
  withData(OPENAI, async (data) => {
    const { v } = await run(
      data,
      [
        reply(
          withRow(1, { kind: "accuracy", mark: 0, note: "The answer is 9." }),
        ),
      ],
      { mark_scheme: undefined, working: WORKING },
    );
    expect(v).toEqual({ by: "fallback", value: null, reason: "guard" });
  }),
);

test.each([
  "The final value should be twelve, not seven.",
  "Forty-five is not the total.",
  "The total should be zero.",
])("examiner_mark: a number in words is refused (shape): %s", (note) =>
  withData(OPENAI, async (data) => {
    const { v, calls } = await run(data, [
      reply(withRow(1, { kind: "accuracy", mark: 0, note })),
    ]);
    expect(v).toEqual({ by: "fallback", value: null, reason: "shape" });
    expect(calls.length).toBe(2);
  })(),
);

test(
  "examiner_mark: a number word the stem prints is allowed",
  withData(OPENAI, async (data) => {
    const note = "Show the cost of both of the two packs.";
    const { v } = await run(
      data,
      [reply(withRow(0, { kind: "method", mark: 0, note }))],
      { stem: "Cereal comes in two packs. Which is the better buy?" },
    );
    expect(v.by).toBe("model");
  }),
);

test(
  'examiner_mark: "one" in a note is not read as a number',
  withData(OPENAI, async (data) => {
    const note = "One step is missing.";
    const { v } = await run(data, [
      reply(withRow(0, { kind: "method", mark: 0, note })),
    ]);
    expect(v.by).toBe("model");
  }),
);

test(
  "examiner_mark: the system message allows the question's numbers only, never the pupil's (PR #44 F4b)",
  withData(OPENAI, async (data) => {
    const { calls } = await run(data, [reply(FIVE)]);
    const { messages } = JSON.parse(String(calls[0]?.init.body)) as Sent;
    expect(messages[0]?.content).not.toContain("the pupil's own words");
    expect(messages[0]?.content).toContain("in digits or in words");
  }),
);

test(
  "examiner_mark: a note with an exclamation mark is refused (guard)",
  withData(OPENAI, async (data) => {
    const { v } = await run(data, [
      reply(withRow(1, { kind: "accuracy", mark: 0, note: "Nearly there!" })),
    ]);
    expect(v).toEqual({ by: "fallback", value: null, reason: "guard" });
  }),
);

test(
  "examiner_mark: invalid JSON twice → null, 2 calls",
  withData(OPENAI, async (data) => {
    const { v, calls } = await run(data, [chatReply("oops")]);
    expect(v.value).toBeNull();
    expect(calls.length).toBe(2);
  }),
);

test(
  "examiner_mark: provider down → null (network), 1 call",
  withData(OPENAI, async (data) => {
    const { v, calls } = await run(data, [down]);
    expect(v).toEqual({ by: "fallback", value: null, reason: "network" });
    expect(calls.length).toBe(1);
  }),
);

test(
  "examiner_mark: preset none → null, no fetch",
  withData(NO_MODEL, async (data) => {
    const { v, calls } = await run(data, [reply(FIVE)]);
    expect(v.value).toBeNull();
    expect(calls.length).toBe(0);
  }),
);

test(
  "examiner_mark: post-attempt prompt with the scheme, no answers, and the photo as an image part",
  withData(OPENAI, async (data) => {
    const { calls } = await run(data, [reply(FIVE)]);
    const { messages } = JSON.parse(String(calls[0]?.init.body)) as Sent;
    expect(messages[0]?.content).not.toContain(PRE_ATTEMPT_GUARD);
    expect(messages[0]?.content).toContain("Never write the corrected step");
    const parts = messages[1]?.content;
    if (!Array.isArray(parts)) throw new Error("expected content parts");
    expect(parts[0]?.text).toContain("Mark scheme: SENTINEL-SCHEME");
    expect(JSON.stringify(messages)).not.toContain("SENTINEL-ANSWER-731");
    expect(parts[1]?.type).toBe("image_url");
    expect(parts[1]?.image_url?.url.startsWith("data:image/jpeg;base64,")).toBe(
      true,
    );
  }),
);

test(
  "examiner_mark: with no mark_scheme the working is the scheme",
  withData(OPENAI, async (data) => {
    const { calls } = await run(data, [reply(FIVE)], {
      mark_scheme: undefined,
      working: WORKING,
    });
    const { messages } = JSON.parse(String(calls[0]?.init.body)) as Sent;
    const parts = messages[1]?.content;
    if (!Array.isArray(parts)) throw new Error("expected content parts");
    expect(parts[0]?.text).toContain(`Mark scheme: ${WORKING}`);
  }),
);

test(
  "examiner_mark: a text-only model refusing the image (HTTP 400) → null (http), 1 call",
  withData(OPENAI, async (data) => {
    const { v, calls } = await run(data, [
      () => Response.json({ error: { message: "no images" } }, { status: 400 }),
    ]);
    expect(v).toEqual({ by: "fallback", value: null, reason: "http" });
    expect(calls.length).toBe(1);
  }),
);
