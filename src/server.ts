import fs from "node:fs";
import path from "node:path";
import { postEvent } from "./api/event";
import { currentState } from "./api/state";
import { loadTopics } from "./content/pack";
import type { Topic } from "./content/types";

export const PORTS = [4731, 4732, 4733, 4734, 4735] as const;

export type ServerOptions = {
  root: string;
  dataDir: string;
  topics: readonly Topic[];
};

/** The folder holding app/, content/ and data/: beside the binary when compiled, the cwd under `bun run dev`. */
export function appRoot(): string {
  // A compiled binary's modules live at /$bunfs/root (observed, macOS) or B:\~BUN\root (Windows, expected).
  const compiled = /^\/\$bunfs\/|[\\/]~BUN[\\/]/.test(import.meta.dir);
  return compiled ? path.dirname(process.execPath) : process.cwd();
}

/**
 * `/x` from app/, `/content/x` from content/. A `..` cannot escape: the path is normalised with a
 * leading slash before it is joined, so `/../x` becomes `/x` and lands under the folder.
 */
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
  const file = Bun.file(path.join(root, folder, path.normalize(`/${rel}`)));
  if (!(await file.exists())) return new Response("Not found", { status: 404 });
  return new Response(file, { headers: { "cache-control": "no-cache" } });
}

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/** Binds 127.0.0.1 on the first free port in the list; `0` asks the OS for any free port. */
export function startServer(ports: readonly number[], opts: ServerOptions) {
  const { root, dataDir, topics } = opts;
  for (const port of ports) {
    try {
      return Bun.serve({
        hostname: "127.0.0.1",
        port,
        routes: {
          "/api/state": { GET: () => json(200, currentState(dataDir)) },
          "/api/event": {
            POST: async (req) => {
              let body: unknown;
              try {
                body = await req.json();
              } catch {
                return json(400, { error: "Body is not JSON" });
              }
              const r = postEvent(body, dataDir, topics);
              return json(r.status, r.body);
            },
          },
        },
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

if (import.meta.main) {
  try {
    const root = appRoot();
    if (!fs.existsSync(path.join(root, "app", "index.html"))) {
      throw new Error(
        `no app folder in ${root}. Start the tutor from its own folder.`,
      );
    }
    const topics = await loadTopics("maths", root);
    const server = startServer([...PORTS, 0], {
      root,
      dataDir: path.join(root, "data"),
      topics,
    });
    const url = `http://127.0.0.1:${server.port}/`;
    console.log(`Study tutor is running at ${url}`);
    openBrowser(url);
  } catch (err) {
    console.error(`Could not start: ${(err as Error).message}`);
    process.exit(1);
  }
}
