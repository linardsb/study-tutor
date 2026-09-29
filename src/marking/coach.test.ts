import { expect, test } from "bun:test";
import path from "node:path";
import { guardReply } from "../jobs/guard";

type Rank = { level: number; name: string; toNext: number | null };
type Coach = {
  rankLine: (rank: Rank) => string;
  resultLines: (body: {
    caught: boolean;
    note: string;
    named: string | null;
  }) => string[];
};

// The browser file sets a global, the way case.js does; nothing in it touches document at load.
await import(path.resolve(import.meta.dir, "../../app/coach.js"));
const coach = (globalThis as { coach?: Coach }).coach;
if (!coach) throw new Error("app/coach.js did not set coach");

const NOTE = "That is 10% of the amount, not 20%.";

test("rankLine: bottom, middle and top rank", () => {
  expect(coach.rankLine({ level: 0, name: "Noob", toNext: 3 })).toBe(
    "Dan is Noob, rank 1 of 5. 3 more catches to the next rank.",
  );
  expect(coach.rankLine({ level: 1, name: "Learner", toNext: 1 })).toBe(
    "Dan is Learner, rank 2 of 5. 1 more catch to the next rank.",
  );
  expect(coach.rankLine({ level: 4, name: "Sorted", toNext: null })).toBe(
    "Dan is Sorted, rank 5 of 5.",
  );
});

test("resultLines: caught, not caught with a named wrong answer, not caught unnamed", () => {
  expect(coach.resultLines({ caught: true, note: NOTE, named: null })).toEqual([
    "You caught it. Dan says thanks.",
    `Dan's mistake: ${NOTE}`,
    "Check it against the working:",
  ]);
  expect(
    coach.resultLines({ caught: false, note: NOTE, named: "You halved it." }),
  ).toEqual([
    "Not this time.",
    `Dan's mistake: ${NOTE}`,
    "Your answer: You halved it.",
    "Check it against the working:",
  ]);
  expect(coach.resultLines({ caught: false, note: NOTE, named: null })).toEqual(
    [
      "Not this time.",
      `Dan's mistake: ${NOTE}`,
      "Your answer was not right either. Read the working.",
      "Check it against the working:",
    ],
  );
});

test("page text passes the reply guard: no exclamation mark, emoji or grade talk", () => {
  const lines = [
    coach.rankLine({ level: 0, name: "Noob", toNext: 3 }),
    coach.rankLine({ level: 4, name: "Sorted", toNext: null }),
    ...coach.resultLines({ caught: true, note: NOTE, named: null }),
    ...coach.resultLines({ caught: false, note: NOTE, named: "x" }),
    ...coach.resultLines({ caught: false, note: NOTE, named: null }),
  ];
  // sources = texts, so only the regex rules apply
  expect(guardReply(lines, lines)).toBeNull();
});
