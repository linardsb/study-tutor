import { expect, test } from "bun:test";
import path from "node:path";
import { parseEvent } from "../events/types";

type Cal = { predicted: number; scored: number; n: number };
type Detective = {
  calibrationLine: (cal: Cal) => string;
  bump: (cal: Cal, bet: number, correct: boolean) => Cal;
  eventFor: (
    day: string,
    c: { kind: "mistake" | "rule"; topic: string; item: string | null },
    pick: string,
    bet: number,
    correct: boolean,
    reask: boolean,
  ) => Record<string, unknown>;
  reaskOwed: (record: { bets: [number, boolean][] }) => boolean;
  afterSave: (
    saved: boolean,
    isReask: boolean,
    bet: number,
    correct: boolean,
    hasReask: boolean,
  ) => "unsaved" | "reask" | "done";
};

// The browser file sets a global, the way quiz.js does; nothing in it touches document at load.
await import(path.resolve(import.meta.dir, "../../app/case.js"));
const detective = (globalThis as { detective?: Detective }).detective;
if (!detective) throw new Error("app/case.js did not set detective");

test("calibrationLine: nothing before the first case, then the first, then the last n", () => {
  expect(detective.calibrationLine({ predicted: 0, scored: 0, n: 0 })).toBe("");
  expect(detective.calibrationLine({ predicted: 3, scored: 0, n: 1 })).toBe(
    "First case. You predicted 3, you scored 0.",
  );
  expect(detective.calibrationLine({ predicted: 14, scored: 8, n: 7 })).toBe(
    "Over your last 7 cases you predicted 14, you scored 8.",
  );
  expect(detective.bump({ predicted: 3, scored: 0, n: 1 }, 2, true)).toEqual({
    predicted: 5,
    scored: 2,
    n: 2,
  });
});

test("reaskOwed: only a lone confident miss on record brings the re-ask back after a reload (PR #31 F9)", () => {
  expect(detective.reaskOwed({ bets: [[3, false]] })).toBe(true);
  expect(detective.reaskOwed({ bets: [[3, true]] })).toBe(false);
  expect(detective.reaskOwed({ bets: [[2, false]] })).toBe(false);
  expect(
    detective.reaskOwed({
      bets: [
        [3, false],
        [1, true],
      ],
    }),
  ).toBe(false);
  expect(detective.reaskOwed({ bets: [] })).toBe(false);
});

test("eventFor: a mistake case carries its item, a rule case omits it, and both bodies are valid case@1 lines", () => {
  const mistake = detective.eventFor(
    "2026-10-06",
    {
      kind: "mistake",
      topic: "1MA1/R9/of-an-amount",
      item: "1MA1/R9/of-an-amount#1",
    },
    "That is 10% of 45. You need two lots of it.",
    3,
    false,
    false,
  );
  expect(mistake.item).toBe("1MA1/R9/of-an-amount#1");
  const rule = detective.eventFor(
    "2026-10-06",
    { kind: "rule", topic: "1MA1/A12", item: null },
    "The highest power of x decides the shape.",
    1,
    true,
    true,
  );
  expect(rule).not.toHaveProperty("item");
  expect(rule.reask).toBe(true);
  for (const body of [mistake, rule]) {
    const line = JSON.stringify({ ...body, t: "2026-10-06T07:12:00Z" });
    const e = parseEvent(line);
    expect(e).not.toBeNull();
    expect(e?.type).toBe("case");
  }
});

test('afterSave: a failed save gets no "Back tomorrow." and no re-ask, since nothing is on record (PR #31 round 2 F1)', () => {
  expect(detective.afterSave(false, false, 3, false, true)).toBe("unsaved");
  expect(detective.afterSave(false, false, 1, true, true)).toBe("unsaved");
  expect(detective.afterSave(true, false, 3, false, true)).toBe("reask");
  expect(detective.afterSave(true, false, 3, false, false)).toBe("done");
  expect(detective.afterSave(true, true, 3, false, true)).toBe("done");
  expect(detective.afterSave(true, false, 2, false, true)).toBe("done");
  expect(detective.afterSave(true, false, 3, true, true)).toBe("done");
});
