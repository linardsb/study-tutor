import { expect, setSystemTime, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { isoWeek, localDay } from "../mcp/clock";
import { replay, type State } from "./replay";
import { EVENT_KEYS } from "./types";

const FIXTURES = path.join(import.meta.dir, "__fixtures__");
const SIX_WEEKS = fs
  .readFileSync(path.join(FIXTURES, "six-weeks.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean);

// Derived by hand from the ladder rule and the fixture (plan Task 8); tests 1 and 5 share them.
const TOPICS: State["topics"] = {
  "1MA1/R9": { rung: 3, nextDue: "2026-12-15", rag: "R" },
  "1MA1/N12": { rung: 3, nextDue: "2026-11-24", rag: "A" },
  "1MA1/A5": { rung: 0, nextDue: null, rag: "R" },
};
const XP: State["xp"] = {
  total: 205,
  byWeek: {
    "2026-W41": 70,
    "2026-W42": 50,
    "2026-W43": 35,
    "2026-W45": 20,
    "2026-W46": 30,
  },
};

test("six-week history: rungs, next-due, XP, flame, pool, calibration, tokens", () => {
  const s = replay(SIX_WEEKS);
  expect(s.topics).toEqual(TOPICS);
  expect(s.xp).toEqual(XP);
  expect(s.flame).toEqual({
    "2026-W41": ["2026-10-05", "2026-10-08", "2026-10-09"],
    "2026-W42": ["2026-10-12", "2026-10-18"],
    "2026-W43": ["2026-10-20", "2026-10-25"],
    "2026-W45": ["2026-11-05"],
    "2026-W46": ["2026-11-15"],
  });
  expect(s.confidentWrong).toEqual({
    "maths/A5/1": {
      topic: "1MA1/A5",
      t: "2026-11-15T12:10:00Z",
      answer: "x = 3",
    },
  });
  expect(s.calibration).toEqual({
    "2026-W41": { sureRight: 1, sureWrong: 1, unsureRight: 1, unsureWrong: 0 },
    "2026-W42": { sureRight: 0, sureWrong: 0, unsureRight: 0, unsureWrong: 1 },
    "2026-W46": { sureRight: 0, sureWrong: 1, unsureRight: 0, unsureWrong: 0 },
  });
  expect(s.tokens).toEqual({ "2026-10": 1500, "2026-11": 600 });
  expect(s.lines).toBe(33);
  expect(s.skipped).toBe(0);
  expect(s.shape).toBe(5);
  expect(s.coach).toEqual({ shown: 0, caught: 0, rank: 0 });
  expect(s.retests).toEqual({
    "2026-W41": { score: 4, of: 6 },
    "2026-W42": { score: 5, of: 6 },
    "2026-W43": { score: 3, of: 3 },
    "2026-W45": { score: 2, of: 3 },
    "2026-W46": { score: 3, of: 3 },
  });
  expect(s.session).toBeNull();
});

test("guard: derived state carries no correct answer or mark scheme", () => {
  const json = JSON.stringify(replay(SIX_WEEKS));
  for (const key of [
    '"answers"',
    '"markScheme"',
    '"mark_scheme"',
    '"working"',
    '"message"',
  ]) {
    expect(json).not.toContain(key);
  }
});

test("pure: replay reads no clock", () => {
  const real = replay(SIX_WEEKS);
  setSystemTime(new Date("2031-01-01T00:00:00Z"));
  try {
    expect(replay(SIX_WEEKS)).toEqual(real);
  } finally {
    setSystemTime();
  }
});

test("file order wins over t", () => {
  const s = replay([
    `{"v":1,"t":"2026-10-05T16:20:00Z","type":"session","phase":"end","mode":"lesson","topic":"1MA1/R9"}`,
    `{"v":1,"t":"2026-10-08T16:00:00Z","type":"retest","topic":"1MA1/R9","score":3,"of":3,"passed":true}`,
    `{"v":1,"t":"2026-10-08T15:00:00Z","type":"retest","topic":"1MA1/R9","score":0,"of":3,"passed":false}`,
  ]);
  expect(s.topics["1MA1/R9"]?.rung).toBe(1); // sorted by t it would be 2
});

test("bad lines are skipped and counted, never fatal", () => {
  const bad = [
    "not json",
    `{"v":2,"t":"2026-10-05T16:21:00Z","type":"attempt","item":"x","topic":"1MA1/R9","correct":true,"sure":true,"answer":"1"}`,
    `{"v":1,"t":"2026-10-05T16:21:00Z","type":"login"}`,
    `{"v":1,"t":"2026-10-05T16:21:00Z","type":"attempt","item":"x","correct":true,"sure":true,"answer":"1"}`,
    // day is an invalid Date (month 13): isDay threw and every state route was a 500 (PR #31 F2)
    `{"v":1,"t":"2026-10-05T16:21:00Z","type":"case","day":"2026-13-01","kind":"rule","topic":"1MA1/A12","pick":"x","bet":1,"correct":true,"reask":false}`,
  ];
  const lines = [...SIX_WEEKS.slice(0, 10), ...bad, ...SIX_WEEKS.slice(10)];
  const s = replay(lines);
  expect(s.topics).toEqual(TOPICS);
  expect(s.xp).toEqual(XP);
  expect(s.skipped).toBe(5);
  expect(s.lines).toBe(38);
});

test.each([...EVENT_KEYS])(
  "fixture for %s replays with nothing skipped",
  (key) => {
    const [type, v] = key.split("@");
    const lines = fs
      .readFileSync(path.join(FIXTURES, `${type}.v${v}.jsonl`), "utf8")
      .split("\n")
      .filter(Boolean);
    expect(replay(lines).skipped).toBe(0);
  },
);

const CASE_LINES = fs
  .readFileSync(path.join(FIXTURES, "case.v1.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean);

test("case: one record a day, the re-ask joins it, the seed is set by bet 3 and wrong and cleared by the next first answer, and the day counts in the flame", () => {
  const two = replay(CASE_LINES);
  expect(two.cases).toEqual({
    "2026-10-06": {
      kind: "mistake",
      topic: "1MA1/R9/of-an-amount",
      item: "1MA1/R9/of-an-amount#1",
      bets: [
        [3, false],
        [2, true],
      ],
    },
  });
  expect(two.caseSeed).toBe("1MA1/R9/of-an-amount");
  expect(two.flame["2026-W41"]).toContain("2026-10-06");
  expect(two.topics["1MA1/R9/of-an-amount"]?.rung).toBe(0);

  // The next day's first answer clears the seed; t is after London midnight but day says 07 (the case's day).
  const next = `{"v":1,"t":"2026-10-07T23:30:00Z","type":"case","day":"2026-10-07","kind":"rule","topic":"1MA1/A12","pick":"x","bet":1,"correct":true,"reask":false}`;
  const three = replay([...CASE_LINES, next]);
  expect(three.caseSeed).toBeNull();
  expect(Object.keys(three.cases)).toEqual(["2026-10-06", "2026-10-07"]);
  expect(three.cases["2026-10-07"]).toEqual({
    kind: "rule",
    topic: "1MA1/A12",
    item: null,
    bets: [[1, true]],
  });
  expect(three.flame["2026-W41"]).toContain("2026-10-08"); // 23:30Z on the 7th is the 8th in BST

  // A repeat first answer for a day already recorded (two tabs) changes nothing.
  const repeat = `{"v":1,"t":"2026-10-07T23:31:00Z","type":"case","day":"2026-10-07","kind":"mistake","topic":"1MA1/G16","item":"1MA1/G16#1","pick":"y","bet":3,"correct":false,"reask":false}`;
  const four = replay([...CASE_LINES, next, repeat]);
  expect(four.cases["2026-10-07"]).toEqual(three.cases["2026-10-07"]);
  expect(four.caseSeed).toBeNull();

  // A re-ask with no first answer on record (hand edit) is kept as the day's only pair.
  const orphan = replay([CASE_LINES[1] as string]);
  expect(orphan.cases["2026-10-06"]?.bets).toEqual([[2, true]]);
  expect(orphan.cases["2026-10-06"]?.item).toBeNull();
  expect(orphan.caseSeed).toBeNull();
});

const COACH_LINES = fs
  .readFileSync(path.join(FIXTURES, "coach.v1.jsonl"), "utf8")
  .split("\n")
  .filter(Boolean);

test("coach: shown and caught count, rank follows rankFor, an unreadable line changes nothing", () => {
  const [caught, missed] = COACH_LINES as [string, string];
  const s = replay([
    ...Array.from({ length: 7 }, () => caught),
    missed,
    missed,
    caught.replace('"caught":true', '"caught":"yes"'),
  ]);
  // derived: floor(7 / 3) = 2 with PER_RANK = 3
  expect(s.coach).toEqual({ shown: 9, caught: 7, rank: 2 });
  expect(s.skipped).toBe(1);
  expect(s.topics["1MA1/R9/of-an-amount"]?.rung).toBe(0);
});

test("case: a second re-ask the same day is ignored", () => {
  const reask = CASE_LINES[1] as string;
  const again = reask.replace('"bet":2', '"bet":1');
  const s = replay([...CASE_LINES, again]);
  expect(s.cases["2026-10-06"]?.bets).toEqual([
    [3, false],
    [2, true],
  ]);
  // No first answer on record: the orphan re-ask is the pair, and a second re-ask joins it once.
  const orphan = replay([reask, again, again]);
  expect(orphan.cases["2026-10-06"]?.bets).toEqual([
    [2, true],
    [1, true],
  ]);
});

test("a topic named constructor is its own topic", () => {
  const s = replay([
    `{"v":1,"t":"2026-10-08T16:00:00Z","type":"retest","topic":"constructor","score":1,"of":1,"passed":true}`,
  ]);
  const id: string = "constructor";
  expect(s.topics[id]).toEqual({
    rung: 2,
    nextDue: "2026-10-18",
    rag: null,
  });
});

test("a topic or item named __proto__ pollutes nothing and is kept", () => {
  try {
    const s = replay([
      `{"v":1,"t":"2026-10-08T16:00:00Z","type":"intake","door":"sheet","topics":[{"topic":"__proto__","rag":"R"}]}`,
      `{"v":1,"t":"2026-10-08T16:00:00Z","type":"attempt","item":"__proto__","topic":"1MA1/R9","correct":false,"sure":true,"answer":"4"}`,
    ]);
    expect(({} as { rag?: unknown }).rag).toBeUndefined();
    expect(Object.hasOwn(s.topics, "__proto__")).toBe(true);
    expect(Object.hasOwn(s.confidentWrong, "__proto__")).toBe(true);
    expect(JSON.stringify(s)).toContain(
      '"__proto__":{"rung":0,"nextDue":null,"rag":"R"}',
    );
  } finally {
    delete (Object.prototype as { rag?: unknown }).rag;
  }
});

test("the hash covers exactly the lines replayed", () => {
  const a = replay(SIX_WEEKS);
  expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
  expect(replay(SIX_WEEKS).hash).toBe(a.hash);
  expect(replay(SIX_WEEKS.slice(0, 32)).hash).not.toBe(a.hash);
  const edited = [...SIX_WEEKS];
  edited[0] = `${edited[0]} `;
  expect(replay(edited).hash).not.toBe(a.hash);
});

test("photo: marks and clean sheets are summed per ISO week; unmarked photos count as taken only", () => {
  const p = (t: string, extra: string) =>
    `{"v":1,"t":"${t}","type":"photo","item":"1MA1/R9#1","topic":"1MA1/R9","file":"intake/x.jpg"${extra}}`;
  const a = "2026-10-13T17:00:00Z";
  const b = "2026-10-20T17:00:00Z";
  const s = replay([
    p(a, `,"marks":3,"of":5,"clean":false`),
    p("2026-10-14T17:00:00Z", `,"marks":5,"of":5,"clean":true`),
    p("2026-10-15T17:00:00Z", ""),
    p(b, `,"marks":1,"of":5,"clean":false`),
  ]);
  const wa = isoWeek(localDay(a));
  const wb = isoWeek(localDay(b));
  expect(wa).not.toBe(wb);
  expect(s.photos[wa]).toEqual({
    taken: 3,
    marked: 2,
    marks: 8,
    of: 10,
    clean: 1,
  });
  expect(s.photos[wb]).toEqual({
    taken: 1,
    marked: 1,
    marks: 1,
    of: 5,
    clean: 0,
  });
  expect(isoWeek(localDay("2026-10-14T17:00:00Z"))).toBe(wa);
  expect(isoWeek(localDay("2026-10-15T17:00:00Z"))).toBe(wa);
});
