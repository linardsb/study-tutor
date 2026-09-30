import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { utcNow } from "../mcp/clock";
import type { State } from "./replay";
import { type Event, KEYS, type NewEvent, parseEvent } from "./types";

export const EVENTS_FILE = "events.jsonl";
export const STATE_FILE = "state.json";
export const CONFIG_FILE = "config.json";
export const PROFILE_FILE = "profile.json";

// O_NOFOLLOW makes the open fail with ELOOP if the final path part became a symlink after
// resolveInData checked it. Windows has no such flag.
const NOFOLLOW = fs.constants.O_NOFOLLOW ?? 0;
// Read-write, not write-only: appendEvent reads the last byte to check for a trailing newline.
const APPEND =
  fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_CREAT | NOFOLLOW;
// O_EXCL: the temp file is always new, so a planted .tmp (a symlink to events.jsonl) is never written through.
const WRITE =
  fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | NOFOLLOW;
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
  // Widened: with two attempt versions the template is a cross product of every type and v.
  const own = (KEYS as Record<string, readonly string[] | undefined>)[
    `${event.type}@${event.v}`
  ];
  for (const k of own ?? []) {
    const value = (event as Record<string, unknown>)[k];
    if (value !== undefined) obj[k] = value;
  }
  // The same rule one level down: an intake row keeps only topic and rag.
  if (obj.type === "intake" && Array.isArray(obj.topics))
    obj.topics = obj.topics.map((r: unknown) =>
      r !== null && typeof r === "object"
        ? {
            topic: (r as Record<string, unknown>).topic,
            rag: (r as Record<string, unknown>).rag,
          }
        : r,
    );
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

/** Parsed JSON of one file under data/, or null if missing or not JSON. Shape is not trusted. */
export function readDataJson(dataDir: string, rel: string): unknown {
  let file: string;
  try {
    file = resolveInData(dataDir, rel);
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

/** Parsed data/state.json, or null if missing or not JSON. Shape is not trusted. */
export function readStoredState(dataDir: string): unknown {
  return readDataJson(dataDir, STATE_FILE);
}

/** Writes one file under data/ atomically (temp, fsync, rename), owner-only, refusing paths that leave data/. */
export function writeDataFile(
  dataDir: string,
  rel: string,
  data: string | Uint8Array,
): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const file = resolveInData(dataDir, rel);
  // Not resolved: a leftover .tmp, symlink or not, is removed itself, never the file it points to.
  const tmp = `${file}.tmp`;
  fs.rmSync(tmp, { force: true });
  const fd = fs.openSync(tmp, WRITE, OWNER_ONLY);
  try {
    // takes a string or bytes, and writes all of it (fs.writeSync may write part)
    fs.writeFileSync(fd, data);
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

/**
 * Makes a folder under data/ one level at a time (`squad`, then `squad/<id>`), so every level
 * passes the realpath check before anything is made inside it. Refuses a level that is not a folder.
 * `mode` applies to each level this call makes, not to one that already exists.
 */
export function makeDataDir(dataDir: string, rel: string, mode = 0o777): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const parts = rel.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const prefix = parts.slice(0, i).join("/");
    const real = resolveInData(dataDir, prefix);
    try {
      fs.mkdirSync(real, { mode });
    } catch (err) {
      if ((err as { code?: string }).code !== "EEXIST") throw err;
    }
    if (!fs.lstatSync(real).isDirectory())
      throw new Error(`Refused: ${prefix} is not a folder`);
  }
}

/**
 * One folder under data/ (or `dataDir` itself when `rel` is ""): the regular files, sorted, and the names of what was skipped (a symlink, a
 * subfolder), so a caller can say something was left out. Both empty when the folder is missing.
 */
export function listDataDir(
  dataDir: string,
  rel: string,
): { files: string[]; skipped: string[] } {
  try {
    // "" lists the root itself (the squad sync folder, #42); resolveInData refuses the root as a target.
    const real =
      rel === ""
        ? fs.realpathSync.native(dataDir)
        : resolveInData(dataDir, rel);
    const entries = fs
      .readdirSync(real, { withFileTypes: true })
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    return {
      files: entries.filter((d) => d.isFile()).map((d) => d.name),
      skipped: entries.filter((d) => !d.isFile()).map((d) => d.name),
    };
  } catch (err) {
    if (isMissing(err)) return { files: [], skipped: [] };
    throw err;
  }
}

export const INTAKE_DIR = "intake";

/** Saves one photo as data/intake/<name>, owner-only, and returns its path relative to data/. */
export function writeIntakeFile(
  dataDir: string,
  name: string,
  bytes: Uint8Array,
): string {
  if (!/^[A-Za-z0-9-]+\.(?:jpg|png|webp)$/.test(name))
    throw new Error(`Refused: ${name} is not a photo name`);
  makeDataDir(dataDir, INTAKE_DIR, 0o700);
  const rel = `${INTAKE_DIR}/${name}`;
  writeDataFile(dataDir, rel, bytes);
  return rel;
}

type Spawn = (cmd: string[]) => { exitCode: number | null };

/**
 * DOMAIN\user, so icacls cannot pick a same-named local account on a domain-joined PC (#34). On a
 * machine off any domain USERDOMAIN is the computer name, so a local account still resolves.
 */
export function ownerAccount(
  env: Record<string, string | undefined> = process.env,
  username = os.userInfo().username,
): string {
  return env.USERDOMAIN ? `${env.USERDOMAIN}\\${username}` : username;
}

/**
 * Windows ignores 0600, so the file takes the folder's ACL: drop inheritance and grant only this
 * account (#29). Called after the write, so it covers the rename and the copy fallback alike. Warns
 * rather than throws: the file has already saved.
 */
export function restrictToOwner(
  file: string,
  platform: NodeJS.Platform = process.platform,
  spawn: Spawn = (cmd) =>
    Bun.spawnSync(cmd, { stdio: ["ignore", "ignore", "pipe"] }),
  user = ownerAccount(),
): void {
  if (platform !== "win32") return;
  let ok = false;
  try {
    ok =
      spawn(["icacls", file, "/inheritance:r", "/grant:r", `${user}:F`])
        .exitCode === 0;
  } catch {
    ok = false;
  }
  if (!ok)
    console.error(
      "Could not limit data/config.json to this account; other accounts on this PC may be able to read the key.",
    );
}

/** Writes data/state.json atomically: temp file, fsync, rename. */
export function writeState(dataDir: string, state: State): void {
  writeDataFile(dataDir, STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
}

/** Copies one data file to another, both confined to `dataDir`; no-op if `from` does not exist. */
export function copyState(dataDir: string, from: string, to: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
  const src = resolveInData(dataDir, from);
  const dest = resolveInData(dataDir, to);
  if (!fs.existsSync(src)) return;
  fs.copyFileSync(src, dest);
}
