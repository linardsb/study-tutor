import {
  copyState,
  readLines,
  readStoredState,
  STATE_FILE,
  writeState,
} from "./append";
import { replay, type State } from "./replay";

export type Fall = { topic: string; stored: number; replayed: number };
export type CheckResult =
  | { ok: true; wrote: State; truncated: boolean; changes: string[] }
  | { ok: false; fallen: Fall[] };

/** The paths every state shape must keep: what a new build can read from an old state.json. */
type Stored = { lines: number; rungs: Record<string, number>; xp: number };

const num = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);

function project(stored: unknown): Stored | null {
  if (typeof stored !== "object" || stored === null) return null;
  const s = stored as Record<string, unknown>;
  const xp = s.xp as Record<string, unknown> | undefined;
  if (!num(s.lines) || typeof s.topics !== "object" || s.topics === null) {
    return null;
  }
  if (typeof xp !== "object" || xp === null || !num(xp.total)) return null;
  const rungs: Record<string, number> = {};
  for (const [id, t] of Object.entries(s.topics)) {
    const rung = (t as Record<string, unknown> | null)?.rung;
    if (!num(rung)) return null;
    rungs[id] = rung;
  }
  return { lines: s.lines, rungs, xp: xp.total };
}

function write(dataDir: string, state: State): void {
  // The state this build replaces is always one file away.
  copyState(dataDir, STATE_FILE, "state.prev.json");
  writeState(dataDir, state);
}

/** Replays the log with this build and refuses if any rung in the stored state.json would fall. */
export function replayCheck(dataDir: string): CheckResult {
  const lines = readLines(dataDir);
  const stored = project(readStoredState(dataDir));
  const now = replay(lines);

  if (stored === null) {
    write(dataDir, now);
    return {
      ok: true,
      wrote: now,
      truncated: false,
      changes: ["No saved progress to compare; rebuilt from the log."],
    };
  }

  // The log is shorter than the saved progress: a hand edit. Refusing would lock the family
  // out, so report every rung that fell, keep the backup, and rebuild.
  if (stored.lines > lines.length) {
    const changes: string[] = [];
    for (const [id, rung] of Object.entries(stored.rungs)) {
      const replayed = now.topics[id]?.rung ?? 0;
      if (replayed < rung) {
        changes.push(
          `${id}: saved ${rung}, now ${replayed} (the log is shorter than the saved progress)`,
        );
      }
    }
    write(dataDir, now);
    return { ok: true, wrote: now, truncated: true, changes };
  }

  // Same events, this build: only a code change can make a rung fall here.
  const before = replay(lines.slice(0, stored.lines));
  const fallen: Fall[] = [];
  const changes: string[] = [];
  for (const [id, rung] of Object.entries(stored.rungs)) {
    const replayed = before.topics[id]?.rung ?? 0;
    if (replayed < rung) fallen.push({ topic: id, stored: rung, replayed });
    else if (replayed !== rung)
      changes.push(`${id}: saved ${rung}, now ${replayed}`);
  }
  if (fallen.length > 0) return { ok: false, fallen };
  if (before.xp.total !== stored.xp) {
    changes.push(`XP: saved ${stored.xp}, now ${before.xp.total}`);
  }
  write(dataDir, now);
  return { ok: true, wrote: now, truncated: false, changes };
}
