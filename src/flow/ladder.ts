/** Rung 0 to 4. v1 stage names, same order. */
export const RUNGS = [
  "not started",
  "learning",
  "1 pass",
  "2 passes",
  "secure",
] as const;
export type Rung = 0 | 1 | 2 | 3 | 4;
export type OnLadder = Exclude<Rung, 0>;
/** Days to the next cold re-test once a topic stands on a rung. Secure repeats every 60. */
export const NEXT_DAYS: Record<OnLadder, number> = {
  1: 3,
  2: 10,
  3: 30,
  4: 60,
};

const PASS: Record<Rung, OnLadder> = { 0: 2, 1: 2, 2: 3, 3: 4, 4: 4 };
const LESSON: Record<Rung, OnLadder> = { 0: 1, 1: 1, 2: 2, 3: 3, 4: 4 };
const RED: Record<Rung, Rung> = { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1 };

/** A finished lesson starts the ladder and never lowers a rung. */
export function afterLesson(rung: Rung): OnLadder {
  return LESSON[rung];
}

/** A passed re-test climbs one rung (a cold pass at rung 0 counts as learning passed); a fail goes back to learning. */
export function afterRetest(rung: Rung, passed: boolean): OnLadder {
  return passed ? PASS[rung] : 1;
}

/** Red on a new school sheet sends 1 pass or better back to learning. */
export function afterRed(rung: Rung): Rung {
  return RED[rung];
}

/** Questions in a topic's cold re-test (v1: three fresh questions). */
export const RETEST_SLOTS = 3;

/** A cold re-test passes at 2 of 3 or better, the v1 rule; integer arithmetic, no float. */
export function passes(score: number, of: number): boolean {
  return of > 0 && score * 3 >= of * 2;
}
