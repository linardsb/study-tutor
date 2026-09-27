# Feature: T3 — Maths content pack: schema, topics, items converted from the 21 lessons, generator test

The following plan should be complete, but validate documentation and codebase patterns and task sanity
before you start implementing.

Every file this plan asks for was written and run in a throwaway copy of the repo layout on this machine
(Bun 1.3.4, Biome 2.5.14, TypeScript 7.0.2, `observed` 2026-09-27): `tsc --noEmit` clean, `biome check .`
clean on 36 files, `bun test` 11 pass / 2248 expect calls, `bun scripts/test-generators.ts` "all 6300 runs
pass", converter idempotent, the formatted generator file running in headless Chrome, and the loader
working inside a `bun build --compile` binary. The verified source is in the Appendix. Copy it; do not
re-derive from memory. Where a task's text and the Appendix differ, the Appendix is what ran.

## Feature Description

The first subject pack. Everything the engine will read about maths lands under `content/maths/` in the
shape architecture D5 fixes, and the one TypeScript file that names that shape lands in `src/content/`.
Nothing here serves a page or writes a record; T4 does that. Five things ship:

1. **The schema.** `src/content/types.ts`: the item `type` union, the item, topic, misconception and
   generator shapes. Browser JS reads the same JSON; there is no second interface anywhere.
2. **The topic table.** `content/maths/topics.json`, 21 rows keyed by Edexcel 1MA1 specification statement,
   Sparx U-codes as aliases, tier F, prerequisites from the v1 `topics.md` notes.
3. **The items.** A one-off converter, `scripts/convert-lessons.ts`, reads the 105 hand-written `.q` blocks
   out of the 21 lessons (base64 `data-a` and `data-wrong`) into `content/maths/items/<topic>.json`, with
   `misconceptions` from `data-wrong`. The lessons themselves are copied as-is; T4 strips their inline quiz.
4. **The generators.** `content/maths/generators.js` carried from the donor's `assets/generate.js`, same
   `GEN[code](rng)` contract, formatted once by Biome, plus a Bun loader in `src/content/generators.ts`.
5. **The gate.** `scripts/test-generators.ts` runs every generator 300 times (port of the v1 tool), and a
   `bun test` file calls the same checker so `bun run check` covers it. A second test pins the pack's
   invariants: 21 topics, 105 items, 312 misconceptions, no exam-board wording.

## User Story

As the engine (T4 onwards)
I want one folder that holds every maths topic, item, generator, lesson and reference sheet in one declared
shape
So that serving, marking, boss selection and the detective case are reads of data, never edits of `src/`

As Linards
I want the 21 lessons' hand-written questions and their named wrong answers in a file the code can read
So that O2 (scripted wrong step) and O5 (planted mistake) are content work, as D5 promised

## Problem Statement

The v1 folder holds 105 questions with 312 named misconceptions, but only inside lesson HTML as base64
attributes that `quiz.js` decodes at click time. No code can select an item, plant a misconception or mark
outside the page. The 21 generators run in the browser only; nothing proves they run under Bun. Topics are
a markdown table keyed by Sparx code with no exam-board key, so a school sheet cannot resolve to a topic
the way constraint 4 needs. And there is no licence statement for the folder the zip will ship.

## Solution Statement

Declare the shape once in `src/content/types.ts`. Write `topics.json` by hand from the verified statement
mapping below. Copy lessons, reference sheets and the generator file unchanged in shape. Convert the quiz
blocks with a small regex-driven script (the markup is uniform: `observed` every one of the 105 blocks is
`<div class="q" data-a data-wrong>` with one `p.stem`, one `p.hint`, one hidden `div.working`, and only
`<p>` inside stems). Port the v1 generator test to TypeScript with the checker exported, and call it from
`bun test`. Pin every count with a test that reads the files, so a lesson edited by hand and not
re-converted goes red.

## Out of Scope / Non-Goals

- Not included: serving `content/` or stripping the inline `.q` markup from the lessons (T4). Lessons and
  reference sheets are copied byte-for-byte, stale `../assets/` links included.
- Not included: `app/quiz.js`, `app/style.css`, `read.js`, `solids.js`, `vendor/three.min.js`. Which of
  these ship, and where, is T4's call. three.js is MIT; T4 adds it to `LICENCE.md` if it ships.
- Not included: `src/marking/cloze.ts` or any marker. Only the answer normaliser lands, because two tests
  need it.
- Not included: `generator` items in `items/` (one per topic with `params`). No consumer exists yet; T5
  adds them when boss selection needs them.
- Not included: alias resolution at intake (T17), the science pack (T16), any change to `src/events` (T2
  runs in parallel on that folder).
- Not changing: `generators.js` logic, any lesson text, any reference sheet text.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium (one script with a parsing rule; the rest is data, copies and tests)
**Primary Systems Affected**: `src/content/`, `src/marking/`, `content/maths/`, `scripts/`, `biome.json`,
`package.json`
**Dependencies**: none new. Bun built-ins only (`Bun.file`, `Buffer`, `import.meta.main`).

## Related Work

**Implements**: #5 (T3) · **Epic**: #1, architecture `docs/prd/study-tutor-v2.architecture.md` (D5, D6, D10, Q14)

**Back-references**:

- `.claude/plans/s1-spike-and-repo-skeleton.md` - Why: the gate, tsconfig and biome shapes this plan extends

**Forward-references**:

- T4 (#6) reads `items/` through `itemsFileName`, strips the lessons' inline quiz, passes the binary's
  folder as `root` to `loadGenerators`; T5 (#7) adds generator items; T17 (#19) resolves aliases at intake

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `CLAUDE.md` (Ground rules, Where new code goes) - Why: types live in `src/content/types.ts`; a new
  subject changes nothing in `src/`; pupil-facing text rules
- `.claude/references/content-pack.md` - Why: the layout and the item shape this plan fills in
- `.claude/rules/content.md` - Why: path-scoped rules for `content/**`; `LICENCE.md` prose passes them
- `docs/prd/study-tutor-v2.architecture.md` lines 99-110 (D5), 138-143 (D10) and 242-244 (Q14) - Why:
  the key decision and why the generator file must not be bundled
- `src/server.test.ts` - Why: the only test so far; mirror its `bun:test` import and try/finally style
- `biome.json` - Why: `files.includes` gets two exclusions and an `overrides` entry (Task 1)
- `tsconfig.json` - Why: `include` stays `["src", "scripts"]`; nothing to change
- `.claude/hooks/pre_tool_use.py` lines 44-57 - Why: the secret guard matches the substring `.env` in any
  Bash command text, which includes `process.env` and `Bun.env`; see Task 7's gotcha
- `.claude/hooks/stop_check.py` lines 29-38 - Why: `content/` and `scripts/` are gate prefixes, so the stop
  hook runs `bun run check` on this ticket's files
- Donor `~/Desktop/Matis_study_tutor/assets/generate.js` lines 1-16 (contract comment), 30 (`GEN.U349`),
  684-712 (the `normKey` wrapper that drops a wrong key equal to the answer) - Why: the contract the types
  describe; the wrapper is why the 300-run test never sees a clash
- Donor `~/Desktop/Matis_study_tutor/.claude/tools/test-generators.js` - Why: the test being ported
- Donor `~/Desktop/Matis_study_tutor/assets/quiz.js` lines 7-24 (`norm`), 26-29 (`decodeB64`), 47-61
  (`diagnoses`) - Why: the normaliser to port and the v1 decode the converter must match
- Donor `~/Desktop/Matis_study_tutor/lessons/0001-U349-percentage-of-an-amount.html` lines 76-125 and
  `0018-U116-volume-of-a-cone.html` quiz section - Why: one plain item, one item with an svg figure
- Donor `~/Desktop/Matis_study_tutor/topics.md` - Why: the 21 rows, the "do after" and "goes with" notes

### New Files to Create

- `src/content/types.ts` - the content contract (item, topic, misconception, generator)
- `src/content/pack.ts` - `itemsFileName(topicId)`, `subjectDir(subject, root)`, `loadTopics(subject, root)` and `toItemView(item)`
- `src/content/generators.ts` - `loadGenerators(subject, root)`: runs the plain-JS file, returns `GEN`
- `src/content/generators.test.ts` - planted-fault check, 21 × 300 runs, coverage
- `src/content/pack.test.ts` - topics and items invariants, board-wording scan
- `src/marking/normalise.ts` + `normalise.test.ts` - the answer normaliser (port of `quiz.js` `norm`)
- `scripts/test-generators.ts` - the checker (exported) and its CLI
- `scripts/convert-lessons.ts` + `convert-lessons.test.ts` - the converter and its parsing tests
- `content/maths/topics.json` - 21 rows (Task 3)
- `content/maths/items/*.json` - 21 files, converter output
- `content/maths/generators.js` - copy of the donor file, Biome-formatted
- `content/maths/lessons/*.html` - 21 copies
- `content/maths/reference/*.html` - 21 copies
- `content/maths/LICENCE.md` - Task 11

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [Pearson Edexcel GCSE (9-1) Mathematics specification, Issue 2, June 2015](https://qualifications.pearson.com/content/dam/pdf/GCSE/mathematics/2015/specification-and-sample-assesment/gcse-maths-2015-specification.pdf)
  - Foundation tier content, pages 5-11. Statement references are printed as `N10`, `R9`, `G17` and so on.
  - Why: the topic keys. Every mapping in Task 3 was read off these pages (`observed`); do not re-map.
- [Bun: `import.meta.main`](https://bun.sh/docs/api/import-meta)
  - Why: both scripts export their functions and run only when invoked directly
- [Biome 2 configuration: `files.includes` and `overrides`](https://biomejs.dev/reference/configuration/#filesincludes)
  - The `!!` prefix ignores a path and never traverses it; `overrides` scopes linter settings to a glob
  - Why: lessons and reference sheets must not be linted; the generator file is formatted but not linted

### Patterns to Follow

**Tests** (`src/server.test.ts:1`): `import { expect, test } from "bun:test";`, one `test(...)` per
behaviour. Tests sit next to the code (`x.ts` and `x.test.ts`). `bun test` finds every `*.test.ts` under
the repo, including `scripts/` (`observed`: 4 files, 11 tests).

**Scripts** (`scripts/build.ts`): top-level Bun script, `node:fs` and `node:path` imports, `console.error`
then `process.exit(1)` on failure. New scripts add `export` on the pure functions and guard the CLI with
`if (import.meta.main)`.

**Types**: string unions, not enums (CLAUDE.md "Types"). `Record<ItemType, true>` in the pack test pins the
union 1:1 at compile time.

**Formatting**: Biome, double quotes, 2 spaces. `bunx biome check --write .` before the gate.

**Paths**: tests and scripts read `content/...` relative to the working directory. `bun run check` and
the stop hook run at the repo root; run them from there.

---

## IMPLEMENTATION PLAN

### Phase A: Skeleton and copies

Branch, Biome config, types, `pack.ts`, normaliser, the three copies (lessons, reference, generators.js).

### Phase B: Topics and generators under Bun

**Depends on:** Phase A (types, the generator file).

`topics.json`, the loader, the ported checker, the generator test.

### Phase C: Converter and items

**Depends on:** Phase B (`topics.json` maps U-code to topic id).

The converter, its parsing tests, the 21 item files, the pack invariants test.

### Phase D: Licence, scripts, gate

**Depends on:** Phase C.

`LICENCE.md`, `package.json` script, full gate, Level 4.

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### Task 0: branch from the merged main

- **IMPLEMENT**: `git checkout main && git pull --ff-only && git checkout -b feature/t3-maths-content-pack`.
  Local `main` was one merge behind `origin/main` at planning time (`observed`: `origin/main` at `379b35c`,
  the PR #21 merge; local at `e7ee024`).
- **GOTCHA**: T2 (#4) runs in parallel and may also add a `package.json` script. Keep this ticket's
  `package.json` edit to one line so the merge is trivial.
- **VALIDATE**: `git log --oneline -1` shows `379b35c` or later; `bun run check` green before any change.
- **SATISFIES**: none (setup)

### Task 1: UPDATE `biome.json`

- **IMPLEMENT**: two exclusions and one override (full file in the Appendix):

  ```json
  "files": { "ignoreUnknown": false, "includes": ["**", "!!e1", "!!dist", "!!content/*/lessons", "!!content/*/reference"] },
  ...   (the `vcs` block `main` already carries stays as it is)
  "overrides": [{ "includes": ["content/*/generators.js"], "linter": { "enabled": false } }]
  ```

- **GOTCHA**: Biome 2.5.14 lints HTML. `observed`: a copy of lesson 0001 at `content/maths/lessons/`
  failed `biome check` with `a11y/useAriaPropsSupportedByRole`. The `!!` exclusions work: `observed`
  `biome check content/` then lists no HTML file.
- **GOTCHA**: the generator file is plain v1 browser JS. After formatting, the recommended preset reports
  163 diagnostics on it (`observed`: 73 `style/useTemplate`, 68 `complexity/useArrowFunction`, 21
  `correctness/noInnerDeclarations`, 1 `suspicious/noRedundantUseStrict`). Fixing them would rewrite the
  file the ticket says to carry unchanged, so the override turns the linter off for that one path and
  leaves the formatter on. T4's `app/quiz.js` will want the same override.
- **VALIDATE**: after Task 4, `bunx biome check content/` prints `Checked 1 file` (only `generators.js`)
  with no errors; after Task 10 it counts the JSON files too.
- **SATISFIES**: AC #7

### Task 2: CREATE `src/content/types.ts` and `src/content/pack.ts`

- **IMPLEMENT**: verbatim from the Appendix. `types.ts` holds `ItemType`, `Tier`, `Topic`,
  `Misconception`, `Item`, `ItemView`, `Generated`, `Generator`. `pack.ts` holds `itemsFileName(topicId)`
  (`1MA1/G17/cone` → `1MA1-G17-cone.json`), `subjectDir(subject, root)` (a lower-case word, or throw),
  `loadTopics(subject, root)` (shape-checked) and `toItemView(item)` (PR #22 round 1, F2 and F4).
- **PATTERN**: string unions per CLAUDE.md "Types".
- **GOTCHA**: `figure`, `scaffold` and `hint` are additions to D5's field list. They are optional and carry
  what the lessons already hold (`observed`: 60 items have an svg, 42 have a faded first step, all 105
  have a hint). Dropping them would make T4's render from JSON poorer than the v1 page. See N4.
- **GOTCHA**: `ItemView` drops `mark_scheme` and `misconceptions` as well as `answers` and `working`:
  a mark scheme is the answer for `short`, `extended` and `practical-method`, and wrong answers narrow
  the right one. The type alone is compile-time; `toItemView(item)` is the runtime projection a job must
  go through (PR #22 round 1, F2). T9 decides what the post-attempt variant adds back.
- **VALIDATE**: `bunx tsc --noEmit`
- **SATISFIES**: AC #1

### Task 3: CREATE `content/maths/topics.json`

- **IMPLEMENT**: the 21 rows in the Appendix, verbatim. Titles are the lesson `<h1>` texts (`observed`),
  which are the Sparx names the school uses (content rule "keep the school's terms"). Statement mapping
  `observed` from the Pearson specification, Foundation pages 5-11; the id suffix rule is `derived` (N1)
  and confirmed by Linards (Q1, 2026-09-27).

  Statement evidence, one line each (`observed`, spec page in brackets):
  R9 percentages incl. increase/decrease (p8) · R4 ratio notation, simplest form (p8) · R5 apply ratio to
  scaling, comparison (p8; lesson 0003 stems are scaling and a recipe) · P8 tree diagrams, combined events
  (p11, underlined = Foundation assessed) · G16 area of triangles, parallelograms, trapezia (p10) · A12
  recognise and interpret graphs of linear, quadratic functions (p7) · R11 compound units, density and
  pressure (p8, underlined) · A9 use y = mx + c to identify parallel lines (p7, underlined) · P6 Venn
  diagrams (p11) · N10 decimals and their corresponding fractions (p5; lesson 0011 stems are FDP
  conversion) · A14 kinematic graphs, Foundation (p7); A15 area under a graph is bold, Higher only (p15),
  which matches the `topics.md` note on U562 · R16 growth and decay (p9, underlined) · R10 direct
  proportion (p8) · G17 circle area; surface area and volume of spheres, pyramids, cones (p10, underlined)
  · G20 trigonometric ratios, angles and lengths in right-angled triangles (p10, underlined).

  Prerequisites (`derived` from `topics.md` notes, confirmed by Linards, Q2): "do after U349" → U554;
  "do after U554" → U332; "do after U283" → U545; "goes with U980" → U377; "goes with U527" → U910;
  "goes with U950" on U993 and "do with U993" on U950 is symmetric, so the earlier lesson (0005, U993) is
  the prerequisite of the later (0016, U950). Six rows carry one prerequisite each.

- **GOTCHA**: Biome formats JSON. Write it, then `bunx biome format --write content/maths/topics.json`.
- **VALIDATE**: `bun -e 'const t = await Bun.file("content/maths/topics.json").json(); console.log(t.length, new Set(t.map(x=>x.id)).size, new Set(t.flatMap(x=>x.aliases)).size)'` prints `21 21 21`.
- **SATISFIES**: AC #2

### Task 4: COPY lessons, reference sheets and the generator file

- **IMPLEMENT**:

  ```bash
  mkdir -p content/maths/lessons content/maths/reference content/maths/items
  cp ~/Desktop/Matis_study_tutor/lessons/*.html content/maths/lessons/
  cp ~/Desktop/Matis_study_tutor/reference/*.html content/maths/reference/
  cp ~/Desktop/Matis_study_tutor/assets/generate.js content/maths/generators.js
  bunx biome format --write content/maths/generators.js
  ```

- **GOTCHA**: formatting only. `observed`: `diff <(bunx biome format --stdin-file-path=content/maths/generators.js < ~/Desktop/Matis_study_tutor/assets/generate.js) content/maths/generators.js`
  is empty. That is the shape check against the donor from now on.
- **GOTCHA**: the lessons keep `src="../assets/generate.js"` and friends. They will not run from `content/`
  until T4 rewires them. That is the ticket's "copied as-is".
- **VALIDATE**: `ls content/maths/lessons | wc -l` → 21; `ls content/maths/reference | wc -l` → 21;
  `bunx biome check content/` green; `grep -c "GEN.U" content/maths/generators.js` → 21.
- **SATISFIES**: AC #5, AC #6

### Task 5: CREATE `src/marking/normalise.ts` + `normalise.test.ts`

- **IMPLEMENT**: verbatim from the Appendix. A line-for-line port of `quiz.js` `norm` (donor lines
  7-24), including `.replace(/−/g, "-")`.
- **GOTCHA**: the v1 `test-generators.js` copy of `norm` lacks the `−` line. Port the `quiz.js` version: it
  is the one that marks.
- **GOTCHA**: `src/marking/` is not in the ticket's file list. It is the designed home for this function
  (CLAUDE.md "marking/ deterministic markers"), two tests in this ticket need it, and T4's marker will too.
  Say so under Divergences.
- **VALIDATE**: `bun test src/marking` → 1 pass (8 rows).
- **SATISFIES**: AC #3, AC #4

### Task 6: CREATE `src/content/generators.ts`

- **IMPLEMENT**: verbatim from the Appendix. `loadGenerators(subject, root = process.cwd())` does
  `await import(path.resolve(root, "content", subject, "generators.js"))` and returns `globalThis.GEN`.
- **GOTCHA**: the path form is not optional. `observed` in a `bun build --compile` binary: a
  template-literal `import(\`../../content/${subject}/generators.js\`)` fails with
  `Cannot find module '../content/maths/generators.js' from '/$bunfs/root/entry'`; the `path.resolve`
  form loads 21 generators from the `content/` folder beside the binary, run from the binary's folder.
  A static import would bundle the file, and a `content/` update (D10) would never reach it.
- **GOTCHA**: the IIFE writes `root.GEN` where `root` is `globalThis` when `window` is undefined
  (`observed`, donor line 20). Two subjects loaded in one process would overwrite each other; one subject
  exists, noted for T16.
- **GOTCHA**: `root` defaults to the working directory. T4's server passes the binary's folder
  (`path.dirname(process.execPath)` when compiled); tests run from the repo root.
- **VALIDATE**: `bun -e 'const {loadGenerators} = await import("./src/content/generators.ts"); const g = await loadGenerators("maths"); console.log(Object.keys(g).length)'` → 21.
- **SATISFIES**: AC #4, AC #5

### Task 7: CREATE `scripts/test-generators.ts`

- **IMPLEMENT**: verbatim from the Appendix. Exports `RUNS`, `lcg`, `checkGenerators`, `checkCoverage`,
  `lessonCodes`; the CLI under `import.meta.main` prints the donor's summary table and exits 1 on any
  failure. The three assertions per run and the wrong-key rule are the donor's (lines 89-125). Seeds:
  `0x5eed + i * 7919`. Coverage compares generator codes with the union of `topics.json` aliases and the
  U-codes in `content/maths/lessons/*.html` file names.
- **GOTCHA**: the donor reads `process.env.SHOW` for how many failures to print. Do not port that: the
  repo's `pre_tool_use.py` secret guard matches the substring `.env` in any Bash command text, so a heredoc
  or `sed` carrying `process.env` or `Bun.env` is refused (`observed`, twice). A `const SHOW = 12` does
  the job.
- **GOTCHA**: the `UNIT` and `NUMBER` regexes and the `SHAPE` table copy verbatim; they encode which unit
  suffixes a working may end with. Changing them changes what passes.
- **VALIDATE**: `bun scripts/test-generators.ts` ends `all 6300 runs pass` (21 × 300, `derived`;
  `observed` on the prototype).
- **SATISFIES**: AC #4

### Task 8: CREATE `src/content/generators.test.ts`

- **IMPLEMENT**: verbatim from the Appendix. Three tests: (1) a planted broken generator yields exactly
  three failures (working ends on the wrong number, stem number missing from the working, wrong key equal
  to the answer), each prefixed `BAD seed 24301:`; (2) the real table has 21 codes and 300 runs return no
  failures; (3) coverage against aliases and lesson file names is exact.
- **VALIDATE**: `bun test src/content/generators.test.ts` → 3 pass. Then the real mutation (M1):
  `perl -0pi -e 's/answers: \[String\(ans\), ans\.toFixed\(1\)\]/answers: [String(ans + 1)]/' content/maths/generators.js`,
  run again, expect test 2 red with lines like `U349 seed 24301: the working ends "= 97.5" but the answer is "98.5"`
  (`observed`); `git checkout content/maths/generators.js`.
- **SATISFIES**: AC #4

### Task 9: CREATE `scripts/convert-lessons.ts` + `scripts/convert-lessons.test.ts`

- **IMPLEMENT**: verbatim from the Appendix. `bun scripts/convert-lessons.ts [lessonsDir] [outDir]`,
  defaults `content/maths/lessons` and `content/maths/items`; `topics.json` is read from the lessons
  folder's parent. Exports `decodeB64`, `splitWrong`, `parseLesson`, `convert`.
  - `splitWrong`: the last `=` with a non-space character on both sides. `observed` over all 312 donor
    pairs: 0 unsplittable; every key is a number, a ratio, a fraction, an expression like `3x+2`, an
    equation like `y=7x+1`, or a letter answer `a`/`b`/`c`.
  - `parseLesson`: quiz section by `data-code`; blocks by `split('<div class="q"')`; fields by the
    regexes in the Appendix; stem stripped of tags, entities and its leading `N. `; `figure` is the first
    `<svg…</svg>` in the block; `scaffold` the faded working; optional fields omitted, never `""`.
  - `convert`: alias → topic row (throw naming the code if none); item id `${topic.id}#${n}`;
    `type: "cloze"` (Q3, confirmed).
  - Tests: three `splitWrong` shapes; a two-item fixture (svg and scaffold only on the first); the
    unknown-code throw; and the deep-equal of committed `items/*.json` against a fresh `convert()`.
- **GOTCHA**: no HTML entities occur in any quiz section today (`observed`) and no stem holds an inline
  tag. The unescape and tag strip are four lines against a future lesson; they are not a parser.
- **GOTCHA**: the v1 `quiz.js` splits at the first `=` and so mis-keys the 9 U377 pairs (N2). The JSON
  has separate fields, so the bug does not travel to T4.
- **VALIDATE**: `bun test scripts/convert-lessons.test.ts` → 4 pass once Task 10 has written the files
  (3 pass before).
- **SATISFIES**: AC #3

### Task 10: RUN the converter, ADD the `convert` script, CREATE `src/content/pack.test.ts`

- **IMPLEMENT**:
  - `package.json`: `"convert": "bun scripts/convert-lessons.ts && biome format --write content/maths/items"`.
    Run `bun run convert`; it prints `21 topics, 105 items`. Run it again: `git status --short content/`
    shows no change (`observed`: identical md5 over the 21 files after a second run).
  - `src/content/pack.test.ts` verbatim from the Appendix: topics (21 rows, unique ids and aliases, id
    grammar, prerequisites resolve and are never self, tier F); items (one file per topic, 5 each, 105
    total, 312 misconceptions, ids unique, `topic` matches the file, `type` in the union via
    `Record<ItemType, true>`, 1-9 answers and 2-3 misconceptions per item, no misconception answer
    normalises to an accepted answer, `figure` starts with `<svg`); board wording (none of
    `\b(Edexcel|Pearson|AQA|OCR|WJEC|Eduqas)\b`, `mark scheme`, `Total for Question`, `Turn over` in the
    63 files under `items/`, `lessons/`, `reference/`).
- **GOTCHA**: bounds like "2 to 3 misconceptions" are data facts (`observed`), not schema. They exist so a
  re-conversion that silently drops half the misconceptions goes red; loosen them with a comment when the
  content changes.
- **VALIDATE**: `bun test` → 19 pass across 5 files (`observed` 2026-09-27 after the PR #22 round-1 fixes; 13 before them; `main` has 2 server tests, the prototype layout had fewer). Then two mutations, both `observed` red:
  M2 edit one hint in `content/maths/lessons/0001-…html`, `bun test scripts/convert-lessons.test.ts` → the
  deep-equal test fails; M3 `perl -pi -e 'if (!$done && s/"hint": "/"hint": "Edexcel /) { $done = 1 }' content/maths/items/1MA1-R4.json`,
  `bun test src/content/pack.test.ts` → `content/maths/items/1MA1-R4.json matches /\b(Edexcel|…)\b/`.
  Revert both with `git checkout content/`.
- **SATISFIES**: AC #2, AC #3, AC #7

### Task 11: CREATE `content/maths/LICENCE.md`

- **IMPLEMENT**: this text (Q4 confirmed: rights reserved, ships with the download), then a `no-ai-slop`
  and `humanizer` pass (content rule) before saving.

  ```markdown
  # Licence for content/maths

  Everything in this folder was written for this project: the 21 lessons, the 21 reference sheets, the
  items in `items/`, the topic table and `generators.js`. Copyright 2025-2026 Linards Berzins. Until the
  repository licence is set (PRD Q6), this folder is redistributed only as part of the Study tutor download.

  ## Identifiers from other people

  - Topic ids such as `1MA1/R9` are references to statements in the Pearson Edexcel GCSE (9-1)
    Mathematics specification (1MA1). They are identifiers only. No Pearson question, marking
    guidance or specification text is in this folder.
  - Aliases such as `U349` are Sparx Maths topic codes, used so a school sheet can be matched to a topic.
    No Sparx content is in this folder.
  - Lessons link out to Corbettmaths pages. Nothing from those pages is copied here.

  ## Open licences

  No Oak National Academy material is in this folder yet. When it is used, it carries the Open Government
  Licence v3 with attribution here.
  ```

- **GOTCHA**: sentence case, no exclamation marks, British spelling. Not pupil-facing, but `content/**`
  rules still apply to the file. The pack test does not scan `LICENCE.md`; the grep below does.
- **VALIDATE**: `grep -ci "mark scheme\|!" content/maths/LICENCE.md` → 0.
- **SATISFIES**: AC #6

### Task 12: Gate and Level 4

- **IMPLEMENT**: `bunx biome check --write . && bun run check`. Then Level 4 below.
- **VALIDATE**: `bun run check` exits 0; the stop hook agrees.
- **SATISFIES**: all

---

## TESTING STRATEGY

### Unit Tests

- `src/marking/normalise.test.ts`: eight rows.
- `scripts/convert-lessons.test.ts`: the split rule on three shapes, `parseLesson` on a two-item fixture,
  the unknown-code throw.
- `src/content/generators.test.ts` test 1: the checker catches three planted faults.

### Integration Tests

- `src/content/generators.test.ts` tests 2 and 3: the real generator file under Bun, 6300 runs, coverage
  against topics and lessons.
- `scripts/convert-lessons.test.ts` deep-equal: the committed items are what the converter produces from
  the committed lessons.
- `src/content/pack.test.ts`: every count and invariant of the pack, plus the board-wording scan.

No socket, no realtime, no provider in this ticket.

### Mutation results (`observed` on the prototype, 2026-09-27)

| Mutation | Test that goes red |
|---|---|
| M1 U349 `answers` off by one in `generators.js` | `generators.test.ts` test 2, `U349 seed 24301: the working ends "= 97.5" but the answer is "98.5"` |
| M2 one hint word changed in lesson 0001 | `convert-lessons.test.ts` deep-equal |
| M3 `Edexcel` planted in one item hint | `pack.test.ts` board wording, names the file and the regex |

### Edge Cases

| Case | Where verified |
|---|---|
| Misconception key containing `=` (U377, 9 pairs) | `convert-lessons.test.ts` split test 2 |
| Message containing ` = ` after the key (23 pairs) | split tests 2 and 3 |
| Message starting with a digit or `½` | split test 3 |
| Item with and without an svg figure (60 with, 45 without) | `parseLesson` fixture; `pack.test.ts` figure prefix |
| Item without a faded scaffold (63 of 105) | `parseLesson` fixture: field absent, not `""` |
| Lesson whose U-code has no topic row | `convert` throw test |
| Misconception answer equal to an accepted answer | `pack.test.ts` (must be 0; v1 `verify-lesson.js` enforced it) |
| Generator `wrong` key equal to the answer for some seed | `generators.test.ts` test 2 (the donor wrapper drops the clash at runtime) |
| Generator working not ending on the answer | `generators.test.ts` test 1 (planted) and M1 |
| Duplicate topic id or alias | `pack.test.ts` |
| Prerequisite naming a missing or self id | `pack.test.ts` |
| Lesson edited by hand, converter not re-run | deep-equal test, M2 |
| Biome linting the copied HTML or the generator file | Task 1 config; `bunx biome check content/` in Task 4 |
| Generator file loaded inside a compiled binary | Task 6 gotcha (`observed`); T5 re-checks in the real binary |

---

## VALIDATION COMMANDS

Run from the repo root.

### Level 1: Syntax & Style

```bash
bunx tsc --noEmit
bunx biome check .
```

### Level 2: Unit Tests

```bash
bun test src/marking scripts/convert-lessons.test.ts
```

### Level 3: Integration Tests

```bash
bun test
bun scripts/test-generators.ts      # prints the per-code table and "all 6300 runs pass"
```

### Level 4: Manual Validation

1. `bun run convert` twice. After the second run `git status --short content/` prints nothing.
2. Open `content/maths/items/1MA1-G17-cone.json`. Item `1MA1/G17/cone#1` has the stem "Find the volume of
   this cone in terms of pi. The first steps are done. Finish it.", 9 answers starting `60pi`, a `figure`
   starting `<svg`, a `scaffold` ending `60 × π = …`, and 3 misconceptions whose first answer is `180pi`.
   Compare with the donor lesson 0018's first `.q` block by eye.
3. Open `content/maths/items/1MA1-A9.json`. The first item's misconceptions have answers `y=7x+1`,
   `y=4x+1`, `y=x+7` (the split rule on the hardest shape).
4. Generators in a browser, headless, no clicking (`observed` working on this Mac):

   ```bash
   cat > /tmp/gen-check.html <<'EOF'
   <!doctype html><meta charset="utf-8"><body><script src="content/maths/generators.js"></script>
   <script>document.body.textContent = Object.keys(GEN).length + " generators; " + GEN.U349(Math.random).stem;</script>
   EOF
   cp /tmp/gen-check.html . && "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu --allow-file-access-from-files --dump-dom "file://$PWD/gen-check.html" 2>/dev/null | tr -d '\n' | sed 's/<[^>]*>/ /g' | tr -s ' '; rm gen-check.html
   ```

   Prints `21 generators; Find 55% of 80.` or another percentage stem. Same file, same table, both runtimes.
5. `bun run check` green. The stop hook runs it again on exit.

### Level 5: Additional Validation (Optional)

`bash .claude/skills/piv-next/next.sh` after the PR merges should show T4 unblocked once T2 is also in.

---

## ACCEPTANCE CRITERIA

- [ ] AC #1 `src/content/types.ts` declares the item `type` union and the item, topic, misconception and
  generator shapes; `tsc --noEmit` clean
- [ ] AC #2 `content/maths/topics.json` has 21 rows keyed `1MA1/...`, U-codes as aliases, tier F, the six
  prerequisites above; pinned by `pack.test.ts`
- [ ] AC #3 every lesson's 5 items are in `items/` with their misconceptions: 105 items, 312 misconceptions,
  deep-equal to the converter's output
- [ ] AC #4 `bun scripts/test-generators.ts` and `bun test` both run all 21 generators 300 times green
- [ ] AC #5 `content/maths/generators.js` is the donor file formatted, `GEN[code](rng)` unchanged, runs in
  Bun (test) and the browser (Level 4 step 4)
- [ ] AC #6 lessons and reference copied as-is; `LICENCE.md` present
- [ ] AC #7 no exam-board question text: the board-wording scan in `pack.test.ts` passes over items,
  lessons and reference
- [ ] `bun run check` green

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] `bun run check` green
- [ ] Level 4 steps 1-4 performed and their observations in the execution report
- [ ] Divergences from Plan section lists `src/marking/normalise.ts`, `src/content/pack.ts` and any other
  change to the ticket's file list
- [ ] PR body carries the counts with provenance (21, 105, 312, 6300, 60 figures, 42 scaffolds)

---

## OPEN QUESTIONS / ASSUMPTIONS

All four questions were put to Linards on 2026-09-27 and answered as recommended:

- **Q1 id shape.** Bare `1MA1/<statement>` when unique, `1MA1/<statement>/<slug>` when shared, statement
  always the first two segments. Settled.
- **Q2 prerequisite direction.** "do after X" and "goes with X" both give X as the prerequisite; the one
  symmetric pair is ordered by lesson number. Six rows. Settled.
- **Q3 item type.** `cloze`. No ninth union member. Settled.
- **Q4 licence line.** Rights reserved, redistributed only with the download until PRD Q6. Settled.

Assumptions that remain, none of which change the work:

- **A1.** The donor folder is the master (epic A2) and its lessons have not changed since the counts were
  taken (2026-09-27). If a lesson changes, the converter re-runs and the pack test bounds may need a
  comment.
- **A2.** T5 confirms `loadGenerators` inside the real StudyTutor binary with `root` set to the binary's
  folder. The mechanism is `observed` in a compiled test binary; only the `root` plumbing is T4/T5's.

## NOTES (open canvas)

**N1, why suffixed ids.** The 21 lessons map to 15 statements. Keeping one row per lesson (the unit the
tutor teaches and the unit Sparx codes name) means the key has to be finer than the statement for 10 rows.
The suffix keeps "keyed by specification statement" true for intake (constraint 4: a sheet resolves by
alias to a row whose first two segments are the statement) and keeps D5's example `1MA1/R9` shaped the
same for the 11 rows that need no suffix.

**N2, the v1 quiz.js split bug.** `diagnoses()` splits each `data-wrong` pair at the first `=`. For lesson
0009 (U377) the keys are equations, so v1 stores `y` as the key and the feedback never fires for those 9
misconceptions. The JSON has separate fields, so T4's port of `quiz.js` reads `misconceptions[].answer`
and the bug does not travel. Worth one line in T4's plan.

**N3, what the converter drops.** Nothing pupil-facing: the stem's leading number (`1. `) is layout; the
`label`, `input`, `button` and `feedback` elements are the page's, and T4 rebuilds them from JSON the way
`buildItem` in `quiz.js` already does for generator items.

**N4, the figure.** 60 items carry an inline svg (`observed` by the converter's own split; an earlier
per-lesson count of 65 was wrong) whose dimensions are the question (the cone stems say "this cone"; the
numbers live in the svg). Dropping the figure would make those stems unanswerable, so it travels verbatim.
Items JSON total 147 KB (`observed`).

**N5, generators.js: formatted, not linted.** Formatting once makes the file Biome's; the diff to the donor
is whitespace and quotes (`observed` empty against the formatter's own output). Linting it would mean
rewriting 163 sites of plain v1 JS, so the override turns the linter off for that path only. The file
still runs unchanged in both runtimes (`observed`: 21 codes under Bun, `21 generators; Find 55% of 80.`
in headless Chrome).

**N6, why the normaliser lands now.** Two tests need "no wrong answer normalises to an accepted answer":
the generator check (per run) and the pack check (per converted item). One function, one home, one test.

**N7, sizes.** Lessons 344 KB, reference 84 KB, items 147 KB (`observed`). Well inside the zip's tolerance.

**N8, T2 in parallel.** No shared files except `package.json` (one line here). If T2 lands first, rebase;
if this lands first, T2 rebases. Merge order does not matter.

**N9, the hook and `.env`.** `pre_tool_use.py` refuses any Bash command whose text contains `.env` as a
word (`SECRET_PATH`), so `Bun.env.X` and `process.env.X` inside a heredoc are refused. Write such lines
with the Write tool, or avoid them; this ticket avoids them.

## AMENDMENTS

- 2026-09-27 (PR #22 review, round 1) — `ItemView` also omits `mark_scheme`; `toItemView` and `subjectDir` added to `pack.ts`; `loadTopics` takes `root` and checks the file's shape; `loadGenerators` memoises per file; `splitWrong` refuses a key with a space; `text()` decodes `&nbsp;`, `&times;` and numeric entities; the scripts take no argv paths (`convert` is fixed to `content/maths`, the gate walks every subject under `content/`); `checkGenerators` is split into `checkOne`; `.sort()` calls carry a comparator; `SHAPE.number` normalises first. The Appendix listings for `pack.ts`, `generators.ts`, `test-generators.ts`, `convert-lessons.ts` and the three test files are the pre-review source; the shipped files are on the branch. Fixes report: `.claude/reports/pr-22-review-fixes.md`.
- 2026-09-27 (implementation) — Work done in a worktree at `~/Desktop/study-tutor-t3`: a T2 session was live in the main checkout. `biome.json` keeps the `vcs` block from `main` (the Appendix now shows it). `bun test` count corrected 11/4 → 13/5. Report: `.claude/reports/t3-maths-content-pack-report.md`.
- 2026-09-27 — Prototype run on the full planned layout; every claim re-labelled `observed`. Biome
  override added for `generators.js` (163 lint diagnostics, not 0 as first stated). Loader switched from
  a template-literal import to a `path.resolve(root, …)` import after the template form failed inside a
  compiled binary. `src/content/pack.ts` added. Figure count corrected 65 → 60. Q1-Q4 settled with Linards.
  Appendix with the verified source added.

---

## APPENDIX: verified source (observed green 2026-09-27)

Each block is the prototype file exactly as it passed `tsc --noEmit`, `biome check .` and `bun test` (11 pass) on this machine. Paths are repo-relative. `content/maths/items/*.json` are not listed: the converter produces them.

### `biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/2.5.14/schema.json",
  "vcs": { "enabled": true, "clientKind": "git", "useIgnoreFile": true },
  "files": {
    "ignoreUnknown": false,
    "includes": [
      "**",
      "!!e1",
      "!!dist",
      "!!content/*/lessons",
      "!!content/*/reference"
    ]
  },
  "formatter": { "enabled": true, "indentStyle": "space", "indentWidth": 2 },
  "linter": { "enabled": true, "rules": { "preset": "recommended" } },
  "javascript": { "formatter": { "quoteStyle": "double" } },
  "assist": {
    "enabled": true,
    "actions": { "source": { "organizeImports": "on" } }
  },
  "overrides": [
    { "includes": ["content/*/generators.js"], "linter": { "enabled": false } }
  ]
}
```

### `content/maths/topics.json`

```json
[
  {
    "id": "1MA1/R9/of-an-amount",
    "title": "Percentage of an amount",
    "aliases": ["U349"],
    "prerequisites": [],
    "tier": "F"
  },
  {
    "id": "1MA1/R4",
    "title": "Simplifying ratio",
    "aliases": ["U687"],
    "prerequisites": [],
    "tier": "F"
  },
  {
    "id": "1MA1/R5",
    "title": "Using equivalent ratios",
    "aliases": ["U753"],
    "prerequisites": [],
    "tier": "F"
  },
  {
    "id": "1MA1/P8",
    "title": "Probability trees",
    "aliases": ["U558"],
    "prerequisites": [],
    "tier": "F"
  },
  {
    "id": "1MA1/G16",
    "title": "Area of shapes",
    "aliases": ["U993"],
    "prerequisites": [],
    "tier": "F"
  },
  {
    "id": "1MA1/A12",
    "title": "Identifying graphs",
    "aliases": ["U980"],
    "prerequisites": [],
    "tier": "F"
  },
  {
    "id": "1MA1/R11/pressure",
    "title": "Pressure, force and area",
    "aliases": ["U527"],
    "prerequisites": [],
    "tier": "F"
  },
  {
    "id": "1MA1/R11/density",
    "title": "Density, mass and volume",
    "aliases": ["U910"],
    "prerequisites": ["1MA1/R11/pressure"],
    "tier": "F"
  },
  {
    "id": "1MA1/A9",
    "title": "Equations of parallel lines",
    "aliases": ["U377"],
    "prerequisites": ["1MA1/A12"],
    "tier": "F"
  },
  {
    "id": "1MA1/P6",
    "title": "Venn diagrams",
    "aliases": ["U296"],
    "prerequisites": [],
    "tier": "F"
  },
  {
    "id": "1MA1/N10",
    "title": "Ratios, fractions and percentages",
    "aliases": ["U176"],
    "prerequisites": [],
    "tier": "F"
  },
  {
    "id": "1MA1/A14",
    "title": "Velocity-time graphs",
    "aliases": ["U562"],
    "prerequisites": [],
    "tier": "F"
  },
  {
    "id": "1MA1/R9/increase-decrease",
    "title": "Percentage increase and decrease",
    "aliases": ["U554"],
    "prerequisites": ["1MA1/R9/of-an-amount"],
    "tier": "F"
  },
  {
    "id": "1MA1/R16",
    "title": "Repeated percentage change",
    "aliases": ["U332"],
    "prerequisites": ["1MA1/R9/increase-decrease"],
    "tier": "F"
  },
  {
    "id": "1MA1/R10",
    "title": "Direct proportion",
    "aliases": ["U721"],
    "prerequisites": [],
    "tier": "F"
  },
  {
    "id": "1MA1/G17/circle",
    "title": "Area of a circle",
    "aliases": ["U950"],
    "prerequisites": ["1MA1/G16"],
    "tier": "F"
  },
  {
    "id": "1MA1/G17/sphere",
    "title": "Volume of a sphere",
    "aliases": ["U617"],
    "prerequisites": [],
    "tier": "F"
  },
  {
    "id": "1MA1/G17/cone",
    "title": "Volume of a cone",
    "aliases": ["U116"],
    "prerequisites": [],
    "tier": "F"
  },
  {
    "id": "1MA1/G17/pyramid",
    "title": "Surface area of a pyramid",
    "aliases": ["U871"],
    "prerequisites": [],
    "tier": "F"
  },
  {
    "id": "1MA1/G20/side",
    "title": "Trigonometry: find a side",
    "aliases": ["U283"],
    "prerequisites": [],
    "tier": "F"
  },
  {
    "id": "1MA1/G20/angle",
    "title": "Trigonometry: find an angle",
    "aliases": ["U545"],
    "prerequisites": ["1MA1/G20/side"],
    "tier": "F"
  }
]
```

### `src/content/types.ts`

```ts
/** Item types, architecture D5. The first five mark in code; the last three go to a job with a mark scheme. */
export type ItemType =
  | "generator"
  | "cloze"
  | "label"
  | "sequence"
  | "vocab"
  | "short"
  | "extended"
  | "practical-method";

export type Tier = "F" | "H";

/**
 * Topic id grammar: `<spec>/<statement>` (for example `1MA1/R4`) when one lesson sits under the
 * statement; `<spec>/<statement>/<slug>` (for example `1MA1/G17/cone`) when several do. The statement
 * is always the first two segments. School codes (Sparx U-codes) are aliases only.
 */
export interface Topic {
  id: string;
  title: string;
  aliases: string[];
  prerequisites: string[];
  tier: Tier;
}

/** A named wrong answer and what to say about it. `message` names the mistake, never the right answer. */
export interface Misconception {
  answer: string;
  message: string;
}

export interface Item {
  id: string;
  topic: string;
  type: ItemType;
  stem: string;
  /** Inline SVG shown under the stem, verbatim from the lesson. */
  figure?: string;
  /** The first step or two, shown before the pupil answers (the lesson's faded working). */
  scaffold?: string;
  hint?: string;
  params?: Record<string, unknown>;
  answers?: string[];
  working?: string;
  mark_scheme?: string;
  misconceptions: Misconception[];
}

/** The item a model job may see before an `attempt` event exists for it. `toItemView` in pack.ts is the runtime projection. */
export type ItemView = Omit<
  Item,
  "answers" | "working" | "mark_scheme" | "misconceptions"
>;

/** generators.js contract, unchanged from v1 (see the file's header comment). */
export type GeneratedAnswerType =
  | "number"
  | "pi"
  | "ratio"
  | "fraction"
  | "text";
export interface Generated {
  stem: string;
  answers: string[];
  working: string;
  hint: string;
  wrong: Record<string, string>;
  type?: GeneratedAnswerType;
}
export type Generator = (rng: () => number) => Generated;
```

### `src/content/pack.ts`

```ts
import type { Topic } from "./types";

/** `1MA1/G17/cone` → `1MA1-G17-cone.json`: the file under content/<subject>/items/ that holds a topic's items. */
export function itemsFileName(topicId: string): string {
  return `${topicId.replaceAll("/", "-")}.json`;
}

export async function loadTopics(subject: string): Promise<Topic[]> {
  return (await Bun.file(`content/${subject}/topics.json`).json()) as Topic[];
}
```

### `src/content/generators.ts`

```ts
import path from "node:path";
import type { Generator } from "./types";

/**
 * Runs content/<subject>/generators.js under Bun (it assigns globalThis.GEN) and returns the table.
 * The path is resolved at runtime from `root`, so the file is read from disk beside the binary and is
 * never bundled into it (an update that replaces content/ reaches it, D10). A relative or template
 * import() fails inside a compiled binary: observed 2026-09-27, "Cannot find module" from /$bunfs/root.
 */
export async function loadGenerators(
  subject: string,
  root = process.cwd(),
): Promise<Record<string, Generator>> {
  await import(path.resolve(root, "content", subject, "generators.js"));
  const table = (globalThis as { GEN?: Record<string, Generator> }).GEN;
  if (!table)
    throw new Error(`content/${subject}/generators.js did not set GEN`);
  return table;
}
```

### `src/marking/normalise.ts`

```ts
/** Port of v1 quiz.js `norm`: what a typed answer becomes before it is compared with the accepted forms. */
export function normaliseAnswer(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/[£€$]/g, "")
    .replace(/−/g, "-")
    .replace(/π/g, "pi")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/[°º]/g, "")
    .replace(/\bdeg(rees)?\b/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, "")
    .replace(/^\+/, "")
    .replace(/^(-?)0+(\d)/, "$1$2")
    .replace(/^(-?)\./, "$10.")
    .replace(/(\.\d*?)0+$/, "$1")
    .replace(/\.$/, "");
}
```

### `src/marking/normalise.test.ts`

```ts
import { expect, test } from "bun:test";
import { normaliseAnswer } from "./normalise";

test("normaliseAnswer matches v1 quiz.js norm", () => {
  const rows: [string, string][] = [
    ["£7", "7"],
    ["60 pi", "60pi"],
    ["36 m³", "36m3"],
    ["0.50", "0.5"],
    [".5", "0.5"],
    ["45°", "45"],
    ["−3", "-3"],
    ["1,200", "1200"],
  ];
  for (const [input, want] of rows) expect(normaliseAnswer(input)).toBe(want);
});
```

### `scripts/test-generators.ts`

```ts
import { readdirSync } from "node:fs";
import { loadGenerators } from "../src/content/generators";
import { loadTopics } from "../src/content/pack";
import type { Generated, Generator } from "../src/content/types";
import { normaliseAnswer as norm } from "../src/marking/normalise";

export const RUNS = 300;

/** Seeded generator, so a failure can be reproduced from the seed printed with it. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const UNIT =
  /\s*(cm³|cm²|m³|m²|cm|mm|km|kg|g\/cm³|kg\/m³|n\/m²|n\/cm²|m\/s²|m\/s|ml|litres|degrees|pounds|off|each|n|m|g|p)\.?$/i;
const NUMBER = /-?\d+(?:\.\d+)?/g;

function tail(working: string): string | null {
  const at = working.lastIndexOf("=");
  if (at === -1) return null;
  return working
    .slice(at + 1)
    .replace(/[.\s]+$/, "")
    .replace(UNIT, "")
    .trim();
}

const SHAPE: Record<string, (v: string) => boolean> = {
  number: (v) => Number.isFinite(Number(v)),
  pi: (v) => /^-?\d+(?:\.\d+)?pi$/.test(norm(v)),
  ratio: (v) => /^\d+(?:\.\d+)?(?::\d+(?:\.\d+)?)+$/.test(norm(v)),
  fraction: (v) =>
    /^-?\d+\/\d+$/.test(norm(v)) && Number(norm(v).split("/")[1]) !== 0,
  text: (v) => typeof v === "string" && v.trim().length > 0,
};

/**
 * Three assertions per run, from the v1 tool: the answer is well formed for its type; the working's last
 * "=" is followed by an accepted answer; every number in the stem appears again in the working. Plus: no
 * named wrong answer is an accepted answer.
 */
export function checkGenerators(
  table: Record<string, Generator>,
  runs = RUNS,
): string[] {
  const failures: string[] = [];
  for (const code of Object.keys(table).sort()) {
    const build = table[code];
    if (!build) continue;
    for (let i = 0; i < runs; i += 1) {
      const seed = (0x5eed + i * 7919) >>> 0;
      let q: Generated;
      try {
        q = build(lcg(seed));
      } catch (e) {
        failures.push(`${code} seed ${seed}: threw ${(e as Error).message}`);
        continue;
      }
      const fail = (m: string) =>
        failures.push(
          `${code} seed ${seed}: ${m}\n    stem:    ${q.stem}\n    working: ${q.working}`,
        );
      if (
        !q.stem ||
        !q.working ||
        !q.hint ||
        !Array.isArray(q.answers) ||
        !q.answers.length
      ) {
        fail("a field is missing");
        continue;
      }
      const type = q.type ?? "number";
      const shape = SHAPE[type];
      if (!shape) {
        fail(`unknown type ${type}`);
        continue;
      }
      const first = q.answers[0] ?? "";
      if (!shape(first)) fail(`answer "${first}" is not a valid ${type}`);
      const accepted = q.answers.map(norm);
      const t = tail(q.working);
      if (type === "text") {
        const end = norm(q.working).replace(/\.$/, "");
        if (!accepted.some((a) => end.endsWith(a)))
          fail(`the working does not end on the answer "${first}"`);
      } else if (t === null) fail('the working has no "="');
      else if (!accepted.includes(norm(t)))
        fail(`the working ends "= ${t}" but the answer is "${first}"`);
      const inWorking = new Set((q.working.match(NUMBER) ?? []).map(Number));
      for (const n of new Set((q.stem.match(NUMBER) ?? []).map(Number)))
        if (!inWorking.has(n))
          fail(`the stem uses ${n} and the working never does`);
      for (const key of Object.keys(q.wrong ?? {}))
        if (accepted.includes(norm(key)))
          fail(`wrong lists the correct answer "${key}"`);
    }
  }
  return failures;
}

export function checkCoverage(
  codes: string[],
  expected: string[],
): { missing: string[]; extra: string[] } {
  return {
    missing: expected.filter((c) => !codes.includes(c)),
    extra: codes.filter((c) => !expected.includes(c)),
  };
}

/** U-codes from lesson file names, `0001-U349-...html` → `U349`. */
export function lessonCodes(dir: string): string[] {
  return readdirSync(dir)
    .map((f) => /^\d{4}-(U\d+)-/.exec(f)?.[1])
    .filter((c): c is string => c !== undefined)
    .sort();
}

const SHOW = 12;

if (import.meta.main) {
  const subject = process.argv[2] ?? "maths";
  const table = await loadGenerators(subject);
  const codes = Object.keys(table).sort();
  const topics = await loadTopics(subject);
  const expected = [
    ...new Set([
      ...topics.flatMap((t) => t.aliases),
      ...lessonCodes(`content/${subject}/lessons`),
    ]),
  ].sort();
  const failures = checkGenerators(table);
  const { missing, extra } = checkCoverage(codes, expected);
  const lines = [
    `generators: ${codes.length}   topics and lessons: ${expected.length}   runs each: ${RUNS}`,
  ];
  if (missing.length)
    lines.push(`codes with no generator: ${missing.join(", ")}`);
  if (extra.length)
    lines.push(`generators with no topic or lesson: ${extra.join(", ")}`);
  for (const code of codes) {
    const n = failures.filter((f) => f.startsWith(`${code} `)).length;
    lines.push(`  ${code}  ${n === 0 ? "pass" : `${n} failed`}`);
  }
  console.log(lines.join("\n"));
  if (failures.length || missing.length || extra.length) {
    console.log(`\n${failures.slice(0, SHOW).join("\n")}`);
    if (failures.length > SHOW)
      console.log(`... and ${failures.length - SHOW} more`);
    console.log(
      `\n${failures.length} failures across ${codes.length * RUNS} runs`,
    );
    process.exit(1);
  }
  console.log(`\nall ${codes.length * RUNS} runs pass`);
}
```

### `src/content/generators.test.ts`

```ts
import { expect, test } from "bun:test";
import {
  checkCoverage,
  checkGenerators,
  lessonCodes,
} from "../../scripts/test-generators";
import { loadGenerators } from "./generators";
import { loadTopics } from "./pack";
import type { Generator } from "./types";

test("checkGenerators catches a working that ends on the wrong number, a stem number the working drops, and a wrong key equal to the answer", () => {
  const broken: Generator = () => ({
    stem: "Find 7 lots of 2.",
    answers: ["4"],
    working: "2 × 3 = 5",
    hint: "h",
    wrong: { "4": "x" },
  });
  const failures = checkGenerators({ BAD: broken }, 1);
  expect(failures).toHaveLength(3);
  for (const f of failures) expect(f).toStartWith("BAD seed 24301:");
  expect(failures.join("\n")).toContain('ends "= 5" but the answer is "4"');
  expect(failures.join("\n")).toContain(
    "the stem uses 7 and the working never does",
  );
  expect(failures.join("\n")).toContain('wrong lists the correct answer "4"');
});

test("every maths generator passes 300 seeded runs under Bun", async () => {
  const table = await loadGenerators("maths");
  expect(Object.keys(table)).toHaveLength(21);
  expect(checkGenerators(table)).toEqual([]);
});

test("generator codes match the topic aliases and the lesson files exactly", async () => {
  const table = await loadGenerators("maths");
  const topics = await loadTopics("maths");
  const aliases = topics.flatMap((t) => t.aliases).sort();
  expect(checkCoverage(Object.keys(table), aliases)).toEqual({
    missing: [],
    extra: [],
  });
  expect(lessonCodes("content/maths/lessons")).toEqual(aliases);
});
```

### `scripts/convert-lessons.ts`

```ts
import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { itemsFileName } from "../src/content/pack";
import type { Item, Misconception, Topic } from "../src/content/types";

export interface ParsedItem {
  stem: string;
  figure?: string;
  scaffold?: string;
  hint: string;
  answers: string[];
  working: string;
  misconceptions: Misconception[];
}

/** base64 in the lesson markup is UTF-8, as v1 quiz.js decodeB64 reads it. */
export function decodeB64(s: string): string {
  return Buffer.from(s, "base64").toString("utf8");
}

/**
 * One data-wrong pair is `<typed answer>=<message>`. Keys can hold "=" (`y=7x+1`) and messages can hold
 * " = " (`10 = 6 + c`), so the split is the last "=" with a non-space character on both sides.
 */
export function splitWrong(pair: string): Misconception {
  let at = -1;
  for (let i = 1; i < pair.length - 1; i += 1)
    if (pair[i] === "=" && pair[i - 1] !== " " && pair[i + 1] !== " ") at = i;
  if (at < 1) throw new Error(`no key=message split in "${pair}"`);
  return {
    answer: pair.slice(0, at).trim(),
    message: pair.slice(at + 1).trim(),
  };
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function first(re: RegExp, s: string): string | undefined {
  return re.exec(s)?.[1];
}

/** The quiz section's U-code and its `.q` blocks. Every block is one item. */
export function parseLesson(
  html: string,
  name = "lesson",
): { code: string; items: ParsedItem[] } {
  const m =
    /<section id="quiz"[^>]*data-code="(U\d+)"[^>]*>([\s\S]*?)<\/section>/.exec(
      html,
    );
  const code = m?.[1];
  const section = m?.[2];
  if (!code || section === undefined)
    throw new Error(`${name}: no quiz section with a data-code`);
  const items = section
    .split('<div class="q"')
    .slice(1)
    .map((block, i) => {
      const need = (label: string, v: string | undefined): string => {
        if (v === undefined)
          throw new Error(`${name} item ${i + 1}: no ${label}`);
        return v;
      };
      const wrong = first(/data-wrong="([^"]*)"/, block);
      const item: ParsedItem = {
        stem: text(
          need("stem", first(/<p class="stem">([\s\S]*?)<\/p>/, block)),
        ).replace(/^\d+\.\s+/, ""),
        hint: text(
          need("hint", first(/<p class="hint" hidden>([\s\S]*?)<\/p>/, block)),
        ),
        answers: decodeB64(need("data-a", first(/data-a="([^"]*)"/, block)))
          .split("|")
          .map((s) => s.trim()),
        working: text(
          need(
            "working",
            first(/<div class="working" hidden><p>([\s\S]*?)<\/p>/, block),
          ),
        ),
        misconceptions: wrong
          ? decodeB64(wrong).split("|").map(splitWrong)
          : [],
      };
      const figure = first(/(<svg[\s\S]*?<\/svg>)/, block);
      if (figure) item.figure = figure;
      const scaffold = first(
        /<div class="working faded"><p>([\s\S]*?)<\/p>/,
        block,
      );
      if (scaffold) item.scaffold = text(scaffold);
      return item;
    });
  return { code, items };
}

/** Items per topic id, from every lesson in the folder. A lesson whose code has no topic row is an error. */
export async function convert(
  lessonsDir: string,
  topics: Topic[],
): Promise<Map<string, Item[]>> {
  const out = new Map<string, Item[]>();
  const files = readdirSync(lessonsDir)
    .filter((f) => f.endsWith(".html"))
    .sort();
  for (const file of files) {
    const html = await Bun.file(path.join(lessonsDir, file)).text();
    const { code, items } = parseLesson(html, file);
    const topic = topics.find((t) => t.aliases.includes(code));
    if (!topic)
      throw new Error(`${file}: no topic in topics.json has alias ${code}`);
    out.set(
      topic.id,
      items.map(
        (
          { stem, figure, scaffold, hint, answers, working, misconceptions },
          i,
        ) => ({
          id: `${topic.id}#${i + 1}`,
          topic: topic.id,
          type: "cloze" as const,
          stem,
          ...(figure === undefined ? {} : { figure }),
          ...(scaffold === undefined ? {} : { scaffold }),
          hint,
          answers,
          working,
          misconceptions,
        }),
      ),
    );
  }
  return out;
}

if (import.meta.main) {
  const lessonsDir = process.argv[2] ?? "content/maths/lessons";
  const outDir = process.argv[3] ?? "content/maths/items";
  const topics = (await Bun.file(
    path.join(lessonsDir, "..", "topics.json"),
  ).json()) as Topic[];
  mkdirSync(outDir, { recursive: true });
  const packs = await convert(lessonsDir, topics);
  let count = 0;
  for (const [id, items] of packs) {
    count += items.length;
    await Bun.write(
      path.join(outDir, itemsFileName(id)),
      `${JSON.stringify(items, null, 2)}\n`,
    );
  }
  console.log(`${packs.size} topics, ${count} items`);
}
```

### `scripts/convert-lessons.test.ts`

```ts
import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { itemsFileName, loadTopics } from "../src/content/pack";
import { convert, parseLesson, splitWrong } from "./convert-lessons";

test("splitWrong: plain key, key holding '=', message holding ' = ' and starting with a symbol", () => {
  expect(splitWrong("4.5=That is 10% of 45.")).toEqual({
    answer: "4.5",
    message: "That is 10% of 45.",
  });
  expect(
    splitWrong(
      "y=2x+16=You added 6 instead of taking it away. 10 = 6 + c, so c = 10 − 6.",
    ),
  ).toEqual({
    answer: "y=2x+16",
    message:
      "You added 6 instead of taking it away. 10 = 6 + c, so c = 10 − 6.",
  });
  expect(
    splitWrong(
      "60=½ is cos 60°, but you have O and H, so it is sin. sin 30° = ½.",
    ),
  ).toEqual({
    answer: "60",
    message: "½ is cos 60°, but you have O and H, so it is sin. sin 30° = ½.",
  });
});

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const fixture = `<section id="quiz" class="quiz" data-code="U999">
  <h2>Try it</h2>
  <div class="q" data-a="${b64("9|9.0")}" data-wrong="${b64("4.5=Half way.|18=Twice.")}">
    <p class="stem">1. Find 20% of 45. Finish it.</p>
    <svg viewBox="0 0 10 10"><title>A box</title><rect width="1" height="1"/></svg>
    <div class="working faded"><p>10% of 45 = 4.5. …</p></div>
    <label>Your answer <input type="text"></label>
    <p class="hint" hidden>Two lots of 10%.</p>
    <div class="working" hidden><p>10% of 45 = 4.5. 20% = 9.</p></div>
  </div>
  <div class="q" data-a="${b64("130")}" data-wrong="${b64("120=Not yet.|65=Copied.")}">
    <p class="stem">2. Find 65% of 200.</p>
    <p class="hint" hidden>10% of 200 is 20.</p>
    <div class="working" hidden><p>60% = 120. 5% = 10. 65% = 130.</p></div>
  </div>
</section>`;

test("parseLesson: stems lose their number, figure and scaffold appear only where the lesson has them", () => {
  const { code, items } = parseLesson(fixture, "fixture");
  expect(code).toBe("U999");
  expect(items).toHaveLength(2);
  const [a, b] = items;
  expect(a?.stem).toBe("Find 20% of 45. Finish it.");
  expect(a?.figure).toStartWith("<svg");
  expect(a?.figure).toEndWith("</svg>");
  expect(a?.scaffold).toBe("10% of 45 = 4.5. …");
  expect(a?.answers).toEqual(["9", "9.0"]);
  expect(a?.misconceptions).toEqual([
    { answer: "4.5", message: "Half way." },
    { answer: "18", message: "Twice." },
  ]);
  expect(b?.stem).toBe("Find 65% of 200.");
  expect(b).not.toHaveProperty("figure");
  expect(b).not.toHaveProperty("scaffold");
  expect(b?.working).toBe("60% = 120. 5% = 10. 65% = 130.");
});

test("convert refuses a lesson whose code has no topic row", async () => {
  const topics = (await loadTopics("maths")).filter(
    (t) => !t.aliases.includes("U349"),
  );
  await expect(convert("content/maths/lessons", topics)).rejects.toThrow(
    "no topic in topics.json has alias U349",
  );
});

test("the committed items are what the converter produces from the committed lessons", async () => {
  const topics = await loadTopics("maths");
  const packs = await convert("content/maths/lessons", topics);
  const files = readdirSync("content/maths/items").sort();
  expect(files).toEqual([...packs.keys()].map(itemsFileName).sort());
  for (const [id, items] of packs) {
    const committed = await Bun.file(
      `content/maths/items/${itemsFileName(id)}`,
    ).json();
    expect(committed).toEqual(items);
  }
});
```

### `src/content/pack.test.ts`

```ts
import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { normaliseAnswer } from "../marking/normalise";
import { itemsFileName, loadTopics } from "./pack";
import type { Item, ItemType } from "./types";

const ITEM_TYPES: Record<ItemType, true> = {
  generator: true,
  cloze: true,
  label: true,
  sequence: true,
  vocab: true,
  short: true,
  extended: true,
  "practical-method": true,
};

async function allItems(): Promise<Map<string, Item[]>> {
  const out = new Map<string, Item[]>();
  for (const t of await loadTopics("maths"))
    out.set(
      t.id,
      (await Bun.file(
        `content/maths/items/${itemsFileName(t.id)}`,
      ).json()) as Item[],
    );
  return out;
}

test("topics.json: 21 rows, unique ids and aliases, ids follow the grammar, prerequisites resolve, tier F", async () => {
  const topics = await loadTopics("maths");
  expect(topics).toHaveLength(21);
  const ids = topics.map((t) => t.id);
  expect(new Set(ids).size).toBe(21);
  const aliases = topics.flatMap((t) => t.aliases);
  expect(new Set(aliases).size).toBe(aliases.length);
  for (const t of topics) {
    expect(t.id).toMatch(/^1MA1\/[NARGPS]\d+(\/[a-z-]+)?$/);
    expect(t.title.length).toBeGreaterThan(0);
    expect(t.tier).toBe("F");
    for (const p of t.prerequisites) {
      expect(ids).toContain(p);
      expect(p).not.toBe(t.id);
    }
  }
});

test("items: one file per topic, 5 items each, 105 in all, every item shaped and its misconceptions never the answer", async () => {
  const packs = await allItems();
  expect(readdirSync("content/maths/items").sort()).toEqual(
    [...packs.keys()].map(itemsFileName).sort(),
  );
  const seen = new Set<string>();
  let total = 0;
  let misconceptions = 0;
  for (const [topicId, items] of packs) {
    expect(items).toHaveLength(5); // observed in the v1 lessons, 2026-09-27
    for (const item of items) {
      total += 1;
      expect(seen.has(item.id)).toBe(false);
      seen.add(item.id);
      expect(item.topic).toBe(topicId);
      expect(ITEM_TYPES[item.type]).toBe(true);
      expect(item.stem.length).toBeGreaterThan(0);
      const answers = item.answers ?? [];
      expect(answers.length).toBeGreaterThanOrEqual(1);
      expect(answers.length).toBeLessThanOrEqual(9); // observed bound
      expect(item.misconceptions.length).toBeGreaterThanOrEqual(2); // observed bound
      expect(item.misconceptions.length).toBeLessThanOrEqual(3);
      misconceptions += item.misconceptions.length;
      const accepted = answers.map(normaliseAnswer);
      for (const m of item.misconceptions) {
        expect(m.answer.length).toBeGreaterThan(0);
        expect(m.message.length).toBeGreaterThan(0);
        expect(accepted).not.toContain(normaliseAnswer(m.answer));
      }
      if (item.figure !== undefined) expect(item.figure).toStartWith("<svg");
    }
  }
  expect(total).toBe(105);
  expect(misconceptions).toBe(312);
});

const BOARD = [
  /\b(Edexcel|Pearson|AQA|OCR|WJEC|Eduqas)\b/,
  /mark scheme/i,
  /Total for Question/i,
  /Turn over/i,
];

test("no exam-board wording in items, lessons or reference sheets", async () => {
  const files = ["items", "lessons", "reference"].flatMap((d) =>
    readdirSync(`content/maths/${d}`).map((f) => `content/maths/${d}/${f}`),
  );
  expect(files.length).toBe(63);
  for (const f of files) {
    const body = await Bun.file(f).text();
    for (const re of BOARD)
      expect(re.test(body), `${f} matches ${re}`).toBe(false);
  }
});
```

### `package.json` (one added line under `scripts`)

```json
"convert": "bun scripts/convert-lessons.ts && biome format --write content/maths/items"
```
