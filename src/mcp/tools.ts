import { postEvent, resolveTopic } from "../api/event";
import { lessonFile, loadItems, toItemView } from "../content/pack";
import type { Topic } from "../content/types";
import { readLines } from "../events/append";
import { replay } from "../events/replay";
import { EVENT_TYPES, type EventType, KEYS, parseEvent } from "../events/types";
import { isoWeek, localDay, utcNow } from "./clock";

export type ToolName = "read_state" | "write_event" | "open_lesson" | "clock";

/** What every tool runs against. No tool takes a path, file or subject from its arguments. */
export type ToolContext = {
  root: string;
  dataDir: string;
  subjects: ReadonlyMap<string, string>; // topic id → content/<subject>
  topics: readonly Topic[];
  /** http://127.0.0.1:<port>, no trailing slash. */
  origin: string;
  now?: () => string;
};

export type ToolResult =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; error: string };

export type Tool = {
  kind: "read" | "write";
  description: string;
  inputSchema: Record<string, unknown>;
  run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
};

/** Which event types a harness may append (plan D1). attempt: the page marks, and an attempt unlocks answers. */
export const MCP_WRITABLE: Record<EventType, boolean> = {
  session: true,
  attempt: false,
  retest: false,
  teachback: false,
  intake: true,
  xp: false,
  squad: false,
  photo: false,
  usage: false,
  case: false, // the page marks the pick and the bet, as with attempt (T7 merge)
  coach: false, // the server marks the correction and writes it with its attempt (T12)
  job: false, // the tutor records its own failed model calls (T15)
};
const WRITABLE = EVENT_TYPES.filter((t) => MCP_WRITABLE[t]);

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Item ids with at least one attempt event in the log: exact id match, so `#gen` unlocks nothing else. */
export function attemptedItems(lines: readonly string[]): Set<string> {
  const seen = new Set<string>();
  for (const line of lines) {
    const e = parseEvent(line);
    if (e?.type === "attempt") seen.add(e.item);
  }
  return seen;
}

/** A topic id or U-code → a topic id the pack holds, or null. Unlike postEvent, a tool refuses an unknown topic. */
function topicId(ctx: ToolContext, code: string): string | null {
  const id = resolveTopic(ctx.topics, code);
  return ctx.topics.some((t) => t.id === id) ? id : null;
}

const readState: Tool = {
  kind: "read",
  description:
    "The pupil's record replayed from the event log, the topic list, and, given a topic id or U-code, that topic's items. An item's answers appear only after the pupil has attempted it in the lesson page.",
  inputSchema: {
    type: "object",
    properties: { topic: { type: "string" } },
    additionalProperties: false,
  },
  async run(args, ctx) {
    // replay, not currentState: a read tool writes nothing, state.json included (plan D5).
    const lines = readLines(ctx.dataDir);
    const state = replay(lines);
    const topics = ctx.topics.map(({ id, title, aliases }) => ({
      id,
      title,
      aliases,
    }));
    if (args.topic === undefined) return { ok: true, value: { state, topics } };
    const code = String(args.topic);
    const id = topicId(ctx, code);
    if (id === null) return { ok: false, error: `Unknown topic: ${code}` };
    const subject = ctx.subjects.get(id);
    if (subject === undefined)
      return { ok: false, error: `Unknown topic: ${code}` };
    const seen = attemptedItems(lines);
    const items = (await loadItems(subject, id, ctx.root)).map((i) =>
      seen.has(i.id) ? i : toItemView(i),
    );
    return { ok: true, value: { state, topics, topic: id, items } };
  },
};

const writeEvent: Tool = {
  kind: "write",
  description: [
    "Appends one event to the pupil's record. The tutor stamps the time; a topic may be an id or a U-code.",
    ...WRITABLE.map((t) => `${t} v1 fields: ${KEYS[`${t}@1`].join(", ")}.`),
    "Attempts are written by the lesson page, never by a tool.",
  ].join(" "),
  inputSchema: {
    type: "object",
    properties: {
      type: { enum: WRITABLE },
      v: { type: "integer" },
    },
    required: ["type", "v"],
    additionalProperties: true,
  },
  async run(args, ctx) {
    const type = isObj(args) ? args.type : undefined;
    if (typeof type !== "string" || !Object.hasOwn(MCP_WRITABLE, type))
      return { ok: false, error: "Refused: not an event type" };
    if (!MCP_WRITABLE[type as EventType])
      return {
        ok: false,
        error: `Refused: ${type} events are written by the tutor's own pages, not by a tool`,
      };
    const r = postEvent(args, ctx.dataDir, ctx.topics, ctx.now ?? utcNow);
    return r.status === 201
      ? { ok: true, value: r.body }
      : { ok: false, error: r.body.error };
  },
};

const openLesson: Tool = {
  kind: "read",
  description:
    "The address of a topic's lesson page, given a topic id or U-code. The pupil answers the questions there.",
  inputSchema: {
    type: "object",
    properties: { topic: { type: "string" } },
    required: ["topic"],
    additionalProperties: false,
  },
  async run(args, ctx) {
    const code = String(args.topic);
    const id = topicId(ctx, code);
    if (id === null) return { ok: false, error: `Unknown topic: ${code}` };
    const subject = ctx.subjects.get(id);
    if (subject === undefined)
      return { ok: false, error: `Unknown topic: ${code}` };
    const file = lessonFile(ctx.root, subject, id);
    if (file === null) return { ok: false, error: `No lesson for ${id}` };
    const title = ctx.topics.find((t) => t.id === id)?.title;
    return {
      ok: true,
      value: {
        topic: id,
        title,
        url: `${ctx.origin}/content/${subject}/lessons/${file}`,
      },
    };
  },
};

const clock: Tool = {
  kind: "read",
  description:
    "The time now in UTC, the pupil's calendar day in London and its ISO week.",
  inputSchema: { type: "object", additionalProperties: false },
  async run(_args, ctx) {
    const utc = (ctx.now ?? utcNow)();
    const day = localDay(utc);
    return { ok: true, value: { utc, day, week: isoWeek(day) } };
  },
};

/** The four tools of D11. Only write_event writes, and only through postEvent → appendEvent. */
export const TOOLS: Record<ToolName, Tool> = {
  read_state: readState,
  write_event: writeEvent,
  open_lesson: openLesson,
  clock,
};

/** Runs one tool; a throw becomes a result, and only a `Refused` message reaches the caller. */
export async function runTool(
  name: ToolName,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  try {
    return await TOOLS[name].run(args, ctx);
  } catch (err) {
    const message = (err as Error).message;
    console.error(`Tool ${name} failed: ${message}`);
    return {
      ok: false,
      error: message.startsWith("Refused")
        ? message
        : "The tutor could not do that",
    };
  }
}
