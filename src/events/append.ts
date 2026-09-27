import fs from "node:fs";
import path from "node:path";
import { utcNow } from "../mcp/clock";
import type { State } from "./replay";
import { type Event, KEYS, type NewEvent, parseEvent } from "./types";

export const EVENTS_FILE = "events.jsonl";
export const STATE_FILE = "state.json";

// O_NOFOLLOW makes the open fail with ELOOP if the final path part became a symlink after
// resolveInData checked it. Windows has no such flag.
const NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;
// Read-write, not write-only: appendEvent reads the last byte to check for a trailing newline.
const APPEND =
  fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_CREAT | NOFOLLOW;
const WRITE =
  fs.constants.O_WRONLY |
  fs.constants.O_CREAT |
  fs.constants.O_TRUNC |
  NOFOLLOW;
const OWNER_ONLY = 0o600;

const isMissing = (err: unknown) =>
  (err as { code?: string }).code === "ENOENT";

/** Resolves `rel` inside `dataDir`, following symlinks; throws if the result is outside `dataDir`. */
export function resolveInData(dataDir: string, rel: string): string {
  const root = fs.realpathSync.native(dataDir);
  const target = path.resolve(root, rel);
  let real: string;
  try {
    real = fs.realpathSync.native(target);
  } catch (err) {
    if (!isMissing(err)) throw err;
    // A dangling symlink: opening it would create its target, wherever that is.
    if (fs.lstatSync(target, { throwIfNoEntry: false }) !== undefined) {
      throw new Error(`Refused: ${rel} resolves outside the data folder`);
    }
    real = path.join(
      fs.realpathSync.native(path.dirname(target)),
      path.basename(target),
    );
  }
  const r = path.relative(root, real);
  if (
    r === "" ||
    r === ".." ||
    r.startsWith(`..${path.sep}`) ||
    path.isAbsolute(r)
  ) {
    throw new Error(`Refused: ${rel} resolves outside the data folder`);
  }
  return real;
}

/**
 * Appends one event to data/events.jsonl, fsynced before returning. The only writer of that file.
 * Validates first, so a refused event creates nothing, not even `data/`.
 */
export function appendEvent(
  dataDir: string,
  event: NewEvent,
  now: () => string = utcNow,
): Event {
  // Key order v, t, type, ... as in events.md. Only the type's own fields are copied, so a
  // caller's t never wins and a stray field (a correct answer) never reaches the log.
  const obj: Record<string, unknown> = {
    v: event.v,
    t: now(),
    type: event.type,
  };
  const own = KEYS[`${event.type}@${event.v}`] as readonly string[] | undefined;
  for (const k of own ?? []) {
    const value = (event as Record<string, unknown>)[k];
    if (value !== undefined) obj[k] = value;
  }
  const line = JSON.stringify(obj);
  const parsed = parseEvent(line);
  if (parsed === null) {
    throw new Error(`Refused: not a valid ${event.type} v${event.v} event`);
  }
  // photo.file is relative to data/ and must resolve inside it (D11): the one path an event carries.
  if (parsed.type === "photo") {
    try {
      resolveInData(dataDir, parsed.file);
    } catch (err) {
      const m = (err as Error).message;
      throw new Error(
        m.startsWith("Refused")
          ? m
          : `Refused: ${parsed.file} is not in the data folder`,
      );
    }
  }
  fs.mkdirSync(dataDir, { recursive: true });
  const file = resolveInData(dataDir, EVENTS_FILE);
  const fd = fs.openSync(file, APPEND, OWNER_ONLY);
  try {
    // A hand edit or torn write can leave no trailing newline; without one the new line joins it.
    let prefix = "";
    const size = fs.fstatSync(fd).size;
    if (size > 0) {
      const last = Buffer.alloc(1);
      fs.readSync(fd, last, 0, 1, size - 1);
      if (last[0] !== 0x0a) prefix = "\n";
    }
    // One write per line: O_APPEND positions it at end-of-file atomically, so a second
    // writer process cannot split it.
    fs.writeSync(fd, `${prefix}${line}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return parsed;
}

/** Non-empty lines of data/events.jsonl in file order; [] if the file does not exist yet. */
export function readLines(dataDir: string): string[] {
  let text: string;
  try {
    text = fs.readFileSync(resolveInData(dataDir, EVENTS_FILE), "utf8");
  } catch (err) {
    if (isMissing(err)) return [];
    throw err;
  }
  // A Windows editor can save the log with a byte-order mark, which would spoil line 1.
  return text
    .replace(/^\uFEFF/, "")
    .split("\n")
    .map((l) => (l.endsWith("\r") ? l.slice(0, -1) : l))
    .filter((l) => l.trim() !== "");
}

/** Parsed data/state.json, or null if missing or not JSON. Shape is not trusted. */
export function readStoredState(dataDir: string): unknown {
  let file: string;
  try {
    file = resolveInData(dataDir, STATE_FILE);
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/** Writes data/state.json atomically: temp file, fsync, rename. */
export function writeState(dataDir: string, state: State): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = resolveInData(dataDir, STATE_FILE);
  const tmp = resolveInData(dataDir, `${STATE_FILE}.tmp`);
  const fd = fs.openSync(tmp, WRITE, OWNER_ONLY);
  try {
    fs.writeSync(fd, `${JSON.stringify(state, null, 2)}\n`);
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  try {
    fs.renameSync(tmp, file);
  } catch (err) {
    // Windows refuses to replace a file another process has open (an antivirus scan, Notepad).
    // Not atomic, which is acceptable: state.json is derived and the next replay rebuilds it.
    const code = (err as { code?: string }).code;
    if (code !== "EPERM" && code !== "EACCES" && code !== "EEXIST") throw err;
    fs.copyFileSync(tmp, file);
    fs.rmSync(tmp);
  }
}

/** Copies one data file to another, both confined to `dataDir`; no-op if `from` does not exist. */
export function copyState(dataDir: string, from: string, to: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const src = resolveInData(dataDir, from);
  const dest = resolveInData(dataDir, to);
  if (!fs.existsSync(src)) return;
  fs.copyFileSync(src, dest);
}
