import type { CasePack, Topic } from "../content/types";
import { appendEvent } from "../events/append";
import type { Event, NewEvent } from "../events/types";
import { findItem } from "../flow/chat";
import { passes } from "../flow/ladder";
import { xpFor } from "../flow/xp";
import { utcNow } from "../mcp/clock";

export type PostResult =
  | { status: 201; body: Event }
  | { status: 400 | 500; body: { error: string } };

/**
 * A U-code (alias) becomes its topic id; an id passes through. A string that is neither also passes
 * through: replay accepts any topic string, and an intake from a school sheet may name a code the pack
 * does not hold yet. Refusing here would turn a content gap into a write failure.
 */
export function resolveTopic(topics: readonly Topic[], code: string): string {
  if (topics.some((t) => t.id === code)) return code;
  return topics.find((t) => t.aliases.includes(code))?.id ?? code;
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** XP, photos and failed model calls are the tutor's to write, a re-test has at least one question, its pass must be the one its score gives, and a squad round has its own route. Null when no rule refuses. */
function refusal(event: Record<string, unknown>): string | null {
  if (event.type === "xp")
    return "Refused: XP is written by the tutor, not posted";
  if (event.type === "photo")
    return "Refused: photos are saved by the tutor, not posted";
  if (event.type === "job")
    return "Refused: failed model calls are recorded by the tutor, not posted";
  // Before the pass check: 0 of 0 agrees with passed:false and would drop the topic to rung 1.
  if (event.type === "retest" && typeof event.of === "number" && event.of < 1)
    return "Refused: a re-test needs at least one question";
  // Only when both are numbers: a malformed retest still gets appendEvent's own refusal.
  if (
    event.type === "retest" &&
    typeof event.score === "number" &&
    typeof event.of === "number" &&
    event.passed !== passes(event.score, event.of)
  )
    return "Refused: passed does not match the score";
  // The server marks a squad round and writes its file after the event; see src/api/squad.ts.
  if (event.type === "squad")
    return "Refused: a squad round is saved through /api/squad";
  return null;
}

/** Event types that name an item, and whether the type carries the generated item's seed. */
const NAMES_ITEM: Record<string, boolean> = {
  attempt: true,
  coach: true,
  teachback: false,
  case: false,
};

/**
 * The item must be one the pack holds under the event's topic: an items-file item, or `<topic>#gen`
 * for a topic with a generator, rebuilt from its seed where the type carries one (findItem, the
 * chat panel's lookup). Otherwise any id would earn XP. A teach-back or case with no item (the
 * squad parent round, a rule case) names none; a malformed item is left to appendEvent's refusal.
 */
function unknownItem(event: Record<string, unknown>, pack: CasePack): boolean {
  const type = String(event.type);
  if (!Object.hasOwn(NAMES_ITEM, type) || typeof event.item !== "string")
    return false;
  // teachback@1 and case@1 have no seed: seed 0 only asks whether the topic has a generator.
  const seed = NAMES_ITEM[type] ? event.seed : 0;
  const found = findItem(
    pack,
    event.item,
    typeof seed === "number" ? seed : undefined,
  );
  return found === null || found.topic !== event.topic;
}

/** The xp line after a scoring event. A failure is logged, never returned: the scoring event was saved. */
function appendXp(dataDir: string, saved: Event, now: () => string): void {
  const xp = xpFor(saved);
  if (xp === null) return;
  try {
    appendEvent(dataDir, xp, now);
  } catch (err) {
    console.error(`Could not save the XP line: ${(err as Error).message}`);
  }
}

/**
 * One posted body → one appended event (and its xp line after a scoring event), or a refusal with
 * nothing written. `pack` is given at the HTTP boundary (/api/event), where it checks every named
 * item; the server's own callers (chat, coach) build their records from pack items already.
 */
export function postEvent(
  body: unknown,
  dataDir: string,
  topics: readonly Topic[],
  now: () => string = utcNow,
  pack?: CasePack,
): PostResult {
  if (!isObj(body))
    return { status: 400, body: { error: "Body must be a JSON object" } };
  const event: Record<string, unknown> = { ...body };
  if (typeof event.topic === "string")
    event.topic = resolveTopic(topics, event.topic);
  if (Array.isArray(event.topics))
    event.topics = event.topics.map((row: unknown) =>
      isObj(row) && typeof row.topic === "string"
        ? { ...row, topic: resolveTopic(topics, row.topic) }
        : row,
    );
  const refused = refusal(event);
  if (refused !== null) return { status: 400, body: { error: refused } };
  if (pack !== undefined && unknownItem(event, pack))
    return {
      status: 400,
      body: { error: "Refused: the item is not in the pack under that topic" },
    };
  try {
    // appendEvent runs parseEvent on the line it builds and throws Refused otherwise, so the cast
    // never lets a malformed body reach the log.
    const saved = appendEvent(dataDir, event as NewEvent, now);
    appendXp(dataDir, saved, now);
    return { status: 201, body: saved };
  } catch (err) {
    const message = (err as Error).message;
    if (message.startsWith("Refused"))
      return { status: 400, body: { error: message } };
    console.error(`Could not save an event: ${message}`);
    return { status: 500, body: { error: "Could not save the event" } };
  }
}
