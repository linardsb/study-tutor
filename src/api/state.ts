import { readLines, readStoredState, writeState } from "../events/append";
import { replay, type State } from "../events/replay";

/** The state of the log as it is now. Rewrites state.json when it is missing or behind; never creates data/ for an empty log. */
export function currentState(dataDir: string): State {
  const lines = readLines(dataDir);
  const state = replay(lines);
  const stored = readStoredState(dataDir) as { hash?: unknown } | null;
  if (lines.length === 0 && stored === null) return state;
  if (stored === null || stored.hash !== state.hash) writeState(dataDir, state);
  return state;
}
