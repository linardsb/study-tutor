/**
 * dan_wrong_step (O2): before an attempt, Dan, a classmate, works a fresh-number question and lands on
 * one wrong answer chosen in code from the item's misconception bank. The model only voices the step.
 * The input holds no answers, working or mark_scheme: `PreAttempt` is the stripped view by construction,
 * and `wrong` is the bank's wrong answer and its note, the only answer-side strings the prompt carries.
 */
import type { Misconception } from "../content/types";
import { normaliseAnswer } from "../marking/normalise";
import type { Message } from "../providers/openai-compatible";
import { defineJob, preAttemptSystem } from "./define";
import { numbersIn } from "./guard";
import type { PreAttempt } from "./view";

export type DanInput = {
  view: PreAttempt;
  topic: string;
  wrong: Misconception;
};
export type DanOutput = { lines: string[] };
export const MAX_DAN_LINES = 3; // expected: one working line per step, three steps at most
const MAX_LINE = 160; // mirrors MAX_NOTE, teachback_mark.ts

export const DAN_VOICE =
  "You are Dan, a pupil in the same maths class as the reader, at GCSE Foundation. Write as Dan, in the first person, working through the question aloud. Plain words, short sentences, British English, sentence case. No emoji, no exclamation marks, never a grade or a prediction.";
const TASK =
  'Work through the question in one to three short lines and arrive at exactly the answer given below, by making the mistake described below. Do not say it is a mistake, do not correct it, and do not repeat the note. The last line ends with your answer. Reply with JSON only: {"lines": ["<line>", "<line>"]}';

/** Named fields only: nothing here spreads or stringifies the view. */
function prompt({ view, topic, wrong }: DanInput): Message[] {
  const lines = [`Topic: ${topic}`, `Question: ${view.stem}`];
  if (view.scaffold) lines.push(`Given: ${view.scaffold}`);
  lines.push(`The answer you reach: ${wrong.answer}`);
  lines.push(
    `The mistake you make (do not repeat these words): ${wrong.message}`,
  );
  return [
    preAttemptSystem(TASK, DAN_VOICE),
    { role: "user", content: lines.join("\n") },
  ];
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** True when the lines land on `answer`: every number of a numeric answer appears in them; a text answer appears normalised. */
export function reaches(lines: readonly string[], answer: string): boolean {
  const joined = lines.join(" ");
  const wanted = numbersIn(answer);
  if (wanted.size > 0) {
    const have = numbersIn(joined);
    for (const n of wanted) if (!have.has(n)) return false;
    return true;
  }
  return normaliseAnswer(joined).includes(normaliseAnswer(answer));
}

const flat = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/**
 * R8: a reply that does not land on the bank's wrong answer is refused, so the model cannot substitute
 * its own error. The verbatim note check is cheap and weak (a paraphrase passes); the prompt line and
 * the R8 test are the real defence.
 */
function validate(value: unknown, { wrong }: DanInput): DanOutput | null {
  if (!isObj(value) || !Array.isArray(value.lines)) return null;
  if (value.lines.length < 1 || value.lines.length > MAX_DAN_LINES) return null;
  const lines: string[] = [];
  for (const raw of value.lines) {
    if (typeof raw !== "string") return null;
    const line = raw.trim();
    if (line.length < 1 || line.length > MAX_LINE) return null;
    lines.push(line);
  }
  if (!reaches(lines, wrong.answer)) return null;
  if (flat(lines.join(" ")).includes(flat(wrong.message))) return null;
  return { lines };
}

export const danWrongStep = defineJob<DanInput, DanOutput>({
  name: "dan_wrong_step",
  prompt,
  validate,
  texts: (o) => o.lines,
  // The note often names a sub-step number; without it an echo in Dan's words would be an invented-number refusal.
  // The correct answer is not a source, so a reply that computes it is refused unless the question already holds it.
  sources: ({ view, wrong }) => [
    view.stem,
    view.scaffold ?? "",
    view.hint ?? "",
    wrong.answer,
    wrong.message,
  ],
  // Always a value: the bank's wrong answer as a written line.
  fallback: ({ view, wrong }) => ({
    lines: [
      ...(view.scaffold ? [view.scaffold] : []),
      `I get ${wrong.answer}.`,
    ],
  }),
});
