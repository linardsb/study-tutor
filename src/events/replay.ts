import { createHash } from "node:crypto";
import {
  afterLesson,
  afterRed,
  afterRetest,
  NEXT_DAYS,
  type Rung,
} from "../flow/ladder";
import { rankFor } from "../flow/rank";
import { type OpenSession, onSession } from "../flow/session";
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
export type PhotoWeek = {
  taken: number;
  marked: number;
  marks: number;
  of: number;
  clean: number;
};
export type State = {
  shape: 7; // bump when this type changes
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
  unmarked: Record<string, { week: string; sure: boolean }>; // item id → its latest attempt, when that attempt is null and no teach-back has marked it yet (#53)
  cases: Record<string, CaseRecord>; // London day the case was for → the day's answers (O5)
  caseSeed: string | null; // topic a confident-wrong case sends back tomorrow; cleared by the next day's first answer
  tokens: Record<string, number>; // YYYY-MM → input + output
  session: OpenSession | null; // the open session, or null when idle
  retests: Record<
    string,
    { score: number; of: number; taken: number; passed: number }
  >; // ISO week → summed re-test score and of, and how many were taken and passed
  coach: { shown: number; caught: number; rank: number }; // O2: wrong steps shown, caught, and Dan's rank from rankFor
  photos: Record<string, PhotoWeek>; // ISO week → photo counts and summed marks (O3)
  failed: Record<string, Record<string, number>>; // ISO week → job@1 reason → count (model calls that fell back)
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

/** Counts one Sure/Not sure bet and whether it was right in that week's calibration. */
function bet(s: State, week: string, sure: boolean, correct: boolean): void {
  const c = s.calibration[week] ?? {
    sureRight: 0,
    sureWrong: 0,
    unsureRight: 0,
    unsureWrong: 0,
  };
  if (sure) {
    if (correct) c.sureRight++;
    else c.sureWrong++;
  } else if (correct) c.unsureRight++;
  else c.unsureWrong++;
  s.calibration[week] = c;
}

/**
 * attempt@1 and attempt@2. A null `correct` (answered, not marked in code) is work, and waits in
 * `unmarked` for a teach-back to settle its calibration bet; it says nothing about confident-wrong.
 */
function attempt(
  s: State,
  e: EventByKey["attempt@1"] | EventByKey["attempt@2"],
): void {
  topic(s, e.topic);
  work(s, e.t);
  const week = isoWeek(localDay(e.t));
  if (e.correct === null) {
    s.unmarked[e.item] = { week, sure: e.sure };
    return;
  }
  delete s.unmarked[e.item];
  bet(s, week, e.sure, e.correct);
  if (e.correct) delete s.confidentWrong[e.item];
  else if (e.sure) {
    s.confidentWrong[e.item] =
      e.seed === undefined
        ? { topic: e.topic, t: e.t, answer: e.answer }
        : { topic: e.topic, t: e.t, answer: e.answer, seed: e.seed };
  }
}

const CASES: { [K in EventKey]: (s: State, e: EventByKey[K]) => void } = {
  "session@1": (s, e) => {
    s.session = onSession(s.session, e);
    if (e.topic === undefined) return;
    const ts = topic(s, e.topic);
    if (e.phase !== "end" || e.mode !== "lesson") return;
    const r = afterLesson(ts.rung);
    if (r === ts.rung) return;
    ts.rung = r;
    ts.nextDue = addDays(localDay(e.t), NEXT_DAYS[r]);
  },
  "attempt@1": attempt,
  "attempt@2": attempt,
  "retest@1": (s, e) => {
    const ts = topic(s, e.topic);
    const r = afterRetest(ts.rung, e.passed);
    ts.rung = r;
    ts.nextDue = addDays(localDay(e.t), NEXT_DAYS[r]);
    work(s, e.t);
    const week = isoWeek(localDay(e.t));
    const sum = s.retests[week] ?? { score: 0, of: 0, taken: 0, passed: 0 };
    sum.score += e.score;
    sum.of += e.of;
    sum.taken += 1;
    if (e.passed) sum.passed += 1;
    s.retests[week] = sum;
  },
  "teachback@1": (s, e) => {
    topic(s, e.topic);
    work(s, e.t);
    // #53: the first teach-back after a null attempt settles its bet, in the attempt's week. Full marks is right.
    const u = e.item === undefined ? undefined : s.unmarked[e.item];
    if (e.item === undefined || u === undefined) return;
    bet(s, u.week, u.sure, e.marks === e.of);
    delete s.unmarked[e.item];
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
    const week = isoWeek(localDay(e.t));
    const w = s.photos[week] ?? {
      taken: 0,
      marked: 0,
      marks: 0,
      of: 0,
      clean: 0,
    };
    w.taken += 1;
    if (e.marks !== undefined && e.of !== undefined) {
      w.marked += 1;
      w.marks += e.marks;
      w.of += e.of;
      if (e.clean) w.clean += 1;
    }
    s.photos[week] = w;
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
      // At most one re-ask a day (T7 AC 6, PR #31 F9): a second one from another tab is ignored.
      else if (rec.bets.length < 2) rec.bets.push([e.bet, e.correct]);
      return;
    }
    if (rec !== undefined) return; // the first answer of a day is the record; a repeat post changes nothing
    s.cases[e.day] = fresh();
    s.caseSeed = e.bet === 3 && !e.correct ? e.topic : null;
  },
  // No work(): the attempt written just before this line already counts the day.
  "coach@1": (s, e) => {
    topic(s, e.topic);
    s.coach.shown += 1;
    if (e.caught) s.coach.caught += 1;
    s.coach.rank = rankFor(s.coach.caught);
  },
  // No topic(), no work(): a failed model call is not practice.
  "job@1": (s, e) => {
    const week = isoWeek(localDay(e.t));
    const w = s.failed[week] ?? dict<number>();
    w[e.reason] = (w[e.reason] ?? 0) + 1;
    s.failed[week] = w;
  },
};

/** An empty map with no prototype, so an id such as `__proto__` or `constructor` is just a key. */
export const dict = <V>(): Record<string, V> => Object.create(null);

/** Pure: the same lines always give the same state. Reads no clock and no file. */
export function replay(lines: readonly string[]): State {
  const s: State = {
    shape: 7,
    lines: 0,
    skipped: 0,
    hash: "",
    topics: dict(),
    xp: { total: 0, byWeek: dict() },
    flame: dict(),
    confidentWrong: dict(),
    calibration: dict(),
    unmarked: dict(),
    cases: dict(),
    caseSeed: null,
    tokens: dict(),
    session: null,
    retests: dict(),
    coach: { shown: 0, caught: 0, rank: 0 },
    photos: dict(),
    failed: dict(),
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
