/**
 * O2 coach the noob, pure: no clock, no file, no Math.random, no model call of its own. Which topics
 * Dan can try, which item and which wrong step (both a function of the seed base, so the POST rebuilds
 * them without a field from the page), the correction marked in code, and the two event bodies the API
 * writes. The wrong step always comes from the item's misconception bank (R8).
 */
import { lcg } from "../content/generators";
import type { CasePack, Item, Misconception, Topic } from "../content/types";
import { type NewEvent, parseEvent } from "../events/types";
import { danWrongStep } from "../jobs/dan_wrong_step";
import type { JobDeps } from "../jobs/define";
import { jobItem } from "../jobs/view";
import { markAnswer } from "../marking/answer";
import { findItem } from "./chat";
import { hash } from "./detective";

export { PER_RANK, RANKS, type Rank, rank, rankFor } from "./rank";

export const DAN = "Dan";
const ROLLS = 8; // generator rolls tried before falling back to an items-file item, as detective.ts

type Seeded = Item & { seed?: number };

/** True when the log holds an attempt on the topic (plan Q1: the gate is an attempt, so no-model mode is not locked out). */
export function hasTried(log: readonly string[], topic: string): boolean {
  return log.some((line) => {
    const e = parseEvent(line);
    return e?.type === "attempt" && e.topic === topic;
  });
}

/** Topics the pupil has tried, in pack order. */
export function triedTopics(log: readonly string[], pack: CasePack): Topic[] {
  const tried = new Set<string>();
  for (const line of log) {
    const e = parseEvent(line);
    if (e?.type === "attempt") tried.add(e.topic);
  }
  return pack.topics.filter((t) => tried.has(t.id));
}

/**
 * The item Dan tries: a generator roll with at least one named wrong answer (seed = hash(`${base}:${k}`),
 * k < ROLLS), else the items-file item with misconceptions at hash(base) % n, else null.
 */
export function pickItem(
  pack: CasePack,
  topic: string,
  base: string,
): Seeded | null {
  for (let k = 0; k < ROLLS; k += 1) {
    // hash is 32-bit unsigned, so every seed it makes passes findItem's bound.
    const rolled = findItem(pack, `${topic}#gen`, hash(`${base}:${k}`));
    if (rolled === null) break; // no generator for this topic
    if (rolled.misconceptions.length > 0) return rolled;
  }
  const items = (pack.items.get(topic) ?? []).filter(
    (i) => i.misconceptions.length > 0,
  );
  if (items.length === 0) return null;
  return items[hash(base) % items.length] ?? null;
}

/** The misconception Dan voices, or null when the bank is empty. The same item and seed always give the same step. */
export function chooseWrong(
  item: Pick<Item, "id" | "misconceptions"> & { seed?: number },
): Misconception | null {
  const n = item.misconceptions.length;
  if (n === 0) return null;
  const rng = lcg(hash(`${item.id}:${item.seed ?? ""}:dan`));
  return item.misconceptions[Math.floor(rng() * n)] ?? null;
}

export type Refusal = "already-answered" | "try-first";
export type DanReply =
  | { kind: "dan"; lines: string[]; by: "model" | "fallback" }
  | { kind: "refused"; reason: Refusal }
  | { kind: "skipped" }; // no misconception on this item

/** Dan's attempt: refused before an attempt on the topic or after one on this item and seed; else the job's lines. */
export async function danStep(
  item: Seeded,
  topic: string,
  log: readonly string[],
  deps: JobDeps,
): Promise<DanReply> {
  if (!hasTried(log, item.topic))
    return { kind: "refused", reason: "try-first" };
  const j = jobItem(log, item);
  if (j.attempted) return { kind: "refused", reason: "already-answered" };
  const wrong = chooseWrong(item);
  if (wrong === null) return { kind: "skipped" };
  const v = await danWrongStep.run({ view: j.view, topic, wrong }, deps);
  // The fallback always has a value; the null arm is only the type's.
  return { kind: "dan", lines: v.value?.lines ?? [], by: v.by };
}

export type Correction =
  | { kind: "refused"; reason: Refusal }
  | { kind: "skipped" }
  | {
      kind: "marked";
      correct: boolean;
      caught: boolean; // the first correction was right: unaided, the page offers no hint (plan Q3)
      named: string | null;
      wrong: Misconception;
      attempt: NewEvent;
      record: NewEvent;
    };

/** The pupil's correction, marked in code (CLAUDE.md: no model decides a numeric answer), and the two bodies to write. */
export function correction(
  item: Seeded,
  typed: string,
  sure: boolean,
  log: readonly string[],
): Correction {
  if (!hasTried(log, item.topic))
    return { kind: "refused", reason: "try-first" };
  if (jobItem(log, item).attempted)
    return { kind: "refused", reason: "already-answered" };
  const wrong = chooseWrong(item);
  if (wrong === null) return { kind: "skipped" };
  const { ok, named } = markAnswer(item, typed);
  const seed = item.seed === undefined ? {} : { seed: item.seed };
  return {
    kind: "marked",
    correct: ok,
    caught: ok,
    named,
    wrong,
    attempt: {
      v: 1,
      type: "attempt",
      item: item.id,
      topic: item.topic,
      correct: ok,
      sure,
      answer: typed,
      ...seed,
    },
    record: {
      v: 1,
      type: "coach",
      topic: item.topic,
      item: item.id,
      ...seed,
      wrong: wrong.answer,
      caught: ok,
    },
  };
}
