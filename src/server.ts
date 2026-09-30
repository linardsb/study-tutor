import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { caseForDay, loadPacks } from "./api/case";
import { getChat, postChat } from "./api/chat";
import { getCoach, postCoach } from "./api/coach";
import { getConfig, getUsage, postConfig } from "./api/config";
import { getCourses, saveCourses } from "./api/courses";
import { getDigest } from "./api/digest";
import { postEvent } from "./api/event";
import { diagnosticForDay, postInterview, postSheet } from "./api/intake";
import { lessonUrls } from "./api/lessons";
import { nextForDay } from "./api/next";
import { getSquad, joinSquad, postSquad } from "./api/squad";
import { currentState } from "./api/state";
import { topicRows } from "./api/topics";
import { readProfile, restrictConfigOnStart } from "./config";
import { chosenOf, filterPack } from "./content/profile";
import type { CasePack, Course, Topic } from "./content/types";
import {
  createDataFile,
  ensureDataDir,
  readDataJson,
  removeDataFile,
  writeDataFile,
} from "./events/append";
import { refusalLines, replayCheck } from "./events/check";
import { isDay } from "./events/types";
import { isoWeek, localDay, utcNow } from "./mcp/clock";
import { runStdio } from "./mcp/server";
import {
  createSnaps,
  getSnap,
  lanAddress,
  mintSnap,
  postPhoto,
  type SnapContext,
  type Snaps,
} from "./snap";
import {
  checkForUpdate,
  RELEASES_FEED,
  type UpdateInfo,
  VERSION,
} from "./updates";

export const PORTS = [4731, 4732, 4733, 4734, 4735] as const;

export type ServerOptions = {
  root: string;
  dataDir: string;
  topics: readonly Topic[];
  pack?: CasePack; // loaded on the first /api/case when absent (the tests' options predate it)
  subjects?: ReadonlyMap<string, string>; // topic id → subject; loaded with the pack when absent
  // Every pack's courses. Absent with an injected pack → none, so no profile narrows it (the tests' packs).
  courses?: readonly Course[];
  update?: Promise<UpdateInfo>; // the start-up feed check; absent → no update
  // The phone listener's address. Absent → none, so a test that mints never binds the Wi-Fi address.
  snapHost?: () => string | null;
  snaps?: Snaps;
  instance?: string; // this run's id, answered at /api/instance so a second start can find it (M8)
};

/** The folder holding app/, content/ and data/: beside the binary when compiled, the cwd under `bun run dev`. */
export function appRoot(): string {
  // A compiled binary's modules live at /$bunfs/root (observed, macOS) or B:\~BUN\root (Windows, expected).
  const compiled = /^\/\$bunfs\/|[\\/]~BUN[\\/]/.test(import.meta.dir);
  return compiled ? path.dirname(process.execPath) : process.cwd();
}

// A Windows device base name (L9); staticPath strips the extension and trailing spaces first.
const DEVICE =
  /^(con|prn|aux|nul|conin\$|conout\$|com[0-9\u00b9\u00b2\u00b3]|lpt[0-9\u00b9\u00b2\u00b3])$/i;

/**
 * The file under `root/folder` that the URL path `rel` names, or null when it names none. The URL is
 * split on `/` and joined segment by segment: a `..` or a `\` in a segment is refused outright, and
 * the join must land strictly inside the folder. Nothing is normalised first: `path.win32.normalize`
 * reads a leading `//` as a UNC root, which turned `/../data/x` into `root/data/x` (PR #26 F1).
 * `p` is the platform's `path` and is a parameter so the tests can run the Windows rules on any OS.
 * Windows reads more into a name than POSIX does: it strips a trailing dot or space (`.. ` is `..`),
 * opens a drive for `C:`, a stream for `x:$DATA`, and a device for a segment whose base name (up to
 * the first dot, trailing spaces dropped, any case) is CON, PRN, AUX, NUL, CONIN$, CONOUT$, COM or
 * LPT with 0-9 or a superscript 1-3: `NUL.json`, `con .txt`, `COM¹`. Those segments are refused on
 * every OS; no file in app/ or content/ is named like one.
 */
export function staticPath(
  root: string,
  folder: string,
  rel: string,
  p: typeof path = path,
): string | null {
  const segments = rel.split("/").filter((s) => s !== "");
  if (
    segments.some(
      (s) =>
        s === ".." ||
        s.includes("\\") ||
        s.includes(":") ||
        /[. ]$/.test(s) ||
        DEVICE.test(s.split(".")[0]?.replace(/ +$/, "") ?? ""),
    )
  )
    return null;
  const base = p.join(root, folder);
  const file = p.join(base, ...segments);
  return file.startsWith(base + p.sep) ? file : null;
}

/**
 * `/x` from app/, `/content/x` from content/. The same Host and Origin check as the API: an items file
 * holds answers, and a rebound hostname would let another site read it.
 */
export async function serveStatic(
  req: Request,
  root: string,
): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD")
    return new Response("Method not allowed", { status: 405 });
  // After the method check, so a POST stays 405 rather than refuseForeign's 415.
  const refused = refuseForeign(req);
  if (refused) return refused;
  let pathname: string;
  try {
    pathname = decodeURIComponent(new URL(req.url).pathname);
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (pathname === "/") pathname = "/index.html";
  if (pathname.includes("\0"))
    return new Response("Not found", { status: 404 });
  const [folder, rel] = pathname.startsWith("/content/")
    ? ["content", pathname.slice("/content".length)]
    : ["app", pathname];
  const target = staticPath(root, folder, rel);
  if (target === null) return new Response("Not found", { status: 404 });
  const file = Bun.file(target);
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file, { headers: { "cache-control": "no-cache" } });
}

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/**
 * The API answers the tutor's own pages and nothing else. A page on another site in the same browser
 * can send a simple cross-origin request (a `text/plain` body needs no preflight), and a hostname that
 * resolves to loopback (DNS rebinding) makes the request look same-origin to the browser. So: the Host
 * must be loopback, an Origin when present must be this server, and a POST body must be declared JSON.
 * `curl` sends no Origin and passes. Returns the refusal, or null to continue (PR #26 F3).
 */
export function refuseForeign(req: Request): Response | null {
  const host = req.headers.get("host") ?? "";
  if (!LOCAL_HOSTS.has(host.replace(/:\d+$/, "")))
    return json(403, { error: "Refused: not a local request" });
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== `http://${host}`)
    return json(403, { error: "Refused: not the tutor's own page" });
  if (req.method === "POST") {
    const type = req.headers.get("content-type") ?? "";
    if (!/^application\/json\b/i.test(type))
      return json(415, { error: "Body must be application/json" });
  }
  return null;
}

function getState(req: Request, dataDir: string): Response {
  const refused = refuseForeign(req);
  if (refused) return refused;
  try {
    return json(200, currentState(dataDir));
  } catch (err) {
    console.error(`Could not read the record: ${(err as Error).message}`);
    return json(500, { error: "Could not read the record" });
  }
}

/**
 * A read route for one London day: today, or `?day=YYYY-MM-DD` (read-only; a manual check can reach
 * any day). The clock is read once here and the day passed down, so everything under `build` stays pure.
 */
async function dayRoute<P>(
  req: Request,
  load: () => Promise<P>,
  failed: string,
  build: (pack: P, day: string) => unknown,
): Promise<Response> {
  const refused = refuseForeign(req);
  if (refused) return refused;
  const asked = new URL(req.url).searchParams.get("day");
  if (asked !== null && !isDay(asked))
    return json(400, { error: "day must be YYYY-MM-DD" });
  try {
    return json(200, build(await load(), asked ?? localDay(utcNow())));
  } catch (err) {
    console.error(`${failed}: ${(err as Error).message}`);
    return json(500, { error: failed });
  }
}

/** This week's digest and last week's; `?day=` reads another week and writes nothing (src/api/digest.ts). */
function digestRoute(req: Request, dataDir: string): Response {
  const refused = refuseForeign(req);
  if (refused) return refused;
  const asked = new URL(req.url).searchParams.get("day");
  if (asked !== null && !isDay(asked))
    return json(400, { error: "day must be YYYY-MM-DD" });
  try {
    const today = localDay(utcNow());
    const r = getDigest(dataDir, asked ?? today, today);
    return json(r.status, r.body);
  } catch (err) {
    console.error(`Could not build the digest: ${(err as Error).message}`);
    return json(500, { error: "Could not build the digest" });
  }
}

/** A posted event; one that names an item is checked against the pack (src/api/event.ts). */
async function postEventRoute(
  req: Request,
  root: string,
  dataDir: string,
  topics: readonly Topic[],
  pack: CasePack | undefined,
): Promise<Response> {
  const refused = refuseForeign(req);
  if (refused) return refused;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body is not JSON" });
  }
  let loaded: CasePack;
  try {
    loaded = pack ?? (await loadPacks(root)).pack;
  } catch (err) {
    console.error(`Could not load the pack: ${(err as Error).message}`);
    return json(500, { error: "Could not save the event" });
  }
  const r = postEvent(body, dataDir, topics, utcNow, loaded);
  return json(r.status, r.body);
}

/** The start-up feed check's answer; it never rejects and times out on its own. */
async function getUpdate(
  req: Request,
  update: Promise<UpdateInfo> | undefined,
): Promise<Response> {
  const refused = refuseForeign(req);
  if (refused) return refused;
  return json(200, await (update ?? { version: VERSION, update: null }));
}

/** A read route: refuseForeign, then the handler, with a thrown read as a plain 500. */
async function readRoute(
  req: Request,
  what: string,
  handler: () =>
    | { status: number; body: unknown }
    | Promise<{ status: number; body: unknown }>,
): Promise<Response> {
  const refused = refuseForeign(req);
  if (refused) return refused;
  try {
    const r = await handler();
    return json(r.status, r.body);
  } catch (err) {
    console.error(`Could not read ${what}: ${(err as Error).message}`);
    return json(500, { error: `Could not read ${what}` });
  }
}

async function postConfigRoute(
  req: Request,
  dataDir: string,
): Promise<Response> {
  const refused = refuseForeign(req);
  if (refused) return refused;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body is not JSON" });
  }
  const r = postConfig(body, dataDir);
  return json(r.status, r.body);
}

/** One squad round. The day is always the clock's: a `?day=` is for reads only, and every write is today. */
async function postSquadRoute(
  req: Request,
  root: string,
  dataDir: string,
  pack: CasePack | undefined,
): Promise<Response> {
  const refused = refuseForeign(req);
  if (refused) return refused;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body is not JSON" });
  }
  try {
    const loaded = pack ?? (await loadPacks(root)).pack;
    const r = postSquad(body, dataDir, loaded, localDay(utcNow()));
    return json(r.status, r.body);
  } catch (err) {
    console.error(`Could not save the squad round: ${(err as Error).message}`);
    return json(500, { error: "Could not save the squad round" });
  }
}

async function postCoursesRoute(
  req: Request,
  dataDir: string,
  courses: () => Promise<readonly Course[]>,
): Promise<Response> {
  const refused = refuseForeign(req);
  if (refused) return refused;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body is not JSON" });
  }
  try {
    const r = saveCourses(body, dataDir, await courses());
    return json(r.status, r.body);
  } catch (err) {
    console.error(`Could not save the courses: ${(err as Error).message}`);
    return json(500, { error: "Could not save the courses" });
  }
}

async function postJoinRoute(req: Request, dataDir: string): Promise<Response> {
  const refused = refuseForeign(req);
  if (refused) return refused;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body is not JSON" });
  }
  try {
    const r = joinSquad(body, dataDir, localDay(utcNow()));
    return json(r.status, r.body);
  } catch (err) {
    console.error(`Could not join the squad: ${(err as Error).message}`);
    return json(500, { error: "Could not join the squad" });
  }
}

/** Bun's per-request idle limit; the server passes itself to a route handler as the second argument. */
type IdleControl = { timeout(req: Request, seconds: number): void };

async function getChatRoute(
  req: Request,
  root: string,
  dataDir: string,
  pack: CasePack | undefined,
): Promise<Response> {
  const refused = refuseForeign(req);
  if (refused) return refused;
  try {
    const loaded = pack ?? (await loadPacks(root)).pack;
    const r = getChat(dataDir, loaded, new URL(req.url).searchParams);
    return json(r.status, r.body);
  } catch (err) {
    console.error(`Could not open the item: ${(err as Error).message}`);
    return json(500, { error: "Could not open the item" });
  }
}

/** A POST that may run a model job: the idle cut is off, the body is JSON, the pack is loaded, a throw is a plain 500. */
async function postJobRoute(
  req: Request,
  server: IdleControl,
  load: () => Promise<CasePack>,
  failed: string,
  handler: (
    body: unknown,
    pack: CasePack,
  ) => Promise<{ status: number; body: unknown }>,
): Promise<Response> {
  const refused = refuseForeign(req);
  if (refused) return refused;
  // One job can take 240 s (two tries at the provider's 120 s timeout). Bun's types document a 120 s
  // idle cut; on 1.3.4 a 140 s request was not cut at the default (observed, T9 Level 4), but one was
  // at an explicit idleTimeout of 1 s. A dropped teach-back would still be saved, unseen, and resubmitted.
  server.timeout(req, 0);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body is not JSON" });
  }
  try {
    const r = await handler(body, await load());
    return json(r.status, r.body);
  } catch (err) {
    console.error(`${failed}: ${(err as Error).message}`);
    return json(500, { error: failed });
  }
}

/** A snap route on localhost: refuseForeign, the JSON body for a POST, the pack, then the handler. */
async function snapRoute(
  req: Request,
  ctx: Omit<SnapContext, "pack">,
  pack: CasePack | undefined,
  handler: (
    body: unknown,
    ctx: SnapContext,
  ) => Promise<{ status: number; body: unknown }>,
): Promise<Response> {
  const refused = refuseForeign(req);
  if (refused) return refused;
  let body: unknown;
  if (req.method === "POST") {
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Body is not JSON" });
    }
  }
  try {
    const loaded = pack ?? (await loadPacks(ctx.root)).pack;
    const r = await handler(body, { ...ctx, pack: loaded });
    return json(r.status, r.body);
  } catch (err) {
    console.error(`Could not open the photo link: ${(err as Error).message}`);
    return json(500, { error: "Could not open the photo link" });
  }
}

/** Every /api route. Exported so the key-leak test walks the same table the server serves. */
export function apiRoutes(opts: ServerOptions) {
  const { root, dataDir, topics, pack, subjects, update } = opts;
  const packs = async () =>
    pack && subjects
      ? { pack, subjects, courses: opts.courses ?? [] }
      : await loadPacks(root);
  // A route that offers topics takes the pupil's courses (offer); one that renders saved work takes all (full).
  // The profile is read per request, so a course save applies on the next one.
  const narrow = (p: CasePack, courses: readonly Course[]) =>
    filterPack(p, chosenOf(readProfile(dataDir).courses, courses), courses);
  const both = async () => {
    const l = pack
      ? { pack, courses: opts.courses ?? [] }
      : await loadPacks(root);
    return { full: l.pack, offer: narrow(l.pack, l.courses) };
  };
  const scoped = async () => (await both()).offer;
  const full = async () => pack ?? (await loadPacks(root)).pack;
  const snap = {
    root,
    dataDir,
    snaps: opts.snaps ?? createSnaps(),
    snapHost: opts.snapHost ?? (() => null),
  };
  return {
    "/api/state": { GET: (req: Request) => getState(req, dataDir) },
    "/api/case": {
      GET: (req: Request) =>
        dayRoute(req, both, "Could not build today's case", (b, day) =>
          caseForDay(dataDir, b.full, day, b.offer),
        ),
    },
    "/api/next": {
      GET: (req: Request) =>
        dayRoute(req, scoped, "Could not work out the next step", (p, day) =>
          nextForDay(dataDir, p, day),
        ),
    },
    "/api/lessons": {
      GET: async (req: Request) => {
        const loaded = await packs();
        return readRoute(req, "the lesson list", () => ({
          status: 200,
          body: lessonUrls(
            root,
            loaded.subjects,
            narrow(loaded.pack, loaded.courses).topics,
          ),
        }));
      },
    },
    "/api/topics": {
      GET: async (req: Request) => {
        const loaded = await packs();
        return readRoute(req, "the topic list", () => ({
          status: 200,
          body: topicRows(narrow(loaded.pack, loaded.courses), loaded.subjects),
        }));
      },
    },
    "/api/event": {
      POST: (req: Request) => postEventRoute(req, root, dataDir, topics, pack),
    },
    "/api/config": {
      GET: (req: Request) =>
        readRoute(req, "the settings", () => getConfig(dataDir)),
      POST: (req: Request) => postConfigRoute(req, dataDir),
    },
    "/api/courses": {
      GET: (req: Request) =>
        readRoute(req, "the courses", async () =>
          getCourses(dataDir, (await packs()).courses),
        ),
      POST: (req: Request) =>
        postCoursesRoute(req, dataDir, async () => (await packs()).courses),
    },
    "/api/usage": {
      GET: (req: Request) =>
        readRoute(req, "the token count", () => getUsage(dataDir)),
    },
    "/api/digest": { GET: (req: Request) => digestRoute(req, dataDir) },
    "/api/chat": {
      GET: (req: Request) => getChatRoute(req, root, dataDir, pack),
      POST: (req: Request, server: IdleControl) =>
        postJobRoute(req, server, full, "Could not answer the chat", (b, p) =>
          postChat(b, dataDir, p, { dataDir }),
        ),
    },
    "/api/coach": {
      GET: (req: Request) =>
        dayRoute(req, scoped, "Could not open the coach", (p, day) =>
          getCoach(dataDir, p, day, new URL(req.url).searchParams),
        ),
      POST: (req: Request, server: IdleControl) =>
        // full: it answers a question GET already offered, so a course dropped mid-question still marks (D-Q4 amended)
        postJobRoute(req, server, full, "Could not answer Dan", (b, p) =>
          postCoach(b, dataDir, p, { dataDir }),
        ),
    },
    "/api/intake/sheet": {
      POST: (req: Request, server: IdleControl) =>
        postJobRoute(req, server, scoped, "Could not read the sheet", (b, p) =>
          postSheet(b, p, { dataDir }),
        ),
    },
    "/api/intake/interview": {
      POST: (req: Request, server: IdleControl) =>
        postJobRoute(
          req,
          server,
          scoped,
          "Could not read your answers",
          (b, p) => postInterview(b, p, { dataDir }),
        ),
    },
    "/api/intake/diagnostic": {
      GET: (req: Request) =>
        dayRoute(req, scoped, "Could not build the cold test", (p, day) =>
          diagnosticForDay(dataDir, p, day),
        ),
    },
    "/api/update": { GET: (req: Request) => getUpdate(req, update) },
    "/api/instance": {
      GET: (req: Request) =>
        readRoute(req, "the instance", () => ({
          status: 200,
          body: { id: opts.instance ?? null },
        })),
    },
    "/api/squad": {
      // Only this week's view rewrites the pupil's own file: the file holds one week.
      GET: (req: Request) =>
        dayRoute(
          req,
          full,
          "Could not read the squad",
          (p, day) =>
            getSquad(
              dataDir,
              p,
              day,
              isoWeek(day) === isoWeek(localDay(utcNow())),
            ).body,
        ),
      POST: (req: Request) => postSquadRoute(req, root, dataDir, pack),
    },
    "/api/squad/join": {
      POST: (req: Request) => postJoinRoute(req, dataDir),
    },
    "/api/snap": {
      GET: (req: Request) =>
        snapRoute(req, snap, pack, async (_b, c) =>
          getSnap(new URL(req.url).searchParams.get("token"), c),
        ),
      POST: (req: Request) =>
        snapRoute(req, snap, pack, async (_b, c) => mintSnap(c)),
    },
    "/api/snap/photo": {
      POST: (req: Request) => snapRoute(req, snap, pack, postPhoto),
    },
  };
}

/** Binds 127.0.0.1 on the first free port in the list; `0` asks the OS for any free port. */
export function startServer(ports: readonly number[], opts: ServerOptions) {
  const { root } = opts;
  for (const port of ports) {
    try {
      return Bun.serve({
        hostname: "127.0.0.1",
        port,
        routes: apiRoutes(opts),
        fetch: (req) => serveStatic(req, root),
      });
    } catch (err) {
      // Windows answers with EACCES, not EADDRINUSE, for a port inside a Hyper-V or WSL
      // excluded range; step past that too. Port 0 failing is not a ladder case.
      const code = (err as { code?: string }).code;
      if (port === 0 || (code !== "EADDRINUSE" && code !== "EACCES")) throw err;
    }
  }
  throw new Error(`No free port in ${ports.join(", ")}`);
}

/**
 * `data/server.lock`: which run serves this data folder. `dir` is the folder's realpath, because an
 * update copies data/ into the new version's folder and a copied lock would otherwise point at the
 * old folder's live server. `pid` marks a crashed copy at once; otherwise the probe decides.
 */
export const LOCK_FILE = "server.lock";
type Lock = { id: string; pid: number; port: number; dir: string };

const isLock = (x: unknown): x is Lock =>
  typeof x === "object" &&
  x !== null &&
  typeof (x as Lock).id === "string" &&
  Number.isInteger((x as Lock).port) &&
  typeof (x as Lock).dir === "string";

/** Records the port this run bound once takeLock has given it the lock; replaces the port-0 lock. */
export function claimLock(dataDir: string, port: number, id: string): void {
  ensureDataDir(dataDir); // so its realpath exists
  const lock: Lock = {
    id,
    pid: process.pid,
    port,
    dir: fs.realpathSync.native(dataDir),
  };
  writeDataFile(dataDir, LOCK_FILE, `${JSON.stringify(lock)}\n`);
}

/** Removes the lock on a clean exit, only while it is still this run's: a later start may have replaced it. */
export function releaseLock(dataDir: string, id: string): void {
  const lock = readDataJson(dataDir, LOCK_FILE);
  if (isLock(lock) && lock.id === id) removeDataFile(dataDir, LOCK_FILE);
}

/** Whether `pid` has exited. Only ESRCH counts: EPERM is another account's live process. Windows: expected, not observed. */
function pidGone(pid: unknown): boolean {
  if (!Number.isInteger(pid) || (pid as number) <= 0) return false;
  try {
    process.kill(pid as number, 0);
    return false;
  } catch (err) {
    return (err as { code?: string }).code === "ESRCH";
  }
}

/** The id the server on `port` answers at /api/instance: undefined for no answer in time, null for one without an id. */
async function probeInstance(
  port: number,
  timeoutMs: number,
): Promise<string | null | undefined> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/instance`, {
      signal: AbortSignal.timeout(Math.max(1, Math.ceil(timeoutMs))),
    });
    const body = res.ok ? ((await res.json()) as { id?: unknown }) : null;
    return typeof body?.id === "string" ? body.id : null;
  } catch {
    return undefined; // nothing listening yet, or no answer in time
  }
}

const LOCK_POLL_MS = 200;

/**
 * One copy per data folder (M8), claimed before the server binds. The lock is created exclusively
 * (O_EXCL) with port 0, so of two starts at once exactly one holds it; that one binds and then
 * records its port with claimLock. A start that finds a lock waits up to `waitMs` for the copy it
 * names to answer /api/instance with the lock's id (one probe may take the whole wait, so a slow copy
 * still counts), then opens it in the browser and returns its URL. The lock is stale, and replaced,
 * at once when it names another folder (an update copies data/), a pid that has exited, or a server
 * that answers another id (or 404, before 0.1.2); and after the wait when it stays unreadable (a start
 * that crashed mid-write), stays at port 0, or nothing answers. The wait restarts whenever the lock
 * changes. Null when this run now holds the lock.
 */
export async function takeLock(
  dataDir: string,
  id: string,
  open: (url: string) => void = openBrowser,
  waitMs = 5000,
): Promise<string | null> {
  ensureDataDir(dataDir); // so its realpath exists
  const dir = fs.realpathSync.native(dataDir);
  const mine = `${JSON.stringify({ id, pid: process.pid, port: 0, dir })}\n`;
  let seen: string | undefined;
  let deadline = 0;
  for (;;) {
    if (createDataFile(dataDir, LOCK_FILE, mine)) return null;
    const lock = readDataJson(dataDir, LOCK_FILE);
    const now = performance.now();
    const key = JSON.stringify(lock);
    if (key !== seen) {
      seen = key;
      deadline = now + waitMs;
    }
    let stale = now >= deadline;
    if (!stale && isLock(lock)) {
      if (lock.dir !== dir || pidGone(lock.pid)) stale = true;
      else if (lock.port > 0) {
        const answer = await probeInstance(lock.port, deadline - now);
        if (answer === lock.id) {
          const url = `http://127.0.0.1:${lock.port}/`;
          open(url);
          return url;
        }
        if (answer !== undefined) stale = true;
      }
    }
    if (stale) {
      // Only the lock judged stale: another start may have replaced it meanwhile.
      if (JSON.stringify(readDataJson(dataDir, LOCK_FILE)) === seen)
        removeDataFile(dataDir, LOCK_FILE);
      seen = undefined;
      continue;
    }
    await Bun.sleep(LOCK_POLL_MS);
  }
}

/** Best effort: the URL is already on the console, so a missing opener is not an error. */
export function openBrowser(
  url: string,
  env: Record<string, string | undefined> = process.env,
): void {
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  try {
    Bun.spawn(cmd, { env, stdio: ["ignore", "ignore", "ignore"] });
  } catch {
    // no opener on PATH
  }
}

/**
 * Runs the replay check before anything is served: once serving, /api/state rewrites state.json and the
 * comparison is gone. False when this build would lower a saved rung. Logs to stderr: in --mcp mode
 * stdout carries JSON-RPC only.
 */
export function checkOnStart(
  dataDir: string,
  log: (line: string) => void = console.error,
): boolean {
  const result = replayCheck(dataDir);
  if (result.ok) {
    for (const line of result.changes) log(line);
    return true;
  }
  for (const line of refusalLines(result.fallen)) log(line);
  return false;
}

if (import.meta.main) {
  if (Bun.argv.includes("--version")) {
    console.log(VERSION);
    process.exit(0);
  }
  const mcp = Bun.argv.includes("--mcp");
  try {
    const root = appRoot();
    if (!fs.existsSync(path.join(root, "app", "index.html"))) {
      throw new Error(
        `no app folder in ${root}. Start the tutor from its own folder.`,
      );
    }
    const dataDir = path.join(root, "data");
    // Reads content/ only, so before the lock: the claim-to-bind window a second start waits out stays short.
    const { pack, subjects, courses } = await loadPacks(root);
    const topics = pack.topics;
    const instance = crypto.randomUUID();
    // Before anything else writes: a second double-click opens the running copy and leaves data/ alone.
    // Not in --mcp mode: the harness needs its own stdio session, and the tools write through
    // appendEvent, which is safe beside another process (O_APPEND, one write per line). --mcp claims
    // no lock either: its server ends when the harness closes stdin, and a double-click meanwhile
    // should get a copy of its own rather than one that is about to stop.
    const running = mcp ? null : await takeLock(dataDir, instance);
    if (running !== null) {
      console.log(`Study tutor is already running at ${running}`);
      process.exit(0);
    }
    // Every exit from here on, a refused replay check and Ctrl+C included, gives the lock back. A crash
    // leaves it, and the next start finds its pid gone.
    if (!mcp)
      process.on("exit", () => {
        try {
          releaseLock(dataDir, instance);
        } catch {
          // the lock stays; the next start finds it stale
        }
      });
    // Before the check: a refused start still leaves the key owner-only.
    restrictConfigOnStart(dataDir);
    if (!checkOnStart(dataDir)) process.exit(1);
    // Not in --mcp mode: a pending fetch would hold the process open after stdin closes.
    const update = mcp ? undefined : checkForUpdate(VERSION, RELEASES_FEED);
    const snaps = createSnaps();
    const server = startServer([...PORTS, 0], {
      root,
      dataDir,
      topics,
      pack,
      subjects,
      courses,
      update,
      snapHost: () => lanAddress(os.networkInterfaces()),
      snaps,
      instance,
    });
    const url = `http://127.0.0.1:${server.port}/`;
    if (mcp) {
      // stdout carries JSON-RPC only; the harness closing stdin ends the session.
      console.error(`Study tutor MCP server; lessons at ${url}`);
      const out = Bun.stdout.writer();
      await runStdio(
        Bun.stdin.stream(),
        (line) => {
          out.write(`${line}\n`);
          out.flush();
        },
        {
          root,
          dataDir,
          subjects,
          topics,
          courses,
          origin: url.slice(0, -1),
        },
      );
      await out.end(); // a stdout pipe can be asynchronous; the last reply must reach the harness
      server.stop(true); // no new snap can be minted from here on
      await snaps.closeAll(); // stops the phone listener, then waits while a photo already taken is marked
      // nothing else holds the event loop, so the process exits 0 (plan D9)
    } else {
      claimLock(dataDir, server.port ?? 0, instance);
      // Ctrl+C, a kill, or closing the console window (SIGHUP on Windows); the exit handler releases the lock.
      for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"] as const)
        process.on(signal, () => process.exit(0));
      console.log(`Study tutor is running at ${url}`);
      openBrowser(url);
    }
  } catch (err) {
    console.error(`Could not start: ${(err as Error).message}`);
    process.exit(1);
  }
}
