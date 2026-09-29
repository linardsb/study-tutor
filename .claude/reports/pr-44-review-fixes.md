# PR #44 review fixes, round 1

Review: `.claude/code-reviews/pr-44-review.md` (comment 5888117458). Triage chosen by the user: fix F2–F10 in this PR, rebase and force-with-lease. F1 waits on the Sonar issue list. F11 is dropped.

Base after rebase: `origin/main` @ `708775d` (T12 #45 merged after the review, on top of T14 #43). T13 commit rebased: `e728124` → `6fab303`. The fixes sit in a second commit on top.

## Gate

- `bun run check` (tsc + biome + bun test) at the fix commit's tree: exit 0, **619 pass, 0 fail**, 57 files, 4 biome warnings (the same 4 the review saw, in existing CSS/JS). Observed, 2026-09-29, run in `~/Desktop/study-tutor-t13`.
- `bun run build`: exit 0. `StudyTutor-mac.zip` 47,074,294 bytes, `StudyTutor-windows.zip` 41,343,544 bytes, 0 `node_modules` entries in the mac zip. Observed, same run.
- Per file: `examiner_mark.test.ts` 24 pass, `snap.test.ts` 30 pass, `start.test.ts` 4 pass (observed, `bun test <file>`).
- `piv-validate` in this repo describes a pnpm/turbo project, not this one. The gate used is the one CLAUDE.md names.

## Fixed

### F2 (High) rebase onto main

`main` had moved again since the review. The conflict count was **11 files**, not 8 (observed, `git merge-tree --write-tree origin/main HEAD`). T12 added `scripts/fake-provider.ts`, `src/events/replay.ts` and `src/events/replay.test.ts`.

What changed in the T13 commit beyond conflict markers (`git range-diff ab1ddd9..e728124 708775d..6fab303`):

- `writeIntakeFile` calls `makeDataDir(dataDir, INTAKE_DIR, 0o700)`. `makeDataDir` gained a `mode` argument (default `0o777`, same as before for squad). It applies to each level the call makes. Test `writeIntakeFile writes the photo owner-only, in an owner-only intake folder` asserts `intake/` is `0700`. Probe: the plan's literal call `makeDataDir(dataDir, INTAKE_DIR)` under umask 022 → red, `Expected: 448, Received: 493` (0700 vs 0755). Restored → 44 pass.
- **State shape 4 → 5.** T12 and T13 each bumped 3 → 4, so the merged `State` (with `coach` and `photos`) would otherwise share a number with T12's. No conflict marker showed it. The shape is not compared at runtime (`currentState` always replays), so this is a label fix; `replay.test.ts` asserts 5. Plan line 671's "textual and adjacent only" was false, and it now says so.
- `retest.test.ts` page-POST guard: `event|config|chat|squad|squad/join|coach|snap|snap/photo`, title updated.
- `src/api/event.ts` refusal docblock names XP, photos and squad.
- `types.ts`: both `KEYS` rows kept, `squad@1` with `answers`, `photo@1` with `seed, marks, of, clean`.
- `server.ts`: squad, coach and snap routes all in `apiRoutes`. The LAN listener's 404 test now also asks for `/api/squad` and `/api/coach` (`snap.test.ts`, "only the allow-list").
- `events.md`: route paragraph and state keys merged; shape "now 5".

### F3 (Medium) `--mcp` leaves the phone listener up

`main` creates `snaps` and passes it to `startServer`. On stdin close: `server.stop(true)` (no new mint), then `await snaps.closeAll()`.

A second window (found on review of the fix): `closeAll` waited for marking before closing anything. So while snap A was marking, a newer snap B still took an upload. `closeAll` now closes every snap first (listeners stopped, `live` cleared so `take` refuses), then waits for marking.

- Test `--mcp: closing stdin stops a live phone listener too, and the process exits` (`start.test.ts`): a real `--mcp` process in a temp root, mint, `GET` the LAN link (200), close stdin. Expect exit 0 and the LAN link refused. Unfixed: **exit 143** (killed by the spawn's 10 s timeout). Fixed: pass.
- Test `closeAll: while an earlier photo is marking, the live snap takes no upload` (`snap.test.ts`, fake delay 500 ms). Unfixed ordering: **B's upload got 202**. Fixed: the phone gets no listener, localhost gets 403, one intake file, one `photo` line.
- New failure mode of the mechanism: `--mcp` exit now waits for a mark in progress. Bound (derived): `TRIES` 2 × `DEFAULT_TIMEOUT_MS` 120 s = 240 s at most, reached only when the first reply is refused as shape or guard just before the timeout and the retry then times out. A timeout itself is not retried (`RETRYABLE`).
- Reduced claim: the process test skips on a machine with no private IPv4 address (`lanAddress` null means no listener to test).

### F4 (Medium) number words and the conflicting NUM line

- (a) `validate` refuses a note holding a number word the stem does not print: `zero`, `nought`, and `two` to `million`. `one` is left out ("one step is missing"), and so are fractions in words. Five fixed stems print number words ("two packs", "three shops", "four sloping faces"; observed, grep of `content/maths/items`), so words printed in the stem are allowed. No generator stem holds one (observed).
  - The review's note verbatim, "The final value should be twelve, not seven.", on the unfixed code: `by: "model"`, red. Fixed: fallback null, reason `shape`, 2 calls. Also "Forty-five is not the total." and "The total should be zero.". Allowed: "two packs" with a stem that prints "two", and "One step is missing.".
- (b) `postAttemptSystem(task, num = NUM)`: `examiner_mark` passes its own line ("Use only numbers printed in the question, written as the question writes them. No other number, in digits or in words."). Every other job keeps `NUM` through the default. TASK no longer asks for notes "in words", which pushed the model towards number words. Test: the system message has no "the pupil's own words" and has "in digits or in words". Unfixed: red.
- Claim narrowed to what the code enforces: "no whole number outside the stem, in digits or in words, except 'one' and fractions in words". Edited in `.claude/references/model-jobs.md`, the report's guard paragraph, the plan's guard and NUM gotcha, and the PR body.
- Out of this diff: `src/jobs/teachback_mark.ts:61` makes the same digits-only claim ("cannot hand over the corrected value"). Not changed here.

**Guard restated.** The answer stays withheld until an attempt event exists: `examiner_mark` takes `PostAttempt` only, which `jobItem` mints after `hasAttempt`, and the prompt carries `mark_scheme ?? working`, never `answers`. The `num` argument changes only the invented-number line of a post-attempt message; `preAttemptSystem` is untouched.

### F5 (Medium) no test of the LAN bind address

Test `the phone listener binds the address snapHost gives, never a wildcard`: `snaps.current().lan.hostname` is `127.0.0.1` (the harness's `snapHost`). The review's mutation, `hostname: "0.0.0.0"`: red, `Expected: "127.0.0.1", Received: "0.0.0.0"`. Restored: pass.

### F6 (Low) LAN routes had no error handler

`startSnapListener` has `error: (err) => json(500, {error: "Could not open the photo link"})`, logged like the localhost `snapRoute`. Test: `config.json` symlinked out of `data/`, then LAN `GET /api/snap` → 500 with that JSON. Unfixed: red (Bun's error page, not JSON).

### F7 (Low) the phone page could poll for ever

Every reply that is not OK and not 403 counts towards `MAX_FAILED_POLLS`; only an OK reply resets the count. Test: polls answered 500 → the closed sentence after `1 + MAX_FAILED_POLLS` GETs. Unfixed: the test never finished (the run was killed by a 60 s `timeout`).

### F8 (Low) a lost 202 became "expired"

On a 403 from the upload, the page reads the snap. If it is `marking` or `done`, the form hides and the result shows (at once or by polling). Test: the first upload throws, the retry gets 403, the snap is marking and then done → five rows, no status text. With the `taken()` call removed: red.

### F9 (Low) the map stat

`photoStats(state, next)`: null when this week has no marked photo, so no "0 marks left" for unmarked photos. "last week" is the ISO week just before (`next.day` − 7 days, a copy of `isoWeek` from `src/mcp/clock.ts`, since the page cannot import it). Tests: `map.test.ts` (unmarked → null; W40 is not last week of W42; the week before 2027-W01 is 2026-W53) and two in `map-dom.test.ts`. Both DOM tests red on the unfixed `map.js`.

### F10 (Low) pupil-facing text

- `src/snap.ts` `notSaved`: "Could not save the photo." (full stop).
- `app/snap.js` `closed`: "This link has closed. Look at the map on the computer." The old sentence claimed marks that an unmarked photo does not have. Three DOM tests assert the new sentence.

## Needs a human look

- **F1 (High) SonarCloud quality gate.** The issue list is not readable from here: unauthenticated `api/issues/search` returns `total: 0` for the private project (observed). Open the dashboard on the PR, then fix or justify each issue there. The ratings after this push are recorded in the PR comment. (Superseded in round 2: the list is readable through the check run's annotations, `gh api repos/{owner}/{repo}/check-runs/{id}/annotations`. See `pr-44-review-fixes-2.md`.)
- Phone-only checks the implementation report already lists as owed (reach, firewall prompt, WebKit HEIC, locking the phone mid-mark).

## Dropped

- **F11 (Low)** the PR template describes CI jobs that do not run. It is `piv-create-pr`'s template, not T13. No epic ticket touches that file, so per the deferral rule it is noted here and dropped. The main checkout already holds an uncommitted edit to that `SKILL.md`, which this round did not touch.

## Copy sweep

Commands run against `.claude/plans/t13-examiner-mode.md` (plan), `.claude/reports/t13-examiner-mode-report.md` (report) and the PR body fetched with `gh pr view 44 --json body` (body), before the edit:

| grep -n | hits before | action |
|---|---|---|
| `518`, `48 files` | report:62, body:35 | report annotated as superseded; body replaced |
| `3,435`, `35 files`, `749`, `1,450` | body:25 | body re-derived after the fix commit |
| `47,04`, `41,32` | report:63 | annotated as superseded |
| `shape: 4`, `` .shape` 4 ``, `` `shape` 4 `` | plan:227, plan:514, report:64 | annotated "5 after the rebase" |
| `Your marks are on the map` | plan:461, report:77 | plan changed; report:77 is an observed quote, annotated |
| `greatest key` | plan:482 | annotated as retired by F9 |
| `cannot reach the screen` | report:9, plan:304, body:31, `model-jobs.md:26` | narrowed (F4) |
| `pupil's own words` | plan:306 | annotated (F4b) |
| `textual and adjacent` | plan:671 | annotated as false (F2) |
| `in words` | plan:299 (TASK quote) | annotated: "in words" dropped |
| `18 examiner`, `27 snap` | none | per-file counts above are new |

After the PR body edit the body is fetched again and the same greps re-run; the result is in the PR comment for this round.
