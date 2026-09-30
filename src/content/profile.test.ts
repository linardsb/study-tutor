import { expect, test } from "bun:test";
import { chosenOf, filterPack, filterTopics } from "./profile";
import type { CasePack, Course, Topic } from "./types";

const courses: Course[] = [
  { spec: "AA1", board: "B", title: "Tiered", tiers: ["F", "H"] },
  { spec: "BB1", board: "B", title: "Untiered", tiers: [] },
];
const topic = (id: string, tier: "F" | "H"): Topic => ({
  id,
  title: id,
  aliases: [],
  prerequisites: [],
  tier,
});
const topics = [
  topic("AA1/F1", "F"),
  topic("AA1/H1", "H"),
  topic("BB1/X1", "F"),
  topic("BB1/X2", "H"),
];
const ids = (ts: readonly Topic[]) => ts.map((t) => t.id);

test("filterTopics: Foundation keeps F only, Higher keeps F and H, untiered keeps all, two courses union", () => {
  expect(
    ids(filterTopics(topics, [{ spec: "AA1", tier: "F" }], courses)),
  ).toEqual(["AA1/F1"]);
  expect(
    ids(filterTopics(topics, [{ spec: "AA1", tier: "H" }], courses)),
  ).toEqual(["AA1/F1", "AA1/H1"]);
  expect(ids(filterTopics(topics, [{ spec: "BB1" }], courses))).toEqual([
    "BB1/X1",
    "BB1/X2",
  ]);
  expect(
    ids(
      filterTopics(
        topics,
        [{ spec: "AA1", tier: "F" }, { spec: "BB1" }],
        courses,
      ),
    ),
  ).toEqual(["AA1/F1", "BB1/X1", "BB1/X2"]);
});

test("filterTopics and filterPack: nothing chosen gives the same object back", () => {
  expect(filterTopics(topics, [], courses)).toBe(topics);
  const pack: CasePack = { topics, items: new Map(), gens: {} };
  expect(filterPack(pack, [], courses)).toBe(pack);
});

test("filterPack: only topics narrow; items and generators are the same objects", () => {
  const pack: CasePack = { topics, items: new Map(), gens: {} };
  const p = filterPack(pack, [{ spec: "BB1" }], courses);
  expect(ids(p.topics)).toEqual(["BB1/X1", "BB1/X2"]);
  expect(p.items).toBe(pack.items);
  expect(p.gens).toBe(pack.gens);
});

test("chosenOf: keeps valid entries, drops stale specs, wrong tiers, repeats and anything not a list", () => {
  expect(chosenOf(undefined, courses)).toEqual([]);
  expect(chosenOf("x", courses)).toEqual([]);
  expect(
    chosenOf(
      [
        { spec: "ZZ9", tier: "F" }, // stale: no such course
        { spec: "AA1" }, // tiered course, no tier
        { spec: "AA1", tier: "X" }, // not a tier
        "AA1",
        null,
        { spec: "AA1", tier: "H", extra: 1 },
        { spec: "AA1", tier: "F" }, // repeat: the first wins
        { spec: "BB1", tier: "F" }, // untiered course with a tier
      ],
      courses,
    ),
  ).toEqual([{ spec: "AA1", tier: "H" }]);
  expect(chosenOf([{ spec: "BB1" }], courses)).toEqual([{ spec: "BB1" }]);
});
