import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { loadCasePack } from "../api/case";
import { loadGenerators } from "../content/generators";
import { itemsFileName } from "../content/pack";
import type { Generator, Item, Topic } from "../content/types";
import { replay, type State } from "../events/replay";
import { parseEvent } from "../events/types";
import { type Boss, boss } from "../flow/boss";
import { NEXT_DAYS, passes, RUNGS } from "../flow/ladder";

type Row = { topic: string; score: number; of: number; passed: boolean };
type Built = { slot: Boss["slots"][number]; item: Item & { seed?: number } };
type BossPage = {
  TEXT: Record<string, string | ((...args: never[]) => string)>;
  RUNG_LINES: Record<number, string>;
  RUNGS: string[];
  NEXT_DAYS: Record<number, number>;
  passes: (score: number, of: number) => boolean;
  itemsFile: (topic: string) => string;
  buildItems: (
    boss: Boss,
    topics: readonly Topic[],
    itemsByTopic: Record<string, readonly Item[]>,
    gens: Record<string, Generator>,
    quiz: unknown,
  ) => Built[];
  scoreOf: (boss: Boss, results: { topic: string; ok: boolean }[]) => Row[];
  retestBody: (row: Row, seed: number) => Record<string, unknown>;
  rungLine: (rung: number) => string;
  resultRow: (title: string, row: Row, rungAfter: number) => string;
};
type MapPage = {
  TEXT: Record<string, string | ((...args: never[]) => string)>;
};

// The browser files set globals, the way quiz.js does; nothing in them touches document at load.
const app = path.resolve(import.meta.dir, "../../app");
await import(path.join(app, "quiz.js"));
await import(path.join(app, "retest.js"));
await import(path.join(app, "map.js"));
const page = (globalThis as { boss?: BossPage }).boss;
if (!page) throw new Error("app/retest.js did not set boss");
const mapPage = (globalThis as { map?: MapPage }).map as MapPage;
const quiz = (globalThis as { quiz?: unknown }).quiz;

const pack = await loadCasePack("maths");
const gens = await loadGenerators("maths");
const DAY = "2026-10-10";
const [A, B] = pack.topics.map((t) => t.id) as [string, string];
const itemsByTopic = Object.fromEntries(pack.items);

function due(rows: [string, string][]): State {
  const s = replay([]);
  for (const [id, nextDue] of rows)
    s.topics[id] = { rung: 1, nextDue, rag: null };
  return s;
}

test("passes, itemsFile, NEXT_DAYS and RUNGS in the browser match the server's", () => {
  expect(page.passes(0, 0)).toBe(passes(0, 0));
  for (let of = 1; of <= 9; of++)
    for (let score = 0; score <= of; score++)
      expect(page.passes(score, of)).toBe(passes(score, of));
  for (const t of pack.topics)
    expect(page.itemsFile(t.id)).toBe(
      `/content/maths/items/${itemsFileName(t.id)}`,
    );
  expect(page.NEXT_DAYS).toEqual(NEXT_DAYS);
  expect(page.RUNGS).toEqual([...RUNGS]);
});

test("buildItems on a real boss: the fixed slot is the pack item with its answers, rolls carry their slot seed, and a rebuild gives the same stems", () => {
  const s = due([
    [A, DAY],
    [B, DAY],
  ]);
  s.confidentWrong[`${A}#1`] = {
    topic: A,
    t: "2026-10-05T16:00:00Z",
    answer: "0",
  };
  const b = boss(s, DAY, pack) as Boss;
  const built = page.buildItems(b, pack.topics, itemsByTopic, gens, quiz);
  expect(built).toHaveLength(6);
  const fixed = built.find((x) => x.slot.item !== null) as Built;
  expect(fixed.item.id).toBe(`${A}#1`);
  expect(fixed.item.answers).toEqual(
    (pack.items.get(A) as Item[])[0]?.answers as string[],
  );
  for (const x of built.filter((x) => x.slot.item === null)) {
    expect(x.item.id).toEndWith("#gen");
    expect(x.item.seed).toBe(x.slot.seed);
    expect(x.item.topic).toBe(x.slot.topic);
  }
  const again = page.buildItems(b, pack.topics, itemsByTopic, gens, quiz);
  expect(again.map((x) => x.item.stem)).toEqual(built.map((x) => x.item.stem));
});

test("buildItems: an unknown item id becomes a roll with the slot seed; with no generator either, the slot is dropped", () => {
  const b: Boss = {
    day: DAY,
    seed: 7,
    topics: [A],
    slots: [{ topic: A, item: `${A}#999`, seed: 4242 }],
  };
  const [roll] = page.buildItems(b, pack.topics, itemsByTopic, gens, quiz);
  expect(roll?.item.id).toBe(`${A}#gen`);
  expect(roll?.item.seed).toBe(4242);
  expect(page.buildItems(b, pack.topics, itemsByTopic, {}, quiz)).toEqual([]);
});

test("scoreOf: one row per boss topic in boss order, passed by the 2 of 3 rule; a topic with no result is left out", () => {
  const b = { day: DAY, seed: 1, topics: [B, A], slots: [] };
  expect(
    page.scoreOf(b, [
      { topic: A, ok: true },
      { topic: B, ok: false },
      { topic: A, ok: true },
      { topic: A, ok: false },
      { topic: B, ok: true },
      { topic: B, ok: true },
    ]),
  ).toEqual([
    { topic: B, score: 2, of: 3, passed: true },
    { topic: A, score: 2, of: 3, passed: true },
  ]);
  expect(page.scoreOf(b, [{ topic: A, ok: false }])).toEqual([
    { topic: A, score: 0, of: 1, passed: false },
  ]);
});

test("retestBody is a valid retest@1 line whose passed agrees with the server's passes", () => {
  for (const row of [
    { topic: A, score: 3, of: 3, passed: true },
    { topic: A, score: 1, of: 3, passed: false },
  ]) {
    const body = page.retestBody(row, 99);
    expect(body.seed).toBe(99);
    const e = parseEvent(JSON.stringify({ ...body, t: `${DAY}T16:00:00Z` }));
    expect(e?.type).toBe("retest");
    expect(body.passed).toBe(passes(row.score, row.of));
  }
});

test("rungLine names what the pupil can do and when the re-test comes round; resultRow joins the score and the line", () => {
  expect(page.rungLine(1)).toBe(
    "Not yet from memory. Back to learning. Do the lesson again and the re-test comes round in 3 days.",
  );
  expect(page.rungLine(2)).toBe(
    "One cold pass. You did it from memory once. Next re-test in 10 days.",
  );
  expect(page.rungLine(3)).toBe(
    "Two cold passes. One more and it is secure. Next re-test in 30 days.",
  );
  expect(page.rungLine(4)).toBe(
    "Secure. You can do this from memory. It still comes round every 60 days.",
  );
  for (const r of [1, 2, 3, 4] as const)
    expect(page.rungLine(r)).toContain(`${NEXT_DAYS[r]} days`);
  expect(
    page.resultRow(
      "Percentage of an amount",
      { topic: A, score: 2, of: 3, passed: true },
      2,
    ),
  ).toBe(
    "Percentage of an amount: 2 of 3. One cold pass. You did it from memory once. Next re-test in 10 days.",
  );
});

const clean = (s: string) => ({
  s,
  bang: s.includes("!"),
  emoji: /[\u{2600}-\u{27BF}\u{2C00}-\u{10FFFF}]/u.test(s),
});
const sample = (v: string | ((...args: never[]) => string)) =>
  typeof v === "function" ? (v as (...a: unknown[]) => string)("T", 2, 3) : v;

test("register: no exclamation mark and no emoji in either page or any exported string", () => {
  for (const file of ["map.html", "retest.html"]) {
    const text = fs
      .readFileSync(path.join(app, file), "utf8")
      .replace(/<[^>]+>/g, "");
    expect(clean(text)).toEqual({ s: text, bang: false, emoji: false });
  }
  const strings = [
    ...Object.values(page.TEXT).map(sample),
    ...Object.values(page.RUNG_LINES),
    ...Object.values(mapPage.TEXT).map(sample),
  ];
  expect(strings.length).toBeGreaterThan(40);
  for (const s of strings)
    expect(clean(s)).toEqual({ s, bang: false, emoji: false });
});

test("no page writes a file: no storage or file API under app/, and every POST goes to /api/event or /api/config", () => {
  const files = fs
    .readdirSync(app)
    .filter((f) => f.endsWith(".js") || f.endsWith(".html"));
  expect(files.length).toBeGreaterThan(6);
  const posts: string[] = [];
  for (const f of files) {
    const src = fs.readFileSync(path.join(app, f), "utf8");
    expect({
      f,
      storage:
        /localStorage|sessionStorage|indexedDB|document\.cookie|node:fs|\bBun\./.test(
          src,
        ),
    }).toEqual({ f, storage: false });
    for (const m of src.matchAll(
      /fetch\(\s*"(\/api\/[a-z]+)"[\s\S]{0,120}?method:\s*"POST"/g,
    ))
      posts.push(`${f}:${m[1]}`);
  }
  expect(posts.length).toBeGreaterThan(2);
  for (const p of posts)
    expect({ p, ok: /:\/api\/(event|config)$/.test(p) }).toEqual({
      p,
      ok: true,
    });
});
