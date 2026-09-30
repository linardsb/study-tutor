# Feature: Sackville Year 11 core courses as topic lists (maths F+H, Combined Science, English)

The following plan should be complete, but validate documentation and codebase patterns before you start. Line numbers are `observed` at `c277595` (#59). #62 will move some of them; re-find by symbol name.

**Dry-run done.** Every change in this plan except the #62-dependent parts (`content/english/courses.json` and the profile-filter tests) was applied to a throwaway worktree at `c277595` and run through the gate on 2026-09-30. The diff is saved as `.claude/plans/a3-y11-topic-lists.patch` (16 files, 577+/28-, `observed`). Results are quoted as `observed (dry run)` below. `git apply --check` passes against `c277595` (observed).

## Feature Description

Add topic rows (no items, no lessons) for the Year 11 core courses Sackville School teaches: Edexcel GCSE Mathematics `1MA1` at Foundation and Higher, AQA Combined Science: Trilogy `8464`, and a new English pack with AQA English Language `8700` and English Literature `8702`. Each row shows on the map as "no lesson yet" (`app/map.js:38`), can be named in the interview door, and is never offered by `/api/next` until it has items (#62's guard).

## User Story

As a Year 11 pupil at Sackville (Matis's friends)
I want the map to list the topics my school's Year 11 courses cover, at my tier
So that I can see what is ahead, tell the intake what I am shaky on, and have rows ready for content to land into

## Problem Statement

The maths pack has 21 Foundation topics, science has one (`8464/4.1.1.2`), and there is no English pack (`observed`). Most of a Sackville pupil's Year 11 map (`.claude/reports/sackville-y11-curriculum.md`) is absent, and Higher content has no rows.

## Solution Statement

1. **Maths.** Append 37 rows to `content/maths/topics.json`: 17 F, 20 H. A statement that is partly Higher-only gets an F slug row for the common part and an H slug row for the bold part. `aliases: []` on every new row.
2. **Science.** Append 19 rows under `8464`: 16 F, 3 H. `aliases: []`.
3. **English.** New `content/english/` with `topics.json` (15 rows), `courses.json` (two untiered courses, #62 shape) and `LICENCE.md`. No `items/`, `lessons/` or `generators.js`.
4. **English id scheme (the issue's open point).** Literature: spec content number plus text slug, `8702/3.1.1/macbeth` (8702 numbers its content 3.1.1-3.2.3). Language has no content statements, so paper and question: `8700/P1Q4`. Both pass `packs.test.ts:32`'s grammar; `8700/P1/Q4` would not.
5. **A pack with no `lessons/` or `items/` must load.** `lessonFile` returns `null` when `lessons/` is missing; `packs.test.ts` treats a missing `items/` as `[]`.
6. **Fix the 14 tests the rows break** (list observed, below), each new figure with provenance.
7. **`app/practice.js`** lists only rows with a generator in `window.GEN`.
8. **Guards:** every topic id fits `MAX_CODE` (sheet intake); a fresh pupil's `/api/next` never names a topic without items; English rows survive a profile that also picks maths at F.

### Tier rule (inherited from #62)

A row is `F` if any of its content is examined at Foundation, `H` only if all of it is Higher-only. #62 shows F+H rows to a Higher pupil and F rows to a Foundation pupil. English rows carry `"tier": "F"` because `loadTopics` requires F or H (`src/content/pack.ts:62`); #62's filter keeps every row of a course with `tiers: []` (its plan, Solution 3). Do not change English to H or drop the field.

## Decisions (the former risks and questions, each closed)

- **D1 (was R1: depends on #62).** This ticket consumes four things from #62: `courses.json` per pack and its start-up check, the `Course`/`Chosen` types, `filterPack`, and the `pickLesson` no-items guard. Without the guard, a fresh pupil is sent to a lesson that does not exist: `/api/next?day=2026-10-10` on the dry run returned `{"kind":"lesson","topic":"8700/P1Q1"}` (`observed (dry run)`; English sorts first in pack order). Task 0 is a pre-flight that stops the run unless all four exist. Task 7 adds a test that goes red if the guard is ever removed. The plan file lives in the main checkout, not the a2 worktree, so #62's commit cannot sweep it in.
- **D2 (was R2: missing folders throw).** `lessonFile` gets `if (!fs.existsSync(dir)) return null;`. On the dry run, before the fix, `scripts/e5-science.test.ts` failed with ENOENT from `lessonUrls` (`observed`); after it, the test passed. `packs.test.ts`' items check gets an `existsSync` guard, not a `.gitkeep`, which would appear in `readdirSync` and fail the equality.
- **D3 (was R3: test fallout).** The red list is observed (dry run: 748 pass, 14 fail), not predicted. Task 6 gives the fix for each. After the fixes: 764 pass, 0 fail; `tsc --noEmit` clean; `biome check .` 0 errors and 55 warnings, the same 55 as the baseline, all `app/style.css` `noDescendingSpecificity` (`observed`); `bun scripts/test-generators.ts` "all 6300 runs pass" (`observed`).
- **D4 (was R4: practice page).** Filter on `window.GEN`. Observed in the browser on the dry run: `/practice.html` lists 21 inputs, "21 of 21 ticked", no "undefined"; `/map.html` shows "no lesson yet" 71 times (37 + 19 + 15, derived); `/api/topics` gives english 15, maths 58, science 20.
- **D5 (was Q1: space physics and pressure in liquids).** Left out. `8464` has neither: the spec text has no heading for space and no pressure-in-a-fluid section (`observed`, pdftotext of the 8464 PDF); both are AQA Physics `8463` 4.8 and 4.5.5, "physics only". A Combined pupil chooses 8464, so 8463 rows would be hidden from them by #62's filter anyway. The PR body says so. An 8463 course belongs with the separate-sciences pack if that is ever wanted.
- **D6 (was Q2: English tier).** A test in this ticket owns the behaviour: a profile of `[{spec:"1MA1",tier:"F"},{spec:"8700"},{spec:"8702"}]` keeps all 15 English rows (task 7).
- **D7 (was Q3: granularity).** One row per Sackville map topic, split only at the spec's tier boundary. Finer rows (Macbeth by theme) are content-ticket work.
- **D8 (was Q4: sheet intake).** New rows carry no Sparx codes, because we do not have them and an alias without a generator fails `generators.test.ts:73-81`. A sheet matches a new row by its full spec id; the interview door matches by title. The issue's "the sheet intake can match a school list" holds for sheets that print spec ids, and the PR body states the limit. Every id is at most 29 characters, under `MAX_CODE` 40 (task 7 pins it).
- **D9 (spec accuracy).** Every `8464` id and heading is in the 8464 PDF text; 4.5.3.5, 4.5.3.6 and 6.5.5 read "(HT only)" (`observed`, pdftotext). Every 1MA1 H call was checked against the PDF's bold font flags with PyMuPDF (`observed`): all bold for G10, G22, G23, S3, P9, A13, A20; the bold parts are "algebraic fractions" (A4), "proofs" (A6), "composite" and "inverse function" (A7), "exponential" and "trigonometric functions" (A12), "completing the square" and "quadratic formula" (A11/A18), "linear/quadratic" (A19), "quadratic inequalities in one variable" (A22), "and quadratic" nth term (A25), "areas and volumes" (G19), "three" dimensions (G20), "geometric" proof (G25), "surds" (N8).

## Out of Scope / Non-Goals

- No items, lessons, reference sheets or generators for any new row.
- No `8463` course, no separate sciences, no other Sackville subjects.
- No Sparx aliases on new rows; no bare-statement aliases on new science rows (they would clash with a future 8461-8463 pack at `loadPacks`' alias claim). The existing `4.1.1.2` alias stays.
- No change to #62's filter, routes or intake panel. No map grouping by subject. English listing first on an unfiltered map is accepted: #62's intake asks for courses first.

## Feature Metadata

**Feature Type**: Enhancement (content)
**Estimated Complexity**: Low (dry run green)
**Primary Systems Affected**: `content/*`, `src/content/pack.ts`, `src/jobs/intake_read.ts` (one export), `app/practice.js`, 11 test files
**Dependencies**: #62 (D1)

## Related Work

**Implements**: #63 · **Epic**: #1, `docs/prd/study-tutor-v2.architecture.md` D5

**Back-references**:
- `.claude/plans/a2-pupil-profile.md` (#62, in `~/Desktop/study-tutor-a2`) - `courses.json`, `Chosen`, `filterPack`, `pickLesson` guard
- `.claude/reports/sackville-y11-curriculum.md` (a2 worktree) - Sackville topic lists and boards
- `.claude/plans/t16-science-pack-oak.md` - the multi-subject seam in `loadPacks`

**Forward-references**: (content tickets per course)

---

## CONTEXT REFERENCES

### Relevant Codebase Files (read before implementing)

- `.claude/plans/a3-y11-topic-lists.patch` - the dry-run diff; tasks 1-6 and parts of 7-8 are in it verbatim
- `content/maths/topics.json`, `content/science/topics.json` - row shape; append only (tests read `topics[0]`, and `diagnostic.test.ts` takes the first 8 maths rows)
- `src/content/pack.ts:12-25` (`lessonFile`), `51-67` (`loadTopics`)
- `src/api/case.ts:48-93` - `loadPacks` claims; subject order is alphabetical, so English is first
- `src/flow/next.ts:33-49` - `pickLesson` (#62 adds the items guard)
- `src/jobs/intake_read.ts:17` - `MAX_CODE`
- `app/practice.js:35-60`, `app/practice.html:45-47` (generators.js loads first)
- `.claude/rules/content.md` - titles are pupil-facing

### New Files to Create

- `content/english/topics.json`, `content/english/LICENCE.md` (both in the patch)
- `content/english/courses.json` (not in the patch; needs #62's shape)

### Relevant Documentation (read on 2026-09-30)

- AQA 8464: https://filestore.aqa.org.uk/resources/science/specifications/AQA-8464-SP-2016.PDF (biology 4.x, chemistry 5.x, physics 6.x)
- AQA 8463: https://filestore.aqa.org.uk/resources/physics/specifications/AQA-8463-SP-2016.PDF
- Edexcel 1MA1 Issue 2: https://qualifications.pearson.com/content/dam/pdf/GCSE/mathematics/2015/specification-and-sample-assesment/gcse-maths-2015-specification.pdf (bold = Higher only)
- AQA 8700: https://filestore.aqa.org.uk/resources/english/specifications/AQA-8700-SP-2015.PDF; question shape from specimen mark schemes AQA-87001-SMS.PDF and AQA-87002-SMS.PDF
- AQA 8702: https://filestore.aqa.org.uk/resources/english/specifications/AQA-8702-SP-2015.PDF

### Patterns to Follow

- Row: `{ "id", "title", "aliases": [], "prerequisites": [...], "tier" }`, biome's JSON format (`"aliases": ["U349"]` stays on one line; run `bunx biome check --write content`).
- New test literals carry `// derived: 21 + 37 Year 11 rows (a3 plan)` or `// observed: ...`.

---

## ROW TABLES

Tier calls: D9. Counts `derived` from the tables.

### Maths `1MA1`: 37 rows, appended after `1MA1/G20/angle`

| id | title | tier | prerequisites |
|---|---|---|---|
| 1MA1/N4 | HCF and LCM | F | |
| 1MA1/N2 | Calculating with fractions | F | |
| 1MA1/N9 | Standard form | F | |
| 1MA1/A4/expand-factorise | Expanding and factorising | F | |
| 1MA1/A10 | Gradient and intercept of a straight line | F | |
| 1MA1/A17 | Solving linear equations | F | |
| 1MA1/A18/factorising | Solving quadratics by factorising | F | 1MA1/A4/expand-factorise |
| 1MA1/A19/linear | Linear simultaneous equations | F | 1MA1/A17 |
| 1MA1/A22/linear | Linear inequalities | F | 1MA1/A17 |
| 1MA1/A25/linear | The nth term of a linear sequence | F | |
| 1MA1/R11/speed | Speed, distance and time | F | |
| 1MA1/G3 | Angles in parallel lines and polygons | F | |
| 1MA1/G17/prism | Volume and surface area of prisms and cylinders | F | 1MA1/G16 |
| 1MA1/G20/pythagoras | Pythagoras' theorem | F | |
| 1MA1/G25/column-vectors | Column vectors | F | |
| 1MA1/S2 | Statistical diagrams | F | |
| 1MA1/P4 | Probabilities that add to one | F | |
| 1MA1/N8/surds | Surds | H | |
| 1MA1/A4/algebraic-fractions | Algebraic fractions | H | 1MA1/A4/expand-factorise |
| 1MA1/A6/proof | Algebraic proof | H | |
| 1MA1/A7 | Composite and inverse functions | H | |
| 1MA1/A12/trig-graphs | Graphs of sine, cosine and tangent | H | 1MA1/A12 |
| 1MA1/A12/exponential | Exponential graphs | H | 1MA1/A12 |
| 1MA1/A13 | Transforming graphs | H | 1MA1/A12 |
| 1MA1/A18/formula | Quadratic formula and completing the square | H | 1MA1/A18/factorising |
| 1MA1/A19/quadratic | Linear and quadratic simultaneous equations | H | 1MA1/A19/linear |
| 1MA1/A20 | Iteration | H | |
| 1MA1/A22/quadratic | Quadratic inequalities | H | 1MA1/A22/linear |
| 1MA1/A25/quadratic | The nth term of a quadratic sequence | H | 1MA1/A25/linear |
| 1MA1/G10 | Circle theorems | H | |
| 1MA1/G19/area-volume | Similar shapes: area and volume | H | |
| 1MA1/G20/three-d | Pythagoras and trigonometry in 3D | H | 1MA1/G20/pythagoras |
| 1MA1/G22 | Sine and cosine rules | H | 1MA1/G20/side |
| 1MA1/G23 | Area of a triangle using sine | H | 1MA1/G20/side |
| 1MA1/G25/proof | Vector proof | H | 1MA1/G25/column-vectors |
| 1MA1/S3 | Histograms and cumulative frequency | H | |
| 1MA1/P9 | Conditional probability | H | 1MA1/P8 |

Already covered by the 21: percentages (R9, R16), ratio and proportion (R4, R5, R10), compound measures (R11), trigonometry (G20 side, angle), y = mx + c (A9), probability trees (P8). The bare `1MA1/A12` and the `1MA1/A12/...` slugs coexist: items files `1MA1-A12.json` and `1MA1-A12-trig-graphs.json` differ, and `lessonFile`'s marker ends in `.json"`, so neither matches the other.

Totals: 21 + 37 = **58** maths rows; F 21 + 17 = **38**, H **20**.

### Science `8464`: 19 rows, appended after `8464/4.1.1.2`, all `prerequisites: []`

| id | title | tier |
|---|---|---|
| 8464/4.5.1 | Homeostasis | F |
| 8464/4.5.2 | The nervous system and reflexes | F |
| 8464/4.5.3 | Hormones, blood glucose and reproduction | F |
| 8464/4.5.3.5 | Treating infertility | H |
| 8464/4.5.3.6 | Negative feedback: adrenaline and thyroxine | H |
| 8464/4.6.1 | Reproduction and inheritance | F |
| 8464/4.6.2 | Variation, evolution and genetic engineering | F |
| 8464/4.6.3 | How ideas about genetics and evolution developed | F |
| 8464/4.6.4 | Classifying living things | F |
| 8464/5.7.1 | Crude oil, hydrocarbons and fuels | F |
| 8464/5.8.1 | Purity, formulations and chromatography | F |
| 8464/5.8.2 | Tests for common gases | F |
| 8464/6.4.1 | Atoms and isotopes | F |
| 8464/6.4.2 | Nuclear radiation and half-life | F |
| 8464/6.5.1 | Forces and their interactions | F |
| 8464/6.5.2 | Work done and energy transfer | F |
| 8464/6.5.3 | Forces and elasticity | F |
| 8464/6.5.4 | Forces and motion | F |
| 8464/6.5.5 | Momentum | H |

Totals: 1 + 19 = **20** science rows.

### English: 15 rows, all `"tier": "F"`, `aliases: []`, `prerequisites: []`

| id | title |
|---|---|
| 8700/P1Q1 | Language paper 1 question 1: finding information |
| 8700/P1Q2 | Language paper 1 question 2: analysing language |
| 8700/P1Q3 | Language paper 1 question 3: analysing structure |
| 8700/P1Q4 | Language paper 1 question 4: evaluating a statement |
| 8700/P1Q5 | Language paper 1 question 5: descriptive or narrative writing |
| 8700/P2Q1 | Language paper 2 question 1: true or false statements |
| 8700/P2Q2 | Language paper 2 question 2: summarising differences |
| 8700/P2Q3 | Language paper 2 question 3: analysing language |
| 8700/P2Q4 | Language paper 2 question 4: comparing viewpoints |
| 8700/P2Q5 | Language paper 2 question 5: writing your viewpoint |
| 8702/3.1.1/macbeth | Macbeth |
| 8702/3.1.2/a-christmas-carol | A Christmas Carol |
| 8702/3.2.1/lord-of-the-flies | Lord of the Flies |
| 8702/3.2.2/power-and-conflict | Power and conflict poetry |
| 8702/3.2.3 | Unseen poetry |

`content/english/courses.json`: `[{"spec":"8700","board":"AQA","title":"GCSE English Language","tiers":[]},{"spec":"8702","board":"AQA","title":"GCSE English Literature","tiers":[]}]`.

Grand total: 58 + 20 + 15 = **93** topics.

---

## STEP-BY-STEP TASKS

### 0. PRE-FLIGHT and worktree

- **IMPLEMENT**: stop unless #62 is committed. Check on #62's branch tip (or `origin/main` once merged):
  - `ls content/maths/courses.json content/science/courses.json`
  - `grep -n "Chosen\|Course" src/content/types.ts`
  - `grep -n "filterPack" src/content/profile.ts`
  - `grep -n "items.get" src/flow/next.ts` (the `pickLesson` guard)
  Then: `git -C ~/Desktop/study-tutor worktree add ~/Desktop/study-tutor-a3 -b feature/a3-y11-topics <that tip>`; `cd ~/Desktop/study-tutor-a3 && bun install`; copy this plan and the patch into `.claude/plans/`. Update memory `a3-y11-topics-plan.md` with the worktree.
- **VALIDATE**: `bun run check` green at the branch point.
- **SATISFIES**: D1

### 1. APPLY the patch

- **IMPLEMENT**: `git apply --3way .claude/plans/a3-y11-topic-lists.patch`. It was cut at `c277595`. #62 edits `server.test.ts`, `mcp/tools.test.ts`, `packs.test.ts` and `case.test.ts`, so expect a few conflicts there. Resolve each conflict by keeping #62's code and re-applying the hunk's intent from task 6's table.
- **GOTCHA**: #62's `server.test.ts` filter test may count topics (for example "no `8464/` id"). Re-derive its figures from the row tables.
- **VALIDATE**: `git diff --stat` touches the 16 files in the patch.

### 2. CREATE `content/english/courses.json`

- **IMPLEMENT**: as in the English table. Mirror #62's `content/science/courses.json` formatting.
- **VALIDATE**: `bun test src/api/case.test.ts src/content` (#62's start-up checks accept the `8700`/`8702` prefixes; no spec claimed twice).
- **SATISFIES**: AC2

### 3. VERIFY the content rows (in the patch)

- **IMPLEMENT**: the three tables, appended in table order. Titles pass `.claude/rules/content.md` (sentence case, no exclamation marks, our own words).
- **VALIDATE**: `bun test src/content/generators.test.ts` green (no new alias). `bun scripts/test-generators.ts` ends "all 6300 runs pass" (21 generators × 300, derived).
- **SATISFIES**: AC1

### 4. VERIFY `lessonFile` guard (in the patch)

- **IMPLEMENT**: `src/content/pack.ts` `lessonFile`: `if (!fs.existsSync(dir)) return null;` before the marker. New test in `src/api/lessons.test.ts`: "a subject with no lessons folder gives no URL and does not throw".
- **VALIDATE**: `bun test src/api/lessons.test.ts scripts/e5-science.test.ts`
- **SATISFIES**: AC2, D2

### 5. VERIFY `packs.test.ts` items guard (in the patch)

- **VALIDATE**: `bun test src/content/packs.test.ts`
- **SATISFIES**: AC2, D2

### 6. VERIFY the 14 observed failures are fixed (all in the patch)

| # | test (file) | failure (observed, dry run) | fix |
|---|---|---|---|
| 1 | E5 (`scripts/e5-science.test.ts`) | ENOENT scandir `content/english/lessons` via `lessonUrls` | task 4 guard |
| 2 | `/api/lessons` per topic (`server.test.ts`) | length 21 vs `opts.topics.length` 58 | `toHaveLength(21)` // observed: the 21 v1 lessons |
| 3 | `/api/topics` (`server.test.ts`) | 21 vs 58 | 58, derived comment |
| 4 | items folder (`packs.test.ts`) | ENOENT `content/english/items` | `existsSync` guard |
| 5 | topics.json 21 rows tier F (`pack.test.ts`) | 21 vs 58 | 58 rows; first 21 F; 20 H |
| 6 | items 5 each (`pack.test.ts`) | `allItems` reads a missing items file | read only files that exist |
| 7 | loadTopics from root (`pack.test.ts`) | 21 vs 58 | 58 |
| 8 | open_lesson every topic (`tools.test.ts`) | 21 vs 58 | 58; loop `topics.slice(0, 21)`; plus `1MA1/G10` → `{ ok: false, error: "No lesson for 1MA1/G10" }` |
| 9 | read_state list (`tools.test.ts`) | 21 vs 58 | 58 |
| 10 | loadCasePack (`case.test.ts`) | 21 vs 58 | 58 topics; items 105 and gens 21 unchanged |
| 11 | lessonUrls per topic (`lessons.test.ts`) | keys ≠ every topic | keys = topics with items |
| 12 | 15c checklist (`marking/intake-dom.test.ts`) | 22 vs 93 | 93 // derived: 58 + 20 + 15 |
| 13 | R8 chooseWrong (`flow/coach.test.ts`) | "no roll for 1MA1/N4" | loop over topics with a generator only (the second R8 test already skips a null roll) |
| 14 | diagnostic first 8 (`flow/diagnostic.test.ts`) | expected the English ids: `maths` was "every topic but science" | `maths = topics with the 1MA1/ prefix`; the diagnostic itself was right |

- **GOTCHA**: after #62, rows 2, 3, 8, 9 and 12 may run under #62's filter. They run with no `courses` saved, which #62 keeps as today's behaviour, so the figures hold.
- **VALIDATE**: `bun test` → 0 fail. Dry-run baseline: 764 pass, 0 fail (`observed`). Expect more tests after #62 lands.
- **SATISFIES**: AC4, D3

### 7. ADD guard tests

- In the patch: `src/content/packs.test.ts` "every id fits a sheet code": `t.id.length <= MAX_CODE`, with `MAX_CODE` exported from `src/jobs/intake_read.ts` and its comment updated to "29 characters (8702/3.2.2/power-and-conflict)".
- Not in the patch (needs #62), next to #62's filter test in `src/server.test.ts`, over the real `content/`. Each case writes `data/profile.json` and then reads:
  - no profile, fresh `data/`: `/api/next?day=2026-10-10`'s `step` is not a lesson on a topic with no items. Concretely, it is `{ kind: "lesson", topic: "1MA1/R9/of-an-amount" }`, the first maths row with items, because the English and new rows are skipped. Without #62's guard this test gets `8700/P1Q1` (observed (dry run)), so it pins D1.
  - `{ "weeklyTarget": 3, "courses": [{ "spec": "8700" }, { "spec": "8702" }] }`: `/api/topics` has 15 rows, all `subject: "english"`; `/api/next` `step.kind` is `"none"`.
  - `[{ "spec": "1MA1", "tier": "F" }]`: 38 rows, none `tier: "H"`. `[{ "spec": "1MA1", "tier": "H" }]`: 58.
  - `[{ "spec": "1MA1", "tier": "F" }, { "spec": "8700" }, { "spec": "8702" }]`: 53 rows (38 + 15, derived), the 15 English rows included (D6).
- **GOTCHA**: check the first expectation before writing it. If #62's `pickLesson` also orders by red first, a fresh state has no reds, so pack order decides and English is skipped. The first maths row with items is `1MA1/R9/of-an-amount` (`content/maths/topics.json` row 1, 5 items, `observed`).
- **VALIDATE**: `bun test src/server.test.ts src/content/packs.test.ts`
- **SATISFIES**: AC3, D1, D6, D8

### 8. VERIFY `app/practice.js` (in the patch)

- **IMPLEMENT**: `if (typeof window.GEN?.[code] !== "function") continue;` after `const code = t.aliases[0];`.
- **VALIDATE**: Level 4 step 5.
- **SATISFIES**: AC5, D4

### 9. UPDATE docs

- `src/content/types.ts:14-18` grammar comment and `.claude/references/content-pack.md` ("Keys and licence" plus the loadPacks paragraph):
  - English Language has no content statements, so its statement segment is paper and question (`8700/P1Q4`).
  - Literature uses the spec's content number plus a text slug (`8702/3.1.1/macbeth`).
  - Untiered rows carry `tier: "F"`.
  - A pack may ship topic rows without `items/` or `lessons/`.
- **VALIDATE**: `bun run check`

### 10. PR body (via `piv-create-pr`)

- State D5 (space physics and pressure are in 8463, not 8464, with the spec URLs), D8 (sheet matching is by spec id only), the English id scheme, and "Closes #63".
- Guard restatement (CLAUDE.md): this ticket changes no job and no prompt. Answer withholding is untouched; the rows have no items, so they have no answers.

---

## TESTING STRATEGY

Unit: `packs.test.ts`, `pack.test.ts`, `lessons.test.ts`. Integration: `server.test.ts` profile cases over real `content/`; `e5-science.test.ts` end to end. No replay change. No job change.

### Edge Cases (each owned)

- Pack without `lessons/` → `lessons.test.ts` new case; E5 test.
- Pack without `items/` → `packs.test.ts`.
- Fresh pupil, no profile → first lesson is a maths row with items (`server.test.ts`, task 7).
- English-only pupil → 15 rows, next `none` (`server.test.ts`).
- Foundation maths plus English → 53 rows, English kept (`server.test.ts`).
- New row via `open_lesson` → "No lesson for …" (`tools.test.ts`).
- Longest id versus `MAX_CODE` → `packs.test.ts`.
- Practice picker only lists rows with a generator → Level 4 step 5. The existing DOM tests do not cover `practice.js`; observed on the dry run (D4).

## VALIDATION COMMANDS

### Level 1-3

`bun run check`; `bun scripts/test-generators.ts` ("all 6300 runs pass").

### Level 4: Manual (every step reachable from an empty `data/`)

1. `bun run dev` in `~/Desktop/study-tutor-a3`, with an empty `data/`.
2. `/intake.html`: #62's course panel lists four courses: Edexcel GCSE Mathematics, AQA GCSE Combined Science: Trilogy, AQA GCSE English Language, AQA GCSE English Literature.
3. Pick English Language and Literature, then save. `/map.html` shows 15 cards, each "no lesson yet", and today's step offers no lesson.
4. Change the courses to Mathematics Higher. The map shows 58 cards; "Circle theorems" reads "no lesson yet"; the 21 old cards keep their lesson links.
5. `/practice.html`: 21 inputs, "21 of 21 ticked", and no "undefined" (dry run, observed).

### Level 5: spec check (done at planning, D9)

To recheck, run `pdftotext -layout` on the 8464 PDF and grep for `(HT only)` next to 4.5.3.5, 4.5.3.6 and 6.5.5. Read 1MA1 bold flags with PyMuPDF (`fitz`, installed): `span["flags"] & 16` or "Bold" in `span["font"]`.

## ACCEPTANCE CRITERIA

- [ ] AC1 Maths gains 37 rows (17 F, 20 H), science 19 `8464` rows, English 15 rows and two courses. Titles are our own words, with no board wording.
- [ ] AC2 Start-up loads all three packs with no id, alias or spec clash, including a pack with no `items/` or `lessons/`.
- [ ] AC3 With only English chosen, every topic surface shows only English rows. A fresh pupil is never sent to a topic without items.
- [ ] AC4 Every existing test passes, and each changed figure carries provenance.
- [ ] AC5 The practice picker lists only rows with a generator.
- [ ] AC6 `bun run check` green.

## OPEN QUESTIONS / ASSUMPTIONS

None open. D1-D9 close the earlier risks and questions. The one condition outside this ticket's control is #62's final shape, and task 0 checks it before any work starts.

## NOTES

Rejected alternatives:
- `8700/P1/Q4`: fails the grammar test.
- `8700/AO2`: one assessment objective spans three questions, and schools teach by question.
- `8702/P1A/macbeth`: the spec numbers Literature content (3.1.1-3.2.3), and the rule is spec ids.
- Bare aliases like `4.5.2` on science rows: a future separate-science pack would claim the same strings, and `loadPacks` refuses a duplicate alias.
- Shipping `lessons/.gitkeep` and `items/.gitkeep` for English: git keeps the folders, but `.gitkeep` breaks the items-folder equality in `packs.test.ts`, and the code guard is one line.

Confidence: 10/10 for one-pass implementation. Everything except the #62-dependent parts ran green on the dry run (observed). The #62-dependent parts are one JSON file and five server test cases, with a pre-flight that stops the run if #62's seams are missing.

## AMENDMENTS

- 2026-09-30 — Dry run added. The observed red list replaced the predicted one (4 failures were unpredicted: E5, 15c checklist, R8 chooseWrong, diagnostic first 8). The risks and questions became decisions D1-D9. Tier calls were checked against the PDFs. The plan moved from the a2 worktree to the main checkout, next to its patch.
- 2026-09-30 — Implemented (report `.claude/reports/a3-y11-topic-lists-report.md`). Superseded or added: four #62 tests that count topics or courses over the real packs were re-derived (`server.test.ts` Foundation-maths and stale-spec tests: 22 → 93, 21 → 38, course order `8700, 8702, 1MA1, 8464`; `mcp/tools.test.ts` read_state `8464` F: 17 rows; `api/case.test.ts` loadPacks course order). Task 7's five server cases shipped as one test sharing one server. Level 4 step 2 was checked through `/api/courses`, not the intake panel. The `.patch` stays uncommitted: it duplicates the branch diff.
