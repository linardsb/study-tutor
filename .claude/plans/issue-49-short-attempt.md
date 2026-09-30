# Feature: short items get an attempt that code cannot mark (`attempt@2`, `correct: null`)

The following plan should be complete, but validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils, types and models. Import from the right files.

Worktree: `~/Desktop/study-tutor-issue49` on `feature/issue-49-short-attempt` (branched from `origin/main` at `0f35cb0`, T17 merged). Plan, commits and PR from there, not the main checkout.

## Feature Description

A `short`, `extended` or `practical-method` item has a `mark_scheme` and no `answers`. Code cannot mark it, so today the lesson quiz drops it (`app/quiz.js:269-272`), and nothing else can write an attempt for it. Teach-back (`src/flow/chat.ts:111-114`) and examiner mode (`src/flow/examiner.ts:45`) both refuse until an `attempt` event exists for the item. `AttemptV1.correct` is `boolean` (`src/events/types.ts:32-39`), so there is no honest way to record "answered, not marked".

This ticket adds `attempt@2`, whose `correct` may be `null` (answered, not marked in code). Replay skips a null attempt for calibration and `confidentWrong`, and still counts the day as work. The lesson quiz renders an answer-less item as a text box with Sure / Not sure. Saving it posts `attempt@2` with `correct: null`, then shows a link to the teach-back chat. The chat already marks against `mark_scheme ?? working` (`src/jobs/teachback_mark.ts:27-35`).

After T16, `content/science/items/8464-4.1.1.2.json` item `#6` is a `short` item with a 2-mark `mark_scheme`. It is validated but never asked. After this ticket the pupil can answer it and get it marked.

## User Story

As a pupil on the science lesson
I want to write my answer to the explain-why question and have it marked
So that written questions count as practice and I get feedback against the mark scheme, not just the one-word questions.

## Problem Statement

A written-answer item cannot be attempted. Every model surface that could mark it is gated on an `attempt` event, and the only attempt shape forces `correct: true | false`. The obvious workaround is to post `correct: false`. That would record an unmarked answer as wrong, with two effects: `calibration` counts it in `sureWrong`/`unsureWrong`, and a Sure answer lands in `confidentWrong`, which feeds the boss pick (`src/flow/boss.ts:40-41`).

## Solution Statement

1. **Event.** Add `AttemptV2 = Line<"attempt", 2> & {item, topic, correct: boolean | null, sure, answer, seed?}`. The only difference from v1 is that `correct` may be `null`. Add `FIELDS`, `KEYS` and a reducer case. `attempt@1` is unchanged and still refuses `null`.
2. **Reducer.** Pull the `attempt@1` body out into one helper `attempt(s, e)` for both versions. When `e.correct === null` it runs `topic()` and `work()` and returns before the calibration and `confidentWrong` lines. The v1 body cannot be reused as it stands: `null` is falsy, so a Sure null attempt would go to `sureWrong++` and into `confidentWrong`. That is the worst case the issue names.
3. **Quiz.** In `app/quiz.js`, an item with no `answers` and a `mark_scheme` is rendered by a new `buildOpen`. It has a textarea, Sure / Not sure and a "Save my answer" button. It posts `{v: 2, type: "attempt", correct: null, ...}` once, stays out of the score line, never shows `working` in the page, and shows the chat link only after the tutor has accepted the attempt. Markable items keep posting `v: 1` as today.
4. **No job or prompt change; one response field added.** `GET /api/chat` gains `type` (question-side data on `ItemView`, no answer field) so the chat page can word its teach-back label (Tasks 8b–8c). `/api/event` accepts `attempt@2` through `appendEvent` → `parseEvent` without a change, and `xpFor` keys on `type`, so the pupil earns the 10 XP for an attempt. That is intended: XP is for effort, not correctness (`src/flow/xp.ts:9`). `hasAttempt` (`src/jobs/view.ts:17-27`) matches `e.type === "attempt"` whatever `v` is, so a v2 line unlocks the item for post-attempt jobs.

**Guard (CLAUDE.md "Restate the guard").** No job, prompt or `src/mcp` file changes. The one route change adds `type` to the `getChat` body. `type` is on `ItemView` (`src/content/types.ts:53-56`) and is already in every pre-attempt prompt, so it reveals nothing. The existing `ANSWER_KEYS` loop in `chat.test.ts` still asserts no answer field reaches the page. `mark_scheme` and `working` still reach a prompt only through `jobItem` (`src/jobs/view.ts:30-39`). That hands out the full `PostAttempt` item only when `hasAttempt` finds an `attempt` line for the item id in the log, and it finds a v2 line the same way it finds a v1 line. Before that line exists, `chat()` refuses `teachback_mark` with `attempt-first`, and `guess_first`/`hint` get `toItemView`, which strips `answers`, `working`, `mark_scheme` and `misconceptions`. MCP `write_event` still cannot write any attempt (`MCP_WRITABLE.attempt = false`, `src/mcp/tools.ts:36`). Task 7 pins this with a test through `postChat`: the provider request body holds no `mark_scheme` text before the v2 attempt and does hold it after.

## Out of Scope / Non-Goals

- Not included: marking the null attempt afterwards. A later `teachback@1` does not rewrite or fill in the attempt: the log is append-only, so the attempt stays `correct: null` for good. **Owed by #53** (feed the teach-back result into calibration).
- Not changing: boss, cold re-test, squad, detective, coach and the intake diagnostic. They keep skipping items with no `answers`, because their scores are marked in code. `app/retest.js`, `app/squad.js`, `app/intake.js` and `src/flow/boss.ts` are untouched.
- Not changing: `teachback_mark` or its prompt. `teachback@1.of` is the number of lines the pupil writes, not the 2 marks in the scheme (`src/flow/chat.ts:144-153`). **Owed by #52** (score per scheme point). The chat label *is* in scope: Tasks 8b–8c.
- Not changing: which version markable items post. `quiz.js`, `api/coach.ts`, `synth-events.ts` and the fixtures keep `attempt@1`.
- Not included: a server-side refusal of `correct: null` for an item that has `answers`. `postEvent` has no item table (`src/api/event.ts:66-97`), and the page is already trusted to mark v1 attempts. A null on a markable item would still unlock it exactly as any v1 attempt does.
- Not included: pre-filling the chat's teach-back box with the quiz answer.
- Not changing: `State` shape. No new state key, so `shape` stays `6`.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Low to Medium (expected ~250–400 lines including tests)
**Primary Systems Affected**: `src/events` (types, replay), `app/quiz.js`, `src/api/chat.ts` (one response field), `app/chat.js` (one label), `.claude/references/events.md`
**Dependencies**: none new

## Related Work

**Implements**: #49 · **Epic**: #1 (`docs/prd/study-tutor-v2.architecture.md`, D3 events, D5 item types)

**Back-references**:

- `.claude/plans/t2-events-append-replay.md`: the reducer table, fixture per event version and the rule that a shape change is a new `v`.
- `.claude/plans/t9-model-jobs.md`: `jobItem`/`hasAttempt` branding, which is the guard this ticket relies on unchanged.
- `.claude/plans/t16-science-pack-oak.md`: added item `#6`; its report named this gap.

**Forward-references**:

- #52: teach-back scored per mark-scheme point, out of the scheme's total.
- #53: a null attempt's teach-back result feeds calibration.

---

## CONTEXT REFERENCES

### Relevant Codebase Files (read before implementing)

- `src/events/types.ts` (lines 32-39 `AttemptV1`; 121-133 `Event` union; 176-182 `FIELDS["attempt@1"]`; 250-263 `KEYS` and the `_complete` check at 264-268). Why: every table needs an `attempt@2` key, and `tsc` fails until all three have it.
- `src/events/replay.ts` (lines 99-122 `"attempt@1"` case; 85-86 `CASES` typed `{ [K in EventKey]: ... }`). Why: the reducer to split into a shared helper.
- `src/events/append.ts` (lines 60-78). Why: `appendEvent` copies `KEYS` fields and drops only `undefined`, so `null` survives. Task 4 pins that with a test.
- `src/events/types.test.ts` (line 33). Why: the case `"an unknown version"` builds a **v2 attempt**. After this ticket it parses, so it must move to `v:3`.
- `src/events/replay.test.ts` (lines 102-117, the `bad` line at 105). Why: "bad lines are skipped and counted" uses a `"v":2` attempt as an unreadable line and asserts `skipped` is 5. After this ticket that line parses, so it must move to `"v":3`. (Observed by grep: those are the only two tests using a v2 attempt as invalid. `src/flow/squad.test.ts:139` `file({ v: 2 })` is the squad file's version, which is unrelated.)
- `src/events/replay.test.ts` (lines 119-130). Why: the fixture test over `EVENT_KEYS`, and where the new reducer test goes.
- `src/events/__fixtures__/attempt.v1.jsonl`. Why: fixture shape to mirror.
- `src/api/event.ts` (lines 25-58 `refusal`, `appendXp`). Why: confirms v2 needs no route change and gets its xp line.
- `src/api/event.test.ts` (lines 1-20, 92-101). Why: `withTemp`, `topics`, `AT` pattern for the new 201 + xp test.
- `src/jobs/view.ts` (lines 17-39). Why: the guard. Read it, do not change it.
- `src/flow/chat.ts` (lines 103-155). Why: the refusals and the teach-back record.
- `src/api/chat.ts` (lines 48-135) and `src/api/chat.test.ts` (lines 1-20, 55-100). Why: `getChat`/`postChat` and the test pattern (`withData`, `mockFetch`, `chatReply`, `NOW`).
- `src/jobs/__fixtures__/provider.ts` (lines 11-120). Why: `withData`, `OPENAI`, `NO_MODEL`, `mockFetch`, `chatReply`, `attemptLine` (which builds `v:1`).
- `src/api/case.ts` (lines 44-90 `loadPacks`). Why: the merged pack that the chat route uses (`src/server.ts:335`, `:433-441`), which holds the science item. Tests must use `loadPacks()`, not `loadCasePack("maths")`.
- `app/quiz.js` (whole file; 107-127 `postAttempt`, 139-201 `buildItem`, 266-414 `initQuiz`). Why: the page to extend.
- `src/marking/retest-dom.test.ts` (lines 1-80) and `src/marking/dom.ts` (exports `doc`, `El`, `keyEvent`, `until`). Why: the happy-dom test pattern. No DOM test for `quiz.js` exists yet.
- `src/marking/squad-dom.test.ts` (lines 109-112). Why: the `?dom` import comment and form.
- `content/science/items/8464-4.1.1.2.json`. Why: 6 items (observed): `#1`–`#5` have `answers`, `#6` is `short` with `mark_scheme`.
- `content/science/lessons/0001-8464-4.1.1.2-animal-and-plant-cells.html` (lines 58-61). Why: the quiz section the manual check uses.
- `src/content/packs.test.ts` (line 75). Why: it already guarantees an item without `answers` has a non-empty `mark_scheme`.
- `.claude/rules/content.md`. Why: register for the new pupil-facing strings.

### New Files to Create

- `src/events/__fixtures__/attempt.v2.jsonl`: one `correct: null` line and one `correct: true` line with a `seed`.
- `src/marking/quiz-dom.test.ts`: the lesson quiz under happy-dom against the science items file.
- `src/marking/chat-dom.test.ts`: the chat page's teach-back label for a written-answer item.

### Relevant Documentation

- `.claude/references/events.md`: sections "Event line", "Replay" and "Tests". Why: the version rule, the fixture-per-version rule and the DOM test rule. Task 9 updates it.
- `.claude/references/model-jobs.md`: skim only. Nothing there changes, and the guard is restated above.
- No external library docs needed: no new dependency, and happy-dom is already in use.

### Patterns to Follow

**Event version entry** (mirror `photo@1`'s optional-field style in `FIELDS`):

```ts
"attempt@2": (o) =>
  str(o.item) &&
  str(o.topic) &&
  (bool(o.correct) || o.correct === null) &&
  bool(o.sure) &&
  str(o.answer) &&
  optInt(o.seed),
```

**Reducer helper.** Types from `EventByKey`, and the same `topic()`/`work()` calls as the other cases:

```ts
/** attempt@1 and attempt@2. A null `correct` (answered, not marked in code) is work, and says nothing about calibration or confident-wrong. */
function attempt(s: State, e: EventByKey["attempt@1"] | EventByKey["attempt@2"]): void {
  topic(s, e.topic);
  work(s, e.t);
  if (e.correct === null) return;
  // ... the existing attempt@1 body from `const week =` down, unchanged
}
// in CASES:
"attempt@1": attempt,
"attempt@2": attempt,
```

**Comment style.** One-line JSDoc above exported and non-trivial functions, and inline `//` for a why. No banners. Match `replay.ts`.

**Browser code.** Plain JS inside the IIFE, `textContent` for every string, and nothing touches `document` at load time (`quiz.js` header, lines 1-6). The new function goes on `root.quiz` only if the test needs it; the DOM test drives the page and does not need it.

**Pupil-facing strings.** Sentence case, British English, no exclamation marks. Each passes `no-ai-slop` then `humanizer` before it is saved (CLAUDE.md "Prose is a gate"). Draft strings are in Task 8.

---

## IMPLEMENTATION PLAN

### Phase A: Event version (`src/events`)

Add `attempt@2` to types, parser, keys, reducer and fixtures. The compile-time tables force the three keys together.

### Phase B: Route and guard tests (`src/api`, `src/jobs`)

**Depends on:** Phase A.
No production change. Tests pin that `/api/event` takes v2 with its xp line, and that `hasAttempt` and the chat unlock on v2.

### Phase C: Lesson quiz (`app/quiz.js`)

**Depends on:** Phase A (the server must accept the v2 body for the DOM test's fake server to mirror it honestly).
**Independent of:** Phase B.

### Phase D: Docs and gate

`events.md`, then `bun run check`.

---

## STEP-BY-STEP TASKS

### Task 1. UPDATE `src/events/types.ts`: `AttemptV2`

- **IMPLEMENT**:
  - Add `export type AttemptV2 = Line<"attempt", 2> & { item: string; topic: string; correct: boolean | null; sure: boolean; answer: string; seed?: number };`, with the comment `// correct: null = answered, not marked in code (a short, extended or practical-method item); a teach-back marks it later.`
  - Add `| AttemptV2` to `Event` after `AttemptV1`.
  - Add `FIELDS["attempt@2"]` as in Patterns.
  - Add `KEYS["attempt@2"]: ["item", "topic", "correct", "sure", "answer", "seed"]`.
  - Keep table order: each `attempt@2` entry goes directly after `attempt@1`, because `EVENT_KEYS` is "in table order".
- **PATTERN**: `src/events/types.ts:32-39`, `:176-182`, `:252`.
- **GOTCHA**: `EVENT_TYPES` does not change, since `"attempt"` is already in it. `CASES` in `replay.ts` will now fail `tsc` until Task 3. That is expected, so run Task 1's VALIDATE after Task 3, or accept the one error.
- **VALIDATE**: none on its own. `tsc` is red until Task 3 adds the `CASES` key (the table is typed `{ [K in EventKey]: … }`, `replay.ts:85`). Run Task 3's VALIDATE.
- **SATISFIES**: AC 1.

### Task 2. CREATE `src/events/__fixtures__/attempt.v2.jsonl`

- **IMPLEMENT**: two lines:
  ```
  {"v":2,"t":"2026-10-06T16:10:00Z","type":"attempt","item":"8464/4.1.1.2#6","topic":"8464/4.1.1.2","correct":null,"sure":true,"answer":"They are underground so there is no light."}
  {"v":2,"t":"2026-10-06T16:11:00Z","type":"attempt","item":"maths/U349/g","topic":"1MA1/R9","correct":true,"sure":false,"answer":"12","seed":8812}
  ```
- **PATTERN**: `src/events/__fixtures__/attempt.v1.jsonl`.
- **VALIDATE**: `bun test src/events/types.test.ts src/events/replay.test.ts -t "attempt@2"`. Both "fixture for attempt@2 …" cases pass once Task 3 is in.
- **SATISFIES**: AC 1, AC 7.

### Task 3. REFACTOR + ADD `src/events/replay.ts`: shared `attempt` helper, `attempt@2` case

- **IMPLEMENT**:
  - Move the body of `CASES["attempt@1"]` (lines 99-122) into a module-level `function attempt(s, e)`, placed after `work()`. Add the early `if (e.correct === null) return;` after `topic(); work();`.
  - Set `"attempt@1": attempt, "attempt@2": attempt`.
  - The v1 path is behaviour-identical: `topic`, `work`, calibration and `confidentWrong`, in the same order.
- **PATTERN**: `topic()`/`work()` helpers at `replay.ts:68-84`.
- **GOTCHA**: The name `attempt` is free in `replay.ts`: grep shows only the `"attempt@1"` key and a comment (observed). `CASES` is typed per key. `attempt` takes the union `EventByKey["attempt@1"] | EventByKey["attempt@2"]`, which is assignable to each entry's parameter. Do not bump `State.shape`: no state key changes.
- **VALIDATE**: `bunx tsc --noEmit && bun test src/events`
- **SATISFIES**: AC 2.

### Task 4. UPDATE tests in `src/events`: parser, append, reducer

- **IMPLEMENT**:
  - `types.test.ts:33`: change the `"an unknown version"` case to `.replace('"v":1', '"v":3')`, since v2 is now known.
  - `replay.test.ts:105`: change the `bad` array's `"v":2` attempt to `"v":3`. Otherwise it parses as a valid `attempt@2`: `skipped` drops to 4, and the six-week state gains an attempt on topic `1MA1/R9`. Add a `test.each` for attempt shapes (`const A2 = VALID_ATTEMPT.replace('"v":1', '"v":2')`):
    - v2 `correct:null` → parses
    - v2 `correct:false` → parses
    - v2 `correct:"null"` → refused
    - v2 with `correct` missing → refused
    - **v1 `correct:null` → refused**
  - `append.test.ts`: `appendEvent(data, {v: 2, type: "attempt", item, topic, correct: null, sure: false, answer: "x", bogus: 1} as NewEvent, AT)`. The written line contains `"correct":null` and not `bogus`, and `parseEvent` of it has `correct === null`.
  - `replay.test.ts`, new test `"attempt@2: a null attempt counts the day and nothing else; a boolean v2 replays as v1"`:
    1. Start from a v1 Sure-wrong line for item X in week W, which sets `confidentWrong[X]` and `calibration[W].sureWrong = 1`.
    2. Append a v2 Sure `correct:null` line for X on a **different London day** of the same week.
    3. Assert that `calibration` and `confidentWrong` are `toEqual` to the state after step 1, and that `flame[W]` gained the second day and `topics[topic]` exists.
    4. Separately, `replay([v2 true line])` equals `replay([the same line with v:1])` apart from `hash`.
- **GOTCHA**: this test must go red under the naive reducer. The mutation to run is `"attempt@2": CASES["attempt@1"]`-equivalent, meaning Task 3's helper without the `null` return. Under it, `sureWrong` becomes 2 and `confidentWrong[X].answer` becomes the null line's answer, and the assertion must fail. The boolean-v2 half must stay green under the same mutation (it does not exercise null). Record both results.
- **VALIDATE**: `bun test src/events`. Then delete the `if (e.correct === null) return;` line, run `bun test src/events/replay.test.ts -t "attempt@2"`, and record: the null test red, and the boolean-v2 half of the same test **not** red if split into its own `test` (split them so the claim is checkable). Restore the line.
- **SATISFIES**: AC 1, AC 2.

### Task 5. ADD test in `src/api/event.test.ts`: v2 post → 201 + xp

- **IMPLEMENT**: `postEvent({v: 2, type: "attempt", item: "1MA1/R9#1", topic: <a maths topic id or U-code from topics>, correct: null, sure: true, answer: "because"}, data, topics, AT)` returns 201. `readLines(data)` has 2 lines: the attempt with `"correct":null`, then `{"v":1,…,"type":"xp","amount":10,"reason":"attempt"}`.
- **PATTERN**: `src/api/event.test.ts:92-101` (`withTemp`).
- **GOTCHA**: 10 is `XP.attempt` (observed, `src/flow/xp.ts:11`). Assert against `XP.attempt`, not a literal, if the file already imports it; otherwise use the literal with that citation in the test name.
- **VALIDATE**: `bun test src/api/event.test.ts`
- **SATISFIES**: AC 3.

### Task 6. ADD test in `src/jobs/view.test.ts`: `hasAttempt` accepts v2

- **IMPLEMENT**: `hasAttempt([v2 null line for id I], {id: I})` is `true`. A v2 line for a `#gen` id with seed 5 unlocks `{id, seed: 5}` and not `{id, seed: 6}`.
- **PATTERN**: the existing `hasAttempt` tests in `src/jobs/view.test.ts`.
- **VALIDATE**: `bun test src/jobs/view.test.ts`
- **SATISFIES**: AC 4.

### Task 7. ADD test in `src/api/chat.test.ts`: the science short item through the chat, guard restated

- **IMPLEMENT**: one test, `withData(OPENAI, …)`, using `const { pack: all } = await loadPacks();` (import from `./case`). `ID6 = "8464/4.1.1.2#6"`. Steps:
  1. `getChat(data, all, ?item=ID6)` → 200, `attempted: false`, and none of `ANSWER_KEYS` in the body.
  2. `postChat({job: "teachback_mark", item: ID6, text: "x"})` → 409 `"Try the question first."`, and `calls.length === 0`.
  3. `postChat({job: "guess_first", item: ID6, text: "no light"})` with `mockFetch(chatReply('{"text":"Think about where the cell is."}'))`. The request body (`calls[0].init.body`) contains neither `mark_scheme` text (`"photosynthesis needs light"`) nor `working` text (`"only useful for photosynthesis"`).
  4. `postEvent({v: 2, type: "attempt", item: ID6, topic: "8464/4.1.1.2", correct: null, sure: true, answer: "no light underground"}, data, all.topics, NOW)` → 201.
  5. `getChat` → `attempted: true`, still no `ANSWER_KEYS`.
  6. `postChat({job: "teachback_mark", item: ID6, text: "They are underground\nNo light for photosynthesis"})` with `chatReply('{"lines":[{"mark":1,"note":"Right place."},{"mark":1,"note":"Right reason."}]}')` → 200 `kind: "marks"`, `score: 2`, `of: 2`, `saved: true`. The provider request body **does** contain `"photosynthesis needs light"`, and the log now ends with `teachback` then `xp`.
- **PATTERN**: `src/api/chat.test.ts:55-100`. `mockFetch` returns `{f, calls}`, and `deps = {dataDir: data, fetch: f, now: NOW}`.
- **SPIKE (observed, 2026-09-30, a scratch test in this worktree, since deleted).** These steps were run against current `main`, with a `v:1` attempt standing in for step 4 because only the parser differs:
  - `getChat` → 200 `attempted:false`, title "Animal and plant cells".
  - `guess_first` → model text. Its request body held neither the mark-scheme text nor the working text.
  - `teachback_mark` before the attempt → 409.
  - `postEvent` → 201.
  - `teachback_mark` with the replies above → `score 2`, `of 2`, `saved: true`. The request body held `"photosynthesis needs light"`.
  - The log was `usage,attempt,xp,usage,teachback,xp`.
  - So the reply guard passes those notes, and `loadPacks()` from the worktree root holds the science item.
- **GOTCHA**: the notes must not contain a number or a phrase from the mark scheme that the pupil's lines lack. The reply guard (`sources` in `teachback_mark.ts:62-67`) would reject it as `guard` and the verdict would be `no-verdict`. Keep the notes as above. If `guess_first`'s validator needs a different JSON shape, read `src/jobs/guess_first.ts` and match it; the point of step 3 is the request body, not the reply.
- **VALIDATE**: `bun test src/api/chat.test.ts`. Then temporarily point Task 1's `FIELDS["attempt@2"]` at `bool(o.correct)` only. The test goes red at step 4's `expect(201)` (a 400). Record only that, because steps 5 and 6 do not run after it. Then restore. The claim that a v2 line unlocks the chat is proved by step 6 on the unmutated code and by Task 6.
- **SATISFIES**: AC 4, AC 5.

### Task 8. UPDATE `app/quiz.js`: an answer-less item is saved, not marked

- **IMPLEMENT**:
  - **`postAttempt`**: add an optional `v` argument, `postAttempt(item, ok, sure, typed, v = 1)`, and put `v` in the body. The open item calls it with `ok = null, v = 2`. Keep one function, not a copy.
  - **`buildOpen(item, number)`**, a new function beside `buildItem`. It builds a `.q.open` element with:
    - the stem (`${number}. ${item.stem}`) and the figure if present, same code as `buildItem`;
    - `<label>Your answer <textarea rows="4"></textarea></label>`;
    - a button `.check` reading "Save my answer";
    - `p.feedback` (hidden);
    - the same "Ask the tutor" `p.ask` link as `buildItem`, for `guess_first`/`hint` before the attempt;
    - a hidden `p.marked` holding an `a` (target `tutor`, `href = chatHref(item)`) that reads "Get it marked by the tutor".
    - **No** `.working` element and no hint element. The working must not reach the page before the teach-back, because teach-back shows it after marking (`app/chat.js:76-77`).
  - **`initQuiz`**:
    - Compute `open = (all || []).filter((i) => !(Array.isArray(i.answers) && i.answers.length > 0) && typeof i.mark_scheme === "string" && i.mark_scheme !== "")`.
    - Change the early return to `if (!section || section.dataset.inited || (!items.length && !open.length)) return;`.
    - Render `items` exactly as today, then `open` numbered `items.length + 1 …`, then append `summary`.
    - `done`/`right`/`finished` count only `items`, so `render()` does not change.
    - Update the comment at line 268 to say answer-less items are saved for the tutor to mark.
  - **Per open item**:
    - Inject the same Sure / Not sure radios (reuse the `name` scheme with its index).
    - On a click of the button (no keyboard shortcut: Enter in a textarea stays a new line):
      - If already `.done`, return.
      - If the text is empty after trim, show "Write an answer first, even a guess." (existing string).
      - If no confidence is picked, show "Sure or not sure first" (existing string).
      - Otherwise disable the button and `postAttempt(item, null, sure, text, 2)`.
    - When `saved`:
      - add `done`;
      - disable the textarea, the radios and the button;
      - set the feedback to "Saved. This page cannot mark a written answer. Open the tutor and explain your answer there, one point per line, to get it marked." (checked against the slop blacklist at planning; the implementer runs `no-ai-slop` then `humanizer` on save as CLAUDE.md requires, and reports any change in the PR body);
      - unhide `p.marked`.
    - When not saved: set the feedback to the `NOT_SAVED` text without its leading space, re-enable the button, and leave the item open for a retry. Without the attempt line the chat refuses (`attempt-first`), so a lost post must be retryable, unlike the markable items' post-once rule.
- **PATTERN**: `buildItem` (`quiz.js:139-201`), the radios (`:342-353`), `chatHref` (`:103-110`) and `NOT_SAVED` (`:112`).
- **IMPORTS**: none (IIFE).
- **GOTCHA**:
  1. The link must appear only after the post resolves `ok`. `getChat` reads `attempted` when the chat page loads (`src/api/chat.ts:76`). A click before the line lands would open the chat on the pre-attempt forms.
  2. Do not add a `sure` default. The schema requires it, and the pupil's bet is the point of the radios.
  3. `norm()` is for markable answers; for the empty check use `text.trim() === ""`, since `norm` strips commas and spaces, which is harmless here but misleading.
  4. The draft strings go through `no-ai-slop` then `humanizer` before saving (CLAUDE.md "Prose is a gate"). Record the final wording in the PR body.
- **VALIDATE**: `bun test src/marking` (existing `quiz.test.ts` stays green) and Task 9's DOM test.
- **SATISFIES**: AC 5, AC 6.

### Task 8b. UPDATE `src/api/chat.ts` `getChat`: return the item `type`

- **IMPLEMENT**: add `type: view.type` to the `getChat` body, next to `stem`. `type` is on `ItemView` (`src/content/types.ts:53-56` strips only `answers`, `working`, `mark_scheme` and `misconceptions`), so this is question-side data.
- **TEST**: in `chat.test.ts`, extend the existing `getChat` test's `toMatchObject` (`chat.test.ts:116-122`) with `type: "cloze"`, the type of `1MA1/R9/of-an-amount#1` (observed in `content/maths/items`). In Task 7 step 1, assert `type: "short"`. The existing `ANSWER_KEYS` loop still holds.
- **VALIDATE**: `bun test src/api/chat.test.ts`
- **SATISFIES**: AC 9.

### Task 8c. UPDATE `app/chat.js` `show()`: the teach-back label for a written answer

- **IMPLEMENT**: in `show(state)`, when `state.type` is `"short"`, `"extended"` or `"practical-method"`, set the teach-back label's text to "Explain your answer, one point per line." (checked at planning, and the gate runs again on save). Otherwise leave the markup's "Explain how you did it, one step per line." alone. Select the label with `document.querySelector('label[for="teach"]')` (`app/chat.html:51`). Use a `const WRITTEN = ["short", "extended", "practical-method"]` beside the other top-level `const`s.
- **GOTCHA**: the list mirrors the three job-marked types of `ItemType` (`src/content/types.ts:2-10`, comment line 1). Browser JS cannot import the TS union (CLAUDE.md: plain JS, same JSON shape), so the DOM test in Task 9b pins it.
- **VALIDATE**: Task 9b.
- **SATISFIES**: AC 9.

### Task 9. CREATE `src/marking/quiz-dom.test.ts`

- **IMPLEMENT**:
  - **Setup** (mirror `retest-dom.test.ts:1-80`):
    - `GlobalRegistrator.register({url: "http://127.0.0.1:4731/content/science/lessons/0001-8464-4.1.1.2-animal-and-plant-cells.html"})` and `afterAll(unregister)`.
    - Set `doc().body.innerHTML` to a `section.quiz[data-code="4.1.1.2"][data-items="/content/science/items/8464-4.1.1.2.json"]` holding an `h2` and an intro `p`.
    - A fake `fetch` that records calls. It serves the real items file for the `data-items` URL (read with `fs`). It answers `/api/event` by running the body through `parseEvent` on a stamped copy: 201 with the event when it parses, 400 when it does not, and 500 while a `failNext` flag is set.
    - `await import(\`${path.join(app, "quiz.js")}?dom\`)`, then `await until(() => doc().querySelectorAll(".q").length === 6)`.
  - **Cases**, in order:
    1. There are 5 `.q:not(.open)` and 1 `.q.open`. The open item has a `textarea` and no `.working` element. `document.body.textContent` holds neither the item's `working` nor its `mark_scheme`.
    2. Save with an empty box → "Write an answer first, even a guess.", no `/api/event` call. Type text, no radio → "Sure or not sure first", no call.
    3. With `failNext = true`: pick Sure, click → one call, the feedback says not saved, the button is enabled again, and `p.marked` is still hidden.
    4. Click again → second call. Its body is `{v: 2, type: "attempt", item: "8464/4.1.1.2#6", topic: "8464/4.1.1.2", correct: null, sure: true, answer: <typed>}`. The item is `.done`, `p.marked` is visible, and its `a.href` ends with `/chat.html?item=8464%2F4.1.1.2%236`. The body text still holds neither `working` nor `mark_scheme`. A third click makes no call.
    5. Answer the 5 markable items with their first `answers` entry and Not sure. The score line reads `5/5 on 4.1.1.2. No wrong answers.` (derived: 5 markable items, all right, 0 wrong → the `render()` tail at `quiz.js:318-322`). Each posted body has `v: 1` and a boolean `correct`.
- **PATTERN**: `src/marking/retest-dom.test.ts`; `until`/`doc` from `src/marking/dom.ts`; the `?dom` comment from `squad-dom.test.ts:109`.
- **GOTCHA**:
  - `quiz.js` calls `start()` at import when `readyState !== "loading"`. The body and the fake `fetch` must be in place **before** the import. `quiz.test.ts` imports `quiz.js` without `?dom`, which is why the query is needed.
  - **`tsconfig` has no DOM lib** (`src/marking/dom.ts:1-5`). `HTMLElement`, `HTMLInputElement`, `doc().createElement` and `doc().readyState` all fail `tsc` (observed: 6 TS2304/TS2339 errors in the spike). Use `El` and `doc()` from `./dom`.
  - To tick a radio, cast as `intake-dom.test.ts:141` does: `(r as unknown as { checked: boolean }).checked = true`. `confidence()` reads `input:checked`.
  - The fake `fetch` returns `new Response(text, {headers: {"content-type": "application/json"}})` for the items file.
- **SPIKE (observed, 2026-09-30, a scratch test in this worktree, since deleted).** On current `main`, the harness above rendered the 5 markable `.q` items with `until`. After a radio was ticked and `.check` clicked, it posted `{"v":1,"type":"attempt","item":"8464/4.1.1.2#1",…,"correct":true,"sure":false}`, and `readyState` was `complete`. The mechanics are proven, and only the new open-item code is untested.
- Case 5 cannot fail on the answers: `mark()` compares `canon(typed)` with `canon(answers[i])`, so typing `answers[0]` always matches (derived, `quiz.js:80-89`).
- **VALIDATE**: `bun test src/marking/quiz-dom.test.ts`. Then comment out the `if (saved)` guard in the link reveal so the link shows at once, and confirm case 3 goes red. Restore.
- **SATISFIES**: AC 5, AC 6.

### Task 9b. CREATE `src/marking/chat-dom.test.ts`

- **IMPLEMENT**:
  - **Setup.**
    - `GlobalRegistrator.register({url: "http://127.0.0.1:4731/chat.html?item=8464%2F4.1.1.2%236"})` and `afterAll(unregister)`.
    - Set `doc().body.innerHTML` to the `<main>` of `app/chat.html`. Read it with `fs` and slice between `<main` and `</main>`, so the label markup is the real one.
    - A fake `fetch` answers `GET /api/chat?…` with a body whose `type` is set per case.
    - `await import(\`${path.join(app, "chat.js")}?dom\`)`.
  - **Wait before every assertion** on something `show()` does. Serve a per-case title (`T-short`, `T-cloze`) and `await until(() => doc().querySelector("#title")?.textContent === <title>)`. Without the wait, case 2 passes before the page has run.
  - **Case 1**: `type: "short"`, `attempted: true` → `label[for="teach"]` reads the written-answer text.
  - **Case 2**: for `type: "cloze"`, re-import with a second query (`?dom2`) after resetting the body. The label keeps the markup's text.
- **PATTERN**: `src/marking/parent-dom.test.ts:43` (a page imported with `?dom`); `until` from `./dom`.
- **SPIKE (observed, 2026-09-30, a scratch test in this worktree, since deleted).** This exact harness was run:
  - it fetched `/api/chat?item=8464%2F4.1.1.2%236` and set `#title` from the served body;
  - `#after` became visible, and the label read the markup's "Explain how you did it, one step per line.";
  - a second import with `?dom2` after a body reset ran the page again (a second fetch);
  - `tsc` was clean on that file.
- **GOTCHA**: `chat.js` reads `location.search` at load. The URL must be set in `register`, before the import. Each case needs a fresh import, because the page code runs once per module.
- **VALIDATE**: `bun test src/marking/chat-dom.test.ts`. Then set `WRITTEN = []` and confirm case 1 goes red and case 2 stays green. Restore.
- **SATISFIES**: AC 9.

### Task 10. UPDATE `.claude/references/events.md`

- **IMPLEMENT**:
  - Under "Event line", add: `attempt@2` = `attempt@1` with `correct: boolean | null`. `null` means answered but not marked in code (an item with no `answers`: `short`, `extended`, `practical-method`). The lesson quiz posts it for those items only, and markable items stay on `attempt@1`. Replay counts a null attempt as work (flame, topic) and skips it for `calibration` and `confidentWrong`. It unlocks the item for post-attempt jobs like any attempt, and the attempt is never marked afterwards.
  - Under "Tests", add a line naming `src/marking/quiz-dom.test.ts`.
- **VALIDATE**: `grep -n "attempt@2" .claude/references/events.md`
- **SATISFIES**: AC 8.

### Task 11. Gate

- **VALIDATE**: `bun run check` (tsc + biome + bun test), green. Then `bun scripts/test-generators.ts` for a sanity check; nothing in it should change.
- **SATISFIES**: AC 7.

---

## TESTING STRATEGY

### Unit tests

- Parser: `types.test.ts`, attempt shape table (Task 4).
- Writer: `append.test.ts`, `null` kept and stray field dropped (Task 4).
- Reducer: `replay.test.ts`, null skips calibration and `confidentWrong` and counts the day; boolean v2 equals v1 (Task 4). Fixture tests over `EVENT_KEYS` pick up `attempt@2` automatically.
- Guard: `view.test.ts`, `hasAttempt` on v2 (Task 6).

### Integration tests

- `event.test.ts`: `postEvent` v2 → 201 + xp line (Task 5).
- `chat.test.ts`: the full science path through `getChat`/`postChat`, with the provider request body checked before and after the attempt (Task 7).
- `quiz-dom.test.ts`: the page in the order the app runs it. The items file loads, the pupil types, picks Sure and saves, the attempt posts, and only then does the chat link appear (Task 9). The fake server parses the body with the real `parseEvent`, so a body the real route would refuse fails here too.

### Edge cases

| Edge case | Where verified |
|---|---|
| Sure + `null` does not enter `confidentWrong` or `sureWrong` | `replay.test.ts` (Task 4) |
| `attempt@1` with `correct: null` refused | `types.test.ts` (Task 4) |
| `correct: "null"` (string) refused | `types.test.ts` (Task 4) |
| `null` survives `appendEvent`'s field copy | `append.test.ts` (Task 4) |
| Null attempt still earns 10 XP (effort) | `event.test.ts` (Task 5) |
| Teach-back label for a written item, unchanged for others | `chat-dom.test.ts` (Task 9b) |
| `getChat` adds `type` and no answer field | `chat.test.ts` (Task 8b, the `ANSWER_KEYS` loop) |
| Chat link clicked before the attempt lands | `quiz-dom.test.ts` case 3 (link hidden until saved) |
| Failed post is retryable, then posts once | `quiz-dom.test.ts` cases 3–4 |
| `working`/`mark_scheme` never in the page | `quiz-dom.test.ts` cases 1, 4 |
| Open item not counted in the score line | `quiz-dom.test.ts` case 5 |
| `mark_scheme` absent from a pre-attempt prompt, present after | `chat.test.ts` (Task 7) |
| Enter in the textarea adds a new line, does not save | Level 4 step 3 (manual). No key handler is added, so it is browser default. |
| A quiz whose only items are answer-less still renders | Not reachable in current content; covered by the changed early-return condition, reviewed in the diff |

---

## VALIDATION COMMANDS

### Level 1: Syntax and style

```bash
bunx tsc --noEmit
bunx biome check .
```

### Level 2: Unit tests

```bash
bun test src/events src/jobs/view.test.ts
```

### Level 3: Integration tests

```bash
bun test src/api/event.test.ts src/api/chat.test.ts src/marking/quiz-dom.test.ts src/marking/chat-dom.test.ts
bun run check
```

### Level 4: Manual validation

Run from the worktree. The steps use no model (preset `none`), so they need no key.

1. `cd ~/Desktop/study-tutor-issue49 && mv data data.bak 2>/dev/null; bun run dev`. If the setup page opens, choose no model and save.
2. Open `http://127.0.0.1:<port>/content/science/lessons/0001-8464-4.1.1.2-animal-and-plant-cells.html` and scroll to "Try it". Six questions show, and the sixth has a text box and "Save my answer". No working is visible under it.
3. In question 6, type two lines (Enter makes a new line and does not save). Press Save with no Sure/Not sure: the prompt appears. Pick Sure and save. "Saved…" shows, with the "Get it marked by the tutor" link.
4. `tail -2 data/events.jsonl`: an `attempt` line with `"v":2` and `"correct":null`, then `xp` 10.
5. Click the link. The chat opens on "Explain your answer, one point per line". Enter two lines and press "Mark my steps". With no model the reply is "No marks this time. Compare your steps with the working:" and the working. Only now does the working appear.
6. `curl -s http://127.0.0.1:<port>/api/state | jq '.calibration, .confidentWrong'`: neither holds the short item.
7. Stop the server, then `rm -rf data && mv data.bak data 2>/dev/null`.

### Level 5: Additional (optional)

With a real key set up, repeat step 5. You get a per-line mark reply, "Saved to your record.", and a `teachback` line in the log.

---

## ACCEPTANCE CRITERIA

1. `attempt@2` exists: `correct: boolean | null`, with a fixture, `FIELDS`, `KEYS` and a reducer case. `attempt@1` still refuses `null`.
2. Replay: a null attempt counts the day in `flame` and creates the topic, and changes neither `calibration` nor `confidentWrong`. A boolean `attempt@2` replays as `attempt@1`. The test goes red under the naive reuse, and the run is recorded.
3. `POST /api/event` accepts `attempt@2` with `correct: null` and appends the 10 XP line.
4. `hasAttempt` and the chat's `attempt-first` refusal treat a v2 line as an attempt.
5. Guard: `mark_scheme` text is absent from every provider request before the attempt line exists and present in the teach-back request after it. This is tested, and the PR body restates it.
6. The lesson quiz renders an answer-less item with a `mark_scheme` as a text box with Sure / Not sure. It posts `attempt@2` `correct: null` once and never shows `working` or `mark_scheme`. It shows the chat link only after the save is accepted, and it stays out of the score line.
7. `bun run check` is green.
8. `.claude/references/events.md` documents `attempt@2`.
9. The chat's teach-back label reads "Explain your answer, one point per line." (final wording after the prose gate) for `short`, `extended` and `practical-method` items, and is unchanged for the others. `getChat` returns `type`, and still no answer field.
10. The deferred limits have owners: #52 (score per scheme point) and #53 (a null attempt's teach-back result into calibration).

---

## COMPLETION CHECKLIST

- [ ] Tasks 1–11 in order, each VALIDATE run
- [ ] Mutation runs in Tasks 4, 7 and 9 recorded (red where claimed, green where claimed)
- [ ] New strings passed `no-ai-slop` then `humanizer`
- [ ] `bun run check` green
- [ ] Level 4 steps 1–7 performed
- [ ] PR body restates the guard (CLAUDE.md)

---

## OPEN QUESTIONS / ASSUMPTIONS

- **Q1 (resolved: `attempt@2`).** `attempt@2` or widen `attempt@1` in place. The plan follows the issue and the CLAUDE.md ground rule (a shape change is a new `v`). `events.md` also allows editing a shape in place until the first GitHub release whose build can append it. `gh release list` returns nothing (observed, 2026-09-29), and `photo@1` was edited in place on 2026-09-29 for that reason. Editing `attempt@1` in place would save the fixture, the `KEYS`/`FIELDS` entries, the `v` argument in `quiz.js` and one `CASES` line, about 20 lines (expected). The cost is that `attempt@1` would mean different things in different builds. That does not matter before a release, but the issue asked for v2. The plan keeps `attempt@2`: the issue names it, and the ground rule has no exception clause in CLAUDE.md.
- **Q2: Sure / Not sure on an unmarked item.** The plan keeps the radios, because `sure` is a required field and a made-up value would be a false record. Replay ignores `sure` on a null attempt, so today the bet is recorded and not used. The worst case is that a pupil finds a bet on an unmarked question pointless. It never affects calibration. Dropping the radios would need `sure` to become optional in v2, which is a schema change for no reader.
- **Q3: XP for an unmarked attempt.** 10 XP, the same as any attempt, because XP is effort (`src/flow/xp.ts:9`). The worst case is XP farming by saving nonsense on the one short item. It is capped by the item count (1 item today, observed), the same exposure as typing any wrong answer into a markable item.
- **A1:** `/api/chat` resolves science items through `loadPacks` (verified, `src/server.ts:335`, `:433-441`), so the link works without a server change.
- **A2 (derived, no longer an assumption):** typing an item's `answers[0]` always marks right, because `mark()` compares canon to canon (`quiz.js:80-89`).

### Risk register

| Code | Risk | Status |
|---|---|---|
| R1 | Reusing the v1 reducer counts a Sure null as confident-wrong (`null` is falsy) | Closed by design. Task 3 adds the explicit `null` return. Task 4 has a mutation run that must go red, with the boolean-v2 half split so it stays green. |
| R2 | The working is shown before the teach-back and gets copied into it | Closed by design. `buildOpen` has no `.working` element. Task 9 cases 1 and 4 assert that neither the working nor the mark-scheme text is ever in the page. |
| R3 | Two existing tests use a v2 attempt as "invalid" | Closed. Both sites are named with fixes (`types.test.ts:33`, `replay.test.ts:105`). A grep of `src` found no third (observed). |
| R4a | Teach-back label reads "one step per line" for an explain-why question | Closed in scope: Tasks 8b, 8c and 9b. |
| R4b | Teach-back `of` = line count, not the scheme's 2 marks | Owned by #52 (a prompt change, so it gets its own guard restatement). |
| R4c | A null attempt is never scored for calibration | Owned by #53 (a change to what calibration means, so it needs an E5 decision first). |
| R5 | The happy-dom harnesses for `quiz.js` and `chat.js` are new | Closed by spikes (observed: both render and react; `tsc` gotchas recorded in Tasks 9 and 9b). |
| R7 | An exact-match assertion on the `GET /api/chat` body breaks when `type` is added | Closed. A grep found none: `chat.test.ts:116-122` is `toMatchObject`, `server.test.ts` only POSTs to `/api/chat`, and no reference doc lists the body's fields (observed). |
| R6 | The science item does not resolve in the chat, or the guard rejects the notes | Closed by spike (observed: Task 7's exact sequence passed on `main`). |

### Confidence

**10/10 (expected).** Every path this ticket touches has been run on current `main` except the new code itself:
- the `quiz.js` DOM harness;
- the `chat.js` DOM harness;
- the science item through `getChat` and `postChat`, including the reply guard and the request bodies before and after the attempt.

Every existing test the change breaks is named with its fix: `types.test.ts:33` and `replay.test.ts:105`. What is left unproven is the new `buildOpen` branch and the reducer's `null` return. Tasks 4, 9 and 9b test exactly those, with mutation runs that must go red.

## NOTES

- **Why the working stays hidden in the quiz.** For markable items, the working shows after the check because the pupil has already been marked. An open item is marked by the teach-back that comes after it. Showing the working first would let the pupil paste it into the teach-back and take full marks against a scheme it paraphrases. `chat.js` already shows the working after a verdict and after a no-verdict (`app/chat.js:76-77`, `:94-99`), so the pupil still sees it.
- **Why a helper rather than a second reducer body.** One body means a future change to calibration applies to both versions. The early return is the only difference, and it is the line the mutation run proves.
- **Why the fake server in the DOM test parses with `parseEvent`.** A fake that returns 201 for any body would pass a `v: 1, correct: null` post. That is exactly the bug the real route refuses, and it would leave the chat locked.
- **New reachable path, intended.** `lastAttempt` (`src/flow/examiner.ts:11-18`) can now return the short item, so `POST /api/snap` can mint a snap for it and `examiner_mark` marks the photo against `mark_scheme`. No code changes for this, and the same `hasAttempt` gate covers it. It is a new reachable path even though no code changed.
- **Rejected:** a separate `open` item page, or rendering open items in the chat panel only. Both move the answer box away from the lesson, where the issue asks for it, and the chat panel would need its own attempt writer.

## AMENDMENTS

- **2026-09-30, implementation (report `.claude/reports/issue-49-short-attempt-report.md`).**
  - **A1 (supersedes Task 1's file list).** `src/events/append.ts` also changed. With two `attempt` versions, `` KEYS[`${event.type}@${event.v}`] `` became a cross product of every type and `v`, and `tsc` failed (TS2551, `case@2`). The lookup reads through `KEYS as Record<string, readonly string[] | undefined>`. Behaviour unchanged.
  - **A2 (Task 8).** The open-item loop builds its own Sure / Not sure span with the same `name` scheme; no helper was extracted from the markable loop.
  - **A3 (Level 4).** Run headless: `bun src/server.ts --mcp` serves the same routes without opening a browser, and steps 2 (page 200), 4 and 6 went over `curl`, plus a v1 `correct: null` post refused with 400. The browser steps (typing, the link click, the label on screen) are covered by `quiz-dom.test.ts` and `chat-dom.test.ts`, not by hand.
  - **A4 (Task 8 GOTCHA 4).** `no-ai-slop` then `humanizer` ran on the four strings; no change to the plan's wording.
