import { expect, test } from "bun:test";
import { loadCasePack } from "../api/case";
import type { CasePack, Generator, Item, Topic } from "../content/types";
import type { CaseRecord } from "../events/replay";
import { normaliseAnswer } from "../marking/normalise";
import { addDays } from "../mcp/clock";
import {
  buildCase,
  buildReask,
  calibration,
  casePool,
  hash,
  NO_NOTE,
  pickCase,
} from "./detective";

const pack = await loadCasePack("maths");
const pool = casePool(pack);
const START = "2026-10-01";

const days = (n: number, from = START): string[] =>
  Array.from({ length: n }, (_, i) => addDays(from, i));

const item = (
  id: string,
  topic: string,
  misconceptions: Item["misconceptions"],
): Item => ({
  id,
  topic,
  type: "cloze",
  stem: `stem ${id}`,
  answers: ["1"],
  working: "= 1",
  misconceptions,
});
const topic = (
  id: string,
  alias: string,
  concept?: Topic["concept"],
): Topic => ({
  id,
  title: `Title ${id}`,
  aliases: [alias],
  prerequisites: [],
  tier: "F",
  ...(concept ? { concept } : {}),
});
/** A hand generator: the answer is the roll, so instances differ; one named wrong answer. */
const gen: Generator = (rng) => {
  const n = Math.floor(rng() * 100);
  return {
    stem: `Double ${n}.`,
    answers: [String(n * 2)],
    working: `${n} × 2 = ${n * 2}`,
    hint: "h",
    wrong: { [String(n + 2)]: "You added 2 instead of doubling." },
  };
};
const m = (answer: string) => ({ answer, message: `note ${answer}` });

test("an item with no misconceptions never appears", () => {
  const synthetic: CasePack = {
    topics: [
      topic("A", "UA"),
      topic("B", "UB"),
      topic("C", "UC", { rule: "r", distractors: ["d"] }),
    ],
    items: new Map([
      [
        "A",
        [
          item("A#1", "A", [m("2")]),
          item("A#2", "A", []),
          item("A#3", "A", [m("3"), m("4")]),
        ],
      ],
      ["B", [item("B#1", "B", []), item("B#2", "B", [])]],
      ["C", []],
    ]),
    gens: { UA: gen },
  };
  const p = casePool(synthetic);
  expect(p).toEqual([
    { kind: "mistake", topic: "A", item: "A#1" },
    { kind: "mistake", topic: "A", item: "A#3" },
  ]);
  // B has no eligible item and no concept; C has a concept but no generator for its alias.
  for (const seed of [null, "A", "B", "C"])
    for (const day of days(400)) {
      const s = pickCase(day, seed, p);
      expect(s).not.toBeNull();
      if (s?.kind === "mistake") expect(s.item).not.toBe("A#2");
      expect(s?.topic).toBe("A");
    }
  expect(pickCase(START, null, [])).toBeNull();
});

test("the same day and seed give the same case, and consecutive days differ", () => {
  const src = pickCase(START, null, pool);
  if (!src) throw new Error("empty pool");
  expect(buildCase(src, START, pack)).toEqual(buildCase(src, START, pack));
  expect(hash("2026-10-01")).toBe(hash("2026-10-01"));
  let differ = 0;
  let prev: string | null = null;
  for (const day of days(366)) {
    const key = JSON.stringify(pickCase(day, null, pool));
    if (prev !== null && key !== prev) differ += 1;
    prev = key;
  }
  expect(differ).toBeGreaterThanOrEqual(350); // observed 364 of 365 (plan N5)
});

test("a confident-wrong seed keeps tomorrow on that topic, and a seed that is not in the pool is ignored", () => {
  for (const day of days(366)) {
    expect(pickCase(day, "1MA1/R9/of-an-amount", pool)?.topic).toBe(
      "1MA1/R9/of-an-amount",
    );
    expect(pickCase(day, "gone", pool)).toEqual(pickCase(day, null, pool));
  }
});

test("a mistake case: options are the item's messages plus NO_NOTE, the correct index points at the shown answer's message or at NO_NOTE, the working is the item's", () => {
  let runs = 0;
  let noNote = 0;
  for (const day of days(30))
    for (const src of pool) {
      if (src.kind !== "mistake") continue;
      const c = buildCase(src, day, pack);
      if (!c) throw new Error(`no case for ${src.item} on ${day}`);
      const it = pack.items.get(src.topic)?.find((i) => i.id === src.item);
      if (!it?.answers || it.working === undefined) throw new Error(src.item);
      runs += 1;
      expect(c.kind).toBe("mistake");
      expect(c.item).toBe(src.item);
      expect(c.options.length).toBeGreaterThanOrEqual(2);
      expect(c.options.length).toBeLessThanOrEqual(4);
      expect(c.options).toContain(NO_NOTE);
      expect(new Set(c.options).size).toBe(c.options.length);
      expect(c.correct).toBeGreaterThanOrEqual(0);
      expect(c.correct).toBeLessThan(c.options.length);
      expect(c.working).toBe(it.working);
      expect(c.instances).toEqual([]);
      expect(c.question).toBe("Which note goes to Kai?");
      const kaiRight =
        normaliseAnswer(c.shown ?? "") === normaliseAnswer(it.answers[0] ?? "");
      expect(c.options[c.correct] === NO_NOTE).toBe(kaiRight);
      if (kaiRight) noNote += 1;
      else {
        const mis = it.misconceptions.find((x) => x.answer === c.shown);
        expect(mis?.message).toBe(c.options[c.correct] ?? "");
      }
    }
  expect(runs).toBe(3150);
  const share = noNote / runs;
  expect(share).toBeGreaterThan(0.15); // observed 0.252
  expect(share).toBeLessThan(0.35);
});

test("a rule case: three instances with distinct answers, options are the rule and its distractors, the working is the rule, and a concept topic gives its rule case on about half its days", () => {
  const rules = pool.filter((s) => s.kind === "rule");
  expect(rules.map((s) => s.topic)).toEqual([
    "1MA1/A12",
    "1MA1/A9",
    "1MA1/R10",
  ]);
  for (const day of days(366))
    for (const src of rules) {
      const c = buildCase(src, day, pack);
      if (!c) throw new Error(`no rule case for ${src.topic} on ${day}`);
      const concept = pack.topics.find((t) => t.id === src.topic)?.concept;
      if (!concept) throw new Error(src.topic);
      expect(c.kind).toBe("rule");
      expect(c.item).toBeNull();
      expect(c.shown).toBeNull();
      expect(c.instances).toHaveLength(3);
      expect(new Set(c.instances.map((i) => i.answer)).size).toBe(3);
      for (const i of c.instances) expect(i.stem.length).toBeGreaterThan(0);
      expect([...c.options].sort()).toEqual(
        [concept.rule, ...concept.distractors].sort(),
      );
      expect(c.options[c.correct]).toBe(concept.rule);
      expect(c.working).toBe(concept.rule);
      expect(c.question).toBe("What is the rule?");
    }
  let ruleDays = 0;
  for (const day of days(366))
    if (pickCase(day, "1MA1/A12", pool)?.kind === "rule") ruleDays += 1;
  expect(ruleDays).toBeGreaterThanOrEqual(150); // observed 182
  expect(ruleDays).toBeLessThanOrEqual(215);
});

test("a re-ask on a mistake case has fresh numbers and its own misconceptions, or falls back to another item, or is null", () => {
  const u349 = {
    kind: "mistake",
    topic: "1MA1/R9/of-an-amount",
    item: "1MA1/R9/of-an-amount#1",
  } as const;
  const day = buildCase(u349, START, pack);
  const again = buildReask(u349, START, pack);
  if (!day || !again) throw new Error("no case");
  expect(again.item).toBeNull();
  expect(again.stem).not.toBe(day.stem);
  expect(again.options).toContain(NO_NOTE);
  expect(again.options.length).toBeGreaterThanOrEqual(2);
  expect(again.correct).toBeGreaterThanOrEqual(0);
  expect(again.working.length).toBeGreaterThan(0);

  // U283 on 2027-07-13: the one day in 366 where eight rolls carry no wrong key (observed).
  const side = {
    kind: "mistake",
    topic: "1MA1/G20/side",
    item: "1MA1/G20/side#1",
  } as const;
  const fallback = buildReask(side, "2027-07-13", pack);
  expect(fallback?.item).toBe("1MA1/G20/side#2");

  // A rule re-ask differs from the day's rule case in its numbers.
  const rule = { kind: "rule", topic: "1MA1/R10" } as const;
  const ruleDay = buildCase(rule, START, pack);
  const ruleAgain = buildReask(rule, START, pack);
  expect(ruleAgain?.kind).toBe("rule");
  expect(ruleAgain?.instances).not.toEqual(ruleDay?.instances);

  // One item, no generator: nothing to re-ask.
  const lone: CasePack = {
    topics: [topic("A", "UA")],
    items: new Map([["A", [item("A#1", "A", [m("2")])]]]),
    gens: {},
  };
  expect(
    buildReask({ kind: "mistake", topic: "A", item: "A#1" }, START, lone),
  ).toBeNull();
  // A source whose topic or item is gone from the pack builds nothing.
  expect(
    buildCase({ kind: "mistake", topic: "A", item: "A#9" }, START, lone),
  ).toBeNull();
  expect(buildCase({ kind: "rule", topic: "A" }, START, lone)).toBeNull();
  expect(
    buildCase({ kind: "mistake", topic: "Z", item: "Z#1" }, START, lone),
  ).toBeNull();
});

test("calibration sums the last seven pairs", () => {
  const rec = (bets: CaseRecord["bets"]): CaseRecord => ({
    kind: "mistake",
    topic: "t",
    item: null,
    bets,
  });
  // Nine days, a re-ask on day 3: ten pairs in day order. The last seven are
  // day3's re-ask [2,true], day4 [1,false], day5 [3,true], day6 [2,false], day7 [1,true], day8 [3,false], day9 [2,true]:
  // predicted 2+1+3+2+1+3+2 = 14, scored 2+3+1+2 = 8.
  const records: Record<string, CaseRecord> = {
    "2026-10-09": rec([[2, true]]),
    "2026-10-01": rec([[3, true]]),
    "2026-10-02": rec([[1, true]]),
    "2026-10-03": rec([
      [3, false],
      [2, true],
    ]),
    "2026-10-04": rec([[1, false]]),
    "2026-10-05": rec([[3, true]]),
    "2026-10-06": rec([[2, false]]),
    "2026-10-07": rec([[1, true]]),
    "2026-10-08": rec([[3, false]]),
  };
  expect(calibration(records)).toEqual({ predicted: 14, scored: 8, n: 7 });
  expect(calibration({})).toEqual({ predicted: 0, scored: 0, n: 0 });
  // last two: day8 [3,false], day9 [2,true]: predicted 5, scored 2
  expect(calibration(records, 2)).toEqual({ predicted: 5, scored: 2, n: 2 });
});

test("size: one case and at most one re-ask, never more than five options", () => {
  expect(pool).toHaveLength(108); // 105 items with a misconception + 3 rule sources (observed)
  for (const src of pool) {
    const c = buildCase(src, START, pack);
    const r = buildReask(src, START, pack);
    expect(c).not.toBeNull();
    expect(r).not.toBeNull();
    for (const x of [c, r]) {
      if (!x) continue;
      expect(x.options.length).toBeLessThanOrEqual(5);
      expect(x.options.length).toBeGreaterThanOrEqual(2);
    }
  }
});
