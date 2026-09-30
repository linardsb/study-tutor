# Implementation Report — Sackville Year 11 topic lists (#63)

**Plan**: `.claude/plans/a3-y11-topic-lists.md`   **Branch**: `feature/a3-y11-topics` (from #62's tip `74515b6`)   **Status**: COMPLETE

## Summary
Topic rows, with no items or lessons, for Sackville's Year 11 core courses: 37 maths rows (17 F, 20 H), 19 Combined Science `8464` rows, and a new English pack with 15 rows and two untiered courses (`8700`, `8702`). A pack may now ship without `lessons/` or `items/`. The practice picker lists only rows with a generator. #62's `pickLesson` items guard keeps a fresh pupil off the new rows, and a new server test goes red if that guard is removed.

## Tasks completed
- 0 Pre-flight: #62's `courses.json` (maths, science), `Course`/`Chosen`, `filterPack`, `pickLesson` guard all present at `74515b6`; worktree `~/Desktop/study-tutor-a3`; baseline `bun run check` 784 pass (observed).
- 1 Patch applied with `git apply --3way`: all 16 files clean, no conflicts (observed).
- 2 `content/english/courses.json` (CREATE)
- 3 Rows in `content/maths/topics.json`, `content/science/topics.json` (UPDATE), `content/english/topics.json`, `content/english/LICENCE.md` (CREATE), from the patch
- 4 `src/content/pack.ts` `lessonFile` missing-folder guard + `src/api/lessons.test.ts` case (patch)
- 5 `src/content/packs.test.ts` items `existsSync` guard (patch)
- 6 The 14 dry-run failures (patch), plus four #62 tests that count topics or courses (below)
- 7 `MAX_CODE` export and "every id fits a sheet code" (patch); new real-packs server test (`src/server.test.ts`)
- 8 `app/practice.js` `window.GEN` filter (patch)
- 9 `src/content/types.ts` grammar comment, `.claude/references/content-pack.md` (UPDATE)

## Tests added
- `src/server.test.ts` "courses over the real packs: a fresh pupil skips rows with no items; English alone offers nothing; the maths tier and English mix": fresh `/api/next` gives `1MA1/R9/of-an-amount`; English only gives 15 rows, all `subject: "english"`, step `none`; 1MA1 F gives 38 with no H; 1MA1 H gives 58; 1MA1 F + English gives 53 with the 15 English rows (D6). Mutation check: with the `pickLesson` items condition replaced by `true`, this test fails (observed).
- From the patch: `lessons.test.ts` no-lessons-folder case, `packs.test.ts` `MAX_CODE` case, `tools.test.ts` `open_lesson` on `1MA1/G10` gives "No lesson for 1MA1/G10".

## Validation results
- `bun run check`: `tsc --noEmit` clean; biome 0 errors, 55 warnings (the baseline 55, `app/style.css` `noDescendingSpecificity`); `bun test` 787 pass, 0 fail (observed). Derived: 784 baseline + 2 patch tests (`lessons.test.ts`, `packs.test.ts`) + 1 new server test = 787.
- `bun scripts/test-generators.ts`: "all 6300 runs pass" (observed).
- Level 4, against `bun src/server.ts` with an empty `data/` (observed): `/api/courses` lists the four courses (English Language, English Literature, Edexcel Mathematics F/H, Combined Science F/H); `/api/topics` english 15, maths 58, science 20; fresh `/api/next` step is `1MA1/R9/of-an-amount`. After saving English Language + Literature: 15 topics, step `none`. After saving Mathematics Higher: 58 topics, "Circle theorems" present, `/api/lessons` 21 entries without `1MA1/G10`; `/map.html` shows "no lesson yet" 37 times (derived: 58 − 21). `/practice.html`: 21 inputs, "21 of 21 ticked", no "undefined".
- Route sweep under no profile, English only and Mathematics Higher (observed): `/api/coach` (list, `?topic=1MA1/G10`, `?topic=8700/P1Q1`), `/api/case?day=2026-10-10`, `/api/intake/diagnostic`, `/api/next`, `/api/digest`, `/api/squad`, `/api/state` all 200. A new row gives the coach `try-first` (no attempt can exist without items), a row outside the chosen courses gives `no-topic`, English only gives case `null`, diagnostic `null` and next `none`. With English only, `/map.html` shows 15 "no lesson yet"; `map`, `case`, `coach`, `intake` and `index` pages report no browser errors and no "undefined".

## Deviations from the plan
- **Four #62 tests updated, not in the plan's list of 14.** They count topics or courses over the real packs and were written after the dry run:
  - `server.test.ts` "courses: a Foundation maths save narrows…": 22 → 93 unsaved (derived 58 + 20 + 15), 21 → 38 after Foundation maths (derived 21 + 17), course order `["8700", "8702", "1MA1", "8464"]` (subjects load alphabetically). Title "all 22 show" → "all 93 show".
  - `server.test.ts` "a stale spec in profile.json…": 22 → 93.
  - `mcp/tools.test.ts` "read_state: the topic list narrows…": an `8464` F profile now gives 17 rows (derived 1 + 16 F), first `8464/4.1.1.2`, all `8464/`, in place of the one-element equality.
  - `api/case.test.ts` "loadPacks: the repo's subjects merged…": course order as above, plus `8702/3.1.1/macbeth` maps to `english`.
  The plan's gotcha on task 1 anticipated this ("re-derive its figures from the row tables").
- **Task 7 server cases are one test, not five.** They share one server and set the profile in sequence; the step check runs before any profile is written.
- **Level 4 step 2 checked through `/api/courses`, not the intake page UI.** The course list the panel reads is what was verified; the panel itself was not opened.
- `.claude/plans/a3-y11-topic-lists.patch` is not committed: it duplicates the branch diff.

## Issues encountered
- Test count baseline moved from the dry run's 764 to 784 because #62 added 20 tests (observed at `74515b6`).
- `app/case.html:18-19` hard-codes "Maths" in the crumb and eyebrow, so an English-only pupil sees "Maths" above "No case today". This was already wrong for a science case before this ticket (#59). Not fixed here; worth a follow-up issue.
- #62 has no PR yet, so this branch stacks on `feature/a2-pupil-profile`; its PR should target that branch or wait for #62 to merge.
