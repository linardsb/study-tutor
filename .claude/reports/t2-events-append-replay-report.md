# Implementation Report — T2 events: types, append with `data/` confinement, replay, replay-check

**Plan**: `.claude/plans/t2-events-append-replay.md`   **Branch**: `feature/t2-events`   **Status**: COMPLETE

## Summary

The event record and its one derivation. `src/events/types.ts` defines nine event types with a compile-pinned
parser table. `src/events/append.ts` is the only writer under `data/`: it fsyncs each line, opens with
`O_NOFOLLOW`, writes owner-only files and uses realpath confinement. `src/events/replay.ts` is a pure reducer
keyed `type@v`, and `src/events/check.ts` with `scripts/replay-check.ts` refuses a build that lowers a rung.
`src/mcp/clock.ts` gives UTC stamps and London days; `src/flow/ladder.ts` holds the rung rule. S5 ran and is
recorded in the architecture doc.

## Gate override (Q1)

The plan gated implementation on the E1 two-week read (about 2026-10-11). Linards overrode it in writing on
2026-09-27 ("i dont have 14 days now"). The plan's stated cost applies if E1 fires wrong: this ticket's
work is sunk.

## Answer guard (CLAUDE.md "Restate the guard")

This ticket creates `src/mcp/clock.ts`. It adds no model call and no prompt. The answer stays withheld because:

1. Replay reads only `data/events.jsonl`. It never opens `content/`, so it never sees an item's `answers` or `mark_scheme`.
2. No event type carries an item's correct answer. `attempt.answer` is what the pupil typed, `retest` carries a
   score and `photo` a file path. An entry in the `confidentWrong` pool holds the pupil's wrong answer, and it
   exists only after an `attempt` event for that item.
3. So `state.json`, which T10's `read_state` will serve, cannot hold a correct answer for an item that has no
   attempt event. `replay.test.ts` asserts that the six-week state contains no `answers`, `markScheme` or `mark_scheme` key.

## Deviations from the ticket (intended, per the plan)

- **Q2: `usage` is a ninth event type.** The state the AC requires has a monthly token count, no listed type
  carries tokens, and `model-jobs.md` and T8 both name a token-count event. Recorded in `events.md` and under T8.
- **`replayCheck` lives in `src/events/check.ts`.** `scripts/replay-check.ts` is a thin CLI over it, because
  T11 calls the check from server start and `src/` must not import from `scripts/`.
- **Q4: T2 creates `src/flow/ladder.ts`, and T5 updates it.** Replay needs the rung rule. `ladder.ts` imports
  nothing, so there is no cycle. T5's file list in the ticket file now says so.

## Tasks completed

- 1 clock → `src/mcp/clock.ts`, `src/mcp/clock.test.ts` (CREATE)
- 2 ladder → `src/flow/ladder.ts`, `src/flow/ladder.test.ts` (CREATE)
- 3 types → `src/events/types.ts` (CREATE)
- 4 fixtures → `src/events/__fixtures__/{session,attempt,retest,teachback,intake,xp,squad,photo,usage}.v1.jsonl` (CREATE)
- 5 → `src/events/types.test.ts` (CREATE)
- 6 append → `src/events/append.ts` (CREATE)
- 7 → `src/events/__fixtures__/six-weeks.jsonl`, 33 lines verbatim (CREATE)
- 8 replay → `src/events/replay.ts`, `src/events/replay.test.ts` (CREATE)
- 9 → `src/events/append.test.ts`, `src/events/__fixtures__/append-many.ts` (CREATE)
- 10 → `src/events/check.ts`, `src/events/check.test.ts`, `scripts/replay-check.ts` (CREATE)
- 11 → `scripts/synth-events.ts` (CREATE)
- 12 S5 → `docs/prd/study-tutor-v2.architecture.md` (UPDATE, S5 result after S1)
- 13 → `.claude/references/events.md` (UPDATE, 36 lines, includes the Q5 rule)
- 13b → `docs/tickets/study-tutor-v2.md` (UPDATE, 3 lines: T5 files, T8 scope, T11 manual test)
- 14 gate: green

## Tests added

- `clock.test.ts` 4: ISO weeks incl. W53 and year boundary, `addDays`, `utcNow` format, six `localDay` cases across both clock changes.
- `ladder.test.ts` 12: 10-row `afterRetest` table, `afterLesson`, `afterRed`.
- `types.test.ts` 20: every `EVENT_KEYS` fixture exists and parses (9), ten refusals, extra keys ignored.
- `replay.test.ts` 14: six-week history (all values in the plan), answer guard, purity under `setSystemTime`, file order, four skipped lines, every fixture replays with 0 skipped (9).
- `append.test.ts` 14: plan tests 1–14.
- `check.test.ts` 7: plan tests 1–7.

Mutations, both halves, `observed`:

| Mutation | Red | Green |
|---|---|---|
| T3: delete `usage@1` from `FIELDS` | `tsc` TS2741 naming `"usage@1"` | — |
| T5: rename `usage.v1.jsonl` | fixture test for `usage@1` | every other test |
| T8: `localDay(e.t)` → `e.t.slice(0, 10)` | six-week test at `xp.byWeek` (W41 80 / W42 40 instead of 70 / 50) | the `topics` assertion before it; every other test |
| T8: drop `usage@1` from `CASES` | `tsc` TS2741 naming `"usage@1"` | — |
| T8: `NEXT_DAYS[3]` 30 → 31 | six-week test and skipped-lines test, both on R9 `2026-12-16` and N12 `2026-11-25` | file-order test and every other test |
| T9 (a) drop the `lstat` dangling check | test 8 | 5–7 and every other test |
| T9 (b) `r.startsWith("..")` | test 9 | 5–8 and every other test |
| T9 (c) drop `fs.fsyncSync(fd)` | test 2 | 1 and every other test |
| T9 (d) drop the newline prefix | test 3 | 1 and every other test |
| T9 (e) `t: now()` before the event keys | test 12 | 1 and every other test |
| T9 (f) drop `O_NOFOLLOW` | none (expected: the flag only closes the race window) | all 14 |

## Validation results

- `node_modules/.bin/tsc --noEmit`: clean.
- `node_modules/.bin/biome check --write .`: 22 files checked, 11 reformatted (line wrapping only).
- `bun run check`: 73 pass, 0 fail, 193 expect() calls, 7 files (`observed`, after the review fixes).
- `bun run check` after the PR #23 review fixes: 91 pass, 0 fail, 234 expect() calls, 8 files (`observed`). See `.claude/reports/pr-23-review-fixes.md`.
- `bun scripts/replay-check.ts --data <tmp with six-week fixture>`: prints the rebuild line, exit 0.
- `synth-events.ts --n 200 --seed 1`: 200 lines; a second run into a fresh dir is byte-identical (`cmp`).
- Level 4: step 1 as above (`head -3` shows `{"v":1,"t":"…Z","type":…`); step 2 is S5, in the architecture doc;
  step 3 `link → /etc` gives `Refused: link/passwd resolves outside the data folder`; step 4 grep finds no
  `events.jsonl` reference outside `src/events` (rc 1); step 5 `events.jsonl`, `state.json`,
  `state.prev.json` all `-rw-------`.

## Deviations from the plan

1. **`appendEvent` key order via `Object.assign`.** The plan's literal `{ v: event.v, t: "", ...event }` fails
   `tsc` with TS2783 ("'v' is specified more than once"). Now `Object.assign({ v: event.v, t: "" }, event)`,
   then `obj.t = now()`: same key order `v, t, type, …`, and the clock still wins (test 12, mutation (e)).
   Superseded by PR #23 review L2: `appendEvent` now copies only the fields in `KEYS`, with `t` set from the clock.
2. **Log opened `O_RDWR`, not `O_WRONLY`.** The plan reads the last byte through the append descriptor to
   check for a trailing newline, and `readSync` on a write-only fd throws `EBADF` (`observed`, tests 1–3 and
   13 red). `O_RDWR | O_APPEND` keeps writes at end-of-file; the two-writer test passes.
3. **Time zone mutation: flame and calibration not seen red separately.** `bun:test` stops a test at its
   first failing `expect`, which is `xp.byWeek`. `topics` is asserted first and stayed green, which is the
   half the plan asked for.
4. **S5 step 3 mutation.** The plan's `return passed ? rung : 1` does not type-check (`0` is not `OnLadder`).
   Used `passed ? (rung === 0 ? 1 : rung) : 1`: same effect (a pass no longer climbs).
5. **Ladder test tuple typed `[Rung, boolean, OnLadder]`.** The plan wrote `Rung` as the third element, and
   `expect(OnLadder).toBe(Rung)` fails `tsc` (TS2769).
6. **`replayCheck` change lines.** Step 6 also reports a rung that differs without falling (a rise); a topic
   in the new replay that the stored state lacks gets no line. The plan was silent on the second case.

## Prose gate

`no-ai-slop` ran on `.claude/references/events.md` and the S5 result block, followed by a `humanizer` read.
Neither found anything to change: no blacklisted words, no em dashes, no colon reveals, and every figure is labelled.

## Issues encountered

- Another Claude session was live in this repo. Its reflog showed a checkout to `feature/t3-maths-content-pack`
  and back, and `biome.json` briefly showed an edit that was not mine. It moved to its own worktree
  (`../study-tutor-t3`), and `biome.json` reverted to the committed state before any T2 commit. No T2 file was touched.
- The project's pre-tool hook blocks `rm -rf`; S5 and Level 4 ran in the session scratchpad instead of `mktemp -d`.
- `.claude/skills/piv-create-pr/SKILL.md` is modified in the working tree from before this ticket and is
  kept out of every T2 commit, as the plan says.
