import { expect, setSystemTime, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
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
  expect(s.shape).toBe(1);
});

test("guard: derived state carries no correct answer or mark scheme", () => {
  const json = JSON.stringify(replay(SIX_WEEKS));
  for (const key of ['"answers"', '"markScheme"', '"mark_scheme"']) {
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
  ];
  const lines = [...SIX_WEEKS.slice(0, 10), ...bad, ...SIX_WEEKS.slice(10)];
  const s = replay(lines);
  expect(s.topics).toEqual(TOPICS);
  expect(s.xp).toEqual(XP);
  expect(s.skipped).toBe(4);
  expect(s.lines).toBe(37);
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
