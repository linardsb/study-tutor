/**
 * teachback_mark: after an attempt, the pupil explains the method one step per line. An item with a
 * mark scheme and its `marks` total is marked per scheme point, 0 or 1 each, so the score is out of
 * the scheme's marks (#52); any other item is marked per pupil line against its working. The output
 * has marks and short notes and no field for a solution.
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

/** The scheme's total when the item is marked per scheme point, or null when it is marked per pupil line. */
export const pointsOf = (item: PostAttempt): number | null =>
  item.mark_scheme !== undefined && item.marks !== undefined
    ? item.marks
    : null;

const lineTask = (n: number) =>
  `Mark the pupil's explanation one line at a time against the mark scheme: 1 if the line is a correct step in the right order, else 0. Each note names what is missing or wrong in one short sentence. Never write the corrected step or the answer. Reply with JSON only: {"lines": [{"mark": 0 or 1, "note": "..."}]} with exactly ${n} entries, one per pupil line.`;
const pointTask = (n: number) =>
  `The mark scheme has ${n} points, 1 mark each. Mark the pupil's whole explanation against each point in the scheme's order: 1 if any of the pupil's lines makes the point, else 0. One line may make more than one point. Each note names what is missing or wrong in one short sentence. Never write the missing point or the answer. Reply with JSON only: {"lines": [{"mark": 0 or 1, "note": "..."}]} with exactly ${n} entries, one per scheme point.`;

/** Named fields only. The mark scheme is `mark_scheme ?? working`: no maths item has a mark_scheme yet (plan Q1). */
function prompt({ item, topic, lines }: TeachbackInput): Message[] {
  const points = pointsOf(item);
  const user = [
    `Topic: ${topic}`,
    `Question: ${item.stem}`,
    `Mark scheme: ${item.mark_scheme ?? item.working ?? ""}`,
    "The pupil's lines:",
    ...lines.map((l, i) => `${i + 1}. ${l}`),
  ];
  return [
    postAttemptSystem(
      points === null ? lineTask(lines.length) : pointTask(points),
    ),
    { role: "user", content: user.join("\n") },
  ];
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Exactly one entry per scheme point or pupil line (T8 finding: a loose prompt returned an extra one), each mark 0 or 1. */
function validate(
  value: unknown,
  { item, lines }: TeachbackInput,
): TeachbackOutput | null {
  if (!isObj(value) || !Array.isArray(value.lines)) return null;
  if (value.lines.length !== (pointsOf(item) ?? lines.length)) return null;
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
  // Line and point numbers are fine, and so is the scheme's total ("1 of the 2 marks").
  sources: ({ item, lines }) => [
    item.stem,
    ...lines,
    Array.from(
      { length: Math.max(lines.length, pointsOf(item) ?? 0) },
      (_, i) => i + 1,
    ).join(" "),
  ],
  fallback: () => null,
});
