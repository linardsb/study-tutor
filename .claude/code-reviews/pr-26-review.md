# PR #26 review: T4 server and lesson bridge

**Head** `7ec5b37` · **Base** `main` @ `a3c87b7` · round 1 · reviewed 2026-09-27

**Recommendation: request changes (blocking on F1).** 1 Critical, 2 High, 3 Medium, 4 Low. `bun run check` is green and every figure in the PR body re-derives. The static server's traversal guard holds on macOS only: on Windows the same line serves `data/events.jsonl` and 404s every lesson.

## Validation

| Check | Result |
|---|---|
| `bun run check` at `7ec5b37` | green: `tsc` clean, Biome 0 errors, 4 `noDescendingSpecificity` warnings at `app/style.css` 621, 622, 650, 651; 126 pass, 0 fail, 15 files (`observed`) |
| `bun test` on `origin/main` `a3c87b7` (temp worktree) | 108 pass, 12 files (`observed`); 108 + 1 + 3 + 6 + 4 + 5 + 6 − 2 − 5 = 126 (`derived`, matches) |
| `bun scripts/test-generators.ts` | all 6300 runs pass (`observed`) |
| `bun run build` | exit 0; `StudyTutor-mac.zip` 46,960,993 bytes, `StudyTutor-windows.zip` 41,270,934 bytes, byte-identical to the PR body; 21 lesson files, nothing under `data/` (`observed`, `unzip -l`) |
| PR body size figures | 3,605 / 1,852 / 66 files and every bucket (app 1,359, content 189/1,509 over 42 files, source 251/194, tests 637/145, docs 1,168/2, package.json 1/2) re-derived from `git diff --numstat origin/main..HEAD` (`observed`) |
| Strip claims | 0 lessons hold `class="q"`, 0 files under lessons or reference hold `../`, 21 lesson links in `app/index.html` (`observed`, grep) |
| SonarCloud Code Analysis | **fail**: quality gate "C Security Rating on New Code" and "C Reliability Rating on New Code", both required ≥ A (`observed`, check run 108618854960) |
| Level 4 manual steps 1 to 7 | author-`observed`; not re-run in a browser here. The automated equivalent (`src/server.test.ts` end to end) is green, and a probe against `startServer` on a temp `data/` confirmed POST → 201 → one log line → `state.json` written (`observed`) |
| CI workflows | none in the repo; the draft is marked ready by hand |
| Guarantees pass | first round, no prior report: skipped |

## Issues

### Critical

**F1. On Windows the static path guard inverts: `/content/` paths 404 and `/../data/events.jsonl` is served.** `src/server.ts:42`.

`rel` already starts with `/`, so `path.normalize(\`/${rel}\`)` receives `//maths/topics.json`. POSIX `normalize` collapses the doubled slash and the macOS tests pass. `path.win32.normalize` reads a leading `//` as a UNC root `\\server\share`. Re-derived on this machine with `path.win32` (`observed`):

| Request `rel` | `win32.normalize("/" + rel)` | after `win32.join("C:\\StudyTutor", "content", …)` |
|---|---|---|
| `/quiz.js` | `\quiz.js` | `C:\StudyTutor\content\quiz.js` (fine) |
| `/maths/topics.json` | `\\maths\topics.json\` | `C:\StudyTutor\content\maths\topics.json\` (trailing separator: not a file, 404) |
| `/../data/events.jsonl` | `\\..\data\events.jsonl` | `C:\StudyTutor\data\events.jsonl` (the pupil's log, served) |
| `/../../x.txt` | `\\..\..\x.txt` | `C:\x.txt` (any file on the drive) |

So on the Windows zip, which the report marks `expected, same code path`, every lesson, items file, `generators.js` and `topics.json` is 404 (all have two or more segments under `/content/`), and a browser page can read `data/` and anything above the install folder. The eight-path traversal test at `src/server.test.ts:126-137` proves POSIX only. The plan's GOTCHA at line 609 ("`path.normalize("/../x")` is `/x`") is the POSIX rule.

Fix: do not lean on `normalize`. Decode, split the URL path on `/`, refuse any segment that is `..` or contains `\`, then `path.join(root, folder, ...segments)` and assert the result starts with `path.join(root, folder) + path.sep`. Pull that into a pure `staticPath(root, folder, rel, p = path)` so `server.test.ts` can run the same eight paths through `path.win32` on every OS. This may also be the source of Sonar's Security C (F2).

### High

**F2. SonarCloud quality gate red.** Two conditions failed.

- Reliability C: `app/quiz.js:23` `.replace(/^(-?)\./, "$10.")`, Sonar "Referencing non-existing group: $10". It works by spec (`$10` with one group is `$1` then a literal `0`; `"-.5"` → `"-0.5"`, `observed`) and the parity test covers `.5` and `-.5`. Sonar still counts it a major bug. Fix: the function replacer `normalise.ts:16` already uses, `(_, sign) => \`${sign}0.\``. The parity test guards the change.
- Security C: its issue is not among the 19 annotations Sonar posted to GitHub (none of them is a vulnerability). Open the dashboard (link in the check run) and name the rule in the PR body. The PR body predicted a path-traversal alert on `src/server.ts`; if that is it, F1's fix is the answer and the alert should not be marked safe on the strength of the POSIX argument.
- Not gating, worth a pass in the same commit: `check()` at `app/quiz.js:285` cognitive complexity 20 (the one `failure`-level annotation), the nested ternaries at `238-244` and `325-327`, `document.execCommand` at `429`, the two `Math.random` hotspots (`quiz.js:181`, `practice.js:22`: seeds, not secrets; mark safe with that reason), the backtracking regex at `quiz.js:24` which is the same regex as `normalise.ts:17` on `main`.

**F3. A cross-site page can write to the pupil's record.** `src/server.ts:64-73`.

`POST /api/event` checks nothing about who sent it: no `Origin`, no `Host`, no `content-type`. A page on any site open in the same browser can send a simple request (`fetch` with a `text/plain` body, or a form with `enctype="text/plain"`), which needs no preflight, and `req.json()` parses it regardless of content type. Probe against `startServer` on a temp `data/` (`observed`): `POST /api/event` with `content-type: text/plain` and `Origin: https://evil.example` → 201, one line in `events.jsonl`. `GET /api/state` with `Host: attacker.example` → 200 with the state (DNS rebinding shape). A preflight (`OPTIONS`) gets 405 with no CORS headers, so a JSON-typed cross-origin request is blocked by the browser; the text/plain one is not. Whether a public page reaches loopback is browser-dependent (Chrome's local-network checks, Firefox and Safari without them); the server-side check removes the dependence.

The ticket's invariant is "events are the record"; a drive-by page writing `attempt` or `intake` lines breaks it, and every later job reads that record. Fix, both routes: refuse when `Origin` is present and is not `http://127.0.0.1:<port>` or `http://localhost:<port>` (403); refuse a `Host` that is not one of those (403); on POST, refuse a `content-type` that is not `application/json` (415). `curl` sends no `Origin`, so the plan's manual step 6 still works. Add the three refusals to `server.test.ts`.

### Medium

**F4. Three lessons tell the pupil to drag a shape that is not there.** `content/maths/lessons/0017-U617-volume-of-a-sphere.html:30-35`, `0018-U116-volume-of-a-cone.html:33-38`, `0019-U871-surface-area-of-a-pyramid.html:34-39`.

The strip drops the `solids.js` and `three.min.js` script tags (`scripts/strip-lessons.ts:18`) and `app/` ships neither. Deviation Q3 documents losing the draggable solid. It does not cover the `#explore` prose that stays: "Drag the shape to turn it. Pour the cone into the tin round it…" above an empty `div.solid`. The fixed-point test cannot catch it because the strip left it there. Fix: either carry `solids.js` and `vendor/three.min.js` into `app/` and rewrite the tags like `quiz.js`, or add a `strip-lessons.ts` row that removes `<section id="explore">…</section>` so the test enforces it. If the follow-up ticket the plan recommends is the answer, open it and link it from the PR body.

**F5. Two index links carry an SVG title sentence as link text.** `app/index.html:37-40`.

"U721 Direct proportion 4 pens to 8 pens is times 2, and £6 to £12 is times 2" and "U950 Area of a circle Eight slices of a circle laid head to tail…" are the inline SVG `<title>` strings from lessons 0015 and 0016, pasted into the list. `strip-lessons.test.ts:122-130` checks hrefs only. Fix: trim both to the code and title.

**F6. `GET /api/state` has no error path.** `src/server.ts:63`.

`currentState` throws when `readLines` hits anything but ENOENT (`append.ts:108-112`: EACCES, EISDIR, a `Refused` from `resolveInData` on a symlinked `events.jsonl`) or when `writeState` cannot write. `postEvent` catches and returns `json(500, …)`; the state route does not, so the reply is Bun's default 500, which under `bun run dev` is the HTML error page with the stack. Fix: the same try/catch as `event.ts:45-51`, returning `{ error: "Could not read the record" }`.

### Low

**F7. Radio group names collide between a lesson quiz and its "Five more" set.** `app/quiz.js:273`. `buildQuiz` gives the fresh section the same `data-code` (`:170`), so `sure-U349-0` names two groups; ticking Sure on the new set unticks the finished item's radio. The record is unaffected. Fix: a per-quiz counter in the name.

**F8. Tests pin Bun's exact MIME string.** `src/server.test.ts:69, 98, 102, 106` assert `text/javascript;charset=utf-8` with no space, Bun's formatting rather than this code's. `toStartWith("text/javascript")` tests the rule ("typed by extension") and survives a Bun bump.

**F9. `content-pack.md:31` overstates the fixed-point test.** "fails if a `.q` block or a `../assets` link comes back": `stripQuiz` only removes `.q` inside `<section id="quiz">` and `rewriteLinks` matches the seven exact `LINKS` forms. Say "a `.q` block in the quiz section or one of the rewritten v1 links".

**F10. `.claude/agents/code-reviewer.md` is the Sakta Cab definition.** Not this PR's change. The reviewer agent worked with an override in the prompt; the file should be this repo's rubric before the next review.

## Constraint pass

No AC or GOTCHA in the plan freezes a file these fixes touch. F1's fix replaces the mechanism the plan's GOTCHA at line 609 describes (normalise-then-join); AC #1 (serve `app/` and `content/`) is unchanged. F3 keeps the plan's `curl` step 6 working. F4's strip option keeps AC "no `.q` block and no `../assets` link".

## Numbers pass

Every figure in the PR body and the report names a run and re-derives (table above). One figure was `expected` and is now contradicted: "Windows zip not run (`expected`, same code path)" in the report's Level 4 step 5. The code path is the same; the platform's `path` is not, and that is where F1 lives.

## Done well

- The guard: `postEvent` copies the body, rewrites only `topic` and `topics[].topic`, and `appendEvent` copies only `KEYS` fields; `event.test.ts:110-130` proves a posted `answers`, `working` and `t` never land. Validation before `mkdirSync` plus "no data folder" tests on both refusal paths.
- One attempt per item at the first check: `posted` flips before the fetch, `sureAtFirst` freezes at the first check, the empty-answer and no-confidence returns sit before `tries++`.
- `norm` and `lcg` shared by test rather than import, with the awkward inputs (`-.5`, `007`, `€1,000.50`, `5º`) in the list, and the report says which mutations did not bite until rows were added.
- `strip-lessons.ts` idempotent by construction, committed files pinned as fixed points; every `data-items` checked against the items file's topic.
- Pupil-facing strings follow the register rules; nothing states an answer before a check.
- The PR body's figures all carry provenance and all survive re-derivation.

## Recommendation

Request changes. F1 blocks: the Windows build is the one the ticket ships to most families and it serves `data/` while serving no lesson. F2 and F3 before merge. F4 to F6 in the same fix pass or as linked tickets. Next: `piv-fix-review-findings` on this report, then re-run validation with a `path.win32` test in the suite.
