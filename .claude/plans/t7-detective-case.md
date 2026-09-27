# Feature: T7 — O5 detective case: daily case, confidence bet, hypercorrection, calibration

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

One three-minute puzzle a day, no model needed. The server picks the day's case in code
(`src/flow/detective.ts`), the page (`app/case.html` + `app/case.js`) shows it, the pupil answers with a
1 to 3 bet, and one `case` event lands in the log. Two kinds of case:

1. **Planted mistake.** A fictional pupil, Kai, has answered an item from the pack. The page shows the
   item's stem (and figure and scaffold when it has them) and Kai's answer, which is one of the item's
   `misconceptions[].answer` three times in four and the right answer one time in four. The pupil picks
   the note that names Kai's mistake from the item's misconception messages plus "No note needed. The
   answer is right." An item with no misconceptions can never be picked.
2. **Invent the rule.** For a topic flagged `concept` in `topics.json`, three contrasting instances
   (stem and answer from three seeded rolls of the topic's generator, no working shown) and the question
   "What is the rule?". Options are the topic's authored `rule` and its `distractors`, shuffled.

Every answer carries a bet of 1, 2 or 3. Bet 3 and wrong (confident-wrong) does two things: the page
immediately shows a second case on the same topic with fresh numbers from the generator (the re-ask),
and tomorrow's case comes from that topic again (the seed). Each answer is recorded with its bet, so
the calibration pairs accumulate in state, and the page shows "You predicted n, you scored m" over the
last seven answers.

## User Story

As a pupil
I want a short daily puzzle where I spot someone else's mistake and say how sure I am
So that the mistakes I am most confident about get found and come back until they are fixed

## Problem Statement

T4 records lesson attempts and T5 will turn them into a ladder, but nothing gives the pupil a reason to
open the tutor on a day with no lesson due, and nothing measures how well the pupil's confidence
matches their score. PRD O5 names both: a Wordle-slot habit and a calibration gap that should halve in
four weeks. E1 (T0) shipped this shape on the v1 folder with `localStorage`; here the record is the
event log and the case is chosen by the binary.

## Solution Statement

- `src/flow/detective.ts`: pure functions. `casePool(pack)` lists every eligible source (an item with
  at least one misconception, or a concept topic). `pickCase(day, seed, pool)` chooses the topic from an
  FNV-1a hash of the day (or the seeded topic when there is one), then the source within the topic from
  a hash of day and topic; a concept topic gives its rule case on half its days. `buildCase(source, day, pack)`
  turns a source into the case the page renders, with a seeded `lcg` for Kai's answer, the option shuffle
  and the generator rolls. `buildReask(source, day, pack)` gives the same-topic second case.
  `calibration(records, n)` sums the last n bets and the bets won.
- A new event `case@1` in `src/events/types.ts`, a reducer case in `replay.ts` that records one case per
  day (`state.cases[day]`), carries the seed for the next day (`state.caseSeed`) and counts the day in
  the flame. `State.shape` goes to 2.
- One route, `GET /api/case`, in `src/api/case.ts`, wired in `server.ts` beside `/api/state`. It returns
  the day, the case, the re-ask, today's record when the case is already answered, and the calibration
  numbers. The page marks in the browser (the same trust model as `quiz.js`: the answer is in the page
  and hidden until the check) and posts the event through the existing `POST /api/event`.
- `app/case.html` + `app/case.js`, built the way `practice.html`/`practice.js` and `quiz.js` build DOM.
  `index.html` gets a link to the case.
- `content/maths/topics.json`: three topics gain `concept: { rule, distractors }`; `Topic` in
  `src/content/types.ts` and `loadTopics` learn the optional field.

## Out of Scope / Non-Goals

- Not included: `session` start/end events for mode `case`, XP for a case, or `/api/next` knowing about
  cases. T5 (#7) owns `src/flow/session.ts`, `xp.ts`, `next.ts`; when it lands it can read
  `state.cases` (see Forward-references). A case counts in the flame here because the flame reducer
  already exists and a case is real work (PRD O5, v1 `case.js` counted it).
- Not included: a model job of any kind. O5 "works with no model" (PRD). Nothing in this ticket touches
  `src/jobs`, `src/mcp` or a prompt.
- Not included: a level map, a "Map" crumb target or the weekly flame display (T6, #8). The crumb points
  at `/` the way the lessons' Progress crumb does after T4.
- Not included: free-text rule invention marked by a model. The rule case is multiple choice so it marks
  in code (base constraint 3). See Notes N2.
- Not included: cases for `short`, `extended` or `practical-method` items (none exist in the maths pack;
  `observed` 2026-09-27, all 105 items are `cloze`). The pool filter takes any item with `answers`,
  `working` and a misconception, so a future pack needs no engine change.
- Not included: a per-week calibration gap in state. The week split is `derived` by whoever reads
  `state.cases` (T15 digest); the page shows the last seven answers (T0's shape).
- Not changing: `attempt@1`, the `Sure` control in `quiz.js`, `state.calibration` (the Sure/correct
  counts from attempts), `state.confidentWrong` (attempt answers with seeds, which T5's boss reads). A
  case pick is not an attempt and does not enter either. See Q2.
- Not changing: `generators.js`, `items/*.json`, lessons, reference sheets, `PORTS`, `refuseForeign`.
- Not changing: `scripts/synth-events.ts` (no case lines in the synthetic log; the replay fixture covers
  the reducer) and `six-weeks.jsonl` (its hand-derived expectations stay as they are; case reducer tests
  use their own lines).

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: `src/flow/detective.ts` (new), `src/events/{types,replay}.ts`,
`src/api/case.ts` (new), `src/server.ts`, `src/content/{types,pack,generators}.ts`, `app/`,
`content/maths/topics.json`, `.claude/references/{events,content-pack}.md`
**Dependencies**: none new. Bun 1.3.4 (`observed` 2026-09-27, `bun --version`), TypeScript 7,
Biome 2.5.14.

## Related Work

**Implements**: #9 (T7)   ·   **Epic**: #1, `docs/prd/study-tutor-v2.architecture.md` (D3, D5, D7),
`docs/prd/study-tutor-v2.prd.md` O5 and the calibration metric, `docs/tickets/study-tutor-v2.md` T7

**Back-references** (plans this builds on or inherits decisions from):

- `.claude/plans/e1-map-and-detective-case-v1-folder.md` - Why: T0's `case.js` is the page shape (Kai's
  answer, options, bet 1 to 3, re-ask on bet 3 and wrong, seed for tomorrow, "you bet B and won W"). Its
  pure functions (`hash`, `buildCase`, `todaysCase`, `calibration`) are re-cut here in TypeScript on the
  server. Its `third()` pronoun rewrite is dropped (Notes N1).
- `.claude/plans/t2-events-append-replay.md` - Why: the new-event recipe (union, `FIELDS`, `KEYS`,
  fixture, reducer case, replay test) and the `shape` rule.
- `.claude/plans/t3-maths-content-pack.md` - Why: item shape, `itemsFileName`, `loadGenerators(root)`.
- `.claude/plans/t4-server-and-lesson-bridge.md` - Why: route pattern (`src/api/*.ts` thin over
  `src/events`), `refuseForeign`, static pages, `quiz.js` marking in the browser with the answer hidden
  until the check, `practice.js` DOM building.

**Forward-references** (plans that extend or supersede this — append as follow-ups get created):

- T5 (#7): `state.cases` and `state.caseSeed` are readable by `next.ts` (a case due today is a step
  the deterministic next can offer); `session` events for mode `case` are T5's to wire.
- T6 (#8): the map shows "case done today" from `state.cases[today]`; the case page's crumb gets
  `/map.html` as a target.
- T15 (#17): the weekly calibration gap is derived from `state.cases` (Notes N4 gives the arithmetic).

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `src/events/types.ts` (lines 1-11 `EVENT_TYPES`; 16-27 `SessionV1` mode union already holds `"case"`;
  77-87 `Event` union; 117-149 `FIELDS`; 153-163 `KEYS`; 168 `_complete` compile check; 174-196
  `parseEvent`) - Why: the new `case@1` goes into every one of these tables, and `tsc` fails until it does
- `src/events/replay.ts` (lines 23-43 `Calibration` and `State`; 55-61 `work` counts a London day in the
  flame; 63-137 `CASES` one reducer per `type@v`; 140-168 `replay` and the `dict()` maps) - Why: the
  reducer case, the two new `State` keys and the `shape` bump
- `src/events/replay.test.ts` (line 56 `expect(s.shape).toBe(1)`; 59-65 the guard that state carries no
  answer key; 100-115 the fixture-per-version replay test) - Why: line 56 changes to 2; the guard must
  stay green with the case record in state; the new fixture must replay with nothing skipped
- `src/events/types.test.ts` (lines 8-27) - Why: `test.each(EVENT_KEYS)` demands
  `__fixtures__/case.v1.jsonl` exist and parse
- `src/events/__fixtures__/attempt.v1.jsonl` - Why: fixture line shape (key order `v, t, type, ...`)
- `src/mcp/clock.ts` (`utcNow`, `localDay`, `isoWeek`) - Why: the route's "today" is `localDay(utcNow())`;
  the reducer never reads a clock
- `src/api/state.ts` (all 12 lines) and `src/api/event.ts` (lines 25-52) - Why: the route module shape
  (pure function taking `dataDir`, returning a status and a body) that `src/api/case.ts` mirrors
- `src/server.ts` (lines 10-14 `ServerOptions`; 66-71 `json`; 82-95 `refuseForeign`; 97-107 `getState`;
  126-150 `startServer` with `routes`) - Why: the one new route is registered at line 133-138 and
  handled like `getState`
- `src/server.test.ts` (lines 20-53 `withTemp`/`withServer`; 99-121 static test; 176-250 API tests) -
  Why: the route test pattern (a real server on port 0, `fetch`)
- `src/content/types.ts` (lines 19-25 `Topic`; 28-31 `Misconception`; 33-52 `Item`; 63-71 `Generated`
  and `Generator`) - Why: `Topic.concept` and the `CasePack` type are added here; `buildCase` reads
  `Item` and `Generated`
- `src/content/pack.ts` (lines 5-7 `itemsFileName`; 13-17 `subjectDir`; 19-38 `loadTopics` with its shape
  check) - Why: `loadItems` is added beside `loadTopics` with the same shape-check style; `loadTopics`
  gains the optional `concept` check. `loadCasePack` does NOT go here: `generators.ts:2` imports
  `subjectDir` from this file, so a `loadGenerators` import back would be a runtime cycle
  (`observed` 2026-09-27 from the two import lines); it lives in `src/api/case.ts`
- `src/content/generators.ts` (lines 8-27) - Why: the memoised loader pattern (`Map` keyed by file);
  `lcg` moves here
- `scripts/test-generators.ts` (lines 11-17 `lcg`) - Why: becomes a re-export so `src/marking/quiz.test.ts`
  line 3 and line 109 of this file keep working
- `src/content/pack.test.ts` (lines 19-30 `allItems`; 32-49 topics test; 51-98 items test) - Why: the
  topics test asserts the row fields; the `concept` field must not break it, and a new assertion covers
  it
- `app/quiz.js` (lines 29-35 `lcg`; 37-50 `escapeHtml`; 78-99 `NOT_SAVED` and `postAttempt`; 111-160
  `buildItem`, in particular the `figure` via `innerHTML` and the `scaffold` as `.working.faded`; 442 the
  `root.quiz` export) - Why: `case.js` mirrors the DOM building, the post shape and the "hidden until
  check" invariant, and exports its pure helpers the same way for a Bun test
- `app/practice.html` and `app/practice.js` (all) - Why: the page skeleton (`main.lesson.practice`,
  header with crumb, sections, script tags at the end) and the `fetch(...).catch` message wording
- `app/index.html` (line 17) - Why: the case link goes beside the practice link
- `app/style.css` (lines 178-275 the `.quiz` rules; 396 `footer`) - Why: the case page reuses `.quiz .q`,
  `.stem`, `.feedback`, `.working`, `.working.faded`, `.confidence`, `.right`/`.wrong`; five small rules
  are appended for options, instances and the bet
- `content/maths/topics.json` (all 21 rows) - Why: three rows gain `concept`
- `content/maths/items/1MA1-R9-of-an-amount.json` (first two items) - Why: the item shape a case is built
  from (`stem`, `scaffold`, `hint`, `answers`, `working`, `misconceptions`)
- `content/maths/generators.js` (lines 1-15 the contract; 497-559 `GEN.U980`; 728-800 `GEN.U377`;
  1270-1316 `GEN.U721`) - Why: the three concept topics' generators; `answers[0]` and `stem` make an
  instance; `wrong` makes the re-ask's misconceptions
- `.claude/references/events.md` (lines 26-28) and `.claude/references/content-pack.md` (lines 9, 23) -
  Why: both are updated in this ticket
- `.claude/rules/content.md` - Why: every pupil-facing string in `case.html`, `case.js`, the three rules
  and their distractors passes its register rules and the `no-ai-slop` then `humanizer` pass
- `~/Desktop/Matis_study_tutor/assets/case.js` and `case.html` (v1 donor, read only) - Why: the page
  copy and flow this re-cuts; do not copy `third()`, `localStorage` or the flame/opens code

### New Files to Create

- `src/flow/detective.ts` - pool, pick, build, re-ask, calibration; pure, no clock, no file
- `src/flow/detective.test.ts` - the AC tests (no-misconception item never appears; same day and seed
  give the same case; calibration; re-ask shape; size)
- `src/api/case.ts` - `loadCasePack(subject, root)` (memoised composition of the three content loaders)
  and `caseForDay(dataDir, pack, day)` composing state and detective
- `src/api/case.test.ts` - route module test with a temp `data/` (mirrors `src/api/state.test.ts`)
- `src/events/__fixtures__/case.v1.jsonl` - two lines, a first answer and a re-ask
- `app/case.html`, `app/case.js` - the page
- `src/marking/case.test.ts` - loads `app/case.js` under Bun the way `quiz.test.ts` does and checks the
  exported pure helpers (`calibrationLine`, `eventFor`)

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- `docs/prd/study-tutor-v2.prd.md` O5 (lines 143-150) and the metrics table (line 229) - Why: the
  mechanism (planted mistake or invent the rule, bet, re-ask, seed, calibration line) and the metric
- `docs/prd/study-tutor-v2.architecture.md` D5 (lines 99-109: misconceptions feed O5), D7 (121-125), and
  "Code holds the flow" (55-60) - Why: what is inherited, not re-decided
- [Bun.serve routes](https://bun.sh/docs/api/http#routing) - Why: the `routes` object with per-method
  handlers, already used at `server.ts:133`
- [FNV-1a 32-bit](https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function#FNV-1a_hash)
  - Why: the day hash; the same constants as v1 `case.js` (`0x811c9dc5`, `0x01000193`)
- Butler, Fazio & Marsh 2011 (hypercorrection): https://link.springer.com/article/10.3758/s13423-011-0173-y
  - Why: the reason a confident-wrong answer is re-asked at once and again tomorrow

### Patterns to Follow

**A new event** (`.claude/references/events.md`, T2 plan Tasks 3-4, 8): add to `EVENT_TYPES`, a
`CaseV1` type, the `Event` union member, a `FIELDS["case@1"]` predicate, a `KEYS["case@1"]` list (the
`_complete` type fails if a field is missed), a fixture file, a `CASES["case@1"]` reducer, a replay
test. Key order in the fixture: `v, t, type, ...own fields`.

**A route module** (`src/api/state.ts`): a pure-ish function taking `dataDir` and what it needs,
returning data; the `server.ts` handler wraps it with `refuseForeign`, `json(200, ...)` and a `try` that
turns a throw into `json(500, { error: "Could not ..." })` with `console.error` (PR #26 F6).

**A loader** (`src/content/generators.ts:8-27`): memoised in a module `Map` keyed by the resolved file,
`root` a parameter so the binary reads beside itself (D10).

**Browser JS** (`app/quiz.js`, `app/practice.js`): an arrow IIFE, `const`/`let`, DOM via
`createElement`/`textContent`, `innerHTML` only for pack SVG (`figure`) and never for a string from
the pupil, a `root.<name> = { ...pure helpers }` export at the end, nothing touching `document` at load
time so a Bun test can `await import()` the file. Biome lints `app/*.js` (only `generators.js` is
excluded, `biome.json` overrides), so no `var`, no unused variables, template literals over `+`.

**Fetch failure copy** (`practice.js:46-49`): "... did not load. Check the tutor window is still open."
and `NOT_SAVED` (`quiz.js:78`).

**Tests** (`src/api/state.test.ts`, `src/server.test.ts`): `withTemp` with a realpathed temp dir; a real
server on `[0]`; content read from the repo root under `bun test`.

**Naming**: files kebab-case, functions camelCase, event fields short nouns, state maps via `dict()`.

**Pupil-facing text**: sentence case, no exclamation marks, no emoji, British English, second person for
the pupil, the fictional pupil is called Kai (no item stem or message uses the name; `observed`
2026-09-27 over all 105 items: Jo 2, Sam 6, Kai 0).

---

## IMPLEMENTATION PLAN

### Phase A: Content types and loaders

`Topic.concept`, `loadTopics` check, `loadItems`, `lcg` moved to `src/content/generators.ts`, the three
concept rows in `topics.json`.

### Phase B: The event and the state

**Depends on:** nothing in Phase A (different files). **Independent of:** Phase A.

`case@1` in `types.ts`, fixture, reducer, `shape: 2`, replay tests, `events.md`.

### Phase C: The flow

**Depends on:** Phase A (types, loaders) and Phase B (`State.cases`, `State.caseSeed`).

`src/flow/detective.ts` and its tests.

### Phase D: The route

**Depends on:** Phase C.

`src/api/case.ts`, `server.ts` registration, route tests.

### Phase E: The page

**Depends on:** Phase D for manual validation; the Bun test of `case.js` helpers depends on nothing.

`app/case.html`, `app/case.js`, `style.css` additions, `index.html` link, `case.test.ts`.

### Phase F: Docs and gate

`content-pack.md`, `events.md` (if not done in B), `bun run check`, manual validation.

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### 1. UPDATE `src/content/types.ts`

- **IMPLEMENT**: on `Topic` (line 19) add
  ```ts
  /** Set only on a concept topic: the rule three contrasting instances show, and wrong rules a pupil might invent. Both are pupil-facing text. */
  concept?: { rule: string; distractors: string[] };
  ```
  and at the end of the file
  ```ts
  /** A subject's topics, every topic's items and its generator table: what the detective case reads. */
  export type CasePack = {
    topics: readonly Topic[];
    items: ReadonlyMap<string, readonly Item[]>; // topic id → its items
    gens: Readonly<Record<string, Generator>>; // generator code (aliases[0]) → generator
  };
  ```
- **PATTERN**: optional fields on `Item` (lines 38-49) carry a one-line doc comment each.
- **GOTCHA**: `CasePack` sits in `content/types.ts`, not in `flow/detective.ts`, so `src/api` and
  `src/flow` both import it from content and no `content → flow` edge exists.
- **GOTCHA**: `ItemView` is unchanged; `concept` sits on the topic, not the item, so nothing narrows an
  answer.
- **VALIDATE**: `bunx tsc --noEmit`
- **SATISFIES**: AC 3 (concept flag).

### 2. UPDATE `src/content/pack.ts`

- **IMPLEMENT**:
  1. In `loadTopics` (line 27-34) extend the row predicate: `concept` is `undefined`, or an object with
     `typeof rule === "string"` and `distractors` an array of at least one non-empty string. A row that
     fails still throws `not a list of topic rows`.
  2. Add
     ```ts
     /** The items file of one topic; a topic with no file is an empty list, never a throw (a pack may add a topic before its items). */
     export async function loadItems(subject: string, topicId: string, root = process.cwd()): Promise<Item[]>
     ```
     reading `path.join(subjectDir(subject, root), "items", itemsFileName(topicId))` with `Bun.file(...)`;
     `exists()` false → `[]`; shape check: array of objects with string `id`, `topic === topicId`, string
     `stem`, array `misconceptions` → else throw `${file}: not a list of items`.
- **PATTERN**: `loadTopics` lines 19-38 (`Bun.file(file).json()`, `shaped`, throw with the file name).
- **IMPORTS**: `Item` from `./types` (already a type import there).
- **GOTCHA**: `subjectDir` refuses a non-word subject; `topicId` comes from `topics.json`, never a URL,
  so `itemsFileName` needs no further guard. Do not cache here: `detective` gets the whole pack once at
  server start through Task 12's loader.
- **VALIDATE**: `bun test src/content/pack.test.ts` after Task 3 adds the assertions.
- **SATISFIES**: AC 1 (pool built from items), AC 3.

### 3. UPDATE `src/content/pack.test.ts`

- **IMPLEMENT**: in the topics test add: exactly three rows carry `concept` (`observed` after Task 5),
  each with a non-empty `rule` and 2 `distractors`, none equal to the rule. Add a test: `loadItems("maths",
  "1MA1/R9/of-an-amount")` returns 5 items whose `topic` is the id; `loadItems("maths", "1MA1/none")`
  returns `[]`; a temp pack with `[{"id":1}]` rejects with `not a list of items`.
- **PATTERN**: the temp-pack test in `src/content/generators.test.ts` lines 47-60.
- **VALIDATE**: `bun test src/content/pack.test.ts`
- **SATISFIES**: AC 3.

### 4. REFACTOR `lcg` into `src/content/generators.ts`

- **IMPLEMENT**: move `lcg` (`scripts/test-generators.ts:11-17`) to `src/content/generators.ts` as an
  export with its doc comment; in `scripts/test-generators.ts` replace the definition with
  `import { lcg } from "../src/content/generators";` plus `export { lcg };`, so the local use at line
  109 and the two test imports keep working.
- **GOTCHA**: `src/marking/quiz.test.ts:3` imports `lcg` from the script and its line 56 test compares it
  with the browser copy; both must stay green. Server code importing from `scripts/` is the wrong
  direction, which is why the move happens rather than a third copy.
- **VALIDATE**: `bun test src/marking/quiz.test.ts src/content/generators.test.ts`
- **SATISFIES**: AC 2 (seeded, reproducible cases).

### 5. UPDATE `content/maths/topics.json`

- **IMPLEMENT**: add `concept` to three rows. Text below is the draft; run `no-ai-slop` then `humanizer`
  on it before saving (rules/content.md), keeping sentence case and no exclamation marks.
  - `1MA1/A12` (Identifying graphs): rule "The highest power of x decides the shape. The other numbers
    only move or stretch it." distractors ["The number in front of x decides the shape.", "The number on
    the end decides the shape."]
  - `1MA1/A9` (Equations of parallel lines): rule "Parallel lines keep the same number in front of x.
    Only the number on the end changes." distractors ["Parallel lines keep the same number on the end.",
    "Parallel lines have numbers in front of x that add up to zero."]
  - `1MA1/R10` (Direct proportion): rule "Divide the cost by the number and you get the same answer every
    time." distractors ["Take the number away from the cost and you get the same answer every time.",
    "Each extra one adds one pound."]
- **PATTERN**: existing rows; put `concept` after `tier`.
- **GOTCHA**: a rule states a rule, not an answer to any item, so the "never an answer before an attempt"
  rule holds. Three topics is the ticket's floor, not a ceiling (Q3). Two distractors, so the rule case
  has three options and one bet, the same size as a mistake case.
- **VALIDATE**: `bun test src/content/pack.test.ts` (Task 3's assertion)
- **SATISFIES**: AC 3.

### 6. UPDATE `src/events/types.ts`

- **IMPLEMENT**:
  1. `EVENT_TYPES`: add `"case"` after `"usage"` (line 10).
  2. Type:
     ```ts
     export type CaseV1 = Line<"case", 1> & {
       day: string; // the London day the case was picked for (YYYY-MM-DD), so an answer after midnight still lands on its case
       kind: "mistake" | "rule";
       topic: string;
       item?: string; // the item behind a mistake case; absent for a rule case
       pick: string; // the option text the pupil chose
       bet: 1 | 2 | 3;
       correct: boolean;
       reask: boolean; // the second case after a confident-wrong first answer
     };
     ```
     Add `CaseV1` to the `Event` union (line 77-87).
  3. `export const isDay = (x: unknown): x is string => str(x) && /^\d{4}-\d{2}-\d{2}$/.test(x) &&
     new Date(`${x}T00:00:00Z`).toISOString().slice(0, 10) === x` (the same rolling check as `t` at
     lines 183-191; also used by the route in Task 15). `FIELDS["case@1"]`: `isDay(o.day) &&
     oneOf(o.kind, ["mistake", "rule"]) && str(o.topic) && optStr(o.item) && str(o.pick) && (o.bet === 1
     || o.bet === 2 || o.bet === 3) && bool(o.correct) && bool(o.reask)`.
  4. `KEYS["case@1"]`: `["day", "kind", "topic", "item", "pick", "bet", "correct", "reask"]`.
- **PATTERN**: `AttemptV1` (29-36) and `FIELDS["attempt@1"]` (120-126).
- **GOTCHA**: `_complete` at line 168 fails to compile until `KEYS` lists every own field. `pick` is
  pupil-facing option text and is allowed in the log the way `attempt.answer` is; it never carries the
  working. A rule case has no `item`, so `item` is optional and `optStr`.
- **VALIDATE**: `bunx tsc --noEmit && bun test src/events/types.test.ts` (fails until Task 7 adds the
  fixture: that is the expected order)
- **SATISFIES**: AC 4 (bet recorded), AC 5 (calibration from state).

### 7. CREATE `src/events/__fixtures__/case.v1.jsonl`

- **IMPLEMENT**: two lines, a confident-wrong first answer and its re-ask:
  ```
  {"v":1,"t":"2026-10-06T07:12:00Z","type":"case","day":"2026-10-06","kind":"mistake","topic":"1MA1/R9/of-an-amount","item":"1MA1/R9/of-an-amount#1","pick":"That is half of 45, which is 50%. You want 20%.","bet":3,"correct":false,"reask":false}
  {"v":1,"t":"2026-10-06T07:13:30Z","type":"case","day":"2026-10-06","kind":"mistake","topic":"1MA1/R9/of-an-amount","pick":"No note needed. The answer is right.","bet":2,"correct":true,"reask":true}
  ```
- **PATTERN**: `attempt.v1.jsonl`.
- **GOTCHA**: the re-ask line has no `item` (it is generator-built). Biome does not read `.jsonl`
  (`observed` in the T2 plan).
- **VALIDATE**: `bun test src/events/types.test.ts`
- **SATISFIES**: AC 4.

### 8. UPDATE `src/events/replay.ts`

- **IMPLEMENT**:
  1. Types:
     ```ts
     export type CaseRecord = {
       kind: "mistake" | "rule";
       topic: string;
       item: string | null;
       bets: [1 | 2 | 3, boolean][]; // (bet, correct) in answer order: the first answer, then the re-ask if there was one
     };
     ```
     On `State`: `shape: 2`, and after `calibration`:
     `cases: Record<string, CaseRecord>; // London day the case was for → the day's answers (O5)` and
     `caseSeed: string | null; // topic a confident-wrong case sends back tomorrow; cleared by the next day's first answer`.
  2. `replay` initial state: `shape: 2`, `cases: dict()`, `caseSeed: null`.
  3. Reducer:
     ```ts
     "case@1": (s, e) => {
       topic(s, e.topic);
       work(s, e.t);
       const rec = s.cases[e.day];
       if (e.reask) {
         // A re-ask with no first answer on record (hand edit) is kept as the day's only pair.
         if (rec === undefined) s.cases[e.day] = { kind: e.kind, topic: e.topic, item: e.item ?? null, bets: [[e.bet, e.correct]] };
         else rec.bets.push([e.bet, e.correct]);
         return;
       }
       if (rec !== undefined) return; // the first answer of a day is the record; a repeat post changes nothing
       s.cases[e.day] = { kind: e.kind, topic: e.topic, item: e.item ?? null, bets: [[e.bet, e.correct]] };
       s.caseSeed = e.bet === 3 && !e.correct ? e.topic : null;
     },
     ```
- **PATTERN**: `"attempt@1"` reducer (lines 73-96) and `work` (55-61).
- **GOTCHA**: `shape` is a literal type; the T2 replay test asserts it (Task 9). `check.ts`'s `project`
  (lines 25-47) reads only `lines`, `topics[].rung`, `xp.total`, `hash`, never `shape`, so the contract
  in `events.md:28` holds with no change there, and `check.test.ts:109` ("an old state shape with the
  contract paths is read") already proves a `state.json` from an older shape is read by a newer build:
  the first start after this update rebuilds `state.json` with `cases` and `caseSeed` and refuses
  nothing. If T5 (#7) also changes `State` and merges first with `shape: 2`, this ticket rebases to
  `shape: 3` and updates line 56 of the replay test again; whichever PR merges second owns the bump.
  Keyed by `e.day`, not `localDay(e.t)`: the worst case for the midnight question is a
  case opened at 23:58 and answered at 00:02, which would otherwise mark the wrong day done and leave
  the intended day unrecorded. The flame still uses `e.t`.
- **VALIDATE**: `bun test src/events/replay.test.ts` (after Task 9)
- **SATISFIES**: AC 5 (calibration pairs in state), AC 4 (seed).

### 9. UPDATE `src/events/replay.test.ts`

- **IMPLEMENT**:
  1. Line 56: `expect(s.shape).toBe(2)`.
  2. New test "case: one record a day, the re-ask joins it, the seed is set by bet 3 and wrong and
     cleared by the next first answer, and the day counts in the flame": replay
     - the two fixture lines → `cases["2026-10-06"]` equals `{ kind: "mistake", topic: "1MA1/R9/of-an-amount", item: "1MA1/R9/of-an-amount#1", bets: [[3, false], [2, true]] }`, `caseSeed` is `"1MA1/R9/of-an-amount"`, `flame["2026-W41"]` contains `"2026-10-06"`;
     - plus a third line, day `2026-10-07`, `t` `2026-10-07T23:30:00Z` (the 8th in BST, so the flame counts
       the 8th while the case sits on the 7th: the midnight rule asserted), bet 1, correct, `reask:false` →
       `caseSeed` is `null`, two records;
     - plus a fourth line repeating day `2026-10-07` with bet 3 wrong `reask:false` → the record is unchanged (first answer wins) and `caseSeed` stays `null`;
     - the fixture's re-ask line alone → a record with one pair, `item` null, `caseSeed` null.
  3. The guard test (line 59) already stringifies the whole state; add `'"working"'` to its key list so a
     future reducer cannot put the working into state.
- **VALIDATE**: `bun test src/events/replay.test.ts`
- **SATISFIES**: AC 5, AC 4.

### 10. UPDATE `.claude/references/events.md`

- **IMPLEMENT**: line 8's type list gains `case` with one clause ("`case` is one detective-case answer with
  its 1 to 3 bet"); line 26's state keys gain `cases` (day → kind, topic, item, `bets` pairs) and
  `caseSeed`, and `shape` is now 2. One sentence under Replay: a case is keyed by its `day` field, not
  the London day of `t`.
- **VALIDATE**: `grep -n "case" .claude/references/events.md`
- **SATISFIES**: documentation.

### 11. CREATE `src/flow/detective.ts`

- **IMPLEMENT** (pure: no clock, no file, no `Math.random`):
  ```ts
  import { lcg } from "../content/generators";
  import type { CasePack } from "../content/types";
  import type { CaseRecord } from "../events/replay";

  export const NO_NOTE = "No note needed. The answer is right.";
  export const KAI = "Kai";
  const RIGHT_ONE_IN = 4; // Kai's answer is the right one one time in four
  const ROLLS = 8; // generator rolls tried before a re-ask gives up on fresh numbers
  const LAST = 7; // answers the calibration line covers

  export type CaseSource = { kind: "mistake"; topic: string; item: string } | { kind: "rule"; topic: string };
  export type CaseOption = string;
  export type Case = {
    kind: "mistake" | "rule";
    topic: string; title: string; item: string | null;
    stem: string; figure?: string; scaffold?: string; hint?: string;
    shown: string | null;                       // Kai's answer (mistake) or null (rule)
    instances: { stem: string; answer: string }[]; // three for a rule case, [] for a mistake case
    question: string;                            // "Which note goes to Kai?" or "What is the rule?"
    options: CaseOption[];
    correct: number;                             // index into options; the page hides it until the check
    working: string;                             // hidden until the check
  };

  export function hash(s: string): number            // FNV-1a 32-bit, v1 constants
  export function casePool(pack: CasePack): CaseSource[]
  export function pickCase(day: string, seed: string | null, pool: readonly CaseSource[]): CaseSource | null
  export function buildCase(src: CaseSource, day: string, pack: CasePack): Case | null
  export function buildReask(src: CaseSource, day: string, pack: CasePack): Case | null
  export function calibration(records: Readonly<Record<string, CaseRecord>>, last = LAST): { predicted: number; scored: number; n: number }
  ```
  - `casePool`: walk `pack.topics` in file order; for each topic, every item in `pack.items.get(id)` with
    `answers?.length`, a `working` and `misconceptions.length > 0` → a `mistake` source; then, if
    `topic.concept` and `pack.gens[topic.aliases[0]]` is a function → a `rule` source. An item without a
    misconception is skipped here and nowhere else, so the AC holds by construction.
  - `pickCase`: `null` on an empty pool. Topic first: `topics` = the distinct topics of the pool in pool
    order; `topic` = `seed` when `seed` is one of them, else `topics[hash(day) % topics.length]`. Then
    within the topic with `h = hash(`${day}:${topic}`)`: if the topic has a rule source and `h % 2 === 0`
    → the rule source; else `mistakes[h % mistakes.length]` where `mistakes` are the topic's item
    sources. Why topic first: uniform over items would give a rule case 3 times in 108 (`observed` in the
    planning spike, 2026-09-27: 5 rule days in 366); topic first with the half rule gives 26 rule days in
    366, 6 days on the same topic as the day before, 102 of 105 items seen, and consecutive days differ
    364 times in 365 (`observed`, same spike, days from 2026-10-01). A seeded concept topic gives its
    rule case on 182 of 366 days (`observed`).
  - `buildCase` (mistake): `rng = lcg(hash(`${day}:${src.item}`))`. Options: the item's misconception
    messages deduplicated by text in item order (`observed` 2026-09-27: `1MA1/P6#5` repeats one message),
    plus `NO_NOTE`; Fisher-Yates shuffle with `rng`. `shown`: if `Math.floor(rng() * RIGHT_ONE_IN) === 0`
    then `answers[0]` and `correct = options.indexOf(NO_NOTE)`; else `m = misconceptions[Math.floor(rng()
    * misconceptions.length)]`, `shown = m.answer`, `correct = options.indexOf(m.message)`. Carry `stem`,
    `figure`, `scaffold`, `hint`, `working`, `title` from the topic row. Question: `Which note goes to Kai?`
  - `buildCase` (rule): `gen = pack.gens[aliases[0]]`, `rng = lcg(hash(`${day}:${src.topic}:rule`))`. Roll
    until three instances have distinct `answers[0]`, at most `3 * ROLLS` rolls, then accept what there
    is (at least three, duplicates allowed). Instance: `{ stem: g.stem, answer: g.answers[0] }`. Options:
    `[rule, ...distractors]` shuffled with `rng`; `correct = options.indexOf(rule)`. `stem` is the topic
    title; `working` is the rule itself (what the check reveals). Question: `What is the rule?`
  - `buildReask` (mistake): `rng = lcg(hash(`${day}:${src.topic}:again`))`; roll `gen` up to `ROLLS` times
    until `Object.keys(g.wrong).length > 0`; build the case from the generated item (stem, `answers`,
    `working`, `hint`, misconceptions from `wrong`) with `item: null`. No generator or no roll with a
    wrong key: fall back to another item of the same topic (the next eligible item after `src.item` in
    file order, wrapping); none → `null`.
  - `buildReask` (rule): the same rule case with `rng = lcg(hash(`${day}:${src.topic}:again`))`, so the
    instances and the option order differ.
  - `calibration`: records sorted by day, their `bets` flattened in order, the last `last` pairs;
    `predicted = Σ bet`, `scored = Σ bet where correct`, `n = pairs.length`.
- **PATTERN**: v1 `case.js` `buildCase`/`todaysCase` for the roll-again loop and the 1-in-4 right answer;
  `src/flow/ladder.ts` for the file style (small exported pure functions, one doc line each).
- **IMPORTS**: type-only imports from `../content/types` and `../events/replay`
  (`verbatimModuleSyntax` is on: `import type`).
- **GOTCHA**: `aliases[0]` is the generator code (`practice.js:32` uses the same convention). `Generated.type
  === "text"` answers (U980, U377's second branch) are shown as written; a `pi` answer shows `pi`, the way
  `attempt.answer` stores it. The hash input includes the item id (mistake) or the topic (rule), so two
  sources on the same day never share an rng. `Case` must never be spread into a model prompt: this
  ticket has no job, and the guard line in the PR body says so.
- **VALIDATE**: `bunx tsc --noEmit` then Task 12's tests
- **SATISFIES**: AC 1, AC 2, AC 4 (re-ask, seed), AC 5, AC 6 (one case, one re-ask, at most 5 options).

### 12. CREATE `src/flow/detective.test.ts`

- **IMPLEMENT**, with a small synthetic pack built inline (two topics, one concept; a hand generator)
  and the real maths pack loaded through Task 13's `loadCasePack("maths")`:
  1. "an item with no misconceptions never appears": synthetic pack where topic A has three items, one
     with `misconceptions: []`; iterate 400 consecutive days (`addDays` from `src/mcp/clock`) with
     `seed` null and with `seed` = A; assert the empty-misconception item id is never `pickCase`'s item
     and `casePool` lists 2 mistake sources for A. A topic whose items all lack misconceptions and that
     has no `concept` yields no source at all.
  2. "the same day and seed give the same case": with the maths pack, `buildCase(pickCase(day, null,
     pool), day, pack)` twice → `toEqual`; over the 365 day pairs from 2026-10-01, consecutive days
     give a different `(topic, kind, item)` at least 350 times (`observed` 364 in the planning spike;
     the bound leaves room for a content change).
  3. "a confident-wrong seed keeps tomorrow on that topic, and a seed that is not in the pool is
     ignored": `pickCase(day, "1MA1/R9/of-an-amount", pool).topic` is that topic for every day in a
     year; `pickCase(day, "gone", pool)` equals `pickCase(day, null, pool)`.
  4. "a mistake case: options are the item's messages plus NO_NOTE, the correct index points at the
     shown answer's message or at NO_NOTE, the working is the item's": over every source in the maths
     pool and 30 days, `options.length` is between 2 and 4, `correct` is in range, and
     `options[correct]` is `NO_NOTE` exactly when `shown` normalises to `answers[0]`
     (`normaliseAnswer` from `src/marking/normalise`). Across those runs the `NO_NOTE` share is between
     15% and 35% (`observed` 23.7% over 3150 runs in the planning spike with this rng order).
  5. "a rule case: three instances with distinct answers, options are the rule and its distractors, the
     working is the rule, and a concept topic gives its rule case on about half its days": for the
     three concept topics over 366 days, every day has three distinct instance answers (`observed`:
     0 failures, at most 12 rolls needed, U980 the slowest), and with `seed` set to `1MA1/A12` the rule
     kind comes up between 150 and 215 times (`observed` 182).
  6. "a re-ask on a mistake case has fresh numbers and its own misconceptions, or falls back to another
     item, or is null": U349 source → `item` null and `stem` differs from the day case; the real pack
     on day `2027-07-13` for `1MA1/G20/side` (`observed`: the one day in 366 where U283's eight rolls
     carry no wrong key) → the next item of that topic, `item` set; a rule re-ask differs from the day's
     rule case in its instances; a synthetic topic with one item and no generator → `null`; `buildCase`
     is `null` for a missing item, a rule source on a non-concept topic and an unknown topic.
  7. "calibration sums the last seven pairs": records over 9 days with a re-ask on day 3 → `n` 7,
     `predicted` and `scored` derived by hand in the test comment.
  8. "size: one case and at most one re-ask, never more than five options": for every maths source,
     `buildCase` and `buildReask` each return one `Case` or null and `options.length <= 5`.
- **PATTERN**: `src/flow/ladder.test.ts` (table tests), `src/content/generators.test.ts` (the real
  pack under `bun test`).
- **VALIDATE**: `bun test src/flow/detective.test.ts`
- **SATISFIES**: AC 1 (test 1), AC 2 (tests 2 and 3), AC 4 (test 6), AC 5 (test 7), AC 6 (test 8).

### 13. CREATE `src/api/case.ts` with `loadCasePack`

- **IMPLEMENT**:
  ```ts
  /** Topics, every topic's items and the generator table, read once per root. What the case route needs. */
  export async function loadCasePack(subject: string, root = process.cwd()): Promise<CasePack>
  ```
  Memoised in a module `Map<string, Promise<CasePack>>` keyed by `subjectDir(subject, root)` (the promise,
  so two concurrent first calls share one load); composes `loadTopics`, `loadItems` per
  topic (`src/content/pack`) and `loadGenerators` (`src/content/generators`). `CasePack` is the type
  from `src/content/types` (Task 1).
- **PATTERN**: `loadGenerators` memo (`generators.ts:9-27`).
- **GOTCHA**: this is the composition point, in `src/api`, because `pack.ts` and `generators.ts`
  already import each other one way (see the file list) and a loader in either would close a runtime
  cycle. `src/api` already depends on both `src/content` and `src/events`.
- **VALIDATE**: `bun test src/api/case.test.ts` (Task 14 adds: `loadCasePack("maths")` gives 21 topics,
  105 items in total, 21 generators, and the same object on a second call)
- **SATISFIES**: AC 1.

### 14. UPDATE `src/api/case.ts` with `caseForDay`, CREATE `src/api/case.test.ts`

- **IMPLEMENT**:
  ```ts
  export type CaseResponse = {
    day: string;
    record: CaseRecord | null;        // today's answers when the case is already done
    source: CaseSource | null;
    case: Case | null;
    reask: Case | null;
    calibration: { predicted: number; scored: number; n: number };
  };
  /** Today's case for the record in dataDir. The case is rebuilt from today's record when one exists, so the page can show the done state. */
  export function caseForDay(dataDir: string, pack: CasePack, day: string): CaseResponse
  ```
  `state = currentState(dataDir)`; `record = state.cases[day] ?? null`; `source` = from the record
  (`{kind, topic, item}`) when present (a mistake record with `item` null, a hand-edited re-ask alone, has
  no source: `case` and `reask` null, the page shows "Done for today"), else
  `pickCase(day, state.caseSeed, casePool(pack))`; `case =
  buildCase(source)`, `reask = buildReask(source)` (both null when no source); `calibration =
  calibration(state.cases)`.
- **Tests** (`case.test.ts`, `withTemp` as in `state.test.ts`, the maths pack): an empty log gives a
  case, a re-ask, `record` null and `{0,0,0}`, and creates no `data/`; after appending the fixture's two
  lines with day `2026-10-06` the response for that day has `record.bets` `[[3,false],[2,true]]`, the
  case is rebuilt from the record's item (same `item` id), and `calibration` is `{ predicted: 5, scored:
  2, n: 2 }` (`derived`: 3 + 2 predicted, only the bet-2 right answer scored); the next day's `source.topic`
  is the seeded topic.
- **PATTERN**: `src/api/state.ts`, `src/api/state.test.ts`.
- **GOTCHA**: a record whose item no longer exists in the pack (content update) makes `buildCase` return
  null; the response then carries `record` and `case: null` and the page shows "Done for today". Test it
  with a record for item `1MA1/R9/of-an-amount#99`.
- **VALIDATE**: `bun test src/api/case.test.ts`
- **SATISFIES**: AC 2, AC 5.

### 15. UPDATE `src/server.ts`

- **IMPLEMENT**: `ServerOptions` gains `pack?: CasePack` (optional so the existing tests' options
  compile). In `startServer` register `"/api/case": { GET: (req) => getCase(req, dataDir, pack) }`
  where `getCase` mirrors `getState` (lines 97-107): `refuseForeign`, then the day: the `day` query
  parameter when present and it passes the same real-date check as `CaseV1.day` (export `isDay` from
  `src/events/types.ts` for both uses), else `localDay(utcNow())`; a `day` that fails the check is
  `json(400, { error: "day must be YYYY-MM-DD" })`. Then `json(200, caseForDay(dataDir, pack, day))`,
  `catch` → `console.error` and `json(500, { error: "Could not build today's case" })`. When
  `opts.pack` is undefined, `getCase` loads it with `await loadCasePack("maths", root)` on first use
  (the memo makes later calls free). In `main` (line 177) load the pack once: `const pack = await
  loadCasePack("maths", root)` and pass it.
- **PATTERN**: `getState`, `routes` at 133-138.
- **IMPORTS**: `caseForDay`, `loadCasePack` from `./api/case`, `localDay`, `utcNow` from
  `./mcp/clock`, `isDay` from `./events/types`, `type CasePack` from `./content/types`.
  `Bun.serve` matches `routes` on the pathname alone, so `/api/case?day=...` reaches the handler and
  `new URL(req.url).searchParams.get("day")` reads it (`observed` 2026-09-27 in the planning spike on
  Bun 1.3.4: 200 with the day echoed).
- **GOTCHA**: the route reads the clock once per request (`utcNow`) and passes the day down, so
  `caseForDay` and everything under it stay pure. `refuseForeign` runs first, as on every API route.
  `?day=` exists so Level 4 step 7 can reach a rule case on a chosen day; it is read-only (the page
  posts the returned `day`, so an answer given on a future day's case is recorded against that day and
  the reducer treats it as done when the day comes; the log is the pupil's own and hand-editable, D3).
- **VALIDATE**: in `src/server.test.ts` add to the API test group: `GET /api/case` is 200 with `day`
  matching `/^\d{4}-\d{2}-\d{2}$/`, `case.options.length >= 2`, and `case` carries no `answers` key;
  `GET /api/case?day=2026-10-09` echoes `day` `2026-10-09`; `?day=2026-02-30` is 400; a foreign
  Origin is 403.
- **SATISFIES**: AC "one route".

### 16. CREATE `app/case.html`

- **IMPLEMENT**: the `practice.html` skeleton. `<title>Today's case</title>`; `main.lesson.practice`;
  header crumb `<a href="/">Lessons</a> · case · Maths`; `<h1>Today's case</h1>`; `<p class="aim">Kai
  has answered a question. Find the mistake, or say there is none. Three minutes.</p>`; `<section
  id="case" class="quiz"></section>`; footer `<p>Nothing here is a prediction. One case a day.</p>`;
  scripts `/case.js` only (no `quiz.js`, no `generators.js`: the server rolled the numbers).
- **PATTERN**: `app/practice.html`; v1 `case.html` copy, minus the map link.
- **GOTCHA**: the section carries `class="quiz"` so `style.css`'s `.quiz` rules apply; `quiz.js` is not
  loaded, so nothing else claims the section. Prose passes `no-ai-slop` then `humanizer`.
- **VALIDATE**: `bun run dev`, open `/case.html`, the header renders (Level 4 step 1)
- **SATISFIES**: AC 6.

### 17. CREATE `app/case.js`

- **IMPLEMENT**: an arrow IIFE. Pure helpers exported on `root.detective`:
  - `calibrationLine({ predicted, scored, n })` → `n === 0` ? `""` : `n === 1` ? `First case. You
    predicted ${predicted}, you scored ${scored}.` : `Over your last ${n} cases you predicted
    ${predicted}, you scored ${scored}.`
  - `eventFor(day, c, pick, bet, correct, reask)` → the `case@1` body:
    `{ v: 1, type: "case", day, kind: c.kind, topic: c.topic, ...(c.item ? { item: c.item } : {}), pick, bet, correct, reask }`
  - `bump(cal, bet, correct)` → the calibration after one more answer, dropping the oldest when `n`
    reaches 7 is not needed: the server recomputes on the next load; the page adds to `predicted`,
    `scored` and `n` for the line it shows now.
  Page code (only when `document` exists and `#case` is present):
  1. `fetch(`/api/case${location.search}`)` (the page's query, if any, goes through unchanged so
     `?day=` reaches the route) → on failure the holder shows "The case did not load. Check the tutor
     window is still open."
  2. `record` present: render the done state from `case` (stem, figure, Kai's answer, the feedback
     `You had it.` or `Not this time.` from `record.bets[0]` then the correct option, the working, the
     calibration line, `Back tomorrow.`); `case` null → `Done for today.`. No record and no `case` (an empty
     pool) → `No case today.`
  3. Otherwise `render(case, false)`: a `.q` with `.stem` (and `.figure` via `innerHTML` for pack SVG,
     `.working.faded` for the scaffold, as `quiz.js:111-160`); for a mistake case a line `Kai's answer:
     <b>shown</b>` and the question; for a rule case an `<ol class="instances">` of `stem` then
     `answer` per instance, and the question; a `.options` block of radios (name `pick` or `pick2`);
     a `.confidence` block of three radios `1 (a guess)`, `2`, `3 (would bet on it)` (name `bet`/`bet2`);
     a `button.check`; `.feedback`, `.working`, `.calibration` hidden.
  4. Check: no pick → "Pick one first."; no bet → "How sure? 1, 2 or 3 first"; else `correct = pick ===
     c.correct`; mark `.q` `done right|wrong`; feedback `Right. You bet ${bet}.` or `Not this time. You
     bet ${bet}. ${c.options[c.correct]}`; reveal `.working` with `c.working` (the answer and the working
     enter the DOM here and nowhere earlier); disable inputs; `postEvent(eventFor(...))` through
     `fetch("/api/event", { method: "POST", headers: { "content-type": "application/json" }, ... })`, on
     a non-ok or thrown result append `NOT_SAVED` to the feedback (copy from `quiz.js:78`); update and
     show the calibration line.
  5. First answer, `bet === 3 && !correct` and `reask` non-null → `render(reask, true)` under the heading
     `Same idea, new numbers.`; otherwise, and after any re-ask, append `<p class="note">Back tomorrow.</p>`.
- **PATTERN**: `quiz.js` `buildItem` (DOM), `postAttempt` (post shape and `NOT_SAVED`), `escapeHtml` is
  not needed because everything pupil-facing goes through `textContent`; v1 `case.js` `render` for the
  flow.
- **GOTCHA**: `case.correct` and `case.working` are in the fetched JSON, as `answers` are in the items
  JSON `quiz.js` fetches; the invariant is that they enter the DOM only in the check handler (Notes N3).
  Post `reask: true` on the second case. Do not post a second first-answer if the pupil reloads: the
  server returns `record` and the page renders the done state. Biome: no `var`, no `innerHTML` with
  pupil text, `for...of` over `querySelectorAll`. Nothing touches `document` at module load
  (`quiz.test.ts:25` pattern) so Task 18 can import it.
- **VALIDATE**: `bunx biome check --write app/case.js` then `bunx biome check app/case.js`. `observed`
  2026-09-27: a probe file under `app/` with these exact constructs (`innerHTML` for the figure,
  `for...of` over `querySelectorAll`, a template literal with `location.search`, a `typeof document`
  guard, the `root.detective` export) passed every lint rule; the only findings were formatter line
  breaks, which `--write` applies. Then Task 18.
- **SATISFIES**: AC 4 (bet, re-ask), AC 5 (line), AC 6.

### 18. CREATE `src/marking/case.test.ts`

- **IMPLEMENT**: `await import(path.resolve(import.meta.dir, "../../app/case.js"))`, read
  `globalThis.detective`; `calibrationLine` for n 0, 1 and 7 gives the three strings; `eventFor` for a
  mistake case includes `item` and for a rule case omits it, and `parseEvent` of `JSON.stringify({...body,
  t: "2026-10-06T07:12:00Z"})` is non-null for both (the body the page posts is a valid `case@1`).
- **PATTERN**: `src/marking/quiz.test.ts:24-27`.
- **VALIDATE**: `bun test src/marking/case.test.ts`
- **SATISFIES**: AC 4.

### 19. UPDATE `app/style.css` and `app/index.html`

- **IMPLEMENT**: append after the `.quiz .scoreline` rule (line 275):
  ```css
  /* case page */
  .quiz .options label { display: block; padding: 0.25rem 0; }
  .instances li { padding: 0.25rem 0; }   /* not `.quiz .instances li`: that outranks two later li rules and Biome warns */
  .quiz .options input[type="radio"] { width: auto; margin: 0 0.3rem 0 0; }
  .quiz .instances { margin: 0.4rem 0 0.8rem; padding-left: 1.2rem; }
  .quiz .calibration { color: var(--muted); font-size: 0.95rem; }
  ```
  In `index.html` line 17 add `<p><a href="/case.html">Today's case</a></p>` after the practice link.
- **GOTCHA**: T6 also edits `style.css`; keep the addition at the end and small so the merge is clean.
- **VALIDATE**: `bun test src/server.test.ts` (the `/` page test at line 76 checks `/practice.html`; add
  `/case.html` to it)
- **SATISFIES**: AC 6 (the page is reachable).

### 20. UPDATE `.claude/references/content-pack.md`

- **IMPLEMENT**: line 9's `topics.json` row gains `concept?: { rule, distractors[] }` with one clause
  ("a concept topic gives O5 an invent-the-rule case"); line 23 gains "A rule case comes from a topic's
  `concept` block and three generator rolls; it needs no item."
- **VALIDATE**: `grep -n concept .claude/references/content-pack.md`
- **SATISFIES**: documentation.

### 21. RUN the gate and the manual steps

- **VALIDATE**: `bun run check`; then Level 4 below.
- **SATISFIES**: all.

---

## TESTING STRATEGY

### Unit Tests

`bun test`, colocated. `detective.test.ts` carries the four ticket ACs as named tests (Task 12).
`replay.test.ts` gains the reducer test and the `shape` change. `types.test.ts` covers the fixture
through `EVENT_KEYS` with no edit. `pack.test.ts` covers `concept`, `loadItems`, `loadCasePack`.
`case.test.ts` (marking) proves the body the page posts is a valid `case@1`.

### Integration Tests

`src/api/case.test.ts` runs the route module against a temp `data/` with the real maths pack.
`src/server.test.ts` hits `GET /api/case` over HTTP on a port-0 server and checks the foreign-origin
refusal. No socket or realtime surface.

### Edge Cases

- An item with `misconceptions: []` → never a source (`detective.test.ts` 1).
- A topic with `concept` but no generator for `aliases[0]` → no rule source (`detective.test.ts` 1,
  synthetic topic).
- A generator roll set with no wrong key (`observed`: U283 on 2027-07-13 is the one such day in 366
  across all 21 generators) → the re-ask falls back to the next item (`detective.test.ts` 6).
- Duplicate misconception messages (`1MA1/P6#5`) → deduplicated options, `correct` still valid
  (`detective.test.ts` 4 runs every source).
- A record for an item no longer in the pack → `case: null`, page shows "Done for today"
  (`case.test.ts`; Level 4 step 6).
- Midnight: opened 23:58, answered 00:02 → the event's `day` is the case's day; the reducer keys by it
  (`replay.test.ts`, the fixture's `day` vs `t` differ in the extra test line).
- A repeat first-answer post for a day already recorded → ignored by the reducer (`replay.test.ts`).
- A re-ask line with no first answer (hand edit) → kept as the day's only pair (`replay.test.ts`).
- The server unreachable when the pupil checks → `NOT_SAVED` in the feedback (Level 4 step 5).
- `caseSeed` topic no longer in the pack → `pickCase` falls back to the whole pool
  (`detective.test.ts` 3, add a seed `"gone"`).

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
bunx tsc --noEmit
bunx biome check .
```

### Level 2: Unit Tests

```bash
bun test src/flow/detective.test.ts src/events src/content src/marking
```

### Level 3: Integration Tests

```bash
bun test src/api/case.test.ts src/server.test.ts
bun run check
```

### Level 4: Manual Validation

Run from the repo root with an empty `data/` (`rm -rf data` first; `data/` is gitignored).

1. `bun run dev`; open `http://127.0.0.1:4731/case.html`. The header, one case (stem, Kai's answer or
   three instances, options, the three bets) and no working are visible. View source: `case.js` only.
2. Pick a wrong option and bet 3; Check. Feedback is red, the working appears, the calibration line
   reads "First case. You predicted 3, you scored 0.", and a second case "Same idea, new numbers."
   appears under it.
3. Answer the re-ask with bet 2. `cat data/events.jsonl` shows two `case` lines: the first with
   `"bet":3,"correct":false,"reask":false`, the second with `"reask":true`. `curl -s
   127.0.0.1:4731/api/state | grep -o '"caseSeed":"[^"]*"'` names the first case's topic.
4. Reload `/case.html`: the done state renders (no inputs, the working shown, "Back tomorrow.").
5. With the server running, open `/case.html` in a new tab with a fresh `data/`, then stop the server
   with Ctrl-C, then pick, bet and Check in the open tab: the feedback ends "Not saved. Check the tutor
   window is still open."
6. Seed check: append a hand line `{"v":1,"t":"<yesterday>T20:00:00Z","type":"case","day":"<yesterday>",
   "kind":"mistake","topic":"1MA1/G16","item":"1MA1/G16#1","pick":"x","bet":3,"correct":false,"reask":false}`
   to a fresh `data/events.jsonl`; `curl -s 127.0.0.1:4731/api/case | grep -o '"topic":"1MA1/G16"'`
   matches: today's case is on the seeded topic.
7. Rule case: find the next day whose pick is a rule case with
   ```bash
   bun -e 'import { addDays } from "./src/mcp/clock"; import { loadCasePack } from "./src/api/case"; import { casePool, pickCase } from "./src/flow/detective"; const pool = casePool(await loadCasePack("maths")); let d = "2026-10-01"; for (let i = 0; i < 200; i++, d = addDays(d, 1)) { if (pickCase(d, null, pool)?.kind === "rule") { console.log(d); break; } }'
   ```
   (`bun -e` runs ESM with top-level `await` and relative imports from the repo root: `observed`
   2026-09-27. First hit: 2026-10-23, `observed` in the planning spike with the same hash and rule.)
   Then open `/case.html?day=<that day>` (the page forwards its query to `/api/case`, Task 17; the
   route accepts `?day=` as the means for this step, Task 15). Three instances render with stem and
   answer and no working; the options are the rule and its two distractors; pick the rule with bet 1;
   the working shown after the check is the rule. Record the day used.
8. `bun scripts/test-generators.ts` still passes (the `lcg` move).

### Level 5: Additional Validation (Optional)

`bun scripts/replay-check.ts` after step 3: the new `shape` writes `state.json` with no refusal.

---

## ACCEPTANCE CRITERIA

- [ ] AC 1: an item with no misconceptions never appears as a case (`detective.test.ts` test 1).
- [ ] AC 2: the same date and the same record give the same case (`detective.test.ts` tests 2 and 3;
      `case.test.ts` rebuild from record).
- [ ] AC 3: `topics.json` carries a `concept` flag on three topics and a rule case is built from it
      (`pack.test.ts`, `detective.test.ts` test 5).
- [ ] AC 4: every answer carries a 1 to 3 bet in a `case@1` event; bet 3 and wrong shows a re-ask at once
      and seeds tomorrow (`replay.test.ts`, `detective.test.ts` 6, Level 4 steps 2, 3, 6).
- [ ] AC 5: calibration pairs are in `state.cases` and the gap is computable from state
      (`replay.test.ts`, `calibration` in `detective.test.ts` 7, Notes N4).
- [ ] AC 6: three-minute size: one case, at most one re-ask, at most five options
      (`detective.test.ts` 8, `case.test.ts`).
- [ ] `bun run check` green.
- [ ] Every pupil-facing string passed `no-ai-slop` then `humanizer` (stated in the PR body).
- [ ] Nothing in `app/` writes a file; the only writer is `POST /api/event`.
- [ ] The guard restated in the PR body: no model job, prompt or MCP tool is touched; the case's answer
      goes to the browser the way item answers already do, and never to a prompt.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full test suite passes (unit + integration)
- [ ] No linting or type checking errors
- [ ] Manual testing confirms feature works
- [ ] Acceptance criteria all met
- [ ] Code reviewed for quality and maintainability

---

## OPEN QUESTIONS / ASSUMPTIONS

None open. Each question below was decided on 2026-09-27 (user: "address all risks and doubts and Q")
with the evidence that closed it.

- **Q1, decided: implement now, beside T5.** T5's file list is `src/flow/{ladder,xp,boss,session,next}.ts`
  and one route line in `server.ts` (`docs/tickets/study-tutor-v2.md:136`); this ticket creates
  `src/flow/detective.ts` and adds one route line, so the only shared file is `server.ts` and the
  overlap is one line each, with the `routes` object taking both in any order. The T2 plan (lines
  74-77) places XP amounts in T5's `xp.ts` and has replay sum `xp` events, so T5 is not expected to
  change `State`; if it does, Task 8's merge rule (second merge owns the `shape` bump) settles it.
  What T5 reads from here: `state.cases`, `state.caseSeed`.
- **Q2, decided: a case answer is its own event.** It does not enter `state.confidentWrong` (T5's boss
  reads attempt answers with seeds to rebuild numbers) or `state.calibration` (Sure/correct counts).
  O5's calibration lives in `state.cases`. Reusing `attempt@1` with `sure = bet === 3` would lose the
  1 to 3 bet the PRD line ("you predicted 7") needs.
- **Q3, decided: three concept topics, rule case on half their days.** Identifying graphs, parallel
  lines, direct proportion; the other 18 are procedures (find a percentage, a volume, a side). The
  spike shows the three generators give three distinct instance answers on every day of a year
  (`observed`) and the topic-first pick gives 26 rule days a year (`observed`). Adding a topic later is
  three lines of JSON and no engine change.
- **Q4, decided: re-asks count in the calibration line.** The PRD says every answer carries a bet; the
  re-ask is a fresh prediction on fresh numbers. Pairs are stored in order, so a reader that wants
  first answers only takes `bets[0]`.
- **Q5, decided: two tabs, first answer wins.** Two answers to the same day's first case: the log holds
  both, the reducer keeps the first in file order, the second tab's page shows its own local feedback
  and the next load shows the first. Tested in `replay.test.ts` (Task 9, the fourth line).
- **A1, decided: `concept` is a small object.** A boolean alone cannot mark a rule case without a
  model, so the rule text lives on the topic row (Notes N2). `loadTopics` validates it (Task 2).
- **A2, decided: the browser holds the answer before the check.** This matches `quiz.js`, which
  fetches the items file with `answers` and hides them until the check (T4), and the ground rule
  concerns model prompts. Notes N3 records the split that would tighten it later.

## RISKS, CLOSED

- **R1 `shape` bump.** `check.ts` `project` never reads `shape` and `check.test.ts:109` proves an
  older-shape `state.json` is read by a newer build (`observed`: test exists and is green on `main`).
  First start after the update rebuilds `state.json`; nothing refuses. Merge rule with T5 in Task 8.
- **R2 pupil-facing text.** Every string this plan introduces (the three rules, six distractors, and
  the 20 page strings in Tasks 16 and 17) was scanned on 2026-09-27 against the 135 table entries of
  `~/.claude/skills/_shared/slop-blacklist.md`: 0 hits, 0 exclamation marks (`observed`). The
  `no-ai-slop` then `humanizer` pass at save time (rules/content.md) is a formality the implementer
  still runs and names in the PR body.
- **R3 merges with T5 and T6.** `server.ts`: one route line each (Q1). `style.css`: T6 owns the map
  and re-test pages; this ticket appends five rules after line 275, under a comment `/* case page */`,
  so a T6 edit elsewhere in the file merges without conflict. `index.html`: one line after the
  practice link; T6 will add a map link beside it.
- **R4 import cycle.** `pack.ts` and `generators.ts` already import one way; `loadCasePack` in
  `src/api/case.ts` and `CasePack` in `content/types.ts` keep the graph acyclic (`observed` from the
  two import lines; Tasks 1 and 13).
- **R5 Biome on `case.js`.** A probe with the intended constructs lints clean; only formatting changes,
  applied by `--write` (`observed`, Task 17).
- **R6 the route with a query.** `Bun.serve` routes match on pathname; `?day=` reaches the handler
  (`observed`, Task 15).
- **R7 rule case reachability.** Every concept generator gives three distinct answers within 12 rolls
  on every day of a year; the first rule day from 2026-10-01 is 2026-10-23 (`observed`, Level 4 step 7).
- **R8 re-ask availability.** 21 generators, 366 days, 8 rolls: one day with no wrong key (U283 on
  2027-07-13); the item fallback covers it and is tested on that day (`observed`, Task 12 test 6).
- **R9 `bun -e` in the manual step.** ESM imports and top-level `await` work in `bun -e` on Bun 1.3.4
  (`observed`).
- **R10 size.** `expected` 820 lines against the ticket's 600 to 900; the closest comparable, T4's
  plan, landed inside its estimate (PR #26).

## NOTES (open canvas)

**N1. No pronoun rewrite.** v1 turned "You need two lots of it" into "Jo need two lots of it" with a
regex; the verb agreement breaks. Here the options are the notes as written, and the question is "Which
note goes to Kai?", so the second person reads as a note addressed to Kai. No text is transformed, and
the content rule "a message names the mistake, not the answer" carries over untouched.

**N2. Invent the rule, marked in code.** Kapur's invention is free-form; the tutor cannot mark free text
without a model and O5 must work with none. So the pupil sees three instances, forms the rule, then
picks it from three. The bet keeps the prediction honest. The instances show stem and answer only: the
generator's `working` states the rule outright ("Parallel means the same gradient"), so it is withheld
until the check, where it is the rule itself. Rejected: instances from items (their `working` is also
the method; the generator gives variety and three distinct answers).

**N3. Where the mark happens.** Considered `POST /api/case` marking server-side so `correct` and
`working` never leave the binary before the answer. It would be a second route and a second write path
beside `POST /api/event`, and `quiz.js` already ships the items' answers to the page and hides them
until the check. Consistency won. If the trust model tightens later, `caseForDay` can split into a view
(no `correct`, no `working`) and a reveal, with the page unchanged in shape.

**N4. The calibration gap, derived.** For a window of pairs `(bet, correct)`:
`predicted = Σ bet`, `scored = Σ bet·[correct]`, `gap = predicted − scored` (points claimed and not
won). Per ISO week: group `state.cases` by `isoWeek(day)` and sum. "Halves in 4 weeks" compares the
gap in week 4 with week 1 for the same pupil. A pupil who always bets 1 has a small gap by construction;
the line shows `n` so that is visible.

**N5. Pool size and spread.** `observed` 2026-09-27: 105 items, all with misconceptions (102 with three,
3 with two), 60 with a figure, 42 with a scaffold; plus 3 rule sources = 108 sources over 21 topics. The
planning spike (FNV-1a over the day, then over day and topic, 366 days from 2026-10-01) gives: 6 days
on the same topic as the day before, every topic between 10 and 23 times, 102 distinct items, 26 rule
days, consecutive days differing 364 times in 365. No "recently seen" filter is needed at this size.
The spike's first version picked uniformly over the 108 sources and gave only 5 rule days, which is why
the pick is topic first.

**N7. Confidence.** 10/10 for one-pass implementation: every figure in this plan is `observed` from the
repo or the planning spike except the size estimate; every question is decided; every risk has the
test or the observation that closes it; every manual step names the means to reach its state.

**N6. Sizes.** `expected`: `detective.ts` ~180 lines, its tests ~200, event and reducer changes ~60,
route and tests ~90, `case.js` ~220, `case.html` ~30, content ~30, docs ~10. About 820 lines, inside
the ticket's 600 to 900.

## AMENDMENTS

- 2026-09-27, at commit: Tasks 9, 12, 13, 14, 17 and 19 edited to what shipped (see the report's
  Deviations). No task superseded.
