import { expect, test } from "bun:test";
import path from "node:path";
import { loadCasePack } from "../api/case";
import { replay } from "../events/replay";
import { MODES, type NewEvent } from "../events/types";
import { RUNGS } from "../flow/ladder";
import { nextStep, type Step } from "../flow/next";
import { endBody } from "../flow/session";

type Action = { label: string; href?: string; post?: NewEvent };
type Map = {
  TEXT: Record<string, string | ((...args: never[]) => string)>;
  MODE_NAMES: Record<string, string>;
  RUNGS: string[];
  dayDiff: (a: string, b: string) => number;
  dueText: (nextDue: string | null, day: string) => string;
  cardClass: (rag: string | null) => string;
  stepText: (step: Step, titles: Record<string, string>) => string;
  stepActions: (
    step: Step,
    lessons: Record<string, string>,
    query: string,
  ) => Action[];
  photoStats: (
    state: {
      photos?: Record<string, { marks: number; of: number; clean: number }>;
    },
    week: string,
  ) => { left: number; lastLeft: number | null; clean: number } | null;
};

// The browser file sets a global, the way case.js does; nothing in it touches document at load.
await import(path.resolve(import.meta.dir, "../../app/map.js"));
const map = (globalThis as { map?: Map }).map;
if (!map) throw new Error("app/map.js did not set map");

const pack = await loadCasePack("maths");
const DAY = "2026-10-10";
const first = pack.topics[0]?.id as string;
const titles = Object.fromEntries(pack.topics.map((t) => [t.id, t.title]));
const lessons = { [first]: "/content/maths/lessons/0001-x.html" };

test("RUNGS and MODE_NAMES in the browser match the server's ladder and session modes", () => {
  expect(map.RUNGS).toEqual([...RUNGS]);
  expect(Object.keys(map.MODE_NAMES).sort()).toEqual([...MODES].sort());
});

test("dueText: nothing without a date, today, days ahead, days overdue, and calendar days across the BST switch", () => {
  expect(map.dueText(null, DAY)).toBe("");
  expect(map.dueText(DAY, DAY)).toBe("re-test due today");
  expect(map.dueText("2026-10-11", DAY)).toBe("re-test in 1 day");
  expect(map.dueText("2026-10-20", DAY)).toBe("re-test in 10 days");
  expect(map.dueText("2026-10-09", DAY)).toBe("re-test 1 day overdue");
  expect(map.dueText("2026-10-07", DAY)).toBe("re-test 3 days overdue");
  expect(map.dueText("2026-03-30", "2026-03-27")).toBe("re-test in 3 days");
  expect(map.cardClass("R")).toBe("r");
  expect(map.cardClass("G")).toBe("g");
  expect(map.cardClass(null)).toBe("o");
});

test("a lesson step from the real flow: the text names the topic and the action posts step.start by identity, then opens the lesson", () => {
  const step = nextStep(replay([]), DAY, pack, 3).step;
  expect(step.kind).toBe("lesson");
  expect(map.stepText(step, titles)).toBe("Next: Percentage of an amount.");
  const actions = map.stepActions(step, lessons, "");
  expect(actions).toHaveLength(1);
  expect(actions[0]?.label).toBe("Start the lesson");
  expect(actions[0]?.post).toBe((step as { start: NewEvent }).start);
  expect(actions[0]?.href).toBe(lessons[first]);
  // no lesson file: the button only records the start
  expect(map.stepActions(step, {}, "")[0]).not.toHaveProperty("href");
});

test("a continue step: Open it goes to the mode's page, Done posts the served end body by identity; a case has no page", () => {
  const end = endBody({ mode: "lesson", topic: first, t: `${DAY}T16:00:00Z` });
  const open: Step = { kind: "continue", mode: "lesson", topic: first, end };
  expect(map.stepText(open, titles)).toBe(
    "Lesson open: Percentage of an amount.",
  );
  const actions = map.stepActions(open, lessons, "");
  expect(actions.map((a) => a.label)).toEqual(["Open it", "Done with it"]);
  expect(actions[0]?.href).toBe(lessons[first]);
  expect(actions.filter((a) => a.post)).toHaveLength(1);
  expect(actions[1]?.post).toBe(end);

  const caseEnd = endBody({ mode: "case", topic: null, t: `${DAY}T16:00:00Z` });
  const openCase: Step = {
    kind: "continue",
    mode: "case",
    topic: null,
    end: caseEnd,
  };
  expect(map.stepText(openCase, titles)).toBe("Case open.");
  expect(map.stepActions(openCase, lessons, "")).toEqual([
    { label: "Done with it", post: caseEnd },
  ]);

  const openBoss: Step = { kind: "continue", mode: "boss", topic: null, end };
  expect(map.stepActions(openBoss, lessons, "?day=2026-10-10")[0]?.href).toBe(
    "/retest.html?day=2026-10-10",
  );
  const openPractice: Step = {
    kind: "continue",
    mode: "practice",
    topic: first,
    end,
  };
  expect(map.stepActions(openPractice, lessons, "")[0]?.href).toBe(
    `/practice.html?topic=${encodeURIComponent(first)}`,
  );
});

test("boss, practice and none steps; the boss href carries ?day=; an unknown topic falls back to its id", () => {
  const boss: Step = {
    kind: "boss",
    boss: { day: DAY, seed: 1, topics: [first], slots: [] },
    start: { v: 1, type: "session", phase: "start", mode: "boss" },
  };
  expect(map.stepText(boss, titles)).toBe(
    "Boss ready. 0 questions from 1 topic due a re-test. No hints, one go each.",
  );
  expect(map.stepActions(boss, lessons, "?day=2026-10-10")).toEqual([
    { label: "Start the boss", href: "/retest.html?day=2026-10-10" },
  ]);
  const practice: Step = {
    kind: "practice",
    topic: "U999",
    start: {
      v: 1,
      type: "session",
      phase: "start",
      mode: "practice",
      topic: "U999",
    },
  };
  expect(map.stepText(practice, titles)).toBe("Practice: U999.");
  const [action] = map.stepActions(practice, lessons, "");
  expect(action?.post).toBe(practice.start);
  expect(action?.href).toBe("/practice.html?topic=U999");
  expect(map.stepText({ kind: "none" }, titles)).toBe(
    "Nothing to do. The pack is empty.",
  );
  expect(map.stepActions({ kind: "none" }, lessons, "")).toEqual([]);
});

test("register: no exclamation mark and no emoji in any map string", () => {
  const strings = [
    ...map.RUNGS,
    ...Object.values(map.MODE_NAMES),
    ...Object.values(map.TEXT).map((v) =>
      typeof v === "function" ? (v as (...a: unknown[]) => string)(2, 3) : v,
    ),
  ];
  expect(strings.length).toBeGreaterThan(20);
  for (const s of strings) {
    expect({ s, bang: s.includes("!") }).toEqual({ s, bang: false });
    expect({
      s,
      emoji: /[\u{2600}-\u{27BF}\u{2C00}-\u{10FFFF}]/u.test(s),
    }).toEqual({
      s,
      emoji: false,
    });
  }
});

test("photoStats: none, one week, and the latest earlier week", () => {
  const w = (marks: number, of: number, clean: number) => ({
    marks,
    of,
    clean,
  });
  expect(map.photoStats({}, "2026-W42")).toBeNull();
  expect(
    map.photoStats({ photos: { "2026-W41": w(1, 5, 0) } }, "2026-W42"),
  ).toBeNull();
  expect(
    map.photoStats({ photos: { "2026-W42": w(3, 5, 1) } }, "2026-W42"),
  ).toEqual({
    left: 2,
    lastLeft: null,
    clean: 1,
  });
  expect(
    map.photoStats(
      {
        photos: {
          "2026-W09": w(0, 5, 0),
          "2026-W40": w(1, 5, 0),
          "2026-W42": w(8, 10, 2),
          "2026-W43": w(0, 5, 0),
        },
      },
      "2026-W42",
    ),
  ).toEqual({ left: 2, lastLeft: 4, clean: 2 });
});
