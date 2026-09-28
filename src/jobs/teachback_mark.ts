/**
 * teachback_mark: after an attempt, the pupil explains the method one step per line and each line is
 * marked 0 or 1 against the mark scheme. The output has marks and short notes and no field for a solution.
 */
import type { Message } from "../providers/openai-compatible";
import { defineJob, postAttemptSystem } from "./define";
import type { PostAttempt } from "./view";

export type TeachbackInput = {
  item: PostAttempt;
  topic: string;
  lines: readonly string[];
};
export type LineMark = { mark: 0 | 1; note: string };
export type TeachbackOutput = { lines: LineMark[] };
export const MAX_LINES = 8;
const MAX_NOTE = 160;

const task = (n: number) =>
  `Mark the pupil's explanation one line at a time against the mark scheme: 1 if the line is a correct step in the right order, else 0. Each note names what is missing or wrong in one short sentence. Never write the corrected step or the answer. Reply with JSON only: {"lines": [{"mark": 0 or 1, "note": "..."}]} with exactly ${n} entries, one per pupil line.`;

/** Named fields only. The mark scheme is `mark_scheme ?? working`: no maths item has a mark_scheme yet (plan Q1). */
function prompt({ item, topic, lines }: TeachbackInput): Message[] {
  const user = [
    `Topic: ${topic}`,
    `Question: ${item.stem}`,
    `Mark scheme: ${item.mark_scheme ?? item.working ?? ""}`,
    "The pupil's lines:",
    ...lines.map((l, i) => `${i + 1}. ${l}`),
  ];
  return [
    postAttemptSystem(task(lines.length)),
    { role: "user", content: user.join("\n") },
  ];
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Exactly one entry per pupil line (T8 finding: a loose prompt returned an extra one), each mark 0 or 1. */
function validate(
  value: unknown,
  { lines }: TeachbackInput,
): TeachbackOutput | null {
  if (!isObj(value) || !Array.isArray(value.lines)) return null;
  if (value.lines.length !== lines.length) return null;
  const out: LineMark[] = [];
  for (const row of value.lines) {
    if (!isObj(row) || (row.mark !== 0 && row.mark !== 1)) return null;
    if (typeof row.note !== "string" || row.note.length > MAX_NOTE) return null;
    out.push({ mark: row.mark, note: row.note.trim() });
  }
  return { lines: out };
}

export const teachbackMark = defineJob<TeachbackInput, TeachbackOutput>({
  name: "teachback_mark",
  prompt,
  validate,
  texts: (o) => o.lines.map((l) => l.note),
  // Not the mark scheme: a note cannot bring in a number the pupil did not write, so it cannot hand over the corrected value.
  sources: ({ item, lines }) => [
    item.stem,
    ...lines,
    lines.map((_, i) => i + 1).join(" "),
  ],
  fallback: () => null,
});
