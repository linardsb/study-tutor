# Implementation Report — T7 O5 detective case

**Plan**: `.claude/plans/t7-detective-case.md`   **Branch**: `feature/t7-detective-case`   **Status**: COMPLETE

## Summary

One daily case picked in code from an FNV-1a hash of the day (or yesterday's confident-wrong topic), built
from an item's misconceptions (planted mistake) or a concept topic's rule and three generator rolls (invent
the rule). The page takes a pick and a 1 to 3 bet, marks in the browser and posts one `case@1` event; bet 3
and wrong shows a same-topic re-ask at once and seeds tomorrow. Replay records one case a day in
`state.cases` with its bet pairs and carries `state.caseSeed`; `shape` is 2. `GET /api/case` (optional
`?day=`) returns the case, the re-ask, today's record and the last-seven calibration numbers. No model job,
prompt or MCP tool is touched; the case's answer goes to the browser the way item answers already do and
never to a prompt.

## Tasks completed

- 1 `Topic.concept`, `CasePack` → `src/content/types.ts` (UPDATE)
- 2 `concept` shape check, `loadItems` → `src/content/pack.ts` (UPDATE)
- 3 concept and `loadItems` tests → `src/content/pack.test.ts` (UPDATE)
- 4 `lcg` moved, script re-exports it → `src/content/generators.ts`, `scripts/test-generators.ts` (UPDATE)
- 5 three concept rows → `content/maths/topics.json` (UPDATE)
- 6 `case@1` type, `isDay`, `FIELDS`, `KEYS` → `src/events/types.ts` (UPDATE)
- 7 fixture → `src/events/__fixtures__/case.v1.jsonl` (CREATE)
- 8 `CaseRecord`, `cases`, `caseSeed`, reducer, `shape: 2` → `src/events/replay.ts` (UPDATE)
- 9 reducer test, shape 2, `"working"` in the guard → `src/events/replay.test.ts` (UPDATE)
- 10 → `.claude/references/events.md` (UPDATE)
- 11 pool, pick, build, re-ask, calibration → `src/flow/detective.ts` (CREATE)
- 12 → `src/flow/detective.test.ts` (CREATE)
- 13, 14 `loadCasePack`, `caseForDay` → `src/api/case.ts`, `src/api/case.test.ts` (CREATE)
- 15 `/api/case` route, `pack` option, pack loaded in `main` → `src/server.ts`, `src/server.test.ts` (UPDATE)
- 16, 17 → `app/case.html`, `app/case.js` (CREATE)
- 18 → `src/marking/case.test.ts` (CREATE)
- 19 five rules, index link → `app/style.css`, `app/index.html` (UPDATE)
- 20 → `.claude/references/content-pack.md` (UPDATE)
- 21 gate and manual steps (below)

## Tests added

- `src/flow/detective.test.ts` (8): no-misconception item never appears; same day gives the same case and
  consecutive days differ ≥350/365; seed keeps the topic and an unknown seed is ignored; mistake case
  options and correct index over 3150 runs (NO_NOTE share 0.252, observed); rule case over 366 days per
  concept topic and 182 rule days when seeded; re-ask fresh numbers, U283 fallback on 2027-07-13, null
  with one item and no generator; calibration last seven; size (108 sources, ≤5 options).
- `src/api/case.test.ts` (4): pack sizes and memo; empty log; record rebuild and seeded next day; record
  for a missing item.
- `src/events/replay.test.ts` (+1): fixture pair, next-day clear, repeat first answer ignored, orphan re-ask.
- `src/content/pack.test.ts` (+1 and concept assertions), `src/marking/case.test.ts` (2),
  `src/server.test.ts` (+1 route test, `/case.html` and `/case.js` served, index link).

## Validation results

- `bunx tsc --noEmit` clean (observed).
- `bunx biome check` over `src app content scripts/*.ts docs .claude` and the config files: 0 errors, the
  same 4 pre-existing `noDescendingSpecificity` warnings as `main` (observed; two new ones I introduced
  were removed by lowering the case selectors).
- `bun test`: 148 pass, 0 fail across 18 files (observed, 18 consecutive runs; see Issues).
- `bun scripts/test-generators.ts`: all 6300 runs pass (observed).
- `bun run check` as one command fails only on `scripts/__fixtures__/s2-working.svg` (`noSvgWithoutTitle`),
  an untracked file another session created today at 16:26. It is not on this branch. With that file
  absent the three parts above are the gate.
- Level 4, all steps observed on a scratch copy of `app/` and `content/` with an empty `data/`, server on
  port 4732, agent-browser for the clicks:
  1. `/case.html` 200, one script tag (`/case.js`), stem, figure, scaffold, Kai's answer, 4 options, 3 bets,
     working hidden.
  2. Wrong pick, bet 3: `q done wrong`, working shown, "First case. You predicted 3, you scored 0.", re-ask
     under "Same idea, new numbers." with fresh numbers (radius 10 in place of 3).
  3. Re-ask with bet 2: two `case` lines (`bet 3, correct false, reask false`; `reask true`, no `item`);
     `/api/state` has `"caseSeed":"1MA1/G17/circle"`.
  4. Reload: done state, 0 inputs, working shown, "Back tomorrow.".
  5. Fresh log, server stopped, then Check: feedback ends "Not saved. Check the tutor window is still open."
  6. Hand line for 2026-09-26 on `1MA1/G16`, bet 3 wrong: `/api/case` today is on `1MA1/G16`.
  7. `?day=2026-10-23` (first rule day, as the plan observed): three instances with distinct answers, no
     working before the check, options are the rule and two distractors, the working after the check is the
     rule; the event has `kind: rule` and no `item`.
  8. Generator script passes (above).
- Level 5: `scripts/replay-check.ts` on the seeded log writes `state.json` with `shape: 2`, exit 0 (observed).
- Prose: the 3 rules, 6 distractors and every string in `case.html` and `case.js` (95 strings) scanned
  against `~/.claude/skills/_shared/slop-blacklist.md`: 0 hits, 0 exclamation marks (observed).

## Deviations from the plan

- **Task 14, a mistake record with `item: null`.** `CaseSource` needs an item for a mistake, so a hand-edited
  re-ask-only record gives `source: null`, `case: null` and the page shows "Done for today." The plan
  covered only the missing-item case; this is the same outcome for a sibling shape.
- **Task 13, memo holds the promise, not the pack.** Two concurrent first calls share one load. The
  "same object on a second call" test holds.
- **Task 19, selectors.** `.quiz .options label, .quiz .instances li` became `.quiz .options label` and
  `.instances li` (two rules) because the joint selector outranked two later `li` rules and Biome warned.
  Same rendering.
- **Task 17, "No case today."** Added for an empty pool with no record (the plan's states were done, error and
  the case). Unreachable with the maths pack; one line.
- **Task 17, done-state feedback.** "You had it." / "Not this time." then the correct option (v1's wording);
  the plan did not fix the words.
- **Task 12 test 6.** Also asserts a rule re-ask differs from the day's rule case in its instances, and that
  `buildCase` returns null for a missing item, a non-concept rule source and an unknown topic.
- **Fixture t vs day.** The replay test's third line uses `t` 23:30Z on 2026-10-07 with `day` 2026-10-07, so
  the flame counts the 8th (BST) while the case sits on the 7th: the midnight rule is asserted, not only
  described.

## Issues encountered

- One `bun test` run showed 1 failure with no `(fail)` line captured; 18 following runs were clean (6 in a
  loop, 12 with logs kept). Not reproduced, name unknown. Watch CI.
- `scripts/__fixtures__/` (an S2 spike's `s2-working.jpg` and `.svg`, untracked, another session) makes
  `bun run check` red at the Biome step. Left in place and unstaged.
- The first live server launched with `&` in a tool shell was orphaned on 4731; killed (PID 5302) before the
  manual steps.
- Unstaged and not this ticket's: `.claude/skills/piv-create-pr/SKILL.md` (modified before this session),
  `.claude/plans/t8-*.md`, `.claude/plans/t10-*.md`.
