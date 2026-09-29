import { readConfig } from "../config";
import { toItemView } from "../content/pack";
import type { CasePack, Item } from "../content/types";
import { readLines } from "../events/append";
import {
  CHAT_JOBS,
  type ChatJob,
  chat,
  findItem,
  type Refusal,
  taughtOn,
} from "../flow/chat";
import type { JobDeps } from "../jobs/define";
import { hasAttempt } from "../jobs/view";
import { localDay, utcNow } from "../mcp/clock";
import { postEvent } from "./event";

type Result = { status: number; body: unknown };

const REFUSED: Record<Refusal, string> = {
  "attempt-first": "Try the question first.",
  "already-attempted":
    "You have already tried this one. Explain it back instead.",
  "taught-today": "You have explained this one today. Try another question.",
};

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const bad = (error: string): Result => ({ status: 400, body: { error } });

/** The item a request names, or the refusal. `seed` is a non-negative integer, required for a generated item. */
export function resolveItem(
  pack: CasePack,
  id: unknown,
  seed: unknown,
): { item: Item & { seed?: number } } | Result {
  if (typeof id !== "string" || id.length < 1 || id.length > 200)
    return bad("item must be an item id");
  if (seed !== undefined && !(Number.isInteger(seed) && (seed as number) >= 0))
    return bad("seed must be a whole number, 0 or more");
  if (id.endsWith("#gen") && seed === undefined)
    return bad("A generated item needs its seed");
  const item = findItem(pack, id, seed as number | undefined);
  return item ? { item } : { status: 404, body: { error: "No such item" } };
}

export const titleOf = (pack: CasePack, topic: string) =>
  pack.topics.find((t) => t.id === topic)?.title ?? topic;

/** What the panel shows for an item: its question side only, even after an attempt, plus whether a model is set up. */
export function getChat(
  dataDir: string,
  pack: CasePack,
  params: URLSearchParams,
): Result {
  const rawSeed = params.get("seed");
  const seed =
    rawSeed === null || !/^\d+$/.test(rawSeed) ? rawSeed : Number(rawSeed);
  const r = resolveItem(pack, params.get("item"), seed ?? undefined);
  if (!("item" in r)) return r;
  // Named fields from the stripped view: answers, working, mark_scheme and misconceptions never reach the page here.
  const view = toItemView(r.item);
  const preset = readConfig(dataDir)?.preset;
  return {
    status: 200,
    body: {
      item: view.id,
      ...(r.item.seed === undefined ? {} : { seed: r.item.seed }),
      topic: view.topic,
      title: titleOf(pack, view.topic),
      stem: view.stem,
      ...(view.scaffold === undefined ? {} : { scaffold: view.scaffold }),
      ...(view.figure === undefined ? {} : { figure: view.figure }),
      attempted: hasAttempt(readLines(dataDir), r.item),
      model: preset !== undefined && preset !== "none",
    },
  };
}

/** One chat request: validated in full before any job runs, then flow/chat decides. A teach-back verdict is saved with its XP line. */
export async function postChat(
  body: unknown,
  dataDir: string,
  pack: CasePack,
  deps: JobDeps,
): Promise<Result> {
  if (!isObj(body)) return bad("Body must be a JSON object");
  if (!(CHAT_JOBS as readonly unknown[]).includes(body.job))
    return bad(`job must be one of ${CHAT_JOBS.join(", ")}`);
  if (typeof body.text !== "string") return bad("text must be a string");
  const text = body.text.trim();
  if (text.length < 1 || text.length > 2000)
    return bad("text must be 1 to 2000 characters");
  const r = resolveItem(pack, body.item, body.seed);
  if (!("item" in r)) return r;

  const now = deps.now ?? utcNow;
  const day = localDay(now());
  const reply = await chat(
    {
      job: body.job as ChatJob,
      item: r.item,
      topic: titleOf(pack, r.item.topic),
      text,
    },
    readLines(dataDir),
    day,
    deps,
  );
  if (reply.kind === "refused")
    return { status: 409, body: { error: REFUSED[reply.reason] } };
  if (reply.kind !== "marks") return { status: 200, body: reply };

  // Checked again on a fresh read: a second request for this item (a reload, another tab) can have
  // saved while this job ran. Nothing is awaited between this read and the append. The day is read
  // again: a job can run past London midnight, and the record is stamped with the day it is saved on.
  const saved = taughtOn(readLines(dataDir), r.item.id, localDay(now()))
    ? null
    : // The same path a page's event takes: the refusals, the append and the xp line.
      postEvent(reply.record, dataDir, pack.topics, now);
  if (saved !== null && saved.status !== 201)
    console.error(`Could not save a teach-back: ${saved.body.error}`);
  const { kind, marks, score, of } = reply;
  return {
    status: 200,
    body: {
      kind,
      marks,
      score,
      of,
      working: r.item.working ?? null,
      saved: saved?.status === 201,
    },
  };
}
