# Feature: T12 O2 Coach the noob: Dan's scripted wrong step

The following plan should be complete, but validate documentation and codebase patterns and task sanity before you start implementing. Pay special attention to the names of existing utils, types and models. Import from the right files.

Every `file:line` below was read from the source on branch `feature/t12-coach-dan` at `ab1ddd9` (`observed`, 2026-09-29). Every count is labelled `observed`, `derived` or `expected`.

## Feature Description

After the pupil has tried a topic, an AI classmate called Dan attempts a fresh-number question on it and goes wrong in one named way. The wrong step is chosen in code from the item's `misconceptions` bank; a model job only voices it in Dan's words. The pupil spots the error and types the right answer. The correction is an ordinary `attempt` event, a new `coach` event records whether the error was caught, and Dan's rank in state rises with the pupil's catches. With no model, Dan's attempt is a written line built from the bank. The page is `app/coach.html`.

## User Story

As a pupil who has just explained a method back
I want to catch a classmate's wrong step and put it right
So that I learn by teaching, and can see Dan rank up as I do

## Problem Statement

PRD O2: the protégé effect is largest for lower achievers at 13 to 14, and teaching beats preparing to teach. The known failure of an AI student is R8, competency bias: it solves too well. The error must therefore be scripted from content, never invented by the model, and the record must let E3 compute "scripted errors caught unaided".

## Solution Statement

- `src/jobs/dan_wrong_step.ts`: a pre-attempt job. Input is the branded `PreAttempt` view plus one `Misconception` chosen in code. Output is one to three lines of Dan's working that end in that wrong answer. Validation in code refuses a reply that does not reach the given wrong answer, so the model cannot substitute its own error. Fallback: a written line built from the bank.
- `src/flow/rank.ts` (leaf) and `src/flow/coach.ts` (pure): which topics Dan can try, which item (a generator roll with named wrong answers first, else an items-file item with misconceptions, else skipped), which misconception (deterministic from item id and seed), the correction marked in code, and the two event bodies to write.
- `src/api/coach.ts` + `src/server.ts`: `GET /api/coach` (list, or one topic's question side), `POST /api/coach` with `step: "dan"` (runs the job) or `step: "correct"` (marks, writes `attempt` then `coach`, returns the working).
- `src/events`: new `coach@1` event, reducer case, `State.coach = {shown, caught, rank}`, shape 4, and the `MCP_WRITABLE` row.
- `app/coach.html` + `app/coach.js`: the page. `app/chat.js` links to it after a saved teach-back.

### The guard, restated (CLAUDE.md "Restate the guard")

- The job's input type is `{ view: PreAttempt; topic: string; wrong: Misconception }`. `PreAttempt` is minted only by `jobItem` in `src/jobs/view.ts:31-40` when `hasAttempt` reads false, and a raw `Item` does not type-check as it. So `answers`, `working` and `mark_scheme` cannot reach the prompt by construction; `wrong.answer` and `wrong.message` (the bank's wrong answer and its note) are the only answer-side strings the prompt carries, exactly as the ticket's Guard line says.
- `step: "dan"` is refused with 409 once an `attempt` for the item (id and seed) exists, the same call-point rule as `CALL_POINT` in `src/flow/chat.ts:23-27`.
- `step: "correct"` marks on the server with the full item, appends the `attempt` event, and only then returns `working` and the misconception's note. The `GET` and the `dan` reply carry the item's question side only (`toItemView`, `src/content/pack.ts:97-100`), and a test asserts no `answers`, `working`, `mark_scheme` or `misconceptions` key in either.
- The reply guard's sources are stem, scaffold, hint, `wrong.answer` and `wrong.message`. The correct answer is not a source, so a reply that computes it is refused as `invented-number` unless that number already appears in the question.

## Out of Scope / Non-Goals

- Not included: Dan being right sometimes (Kai's one-in-four in O5). The ticket says one wrong step every time; the pupil's task is to find and fix it.
- Not included: XP for a catch. The correction is an `attempt` and earns the flat 10 (`src/flow/xp.ts:10-14`, R6). Dan's rank is a separate counter.
- Not included: a `session` start or end for `mode: "coach"`, or a map card for it. `app/map.js:95-102` keeps returning null for coach. The attempt counts the day in the flame.
- Not included: a shadow judge, a parent digest line, or squad sharing of catches (T15, T14).
- Not changing: `hint`, `guess_first`, `teachback_mark`, `defineJob`'s retry policy, the chat panel's forms, `dayRoute`.
- Not changing: content. The 105 items (`observed`, 21 files of 5) already carry 2 or 3 misconceptions each; no item is edited.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: `src/jobs`, `src/flow`, `src/api`, `src/events`, `src/mcp/tools.ts`, `src/marking`, `app/`, `scripts/fake-provider.ts`
**Dependencies**: none new. Bun, TypeScript, Biome, happy-dom (all present).

## Related Work

**Implements**: [#14](https://github.com/linardsb/study-tutor/issues/14) · **Epic**: [#1](https://github.com/linardsb/study-tutor/issues/1) · `docs/prd/study-tutor-v2.architecture.md` D2, D3, D5

**Back-references**:

- `.claude/plans/t9-model-jobs.md` — the job framework, the brands, the guard, the chat route and page this plan mirrors. Q2 there (no model → no teach-back event) shapes this plan's Q1.
- `.claude/plans/t7-detective-case.md` — the misconception pick, `ROLLS`, `hash`, `lcg`, the pure-flow-plus-day-route shape.
- `.claude/plans/t2-events-append-replay.md` — new event = union + parser row + `KEYS` + reducer + fixture + test.

**Parallel work**: T13 (#15) and T14 (#16) are planned in their own worktrees at the same time. Either may bump `State.shape` too; Task 19 handles the merge.

**Forward-references**:

- (none yet)

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `src/jobs/define.ts` (23-34 `preAttemptSystem` and `postAttemptSystem`; 36-58 `Verdict`, `JobDeps`, `JobSpec`; 61-66 retry table; 128-135 `textReply`) — Why: the job contract. Task 1 adds an optional voice argument to `preAttemptSystem`.
- `src/jobs/define.test.ts` (230-231) — Why: the only assertions on the system message; they check containment of the guard line, nothing else (`observed`).
- `src/jobs/view.ts` (12-15 brands; 18-28 `hasAttempt`; 31-40 `jobItem`) — Why: the only producer of `PreAttempt`.
- `src/jobs/guard.ts` (14-20 `numbersIn`; 23-34 `guardReply`) — Why: the invented-number rule decides what goes in `sources`; `numbersIn` is reused to check the wrong answer is reached.
- `src/jobs/hint.ts` (20-27 prompt with named fields; 29-42 the spec) — Why: the pre-attempt job shape to mirror.
- `src/jobs/teachback_mark.ts` (19-20 task text; 41-54 array validation; 60-67 `texts`/`sources` note) — Why: array-shaped output validation to mirror.
- `src/jobs/__fixtures__/provider.ts` (24-43 `withData`; 50-59 `mockFetch`; 62-73 `chatReply`, `down`; 80-101 `sentinelItem`, `SENTINELS`; 104-118 `attemptLine`) — Why: every job and route test uses these.
- `src/jobs/hint.test.ts` (whole file) — Why: the five mocked tests every job ships, and the sentinel prompt test at 99-115.
- `src/flow/chat.ts` (32-69 `findItem`; 91-100 `taughtOn`; 103-155 `chat`) — Why: `findItem` builds the generated item this plan uses; `chat` is the pure-flow shape.
- `src/flow/detective.ts` (19 `ROLLS`; 43-50 `hash`; 63-67 `eligible`; 231-269 `buildReask`) — Why: the generator roll with named wrong answers, and the fallback to the next eligible item.
- `src/flow/ladder.ts` — Why: a flow module with no imports, the shape `rank.ts` copies (`observed`: no import lines).
- `src/api/chat.ts` (32-45 `resolveItem`; 47-48 `titleOf`; 51-78 `getChat`; 81-135 `postChat`, esp. 114-122 the re-check before the append) — Why: the route shape, the 409 refusals, and the ordering argument.
- `src/api/chat.test.ts` (19 `ANSWER_KEYS`; 22-60 the 400 table; 236-260 the mid-request second-tab test) — Why: the three test shapes Task 10 mirrors.
- `src/api/event.ts` (55-87 `postEvent`) — Why: both coach writes go through it; it appends the xp line after the attempt.
- `src/api/case.ts` (20-36 `loadCasePack`; 55-73 `caseForDay`) — Why: pack loading and a day-keyed read.
- `src/api/state.ts` (5-12 `currentState`) — Why: state read for `shown` and `rank`.
- `src/events/types.ts` (1-13 `EVENT_TYPES`; 79-88 `CaseV1`; 90-104 union and `NewEvent`; 140-186 `FIELDS`; 190-206 `KEYS` and the completeness check) — Why: the four places a new event touches.
- `src/mcp/tools.ts` (34-45 `MCP_WRITABLE: Record<EventType, boolean>`) — Why: exhaustive over `EventType`; `tsc` fails without a `coach` row.
- `src/events/replay.ts` (30-54 `State`, shape at 37; 74-174 `CASES`; 180-196 the initial state) — Why: reducer case and the new key.
- `src/events/replay.test.ts` (30-66 six-week assertions incl. `shape` at 57; 67-78 the no-answer guard; 115-130 fixture per key; 132-173 the case reducer test) — Why: the tests to extend and mirror.
- `src/events/types.test.ts` (8-30) — Why: a fixture file per `type@v` is enforced.
- `src/events/check.ts` (15-21 `Stored`) — Why: the compatibility contract; unchanged by shape 4.
- `src/providers/openai-compatible.ts` (3: `import { replay } from "../events/replay"`) — Why: the value import that makes `replay.ts → flow/coach.ts` a cycle; Task 7a avoids it.
- `src/marking/normalise.ts` (2-19) — Why: the server-side normaliser the correction mark uses.
- `src/marking/quiz.test.ts` (1-35) and `src/marking/case.test.ts` (1-30) — Why: how a browser file is loaded under Bun through a global.
- `src/marking/retest.test.ts` (198-225; the regex on 221) — Why: the POST allowlist every page must satisfy; Task 12 widens it.
- `src/server.ts` (130-149 `dayRoute`; 179-193 `readRoute`; 214-259 chat routes incl. `server.timeout(req, 0)` at 244; 262-308 `apiRoutes`) — Why: route registration and the long-job idle rule.
- `src/server.test.ts` (38 `withServer`; 369-386 the key-leak walk over `apiRoutes`; 628 `postJson`; 659-720 chat end to end with `startFakeProvider` and the `custom` preset config at 663-671) — Why: the walk covers the new route automatically; the e2e test is the pattern for Task 14.
- `scripts/fake-provider.ts` (10-20 `contentFor`) — Why: Task 13 adds a Dan branch.
- `app/quiz.js` (51-60 `mark`; 63-76 `itemFromGenerated`; 78-85 `chatHref`; 90-108 `postAttempt`) — Why: the mark to port and the id/seed conventions.
- `app/chat.html` (21 the AI note; 33-58 the panel) and `app/chat.js` (12-23 `say`; 33-49 `show`; 67-97 `reply`; 99-137 `send`) — Why: the page and script to mirror; Task 16 adds the coach link in `reply`.
- `app/case.js` (72-80 `postEvent`; tail: the `detective` global) — Why: the global-export pattern for page unit tests.
- `src/content/types.ts` (29-33 `Misconception`; 35-50 `Item`; 53-56 `ItemView`; 75-80 `CasePack`).
- `.claude/references/events.md` (12 the type list; 22 routes; 33 state keys) and `.claude/references/model-jobs.md` (20-22) — Why: Task 17 updates both.
- `.claude/rules/content.md` — Why: every pupil-facing string below must pass it (register, no exclamation marks, no answer before an attempt).

### New Files to Create

- `src/jobs/dan_wrong_step.ts` — the job.
- `src/jobs/dan_wrong_step.test.ts` — mocked tests.
- `src/flow/rank.ts` — `RANKS`, `PER_RANK`, `rankFor`, `rank`; no imports.
- `src/flow/coach.ts` — pure coach flow.
- `src/flow/coach.test.ts` — including the R8 property test.
- `src/api/coach.ts` — the route handlers.
- `src/api/coach.test.ts` — route tests.
- `src/marking/answer.ts` — `markAnswer`, the server port of `quiz.mark`.
- `src/marking/answer.test.ts` — agreement with `quiz.mark`.
- `src/marking/coach.test.ts` — page helper tests.
- `src/events/__fixtures__/coach.v1.jsonl` — fixture.
- `app/coach.html`, `app/coach.js` — the page.

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- `.claude/references/model-jobs.md` — retry table, the brand rule, "Every job ships a test with the provider mocked for: valid output, invalid JSON twice, provider down".
- `.claude/references/events.md` — the five places a new event touches; state shape rules; the page-writes-nothing rule.
- `.claude/references/content-pack.md` line 24 — "`misconceptions` are per item and are the only source for O2's scripted wrong steps".
- `docs/prd/study-tutor-v2.prd.md` O2 (121-126), R8 (195), E3 (242-243).
- `docs/prd/study-tutor-v2.architecture.md` D5 (99-108).
- No external library is added, so no external docs.

### Patterns to Follow

**Pure flow, route reads the clock once.** `src/flow/chat.ts:1-4` and `src/flow/detective.ts:1-5`: no clock, no file, no `Math.random` in `src/flow`; the route passes `day` and the log lines in.

**Named fields into a prompt, never a spread.** `src/jobs/hint.ts:19-27`: build the user message from `view.stem`, `view.scaffold`, `view.hint` by name.

**Array output validated in code, exact shape.** `src/jobs/teachback_mark.ts:41-54`.

**Refusal before any job runs, re-check before the append.** `src/api/chat.ts:110-122`.

**New event.** `src/events/types.ts`: union member → `EVENT_TYPES` → `FIELDS` row → `KEYS` row → `MCP_WRITABLE` row (`tsc` fails until all five agree) → reducer case in `replay.ts` → fixture → test.

**Page.** Untrusted text through `textContent` only (`app/chat.js:1-2`); the figure through `DOMParser` (`app/chat.js:36-41`); every POST a literal `fetch("/api/…", {` with `method: "POST"` within 120 characters so `retest.test.ts:214-216` sees it; pure helpers on a global for unit tests (`app/case.js` tail).

**Naming.** Files snake_case for jobs (`teachback_mark.ts`), kebab elsewhere; event fields lower camel (`caught`); constants UPPER (`ROLLS`, `MAX_LINES`).

**Lint.** Biome recommended preset (`biome.json`). `noNonNullAssertion` is in it: use `as string` after a bounds check as `detective.ts:100` does, never `!`. `tsc --noEmit` runs with no `dom` lib for `src/` (`src/marking/dom.ts:1-5`), so page tests type the DOM by hand.

---

## IMPLEMENTATION PLAN

### Phase A: event and state

Tasks 2, 2b, 3, 4, 7a. `coach@1`, the `MCP_WRITABLE` row, the reducer, `State.coach`, shape 4, fixture and tests. Task 7a (`rank.ts`) belongs here because the reducer imports it.

### Phase B: the job

**Independent of:** Phase A (the job never touches events).
Tasks 1, 5, 6.

### Phase C: flow and marking

**Depends on:** A (the `NewEvent` body) and B (the job).
Tasks 7, 8, 9.

### Phase D: route, server, fake provider

**Depends on:** C.
Tasks 10, 11, 13, 14.

### Phase E: page and links

**Depends on:** D for manual checks; the page's pure helpers can be written alongside D.
Tasks 12, 15, 15b, 16.

### Phase F: docs, merge safety, the gate

Tasks 17, 18, 19.

---

## STEP-BY-STEP TASKS

### Task 1. UPDATE `src/jobs/define.ts`: a voice argument for `preAttemptSystem`

- **IMPLEMENT**: `export function preAttemptSystem(task: string, voice = VOICE): Message` and `content: [voice, PRE_ATTEMPT_GUARD, task, NUM, ONE].join("\n")`. `VOICE` stays private. `postAttemptSystem` unchanged.
- **PATTERN**: `src/jobs/define.ts:24-29`.
- **GOTCHA**: the guard line stays unconditional and second. Dan is a classmate, not the tutor, so the persona must replace `VOICE`'s "You are a maths tutor… Speak to the pupil as 'you'"; two conflicting persona lines in one system message is the kind of prompt a 3B model follows half of (T9 Q8).
- **VALIDATE**: `bun test src/jobs`. `define.test.ts:230-231` checks only that `preAttemptSystem("x").content` contains `PRE_ATTEMPT_GUARD` and the post variant does not (`observed`), so the new argument breaks nothing. Add two lines next to 230: `expect(preAttemptSystem("x", "As Dan.").content).toContain(PRE_ATTEMPT_GUARD)` and `expect(preAttemptSystem("x", "As Dan.").content).not.toContain("maths tutor")`.
- **SATISFIES**: the ticket's Guard line.

### Task 2. UPDATE `src/events/types.ts`: `coach@1`

- **IMPLEMENT**:
  ```ts
  export type CoachV1 = Line<"coach", 1> & {
    topic: string;
    item: string;
    seed?: number; // the generator seed when the item is `#gen`
    wrong: string; // the bank's wrong answer Dan reached (never the correct one)
    caught: boolean; // the pupil's correction was right
  };
  ```
  Add `"coach"` to `EVENT_TYPES`, `CoachV1` to `Event`, the row `"coach@1": (o) => str(o.topic) && str(o.item) && optInt(o.seed) && str(o.wrong) && bool(o.caught)` to `FIELDS`, and `"coach@1": ["topic", "item", "seed", "wrong", "caught"]` to `KEYS`.
- **PATTERN**: `CaseV1` at `src/events/types.ts:79-88`, `FIELDS` row 177-185, `KEYS` row 200.
- **GOTCHA**: `KEYS` is `satisfies`-checked and the `_complete` line (203-206) fails `tsc` on a missing field; that is the intended signal, not an error to work around. `optInt` (114) accepts undefined or an integer ≥ 0, which is what a seed needs.
- **VALIDATE**: `bunx tsc --noEmit` (fails until Tasks 2b and 3 exist, then green).
- **SATISFIES**: AC4.

### Task 2b. UPDATE `src/mcp/tools.ts`: the `MCP_WRITABLE` row

- **IMPLEMENT**: after line 44 add `coach: false, // the server marks the correction and writes it with its attempt (T12)`.
- **PATTERN**: `src/mcp/tools.ts:34-45`; the `case` row at 44 has the same comment shape.
- **GOTCHA**: `MCP_WRITABLE` is `Record<EventType, boolean>` (`observed`), so Task 2 alone fails `tsc` here. A harness may write a `coach` line through `write_event` only if this is `true`; it must stay `false`, since the correction is marked by the server.
- **VALIDATE**: `bunx tsc --noEmit && bun test src/mcp`. `src/mcp/tools.test.ts` pins no list of writable or refused types (`observed` at implementation: `grep case` empty), so nothing is added there.
- **SATISFIES**: CLAUDE.md "Events are the record".

### Task 3. UPDATE `src/events/replay.ts`: `State.coach`, shape 4, the reducer case

- **IMPLEMENT**: `coach: { shown: number; caught: number; rank: number }` in `State` (comment: `// O2: wrong steps shown, caught, and Dan's rank from rankFor`), `shape: 4` at 37 and in `replay`'s initial state (181), `coach: { shown: 0, caught: 0, rank: 0 }` in the initial state. Reducer:
  ```ts
  "coach@1": (s, e) => {
    topic(s, e.topic);
    s.coach.shown += 1;
    if (e.caught) s.coach.caught += 1;
    s.coach.rank = rankFor(s.coach.caught);
  },
  ```
  `rankFor` is imported from `../flow/rank` (Task 7a, a leaf module with no imports, like `../flow/ladder` which replay already imports at 2-8).
- **PATTERN**: `"case@1"` at `src/events/replay.ts:153-173`.
- **GOTCHA**: do not import from `../flow/coach` here. `coach.ts` imports `./chat` → `../jobs/define` → `../providers/openai-compatible`, which imports `replay` as a value (`src/providers/openai-compatible.ts:3`, `observed`). `replay.ts → coach.ts` would close that cycle. `rank.ts` has no imports, so the graph stays a tree.
- **GOTCHA**: no `work(s, e.t)` here. The attempt written just before the coach line already counts the day; counting twice is harmless but says the wrong thing in a review. `src/events/check.ts:15-21` reads only `lines`, `topics[].rung`, `xp.total` and `hash`, so shape 4 needs no change there (`observed`).
- **VALIDATE**: `bun test src/events` after Task 4.
- **SATISFIES**: AC5.

### Task 4. CREATE `src/events/__fixtures__/coach.v1.jsonl`; UPDATE `src/events/replay.test.ts`

- **IMPLEMENT**: two fixture lines, one caught on a generated item with a seed, one not caught on an items-file item:
  ```
  {"v":1,"t":"2026-10-07T17:02:00Z","type":"coach","topic":"1MA1/R9/of-an-amount","item":"1MA1/R9/of-an-amount#gen","seed":8812,"wrong":"4.5","caught":true}
  {"v":1,"t":"2026-10-07T17:06:00Z","type":"coach","topic":"1MA1/R9/of-an-amount","item":"1MA1/R9/of-an-amount#2","wrong":"36","caught":false}
  ```
  Tests: (a) `expect(s.shape).toBe(4)` at 57 and `expect(s.coach).toEqual({ shown: 0, caught: 0, rank: 0 })` in the six-week test; (b) a new test "coach: shown and caught count, rank follows rankFor, an unreadable line changes nothing": replay 7 caught lines, 2 missed and one line with `"caught":"yes"` → `{ shown: 9, caught: 7, rank: 2 }` (`derived`: `floor(7 / 3) = 2` with `PER_RANK = 3`) and `skipped: 1`; (c) extend the guard test at 67-78 with `'"message"'` so a misconception note never enters state.
- **PATTERN**: `src/events/replay.test.ts:132-173`.
- **VALIDATE**: `bun test src/events` → the fixture-per-key tests in `types.test.ts:8-30` and `replay.test.ts:115` pass for `coach@1`.
- **SATISFIES**: AC4; CLAUDE.md "Replay has a test per event version".

### Task 5. CREATE `src/jobs/dan_wrong_step.ts`

- **IMPLEMENT**:
  ```ts
  export type DanInput = { view: PreAttempt; topic: string; wrong: Misconception };
  export type DanOutput = { lines: string[] };
  export const MAX_DAN_LINES = 3;   // expected: one working line per step, three steps at most
  const MAX_LINE = 160;             // mirrors MAX_NOTE, teachback_mark.ts:17
  export const DAN_VOICE =
    "You are Dan, a pupil in the same maths class as the reader, at GCSE Foundation. Write as Dan, in the first person, working through the question aloud. Plain words, short sentences, British English, sentence case. No emoji, no exclamation marks, never a grade or a prediction.";
  const TASK =
    'Work through the question in one to three short lines and arrive at exactly the answer given below, by making the mistake described below. Do not say it is a mistake, do not correct it, and do not repeat the note. The last line ends with your answer. Reply with JSON only: {"lines": ["<line>", "<line>"]}';
  ```
  `prompt({ view, topic, wrong })`: `preAttemptSystem(TASK, DAN_VOICE)` and a user message of `Topic: …`, `Question: ${view.stem}`, `Given: ${view.scaffold}` when present, `The answer you reach: ${wrong.answer}`, `The mistake you make (do not repeat these words): ${wrong.message}`. Named fields only.
  `validate(value, { wrong })`: object with `lines` an array of 1 to `MAX_DAN_LINES` strings, each trimmed to 1..160 chars; `reaches(lines, wrong.answer)` must be true; the joined lines must not contain `wrong.message` (case-insensitive, whitespace-collapsed). Else null.
  `export function reaches(lines: readonly string[], answer: string): boolean`: the numbers of `answer` (`numbersIn`, `guard.ts:14`) are all in `numbersIn(lines.join(" "))`; when `answer` has no number, `normaliseAnswer(lines.join(" ")).includes(normaliseAnswer(answer))` (`src/marking/normalise.ts`).
  `texts: (o) => o.lines`; `sources: ({ view, wrong }) => [view.stem, view.scaffold ?? "", view.hint ?? "", wrong.answer, wrong.message]`.
  `fallback: ({ view, wrong }) => ({ lines: [...(view.scaffold ? [view.scaffold] : []), `I get ${wrong.answer}.`] })` — always a value.
  `export const danWrongStep = defineJob<DanInput, DanOutput>({ name: "dan_wrong_step", … })`.
- **PATTERN**: `src/jobs/hint.ts:29-42`, `src/jobs/teachback_mark.ts:37-54`.
- **GOTCHA**: `sources` must include `wrong.message`: the note often names a sub-step number ("That is 10% of 45") and a reply that echoes it in Dan's own words would otherwise be an `invented-number` refusal. The note never states the right answer (PR #25 fixed content to that rule; `.claude/rules/content.md` line 14), so this widens nothing that matters. A misconception whose `answer` is not a number (a ratio "3:4", a text answer) takes the string branch of `reaches`.
- **GOTCHA**: the `wrong.message` verbatim check is cheap and weak; a paraphrase passes. The prompt line "do not repeat the note" and the R8 test in Task 6 are the real defence; say so in a comment.
- **GOTCHA**: `validate` runs before `guardReply` in `define.ts:84-87`, so a reply that reaches the wrong number is `shape`, and only a reply that reaches it but adds a new number is `guard`. Task 6 relies on that order.
- **VALIDATE**: `bunx tsc --noEmit && bun test src/jobs/dan_wrong_step.test.ts` after Task 6.
- **SATISFIES**: AC1; the Guard line.

### Task 6. CREATE `src/jobs/dan_wrong_step.test.ts`

- **IMPLEMENT**: `input()` builds `jobItem([], sentinelItem({ misconceptions: [{ answer: "4.5", message: "SENTINEL-MESSAGE" }] }))` and takes `wrong = item.misconceptions[0]`; a second helper uses the unmodified `sentinelItem()` (`wrong` = `{ answer: "SENTINEL-WRONG", message: "SENTINEL-MESSAGE" }`) for the prompt test. Tests:
  1. valid reply `{"lines":["10% of 45 is 4.5.","So 20% of 45 is 4.5."]}` → `{ by: "model", value: { lines: [...] } }`.
  2. **R8: a reply that reaches a different answer is refused as `shape`, retried, then the fallback**: reply `{"lines":["I get 45."]}` (45 is in the stem, so the guard would pass it; only `reaches` refuses it). `expect(v).toEqual({ by: "fallback", value: { lines: ["10% of 45 = 4.5.", "I get 4.5."] }, reason: "shape" })` and `calls.length === 2`. This is the test the ticket asks for: the wrong step always comes from the bank, because a reply that does not land on the bank's answer never becomes a verdict.
  3. invalid JSON twice → fallback, `reason: "not-json"`, 2 calls.
  4. provider down → fallback, `reason: "network"`, 1 call.
  5. preset none → fallback, `reason: "no-model"`, 0 calls.
  6. a fourth line, an empty line, a 161-char line → `shape` each (three `mockFetch` runs, or one run per case).
  7. the note echoed verbatim (`["I get 4.5. SENTINEL-MESSAGE"]`) → `shape`.
  8. an invented number (`["I get 4.5, so 6.3 next."]`) → `guard` (6.3 is in no source: stem `20, 45`, scaffold `10, 45, 4.5`, hint `20, 10`, answer `4.5`, note none; `derived` from `sentinelItem`).
  9. prompt test with the plain sentinel item: `sent` contains `"SENTINEL-WRONG"` and `"SENTINEL-MESSAGE"`, contains none of `"SENTINEL-ANSWER-731"`, `"SENTINEL-WORKING"`, `"SENTINEL-SCHEME"`; `messages[0].content` contains `PRE_ATTEMPT_GUARD` and `DAN_VOICE` and not `"maths tutor"`.
  10. `reaches`: `["3 : 4 is the ratio"]` reaches `"3:4"`; `["I get 4.5"]` reaches `"4.5"`; `["I get 45"]` does not reach `"4.5"`; `["I get 1,200"]` reaches `"1200"`.
- **PATTERN**: `src/jobs/hint.test.ts` whole file; `spyOn(console, "error")` around refusals.
- **VALIDATE**: `bun test src/jobs/dan_wrong_step.test.ts` → 10 passing.
- **SATISFIES**: AC1, AC3.

### Task 7a. CREATE `src/flow/rank.ts` (leaf: no imports)

- **IMPLEMENT**:
  ```ts
  /** Dan's rank (O2), pure and import-free so replay and the coach flow can both read it. */
  export const RANKS = ["Noob", "Learner", "Getting there", "Steady", "Sorted"] as const; // pupil-facing, .claude/rules/content.md
  export const PER_RANK = 3; // expected: catches per rank; E3 reads the rate, not this
  export type Rank = { level: number; name: string; toNext: number | null }; // toNext null at the top
  export const rankFor = (caught: number): number =>
    Math.min(RANKS.length - 1, Math.floor(caught / PER_RANK));
  export function rank(caught: number): Rank {
    const level = rankFor(caught);
    const top = level === RANKS.length - 1;
    return { level, name: RANKS[level] as string, toNext: top ? null : (level + 1) * PER_RANK - caught };
  }
  ```
- **PATTERN**: `src/flow/ladder.ts` (no imports, `observed`).
- **VALIDATE**: `bunx tsc --noEmit` (Task 3 compiles once this exists).
- **SATISFIES**: AC5.

### Task 7. CREATE `src/flow/coach.ts`

- **IMPLEMENT** (pure: no clock, no file, no `Math.random`, no model call of its own; `export { rank, rankFor, RANKS, PER_RANK } from "./rank"` so callers import one module):
  ```ts
  export const DAN = "Dan";
  const ROLLS = 8;            // as detective.ts:19
  /** Topics the pupil has tried: an attempt event on the topic exists (Q1). Pack order. */
  export function triedTopics(log: readonly string[], pack: CasePack): Topic[]
  export function hasTried(log: readonly string[], topic: string): boolean
  /** The item Dan tries: a generator roll with at least one named wrong answer (seed = hash(`${base}:${k}`), k < ROLLS, via findItem), else the items-file item with misconceptions at hash(base) % n, else null. */
  export function pickItem(pack: CasePack, topic: string, base: string): (Item & { seed?: number }) | null
  /** The misconception Dan voices: index floor(rng * n) with rng = lcg(hash(`${item.id}:${item.seed ?? ""}:dan`)); null when the bank is empty. The same item and seed always give the same step, so the POST rebuilds it without a field from the page. */
  export function chooseWrong(item: Pick<Item, "id" | "misconceptions"> & { seed?: number }): Misconception | null
  export type DanReply =
    | { kind: "dan"; lines: string[]; by: "model" | "fallback" }
    | { kind: "refused"; reason: "already-answered" | "try-first" }
    | { kind: "skipped" }; // no misconception on this item
  export async function danStep(item: Item & { seed?: number }, topic: string, log: readonly string[], deps: JobDeps): Promise<DanReply>
  export type Correction =
    | { kind: "refused"; reason: "already-answered" | "try-first" }
    | { kind: "skipped" }
    | { kind: "marked"; correct: boolean; caught: boolean; named: string | null; wrong: Misconception; attempt: NewEvent; record: NewEvent };
  export function correction(item: Item & { seed?: number }, typed: string, sure: boolean, log: readonly string[]): Correction
  ```
  `danStep`: `hasTried(log, item.topic)` false → `try-first`; `jobItem(log, item)` attempted → `already-answered`; `chooseWrong` null → `skipped`; else `danWrongStep.run({ view, topic, wrong }, deps)` → `{ kind: "dan", lines: v.value?.lines ?? [], by: v.by }` (the fallback always has a value; the null arm is the type's, as `chat.ts:121`).
  `correction`: the same two refusals; `chooseWrong` null → `skipped`; `markAnswer(item, typed)` (Task 8); `caught = ok`; `attempt = { v: 1, type: "attempt", item: item.id, topic: item.topic, correct: ok, sure, answer: typed, ...(seed) }`; `record = { v: 1, type: "coach", topic: item.topic, item: item.id, ...(seed), wrong: wrong.answer, caught }`.
  Imports: `hash` from `./detective`, `lcg` from `../content/generators`, `findItem` from `./chat`, `jobItem` from `../jobs/view`, `parseEvent` from `../events/types`, `markAnswer` from `../marking/answer`.
- **PATTERN**: `src/flow/detective.ts:231-269` (roll then fall back to an items-file item), `src/flow/chat.ts:103-155`.
- **GOTCHA**: `findItem` refuses a seed above `0xffffffff` (`chat.ts:43-50`); `hash` returns a 32-bit unsigned (`detective.ts:43-50`), so every seed it makes is accepted. Generated ids all share `${topic}#gen`; `hasAttempt` matches on seed too (`view.ts:17-28`), so a new roll is never "already answered" by an older one.
- **GOTCHA**: "caught" is the first correction being right. The page offers no hint, so it is also "unaided" (PRD O2 signal). Sure or Not sure is asked because `attempt@1` requires `sure` and calibration (D7) reads it; it does not change `caught`.
- **VALIDATE**: `bunx tsc --noEmit && bun test src/flow/coach.test.ts` after Task 9.
- **SATISFIES**: AC1, AC2.

### Task 8. CREATE `src/marking/answer.ts` + `src/marking/answer.test.ts`

- **IMPLEMENT**: `export function markAnswer(item: Pick<Item, "answers" | "misconceptions">, typed: string): { ok: boolean; named: string | null }`, the server port of `quiz.mark` (`app/quiz.js:51-60`): `ok` when some `answers` entry normalises to the typed value; `named` is the message of the misconception whose `answer` normalises to it, else null. `answers` undefined → `ok: false`. Test: load `app/quiz.js` as `src/marking/quiz.test.ts:32-35` does and assert `markAnswer(item, s)` equals `quiz.mark(item, s)` over 12 rows (right forms, a named wrong, an unnamed wrong, "£9", " 9.0 ", "4,5").
- **PATTERN**: `src/marking/normalise.ts` and its test.
- **GOTCHA**: `content-pack.md` line 21 says a `cloze` item is marked by `src/marking/<type>.ts`; none exists yet (`observed`: `src/marking/` holds `normalise.ts` only). `answer.ts` is the shared primitive, not a per-type marker; keep it 15 lines.
- **VALIDATE**: `bun test src/marking/answer.test.ts`.
- **SATISFIES**: AC "the pupil catches and corrects" (marked in code, CLAUDE.md "no model decides a numeric answer").

### Task 9. CREATE `src/flow/coach.test.ts`

- **IMPLEMENT** with `loadCasePack("maths")` (real pack) and the provider fixtures:
  1. **R8 property**: for every item of every topic (`observed` 105) and for 50 seeds per topic through `findItem(pack, `${t.id}#gen`, seed)` (`derived`: 21 × 50 = 1,050 rolls), `chooseWrong(x)` is `null` when `x.misconceptions.length === 0` and otherwise `toEqual` one entry of `x.misconceptions`; calling it twice gives the same entry.
  2. `pickItem`: on the real pack returns a `#gen` item with a seed and at least one misconception; with `{ ...pack, gens: {} }` returns an items-file item with misconceptions; with `gens: {}` and every item's `misconceptions: []` returns null (the skip AC); the same `base` always gives the same item; 5 bases give at least 2 distinct stems (`expected`).
  3. `triedTopics` / `hasTried`: empty log → none; after `attemptLine(item)` → that topic only, in pack order.
  4. `danStep`: before any attempt on the topic → `try-first`, 0 calls; after an attempt on this very item and seed → `already-answered`, 0 calls; on an item with `misconceptions: []` → `skipped`; no model → `by: "fallback"` and `lines` join contains `wrong.answer`; mocked valid reply → `by: "model"`.
  5. `correction`: right answer → `caught: true`, `attempt.correct` true, `record.wrong` is the chosen misconception's answer, `record.caught` true, `seed` present on a `#gen` item and absent on an items-file item; the named wrong answer → `caught: false`, `named` is its message; already answered → refused; both bodies pass `parseEvent` once stamped (append them through `appendEvent` in a temp dir and read back).
  6. `rankFor` / `rank`: 0 → 0 "Noob", 2 → 0, 3 → 1, 12 → 4 "Sorted" with `toNext: null`, 4 → `toNext: 2` (`derived`: 6 − 4).
- **PATTERN**: `src/flow/chat.test.ts:1-35` set-up; `src/flow/properties.test.ts` for the property style.
- **VALIDATE**: `bun test src/flow/coach.test.ts`.
- **SATISFIES**: AC1, AC2, AC5.

### Task 10. CREATE `src/api/coach.ts` + `src/api/coach.test.ts`

- **IMPLEMENT**:
  - Export `resolveItem` and `titleOf` from `src/api/chat.ts` (add `export` to 32 and 47; nothing else changes there).
  - `getCoach(dataDir, pack, day, params)` returns a body only (it is called through `dayRoute`, which always answers 200; a thrown read is its 500): no `topic` → `{ rank, shown, caught, topics: [{ id, title }] }` from `currentState(dataDir).coach` and `triedTopics(readLines(dataDir), pack)`. With `topic`: unknown id → `{ ready: false, reason: "no-topic" }`; not tried → `{ ready: false, reason: "try-first", title }`; `pickItem(pack, topic, `${day}:${topic}:coach:${state.coach.shown}`)` null → `{ ready: false, reason: "no-item", title }`; else `{ ready: true, topic, title, item: view.id, seed?, stem, figure?, scaffold?, rank, model }` built from `toItemView` by name (as `getChat`, `chat.ts:61-76`). `rank` is `rank(state.coach.caught)` everywhere it appears.
  - `postCoach(body, dataDir, pack, deps)`: body an object; `step` one of `dan`, `correct` (400 otherwise); `resolveItem`; for `correct`: `answer` a string of 1..200 chars after trim, `sure` a boolean. `dan` → `danStep` → 409 for a refusal (`REFUSED` map: `try-first` "Try a question on this topic first.", `already-answered` "You have answered this one. Ask for another."), 404 `{ error: "Dan has no wrong step for this question" }` for `skipped`, else 200 `{ kind: "dan", lines, by }`. `correct` → `correction(...)` → the same refusals; else `postEvent(attempt)` then, only when that returned 201, `postEvent(record)`; response 200 `{ kind: "marked", correct, caught, named, note: wrong.message, working: item.working ?? null, rank: rank(currentState(dataDir).coach.caught), saved: <both 201> }`. Log a failed second append with `console.error` as `chat.ts:121-122` does.
  - Tests (`withData`, real pack): 400 shapes (no step, bad step, no answer, `sure` missing, answer 201 chars, `#gen` without seed), 404 unknown item, 409 before an attempt on the topic, 409 after the correction, GET list empty then one topic after an attempt, GET topic `ready: false` (`no-topic`, then `try-first`) then `ready: true` with no `answers`/`working`/`mark_scheme`/`misconceptions` key (the `ANSWER_KEYS` check from `src/api/chat.test.ts:19`), the `dan` reply body has none of those keys either, `correct` writes `attempt`, `xp` (10), `coach` in that order (exactly three lines) and the response carries `working` and `note`, a second `correct` for the same item and seed is 409 and adds no line, `rank` in the response reflects the new state. Two-tab test, mirroring `src/api/chat.test.ts:236-260`: the mocked fetch for the `dan` step appends an `attempt` for the same item and seed while the job runs; the `dan` reply still returns 200 with lines and writes nothing, and the `correct` that follows is 409 with one `attempt` line in the log.
  - Not tested: `saved: false` from a failed second append. It needs the events file to become unwritable between two synchronous appends inside one call, which no test can arrange; the branch is four lines and mirrors `chat.ts:121-122` (`observed`: `chat.test.ts:258` reaches `saved: false` through the taught-today path, not a write failure). Say so in the report.
- **PATTERN**: `src/api/chat.ts` whole file; `src/api/chat.test.ts:22-60`.
- **GOTCHA**: ordering. `req.json()` is the only await before `postCoach` runs to completion for `correct`; `hasAttempt` (in `correction`) and both `appendEvent` calls are synchronous, so two tabs posting the same item and seed are handled one after the other and the second sees the first's attempt and gets 409. Worst case is not a double record; it is a `dan` request that finishes after the pupil answered in another tab, which the page renders harmlessly (Task 15). Write this argument as the comment above the writes, as `chat.ts:114-116` does.
- **GOTCHA**: `xpFor` (`src/flow/xp.ts:16-23`) returns null for `coach`, so the second `postEvent` appends no xp line.
- **VALIDATE**: `bun test src/api/coach.test.ts src/api/chat.test.ts`.
- **SATISFIES**: the Guard line; AC4, AC7.

### Task 11. UPDATE `src/server.ts`: `/api/coach`

- **IMPLEMENT**: extract the body of `postChatRoute` (232-259) into
  ```ts
  /** A POST that may run a model job: the idle cut is off (241-243), the body is JSON, the pack is loaded. */
  async function postJobRoute(
    req: Request,
    server: IdleControl,
    root: string,
    pack: CasePack | undefined,
    failed: string,
    handler: (body: unknown, pack: CasePack) => Promise<{ status: number; body: unknown }>,
  ): Promise<Response> {
    const refused = refuseForeign(req);
    if (refused) return refused;
    server.timeout(req, 0); // keep the three comment lines from 241-243 above this call
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json(400, { error: "Body is not JSON" });
    }
    try {
      const r = await handler(body, pack ?? (await loadCasePack("maths", root)));
      return json(r.status, r.body);
    } catch (err) {
      console.error(`${failed}: ${(err as Error).message}`);
      return json(500, { error: failed });
    }
  }
  ```
  `postChatRoute` becomes `postJobRoute(req, server, root, pack, "Could not answer the chat", (b, p) => postChat(b, dataDir, p, { dataDir }))`. Register:
  ```ts
  "/api/coach": {
    GET: (req: Request) =>
      dayRoute(req, root, pack, "Could not open the coach", (p, day) =>
        getCoach(dataDir, p, day, new URL(req.url).searchParams)),
    POST: (req: Request, server: IdleControl) =>
      postJobRoute(req, server, root, pack, "Could not answer Dan", (b, p) =>
        postCoach(b, dataDir, p, { dataDir })),
  },
  ```
  `dayRoute` (130-149) refuses foreign requests, validates `?day=`, loads the pack and calls `json(200, build(...))`; `getCoach` returns a body, so `dayRoute` is used as is and not changed.
- **PATTERN**: `src/server.ts:232-259` (the body being extracted), 262-308.
- **GOTCHA**: `server.timeout(req, 0)` is needed on the coach POST too: the `dan` step can take 240 s (`derived`: two tries at the provider's 120 s timeout, T9 Q7). The existing chat route tests (`server.test.ts:638-720`) pin the extraction.
- **VALIDATE**: `bun test src/server.test.ts` (the key-leak walk at 369-386 now covers `/api/coach`: the `{preset, key}` body is a 400 "step must be…" with no key echo).
- **SATISFIES**: CLAUDE.md "A new page → reading `/api/state` and posting events; no page writes files".

### Task 12. UPDATE `src/marking/retest.test.ts`: the POST allowlist

- **IMPLEMENT**: line 221 (`observed`) reads `expect({ p, ok: /:\/api\/(event|config|chat)$/.test(p) }).toEqual({`; make it `/:\/api\/(event|config|chat|coach)$/`. The title at 198 gains ", or /api/coach" and the comment at 219 gains a second line: `// /api/coach saves the attempt and the coach record the same way.`
- **PATTERN**: `src/marking/retest.test.ts:198-225`.
- **GOTCHA**: PR #38 F2 was this test failing after a merge because the base added the allowlist while the branch added the route. This branch is cut from the current `origin/main` (`ab1ddd9`), which already holds the allowlist, so the edit lands on the line that will be merged. Still run `bun run check` after any rebase (Task 19).
- **VALIDATE**: `bun test src/marking/retest.test.ts` after Task 15.
- **SATISFIES**: CLAUDE.md "Only `src/events` appends".

### Task 13. UPDATE `scripts/fake-provider.ts`: a Dan branch

- **IMPLEMENT**: in `contentFor`, before the hint default: if the system message includes `"You are Dan"`, read `/The answer you reach: (.+)/` from the user message and return `JSON.stringify({ lines: [`I get ${answer}.`] })`.
- **PATTERN**: `scripts/fake-provider.ts:10-20`.
- **VALIDATE**: `bun test src/server.test.ts` after Task 14.
- **SATISFIES**: enables Task 14 and Level 4 step 10.

### Task 14. UPDATE `src/server.test.ts`: coach end to end

- **IMPLEMENT**: one test mirroring 659-720 with `withServer` (38) and `postJson` (628): save the config the chat test saves at 663-671 (`{ preset: "custom", base_url: fake.url, model: "fake", key: "", cap: 50_000, weeklyTarget: 3 }`, `observed`) pointing at `startFakeProvider({ mode: "valid" })`; append an `attempt` on `1MA1/R9/of-an-amount#1` as 674-682 does; `GET /api/coach?topic=1MA1%2FR9%2Fof-an-amount` → `ready: true` and no `"answers"` in the text; `POST /api/coach {step:"dan", item, seed}` → `by: "model"` and the joined lines contain `chooseWrong(findItem(pack, item, seed))?.answer`; `POST {step:"correct", item, seed, answer: <findItem(...).answers[0]>, sure: true}` → `caught: true`, `saved: true`; the log's types end `usage`, `attempt`, `xp`, `coach`. A second test with `preset: "none"`: the `dan` step is `by: "fallback"` and no `usage` line is written.
- **PATTERN**: `src/server.test.ts:638-720`.
- **VALIDATE**: `bun test src/server.test.ts`.
- **SATISFIES**: AC6.

### Task 15. CREATE `app/coach.html` + `app/coach.js`

- **IMPLEMENT** `coach.html`: the same skeleton as `chat.html` (`lang="en-GB"`, `/style.css`, `main.lesson`, the sticky `.ai-note` at 21 word for word), crumb "Lessons · coach Dan", `h1#title`, `section#item` (stem, figure, scaffold as `chat.html:27-31`), `p.note#no-model` "No model is set up, so Dan's working is the built-in line.", `section#pick` (a `ul#topics` for the no-topic view and `p#rank`), `ol#log`, `form#correct-form` hidden: label "Dan has gone wrong somewhere. What should the answer be?", `input#answer` (`autocomplete="off"`), two radios `sure`/`notsure` labelled Sure and Not sure, button "Check", and `p#after` hidden with a `button#another` "Another question" (a `button type="button"`, not an `href="#"` link: Biome `useValidAnchor` refuses that) and a link "All topics" back to the topic list.
  `coach.js` (an IIFE that touches `document` only inside `load`, exports a global `coach` with the pure helpers):
  - `rankLine(rank)`: `Dan is ${rank.name}, rank ${rank.level + 1} of 5.` plus ` ${rank.toNext} more ${rank.toNext === 1 ? "catch" : "catches"} to the next rank.` when `toNext` is not null.
  - `resultLines(body)`: `["You caught it. Dan says thanks.", `Dan's mistake: ${body.note}`]` when `caught`; `["Not this time.", `Dan's mistake: ${body.note}`, body.named ? `Your answer: ${body.named}` : "Your answer was not right either. Read the working."]` when not; then `"Check it against the working:"`. Sentence case, no exclamation marks, nothing that predicts a grade.
  - `load()`: `?topic=` absent → `GET /api/coach` → list each topic as `<a href="/coach.html?topic=…">` (via `URLSearchParams`) and `rankLine`; empty list → "Try a question on a topic first. Then Dan can have a go." Present → `GET /api/coach?topic=` → `ready:false` → the reason as a sentence (`no-topic`: "No such topic."; `try-first`: "Try a question on this topic first."; `no-item`: "No question for Dan on this topic yet."); `ready:false` also hides `#another` and shows only "All topics" (a reload would only repeat the message); `ready:true` → render the question side (figure through `DOMParser` as `chat.js:36-41`), then `POST {step:"dan"}` at once and add each line as `Dan: <line>` through `textContent`; a 409 → say the error and reload after 1.5 s so it can be read; then unhide the form.
  - submit → `POST {step:"correct", item, seed, answer, sure}` → `resultLines`, the working as a `.working` paragraph, `rankLine(body.rank)`, "Not saved. Check the tutor window is still open." when `saved` is false, then `#after`. "Another question" is `location.reload()` (the server's `shown` count moved, so the next GET picks a new seed).
- **PATTERN**: `app/chat.js` whole file; `app/case.js` tail for the global.
- **GOTCHA**: both POSTs must be the literal `fetch("/api/coach", {` with `method: "POST"` within the next 120 characters, or the allowlist scan at `retest.test.ts:214-216` cannot see them (a template string or a variable path fails it, `observed` from the regex). No `innerHTML` anywhere but the figure (PR #38 F1 was a Sonar XSS flag on exactly that; use the `DOMParser` form). No storage API (`retest.test.ts:207-213`). `#gen` ids hold `#`, so build every URL with `URLSearchParams` (`quiz.js:78-85`).
- **VALIDATE**: `bun test src/marking/coach.test.ts src/marking/retest.test.ts`.
- **SATISFIES**: AC8.

### Task 15b. CREATE `src/marking/coach.test.ts`

- **IMPLEMENT**: load `app/coach.js` through its global as `case.test.ts:27-30` does; assert `rankLine` for a bottom, middle and top rank, and `resultLines` for caught, not caught with a named wrong, not caught unnamed. Assert no line holds `!` or an emoji through `guardReply(lines, lines)` from `src/jobs/guard.ts` (sources = texts so only the regex rules apply).
- **VALIDATE**: `bun test src/marking/coach.test.ts`.
- **SATISFIES**: `.claude/rules/content.md`.

### Task 16. UPDATE `app/chat.js`, `app/index.html`

- **IMPLEMENT**: `chat.js` `show` keeps `state.topic` in the closure; in `reply`, after a `marks` body with `saved`, append a paragraph with a link "Coach Dan on this topic" to `/coach.html?${new URLSearchParams({ topic })}`. `index.html` `#practice` gains `<p><a href="/coach.html">Coach Dan</a></p>` after "Today's case".
- **PATTERN**: `app/chat.js:67-97`; `app/index.html:16-20`.
- **GOTCHA**: no DOM test loads `chat.js` (`observed`: `src/marking/` has `map-dom` and `retest-dom` only), so nothing pins the log's children; `retest.test.ts:198-225` still scans it for storage and POST targets.
- **VALIDATE**: `bun test src/marking`.
- **SATISFIES**: the ticket's "after a teach-back" path.

### Task 17. UPDATE docs

- **IMPLEMENT**: `.claude/references/events.md`: add `coach` to the type list at 12 ("one of Dan's wrong steps and whether the pupil caught it"), the two `/api/coach` routes to 22, `coach` and shape 4 to 33. `.claude/references/model-jobs.md`: move `dan_wrong_step` from "Jobs planned" to a sentence under the retry paragraph ("`dan_wrong_step` takes `PreAttempt` plus one `Misconception` chosen in `src/flow/coach.ts`; validation refuses a reply that does not reach that wrong answer; `preAttemptSystem(task, voice)` lets it speak as Dan with the guard line kept"). `.claude/references/content-pack.md` is already right (line 24).
- **VALIDATE**: `grep -n "coach" .claude/references/events.md .claude/references/model-jobs.md` shows the three edits.
- **SATISFIES**: CLAUDE.md on-demand context table.

### Task 18. VALIDATE: the whole gate and the structural greps

- **VALIDATE**:
  ```bash
  bun run check
  grep -n "innerHTML" app/coach.js                          # expected: no match
  grep -n "answers\|working\|mark_scheme" src/jobs/dan_wrong_step.ts   # expected: only comment lines saying they are absent
  grep -n "from \"../flow/coach\"\|from \"./coach\"" src/events/replay.ts   # expected: no match (rank.ts only)
  grep -n "coach" src/marking/retest.test.ts src/mcp/tools.ts   # the allowlist row and the MCP_WRITABLE row
  ```
- **SATISFIES**: CLAUDE.md "Done = `bun run check` green".

### Task 19. Merge safety: rebase and the shape number

- **IMPLEMENT**: before `piv-create-pr`, `git fetch origin && git rebase origin/main`. If `main` now has `shape: 4` from T13 or T14, take the next number in `State`, `replay()`'s initial state, `replay.test.ts` and `events.md`, and make sure both new keys are present. Run Task 18 again on the rebased tree.
- **GOTCHA**: two shapes both called 4 with different keys would let `check.ts` read the other's `state.json` as its own (the contract paths still hold, so nothing refuses; it is the number's meaning that breaks). `.claude/references/events.md:33` names the current number.
- **VALIDATE**: `git log --oneline origin/main -3` shows nothing unmerged; `bun run check` green.
- **SATISFIES**: CLAUDE.md "Events are the record".

---

## TESTING STRATEGY

### Unit Tests

`bun test` with the provider mocked (`src/jobs/__fixtures__/provider.ts`). Job: valid, invalid JSON twice, provider down, no model, plus the R8 refusal, the note echo, the invented number and the prompt sentinels (Task 6). Flow: the property over every item and 1,050 rolls, the skip, the refusals, the two bodies (Task 9). Events: reducer and fixture (Task 4). Marking: `markAnswer` against `quiz.mark` (Task 8). Page helpers (Task 15b).

### Integration Tests

Route tests with a temp `data/` and the real pack (Task 10), including the second-tab-writes-mid-job case. HTTP end to end through `Bun.serve`, the real provider module and `startFakeProvider` (Task 14), in the order the page uses: attempt on the topic → GET → `dan` → `correct`. No sockets in this ticket.

### Edge Cases

- Item with no misconceptions → `pickItem` skips it; `chooseWrong` null; `danStep` and `correction` `skipped` → 404. Verified: `coach.test.ts` 2 and 4, `api/coach.test.ts`.
- Generator roll whose `wrong` is `{}` for 8 rolls → items-file fallback → null. Verified: `coach.test.ts` 2 with `gens: {}`.
- Misconception `answer` with no digit (a text or ratio) → the string branch of `reaches`. Verified: `dan_wrong_step.test.ts` 10.
- Model reply reaching the right answer or another number → `shape` (or `guard` when the number is new), one retry, fallback. Verified: `dan_wrong_step.test.ts` 2 and 8.
- Same item and seed answered from two tabs → the second is 409, one `attempt` and one `coach` line. Verified: `api/coach.test.ts` (sequential re-post and the mid-job append) and the ordering argument in Task 10.
- `dan` reply arriving after the pupil answered elsewhere → the page shows the lines; the next `correct` is 409 and the page reloads. Verified: `api/coach.test.ts` mid-job test; Level 4 step 7.
- Second `postEvent` fails after the attempt saved → `saved: false`, attempt and xp remain, coach line absent. Not testable (Task 10); read-reviewed.
- Hand-edited coach line with `caught` not a boolean → `parseEvent` null, replay skips and counts it. Verified: `replay.test.ts` (Task 4 b).
- `?day=` on GET changes only the seed base; no write. Verified: Level 4 step 9.
- Topic id `constructor` or `__proto__` in a coach event → `topic(s, id)` on a prototype-less map. Verified by the existing `replay.test.ts:191-218` through `topic()`; no new test.
- T13 or T14 merges a shape bump first. Verified: Task 19.

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
cd ~/Desktop/study-tutor-t12 && bunx tsc --noEmit && bunx biome check .
```

### Level 2: Unit Tests

```bash
bun test src/jobs src/flow src/events src/marking src/mcp
```

### Level 3: Integration Tests

```bash
bun test src/api src/server.test.ts
bun run check
```

### Level 4: Manual Validation

Setup: `bun run dev` from `~/Desktop/study-tutor-t12` with a fresh `data/`. Setup page: pick **No model**. Use `agent-browser` (scroll before click, memory note). To print a roll's wrong answers for step 3:

```bash
bun -e 'const {loadCasePack}=await import("./src/api/case.ts");const {findItem}=await import("./src/flow/chat.ts");const p=await loadCasePack("maths");const i=findItem(p,process.argv[1],Number(process.argv[2]));console.log(i?.stem, i?.misconceptions.map(m=>m.answer))' '1MA1/R9/of-an-amount#gen' <seed>
```

1. Home shows "Coach Dan". Open it: "Try a question on a topic first. Then Dan can have a go." and "Dan is Noob, rank 1 of 5. 3 more catches to the next rank."
2. Lesson 0001, answer question 1 (any answer, Sure), Check. Back to `/coach.html`: the topic "Percentage of an amount" is listed. Open it.
3. The stem is a fresh-number question (not question 1's "Find 20% of 45"). The AI note is at the top. "No model is set up…" shows. A `Dan:` line appears within a second ending in one of that roll's wrong answers: `curl -s 'localhost:<port>/api/coach?topic=1MA1%2FR9%2Fof-an-amount'` gives `item` and `seed`; the command above prints the bank. `data/events.jsonl` has no new line yet (the fallback writes no `usage`).
4. Type the right answer, Sure, Check. "You caught it. Dan says thanks.", "Dan's mistake: …", the working, "Dan is Noob, rank 1 of 5. 2 more catches to the next rank." `events.jsonl` gained `attempt`, `xp` (10), `coach` with `caught: true` and the seed. `GET /api/state` shows `coach: {shown: 1, caught: 1, rank: 0}`.
5. "Another question": a different stem. Type Dan's own wrong answer: "Not this time.", the note, the working, rank unchanged; `coach` line `caught: false`; `confidentWrong` in state now holds this item (a boss candidate, O1).
6. Reload the page mid-question before answering: the same stem and seed come back (the `shown` count did not move).
7. Two tabs on the same question: answer in tab A, then in tab B: tab B says "You have answered this one. Ask for another." and reloads to a new question. One `attempt` and one `coach` line for that seed.
8. With a model: Ollama is running with `qwen2.5vl:3b` (`observed` 2026-09-29, `curl localhost:11434/api/tags`). Settings → Ollama, that model. Open the coach on the topic: the `Dan:` lines come `by: "model"` (`curl` the `dan` step to see `by`) and end in a bank wrong answer, or the console shows `Model reply refused (dan_wrong_step): shape|guard` and the fallback line. Do this on 5 questions and record, `observed`: how many were `by: "model"`, and each refusal reason. `events.jsonl` gains a `usage` line per call.
9. `curl -s 'localhost:<port>/api/coach?topic=1MA1%2FR9%2Fof-an-amount&day=2026-10-06'` → a different `seed` from step 3, no `answers` key, nothing appended. `curl -s -X POST localhost:<port>/api/coach -H 'content-type: application/json' -d '{"step":"solve"}'` → 400.
10. Slow provider: `bun scripts/fake-provider.ts --mode not-json --delay 70000`, Settings → Other OpenAI-compatible at the printed URL, model `fake`. Open the coach: after about 140 s (`derived`: 2 × 70 s) the fallback `Dan:` line appears, not "Not sent". Record as `observed`.

### Level 5: Additional Validation (Optional)

`bun scripts/replay-check.ts` on the `data/` from step 8: no rung falls with shape 4.

---

## ACCEPTANCE CRITERIA

- [ ] AC1 (R8): a test proves the wrong step always comes from the bank: `chooseWrong` over every item and 1,050 rolls, and the job refuses a reply that does not reach the chosen wrong answer (Tasks 6.2, 9.1).
- [ ] AC2: an item with no misconceptions is skipped at pick, at the job call and at the correction (Tasks 7, 9.2, 10).
- [ ] AC3: mocked job tests for valid, invalid JSON twice, provider down, no model (Task 6).
- [ ] AC4: the catch rate is computable from state: `state.coach.caught / state.coach.shown` (Tasks 3, 4).
- [ ] AC5: Dan's rank in state rises per caught error (`rankFor`, Tasks 3, 7a, 9.6).
- [ ] AC6: with no model, Dan's attempt is a written line from the bank and no `usage` line is written (Tasks 5, 14).
- [ ] AC7 (Guard): the prompt carries the wrong answer and note only; a sentinel test proves `answers`, `working` and `mark_scheme` never enter it; the working is returned only after the attempt event is written (Tasks 6.9, 10).
- [ ] AC8: `app/coach.html` shows the question, Dan's lines, the correction form, the result, the rank; every POST goes to `/api/coach` (Tasks 12, 15).
- [ ] `bun run check` green on the rebased branch (Task 19).

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] `bun run check` green
- [ ] Level 4 steps 1 to 10 run and recorded as `observed` in the execution report
- [ ] Acceptance criteria all met
- [ ] PR body restates the guard (CLAUDE.md "Restate the guard") in the words of "The guard, restated" above

---

## OPEN QUESTIONS / ASSUMPTIONS

- **Q1 Decided: the gate is "an attempt on the topic exists", not "a teach-back event exists".** The ticket says "after a teach-back". With no model a teach-back writes no event (T9 Q2, `src/flow/chat.ts:137-138`), so a teach-back gate would lock Dan out of exactly the no-model mode the ticket's fallback line serves. An attempt is implied by every teach-back (`CALL_POINT` after), so the teach-back path still leads here, and the chat page links to Dan right after a saved teach-back (Task 16). Overrule: gate on `teachback` when a model is configured and on `attempt` otherwise, a two-line change in `hasTried`.
- **Q2 Decided: Dan is always wrong.** The ticket says one wrong step. Kai's one-in-four is O5's calibration device, not O2's.
- **Q3 Decided: `caught` = the first correction is right.** The page offers no hint, so it is unaided (PRD O2 signal). Sure or Not sure is asked because `attempt@1` requires it, and feeds D7 calibration, not `caught`.
- **Q4 Decided: 3 catches per rank, 5 ranks (`expected`).** Nothing reads these but the page and the reducer's `rank`; E3 reads the rate. Names in `RANKS` are pupil-facing and pass `.claude/rules/content.md`.
- **Q5 Decided: the `dan` step re-runs on reload and costs tokens each time.** Same as a re-asked hint. Caching a reply would need a file under `data/` that is not an event (D3). Worst case per page open: 2 calls, 240 s (T9 Q7).
- **Q6 Decided: the item seed base uses the global `shown` count, not a per-topic one.** Answering on topic A changes topic B's pending question. Harmless, and it keeps `State.coach` to three numbers.
- **Q7 Timing, worst case:** a `dan` request in flight when the pupil answers from another tab. The lines arrive after the result; nothing is written by `dan` (Task 10's mid-job test). The reverse (answer arrives while `dan` runs in the same tab) cannot happen: the form is hidden until the lines arrive.
- **Q8 Not T12's: model quality.** `qwen2.5vl:3b` returned wrong maths in words in T9 (Q8 there). Dan's job is safer than a hint: the only number it must produce is given to it, and every other number is checked. S4's decision on local models stands.
- **Q9 Parallel plans.** A second T12 plan was written by another session on 2026-09-29 into this same file and replaced by this one at the user's choice; a copy is in this session's scratchpad as `t12-other-session-plan.md`. Its two catches are folded in here: the `MCP_WRITABLE` row (Task 2b) and the shape-number merge risk (Task 19). Its differences that were not taken: a teach-back-today gate (locks out no-model mode, Q1), one round per topic per day, rank as a bare count.
- **Size**: `expected` about 1,150 lines with tests, above the ticket's 600 to 900. The extra is the new event (five files) and the page test, both required by CLAUDE.md rules rather than optional.

## RISKS (all resolved at planning)

- **R1 `dayRoute` needed a 404 path.** Resolved: `getCoach` returns a body only; an unknown topic is `{ ready: false, reason: "no-topic" }`. `dayRoute` is untouched.
- **R2 The page POST allowlist.** Resolved: the exact line (221) and its new text are in Task 12; the branch is cut from the `main` that holds it, and Task 19 re-runs the gate after any rebase.
- **R3 `preAttemptSystem`'s signature.** Resolved: `define.test.ts:230-231` asserts containment only (`observed`); Task 1 names the two lines to add; the guard line stays in position two unconditionally.
- **R4 Import cycle `replay → coach → chat → jobs → providers → replay`.** Resolved: `rank.ts` is a leaf (Task 7a); Task 18 greps that `replay.ts` never imports `flow/coach`.
- **R5 `MCP_WRITABLE` is exhaustive over `EventType`.** Resolved: Task 2b.
- **R6 An unrunnable test in the plan (`saved: false` via a read-only dir).** Resolved: removed; replaced by the mid-job second-tab test that `chat.test.ts:236-260` shows is runnable.
- **R7 A `fetch` the allowlist scan cannot see.** Resolved: Task 15's GOTCHA pins the literal form.
- **R8 T13 or T14 bump `State.shape` first.** Resolved: Task 19.

**Confidence for one-pass success: 10/10** (my estimate). Every seam this plan plugs into was read from source and cited; every number is labelled; every test is one an existing test already shows to be runnable; the two catches from the parallel plan are folded in; nothing in the plan depends on a fact that was not checked.

## NOTES (open canvas)

**Why not GET-runs-the-job.** A GET that spends tokens and appends `usage` lines is a write on a read route, and a reload would re-bill. Two POST steps keep the read pure and let `server.timeout(req, 0)` apply to the long one only.

**Why the wrong step is a pure function of item and seed.** The page could send the misconception index back, but then the record could disagree with what was shown. Deriving it from `hash(`${id}:${seed}:dan`)` on both POSTs means the `coach` event's `wrong` is what Dan said, with no field the page can alter.

**Why `wrong` is stored at all.** `caught` alone gives E3 its rate. `wrong` costs one short string per line and lets a later digest say which mistakes the pupil misses (T15), without re-deriving them from the pack, which an update can change.

**Rejected: a per-type `src/marking/cloze.ts`.** `content-pack.md` promises one, but the coach needs only "does the typed answer match", which `quiz.mark` already defines. `answer.ts` is that primitive; a per-type marker can wrap it later.

**Rejected: `mode: "coach"` sessions.** `MODES` already has `coach`, so a later ticket can post start and end bodies from `/api/next` without an event change. This ticket has no map card to justify them.

**Data flow.**

```
coach.html?topic=T
  GET /api/coach?topic=T ──► currentState + readLines ──► hasTried? pickItem(base=day:T:coach:shown) ──► toItemView + rank
  POST {step:dan,item,seed} ──► findItem ──► jobItem (PreAttempt) + chooseWrong ──► danWrongStep.run ──► lines
  POST {step:correct,item,seed,answer,sure} ──► findItem ──► markAnswer ──► postEvent(attempt) [+xp 10] ──► postEvent(coach) ──► working, note, rank
```

## AMENDMENTS

- 2026-09-29 (implementation) — Task 2b: no `tools.test.ts` edit, the file pins no type list. Task 15: "Another question" is a button (Biome `useValidAnchor`), hidden on a not-ready page; a 409 reloads after 1.5 s. Task 6: the three shape cases run through one helper in one test. Level 4 step 8 `observed`: `qwen2.5vl:3b` gave 0 of 5 model-voiced steps (3 `not-json`, 7 `shape`); raw replies compute the right answer, paraphrase the note or break the JSON, never the given wrong number. Step 10 `observed`: 140 s then the fallback with 200. Report: `.claude/reports/t12-coach-dan-report.md`.
- 2026-09-29 — Risks R1 to R8 resolved before execution: `rank.ts` leaf module, `MCP_WRITABLE` row, no `dayRoute` change, exact test lines, the unrunnable `saved: false` test replaced, merge-safety task added. The parallel plan from another session was replaced by this one at the user's choice (Q9).
