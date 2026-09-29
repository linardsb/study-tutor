import { expect, test } from "bun:test";
import { replay, type State } from "../events/replay";
import type { NewEvent } from "../events/types";
import { flame, guardrail, type XP, xpFor } from "./xp";

const SCORING: [NewEvent, number][] = [
  [
    {
      v: 1,
      type: "attempt",
      item: "i",
      topic: "t",
      correct: false,
      sure: true,
      answer: "4",
    },
    10,
  ],
  [{ v: 1, type: "retest", topic: "t", score: 3, of: 3, passed: true }, 20],
  [{ v: 1, type: "teachback", topic: "t", marks: 1, of: 2 }, 15],
];

test.each(SCORING)(
  "xpFor a scoring event gives its effort amount",
  (e, amount) => {
    expect(xpFor(e)).toEqual({
      v: 1,
      type: "xp",
      amount,
      reason: e.type as keyof typeof XP,
    });
  },
);

test("xpFor any other event is null", () => {
  const others: NewEvent[] = [
    { v: 1, type: "session", phase: "start", mode: "lesson" },
    {
      v: 1,
      type: "case",
      day: "2026-10-05",
      kind: "rule",
      topic: "t",
      pick: "x",
      bet: 1,
      correct: true,
      reask: false,
    },
    { v: 1, type: "intake", door: "sheet", topics: [{ topic: "t", rag: "R" }] },
    { v: 1, type: "xp", amount: 10, reason: "attempt" },
  ];
  for (const e of others) expect(xpFor(e)).toBeNull();
});

test("flame counts the days of the day's ISO week and echoes the target", () => {
  const s = replay([
    `{"v":1,"t":"2026-10-05T16:00:00Z","type":"teachback","topic":"t","marks":1,"of":2}`,
    `{"v":1,"t":"2026-10-07T16:00:00Z","type":"teachback","topic":"t","marks":1,"of":2}`,
  ]);
  expect(flame(s, "2026-10-09", 4)).toEqual({
    week: "2026-W41",
    days: 2,
    target: 4,
  });
  expect(flame(s, "2026-10-12", 3)).toEqual({
    week: "2026-W42",
    days: 0,
    target: 3,
  });
});

const withWeeks = (
  weeks: [string, number, number, number][], // week, xp, score, of
): State => {
  const s = replay([]);
  for (const [week, xp, score, of] of weeks) {
    s.xp.byWeek[week] = xp;
    s.retests[week] = { score, of, taken: 0, passed: 0 }; // guardrail reads score and of only
  }
  return s;
};

test("guardrail: a better rate with less XP is not falling", () => {
  const g = guardrail(
    withWeeks([
      ["2026-W41", 70, 4, 6],
      ["2026-W42", 50, 5, 6],
    ]),
  );
  expect(g.falling).toBe(false);
  expect(g.weeks.map((w) => w.week)).toEqual(["2026-W41", "2026-W42"]);
});

test("guardrail: a lower rate while XP rose is falling", () => {
  // 2·6 = 12 < 5·3 = 15, and 60 > 50.
  const g = guardrail(
    withWeeks([
      ["2026-W42", 60, 2, 3],
      ["2026-W41", 50, 5, 6],
    ]),
  );
  expect(g.weeks).toEqual([
    { week: "2026-W41", xp: 50, score: 5, of: 6 },
    { week: "2026-W42", xp: 60, score: 2, of: 3 },
  ]);
  expect(g.falling).toBe(true);
});

test("guardrail: fewer than two weeks is never falling", () => {
  expect(guardrail(withWeeks([])).falling).toBe(false);
  expect(guardrail(withWeeks([["2026-W41", 70, 0, 3]])).falling).toBe(false);
});
