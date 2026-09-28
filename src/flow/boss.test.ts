import { expect, test } from "bun:test";
import { loadCasePack } from "../api/case";
import { replay, type State } from "../events/replay";
import { addDays } from "../mcp/clock";
import { boss, dueTopics, MAX_BOSS_TOPICS } from "./boss";

const pack = await loadCasePack("maths");
const DAY = "2026-10-10";
const [A, B, C, D, E] = pack.topics.map((t) => t.id) as [
  string,
  string,
  string,
  string,
  string,
];

/** A state with the given topics on rung 1 and due on the given day. */
function due(rows: [string, string][]): State {
  const s = replay([]);
  for (const [id, nextDue] of rows)
    s.topics[id] = { rung: 1, nextDue, rag: null };
  return s;
}

const wrong = (s: State, item: string, topic: string, t: string) => {
  s.confidentWrong[item] = { topic, t, answer: "0" };
};

test("no due topic gives no boss", () => {
  expect(boss(replay([]), DAY, pack)).toBeNull();
  expect(boss(due([[A, "2026-10-11"]]), DAY, pack)).toBeNull();
});

test("two due topics give six slots, topics in nextDue order", () => {
  const b = boss(
    due([
      [A, "2026-10-09"],
      [B, "2026-10-08"],
    ]),
    DAY,
    pack,
  );
  expect(b?.topics).toEqual([B, A]);
  expect(b?.slots).toHaveLength(6);
  expect(b?.slots.filter((s) => s.topic === A)).toHaveLength(3);
});

test("equal nextDue falls back to pack order; a topic not in the pack is ignored", () => {
  const s = due([
    [B, DAY],
    [A, DAY],
    ["U999", "2026-10-01"],
  ]);
  expect(dueTopics(s, DAY, pack)).toEqual([A, B]);
});

test("a confident-wrong pack item of a due topic is a slot; a #gen key adds none", () => {
  const s = due([[A, DAY]]);
  wrong(s, `${A}#1`, A, "2026-10-05T16:00:00Z");
  wrong(s, `${A}#gen`, A, "2026-10-05T16:01:00Z");
  const b = boss(s, DAY, pack);
  const fixed = b?.slots.filter((x) => x.item !== null).map((x) => x.item);
  expect(fixed).toEqual([`${A}#1`]);
  expect(b?.slots).toHaveLength(3);
});

test("confident-wrong items come oldest first and cap at three", () => {
  const s = due([[A, DAY]]);
  for (const [n, t] of [
    [4, "2026-10-05T16:04:00Z"],
    [2, "2026-10-05T16:02:00Z"],
    [1, "2026-10-05T16:05:00Z"],
    [3, "2026-10-05T16:03:00Z"],
  ] as const)
    wrong(s, `${A}#${n}`, A, t);
  const items = boss(s, DAY, pack)?.slots.map((x) => x.item);
  expect(items?.sort()).toEqual([`${A}#2`, `${A}#3`, `${A}#4`]);
});

test("a confident-wrong item of a topic that is not due does not appear", () => {
  const s = due([
    [A, DAY],
    [B, "2026-10-20"],
  ]);
  wrong(s, `${B}#1`, B, "2026-10-05T16:00:00Z");
  const b = boss(s, DAY, pack);
  expect(b?.topics).toEqual([A]);
  expect(b?.slots.every((x) => x.topic === A && x.item === null)).toBe(true);
});

test("same inputs give the same boss; another day gives another seed", () => {
  const s = due([
    [A, DAY],
    [B, DAY],
  ]);
  expect(boss(s, DAY, pack)).toEqual(boss(s, DAY, pack) as never);
  const next = addDays(DAY, 1);
  expect(boss(s, next, pack)?.seed).not.toBe(boss(s, DAY, pack)?.seed);
});

test("more due topics than the cap take the oldest", () => {
  const s = due([
    [A, "2026-10-05"],
    [B, "2026-10-04"],
    [C, "2026-10-03"],
    [D, "2026-10-02"],
    [E, "2026-10-01"],
  ]);
  const b = boss(s, DAY, pack);
  expect(b?.topics).toHaveLength(MAX_BOSS_TOPICS);
  expect(b?.topics).toEqual([E, D, C]);
  expect(b?.slots).toHaveLength(9);
});

test("the slots are mixed: over a month some boss is not grouped by topic", () => {
  // Two topics grouped (AAABBB or BBBAAA) change topic once between neighbours; mixed changes more.
  const changes = Array.from({ length: 30 }, (_, i) => {
    const slots =
      boss(
        due([
          [A, "2026-10-01"],
          [B, "2026-10-01"],
        ]),
        addDays("2026-10-01", i),
        pack,
      )?.slots ?? [];
    return slots.filter((x, k) => k > 0 && slots[k - 1]?.topic !== x.topic)
      .length;
  });
  expect(Math.max(...changes)).toBeGreaterThan(1);
});

test("a topic with no generator is filled from its other items", () => {
  const noGens = { ...pack, gens: {} };
  const s = due([[A, DAY]]);
  wrong(s, `${A}#2`, A, "2026-10-05T16:00:00Z");
  const slots = boss(s, DAY, noGens)?.slots ?? [];
  expect(slots).toHaveLength(3);
  expect(slots.every((x) => x.item !== null)).toBe(true);
  expect(slots.map((x) => x.item)).toContain(`${A}#2`);
  expect(new Set(slots.map((x) => x.item)).size).toBe(3);
});

test("a due topic with no generator and no items takes no place in the boss", () => {
  const empty = { ...pack, gens: {}, items: new Map() };
  expect(boss(due([[A, DAY]]), DAY, empty)).toBeNull();
  // It does not use up one of the MAX_BOSS_TOPICS places either.
  const onlyB = { ...pack, items: new Map([[B, pack.items.get(B) ?? []]]) };
  const b = boss(
    due([
      [A, "2026-10-01"],
      [B, "2026-10-02"],
    ]),
    DAY,
    { ...onlyB, gens: {} },
  );
  expect(b?.topics).toEqual([B]);
  expect(b?.slots.length).toBeGreaterThan(0);
});

test("unlabelled and answer-free: no topic title and no answer-bearing key", () => {
  const s = due([
    [A, DAY],
    [B, DAY],
    [C, DAY],
  ]);
  wrong(s, `${A}#1`, A, "2026-10-05T16:00:00Z");
  const b = boss(s, DAY, pack);
  expect(b).not.toBeNull();
  const json = JSON.stringify(b);
  for (const t of pack.topics) expect(json).not.toContain(t.title);
  for (const key of [
    "answers",
    "working",
    "mark_scheme",
    "misconceptions",
    "stem",
  ])
    expect(json).not.toContain(`"${key}"`);
});
