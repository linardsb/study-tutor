/**
 * O1 "what next", pure: no clock, no file, no Math.random, no model. One deterministic step from the
 * state, the day and the pack: continue today's session → boss if a topic is due → a lesson on a new
 * topic → practice. Each step carries the exact session event the page posts.
 */
import type { CasePack } from "../content/types";
import type { State } from "../events/replay";
import type { NewEvent, Rag } from "../events/types";
import { type Boss, boss } from "./boss";
import { endBody, type Mode, openToday, startBody } from "./session";
import { type Flame, flame } from "./xp";

export type Step =
  | { kind: "continue"; mode: Mode; topic: string | null; end: NewEvent }
  | { kind: "boss"; boss: Boss; start: NewEvent }
  | { kind: "lesson"; topic: string; start: NewEvent }
  | { kind: "practice"; topic: string; start: NewEvent }
  | { kind: "none" }; // empty pack
export type Next = { day: string; flame: Flame; step: Step };

/** Red first, then amber, then topics with no school mark, then green. */
const RAG_ORDER: Record<Rag | "none", number> = { R: 0, A: 1, none: 2, G: 3 };

const order = (a: string | number, b: string | number): number => {
  if (a < b) return -1;
  return a > b ? 1 : 0;
};

const rungOf = (state: State, id: string): number =>
  state.topics[id]?.rung ?? 0;

/** A new topic whose in-pack prerequisites are all started, red first, then pack order. */
function pickLesson(state: State, pack: CasePack): string | null {
  const inPack = new Set(pack.topics.map((t) => t.id));
  const ready = pack.topics
    .map((t, index) => ({ t, index }))
    .filter(
      ({ t }) =>
        rungOf(state, t.id) === 0 &&
        t.prerequisites.every((p) => !inPack.has(p) || rungOf(state, p) >= 1),
    )
    .map(({ t, index }) => ({
      id: t.id,
      index,
      rag: RAG_ORDER[state.topics[t.id]?.rag ?? "none"],
    }));
  ready.sort((a, b) => order(a.rag, b.rag) || order(a.index, b.index));
  return ready[0]?.id ?? null;
}

/** A started topic: lowest rung first, then earliest nextDue, then pack order. */
function pickPractice(state: State, pack: CasePack): string | null {
  const started = pack.topics
    .map((t, index) => ({
      id: t.id,
      index,
      rung: rungOf(state, t.id),
      nextDue: state.topics[t.id]?.nextDue ?? "9999-12-31",
    }))
    .filter((x) => x.rung >= 1);
  started.sort(
    (a, b) =>
      order(a.rung, b.rung) ||
      order(a.nextDue, b.nextDue) ||
      order(a.index, b.index),
  );
  return started[0]?.id ?? null;
}

function pickStep(state: State, day: string, pack: CasePack): Step {
  const open = openToday(state.session, day);
  if (open !== null)
    return {
      kind: "continue",
      mode: open.mode,
      topic: open.topic,
      end: endBody(open),
    };
  const b = boss(state, day, pack);
  if (b !== null)
    return { kind: "boss", boss: b, start: startBody("boss", null) };
  const lesson = pickLesson(state, pack);
  if (lesson !== null)
    return {
      kind: "lesson",
      topic: lesson,
      start: startBody("lesson", lesson),
    };
  const practice = pickPractice(state, pack);
  if (practice !== null)
    return {
      kind: "practice",
      topic: practice,
      start: startBody("practice", practice),
    };
  return { kind: "none" };
}

/** The one thing to do next on `day`, and the week's flame. */
export function nextStep(
  state: State,
  day: string,
  pack: CasePack,
  weeklyTarget: number,
): Next {
  return {
    day,
    flame: flame(state, day, weeklyTarget),
    step: pickStep(state, day, pack),
  };
}
