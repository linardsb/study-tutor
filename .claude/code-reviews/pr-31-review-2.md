# PR #31 review: T7 detective case, round 2

**Head** `ce64fc6` · **Base** `main` @ `5669da4` · round 2 · reviewed 2026-09-28

**Recommendation: approve.** 0 Critical, 0 High, 0 Medium, 3 Low. Both round-1 Highs are closed and re-derived here: SonarCloud is green at this head, and `isDay` returns false on every path. The base moved since round 1 (`9fe7317` → `5669da4`, T10 merged and merged in at `ce64fc6`), so the guarantees pass ran; the one relationship it touches got stronger, not weaker. The `code-reviewer` agent's fresh pass found no Critical or High; three of its five items are round-1 decisions (F6 accepted by the plan, F9 reducer half deferred to #7, F11 deferred to #10) and are not re-opened.

## Validation

| Check | Result |
|---|---|
| `bun run check` at `ce64fc6` | exit 0 (`observed`): `tsc` clean; Biome 0 errors, 4 `noDescendingSpecificity` warnings at `app/style.css` 642, 643, 671, 672 (the same four as `main`); 178 pass, 0 fail, 20 files, 62687 expect() calls |
| `bun scripts/test-generators.ts` at `ce64fc6` | all 6300 runs pass, 21 × 300 (`observed`) |
| SonarCloud Code Analysis | pass (`observed`, `gh pr checks 31`); round-1 F1 closed |
| Base moved under the PR? | yes: round 1 recorded `main @ 9fe7317`, `origin/main` after `git fetch` is `5669da4`; the branch merged it at `ce64fc6` (the only `src` conflict was `server.ts`, resolved with both sides' imports). Guarantees and fix-mechanism passes below |
| Implementation report and fixes report | `.claude/reports/t7-detective-case-report.md` (seven deviations), `.claude/reports/pr-31-review-fixes.md` (per-finding closing commands present for F1–F10). None of the findings below is a documented deviation |

## Guarantees pass (base moved)

- **"A harness cannot append a case event."** T10's allowlist test (`src/mcp/tools.test.ts:163`) iterates every `EVENT_TYPES` entry with `MCP_WRITABLE` false and feeds it the first line of `src/events/__fixtures__/<type>.v1.jsonl`. This PR adds `case` to `EVENT_TYPES`, `case: false` to the allowlist and the `case.v1.jsonl` fixture, so the merge produced a real test of the relationship the PR body asserts. Verified by reading the test and by the green run (`observed`).
- **"`read_state` exposes no `correct` or `working`."** `read_state` returns `replay(lines)`; `state.cases[day]` holds `kind`, `topic`, `item` and `bets` as `[bet, correct]` pairs, `caseSeed` is a topic id, and the replay guard test asserts the JSON has no `"answers"`, `"mark_scheme"` or `"working"` key. `attemptedItems` counts `type === "attempt"` only, so a case on item X unlocks nothing (`src/mcp/tools.ts:57`).
- **Round-1 rebase notes.** Round 1 recorded none. The PR body's merge note ("if T5 lands first, rebase to `shape: 3`") did not fire: T10 does not touch `replay.ts` (merge stat), so `shape: 2` stands.
- **Conditional and absolute claims in the diff.** `detective.ts:2` "no clock, no file, no Math.random": true by reading. `case.js:3` "the correct option and the working enter the DOM only inside the check handler": not literally true, see F3. No "as long as" or "assuming" tripwires.

## Fix-mechanism pass (round-1 Highs and the fixes that changed behaviour)

| Round 1 | Mechanism | What it newly permits |
|---|---|---|
| F1 `byDay` comparator | total order on `YYYY-MM-DD` strings | nothing new; equal keys cannot occur in an object |
| F1 `?day=` guard in `case.js` | shape regex, then the route's `isDay` | a shape-valid, calendar-invalid day (`2026-13-01`) still reaches the route and gets its 400; the page shows "The case did not load." (fixes report, `observed` there). No valid day is rejected |
| F2 `isDay` NaN check first | `str` → regex → `getTime` → `toISOString` | none: no path throws. Covered by `server.test.ts:340-343` and the replay skipped-lines test |
| F5 re-ask inside `.then(saved)` | `postEvent` resolves `res.ok` and has its own `.catch(() => false)` | a failed save still appends "Back tomorrow." (F1 below); a throw inside the callback has no terminal catch |
| F9 `reaskOwed` | lone `[3, false]` pair and a buildable re-ask | a first answer whose re-ask POST failed is owed again after reload, which is the wanted behaviour; an orphan hand-edited re-ask is not owed |
| F10 `workingOf` null | working equals the correct option text | only rule cases hit it (`ruleCase` sets `working: concept.rule`); no maths item's `working` equals a misconception message |

## Issues

### Low

**F1 · `app/case.js:231-237` "Back tomorrow." after a failed save.** When `saved` is false the feedback gains "Not saved." and the `else` branch still appends "Back tomorrow.", but nothing is on record: a reload today shows the same case fresh, answer already seen. `postEvent` never rejects, but a throw inside the callback (the re-ask `render`) would be an unhandled rejection with nothing on screen. Fix: return after `NOT_SAVED` before the branch, and add a terminal `.catch` that appends `NOT_SAVED`. Found independently by the agent.

**F2 · `src/content/pack.test.ts:191-196` duplicated `loadItems` test.** T10 landed `loadItems` and its test on `main`; this branch had its own fuller test at lines 70-81 (adds the "not a list of items" refusal). The merge kept both; the second is a strict subset. Remove the one at 191. Related PR-body point: "What changed" lists `loadItems` beside `loadTopics` as this PR's change, and after the merge `git diff origin/main..HEAD -- src/content/pack.ts` is `conceptShaped` only (`observed`).

**F3 · PR body figures stop one commit short, and one is unsourced.** The body's newest run is "Review round 1 at `9a5b6fc`"; the head is `ce64fc6` and the merge commit message carries the post-merge run (178 pass, 62687 expect() calls, 2026-09-27T16:20:41Z). Within that round-1 line, "generators 6300 runs pass" names no run: `.claude/reports/pr-31-review-fixes.md` says "the generator script is untouched by this round" (not re-run). The figure is true (re-observed at `5eabb48` in round 1 and at `ce64fc6` here) and nothing downstream de-scopes on it, so Low; label it `derived` or move it to the `5eabb48` run. Also `case.js:3`'s invariant comment: `renderDone` puts `c.options[c.correct]` in the DOM at load, after the day's answer is on record. The guard's intent holds (nothing before the pupil has answered); the sentence should say so.

### Raised by the agent, not re-opened

- `?day=` end to end (the page posts against the returned day, a future day can be backfilled and sets `caseSeed`): round-1 F6, accepted by plan Task 15's GOTCHA (`.claude/plans/t7-detective-case.md:691`) and the PR body's "read-only on the server". A decision, not a defect.
- Re-ask pairs push without bound in `replay.ts:157`: round-1 F9 reducer half, on #7's checklist (`observed`, `gh issue view 7`).
- `loadCasePack` caches a rejected promise: round-1 F11, on #10's checklist (`observed`, `gh issue view 10`).

## Numbers pass

| Claim | Check |
|---|---|
| pool 108 sources, 3 rule cases | `observed` at `ce64fc6`: 108, 3, 21 topics (scratch script over `casePool(await loadCasePack("maths"))`) |
| 26 rule days from 2026-10-01, first 2026-10-23 | `observed`: 26, `2026-10-23` |
| every case and re-ask buildable, options distinct, `correct` in range | `observed`: over 366 days, 0 null cases, 0 null re-asks, 0 malformed option lists; 0 null re-asks over all 108 sources on 2026-10-01 |
| 149 pass, 62522 expect() at `9a5b6fc` | matches the fixes report (`observed` there); superseded by 178 / 62687 at `ce64fc6` (F3) |
| the one `src/mcp` change is `case: false` | `observed`: `src/mcp/tools.ts` 1+ 0- in the diff stat |
| F11 → #10, F9 reducer → #7 | `observed`: last checklist line of each issue |
| size 2575+ 27- over 25 files "at `5eabb48`" | labelled with its sha, verified in round 1; the PR is now 2836+ 29- over 28 files (`gh pr view`), the difference being the round-1 fixes and the two review files |

## The guard

`src/jobs` untouched; `src/mcp` gains one allowlist line. `Case.correct` and `Case.working` travel to the browser only in `/api/case` and enter the DOM in the check handler or, for a day already on record, in `renderDone`. No prompt is built anywhere in the diff. `state` carries no `answers`, `mark_scheme` or `working` (replay guard test). Restated in the PR body as the repo asks.

## What's good

- The merge turned a claim into a test: T10's allowlist loop now exercises `case` through this PR's own fixture without either ticket planning it.
- Round-1 fixes came with the failing-then-passing evidence (`0 pass 2 fail` against the unfixed `types.ts`) and per-finding closing commands, so this round could re-derive rather than trust.
- `detective.ts` stays pure and the year-long probes here reproduce the plan's figures exactly.

## Recommendation

Approve. F1 is a few lines and pupil-facing; F2 and F3 are tidy-ups at the author's discretion. No fix here touches a file the plan freezes (`grep -in "do not modify\|frozen\|no changes to"` over the plan: none). A human now reviews the code and this review and merges.
