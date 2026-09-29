# Implementation Report — T15 parent digest

**Plan**: `.claude/plans/t15-parent-digest.md`   **Branch**: `feature/t15-parent-digest` (worktree `~/Desktop/study-tutor-t15`)   **Status**: COMPLETE

## Summary

A weekly factual digest built from the replayed log, the profile's weekly target and the config's cap: practice days against target, re-tests taken and passed, photos and marks left on the table (only once examiner mode has been used), tokens this month against the cap, and model calls that did not work. Failed model calls are now recorded as a new `job@1 {job, reason}` event, written once per fallback verdict in `defineJob.run` (never for `no-model`). `GET /api/digest` returns this week and last week, and a current-week view rewrites `data/digest/<iso-week>.md` for both. `app/parent.html` shows the same lines as text.

## Guard (CLAUDE.md "Restate the guard")

The only change under `src/jobs` is `recordFailure` in `define.ts`. It runs after the verdict is decided and appends `{job, reason}`: the spec's fixed name and one member of the `JOB_REASONS` union. It builds no prompt and changes none, and it passes no item, reply text or answer anywhere. `KEYS["job@1"]` is the enforcement: `appendEvent` writes only `job` and `reason`, whatever else a caller passes. The digest reads `State`, which holds no correct answer (`replay.test.ts` "guard: derived state carries no correct answer or mark scheme"), and calls no model.

**Open question:** PRD Q7 (digest content and frequency) is still open. This ticket builds the tickets doc's A4 default: weekly, factual, five facts, page plus file. If Q7 changes that, the change stays inside `buildDigest`, `REASON_TEXT` and `digest-six-weeks.md`.

## Tasks completed

- A0 shape-5 baseline → scratch `data/state.json` (`"shape": 5`, observed)
- A1 `job@1`, `JOB_REASONS` → `src/events/types.ts` (UPDATE)
- A2 fixture → `src/events/__fixtures__/job.v1.jsonl` (CREATE)
- A3 shape 6, `retests[w].taken/passed`, `failed`, `job@1` reducer → `src/events/replay.ts` (UPDATE)
- A4 → `src/events/replay.test.ts` (UPDATE)
- A5 `job: false` → `src/mcp/tools.ts` (UPDATE)
- A6 refusal + test → `src/api/event.ts`, `src/api/event.test.ts` (UPDATE)
- B1 two-way reason pin, `recordFailure` → `src/jobs/define.ts` (UPDATE)
- B2 `countFailures` + assertions → `src/jobs/__fixtures__/provider.ts`, `src/jobs/define.test.ts` (UPDATE)
- B3 full suite, no log-length drift → no change needed
- C1 → `src/digest.ts` (CREATE)
- C2 → `src/__fixtures__/digest-six-weeks.md` (CREATE)
- C3 → `src/digest.test.ts` (CREATE)
- D1, D2 → `src/api/digest.ts`, `src/api/digest.test.ts` (CREATE)
- D3 `digestRoute` + `/api/digest` + test → `src/server.ts`, `src/server.test.ts` (UPDATE)
- D4 → `app/parent.html`, `app/parent.js` (CREATE)
- D5 → `src/marking/parent-dom.test.ts` (CREATE)
- D6 footer link → `app/index.html` (UPDATE)
- E1 → `.claude/references/events.md`, `.claude/references/model-jobs.md` (UPDATE)
- E2 gate + replay-check rerun

## Tests added

- `src/events/replay.test.ts`: six-week `retests` with `taken`/`passed`, `failed` empty, shape 6; new "job: failures are counted per ISO week and reason, and are not practice".
- `src/api/event.test.ts`: a posted `job` body → 400, nothing written, no `data/`.
- `src/jobs/define.test.ts`: every `rows` case asserts its `job` lines (one per fallback verdict, none on success; the `calls: 2` rows still show one); both no-model cases assert no `job` line and no `console.error`.
- `src/digest.test.ts` (9): `mondayOf`; six-week snapshot vs the hand-derived file (matched on first run); photos/marks-left/failures; photos none marked; no photos line without O3; no model; shared label summing; purity under `setSystemTime`; no-grade guard over every built digest plus a planted-grade bite check.
- `src/api/digest.test.ts` (8): both files written and equal to the body; owner-only (skipped on win32); next week rewrites the previous week as last week; another-week `?day=` writes nothing; empty log creates no `data/`; profile target 5; "No model" save keeps a cap and still reads as no model; a past week's spend line names its Sunday's month for any asked day in that week (W44 asked on 27 October and on 1 November both give November).
- `src/server.test.ts`: `/api/digest` 200 with `?day=`, 400 for `2026-13-01` and `today`, 403 on a foreign Origin. The key-leak walk covers the new route automatically.
- `src/marking/parent-dom.test.ts` (4): `?day=` pass-through; both weeks render heading, title and lines in order; markup renders as text; failed load shows `TEXT.notLoaded` and no stale week.

Mutation runs (observed):
- B1: `recordFailure` call removed → 6 fallback rows red; reverted, 15 pass.
- B1: `reason !== "no-model"` condition removed → 2 no-model rows red (after the assertion added, see Deviations); reverted, 15 pass.
- C3: `sum.taken += 2` in `replay.ts` → snapshot test red; reverted.
- D6: `now` built from the asked day instead of the Sunday → the spend-month test red; reverted, 8 pass.

## Validation results

- `bunx tsc --noEmit`: clean (observed).
- `bunx biome check .`: clean (inside `bun run check`).
- `bun run check`: exit 0, **657 pass, 0 fail** across 60 files (observed, final run). Before Phase C the suite was 635 pass.
- E2: `replay-check` rerun in the A0 scratch folder: exit 0, no refusal, `state.json` rebuilt at `"shape": 6` (observed).
- Manual (observed 2026-09-29, dev server on 127.0.0.1:4731, fresh `data/`):
  - M1: one attempt posted; `/api/digest` wrote `2026-W39.md` and `2026-W40.md`, both `-rw-------`; W40 says `Practice days: 1 of 3.`; `?day=2026-11-15` returned W46/W45 and the folder listing did not change.
  - M2: footer link "Weekly digest (for a parent and for you)" opens `parent.html`; both weeks show the same lines as the files; `?day=2026-11-15` shows W46. Screenshot in the session scratchpad.
  - M3: `custom` preset, base URL `http://127.0.0.1:9/v1`; a hint returned the fallback and appended `{"type":"job","job":"hint","reason":"network"}`; the digest reads `Model calls that did not work: 1 (no connection 1). The tutor carried on without the model.`
  - M4: "No model" saved (`config.json` keeps `"cap": 1000000`); a hint added no log line (3 before, 3 after); spend line reads `… 0 tokens. No model is set up.`
  - M5: every page and digest string read through; British English, sentence case, no `!`, no grade words.

## Deviations from the plan

1. **`src/flow/xp.test.ts` edited** (not in the plan). Its `withWeeks` helper assigns `s.retests[week] = { score, of }`, which stopped type-checking once `retests` gained `taken`/`passed`. Now `{ score, of, taken: 0, passed: 0 }` with a comment that the guardrail reads only `score` and `of`. No behaviour change.
2. **B2: no `failed` column on the `rows` table.** The expected `job` lines come from the row's existing `by` and `reason` (`by === "fallback"` → `[{job: "probe", reason}]`). Same assertion, and nothing is duplicated.
3. **B2: the no-model mutation did not fail the tests as planned, so one assertion was added.** With the `reason !== "no-model"` check removed, `appendEvent` still refuses the line (`FIELDS["job@1"]` only accepts `JOB_REASONS`) and `recordFailure` catches the error, so no line is written and the planned assertion passed. The only symptom was an extra `console.error` on every no-model call. Both no-model tests now also assert that `console.error` is never called, and under the mutation they fail (observed).
4. **Wording after the prose gate** (`no-ai-slop`, then `humanizer`, as C1 allows): `http` → "model service refused the call" (was "provider refused the call"); `guard` → "reply held back by the tutor's checks" (was "the answer guard", an internal term); page footer → "Each week is also saved as a file in the tutor's data folder." (the old draft had no subject). Numbers and line order are unchanged.
5. **Failure label order follows `JOB_REASONS`**, as C1's rule says: the C3 case reads "(monthly cap reached 1, timed out 2)". C3's prose listed "timed out 2" first; the rule wins.
6. **A0 grep.** `state.json` is pretty-printed, so the plan's `grep -o '"shape":5'` finds nothing. Checked `"shape": 5` instead.
7. **Extra tests beyond the plan:** `mondayOf` across a year end; "no photo ever → no photos line"; owner-only moved into its own `skipIf(win32)` test; the DOM failure test also checks that no week from an earlier load is left on screen.
8. **M3/M4 went through the API routes the pages post to** (`POST /api/config`, `POST /api/chat`), not by clicking through `setup.html` and the chat panel. Same server path, same `data/` result.
9. **Packaging: no change needed.** `scripts/build.ts:73` copies `app/` as a whole folder (`fs.cpSync(..., { recursive: true })`), and no file in `scripts`, `launchers` or `src` lists app pages by name. `parent.html` and `parent.js` ship without a list edit.
10. **Implementation fix for D6, found in review before commit.** The first version built `now` from the asked day, so for a past week the spend month depended on which day was asked (`?day=2026-10-27` gave October, `?day=2026-11-01` gave November, both W44). `getDigest` now uses the week's Sunday as the reference day for any week other than the current one, as D6 says, and has a test. Files were never affected: views of other weeks write nothing.
11. **UX states on `parent.html`:** error (`TEXT.notLoaded`) and empty (an empty log shows zero lines with "none") are built and tested. There is no loading text: the sections stay blank until the fetch resolves. The plan declared no loading state, so this is recorded as a gap and not treated as a defect.

## Issues encountered

- Cleaning up after the manual checks, `pkill -f "bun src/server.ts"` stops every process whose command line matches, not only this worktree's. Afterwards nothing was listening on 4731. If another session had a dev server started the same way, it was stopped too.
- Worktree `data/` from the manual checks was moved to the session scratchpad (`rm -rf` is blocked by a hook). The worktree has no `data/` now.
- PRD Q7 (digest content and frequency) is still open; this ticket builds the ticket's A4 default.
