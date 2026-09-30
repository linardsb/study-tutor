# Implementation Report — pupil profile (courses and tier) filters every topic list

**Plan**: `.claude/plans/a2-pupil-profile.md`   **Branch**: `feature/a2-pupil-profile`   **Status**: COMPLETE

## Summary
Each content pack now declares its courses in `content/<subject>/courses.json`. `loadPacks` loads them, refuses a spec in two packs, a topic whose spec is not a course of its own pack, and a topic tier its course does not list. The pupil picks courses and tiers on the intake page (`GET/POST /api/courses`, saved as `profile.json` `courses`). Routes that offer topics (topics, lessons, next, coach, cold test, sheet, interview, the case pick, MCP `read_state` list) use the pack narrowed by `filterPack` (coach on GET only, after the PR #64 review); routes that render saved work, and coach POST, use the full pack. With no valid courses saved, every route behaves as before.

## Tasks completed
- 1 `Course`, `Chosen` → `src/content/types.ts` (UPDATE)
- 2 `courses.json` → `content/maths/courses.json`, `content/science/courses.json` (CREATE); `loadCourses` → `src/content/pack.ts` (UPDATE)
- 3 course load, claim and cross-checks → `src/api/case.ts` `loadPacks` (UPDATE); `caseForDay` gains `offer`
- 4 `chosenOf`, `filterTopics`, `filterPack` → `src/content/profile.ts` (CREATE)
- 5 `getCourses`, `saveCourses` → `src/api/courses.ts` (CREATE)
- 6 `ServerOptions.courses`, `dayRoute`/`postJobRoute` take a `load` function, `both`/`scoped`/`full`, `/api/courses`, start-up wiring → `src/server.ts` (UPDATE)
- 7 `ToolContext.courses`, filtered `read_state` list → `src/mcp/tools.ts` (UPDATE); `--mcp` start-up passes `courses`
- 7b `pickLesson` skips a topic with no items → `src/flow/next.ts` (UPDATE)
- 8 courses panel, `renderCourses`/`showCourses`/`saveCourses` → `app/intake.html`, `app/intake.js` (UPDATE)
- 9 docs → `.claude/references/content-pack.md`, `.claude/references/events.md`; `scripts/build.test.ts` asserts `courses.json` ships

## Tests added
- `src/content/pack.test.ts`: `loadCourses` real packs; bad tier, repeated tier, lower-case spec, empty title, empty list, non-JSON refused; missing file named.
- `src/api/case.test.ts`: repo `loadPacks` returns `1MA1`, `8464`; spec in two subjects; topic prefix not in its courses; H topic in an F-only course; `caseForDay` picks from `offer` but rebuilds a saved case from the full pack. `writeSubject` gained a `courses` parameter (default: one untiered course per prefix).
- `src/content/profile.test.ts` (4): F/H/untiered/union; empty chosen returns the same object; items/gens same references; `chosenOf` drops stale, wrong tier, repeats, non-lists.
- `src/api/courses.test.ts` (3): 11 refusal bodies, no echo, `profile.json` absent or byte-identical after each; save keeps `weeklyTarget`, `squad`, `pupil`; fresh `data/` writes the default target.
- `src/server.test.ts` (7): Foundation maths save → 21 topics, no science lesson, 22 before; a science-only save → next is a lesson on `8464/4.1.1.2` and every cold-test slot is `8464/`; saved case on a dropped course renders; coach GET lists a tried `1MA1/` topic before the save and not after, and `?topic=1MA1/R4` → `no-topic`; coach POST still marks a question offered before its course was dropped; a pack that fails to load gives a 500 `{ error }` on GET and POST `/api/courses`; stale spec → 22 and `chosen: []`; tier fixture (H keeps F+H, F drops H even with `AA1/X2` marked red, BB1 H-only with a dropped prerequisite gets a lesson, item-less CC1 → `none`).
- `src/mcp/tools.test.ts`: `read_state` list narrows to `8464`; `1MA1/R4` still opens with answer-free items.
- `src/flow/next.test.ts`: item-less first topic skipped, second picked.
- `src/marking/intake-dom.test.ts` (4): panel before doors, save posts `{spec:"1MA1",tier:"F"}`, clears the topic cache, names the course; 400 sentence shown, doors stay hidden; saved courses show the line; no route, or an empty `courses` list, gives today's page.

## Validation results
- `bun run check` (observed, final run): tsc clean; biome 0 errors, 55 warnings, all in `app/style.css` (pre-existing); `bun test` 784 pass, 0 fail across 74 files. After the PR #64 review fixes: 787 pass, 0 fail across 74 files (observed; 784 + 3 new tests, see `.claude/reports/pr-64-review-fixes.md`).
- Level 4 (observed, `bun run dev` on an empty `data/`, driven with agent-browser): panel lists both courses with Foundation/Higher, doors hidden; empty save → "Pick at least one course."; maths Foundation save → "Courses saved.", doors shown, line "Courses: Edexcel GCSE Mathematics, Foundation"; `/map.html` 21 cards and no "Animal and plant cells"; adding science Foundation → 22 cards; `profile.json` holds both courses and `weeklyTarget`; a settings save kept `courses`. Test `data/` moved out afterwards.

- Prose gate (observed): `.claude/rules/content.md` read; `no-ai-slop` (detect) and a `humanizer` pass run over the panel copy, the six `TEXT` additions and the six 400 sentences in `src/api/courses.ts`. No blacklist word or named pattern; one clarity edit (D12).

## Deviations from the plan
- D1 `scripts/e5-science.test.ts` also builds a `ToolContext`; it gets `courses: []` like the two named builders (tsc named it).
- D2 `src/marking/retest.test.ts` "no page writes a file" guard lists allowed POST targets; `/api/courses` added with a comment that it writes `profile.json` through `writeDataFile` on the server. The plan did not name this test.
- D3 `full` loads the pack directly (`pack ?? loadPacks(root).pack`) instead of `(await both()).full`, so chat and squad do not read `profile.json` for nothing.
- D4 `/api/lessons` and `/api/topics` narrow through a local `narrow(pack, courses)` helper shared with `both`, not a second `filterPack(chosenOf(...))` expression.
- D5 `chosenOf` keeps the first *valid* entry for a spec; an invalid entry before it does not block it. `saveCourses` refuses repeats, so only a hand edit reaches this.
- D6 `loadCourses`: a present but unparseable file reports "not a list of course rows", not "missing"; "missing" is reserved for an absent file.
- D7 A tier outside the course's `tiers` (for example `F` on an H-only course) uses the "Pick Foundation or Higher for <title>." sentence; the plan's list had no separate message for it.
- D8 Intake strings sit in the page's `TEXT` object (as every other string there does); tier radios show only the tiers the course lists.
- D9 Fixture items are `vocab`, copied from `content/science/items/8464-4.1.1.2.json`, which is `vocab`, not `cloze` as the plan said.
- D10 The tier, dropped-prerequisite and nothing-to-offer fixture cases share one server test over one fixture root.
- D11 Level 4 step 8 posted the settings body with curl to `POST /api/config` (the route `setup.html` uses) rather than clicking through the setup page.

- D12 Panel copy "Where it asks, pick Foundation or Higher." became "Where a course has two tiers, pick Foundation or Higher." after the prose gate: "it" had no clear subject.

## Issues encountered
- The worktree's hook blocks `rm -rf`; the Level 4 `data/` was moved to the session scratchpad instead.
- Untracked and not part of this ticket: `.claude/plans/a3-y11-topic-lists.md`, `.claude/reports/sackville-y11-curriculum.md`.

## Guard
No model job or prompt changed. The sheet and interview jobs receive the filtered `pack.topics`, which carry no answers, as before. MCP `read_state` narrows only its topic list; the `topic` branch still passes items through `toItemView` unless `attemptedItems` holds their id, so an answer reaches a harness only after an `attempt` event exists.
