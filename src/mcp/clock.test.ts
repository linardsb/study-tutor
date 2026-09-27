import { expect, test } from "bun:test";
import { addDays, isoWeek, localDay, utcNow } from "./clock";

test("isoWeek: Monday to Sunday, week 53 and the year boundary", () => {
  expect(isoWeek("2026-10-05")).toBe("2026-W41");
  expect(isoWeek("2026-10-11")).toBe("2026-W41"); // Sunday
  expect(isoWeek("2026-10-12")).toBe("2026-W42");
  expect(isoWeek("2021-01-03")).toBe("2020-W53");
  expect(isoWeek("2027-01-01")).toBe("2026-W53");
  expect(isoWeek("2026-12-31")).toBe("2026-W53");
});

test("addDays crosses month ends and the October clock change", () => {
  expect(addDays("2026-10-25", 30)).toBe("2026-11-24");
  expect(addDays("2026-10-05", 41)).toBe("2026-11-15");
});

test("utcNow is UTC to the second", () => {
  expect(utcNow()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
});

test("localDay is the London day on both clock-change nights", () => {
  expect(localDay("2026-10-11T23:30:00Z")).toBe("2026-10-12"); // BST
  expect(localDay("2026-10-25T00:30:00Z")).toBe("2026-10-25"); // clocks go back that night
  expect(localDay("2026-03-29T23:30:00Z")).toBe("2026-03-30"); // first BST night
  expect(localDay("2026-03-28T23:30:00Z")).toBe("2026-03-28"); // GMT
  expect(localDay("2026-12-31T23:30:00Z")).toBe("2026-12-31");
  expect(localDay("2026-06-30T23:00:00Z")).toBe("2026-07-01");
});
