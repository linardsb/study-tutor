# PR #64 review fixes — round 1

Review: https://github.com/linardsb/study-tutor/pull/64#issuecomment-5915568158 (head 74515b6).
Scope: no steer was given. F1–F3 are the review's "request changes" set. F4–F6 were marked optional, but each is a few lines in this PR's own code, so they are fixed here too. Nothing was deferred.

## Fixed

**F1 (High) SonarCloud reliability C** — `app/intake.js`
- Four unawaited async calls now carry `void`: `renderChecklist` at the two `showMatch` returns and in `openInterview`, and `readPhoto` in the file `onchange` (the #54 F1 precedent).
- `:300` S3403: `page.door` started as `null` and was only assigned inside functions, so Sonar typed it `null` and read `=== "diagnostic"` as always false. It now starts as `""`, so the property is a string throughout. Nothing reads `page.door` as falsy (observed: `grep -n "\.door" app/intake.js` shows only the two assignments, the `!==` in `upsertRow`, the `intakeBody` argument and the `=== "diagnostic"` check). `intakeBody` never posts `""`, because rows exist only after `confirmRows`/`upsertRow` set the door.
- New failure mode of the mechanism: `void` marks the promise as deliberately dropped. A rejection is still unhandled, exactly as before the change, so there is no new failure mode. `renderChecklist` and `readPhoto` catch their own fetch errors.
- Test: no local Sonar. The DOM suite (`src/marking/intake-dom.test.ts`, 21 pass) covers the save, interview and photo paths. The gate result comes from CI's SonarCloud run on the pushed commit. If `:300` is still flagged after that, a human marks it a false positive in SonarCloud.

**F2 (Medium) coach POST half narrowed** — `src/server.ts` `/api/coach` POST
- POST now takes `full`. It answers a question GET already offered, so a course dropped in another tab mid-question still marks the answer, and `titleOf` finds the real title for Dan's prompt. Recorded under the plan's AMENDMENTS (D-Q4 now covers GET only).
- Answer guard: unchanged. `postCoach` resolves the item and marks through `correction` as before. The pack swap changes which topics exist. It does not change when an answer can enter a prompt; that is still decided by the attempt events.
- Test: `courses: coach POST still marks a question offered before its course was dropped`. On unfixed `server.ts` (`git show HEAD:src/server.ts`) it fails with `Expected: 200, Received: 404`, the generated-item path the review names (observed, re-run on the final test file at 2026-09-30T18:38Z). The review's other outcome, an items-file question accepted with the raw id in Dan's prompt, is not probed: the coach GET in this test served a generated question, and no test reads the prompt text.

**F3 (Medium) narrowing assertions that could not fail** — `src/server.test.ts`
- Next and the cold test: after the maths-only checks, the test saves `8464` only. It then asserts that next is `{ kind: "lesson", topic: "8464/4.1.1.2" }` and that every cold-test slot starts `8464/` (at least one slot). The two vacuous `not.toContain("8464/")` assertions are gone.
- Coach list: an attempt on `1MA1/R9/of-an-amount` is written first, the list is asserted to contain it, then asserted free of `1MA1/` after the save.
- Tier: a red intake mark on `AA1/X2` (posted through `/api/event`, 201) sorts it ahead of `AA1/X1`. The Foundation next is then asserted to be `AA1/X1`.
- Mutation probes (observed, this session; each mutation sed-edits one route from `scoped` to `full`, then restores the file):

| Mutation | Test that fails | Assertion that trips |
|---|---|---|
| `/api/next` → `full` | Foundation maths save test; tier test | `:1049` next lesson on `8464/4.1.1.2`; `:1303` next is `AA1/X1` (line numbers as of the fix commit) |
| `/api/intake/diagnostic` → `full` | Foundation maths save test | every slot `8464/` |
| `/api/coach` GET → `full` | coach offers test | `:1118` `not.toContain("1MA1/")`, received `[{"id":"1MA1/R9/of-an-amount",…}]` |

**F4 (Low) empty `courses` hides the doors** — `app/intake.js` `load`
- An empty `courses` list now throws inside the existing `try`, so the page takes the no-route path: doors shown, panel and line hidden.
- Test: `A2: a courses reply with no course to pick → the page as before, doors first`. It fails on unfixed `app/intake.js` and passes on the fixed one (observed).

**F5 (Low) `/api/courses` loads the pack outside a try** — `src/server.ts`
- `readRoute` now accepts a sync or async handler, and it awaits the handler inside its `try`. GET loads the packs inside the handler. `postCoursesRoute` takes a loader and awaits it inside its `try`. Both now load after `refuseForeign`.
- Test: `courses: a pack that fails to load answers 500 with an error body on GET and POST` uses a root with an unparseable `courses.json`. GET gives `{ error: "Could not read the courses" }` and POST gives `{ error: "Could not save the courses" }`. It fails on unfixed `server.ts` (observed, same re-run as F2).

**F6 (Low) tier fixture leaks on failure** — `src/server.test.ts`
- The tier test body is wrapped in `try`/`finally`, and `fs.rmSync(tiers)` runs in the `finally`. Not probed with a forced failure; this is a structural change only.

## Deferred

None.

## Manual look

- F1: confirm SonarCloud goes green on the pushed commit. If S3403 still fires at the `diagnostic` check, mark it a false positive in the SonarCloud UI (the review established that it is one).

## Numbers sweep

| Retired value / subject | `grep -n` target | Hits and action |
|---|---|---|
| `784` (test total) | `grep -n 784` in report and PR body | report `:31` kept as the implementation-time figure, with 787 added after it; PR body `:17` replaced (see PR body edit) |
| `29 files, +1,566 / −74` and split | `grep -n "1,566"` in PR body | `:14` replaced with the figures in "Size after the fix commit" |
| `coach GET/POST` narrowed (D-Q4) | `grep -n "D-Q4\|coach"` in plan, report, PR body | plan `:36`, `:156`, `:272` left as the original decision and superseded by the new AMENDMENTS line; report `:6` updated; PR body `:8` replaced (see PR body edit) |
| `no \`8464/\` in next or cold test` | report `:25` | replaced with the science-only assertions |

## Validation

- `record-gate.sh --clean -- bun run check` in `~/Desktop/study-tutor-a2`, 2026-09-30T18:40Z, after all fixes (observed): `bun run check` exit 0. The script printed "GATE SHORT"; that line comes from its turbo parser not matching a bun gate, not from a short run. tsc clean. biome 0 errors, 55 warnings (same as the review). `bun test`: 787 pass, 0 fail, 74 files. Derived: 784 + 3 new tests (F2, F5 in `server.test.ts`, F4 in `intake-dom.test.ts`) = 787. The F3 and F6 edits changed existing tests and added none.
