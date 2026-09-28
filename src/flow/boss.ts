/**
 * O1 boss: the mixed cold re-test for the topics that are due, pure: no clock, no file, no
 * Math.random. The same state, day and pack always give the same boss. The output names item ids and
 * seeds only (no title, answer or working); the page builds each question in the browser.
 */
import { lcg } from "../content/generators";
import type { CasePack, Topic } from "../content/types";
import type { State } from "../events/replay";
import { hash, shuffle } from "./detective";
import { RETEST_SLOTS } from "./ladder";

/** One question of a boss. item: a pack item id (the pupil's own confident-wrong item), or null for a fresh generator roll with `seed`. No title, answer or working: the page builds the question. */
export type BossSlot = { topic: string; item: string | null; seed: number };
export type Boss = {
  day: string;
  seed: number;
  topics: string[];
  slots: BossSlot[];
};
export const MAX_BOSS_TOPICS = 3; // expected: 3 topics × 3 slots = 9 questions, about a 20-minute v1 session

const order = (a: string | number, b: string | number): number => {
  if (a < b) return -1;
  return a > b ? 1 : 0;
};

/** Pack topics with nextDue on or before day, oldest nextDue first, then pack order. */
export function dueTopics(state: State, day: string, pack: CasePack): string[] {
  const due: { id: string; nextDue: string; index: number }[] = [];
  pack.topics.forEach((t, index) => {
    const nextDue = state.topics[t.id]?.nextDue ?? null;
    if (nextDue !== null && nextDue <= day)
      due.push({ id: t.id, nextDue, index });
  });
  due.sort((a, b) => order(a.nextDue, b.nextDue) || order(a.index, b.index));
  return due.map((d) => d.id);
}

/** The pupil's confident-wrong items of this topic that are pack items (a `#gen` key is not), oldest first. */
function confidentWrongItems(state: State, ids: ReadonlySet<string>): string[] {
  return Object.entries(state.confidentWrong)
    .filter(([id]) => ids.has(id))
    .sort(([a, x], [b, y]) => order(x.t, y.t) || order(a, b))
    .map(([id]) => id);
}

/** Three slots for one topic: confident-wrong items, then generator rolls, or the topic's other items when it has no generator. */
function slotsFor(
  topic: Topic,
  state: State,
  day: string,
  pack: CasePack,
): BossSlot[] {
  const ids = new Set((pack.items.get(topic.id) ?? []).map((i) => i.id));
  const fixed = (id: string): BossSlot => ({
    topic: topic.id,
    item: id,
    seed: hash(`${day}:${id}`),
  });
  const slots = confidentWrongItems(state, ids)
    .slice(0, RETEST_SLOTS)
    .map(fixed);
  if (typeof pack.gens[topic.aliases[0] ?? ""] === "function") {
    for (let k = 0; slots.length < RETEST_SLOTS; k += 1)
      slots.push({
        topic: topic.id,
        item: null,
        seed: hash(`${day}:${topic.id}:${k}`),
      });
    return slots;
  }
  const used = new Set(slots.map((s) => s.item));
  const rest = [...ids]
    .filter((id) => !used.has(id))
    .map(fixed)
    .sort((a, b) => order(a.seed, b.seed) || order(a.item ?? "", b.item ?? ""));
  return [...slots, ...rest].slice(0, RETEST_SLOTS);
}

/** The mixed cold re-test for the due topics, or null when no due topic has a question. Pure: same state, day and pack → same boss. */
export function boss(state: State, day: string, pack: CasePack): Boss | null {
  // A topic with no generator and no items has no question, so it takes no place.
  const picked = dueTopics(state, day, pack)
    .map((id) => {
      const topic = pack.topics.find((t) => t.id === id) as Topic;
      return { id, slots: slotsFor(topic, state, day, pack) };
    })
    .filter((p) => p.slots.length > 0)
    .slice(0, MAX_BOSS_TOPICS);
  if (picked.length === 0) return null;
  const topics = picked.map((p) => p.id);
  const all = picked.flatMap((p) => p.slots);
  const seed = hash(`${day}:boss`);
  return { day, seed, topics, slots: shuffle(all, lcg(seed)) };
}
