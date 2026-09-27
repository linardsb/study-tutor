# Implementation Report — E1: level map and daily detective case on the v1 folder

**Plan**: `.claude/plans/e1-map-and-detective-case-v1-folder.md`   **Branch**: `feature/e1-map-and-detective-case-v1-folder`   **Status**: PARTIAL (code and Mac validation complete; the PC install and the issue #2 comment need the PC)

## Summary

Two static pages for the v1 folder, sourced from `e1/` in this repo and installed by `e1/install.sh`.
`map.html` shows one level per topic, the weekly flame, today's case and the two-week count of opens
with a copy button for the E1 line. `case.html` gives one detective case a day from the folder's own
generators (Jo's first step and answer, "where did Jo go wrong?", a 1 to 3 bet, a calibration line, a
same-idea re-ask on a bet-3 miss). Both store only `tutor:log` and `tutor:seed` in `localStorage`.
`quiz.js` gains seven lines so a finished set counts as a session day. The three v1 docs name the new
files.

## Tasks completed

- Case logic and DOM wiring → `e1/assets/case.js` (CREATE, 380 lines)
- Test, 300 seeds per code plus fixtures → `e1/test-case.js` (CREATE)
- Case page → `e1/case.html` (CREATE)
- Finish log → `e1/assets/quiz.js` (CREATE: v1 copy plus seven lines; `diff | grep -c '^>'` = 7, observed)
- Map page → `e1/map.html` (CREATE)
- Launchers → `e1/Open map.bat`, `e1/Open case.bat` (CREATE, CRLF observed via `file`)
- Installer → `e1/install.sh` (CREATE)
- Pupil instructions → `$V1/README-for-Matis.md` (UPDATE, one new section)
- Update lists → `$V1/README-for-Linards.md`, `$V1/SETUP-PC.html` (UPDATE, list lines and one sentence)
- E1 protocol → `e1/README.md` (CREATE)
- Install on Matis's PC → NOT DONE (needs the PC; see Deviations)

## Tests added

`e1/test-case.js`, run from `e1/` or from `$V1/.claude/tools/` after install:

1. `pool()` matches the topics with a priority, a lesson and a generator, ascending priority; 21 codes, U349 first, U545 last.
2. `buildCase()` over 21 codes × 300 seeds: never null; 2 to 5 options; `options[correct]` is the nowhere string exactly when `isRight`; when not right, `shown` is not an accepted answer under `norm()`; no option contains `you` or `your`; the working ends on the answer (text-type variant for U377, U980); both `isRight` values occur per code.
3. `todaysCase()` over 400 consecutive dates from 2026-09-28: never null, identical on two calls.
4. `todaysCase()` with seed `U349` returns U349 on 30 dates; an unknown seed code falls back to the date pick.
5. `calibration()` on a 7-entry fixture: bets 3+1+2+3+2+1+3 = 15, won 3+2+1+3 = 9; one-entry case.
6. `flame()`: a day with a session row, a case and a quiz counts once; `open-*` ignored; a Sunday before the Monday `weekStart` ignored; `mondayOf()` on a Thursday and on a Monday.
7. `opens()` over 14 days with entries on 5 dates (a 15th-day entry excluded) returns 5 with the dates.
8. `third()`: `You` → `Jo`, `your` → `Jo's`, a message with no pronoun unchanged.
9. `hash()` deterministic, unsigned, two dates differ.

Mutation check (plan Task 2): with `isRight = true` forced, the run went red with 21 failures, one per code, on "no run in 300 had isRight === false" (observed). Restored; green again.

## Validation results

| Level | Command | Result |
|---|---|---|
| 1 | `node --check` on `case.js`, `quiz.js`, `test-case.js` | pass (observed) |
| 2 | `bun e1/test-case.js` | all 6300 runs pass, plus the fixture checks (observed) |
| 2 | `node e1/test-case.js` (node 20.20.2) | all 6300 runs pass (observed) |
| 2 | `node $V1/.claude/tools/test-generators.js` | all 6300 runs pass, 21 generators, 21 lessons (observed) |
| 3 | `bash e1/install.sh` | copied 7 files, both tests green against the installed copy (observed) |
| 3 | `diff $V1/assets/quiz.js e1/assets/quiz.js` | same (observed) |
| 4 | manual steps 1 to 11 | see below |

Level 4, driven with `agent-browser` on `file://` in Chromium on this Mac (observed 2026-09-27):

1. Map: 27 level cards, 17 green cards, `0 of your 3`, `0 cases done`, red note hidden. The opens stat reads `1 of the last 14` on the first open (see deviation D2).
2. Case renders (Jo's first step, Jo's answer, 3 options, three bet radios). Check with nothing picked: `Pick one first.` Option but no bet: `How sure? 1, 2 or 3 first`.
3. Wrong pick, bet 1: feedback names the correct option, working shows, `First case. You bet 1 and won 0.`, inputs disabled, log entry `{ d, mode: 'case', code: 'U332', quiz: 'wrong, bet 1' }`. Reload: done state, same stem, no radios.
4. Log cleared, wrong with bet 3: second `.q` headed `Same idea, new numbers.` with a different stem, `tutor:seed` = `U332`. Re-ask answered right with bet 2: `Over your last 2 cases you bet 5 and won 2.` Map: `1 of your 3`, `2 cases done`, today's case `done`.
5. `tutor:seed` = `U377`, case entries removed: a U377 case (`y = 2x + 8` stem, shown `8`).
6. Three reloads: same stem and shown value each time.
7. Storage off: scratch copies of both pages with `localStorage` shadowed by a throwing getter. Case page shows `This browser is not saving your cases. Ask Dad.`, still renders and checks. Map shows the red note, still renders 27 levels. (Chrome's site-data setting was not toggled; headless Chrome hung on exit as the plan's notes predicted, so the throw was injected instead. Same code path.)
8. `tutor:log` = `{bad`: map renders, counts 0, the next save overwrites with a valid array.
9. `map.html` plus `case.js` in an empty folder: `No data yet. Ask Claude for progress.`
10. Practice `Mixed 6` completed (3 right, 3 wrong): one `quiz` entry `{ code: 'mixed', quiz: '3/6' }`.
11. The copy button's `data-prompt` reads `E1 2026-09-27: opened on 1 of 14 days (2026-09-27), cases 0, sets 0`. The clipboard paste itself was not performed (headless); the delegated handler is the unchanged one from `quiz.js`.

v1 folder integrity: `find -newermt` lists exactly the ten named files; `progress.html`, `practice.html`, `generate.js`, `style.css`, `sessions.md`, `topics.md`, `progress-data.js`, `MISSION.md` keep their September 21 and 22 timestamps (observed).

Size: 876 lines across the six main files plus 7 in `quiz.js` and 4 in the launchers (observed), against the plan's expected ~600. The DOM section of `case.js` and the test are the excess.

## Deviations from the plan

- **D1. `cases done`, not `cases solved`.** The count includes wrong cases (the plan's own step 4 counts both entries), so "solved" would be untrue. Singular and plural handled.
- **D2. Opens reads `1 of the last 14` on the first open, not `0` then `1` on reload.** The open is logged before the count is taken. The plan's step 1 wording described the other order; counting today at once is what E1 wants (an open is an open).
- **D3. The `## Without Claude` section sits before `## If something odd happens`,** not directly after the numbered list, because the three paragraphs after the list continue the list's flow. Also lists `practice.html` as a double-click, matching the register.
- **D4. Options are de-duplicated after `third()`.** Two wrong keys with the same message would otherwise show twice. Not in the plan; the test still bounds options at 2 to 5.
- **D5. The done state rebuilds the case from the first `case` entry's code** (`todaysCase(P, GEN, today, entry.code)`), since `tutor:seed` is cleared after use and the plain date pick would then give a different stem. The plan named the state but not how it recovers the case.
- **D6. `Back tomorrow. Map` also appears after a check on the live page** (after the first case when no re-ask fires, and after the re-ask). The plan only named it in the done state.
- **D7. The map's today box carries a tag line** (`three minutes, find where Jo went wrong`) beside `done` / `not yet`.
- **D8. `case.js` also shows the storage note when a save fails mid-page,** not only when the initial read throws.
- **D9. Test additions beyond the plan's eight checks:** a `hash()` check, an unknown-seed fallback assertion in check 4, `mondayOf()` assertions in check 6, and the "both `isRight` values occur" assertion the plan's mutation note asked for.
- **D10. Level 4 step 7 ran with an injected throw rather than Chrome's site-data setting; step 11's clipboard paste was not performed.** Both noted above.
- **D11. PC install (Task 11), the install date in `e1/README.md` and the issue #2 comment are not done.** They need the PC. `e1/README.md` carries the steps; the report status is PARTIAL for this reason only.

UX states per surface: map loading (static, none), empty (`No data yet.`, built), error (red storage note, built); case loading (none), empty (`No data yet.` and `No case today.`, built), error (storage note, built). Offline is not applicable on `file://`.

## Issues encountered

- Headless Google Chrome with `--dump-dom` hung on exit for the storage-off step, as the plan's spike notes predicted; `agent-browser` was used for every browser step instead.
- The first `agent-browser find role button click` did not register on the case page's Check button; the same clicks through `eval` worked and were used throughout.
- `git checkout --` cannot restore an untracked file: the mutation check was restored with `sed` instead. Nothing lost.
