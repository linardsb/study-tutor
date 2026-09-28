/**
 * The chat panel's call points, pure: no clock, no file, no model call of its own. Which job may run
 * before the pupil's first attempt on an item and which after it, what a teach-back verdict records,
 * and what the pupil sees when there is no verdict. The API writes the record this returns.
 */
import { lcg } from "../content/generators";
import type { CasePack, Item } from "../content/types";
import { type NewEvent, parseEvent } from "../events/types";
import type { JobDeps } from "../jobs/define";
import { guessFirst } from "../jobs/guess_first";
import { hint } from "../jobs/hint";
import {
  type LineMark,
  MAX_LINES,
  teachbackMark,
} from "../jobs/teachback_mark";
import { jobItem } from "../jobs/view";
import { localDay } from "../mcp/clock";

export const CHAT_JOBS = ["guess_first", "hint", "teachback_mark"] as const;
export type ChatJob = (typeof CHAT_JOBS)[number];
/** The named point each job runs at: before the pupil's first attempt on the item, or after it. */
export const CALL_POINT: Record<ChatJob, "before" | "after"> = {
  guess_first: "before",
  hint: "before",
  teachback_mark: "after",
};

const GEN = "#gen";

/** An items-file item by id, or a generated item rebuilt from its topic's generator and seed (the shape quiz.js builds). */
export function findItem(
  pack: CasePack,
  id: string,
  seed?: number,
): (Item & { seed?: number }) | null {
  const hash = id.indexOf("#");
  if (hash < 1) return null;
  // Topic ids hold "/" (1MA1/G17/cone), so the topic is everything before the "#".
  const topicId = id.slice(0, hash);
  if (!id.endsWith(GEN) || id.length !== hash + GEN.length)
    return pack.items.get(topicId)?.find((i) => i.id === id) ?? null;
  // quiz.js makes 32-bit seeds and lcg reduces with >>> 0, so a larger seed would repeat a question under another id.
  if (
    seed === undefined ||
    !Number.isInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff
  )
    return null;
  const topic = pack.topics.find((t) => t.id === topicId);
  const gen = topic ? pack.gens[topic.aliases[0] ?? ""] : undefined;
  if (typeof gen !== "function") return null;
  // Mirrors itemFromGenerated in app/quiz.js; quiz.test.ts checks the two agree.
  const spec = gen(lcg(seed));
  return {
    id,
    topic: topicId,
    type: "generator",
    stem: spec.stem,
    hint: spec.hint,
    answers: spec.answers,
    working: spec.working,
    misconceptions: Object.entries(spec.wrong || {}).map(
      ([answer, message]) => ({ answer, message }),
    ),
    seed,
  };
}

export type ChatAsk = {
  job: ChatJob;
  item: Item & { seed?: number };
  topic: string; // the topic's title, for the prompt
  text: string;
};
export type Refusal = "attempt-first" | "already-attempted" | "taught-today";
export type ChatReply =
  | { kind: "text"; by: "model" | "fallback"; text: string }
  | {
      kind: "marks";
      marks: LineMark[];
      score: number;
      of: number;
      record: NewEvent;
    }
  | { kind: "no-verdict"; working: string | null }
  | { kind: "refused"; reason: Refusal };

/** True when the log holds a teach-back for this item on this London day (plan Q4: one verdict per item per day). */
export function taughtOn(
  log: readonly string[],
  id: string,
  day: string,
): boolean {
  return log.some((line) => {
    const e = parseEvent(line);
    return e?.type === "teachback" && e.item === id && localDay(e.t) === day;
  });
}

/** One chat request. `day` is the London day (localDay(utcNow()), read once by the API), so this file reads no clock. */
export async function chat(
  ask: ChatAsk,
  log: readonly string[],
  day: string,
  deps: JobDeps,
): Promise<ChatReply> {
  const { job, item, topic, text } = ask;
  const j = jobItem(log, item);
  if (CALL_POINT[job] === "before" && j.attempted)
    return { kind: "refused", reason: "already-attempted" };
  if (CALL_POINT[job] === "after" && !j.attempted)
    return { kind: "refused", reason: "attempt-first" };

  if (!j.attempted) {
    const v =
      job === "hint"
        ? await hint.run({ view: j.view, topic, working: text }, deps)
        : await guessFirst.run({ view: j.view, topic, guess: text }, deps);
    // Both fallbacks always have a value; the null arm is only the type's.
    return { kind: "text", by: v.by, text: v.value?.text ?? "" };
  }

  // Checked before the job runs: no tokens spent and no second 15 XP.
  if (taughtOn(log, item.id, day))
    return { kind: "refused", reason: "taught-today" };
  const steps = text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, MAX_LINES);
  const v = await teachbackMark.run(
    { item: j.item, topic, lines: steps },
    deps,
  );
  if (v.by === "fallback" || v.value === null)
    return { kind: "no-verdict", working: item.working ?? null };
  const marks = v.value.lines;
  const score = marks.reduce((n, l) => n + l.mark, 0);
  return {
    kind: "marks",
    marks,
    score,
    of: steps.length,
    record: {
      v: 1,
      type: "teachback",
      topic: item.topic,
      item: item.id,
      marks: score,
      of: steps.length,
    },
  };
}
