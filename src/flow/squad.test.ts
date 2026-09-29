import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { loadCasePack } from "../api/case";
import type { CasePack } from "../content/types";
import {
  comparable,
  daysLeft,
  markRound,
  PARENT_SLOTS,
  parseSquadFile,
  pool,
  roll,
  SQUAD_SLOTS,
  type SquadFile,
  type SquadRound,
  slug,
  squadRound,
} from "./squad";

const pack = await loadCasePack("maths");
const ROOT = path.resolve(import.meta.dir, "../..");
const round = squadRound("year11-b", "2026-W41", pack) as SquadRound;

const file = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  v: 1,
  app: "0.1.0",
  squad: "year11-b",
  pupil: "alex",
  week: "2026-W41",
  topic: round.topic,
  seeds: round.seeds,
  answers: [
    { answer: "210", working: "0.6 x 350", correct: true },
    { answer: "1", working: "", correct: false },
  ],
  score: 1,
  of: 2,
  ...over,
});

test("slug: trims, lowers and dashes; refuses paths, empties, long names and Windows device names", () => {
  expect(slug(" Year 11 B ")).toBe("year-11-b");
  expect(slug(" Year11 B")).toBe("year11-b");
  for (const bad of [
    "../x",
    "",
    "   ",
    "a/b",
    "a\\b",
    "x".repeat(40),
    "CON",
    "nul",
    "com1",
    "lpt9",
    "-x",
    12,
    null,
  ])
    expect(slug(bad)).toBeNull();
  expect(slug("con-1")).toBe("con-1");
  expect(slug("com10")).toBe("com10");
});

test("squadRound: deterministic; its topic has a generator; 5 distinct seeds and 3 parent seeds apart from them", () => {
  expect(squadRound("year11-b", "2026-W41", pack)).toEqual(round);
  const code = pack.topics.find((t) => t.id === round.topic)?.aliases[0];
  expect(typeof pack.gens[code ?? ""]).toBe("function");
  expect(new Set(round.seeds).size).toBe(SQUAD_SLOTS);
  expect(new Set(round.parentSeeds).size).toBe(PARENT_SLOTS);
  for (const s of round.parentSeeds) expect(round.seeds).not.toContain(s);
  const otherWeek = squadRound("year11-b", "2026-W42", pack) as SquadRound;
  const otherSquad = squadRound("year11-c", "2026-W41", pack) as SquadRound;
  expect(otherWeek.seeds).not.toEqual(round.seeds);
  expect(otherSquad.seeds).not.toEqual(round.seeds);
});

test("squadRound: null when the pack has no generator", () => {
  const bare: CasePack = { topics: pack.topics, items: pack.items, gens: {} };
  expect(squadRound("year11-b", "2026-W41", bare)).toBeNull();
});

test("golden: year11-b in 2026-W41 is percentage of an amount with these five stems (a drift here changes every squad's questions)", () => {
  expect(round.topic).toBe("1MA1/R9/of-an-amount");
  expect(roll(round, pack).map((q) => q.stem)).toEqual([
    "Find 60% of 350.",
    "Find 35% of 240.",
    "Find 55% of 80.",
    "Find 12% of 40.",
    "Find 35% of 300.",
  ]);
  expect(roll(round, pack, round.parentSeeds)).toHaveLength(PARENT_SLOTS);
});

test("daysLeft: Monday 7 … Sunday 1", () => {
  const days = [
    "2026-10-05",
    "2026-10-06",
    "2026-10-07",
    "2026-10-08",
    "2026-10-09",
    "2026-10-10",
    "2026-10-11",
  ];
  expect(days.map(daysLeft)).toEqual([7, 6, 5, 4, 3, 2, 1]);
});

test("markRound: normalised comparison; working kept; an empty answer is wrong", () => {
  const qs = [
    { stem: "a", answers: ["4.5"], working: "", hint: "", wrong: {} },
    { stem: "b", answers: ["12"], working: "", hint: "", wrong: {} },
    { stem: "c", answers: ["7"], working: "", hint: "", wrong: {} },
  ];
  const marked = markRound(qs, [
    { answer: " 4.50 ", working: "w" },
    { answer: "13", working: "" },
    { answer: "", working: "" },
  ]);
  expect(marked).toEqual([
    { answer: " 4.50 ", working: "w", correct: true },
    { answer: "13", working: "", correct: false },
    { answer: "", working: "", correct: false },
  ]);
});

test("parseSquadFile: a good file parses with stray keys dropped; each bad shape is refused", () => {
  const ok = parseSquadFile({ ...file(), extra: "<script>" }) as SquadFile;
  expect(ok).toEqual(file() as unknown as SquadFile);
  expect("extra" in ok).toBe(false);
  const bad: unknown[] = [
    null,
    [],
    "x",
    file({ v: 2 }),
    file({ pupil: "../x" }),
    file({ squad: "Year 11" }),
    file({ of: 3 }),
    file({ score: 2 }),
    file({ answers: [{ answer: "1", working: "", correct: "yes" }] }),
    file({ week: "2026-41" }),
    file({ seeds: [1.5] }),
    file({ app: 1 }),
  ];
  for (const b of bad) expect(parseSquadFile(b)).toBeNull();
});

test("comparable: false on another topic, other seeds or another week", () => {
  const f = parseSquadFile(file()) as SquadFile;
  expect(comparable(round, f)).toBe(true);
  expect(comparable(round, { ...f, topic: "1MA1/N1" })).toBe(false);
  expect(comparable(round, { ...f, seeds: [...f.seeds].reverse() })).toBe(
    false,
  );
  expect(comparable(round, { ...f, seeds: f.seeds.slice(1) })).toBe(false);
  expect(comparable(round, { ...f, week: "2026-W40" })).toBe(false);
});

test("pool: sums score and of and counts rounds", () => {
  expect(pool([])).toEqual({ score: 0, of: 0, rounds: 0 });
  expect(
    pool([
      { score: 4, of: 5 },
      { score: 1, of: 5 },
    ]),
  ).toEqual({ score: 5, of: 10, rounds: 2 });
});

/** One Bun process: the round for `squad` in 2026-W41, printed as stems and answers. */
function spawnRound(squad: string, env: Record<string, string>) {
  const script = `
    import { loadCasePack } from "./src/api/case";
    import { roll, squadRound } from "./src/flow/squad";
    const pack = await loadCasePack("maths");
    const r = squadRound(${JSON.stringify(squad)}, "2026-W41", pack);
    console.log(JSON.stringify(roll(r, pack).map((q) => ({ stem: q.stem, answers: q.answers }))));
  `;
  const out = Bun.spawnSync(["bun", "-e", script], {
    cwd: ROOT,
    env: { ...Bun.env, ...env },
  });
  return { code: out.exitCode, stdout: out.stdout.toString() };
}

test("two machines (AC 1): the same squad and week give byte-identical questions in two Bun processes with different time zones and locales", () => {
  const london = spawnRound("year11-b", {
    TZ: "Europe/London",
    LANG: "en_GB.UTF-8",
    LC_ALL: "en_GB.UTF-8",
  });
  const auckland = spawnRound("year11-b", {
    TZ: "Pacific/Auckland",
    LANG: "de_DE.UTF-8",
    LC_ALL: "de_DE.UTF-8",
  });
  expect(london.code).toBe(0);
  expect(auckland.code).toBe(0);
  expect(london.stdout.trim().length).toBeGreaterThan(0);
  expect(auckland.stdout).toBe(london.stdout);
  expect(JSON.parse(london.stdout)).toHaveLength(SQUAD_SLOTS);
  const other = spawnRound("year11-c", { TZ: "Europe/London" });
  expect(other.code).toBe(0);
  expect(other.stdout).not.toBe(london.stdout);
});

test("generators.js depends only on its rng: no locale, clock or Math.random", () => {
  const src = fs.readFileSync(
    path.join(ROOT, "content/maths/generators.js"),
    "utf8",
  );
  expect(src).not.toMatch(/toLocale|Intl\.|new Date|Date\.now|Math\.random/);
});
