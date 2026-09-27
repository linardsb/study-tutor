export const EVENT_TYPES = [
  "session",
  "attempt",
  "retest",
  "teachback",
  "intake",
  "xp",
  "squad",
  "photo",
  "usage",
] as const;
export type EventType = (typeof EVENT_TYPES)[number];
type Line<T extends EventType, V extends number> = { v: V; t: string; type: T };
export type Rag = "R" | "A" | "G";

export type SessionV1 = Line<"session", 1> & {
  phase: "start" | "end";
  mode:
    | "lesson"
    | "practice"
    | "retest"
    | "boss"
    | "case"
    | "coach"
    | "squad"
    | "intake";
  topic?: string;
};
export type AttemptV1 = Line<"attempt", 1> & {
  item: string;
  topic: string;
  correct: boolean;
  sure: boolean;
  answer: string;
  seed?: number;
};
export type RetestV1 = Line<"retest", 1> & {
  topic: string;
  score: number;
  of: number;
  passed: boolean;
  seed?: number;
};
export type TeachbackV1 = Line<"teachback", 1> & {
  topic: string;
  item?: string;
  marks: number;
  of: number;
};
export type IntakeV1 = Line<"intake", 1> & {
  door: "sheet" | "interview" | "diagnostic";
  topics: { topic: string; rag: Rag }[];
};
export type XpV1 = Line<"xp", 1> & {
  amount: number;
  reason: "attempt" | "retest" | "teachback";
};
export type SquadV1 = Line<"squad", 1> & {
  squad: string;
  week: string;
  topic: string;
  score: number;
  of: number;
};
export type PhotoV1 = Line<"photo", 1> & {
  item: string;
  topic: string;
  file: string;
};
export type UsageV1 = Line<"usage", 1> & {
  job: string;
  model: string;
  input: number;
  output: number;
};

export type Event =
  | SessionV1
  | AttemptV1
  | RetestV1
  | TeachbackV1
  | IntakeV1
  | XpV1
  | SquadV1
  | PhotoV1
  | UsageV1;
export type EventByKey = { [E in Event as `${E["type"]}@${E["v"]}`]: E };
export type EventKey = keyof EventByKey;
/** An event before `append` stamps `t`. */
export type NewEvent = { [K in EventKey]: Omit<EventByKey[K], "t"> }[EventKey];

type Obj = Record<string, unknown>;

const T = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

const str = (x: unknown) => typeof x === "string";
const bool = (x: unknown) => typeof x === "boolean";
const int = (x: unknown) => Number.isInteger(x) && (x as number) >= 0;
const optStr = (x: unknown) => x === undefined || str(x);
const optInt = (x: unknown) => x === undefined || int(x);
const oneOf = (x: unknown, allowed: readonly string[]) =>
  str(x) && allowed.includes(x as string);
const outOf = (n: unknown, of: unknown) =>
  int(n) && int(of) && (n as number) <= (of as number);

const MODES = [
  "lesson",
  "practice",
  "retest",
  "boss",
  "case",
  "coach",
  "squad",
  "intake",
] as const;

const FIELDS: { [K in EventKey]: (o: Obj) => boolean } = {
  "session@1": (o) =>
    oneOf(o.phase, ["start", "end"]) && oneOf(o.mode, MODES) && optStr(o.topic),
  "attempt@1": (o) =>
    str(o.item) &&
    str(o.topic) &&
    bool(o.correct) &&
    bool(o.sure) &&
    str(o.answer) &&
    optInt(o.seed),
  "retest@1": (o) =>
    str(o.topic) && outOf(o.score, o.of) && bool(o.passed) && optInt(o.seed),
  "teachback@1": (o) => str(o.topic) && optStr(o.item) && outOf(o.marks, o.of),
  "intake@1": (o) =>
    oneOf(o.door, ["sheet", "interview", "diagnostic"]) &&
    Array.isArray(o.topics) &&
    o.topics.length > 0 &&
    o.topics.every(
      (r: unknown) =>
        typeof r === "object" &&
        r !== null &&
        str((r as Obj).topic) &&
        oneOf((r as Obj).rag, ["R", "A", "G"]),
    ),
  "xp@1": (o) =>
    int(o.amount) &&
    (o.amount as number) > 0 &&
    oneOf(o.reason, ["attempt", "retest", "teachback"]),
  "squad@1": (o) =>
    str(o.squad) && str(o.week) && str(o.topic) && outOf(o.score, o.of),
  "photo@1": (o) => str(o.item) && str(o.topic) && str(o.file),
  "usage@1": (o) => str(o.job) && str(o.model) && int(o.input) && int(o.output),
};

type Own<K extends EventKey> = Exclude<keyof EventByKey[K], "v" | "t" | "type">;
/** The fields each (type, v) may carry beyond v, t and type; append writes only these. */
export const KEYS = {
  "session@1": ["phase", "mode", "topic"],
  "attempt@1": ["item", "topic", "correct", "sure", "answer", "seed"],
  "retest@1": ["topic", "score", "of", "passed", "seed"],
  "teachback@1": ["topic", "item", "marks", "of"],
  "intake@1": ["door", "topics"],
  "xp@1": ["amount", "reason"],
  "squad@1": ["squad", "week", "topic", "score", "of"],
  "photo@1": ["item", "topic", "file"],
  "usage@1": ["job", "model", "input", "output"],
} as const satisfies { [K in EventKey]: readonly Own<K>[] };
// A field added to an event type and not to KEYS fails here, so append never drops it.
type Missing = {
  [K in EventKey]: Exclude<Own<K>, (typeof KEYS)[K][number]>;
}[EventKey];
const _complete: [Missing] extends [never] ? true : Missing = true;

/** Every (type, v) the parser and replay know, in table order. */
export const EVENT_KEYS = Object.keys(FIELDS) as readonly EventKey[];

/** One log line → a typed event, or null for anything replay must skip. */
export function parseEvent(line: string): Event | null {
  let o: unknown;
  try {
    o = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof o !== "object" || o === null || Array.isArray(o)) return null;
  const obj = o as Obj;
  if (!str(obj.t) || !T.test(obj.t as string)) return null;
  // The regex lets 2026-13-01 through (Date gives NaN) and 2026-02-30 (Date rolls it to 2 March).
  const d = new Date(obj.t as string);
  if (
    Number.isNaN(d.getTime()) ||
    d.toISOString().slice(0, 19) !== (obj.t as string).slice(0, 19)
  ) {
    return null;
  }
  if (!str(obj.type) || !Number.isInteger(obj.v)) return null;
  const key = `${obj.type}@${obj.v}`;
  if (!Object.hasOwn(FIELDS, key)) return null;
  return FIELDS[key as EventKey](obj) ? (obj as Event) : null;
}
