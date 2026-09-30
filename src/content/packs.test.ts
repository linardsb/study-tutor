/* Invariants every content/<subject>/ must hold. Counts that belong to one subject stay in that subject's test (pack.test.ts for maths). */
import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { loadPacks } from "../api/case";
import { MAX_CODE } from "../jobs/intake_read";
import { markAnswer } from "../marking/answer";
import { itemsFileName } from "./pack";
import type { ItemType } from "./types";

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
const MARKED_BY_A_JOB: ReadonlySet<ItemType> = new Set([
  "short",
  "extended",
  "practical-method",
]);

const root = process.cwd();
const { pack, subjects } = await loadPacks(root);

test("topics: every id is <spec>/<statement>[/<slug>], every prerequisite resolves, every subject has a LICENCE.md", () => {
  const ids = new Set(pack.topics.map((t) => t.id));
  for (const t of pack.topics) {
    expect(t.id).toMatch(/^[0-9A-Z]+\/[0-9A-Za-z.]+(\/[a-z-]+)?$/);
    for (const p of t.prerequisites) expect(ids.has(p)).toBe(true);
  }
  for (const s of new Set(subjects.values()))
    expect(fs.existsSync(path.join(root, "content", s, "LICENCE.md"))).toBe(
      true,
    );
});

test("items: each subject's item files are its topics' files, and every item is marked in code or carries a mark scheme", () => {
  for (const s of new Set(subjects.values())) {
    const own = pack.topics.filter((t) => subjects.get(t.id) === s);
    const withItems = own.filter((t) => (pack.items.get(t.id) ?? []).length);
    const dir = path.join(root, "content", s, "items");
    // A pack may ship topic rows before any items (english).
    expect(fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []).toEqual(
      withItems.map((t) => itemsFileName(t.id)).sort(),
    );
  }
  const seen = new Set<string>();
  for (const [topicId, items] of pack.items)
    for (const item of items) {
      expect(seen.has(item.id)).toBe(false);
      seen.add(item.id);
      expect(item.topic).toBe(topicId);
      expect(ITEM_TYPES[item.type]).toBe(true);
      expect(item.stem.length).toBeGreaterThan(0);
      if (item.answers !== undefined) {
        expect(item.answers.length).toBeGreaterThanOrEqual(1);
        expect(item.working?.length ?? 0).toBeGreaterThan(0);
        // The type's own canon: a misconception that marks right would never be named.
        for (const m of item.misconceptions) {
          expect(m.message.length).toBeGreaterThan(0);
          expect({
            id: item.id,
            m: m.answer,
            ok: markAnswer(item, m.answer).ok,
          }).toEqual({
            id: item.id,
            m: m.answer,
            ok: false,
          });
        }
      } else {
        expect(MARKED_BY_A_JOB.has(item.type)).toBe(true);
        expect(item.mark_scheme?.length ?? 0).toBeGreaterThan(0);
        // A misconception is a typed wrong answer; code cannot compare one against a mark scheme.
        expect(item.misconceptions).toEqual([]);
      }
    }
});

test("topics: every id fits a sheet code, so intake can read it", () => {
  for (const t of pack.topics)
    expect(t.id.length).toBeLessThanOrEqual(MAX_CODE);
});
