# PR #33 review, round 1: T5 flow

**PR** https://github.com/linardsb/study-tutor/pull/33 · **Head** `3c353f5` · **Base** main @ `85fc13f0018d94ef9a3fbad9c67ee10531f99a43`
**Plan** `.claude/plans/t5-flow.md` · **Report** `.claude/reports/t5-flow-report.md` · round 1, so no guarantees or fix-mechanism pass (the base has not moved: live `origin/main` = `85fc13f`).

## Summary

The flow layer is pure and deterministic, XP is server-written, and the answer-withheld guard holds (no `src/jobs`, `src/mcp` or prompt change; boss output is ids and seeds only). One Medium: a 0/0 re-test is accepted and demotes a topic. Three Low. The six documented deviations are intentional and not flagged.

**Recommendation: request changes** (F1 is one guard and one test).

## Issues

### Medium

**F1** `src/api/event.ts:30-36` — a re-test scored 0 out of 0 is saved and knocks the topic back to rung 1.
POST `{v:1,type:"retest",topic:"U349",score:0,of:0,passed:false}`: `outOf(0,0)` (`src/events/types.ts:126`) accepts it, `passes(0,0)` (`src/flow/ladder.ts:43`) is `false`, which matches the posted flag, so `refusal()` lets it through → 201. Replay applies `afterRetest(rung,false)`, so a secure topic at rung 4 drops to 1, and the post also earns 20 XP, a flame day and a 0/0 row in `retests`. The plan's GOTCHA only required that `of = 0` never passes; accepting it as a fail is the gap. Distinct from open Q3, because it moves a rung, not only XP.
Fix: in `refusal()`, refuse a `retest` with `of < 1`; add a `{score:0,of:0,passed:false}` row expecting 400 and no `data/`.

### Low

**F2** `src/flow/boss.ts:48-89` — a due topic with no generator and no pack items gets zero slots but stays in `topics`; if every due topic is like that, `boss()` returns a non-null boss with `slots: []`, and `pickStep` offers it ahead of lessons. Unreachable with the maths pack (every topic has a generator, report deviation 4); a later subject pack could hit it. Fix: drop topics with no slots before the empty check.

**F3** Two assertions cannot fail.
- `src/flow/boss.test.ts:151`: if `boss()` returned null, `JSON.stringify(null)` is `"null"` and every `not.toContain` passes. Add `expect(b).not.toBeNull()` first.
- `src/flow/next.test.ts:108`: `n.step.kind === "lesson" && n.step.topic` is `false` for any other step, so `.not.toBe(dependent.id)` always passes. Assert the kind separately.

**F4** `src/flow/properties.test.ts:219-233` — the no-model scan checks only a `../providers` import and the literal `fetch(`. It misses an import from `../jobs` (the likelier route for a model call into `src/flow`) and `globalThis.fetch`. Fix: also fail on `from "../jobs`, and match `\bfetch\b`.

**F5** (numbers) PR body, Validation: "299 pass, 0 fail, 63,476 expect() calls, 11.46 s (observed, `.claude/last-gate.json` `head` = `3c353f5`)". `last-gate.json` records the head and exit code 0 but no counts and an empty `elapsed`, so it cannot be the source of the figures; the implementation report gives 11.06 s for the final run. The counts are correct (re-observed below); the timing's run is unnamed and differs between the two surfaces. Fix: cite the run that printed them, or use one figure in both places.

## Validation

| Check | Result |
|---|---|
| `bun run check` at `3c353f5` (tsc, biome, bun test) | exit 0; 299 pass, 0 fail, 63,476 expect() calls, 28 files, 9.31 s (observed, this review) |
| biome warnings | 4, all `noDescendingSpecificity` in `app/style.css`, untouched by this PR (observed) |
| CI | SonarCloud pass (observed, `gh pr checks 33`); no other checks reported |
| Diff size in PR body | src 407 / tests 933 / `.claude/` 644 = 1,984 insertions, 21 deletions, 22 files: re-derived from `git diff --numstat origin/main..HEAD`, matches |

The two stderr lines in the test output (`EISDIR`, `Could not save the XP line`) come from tests that exercise those failure paths on purpose.

## Checked and clean

- `dayRoute` matches the old `getCase` (day check, 400/500 text, pack load, clock read); `/api/case` test unchanged and green.
- ISO week and London day: flame, `xp.byWeek`, `retests` and `openToday` all key off `localDay(t)`; 2026-12-31/2027-01-01 → 2026-W53 is covered by `clock.test.ts`.
- Non-integer, negative and score-above-of re-tests are refused by `appendEvent`'s parser even when `refusal()` passes them.
- XP: posted `xp` refused before `data/` exists; `xp` and `retest` are not in `MCP_WRITABLE`; the xp line is appended synchronously after its event.
- Old `state.json`: `currentState` always replays the log, so a shape-2 file never reaches `nextStep`; `check.ts` projects contract paths only.
- Replay: `session@1`/`retest@1` add fields only; the only change to existing records is the PR #31 F9 re-ask cap.
- No fetch, model or clock in `src/flow`; only `src/events/append` writes.

## What's good

- The xp refusal returns before any disk access, and the test asserts `data/` is still absent.
- `guardrail` compares rates by cross-multiplying, and `passes` is integer arithmetic.
- Deviation 5 rewrote a boss test that could never fail, and the bare-xp mutation is kept as a permanent property-3 test.
- The report labels every figure and separates observed from derived (the 742,190 parse count and its 2.0x ratio).

## Recommendation

**Request changes.** Fix F1; F2–F5 are small and can go in the same pass. Next: `piv-fix-review-findings` on this file.
