# PR #36 review fixes, round 1

**PR** https://github.com/linardsb/study-tutor/pull/36 · **Review** https://github.com/linardsb/study-tutor/pull/36#issuecomment-5872380702 · **Base at review** `de6fffc` · worktree `~/Desktop/study-tutor-t6`, 2026-09-28.

No scope steer was given. Triage assumption: land the three Mediums and the Lows that are a line or a few lines each; defer the Lows that need a new fixture or a plan-specified reorder to the epic ticket that next touches the file.

## Fixed (8)

Each closing command ran against the fixed tree on 2026-09-28 after the last edit; outputs quoted.

| code | what was wrong | fix | test | probe on the unfixed code |
|---|---|---|---|---|
| F1 (Medium) | `closeSession` in `app/retest.js` posted the served `end` for any open mode, so a lesson opened in a second tab was ended by the boss page and its topic reached rung 1 with no lesson done | `app/retest.js:246` now requires `next.step.mode === "boss"`, matching `resolveStep` | `retest-dom.test.ts` "finish while a lesson is open elsewhere": the fake serves a lesson `continue` after the retest post; asserts the posts are `["session","retest"]` and the first is the boss `start` | ran on `de6fffc`: `(fail)`, received `["session","retest","session"]`, the third being the lesson `end` (`observed`) |
| F2 (Medium) | `app/map.html:14` said every bar fills on a cold re-test; the first fills on a lesson end | "The first bar fills when you finish a lesson. The rest fill when you pass a cold re-test." | the register scan in `retest.test.ts` reads the file; passes | text change, no probe |
| F3 (Medium) | `retest-dom.test.ts` asserted the working was hidden, not absent, so the plan's original hidden-`div.working` at build would have passed | begin test: for every slot, `itemOf(slot).working` is non-empty and not in `#boss` `textContent`; answer test: the working is in the question's `textContent` after check | the same two tests | mutation: `buildQ` appended `el("p","",item.working)` into the hidden `.working` at build; the begin test failed with `expect(received).not.toContain(expected)` (`observed`); reverted with `git checkout -- app/retest.js` before the fix |
| F6 (Low) | `app/map.js` `load` wrote `lessonsNotLoaded` from the lessons catch without awaiting it, so with the server down the last rejection chose the message | the lessons promise resolves to `null`; `lessonsNotLoaded` is written only after the three awaited fetches succeed | `map-dom.test.ts` "server down and the lessons rejection landing last" (all fetches throw, lessons after 20 ms) asserts "The map did not load"; "only /api/lessons down" asserts "The lessons did not load" with the cards rendered and no lesson link | ran on the unfixed page: `(fail)`, received "The lessons did not load. Check the tutor window is still open." (`observed`) |
| F7 (Low) | each failed click appended another `p.note`, three retries showed three "Not saved" lines | `actionButton` reuses `holder.querySelector(".note")` and sets `textContent` | "start a lesson" test extended: two more failed clicks, `#today .note` has length 1 | ran on the unfixed page: `(fail)`, `Expected length: 1, Received length: 3` (`observed`) |
| F8 (Low) | the emoji scan `/[\u{2C00}-\u{10FFFF}]/u` in `map.test.ts` and `retest.test.ts` missed U+2600 to U+27BF | range widened to `[\u{2600}-\u{27BF}\u{2C00}-\u{10FFFF}]` in both | the two register tests | `bun -e` probe: old regex on "✨ done" `false`, on "⚡" `false`; new regex `true` for both, `false` for "plain" (`observed`) |
| F9 (Low) | `map-dom.test.ts:90` hardcoded `"1 of 21"` | `` `1 of ${pack.topics.length}` `` | the render test | text change, no probe |
| F11 (Low) | the loop test's real-day `next()` calls in steps 4 and 5 fail if London midnight passes between a `start` post and the `next()` after it, and nothing said so | comment at `src/server.test.ts:560-562`: the session opens on the day of its server-stamped `t`, so `?day=` cannot pin it | none; a comment | none |

New failure mode of each mechanism (F1 is Medium, so this is a courtesy line, not the High rule): F1 leaves a lesson `continue` untouched, which the map already handles as "Lesson open" (the "other mode" case in `retest-dom.test.ts` test 4). F6 could lose the lessons message; the "only /api/lessons down" test pins it. F7 could reuse a `.note` that is not the failure note; the today box holds no other `.note` (`renderToday` makes a plain `p` and links or buttons).

Closing commands, run 2026-09-28 after the last edit (`observed`):

```
bun test src/marking/retest-dom.test.ts src/marking/map-dom.test.ts   → 12 pass, 0 fail
grep -n 'mode === "boss"' app/retest.js                                 → 246
grep -n "first bar fills" app/map.html                                  → 14
grep -n '2600' src/marking/map.test.ts src/marking/retest.test.ts       → map.test.ts:153, retest.test.ts:176
grep -n 'of ${pack.topics.length}' src/marking/map-dom.test.ts          → 90
grep -n "London midnight" src/server.test.ts                            → 562
```

## Deferred (3)

- **F4 (Low)** `app/map.js` `dayQuery` untested → appended as a checklist line to #16 (T14, squad mode; depends on T6 and reuses the map and boss pages). Needs a second happy-dom registration with a `?day=` URL.
- **F5 (Low)** boss `start` posted before `buildItems` → appended to #16. Plan Task 11 step 3 specified this order; every topic has a generator and every fixed item carries `answers` today (the review scanned `content/maths/items/*.json`).
- **F10 (Low)** `lessonFile` reads every lesson file per topic; `open_lesson` uncached → no open epic ticket names `src/content/pack.ts` or `src/mcp/tools.ts` (T16's acceptance criterion is `src/` unchanged), so dropped per the deferral rule; the review of the next PR touching `pack.ts` will re-find it.

## Needs a human look

None. The review's Level 4 manual steps were not re-run; the changed text on the map aim line and the two map.js branches are covered by the DOM tests above.

## Noise / won't fix

None. The `properties.test.ts` timeout the review saw under load is not a finding against this PR and is untouched.

## Copies chased

`grep -n` per retired value or claim, 2026-09-28, hits and what was done:

| grep | hits | action |
|---|---|---|
| `"A bar fills"` in plan, report, `events.md`, both HTML files | `.claude/plans/t6-o1-pages.md:279` | updated to the new sentence, marked "PR #36 review F2" |
| `"328"` | report `:42`, `:51` | both now carry the `de6fffc` figure and the post-fix 331 |
| `"63,963"` | report `:42` | as above, 64,005 added |
| `"+27"` | report `:51` | `+30` added beside it (331 − 301, `derived`) |
| `"lessonsNotLoaded"` | report `:63` ("not tested"), plan `:307`, plan `:482` | report row → `map-dom 6`; plan `:482` step rewritten to the sentinel shape; `:307` is the string table, unchanged |
| `"p.note"` | plan `:484` | rewritten to "the box's one `p.note` (reused across retries)" |
| `"Not saved"` | report `:37`, `:55`; plan `:210`, `:308`, `:341`, `:508`, `:573`, `:648` | report `:37` rewritten with the six map-dom tests; the rest describe the string or a single failed post and stay true |
| PR body: `328`, `63,963`, `+27`, `33 files` | Validation line 18 | updated in the PR body with the post-fix run (see below) |

Test-count lines in the report: `map-dom.test.ts` 4 → 6, `retest-dom.test.ts` 5 → 6.

## Validation

`bun run check` in the worktree, dirty tree over `de6fffc`, 2026-09-28 (`observed`): tsc clean, biome 0 errors and 4 warnings (the pre-existing `app/style.css` four), `bun test` 331 pass, 0 fail, 64,005 expect() calls, 33 files, 10.28 s. `record-gate.sh` wrote `exit_code: 0` and printed its "GATE SHORT" line, which is its turbo task parser on a non-turbo repo, not a verdict. `bun scripts/test-generators.ts`: all 6300 runs pass (`observed`). `bunx biome lint --only=complexity/noExcessiveCognitiveComplexity app/map.js app/retest.js`: 0 diagnostics (`observed`).

Two formatter rounds were needed on the new test code (`biome format --write` on the three test files) before the gate went green; no source file was reformatted.

## Pushed

One commit on `feature/t6-o1-pages` (`fix: PR #36 round 1: ...`), pushed to `origin`; the PR body's Validation section carries the post-fix gate figures and this report's path.
