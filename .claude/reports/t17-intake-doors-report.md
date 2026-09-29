# Implementation Report — T17 intake doors: sheet or photo, five-minute interview, cold diagnostic

**Plan**: `.claude/plans/t17-intake-doors.md`   **Branch**: `feature/t17-intake-doors` (worktree `~/Desktop/study-tutor-t17`)   **Status**: COMPLETE (Level 4 step 3b not performed, see Issues)

## Summary

Three intake doors now produce `intake@1` through one confirm list on `app/intake.html`:
- **Sheet:** the `intake_read` job, or the deterministic `readCodes` token reader when there is no model.
- **Interview:** the `interview` job, or a self-rating checklist when there is no model.
- **Cold diagnostic:** a pure `diagnostic()` over rung-0 topics, marked in the browser with `quiz.mark`.

Nothing is written until the pupil ticks rows and presses Save. That posts one body to `/api/event`. `intake@1` is unchanged.

## Tasks completed

- 1 `preAttemptSystem(task, voice, num)` override → `src/jobs/define.ts` (UPDATE)
- 2–3 → `src/jobs/intake_read.ts`, `src/jobs/intake_read.test.ts` (CREATE)
- 4–5 → `src/jobs/interview.ts`, `src/jobs/interview.test.ts` (CREATE)
- 6, 9 → `src/flow/intake.ts`, `src/flow/intake.test.ts` (CREATE)
- 7–8 → `src/flow/diagnostic.ts`, `src/flow/diagnostic.test.ts` (CREATE)
- 10, 12 → `src/api/intake.ts`, `src/api/intake.test.ts` (CREATE)
- 11 three routes → `src/server.ts` (UPDATE)
- 13 intake and interview replies, markers imported from the jobs → `scripts/fake-provider.ts` (UPDATE)
- 14–15 → `app/intake.html`, `app/intake.js`, `src/marking/intake-dom.test.ts` (CREATE)
- 16 → `src/marking/intake.test.ts` (CREATE), `src/marking/retest.test.ts` (UPDATE: POST regex, title, comment)
- 17 prose gate (see Deviations)
- 18 → `app/index.html`, `.claude/references/model-jobs.md`, `.claude/references/events.md` (UPDATE)

## Tests added

- `intake_read.test.ts` (12): valid; not-json twice → reader, 2 calls, one `job@1`; down → reader, 1 call; code not in text → `shape`, retried; photo down → null; photo with digits accepted (E3); no model → no fetch; image request shape, `PRE_ATTEMPT_GUARD` present, no pack code in the prompt; `readCodes` on the table layout (comma cell, `M113`, `4.1.1.2`, a code with no letter), on the raw layout and the PDFKit layout, and on a code alone, lower case and a topic id.
- `interview.test.ts` (6): valid and empty rows; not-json twice; down; unknown id → `shape`; no model; every id listed, no sentinel, guard line, `(nothing)` for an empty answer.
- `flow/intake.test.ts` (7): `resolveCodes` and merging; `intakeRecord`; **AC 3** (three doors → equal `toEqual` maps); **T16 AC 9** (science through each door); photo with no model → `no-model`; interview with the provider down → `failed`.
- `flow/diagnostic.test.ts` (6): 8 maths generator slots; deterministic by day; science item `#1`–`#5` once maths is rated; no question → null; rung-3 topic with `rag: null` never asked, all on the ladder → null (R1); `ragFor`.
- `api/intake.test.ts` (7): **AC 1** (no key, direct and through the route, `fetch` never called); **AC 2** (unknown `U976` listed, no `intake` line); **guard** (a pack where every item is a sentinel; no sentinel and no stem in any request); validation 400s; photo `no-model`; photo HTTP 400 → `failed`; interview rows with titles.
- `marking/intake-dom.test.ts` (14): 15a tick rule, save, nothing ticked, failed post; 15b AC 2 page leg, fallback ticked, both no-verdict sentences, the provider line (R4), photo posts `{image}`; 15c model rows unticked, failed → checklist of 22, no model → checklist, no POST, cells lost → R (AC 7); 15d two answered → one body G/R and nothing before Save, working absent before Check (AC 8), a science item slot built from the items file (AC 7), nothing to ask.
- `marking/intake.test.ts` (6): `ragFor` and `intakeBody` agree with their server twins; questions equal `INTERVIEW_QUESTIONS`; encode limits equal `app/snap.js`; register check on the page and every `TEXT` string (the guard's CHECKS via `guardReply`).

## Validation results

- `bunx tsc --noEmit`: clean (observed).
- `bun run check` (observed, final run after the last code change): tsc clean; biome 192 files, 0 errors, 4 warnings (pre-existing `noDescendingSpecificity` in `app/style.css`); `bun test` **725 pass, 0 fail** across 70 files. After the PR #51 round 1 fixes: **728 pass, 0 fail** across 70 files (three new DOM tests; see `.claude/reports/pr-51-review-fixes.md`).
- `bun scripts/test-generators.ts`: all 6300 runs pass (observed).
- **Level 4** (observed, 2026-09-29, fresh throwaway `data/` in the worktree, server started with no browser opener, pages driven with `agent-browser`):
  1. No model, cold test: 8 numbered questions, no topic names. One right and Sure, one wrong and Sure, then Save. `events.jsonl` held one `intake` line (door `diagnostic`, G and R) and no `attempt`, `xp` or `session` line. State: `1MA1/R4` R at rung 0.
  2. No model, photo: `POST /api/intake/sheet` with a PNG → `{"by":"none","reason":"no-model"}`. Sent with curl, not by picking a file; the page sentence is covered by DOM test 15b.
  3. No model, pasted text: Percentage of an amount R, ticked. Simplifying ratio with no R/A/G, its tick box disabled. `U739: no topic here yet.` Picked A, ticked, saved: `1MA1/R9/of-an-amount` R and `1MA1/R4` A. No line names `U739`.
  4. `U739 R` alone: the unknown line, no confirm list, nothing posted (see Deviations).
  5. No model, Tell me: 22 checklist rows. Cells marked lost and saved → `8464/4.1.1.2` R.
  6. Fake provider (`--mode valid`, `custom` preset): the sheet showed one unticked row "read as U349", the line `U976: no topic here yet.` and the provider line. Tell me gave one unticked row, Simplifying ratio, and the "This is an AI" line was visible.
  7. Fake provider (`--mode not-json`): Tell me showed the checklist under the `matchFailed` line. The log holds `{"type":"job","job":"interview","reason":"not-json"}`.
  8. `GET /api/next` → a lesson on `1MA1/R9/of-an-amount`, the red topic from step 3. The map cards were not screenshotted; the colours were checked through `/api/state` only.

## Deviations from the plan

- **D1. `confirmRows(door, rows, source)`** takes the door as its first argument. The plan's signature was `confirmRows(rows, source)`. Save needs the door, and passing it avoids hidden page state between doors.
- **D2. No confirm list at all when no row is left.** In Level 4 step 4 and edge case E8, when every code is unknown the confirm section stays hidden. With no Save button, nothing can be posted. `TEXT.nothingTicked` still shows when rows exist and none is ticked (15a test). The plan expected an empty list whose Save shows `nothingTicked`. The outcome is the same: no post.
- **D3. No-model Tell me skips the three questions.** With no model set up, the textareas are hidden and the checklist shows straight away. The plan was ambiguous here: "no model set up → the checklist". Typed answers that no model can read would only be a dead end. The "This is an AI" line (`#ai-line`) is hidden too, since no AI runs. The 15c DOM cases check that it is shown with a model and hidden without one.
- **D4. Extra page strings** not in the plan's list: `tick`, `save`, `toMap`, `confirmHead`, `pasteFirst`, `reading`, `nothingFound`, `match`, `matching`, `writeFirst`, `checklistHead`, `coldIntro`, `notLoaded`, `yourAnswer`, `sure`, `notSure`, `check`, `correct`, `wrong`. All go through the register test.
- **D5. `api.ready` and `page` exported** on `globals().intake` as test seams, beside `encode` and `reload`. `LONG_SIDE` and `MAX_BYTES` are exported too. The twin test still compares the source text of both files, because `snap.js` keeps its constants file-local.
- **D6. Prose gate:** `no-ai-slop`, then `humanizer`, both in detect mode. They covered `INTERVIEW_QUESTIONS`, `TEXT`, the `intake.html` copy, the index link and the two jobs' `TASK`/`NUM` strings. Neither found a pattern: no Tier A/B word, no em or en dash, no contrast or colon-reveal construction. Nothing was rewritten.
- **D8. Example code in the `intake_read` prompt is `U100`,** not a pack alias. If a vision model is unsure and echoes the example, `U100` resolves to no topic and is listed as unknown instead of landing on a real topic.
- **D7. `retest.test.ts` regex** also admits `intake/sheet|intake/interview`, as planned. The interview POST is a literal `fetch("/api/intake/interview", …)` (no helper), so the regex can see it.

## Issues encountered

- **Level 4 step 3b not performed.** It needs a GUI clipboard copy from Preview and Chrome's PDF viewer, using the donor PDFs. R3's clipboard leg is still unverified; the four text-engine runs from planning are the only evidence.
- The worktree had no `node_modules`. `bun install` was run before `tsc`.
- The throwaway `data/` from Level 4 was deleted afterwards (gitignored). It only held a fake-provider config with key `k`.
- `src/.DS_Store` was committed in `c0f3b9b` by mistake (PR #51 F3). The fix commit untracks it and adds `.DS_Store` to `.gitignore`. The other `.DS_Store` files stay untracked.

## Guard statement (for the PR body)

No item enters either intake prompt, before or after an attempt. `IntakeReadInput` holds the pupil's text or image and a list of topic codes that only the no-model reader uses; the prompt never includes it. `InterviewInput` holds `{id, title, aliases}` per topic and the pupil's three answers. Neither type admits an `Item`, `ItemView` or `PreAttempt`, so `tsc` refuses one. `src/api/intake.test.ts` runs both jobs over a pack whose items are all sentinels and finds none in any request. Both system messages still carry `PRE_ATTEMPT_GUARD`. The diagnostic calls no model: it marks in the browser with `quiz.mark`, as the boss does, and the working enters the DOM only after Check.
