# Implementation Report — T9 model jobs: defineJob, guess_first, hint, teachback_mark, chat panel, reply guard

**Plan**: `.claude/plans/t9-model-jobs.md`   **Branch**: `feature/t9-model-jobs` (worktree `~/Desktop/study-tutor-t9`)   **Status**: COMPLETE

## Summary
`defineJob` in `src/jobs/define.ts` wraps T8's `chatJson` into a job. Each job has a prompt, validates its output in code, runs the reply guard, gets one retry, then falls back deterministically. Three jobs sit on it: `hint` and `guess_first` take the branded `PreAttempt` view, and `teachback_mark` takes `PostAttempt`. Both brands are minted only in `src/jobs/view.ts`, and `PostAttempt` only once an attempt event exists (id and seed for a `#gen` item). `src/flow/chat.ts` holds the call points and the one-teach-back-per-day rule. `/api/chat` (GET, POST) serves `app/chat.html`, which every quiz item links to.

## The guard, restated
For any item with `answers`, the answer enters a model prompt only after an `attempt` event for that item exists.
1. `hint` and `guess_first` take `PreAttempt`. Only `jobItem()` in `src/jobs/view.ts` makes one, and it does so with `toItemView`, which strips `answers`, `working`, `mark_scheme` and `misconceptions` at runtime.
2. `teachback_mark` takes `PostAttempt`. `jobItem()` mints it only when `hasAttempt(lines, item)` is true. A `#gen` item needs the id and the seed to match.
3. The prompt functions read `stem`, `scaffold`, `hint` and the topic title by name. Nothing in `src/jobs` spreads or `JSON.stringify`s an item (grep, observed).
4. The pre-attempt system message carries `PRE_ATTEMPT_GUARD`. `postAttemptSystem` is a separate function without it.
5. `hint.test.ts` and `guess_first.test.ts` run `sentinelItem()` through the pre-attempt path and assert that none of the five `SENTINEL-*` strings appears in the serialised request body.
`view.test.ts` holds a `@ts-expect-error` that assigns a raw `Item` to `PreAttempt`. Observed: with the brand removed, `tsc` fails with TS2578 (unused directive), so the test can fail.

## Tasks completed
- Task 1-2 → `src/jobs/view.ts`, `src/jobs/view.test.ts` (CREATE)
- Task 3 → `src/jobs/guard.ts`, `src/jobs/guard.test.ts` (CREATE)
- Task 4 → `src/jobs/__fixtures__/provider.ts` (CREATE)
- Task 5-6 → `src/jobs/define.ts`, `src/jobs/define.test.ts` (CREATE)
- Task 7 → `src/jobs/hint.ts`, `src/jobs/hint.test.ts` (CREATE)
- Task 8 → `src/jobs/guess_first.ts`, `src/jobs/guess_first.test.ts` (CREATE)
- Task 9 → `src/jobs/teachback_mark.ts`, `src/jobs/teachback_mark.test.ts` (CREATE)
- Task 10-11 → `src/flow/chat.ts`, `src/flow/chat.test.ts` (CREATE)
- Task 12 → `src/api/chat.ts`, `src/api/chat.test.ts` (CREATE); `src/server.ts`, `src/server.test.ts` (UPDATE)
- Task 12b → `scripts/fake-provider.ts` (CREATE)
- Task 13 → `app/quiz.js`, `src/marking/quiz.test.ts` (UPDATE)
- Task 14 → `app/chat.html`, `app/chat.js` (CREATE); static-note test in `src/server.test.ts`
- Task 15 → `.claude/references/model-jobs.md`, `docs/prd/study-tutor-v2.architecture.md` (UPDATE)
- Task 16 → gate and greps (below)

## Tests added
- `view.test.ts` (5): `hasAttempt` exact id, other id, `#gen` seed match and mismatch, no seed; `jobItem` before and after; the brand check.
- `guard.test.ts` (3): each reason fires (emoji ×2, exclamation, grade ×3, invented-number). The 16 clean samples pass, and `numbersIn` normalises.
- `define.test.ts` (15): the 12-row retry table (calls and `usage` lines per row); refusal logged by reason, never by text; shadow judge (would_block logged, verdict kept, throw ignored, not called on fallback); guard line pre and not post.
- `hint.test.ts` (6), `guess_first.test.ts` (5), `teachback_mark.test.ts` (9): valid, invalid JSON twice, provider down, preset none, the sentinel leak or the post-attempt prompt. Also hint's invented-number retry, teach-back's 4-for-3 count, `mark` values 2 / true / "1", and a note that brings in a number (`"The goal is 9."`). A ninth case uses an item with no `mark_scheme` and the real working, which is the case for every maths item today. It asserts the working reaches the prompt as the mark scheme, and that a note taking the working's answer (9) is refused.
- `flow/chat.test.ts` (8): `CALL_POINT` keys; `findItem`; both refusals with 0 fetches; `#gen` seed 5 vs 6; no-key fallbacks for `preset: none` and no `config.json` (0 fetches, 0 usage); verdict record replays through `parseEvent`; blank lines dropped and 8-line cap; `taught-today` on the same day, a run on the next day, and the 23:30Z BST edge.
- `api/chat.test.ts` (6): 12 malformed bodies → 400 with 0 fetches and an empty log; 404; 409 for attempt-first, already-attempted and taught-today (with its message); GET keys never include answer-side fields, before or after an attempt; teach-back verdict writes `teachback@1` + `xp@1` 15 and never the key; no-model teach-back writes nothing; two teach-backs in flight for one item (`Promise.all`) save one `teachback` and one teach-back `xp` line, the other reply `saved: false`.
- `server.test.ts` (+3): HTTP `hint` with no model → the lesson's hint; end to end through the real route, the real provider module and `scripts/fake-provider.ts` (`usage`, `teachback`, `xp` 15, then a model hint on item #2); `chat.html` static-note position and `position: sticky`.
- `quiz.test.ts` (+2): `chatHref` round-trips an id with `#` and a seed; browser vs server generated-item parity, 21 topics × 3 seeds = 63 comparisons (derived), 0 differences.

## Validation results
- `bun run check` (tsc + biome + bun test): exit 0, 363 pass, 0 fail (observed, final run before the PR #38 review). After the rebase onto 723fd13 and the round-1 fixes: exit 0, 395 pass, 0 fail (observed; `.claude/reports/pr-38-review-fixes.md`). An earlier run had 3 `properties.test.ts` 5 s timeouts while the machine's load average was 230 (other sessions). A plain `bun test` straight after passed 361/361 in 10.7 s, and the next `bun run check` passed. The same 5 s timeout fired once more at load average 113, and the gate run straight after was green.
- `bun scripts/test-generators.ts`: all 6,300 runs pass (observed).
- `grep -rn "as PreAttempt\|as PostAttempt" src | grep -v test` → only `src/jobs/view.ts:38-39` (observed).
- `grep -rn "JSON.stringify(.*item\|\.\.\.view\|\.\.\.item" src/jobs` (non-test) → no hit (observed).
- `grep -n fetch src/flow/chat.ts` → no output (observed).
- No live network in tests: the full `bun run check` log holds no `Model call failed` line, and the run took 10.5 s with no 120 s stall (observed). Wi-Fi was not switched off, so this rests on the log and the timing.
- `bunx biome check app`: 4 warnings, all pre-existing in `app/style.css` (`noDescendingSpecificity`). The same 4 appear with this branch's `app` changes stashed (observed).

### Level 4 (server on port 4799 with a scratch data dir, driven with agent-browser)
1. Observed. Lesson 0001 Q1 shows "Ask the tutor" linking to `/chat.html?item=1MA1%2FR9%2Fof-an-amount%231`. Clicking it opened a second tab at that URL, and the page showed the stem.
2. Observed. At an 800×500 viewport with 10 log entries, scrolled to `scrollY` 760, the note sat at top 0 (screenshot in the session scratchpad).
3. Observed. Hint → "20% is two lots of 10%." Guess → `FALLBACK_GUESS`. The "No model is set up" line was shown.
4. Observed. After answering Q1 in the lesson (attempt + xp written), the chat reload showed `#after` and hid `#before`. Two teach-back lines gave "No marks this time" plus the working. `events.jsonl` had 0 `teachback` lines.
5. Observed with Ollama `qwen2.5vl:3b`. The Q2 attempt was posted to `/api/event` with the same body quiz.js sends, not clicked. The Q2 teach-back returned marks per line (2 of 3), and `events.jsonl` gained `usage`, `teachback` (2 of 3) and `xp` 15. The model marked a correct line ("5% is half of 6, which is 3") 0, which is the Q8 quality issue; the working was shown beside it. `<b>bold</b>` as a guess echoed as literal text (0 `<b>` elements in `#log`). That guess's model reply was refused by the guard twice (`Model reply refused (guess_first): guard` ×2) and fell back. Five hints on five unattempted items (`of-an-amount#4`, `#5`, `R4#1`, `R5#1`, `P8#1`) came back 5 of 5 `by: "model"` with 0 refusals. The planning run had 3 of 6 rejected. `chat.js` sets `innerHTML` only for the figure (grep, observed).
6. Observed. Practice → Tick all → Mixed 6. The first item's link was `/chat.html?item=1MA1%2FR4%23gen&seed=1042413575`, and the chat stem "Simplify the ratio 3 m : 75 cm." matches the practice stem.
7. Observed. `POST {"job":"solve"}` → 400. `GET ?item=…%231` → JSON with keys `item, topic, title, stem, scaffold, attempted, model`, and no `answers`.
8. Observed, and it contradicts the plan's expectation. `scripts/fake-provider.ts --mode not-json --delay 70000` was set as the "Other OpenAI-compatible" provider, and a teach-back was sent on an attempted item.
   - With `server.timeout(req, 0)`: the page showed "No marks this time" plus the working after 145 s (derived expectation: 2 tries × 70 s = 140 s).
   - With the line commented out and the server restarted: the page again showed "No marks this time" after 145 s, not "Not sent". Repeated with curl: HTTP 200 after 140 s.
   So on Bun 1.3.4 at the default `idleTimeout`, a 140 s `routes` request was not cut. The planning spike saw a cut only with an explicit `idleTimeout: 1`. The line is restored and kept: it costs nothing, and it keeps the teach-back safe if an idle limit is set later or Bun enforces the documented 120 s default. The code comment in `postChatRoute` now states what was observed. Whether the cut appears anywhere between 145 s and the 240 s worst case was not tested.

## Deviations from the plan
- **Pre-PR review fixes** (two read-only subagent reviews of the branch diff):
  - The teach-back tests now cover the `mark_scheme ?? working` path.
  - The "note takes a number from the scheme" test can now fail. Before, its scheme held no digits.
  - The taught-today 409 is asserted at the API.
  - `chat.js` no longer shows a job name on an unknown reply kind.
  - `findItem` refuses a seed above 4294967295. quiz.js makes 32-bit seeds and `lcg` reduces with `>>> 0`, so seed 5 and seed 2^32 + 5 were the same question under different ids.
- **Second `taught-today` check before the write** (`src/api/chat.ts`, found in the pre-completion review). The plan checks only before the job runs, and against the log read at the start of the request. Two requests for one item (a reload while "Thinking…" shows, or a second tab) both passed that check and both saved, which is two `teachback` lines and 30 XP (observed: the new concurrency test failed before the fix). `postChat` now re-reads the log and calls `taughtOn` (exported from `src/flow/chat.ts`) just before `postEvent`. On a hit it returns the marks with `saved: false` and writes nothing. No `await` sits between that read and the append, so the check and the write cannot interleave in one process. The pre-job check stays, so the usual repeat still spends no tokens.
- **D1-D3** (as planned): the call points are in `src/flow/chat.ts`, not `session.ts`; `src/api/chat.ts` + two routes; one link per quiz item.
- **Export names**: `guess_first.ts` exports `guessFirst` and `teachback_mark.ts` exports `teachbackMark` (camelCase identifiers; the plan named only `hint`). The job `name` strings stay `guess_first` and `teachback_mark`.
- **`textReply`** (in `define.ts`): one shared `{ text }` validator for hint (≤300) and guess_first (≤400). The plan wrote the check inline per job.
- **Fixture extras**: `KEY`, `NOW`, `SENTINELS`, `down` and the `Reply` type are exported from `src/jobs/__fixtures__/provider.ts`, and the `mockFetch` replies are functions that repeat the last one. The plan's list named the helpers but not these constants.
- **Empty hint working**: the API requires `text` of 1-2000 characters, so the page sends "No working yet." when the pupil presses Hint with an empty box. The model then sees "The pupil's working so far: No working yet."
- **`chat.html` guess label**: after the prose gate it reads "How would you do this one? A rough guess is fine." (the draft had "Before you try it: how would you do it?").
- **`getChat` seed parsing**: a non-digit `seed` query stays a string, so the shared `resolveItem` refuses it with 400. The plan said "a non-negative integer" without naming the query parse.
- **Server handler typing**: the POST route's second argument is typed structurally, `{ timeout(req, seconds) }` (`IdleControl`), not Bun's full `Server` generic.
- **Idle timeout on the fake provider**: `scripts/fake-provider.ts` sets `idleTimeout: 0` itself, so a 70 s delay never trips its own socket cut.

## Issues encountered
- **From the pre-PR correctness review, confirmed there by running it, not fixed here:**
  - **R1, a bypass through old code.** `/api/event` accepts a posted `teachback` event, and `postEvent` gives it 15 XP. So a hand-made POST gets around the once-a-day rule and the model altogether. Closing it means refusing a posted `teachback` in `refusal()` (`src/api/event.ts`), with `postChat` taking another route to the append. That is a change to T4's route, so it belongs in its own ticket.
  - **R2, correct hints refused.** The invented-number rule refuses hints such as "Divide by 100 first." and treats ".5" as 5. On percentage and unit topics, model hints will often fall back to the lesson's hint. Whether to allow 10, 100 and 1000 is a plan decision, not made here.
  - **R3, the pupil's numbers count as sources.** A pupil who writes "is it 12?" lets the model say "12 is right" before any attempt. The answer is still never in the prompt. The plan chose this, so it is recorded, not changed.
- **Idle-timeout GOTCHA not reproduced** (Level 4 step 8): the plan's 120 s cut did not happen at Bun's default. The fix stays, as defence; see step 8.
- **`taught-today` on generated items** (not fixed, needs an event version): `TeachbackV1` has no `seed`, and every generated item of a topic has the id `${topic}#gen`. One teach-back verdict on any generated item therefore blocks teach-back on every generated item of that topic for the rest of that London day, and the 409 message says "this one". A fix is `teachback@2` with `seed` plus a reducer case, which is out of T9's scope.
- **Prose gate**: `no-ai-slop` (detect, then edit) and then `humanizer` ran over every new pupil-facing and prompt string: the fallbacks, the 409s, the page copy and the system and task lines. One edit came out of it (the guess label above). Humanizer found nothing further.
- **Load flakes**: see Validation. `properties.test.ts` has a 5 s timeout that a machine load average of 230 can exceed.
- An earlier `flow/chat.test.ts` case for "a topic with no generator" never ran, because all 21 maths topics have one. It now tests a pack copy with an empty generator table.
