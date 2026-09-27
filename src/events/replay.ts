import { createHash } from "node:crypto";
import {
  afterLesson,
  afterRed,
  afterRetest,
  NEXT_DAYS,
  type Rung,
} from "../flow/ladder";
import { addDays, isoWeek, localDay } from "../mcp/clock";
import {
  type Event,
  type EventByKey,
  type EventKey,
  parseEvent,
  type Rag,
} from "./types";

export type TopicState = {
  rung: Rung;
  nextDue: string | null;
  rag: Rag | null;
};
export type Calibration = {
  sureRight: number;
  sureWrong: number;
  unsureRight: number;
  unsureWrong: number;
};
export type CaseRecord = {
  kind: "mistake" | "rule";
  topic: string;
  item: string | null;
  bets: [1 | 2 | 3, boolean][]; // (bet, correct) in answer order: the first answer, then the re-ask if there was one
};
export type State = {
  shape: 2; // bump when this type changes
  lines: number; // log lines this state was built from, skipped lines included
  skipped: number; // lines replay could not read
  hash: string; // sha256 of those lines, so the check can tell a hand edit from a code change
  topics: Record<string, TopicState>;
  xp: { total: number; byWeek: Record<string, number> }; // ISO week → XP that week
  flame: Record<string, string[]>; // ISO week → distinct London days with real work
  confidentWrong: Record<
    string,
    { topic: string; t: string; answer: string; seed?: number }
  >; // by item id
  calibration: Record<string, Calibration>; // ISO week → Sure/correct pairs (D7)
  cases: Record<string, CaseRecord>; // London day the case was for → the day's answers (O5)
  caseSeed: string | null; // topic a confident-wrong case sends back tomorrow; cleared by the next day's first answer
  tokens: Record<string, number>; // YYYY-MM → input + output
};

function topic(s: State, id: string): TopicState {
  let ts = s.topics[id];
  if (ts === undefined) {
    ts = { rung: 0, nextDue: null, rag: null };
    s.topics[id] = ts;
  }
  return ts;
}

/** Counts the London day of `t` once in its week's flame. */
function work(s: State, t: string): void {
  const day = localDay(t);
  const week = isoWeek(day);
  const days = s.flame[week] ?? [];
  if (!days.includes(day)) days.push(day);
  s.flame[week] = days;
}

const CASES: { [K in EventKey]: (s: State, e: EventByKey[K]) => void } = {
  "session@1": (s, e) => {
    if (e.topic === undefined) return;
    const ts = topic(s, e.topic);
    if (e.phase !== "end" || e.mode !== "lesson") return;
    const r = afterLesson(ts.rung);
    if (r === ts.rung) return;
    ts.rung = r;
    ts.nextDue = addDays(localDay(e.t), NEXT_DAYS[r]);
  },
  "attempt@1": (s, e) => {
    topic(s, e.topic);
    work(s, e.t);
    const week = isoWeek(localDay(e.t));
    const c = s.calibration[week] ?? {
      sureRight: 0,
      sureWrong: 0,
      unsureRight: 0,
      unsureWrong: 0,
    };
    if (e.sure) {
      if (e.correct) c.sureRight++;
      else c.sureWrong++;
    } else if (e.correct) c.unsureRight++;
    else c.unsureWrong++;
    s.calibration[week] = c;
    if (e.correct) delete s.confidentWrong[e.item];
    else if (e.sure) {
      s.confidentWrong[e.item] =
        e.seed === undefined
          ? { topic: e.topic, t: e.t, answer: e.answer }
          : { topic: e.topic, t: e.t, answer: e.answer, seed: e.seed };
    }
  },
  "retest@1": (s, e) => {
    const ts = topic(s, e.topic);
    const r = afterRetest(ts.rung, e.passed);
    ts.rung = r;
    ts.nextDue = addDays(localDay(e.t), NEXT_DAYS[r]);
    work(s, e.t);
  },
  "teachback@1": (s, e) => {
    topic(s, e.topic);
    work(s, e.t);
  },
  "intake@1": (s, e) => {
    for (const row of e.topics) {
      const ts = topic(s, row.topic);
      ts.rag = row.rag;
      if (row.rag === "R" && afterRed(ts.rung) !== ts.rung) {
        ts.rung = 1;
        ts.nextDue = addDays(localDay(e.t), NEXT_DAYS[1]);
      }
    }
  },
  "xp@1": (s, e) => {
    const week = isoWeek(localDay(e.t));
    s.xp.total += e.amount;
    s.xp.byWeek[week] = (s.xp.byWeek[week] ?? 0) + e.amount;
  },
  "squad@1": (s, e) => {
    topic(s, e.topic);
    work(s, e.t);
  },
  "photo@1": (s, e) => {
    topic(s, e.topic);
  },
  "usage@1": (s, e) => {
    const month = localDay(e.t).slice(0, 7);
    s.tokens[month] = (s.tokens[month] ?? 0) + e.input + e.output;
  },
  // Keyed by e.day, not localDay(e.t): a case opened at 23:58 and answered at 00:02 belongs to the
  // day it was picked for. The flame still counts the London day of t.
  "case@1": (s, e) => {
    topic(s, e.topic);
    work(s, e.t);
    const rec = s.cases[e.day];
    const fresh = (): CaseRecord => ({
      kind: e.kind,
      topic: e.topic,
      item: e.item ?? null,
      bets: [[e.bet, e.correct]],
    });
    if (e.reask) {
      // A re-ask with no first answer on record (hand edit) is kept as the day's only pair.
      if (rec === undefined) s.cases[e.day] = fresh();
      else rec.bets.push([e.bet, e.correct]);
      return;
    }
    if (rec !== undefined) return; // the first answer of a day is the record; a repeat post changes nothing
    s.cases[e.day] = fresh();
    s.caseSeed = e.bet === 3 && !e.correct ? e.topic : null;
  },
};

/** An empty map with no prototype, so an id such as `__proto__` or `constructor` is just a key. */
export const dict = <V>(): Record<string, V> => Object.create(null);

/** Pure: the same lines always give the same state. Reads no clock and no file. */
export function replay(lines: readonly string[]): State {
  const s: State = {
    shape: 2,
    lines: 0,
    skipped: 0,
    hash: "",
    topics: dict(),
    xp: { total: 0, byWeek: dict() },
    flame: dict(),
    confidentWrong: dict(),
    calibration: dict(),
    cases: dict(),
    caseSeed: null,
    tokens: dict(),
  };
  const hash = createHash("sha256");
  // File order, never sorted by t: a PC clock change can write an earlier t after a later one.
  for (const line of lines) {
    hash.update(`${line}\n`);
    const event = parseEvent(line);
    if (event === null) {
      s.skipped++;
      continue;
    }
    const key = `${event.type}@${event.v}` as EventKey;
    (CASES[key] as (s: State, e: Event) => void)(s, event);
  }
  s.lines = lines.length;
  s.hash = hash.digest("hex");
  return s;
}
