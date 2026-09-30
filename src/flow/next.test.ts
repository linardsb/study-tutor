import { expect, test } from "bun:test";
import { loadCasePack } from "../api/case";
import { replay, type State } from "../events/replay";
import { type NewEvent, parseEvent } from "../events/types";
import { nextStep } from "./next";

const pack = await loadCasePack("maths");
const DAY = "2026-10-10";
const ids = pack.topics.map((t) => t.id);
const first = ids[0] as string;
const fifth = ids[4] as string;

const set = (s: State, id: string, rung: 0 | 1 | 2, nextDue: string | null) => {
  s.topics[id] = { rung, nextDue, rag: s.topics[id]?.rag ?? null };
};

const parses = (body: NewEvent) =>
  parseEvent(JSON.stringify({ ...body, t: "2026-10-10T16:00:00Z" }));

test("an empty state gives a lesson on the first pack topic", () => {
  const n = nextStep(replay([]), DAY, pack, 3);
  expect(n.step).toEqual({
    kind: "lesson",
    topic: first,
    start: {
      v: 1,
      type: "session",
      phase: "start",
      mode: "lesson",
      topic: first,
    },
  });
  if (n.step.kind === "lesson") expect(parses(n.step.start)).not.toBeNull();
  expect(n.flame).toEqual({ week: "2026-W41", days: 0, target: 3 });
});

test("an intake red on the fifth topic sends the lesson there", () => {
  const s = replay([
    `{"v":1,"t":"2026-10-05T16:00:00Z","type":"intake","door":"sheet","topics":[{"topic":"${fifth}","rag":"R"}]}`,
  ]);
  const n = nextStep(s, DAY, pack, 3);
  expect(n.step.kind === "lesson" && n.step.topic).toBe(fifth);
});

test("a due topic gives the boss, even with a red topic unstarted", () => {
  const s = replay([]);
  set(s, first, 1, DAY);
  s.topics[fifth] = { rung: 0, nextDue: null, rag: "R" };
  const n = nextStep(s, DAY, pack, 3);
  expect(n.step.kind).toBe("boss");
  if (n.step.kind !== "boss") return;
  expect(n.step.start).toEqual({
    v: 1,
    type: "session",
    phase: "start",
    mode: "boss",
  });
  expect(parses(n.step.start)).not.toBeNull();
  expect(n.step.boss.topics).toEqual([first]);
});

test("a session opened today continues with its end body; one from yesterday does not", () => {
  const start = `{"v":1,"t":"2026-10-10T16:00:00Z","type":"session","phase":"start","mode":"practice","topic":"${first}"}`;
  const n = nextStep(replay([start]), DAY, pack, 3);
  expect(n.step).toEqual({
    kind: "continue",
    mode: "practice",
    topic: first,
    end: {
      v: 1,
      type: "session",
      phase: "end",
      mode: "practice",
      topic: first,
    },
  });
  if (n.step.kind === "continue") expect(parses(n.step.end)).not.toBeNull();
  expect(nextStep(replay([start]), "2026-10-11", pack, 3).step.kind).toBe(
    "lesson",
  );
});

test("every topic started and none due gives practice on the lowest rung, then earliest nextDue", () => {
  const s = replay([]);
  for (const id of ids) set(s, id, 2, "2026-11-01");
  set(s, ids[7] as string, 1, "2026-10-20");
  set(s, ids[3] as string, 1, "2026-10-15");
  const n = nextStep(s, DAY, pack, 3);
  expect(n.step).toEqual({
    kind: "practice",
    topic: ids[3] as string,
    start: {
      v: 1,
      type: "session",
      phase: "start",
      mode: "practice",
      topic: ids[3] as string,
    },
  });
});

test("a new topic whose prerequisite is not started is skipped for a lesson", () => {
  const dependent = pack.topics.find((t) => t.prerequisites.length > 0);
  if (dependent === undefined) throw new Error("the pack has no prerequisite");
  const s = replay([]);
  s.topics[dependent.id] = { rung: 0, nextDue: null, rag: "R" };
  const n = nextStep(s, DAY, pack, 3);
  expect(n.step.kind).toBe("lesson");
  expect(n.step.kind === "lesson" && n.step.topic).not.toBe(dependent.id);
  // Once the prerequisite is started (and not due), the red dependent comes first.
  for (const p of dependent.prerequisites) set(s, p, 1, "2026-10-20");
  const m = nextStep(s, DAY, pack, 3);
  expect(m.step.kind === "lesson" && m.step.topic).toBe(dependent.id);
});

test("an empty pack gives none; the flame echoes the weekly target", () => {
  const empty = { topics: [], items: new Map(), gens: {} };
  const n = nextStep(replay([]), DAY, empty, 5);
  expect(n.step).toEqual({ kind: "none" });
  expect(n.flame.target).toBe(5);
});

test("deterministic: two calls give the same step", () => {
  const s = replay([]);
  set(s, first, 1, DAY);
  set(s, ids[1] as string, 1, DAY);
  expect(nextStep(s, DAY, pack, 3)).toEqual(nextStep(s, DAY, pack, 3) as never);
});

test("a new topic with no items is skipped for a lesson; the next one is picked", () => {
  const items = new Map(pack.items);
  items.set(first, []);
  const n = nextStep(replay([]), DAY, { ...pack, items }, 3);
  expect(n.step.kind === "lesson" && n.step.topic).toBe(ids[1] as string);
});
