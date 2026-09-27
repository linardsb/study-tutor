# PR #26 review fixes, round 1

Review: `.claude/code-reviews/pr-26-review.md` (GitHub comment 5855906092 on PR #26, reviewed 2026-09-27).
Triage followed the reviewer's recommendation: F1 to F3 before merge, F4 to F9 in the same pass, F10 deferred.
Fixed on 2026-09-27, branch `feature/t4-server-and-lesson-bridge`.

## Triage

| Code | Severity | Decision |
|---|---|---|
| F1 | Critical | fixed |
| F2 | High | fixed (Reliability C); Security C rule could not be named from here, see "Needs a human look" |
| F3 | High | fixed |
| F4 | Medium | fixed (strip option) |
| F5 | Medium | fixed |
| F6 | Medium | fixed |
| F7 | Low | fixed; no DOM test in this harness, manual check listed below |
| F8 | Low | fixed |
| F9 | Low | fixed |
| F10 | Low | deferred: `.claude/agents/code-reviewer.md` is not this PR's change and no open epic ticket touches `.claude/agents/`. Dropped per the skill's rule; the next `piv-review-pr` re-finds it |

## Fixed

### F1. Windows path guard inverted (`src/server.ts`)

What was wrong: `path.normalize("/" + rel)` received `//maths/topics.json` because `rel` already begins with `/`. `path.win32.normalize` reads a leading `//` as a UNC root, so `/maths/topics.json` gained a trailing separator (404) and `/../data/events.jsonl` landed at `root\data\events.jsonl` (served). Reproduced before the fix with the review's own four inputs through `path.win32` (`observed`):

```
"/quiz.js" -> "\\quiz.js" -> C:\StudyTutor\app\quiz.js
"/maths/topics.json" -> "\\\\maths\\topics.json\\" -> C:\StudyTutor\content\maths\topics.json\
"/../data/events.jsonl" -> "\\\\..\\data\\events.jsonl" -> C:\StudyTutor\data\events.jsonl
"/../../x.txt" -> "\\\\..\\..\\x.txt" -> C:\x.txt
```

Fix: `staticPath(root, folder, rel, p = path)`, exported. Splits `rel` on `/`, drops empty segments, refuses any segment that is `..` or contains `\`, joins, and returns null unless the result starts with `join(root, folder) + p.sep`. No `normalize`. `p` is the platform `path` so the test runs the Windows rules on macOS.

Test: `src/server.test.ts` "staticPath: the same guard holds under the Windows path rules" runs the review's table plus the eight decoded traversal paths through both `path.win32` and `path.posix`. Mutation (normalise-then-join restored in `staticPath`): that test red, the eight-path POSIX test still green, which is why the POSIX suite never caught it (`observed`, 8 pass 1 fail).

New failure mode of the mechanism: a legitimate file refused. The positive rows (`/quiz.js`, `/maths/topics.json`, `/index.html`) under both platforms and the existing static test (lesson, `topics.json`, `practice.html`, all 200) cover it. A `\` in a real filename would now 404; none exists under `app/` or `content/`.

### F2. SonarCloud Reliability C (`app/quiz.js:23`)

What was wrong: `.replace(/^(-?)\./, "$10.")` is read by Sonar as group 10. Fix: the function replacer `normalise.ts` already uses, `(_, sign) => \`${sign}0.\``. Test: the existing parity test `src/marking/quiz.test.ts` with `.5` and `-.5` rows stays green (`observed`, in the 129).

Security C: see "Needs a human look".

### F3. Cross-site page could write the record (`src/server.ts`)

What was wrong: `POST /api/event` and `GET /api/state` checked no `Origin`, `Host` or `content-type`, so a simple cross-origin request (text/plain body, no preflight) wrote an event and a rebinding hostname read the state.

Fix: `refuseForeign(req)`, exported, applied by both routes before anything else. Host must be `127.0.0.1` or `localhost` with any port (403); an `Origin`, when present, must equal `http://<Host>` (403); a POST must declare `application/json` (415). No Origin passes, so the plan's `curl` step 6 still works.

Test: `src/server.test.ts` "api: a foreign Origin, a foreign Host or a non-JSON POST body is refused and nothing is written". Through the server: text/plain with foreign Origin 403, text/plain without Origin 415, foreign Origin on state 403, `data/` never created, own-origin JSON POST 201. Host through `refuseForeign` directly, since `fetch` will not set Host. Mutation (`refuseForeign` returning null): that test red (`observed`, 8 pass 1 fail).

Live probe with curl against `startServer` on a temp `data/` (`observed`, 2026-09-27):

```
host attacker.example GET /api/state -> 403
curl no Origin POST json (manual step 6) -> 201
text/plain body, evil Origin -> 403
text/plain body, no Origin -> 415
evil Origin GET /api/state -> 403
own Origin POST json -> 201
GET /../data/events.jsonl (curl --path-as-is) -> 404
log lines: 2
```

New failure mode of the mechanism: the tutor's own page refused. `quiz.js` posts with `content-type: application/json` (`app/quiz.js:94`); a browser sends `Origin: http://<host>` on a same-origin POST, which equals `http://<Host>` for both `127.0.0.1:<port>` and `localhost:<port>`. Both spellings are in the test. A pupil who opens the page by a LAN address is refused: that is intended, the server binds loopback only.

### F4. Three lessons told the pupil to drag a shape that is not there

What was wrong: the strip dropped `solids.js` and `three.min.js` but kept `<section id="explore">` with its "Drag the shape" prose above an empty `div.solid` (lessons 0017, 0018, 0019).

Fix: a `LINKS` row in `scripts/strip-lessons.ts` removes `<section id="explore">…</section>` and the blank line after it. `bun scripts/strip-lessons.ts` changed 3 files then 0 (`observed`, idempotent). The three lessons lose 7 lines each. Test: the fixture in `strip-lessons.test.ts` gains an explore section that `expected` drops; the fixed-point test went red on the committed lessons before the strip ran (`observed`, "Expected - 7", 4 pass 1 fail) and green after.

### F5. Index link text (`app/index.html:37-38`)

Two links carried SVG `<title>` sentences. Trimmed to code and title. Test: the existing index test checks hrefs, which are unchanged; the text is visible in the diff.

### F6. `GET /api/state` had no error path

Fix: `getState` wraps `currentState` in try/catch and returns `{ error: "Could not read the record" }` with 500, logging the cause. Test: "api: a record that cannot be read is a JSON 500" makes `events.jsonl` a directory (EISDIR). Mutation (catch rethrows): red (`observed`, 8 pass 1 fail).

### F7. Radio group names collided between a quiz and its fresh set

Fix: `quizCount` incremented per `initQuiz`; the name is now `sure-<code>-<n>-<idx>`. No DOM in the Bun test harness, so no automated test. Manual: finish a lesson quiz, click "Five more, fresh numbers", tick Sure on item 1 of the new set; item 1 of the finished set keeps its tick.

### F8. Tests pinned Bun's MIME string

`toStartWith("text/javascript")`, `"text/css"`, `"application/json"`, `"text/html"` in `src/server.test.ts`.

### F9. `content-pack.md:31` overstated the fixed-point test

Now: "fails if a `.q` block in the quiz section, an `#explore` section or one of the rewritten v1 links comes back."

## Copies of retired claims

Retired: "normalise-then-join makes the join safe", "Windows zip: same code path", the Sonar note that names the normalise line as the answer. Sweep (`grep -rn -i 'normali[sz]e.*join\|normalise-then-join\|same code path\|path.normalize\|Windows zip'`, `observed`):

| Hit | Action |
|---|---|
| `.claude/plans/t4-server-and-lesson-bridge.md:609-611` GOTCHA | retraction paragraph added under it |
| plan `:621` Sonar GOTCHA | "Superseded" line added |
| plan `:907-908` manual step 5 "same code path" | correction line added |
| plan `:1036` Sonar note | "Superseded" line added |
| plan `:532`, `:546`, `:665` | the plan's own code block and mutation step, left as the plan as written |
| `.claude/reports/t4-server-and-lesson-bridge-report.md:79` step 5 | "Contradicted by PR #26 review F1" sentence added |
| report `:114-116` Sonar note | "Superseded" line added |
| report `:49` mutation A | historical record of what ran, left |
| report `:102` Q3 | F4 note added |
| PR body "Files" (normalise-then-join), "Notes for the reviewer" (Sonar paragraph, Q3 deviation), Validation counts | rewritten in the PR body after the push |

## Needs a human look

- **Sonar Security C**: the project is private; the public API answers "Project doesn't exist" and the 19 GitHub annotations carry no rule text. Open the dashboard from the check run and name the rule in the PR body. If it is the static-path traversal, F1 is the fix. If it is the unchecked POST, F3 is.
- **Sonar hotspots** `quiz.js:181` and `practice.js:22` (`Math.random` as a seed, not a secret): mark safe in the UI with that reason. Not changed in code.
- **F7 manual check** as above; no DOM test harness.
- **Not done, not gating**: `check()` cognitive complexity 20, the nested ternaries at `quiz.js:238-244` and `325-327`, `document.execCommand`. Left for a `quiz.js` tidy in a later slice; noted here so the next review can hold me to it.

## Deferred

- F10: `.claude/agents/code-reviewer.md` is the Sakta Cab rubric. Low, not this PR, no epic ticket touches `.claude/agents/`. Dropped per the deferral rule.

## Where the fixes landed

PR #26 was OPEN at this run's step 0 check and MERGED (squash, `3763d19`, 2026-09-27T12:49:36Z) by the time the
fix commit was pushed to `feature/t4-server-bridge`; that push reached no PR. The fix commit is cherry-picked onto
`fix/pr-26-review-round-1` from `origin/main` and opened as PR #27 (`piv-create-pr`). `main` at `3763d19`
carries F1: the Windows build there serves `data/` and 404s every lesson until that PR merges. The PR body update
planned for #26 is moot; the new PR's body carries the Sonar note, the answer guard and the size figures instead.

## Validation (closing commands, run against the fixed tree, 2026-09-27)

```
$ bun run check
Checked 66 files in 28ms. No fixes applied.
Found 4 warnings.
 129 pass
 0 fail
 2888 expect() calls
Ran 129 tests across 15 files.
```

126 on `7ec5b37` + 3 new (`staticPath` win32, F3 refusals, F6 error path) = 129 (`derived`, matches). The 4 warnings are the same `noDescendingSpecificity` rows in `app/style.css`.

```
$ bun scripts/test-generators.ts
all 6300 runs pass
```

`piv-validate` in this repo is the Sakta Cab skill (pnpm/turbo); `bun run check` is this project's gate per CLAUDE.md.

Not touched: `.claude/skills/piv-create-pr/SKILL.md` was modified in the worktree by another session before this run and is left unstaged.
