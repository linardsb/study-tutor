import { expect, test } from "bun:test";
import path from "node:path";
import { loadPacks } from "../api/case";
import type { CasePack } from "../content/types";
import { replay } from "../events/replay";
import { diagnostic, MAX_DIAGNOSTIC_TOPICS, ragFor } from "./diagnostic";

const { pack } = await loadPacks(path.resolve(import.meta.dir, "../.."));
const DAY = "2026-10-05";
const SCIENCE = "8464/4.1.1.2";
const maths = pack.topics.filter((t) => t.id !== SCIENCE).map((t) => t.id);

const intakeLine = (ids: readonly string[]) =>
  JSON.stringify({
    v: 1,
    t: "2026-10-01T16:00:00Z",
    type: "intake",
    door: "sheet",
    topics: ids.map((topic) => ({ topic, rag: "G" })),
  });

test("an empty state gives 8 slots: the first 8 maths topics, each a generator roll", () => {
  const d = diagnostic(replay([]), DAY, pack);
  expect(d?.slots).toHaveLength(MAX_DIAGNOSTIC_TOPICS);
  expect(new Set(d?.slots.map((s) => s.topic))).toEqual(
    new Set(maths.slice(0, MAX_DIAGNOSTIC_TOPICS)),
  );
  expect(d?.slots.every((s) => s.item === null)).toBe(true);
});

test("the same state and day give the same test; another day gives other seeds", () => {
  const a = diagnostic(replay([]), DAY, pack);
  expect(diagnostic(replay([]), DAY, pack)).toEqual(a);
  const b = diagnostic(replay([]), "2026-10-06", pack);
  expect(b?.slots.map((s) => s.seed).sort()).not.toEqual(
    a?.slots.map((s) => s.seed).sort(),
  );
});

test("with every maths topic rated, the science topic comes first with an item that has answers", () => {
  const d = diagnostic(replay([intakeLine(maths)]), DAY, pack);
  const science = d?.slots.find((s) => s.topic === SCIENCE);
  expect(d?.topics[0]).toBe(SCIENCE);
  expect(["#1", "#2", "#3", "#4", "#5"].map((n) => `${SCIENCE}${n}`)).toContain(
    science?.item ?? "",
  );
});

test("a topic with no generator and no item with answers has no question", () => {
  const topic = pack.topics.find((t) => t.id === SCIENCE);
  if (topic === undefined) throw new Error("science topic missing");
  const bare: CasePack = {
    topics: [topic],
    items: new Map([[SCIENCE, []]]),
    gens: {},
  };
  expect(diagnostic(replay([]), DAY, bare)).toBeNull();
});

test("a topic on the ladder is never asked, even with no R/A/G; all on the ladder → null", () => {
  const s = replay([]);
  const [first] = maths as [string];
  s.topics[first] = { rung: 3, nextDue: "2026-10-20", rag: null };
  expect(diagnostic(s, DAY, pack)?.slots.some((x) => x.topic === first)).toBe(
    false,
  );
  for (const t of pack.topics)
    s.topics[t.id] = { rung: 1, nextDue: "2026-10-20", rag: null };
  expect(diagnostic(s, DAY, pack)).toBeNull();
});

test("ragFor: right and Sure → G, right and Not sure → A, wrong → R", () => {
  expect(ragFor(true, true)).toBe("G");
  expect(ragFor(true, false)).toBe("A");
  expect(ragFor(false, true)).toBe("R");
  expect(ragFor(false, false)).toBe("R");
});
