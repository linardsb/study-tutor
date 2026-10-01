/**
 * O4 squad: the week's shared round, pure: no clock, no file, no Math.random. The same squad id, ISO
 * week and pack give the same topic and seeds on any machine, so friends get identical questions with
 * nothing exchanged beforehand (D9). Results travel as one file per pupil; this module owns that file's
 * shape and its parser, and never trusts a file it did not write.
 */
import { lcg } from "../content/generators";
import type { CasePack, Generated } from "../content/types";
import type { SquadAnswer, SquadV1 } from "../events/types";
import { normaliseAnswer } from "../marking/normalise";
import { hash } from "./detective";

export const SQUAD_SLOTS = 5; // expected: 5 questions ≈ a 10-minute round (the v1 re-test is 3; a squad round is the week's one shared test)
export const PARENT_SLOTS = 3; // the parent answers 3 fresh rolls after being taught
export const MAX_ANSWER = 100;
export const MAX_WORKING = 500;

const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;
// Windows refuses these as a file or folder name, with or without an extension.
const DEVICE = /^(con|nul|aux|prn|com[1-9]|lpt[1-9])$/;
const WEEK = /^\d{4}-W\d{2}$/;
/** A tutor's squad owner id: crypto.randomUUID's shape. */
export const OWNER =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** "Year 11 B " → "year-11-b"; null when nothing valid remains. Both squad id and pupil name become path parts. */
export function slug(x: unknown): string | null {
  if (typeof x !== "string") return null;
  const s = x.trim().toLowerCase().replace(/\s+/g, "-");
  return SLUG.test(s) && !DEVICE.test(s) ? s : null;
}

export type SquadRound = {
  squad: string;
  week: string;
  topic: string;
  seeds: number[];
  parentSeeds: number[];
};

const genOf = (pack: CasePack, topic: string) => {
  const code = pack.topics.find((t) => t.id === topic)?.aliases[0] ?? "";
  return pack.gens[code];
};

/** Pack topics with a generator, in pack order; the pick is hash(`${squad}:${week}`) % n. Null when the pack has none. */
export function squadRound(
  squad: string,
  week: string,
  pack: CasePack,
): SquadRound | null {
  const topics = pack.topics.filter(
    (t) => typeof pack.gens[t.aliases[0] ?? ""] === "function",
  );
  if (topics.length === 0) return null;
  const topic = (
    topics[hash(`${squad}:${week}`) % topics.length] as (typeof topics)[number]
  ).id;
  return roundOf(squad, week, topic, pack);
}

// observed (2000-seed scratch run, 2026-09-30): the smallest generator, 1MA1/G17/sphere, rolls 9 stems, so 5 pupil + 3 parent fit; expected: 200 tries is ample
const PARENT_TRIES = 200;

/**
 * The round for a known topic: a saved squad event keeps the questions it was answered on after an
 * update moves the pick. The parent's seeds walk hash(`…:parent:k`) and keep only a seed whose question
 * is none of the pupil's five and none already kept: a small generator rolls the same stem from two
 * seeds, and the pupil's worked answers are on the page beside the parent round (M4).
 */
export function roundOf(
  squad: string,
  week: string,
  topic: string,
  pack: CasePack,
): SquadRound {
  const seeds = Array.from({ length: SQUAD_SLOTS }, (_, k) =>
    hash(`${squad}:${week}:${topic}:${k}`),
  );
  const gen = genOf(pack, topic);
  const stem = (s: number) =>
    typeof gen === "function" ? gen(lcg(s)).stem : String(s);
  const taken = new Set(seeds.map(stem));
  const parentSeeds: number[] = [];
  for (let k = 0; parentSeeds.length < PARENT_SLOTS && k < PARENT_TRIES; k++) {
    const s = hash(`${squad}:${week}:${topic}:parent:${k}`);
    const q = stem(s);
    if (taken.has(q)) continue;
    taken.add(q);
    parentSeeds.push(s);
  }
  return { squad, week, topic, seeds, parentSeeds };
}

/** Days left in the ISO week of day, today included: Monday 7 … Sunday 1. */
export function daysLeft(day: string): number {
  const weekday = ((new Date(`${day}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  return 8 - weekday;
}

/** The round's generated questions, rolled with lcg(seed). */
export function roll(
  round: SquadRound,
  pack: CasePack,
  seeds: readonly number[] = round.seeds,
): Generated[] {
  const gen = genOf(pack, round.topic);
  if (typeof gen !== "function") return [];
  return seeds.map((s) => gen(lcg(s)));
}

/** Server marking: normaliseAnswer(typed) against each accepted answer. */
export function markRound(
  qs: readonly Generated[],
  typed: readonly { answer: string; working: string }[],
): SquadAnswer[] {
  return qs.map((q, i) => {
    const t = typed[i] ?? { answer: "", working: "" };
    const val = normaliseAnswer(t.answer);
    return {
      answer: t.answer,
      working: t.working,
      correct: val !== "" && q.answers.some((a) => normaliseAnswer(a) === val),
    };
  });
}

export type SquadFile = {
  v: 1;
  app: string;
  squad: string;
  pupil: string;
  week: string;
  topic: string;
  seeds: number[];
  answers: SquadAnswer[];
  score: number;
  of: number;
  owner?: string; // the writing tutor's profile.squadOwner; absent in files from 0.1.2 and earlier
};

/** The pupil's file: a projection of the week's squad event, so it can be deleted and written again. */
export function squadFile(
  e: SquadV1,
  pupil: string,
  seeds: readonly number[],
  app: string,
  owner?: string | null,
): SquadFile {
  return {
    v: 1,
    app,
    ...(owner ? { owner } : {}),
    squad: e.squad,
    pupil,
    week: e.week,
    topic: e.topic,
    seeds: [...seeds],
    answers: e.answers.map((a) => ({
      answer: a.answer,
      working: a.working,
      correct: a.correct,
    })),
    score: e.score,
    of: e.of,
  };
}

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const count = (x: unknown) => Number.isInteger(x) && (x as number) >= 0;

/** Untrusted JSON → SquadFile or null. Only the known fields are kept, so a stray key never reaches the page. */
export function parseSquadFile(x: unknown): SquadFile | null {
  if (!isObj(x) || x.v !== 1 || typeof x.app !== "string") return null;
  if (slug(x.squad) !== x.squad || slug(x.pupil) !== x.pupil) return null;
  if (typeof x.week !== "string" || !WEEK.test(x.week)) return null;
  if (typeof x.topic !== "string") return null;
  if (!Array.isArray(x.seeds) || !x.seeds.every(count)) return null;
  if (!Array.isArray(x.answers)) return null;
  const answers: SquadAnswer[] = [];
  for (const a of x.answers) {
    if (
      !isObj(a) ||
      typeof a.answer !== "string" ||
      a.answer.length > MAX_ANSWER ||
      typeof a.working !== "string" ||
      a.working.length > MAX_WORKING ||
      typeof a.correct !== "boolean"
    )
      return null;
    answers.push({ answer: a.answer, working: a.working, correct: a.correct });
  }
  if (x.of !== answers.length) return null;
  if (x.score !== answers.filter((a) => a.correct).length) return null;
  return {
    v: 1,
    app: x.app,
    squad: x.squad as string,
    pupil: x.pupil as string,
    week: x.week,
    topic: x.topic,
    seeds: x.seeds as number[],
    answers,
    score: x.score as number,
    of: x.of as number,
    ...(typeof x.owner === "string" && OWNER.test(x.owner)
      ? { owner: x.owner }
      : {}),
  };
}

// Seeds follow from squad, week and topic, so they are left out: a caller without the pack passes [].
// Destructured, not overwritten: an ownerless file would otherwise put `owner` last and never match.
const roundOnly = ({ app: _a, owner: _o, seeds: _s, ...r }: SquadFile) =>
  JSON.stringify(r);
const sameRound = (a: SquadFile, b: SquadFile) => roundOnly(a) === roundOnly(b);

/**
 * True when a file carrying this pupil's name was written by another tutor (F8: two pupils with one
 * name). An owned file is taken when the owner differs. An ownerless file (a 0.1.2 tutor) is taken only
 * when it is this week's and is not this pupil's own saved round; an older week's is a stale own file.
 */
export function nameTaken(
  f: SquadFile,
  owner: string | null,
  mine: SquadFile | null,
  week: string,
): boolean {
  if (f.owner !== undefined) return f.owner !== owner;
  if (f.week !== week) return false;
  return mine === null || !sameRound(f, mine);
}

/** Same week, topic and seeds as mine, and one answer per seed. */
export function comparable(mine: SquadRound, f: SquadFile): boolean {
  return (
    f.week === mine.week &&
    f.topic === mine.topic &&
    f.seeds.length === mine.seeds.length &&
    f.answers.length === mine.seeds.length &&
    f.seeds.every((s, i) => s === mine.seeds[i])
  );
}

/** Sum of score and of over the rounds given, and how many. */
export function pool(files: readonly { score: number; of: number }[]): {
  score: number;
  of: number;
  rounds: number;
} {
  return {
    score: files.reduce((n, f) => n + f.score, 0),
    of: files.reduce((n, f) => n + f.of, 0),
    rounds: files.length,
  };
}
