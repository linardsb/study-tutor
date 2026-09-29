/**
 * The three intake doors (sheet or photo, interview, cold diagnostic) end on the same rows and the same
 * intake@1 body. Pure apart from the two job calls: nothing here reads the clock or writes a file. The
 * page confirms the rows and posts the body through /api/event.
 */
import type { Topic } from "../content/types";
import type { IntakeV1, NewEvent, Rag } from "../events/types";
import type { JobDeps, Verdict } from "../jobs/define";
import {
  type CodeRow,
  intakeRead,
  type SheetSource,
} from "../jobs/intake_read";
import { type Confidence, interview } from "../jobs/interview";

export const DOORS = [
  "sheet",
  "interview",
  "diagnostic",
] as const satisfies readonly IntakeV1["door"][];
export const CONFIDENCE_RAG: Record<Confidence, Rag> = {
  confident: "G",
  unsure: "A",
  stuck: "R",
};
export type IntakeRow = { topic: string; rag: Rag };
export type SheetRow = { topic: string; rag: Rag | null; code: string }; // code: the first sheet code that resolved to this topic

const RANK: Record<Rag, number> = { R: 3, A: 2, G: 1 };

/** R beats A beats G; null only when every value is null. */
export function worst(a: Rag | null, b: Rag | null): Rag | null {
  if (a === null) return b;
  if (b === null) return a;
  return RANK[a] >= RANK[b] ? a : b;
}

/** One row per topic, first-seen order, worst R/A/G kept. */
export function mergeRows<R extends { topic: string; rag: Rag | null }>(
  rows: readonly R[],
): R[] {
  const by = new Map<string, R>();
  for (const row of rows) {
    const seen = by.get(row.topic);
    by.set(
      row.topic,
      seen === undefined ? row : { ...seen, rag: worst(seen.rag, row.rag) },
    );
  }
  return [...by.values()];
}

/** Exact topic id or alias (case-insensitive) → id; anything else is unknown. Unknown codes deduped, first-seen order. */
export function resolveCodes(
  topics: readonly Topic[],
  codes: readonly CodeRow[],
): { rows: SheetRow[]; unknown: string[] } {
  const ids = new Map<string, string>();
  for (const t of topics) {
    ids.set(t.id.toUpperCase(), t.id);
    for (const a of t.aliases) ids.set(a.toUpperCase(), t.id);
  }
  const rows: SheetRow[] = [];
  const unknown: string[] = [];
  for (const { code, rag } of codes) {
    const topic = ids.get(code.toUpperCase());
    if (topic !== undefined) rows.push({ topic, rag, code });
    else if (!unknown.includes(code)) unknown.push(code);
  }
  return { rows: mergeRows(rows), unknown };
}

/** The intake@1 body, or null when no row is left (FIELDS refuses an empty topics list). */
export function intakeRecord(
  door: IntakeV1["door"],
  rows: readonly IntakeRow[],
): NewEvent | null {
  if (rows.length === 0) return null;
  return {
    v: 1,
    type: "intake",
    door,
    topics: rows.map(({ topic, rag }) => ({ topic, rag })),
  };
}

/** Pupil-facing. app/intake.js holds the copy (TEXT.questions); src/marking/intake.test.ts compares them. */
export const INTERVIEW_QUESTIONS: Record<Confidence, string> = {
  confident: "Which topics could you do in a test tomorrow?",
  unsure: "Which topics have you met but still feel shaky on?",
  stuck: "Which topics lose you, or have you not been taught yet?",
};
export const MAX_ANSWER = 500;

// failed = a model is set up but gave no usable reply (a text-only model on a photo, a timeout, a refused shape).
export type NoVerdict = { by: "none"; reason: "no-model" | "failed" };
export type SheetReply =
  | { by: "model" | "fallback"; rows: SheetRow[]; unknown: string[] }
  | NoVerdict;
export type InterviewReply = { by: "model"; rows: IntakeRow[] } | NoVerdict;

const none = (v: Verdict<unknown>): NoVerdict => ({
  by: "none",
  reason:
    v.by === "fallback" && v.reason === "no-model" ? "no-model" : "failed",
});

/** A sheet → the rows it names and the codes the pack does not hold. The reader sees every id and alias; the model sees none. */
export async function readSheet(
  source: SheetSource,
  topics: readonly Topic[],
  deps: JobDeps,
): Promise<SheetReply> {
  const known = topics.flatMap((t) => [t.id, ...t.aliases]);
  const v = await intakeRead.run({ source, known }, deps);
  if (v.value === null) return none(v);
  return { by: v.by, ...resolveCodes(topics, v.value.codes) };
}

/** Three answers → rows with the pupil's confidence as R/A/G. The job sees ids, titles and aliases only. */
export async function runInterview(
  answers: Record<Confidence, string>,
  topics: readonly Topic[],
  deps: JobDeps,
): Promise<InterviewReply> {
  const refs = topics.map(({ id, title, aliases }) => ({ id, title, aliases }));
  const v = await interview.run({ topics: refs, answers }, deps);
  if (v.value === null) return none(v);
  const rows = v.value.topics.map((r) => ({
    topic: r.topic,
    rag: CONFIDENCE_RAG[r.confidence],
  }));
  return { by: "model", rows: mergeRows(rows) };
}
