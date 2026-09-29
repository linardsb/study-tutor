/**
 * The cold diagnostic: one question per topic not yet on the ladder, pure: no model, no clock, no file,
 * no Math.random. The same state, day and pack always give the same test. The output names item ids and
 * seeds only; the page builds and marks each question in the browser, as the boss does.
 */
import { lcg } from "../content/generators";
import type { CasePack, Topic } from "../content/types";
import type { State } from "../events/replay";
import type { Rag } from "../events/types";
import { hash, shuffle } from "./detective";

// derived: the boss's 9 questions ≈ 20 minutes (expected, boss.ts), so 8 ≈ 18 minutes.
export const MAX_DIAGNOSTIC_TOPICS = 8;
/** The BossSlot shape, so app/retest.js's buildItems builds it. */
export type DiagnosticSlot = {
  topic: string;
  item: string | null;
  seed: number;
};
export type Diagnostic = {
  day: string;
  seed: number;
  topics: string[];
  slots: DiagnosticSlot[];
};

/** Right and Sure → G, right and Not sure → A, wrong → R. app/intake.js holds the copy. */
export function ragFor(correct: boolean, sure: boolean): Rag {
  if (!correct) return "R";
  return sure ? "G" : "A";
}

/** A generator roll, else the topic's item with answers that hashes lowest for the day; null when it has neither. */
function slotFor(
  topic: Topic,
  day: string,
  pack: CasePack,
): DiagnosticSlot | null {
  if (typeof pack.gens[topic.aliases[0] ?? ""] === "function")
    return {
      topic: topic.id,
      item: null,
      seed: hash(`${day}:diagnostic:${topic.id}`),
    };
  // A short or extended item has no answers to mark here, so it is never asked.
  let best: DiagnosticSlot | null = null;
  for (const i of pack.items.get(topic.id) ?? []) {
    if ((i.answers?.length ?? 0) === 0) continue;
    const seed = hash(`${day}:${i.id}`);
    if (
      best === null ||
      seed < best.seed ||
      (seed === best.seed && i.id < (best.item ?? ""))
    )
      best = { topic: topic.id, item: i.id, seed };
  }
  return best;
}

/**
 * Up to MAX_DIAGNOSTIC_TOPICS questions, one per topic at rung 0, unrated topics first, pack order within
 * each. A topic at rung 1 or above belongs to the boss: a red row here would send it back to rung 1.
 */
export function diagnostic(
  state: State,
  day: string,
  pack: CasePack,
): Diagnostic | null {
  const cold = pack.topics.filter((t) => (state.topics[t.id]?.rung ?? 0) === 0);
  const rated = (t: Topic) => (state.topics[t.id]?.rag ?? null) !== null;
  const pool = [
    ...cold.filter((t) => !rated(t)),
    ...cold.filter((t) => rated(t)),
  ];
  const slots: DiagnosticSlot[] = [];
  for (const t of pool) {
    if (slots.length === MAX_DIAGNOSTIC_TOPICS) break;
    const slot = slotFor(t, day, pack);
    if (slot !== null) slots.push(slot);
  }
  if (slots.length === 0) return null;
  const seed = hash(`${day}:diagnostic`);
  return {
    day,
    seed,
    topics: slots.map((s) => s.topic),
    slots: shuffle(slots, lcg(seed)),
  };
}
