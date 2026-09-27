# Feature: E1 on the v1 folder: level map and daily detective case, no engine change

The following plan should be complete, but validate documentation and codebase patterns and task sanity
before you start implementing.

Pay special attention to naming of existing helpers in the v1 folder (`window.GEN`, `window.PROGRESS`,
`window.buildQuiz`, `window.initQuiz`, the `.card` / `.ladder` / `.stat` / `.copy` classes). Import from
the right files. Everything runs from `file://` with no build step, no server and no model.

## Feature Description

Two new static pages dropped onto the master v1 folder (`~/Desktop/Matis_study_tutor/`, PRD Q1 taken as
that copy, epic assumption A2):

- `map.html`: the pupil's home page. A level map with one level per topic, the rung of each level read from
  `topics.md` via `assets/progress-data.js`, a weekly flame ("2 of 3 this week"), today's case, the
  practice page, and a two-week count of days the pages were opened (the E1 read).
- `case.html`: one detective case a day. A fresh-number question from a generator, a fictional pupil's
  first step and answer, and the question "where did they go wrong?" with the generator's `wrong` map as
  the options plus "nowhere, the answer is right". A 1 to 3 confidence bet before checking. A calibration
  line after ("you bet 3 and were wrong"; "over your last 7 cases you bet 15 and won 9"). A confident
  wrong answer (bet 3, wrong) re-asks at once with new numbers and seeds tomorrow's case.

Both pages record only date, mode, code and a quiz-style result, the columns a `sessions.md` row already
holds, into the browser's `localStorage`. Nothing is written to disk. The pages are installed on Matis's PC
and the count of opens is read after two weeks. That count is E1's only output.

## User Story

As Matis, 15, with the tutor folder on my PC
I want to open a map of my topics and a three-minute puzzle without starting Claude
So that there is something to open on an evening that takes no set-up and no chat

As Linards
I want a count of the days Matis opened the pages over two weeks
So that E1 answers "does he open it unprompted" before any engine is built

## Problem Statement

Zero sessions have been logged in 23 days (PRD problem statement, observed in `sessions.md`: header, no
rows). Every existing entry point needs the chat (`Start Study.bat` runs `claude`). The only chat-free pages
are `progress.html` (written for Linards) and `practice.html`. There is nothing that is small, daily and
pupil-facing, and there is no measure of opens at all.

## Solution Statement

Add the two pages as plain HTML plus one new script, `assets/case.js`, reusing the folder's own data file,
generators, quiz styling and copy-button convention. Log opens and case results in `localStorage` under a
`tutor:` prefix, show the count on the map, and give a copy button that puts the two-week count on the
clipboard for Linards. Add seven lines to `assets/quiz.js` so a finished practice or lesson quiz also counts
as a session day for the flame. Ship the files from this repo's `e1/` folder through a copy script into
the v1 folder, then into the zip that goes to the PC.

## Out of Scope / Non-Goals

- Not included: boss battles, cold re-tests, XP (T6). The map shows rungs and the flame only.
- Not included: hypercorrection beyond the immediate re-ask, invention-first cases, per-topic
  misconception banks (T7, T3). Cases come from the `wrong` maps that already exist.
- Not included: any write to `sessions.md`, `topics.md` or `assets/progress-data.js`. Those stay Claude's.
- Not changing: `progress.html`, `practice.html`, the lessons, `style.css`, `generate.js`.
- Not changing: `assets/quiz.js` beyond the seven-line finish log (Task 4).
- Not included: anything in `src/`, `app/` or `content/` of this repo. Nothing here carries over as code.
- Not included: a model, a server, a build step, a second browser profile, sync between PCs.

## Feature Metadata

**Feature Type**: New Capability (experiment E1)
**Estimated Complexity**: Low to Medium (small code, but it ships to a machine you do not control)
**Primary Systems Affected**: the v1 folder only (`map.html`, `case.html`, `assets/case.js`,
`assets/quiz.js`, two `.bat` launchers, three docs); this repo gets `e1/` as the source and the test
**Dependencies**: none new. Bun 1.3.4 or Node 20 to run the test (both observed on this Mac).

## Related Work

**Implements**: linardsb/study-tutor#2 (T0) · **Epic**: linardsb/study-tutor#1 ·
`docs/prd/study-tutor-v2.architecture.md` (D1 to D11 inherited; none reopened here)

**Back-references** (plans this builds on or inherits decisions from):

- `docs/prd/study-tutor-v2.prd.md` O1, O5, E1, R1: the page shapes and the one question E1 asks.
- `docs/tickets/study-tutor-v2.md` T0, assumption A1 (E1 gates T2 onward) and A2 (master copy).

**Forward-references** (plans that extend or supersede this):

- T6 (#8) and T7 (#9) take the page shapes, not the code. `e1/README.md` records what Matis actually used.

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

All paths below are under `~/Desktop/Matis_study_tutor/` unless they start with `e1/` or `docs/`.

- `progress.html` (lines 24, 27-28, 33, 35-38, 47, 59-60, 64-67, 72-90, 96-103) - Why: the page the map mirrors. Script
  order (`progress-data.js` then `quiz.js`), the `iso()` date helper, the Monday-of-this-week arithmetic,
  the `RUNGS` list and `rung()`, the `stat()`, `ladder()` and `card()` renderers, the `esc()` escaper.
  Copy these helpers into `case.js` rather than reaching into `progress.html`; they are private to its IIFE.
- `assets/progress-data.js` (lines 1-13, 580-587) - Why: the data shape. `window.PROGRESS` with `built`,
  `weeklyTarget`, `latestSheet`, `topics[]` (`code`, `topic`, `stage`, `latest`, `priority`, `nextRetest`,
  `lessonFile`) and `sessions[]` (`date`, `mode`, `code`, `minutes`, `quiz`, `teachBack`, `canNow`).
  Loads under node and bun (`(typeof window === "undefined" ? globalThis : window).PROGRESS = {`).
  Observed 2026-09-26: `sessions` is `[]`.
- `assets/quiz.js` (lines 1-3, 7-24, 63-67, 71-75, 178-220, 244-283, 331-350) - Why: `norm()` for answer
  comparison, `escapeHtml()`, the `generators()` accessor, `initQuiz()` and its `render()` where the quiz
  finishes (line 207 `finished`), the "choose first" refusal pattern at lines 252-255, and the delegated
  `.copy` click handler with the `[data-prompt]` convention. The finish log (Task 4) goes inside `render()`
  under `if (finished)` at line 216.
- `assets/generate.js` (lines 1-16, 30-58, 697-713) - Why: the generator contract (`stem`, `answers`,
  `working`, `hint`, `wrong`, `type`), the `root` pattern for browser-and-node loading, and the wrapper at
  the end that strips any `wrong` key equal to a right answer. `hint` is by contract "the first step and
  nothing further": that is the fictional pupil's shown working.
- `.claude/tools/test-generators.js` (whole file, 130 lines) - Why: the test style to mirror. Plain node
  script, `lcg(seed)` for reproducible runs, 300 runs per code, failures printed with the seed, exit 1.
  `e1/test-case.js` copies this shape.
- `practice.html` (lines 66-97) - Why: how a page builds a quiz from `window.buildQuiz` and starts it with
  `window.initQuiz`; the `crumb` header pattern and the `lesson practice` main class.
- `assets/style.css` (lines 145-155, 159-177, 216-222) - Why: `.copy` (icon from `::before`, so the button
  needs no text), `ul.prompts`, `.progress .stat`, `.cards`, `.card` with `.r .a .g .o` colours,
  `.ladder i.on`. No new stylesheet: page-specific rules go in a `<style>` block as `progress.html` does.
- `Open progress.bat` (2 lines) - Why: the launcher pattern, `start "" "%~dp0progress.html"`.
- `README-for-Matis.md`, `README-for-Linards.md` (lines 110-121), `SETUP-PC.html` (lines 178-192) - Why:
  the pupil's instructions and the two "copy these on update" lists that must name the new files.
- `.claude/skills/study/SKILL.md` (lines 22-26, 73-75) - Why: what regenerates `progress-data.js` and the
  rung ladder semantics (`not started` → `learning` → `1 pass` → `2 passes` → `secure`).
- `docs/prd/study-tutor-v2.prd.md` (O1, O5, E1, R1, success metrics) - Why: the wording the map and the
  calibration line follow, and the one number E1 reads.
- `.claude/rules/content.md` (this repo) - Why: the pupil-facing text rules. Path-scoped to `content/**`
  but the same rules apply to every string in `case.js` and the two pages.

### New Files to Create

In this repo (the source, committed and reviewed):

- `e1/map.html` - the level map page
- `e1/case.html` - the daily case page
- `e1/assets/case.js` - pure case logic on `root.CASE` plus DOM wiring guarded by `typeof document`
- `e1/assets/quiz.js` - v1 `quiz.js` with the seven-line finish log (a full copy, so install is one copy step)
- `e1/Open map.bat`, `e1/Open case.bat` - launchers
- `e1/test-case.js` - node or bun test, 300 runs per code, plus the pure-function tests
- `e1/install.sh` - copies the above into the v1 folder, refuses if the target lacks `assets/generate.js`
- `e1/README.md` - what E1 is, the install steps, the read protocol, the nudge log, the result

In the v1 folder (edited in place, not in this repo):

- `README-for-Matis.md` - a short section on the map and the case
- `README-for-Linards.md` and `SETUP-PC.html` - the new files added to the "copy these on update" lists

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [MDN: Window.localStorage](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)
  - Section: exceptions and availability
  - Why: on `file://` every page in the folder shares one origin in Chromium and Firefox, so the `tutor:`
    key prefix is the namespace; access can throw in private windows, so every read and write is in
    `try/catch` and the page still works without it.
- [MDN: Date.getDay](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Date/getDay)
  - Why: `(getDay() + 6) % 7` is the Monday offset `progress.html` line 37 already uses. Reuse, do not
    rederive.
- PRD evidence for the case design: McLaren and Adams on erroneous examples; Butler, Fazio and Marsh 2011 on
  hypercorrection (links in the PRD evidence index). Why: the reveal after a wrong answer shows the correct
  worked example, and a confident wrong answer re-asks at once. Those two behaviours are the whole point.

### Patterns to Follow

**Naming and style.** ES5-style plain JS in an IIFE with `'use strict'`, `var`, function expressions, no
arrow functions, no template strings (matches `quiz.js` and `generate.js` exactly, and both files say
"Works from file:// on any OS", so keep that true). Two-space indent, single quotes, a comment block at the
top of each script saying what it is and its invariant. British English, sentence case, no emoji, no
exclamation marks in any string a pupil sees.

**Browser-and-node loading** (`generate.js` line 19, `progress-data.js` line 2):

```js
var root = typeof window === 'undefined' ? globalThis : window;
root.CASE = { buildCase: buildCase, pool: pool, third: third, ... };
if (typeof document !== 'undefined') { /* DOM wiring only here */ }
```

**Date helpers** (`progress.html` lines 35-38): copy `iso()` and the Monday arithmetic verbatim.

**Refuse before check** (`quiz.js` lines 247-255): an empty answer or no confidence shows a short line in
the feedback element and returns. The case page does the same for "pick an option" and "pick a bet".

**Copy button** (`quiz.js` lines 331-350, `style.css` 145-148): a `<button class="copy">` inside an
element with `data-prompt`; the delegated handler in `quiz.js` copies it. The map loads `quiz.js` just to
get this handler, as `progress.html` does.

**Escaping** (`progress.html` line 39, `quiz.js` lines 63-67): every string that reaches `innerHTML` goes
through the escaper. Generator stems contain `×`, `£`, `²`, `π`; escaping keeps them and blocks markup.

**Test style** (`.claude/tools/test-generators.js`): no framework, `lcg(seed)`, a `failures[]` list, a
per-code summary, `process.exit(1)` on any failure, `SHOW` env var to cap output.

**Anti-patterns to avoid:** writing anything outside `localStorage`; a `fetch()` of `topics.md` (it fails on
`file://` in Chromium); reading `progress.html`'s private helpers; a daily streak (PRD non-goal: weekly
flame only); any grade prediction on the map; a leaderboard; "Dan" as the fictional pupil's name (reserved
for O2's AI student in T12).

---

## IMPLEMENTATION PLAN

Phases run top to bottom. Phase 1 and Phase 2 are independent files but Phase 3 needs both.

### Phase 1: Case logic and its test (pure, no DOM)

`e1/assets/case.js` with the pure functions on `root.CASE`, and `e1/test-case.js` proving them over 300
seeds per code. This is the part that can be wrong in ways a person will not notice.

### Phase 2: Pages and launchers

`e1/case.html`, `e1/map.html`, the two `.bat` files, and the DOM wiring section of `case.js`. The
`quiz.js` finish log.

### Phase 3: Install, docs, the E1 read

**Depends on:** Phases 1 and 2.

`e1/install.sh`, the three doc edits in the v1 folder, `e1/README.md` with the read protocol, the zip, the
PC install, and the first observed open.

### Phase 4: Validation

Run the test, run the v1 generator test to prove `generate.js` is untouched, open both pages from `file://`
in Chrome on this Mac and in Edge on the PC, walk the manual steps.

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.
`$V1` below means `~/Desktop/Matis_study_tutor`.

### CREATE e1/assets/case.js (pure part)

- **IMPLEMENT**: an IIFE that defines and exports on `root.CASE`:
  - `hash(str)`: FNV-1a 32-bit over the string, returns an unsigned int. Used to seed a day.
  - `lcg(seed)`: the generator from `test-generators.js` lines 44-50, copied.
  - `iso(date)`: from `progress.html` line 35.
  - `mondayOf(date)`: from `progress.html` lines 37-38, returns the ISO string.
  - `third(msg)`: turns a second-person `wrong` message into third person for the fictional pupil, who is
    called Jo. Exactly these replacements, in order: `/\bYou\b/g` → `Jo`, `/\byou\b/g` → `Jo`,
    `/\bYour\b/g` → `Jo's`, `/\byour\b/g` → `Jo's`. Observed 2026-09-26 across all 21 generators at seed 1:
    every message either starts "You ..." or "That is ..."; no other pronoun appears.
  - `pool(progress, gen)`: the codes eligible for a case, in priority order. A topic is eligible when it
    has a numeric `priority`, a `lessonFile`, and `typeof gen[code] === 'function'`. Observed 2026-09-26:
    that gives 21 codes (the 21 lessons). U980 stays in the pool; its `wrong` map is empty on 78 of 300
    seeds (observed, the run in the notes) and the re-roll below handles that.
  - `buildCase(gen, code, seed)`: calls `gen[code](lcg(seed))` up to 8 times, advancing the seed by 7919
    each time, until the spec has at least one `wrong` key. Returns `null` after 8 empty rolls. Then with
    the same rng: `isRight = rng() < 0.25` (expected rate, not evidenced; see D4); if right, `shown` is
    `spec.answers[0]` and the correct option is the "nowhere" one; otherwise `shown` is a `wrong` key
    picked with `rng` and the correct option is that key's message. Options are every `wrong` message
    through `third()`, plus the fixed string `Nowhere. The answer is right.`, shuffled with `rng`
    (Fisher-Yates as in `quiz.js` lines 131-135). Returns
    `{ code, stem, firstStep: spec.hint, shown, options[], correct (index), working: spec.working,
    answer: spec.answers[0], isRight, unit: spec.type || 'number' }`.
  - `todaysCase(progress, gen, dateIso, seedCode)`: picks the code. If `seedCode` is in the pool, use it
    (hypercorrection seed from yesterday). Otherwise `pool[hash(dateIso) % pool.length]`. Seed for numbers
    is `hash(dateIso + ':' + code)`. If `buildCase` returns `null`, try the next code in the pool (wrap
    round), so a day never has no case.
  - `calibration(entries)`: given the last 7 case entries (`{ bet, right }`), returns
    `{ bet: sum of bets, won: sum of bets on right entries, n }`. The line is
    `Over your last N cases you bet B and won W.` (PRD O5: "you predicted 7, you scored 4"; this is the
    same idea with the folder's own words).
  - `flame(sessions, log, weekStart, todayIso)`: the number of distinct dates in `[weekStart, todayIso]`
    that have either a `sessions[]` row or a log entry with mode `case` or `quiz`. Opens do not count.
  - `opens(log, todayIso, days)`: distinct dates with any log entry in the last `days` days (today
    included), returned as `{ count, dates[] }`.
- **PATTERN**: `generate.js` lines 15-28 (IIFE, `root`, helpers), `test-generators.js` lines 44-50.
- **IMPORTS**: none. `gen` and `progress` are passed in, never read from globals inside the pure functions,
  so the test can inject them.
- **GOTCHA**: `spec.wrong` keys are typed answers, so the shown wrong answer must be displayed as the key
  string, not normalised (`64pi` shows as `64π`: replace `pi` with `π` for display only, matching how the
  stem writes it). Never put `spec.answers` or `spec.working` into the DOM before the check (same
  invariant as `quiz.js` line 2). U377 and U980 are `type: text`; their `shown` value is a string like
  `y=3x+1`, display as is.
- **VALIDATE**: `bun e1/test-case.js` (Task 2) once it exists; until then
  `bun -e 'require("./e1/assets/case.js"); console.log(Object.keys(globalThis.CASE))'` lists the names.
- **SATISFIES**: AC #2 (a case opens without the chat), AC #3 (records only sessions.md columns: the
  functions read and produce only date, mode, code, bet, right).

### CREATE e1/test-case.js

- **IMPLEMENT**: a plain node/bun script. `V1` is `process.env.V1 || path.join(os.homedir(), 'Desktop',
  'Matis_study_tutor')`. It requires `$V1/assets/generate.js`, `$V1/assets/progress-data.js` and
  `./assets/case.js`, then checks:
  1. `pool()` returns every code that has a lesson file and a generator, in ascending priority, and
     nothing else. Observed expectation on the 2026-09-26 data: 21 codes, first `U349`, last `U545`.
  2. For every pool code and 300 seeds (`0x5eed + i * 7919`, as `test-generators.js`): `buildCase` is not
     `null`; `options.length` is between 2 and 5; `options[correct]` is the "nowhere" string exactly
     when `isRight`; when not `isRight`, `shown` is not in `spec.answers` after `norm()` (copy `norm`
     from `test-generators.js` lines 23-41); no option contains `you` or `your` as a whole word in any
     case (regex `/\b(you|your)\b/i`); `working` ends on `answer` (reuse the `tail()` check).
  3. `todaysCase` for 400 consecutive dates from 2026-09-28 never returns `null` and returns the same case
     twice for the same date (determinism).
  4. `todaysCase` with `seedCode = 'U349'` returns a `U349` case whatever the date.
  5. `calibration` on a fixture of 7 entries gives the hand-computed sums (write the fixture, state the
     arithmetic in the assertion message).
  6. `flame` counts a day once even with a session row, a case and a quiz on it; ignores `open` entries;
     ignores dates before `weekStart`.
  7. `opens` over a fixture of 14 days with entries on 5 dates returns 5.
  8. `third('You added 25 on.')` is `Jo added 25 on.`; `third('That is 10% of 120.')` is unchanged.
  Summary and exit code as `test-generators.js` lines 118-131.
- **PATTERN**: `.claude/tools/test-generators.js` in the v1 folder, whole file.
- **IMPORTS**: `path`, `os`, `fs` only.
- **GOTCHA**: `progress-data.js` sets `globalThis.PROGRESS` when required under node; read it after the
  `require`, do not import it. The test must not write anything under `$V1`. Write this file with the
  Write tool: the pre-tool hook blocks any Bash command whose text contains `process.env` (hook line 54),
  so `process.env.V1` must never appear inline in a `bun -e` or heredoc command.
- **VALIDATE**: `bun e1/test-case.js` prints `all ... runs pass` and exits 0. Also
  `node e1/test-case.js` (node 20 observed) to prove no Bun-only API crept in.
  Mutation check: set `isRight = true` unconditionally in `buildCase`; check 2 goes red ("shown is a right
  answer while isRight is false" never fires, but "options[correct] is the nowhere string exactly when
  isRight" still passes; the assertion that must go red is "at least one of 300 runs per code has
  `isRight === false`", so add that assertion). Record both results. Restore.
- **SATISFIES**: AC #2, AC #3, AC #5 (gate green).

### CREATE e1/case.html and the DOM part of e1/assets/case.js

- **IMPLEMENT** (`case.html`): `<main class="lesson practice">`, crumb `<a href="map.html">Map</a> · case
  · Maths`, `<h1>Today's case</h1>`, an `<p class="aim">` reading `Jo has answered a question. Find the
  mistake, or say there is none. Three minutes.`, an empty `<section id="case">`, a footer line
  `Nothing here is a prediction. A case a day; the map counts the week.`. Scripts in this order:
  `assets/progress-data.js`, `assets/generate.js`, `assets/quiz.js`, `assets/case.js`.
- **IMPLEMENT** (`case.js` DOM section, runs only when `document` exists and `#case` is on the page):
  1. Read the log: `tutor:log` in `localStorage` is a JSON array of `{ d, mode, code, quiz }` where `mode`
     is `open-map`, `open-case`, `case` or `quiz` and `quiz` is a short string (`right, bet 3` /
     `wrong, bet 1` / `4/5` for quizzes). Read `tutor:seed` (a code, or absent). All reads in `try/catch`;
     on failure `log = []` and a line `This browser is not saving your cases. Ask Dad.` shows under the
     heading (`.note` class from `practice.html`).
  2. Append `{ d: today, mode: 'open-case' }` once per page load.
  3. If the log has a `case` entry for today and no pending re-ask, render the done state: the stem, what
     was shown, the correct option, the working, the calibration line, a lesson link when
     `PROGRESS.topics` has a `lessonFile` for the code, and `Back tomorrow. Map` as a link.
  4. Otherwise build today's case with `todaysCase(PROGRESS, GEN, today, seed)` and render:
     `<div class="q">` with `<p class="stem">` the stem, `<p>` `Jo's first step: ` + `firstStep`,
     `<p>` `Jo's answer: <b>shown</b>`, `<p>` `Where did Jo go wrong?`, a radio list of options
     (`name="pick"`), a bet row `How sure are you? 1 (a guess) · 2 · 3 (would bet on it)` as three radios
     `name="bet"`, a `<button class="check">Check</button>`, a hidden `<p class="feedback">`, a hidden
     `<div class="working">`.
  5. Check: no option → feedback `Pick one first.`; no bet → `How sure? 1, 2 or 3 first`. Then mark:
     `right = picked === correct`. Feedback: right → `Right. You bet N.`; wrong → `Not this time. You bet
     N.` followed by the correct option text. Show the working (`Working: ` + `working`, with `pi` shown
     as `π`). Add classes `done right|wrong` on the `.q` as `quiz.js` line 272 does. Disable inputs.
     Append `{ d, mode: 'case', code, quiz: (right ? 'right' : 'wrong') + ', bet ' + bet }` to the log and
     save. Clear `tutor:seed` if it was used today.
  6. Calibration line under the feedback: `calibration()` over the last 7 `case` entries including this
     one: `Over your last N cases you bet B and won W.` When `N === 1`: `First case. You bet B and won W.`
  7. Hypercorrection: if `bet === 3 && !right`, set `tutor:seed = code` and render a second `.q` under
     the first with the heading `Same idea, new numbers.` built by `buildCase(GEN, code, hash(today +
     ':again'))`; its result logs as another `case` entry (same date; `flame` counts the day once).
     No bet on the re-ask beyond the same three radios; the point is the immediate retry.
- **PATTERN**: `practice.html` lines 66-97 for a page's IIFE and `#set` holder; `quiz.js` lines 244-283
  for the check flow; `progress.html` line 39 for `esc`.
- **IMPORTS**: none; globals `PROGRESS`, `GEN`, `CASE`.
- **GOTCHA**: `initQuiz` must not run on the case `.q` (it would inject Sure/Not sure and look for an
  `<input type=text>`): do not give the container the class `quiz`. `quiz.js` `start()` only touches
  `.quiz` elements (line 318), so a `div.q` outside `.quiz` is untouched. The `working` and `answer`
  strings go into the DOM only inside the check handler.
- **VALIDATE**: after `bash e1/install.sh` (Task 7), `open "$V1/case.html"` in Chrome: a case renders;
  Check with nothing picked refuses; a wrong pick with bet 3 shows a second case; reload shows the done
  state, not a new case. In DevTools: `JSON.parse(localStorage['tutor:log'])` has the `open-case` and
  `case` entries and nothing else.
- **SATISFIES**: AC #2, AC #3.

### UPDATE e1/assets/quiz.js (copy of $V1/assets/quiz.js plus the finish log)

- **IMPLEMENT**: `cp "$V1/assets/quiz.js" e1/assets/quiz.js`, then inside `render()` after
  `if (finished) {` (line 216) add:

  ```js
        /* E1: a finished set counts as a session day on the map; nothing else is stored */
        try {
          var log = JSON.parse(localStorage.getItem('tutor:log') || '[]');
          var d = new Date(), day = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
          log.push({ d: day, mode: 'quiz', code: quiz.dataset.code || 'quiz', quiz: right + '/' + items.length });
          localStorage.setItem('tutor:log', JSON.stringify(log));
        } catch (err) { /* private window or storage off: the quiz still works */ }
  ```

  `quiz`, `right` and `items` are already in scope at that point (lines 178, 193, 180). `quiz.dataset.code`
  is the topic code for a lesson quiz and `mixed` for a practice set (line 141), which is what a
  `sessions.md` row would hold; the `label` (`mixed set`) is display text and is not logged.
- **PATTERN**: `quiz.js` lines 339-347 for the try-then-fallback shape.
- **GOTCHA**: this is the only change to `quiz.js`. Diff must show those lines and nothing else:
  `diff "$V1/assets/quiz.js" e1/assets/quiz.js` before install has one hunk. The lessons load `quiz.js`
  from `../assets/`, so the same file serves lessons, practice, progress, map and case.
- **VALIDATE**: `diff "$V1/assets/quiz.js" e1/assets/quiz.js | grep -c '^>'` prints `7` (the hunk above:
  7 added lines, derived by counting them). After install, a practice `Mixed 6` completed in Chrome adds
  one `quiz` entry.
- **SATISFIES**: AC #1 (flame counts real work done without the chat), AC #3 (entry holds date, mode, code,
  quiz score: `sessions.md` columns).

### CREATE e1/map.html

- **IMPLEMENT**: `<main class="progress">` (reuses the stats and cards styling). Header crumb
  `Map · Matis · GCSE Foundation maths`, `<h1>Your map</h1>`. Scripts: `assets/progress-data.js`,
  `assets/quiz.js`, `assets/case.js`. Inline IIFE:
  1. Log `{ d: today, mode: 'open-map' }` (try/catch). Self-check in the same block: write `tutor:probe`
     with the current time, read it back; if the read fails or does not match, show
     `This browser is not saving your opens. Ask Dad.` in the `.due` box (red, `progress.html` lines 8-9
     style). This is what the PC visit looks at (Task 11).
  2. Stats row (`stat()` copied from `progress.html` line 64): `flame` as `N of your M this week`
     (`M = PROGRESS.weeklyTarget || 3`); `cases` as `N cases solved`; `opens` as `N of the last 14 days`
     with the label `days you opened this`; and a `<span data-prompt="...">` with a `.copy` button whose
     prompt is the E1 line: `E1 <today>: opened on N of 14 days (<dates>), cases C, sets Q` (the
     "Copy for Dad" line).
  3. `Today's case` box: a link to `case.html`, with `done` or `not yet` from the log.
  4. Levels: `PROGRESS.topics` with a numeric `priority`, sorted ascending, each as a `.card` with the
     level number (`Level 1`), the topic name, the code, the ladder (copy `ladder()` from `progress.html`
     lines 72-76), and `lesson` / `no lesson yet` (`.o` grey card when no `lessonFile`). Colour class from
     the latest RAG as `progress.html` line 88. Topics with no priority (the greens) in a second group
     `Already green at school`, cards only, no levels.
  5. Footer: the ladder sentence from `progress.html` line 24, and `Nothing on this page is a prediction.`
     A `practice.html` link in a `ul.prompts` list, as `progress.html` lines 96-103.
- **PATTERN**: `progress.html` throughout; keep the same helpers and the same class names.
- **GOTCHA**: `PROGRESS.sessions` is `[]` today (observed) so the flame comes from the log until Claude
  logs a session. No daily streak anywhere on the page. No "predicted" or grade words.
- **VALIDATE**: `open "$V1/map.html"` shows 27 levels (observed: 27 rows with `pN` in `topics.md`,
  derived from the `p1` to `p27` notes) and 17 green cards (observed: 44 rows minus 27). After a case is
  done, the flame reads `1 of your 3 this week` and the copy button puts the E1 line on the clipboard.
- **SATISFIES**: AC #1 (map opens without the chat), AC #4 (two-week count exists and is copyable).

### CREATE e1/Open map.bat and e1/Open case.bat

- **IMPLEMENT**: two lines each, mirror `$V1/Open progress.bat`: `@echo off` then
  `start "" "%~dp0map.html"` (and `case.html`). CRLF line endings (`unix2dos` or write with `\r\n`) to
  match the existing `.bat` files. Check: `file "$V1/Open progress.bat"` says CRLF; match it.
- **VALIDATE**: `file "e1/Open map.bat"` reports CRLF line terminators.
- **SATISFIES**: AC #1, AC #2 (one double-click each, no chat).

### CREATE e1/install.sh

- **IMPLEMENT**: `set -euo pipefail`; `V1="${1:-$HOME/Desktop/Matis_study_tutor}"`; refuse unless
  `$V1/assets/generate.js` and `$V1/assets/progress-data.js` exist; `cp` `map.html`, `case.html`,
  `assets/case.js`, `assets/quiz.js`, `Open map.bat`, `Open case.bat`, `test-case.js` (to
  `$V1/.claude/tools/test-case.js`) into place; then run `bun "$V1/.claude/tools/test-case.js"` with
  `V1="$V1"` and `node "$V1/.claude/tools/test-generators.js"`; print the list of files copied. Never
  touches `sessions.md`, `topics.md`, `progress-data.js`, `MISSION.md`, `learning-records/`.
- **GOTCHA**: `cp` only, no `rm` of any kind (the hook blocks `rm -rf`; there is nothing to delete
  anyway). `test-case.js` resolves `case.js` relative to itself, so when it lives at
  `$V1/.claude/tools/` the require path is `../../assets/case.js`; when it runs from `e1/` it is
  `./assets/case.js`. Resolve through `V1` for the generator and progress data, and try both relative
  paths for `case.js` (first that exists).
- **VALIDATE**: `bash e1/install.sh` exits 0 and prints both test summaries green.
  `git -C ~/Desktop/Matis_study_tutor status` is not applicable (no repo there, observed); check with
  `ls -la "$V1" | grep -E 'map|case'`.
- **SATISFIES**: AC #5 (installed on the PC starts from this).

### UPDATE $V1/README-for-Matis.md

- **IMPLEMENT**: after the numbered list, a new section `## Without Claude` with three lines: double-click
  `Open map.bat` for the map; `Open case.bat` for today's case, three minutes; `practice.html` for fresh
  questions. One sentence: the map counts the days you open it, and Dad reads that count, nothing else.
- **PATTERN**: the file's own register (short, "Dad", imperative).
- **GOTCHA**: `no-ai-slop` then `humanizer` on the new lines before saving (CLAUDE.md prose gate).
- **VALIDATE**: `grep -c "Open map.bat" "$V1/README-for-Matis.md"` prints `1`.
- **SATISFIES**: AC #5.

### UPDATE $V1/README-for-Linards.md and $V1/SETUP-PC.html (update lists only)

- **IMPLEMENT**: in the "copy these on update" lists (README lines 114-119, SETUP-PC lines 182-187) add
  `assets\case.js` to the assets line, `map.html`, `case.html` to the pages line, and change "the three
  `.bat` files" to "the five `.bat` files" (SETUP-PC) and add `Open map.bat`, `Open case.bat` (README).
  In README under "Reading progress" (line 71) add one sentence: `map.html` shows the days he opened the
  pages in the last two weeks; the copy button next to it puts the count on the clipboard.
- **GOTCHA**: surgical. Nothing else in either file changes.
- **VALIDATE**: `grep -n "case.js\|map.html" "$V1/README-for-Linards.md" "$V1/SETUP-PC.html"` shows the
  lines; `git diff` is not available there, so keep a `diff` against a copy taken first
  (`cp README-for-Linards.md /tmp/...` is not allowed; use the scratchpad directory).
- **SATISFIES**: AC #5, and D10's "an update never touches records" carried into the v1 folder's own rules.

### CREATE e1/README.md

- **IMPLEMENT**: what E1 asks (one line from the PRD), the files, `bash e1/install.sh`, the zip step
  (`cd ~/Desktop && zip -r Matis-<date>.zip Matis_study_tutor -x '*/learning-records/*'` is wrong: the PC
  copy is the master once he has records, so ship only the files the update list names; write that
  list), the PC step (copy the listed files over the PC folder, double-click `Open map.bat`, confirm
  the flame stat renders and DevTools shows `tutor:log`), the read protocol (day 14: open `map.html` on
  the PC, click the copy button, paste the line into issue #2 as a comment), a nudge log table
  (`date · who nudged · what was said`, so "unprompted" has a record), and an empty `## Result` section.
  Dates: install date to be filled in as absolute, read date = install + 14 days.
- **VALIDATE**: the file names every step a person on the PC can perform with the shipped files.
- **SATISFIES**: AC #4 (the E1 read exists and is written down).

### INSTALL on Matis's PC

- **IMPLEMENT**: follow `e1/README.md`. On the PC, in Edge (the browser `start` opens): open `map.html`
  and `case.html`, do one case, reload, check the done state, then `F12` → Application → Local Storage
  → `file://` shows `tutor:log`. Fill in the install date in `e1/README.md` and comment on issue #2.
- **GOTCHA**: this Mac cannot perform it; it needs the PC. The property is "localStorage persists on
  `file://` in the PC's default browser between opens". The engine leg is already closed: Chrome 153
  headless on this Mac, persistent profile, run 2 read run 1's value (observed 2026-09-27, D5). Edge is the
  same engine. What the PC visit adds is the profile leg (a managed policy could block storage), and the
  map's self-check answers it on sight: no red note means writes read back.
- **VALIDATE**: open `map.html` twice on the PC with Edge closed in between; the second open shows no red
  note and `1 of the last 14 days`.
- **SATISFIES**: AC #5.

---

## TESTING STRATEGY

### Unit Tests

`e1/test-case.js`, no framework, mirrors `test-generators.js`. Fixtures are literal arrays in the file.
Every pure function on `root.CASE` has at least one assertion. 300 seeds per code for `buildCase`
(`observed` cost: the 21-generator test of the same shape runs in under a second on this Mac).

### Integration Tests

None automated. The integration is `file://` plus `localStorage` in a real browser, covered by Level 4.
The install script runs both test files against the installed copy, which proves the copied files and the
generators agree.

### Edge Cases

Each names where it is verified.

- Generator returns an empty `wrong` map (U283 on 98 of 300 seeds, U980 on 78, observed): re-roll, then
  next code. `test-case.js` check 2 and 3.
- Same day reload: identical case; done state after a check. Level 4 step 3.
- Midnight while the page is open: the next reload is a new case; no timer. Level 4 step 6 (change the PC
  clock is not needed: `todaysCase` with two dates in check 3 covers determinism per date).
- `localStorage` throws or is read-only (private window): page renders, note shown, flame from
  `PROGRESS.sessions` only. Level 4 step 7 (Chrome incognito on this Mac).
- Old `tutor:log` JSON corrupted by hand: `JSON.parse` throws → treated as empty, and the next save
  overwrites. Level 4 step 8.
- Bet 3 and wrong: second case appears, `tutor:seed` set, tomorrow's case is that code. `test-case.js`
  check 4 for the seed path; Level 4 step 4 for the UI.
- Week boundary: Monday arithmetic copied from `progress.html`; `flame` fixture in check 6 has a Sunday
  entry before a Monday `weekStart`.
- Message with no second-person pronoun ("That is 10% of 120.") passes `third()` unchanged. Check 8.
- `type: text` generators (U377, U980): `shown` displays as text, no `π` substitution harm. Check 2 runs
  them; Level 4 step 5 forces U377 by setting `tutor:seed` to `U377` in DevTools.
- `PROGRESS` missing (someone opens `map.html` from a folder without the data file): the map shows
  `No data yet.` as `progress.html` line 33 does. Level 4 step 9.

---

## VALIDATION COMMANDS

Execute every command to ensure zero regressions and full feature correctness.

### Level 1: Syntax & Style

There is no linter in the v1 folder and none in this repo yet (T1 adds Biome). Syntax check only:

```bash
node --check e1/assets/case.js && node --check e1/assets/quiz.js && node --check e1/test-case.js
```

### Level 2: Unit Tests

```bash
bun e1/test-case.js
node e1/test-case.js
node ~/Desktop/Matis_study_tutor/.claude/tools/test-generators.js   # generate.js untouched: all 6300 runs pass (21 × 300, derived)
```

### Level 3: Integration Tests

```bash
bash e1/install.sh            # copies, then runs both tests against the installed copy
diff ~/Desktop/Matis_study_tutor/assets/quiz.js e1/assets/quiz.js && echo same
```

### Level 4: Manual Validation

All performable with the shipped files and the 2026-09-26 data. `$V1` is the v1 folder on this Mac; the
same steps repeat on the PC in Edge.

1. `open "$V1/map.html"` in Chrome. 27 level cards, 17 green cards, flame `0 of your 3 this week`,
   `0 of the last 14 days` becomes `1 of the last 14 days` on reload (today's open counts).
2. Click `Today's case`. A case renders with Jo's first step, Jo's answer, 2 to 5 options, three bet
   radios. Click Check with nothing picked: `Pick one first.` Pick an option, no bet: the bet refusal.
3. Pick the wrong option deliberately with bet 1, Check: feedback names the correct option, the working
   shows, the calibration line reads `First case. You bet 1 and won 0.` Reload: the done state, same
   stem, no new case.
4. In DevTools console: `localStorage.removeItem('tutor:log')`, reload, pick a wrong option with bet 3:
   a second case with the heading `Same idea, new numbers.` appears; `localStorage['tutor:seed']` is the
   code. Open `map.html`: flame `1 of your 3 this week`, `1 cases solved` or `2` (both entries count as
   cases; the day counts once for the flame).
5. `localStorage.setItem('tutor:seed', 'U377')`, remove today's `case` entries from `tutor:log`, reload
   `case.html`: a U377 case (`y = ...` equation shown as text).
6. Determinism: reload `case.html` three times before checking; same numbers each time.
7. Storage off: in Chrome, `chrome://settings/content/siteData`, choose "Don't allow sites to save data on
   your device", then `open "$V1/case.html"`: `localStorage` access throws, the note `This browser is not
   saving your cases. Ask Dad.` shows, and the case still renders and checks. `map.html` shows its red note.
   Switch the setting back. (Incognito is not the oracle: it allows storage and wipes it on close.)
8. `localStorage.setItem('tutor:log', '{bad')`, reload `map.html`: page renders, counts read 0, no
   console error other than the caught parse.
9. Copy `map.html` and `assets/case.js` to an empty scratchpad folder, open the copy: `No data yet.`
10. `Mixed 6` on `practice.html`, complete all six: `tutor:log` gains one `quiz` entry with `n/6`;
    `map.html` flame counts today.
11. Click the copy button by the opens stat, paste into a text editor: one line starting `E1 <date>:`.

### Level 5: Additional Validation (Optional)

The `agent-browser` skill can drive steps 1 to 3 on `file://` in a headless Chromium on this Mac for a
screenshot in the PR body.

---

## ACCEPTANCE CRITERIA

- [ ] AC #1: `map.html` opens from a double-click with no chat and shows a rung per topic from
  `progress-data.js` and the weekly flame `N of your 3 this week`.
- [ ] AC #2: `case.html` opens from a double-click with no chat and gives one case a day with a 1 to 3 bet
  and a calibration line; a bet-3 wrong answer re-asks at once.
- [ ] AC #3: the only thing either page stores is `tutor:log` entries of `{ d, mode, code, quiz }` and
  `tutor:seed`; every field is a `sessions.md` column (date, mode, code, quiz); nothing is written to disk
  (verified by Level 4 step 4 and by `ls -la --time-style=full-iso "$V1"` showing no file touched).
- [ ] AC #4: the map shows `N of the last 14 days` and a copy button yields the E1 line; `e1/README.md`
  says when and how it is read.
- [ ] AC #5: installed on Matis's PC; `map.html` opened twice with Edge closed in between shows no red
  note and `1 of the last 14 days`. The engine property is already observed on this Mac (D5); the PC visit
  is a person's trip recorded on issue #2 as a comment with the install date. It is this ticket's last
  task, not a new issue.
- [ ] `bun e1/test-case.js`, `node e1/test-case.js` and the v1 generator test all pass.
- [ ] No file in the v1 folder other than the ten named (seven new, `quiz.js`, two READMEs, `SETUP-PC.html`)
  differs from before; `progress.html`, `practice.html`, `generate.js`, `style.css` unchanged.
- [ ] Every pupil-facing string passed `no-ai-slop` then `humanizer` (mental pass, CLAUDE.md prose gate):
  15-year-old register, British English, no exclamation marks, no emoji, no grade words.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] Level 1 to 4 commands and steps executed, results recorded with `observed`
- [ ] `bash e1/install.sh` green against the v1 folder on this Mac
- [ ] Manual steps 1 to 11 done in Chrome on this Mac
- [ ] PC install done or explicitly left open in the report with the date it is planned
- [ ] `e1/README.md` has the install date and the read date as absolute dates
- [ ] Issue #2 has the install comment

---

## DECISIONS (were open questions; each is now decided, with the evidence or the reason)

- **D1. The source lives in `e1/` in this repo; `install.sh` copies it to the v1 folder.** The v1 folder has
  no git (observed: no `.git` in `~/Desktop/Matis_study_tutor`), so this is the only way the code gets a
  history and a review. The ticket's "not this repo" is honoured in the sense that matters: nothing lands in
  `src/`, `app/` or `content/`, and nothing here is imported by T2 onward.
- **D2. The fictional pupil is "Jo".** "Dan" is reserved for O2. The `third()` conversion was run over every
  `wrong` message the 21 generators produce across 300 seeds each: 10,767 messages, 248 distinct after
  conversion, 0 with a residual `you`/`your`/`yourself` (observed 2026-09-27, spike in the notes). Every
  message starts with either `You <verb>`, `That is`, or a plain noun phrase.
- **D3. A solved case and a finished practice or lesson set count as a session day for the flame.**
  `sessions.md` is empty and only Claude writes it (observed), so a flame from it alone would read `0 of 3`
  for the whole of E1 and the map would look dead on day one. `flame()` counts `case` and `quiz` entries and
  `PROGRESS.sessions` rows, a day once. Reverting is one line in `flame()` plus the `quiz.js` hunk.
- **D4. One case in four has no mistake.** `expected`, chosen so "find the mistake" cannot be answered
  without working the question. A one-number change in `buildCase`. The test does not pin the rate, only
  that both kinds occur.
- **D5. Storage is `localStorage` on `file://`, and it works.** Spike, observed 2026-09-27, Google Chrome
  153.0.8010.53 headless with a persistent `--user-data-dir`: run 1 `read=null write=ok`, run 2
  `read=written-1790492083407 write=ok`. So a value written by one page load is read by the next from a
  `file://` URL. Edge on the PC is the same Blink engine; the only way it differs is a managed policy
  blocking storage, which a home PC does not carry. The map's self-check (Task 5, step 1) shows a red note
  if a write does not read back, so the PC visit is a glance, not a DevTools session.
- **D6. "Unprompted" is a hand-kept record.** The pages cannot know whether a nudge happened. `e1/README.md`
  carries a nudge log (`date · who · what was said`). Worst case for the read is that every open followed a
  nudge; the log makes that visible, and the PRD's line is "at most one nudge" anyway.
- **D7. The case is "first step + answer", not a full wrong working.** The content has 21 correct workings
  and 39 `wrong` maps but no wrong workings (observed, `grep -c "wrong:" generate.js`); see the notes.
- **D8. This ticket's gate is the two test scripts, not `bun run check`.** `bun run check` does not exist
  until T1 lands (no `package.json` in the repo, observed), and the stop hook only runs its gate for
  `apps/`, `services/`, `packages/`, `db/` paths (`.claude/hooks/stop_check.py` line 30), so `e1/` never
  triggers it. Done means `bun e1/test-case.js`, `node e1/test-case.js` and the v1 generator test all green,
  named in the PR body with `observed`.

**Assumptions that remain, none of which changes a task:**

- `progress-data.js` is not regenerated during E1 (no Claude sessions), so the map's rungs are the
  2026-09-26 snapshot. E1 reads opens, not rungs.
- The size lands near 600 lines (`expected`: case.js ~220, test ~130, map.html ~120, case.html ~40,
  install.sh ~30, README ~50, quiz.js +7, bats 4, docs ~10), above the ticket's 300 to 500. The test is the
  excess.
- The PC visit (Task 11) is a person's trip, not code. Everything code-side that it checks is already
  observed on the same engine (D5).

## RISKS CLOSED

| Risk | How it was closed | Evidence |
|---|---|---|
| The hooks block a write to the v1 folder | Read `.claude/hooks/pre_tool_use.py`: it fences `.env`, `rm -rf`, `app/` and `backend/` relative paths, PR flips, CodeQL suppressions and the hook files. Nothing matches `~/Desktop/Matis_study_tutor` or `e1/`. | observed, lines 45-115 of the hook |
| A Bash command in the implementation gets blocked | Two patterns can bite: `process.env` in a Bash command's text (`ENV_DUMP`, hook line 54) and `rm -rf` anywhere. So `process.env.V1` lives only inside `test-case.js` written with the Write tool, never inline in a `bun -e` call, and `install.sh` uses `cp` only. | observed, hook lines 51-56 and 118-127 |
| `third()` leaves a second-person word | Run over every message, every seed | observed, 0 of 10,767 |
| A generator yields no `wrong` map and the day has no case | Re-roll up to 8 times then next code | observed rates: U283 98/300, U980 78/300, U377 25/300, U950 16/300, U753 2/300; derived: 8 empty rolls on U283 is (98/300)^8 ≈ 0.00013 per day, and the next-code fallback covers even that |
| `localStorage` unavailable or not persistent on `file://` | Spike on Chrome 153 with a persistent profile | observed, D5 |
| `require` of the v1 data files fails under bun or node | `generate.js` loaded under `bun -e` for the spikes; `progress-data.js` is documented to load under node (study skill line 75) and uses the same `globalThis` pattern | observed for `generate.js`, same pattern for the other |
| The map counts wrong | 27 priority rows and 17 green rows counted in `topics.md` | observed, `grep -cE '\| p[0-9]+ '` = 27, 44 rows total |
| The `.bat` launchers have the wrong line endings | Existing launcher checked | observed, `file` reports CRLF |
| The finish log records the wrong code for a mixed set | Log `quiz.dataset.code` (`mixed` or the code), not the label | Task 4 hunk |
| PC step cannot be performed here | Engine leg closed by D5; profile leg is a glance at the map's self-check | Task 5 and Task 11 |

## NOTES (open canvas)

**Why the case is "first step + answer", not a full wrong working.** O5 asks for a planted mistake in a
worked solution. The content has 21 correct `working` strings and 39 `wrong` maps (observed:
`grep -c "wrong:" generate.js`), but no wrong workings. Faking one by swapping the last `= answer` for a
wrong key leaves the earlier steps contradicting the last line, which makes the puzzle trivial. Showing the
generator's `hint` (by contract "the first step and nothing further") as Jo's first step and a `wrong` key
as Jo's answer gives a real erroneous example: the pupil has to work the question to know which
misconception produced that number. The reveal after the check is the correct `working`, which is the
pairing the McLaren and Adams evidence is about. T7 gets real misconception-scripted workings from T3's
item schema; this is the two-week stand-in.

**Observed run, 2026-09-26, 300 seeds per code (`0x5eed + i * 7919`)**: zero-wrong runs U283 98, U980 78,
U377 25, U950 16, U753 2, every other code 0. Minimum keys when present: 1 for U116, U176, U296, U332,
U527, U545, U617, U687, U910; 2 or 3 for the rest. So the "nowhere" option plus one message is the
smallest case (2 options) and it happens; the bet still makes it a calibration item.

**Rejected: a single page.** One page with the map on top and the case below would save a file, but the
E1 read wants to know which of the two he opens, so they log separately (`open-map`, `open-case`).

**Rejected: writing a `sessions.md` line via the clipboard.** The pages could copy a ready-made row for
Claude, as `quiz.js` copies a score line. E1 is about opens without the chat, so nothing here asks for the
chat. The log is enough for the read.

**Rejected: daily streak.** PRD non-goal and the reason the weekly flame exists.

**Rejected: `fetch('topics.md')`.** Chromium refuses `fetch` of `file://` URLs from a `file://` page.
`progress-data.js` as a script is the folder's own answer to that and the map uses it.

**Spikes run for this plan, 2026-09-27, scratchpad only, nothing written to the v1 folder.**

1. Third-person conversion. Every `wrong` message from all 21 generators over 300 seeds each
   (`0x5eed + i * 7919`): 10,767 messages, 248 distinct after `third()`, 0 residual second-person words.
   Openings by count: `That is` 4,577; `You added` 1,410; `You multiplied` 634; `You left` 608; `You went`
   404; `You divided` 800 across two spellings; then `A straight`, `The right`, `Upside down.`, `Right
   start.`, `That compares`, `The <digit>` for the rest. Converted sample: "Jo added 65 on. The question
   wants a part of 150."
2. Storage on `file://`. `spike.html` reads `tutor:spike`, prints it, writes a new value. Google Chrome
   153.0.8010.53, `--headless=new --user-data-dir=<scratch profile> --dump-dom`. Run 1: `read=null
   write=ok`. Run 2, same profile: `read=written-1790492083407 write=ok`. Headless Chrome then hangs on
   exit with a shared profile (the second invocation waited on the first's lock); irrelevant to the pages,
   worth knowing if Level 5 automates anything: pass `--timeout=8000` or use separate profiles.

**Hook facts for the implementer** (from `.claude/hooks/pre_tool_use.py`, observed): writes under
`~/Desktop/Matis_study_tutor` and `e1/` are not fenced; `process.env` in a Bash command's text is blocked;
`rm -rf` is blocked; a relative `app/` path in a write is blocked by the anketa fence (irrelevant here but
T4 and T6 will hit it, since this repo's pages live in `app/`; that hook needs its fence narrowed before
T4, which is a note for T1's plan, not this one).

**Sequencing risk.** T1 runs in parallel and will add `package.json` and `bun run check`. `e1/test-case.js`
must not depend on either; it runs with a bare `bun` or `node`. Once T1 lands, `bun test` will not pick it
up (no `.test.` in the name), which is intended: it reads a folder outside the repo.

## AMENDMENTS

(none yet)
