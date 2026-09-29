import { expect, spyOn, test } from "bun:test";
import {
  chatReply,
  countFailures,
  down,
  mockFetch,
  NO_MODEL,
  NOW,
  OPENAI,
  SENTINELS,
  withData,
} from "./__fixtures__/provider";
import { PRE_ATTEMPT_GUARD } from "./define";
import { type InterviewInput, interview } from "./interview";

const input: InterviewInput = {
  topics: [
    {
      id: "1MA1/R9/of-an-amount",
      title: "Percentage of an amount",
      aliases: ["U349"],
    },
    { id: "1MA1/R4", title: "Simplifying ratio", aliases: ["U687"] },
    {
      id: "8464/4.1.1.2",
      title: "Animal and plant cells",
      aliases: ["4.1.1.2"],
    },
  ],
  answers: {
    confident: "percentages",
    unsure: "ratio",
    stuck: "",
  },
};
const REPLY =
  '{"topics":[{"topic":"1MA1/R9/of-an-amount","confidence":"confident"},{"topic":"1MA1/R4","confidence":"unsure"}]}';

async function quietly(fn: () => Promise<void>) {
  const quiet = spyOn(console, "error").mockImplementation(() => {});
  try {
    await fn();
  } finally {
    quiet.mockRestore();
  }
}

test(
  "interview: a valid reply is the model's rows; an empty list is valid",
  withData(OPENAI, async (data) => {
    const { f } = mockFetch(chatReply(REPLY), chatReply('{"topics":[]}'));
    const deps = { dataDir: data, fetch: f, now: NOW };
    expect(await interview.run(input, deps)).toEqual({
      by: "model",
      value: {
        topics: [
          { topic: "1MA1/R9/of-an-amount", confidence: "confident" },
          { topic: "1MA1/R4", confidence: "unsure" },
        ],
      },
    });
    expect(await interview.run(input, deps)).toEqual({
      by: "model",
      value: { topics: [] },
    });
  }),
);

test(
  "interview: invalid JSON twice → no verdict, one job line",
  withData(OPENAI, (data) =>
    quietly(async () => {
      const { f, calls } = mockFetch(chatReply("oops"));
      const v = await interview.run(input, {
        dataDir: data,
        fetch: f,
        now: NOW,
      });
      expect(v).toEqual({ by: "fallback", value: null, reason: "not-json" });
      expect(calls.length).toBe(2);
      expect(countFailures(data)).toEqual([
        { job: "interview", reason: "not-json" },
      ]);
    }),
  ),
);

test(
  "interview: provider down → no verdict",
  withData(OPENAI, (data) =>
    quietly(async () => {
      const { f, calls } = mockFetch(down);
      const v = await interview.run(input, {
        dataDir: data,
        fetch: f,
        now: NOW,
      });
      expect(v.value).toBeNull();
      expect(calls.length).toBe(1);
    }),
  ),
);

test(
  "interview: an id outside the list is refused, retried, then no verdict",
  withData(OPENAI, (data) =>
    quietly(async () => {
      const { f, calls } = mockFetch(
        chatReply('{"topics":[{"topic":"1MA1/Z99","confidence":"stuck"}]}'),
      );
      const v = await interview.run(input, {
        dataDir: data,
        fetch: f,
        now: NOW,
      });
      expect(v).toEqual({ by: "fallback", value: null, reason: "shape" });
      expect(calls.length).toBe(2);
    }),
  ),
);

test(
  "interview: preset none → no fetch, no verdict",
  withData(NO_MODEL, async (data) => {
    const { f, calls } = mockFetch(chatReply(REPLY));
    const v = await interview.run(input, { dataDir: data, fetch: f, now: NOW });
    expect(v.value).toBeNull();
    expect(calls.length).toBe(0);
  }),
);

test(
  "interview: the prompt lists every topic id, no sentinel, and carries the guard line",
  withData(OPENAI, async (data) => {
    const { f, calls } = mockFetch(chatReply(REPLY));
    await interview.run(input, { dataDir: data, fetch: f, now: NOW });
    const { messages } = JSON.parse(String(calls[0]?.init.body)) as {
      messages: { role: string; content: string }[];
    };
    const sent = JSON.stringify(messages);
    for (const t of input.topics) expect(sent).toContain(t.id);
    for (const s of SENTINELS) expect(sent).not.toContain(s);
    expect(messages[0]?.content).toContain(PRE_ATTEMPT_GUARD);
    expect(messages[1]?.content).toContain(
      "Loses me or not taught yet: (nothing)",
    );
  }),
);
