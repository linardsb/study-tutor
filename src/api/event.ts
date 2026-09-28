import type { Topic } from "../content/types";
import { appendEvent } from "../events/append";
import type { Event, NewEvent } from "../events/types";
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

/** XP is the tutor's to write, and a re-test's pass must be the one its score gives. Null when neither rule refuses. */
function refusal(event: Record<string, unknown>): string | null {
  if (event.type === "xp")
    return "Refused: XP is written by the tutor, not posted";
  // Only when both are numbers: a malformed retest still gets appendEvent's own refusal.
  if (
    event.type === "retest" &&
    typeof event.score === "number" &&
    typeof event.of === "number" &&
    event.passed !== passes(event.score, event.of)
  )
    return "Refused: passed does not match the score";
  return null;
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

/** One posted body → one appended event (and its xp line after a scoring event), or a refusal with nothing written. */
export function postEvent(
  body: unknown,
  dataDir: string,
  topics: readonly Topic[],
  now: () => string = utcNow,
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
