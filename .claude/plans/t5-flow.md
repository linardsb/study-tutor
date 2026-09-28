# Feature: T5 — Flow: session machine, 3/10/30/60 ladder, XP, weekly flame, boss pick, next

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

T5 puts O1's rules in code, in `src/flow`, where no model is involved. After it lands, the server can
answer the question "what should the pupil do next?" deterministically from the event log, the content
pack and the day. The pages that render that answer (level map, boss battle, cold re-test) are T6.

Parts:

1. **Ladder** (`src/flow/ladder.ts`, created by T2, extended here). Rungs 0–4 and the 3/10/30/60 schedule
   already exist. T5 adds the pass rule for a cold re-test: 2 of 3 or better, as in v1. `postEvent` then
   refuses a `retest` whose `passed` flag disagrees with its `score`/`of`, so a page cannot claim a pass
   the score does not support.
2. **XP and flame** (`src/flow/xp.ts`). XP stays an `xp@1` event, as D3 decides. The server writes it,
   never a page: `postEvent` appends one `xp` line right after each `attempt`, `retest` or `teachback`
   line, and refuses an `xp` body posted from outside. Amounts are effort-based (a wrong answer earns
   the same as a right one): attempt 10, retest 20, teach-back 15. XP is counted by week, not by day.
   The flame is "n of target this week", using `profile.json`'s `weeklyTarget`. The guardrail pair (the
   week's re-test score against that week's XP) is read from state.
3. **Session machine** (`src/flow/session.ts`). Idle → a `session` start event (it carries mode and
   topic, so "open" and "pick topic" are the same event) → open → a `session` end event → idle.
   State records the open session. Every transition is one event, and `/api/next` hands the page the
   exact event body to post.
4. **Boss** (`src/flow/boss.ts`). The mixed cold re-test for the topics that are due. Three slots per
   topic. The pupil's own confident-wrong items come first, and the rest are fresh generator rolls.
   The slots are shuffled by a seed derived from the day. The output has no titles, answers or working.
5. **Next** (`src/flow/next.ts` + `GET /api/next`). One deterministic step, checked in this order:
   continue the session opened today → boss if anything is due → a lesson on a new topic → practice.
   The response also carries the flame line.
6. **PR #31 F9 (deferred to this ticket).** `case@1` replay keeps at most one re-ask pair per day.

## User Story

As a pupil opening the tutor on an evening
I want to be told the one thing to do next (the boss if a re-test is due, else a new lesson, else practice) and to see my week's flame
So that I keep a weekly habit and my levels only move when a cold re-test says so

## Problem Statement

The ladder transitions exist (`src/flow/ladder.ts`), and replay already derives rungs, `nextDue`,
`xp`, `flame` and `confidentWrong`. Nothing decides what happens next, though. Nothing writes XP either,
and nothing stops a page or `curl` from writing it: `POST /api/event` accepts
`{"v":1,"type":"xp","amount":500,"reason":"attempt"}` today (observed: `xp` has a `FIELDS` entry at
`src/events/types.ts:171-174` and `postEvent` has no type filter, `src/api/event.ts:26-55`). A `retest`
can also say `passed: true` with `score: 0` (`src/events/types.ts:161-162` checks each field
separately). No session state is tracked, no boss is picked, and no route exposes any of this for T6.

## Solution Statement

All decisions live in pure functions in `src/flow`: no clock, no file, no `Math.random`, no model. The
route reads the clock once and passes the day down, as `/api/case` does (`src/server.ts:117-137`).
Replay stays the only reducer. It calls `session.ts` for the open-session bookkeeping, as it already
calls `ladder.ts`. Enforcement happens at the one write boundary pages use, `postEvent`: `xp` is
refused, `retest.passed` must match `passes(score, of)`, and each scoring event is followed by its
`xp` line.

## Out of Scope / Non-Goals

- Not included: `app/map.html`, `app/retest.html` and the boss result screen. These are T6, which reads
  `GET /api/next` and posts the `retest`/`session` bodies it returns.
- Not included: model call points in `session.ts` (T9 adds them; T5 leaves no job hooks or stubs).
- Not included: enforcing the session machine at `postEvent`. Two tabs, or a tab closed
  mid-session, are normal. Replay tolerates them (see Tasks 2 and 4) rather than refusing writes.
- Not included: XP for a detective `case` answer. It counts toward the flame (already true in replay)
  but earns no XP. PRD O1 names "an attempt with a score, a teach-back done", and O5 has its own
  reward (the calibration line).
- Not included: de-duplicating attempt XP (the same item re-answered after a reload earns again).
  This is flagged as Q3.
- Not changing: `afterLesson`/`afterRetest`/`afterRed`/`NEXT_DAYS` in `ladder.ts` (T2); `xp@1`'s shape;
  `MCP_WRITABLE` (`xp`, `retest`, `teachback` and `attempt` are already refused to a harness,
  `src/mcp/tools.ts:41-52`); `scripts/synth-events.ts` (writes via `appendEvent` directly, below
  `postEvent`, so its `xp` lines are unaffected).
- Not changing: `src/jobs`, `src/mcp`, any prompt. **Guard restatement:** T5 touches no model job, no
  MCP tool and no prompt, so no path puts an item answer into a model prompt. The boss output carries
  item ids and seeds only: no `answers`, `working`, `mark_scheme` or `misconceptions` (tested, Task 6).
  The page rebuilds answers in the browser, as practice already does. Answers reaching the browser is
  inherited (D7) and is not a model path.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium-High (six files of pure logic, one reducer change, one write-path change, property tests)
**Primary Systems Affected**: `src/flow/*`, `src/events/replay.ts`, `src/api/event.ts`, `src/api/next.ts` (new), `src/server.ts`, `.claude/references/events.md`
**Dependencies**: none new. `bun:test`, existing `lcg`/`hash` helpers.

## Related Work

**Implements**: [#7](https://github.com/linardsb/study-tutor/issues/7) · **Epic**: [#1](https://github.com/linardsb/study-tutor/issues/1), `docs/prd/study-tutor-v2.architecture.md` (D2, D3, D7, "Code holds the flow", "Gaming"), `docs/tickets/study-tutor-v2.md` T5 (lines 124-138)

**Back-references**:

- `.claude/plans/t2-events-append-replay.md`: Why: `ladder.ts`, the replay reducer table, the `shape` bump rule and the check projection.
- `.claude/plans/t7-detective-case.md`: Why: the pure-flow pattern (route reads clock once, `hash`/`lcg` seeding, `loadCasePack`), and PR #31 F9 comes from its review.
- `.claude/plans/t4-server-and-lesson-bridge.md`: Why: `postEvent`, `refuseForeign`, the route table.
- `.claude/plans/t8-setup-config-provider.md`: Why: `readProfile` / `weeklyTarget`.

**Forward-references**:

- T6 (#8) consumes `Next`, `Boss`, `BossSlot` and `passes` semantics. T9 (#11) adds job call points to `session.ts`.

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `src/flow/ladder.ts` (whole file, 36 lines): Why: `Rung`, `OnLadder`, `NEXT_DAYS`, the `Record<Rung, …>` table style. `afterLesson(0)` is 1, which bears on AC wording (see Q1).
- `src/flow/ladder.test.ts`: Why: `test.each` table style to mirror for `passes`.
- `src/events/replay.ts` (whole file, 200 lines): Why: `State` (lines 30-50, `shape: 2`), `CASES` table (lines 69-162), `topic()`/`work()` helpers, `dict()` (line 165), `replay()` (lines 168-200). Session case at 70-78 bumps the rung on a lesson `end` **without** needing a `start`. Keep that. `case@1` at 145-161 is the F9 site.
- `src/events/types.ts`: Why: `SessionV1` (lines 15-27), `RetestV1` (35-41), `XpV1` (55-58), `NewEvent` (107), `isDay` (126-130), `FIELDS` (145-203), `EVENT_KEYS`, `parseEvent`.
- `src/events/replay.test.ts` (lines 1-60, 124-165): Why: `TOPICS`/`XP` expectations for `six-weeks.jsonl`, `expect(s.shape).toBe(2)` at line 56, the case test that F9 extends.
- `src/events/__fixtures__/six-weeks.jsonl` (33 lines): Why: shows the intended writer, where each scoring line is followed one second later by its `xp` line (10/20/15). Line 8 is a lesson `end` with no `start`.
- `src/events/check.ts` (lines 15-45): Why: `project` reads only `lines`, `topics[*].rung`, `xp.total`, `hash`, **not `shape`**, so a shape bump to 3 never refuses (observed, read).
- `src/api/event.ts` (whole file, 55 lines): Why: `postEvent`, the one write path for pages and MCP. `Refused…` messages become 400 (lines 48-51).
- `src/api/event.test.ts` (lines 1-50): Why: `withTemp` realpathed temp-dir helper, `AT` fixed clock, assertion style.
- `src/api/case.ts` (whole file): Why: `loadCasePack` (memoised pack of topics, items and generators) and `caseForDay` (route logic that is pure apart from `currentState`). `src/api/next.ts` mirrors it.
- `src/api/state.ts`: Why: `currentState(dataDir)`.
- `src/server.ts` (lines 113-137 `getCase`, 184-205 `apiRoutes`): Why: the route to mirror, and the single route table. The key-leak test walks `apiRoutes` (`src/server.test.ts:363-384`), so a new entry is covered automatically.
- `src/server.test.ts` (lines 20-50, 398-440): Why: server harness and the `/api/case` route test to mirror.
- `src/flow/detective.ts` (lines 42-66, 113-117): Why: `hash` (FNV-1a), `shuffle`, and the `byDay` comparator (bare `.sort()` was Sonar reliability bug PR #31 F1).
- `src/content/generators.ts:6`: Why: `lcg(seed)`, the same seeded RNG `quiz.js` uses (`app/quiz.js:28-30`).
- `src/content/types.ts` (lines 20-50, 73-79): Why: `Topic` (`aliases[0]` is the generator code, `prerequisites`), `Item`, `CasePack`.
- `src/config.ts` (lines 116, 120, 167-179): Why: `Profile`, `DEFAULT_WEEKLY_TARGET = 3`, `readProfile(dataDir)` (never throws, defaults the target).
- `src/mcp/clock.ts`: Why: `localDay`, `addDays`, `isoWeek`, `utcNow`.
- `app/quiz.js` (lines 62-76, 164-185): Why: a generated item's id is `${topicId}#gen`, **the same id for every roll of a topic**, and it carries `seed`. `confidentWrong` therefore holds at most one `#gen` key per topic.
- `src/mcp/tools.ts` (lines 40-52): Why: harnesses cannot write `xp`/`retest`/`attempt`/`teachback`, so the new `postEvent` rules cost MCP nothing.
- `~/Desktop/Matis_study_tutor/.claude/skills/study/SKILL.md` lines 46, 71: Why: the v1 rules T5 ports. Due re-tests come first, oldest first; three fresh questions per topic; "Two or three right → the stage advances"; "Fewer than two → learning, +3 days".

### New Files to Create

- `src/flow/session.ts`: open-session transition and the start/end body builders.
- `src/flow/session.test.ts`
- `src/flow/xp.ts`: XP table, `xpFor`, `flame`, `guardrail`.
- `src/flow/xp.test.ts`
- `src/flow/boss.ts`: `boss(day, state, pack)`.
- `src/flow/boss.test.ts`
- `src/flow/next.ts`: `nextStep(state, day, pack, weeklyTarget)` and the exported `Next`/`Step` types.
- `src/flow/next.test.ts`
- `src/flow/properties.test.ts`: property tests over seeded synthetic histories, plus the "no model call in `src/flow`" scan.
- `src/api/next.ts`: `nextForDay(dataDir, pack, day)`, glue between `currentState`, `readProfile` and `nextStep`.

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- `.claude/references/events.md`: Replay, Routes, Config and profile sections. Update it in Task 10.
- `docs/prd/study-tutor-v2.prd.md` lines 113-119 (O1), 193 (R6), 230 (guardrail).
- `docs/prd/study-tutor-v2.architecture.md` lines 55-63 ("Code holds the flow"), 79-86 (D3), 166-168 ("Gaming").
- [bun:test `test.each`](https://bun.sh/docs/test/writing#test-each): Why: table tests, already used in `ladder.test.ts`.

### Patterns to Follow

**Pure flow module** (`src/flow/detective.ts:1-5`): a header comment stating it is pure (no clock, no file, no `Math.random`). Days come in as `YYYY-MM-DD` strings, and seeds come from `hash(...)` → `lcg(...)`.

**Tables over branches** (`src/flow/ladder.ts:19-21`): `const PASS: Record<Rung, OnLadder> = {...}`. Use `Record<XpV1["reason"], number>` for XP (compile-pinned to the union), `Record<Rag | "none", number>` for lesson priority.

**Reducer entries** (`src/events/replay.ts:69`): one entry per `type@v`, mutating `s`. Helpers take `State`.

**Route glue** (`src/api/case.ts:57-75` + `src/server.ts:117-137`): the `api/` function takes `(dataDir, pack, day)` and returns a plain object. The server function does `refuseForeign`, reads `?day=` through `isDay` (400 otherwise), `localDay(utcNow())`, `loadCasePack`, then try/catch → 500 with a plain message and `console.error`.

**Comparators**: explicit `(a, b) => a < b ? -1 : a > b ? 1 : 0` (the `byDay` shape in `detective.ts:113-117`). No bare `.sort()` (Sonar).

**Imports into `replay.ts`**: `replay.ts` imports values from `../flow/ladder` already. `session.ts` and `xp.ts` must import `State`/event types with `import type` only, so there is no runtime cycle.

**Complexity**: SonarCloud runs on PRs (cognitive complexity limit 15; PR #23 split `check.ts` for it). Keep `nextStep` and `boss` as small helpers (`dueTopics`, `slotsFor`, `pickLesson`, `pickPractice`). Local check, observed to work without a config change: `bunx biome lint --only=complexity/noExcessiveCognitiveComplexity <files>` runs Biome's rule at its default limit of 15. Do not add the rule to `biome.json`: 9 existing functions already exceed it (observed: `app/quiz.js` ×3, `app/case.js`, `src/config.ts:211`, `src/events/append.ts:60`, `src/events/check.ts:68`, `src/providers/openai-compatible.ts:112`, `src/flow/detective.test.ts:123`), and fixing them is outside this ticket.

**Test helpers**: `withTemp` from `src/api/event.test.ts:21-33` (copy it locally, as `case.test.ts` does). Fixed clock `AT = () => "…Z"`.

---

## IMPLEMENTATION PLAN

### Phase A: Ladder pass rule, session and XP modules (pure)

Tasks 1-3. No I/O.

### Phase B: Replay and write path

**Depends on:** Phase A. Tasks 4-5: replay state shape 3, F9, `postEvent` rules.

### Phase C: Boss and next

**Depends on:** Phase B (reads the new `State`). Tasks 6-8.

### Phase D: Route, properties, docs

**Depends on:** Phase C. Tasks 9-11.

---

## STEP-BY-STEP TASKS

### Task 1: UPDATE `src/flow/ladder.ts` + `ladder.test.ts`

- **IMPLEMENT**:
  - `export const RETEST_SLOTS = 3;` (v1: "three fresh questions" per topic).
  - `export function passes(score: number, of: number): boolean { return of > 0 && score * 3 >= of * 2; }`.
    The doc comment says "2 of 3 or better, the v1 rule; integer arithmetic, no float".
- **PATTERN**: `ladder.test.ts` `test.each`.
- **GOTCHA**: `of = 0` is valid for `retest@1` (`outOf` allows 0 ≤ 0) and must not pass.
- **VALIDATE**: `bun test src/flow/ladder.test.ts`, with rows `[3,3,true] [2,3,true] [1,3,false] [0,3,false] [4,6,true] [3,6,false] [0,0,false] [1,1,true]`.
- **SATISFIES**: AC 1 (a failed cold re-test drops a rung; the pass is defined in code).

### Task 2: CREATE `src/flow/session.ts` + `session.test.ts`

- **IMPLEMENT**:
  ```ts
  export type Mode = SessionV1["mode"];
  export type OpenSession = { mode: Mode; topic: string | null; t: string };
  /** Replay's bookkeeping: a start opens (replacing any open one: a closed tab never ended it); an end closes whatever is open. */
  export function onSession(open: OpenSession | null, e: SessionV1): OpenSession | null
  export function startBody(mode: Mode, topic: string | null): NewEvent   // {v:1,type:"session",phase:"start",mode, ...(topic? {topic}:{})}
  export function endBody(open: OpenSession): NewEvent                     // same mode and topic, phase "end"
  /** The open session if it was started on `day` (London), else null: yesterday's unclosed tab is abandoned, not resumed. */
  export function openToday(open: OpenSession | null, day: string): OpenSession | null
  ```
- **IMPORTS**: `import type { NewEvent, SessionV1 } from "../events/types"`; `localDay` from `../mcp/clock`.
- **GOTCHA**: An `end` closes any open session, even if its mode or topic differs. Mismatched pairs come from two tabs, and a stuck-open session is worse than a loose close. The lesson rung bump stays in replay's `session@1` case and does not read `open` (six-weeks line 8 is an `end` with no `start`).
- **VALIDATE**: `bun test src/flow/session.test.ts`. Cases: start→open; start while open→replaced; end→null; end with nothing open→null; `startBody("boss", null)` has no `topic` key and passes `parseEvent` once `t` is added; `endBody` mirrors mode and topic; `openToday` null for a start on the previous London day (use `2026-10-11T23:30:00Z`, which is 12 Oct in BST, as the boundary case).
- **SATISFIES**: AC 4.

### Task 3: CREATE `src/flow/xp.ts` + `xp.test.ts`

- **IMPLEMENT**:
  ```ts
  /** Effort, not correctness (PRD O1): a wrong attempt earns what a right one does. Values as in six-weeks.jsonl. */
  export const XP: Record<XpV1["reason"], number> = { attempt: 10, retest: 20, teachback: 15 };
  /** The xp line the server appends after a scoring event, or null for any other event. */
  export function xpFor(e: Event | NewEvent): NewEvent | null   // attempt|retest|teachback → {v:1,type:"xp",amount:XP[reason],reason}
  export type Flame = { week: string; days: number; target: number };
  export function flame(state: State, day: string, target: number): Flame  // days = state.flame[isoWeek(day)]?.length ?? 0
  export type GuardrailWeek = { week: string; xp: number; score: number; of: number };
  /** Weeks with a re-test, in week order, and whether the latest re-test rate fell below the previous one while XP rose. */
  export function guardrail(state: State): { weeks: GuardrailWeek[]; falling: boolean }
  ```
  `falling` compares the last two entries of `weeks`: `last.score * prev.of < prev.score * last.of && last.xp > prev.xp`. Cross-multiplied, so no float. False with fewer than two weeks.
- **IMPORTS**: `import type { State } from "../events/replay"`; `import type { Event, NewEvent, XpV1 } from "../events/types"`; `isoWeek` from `../mcp/clock`.
- **GOTCHA**: `xpFor` returns a new object and never spreads the input (no stray field). `XpV1["reason"]` is the compile pin, so a new reason fails `tsc` until `XP` has it.
- **VALIDATE**: `bun test src/flow/xp.test.ts`. Cases: each scoring type → its amount; `session`, `case`, `intake`, `xp` → null; `flame` for a week with no entry → 0; guardrail over a hand-built state: two weeks `{4/6, xp 70}` → `{5/6, xp 50}` is not falling; `{5/6, 50}` → `{2/3, 60}` is falling (derived: 2·6=12 < 5·3=15, and 60 > 50).
- **SATISFIES**: AC 2, AC 7.

### Task 4: UPDATE `src/events/replay.ts` + `replay.test.ts`

- **IMPLEMENT**:
  - `State.shape: 3`. Add `session: OpenSession | null` (initial `null`) and `retests: Record<string, { score: number; of: number }>` (ISO week → summed score and of; initial `dict()`).
  - `session@1`: first line `s.session = onSession(s.session, e);`, then the existing body unchanged.
  - `retest@1`: after the rung update, `const w = isoWeek(localDay(e.t)); const r = s.retests[w] ?? {score:0, of:0}; r.score += e.score; r.of += e.of; s.retests[w] = r;`.
  - `case@1` re-ask branch (F9): `else if (rec.bets.length < 2) rec.bets.push([e.bet, e.correct]);` so a second re-ask (two tabs) is ignored. Comment: "at most one re-ask a day (T7 AC 6, PR #31 F9)".
- **IMPORTS**: `import { onSession, type OpenSession } from "../flow/session"`.
- **GOTCHA**:
  - `State` literals: the only full `State` literal is the initial value in `replay()` (`src/events/replay.ts:169-182`). Observed: grep for `shape: 2`, `: State =` and `caseSeed: null` over `src` and `scripts` finds no other. `replay.test.ts` uses the partial types `State["topics"]` and `State["xp"]`, which are unaffected.
  - `check.ts` `project` does not read `shape` (`src/events/check.ts:26-45`), so the bump never refuses an update. The compatibility contract paths (`lines`, `topics[id].rung`, `xp.total`) are unchanged.
  - The existing "derived state carries no correct answer or mark scheme" test (`replay.test.ts:59-68`) must stay green. `session` and `retests` carry none.
- **VALIDATE**: `bun test src/events/replay.test.ts`, with:
  - `shape` expectation 2 → 3 (line 56).
  - The six-weeks test adds `expect(s.retests).toEqual({"2026-W41":{score:4,of:6},"2026-W42":{score:5,of:6},"2026-W43":{score:3,of:3},"2026-W45":{score:2,of:3},"2026-W46":{score:3,of:3}})`. Derived: W41 = Oct 5–11, holding Oct 8 3/3 and Oct 9 1/3; W42 = Oct 12–18, holding Oct 12 2/3 and Oct 18 3/3; W43 holds Oct 25 3/3; W45 = Nov 2–8, holding Nov 5 2/3; W46 holds Nov 15 3/3. 2026-10-05 is a Monday and in ISO week 41, because 1 Jan 2026 is a Thursday.
  - `expect(s.session).toBeNull()`: the last session line (line 8) is an `end`.
  - The rungs and `XP` constants stay byte-identical (proves the session change did not move the lesson bump).
  - New test "case: a second re-ask the same day is ignored": first + re-ask + re-ask gives `bets.length === 2`. The orphan path (re-ask with no first, then another re-ask) gives `bets.length === 2`.
- **SATISFIES**: AC 4, AC 7, AC 9.

### Task 5: UPDATE `src/api/event.ts` + `event.test.ts`

- **IMPLEMENT** in `postEvent`, after `isObj` and topic resolution:
  - `if (event.type === "xp") return 400 "Refused: XP is written by the tutor, not posted"`.
  - `if (event.type === "retest" && typeof event.score === "number" && typeof event.of === "number" && event.passed !== passes(event.score, event.of)) return 400 "Refused: passed does not match the score"`. Only when the numbers are numbers: a malformed retest still reaches `appendEvent` and gets its usual refusal.
  - After the scoring event is appended: `const xp = xpFor(saved); if (xp) try { appendEvent(dataDir, xp, now) } catch (err) { console.error(...) }`. Still return 201 with the scoring event as `body`.
- **IMPORTS**: `passes` from `../flow/ladder`; `xpFor` from `../flow/xp`.
- **GOTCHA**:
  - A failed `xp` append must not turn into a 400 or 500. `quiz.js` shows "Not saved" on a non-2xx (`app/quiz.js:78, 92-98`), and the attempt *was* saved.
  - The two appends are not atomic. A crash between them loses 10 XP and never adds any, so the property "XP never rises without a scoring event" still holds.
  - The MCP path (`src/mcp/tools.ts` → `postEvent`) cannot reach a scoring type (`MCP_WRITABLE`), so MCP behaviour is unchanged. `src/mcp/tools.test.ts` must stay green untouched.
- **UPDATE existing tests** that post a scoring event through `postEvent` or `/api/event` and count lines. Observed in a planning spike: adding the xp append to `postEvent` and running `bun test` gave 243 pass and 2 fail, exactly `event.test.ts:45` and `server.test.ts:310`. `:318` is in the same test after `:310` and fails once `:310` is fixed:
  - `src/api/event.test.ts:45`: `toHaveLength(1)` → `2` (the attempt plus its xp line). Also assert `readLines(data)[1]` is the xp line.
  - `src/server.test.ts:310` and `:318`: the posted attempt at line 284 now writes 2 lines, so `toHaveLength(1)` → `2` both times. The second is the "refusal writes nothing" check, and it stays at the count after the attempt.
  - Unaffected: `src/api/state.test.ts:48` (uses `appendEvent` directly); `src/mcp/tools.test.ts:218` (session and intake, no xp).
- **VALIDATE**: `bun test src/api/event.test.ts src/server.test.ts`. New cases:
  - An attempt appends two lines: the attempt, then `{"type":"xp","amount":10,"reason":"attempt"}`; `r.body.type === "attempt"`.
  - A teachback appends xp 15; a retest `3/3 passed:true` appends xp 20.
  - A `session` or `intake` appends one line.
  - An `xp` body → 400, `readLines(data)` is `[]`, and `data/` is not created (mirror the existing "refusal writes nothing" assertion).
  - A retest `{score:0, of:3, passed:true}` → 400, nothing written. `{score:2, of:3, passed:false}` → 400.
  - xp append failure: make the second append throw. Pass a `now` that returns a valid `t` on its first call and `"bad"` on its second. `appendEvent` calls `now()` exactly once per append (observed: `src/events/append.ts:69`, the only call), and it refuses an invalid `t` through `parseEvent`. Expect 201 and one line.
  - Mutation check, recording both results: remove the xp append, and the "two lines" test goes red while the `xp`-refusal test stays green. Record both in the execution report.
- **SATISFIES**: AC 1, AC 2.

### Task 6: CREATE `src/flow/boss.ts` + `boss.test.ts`

- **IMPLEMENT**:
  ```ts
  /** One question of a boss. item: a pack item id (the pupil's own confident-wrong item), or null for a fresh generator roll with `seed`. No title, answer or working: the page builds the question. */
  export type BossSlot = { topic: string; item: string | null; seed: number };
  export type Boss = { day: string; seed: number; topics: string[]; slots: BossSlot[] };
  export const MAX_BOSS_TOPICS = 3; // expected: 3 topics × 3 slots = 9 questions, about a 20-minute v1 session
  /** Pack topics with nextDue on or before day, oldest nextDue first, then pack order. */
  export function dueTopics(state: State, day: string, pack: CasePack): string[]
  /** The mixed cold re-test for the due topics, or null when none is due. Pure: same state, day and pack → same boss. */
  export function boss(state: State, day: string, pack: CasePack): Boss | null
  ```
  Per topic (`slotsFor`):
  1. Take `confidentWrong` entries of that topic whose key is a pack item id of the topic (`pack.items.get(topic)` has it), oldest `t` first. Each gives `{topic, item: id, seed: hash(`${day}:${id}`)}`.
  2. Fill to `RETEST_SLOTS` with generator slots `{topic, item: null, seed: hash(`${day}:${topic}:${k}`)}`, k = 0, 1, 2… If the topic has no generator (`pack.gens[aliases[0]]` not a function), fill from the topic's other pack items in `hash(`${day}:${id}`)` order. If still short, the topic gets fewer slots.
  3. Cap at `RETEST_SLOTS`.

  `xpFor` recognises a reason with `Object.hasOwn(XP, type)`, not `in`, so `toString` is not a reason.

  `boss.seed = hash(`${day}:boss`)`; `slots = shuffle(all, lcg(boss.seed))`. Move `shuffle` and `hash` so both modules share them: export `shuffle` from `detective.ts` (it already exports `hash`) and import both. Do not copy them.
- **IMPORTS**: `hash`, `shuffle` from `./detective`; `lcg` from `../content/generators`; `RETEST_SLOTS` from `./ladder`; `import type { State } from "../events/replay"`; `import type { CasePack } from "../content/types"`.
- **GOTCHA**:
  - A `confidentWrong` key `<topic>#gen` is not a pack id (`app/quiz.js:65`). It is skipped in step 1, and step 2's fresh generator rolls cover it. Test it.
  - All 105 pack items are `cloze` (observed: `grep -o '"type": "[a-z-]*"' content/maths/items/*.json | sort | uniq -c` → `105 cloze`). A confident-wrong fixed item comes back with the same numbers the pupil saw, possibly with its working (Q4).
  - `dueTopics` ignores state topics missing from the pack (a hand-typed intake topic, `src/api/event.ts:11-15`).
  - Explicit comparator on `nextDue` then pack index.
- **VALIDATE**: `bun test src/flow/boss.test.ts`, loading the real pack via `loadCasePack("maths")` as `case.test.ts` does. Cases:
  - No due topic → null.
  - Two due topics → 6 slots, `topics` in nextDue order.
  - A confident-wrong pack item of a due topic appears as a slot with that `item`.
  - A confident-wrong `#gen` key adds no fixed slot.
  - A confident-wrong item of a **non-due** topic does not appear.
  - Same inputs → deep-equal output; a different day → different `seed`.
  - 5 due topics → `topics.length === 3`.
  - Mixed: with 2 due topics, over days 2026-10-01…2026-10-30 at least one boss changes topic more than once between neighbours (grouped AAABBB changes once). It is a shuffle, so assert "not always grouped", not a fixed order.
  - No generator: with the pack's `gens` emptied, a topic is filled from its other items (every maths topic has a generator, so this path needs a synthetic pack).
  - Unlabelled and answer-free: `JSON.stringify(boss)` contains no topic `title` of the pack and none of the keys `answers`, `working`, `mark_scheme`, `misconceptions`, `stem`.
- **SATISFIES**: AC 3.

### Task 7: CREATE `src/flow/next.ts` + `next.test.ts`

- **IMPLEMENT**:
  ```ts
  export type Step =
    | { kind: "continue"; mode: Mode; topic: string | null; end: NewEvent }
    | { kind: "boss"; boss: Boss; start: NewEvent }             // start = startBody("boss", null)
    | { kind: "lesson"; topic: string; start: NewEvent }         // startBody("lesson", topic)
    | { kind: "practice"; topic: string; start: NewEvent }       // startBody("practice", topic)
    | { kind: "none" };                                          // empty pack
  export type Next = { day: string; flame: Flame; step: Step };
  export function nextStep(state: State, day: string, pack: CasePack, weeklyTarget: number): Next
  ```
  Order: `openToday(state.session, day)` → continue; else `boss(...)` → boss; else `pickLesson` → lesson; else `pickPractice` → practice; else none.
  - `pickLesson`: pack topics at rung 0 (absent from `state.topics` counts as 0) whose every in-pack prerequisite is at rung ≥ 1. Order: `RAG_ORDER: Record<Rag | "none", number> = { R: 0, A: 1, none: 2, G: 3 }`, then pack index.
  - `pickPractice`: pack topics at rung ≥ 1. Lowest rung first, then earliest `nextDue`, then pack index.
- **GOTCHA**:
  - If no rung-0 topic is ready (every candidate has an unstarted prerequisite), `pickLesson` returns null and practice follows. Pack order lists every prerequisite before its dependent (observed: a script over `content/maths/topics.json` found 0 violations in 21 topics), so with the maths pack the first unstarted topic in pack order is always ready.
  - A single session start for a multi-topic boss uses mode `"boss"` and no `topic`; `SessionV1.topic` is optional.
  - The practice session gets no rung effect: replay's `session@1` bumps only `mode === "lesson"`.
- **VALIDATE**: `bun test src/flow/next.test.ts`, using hand-built `State` values plus the real pack. Cases:
  - Empty state → lesson on the first pack topic.
  - Intake with R on the 5th topic (no prerequisites) → that topic.
  - A due topic → boss, even with an R topic unstarted.
  - Session opened today → continue with the `end` body; opened yesterday → not continue.
  - All topics rung ≥ 1 and none due → practice on the lowest rung.
  - A rung-0 topic whose prerequisite is rung 0 is skipped.
  - `flame.target` echoes `weeklyTarget`.
  - The `start`/`end` bodies pass `parseEvent` after adding `t` (the page posts them verbatim).
  - Deterministic: two calls deep-equal.
- **SATISFIES**: AC 4, AC 5.

### Task 8: CREATE `src/api/next.ts`

- **IMPLEMENT**: `export function nextForDay(dataDir: string, pack: CasePack, day: string): Next { return nextStep(currentState(dataDir), day, pack, readProfile(dataDir).weeklyTarget); }`.
- **PATTERN**: `src/api/case.ts:57-75`.
- **VALIDATE**: covered by Task 9's route test.
- **SATISFIES**: AC 5.

### Task 9: UPDATE `src/server.ts` + `server.test.ts`: `GET /api/next`

- **IMPLEMENT**: `getNext(req, dataDir, root, pack)`, a copy of `getCase` (`src/server.ts:117-137`) that calls `nextForDay`. Error text: "Could not work out the next step". Add `"/api/next": { GET: … }` to `apiRoutes`.
- **GOTCHA**: The key-leak test walks `apiRoutes` (`src/server.test.ts:363-384`). Confirm it still passes: `/api/next` returns no config.
- **VALIDATE**: `bun test src/server.test.ts`. Mirror the `/api/case` test (line 398):
  - 200 with `step.kind === "lesson"` on an empty data dir.
  - `?day=2026-02-30` → 400; `?day=today` → 400.
  - Foreign `Origin` → 403.
  - After appending an intake with R through `appendEvent`, the step names that topic.
  - Refactor check (done): `getCase` is replaced by a shared `dayRoute(req, root, pack, failed, build)` helper, and `/api/case` and `/api/next` both call it. A copy would be about 20 identical lines, expected to cross Sonar's duplicated-block threshold.
- **SATISFIES**: AC 5.

### Task 10: CREATE `src/flow/properties.test.ts`

- **IMPLEMENT**:
  - A seeded history generator: `lcg(seed)`, seeds `1..H` with `H = 200`, `L = 60` scoring-or-other events each, plus their xp lines. Five topics from the pack. Cost is observed from a planning spike (a scratch copy of this generator over the real `replay`): 370,819 line parses in 2.78 s, 0 skipped lines. The baseline suite runs in 1.56 s (observed, `bun run check` on 85fc13f). If the gate time matters, `H = 100` halves the cost (derived: the cost is linear in H).
  - The event menu: session start/end (lesson/practice/boss), attempt (random correct/sure), retest (`score` 0–3 of 3, `passed = passes(score, 3)`), teachback, intake (random R/A/G per topic), case.
  - `t` advances 1–72 hours per event from `2026-10-05T16:00:00Z`.
  - Lines are built the way `postEvent` writes them: each body as `JSON.stringify({ ...body, t })` (key order does not matter to replay). After each scoring body comes its `xpFor(body)` line, with `t` one second later.
  - No file I/O: `postEvent` fsyncs per line, and this runs under the stop-hook gate.
  - For each history and each prefix `k`, `a = replay(lines.slice(0, k))` and `b = replay(lines.slice(0, k+1))`. Assert:
    1. **Rung rises only on a passed re-test or a first lesson**: for each topic, `b.rung > a.rung` ⇒ line k is `retest` for that topic with `passed`, or any `retest` for that topic with `a.rung === 0 && b.rung === 1` (`afterRetest(0, false) === 1`, T2; Q8), or a `session` end, mode lesson, for that topic with `a.rung === 0 && b.rung === 1`.
    2. **Practice never drops a rung**: `b.rung < a.rung` ⇒ line k is a failed `retest` for that topic, or an `intake` with `R` for it.
    3. **XP never rises without a scoring event**: `b.xp.total > a.xp.total` ⇒ line k is `xp` and line k−1 is `attempt|retest|teachback`.
    4. **XP is exactly the effort sum**: `b.xp.total === Σ XP[type]` over the scoring lines whose `xp` line is inside the prefix, meaning scoring lines at index `j` with `j + 1 ≤ k`. A prefix that ends on a scoring line has not reached that line's `xp` line yet, so summing over every scoring line in `0..k` goes red once per scoring event. Do not "fix" it by summing that way.
    5. **Guardrail is computable**: `guardrail(b)` never throws, and `weeks` equals the week-grouped sum of retest lines (recomputed independently in the test from the lines).
  - The 200 seeds run as four `test.each` batches of 50, so each test stays inside bun's 5 s default (histories average 85.6 lines, 742,190 prefix parses in all, 2.0× the spike).
  - Test "no model call in src/flow": read every non-test `src/flow/*.ts` and assert no `import … from "../providers` and no `fetch(`. Do not assert no `../jobs`: T9 registers jobs from `src/flow`.
- **GOTCHA**:
  - Property 1 as the issue words it ("rung never rises without a passed re-test") is false for the merged `afterLesson(0) === 1` (`src/flow/ladder.ts:24-26`). The plan tests the refined statement and flags Q1.
  - Mutation check, recording both results: temporarily make the `attempt@1` reducer call `afterRetest(ts.rung, true)`. Property 1 must go red, and property 3 must stay green. Revert.
  - Mutation check: add a bare `xp` line (no preceding scoring line) to one history. Property 3 goes red. Record it.
- **VALIDATE**: `bun test src/flow/properties.test.ts`; record the wall time (observed) in the report.
- **SATISFIES**: AC 6, AC 7, AC 8.

### Task 11: UPDATE `.claude/references/events.md`

- **IMPLEMENT**:
  - Routes: add `GET /api/next`, and note that `POST /api/event` refuses `xp` and a `retest` whose `passed` disagrees with `passes(score, of)` (2 of 3), and appends the `xp` line after a scoring event.
  - Replay: `shape` 3; new keys `session` (the open session or null), `retests` (ISO week → summed score and of). `case` keeps at most one re-ask pair.
  - Profile: T5 reads `weeklyTarget` for the flame.
- **GOTCHA**: The prose gate in CLAUDE.md applies to pupil-facing text, and this file is developer text, so no humanizer pass is needed. Keep sentences plain.
- **VALIDATE**: `bun run check`.
- **SATISFIES**: documentation.

---

## TESTING STRATEGY

### Unit Tests

Colocated `*.test.ts` per module (Tasks 1-7), with `bun:test` and `test.each` tables where the input is tabular. `State` fixtures are hand-built for `next`/`boss` edge cases; the real maths pack is loaded via `loadCasePack("maths")` (memoised) where content matters.

### Integration Tests

- `src/api/event.test.ts`: the real `appendEvent` into a realpathed temp `data/`; asserts the exact lines written (Task 5).
- `src/server.test.ts`: the real `Bun.serve` on port 0, `/api/next` over HTTP (Task 9). No socket or realtime is involved.

### Edge Cases

| Edge case | Verified in |
|---|---|
| Lesson `end` with no `start` still bumps 0→1 | `replay.test.ts` six-weeks constants unchanged (Task 4) |
| Start while a session is open replaces it | `session.test.ts` (Task 2) |
| Session opened yesterday is not resumed | `session.test.ts`, `next.test.ts` (Tasks 2, 7) |
| London day boundary 23:30Z in BST | `session.test.ts` (Task 2) |
| `retest` with `of: 0` never passes | `ladder.test.ts` (Task 1) |
| `retest` passed/score mismatch refused, nothing written | `event.test.ts` (Task 5) |
| Posted `xp` refused, `data/` not created | `event.test.ts` (Task 5) |
| xp append fails after a saved attempt → still 201 | `event.test.ts` (Task 5) |
| `#gen` confident-wrong key | `boss.test.ts` (Task 6) |
| Confident-wrong item in a non-due topic excluded | `boss.test.ts` (Task 6) |
| Due topic not in the pack ignored | `boss.test.ts` (Task 6) |
| More than 3 due topics capped | `boss.test.ts` (Task 6) |
| Topic with unstarted prerequisite skipped for a lesson | `next.test.ts` (Task 7) |
| Two re-asks the same day | `replay.test.ts` (Task 4) |
| `?day=2026-02-30`, `?day=today` | `server.test.ts` (Task 9) |
| Empty data dir | `server.test.ts` (Task 9) |

---

## VALIDATION COMMANDS

### Level 0: Worktree setup

The worktree was made with a bare `git worktree add`, so it has no `node_modules`. Run this once before anything else:

```bash
cd ~/Desktop/study-tutor-t5 && bun install
```

### Level 1: Syntax & Style

```bash
bunx tsc --noEmit
bunx biome check .
```

### Level 1b: Complexity (the SonarCloud limit, checked locally)

```bash
bunx biome lint --only=complexity/noExcessiveCognitiveComplexity src/flow/ladder.ts src/flow/session.ts src/flow/xp.ts src/flow/boss.ts src/flow/next.ts src/api/next.ts src/api/event.ts src/events/replay.ts src/server.ts
```

Must report 0 diagnostics. All of these files are clean today (observed).

### Level 2: Unit Tests

```bash
bun test src/flow src/events
```

### Level 3: Integration Tests

```bash
bun test src/api src/server.test.ts src/mcp
bun run check          # the gate: tsc + biome + all tests
bun scripts/test-generators.ts
```

### Level 4: Manual Validation

Run in the worktree `~/Desktop/study-tutor-t5`. `data/` is gitignored, and the scripts use `data/` in the folder they run from.

1. `bun install` (once, per Level 0), then `rm -rf data && bun run dev`. Note the printed port `P` (4731 unless taken).
2. `curl -s http://127.0.0.1:P/api/next`: `step.kind` is `"lesson"`, the topic is the first topic in `content/maths/topics.json` (`1MA1/R9/of-an-amount`), and `flame` is `{week, days:0, target:3}`.
3. Post the returned `step.start` body:
   `curl -s -X POST -H 'content-type: application/json' -d '<start body>' http://127.0.0.1:P/api/event`, then `curl -s …/api/next`. `step.kind` is `"continue"` with an `end` body.
4. Post an attempt:
   `curl -s -X POST -H 'content-type: application/json' -d '{"v":1,"type":"attempt","item":"1MA1/R9/of-an-amount#1","topic":"U349","correct":false,"sure":true,"answer":"4.5"}' http://127.0.0.1:P/api/event`.
   Then `tail -2 data/events.jsonl`: the attempt, then `"type":"xp","amount":10`.
5. `curl … -d '{"v":1,"type":"xp","amount":500,"reason":"attempt"}'` gives 400, and `wc -l data/events.jsonl` is unchanged.
6. `curl … -d '{"v":1,"type":"retest","topic":"U349","score":0,"of":3,"passed":true}'` gives 400.
7. Post the `end` body from step 3. Then `curl -s '…/api/next?day=<today + 3>'` (the lesson set `nextDue` 3 days out): `step.kind` is `"boss"`, `boss.slots` has 3 slots, and one slot has `item: "1MA1/R9/of-an-amount#1"` (confident-wrong from step 4). `grep -c 'Percentage of an amount'` on that response is 0.
8. `curl -s …/api/state | jq '.shape, .retests, .session'` gives `3`, `{}`, `null`.

Every step needs only the running dev server, `curl` and the pack. No seed script is required.

### Level 5: Additional Validation (Optional)

- `bun scripts/synth-events.ts --n 200 && bun scripts/replay-check.ts` shows no refusal after the shape bump (the replay check against a state written by this build).

---

## ACCEPTANCE CRITERIA

1. [ ] Ladder: rungs and the 3/10/30/60 schedule unchanged; `passes(score, of)` is 2 of 3; practice (attempts, practice or boss sessions) never moves a rung; a failed cold re-test drops to learning (Task 1, property 2).
2. [ ] XP is written only by the server, only after an `attempt`, `retest` or `teachback` (10/20/15), is counted by ISO week, and a posted `xp` is refused. The flame reports "n of target this week" from `profile.json` (Tasks 3, 5, 7).
3. [ ] The boss is built from due topics, with the pupil's confident-wrong pack items first, fresh generator rolls to 3 per topic, shuffled by a seed from the day, and no title, answer or working in the output (Task 6).
4. [ ] Session machine: start (mode + topic) → open → end → idle, every transition one event, open session in state, bodies handed out by `/api/next` (Tasks 2, 4, 7).
5. [ ] `GET /api/next` returns the deterministic next step and the flame; `?day=` is validated; a foreign origin is refused (Tasks 7-9).
6. [ ] Property tests over 200 seeded synthetic histories: a rung never rises except on a passed re-test or a first lesson (0→1), and XP never rises without an attempt, retest or teachback line (Task 10).
7. [ ] Guardrail pair (weekly re-test score vs weekly XP) computable from state: `state.retests` + `state.xp.byWeek` → `guardrail(state)` (Tasks 3, 4, 10).
8. [ ] No model call anywhere in `src/flow` (Task 10 scan).
9. [ ] PR #31 F9: at most one re-ask pair per case day in replay, tested (Task 4).
10. [ ] `bun run check` green; `.claude/references/events.md` updated.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] Both halves of each mutation check recorded (Tasks 5, 10)
- [ ] `bun run check` green (observed, name the run)
- [ ] Level 4 steps 1-8 performed
- [ ] Acceptance criteria all met
- [ ] PR body restates the guard (no job, MCP tool or prompt touched; boss carries no answers)

---

## OPEN QUESTIONS / ASSUMPTIONS

- **Q1: the rung AC wording. Decided 2026-09-28 by the user: a lesson starts the ladder.** The issue says "rung never rises without a passed re-test", but a finished lesson takes rung 0 → 1 (`afterLesson`, merged in T2, v1's "not started → learning"). The plan tests: a rung rises only on a passed re-test, or on a lesson end from 0 to 1. The lesson start is intended. Had it not been, `LESSON` in `ladder.ts` changes and the six-weeks expectations move (N12 lands at rung 1 via its lesson on 6 Oct).
- **Q2: the XP writer. Decided 2026-09-28 by the user: `postEvent` writes xp.** The plan keeps `xp@1` as the record (D3) and makes `postEvent` its only writer. The alternative, deriving XP in replay from scoring events and ignoring `xp` lines, makes the property hold for hand-edited logs too, but reverses D3 and changes `six-weeks` XP. Worst case for the chosen design: a hand-edited `xp` line raises XP. The architecture's "Gaming" paragraph accepts hand edits ("the school paper is the judge").
- **Q3: attempt XP spam.** Reloading a lesson and re-answering earns XP again, 10 per attempt with no cap. That is effort-shaped (typing an answer, not a click), but farmable. **Assumption:** no cap in T5. A per-item-per-day cap would need an extra set in state; raise it with T6 if the flame or XP screen shows a problem.
- **Q4: confident-wrong fixed items in the boss (settled for T5).** All 105 pack items are fixed-number `cloze`. A boss slot for one repeats numbers the pupil has seen with the working. The boss only covers due topics, so at least 3 days have passed since the lesson (`NEXT_DAYS[1]`). Seeing the same item again cold is still retrieval, and the pupil's own wrong item is the point of O1's boss ("built from the pupil's own confident-wrong items"). T6 can choose to render a same-topic generator roll instead. A boss posts `retest` events, not `attempt`s, so a boss never clears `confidentWrong`. Only a correct practice attempt does. T6 decides whether the re-test page also posts attempts.
- **Q5: boss scope.** Only due topics' confident-wrong items feed the boss. A confident-wrong item on a topic not yet due waits for its due date. **Assumption:** the boss is the cold re-test (PRD O1: "a cold re-test (the boss)") and must not re-test a topic early.
- **Q6: the 3-topic cap** (`MAX_BOSS_TOPICS`, expected, sized to v1's 20-minute session). v1 re-tested every due topic, "oldest first", and stopped at the clock. Topics beyond the cap stay due and come first next time.
- **Q8: a failed re-test at rung 0** lands on learning (rung 1), as T2 pinned (`ladder.test.ts` `[0, false, 1]`). Found by the property tests during implementation. Open for the user: (a) accept it, and AC 6 adds "or any re-test from rung 0"; (b) a failed re-test at rung 0 leaves the topic at 0, a `ladder.ts` change for another ticket. No app path reaches it: the boss only picks started topics.
- **Q7: the practice pick** (lowest rung, then earliest `nextDue`) is a T5 choice. v1 had no practice step.

## NOTES (open canvas)

**Why enforce at `postEvent` and not in replay.** Replay must accept any readable line (a hand edit is
allowed; `check.ts` relies on replay being total). The write boundary is where "never on a click" can
be enforced for the app's own pages, and MCP already refuses scoring types. A replay-side `passed` check
(`e.passed && passes(e.score, e.of)`) was considered. It would change what an existing `retest@1` line
means, while the write check keeps old lines' meaning and stops new bad ones. All seven retests in
`six-weeks.jsonl` agree with `passes` (observed, read: 3/3 T, 1/3 F, 2/3 T, 3/3 T, 3/3 T, 2/3 T, 3/3 T).

**Why the session machine is not enforced.** The worst case for enforcement is a pupil who closes a
tab mid-lesson and whose next start is refused. They are locked out until an `end` is posted, which
no page offers. Replacing on start and closing on any end is lossy, but the pupil can never get stuck.

**Why `/api/next` returns event bodies.** It keeps "flow in code": the page never composes a session
event, it posts what the server said. T9 later adds job call points between these steps without the
pages changing.

**Size estimate** (expected): ladder +15, session 45, xp 70, boss 90, next 90, api/next 12, server +25,
replay +20, event +20, tests about 550. That is about 940 lines, inside the issue's 700–1000.

## AMENDMENTS

- 2026-09-28: de-risking pass. Q1 and Q2 decided by the user (both as recommended). Three spikes recorded as observed: the property-test cost (2.78 s for H=200), the exact existing tests the xp append breaks (`event.test.ts:45`, `server.test.ts:310`/`:318`), and a local complexity check (Level 1b). `bun install` was run in the worktree, and the baseline `bun run check` passed: 245 pass, 0 fail.
- 2026-09-28: implementation. Folded in from `.claude/reports/t5-flow-report.md` Deviations 1–6: property 1 also accepts any re-test from rung 0 (Q8); the property seeds run as four batches of 50; `dayRoute` is shared by `/api/case` and `/api/next`; boss tests add the no-generator fallback and a "more than one topic change" mixing check; `xpFor` uses `Object.hasOwn`.
