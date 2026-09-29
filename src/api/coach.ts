import { readConfig } from "../config";
import { toItemView } from "../content/pack";
import type { CasePack } from "../content/types";
import { readLines } from "../events/append";
import {
  correction,
  danStep,
  pickItem,
  type Refusal,
  rank,
  triedTopics,
} from "../flow/coach";
import type { JobDeps } from "../jobs/define";
import { resolveItem, titleOf } from "./chat";
import { postEvent } from "./event";
import { currentState } from "./state";

type Result = { status: number; body: unknown };

const STEPS = ["dan", "correct"] as const;
const REFUSED: Record<Refusal, string> = {
  "try-first": "Try a question on this topic first.",
  "already-answered": "You have answered this one. Ask for another.",
};
const NO_STEP = { error: "Dan has no wrong step for this question" };

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const bad = (error: string): Result => ({ status: 400, body: { error } });

/**
 * The coach's read side, a body only (dayRoute answers 200; a thrown read is its 500). No topic: the
 * tried topics and Dan's rank. A topic: the question side of the item Dan will try, never its answers.
 * `day` and the shown count seed the pick, so a reload gets the same question and a catch moves it on.
 */
export function getCoach(
  dataDir: string,
  pack: CasePack,
  day: string,
  params: URLSearchParams,
): unknown {
  const state = currentState(dataDir);
  const r = rank(state.coach.caught);
  const topic = params.get("topic");
  if (topic === null)
    return {
      rank: r,
      shown: state.coach.shown,
      caught: state.coach.caught,
      topics: triedTopics(readLines(dataDir), pack).map((t) => ({
        id: t.id,
        title: t.title,
      })),
    };
  if (!pack.topics.some((t) => t.id === topic))
    return { ready: false, reason: "no-topic" };
  const title = titleOf(pack, topic);
  if (!triedTopics(readLines(dataDir), pack).some((t) => t.id === topic))
    return { ready: false, reason: "try-first", title };
  const item = pickItem(
    pack,
    topic,
    `${day}:${topic}:coach:${state.coach.shown}`,
  );
  if (item === null) return { ready: false, reason: "no-item", title };
  // Named fields from the stripped view: answers, working, mark_scheme and misconceptions never reach the page here.
  const view = toItemView(item);
  const preset = readConfig(dataDir)?.preset;
  return {
    ready: true,
    topic,
    title,
    item: view.id,
    ...(item.seed === undefined ? {} : { seed: item.seed }),
    stem: view.stem,
    ...(view.figure === undefined ? {} : { figure: view.figure }),
    ...(view.scaffold === undefined ? {} : { scaffold: view.scaffold }),
    rank: r,
    model: preset !== undefined && preset !== "none",
  };
}

/**
 * One coach request, validated in full before any job runs. `dan` runs the job and writes nothing but
 * its usage line. `correct` marks on the server, writes the attempt (and its xp line) then the coach
 * record, and only then returns the working and the misconception's note.
 */
export async function postCoach(
  body: unknown,
  dataDir: string,
  pack: CasePack,
  deps: JobDeps,
): Promise<Result> {
  if (!isObj(body)) return bad("Body must be a JSON object");
  if (!(STEPS as readonly unknown[]).includes(body.step))
    return bad(`step must be one of ${STEPS.join(", ")}`);
  const r = resolveItem(pack, body.item, body.seed);
  if (!("item" in r)) return r;
  const topic = titleOf(pack, r.item.topic);

  if (body.step === "dan") {
    const reply = await danStep(r.item, topic, readLines(dataDir), deps);
    if (reply.kind === "refused")
      return { status: 409, body: { error: REFUSED[reply.reason] } };
    if (reply.kind === "skipped") return { status: 404, body: NO_STEP };
    return { status: 200, body: reply };
  }

  if (typeof body.answer !== "string") return bad("answer must be a string");
  const answer = body.answer.trim();
  if (answer.length < 1 || answer.length > 200)
    return bad("answer must be 1 to 200 characters");
  if (typeof body.sure !== "boolean") return bad("sure must be true or false");

  // Nothing is awaited from here to the second append: hasAttempt (in correction) and both appends
  // are synchronous, so two tabs posting the same item and seed are handled one after the other and
  // the second sees the first's attempt and gets 409. A `dan` request still in flight writes nothing.
  const marked = correction(r.item, answer, body.sure, readLines(dataDir));
  if (marked.kind === "refused")
    return { status: 409, body: { error: REFUSED[marked.reason] } };
  if (marked.kind === "skipped") return { status: 404, body: NO_STEP };
  const now = deps.now;
  const attempt = postEvent(marked.attempt, dataDir, pack.topics, now);
  const record =
    attempt.status === 201
      ? postEvent(marked.record, dataDir, pack.topics, now)
      : null;
  if (attempt.status !== 201)
    console.error(`Could not save the correction: ${attempt.body.error}`);
  else if (record !== null && record.status !== 201)
    console.error(`Could not save the coach record: ${record.body.error}`);
  return {
    status: 200,
    body: {
      kind: "marked",
      correct: marked.correct,
      caught: marked.caught,
      named: marked.named,
      note: marked.wrong.message,
      working: r.item.working ?? null,
      rank: rank(currentState(dataDir).coach.caught),
      saved: record?.status === 201,
    },
  };
}
