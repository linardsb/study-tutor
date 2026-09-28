/** hint: before an attempt, one hint that names the next step. It never sees the answer. */
import type { Message } from "../providers/openai-compatible";
import { defineJob, preAttemptSystem, textReply } from "./define";
import type { PreAttempt } from "./view";

export type HintInput = {
  view: PreAttempt;
  topic: string; // the topic's title
  working: string; // the pupil's lines so far, may be ""
};
export type HintOutput = { text: string };

export const FALLBACK_HINT =
  "Write down the first step you are sure of. Then look at what the question asks for.";

const TASK =
  'Give one hint: the next step only, never the result of it. Reply with JSON only: {"text": "<one or two sentences>"}';

/** Named fields only: nothing here spreads or stringifies the view. */
function prompt({ view, topic, working }: HintInput): Message[] {
  const lines = [`Topic: ${topic}`, `Question: ${view.stem}`];
  if (view.scaffold) lines.push(`Given: ${view.scaffold}`);
  // So the model's hint agrees with the lesson's.
  if (view.hint) lines.push(`The lesson's own hint: ${view.hint}`);
  if (working.trim()) lines.push(`The pupil's working so far: ${working}`);
  return [preAttemptSystem(TASK), { role: "user", content: lines.join("\n") }];
}

export const hint = defineJob<HintInput, HintOutput>({
  name: "hint",
  prompt,
  validate: (v) => textReply(v, 300),
  texts: (o) => [o.text],
  sources: ({ view, working }) => [
    view.stem,
    view.scaffold ?? "",
    view.hint ?? "",
    working,
  ],
  // The content hint passed the #24 review for not stating the answer.
  fallback: ({ view }) => ({ text: view.hint ?? FALLBACK_HINT }),
});
