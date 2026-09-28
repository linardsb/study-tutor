/**
 * A model job: prompt, shape validated in code, the reply guard, one retry, then a deterministic
 * fallback. Every job gets the same policy from here; src/flow decides when a job runs.
 */
import {
  chatJson,
  type Failure,
  type Fetch,
  type Message,
} from "../providers/openai-compatible";
import { guardReply, type ShadowJudge } from "./guard";

export const PRE_ATTEMPT_GUARD =
  "Do not state the answer. The pupil has not attempted this yet.";
const VOICE =
  'You are a maths tutor for a 15-year-old at GCSE Foundation. Speak to the pupil as "you". Plain words, short sentences, British English, sentence case. No emoji, no exclamation marks, never a grade or a prediction.';
// Both lines go in every system message, pre and post. ONE: the S2 two-block failure (Q12). NUM: the invented-number rule (guard.ts).
const ONE =
  "Reply with exactly one JSON object and nothing else: no text before or after it, and no second attempt.";
const NUM =
  "Use only numbers that appear in the question, the lesson's hint or the pupil's own words. Do not calculate anything new.";

/** System message for a job that runs before an attempt: the guard line is always in it. */
export function preAttemptSystem(task: string): Message {
  return {
    role: "system",
    content: [VOICE, PRE_ATTEMPT_GUARD, task, NUM, ONE].join("\n"),
  };
}

/** System message for a job that runs after an attempt. A separate function, so the guard line cannot be dropped from a pre-attempt prompt by a flag. */
export function postAttemptSystem(task: string): Message {
  return { role: "system", content: [VOICE, task, NUM, ONE].join("\n") };
}

export type JobFailure = Failure | "shape" | "guard";
export type Verdict<O> =
  | { by: "model"; value: O }
  | { by: "fallback"; value: O | null; reason: JobFailure }; // null = no verdict
export type JobDeps = {
  dataDir: string;
  fetch?: Fetch;
  now?: () => string;
  judge?: ShadowJudge;
};
export type JobSpec<I, O> = {
  name: string;
  prompt: (input: I) => Message[];
  validate: (value: unknown, input: I) => O | null; // shape in code; the provider's JSON mode is not relied on
  texts: (out: O) => readonly string[]; // what the guard reads: every string the pupil will see
  sources: (input: I) => readonly string[]; // what a reply may take numbers from (guard.ts)
  fallback: (input: I) => O | null;
  maxTokens?: number;
};
export type Job<I, O> = {
  name: string;
  run(input: I, deps: JobDeps): Promise<Verdict<O>>;
};

// A second try can fix a reply; it cannot fix a provider that is down, capped or misconfigured.
const RETRYABLE: ReadonlySet<JobFailure> = new Set([
  "not-json",
  "shape",
  "guard",
]);
const TRIES = 2;

/** The job's shared run policy around one spec. */
export function defineJob<I, O>(spec: JobSpec<I, O>): Job<I, O> {
  const { name } = spec;

  async function attempt(
    messages: Message[],
    input: I,
    deps: JobDeps,
  ): Promise<{ ok: true; value: O } | { ok: false; reason: JobFailure }> {
    const r = await chatJson(deps.dataDir, messages, {
      job: name,
      maxTokens: spec.maxTokens,
      fetch: deps.fetch,
      now: deps.now,
    });
    if (!r.ok) return { ok: false, reason: r.reason };
    const value = spec.validate(r.value, input);
    if (value === null) return { ok: false, reason: "shape" };
    const broken = guardReply(spec.texts(value), spec.sources(input));
    if (broken !== null) return { ok: false, reason: "guard" };
    return { ok: true, value };
  }

  async function run(input: I, deps: JobDeps): Promise<Verdict<O>> {
    // Built once: the retry sends the same messages.
    const messages = spec.prompt(input);
    let reason: JobFailure = "no-model";
    for (let i = 0; i < TRIES; i += 1) {
      const r = await attempt(messages, input, deps);
      if (r.ok) {
        await shadow(deps.judge, r.value);
        return { by: "model", value: r.value };
      }
      reason = r.reason;
      if (reason === "shape" || reason === "guard")
        // The reason only: never the reply text.
        console.error(`Model reply refused (${name}): ${reason}`);
      if (!RETRYABLE.has(reason)) break;
    }
    return { by: "fallback", value: spec.fallback(input), reason };
  }

  /** The shadow judge is asked and logged; its answer never changes the verdict. */
  async function shadow(judge: ShadowJudge | undefined, value: O) {
    if (judge === undefined) return;
    try {
      if (await judge(name, spec.texts(value)))
        console.error(`Shadow judge (${name}): would_block`);
    } catch (err) {
      console.error(`Shadow judge (${name}) failed: ${(err as Error).name}`);
    }
  }

  return { name, run };
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** `{ text }` with a trimmed length of 1 to `max`, or null. The shape guess_first and hint share. */
export function textReply(
  value: unknown,
  max: number,
): { text: string } | null {
  if (!isObj(value) || typeof value.text !== "string") return null;
  const text = value.text.trim();
  return text.length >= 1 && text.length <= max ? { text } : null;
}
