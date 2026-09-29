import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadTopics } from "../content/pack";
import { appendEvent, readLines } from "../events/append";
import { EVENT_TYPES, type NewEvent } from "../events/types";
import {
  MCP_WRITABLE,
  runTool,
  TOOLS,
  type ToolContext,
  type ToolName,
} from "./tools";

const root = process.cwd();
const topics = await loadTopics("maths");
const AT = () => "2026-10-11T23:30:00Z";
const HIDDEN = ["answers", "working", "mark_scheme", "misconceptions"];
const R4 = ["1MA1/R4#1", "1MA1/R4#2", "1MA1/R4#3", "1MA1/R4#4", "1MA1/R4#5"];

/** A realpathed temp dir (macOS maps /var to /private/var), removed afterwards. */
function withTemp(fn: (dir: string, ctx: ToolContext) => Promise<void>) {
  return async () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-mcp-")),
    );
    try {
      await fn(dir, {
        root,
        dataDir: path.join(dir, "data"),
        subjects: new Map(topics.map((t) => [t.id, "maths"])),
        topics,
        origin: "http://127.0.0.1:4731",
        now: AT,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

const call = runTool;

function value(r: Awaited<ReturnType<typeof call>>): Record<string, unknown> {
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

type Row = Record<string, unknown> & { id: string };
const items = (r: Awaited<ReturnType<typeof call>>) => value(r).items as Row[];
const shows = (i: Row) => HIDDEN.some((k) => Object.hasOwn(i, k));

const attempt = (item: string): NewEvent => ({
  v: 1,
  type: "attempt",
  item,
  topic: "1MA1/R4",
  correct: false,
  sure: true,
  answer: "3:4",
});

/** Every file under `dir`, path → bytes. */
function snapshot(dir: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of fs.readdirSync(dir, { recursive: true, encoding: "utf8" })) {
    const p = path.join(dir, f);
    if (fs.statSync(p).isFile()) out.set(f, fs.readFileSync(p, "base64"));
  }
  return out;
}

test("the four tools, and write_event the only writer", () => {
  expect(Object.keys(TOOLS).sort()).toEqual([
    "clock",
    "open_lesson",
    "read_state",
    "write_event",
  ]);
  const writers = Object.entries(TOOLS).filter(([, t]) => t.kind === "write");
  expect(writers.map(([n]) => n)).toEqual(["write_event"]);
});

test(
  "read tools leave every file byte-identical, state.json included",
  withTemp(async (dir, ctx) => {
    appendEvent(ctx.dataDir, attempt("1MA1/R4#1"), AT);
    appendEvent(
      ctx.dataDir,
      { v: 1, type: "session", phase: "start", mode: "lesson" },
      AT,
    );
    appendEvent(
      ctx.dataDir,
      { v: 1, type: "session", phase: "end", mode: "lesson" },
      AT,
    );
    const before = snapshot(dir);
    expect(before.size).toBe(1);
    const args: Record<string, Record<string, unknown>> = {
      read_state: { topic: "U687" },
      open_lesson: { topic: "U687" },
      clock: {},
    };
    for (const [name, tool] of Object.entries(TOOLS)) {
      if (tool.kind !== "read") continue;
      const r = await call(name as ToolName, args[name] ?? {}, ctx);
      expect(r.ok).toBe(true);
    }
    expect(snapshot(dir)).toEqual(before);
  }),
);

test(
  "guard: with no attempt no item carries an answer field",
  withTemp(async (_dir, ctx) => {
    const rows = items(await call("read_state", { topic: "U687" }, ctx));
    expect(rows.map((i) => i.id)).toEqual(R4); // observed, 5 items per topic
    for (const i of rows) expect(shows(i)).toBe(false);
  }),
);

test(
  "guard: an attempt unlocks that item only",
  withTemp(async (_dir, ctx) => {
    appendEvent(ctx.dataDir, attempt("1MA1/R4#1"), AT);
    const rows = items(await call("read_state", { topic: "1MA1/R4" }, ctx));
    expect(rows[0]).toHaveProperty("answers");
    expect(rows[0]).toHaveProperty("working");
    for (const i of rows.slice(1)) expect(shows(i)).toBe(false);
  }),
);

test(
  "guard: a practice attempt on #gen unlocks nothing",
  withTemp(async (_dir, ctx) => {
    appendEvent(ctx.dataDir, attempt("1MA1/R4#gen"), AT);
    const rows = items(await call("read_state", { topic: "U687" }, ctx));
    for (const i of rows) expect(shows(i)).toBe(false);
  }),
);

test(
  "guard: write_event refuses an attempt, writes nothing, and unlocks nothing",
  withTemp(async (_dir, ctx) => {
    const r = await call(
      "write_event",
      { ...attempt("1MA1/R4#1"), correct: true, answer: "x" },
      ctx,
    );
    expect(r).toMatchObject({
      ok: false,
      error: expect.stringMatching(/Refused/),
    });
    expect(fs.existsSync(path.join(ctx.dataDir, "events.jsonl"))).toBe(false);
    const rows = items(await call("read_state", { topic: "U687" }, ctx));
    expect(shows(rows[0] as Row)).toBe(false);
  }),
);

test(
  "allowlist: a valid event of every type not MCP-writable is refused with nothing written",
  withTemp(async (_dir, ctx) => {
    for (const type of EVENT_TYPES.filter((t) => !MCP_WRITABLE[t])) {
      // A well-formed body, so only the allowlist can refuse it, not appendEvent's validation.
      const line = fs
        .readFileSync(
          path.join(root, "src/events/__fixtures__", `${type}.v1.jsonl`),
          "utf8",
        )
        .split("\n")[0] as string;
      const { t: _t, ...body } = JSON.parse(line);
      const r = await call("write_event", body, ctx);
      expect(r).toEqual({
        ok: false,
        error: `Refused: ${type} events are written by the tutor's own pages, not by a tool`,
      });
    }
    expect(fs.existsSync(ctx.dataDir)).toBe(false);
  }),
);

test(
  "allowlist: session and intake are stored with topic ids and the tutor's clock",
  withTemp(async (_dir, ctx) => {
    const s = await call(
      "write_event",
      {
        v: 1,
        type: "session",
        phase: "start",
        mode: "lesson",
        topic: "U349",
        t: "1999-01-01T00:00:00Z",
      },
      ctx,
    );
    expect(value(s)).toEqual({
      v: 1,
      t: AT(),
      type: "session",
      phase: "start",
      mode: "lesson",
      topic: "1MA1/R9/of-an-amount",
    });
    const i = await call(
      "write_event",
      {
        v: 1,
        type: "intake",
        door: "interview",
        topics: [{ topic: "U687", rag: "R" }],
      },
      ctx,
    );
    expect(value(i).topics).toEqual([{ topic: "1MA1/R4", rag: "R" }]);
    expect(readLines(ctx.dataDir)).toHaveLength(2);
  }),
);

test(
  "write_event refuses what is not an event type, writing nothing",
  withTemp(async (_dir, ctx) => {
    for (const args of [
      { v: 1, type: "__proto__" },
      { v: 1, type: "banana" },
      { v: 1, type: 3 },
      [] as unknown as Record<string, unknown>,
    ]) {
      const r = await call("write_event", args, ctx);
      expect(r).toMatchObject({
        ok: false,
        error: "Refused: not an event type",
      });
    }
    expect(fs.existsSync(ctx.dataDir)).toBe(false);
  }),
);

test(
  "paths: a photo and path-shaped topics are refused",
  withTemp(async (_dir, ctx) => {
    const photo = await call(
      "write_event",
      {
        v: 1,
        type: "photo",
        item: "1MA1/R4#1",
        topic: "U687",
        file: "../../x.jpg",
      },
      ctx,
    );
    expect(photo.ok).toBe(false);
    expect(fs.existsSync(ctx.dataDir)).toBe(false);
    expect(
      await call("open_lesson", { topic: "../../../etc/passwd" }, ctx),
    ).toEqual({
      ok: false,
      error: "Unknown topic: ../../../etc/passwd",
    });
    expect(await call("read_state", { topic: "../x" }, ctx)).toEqual({
      ok: false,
      error: "Unknown topic: ../x",
    });
  }),
);

test(
  "open_lesson: every topic has a lesson that exists, by id or U-code",
  withTemp(async (_dir, ctx) => {
    expect(topics).toHaveLength(21); // observed, content/maths/topics.json
    for (const t of topics) {
      const v = value(await call("open_lesson", { topic: t.id }, ctx));
      const file = (v.url as string).replace(`${ctx.origin}/`, "");
      expect(fs.existsSync(path.join(root, file))).toBe(true);
    }
    expect(value(await call("open_lesson", { topic: "U349" }, ctx))).toEqual({
      topic: "1MA1/R9/of-an-amount",
      title: topics.find((t) => t.id === "1MA1/R9/of-an-amount")?.title,
      url: "http://127.0.0.1:4731/content/maths/lessons/0001-U349-percentage-of-an-amount.html",
    });
  }),
);

test(
  "clock: London's day across the BST midnight, and its ISO week",
  withTemp(async (_dir, ctx) => {
    // derived from clock.test.ts: localDay(AT) is 2026-10-12, isoWeek of that is 2026-W42
    expect(value(await call("clock", {}, ctx))).toEqual({
      utc: "2026-10-11T23:30:00Z",
      day: "2026-10-12",
      week: "2026-W42",
    });
  }),
);

test(
  "no leak on an empty log: no answers key for any topic, and no data folder made",
  withTemp(async (_dir, ctx) => {
    const out: unknown[] = [];
    for (const t of topics)
      out.push(value(await call("read_state", { topic: t.id }, ctx)));
    out.push(value(await call("open_lesson", { topic: "U687" }, ctx)));
    out.push(value(await call("clock", {}, ctx)));
    for (const v of out) expect(JSON.stringify(v)).not.toContain('"answers"');
    expect(fs.existsSync(ctx.dataDir)).toBe(false);
  }),
);

test(
  "read_state lists the topics with id, title and aliases only",
  withTemp(async (_dir, ctx) => {
    const v = value(await call("read_state", {}, ctx));
    const listed = v.topics as Record<string, unknown>[];
    expect(listed).toHaveLength(21);
    for (const t of listed)
      expect(Object.keys(t).sort()).toEqual(["aliases", "id", "title"]);
    expect(v).not.toHaveProperty("items");
  }),
);
