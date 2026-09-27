# Feature: T4 — Server and lesson bridge: pages served, quiz.js posts attempts, state read back

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

The first end-to-end slice: a pupil opens a lesson served by the binary, answers an item, and one `attempt`
line lands in `data/events.jsonl`; `GET /api/state` replays the log and reports it. Six things ship:

1. `src/server.ts` serves `app/` at `/` and `content/` at `/content/`, both read from disk beside the binary
   (never bundled, D10), with two JSON routes: `GET /api/state` and `POST /api/event`.
2. `POST /api/event` validates the body against the event union (T2's `parseEvent`), resolves a Sparx
   U-code in `topic` (and `intake.topics[].topic`) to the topic id, and appends through `src/events`.
   A malformed body is refused with no write and no `data/` folder created.
3. `app/quiz.js`, carried from v1: items come from `content/maths/items/*.json` instead of base64 in the
   markup, marking reads `misconceptions[].answer` (which retires v1's split bug, T3 plan N2), and the
   clipboard score line becomes one `attempt` event per item.
4. The 21 lessons lose their inline `.q` blocks (the "converted once" step in `content-pack.md`) and gain a
   `data-items` attribute; their `../assets/` links point at the served paths. The 21 reference sheets get
   the same link rewrite. A script does it and a test proves the committed files are its fixed point.
5. `app/practice.html` + `app/practice.js`: fresh-number practice from `generators.js`, topics from
   `topics.json`, every generated item seeded so a later ticket can rebuild it from the event.
6. `app/index.html` (the page at `/`: lesson list and a practice link), `app/style.css` carried, and
   `scripts/build.ts` staging `app/` and `content/` next to the binary so a lesson renders from the zip.

## User Story

As a pupil
I want to open a lesson from the tutor and answer its questions
So that what I got right, wrong and was sure about is recorded without me copying anything anywhere

## Problem Statement

T2 can write and replay events and T3 holds the maths pack, but nothing serves a page or turns an answer
into a record. The v1 lessons carry their items inline as base64 and post nothing; their `../assets/`
links point at a folder that does not exist in this tree.

## Solution Statement

Bun.serve with `routes` for the two API paths and a `fetch` fallback that serves files from `app/` and
`content/` under the binary's folder. The event route is a thin shell over `appendEvent`, which already
validates, stamps `t` and drops stray fields; the only addition is alias resolution against `topics.json`.
The state route replays the log on every call (a few thousand lines at most, D3) and refreshes
`state.json` when it is missing or behind. In the browser, `quiz.js` fetches the topic's items file named
in the lesson's `data-items`, renders each item the way v1's `buildItem` already did for generated ones,
marks in the page, and posts one `attempt` per item at the first check.

## Out of Scope / Non-Goals

- Not included: `session` events, the ladder, XP or `/api/next` (T5). A lesson answered in T4 moves no
  rung; `/api/state` shows `confidentWrong` and `calibration` only.
- Not included: a level map or progress page (T6). `/` is a plain lesson list. The lessons' "Progress"
  crumb points at `/` until T6 gives it a target.
- Not included: `read.js` (read-aloud), `solids.js` and `vendor/three.min.js` (3D solids, 668 KB,
  `observed` 2026-09-27) and `assets/audio/`. Their script tags come out of the lessons; the static SVG
  above each `.solid` div stays. See Q3.
- Not included: the "Tell Claude" clipboard prompts. The score line loses its copy button. The method-step
  copy buttons stay as v1 had them (surgical: the ticket names the score line only); T9's chat panel
  replaces them.
- Not included: a `lesson` field on `Topic` or an `/api/lessons` route. `index.html` lists the 21 lessons
  by hand; T10's `open_lesson` decides the mapping.
- Not changing: `src/events/replay.ts`, `src/events/types.ts`, `src/content/types.ts`, `topics.json`,
  `items/*.json`, `generators.js`.
- Not changing: the port ladder, `PORTS`, launchers, `tsconfig.json` `include` (app/ is not type-checked;
  `checkJs` is off so widening would do nothing).

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: `src/server.ts`, `src/api/` (new), `app/` (new), `content/maths/lessons`,
`content/maths/reference`, `scripts/`
**Dependencies**: none new. Bun 1.3.4 (`observed`), `@types/bun` 1.4.2, Biome 2.5.14, TypeScript 7.

## Related Work

**Implements**: #6 (T4)   ·   **Epic**: #1, `docs/prd/study-tutor-v2.architecture.md` (D1, D3, D5, D7,
D10), `docs/tickets/study-tutor-v2.md` T4

**Back-references** (plans this builds on or inherits decisions from):

- `.claude/plans/t2-events-append-replay.md` - Why: `appendEvent`, `readLines`, `readStoredState`,
  `writeState`, `replay` and the `data/` confinement are the whole write path here
- `.claude/plans/t3-maths-content-pack.md` - Why: item shape, `itemsFileName`, `loadTopics`,
  `loadGenerators(root)`, N2 (split bug), N3 (what the converter dropped), N4 (figures), and its
  forward-reference to this ticket ("strips the lessons' inline quiz, passes the binary's folder as root")
- `.claude/code-reviews/pr-21-review-round-2.md` R2-3 - Why: `openBrowser` gets an `env` option here

**Forward-references** (plans that extend or supersede this — append as follow-ups get created):

- T5 (#7) adds `GET /api/next` beside the two routes; T8 (#10) and T10 (#12) add theirs
- T6 (#8) rebuilds a generated item from `confidentWrong[item].seed` with the same `lcg`

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `src/server.ts` (all 67 lines) - Why: `startServer` port ladder and `openBrowser` are kept; the
  hello page goes; `handle` becomes routes + static
- `src/server.test.ts` (lines 4-38, 40-53) - Why: the ladder test stays as is; the L5 test at line 48
  (`Bun.which("xdg-open")`) is what R2-3 asks to replace
- `src/events/append.ts` (lines 56-99) - Why: `appendEvent` validates at line 77 but `mkdirSync` runs at
  line 62; the AC "refused with no write" moves the validation first. Lines 101-165: `readLines`,
  `readStoredState`, `writeState` are what the state route composes
- `src/events/replay.ts` (lines 29-43, 73-96, 139-168) - Why: `State` shape; the `attempt@1` case is what
  the AC reads back (`confidentWrong`, `calibration`); `replay` is pure
- `src/events/types.ts` (lines 29-36, 117-149, 173-196) - Why: `AttemptV1`, `FIELDS["attempt@1"]`,
  `parseEvent`; the route body is what `parseEvent` sees after `appendEvent` stamps `t`
- `src/events/check.ts` (lines 73-76) - Why: "no log and no state: write nothing" is the rule the state
  route mirrors so a GET never creates `data/`
- `src/events/append.test.ts` (lines 1-37) - Why: `withTemp` and the realpathed temp dir pattern
- `src/content/pack.ts` (all 43 lines) - Why: `itemsFileName`, `subjectDir(subject, root)`, `loadTopics`
- `src/content/generators.ts` (lines 8-27) - Why: how a plain-JS browser file is loaded under Bun for a
  test (`await import(file)` then read the global); `quiz.js` follows the same shape
- `src/content/pack.test.ts` (lines 20-30, 145-150) - Why: tests read `content/maths` from the repo root
  under `bun test`; the 63-file board-wording scan covers the stripped lessons too
- `src/marking/normalise.ts` - Why: `quiz.js`'s `norm` must stay this function; a test compares them
- `scripts/test-generators.ts` (lines 10-17) - Why: `lcg` is the seeded rng; `quiz.js` carries the same
  five lines so a seed in an event rebuilds the same numbers
- `scripts/convert-lessons.ts` (lines 56-109, 150-166) - Why: the quiz-section regex and the
  `data-code` → topic lookup the strip script reuses; the file itself is removed (Task 5)
- `scripts/convert-lessons.test.ts` (lines 36-52, 84-94) - Why: the fixture style to mirror; the test at
  line 84 reads the committed lessons and cannot survive the strip
- `scripts/scripts.test.ts` - Why: how a script is run from a temp cwd in a test
- `scripts/build.ts` (lines 53-78) - Why: the stage folder gets `app/` and `content/` copied beside the
  binary
- `content/maths/lessons/0001-U349-percentage-of-an-amount.html` (lines 7, 13, 76-126, 141, 144-146) -
  Why: the exact markup the strip script rewrites: stylesheet, crumb, quiz section, footer link, three
  script tags
- `content/maths/lessons/0018-U116-volume-of-a-cone.html` (lines 36, 82-137) - Why: a `.solid` div
  outside the quiz, SVG figures inside `.q` blocks, the `solids.js` and `three.min.js` tags
- `content/maths/items/1MA1-R9-of-an-amount.json` - Why: the item shape `quiz.js` renders
- `content/maths/topics.json` - Why: `aliases[0]` is the generator key; the practice page builds its picker
  from this file
- `content/maths/generators.js` (lines 1-17, tail) - Why: the generator contract and `root.GEN = GEN`
- `~/Desktop/Matis_study_tutor/assets/quiz.js` (358 lines) - Why: the donor. Lines 7-24 `norm`, 78-120
  `buildItem`, 124-155 `buildQuiz`, 158-176 `offerFreshSet`, 178-297 `initQuiz` (201-227 `render` is the
  clipboard score line and the E1 localStorage block, both replaced), 299-322 `wireMethodSteps`, 339-357
  copy delegation
- `~/Desktop/Matis_study_tutor/practice.html` (98 lines) - Why: the donor practice page; the picker
  (lines 20-42) becomes generated, the script (61-96) becomes `app/practice.js`
- `~/Desktop/Matis_study_tutor/assets/style.css` (328 lines) - Why: copied as `app/style.css`; no `url()`
  references (`observed`), so nothing else needs to travel
- `.claude/references/events.md` - Why: the event line and "only writers create `data/`"
- `.claude/references/content-pack.md` (lines 12, 31) - Why: the two lines this ticket makes true and
  updates
- `.claude/rules/content.md` - Why: every string a pupil sees in `app/` and in the rewritten lessons

### New Files to Create

- `src/api/state.ts` - `currentState(dataDir)`: replay the log, refresh `state.json` when missing or behind
- `src/api/state.test.ts` - empty log creates nothing; two appends show in `confidentWrong`; stale file rewritten
- `src/api/event.ts` - `postEvent(body, dataDir, topics)`: shape check, alias resolution, `appendEvent`, status
- `src/api/event.test.ts` - accepted, alias-resolved, refused-with-no-write cases
- `src/marking/quiz.test.ts` - loads `app/quiz.js` under Bun: `norm` parity, `mark`, `lcg` parity, `itemFromGenerated`
- `app/quiz.js` - the port
- `app/practice.js` - the picker and Mixed 6, from the donor's inline script
- `app/practice.html` - the practice page
- `app/index.html` - lesson list at `/`
- `app/style.css` - donor copy, Biome-formatted once
- `scripts/strip-lessons.ts` - one-shot, idempotent: quiz section and links in lessons; links in reference sheets
- `scripts/strip-lessons.test.ts` - fixture strip, idempotence, committed files are fixed points, `data-items` resolve

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [Bun.serve routes](https://bun.sh/docs/api/http#routing)
  - `routes: { "/api/state": { GET: handler } }`; a method not listed falls through to `fetch`
    (`observed` 2026-09-27: POST to a GET-only route reached the fallback)
  - Why: the two API routes and the static fallback
- [Bun.file](https://bun.sh/docs/api/file-io#reading-files-bun-file)
  - `Bun.file(path).exists()` is false for a directory and a missing file; `new Response(Bun.file(p))`
    sets `content-type` from the extension (`observed`: html, json, css, js, svg, txt as expected;
    no extension → `application/octet-stream`)
  - Why: no content-type table needed
- [Bun single-file executables](https://bun.sh/docs/bundler/executables)
  - Inside a compiled binary `import.meta.dir` is `/$bunfs/root` (`observed`, macOS) and
    `process.execPath` is the binary (`observed`); Windows uses `B:\~BUN\root` (`expected`, docs)
  - Why: `appRoot()` decides where `app/`, `content/` and `data/` are
- [Bun.spawn](https://bun.sh/docs/api/spawn#environment-variables)
  - `env` replaces the child's environment and the lookup of the command uses that `PATH`
    (`observed` 2026-09-27: `Bun.spawn(["ls"], { env: { PATH: emptyDir } })` throws
    `Executable not found in $PATH: "ls"`)
  - Why: R2-3's `openBrowser(url, env)` works and its test needs no platform poke
- [WHATWG URL path parsing](https://url.spec.whatwg.org/#path-state)
  - `%2e%2e` and `..` segments are resolved by `new URL()` before `pathname` is read (`observed`: both
    probes reached `/probe.ts`)
  - Why: the static guard still normalises after decoding, because `%2f` inside a segment decodes late

### Patterns to Follow

**Temp data dir in tests** (`src/events/append.test.ts:24-36`): `withTemp((dir, data) => ...)` with a
realpathed `mkdtempSync` and `rmSync` in `finally`. Every test that writes uses it; none writes under the
repo's `data/`.

**Only writers create `data/`** (`.claude/references/events.md` line 16, `check.ts:73-76`): a read path
returns "empty" for a missing folder and never calls `mkdirSync`.

**Loading a browser JS file under Bun** (`src/content/generators.ts:14-27`): `await import(absolutePath)`,
then read what the file put on `globalThis`. The file must not touch `document` at load time when
`document` is undefined.

**Error messages** (`append.ts:79`, `check.ts`): `Refused: ...` for a policy refusal; plain sentences
elsewhere. The route maps a message starting `Refused` to 400 and everything else to 500.

**Pupil-facing strings** (`.claude/rules/content.md`): sentence case, no exclamation marks, no emoji,
British English. Every new string in `app/` and in the rewritten lessons passes `no-ai-slop` then
`humanizer` as a mental pass before save.

**Numbers with provenance**: counts in this plan are `observed` on 2026-09-27 against `origin/main`
a3c87b7 unless marked otherwise.

---

## THE ANSWER GUARD (CLAUDE.md "Restate the guard")

This ticket adds no model job and no prompt, so the guard's model side is untouched. What changes is where
answers travel, so it is stated:

1. `content/maths/items/*.json` (with `answers`, `working`, `misconceptions`) is served as a static file to
   the browser on the pupil's own machine. That is v1's position exactly: v1 held the same answers as base64
   in the lesson markup. The browser marks; the server never opens an items file.
2. `POST /api/event` reaches `appendEvent`, which copies only `KEYS["attempt@1"]` fields
   (`append.ts:71-75`). A posted `answers` or `working` field never reaches the log. Test:
   `event.test.ts` posts an attempt carrying `answers: ["9"]` and asserts the written line has no such key.
3. `GET /api/state` is `replay(readLines())`, which reads no content file. T2's test already asserts the
   six-week state holds no `answers` or `mark_scheme` key.
4. No route serves `data/`: the static fallback maps `/` to `app/` and `/content/` to `content/` and
   nothing else. Test: `GET /data/events.jsonl` is 404 with a log present.

---

## IMPLEMENTATION PLAN

### Phase 0: Branch

`feature/t4-server-bridge` is cut from `main` at a3c87b7 (`observed`, done while planning). The
uncommitted edit to `.claude/skills/piv-create-pr/SKILL.md` follows into the working tree; leave it
unstaged and out of every T4 commit.

### Phase 1: Foundation — append order, style, strip

Tasks 1-5. `appendEvent` validates before it touches disk; `app/style.css` lands; the strip script runs
once over lessons and reference sheets; the converter and its tests go.

### Phase 2: API — state, event, server

**Depends on:** Task 1 (the no-write refusal is what `event.test.ts` asserts).
**Independent of:** Phase 3.

Tasks 6-9. Pure functions in `src/api/`, then `src/server.ts` wires them and serves files.

### Phase 3: Pages — quiz.js, index, practice

**Depends on:** Task 3 (the `data-items` attribute) and Task 2 (style).
**Independent of:** Phase 2 for the unit test; needs Phase 2 for Level 4.

Tasks 10-13.

### Phase 4: Build staging, docs, gate

**Depends on:** Phases 2 and 3.

Tasks 14-17.

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### 1. UPDATE `src/events/append.ts` — validate before any disk access

- **IMPLEMENT**: in `appendEvent`, move `fs.mkdirSync(dataDir, { recursive: true })` (line 62) and
  `const file = resolveInData(dataDir, EVENTS_FILE)` (line 63) to just after the `parsed === null` throw
  (line 80). The line-building block (66-76) needs neither. Update the doc comment: "Validates first, so a
  refused event creates nothing, not even `data/`."
- **PATTERN**: `check.ts:73-76` (nothing to write, nothing created)
- **GOTCHA**: `resolveInData` needs `dataDir` to exist (`realpathSync` on it), so `mkdirSync` stays
  before it; only the pair moves down.
- **VALIDATE**: add to `src/events/append.test.ts`:
  `test("a refused event creates no data folder", withTemp((_dir, data) => { expect(() => appendEvent(data, { v: 1, type: "attempt" } as NewEvent, AT)).toThrow("Refused"); expect(fs.existsSync(data)).toBe(false); }))`.
  `bun test src/events` green. Mutation: put the two lines back above the validation; the new test goes red
  (`data` exists), every other append test stays green. Record both.
- **SATISFIES**: AC #5 (malformed event refused with no write)

### 2. CREATE `app/style.css`

- **IMPLEMENT**: `cp ~/Desktop/Matis_study_tutor/assets/style.css app/style.css`, then
  `bunx biome format --write app/style.css`. Formatting once makes the file Biome's, as T3 did for
  `generators.js`; the content is the donor's.
- **PATTERN**: T3 plan Task 4 gotcha (`diff` against the formatter's own output is the shape check)
- **GOTCHA**: Biome formats CSS by default in 2.5; without the format pass `biome check` fails on this
  file. `.copy::before { content: '⧉' }` survives (quote style applies to JS only; verify in the diff).
- **VALIDATE**: `diff <(bunx biome format --stdin-file-path=app/style.css < ~/Desktop/Matis_study_tutor/assets/style.css) app/style.css`
  empty; `bunx biome check app/` green.
- **SATISFIES**: AC #1 (a lesson renders styled)

### 3. CREATE `scripts/strip-lessons.ts`

- **IMPLEMENT**:
  ```ts
  import { readdirSync } from "node:fs";
  import path from "node:path";
  import { itemsFileName, loadTopics } from "../src/content/pack";
  import type { Topic } from "../src/content/types";

  /** `../assets/` and `../page` links become the paths the binary serves. Applied to lessons and reference sheets. */
  const LINKS: [RegExp, string][] = [
    [/href="\.\.\/assets\/style\.css"/g, 'href="/style.css"'],
    [/<script src="\.\.\/assets\/quiz\.js"><\/script>/g, '<script src="/quiz.js"></script>'],
    [/<script src="\.\.\/assets\/generate\.js"><\/script>/g, '<script src="/content/maths/generators.js"></script>'],
    [/[ \t]*<script src="\.\.\/assets\/(read|solids|vendor\/three\.min)\.js"><\/script>\r?\n/g, ""],
    [/href="\.\.\/progress\.html"/g, 'href="/"'],
    [/href="\.\.\/reference\//g, 'href="/content/maths/reference/'],
    [/href="\.\.\/lessons\//g, 'href="/content/maths/lessons/'],
  ];
  export function rewriteLinks(html: string): string
  // reduce LINKS over html

  /** Drops every `.q` block from the quiz section and names the items file it now reads. Idempotent. */
  export function stripQuiz(html: string, itemsUrl: string): string {
    return html.replace(
      /(<section id="quiz"[^>]*)(>)([\s\S]*?)(<\/section>)/,
      (_, open: string, gt: string, inner: string, close: string) => {
        const at = inner.indexOf('<div class="q"');
        const kept = at === -1 ? inner : `${inner.slice(0, at).trimEnd()}\n  `;
        const tag = open.includes(' data-items="') ? open : `${open} data-items="${itemsUrl}"`;
        return `${tag}${gt}${kept}${close}`;
      },
    );
  }

  /** A lesson: quiz stripped, links rewritten. Throws if the code has no topic row. */
  export function stripLesson(html: string, topics: readonly Topic[], name = "lesson"): string {
    const code = /<section id="quiz"[^>]*data-code="(U\d+)"/.exec(html)?.[1];
    if (!code) throw new Error(`${name}: no quiz section with a data-code`);
    const topic = topics.find((t) => t.aliases.includes(code));
    if (!topic) throw new Error(`${name}: no topic in topics.json has alias ${code}`);
    return rewriteLinks(stripQuiz(html, `/content/maths/items/${itemsFileName(topic.id)}`));
  }

  /** The v1 maths pack is the only source; paths are fixed, not arguments (PR #23 H1). */
  if (import.meta.main) {
    const topics = await loadTopics("maths");
    let changed = 0;
    for (const [dir, fn] of [
      ["content/maths/lessons", (h: string, n: string) => stripLesson(h, topics, n)],
      ["content/maths/reference", (h: string) => rewriteLinks(h)],
    ] as const) {
      for (const file of readdirSync(dir).filter((f) => f.endsWith(".html")).sort()) {
        const p = path.join(dir, file);
        const before = await Bun.file(p).text();
        const after = fn(before, file);
        if (after !== before) { await Bun.write(p, after); changed++; }
      }
    }
    console.log(`${changed} files changed`);
  }
  ```
- **PATTERN**: `scripts/convert-lessons.ts:61-68` (section regex), `:123-125` (alias lookup),
  `:150-166` (fixed paths, `import.meta.main`)
- **GOTCHA**: `trimEnd()` then `\n  ` reproduces the two-space indent before `</section>` that every
  lesson has (`observed`, lesson 0001 line 126), so the output is a fixed point of itself. The
  `data-code` attribute stays: `quiz.js` still uses it as the generator key for "Five more, fresh
  numbers".
- **GOTCHA**: the `LINKS` order matters only for readability; no pattern's output matches another's
  input. `\r?\n` on the removal covers a CRLF checkout.
- **GOTCHA**: the lesson's `<p class="crumb"><a href="../progress.html">Progress</a>` becomes a link to
  `/` with the text "Progress" unchanged. It is lesson prose under `content/`; leave the word, T6 gives it
  a real target.
- **VALIDATE**: `bun scripts/strip-lessons.ts` prints `42 files changed` (`derived`: 21 lessons + 21
  reference sheets, every one has a `../assets/style.css` link). Then:
  `grep -c 'class="q"' content/maths/lessons/*.html | grep -v ':0$'` → nothing;
  `grep -l 'data-items="/content/maths/items/' content/maths/lessons/*.html | wc -l` → 21;
  `grep -rl '\.\./' content/maths/lessons content/maths/reference` → nothing;
  `grep -l 'solids.js\|three.min.js\|read.js' content/maths/lessons/*.html` → nothing;
  `for f in $(grep -oh 'data-items="[^"]*"' content/maths/lessons/*.html | cut -d'"' -f2); do test -f ".$f" || echo "missing $f"; done` → nothing.
  Run the script a second time: `0 files changed`.
- **SATISFIES**: AC #1, AC #2 (items load from `/content/maths/items/`)

### 4. CREATE `scripts/strip-lessons.test.ts`

- **IMPLEMENT**: four tests.
  1. Fixture (mirror `convert-lessons.test.ts:36-52`, two `.q` blocks, one with an svg and a scaffold,
     `data-code="U349"`, a stylesheet link, a `read.js` tag, a `../progress.html` crumb):
     `stripLesson(fixture, topics)` equals a literal expected string with the section reduced to
     `<h2>` + intro `<p>`, `data-items="/content/maths/items/1MA1-R9-of-an-amount.json"` on the tag,
     `/style.css`, no `read.js` line, `href="/"`.
  2. Idempotent: `stripLesson(stripLesson(fixture, topics), topics)` equals the first result;
     `rewriteLinks` likewise on a reference fixture.
  3. Committed files are fixed points: for every file in `content/maths/lessons`, `stripLesson(html,
     topics, file) === html`; for every file in `content/maths/reference`, `rewriteLinks(html) === html`.
     Assert 21 and 21 files.
  4. Every lesson's `data-items` names a file that exists under `content/maths/items/` and whose items all
     carry the topic the lesson's `data-code` aliases (read the file, check `items[0].topic`).
- **PATTERN**: `scripts/convert-lessons.test.ts` (fixture string with `b64` helper is not needed now:
  the strip never decodes)
- **GOTCHA**: test 3 is the "converted once" guarantee from `content-pack.md`: a lesson with a `.q`
  block left in, or a stale `../assets` link, goes red here.
- **VALIDATE**: `bun test scripts/strip-lessons.test.ts` 4 pass. Mutation: hand-add
  `<div class="q"></div>` to one lesson; test 3 red, tests 1, 2, 4 green; revert.
- **SATISFIES**: AC #1, AC #2

### 5. REMOVE `scripts/convert-lessons.ts`, `scripts/convert-lessons.test.ts`, the `convert` script

- **IMPLEMENT**: `git rm` both files; delete the `"convert"` line from `package.json` `scripts`. Their
  input (inline `.q` blocks) no longer exists in the tree, so the deep-equal test at
  `convert-lessons.test.ts:84` cannot pass and the script has nothing to read. PR #22 holds both; the
  T3 plan and report keep their references as history. See Q1.
- **PATTERN**: CLAUDE.md global "remove what your changes made unused"
- **GOTCHA**: `src/content/pack.test.ts:61` and `:93` state item counts "observed in the v1 lessons";
  the items files do not change, so those tests stay green untouched.
- **VALIDATE**: `bun run check` green (tsc no longer sees the test's imports; Biome sees no orphan).
- **SATISFIES**: housekeeping for AC #2

### 6. CREATE `src/api/state.ts`

- **IMPLEMENT**:
  ```ts
  import { readLines, readStoredState, writeState } from "../events/append";
  import { replay, type State } from "../events/replay";

  /** The state of the log as it is now. Rewrites state.json when it is missing or behind; never creates data/ for an empty log. */
  export function currentState(dataDir: string): State {
    const lines = readLines(dataDir);
    const state = replay(lines);
    const stored = readStoredState(dataDir) as { hash?: unknown } | null;
    if (lines.length === 0 && stored === null) return state;
    if (stored === null || stored.hash !== state.hash) writeState(dataDir, state);
    return state;
  }
  ```
- **PATTERN**: `check.ts:68-86` (the same three reads, the same "nothing to write" rule)
- **GOTCHA**: `readStoredState` returns `unknown`; only `hash` is read, and a missing or non-string hash
  simply means "rewrite". `writeState` is the T2 writer (temp file, fsync, rename), so a crash mid-write
  leaves the old file.
- **GOTCHA**: this replays the whole log per GET. At one line per item (D3) that is milliseconds for
  years of use; no cache, no incremental reducer.
- **VALIDATE**: `src/api/state.test.ts` with `withTemp`: (a) empty: `currentState(data).lines === 0` and
  `existsSync(data)` false; (b) after `appendEvent` of a sure-wrong attempt on item `X` topic `T` then a
  sure-right attempt on item `Y`, `currentState(data).confidentWrong` has `X` with `topic: T` and not `Y`,
  and `state.json` parses to an object whose `hash` equals the returned state's; (c) write a `state.json`
  with `hash: "stale"` and call again: the file's `hash` is replaced. `bun test src/api/state.test.ts`
  3 pass.
- **SATISFIES**: AC #3 (`/api/state` shows the confident-wrong count), AC #4 (replays when `state.json` is missing)

### 7. CREATE `src/api/event.ts`

- **IMPLEMENT**:
  ```ts
  import { appendEvent } from "../events/append";
  import type { Event, NewEvent } from "../events/types";
  import type { Topic } from "../content/types";
  import { utcNow } from "../mcp/clock";

  export type PostResult =
    | { status: 201; body: Event }
    | { status: 400 | 500; body: { error: string } };

  /** A U-code (alias) becomes its topic id; an id, or a string that is neither, passes through. */
  export function resolveTopic(topics: readonly Topic[], code: string): string {
    if (topics.some((t) => t.id === code)) return code;
    return topics.find((t) => t.aliases.includes(code))?.id ?? code;
  }

  const isObj = (x: unknown): x is Record<string, unknown> =>
    typeof x === "object" && x !== null && !Array.isArray(x);

  /** One posted body → one appended event, or a refusal with nothing written. */
  export function postEvent(body: unknown, dataDir: string, topics: readonly Topic[], now: () => string = utcNow): PostResult {
    if (!isObj(body)) return { status: 400, body: { error: "Body must be a JSON object" } };
    const event: Record<string, unknown> = { ...body };
    if (typeof event.topic === "string") event.topic = resolveTopic(topics, event.topic);
    if (Array.isArray(event.topics))
      event.topics = event.topics.map((row: unknown) =>
        isObj(row) && typeof row.topic === "string" ? { ...row, topic: resolveTopic(topics, row.topic) } : row);
    try {
      return { status: 201, body: appendEvent(dataDir, event as NewEvent, now) };
    } catch (err) {
      const message = (err as Error).message;
      if (message.startsWith("Refused")) return { status: 400, body: { error: message } };
      console.error(`Could not save an event: ${message}`);
      return { status: 500, body: { error: "Could not save the event" } };
    }
  }
  ```
- **PATTERN**: `append.ts:56-99` does the validation, the `t` stamp and the field filter; this file adds
  nothing to that path. `dict`/null-prototype concerns (PR #23 H2) are replay's and already handled.
- **GOTCHA**: the cast `event as NewEvent` is honest only because `appendEvent` runs `parseEvent` on the
  line it builds and throws `Refused` otherwise (`append.ts:77-80`). A body with `type: "nope"` gives
  `KEYS["nope@1"]` undefined → a line with only `v, t, type` → `parseEvent` null → 400. A body with no
  `v` gives the key `attempt@undefined` → same.
- **GOTCHA**: a posted `t` is dropped by `appendEvent` (only `KEYS` fields are copied, and `t` is stamped
  from `now`). Do not strip it here; the test proves the drop.
- **GOTCHA**: an unknown topic string (neither id nor alias) is accepted. Replay accepts any string, and
  T17's intake will post codes from school sheets that the pack may not have yet. Refusing here would make
  a content gap a write failure. Say so in the doc comment.
- **VALIDATE**: `src/api/event.test.ts` with `withTemp` and a fixed `now`:
  (a) attempt with `topic: "U349"` → 201, body `topic` is `1MA1/R9/of-an-amount`, `t` is `now()`, one
  line in `events.jsonl`; (b) `topic: "1MA1/R4"` passes through; `topic: "U999"` passes through
  unchanged; (c) intake with `topics: [{ topic: "U687", rag: "R" }]` → written row has `1MA1/R4`;
  (d) body `{ v: 1, type: "attempt", item: "x" }` → 400 `Refused: not a valid attempt v1 event`, no
  `data/` folder; (e) `[]`, `null`, `"x"` → 400 "Body must be a JSON object", no folder; (f) attempt
  carrying `answers: ["9"]`, `working: "..."` and `t: "1999-01-01T00:00:00Z"` → 201 and the written line
  has none of `answers`, `working`, and `t` is `now()`. `bun test src/api/event.test.ts` 6 pass.
- **SATISFIES**: AC #2 (attempt lands), AC #5 (malformed refused with no write), alias resolution

### 8. UPDATE `src/server.ts` — root, options, routes, static, openBrowser env

- **IMPLEMENT**: keep `PORTS`, the ladder loop and its error text. Replace `PAGE` and `handle` with:
  ```ts
  import fs from "node:fs";
  import path from "node:path";
  import { postEvent } from "./api/event";
  import { currentState } from "./api/state";
  import { loadTopics } from "./content/pack";
  import type { Topic } from "./content/types";

  export type ServerOptions = { root: string; dataDir: string; topics: readonly Topic[] };

  /** The folder holding app/, content/ and data/: beside the binary when compiled, the cwd under `bun run dev`. */
  export function appRoot(): string {
    // A compiled binary's modules live at /$bunfs/root (observed, macOS) or B:\~BUN\root (Windows, expected).
    const compiled = /^\/\$bunfs\/|[\\/]~BUN[\\/]/.test(import.meta.dir);
    return compiled ? path.dirname(process.execPath) : process.cwd();
  }

  /** `/x` from app/, `/content/x` from content/. A `..` cannot escape: the path is normalised with a leading slash before it is joined. */
  async function serveStatic(req: Request, root: string): Promise<Response> {
    if (req.method !== "GET" && req.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url).pathname);
    } catch {
      return new Response("Bad request", { status: 400 });
    }
    if (pathname === "/") pathname = "/index.html";
    if (pathname.includes("\0")) return new Response("Not found", { status: 404 });
    const [folder, rel] = pathname.startsWith("/content/")
      ? ["content", pathname.slice("/content".length)]
      : ["app", pathname];
    const file = Bun.file(path.join(root, folder, path.normalize(`/${rel}`)));
    if (!(await file.exists())) return new Response("Not found", { status: 404 });
    return new Response(file, { headers: { "cache-control": "no-cache" } });
  }

  function json(status: number, body: unknown): Response {
    return Response.json(body, { status, headers: { "cache-control": "no-store" } });
  }

  export function startServer(ports: readonly number[], opts: ServerOptions) {
    const { root, dataDir, topics } = opts;
    for (const port of ports) {
      try {
        return Bun.serve({
          hostname: "127.0.0.1",
          port,
          routes: {
            "/api/state": { GET: () => json(200, currentState(dataDir)) },
            "/api/event": {
              POST: async (req) => {
                let body: unknown;
                try {
                  body = await req.json();
                } catch {
                  return json(400, { error: "Body is not JSON" });
                }
                const r = postEvent(body, dataDir, topics);
                return json(r.status, r.body);
              },
            },
          },
          fetch: (req) => serveStatic(req, root),
        });
      } catch (err) { /* unchanged ladder logic */ }
    }
    throw new Error(`No free port in ${ports.join(", ")}`);
  }

  /** Best effort: the URL is already on the console, so a missing opener is not an error. */
  export function openBrowser(url: string, env: Record<string, string | undefined> = process.env): void {
    /* cmd as today */
    try {
      Bun.spawn(cmd, { env, stdio: ["ignore", "ignore", "ignore"] });
    } catch { /* no opener on PATH */ }
  }

  if (import.meta.main) {
    try {
      const root = appRoot();
      if (!fs.existsSync(path.join(root, "app", "index.html"))) {
        throw new Error(`no app folder in ${root}. Start the tutor from its own folder.`);
      }
      const topics = await loadTopics("maths", root);
      const server = startServer([...PORTS, 0], { root, dataDir: path.join(root, "data"), topics });
      /* console.log and openBrowser as today */
    } catch (err) {
      console.error(`Could not start: ${(err as Error).message}`);
      process.exit(1);
    }
  }
  ```
- **PATTERN**: `src/server.ts:28-40` (ladder, unchanged), `src/content/pack.ts:13-17` (`root` is a
  parameter, cwd is the default), `scripts/replay-check.ts` (data is `data/` under the run folder)
- **GOTCHA**: `path.normalize("/../x")` is `/x` and `path.join(base, "/x")` is `base/x`: the leading slash
  is what makes the join safe. On Windows `path.normalize("/..\\x")` is `\x` and the join still lands
  under `base` (`expected`). `Bun.file(dir).exists()` is false, so `/content/maths/lessons/` is 404, not a
  listing.
- **GOTCHA**: `routes` is typed in `@types/bun` 1.4.2 (`serve.d.ts:672`, `observed`). A method not in
  the route object reaches `fetch`, which answers 405 for anything but GET/HEAD and 404 for a GET of
  `/api/state` with a trailing segment. Good enough; no explicit 405 per route.
- **GOTCHA**: `currentState` is synchronous file I/O inside a request handler. Fine here: one pupil, one
  browser, a log of kilobytes. Do not make it async to look tidy.
- **GOTCHA**: `dataDir` is `root/data`, never a request-supplied path. The only user-supplied path in this
  file is the static `pathname`, guarded above. A Sonar "path traversal" alert on the static path is
  answered by the normalise-then-join line and the four traversal tests; say so in the PR body.
- **GOTCHA**: `tsc` under `verbatimModuleSyntax`: `import type` for `Topic`. Biome
  `organizeImports` orders the import block; run `bunx biome check --write src/server.ts` once.
- **VALIDATE**: `bunx tsc --noEmit` clean; Task 9's tests.
- **SATISFIES**: AC #1, AC #3, AC #4, AC #5, the R2-3 checkbox on #6

### 9. UPDATE `src/server.test.ts`

- **IMPLEMENT**: a module-level `opts` built once: `root = process.cwd()` (the repo, as `pack.test.ts`
  assumes), `topics = await loadTopics("maths")`, `dataDir` a fresh realpathed temp dir per test that
  needs writes. Keep the ladder test, passing `opts` to each `startServer`; it still fetches `/` (now
  `app/index.html`, assert the body contains `Study tutor` and `practice.html`) and `/nope` (404).
  Add:
  1. static: `/quiz.js` 200 `text/javascript;charset=utf-8`; `/style.css` 200 `text/css;charset=utf-8`;
     `/content/maths/topics.json` 200 `application/json;charset=utf-8`;
     `/content/maths/lessons/0001-U349-percentage-of-an-amount.html` 200 and body contains
     `data-items="/content/maths/items/1MA1-R9-of-an-amount.json"` and not `class="q"`;
     `/content/maths/lessons/` 404; `/practice.html` 200.
  2. traversal, each 404: `/../package.json`, `/%2e%2e/package.json`, `/content/../package.json`,
     `/content/..%2f..%2fpackage.json`, `/content/maths/../../src/server.ts`; and `/data/events.jsonl`
     404 after an event has been posted (the log exists, the route does not).
  3. methods: `POST /quiz.js` 405; `POST /api/state` 404 (falls to static, no such file); `GET /api/event`
     404.
  4. end to end (AC #3): `POST /api/event` with
     `{ v: 1, type: "attempt", item: "1MA1/R9/of-an-amount#1", topic: "U349", correct: false, sure: true, answer: "4.5" }`
     → 201, body `topic` resolved; `GET /api/state` → 200, `confidentWrong["1MA1/R9/of-an-amount#1"].topic`
     is `1MA1/R9/of-an-amount`, `calibration[<week>].sureWrong` is 1; `dataDir/events.jsonl` has one line;
     `dataDir/state.json` exists. Then `POST` a body `{ "v": 1, "type": "nope" }` → 400 with `error`
     starting `Refused`, and the log still has one line. Then `POST` the text `not json` → 400 "Body is
     not JSON".
  5. R2-3: replace the `Bun.which` test with
     `test("openBrowser does not throw when no opener is on PATH", withTemp((dir) => { expect(() => openBrowser("http://127.0.0.1:1/", { PATH: dir })).not.toThrow(); }))`.
     No `process.platform` poke: with an empty `PATH` the darwin `open`, the win32 `cmd` and the linux
     `xdg-open` all fail the same way (`observed` for `ls`, Task list Documentation).
- **PATTERN**: `src/server.test.ts:4-38` (create servers inside `try`, stop in `finally`),
  `append.test.ts:24-36` (`withTemp`)
- **GOTCHA**: the ladder test's `startServer([base])` throw message is unchanged. Every server started
  in a test is stopped with `stop(true)` in `finally`; a leaked server holds the port and the next test's
  ladder walk changes shape.
- **GOTCHA**: the ISO week for the calibration assertion: use `isoWeek(localDay(t))` from
  `src/mcp/clock` on the `t` the 201 body returned; never hard-code a week.
- **VALIDATE**: `bun test src/server.test.ts` all pass. Mutation A: replace `path.normalize(`/${rel}`)`
  with `rel`; the five traversal cases go red (`expected`; record `observed`), the rest stay green.
  Mutation B: in `postEvent` return 201 without calling `appendEvent`; test 4 goes red at the log-line
  count. Revert both.
- **SATISFIES**: AC #1, #3, #4, #5; R2-3

### 10. CREATE `app/quiz.js`

- **IMPLEMENT**: an IIFE in plain modern JS (`const`/`let`, arrow functions, template strings; no
  modules, no build). Sections, in file order:
  1. Header comment: what it does, the v1 invariant ("the working stays hidden until the pupil commits an
     answer"), and: "Runs in the browser. Loaded under Bun by `src/marking/quiz.test.ts`, so nothing here
     touches `document` at load time."
  2. `norm(s)`: the 16 replace calls from `src/marking/normalise.ts`, verbatim, single-quoted → Biome
     double-quotes them.
  3. `lcg(seed)`: the five lines of `scripts/test-generators.ts:11-17`, verbatim.
  4. `escapeHtml(s)`: v1 lines 63-67.
  5. `mark(item, typed)`: `const val = norm(typed); const ok = item.answers.some((a) => norm(a) === val); const named = ok ? null : (item.misconceptions.find((m) => norm(m.answer) === val)?.message ?? null); return { ok, named };`
  6. `itemFromGenerated(topicId, spec, seed)`: `{ id: `${topicId}#gen`, topic: topicId, stem: spec.stem, hint: spec.hint, answers: spec.answers, working: spec.working, misconceptions: Object.entries(spec.wrong || {}).map(([answer, message]) => ({ answer, message })), seed }`.
  7. `postAttempt(item, ok, sure, typed)`: `fetch("/api/event", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ v: 1, type: "attempt", item: item.id, topic: item.topic, correct: ok, sure, answer: typed, ...(item.seed === undefined ? {} : { seed: item.seed }) }) })`; returns the promise; on a non-2xx or a thrown fetch, the caller shows "Not saved. Check the tutor window is still open." after the feedback text.
  8. `buildItem(item, number)`: v1 lines 78-120 without the base64: stem `${number}. ${item.stem}`; if
     `item.figure`, a `<div class="figure">` with `innerHTML = item.figure` (pack content, trusted, the
     same bytes v1 had inline); if `item.scaffold`, `<div class="working faded"><p>` with the text;
     label + input; Check button; `.feedback` hidden; `.hint` hidden if `item.hint`; `.working` hidden
     with `item.working`. Keeps v1's element order so `style.css` applies unchanged.
  9. `buildQuiz(gens, picks, label)`: `picks` is `[{ code, topic }]` in play order (the caller does the
     round robin); for each: `seed = (Math.random() * 4294967296) >>> 0`, `spec = gens[code](lcg(seed))`,
     `item = itemFromGenerated(topic, spec, seed)`; returns `{ section, items }` where `section` is
     v1's quiz section (lines 139-147) with `dataset.code` = the single code or `mixed`.
  10. `offerFreshSet(section, items)`: v1 lines 158-176; needs `window.GEN` and a single `data-code`;
      the topic id for the fresh set is `items[0].topic` (a lesson's items all share it).
  11. `initQuiz(section, items)`: v1 lines 178-297 with these changes: items are appended by `buildItem`
      (the section has none); `render()` writes only `<span class="scoreline">…</span>` (no prompt, no copy
      button, no localStorage block); `check()` calls `mark(item, input.value)`; at the first check that
      passes the empty and confidence gates it calls `postAttempt(item, ok, sureAtFirst, input.value.trim())`
      once (a flag per item); the second-try path and the feedback strings stay v1's.
  12. `initLesson(section)`: `fetch(section.dataset.items)` → `res.json()` → `initQuiz(section, items)`;
      on failure the intro paragraph's text becomes "The questions did not load. Check the tutor window is
      still open."
  13. `wireMethodSteps()` and the copy delegation: v1 lines 299-322, 339-357, unchanged.
  14. `start()`: `document.querySelectorAll(".quiz[data-items]").forEach(initLesson); wireMethodSteps();`
      and the ready-state guard, wrapped in `if (typeof document !== "undefined")`.
  15. Exports: `const root = typeof window === "undefined" ? globalThis : window; root.quiz = { norm, lcg, mark, itemFromGenerated, buildQuiz, initQuiz };`
- **PATTERN**: donor `assets/quiz.js` (line numbers above); `content/maths/generators.js:1-20, tail`
  (the `root` global pattern)
- **GOTCHA**: `SURE_NOTE` (v1 line 69) is pupil-facing prose; it passes `.claude/rules/content.md` as is
  (no exclamation mark, plain register). The two new strings above are the only additions; the "Not
  saved" one names what to do, not a fault.
- **GOTCHA**: `answer` in the event is the trimmed raw input, not `norm`'s output: the record is what the
  pupil typed. `mark` normalises both sides, so `misconceptions[].answer` such as `y=7x+1` matches
  `y = 7x + 1` (T3 N2 retired).
- **GOTCHA**: one `attempt` per item, at the first check (Q2). `sure` is the confidence at that check;
  `correct` is that check's result. A correct second try after the hint changes the screen, not the record.
- **GOTCHA**: Biome lints `app/` with the recommended preset (`observed`: `noUnusedVariables` fired on a
  probe file). Fix what fires; do not add an override, that is for the donor mirror `generators.js` only.
- **VALIDATE**: `bunx biome check app/quiz.js` green; Task 11's test.
- **SATISFIES**: AC #2

### 11. CREATE `src/marking/quiz.test.ts`

- **IMPLEMENT**: `await import(path.resolve(import.meta.dir, "../../app/quiz.js"))` then
  `const quiz = (globalThis as { quiz?: … }).quiz` (mirror `src/content/generators.ts:21-22`). Tests:
  1. `norm` parity: for each row of the table in `src/marking/normalise.test.ts` (copy the input
     strings), `quiz.norm(s) === normaliseAnswer(s)`.
  2. `lcg` parity: `quiz.lcg(24301)` and `lcg(24301)` from `scripts/test-generators.ts` give the same
     first ten values.
  3. `mark` on a fixture item with `answers: ["9", "9.0"]` and misconceptions `[{ answer: "y=7x+1",
     message: "…" }]`: `"9.00"` ok; `"y = 7x + 1"` not ok with the message; `"4"` not ok, `named` null.
  4. `itemFromGenerated("1MA1/R9/of-an-amount", GEN.U349(lcg(7)), 7)` (load `GEN` via `loadGenerators`)
     has `id` `1MA1/R9/of-an-amount#gen`, `seed` 7, `misconceptions` with the same keys as `spec.wrong`.
- **PATTERN**: `src/content/generators.test.ts` (loading the plain-JS file), `normalise.test.ts` rows
- **GOTCHA**: `bun test` finds test files anywhere; `tsc` checks this one because it is under `src/`.
  The dynamic `import()` of a `.js` path is untyped (`allowJs`); type the export shape locally in the
  test, do not add a `.d.ts`.
- **VALIDATE**: `bun test src/marking/quiz.test.ts` 4 pass. Mutation: change one replace in `quiz.js`'s
  `norm`; test 1 red; revert.
- **SATISFIES**: AC #2 (marking parity with the server-side normaliser)

### 12. CREATE `app/index.html`

- **IMPLEMENT**: `<!doctype html>`, `lang="en-GB"`, `<link rel="stylesheet" href="/style.css">`,
  `<main class="lesson">`, `<h1>Study tutor</h1>`, one line of prose ("Pick a lesson. Practice gives you
  fresh numbers on any topic."), `<p><a href="/practice.html">Practice</a></p>`, then `<ol>` of 21
  `<li><a href="/content/maths/lessons/<file>">U349 Percentage of an amount</a></li>` in file order
  (the text is the lesson `<title>`). Add the E1 line from the v1 hello page: "When you are done, close
  this tab, then close the window that started the tutor." No script.
- **PATTERN**: the removed `PAGE` in `src/server.ts:3-15`; `style.css` `.lesson` layout
- **GOTCHA**: Biome checks `app/*.html` (`observed`: "Checked 2 files" on a probe html + js) and passed
  a plain document; keep markup simple. If a real diagnostic appears on HTML, exclude `app/*.html` in
  `biome.json` the way lessons are, and say so in the report.
- **VALIDATE**: `for f in content/maths/lessons/*.html; do grep -q "/$f" app/index.html || echo "unlinked $f"; done`
  → nothing; `grep -c '/content/maths/lessons/' app/index.html` → 21. Add that pair as test 5 in
  `scripts/strip-lessons.test.ts` (every lesson linked once from `app/index.html`; every link resolves).
- **SATISFIES**: AC #1 (a lesson is reachable from `/`)

### 13. CREATE `app/practice.html` and `app/practice.js`

- **IMPLEMENT**: `practice.html` is the donor with: `href="/style.css"`; the `.picker` div empty
  (filled by script); the "After a set" section reduced to "Anything you got wrong is the next session."
  plus `<a href="/">Lessons</a>`; scripts `/content/maths/generators.js`, `/quiz.js`, `/practice.js`.
  `practice.js`: fetch `/content/maths/topics.json`; for each row append
  `<label><input type="checkbox" value="<id>" data-code="<aliases[0]>" checked> <title> <span class="code"><aliases[0]></span></label>`;
  Tick all / Untick all as donor; Mixed 6: `picks` from the ticked rows as `{ code, topic }`, shuffled,
  round-robin to 6 (donor lines 130-137), skipping rows whose code has no `GEN` function; then
  `const { section, items } = quiz.buildQuiz(window.GEN, picks, "mixed set")`, replace `#set`'s content,
  `quiz.initQuiz(section, items)`, status line as donor. If `GEN` is missing (the script failed to load):
  status "No generators loaded. Check the tutor window is still open."
- **PATTERN**: donor `practice.html:61-96`
- **GOTCHA**: `topics.json` is served by the static route; a topic row without a generator (none today,
  `observed`: 21 rows, 21 `GEN` keys) is skipped, not an error.
- **VALIDATE**: `bunx biome check app/` green; Level 4 step 3.
- **SATISFIES**: AC #2 for generated items (the ticket's "practice.html ported to fresh-number practice")

### 14. UPDATE `scripts/build.ts` — stage `app/` and `content/`

- **IMPLEMENT**: after the launcher copies (line 78), for each stage:
  `fs.cpSync("app", path.join(stage, "StudyTutor", "app"), { recursive: true });` and the same for
  `content`. Nothing from `data/`, `e1/`, `src/`.
- **PATTERN**: `copyLauncher` (lines 38-42)
- **GOTCHA**: `content/` is about 700 KB (`derived`: lessons 344 + reference 84 + items 180 + generators
  37 + topics 5, T3 report sizes); the zip grows by that. The zip step already zips the whole
  `StudyTutor` folder, so no change there.
- **VALIDATE**: `bun run build` then `unzip -l dist/StudyTutor-mac.zip | grep -c 'content/maths/lessons/'`
  → 21 and `unzip -l dist/StudyTutor-mac.zip | grep 'app/quiz.js'` → one line. Level 4 step 5 runs it.
- **SATISFIES**: AC #4 (a lesson renders from the binary)

### 15. UPDATE `.claude/references/content-pack.md`, `.claude/references/events.md`

- **IMPLEMENT**: `content-pack.md` line 12 → "`lessons/` HTML, one per topic; each quiz section names
  its items file in `data-items` and `app/quiz.js` renders and posts". Line 31 → "The hand-written `.q`
  items were converted once into `items/` (T3) and stripped from the lessons (T4);
  `scripts/strip-lessons.test.ts` fails if a `.q` block or a `../assets` link comes back." `events.md`:
  a short "Routes" paragraph after "Event line": `POST /api/event` takes a body without `t`, resolves a
  U-code in `topic` and `topics[].topic` to the topic id, and appends through `appendEvent`; a refusal is
  400 and writes nothing, not even `data/`. `GET /api/state` is `replay` of the log and refreshes
  `state.json` when missing or behind; an empty log creates nothing.
- **GOTCHA**: prose gate: `no-ai-slop` then `humanizer` as a mental pass; no banned words.
- **VALIDATE**: `grep -n "converted once\|data-items" .claude/references/content-pack.md` shows both.
- **SATISFIES**: CLAUDE.md on-demand context stays true

### 16. Gate

- **VALIDATE**: `bun run check` green (tsc, Biome, `bun test`). Test count: 108 on `main` a3c87b7
  (`observed`, 12 files) + 3 (state) + 6 (event) + 4 (quiz) + 5 (strip) + ~8 (server) + 1 (append)
  − 5 (convert) − 1 (the replaced `Bun.which` test) ≈ 129 (`derived`; record `observed`).
  `bun scripts/test-generators.ts` still `all 6300 runs pass`.
- **SATISFIES**: every AC

### 17. Level 4 (below), then `system-execution-report`

---

## TESTING STRATEGY

### Unit Tests

`bun test`, files colocated. New: `src/api/state.test.ts`, `src/api/event.test.ts`,
`src/marking/quiz.test.ts`, `scripts/strip-lessons.test.ts`; extended: `src/events/append.test.ts`,
`src/server.test.ts`. Every writing test uses a realpathed temp `data/`.

### Integration Tests

`src/server.test.ts` starts the real server on port 0 against the repo's `app/` and `content/` and a temp
`data/`, and drives it with `fetch` in the order the browser does: GET the lesson, POST the attempt, GET
the state. That is the AC end to end, minus the DOM.

### Edge Cases

| Case | Verified in |
|---|---|
| Refused event creates no `data/` | `append.test.ts` (Task 1), `event.test.ts` (d, e) |
| Posted `t`, `answers`, `working` never reach the log | `event.test.ts` (f) |
| Alias in `topic` and in `intake.topics[]` | `event.test.ts` (a, c) |
| Unknown topic string passes through | `event.test.ts` (b) |
| Empty log: GET creates nothing | `state.test.ts` (a) |
| Stale `state.json` rewritten | `state.test.ts` (c) |
| `..`, `%2e%2e`, `%2f` traversal, `/data/` path | `server.test.ts` 2 |
| Directory path, missing file | `server.test.ts` 1 |
| Wrong method on static and on a route | `server.test.ts` 3 |
| Bad JSON body | `server.test.ts` 4 |
| No opener on PATH | `server.test.ts` 5 |
| A `.q` block or `../assets` link left in content | `strip-lessons.test.ts` 3 |
| `data-items` names a missing file | `strip-lessons.test.ts` 4 |
| `norm` drift between browser and server | `quiz.test.ts` 1 |
| Seed drift between browser and generator gate | `quiz.test.ts` 2 |
| Misconception key with `=` inside (T3 N2) | `quiz.test.ts` 3 |
| Second try after a hint posts nothing | Level 4 step 2 (no automated DOM) |
| Tutor stopped mid-quiz: "Not saved" shown | Level 4 step 4 |
| Lesson with SVG figures in items (0018) | Level 4 step 2b |
| Binary serves a lesson with no model configured | Level 4 step 5 |

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
bunx tsc --noEmit
bunx biome check .
```

### Level 2: Unit Tests

```bash
bun test src/events src/api src/marking scripts
```

### Level 3: Integration Tests

```bash
bun test src/server.test.ts
bun scripts/test-generators.ts
```

### Level 4: Manual Validation

Performable with what this ticket ships: the server, the pages, the pack, an empty `data/`.

1. `rm -rf data && bun run dev`. The browser opens `/`: a lesson list and a Practice link. Console shows
   the URL.
2. Open lesson 0001 (U349). Five numbered questions render with Sure / Not sure radios and a faded
   first step on questions 1 and 2. Answer question 1 with `4.5`, Sure, Check: feedback "That is 10% of
   45. You need two lots of it." and the hint appears. Answer `9`, Check: "Correct on the second go."
   `cat data/events.jsonl` → exactly one line, `attempt`, `item` `1MA1/R9/of-an-amount#1`, `correct`
   false, `sure` true, `answer` `4.5`, no `seed`. `curl -s localhost:<port>/api/state | jq .confidentWrong`
   shows that item with `topic` `1MA1/R9/of-an-amount`. `ls data` shows `events.jsonl` and `state.json`.
   2b. Open lesson 0018 (U116): each question shows its cone or sphere SVG above the input; the `.solid`
   div under the method is empty and nothing errors in the console.
3. Open `/practice.html`. Picker lists 21 topics with codes. Untick all, tick U349 and U687, Mixed 6:
   six questions, no two in a row from the same code. Answer one, Sure: `events.jsonl` gains a line with
   `item` `<topic>#gen` and a `seed`. In the console:
   `GEN.U349(quiz.lcg(<that seed>)).stem` equals the stem on screen (rebuild from seed works).
4. Stop the server (Ctrl-C) with a lesson open. Check an answer: feedback shows, then "Not saved. Check
   the tutor window is still open." Restart: `events.jsonl` unchanged.
5. `bun run build`; `cd dist/stage/mac/StudyTutor && ./Start.command` (or run `./StudyTutor-arm64`
   directly from another cwd: `cd /tmp && <path>/StudyTutor-arm64`). The browser opens; open a lesson;
   answer one; `ls dist/stage/mac/StudyTutor/data` shows the log beside the binary. Windows zip: not run
   here (`expected`, same code path; `appRoot` Windows detection is `expected` from the docs).
6. `curl -s -X POST localhost:<port>/api/event -d '{"v":1,"type":"nope"}' -H 'content-type: application/json'`
   → 400 `{"error":"Refused: not a valid nope v1 event"}`; `wc -l data/events.jsonl` unchanged.
7. `bun scripts/strip-lessons.ts` → `0 files changed`.

For steps 2 to 4 the `agent-browser` skill can drive headless Chrome; T3 used headless Chrome for its
Level 4.4. Record the seed and the stems in the report.

### Level 5: Additional Validation (Optional)

`jcodemunch` `find_references` on `appendEvent` after the change: callers are `event.ts`, the tests and
`synth-events.ts`; none relied on `data/` being created before validation.

---

## ACCEPTANCE CRITERIA

- [ ] AC #1 `src/server.ts` serves `app/` at `/` and `content/` at `/content/` from the folder beside the
  binary; a lesson opens from `/` and renders styled with its questions (Level 4 step 2, `server.test.ts` 1)
- [ ] AC #2 `app/quiz.js` renders items from `/content/maths/items/<topic>.json`, marks in the page, and
  posts one `attempt` per item carrying `item`, `topic`, `correct`, `sure`, `answer` (and `seed` for
  generated items); one line lands in `data/events.jsonl` (Level 4 steps 2, 3; `quiz.test.ts`)
- [ ] AC #3 `GET /api/state` shows the topic's confident-wrong entry after that attempt (`server.test.ts` 4)
- [ ] AC #4 `GET /api/state` replays when `state.json` is missing; a lesson renders from the compiled
  binary with no model configured (`state.test.ts`; Level 4 step 5)
- [ ] AC #5 a malformed event is refused with 400 and nothing written, not even `data/`
  (`event.test.ts` d, e; `server.test.ts` 4; Level 4 step 6)
- [ ] The 21 lessons hold no `.q` block and no `../assets` link; the 21 reference sheets hold no
  `../assets` link; `scripts/strip-lessons.ts` is a no-op on the committed tree (`strip-lessons.test.ts` 3)
- [ ] `POST /api/event` resolves `U349` → `1MA1/R9/of-an-amount` in `topic` and in `intake.topics[]`
  (`event.test.ts` a, c)
- [ ] `openBrowser` takes `env` and its test asserts nothing about the machine (#6 checkbox, R2-3)
- [ ] `scripts/build.ts` stages `app/` and `content/`; the zip lists 21 lessons
- [ ] `bun run check` green; `bun scripts/test-generators.ts` 6300 runs pass
- [ ] No new pupil-facing string breaks `.claude/rules/content.md`
- [ ] Guard restated in the PR body as in THE ANSWER GUARD above

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] Full test suite passes (unit + integration)
- [ ] No linting or type checking errors
- [ ] Manual testing confirms feature works (Level 4 steps 1-7 recorded in the report)
- [ ] Acceptance criteria all met
- [ ] Code reviewed for quality and maintainability
- [ ] PR body carries the figures with provenance (files changed by the strip, test count, zip size)

---

## OPEN QUESTIONS / ASSUMPTIONS

Each has a recommendation; the implementer proceeds on it unless Linards says otherwise.

- **Q1 The converter goes.** `scripts/convert-lessons.ts` and its test read `.q` blocks that this ticket
  removes; its deep-equal test (`convert-lessons.test.ts:84`) cannot pass afterwards. Recommended: remove
  both and the `convert` script (Task 5); PR #22 holds them. Alternative: keep the fixture tests only and a
  script with no input, which is dead code by CLAUDE.md's test.
- **Q2 Which try the event records.** Recommended: the first check (the moment of the Sure bet), with
  `correct` and `answer` from that check; the hinted second try is screen-only. This is what calibration
  and `confidentWrong` are defined on (D7: "confidence and correctness travel in the event").
  Alternative: post at the final state, which would let a hinted recovery erase a confident wrong.
- **Q3 `solids.js` + `three.min.js` and `read.js` do not ship.** Three lessons lose their draggable 3D
  solid (the static SVG above it stays); every lesson loses the read-aloud button. Recommended for T4:
  drop, and open a small follow-up ticket "carry solids.js and read.js into app/" so it is owned; three.js
  is MIT and would need a line in `LICENCE.md`. Alternative: ship both now (+668 KB, +506 lines, licence
  note), which is more than the ticket's file list.
- **Q4 Root resolution.** `appRoot()` is the binary's folder when compiled, else the cwd. The launchers
  already `cd` to the binary's folder, so both agree in the shipped layout; the compiled rule covers a
  direct double-click of the binary on a Mac. Windows detection of the compiled case is `expected` from
  the Bun docs, not observed. If it is wrong on Windows, the fallback is the cwd, which `Start.bat` sets.
- **Q5 `/api/state` replays every call** rather than "only when `state.json` is missing". Same result,
  fewer states to reason about, and `state.json` stays fresh for T10's `read_state`. Worst case for
  ordering: a GET racing a POST reads the log before the new line and returns the state one event behind;
  the next GET is right. No caller in T4 depends on read-after-write across two requests except the test,
  which awaits the POST first.
- **Q6 Reference sheets' links.** The ticket says "lessons (quiz section only)"; the reference sheets'
  stylesheet link is equally broken (`../assets/style.css`, 21 files). Recommended: rewrite links in both
  (Task 3), nothing else in the sheets.
- **A1** The donor folder has not changed since T3's copy (`observed`: `e1/assets/quiz.js` is identical
  to the donor's; lessons were copied byte for byte per the T3 report).
- **A2** `topics.json` `aliases[0]` is the generator key for every row (`observed`: 21 rows, 21 `GEN`
  keys, one alias each).
- **A3** Biome 2.5 checks `app/*.html` and passes a plain document (`observed` on a probe). If a real
  lesson-sized page trips it, exclude `app/*.html` and say so.

## NOTES (open canvas)

**Probes run while planning (2026-09-27, Bun 1.3.4, macOS):**

- Compiled binary: `import.meta.dir` = `/$bunfs/root`, `Bun.main` = `/$bunfs/root/<bin>`,
  `process.execPath` = the binary's real path, `process.cwd()` = wherever it was launched. Under
  `bun x.ts`: `import.meta.dir` = the source folder, `process.execPath` = the bun binary.
- `Bun.serve({ routes, fetch })`: GET route hit; POST to a GET-only route fell through to `fetch`;
  `Bun.file(dir).exists()` false; content types from extension as listed above.
- `new URL("http://x/../a").pathname` and `.../%2e%2e/a` both give `/a`: the URL parser resolves dot
  segments, encoded or not. The static guard's normalise is for what decodes late (`%2f`) and for belt
  and braces.
- `Bun.spawn` with `env: { PATH: emptyDir }` throws synchronously `Executable not found in $PATH`;
  `Bun.which("ls", { PATH: emptyDir })` is null. So R2-3's `env` option is a real fix, and the review's
  earlier "still found `open` with PATH=src/" was about the default env being inherited when `env` is not
  passed.
- Biome on a probe `app/`: "Checked 2 files", one warning (`noUnusedVariables`) on the JS, nothing on the
  HTML. `noVar` did not fire.

**Why not `src/api/static.ts`:** the static handler is 15 lines and has one caller; it lives in
`server.ts` beside the ladder. T5, T8 and T10 each add one entry to `routes`, as the ticket file says.

**Why `data-items` and not `data-topic`:** the browser would otherwise need the `itemsFileName` rule
(`/` → `-`) and the subject folder. A URL on the section keeps the file-naming rule in one place
(`pack.ts`) and lets a science lesson point at `/content/science/items/...` with no change to `quiz.js`.

**Why the strip is a script with a fixed-point test, not a hand edit:** 42 files, seven rewrites each,
and the test turns "converted once" from a sentence in a reference doc into a gate: any `.q` block or
`../assets` link that comes back with a future lesson copy goes red.

**`norm` and `lcg` exist twice** (TS in `src/`, JS in `app/`). CLAUDE.md forbids a bundler, so the browser
copy cannot import the TS one. The two parity tests in `quiz.test.ts` are the contract; a change to
either side without the other goes red.

**Sizes, `expected`:** `server.ts` ~150 lines, `api/` ~90 + ~200 tests, `quiz.js` ~320, `practice.js`
~60, two pages ~130, `style.css` 328 (copy), strip script ~80 + ~90 tests, server tests ~180; lessons
−~1,050 lines (21 × ~50), reference sheets ±42. Net added ~1,700 including the CSS copy; the ticket's
800-1,200 estimate did not count the CSS or the lesson deletions.

**Sonar:** the static path is the one user-controlled path; the PR body names the normalise-then-join line
and `server.test.ts` 2 as the answer to a "path traversal" alert, the way PR #23's fixes report did for
`--data`.

## AMENDMENTS

(none yet)
