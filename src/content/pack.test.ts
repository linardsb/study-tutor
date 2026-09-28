import { expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { normaliseAnswer } from "../marking/normalise";
import {
  itemsFileName,
  loadItems,
  loadTopics,
  subjectDir,
  toItemView,
} from "./pack";
import type { Item, ItemType } from "./types";

const ITEM_TYPES: Record<ItemType, true> = {
  generator: true,
  cloze: true,
  label: true,
  sequence: true,
  vocab: true,
  short: true,
  extended: true,
  "practical-method": true,
};

async function allItems(): Promise<Map<string, Item[]>> {
  const out = new Map<string, Item[]>();
  for (const t of await loadTopics("maths"))
    out.set(
      t.id,
      (await Bun.file(
        `content/maths/items/${itemsFileName(t.id)}`,
      ).json()) as Item[],
    );
  return out;
}

test("topics.json: 21 rows, unique ids and aliases, ids follow the grammar, prerequisites resolve, tier F", async () => {
  const topics = await loadTopics("maths");
  expect(topics).toHaveLength(21);
  const ids = topics.map((t) => t.id);
  expect(new Set(ids).size).toBe(21);
  const aliases = topics.flatMap((t) => t.aliases);
  expect(new Set(aliases).size).toBe(aliases.length);
  for (const t of topics) {
    expect(t.id).toMatch(/^1MA1\/[NARGPS]\d+(\/[a-z-]+)?$/);
    expect(t.title.length).toBeGreaterThan(0);
    expect(t.tier).toBe("F");
    for (const p of t.prerequisites) {
      expect(ids).toContain(p);
      expect(p).not.toBe(t.id);
    }
  }
  // Three concept topics (T7 Q3); each rule is one of three options with two distractors.
  const concepts = topics.filter((t) => t.concept !== undefined);
  expect(concepts.map((t) => t.id)).toEqual([
    "1MA1/A12",
    "1MA1/A9",
    "1MA1/R10",
  ]);
  for (const t of concepts) {
    const c = t.concept;
    if (!c) throw new Error("filtered above");
    expect(c.rule.length).toBeGreaterThan(0);
    expect(c.distractors).toHaveLength(2);
    for (const d of c.distractors) expect(d).not.toBe(c.rule);
  }
});

test("loadItems: a topic's items, an empty list for a topic with no file, and a refusal for a file that is not a list of items", async () => {
  const items = await loadItems("maths", "1MA1/R9/of-an-amount");
  expect(items).toHaveLength(5);
  for (const i of items) expect(i.topic).toBe("1MA1/R9/of-an-amount");
  expect(await loadItems("maths", "1MA1/none")).toEqual([]);
  const tmp = mkdtempSync(path.join(tmpdir(), "study-tutor-"));
  mkdirSync(path.join(tmp, "content", "bad", "items"), { recursive: true });
  const file = path.join(tmp, "content", "bad", "items", "1MA1-X1.json");
  writeFileSync(file, JSON.stringify([{ id: 1 }]));
  await expect(loadItems("bad", "1MA1/X1", tmp)).rejects.toThrow(
    `${file}: not a list of items`,
  );
});

test("items: one file per topic, 5 items each, 105 in all, every item shaped and its misconceptions never the answer", async () => {
  const packs = await allItems();
  expect(readdirSync("content/maths/items").sort()).toEqual(
    [...packs.keys()].map(itemsFileName).sort(),
  );
  const seen = new Set<string>();
  let total = 0;
  let misconceptions = 0;
  let figures = 0;
  let scaffolds = 0;
  for (const [topicId, items] of packs) {
    expect(items).toHaveLength(5); // observed in the v1 lessons, 2026-09-27
    for (const item of items) {
      total += 1;
      expect(seen.has(item.id)).toBe(false);
      seen.add(item.id);
      expect(item.topic).toBe(topicId);
      expect(ITEM_TYPES[item.type]).toBe(true);
      expect(item.stem.length).toBeGreaterThan(0);
      const answers = item.answers ?? [];
      expect(answers.length).toBeGreaterThanOrEqual(1);
      expect(answers.length).toBeLessThanOrEqual(9); // observed bound
      expect(item.misconceptions.length).toBeGreaterThanOrEqual(2); // observed bound
      expect(item.misconceptions.length).toBeLessThanOrEqual(3);
      misconceptions += item.misconceptions.length;
      const accepted = answers.map(normaliseAnswer);
      for (const m of item.misconceptions) {
        expect(m.answer.length).toBeGreaterThan(0);
        expect(m.message.length).toBeGreaterThan(0);
        expect(accepted).not.toContain(normaliseAnswer(m.answer));
      }
      if (item.figure !== undefined) {
        figures += 1;
        expect(item.figure).toStartWith("<svg");
      }
      if (item.scaffold !== undefined) {
        scaffolds += 1;
        expect(item.scaffold.length).toBeGreaterThan(0);
      }
    }
  }
  expect(total).toBe(105);
  expect(misconceptions).toBe(312);
  expect(figures).toBe(60); // observed in the v1 lessons, 2026-09-27
  expect(scaffolds).toBe(42); // observed bound
});

test("toItemView drops the answer and everything that narrows it, at runtime", () => {
  const item: Item = {
    id: "x#1",
    topic: "x",
    type: "short",
    stem: "s",
    hint: "h",
    answers: ["1"],
    working: "w",
    mark_scheme: "ms",
    misconceptions: [{ answer: "2", message: "m" }],
  };
  const keys = Object.keys(JSON.parse(JSON.stringify(toItemView(item))));
  for (const k of ["answers", "working", "mark_scheme", "misconceptions"])
    expect(keys).not.toContain(k);
  expect(keys).toEqual(["id", "topic", "type", "stem", "hint"]);
});

test("subjectDir refuses anything but a lower-case word, so a subject cannot leave content/", () => {
  for (const bad of ["../x", "maths/..", "Maths", "", "a b"])
    expect(() => subjectDir(bad)).toThrow("subject must be a lower-case word");
  expect(subjectDir("maths", "/r")).toBe("/r/content/maths");
});

test("loadTopics reads from root, not the cwd, and refuses a file that is not a list of topic rows", async () => {
  const root = process.cwd();
  const tmp = mkdtempSync(path.join(tmpdir(), "study-tutor-"));
  process.chdir(tmp);
  try {
    expect(await loadTopics("maths", root)).toHaveLength(21);
  } finally {
    process.chdir(root);
  }
  mkdirSync(path.join(tmp, "content", "bad"), { recursive: true });
  const file = path.join(tmp, "content", "bad", "topics.json");
  writeFileSync(file, JSON.stringify([{ id: "1MA1/R9", title: "t" }]));
  await expect(loadTopics("bad", tmp)).rejects.toThrow(
    `${file}: not a list of topic rows`,
  );
});

const BOARD = [
  /\b(Edexcel|Pearson|AQA|OCR|WJEC|Eduqas)\b/,
  /mark scheme/i,
  /Total for Question/i,
  /Turn over/i,
];

test("no exam-board wording in items, lessons or reference sheets", async () => {
  const files = ["items", "lessons", "reference"].flatMap((d) =>
    readdirSync(`content/maths/${d}`).map((f) => `content/maths/${d}/${f}`),
  );
  expect(files.length).toBe(63);
  for (const f of files) {
    const body = await Bun.file(f).text();
    for (const re of BOARD)
      expect(re.test(body), `${f} matches ${re}`).toBe(false);
  }
});
