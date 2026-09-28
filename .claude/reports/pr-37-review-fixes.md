# PR #37 review fixes, round 1

Review: https://github.com/linardsb/study-tutor/pull/37#issuecomment-5873431701 (head `187f5d9`).
No scope direction was given. The reviewer's steer was "F1 first, F2 can go into this PR or into #34". All six findings are in files this PR touches and are small, so all six were fixed here. The F2 Windows check and its domain-prefix sub-point went to #34.

## Fixed

**F1 (High) `src/events/check.ts` `write()`: the pre-update backup was overwritten after any append without a state write.**
- Fix: `write(dataDir, state, raw, base = state)` copies `state.json` to `state.prev.json` only when `base` differs from the stored state. `base` is this build's replay of the lines the stored state was written from. It rewrites `state.json` only when `state` differs. The normal path passes `before`. The `stored === null` and truncated or hash-mismatch paths pass `now`, and `raw` never equals `now` on those paths, so they always back up.
- Test: `a line appended without a state write keeps the pre-update backup`. This is the reviewer's sequence verbatim: the `old: true` state, `replayCheck`, `appendEvent` one line, `replayCheck`, then `state.prev.json` still has `old: true`. On unfixed code: `(fail) ... Expected: true, Received: undefined` (observed, 2026-09-28).
- New failure mode of the mechanism: skipping the backup when the prefix replay matches could also skip it for a new build whose first start comes after lines were appended. Test: `a new build's first start after appended lines still takes the backup` (an `old: true` state, then an append with no `replayCheck` in between). It passes. The mutation that would break it is "never copy when `stored.lines < lines.length`".

**F2 (Medium) `config.json` owner-only ACL lost at each update.**
- Fix: `restrictConfigOnStart(dataDir, restrict = restrictToOwner)` in `src/config.ts`. It is called from `src/server.ts` before `checkOnStart`, so a refused start also re-applies the ACL. It does nothing when `data/config.json` is absent.
- Test: `src/config.test.ts` `restrictConfigOnStart re-applies owner-only permissions ...`. There is no call without `data/` or without the file, and exactly one call with the realpath once the file exists.
- Reduced claim: the Windows property (the copied file regains the owner-only DACL) was not run, because there is no PC. The wiring in `main` is one line with no test, since `restrictToOwner` does nothing on the Mac. Both are appended to #34 (the "#29 after an update" item). The domain-prefix sub-point (Low) is a checklist line on #34.

**F3 (Low) `src/updates.test.ts`: prefix test.** The off-prefix test is now a `test.each` over four URLs.
- Probed with the reviewer's mutation verbatim (`RELEASES_PAGE` without its trailing `/`). The reviewer's URL `https://github.com/linardsb/study-tutor-evil/...` did **not** fail under it: only the F5 case failed (observed). `.../study-tutor/releases` is not a prefix of `.../study-tutor-evil/...`, so that URL tests dropping `/releases/`, not dropping the slash. Added `https://github.com/linardsb/study-tutor/releases-evil/tag/v0.2.0`, which fails under the verbatim mutation (observed). The reviewer's URL is kept too: it fails when the prefix is cut to `.../study-tutor` (observed).

**F4 (Low) `scripts/build.test.ts`: `data` boundary.** Added `StudyTutor-0.1.0/database.txt` to the must-not-throw list. Under the reviewer's mutation (`(\/|$)` deleted from `scripts/build.ts:29`): `(fail) assertNoData refuses only a top-level folder's data` (observed).

**F5 (Low) `src/updates.ts`: raw-URL `startsWith`.** The URL is now `new URL(url).href`, checked against `RELEASES_PAGE` and returned as the parsed href. A malformed URL throws inside the existing `try` and gives "no update". This is simpler than checking the origin and pathname separately: the href of a parsed URL with the right prefix already fixes the origin. Test: the reviewer's `.../releases/../../other/repo` case failed on unfixed code (observed) and passes now.

**F6 (Low) `scripts/build.ts`: unchecked `unzip -Z1` exit.** Moved into an exported `listZip(file)` that throws on a non-zero exit. The main flow's existing `try` turns that into `Build failed: ...` and exit 1. Probe: `unzip -Z1 /no/such/StudyTutor.zip` exits 9 with empty stdout (observed), so the old code gave `[]` and passed. Test: `listZip throws when unzip cannot list the file`. `bun run build` was not re-run.

## Deferred

- F2 Windows property and domain-prefix sub-point → appended to #34 (open epic follow-up for the Windows legs, the same module).

## Needs a manual look

- F2 on a Windows PC (#34).

## Gate (run 2026-09-28, against the fixed tree, `study-tutor-t11`)

- `bun run check`: exit 0, **336 pass, 0 fail**, 31 files (observed). 329 + 7 new cases = 336 (derived: F1 2, F2 1, F3 2, F5 1, F6 1; F4 is an extra entry inside an existing test).
- `bun scripts/test-generators.ts`: all 6300 runs pass (observed).

## Stale-claim sweep

Per retired value or noun, `grep -nE "329|28 new|1,804|23 files|state\.prev|AC 5|restrictToOwner|startsWith|unzip|assertNoData"` over the plan, the report and the PR body (fetched to scratch):

- Plan `.claude/plans/t11-distribution-and-updates.md`: `:310` `startsWith` → parsed URL; `:402` unzip listing → `listZip`; `:458` call site → plus `restrictConfigOnStart`; `:540` AC 5 row → notes appended lines. `:348`, `:400`, `:414`, `:602`, `:604` still hold as written (they describe tests and ACs that remain true).
- Report `.claude/reports/t11-distribution-and-updates-report.md`: `:7` backup sentence and #29 sentence; `:11` "once parsed"; `:25` call sites; `:32` 15 → 18 tests; `:33` check +2 → +4; `:36` build 5 → 6 tests; new `config.test.ts` +1 line; `:45` 329 → 336.
- PR body: `:11` backup sentence, `:12` #29 sentence, `:15`/`:26` diff figures and bucket table, `:30` "once parsed", `:34` 329 / 28 new → re-derived after the fixes commit and edited with `gh pr edit`.
