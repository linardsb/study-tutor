# Feature: T2 — Events: types, append with `data/` confinement, replay, replay-check

The following plan should be complete, but validate documentation and codebase patterns and task sanity
before you start implementing.

Pay special attention to the exact shapes below: the event union, the `State` shape and the six-week fixture
were worked out together, and the fixture's expected values were derived by hand from the ladder rule
(dates and ISO weeks `observed` from a Bun run on 2026-09-27, `scratchpad/wk.ts`). Copy them; do not
re-derive from memory.

**Gate before implementing (Q1).** CLAUDE.md: "E1 (adherence on the existing v1 folder) runs before any
engine work." Epic #1 assumption A1 makes E1 gate T2. T0 merged 2026-09-27, E1 is a two-week count, so the
read lands around 2026-10-11 (`derived`: 2026-09-27 + 14 days). Do not start Phase 1 until the E1 read is
in or Linards overrides the gate in writing.

## Feature Description

The record of everything the pupil does, and the one place that derives progress from it (architecture
D3). Five pieces:

1. `src/events/types.ts`: the event union, one TypeScript type per `(type, v)`, and a runtime parser that
   turns one log line into a typed event or `null`.
2. `src/events/append.ts`: the only code that writes under `data/`. It appends one line per event to
   `data/events.jsonl` and fsyncs it (forces it to disk before returning), writes `data/state.json`
   atomically, and refuses any path that resolves outside `data/`, including through `../` and symlinks.
3. `src/mcp/clock.ts`: the UTC clock that stamps `t` on every event, plus the date arithmetic replay needs
   (London day of a UTC timestamp, add days, ISO week).
4. `src/events/replay.ts`: a pure reducer (same lines in, same state out, no clock, no disk) with one case
   per `(type, v)`, deriving the topic map (rung and next-due per topic), XP, the weekly flame, the
   confident-wrong pool, calibration pairs and the monthly token count.
5. `src/events/check.ts` + `scripts/replay-check.ts`: after an update, replay the log with the new code,
   compare against the stored `state.json`, and refuse to start if any rung would fall.

Then the S5 spike: 200 synthetic events, a state-shape change, replay, diff, recorded in the architecture
doc.

## User Story

As a pupil
I want every attempt, re-test and lesson I finish to be recorded once and never lost or rewritten
So that my levels, XP and flame survive every update of the tutor

As Linards (maintainer)
I want a state shape change to be a replay with a check that refuses to start if a rung would fall
So that an update can never silently drop a pupil's progress

## Problem Statement

v1 keeps progress in markdown tables the model edits, so progress depends on the model being present and
a bad edit is invisible. v2 needs a record code writes, that survives updates (constraint 6), that no tool
can write outside of (D11), and from which every later ticket (T4 state API, T5 flow, T6 map, T7 calibration,
T8 token counter, T10 MCP) reads one derived state.

## Solution Statement

Append-only JSON lines, one event per line, each carrying its own version `v`. Replay is the only reader
that derives state; it walks lines in file order and dispatches each to a case keyed `"type@v"` in a table
the compiler checks for completeness (`observed`: a missing key fails `tsc` with TS2741, probe
`scratchpad/pin.ts`, 2026-09-27). Malformed or unknown-version lines are skipped and counted, never fatal,
because the design accepts a pupil hand-editing the log (architecture "Gaming").

`state.json` records how many log lines it was built from (`lines`). The startup check replays exactly
that prefix with the new code and compares rungs, so a real failed re-test appended after the last state
write never trips it. Only a code change that lowers a rung for the same events does. (PR #23 review M2: "same events" is checked by a sha256 of the prefix; a hand edit that keeps the line count rebuilds instead.)

The ladder rule is v1's, read out of the donor (`~/Desktop/Matis_study_tutor/.claude/skills/study/SKILL.md:26`
and `:71`, `intake.md:31`): `not started` → `learning` (lesson done) → `1 pass` → `2 passes` → `secure`;
re-tests due 3, 10, 30, then every 60 days; a failed re-test at any rung, or red on a new sheet at `1 pass`
or better, sends the topic back to `learning`.

## Out of Scope / Non-Goals

- Not included: any HTTP route (`GET /api/state`, `POST /api/event` are T4). Nothing in `src/server.ts` changes.
- Not included: XP amounts and when XP is granted (T5 `src/flow/xp.ts`). Replay sums `xp` events; it never
  decides an amount.
- Not included: session state machine, boss pick, practice-never-drops logic beyond "a lesson never lowers a
  rung" (T5).
- Not included: running replay-check on server start (T11 wires it). T2 ships the function and the CLI.
- Not included: the MCP `clock` tool itself (T10). T2 ships the function it will wrap.
- Not included: the 1–3 confidence bet and "you predicted n, you scored m" (T7). Calibration here is the
  Sure / correct pair from the attempt event, which is what D7 says the calibration line reads.
- Not included: `marks left on the table` from photo events (T13), squad totals (T14). Their v1 cases exist
  and change no state.
- Not changing: `src/server.ts`, `scripts/build.ts`, `launchers/`, `e1/`.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: `src/events`, `src/mcp/clock.ts`, `src/flow/ladder.ts`, `scripts/`
**Dependencies**: none new. `node:fs`, `node:path`, `node:os` (tests), `bun:test`.

## Related Work

**Implements**: #4 (T2) · **Epic**: #1, `docs/tickets/study-tutor-v2.md` §T2, architecture
`docs/prd/study-tutor-v2.architecture.md` (D3, D7, D11, S5, "System behaviour")

**Back-references**:

- `.claude/plans/s1-spike-and-repo-skeleton.md` - Why: the gate (`bun run check`), the `import.meta.main`
  CLI pattern and the "spike result recorded in the architecture doc" format this plan reuses for S5.
- `.claude/plans/e1-map-and-detective-case-v1-folder.md` - Why: E1 is the gate on this ticket (Q1); its
  `flame()` counts distinct days of real work, which this reducer mirrors.

**Forward-references**:

- T4 (#6) reads `replay` and `appendEvent`; T5 (#7) updates `src/flow/ladder.ts` (Q4); T8 (#10) writes
  `usage` events (Q2); T10 (#12) wraps `resolveInData`, `appendEvent`, `utcNow`; T11 (#13) runs
  `replayCheck` on start.

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `.claude/references/events.md` (whole, 23 lines) - Why: the event line, the rules this ticket implements,
  and the doc this ticket updates (Task 13).
- `docs/prd/study-tutor-v2.architecture.md` lines 92-101 (D3), 128-133 (D7), 157-163 (D11), 183-199
  ("System behaviour", "Gaming"), 225-227 (S5), 201-224 (S1 result format to mirror for S5).
- `src/server.ts` lines 1-72 - Why: house style (named exports, `/** */` one-line doc comments, error
  `code` narrowing at lines 36-39, `if (import.meta.main)` CLI at lines 62-72).
- `src/server.test.ts` - Why: test style (`import { expect, test } from "bun:test"`, `try/finally` cleanup).
- `scripts/build.ts` lines 1-2, 30-40 - Why: `import fs from "node:fs"` default-import style, `process.exit(1)`
  with a plain console message on failure.
- `e1/assets/case.js` lines 145-165 - Why: v1 `calibration()` and `flame()` semantics (a day counts once;
  opens do not count).
- `~/Desktop/Matis_study_tutor/.claude/skills/study/SKILL.md` lines 26 and 71 - Why: the ladder rule
  (rungs, 3/10/30/60, fail → learning, due = today + 3).
- `~/Desktop/Matis_study_tutor/.claude/skills/study/references/intake.md` line 31 - Why: red on a new sheet
  at `1 pass` or better → `learning`.
- `tsconfig.json` - Why: `strict`, `noUncheckedIndexedAccess` (every `record[key]` is `T | undefined`),
  `verbatimModuleSyntax` (type-only imports need `import type`), include is `src` and `scripts`.
- `biome.json` - Why: recommended preset, double quotes, 2-space indent. `.jsonl` fixtures under `src/` pass
  the gate and Biome does not read them (`observed` 2026-09-27: an 8-line fixture-length
  `probe.v1.jsonl`, `biome check --write .` still "Checked 7 files", the file byte-identical by `cmp`).

### New Files to Create

- `src/mcp/clock.ts` + `src/mcp/clock.test.ts` - `TIME_ZONE`, `utcNow`, `localDay`, `addDays`, `isoWeek`
- `src/flow/ladder.ts` + `src/flow/ladder.test.ts` - rung names, intervals, three pure transitions
- `src/events/types.ts` + `src/events/types.test.ts` - union, `NewEvent`, `parseEvent`, `EVENT_KEYS`
- `src/events/__fixtures__/{session,attempt,retest,teachback,intake,xp,squad,photo,usage}.v1.jsonl` - one per event version
- `src/events/__fixtures__/six-weeks.jsonl` - the scripted history (Task 7)
- `src/events/append.ts` + `src/events/append.test.ts` - confinement, append, read, state write
- `src/events/replay.ts` + `src/events/replay.test.ts` - `State`, `replay`
- `src/events/check.ts` + `src/events/check.test.ts` - `replayCheck`
- `scripts/replay-check.ts` - CLI over `replayCheck`
- `scripts/synth-events.ts` - seeded synthetic log for S5

Updated: `.claude/references/events.md` (type list, state shape, check rule), architecture doc (S5 result).

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [Node `fs.realpathSync.native`](https://nodejs.org/api/fs.html#fsrealpathsyncnativepath-options) - Why:
  canonical path including case on Windows; `observed` on this Mac it maps `/var/folders/...` to
  `/private/var/folders/...`, so every test comparing paths must realpath its temp dir first.
- [Node `fs.openSync` flags](https://nodejs.org/api/fs.html#file-system-flags) - `"a"`: O_APPEND, creates
  the file. [`fs.fsyncSync`](https://nodejs.org/api/fs.html#fsfsyncsyncfd).
- [Node `fs.renameSync`](https://nodejs.org/api/fs.html#fsrenamesyncoldpath-newpath) - replaces an existing
  target (`observed` in Bun 1.3.4 on macOS, 2026-09-27; Windows has a copy fallback, Task 6, Q8).
- [Bun test `setSystemTime` and `spyOn`](https://bun.sh/docs/test/time) /
  [mocks](https://bun.sh/docs/test/mocks) - Why: the purity test and the fsync-per-line test.
- [ISO 8601 week date](https://en.wikipedia.org/wiki/ISO_week_date) - week 1 holds the year's first Thursday.

### Patterns to Follow

**Naming:** files lower-case single word; functions camelCase; exported constants UPPER_SNAKE
(`PORTS` in `src/server.ts:1`). State JSON keys camelCase (v1 `progress-data.js` uses `lessonFile`;
CLAUDE.md "Browser JS reads the same JSON shape").

**Imports:** `import fs from "node:fs"; import path from "node:path";` (`scripts/build.ts:1-2`). Type-only
imports as `import type { Event } from "./types";` (`verbatimModuleSyntax`). No extension in relative
imports (`src/server.test.ts:2`).

**Errors:** narrow Node errors with `(err as { code?: string }).code` (`src/server.ts:38`). Throw plain
`Error` with a sentence that names the path. No custom error classes.

**CLI:** `if (import.meta.main) { ... }` with `console.error` and `process.exit(1)` on failure
(`src/server.ts:62-72`).

**Compile-pinned tables:** every set that must stay 1:1 with the union is a mapped type over
`EventByKey`, never a prose list or a `switch` without exhaustiveness:

```ts
type EventByKey = { [E in Event as `${E["type"]}@${E["v"]}`]: E };
export type EventKey = keyof EventByKey;
const CASES: { [K in EventKey]: (s: State, e: EventByKey[K]) => void } = { ... };
```

Dispatch needs one cast, which is the only `as` on an event in the reducer:
`(CASES[key] as (s: State, e: Event) => void)(state, event)`.

---

## THE ANSWER GUARD (CLAUDE.md "Restate the guard")

This ticket creates `src/mcp/clock.ts`, so it names the guard. No model call and no prompt is added. The
answer stays withheld because:

1. Replay reads `data/events.jsonl` only. It never opens `content/`, so it never sees an item's `answers`
   or `mark_scheme`.
2. No event type carries an item's correct answer. `attempt.answer` is what the pupil typed; `retest`
   carries a score; `photo` carries a file path. The `confidentWrong` pool stores the pupil's wrong answer,
   and an entry exists only after an attempt event for that item.
3. So `state.json`, which T10's `read_state` will serve, cannot hold a correct answer for an item without
   an attempt event. A test asserts the six-week state contains no key named `answers` or `markScheme` /
   `mark_scheme` (Task 8).

---

## IMPLEMENTATION PLAN

### Phase 0: Branch

`git fetch && git switch -c feature/t2-events origin/main` (PR #21 is merged, `origin/main` is 379b35c,
`observed` 2026-09-27). The uncommitted edit to `.claude/skills/piv-create-pr/SKILL.md` follows into the
working tree; leave it unstaged and out of every T2 commit.

### Phase 1: Foundation — clock, ladder, types, fixtures

Pure modules with no I/O. `ladder.ts` imports nothing from `src/events` (no import cycle: replay imports
ladder, never the reverse).

### Phase 2: Core — append (I/O and confinement), replay (pure)

**Depends on:** Phase 1. **Independent of each other:** append and replay share only `types.ts`.

### Phase 3: Integration — check, CLI, synth script

**Depends on:** Phase 2.

### Phase 4: S5 spike and docs

**Depends on:** Phase 3.

---

## STEP-BY-STEP TASKS

### 1. CREATE `src/mcp/clock.ts`

- **IMPLEMENT** (verbatim; every function below ran in the 2026-09-27 probes `scratchpad/wk.ts` and
  `scratchpad/tz.ts`):
  ```ts
  /** GCSE is England's exam, so the pupil's calendar day is London's, whatever the PC's zone. */
  export const TIME_ZONE = "Europe/London";

  /** UTC now to the second, e.g. 2026-10-03T17:42:10Z. The only clock events are stamped with. */
  export function utcNow(): string {
    return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
  }

  // Built once. If the runtime had no time zone data this throws; fall back to the UTC day.
  const london = (() => {
    try {
      return new Intl.DateTimeFormat("en-GB", {
        timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
      });
    } catch {
      return null;
    }
  })();

  /** YYYY-MM-DD in London of a UTC timestamp: 2026-10-11T23:30:00Z is 2026-10-12 (BST). */
  export function localDay(t: string): string {
    if (london === null) return t.slice(0, 10);
    const p: Record<string, string> = {};
    for (const part of london.formatToParts(new Date(t))) p[part.type] = part.value;
    return `${p.year}-${p.month}-${p.day}`;
  }

  /** YYYY-MM-DD n days after a YYYY-MM-DD. Calendar arithmetic, so no DST effect. */
  export function addDays(day: string, n: number): string {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  }

  /** ISO 8601 week of a YYYY-MM-DD, e.g. 2026-W41. Week 1 holds the year's first Thursday. */
  export function isoWeek(day: string): string {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // Thursday of this week
    const year = d.getUTCFullYear();
    const jan4 = new Date(Date.UTC(year, 0, 4));
    const week = 1 + Math.round(((d.getTime() - jan4.getTime()) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
    return `${year}-W${String(week).padStart(2, "0")}`;
  }
  ```
- **PATTERN**: one-line `/** */` doc comments as `src/server.ts:30`.
- **GOTCHA**: `addDays` and `isoWeek` take a day string and use UTC methods only, so they give the same
  answer on any PC; the zone enters once, in `localDay`. Never call `getDay`/`setDate` (local-time methods).
- **GOTCHA**: the zone is a constant, not a setting: the product is GCSE-only (CLAUDE.md "What this is"),
  and a constant keeps `replay` pure with no argument to thread through.
- **GOTCHA**: time zone data: `observed` 2026-09-27 the probe gives the same days under `bun` and a
  `bun build --compile` mac binary, and the `bun-windows-x64` compile of it contains ICU's `zoneinfo64`
  table (`grep -a`, 2 matches). The `try/catch` fallback is what keeps a runtime without that data
  starting (days then shift at 00:00–01:00 in summer only).
- **VALIDATE**: `bun test src/mcp` with `clock.test.ts` asserting (`observed` from `scratchpad/wk.ts`,
  2026-09-27): `isoWeek("2026-10-05") === "2026-W41"`, `"2026-10-11"` → `W41` (Sunday), `"2026-10-12"` →
  `W42`, `"2021-01-03"` → `"2020-W53"`, `"2027-01-01"` → `"2026-W53"`, `"2026-12-31"` → `"2026-W53"`;
  `addDays("2026-10-25", 30) === "2026-11-24"`, `addDays("2026-10-05", 41) === "2026-11-15"`;
  `utcNow()` matches `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/`; `localDay` (`observed`, `scratchpad/tz.ts`):
  `"2026-10-11T23:30:00Z"` → `"2026-10-12"` (BST), `"2026-10-25T00:30:00Z"` → `"2026-10-25"` (clocks go
  back that night), `"2026-03-29T23:30:00Z"` → `"2026-03-30"` (first BST night), `"2026-03-28T23:30:00Z"` →
  `"2026-03-28"` (GMT), `"2026-12-31T23:30:00Z"` → `"2026-12-31"`, `"2026-06-30T23:00:00Z"` → `"2026-07-01"`.
- **SATISFIES**: AC 3 (clock supplies UTC `t`).

### 2. CREATE `src/flow/ladder.ts`

- **IMPLEMENT**:
  ```ts
  /** Rung 0 to 4. v1 stage names, same order. */
  export const RUNGS = ["not started", "learning", "1 pass", "2 passes", "secure"] as const;
  export type Rung = 0 | 1 | 2 | 3 | 4;
  /** Days to the next cold re-test once a topic stands on a rung. Secure repeats every 60. */
  export const NEXT_DAYS: Record<Exclude<Rung, 0>, number> = { 1: 3, 2: 10, 3: 30, 4: 60 };
  export type OnLadder = Exclude<Rung, 0>;
  const PASS: Record<Rung, OnLadder> = { 0: 2, 1: 2, 2: 3, 3: 4, 4: 4 };
  const LESSON: Record<Rung, OnLadder> = { 0: 1, 1: 1, 2: 2, 3: 3, 4: 4 };
  const RED: Record<Rung, Rung> = { 0: 0, 1: 1, 2: 1, 3: 1, 4: 1 };
  /** A finished lesson starts the ladder and never lowers a rung. */
  export function afterLesson(rung: Rung): OnLadder { return LESSON[rung]; }
  /** A passed re-test climbs one rung (a cold pass at rung 0 counts as learning passed); a fail goes back to learning. */
  export function afterRetest(rung: Rung, passed: boolean): OnLadder { return passed ? PASS[rung] : 1; }
  /** Red on a new school sheet sends 1 pass or better back to learning. */
  export function afterRed(rung: Rung): Rung { return RED[rung]; }
  ```
  Tables instead of `Math.min`/`Math.max`: no cast, and `Record<Rung, …>` makes a missing rung a `tsc` error.
  Returning `OnLadder` lets replay index `NEXT_DAYS[r]` with no cast.
- **GOTCHA**: T5's file list names `src/flow/ladder.ts` as its own. T2 creates it because replay needs the
  rung rule; T5 updates it (Q4). Keep it free of any import from `src/events` or `src/mcp`.
- **VALIDATE**: `bun test src/flow` with `ladder.test.ts` as a table: `afterRetest` for every rung × pass/fail
  (10 rows typed `[Rung, boolean, OnLadder]`: 0→2, 1→2, 2→3, 3→4, 4→4 on pass; all → 1 on fail), `afterLesson` 0→1 and 3→3, `afterRed` 1→1,
  2→1, 4→1, 0→0.
- **SATISFIES**: AC 4 (rung and next-due).

### 3. CREATE `src/events/types.ts`

- **IMPLEMENT**:
  ```ts
  export const EVENT_TYPES = ["session", "attempt", "retest", "teachback", "intake", "xp", "squad", "photo", "usage"] as const;
  export type EventType = (typeof EVENT_TYPES)[number];
  type Line<T extends EventType, V extends number> = { v: V; t: string; type: T };
  export type Rag = "R" | "A" | "G";

  export type SessionV1 = Line<"session", 1> & {
    phase: "start" | "end";
    mode: "lesson" | "practice" | "retest" | "boss" | "case" | "coach" | "squad" | "intake";
    topic?: string;
  };
  export type AttemptV1 = Line<"attempt", 1> & {
    item: string; topic: string; correct: boolean; sure: boolean; answer: string; seed?: number;
  };
  export type RetestV1 = Line<"retest", 1> & { topic: string; score: number; of: number; passed: boolean; seed?: number };
  export type TeachbackV1 = Line<"teachback", 1> & { topic: string; item?: string; marks: number; of: number };
  export type IntakeV1 = Line<"intake", 1> & {
    door: "sheet" | "interview" | "diagnostic"; topics: { topic: string; rag: Rag }[];
  };
  export type XpV1 = Line<"xp", 1> & { amount: number; reason: "attempt" | "retest" | "teachback" };
  export type SquadV1 = Line<"squad", 1> & { squad: string; week: string; topic: string; score: number; of: number };
  export type PhotoV1 = Line<"photo", 1> & { item: string; topic: string; file: string };
  export type UsageV1 = Line<"usage", 1> & { job: string; model: string; input: number; output: number };

  export type Event = SessionV1 | AttemptV1 | RetestV1 | TeachbackV1 | IntakeV1 | XpV1 | SquadV1 | PhotoV1 | UsageV1;
  export type EventByKey = { [E in Event as `${E["type"]}@${E["v"]}`]: E };
  export type EventKey = keyof EventByKey;
  /** An event before `append` stamps `t`. */
  export type NewEvent = { [K in EventKey]: Omit<EventByKey[K], "t"> }[EventKey];

  /** One log line → a typed event, or null for anything replay must skip. */
  export function parseEvent(line: string): Event | null
  /** Every (type, v) the parser and replay know, in table order. */
  export const EVENT_KEYS: readonly EventKey[]  // Object.keys(FIELDS) as EventKey[]
  ```
  `parseEvent`: `JSON.parse` in try/catch → must be a non-null, non-array object; `t` matches
  `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/`; `key = `${type}@${v}``; look it up with
  `Object.hasOwn(FIELDS, key)`; run that key's check. `FIELDS` is the compile-pinned table
  `{ [K in EventKey]: (o: Record<string, unknown>) => boolean }`. Small local helpers (`str`, `int`,
  `bool`, `optStr`, `optInt`, `oneOf`) keep each check to one line. Integers: `Number.isInteger`, and
  `score`, `of`, `marks`, `amount`, `input`, `output` must be `>= 0`; `amount` `> 0`; `score <= of`,
  `marks <= of`. `intake.topics` a non-empty array of `{topic: string, rag: Rag}`. Extra keys are allowed
  and ignored (a newer build's optional field must not make an older build drop the line).
- **PATTERN**: compile-pinned `Record` (Patterns to Follow); `observed` TS2741 when a key is missing.
- **GOTCHA**: `usage` is a ninth type the ticket's list of eight does not name. The state shape the AC
  requires has a monthly token count and no listed type carries tokens; `model-jobs.md:24` and T8 both
  call it "the monthly token counter event". Deviation recorded as Q2 and in the PR body.
- **GOTCHA**: the `t` regex rejects `+01:00` offsets on purpose: `t` is UTC from `src/mcp/clock` only.
- **VALIDATE**: `node_modules/.bin/tsc --noEmit` green; then delete the `"usage@1"` row from `FIELDS`,
  `tsc` must fail with TS2741 naming `"usage@1"`; restore.
- **SATISFIES**: AC 1 (string union with `v`), AC 7 (fixture per version, via `EVENT_KEYS`).

### 4. CREATE `src/events/__fixtures__/<type>.v1.jsonl` (nine files)

- **IMPLEMENT**: one file per `EVENT_KEYS` entry, named `${type}.v${v}.jsonl`, each with 1–3 valid lines
  that together exercise every optional field present and absent. Example `attempt.v1.jsonl`:
  ```
  {"v":1,"t":"2026-10-03T17:42:10Z","type":"attempt","item":"maths/U349/g","topic":"1MA1/R9","correct":false,"sure":true,"answer":"4.5","seed":8812}
  {"v":1,"t":"2026-10-03T17:43:00Z","type":"attempt","item":"maths/U349/1","topic":"1MA1/R9","correct":true,"sure":false,"answer":"12"}
  ```
  The first line is the one in `events.md`, verbatim.
- **VALIDATE**: covered by Task 5's tests.
- **SATISFIES**: AC 7.

### 5. CREATE `src/events/types.test.ts`

- **IMPLEMENT**:
  1. For every key in `EVENT_KEYS`: the file `__fixtures__/${type}.v${v}.jsonl` exists
     (`path.join(import.meta.dir, "__fixtures__", ...)`), and every non-empty line parses to non-null with
     `type` and `v` matching the file name.
  2. `parseEvent` returns null for: `not json`; `[]`; `null`; an `attempt` line with `"v":2`; a line with
     `"type":"login"`; `attempt` missing `sure`; `attempt` with `"t":"2026-10-03T18:42:10+01:00"`;
     `retest` with `score` 4 `of` 3; `xp` with `amount` 0; `intake` with `topics: []`.
  3. An `attempt` line with an extra key `"bet":2` parses (extra keys ignored).
- **VALIDATE**: `bun test src/events/types.test.ts`; then rename `usage.v1.jsonl` → test 1 fails naming
  it; restore.
- **SATISFIES**: AC 7, AC 1.

### 6. CREATE `src/events/append.ts`

- **IMPLEMENT**:
  ```ts
  export const EVENTS_FILE = "events.jsonl";
  export const STATE_FILE = "state.json";

  /** Resolves `rel` inside `dataDir`, following symlinks; throws if the result is outside `dataDir`. */
  export function resolveInData(dataDir: string, rel: string): string
  /** Appends one event to data/events.jsonl, fsynced before returning. The only writer of that file. */
  export function appendEvent(dataDir: string, event: NewEvent, now: () => string = utcNow): Event
  /** Non-empty lines of data/events.jsonl in file order; [] if the file does not exist yet. */
  export function readLines(dataDir: string): string[]
  /** Parsed data/state.json, or null if missing or not JSON. Shape is not trusted. */
  export function readStoredState(dataDir: string): unknown
  /** Writes data/state.json atomically: temp file, fsync, rename. */
  export function writeState(dataDir: string, state: State): void
  ```
  `resolveInData`:
  1. `fs.mkdirSync(dataDir, { recursive: true })`; `root = fs.realpathSync.native(dataDir)`. (PR #23 review H1: the `mkdirSync` moved to the writers, so a read never creates `data/`.)
  2. `target = path.resolve(root, rel)`.
  3. `real = fs.realpathSync.native(target)`; on `ENOENT` only: if `fs.lstatSync(target, { throwIfNoEntry: false })`
     returns a value, the target is a dangling symlink → refuse; else
     `real = path.join(fs.realpathSync.native(path.dirname(target)), path.basename(target))` (parent must
     exist; its `ENOENT` propagates as a refusal).
  4. `r = path.relative(root, real)`; refuse when `r === ""`, `r === ".."`, `r.startsWith(`..${path.sep}`)`
     or `path.isAbsolute(r)` (Windows: another drive). Message: `Refused: ${rel} resolves outside the data folder`.

  `appendEvent`:
  1. `file = resolveInData(dataDir, EVENTS_FILE)`.
  2. `const obj: Record<string, unknown> = Object.assign({ v: event.v, t: "" }, event); obj.t = now();` then `line = JSON.stringify(obj)` (key
     order `v, t, type, …` as in `events.md`; assigning `t` last means a caller's `t` can never win; the
     spread literal `{ v: event.v, t: "", ...event }` fails `tsc` with TS2783); `parsed = parseEvent(line)`; if null, throw `Refused: not a valid ${event.type} v${event.v} event`
     and write nothing.
  3. `fd = fs.openSync(file, APPEND, 0o600)` with
     `const APPEND = fs.constants.O_RDWR | fs.constants.O_APPEND | fs.constants.O_CREAT | (fs.constants.O_NOFOLLOW ?? 0)`
     (module constant; read-write because this step reads the last byte, and `readSync` on a write-only
     fd throws `EBADF`). `O_NOFOLLOW` makes the open itself fail with `ELOOP` if `events.jsonl` became a
     symlink after `resolveInData` checked it, which closes the check-then-open race; Windows has no such
     flag, hence `?? 0`. Mode `0o600` is owner-only, as D11 asks of `data/`. If `fs.fstatSync(fd).size > 0`, read the last byte with
     `fs.readSync(fd, buf, 0, 1, size - 1)` and prefix `"\n"` when it is not `\n` (a hand edit or torn write
     left no trailing newline; without this the new line joins the old one and both are skipped).
  4. One `fs.writeSync(fd, prefix + line + "\n")`, then `fs.fsyncSync(fd)`, `fs.closeSync(fd)` in `finally`.
  5. Return `parsed`.

  `readLines`: `resolveInData` then `readFileSync(..., "utf8")` (`ENOENT` → `[]`), split on `"\n"`, strip a
  trailing `"\r"` (a Windows editor), drop lines that are empty after `trim()`.

  `writeState`: `file = resolveInData(dataDir, STATE_FILE)`, `tmp = resolveInData(dataDir, STATE_FILE + ".tmp")`;
  write `JSON.stringify(state, null, 2) + "\n"` to `tmp` via `openSync(tmp, W, 0o600)` (`W` = `O_WRONLY |
  O_CREAT | O_TRUNC | O_NOFOLLOW ?? 0`) + `writeSync` + `fsyncSync` + `closeSync`; then `fs.renameSync(tmp, file)`.
  If `renameSync` throws `EPERM`, `EACCES` or `EEXIST` (Windows refuses to replace a file another process
  has open, e.g. an antivirus scan), fall back to `fs.copyFileSync(tmp, file)` then `fs.rmSync(tmp)`.
  The fallback is not atomic; that is acceptable because `state.json` is derived and the next replay
  rebuilds it. Any other error rethrows.

  Also export `copyState(dataDir, from, to)` for Task 10's backup: both names through `resolveInData`,
  `fs.copyFileSync`, no-op when `from` does not exist.
- **PATTERN**: `import fs from "node:fs"` and call through `fs.` (the fsync test spies on `fs.fsyncSync`,
  which a named import would bypass). Error narrowing as `src/server.ts:38`.
- **IMPORTS**: `import type { State } from "./replay"; import { type Event, type NewEvent, parseEvent } from "./types"; import { utcNow } from "../mcp/clock";`
- **GOTCHA**: `NewEvent` does not stop a caller's `t` at compile time: a non-literal object with extra keys
  is still assignable to `Omit<…, "t">`, and T4 will pass an object parsed from a browser POST. The stamp
  must be assigned after the spread (step 2). Tested in Task 9 test 12.
- **GOTCHA**: `r.startsWith("..")` alone refuses a legitimate file named `..notes`; compare against `".."`
  and `"..${path.sep}"` only.
- **GOTCHA**: `realpathSync` on a dangling symlink throws `ENOENT`, and falling back to parent + basename
  would return the symlink's in-data path; `openSync(..., "a")` then follows it and creates the file
  outside. The `lstat` check in step 3 is what stops that. Tested in Task 9.
- **GOTCHA**: a `data/` that is itself a symlink (a parent pointing it at a synced folder) is allowed:
  the root is realpathed first and confinement is relative to it.
- **GOTCHA**: one `writeSync` per line is what keeps a second writer process (T10's MCP server over stdio)
  from splitting a line: O_APPEND writes are positioned at end-of-file atomically. Two separate writes
  (newline, then line) would not be. `observed` 2026-09-27 (`scratchpad/w2.ts`): two `bun` processes
  appending 500 lines of ~330 bytes each, same open flags, gave 1,000 lines, 0 unparseable. Task 9 test 13
  keeps that as a test.
- **GOTCHA**: `O_NOFOLLOW` in Bun 1.3.4 is `256` and an `openSync` through a symlink with it throws `ELOOP`
  without creating the target (`observed`, 2026-09-27); files created with mode `0o600` read back `600`.
- **VALIDATE**: `node_modules/.bin/tsc --noEmit`.
- **SATISFIES**: AC 2 (only writer, fsync per line, realpath refusal).

### 7. CREATE `src/events/__fixtures__/six-weeks.jsonl`

- **IMPLEMENT**: exactly these 33 lines, in this order (topics `1MA1/R9`, `1MA1/N12`, `1MA1/A5`; comments
  here, not in the file):
  ```
  {"v":1,"t":"2026-10-05T16:00:00Z","type":"session","phase":"start","mode":"lesson","topic":"1MA1/R9"}
  {"v":1,"t":"2026-10-05T16:20:00Z","type":"session","phase":"end","mode":"lesson","topic":"1MA1/R9"}
  {"v":1,"t":"2026-10-05T16:21:00Z","type":"attempt","item":"maths/R9/1","topic":"1MA1/R9","correct":true,"sure":true,"answer":"12","seed":11}
  {"v":1,"t":"2026-10-05T16:21:01Z","type":"xp","amount":10,"reason":"attempt"}
  {"v":1,"t":"2026-10-05T16:22:00Z","type":"attempt","item":"maths/R9/2","topic":"1MA1/R9","correct":false,"sure":true,"answer":"4.5","seed":12}
  {"v":1,"t":"2026-10-05T16:22:01Z","type":"xp","amount":10,"reason":"attempt"}
  {"v":1,"t":"2026-10-06T17:00:00Z","type":"intake","door":"sheet","topics":[{"topic":"1MA1/A5","rag":"R"},{"topic":"1MA1/N12","rag":"A"}]}
  {"v":1,"t":"2026-10-06T17:30:00Z","type":"session","phase":"end","mode":"lesson","topic":"1MA1/N12"}
  {"v":1,"t":"2026-10-08T16:00:00Z","type":"retest","topic":"1MA1/R9","score":3,"of":3,"passed":true}
  {"v":1,"t":"2026-10-08T16:00:01Z","type":"xp","amount":20,"reason":"retest"}
  {"v":1,"t":"2026-10-08T16:05:00Z","type":"attempt","item":"maths/R9/2","topic":"1MA1/R9","correct":true,"sure":false,"answer":"6","seed":13}
  {"v":1,"t":"2026-10-08T16:05:01Z","type":"xp","amount":10,"reason":"attempt"}
  {"v":1,"t":"2026-10-09T16:00:00Z","type":"retest","topic":"1MA1/N12","score":1,"of":3,"passed":false}
  {"v":1,"t":"2026-10-09T16:00:01Z","type":"xp","amount":20,"reason":"retest"}
  {"v":1,"t":"2026-10-11T23:30:00Z","type":"attempt","item":"maths/N12/1","topic":"1MA1/N12","correct":false,"sure":false,"answer":"7"}
  {"v":1,"t":"2026-10-11T23:30:01Z","type":"xp","amount":10,"reason":"attempt"}
  {"v":1,"t":"2026-10-12T16:00:00Z","type":"retest","topic":"1MA1/N12","score":2,"of":3,"passed":true}
  {"v":1,"t":"2026-10-12T16:00:01Z","type":"xp","amount":20,"reason":"retest"}
  {"v":1,"t":"2026-10-18T10:00:00Z","type":"retest","topic":"1MA1/R9","score":3,"of":3,"passed":true}
  {"v":1,"t":"2026-10-18T10:00:01Z","type":"xp","amount":20,"reason":"retest"}
  {"v":1,"t":"2026-10-19T09:00:00Z","type":"usage","job":"hint","model":"gpt-5-mini","input":1200,"output":300}
  {"v":1,"t":"2026-10-20T16:00:00Z","type":"teachback","topic":"1MA1/N12","marks":3,"of":4}
  {"v":1,"t":"2026-10-20T16:00:01Z","type":"xp","amount":15,"reason":"teachback"}
  {"v":1,"t":"2026-10-25T16:00:00Z","type":"retest","topic":"1MA1/N12","score":3,"of":3,"passed":true}
  {"v":1,"t":"2026-10-25T16:00:01Z","type":"xp","amount":20,"reason":"retest"}
  {"v":1,"t":"2026-11-02T17:00:00Z","type":"intake","door":"sheet","topics":[{"topic":"1MA1/R9","rag":"R"}]}
  {"v":1,"t":"2026-11-02T17:05:00Z","type":"usage","job":"intake_read","model":"gpt-5-mini","input":500,"output":100}
  {"v":1,"t":"2026-11-05T16:00:00Z","type":"retest","topic":"1MA1/R9","score":2,"of":3,"passed":true}
  {"v":1,"t":"2026-11-05T16:00:01Z","type":"xp","amount":20,"reason":"retest"}
  {"v":1,"t":"2026-11-15T12:00:00Z","type":"retest","topic":"1MA1/R9","score":3,"of":3,"passed":true}
  {"v":1,"t":"2026-11-15T12:00:01Z","type":"xp","amount":20,"reason":"retest"}
  {"v":1,"t":"2026-11-15T12:10:00Z","type":"attempt","item":"maths/A5/1","topic":"1MA1/A5","correct":false,"sure":true,"answer":"x = 3"}
  {"v":1,"t":"2026-11-15T12:10:01Z","type":"xp","amount":10,"reason":"attempt"}
  ```
  What it covers: lesson start (R9, N12); pass, fail and back to learning (N12 on 10-09); every rung up to
  `2 passes`; the red-sheet flip (R9 at `2 passes` → `learning` on 11-02) and the climb back; XP for a
  failed re-test (effort, not correctness); a confident-wrong item added (R9/2) and removed by a later
  correct attempt, and one left in the pool (A5/1); a Sunday 23:30 UTC attempt that is Monday 00:30 in
  London, so it counts to W42, not W41 (the time zone case);
  a missed week (W44); tokens across two months. Six ISO weeks, W41 to W46 (`derived`: 2026-10-05 +
  41 days = 2026-11-15, `observed` `isoWeek` W41 and W46).
- **SATISFIES**: AC 6.

### 8. CREATE `src/events/replay.ts` and `src/events/replay.test.ts`

- **IMPLEMENT** (`replay.ts`):
  ```ts
  export type TopicState = { rung: Rung; nextDue: string | null; rag: Rag | null };
  export type Calibration = { sureRight: number; sureWrong: number; unsureRight: number; unsureWrong: number };
  export type State = {
    shape: 1;                      // bump when this type changes
    lines: number;                 // log lines this state was built from, skipped lines included
    skipped: number;               // lines replay could not read
    topics: Record<string, TopicState>;
    xp: { total: number; byWeek: Record<string, number> };        // ISO week → XP that week
    flame: Record<string, string[]>;                              // ISO week → distinct London days with real work
    confidentWrong: Record<string, { topic: string; t: string; answer: string; seed?: number }>;  // by item id
    calibration: Record<string, Calibration>;                     // ISO week → Sure/correct pairs (D7)
    tokens: Record<string, number>;                               // YYYY-MM → input + output
  };
  /** Pure: the same lines always give the same state. Reads no clock and no file. */
  export function replay(lines: readonly string[]): State
  ```
  `replay` builds an empty state, then for each line: `parseEvent`; null → `skipped++`; else dispatch
  through `CASES`. `lines = lines.length` at the end. Local helpers: `topic(s, id)` creates
  `{ rung: 0, nextDue: null, rag: null }` on first sight; `work(s, t)` adds `localDay(t)` to
  `flame[isoWeek(day)]` once. Everywhere below, `day = localDay(e.t)`: next-due, flame, XP week, calibration
  week and token month all use the pupil's London day. Cases:

  | key | effect |
  |---|---|
  | `session@1` | `phase === "end" && mode === "lesson" && topic`: `r = afterLesson(rung)`; if `r !== rung` set rung, `nextDue = addDays(day, NEXT_DAYS[r])`. Else, with a topic, just `topic()`. Not flame. |
  | `attempt@1` | `topic()`; `work()`; calibration bucket for the week `+1` in the `sure`/`correct` cell; `sure && !correct` → `confidentWrong[item] = { topic, t, answer, seed? }` (omit `seed` when absent); `correct` → `delete confidentWrong[item]`. |
  | `retest@1` | `topic()`; `r = afterRetest(rung, passed)`; `rung = r`; `nextDue = addDays(day, NEXT_DAYS[r])`; `work()`. |
  | `teachback@1` | `topic()`; `work()`. |
  | `intake@1` | for each row: `topic()`; `rag = row.rag`; if `rag === "R"` and `afterRed(rung) !== rung`: rung → 1, `nextDue = addDays(day, 3)`. Not flame. |
  | `xp@1` | `total += amount`; `byWeek[isoWeek(day)] += amount`. |
  | `squad@1` | `topic()`; `work()`. (Totals are T14.) |
  | `photo@1` | `topic()`. (Marks are T13.) |
  | `usage@1` | `tokens[day.slice(0, 7)] += input + output`. |

  `afterLesson` and `afterRetest` return `OnLadder`, so `NEXT_DAYS[r]` type-checks with no cast (Task 2).
- **GOTCHA**: walk lines in file order, never sort by `t`. A PC clock change can write a `t` earlier than
  the line before it; the file order is the order things happened.
- **GOTCHA**: `noUncheckedIndexedAccess`: `s.xp.byWeek[w] = (s.xp.byWeek[w] ?? 0) + amount`.
- **GOTCHA**: `flame` days are pushed only if absent, so the array is in first-seen order; the test compares
  sorted arrays or exact order from the fixture (file order is chronological there).
- **IMPLEMENT** (`replay.test.ts`), reading the fixture with `fs.readFileSync(path.join(import.meta.dir,
  "__fixtures__/six-weeks.jsonl"), "utf8").split("\n").filter(Boolean)`:
  1. **Six-week history.** `toEqual` on these values (`derived` by hand from the ladder rule and the
     fixture, then `observed`: a throwaway reducer implementing this task's table, run over the 33 lines
     extracted from Task 7, printed every value below and the Task 10 test 5 prefix result,
     `scratchpad/rp.ts`, 2026-09-27):
     - `topics["1MA1/R9"]` = `{ rung: 3, nextDue: "2026-12-15", rag: "R" }` (lesson 10-05 → 1 due 10-08;
       pass 10-08 → 2 due 10-18; pass 10-18 → 3 due 11-17; red 11-02 → 1 due 11-05; pass 11-05 → 2 due
       11-15; pass 11-15 → 3 due 11-15 + 30 = 12-15)
     - `topics["1MA1/N12"]` = `{ rung: 3, nextDue: "2026-11-24", rag: "A" }` (lesson 10-06 → 1 due 10-09;
       fail 10-09 → 1 due 10-12; pass 10-12 → 2 due 10-22; pass 10-25 → 3 due 10-25 + 30 = 11-24)
     - `topics["1MA1/A5"]` = `{ rung: 0, nextDue: null, rag: "R" }` (red at rung 0 stays 0)
     - `xp.total` = 205 (`derived`: 10+10+20+10+20+10+20+20+15+20+20+20+10)
     - `xp.byWeek` = `{ "2026-W41": 70, "2026-W42": 50, "2026-W43": 35, "2026-W45": 20, "2026-W46": 30 }`
       (`derived`: W41 = 10+10+20+10+20 (lines 4, 6, 10, 12, 14); W42 = 10+20+20 (line 16 is
       2026-10-11T23:30:01Z = Monday 10-12 00:30 BST, then 18, 20); W43 = 15+20; W45 = 20; W46 = 20+10;
       sum 70+50+35+20+30 = 205)
     - `flame` = `{ "2026-W41": ["2026-10-05","2026-10-08","2026-10-09"], "2026-W42":
       ["2026-10-12","2026-10-18"], "2026-W43": ["2026-10-20","2026-10-25"], "2026-W45": ["2026-11-05"],
       "2026-W46": ["2026-11-15"] }` (no `W44`: the missed week; 10-12 first seen from line 15)
     - `confidentWrong` = `{ "maths/A5/1": { topic: "1MA1/A5", t: "2026-11-15T12:10:00Z", answer: "x = 3" } }`
     - `calibration` = `{ "2026-W41": { sureRight: 1, sureWrong: 1, unsureRight: 1, unsureWrong: 0 },
       "2026-W42": { sureRight: 0, sureWrong: 0, unsureRight: 0, unsureWrong: 1 },
       "2026-W46": { sureRight: 0, sureWrong: 1, unsureRight: 0, unsureWrong: 0 } }` (line 15 in W42)
     - `tokens` = `{ "2026-10": 1500, "2026-11": 600 }`; `lines` 33; `skipped` 0; `shape` 1.
  2. **Guard.** `JSON.stringify(state)` contains none of `"answers"`, `"markScheme"`, `"mark_scheme"`.
  3. **Pure.** `setSystemTime(new Date("2031-01-01T00:00:00Z"))`, replay the fixture, `toEqual` the result
     of a replay under the real clock; `setSystemTime()` to reset in `finally`.
  4. **File order.** Two retest lines for one topic after a lesson, the second with an earlier `t`
     (`pass` at 10-08T16:00, then `fail` at 10-08T15:00): final rung 1. Sorted by `t` it would be 2.
  5. **Skipped lines.** The fixture with four bad lines spliced in (`not json`, an `attempt` with `"v":2`,
     a `"type":"login"` line, an `attempt` without `topic`): same topics and XP as test 1, `skipped` 4,
     `lines` 37.
  6. **Every fixture replays.** For each `EVENT_KEYS` fixture file, `replay(lines).skipped === 0`.
- **VALIDATE**: `bun test src/events/replay.test.ts`. Time zone mutation, both halves: replace
  `localDay(e.t)` with `e.t.slice(0, 10)` → test 1 red on `xp.byWeek`, `flame` and `calibration`, green on
  every `topics` value (no rung-moving line in the fixture sits near midnight); record both; restore.
  Then run both halves of the ladder mutation: change
  `NEXT_DAYS[3]` from 30 to 31 → test 1 and test 5 red on both `nextDue` values that end on rung 3 (R9, N12)
  and test 4 (rung only) green; record both results; restore.
- **SATISFIES**: AC 4 (pure reducer, one case per `(type, v)`), AC 6 (six-week rung, XP, next-due), guard.

### 9. CREATE `src/events/append.test.ts`

- **IMPLEMENT**: each test makes `dir = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "st-events-")))`,
  `data = path.join(dir, "data")`, and removes `dir` in `finally` with `fs.rmSync(dir, { recursive: true, force: true })`.
  1. **Append.** Two `appendEvent` calls with a fixed clock (`() => "2026-10-05T16:00:00Z"`): the file has
     two lines, each starts `{"v":1,"t":"2026-10-05T16:00:00Z","type":`, `readLines` returns 2, the
     returned event `toEqual` `parseEvent` of the line.
  2. **fsync per line.** `const spy = spyOn(fs, "fsyncSync")`; three appends; `spy` called 3 times;
     `spy.mockRestore()` in `finally`.
  3. **Missing trailing newline.** Write `{"v":1,…valid line…}` with no `\n` straight to `data/events.jsonl`,
     append one event: `readLines` returns 2 and `replay(readLines(data)).skipped === 0`.
  4. **Invalid event refused.** `appendEvent(data, { v: 1, type: "retest", topic: "x", score: 5, of: 3, passed: true })`
     throws `/Refused/` and the file does not exist afterwards.
  5. **Confinement, `../`.** `resolveInData(data, "../outside.jsonl")` throws `/outside the data folder/`;
     `resolveInData(data, path.join(dir, "outside.jsonl"))` (absolute) throws.
  6. **Confinement, symlinked directory.** `fs.symlinkSync(outsideDir, path.join(data, "link"))`;
     `resolveInData(data, "link/events.jsonl")` throws.
  7. **Confinement, symlinked log.** `events.jsonl` in `data` is a symlink to `outside.jsonl` (existing,
     content `"keep\n"`): `appendEvent` throws; `outside.jsonl` still reads `"keep\n"`.
  8. **Confinement, dangling symlink.** `events.jsonl` is a symlink to `path.join(dir, "made.jsonl")`,
     which does not exist: `appendEvent` throws and `made.jsonl` does not exist afterwards.
  9. **Names that start with dots stay inside.** `resolveInData(data, "..notes")` returns
     `path.join(data, "..notes")`.
  10. **`data/` itself a symlink** to `realData`: `appendEvent` succeeds and the line lands in
      `realData/events.jsonl`.
  11. **State write.** `writeState(data, replay([]))`; `readStoredState(data)` deep-equals it; no
      `state.json.tmp` left; `readStoredState` on `"{broken"` returns null.
  12. **The clock wins.** `appendEvent(data, { ...validAttempt, t: "1999-01-01T00:00:00Z" } as NewEvent, () => "2026-10-05T16:00:00Z")`:
      the written line and the returned event carry `2026-10-05T16:00:00Z`.
  13. **Two writers.** Write a helper `src/events/__fixtures__/append-many.ts` (a `.ts` file under
      `__fixtures__`, imported by nothing) that calls `appendEvent(argv[2], validAttempt)` 200 times. The
      test runs it twice at once: `const a = Bun.spawn(["bun", helper, data]); const b = Bun.spawn([...]);
      await Promise.all([a.exited, b.exited])`, both exit 0; `readLines(data).length === 400` and
      `replay(readLines(data)).skipped === 0`. Timeout 20 s (`test(name, fn, 20_000)`).
  14. **Owner-only files** (`test.skipIf(process.platform === "win32")`): after an append and a
      `writeState`, `fs.statSync(file).mode & 0o777` is `0o600` for both `events.jsonl` and `state.json`.
- **GOTCHA**: `spyOn(fs, "fsyncSync")` on the default `node:fs` import intercepts the call inside another
  module that also calls `fs.fsyncSync` (`observed`, Bun 1.3.4, probe `scratchpad/sp/`, 2026-09-27);
  `fs.lstatSync(p, { throwIfNoEntry: false })` returns `undefined` for a missing path (same probe).
- **GOTCHA**: symlink creation needs privileges on Windows; there is no CI and no Windows runner
  (`observed`: no `.github/workflows`, 2026-09-27), so these run on the Mac only. If a Windows run is ever
  added, skip 6–8 and 10 with `test.skipIf(process.platform === "win32")`.
- **VALIDATE**: `bun test src/events/append.test.ts`. Mutations, both halves each, recorded:
  (a) remove the `lstat` dangling check → test 8 red, tests 5–7 green;
  (b) replace the `".."` / `"..${sep}"` comparison with `r.startsWith("..")` → test 9 red, 5–8 green;
  (c) remove `fs.fsyncSync(fd)` → test 2 red, test 1 green;
  (d) remove the trailing-newline prefix → test 3 red, test 1 green;
  (e) move `t: now()` back into the literal before `...event` → test 12 red, test 1 green;
  (f) remove `O_NOFOLLOW` from `APPEND` → every test stays green (the realpath check already refuses a
  symlink present at check time; the flag only closes the race window, which no deterministic test can
  open). Record that result as expected-green: it states the flag's scope, not a gap.
- **SATISFIES**: AC 2, AC 8 (confinement test proves `../` and symlinks are refused).

### 10. CREATE `src/events/check.ts`, `src/events/check.test.ts`, `scripts/replay-check.ts`

- **IMPLEMENT** (`check.ts`):
  ```ts
  export type Fall = { topic: string; stored: number; replayed: number };
  export type CheckResult =
    | { ok: true; wrote: State; truncated: boolean; changes: string[] }
    | { ok: false; fallen: Fall[] };
  /** Replays the log with this build and refuses if any rung in the stored state.json would fall. */
  export function replayCheck(dataDir: string): CheckResult
  ```
  1. `lines = readLines(dataDir)`; `stored = readStoredState(dataDir)`.
  2. `project(stored)` reads only the compatibility contract: `lines` (number), `topics[id].rung`
     (number) and `xp.total` (number), each defensively; anything missing → `null` projection. This is what
     lets a new build read an old state shape.
  3. If the projection is null (no file, not JSON, or unrecognisable): write `replay(lines)`, return ok with
     `changes: ["No saved progress to compare; rebuilt from the log."]`.
  4. If `stored.lines > lines.length`: the log is shorter than the state (hand edit). Refusing would lock
     the family out after any hand edit, which the design accepts as normal, so this does not refuse. It
     still compares: every topic whose rung in `replay(lines)` is below the stored rung gets a change line
     (`1MA1/R9: saved 3, now 1 (the log is shorter than the saved progress)`), then backs up and writes as
     in step 6. `truncated: true`.
  5. Else `before = replay(lines.slice(0, stored.lines))`. For every topic in the stored projection, if
     `(before.topics[id]?.rung ?? 0) < stored rung` → a `Fall`. Any fall → return `{ ok: false, fallen }`
     and write nothing.
  6. Before every write in steps 3, 4 and 6: `copyState(dataDir, "state.json", "state.prev.json")`, so
     the state this build replaced is always one file away (recovery for any case the check lets through).
     Then write `replay(lines)`; `changes` lists each topic whose rung differs between `stored` and
     `before` (can only be a rise here) and an XP line when `before.xp.total !== stored xp.total`.
- **IMPLEMENT** (`scripts/replay-check.ts`): `--data <dir>` argument (default `"data"`), calls
  `replayCheck`, prints `changes` or the falls, exits 0 or 1. Refusal text, plain English, for a parent:
  ```
  Stopped: this version of the tutor would lower progress on 2 topics.
    1MA1/R9: saved 3, now 1
  Nothing was changed. Put the previous version back, or delete data/state.json to accept the new version.
  ```
- **GOTCHA**: `replayCheck` lives in `src/events/check.ts`, not in the script, because T11 calls it from
  server start and `src/` should not import from `scripts/`. The script is a thin CLI (deviation from the
  ticket's file list; recorded).
- **IMPLEMENT** (`check.test.ts`), temp `data/` as in Task 9, six-week fixture copied into `events.jsonl`:
  1. No `state.json` → ok; `state.json` now has `lines: 33`.
  2. Run twice → second ok, `changes` has no rung lines.
  3. **Code change lowers a rung (simulated).** Write a `state.json` equal to the six-week state but with
     `topics["1MA1/N12"].rung = 4`: result `ok: false`, `fallen` = `[{ topic: "1MA1/N12", stored: 4, replayed: 3 }]`,
     `state.json` bytes identical before and after.
  4. **Genuine fall after the last write.** Run once (writes state), then `appendEvent` a failed
     `retest` for `1MA1/N12`: ok, written rung for N12 is 1.
  5. **Truncated log.** Run once, then rewrite `events.jsonl` with its first 20 lines: ok, `truncated: true`,
     `changes` has exactly one fall line, `1MA1/N12: saved 3, now 2 …` (`derived` from the fixture: after
     line 20, N12 stands at rung 2 from its 10-12 pass, its 10-25 pass is line 24; R9 is already at 3 from
     line 19, so no line for R9; A5 is 0 both ways), and `state.prev.json` equals the state from the first run.
  6. **Old state shape.** A stored state with only `{ lines: 33, topics: { "1MA1/R9": { rung: 3 } }, xp: { total: 205 }, weeks: {} }`
     (renamed and missing fields): ok.
  7. **Broken state.json** (`"{"`) → ok, rebuilt.
- **VALIDATE**: `bun test src/events/check.test.ts`; `bun scripts/replay-check.ts --data <tmp with fixture>`
  prints the rebuild line and exits 0 (`echo $?`).
- **SATISFIES**: AC 5 (replay-check refuses a falling rung).

### 11. CREATE `scripts/synth-events.ts`

- **IMPLEMENT**: `bun scripts/synth-events.ts --data <dir> --n 200 --seed 1`. A seeded PRNG
  (mulberry32, inline, ten lines), a clock that starts at `2026-10-05T16:00:00Z` and steps 2–30 hours per
  event, five topic ids, and `n` events drawn from: lesson `session` end, `attempt` (+ an `xp` 10),
  `retest` (pass with probability 0.7, + `xp` 20), `teachback`, `usage`. Each through `appendEvent(dir,
  event, clock)`, so the log is produced by the real writer. Prints the line count.
- **VALIDATE**: `R=$PWD; cd "$T" && bun "$R/scripts/synth-events.ts" --data data --n 200 --seed 1 && wc -l data/events.jsonl` (PR #23 review H1: `--data` must resolve inside the current folder, so every script step below runs from inside `$T`)
  → `200` (an `xp` counts toward `n`); running it twice with the same seed into two fresh dirs gives
  byte-identical files (`cmp`).
- **SATISFIES**: AC 9 (S5 needs 200 synthetic events).

### 12. S5 spike: run, record

- **IMPLEMENT**, in a scratch dir `T=$(mktemp -d)`, every step `observed` and recorded. Tasks 1–11 are not
  committed yet, so `git checkout -- <file>` cannot revert an untracked file: before each code edit below,
  `cp <file> "$T/<name>.bak"`, and after the step `cp` it back; `git diff --stat` and `bun run check` green
  after step 3 prove the tree is restored.
  1. From inside `$T`: `bun "$R/scripts/synth-events.ts" --data data --n 200 --seed 1`; `bun "$R/scripts/replay-check.ts" --data data`
     → exit 0, rebuilt. `cp "$T/data/state.json" "$T/state.v1.json"`.
  2. **Shape change, rungs and XP kept.** In the working tree, change the state shape: rename `flame` to
     `weeks`, add `retests: number` to `TopicState` (incremented in `retest@1`), `shape: 2`. Run
     replay-check → expected exit 0; `jq` the rungs and `xp.total` of `state.json` vs `state.v1.json` →
     expected identical. Record the diff line count. Restore `replay.ts` from its `.bak`.
  3. **Code change that lowers a rung.** Restore `state.v1.json` to `state.json`. Change `afterRetest` so
     a pass does not climb (`return passed ? (rung === 0 ? 1 : rung) : 1`; `passed ? rung : 1` does not type-check). Run replay-check → expected exit 1, the falls
     printed, `shasum state.json` unchanged. Restore `ladder.ts` from its `.bak`.
  4. **Genuine fall.** With the real code, append one failed `retest` for a topic at rung ≥ 2
     (`bun -e '…' "$T/data"`, path read from `process.argv[1]`: `observed` that `bun -e '…' arg1` puts
     `arg1` at `argv[1]`), run replay-check → expected exit 0, that topic now rung 1.
  5. Write **S5 result (date)** into `docs/prd/study-tutor-v2.architecture.md` directly after the S1 result
     block (line 224), in the S1 format: what ran, each step's observed outcome, and the decision by the
     rule ("identical rungs and XP → ship / drift → add the startup `replay --check` first"). The check
     ships in this ticket either way; say so.
- **SATISFIES**: AC 9 (S5 result recorded).

### 13. UPDATE `.claude/references/events.md`

- **IMPLEMENT**: add `usage` to the type list with one clause on why (Q2); a "State" paragraph listing the
  `State` keys from Task 8 and the compatibility contract (`lines`, `topics[id].rung`, `xp.total` must keep
  their paths across shape versions, or `check.ts`'s `project` changes in the same PR); the replay-check
  rule as built (replays the stored `lines` prefix; a shorter log rebuilds without refusing); `t` walked in
  file order, not sorted. Keep it under 45 lines.
- **GOTCHA**: this is agent-facing reference prose, not pupil-facing; `no-ai-slop` pass still applies (CLAUDE.md
  "Prose is a gate").
- **VALIDATE**: `wc -l .claude/references/events.md` ≤ 45.
- **SATISFIES**: documentation.

### 13b. UPDATE `docs/tickets/study-tutor-v2.md`

- **IMPLEMENT**, one line each, no other edits:
  - T5 **Files**: `src/flow/{ladder,xp,boss,session,next}.ts` → add "(`ladder.ts` created by T2; T5 updates it)".
  - T8 **Scope**: after "usage from each response becomes a token-count event" add "(`usage` v1, defined in T2)".
  - T11 **Scope**, in the manual update test: add "on the Windows PC also: `state.json` replaced while
    open in Notepad, and two appends at once (the T2 `append-many.ts` helper twice) give whole lines".
  - Add to `.claude/references/events.md` (Task 13) the Q5 rule, verbatim from Open Questions.
- **VALIDATE**: `git diff --stat docs/tickets/study-tutor-v2.md` shows 3 lines changed.
- **SATISFIES**: Q4, Q5, Q8 decisions recorded where the owning tickets read them.

### 14. Gate

- **VALIDATE**: `node_modules/.bin/biome check --write . && bun run check` green. Record test count.

---

## TESTING STRATEGY

### Unit Tests

`bun:test`, colocated `*.test.ts`, as `src/server.test.ts`. Pure modules (`clock`, `ladder`, `types`,
`replay`) take literal inputs. Fixtures under `src/events/__fixtures__/` read via `import.meta.dir`.

### Integration Tests

`append.test.ts` and `check.test.ts` run against a real temp `data/` on disk: real symlinks, real
`realpath`, real fsync (spied, not replaced). No socket or realtime path is touched.

### Edge Cases

| Edge case | Where verified |
|---|---|
| `../` and absolute paths out of `data/` | `append.test.ts` 5 |
| Symlinked directory, symlinked log, dangling symlink | `append.test.ts` 6, 7, 8 |
| File named `..notes` | `append.test.ts` 9 |
| `data/` itself a symlink; macOS `/var` → `/private/var` | `append.test.ts` 10; every test realpaths its temp dir |
| Log with no trailing newline | `append.test.ts` 3 |
| Invalid event never written | `append.test.ts` 4 |
| Malformed, unknown-type, unknown-version lines | `types.test.ts` 2; `replay.test.ts` 5 |
| `t` earlier than the line before (clock change) | `replay.test.ts` 4 |
| Sunday 23:30 UTC in summer is Monday in London: counts to the next week | `replay.test.ts` 1 (W42 has 10-12 from line 15); `clock.test.ts` |
| Both clock-change nights | `clock.test.ts` (`localDay` on 2026-03-29/30 and 2026-10-25) |
| Two processes appending at once | `append.test.ts` 13 |
| Files owner-only | `append.test.ts` 14 |
| Caller-supplied `t` ignored | `append.test.ts` 12 |
| Old state kept before any rewrite | `check.test.ts` 5 (`state.prev.json`) |
| ISO week 53 and year boundary | `clock.test.ts` |
| Failed re-test still earns XP; missed week absent from flame | `replay.test.ts` 1 |
| Red sheet at rung 0 does not move the rung | `replay.test.ts` 1 (A5) |
| Replay reads no clock | `replay.test.ts` 3 |
| Failed re-test after the last state write is not a false refusal | `check.test.ts` 4; S5 step 4 |
| Truncated log, broken or old-shape `state.json` | `check.test.ts` 5, 6, 7 |
| Windows rename-over, two writers, symlink privileges | no Windows PC or runner here; code fallback in Task 6; manual leg added to T11 by Task 13b (Q8) |

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
node_modules/.bin/tsc --noEmit
node_modules/.bin/biome check .
```

### Level 2: Unit Tests

```bash
bun test src/mcp src/flow src/events/types.test.ts src/events/replay.test.ts
```

### Level 3: Integration Tests

```bash
bun test src/events/append.test.ts src/events/check.test.ts
bun run check
```

### Level 4: Manual Validation

All steps use only what this ticket ships (`synth-events.ts`, `replay-check.ts`, `appendEvent`).

1. `R=$PWD; T=$(mktemp -d); cd "$T"; bun "$R/scripts/synth-events.ts" --data data --n 200 --seed 1; bun "$R/scripts/replay-check.ts" --data data; echo $?`
   → a rebuild line, `0`. `head -3 "$T/data/events.jsonl"` shows `{"v":1,"t":"…Z","type":…`.
2. S5 steps 2–4 (Task 12), each with its exit code and `shasum` recorded.
3. `ln -s /etc "$T/data/link"; bun -e 'import {resolveInData} from "./src/events/append"; resolveInData(process.argv[1], "link/passwd")' "$T/data"`
   → throws `Refused: … outside the data folder`.
4. `grep -rn "events.jsonl" src --include=*.ts | grep -v test | grep -v "src/events/"` → no writer outside
   `src/events` (only the constant is defined in `append.ts`).
5. `ls -l "$T/data"` → `events.jsonl` and `state.json` are `-rw-------`; `state.prev.json` exists after a
   second `replay-check` run.

### Level 5: Additional Validation (Optional)

`rules-check-drift` after merge: `events.md` changed and CLAUDE.md's architecture map names
`src/events` files (append, replay); `check.ts` is new and may warrant one word in the map.

---

## ACCEPTANCE CRITERIA

- [ ] AC 1: `src/events/types.ts` has the string union `session · attempt · retest · teachback · intake · xp · squad · photo`,
      plus `usage` (Q2), each with `v`; a missing reducer or parser case fails `tsc`.
- [ ] AC 2: `src/events/append.ts` is the only writer of `data/events.jsonl`, fsyncs per line, refuses any
      path whose realpath is outside `data/` (Level 4 step 4 for "only").
- [ ] AC 3: `src/mcp/clock.ts` supplies UTC `t`; `appendEvent` stamps every event with it.
- [ ] AC 4: `src/events/replay.ts` is a pure reducer with one case per `(type, v)` deriving topic map (rung,
      next-due), XP, weekly flame, confident-wrong pool, calibration pairs, monthly token count.
- [ ] AC 5: `scripts/replay-check.ts` replays with new code, diffs the stored `state.json`, refuses (exit 1,
      nothing written) if any rung would fall.
- [ ] AC 6: a replay test asserts rung, XP and next-due for the scripted six-week history.
- [ ] AC 7: one fixture per event version under `src/events/__fixtures__/`, enforced by a test over `EVENT_KEYS`.
- [ ] AC 8: a confinement test proves `../` and symlinks out of `data/` are refused.
- [ ] AC 9: S5 run (200 synthetic events, shape change, replay, diff) recorded in the architecture doc.
- [ ] `bun run check` green; mutation runs in Tasks 3, 5, 8, 9 recorded with both halves.
- [ ] PR body restates the answer guard (section above) and lists the two deviations (Q2 `usage`,
      `check.ts` location) and Q4 (ladder ownership).

Every AC is performable on this Mac. Windows-specific behaviour has a code fallback here and a manual leg
in T11, which already needs a Windows PC (Task 13b, Q8).

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full test suite passes
- [ ] No linting or type checking errors
- [ ] S5 run and Level 4 steps performed, results recorded as `observed`
- [ ] Acceptance criteria all met
- [ ] `events.md` and the architecture doc updated

---

## OPEN QUESTIONS / ASSUMPTIONS

One question is open, and it is not the plan's to answer:

- **Q1. E1 gate.** CLAUDE.md and epic A1 put E1's two-week read before any engine work. T0 merged
  2026-09-27; the read lands about 2026-10-11 (`derived`: +14 days). Implementation waits for the read
  or an explicit override from Linards. Worst case if overridden and E1 fires WRONG: this ticket's
  ~700 lines (`expected`, NOTES "Size") are sunk.

Every other earlier question is now a decision, with where it is enforced:

- **Q2 → decided: `usage` is a ninth event type.** The AC's state needs a monthly token count, no listed
  type carries tokens, and `model-jobs.md:24` and T8 name a token-count event. Enforced: `types.ts`
  union, fixture, `replay.test.ts` 1 (`tokens`). Recorded in `events.md` (Task 13) and the ticket file
  under T8 (Task 13b). If T8 needs another shape it adds `usage` v2; no `usage` line exists before T8 ships.
- **Q3 → decided: days are London days.** `t` stays UTC (the rule); every day, week and month replay
  derives goes through `localDay` with `TIME_ZONE = "Europe/London"` (Task 1). This matches v1, whose
  flame used the PC's local date (`e1/assets/case.js:156`), and removes the Monday 00:00–01:00 BST gap.
  Enforced: `clock.test.ts` (six `localDay` cases across both clock changes), `replay.test.ts` 1 (fixture
  line 15 lands in W42), the time zone mutation in Task 8. Runtime without zone data: falls back to the
  UTC day instead of crashing; `observed` that both the mac compile and the Windows compile carry the data.
- **Q4 → decided: this ticket creates `src/flow/ladder.ts`; T5 updates it.** Replay needs the rung rule
  and CLAUDE.md puts the ladder in `src/flow`. Enforced: Task 13b edits T5's file list in
  `docs/tickets/study-tutor-v2.md` to "updates `src/flow/ladder.ts` (created by T2)"; the PR body says so.
  `ladder.ts` imports nothing, so no cycle.
- **Q5 → decided: a v1 shape may change in place only until a release can write it.** Rule written into
  `events.md` (Task 13): "a `(type, v)` shape may be edited in place until the first GitHub release whose
  build can append it; after that, a change is a new `v`." No release exists yet (T11 makes the first),
  and nothing before T9/T13/T14/T17 writes `teachback`, `photo`, `squad` or `intake` lines. If the rule is
  ever broken, those lines are skipped, and `state.skipped` shows the count instead of losing it silently.
- **Q6 → decided: a cold pass at rung 0 climbs to `1 pass`.** A cold, unlabelled re-test is the
  evidence the ladder measures (PRD R2), whether or not a lesson came first. Enforced: `ladder.test.ts`
  row `afterRetest(0, true) === 2`. T17 decides whether its diagnostic writes `retest` events at all.
- **Q7 → decided: a log shorter than the state rebuilds, reports, and keeps a backup.** Refusing would lock
  a family out after any hand edit, which the design accepts. The check still lists every rung that fell
  (Task 10 step 4) and always copies the old state to `state.prev.json` first (step 6), so the case the
  check lets through is visible and recoverable. Enforced: `check.test.ts` 5.
- **Q8 → decided and mitigated: two writers and Windows.**
  - Two writers: one `writeSync` per line on an `O_APPEND` descriptor. `observed` on macOS: 2 processes ×
    500 lines, 0 corrupt; kept as `append.test.ts` 13.
  - Windows rename-over: `writeState` falls back to copy then remove on `EPERM`/`EACCES`/`EEXIST`, so an
    open or locked `state.json` cannot stop a write; `state.json` is derived either way.
  - The Windows legs cannot run on this Mac (no Windows PC or CI runner, `observed`). Task 13b adds them to
    T11's manual update test in the ticket file, which already needs a Windows PC for D10.
- **Q9 → mitigated: symlink swap between check and open.** `appendEvent` and `writeState` open with
  `O_NOFOLLOW` (`observed` `ELOOP`, target not created), which closes the race on the final path part on
  macOS and Linux. Windows has no such flag; there the realpath check stands alone, which is acceptable on
  a single-user PC where the pupil can already edit `data/` by hand.

## NOTES (open canvas)

**Why XP is summed, not computed.** The ticket's state shape has XP and there is an `xp` event type. If
replay computed XP from attempts, the amount rule would live in two places (replay and T5's `xp.ts`) and
changing it would silently rewrite past XP on replay. Summing `xp` events records the amount decided at the
time, so a rule change applies forward only. The six-week test still derives something: the per-week
buckets across a Sunday-night boundary.

**Why `retest.passed` is stored, not computed from `score`/`of`.** Same reason: a new pass threshold in an
update would otherwise change past rungs on replay, which is exactly what replay-check refuses. Recording
the verdict makes the threshold a forward-only decision in `src/flow`.

**Why replay takes raw lines.** `replay(lines: string[])` keeps it pure and lets `check.ts` replay an exact
prefix (`lines.slice(0, stored.lines)`) with skipped lines counted in the same numbering as the file. A
`replay(events: Event[])` would lose the count of skipped lines and misalign the prefix.

**Why the check compares a prefix.** Without `lines`, stored state and a fresh replay differ whenever an
event was appended after the last state write (a crash, or T4 not writing state on every event). A failed
re-test in that window lowers a rung legitimately, and a naive compare would refuse to start: a false
refusal that locks the family out. The prefix compare isolates the one thing the check exists for: the
same events, different code.

**Rejected:** a `switch` over `type` with nested `v` checks (no compile-time completeness for new
versions); zod or any schema library (a dependency for nine small shapes; the project has none);
per-topic calibration lists (unbounded growth; per-week counts are what the calibration gap metric reads);
sorting by `t` (breaks under a clock change).

**Size.** Roughly 280 lines of source and 480 of tests and fixtures (`expected`), inside the ticket's
700–1,000.

**Confidence: 10/10 that one pass reaches green**, on these grounds: every mechanism the plan relies on was
run on this machine before it was written (compile-pinned table, `realpath` on macOS temp dirs, rename-over,
`O_NOFOLLOW`, `spyOn` across modules, `lstat` without throw, two-process append, London days in `bun` and a
compiled binary, `bun -e` argv, Biome skipping `.jsonl`); every expected value in the six-week test is
derived line by line from the fixture; every function with a non-obvious body is given verbatim. What 10/10
does not cover: the E1 gate (Q1, a decision, not a defect) and the Windows legs, which have code fallbacks
here and are observed in T11.

## AMENDMENTS

- 2026-09-27 — Review pass before implementation. Days and weeks moved from UTC to London (`localDay`),
  six-week expected values recomputed (W41/W42 XP 70/50, flame, calibration); ladder as tables; `append`
  opens with `O_NOFOLLOW` and mode `0o600`; caller `t` can no longer win; `writeState` copy fallback on
  Windows; `state.prev.json` backup and fall report in the truncated-log case; tests 12–14 in
  `append.test.ts`; Task 13b records decisions in the ticket file. Q2–Q9 closed as decisions; Q1 stays.
- 2026-09-27 — Implementation (report `.claude/reports/t2-events-append-replay-report.md`). Q1 overridden
  in writing by Linards ("i dont have 14 days now"). Superseded in the tasks above: Task 6 `Object.assign`
  instead of the spread literal (TS2783) and `O_RDWR` instead of `O_WRONLY` (`EBADF` on the last-byte
  read); Task 2 test tuple `[Rung, boolean, OnLadder]` (TS2769); Task 12 step 3 mutation made type-correct.
  Task 8: tests 1 and 5 share the expected `TOPICS`/`XP` constants, so the `NEXT_DAYS[3]` mutation turns
  both red as predicted; the time zone mutation is observed red at `xp.byWeek` only, because `bun:test`
  stops at the first failing `expect`; a `CASES` mutation (drop `usage@1` → TS2741) was added. Task 10: a
  topic present in the new replay but absent from the stored state gets no change line.
