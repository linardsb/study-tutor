# PR #20 review: E1 level map and daily detective case for the v1 folder

**Head** e1604a9 · **Base** main @ `6d5d90c6523f90fbe13f561ec8850dcc3f7b4cd2` · **Round** 1 · **Reviewed** 2026-09-27
**State** DRAFT (no CI `ready` job yet; SonarCloud red) · **Diff** 11 files, +2097 / -0 (observed, `git diff --stat origin/main..HEAD`)

## Summary

The two pages do what the ticket asks and the code is careful where it matters: every string reaching `innerHTML` is escaped, the working enters the DOM only inside the check handler, the done-state rebuild is exact, the `quiz.js` hunk logs once per set. The ticket's own gate is green (observed, this session). Two things block merge as it stands: the SonarCloud quality gate is red, and three claims in the PR body, README and report do not match the code (what the pages store, what "opened" counts, what the case page does with a corrupt log). Everything below is small.

**Recommendation: request changes.** 0 Critical · 1 High · 6 Medium · 5 Low.

## Issues

### High

**F1 · SonarCloud quality gate red: "C Reliability Rating on New Code (required ≥ A)"** · check `SonarCloud Code Analysis`, 23 annotations (observed via the check-run annotations API; the SonarCloud project is private, so the issue list itself was not readable without a token).
The two Bug-rated ones that set the rating:
- `e1/test-case.js:40` "Referencing non-existing group: $10" in `.replace(/^(-?)\./, '$10.')`. Behaviour is correct in JS (group 1 then a literal `0`; observed: `-.5` → `-0.5`) and the line is a verbatim copy of the v1 `norm()`. Fix without changing behaviour: a function replacer, `(m, sign) => sign + '0.'`.
- `e1/test-case.js:179` identical sub-expressions on both sides of `===` (`C.hash('2026-09-28') === C.hash('2026-09-28')`). Store the two calls in variables first.
The rest are smells that do not move the rating but are cheap: `map.html:52,62` empty catches need a comment; `install.sh:12` `[[`, `:22` positional parameter to a local; `test-case.js` `node:` prefixes, `replaceAll`, `.find`, `.includes`, optional chain, the copied `norm`/`UNIT` regexes flagged for backtracking. Keep `norm` and `tail` behaviourally identical to the v1 originals (the plan says "copy").

### Medium

**F2 · A corrupt `tutor:log` turns off saving on `case.html` for good** · `e1/assets/case.js:205-213`.
`JSON.parse` sits in the same `try` as `getItem`, so a parse failure sets `storageOk = false`, `save()` becomes a no-op and `tutor:seed` is never read. Input: `tutor:log = '{bad'`, open only `case.html` → the storage note on every load, no `open-case` or `case` entry ever written, the corruption never overwritten. The plan's edge case says "treated as empty, and the next save overwrites"; report step 8 tested this on the map, which does heal it. Fix: split the reads.
```js
var raw = null;
try { raw = localStorage.getItem('tutor:log'); seed = localStorage.getItem('tutor:seed'); }
catch (err) { storageOk = false; }
try { log = raw ? JSON.parse(raw) : []; } catch (err) { log = []; }
if (!Array.isArray(log)) log = [];
```

**F3 · "Both store only `tutor:log` and `tutor:seed`" is false: the map writes `tutor:probe` and never removes it** · `e1/map.html:57-59`; claim in the PR body, `e1/README.md:21-22`, the report summary, and plan AC #3 ("the only thing either page stores").
The plan's own Task 5 asked for the probe, so this is the plan contradicting its AC, carried into three documents. Fix, either: `localStorage.removeItem('tutor:probe')` after the read-back (one line, claim becomes true), or amend the claim in all three places. Recommend the removal.

**F4 · The day-14 read logs an open on the day it is read** · `e1/map.html:56-57`, `e1/README.md:55-58`.
Opening the map to click the copy button appends `open-map` for that date before the count is taken (D2). If Matis did not open the folder on day 14, the E1 line over-counts by one day, and the same holds for any parent check mid-experiment. The dates are in the line, so the reader can subtract, but the README does not say so. Fix, no code: a sentence under "The read, day 14": "the read itself logs today; if today's date appears in the list and he did not open it himself, subtract one". Or a `?read` query flag that skips the log (three lines).

**F5 · The two-week "opens" count is not "opened the map or the case"** · `e1/assets/case.js:157-167`, `e1/map.html:84-85`, `e1/README.md:3`.
`opens()` counts any entry, including `quiz` entries logged by `practice.html` and the lesson pages. A day with only a finished practice set reads as an opened day in the E1 line, while README line 3 defines the question as "open the map or the case". Code follows the plan's wording; the README and the label contradict it. Decide and align: filter to `open-map`/`open-case` in `opens()` (check 7's fixture is all `open-map`, stays green), or reword README line 3 and the stat label to "used the folder without the chat". A finished set is the stronger signal, so the reword is the better call.

**F6 · "Jo's first step:" shows a hint written to the reader, not Jo's work** · `e1/assets/case.js:108, 278, 302`.
`firstStep` is the raw `hint`, never passed through `third()` and not covered by the second-person test (which checks `options` only). Observed in `generate.js:116` "What do you multiply 2 by to get 8?" and `:285` "The unit g/cm³ tells you: …" (2 of 39 hints contain `you`; about 30 are imperatives like "Multiply 6 by 8 first"). On the page: "Jo's first step: What do you multiply 2 by to get 8?" reads as a question to Matis. Do not run `third()` on it. Fix: relabel at :278 and :302 to "The hint Jo had:", which is true for all 39.

**F7 · The link between `shown` and `correct` is untested** · `e1/test-case.js:81-91`.
Check 2 recomputes the kept `spec` but never asserts that `options[correct]` is the message for the shown key, nor that `shown === answers[0]` when `isRight`. A mutation to `shown = keys[0]; correctText = third(spec.wrong[keys[1]])` passes every assertion. Fix, inside the existing `if (!c.isRight)` block:
```js
if (c.options[c.correct] !== C.third(spec.wrong[c.shown])) f(`correct option is not the message for shown "${c.shown}"`);
```
and, with the spec re-roll moved above the branch, `if (c.isRight && c.shown !== spec.answers[0]) f('shown is not answers[0] while isRight')`.

### Low

**F8 · "cases done" and the E1 line's `cases N` count re-asks as cases** · `e1/map.html:82`. Report step 4 observed `2 cases done` after one day (one case plus its re-ask). D1 covers wrong cases, not re-asks. Either count distinct dates with a `case` entry, or say so in the README next to the E1 line.

**F9 · `install.sh` needs both `bun` and `node`, checked after the copies** · `e1/install.sh:38,41`. On a machine with one, `set -e` aborts after the seven files are in place, so "exit 0 means green" no longer holds. Records are safe either way (`cp` only, fixed targets). Fix: `command -v` both before the copies.

**F10 · Pinned `21 / U349 / U545 / % 21` fail `install.sh` after the first data regeneration** · `e1/test-case.js:65,130`. The plan asked for the pins, so a note: once `progress-data.js` is regenerated with new priorities, install copies then exits 1 on line 65. One sentence in `e1/README.md` under Install.

**F11 · Report figure off by four** · `.claude/reports/e1-map-and-detective-case-v1-folder-report.md` "Tasks completed": `case.js (CREATE, 380 lines)`. `wc -l` says 376 (observed), which is what the PR body and the report's own 876 total use. Correct the line.

**F12 · Process: the `code-reviewer` agent this skill dispatches is the Sakta Cab one** · `.claude/agents/code-reviewer.md`. Its hard rules (integer cents, `assertTransition`, `@taxi/shared`) belong to another repo. This round overrode the rubric in the prompt; the file should be rewritten for this repo (CLAUDE.md ground rules, the answer-withheld guard, `data/` confinement, pupil-text rules). Not part of this PR.

## Constraint pass

Plan grep (`do not modify|read-only|no changes to|frozen|must not|never`): no AC freezes a file this review touches. Binding GOTCHAs that the fixes must respect: `norm` is a copy of `test-generators.js` (F1 fix keeps behaviour); `install.sh` is `cp` only, no `rm` (F9 adds a check, deletes nothing); `test-case.js` never writes under `$V1` (F7 adds assertions only). F3's `removeItem` deletes a key the same page wrote one line earlier, not a record.

## Numbers pass

| Figure (PR body / report) | Provenance | Re-derived |
|---|---|---|
| 11 files, +2097, 0 deletions | observed | `git diff --stat origin/main..HEAD` = same ✓ |
| `e1/` 1238 lines, per-file counts | observed | `wc -l` total 1238; 376+358+194+132+85+48+41+2+2 = 1238 ✓ |
| `quiz.js` hunk = 7 lines | observed | lines 217-223 ✓ |
| 21 codes, 6300 runs, both runtimes | observed | re-run this session, bun and node: `all 6300 runs pass` ✓ |
| v1 generators 6300 runs | observed | re-run: `all 6300 runs pass` ✓ |
| 7 files copied | observed | 7 `copy` lines ✓ |
| 27 level cards, 17 green | observed | `PROGRESS.topics`: 27 with numeric priority, 17 without, 44 total ✓ |
| mutation check: 21 failures, one per code | observed | consistent: only `sawWrong` can fire per code with `isRight` forced ✓ |
| report: `case.js` 380 lines | stated as observed | 376 ✗ (F11) |
| "store only `tutor:log` and `tutor:seed`" | absolute claim | false, `tutor:probe` (F3) |

Guarantees pass: first round, base tip `6d5d90c` equals the recorded base; skipped. Fix-mechanism pass: round 1; skipped.

## Validation

| Check | Command | Result |
|---|---|---|
| Syntax | `node --check` on `case.js`, `quiz.js`, `test-case.js` | pass (observed) |
| Unit | `bun e1/test-case.js` | all 6300 runs pass, plus the fixture checks, exit 0 (observed) |
| Unit | `node e1/test-case.js` | all 6300 runs pass (observed) |
| Donor | `node ~/Desktop/Matis_study_tutor/.claude/tools/test-generators.js` | all 6300 runs pass (observed) |
| Installed copy | `diff ~/Desktop/Matis_study_tutor/assets/quiz.js e1/assets/quiz.js` | identical (observed) |
| Launchers | `file "e1/Open *.bat"` | CRLF, matches `Open progress.bat` (observed) |
| `bun run check` | not applicable: no `package.json` until T1 (plan D8) | skipped |
| CI | SonarCloud Code Analysis | **fail** (F1) |

## What's good

- XSS: every generator and data string reaching `innerHTML` goes through `esc()`; radio values are indices; log entries are counted or regex-parsed, never rendered raw.
- The answer-withheld guard holds: `c.working` enters the DOM only at `case.js:345` inside the click handler after a pick and a bet; the done-state render runs only when a `case` entry for today exists.
- The done-state rebuild (D5) reaches the same `buildCase(code, hash(date + ':' + code))` call as the original path, including the null fallback.
- Dedup cannot break `correct`: `correctText` is always a member of `messages` or `NOWHERE`.
- `third()` is safe on this content: no `you're`, `yourself` or `yours` in any `wrong` message (grep over `generate.js`).
- The `quiz.js` hunk logs exactly once per set: `render()` fires once per item's final check and `finished` is true only on the last.
- Pupil text: no exclamation marks, no emoji, no grade words, British spelling, sentence case.
- The PR body's numbers all re-derive, and the mutation check was real.

## Recommendation

**Request changes.** Fix F1 (the two Bug-rated Sonar lines at least), F2, F3 and F7 in code; decide F5 and F6 (one-line each); F4 is a README sentence. Then re-run the three test commands and let SonarCloud re-analyse. Next: `piv-fix-review-findings` on this report.
