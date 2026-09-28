/**
 * O5 detective case, pure: no clock, no file, no Math.random. The route passes the day in; the same
 * day, seed and pack always give the same case. Nothing here reaches a model prompt (this ticket has
 * no job): the case's answer goes to the browser the way item answers already do.
 */
import { lcg } from "../content/generators";
import type {
  CasePack,
  Generated,
  Generator,
  Item,
  Topic,
} from "../content/types";
import type { CaseRecord } from "../events/replay";

export const NO_NOTE = "No note needed. The answer is right.";
export const KAI = "Kai";
const RIGHT_ONE_IN = 4; // Kai's answer is the right one one time in four
const ROLLS = 8; // generator rolls tried before a re-ask gives up on fresh numbers
const LAST = 7; // answers the calibration line covers

export type CaseSource =
  | { kind: "mistake"; topic: string; item: string }
  | { kind: "rule"; topic: string };
export type CaseOption = string;
export type Case = {
  kind: "mistake" | "rule";
  topic: string;
  title: string;
  item: string | null;
  stem: string;
  figure?: string;
  scaffold?: string;
  shown: string | null; // Kai's answer (mistake) or null (rule)
  instances: { stem: string; answer: string }[]; // three for a rule case, [] for a mistake case
  question: string; // "Which note goes to Kai?" or "What is the rule?"
  options: CaseOption[];
  correct: number; // index into options; the page hides it until the check
  working: string; // hidden until the check
};

/** FNV-1a, 32 bit, the v1 constants. Seeds a day so the same date gives the same case. */
export function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Fisher-Yates with the given rng; the input is not changed. */
export function shuffle<T>(list: readonly T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

/** An item can be planted only when it has an answer, a working and at least one named mistake. */
const eligible = (i: Item): boolean =>
  (i.answers?.length ?? 0) > 0 &&
  typeof i.working === "string" &&
  i.misconceptions.length > 0;

const generatorOf = (pack: CasePack, topic: Topic): Generator | null => {
  const gen = pack.gens[topic.aliases[0] ?? ""];
  return typeof gen === "function" ? gen : null;
};

/** Every source a case can come from, in pack order. An item with no misconception is skipped here and nowhere else. */
export function casePool(pack: CasePack): CaseSource[] {
  const out: CaseSource[] = [];
  for (const t of pack.topics) {
    for (const i of pack.items.get(t.id) ?? [])
      if (eligible(i)) out.push({ kind: "mistake", topic: t.id, item: i.id });
    if (t.concept && generatorOf(pack, t))
      out.push({ kind: "rule", topic: t.id });
  }
  return out;
}

/**
 * Topic first (the seeded topic when it is in the pool, else a hash of the day), then the source in
 * the topic from a hash of day and topic; a concept topic gives its rule case on half its days.
 * Uniform over sources would give a rule case 3 times in 108 (plan N5).
 */
export function pickCase(
  day: string,
  seed: string | null,
  pool: readonly CaseSource[],
): CaseSource | null {
  if (pool.length === 0) return null;
  const topics = [...new Set(pool.map((s) => s.topic))];
  const topic =
    seed !== null && topics.includes(seed)
      ? seed
      : (topics[hash(day) % topics.length] as string);
  const h = hash(`${day}:${topic}`);
  const rule = pool.find((s) => s.kind === "rule" && s.topic === topic) ?? null;
  if (rule && h % 2 === 0) return rule;
  const mistakes = pool.filter(
    (s) => s.kind === "mistake" && s.topic === topic,
  );
  if (mistakes.length === 0) return rule;
  return mistakes[h % mistakes.length] ?? null;
}

const dedupe = (xs: readonly string[]): string[] => [...new Set(xs)];

/** Day order for YYYY-MM-DD keys; a bare sort() is a Sonar reliability bug (PR #31 F1). */
function byDay(a: string, b: string): number {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

/** A planted mistake from an item-shaped source. The rng decides the option order and whether Kai was right. */
function mistakeCase(
  topic: Topic,
  item: Pick<
    Item,
    "stem" | "figure" | "scaffold" | "answers" | "working" | "misconceptions"
  >,
  itemId: string | null,
  rng: () => number,
): Case | null {
  const answer = item.answers?.[0];
  if (
    answer === undefined ||
    item.working === undefined ||
    item.misconceptions.length === 0
  )
    return null;
  const options = shuffle(
    [...dedupe(item.misconceptions.map((m) => m.message)), NO_NOTE],
    rng,
  );
  let shown: string;
  let correct: number;
  if (Math.floor(rng() * RIGHT_ONE_IN) === 0) {
    shown = answer;
    correct = options.indexOf(NO_NOTE);
  } else {
    const m =
      item.misconceptions[Math.floor(rng() * item.misconceptions.length)];
    if (!m) return null;
    shown = m.answer;
    correct = options.indexOf(m.message);
  }
  return {
    kind: "mistake",
    topic: topic.id,
    title: topic.title,
    item: itemId,
    stem: item.stem,
    ...(item.figure === undefined ? {} : { figure: item.figure }),
    ...(item.scaffold === undefined ? {} : { scaffold: item.scaffold }),
    shown,
    instances: [],
    question: `Which note goes to ${KAI}?`,
    options,
    correct,
    working: item.working,
  };
}

/** Three contrasting instances (distinct answers when the generator allows) and the rule among its distractors. */
function ruleCase(topic: Topic, gen: Generator, rng: () => number): Case {
  const concept = topic.concept;
  if (!concept) throw new Error(`${topic.id} is not a concept topic`);
  const distinct: Generated[] = [];
  const rest: Generated[] = [];
  const seen = new Set<string>();
  for (let k = 0; k < 3 * ROLLS && distinct.length < 3; k += 1) {
    const g = gen(rng);
    const a = g.answers[0] ?? "";
    if (seen.has(a)) rest.push(g);
    else {
      seen.add(a);
      distinct.push(g);
    }
  }
  const instances = [...distinct, ...rest]
    .slice(0, 3)
    .map((g) => ({ stem: g.stem, answer: g.answers[0] ?? "" }));
  const options = shuffle([concept.rule, ...concept.distractors], rng);
  return {
    kind: "rule",
    topic: topic.id,
    title: topic.title,
    item: null,
    stem: topic.title,
    shown: null,
    instances,
    question: "What is the rule?",
    options,
    correct: options.indexOf(concept.rule),
    working: concept.rule,
  };
}

const topicOf = (pack: CasePack, id: string): Topic | null =>
  pack.topics.find((t) => t.id === id) ?? null;

/** The case the page renders for a source on a day, or null when the source is no longer in the pack. */
export function buildCase(
  src: CaseSource,
  day: string,
  pack: CasePack,
): Case | null {
  const topic = topicOf(pack, src.topic);
  if (!topic) return null;
  if (src.kind === "rule") {
    const gen = generatorOf(pack, topic);
    if (!gen || !topic.concept) return null;
    return ruleCase(topic, gen, lcg(hash(`${day}:${src.topic}:rule`)));
  }
  const item = (pack.items.get(topic.id) ?? []).find((i) => i.id === src.item);
  if (!item) return null;
  return mistakeCase(topic, item, item.id, lcg(hash(`${day}:${src.item}`)));
}

/**
 * The same idea with fresh numbers after a confident-wrong answer: a generator roll with a named wrong
 * answer, else the next eligible item of the topic, else null. A rule source gets its rule case again
 * with a different rng, so the instances and the option order differ.
 */
export function buildReask(
  src: CaseSource,
  day: string,
  pack: CasePack,
): Case | null {
  const topic = topicOf(pack, src.topic);
  if (!topic) return null;
  const rng = lcg(hash(`${day}:${src.topic}:again`));
  const gen = generatorOf(pack, topic);
  if (src.kind === "rule") {
    if (!gen || !topic.concept) return null;
    return ruleCase(topic, gen, rng);
  }
  if (gen) {
    for (let k = 0; k < ROLLS; k += 1) {
      const g = gen(rng);
      const wrong = Object.entries(g.wrong ?? {});
      if (wrong.length === 0) continue;
      return mistakeCase(
        topic,
        {
          stem: g.stem,
          answers: g.answers,
          working: g.working,
          misconceptions: wrong.map(([answer, message]) => ({
            answer,
            message,
          })),
        },
        null,
        rng,
      );
    }
  }
  const items = (pack.items.get(topic.id) ?? []).filter(eligible);
  const at = items.findIndex((i) => i.id === src.item);
  const next = items[(at + 1) % items.length];
  if (next === undefined || next.id === src.item) return null;
  return mistakeCase(topic, next, next.id, rng);
}

/** Sum of the last `last` bets and of those the pupil won, records in day order, re-asks included (plan Q4). */
export function calibration(
  records: Readonly<Record<string, CaseRecord>>,
  last = LAST,
): { predicted: number; scored: number; n: number } {
  const pairs = Object.keys(records)
    .sort(byDay)
    .flatMap((day) => records[day]?.bets ?? [])
    .slice(-last);
  let predicted = 0;
  let scored = 0;
  for (const [bet, correct] of pairs) {
    predicted += bet;
    if (correct) scored += bet;
  }
  return { predicted, scored, n: pairs.length };
}
