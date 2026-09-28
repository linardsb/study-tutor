import {
  copyState,
  readLines,
  readStoredState,
  STATE_FILE,
  writeState,
} from "./append";
import { dict, replay, type State } from "./replay";

export type Fall = { topic: string; stored: number; replayed: number };
export type CheckResult =
  | { ok: true; wrote: State; truncated: boolean; changes: string[] }
  | { ok: false; fallen: Fall[] };

/** The paths every state shape must keep: what a new build can read from an old state.json. */
type Stored = {
  lines: number;
  rungs: Record<string, number>;
  xp: number;
  hash?: string; // absent in a state written before the hash existed
};

const num = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);

function project(stored: unknown): Stored | null {
  if (typeof stored !== "object" || stored === null) return null;
  const s = stored as Record<string, unknown>;
  const xp = s.xp as Record<string, unknown> | undefined;
  if (
    !Number.isInteger(s.lines) ||
    (s.lines as number) < 0 ||
    typeof s.topics !== "object" ||
    s.topics === null
  ) {
    return null;
  }
  if (typeof xp !== "object" || xp === null || !num(xp.total)) return null;
  const rungs = dict<number>();
  for (const [id, t] of Object.entries(s.topics)) {
    const rung = (t as Record<string, unknown> | null)?.rung;
    if (!num(rung)) return null;
    rungs[id] = rung;
  }
  const out: Stored = { lines: s.lines as number, rungs, xp: xp.total };
  if (typeof s.hash === "string") out.hash = s.hash;
  return out;
}

/** One line per saved rung that is lower in `now`, each ending with why. */
function falls(stored: Stored, now: State, why: string): string[] {
  const out: string[] = [];
  for (const [id, rung] of Object.entries(stored.rungs)) {
    const replayed = now.topics[id]?.rung ?? 0;
    if (replayed < rung)
      out.push(`${id}: saved ${rung}, now ${replayed} (${why})`);
  }
  return out;
}

function write(dataDir: string, state: State, raw: unknown): void {
  // Nothing changed: keep state.prev.json as it is, so the state from before an update survives every
  // later start. Holds because writeState writes JSON.stringify output, so key order matches.
  if (JSON.stringify(raw) === JSON.stringify(state)) return;
  // The state this build replaces is always one file away.
  copyState(dataDir, STATE_FILE, "state.prev.json");
  writeState(dataDir, state);
}

/** The message for a refused start, shared by scripts/replay-check.ts and the server. */
export function refusalLines(fallen: Fall[]): string[] {
  const n = fallen.length;
  return [
    `Stopped: this version of the tutor would lower progress on ${n} ${n === 1 ? "topic" : "topics"}.`,
    ...fallen.map((f) => `  ${f.topic}: saved ${f.stored}, now ${f.replayed}`),
    "Nothing was changed. Put the previous version back, or delete data/state.json to accept the new version.",
  ];
}

/** Replays the log with this build and refuses if any rung in the stored state.json would fall. */
export function replayCheck(dataDir: string): CheckResult {
  const lines = readLines(dataDir);
  const raw = readStoredState(dataDir);
  const stored = project(raw);
  const now = replay(lines);

  // Nothing to check and nothing to keep: do not create data/ (a stray `--help` did).
  if (stored === null && lines.length === 0) {
    return { ok: true, wrote: now, truncated: false, changes: [] };
  }

  if (stored === null) {
    write(dataDir, now, raw);
    return {
      ok: true,
      wrote: now,
      truncated: false,
      changes: ["No saved progress to compare; rebuilt from the log."],
    };
  }

  // The log is shorter than the saved progress, or its first `lines` lines changed: a hand
  // edit. Refusing would lock the family out, so report every rung that fell, keep the
  // backup, and rebuild.
  // No lines added since the last write (the usual start): the prefix replay is `now`.
  const before =
    stored.lines > lines.length
      ? null
      : stored.lines === lines.length
        ? now
        : replay(lines.slice(0, stored.lines));
  if (
    before === null ||
    (stored.hash !== undefined && before.hash !== stored.hash)
  ) {
    const why =
      before === null
        ? "the log is shorter than the saved progress"
        : "the log no longer matches the saved progress";
    const changes = falls(stored, now, why);
    write(dataDir, now, raw);
    return { ok: true, wrote: now, truncated: true, changes };
  }

  // The saved lines, unchanged, replayed by this build: a rung that falls here fell because
  // the code changed. (A state from before the hash existed cannot rule out an edit.)
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
  write(dataDir, now, raw);
  return { ok: true, wrote: now, truncated: false, changes };
}
