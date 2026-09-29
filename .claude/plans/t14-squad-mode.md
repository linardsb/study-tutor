# Feature: T14 O4 squad mode: seeded shared re-test, squad files, co-op total

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

Two or three friends run the same seeded round of questions each week, with identical numbers and
nothing exchanged beforehand. Each pupil's tool writes one file for that pupil and reads any friends'
files a parent has copied into the same folder. The page shows how many days of the squad week are left,
compares answers and working question by question once the pupil has done their own round, and shows the
squad's pooled total. It never ranks one pupil against another. After the round, the pupil teaches one
question to a parent. The parent then answers three fresh questions of the same kind, and the result is
saved as a `teachback` event.

No model anywhere. No server between pupils. Works in the no-key mode.

Pieces:

- `src/flow/squad.ts` (pure): slug rule, this week's topic and seeds from `hash(squad, week, topic)`, the
  parent round's seeds, days left in the ISO week, server-side marking of a round, the squad file shape
  and its parser, comparability and the pooled total.
- `src/api/squad.ts`: `GET /api/squad` (the week's view), `POST /api/squad` (save a round: one `squad`
  event, then the pupil's own file), `POST /api/squad/join` (squad id and pupil name into `profile.json`).
- `src/events/append.ts`: two confined helpers, `makeDataDir` and `listDataDir`, because
  `data/squad/<id>/` is the first subfolder under `data/`.
- `squad@1` gains `answers` (edited in place, allowed: no release exists, see Q1).
- `app/squad.html` + `app/squad.js`: join form, the round, compare view, pooled total, parent round.
- Two folded PR #36 review items (F4, F5) on `app/map.js` / `app/retest.js`, in their own phase.

## User Story

As a pupil with two friends who also run the tutor
I want to do the same questions as them each week and see how we did together
So that revising feels like a shared job, without anyone being ranked

## Problem Statement

PRD O4 asks for a co-operative weekly round that works with no model and no server (D9). The pupils'
tools never talk to each other. Identical questions therefore have to come from a shared seed, and results
have to travel as files. Those files contain answers, so a friend's file would give the answers away to a
pupil who has not done the round yet. It must stay hidden until the pupil has done their own.

## Solution Statement

Topic and seeds are pure functions of `(squad id, ISO week)` over the pack's generator topics, so two
installs of the same pack build the same questions. A round is marked in the browser for instant feedback
and marked again on the server, which is authoritative. The server appends one `squad@1` event, the
record, carrying the typed answers. It then writes `data/squad/<squad>/<pupil>.json` as a projection of
that event. If the file write fails, the next `GET /api/squad` writes it again. Friends' files are
read from the same folder. A missing, unreadable, malformed, other-week or not-comparable file is left
out, and the page degrades to solo. `GET /api/squad` returns friends' answers only after the local
pupil's round for that week is in the log. That rule is enforced on the server.

## Out of Scope / Non-Goals

- Not included: syncing through Drive, OneDrive or iCloud. The folder is inside `data/` (decided
  2026-09-29, see Q2). A parent copies friends' files in by hand. The page offers a download of the
  pupil's own file and shows the folder path. The "synced folder" part of the AC is met only by a sync
  client that can target an arbitrary folder. That limit is recorded in Q2, not worked around with a
  symlink, because `resolveInData` refuses symlinks that leave `data/`.
- Not included: an import route. The tool never writes a friend's file (AC: "written only for the local
  pupil").
- Not included: `session` events for squad mode. The squad page posts no `session` start or end, so
  `app/map.js` `pageFor` needs no squad case and `/api/next` never returns `continue` for squad. A
  follow-up can add both together.
- Not included: XP for a squad round. The `xp@1` reasons stay `attempt | retest | teachback`. The parent
  round's `teachback` earns its existing 15 XP through `/api/event`.
- Not included: a squad round moving the ladder. `squad@1`'s reducer case stays as it is (topic touched,
  flame day counted).
- Not included: a live, synchronised timer. The "shared countdown" is the days left in the ISO week
  (Q3).
- Not changing: `setup.html` / `POST /api/config`. Joining a squad is on the squad page.
- Not changing: the MCP tools. `MCP_WRITABLE.squad` stays `false`.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium-high (expected ~700–900 lines including tests; the ticket said 500–800)
**Primary Systems Affected**: `src/flow`, `src/api`, `src/events` (types, append), `src/server.ts`, `app/`
**Dependencies**: none new. `@happy-dom/global-registrator` is already a dev dependency (T6).

## Related Work

**Implements**: linardsb/study-tutor#16 (T14) · **Epic**: #1 · PRD `docs/prd/study-tutor-v2.prd.md` (O4, R7,
Q9, E4) · Architecture `docs/prd/study-tutor-v2.architecture.md` D9 (squad), D3 (events, profile), D5
(generators run in both runtimes)

**Back-references**:

- `.claude/plans/t6-o1-pages.md`: the boss page pattern this mirrors (seeds from the server, questions
  rolled in the browser, one go each, working revealed only in the check handler, happy-dom page tests).
- `.claude/plans/t7-detective-case.md`: `hash` / `shuffle` in `src/flow/detective.ts`, pure-flow and
  day-route pattern.
- `.claude/plans/t8-setup-config-provider.md`: `profile.json` keeps unknown keys on save.

**Forward-references**:

- (none yet) E4 reads this ticket's `squad` events.

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `.claude/references/events.md`: the event rules. Pay particular attention to "A `(type, v)` shape may be
  edited in place until the first GitHub release", "Only `src/events/append.ts` writes under `data/`",
  the fixture-per-version rule and the DOM test pattern.
- `src/events/types.ts:59-65` (`SquadV1`), `:168-169` (`FIELDS["squad@1"]`), `:197` (`KEYS["squad@1"]`):
  the shape this ticket extends.
- `src/events/__fixtures__/squad.v1.jsonl`: one line. It must gain `answers`.
- `src/events/replay.ts:140-143`: the `squad@1` reducer (`topic` + `work`). Unchanged.
- `src/events/append.ts:28-56` (`resolveInData`), `:146-160` (`readDataJson`: rethrows anything that is
  not ENOENT, including `Refused`), `:167-194` (`writeDataFile`: runs `mkdirSync(dataDir)` only, so a
  missing `squad/<id>/` makes `resolveInData` throw ENOENT on the realpath of the parent).
- `src/flow/boss.ts` (whole file, 95 lines): pure seed pattern. `hash` and `shuffle` come from
  `./detective`, `lcg` from `../content/generators`.
- `src/flow/detective.ts:44-60`: `hash` (FNV-1a 32 bit), `shuffle`.
- `src/content/generators.ts:6-13` (`lcg`), `:22-36` (`loadGenerators`: caches per file and sets a
  global, so importing it twice in one process proves nothing about two machines).
- `src/content/types.ts:60-80`: `Generated`, `Generator`, `CasePack`.
- `src/marking/normalise.ts`: `normaliseAnswer`, the server copy of `quiz.norm`.
- `src/mcp/clock.ts:24-50`: `localDay`, `addDays`, `isoWeek`.
- `src/config.ts:120-135` (`Profile`, defaults), `:174-185` (`readProfile` keeps every key), `:227-302`
  (`saveSetup`: validate everything first, write once, and keep the other profile keys with
  `{ ...readProfile(dataDir), weeklyTarget }` at `:297`).
- `src/api/event.ts` (whole file): `postEvent`, `refusal`, the `PostResult` shape. `refusal` gains a
  squad refusal.
- `src/api/case.ts:14-33`: `loadCasePack`. `src/api/next.ts`: a small api module over a pure flow.
- `src/server.ts:99-111` (`refuseForeign`), `:127-147` (`dayRoute`), `:149-163` (`postEventRoute`, the
  POST body pattern), `:261-307` (`apiRoutes`, the one route table).
- `src/updates.ts:1-5`: `VERSION`.
- `app/retest.js` (whole file): the page to mirror (TEXT table, `el`, `getJson`, `postEvent`, `buildQ`,
  `wireCheck`, `dayQuery`, and the `globals().boss = Object.assign(api, …)` export for tests).
- `app/retest.html`: page skeleton (script order: generators, quiz, page).
- `app/quiz.js:29-75`: `lcg`, `mark`, `itemFromGenerated`.
- `app/index.html:16-20`: the links list; add Squad.
- `app/map.js:243-285`: `dayQuery`, `load`, `api.reload` (F4).
- `src/marking/retest.test.ts:1-60` (loading page files under Bun), `:173-225` (the register test and
  the "every POST goes to …" test; its regex `"(\/api\/[a-z]+)"` does NOT match `"/api/squad/join"`, so
  it would silently skip that post, and the regex must widen).
- `src/marking/retest-dom.test.ts:1-160`: happy-dom fake-fetch harness; `src/marking/dom.ts`: `doc`,
  `until`, `El`.
- `src/marking/map-dom.test.ts:1-72`: map harness (F4 target).
- `.claude/rules/content.md`: pupil-facing text rules (the rule's paths do not cover `app/`, but the
  CLAUDE.md "Pupil-facing text" rule does).

### New Files to Create

- `src/flow/squad.ts`: pure squad logic.
- `src/flow/squad.test.ts`: unit tests, plus the two-process same-seed test.
- `src/api/squad.ts`: `getSquad`, `postSquad`, `joinSquad`.
- `src/api/squad.test.ts`: route-level tests against a temp `data/`.
- `app/squad.html`, `app/squad.js`: the page.
- `src/marking/squad.test.ts`: browser helpers under Bun (browser roll = Bun roll, register, no ranking
  words).
- `src/marking/squad-dom.test.ts`: page under happy-dom with a fake fetch.

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [ISO 8601 week date](https://en.wikipedia.org/wiki/ISO_week_date#Calculating_the_week_number_from_a_month_and_day_of_the_month)
  - Why: `isoWeek` already exists. Days left is `8 - isoWeekday(day)` (Monday 1 … Sunday 7).
- [Bun.spawnSync](https://bun.sh/docs/api/spawn#blocking-api-bun-spawnsync)
  - Why: the two-machine test runs two separate `bun` processes and compares stdout.
- [MDN: `a[download]` + `URL.createObjectURL`](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/a#download)
  - Why: "Save my file" hands the pupil's own file to the browser's downloads. This is not a page writing
    under `data/`, and none of the storage APIs `retest.test.ts` bans is used.

### Patterns to Follow

**Pure flow + api module.** `src/flow/*.ts` reads no clock and no file. `src/api/*.ts` reads state/files
and calls flow. `src/server.ts` reads the clock once (`dayRoute`) and passes `day` down.

**Seeds** (`src/flow/boss.ts:58-67`):

```ts
seed: hash(`${day}:${topic.id}:${k}`),
```

**Browser page export for tests** (`app/retest.js:386-402`):

```js
globals().boss = Object.assign(api, { TEXT, passes, buildItems, … });
```

**Answer withheld in the DOM** (`app/retest.js:195-221`): working enters the DOM only inside the check
handler.

**Errors.** Route refusals are `{status: 400|409, body: {error: "<sentence>"}}`. A thrown read is a logged
500 with a plain sentence. `Refused:` prefixed messages come from `append.ts`.

**Profile write** (`src/config.ts:297-300`): `{ ...readProfile(dataDir), …new keys }`, then
`writeDataFile(dataDir, PROFILE_FILE, JSON.stringify(profile, null, 2) + "\n")`.

**Tests.** `bun:test`, colocated `*.test.ts`. A temp `data/` from `fs.mkdtempSync(path.join(os.tmpdir(), …))`,
as `src/api/event.test.ts` does. DOM tests register happy-dom per file and import the page with `?dom`.

---

## IMPLEMENTATION PLAN

### Phase A: Folded review items F4, F5 (map.js, retest.js)

**Independent of:** Phases B–E (touches only `app/map.js`, `app/retest.js` and their DOM tests). Do it
first because it is small and isolated. It can be its own commit.

### Phase B: Foundation: event shape, confined dir helpers, pure squad flow

### Phase C: API and routes

**Depends on:** B.

### Phase D: Page

**Depends on:** C (the response shapes). It can start against the types from B.

### Phase E: Wiring, docs, full gate

**Depends on:** C, D.

---

## STEP-BY-STEP TASKS

### A0 CHECK release state (pre-flight for B1; R1)

- **IMPLEMENT**: Run `gh api repos/linardsb/study-tutor/releases --jq length` and
  `gh api repos/linardsb/study-tutor/tags --jq length`. Both were `0` on 2026-09-29 (observed).
  - **Both `0`**: B1 and B2 run as written, editing `squad@1` in place.
  - **Either ≥ 1**: run **B1-alt** instead of B1 and B2. Every other task is unchanged, because nothing
    else names the version. `mineEvent` matches `type === "squad"` and reads `answers` only from `v === 2`
    lines. A `v: 1` squad line has no answers, so it cannot be mine for the file, but it still counts for
    the flame through its existing reducer.
- **B1-alt** (fully specified, so no re-planning is needed):
  - `src/events/types.ts`: keep `SquadV1` and its `FIELDS` / `KEYS` rows untouched. Add
    `SquadV2 = Line<"squad", 2> & { …SquadV1 fields…, answers: SquadAnswer[] }` to the `Event` union. The
    `FIELDS["squad@2"]` row is the B1 validation. `KEYS["squad@2"]` is the v1 keys plus `"answers"`.
  - `src/events/replay.ts`: `"squad@2": (s, e) => { topic(s, e.topic); work(s, e.t); }`, the same as
    `squad@1`.
  - New fixture `src/events/__fixtures__/squad.v2.jsonl` (the B2 line with `"v":2`). `squad.v1.jsonl`
    stays as it is.
  - `postSquad` appends `v: 2`. C1's refusal covers both versions (it matches on `type`).
  - `tsc` fails until the `FIELDS`, `KEYS` and reducer tables all hold `squad@2`. That is the check.
- **VALIDATE**: the two counts, recorded in the execution report.
- **SATISFIES**: AC 4.

### A1 UPDATE `app/retest.js` (PR #36 F5): build before start; intro counts buildable questions

- **IMPLEMENT**: In `load`, once `resolveStep` gives `kind === "boss"`, run `fetchPack(step.boss)` and
  `buildItems(...)` before `renderIntro`. If the pack fetch fails, show `TEXT.notLoaded`. If `built.length === 0`,
  show `TEXT.noQuestions` and render no Begin button, so nothing is posted. Otherwise `renderIntro` shows
  `TEXT.intro(built.length, new Set(built.map(b => b.slot.topic)).size)`. `begin(ids, step, built, titles, query, btn)`
  posts `step.start` and then renders the built questions. `finish`/`scoreOf` are unchanged: `scoreOf` already
  skips a topic with no result.
- **PATTERN**: `app/retest.js:320-352` (`begin`) and `:354-372` (`renderIntro`).
- **GOTCHA**: `scoreOf` walks `boss.topics`. A topic whose every slot was dropped yields no row. That
  is correct: no retest is posted for a topic that had no question.
- **GOTCHA**: with the build moved into `load`, a failed pack fetch now shows `TEXT.notLoaded` on load
  with no Begin button, instead of after Begin. `begin` no longer fetches. The existing "begin: … no
  working shown" test still holds, because built items live in memory and the working enters the DOM only
  in the check handler.
- **VALIDATE**: `bun test src/marking/retest-dom.test.ts src/marking/retest.test.ts`
- **SATISFIES**: AC 9.

### A2 UPDATE `src/marking/retest-dom.test.ts` (F5 tests)

- **IMPLEMENT**: Use `setStep(...)` and `api.reload()` (harness at `retest-dom.test.ts:61-63`, `:109`).
  Put these tests **last** in the file, because the earlier tests depend on the served boss.
  (a) All slots unbuildable: `{kind:"boss", boss:{day:DAY, seed:1, topics:["no/such"],
  slots:[{topic:"no/such", item:null, seed:1}]}, start: startBody("boss", null)}`. The page shows
  `TEXT.noQuestions`, has no `#intro button`, and `posts()` is empty.
  (b) One unbuildable slot out of four: `{…bossStep, boss:{…b, topics:[A,"no/such"], slots:[...b.slots,
  {topic:"no/such", item:null, seed:1}]}}`. The intro starts `"3 questions from 1 topic."`.
- **GOTCHA**: the unbuildable slot must have `item: null`. A non-null item id makes `fetchPack` request
  `/content/maths/items/no-such.json`. The fake fetch answers that with 404, so `getJson` throws and the page
  shows `notLoaded`, not `noQuestions`, which is the wrong branch. With `item: null`, `rollFor` finds no
  generator for `no/such` and drops the slot (`app/retest.js:56-64`).
- **VALIDATE**: `bun test src/marking/retest-dom.test.ts`. Also revert A1's reorder and confirm (a) goes red
  (the start is posted) and record it.
- **SATISFIES**: AC 9.

### A3 UPDATE `src/marking/map-dom.test.ts` (PR #36 F4)

- **IMPLEMENT**: Register once with `url: "http://127.0.0.1:4731/map.html?day=2026-10-10"` (the file's only
  `GlobalRegistrator.register`, line 15). Add tests: (a) the `/api/next` call carries `?day=2026-10-10`
  (`calls.some(c => c.url === "/api/next?day=2026-10-10")`). The fake fetch's `/api/next` branch must
  match on `url.startsWith("/api/next")`. (b) Set `history.replaceState(null, "", "/map.html?day=2026-13-45")`,
  and make the fake answer `/api/next?day=2026-13-45` with `400 {error:"day must be YYYY-MM-DD"}`. After
  `api.reload()`, `#status` reads `TEXT.notLoaded` ("The map did not load…"). Restore the URL after.
- **GOTCHA**: `dayQuery` passes `2026-13-45` through (shape-only regex, `app/map.js:244-247`). The server's
  `isDay` is what refuses it. The test pins that division of labour and does not change `dayQuery`.
- **GOTCHA**: the fake fetch's `/api/next` branch matches `url === "/api/next"` today
  (`map-dom.test.ts:54`). Change it to `url.startsWith("/api/next")`, so the existing tests keep passing
  under the new registration URL.
- **GOTCHA**: `history.replaceState` changing `location.search` under happy-dom is observed (spike,
  2026-09-29).
- **GOTCHA (expected churn, not a regression)**: with `?day=2026-10-10` in `location`, the page forwards
  the query into its links. `map-dom.test.ts:97` expects `"/retest.html"` and becomes
  `"/retest.html?day=2026-10-10"`. Update every href or `went` expectation that `pageFor` builds with
  `query` (`app/map.js:96-101`) to the `?day=` form. Lesson hrefs (`firstLesson`, lines 82, 115, 136) come
  from `/api/lessons` and do not change. Re-read each failing assertion before editing it. Only
  query-suffix differences are expected.
- **VALIDATE**: `bun test src/marking/map-dom.test.ts`
- **SATISFIES**: AC 9.

### B1 UPDATE `src/events/types.ts`: `squad@1` gains `answers` (edit in place)

- **IMPLEMENT**:

  ```ts
  export type SquadAnswer = { answer: string; working: string; correct: boolean };
  export type SquadV1 = Line<"squad", 1> & {
    squad: string; week: string; topic: string; score: number; of: number;
    answers: SquadAnswer[]; // one per question, in round order; score = count of correct
  };
  ```

  `FIELDS["squad@1"]`: the existing checks, plus `Array.isArray(o.answers)`, plus `o.answers.length === o.of`,
  plus every answer is an object with `str(answer) && str(working) && bool(correct)`, plus the count of
  `correct` equals `score`. `KEYS["squad@1"]` gains `"answers"`.
- **GOTCHA**: this edits a v1 shape in place. That is allowed only because no GitHub release exists
  (observed 2026-09-29: `gh api repos/linardsb/study-tutor/releases --jq length` → `0`, tags → `0`).
- **GOTCHA**: `_complete` (types.ts:201-205) fails `tsc` if `KEYS` misses `answers`.
- **VALIDATE**: `bunx tsc --noEmit`
- **SATISFIES**: AC 4.

### B2 UPDATE `src/events/__fixtures__/squad.v1.jsonl`

- **IMPLEMENT**: Replace the line with one carrying five answers, four `correct: true`, and `score: 4, of: 5`.
  Keep `t`, `squad`, `week`, `topic` as they are.
- **VALIDATE**: `bun test src/events/types.test.ts src/events/replay.test.ts`
- **SATISFIES**: AC 4.

### B3 ADD to `src/events/append.ts`: `makeDataDir`, `listDataDir`

- **IMPLEMENT**:
  - `makeDataDir(dataDir, rel)`: `fs.mkdirSync(dataDir, {recursive:true})`. Then, for each prefix of
    `rel.split("/")` (`squad`, then `squad/<id>`): `const real = resolveInData(dataDir, prefix)`; `mkdirSync(real)`,
    ignoring `EEXIST`; then `lstatSync(real).isDirectory()` or throw `Refused: <prefix> is not a folder`.
    Non-recursive, one level at a time, so every level passes the realpath check before anything is made
    under it.
  - `listDataDir(dataDir, rel): string[]`: `resolveInData(dataDir, rel)`, then
    `readdirSync(real, {withFileTypes:true})`, keeping regular files (`isFile()`, so symlinks are skipped)
    sorted by name. A missing folder (ENOENT, from either call) returns `[]`. Anything else rethrows.
- **PATTERN**: `isMissing`, `resolveInData` in the same file.
- **GOTCHA**: `writeDataFile` does not make subfolders. `postSquad` calls `makeDataDir` first.
- **VALIDATE**: `bun test src/events/append.test.ts`. Add tests there: a nested make, a symlinked `squad` →
  outside refused, list on missing → `[]`, and list skips a symlink and a subfolder.
- **SATISFIES**: AC 2, AC 5.

### B4 CREATE `src/flow/squad.ts` (pure)

- **IMPLEMENT** (names are binding; bodies are sketches):

  ```ts
  export const SQUAD_SLOTS = 5;   // expected: 5 questions ≈ a 10-minute round (the v1 re-test is 3; a squad round is the week's one shared test)
  export const PARENT_SLOTS = 3;  // the parent answers 3 fresh rolls after being taught
  const SLUG = /^[a-z0-9][a-z0-9-]{0,31}$/;
  /** "Year 11 B " → "year-11-b"; null when nothing valid remains. Both squad id and pupil name become path parts. */
  export function slug(x: unknown): string | null
  // also null for a Windows device name (con, nul, aux, prn, com1–com9, lpt1–lpt9): it would become a folder or file name
  export type SquadRound = { squad: string; week: string; topic: string; seeds: number[]; parentSeeds: number[] };
  /** Pack topics with a generator, in pack order; the pick is hash(`${squad}:${week}`) % n. Null when the pack has none. */
  export function squadRound(squad: string, week: string, pack: CasePack): SquadRound | null
  // seeds[k] = hash(`${squad}:${week}:${topic}:${k}`), k < SQUAD_SLOTS
  // parentSeeds[k] = hash(`${squad}:${week}:${topic}:parent:${k}`), k < PARENT_SLOTS
  /** Days left in the ISO week of day, today included: Monday 7 … Sunday 1. */
  export function daysLeft(day: string): number
  /** The round's generated questions, rolled with lcg(seed). */
  export function roll(round: SquadRound, pack: CasePack, seeds = round.seeds): Generated[]
  /** Server marking: normaliseAnswer(typed) against each accepted answer. */
  export function markRound(qs: Generated[], typed: { answer: string; working: string }[]): SquadAnswer[]
  export type SquadFile = { v: 1; app: string; squad: string; pupil: string; week: string; topic: string;
    seeds: number[]; answers: SquadAnswer[]; score: number; of: number };
  export function squadFile(e: SquadV1, pupil: string, seeds: number[], app: string): SquadFile
  /** Untrusted JSON → SquadFile or null (v, slugs, week /^\d{4}-W\d{2}$/, seeds ints, answers as in FIELDS, score = count correct, of = answers.length). */
  export function parseSquadFile(x: unknown): SquadFile | null
  /** Same week, topic and seeds as mine. */
  export function comparable(mine: SquadRound, f: SquadFile): boolean
  /** Sum of score and of over the rounds given, and how many. */
  export function pool(files: readonly { score: number; of: number }[]): { score: number; of: number; rounds: number }
  ```

- **PATTERN**: `src/flow/boss.ts` (pure, `hash` from `./detective`, `lcg` from `../content/generators`).
- **IMPORTS**: `hash` from `./detective`; `lcg` from `../content/generators`; `normaliseAnswer` from
  `../marking/normalise`; types from `../content/types` and `../events/types`.
- **GOTCHA**: The seed is built from `topic`, as D9 says: `hash(squad id, ISO week, topic)`. The topic pick
  depends on the pack's generator-topic list and its order. Two installs with different packs can pick
  different topics, which is why `comparable` checks `topic` and `seeds`. `app` (the version) is
  informational only.
- **GOTCHA**: `daysLeft` uses calendar arithmetic on the London day passed in. No `Date.now`.
- **Golden values** (observed 2026-09-29 with this exact formula, via a spike running two `bun -e`
  processes): `squadRound("year11-b", "2026-W41", maths pack)` has `topic` `"1MA1/R9/of-an-amount"`, and its
  five rolled stems are `"Find 60% of 350."`, `"Find 35% of 240."`, `"Find 55% of 80."`, `"Find 12% of 40."`,
  `"Find 35% of 300."`. Pin these in `squad.test.ts`. A drift in the pick or seed formula then fails loudly
  instead of silently changing every squad's questions mid-week.
- **VALIDATE**: `bun test src/flow/squad.test.ts`
- **SATISFIES**: AC 1, AC 3, AC 5.

### B5 CREATE `src/flow/squad.test.ts`

- **IMPLEMENT**:
  - `slug`: `" Year 11 B "` → `"year-11-b"`; `"../x"`, `""`, `"a/b"`, a 40-char name, `"CON"`, `"nul"`,
    `"com1"`, `"lpt9"` → `null`; `"con-1"`, `"com10"` → kept.
  - `squadRound` is deterministic, its topic has a generator, 5 distinct seeds, 3 parent seeds disjoint
    from them, and a different week or squad gives different seeds.
  - `daysLeft` over `2026-10-05` (Mon) … `2026-10-11` (Sun) = 7 … 1.
  - `markRound`: `" 4.50 "` against `["4.5"]` is correct. Score = count.
  - `parseSquadFile` refuses: non-object, `v: 2`, pupil `"../x"`, `of` ≠ `answers.length`, score ≠ count,
    a non-boolean `correct`, week `"2026-41"`.
  - `comparable`: false on another topic, other seeds, or another week.
  - `pool` sums.
  - **Two machines (AC 1)**: `Bun.spawnSync(["bun", "-e", SCRIPT], {cwd: repo root})` twice, where `SCRIPT`
    imports `src/api/case.ts`'s `loadCasePack` and `src/flow/squad.ts`, builds
    `squadRound("year11-b", "2026-W41", pack)`, and prints `JSON.stringify(roll(...).map(q => ({stem: q.stem, answers: q.answers})))`.
    Put the squad id into `SCRIPT` by string interpolation, not argv. Under `bun -e` the first extra argument
    is `process.argv[1]`, not `[2]` (observed 2026-09-29: `bun -e '…' -- year11-c` prints
    `["…/bun","year11-c"]`). The spike used `[2]`, got the default for every run, and the "differs" check
    failed until this was fixed.
    The second spawn gets a different environment from the first, which is what differs between two PCs:
    `env: { ...Bun.env, TZ: "Pacific/Auckland", LANG: "de_DE.UTF-8", LC_ALL: "de_DE.UTF-8" }` against the
    first's `TZ: "Europe/London", LANG: "en_GB.UTF-8"`. Assert both exit 0, both stdouts are equal and
    non-empty, and the output parses to 5 questions. A third run with `"year11-c"` differs.
    A second assertion in the same file: `content/maths/generators.js` does not match
    `/toLocale|Intl\.|new Date|Date\.now|Math\.random/`. Observed 2026-09-29: no match today. This pins the
    property (a generator depends only on its rng) rather than the harness.
    Spike result (observed 2026-09-29, `spike-t14.test.ts`, since deleted): London/en_GB and
    Auckland/de_DE produced byte-identical stdout, both exit 0, about 180 ms for three spawns. A different
    squad id produced different output.
- **GOTCHA**: a repo hook blocks any Bash command containing the dot-env substring (memory: hook blocks
  the dot-env substring), and `Bun.env` contains it. Write this test file with Write/Edit, never a heredoc.
- **VALIDATE**: `bun test src/flow/squad.test.ts`. Mutation: change the seed string in `squadRound` to add
  `Date.now()`. The two-process test must go red. Record it, then restore.
- **SATISFIES**: AC 1, AC 3, AC 5.

### C1 UPDATE `src/api/event.ts`: `/api/event` refuses a squad body

- **IMPLEMENT**: In `refusal`: `if (event.type === "squad") return "Refused: a squad round is saved through /api/squad";`
- **WHY**: A `squad` event without its file, or with answers the server did not mark, would break "the
  file is the event's projection".
- **VALIDATE**: `bun test src/api/event.test.ts`. Add a case that expects 400 and no line written.
- **SATISFIES**: AC 4.

### C2 CREATE `src/api/squad.ts`

- **IMPLEMENT**:

  ```ts
  export type SquadMember = { pupil: string; comparable: boolean; answers?: SquadAnswer[] };
  export type SquadView = {
    day: string; week: string; daysLeft: number;
    profile: { squad: string; pupil: string } | null;
    folder: string | null;            // absolute path of data/squad/<squad>, for the "copy friends' files here" line
    round: (SquadRound & { title: string }) | null;
    mine: SquadFile | null;
    members: SquadMember[];           // other pupils this week, sorted by pupil name; answers only when mine !== null
    total: { score: number; of: number; rounds: number };  // mine + comparable members
    unreadable: number;               // files in the folder left out (bad JSON, bad shape, symlink, unreadable)
    shared: boolean;                  // mine's file is on disk
    parentDone: boolean;              // a parent-round teachback this ISO week: type teachback, no `item`, topic = round.topic, of = PARENT_SLOTS
                                      // (T9's chat teach-backs always carry `item`, src/flow/chat.ts:98, so they never match)
  };
  export function squadProfile(dataDir): { squad: string; pupil: string } | null  // from readProfile; both through slug
  export function getSquad(dataDir, pack, day, heal: boolean): { status: 200; body: SquadView }
  export function postSquad(body, dataDir, pack, day, now = utcNow): { status: 201; body: SquadView } | { status: 400 | 409 | 500; body: { error: string } }
  export function joinSquad(body, dataDir): { status: 200; body: SquadView-less {profile} } | { status: 400; body: { error } }
  ```

  - `mineEvent(dataDir, squad, week)`: the **first** `squad` event in `readLines` order with that squad
    and week (`parseEvent`). A second one, for example from a race between two tabs, is ignored.
  - `getSquad`: no profile → `profile: null`, `round: null`, empty members, zero total. With a profile:
    `round = squadRound(...)`. Find `mine` from the event. If mine exists and the file is missing or unreadable,
    rewrite it (`makeDataDir` + `writeDataFile`), **but only when `heal` is true**. A failure there is
    logged. `getSquad(dataDir, pack, day, heal)` takes `heal` from the route:
    `heal = isoWeek(day) === isoWeek(localDay(utcNow()))`, computed in `server.ts` where the clock is read, so
    the api function reads no clock. A `?day=` GET for another week is read-only (`server.ts:127`) and never
    writes. The file holds one week, so healing last week's round over it would replace this week's.
    `shared` = the on-disk file parses and deep-equals this week's projection
    `squadFile(mine, pupil, round.seeds, VERSION)`, ignoring `app`. File existence alone does not count.
    `members` = `listDataDir(dataDir, "squad/<squad>")`, keeping `*.json`. Each file is read inside
    its own try/catch (`readDataJson` rethrows `Refused`), put through `parseSquadFile`, and skipped when it is
    null (`unreadable += 1`), its pupil is mine (`unreadable += 1`: a copy of your own name is not a friend),
    or its week is not this week (ignored silently). Duplicate pupils: the first by file name wins, and
    the later one counts in `unreadable`. `comparable` is from `comparable(round, f)`. **`answers` is attached
    only when `mine !== null`** (the server-side guard). `total = pool([mine, ...comparable members])`,
    with mine left out when it is null.
  - `postSquad`: profile required (400 "Join a squad first."). Body is `{week, answers: {answer, working}[]}`.
    `week !== isoWeek(day)` → 409 "The squad week has changed. Reload for this week's round.". `answers`
    length must equal `SQUAD_SLOTS`, with `answer` ≤ 100 chars and `working` ≤ 500 chars, otherwise 400. Mine
    already in the log → 409 "You have done this week's round." with nothing written. Then `roll`,
    `markRound`, `appendEvent(dataDir, {v:1, type:"squad", squad, week, topic, score, of, answers}, now)`.
    An append failure → 500 and nothing else happens. Then `makeDataDir` + `writeDataFile` of
    `squadFile(saved, pupil, round.seeds, VERSION)`. A failure is logged and does not fail the request.
    Return `201` with `getSquad(dataDir, pack, day, true)`'s view (a POST is always this week, so it heals), whose `shared` says whether the file landed.
  - `joinSquad`: `slug(body.squad)`, `slug(body.pupil)`. Either null → 400 "Use letters, numbers and dashes
    for the squad and your name.". Write `{ ...readProfile(dataDir), squad, pupil }`.
- **WRITE ORDER, worst case** (Q5): event first, then file.
  - Event saved, file fails: the pupil's record is right and friends cannot see the round yet. The
    page says so. The next `GET` rewrites the file. Worst case: the disk stays unwritable and friends
    never see it. Nothing is lost from the record.
  - Event fails: 500 and no file. The page keeps the answers and offers "Try saving again".
  - The reverse order, file then event, has a worse failure. Friends would see a round the pupil's own
    record does not hold, and a retry would be refused by nothing, which could produce a second file
    version.
- **GUARD (restated per CLAUDE.md)**: no model job and no prompt in this ticket. The answer-withholding
  rule applies to friends' answers: `members[].answers` is only present when this pupil's `squad` event for
  the week exists. That is enforced in `getSquad` and tested in C3. The round's own answers reach the
  browser the way boss and practice answers already do (rolled in the page, working revealed only in
  the check handler).
- **IMPORTS**: `readLines`, `appendEvent`, `readDataJson`, `writeDataFile`, `makeDataDir`, `listDataDir`,
  `resolveInData` from `../events/append`; `parseEvent` from `../events/types`; `readProfile`, `PROFILE_FILE`
  from `../config` / `../events/append`; `isoWeek`, `utcNow` from `../mcp/clock`; `VERSION` from `../updates`;
  flow from `../flow/squad`.
- **GOTCHA**: `folder` is `path.join(fs.realpathSync(dataDir), "squad", squad)`, shown as text only.
  Create `data/` only on a write. A GET with no profile creates nothing, because readers treat a missing
  folder as empty.
- **VALIDATE**: `bunx tsc --noEmit && bun test src/api/squad.test.ts`
- **SATISFIES**: AC 2, AC 4, AC 5, AC 6, AC 7.

### C3 CREATE `src/api/squad.test.ts`

- **IMPLEMENT** (temp `data/`, the real maths pack via `loadCasePack`, fixed `day = "2026-10-10"`, and the
  expected answers taken from `roll()`):
  1. No profile: 200, `profile: null`, and no `data/` created.
  2. Join: `{squad:" Year11 B", pupil:"Sam"}` → profile `{squad:"year11-b", pupil:"sam"}` and
     `weeklyTarget` kept. `pupil: "../x"` → 400 and the profile is unchanged.
  3. POST a round with 4 right answers: 201. Exactly one `squad` line whose `score` is 4, `of` is 5,
     `answers[k].correct` as marked, and `answers[k].working` kept. `data/squad/year11-b/sam.json` equals
     `squadFile(...)`, and `view.mine` equals it.
  4. A second POST in the same week: 409, and the log still has one squad line.
  5. `week` mismatch: 409 and nothing written.
  6. **Guard**: write a valid friend file `alex.json` first. A GET before mine: `members[0]` has
     `comparable: true` and **no `answers` key**, and `total` counts alex only. After the POST: `answers` is
     present. Mutation step: remove the `mine !== null` condition. This test goes red. Record it.
  7. **Degrade**: add `bad.json` (`{`), `shape.json` (`{"v":1}`), `old.json` (valid, week `2026-W40`) and
     `link.json` (a symlink to a file outside `data/`, skipped on Windows). GET → 200, `unreadable` counts
     the bad ones, `old` is absent, the total is mine plus alex only, and nothing throws.
  8. **Not comparable**: `other.json` with a different topic → `comparable: false` and not in the total.
  9. **Missing folder**: profile set, no `squad/` folder → 200 and solo (`members: []`, `total` = mine
     only after a POST).
  10. **Self-heal**: delete `sam.json` after the POST. GET with `heal: true` rewrites it and says
      `shared: true`. GET with `heal: false` leaves it missing and says `shared: false`.
  10b. **No cross-week heal**: after this week's POST, `getSquad(dataDir, pack, "2026-10-03", false)` (the previous
      ISO week, `2026-W40`) leaves `sam.json` byte-identical (`fs.readFileSync` before and after). Also:
      corrupt `sam.json` to `{`. Then a same-week GET with `heal: true` rewrites it, and a `heal: false` GET
      reports `shared: false` and leaves it as it is.
  11. **File write fails**: make `data/squad/year11-b` a file, not a folder, before the POST. The result
      is 201, `shared: false`, and the squad line is present.
  12. `/api/event` refuses a squad body (C1).
  13. `parentDone`: false after the round; true after appending `{type:"teachback", topic: round.topic,
      marks:2, of:3}` (no `item`) with a `t` in the same ISO week. It stays false for another topic, for the
      previous week, and for a chat-style teachback `{topic: round.topic, item: "maths/x/1", marks:3, of:4}`.
- **VALIDATE**: `bun test src/api/squad.test.ts`
- **SATISFIES**: AC 2, AC 4, AC 5, AC 6, AC 7.

### C4 UPDATE `src/server.ts`: routes

- **IMPLEMENT** in `apiRoutes`:

  ```ts
  "/api/squad": {
    GET: (req) => dayRoute(req, root, pack, "Could not read the squad", (p, day) =>
      getSquad(dataDir, p, day, isoWeek(day) === isoWeek(localDay(utcNow()))).body),
    POST: (req) => postSquadRoute(req, root, dataDir, pack),
  },
  "/api/squad/join": { POST: (req) => postJoinRoute(req, dataDir) },
  ```

  `postSquadRoute`: `refuseForeign`, parse the JSON body (400), load the pack, call
  `postSquad(body, dataDir, pack, localDay(utcNow()))`, and return a logged 500 on a throw. **No `?day=` on
  the POST**: `dayRoute`'s `?day=` is read-only (`server.ts:127`), and every write takes its day from the
  clock. The body's `week` guards against a rollover between the GET and the POST. `postJoinRoute`
  mirrors `postConfigRoute`.
- **GOTCHA**: `dayRoute` returns `build`'s value as the 200 body, so pass `getSquad(...).body`.
- **GOTCHA**: Wave 5 tickets (T12, T13, T15, T17) also add rows to `apiRoutes`. Expect a textual merge
  conflict there and nothing semantic.
- **VALIDATE**: `bun test src/server.test.ts` (the key-leak walk covers the new routes automatically).
  Then the manual curl in Level 4.
- **SATISFIES**: AC 2, AC 4.

### D1 CREATE `app/squad.html`

- **IMPLEMENT**: Mirror `app/retest.html`. Title "Squad". The crumb links to the map. Aim: "The same five
  questions as your squad this week. Do yours, then compare working." Sections: `#join`, `#week` (days
  left, pooled total), `#round` (class `quiz`), `#compare`, `#parent`, `#share` (folder path and save
  button), `p#status`. Footer: "The total is the squad's, not anyone's own. Nobody is put in order."
  (No word D3's grep bans.) Scripts in
  this order: `/content/maths/generators.js`, `/quiz.js`, `/squad.js`.
- **VALIDATE**: covered by D3/D4 tests.
- **SATISFIES**: AC 3, AC 8.

### D2 CREATE `app/squad.js`

- **IMPLEMENT**: An IIFE in the `retest.js` shape. Exports on `globals().squad = Object.assign(api, {TEXT, buildRound, parentItems, roundBody, daysText, totalText, memberOrder})`.
  - `TEXT` holds every pupil-facing string, including `daysLeft(n)` ("The squad week ends on Sunday. n
    days left, today included." with the singular handled), `total(score, of, rounds)` ("Squad total this week: 12 of
    15 from 3 rounds."), `solo` ("Only your round so far. Friends' files go in the folder below."),
    `notComparable` ("Their tutor set different questions this week, so their round is not counted. An
    update on either side fixes it."), `unreadable(n)`, `saved`, `notShared` ("Saved to your record. Your
    squad file could not be written yet; it is tried again next time this page opens."), `done`, the
    join labels, and the parent round text (`parentIntro`: "Explain question 1 to a parent using your
    working. Then they answer these three on their own.", `parentResult(m, of)`).
  - `buildRound(round, topics, gens, quiz)`: `round.seeds.map(s => quiz.itemFromGenerated(round.topic, gens[code](quiz.lcg(s)), s))`.
    Returns `[]` when the topic has no generator here.
  - Flow: `GET /api/squad${dayQuery()}`.
    - `profile === null`: a join form posting to `/api/squad/join`, then reload.
    - `mine === null`: the round, one go per question with an optional working box (`textarea`,
      maxlength 500), marked locally with `quiz.mark` for instant feedback, working revealed in the check
      handler only. When all are checked, `POST /api/squad` `{week, answers}`. The render uses the
      returned view. On failure: `TEXT.notSaved` and a "Try saving again" button that re-posts the same
      body.
    - `mine !== null`: the compare view. One block per question: stem, the model working, then one row
      per person, you first then members in `memberOrder` (by pupil name, **never by score**), showing that
      person's answer, working and a right/not yet mark. No per-person total anywhere. Then the parent
      round.
  - Parent round: shown only when `mine !== null && !view.parentDone`; when `parentDone`, a one-line
    `TEXT.parentDone` instead. `parentItems(round, …)` rolls `round.parentSeeds`. The parent answers the three
    questions (one go each, same `wireCheck`). On the third check, `POST /api/event`
    `{v:1, type:"teachback", topic: round.topic, marks, of: PARENT_SLOTS}`, then show `parentResult`.
  - Share block: `folder` as text and "Save my file" (`Blob` of `JSON.stringify(mine, null, 2)`,
    `a.download = "<pupil>.json"`, `URL.createObjectURL`). Hidden until `mine !== null`. `Blob` and
    `URL.createObjectURL` exist under happy-dom (observed, spike 2026-09-29). The DOM test asserts the
    link's `download` attribute and does not click it.
  - Week block: `daysText(view.daysLeft)`, `totalText(view.total)`, plus `solo` when there are no
    members.
- **PATTERN**: `app/retest.js` (`el`, `getJson`, `postEvent`, `buildQ`, `wireCheck`, `dayQuery`).
  Copy them; do not import them. Browser files share nothing but globals.
- **GOTCHA**: No `localStorage`, `sessionStorage`, `indexedDB` or `document.cookie` (banned by
  `retest.test.ts:198`). Do not write the string `Bun.` anywhere.
- **GOTCHA**: Friends' answers and working are pupil-typed text. Insert them with `textContent` only,
  never `innerHTML`.
- **GOTCHA**: Use no ranking vocabulary in code or strings (`rank`, `leader`, `winner`, `top`, `1st`, `place`,
  `best`, `beat`), because D4 greps for them. Name the ordering helper `memberOrder`.
- **VALIDATE**: `bun test src/marking/squad.test.ts src/marking/squad-dom.test.ts`
- **SATISFIES**: AC 3, AC 6, AC 7, AC 8.

### D3 CREATE `src/marking/squad.test.ts`

- **IMPLEMENT**:
  - Load `quiz.js` and `squad.js` as in `retest.test.ts:39-44`.
  - **Browser roll = Bun roll**: for `squadRound("year11-b","2026-W41",pack)`, `page.buildRound(...)`
    stems and answers equal `roll(round, pack)`'s.
  - **Register**: no `!` and no emoji in `squad.html` text or any `TEXT` value (reuse the `clean` idea).
  - **No ranking (AC 8)**: `squad.html` and `squad.js` source must not match
    `/\b(rank|ranking|ranked|leader|leaderboard|winner|top scorer|1st|2nd|3rd|place|beat|best score)\b/i`.
    D1's footer is phrased to pass this grep unmodified. Keep the grep strict.
- **VALIDATE**: `bun test src/marking/squad.test.ts`
- **SATISFIES**: AC 1, AC 8.

### D4 CREATE `src/marking/squad-dom.test.ts`

- **IMPLEMENT**: happy-dom registered at `http://127.0.0.1:4731/squad.html?day=2026-10-10`, with a fake
  fetch serving `/api/squad*`, `/api/squad/join`, `/api/event` and `/content/maths/topics.json`. Import
  the page with `?dom`.
  1. `profile: null` → the join form. Submitting posts `{squad, pupil}` to `/api/squad/join` once.
  2. Round: 5 questions, no working in the DOM before a check, one go each. After 5 checks, exactly one POST
     to `/api/squad` with `week` and 5 `{answer, working}`.
  3. Compare view with members `zoe` (score 5) and `alex` (score 1): the rows read you, alex, zoe
     (alphabetical, not by score). No element's text matches `/\b\d+ of 5\b/` except the pooled total
     line. The friend's working is rendered as text: a `<b>` in it shows literally.
  4. No members → the `solo` line. `unreadable: 2` → the `unreadable(2)` line.
  5. A 500 from the POST shows `notSaved` and "Try saving again". The retry re-posts the identical body.
  6. `shared: false` → the `notShared` line.
  7. Parent round: 3 questions. After 3 checks with 2 right, one POST to `/api/event` with
     `{type:"teachback", topic, marks:2, of:3}`. With `parentDone: true` the round is not rendered and
     `TEXT.parentDone` shows.
- **VALIDATE**: `bun test src/marking/squad-dom.test.ts`
- **SATISFIES**: AC 3, AC 6, AC 7, AC 8.

### E1 UPDATE `src/marking/retest.test.ts:198-225`: POST allowlist

- **IMPLEMENT**: Widen the regex to `/fetch\(\s*"(\/api\/[a-z/]+)"[\s\S]{0,120}?method:\s*"POST"/g`. Allow
  `(event|config|chat|squad|squad\/join)`. If T12 has merged first, its `coach` is already in the list:
  keep it, and the result is the union (see Merge protocol). Update the comment: squad posts write only through
  `appendEvent` / `writeDataFile` on the server. Add `squad.html` to the register test's file list and
  `squad` TEXT to its strings, or leave that to D3. Do one, not both.
- **GOTCHA**: `squad.js` must call `fetch` with a string literal URL for the regex to see it. `postEvent`
  takes the URL as a parameter in `retest.js`, and the test only sees literal-URL fetches. Write
  `fetch("/api/squad", { method: "POST", … })` and `fetch("/api/squad/join", { method: "POST", … })`
  literally.
- **VALIDATE**: `bun test src/marking/retest.test.ts`. Mutation: temporarily add
  `fetch("/api/other", { method: "POST" })` to `squad.js`. The test must go red. Restore.
- **SATISFIES**: AC 2.

### E2 UPDATE `app/index.html`

- **IMPLEMENT**: `<p><a href="/squad.html">Squad</a></p>` after "Today's case".
- **VALIDATE**: `bun test`

### E3 UPDATE `.claude/references/events.md`

- **IMPLEMENT**: Routes paragraph: `GET/POST /api/squad`, `POST /api/squad/join`; `/api/event` refuses
  `squad`; `squad@1` carries `answers`; `data/squad/<squad>/<pupil>.json` is the projection of the week's
  first `squad` event and is written by `writeDataFile` after `makeDataDir`; friends' files are read-only
  and their answers are served only after the pupil's own round. Config and profile: `profile.json` gains
  `squad`, `pupil` (slugs).
- **VALIDATE**: read it back. No test.

### E4 Gate

- **VALIDATE**: `bun run check` green; `bun scripts/test-generators.ts` green.

---

## TESTING STRATEGY

### Unit Tests

`src/flow/squad.test.ts` (pure functions and the two-process AC 1 test), `src/events/append.test.ts` (new
helpers), `src/events/types.test.ts` (fixture), `src/marking/squad.test.ts` (browser helpers, register,
ranking grep).

### Integration Tests

`src/api/squad.test.ts` drives `getSquad` / `postSquad` / `joinSquad` against a real temp `data/` and the
real pack. `src/marking/squad-dom.test.ts` runs the page in the order the app does: GET view → join
→ GET → round → POST → render returned view → parent round → POST `/api/event`. No sockets in this ticket.

### Edge Cases

| Edge case | Verified in |
|---|---|
| Malformed JSON, wrong shape, other week, symlink out | `src/api/squad.test.ts` #7 |
| Different topic or seeds (pack skew) | `src/api/squad.test.ts` #8 |
| No squad folder at all | `src/api/squad.test.ts` #9 |
| Own file deleted after the round | `src/api/squad.test.ts` #10 |
| Own file write fails | `src/api/squad.test.ts` #11 |
| Second round same week (second tab) | `src/api/squad.test.ts` #4 |
| Week rolls over between GET and POST (Sunday midnight) | `src/api/squad.test.ts` #5 |
| Path-shaped squad id or pupil (`../x`) | `src/flow/squad.test.ts` slug, `src/api/squad.test.ts` #2 |
| Friend answers before own round | `src/api/squad.test.ts` #6 |
| Friend's working holds HTML | `src/marking/squad-dom.test.ts` #3 |
| Scores order the members | `src/marking/squad-dom.test.ts` #3 |
| A `squad` body posted to `/api/event` | `src/api/event.test.ts` |
| Two identical files with the same pupil under different names | `src/api/squad.test.ts` #7 (add a duplicate) |
| Unbuildable boss (F5) | `src/marking/retest-dom.test.ts` |
| Malformed `?day=` on the map (F4) | `src/marking/map-dom.test.ts` |

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
bunx tsc --noEmit
bunx biome check .
```

### Level 2: Unit Tests

```bash
bun test src/flow/squad.test.ts src/events src/marking/squad.test.ts
```

### Level 3: Integration Tests

```bash
bun test src/api/squad.test.ts src/marking/squad-dom.test.ts src/marking/retest-dom.test.ts src/marking/map-dom.test.ts
bun run check
bun scripts/test-generators.ts
```

### Level 4: Manual Validation

Everything below uses only what this ticket ships. Two "machines" are two `data/` folders on one
computer, which is the honest local oracle for "two installs": separate records and the same pack.

1. `bun run dev`, then open `/squad.html`. Join as squad `year11-b`, pupil `sam`. Do the round (type a
   wrong answer for one). The page shows the compare view with you only, the `solo` line and "Squad total
   this week: 4 of 5 from 1 round."
2. `ls data/squad/year11-b/` shows `sam.json`. `tail -1 data/events.jsonl` is one `squad` line with 5 answers.
3. Second install: `git worktree add <scratchpad>/t14b HEAD` (its own empty `data/`), `bun install` there,
   then `bun src/server.ts` from it (it picks the next free port). Join `year11-b` as `alex`. Confirm the
   five stems are identical to step 1's and that `curl -s localhost:<port>/api/squad | jq .round.seeds` is
   equal on both ports. Remove the extra worktree afterwards.
4. Before alex's round, copy `sam.json` into the second `data/squad/year11-b/`. Reload. Sam is listed and the
   total counts sam, but no answers are shown. `curl` the view: `members[0]` has no `answers` key.
5. Do alex's round. The compare view shows alex (you) then sam, both answers per question, and the pooled
   total. Copy `alex.json` back to the first `data/squad/year11-b/`. Sam's page shows alex too.
6. Write `{` into `data/squad/year11-b/broken.json`. Reload. The page still renders and shows the
   unreadable line.
7. Parent round on sam's page: answer 2 of 3. `tail -2 data/events.jsonl` shows a `teachback` with
   `marks: 2, of: 3` and its `xp` 15.
8. Open `/retest.html` with nothing due. F5 has no visible change when there is a boss. The unbuildable
   case is covered only by A2's test, because no seed state reaches it from the UI.
9. `curl -s -X POST -H 'content-type: application/json' localhost:<port>/api/event -d '{"v":1,"type":"squad","squad":"x","week":"2026-W41","topic":"1MA1/R4","score":0,"of":0,"answers":[]}'`
   returns 400 "Refused: a squad round is saved through /api/squad".

### Level 5: Additional Validation (Optional)

`agent-browser` over steps 1, 5 and 7 for screenshots. Scroll into view before clicking (memory:
agent-browser scroll-before-click).

---

## ACCEPTANCE CRITERIA

- [ ] AC 1: The same squad id and ISO week yield the same items on two machines. The test runs
  `generators.js` in two separate Bun processes and compares the output (`src/flow/squad.test.ts`). The
  browser roll equals the Bun roll (`src/marking/squad.test.ts`).
- [ ] AC 2: `data/squad/<squad>/<pupil>.json` is written only for the local pupil. No route writes another
  pupil's file, and friends' files are only read.
- [ ] AC 3: `app/squad.html` shows the shared countdown (days left in the squad week), the compare-working
  view and the pooled weekly total.
- [ ] AC 4: A `squad` event per round: exactly one `squad@1` line per saved round, a second round that week is
  refused, and `/api/event` refuses a squad body.
- [ ] AC 5: A missing, malformed, other-week, symlinked or not-comparable squad file degrades to solo with
  a 200 and a visible note.
- [ ] AC 6: Friends' answers are served only after the pupil's own round for the week exists (server-side,
  tested).
- [ ] AC 7: Parent-as-student round: the pupil teaches, the parent answers three fresh questions, and one
  `teachback@1` is posted.
- [ ] AC 8: No individual ranking anywhere. The test greps the page for ranking words, and the DOM test
  checks the order is by name with no per-person totals.
- [ ] AC 9: PR #36 F4 (map `?day=` forwarded and malformed-day case tested) and F5 (boss builds before posting
  start; intro counts buildable questions) are done.
- [ ] `bun run check` green; `bun scripts/test-generators.ts` green.
- [ ] Pupil-facing strings pass `no-ai-slop` then `humanizer` before commit (CLAUDE.md "Prose is a gate").

- [ ] AC 10 (**owed by #42**): friends' files arrive through a mainstream sync folder (Drive, OneDrive,
  iCloud). Property: "a friend's file that appears in the folder by any means is read". The cheapest
  oracle is a file copied in by hand, which is Level 4 step 5 and C3 #3/#6. That answers the property for any
  sync client that writes into `data/squad/<id>/`. It does not show that the mainstream clients can be
  made to write there. They cannot, without a symlink, and `resolveInData` refuses a symlink out of `data/`.
  #42 (opened 2026-09-29) owns the parent-chosen folder and the D9 amendment it needs.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order (A may land as its own commit first)
- [ ] Each task validation passed immediately
- [ ] Mutation checks in A2, B5, C3 #6 and E1 recorded in the execution report (red under the mutation, green after)
- [ ] `bun run check` green
- [ ] Manual steps 1–7 and 9 run, and results noted
- [ ] Acceptance criteria all met
- [ ] PR body restates the answer guard (friends' answers withheld until own round; no model job)

---

## OPEN QUESTIONS / ASSUMPTIONS

- **Q1 (answered, observed).** Can `squad@1` be edited in place? Yes.
  `gh api repos/linardsb/study-tutor/releases --jq length` → `0` and `…/tags` → `0` on 2026-09-29, and
  events.md allows an edit in place until the first release. If a release is cut before this merges,
  use `squad@2` plus a reducer case plus a fixture, and have `mineEvent` read both.
- **Q2 (decided by the user 2026-09-29).** The folder lives inside `data/` (`data/squad/<squad>/`).
  Hand-passed files work. A parent-chosen sync folder is follow-up #42, which needs a D9/CLAUDE.md
  amendment.
- **Q3 (decided by the user 2026-09-29).** The "shared countdown" is the days left in the ISO squad week,
  the same for every member with no exchange. There is no live timer.
- **Q4 (decided by the user 2026-09-29).** The topic is picked by `hash(squad:week) % n` over all the pack's
  generator topics (21 of 21 today), so it can be one nobody has learnt yet. The model working shows
  after each question.
- **Q5 (worst case, ordering).** Event first, then file (reasoning in C2). The worst case is a disk that
  stays unwritable, so friends never see the round, while the pupil's record is complete. The page names it
  (`notShared`) on every load until the rewrite succeeds.
- **Q6 (worst case, race).** Two tabs submitting at once can both pass the "already done" check and
  append two `squad` lines. `mineEvent` takes the first, so the file and total reflect one round. The
  second line counts only for the flame, which it would touch anyway. Acceptable. The detective case
  accepts the same race (`replay.ts` "a repeat post changes nothing").
- **Q7 (worst case, skew).** Members on different pack versions pick different topics and are shown as
  not comparable every week until someone updates. The note says what fixes it. The version is
  recorded in the file (`app`) for diagnosis only.
- **Q8 (decision).** The parent round is marked by the parent's own answers (deterministic, no model) and
  saved as `teachback@1` `{topic, marks, of: 3}`, earning the existing 15 XP. It is offered once a week:
  the seeds are fixed for the week and the working shows after the first go, so repeats would be free XP
  and would inflate `xp.byWeek`, half of the guardrail. The gate is the view's `parentDone`, which the
  page reads. A hand-made POST to `/api/event` can still write a teachback. That hole exists today for
  every teachback and this ticket does not widen it.
- **Q9.** A pupil can open friends' files in Finder before doing the round. The guard covers the tool,
  not the file system. That is accepted for a family tool.

## MERGE PROTOCOL (R3)

T12 (`feature/t12-coach-dan`) and T13 (`feature/t13-examiner-mode`) are Wave 5 siblings. On 2026-09-29
both were planned with no commits (observed: `git log origin/main..<branch>` empty). Their plans edit the
same files as T14. Before `piv-create-pr`: `git fetch origin && git rebase origin/main`, then
`bun run check`. Resolve each overlap as follows. Every one of them is additive.

| File | T12 / T13 change | T14 change | Resolution |
|---|---|---|---|
| `src/server.ts` `apiRoutes` | T12 `/api/coach`; T13 snap routes | `/api/squad`, `/api/squad/join` | Keep every row. The key-leak walk in `server.test.ts` covers them all. |
| `src/marking/retest.test.ts` POST allowlist | T12 adds `coach` | E1 widens the regex to `[a-z/]+`, adds `squad`, `squad\/join` | Keep T14's wider regex and the union of names. |
| `src/api/event.ts` `refusal` | T13 refuses `photo` | C1 refuses `squad` | Keep both `if` lines, xp first, then photo, then squad. |
| `src/events/types.ts` | T12 adds `coach@1`; T13 edits `photo@1` | B1 edits `squad@1` | Separate rows in every table. `_complete` and `tsc` confirm the merge. |
| `src/events/replay.ts` | T12 reducer case, T13 `shape` → 4 | none (A0 fallback only) | Take theirs. If B1-alt ran, add `squad@2` beside theirs. |
| `app/map.js`, `src/marking/map-dom.test.ts` | T13 edits `load`, the exports and the harness | A3 changes the registration URL and the `/api/next` match | Keep T13's harness and reapply A3's two edits: the `?day=` URL and `startsWith`. Re-run `bun test src/marking/map-dom.test.ts`. |
| `.claude/references/events.md` | both add route and type lines | E3 adds squad lines | Keep all lines. |
| `app/index.html` | none planned | E2 adds a link | No conflict. |

Whoever merges second runs the rebase. If T14 merges first, T12 and T13 inherit the wider allowlist
regex, and their own `coach`/snap entries still match it.

## NOTES (open canvas)

**Why the event carries the answers.** The file must hold answers and working for the compare view. If only
the file held them, the file would be a second record written outside the event log, which conflicts with
"events are the record". With `answers` in the event, the file is a projection like `state.json`. It
can be deleted and rewritten, and the self-heal in `getSquad` needs no extra state.

**Why the server re-marks.** The page marks for instant feedback, but a posted `correct` flag would let a
hand-made POST claim anything. The server rolls the same seeds with the same `lcg` and marks with
`normaliseAnswer`, which `quiz.test.ts` already pins equal to `quiz.norm`. For a well-formed page the two
never disagree. If they do, the server's value is saved and shown.

**Rejected: an import route** (the page uploads a friend's file and the server stores it). It breaks
"written only for the local pupil", and with a synced folder it would overwrite the friend's own copy.

**Rejected: squad `session` events.** They would make `/api/next` return `continue` with mode squad and
need a `pageFor` case in `map.js`. The round is short and one-shot, and nothing reads a squad session.

**Merge risk.** `apiRoutes` in `src/server.ts` and the POST allowlist in `retest.test.ts` are shared with
other Wave 5 tickets. Keep this ticket's rows together so a conflict is a two-line resolve.

**Figures.** `SQUAD_SLOTS = 5` is expected (≈2 min a question, from the boss's 9 questions ≈ 20 min in
`boss.ts:21`: derived 20/9 ≈ 2.2 min; 5 × 2.2 ≈ 11 min). `PARENT_SLOTS = 3` is expected (the re-test's
three). The 21 of 21 pack topics with a generator is observed (`bun -e` over `loadCasePack("maths")`,
2026-09-29), so `squadRound` never returns null on the maths pack today. The null path is still typed
and tested with a stub pack.

## CONFIDENCE

**10/10 for a one-pass implementation.** This is what it rests on, per risk:

- R1 (event version): A0 checks the release count before B1, and B1-alt is fully specified. Both branches
  are plannable now.
- R2 (sync leg): the scope is decided by the user, and the leftover is owned by #42.
- R3 (sibling merges): every overlap is listed with an additive resolution (Merge protocol).
- R4 (countdown, topic pick): decided by the user (Q3, Q4).
- The AC 1 test harness was run end to end as a spike (observed pass). The argv pitfall it hit is written
  into B5.
- happy-dom `history.replaceState`, `Blob` and `URL.createObjectURL` were observed working (spike).
- The F5 test's `item: null` trap is written into A2.
- Golden topic and stems are pinned from an observed run (B4).

## AMENDMENTS

- 2026-09-29: Added A0 with the fully specified `squad@2` fallback (R1). AC 10 is owed by #42 (R2). Added the
  Merge protocol against T12 and T13 (R3). Q3 and Q4 were decided by the user (R4). Spike results were written
  into B4 (golden values), B5 (two processes with different TZ and locale; the `bun -e` argv index), A2
  (`item: null`), A3 and D2 (happy-dom APIs). Added a Confidence section.
- 2026-09-29 (implementation, superseding the tasks named; detail in `.claude/reports/t14-squad-mode-report.md`):
  - A0: releases `0`, tags `0`. B1 ran in place; B1-alt did not run.
  - A1: `renderIntro` is async and awaited in `load`. A new `buildBoss(boss)` does the pack fetch and build. The `begin` signature is as planned.
  - A2: the mutation's red cause is the Begin button and the served-slot count. The old code posts the start only on click.
  - A3: `map-dom.test.ts` casts `globalThis.history`, because tsconfig has no DOM lib.
  - B3: `listDataDir(dataDir, rel)` returns `{ files: string[]; skipped: string[] }`, not `string[]`. `skipped` names symlinks and subfolders, so C2 can count a symlinked `*.json` as unreadable (AC 5).
  - B4: `markRound` marks an empty answer wrong. `parseSquadFile` returns a rebuilt object, so stray keys are dropped.
  - C2:
    - `friends()` catches a refused or ENOTDIR squad folder and returns solo with `unreadable: 1`, not a 500.
    - The pupil's own file name is skipped silently.
    - A file whose `squad` differs from the profile's counts as unreadable.
    - `parentDone` compares `isoWeek(localDay(t))`.
    - `postSquad` with no buildable round returns 400 "There is no squad round to save.".
  - C3: adds 9b (a squad folder symlinked out of `data/`) and a cross-squad file in #7.
  - D2:
    - The pooled total shows before the pupil's own round too.
    - A 409 on save reloads the view instead of offering a retry.
    - The prose gate reworded the D1 footer to "The total belongs to the whole squad. Names are in alphabetical order.". It also changed the endings of `notComparable` ("Updating either tutor fixes it.") and `notShared` ("the tutor tries again next time you open this page.").
  - E1: the register test's file list is unchanged. D3 covers `squad.html` and `TEXT`.
  - Level 4: run over HTTP with two `startServer` instances and two `data/` folders, not a second worktree. The browser half of steps 1, 5 and 7 was not run.
