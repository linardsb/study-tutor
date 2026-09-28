# PR #36 review, round 1: T6 O1 pages

**PR** https://github.com/linardsb/study-tutor/pull/36 · **Head** `de6fffc` · **Base** main @ `252e50b004d60cbba4ddebd71863ce3ca11c2289`
**Plan** `.claude/plans/t6-o1-pages.md` · **Report** `.claude/reports/t6-o1-pages-report.md` · round 1, so no guarantees or fix-mechanism pass (the base has not moved: live `origin/main` = `252e50b`). Reviewed from the worktree `~/Desktop/study-tutor-t6`. The diff was read by three parallel reviewers (map page, boss page, server side) against `CLAUDE.md` and `.claude/rules/content.md`; the repo's `code-reviewer` agent definition describes another project (Sakta Cab) and was not used.

## Summary

Both pages post only the `start`/`end` bodies the server returns, flow stays in `src/flow`, the boss reuses `quiz.js` marking and rng so parity is structural, and the guard restatement is accurate (`src/mcp/tools.ts` is a pure import move, `tools.test.ts` untouched, no `src/jobs`). The loop test pins the answer-withheld property on the boss payload. No Critical or High. Three Medium: the boss page's finish path ends whatever session is open, the map's aim text misdescribes the first bar, and the D5 invariant is not pinned by a test. Eight Low. The twelve documented deviations are intentional and not flagged.

**Recommendation: approve.** F1 to F3 are each a one-line edit and worth landing before merge; none blocks.

## Issues

### Medium

**F1** `app/retest.js:245` — `closeSession` posts the served `end` for any open mode, where `resolveStep` (`:347`) correctly requires `mode === "boss"`.
`if (next?.step.kind === "continue") await postEvent(next.step.end);`
Scenario: the pupil begins the boss, opens the map in a second tab and presses Start on a lesson (a `start` replaces the open boss, `src/flow/session.ts:12-18`), returns and finishes the boss. The page posts `{phase:"end", mode:"lesson", topic:X}`; `replay.ts:79-83` runs `afterLesson`, so topic X reaches rung 1 with a `nextDue` in 3 days without the lesson being done, and the line stays in the log for good.
Fix: `if (next?.step.kind === "continue" && next.step.mode === "boss")`, matching line 347; add a DOM test where the fake returns a lesson `continue` at finish and assert no `end` is posted.

**F2** `app/map.html:14` — the aim text says every bar fills on a cold re-test; the first bar fills on a lesson end.
`A bar fills when you pass a cold re-test.`
`afterLesson` (`replay.ts:79-83`) and a red intake row (`replay.ts:129-131`) fill the `learning` bar; the Level 4 run itself observed `learning · re-test in 3 days` straight after Done. Pupil-facing text that misstates the mechanic.
Fix: "The first bar fills when you finish a lesson. The rest fill when you pass a cold re-test." Keep sentence case; `retest.test.ts:182-184` scans this file.

**F3** `src/marking/retest-dom.test.ts:177` — the D5 invariant (working enters the DOM only inside the check handler) is asserted as visibility, not absence.
`for (const w of $$("#boss .working:not(.faded)")) expect(w.hidden).toBe(true);`
Revert to the plan's original Task 11 step 4 (a hidden `div.working` holding `item.working` at build) and this file still passes with the answer text in the page source before the pupil commits.
Fix: in the begin test, for each slot take `itemOf(slot).working` and `expect(html).not.toContain(working)`; in the answer test assert the same string is present after check.

### Low

**F4** `app/map.js:242-245` — `dayQuery` is the only function deciding what from the URL reaches `/api/next`, and no test calls it (the unit test passes `query` by hand; the DOM fake matches `/api/next` exactly, `map-dom.test.ts:53`). It also accepts `2026-13-45`, which `dayRoute` answers 400 (`src/server.ts:130-131`), so the page reads "The map did not load" against a running server. Dev affordance only. Fix: register the DOM test with `?day=2026-10-10` once and assert the forwarded query, plus a malformed case.

**F5** `app/retest.js:299, 312` — the boss `start` is posted before `buildItems` runs, so an unbuildable boss leaves an open session behind with Begin disabled and `TEXT.noQuestions` shown; the map then reads "Boss open" until Done. Plan Task 11 step 3 specifies this order, so plan-as-written, and today every topic has a generator and all 105 items carry `answers` (observed by scanning `content/maths/items/*.json`). Fix when convenient: build first, post `start` only when `built.length > 0`; `TEXT.intro` at `:335` counts slots, not buildable questions.

**F6** `app/map.js:254-270` — with the server down all four fetches reject and `load` returns without awaiting `lessons`, so whichever rejection lands last writes `#status`; the empty page can read "The lessons did not load" instead of "The map did not load". Fix: return a sentinel from the lessons catch and write the message after the awaited state succeeds.

**F7** `app/map.js:186` — each failed click appends another `p.note`, so three retries with the tutor closed show three "Not saved" lines. Fix: reuse `holder.querySelector(".note")` and set `textContent`.

**F8** `src/marking/map.test.ts:151` — the emoji scan `/[\u{2C00}-\u{10FFFF}]/u` misses Dingbats (U+2700–27BF) and Misc Symbols (U+2600–26FF), so a string holding ✨ or ⚡ passes the register test. Same threshold as the plan; still a test that passes with the bug present. Fix: add `\u{2600}-\u{27BF}`.

**F9** `src/marking/map-dom.test.ts:89-91` — `"1 of 21"` is hardcoded where line 75 uses `pack.topics.length`; a 22nd topic fails this test for the wrong reason. Fix: template the length.

**F10** `src/content/pack.ts:16-23` — `lessonFile` reads every lesson file per topic, so `lessonUrls` does 21 readdirs and up to 441 reads for a 21-entry map (cached per root, so harmless for the route), and `open_lesson` (`src/mcp/tools.ts:143`) calls it uncached on every tool call. Pre-existing shape, now the shared helper; the plan's Task 2 GOTCHA measured 7.2 ms. Fix when convenient: a one-pass `Map<itemsFile, lessonFile>` both callers share.

**F11** `src/server.test.ts:532-588` — the loop test mixes the real day (`next()` for the `continue`, per D1/D12) with `?day=` derived from event `t`; a run that crosses London midnight between step 1 and step 5 fails. The only test in the file with this dependency. Fix: note it in the test comment, or pin `?day=${localDay(firstEvent.t)}` on every `next()` that expects `continue`.

### Constraint pass

Plan GOTCHAs grepped (`do not modify|read-only|no changes to|frozen`); the binding constraints are `tools.test.ts` untouched (holds), the `data-items` marker byte-identical (holds), no subject parameter on the route (holds), biome warning count 4 (holds), and the four DOM ids per page (F1 to F3 touch none). No proposed fix breaks an acceptance criterion.

## Numbers pass

Every figure in the PR body re-derived in the worktree at `de6fffc`, 2026-09-28 (`observed` unless marked):

| claim | re-derived |
|---|---|
| 2,778 insertions, 29 deletions, 24 files | `git diff --numstat origin/main..HEAD` → 2778 29 24 |
| code 844 · tests 1,029 · `.claude/` 888 · `bun.lock` 17 | 844 · 1029 · 888 · 17, same partition |
| `wc -l` 304 / 401 / 34 / 30 / 22 / 37 | matches |
| biome 0 errors, 4 warnings | `Found 4 warnings.` |
| complexity lint 0 diagnostics on the four files | 0 |
| 328 pass, 63,963 expect() calls, 33 files | 328 pass, 0 fail, 63,963, 33 files (`bun run check`, 9.88 s) |
| `main` 301 pass, so +27 | 301 from PR #33 body; 328 − 301 = 27 (`derived`) |
| 6,300 generator runs | `all 6300 runs pass` |
| `/api/lessons` has 21 keys | 21 topics, 21 lesson files; `lessons.test.ts` asserts one URL per topic |

Not re-observed: the Level 4 manual steps (`agent-browser`); taken as reported. The loop test in `server.test.ts` covers the same lesson → boss → retest → rung 2 path mechanically. `last-gate.json` records head and exit 0 but no counts, as the PR body says; the counts come from the run itself and match mine.

## Validation

| check | result |
|---|---|
| `bun run check` (quiet machine) | exit 0: tsc clean, biome 4 warnings, 328 pass, 0 fail (`observed`) |
| `bun run check` (first run, three reviewer agents running alongside) | 326 pass, 2 fail: `src/flow/properties.test.ts` "properties hold over seeded histories 1 to 50" and "51 to 100" timed out at 5,000 ms (15.4 s and 8.6 s). The file is untouched by this PR and passes alone in 6.4 s. Pre-existing headroom issue, not a finding against #36; worth a `timeout` on those two tests in a later ticket. |
| `bun scripts/test-generators.ts` | all 6300 runs pass (`observed`) |
| `gh pr checks 36` | SonarCloud pass; draft by policy, no CI flips it |

## What is good

- Verbatim `start`/`end` posting throughout, asserted by identity in `map.test.ts:62,78`; the map's Done is the sole lesson `end` poster.
- `retest.js` calls `quiz.mark`/`quiz.norm`/`quiz.lcg`/`quiz.itemFromGenerated` rather than copying them; `passed` uses the per-topic count and is parity-tested for `of` 1 to 9.
- The working is appended inside the check handler (D5), stricter than the plan.
- `readRoute` reuse gives `/api/lessons` the origin check and 500 shape of the other GETs in four lines; the key-leak test walks `apiRoutes` so the new route is covered without being named.
- happy-dom registration is per file and `unregister` restores Bun's own `fetch` descriptor (verified with a scratch script); `document` does not reach `server.test.ts`.
- The loop test asserts absence (`not.toContain('"answers"')`, no title) on the boss payload, the property a reviewer most wants pinned.
- No `innerHTML` with content or pupil text on either page; both string tables and both HTML files pass the register scan.
