# Implementation Report — T6 O1 pages: level map, boss battle, cold re-test, weekly flame

**Plan**: `.claude/plans/t6-o1-pages.md`   **Branch**: `feature/t6-o1-pages` (worktree `~/Desktop/study-tutor-t6`)   **Status**: COMPLETE

## Summary

Two new browser pages consume T5's flow. `app/map.html` + `app/map.js` render one card per pack topic (ladder, rung, next re-test due, lesson link), the weekly flame, total XP and a today box that shows the step `GET /api/next` returns and posts the `start` or `end` body the server handed it, verbatim. `app/retest.html` + `app/retest.js` render the boss: questions built in the browser from pack items by id or seeded generator rolls, unlabelled and one go each, then one `retest` per topic and the served `end`. `GET /api/lessons` is a new read route; `lessonFile` moved from `src/mcp/tools.ts` to `src/content/pack.ts`. Page code runs under `bun test` with happy-dom and a fake `fetch`.

**Guard restatement**: `src/mcp/tools.ts` changed only by importing `lessonFile` from its new home (and dropping the two imports that move made unused); no tool's input, output or behaviour changed and `src/mcp/tools.test.ts` is untouched and green. No file under `src/jobs` and no prompt exists or changed, so no path puts an item answer into a model prompt. Answers reaching the browser for marking is D7, inherited from practice.

## Tasks completed

- Task 0 dev dependency → `package.json`, `bun.lock` (UPDATE, `@happy-dom/global-registrator@^20.14.5`)
- Task 1 `lessonFile` move → `src/content/pack.ts` (UPDATE), `src/mcp/tools.ts` (UPDATE, imports only)
- Task 2 route helper → `src/api/lessons.ts` (CREATE)
- Task 3 → `src/api/lessons.test.ts` (CREATE)
- Task 4 `GET /api/lessons` → `src/server.ts` (UPDATE)
- Task 5 style block → `app/style.css` (UPDATE)
- Task 6 → `app/map.html` (CREATE)
- Task 7 → `app/map.js` (CREATE)
- Task 8 `MODES` export → `src/events/types.ts` (UPDATE); `src/marking/map.test.ts` (CREATE)
- Task 9 → `src/marking/map-dom.test.ts` (CREATE); `src/marking/dom.ts` (CREATE, see deviations)
- Task 10 → `app/retest.html` (CREATE)
- Task 11 → `app/retest.js` (CREATE)
- Task 12 → `src/marking/retest.test.ts` (CREATE)
- Task 13 → `src/marking/retest-dom.test.ts` (CREATE)
- Task 14 `?topic=` pre-tick → `app/practice.js` (UPDATE)
- Task 15 map link → `app/index.html` (UPDATE)
- Task 16 static routes, `/api/lessons`, the loop → `src/server.test.ts` (UPDATE)
- Task 17 → `.claude/references/events.md` (UPDATE)
- Task 18 register re-check, gate, Level 4 (below)

## Tests added

- `src/api/lessons.test.ts` (2): one URL per pack topic, each file exists; a topic with no lesson is left out; the second call is the cached object.
- `src/marking/map.test.ts` (6): `RUNGS` and `MODE_NAMES` parity; `dueText` including the BST switch; `stepText`/`stepActions` for every `Step` kind, with `post` bodies asserted by identity; the boss href carries `?day=`; register scan.
- `src/marking/map-dom.test.ts` (6): render (cards, stats, today box, no POST); continue (Open it link, Done posts the served `end` and re-renders); start a lesson (posts `step.start` then `api.go`, a 500 re-enables the button with one Not saved note across retries); a 500 from `/api/state` names the tutor window and leaves the map empty; server down with the lessons rejection landing last still names the map; only `/api/lessons` down renders the cards without links and names the lessons (the last three from PR #36 review F6, F7).
- `src/marking/retest.test.ts` (8): `passes`, `itemsFile`, `NEXT_DAYS`, `RUNGS` parity; `buildItems` on a real boss, an unknown id, no generator; `scoreOf`; `retestBody` parses as `retest@1` with `passed` agreeing; the four `RUNG_LINES`; register scan of both pages and every exported string; no page writes a file and every POST targets `/api/event` or `/api/config`.
- `src/marking/retest-dom.test.ts` (6): intro; begin posts the served start and renders unlabelled questions with no working text in the page (PR #36 review F3); answer, one retest then the served end, the result row, the working text present after each check; open boss on load ended and re-formed, other mode sends to the map, no boss; a failed retest post shows Not scored yet and posts no end; a lesson open elsewhere at finish gets no end posted (PR #36 review F1).
- `src/server.test.ts` (+2, +5 asserts): `/api/lessons`; the full loop lesson start → end → boss three days on → reload → start → retest → end → rung 2 and next due at +10 → a wrong `passed` is 400.

Results: 328 pass, 0 fail, 63,963 expect() calls, 33 files (`observed`, `bun run check`, 2026-09-28, at `de6fffc`). After the PR #36 round 1 fixes: 331 pass, 0 fail, 64,005 expect() calls, 33 files (`observed`, `bun run check`, 2026-09-28).

## Validation results

| check | result |
|---|---|
| `bunx tsc --noEmit` | clean (`observed`) |
| `bunx biome check .` | 0 errors, 4 warnings, all pre-existing on `app/style.css` (`observed`; `main` also has 4) |
| `bunx biome lint --only=complexity/noExcessiveCognitiveComplexity app/map.js app/retest.js src/api/lessons.ts src/content/pack.ts` | 0 diagnostics (`observed`) |
| `bun run check` | 328 pass, 0 fail at `de6fffc` (`observed`; baseline 301 before this ticket, so +27); 331 pass, 0 fail after the PR #36 round 1 fixes (`observed`, so +30) |
| `bun scripts/test-generators.ts` | all 6300 runs pass (`observed`) |
| Level 4 manual, `agent-browser` against `bun src/server.ts` on a fresh `data/` | steps 1 to 11 all `observed`; step 5 and step 7 performed on the real day (see deviations D1); step 8 partial save taken as `retest-dom.test.ts` test 5 (the plan allowed either) |

Level 4 observed values: 21 cards `not started · lesson`; stats `0 of your 3 this week`, `0` XP, `0 of 21`; today `Next: Percentage of an amount.`; `/retest.html` on an empty record `No boss today. Nothing is due.`; Start the lesson lands on the U349 lesson and the log's last line is the lesson start; Done with it re-renders in place with `learning · re-test in 3 days`, `1 of 21`, `Next: Simplifying ratio.`; `?day=T+3` gives `re-test due today` and `Boss ready. 3 questions from 1 topic …`; `?day=today` is ignored; the boss shows three numbered stems with no hint, radio, title or code; a reload gives the same three stems; 2 of 3 gives `One cold pass …`, the log has the retest with `seed` and `xp` 20; back on the map `1 pass · re-test in 7 days`, XP 20; a lesson open then `/retest.html` gives `Something else is open. Finish it on the map first.`; a two-topic boss gives `6 questions from 2 topics.` and two result rows; `?topic=1MA1/R4` ticks only that topic, plain ticks 21; with the server stopped, Start shows ` Not saved. Check the tutor window is still open.` with the button re-enabled and `data/` holds only `events.jsonl` and `state.json`; `/api/lessons` has 21 keys.

## UX states

| surface | state | built | tested |
|---|---|---|---|
| map | empty record | yes | map-dom 1 (rung-0 card), Level 4 step 1 |
| map | server gone / `/api/state` 500 (`notLoaded`) | yes | map-dom 4, Level 4 step 10 |
| map | `/api/lessons` failed alone (`lessonsNotLoaded`, cards show `no lesson yet`) | yes | map-dom 6 (PR #36 review F6) |
| map | post failed (`notSaved`, button re-enabled) | yes | map-dom 3, Level 4 step 10 |
| map | loading | none declared in the plan; holders stay empty until the fetches resolve | n/a |
| boss | no boss / other mode open / open boss re-formed | yes | retest-dom 4, Level 4 steps 1, 5, 7 |
| boss | `couldNotClose` (still open after the end post) | yes | not tested |
| boss | `notLoaded`, `notSaved` on Begin | yes | not tested |
| boss | `noQuestions` (nothing buildable) | yes | not tested (`buildItems` empty case is unit-tested) |
| boss | a retest post failed (`notScored` + `notSaved`, no end) | yes | retest-dom 5 |

## Deviations from the plan

- **D1 (plan error, test restructured, pages unchanged)** The loop test's step 4 expected `GET /api/next?day=T+3` to return `continue` for a boss started today. `openToday` in `src/flow/session.ts` resumes a session only on the day it was started, so under `?day=` the same boss re-forms with no `continue`, and the boss page's `closeSession` finds no open session to end. The test now asserts both facts: under `?day=` the slots re-form deep-equal, and on the real day the open boss carries no `boss` key, its `end` posts, and the boss re-forms. Consequence for manual checks only: a boss run under `?day=` leaves its session open until the real-day map's Done (observed in Level 4: the plain map then read `Boss open.` and Done closed it). Real use has no `?day=`. Level 4 steps 5 (reload posts end) and 7 (other open) were performed on the real day instead.
- **D2 (added file)** `src/marking/dom.ts`: hand-typed `El`/`Doc` shapes, `doc()`, `keyEvent()` and `until()`. `tsconfig.json` has `lib: ["ESNext"]` and no `dom`, so the two DOM test files failed `tsc` on `document`, `HTMLElement` and `KeyboardEvent`. Widening the lib would let server code reach `document`, so the shapes are typed by hand and the real objects come from happy-dom at run time. The plan's spike ran the tests, not `tsc`.
- **D3** The DOM tests import their page with a `?dom` query (`map.js?dom`, `retest.js?dom`). Bun caches a module per process, so the unit test file's earlier import of the same page would leave the page code un-run in the DOM test (observed: 4 failures when `map.test.ts` ran first). Documented in `events.md`.
- **D4** `retest-dom.test.ts` sets `globalThis.GEN` to the maths table after `loadGenerators`. `src/content/generators.test.ts` loads a second subject's table, which replaces the global the page reads the way a browser would (observed: 3 failures in the full suite only). This mirrors what the `generators.js` script tag leaves on `window`.
- **D5 (stricter than the plan)** `retest.js` appends an item's `working` to the DOM inside the check handler, not as a hidden node at render (plan Task 11 step 4 had a hidden `div.working` holding it). Same invariant as `case.js`; a cold question has no answer text in the page before the pupil commits.
- **D6** `retest.js` does not fetch `/api/state` as `before` on Begin; nothing read it. `after` is fetched once for the result screen.
- **D7** `buildItems` takes a fixed slot's pack item only when it carries an `answers` array; otherwise the slot rolls a generator. A confident-wrong item always has answers today (it came from an attempt on a marked item), so this guards content drift only.
- **D8** `map.js`: `TEXT.statStartedLabel` (`topics started`) added so the scan covers the label; a ` · ` text node separates the rung span from the lesson link (v1's meta line had the same separator).
- **D9** `map-dom.test.ts` test 2 asserts `Open it` as a link with the lesson href instead of clicking it through `api.go`: the plan's Task 7 step 3 makes non-post actions plain `a` elements, and a link click under happy-dom would navigate rather than reach `api.go`. `api.go` is covered by the Start the lesson test.
- **D10** `app/style.css`: `.result ol li` rather than `.result li`; the plan's selector raised a fifth `noDescendingSpecificity` warning against `ul.prompts li` (observed), so the count stayed at 4.
- **D11** `src/mcp/tools.ts`: `import path from "node:path"` was also removed; it was only used by `lessonFile`. The plan named `fs` only.
- **D12** `src/server.test.ts` loop step 5 reads `/api/next` without `?day=` for the `continue`, for the reason in D1.

## Issues encountered

- The `rm -rf data` in Level 4 step 1 is blocked by the repo's pre-tool hook; the worktree had no `data/`, so nothing needed removing. `data/` from the manual run is left in the worktree (gitignored).
- `bun src/server.ts` opens a browser on start; the manual run used `PATH=/usr/bin:/bin` so no opener was found and the page was driven by `agent-browser` instead.
- Q1 to Q10 in the plan were taken as assumed; none was contradicted by the code.
