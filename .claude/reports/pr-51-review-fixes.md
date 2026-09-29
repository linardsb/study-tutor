# PR #51 review fixes, round 1

Review: https://github.com/linardsb/study-tutor/pull/51#issuecomment-5897501556 (at `c0f3b9b`). PR open. Worktree `~/Desktop/study-tutor-t17`, no merge or rebase in progress. All four findings fixed; nothing deferred.

## Fixed

**F1 (High) SonarCloud reliability C.** `src/flow/diagnostic.test.ts:35-36` now sorts the seeds with `(x, y) => x - y`. The rule behind the red gate is still unconfirmed (the Sonar issue list needs a login), so the fix is checked only by the `sonarcloud` check on the pushed commit. If that check stays red, the dashboard names the next rule.
- New failure mode: none. The test compares two sorted copies; a numeric sort keeps both in the same order.

**F2 (Medium) a second `intake@1` after Save.** `app/intake.js` `save()`: on a 2xx, `page.rows = []` and `renderConfirm()` remove the list, so no radio or Save button is left to press. For the cold test, `page.coldSaved = true` disables `#cold-save`, and the per-question callback now sets `disabled = page.coldSaved` instead of `false`. `openDiagnostic` resets the flag for a new test.
- Tests, `src/marking/intake-dom.test.ts`: "15a (PR #51 F2)" saves, then clicks the G radio and `#save` if present, and expects one POST. "15d (PR #51 F2)" saves one cold answer, answers the second question, and expects `#cold-save` still disabled and one POST. Both ran against the unfixed page first and failed (observed: 3 fail in the file run before the fix, F2's two among them).
- New failure mode: after Save the list is gone, so the page no longer shows which rows were saved; the status line says saved and links to the map. Questions answered after a saved cold test are not saved; reopening the door builds a new test. A different door, or a new checklist pick, can still post a new `intake@1` with new rows, which is intended.

**F3 (Low) `src/.DS_Store` committed.** `git rm --cached src/.DS_Store`; `.gitignore` gains `.DS_Store`. `.claude/reports/t17-intake-doors-report.md:70` corrected.

**F4 (Low) a 400 from `/api/intake/sheet` said the window was closed.** `sendSheet` shows the new `TEXT.sheetRefused` on 400; `notLoaded` stays for network errors and 5xx. The sentence names no figure, so it adds no copy of `MAX_SHEET` or the 5 MB limit.
- Test "15b (PR #51 F4)": the fake route answers 400; the status must equal `TEXT.sheetRefused`. Failed before the fix (observed).

## Validation

- `bun test src/marking/intake-dom.test.ts` before the fixes: 14 pass, 3 fail (observed, 2026-09-29).
- `bun run check` after the fixes (observed, 2026-09-29): exit 0; biome 192 files, 0 errors, 4 warnings already on main; `bun test` 728 pass, 0 fail across 70 files. 728 = 725 + 3 new tests (derived).

## Copies chased

| grep | plan | report | PR body |
|---|---|---|---|
| `grep -n "725"` | none | line 42, now also states 728 | line 28, updated |
| `grep -n "DS_Store"` | none | line 70, corrected | none |
| `grep -n "575 (9)\|24 files\|3,371"` | none | none | line 14, updated to the new diff stat |
| `grep -n "one \`intake@1\`"` (plan line 15) | line 15, now true | none | line 3, now true |

## Manual

Level 4 step 3b (clipboard paste from Preview and Chrome's PDF viewer) is still not done and needs a person.
