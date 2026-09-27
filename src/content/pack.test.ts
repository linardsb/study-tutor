import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { normaliseAnswer } from "../marking/normalise";
import { itemsFileName, loadTopics } from "./pack";
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
});

test("items: one file per topic, 5 items each, 105 in all, every item shaped and its misconceptions never the answer", async () => {
  const packs = await allItems();
  expect(readdirSync("content/maths/items").sort()).toEqual(
    [...packs.keys()].map(itemsFileName).sort(),
  );
  const seen = new Set<string>();
  let total = 0;
  let misconceptions = 0;
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
      if (item.figure !== undefined) expect(item.figure).toStartWith("<svg");
    }
  }
  expect(total).toBe(105);
  expect(misconceptions).toBe(312);
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
