import { expect, spyOn, test } from "bun:test";
import {
  chatReply,
  countFailures,
  down,
  mockFetch,
  NO_MODEL,
  NOW,
  OPENAI,
  withData,
} from "./__fixtures__/provider";
import { PRE_ATTEMPT_GUARD } from "./define";
import { type IntakeReadInput, intakeRead, readCodes } from "./intake_read";

const KNOWN = ["1MA1/R9/of-an-amount", "U349", "1MA1/R4", "U687", "4.1.1.2"];
const TEXT =
  "6  Percentage of an amount  2  0%  0  R  U349\n9  Ratio  1  G  U976";
const text = (t = TEXT): IntakeReadInput => ({
  source: { kind: "text", text: t },
  known: KNOWN,
});
// A PNG signature: enough for imagePart, which only base64-encodes.
const image: IntakeReadInput = {
  source: {
    kind: "image",
    bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    mime: "image/png",
  },
  known: KNOWN,
};
const TWO = '{"codes":[{"code":"U349","rag":"R"},{"code":"U976","rag":"G"}]}';

/** Runs `fn` with console.error silenced: a refused reply logs its reason. */
async function quietly(fn: () => Promise<void>) {
  const quiet = spyOn(console, "error").mockImplementation(() => {});
  try {
    await fn();
  } finally {
    quiet.mockRestore();
  }
}

test(
  "intake_read: a valid reply is the model's codes",
  withData(OPENAI, async (data) => {
    const { f } = mockFetch(chatReply(TWO));
    const v = await intakeRead.run(text(), {
      dataDir: data,
      fetch: f,
      now: NOW,
    });
    expect(v).toEqual({
      by: "model",
      value: {
        codes: [
          { code: "U349", rag: "R" },
          { code: "U976", rag: "G" },
        ],
      },
    });
  }),
);

test(
  "intake_read: invalid JSON twice → the text reader, one job line",
  withData(OPENAI, (data) =>
    quietly(async () => {
      const { f, calls } = mockFetch(chatReply("oops"));
      const v = await intakeRead.run(text(), {
        dataDir: data,
        fetch: f,
        now: NOW,
      });
      expect(v).toEqual({
        by: "fallback",
        value: { codes: readCodes(TEXT, KNOWN) },
        reason: "not-json",
      });
      expect(calls.length).toBe(2);
      expect(countFailures(data)).toEqual([
        { job: "intake_read", reason: "not-json" },
      ]);
    }),
  ),
);

test(
  "intake_read: provider down → the text reader, one call",
  withData(OPENAI, (data) =>
    quietly(async () => {
      const { f, calls } = mockFetch(down);
      const v = await intakeRead.run(text(), {
        dataDir: data,
        fetch: f,
        now: NOW,
      });
      expect(v.value).toEqual({ codes: readCodes(TEXT, KNOWN) });
      expect(calls.length).toBe(1);
    }),
  ),
);

test(
  "intake_read: a code not in the pasted text is refused, retried, then the text reader",
  withData(OPENAI, (data) =>
    quietly(async () => {
      const { f, calls } = mockFetch(
        chatReply('{"codes":[{"code":"U999","rag":"R"}]}'),
      );
      const v = await intakeRead.run(text(), {
        dataDir: data,
        fetch: f,
        now: NOW,
      });
      expect(v).toEqual({
        by: "fallback",
        value: { codes: readCodes(TEXT, KNOWN) },
        reason: "shape",
      });
      expect(calls.length).toBe(2);
    }),
  ),
);

test(
  "intake_read: a photo with the provider down → no verdict",
  withData(OPENAI, (data) =>
    quietly(async () => {
      const { f } = mockFetch(down);
      const v = await intakeRead.run(image, {
        dataDir: data,
        fetch: f,
        now: NOW,
      });
      expect(v).toEqual({ by: "fallback", value: null, reason: "network" });
    }),
  ),
);

test(
  "intake_read: a photo reply with digits is accepted, not refused as an invented number",
  withData(OPENAI, async (data) => {
    const { f } = mockFetch(chatReply('{"codes":[{"code":"U349","rag":"R"}]}'));
    const v = await intakeRead.run(image, {
      dataDir: data,
      fetch: f,
      now: NOW,
    });
    expect(v).toEqual({
      by: "model",
      value: { codes: [{ code: "U349", rag: "R" }] },
    });
  }),
);

test(
  "intake_read: preset none → the text reader, no fetch",
  withData(NO_MODEL, async (data) => {
    const { f, calls } = mockFetch(chatReply(TWO));
    const v = await intakeRead.run(text(), {
      dataDir: data,
      fetch: f,
      now: NOW,
    });
    expect(v.value).toEqual({ codes: readCodes(TEXT, KNOWN) });
    expect(calls.length).toBe(0);
  }),
);

test(
  "intake_read: the photo request is a text part and one image part, and the guard line is in the system message",
  withData(OPENAI, async (data) => {
    const { f, calls } = mockFetch(chatReply(TWO));
    await intakeRead.run(image, { dataDir: data, fetch: f, now: NOW });
    const { messages } = JSON.parse(String(calls[0]?.init.body)) as {
      messages: { role: string; content: unknown }[];
    };
    expect(String(messages[0]?.content)).toContain(PRE_ATTEMPT_GUARD);
    const parts = messages[1]?.content as { type: string }[];
    expect(parts.map((p) => p.type)).toEqual(["text", "image_url"]);
    // The prompt never lists the pack's codes: that would invite a guess.
    expect(JSON.stringify(messages)).not.toContain("U687");
  }),
);

test("readCodes: the Sparx table layout, a comma cell, M codes and a science code", () => {
  const sheet = [
    "4   Percentage of an amount   1   100%   1   G   U349",
    "12  Working with fractions    3   100%   3   G   U745, U736",
    "1   Multiplying by 10s        1   100%   1   G   M113",
    "x   Cells                     2   0%     0   R   4.1.1.2",
    "9   Simplifying ratio         1   0%     0       U687",
  ].join("\n");
  expect(readCodes(sheet, KNOWN)).toEqual([
    { code: "U349", rag: "G" },
    { code: "U745", rag: "G" },
    { code: "U736", rag: "G" },
    { code: "M113", rag: "G" },
    { code: "4.1.1.2", rag: "R" },
    { code: "U687", rag: null },
  ]);
});

test("readCodes: the letter alone on the line before the code", () => {
  expect(readCodes("G\nM113\nR\nU349", KNOWN)).toEqual([
    { code: "M113", rag: "G" },
    { code: "U349", rag: "R" },
  ]);
});

test("readCodes: several pairs on one line", () => {
  expect(
    readCodes("2 G U325 G M901 G U179 R U349 Multiplying by 10s", KNOWN),
  ).toEqual([
    { code: "U325", rag: "G" },
    { code: "M901", rag: "G" },
    { code: "U179", rag: "G" },
    { code: "U349", rag: "R" },
  ]);
});

test("readCodes: a code alone has no R/A/G; lower case and a topic id are read", () => {
  expect(readCodes("U739", KNOWN)).toEqual([{ code: "U739", rag: null }]);
  expect(readCodes("A u349 R 1MA1/R4", KNOWN)).toEqual([
    { code: "U349", rag: "A" },
    { code: "1MA1/R4", rag: "R" },
  ]);
});
