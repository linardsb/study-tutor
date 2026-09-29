# Implementation Report — T12 O2 Coach the noob: Dan's scripted wrong step

**Plan**: `.claude/plans/t12-coach-dan.md`   **Branch**: `feature/t12-coach-dan` (worktree `~/Desktop/study-tutor-t12`)   **Status**: COMPLETE

## Summary

Dan, an AI classmate, tries a fresh-number question on a topic the pupil has attempted and lands on one wrong answer chosen in code from the item's misconception bank. A new pre-attempt job `dan_wrong_step` voices the step and refuses any reply that does not reach that wrong answer (R8). The pupil's correction is marked on the server, written as an ordinary `attempt` plus a new `coach@1` event, and Dan's rank in state rises with the catches. With no model the line is built from the bank. Page `app/coach.html`, routes `GET`/`POST /api/coach`.

## The guard, restated

- The job's input is `{ view: PreAttempt; topic; wrong: Misconception }`. `PreAttempt` is minted only by `jobItem` when no attempt exists, so `answers`, `working` and `mark_scheme` cannot reach the prompt by construction. `wrong.answer` and `wrong.message` are the only answer-side strings the prompt carries (sentinel test, `dan_wrong_step.test.ts`).
- `step: "dan"` is 409 once an `attempt` for the item and seed exists. `step: "correct"` marks with the full item, appends the `attempt`, then the `coach` line, and only then returns `working` and the note. The `GET` and the `dan` reply carry the question side only (`ANSWER_KEYS` asserted in `api/coach.test.ts`).
- The correct answer is not a guard source, so a reply that computes it is refused unless the number already appears in the question. Observed with Ollama (Level 4 step 8): a reply that computed the right answer 30 was refused as `shape`.

## Tasks completed

- Task 1 voice argument → `src/jobs/define.ts`, `define.test.ts` (UPDATE)
- Task 2, 2b `coach@1`, `MCP_WRITABLE` row → `src/events/types.ts`, `src/mcp/tools.ts` (UPDATE)
- Task 3 reducer, `State.coach`, shape 4 → `src/events/replay.ts` (UPDATE)
- Task 4 fixture and replay tests → `src/events/__fixtures__/coach.v1.jsonl` (CREATE), `replay.test.ts` (UPDATE)
- Task 5, 6 the job → `src/jobs/dan_wrong_step.ts`, `dan_wrong_step.test.ts` (CREATE)
- Task 7a, 7, 9 rank and flow → `src/flow/rank.ts`, `src/flow/coach.ts`, `coach.test.ts` (CREATE)
- Task 8 marker → `src/marking/answer.ts`, `answer.test.ts` (CREATE)
- Task 10 route → `src/api/coach.ts`, `coach.test.ts` (CREATE); `resolveItem`, `titleOf` exported from `src/api/chat.ts` (UPDATE)
- Task 11 `postJobRoute`, `/api/coach` → `src/server.ts` (UPDATE)
- Task 12 POST allowlist → `src/marking/retest.test.ts` (UPDATE)
- Task 13 Dan branch → `scripts/fake-provider.ts` (UPDATE)
- Task 14 two end-to-end tests → `src/server.test.ts` (UPDATE)
- Task 15, 15b page and helper tests → `app/coach.html`, `app/coach.js`, `src/marking/coach.test.ts` (CREATE)
- Task 16 links → `app/chat.js`, `app/index.html` (UPDATE)
- Task 17 docs → `.claude/references/events.md`, `model-jobs.md` (UPDATE)
- Task 18, 19 gate and greps green; `origin/main` unchanged since `ab1ddd9`, no rebase needed (observed `git log HEAD..origin/main` empty)

## Tests added

| File | Cases | Result |
|---|---|---|
| `src/jobs/dan_wrong_step.test.ts` | valid; R8 different answer → `shape`, 2 calls; not-json twice; down; no model; 4 lines / empty / 161 chars; note echoed; invented number → `guard`; sentinel prompt; `reaches` | 10 pass |
| `src/flow/coach.test.ts` | R8 property over 105 items and 1,050 rolls; `pickItem` roll / file / null / stable; `triedTopics`; `danStep` refusals, skip, fallback, model; `correction` bodies round-trip through `appendEvent`; `rankFor`/`rank` | 7 pass |
| `src/events/replay.test.ts` | shape 4, `coach` initial; 7 caught + 2 missed + 1 unreadable → `{9, 7, 2}`, `skipped: 1`; `"message"` never in state | 3 cases |
| `src/marking/answer.test.ts` | 12 rows agree with `quiz.mark`; no `answers` → never right | 2 pass |
| `src/api/coach.test.ts` | 12-row 400 table; 404; 409 both steps; GET list/not-ready/ready with no answer key, stable per day and count; `dan` fallback with no key; no-bank 404; `correct` writes attempt, xp 10, coach in order and returns working and note; second `correct` 409; rank moves; mid-job second-tab append → `dan` 200 and writes nothing, `correct` 409 | 8 pass |
| `src/server.test.ts` | coach end to end through the real provider module and the fake (`by: "model"`, types `attempt, usage, attempt, xp, coach`); no model → fallback, no `usage` | 2 pass |
| `src/marking/coach.test.ts` | `rankLine` bottom/middle/top; `resultLines` three shapes; every page string passes `guardReply` | 3 pass |
| `src/marking/retest.test.ts` | allowlist gains `coach`; `coach.js` scanned | existing test |

## Validation results

- `bun run check` (tsc, Biome, `bun test`): green, exit 0 (observed). 466 tests pass, 0 fail, 49 files.
- Structural greps (Task 18, observed): no `innerHTML` in `app/coach.js` (the one match is the comment explaining `DOMParser`); `answers|working|mark_scheme` in `dan_wrong_step.ts` only in comments and the persona string; `replay.ts` imports `../flow/rank`, never `flow/coach`.
- Level 4 (observed, 2026-09-29, `bun src/server.ts` from the worktree on port 4731 with a fresh `data/`, curl and `agent-browser`):
  1. Home shows "Coach Dan". List page: "Try a question on a topic first. Then Dan can have a go." and "Dan is Noob, rank 1 of 5. 3 more catches to the next rank."
  2. After an attempt on `#1`, the topic "Percentage of an amount" is listed.
  3. Topic page: fresh stem "Find 12% of 40." (bank `4, 52, 3.333`), `Dan: I get 52.` by fallback, "No model is set up…" shown, the AI note at the top. Log still 2 lines (attempt, xp).
  4. Right answer 4.8 → `caught: true`, note, working, "2 more catches"; log gained `attempt` (seed set), `xp` 10, `coach` `caught: true`; `/api/state` `coach: {shown: 1, caught: 1, rank: 0}`, `shape: 4`.
  5. Another question, Dan's own wrong answer 185 → `caught: false`, `named` is its note, rank unchanged, `confidentWrong` holds the `#gen` item with seed.
  6. Two GETs before answering: same stem and seed.
  7. Two POSTs for the same seed: A 200, B 409 "You have answered this one. Ask for another."; 3 lines added, 2 lines carry that seed.
  8. Ollama `qwen2.5vl:3b` on 5 questions: 0 of 5 `by: "model"`; refusals 3 × `not-json`, 7 × `shape`; 10 `usage` lines. Raw replies (scratch replay): the model computes the right answer, paraphrases the note, or returns malformed JSON. It never lands on the given wrong number. The fallback line showed each time. Plan Q8 stands.
  9. `?day=2026-10-06` gives a different seed, no `answers` key, nothing appended. `step: "solve"` → 400.
  10. Slow provider (`--mode not-json --delay 70000`, custom preset): the `dan` POST answered after 140 s (derived: 2 × 70 s) with 200 and the fallback line `I get 40.`; the server log shows `not-json` twice. Not cut by the idle limit.
  - Browser (`agent-browser`): the page shows the AI note, stem, Dan's line, the form with Sure/Not sure, the result with note and working, the rank line, then "Another question" which loads a new stem. Screenshots in the session scratchpad.

## Deviations from the plan

- **"Another question" is a `<button type="button">`, not a link.** Biome `useValidAnchor` refuses `href="#"` and the gate must be green. Same behaviour (`location.reload()`).
- **A not-ready topic page hides "Another question" and shows only "All topics".** A reload on a "try first" page would only repeat the message. Two lines added to the plan's design.
- **A 409 on the page reloads after 1.5 s, not at once**, so the pupil can read "You have answered this one" before the next question replaces it.
- **`saved: false` from a failed second append is not tested**, as the plan's Task 10 says: nothing can make `events.jsonl` unwritable between two synchronous appends in one call. The branch mirrors `chat.ts` and is read-reviewed.
- **`src/mcp/tools.test.ts` was not edited.** The plan said to add `coach` wherever `case` appears in a pinned list; the file pins no such list (observed, `grep case` empty).
- **Job test 6 runs the three shape cases in one test through a shared helper**, not three `mockFetch` runs; the plan allowed either.
- UX states, all built: loading ("Loading the question.", "Dan is working on it…"), empty list, not-ready reasons, 409 with reload, other errors as text, offline ("Check the tutor window is still open") on load, `dan` and `correct`, and "Not saved." when `saved` is false.

## Issues encountered

- Phase A (Tasks 1 to 4, 7a) was already in the worktree uncommitted when this session started, from the planning session; verified with `tsc` and `bun test src/events src/mcp` before continuing.
- The Bash pre-tool hook blocks any command text containing the `process.env` substring and `rm -rf`; the server was started in the background with an empty `PATH` so `openBrowser` found no `open`, and `data/` was fresh because none existed.
- The `EISDIR` and "Could not save the XP line" lines in the test output are existing tests' own deliberate failures, not new.
- Level 4 step 10's first run answered `network` after 54 s: the fake provider, started with a bare `&` inside a helper script, was killed by a SIGTERM to the launching shell's process group. Started again in its own `nohup` subshell it survived and the 140 s figure above is from that run.
