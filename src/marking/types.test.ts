import { expect, test } from "bun:test";
import path from "node:path";
import type { ItemType, Misconception } from "../content/types";
import { markAnswer } from "./answer";

type Marked = { ok: boolean; named: string | null };
type Quiz = {
  mark: (
    item: {
      type?: ItemType;
      answers: string[];
      misconceptions: Misconception[];
    },
    typed: string,
  ) => Marked;
};

// The browser file sets a global, the way generators.js does; nothing in it touches document at load.
await import(path.resolve(import.meta.dir, "../../app/quiz.js"));
const quiz = (globalThis as { quiz?: Quiz }).quiz;
if (!quiz) throw new Error("app/quiz.js did not set quiz");

const vocab = {
  type: "vocab" as const,
  answers: ["mitochondria", "mitochondrion"],
  misconceptions: [{ answer: "cytoplasm", message: "Named cytoplasm." }],
};
const sequence = {
  type: "sequence" as const,
  answers: ["B, D, C, A"],
  misconceptions: [{ answer: "B, D, A, C", message: "Named swap." }],
};
const label = {
  type: "label" as const,
  answers: ["cell wall, cell membrane, nucleus, chloroplast"],
  misconceptions: [
    {
      answer: "cell membrane, cell wall, nucleus, chloroplast",
      message: "Named outer swap.",
    },
  ],
};
const untyped = {
  answers: ["9", "£9"],
  misconceptions: [{ answer: "4.5", message: "Named 10%." }],
};

/** [item, typed, ok, named] */
const rows: Array<
  [
    typeof vocab | typeof sequence | typeof label | typeof untyped,
    string,
    boolean,
    string | null,
  ]
> = [
  [vocab, "mitochondria", true, null],
  [vocab, "The Mitochondria", true, null],
  [vocab, " a mitochondrion ", true, null],
  [vocab, "cytoplasm", false, "Named cytoplasm."],
  [vocab, "the cytoplasm", false, "Named cytoplasm."],
  [vocab, "nucleus", false, null],
  [vocab, "", false, null],
  [vocab, "the", false, null],
  [sequence, "B, D, C, A", true, null],
  [sequence, "BDCA", true, null],
  [sequence, "b then d then c then a", true, null],
  [sequence, "b, d, c and a", true, null],
  [sequence, "B, D, A, C", false, "Named swap."],
  [sequence, "BDC", false, null],
  [sequence, "", false, null],
  [sequence, "then and", false, null],
  [label, "cell wall, cell membrane, nucleus, chloroplast", true, null],
  [label, "Cell wall; the cell membrane; a nucleus; chloroplast", true, null],
  [
    label,
    "cell membrane, cell wall, nucleus, chloroplast",
    false,
    "Named outer swap.",
  ],
  [label, "cell wall, cell membrane, nucleus", false, null],
  [label, "cell wall, cell membrane, chloroplast, nucleus", false, null],
  [label, "cellwall cellmembrane nucleus chloroplast", false, null],
  [label, "", false, null],
  [label, ", , ,", false, null],
  [untyped, "9", true, null],
  [untyped, "£9", true, null],
  [untyped, "4.5", false, "Named 10%."],
  [untyped, "the 9", false, null],
  [untyped, "", false, null],
];

test("markAnswer by item type: right forms, the named misconception, wrong, empty", () => {
  for (const [item, typed, ok, named] of rows)
    expect({ typed, r: markAnswer(item, typed) }).toEqual({
      typed,
      r: { ok, named },
    });
});

test("markAnswer on the server is quiz.mark in the browser, for every type and an untyped item", () => {
  for (const [item, typed] of rows)
    expect({ typed, r: markAnswer(item, typed) }).toEqual({
      typed,
      r: quiz.mark(item, typed),
    });
});
