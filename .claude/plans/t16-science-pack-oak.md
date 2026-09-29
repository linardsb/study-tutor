# Feature: T16 — E5 science pack from Oak, one topic end to end

The following plan should be complete, but validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils, types and models. Import from the right files.

**Read from `origin/main` at 4b5125a.** Local `main` at planning time (ab1ddd9) was six merges behind. Every `file:line` below is from 4b5125a. Branch from `origin/main` in a worktree (`~/Desktop/study-tutor-t16`, branch `feature/t16-science-pack`), never from the stale local `main`.

## Feature Description

Add a second subject, science (AQA GCSE Combined Science: Trilogy, 8464), as a content pack under `content/science/`. It holds one topic built from Oak National Academy material under OGL v3. The ticket is the E5 experiment: does a new subject go in without touching the engine?

Planning found that it cannot today (observed, `git grep` on 4b5125a):
- `src/server.ts` loads `"maths"` by name at 9 sites: 159, 260, 299, 333, 362, 402, 546, 548 and 575.
- `src/jobs/define.ts:18` tells every job it is "a maths tutor".
- `app/map.js:350` and `app/retest.js:48` and `:283` fetch `/content/maths/` directly.
- No `vocab`, `sequence` or `label` marker exists. All 105 maths items are `cloze` (observed, `grep -o '"type"'` over `content/maths/items`).

The user chose (2026-09-29) to fold the fix into this ticket as two phases:

- **Phase A, the seam.** It touches `src/` and `app/` so that any `content/<subject>/` is loaded, served, re-tested and marked by type.
- **Phase B, the pack.** It touches only `content/science/**`, `scripts/` and docs. The E5 test is `git diff --exit-code <phase-A-commit> HEAD -- src/`, which must be empty.

## User Story

As a parent whose child takes AQA Combined Science,
I want the tutor to carry a science topic the same way it carries maths,
so that the map, the lesson quiz and the cold re-test work for the second subject without a new build of the engine.

## Problem Statement

PRD constraint 5 and architecture D5 say "adding a subject changes nothing in `src/`", and no one has tested that claim. The engine is single-subject in practice. The PRD also names `vocab`, `sequence` and `label` as item types marked in code, but no marker for them exists.

## Solution Statement

**Phase A** adds `loadPacks(root)`. It discovers every `content/<subject>/topics.json`, loads each subject's `CasePack`, and merges them into one `CasePack` plus a `subjects` map (topic id → subject). Every consumer already takes a `CasePack`, so `flow/`, `boss`, `next`, `case`, `coach`, `squad` and `snap` need no logic change. The work in Phase A is:
- A new `GET /api/topics` gives the pages each topic with its subject.
- `quiz.mark` and `markAnswer` dispatch on `item.type`, using three small deterministic markers written twice: a browser copy in `quiz.js` and a TS port in `src/marking/<type>.ts`. A parity test pins the two copies to each other, the same way `norm` ↔ `normaliseAnswer` is pinned.
- The boss and the lesson quiz skip items without `answers`.
- The job persona becomes subject-neutral.

**Phase B** writes the pack:
- `COVERAGE.md` maps Oak's AQA combined-science units to 8464 statements.
- `topics.json` holds one topic, `8464/4.1.1.2` Animal and plant cells.
- The items file holds 3 `vocab`, 1 `label`, 1 `sequence` and 1 `short` item with a `mark_scheme`.
- One lesson page.
- `LICENCE.md` with the OGL attribution.
- `scripts/e5-science.test.ts` walks the topic from intake to a passed re-test using only engine functions and the real files.

## Out of Scope / Non-Goals

- **The three intake doors.** T17 (#19) is open with no branch. The three-door run is owed by #19 (see AC 9). This ticket proves that an `intake@1` event naming the science topic by alias lands on the map, which is what every door emits.
- **Science generators.** `content/science/` ships no `generators.js`, so practice (`app/practice.js`) and squad (`app/squad.js`), which are generator-only surfaces, stay maths-only and keep their `/content/maths/` fetches. Stated in NOTES as a known limit of the seam.
- **Running the `short` item end to end.** It exists, carries a `mark_scheme`, and is validated by the pack test. Teach-back and examiner both need an `attempt` event first, and an attempt needs `correct: boolean`, which code cannot decide for a short answer. See Q1.
- **Any change to event types or replay.** Replay already accepts any topic string (`src/api/event.ts:13-16` comment, observed).
- **More than one science topic**, and any higher-tier (`H`) content.
- **Oak API key.** The API needs a bearer key from a request form (scout, `open-api.thenational.academy`). The public lesson pages are enough for one topic. No build-time fetch.
- **`app/index.html`** lesson list. It stays a maths list; the map is the entry point.

## Feature Metadata

**Feature Type**: New Capability (Phase A: Refactor + Enhancement)
**Estimated Complexity**: Medium-High. Expected ~350 lines of Phase A and ~500 of Phase B. The ticket's own estimate was 500–800 lines for B alone.
**Primary Systems Affected**: `src/api/case.ts`, `src/server.ts`, `src/api/lessons.ts`, `src/mcp/tools.ts`, `src/marking/`, `src/flow/boss.ts`, `src/jobs/define.ts`, `app/quiz.js`, `app/map.js`, `app/retest.js`, `content/science/**`
**Dependencies**: none new. Oak content is read by hand from public pages.

## Related Work

**Implements**: #18 (T16) · **Epic**: #1. Docs: `docs/prd/study-tutor-v2.prd.md` (constraint 5, R9, Q8, E5) and `docs/prd/study-tutor-v2.architecture.md` (D5).

**Back-references**:
- `.claude/plans/t3-maths-content-pack.md`: pack schema, `loadTopics` and `loadItems`, the pack test.
- `.claude/plans/t6-o1-pages.md`: map, boss and re-test pages.
- `.claude/plans/t9-model-jobs.md`: `defineJob`, the persona and the guard line.

**Forward-references**:
- #19 (T17). It owes AC 9, and a comment posted 2026-09-29 asks its diagnostic to fall back to items for a topic with no generator.

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: READ THESE BEFORE IMPLEMENTING

- `.claude/references/content-pack.md`: pack layout, the item-type table, keys and licence rules.
- `.claude/rules/content.md`: pupil-facing text rules. It applies to every stem, message, hint and lesson in Phase B.
- `src/content/types.ts:1-80`
  - `ItemType`, `Topic`, `Item`, `ItemView`, `CasePack`.
  - Do not add a field to `CasePack`. Test fixtures build it by hand.
- `src/content/pack.ts:5-100`
  - `itemsFileName`, `lessonFile(root, subject, id)`, `subjectDir` (the `/^[a-z]+$/` subject rule), `loadTopics`, `loadItems` and `toItemView`.
  - `toItemView` strips `answers`, `working`, `mark_scheme` and `misconceptions`; that is the guard.
- `src/content/generators.ts:23-36`: `loadGenerators` throws when `generators.js` is missing (the `import` fails).
- `src/api/case.ts:16-36`
  - `loadCasePack(subject, root)` with its per-root promise cache.
  - `loadPacks` goes beside it.
- `src/server.ts`
  - `:39-48` `ServerOptions`.
  - `:159`, `:260`, `:299`, `:333`, `:362`: the lazy `pack ?? loadCasePack("maths", …)` fallbacks.
  - `:372-475` `apiRoutes`, with `/api/lessons` at `:398-404` and `/api/event` at `:405-407`.
  - `:540-580` start: `loadTopics("maths")`, `loadCasePack("maths")` and the MCP context with `subject: "maths"`.
- `src/api/lessons.ts` (whole file, 22 lines): `lessonUrls(root, subject, topics)`, cached per subject dir.
- `src/mcp/tools.ts`
  - `:11-20` `ToolContext.subject`.
  - `:92` `loadItems(ctx.subject, id, …)`.
  - `:145-153` `lessonFile` and the lesson URL.
- `src/api/event.ts:13-20` `resolveTopic`: alias → id over the `topics` it is given.
- `src/flow/boss.ts:47-78` `slotsFor`
  - A topic with no generator takes "the topic's other items".
  - `ids` at `:54` includes items without `answers`; this must be filtered.
- `src/flow/detective.ts:62-67`: case eligibility needs `answers`, `working` and misconceptions. Science items meet it.
- `src/flow/coach.ts:46-60`, `:124`: `pickItem` needs misconceptions; `markAnswer(item, typed)`.
- `src/marking/answer.ts` (whole, 16 lines): the server port of `quiz.mark`.
- `src/marking/answer.test.ts:1-40`: the parity-test pattern (imports `app/quiz.js`, compares row by row).
- `src/marking/normalise.ts`: the shared normaliser.
- `app/quiz.js`
  - `:8-26` `norm`.
  - `:51-60` `mark`.
  - `:229` `initQuiz(section, items)`.
  - `:377-390` `initLesson`.
  - `:455-466` the exported `quiz` global.
- `app/retest.js`
  - `:46-49` `itemsFile`.
  - `:51-60` `rollFor`.
  - `:63-75` item lookup, which already requires `Array.isArray(i.answers)`.
  - `:188-215` `wireCheck` uses `quiz.mark`.
  - `:276-290` `fetchPack`.
- `app/map.js:340-365` load: state, next, `/content/maths/topics.json`; `:304` shows `aliases[0]` as the code.
- `src/jobs/define.ts:14-38`
  - `PRE_ATTEMPT_GUARD` and `VOICE`.
  - `src/jobs/define.test.ts:245` and `src/jobs/dan_wrong_step.test.ts:188` assert `not.toContain("maths tutor")`. Those become vacuous after the rename; update them.
- `src/content/pack.test.ts`: the maths pack invariants. The new cross-subject test mirrors its per-item loop at `:84-140`.
- `scripts/test-generators.ts:136-140`: `subjects()` already skips a subject with no `generators.js`, so no change is needed (observed).
- `content/maths/lessons/0001-U349-percentage-of-an-amount.html`: lesson skeleton to mirror. It has sections `picture`, `worked`, `method`, `watch`, `quiz[data-items]`, `teach-back`, `source`, then `/quiz.js`.
- `content/maths/LICENCE.md`: licence file shape. Its last section already says Oak material will carry OGL v3.
- `content/maths/items/1MA1-R4.json`: item shape.

### New Files to Create

**Phase A**
- `src/marking/vocab.ts`, `src/marking/sequence.ts`, `src/marking/label.ts`: one canonicaliser each (spec in Task A3).
- `src/marking/types.test.ts`: marker unit tests plus browser ↔ server parity for all three types.
- `src/api/topics.ts`: `GET /api/topics` body builder.
- `src/content/packs.test.ts`: cross-subject pack invariants over every `content/<subject>/`.

**Phase B**
- `content/science/COVERAGE.md`
- `content/science/topics.json`
- `content/science/items/8464-4.1.1.2.json`
- `content/science/lessons/0001-8464-4.1.1.2-animal-and-plant-cells.html`
- `content/science/LICENCE.md`
- `scripts/e5-science.test.ts`

### Relevant Documentation

- AQA 8464 specification PDF, https://filestore.aqa.org.uk/resources/science/specifications/AQA-8464-SP-2016.PDF, section 4.1.1.2 "Animal and plant cells". Use it for the statement id and title only. **Copy no wording** (PRD non-goal: AQA material in apps).
- Oak programme, https://www.thenational.academy/teachers/programmes/combined-science-secondary-ks4-foundation-aqa/units, lists 13 Y10 and 11 Y11 biology units (scout, 2026-09-29). This is the `COVERAGE.md` source.
- Oak unit `eukaryotic-and-prokaryotic-cells`, lessons `animal-cells-common-structures-and-specialised-cells`, `plant-cells-common-structures-and-specialised-cells` and `light-microscopy-observing-and-drawing-cells`. These give the keywords (vocab source), key learning points (lesson source) and misconceptions.
- Oak licensing guide, https://support.thenational.academy/a-guide-to-our-website-licensing:
  - Attribution form: "A [title] [lesson] by Oak National Academy licensed under Open Government Licence v3.0 (OGL)".
  - Third-party content inside Oak lessons is excluded.
  - Do not imply endorsement.
- OGL v3, https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/

### Patterns to Follow

**Browser/server twin with parity test** (`app/quiz.js:8` comment, `src/marking/answer.test.ts`). The browser copy is plain JS inside the IIFE; the TS copy lives in `src/marking/`. A test imports `app/quiz.js` for its global and compares outputs row by row. The new markers follow this pattern exactly. No bundler, and no shared module across the two.

**Per-root promise cache** (`src/api/case.ts:17-35`). `loadPacks` caches by `path.resolve(root, "content")` the same way.

**Route handler shape** (`src/server.ts` `readRoute(req, what, () => ({status, body}))`, used at `:400`). `/api/topics` uses `readRoute`.

**Error text**: a sentence naming the file, e.g. `` `${file}: not a list of topic rows` `` (`pack.ts:65`).

**Lint**: Biome `recommended` preset (`biome.json`). None of the proposed patterns is flagged: no `!` non-null assertion is proposed (`style/noNonNullAssertion`); A2 says to return an error rather than use `!`. The content JSON is formatted by Biome too, so run `bunx biome format --write content/science`.

**Comments**: one line of JSDoc that says why, with figures carrying provenance (`// observed …`).

---

## IMPLEMENTATION PLAN

### Phase A: the seam (touches `src/`, `app/`)

Makes any `content/<subject>/` loadable, servable, re-testable and marked by type. It ends with a dry run in which a throwaway subject folder leaves `bun run check` green. Commit A is the E5 baseline.

### Phase B: the science pack (touches `content/science/**`, `scripts/`, `docs/` only)

**Depends on:** Phase A committed. Phase B's commits must not touch `src/`.

---

## STEP-BY-STEP TASKS

### A1 UPDATE `src/api/case.ts`: `loadCasePack` tolerates no generators; ADD `loadPacks`

- **IMPLEMENT**:
  - In `loadCasePack`, `gens` becomes `fs.existsSync(path.join(subjectDir(subject, root), "generators.js")) ? await loadGenerators(subject, root) : {}`. The file comment says a subject may ship no generators.
  - ADD `export function loadPacks(root = process.cwd()): Promise<{ pack: CasePack; subjects: ReadonlyMap<string, string> }>`:
    - Subjects are the directories of `path.join(root, "content")` holding a `topics.json`, sorted with `localeCompare`, so maths comes before science.
    - For each subject: `await loadCasePack(s, root)`.
    - Merge: `topics` concatenated; `items` into one Map; `gens` with `Object.assign`; `subjects.set(topic.id, s)`.
    - **Throw** on a topic id, alias, or generator code that is seen twice across subjects, e.g. `` `content/${s}/topics.json: topic id ${id} is also in content/${other}` ``. Aliases must be unique because `resolveTopic` picks the first match.
    - Cache per `path.resolve(root, "content")`.
- **PATTERN**: `src/api/case.ts:17-36`.
- **IMPORTS**: `node:fs`, `node:path`, `subjectDir` from `../content/pack` (already imported).
- **GOTCHA**:
  - `subjectDir` throws on a non-`[a-z]+` directory name. Skip such directories in discovery (filter with `/^[a-z]+$/` first); a stray `.DS_Store` or `e1` must not crash start-up.
  - Keep `loadCasePack` exported and unchanged in signature. Many tests call `loadCasePack("maths")`.
- **VALIDATE**: `bun test src/api/case.test.ts`, with three new tests:
  - `loadPacks` over the repo returns maths topics with `subjects.get("1MA1/R4") === "maths"`.
  - A tmp root with two subjects sharing an alias rejects with the naming message.
  - A tmp subject with no `generators.js` loads with `gens` `{}`.
- **SATISFIES**: AC 2, AC 3.

### A2 UPDATE `src/server.ts`, `src/api/lessons.ts`, `src/mcp/tools.ts`; CREATE `src/api/topics.ts`

- **IMPLEMENT**:
  - `ServerOptions` gains `subjects?: ReadonlyMap<string, string>`.
  - The five lazy fallbacks (`:159`, `:260`, `:299`, `:333`, `:362`) become `pack ?? (await loadPacks(root)).pack`, with `ctx.root` at `:362`.
  - Start (`:546-548`): `const { pack, subjects } = await loadPacks(root); const topics = pack.topics;`. Pass `subjects` in the options.
  - `lessonUrls(root, subjects, topics)`: for each topic, `const s = subjects.get(t.id)`, `lessonFile(root, s, t.id)`. The cache key is `path.resolve(root, "content")` plus the topic ids (amended: a root-only key lets whichever caller runs first fix the result for later callers with different topics).
  - `readRoute` takes a **sync** handler (`src/server.ts:212-216`, observed). So `/api/lessons` and `/api/topics` become `GET: async (req) => { const loaded = pack && subjects ? { pack, subjects } : await loadPacks(root); return readRoute(req, "…", () => ({ status: 200, body: … })); }`. Do not make `readRoute` async; other routes use it.
  - CREATE `src/api/topics.ts`: `export function topicRows(pack: CasePack, subjects): Array<Topic & { subject: string }>`, in pack order.
  - ADD route `"/api/topics": { GET: … readRoute(req, "the topic list", …) }`.
  - `ToolContext.subject: string` → `subjects: ReadonlyMap<string, string>`. In `tools.ts:92` and `:145-153`, look up the subject per topic id. A topic id not in the map cannot occur because `topicId(ctx, code)` already refuses unknown codes; still return `{ ok: false, error: "Unknown topic: …" }` rather than using `!`.
  - The start-up MCP ctx at `:575` passes `subjects`.
- **PATTERN**: `src/server.ts:398-404` for a route; `src/api/lessons.ts` for caching.
- **GOTCHA**:
  - The route table is walked by the key-leak test ("Exported so the key-leak test walks the same table", `src/server.ts:371`). `/api/topics` must hold no config.
  - `Topic` rows carry no answers, so there is no guard impact.
  - Update `src/mcp/tools.test.ts:32` (`subject: "maths"` → `subjects: new Map(topics.map((t) => [t.id, "maths"]))`) and `src/api/lessons.test.ts`.
  - **Pin `src/server.test.ts` to maths now. This is the concrete Phase B breakage (observed at 4b5125a).** `withTemp` (`:28-38`) passes `{ root, dataDir, topics }` with no `pack`. After this task the server falls back to `loadPacks`, so in Phase B `/api/lessons` returns 22 keys, and the test at `:509-514` (`toHaveLength(opts.topics.length)`, 21) goes red. That would force a `src/` edit after `SEAM`. Fix: add `const subjects = new Map(topics.map((t) => [t.id, "maths"]));` beside `:24-25`, and make `withTemp` pass `{ root, dataDir, topics, pack, subjects }`. The start-up tests at `:858-860` and `:928` spread `opts`, so they inherit it. `src/snap.test.ts:24`, `:88` already passes `pack` (observed). The page DOM tests fake their own URLs and pack (`map-dom.test.ts:70`, `retest-dom.test.ts:99-100`, `squad-dom.test.ts:105`), so they never read the real `content/`.
- **GUARD (restated, this touches `src/mcp`)**: `read_state` keeps `seen.has(i.id) ? i : toItemView(i)` (`src/mcp/tools.ts:92-94`) unchanged; only the subject passed to `loadItems` changes from `ctx.subject` to `ctx.subjects.get(id)`. An item with no `attempt` event still reaches the model with `answers`, `working`, `mark_scheme` and `misconceptions` stripped. `/api/topics` returns `Topic` rows, which hold no item data.
- **VALIDATE**: `bun test src/server.test.ts src/mcp src/api`, with a new test: `GET /api/topics` returns 21 rows, all `subject: "maths"` (observed count at 4b5125a: 21 topics).
- **SATISFIES**: AC 2.

### A3 CREATE `src/marking/{vocab,sequence,label}.ts`; UPDATE `src/marking/answer.ts` and `app/quiz.js`

- **IMPLEMENT**: one canonical form per type. An answer is right when `canon(typed)` equals `canon(a)` for some `a` in `answers`. A misconception is named when `canon(typed) === canon(m.answer)`. Empty canon is never right.
  - `vocab`: `normaliseAnswer(s.replace(/^\s*(the|a|an)\s+/i, ""))`. Why a separate type: "the nucleus" and "nucleus" are the same word answer.
  - `sequence`: `s.toLowerCase().replace(/\b(then|and)\b/g, "").replace(/[^a-z]/g, "")`. It turns "B, D, A, C", "b then d then a then c" and "BDAC" all into `"bdac"`. Answers are written as letters, e.g. `"B, D, A, C"`.
  - `label`: `s.split(/[,;\n]/).map(vocabCanon).filter(x => x !== "").join("|")`. The pupil names the lettered parts in order, comma-separated. Every slot must match, and so must the count.
  - `markAnswer(item, typed)` takes `Pick<Item, "answers" | "misconceptions"> & { type?: ItemType }`. The choice of canon is an exported `canonFor(type)` in `answer.ts`, with a `canonFor` twin in `quiz.js` (amended). The empty-never-right rule applies to untyped items too. `type` is optional because generated items (`itemFromGenerated`, `quiz.js:62-75`) have none, and `coach.ts:124` passes those. It picks the canon with `item.type === "vocab" ? vocabCanon : …`, and `normaliseAnswer` otherwise.
  - `app/quiz.js`: ADD `vocabCanon`, `sequenceCanon` and `labelCanon` beside `norm`. Each carries a comment naming its TS twin. `mark` dispatches the same way. Export them on the `quiz` global.
- **PATTERN**: `app/quiz.js:8` twin comment; `src/marking/answer.ts`.
- **GOTCHA**:
  - Use `item.answers ?? []` in `quiz.js` `mark` as well. Today `quiz.js:54` calls `item.answers.some` with no guard.
  - `retest.js:199` and `squad.js` empty-checks use `quiz.norm(input.value)`. That stays correct: a non-empty sequence answer is non-empty under `norm`.
  - The canon functions must be byte-for-byte equivalent across the twins; the parity test is the proof.
- **VALIDATE**: `bun test src/marking`. New `src/marking/types.test.ts`:
  - Per type, a row table: right forms, misconception forms, wrong, empty.
  - The parity test runs `markAnswer` and `quiz.mark` over the same rows for items of each type, plus an untyped item.
  - **Mutation check**: change `sequenceCanon` in `quiz.js` only (drop `then` removal). Record that the parity test goes red **and** that the unit rows for the TS port stay green. That proves the parity test, not the unit test, catches twin drift.
- **SATISFIES**: AC 4.

### A4 UPDATE `src/flow/boss.ts`, `app/quiz.js`: items without `answers` are never asked

- **IMPLEMENT**:
  - `slotsFor` (`boss.ts:54`): `ids` becomes the topic's items with `(i.answers?.length ?? 0) > 0`.
  - `quiz.js` `initQuiz` (`:229`): filter `items` to those with a non-empty `answers` before rendering.
- **GOTCHA**:
  - `confidentWrongItems(state, ids)` intersects with `ids`, so a sure-wrong attempt on an answer-less item also drops out.
  - The boss stays pure. Existing boss tests use maths items, which all have answers, so none should change.
- **VALIDATE**: `bun test src/flow/boss.test.ts`, with a new test: a hand-built pack whose topic has 2 cloze items and 1 `short` item with no answers; the boss slots never name the short item.
- **SATISFIES**: AC 5.

### A5 UPDATE `src/jobs/define.ts:18`: subject-neutral persona

- **IMPLEMENT**: `"You are a maths tutor for …"` → `"You are a GCSE tutor for …"`. Nothing else in the string changes. `define.test.ts:245` and `dan_wrong_step.test.ts:188` change their `not.toContain("maths tutor")` to `"GCSE tutor"` so they still assert that Dan's voice replaces the persona.
- **GUARD (restated per CLAUDE.md)**: this edits a prompt. `PRE_ATTEMPT_GUARD` (`define.ts:14-15`) and its placement in `preAttemptSystem` are untouched. Jobs still take `ItemView` (from `toItemView`, which strips `answers`, `working`, `mark_scheme` and `misconceptions`) until an `attempt` event exists. No new job, and no new input field.
- **VALIDATE**: `bun test src/jobs`.
- **SATISFIES**: AC 6.

### A6 UPDATE `app/map.js`, `app/retest.js`: topics from `/api/topics`

- **IMPLEMENT**:
  - `map.js:350`: `getJson("/content/maths/topics.json")` → `getJson("/api/topics")`.
  - `retest.js:283`: the same change.
  - `retest.js` `itemsFile(topic)` becomes `itemsFile(row)`, returning `` `/content/${row.subject}/items/${row.id.replaceAll("/", "-")}.json` ``. `fetchPack` looks each fixed topic up in the fetched rows first, which means fetching topics before items. That is two awaits in sequence instead of one `Promise.all`: `const topics = await getJson("/api/topics")`, then `Promise.all` over the items.
- **GOTCHA**:
  - `src/marking/map-dom.test.ts` and `src/marking/retest-dom.test.ts` fake `fetch` by URL. Add `/api/topics` to their fakes, returning maths topics with `subject: "maths"`.
  - `practice.js`, `squad.js`, `practice.html`, `retest.html` and `squad.html` keep their maths paths (Non-Goals). `retest.html` still loads maths `generators.js`: a science slot never has `item: null` because science has no generator, so `rollFor` is never called for it.
- **VALIDATE**: `bun test src/marking/map-dom.test.ts src/marking/retest-dom.test.ts`
- **SATISFIES**: AC 2.

### A7 CREATE `src/content/packs.test.ts`: invariants for every subject

- **IMPLEMENT**: over `loadPacks()`, for every topic and item:
  - Topic id matches `^[0-9A-Z]+\/[0-9A-Za-z.]+(\/[a-z-]+)?$`. It has to accept both `1MA1/R9/of-an-amount` and `8464/4.1.1.2`.
  - Prerequisites resolve.
  - The items file name is `itemsFileName(id)`.
  - Every item's `type` is in the `ITEM_TYPES` record (copy the `Record<ItemType, true>` from `pack.test.ts:15-24`).
  - Items with `answers`: at least 1 answer; every misconception's `markAnswer(item, m.answer).ok === false`, using the type-aware marker; `working` is present.
  - Items without `answers`: `type` is one of `short | extended | practical-method`; `mark_scheme` is a non-empty string; `misconceptions` is `[]`, because a misconception is a typed wrong answer and code cannot compare one here.
  - Each subject has a `LICENCE.md`.
- **GOTCHA**: the maths-specific counts (21 topics, 105 items, 5 per topic) stay in `pack.test.ts`. This test must pass for maths today and for science unchanged tomorrow. That is the point of it.
- **VALIDATE**: `bun test src/content`
- **SATISFIES**: AC 3, AC 7.

### A8 VALIDATE the seam with a throwaway subject, then commit A

- **IMPLEMENT**, as a dry run with no files kept:
  - `mkdir -p content/zz/items`
  - Write `content/zz/topics.json`: one topic `ZZ1/X1`, aliases `["ZZX1"]`, tier F.
  - Write `content/zz/items/ZZ1-X1.json` in **science's exact shape**: 3 `vocab`, 1 `label` with an SVG `figure`, 1 `sequence` (each with answers, working and 1 misconception), and 1 `short` with a `mark_scheme` and `misconceptions: []`.
  - Write `content/zz/lessons/0001-ZZ1-X1-dry-run.html` with `data-items="/content/zz/items/ZZ1-X1.json"`, and `content/zz/LICENCE.md`.
  - Before running, `grep -rn 'readdirSync' src scripts` for tests that list content folders. At 4b5125a the only hits are `pack.test.ts:86` and `:181`, which are maths-pinned, and `scripts/test-generators.ts:138`, which filters on `generators.js` (observed).
  - Run `bun run check`. It must be green with nothing under `src/` edited. If a test fails because it counts topics from the real `content/`, fix that **test** now (pin it with `loadCasePack("maths")` or a fixture root). That is Phase A's job, not Phase B's.
  - Then `rm -rf content/zz`.
- **VALIDATE**: `bun run check` green with `content/zz` present, then again after removing it (observed, both runs).
- Commit: `piv-commit`, message `feat: T16 phase A: multi-subject seam, vocab/sequence/label markers`. **Record this commit's sha as `SEAM`.**
- **RULE**: any `src/` edit after `SEAM`, including a review fix, is recorded as an E5 finding in the PR body and the PRD line. `SEAM` is never moved silently. If a Phase B need forces a `src/` change, stop, amend this plan, and say so.
- **SATISFIES**: AC 1 (baseline), AC 8.

### B1 CREATE `content/science/COVERAGE.md`

- **IMPLEMENT**: the Oak coverage check for AQA 8464.
  - Source: the Oak programme `combined-science-secondary-ks4-foundation-aqa` units page, read on the day, with the date.
  - A table: 8464 section (4 Biology, 5 Chemistry, 6 Physics) → Oak unit (slug) → spec statements it covers → gaps.
  - At minimum, do biology at unit level (24 units per the scout). Do chemistry and physics at unit level if time allows; otherwise mark them "not checked" with the reason.
  - A verdict line for PRD R9 ("Oak's KS4 coverage per board is enough for science"): observed, partial, or not enough, with the count.
  - Note that Oak units are not keyed to AQA ids, so the mapping is this project's own work, and that the higher-tier programme was not checked.
- **GOTCHA**: statement titles from the AQA PDF are identifiers. Copy no AQA sentences.
- **VALIDATE**: file exists; every row names an Oak slug that resolves (spot-check 5 with `curl -sI` for a 200).
- **SATISFIES**: AC 10.

### B2 CREATE `content/science/topics.json`

- **IMPLEMENT**: `[{ "id": "8464/4.1.1.2", "title": "Animal and plant cells", "aliases": ["4.1.1.2"], "prerequisites": [], "tier": "F" }]`. The alias is the spec reference a school sheet prints (Q3).
- **VALIDATE**: `bun test src/content/packs.test.ts`
- **SATISFIES**: AC 11.

### B3 CREATE `content/science/items/8464-4.1.1.2.json`

- **IMPLEMENT**: 6 items, ids `8464/4.1.1.2#1` … `#6`. The sources below were read from the Oak lesson pages' embedded data on 2026-09-29 (observed; the scratchpad copies of the three pages are not kept). All text is reworded to the 15-year-old register, and the Oak source is named in `LICENCE.md`.
  - **#1 `vocab`, mitochondria.** Oak keyword (animal lesson): "Sub-cellular structures that contain the enzymes for respiration, and is where most energy is released in respiration." `answers: ["mitochondria", "mitochondrion"]`. Misconceptions:
    - `"cytoplasm"`: "That is the jelly where many reactions happen. Respiration has its own structure."
    - `"nucleus"`: "The nucleus does not release energy for the cell." (Amended 2026-09-29: the first wording stated #2's answer.)
  - **#2 `vocab`, nucleus.** Oak short-answer question (microscopy lesson): "Which structure contains genetic material, which controls the cell's activities?" `answers: ["nucleus"]`. Misconceptions:
    - `"DNA"`: "DNA is the molecule. The question asks for the structure that holds it."
    - `"cell membrane"`: "The membrane controls what goes in and out of the cell. That is a different job."
  - **#3 `vocab`, chloroplast.** Oak keyword (plant lesson): "contains the green pigment chlorophyll, which absorbs light for photosynthesis". `answers: ["chloroplast", "chloroplasts"]`. Misconceptions:
    - `"chlorophyll"`: "Chlorophyll is the green pigment. The question asks for the structure it sits in."
    - `"cell wall"`: "The cell wall gives strength and support. Light is absorbed somewhere else."
  - **#4 `label`.**
    - `figure`: a self-drawn inline SVG of a plant cell, with parts lettered A cell wall, B cell membrane, C nucleus, D chloroplast. No Oak diagram is used, because images can be third-party (Oak licensing guide).
    - Stem: "Name parts A, B, C and D, in that order, with commas between them."
    - `answers: ["cell wall, cell membrane, nucleus, chloroplast", "cell wall, cell membrane, nucleus, chloroplasts"]`.
    - Misconception `"cell membrane, cell wall, nucleus, chloroplast"`: "You have swapped the two outer layers." (Amended 2026-09-29: the first wording gave away part A.)
    - Keep the figure markup the same as the maths figures: an `<svg` start, no `xmlns`. `coach.js:107` parses figures as HTML.
  - **#5 `sequence`.** Oak `order` question (microscopy lesson starter quiz): "Starting with the smallest, sort the following in size order": atom, molecule, nucleus of a cell, cell. Stem lists them shuffled and lettered: "A a cell, B an atom, C the nucleus of a cell, D a molecule". `answers: ["B, D, C, A"]`. Misconception `"B, D, A, C"`: "A cell is bigger than its own nucleus. The nucleus sits inside it." (The message names the mix-up, not the order.)
  - **#6 `short`.** Built on Oak's plant-lesson misconception, "All plant cells contain chloroplasts". Question (own-written): "Root hair cells are plant cells, but they have no chloroplasts. Explain why." `mark_scheme` (own-written, 2 marks):
    - (1) Root hair cells are underground, so they get no light.
    - (2) Chloroplasts are for photosynthesis, which needs light, so they would have no use there.
    - No `answers`, `misconceptions: []`, `working` = the two points as one sentence.
  - `working` on #1–#5: one sentence each, ending on the answer. `hint` on #1–#5: one sentence naming what to look for, never the answer.
- **GOTCHA**:
  - Every stem, message, hint, working and mark scheme passes `no-ai-slop` then `humanizer` before save (`.claude/rules/content.md`).
  - British English, sentence case, no exclamation marks, and a misconception message never states the correct answer.
  - The three Oak lessons' quizzes are text-only; no third-party marking appears in the page data (observed 2026-09-29). Record in `LICENCE.md` which items adapt Oak text (#1, #2, #3, #5) and which are own-written (#4 figure and stem, #6).
  - Misconception answers must not equal a right answer under the type's canon. The A7 test checks this.
  - A boss for a no-generator topic takes 3 slots from items with answers (`RETEST_SLOTS = 3`, `src/flow/ladder.ts:39`). Items #1–#5 give 5 (derived: 3 + 1 + 1).
- **VALIDATE**:
  - `bun test src/content/packs.test.ts`
  - `bunx biome check content/science`
- **SATISFIES**: AC 11, AC 12.

### B4 CREATE `content/science/lessons/0001-8464-4.1.1.2-animal-and-plant-cells.html`

- **IMPLEMENT**: mirror the maths lesson skeleton.
  - Sections: `picture` (the key learning points from Oak), `method` (how to identify the parts), `watch` (Oak's misconceptions, reworded), `quiz` with `data-code="4.1.1.2" data-items="/content/science/items/8464-4.1.1.2.json"`, `teach-back`, and `source` (Oak attribution with lesson URLs).
  - It loads `/style.css` and `/quiz.js` and no generators.
- **GOTCHA**: `lessonFile` finds the lesson by the exact `data-items` string, `/content/science/items/8464-4.1.1.2.json`. The prose gate applies.
- **VALIDATE**: `bun -e 'import {lessonFile} from "./src/content/pack"; console.log(lessonFile(".", "science", "8464/4.1.1.2"))'` prints the file name.
- **SATISFIES**: AC 13.

### B5 CREATE `content/science/LICENCE.md`

- **IMPLEMENT**: mirror `content/maths/LICENCE.md`. It says:
  - Which files adapt Oak material, with the attribution line in Oak's form per lesson used: "Animal cells: common structures and specialised cells, a science lesson by Oak National Academy, licensed under Open Government Licence v3.0 (OGL)".
  - The link to OGL v3.
  - That third-party content in Oak lessons was not used.
  - That the diagram, sequence item and short item are own-written.
  - That `8464/…` ids are identifiers from the AQA specification, with no AQA question, mark scheme or specification text.
  - No endorsement by Oak is implied.
- **VALIDATE**: `bun test src/content/packs.test.ts` (the LICENCE check).
- **SATISFIES**: AC 12.

### B6 CREATE `scripts/e5-science.test.ts`: the topic end to end, using engine functions only

- **IMPLEMENT**: one tmp `dataDir` (realpathed, as `src/server.test.ts:28-37`), the real root `"."`, `const { pack, subjects } = await loadPacks(".")`, and a fixed clock `now = () => T`, advanced per step. All events go through `postEvent(body, dataDir, pack.topics, now)` (`src/api/event.ts:62`), which stamps `t` from `now` and resolves aliases. State comes from `currentState(dataDir)` (`src/api/state.ts`) or `replay` over the log.
  1. Day D (`T = "2026-10-05T16:00:00Z"`): post `{v:1,type:"intake",door:"sheet",topics:[{topic:"4.1.1.2",rag:"R"}]}`. Assert 201 and `state.topics["8464/4.1.1.2"]` equals `{ rung: 0, nextDue: null, rag: "R" }`.
  2. `nextStep(state, "2026-10-05", pack, 3)` (`src/flow/next.ts`): `step.kind === "lesson"` and `step.topic === "8464/4.1.1.2"`, because red comes first. Post `step.start`.
  3. Post `attempt` bodies for items #1–#5: `{v:1,type:"attempt",item,topic:"8464/4.1.1.2",correct,sure:true,answer}`, with `correct` from `markAnswer(item, item.answers[0])`, which must be `true`. Then take `nextStep` again: `kind === "continue"`; post `step.end`. Assert rung 1 and `nextDue === "2026-10-08"` (derived: D + `NEXT_DAYS[1]` = 3 days).
  4. Day D+3 (`T = "2026-10-08T16:00:00Z"`): `nextStep(state, "2026-10-08", pack, 3)` gives `kind === "boss"`. `step.boss.slots` has 3 entries, every `topic === "8464/4.1.1.2"`, every `item !== null`, none is `#6` (derived: no generator, 5 answerable items, `RETEST_SLOTS = 3`). Post `step.start`.
  5. For each slot, find the item and assert `markAnswer(item, item.answers[0]).ok`. Post `{v:1,type:"retest",topic:"8464/4.1.1.2",score:3,of:3,passed:passes(3,3)}`, then the session end from `nextStep` (`continue`). Assert rung 2 and `nextDue === "2026-10-18"` (derived: D+3 + `NEXT_DAYS[2]` = 10 days).
  6. `lessonUrls(".", subjects, pack.topics)["8464/4.1.1.2"]` is `/content/science/lessons/0001-8464-4.1.1.2-animal-and-plant-cells.html`.
  7. `toItemView(item6)` has no `mark_scheme` and no `answers` key.
  8. MCP: build a `ToolContext` `{ root: ".", dataDir, subjects, topics: pack.topics, origin: "http://127.0.0.1:1" }` and call the tools with the same `call(name, args, ctx)` that `src/mcp/tools.test.ts:128` uses (check where it is imported from before writing).
     - `open_lesson {topic:"4.1.1.2"}` returns `url` ending in the lesson path.
     - `read_state {topic:"8464/4.1.1.2"}` returns item #6 with no `mark_scheme`.
     - It returns #1 with `answers`, because an attempt for #1 exists after step 3.
- **PATTERN**: `src/server.test.ts:543-600` (the "loop" test: lesson start and end from `/api/next`, a boss three days on, retest and end). It is the same walk over the maths pack; mirror its event order and assertions.
- **GOTCHA**:
  - This file lives in `scripts/`, so it adds nothing to the E5 diff. `tsconfig.json:31` includes `scripts`, and `bun test` finds it.
  - Use each step's `start` and `end` bodies from `nextStep` verbatim, as the map does. Do not compose session events by hand.
  - An xp line follows scoring events (`appendXp`). Count topics, not log lines.
- **VALIDATE**: `bun test scripts/e5-science.test.ts`
- **SATISFIES**: AC 1, AC 11, AC 14.

### B7 VALIDATE the E5 diff; UPDATE docs

- **IMPLEMENT**:
  - Run `git diff --exit-code $SEAM HEAD -- src/` and require empty output (exit 0). Record the output in the PR body as E5 observed.
  - UPDATE `.claude/references/content-pack.md` item-type table: `vocab`, `sequence` and `label` are marked in `app/quiz.js` with TS twins in `src/marking/<type>.ts`, and state each canon rule in one line.
  - Add an E5 result line to `docs/prd/study-tutor-v2.prd.md` under E5: "Observed 2026-MM-DD: first attempt needed a seam in `src/` (9 sites + prompt + markers, commit $SEAM); after it, the science pack went in with an empty `src/` diff." Use the real date and sha.
- **VALIDATE**: `bun run check` green.
- **SATISFIES**: AC 1, AC 15.

---

## TESTING STRATEGY

### Unit Tests
- Markers: row tables per type, and browser ↔ server parity (A3).
- `loadPacks`: merge, duplicate refusal, missing generators (A1).
- `/api/topics` (A2); boss filter (A4); persona (A5); cross-subject pack invariants (A7).

### Integration Tests
- `scripts/e5-science.test.ts` (B6). The path is intake event → state → next → attempts → boss → mark → retest → rung, over the real `content/` and a tmp `data/`. It follows the app's own order: the map reads intake, the lesson posts attempts, the boss runs on `nextDue`.
- `map-dom` and `retest-dom` tests with the `/api/topics` fake (A6).

### Edge Cases
| Edge case | Verified in |
|---|---|
| Subject folder with no `generators.js` | `case.test.ts` (A1) |
| Alias or topic id repeated across subjects | `case.test.ts` (A1) |
| Non-word directory under `content/` (e.g. `.DS_Store`) | `case.test.ts` (A1) |
| Sequence typed as "BDAC", "B, D, A, C" and "b then d then a then c" | `types.test.ts` (A3) |
| Label with the right words in the wrong order, and with a missing slot | `types.test.ts` (A3) |
| Vocab with a leading "the" | `types.test.ts` (A3) |
| Empty answer never right, for all types | `types.test.ts` (A3) |
| Generated item with no `type` still marks as before | `types.test.ts` parity, untyped row (A3) |
| `short` item never in a boss or rendered in a lesson quiz | `boss.test.ts` (A4); Level 4 step 3 (quiz render) |
| Misconception equal to a right answer under the type canon | `packs.test.ts` (A7) |
| A third subject added later | A8 dry run |

---

## VALIDATION COMMANDS

### Level 1: Syntax and style
`bunx tsc --noEmit && bunx biome check .`

### Level 2: Unit tests
`bun test src/marking src/content src/api src/flow/boss.test.ts src/jobs src/mcp`

### Level 3: Integration and the E5 gate
- `bun test scripts/e5-science.test.ts`
- `bun run check`
- `git diff --exit-code $SEAM HEAD -- src/`: E5, must print nothing.
- `bun scripts/test-generators.ts`: maths only, unchanged (science has no generators).

### Level 4: Manual validation (`bun run dev`, fresh `data/`)

Steps 2–4 follow the app's own order. Checked at 4b5125a: `pickLesson` (`src/flow/next.ts:34-50`) puts red topics first. The map posts the `start` and `end` bodies that `/api/next` hands it (`app/map.js:1-3`). A lesson `session` end with a topic moves rung 0 → 1 and sets `nextDue` +3 days (`src/events/replay.ts:89-98`, `NEXT_DAYS[1] = 3`). A red intake at rung 0 changes only `rag` (`replay.ts:140-148`, `afterRed(0) = 0`).

1. Open `/map.html`. There are 22 cards. "Animal and plant cells" shows code `4.1.1.2`.
2. In the browser console: `fetch("/api/event",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({v:1,type:"intake",door:"sheet",topics:[{topic:"4.1.1.2",rag:"R"}]})}).then(r=>r.status)`. It returns `201`; the server stamps `t` (`src/api/event.ts:62-90`). Reload: the science card is red, and the "Today" step is a lesson on "Animal and plant cells".
3. Start that lesson from "Today" (the map posts the lesson `start`). On the lesson page:
   - The quiz shows 5 questions. The short item is not rendered.
   - The label question shows its SVG (`quiz.js:127-133`).
   - Answer the sequence item as "b then d then c then a" and see it marked right.
   - Answer the mitochondria vocab item with "cytoplasm" and see the named message.
   - Back on the map, "Today" is "continue"; end it (the map posts the lesson `end`). The card shows "learning".
4. Open `/map.html?day=<today + 3>`. "Today" is the boss (`next.ts` returns the boss before any lesson). Start it; `/retest.html?day=<today + 3>` passes `?day=` to `/api/next` (`retest.js:153`). There are 3 unlabelled science questions. If the label question is drawn, its SVG shows (`retest.js:161-165`). Answer all of them right. `/map.html?day=<today + 3>` shows the card on "1 pass".
5. MCP `open_lesson` and `read_state` are covered by B6 step 8 (automated).

### Level 5
Run `agent-browser` for steps 1–3 with screenshots. Scroll into view before clicks (memory: agent-browser scroll before click).

---

## ACCEPTANCE CRITERIA

1. [ ] E5: `git diff --exit-code $SEAM HEAD -- src/` is empty; the output is in the PR body.
2. [ ] The server, map, re-test, lesson list and MCP tools read every `content/<subject>/` with no subject name in `src/` or in `app/map.js` and `app/retest.js`.
3. [ ] A subject with no `generators.js` loads; a duplicate id or alias across subjects is refused by name.
4. [ ] Deterministic markers for `vocab`, `sequence` and `label` exist in `src/marking/` and in `app/quiz.js`, with a parity test.
5. [ ] An item with no `answers` never enters a boss or a lesson quiz.
6. [ ] The job persona names no subject, and the pre-attempt guard is unchanged.
7. [ ] A cross-subject pack test holds for maths and science.
8. [ ] The throwaway-subject dry run (A8) was green.
9. [ ] **Owed by #19**: the science topic runs through all three intake doors (sheet, interview, cold diagnostic). This ticket proves the shared landing (an `intake@1` event by alias → map).
10. [ ] `content/science/COVERAGE.md` records Oak coverage for AQA 8464 with a dated verdict on R9.
11. [ ] `content/science/topics.json` is keyed `8464/4.1.1.2`. The items are 3 vocab, 1 label, 1 sequence and 1 short with a `mark_scheme`.
12. [ ] `content/science/LICENCE.md` carries the OGL v3 attribution per Oak lesson, the list of own-written items, and no AQA text.
13. [ ] The science lesson page renders and posts attempts.
14. [ ] One re-test cycle passes in `scripts/e5-science.test.ts`: intake → attempts → boss → retest → rung 2.
15. [ ] `bun run check` is green, and the E5 result line is in the PRD.

---

## COMPLETION CHECKLIST

- [ ] Tasks A1–A8 done and committed as `SEAM`; B1–B7 committed after it.
- [ ] Every VALIDATE ran; the A3 mutation check recorded both halves.
- [ ] Prose passed `no-ai-slop` then `humanizer`.
- [ ] Level 4 steps 1–5 performed.
- [ ] PR body states E5 observed, the guard restatement (A5), and "Refs #19" for AC 9. Write "Refs", not a negated "closes" (memory: a negated close keyword still closes).

---

## OPEN QUESTIONS / ASSUMPTIONS

All risks raised at first draft are resolved. Each entry names what closed it.

- **R1 (was Q1): the `short` item cannot be attempted.** Closed by scope and ownership.
  - In T16 the item is validated content that is never asked: A4 keeps it out of the boss and the lesson quiz, and `misconceptions: []` keeps it out of coach and case (`coach.ts:58`, `detective.ts:64`).
  - The live path (`attempt@2` with `correct: null`) is **#49**, created 2026-09-29, so nothing unowned remains. The worst case, an unmarked answer logged as wrong, cannot happen, because no page can attempt the item.
- **R2: a `src/` edit forced after `SEAM`.** Closed by finding the one concrete breakage now (A2's `server.test.ts` pin, observed at `:28-38` and `:509-514`) and by the A8 dry run in science's exact shape. The A8 RULE covers anything left: record it openly and never move `SEAM` silently.
- **R3: three intake doors.** Owned by #19 (AC 9), with the diagnostic fallback note posted on #19 on 2026-09-29. T16 proves the shared landing: `intake@1` by alias, replayed to the map, then a red topic made the next lesson (B6 steps 1–2).
- **R4 (was Q4): the Oak `order` question.** Closed. It exists in the microscopy lesson (observed in the page data, 2026-09-29) and is item #5.
- **Q2: the `SEAM` sha under squash-merge.** Closed. The E5 diff is run on the branch before merge, and its output goes in the PR body and the PRD line; that record is the evidence.
- **Q3: the alias `4.1.1.2`.** Assumed that a school science sheet prints spec references. If not, a second alias goes in `topics.json`, which is content only. `loadPacks` refuses a collision with maths aliases (`U`-codes, observed: no maths alias starts with a digit).
- **Q5: the map's order.** Closed. Red comes first in `pickLesson`, then pack order (maths before science), which B6 step 2 pins.

## NOTES

**Why merge packs rather than make `CasePack` subject-aware.** Every consumer (`boss`, `nextForDay`, `casePool`, `pickItem`, `squad`, `snap`, `chat`) takes one `CasePack` and treats topic ids as global. Topic ids are globally unique by spec prefix (`1MA1/`, `8464/`). Merging keeps all flow code unchanged, and the only place that needs the subject is a URL (lesson, items file), which the `subjects` map supplies. A `subject` field on `CasePack` would break every hand-built test fixture for no behavioural gain.

**Why one text box for all three types.** Rendering drag-to-order or drop-down labels means new DOM in `quiz.js`, `retest.js` and `squad.js`, three pages with their own DOM tests. A canonical-form marker keeps every page as it is, and `quiz.mark` is the only change the pages see. The cost: a label item is typed, not clicked. Revisit if E5 use shows pupils fighting the comma format.

**Known limit of the seam.** `practice`, `squad` and the `generators.js` script tags stay maths. A second subject with generators would need `window.GEN` merged across files (`content/maths/generators.js:1776` assigns `root.GEN = GEN`, overwriting). Not needed for E5; write it up in the PR as the next seam.

**E5 is already half answered.** The claim "adding a subject changes nothing in `src/`" failed on first contact. That is recorded in the PRD line in B7, not hidden by the phase split.

**Size (expected, a sum of per-task guesses).** Phase A is expected at ~350 lines including tests (A1 60, A2 80, A3 120, A4 20, A6 30, A7 60). Phase B is ~450 lines (the items file ~150, lesson ~120, COVERAGE ~60, LICENCE ~30, e5 test ~120).

## AMENDMENTS

- 2026-09-29: risk pass before implementation. Found and fixed the one concrete Phase B breakage: `src/server.test.ts` loads packs by default, which is pinned in A2. Pinned the B3 items to Oak page data read that day (the `order` question exists). Rewrote B6 and Level 4 against the verified flow (`nextStep`, `postEvent` with `now`, and the replay rung and `nextDue` arithmetic). Opened #49 for the short-item attempt. The open questions are now all closed or owned.
- 2026-09-29, implementation (`SEAM` 4a82354; report `.claude/reports/t16-science-pack-oak-report.md`). What shipped differs from the tasks above in these ways:
  - A2 also updated `src/mcp/server.test.ts` (it builds a `ToolContext` too), `src/marking/retest.test.ts` (`itemsFile` takes a row) and the first `lessons.test.ts` test (now over every subject through `loadPacks`). `apiRoutes` gained a small `packs()` helper.
  - A8 ran twice. The second run used a zz fixture with alias `9.9.9.9`, science's item mix and a real lesson marker, and ran the drafted E5 walk against it before `SEAM`. A picker audit confirmed that detective, squad, chat, coach, boss and the fresh-set button all guard on a missing generator.
  - B1 mapped chemistry and physics at unit level too.
  - B4's crumb links to `/map.html` ("Map"), because `index.html` lists maths only.
  - B3 and B4 prose: `no-ai-slop` and `humanizer` ran after the first Phase B commit. They fixed five findings (F1–F5, as amended in B3) and split one list of three in the lesson aim. All edits stayed in `content/science`.
  - A post-`SEAM` probe of case, coach and chat on the merged pack found nothing to fix. E5 `src/` diff: empty.

