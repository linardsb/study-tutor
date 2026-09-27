import type { Topic } from "../content/types";
import { appendEvent } from "../events/append";
import type { Event, NewEvent } from "../events/types";
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

/** One posted body → one appended event, or a refusal with nothing written. */
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
  try {
    // appendEvent runs parseEvent on the line it builds and throws Refused otherwise, so the cast
    // never lets a malformed body reach the log.
    return { status: 201, body: appendEvent(dataDir, event as NewEvent, now) };
  } catch (err) {
    const message = (err as Error).message;
    if (message.startsWith("Refused"))
      return { status: 400, body: { error: message } };
    console.error(`Could not save an event: ${message}`);
    return { status: 500, body: { error: "Could not save the event" } };
  }
}
