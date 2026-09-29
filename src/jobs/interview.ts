/**
 * interview: the pupil's answers to three fixed questions → topic ids from a closed list, each with the
 * pupil's own confidence. It sees topic ids, titles and aliases and the pupil's words: no item and no
 * answer. Code owns the questions and the stop; this is one call, not a conversation.
 */
import type { Message } from "../providers/openai-compatible";
import { defineJob, preAttemptSystem } from "./define";

export const CONFIDENCES = ["confident", "unsure", "stuck"] as const;
export type Confidence = (typeof CONFIDENCES)[number];
export type TopicRef = {
  id: string;
  title: string;
  aliases: readonly string[];
};
export type InterviewInput = {
  topics: readonly TopicRef[];
  answers: Record<Confidence, string>;
};
export type InterviewRow = { topic: string; confidence: Confidence };
export type InterviewOutput = { topics: InterviewRow[] };

/** The phrase TASK starts with; scripts/fake-provider.ts finds this job by it. */
export const INTERVIEW_MARK = "Match what the pupil said to the topic list.";
const TASK = `${INTERVIEW_MARK} Give one row for each listed topic the pupil named or clearly described. The confidence is the answer it came from: "confident" for what they could do in a test tomorrow, "unsure" for what feels shaky, "stuck" for what loses them. Leave out anything that matches no listed topic. Reply with JSON only: {"topics": [{"topic": "<id from the list>", "confidence": "confident|unsure|stuck"}]}`;
const NUM =
  "Use only topic ids from the list, copied exactly. Never make up an id.";

const LABELS: Record<Confidence, string> = {
  confident: "Could do in a test tomorrow",
  unsure: "Met it but shaky",
  stuck: "Loses me or not taught yet",
};

/** Named fields only: one line per topic, then the three labelled answers. */
function prompt({ topics, answers }: InterviewInput): Message[] {
  const lines = ["Topics:"];
  for (const t of topics)
    lines.push(`${t.id}: ${t.title} (${t.aliases.join(", ")})`);
  lines.push("");
  for (const c of CONFIDENCES)
    lines.push(`${LABELS[c]}: ${answers[c].trim() || "(nothing)"}`);
  return [
    preAttemptSystem(TASK, undefined, NUM),
    { role: "user", content: lines.join("\n") },
  ];
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** At most one row per listed topic; every id from the list, every confidence one of CONFIDENCES. An empty list is valid. */
function validate(
  value: unknown,
  { topics }: InterviewInput,
): InterviewOutput | null {
  if (!isObj(value) || !Array.isArray(value.topics)) return null;
  if (value.topics.length > topics.length) return null;
  const ids = new Set(topics.map((t) => t.id));
  const out: InterviewRow[] = [];
  for (const row of value.topics as unknown[]) {
    if (!isObj(row) || typeof row.topic !== "string" || !ids.has(row.topic))
      return null;
    if (!(CONFIDENCES as readonly unknown[]).includes(row.confidence))
      return null;
    out.push({ topic: row.topic, confidence: row.confidence as Confidence });
  }
  return { topics: out };
}

export const interview = defineJob<InterviewInput, InterviewOutput>({
  name: "interview",
  prompt,
  validate,
  // Ids only reach the page, as titles looked up in code: no model prose is shown.
  texts: () => [],
  sources: () => [],
  // No verdict: the page falls back to the self-rating checklist.
  fallback: () => null,
});
