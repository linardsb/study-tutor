import fs from "node:fs";
import path from "node:path";
import { caseForDay, loadCasePack } from "./api/case";
import { getConfig, getUsage, postConfig } from "./api/config";
import { postEvent } from "./api/event";
import { nextForDay } from "./api/next";
import { currentState } from "./api/state";
import { loadTopics } from "./content/pack";
import type { CasePack, Topic } from "./content/types";
import { refusalLines, replayCheck } from "./events/check";
import { isDay } from "./events/types";
import { localDay, utcNow } from "./mcp/clock";
import { runStdio } from "./mcp/server";
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
  update?: Promise<UpdateInfo>; // the start-up feed check; absent → no update
};

/** The folder holding app/, content/ and data/: beside the binary when compiled, the cwd under `bun run dev`. */
export function appRoot(): string {
  // A compiled binary's modules live at /$bunfs/root (observed, macOS) or B:\~BUN\root (Windows, expected).
  const compiled = /^\/\$bunfs\/|[\\/]~BUN[\\/]/.test(import.meta.dir);
  return compiled ? path.dirname(process.execPath) : process.cwd();
}

/**
 * The file under `root/folder` that the URL path `rel` names, or null when it names none. The URL is
 * split on `/` and joined segment by segment: a `..` or a `\` in a segment is refused outright, and
 * the join must land strictly inside the folder. Nothing is normalised first: `path.win32.normalize`
 * reads a leading `//` as a UNC root, which turned `/../data/x` into `root/data/x` (PR #26 F1).
 * `p` is the platform's `path` and is a parameter so the tests can run the Windows rules on any OS.
 */
export function staticPath(
  root: string,
  folder: string,
  rel: string,
  p: typeof path = path,
): string | null {
  const segments = rel.split("/").filter((s) => s !== "");
  if (segments.some((s) => s === ".." || s.includes("\\"))) return null;
  const base = p.join(root, folder);
  const file = p.join(base, ...segments);
  return file.startsWith(base + p.sep) ? file : null;
}

/** `/x` from app/, `/content/x` from content/. */
async function serveStatic(req: Request, root: string): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD")
    return new Response("Method not allowed", { status: 405 });
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
async function dayRoute(
  req: Request,
  root: string,
  pack: CasePack | undefined,
  failed: string,
  build: (pack: CasePack, day: string) => unknown,
): Promise<Response> {
  const refused = refuseForeign(req);
  if (refused) return refused;
  const asked = new URL(req.url).searchParams.get("day");
  if (asked !== null && !isDay(asked))
    return json(400, { error: "day must be YYYY-MM-DD" });
  try {
    const loaded = pack ?? (await loadCasePack("maths", root));
    return json(200, build(loaded, asked ?? localDay(utcNow())));
  } catch (err) {
    console.error(`${failed}: ${(err as Error).message}`);
    return json(500, { error: failed });
  }
}

async function postEventRoute(
  req: Request,
  dataDir: string,
  topics: readonly Topic[],
): Promise<Response> {
  const refused = refuseForeign(req);
  if (refused) return refused;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Body is not JSON" });
  }
  const r = postEvent(body, dataDir, topics);
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
function readRoute(
  req: Request,
  what: string,
  handler: () => { status: number; body: unknown },
): Response {
  const refused = refuseForeign(req);
  if (refused) return refused;
  try {
    const r = handler();
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

/** Every /api route. Exported so the key-leak test walks the same table the server serves. */
export function apiRoutes(opts: ServerOptions) {
  const { root, dataDir, topics, pack, update } = opts;
  return {
    "/api/state": { GET: (req: Request) => getState(req, dataDir) },
    "/api/case": {
      GET: (req: Request) =>
        dayRoute(req, root, pack, "Could not build today's case", (p, day) =>
          caseForDay(dataDir, p, day),
        ),
    },
    "/api/next": {
      GET: (req: Request) =>
        dayRoute(
          req,
          root,
          pack,
          "Could not work out the next step",
          (p, day) => nextForDay(dataDir, p, day),
        ),
    },
    "/api/event": {
      POST: (req: Request) => postEventRoute(req, dataDir, topics),
    },
    "/api/config": {
      GET: (req: Request) =>
        readRoute(req, "the settings", () => getConfig(dataDir)),
      POST: (req: Request) => postConfigRoute(req, dataDir),
    },
    "/api/usage": {
      GET: (req: Request) =>
        readRoute(req, "the token count", () => getUsage(dataDir)),
    },
    "/api/update": { GET: (req: Request) => getUpdate(req, update) },
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
    const topics = await loadTopics("maths", root);
    const dataDir = path.join(root, "data");
    const pack = await loadCasePack("maths", root);
    if (!checkOnStart(dataDir)) process.exit(1);
    // Not in --mcp mode: a pending fetch would hold the process open after stdin closes.
    const update = mcp ? undefined : checkForUpdate(VERSION, RELEASES_FEED);
    const server = startServer([...PORTS, 0], {
      root,
      dataDir,
      topics,
      pack,
      update,
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
        { root, dataDir, subject: "maths", topics, origin: url.slice(0, -1) },
      );
      await out.end(); // a stdout pipe can be asynchronous; the last reply must reach the harness
      server.stop(true); // nothing else holds the event loop, so the process exits 0 (plan D9)
    } else {
      console.log(`Study tutor is running at ${url}`);
      openBrowser(url);
    }
  } catch (err) {
    console.error(`Could not start: ${(err as Error).message}`);
    process.exit(1);
  }
}
