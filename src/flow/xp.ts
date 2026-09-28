/**
 * O1 XP and weekly flame, pure: no clock, no file, no Math.random. XP stays an xp@1 event (D3), written
 * by the server after a scoring event; the flame and the guardrail pair are read from state.
 */
import type { State } from "../events/replay";
import type { Event, NewEvent, XpV1 } from "../events/types";
import { isoWeek } from "../mcp/clock";

/** Effort, not correctness (PRD O1): a wrong attempt earns what a right one does. Values as in six-weeks.jsonl. */
export const XP: Record<XpV1["reason"], number> = {
  attempt: 10,
  retest: 20,
  teachback: 15,
};

const isReason = (type: string): type is XpV1["reason"] =>
  Object.hasOwn(XP, type);

/** The xp line the server appends after a scoring event, or null for any other event. */
export function xpFor(e: Event | NewEvent): NewEvent | null {
  if (!isReason(e.type)) return null;
  return { v: 1, type: "xp", amount: XP[e.type], reason: e.type };
}

export type Flame = { week: string; days: number; target: number };

/** "n of target this week": distinct London days with real work in the ISO week of `day`. */
export function flame(state: State, day: string, target: number): Flame {
  const week = isoWeek(day);
  return { week, days: state.flame[week]?.length ?? 0, target };
}

export type GuardrailWeek = {
  week: string;
  xp: number;
  score: number;
  of: number;
};

const byWeek = (a: string, b: string): number => {
  if (a < b) return -1;
  return a > b ? 1 : 0;
};

/** Weeks with a re-test, in week order, and whether the latest re-test rate fell below the previous one while XP rose. */
export function guardrail(state: State): {
  weeks: GuardrailWeek[];
  falling: boolean;
} {
  const weeks = Object.keys(state.retests)
    .sort(byWeek)
    .map((week) => {
      const r = state.retests[week] as { score: number; of: number };
      return { week, xp: state.xp.byWeek[week] ?? 0, score: r.score, of: r.of };
    });
  const last = weeks.at(-1);
  const prev = weeks.at(-2);
  // Cross-multiplied, so no float.
  const falling =
    last !== undefined &&
    prev !== undefined &&
    last.score * prev.of < prev.score * last.of &&
    last.xp > prev.xp;
  return { weeks, falling };
}
