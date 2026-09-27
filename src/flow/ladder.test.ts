import { expect, test } from "bun:test";
import {
  afterLesson,
  afterRed,
  afterRetest,
  type OnLadder,
  type Rung,
} from "./ladder";

const RETEST: [Rung, boolean, OnLadder][] = [
  [0, true, 2],
  [1, true, 2],
  [2, true, 3],
  [3, true, 4],
  [4, true, 4],
  [0, false, 1],
  [1, false, 1],
  [2, false, 1],
  [3, false, 1],
  [4, false, 1],
];

test.each(RETEST)("afterRetest(%p, %p) is %p", (rung, passed, next) => {
  expect(afterRetest(rung, passed)).toBe(next);
});

test("afterLesson starts the ladder and never lowers a rung", () => {
  expect(afterLesson(0)).toBe(1);
  expect(afterLesson(3)).toBe(3);
});

test("afterRed sends 1 pass or better back to learning, leaves rung 0", () => {
  expect(afterRed(1)).toBe(1);
  expect(afterRed(2)).toBe(1);
  expect(afterRed(4)).toBe(1);
  expect(afterRed(0)).toBe(0);
});
