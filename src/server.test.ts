import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadTopics } from "./content/pack";
import { isoWeek, localDay } from "./mcp/clock";
import {
  openBrowser,
  refuseForeign,
  type ServerOptions,
  startServer,
  staticPath,
} from "./server";

// The repo root: pack.test.ts reads content/maths the same way.
const root = process.cwd();
const topics = await loadTopics("maths");

/** A realpathed temp dir (macOS maps /var to /private/var), removed afterwards. */
function withTemp(fn: (dir: string, opts: ServerOptions) => Promise<void>) {
  return async () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-server-")),
    );
    try {
      await fn(dir, { root, dataDir: path.join(dir, "data"), topics });
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
    expect(fs.readFileSync(log, "utf8").trim().split("\n")).toHaveLength(1);
    expect(fs.existsSync(path.join(opts.dataDir, "state.json"))).toBe(true);

    const refused = await post(JSON.stringify({ v: 1, type: "nope" }));
    expect(refused.status).toBe(400);
    expect(((await refused.json()) as { error: string }).error).toStartWith(
      "Refused",
    );
    expect(fs.readFileSync(log, "utf8").trim().split("\n")).toHaveLength(1);

    const notJson = await post("not json");
    expect(notJson.status).toBe(400);
    expect(await notJson.json()).toEqual({ error: "Body is not JSON" });
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
  "openBrowser does not throw when no opener is on PATH",
  withTemp(async (dir) => {
    expect(() =>
      openBrowser("http://127.0.0.1:1/", { PATH: dir }),
    ).not.toThrow();
  }),
);
