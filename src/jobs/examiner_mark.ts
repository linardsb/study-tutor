/**
 * examiner_mark: after an attempt, the pupil photographs their written working and it is marked line by
 * line like an exam: method and accuracy, then three presentation checks. Five fixed lines, so every
 * marked photo is out of 5. The output has marks and short notes and no field for a solution.
 */
import { imagePart, type Message } from "../providers/openai-compatible";
import { defineJob, postAttemptSystem } from "./define";
import type { PostAttempt } from "./view";

export const KINDS = [
  "method",
  "accuracy",
  "answer",
  "units",
  "sense",
] as const;
export type Kind = (typeof KINDS)[number];
/** The presentation lines: all earned (or units not needed) makes a clean sheet. */
export const PRESENTATION: Record<Kind, boolean> = {
  method: false,
  accuracy: false,
  answer: true,
  units: true,
  sense: true,
};
// mark null only on "units": the question needs no units.
export type ExamLine = { kind: Kind; mark: 0 | 1 | null; note: string };
export type ExaminerInput = {
  item: PostAttempt;
  topic: string;
  photo: { bytes: Uint8Array; mime: string };
};
export type ExaminerOutput = { lines: ExamLine[] };
export const EXAM_OF = KINDS.length; // 5: every marked photo is out of the same total
const MAX_NOTE = 160;

const TASK =
  'Mark the photographed working the way a GCSE examiner does, against the mark scheme. Give exactly five entries, in this order. "method": 1 if the working shows a correct method all the way through. "accuracy": 1 if the working reaches the correct final value. "answer": 1 if the final answer is clearly marked, boxed or underlined. "units": 1 if the units are written, 0 if they are missing, null if the question needs no units. "sense": 1 if the final answer is a sensible size for the question. Each note says what is missing or wrong in one short sentence, in words, or is empty when the mark is earned. Do not write any number that is not printed in the question. Never write the corrected step, the working or the answer. If the photo shows no working for this question, give every entry 0 (units null if no units are needed) and say so in the first note. Reply with JSON only: {"lines": [{"kind": "method", "mark": 0 or 1, "note": "..."}, ...]}.';

/** Text part, then the image part: the S2 vision probe's form. The mark scheme is `mark_scheme ?? working`. */
function prompt({ item, topic, photo }: ExaminerInput): Message[] {
  const text = [
    `Topic: ${topic}`,
    `Question: ${item.stem}`,
    `Mark scheme: ${item.mark_scheme ?? item.working ?? ""}`,
    "The photo is the pupil's working.",
  ].join("\n");
  return [
    postAttemptSystem(TASK),
    {
      role: "user",
      content: [{ type: "text", text }, imagePart(photo.bytes, photo.mime)],
    },
  ];
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Exactly five rows in KINDS order; mark 0 or 1, or null on units only. */
function validate(value: unknown): ExaminerOutput | null {
  if (!isObj(value) || !Array.isArray(value.lines)) return null;
  if (value.lines.length !== EXAM_OF) return null;
  const out: ExamLine[] = [];
  for (const [i, kind] of KINDS.entries()) {
    const row: unknown = value.lines[i];
    if (!isObj(row) || row.kind !== kind) return null;
    const ok =
      row.mark === 0 ||
      row.mark === 1 ||
      (row.mark === null && kind === "units");
    if (!ok) return null;
    if (typeof row.note !== "string") return null;
    const note = row.note.trim();
    if (note.length > MAX_NOTE) return null;
    out.push({ kind, mark: row.mark as 0 | 1 | null, note });
  }
  return { lines: out };
}

/** Marks out of EXAM_OF: a units line the question does not need counts as earned. */
export function score(out: ExaminerOutput): {
  marks: number;
  of: number;
  clean: boolean;
} {
  return {
    marks: out.lines.reduce((n, l) => n + (l.mark ?? 1), 0),
    of: EXAM_OF,
    clean: out.lines.every((l) => !PRESENTATION[l.kind] || l.mark !== 0),
  };
}

export const examinerMark = defineJob<ExaminerInput, ExaminerOutput>({
  name: "examiner_mark",
  prompt,
  validate,
  texts: (o) => o.lines.map((l) => l.note),
  // The stem alone: handwriting is not text the guard can read, so a note may not quote a number from
  // the photo either, and the corrected value cannot reach the screen that way.
  sources: ({ item }) => [item.stem],
  fallback: () => null,
});
