# Implementation Report — T4 server and lesson bridge

**Plan**: `.claude/plans/t4-server-and-lesson-bridge.md`   **Branch**: `feature/t4-server-bridge`   **Status**: COMPLETE

## Summary

The first end-to-end slice. `src/server.ts` serves `app/` at `/` and `content/` at `/content/` from the folder
beside the binary, with `GET /api/state` (replay, refresh `state.json`) and `POST /api/event` (alias resolution,
`appendEvent`, 400 on refusal with nothing written). `app/quiz.js` renders a lesson's items from the file named
in `data-items`, marks in the page and posts one `attempt` per item at the first check. The 21 lessons lost their
inline `.q` blocks and the 21 reference sheets their `../assets` links through `scripts/strip-lessons.ts`, whose
test holds the committed files as fixed points. `app/practice.html` builds a seeded Mixed 6 from `generators.js`.
`scripts/build.ts` stages `app/` and `content/` beside the binary.

## Tasks completed

- Task 1 validate before disk → `src/events/append.ts`, `src/events/append.test.ts` (UPDATE)
- Task 2 donor CSS, Biome-formatted once → `app/style.css` (CREATE)
- Task 3 strip script, run once over 42 files → `scripts/strip-lessons.ts` (CREATE), `content/maths/lessons/*.html`, `content/maths/reference/*.html` (UPDATE)
- Task 4 strip tests → `scripts/strip-lessons.test.ts` (CREATE)
- Task 5 converter removed → `scripts/convert-lessons.ts`, `scripts/convert-lessons.test.ts` (DELETE), `package.json` (UPDATE, `convert` script gone)
- Task 6 `currentState` → `src/api/state.ts`, `src/api/state.test.ts` (CREATE)
- Task 7 `postEvent`, `resolveTopic` → `src/api/event.ts`, `src/api/event.test.ts` (CREATE)
- Task 8 root, routes, static, `openBrowser(url, env)` → `src/server.ts` (UPDATE)
- Task 9 server tests → `src/server.test.ts` (UPDATE)
- Task 10 the port → `app/quiz.js` (CREATE)
- Task 11 parity tests → `src/marking/quiz.test.ts` (CREATE)
- Task 12 lesson list → `app/index.html` (CREATE)
- Task 13 practice page → `app/practice.html`, `app/practice.js` (CREATE)
- Task 14 stage `app/` and `content/` → `scripts/build.ts` (UPDATE)
- Task 15 docs → `.claude/references/content-pack.md`, `.claude/references/events.md` (UPDATE)
- Task 16 gate, Task 17 Level 4: below

## Tests added

| File | Cases | Result |
|---|---|---|
| `src/events/append.test.ts` | +1: a refused event creates no data folder | pass |
| `src/api/state.test.ts` | 3: empty log creates nothing; two appends show in `confidentWrong` and `state.json` hash matches; stale `state.json` rewritten | pass |
| `src/api/event.test.ts` | 6: alias resolved with server `t`; id and unknown code pass through; intake `topics[]` resolved; malformed → 400 no folder; non-object → 400 no folder; posted `answers`/`working`/`t` never reach the log | pass |
| `src/server.test.ts` | 6: ladder (kept, now asserts `index.html`); static types and no listing; 8 traversal paths plus `/data/events.jsonl` all 404; methods; end to end POST → GET state → refused → not JSON; `openBrowser` with empty `PATH` | pass |
| `src/marking/quiz.test.ts` | 4: `norm` parity on 20 inputs; `lcg` parity 10 values; `mark` with `=` in a misconception key; `itemFromGenerated` | pass |
| `scripts/strip-lessons.test.ts` | 5: fixture strip and two error paths; idempotence; 21 + 21 committed files are fixed points; every `data-items` resolves to a file whose items carry the aliased topic; every lesson linked once from `app/index.html` | pass |

Mutations run and reverted (all `observed`):

- Task 1: `mkdirSync` back above validation → the new test red, other 17 append tests green.
- Task 4: a `<div class="q"></div>` added to lesson 0002 → test 3 red, tests 1, 2, 4, 5 green.
- Task 9 A: static path joined raw (`rel` instead of `path.normalize("/" + rel)`) → traversal test red, 5 green.
  First run did not bite: the plan's five targets do not exist outside the served folder either way. Three
  encoded targets that do exist were added (`/..%2fpackage.json`, `/%2e%2e%2fpackage.json`,
  `/content/..%2fsrc%2fserver.ts`); second run red as planned.
- Task 9 B: `postEvent` returns 201 without `appendEvent` → end-to-end test red at the log-line count.
- Task 11: `π` → `"p"` in `quiz.js` `norm` → parity test red. First run did not bite: no plan row held `π`.
  Six rows added (`30π`, `36 cm²`, `2³`, `5º`, `3 deg`, `€1,000.50`); second run red.

## Validation results

| Check | Result (`observed`, 2026-09-27) |
|---|---|
| `bun run check` | green: `tsc` clean, Biome 0 errors and 4 warnings (below), 126 tests pass across 15 files |
| `bun scripts/test-generators.ts` | all 6300 runs pass |
| `bun run build` | both zips built; mac zip lists 21 lesson files and `app/quiz.js`, nothing under `data/`; 46,960,993 bytes (mac), 41,270,934 bytes (windows) |
| `bun scripts/strip-lessons.ts` | first run `42 files changed`, second `0 files changed`; 189 insertions, 1509 deletions under `content/` |

Test count: plan `derived` ≈129; `observed` 126. Arithmetic: 108 on `main` + 1 append + 3 state + 6 event
+ 4 quiz + 5 strip + 6 server − 2 old server − 5 convert = 126. The plan's "~8 server" was 6.

Biome warnings: 4 × `noDescendingSpecificity` in `app/style.css` (lines 621, 622, 650, 651), donor CSS
untouched. Warnings do not fail `biome check` (exit 0). Not fixed: surgical, the file is a copy.

Level 4 (all `observed`, Bun 1.3.4, macOS x86_64, headless Chrome through `agent-browser`):

1. `bun run dev` on port 4732 (4731 was held by another process; the ladder stepped). `/` lists 21 lessons and the Practice link. No `data/` created by `GET /` or `GET /api/state` on an empty log.
2. Lesson 0001: five items rendered, scaffold "10% of 45 = 4.5. …" on question 1. `4.5` + Sure + Check → "That is 10% of 45. You need two lots of it.", hint shown, working hidden. `9` + Check → "Correct on the second go.", working shown, score line "So far 1/1 on U349. No wrong answers." Log: exactly one line, `correct: false`, `sure: true`, `answer: "4.5"`, no `seed`. `/api/state`: `confidentWrong["1MA1/R9/of-an-amount#1"].topic` = `1MA1/R9/of-an-amount`, `calibration["2026-W39"].sureWrong` = 1. `data/` holds `events.jsonl` and `state.json`.
   2b. Lesson 0018: five items each with its SVG (`aria-label`s "A cone with radius 6 cm…", …, "A sphere with radius 3 cm…"); `.solid` div empty; only `/content/maths/generators.js` and `/quiz.js` loaded.
3. Practice: 21 topics listed with codes. Untick all, tick U349 and U687, Mixed 6 → status "2 topics in the pot.", six stems alternating percentage and ratio (no two in a row from one code). Answered item 1 ("Find 70% of 60.") with `1`, Sure → log line `item` `1MA1/R9/of-an-amount#gen`, `seed` 2168543902; `GEN.U349(quiz.lcg(2168543902)).stem` = "Find 70% of 60." (rebuild from seed works).
4. Server killed with the practice page open; answered item 2 correctly → "Correct. Not saved. Check the tutor window is still open." Log byte-identical before and after.
5. `dist/stage/mac/StudyTutor/StudyTutor-x64` run from `/tmp` (this Mac is Intel; the arm64 build gives "bad CPU type" here, as expected): console URL on 4731; lesson, items file and `quiz.js` all 200; POST attempt 201; `ls dist/stage/mac/StudyTutor/data` → `events.jsonl`, `state.json`; no `/tmp/data`. Windows zip not run (`expected`, same code path). **Contradicted by PR #26 review F1:** `path.win32.normalize` read the guard's `//` as a UNC root, so the Windows build 404ed every lesson and served `data/`. Fixed in the review round (`staticPath`, tested under `path.win32`); see `.claude/reports/pr-26-review-fixes.md`.
6. `POST /api/event` with `{"v":1,"type":"nope"}` → 400 `{"error":"Refused: not a valid nope v1 event"}`, no `data/` created.
7. `bun scripts/strip-lessons.ts` → `0 files changed`.

Both `data/` folders the run created were removed afterwards.

## Deviations from the plan

1. **`POST /api/state` is 405, not 404** (Task 9 test 3). The plan's handler checks the method before the path,
   so a POST that falls through to static is 405 by the plan's own code; the plan's test expectation said 404.
   Kept the handler, asserted 405. Same for the test name.
2. **Traversal test targets added** (Task 9 test 2). Three encoded paths whose target exists on disk, so
   mutation A bites. Nothing removed.
3. **`norm` parity rows added** (Task 11 test 1). The plan said "copy the input strings from
   `normalise.test.ts`" (9 rows); 11 more were added so every `replace` step has a row that exercises it.
4. **`app/index.html` built in Phase 1**, not Phase 3, because `strip-lessons.test.ts` test 5 reads it.
   Content as planned, plus a `<header>` and `<section>` wrapper so the donor CSS's `.lesson` layout applies.
5. **`quiz.js` `postAttempt` returns `Promise<boolean>`** (ok or not), and `check()` appends the "Not saved"
   sentence when it resolves false. The plan said "the caller shows … after the feedback text"; this is that,
   with the fetch outcome folded into one boolean rather than a status and a catch at the call site.
6. **`practice.html` crumb** says "Lessons" and links to `/`; the donor's said "Progress". The plan did not name
   the crumb; T6 owns progress and there is no such page yet. The lessons' own "Progress" crumb is untouched as
   the plan said.
7. **Q3 follow-up ticket not opened.** The plan recommends a ticket "carry solids.js and read.js into app/". (PR #26 F4: the three `#explore` sections that needed `solids.js` are now stripped too, so no lesson tells the pupil to drag a shape that is not there.)
   Not created here; listed as a next step for the PR.

Nothing in the plan's UX states was dropped: lesson items not loading ("The questions did not load…"), attempt
not saved ("Not saved…"), topics not loading on practice ("The topics did not load…"), no generators ("No
generators loaded…"), nothing ticked ("Tick at least one topic first.") are all in the shipped JS.

## Issues encountered

- `agent-browser find text "Untick all" click` hung until the tool's 120 s timeout and then failed with
  "Resource temporarily unavailable (os error 35)". Driving the buttons through `eval` worked. Not a product issue.
- The pre-tool hook refuses `rm -rf`; cleanup used `rm` on the two files and `rmdir`.
- Sonar: the static path is the only request-supplied path. The normalise-then-join line
  (`src/server.ts`, `path.join(root, folder, path.normalize(`/${rel}`))`) and the eight-path traversal test
  answer a "path traversal" alert; say so in the PR body. (Superseded: the line was POSIX-only, PR #26 F1;
  the answer is now `staticPath` and its `path.win32` test.)
