# Feature: pupil profile (courses and tier) filters every topic list

The following plan should be complete, but validate documentation and codebase patterns before you start. Line numbers are `observed` at `c277595` (#59) in this worktree; `origin/main` had no newer commit on 2026-09-30 (`observed`, `git log c277595..origin/main` empty).

## Feature Description

A pupil picks the courses they study (a course is one exam-board specification, e.g. Edexcel GCSE Mathematics `1MA1`, AQA Combined Science Trilogy `8464`) and, where the course has tiers, Foundation or Higher. The choice is saved in `data/profile.json`. Every surface that offers topics (map, next step, boss, detective case, coach, cold test, sheet and interview intake, MCP `read_state`) then offers only the topics of the chosen courses at the chosen tier. With no choice saved, everything behaves as today.

## User Story

As a friend of Matis on a different board, subject set or tier
I want to tell the tutor which courses I take
So that the map and practice only show topics I will be examined on

## Problem Statement

`loadPacks` (`src/api/case.ts:49-93`) merges every `content/<subject>/` pack into one `CasePack` and every route uses all of it. No file or event records a pupil's board, subjects or tier. `Topic.tier` is validated (`src/content/pack.ts:62`) and read by nothing else in `src/` or `app/` (grep, `observed`). Once a second maths board or a Higher pack ships, every pupil sees all of it.

## Solution Statement

1. **Course metadata per pack.** New `content/<subject>/courses.json`: `[{ "spec": "1MA1", "board": "Edexcel", "title": "GCSE Mathematics", "tiers": ["F", "H"] }]`. `tiers: []` means untiered. Loaded by `loadPacks` only (not `loadCasePack`), so the many tests that call `loadCasePack("maths")` are untouched. Start-up refuses: a topic whose spec prefix (`id.split("/")[0]`, grammar at `src/content/types.ts:14-18`) is not a course of its own pack; a spec claimed by two packs (the `claim` helper, `case.ts:67-74`); a topic in a tiered course whose `tier` is not in that course's `tiers`.
2. **Profile field.** `profile.json` gains `courses: { spec: string; tier?: "F" | "H" }[]`. Architecture D3 (`docs/prd/study-tutor-v2.architecture.md:86`: "`profile.json` holds pupil, board, subjects, weekly target, squad id") and `.claude/references/events.md:33` ("later tickets add `board`") already decide this. No event. Written via `writeDataFile` with every other key kept, as `joinSquad` does (`src/api/squad.ts:418-419`). `postConfig` already keeps unknown keys (`src/config.ts:356`, `{ ...readProfile(dataDir), weeklyTarget }`), so a later settings save keeps `courses`.
3. **One pure filter.** `src/content/profile.ts`:
   - `chosenOf(saved: unknown, courses: readonly Course[]): Chosen[]` reads `readProfile(dataDir).courses` defensively. It takes `unknown`, not `Profile`, so `src/content` does not import `src/config`.
   - `filterTopics(topics, chosen, courses)` keeps a topic when its spec is chosen and (the course is untiered, or the chosen tier is `H`, or the topic tier is `F`). An empty `chosen` returns the same array.
   - `filterPack(pack, chosen, courses)` = `{ ...pack, topics: filterTopics(...) }`, `items` and `gens` untouched by reference; `chosen` empty returns the same object.
   - Higher includes Foundation topics. Pearson's 1MA1 specification, as quoted in a search result on 2026-09-30: "all students will be assessed on the content identified by the standard and the underlined type ... only the more highly attaining students will be assessed on the content identified by bold type". So Higher is assessed on everything Foundation is (`expected` from that quote; the summary page that carried it, https://www.savemyexams.com/learning-hub/exam-specifications/gcse/maths/edexcel/, paraphrases it inconsistently, so the implementer may confirm in the Pearson PDF, section "Subject content").
4. **Offer filtered, render full.** A route that *offers* topics uses the filtered pack; rendering a *saved record* uses the full pack. Per route (`src/server.ts:374-518`, `observed`):

   | Route | Pack | Why |
   |---|---|---|
   | `GET /api/case` | picks from filtered, builds from full | `buildCase` returns null for a topic missing from `pack.topics` (`detective.ts:204-214`), so a case started before a course change would vanish |
   | `GET /api/next` (lesson, practice, boss) | filtered | offers; `dueTopics` and `pickLesson` iterate `pack.topics` |
   | `GET /api/topics`, `GET /api/lessons` | filtered | map (`map.js:342,350`) and intake cold test (`intake.js:184`) offer from them; boss page (`retest.js:305`) looks up slot topics the boss already picked from the filtered pack |
   | `GET /api/intake/diagnostic`, `POST /api/intake/sheet`, `POST /api/intake/interview` | filtered | offers and matching (`intake.ts:47,83` pass `pack.topics`) |
   | `GET /api/coach`, `POST /api/coach` | filtered | coach offers tried topics (`coach.ts:39`); GET and POST must agree or the page posts a topic the route refuses (`coach.ts:55`) |
   | `GET/POST /api/chat`, snap routes, `/api/squad` GET/POST | full | lookups of past work; squad rounds must match across friends (Non-goals) |
   | `POST /api/event` | full `topics` | alias resolution of any past or MCP-written topic |
   | MCP `read_state` topic list | filtered | offers; `topicId` lookup keeps the full list |

5. **Routes.** `GET /api/courses` → `{ courses: Course[], chosen: Chosen[] }`. `POST /api/courses` `{ courses: [{ spec, tier? }] }` → 400 with one sentence for: body not an object with a `courses` array, an empty list, an unknown spec, a missing tier on a tiered course, a tier on an untiered course, a tier not in the course's `tiers`, a repeated spec. Nothing written on a 400. 200 `{ chosen }` after the write.
6. **Intake step.** `app/intake.html` gets a "Your courses" panel above `#doors`. On any install with no valid `chosen` (a fresh one, and Matis's existing one on its first intake visit after the update: intended, one save and the doors return) the panel shows and the doors hide until a save succeeds; otherwise a line names the courses with a "Change courses" button. If `GET /api/courses` fails, the page behaves exactly as today (doors shown, panel hidden).

## Out of Scope / Non-Goals

- No new content. Sackville Year 11 subjects are a separate content ticket per subject after this lands.
- No `profile@1` event; D3 decides `profile.json` (the issue body agrees).
- Squad stays unfiltered: `squadRound` (`src/flow/squad.ts:49-50`) picks by `hash % n` over generator topics, and friends on different profiles must still get the same round (its header comment promises same week + same pack = same round).
- `app/index.html:57-81` home lesson list is static HTML naming 22 lesson files; it is not in the issue's surface list and has no API behind it. Follow-up ticket (to create when this merges): render it from `/api/lessons`.
- `app/practice.js:35` and `app/squad.js:443` read `/content/maths/topics.json` directly: practice is a maths generator page by construction, squad is unfiltered by decision. Unchanged.
- Digest unchanged: it reads state, not topics (`src/digest.ts`).
- No grouping of the map by subject; no parent-side editing on `setup.html`.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: `src/content`, `src/api`, `src/server.ts`, `src/mcp/tools.ts`, `app/intake.*`, `content/*/courses.json`
**Dependencies**: none new (`@happy-dom/global-registrator` already used by `src/marking/intake-dom.test.ts`)

## Related Work

**Implements**: #62 · **Epic**: #1, `docs/prd/study-tutor-v2.architecture.md` D3 and D5

**Back-references**:
- `.claude/plans/t16-science-pack-oak.md` - the multi-subject seam (`loadPacks`, `subjects` map)
- `.claude/plans/t17-intake-doors.md` - the intake page this extends
- `.claude/reports/sackville-y11-curriculum.md` - the courses the follow-up content tickets will add

**Forward-references**:
- Sackville Year 11 content tickets, one per course (to be created)
- Home lesson list from `/api/lessons` (to be created; see Non-goals)

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `src/api/case.ts:22-93` - `loadCasePack`, `Packs`, `loadPacks`, `claim`; courses load and are checked here
- `src/api/case.ts:112-130` - `caseForDay`: gains the optional `offer` pack
- `src/api/case.test.ts:110-157` - `writeSubject`, `row`, the temp-root `loadPacks` tests
- `src/content/pack.ts:30-67` - `subjectDir`, `loadTopics` row validation style to mirror in `loadCourses`
- `src/content/types.ts:12-27,77-82` - `Tier`, `Topic`, `CasePack`
- `src/config.ts:121,211-222,356-359` - `Profile`, `readProfile` (missing file → `{ weeklyTarget: default }`), key-keeping write
- `src/api/squad.ts:389-420` - `joinSquad`: body validation, keep-other-keys write, `{status, body}` result
- `src/server.ts:40-50` (`ServerOptions`), `148-167` (`dayRoute`), `214-228` (`readRoute`), `271-287` (`postJoinRoute`), `311-341` (`postJobRoute`), `374-518` (`apiRoutes`), `585-620` (start-up, `runStdio` context at 618)
- `src/server.test.ts:22-45` - opts inject a maths-only `pack` + `subjects`; `370-402` key-leak route walk (walks new routes automatically)
- `src/mcp/tools.ts:12-20` (`ToolContext`), `63-99` (`topicId`, `read_state`); `src/mcp/tools.test.ts:23-40`, `src/mcp/server.test.ts:13-30` (context builders)
- `src/flow/next.ts:32-49` - `pickLesson`
- `app/intake.html:22-26`, `app/intake.js:142-190` (`el`, `getJson`, `page`, `topicsOnce`), `654-685` (`load`, `api.reload`)
- `src/marking/intake-dom.test.ts:1-80` - happy-dom harness, fake `fetch` with a `served` table, 404 for unknown URLs
- `.claude/references/content-pack.md`, `.claude/references/events.md:30-34`, `.claude/rules/content.md`

### New Files to Create

- `content/maths/courses.json`, `content/science/courses.json`
- `src/content/profile.ts` + `src/content/profile.test.ts`
- `src/api/courses.ts` + `src/api/courses.test.ts`

### Patterns to Follow

- Route result shape `{ status, body }`; 400 bodies `{ error: "<one sentence>" }` that never echo the request (`joinSquad`; the key-leak walk posts `{ preset, key }` to every POST route).
- Every route calls `refuseForeign(req)` first (`server.ts:272`).
- Files in `data/` only through `writeDataFile` (`src/events/append.ts:170`).
- Local `isObj` per module (`config.ts:129`), not a shared import.
- Pupil-facing text: sentence case, British English, no exclamation marks, no emoji (`.claude/rules/content.md`); passes `no-ai-slop` then `humanizer` before save (CLAUDE.md "Prose is a gate").
- Browser JS plain, no framework; DOM via the local `el` and `byId` helpers in `intake.js`.

---

## IMPLEMENTATION PLAN

Phase 1 (tasks 1-4) is types, loading and the pure filter. Phase 2 (5-7b) wires routes and MCP. Phase 3 (8) is the page. Phase 4 (9) docs. Sequential; task 7b is independent of 1-7 and may go first.

---

## STEP-BY-STEP TASKS

### 1. ADD `Course`, `Chosen` to `src/content/types.ts`
- **IMPLEMENT**: `export interface Course { spec: string; board: string; title: string; tiers: Tier[] }` and `export type Chosen = { spec: string; tier?: Tier }`, beside `Tier`.
- **GOTCHA**: `CasePack` stays as is; hand-built `CasePack`s in tests do not change.
- **VALIDATE**: `bunx tsc --noEmit`
- **SATISFIES**: AC1, AC4

### 2. CREATE `content/*/courses.json`; ADD `loadCourses(subject, root)` in `src/content/pack.ts`
- **IMPLEMENT**: maths `[{"spec":"1MA1","board":"Edexcel","title":"GCSE Mathematics","tiers":["F","H"]}]`; science `[{"spec":"8464","board":"AQA","title":"GCSE Combined Science: Trilogy","tiers":["F","H"]}]`. Row check like `loadTopics`: spec matches `/^[A-Z0-9]+$/`, board and title non-empty strings, tiers an array of `F`/`H` with no repeats. Not a non-empty list of such rows: throw `${file}: not a list of course rows`. Missing file: `Bun.file(...).json()` throws; wrap to throw `${file}: missing` so the start-up message names it.
- **PATTERN**: `pack.ts:48-67`
- **GOTCHA**: biome checks `content/*/courses.json` (`biome.json` excludes only `content/*/lessons` and `content/*/reference`, `observed`), and the maths row on one line is over biome's 80-column default. Run `bunx biome format --write content/*/courses.json` after writing them.
- **VALIDATE**: `bunx biome check content` and `bun test src/content` plus cases in `src/content/pack.test.ts`: real maths and science load; a row with `tiers: ["X"]` refused; missing file message names the path.
- **SATISFIES**: AC4

### 3. UPDATE `loadPacks` (`src/api/case.ts`): load, claim and cross-check courses
- **IMPLEMENT**: `Packs` gains `courses: readonly Course[]`. Per subject, `loadCourses(s, root)`; `claim(s, \`course ${c.spec}\`)` for each; build `spec → Course` for this subject; for each topic, refuse when `bySpec.get(prefix)` is undefined (`content/${s}/topics.json: topic ${t.id} has spec ${prefix}, not in content/${s}/courses.json`) or when the course is tiered and `!course.tiers.includes(t.tier)` (`content/${s}/topics.json: topic ${t.id} is tier ${t.tier}, not a tier of ${prefix}`).
- **GOTCHA**: the `claim` error text begins `content/${s}/topics.json:`; for courses write the message by hand with `courses.json` so it names the right file (do not reuse `claim` blindly; give it a `file` parameter or a second helper).
- **GOTCHA**: order per subject: load and claim its courses, then claim its topics as today. With that order a spec in two packs is reported as a course, before any topic claim. The existing temp-root fixtures use distinct prefixes per subject (`AA1` in `aaa`, `BB1` in `bbb`, `ZZ1` in `zz`: `case.test.ts:136-150`, `observed`), so the default courses below collide nowhere and the alias test still gets its alias message.
- **GOTCHA**: `case.test.ts` `writeSubject` (line 110) writes only `topics.json`; three temp-root tests call `loadPacks(dir)`. Give `writeSubject` a fourth parameter `courses` defaulting to one untiered course per distinct topic prefix, and write it. `lessons.test.ts:40` writes a temp `topics.json` but never calls `loadPacks` on it (`observed`), so it needs nothing.
- **VALIDATE**: `bun test src/api/case.test.ts` plus new cases: the repo's `loadPacks()` returns both courses; spec in two subjects refused naming both; a topic prefix missing from its pack's courses refused; an `H` topic in a course with `tiers: ["F"]` refused.
- **SATISFIES**: AC4

### 4. CREATE `src/content/profile.ts` + test
- **IMPLEMENT**: `chosenOf(saved, courses)`: not an array → `[]`; keep an entry when it is an object, its `spec` is a loaded course, it is the first entry for that spec, and its `tier` is in `course.tiers` for a tiered course or absent for an untiered one; return `{ spec, tier? }` copies. Never throws. `filterTopics`, `filterPack` per Solution 3.
- **VALIDATE**: `bun test src/content/profile.test.ts`: F keeps F only; H keeps F and H; untiered keeps all; two courses union; `[]` returns the same object; `items`/`gens` identical by reference; stale spec dropped; `courses: "x"` → `[]`; wrong tier dropped; duplicate spec keeps the first.
- **SATISFIES**: AC1, AC2

### 5. CREATE `src/api/courses.ts` + test: `getCourses(dataDir, courses)`, `saveCourses(body, dataDir, courses)`
- **IMPLEMENT**: `getCourses` → `{ status: 200, body: { courses, chosen: chosenOf(readProfile(dataDir).courses, courses) } }`. `saveCourses` validates per Solution 5 in that order, first failure wins; on success writes `{ ...readProfile(dataDir), courses: chosen }` via `writeDataFile(dataDir, PROFILE_FILE, \`${JSON.stringify(profile, null, 2)}\n\`)` and returns `{ status: 200, body: { chosen } }`. Messages (pupil-facing): "Pick at least one course." / "That course is not in this tutor." / "Pick Foundation or Higher for <title>." / "<title> has no Foundation or Higher." / "Pick each course once." / "Send a list of courses."
- **PATTERN**: `joinSquad` (`src/api/squad.ts:389-420`)
- **VALIDATE**: `bun test src/api/courses.test.ts`: every 400 case leaves `profile.json` byte-identical (or absent); a save keeps `weeklyTarget`, `squad`, `pupil`; a save on a fresh `data/` writes `weeklyTarget` default plus `courses`; no 400 body contains a posted string.
- **SATISFIES**: AC3

### 6. UPDATE `src/server.ts` and `caseForDay`
- **IMPLEMENT**:
  - `ServerOptions` gains `courses?: readonly Course[]`; start-up (line 590) destructures `courses` from `loadPacks` and passes it.
  - In `apiRoutes`: `packs()` returns `{ pack, subjects, courses: opts.courses ?? [] }` when `pack && subjects`, else `loadPacks(root)`. New `both = async () => { const l = pack ? { pack, courses: opts.courses ?? [] } : await loadPacks(root); return { full: l.pack, offer: filterPack(l.pack, chosenOf(readProfile(dataDir).courses, l.courses), l.courses) }; }`, `scoped = async () => (await both()).offer`, `full = async () => (await both()).full`.
  - `dayRoute` becomes `dayRoute<P>(req, load: () => Promise<P>, failed, build: (p: P, day: string) => unknown)`; `postJobRoute(req, server, load: () => Promise<CasePack>, failed, handler)`. The `root`/`pack` params and their inline `loadPacks` go. Callers per the Solution 4 table: `/api/case` → `dayRoute(req, both, ..., (b, day) => caseForDay(dataDir, b.full, day, b.offer))`; next, coach GET/POST, sheet, interview, diagnostic → `scoped`; chat POST, squad GET → `full`. `getChatRoute`, `snapRoute`, `postSquadRoute` unchanged.
  - `/api/topics`: `topicRows(filterPack(...), loaded.subjects)` using `packs()` result; `/api/lessons`: `lessonUrls(root, loaded.subjects, filtered.topics)`.
  - `/api/courses`: GET via `readRoute(req, "the courses", ...)` over `packs()`; POST via a `postCoursesRoute` mirroring `postJoinRoute` (lines 271-287): `refuseForeign`, JSON parse 400, `saveCourses`, catch → 500 "Could not save the courses".
  - `caseForDay(dataDir, pack, day, offer = pack)`: `pickCase(day, state.caseSeed, casePool(offer))`; `buildCase`/`buildReask` keep `pack`. The optional parameter keeps every `case.test.ts` call unchanged.
- **GOTCHA**: injected-pack tests (all of `server.test.ts`, `intake.test.ts:45`) pass no `courses`, so `chosenOf` sees `[]` courses, drops everything, and the pack is unfiltered: today's behaviour with no test edits. Do **not** add `courses` to the `packs()` short-circuit condition; that would reload from `root` and change the pinned maths-only counts (`server.test.ts:26` comment).
- **GOTCHA**: the profile is read on every request inside `both`, so a save applies on the next request without restart. `readProfile` is a small file read; `/api/next` already reads it per request for `weeklyTarget` (`src/api/next.ts:12`, `observed`).
- **GOTCHA**: module caches checked (`observed`): `lessonUrls` keys its cache by root plus the topic id list (`src/api/lessons.ts:13-16`), so a filtered list gets its own entry and a course change is seen on the next call; `case.ts:19,46` and `generators.ts:15` cache pack loading by root, before filtering. No cache needs changing.
- **GOTCHA**: production wiring is not covered by `bun run check`. `ServerOptions.courses` is optional and every test builds its own options, so if start-up (line 590-605) forgets `courses`, everything compiles and tests pass while the tutor ships unfiltered. Level 4 step 5 (21 cards, not 22) is the check that catches it; do not skip Level 4.
- **GOTCHA**: the key-leak walk (`server.test.ts:381`) posts `{ preset: "nope", key: KEY }` to `/api/courses`: it must 400 with "Send a list of courses." and no echo.
- **VALIDATE**: `bun test src/server.test.ts src/api/case.test.ts` plus new tests (the `/api/lessons` assertion counts within one process: science lesson URL present before the save, absent after, so a stale cache would fail it) in `server.test.ts`, each with opts built from `await loadPacks(root)` (both real packs: `{ root, dataDir, topics: l.pack.topics, pack: l.pack, subjects: l.subjects, courses: l.courses }`):
  - Save `[{spec:"1MA1",tier:"F"}]` via `POST /api/courses`: `/api/topics` has 21 rows, none `8464/`; `/api/lessons` has no `content/science/`; `/api/next` names no `8464/` topic; `/api/intake/diagnostic` slots hold no `8464/` topic. Without a save `/api/topics` has 22 (`observed`: 21 + 1).
  - Tier, over a fixture root (the real content is all `F`: `observed`, maths 21 F, science 1 F): a temp `content/aa/` with course `AA1` tiers `["F","H"]` and topics `AA1/X1` (F), `AA1/X2` (H); `content/bb/` with course `BB1` tiers `["H"]` and topic `BB1/X1` (H). `H` on AA1 → both AA topics; `F` on AA1 → only `AA1/X1`; `BB1` at `H` only → `/api/topics` holds only `BB1/X1`. `/api/next` on `[{spec:"AA1",tier:"F"}]` never names `AA1/X2`. Fixture topics need an items file each (task 7b skips item-less topics): write one `cloze` item per topic, shape copied from `content/science/items/8464-4.1.1.2.json`.
  - Saved case survives a course change: append `case@1` for today on `8464/4.1.1.2` (keys per `src/events/types.ts:278`), save `[{spec:"1MA1",tier:"F"}]`, `/api/case` returns a non-null `case` whose topic is `8464/4.1.1.2`.
  - Coach agrees with itself: after saving `8464` only, `GET /api/coach` topics hold no `1MA1/` id, and `GET /api/coach?topic=1MA1/R4` returns `reason: "no-topic"`.
  - Stale profile: write `profile.json` `{ weeklyTarget: 3, courses: [{ spec: "ZZZ9" }] }` by hand → `/api/topics` has 22 and `GET /api/courses` `chosen` is `[]`.
- **SATISFIES**: AC1, AC2, AC3

### 7. UPDATE `src/mcp/tools.ts` `read_state`
- **IMPLEMENT**: `ToolContext` gains required `courses: readonly Course[]` (required so the `--mcp` start-up cannot omit it; `tsc` names every builder). Fill it at `src/server.ts:618` from the same `loadPacks`. In `read_state`, `filterTopics(ctx.topics, chosenOf(readProfile(ctx.dataDir).courses, ctx.courses), ctx.courses)` before the `map` at line 82. `topicId` keeps full `ctx.topics`.
- **GOTCHA**: context builders to update with `courses`: `src/mcp/tools.test.ts:23-40`, `src/mcp/server.test.ts:13-30` (`observed`). `tools.test.ts:273` expects 21 topics from a maths-only context; pass `courses: []` there to keep it.
- **GUARD** (CLAUDE.md "Restate the guard"): the filter narrows only the `topics` list. The `topic` branch is unchanged: items still pass through `toItemView` unless `attemptedItems(lines)` holds their id (`tools.ts:94-97`), so an answer reaches a harness only after an `attempt` event exists, as today.
- **GOTCHA**: `src/mcp/tools.ts` → `src/config` import adds no cycle: `config.ts` imports only `./events/append` (`observed`, lines 1-10).
- **VALIDATE**: `bun test src/mcp` plus a case with `courses` from `loadPacks()` and both packs' topics: `profile.json` `[{spec:"8464",tier:"F"}]` → `read_state` topics hold no `1MA1/` id; `read_state { topic: "1MA1/R4" }` still returns its items.
- **SATISFIES**: AC1

### 7b. UPDATE `pickLesson` (`src/flow/next.ts:33-49`): skip a topic with no items
- **IMPLEMENT**: add `(pack.items.get(t.id)?.length ?? 0) > 0` to the filter. Content tickets will add topic rows before items (allowed, `pack.ts:69-72`); `/api/next` would otherwise send the pupil to an empty lesson. Already safe (`observed`): `diagnostic` skips a null slot (`diagnostic.ts:76-80`), `dueTopics` needs a `nextDue` (started topics only), `casePool` iterates each topic's items (`detective.ts:76-77`).
- **VALIDATE**: `bun test src/flow/next.test.ts` plus a case: a rung-0 topic with no items, first in pack order, is not picked; the next topic is.
- **SATISFIES**: AC6

### 8. UPDATE `app/intake.html` + `app/intake.js`
- **IMPLEMENT (html)**: between `</header>` and `<nav id="doors">` add `<p class="note" id="courses-line" hidden></p>` and `<section id="courses" class="panel" hidden><h2>Your courses</h2><p>Tick each course you take. Where it asks, pick Foundation or Higher. The map then shows only those topics.</p><div id="course-list"></div><p class="actions"><button type="button" id="courses-save">Save courses</button></p></section>`. `#doors` keeps no `hidden` attribute in HTML (fail-open).
- **IMPLEMENT (js)**: `page` gains `courses: null`. `renderCourses(c)`: one `<label>` per course with a checkbox (`data-spec`) and text `${board} ${title}`; for a tiered course a pair of radios named `tier-${spec}` labelled Foundation / Higher. `showCourses(c)`: when `c.chosen.length === 0` show `#courses`, hide `#doors` and `#courses-line`; else hide `#courses`, show `#doors`, set `#courses-line` to `Courses: ` + chosen joined by `; ` as `${board} ${title}` plus `, Foundation`/`, Higher`, then append a "Change courses" button that shows `#courses` with the saved ticks and radios preset. `saveCourses(btn)`: build `[{spec, tier?}]` from ticked boxes, `POST /api/courses`; on 200 set `page.topics = null` (drops the `topicsOnce` cache, `intake.js:182-188`), `page.courses.chosen = reply.chosen`, `showCourses`, `say("Courses saved.")`; on 400 `say(reply.error)`; on a network failure `say("Could not save the courses.")`. In `load()` after the config fetch: `try { page.courses = await getJson("/api/courses"); renderCourses(page.courses); showCourses(page.courses); } catch { show #doors, hide #courses and #courses-line }` (no route: today's page; resetting explicitly keeps DOM tests independent of run order after a `reload()`), and bind `#courses-save`. Export `page` already; add `showCourses` to the `globals().intake` object for tests.
- **GOTCHA**: `load()` already runs at import and is re-runnable as `intake.reload` (`intake.js:670-672`); DOM tests call `reload()` after changing `served`.
- **GOTCHA**: the existing DOM harness answers 404 for unknown URLs (`intake-dom.test.ts:68`), so `GET /api/courses` throws inside `load()` and every existing test sees today's page unchanged.
- **GOTCHA**: all strings above pass `.claude/rules/content.md` and `no-ai-slop` → `humanizer` before save.
- **VALIDATE**: `bun test src/marking/intake-dom.test.ts` with new tests: add `served.courses: null | { courses, chosen }` and `served.coursesPost: { status, body }` to the fake fetch (`/api/courses` GET → 404 when null; POST → `served.coursesPost`). Cases: (a) `chosen: []` after `reload()` → `#courses` shown, `#doors` hidden; tick maths, pick Foundation, Save → POST body `{courses:[{spec:"1MA1",tier:"F"}]}`, then `#doors` shown, `page.topics === null`, `#courses-line` contains "Edexcel GCSE Mathematics, Foundation"; (b) POST 400 `{error:"Pick Foundation or Higher for GCSE Mathematics."}` → `#status` shows it, `#doors` stays hidden; (c) `chosen` non-empty → `#courses` hidden, `#doors` shown. Last test resets `served.courses = null` and calls `reload()`.
- **SATISFIES**: AC5

### 9. UPDATE docs
- `.claude/references/content-pack.md`: `courses.json` in Layout; the prefix rule and the tier rule.
- `.claude/references/events.md:33`: `profile.json` = `{weeklyTarget, courses?, squad?, pupil?}`; `courses` written only by `POST /api/courses`; add `/api/courses` to the routes paragraph.
- `scripts/build.test.ts:77`: assert `content/maths/courses.json` exists in the built folder beside `topics.json` (`scripts/build.ts:73-77` copies `content/` recursively, `observed`).
- **VALIDATE**: `bun test scripts/build.test.ts`, then `bun run check`
- **SATISFIES**: AC4, AC7

---

## TESTING STRATEGY

### Unit Tests
`src/content/profile.test.ts` (chosen parsing, filter rules), `src/content/pack.test.ts` (`loadCourses`), `src/api/courses.test.ts` (validation and write), `src/api/case.test.ts` (course claims, cross-checks, `caseForDay` offer), `src/flow/next.test.ts` (item-less topic).

### Integration Tests
`src/server.test.ts` over both real packs and over the tier fixture root; `src/mcp/tools.test.ts`; `src/marking/intake-dom.test.ts` against the fake fetch. Replay is untouched (no event change), so no replay fixture.

### Edge Cases
- Stale `profile.json` spec after an update removed it → dropped; all dropped → unfiltered and the intake panel reappears (`profile.test.ts`, `server.test.ts` stale case).
- Hand-edited `courses: "x"` → treated as none (`profile.test.ts`).
- Filter removes a prerequisite's course → `pickLesson` treats it as met (`next.ts:40` `!inPack.has(p)`); intended, since a pupil not studying that course cannot start it. Fixture: give `BB1/X1` the prerequisite `AA1/X2`, choose `BB1` at `H` only; `/api/next` offers a lesson on `BB1/X1` (`server.test.ts`).
- Chosen courses leave nothing to offer → fixture `content/cc/` with untiered course `CC1` and one topic `CC1/X1` with no items file; choose `CC1` alone; `/api/next`'s next step has `kind: "none"` (`src/flow/next.ts:18`) and `/api/topics` lists only `CC1/X1` (`server.test.ts`).
- Course change mid-case → saved case still renders (`server.test.ts`).
- Course change with a session already open today on a dropped course's topic → D-Q6; no test (cosmetic, accepted).
- Course change with the intake page open → `topicsOnce` cache dropped on save (`intake-dom.test.ts` (a)).
- Existing install, no `courses` key → identical output (`server.test.ts` "without a save" and every unchanged existing test).
- Injected-pack tests with no `courses` → unfiltered (every existing `server.test.ts` test passes unedited).

---

## VALIDATION COMMANDS

### Level 1-3
`bun run check` (tsc + biome + bun test)

### Level 4: Manual
1. In `~/Desktop/study-tutor-a2`: `ls data` ; if it exists, `mv data data.bak` (restore after). Then `bun run dev`.
2. Open `/intake.html`: the courses panel lists "AQA GCSE Combined Science: Trilogy" and "Edexcel GCSE Mathematics", each with Foundation/Higher; the three doors are hidden.
3. Save with nothing ticked: status reads "Pick at least one course.", doors stay hidden.
4. Tick Edexcel GCSE Mathematics, Foundation, Save: "Courses saved.", doors appear, line reads "Courses: Edexcel GCSE Mathematics, Foundation".
5. Open `/map.html`: 21 topic cards, no "Animal and plant cells".
6. Back to intake, Change courses, tick AQA Combined Science, Foundation too, Save; `/map.html` shows 22.
7. `cat data/profile.json`: `courses` has both entries and `weeklyTarget` is present.
8. Open `/setup.html`, save settings, `cat data/profile.json`: `courses` still present.
9. Tier is not exercised here: every real topic is `F` (`observed`), so Foundation and Higher give the same counts. The tier rule is proved by the fixture tests in task 6.
10. Stop the server, `rm -rf data`, `mv data.bak data` if step 1 moved it.

---

## ACCEPTANCE CRITERIA

- [ ] AC1 A saved course list narrows map, next, boss, case, coach, cold test, sheet/interview matching and MCP `read_state` to those courses and tiers.
- [ ] AC2 No `courses` in `profile.json` gives today's behaviour on every route.
- [ ] AC3 `POST /api/courses` refuses unknown specs and invalid tiers and writes nothing on refusal; a save keeps every other `profile.json` key.
- [ ] AC4 Start-up refuses a pack whose topic prefix is not in its `courses.json`, a spec claimed by two packs, or a topic tier its course does not have.
- [ ] AC5 The intake page asks for courses before the doors on a fresh install.
- [ ] AC6 `/api/next` never offers a lesson on a topic with no items.
- [ ] AC7 `bun run check` green.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order, each VALIDATE run
- [ ] `bun run check` green
- [ ] Level 4 steps 1-10 performed
- [ ] PR body restates the guard: no model job or prompt changes; the sheet and interview jobs receive the filtered `pack.topics`, which carry no answers, as today; MCP `read_state` narrows only its topic list and still returns answer-free item views until an attempt exists (task 7)

---

## OPEN QUESTIONS / ASSUMPTIONS

All resolved; kept as decisions with their worst case.

- D-Q1 Higher includes Foundation topics. Settled by the 1MA1 specification (Solution 3). AQA 8464 marks Higher-only content as HT on the same principle (`expected`); if a future course differs, it declares its topics' tiers and the rule still holds, because a topic tagged `F` is on both papers by definition of the tag.
- D-Q2 Squad stays unfiltered. Worst case: a science-only pupil in a squad is offered a maths round. Squad needs a joined squad and is optional; filtering would break the same-round promise between friends, which is worse.
- D-Q3 The pupil sets courses at intake. Worst case: the pupil ticks the wrong tier; "Change courses" fixes it in one step and no record is lost (topics stay in `state.json`).
- D-Q4 Coach is filtered on GET and POST. Worst case: a pupil who drops a course no longer sees its topics in coach; the records stay and return if the course is chosen again.
- D-Q6 A session open today on a topic of a course the pupil then drops. `pickStep` returns `continue` for it without reading the pack (`src/flow/next.ts:71-78`), so it is still reachable. Worst case, lesson: the map titles it from the filtered `/api/topics` and finds no URL in the filtered `/api/lessons` (`map.js:86,108`), so the card shows the raw topic id with only the "done" action; the lesson is still open from the home page and no record is lost. Worst case, boss: a reload mid-boss closes the open boss and re-forms it from `/api/next` (`retest.js:390-395`), now over the chosen courses only, so the slots can differ from the first load; nothing had been scored, because rows post only at the end (`retest.js:250-257`). Accepted: it needs a course change in the middle of a session, and building `continue` steps from the full pack would add a second pack to `nextForDay` for a cosmetic gain.
- D-Q5 Ordering: a course save and a request in flight. Worst case: a request that read the old profile answers with the old list once; the next request reads the new file. No write depends on the filter (event writes resolve against the full `topics`), so nothing is stored wrongly.

## NOTES

Rejected: `profile@1` event. D3 names `profile.json`; replay does not need courses (state is per topic, keyed by id, and topics from an unchosen course stay in `state.json` harmlessly). An event would add a type, a fixture, a reducer case and a `KEYS` row for a setting the pupil changes rarely.

Rejected: a `board` field on each topic. The spec prefix already names the board, and `courses.json` gives the label once per course.

Rejected: requiring `courses` in the `packs()` short-circuit. It would reload both real packs in every injected-pack test and change the counts `server.test.ts` pins to maths.

Rejected: filtering `items`/`gens`. Lookups by id (chat, snap, examiner, a saved case) must resolve for old work.

Risks and how each is closed:
- R1 many call sites in `server.ts`: `dayRoute`/`postJobRoute` take a `load` function, so each route names `scoped`, `full` or `both` at its call; the Solution 4 table is the checklist, and one integration test per offering route asserts no unchosen topic.
- R2 coach refusal: decided (D-Q4), tested.
- R3 existing tests breaking: injected packs stay unfiltered with no edits; the only fixture change is `writeSubject` and the two MCP context builders, all named.
- R4 tier logic untestable on real content: fixture root with F, H and H-only courses.
- R5 a saved case vanishing after a course change: `caseForDay` renders from the full pack; tested.
- R6 intake page stale topic cache after a save: cache dropped; DOM-tested.
- R7 start-up forgetting `courses`: invisible to tests by construction; Level 4 step 5 is the named check.
- R8 server-side caches serving a pre-filter list: checked, `lessonUrls` keys by topic list; the `/api/lessons` test asserts a change within one process.

Confidence: 9/10 (`expected`). Call sites, test builders and the `case.test.ts` temp-root fixtures were re-read on 2026-09-30 (`observed`). The point held back is the size of task 6: two helper signatures and every route call change in one step, and `bun run check` cannot see a start-up that omits `courses` (R7).

## AMENDMENTS

- 2026-09-30 — Rule added: offering uses the filtered pack, rendering a saved record uses the full pack; `caseForDay` keeps a started case after a course change (Solution 4, task 6). Reason: `buildCase` returns null for a topic absent from `pack.topics`.
- 2026-09-30 — MCP: `ToolContext` gains `courses` (task 7). Reason: `read_state` had no course metadata to filter with.
- 2026-09-30 — Task 6 gains a fixture pack for tier tests (real content is all `F`); Level 4 says tier is not exercised. Stale Out of Scope line about the issue proposing `profile@1` removed; `coursesOf` renamed `chosenOf`.
- 2026-09-30 — Risks closed for a one-pass run: `dayRoute`/`postJobRoute` take a `load` function and a per-route table fixes which pack each uses; the earlier `packs()` GOTCHA reversed (injected packs without `courses` stay unfiltered, so no existing test changes); courses load in `loadPacks` only, so the test-fixture list shrinks from seven files to `writeSubject` plus two MCP builders; coach, squad, Higher-includes-Foundation (checked against the 1MA1 spec) and ordering settled as decisions; tier-in-course start-up check added (AC4); intake UI specified to the element with DOM tests on the existing happy-dom harness, fail path resets the page; home lesson list and `practice.js` named as exclusions; Level 4 made performable from an existing `data/`. MCP guard restated in task 7; module caches checked; production-wiring gap assigned to Level 4 step 5; D-Q1 citation relabelled `expected`.
- 2026-09-30 — Fact pass against `c277595`: every cited `file:line` re-read and holds; topic counts re-run (`observed`: maths 21 F under `1MA1`, science 1 F under `8464`, every topic has items, so task 7b skips no real topic). Added: biome GOTCHA and `bunx biome check content` for `courses.json` (task 2); claim order and the fixture-prefix check (task 3); D-Q6 and its edge case for sessions open across a course change; Solution 6 says the panel also shows once on existing installs; confidence 10 → 9 with its reason.
- 2026-09-30 — As shipped (report `.claude/reports/a2-pupil-profile-report.md`, D1–D12), superseding the tasks where they differ: task 7 also updates the `ToolContext` builder in `scripts/e5-science.test.ts`; `src/marking/retest.test.ts` page-write guard allows `/api/courses`. Task 6: `full` loads the pack directly without reading the profile; `/api/topics` and `/api/lessons` narrow through a local `narrow(pack, courses)` shared with `both`; the tier, dropped-prerequisite and nothing-to-offer cases share one fixture test; fixture items are `vocab`. Task 4: `chosenOf` keeps the first valid entry per spec. Task 2: an unparseable `courses.json` reports "not a list of course rows"; "missing" only for an absent file. Task 5: a tier outside the course's `tiers` answers "Pick Foundation or Higher for <title>.". Task 8: strings live in `TEXT`; radios render only the course's tiers; panel copy reads "Where a course has two tiers, pick Foundation or Higher." after the prose gate. Level 4 step 8 posted to `/api/config` directly.
