import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { loadCasePack } from "../api/case";
import { lcg } from "../content/generators";
import { replay, type State } from "../events/replay";
import type { NewEvent } from "../events/types";
import { isoWeek, localDay } from "../mcp/clock";
import { passes } from "./ladder";
import { guardrail, XP, xpFor } from "./xp";

const pack = await loadCasePack("maths");
const TOPICS = pack.topics.slice(0, 5).map((t) => t.id);
const H = 200; // histories
const L = 60; // events per history, before their xp lines
const START = Date.parse("2026-10-05T16:00:00Z");

type Line = Record<string, unknown> & { type: string; t: string };

const stamp = (ms: number) =>
  new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");

/** One event body from the menu: session start/end, attempt, retest, teachback, intake, case. */
function body(rng: () => number): NewEvent {
  const pick = <T>(xs: readonly T[]): T =>
    xs[Math.floor(rng() * xs.length)] as T;
  const topic = pick(TOPICS);
  const bool = () => rng() < 0.5;
  switch (Math.floor(rng() * 7)) {
    case 0:
    case 1: {
      const mode = pick(["lesson", "practice", "boss"] as const);
      const phase = pick(["start", "end"] as const);
      return mode === "boss"
        ? { v: 1, type: "session", phase, mode }
        : { v: 1, type: "session", phase, mode, topic };
    }
    case 2:
      return {
        v: 1,
        type: "attempt",
        item: `${topic}#1`,
        topic,
        correct: bool(),
        sure: bool(),
        answer: "4",
      };
    case 3: {
      const score = Math.floor(rng() * 4);
      return {
        v: 1,
        type: "retest",
        topic,
        score,
        of: 3,
        passed: passes(score, 3),
      };
    }
    case 4:
      return { v: 1, type: "teachback", topic, marks: 1, of: 2 };
    case 5:
      return {
        v: 1,
        type: "intake",
        door: "sheet",
        topics: TOPICS.filter(bool).map((id) => ({
          topic: id,
          rag: pick(["R", "A", "G"] as const),
        })),
      };
    default:
      return {
        v: 1,
        type: "case",
        day: "2026-10-05",
        kind: "rule",
        topic,
        pick: "x",
        bet: pick([1, 2, 3] as const),
        correct: bool(),
        reask: false,
      };
  }
}

/** A seeded history, written the way postEvent writes it: each scoring line followed a second later by its xp line. */
function history(seed: number): string[] {
  const rng = lcg(seed);
  const lines: string[] = [];
  let ms = START;
  for (let i = 0; i < L; i += 1) {
    ms += (1 + Math.floor(rng() * 72)) * 3600_000;
    const b = body(rng);
    if (b.type === "intake" && b.topics.length === 0) continue; // an empty intake does not parse
    lines.push(JSON.stringify({ ...b, t: stamp(ms) }));
    const xp = xpFor(b);
    if (xp) lines.push(JSON.stringify({ ...xp, t: stamp(ms + 1000) }));
  }
  return lines;
}

const SCORING = new Set(["attempt", "retest", "teachback"]);

function rungRoseLegally(e: Line, id: string, a: State, b: State): boolean {
  const before = a.topics[id]?.rung ?? 0;
  const after = b.topics[id]?.rung ?? 0;
  // A passed re-test climbs. Any re-test at rung 0 lands on learning (afterRetest(0, false) is 1, T2),
  // as a first lesson does; the boss never sees rung 0, since only a started topic is due.
  if (e.type === "retest")
    return (
      e.topic === id && (e.passed === true || (before === 0 && after === 1))
    );
  return (
    e.type === "session" &&
    e.phase === "end" &&
    e.mode === "lesson" &&
    e.topic === id &&
    before === 0 &&
    after === 1
  );
}

function rungFellLegally(e: Line, id: string): boolean {
  if (e.type === "retest") return e.topic === id && e.passed === false;
  if (e.type !== "intake") return false;
  const rows = e.topics as { topic: string; rag: string }[];
  return rows.some((r) => r.topic === id && r.rag === "R");
}

type Weeks = {
  retests: Record<string, { score: number; of: number }>;
  xp: Record<string, number>;
};

/** Adds one line to the week-grouped re-test sums and weekly XP, kept from the lines, not from replay. */
function addWeek(w: Weeks, e: Line): void {
  const week = isoWeek(localDay(e.t));
  if (e.type === "xp") w.xp[week] = (w.xp[week] ?? 0) + (e.amount as number);
  if (e.type !== "retest") return;
  const r = w.retests[week] ?? { score: 0, of: 0 };
  r.score += e.score as number;
  r.of += e.of as number;
  w.retests[week] = r;
}

const weeksOf = (w: Weeks) =>
  Object.keys(w.retests)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((week) => ({
      week,
      xp: w.xp[week] ?? 0,
      ...(w.retests[week] as { score: number; of: number }),
    }));

/** Every broken property of one history, as readable strings; [] when all hold. */
function check(lines: readonly string[]): string[] {
  const parsed = lines.map((l) => JSON.parse(l) as Line);
  const broken: string[] = [];
  let a = replay([]);
  let effort = 0; // XP of scoring lines whose xp line is inside the prefix
  const weeks: Weeks = { retests: {}, xp: {} };
  for (let k = 0; k < lines.length; k += 1) {
    const b = replay(lines.slice(0, k + 1));
    const e = parsed[k] as Line;
    const prev = parsed[k - 1];
    for (const id of TOPICS) {
      const before = a.topics[id]?.rung ?? 0;
      const after = b.topics[id]?.rung ?? 0;
      if (after > before && !rungRoseLegally(e, id, a, b))
        broken.push(`1: line ${k} ${e.type} raised ${id}`);
      if (after < before && !rungFellLegally(e, id))
        broken.push(`2: line ${k} ${e.type} lowered ${id}`);
    }
    if (
      b.xp.total > a.xp.total &&
      !(e.type === "xp" && prev !== undefined && SCORING.has(prev.type))
    )
      broken.push(`3: line ${k} ${e.type} raised XP`);
    if (k >= 1 && prev !== undefined && SCORING.has(prev.type))
      effort += XP[prev.type as keyof typeof XP];
    if (b.xp.total !== effort)
      broken.push(`4: prefix ${k} XP ${b.xp.total}, effort ${effort}`);
    addWeek(weeks, e);
    const g = guardrail(b);
    if (JSON.stringify(g.weeks) !== JSON.stringify(weeksOf(weeks)))
      broken.push(`5: prefix ${k} guardrail weeks differ`);
    a = b;
  }
  return broken;
}

// Four batches of H / 4 seeds, so each test stays inside bun's 5 s default (all 200 in one took 5.8 s).
const BATCHES = [0, 1, 2, 3].map((b) => [b * (H / 4) + 1, (b + 1) * (H / 4)]);

test.each(BATCHES)(
  "properties hold over seeded histories %p to %p",
  (from, to) => {
    for (let seed = from as number; seed <= (to as number); seed += 1) {
      const lines = history(seed);
      expect(replay(lines).skipped).toBe(0);
      expect({ seed, broken: check(lines) }).toEqual({ seed, broken: [] });
    }
  },
);

test("a bare xp line with no scoring line before it breaks property 3", () => {
  const lines = history(1);
  const bare = JSON.stringify({
    v: 1,
    type: "xp",
    amount: 10,
    reason: "attempt",
    t: "2026-10-05T16:30:00Z",
  });
  const broken = check([bare, ...lines]);
  expect(broken.some((b) => b.startsWith("3:"))).toBe(true);
});

test("no model call anywhere in src/flow", () => {
  const dir = import.meta.dir;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
  expect(files.length).toBeGreaterThan(0);
  for (const f of files) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    expect({ f, providers: /from\s+["']\.\.\/providers/.test(src) }).toEqual({
      f,
      providers: false,
    });
    expect({ f, fetch: src.includes("fetch(") }).toEqual({ f, fetch: false });
  }
});
