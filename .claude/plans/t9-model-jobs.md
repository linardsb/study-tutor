# Feature: T9 model jobs: defineJob, guess_first, hint, teachback_mark, chat panel, reply guard

The following plan should be complete, but validate documentation, codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils, types and models. Import from the right files.

## Feature Description

The first three model jobs and the one place a pupil talks to them. `src/jobs/define.ts` wraps
`chatJson` (T8's provider seam) into a job: prompt, input shape, output shape validated in code, one
retry, then a deterministic fallback. Three jobs sit on it:

- `guess_first`: before the pupil tries an item, they write their guess at the method; the model says
  which part holds and names at most one next step. It never sees the answer.
- `hint`: before the pupil tries an item, a hint that names the next step. It never sees the answer.
  No model → the item's own `hint` from the content pack.
- `teachback_mark`: after the pupil has tried the item, they explain the method one step per line; the
  model marks each line 0 or 1 against the mark scheme with a short note. A verdict writes a
  `teachback@1` event and its XP line. No verdict → no event, and the page shows the worked solution.

Every reply passes a regex guard (emoji, exclamation marks, grade talk). A shadow-judge hook can log
`would_block` and never changes the result. `app/chat.html` is the panel, opened from each quiz item,
with "This is an AI" fixed on screen.

## User Story

As a pupil working through a lesson or a practice set
I want to guess the method, ask for a hint, and explain the method back to a tutor that marks it
So that I do the thinking myself, with feedback, and never get handed the answer before I have tried

## Problem Statement

T8 shipped the provider seam and nothing calls it. The flow runs with no model at all (T5), which is
the floor, but the three model moments the PRD and v1 relied on (guess first, a hint that is not the
answer, a marked teach-back) have no code. The one hard safety property, the answer withheld until an
attempt exists, is so far only a type (`ItemView`) that a full `Item` still satisfies structurally.

## Solution Statement

- A generic `defineJob` with a fixed retry and fallback policy, so every later job (T12 Dan, T13
  examiner, intake) gets the same behaviour for free.
- The answer guard moves from convention to construction: `src/jobs/view.ts` is the only producer of
  two branded types, `PreAttempt` (the runtime-stripped view) and `PostAttempt` (the full item, minted
  only when `hasAttempt` reads true from the event log). Pre-attempt jobs take `PreAttempt`;
  `teachback_mark` takes `PostAttempt`. A raw `Item` fits neither. Each prompt builds from named fields,
  never by spreading or stringifying the object.
- The call points live in `src/flow/chat.ts`: which job may run before and after an attempt, what a
  verdict writes, what the pupil sees on no verdict.
- `src/api/chat.ts` + two routes on `/api/chat`; `app/chat.html` + `app/chat.js`; one link per quiz
  item in `app/quiz.js`.

### The guard, restated (CLAUDE.md "Restate the guard")

For any item with `answers`, the answer enters a model prompt only after an `attempt` event for that
item exists. In T9 this holds by construction:

1. `guess_first` and `hint` take `PreAttempt`, which only `jobItem()` in `src/jobs/view.ts` can make,
   and it makes it with `toItemView` (`src/content/pack.ts:80`), which removes `answers`, `working`,
   `mark_scheme` and `misconceptions` at runtime.
2. `teachback_mark` takes `PostAttempt`, which `jobItem()` mints only when `hasAttempt(lines, item)`
   is true. For a generated item (`id` ending `#gen`) the attempt must match the id **and** the seed.
3. The prompt functions read `stem`, `scaffold`, `hint` and the topic title by name. Nothing spreads
   or `JSON.stringify`s an item.
4. The pre-attempt system message carries "Do not state the answer. The pupil has not attempted this
   yet." (`.claude/rules/content.md`). The post-attempt system message is a separate function without it.
5. A test hands a full `Item` with sentinel strings in `answers`, `working`, `mark_scheme` and
   misconception text through the pre-attempt path of both jobs and asserts no sentinel appears in the
   serialised messages.

## Out of Scope / Non-Goals

- Not included: `dan_wrong_step` (T12), `examiner_mark` and vision (T13), `intake_read`.
- Not included: a real shadow judge. T9 ships the hook and its logging. No judge model is configured
  anywhere, and no config field is added for one.
- Not included: a `would_block` event type or a parent-facing log of it (Q3).
- Not changing: `parseJsonReply` stays single-block (see "S2 question answered" in NOTES).
- Not changing: `src/flow/session.ts`. The ticket lists it for the call points; they go in a new
  `src/flow/chat.ts` instead (Divergence D1).
- Not included: chat memory across turns. Each request is one job call with no history.
- Not included: a chat entry point from the level map (T6) or from the case page.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: High
**Primary Systems Affected**: `src/jobs` (new), `src/flow/chat.ts` (new), `src/api/chat.ts` (new), `src/server.ts`, `app/chat.*` (new), `app/quiz.js`
**Dependencies**: none new. `chatJson` from T8, `postEvent` from T4, `xpFor` from T5.

## Related Work

**Implements**: [#11](https://github.com/linardsb/study-tutor/issues/11) · **Epic**: #1 · PRD `docs/prd/study-tutor-v2.prd.md` · Architecture `docs/prd/study-tutor-v2.architecture.md` (D2, D4, D11; PRD R3, R8) · Ticket file `docs/tickets/study-tutor-v2.md` (T9)

**Back-references**:

- `.claude/plans/t8-setup-config-provider.md`: `chatJson`, the `Failure` union, "no retry in the provider: the retry-once rule belongs to the job", and the finding that a shape check must enforce the entry count.
- `.claude/plans/t5-flow.md`: `xpFor`, and the "no model call anywhere in src/flow" test that T9 must keep green.
- `.claude/plans/t10-mcp-server.md`: `attemptedItems`, which T9 does not reuse for generated items (see Task 1 GOTCHA).
- `.claude/plans/t4-server-and-lesson-bridge.md`: `postEvent`, `refuseForeign`, the route table.

**Forward-references**:

- T12 (`dan_wrong_step`) and T13 (`examiner_mark`) build on `defineJob`, `PostAttempt` and the guard.

### Divergences from the ticket's file list (decided here)

- **D1** Call points go in `src/flow/chat.ts`, not `src/flow/session.ts`. Reasons: `session.ts` is
  documented pure ("no clock, no file") and replay imports it (`src/events/replay.ts:9`); the provider
  imports replay (`src/providers/openai-compatible.ts:3`). A job import in `session.ts` closes the loop
  `session → jobs → providers → replay → session`.
- **D2** `src/api/chat.ts` and two routes in `src/server.ts`. The panel cannot reach a job without them.
- **D3** `app/quiz.js` gains one link per item. Without it the panel has no way in.

---

## CONTEXT REFERENCES

### Relevant Codebase Files: read these before implementing

- `.claude/references/model-jobs.md`: the job-file shape, retry rule, guard order.
- `.claude/rules/content.md`: pupil-facing text rules and the exact guard line for pre-attempt prompts.
- `src/providers/openai-compatible.ts` (lines 6-34 types, 52-66 `parseJsonReply`, 76-82 `chatJson`, 112-200 `call`, 188-189 the `record` call): what a job gets back. `chatJson` never throws; every `ok:false` carries a `Failure`. Every 200 with an object body appends `usage@1` **before** parsing.
- `src/providers/openai-compatible.test.ts` (lines 17-65): `withData` (realpathed temp dir + `saveSetup`) and `mockFetch`. Mirror both in the new fixture.
- `src/content/types.ts` (lines 38-60): `Item`, `ItemView`. `ItemView` is a structural `Omit`, so a full `Item` is assignable to it. That is why the brands exist.
- `src/content/pack.ts:80`: `toItemView`, the runtime strip.
- `src/mcp/tools.ts:58-65`: `attemptedItems`, exact id match. Safe in MCP because `read_state` serves only items-file items. **Wrong for `#gen` items** (see Task 1).
- `app/quiz.js:63-76` (`itemFromGenerated`, every generated item has id `${topicId}#gen` plus `seed`), `app/quiz.js:81-99` (`postAttempt`, sends `seed` for generated items), `app/quiz.js:111-160` (`buildItem`), `app/quiz.js:442` (the `root.quiz` export the tests read), `app/quiz.js:166-185` (`buildQuiz`: `gens[code](lcg(seed))` with `code` = the topic's `aliases[0]`).
- `src/marking/quiz.test.ts` (lines 1-30): how a test imports `app/quiz.js` under Bun and reads `globalThis.quiz`.
- `src/flow/detective.ts:62-71` and `src/flow/boss.ts:63`: the generator lookup `pack.gens[topic.aliases[0] ?? ""]`, and the `eligible` check.
- `src/flow/properties.test.ts:219-233`: every non-test `src/flow/*.ts` must not match `from "../providers` and must not contain the word `fetch` anywhere, comments included.
- `src/flow/xp.ts:20`: `xpFor`; `XP.teachback = 15`.
- `src/api/event.ts:55-87`: `postEvent`. It resolves the topic, refuses what it must, appends, and appends the XP line. T9 reuses it for the `teachback@1` record rather than copying `appendXp`.
- `src/api/case.ts:20-36`: `loadCasePack` (topics, items per topic, generators).
- `src/server.ts:158-172` (`readRoute`), `191-230` (`apiRoutes`), `89-102` (`refuseForeign`).
- `src/server.test.ts:326-395`: the key-leak walk. It POSTs `{preset:"nope", key}` and GETs with no query to **every** route while a real `openai` config with a fake key is saved.
- `src/config.ts:133`: `readConfig` (null when no config; `preset: "none"` for no model).
- `src/events/types.ts:48-53`: `TeachbackV1` `{topic, item?, marks, of}`, marks ≤ of.

### New Files to Create

- `src/jobs/view.ts`: `PreAttempt`, `PostAttempt`, `hasAttempt`, `jobItem`.
- `src/jobs/guard.ts`: `guardReply`, `ShadowJudge`.
- `src/jobs/define.ts`: `defineJob`, `Verdict`, `JobDeps`, `preAttemptSystem`, `postAttemptSystem`, `PRE_ATTEMPT_GUARD`.
- `src/jobs/guess_first.ts`, `src/jobs/hint.ts`, `src/jobs/teachback_mark.ts`.
- `src/jobs/__fixtures__/provider.ts`: `withData`, `mockFetch`, `reply(content)`, `countUsage(dataDir)`, `sentinelItem()`.
- `src/jobs/view.test.ts`, `src/jobs/guard.test.ts`, `src/jobs/define.test.ts`, `src/jobs/guess_first.test.ts`, `src/jobs/hint.test.ts`, `src/jobs/teachback_mark.test.ts`.
- `src/flow/chat.ts`, `src/flow/chat.test.ts`.
- `src/api/chat.ts`, `src/api/chat.test.ts`.
- `app/chat.html`, `app/chat.js`.

### Relevant Documentation

- [Unicode `Extended_Pictographic`](https://www.unicode.org/reports/tr51/#Emoji_Properties): use it for the emoji check, not `\p{Emoji}`. `\p{Emoji}` matches the digits 0-9, `#` and `*`, which every maths reply contains.
- [MDN `URLSearchParams`](https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams): item ids contain `#` and `/`. A hand-built `?item=${id}` turns `#1` into a fragment.
- Bun test: `spyOn(console, "error")` as in `src/providers/openai-compatible.test.ts`.

### Patterns to Follow

**Naming**: files in `src/jobs` use the job name as the ticket gives it (`guess_first.ts`). Biome's recommended preset does not include `useFilenamingConvention`, so no rule flags the underscore. `observed` in planning: `bunx biome check src/jobs/guess_first.ts` on a stub file gave "Checked 1 file … No fixes applied", exit 0.

**Pure flow**: flow files read no clock and no file. `src/flow/chat.ts` gets `lines` and `deps` passed in and returns the event body to write, the way `src/flow/next.ts` returns `start`/`end` bodies for the page to post.

**Refusal shape**: API handlers return `{ status, body }` and the route wraps it (`src/api/config.ts`, `src/api/event.ts:8-15`).

**Error logging**: `console.error` with a plain sentence, never the key or provider body (`src/providers/openai-compatible.ts:102-108`).

**Doc comments**: one `/** … */` line per export saying what it returns and why, as in `src/flow/next.ts`.

**Tests**: `bun:test`, realpathed temp dir, `try/finally` removal (`src/providers/openai-compatible.test.ts:33-53`).

---

## IMPLEMENTATION PLAN

Branch `feature/t9-model-jobs` off `main`. The main checkout has an unrelated edit to
`.claude/skills/piv-create-pr/SKILL.md`; leave it alone (or work in a worktree, as T3/T5/T10 did).

### Phase A: the guard primitives (`view.ts`, `guard.ts`)
### Phase B: `defineJob` and the three jobs
**Depends on:** A
### Phase C: flow call points and the API
**Depends on:** B
### Phase D: the panel and the quiz link
**Depends on:** C (the page calls `/api/chat`). The `chatHref` part of Task 13 is independent of A-C.
### Phase E: validation, Level 4

---

## STEP-BY-STEP TASKS

### Task 1. CREATE `src/jobs/view.ts`

- **IMPLEMENT**:
  ```ts
  declare const PRE: unique symbol;
  declare const POST: unique symbol;
  /** The item a job may see before an attempt: toItemView's output, branded so a raw Item cannot pass for it. */
  export type PreAttempt = ItemView & { readonly [PRE]: true };
  /** The full item, minted only once hasAttempt reads true. */
  export type PostAttempt = Item & { readonly [POST]: true };
  export type ItemRef = { id: string; seed?: number };
  /** True when the log holds an attempt for this item. A generated item (`#gen`) must match the seed as well. */
  export function hasAttempt(lines: readonly string[], ref: ItemRef): boolean
  export function jobItem(lines: readonly string[], item: Item & { seed?: number }):
    | { attempted: false; view: PreAttempt }
    | { attempted: true; item: PostAttempt }
  ```
  `hasAttempt` parses each line with `parseEvent`. It matches `e.type === "attempt" && e.item === ref.id`,
  plus `e.seed === ref.seed` when `ref.id.endsWith("#gen")`. A `#gen` ref with no seed → false.
  `jobItem` returns `{ attempted: false, view: toItemView(item) as PreAttempt }`, or
  `{ attempted: true, item: item as PostAttempt }`. These two casts are the only `as PreAttempt` /
  `as PostAttempt` in the repo (Task 16 greps for this).
- **PATTERN**: `src/mcp/tools.ts:58-65` for the parse loop.
- **IMPORTS**: `parseEvent` from `../events/types`; `toItemView` from `../content/pack`; `Item`, `ItemView` from `../content/types`.
- **GOTCHA**: do not import `attemptedItems` from `src/mcp/tools.ts`. It matches on id alone, so one attempt on any generated item of a topic would unlock the answers of every later generated item on that topic (all share `${topic}#gen`, `app/quiz.js:65`). T10 is safe only because `read_state` never serves `#gen` items. Leave T10's function unchanged.
- **GOTCHA**: `toItemView` spreads the item after removing four keys, so a `seed` on a generated item survives into the view. That is fine: the seed is not the answer. The prompt never reads the view's `seed`.
- **VALIDATE**: `bun test src/jobs/view.test.ts` (Task 2).
- **SATISFIES**: AC 2, AC 3.

### Task 2. CREATE `src/jobs/view.test.ts`

- **IMPLEMENT**, one test per line:
  - `hasAttempt` false on an empty log; true after an attempt line for the exact id; false for another id with the same topic.
  - Generated: an attempt for `1MA1/R9#gen` at seed 11 → `hasAttempt({id, seed: 11})` true, `{id, seed: 12}` false, `{id}` (no seed) false.
  - `jobItem` before the attempt: `attempted: false`, and `Object.keys(view)` contains none of `answers`, `working`, `mark_scheme`, `misconceptions` (use `sentinelItem()` from the fixture, which sets all four).
  - `jobItem` after the attempt: `attempted: true`, `item.answers` present.
  - A type-level check, compiled by `tsc` in `bun run check`:
    ```ts
    // @ts-expect-error a raw Item is not a PreAttempt
    const _raw: PreAttempt = sentinelItem();
    ```
    If `@ts-expect-error` becomes unused, `tsc` fails. That failure is what proves the brand holds. Spike, `observed` in planning (`bunx tsc --noEmit`, TypeScript 7): with the directive, exit 0; without it, `TS2322: Type 'Item' is not assignable to type 'PreAttempt'. Property '[PRE]' is missing`.
- **VALIDATE**: `bun test src/jobs/view.test.ts && bunx tsc --noEmit`
- **SATISFIES**: AC 2.

### Task 3. CREATE `src/jobs/guard.ts` and `src/jobs/guard.test.ts`

- **IMPLEMENT**:
  ```ts
  const CHECKS: readonly [reason: string, re: RegExp][] = [
    // © ® ™ and the ↔-↙ ↩ ↪ arrows are Extended_Pictographic but appear in plain text (observed in the planning spike: "©" and "↔" matched the bare class)
    ["emoji", /(?![©®™↔-↙↩↪])\p{Extended_Pictographic}/u],
    ["exclamation", /!/],
    ["grade", /\bgrades?\b/i],
    ["grade", /\bon track (?:for|to)\b/i],
    ["grade", /\b(?:pass|fail)(?:ing)?\s+(?:the|your)\s+(?:exam|gcse|test)\b/i],
  ];
  /** Every number in a text, normalised: "1,200" → "1200", "2.50" → "2.5". */
  export function numbersIn(text: string): Set<string>
  // body: new Set((text.replace(/(\d),(\d{3})/g, "$1$2").match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))))
  /** The first rule a reply breaks, or null. `texts` is every string the job will show; `sources` is what the reply may take numbers from. */
  export function guardReply(texts: readonly string[], sources: readonly string[]): string | null
  // after CHECKS: any number in texts not in numbersIn(sources.join(" ")) → "invented-number"
  /** A second opinion that may say "would block" and is never obeyed in v1. */
  export type ShadowJudge = (job: string, texts: readonly string[]) => Promise<boolean>;
  ```
- **GOTCHA**: `\p{Emoji}` matches `0-9`, `#` and `*`, so it would block every maths reply. Use `Extended_Pictographic` with the exclusions above.
- **WHY the invented-number rule** (`observed` in the planning spike, `qwen2.5vl:3b` via Ollama, the real `chatJson`, 11 hint and 6 guess calls): every reply that parsed passed the regex checks, yet many were wrong maths, for example "Multiply the value by 6.3 to get 65%" and "calculating what 1/3 of $200 (since 65/5 = 97/4)". With the rule applied, 3 of 6 hints and 3 of 5 parsed guesses in the second run were rejected, and each rejection names a number the question never gave. A rejected reply gets the one retry, then the fallback, which for a hint is the lesson's own hint. This is CLAUDE.md "No model call … decides a numeric answer" enforced in code. It cannot catch wrong maths written in words ("five-eighths", `observed`). That is model quality, and it is S4's question (Q8).
- **Sources per job**: hint = stem, scaffold, lesson hint, pupil working. guess_first = stem, scaffold, the guess. teachback_mark = stem, the pupil's lines, and the line numbers `1..N`, but **not** the mark scheme. So a note cannot bring in a number the pupil did not write, which is how "never a corrected solution" is enforced in code: `"Missing that the goal is 15"` (`observed` note) is rejected.
- **GOTCHA**: no bare `/predict/`. A probability hint says "predict how many times", and a bare pattern would send every such reply to fallback. Grade talk is caught by `grades?`, `on track`, and pass/fail-the-exam.
- **Tests** (`guard.test.ts`): each reason fires on one sample ("Nice work 🎉", "Great ✅", "Well done!", "You are on track for a grade 5", "Grade 4 material", "you will pass the exam", and "Multiply by 6.3" with sources `["Find 65% of 200."]` → `invented-number`). Null on the clean set, which the planning spike ran through these regexes (`observed`, 18 samples, 0 flagged after the exclusions): "Find 10% of 45 first.", "Use #1 and 2*3", "50% × 2 ÷ 4", "π r² gives the area", "x ≠ 3", "Go 2 → 3", "Predict how many times it lands on red.", "The gradient is 2.", "No upgrade needed.", "Area = ½ × b × h", "Angle = 45°", "© no", "£12.50 each", "1:2 ratio", "3 cm² → 300 mm²", "↔", each with its own numbers in `sources`. `numbersIn("1,200 and 2.50")` → `{"1200", "2.5"}`. `guardReply([], [])` → null.
- **VALIDATE**: `bun test src/jobs/guard.test.ts`
- **SATISFIES**: AC 5.

### Task 4. CREATE `src/jobs/__fixtures__/provider.ts`

- **IMPLEMENT**: `withData(setup | null, fn)`, copied from `src/providers/openai-compatible.test.ts:33-53`. `setup = null` means no `config.json`. `NO_MODEL = { preset: "none", weeklyTarget: 3 }`. `OPENAI` as in that test, with a fake key. Also:
  - `mockFetch(...replies)`: answers call n with `replies[n]`. A reply is a function that returns a `Response` or throws, which simulates provider down.
  - `chatReply(content: string)`: a 200 `Response.json({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } })`.
  - `countUsage(dataDir)`: the count of `usage` lines in `readLines(dataDir)`.
  - `sentinelItem(over?)`: an `Item` with `answers: ["SENTINEL-ANSWER-731"]`, `working: "SENTINEL-WORKING"`, `mark_scheme: "SENTINEL-SCHEME"`, `misconceptions: [{ answer: "SENTINEL-WRONG", message: "SENTINEL-MESSAGE" }]`, a real-looking stem, scaffold and hint.
  - `attemptLine(item, seed?)`: an attempt event body for `appendEvent`.
- **PATTERN**: `src/events/__fixtures__/append-many.ts` shows fixtures living under `__fixtures__`.
- **GOTCHA**: the `.claude` hook blocks the literal `process` + `.env` substring in Bash heredocs (memory). Write this file with the Write tool.
- **VALIDATE**: `bunx tsc --noEmit`
- **SATISFIES**: AC 1 (enables).

### Task 5. CREATE `src/jobs/define.ts`

- **IMPLEMENT**:
  ```ts
  export const PRE_ATTEMPT_GUARD = "Do not state the answer. The pupil has not attempted this yet.";
  const VOICE = "You are a maths tutor for a 15-year-old at GCSE Foundation. Speak to the pupil as \"you\". Plain words, short sentences, British English, sentence case. No emoji, no exclamation marks, never a grade or a prediction.";
  // Both lines go in every system message, pre and post. ONE: the S2 two-block failure (Q12). NUM: the invented-number rule (guard.ts).
  const ONE = "Reply with exactly one JSON object and nothing else: no text before or after it, and no second attempt.";
  const NUM = "Use only numbers that appear in the question, the lesson's hint or the pupil's own words. Do not calculate anything new.";
  /** System message for a job that runs before an attempt: the guard line is always in it. */
  export function preAttemptSystem(task: string): Message
  /** System message for a job that runs after an attempt. A separate function, so the guard line cannot be dropped from a pre-attempt prompt by a flag. */
  export function postAttemptSystem(task: string): Message
  export type JobFailure = Failure | "shape" | "guard";
  export type Verdict<O> =
    | { by: "model"; value: O }
    | { by: "fallback"; value: O | null; reason: JobFailure };   // null = no verdict
  export type JobDeps = { dataDir: string; fetch?: Fetch; now?: () => string; judge?: ShadowJudge };
  export type JobSpec<I, O> = {
    name: string;
    prompt: (input: I) => Message[];
    validate: (value: unknown, input: I) => O | null;  // shape in code; the provider's JSON mode is not relied on
    texts: (out: O) => readonly string[];              // what the guard reads: every string the pupil will see
    sources: (input: I) => readonly string[];          // what a reply may take numbers from (guard.ts)
    fallback: (input: I) => O | null;
    maxTokens?: number;
  };
  export function defineJob<I, O>(spec: JobSpec<I, O>): { name: string; run(input: I, deps: JobDeps): Promise<Verdict<O>> }
  ```
  `run`:
  1. `messages = spec.prompt(input)`, built once. The retry sends the same messages.
  2. Up to 2 tries. Each is `chatJson(deps.dataDir, messages, { job: spec.name, maxTokens, fetch: deps.fetch, now: deps.now })`.
     - `ok:false` with `reason` `not-json` → retry if it is the first try, else fallback with that reason.
     - `ok:false` with any other reason (`no-model | cap | timeout | network | http | bad-response`) → fallback at once, no retry.
     - `ok:true` → `validate(value, input)`; null → `"shape"` (retryable). Then `guardReply(spec.texts(out), spec.sources(input))`; non-null → `"guard"` (retryable). Otherwise the model verdict.
  3. On a model verdict with `deps.judge` set: `await` it inside `try/catch`. On `true`, `console.error(\`Shadow judge (${name}): would_block\`)`. The return value is the model verdict either way.
  4. Fallback: `{ by: "fallback", value: spec.fallback(input), reason }`. On `shape` or `guard`, log `Model reply refused (${name}): ${reason}` (never the text).
- **IMPORTS**: `chatJson`, `type Failure`, `type Fetch`, `type Message` from `../providers/openai-compatible`; `guardReply`, `type ShadowJudge` from `./guard`.
- **GOTCHA**: `http` gets no retry. A 5xx retry is a provider question, and T8 put retry at the job only for the shape. A 429 retried at once would fail again. Provider down = 1 fetch, 0 usage lines, fallback.
- **GOTCHA**: `bad-response` gets no retry either. The body was not a chat completion, so the provider is misconfigured, and a second call would give the same body.
- **GOTCHA**: `parseJsonReply` is not changed. A reply with two fenced blocks (Anthropic compat self-correcting, architecture S2) is `not-json` → one retry → fallback. See NOTES "S2 question answered".
- **VALIDATE**: `bun test src/jobs/define.test.ts` (Task 6); `bunx biome check src/jobs`
- **SATISFIES**: AC 1, AC 4, AC 5, AC 6.

### Task 6. CREATE `src/jobs/define.test.ts`

A throwaway job defined in the test (`name: "probe"`, output `{ text: string }`, fallback `{ text: "fallback" }`), run against `withData(OPENAI)` with `mockFetch`.

| Case | Replies | Expect `by` / `reason` | fetch calls | usage lines |
|---|---|---|---|---|
| valid first try | `{"text":"Find 10% first."}` | model | 1 | 1 |
| fenced valid | "```json\n{\"text\":\"ok\"}\n```" | model | 1 | 1 |
| not-json then valid | `oops`, valid | model | 2 | 2 |
| invalid JSON twice | `oops`, `still not` | fallback / not-json | 2 | 2 |
| two fenced blocks twice | "```json\n{…}\n```\nWait\n```json\n{…}\n```" ×2 | fallback / not-json | 2 | 2 |
| wrong shape twice | `{"txt":"x"}` ×2 | fallback / shape | 2 | 2 |
| guard then valid | `{"text":"Well done!"}`, valid | model | 2 | 2 |
| guard twice | `{"text":"🎉"}` ×2 | fallback / guard | 2 | 2 |
| provider down | fetch throws `TypeError` | fallback / network | 1 | 0 |
| http 500 | status 500 | fallback / http | 1 | 0 |
| preset none | (no fetch) | fallback / no-model | 0 | 0 |
| no config.json | (no fetch) | fallback / no-model | 0 | 0 |

(`derived`: `chatJson` appends `usage@1` on every 200 with an object body before it parses the reply
(`src/providers/openai-compatible.ts:188-189`), and a thrown fetch or a non-2xx returns before that line.)

Plus:
- Judge returns `true` → verdict still `model` with the same value; `console.error` saw `would_block`. Judge throws → verdict still `model`. Judge not called on a fallback.
- `preAttemptSystem("x").content` contains `PRE_ATTEMPT_GUARD`; `postAttemptSystem("x").content` does not.
- **VALIDATE**: `bun test src/jobs/define.test.ts`
- **SATISFIES**: AC 1, AC 4, AC 5.

### Task 7. CREATE `src/jobs/hint.ts` + `hint.test.ts`

- **IMPLEMENT**:
  ```ts
  export type HintInput = { view: PreAttempt; topic: string /* title */; working: string /* pupil's lines so far, may be "" */ };
  export type HintOutput = { text: string };
  export const FALLBACK_HINT = "Write down the first step you are sure of. Then look at what the question asks for.";
  export const hint = defineJob<HintInput, HintOutput>({ name: "hint", … });
  ```
  - prompt: `preAttemptSystem("Give one hint: the next step only, never the result of it. Reply with JSON only: {\"text\": \"<one or two sentences>\"}")`; user message lists `Topic: …`, `Question: ${view.stem}`, `Given: ${view.scaffold}` when present, `The lesson's own hint: ${view.hint}` when present (so the model's hint agrees with the lesson), `The pupil's working so far: …` when non-empty. Never `view.figure`, which is SVG, costs tokens and adds nothing for a text model.
  - validate: object with `text` a string, trimmed length 1-300, and no other keys required.
  - texts: `[out.text]`.
  - fallback: `{ text: view.hint ?? FALLBACK_HINT }`. The content hint passed the #24 review for not stating the answer.
- **GOTCHA**: `FALLBACK_HINT` and every system-message sentence are pupil-facing or prompt prose. Run `no-ai-slop`, then `humanizer`, before saving (CLAUDE.md "Prose is a gate"). The strings here are drafts.
- **Tests**: valid (model text returned); invalid JSON twice → `view.hint`; provider down → `view.hint`; preset none → `view.hint`, 0 fetch; a view with no `hint` → `FALLBACK_HINT`. **Leak test**: `jobItem([], sentinelItem())` → run with a `mockFetch` that captures `init.body`. `JSON.parse(body).messages` serialised contains none of the five `SENTINEL-*` strings, and its system message contains `PRE_ATTEMPT_GUARD`.
- **VALIDATE**: `bun test src/jobs/hint.test.ts`
- **SATISFIES**: AC 1, AC 2, AC 3, AC 6.

### Task 8. CREATE `src/jobs/guess_first.ts` + `guess_first.test.ts`

- **IMPLEMENT**: `GuessInput = { view: PreAttempt; topic: string; guess: string }`, `GuessOutput = { text: string }`.
  - prompt: `preAttemptSystem("The pupil has written a guess at the method before trying the question. Say which part of the guess holds, if any, and name at most one next step. Do not work anything out. Reply with JSON only: {\"text\": \"<two or three sentences>\"}")`. The user message gives topic, question, scaffold when present, and `The pupil's guess: …`.
  - validate: `text` 1-400 chars.
  - fallback: `{ text: FALLBACK_GUESS }` = "Keep that guess in mind. Try the question, then check your method against the working." (draft; prose gate applies).
- **SPEC SOURCE**: v1 `~/Desktop/Matis_study_tutor/HOW-IT-WORKS.html:44` ("It asks what you think the method is. Rough is fine, wrong is fine. It fixes your guess one step at a time.") and v1 `CLAUDE.md:14` (attempt first; a corrected wrong guess sticks). Per item in v2, where v1 did it per topic (Q6).
- **Tests**: same four as hint (valid, invalid twice, provider down, preset none) plus the sentinel leak test and the guard-line assertion.
- **VALIDATE**: `bun test src/jobs/guess_first.test.ts`
- **SATISFIES**: AC 1, AC 2, AC 3, AC 6.

### Task 9. CREATE `src/jobs/teachback_mark.ts` + `teachback_mark.test.ts`

- **IMPLEMENT**:
  ```ts
  export type TeachbackInput = { item: PostAttempt; topic: string; lines: readonly string[] };
  export type LineMark = { mark: 0 | 1; note: string };
  export type TeachbackOutput = { lines: LineMark[] };
  export const MAX_LINES = 8;
  ```
  - prompt: `postAttemptSystem("Mark the pupil's explanation one line at a time against the mark scheme: 1 if the line is a correct step in the right order, else 0. Each note names what is missing or wrong in one short sentence. Never write the corrected step or the answer. Reply with JSON only: {\"lines\": [{\"mark\": 0 or 1, \"note\": \"…\"}]} with exactly N entries, one per pupil line.")`, with N filled in. The user message: topic, question, `Mark scheme: ${item.mark_scheme ?? item.working ?? ""}`, then the pupil lines numbered `1. …`.
  - validate: `lines` is an array of **exactly** `input.lines.length` entries (T8 finding: the loose prompt returned a fourth entry). Each `mark` is `0` or `1` (not `true`, not `"1"`). Each `note` is a string, 0-160 chars.
  - texts: every `note`.
  - fallback: `null` (no verdict).
- **GOTCHA**: the mark scheme is `mark_scheme ?? working`. No maths item has `mark_scheme` (`observed` this session: 105 items, all `cloze`, 0 with `mark_scheme`, 105 with `working`). Q1.
- **GOTCHA**: the ticket says "never a corrected solution". The code enforces it through the shape: marks and a 160-character note per pupil line, with no field for a solution. NOTES explains why there is no answer-token check.
- **Tests**: valid (3 lines in, 3 marks out); wrong count twice (3 in, 4 out ×2) → fallback `null` / shape; `mark: 2` → shape; invalid JSON twice → `null`; provider down → `null`; preset none → `null`; the system message does **not** contain `PRE_ATTEMPT_GUARD`, and the user message **does** contain the working (the post-attempt variant is allowed it).
- **VALIDATE**: `bun test src/jobs/teachback_mark.test.ts`
- **SATISFIES**: AC 1, AC 4, AC 6.

### Task 10. CREATE `src/flow/chat.ts`

- **IMPLEMENT**:
  ```ts
  export const CHAT_JOBS = ["guess_first", "hint", "teachback_mark"] as const;
  export type ChatJob = (typeof CHAT_JOBS)[number];
  /** The named point each job runs at: before the pupil's first attempt on the item, or after it. */
  export const CALL_POINT: Record<ChatJob, "before" | "after"> = { guess_first: "before", hint: "before", teachback_mark: "after" };
  /** An items-file item by id, or a generated item rebuilt from its topic's generator and seed (the shape quiz.js builds). */
  export function findItem(pack: CasePack, id: string, seed?: number): (Item & { seed?: number }) | null
  export type ChatAsk = { job: ChatJob; item: Item & { seed?: number }; topic: string; text: string };
  export type ChatReply =
    | { kind: "text"; by: "model" | "fallback"; text: string }
    | { kind: "marks"; marks: LineMark[]; score: number; of: number; record: NewEvent }
    | { kind: "no-verdict"; working: string | null }
    | { kind: "refused"; reason: "attempt-first" | "already-attempted" | "taught-today" };
  /** `day` is the London day (localDay(utcNow()), read once by the API), so this file reads no clock. */
  export async function chat(ask: ChatAsk, log: readonly string[], day: string, deps: JobDeps): Promise<ChatReply>
  ```
  `log` is the event log (`readLines`). Within `chat`, the pupil's teach-back lines are `steps`, so the two never share a name.
  - `findItem`: id without `#gen` → `pack.items.get(topicOf(id))` (topic = the part before `#`) `.find(i => i.id === id)`. Id `${topic}#gen` → requires an integer `seed`. `gen = pack.gens[topic.aliases[0] ?? ""]`, `spec = gen(lcg(seed))`, return `{ id, topic, type: "generator", stem, hint, answers, working, misconceptions: Object.entries(spec.wrong).map(…), seed }`. This mirrors `app/quiz.js:63-76`.
  - `chat`: `const j = jobItem(log, ask.item)`. If `CALL_POINT[job] === "before"` and `j.attempted` → refused `already-attempted`. If `"after"` and not attempted → refused `attempt-first`. `teachback_mark` when the log already holds a `teachback` event for this item id whose `localDay(t) === day` → refused `taught-today`, **before** the job runs, so no tokens are spent and no second 15 XP is written (Decision Q4). Otherwise:
    - `hint` → `hint.run({ view: j.view, topic, working: text }, deps)` → `{ kind: "text", by, text: value.text }`. The fallback always has a value.
    - `guess_first` → the same with `guess: text`.
    - `teachback_mark` → `steps = text.split("\n").map(trim).filter(Boolean).slice(0, MAX_LINES)`, passed as the job's `lines`. A model verdict → `score = sum of marks`, `of = steps.length`, `record = { v: 1, type: "teachback", topic: item.topic, item: item.id, marks: score, of }`. A fallback → `{ kind: "no-verdict", working: item.working ?? null }`.
- **GOTCHA**: this file must not contain the word `fetch` anywhere, comments and identifiers included (`src/flow/properties.test.ts:231`), and must not import from `../providers`. `JobDeps` carries `fetch?`, but `chat` only passes `deps` through, so the word never appears here. Don't destructure it.
- **GOTCHA**: `topicOf(id)` for an items-file id is `id.slice(0, id.indexOf("#"))`. `1MA1/G17/cone#2` → `1MA1/G17/cone`. Topic ids contain `/`, so do not split on `/`.
- **GOTCHA**: `chat` writes nothing. It returns `record`, and `src/api/chat.ts` appends it through `postEvent`, which also appends the XP line. This keeps `src/flow` free of file writes.
- **VALIDATE**: `bun test src/flow` (includes `properties.test.ts`)
- **SATISFIES**: AC 3, AC 7, AC 8.

### Task 11. CREATE `src/flow/chat.test.ts`

- `CALL_POINT` has a key for every `CHAT_JOBS` entry. The `Record` type checks this at compile time. The test also checks at runtime that `Object.keys(CALL_POINT).sort()` equals `[...CHAT_JOBS].sort()`.
- `findItem`: `1MA1/R9/of-an-amount#1` found; unknown id → null; `1MA1/R9/of-an-amount#gen` with seed 5 → the stem `lcg(5)` gives through that topic's generator; `#gen` without seed → null; `#gen` for a topic with no generator → null.
- `hint` after an attempt on the item → refused `already-attempted`, 0 fetch calls. `teachback_mark` before → refused `attempt-first`, 0 fetch calls.
- Generated item: an attempt at seed 5, then `teachback_mark` at seed 6 → refused `attempt-first`. At seed 5 → runs.
- **No key set, every path runs its fallback** (AC 8), with `withData(NO_MODEL)` and again with `withData(null)`:
  - hint before attempt → `{ kind: "text", by: "fallback", text: item.hint }`
  - guess_first before attempt → `FALLBACK_GUESS`
  - teachback after attempt → `{ kind: "no-verdict", working: item.working }`
  - and no `usage` line written.
- teachback model verdict: marks `[1,0,1]` → `score 2, of 3`, `record` passes `parseEvent` once stamped with a `t`.
- A `teachback` line for the item stamped `2026-10-05T16:00:00Z`: `chat` with day `2026-10-05` → refused `taught-today`, 0 fetch calls. With day `2026-10-06` → runs. The London-day edge: a line at `2026-10-05T23:30:00Z` is London day `2026-10-06` in BST (`localDay`), so day `2026-10-06` is refused.
- **VALIDATE**: `bun test src/flow/chat.test.ts`
- **SATISFIES**: AC 3, AC 7, AC 8.

### Task 12. CREATE `src/api/chat.ts` + `src/api/chat.test.ts`; UPDATE `src/server.ts`

- **IMPLEMENT** (`src/api/chat.ts`):
  - `getChat(dataDir, pack, params: URLSearchParams) → { status, body }`: `item` required (1-200 chars), `seed` optional (a non-negative integer, required for `#gen`), otherwise 400. Unknown item → 404. 200 body: `{ item, seed?, topic, title, stem, scaffold?, figure?, attempted, model }`. `model` is `readConfig(dataDir)?.preset` not in `[undefined, "none"]`. The body is built from a `PreAttempt` view field by field, so it never carries `answers`, `working`, `mark_scheme` or `misconceptions`, even after an attempt.
  - `postChat(body, dataDir, pack, deps) → Promise<{ status, body }>`: validate **before** any job runs. Body is an object; `job` is in `CHAT_JOBS`; `item` and `seed` as above; `text` is a string, trimmed 1-2000 chars. Otherwise 400. Unknown item → 404. Then `chat(…, readLines(dataDir), localDay((deps.now ?? utcNow)()), deps)`:
    - `refused` → 409 `{ error }` from a compile-pinned `Record<"attempt-first" | "already-attempted" | "taught-today", string>`: "Try the question first.", "You have already tried this one. Explain it back instead.", "You have explained this one today. Try another question." (drafts; prose gate)
    - `marks` → `postEvent(record, dataDir, pack.topics, deps.now)`. On 201: 200 `{ kind, marks, score, of, working, saved: true }`. Otherwise log and 200 with `saved: false`. The pupil still sees the marks.
    - `text` / `no-verdict` → 200 as is (never `record`).
- **UPDATE** `src/server.ts` `apiRoutes`: add `"/api/chat": { GET, POST }`. GET goes through `dayRoute`-style pack loading (`pack ?? await loadCasePack("maths", root)`) inside `refuseForeign` + try/500. POST parses JSON as `postConfigRoute` does, then `postChat(body, dataDir, pack, { dataDir })`.
- **GOTCHA**: the key-leak walk (`src/server.test.ts:326-395`) POSTs `{ preset: "nope", key }` and GETs `/api/chat` with no query, while an `openai` config with a fake key is saved. Both must answer 400 before any job runs, or the test makes a live call to `api.openai.com`. Do **not** add `/api/chat` to the walk's `valid` map. Verify with Task 16's network check.
- **GOTCHA (idle timeout)**: `Bun.serve` closes a connection that sends nothing for `idleTimeout` seconds, and the default is 120 (`observed`: `node_modules/bun-types/serve.d.ts:493-499`, `@default 120`). One chat job can take up to 240 s (`derived`: a not-json reply arriving just under `DEFAULT_TIMEOUT_MS` = 120 s, then a retry that times out at 120 s). Local models are slow enough to get there: S2 `observed` 52.3 s and 63.8 s single vision calls on Ollama. Past 120 s, Bun drops the pupil's socket and the page says "Not sent". The job still finishes, though. For a teach-back, `postEvent` then writes `teachback@1` and 15 XP the pupil never saw. They resubmit and get the XP twice. Fix: the POST handler takes `(req, server)` and calls `server.timeout(req, 0)` (no idle limit for this request, `serve.d.ts:1139-1153`) before it awaits `postChat`. The job's own bound (2 × 120 s plus the queue) is the limit. Level 4 step 8 checks this with the fake provider. **Spike, `observed` in planning (Bun 1.3.4):** a `routes` handler awaiting `Bun.sleep(9000)` under `idleTimeout: 1` had its socket closed at 4,018 ms ("The socket connection was closed unexpectedly"). The same handler calling `srv.timeout(req, 0)` first answered 200 at 9,003 ms. With `idleTimeout: 2` and a 4 s wait, both answered, so Bun's idle check is coarse, a few seconds. The cut is real, and the fix works in a `routes` handler, whose second argument is the server (`serve.d.ts:592`).
- **GOTCHA**: `ServerOptions` gets no `fetch` field. The HTTP-level test runs with `preset: "none"`, and model paths are tested at `src/api/chat.test.ts` with `deps.fetch` injected.
- **Tests** (`src/api/chat.test.ts`, calling the functions directly):
  - 400 table: no body, `job: "solve"`, missing `item`, `text: ""`, `#gen` without seed, `seed: -1`.
  - 404 on unknown item.
  - 409 both ways, as in Task 11.
  - GET before and after an attempt: `attempted` flips, and the body keys never include `answers`, `working`, `mark_scheme` or `misconceptions`.
  - POST `teachback_mark` with a mocked valid reply → 200 `saved: true`; the log gains a `teachback@1` line with `marks`/`of` matching and one `xp@1` line of 15. With `NO_MODEL` → `no-verdict`, and no teachback or xp line.
  - The response text never contains the key (the `OPENAI` fixture key).
  - One HTTP test in `src/server.test.ts`: `withServer`, `preset: "none"`, POST `/api/chat` `hint` for `1MA1/R9/of-an-amount#1` → 200 `by: "fallback"`, `text` equal to the item's hint.
  - One HTTP test in `src/server.test.ts` through the **real route and the real provider module**, with no mock `fetch`. Start `startFakeProvider({ mode: "valid" })` (Task 12b), save `preset: "custom"`, `base_url: <fake>/v1`, `model: "fake"`. `checkBaseUrl` accepts `http://127.0.0.1:<port>` (`src/config.ts:186-200`). Post an attempt for item `#1`, then POST `/api/chat` `teachback_mark` with 2 lines → 200 `kind: "marks"`, `saved: true`, and the log holds `usage@1`, `teachback@1` and `xp@1` (15). Then `hint` on item `#2` → `by: "model"`.
- **VALIDATE**: `bun test src/api/chat.test.ts src/server.test.ts`
- **SATISFIES**: AC 3, AC 7, AC 8, AC 9, AC 13.

### Task 12b. CREATE `scripts/fake-provider.ts`

- **IMPLEMENT**: `export function startFakeProvider(opts: { delayMs?: number; mode: "valid" | "not-json" })`. It runs `Bun.serve` on `127.0.0.1`, port 0, answering `POST /v1/chat/completions`. It reads the request's `messages`, waits `delayMs`, then returns `{ choices: [{ message: { content } }], usage: { prompt_tokens: 20, completion_tokens: 10 } }`. `content` is `"not json"` in not-json mode. Otherwise it is shaped from the system message: `{"lines":[…]}` with one `{mark:1,note:""}` per numbered user line when the system message mentions "Mark the pupil's", and `{"text":"Start with 10%."}` for any other job. When run as `import.meta.main`, it takes `--delay <ms>` and `--mode`, prints the base URL and keeps running.
- **PATTERN**: `scripts/s2-run.ts` is the other script that stands in for a provider leg. `scripts/scripts.test.ts` shows how scripts are tested.
- **GOTCHA**: it binds `127.0.0.1` only (CLAUDE.md "Network").
- **VALIDATE**: `bun test src/server.test.ts` (the fake-provider HTTP test)
- **SATISFIES**: AC 9, AC 12.

### Task 13. UPDATE `app/quiz.js` (+ `src/marking/quiz.test.ts`)

- **IMPLEMENT**: `function chatHref(item)` returns `"/chat.html?" + new URLSearchParams(item.seed === undefined ? { item: item.id } : { item: item.id, seed: String(item.seed) })`. In `buildItem`, after the hint paragraph, add `<p class="ask"><a target="tutor" href="${chatHref(item)}">Ask the tutor</a></p>` via `createElement`, never string HTML. Export `chatHref` on `root.quiz`.
- **GOTCHA**: item ids contain `#` (`1MA1/R9/of-an-amount#1`). A template string would cut the id at `#` and send the rest as a fragment. `URLSearchParams` encodes it as `%23`.
- **GOTCHA**: the link opens a named tab (`target="tutor"`), so the quiz keeps its progress and repeat clicks reuse one tab.
- **Test** (`src/marking/quiz.test.ts`): `new URL(quiz.chatHref({ id: "1MA1/R9/of-an-amount#1" }), "http://x").searchParams.get("item")` equals the id, and `.hash` is `""`. The generated case round-trips `seed`.
- **Parity test** (`src/marking/quiz.test.ts`, where the browser file is already importable). The property: the chat page marks the same question practice showed. For every pack topic whose `aliases[0]` has a generator, and seeds `[0, 1, 4294967295]`, build the browser item `quiz.itemFromGenerated(t.id, gens[code](quiz.lcg(seed)), seed)`, the way `buildQuiz` does (`app/quiz.js:180-183`). Compare it with `findItem(pack, \`${t.id}#gen\`, seed)`. `stem`, `answers`, `working`, `hint` and `misconceptions` must be equal. If this test compared `findItem` with the server's own `lcg`, it could not fail. It must use `quiz.lcg` and `quiz.itemFromGenerated`. Spike, `observed` in planning: 21 generator topics × 5 seeds = 105 comparisons, 0 differences between the browser construction and the server `lcg` + `Object.entries(wrong)` construction.
- **VALIDATE**: `bun test src/marking/quiz.test.ts`
- **SATISFIES**: AC 10.

### Task 14. CREATE `app/chat.html` + `app/chat.js`

- **IMPLEMENT** `chat.html`: the same head and `main.lesson` frame as `app/practice.html`. **Static markup**, outside any region the script replaces:
  `<p class="ai-note" role="note">This is an AI. It can be wrong. It will not give you the answer before you have tried.</p>`,
  styled `position: sticky; top: 0` in a page `<style>` block (as `app/setup.html` does), so it stays on screen while the log scrolls. Then `#item` (stem, scaffold), `#before` (a guess form, a working box and a Hint button), `#after` (a teach-back textarea, "one step per line", and a Mark button), and `#log` (an `<ol>` of replies). Both `#before` and `#after` start `hidden`.
- **IMPLEMENT** `chat.js`: read `item` and `seed` with `URLSearchParams(location.search)`, then `GET /api/chat?` + the same params re-encoded. Every POST sends `headers: { "content-type": "application/json" }`. Without that header, `refuseForeign` answers 415 (`src/server.ts:96-100`). Show `#before` or `#after` from `attempted`. When `model` is false, show one line: "No model is set up, so you get the tutor's built-in help." Each form POSTs `{ job, item, seed?, text }`. It appends the pupil's own text to `#log` (as "You: …"), shows "Thinking…" while the request is out, then appends the reply:
  - `text` → the reply text
  - `marks` → one row per line, "1 mark" or "0 marks", plus the note, then "2 of 3", then always "The tutor's marks can be wrong. Check them against the working:" plus the working. The API adds `working` to the marks reply, since the item is post-attempt. Reason: the planning probe (`observed`, `qwen2.5vl:3b`) gave 0 to correct lines in 3 of 3 parsed teach-backs. So the pupil always sees the worked solution beside the model's marks, and nothing about the pupil's standing depends on them: XP is 15 either way, and marks feed no rung.
  - `no-verdict` → "No marks this time. Compare your steps with the working:" plus the working
  - 409 → the error message, then a reload of the item state
  - network failure → "Not sent. Check the tutor window is still open." (the `NOT_SAVED` wording in quiz.js)
  - after `teachback_mark` with `saved: true` → "Saved to your record."
- **GOTCHA**: every model string goes in with `textContent`, never `innerHTML`. A reply is untrusted text. Only `figure` (content-pack SVG, as `quiz.js:122` does) goes in with `innerHTML`.
- **GOTCHA**: page prose passes `no-ai-slop` then `humanizer`. The strings above are drafts.
- **Test**: `src/server.test.ts` or a small `app`-reading test reads `app/chat.html` as text. It asserts "This is an AI" appears in it, and that the element holding it is not inside `#before`, `#after`, `#log` or `#item` (check with a regex on the markup, or a string index that falls before `id="item"`).
- **VALIDATE**: `bun test && bunx biome check app`
- **SATISFIES**: AC 11.

### Task 15. UPDATE docs

- `.claude/references/model-jobs.md`: one paragraph under "Rules" giving the retry table (retryable: `not-json`, `shape`, `guard`; straight to fallback: the rest), the brands (`PreAttempt`/`PostAttempt` in `src/jobs/view.ts`), and "one fenced block only; a two-block reply is not-json".
- `docs/prd/study-tutor-v2.architecture.md`, Q12 paragraph: add one sentence. "T9: a job takes one fenced block only; two blocks is not-json, one retry, then fallback (`src/jobs/define.ts`)."
- CLAUDE.md architecture map already lists `src/jobs/`, so no change there. Run `rules-check-drift` only if the review asks.
- **VALIDATE**: `bunx biome check .`

### Task 16. VALIDATE: whole gate and the structural greps

- `bun run check` green.
- `grep -rn "as PreAttempt\|as PostAttempt" src | grep -v test` → only `src/jobs/view.ts`.
- `grep -rn "JSON.stringify(.*item\|\.\.\.view\|\.\.\.item" src/jobs` → no hit inside a `prompt` function.
- `grep -n "fetch" src/flow/chat.ts` → no output.
- No live network in tests. With Wi-Fi off, or `sudo` unavailable, run `bun test src/server.test.ts src/api/chat.test.ts` and confirm the total runtime has no 120 s stall and no "Model call failed (…): network" line for a route-walk request. `observed` or `not run`, written in the report.

---

## TESTING STRATEGY

### Unit Tests

`src/jobs/*.test.ts` against a mocked `fetch` passed through `JobDeps`. Each of the three jobs has:
valid output, invalid JSON twice, provider down, and preset `none`. The generic policy is covered once in
`define.test.ts` (the 12-row table). Brands and `hasAttempt` are covered in `view.test.ts`, the regexes
in `guard.test.ts`.

### Integration Tests

- `src/flow/chat.test.ts`: real items from `loadCasePack("maths")`, real event log in a temp dir, the call-point refusals, and the no-key fallbacks.
- `src/api/chat.test.ts`: validation before any job; the `teachback@1` + `xp@1` write; no answer keys on GET.
- `src/server.test.ts`: the route walk (unchanged test, new route) and one HTTP `hint` with no model.

No socket or realtime surface.

### Edge Cases

| Edge case | Verified in |
|---|---|
| Attempt at seed A does not unlock seed B of a `#gen` item | `view.test.ts`, `flow/chat.test.ts` |
| Raw `Item` passed where `PreAttempt` is wanted | `view.test.ts` (`@ts-expect-error`, `tsc`) |
| Sentinel answer/working/scheme/misconception absent from pre-attempt messages | `hint.test.ts`, `guess_first.test.ts` |
| Two fenced blocks (Anthropic self-correction) | `define.test.ts` |
| Model returns 4 marks for 3 lines | `teachback_mark.test.ts` |
| `mark: true` / `"1"` / `2` | `teachback_mark.test.ts` |
| Reply with emoji, `!`, grade talk | `guard.test.ts`, `define.test.ts` |
| Reply with a number the question never gave ("multiply by 6.3") | `guard.test.ts`, `hint.test.ts` (mock reply → retry → lesson hint) |
| Teach-back note bringing in a number from the working | `teachback_mark.test.ts` (note "the goal is 130" with the pupil never writing 130 → shape/guard → retry → `null`) |
| Second teach-back on one item the same London day | `flow/chat.test.ts` |
| Clean maths text with digits, `#`, `*`, "predict", "gradient" | `guard.test.ts` |
| Judge throws or says block | `define.test.ts` |
| Item id with `#` in a link | `quiz.test.ts` |
| Teach-back text with blank lines or more than 8 lines | `flow/chat.test.ts` |
| Key-leak walk hits `/api/chat` with a live `openai` config | `server.test.ts` (existing walk) + Task 16 network check |
| No `config.json` at all | `define.test.ts`, `flow/chat.test.ts` |
| Model output rendered as text, not HTML | Level 4 step 5 (no browser test harness) |
| "This is an AI" stays visible while scrolling | Level 4 step 2 |

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
bunx tsc --noEmit
bunx biome check .
```

### Level 2: Unit Tests

```bash
bun test src/jobs
```

### Level 3: Integration Tests

```bash
bun test src/flow src/api src/server.test.ts src/marking/quiz.test.ts
bun run check
bun scripts/test-generators.ts   # unchanged content, but findItem now calls generators server-side
```

### Level 4: Manual Validation

Setup: `bun run dev` from the branch, with a fresh `data/`. On first run, the setup page opens; pick
**No model**. Use `agent-browser` (scroll before click, memory note).

1. Open lesson 0001 (Percentage of an amount). Question 1 shows an "Ask the tutor" link. Click it. A
   `tutor` tab opens at `/chat.html?item=1MA1%2FR9%2Fof-an-amount%231`, and the page shows the stem.
2. "This is an AI…" is at the top. Scroll the page (add several log entries first); the note stays in
   view. Take a screenshot.
3. Hint → the reply equals the item's hint, "20% is two lots of 10%." (content, `observed` this
   session). Guess → the built-in guess line. The "No model is set up" line is shown.
4. Back in the lesson, answer question 1 and press Check. Reload the chat tab: the teach-back form shows
   and the hint form is gone. Submit two lines: "No marks this time" plus the working. `data/events.jsonl`
   has no `teachback` line.
5. With a model: Ollama is running on this Mac with `qwen2.5vl:3b` (`observed` in planning, `curl localhost:11434/api/tags`). If it is stopped, `ollama serve`. In Settings pick Ollama, model `qwen2.5vl:3b`. Repeat step 4's teach-back on question 2 after answering it. Marks per line
   appear, one row per submitted line. `events.jsonl` gains `usage`, `teachback` and `xp` (15) lines.
   Then submit `<b>bold</b>` as a guess: the log echo shows the tags literally. The model's own text
   cannot be forced to hold markup, so the reply path is checked by reading `chat.js`: no
   `innerHTML` outside the figure. Ask for 5 hints on 5 different unattempted items. Record in the report, as `observed`: how many came `by: "model"`, how many fell back, and the `Model reply refused (hint): …` reasons in the console. The planning figure to compare with is 3 of 6 hints rejected by `invented-number`.
6. Practice page → Mixed 6 → "Ask the tutor" on a generated question. The URL carries `seed`, and the
   stem on the chat page matches the practice stem.
7. `curl -s -X POST localhost:<port>/api/chat -H 'content-type: application/json' -d '{"job":"solve"}'`
   → 400. `curl -s 'localhost:<port>/api/chat?item=1MA1%2FR9%2Fof-an-amount%231'` → JSON with no
   `answers` key.
8. **Slow provider.** Run `bun scripts/fake-provider.ts --mode not-json --delay 70000` and set Settings to "Other OpenAI-compatible" with the printed URL and model `fake`. On an attempted item, submit a teach-back. The request takes about 140 s (`derived`: 2 tries × 70 s). The page must then show "No marks this time" plus the working, not "Not sent". Then run it again with `server.timeout(req, 0)` commented out. At or a few seconds after 120 s the page shows "Not sent", which confirms that the Task 12 GOTCHA is real on this Bun. Write both results in the report as `observed`. Restore the line.

### Level 5: Additional Validation (Optional)

`/code-review` on the branch diff before `piv-create-pr`.

---

## ACCEPTANCE CRITERIA

- [ ] AC 1: every job (`guess_first`, `hint`, `teachback_mark`) has a mocked test for valid output, invalid JSON twice, and provider down (Tasks 6-9).
- [ ] AC 2: a test proves the pre-attempt view has no `answers` or `mark_scheme`, at the object (`view.test.ts`) **and** in the serialised prompt (`hint.test.ts`, `guess_first.test.ts`).
- [ ] AC 3: the answer-free view is the only job input until an `attempt` event for that item exists. This is checked in code (`jobItem`, `CALL_POINT`), and generated items are matched on id and seed.
- [ ] AC 4: `teachback_mark` receives the mark scheme (`mark_scheme ?? working`) and returns marks per line, exactly one per pupil line, never a solution field.
- [ ] AC 5: the regex guard and the invented-number rule run on every model reply. The shadow-judge hook logs `would_block` and never changes the verdict.
- [ ] AC 6: one retry on invalid JSON, a wrong shape or a guard failure, then fallback. Other failures go straight to fallback.
- [ ] AC 7: `src/flow/chat.ts` calls each job at its named point (`CALL_POINT`) and continues on no verdict.
- [ ] AC 8: with no key set (preset `none`, or no config), every path runs its fallback and makes 0 provider calls.
- [ ] AC 9: `/api/chat` validates before any job runs. The key-leak walk passes with no live call.
- [ ] AC 10: every quiz item links to the panel with its id (and seed) encoded.
- [ ] AC 11: `app/chat.html` has "This is an AI" in static markup, fixed on screen (test + Level 4 step 2).
- [ ] AC 12: a real model reply travels the HTTP route end to end (fake provider test in `src/server.test.ts`). A 140 s slow reply still reaches the page (Level 4 step 8).
- [ ] AC 13: one teach-back verdict per item per London day. A repeat is refused before any model call.
- [ ] `bun run check` green (`observed`, with the command named in the report).
- [ ] PR body restates the guard (the five points under "The guard, restated").

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task's validation passed immediately
- [ ] `bun run check` green
- [ ] Level 4 steps 1-8 run, or each one not run is named with the reason
- [ ] Prose (fallback lines, system prompts, page copy) passed `no-ai-slop` then `humanizer`
- [ ] Divergences D1-D3 recorded in the execution report and the PR body

---

## OPEN QUESTIONS / ASSUMPTIONS

All of the following are decided in this plan. None blocks implementation. Q8 is the only one that is not T9's to decide.

- **Q1 Decided: the mark scheme is `mark_scheme ?? working`.** No maths item has a `mark_scheme` (`observed`: 0 of 105). A valid alternative method can be marked 0. The page mitigates this: it always shows the working beside the marks, with "The tutor's marks can be wrong" (Task 14). Marks feed no rung or XP amount (`src/flow/xp.ts:11-15`: teach-back XP is a flat 15). The fix is content work (a `mark_scheme` per item), not T9.
- **Q2 Decided: with no model, a teach-back writes no event and earns no XP.** Recording `marks: 0, of: n` with no verdict would put false marks in the record, which D3 treats as permanent. The pupil still sees the working.
- **Q3 Decided: `would_block` goes to the console.** No judge is configured in v1, so no line is ever lost. A parent-facing place for it waits for the digest (PRD Q7, architecture Q13).
- **Q4 Decided: one teach-back verdict per item per London day** (`taught-today`, Task 10). The worst case without the limit was a pupil resubmitting for 15 XP each time. The limit is checked before the model call, so it costs no tokens.
- **Q5 Decided: a guard failure spends the one retry.** The hint probe used about 100 tokens a call (`observed`, S2 table: 90-103). Worst case per request: 2 calls.
- **Q6 Decided: guess-first is per item.** v1 did it per topic, before the lesson. In v2 the chat opens per item, and the first item of a lesson serves as v1's "one cold question".
- **Q7 Decided: timeouts.** Worst case, one job takes 240 s (`derived`: a not-json reply just under the 120 s `DEFAULT_TIMEOUT_MS`, then a retry that times out). Two requests queued from two tabs take 480 s (`derived`: 240 + 240). Bun's idle cut is disabled for `/api/chat` (Task 12, spike `observed`). `chat.js` shows "Thinking…".
- **Q8 Not T9's: model quality.** The planning probe (`observed`, `qwen2.5vl:3b`, 22 calls) returned wrong maths in words that no code check can catch, for example "focus on finding five-eighths". It also marked correct teach-back lines 0. T9 bounds the damage: every number checked, answer withheld, the working always beside marks, and "This is an AI. It can be wrong." on screen. Whether local models may run these jobs at all is architecture S4's decision rule ("zero wrong-number outputs → local allowed for all jobs / else local: hints only"). S4 has not been run on the 8B model it names. Recommendation: run S4 before E2 with the 8B model, sending T9's real prompts through `chatJson` the way this plan's probe did. S4 is not pulled into T9 (CLAUDE.md: one experiment per epic).

## NOTES (open canvas)

**S2 question answered (architecture Q12, "whether a job may take the last of several blocks is T9's
call").** No. `parseJsonReply` stays single-block. A self-correcting reply is `not-json`, gets one retry,
then falls back. Reason, as T8 gave it: taking the last block lets the model's second reading of a
number pick the mark, which CLAUDE.md rules out ("No model call … decides a numeric answer"). The cost
is a fallback on some Anthropic-compat replies. For teach-back, fallback means no marks, so the pupil
sees the working. Task 15 records this in the architecture doc.

**Why a number-source rule and not an answer-token check.** A check that a note does not contain `answers[0]`
would reject "you need 2 lots of 10%" whenever the answer is 2, and small integers are common answers
(`observed`: `1MA1/R9/of-an-amount` answers include "9"). The number-source rule asks something different:
did this number come from the question or the pupil? For teach-back notes the mark scheme is left out of
the sources, so the corrected value can never appear unless the pupil wrote it. That is the property
"never a corrected solution" needs.

**Planning spikes (all `observed` this session, scripts in the session scratchpad, nothing committed).**

| Spike | Result |
|---|---|
| Bun idle timeout on an awaiting `routes` handler | cut at 4,018 ms with `idleTimeout: 1`; `srv.timeout(req, 0)` → 200 at 9,003 ms |
| Brand vs raw `Item` under `tsc` | TS2322 without the directive, exit 0 with it |
| Biome on `src/jobs/guess_first.ts` | exit 0, no naming rule |
| Browser vs server generated items | 105 comparisons, 0 differences |
| Guard regexes | 7 of 7 bad samples flagged; 18 clean samples, 0 flagged after excluding © ® ™ and ↔-↙ ↩ ↪ |
| `qwen2.5vl:3b` hint, 11 calls | 11 parsed with the right shape, 0 regex hits, 3 of the 6 in run 2 had invented numbers |
| `qwen2.5vl:3b` guess_first, 6 calls | 5 parsed, 3 of 5 with invented numbers |
| `qwen2.5vl:3b` teachback, 5 calls | 3 parsed with the right shape, 2 not-json; all 3 marked correct lines 0 |

**Why brands, not a runtime check alone.** `toItemView` already strips at runtime. The failure it
cannot stop is a later job author passing the raw `Item` to a pre-attempt prompt, because `ItemView`
is a structural `Omit` and a full `Item` satisfies it. The brand makes that a compile error, and the
`@ts-expect-error` test keeps the brand from being loosened silently.

**Size** (`expected`): jobs ~450 lines, flow + api ~250, app ~250, tests ~800, about 1,750 in all. That
is above the ticket's 900-1,300 because of the 12-row retry table and the per-job test matrix, which
the AC requires.

## CONFIDENCE

**9/10 for a one-pass implementation.** Each assumption the plan makes about Bun, TypeScript, Biome, the generators, the regexes and the provider was run this session, not inferred (spike table above). The remaining point is the size: about 1,750 lines across 17 tasks, plus a prose gate that is judgement, not a command. No further planning removes that. The per-task validation commands are the control for it.

## AMENDMENTS

- 2026-09-28: risks addressed before implementation. Added the invented-number rule (guard.ts, per-job `sources`) after the Ollama probe showed wrong maths in parsed replies. Added one teach-back verdict per item per day (Q4). The working is now always shown beside marks (Q1). Every Q is now a decision (Q8 excepted, and handed to S4). The spikes turned the idle timeout, brand, Biome naming, generator parity and regex claims into `observed` results. The emoji regex was narrowed after `©` and `↔` matched.
- 2026-09-28, as shipped (supersedes the task text where they differ; detail in `.claude/reports/t9-model-jobs-report.md`):
  - Task 12 / AC 13: `postChat` also re-checks `taughtOn` (now exported from `src/flow/chat.ts`) on a fresh log read just before `postEvent`. On a hit it returns the marks with `saved: false` and writes nothing, so two in-flight teach-backs for one item save once. A `Promise.all` test in `src/api/chat.test.ts` covers it.
  - Task 12 GOTCHA (idle timeout): Level 4 step 8 did not reproduce the 120 s cut on Bun 1.3.4 at the default `idleTimeout` (140-145 s requests answered, with and without the line; observed). `server.timeout(req, 0)` stays, as defence. The route types the server argument structurally (`IdleControl`).
  - Tasks 7-8: exports are `hint`, `guessFirst`, `teachbackMark`. Hint and guess share `textReply` in `define.ts`.
  - Task 4: the fixture also exports `KEY`, `NOW`, `SENTINELS`, `down` and `Reply`. `mockFetch` repeats its last reply.
  - Task 14: the guess label is "How would you do this one? A rough guess is fine." (prose gate). With an empty working box, Hint sends "No working yet.", since `text` must be 1-2000 characters.
  - Task 11: the no-generator `findItem` case uses a pack copy with an empty generator table, because all 21 maths topics have one.
  - Known gap, not fixed: `taught-today` on a `#gen` item blocks every generated item of that topic for the day (`TeachbackV1` has no seed; the fix is `teachback@2`).
  - Pre-PR review: `findItem` refuses a seed above 4294967295; `teachback_mark.test.ts` covers the `mark_scheme ?? working` path. Recorded, not fixed: `/api/event` accepts a posted `teachback` (R1, T4 route), the invented-number rule refuses "divide by 100" hints (R2), and pupil numbers count as sources (R3).
