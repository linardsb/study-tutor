# PR #31 review fixes, round 1

Review: `.claude/code-reviews/pr-31-review.md` (posted as the PR comment, 2026-09-27). Head reviewed `5eabb48`.
Fix commit: the branch commit `fix: T7 review round 1: …` (its hash is in the PR body's Validation section, since a file cannot carry its own commit's hash). No direction given with the review, so the triage follows its own recommendation:
F1 and F2 before merge, the pupil-facing pair, and the small Lows that share the files already open.

## Triage

| Code | Sev | Call | Where |
|---|---|---|---|
| F1 | High | fixed | `src/flow/detective.ts`, `app/case.js` |
| F2 | High | fixed | `src/events/types.ts` |
| F3 | Medium | fixed | `app/case.html`, `app/case.js` |
| F4 | Low | fixed | `src/api/case.ts` |
| F5 | Low | fixed | `app/case.js` |
| F6 | Low | PR body wording only (the plan's Task 15 GOTCHA already accepts the behaviour) | PR body |
| F7 | Low | fixed: `hint` dropped from `Case` | `src/flow/detective.ts` |
| F8 | Low | PR body footer corrected; the `piv-create-pr` skill edit in the working tree is not this PR's and stays uncommitted | PR body |
| F9 | Low | page half fixed; reducer half deferred to #7 (T5, the next ticket that touches `replay.ts`) | `app/case.js` |
| F10 | Low | fixed | `app/case.js` |
| F11 | Low | deferred to #10 (T8, the next ticket that touches `server.ts`) | issue #10 checklist |

Nothing needs a manual look beyond what was driven below. No finding was dropped as noise.

## Fixes

**F1.** `calibration` sorts day keys with `byDay` (an `if` comparator, no nested ternary, so the F4 warning
does not move here). `load` in `case.js` reads `day` with `URLSearchParams`, keeps it only when it matches
`/^\d{4}-\d{2}-\d{2}$/` and builds the URL from that one value. The guard is shape-only: `?day=2026-13-01`
still reaches the route, gets its 400 and the page shows "The case did not load." (observed, 16:09). That
is the review's proposed fix and the same outcome in kind as before (a 500 then). `?day=` is a testing
affordance (plan Task 15), not a pupil path. Sonar's verdict waits for the re-scan on the push.

**F2.** `isDay` checks `Number.isNaN(d.getTime())` before `toISOString`. Probed with the review's inputs
before the fix (scratch script, 16:05): `isDay("2026-13-01")` threw `Invalid Date`; `replay` of one hand line
with `day: "2026-13-01"` threw. Tests added with those exact inputs:
- `src/server.test.ts`: `GET /api/case?day=2026-13-01` is 400; `POST /api/event` with that `day` is 400.
- `src/events/replay.test.ts`: the hand line is one more skipped line in "bad lines are skipped and counted,
  never fatal" (skipped 4 → 5, lines 37 → 38).
Run against the unfixed `types.ts` (HEAD copy swapped in, 16:06): both tests fail, `0 pass 2 fail`. With the
fix: pass. New failure mode of the mechanism: none found; the function returns false on every path and
throws on none (`str` and the regex run first, `getTime` never throws).

**F3.** The static aim is now "One puzzle a day. Three minutes." and `load` sets it from `r.case.kind`:
the Kai sentence on a mistake day, "Three questions, three answers. Find the rule behind them. Three
minutes." on a rule day. Observed in the browser on `?day=2026-10-23` (rule) and `?day=2026-10-11` (mistake).

**F4.** `sourceOf(record)` is an `if` chain; `caseForDay` reads in one pass.

**F5.** The re-ask (or the "Back tomorrow." note) now renders inside the POST's `.then(saved)` and the
re-ask only when `saved`. Observed with the server stopped before Check on `?day=2026-10-13`, bet 3 and
wrong: feedback ends "Not saved. Check the tutor window is still open.", note "Back tomorrow.", no re-ask
heading, nothing written to the log.

**F7.** `hint` removed from `Case`, from `mistakeCase`'s `Pick` and from the re-ask's generated item.
`grep -rn hint src/flow/detective.ts src/api/case.ts app/case.js`: no hits.

**F9 (page).** `reaskOwed(record)` is true only for a lone `[3, false]` pair; `load` renders the done
state without its closing note and the re-ask under it. Unit test in `src/marking/case.test.ts` (five
shapes). Observed: after a bet-3 miss on `?day=2026-10-23`, reload shows the done block, the "Same idea,
new numbers." heading and six live radios; answering it writes the `reask: true` line and shows "Over your
last 2 cases you predicted 5, you scored 2."; a further reload shows the done block only (no heading, one
note, no radios).

**F10.** `workingOf(c)` returns null when the working equals the correct option, so a rule case names the
rule once in the feedback and shows no working block (observed: zero `.working p` under the done rule
case); a mistake case still shows its working (observed on `?day=2026-10-11`). "How sure? 1, 2 or 3 first."
has its full stop (observed).

## Validation

`bun run check` at 16:06:45Z (observed): `tsc` clean; Biome 0 errors, 4 `noDescendingSpecificity` warnings
(`app/style.css`, the same four as `main`); 149 pass, 0 fail, 18 files, 62522 expect() calls.
The generator script is untouched by this round (no generator changed).

Browser run (observed, 16:07 to 16:10): `startServer` on port 4790 with a fresh scratch `data/`, agent-browser
for the clicks. One tool note: radios below the fold need `scrollintoview` before `click`, or the click
lands nowhere and reports success; programmatic `.click()` in page context confirmed the page logic
independently.

## Numbers chased

| Retired value or noun | `grep -n` | Hits and action |
|---|---|---|
| `148` (test count) | `grep -rn "148" .claude/plans/t7-detective-case.md .claude/reports/t7-detective-case-report.md` | report line 57 (kept as the implementation figure, round-1 line added under it); PR body validation section updated to 149 |
| `62515` | same files and the PR body | PR body only, updated to 62522 |
| `hint` in `Case` | `grep -n "hint" .claude/plans/t7-detective-case.md` | plan lines 178, 515, 549, 557: the pre-implementation sketch, left as written; the report's round-1 line records the drop |
| "read-only" `?day=` | `grep -rn "read-only" .claude/plans/t7-detective-case.md .claude/reports/t7-detective-case-report.md` | plan line 691 already says the page posts the returned day; PR body "optional read-only `?day=`" reworded to "read-only on the server" (F6) |
| CI job footer | PR body | replaced with the human-flips-the-draft line (F8) |

## The guard

`src/jobs`, `src/mcp` and every prompt are untouched (`git diff --stat`: nine files, none under those paths).
`Case.correct` and `Case.working` still travel to the browser only in `/api/case` and enter the DOM only
inside the check handler; `hint` no longer travels at all.

## Closing commands (run against the fixed tree)

- F1: `grep -n "\.sort(" src/flow/detective.ts` → `281:    .sort(byDay)`; `grep -n "api/case" app/case.js` → the guarded URL at lines 247 and 248 (16:06).
- F2: probe script (16:06) → `2026-13-01 isDay -> false`, `replay -> skipped 1`; `curl -o /dev/null -w "%{http_code}" "http://127.0.0.1:4790/api/case?day=2026-13-01"` → `400` (16:07).
- F3, F5, F9, F10: browser observations above (16:07 to 16:10).
- F4: `grep -n "sourceOf" src/api/case.ts` → the helper and its one call.
- F7: `grep -rn hint src/flow/detective.ts src/api/case.ts app/case.js` → no output (16:06).
- F6, F8: `gh pr view 31 --json body` after the edit (see the PR).
- F9 reducer, F11: `gh issue view 7`, `gh issue view 10`, last checklist line each (16:12).
