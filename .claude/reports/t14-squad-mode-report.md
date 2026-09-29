# Implementation Report — T14 O4 squad mode

**Plan**: `.claude/plans/t14-squad-mode.md`   **Branch**: `feature/t14-squad`   **Status**: COMPLETE

## Summary
Squad mode. A seeded weekly round comes from `hash(squad, ISO week, topic)`, so two installs build the same five questions with nothing exchanged. The server marks each round again and saves one `squad@1` event, which now carries `answers`. It then writes the pupil's own `data/squad/<squad>/<pupil>.json` as a projection of that event, and a same-week GET rewrites the file if it is missing or stale. Friends' files are only read. Their answers are served only once the pupil's own squad event for the week exists. `app/squad.html` shows the days left in the squad week, the question-by-question compare view in name order and the pooled total, then the parent round (three fresh questions saved as `teachback@1`). The PR #36 folds F4 (map `?day=`) and F5 (build the boss before posting its start) are in.

**Answer guard (restated per CLAUDE.md):** this ticket adds no model job and no prompt. `members[].answers` is present in `GET /api/squad` only when this pupil's `squad` event for the week is in the log (`getSquad` → `friends(..., mine !== null)`), and C3 #6 tests it. The round's own answers reach the page the way boss and practice answers already do: rolled in the browser, with the working added to the DOM only inside the check handler.

## Tasks completed
- A0 release check: releases `0`, tags `0` (observed 2026-09-29). B1 ran in place; B1-alt did not run.
- A1 build the boss before posting its start; the intro counts built questions → `app/retest.js` (UPDATE)
- A2 F5 tests → `src/marking/retest-dom.test.ts` (UPDATE)
- A3 F4 tests → `src/marking/map-dom.test.ts` (UPDATE)
- B1 `squad@1` gains `answers` (FIELDS, KEYS) → `src/events/types.ts` (UPDATE)
- B2 fixture with 5 answers, 4 correct → `src/events/__fixtures__/squad.v1.jsonl` (UPDATE)
- B3 `makeDataDir`, `listDataDir` → `src/events/append.ts`, `src/events/append.test.ts` (UPDATE)
- B4/B5 pure squad flow → `src/flow/squad.ts`, `src/flow/squad.test.ts` (CREATE)
- C1 `/api/event` refuses `squad` → `src/api/event.ts`, `src/api/event.test.ts` (UPDATE)
- C2/C3 → `src/api/squad.ts`, `src/api/squad.test.ts` (CREATE)
- C4 `GET/POST /api/squad`, `POST /api/squad/join` → `src/server.ts` (UPDATE)
- D1/D2 → `app/squad.html`, `app/squad.js` (CREATE)
- D3/D4 → `src/marking/squad.test.ts`, `src/marking/squad-dom.test.ts` (CREATE)
- E1 POST allowlist regex `[a-z/]+`, adds `squad`, `squad/join` → `src/marking/retest.test.ts` (UPDATE)
- E2 Squad link → `app/index.html` (UPDATE)
- E3 → `.claude/references/events.md` (UPDATE)

## Tests added
- `src/flow/squad.test.ts` (11): slug including Windows device names; determinism and seed sets; null pack; golden topic and five stems for `year11-b`/`2026-W41`; `daysLeft` Mon 7 … Sun 1; `markRound`; `parseSquadFile` refusals and stray-key drop; `comparable`; `pool`; **two Bun processes** (Europe/London en_GB vs Pacific/Auckland de_DE) produce byte-identical output, and `year11-c` differs; `generators.js` has no locale, clock or `Math.random`.
- `src/api/squad.test.ts` (15): C3 #1–#13 as planned, plus 9b (a squad folder symlinked out of `data/` → 200, solo, `unreadable: 1`), and 10b split out.
- `src/events/append.test.ts` (+5): nested make; `squad` symlinked out is refused with nothing made outside; a level that is a file is refused; a missing folder or `data/` lists as empty; list skips a symlink and a subfolder and names them.
- `src/api/event.test.ts` (+1): a valid squad body → 400, nothing written, no `data/`.
- `src/marking/squad.test.ts` (4): browser roll = Bun roll (round and parent seeds); helpers; register; ranking-word grep.
- `src/marking/squad-dom.test.ts` (8): D4 #1–#7 plus 3b (not-comparable friend: named with the note, no rows).
- `src/marking/retest-dom.test.ts` (+2), `src/marking/map-dom.test.ts` (+2).

**Mutation checks (observed):**
- A2: reverting `app/retest.js` turns both F5 tests red. The old code renders a Begin button for the unbuildable boss. It posts the start only on click, so the red cause is the button and the served-slot count, not a post on load as the plan worded it.
- B5: adding `Date.now()` to the seed string turns 3 tests red (determinism, golden, two processes). Restored → green.
- C3 #6: passing `true` in place of `mine !== null` turns #6 red. Restored → green.
- E1: appending `fetch("/api/other", { method: "POST" })` to `squad.js` turns the allowlist test red with `squad.js:/api/other`. Restored → green.

## Validation results
- `bun run check` (tsc + biome + bun test): green, 479 pass, 0 fail across 48 files (observed).
- `bun scripts/test-generators.ts`: all 6300 runs pass (observed).
- Biome reports 4 warnings, all `noDescendingSpecificity` in `app/style.css`, a file this ticket did not touch (observed).
- **Level 4, over HTTP:** two `startServer` instances on free ports, each with its own `data/`, both reading this worktree's `app/` and `content/`. Observed:
  1. Join, then a round with one wrong answer → 201, total `4 of 5 from 1 round`, `shared: true`.
  2. `squad/year11-b/` holds `sam.json`. The last log line is `squad` with 5 answers and score 4.
  3. The second install's seeds are equal to the first's; its stems were printed.
  4. With `sam.json` copied into B before alex's round, `members: [{"pupil":"sam","comparable":true}]` has no `answers` key, and the total counts sam.
  5. After alex's round, sam's 5 answers are served and the total is `6 of 10 from 2 rounds`. Once `alex.json` is copied back, A lists alex.
  6. `broken.json` → 200, `unreadable: 1`.
  7. The parent teachback `2 of 3` is followed by `xp 15`, and `parentDone: true`.
  9. A squad body to `/api/event` → 400 with the refusal sentence.
  - A second round → 409. `?day=2026-01-05` → 200, week `2026-W02`.

  The UI half of steps 1, 5 and 7 (clicking through the page) was not run in a browser. The happy-dom tests cover it. Level 5 `agent-browser` was not run.

## Deviations from the plan
1. **`listDataDir` returns `{files, skipped}`**, not `string[]`. The plan's view counts a symlinked file as unreadable (AC 5: "symlinked … degrades to solo with … a visible note"). A list that drops symlinks silently cannot report one. Skipped `*.json` entries count toward `unreadable`; other names (`.DS_Store`, `.tmp`) are ignored.
2. **The squad folder itself symlinked out of `data/`** (the #42 sync-folder workaround) → `friends()` catches the `Refused` from `listDataDir` and returns solo with `unreadable: 1`, not a 500. The same catch covers a `squad/<id>` that is a file (ENOTDIR). The heal path's `makeDataDir` is already inside `writeMine`'s try/catch.
3. **Own file name skipped silently.** `sam.json` in the folder is the pupil's own projection and is not counted. A *different* file name whose `pupil` is mine counts as unreadable, as planned.
4. **`parentDone` uses the London ISO week** of the teachback's `t` (`isoWeek(localDay(t))`), not the UTC date. C3 #13 asserts that `2026-10-11T23:30:00Z` (Monday 00:30 BST, W42) does not count for W41.
5. **`markRound` marks an empty answer wrong** (`val !== ""`). The page refuses an empty answer anyway. This guards a hand-made POST.
6. **`parseSquadFile` returns a rebuilt object**, so unknown keys in a friend's file never reach the page.
7. **`postSquad` with no buildable round** (`squadRound` null) → 400 "There is no squad round to save." The plan did not name this case. The maths pack never hits it (21 of 21 topics have a generator).
8. **`app/retest.js`: `renderIntro` is async and awaited in `load`.** A new `buildBoss` does the pack fetch and build, and `begin` takes the built items.
9. **`map-dom.test.ts` casts `globalThis.history`**, because tsconfig has no DOM lib on purpose (`src/marking/dom.ts`).
10. **The pooled total shows before the pupil's own round too.** It counts friends' comparable rounds, and no answers are exposed. The plan's week block did not condition it on `mine`.
11. **A 409 from `POST /api/squad`** (already saved in another tab, or the week turned over) reloads the view instead of offering "Try saving again", which would loop on a 409.
12. **Prose gate edits** (`no-ai-slop` detect → 3 fixes, then a `humanizer` review with no changes). Footer: "The total belongs to the whole squad. Names are in alphabetical order." `notComparable` ends "Updating either tutor fixes it." `notShared` ends "the tutor tries again next time you open this page."
13. **E1:** the register test's file list was left alone. D3 covers `squad.html` and `TEXT` (the plan said "do one, not both").
14. **A friend's file whose `squad` is not this squad counts as unreadable**, not as not-comparable. Its seeds differ by squad id, so the note "Updating either tutor fixes it" would be false. C3 #7 covers it.
15. **AC 10 is not delivered here, and #42 owns it.** Friends' files arriving through a mainstream sync folder (Drive, OneDrive, iCloud) is out of scope (Q2). The tested oracle is a file copied into `data/squad/<id>/` by hand (C3 #6 and #7, and Level 4 steps 4 and 5). A squad folder symlinked out of `data/` degrades to solo with the note (C3 9b).

UX states per surface:
- join form: built.
- loading error (`notLoaded`): built.
- no questions (`noQuestions`): built.
- round: built.
- save error with retry: built.
- compare: built.
- solo: built.
- unreadable note: built.
- not comparable: built.
- not shared: built.
- parent round, parent done, parent save error (`notSaved`): built.
- share/download: built.

## Issues encountered
- **Two `data/` folders stood in for two installs.** The plan's Level 4 step 3 worktree plus `bun install` was not used: two `startServer` instances on free ports, each with its own `data/`, test the same property without opening browser tabs.
- **Stale seeds after a mid-week pack update.** If the pack updates mid-week and the topic pick moves, `mine`'s file is projected with the *current* round's seeds while the event carries the old topic. The compare view would then pair the pupil's answers with the new questions. It is rare (it needs a content update between a pupil's round and a later view in the same week) and is not handled.
- **Squad lines without `answers`.** A `squad` line hand-written without `answers` is now skipped by `parseEvent`, since the shape was edited in place (A0: no release exists). No line of that shape exists in any fixture or script (grep, observed).
