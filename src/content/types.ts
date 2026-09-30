/** Item types, architecture D5. The first five mark in code; the last three go to a job with a mark scheme. */
export type ItemType =
  | "generator"
  | "cloze"
  | "label"
  | "sequence"
  | "vocab"
  | "short"
  | "extended"
  | "practical-method";

export type Tier = "F" | "H";

/** One exam-board specification a pack teaches, from content/<subject>/courses.json. `tiers: []` means untiered. */
export interface Course {
  spec: string;
  board: string;
  title: string;
  tiers: Tier[];
}

/** A course the pupil takes, from profile.json; `tier` only on a tiered course. */
export type Chosen = { spec: string; tier?: Tier };

/**
 * Topic id grammar: `<spec>/<statement>` (for example `1MA1/R4`) when one lesson sits under the
 * statement; `<spec>/<statement>/<slug>` (for example `1MA1/G17/cone`) when several do. The statement
 * is always the first two segments. School codes (Sparx U-codes) are aliases only.
 */
export interface Topic {
  id: string;
  title: string;
  aliases: string[];
  prerequisites: string[];
  tier: Tier;
  /** Set only on a concept topic: the rule three contrasting instances show, and wrong rules a pupil might invent. Both are pupil-facing text. */
  concept?: { rule: string; distractors: string[] };
}

/** A named wrong answer and what to say about it. `message` names the mistake, never the right answer. */
export interface Misconception {
  answer: string;
  message: string;
}

export interface Item {
  id: string;
  topic: string;
  type: ItemType;
  stem: string;
  /** Inline SVG shown under the stem, verbatim from the lesson. */
  figure?: string;
  /** The first step or two, shown before the pupil answers (the lesson's faded working). */
  scaffold?: string;
  hint?: string;
  params?: Record<string, unknown>;
  answers?: string[];
  working?: string;
  mark_scheme?: string;
  /** The mark scheme's total, one mark per point. Required with `mark_scheme`; a teach-back is scored out of it. */
  marks?: number;
  misconceptions: Misconception[];
}

/** The item a model job may see before an `attempt` event exists for it. `toItemView` in pack.ts is the runtime projection. */
export type ItemView = Omit<
  Item,
  "answers" | "working" | "mark_scheme" | "misconceptions"
>;

/** generators.js contract, unchanged from v1 (see the file's header comment). */
export type GeneratedAnswerType =
  | "number"
  | "pi"
  | "ratio"
  | "fraction"
  | "text";
export interface Generated {
  stem: string;
  answers: string[];
  working: string;
  hint: string;
  wrong: Record<string, string>;
  type?: GeneratedAnswerType;
}
export type Generator = (rng: () => number) => Generated;

/** A subject's topics, every topic's items and its generator table: what the detective case reads. */
export type CasePack = {
  topics: readonly Topic[];
  items: ReadonlyMap<string, readonly Item[]>; // topic id → its items
  gens: Readonly<Record<string, Generator>>; // generator code (aliases[0]) → generator
};
