import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadCasePack } from "../api/case";
import type { CasePack, Item } from "../content/types";
import { appendEvent, readLines } from "../events/append";
import { parseEvent } from "../events/types";
import {
  attemptLine,
  chatReply,
  mockFetch,
  NO_MODEL,
  NOW,
  OPENAI,
  withData,
} from "../jobs/__fixtures__/provider";
import { reaches } from "../jobs/dan_wrong_step";
import { normaliseAnswer } from "../marking/normalise";
import { findItem } from "./chat";
import {
  chooseWrong,
  correction,
  danStep,
  hasTried,
  pickItem,
  rank,
  rankFor,
  triedTopics,
} from "./coach";

const pack = await loadCasePack("maths");
const TOPIC = "1MA1/R9/of-an-amount";
const TITLE = "Percentage of an amount";
const SEEDS = 50;

function item(id = `${TOPIC}#1`, seed?: number) {
  const found = findItem(pack, id, seed);
  if (found === null) throw new Error(`no item ${id}`);
  return found;
}

test("R8: chooseWrong is always one entry of the item's bank, over every item and 1,050 rolls, and is stable", () => {
  const seen: (Item & { seed?: number })[] = [...pack.items.values()].flat();
  // Topics with a generator: Year 11 rows have none yet (a3 plan).
  for (const t of pack.topics.filter(
    (x) => typeof pack.gens[x.aliases[0] ?? ""] === "function",
  ))
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const rolled = findItem(pack, `${t.id}#gen`, seed);
      if (rolled === null) throw new Error(`no roll for ${t.id}`);
      seen.push(rolled);
    }
  expect(seen.length).toBe(105 + 21 * SEEDS);
  for (const x of seen) {
    const w = chooseWrong(x);
    if (x.misconceptions.length === 0) {
      expect(w).toBeNull();
      continue;
    }
    if (w === null) throw new Error(`no step for ${x.id}`);
    expect(x.misconceptions).toContainEqual(w);
    expect(chooseWrong(x)).toEqual(w);
  }
});

test("R8: over the pack, Dan's fallback line reaches every wrong answer, and a line ending in a right answer reaches none", () => {
  const seen: (Item & { seed?: number })[] = [...pack.items.values()].flat();
  for (const t of pack.topics)
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const rolled = findItem(pack, `${t.id}#gen`, seed);
      if (rolled !== null) seen.push(rolled);
    }
  const leaks: string[] = [];
  for (const x of seen)
    for (const m of x.misconceptions) {
      if (!reaches([`I get ${m.answer}.`], m.answer))
        leaks.push(`${x.id} fallback misses ${m.answer}`);
      for (const a of x.answers ?? [])
        if (
          normaliseAnswer(a) !== normaliseAnswer(m.answer) &&
          reaches([`I get ${a}.`], m.answer)
        )
          leaks.push(`${x.id} right ${a} passes as ${m.answer}`);
    }
  expect(leaks).toEqual([]);
});

test("pickItem: a generator roll with a named wrong answer first, else an items-file item, else null; stable per base", () => {
  const gen = pickItem(pack, TOPIC, "2026-10-05:x:coach:0");
  expect(gen?.id).toBe(`${TOPIC}#gen`);
  expect(gen?.seed).toBeGreaterThanOrEqual(0);
  expect(gen?.misconceptions.length).toBeGreaterThan(0);
  expect(pickItem(pack, TOPIC, "2026-10-05:x:coach:0")).toEqual(gen);

  const noGen: CasePack = { ...pack, gens: {} };
  const file = pickItem(noGen, TOPIC, "b");
  expect(file?.id.startsWith(`${TOPIC}#`)).toBe(true);
  expect(file?.id.endsWith("#gen")).toBe(false);
  expect(file?.seed).toBeUndefined();
  expect(file?.misconceptions.length).toBeGreaterThan(0);

  const bare: CasePack = {
    ...noGen,
    items: new Map(
      [...pack.items].map(([k, v]) => [
        k,
        v.map((i) => ({ ...i, misconceptions: [] })),
      ]),
    ),
  };
  expect(pickItem(bare, TOPIC, "b")).toBeNull();
  expect(pickItem(pack, "1MA1/nope", "b")).toBeNull();

  const stems = new Set(
    ["a", "b", "c", "d", "e"].map((b) => pickItem(pack, TOPIC, b)?.stem),
  );
  expect(stems.size).toBeGreaterThanOrEqual(2);
});

test(
  "triedTopics and hasTried: an attempt on the topic, in pack order",
  withData(NO_MODEL, async (data) => {
    expect(triedTopics(readLines(data), pack)).toEqual([]);
    expect(hasTried(readLines(data), TOPIC)).toBe(false);
    const other = pack.topics[3]?.id as string;
    appendEvent(data, attemptLine({ id: `${other}#1`, topic: other }), NOW);
    appendEvent(data, attemptLine(item()), NOW);
    const log = readLines(data);
    expect(triedTopics(log, pack).map((t) => t.id)).toEqual([TOPIC, other]);
    expect(hasTried(log, TOPIC)).toBe(true);
    expect(hasTried(log, "1MA1/nope")).toBe(false);
  }),
);

test(
  "danStep: try-first, already-answered, skipped, the fallback line, the model's lines",
  withData(NO_MODEL, async (data) => {
    const { f, calls } = mockFetch(chatReply('{"lines":["x"]}'));
    const deps = { dataDir: data, fetch: f, now: NOW };
    const gen = item(`${TOPIC}#gen`, 7);
    expect(await danStep(gen, TITLE, readLines(data), deps)).toEqual({
      kind: "refused",
      reason: "try-first",
    });
    appendEvent(data, attemptLine(item()), NOW);
    const noBank = { ...gen, misconceptions: [] };
    expect(await danStep(noBank, TITLE, readLines(data), deps)).toEqual({
      kind: "skipped",
    });
    const wrong = chooseWrong(gen);
    const r = await danStep(gen, TITLE, readLines(data), deps);
    expect(r.kind).toBe("dan");
    if (r.kind !== "dan") throw new Error("expected dan");
    expect(r.by).toBe("fallback");
    expect(r.lines.join(" ")).toContain(wrong?.answer as string);
    expect(calls.length).toBe(0);
    appendEvent(data, attemptLine(gen, 7), NOW);
    expect(await danStep(gen, TITLE, readLines(data), deps)).toEqual({
      kind: "refused",
      reason: "already-answered",
    });
    // A new roll is never "already answered" by an older one: the seed is matched too.
    const again = await danStep(
      item(`${TOPIC}#gen`, 8),
      TITLE,
      readLines(data),
      deps,
    );
    expect(again.kind).toBe("dan");
  }),
);

test(
  "danStep: with a model a valid reply is by model",
  withData(OPENAI, async (data) => {
    appendEvent(data, attemptLine(item()), NOW);
    const gen = item(`${TOPIC}#gen`, 7);
    const wrong = chooseWrong(gen)?.answer as string;
    const { f } = mockFetch(
      chatReply(JSON.stringify({ lines: [`I get ${wrong}.`] })),
    );
    const r = await danStep(gen, TITLE, readLines(data), {
      dataDir: data,
      fetch: f,
      now: NOW,
    });
    expect(r).toEqual({ kind: "dan", lines: [`I get ${wrong}.`], by: "model" });
  }),
);

/** Both bodies through appendEvent in a temp dir, read back and parsed. */
function roundTrip(bodies: Parameters<typeof appendEvent>[1][]) {
  const dir = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "st-coach-")),
  );
  try {
    for (const b of bodies) appendEvent(dir, b, NOW);
    return readLines(dir).map((l) => parseEvent(l));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test(
  "correction: marked in code; caught on the right answer, named on the bank's wrong one; refused after an attempt",
  withData(NO_MODEL, async (data) => {
    const gen = item(`${TOPIC}#gen`, 7);
    expect(correction(gen, "1", true, readLines(data))).toEqual({
      kind: "refused",
      reason: "try-first",
    });
    appendEvent(data, attemptLine(item()), NOW);
    const log = readLines(data);
    const wrong = chooseWrong(gen);
    if (wrong === null) throw new Error("no bank");
    const right = gen.answers?.[0] as string;

    const hit = correction(gen, right, true, log);
    if (hit.kind !== "marked") throw new Error("expected marked");
    expect(hit).toMatchObject({
      correct: true,
      caught: true,
      named: null,
      wrong,
    });
    expect(hit.attempt).toEqual({
      v: 1,
      type: "attempt",
      item: gen.id,
      topic: TOPIC,
      correct: true,
      sure: true,
      answer: right,
      seed: 7,
    });
    expect(hit.record).toEqual({
      v: 1,
      type: "coach",
      topic: TOPIC,
      item: gen.id,
      seed: 7,
      wrong: wrong.answer,
      caught: true,
    });
    const back = roundTrip([hit.attempt, hit.record]);
    expect(back.map((e) => e?.type)).toEqual(["attempt", "coach"]);

    const miss = correction(gen, wrong.answer, false, log);
    if (miss.kind !== "marked") throw new Error("expected marked");
    expect(miss).toMatchObject({
      correct: false,
      caught: false,
      named: wrong.message,
    });
    expect(miss.record).toMatchObject({ caught: false, wrong: wrong.answer });

    // #2: #1 is the attempt that opened the topic, so it is already answered.
    const onFile = correction(item(`${TOPIC}#2`), "x", true, log);
    if (onFile.kind !== "marked") throw new Error("expected marked");
    expect("seed" in onFile.attempt).toBe(false);
    expect("seed" in onFile.record).toBe(false);
    expect(correction({ ...gen, misconceptions: [] }, "1", true, log)).toEqual({
      kind: "skipped",
    });

    appendEvent(data, attemptLine(gen, 7), NOW);
    expect(correction(gen, right, true, readLines(data))).toEqual({
      kind: "refused",
      reason: "already-answered",
    });
  }),
);

test("rankFor and rank: 3 catches per rank, 5 ranks, toNext null at the top", () => {
  expect(rankFor(0)).toBe(0);
  expect(rankFor(2)).toBe(0);
  expect(rankFor(3)).toBe(1);
  expect(rankFor(12)).toBe(4);
  expect(rankFor(40)).toBe(4);
  expect(rank(0)).toEqual({ level: 0, name: "Noob", toNext: 3 });
  // derived: 6 − 4
  expect(rank(4)).toEqual({ level: 1, name: "Learner", toNext: 2 });
  expect(rank(12)).toEqual({ level: 4, name: "Sorted", toNext: null });
});
