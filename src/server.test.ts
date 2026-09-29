import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startFakeProvider } from "../scripts/fake-provider";
import { loadCasePack } from "./api/case";
import { loadTopics } from "./content/pack";
import { appendEvent } from "./events/append";
import { findItem } from "./flow/chat";
import { chooseWrong } from "./flow/coach";
import { addDays, isoWeek, localDay } from "./mcp/clock";
import {
  apiRoutes,
  openBrowser,
  refuseForeign,
  type ServerOptions,
  startServer,
  staticPath,
} from "./server";
import { checkForUpdate, RELEASES_PAGE } from "./updates";

// The repo root: pack.test.ts reads content/maths the same way.
const root = process.cwd();
const topics = await loadTopics("maths");
const pack = await loadCasePack("maths");

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
    expect(Object.keys(urls)).toHaveLength(opts.topics.length);
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
