# PR #43 review fixes, round 1

**Review**: https://github.com/linardsb/study-tutor/pull/43#issuecomment-5887751034 (0 Critical, 0 High, 3 Medium, 5 Low)
**Base of fixes**: `2e17251` · **Scope** (human call): fix all eight; L4 as a join-form hint.

## Fixed

| Code | Fix | Test (red on unfixed code, observed) |
|---|---|---|
| M1 | `joinSquad(body, dataDir, day)` refuses any change of squad or pupil with 409 while the current profile's squad has this week's `squad` event. This covers the two-join path (another squad, then back under a new name). `postJoinRoute` passes `localDay(utcNow())`. | `src/api/squad.test.ts` #14: `Expected: 409 Received: 200` on unfixed code. |
| M2 | Squad round: on each check, only "Correct." or "Not this time." is shown. The working and the named mistake appear only in the compare view after the save. The parent round is unchanged. | `src/marking/squad-dom.test.ts` #2: unfixed code rendered `…CheckCorrect.10% of 350 = 35…`. |
| M3 | `roundOf(squad, week, topic)` is split out of `squadRound`. Once this week's event exists, `getSquad` builds the view round (seeds, parent seeds, title, `parentDone` topic) from the event's topic. | `src/api/squad.test.ts` #15: `Expected: "1MA1/R4" Received: "1MA1/R9/of-an-amount"`. `roundOf` equality with `squadRound` and the golden W41 stems test pin the seed formula. |
| L1 | The total shows only when `rounds > 0`. `solo` shows only once `mine` exists. The folder path moved to the week block, shown whenever the pupil has joined. The not-comparable note reads "kit: their tutor…". | DOM #1 (week block after join) and #3b both fail on unfixed code. |
| L2 | `comparable()` also requires `answers.length === seeds.length`. | Flow `comparable` test: 50 answers → `Expected: false Received: true` on unfixed code. The flow fixture grew to 5 answers so it stays comparable. |
| L3 | `friends()` stats the `resolveInData` path and skips files over 64 KB as unreadable. `MAX_ANSWER`/`MAX_WORKING` moved to `src/flow/squad.ts` and `parseSquadFile` applies them. 64 KB is derived: 5 × (100 + 500) characters ≈ 3 KB of text plus keys and seeds. | `src/api/squad.test.ts` #16 and the flow `parseSquadFile` test both fail on unfixed code. |
| L4 | The join intro adds "…and pick a name no one else in the squad uses." | Covered by the register test. No behaviour change, so there is no red-first test. |
| L5 | Step 8 is now listed as not run in the report and the PR body. | Documentation only. |

The review's own M1 input was run verbatim as a script (join `sam`, 4 of 5, rejoin `sammy`, GET). Unfixed: `rejoin 200 total {"score":8,"of":10,"rounds":2} members ["sam"]`. Fixed: `rejoin 409 total {"score":4,"of":5,"rounds":1} members []` (observed 2026-09-29).

Red-first method: fixed `app/squad.js`, `src/api/squad.ts` and `src/server.ts` were stashed. `src/flow/squad.ts` was reset to `2e17251` plus a `roundOf` shim so the new tests could import. Result: 8 fail, 30 pass across the three squad test files. Fixes restored: all green.

### Divergence from the review's suggested fix

- **M3**: the review suggested marking the pupil's own round "not comparable" when `e.topic !== round.topic`. That fixes the total, but the page would still build the compare questions from the current pick and pair the answers with the wrong stems. Building the whole view round from the event's topic fixes the page, the total and the friend comparison together. A friend on the new pack now shows as not comparable, which is accurate.

### New failure modes of the fixes

- M1: a pupil who joins under a typo and saves a round keeps that name until Monday. The 409 text says so. A parent can still edit `profile.json`.
- M3: if a later update removes the saved topic's generator, the page shows "This week's questions could not be built" for the rest of that week. There is no test for this, because no current pack reaches it.
- M2 (accepted limit): a reload before the save rolls the same questions, so a pupil told "not this time" can guess again. They never see the working first. This is recorded in the plan (`:612`) and the report.

## Deferred

None.

## Needs a manual look

- The squad page in a real browser: the week block before and after the first round, and the check feedback without working. Only happy-dom covers it.

## Validation (observed 2026-09-29, fixed tree)

- `bun run check`: exit 0. 483 pass, 0 fail, 48 files. Biome shows 4 warnings, all `noDescendingSpecificity` in `app/style.css`, which this PR does not touch.
- `bun scripts/test-generators.ts`: all 6300 runs pass.
- Test counts (`grep -c "^test(\|^test.skipIf"`): flow 12 (was 11), api 18 (was 15), `squad.test.ts` 4, `squad-dom.test.ts` 8.

## Copies sweep

Grep run on the plan, the report and the PR body (fetched to a scratch file):

| Pattern | Hits before | Action |
|---|---|---|
| `479` | report `:44`, PR body `:19` | report: 483 added beside the original. PR body: gate line updated. |
| `48 files` | same lines | unchanged. It is still 48. |
| `3490`, `1203`, `1225`, `1062` | PR body `:46` | re-derived at the new head (PR body) |
| `(11)`, `(15)` | report `:29`, `:30` | 12 and 18 |
| `one go` | plan `:93`, `:609`, `:620`, `:658` | `:609` and `:658` reworded. `:93` describes T6's boss page and `:620` the parent round; both are still true. |
| `folder below` | plan `:599` | replaced with the new `solo` and `folder` text |
| `working revealed` | plan `:93`, `:510`, `:610` | `:510` and `:610` reworded. `:93` concerns T6. |
| `Stale seeds` | report Issues | now marked fixed (M3) |
| `step 8` / Level 4 list | report `:47–58`, PR body `:36–44` | step 8 marked not run in both |
