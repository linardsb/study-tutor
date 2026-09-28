# PR #33 review fixes, round 1

Review: https://github.com/linardsb/study-tutor/pull/33#issuecomment-5868282154 (same text as `.claude/code-reviews/pr-33-review.md`). PR open at triage, worktree clean, no interrupted merge or rebase. No scope direction was given; the review asked for F1 and said F2–F5 fit the same pass, so all five were taken as fix-now. F4 is fixed in part and disputed in part.

## Fixed

**F1 (Medium)** `src/api/event.ts` `refusal()`: a `retest` with `of` below 1 is refused before the pass check. 0 of 0 agreed with `passed: false`, so it was saved and dropped the topic to rung 1. `outOf` in `src/events/types.ts` is unchanged, so no past log line changes meaning.
- Test: `event.test.ts` "a retest out of 0 is refused, so it cannot drop a rung", with the review's body `{v:1,type:"retest",topic:"U349",score:0,of:0,passed:false}` verbatim. Expects 400 and no `data/`.
- Against the unfixed code: failed, got 201 (observed, 2026-09-28). After the fix: passes (observed).
- New failure mode of the mechanism: the check needs `typeof of === "number"`, so a non-number `of` skips it. That case still reaches `appendEvent`'s parser, which refuses it (review, "Checked and clean", non-integer re-tests). Nothing is written for either path.

**F2 (Low)** `src/flow/boss.ts` `boss()`: each due topic's slots are built first, a topic with none is dropped, and then the three-topic cap applies. If no due topic has a question, `boss()` returns null and `pickStep` falls through to a lesson (`src/flow/next.ts:79-81` already handles null).
- Test: `boss.test.ts` "a due topic with no generator and no items takes no place in the boss". With `gens` and `items` emptied, one due topic gives null. With A (no items) due first and B, C, D (items, no generators) after it, the boss is `[B, C, D]`.
- Against the unfixed code: failed (observed). After the fix: passes (observed).
- Mutation M4 (the cap moved ahead of the filter, so a question-less topic still takes a place): the test fails, the boss is missing D (`1MA1/P8`) (observed). A first version of this test had only A and B due, which never reaches the cap of 3; it was rewritten with four due topics in this round.

**F3 (Low)** Two assertions that could not fail.
- `boss.test.ts` "unlabelled and answer-free" now asserts `not.toBeNull()` first. Mutation M1 (`boss()` returns null): old test 1 pass, new test 1 fail (observed).
- `next.test.ts` "a new topic whose prerequisite is not started…" now asserts `n.step.kind` is `"lesson"` on its own. It passes on the real code, so the setup was already right. Mutation M2 (`pickStep` returns `none` while every topic is on rung 0, which only hits the first call): old test 1 pass, new test 1 fail (observed). A plain "always none" mutation failed both, because the test's second half catches it; M2 is the one that isolates the first assertion.

**F4, fetch half (Low)** `properties.test.ts` "no model call anywhere in src/flow" now matches `\bfetch\b` in place of the literal `fetch(`. Mutation M3 (append `// globalThis.fetch` to `boss.ts`): old test 1 pass, new test 1 fail (observed). No `fetch` appears in `src/flow` today, so there are no false positives.

**F5 (Low, numbers)** Both surfaces now cite one run. `bun run check` on the final fixed tree (after the M4 rewrite), 2026-09-28: exit 0, 301 pass, 0 fail, 63,485 expect() calls, 28 files, 7.43 s (observed). The PR body no longer cites `last-gate.json` for counts.

## Disputed (won't fix)

**F4, `../jobs` half.** The review asks the scan to also fail on `from "../jobs"`. CLAUDE.md, "Where new code goes", says a model job is registered in `src/flow`, "not the other way round", and plan Task 10 (`.claude/plans/t5-flow.md:396`) says "Do not assert no `../jobs`: T9 registers jobs from `src/flow`". The assertion would fail as soon as T9 lands. The model boundary is `src/providers` (the one fetch), which the scan still checks. Noted in the PR body under "Notes for the reviewer".

## Deferred

None.

## Manual look

None needed. Every fix has a unit test that failed before it (F1, F2) or a mutation that the old test missed and the new one catches (F3, F4).

## Stale-copy sweep

Commands run on 2026-09-28 before the edits, over the plan, the report, the PR body (`gh pr view 33 --json body` saved to the scratchpad) and `src/flow/*.ts`:

| grep -n | Hits before | Action |
|---|---|---|
| `299` | PR body :24; report :39 | Both now 301 from the one run above |
| `63,476` | PR body :24; report :39 | Both now 63,485 |
| `11\.46` | PR body :24 | Replaced with 7.43 s |
| `11\.06` | report :39 | Replaced with 7.43 s |
| `last-gate` | PR body :24 | Citation removed |
| `none is due` | plan :300 (the Task 7 code snippet) | Left as a plan snippet; dated line added under the plan's Amendments |
| `fetch(` / `provider import` | report :35; PR body "What changed"; plan :396 | Report and PR body now say "`fetch` reference"; plan :396 is the task instruction and is correct |
| `refuses a posted` | report :7; PR body "What changed" | Both now list the `of` below 1 refusal |
| `(6 new)` / `(11)` | report :31, :32 | Now 7 and 12, with the new tests named |
| Size line (`1,984`) | PR body "What changed" | Recomputed from `git diff --numstat origin/main..HEAD` after the commit |

## Validation

`bun run check` (tsc, biome, bun test), 2026-09-28, final tree: exit 0; 301 pass, 0 fail, 63,485 expect() calls, 7.43 s; biome 4 warnings, the same `app/style.css` ones from `main` (observed).

## Pushed

Two commits on `feature/t5-flow`: `9223cbd` (the fixes) and the one after it (the F2 cap test rewritten with four due topics, and the final figures). `git log --oneline 3c353f5..origin/feature/t5-flow` lists both. The PR body's Validation, size line and "Notes for the reviewer" were updated with `gh pr edit 33 --body-file` after the second push.
