import { expect, setSystemTime, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { buildDigest, type Digest, digestMarkdown, mondayOf } from "./digest";
import { replay } from "./events/replay";
import { guardReply } from "./jobs/guard";

const SIX_WEEKS = fs
  .readFileSync(
    path.join(import.meta.dir, "events", "__fixtures__", "six-weeks.jsonl"),
    "utf8",
  )
  .split("\n")
  .filter(Boolean);
const SUNDAYS = [
  "2026-10-11",
  "2026-10-18",
  "2026-10-25",
  "2026-11-01",
  "2026-11-08",
  "2026-11-15",
];
const CAP = 1_000_000;

const photo = (t: string, extra: string) =>
  `{"v":1,"t":"${t}","type":"photo","item":"1MA1/R9#1","topic":"1MA1/R9","file":"intake/x.jpg"${extra}}`;
const job = (t: string, name: string, reason: string) =>
  `{"v":1,"t":"${t}","type":"job","job":"${name}","reason":"${reason}"}`;

// Every digest a test builds, for the no-grade check (AC 2).
const built: Digest[] = [];
const digest = (...args: Parameters<typeof buildDigest>) => {
  const d = buildDigest(...args);
  built.push(d);
  return d;
};

test("mondayOf: the Monday of the ISO week, from any day in it", () => {
  expect(mondayOf("2026-11-15")).toBe("2026-11-09"); // Sunday
  expect(mondayOf("2026-11-09")).toBe("2026-11-09"); // Monday
  expect(mondayOf("2026-11-11")).toBe("2026-11-09");
  expect(mondayOf("2027-01-01")).toBe("2026-12-28"); // across a year end
});

test("six-week history matches the hand-derived digest file (AC 1)", () => {
  const s = replay(SIX_WEEKS);
  const joined = SUNDAYS.map((day) =>
    digestMarkdown(digest(s, day, 3, CAP)),
  ).join("\n");
  expect(joined).toBe(
    fs.readFileSync(
      path.join(import.meta.dir, "__fixtures__", "digest-six-weeks.md"),
      "utf8",
    ),
  );
});

test("examiner mode and failed calls: photos, marks left, failures summed by reason", () => {
  const s = replay([
    photo("2026-11-05T17:00:00Z", `,"marks":2,"of":5,"clean":false`), // W45
    photo("2026-11-10T17:00:00Z", `,"marks":3,"of":5,"clean":false`),
    photo("2026-11-11T17:00:00Z", `,"marks":5,"of":5,"clean":true`),
    photo("2026-11-12T17:00:00Z", ""),
    job("2026-11-10T18:00:00Z", "hint", "timeout"),
    job("2026-11-11T18:00:00Z", "hint", "timeout"),
    job("2026-11-12T18:00:00Z", "examiner_mark", "cap"),
  ]);
  const w46 = digest(s, "2026-11-15", 3, CAP);
  // of 5 + 5 = 10, marks 3 + 5 = 8, left 10 - 8 = 2; the unmarked photo counts as taken only.
  expect(w46.lines).toContain(
    "Photos: 3 taken, 2 marked. Marks left on the table: 2 of 10.",
  );
  expect(w46.lines.at(-1)).toBe(
    "Model calls that did not work: 3 (monthly cap reached 1, timed out 2). The tutor carried on without the model.",
  );
  const w47 = digest(s, "2026-11-22", 3, CAP);
  expect(w47.lines).toContain("Photos: none this week.");
  expect(w47.lines.at(-1)).toBe("Model calls that did not work: none.");
});

test("photos taken but none marked yet", () => {
  const s = replay([photo("2026-11-05T17:00:00Z", "")]);
  expect(digest(s, "2026-11-08", 3, CAP).lines).toContain(
    "Photos: 1 taken, none marked yet.",
  );
});

test("no photo ever: no photos line", () => {
  const s = replay(SIX_WEEKS);
  expect(
    digest(s, "2026-11-15", 3, CAP).lines.some((l) => l.startsWith("Photos")),
  ).toBe(false);
});

test("no model: tokens without a cap figure", () => {
  const d = digest(replay(SIX_WEEKS), "2026-11-15", 3, null);
  expect(d.lines).toContain(
    "Model use in November 2026: 600 tokens. No model is set up.",
  );
});

test("several reasons share a label and are summed", () => {
  const s = replay([
    job("2026-11-10T18:00:00Z", "hint", "not-json"),
    job("2026-11-10T18:05:00Z", "hint", "shape"),
  ]);
  expect(digest(s, "2026-11-15", 3, CAP).lines.at(-1)).toBe(
    "Model calls that did not work: 2 (reply could not be read 2). The tutor carried on without the model.",
  );
});

test("pure: buildDigest reads no clock", () => {
  const s = replay(SIX_WEEKS);
  setSystemTime(new Date("2026-01-01T00:00:00Z"));
  const a = buildDigest(s, "2026-11-15", 3, CAP);
  setSystemTime(new Date("2031-06-01T00:00:00Z"));
  try {
    expect(buildDigest(s, "2026-11-15", 3, CAP)).toEqual(a);
  } finally {
    setSystemTime();
  }
});

// Last: it reads every digest the tests above built.
test("no grade prediction, exclamation or emoji in any digest (AC 2)", () => {
  expect(built.length).toBeGreaterThan(10);
  for (const d of built) {
    const texts = [d.title, ...d.lines];
    // The digest's own text as sources: every number is allowed, so only the text checks can fire.
    expect(guardReply(texts, texts)).toBeNull();
  }
  const planted = [...(built[0] as Digest).lines];
  planted[0] = "On track for a grade 4.";
  expect(guardReply(planted, planted)).toBe("grade");
});
