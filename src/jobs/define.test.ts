import { expect, spyOn, test } from "bun:test";
import {
  chatReply,
  countUsage,
  down,
  mockFetch,
  NO_MODEL,
  NOW,
  OPENAI,
  type Reply,
  withData,
} from "./__fixtures__/provider";
import {
  defineJob,
  PRE_ATTEMPT_GUARD,
  postAttemptSystem,
  preAttemptSystem,
  textReply,
} from "./define";

const probe = defineJob<string, { text: string }>({
  name: "probe",
  prompt: (q) => [preAttemptSystem("Probe."), { role: "user", content: q }],
  validate: (v) => textReply(v, 100),
  texts: (o) => [o.text],
  sources: (q) => [q],
  fallback: () => ({ text: "fallback" }),
});
const Q = "Find 10% of 45.";

const valid = chatReply('{"text":"Find 10% first."}');
const twoBlocks = chatReply(
  '```json\n{"text":"ok"}\n```\nWait\n```json\n{"text":"ok"}\n```',
);
const status500: Reply = () => new Response("boom", { status: 500 });

const rows: {
  name: string;
  replies: Reply[];
  by: "model" | "fallback";
  reason?: string;
  calls: number;
  usage: number;
}[] = [
  {
    name: "valid first try",
    replies: [valid],
    by: "model",
    calls: 1,
    usage: 1,
  },
  {
    name: "fenced valid",
    replies: [chatReply('```json\n{"text":"ok"}\n```')],
    by: "model",
    calls: 1,
    usage: 1,
  },
  {
    name: "not-json then valid",
    replies: [chatReply("oops"), valid],
    by: "model",
    calls: 2,
    usage: 2,
  },
  {
    name: "invalid JSON twice",
    replies: [chatReply("oops"), chatReply("still not")],
    by: "fallback",
    reason: "not-json",
    calls: 2,
    usage: 2,
  },
  {
    name: "two fenced blocks twice",
    replies: [twoBlocks, twoBlocks],
    by: "fallback",
    reason: "not-json",
    calls: 2,
    usage: 2,
  },
  {
    name: "wrong shape twice",
    replies: [chatReply('{"txt":"x"}')],
    by: "fallback",
    reason: "shape",
    calls: 2,
    usage: 2,
  },
  {
    name: "guard then valid",
    replies: [chatReply('{"text":"Well done!"}'), valid],
    by: "model",
    calls: 2,
    usage: 2,
  },
  {
    name: "guard twice",
    replies: [chatReply('{"text":"🎉"}')],
    by: "fallback",
    reason: "guard",
    calls: 2,
    usage: 2,
  },
  {
    name: "provider down",
    replies: [down],
    by: "fallback",
    reason: "network",
    calls: 1,
    usage: 0,
  },
  {
    name: "http 500",
    replies: [status500],
    by: "fallback",
    reason: "http",
    calls: 1,
    usage: 0,
  },
];

for (const row of rows)
  test(
    `retry policy: ${row.name}`,
    withData(OPENAI, async (data) => {
      const quiet = spyOn(console, "error").mockImplementation(() => {});
      try {
        const { f, calls } = mockFetch(...row.replies);
        const v = await probe.run(Q, { dataDir: data, fetch: f, now: NOW });
        expect(v.by).toBe(row.by);
        if (v.by === "fallback") {
          expect(v.reason).toBe(row.reason as never);
          expect(v.value).toEqual({ text: "fallback" });
        }
        expect(calls.length).toBe(row.calls);
        expect(countUsage(data)).toBe(row.usage);
      } finally {
        quiet.mockRestore();
      }
    }),
  );

for (const [name, setup] of [
  ["preset none", NO_MODEL],
  ["no config.json", null],
] as const)
  test(
    `retry policy: ${name} → no-model, no fetch`,
    withData(setup, async (data) => {
      const { f, calls } = mockFetch(valid);
      const v = await probe.run(Q, { dataDir: data, fetch: f, now: NOW });
      expect(v).toEqual({
        by: "fallback",
        value: { text: "fallback" },
        reason: "no-model",
      });
      expect(calls.length).toBe(0);
      expect(countUsage(data)).toBe(0);
    }),
  );

test(
  "a refused reply is logged by reason, never by its text",
  withData(OPENAI, async (data) => {
    const err = spyOn(console, "error").mockImplementation(() => {});
    try {
      const { f } = mockFetch(chatReply('{"text":"Well done!"}'), valid);
      await probe.run(Q, { dataDir: data, fetch: f, now: NOW });
      const logged = err.mock.calls.map((c) => String(c[0]));
      expect(logged).toContain("Model reply refused (probe): guard");
      expect(logged.join("\n")).not.toContain("Well done");
    } finally {
      err.mockRestore();
    }
  }),
);

test(
  "shadow judge: 'would block' is logged and the verdict stands; a throw changes nothing; no call on fallback",
  withData(OPENAI, async (data) => {
    const err = spyOn(console, "error").mockImplementation(() => {});
    try {
      const seen: string[][] = [];
      const says = async (_job: string, texts: readonly string[]) => {
        seen.push([...texts]);
        return true;
      };
      const blocked = await probe.run(Q, {
        dataDir: data,
        fetch: mockFetch(valid).f,
        now: NOW,
        judge: says,
      });
      expect(blocked).toEqual({
        by: "model",
        value: { text: "Find 10% first." },
      });
      expect(seen).toEqual([["Find 10% first."]]);
      expect(err.mock.calls.map((c) => String(c[0]))).toContain(
        "Shadow judge (probe): would_block",
      );

      const throws = await probe.run(Q, {
        dataDir: data,
        fetch: mockFetch(valid).f,
        now: NOW,
        judge: async () => {
          throw new Error("judge down");
        },
      });
      expect(throws.by).toBe("model");

      seen.length = 0;
      const fell = await probe.run(Q, {
        dataDir: data,
        fetch: mockFetch(down).f,
        now: NOW,
        judge: says,
      });
      expect(fell.by).toBe("fallback");
      expect(seen).toEqual([]);
    } finally {
      err.mockRestore();
    }
  }),
);

test("the guard line is in the pre-attempt system message and not in the post-attempt one", () => {
  expect(preAttemptSystem("x").content).toContain(PRE_ATTEMPT_GUARD);
  expect(preAttemptSystem("x", "As Dan.").content).toContain(PRE_ATTEMPT_GUARD);
  expect(preAttemptSystem("x", "As Dan.").content).not.toContain("maths tutor");
  expect(postAttemptSystem("x").content).not.toContain(PRE_ATTEMPT_GUARD);
});
