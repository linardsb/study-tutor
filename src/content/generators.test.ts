import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  checkCoverage,
  checkGenerators,
  lessonCodes,
} from "../../scripts/test-generators";
import { loadGenerators } from "./generators";
import { loadTopics } from "./pack";
import type { Generator } from "./types";

test("checkGenerators catches a working that ends on the wrong number, a stem number the working drops, and a wrong key equal to the answer", () => {
  const broken: Generator = () => ({
    stem: "Find 7 lots of 2.",
    answers: ["4"],
    working: "2 × 3 = 5",
    hint: "h",
    wrong: { "4": "x" },
  });
  const failures = checkGenerators({ BAD: broken }, 1);
  expect(failures).toHaveLength(3);
  for (const f of failures) expect(f).toStartWith("BAD seed 24301:");
  expect(failures.join("\n")).toContain('ends "= 5" but the answer is "4"');
  expect(failures.join("\n")).toContain(
    "the stem uses 7 and the working never does",
  );
  expect(failures.join("\n")).toContain('wrong lists the correct answer "4"');
});

test("checkGenerators: an empty answer is not a number, a comma-grouped one is, and a typographic minus in the stem is the same number as a hyphen in the working", () => {
  const gen =
    (answers: string[], stem: string, working: string): Generator =>
    () => ({ stem, answers, working, hint: "h", wrong: {} });
  expect(checkGenerators({ EMPTY: gen([""], "s", "= ") }, 1)).toEqual([
    'EMPTY seed 24301: answer "" is not a valid number\n    stem:    s\n    working: = ',
  ]);
  expect(
    checkGenerators(
      { GROUPED: gen(["1,200"], "Double 600.", "600 × 2 = 1,200") },
      1,
    ),
  ).toEqual([]);
  expect(
    checkGenerators({ MINUS: gen(["-5"], "Start at \u22125.", "-5 = -5") }, 1),
  ).toEqual([]);
});

test("loadGenerators returns each subject's own table on a repeat call, and refuses a subject that is not a word", async () => {
  const tmp = mkdtempSync(path.join(tmpdir(), "study-tutor-"));
  mkdirSync(path.join(tmp, "content", "other"), { recursive: true });
  writeFileSync(
    path.join(tmp, "content", "other", "generators.js"),
    "globalThis.GEN = { X: () => ({}) };",
  );
  const maths = await loadGenerators("maths");
  expect(Object.keys(await loadGenerators("other", tmp))).toEqual(["X"]);
  const again = await loadGenerators("maths");
  expect(Object.keys(again)).toHaveLength(21);
  expect(again).toBe(maths);
  await expect(loadGenerators("../x", tmp)).rejects.toThrow(
    "subject must be a lower-case word",
  );
});

test("every maths generator passes 300 seeded runs under Bun", async () => {
  const table = await loadGenerators("maths");
  expect(Object.keys(table)).toHaveLength(21);
  expect(checkGenerators(table)).toEqual([]);
});

test("generator codes match the topic aliases and the lesson files exactly", async () => {
  const table = await loadGenerators("maths");
  const topics = await loadTopics("maths");
  const aliases = topics.flatMap((t) => t.aliases).sort();
  expect(checkCoverage(Object.keys(table), aliases)).toEqual({
    missing: [],
    extra: [],
  });
  expect(lessonCodes("content/maths/lessons")).toEqual(aliases);
});
