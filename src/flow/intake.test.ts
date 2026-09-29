import { expect, spyOn, test } from "bun:test";
import path from "node:path";
import { loadPacks } from "../api/case";
import { replay } from "../events/replay";
import { parseEvent } from "../events/types";
import {
  chatReply,
  down,
  mockFetch,
  NO_MODEL,
  NOW,
  OPENAI,
  withData,
} from "../jobs/__fixtures__/provider";
import { ragFor } from "./diagnostic";
import {
  type IntakeRow,
  intakeRecord,
  mergeRows,
  readSheet,
  resolveCodes,
  runInterview,
} from "./intake";

const { pack } = await loadPacks(path.resolve(import.meta.dir, "../.."));
const { topics } = pack;
const PCT = "1MA1/R9/of-an-amount";
const RATIO = "1MA1/R4";
const CELLS = "8464/4.1.1.2";

/** The replayed topic map of one intake body, stamped with a fixed t. */
function mapOf(door: "sheet" | "interview" | "diagnostic", rows: IntakeRow[]) {
  const body = intakeRecord(door, rows);
  if (body === null) throw new Error("expected a body");
  return replay([JSON.stringify({ ...body, t: "2026-10-05T16:00:00Z" })])
    .topics;
}

test("resolveCodes: aliases, lower case, the science code and a topic id resolve; an unknown code is listed, not written", () => {
  const r = resolveCodes(topics, [
    { code: "U349", rag: "G" },
    { code: "u687", rag: null },
    { code: "4.1.1.2", rag: "R" },
    { code: "1MA1/R5", rag: "A" },
    { code: "U976", rag: "G" },
    { code: "U976", rag: "R" },
  ]);
  expect(r.rows).toEqual([
    { topic: PCT, rag: "G", code: "U349" },
    { topic: RATIO, rag: null, code: "u687" },
    { topic: CELLS, rag: "R", code: "4.1.1.2" },
    { topic: "1MA1/R5", rag: "A", code: "1MA1/R5" },
  ]);
  expect(r.unknown).toEqual(["U976"]);
});

test("resolveCodes: duplicates merge, worst R/A/G kept, first code kept", () => {
  const r = resolveCodes(topics, [
    { code: "U349", rag: "G" },
    { code: "U349", rag: "R" },
    { code: "U687", rag: null },
    { code: "1MA1/R4", rag: "A" },
  ]);
  expect(r.rows).toEqual([
    { topic: PCT, rag: "R", code: "U349" },
    { topic: RATIO, rag: "A", code: "U687" },
  ]);
  expect(mergeRows([{ topic: PCT, rag: null }])).toEqual([
    { topic: PCT, rag: null },
  ]);
});

test("intakeRecord: no rows → null; a record passes parseEvent", () => {
  expect(intakeRecord("sheet", [])).toBeNull();
  const body = intakeRecord("interview", [{ topic: PCT, rag: "R" }]);
  expect(parseEvent(JSON.stringify({ ...body, t: NOW() }))).not.toBeNull();
});

const EXPECTED = {
  [PCT]: { rung: 0, nextDue: null, rag: "R" },
  [RATIO]: { rung: 0, nextDue: null, rag: "A" },
  [CELLS]: { rung: 0, nextDue: null, rag: "G" },
};

test(
  "AC 3: the same codes through each door give the same topic map",
  withData(NO_MODEL, async (noModel) => {
    const sheet = await readSheet(
      { kind: "text", text: "R U349\nA U687\nG 4.1.1.2" },
      topics,
      { dataDir: noModel },
    );
    if (sheet.by === "none") throw new Error("expected rows");
    expect(sheet.unknown).toEqual([]);
    const sheetRows = sheet.rows.map(({ topic, rag }) => ({
      topic,
      rag: rag ?? "G",
    }));

    let interviewRows: IntakeRow[] = [];
    await withData(OPENAI, async (data) => {
      const { f } = mockFetch(
        chatReply(
          `{"topics":[{"topic":"${PCT}","confidence":"stuck"},{"topic":"${RATIO}","confidence":"unsure"},{"topic":"${CELLS}","confidence":"confident"}]}`,
        ),
      );
      const r = await runInterview(
        { confident: "cells", unsure: "ratio", stuck: "percentages" },
        topics,
        { dataDir: data, fetch: f, now: NOW },
      );
      if (r.by === "none") throw new Error("expected rows");
      interviewRows = r.rows;
    })();

    const diagnosticRows: IntakeRow[] = [
      { topic: PCT, rag: ragFor(false, true) },
      { topic: RATIO, rag: ragFor(true, false) },
      { topic: CELLS, rag: ragFor(true, true) },
    ];

    const a = mapOf("sheet", sheetRows);
    expect(a).toEqual(EXPECTED as typeof a);
    expect(mapOf("interview", interviewRows)).toEqual(a);
    expect(mapOf("diagnostic", diagnosticRows)).toEqual(a);
  }),
);

test(
  "T16 AC 9: the science topic goes through each door",
  withData(NO_MODEL, async (noModel) => {
    const sheet = await readSheet({ kind: "text", text: "R 4.1.1.2" }, topics, {
      dataDir: noModel,
    });
    if (sheet.by === "none") throw new Error("expected rows");
    expect(sheet.rows).toEqual([{ topic: CELLS, rag: "R", code: "4.1.1.2" }]);
    expect(mapOf("sheet", [{ topic: CELLS, rag: "R" }])[CELLS]?.rag).toBe("R");

    await withData(OPENAI, async (data) => {
      const { f } = mockFetch(
        chatReply(`{"topics":[{"topic":"${CELLS}","confidence":"stuck"}]}`),
      );
      const r = await runInterview(
        { confident: "", unsure: "", stuck: "cells" },
        topics,
        { dataDir: data, fetch: f, now: NOW },
      );
      if (r.by === "none") throw new Error("expected rows");
      expect(mapOf("interview", r.rows)[CELLS]?.rag).toBe("R");
    })();

    expect(
      mapOf("diagnostic", [{ topic: CELLS, rag: ragFor(false, false) }])[CELLS]
        ?.rag,
    ).toBe("R");
  }),
);

test(
  "readSheet: a photo with no model → no verdict, no-model",
  withData(NO_MODEL, async (data) => {
    const { f, calls } = mockFetch(chatReply("{}"));
    const r = await readSheet(
      { kind: "image", bytes: new Uint8Array([1]), mime: "image/png" },
      topics,
      { dataDir: data, fetch: f },
    );
    expect(r).toEqual({ by: "none", reason: "no-model" });
    expect(calls.length).toBe(0);
  }),
);

test(
  "runInterview: the provider down → no verdict, failed",
  withData(OPENAI, async (data) => {
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    try {
      const { f } = mockFetch(down);
      const r = await runInterview(
        { confident: "x", unsure: "", stuck: "" },
        topics,
        { dataDir: data, fetch: f, now: NOW },
      );
      expect(r).toEqual({ by: "none", reason: "failed" });
    } finally {
      quiet.mockRestore();
    }
  }),
);
