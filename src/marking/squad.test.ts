import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { loadCasePack } from "../api/case";
import type { Generator, Item, Topic } from "../content/types";
import { PARENT_SLOTS, roll, type SquadRound, squadRound } from "../flow/squad";

type SquadPage = {
  TEXT: Record<string, string | ((...args: never[]) => string)>;
  PARENT_SLOTS: number;
  buildRound: (
    round: SquadRound,
    topics: readonly Topic[],
    gens: Record<string, Generator>,
    quiz: unknown,
  ) => Item[];
  parentItems: (
    round: SquadRound,
    topics: readonly Topic[],
    gens: Record<string, Generator>,
    quiz: unknown,
  ) => Item[];
  roundBody: (
    week: string,
    results: { ok: boolean; answer: string; working: string }[],
  ) => unknown;
  daysText: (n: number) => string;
  totalText: (t: { score: number; of: number; rounds: number }) => string;
  memberOrder: (m: { pupil: string }[]) => { pupil: string }[];
};

// The browser files set globals, the way quiz.js does; nothing in them touches document at load.
const app = path.resolve(import.meta.dir, "../../app");
await import(path.join(app, "quiz.js"));
await import(path.join(app, "squad.js"));
const page = (globalThis as { squad?: SquadPage }).squad as SquadPage;
const quiz = (globalThis as { quiz?: unknown }).quiz;
const pack = await loadCasePack("maths");
const round = squadRound("year11-b", "2026-W41", pack) as SquadRound;
const gens = pack.gens as Record<string, Generator>;

test("browser roll = Bun roll: the page builds the same stems, answers and working from the served seeds", () => {
  const expected = roll(round, pack);
  const built = page.buildRound(round, pack.topics, gens, quiz);
  expect(built.map((i) => [i.stem, i.answers, i.working])).toEqual(
    expected.map((q) => [q.stem, q.answers, q.working]),
  );
  const parent = page.parentItems(round, pack.topics, gens, quiz);
  expect(parent.map((i) => i.stem)).toEqual(
    roll(round, pack, round.parentSeeds).map((q) => q.stem),
  );
  expect(page.PARENT_SLOTS).toBe(PARENT_SLOTS);
  expect(
    page.buildRound({ ...round, topic: "no/such" }, pack.topics, gens, quiz),
  ).toEqual([]);
});

test("helpers: the POST body carries answer and working only; days and total read as sentences; members go by name", () => {
  expect(
    page.roundBody("2026-W41", [{ ok: true, answer: "210", working: "w" }]),
  ).toEqual({ week: "2026-W41", answers: [{ answer: "210", working: "w" }] });
  expect(page.daysText(1)).toBe(
    "The squad week ends on Sunday. 1 day left, today included.",
  );
  expect(page.daysText(4)).toContain("4 days left");
  expect(page.totalText({ score: 12, of: 15, rounds: 3 })).toBe(
    "Squad total this week: 12 of 15 from 3 rounds.",
  );
  expect(page.totalText({ score: 4, of: 5, rounds: 1 })).toContain("1 round.");
  const members = [
    { pupil: "zoe", score: 5 },
    { pupil: "alex", score: 1 },
    { pupil: "mo", score: 3 },
  ];
  expect(page.memberOrder(members).map((m) => m.pupil)).toEqual([
    "alex",
    "mo",
    "zoe",
  ]);
});

const clean = (s: string) => ({
  s,
  bang: s.includes("!"),
  emoji: /[\u{2600}-\u{27BF}\u{2C00}-\u{10FFFF}]/u.test(s),
});
const sample = (v: string | ((...args: never[]) => string)) =>
  typeof v === "function" ? (v as (...a: unknown[]) => string)(2, 3, 4) : v;

test("register: no exclamation mark and no emoji in squad.html or any TEXT value", () => {
  const html = fs
    .readFileSync(path.join(app, "squad.html"), "utf8")
    .replace(/<[^>]+>/g, "");
  expect(clean(html)).toEqual({ s: html, bang: false, emoji: false });
  const strings = Object.values(page.TEXT).map(sample);
  expect(strings.length).toBeGreaterThan(30);
  for (const s of strings)
    expect(clean(s)).toEqual({ s, bang: false, emoji: false });
});

test("no ranking (AC 8): no ranking word in squad.html or squad.js", () => {
  const words =
    /\b(rank|ranking|ranked|leader|leaderboard|winner|top scorer|1st|2nd|3rd|place|beat|best score)\b/i;
  for (const file of ["squad.html", "squad.js"]) {
    const src = fs.readFileSync(path.join(app, file), "utf8");
    expect({ file, match: src.match(words)?.[0] ?? null }).toEqual({
      file,
      match: null,
    });
  }
});
