import { expect, test } from "bun:test";
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
