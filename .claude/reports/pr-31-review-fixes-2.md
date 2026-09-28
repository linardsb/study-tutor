# PR #31 review fixes, round 2

Review: `.claude/code-reviews/pr-31-review-2.md` (posted as the PR comment, 2026-09-28). Head reviewed `ce64fc6`.
Fix commit: the branch commit `fix: T7 review round 2: …` (its hash is in the PR body's Validation section).
No direction given with the review, so the triage follows its own recommendation: all three Lows are a few
lines each and sit in files this PR already opens, so all three land here.

## Triage

| Code | Sev | Call | Where |
|---|---|---|---|
| F1 | Low | fixed | `app/case.js`, `src/marking/case.test.ts` |
| F2 | Low | fixed: the duplicate test removed; PR body "What changed" corrected | `src/content/pack.test.ts`, PR body |
| F3 | Low | fixed: PR body Validation carries the `ce64fc6` run and this round's; the generator figure is now sourced; `case.js:3` invariant reworded | PR body, `app/case.js` |

Nothing needs a manual look beyond the browser run below. Nothing dropped as noise. Nothing deferred.
The `.claude/skills/piv-create-pr/SKILL.md` edit in the working tree is not this PR's (round-1 F8 said the
same) and stays uncommitted.

## Fixes

**F1.** The after-save decision moves into `afterSave(saved, isReask, bet, correct, hasReask)`, a pure
function on the `detective` global the Bun harness already loads, returning `"unsaved"`, `"reask"` or
`"done"`. `"unsaved"` appends `NOT_SAVED` and nothing else: no "Back tomorrow.", no re-ask, since nothing is
on record and a reload shows the case again. A terminal `.catch` appends "Something went wrong. Reload the
page." (a reload shows the record and, for a lone confident miss, the re-ask `reaskOwed` still owes).
Test: `src/marking/case.test.ts` "afterSave: a failed save gets no "Back tomorrow." …", probing the
finding's own input, `saved === false`, at bet 3 wrong and at bet 1 right, plus the four `saved` branches.
Run with `afterSave` extracted but the old decision kept (09:13:44Z): `3 pass 1 fail`, `Expected: "unsaved"
Received: "done"`. With the fix (09:13:54Z): `4 pass 0 fail`.
New failure mode of the mechanism: the catch fires only when the callback throws after a successful save,
so its text must not say "Not saved"; it says "Reload the page", which is the recovery. Not unit-tested
(needs a DOM); covered by reading.
Browser run (observed, 09:14:52Z): scratch `startServer` on 4790 with an empty `data/`, `case.html`, pick
option 0 and bet 3 by `.click()` in page context, server killed (`curl` 000), Check clicked. Feedback ends
"Not this time. You bet 3. … Not saved. Check the tutor window is still open."; the working and the
calibration line show; `#case p.note` is `[]` (no "Back tomorrow."); no re-ask; `data/` still empty.

**F2.** `src/content/pack.test.ts:191-196` removed; the surviving test at line 70 covers both of its
assertions and the "not a list of items" refusal. `bun test src/content/pack.test.ts`: 7 pass (was 8).
The PR body's "What changed" no longer lists `loadItems` as this PR's change: after the merge of #30,
`git diff origin/main..HEAD -- src/content/pack.ts` is `conceptShaped` only.

**F3.** PR body Validation now records the merge run at `ce64fc6` (178 pass, 62687 expect() calls,
2026-09-27T16:20:41Z, from the merge commit message) and this round's run below. The round-1 line's
"generators 6300 runs pass" is relabelled: not re-run that round; observed at `5eabb48` and again here.
`case.js:3` now reads "enter the DOM only after the pupil has answered: inside the check handler, or in
`renderDone` for a day whose answer is already on record."

## Numbers chased

| Retired value or noun | `grep -n` | Hits and action |
|---|---|---|
| `6300` | `grep -rn "6300" .claude/plans/t7-detective-case.md .claude/reports/t7-detective-case-report.md .claude/reports/pr-31-review-fixes.md` | report line 61, the implementation run (kept, `observed` there); round-1 fixes report says the script was not re-run (true); PR body relabelled |
| `loadItems` as this PR's change | `grep -n "loadItems" .claude/reports/t7-detective-case-report.md .claude/plans/t7-detective-case.md` | report lines 19-20 and plan lines 155, 253, 323, 339, 626, 811: what the branch did before the merge, left as history; PR body corrected |
| "only inside the check handler" | `grep -rn "only inside the check handler\|only in the check handler" app/ .claude/plans/t7-detective-case.md .claude/reports/pr-31-review-fixes.md` | `case.js:3` reworded; plan 741, 751 are the pre-implementation sketch (left as in round 1); round-1 fixes report line 94 is that round's record, left; PR body guard paragraph already says "in the check handler or, for a day on record, in `renderDone`" after this edit |
| `178` / `62687` | PR body | unchanged by this round: one test removed (F2), one added (F1) |

## The guard

`src/jobs`, `src/mcp` and every prompt are untouched this round (`git diff --stat`: `app/case.js`,
`src/content/pack.test.ts`, `src/marking/case.test.ts`, this report, the review file). `Case.correct` and
`Case.working` still travel to the browser only in `/api/case` and enter the DOM only after the pupil has
answered: in the check handler, or in `renderDone` for a day already on record. `afterSave` takes booleans
and a bet, never the case.

## Closing commands (run against the fixed tree)

- F1: `bun test src/marking/case.test.ts` (09:13:54Z): `4 pass 0 fail 23 expect() calls`. Browser run above (09:14:52Z).
- F2: `bun test src/content/pack.test.ts` (09:14Z): `7 pass 0 fail 2269 expect() calls`; `grep -n '^test("loadItems' src/content/pack.test.ts`: line 70 only.
- F3: `sed -n '3,5p' app/case.js` shows the new sentence; PR body read back with `gh pr view 31 --json body` after the edit.

## Validation

`record-gate.sh -- bun run check` on the fixed tree (2026-09-28T09:15:03Z, exit 0; its "GATE SHORT" line
is the turbo-only parser, not a verdict): `tsc --noEmit` clean; Biome 0 errors, the same 4
`noDescendingSpecificity` warnings in `app/style.css`; `bun test` 178 pass, 0 fail, 20 files, 62687
expect() calls (`observed`). `bun scripts/test-generators.ts` (09:15:13Z): all 6300 runs pass (`observed`).
