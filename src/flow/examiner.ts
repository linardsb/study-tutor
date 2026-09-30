/**
 * Examiner mode (O3), pure: no clock, no file. Which item a photo is for, whether the job may run, and
 * the photo record. src/snap.ts saves the photo first, then passes its path and writes the record.
 */
import type { Item } from "../content/types";
import { type NewEvent, parseEvent } from "../events/types";
import type { JobDeps } from "../jobs/define";
import { type ExamLine, examinerMark, score } from "../jobs/examiner_mark";
import { type ItemRef, jobItem } from "../jobs/view";

/** The item of the last attempt in the log that `keep` accepts, in file order, or null. */
export function lastAttempt(
  log: readonly string[],
  keep: (ref: ItemRef) => boolean = () => true,
): ItemRef | null {
  for (let i = log.length - 1; i >= 0; i -= 1) {
    const e = parseEvent(log[i] as string);
    if (e?.type !== "attempt") continue;
    const ref =
      e.seed === undefined ? { id: e.item } : { id: e.item, seed: e.seed };
    if (keep(ref)) return ref;
  }
  return null;
}

export type ExamReply =
  | {
      kind: "marks";
      lines: ExamLine[];
      marks: number;
      of: number;
      clean: boolean;
    }
  | { kind: "not-marked" }
  | { kind: "refused" }; // no attempt for this item: the job never runs

export type ExamAsk = {
  item: Item & { seed?: number };
  topic: string; // the topic's title, for the prompt
  photo: { bytes: Uint8Array; mime: string };
};

/** Marks one saved photo. The job sees the full item only once the log holds an attempt for it (and its seed). */
export async function examine(
  ask: ExamAsk,
  log: readonly string[],
  deps: JobDeps,
): Promise<ExamReply> {
  const j = jobItem(log, ask.item);
  if (!j.attempted) return { kind: "refused" };
  const v = await examinerMark.run(
    { item: j.item, topic: ask.topic, photo: ask.photo },
    deps,
  );
  if (v.by === "fallback" || v.value === null) return { kind: "not-marked" };
  return { kind: "marks", lines: v.value.lines, ...score(v.value) };
}

/** The photo event: the marks trio only when the photo was marked. */
export function photoRecord(
  item: Item & { seed?: number },
  file: string,
  reply: ExamReply,
): NewEvent {
  return {
    v: 1,
    type: "photo",
    item: item.id,
    topic: item.topic,
    file,
    ...(item.seed === undefined ? {} : { seed: item.seed }),
    ...(reply.kind === "marks"
      ? { marks: reply.marks, of: reply.of, clean: reply.clean }
      : {}),
  };
}
