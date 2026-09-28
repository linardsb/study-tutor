# Implementation Report — T5 flow: session machine, ladder pass rule, XP, weekly flame, boss, next

**Plan**: `.claude/plans/t5-flow.md`   **Branch**: `feature/t5-flow` (worktree `~/Desktop/study-tutor-t5`)   **Status**: COMPLETE

## Summary

`src/flow` now answers "what should the pupil do next?" from the log, the pack and the day, with no model, clock or file inside it. `GET /api/next` returns one step (continue, boss, lesson, practice or none), the exact session event body to post, and the week's flame. `postEvent` is now the only XP writer. It refuses a posted `xp`, a `retest` with `of` below 1, and a `retest` whose `passed` disagrees with 2 of 3, and it appends the `xp` line after each scoring event. Replay moves to `shape: 3` with `session` and `retests`, and keeps at most one re-ask pair per case day (PR #31 F9).

**Guard restatement:** no file in `src/jobs`, `src/mcp` or any prompt changed, so no path puts an item answer into a model prompt. The boss output carries topic ids, item ids and seeds only. The test `boss.test.ts` "unlabelled and answer-free" asserts no `answers`, `working`, `mark_scheme`, `misconceptions` or `stem` key and no topic title.

## Tasks completed

- Task 1: `passes`, `RETEST_SLOTS` → `src/flow/ladder.ts`, `ladder.test.ts` (UPDATE)
- Task 2: `onSession`, `startBody`, `endBody`, `openToday` → `src/flow/session.ts` + test (CREATE)
- Task 3: `XP`, `xpFor`, `flame`, `guardrail` → `src/flow/xp.ts` + test (CREATE)
- Task 4: `shape: 3`, `session`, `retests`, F9 → `src/events/replay.ts`, `replay.test.ts` (UPDATE)
- Task 5: xp refusal, retest pass check, xp append → `src/api/event.ts`, `event.test.ts`, `src/server.test.ts` (UPDATE)
- Task 6: `boss`, `dueTopics`, `BossSlot`, `MAX_BOSS_TOPICS` → `src/flow/boss.ts` + test (CREATE); `shuffle` exported from `src/flow/detective.ts` (UPDATE)
- Task 7: `nextStep`, `Next`, `Step` → `src/flow/next.ts` + test (CREATE)
- Task 8: `nextForDay` → `src/api/next.ts` (CREATE)
- Task 9: `GET /api/next` → `src/server.ts`, `server.test.ts` (UPDATE)
- Task 10: property tests and the no-model scan → `src/flow/properties.test.ts` (CREATE)
- Task 11: routes, replay keys, profile → `.claude/references/events.md` (UPDATE)

## Tests added

- `ladder.test.ts`: 8 `passes` rows from the plan.
- `session.test.ts` (5): start opens, start replaces, end closes or stays idle, bodies parse and carry no `topic` key when null, `openToday` across the BST boundary (`2026-10-11T23:30:00Z` is 12 Oct).
- `xp.test.ts` (7): each scoring amount, null for session/case/intake/xp, flame per ISO week, guardrail not falling (4/6, 70 → 5/6, 50), falling (5/6, 50 → 2/3, 60), fewer than two weeks.
- `replay.test.ts`: `shape` 3, the plan's `retests` map for six-weeks, `session` null, rungs and XP constants unchanged; new "a second re-ask the same day is ignored" (with and without a first answer).
- `event.test.ts` (7 new): attempt + xp line, teachback 15 and retest 20, session/intake one line, posted xp refused with no `data/`, retest 0/3 passed and 2/3 failed refused, retest 0/0 refused (PR #33 F1), a failed xp append still 201 with one line.
- `boss.test.ts` (12): none due, two due in nextDue order, tie on pack order with a non-pack topic ignored, confident-wrong item slotted and `#gen` skipped, oldest-first cap at three, non-due topic's item excluded, deterministic and a day-varying seed, cap at 3 topics, mixed order over 30 days, the no-generator fallback, a due topic with no question takes no place (PR #33 F2), answer-free.
- `next.test.ts` (8): empty → first topic, red intake → that topic, due → boss over a red unstarted topic, continue today and not yesterday, practice by lowest rung then nextDue, unstarted prerequisite skipped, empty pack → none with flame target, deterministic.
- `server.test.ts`: `/api/next` 200 lesson on empty data, `?day=` echoed, bad days 400, foreign Origin 403, red intake names the topic.
- `properties.test.ts` (6): 200 seeded histories in four batches of 50 (properties 1–5), bare-xp line breaks property 3, no provider import or `fetch` reference in `src/flow`.

## Validation results

- `bun run check`: 301 pass, 0 fail, 63,485 expect() calls, 7.43 s (observed, 2026-09-28 run on the final PR #33 round-1 fix tree; before the fixes: 299 pass, 63,476 calls). tsc and biome are clean, since `check` runs them first.
- Level 1b complexity lint on the 9 named files: 0 diagnostics (observed).
- `bun scripts/test-generators.ts`: all 6300 runs pass (observed).
- `bun test src/flow/properties.test.ts`: 6 pass in 5.54 s, and 7.45 s and 7.56 s on later runs under load (observed). The histories average 85.6 lines (60 events plus their xp lines), which gives 742,190 prefix parses over 200 seeds (observed). That is 2.0× the spike's 370,819 (derived: 742,190 / 370,819), which accounts for the gap from the spike's 2.78 s.
- Mutation, Task 5 (xp append removed): 3 tests red (the updated U-code attempt test, "an attempt appends its xp line", "a teachback earns 15 and a passed retest 20"). The xp-refusal test stayed green. Reverted (observed).
- Mutation, Task 10 (`attempt@1` sets `rung = afterRetest(rung, true)`): 31 property-1 breaks and 0 property-3 breaks across the four batches. Reverted (observed).
- Mutation, Task 10 (bare `xp` line first): kept as a permanent test, which asserts a property-3 break. It passes (observed).
- Level 4, steps 1–8 against `bun run dev` on port 4731 (observed, 2026-09-28): lesson on `1MA1/R9/of-an-amount`, flame `{2026-W40, 0, 3}`. The start body posts and `/api/next` then says continue. The attempt is followed by an `xp` 10 line. A posted xp gets 400 and the line count stays at 3. A retest 0/3 passed gets 400. After the end body, `?day=+3` gives a boss with 3 slots, one of them `item: "1MA1/R9/of-an-amount#1"`, and 0 matches for the title. `/api/state` gives `3`, `{}`, `null`.
- Level 5: `synth-events --n 200`, then `replay-check` twice. The first run had no stored state ("No saved progress to compare; rebuilt from the log") and wrote `state.json`. The second compared against it and exited 0 with no refusal (observed). No shape-2 state written by an older build was compared.

## Deviations from the plan

1. **Property 1 widened for a re-test at rung 0 (open as Q8 for the user; AC 6 is ticked with the refined wording, not the original).** The plan's statement ("rises only on a passed re-test, or a lesson end 0 → 1") went red on seed 1. A **failed** re-test at rung 0 lands on learning (`afterRetest(0, false) === 1`, T2, pinned by `ladder.test.ts` row `[0, false, 1]`). The plan keeps `afterRetest` unchanged, so the property now also accepts "any re-test at rung 0 → 1". Like Q1, this is the ladder's entry to learning, not a climb. It never happens through the app: the boss only picks due topics, and a due topic is at rung 1 or higher. If a failed cold re-test at rung 0 should leave the topic at 0, that is a `ladder.ts` change for another ticket.
2. **Property seeds split into four `test.each` batches of 50.** All 200 in one test took 5.8 s and hit bun's 5 s default timeout (observed). H stays 200, as AC 6 requires. The cause is the parse count: 742,190 prefix parses, 2.0× the spike's (see Validation).
3. **`getCase` and `getNext` share one helper, `dayRoute`, in `src/server.ts`.** The plan kept a copy unless Sonar would flag duplication. The copy would have been about 20 identical lines, which is expected (not measured) to cross Sonar's duplicated-block threshold, so both routes now go through `dayRoute`. `/api/case` keeps its error text, status codes and behaviour, and the existing `/api/case` test passes unchanged.
4. **Added test: the no-generator fallback in `boss`.** Every maths topic has a generator (observed), so the plan's path "fill from the topic's other items" was unreachable with the real pack. It is tested with the pack's `gens` emptied.
5. **The "mixed" boss test asserts more than one topic change between neighbours.** "Some adjacent pair from different topics" holds for every order of two topics, including grouped ones, so it could never fail. The test now asserts that some day in the 30 has more than one change, which a grouped order (AAABBB) cannot give.
6. **`xpFor` uses `Object.hasOwn(XP, type)`**, not `type in XP`, so an inherited name such as `toString` is not read as a reason.

UX states: T5 builds no page, so no loading, empty, error or offline state was declared. `/api/next`'s error path is a plain 500 through `dayRoute`, as `/api/case` already does.

## Issues encountered

- The repo hook blocks `rm -rf`. The Level 4 and Level 5 `data/` folders were moved into the session scratchpad instead of deleted. The worktree has no `data/` now.
- The gate went from 1.56 s at baseline (plan, observed on 85fc13f) to 8.97–13.80 s over four full runs on this branch (observed; the machine was shared with other sessions). Per-file timing (observed): the property file took 7.56 s, and no other file took more than 0.6 s. The new T5 files took 14–66 ms each, so no other file regressed. The rest of the spread is load. If gate time matters, halving H halves the property cost (derived: the cost is linear in H), but AC 6 names 200.
- **Q8 (for the user):** a failed re-test at rung 0 lands on learning (rung 1), as T2 pinned it. (a) Accept it: AC 6 reads "a rung rises only on a passed re-test, a first lesson, or any re-test from rung 0 landing on learning". (b) A failed re-test at rung 0 stays at 0: a `ladder.ts` change for another ticket. No app path reaches it today.
- **For T6:** a `continue` step for an open boss session carries no `boss`. A reload in the middle of a boss gets the `end` body and no questions. T6 can post the end and call `/api/next` again, or T6/T9 can add the boss to `continue`.
- While measuring, a stray `git checkout 85fc13f -- .` reset the tracked files to the base commit. They were restored from the `wip: t5-flow` commit (`git checkout HEAD -- .`), and `git status` was clean afterwards (observed). Nothing was lost.
- Plan Q3 (attempt XP can be farmed by re-answering after a reload) is still open, as the plan assumed.
