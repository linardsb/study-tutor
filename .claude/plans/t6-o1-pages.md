# Feature: T6 O1 pages: level map, boss battle, cold re-test, weekly flame

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

T6 is the first page that consumes T5's flow. Two new pages under `app/`, built the way `case.html` and
`case.js` are built (plain JS, DOM through `textContent`, one `fetch` to `/api/event` per record):

- `app/map.html` + `app/map.js`: the pupil's level map. One card per topic with the four-rung ladder,
  the rung name, when the next cold re-test is due and a link to the lesson; the weekly flame ("n of your
  3 this week"); total XP; and a "today" box that shows the one step `GET /api/next` returns and lets the
  pupil take it. The map is the page that posts the `session` start and end bodies `/api/next` hands it,
  so a lesson can finish and become due, which is what makes a boss appear.
- `app/retest.html` + `app/retest.js`: the boss battle. It takes the `boss` step from `/api/next`, posts the
  boss `start` body, builds the questions in the browser (a pack item by id, or a generator roll from the
  slot's seed, with the same `lcg` as `quiz.js`), shows them mixed, numbered and unlabelled (no topic name
  or code, no hint, no Sure/Not sure, one go each), then posts one `retest` event per topic and the
  session `end` body. The result screen names each topic, its score, and what the rung change means as
  what the pupil can and cannot do yet. No grade anywhere.
- `GET /api/lessons`: topic id → lesson URL, the one fact the map needs that neither `/api/state` nor
  `topics.json` holds. `lessonFile` moves from `src/mcp/tools.ts` to `src/content/pack.ts` so the route and
  the `open_lesson` tool share it without the api layer importing the mcp layer.
- Page tests run the real page code under `bun test` with `@happy-dom/global-registrator` (a dev
  dependency, added 2026-09-28 in the worktree after the spike below) against a fake `fetch`, so every
  click, post and render is asserted before a browser is opened.

No model anywhere. Nothing in `app/` writes a file: every record is a POST to `/api/event`.

## User Story

As a 15-year-old doing GCSE Foundation maths on my own PC
I want to see my topics as a ladder I climb, be told the one thing to do next, and fight a cold re-test
built from my own wrong answers when a topic is due
So that I keep coming back three evenings a week without anyone nudging me, and the ladder only rises
when I can do a topic from memory.

## Problem Statement

T5 put O1's rules in `src/flow` and exposed them on `GET /api/next`, but no page reads that route or posts
the `session` and `retest` bodies it returns (`.claude/plans/t5-flow.md:62-66`). Today no page posts a
session event at all: `quiz.js` posts attempts only, so no lesson ever ends, no topic ever gets a
`nextDue`, and the boss in `src/flow/boss.ts` can only be reached with `curl`. The pupil has no view of
their rungs, their flame or what to do next (PRD O1: "The 3/10/30/60 re-test ladder rendered as a level
map … Weekly flame").

## Solution Statement

Two pages and one small route, all reading the routes T4, T5 and T8 already serve:

1. The map reads `/api/state` (rung, `nextDue`, `rag`, `xp.total`, `session`), `/api/next` (flame and the
   step), `/content/maths/topics.json` (titles, codes) and the new `/api/lessons` (lesson URL per topic).
   The today box renders the step and posts the `start` or `end` body the server gave it, verbatim, on a
   click. Flow stays in code: the page never composes a session event (T5 Notes, "Why `/api/next` returns
   event bodies").
2. The boss page renders the `boss` step. Answers are marked in the browser with `quiz.mark`, as practice
   already does (D7: answers reach the browser, never a model). At the end it posts one `retest` per topic
   with `passed` computed by the browser copy of `passes` (2 of 3 or better), which `postEvent` checks
   (`src/api/event.ts:31-39`), then the `end` body, then reads `/api/state` back for the result screen.
3. `/api/lessons` is a read route through `readRoute` (`src/server.ts:158-172`), cached per root like
   `loadCasePack` (`src/api/case.ts:17-36`).
4. Every decision in the pages is a pure helper on `root.map` / `root.boss` with a unit test; the DOM code
   that calls them is run under happy-dom with a fake `fetch` that records every request.

## Out of Scope / Non-Goals

- Not included: `quiz.js` posting a lesson `end` when the quiz finishes. The map's "Done" button posts the
  `end` body instead (Q1). `quiz.js` is not touched.
- Not included: `attempt` events or Sure/Not sure on the boss. A boss posts `retest` events only (T5 Q4,
  and Q2 below), so a boss never clears `confidentWrong` and never adds attempt XP on top of retest XP.
- Not included: making `map.html` the home page. `index.html` gets a link to it; `/` still serves the
  lesson list (Q5).
- Not included: the O3 QR block on the map (T13), the squad page (T14), the parent digest (T15), any
  model job or chat panel (T9).
- Not included: a per-day XP cap (T5 Q3 stays open). The map shows `xp.total` as replay holds it.
- Not included: an `intake` door. Cards show `rag` when an intake event exists (via `curl` or T17); the
  page never posts one.
- Not included: a `bunfig.toml` test preload for happy-dom. It is registered inside the two DOM test files
  and unregistered in `afterAll`, so `typeof document` guards in `quiz.js`, `case.js` and every other test
  keep their meaning.
- Not changing: `src/flow/*`, `src/events/*` except one `export` keyword (Task 8), `src/api/event.ts`,
  `src/api/next.ts`, `content/**`, `app/quiz.js`, `app/case.*`, `app/setup.*`. `app/practice.js` gets one
  small addition (Task 12).
- Not changing: any `src/mcp` tool's behaviour. **Guard restatement:** T6 touches `src/mcp/tools.ts` only
  to import `lessonFile` from its new home in `src/content/pack.ts`; no tool's input, output or prompt
  changes, and `src/mcp/tools.test.ts` is unchanged and must stay green. No file in `src/jobs` and no
  prompt exists or changes, so no path puts an item answer into a model prompt. Answers reaching the
  browser is inherited (D7) and is not a model path.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium (two browser pages with fetch-and-post flows, one trivial route, one
function move, DOM tests under happy-dom, route-level loop test)
**Primary Systems Affected**: `app/` (map, retest, index link, style, practice pre-tick), `src/api/lessons.ts`
(new), `src/server.ts` (one route), `src/content/pack.ts` (`lessonFile` moves in), `src/mcp/tools.ts` (import
only), `src/events/types.ts` (`MODES` exported), tests under `src/marking/`, `src/api/`, `src/server.test.ts`
**Dependencies**: `@happy-dom/global-registrator@20.14.5` as a devDependency (`observed`: `bun add -d` on
2026-09-28 installed it in 1.2 s; `package.json` and `bun.lock` in the worktree already carry it,
uncommitted). Otherwise `bun:test`, the existing `quiz.js` globals (`norm`, `lcg`, `mark`,
`itemFromGenerated`), `content/maths/generators.js` (`window.GEN`).

## Related Work

**Implements**: [#8](https://github.com/linardsb/study-tutor/issues/8) · **Epic**: [#1](https://github.com/linardsb/study-tutor/issues/1),
`docs/prd/study-tutor-v2.architecture.md` (D2, D3, D7, "Code holds the flow"), `docs/tickets/study-tutor-v2.md` T6 (lines 140-152)

**Back-references** (plans this builds on or inherits decisions from):

- `.claude/plans/t5-flow.md`: Why: `Next`, `Step`, `Boss`, `BossSlot`, `passes`, the start/end bodies, Q3/Q4, and "For T6: a `continue` step for an open boss session carries no `boss`" (PR #33 body).
- `.claude/plans/t7-detective-case.md`: Why: the page shape (`case.html` + `case.js`), the `root.<name>` export for Bun tests, `?day=` pass-through for manual checks, the `NOT_SAVED` pattern.
- `.claude/plans/t4-server-and-lesson-bridge.md`: Why: `refuseForeign`, the route table, `staticPath`, `quiz.js` as carried from v1.
- `.claude/plans/e1-map-and-detective-case-v1-folder.md`: Why: T0's map shape (stats, cards, ladder, footer) that T6 re-renders from `/api/state`.

**Forward-references** (plans that extend or supersede this — append as follow-ups get created):

- T13 (#15) adds the QR block to `map.html`. T14 (#16) reuses the boss page's question builder for the seeded squad re-test. T9 (#11) may replace the map's "Done" with a teach-back step. Any later page test can copy the happy-dom harness from `src/marking/map-dom.test.ts`.

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `src/flow/next.ts` (lines 13-19, 99-111) - Why: the `Step` union the map and boss page switch on, and `Next = {day, flame, step}`. `continue` carries `end`; `boss`, `lesson`, `practice` carry `start`.
- `src/flow/boss.ts` (lines 12-20, 81-95) - Why: `BossSlot = {topic, item | null, seed}`, `Boss = {day, seed, topics, slots}`; slots are already shuffled; `MAX_BOSS_TOPICS = 3` × `RETEST_SLOTS = 3` gives at most 9 questions (derived). Slot `seed` for a fixed item is `hash(day:id)`, for a roll `hash(day:topic:k)`.
- `src/flow/ladder.ts` (whole file, 44 lines) - Why: `RUNGS` names (the browser copy must match), `NEXT_DAYS` (3/10/30/60), `afterRetest`, `passes(score, of)` = `of > 0 && score * 3 >= of * 2` (integer, copy exactly).
- `src/flow/session.ts` (lines 29-45) - Why: what the start/end bodies look like and `openToday` (a session from another day is not `continue`).
- `src/flow/xp.ts` (lines 10-14, 25-31) - Why: `XP.retest = 20`; `Flame = {week, days, target}`.
- `src/events/types.ts` (lines 17-29, 38-44, 129-138, 150-151, 190-201) - Why: `SessionV1`, `RetestV1` (`topic, score, of, passed, seed?`), `MODES` (to export), the `retest@1` field check (`outOf(score, of)`, `optInt(seed)`), `KEYS`.
- `src/events/replay.ts` (lines 36-54, 75-84, 109-120) - Why: `State` keys the map reads (`topics[id].rung/nextDue/rag`, `xp.total`, `session`); a lesson `end` moves rung 0 → 1 and sets `nextDue = localDay(e.t) + 3`; a `retest` sets `nextDue` from the real `t`, not from `?day=`.
- `src/api/event.ts` (lines 26-41, 55-87) - Why: `postEvent` refuses `xp`, a `retest` with `of < 1`, and a `retest` whose `passed` disagrees with `passes`. The page's `passes` copy must agree or every boss result is a 400. A 201 returns the saved event with its `t`.
- `src/api/case.ts` (lines 17-36) - Why: the per-root cache Map pattern for `loadCasePack`; mirror it for `lessonUrls`.
- `src/api/next.ts` (whole file, 14 lines) - Why: `nextForDay` reads `readProfile(dataDir).weeklyTarget`; the flame target comes from `profile.json` (default 3).
- `src/server.ts` (lines 51-71, 89-102, 158-172, 191-224) - Why: static serving of `app/`, `refuseForeign`, `readRoute` (sync handler, JSON 500 on throw), `apiRoutes` (add `/api/lessons` here; the key-leak test walks every route).
- `src/content/pack.ts` (lines 5-7, 13-17, 53-77) - Why: `itemsFileName` (`1MA1/G17/cone` → `1MA1-G17-cone.json`; the browser copies it), `subjectDir`, `loadItems`. `lessonFile` moves in here.
- `src/mcp/tools.ts` (lines 1-14, 75-89, ~152-177) - Why: `lessonFile` today, its `fs` use (the only `fs` use in the file: lines 82 and 84, observed), and `openLesson` which keeps calling it after the move.
- `src/content/generators.ts` (lines 6-12) - Why: `lcg`; `quiz.lcg` in the browser is the same function (`quiz.test.ts:56-60`).
- `app/quiz.js` (lines 9-35, 52-76, 78-99, 111-162, 404-408, 441-442) - Why: `norm`, `lcg`, `mark`, `itemFromGenerated`, `NOT_SAVED`, the DOM shape of a `.q` (`buildItem`) to mirror minus hint and confidence, `start()` on load, and the `root.quiz` export the boss page calls.
- `app/case.js` (lines 8-14, 73-95, 261-306) - Why: the page skeleton to copy: `postEvent`, `el`, `load` with `?day=` pass-through, the `typeof document` guard, the `root.detective` export.
- `app/case.html`, `app/practice.html` (whole files) - Why: the page skeleton (`main.lesson.practice`, crumb, `h1`, `.aim`, footer) and the script order (`generators.js`, `quiz.js`, then the page script).
- `app/practice.js` (lines 28-49) - Why: how the picker is built from `topics.json` (`aliases[0]` is the generator code); Task 12 adds a `?topic=` pre-tick.
- `app/index.html` (lines 16-19, 48-51) - Why: where the map link goes.
- `app/style.css` (lines 3-17, 343-408, 505-527) - Why: `:root` colours, the `.progress .stats/.stat`, `.cards/.card` (`.r/.a/.g/.o`), `.ladder i.on` rules already carried from v1. Add `.today` and result-screen rules; do not add descending-specificity rules (biome warns on 4 today).
- `~/Desktop/Matis_study_tutor/map.html` (lines 29, 87-109, 119-128) - Why: T0's map shape: footer text, `stat()`, `ladder()`, `card()`. Re-render, don't copy: v2 has no `priority`, and everything goes through `textContent`.
- `src/marking/quiz.test.ts` (lines 24-28), `src/marking/case.test.ts` (lines 27-30, 62-93) - Why: how a browser file is loaded under Bun and its helpers tested; `parseEvent` over a stringified body proves the page posts a valid line.
- `src/server.test.ts` (lines 22-55, 101-128, 440-476) - Why: `withTemp`/`withServer`, the static-route test to extend, the `/api/next` test to mirror for the loop.
- `src/flow/properties.test.ts` (lines 218-233) - Why: the source-scan test shape for "nothing in `app/` writes a file".
- `src/flow/boss.test.ts` (lines 17-27) - Why: building a `State` with due topics and a confident-wrong item for the `buildItems` test and the DOM boss test.
- `src/mcp/clock.ts` (lines 24-37) - Why: `localDay`, `addDays` for the loop test's expected `nextDue`.
- `.claude/rules/content.md` - Why: register for every string in the two pages.
- `.claude/references/events.md` (Routes paragraph) - Why: update it with `/api/lessons`.

### New Files to Create

- `app/map.html` - the level map page
- `app/map.js` - map rendering, the today box, session start/end posts; pure helpers and `TEXT` on `root.map`
- `app/retest.html` - the boss battle page
- `app/retest.js` - question building, marking, retest posts, result screen; pure helpers and `TEXT` on `root.boss`
- `src/api/lessons.ts` - `lessonUrls(root, subject, topics)`, cached per root
- `src/api/lessons.test.ts` - route helper tests
- `src/marking/map.test.ts` - `map.js` pure helpers under Bun
- `src/marking/map-dom.test.ts` - `map.js` page code under happy-dom with a fake `fetch`
- `src/marking/retest.test.ts` - `retest.js` pure helpers, `passes` parity, the register scan of both pages, the "no page writes a file" scan
- `src/marking/retest-dom.test.ts` - `retest.js` page code under happy-dom: begin, answer, retest and end posts, result screen

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- `docs/prd/study-tutor-v2.prd.md` (O1 paragraph, lines 111-118; target user, lines 96-106; success metrics, lines 220-232)
  - Why: "level map", "XP for effort", "weekly flame, not a daily streak", "a cold re-test (the boss) can" cost a level; no grade prediction.
- `docs/prd/study-tutor-v2.architecture.md` (D2, D3, D7, lines 73-84 and 113-118; "Code holds the flow", lines 51-58)
  - Why: pages post events, code decides the next step, the model is absent from this path.
- `.claude/rules/content.md`
  - Why: 15-year-old register, British English, sentence case, no emoji, no exclamation marks, no grade; every prose block passes `no-ai-slop` then `humanizer`. The string tables below have had that pass (2026-09-28); copy them verbatim, and re-run the pass on anything you change.
- [Bun: DOM testing with happy-dom](https://bun.sh/docs/test/dom) - Why: `GlobalRegistrator.register()` / `unregister()`; Bun documents the preload form, this plan registers per file instead (see Out of Scope).
- [happy-dom GlobalRegistrator](https://github.com/capricorn86/happy-dom/wiki/GlobalRegistrator) - Why: `register({ url })` sets `location`; `location.assign` updates `href` without a network navigation and `location.reload()` is a no-op (`observed` 2026-09-28, spike in Notes).
- [Bun test runner](https://bun.sh/docs/cli/test) - Why: `test.each`, the 5 s default timeout per test (the loop test makes about 14 requests; well inside).
- [Biome rule `noExcessiveCognitiveComplexity`](https://biomejs.dev/linter/rules/no-excessive-cognitive-complexity/) - Why: Level 1b; keep render functions small (case.js's `render` is the upper bound that passes today).

### Patterns to Follow

**Page skeleton** (`app/case.html:1-25`): `main.lesson.practice`, `header` with `p.crumb` (`<a href="/">Lessons</a> · map · Maths`), `h1`, `p.aim`, one `section` per block, `footer`, scripts last.

**Browser file that Bun can import** (`app/case.js:8, 299-306`):

```js
(() => {
  /* pure helpers first */
  if (typeof document !== "undefined") {
    const holder = document.getElementById("case");
    if (holder) load(holder);
  }
  const root = typeof window === "undefined" ? globalThis : window;
  root.detective = { calibrationLine, eventFor, bump, reaskOwed, afterSave };
})();
```

**One post shape** (`app/case.js:73-81`): `fetch("/api/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }).then((res) => res.ok).catch(() => false)`. The page posts the body `/api/next` gave it, unchanged.

**DOM through `textContent`** (`app/case.js:90-95` `el(tag, className, text)`); `innerHTML` only for a pack `figure` (`app/quiz.js:118-124`).

**`?day=` pass-through for manual checks** (`app/case.js:261-268`): only a well-formed `YYYY-MM-DD` reaches the route.

**Route helper with a per-root cache** (`src/api/case.ts:17-36`): a module `Map` keyed by the resolved subject dir.

**Read route** (`src/server.ts:214-222`): `readRoute(req, "the lesson list", () => ({ status: 200, body }))`.

**Failure text** (`app/quiz.js:78`, `app/case.js:9`): `" Not saved. Check the tutor window is still open."` and `"… did not load. Check the tutor window is still open."`

**Register** (`.claude/rules/content.md`): short sentences, no exclamation marks, no emoji, sentence case, no grade. Every new string lives in an exported `TEXT` table so a test can scan it.

**Happy-dom harness** (spiked 2026-09-28, `observed` green inside the full suite):

```ts
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { afterAll, expect, test } from "bun:test";
import path from "node:path";

GlobalRegistrator.register({ url: "http://127.0.0.1:4731/map.html" });
afterAll(() => GlobalRegistrator.unregister());

document.body.innerHTML = '<div id="cards"></div>…';
const calls: { method: string; url: string; body?: unknown }[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  calls.push({ method: init?.method ?? "GET", url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
  /* return Response.json(...) per url */
}) as typeof fetch;
await import(path.resolve(import.meta.dir, "../../app/map.js"));
/** Polls until fn() is truthy, at most 1 s: the page code is async and fetch resolves on later ticks. */
const until = async (fn: () => boolean) => { for (let i = 0; i < 200 && !fn(); i++) await Bun.sleep(5); expect(fn()).toBe(true); };
```

Import order in a DOM test: register, set `document.body.innerHTML`, install the fake `fetch`, then import the page file (its page code runs at import because `document` exists). `document.readyState` is `"complete"` under happy-dom (`observed`), so `quiz.js`'s `start()` runs at import and finds no `.quiz[data-items]`.

---

## IMPLEMENTATION PLAN

### Phase A: `/api/lessons` and the `lessonFile` move (server)

Move `lessonFile` to `src/content/pack.ts`, add `src/api/lessons.ts`, register the route, test.

**Independent of:** Phases B and C (the pages can be written against the route's contract, `Record<topicId, url>`).

### Phase B: the map page

**Depends on:** Phase A for the lesson links to render (the page degrades to "no lesson yet" text without it).

`app/map.html`, `app/map.js`, `style.css` additions, `index.html` link, `practice.js` pre-tick, `MODES` export, `src/marking/map.test.ts`, `src/marking/map-dom.test.ts`.

### Phase C: the boss page

**Independent of:** Phase B (shares only `style.css`; add each page's rules in its own block).

`app/retest.html`, `app/retest.js`, `style.css` additions, `src/marking/retest.test.ts`, `src/marking/retest-dom.test.ts`.

### Phase D: route-level loop, scans, docs

**Depends on:** A, B, C.

`src/server.test.ts` (static routes, `/api/lessons`, the full loop), `.claude/references/events.md`, the register pass on anything that changed from the string tables.

---

## STRING TABLES (final)

These passed `no-ai-slop` then `humanizer` on 2026-09-28 (both skills' Default voice sections set aside per
`.claude/rules/content.md`; register: a 15-year-old, British English, sentence case, no exclamation marks,
no emoji, no grade). Copy them verbatim into `map.TEXT` / `boss.TEXT` and the two HTML files. Any string
you add or change gets the same two passes before the file is saved.

**map.html**

- title: `Your map`
- crumb: `Lessons · map · Maths` (the first word a link to `/`)
- h1: `Your map`
- aim: `Each topic is a ladder with four bars: learning, 1 pass, 2 passes, secure. The first bar fills when you finish a lesson. The rest fill when you pass a cold re-test.` (PR #36 review F2: the first bar fills on a lesson end)
- footer 1: `Practice never costs a bar. A cold re-test can. Secure topics still get re-tested every 60 days. Nothing here is a prediction.`
- footer 2: `Practice · Today's case` (both links)

**map.js `TEXT`**

| key | string |
|---|---|
| `flame(days, target)` | `${days} of your ${target} this week` |
| `statWeek` | `this week` |
| `statXp` | `XP` |
| `statStarted(started, total)` | `${started} of ${total}` with label `topics started` |
| `open(mode, title)` | `${MODE_NAMES[mode]} open${title ? `: ${title}` : ""}.` |
| `boss(n, m)` | `Boss ready. ${n} questions from ${m} ${m === 1 ? "topic" : "topics"} due a re-test. No hints, one go each.` |
| `lesson(title)` | `Next: ${title}.` |
| `practice(title)` | `Practice: ${title}.` |
| `none` | `Nothing to do. The pack is empty.` |
| `openIt` | `Open it` |
| `done` | `Done with it` |
| `startBoss` | `Start the boss` |
| `startLesson` | `Start the lesson` |
| `startPractice` | `Start` |
| `noLesson` | `no lesson yet` |
| `lessonLink` | `lesson` |
| `dueToday` | `re-test due today` |
| `dueIn(n)` | `re-test in ${n} ${n === 1 ? "day" : "days"}` |
| `overdue(n)` | `re-test ${n} ${n === 1 ? "day" : "days"} overdue` |
| `notLoaded` | `The map did not load. Check the tutor window is still open.` |
| `lessonsNotLoaded` | `The lessons did not load. Check the tutor window is still open.` |
| `notSaved` | ` Not saved. Check the tutor window is still open.` |

`MODE_NAMES` = `{lesson: "Lesson", practice: "Practice", retest: "Re-test", boss: "Boss", case: "Case", coach: "Coach", squad: "Squad", intake: "Intake"}`. `RUNGS` = `["not started", "learning", "1 pass", "2 passes", "secure"]`.

**retest.html**

- title: `Boss`
- crumb: `Map · boss · Maths` (the first word a link to `/map.html`)
- h1: `Boss`
- aim: `Cold questions from the topics you are due to re-test. Mixed, not named, no hints, one go each.`
- footer: `A pass is 2 of 3 or better on a topic and moves it up one bar. A miss sends it back to learning. Nothing here is a prediction.`

**retest.js `TEXT`**

| key | string |
|---|---|
| `intro(n, m)` | `${n} questions from ${m} ${m === 1 ? "topic" : "topics"}. Answer from memory. The working shows after each check.` |
| `begin` | `Begin` |
| `noBoss` | `No boss today. Nothing is due.` |
| `otherOpen` | `Something else is open. Finish it on the map first.` |
| `couldNotClose` | `Could not close the earlier boss. Reload the page.` |
| `notLoaded` | `The boss did not load. Check the tutor window is still open.` |
| `noQuestions` | `The questions could not be built. Tell a parent.` |
| `answerFirst` | `Write an answer first, even a guess.` |
| `yourAnswer` | `Your answer ` |
| `check` | `Check` |
| `correct` | `Correct.` |
| `wrong` | `Not this time.` |
| `over` | `Boss over.` |
| `row(title, score, of)` | `${title}: ${score} of ${of}.` |
| `notScored` | `Not scored yet.` |
| `backToMap` | `Back to the map` |
| `toMap` | `Map` (the link text under `noBoss` / `otherOpen`) |
| `notSaved` | ` Not saved. Check the tutor window is still open.` |

`RUNG_LINES` (index = the rung the topic lands on; the day counts are read from `NEXT_DAYS`, not typed):

| rung | line |
|---|---|
| 1 | `Not yet from memory. Back to learning. Do the lesson again and the re-test comes round in 3 days.` |
| 2 | `One cold pass. You did it from memory once. Next re-test in 10 days.` |
| 3 | `Two cold passes. One more and it is secure. Next re-test in 30 days.` |
| 4 | `Secure. You can do this from memory. It still comes round every 60 days.` |

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### Task 0: commit the dev dependency

- **IMPLEMENT**: `git status` in the worktree shows `package.json` and `bun.lock` modified (the `@happy-dom/global-registrator` add from the spike). Keep them; they go into the first commit of this branch. `ls node_modules/@happy-dom` shows `global-registrator`.
- **VALIDATE**: `bun run check` (301 pass, `observed` 2026-09-28 with the dependency present).
- **SATISFIES**: AC 8 groundwork.

### Task 1: UPDATE `src/content/pack.ts` and `src/mcp/tools.ts`: move `lessonFile`

- **IMPLEMENT**: cut `lessonFile(root, subject, id)` from `src/mcp/tools.ts:74-89` (docblock included) and paste it into `src/content/pack.ts` after `itemsFileName`, exported, with `import fs from "node:fs"` added to pack.ts. In tools.ts add `lessonFile` to the existing `../content/pack` import and delete `import fs from "node:fs"` and `import path from "node:path"` (lessonFile was the only user of both, observed while implementing).
- **PATTERN**: `src/content/pack.ts:5-7` (`itemsFileName` sits beside it; same "which file holds this topic" concern).
- **IMPORTS**: pack.ts: `fs`, `path` (already), `itemsFileName`, `subjectDir` (same file).
- **GOTCHA**: the marker string `data-items="/content/${subject}/items/${itemsFileName(id)}"` must stay byte-identical: `server.test.ts:119-121` and `strip-lessons.test.ts` depend on that attribute. No behaviour change: `src/mcp/tools.test.ts` must pass untouched.
- **VALIDATE**: `bun test src/mcp src/content && bunx tsc --noEmit && bunx biome check src/mcp/tools.ts src/content/pack.ts`
- **SATISFIES**: AC 2 (lesson link per card) groundwork; guard restatement (tools.ts import only).

### Task 2: CREATE `src/api/lessons.ts`

- **IMPLEMENT**:

  ```ts
  import { lessonFile, subjectDir } from "../content/pack";
  import type { Topic } from "../content/types";

  const cache = new Map<string, Record<string, string>>();

  /** Topic id → the URL of its lesson page, for the topics that have one. Read once per root: content/ changes only with an update, which restarts the binary (D10). */
  export function lessonUrls(root: string, subject: string, topics: readonly Topic[]): Record<string, string> {
    const key = subjectDir(subject, root);
    const cached = cache.get(key);
    if (cached) return cached;
    const urls: Record<string, string> = {};
    for (const t of topics) {
      const file = lessonFile(root, subject, t.id);
      if (file !== null) urls[t.id] = `/content/${subject}/lessons/${file}`;
    }
    cache.set(key, urls);
    return urls;
  }
  ```

- **PATTERN**: `src/api/case.ts:17-36` (cache keyed by `subjectDir`); `src/mcp/tools.ts` `openLesson` (the URL shape `/content/${subject}/lessons/${file}`, minus the origin: the page is same-origin).
- **GOTCHA**: `lessonFile` reads every lesson file per topic. `observed` 2026-09-28: all 21 topics resolve in 7.2 ms on this Mac, so the cache is a nicety, not a need. A plain object is fine: topic ids come from `topics.json`, not from a request.
- **VALIDATE**: `bunx tsc --noEmit`
- **SATISFIES**: AC 2.

### Task 3: CREATE `src/api/lessons.test.ts`

- **IMPLEMENT**: (a) `lessonUrls(process.cwd(), "maths", await loadTopics("maths"))` has exactly one key per pack topic (assert `Object.keys(urls).sort()` equals the topic ids sorted; 21 today, `observed`) and every value matches `/^\/content\/maths\/lessons\/\d{4}-U\d+-[a-z0-9-]+\.html$/` and exists on disk under `content/maths/lessons/` (`fs.existsSync(path.join(root, url))`). (b) A temp root with `content/maths/topics.json` holding one topic and an empty `lessons/` dir gives `{}`. (c) The second call returns the same object (cache).
- **PATTERN**: `src/api/case.test.ts:1-45` (temp dir, `loadCasePack`); `src/content/pack.test.ts` for a temp content root.
- **VALIDATE**: `bun test src/api/lessons.test.ts`
- **SATISFIES**: AC 2.

### Task 4: UPDATE `src/server.ts`: `GET /api/lessons`

- **IMPLEMENT**: in `apiRoutes`, after `/api/next`:

  ```ts
  "/api/lessons": {
    GET: (req: Request) =>
      readRoute(req, "the lesson list", () => ({
        status: 200,
        body: lessonUrls(root, "maths", topics),
      })),
  },
  ```

  Import `lessonUrls` from `./api/lessons`.
- **PATTERN**: `src/server.ts:214-222` (`/api/config` GET through `readRoute`).
- **GOTCHA**: `"maths"` is the same literal `src/server.ts:273-275` already uses for `loadTopics` and `loadCasePack`; do not add a subject parameter. The key-leak test (`server.test.ts:327-396`) walks `apiRoutes` and GETs this route; it must return 200 and no key.
- **VALIDATE**: `bun test src/server.test.ts`
- **SATISFIES**: AC 2.

### Task 5: UPDATE `app/style.css`: map and result blocks

- **IMPLEMENT**: append one block after the `.card .rung` rule (line 523-527):

  ```css
  /* map: the today box (v1 map.html inline styles) */
  .progress .today {
    background: var(--card);
    border: 1px solid var(--line);
    border-left: 6px solid var(--accent);
    padding: 0.8rem 1rem;
    margin: 0 0 1.5rem;
  }
  .progress .today button {
    margin-right: 0.5rem;
  }
  /* boss result: one row per topic */
  .result ol li {
    margin: 0 0 0.6rem;
  }
  .result .row {
    font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif;
    font-weight: 600;
  }
  ```

  Reuse `.progress .stats/.stat`, `.cards/.card.r/.a/.g/.o`, `.ladder`, `.card .rung`, `.quiz .q`, `.quiz .feedback`, `.quiz .working`, `.quiz button.check`, `.practice .note` as they are.
- **PATTERN**: `app/style.css:343-408, 505-527`; v1 `map.html:9-15`.
- **GOTCHA**: biome reports 4 `noDescendingSpecificity` warnings on this file from `main` (observed, PR #33 body). Add none: every new selector is scoped under `.progress` or `.result`, and the result row class is `.row`, not `.score`, so it never meets `.quiz .score`. `.result li` alone raised a fifth warning against `ul.prompts li` (0,1,2), hence `.result ol li`. Run `bunx biome check --reporter=summary app/style.css` and compare the count to 4.
- **VALIDATE**: `bunx biome check app/style.css 2>&1 | tail -3` shows 4 warnings, 0 errors.
- **SATISFIES**: AC 1, AC 5.

### Task 6: CREATE `app/map.html`

- **IMPLEMENT**: the `case.html` skeleton with `main.lesson.practice.progress`. Strings from the map.html table above. Body: header (crumb, h1, aim), `<div class="stats" id="stats"></div>`, `<div class="today" id="today" hidden></div>`, `<section id="topics"><h2>Topics</h2><div class="cards" id="cards"></div></section>`, `<p class="note" id="status"></p>`, footer (footer 1, footer 2 with the two links). Script: `/map.js` only.
- **PATTERN**: `app/case.html`; v1 `map.html:19-31` for the block order (stats, today, cards, footer).
- **GOTCHA**: the `.progress` class on `main` is what turns on the stats and card rules (`style.css:344-364`). The DOM test recreates exactly these ids (`stats`, `today`, `cards`, `status`), so keep them.
- **VALIDATE**: `bun run dev`, open `/map.html`: header and footer render (Level 4 step 1).
- **SATISFIES**: AC 1, AC 6.

### Task 7: CREATE `app/map.js`

- **IMPLEMENT**: an arrow IIFE. Pure helpers, exported on `root.map` together with `TEXT`, `MODE_NAMES`, `RUNGS`:
  - `RUNGS`, `MODE_NAMES`, `TEXT` as in the string tables.
  - `dayDiff(a, b)`: whole days from `b` to `a`, both `YYYY-MM-DD`, via `Date.UTC` (calendar arithmetic like `addDays`).
  - `dueText(nextDue, day)`: `nextDue === null` → `""`; `dayDiff === 0` → `TEXT.dueToday`; positive → `TEXT.dueIn(n)`; negative → `TEXT.overdue(-n)`.
  - `cardClass(rag)`: `{R: "r", A: "a", G: "g"}[rag] ?? "o"`.
  - `stepText(step, titles)`: `continue` → `TEXT.open(step.mode, titles[step.topic])`; `boss` → `TEXT.boss(step.boss.slots.length, step.boss.topics.length)`; `lesson` → `TEXT.lesson(titles[step.topic])`; `practice` → `TEXT.practice(titles[step.topic])`; `none` → `TEXT.none`. A topic with no title (not in the pack) falls back to the id.
  - `stepActions(step, lessons, query)`: `[{label, href} | {label, post, href?}]`. `query` is `""` or `?day=…`. `continue` → `{label: TEXT.openIt, href}` when the mode has a page (`lesson` → `lessons[topic]`, `practice` → `/practice.html?topic=<encodeURIComponent(topic)>`, `boss` → `/retest.html${query}`; other modes: no Open action) then `{label: TEXT.done, post: step.end}`; `boss` → `{label: TEXT.startBoss, href: /retest.html${query}}`; `lesson` → `{label: TEXT.startLesson, post: step.start, href: lessons[topic]}` (no `href` when the topic has no lesson: the button then only records the start); `practice` → `{label: TEXT.startPractice, post: step.start, href: /practice.html?topic=…}`; `none` → `[]`.
  - `api.go(href)` = `location.assign(href)`, exported on the same object so a test can replace it; page code always calls `api.go`, never `location` directly.

  Page code, `load(ids)` where `ids` = `{stats, today, cards, status}` elements (only when `document` exists and `#cards` is present):
  1. `day` = the page's `?day=` when well-formed (`case.js:263-267`), else null; `query` = `day ? `?day=${day}` : ""`. Fetch in parallel with `Promise.all`: `/api/state`, `/api/next${query}`, `/content/maths/topics.json`; `/api/lessons` in its own promise that resolves to `null` on any failure; `#status` = `TEXT.lessonsNotLoaded` only after the first three have loaded (PR #36 review F6). Any failure of the first three → `#status` = `TEXT.notLoaded` and stop.
  2. Stats (clear `#stats` first): `stat(TEXT.flame(next.flame.days, next.flame.target), TEXT.statWeek)`, `stat(String(state.xp.total), TEXT.statXp)`, `stat(TEXT.statStarted(started, topics.length), TEXT.statStartedLabel)` (`statStartedLabel` = `topics started`, in `TEXT` so the scan covers it) where `started` = pack topics with rung ≥ 1. `stat(big, label)` builds `.stat > b + span` with `el`.
  3. Today box (clear first, then show): a `p` with `stepText`, then one `a` (href only) or `button` (post) per action. A `post` action on click: disable the button, `postEvent(action.post)`; on `true` → `action.href ? api.go(action.href) : load(ids)` (re-render in place; no `location.reload`); on `false` → set `TEXT.notSaved` on the box's one `p.note` (reused across retries, PR #36 review F7) and re-enable.
  4. Cards (clear first), pack order: `div.card.<cardClass(rag)>` with `span.code` (`aliases[0]`), `span.topic` (title), the ladder `div.ladder[role=img][aria-label="<rung name>, rung n of 4"]` of four `i`, `i.on` for the first `rung` of them (rung 0 → none), `span.rung` = `${RUNGS[rung]}${due ? ` · ${due}` : ""}`, then a ` · ` text node and `a.meta` (`TEXT.lessonLink`) to `lessons[id]` or `span.meta` `TEXT.noLesson`. A topic absent from `state.topics` is `{rung: 0, nextDue: null, rag: null}`.
- **PATTERN**: `app/case.js` (`el`, `postEvent`, `load`, guard, export); v1 `map.html:98-109` (`ladder`, `card`); `app/practice.js:28-44` (topics fetch and `aliases[0]`).
- **GOTCHA**: `state.topics` is a prototype-less object (`replay.ts:177`); read with `state.topics[id]`, never `hasOwnProperty`. The `end` body for a lesson moves the rung (`replay.ts:79-84`): "Done with it" is the only thing on any page that posts it, and it posts the body the server returned, never a composed one. Never post `start` for a `continue` step. `load` must be re-entrant (it clears the three holders) because "Done" calls it again. Nothing touches `document` at module load. Biome: `observed` 2026-09-28, a probe with these constructs (`replaceAll`, `for…of` with `await`, `Promise.all`, `URLSearchParams`, `Object.entries`, optional chaining, `dataset`) passed every lint rule; the only finding was a formatter line break, which `--write` applies.
- **VALIDATE**: `bunx biome check --write app/map.js && bunx biome check app/map.js`, then `bunx biome lint --only=complexity/noExcessiveCognitiveComplexity app/map.js` (0 diagnostics), then Tasks 8 and 9.
- **SATISFIES**: AC 1, AC 3 (the map is the page that starts and ends a lesson so a boss can exist), AC 6.

### Task 8: UPDATE `src/events/types.ts` (export `MODES`) and CREATE `src/marking/map.test.ts`

- **IMPLEMENT**: change line 129 to `export const MODES = [` (nothing else in the file). Then the test: `await import(path.resolve(import.meta.dir, "../../app/map.js"))`, read `globalThis.map`. Tests:
  - `RUNGS` equals `RUNGS` from `src/flow/ladder.ts`.
  - `Object.keys(MODE_NAMES).sort()` equals `[...MODES].sort()` (one name per session mode).
  - `dueText`: `(null, D)` → `""`; `(D, D)` → `"re-test due today"`; `(D+1, D)` → `"re-test in 1 day"`; `(D+10, D)` → `"re-test in 10 days"`; `(D-1, D)` → `"re-test 1 day overdue"`; `(D-3, D)` → `"re-test 3 days overdue"`; across the BST switch: `("2026-03-30", "2026-03-27")` → `"re-test in 3 days"`.
  - `stepText`/`stepActions` for every `Step` kind: `lesson` from a real `nextStep(replay([]), DAY, pack, 3)` (`loadCasePack("maths")`), the rest hand-built. A `continue` action list holds exactly one `post` and it is the step's `end` body by identity (`toBe`); a `lesson` action holds `step.start` by identity and the lesson href; a `continue` of mode `case` has no Open action; `query` `?day=2026-10-10` is carried on the boss href.
  - Every string in `TEXT` (call the functions with sample arguments) and `RUNGS` has no `!` and no code point above U+2BFF.
- **PATTERN**: `src/marking/case.test.ts:1-30`.
- **VALIDATE**: `bun test src/marking/map.test.ts src/events && bunx tsc --noEmit`
- **SATISFIES**: AC 1, AC 3, AC 6.

### Task 9: CREATE `src/marking/map-dom.test.ts`

- **IMPLEMENT**: first CREATE `src/marking/dom.ts`: hand-typed `El` and `Doc` shapes, `doc()`, `keyEvent(key)` and `until(fn)`. `tsconfig.json` has `lib: ["ESNext"]` and no `dom` on purpose (server code must not reach `document`), so the DOM tests type the few objects they touch by hand and happy-dom supplies the real ones at run time. Then the happy-dom harness from Patterns, url `http://127.0.0.1:4731/map.html`, body = the four holders from Task 6 (`<div id="stats"></div><div id="today" hidden></div><div id="cards"></div><p id="status"></p>`). The fake `fetch` serves: `/api/state` → a `State` built with `replay([])` then `topics[first] = {rung: 1, nextDue: DAY, rag: "R"}` and `xp.total = 30` (serialise with `JSON.parse(JSON.stringify(...))` so the prototype-less maps become plain JSON, as the wire does); `/api/next` → `nextStep(thatState, DAY, pack, 3)` (`kind` is `boss`, because the first topic is due today; `expect` it); `/content/maths/topics.json` → `pack.topics`; `/api/lessons` → `lessonUrls(process.cwd(), "maths", pack.topics)`; `POST /api/event` → `Response.json({...body, t: "…"}, {status: 201})` and the body recorded. Import `app/map.js` with a `?dom` query (`${path}?dom`): Bun caches a module per process, and `map.test.ts`'s plain import would otherwise leave the page code un-run here. Tests, in order (one `document`, so they share state; use `await until(...)` before each assertion):
  1. Render: `#cards .card` count equals `pack.topics.length`; the first card has `.card.r`, one `.ladder i.on`, `span.rung` text `learning · re-test due today`, and an `a` whose `href` ends with the first topic's lesson URL; a rung-0 card has no `i.on` and text `not started`; `#stats` shows `0 of your 3 this week`, `30`, `1 of 21`; `#today` is visible and starts `Boss ready. 3 questions from 1 topic`; its only action is an `a[href="/retest.html"]`; no `POST` was made.
  2. Continue and Done: swap the fake `/api/next` to a `continue` step (`{kind: "continue", mode: "lesson", topic: first, end: endBody({mode: "lesson", topic: first, t: …})}`), then `await globalThis.map.reload()` (the page's own `load` bound to its holders, exported as `api.reload`; a page file cannot be re-imported). Then `#today` text is `Lesson open: Percentage of an amount.`; `Open it` is an `a` whose `href` is the lesson URL (a non-post action is a plain link, Task 7 step 3, so `api.go` is not involved); click `Done with it` → the recorded POST body deep-equals the `end` body; afterwards the page re-rendered (`calls` holds a second `GET /api/state`).
  3. Start a lesson: fake `/api/next` → the empty-state `lesson` step; `reload`; click `Start the lesson` → POST body deep-equals `step.start`, then `api.go` received the lesson URL. With the fake POST answering 500: the button is re-enabled and `#today` contains `Not saved`.
  4. Failure: fake `/api/state` answering 500; `reload`; `#status` is `The map did not load. Check the tutor window is still open.` and `#cards` is empty.
- **PATTERN**: the harness in Patterns (spiked); `src/flow/next.test.ts:13-15` for building a state.
- **GOTCHA**: `api.reload` and `api.go` are the two seams; the page calls them through the exported object (`api.go(href)`), not through closed-over locals, or the test's replacement is never seen. `GlobalRegistrator.register` must run before `quiz.js`/`map.js` import, and `unregister` in `afterAll`, or later test files see a `document` (the full suite was `observed` green with this order on 2026-09-28: 302 pass with the probe file first). Do not add a `bunfig.toml` preload.
- **VALIDATE**: `bun test src/marking/map-dom.test.ts`, then `bun test` (whole suite; nothing else may start failing).
- **SATISFIES**: AC 1, AC 3, AC 7 (every POST seen by the fake is to `/api/event`).

### Task 10: CREATE `app/retest.html`

- **IMPLEMENT**: the `practice.html` skeleton, `main.lesson.practice`. Strings from the retest.html table. Body: header (crumb, h1, aim), `<section id="intro"></section>`, `<section id="boss" class="quiz"></section>`, `<section id="result" class="result" hidden></section>`, `<p class="note" id="status"></p>`, footer. Scripts in this order: `/content/maths/generators.js`, `/quiz.js`, `/retest.js`.
- **PATTERN**: `app/practice.html:37-39` (script order: generators, quiz, page).
- **GOTCHA**: `quiz.js` runs `start()` on load and looks for `.quiz[data-items]` (`quiz.js:404-408`); the boss section has no `data-items`, so `quiz.js` leaves it alone and only its globals are used. The DOM test recreates these four ids (`intro`, `boss`, `result`, `status`).
- **VALIDATE**: `bun run dev`, open `/retest.html` on an empty record: `No boss today. Nothing is due.` (Level 4 step 1).
- **SATISFIES**: AC 3, AC 4, AC 6.

### Task 11: CREATE `app/retest.js`

- **IMPLEMENT**: an arrow IIFE. Pure helpers, exported on `root.boss` with `TEXT`, `RUNG_LINES`, `RUNGS`, `NEXT_DAYS`:
  - `passes(score, of)` = `of > 0 && score * 3 >= of * 2` (copy of `ladder.ts:42-44`).
  - `NEXT_DAYS = {1: 3, 2: 10, 3: 30, 4: 60}`, `RUNGS` as in map.js.
  - `itemsFile(topic)` = `/content/maths/items/${topic.replaceAll("/", "-")}.json`.
  - `buildItems(boss, topics, itemsByTopic, gens, quiz)` → `[{slot, item}]` in slot order: for `slot.item !== null`, the item with that id from `itemsByTopic[slot.topic]` when it carries an `answers` array, else (missing id, or an item `quiz.mark` cannot mark) a generator roll with `slot.seed`; for `slot.item === null`, `quiz.itemFromGenerated(slot.topic, gens[code](quiz.lcg(slot.seed)), slot.seed)` where `code` = the topic's `aliases[0]`; a slot with neither a found item nor a generator is dropped. Pure.
  - `scoreOf(boss, results)` → `[{topic, score, of, passed}]` in `boss.topics` order, `results` = `[{topic, ok}]`; a topic with `of === 0` is left out.
  - `retestBody(row, seed)` → `{v: 1, type: "retest", topic, score, of, passed, seed}`.
  - `rungLine(rung)` → `RUNG_LINES[rung]` (built with `NEXT_DAYS[rung]` interpolated).
  - `resultRow(title, row, rungAfter)` → `${TEXT.row(title, row.score, row.of)} ${rungLine(rungAfter)}`.
  - `api.reload = () => load(ids)` as the map does.

  Page code `load(ids)` (`ids` = `{intro, boss, result, status}`; only when `document` exists and `#boss` is present):
  1. `day` and `query` as in map.js. Fetch `/api/next${query}`. On failure `#status` = `TEXT.notLoaded`.
  2. `step.kind === "continue"`: mode `boss` → `postEvent(step.end)` then fetch `/api/next${query}` again once; if that is still `continue`, `#status` = `TEXT.couldNotClose` and stop; otherwise carry on with the new step. Any other mode → `#intro` = `TEXT.otherOpen` plus a link `TEXT.toMap` to `/map.html${query}`. `step.kind !== "boss"` → `#intro` = `TEXT.noBoss` plus the map link.
  3. `boss`: `#intro` = `TEXT.intro(slots.length, topics.length)` and a `button` `TEXT.begin`. On click: fetch `/content/maths/topics.json` and, for each distinct topic among fixed slots, `itemsFile(topic)` (parallel); `gens = window.GEN`; then `postEvent(step.start)`; on `false` → `TEXT.notSaved` in `#status`, button re-enabled, stop. On `true`: `items = buildItems(...)`; if empty → `#status` = `TEXT.noQuestions`; else render, and clear `#intro`.
  4. Render: for each `{slot, item}` at index `i`, a `div.q` with `p.stem` (`${i + 1}. ${item.stem}`), `.figure` (innerHTML, pack SVG) if any, `.working.faded` with the scaffold if any, `label` `TEXT.yourAnswer` + `input[type=text][autocomplete=off]`, `button.check` `TEXT.check`, `p.feedback` hidden, `div.working` hidden and empty (`item.working` is appended inside the check handler, as `case.js` does, so no answer text is in the page before the pupil commits). No `.hint`, no confidence radios, no topic name or code anywhere in the DOM before the result screen, and no item id in the DOM (`1MA1/R9/…#1` names the topic).
  5. Check (one go): empty → `TEXT.answerFirst` in `.feedback`; else `{ok, named} = quiz.mark(item, value)`; `.q` gets `done right|wrong`; feedback `TEXT.correct` or `named || TEXT.wrong`; reveal `.working`; disable input and button; push `{topic: slot.topic, ok}`. Enter in the input checks, as `quiz.js:348-353`.
  6. When every item is done: `rows = scoreOf(boss, results)`; post `retestBody(row, boss.seed)` for each row in order, sequentially (`for … await`); a `false` marks that row `saved: false` and the loop continues. If every row saved: fetch `/api/next${query}`; if `continue`, `postEvent(step.end)`. Fetch `/api/state` for `after`. Show `#result` (unhide): `h2` `TEXT.over`, an `ol` with one `li` per row: `span.row` = `resultRow(title, row, after.topics[topic].rung)`; an unsaved row's `li` gets `TEXT.row(...)` + `TEXT.notScored` + `TEXT.notSaved` instead; then `p` with `a[href="/map.html${query}"]` `TEXT.backToMap`.
- **PATTERN**: `app/quiz.js:111-162` (the `.q` DOM minus hint and confidence), `quiz.js:289-345` (check flow, one try), `app/case.js` (skeleton, `postEvent`, `el`, `?day=`).
- **GOTCHA**: `quiz.initQuiz` is not used: it adds the hint path, Sure/Not sure, posts attempts and offers "Five more". `boss.seed` is the `seed` on every retest line so a boss can be rebuilt from the log. `passed` must be `passes(score, of)` or the server answers 400 (`event.ts:31-39`). The `end` is posted only after every retest saved; a partial save leaves the session open, and the next load's step 2 closes it and re-forms the boss from the topics still due (they are the unsaved ones: a saved retest moved its topic's `nextDue`). Biome: no `var`, `for...of`, no `innerHTML` with pupil text. Nothing touches `document` or `window.GEN` at module load.
- **VALIDATE**: `bunx biome check --write app/retest.js && bunx biome check app/retest.js`, `bunx biome lint --only=complexity/noExcessiveCognitiveComplexity app/retest.js` (0 diagnostics), then Tasks 12 and 13.
- **SATISFIES**: AC 3, AC 4, AC 5.

### Task 12: CREATE `src/marking/retest.test.ts`

- **IMPLEMENT**: import `app/quiz.js` then `app/retest.js` under Bun (no happy-dom here). Load the pack with `loadCasePack("maths")` and the generators with `loadGenerators("maths")`. Tests:
  - `passes` parity: for `of` in 1..9 and `score` in 0..`of`, `boss.passes(score, of)` equals `passes(score, of)` from `src/flow/ladder.ts`; and `(0, 0)` is `false` on both.
  - `itemsFile` parity: for every pack topic id, `boss.itemsFile(id)` equals `/content/maths/items/${itemsFileName(id)}`.
  - `NEXT_DAYS` and `RUNGS` equal the server's.
  - `buildItems` on a real boss: `State` with the first two pack topics due (`boss.test.ts:17-23`) and one confident-wrong pack item `${A}#1`; `b = boss(state, DAY, pack)`; `itemsByTopic` from `pack.items`; `gens` from `loadGenerators`; `quiz` from `globalThis.quiz`. Assert 6 items, the fixed slot's item has id `${A}#1` and its `answers` from the pack, every generated item has `seed` equal to its slot's seed and `id` ending `#gen`, and building twice gives equal `stem`s. A slot naming an unknown item id (`${A}#999`) becomes a generator roll with the slot's seed. With `gens = {}` and an unknown id, the slot is dropped.
  - `scoreOf`: results `[{A, ok:true},{B, ok:false},{A, ok:true},{A, ok:false},{B, ok:true},{B, ok:true}]` with `boss.topics = [B, A]` → `[{B, 2, 3, true}, {A, 2, 3, true}]`; `[{A, ok:false}]` → `[{A, 0, 1, false}]`; a topic in `boss.topics` with no results is left out.
  - `retestBody` + `parseEvent(JSON.stringify({...body, t}))` is a non-null `retest` for a pass and a fail, and `body.passed === passes(body.score, body.of)`.
  - `rungLine(1..4)` equals the four lines in the string table and each contains its `NEXT_DAYS` count; `resultRow` renders `Percentage of an amount: 2 of 3. One cold pass. …`.
  - **Register scan**: for `app/map.html` and `app/retest.html`, strip tags (`/<[^>]+>/g`, which also removes `<!doctype html>`) and assert the text has no `!` and no code point above U+2BFF; for every string reachable from `boss.TEXT` (functions called with sample arguments), `boss.RUNG_LINES` and `map.TEXT` (import `app/map.js` too), the same.
  - **No page writes a file**: for every `app/*.js` and `app/*.html`, no match for `/localStorage|sessionStorage|indexedDB|document\.cookie|node:fs|\bBun\./` (`observed` 2026-09-28: no existing file matches), and every `fetch(` in `app/*.js` whose init has `method: "POST"` targets `/api/event` or `/api/config` (collect with `/fetch\(\s*"(\/api\/[a-z]+)"[\s\S]{0,120}?method:\s*"POST"/g`).
- **PATTERN**: `src/marking/quiz.test.ts` (import, parity with a server function), `src/flow/boss.test.ts:17-27` (a due state), `src/flow/properties.test.ts:218-233` (source scan).
- **GOTCHA**: `loadGenerators` runs `generators.js` once per process and sets `globalThis.GEN`; `retest.js` must not read `window.GEN` at module load, so import order does not matter.
- **VALIDATE**: `bun test src/marking/retest.test.ts`
- **SATISFIES**: AC 3, AC 4, AC 5, AC 6, AC 7.

### Task 13: CREATE `src/marking/retest-dom.test.ts`

- **IMPLEMENT**: the happy-dom harness, url `http://127.0.0.1:4731/retest.html?day=2026-10-10`, body = `<section id="intro"></section><section id="boss" class="quiz"></section><section id="result" hidden></section><p id="status"></p>`. Build `state` as in Task 12 (`A` due, `${A}#1` confident-wrong; `B` not due, so the boss has one topic and 3 slots: one fixed, two rolls) and `b = boss(state, DAY, pack)`. The fake `fetch` serves `/api/next?day=2026-10-10` from a mutable `nextStep` variable (initially `{day, flame, step: {kind: "boss", boss: b, start: startBody("boss", null)}}`), `/api/state` from a mutable `stateVar`, `/content/maths/topics.json`, `/content/maths/items/<file>.json` from `pack.items` (`itemsFileName` to match), and `POST /api/event` → 201 with the body recorded, and on a `retest` body also advances `stateVar.topics[topic]` to `{rung: afterRetest(1, passed), nextDue: …}` and on a session `end` sets `nextStep` to the `lesson` step (`nextStep(stateVar, …)` is fine too). `generators.js` is loaded through `loadGenerators("maths")` before importing `quiz.js` and `retest.js` (`window === globalThis` under the registrator, observed); then set `globalThis.GEN` to the returned table, because `src/content/generators.test.ts` loads a second subject's table and replaces the global in the full suite. Import `retest.js` with a `?dom` query, as Task 9. Tests, in order:
  1. Intro: `#intro` text starts `3 questions from 1 topic.` and holds one `button`; `#boss` is empty; no POST yet.
  2. Begin: click; `await until(() => document.querySelectorAll("#boss .q").length === 3)`; the first recorded POST deep-equals `startBody("boss", null)`; `#intro` is empty; no `.q` contains `.hint`, an `input[type=radio]`, the topic title `Percentage of an amount`, the code `U349` or the string `#1`; every `.working:not(.faded)` is hidden; the stem of the fixed slot's `.q` equals the pack item's stem (the slot index is known from `b.slots`).
  3. Answer: for each `.q`, type the item's first accepted answer (from `pack.items` for the fixed one; from `quiz.itemFromGenerated(topic, GEN[code](quiz.lcg(seed)))` for the rolls) for two of them and `"nope"` for the third, dispatch `Enter` on one and click `Check` on the others; each `.q` gains `done` and `right`/`wrong`, its feedback reads `Correct.` / `Not this time.` (or a named misconception), and its `.working` is now visible.
  4. Posts: `await until(() => document.querySelector("#result h2"))`; the recorded POSTs after the start are exactly one `retest` `{topic: A, score: 2, of: 3, passed: true, seed: b.seed}` then one session `end` `{phase: "end", mode: "boss"}` (the `end` the fake `/api/next` returned for the `continue` step: set `nextStep` to `continue` with `endBody(...)` right after the `start` POST is seen). `#result` shows `Boss over.`, one `li` whose text is `Percentage of an amount: 2 of 3. One cold pass. You did it from memory once. Next re-test in 10 days.`, and a link to `/map.html?day=2026-10-10`.
  5. Continue-boss on load: reset the DOM and the recorder, set `nextStep` to a `continue` with mode `boss` and an `end` body; `await globalThis.boss.reload()`; the first POST is that `end` body and the intro renders the boss the fake returns next. Then with mode `lesson`: no POST, `#intro` text is `Something else is open. Finish it on the map first.` Then with a `lesson` step: `No boss today. Nothing is due.`
  6. A failed retest post: fake POST answering 500 for `retest` bodies; run steps 2 to 3 again; `#result` has the row with `Not scored yet. Not saved.` and no `end` was posted.
- **PATTERN**: Task 9's harness; `src/flow/boss.test.ts:17-27`.
- **GOTCHA**: happy-dom `click()` and `dispatchEvent(new KeyboardEvent("keydown", {key: "Enter"}))` both fire listeners (`observed` 2026-09-28). Setting `input.value` then dispatching is enough; no `input` event is needed because the page reads `input.value` on check. Keep `until` polls at 5 ms; the whole file should run under 2 s.
- **VALIDATE**: `bun test src/marking/retest-dom.test.ts`, then `bun test` (whole suite).
- **SATISFIES**: AC 3, AC 4, AC 5, AC 7.

### Task 14: UPDATE `app/practice.js`: `?topic=` pre-tick

- **IMPLEMENT**: in the `topics.json` `.then`, read `const only = new URLSearchParams(location.search).get("topic");` once, and set `box.checked = only === null || !topics.some((x) => x.id === only) || t.id === only;` (everything ticked as today unless the query names a pack topic, in which case only that one).
- **PATTERN**: `app/practice.js:28-44`.
- **GOTCHA**: five lines; nothing else in the file changes. A `?topic=` that names no pack topic keeps today's behaviour. `map.js` encodes the id with `encodeURIComponent` (it holds `/`), and `URLSearchParams.get` decodes it.
- **VALIDATE**: `bunx biome check app/practice.js`; Level 4 step 8.
- **SATISFIES**: AC 1 (the practice step the map offers lands on that topic).

### Task 15: UPDATE `app/index.html`: link to the map

- **IMPLEMENT**: in `#practice` (lines 16-19) add `<p><a href="/map.html">Your map</a></p>` as the first line.
- **VALIDATE**: `server.test.ts` static test (Task 16) asserts `/map.html` is in the index.
- **SATISFIES**: AC 1.

### Task 16: UPDATE `src/server.test.ts`: static routes, `/api/lessons`, the full loop

- **IMPLEMENT**:
  - In "static: app/ at / and content/ …" (lines 101-128): add `expect((await get("/map.html")).status).toBe(200)` and the same for `/map.js`, `/retest.html`, `/retest.js`; in the port-ladder test (line 80-81) add `expect(html).toContain("/map.html")`.
  - New test "api: /api/lessons gives a lesson URL per topic that the server serves, and refuses a foreign Origin": GET `/api/lessons` is 200, its key count equals `opts.topics.length`, a GET of the first URL is 200 and contains `data-items=`; a foreign Origin is 403.
  - New test "loop: lesson start and end from /api/next, a boss three days on, retest and end, the rung and next-due move" using `withServer`. Every expected day derives from the `t` on the event the server returns (a 201 body is the saved event, `event.ts:79`), so the test never reads the clock and cannot race midnight:
    1. `first = opts.topics[0].id`. `n1 = GET /api/next` → `step.kind === "lesson"`, `step.topic === first`. POST `n1.step.start` → 201.
    2. `n2 = GET /api/next` → `continue` with `mode "lesson"`. `saved = POST n2.step.end` → 201; `d0 = localDay(saved.t)`. `GET /api/state` → `topics[first]` is `{rung: 1, nextDue: addDays(d0, 3)}`.
    3. `d3 = addDays(d0, 3)`; `n3 = GET /api/next?day=${d3}` → `boss`, `boss.topics` equals `[first]`, `boss.slots` length 3, and `JSON.stringify(n3)` contains neither `"answers"` nor the topic title.
    4. POST `n3.step.start` → 201. `GET /api/next?day=${d3}` → `boss` again with `slots` deep-equal to `n3.step.boss.slots` (a session is open only on the day it started, `openToday`, so under `?day=` it is simply not resumed). `GET /api/next` (the real day) → `continue` with `mode "boss"` and no `boss` key. POST its `end` → 201. `GET /api/next?day=${d3}` → the same `slots` again.
    5. POST `n3.step.start` again, then `r = POST {v:1, type:"retest", topic: first, score: 3, of: 3, passed: true, seed: n3.step.boss.seed}` → 201; `d1 = localDay(r.t)`; `GET /api/next` (real day) → `continue` with `mode "boss"`; POST its `end` → 201.
    6. `GET /api/state` → `topics[first]` is `{rung: 2, nextDue: addDays(d1, 10)}`, `xp.total === 20`, `session === null`. `GET /api/next?day=${d3}` → `lesson` on `opts.topics[1].id`.
    7. POST `{…retest, score: 1, of: 3, passed: true}` → 400 with `error` starting `Refused: passed`.
- **PATTERN**: `src/server.test.ts:440-476` (the `/api/next` test), `:276-325` (post helper and log line counts).
- **GOTCHA**: under `?day=` the boss page cannot end its session either (`closeSession` asks `/api/next?day=`), so a manual boss run on a future day leaves the session open until the real-day map's Done; real use has no `?day=`. `nextDue` is set from the real `t` (`replay.ts:83, 112`); reading `t` off the 201 body is what makes the expectation exact even if the London day changes between two steps (then `d0` and `d1` differ and each expectation follows its own event). The `boss.slots` order is deterministic for a given day and state, so step 4's deep-equal is stable.
- **VALIDATE**: `bun test src/server.test.ts`
- **SATISFIES**: AC 2, AC 3 (the full loop with no model, at the route level), AC 7.

### Task 17: UPDATE `.claude/references/events.md`

- **IMPLEMENT**: in the Routes paragraph, after the `GET /api/next` sentence, add: "`GET /api/lessons` is `{ [topicId]: "/content/<subject>/lessons/<file>" }` for the topics whose lesson names their items file in `data-items` (`lessonFile`, now in `src/content/pack.ts`); read once per root. The map (`app/map.html`) posts the `start`/`end` bodies `/api/next` returns; the boss page (`app/retest.html`) posts the boss `start`, one `retest` per topic with `seed` = the boss seed, then the `end`." In the Tests paragraph add one sentence: "Page code runs under `bun test` with `@happy-dom/global-registrator`, registered per test file (`src/marking/*-dom.test.ts`) and unregistered in `afterAll`; no preload."
- **VALIDATE**: read it back; `bunx biome check .` ignores Markdown.
- **SATISFIES**: documentation AC.

### Task 18: Register re-check, gate, manual loop

- **IMPLEMENT**: diff every pupil-facing string against the string tables; any that changed gets `no-ai-slop` then `humanizer` and the scan in Task 12 re-run. Then `bun run check`. Then Level 4.
- **VALIDATE**: `bun run check` green; Level 4 steps recorded with `observed`.
- **SATISFIES**: AC 6, AC 8.

---

## TESTING STRATEGY

### Unit Tests

Browser helpers under Bun, one file per page, the `quiz.test.ts`/`case.test.ts` way: `src/marking/map.test.ts`, `src/marking/retest.test.ts`. Every server-side copy in the browser (`RUNGS`, `NEXT_DAYS`, `passes`, `itemsFile`, `MODE_NAMES` against `MODES`) has a parity test against the server value, because the server refuses a `retest` whose `passed` disagrees. `src/api/lessons.test.ts` for the route helper.

### Integration Tests

Two layers, both automated:

- **Page DOM under happy-dom** (`map-dom.test.ts`, `retest-dom.test.ts`): the real page files run against a fake `fetch` that records every request. They assert what renders, which body each click posts (deep-equal to the body the fake `/api/next` returned), the order of the boss's posts (start, retest, end), and the unlabelled invariant of the boss DOM.
- **Routes** (`server.test.ts` "loop"): the AC's "map → boss → retest event → map shows the new rung" performed through the routes the pages call, in the pages' order (start, continue/end, boss, start, retest, end, state). It pins the two facts the pages rely on: a reload mid-boss re-forms the same boss, and a `retest` with the wrong `passed` is a 400.

The seam between the two layers is the JSON shape of `/api/next`, `/api/state` and `/api/lessons`; the DOM tests build their fakes from the same `nextStep`, `replay` and `lessonUrls` functions the routes call, so a shape drift breaks a test rather than a page.

Level 4 in a real browser remains the check for what happy-dom does not model: real layout, the `figure` SVG and clipboard.

### Edge Cases

- Empty record: the map shows 21 "not started" cards, flame `0 of your 3`, XP `0`, today = lesson on the first topic. (`map-dom.test.ts` 1 for a rung-0 card; Level 4 step 1 for the whole page.)
- Reload mid-boss: `continue` with mode `boss` and no `boss` → the page posts `end` and gets the same boss back. (`retest-dom.test.ts` 5; `server.test.ts` loop step 4; Level 4 step 5.)
- A lesson open in another tab while the boss page is opened: `continue` with mode `lesson` → the boss page posts nothing and sends the pupil to the map. (`retest-dom.test.ts` 5; Level 4 step 7.)
- A slot names an item id the items file no longer holds → a generator roll with the slot seed; no generator either → dropped; a topic with 0 questions posts no `retest`. (`retest.test.ts` `buildItems`, `scoreOf`.)
- One retest post fails → the row shows `Not scored yet. Not saved.`, no `end` is posted. (`retest-dom.test.ts` 6.) The next load re-forms a boss with only the unsaved topic, because a saved retest moved its topic's `nextDue`. (`server.test.ts` loop step 6, "no longer due"; Level 4 step 8.)
- A `Done` or `Start` post fails → `Not saved` in the today box, the button re-enabled, no navigation. (`map-dom.test.ts` 3.)
- `?day=` malformed → ignored, today is used. (`case.js` pattern; Level 4 step 4 with `?day=today`.)
- Server gone: every fetch failure names the tutor window. (`map-dom.test.ts` 4; Level 4 step 9.)
- A `passed` that disagrees with the score is refused: the browser `passes` copy is pinned by parity and by the 400 in the loop test.
- DST edge in `dueText`: calendar days, not hours. (`map.test.ts`.)
- `state.topics` lacks a topic in the pack (never attempted): rendered as rung 0. (`map-dom.test.ts` 1.)
- The London day changes between two loop steps: each expected `nextDue` follows the `t` of its own saved event. (`server.test.ts` loop, by construction.)

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and 100% feature correctness.

### Level 0: Worktree

The branch lives in `~/Desktop/study-tutor-t6` on `feature/t6-o1-pages`, made from `main` at `252e50b` on 2026-09-28. `bun install` was run there and the baseline `bun run check` passed: 301 pass, 0 fail, 63,485 expect() calls, 7.97 s (`observed`, 2026-09-28). `bun add -d @happy-dom/global-registrator` was run there the same day (`package.json` and `bun.lock` modified, uncommitted) and the suite stayed at 301 pass. Work, commit and PR from that folder.

### Level 1: Syntax & Style

```bash
cd ~/Desktop/study-tutor-t6
bunx tsc --noEmit
bunx biome check .
```

`biome check .` reports 4 warnings on `app/style.css` from `main` (`observed`, PR #33 body); the count must not rise.

### Level 1b: Complexity

```bash
bunx biome lint --only=complexity/noExcessiveCognitiveComplexity app/map.js app/retest.js src/api/lessons.ts src/content/pack.ts
```

0 diagnostics for these four files. (`app/case.js`, `app/quiz.js` and `src/server.ts` carry 4 infos today, `observed` 2026-09-28; they are not changed here beyond one route entry in `server.ts`.)

### Level 2: Unit Tests

```bash
bun test src/marking src/api/lessons.test.ts src/content src/mcp src/events
```

### Level 3: Integration Tests

```bash
bun test src/marking/map-dom.test.ts src/marking/retest-dom.test.ts src/server.test.ts
bun run check
bun scripts/test-generators.ts
```

### Level 4: Manual Validation

Run in `~/Desktop/study-tutor-t6`. `data/` is gitignored. `T` below is today's London date; `T+3` and `T+10` are `T` plus 3 and 10 calendar days. `agent-browser` can drive these (scroll a target into view before clicking it, per the project memory).

1. `rm -rf data && bun run dev`; open `http://127.0.0.1:P/map.html`. 21 cards, every one `not started` with an empty ladder and a `lesson` link; stats `0 of your 3 this week`, `0` XP, `0 of 21 topics started`; today box `Next: Percentage of an amount.` with `Start the lesson`. Open `/retest.html`: `No boss today. Nothing is due.`
2. Click `Start the lesson`: the U349 lesson opens. `tail -1 data/events.jsonl` is `"type":"session","phase":"start","mode":"lesson","topic":"1MA1/R9/of-an-amount"`. Back on `/map.html`: today box `Lesson open: Percentage of an amount.` with `Open it` and `Done with it`.
3. Click `Done with it`: the box re-renders without a page reload; the U349 card reads `learning · re-test in 3 days` with one bar filled; `1 of 21 topics started`; today box now `Next: Simplifying ratio.`
4. Open `/map.html?day=T+3`: the U349 card reads `re-test due today` and the today box is `Boss ready. 3 questions from 1 topic due a re-test.` with `Start the boss`. Open `/map.html?day=today`: the same as step 3 (a bad day is ignored).
5. Click `Start the boss` (lands on `/retest.html?day=T+3`): intro `3 questions from 1 topic.` and `Begin`. Click `Begin`; three numbered questions appear with no topic name, code or hint. Reload the page before answering: the same three stems come back (`tail -3 data/events.jsonl` shows boss start, boss end, boss start).
6. Answer all three (any answers; note which are right from the feedback). The result screen names `Percentage of an amount`, `n of 3`, and the rung line: at 2 or 3 right, `One cold pass …`; at 0 or 1, `Not yet from memory …`. `tail -3 data/events.jsonl`: `retest` with `seed`, `xp` 20, `session end boss`. Click `Back to the map`: on `/map.html?day=T+3` the card reads `1 pass · re-test in 7 days` (due `T+10`) or `learning · re-test due today` (due `T+3`), XP `20`.
7. On `/map.html`, `Start the lesson` for Simplifying ratio, then open `/retest.html?day=T+3` in the same browser: `Something else is open. Finish it on the map first.` Back on the map, `Done with it`.
8. Two-topic boss and a partial save: with both topics on `learning`, open `/retest.html?day=T+3`: `6 questions from 2 topics.` Begin, answer all six. Result shows two rows. (To see the partial-save path, stop the server after the first `retest` line appears in `data/events.jsonl`, or accept the automated `retest-dom.test.ts` 6 as the check for it; say which in the report.)
9. Practice pre-tick: open `/practice.html?topic=1MA1/R4`: only Simplifying ratio is ticked. `/practice.html` alone: all ticked.
10. Stop the server; on the open map click `Done with it` or reload: the page says `Check the tutor window is still open.` and nothing is written (`ls data/`: `events.jsonl`, `state.json`, `state.prev.json` at most; no other file).
11. `curl -s http://127.0.0.1:P/api/lessons | jq 'keys | length'` → 21.

Steps 1 to 11 need the dev server, a browser and `curl` only; `?day=` supplies the future day. No seed script.

### Level 5: Additional Validation (Optional)

- `bun scripts/synth-events.ts --n 200` then open `/map.html`: cards for the five synthetic topics (not in the pack) do not appear (the map renders pack topics only), the flame and XP reflect the log.

---

## ACCEPTANCE CRITERIA

- [ ] AC 1: `app/map.html` shows one card per pack topic with rung (0 to 4) and the next re-test due from `/api/state`, the weekly flame from `/api/next`, total XP, and a today box for the step `/api/next` returns; the map posts the `start` and `end` bodies it was given and never a composed session event (`map-dom.test.ts` 2 and 3 assert the posted body is the served body).
- [ ] AC 2: every card links to its lesson through `GET /api/lessons`; `lessonFile` lives in `src/content/pack.ts` and `open_lesson` still passes its tests.
- [ ] AC 3: a full loop with no model: map → lesson start and end → boss three days on → retest event → map shows the new rung. Proven at the route level in `server.test.ts`, at the DOM level in the two `*-dom.test.ts` files, and by hand in Level 4 steps 1 to 6.
- [ ] AC 4: the boss page renders slots as pack items or seeded generator rolls, mixed and unlabelled (no topic name, code, hint, item id or Sure control before the result; `retest-dom.test.ts` 2), one go each, and posts one `retest` per topic with `passed` matching the server's `passes`, plus the session `end`.
- [ ] AC 5: the result screen states each topic's score and rung change as what the pupil can and cannot do yet, using the four `RUNG_LINES`; no grade, no prediction.
- [ ] AC 6: register: every pupil-facing string is one from the string tables (passed `no-ai-slop` then `humanizer`) or has had the same pass; the scan finds no `!` and no emoji in either page or any exported string.
- [ ] AC 7: nothing in `app/` writes a file: the scan finds no storage or file API in `app/`, every POST targets `/api/event` or `/api/config`, and the DOM tests' fake `fetch` saw only those POSTs.
- [ ] AC 8: `bun run check` green; Level 1b 0 diagnostics on the four new or moved files; no new `style.css` warning; `@happy-dom/global-registrator` committed in `package.json` and `bun.lock`.
- [ ] Documentation: `.claude/references/events.md` names `/api/lessons`, which page posts which body, and the happy-dom test convention.

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

- **Q1: who ends a lesson session.** Assumed: the map's `Done with it` button, posting the `end` body `/api/next` returned. The alternative is `quiz.js` posting `end` when the lesson quiz finishes, which touches T4's file and ties "finished" to five checks. Worst case for the chosen design: a pupil who never clicks Done leaves a lesson open; the next day `openToday` drops it, the lesson stays rung 0 and the map offers it again. Nothing is lost and nothing is faked. Say if you want the quiz to end it instead: Task 7's `continue` actions stay, and a new task adds one `fetch("/api/next")` to `quiz.js`'s `render()` when `finished`.
- **Q2: no attempts and no Sure/Not sure on the boss.** Assumed, per T5 Q4: a boss posts `retest` only. Consequence: a boss never clears a `confidentWrong` item (only a correct practice attempt does), so the same wrong item can lead the next boss for that topic until practice clears it. Also no attempt XP on top of the 20 per topic. If you want attempts too, Task 11 step 5 adds `quiz.postAttempt`-shaped posts; XP per boss then becomes 9 × 10 + 3 × 20.
- **Q3: `/api/lessons` and the `lessonFile` move.** Assumed. The alternative that touches no `src/mcp` file is `src/api/lessons.ts` importing `lessonFile` from `../mcp/tools`, which makes the api layer load the MCP module (and `tools.ts` already imports `../api/event`). The move is a 4-line touch of `tools.ts` with no behaviour change. A third option, a `lesson` field in `topics.json`, repeats a fact the file system holds and is ruled out by the content-keys rule.
- **Q4: the working shows after each boss check.** Assumed (the attempt exists once the pupil commits). "Cold" is about what shows before the answer. The alternative, no working until the result screen, delays feedback by up to nine questions.
- **Q5: the map is not the home page.** Assumed: `index.html` gains a link. T0 made the map the pupil's home; making `/` serve `map.html` here changes `server.test.ts:75-81` and the lessons' `Progress` crumb (`content/**`, not touched). One line to flip later: `if (pathname === "/") pathname = "/map.html"`.
- **Q6: practice pre-tick (`?topic=`)** is a five-line change to `practice.js`, outside the ticket's file list but needed for the map's practice step to mean anything. Say if you would rather the map sent the pupil to `/practice.html` unticked.
- **Q7: the flame target.** Read from `/api/next`'s `flame.target` (`profile.json`, default 3). The map does not offer to change it; that is the setup page's field.
- **Q8 (ordering, worst case): a retest post succeeds and the session `end` fails.** The retest is on record and the rung moved; the boss session stays open. Next load: `continue` mode `boss` → the page posts `end` and re-fetches; the topic is no longer due, so the boss re-forms from other due topics or reports "No boss today". Nothing is double-counted: replay keys nothing on the session for a retest.
- **Q9 (ordering, worst case): the pupil answers a boss across London midnight.** `day` was fixed at page load and the `retest` `t` is stamped by the server at post time; `nextDue` moves from the post day (`replay.ts:112-113`). A boss started at 23:58 and finished at 00:02 lands its next due one day later than the map showed. Accepted; the map re-reads `nextDue` on load.
- **Q10: a dev dependency for DOM tests.** Assumed yes: `@happy-dom/global-registrator` is a devDependency, like Biome and TypeScript; it is not in the shipped binary. Registered per test file, never preloaded, so nothing else in the suite changes meaning. The alternative is to leave the DOM paths to Level 4 only, which is where the risk sat.

## NOTES (open canvas)

**Why the map drives the session.** T5 gave `/api/next` the exact bodies and said the page posts them verbatim. No page did. Without a lesson `end` nothing becomes due and the boss is unreachable from the app, so the ticket's AC loop cannot be performed. The map is the natural home for start and end: it is where the step is shown and where the pupil returns. This is the one scope call in the plan that goes beyond "level per topic, next-due, flame, boss available"; it is what makes those four things move.

**Why `buildItems` and `scoreOf` are pure and take `quiz`.** Every decision lives in a helper that takes fetched data and returns data, so the unit test can hand it the real `globalThis.quiz` and the page can hand it `window.quiz`. The DOM tests then only have to check that the page calls them and renders the result.

**Why `api.go` and `api.reload` are seams on the exported object.** happy-dom's `location.assign` changes `href` without a network navigation and `location.reload()` is a no-op (`observed`), so a test could read `location.href` after a click. Routing the call through the exported object is still cleaner: the test records the destination without touching `location`, and "Done" re-rendering through `load()` instead of `reload()` means the DOM test sees the re-render as a second `GET /api/state` in its recorder.

**De-risking spikes, 2026-09-28, all `observed` in `~/Desktop/study-tutor-t6`:**

| spike | result |
|---|---|
| `bun add -d @happy-dom/global-registrator` | 20.14.5 installed in 1.2 s |
| A probe test registering happy-dom, faking `fetch`, importing `quiz.js` then `case.js` with `#case` in the body | `case.js` ran its page code at import, made `GET /api/case`, rendered `No case today.`; `globalThis.quiz` and `window.detective` set; `document.readyState` `"complete"` |
| The same probe placed first in the suite (`src/api/aa-…`) with `unregister` in `afterAll`, then `bun test` | 302 pass, 0 fail; no other file affected |
| `location.search`, `location.assign("/x")`, `location.reload()`, `button.click()`, `KeyboardEvent("keydown", {key: "Enter"})` under a registered URL | search read back; assign set `href` to `http://127.0.0.1:4731/x` with no throw; reload no-op; click and keydown listeners fired |
| `lessonFile` over all 21 topics | 21 lessons found in 7.2 ms |
| A biome probe under `app/` with the constructs the pages need (`replaceAll`, `for…of` with `await`, `Promise.all`, `URLSearchParams`, `Object.entries`, `dataset`, optional chaining, the `typeof document` guard, the `root.x` export) | lint clean; one formatter line break (`--write` fixes); complexity rule 0 diagnostics |

**Slots and files.** A fixed slot names `1MA1/R9/of-an-amount#1`; its file is `/content/maths/items/1MA1-R9-of-an-amount.json` (`itemsFileName`), one fetch per distinct topic. A generated slot needs `GEN[aliases[0]]`; all 21 topics have one (`observed`: 21 `GEN.U… =` lines, 21 single-alias topics). The boss server-side already falls back to the topic's other items when a generator is missing (`boss.ts:63-77`), so a slot with `item === null` always has a generator; the browser fallback covers content drift only.

**Size** (`expected`): map.html 45, map.js 240, retest.html 40, retest.js 310, style.css +25, practice.js +5, index.html +1, lessons.ts 25, server.ts +8, pack.ts +18, tools.ts −14, types.ts +0 (one keyword), tests about 620 (two DOM files add about 240), events.md +6. About 1,330 lines against the ticket's 600–900; the overshoot is tests, which is what makes every AC checkable without a browser.

**Rejected: a `GET /api/map` route** returning state, next, titles and lesson URLs in one shape. It would let the page make one fetch, but it duplicates `/api/state` and `/api/next` and CLAUDE.md's "A new page" rule names `/api/state` as the read. Four parallel fetches on localhost cost nothing.

**Rejected: rendering the boss server-side** (stems in the `Boss`). `boss.test.ts` asserts the boss JSON carries no `stem`; the page builds questions, as practice does.

**Rejected: a `bunfig.toml` `[test] preload` for happy-dom.** It would give every test file a `document`, so `quiz.js`, `case.js`, `map.js` and `retest.js` would all run their page code when any test imports them, and every `typeof document` guard would stop meaning "in a browser".

## AMENDMENTS

- 2026-09-28: de-risking pass on the owner's request ("increase confidence to 10 and address all risks"). Added: `@happy-dom/global-registrator` as a dev dependency and two DOM test files (Tasks 9 and 13) so the page code is tested under `bun test`, with `api.go`/`api.reload` seams and "Done" re-rendering through `load()` instead of `location.reload()`; the loop test now derives every expected day from the `t` on the saved event, so it cannot race London midnight; `MODES` exported from `src/events/types.ts` so `MODE_NAMES` is pinned to the real mode list; the string tables were passed through `no-ai-slop` then `humanizer` and fixed here; six spikes recorded as `observed` (happy-dom in the suite, navigation and events under happy-dom, `lessonFile` timing, a biome probe of the page constructs). Level 4 step 8 rewritten to a performable two-topic boss. Q10 added.
- 2026-09-28 (implementation, see `.claude/reports/t6-o1-pages-report.md` D1–D12): `openToday` means `?day=` never resumes a session started today, so the loop test's steps 4 and 5 read the `continue` from the real day and Level 4 steps 5 and 7 run on the real day; `src/marking/dom.ts` added because tsconfig has no `dom` lib; DOM tests import their page with `?dom` (module cache) and pin `globalThis.GEN` (a second generators table in the suite); `retest.js` appends the working at check time and skips the unused `before` state fetch; `buildItems` rolls a fixed item that has no `answers`; `.result ol li`; `tools.ts` also drops `import path`.
