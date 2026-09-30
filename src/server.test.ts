import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startFakeProvider } from "../scripts/fake-provider";
import { loadCasePack, loadPacks } from "./api/case";
import { loadTopics } from "./content/pack";
import { appendEvent, PROFILE_FILE, writeDataFile } from "./events/append";
import { findItem } from "./flow/chat";
import { chooseWrong } from "./flow/coach";
import { addDays, isoWeek, localDay } from "./mcp/clock";
import {
  apiRoutes,
  claimLock,
  LOCK_FILE,
  openBrowser,
  refuseForeign,
  releaseLock,
  type ServerOptions,
  serveStatic,
  startServer,
  staticPath,
  takeLock,
} from "./server";
import { checkForUpdate, RELEASES_PAGE } from "./updates";

// The repo root: pack.test.ts reads content/maths the same way.
const root = process.cwd();
const topics = await loadTopics("maths");
const pack = await loadCasePack("maths");
// Pinned to maths: without these the server loads every content/<subject>/, and a new subject would change the counts below.
const subjects = new Map(topics.map((t) => [t.id, "maths"]));

/** A realpathed temp dir (macOS maps /var to /private/var), removed afterwards. */
function withTemp(fn: (dir: string, opts: ServerOptions) => Promise<void>) {
  return async () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-server-")),
    );
    try {
      await fn(dir, {
        root,
        dataDir: path.join(dir, "data"),
        topics,
        pack,
        subjects,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

/** One server on a free port for the test's duration. */
function withServer(
  fn: (
    get: (p: string, init?: RequestInit) => Promise<Response>,
    dir: string,
    opts: ServerOptions,
  ) => Promise<void>,
) {
  return withTemp(async (dir, opts) => {
    const server = startServer([0], opts);
    try {
      await fn(
        (p, init) => fetch(`http://127.0.0.1:${server.port}${p}`, init),
        dir,
        opts,
      );
    } finally {
      server.stop(true);
    }
  });
}

test(
  "port ladder: skips a taken port, tries the next rung, serves the page",
  withTemp(async (_dir, opts) => {
    // The OS picks the anchor, so no port in the ladder can already belong to another socket.
    const first = startServer([0], opts);
    const base = first.port ?? 0; // undefined only for a unix socket; the assertion below covers 0
    // A port the test just released: the middle rung must be free and must be the one chosen.
    const probe = startServer([0], opts);
    const free = probe.port ?? 0;
    probe.stop(true);
    let second: ReturnType<typeof startServer> | undefined;
    let last: ReturnType<typeof startServer> | undefined;
    try {
      expect(base).not.toBe(0);
      expect(free).not.toBe(0);
      second = startServer([base, free, 0], opts);
      expect(second.port).toBe(free); // rung 1 skipped, rung 2 tried before rung 3

      const page = await fetch(`http://127.0.0.1:${second.port}/`);
      expect(page.status).toBe(200);
      expect(page.headers.get("content-type")).toStartWith("text/html");
      const html = await page.text();
      expect(html).toContain("Study tutor");
      expect(html).toContain("/practice.html");
      expect(html).toContain("/case.html");
      expect(html).toContain("/map.html");

      const missing = await fetch(`http://127.0.0.1:${second.port}/nope`);
      expect(missing.status).toBe(404);

      expect(() => startServer([base], opts)).toThrow(
        `No free port in ${base}`,
      );

      last = startServer([base, 0], opts);
      expect(last.port).not.toBe(0);
      expect(last.port).not.toBe(base);
    } finally {
      first.stop(true);
      second?.stop(true);
      last?.stop(true);
    }
  }),
);

test(
  "static: app/ at / and content/ at /content/, typed by extension, no directory listing",
  withServer(async (get) => {
    const js = await get("/quiz.js");
    expect(js.status).toBe(200);
    // The rule is "typed by extension"; the charset suffix is Bun's formatting, not this code's.
    expect(js.headers.get("content-type")).toStartWith("text/javascript");
    const css = await get("/style.css");
    expect(css.status).toBe(200);
    expect(css.headers.get("content-type")).toStartWith("text/css");
    const json = await get("/content/maths/topics.json");
    expect(json.status).toBe(200);
    expect(json.headers.get("content-type")).toStartWith("application/json");
    const lesson = await get(
      "/content/maths/lessons/0001-U349-percentage-of-an-amount.html",
    );
    expect(lesson.status).toBe(200);
    const html = await lesson.text();
    expect(html).toContain(
      'data-items="/content/maths/items/1MA1-R9-of-an-amount.json"',
    );
    expect(html).not.toContain('class="q"');
    expect((await get("/content/maths/lessons/")).status).toBe(404);
    expect((await get("/practice.html")).status).toBe(200);
    expect((await get("/case.html")).status).toBe(200);
    expect((await get("/case.js")).status).toBe(200);
    for (const p of ["/map.html", "/map.js", "/retest.html", "/retest.js"])
      expect((await get(p)).status).toBe(200);
  }),
);

test(
  "static: a path that climbs out of app/ or content/ is 404, and data/ is never served",
  withServer(async (get, _dir, opts) => {
    // Every target exists on disk outside the served folder, so a raw join would serve it.
    for (const p of [
      "/../package.json",
      "/%2e%2e/package.json",
      "/..%2fpackage.json",
      "/%2e%2e%2fpackage.json",
      "/content/../package.json",
      "/content/..%2fsrc%2fserver.ts",
      "/content/..%2f..%2fpackage.json",
      "/content/maths/../../src/server.ts",
    ]) {
      expect((await get(p)).status, p).toBe(404);
    }
    fs.mkdirSync(opts.dataDir);
    fs.writeFileSync(path.join(opts.dataDir, "events.jsonl"), "{}\n");
    expect((await get("/data/events.jsonl")).status).toBe(404);
  }),
);

test("staticPath: the same guard holds under the Windows path rules, where normalise read a leading // as a UNC root (PR #26 F1)", () => {
  // Decoded `rel` for the eight traversal requests above, plus the review's own table.
  for (const p of [path.win32, path.posix]) {
    const root = p === path.win32 ? "C:\\StudyTutor" : "/StudyTutor";
    const under = (folder: string, ...rest: string[]) =>
      p.join(root, folder, ...rest);
    expect(staticPath(root, "app", "/quiz.js", p)).toBe(
      under("app", "quiz.js"),
    );
    expect(staticPath(root, "content", "/maths/topics.json", p)).toBe(
      under("content", "maths", "topics.json"),
    );
    expect(staticPath(root, "app", "/index.html", p)).toBe(
      under("app", "index.html"),
    );
    for (const rel of [
      "/../package.json",
      "/../data/events.jsonl",
      "/../../x.txt",
      "/../src/server.ts",
      "/maths/../../src/server.ts",
      "/..\\data/events.jsonl",
      "/",
      "",
    ]) {
      expect(staticPath(root, "app", rel, p), `${p.sep} ${rel}`).toBeNull();
      expect(staticPath(root, "content", rel, p), `${p.sep} ${rel}`).toBeNull();
    }
  }
});

test("staticPath: a trailing dot or space, a device name, a drive letter or a stream name is refused on every OS (Windows strips or reads them)", () => {
  for (const p of [path.win32, path.posix]) {
    const root = p === path.win32 ? "C:\\StudyTutor" : "/StudyTutor";
    for (const rel of [
      "/.. /package.json",
      "/.. ./package.json",
      "/quiz.js.",
      "/quiz.js ",
      "/con",
      "/CON",
      "/nul.json",
      "/maths/Aux.txt",
      "/com1",
      "/LPT9.html",
      "/COM0",
      "/lpt0.txt",
      "/COM\u00b9",
      "/COM\u00b2.js",
      "/com\u00b3",
      "/LPT\u00b9",
      "/LPT\u00b2",
      "/lpt\u00b3.css",
      "/CONIN$",
      "/conout$.txt",
      "/con .txt",
      "/nul  .json",
      "/maths/Aux .html",
      "/C:",
      "/C:/Windows/win.ini",
      "/x:$DATA",
      "/quiz.js::$DATA",
    ]) {
      expect(staticPath(root, "app", rel, p), `${p.sep} ${rel}`).toBeNull();
      expect(staticPath(root, "content", rel, p), `${p.sep} ${rel}`).toBeNull();
    }
    // A request carries the superscript percent-encoded; serveStatic decodes it before staticPath.
    const sup = decodeURIComponent(new URL("http://x/COM%C2%B9.js").pathname);
    expect(staticPath(root, "app", sup, p), `${p.sep} ${sup}`).toBeNull();
    // Names that only start like a device are ordinary files.
    for (const rel of [
      "/console.js",
      "/conditional.html",
      "/com10.css",
      "/conin.js",
      "/lpt\u2074.css",
    ])
      expect(staticPath(root, "app", rel, p), `${p.sep} ${rel}`).not.toBeNull();
  }
});

test(
  "static: another site cannot read content/ (an items file holds answers), by Origin or by a rebound Host",
  withServer(async (get, _dir, opts) => {
    const file = "/content/maths/items/1MA1-R9-of-an-amount.json";
    expect((await get(file)).status).toBe(200);
    const foreign = await get(file, {
      headers: { origin: "https://evil.example" },
    });
    expect(foreign.status).toBe(403);
    // Host is checked in the function: fetch does not let a test set it (DNS rebinding shape).
    const rebound = await serveStatic(
      new Request(`http://127.0.0.1:4731${file}`, {
        headers: { host: "attacker.example:4731" },
      }),
      opts.root,
    );
    expect(rebound.status).toBe(403);
    const local = await serveStatic(
      new Request(`http://127.0.0.1:4731${file}`, {
        headers: { host: "127.0.0.1:4731" },
      }),
      opts.root,
    );
    expect(local.status).toBe(200);
  }),
);

test(
  "api: a foreign Origin, a foreign Host or a non-JSON POST body is refused and nothing is written (PR #26 F3)",
  withServer(async (get, _dir, opts) => {
    const attempt = JSON.stringify({
      v: 1,
      type: "attempt",
      item: "1MA1/R9/of-an-amount#1",
      topic: "U349",
      correct: true,
      sure: true,
      answer: "9",
    });
    // The simple request a drive-by page can send without a preflight.
    const plain = await get("/api/event", {
      method: "POST",
      headers: { "content-type": "text/plain", origin: "https://evil.example" },
      body: attempt,
    });
    expect(plain.status).toBe(403);
    const typed = await get("/api/event", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: attempt,
    });
    expect(typed.status).toBe(415);
    const state = await get("/api/state", {
      headers: { origin: "https://evil.example" },
    });
    expect(state.status).toBe(403);
    expect(fs.existsSync(opts.dataDir)).toBe(false);

    // Host is checked in the function: fetch does not let a test set it (DNS rebinding shape).
    const at = (headers: Record<string, string>, method = "GET") =>
      refuseForeign(
        new Request("http://127.0.0.1:4731/api/state", { method, headers }),
      );
    expect(at({ host: "attacker.example" })?.status).toBe(403);
    expect(
      at({ host: "attacker.example", origin: "http://attacker.example" })
        ?.status,
    ).toBe(403);
    expect(
      at({ host: "127.0.0.1:4731", origin: "http://127.0.0.1:4731" }),
    ).toBeNull();
    expect(
      at({ host: "localhost:4731", origin: "http://localhost:4731" }),
    ).toBeNull();
    expect(
      at({ host: "127.0.0.1:4731", origin: "http://localhost:4731" })?.status,
    ).toBe(403);
    expect(at({ host: "127.0.0.1:4731" })).toBeNull(); // curl: no Origin
    expect(
      at(
        {
          host: "127.0.0.1:4731",
          "content-type": "application/json; charset=utf-8",
        },
        "POST",
      ),
    ).toBeNull();

    // The tutor's own page: same-origin Origin on a JSON POST is accepted.
    const own = await get("/api/event", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        origin: `http://127.0.0.1:${new URL((await get("/")).url).port}`,
      },
      body: attempt,
    });
    expect(own.status).toBe(201);
  }),
);

test(
  "api: a record that cannot be read is a JSON 500, not Bun's error page (PR #26 F6)",
  withServer(async (get, _dir, opts) => {
    fs.mkdirSync(path.join(opts.dataDir, "events.jsonl"), { recursive: true });
    const res = await get("/api/state");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Could not read the record" });
  }),
);

test(
  "methods: a POST to a file or to the GET-only state route is 405, a GET of the event route is 404",
  withServer(async (get) => {
    expect((await get("/quiz.js", { method: "POST" })).status).toBe(405);
    expect((await get("/api/state", { method: "POST" })).status).toBe(405);
    expect((await get("/api/event")).status).toBe(404);
  }),
);

test(
  "end to end: an attempt posted with a U-code lands in the log and shows in /api/state",
  withServer(async (get, _dir, opts) => {
    const post = (body: string) =>
      get("/api/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body,
      });
    const posted = await post(
      JSON.stringify({
        v: 1,
        type: "attempt",
        item: "1MA1/R9/of-an-amount#1",
        topic: "U349",
        correct: false,
        sure: true,
        answer: "4.5",
      }),
    );
    expect(posted.status).toBe(201);
    const event = (await posted.json()) as { topic: string; t: string };
    expect(event.topic).toBe("1MA1/R9/of-an-amount");

    const res = await get("/api/state");
    expect(res.status).toBe(200);
    const state = (await res.json()) as {
      confidentWrong: Record<string, { topic: string }>;
      calibration: Record<string, { sureWrong: number }>;
    };
    expect(state.confidentWrong["1MA1/R9/of-an-amount#1"]?.topic).toBe(
      "1MA1/R9/of-an-amount",
    );
    expect(state.calibration[isoWeek(localDay(event.t))]?.sureWrong).toBe(1);
    const log = path.join(opts.dataDir, "events.jsonl");
    expect(fs.readFileSync(log, "utf8").trim().split("\n")).toHaveLength(2);
    expect(fs.existsSync(path.join(opts.dataDir, "state.json"))).toBe(true);

    const refused = await post(JSON.stringify({ v: 1, type: "nope" }));
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toStartWith(
      "Refused",
    );
    expect(fs.readFileSync(log, "utf8").trim().split("\n")).toHaveLength(2);

    // An item the pack does not hold earns nothing: the route checks it against the pack.
    const unknown = await post(
      JSON.stringify({
        v: 1,
        type: "attempt",
        item: "1MA1/R4#1",
        topic: "U349",
        correct: true,
        sure: true,
        answer: "1:2",
      }),
    );
    expect(unknown.status).toBe(400);
    expect(fs.readFileSync(log, "utf8").trim().split("\n")).toHaveLength(2);

    const notJson = await post("not json");
    expect(notJson.status).toBe(400);
    expect(await notJson.json()).toEqual({ error: "Body is not JSON" });
  }),
);

test(
  "key leak: no /api route, invalid post or static path returns the saved key",
  withServer(async (get, _dir, opts) => {
    const KEY = "sk-test-SECRET-9f3a";
    const post = (p: string, body: unknown) =>
      get(p, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const saved = await post("/api/config", {
      preset: "openai",
      base_url: "https://api.openai.com/v1",
      model: "gpt-4.1-mini",
      key: KEY,
      cap: 50_000,
      weeklyTarget: 3,
    });
    expect(saved.status).toBe(200);
    expect(await saved.text()).not.toContain(KEY);
    // The save really happened, so the checks below cannot pass by there being no key to leak.
    expect(
      fs.readFileSync(path.join(opts.dataDir, "config.json"), "utf8"),
    ).toContain(KEY);

    const valid: Record<string, unknown> = {
      "/api/event": {
        v: 1,
        type: "usage",
        job: "manual",
        model: "x",
        input: 1,
        output: 1,
      },
      "/api/config": { preset: "none", weeklyTarget: 3 },
    };
    const walked: string[] = [];
    for (const [p, methods] of Object.entries(apiRoutes(opts))) {
      walked.push(p);
      const bodies: Response[] = [];
      if ("GET" in methods) bodies.push(await get(p));
      if ("POST" in methods) {
        bodies.push(await post(p, { preset: "nope", key: KEY }));
        if (p in valid) bodies.push(await post(p, valid[p]));
      }
      expect(bodies.length).toBeGreaterThan(0);
      for (const res of bodies) expect(await res.text()).not.toContain(KEY);
      // The valid "none" save cleared the key; put it back for the next route.
      if (p === "/api/config")
        await post("/api/config", {
          preset: "openai",
          base_url: "https://api.openai.com/v1",
          model: "gpt-4.1-mini",
          key: KEY,
          cap: 50_000,
          weeklyTarget: 3,
        });
    }
    expect(walked).toEqual(Object.keys(apiRoutes(opts)));

    for (const p of ["/setup.html", "/setup.js", "/data/config.json"]) {
      const res = await get(p);
      expect(await res.text()).not.toContain(KEY);
      if (p === "/data/config.json") expect(res.status).toBe(404);
    }
    expect(
      fs.readFileSync(path.join(opts.dataDir, "config.json"), "utf8"),
    ).toContain(KEY);
  }),
);

test(
  "api: /api/case gives today's case with its options and no answers key, takes ?day=, refuses a bad day and a foreign Origin",
  withServer(async (get) => {
    const today = await get("/api/case");
    expect(today.status).toBe(200);
    const body = (await today.json()) as {
      day: string;
      case: { options: string[] } & Record<string, unknown>;
    };
    expect(body.day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.case.options.length).toBeGreaterThanOrEqual(2);
    expect(body.case).not.toHaveProperty("answers");
    const asked = await get("/api/case?day=2026-10-09");
    expect(asked.status).toBe(200);
    expect(((await asked.json()) as { day: string }).day).toBe("2026-10-09");
    expect((await get("/api/case?day=2026-02-30")).status).toBe(400);
    // An invalid Date, not a rolled one: toISOString threw and the route was a 500 (PR #31 F2).
    expect((await get("/api/case?day=2026-13-01")).status).toBe(400);
    expect((await get("/api/case?day=today")).status).toBe(400);
    const badDay = await get("/api/event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        v: 1,
        type: "case",
        day: "2026-13-01",
        kind: "rule",
        topic: "1MA1/A12",
        pick: "x",
        bet: 1,
        correct: true,
        reask: false,
      }),
    });
    expect(badDay.status).toBe(400);
    const foreign = await get("/api/case", {
      headers: { origin: "https://evil.example" },
    });
    expect(foreign.status).toBe(403);
  }),
);

test(
  "api: /api/digest gives this week and last week, takes ?day=, refuses a bad day and a foreign Origin",
  withServer(async (get) => {
    const asked = await get("/api/digest?day=2026-11-15");
    expect(asked.status).toBe(200);
    const body = (await asked.json()) as {
      now: { week: string };
      last: { week: string };
    };
    expect(body.now.week).toBe("2026-W46");
    expect(body.last.week).toBe("2026-W45");
    expect((await get("/api/digest")).status).toBe(200);
    expect((await get("/api/digest?day=2026-13-01")).status).toBe(400);
    expect((await get("/api/digest?day=today")).status).toBe(400);
    const foreign = await get("/api/digest", {
      headers: { origin: "https://evil.example" },
    });
    expect(foreign.status).toBe(403);
  }),
);

test(
  "api: /api/next gives a lesson on an empty record, takes ?day=, refuses a bad day and a foreign Origin",
  withServer(async (get, _dir, opts) => {
    type NextBody = {
      day: string;
      flame: { week: string; days: number; target: number };
      step: { kind: string; topic?: string };
    };
    const empty = await get("/api/next?day=2026-10-10");
    expect(empty.status).toBe(200);
    const body = (await empty.json()) as NextBody;
    expect(body.day).toBe("2026-10-10");
    expect(body.step).toMatchObject({
      kind: "lesson",
      topic: "1MA1/R9/of-an-amount",
    });
    expect(body.flame).toEqual({ week: "2026-W41", days: 0, target: 3 });
    expect((await get("/api/next")).status).toBe(200);
    expect((await get("/api/next?day=2026-02-30")).status).toBe(400);
    expect((await get("/api/next?day=today")).status).toBe(400);
    const foreign = await get("/api/next", {
      headers: { origin: "https://evil.example" },
    });
    expect(foreign.status).toBe(403);

    appendEvent(opts.dataDir, {
      v: 1,
      type: "intake",
      door: "sheet",
      topics: [{ topic: "1MA1/P8", rag: "R" }],
    });
    const red = (await (
      await get("/api/next?day=2026-10-10")
    ).json()) as NextBody;
    expect(red.step).toMatchObject({ kind: "lesson", topic: "1MA1/P8" });
  }),
);

test(
  "api: /api/lessons gives a lesson URL per topic that the server serves, and refuses a foreign Origin",
  withServer(async (get, _dir, opts) => {
    const res = await get("/api/lessons");
    expect(res.status).toBe(200);
    const urls = (await res.json()) as Record<string, string>;
    expect(Object.keys(urls)).toHaveLength(21); // observed: the 21 v1 lessons; Year 11 rows have none yet
    const first = urls[opts.topics[0]?.id as string] as string;
    const lesson = await get(first);
    expect(lesson.status).toBe(200);
    expect(await lesson.text()).toContain("data-items=");
    const foreign = await get("/api/lessons", {
      headers: { origin: "https://evil.example" },
    });
    expect(foreign.status).toBe(403);
  }),
);

test(
  "api: /api/topics gives every topic with its subject, and refuses a foreign Origin",
  withServer(async (get) => {
    const res = await get("/api/topics");
    expect(res.status).toBe(200);
    const rows = (await res.json()) as Array<{ id: string; subject: string }>;
    expect(rows).toHaveLength(58); // derived: 21 + 37 Year 11 rows (a3 plan)
    expect(rows.every((r) => r.subject === "maths")).toBe(true);
    expect(rows[0]).toMatchObject({
      id: topics[0]?.id,
      aliases: topics[0]?.aliases,
    });
    const foreign = await get("/api/topics", {
      headers: { origin: "https://evil.example" },
    });
    expect(foreign.status).toBe(403);
  }),
);

type LoopNext = {
  step: {
    kind: string;
    mode?: string;
    topic?: string;
    start?: unknown;
    end?: unknown;
    boss?: { seed: number; topics: string[]; slots: unknown[] };
  };
};
type LoopState = {
  topics: Record<string, { rung: number; nextDue: string | null }>;
  xp: { total: number };
  session: unknown;
};

test(
  "loop: lesson start and end from /api/next, a boss three days on, retest and end; the rung and next-due move, and a wrong passed is refused",
  withServer(async (get, _dir, opts) => {
    const post = async (body: unknown) =>
      get("/api/event", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
    const next = async (q = "") =>
      (await (await get(`/api/next${q}`)).json()) as LoopNext;
    const state = async () =>
      (await (await get("/api/state")).json()) as LoopState;
    const first = opts.topics[0]?.id as string;
    const title = opts.topics[0]?.title as string;

    // 1: the map starts the lesson with the served body
    const n1 = await next();
    expect(n1.step).toMatchObject({ kind: "lesson", topic: first });
    expect((await post(n1.step.start)).status).toBe(201);

    // 2: Done with it posts the served end; the topic is learning and due in 3 days
    const n2 = await next();
    expect(n2.step).toMatchObject({ kind: "continue", mode: "lesson" });
    const ended = await post(n2.step.end);
    expect(ended.status).toBe(201);
    const d0 = localDay(((await ended.json()) as { t: string }).t);
    expect((await state()).topics[first]).toEqual({
      rung: 1,
      nextDue: addDays(d0, 3),
      rag: null,
    } as never);

    // 3: three days on, the boss, with no answer and no title in it
    const d3 = addDays(d0, 3);
    const n3 = await next(`?day=${d3}`);
    expect(n3.step.kind).toBe("boss");
    expect(n3.step.boss?.topics).toEqual([first]);
    expect(n3.step.boss?.slots).toHaveLength(3);
    expect(JSON.stringify(n3)).not.toContain('"answers"');
    expect(JSON.stringify(n3)).not.toContain(title);

    // 4: a reload mid-boss. A session is open for the day it was started on (openToday), so under
    // ?day= the same boss simply re-forms; on the real day the open boss carries no boss, and its
    // end re-forms the same boss.
    // Steps 4 and 5 read the `continue` from the real day because a session opens on the day of its
    // own `t`, which the server stamps: `?day=` cannot pin it. The one test here that fails if
    // London midnight passes between a `start` post and the `next()` after it.
    expect((await post(n3.step.start)).status).toBe(201);
    const again = await next(`?day=${d3}`);
    expect(again.step.kind).toBe("boss");
    expect(again.step.boss?.slots).toEqual(n3.step.boss?.slots as never);
    const open = await next();
    expect(open.step).toMatchObject({ kind: "continue", mode: "boss" });
    expect(open.step).not.toHaveProperty("boss");
    expect((await post(open.step.end)).status).toBe(201);
    expect((await next(`?day=${d3}`)).step.boss?.slots).toEqual(
      n3.step.boss?.slots as never,
    );

    // 5: the boss page posts start, one retest with the boss seed, then the served end
    expect((await post(n3.step.start)).status).toBe(201);
    const retest = {
      v: 1,
      type: "retest",
      topic: first,
      score: 3,
      of: 3,
      passed: true,
      seed: n3.step.boss?.seed,
    };
    const r = await post(retest);
    expect(r.status).toBe(201);
    const d1 = localDay(((await r.json()) as { t: string }).t);
    const afterRetest = await next();
    expect(afterRetest.step).toMatchObject({ kind: "continue", mode: "boss" });
    expect((await post(afterRetest.step.end)).status).toBe(201);

    // 6: the map shows the new rung; the topic is no longer due, so the next step is a new lesson
    const s = await state();
    expect(s.topics[first]).toEqual({
      rung: 2,
      nextDue: addDays(d1, 10),
      rag: null,
    } as never);
    expect(s.xp.total).toBe(20);
    expect(s.session).toBeNull();
    expect((await next(`?day=${d3}`)).step).toMatchObject({
      kind: "lesson",
      topic: opts.topics[1]?.id,
    });

    // 7: a passed that disagrees with the score is refused
    const wrong = await post({ ...retest, score: 1, passed: true });
    expect(wrong.status).toBe(400);
    expect(((await wrong.json()) as { error: string }).error).toStartWith(
      "Refused: passed",
    );
  }),
);

test(
  "openBrowser does not throw when no opener is on PATH",
  withTemp(async (dir) => {
    expect(() =>
      openBrowser("http://127.0.0.1:1/", { PATH: dir }),
    ).not.toThrow();
  }),
);

/** A JSON POST to the tutor's API from its own page. */
const postJson =
  (get: (p: string, init?: RequestInit) => Promise<Response>) =>
  (p: string, body: unknown) =>
    get(p, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

test(
  "api: /api/chat with no model answers a hint with the lesson's own hint",
  withServer(async (get) => {
    const post = postJson(get);
    expect(
      (await post("/api/config", { preset: "none", weeklyTarget: 3 })).status,
    ).toBe(200);
    const res = await post("/api/chat", {
      job: "hint",
      item: "1MA1/R9/of-an-amount#1",
      text: "not sure",
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      kind: "text",
      by: "fallback",
      text: "20% is two lots of 10%.",
    });
  }),
);

test(
  "api: /api/chat end to end through the real provider module and a fake provider",
  withServer(async (get, _dir, opts) => {
    const fake = startFakeProvider({ mode: "valid" });
    try {
      const post = postJson(get);
      const saved = await post("/api/config", {
        preset: "custom",
        base_url: fake.url,
        model: "fake",
        key: "",
        cap: 50_000,
        weeklyTarget: 3,
      });
      expect(saved.status).toBe(200);
      const id = "1MA1/R9/of-an-amount#1";
      appendEvent(opts.dataDir, {
        v: 1,
        type: "attempt",
        item: id,
        topic: "1MA1/R9/of-an-amount",
        correct: true,
        sure: true,
        answer: "9",
      });
      const marked = await post("/api/chat", {
        job: "teachback_mark",
        item: id,
        text: "Find 10% of 45\nDouble it",
      });
      expect(marked.status).toBe(200);
      expect(await marked.json()).toMatchObject({
        kind: "marks",
        score: 2,
        of: 2,
        saved: true,
      });
      const types = fs
        .readFileSync(path.join(opts.dataDir, "events.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((l) => JSON.parse(l) as { type: string; amount?: number });
      expect(types.map((e) => e.type)).toEqual([
        "attempt",
        "usage",
        "teachback",
        "xp",
      ]);
      expect(types[3]?.amount).toBe(15);

      const hinted = await post("/api/chat", {
        job: "hint",
        item: "1MA1/R9/of-an-amount#2",
        text: "not sure",
      });
      expect(await hinted.json()).toEqual({
        kind: "text",
        by: "model",
        text: "Start with 10%.",
      });
    } finally {
      fake.stop();
    }
  }),
);

test(
  "api: /api/coach end to end: attempt on the topic, GET, dan by the model, correct saves attempt, xp and coach",
  withServer(async (get, _dir, opts) => {
    const fake = startFakeProvider({ mode: "valid" });
    try {
      const post = postJson(get);
      const saved = await post("/api/config", {
        preset: "custom",
        base_url: fake.url,
        model: "fake",
        key: "",
        cap: 50_000,
        weeklyTarget: 3,
      });
      expect(saved.status).toBe(200);
      const topic = "1MA1/R9/of-an-amount";
      appendEvent(opts.dataDir, {
        v: 1,
        type: "attempt",
        item: `${topic}#1`,
        topic,
        correct: true,
        sure: true,
        answer: "9",
      });
      const opened = await get(`/api/coach?${new URLSearchParams({ topic })}`);
      expect(opened.status).toBe(200);
      const text = await opened.text();
      expect(text).not.toContain('"answers"');
      const q = JSON.parse(text) as {
        ready: boolean;
        item: string;
        seed: number;
      };
      expect(q.ready).toBe(true);
      const item = findItem(pack, q.item, q.seed);
      if (item === null) throw new Error("no item");
      const wrong = chooseWrong(item)?.answer as string;

      const dan = await post("/api/coach", {
        step: "dan",
        item: q.item,
        seed: q.seed,
      });
      expect(dan.status).toBe(200);
      const lines = (await dan.json()) as { by: string; lines: string[] };
      expect(lines.by).toBe("model");
      expect(lines.lines.join(" ")).toContain(wrong);

      const marked = await post("/api/coach", {
        step: "correct",
        item: q.item,
        seed: q.seed,
        answer: item.answers?.[0],
        sure: true,
      });
      expect(marked.status).toBe(200);
      expect(await marked.json()).toMatchObject({ caught: true, saved: true });
      const types = fs
        .readFileSync(path.join(opts.dataDir, "events.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((l) => (JSON.parse(l) as { type: string }).type);
      expect(types).toEqual(["attempt", "usage", "attempt", "xp", "coach"]);
    } finally {
      fake.stop();
    }
  }),
);

test(
  "api: /api/coach with no model: dan is the fallback line and no usage line is written",
  withServer(async (get, _dir, opts) => {
    const post = postJson(get);
    expect(
      (await post("/api/config", { preset: "none", weeklyTarget: 3 })).status,
    ).toBe(200);
    const topic = "1MA1/R9/of-an-amount";
    appendEvent(opts.dataDir, {
      v: 1,
      type: "attempt",
      item: `${topic}#1`,
      topic,
      correct: true,
      sure: true,
      answer: "9",
    });
    const q = (await (
      await get(`/api/coach?${new URLSearchParams({ topic })}`)
    ).json()) as { item: string; seed: number };
    const dan = await post("/api/coach", {
      step: "dan",
      item: q.item,
      seed: q.seed,
    });
    expect(dan.status).toBe(200);
    expect(await dan.json()).toMatchObject({ kind: "dan", by: "fallback" });
    const types = fs
      .readFileSync(path.join(opts.dataDir, "events.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((l) => (JSON.parse(l) as { type: string }).type);
    expect(types).toEqual(["attempt"]);
  }),
);

test(
  "api: /api/update is dev with no update when no check ran, and answers the check's result",
  withTemp(async (_dir, opts) => {
    const plain = startServer([0], opts);
    const url = `${RELEASES_PAGE}tag/v0.2.0`;
    const found = startServer([0], {
      ...opts,
      update: Promise.resolve({
        version: "0.1.0",
        update: { version: "0.2.0", url },
      }),
    });
    try {
      const a = await fetch(`http://127.0.0.1:${plain.port}/api/update`);
      expect(a.status).toBe(200);
      expect(await a.json()).toEqual({ version: "dev", update: null });
      const b = await fetch(`http://127.0.0.1:${found.port}/api/update`);
      expect(await b.json()).toEqual({
        version: "0.1.0",
        update: { version: "0.2.0", url },
      });
      const foreign = await fetch(`http://127.0.0.1:${found.port}/api/update`, {
        headers: { origin: "https://evil.example" },
      });
      expect(foreign.status).toBe(403);
    } finally {
      plain.stop(true);
      found.stop(true);
    }
  }),
);

test("chat.html holds 'This is an AI' in static markup, outside every region the script fills", () => {
  const html = fs.readFileSync(path.join(root, "app", "chat.html"), "utf8");
  const note = html.indexOf("This is an AI");
  expect(note).toBeGreaterThan(-1);
  for (const id of ["item", "before", "after", "log"]) {
    const at = html.indexOf(`id="${id}"`);
    expect({ id, found: at > -1 }).toEqual({ id, found: true });
    expect({ id, noteFirst: note < at }).toEqual({ id, noteFirst: true });
  }
  expect(html).toMatch(/\.ai-note\s*\{[^}]*position:\s*sticky/);
});

test("snap.html holds 'This is an AI' in static markup, before the item and the result", () => {
  const html = fs.readFileSync(path.join(root, "app", "snap.html"), "utf8");
  const note = html.indexOf("This is an AI");
  expect(note).toBeGreaterThan(-1);
  for (const id of ["item", "snap-form", "result"]) {
    const at = html.indexOf(`id="${id}"`);
    expect({ id, found: at > -1 }).toEqual({ id, found: true });
    expect({ id, noteFirst: note < at }).toEqual({ id, noteFirst: true });
  }
  expect(html).toMatch(/\.ai-note\s*\{[^}]*position:\s*sticky/);
});

test(
  "api: a feed that hangs does not hold up other routes, and /api/update ends as no update",
  withTemp(async (_dir, opts) => {
    const feed = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Promise<Response>(() => {}),
    });
    let settled = false;
    const update = checkForUpdate(
      "0.1.0",
      `http://127.0.0.1:${feed.port}/`,
      fetch,
      300,
    ).finally(() => {
      settled = true;
    });
    const server = startServer([0], { ...opts, update });
    try {
      const state = await fetch(`http://127.0.0.1:${server.port}/api/state`);
      expect(state.status).toBe(200);
      expect(settled).toBe(false);
      const res = await fetch(`http://127.0.0.1:${server.port}/api/update`);
      expect(await res.json()).toEqual({ version: "0.1.0", update: null });
      expect(settled).toBe(true);
    } finally {
      server.stop(true);
      feed.stop(true);
    }
  }),
);

/** Writes a lock file by hand: the shapes a crash or a mid-write leaves. */
function plantLock(dataDir: string, text: string) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, LOCK_FILE), text);
}
const lockOf = (dataDir: string) =>
  JSON.parse(fs.readFileSync(path.join(dataDir, LOCK_FILE), "utf8"));
const neverOpen = () => {
  throw new Error("opened a stale instance");
};

test(
  "one copy per data folder: a second start on the same data/ opens the running one and does not serve",
  withTemp(async (_dir, opts) => {
    const opened: string[] = [];
    expect(await takeLock(opts.dataDir, "run-1", neverOpen)).toBe(null);
    const server = startServer([0], { ...opts, instance: "run-1" });
    try {
      claimLock(opts.dataDir, server.port ?? 0, "run-1");
      const url = `http://127.0.0.1:${server.port}/`;
      expect(await takeLock(opts.dataDir, "run-2", (u) => opened.push(u))).toBe(
        url,
      );
      expect(opened).toEqual([url]);
      expect(lockOf(opts.dataDir).id).toBe("run-1");
    } finally {
      server.stop(true);
    }
  }),
);

test(
  "one copy per data folder: two starts at once on one data/ (two processes) serve once; the other opens it (M8)",
  withTemp(async (dir, opts) => {
    const script = path.join(dir, "start.ts");
    // A stand-in for main: claim, a load time, bind, record the port, then stay up while the other probes.
    fs.writeFileSync(
      script,
      `import { claimLock, startServer, takeLock } from ${JSON.stringify(path.join(root, "src", "server.ts"))};
const [dataDir, id, root] = Bun.argv.slice(2);
const url = await takeLock(dataDir, id, (u) => console.log("opened " + u), 4000);
if (url !== null) process.exit(0);
await Bun.sleep(300);
const s = startServer([0], { root, dataDir, topics: [], instance: id });
claimLock(dataDir, s.port ?? 0, id);
console.log("served http://127.0.0.1:" + s.port + "/");
await Bun.sleep(2500);
s.stop(true);
`,
    );
    const run = (id: string) =>
      Bun.spawn([process.execPath, script, opts.dataDir, id, root], {
        stdout: "pipe",
        stderr: "inherit",
      });
    const procs = [run("a"), run("b")];
    const out = await Promise.all(
      procs.map(async (p) => {
        const text = await new Response(p.stdout).text();
        await p.exited;
        return text.trim();
      }),
    );
    const served = out.filter((o) => o.startsWith("served "));
    const opened = out.filter((o) => o.startsWith("opened "));
    expect(served, out.join(" | ")).toHaveLength(1);
    expect(opened, out.join(" | ")).toHaveLength(1);
    expect(opened[0]?.slice("opened ".length)).toBe(
      served[0]?.slice("served ".length),
    );
  }),
  15000,
);

test(
  "one copy per data folder: a running copy slower to answer than a second is still deferred to (M8)",
  withTemp(async (_dir, opts) => {
    const slow = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: async () => {
        await Bun.sleep(1500);
        return Response.json({ id: "slow" });
      },
    });
    try {
      claimLock(opts.dataDir, slow.port ?? 0, "slow");
      const opened: string[] = [];
      const url = `http://127.0.0.1:${slow.port}/`;
      expect(
        await takeLock(opts.dataDir, "me", (u) => opened.push(u), 3000),
      ).toBe(url);
      expect(opened).toEqual([url]);
      expect(lockOf(opts.dataDir).id).toBe("slow");
    } finally {
      slow.stop(true);
    }
  }),
  10000,
);

test(
  "one copy per data folder: a busy port serving another data/ is not attached to; the start takes the next port",
  withTemp(async (dir, opts) => {
    const other = { ...opts, dataDir: path.join(dir, "other-data") };
    const running = startServer([0], { ...other, instance: "other" });
    let mine: ReturnType<typeof startServer> | undefined;
    try {
      claimLock(other.dataDir, running.port ?? 0, "other");
      // The other folder's lock copied in (an update copies data/): its dir is not this one, so it is replaced.
      fs.mkdirSync(opts.dataDir);
      fs.copyFileSync(
        path.join(other.dataDir, LOCK_FILE),
        path.join(opts.dataDir, LOCK_FILE),
      );
      expect(await takeLock(opts.dataDir, "mine", neverOpen)).toBe(null);
      expect(lockOf(opts.dataDir)).toMatchObject({ id: "mine", port: 0 });
      mine = startServer([running.port ?? 0, 0], { ...opts, instance: "mine" });
      expect(mine.port).not.toBe(running.port);
    } finally {
      running.stop(true);
      mine?.stop(true);
    }
  }),
);

test(
  "one copy per data folder: a stale lock is replaced (dead pid at once; no answer, another id or an unreadable lock after the wait)",
  withTemp(async (_dir, opts) => {
    const gone = startServer([0], opts);
    const port = gone.port ?? 0;
    gone.stop(true);
    fs.mkdirSync(opts.dataDir, { recursive: true });
    const dir = fs.realpathSync.native(opts.dataDir);
    // A crashed copy: its pid has exited. Replaced without waiting out the budget.
    const dead = Bun.spawn([process.execPath, "-e", ""]);
    await dead.exited;
    plantLock(
      opts.dataDir,
      JSON.stringify({ id: "dead", pid: dead.pid, port, dir }),
    );
    const t0 = performance.now();
    expect(await takeLock(opts.dataDir, "new-1", neverOpen, 5000)).toBe(null);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(lockOf(opts.dataDir)).toMatchObject({
      id: "new-1",
      pid: process.pid,
      port: 0,
    });
    // A live pid (a reused one) but nothing listening on the lock's port: replaced after the wait.
    claimLock(opts.dataDir, port, "quiet");
    expect(await takeLock(opts.dataDir, "new-2", neverOpen, 300)).toBe(null);
    expect(lockOf(opts.dataDir).id).toBe("new-2");
    // A server on the lock's port that answers another id (an old copy, or 4731 of another folder).
    const live = startServer([0], { ...opts, instance: "someone-else" });
    try {
      claimLock(opts.dataDir, live.port ?? 0, "dead");
      expect(await takeLock(opts.dataDir, "new-3", neverOpen, 5000)).toBe(null);
      expect(lockOf(opts.dataDir).id).toBe("new-3");
    } finally {
      live.stop(true);
    }
    // An empty lock (a start that crashed between create and write): replaced after the wait.
    plantLock(opts.dataDir, "");
    expect(await takeLock(opts.dataDir, "new-4", neverOpen, 300)).toBe(null);
    expect(lockOf(opts.dataDir).id).toBe("new-4");
    // A clean exit removes its own lock only.
    releaseLock(opts.dataDir, "dead");
    expect(fs.existsSync(path.join(opts.dataDir, LOCK_FILE))).toBe(true);
    releaseLock(opts.dataDir, "new-4");
    expect(fs.existsSync(path.join(opts.dataDir, LOCK_FILE))).toBe(false);
    releaseLock(opts.dataDir, "new-4"); // no lock: nothing to do
  }),
);

test(
  "/api/instance answers the tutor's own pages only",
  withTemp(async (_dir, opts) => {
    const server = startServer([0], { ...opts, instance: "run-2" });
    try {
      const url = `http://127.0.0.1:${server.port}/api/instance`;
      expect(await (await fetch(url)).json()).toEqual({ id: "run-2" });
      const foreign = await fetch(url, {
        headers: { origin: "https://evil.example" },
      });
      expect(foreign.status).toBe(403);
    } finally {
      server.stop(true);
    }
  }),
);

/** A server over the packs under `packRoot`, with courses, and an empty data/ in a temp dir. */
function withPacks(
  packRoot: () => string,
  fn: (
    get: (p: string, init?: RequestInit) => Promise<Response>,
    opts: ServerOptions,
  ) => Promise<void>,
) {
  return withTemp(async (_dir, base) => {
    const l = await loadPacks(packRoot());
    const opts: ServerOptions = {
      root: packRoot(),
      dataDir: base.dataDir,
      topics: l.pack.topics,
      pack: l.pack,
      subjects: l.subjects,
      courses: l.courses,
    };
    const server = startServer([0], opts);
    try {
      await fn(
        (p, init) => fetch(`http://127.0.0.1:${server.port}${p}`, init),
        opts,
      );
    } finally {
      server.stop(true);
    }
  });
}

const topicIds = async (get: (p: string) => Promise<Response>) =>
  ((await (await get("/api/topics")).json()) as { id: string }[]).map(
    (t) => t.id,
  );

test(
  "courses: a Foundation maths save narrows topics, lessons, next and the cold test; without a save all 93 show",
  withPacks(
    () => root,
    async (get) => {
      const post = postJson(get);
      expect(await topicIds(get)).toHaveLength(93); // derived: 58 maths + 20 science + 15 english (a3 plan)
      const lessons = async () =>
        Object.values(
          (await (await get("/api/lessons")).json()) as Record<string, string>,
        );
      expect(
        (await lessons()).some((u) => u.includes("content/science/")),
      ).toBe(true);
      const got = (await (await get("/api/courses")).json()) as {
        courses: { spec: string }[];
        chosen: unknown[];
      };
      expect(got.chosen).toEqual([]);
      expect(got.courses.map((c) => c.spec)).toEqual([
        "8700",
        "8702",
        "1MA1",
        "8464",
      ]);

      const saved = await post("/api/courses", {
        courses: [{ spec: "1MA1", tier: "F" }],
      });
      expect(saved.status).toBe(200);
      expect(await saved.json()).toEqual({
        chosen: [{ spec: "1MA1", tier: "F" }],
      });
      const ids = await topicIds(get);
      expect(ids).toHaveLength(38); // derived: 21 + 17 Foundation Year 11 rows (a3 plan)
      expect(ids.some((id) => id.startsWith("8464/"))).toBe(false);
      expect(
        (await lessons()).some((u) => u.includes("content/science/")),
      ).toBe(false);

      const refused = await post("/api/courses", { courses: [] });
      expect(refused.status).toBe(400);
      expect(await refused.json()).toEqual({
        error: "Pick at least one course.",
      });
      expect(await topicIds(get)).toHaveLength(38);

      // Science only: maths comes first in pack order, so next and the cold test show the filter.
      await post("/api/courses", { courses: [{ spec: "8464", tier: "F" }] });
      expect(
        ((await (await get("/api/next")).json()) as { step: unknown }).step,
      ).toMatchObject({ kind: "lesson", topic: "8464/4.1.1.2" });
      const cold = (await (await get("/api/intake/diagnostic")).json()) as {
        slots: { topic: string }[];
      };
      expect(cold.slots.length).toBeGreaterThan(0);
      expect(cold.slots.every((s) => s.topic.startsWith("8464/"))).toBe(true);
    },
  ),
);

test(
  "courses: a case saved today on a dropped course still renders from the full pack",
  withPacks(
    () => root,
    async (get, opts) => {
      appendEvent(
        opts.dataDir,
        {
          v: 1,
          type: "case",
          day: "2026-10-06",
          kind: "mistake",
          topic: "8464/4.1.1.2",
          item: "8464/4.1.1.2#1",
          pick: "cytoplasm",
          bet: 2,
          correct: false,
          reask: false,
        },
        () => "2026-10-06T07:12:00Z",
      );
      await postJson(get)("/api/courses", {
        courses: [{ spec: "1MA1", tier: "F" }],
      });
      const r = (await (await get("/api/case?day=2026-10-06")).json()) as {
        case: unknown;
        source: { topic: string };
      };
      expect(r.case).not.toBeNull();
      expect(r.source.topic).toBe("8464/4.1.1.2");
    },
  ),
);

test(
  "courses: the coach offers and accepts only the chosen courses' topics",
  withPacks(
    () => root,
    async (get, opts) => {
      appendEvent(opts.dataDir, {
        v: 1,
        type: "attempt",
        item: "1MA1/R9/of-an-amount#1",
        topic: "1MA1/R9/of-an-amount",
        correct: true,
        sure: true,
        answer: "9",
      });
      const coachTopics = async () =>
        JSON.stringify(
          ((await (await get("/api/coach")).json()) as { topics: unknown })
            .topics,
        );
      expect(await coachTopics()).toContain("1MA1/R9/of-an-amount");
      await postJson(get)("/api/courses", {
        courses: [{ spec: "8464", tier: "F" }],
      });
      expect(await coachTopics()).not.toContain("1MA1/");
      expect(await (await get("/api/coach?topic=1MA1/R4")).json()).toEqual({
        ready: false,
        reason: "no-topic",
      });
    },
  ),
);

test(
  "courses: coach POST still marks a question offered before its course was dropped",
  withPacks(
    () => root,
    async (get, opts) => {
      const post = postJson(get);
      await post("/api/config", { preset: "none", weeklyTarget: 3 });
      const topic = "1MA1/R9/of-an-amount";
      appendEvent(opts.dataDir, {
        v: 1,
        type: "attempt",
        item: `${topic}#1`,
        topic,
        correct: true,
        sure: true,
        answer: "9",
      });
      const q = (await (
        await get(`/api/coach?${new URLSearchParams({ topic })}`)
      ).json()) as { item: string; seed: number };
      const item = findItem(pack, q.item, q.seed);
      if (item === null) throw new Error("no item");
      await post("/api/courses", { courses: [{ spec: "8464", tier: "F" }] });
      const marked = await post("/api/coach", {
        step: "correct",
        item: q.item,
        seed: q.seed,
        answer: item.answers?.[0],
        sure: true,
      });
      expect(marked.status).toBe(200);
      expect(await marked.json()).toMatchObject({ saved: true });
    },
  ),
);

test(
  "courses: a pack that fails to load answers 500 with an error body on GET and POST",
  withTemp(async (dir, base) => {
    fs.mkdirSync(path.join(dir, "content", "x"), { recursive: true });
    fs.writeFileSync(path.join(dir, "content", "x", "topics.json"), "[]");
    fs.writeFileSync(path.join(dir, "content", "x", "courses.json"), "{");
    const server = startServer([0], {
      root: dir,
      dataDir: base.dataDir,
      topics: [],
    });
    try {
      const url = `http://127.0.0.1:${server.port}/api/courses`;
      const got = await fetch(url);
      expect(got.status).toBe(500);
      expect(await got.json()).toEqual({ error: "Could not read the courses" });
      const saved = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ courses: [{ spec: "1MA1" }] }),
      });
      expect(saved.status).toBe(500);
      expect(await saved.json()).toEqual({
        error: "Could not save the courses",
      });
    } finally {
      server.stop(true);
    }
  }),
);

test(
  "courses: a stale spec in profile.json is dropped, leaving every topic",
  withPacks(
    () => root,
    async (get, opts) => {
      writeDataFile(
        opts.dataDir,
        PROFILE_FILE,
        JSON.stringify({ weeklyTarget: 3, courses: [{ spec: "ZZZ9" }] }),
      );
      expect(await topicIds(get)).toHaveLength(93);
      expect(
        ((await (await get("/api/courses")).json()) as { chosen: unknown })
          .chosen,
      ).toEqual([]);
    },
  ),
);

test(
  "courses over the real packs: a fresh pupil skips rows with no items; English alone offers nothing; the maths tier and English mix",
  withPacks(
    () => root,
    async (get, opts) => {
      const step = async () =>
        (
          (await (await get("/api/next?day=2026-10-10")).json()) as {
            step: { kind: string; topic?: string };
          }
        ).step;
      const pick = async (courses: object[]) => {
        writeDataFile(
          opts.dataDir,
          PROFILE_FILE,
          JSON.stringify({ weeklyTarget: 3, courses }),
        );
        return (await (await get("/api/topics")).json()) as {
          id: string;
          tier: string;
          subject: string;
        }[];
      };
      // Pack order puts English first; without pickLesson's items guard this is 8700/P1Q1.
      expect(await step()).toMatchObject({
        kind: "lesson",
        topic: "1MA1/R9/of-an-amount",
      });

      const english = await pick([{ spec: "8700" }, { spec: "8702" }]);
      expect(english).toHaveLength(15); // derived: 10 language + 5 literature rows (a3 plan)
      expect(english.every((t) => t.subject === "english")).toBe(true);
      expect((await step()).kind).toBe("none");

      const f = await pick([{ spec: "1MA1", tier: "F" }]);
      expect(f).toHaveLength(38); // derived: 21 + 17 Foundation rows
      expect(f.some((t) => t.tier === "H")).toBe(false);
      expect(await pick([{ spec: "1MA1", tier: "H" }])).toHaveLength(58); // derived: 21 + 37

      const mixed = await pick([
        { spec: "1MA1", tier: "F" },
        { spec: "8700" },
        { spec: "8702" },
      ]);
      expect(mixed).toHaveLength(53); // derived: 38 + 15
      expect(mixed.filter((t) => t.subject === "english")).toHaveLength(15);
    },
  ),
);

/** content/aa (AA1, F and H), bb (BB1, H only; its topic needs AA1/X2), cc (CC1, untiered, no items). */
function tierFixture(): string {
  const dir = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "st-tiers-")),
  );
  const subject = (
    name: string,
    course: object,
    topics: { id: string; tier: string; prerequisites?: string[] }[],
    withItems = true,
  ) => {
    const d = path.join(dir, "content", name);
    fs.mkdirSync(path.join(d, "items"), { recursive: true });
    fs.writeFileSync(path.join(d, "courses.json"), JSON.stringify([course]));
    fs.writeFileSync(
      path.join(d, "topics.json"),
      JSON.stringify(
        topics.map((t) => ({
          title: t.id,
          aliases: [t.id.replace("/", "")],
          prerequisites: [],
          ...t,
        })),
      ),
    );
    if (withItems)
      for (const t of topics)
        fs.writeFileSync(
          path.join(d, "items", `${t.id.replace("/", "-")}.json`),
          JSON.stringify([
            {
              id: `${t.id}#1`,
              topic: t.id,
              type: "vocab",
              stem: "Which part of a cell holds the genetic material?",
              answers: ["nucleus"],
              misconceptions: [
                { answer: "cytoplasm", message: "That is the jelly." },
              ],
            },
          ]),
        );
  };
  const course = (spec: string, tiers: string[]) => ({
    spec,
    board: "B",
    title: spec,
    tiers,
  });
  subject("aa", course("AA1", ["F", "H"]), [
    { id: "AA1/X1", tier: "F" },
    { id: "AA1/X2", tier: "H" },
  ]);
  subject("bb", course("BB1", ["H"]), [
    { id: "BB1/X1", tier: "H", prerequisites: ["AA1/X2"] },
  ]);
  subject("cc", course("CC1", []), [{ id: "CC1/X1", tier: "F" }], false);
  return dir;
}

let tiers = "";
test("courses: Higher keeps Foundation topics, Foundation drops Higher ones, a dropped prerequisite counts as met, and nothing to offer gives none", async () => {
  try {
    await withPacks(
      () => {
        tiers ||= tierFixture();
        return tiers;
      },
      async (get) => {
        const post = postJson(get);
        const save = async (courses: object[]) =>
          expect((await post("/api/courses", { courses })).status).toBe(200);
        const next = async () =>
          ((await (await get("/api/next")).json()) as { step: unknown }).step;

        await save([{ spec: "AA1", tier: "H" }]);
        expect(await topicIds(get)).toEqual(["AA1/X1", "AA1/X2"]);
        await save([{ spec: "AA1", tier: "F" }]);
        expect(await topicIds(get)).toEqual(["AA1/X1"]);
        // A red mark puts AA1/X2 ahead of AA1/X1, so only the filter keeps it out of next.
        expect(
          (
            await post("/api/event", {
              v: 1,
              type: "intake",
              door: "interview",
              topics: [{ topic: "AA1/X2", rag: "R" }],
            })
          ).status,
        ).toBe(201);
        expect(await next()).toMatchObject({ kind: "lesson", topic: "AA1/X1" });
        await save([{ spec: "BB1", tier: "H" }]);
        expect(await topicIds(get)).toEqual(["BB1/X1"]);
        expect(await next()).toMatchObject({ kind: "lesson", topic: "BB1/X1" });
        await save([{ spec: "CC1" }]);
        expect(await topicIds(get)).toEqual(["CC1/X1"]);
        expect(await next()).toEqual({ kind: "none" });
      },
    )();
  } finally {
    if (tiers) fs.rmSync(tiers, { recursive: true, force: true });
  }
});
