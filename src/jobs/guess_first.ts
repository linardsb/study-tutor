/** guess_first: the pupil guesses the method before trying; the reply says what holds and one next step. It never sees the answer. */
import type { Message } from "../providers/openai-compatible";
import { defineJob, preAttemptSystem, textReply } from "./define";
import type { PreAttempt } from "./view";

export type GuessInput = { view: PreAttempt; topic: string; guess: string };
export type GuessOutput = { text: string };

export const FALLBACK_GUESS =
  "Keep that guess in mind. Try the question, then check your method against the working.";

const TASK =
  'The pupil has written a guess at the method before trying the question. Say which part of the guess holds, if any, and name at most one next step. Do not work anything out. Reply with JSON only: {"text": "<two or three sentences>"}';

/** Named fields only: nothing here spreads or stringifies the view. */
function prompt({ view, topic, guess }: GuessInput): Message[] {
  const lines = [`Topic: ${topic}`, `Question: ${view.stem}`];
  if (view.scaffold) lines.push(`Given: ${view.scaffold}`);
  lines.push(`The pupil's guess: ${guess}`);
  return [preAttemptSystem(TASK), { role: "user", content: lines.join("\n") }];
}

export const guessFirst = defineJob<GuessInput, GuessOutput>({
  name: "guess_first",
  prompt,
  validate: (v) => textReply(v, 400),
  texts: (o) => [o.text],
  sources: ({ view, guess }) => [view.stem, view.scaffold ?? "", guess],
  fallback: () => ({ text: FALLBACK_GUESS }),
});
