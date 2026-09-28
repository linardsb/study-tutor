import { expect, test } from "bun:test";
import { attemptLine, sentinelItem } from "./__fixtures__/provider";
import { hasAttempt, jobItem, type PreAttempt } from "./view";

const T = "2026-10-05T16:00:00Z";
const line = (e: object) => JSON.stringify({ ...e, t: T });

test("hasAttempt: false on an empty log, true for the exact id, false for another id on the topic", () => {
  const item = sentinelItem();
  expect(hasAttempt([], item)).toBe(false);
  const log = [line(attemptLine(item))];
  expect(hasAttempt(log, item)).toBe(true);
  expect(hasAttempt(log, { id: "1MA1/R9/of-an-amount#2" })).toBe(false);
});

test("hasAttempt: a generated item matches on id and seed; no seed is never attempted", () => {
  const gen = { id: "1MA1/R9#gen", topic: "1MA1/R9" };
  const log = [line(attemptLine(gen, 11))];
  expect(hasAttempt(log, { id: gen.id, seed: 11 })).toBe(true);
  expect(hasAttempt(log, { id: gen.id, seed: 12 })).toBe(false);
  expect(hasAttempt(log, { id: gen.id })).toBe(false);
});

test("jobItem before the attempt: the view carries no answer-side field", () => {
  const j = jobItem([], sentinelItem());
  expect(j.attempted).toBe(false);
  if (j.attempted) return;
  const keys = Object.keys(j.view);
  for (const k of ["answers", "working", "mark_scheme", "misconceptions"])
    expect(keys).not.toContain(k);
});

test("jobItem after the attempt: the full item", () => {
  const item = sentinelItem();
  const j = jobItem([line(attemptLine(item))], item);
  expect(j.attempted).toBe(true);
  if (!j.attempted) return;
  expect(j.item.answers).toEqual(["SENTINEL-ANSWER-731"]);
});

test("a raw Item is not a PreAttempt (tsc fails if the directive below goes unused)", () => {
  // @ts-expect-error a raw Item is not a PreAttempt
  const raw: PreAttempt = sentinelItem();
  expect(raw.stem).toBe("Find 20% of 45.");
});
