# Implementation Report — short items get an attempt code cannot mark (`attempt@2`, `correct: null`)

**Plan**: `.claude/plans/issue-49-short-attempt.md`   **Branch**: `feature/issue-49-short-attempt` (worktree `~/Desktop/study-tutor-issue49`)   **Status**: COMPLETE

## Summary
`attempt@2` allows `correct: null` (answered, not marked in code). Replay counts a null attempt as work and skips it for calibration and `confidentWrong`, through one `attempt()` helper shared with v1. The lesson quiz renders an item with no `answers` and a `mark_scheme` as a text box with Sure / Not sure; saving posts `attempt@2` once, and only then shows the link to the tutor. `GET /api/chat` returns the item `type`, and the chat's teach-back label reads "Explain your answer, one point per line." for written-answer types.

## Tasks completed
- Task 1 → `src/events/types.ts` (UPDATE): `AttemptV2`, `Event` union, `FIELDS["attempt@2"]`, `KEYS["attempt@2"]`
- Task 2 → `src/events/__fixtures__/attempt.v2.jsonl` (CREATE)
- Task 3 → `src/events/replay.ts` (UPDATE): `attempt(s, e)` helper with the `null` early return; both CASES keys point at it
- Task 4 → `src/events/types.test.ts`, `replay.test.ts`, `append.test.ts` (UPDATE)
- Task 5 → `src/api/event.test.ts` (UPDATE)
- Task 6 → `src/jobs/view.test.ts` (UPDATE)
- Task 7 → `src/api/chat.test.ts` (UPDATE)
- Task 8 → `app/quiz.js` (UPDATE): `postAttempt(..., v = 1)`, `buildOpen`, open-item loop in `initQuiz`
- Task 8b → `src/api/chat.ts` (UPDATE): `type: view.type` in the `getChat` body
- Task 8c → `app/chat.js` (UPDATE): `WRITTEN` and the label swap in `show()`
- Task 9 → `src/marking/quiz-dom.test.ts` (CREATE)
- Task 9b → `src/marking/chat-dom.test.ts` (CREATE)
- Task 10 → `.claude/references/events.md` (UPDATE): `attempt@2` under "Event line", the quiz DOM test under "Tests"
- Unplanned → `src/events/append.ts` (UPDATE), see Deviations D1

## Tests added
- `types.test.ts`: `attempt@2 shapes` table (v2 null parses, v2 false parses, v2 `"null"` refused, v2 missing `correct` refused, v1 null refused); "an unknown version" moved to `v:3`.
- `append.test.ts`: `correct: null` kept, stray `bogus` dropped, parsed back as `null`.
- `replay.test.ts`: "a null attempt counts the day and nothing else" and "a boolean v2 replays as v1" (split, as the plan asks); the `bad` line moved to `v:3`. The fixture tests over `EVENT_KEYS` pick up `attempt@2`.
- `event.test.ts`: v2 null → 201 and a 10 XP `attempt` line.
- `view.test.ts`: `hasAttempt` on a v2 line, seed 5 matches and seed 6 does not.
- `chat.test.ts`: the science short item end to end (409 before the attempt with no provider call; `guess_first` request body free of mark-scheme and working text; v2 post 201; `teachback_mark` 2/2 saved, its request body holds the mark-scheme text; log ends `teachback`, `xp`). Existing `getChat` test asserts `type: "cloze"`.
- `quiz-dom.test.ts`: 5 cases as planned. `chat-dom.test.ts`: 2 cases as planned.

**Mutation runs (observed, this session):**
- Task 4: `if (e.correct === null) return;` removed → `-t "attempt@2"` ran 3 tests, 1 fail (the null test); the boolean-v2 test and the `attempt@2` fixture test passed. Restored.
- Task 7: `FIELDS["attempt@2"]` narrowed to `bool(o.correct)` → the chat test failed at the v2 `postEvent`: expected 201, received 400. Restored.
- Task 9: `marked.hidden = false` moved before the post → "a lost post says not saved…" failed (4 pass, 1 fail). Restored.
- Task 9b: `WRITTEN = []` → the written-answer case failed, the cloze case passed. Restored.

## Validation results
- `bunx tsc --noEmit`: clean (observed).
- `bun run check` (tsc + biome + bun test): exit 0, 748 pass, 0 fail across 72 files (observed).
- `bun scripts/test-generators.ts`: all 6300 runs pass (observed).
- After the PR #54 round-1 fixes (2026-09-30): `bun run check` exit 0, 755 pass, 0 fail across 72 files (observed). Detail in `.claude/reports/pr-54-review-fixes.md`.

## Deviations from the plan
- **D1 `src/events/append.ts` changed (not in the plan).** With two `attempt` versions, `` KEYS[`${event.type}@${event.v}`] `` became a cross product of every type and every `v` (e.g. `case@2`), and `tsc` failed with TS2551. The lookup now reads through `KEYS as Record<string, readonly string[] | undefined>`. Behaviour is unchanged: the result was already cast to `readonly string[] | undefined` and the `?? []` fallback stays.
- **D2 Level 4 partly run, headless.** `bun run dev` opens a browser on the user's machine, so the server ran as `bun src/server.ts --mcp` (the same HTTP routes, no browser) with no `data/` folder, and the steps went over `curl` (observed, 2026-09-30):
  - the science lesson page: 200;
  - `POST /api/event` with the v2 `correct: null` body: 201; the same body at `v:1`: 400 "Refused: not a valid attempt v1 event";
  - the log tail: the `attempt` line with `"v":2,"correct":null`, then `xp` 10 `attempt`;
  - `GET /api/state`: `calibration {}`, `confidentWrong {}`, flame `2026-W40: ["2026-09-30"]`;
  - `GET /api/chat?item=8464%2F4.1.1.2%236`: `type: "short"`, `attempted: true`, no answer field.
  The `data/` folder was removed afterwards. The browser steps (typing into the box, clicking the link, the chat label on screen) were not run by hand; `quiz-dom.test.ts` and `chat-dom.test.ts` cover them under happy-dom.
- **D3 Radios duplicated, not shared.** The open-item loop builds its own Sure / Not sure span with the same `name` scheme instead of extracting a helper out of the markable loop. This keeps the existing loop untouched; the duplication is 6 lines.
- **D4 Prose gate run, no change.** `no-ai-slop` (detect) then `humanizer` (review) ran on the four new strings: "Save my answer", "Get it marked by the tutor", "Saved. This page cannot mark a written answer. Open the tutor and explain your answer there, one point per line, to get it marked." and "Explain your answer, one point per line." Neither found a pattern. The final wording is the plan's.
- UX states: open item — empty (no text: prompt), no confidence (prompt), error (not saved: message, retry enabled, link hidden), saved (done, disabled, link shown). No loading state was planned; the button is disabled while the post is in flight. All built.

## Issues encountered
- Readers of raw `attempt` lines outside replay were checked for `null` handling (grep over `src/**/*.ts` and `app/*.js`, observed). `src/flow/coach.ts:28,37`, `src/mcp/tools.ts:58`, `src/jobs/view.ts:24` and `src/flow/examiner.ts:15` read only `type`, `item` or `topic`, never `correct`. The detective case and the digest read derived state. So no site outside replay counts a null attempt as wrong.
- The DOM test for `quiz.js` uses the `?dom` query; `squad-dom.test.ts` imports `quiz.js` with no query, so the two module instances do not collide (observed: full suite green).
