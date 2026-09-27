# PR #20 review fixes, round 1

**Review** `.claude/code-reviews/pr-20-review.md` (round 1, 2026-09-27) · **Fix commit** `ad9ec44` on `feature/e1-map-and-detective-case-v1-folder` · **PR** https://github.com/linardsb/study-tutor/pull/20 (OPEN, draft, checked before fixing)

No scope steer was given with the review, so the triage follows the review's own recommendation: F1 to F7 in code or text, the Lows where each is one line, F12 out of this PR.

## Triage

| Code | Severity | Call | Where |
|---|---|---|---|
| F1 | High | fixed (two Bug-rated lines and the cheap smells); three regex-backtracking smells left, see Disputed | `e1/test-case.js`, `e1/install.sh`, `e1/map.html` |
| F2 | Medium | fixed | `e1/assets/case.js`, `e1/map.html` |
| F3 | Medium | fixed (probe key removed) | `e1/map.html`, `e1/README.md` |
| F4 | Medium | fixed (README sentence) | `e1/README.md` |
| F5 | Medium | fixed (reworded, code unchanged) | `e1/map.html`, `e1/README.md`, plan amendment |
| F6 | Medium | fixed (relabelled) | `e1/assets/case.js`, `e1/README.md`, report |
| F7 | Medium | fixed (two assertions) | `e1/test-case.js` |
| F8 | Low | fixed (README sentence) | `e1/README.md` |
| F9 | Low | fixed | `e1/install.sh` |
| F10 | Low | fixed (README sentence) | `e1/README.md` |
| F11 | Low | fixed | `.claude/reports/e1-map-and-detective-case-v1-folder-report.md` |
| F12 | Low | dropped with a note, not in this PR | `.claude/agents/code-reviewer.md` |

## Fixed

Probe pages: scratch copies of `map.html`, `case.html`, `case.js`, `quiz.js` at `e1604a9` ("before") and at the fixed tree ("after") next to the v1 folder's `generate.js`, `progress-data.js` and `style.css`, driven by `agent-browser` on `file://` in isolated sessions, 2026-09-27 08:45 local.

**F1.** `test-case.js:40` `'$10.'` is now a function replacer `(m, sign) => sign + '0.'`; probed `-.5`, `.5`, `007`, `-007.50` through the old and new chain: `-0.5 0.5 7 -7.50` both times (observed). `:179` stores the two `hash` calls in `h1`, `h2`. Smells: `node:` prefixes, `.find`, `.includes`, `?.`, `replaceAll` for the four plain-string replaces in `norm`; `install.sh` `[[` and `local src dst`; `map.html` catches drop the unused binding and carry a comment. `norm` and `tail` keep their behaviour: the 6300-run test compares `norm(shown)` against `norm(answers)` and `norm(tail(working))` against `norm(answer)` on every run and is green on both runtimes. Closing: SonarCloud re-analysis runs on the push; see Manual.

**F2.** `case.js` read `tutor:log` and parsed it in one `try`, so a corrupt value set `storageOk = false` and `save()` never ran again. Now a pure `CASE.parseLog(raw)` (missing, corrupt or non-list gives `[]`) sits behind both pages, and only `getItem` can turn storage off. The map used the same coupling and showed the red note on a corrupt log; it no longer does.
Test: check 10 in `test-case.js` (`'{bad'`, `'{"a":1}'`, `null`, `''` give an empty log; a stored list comes back). Repro with the finding's own input, `tutor:log = '{bad'` then open `case.html`:

| | `tutor:log` after load | storage note | case rendered |
|---|---|---|---|
| before | `{bad` | shown | yes |
| after | `[{"d":"2026-09-27","mode":"open-case"}]` | hidden | yes |

Same input on `map.html`: before, log healed but the red note showed; after, log healed and no note (observed).
New failure mode of the mechanism: `parseLog` swallows the parse error, so a corrupt log is silently replaced. That is the plan's stated edge case ("treated as empty, and the next save overwrites"); the lost entries were unreadable anyway.

**F3.** `localStorage.removeItem('tutor:probe')` after the read-back. Probe: fresh storage, open `map.html`, `Object.keys(localStorage)`: before `["tutor:log","tutor:probe"]`, after `["tutor:log"]` (observed). README line 23 now also names the write-and-remove.

**F4.** README, under "The read, day 14": the read logs today; subtract one if he did not open it himself.

**F5.** Code unchanged (`opens()` still counts any entry). README line 3 now defines a day as map, case or a finished set, and says a lesson read without a set does not count. Label `days you used this`; E1 line `used on N of 14 days`. Copies chased: README lines 3, 57, 61; `map.html` 80, 85, 91; plan AMENDMENTS; report round-1 note (step 11 was observed with `opened on`).

**F6.** `Jo’s first step:` is `The hint Jo had:` at `case.js:290` and `:314` and in the file header. Probe on the case page's second paragraph: before `Jo’s first step: Work out year 1 first, then do year 2 on the new total, not on 400.`; after `The hint Jo had: …` (observed). `third()` is not applied to the hint. Copies: README line 16, report round-1 note.

**F7.** The spec re-roll moved above the `isRight` branch. New assertions: `c.shown !== spec.answers[0]` while `isRight`; `c.options[c.correct] !== C.third(spec.wrong[c.shown])` otherwise. Run against the unfixed code with the review's exact mutation `shown = keys[0]; correctText = third(spec.wrong[keys[1]])`: `4741 failures across 6300 runs`, first `U349 seed 135167: correct option is not the message for shown "15"`. Second mutation `shown = keys[0]` under `isRight`: `1559 failures`. Restored: `all 6300 runs pass` (all observed, 08:38 local).

**F8.** README, same paragraph as F4: `cases` counts every entry, a bet-3 miss adds one for the re-ask.

**F9.** `command -v bun` and `node` checked after the folder check and before `mkdir`. Probe: `env PATH=/usr/bin:/bin bash e1/install.sh` prints `refusing: bun is not installed and the tests below need it`, exit 1, nothing copied (observed). Full run with tools present: 7 files copied into the v1 folder, both tests green there, installed `case.js` and `map.html` identical to the tree (`diff` empty, observed).

**F10.** README, under Install: the 2026-09-26 pin and what happens after a regeneration.

**F11.** Report line: `376 lines at e1604a9`, with a pointer to the round-1 note. Current count is 388 (table below).

## Disputed, left as is

- `test-case.js:41,45,49` (Sonar regex-backtracking smells on `norm`'s trailing-zero strip, `UNIT` and `tail`). The inputs are generator answer strings of a few characters, and the plan says the two helpers are copies of the v1 `test-generators.js`. Rewriting them for a linear-time guarantee changes a copied normalisation for no reachable input. They do not move the Reliability rating.

## Dropped

- **F12** (the `code-reviewer` agent is the Sakta Cab one). Low, not this PR's files, and no open epic ticket touches `.claude/agents/`; per the deferral rule it is noted here and dropped. The same drift holds for `.claude/skills/piv-validate` (a pnpm/turbo gate this repo does not have): this round used the plan's D8 gate instead, as the PR body did.

## Manual look

- **SonarCloud** re-analyses on the push. The two Bug-rated lines are gone; the three regex smells above will still show. If the gate stays red on those, a human decides in the SonarCloud UI.
- **PC install** (report D11) is still open; unchanged by this round.

## Copies sweep

| Retired value or noun | grep | Hits and outcome |
|---|---|---|
| `first step` | `grep -rni "first step" e1/ .claude/plans/e1-*.md .claude/reports/e1-*.md` | `case.js:1,290,314` changed; README:16 changed; report:10 kept, round-1 note added; report:60 kept as an observation; plan:19,111,340,580,672,707,711 kept (design text, amendment added); `quiz.js:272` is v1 pupil text, untouched |
| `opened on` / `days you opened` | `grep -rn -E "opened on\|days you opened" e1/ .claude/plans/e1-*.md .claude/reports/e1-*.md` | README:57,61 and `map.html:85,91` changed; plan:410 kept, amendment added; report:69 kept as an observation, round-1 note added |
| `tutor:probe` claim | `grep -rn "store only\|only thing either page stores"` | README:23 amended; report:11 kept, round-1 note says it now holds; plan AC #3 holds as written |
| `380` | `grep -rn "380 lines"` | report:17 changed to 376 at `e1604a9` |
| `376`, `1238`, `2097`, `11 files` | PR body Files paragraph | replaced with the table below |

## Gate at the fixed tree

`record-gate.sh -- gate.sh` at `ad9ec44`, clean tree, finished 2026-09-27T07:48:37Z, exit 0, `short_gate true` (no turbo graph, same shape as the PR body's run). Output of `gate.sh` (observed):

```
syntax: ok
all 6300 runs pass, plus the fixture checks      # bun e1/test-case.js
all 6300 runs pass, plus the fixture checks      # node e1/test-case.js
all 6300 runs pass                               # node <v1>/.claude/tools/test-generators.js
```

`bun run check`: not applicable, no `package.json` until T1 (plan D8).

Figures at `ad9ec44` (observed, `wc -l`; `git diff --stat origin/main..HEAD`):

| | |
|---|---|
| Branch vs main | 12 files, 2274 insertions, 0 deletions |
| Fix commit | 8 files, 230 insertions, 53 deletions |
| `e1/` total | 1288 = 388 `case.js` + 358 `quiz.js` + 212 `test-case.js` + 132 `map.html` + 97 `README.md` + 48 `case.html` + 49 `install.sh` + 2 + 2 `.bat` |

## Pushed

See the final line of this file, written after the push.
