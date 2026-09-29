# Feature: T15 parent digest

The following plan should be complete, but validate documentation and codebase patterns and task sanity before you start implementing. Pay special attention to the names of existing utils, types and models. Import from the right files.

Worktree: `~/Desktop/study-tutor-t15`, branch `feature/t15-parent-digest`, cut from `origin/main` at `b91716d` (T12 R8 fix, #47). Every path below is relative to that worktree. The main checkout's local `main` is stale (it stops at `ab1ddd9`); do not plan or build from it.

## Feature Description

A weekly, factual digest of the pupil's record: practice days this week against the weekly target, re-tests taken and passed, marks left on the table when examiner mode (O3) is in use, model tokens used this month against the cap, and model calls that did not work. It is built from `data/events.jsonl` (through `replay`), `profile.json` (weekly target) and `config.json` (cap). It is written to `data/digest/<iso-week>.md` and shown at `app/parent.html`. The pupil can open the same page; nothing on it is hidden from them.

"Model calls that did not work" has no record today: a job fallback goes only to `console.error` (`src/jobs/define.ts:104-106`, `src/providers/openai-compatible.ts:102-110`). This ticket adds a `job@1` event, written once in `defineJob.run` on the fallback path, so the digest can read failures out of the log like everything else.

## User Story

As the parent who set the tutor up and holds the model key
I want a short weekly page of plain facts about practice, re-tests, photos, spend and failures
So that I can see whether the tutor is being used and whether the model is working, without watching my teenager live

## Problem Statement

The parent has no view of the record except `events.jsonl`. The architecture ("System behaviour", `docs/prd/study-tutor-v2.architecture.md:160-163`) expects a provider failure to be "logged where the parent digest reads it", and D11 (`:146-151`) keeps "session logs and the monthly token count" in `data/` for the digest. Neither the digest nor the failure record exists.

## Solution Statement

1. **Record failures as events.** A new `job@1 {job, reason}` event. `defineJob.run` appends it when it returns a fallback, for every reason except `no-model` (a family with no model configured has chosen that, and every job would otherwise log as failed). The event carries the job name and reason only.
2. **Derive in replay.** `State.shape` 5 → 6. `retests[week]` gains `taken` and `passed` counts (today it holds only summed `score`/`of`, `src/events/replay.ts:59`). A new `failed` key counts `job@1` reasons per ISO week.
3. **Pure digest.** `src/digest.ts` builds `{week, title, lines}` from `(state, day, target, cap)` and renders markdown. No clock, no file, no model.
4. **Route plus files.** `GET /api/digest[?day=YYYY-MM-DD]` returns this week and last week. It writes the real current week's file every time, a past week's file only when it is missing, and nothing for an empty log.
5. **Page.** `app/parent.html` + `app/parent.js` render the two digests with `textContent`. A link from `app/index.html`.

## Out of Scope / Non-Goals

- Not included: any outbound channel (email, push, a sync-folder copy). Q13's "page plus file" is the evidenced default (tickets A4).
- Not included: a money figure. The cap is in tokens (`DEFAULT_CAP = 1_000_000`, `src/config.ts:124`); no price per token is known, so the digest reports tokens against the cap.
- Not included: XP, flame streaks, calibration, coach rank, detective cases or topic rungs. The ticket names five facts; more lines mean more to watch (PRD Q7: "a live feed the teen knows is watched risks the control effect").
- Not included: a history browser beyond this week and last week. Older weeks are in `data/digest/`.
- Not included: an MCP tool for the digest. `read_state` already exposes the state it is built from.
- Not changing: `usage@1`, the guardrail (`src/flow/xp.ts:48-65` reads only `score`/`of`), `six-weeks.jsonl`, any prompt text.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: `src/events` (new event, shape 6), `src/jobs/define.ts` (failure record), `src/digest.ts` (new), `src/api/digest.ts` (new), `src/server.ts` (route), `src/mcp/tools.ts` (writable table), `src/api/event.ts` (refusal), `app/parent.{html,js}` (new), `app/index.html` (link)
**Dependencies**: none new. Bun, happy-dom (already a dev dependency).

## Related Work

**Implements**: #17 (T15) · **Epic**: #1 · PRD `docs/prd/study-tutor-v2.prd.md` (target user, Q7, R4) · Architecture `docs/prd/study-tutor-v2.architecture.md` (D3, D11, Q13, "System behaviour") · Tickets `docs/tickets/study-tutor-v2.md` (T15, assumption A4)

**Back-references**:

- `.claude/plans/t8-setup-config-provider.md` - Why: the token counter (`usage@1`, `state.tokens`) and the cap this digest reports.
- `.claude/plans/t5-flow.md` - Why: the weekly flame (`state.flame`) and `weeklyTarget`; the digest's practice-days line must read the same number the map shows.
- `.claude/plans/t9-model-jobs.md` - Why: `defineJob`'s retry table and fallback path, where the failure event is written.
- `.claude/plans/t13-examiner-mode.md` - Why: `state.photos` and "marks left on the table".
- `.claude/plans/t14-squad-mode.md` - Why: the "only the current week's view rewrites its file" rule mirrored here (`src/server.ts` `/api/squad` GET).

**Forward-references**: (none yet)

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `CLAUDE.md` - Why: ground rules (events are the record, `data/` confinement, pupil-facing text, "restate the guard").
- `.claude/references/events.md` - Why: event line rules, `KEYS`, routes, State keys; this ticket edits it.
- `.claude/references/model-jobs.md` (lines 18-20, 32) - Why: retry table and `chatJson` failure reasons; this ticket adds one sentence.
- `.claude/rules/content.md` - Why: register rules for every string the page shows (the pupil reads it too).
- `src/events/types.ts` (whole file, 11 types; `EVENT_TYPES` lines 1-13, `FIELDS` ~line 150, `KEYS` ~line 230, `_complete` pin below it) - Why: every place a new `(type, v)` must be added; `tsc` fails until all are.
- `src/events/replay.ts` (lines 38-64 `PhotoWeek`/`State`; 120-130 `retest@1`; 154-172 `photo@1`; 173-176 `usage@1`; 201-207 `coach@1`; 213-232 initial state) - Why: reducer table and State literal to extend.
- `src/events/replay.test.ts` (lines 31-67 six-week test; 252-280 photo test) - Why: the exact `toEqual` on `s.retests` and `s.shape` that change on purpose; test shape to mirror for `failed`.
- `src/events/types.test.ts` (lines 8-20) - Why: forces `src/events/__fixtures__/job.v1.jsonl` to exist and parse.
- `src/events/__fixtures__/six-weeks.jsonl` (33 lines) - Why: the snapshot input. Do not edit it; `replay.test.ts` pins `lines: 33` and more.
- `src/events/__fixtures__/usage.v1.jsonl` - Why: shape of a per-version fixture file.
- `src/events/append.ts` (`appendEvent` 61-126; `writeDataFile` 167-200; `makeDataDir` 202-220; `readDataJson` 146-160) - Why: the only writers under `data/`.
- `src/jobs/define.ts` (lines 39-45 `JobFailure`/`Verdict`/`JobDeps`; 63-68 `RETRYABLE`; 97-111 `run`) - Why: where the `job@1` line is appended.
- `src/jobs/define.test.ts` (lines 120-220) - Why: mocked-provider test pattern (`probe.run(Q, { dataDir: data, fetch: f, now: NOW })`).
- `src/providers/openai-compatible.ts` (lines 13-20 `Failure`; 102-110 `fail`; 205-230 `record`) - Why: the failure reasons, and the existing precedent of a provider-side `appendEvent` (usage) that must never throw into the caller.
- `src/jobs/guard.ts` (lines 3-11 `CHECKS`; `guardReply` ~line 23) - Why: the no-grade / no-exclamation / no-emoji check the digest test reuses.
- `src/api/event.ts` (lines 25-46 `refusal`) - Why: `POST /api/event` must refuse `job` as it refuses `xp` and `photo`.
- `src/mcp/tools.ts` (lines 33-47 `MCP_WRITABLE`) - Why: compile-pinned `Record<EventType, boolean>`; `job: false`.
- `src/api/config.ts` (lines 72-88 `getUsage`) - Why: month key from the reference day, `cap: readConfig(dataDir)?.cap ?? null`.
- `src/config.ts` (lines 121-126 `Profile`, `DEFAULT_CAP`, `DEFAULT_WEEKLY_TARGET`; 138 `readConfig`; 212-220 `readProfile`) - Why: target and cap inputs.
- `src/api/state.ts` (whole, 12 lines) - Why: "never create `data/` for an empty log" rule to mirror.
- `src/api/squad.ts` (imports lines 1-40; the `getSquad` write path) - Why: a route handler under `src/api` that writes a file under `data/` through `makeDataDir` + `writeDataFile`.
- `src/server.ts` (lines 130-139 `getState`; 145-164 `dayRoute`; 194-208 `readRoute`; 354-461 `apiRoutes`, esp. `/api/usage` 395-398 and `/api/squad` GET 422-438) - Why: route table, `refuseForeign`, `?day=` validation with `isDay`, the current-week test `isoWeek(day) === isoWeek(localDay(utcNow()))`.
- `src/server.test.ts` (lines 337-395 key-leak walk) - Why: walks `apiRoutes` automatically; a new route is covered without a list edit.
- `src/mcp/clock.ts` (whole) - Why: `localDay`, `addDays`, `isoWeek`; no Monday helper exists.
- `src/flow/xp.ts` (lines 30-35 `flame`) - Why: practice days = `state.flame[week]?.length ?? 0`, the number the map shows.
- `app/squad.html`, `app/squad.js` (header comment; `TEXT` table; bootstrap at the bottom: `if (typeof document !== "undefined")` and `globals().squad = …`) - Why: page and script shape to mirror.
- `src/marking/squad-dom.test.ts` (lines 1-35) and `src/marking/dom.ts` - Why: happy-dom DOM test pattern with a fake fetch, `?dom` import.
- `app/index.html` (footer) - Why: where the link goes.

### New Files to Create

- `src/events/__fixtures__/job.v1.jsonl` - one fixture line per the `EVENT_KEYS` test.
- `src/digest.ts` - pure digest: `buildDigest`, `digestMarkdown`, `mondayOf`, `REASON_TEXT`.
- `src/digest.test.ts` - snapshot against the six-week fixture, O3 and failure branches, no-grade test.
- `src/__fixtures__/digest-six-weeks.md` - hand-derived expected markdown for W41-W46 (the "snapshot").
- `src/api/digest.ts` - `getDigest(dataDir, day, today)`: reads, replays, builds, writes files.
- `src/api/digest.test.ts` - file-writing rules against a temp `data/`.
- `app/parent.html`, `app/parent.js` - the page.
- `src/marking/parent-dom.test.ts` - page renders both weeks with `textContent`, shows the load-failure line.

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [Bun test: `expect`](https://bun.sh/docs/test/writing) - Why: `toEqual`/`toBe` only; this plan does not use `toMatchSnapshot` (see D4).
- [MDN `Number.prototype.toLocaleString`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Number/toLocaleString) - Why: `1,000,000` with `"en-GB"`.

### Patterns to Follow

**Adding an event type** (`CLAUDE.md` "Where new code goes", `events.md`): union in `EVENT_TYPES` → `JobV1` type → `Event` union → `FIELDS` validator → `KEYS` → reducer case in `CASES` → fixture file → replay test. `tsc` enforces `FIELDS`, `KEYS` (via `_complete`), `CASES` and `MCP_WRITABLE` because each is a `Record` over the key union.

**Provider-side append that never throws** (`src/api/event.ts:48-57`, the xp line):

```ts
/** The xp line after a scoring event. A failure is logged, never returned: the scoring event was saved. */
  try {
    appendEvent(dataDir, xp, now);
  } catch (err) { console.error(...) }
```

**Logging**: `console.error` with a fixed sentence and a reason, never reply text, key or body (`define.ts:105-106`, `openai-compatible.ts:103-106`).

**Current-week-only rewrite** (`src/server.ts` `/api/squad` GET): `isoWeek(day) === isoWeek(localDay(utcNow()))`, computed in the route and passed down so the handler stays clock-free.

**Maps in State** are `dict()` (no prototype), `src/events/replay.ts:210`.

**Pupil-facing strings**: British English, sentence case, no `!`, no emoji, no grade words. Every page string lives in one `TEXT` table (`app/squad.js`).

---

## Decisions (ticket level)

- **D1. Failure record = new `job@1` event**, not a field on `usage@1`. `usage@1` is written only when the provider answers (`openai-compatible.ts:189`); `timeout`, `network`, `cap` and `no-model` never reach it. Written in `defineJob.run` once per fallback verdict, so one failed job = one line, whatever the retry count.
- **D2. `no-model` is not recorded.** It is the configured "No model" choice, not a failure. Every other reason is: `cap`, `timeout`, `network`, `http`, `not-json`, `bad-response`, `shape`, `guard`.
- **D3. Retest counts live in `State.retests[week]`** as `taken` and `passed`, beside `score`/`of`. Shape bumps once (5 → 6) for this and `failed`. `guardrail` builds its rows field by field (`xp.ts:53-54`), so the extra fields do not reach it; `properties.test.ts` keeps its own model and compares `guardrail` output, not `state.retests`.
- **D4. The snapshot is a checked-in, hand-derived file**, not `toMatchSnapshot`. The repo has no `__snapshots__`, and Bun writes a missing snapshot on first run and passes, so the test would prove nothing until someone read the file. `src/__fixtures__/digest-six-weeks.md` is derived below and compared with `toBe`.
- **D5. Practice days = flame days** (`state.flame[week].length`), not `session@1` counts. `weeklyTarget` means "days a week with some practice" (`events.md` Config and profile), and the map shows `flame().days` of that target. Counting sessions would give the parent a different number from the pupil (the fixture has 3 session lines but flame days in 5 weeks).
- **D6. Month for the spend line = London month of the reference day.** Reference day: today for the current week, the week's Sunday for a past week. Same key as `getUsage` (`src/api/config.ts:79`). Worst case: a past week's line shows the month's total as of now, which can include spend after that week. It can overstate the week's spend and never hides any, and the line names the month, not the week.
- **D7. Files.** `data/digest/<iso-week>.md`. A view of the real current week (no `?day=`, or a `?day=` inside the current week) rewrites two files: this week's and last week's. A `?day=` in any other week writes nothing, matching `dayRoute`'s read-only `?day=` (`src/server.ts:141-143`). So a week viewed on Wednesday is rewritten again on any view the following week, and a week's file is final once two weeks have passed. The digest is derived data like `state.json`, rewritten rather than frozen. An empty log writes nothing and creates no folder (`src/api/state.ts` rule). The file name comes from `isoWeek()`, never from the request.
- **D8. One text source.** `buildDigest` returns `{week, title, lines}`; the markdown file and the page both render from it. The page never re-words a line.
- **D9. O3 "in use"** = `state.photos` has any week. Then every digest carries a photos line ("none this week" when that week has none); otherwise the line is absent.

---

## IMPLEMENTATION PLAN

### Phase A: event and state

`job@1` in types, fixture, reducer, shape 6, retest counts. Everything downstream reads these.

### Phase B: failure record in `defineJob`

**Depends on:** Phase A (needs `job@1` to append).

### Phase C: pure digest and snapshot

**Depends on:** Phase A (reads `State.failed`, `retests[w].taken/passed`). **Independent of:** Phase B (its tests build `job@1` lines by hand).

### Phase D: route, files, page

**Depends on:** Phase C.

### Phase E: docs and gate

**Depends on:** A-D.

---

## STEP-BY-STEP TASKS

### A0 RUN a shape-5 baseline for E2

- **IMPLEMENT**: before any change, in the scratchpad: `mkdir -p <scratch>/data && cp src/events/__fixtures__/six-weeks.jsonl <scratch>/data/events.jsonl && cd <scratch> && bun <worktree>/scripts/replay-check.ts`. With no state present it rebuilds and writes a shape-5 `data/state.json`.
- **VALIDATE**: `grep '"shape": 5' <scratch>/data/state.json` (the file is pretty-printed)
- **SATISFIES**: AC 6

### A1 UPDATE `src/events/types.ts`

- **IMPLEMENT**:
  - Add `"job"` to `EVENT_TYPES` (after `"coach"`).
  - `export const JOB_REASONS = ["cap", "timeout", "network", "http", "not-json", "bad-response", "shape", "guard"] as const;` with a one-line comment: the fallback reasons `defineJob` records; `no-model` is a choice, not a failure.
  - `export type JobV1 = Line<"job", 1> & { job: string; reason: (typeof JOB_REASONS)[number] };`
  - Add `JobV1` to the `Event` union.
  - `FIELDS["job@1"]: (o) => str(o.job) && oneOf(o.reason, JOB_REASONS)`.
  - `KEYS["job@1"]: ["job", "reason"]`.
- **PATTERN**: `UsageV1` / `"usage@1"` entries in the same file.
- **GOTCHA**: `KEYS` is what keeps reply text out of the log: `appendEvent` copies only listed fields. Do not add any other field.
- **VALIDATE**: `bunx tsc --noEmit` fails only on `CASES` in `replay.ts` and `MCP_WRITABLE` in `tools.ts` (expected; fixed in A3 and A5).
- **SATISFIES**: AC 3

### A2 CREATE `src/events/__fixtures__/job.v1.jsonl`

- **IMPLEMENT**: two lines:
  `{"v":1,"t":"2026-11-10T17:00:00Z","type":"job","job":"hint","reason":"timeout"}`
  `{"v":1,"t":"2026-11-10T17:05:00Z","type":"job","job":"examiner_mark","reason":"cap"}`
- **VALIDATE**: `bun test src/events/types.test.ts`
- **SATISFIES**: AC 3

### A3 UPDATE `src/events/replay.ts`

- **IMPLEMENT**:
  - `State.shape: 6`; initial literal `shape: 6`.
  - `retests: Record<string, { score: number; of: number; taken: number; passed: number }>` with the comment extended: "…, and how many were taken and passed".
  - New key `failed: Record<string, Record<string, number>>; // ISO week → job@1 reason → count (model calls that fell back)`; initial `failed: dict()`.
  - `retest@1`: `const sum = s.retests[week] ?? { score: 0, of: 0, taken: 0, passed: 0 };` then `sum.taken += 1; if (e.passed) sum.passed += 1;`.
  - New case `"job@1": (s, e) => { const week = isoWeek(localDay(e.t)); const w = s.failed[week] ?? dict<number>(); w[e.reason] = (w[e.reason] ?? 0) + 1; s.failed[week] = w; }`. No `topic()`, no `work()`: a failure is not practice.
- **PATTERN**: `photo@1` case (`replay.ts:154-172`).
- **GOTCHA**: `dict` is declared below `CASES` as a `const`; it is only called at run time, so the reference is fine (the `replay()` literal already relies on this).
- **ALSO**: `src/flow/xp.test.ts` `withWeeks` builds `s.retests[week]` by hand; give it `taken: 0, passed: 0` (the guardrail reads only `score`/`of`), or `tsc` fails.
- **VALIDATE**: `bun test src/events/replay.test.ts` fails on `shape` and `retests` only (expected; A4).
- **SATISFIES**: AC 1, AC 3

### A4 UPDATE `src/events/replay.test.ts`

- **IMPLEMENT**:
  - `expect(s.shape).toBe(6)`.
  - `s.retests` expected, derived from `six-weeks.jsonl` lines 9, 13, 17, 19, 24, 28, 30 (London day of each `t`, ISO week):
    - `2026-W41`: `{ score: 4, of: 6, taken: 2, passed: 1 }` (line 9 3/3 pass, line 13 1/3 fail)
    - `2026-W42`: `{ score: 5, of: 6, taken: 2, passed: 2 }` (17 2/3 pass, 19 3/3 pass)
    - `2026-W43`: `{ score: 3, of: 3, taken: 1, passed: 1 }` (24)
    - `2026-W45`: `{ score: 2, of: 3, taken: 1, passed: 1 }` (28)
    - `2026-W46`: `{ score: 3, of: 3, taken: 1, passed: 1 }` (30)
  - `expect(s.failed).toEqual({})` in the six-week test.
  - New test "job: failures are counted per ISO week and reason, and are not practice": `replay` of the two `job.v1.jsonl` lines plus one more `timeout` on `2026-11-11` → `failed` = `{ "2026-W46": { timeout: 2, cap: 1 } }`, `flame` = `{}`, `topics` = `{}`.
- **GOTCHA**: `toEqual` on a `dict()` (null-prototype) object against a literal passes in Bun (the existing `s.photos[wa]` assertions rely on it).
- **VALIDATE**: `bun test src/events/`
- **SATISFIES**: AC 1, AC 3

### A5 UPDATE `src/mcp/tools.ts`

- **IMPLEMENT**: `MCP_WRITABLE` gains `job: false, // the tutor records its own failed model calls (T15)`.
- **VALIDATE**: `bunx tsc --noEmit` clean; `bun test src/mcp/`
- **SATISFIES**: AC 3

### A6 UPDATE `src/api/event.ts`

- **IMPLEMENT**: in `refusal`, after the `photo` line: `if (event.type === "job") return "Refused: failed model calls are recorded by the tutor, not posted";`. Extend the doc comment ("XP, photos and failed model calls are the tutor's to write…").
- **VALIDATE**: add one case to `src/api/event.test.ts` mirroring its `xp` refusal test (400, nothing written); `bun test src/api/event.test.ts`
- **SATISFIES**: AC 3

### B1 UPDATE `src/jobs/define.ts`

- **IMPLEMENT**:
  - `import { appendEvent } from "../events/append"; import type { JobV1 } from "../events/types";`
  - Compile pin that the recorded reasons are exactly `JobFailure` minus `no-model`, both directions:
    ```ts
    type Recorded = Exclude<JobFailure, "no-model">;
    // A new failure reason that is not in JOB_REASONS (or the reverse) fails here.
    const _reasons: [Recorded, JobV1["reason"]] extends [JobV1["reason"], Recorded] ? true : never = true;
    ```
    Same unexported-underscore-const idiom as `_complete` (`src/events/types.ts:249`), which passes `tsc` and Biome today. Observed on 2026-09-29 (scratch files with this TypeScript 7 build, `--strict`): the pin compiles when the two unions match, and fails both when `JOB_REASONS` misses a reason and when it has an extra one.
  - In `run`, replace the final `return { by: "fallback", … }` with:
    ```ts
    if (reason !== "no-model") recordFailure(deps, name, reason);
    return { by: "fallback", value: spec.fallback(input), reason };
    ```
  - Module-level:
    ```ts
    /** One job@1 line per fallback verdict, for the parent digest. Never throws: the fallback still runs. */
    function recordFailure(deps: JobDeps, job: string, reason: Recorded): void {
      try {
        appendEvent(deps.dataDir, { v: 1, type: "job", job, reason }, deps.now);
      } catch (err) {
        console.error(`Could not record the failed model call (${job}): ${(err as Error).name}`);
      }
    }
    ```
- **PATTERN**: `src/api/event.ts:48-57` (xp append, logged not thrown).
- **GOTCHA**: The guard. This line is written **after** the verdict is decided and carries only `job` (the spec's fixed `name`) and `reason` (a union member). No reply text, no item field, no answer, no prompt change. `KEYS["job@1"]` drops any other field even if one were passed. The answer-withheld rule is untouched: no prompt is built or changed here, and the digest (Phase C) calls no model.
- **GOTCHA**: `deps.now` is optional; `appendEvent`'s third parameter defaults to `utcNow` when `undefined` is passed.
- **VALIDATE**: `bunx tsc --noEmit`; `bun test src/jobs/`
- **SATISFIES**: AC 3

### B2 UPDATE `src/jobs/define.test.ts`

- **IMPLEMENT** by extending what is there, not by adding a parallel suite:
  1. `src/jobs/__fixtures__/provider.ts`: add `countFailures(dataDir): { job: string; reason: string }[]`, beside `countUsage` (line 76), mirroring how it reads the log: parse `readLines(dataDir)` with `parseEvent` and keep the `job` lines as `{job, reason}`.
  2. `define.test.ts` `rows` loop (lines 121-141): derive the expected lines from the row's existing `by` and `reason`: `expect(countFailures(data)).toEqual(row.by === "fallback" ? [{ job: "probe", reason: row.reason }] : [])`. No new column. That single assertion covers "one line per verdict, not per try": the `not-json`, `shape` and `guard` rows make two calls (`calls: 2`) and must still show exactly one line.
  3. The no-model loop (lines 143-160, both `preset none` and `no config.json`): add `expect(countFailures(data)).toEqual([])`, and spy `console.error` and assert it was never called. Without that spy the no-model mutation survives: `FIELDS["job@1"]` refuses `no-model`, `recordFailure` catches it, and only a log line shows.
- **GOTCHA**: these are the mutation checks for B1. Record both in the execution report: delete the `recordFailure` call → the six fallback rows go red; remove the `reason !== "no-model"` condition → both no-model rows go red. Revert each.
- **VALIDATE**: `bun test src/jobs/define.test.ts`, then the two mutations above, each reverted.
- **SATISFIES**: AC 3

### B3 RUN the whole suite: no log-length drift expected

- **Measured at planning** (observed 2026-09-29, `scratchpad/probe.sh`: a temporary line in `defineJob.run` appended to a scratch file on every non-`no-model` fallback, run file by file, then reverted with `git checkout`; `bun test` at that commit was 631 pass, 0 fail): 46 recordable fallbacks in exactly 7 files: `src/flow/chat.test.ts` (1), `src/jobs/dan_wrong_step.test.ts` (9), `define.test.ts` (7), `examiner_mark.test.ts` (16), `guess_first.test.ts` (2), `hint.test.ts` (3), `teachback_mark.test.ts` (8). None in `src/api/*`, `src/snap.test.ts` or any route test. So `src/api/coach.test.ts:138,158,190,252`'s whole-log counts are never on a recording path.
- **Why none of the 7 break** (observed by grep): none asserts a whole-log length. `examiner_mark.test.ts`'s `toHaveLength` calls count fetch `calls`, not log lines. `chat.test.ts` passes `readLines(data)` into `chat()`, and every log reader in `src` filters by event type (`src/jobs/view.ts:24`, `src/flow/chat.ts:98`, `src/flow/examiner.ts:15`, `src/flow/coach.ts:28,37`, `src/api/squad.ts:127,135`), so an extra `job` line is skipped. The only code that walks every event type is the four compile-pinned tables (`FIELDS`, `KEYS`, `CASES`, `MCP_WRITABLE`), which A1-A5 update.
- **IMPLEMENT**: nothing, unless the run below finds a failure. If it does, that contradicts the measurement: stop, record the test under Divergences, and fix the count with a comment naming the `job` line (never filter the line away).
- **VALIDATE**: `bun test` green, same pass count as before plus the new tests.
- **SATISFIES**: AC 6

### C1 CREATE `src/digest.ts`

- **IMPLEMENT** (pure; imports `State` type, `isoWeek`, `addDays`, `JOB_REASONS`):
  ```ts
  export type Digest = { week: string; title: string; lines: string[] };
  /** Monday of the ISO week holding `day`. */
  export function mondayOf(day: string): string
  /** Plain words for each recorded reason. Several reasons share a label; labels are summed. */
  export const REASON_TEXT: Record<(typeof JOB_REASONS)[number], string> = { cap: "monthly cap reached", timeout: "timed out", network: "no connection", http: "model service refused the call", "not-json": "reply could not be read", "bad-response": "reply could not be read", shape: "reply could not be read", guard: "reply held back by the tutor's checks" };
  export function buildDigest(state: State, day: string, target: number, cap: number | null): Digest
  export function digestMarkdown(d: Digest): string   // `# ${title}\n\n` + lines as `- ${line}` joined by "\n" + "\n"
  ```
  `buildDigest`: `week = isoWeek(day)`, `month = day.slice(0, 7)`. Lines in this order:
  1. `Practice days: ${flameDays} of ${target}.`
  2. retests: `taken === 0` → `Re-tests: none this week.`; else `Re-tests: ${taken} taken, ${passed} passed.`
  3. only when O3 in use (D9): no photos that week → `Photos: none this week.`; else `Photos: ${taken} taken, ${marked} marked. Marks left on the table: ${of - marks} of ${of}.` (when `marked === 0`: `Photos: ${taken} taken, none marked yet.`)
  4. spend: `cap === null` (no model, see D1 GOTCHA) → `Model use in ${Month YYYY}: ${n} tokens. No model is set up.`; else `Model use in ${Month YYYY}: ${n} of the ${cap} token cap.` Numbers through `toLocaleString("en-GB")`.
  5. failures: none → `Model calls that did not work: none.`; else `Model calls that did not work: ${total} (${label} ${n}, …). The tutor carried on without the model.` Labels summed per `REASON_TEXT` value, listed in `JOB_REASONS` order of first appearance.
  Title: `Week of Monday ${d} ${MONTHS[m - 1]} ${yyyy}` from the parts of `mondayOf(day)` (day without a leading zero). The title always names a Monday, so no weekday formatting is needed. `const MONTHS = ["January", …, "December"] as const` serves the title and the spend line's month. No `Intl`: the snapshot must not depend on the ICU build of the Mac or Windows binary.
- **GOTCHA**: `REASON_TEXT` is a `Record` over the reason union so a new reason fails `tsc` until it has words.
- **GOTCHA**: the drafted wording above is a sketch. Run every string through `no-ai-slop` then `humanizer` (CLAUDE.md "Prose is a gate") before saving, then write C2's fixture to match the final wording. Numbers and line order are fixed by this plan; wording is not.
- **VALIDATE**: `bunx tsc --noEmit`
- **SATISFIES**: AC 1, AC 2

### C2 CREATE `src/__fixtures__/digest-six-weeks.md`

- **IMPLEMENT**: six digests concatenated with one blank line between them, built with `target = 3`, `cap = 1_000_000`, reference day = the week's Sunday. Expected values, **observed** 2026-09-29 by running `replay` on `six-weeks.jsonl` (`scratchpad/derive.ts`: `flame[week].length`, retest lines counted per ISO week of their London day, `tokens[sunday.slice(0,7)]`, `mondayOf` checked as `addDays(sunday, -6)` with the same ISO week), and matching the hand derivation from fixture lines:

  | Week | Monday | Practice days (flame) | Re-tests taken, passed | Reference day → month | Tokens |
  |---|---|---|---|---|---|
  | 2026-W41 | 5 October 2026 | 3 of 3 (10-05, 10-08, 10-09) | 2, 1 | 2026-10-11 → Oct | 1,500 |
  | 2026-W42 | 12 October 2026 | 2 of 3 | 2, 2 | 2026-10-18 → Oct | 1,500 |
  | 2026-W43 | 19 October 2026 | 2 of 3 | 1, 1 | 2026-10-25 → Oct | 1,500 |
  | 2026-W44 | 26 October 2026 | 0 of 3 | none | 2026-11-01 → Nov | 600 |
  | 2026-W45 | 2 November 2026 | 1 of 3 | 1, 1 | 2026-11-08 → Nov | 600 |
  | 2026-W46 | 9 November 2026 | 1 of 3 | 1, 1 | 2026-11-15 → Nov | 600 |

  Tokens: Oct = 1,200 + 300 (line 21) = 1,500; Nov = 500 + 100 (line 27) = 600. No photos in the fixture → no photos line (D9). No `job` lines → "none". W44 shows 600 although that spend is on 2 November, after W44 ends: that is D6's stated worst case, visible in the snapshot on purpose.

  W41 block (sketch wording, final wording per C1):
  ```
  # Week of Monday 5 October 2026

  - Practice days: 3 of 3.
  - Re-tests: 2 taken, 1 passed.
  - Model use in October 2026: 1,500 of the 1,000,000 token cap.
  - Model calls that did not work: none.
  ```
- **VALIDATE**: file exists; C3 compares against it.
- **SATISFIES**: AC 1

### C3 CREATE `src/digest.test.ts`

- **IMPLEMENT**:
  1. **Snapshot (AC 1)**: read `six-weeks.jsonl` the way `replay.test.ts:9-12` does; `s = replay(lines)`; for Sundays `2026-10-11, -18, -25, 2026-11-01, -08, -15` build `digestMarkdown(buildDigest(s, sunday, 3, 1_000_000))`, join with `"\n"`; `expect(joined).toBe(fs.readFileSync(<fixture>, "utf8"))`.
  2. **O3 and failures branch**: inline lines, all in W46 unless stated: three `photo@1` (marked 3/5 not clean, marked 5/5 clean, unmarked), two `job@1` `hint` `timeout`, one `job@1` `examiner_mark` `cap`, plus one `photo@1` marked in W45. Expect for day `2026-11-15`: photos line `3 taken, 2 marked`, marks left `2 of 10` (derived: of 5+5 = 10, marks 3+5 = 8, left 10 − 8 = 2); failures line total `3` as `(monthly cap reached 1, timed out 2)` (`JOB_REASONS` order). For day `2026-11-22` (W47): `Photos: none this week.` (O3 in use) and failures `none`.
  3. **No model** (`cap` null): the spend line is `… tokens. No model is set up.` with no cap figure.
  4. **Several reasons share a label**: one `not-json`, one `shape` → one label `reply could not be read 2`.
  5. **No grade prediction (AC 2)**: for every digest built in tests 1-4, `expect(guardReply(d.lines.concat(d.title), d.lines.concat(d.title))).toBeNull()` (`src/jobs/guard.ts`; `sources` = the text itself, so the invented-number rule passes and only emoji, `!` and grade patterns can fire). Plus a bite check: a digest with one line replaced by `On track for a grade 4.` makes `guardReply` return `"grade"`.
  6. **Pure**: `buildDigest` twice under `setSystemTime` at two different dates gives equal output (mirror `replay.test.ts` "pure: replay reads no clock").
- **GOTCHA**: `guardReply(texts, sources): string | null` (`src/jobs/guard.ts:23-34`) runs `CHECKS` first and returns the first reason (`"emoji"`, `"exclamation"`, `"grade"`), then the invented-number rule against `sources`. Passing the digest's own strings as `sources` makes every number allowed, so only `CHECKS` can fire.
- **VALIDATE**: `bun test src/digest.test.ts`. Mutation: change `taken += 1` to `taken += 2` in `replay.ts` → test 1 red; revert.
- **SATISFIES**: AC 1, AC 2

### D1 CREATE `src/api/digest.ts`

- **IMPLEMENT**:
  ```ts
  export type DigestView = { now: Digest; last: Digest };
  export const DIGEST_DIR = "digest";
  /** This week's digest and last week's, for `day`. When `day` is in the real current week, rewrites data/digest/<week>.md for both; otherwise writes nothing. Nothing for an empty log. */
  export function getDigest(dataDir: string, day: string, today: string): { status: 200; body: DigestView }
  ```
  Body: `lines = readLines(dataDir)`; `state = replay(lines)`; `target = readProfile(dataDir).weeklyTarget`; `config = readConfig(dataDir)`; `cap = config === null || config.preset === "none" ? null : config.cap`; `current = isoWeek(day) === isoWeek(today)`; `now = buildDigest(state, current ? day : addDays(mondayOf(day), 6), target, cap)` (D6: the Sunday is the reference day for any week but the current one); `lastSunday = addDays(mondayOf(day), -1)`; `last = buildDigest(state, lastSunday, target, cap)`. If `lines.length > 0 && isoWeek(day) === isoWeek(today)`: `makeDataDir(dataDir, DIGEST_DIR)` (default mode, as `src/api/squad.ts:147` calls it; the files are owner-only via `writeDataFile`), then `writeDataFile(dataDir, \`${DIGEST_DIR}/${d.week}.md\`, digestMarkdown(d))` for `now` and `last`. No existence check. Do not read or write with a raw path.
- **PATTERN**: `src/api/squad.ts` (imports from `../events/append`), `src/api/state.ts` (empty-log rule), `src/api/config.ts:72-88` (`getUsage`).
- **GOTCHA**: the week in the file name comes from `isoWeek()` on a day validated by `isDay`; the request never supplies a path segment.
- **GOTCHA**: `readProfile` falls back to `DEFAULT_WEEKLY_TARGET` (3) when `profile.json` is missing. A "No model" save still stores a `cap` (`src/config.ts:296-311`: `preset: "none"`, `cap` kept or `DEFAULT_CAP`), so `readConfig` is not null then. No model = `config === null || config.preset === "none"`; only that maps to `cap` null.
- **VALIDATE**: `bun test src/api/digest.test.ts` (D2)
- **SATISFIES**: AC 4, AC 5

### D2 CREATE `src/api/digest.test.ts`

- **IMPLEMENT** against a temp dir (mirror the temp-dir helper used in `src/api/squad.test.ts` or `src/api/config.test.ts`):
  1. six-week log copied in, `getDigest(data, "2026-11-15", "2026-11-15")` → `now.week` `2026-W46`, `last.week` `2026-W45`; `data/digest/2026-W46.md` and `2026-W45.md` exist and equal `digestMarkdown(now)` / `digestMarkdown(last)`; mode is owner-only on POSIX (skip on win32, as other tests do).
  2. append one retest in W46, call again with today `2026-11-18` (W47) and no `day` (so `day` = today) → `2026-W46.md` is rewritten as last week and now shows 2 re-tests; `2026-W47.md` written.
  3. `getDigest(data, "2026-11-01", "2026-11-18")` (a `?day=` in W44 while today is W47) → body returned, no file written or changed (compare the folder listing and bytes before and after).
  4. empty dir (no log) → body returned with zeros; `data/` not created (`fs.existsSync(data)` false).
  5. `profile.json` with `weeklyTarget: 5` → `Practice days: 1 of 5.` for W46.
  6. `config.json` saved through `saveSetup` with `preset: "none"` → spend line `… No model is set up.` (not the cap figure).
  7. `?day=2026-10-27` and `?day=2026-11-01` (both W44, today W47) → both spend lines name November (D6).
- **VALIDATE**: `bun test src/api/digest.test.ts`
- **SATISFIES**: AC 4, AC 5

### D3 UPDATE `src/server.ts`

- **IMPLEMENT**: route `"/api/digest": { GET: (req) => digestRoute(req, dataDir) }` after `/api/usage`. `digestRoute`: `refuseForeign`; `?day=` optional, refused with 400 `day must be YYYY-MM-DD` when not `isDay` (copy `dayRoute`'s lines 154-156); `today = localDay(utcNow())`; `day = asked ?? today`; call `getDigest(dataDir, day, today)` inside the same try/500 shape as `readRoute` with message `Could not build the digest`. Do not use `dayRoute`: it loads the case pack, which the digest does not need.
- **PATTERN**: `src/server.ts:145-164` and `194-208`.
- **VALIDATE**: `bun test src/server.test.ts` (the key-leak walk now includes `/api/digest` automatically; `walked` equals `Object.keys(apiRoutes(opts))`). Add one test in `server.test.ts`: `GET /api/digest?day=2026-13-01` → 400; foreign `Origin` → refused (mirror the `/api/case` test at ~line 408).
- **SATISFIES**: AC 4

### D4 CREATE `app/parent.html` and `app/parent.js`

- **IMPLEMENT**:
  - `parent.html` mirrors `app/squad.html`: `<main class="lesson">`, crumb `<a href="/">Home</a> · weekly digest`, `<h1>Weekly digest</h1>`, aim line (sketch: "What the tutor recorded this week and last week. The pupil and the parent see the same page."), `<section id="now">`, `<section id="last">`, `<p class="note" id="status">`, footer "Each week is also saved as a file in the tutor's data folder.". Scripts: `/parent.js`, `/update.js` defer as `index.html` does.
  - `parent.js` mirrors `squad.js`'s IIFE: header comment (what it shows, textContent only, loaded under Bun by the DOM test, no DOM at load), `TEXT` table (`notLoaded`, `thisWeek`, `lastWeek`), `render(ids, view)` writes for each section an `h2` (`TEXT.thisWeek` / `TEXT.lastWeek`), an `h3` with `title`, and a `ul` of `lines`, all by `textContent`. `load` fetches `/api/digest` plus `location.search` `day` if present; on failure writes `TEXT.notLoaded`. Bootstrap guarded by `typeof document !== "undefined"` and `getElementById("now")`; export via `globals().parent = { TEXT, render }`.
- **GOTCHA**: the page shows the digest words only (D8). No extra wording on numbers, no colour for good or bad weeks, no grade words. Sketch strings go through `no-ai-slop` then `humanizer`.
- **VALIDATE**: D5.
- **SATISFIES**: AC 4, AC 5

### D5 CREATE `src/marking/parent-dom.test.ts`

- **IMPLEMENT** mirroring `squad-dom.test.ts` lines 1-35 (register happy-dom at `http://127.0.0.1:4731/parent.html`, fake fetch that records requests, import the page with `?dom`, `until` from `./dom`):
  1. a view with two digests renders both titles and every line as text, in order.
  2. a line holding `<b>x</b>` renders as literal text (no element created).
  3. fetch rejects → `#status` shows `TEXT.notLoaded`.
  4. `?day=2026-11-15` on the page URL is passed through to `/api/digest?day=2026-11-15`.
- **VALIDATE**: `bun test src/marking/parent-dom.test.ts`
- **SATISFIES**: AC 4

### D6 UPDATE `app/index.html`

- **IMPLEMENT**: in the footer, beside Settings: `<p><a href="/parent.html">Weekly digest</a> (for a parent and for you)</p>` (sketch; passes the prose gate).
- **VALIDATE**: manual step M2.
- **SATISFIES**: AC 5

### E1 UPDATE `.claude/references/events.md` and `.claude/references/model-jobs.md`

- **IMPLEMENT**:
  - events.md: `job` in the type list with one sentence ("one model call that fell back, `{job, reason}`; written by `defineJob`, never posted; `no-model` is not written"); routes: `POST /api/event` refuses `job`; `GET /api/digest` (and `?day=`) is `{now, last}` and writes `data/digest/<week>.md` per D7; State keys: `shape` now 6, `retests` adds `taken`/`passed`, new `failed`.
  - model-jobs.md, after the retry table sentence (line 20): "On a fallback verdict other than `no-model`, `defineJob` appends one `job@1` line (job name and reason only) for the parent digest."
- **VALIDATE**: `bunx biome check .`
- **SATISFIES**: AC 6

### E2 RUN the gate

- **VALIDATE**: `bun run check` green; rerun A0's `replay-check` in the same scratch folder (it holds the shape-5 `state.json` A0 wrote) → no refusal (rungs unchanged; `project` in `src/events/check.ts` reads only `lines`, `topics[].rung`, `xp.total`, `hash`).
- **SATISFIES**: AC 6

---

## TESTING STRATEGY

### Unit Tests

- `src/events/replay.test.ts`: shape 6, retest counts on the six-week history, `job@1` per-week reason counts, a failure is not a flame day.
- `src/events/types.test.ts`: fixture for `job@1` parses (automatic).
- `src/jobs/define.test.ts`: one `job` line per fallback verdict; none for `no-model`; none on success.
- `src/digest.test.ts`: the six-week snapshot, O3 and failure lines, no model, label summing, no-grade guard, purity.
- `src/api/event.test.ts`: `job` posted → 400, nothing written.

### Integration Tests

- `src/api/digest.test.ts`: real `data/` writes through `makeDataDir` + `writeDataFile`, rewrite rules, empty log, profile target.
- `src/server.test.ts`: key-leak walk covers `/api/digest`; bad `?day=` → 400; foreign Origin refused.
- `src/marking/parent-dom.test.ts`: the page renders the route's shape as text.

No socket or realtime code: the realtime integration rule does not apply.

### Edge Cases

| Edge case | Where verified |
|---|---|
| Empty week between active weeks (W44) | `src/digest.test.ts` test 1 (snapshot) |
| Week spanning two months: spend month = reference day's month (W44 → November) | `src/digest.test.ts` test 1 |
| No model configured (`preset: "none"` still stores a cap) | `src/digest.test.ts` test 3; `src/api/digest.test.ts` test 6 |
| `no-model` fallback not recorded | `src/jobs/define.test.ts` no-model loop (B2 step 3) |
| Retry then fallback = one line, not two | `src/jobs/define.test.ts` `rows` with `calls: 2` (B2 step 2) |
| O3 in use, no photos this week | `src/digest.test.ts` test 2 (W47) |
| Photos taken but none marked | `src/digest.test.ts` (add to test 2: a W45-only unmarked variant) |
| Last week's file refreshed by a current-week view; a `?day=` in another week writes nothing | `src/api/digest.test.ts` tests 2 and 3 |
| Empty log creates nothing | `src/api/digest.test.ts` test 4 |
| `?day=` not a real date | `src/server.test.ts` |
| Line text with markup | `src/marking/parent-dom.test.ts` test 2 |
| Posting a `job` event | `src/api/event.test.ts` |
| MCP `write_event` with `type: "job"` | `src/mcp/tools.test.ts:165` loops over every type with `MCP_WRITABLE[t] === false`, so `job: false` is covered with no new test |
| Append of `job@1` fails (read-only data) | not tested: the `try/catch` mirrors `src/api/event.ts:48-57`, whose failure path is also untested; named here so a reviewer can ask |
| Shape-5 `state.json` from before this ticket | E2 replay-check run |

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
bunx tsc --noEmit
bunx biome check .
```

### Level 2: Unit Tests

```bash
bun test src/events src/jobs src/digest.test.ts src/api/event.test.ts
```

### Level 3: Integration Tests

```bash
bun test src/api/digest.test.ts src/server.test.ts src/marking/parent-dom.test.ts
bun run check
```

### Level 4: Manual Validation

All steps in `~/Desktop/study-tutor-t15`, which has no `data/` of its own (fresh worktree). If one exists, move it aside first.

- **M1. Files.** With `bun run dev` running on an empty `data/`: POST one attempt through `/api/event` (the server stamps today's `t`), e.g. `curl -s -X POST -H 'Content-Type: application/json' -d '{"v":1,"type":"attempt","item":"maths/R9/1","topic":"1MA1/R9","correct":true,"sure":true,"answer":"12"}' http://127.0.0.1:<port>/api/event` (port from the dev server's output; copy the body shape from `src/events/__fixtures__/attempt.v1.jsonl`). Then `curl -s http://127.0.0.1:<port>/api/digest`. `ls -l data/digest/` shows this week's and last week's files, owner-only; this week's says `Practice days: 1 of 3.` Then `curl -s 'http://127.0.0.1:<port>/api/digest?day=2026-11-15'`: body returned, `ls data/digest/` unchanged. (The six-week fixture runs October to November, after today, so it cannot exercise the file rule; it is exercised in `src/api/digest.test.ts`.)
- **M2. Page.** Open `http://127.0.0.1:4731/` → footer link → `parent.html?day=2026-11-15` shows both weeks with the same lines as the files. Open `parent.html` without `day` → this week shows the M1 attempt as 1 practice day.
- **M3. A real failed job.** Setup page (`/setup.html`): pick "Other OpenAI-compatible" (`custom`, `src/config.ts:101-107`: no key needed, base URL typed by the parent; `http://` is allowed for this computer) with base URL `http://127.0.0.1:9/v1` (closed port) and any model name. Open the chat panel and ask for a hint. `tail -1 data/events.jsonl` shows `{"type":"job","job":"hint","reason":"network"…}` (or `timeout`); reload `parent.html` → "Model calls that did not work: 1 (no connection 1)…".
- **M4. No model.** Setup → "No model". Ask for a hint. No new `job` line; the digest's spend line reads `… No model is set up.` although `config.json` still holds a `cap`.
- **M5. Prose.** Read every string on the page aloud. British English, sentence case, no `!`, no grade words.

### Level 5: Additional Validation (Optional)

`agent-browser` for M2 screenshots (memory: scroll before click on below-the-fold links).

---

## ACCEPTANCE CRITERIA

- [ ] AC 1. A digest from the six-week fixture matches the checked-in, hand-derived snapshot `src/__fixtures__/digest-six-weeks.md` (`src/digest.test.ts` test 1).
- [ ] AC 2. No grade prediction: every digest string passes `guardReply`'s grade, exclamation and emoji checks, and the check fires on a planted grade line (`src/digest.test.ts` test 5).
- [ ] AC 3. A failed model job (any reason but `no-model`) leaves exactly one `job@1 {job, reason}` line; nothing else about the call reaches the log (`src/jobs/define.test.ts`; `KEYS["job@1"]`).
- [ ] AC 4. `GET /api/digest` returns this week and last week; `app/parent.html` shows them as text (`src/api/digest.test.ts`, `src/marking/parent-dom.test.ts`, M1, M2).
- [ ] AC 5. `data/digest/<iso-week>.md` is written per D7: a current-week view rewrites this week's and last week's files; a `?day=` in another week writes nothing; an empty log writes nothing (`src/api/digest.test.ts` tests 1-4).
- [ ] AC 6. `bun run check` green; references updated; no regression in job, route or replay tests.
- [ ] The five facts named by the ticket each have a line: practice days against target, re-tests taken and passed, marks left on the table (O3 in use), tokens this month against the cap, failed model calls.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] B2 and C3 mutation runs recorded in the execution report (red under mutation, green after revert)
- [ ] All validation commands executed successfully
- [ ] Every page and digest string passed `no-ai-slop` then `humanizer`
- [ ] Manual M1-M5 done, results in the execution report
- [ ] PR body restates the guard (B1 GOTCHA) per CLAUDE.md

---

## OPEN QUESTIONS / ASSUMPTIONS

- **Q1 (PRD Q7, open; a product question, not an execution risk).** Digest content and frequency. This plan builds exactly what the ticket specifies under tickets A4 (weekly, factual, five facts, page plus file), so implementing it does not wait on Q7. If Q7 is later answered differently, the change is contained: `buildDigest`'s line list, `REASON_TEXT` wording and `digest-six-weeks.md`. The event, state, route, file rules and page stay as they are. The PR body states that Q7 is still open so the reviewer can see it.
- **Q2 (architecture Q13, open).** Where the digest goes. Default: page plus `data/digest/`. An outbound channel would break "Outbound: the configured provider and the GitHub releases feed, nothing else" (CLAUDE.md "Network") and is a separate decision.
- **Q3. Which week the page opens on.** It shows both this week so far and last week, so a Monday view is not read as a failed week. Worst case: on Monday this week shows "0 of 3"; the last-week section sits directly below it.
- **Q4. Spend month for a past week (D6).** Worst case: the line includes spend after the week ended, so it can overstate and never understate. The line names the month.
- **Q5. `cap` reached floods the log?** Every job after the cap is reached writes one `job` line. Worst case, expected (not measured): a session makes at most a few model calls (hint, guess-first, teach-back, one photo), so the number of lines a session adds stays in single figures. Each line is under 100 bytes, so the log grows by about 1 kB a session; `events.md` "What accumulates" allows a few kB a session.
- **A1.** No GitHub release exists (observed: `gh release list` empty on 2026-09-29), so `State` shape and the new `(type, v)` may change freely; `job@1` is new, so nothing is edited in place anyway.

## NOTES (open canvas)

**Alternatives rejected.**

- *Count retests and failures straight from lines in `digest.ts`* (no shape bump). Rejected: a second fold over events would duplicate the London-day and week rules and drift from replay; the failure event needs a reducer case anyway, so the shape bumps regardless.
- *`failed?: string` on `usage@1`*. Rejected: usage is written only on an HTTP answer; four of the eight reasons never get there.
- *Record in `chatJson`* instead of `defineJob`. Rejected: `shape` and `guard` are decided in `defineJob`, and a retried `not-json` would log twice.
- *`toMatchSnapshot`*. Rejected per D4.
- *Default the page to last complete week only*. Rejected: the pupil opening the page mid-week would see nothing about the current week.

**Data flow.**

```
defineJob.run ──fallback (≠ no-model)──▶ appendEvent job@1 ──▶ events.jsonl
events.jsonl ─▶ replay ─▶ State{flame, retests(taken,passed), photos, tokens, failed}
State + profile.weeklyTarget + config.cap + day ─▶ buildDigest ─▶ {week,title,lines}
   ├─▶ digestMarkdown ─▶ writeDataFile data/digest/<week>.md  (D7 rules)
   └─▶ GET /api/digest {now,last} ─▶ parent.js textContent
```

**Guard restatement (CLAUDE.md, required in the PR body).** The only change under `src/jobs` appends `{job, reason}` after the verdict. It adds no prompt, changes no prompt and passes no item or answer anywhere. `KEYS["job@1"]` is the enforcement: `appendEvent` writes only `job` and `reason`. The digest reads `State`, which holds no correct answer (`replay.test.ts` "guard: derived state carries no correct answer or mark scheme"), and calls no model.

**Size.** Expected ~450-550 lines including tests, above the ticket's expected 300-500 because of the failure event the ticket did not know was missing.

**Confidence.** 10/10 that the plan executes in one pass. Every fact it states about existing code was read from source and cited. Every figure it depends on was run at planning time (observed 2026-09-29):

| Former risk | How it was closed |
|---|---|
| R1 log-length drift from the new `job` line | Probe run over every test file: 46 recordable fallbacks in 7 files, none of which asserts a whole-log length; no route test is on a recording path; every log reader filters by type (B3). |
| Snapshot figures hand-derived | Recomputed by `replay` on the fixture; all six weeks match (C2). |
| Two-way reason pin might not compile or bite | Compiled with this repo's `tsc`: passes on match, fails on missing and on extra (B1). |
| B2 test shape guessed | Written against the actual `rows` table and `withData`/`mockFetch`/`countUsage` helpers (B2). |
| `MCP write_event` coverage | `src/mcp/tools.test.ts:165` loops over non-writable types using each fixture's first line; `job.v1.jsonl` line 1 is well formed (A2). |
| Title differs between ICU builds | `Intl` removed; `MONTHS` table (C1). |
| No-model detection wrong | `saveSetup` keeps `cap` for `preset: "none"` (`src/config.ts:296-311`); detection uses the preset (D1). |
| M3 relied on an unverified preset | `custom` preset: no key, parent-typed base URL (`src/config.ts:101-107`). |
| R2 PRD Q7 open | Out of the execution path: the ticket fixes the content under A4; a later answer changes one function and one fixture (Q1). |

What 10/10 does not cover: the prose gate (`no-ai-slop`, `humanizer`) may reword lines. Only the wording in C1 and C2 changes then; the numbers and line order stay fixed.

## AMENDMENTS

- 2026-09-29 — before approval, advisor review: D7 changed from "past week written only when missing" (froze a week viewed mid-week) to "a current-week view rewrites this and last week; another-week `?day=` writes nothing"; no-model detection moved from `cap === null` to `preset === "none"` (a "No model" save keeps its cap); title built from a `MONTHS` table instead of `Intl`; A0 added for the shape-5 baseline; M1, M3 and M4 made concrete.
- 2026-09-29 — risks closed by measurement before implementation: a probe over the test suite showed no whole-log count sits on a recording path (B3 is now a check, not a fix-up step); B2 rewritten against the real `rows` table; snapshot figures and the reason pin observed; Q7 moved out of the execution path. Confidence 8 → 10.
- 2026-09-29 — after implementation (report `.claude/reports/t15-parent-digest-report.md`): A0 grep matches the pretty-printed file; A3 also touches `src/flow/xp.test.ts`; B2 derives expected lines from `by`/`reason` and adds a `console.error` spy so the no-model mutation fails the tests; two `REASON_TEXT` labels and the page footer reworded by the prose gate; C3 label order follows `JOB_REASONS`; D1 builds `now` from the Sunday for a week other than the current one, with D2 test 7. Packaging needs no change: `scripts/build.ts` copies `app/` whole.
