# Feature: T17 intake doors: sheet or photo, five-minute interview, cold diagnostic

The following plan should be complete, but validate documentation, codebase patterns and task sanity before you start implementing.

Pay special attention to the names of existing utils, types and models. Import from the right files. Every `file:line` below was read at `2b20646` (origin/main, T16 merged) in the worktree `~/Desktop/study-tutor-t17`, branch `feature/t17-intake-doors`. The main checkout's local `main` is stale (it sits at `ab1ddd9`); do not read code there.

## Feature Description

Three ways for a pupil to tell the tutor where they stand, all landing on the same topic map through one `intake@1` event:

1. **Sheet or photo.** The pupil pastes the text of a school sheet (a Sparx-coded test report, the public topic-code sheet, a teacher email) or drops a photo or screenshot of one. A model job (`intake_read`) copies the codes and the R/A/G beside each. Code resolves every code through `aliases` to a topic id; a code the pack does not hold is listed back as unknown and never written. With no model, pasted text is read by a deterministic extractor; a photo gets no verdict and the page asks for text instead.
2. **Interview.** Three fixed questions (code owns them and the stop): what could you do in a test tomorrow, what feels shaky, what loses you. One model job (`interview`) maps the answers onto a closed list of topic ids with the pupil's confidence (`confident | unsure | stuck` → G/A/R). With no model, the same door is a self-rating checklist over every topic.
3. **Cold diagnostic.** A deterministic mixed test, no model: one question per topic for up to 8 topics not yet on the ladder (rung 0), unrated ones first, from `generators.js` or, for a topic with no generator (science), from its items that carry `answers`. Marked in the browser with `quiz.mark`; right and Sure → G, right and Not sure → A, wrong → R.

Every door ends on a confirm list in `app/intake.html`; the pupil ticks what is right and the page posts one `intake@1` body to `/api/event`.

## User Story

As a pupil starting the tutor (or a parent setting it up)
I want to hand over my school's latest test sheet, say what I find hard, or sit a short cold test
So that the map starts from where I actually am instead of every topic grey

## Problem Statement

`intake@1` exists (`src/events/types.ts:48-51`, reducer `src/events/replay.ts:141-150`) but nothing produces it except a hand-posted body (T16's E5 walk). A new install shows 22 grey topics and `pickLesson` has no red topic to put first. PRD constraint 4 requires three doors; T16 AC 9 (science through all three doors) is owed by this ticket.

## Solution Statement

- Two model jobs in `src/jobs/` built on `defineJob` (`src/jobs/define.ts`), whose inputs hold topic ids, titles and aliases plus the pupil's text or image, and never an `Item`, `ItemView` or `PreAttempt`.
- One pure flow module `src/flow/intake.ts` that resolves codes, maps confidence to R/A/G, merges duplicates (worst R/A/G wins) and builds the `intake@1` body for all three doors (`intakeRecord`).
- One pure flow module `src/flow/diagnostic.ts` (`diagnostic(state, day, pack)`, `ragFor(correct, sure)`), shaped like `boss` (`src/flow/boss.ts:86`).
- `src/api/intake.ts` with three handlers, wired in `src/server.ts` through the existing `postJobRoute` (`src/server.ts:310`) and `dayRoute` (`src/server.ts:147`).
- `app/intake.html` + `app/intake.js`: three tabs, a confirm list, one post to `/api/event`. It reuses `window.boss.buildItems` and `itemsFile` from `app/retest.js` for the diagnostic questions.

## Out of Scope / Non-Goals

- **PDF upload.** The donor sheets are PDFs; the provider seam sends `image_url` parts only (`src/providers/openai-compatible.ts:4-6`). A parent pastes the PDF's text or takes a screenshot. PDF parsing is a follow-up if E2 shows parents stuck here.
- **Storing the sheet.** The image and the pasted text are not written to `data/`. Only the confirmed `intake@1` line is.
- **Statement-level expansion.** A code `1MA1/R9` resolves only if it is a topic id or alias; it does not fan out to `1MA1/R9/of-an-amount` and `1MA1/R9/increase-decrease`.
- **Attempt, XP or session events from the diagnostic.** An attempt would award 10 XP (`src/flow/xp.ts`), move calibration and unlock `hasAttempt` for the item (`src/jobs/view.ts`). The diagnostic posts the intake line only. No `session` start/end for any door.
- **Tightening `/api/event`.** `resolveTopic` (`src/api/event.ts:12-20`) deliberately passes an unknown code through. The page never posts one; the server rule stays (Q1).
- **A new event version.** `intake@1` is unchanged. Confidence and diagnostic scores map to R/A/G in code.
- **Multi-turn chat.** The interview is three fixed questions and one job call, not an open conversation.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium-High (two jobs, two flow modules, one page with three modes)
**Primary Systems Affected**: `src/jobs`, `src/flow`, `src/api`, `src/server.ts`, `app/`
**Dependencies**: none new. Bun, TypeScript, biome, happy-dom (already dev deps).

## Related Work

**Implements**: #19 (T17) · **Epic**: #1 · PRD `docs/prd/study-tutor-v2.prd.md` (constraint 4, non-goals) · Architecture `docs/prd/study-tutor-v2.architecture.md` D2, D3, D4, D5

**Back-references**:

- `.claude/plans/t9-model-jobs.md` — `defineJob`, the reply guard, the typed answer guard (`PreAttempt`/`PostAttempt`).
- `.claude/plans/t6-o1-pages.md` — boss page: browser builds questions from ids and seeds, marks with `quiz.mark`, posts through `/api/event`.
- `.claude/plans/t16-science-pack-oak.md` — `loadPacks`, `/api/topics` rows with `subject`, AC 9 owed here (line 495), and the #19 comment asking the diagnostic to fall back to items.
- `.claude/plans/t13-examiner-mode.md` (if present) — the vision job and `decodeDataUrl`/`sniffImage` in `src/snap.ts`.

**Forward-references**: (none yet)

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `src/jobs/define.ts` (whole file, 160 lines) — `defineJob`, `JobSpec` (`prompt`, `validate(value, input)`, `texts`, `sources`, `fallback`, `maxTokens`), `preAttemptSystem` (line 26), `postAttemptSystem` (line 37, has the `num` override this plan mirrors), `recordFailure` (line 136: every non-`no-model` fallback appends `job@1`).
- `src/jobs/guard.ts` — `guardReply(texts, sources)`: the invented-number rule refuses any digit in `texts` that is not in `sources`. This is why both intake jobs set `texts: () => []` (see GOTCHA in Task 3).
- `src/jobs/examiner_mark.ts` — the one vision job: `imagePart(bytes, mime)` (`src/providers/openai-compatible.ts`), a text part then an image part, `postAttemptSystem(TASK, NUM)` with a replaced number line.
- `src/jobs/hint.ts` — a small job file: named fields only in `prompt`, a `fallback`, `textReply`.
- `src/jobs/__fixtures__/provider.ts` — `withData`, `mockFetch`, `chatReply`, `down`, `NO_MODEL`, `OPENAI`, `NOW`, `SENTINELS`, `sentinelItem`, `countFailures`.
- `src/jobs/hint.test.ts` — the three-case job test shape (valid, invalid JSON twice, provider down) plus a guard refusal.
- `src/flow/boss.ts` (whole file) — pure pick over `CasePack`; `slotsFor` (line 48) with the answers filter at line 57; `hash`, `shuffle` from `src/flow/detective.ts:43,53`; `lcg` from `src/content/generators.ts`.
- `src/flow/boss.test.ts` — pure flow test pattern with a real pack.
- `src/api/case.ts` — `loadPacks(root)` (merged pack + topic id → subject), `loadCasePack`.
- `src/api/event.ts` — `resolveTopic` (line 17), `postEvent` (line 62). The page posts the confirmed body here.
- `src/api/next.ts`, `src/api/state.ts` (`currentState(dataDir)`) — how an API handler reads the replayed state.
- `src/api/chat.ts` — a job-backed POST handler: validate the whole body first, `Result = {status, body}`, `bad(error)`.
- `src/server.ts` — `dayRoute` (147), `postJobRoute` (310), `apiRoutes` (373–489). `"/api/coach"` (444) is the closest shape: a `dayRoute` GET and a `postJobRoute` POST.
- `src/snap.ts` — `MAX_PHOTO_BYTES` (28), `sniffImage` (75), `decodeDataUrl` (91). Reuse both for the sheet photo.
- `src/events/types.ts` — `IntakeV1` (48), `FIELDS["intake@1"]` (186: `topics.length > 0`, so an empty intake is refused), `Rag`, `NewEvent`.
- `src/events/replay.ts:141-150` — the intake reducer: sets `rag`; an R row calls `afterRed`.
- `app/retest.js` — `buildItems(boss, topics, itemsByTopic, gens, quiz)`, `itemsFile(row)`, `fetchPack` (uses `/api/topics`), `buildQ`, `wireCheck`, and the load-time guard (`document.getElementById("boss")`) that makes it safe to load on another page.
- `app/quiz.js` — `quiz.mark(item, typed)` (82), `quiz.norm`, `quiz.lcg`, `quiz.itemFromGenerated` (95). Sure/Not sure radio markup at 330–336 (copy the markup, not the code).
- `app/retest.html`, `app/chat.html` — page skeleton and the "This is an AI" line placement.
- `src/marking/retest.test.ts` — page unit tests under Bun: load `quiz.js` then the page file, read `globals()`. Line 198–235: the POST-path regex this ticket must extend. Line 181: the register test shape.
- `src/marking/retest-dom.test.ts` — DOM test pattern (happy-dom registered per file, `?dom` import).
- `src/server.test.ts:344-410` — the key-leak walk over every route; new routes are walked automatically.
- `scripts/fake-provider.ts` — the stand-in provider for Level 4; `contentFor` picks a reply by message shape. The image branch comes first today (it would answer an intake photo with examiner lines).
- `content/maths/topics.json`, `content/science/topics.json` — aliases: `U349`… and `4.1.1.2` (not Sparx-shaped).
- `content/science/items/8464-4.1.1.2.json` — items #1–#5 have `answers` (vocab, label, sequence); #6 is `short` with none.

### New Files to Create

- `src/jobs/intake_read.ts` — the sheet/photo job and the deterministic text reader `readCodes`.
- `src/jobs/intake_read.test.ts`
- `src/jobs/interview.ts` — the interview mapping job.
- `src/jobs/interview.test.ts`
- `src/flow/intake.ts` — `resolveCodes`, `CONFIDENCE_RAG`, `mergeRows`, `intakeRecord`, `readSheet`, `runInterview`, `INTERVIEW_QUESTIONS`.
- `src/flow/intake.test.ts` — includes the identical-map AC and T16 AC 9.
- `src/flow/diagnostic.ts` — `diagnostic`, `ragFor`, `MAX_DIAGNOSTIC_TOPICS`.
- `src/flow/diagnostic.test.ts`
- `src/api/intake.ts` — `postSheet`, `postInterview`, `diagnosticForDay`.
- `src/api/intake.test.ts` — includes the sentinel guard test and the no-key diagnostic.
- `app/intake.html`, `app/intake.js`
- `src/marking/intake.test.ts` — page unit tests (copies agree, bodies, register).
- `src/marking/intake-dom.test.ts` — unknown-code line, diagnostic save posts one body.

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- `.claude/references/model-jobs.md` — job rules, retry table, answer guard.
- `.claude/references/events.md` — routes, replay, page tests under happy-dom.
- `.claude/rules/content.md` — pupil-facing text rules (loads for `src/jobs/**`).
- `.claude/references/content-pack.md` — aliases, topic id grammar.
- Bun test: https://bun.sh/docs/test/writing (`test`, `expect`, `spyOn`). Already in use; no new API.

### Patterns to Follow

**Job file** (`src/jobs/hint.ts`): a header comment on what the job sees and never sees; `prompt` reads named fields only; `defineJob<I, O>({ name, prompt, validate, texts, sources, fallback })`.

**Pure flow + thin API**: flow reads no clock and no file (`src/flow/boss.ts:1-5` header). The API reads the clock once (`dayRoute`) and the log once (`currentState`, `readLines`) and passes values down.

**Result shape** (`src/api/chat.ts:21-24`): `type Result = { status: number; body: unknown }`; `bad(error)` → 400.

**Page module** (`app/retest.js:1-9, 395-403`): an IIFE; a `TEXT` table for every pupil string; nothing touches `document` at load when there is none; exports on `globals().<name>` for the tests.

**Copies that must agree** (`app/retest.js:40-44` `passes` with `src/marking/retest.test.ts:61`): a browser copy of a server rule carries a comment naming its twin, and a test compares them.

**Error text**: sentence case, no field value echoed (`src/api/chat.ts:24-30`).

---

## IMPLEMENTATION PLAN

### Phase A: Jobs and flow (server, pure where possible)

`define.ts` override, both jobs, `flow/intake.ts`, `flow/diagnostic.ts`, their tests.

### Phase B: API and routes

**Depends on:** Phase A.

`src/api/intake.ts`, three routes in `src/server.ts`, the fake provider's intake branches, API tests.

### Phase C: Page

**Depends on:** Phase B (it calls the routes). Its pure helpers can be written against Phase A.

`app/intake.html`, `app/intake.js`, index link, page tests, the POST-regex update.

### Phase D: Docs and validation

References updated, prose gate, `bun run check`, Level 4.

---

## STEP-BY-STEP TASKS

### 1. UPDATE `src/jobs/define.ts` — a number-line override on `preAttemptSystem`

- **IMPLEMENT**: `export function preAttemptSystem(task: string, voice = VOICE, num = NUM): Message` and use `num` in place of `NUM` in the join. Extend the doc comment: "`num` replaces the invented-number line for a job with no question (intake copies codes)." No other change.
- **PATTERN**: `postAttemptSystem(task, num = NUM)` at `src/jobs/define.ts:37`.
- **GOTCHA**: the guard line (`PRE_ATTEMPT_GUARD`) stays in every call; do not add a flag that drops it. Existing callers pass one or two arguments and are unchanged. `src/jobs/define.test.ts` may assert the exact system text; run it.
- **VALIDATE**: `bun test src/jobs/define.test.ts src/jobs/hint.test.ts src/jobs/dan_wrong_step.test.ts`
- **SATISFIES**: Guard (the system message of both intake jobs carries the guard line).

### 2. CREATE `src/jobs/intake_read.ts` — sheet or photo → codes

- **IMPLEMENT**:
  ```ts
  export type SheetSource =
    | { kind: "text"; text: string }
    | { kind: "image"; bytes: Uint8Array; mime: string };
  export type IntakeReadInput = { source: SheetSource; known: readonly string[] }; // known: every topic id and alias, for the no-model reader only
  export type CodeRow = { code: string; rag: Rag | null };
  export type IntakeReadOutput = { codes: CodeRow[] };
  export const MAX_CODES = 80;
  ```
  - `readCodes(text, known): CodeRow[]` — deterministic, and blind to line breaks: split the whole text on whitespace into tokens, in order. A code token is Sparx-shaped (`/^[UuMm]\d{3},?$/`, upper-cased, trailing comma dropped) or equal, case-insensitively and after stripping one trailing comma, to a `known` id or alias. Its R/A/G is the token directly before it when that token is exactly `R`, `A` or `G`; else, when the token before it is a code ending in a comma (`U745, U736`), that code's R/A/G; else `null`. Rows in text order; duplicates kept (the flow merges them).
    **Observed during planning** (locally, output never saved or committed), on both donor sheets (`mock 1` and `March 26`, 25 distinct codes each), against the `pdftotext -layout` table as the reference: this rule gives **25 of 25 codes with the right R/A/G, 0 null, on all four text engines**: `pdftotext -layout` (letter and code on one line), `pdftotext` raw (letter alone on the line before the code), Apple PDFKit `PDFDocument.string` (the engine under Preview; several pairs on one line: `G U325 G M901 G U179 R U349`), and PDFium `get_text_range` via `pypdfium2` (the engine under Chrome's viewer). A per-line rule fails the PDFKit layout; the token rule does not, because it never looks at lines. The legs this does not cover: a viewer's clipboard handler may differ from its engine's text API in whitespace only, which the rule ignores.
  - `prompt`: `preAttemptSystem(TASK, undefined, NUM)` where `TASK` asks for every topic code printed on the sheet with the R/A/G printed beside it (null when none is printed), reply `{"codes": [{"code": "U349", "rag": "R"}]}`, and `NUM` = `"Copy each code exactly as it is printed. Never make up a code, and never add a code for a topic name that has no code printed beside it."`. Text source → one user message `Sheet text:\n${text}`. Image source → `[{type:"text", text:"The photo is a school sheet."}, imagePart(bytes, mime)]`.
  - `validate(value, input)`: object with `codes` array of at most `MAX_CODES`; each row `code` a string of 1–40 chars (the longest topic id is 25: `1MA1/R9/increase-decrease`, observed) matching `/^[A-Za-z0-9./-]+$/`, `rag` one of `"R" | "A" | "G" | null`. For a text source, every code (upper-cased, spaces removed) must appear in the upper-cased, space-stripped text, else `null` (→ `shape`, one retry). Codes upper-cased in the output.
  - `texts: () => []`, `sources: () => []`.
  - `fallback`: text source → `{ codes: readCodes(text, known) }`; image source → `null` (no verdict).
  - `maxTokens`: leave the default (1024). Derived: 80 rows × about 12 tokens a row ≈ 960, under 1024; the real sheets hold 24 rows (observed: donor PDFs via `pdftotext`).
- **PATTERN**: `src/jobs/examiner_mark.ts` (image part, replaced number line, `validate` using `input`); `src/jobs/hint.ts` for layout.
- **IMPORTS**: `imagePart, type Message` from `../providers/openai-compatible`; `defineJob, preAttemptSystem` from `./define`; `type Rag` from `../events/types`.
- **GOTCHA**: `texts` must be `[]`. `guardReply` refuses any digit in `texts` not found in `sources` (`src/jobs/guard.ts`), so `texts: o => o.codes.map(c => c.code)` would refuse every photo reply (sources are empty for an image) as `invented-number`. Codes are identifiers checked by the charset in `validate`, not prose. The anti-invention check for text is the substring rule in `validate`; for a photo it is the confirm list on the page (R1).
- **GOTCHA**: the prompt never includes `known`. Listing the pack's codes would invite the model to map a topic name to a code the sheet does not print, which is inventing.
- **VALIDATE**: `bunx tsc --noEmit`
- **SATISFIES**: AC 2 (sheet door), Guard.

### 3. CREATE `src/jobs/intake_read.test.ts`

- **IMPLEMENT** (use `withData`, `mockFetch`, `chatReply`, `down` from `./__fixtures__/provider`):
  1. valid text reply → `{by:"model", value:{codes:[{code:"U349",rag:"R"},{code:"U976",rag:"G"}]}}` when the text contains both.
  2. invalid JSON twice → fallback = `readCodes` of the text; `calls.length === 2`; one `job@1` line with reason `not-json` (`countFailures`).
  3. provider down → fallback, one call.
  4. a code not in the pasted text (`U999`) → `shape`, retried, then fallback.
  5. image source, provider down → `{by:"fallback", value:null}`.
  6. image source, valid reply with `U349` → accepted (not refused as `invented-number`). This is the test that fails if Task 2's GOTCHA is ignored.
  7. `NO_MODEL` config, text source → no fetch call (`calls.length === 0`), fallback value.
  8. `readCodes` on a synthetic copy of the Sparx layout (write it by hand, never from the donor PDFs):
     ```
     4   Percentage of an amount   1   100%   1   G   U349
     12  Working with fractions    3   100%   3   G   U745, U736
     1   Multiplying by 10s        1   100%   1   G   M113
     x   Cells                     2   0%     0   R   4.1.1.2
     ```
     → `U349 G`, `U745 G`, `U736 G`, `M113 G`, `4.1.1.2 R` (with `known` containing `4.1.1.2`). A code with no R/A/G token directly before it gives `null`. Also, each as its own case: raw layout `"G\nM113\nR\nU349"` → `M113 G`, `U349 R`; PDFKit layout `"2 G U325 G M901 G U179 R U349 Multiplying by 10s"` → `U325 G`, `M901 G`, `U179 G`, `U349 R`; `"U739"` alone → `U739 null`.
  9. the image request carries one `image_url` part and the system message contains `PRE_ATTEMPT_GUARD`.
- **VALIDATE**: `bun test src/jobs/intake_read.test.ts`
- **SATISFIES**: AC 2 (mocked), AC 5 (every job has a fallback test).

### 4. CREATE `src/jobs/interview.ts` — answers → topic ids with confidence

- **IMPLEMENT**:
  ```ts
  export const CONFIDENCES = ["confident", "unsure", "stuck"] as const;
  export type Confidence = (typeof CONFIDENCES)[number];
  export type TopicRef = { id: string; title: string; aliases: readonly string[] };
  export type InterviewInput = { topics: readonly TopicRef[]; answers: Record<Confidence, string> };
  export type InterviewRow = { topic: string; confidence: Confidence };
  export type InterviewOutput = { topics: InterviewRow[] };
  ```
  - `prompt`: `preAttemptSystem(TASK, undefined, NUM)`; `TASK` = match what the pupil said to topics in the list, one row per topic they named or clearly described, `confidence` from which answer it came from, skip anything that matches no listed topic, reply `{"topics": [{"topic": "<id from the list>", "confidence": "confident|unsure|stuck"}]}`. `NUM` = `"Use only topic ids from the list, copied exactly. Never make up an id."`. User message: one line per topic `${id}: ${title} (${aliases.join(", ")})`, then three labelled answers (`Could do in a test tomorrow:`, `Met it but shaky:`, `Loses me or not taught yet:`), empty answers written as `(nothing)`.
  - `validate(value, input)`: `topics` an array of at most `input.topics.length` rows; each `topic` a string that is one of `input.topics[].id` (else `null` → `shape`), `confidence` one of `CONFIDENCES`. An empty array is valid (nothing matched).
  - `texts: () => []`, `sources: () => []` (ids only, no prose shown).
  - `fallback: () => null`.
- **PATTERN**: `src/jobs/hint.ts`.
- **GOTCHA**: the input type holds `TopicRef` only. Do not pass `CasePack` or `Topic` (a later `Topic` field could carry content); the API maps `pack.topics` to `{id, title, aliases}`.
- **VALIDATE**: `bunx tsc --noEmit`
- **SATISFIES**: interview door, Guard.

### 5. CREATE `src/jobs/interview.test.ts`

- **IMPLEMENT**: valid reply; invalid JSON twice → `null`, 2 calls; provider down → `null`; an id not in the list (`1MA1/Z99`) → `shape`, retried, `null`; `NO_MODEL` → no call; the user message lists every topic id and none of `SENTINELS` (build `topics` from ids and titles only).
- **VALIDATE**: `bun test src/jobs/interview.test.ts`
- **SATISFIES**: AC 5.

### 6. CREATE `src/flow/intake.ts`

- **IMPLEMENT** (pure except the two job calls, which take `JobDeps`):
  ```ts
  export const DOORS = ["sheet", "interview", "diagnostic"] as const satisfies readonly IntakeV1["door"][];
  export const CONFIDENCE_RAG: Record<Confidence, Rag> = { confident: "G", unsure: "A", stuck: "R" };
  export type IntakeRow = { topic: string; rag: Rag };
  export type SheetRow = { topic: string; rag: Rag | null; code: string }; // code: the first sheet code that resolved to this topic
  /** R beats A beats G; null only when every value is null. */
  export function worst(a: Rag | null, b: Rag | null): Rag | null
  /** One row per topic, first-seen order, worst R/A/G kept. */
  export function mergeRows<R extends { topic: string; rag: Rag | null }>(rows: readonly R[]): R[]
  /** Exact topic id or alias (case-insensitive) → id; anything else is unknown. Unknown codes deduped, first-seen order. */
  export function resolveCodes(topics: readonly Topic[], codes: readonly CodeRow[]): { rows: SheetRow[]; unknown: string[] }
  /** The intake@1 body, or null when no row is left (FIELDS refuses an empty topics list). */
  export function intakeRecord(door: IntakeV1["door"], rows: readonly IntakeRow[]): NewEvent | null
  export const INTERVIEW_QUESTIONS: Record<Confidence, string> // pupil-facing, prose-gated (Task 17)
  export const MAX_ANSWER = 500;
  export type NoVerdict = { by: "none"; reason: "no-model" | "failed" }; // failed = a model is set up but gave no usable reply (text-only model on a photo, timeout, refused shape)
  export type SheetReply = { by: "model" | "fallback"; rows: SheetRow[]; unknown: string[] } | NoVerdict;
  export async function readSheet(source: SheetSource, topics: readonly Topic[], deps: JobDeps): Promise<SheetReply>
  export type InterviewReply = { by: "model"; rows: IntakeRow[] } | NoVerdict;
  export async function runInterview(answers: Record<Confidence, string>, topics: readonly Topic[], deps: JobDeps): Promise<InterviewReply>
  ```
  - `readSheet` builds `known` from every topic's id and aliases, runs `intakeRead`, and on a value calls `resolveCodes`, then `mergeRows` on the rows. `by` is `"model"` or `"fallback"` from the verdict; `null` value → `{by:"none", reason}` with `reason` `"no-model"` when the verdict's reason is `no-model`, else `"failed"`.
  - `runInterview` maps topics to `TopicRef` (`{id, title, aliases}` only), runs `interview`, maps each row's confidence through `CONFIDENCE_RAG`, then `mergeRows`. `null` → `{by:"none", reason}` as above.
- **PATTERN**: `src/flow/chat.ts` (flow calls jobs and returns a typed reply; the API writes nothing here).
- **GOTCHA**: `resolveCodes` is where "never a topic invented" lives for the sheet. An unknown code is valid output that goes to `unknown`; it is never passed to `/api/event`, where `resolveTopic` would let it through (`src/api/event.ts:12-20`).
- **GOTCHA**: `intakeRecord` receives rows with a non-null `rag`. The page drops unticked rows and rows whose R/A/G the pupil has not picked before it builds the body.
- **VALIDATE**: `bunx tsc --noEmit`
- **SATISFIES**: AC 2, AC 3, Guard.

### 7. CREATE `src/flow/diagnostic.ts`

- **IMPLEMENT**:
  ```ts
  export const MAX_DIAGNOSTIC_TOPICS = 8; // derived: the boss's 9 questions ≈ 20 minutes (expected, boss.ts:20), so 8 ≈ 18 minutes
  export type DiagnosticSlot = { topic: string; item: string | null; seed: number }; // the BossSlot shape, so retest.js's buildItems builds it
  export type Diagnostic = { day: string; seed: number; topics: string[]; slots: DiagnosticSlot[] };
  /** Right and Sure → G, right and Not sure → A, wrong → R. app/intake.js holds the copy. */
  export function ragFor(correct: boolean, sure: boolean): Rag
  export function diagnostic(state: State, day: string, pack: CasePack): Diagnostic | null
  ```
  - Pool: pack topics at rung 0 (`(state.topics[id]?.rung ?? 0) === 0`) only. Order: those whose `rag` is null or absent first, in pack order; then the rated ones, in pack order. A topic at rung 1 or above belongs to the boss and is never asked here: a red intake row sends rungs 2–4 back to 1 (`RED` at `src/flow/ladder.ts:21`, reducer `src/events/replay.ts:141-150`), so one wrong cold answer would undo what the 2-of-3 re-test rule protects.
  - One slot per topic: a generator (`typeof pack.gens[topic.aliases[0] ?? ""] === "function"`) → `{item:null, seed: hash(`${day}:diagnostic:${id}`)}`; else the topic's items with `(answers?.length ?? 0) > 0`, the one with the lowest `hash(`${day}:${itemId}`)` (ties by id) → `{item: itemId, seed: that hash}`; neither → the topic is skipped and takes no place.
  - Take the first `MAX_DIAGNOSTIC_TOPICS` topics that have a slot; `seed = hash(`${day}:diagnostic`)`; `slots = shuffle(slots, lcg(seed))`; `null` when no slot.
- **PATTERN**: `src/flow/boss.ts:48-99` (slot shape, answers filter at 57, `hash`, `shuffle`, `lcg`).
- **IMPORTS**: `lcg` from `../content/generators`; `CasePack` from `../content/types`; `State` from `../events/replay`; `Rag` from `../events/types`; `hash, shuffle` from `./detective`.
- **GOTCHA**: no model, no clock, no file, no `Math.random`. The route reads the day.
- **GOTCHA**: do not key the pool on `rag` alone. Only intake events set `rag`, so a pupil who climbed through lessons and bosses has `rag: null` on topics at rung 3.
- **VALIDATE**: `bunx tsc --noEmit`
- **SATISFIES**: AC 1, T16 AC 9 (diagnostic leg).

### 8. CREATE `src/flow/diagnostic.test.ts`

- **IMPLEMENT** with the real merged pack (`loadPacks(path.resolve(import.meta.dir, "../.."))`):
  1. empty state → 8 slots, 8 distinct topics, the first 8 maths topics in pack order (set equality), every maths slot `item: null`.
  2. same state and day twice → `toEqual`; a different day → different seeds.
  3. every maths topic rated (build a `State` via `replay` of one `intake@1` line with all 21 maths ids at G) → the science topic `8464/4.1.1.2` is in the first 8 with `item` one of `#1`–`#5` (never `#6`, the short item with no answers).
  4. a pack with one topic with no generator and no items with answers → `null`.
  4b. a topic at rung 3 with `rag: null` (build it by replaying lesson ends and passed retests, or set `state.topics[id]` directly on a replayed state) is never in the slots; with every topic at rung ≥ 1 → `null`.
  5. `ragFor`: the four cases.
- **VALIDATE**: `bun test src/flow/diagnostic.test.ts`
- **SATISFIES**: AC 1, T16 AC 9.

### 9. CREATE `src/flow/intake.test.ts` — the identical-map AC and T16 AC 9

- **IMPLEMENT**:
  1. `resolveCodes`: `U349` → `1MA1/R9/of-an-amount`; lower-case `u349` resolves; `4.1.1.2` → `8464/4.1.1.2`; the topic id itself resolves; `U976` → `unknown: ["U976"]`, not in `rows`; duplicates merge worst-first (`G` then `R` → `R`; `null` then `A` → `A`).
  2. `intakeRecord("sheet", [])` → `null`; a record passes `parseEvent` after `t` is added.
  3. **AC 3, identical map.** One fixed row set `[{topic:"1MA1/R9/of-an-amount", rag:"R"}, {topic:"1MA1/R4", rag:"A"}, {topic:"8464/4.1.1.2", rag:"G"}]` reached three ways:
     - sheet: `readSheet({kind:"text", text:"R U349\nA U687\nG 4.1.1.2"}, topics, {dataDir})` with a `NO_MODEL` data dir (deterministic reader);
     - interview: `runInterview(...)` with `mockFetch(chatReply('{"topics":[{"topic":"1MA1/R9/of-an-amount","confidence":"stuck"},{"topic":"1MA1/R4","confidence":"unsure"},{"topic":"8464/4.1.1.2","confidence":"confident"}]}'))`;
     - diagnostic: rows from `ragFor(false, true)`, `ragFor(true, false)`, `ragFor(true, true)` for the three topics.
     Build each door's `intakeRecord`, stamp one fixed `t`, `replay([line])`, and assert the three `state.topics` are `toEqual`, and equal to the expected `{rung:0, nextDue:null, rag}` rows.
  4. **T16 AC 9.** The science topic through each door individually: sheet text `4.1.1.2 R`, interview id `8464/4.1.1.2` `stuck`, diagnostic `ragFor(false, false)`; each replays to `state.topics["8464/4.1.1.2"].rag === "R"`.
  5. `readSheet` with an image source and `NO_MODEL` → `{by:"none", reason:"no-model"}`; `runInterview` with the provider down → `{by:"none", reason:"failed"}`.
- **VALIDATE**: `bun test src/flow/intake.test.ts`
- **SATISFIES**: AC 3, T16 AC 9.

### 10. CREATE `src/api/intake.ts`

- **IMPLEMENT**:
  - `postSheet(body, pack, deps): Promise<Result>` — body `{text}` (string, trimmed 1–20,000 chars) or `{image}` (a data URL through `decodeDataUrl`, then `sniffImage` for the mime; refuse either failing with 400 `"The photo must be a JPEG, PNG or WebP under 5 MB"`). Exactly one of the two, else 400. Calls `readSheet(source, pack.topics, deps)`. 200 body: `{by, rows: [{topic, title, rag, code}], unknown}` or `{by:"none", reason}`. `code` is the first code on the sheet that resolved to that topic (so `resolveCodes` keeps it on `SheetRow`: `{topic, rag, code}`), shown on the page beside a model-read row (R2). `title` from `pack.topics`.
  - `postInterview(body, pack, deps)` — body `{answers: {confident, unsure, stuck}}`, each a string of at most `MAX_ANSWER` after trim, at least one non-empty, else 400. 200 body `{by:"model", rows:[{topic,title,rag}]}` or `{by:"none", reason}`.
  - `diagnosticForDay(dataDir, pack, day)` → `diagnostic(currentState(dataDir), day, pack)` (null passes through; the page says there is nothing to ask).
  - Nothing here appends. The page posts the confirmed body to `/api/event`.
- **PATTERN**: `src/api/chat.ts` (`isObj`, `bad`, whole-body validation before any job runs).
- **IMPORTS**: `decodeDataUrl, sniffImage` from `../snap`; `currentState` from `./state`.
- **GOTCHA**: a 400 body names the rule, never echoes the text or image (`src/api/chat.ts` pattern; key-leak walk posts `{preset:"nope", key}` to every POST).
- **VALIDATE**: `bunx tsc --noEmit`
- **SATISFIES**: AC 1, AC 2.

### 11. UPDATE `src/server.ts` — three routes

- **IMPLEMENT** in `apiRoutes`, after `"/api/coach"`:
  ```ts
  "/api/intake/sheet": { POST: (req, server: IdleControl) => postJobRoute(req, server, root, pack, "Could not read the sheet", (b, p) => postSheet(b, p, { dataDir })) },
  "/api/intake/interview": { POST: (req, server: IdleControl) => postJobRoute(req, server, root, pack, "Could not read your answers", (b, p) => postInterview(b, p, { dataDir })) },
  "/api/intake/diagnostic": { GET: (req) => dayRoute(req, root, pack, "Could not build the cold test", (p, day) => diagnosticForDay(dataDir, p, day)) },
  ```
- **PATTERN**: `"/api/coach"` at `src/server.ts:444`.
- **GOTCHA**: `postJobRoute` turns the idle cut off (`server.timeout(req, 0)`); a photo read can take two tries at 120 s. `dayRoute` accepts `?day=` for manual checks.
- **VALIDATE**: `bun test src/server.test.ts` (the key-leak walk covers the new routes; it will POST `{preset:"nope", key}` and must get a 400 without the key).
- **SATISFIES**: AC 1, AC 2.

### 12. CREATE `src/api/intake.test.ts`

- **IMPLEMENT**:
  1. **AC 1, no key.** `withData(null, …)`: `diagnosticForDay(data, pack, "2026-10-05")` returns 8 slots, with `spyOn(globalThis, "fetch")` asserting zero calls. Also through the server: GET `/api/intake/diagnostic?day=2026-10-05` → 200 (`withServer` at `src/server.test.ts:50` is file-local: add the route case there, or call `apiRoutes(opts)["/api/intake/diagnostic"].GET` directly).
  2. **AC 2, unknown code (mocked).** `OPENAI` config, `mockFetch(chatReply('{"codes":[{"code":"U349","rag":"R"},{"code":"U976","rag":"G"}]}'))`, text `"U349 R\nU976 G"` → 200 `{by:"model", rows:[{topic:"1MA1/R9/of-an-amount", title:"Percentage of an amount", rag:"R"}], unknown:["U976"]}`; the log holds no `intake` line.
  3. **Guard, sentinel.** A pack whose every item is `sentinelItem()` (same topics as the real pack): `postSheet` (text) and `postInterview` with `mockFetch` recording calls; assert no `calls[].init.body` contains any of `SENTINELS`.
  4. validation: `{}` → 400; both `text` and `image` → 400; a non-image data URL → 400; interview all empty → 400; a 501-char answer → 400.
  5. photo with `NO_MODEL` → 200 `{by:"none", reason:"no-model"}`, no fetch; photo with `OPENAI` and the provider returning HTTP 400 twice → `{by:"none", reason:"failed"}`.
- **VALIDATE**: `bun test src/api/intake.test.ts`
- **SATISFIES**: AC 1, AC 2, Guard.

### 13. UPDATE `scripts/fake-provider.ts` — intake replies for Level 4

- **IMPLEMENT**: `src/jobs/intake_read.ts` exports `INTAKE_READ_MARK` and `src/jobs/interview.ts` exports `INTERVIEW_MARK`, each a phrase its `TASK` string is built from (`const TASK = \`${INTAKE_READ_MARK} …\``), so the two cannot drift. `scripts/fake-provider.ts` imports both (the import chain is `define.ts` → `events/append.ts`, all Bun-safe; the fake already runs under Bun). At the top of `contentFor` (before the image branch), read the system text; if it contains `INTAKE_READ_MARK`, return `{"codes":[{"code":"U349","rag":"R"},{"code":"U976","rag":"G"}]}` (image or text); if it contains `INTERVIEW_MARK`, return `{"topics":[{"topic":"1MA1/R4","confidence":"unsure"}]}`. Update the header comment.
- **GOTCHA**: the image branch today returns examiner lines for any image; the intake check must run first. For a text source the fake's `U349`/`U976` must be in the pasted text, or `validate` refuses it (Level 4 step 3 pastes both).
- **VALIDATE**: `bun test scripts/` and `bun test src/snap.test.ts` (examiner replies unchanged).
- **SATISFIES**: Level 4 is performable.

### 14. CREATE `app/intake.html`

- **IMPLEMENT**: the `app/retest.html` skeleton; `<title>Start here</title>`; crumb back to the map; three buttons (`Sheet or photo`, `Tell me`, `Cold test`) that show one of three sections; a `#confirm` section; `#status`. The interview section carries the line "This is an AI. It matches your words to topics. Check each one before you save." Scripts in order: `/content/maths/generators.js`, `/quiz.js`, `/retest.js`, `/intake.js`.
- **GOTCHA**: `retest.js` is loaded for `buildItems` and `itemsFile`; it does nothing on load without `#boss` (`app/retest.js:395-403`). Do not give any element the id `boss`.
- **VALIDATE**: covered by Task 16's register test.
- **SATISFIES**: page.

### 15. CREATE `app/intake.js` and `src/marking/intake-dom.test.ts`, one mode at a time

The page is built in four steps. Each step adds one mode to `app/intake.js` and its cases to `src/marking/intake-dom.test.ts`, and is green before the next starts. A failure then points at one mode.

**Shared shape (all four steps).**

- IIFE; nothing touches `document` at load when there is none (`app/retest.js:395`). Exports: `globals().intake = Object.assign(api, { TEXT, ragFor, intakeBody, confirmRows, tickable })`.
- `api` holds the test seams, as `app/snap.js:80-83` does: `api.encode` (canvas step; happy-dom has no canvas), `api.reload`.
- Helpers copied from `app/retest.js` in this file (they are file-local there): `el`, `getJson`, `postEvent` (POST `/api/event`), `globals`.
- One function per job, each under SonarCloud's cognitive complexity 15 (the T10 plan names this limit, `.claude/plans/t10-mcp-server.md:288`): split render functions rather than branching inside one.
- `TEXT` holds every pupil string (Task 17 lists them). Server strings (titles, codes) go in with `textContent`; the item `figure` is pack SVG, as in `retest.js`.
- DOM test harness: copy `src/marking/retest-dom.test.ts:1-40` (register happy-dom with a `url`, unregister in `afterAll`, `GEN` on `globalThis`, the helpers `doc`, `El`, `keyEvent`, `until` from `src/marking/dom.ts`, and a fake `fetch` that records each request and answers from a `served` table). Import the page with `?dom`.

#### 15a. Confirm list and Save (shared by all doors)

- **IMPLEMENT**:
  - `ragFor(correct, sure)`: copy of `src/flow/diagnostic.ts`, commented as the twin.
  - `intakeBody(door, rows)`: `{v:1, type:"intake", door, topics: rows}`, or null when `rows` is empty. No merge: the confirm list holds one row per topic.
  - `confirmRows(rows, source)`: `rows` are `{topic, title, rag, code?}`; `source` is `"model"` or `"code"`. Each row renders the title, then, when `code` is present, `TEXT.readAs(code)` in a muted span (the code the model read, so the pupil can compare it with the sheet; R2), three R/A/G radios (labels `TEXT.red`, `TEXT.amber`, `TEXT.green`), and a tick box.
  - `tickable(row)`: true once an R/A/G is picked. **Tick rule**: `source "model"` rows start unticked; `source "code"` rows with an R/A/G start ticked; a row with no R/A/G starts unticked and its tick box is disabled until one is picked.
  - Save: `intakeBody(door, ticked rows)` → `postEvent`; success → `TEXT.saved` and a link to `/map.html`; a failed post → `TEXT.notSaved`; nothing ticked → `TEXT.nothingTicked`, no request.
- **TEST** (`intake-dom.test.ts`, 15a): render two code rows (one with R, one with `rag: null`) → the first is ticked, the second's box is disabled; pick A on the second → enabled; Save → exactly one POST to `/api/event` with both rows. Render one model row → unticked; Save → no request, `TEXT.nothingTicked` shown.
- **VALIDATE**: `bun test src/marking/intake-dom.test.ts`

#### 15b. Sheet or photo

- **IMPLEMENT**:
  - A textarea (`TEXT.pasteLabel`) and a file input (`accept="image/jpeg,image/png,image/webp,image/heic"`).
  - `encode(file)`: copied from `app/snap.js:42-76` with a twin comment (downscale to 1568 px on the long side, JPEG 0.85; a file the browser cannot decode is sent as-is only when JPEG, PNG or WebP under 5 MB, else `TEXT.heic`). Do not load `snap.js` here: it runs its own start-up code.
  - Send: `fetch("/api/intake/sheet", { method: "POST", … })` with `{text}` or `{image}`. The literal path keeps `src/marking/retest.test.ts:215` able to find it.
  - Reply `by:"model"` → `confirmRows(rows with code, "model")`; `by:"fallback"` → `confirmRows(rows, "code")`. Then, when `unknown` is not empty, the heading `TEXT.unknownHead` and one `TEXT.unknown(code)` line each, styled as a note, not an error. About half the codes on a real sheet land here (observed: 13 of the 25 distinct codes on the March donor sheet match none of the 21 maths aliases). `by:"none"`: `reason:"no-model"` → `TEXT.photoNoModel`, `"failed"` → `TEXT.photoFailed`.
  - `rows` from the API carry `code` (Task 10 adds it: the first code that resolved to that topic).
  - **Provider line (R4)**: on load, `GET /api/config`; when a model is set up (`configured` and `config.preset !== "none"`), show `TEXT.goesToModel` under the sheet controls. With no model, nothing leaves the machine, so no line.
- **TEST** (15b): (i) the AC 2 page leg: a `by:"model"` reply with `rows:[{topic:"1MA1/R9/of-an-amount", title:"Percentage of an amount", rag:"R", code:"U349"}]` and `unknown:["U976"]` → one unticked row showing `TEXT.readAs("U349")`, the line `TEXT.unknown("U976")`; tick and Save → the body is `{v:1,type:"intake",door:"sheet",topics:[{topic:"1MA1/R9/of-an-amount",rag:"R"}]}` and no request body contains `U976`. (ii) `by:"fallback"` rows start ticked. (iii) `by:"none", reason:"failed"` → `TEXT.photoFailed`. (iv) config `preset:"none"` → no `TEXT.goesToModel`; `preset:"openai"` → the line is shown. (v) a file upload with `api.encode` stubbed to a fixed data URL posts `{image: <that URL>}`.
- **VALIDATE**: `bun test src/marking/intake-dom.test.ts`

#### 15c. Tell me

- **IMPLEMENT**: three textareas labelled `TEXT.questions.confident|unsure|stuck` (the `INTERVIEW_QUESTIONS` strings, copied; a unit test checks they match) and the line `TEXT.isAI` ("This is an AI…", from Task 14). With a model set up: `fetch("/api/intake/interview", { method: "POST", … })`; `by:"model"` → `confirmRows(rows, "model")`; an empty `rows` → `TEXT.noMatch` and the checklist. `by:"none"` or no model set up → the checklist, with `TEXT.matchFailed` above it when the reason was `failed`. Checklist: every row of `/api/topics` with three buttons (`TEXT.can`, `TEXT.shaky`, `TEXT.lost` → G/A/R), none selected; a pick puts that topic in the confirm list as a `"code"` row.
- **TEST** (15c): model reply with one row → one unticked row; `by:"none", reason:"failed"` → `TEXT.matchFailed` and 22 checklist rows from a served `/api/topics`; config `preset:"none"` → the checklist without any POST to `/api/intake/interview`; picking "lost" on the science row and saving posts `topics:[{topic:"8464/4.1.1.2",rag:"R"}]` (AC 7, interview page leg).
- **VALIDATE**: `bun test src/marking/intake-dom.test.ts`

#### 15d. Cold test

- **IMPLEMENT**: `GET /api/intake/diagnostic`; `null` → `TEXT.nothingToAsk`. Else `GET /api/topics`, then each fixed slot's items file through `window.boss.itemsFile(row)`, and build with `window.boss.buildItems({ slots }, topics, itemsByTopic, window.GEN ?? {}, window.quiz)`; zero built → `TEXT.noQuestions`. Questions are numbered with no topic name. Each: stem, figure, scaffold, answer input, Sure / Not sure radios (markup as `app/quiz.js:330-336`), Check. Check needs an answer (`TEXT.answerFirst`) and a Sure choice (`TEXT.sureFirst`), then `quiz.mark(item, input.value)`, locks the question, and shows the working (it enters the DOM here and nowhere earlier, the `app/retest.js:1-9` invariant). `TEXT.saveSoFar` is enabled after one checked question; it fills the confirm list with one `"code"` row per checked question: `{topic, title, rag: ragFor(ok, sure)}`.
- **TEST** (15d), built from the real pack as `retest-dom.test.ts` does: a served diagnostic of two generator slots; answer slot 1 with the generator's own answer and Sure, slot 2 with `"0"` → Save posts one body, door `diagnostic`, rows `G` and `R`, and before Save no request went to `/api/event` (AC 8 page leg). A served diagnostic with one science item slot (`8464/4.1.1.2#1`) builds a question from the items file (AC 7, diagnostic page leg). Before Check, the item's `working` string is not in `document.body.innerHTML`.
- **VALIDATE**: `bun test src/marking/intake-dom.test.ts`

- **PATTERN (all of Task 15)**: `app/retest.js`, `app/snap.js`, `src/marking/retest-dom.test.ts`, `src/marking/snap-dom.test.ts`.
- **SATISFIES**: AC 1, AC 2, AC 7, AC 8, page.

### 16. CREATE `src/marking/intake.test.ts`; UPDATE `src/marking/retest.test.ts`

- **IMPLEMENT**:
  - `intake.test.ts` (load `quiz.js`, `retest.js`, `intake.js` as `src/marking/retest.test.ts:38-45` does): `ragFor` agrees with `src/flow/diagnostic.ts` on all four inputs; `intakeBody` agrees with `intakeRecord` on a set of distinct rows and on `[]`; `TEXT.questions` equals `INTERVIEW_QUESTIONS`; `encode`'s constants (`LONG_SIDE`, `MAX_BYTES`) equal `app/snap.js`'s (read both files as text and compare the literals, since both are file-local); register: `intake.html` text and every `TEXT` string have no `!`, no emoji (the `clean` helper, `retest.test.ts:173`) and no grade word (`src/jobs/guard.ts` CHECKS).
  - `retest.test.ts:198-235`: add `intake/sheet|intake/interview` to the allowed POST regex and the test title; extend the comment: "/api/intake/sheet and /api/intake/interview write nothing; the page saves through /api/event."
- **VALIDATE**: `bun test src/marking/`
- **SATISFIES**: page register, twins.

### 17. Prose gate on every pupil-facing string

- **IMPLEMENT**: run `no-ai-slop` then `humanizer` over `INTERVIEW_QUESTIONS`, `app/intake.js` `TEXT`, `app/intake.html` copy, and the two job `TASK` strings (model-facing, but they set the reply register). Draft strings, to be gated, not final:
  - questions: "Which topics could you do in a test tomorrow?" · "Which topics have you met but still feel shaky on?" · "Which topics lose you, or have you not been taught yet?"
  - `unknownHead`: "Codes this tutor has no topic for yet"; `unknown(code)`: `${code}: no topic here yet.`
  - `photoNoModel`: "A photo needs a model to read it. Paste the text from the sheet instead, or type the codes."
  - `photoFailed`: "The photo could not be read this time. Try a clearer photo, or paste the text from the sheet."
  - `matchFailed`: "Matching your answers did not work this time. Rate the topics yourself below."
  - `nothingToAsk`: "There are no questions to ask right now."
  - `readAs(code)`: `read as ${code}`
  - `goesToModel`: "The text or photo goes to the model a parent set up, so it can read the codes. The tutor does not keep a copy."
  - `noMatch`: "No topic matched your answers. Rate the topics yourself below."
  - the rest (`red`, `amber`, `green`, `can`, `shaky`, `lost`, `pasteLabel`, `heic`, `notSaved`, `noQuestions`, `answerFirst`, `sureFirst`, `saveSoFar`, `isAI`): write them in the same register; `heic`, `notSaved`, `answerFirst` can reuse the wording of `app/snap.js` and `app/retest.js`.
  - `nothingTicked`: "Tick at least one topic to save."
  - `saved`: "Saved. Your map now shows these topics."
- **GOTCHA**: 15-year-old register, British English, sentence case, no emoji, no exclamation marks, no grade words (`src/jobs/guard.ts` CHECKS). Sparx codes are fine in this page's text: they are what the sheet prints.
- **VALIDATE**: `bun test src/marking/intake.test.ts` (register test)
- **SATISFIES**: CLAUDE.md "Prose is a gate".

### 18. UPDATE `app/index.html`, `.claude/references/model-jobs.md`, `.claude/references/events.md`

- **IMPLEMENT**: index: `<p><a href="/intake.html">Start here: tell the tutor where you are</a></p>` first in `#practice` (text prose-gated). `model-jobs.md`: `intake_read` and `interview` under "Jobs planned" → shipped, with one line each on input (no item) and fallback; note `preAttemptSystem`'s `num` override. `events.md` Routes: `POST /api/intake/sheet`, `POST /api/intake/interview` (write nothing), `GET /api/intake/diagnostic` (`?day=`); the page posts the confirmed `intake@1` through `/api/event`.
- **VALIDATE**: `bunx biome check .`
- **SATISFIES**: documentation.

### 19. Full gate

- **VALIDATE**: `bun run check` green; `bun scripts/test-generators.ts` (unchanged content, must stay green).

---

## TESTING STRATEGY

### Unit Tests

- Jobs: valid / invalid JSON twice / provider down / guard or shape refusal / no model, per job (Tasks 3, 5). `countFailures` confirms the `job@1` line on each non-`no-model` fallback.
- Flow: `resolveCodes`, `mergeRows`, `intakeRecord`, `diagnostic`, `ragFor` (Tasks 8, 9).
- Page helpers: the twin checks and the register test (Task 16).

### Integration Tests

- `src/api/intake.test.ts` drives the handlers with a real temp `data/`, the real merged pack and a mocked provider.
- `src/server.test.ts` key-leak walk POSTs to both new POST routes and GETs the diagnostic.
- `src/marking/intake-dom.test.ts` runs the page in the app's own order: fetch the reply, render the confirm list, Save, one POST to `/api/event`. No socket in this ticket.

### Edge Cases

| # | Case | Verified in |
|---|---|---|
| E1 | Unknown code on a sheet is listed, never written | `api/intake.test.ts` 2, `intake-dom.test.ts` (a) |
| E2 | Model returns a code not in the pasted text | `intake_read.test.ts` 4 |
| E3 | Photo reply with digits is not refused by the number guard | `intake_read.test.ts` 6 |
| E4 | Photo with no model, or a set-up model that fails → no verdict with its own sentence each | `flow/intake.test.ts` 5, `api/intake.test.ts` 5 |
| E5 | Interview names an id outside the list | `interview.test.ts` |
| E6 | Interview model returns `[]` | `interview.test.ts` (valid, empty rows) and Level 4 step 5 |
| E7 | Same topic twice with different R/A/G | `flow/intake.test.ts` 1 |
| E8 | Nothing ticked / all unknown → no post (`intake@1` refuses empty) | `flow/intake.test.ts` 2, Level 4 step 4 |
| E9 | Science topic has no generator → diagnostic uses an item with answers, never `#6` | `flow/diagnostic.test.ts` 3 |
| E10 | `U745, U736` in one cell, `M113` codes, lower-case `u349` | `intake_read.test.ts` 8, `flow/intake.test.ts` 1 |
| E11 | A code with no R/A/G before it → rag null, the row cannot be ticked until the pupil picks | `intake_read.test.ts` 8, `intake-dom.test.ts` (15b), Level 4 step 3 |
| E14 | Four copy layouts of the same sheet (line per row, letter on its own line, several pairs per line) | `intake_read.test.ts` 8; engines observed in planning (Task 2) |
| E15 | A model-read row shows the code it was read from | `intake-dom.test.ts` (15b) |
| E16 | The provider line shows on the sheet tab only when a model is set up | `intake-dom.test.ts` (15b) |
| E12 | Image over 5 MB or not an image | `api/intake.test.ts` 4 |
| E13 | Diagnostic partly done → Save posts only answered topics | `intake-dom.test.ts` (b) |

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
bunx tsc --noEmit
bunx biome check .
```

### Level 2: Unit Tests

```bash
bun test src/jobs/intake_read.test.ts src/jobs/interview.test.ts src/flow/intake.test.ts src/flow/diagnostic.test.ts src/marking/intake.test.ts
```

### Level 3: Integration Tests

```bash
bun test src/api/intake.test.ts src/marking/intake-dom.test.ts src/server.test.ts src/marking/retest.test.ts
bun run check
```

### Level 4: Manual Validation

Run from the worktree with a throwaway data folder: `rm -rf data && bun run dev`. Every step uses only what this ticket ships plus `scripts/fake-provider.ts` (Task 13). Never use the donor PDFs with a real provider: they hold the pupil's name and school.

1. **No model.** On `/setup.html` pick "No model". Open `/intake.html` → Cold test. Expect 8 questions (derived: `MAX_DIAGNOSTIC_TOPICS`; fresh `data/`, so every topic is at rung 0), no topic names. Answer two (one right with Sure, one wrong), Save what I have done, tick both, Save. `/api/state` shows those two topics at `G` and `R`; the R topic keeps rung 0 (`afterRed(0) = 0`). `data/events.jsonl` has one `intake` line and no `attempt` or `xp` line from this step.
2. **No model, photo.** Sheet or photo → choose any PNG. Expect `TEXT.photoNoModel`, no post.
3. **No model, text.** Paste:
   ```
   5  Prime decomposition  2  0%  0  R  U739
   6  Percentage of an amount  2  0%  0  R  U349
   9  Simplifying ratio  1  0%  0  U687
   ```
   Expect rows for Percentage of an amount (R, ticked) and Simplifying ratio (no R/A/G: nothing directly before the code), and `U739: no topic here yet.` Both rows start ticked except ratio, which cannot be ticked until an R/A/G is picked (fallback reader, tick rule). Pick A for ratio, tick it, Save. State: `1MA1/R9/of-an-amount` R, `1MA1/R4` A; no line mentions `U739`.
3b. **Copied from a viewer.** With No model set (nothing leaves the machine), open a donor sheet in Preview, select all, copy, paste. Expect 12 rows with R/A/G set and 13 unknown codes (derived from the observed engine runs in Task 2). Repeat once from Chrome's PDF viewer. This checks the clipboard leg that the engine runs could not.
4. **Nothing to save.** Paste `U739 R` only → the unknown line, an empty confirm list; Save shows `TEXT.nothingTicked` and posts nothing.
5. **No model, Tell me.** The checklist of all 22 topics appears. Mark "Animal and plant cells" as lost, Save. State: `8464/4.1.1.2` rag R.
6. **Fake provider.** In a second terminal: `bun scripts/fake-provider.ts --mode valid` (it prints `Fake provider (valid, 0 ms) at http://127.0.0.1:<port>/v1`). On `/setup.html` pick the `custom` preset with that address and any key. Sheet: paste `U349 R\nU976 G` → one unticked R row and `U976: no topic here yet.` Rows show `read as U349`, and the provider line `TEXT.goesToModel` is visible. Tell me: type anything → one unticked row "Simplifying ratio" (A). The line "This is an AI…" is visible.
7. **Fake provider, not-json mode.** Restart it with `bun scripts/fake-provider.ts --mode not-json`; Tell me → the checklist appears (no verdict); `data/events.jsonl` has a `job` line with `reason: "not-json"` for `interview`.
8. **Map.** Open `/map.html`: the topics saved above show red, amber and green cards; `GET /api/next` makes a red topic the next lesson (`pickLesson`, `src/flow/next.ts`).

### Level 5: Additional Validation (Optional)

`agent-browser` over steps 1, 3 and 6 (memory: scroll into view before clicking below the fold).

---

## ACCEPTANCE CRITERIA

- [ ] **AC 1.** The cold diagnostic runs with no key: `GET /api/intake/diagnostic` answers with slots and nothing is fetched (`src/api/intake.test.ts` 1; Level 4 step 1).
- [ ] **AC 2.** A sheet with an unknown code produces an "unknown code" line, not a guess, with the provider mocked (`src/api/intake.test.ts` 2, `src/marking/intake-dom.test.ts` (a)).
- [ ] **AC 3.** The topic map after each door is identical for the same codes (`src/flow/intake.test.ts` 3).
- [ ] **AC 4.** All three doors land as `intake@1` events that replay into the topic map; `intake@1` is unchanged.
- [ ] **AC 5.** Each job has a mocked fallback test: valid, invalid JSON twice, provider down (Tasks 3, 5).
- [ ] **AC 6 (Guard).** Intake jobs receive no items and no answers and return codes only: input types hold no `Item`/`ItemView`/`PreAttempt`; the sentinel test finds no item text in any request (`src/api/intake.test.ts` 3).
- [ ] **AC 7 (T16 AC 9, owed by this ticket).** `8464/4.1.1.2` goes through the sheet, interview and diagnostic doors (`src/flow/intake.test.ts` 4, `src/flow/diagnostic.test.ts` 3; Level 4 step 5).
- [ ] **AC 8.** The diagnostic writes no `attempt`, `xp` or `session` line (Level 4 step 1; `intake-dom.test.ts` (b) asserts one POST).
- [ ] Pupil-facing strings pass the prose gate and the register test.
- [ ] `bun run check` green.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All validation commands executed successfully
- [ ] `bun run check` green (observed, name the run in the report)
- [ ] Level 4 steps 1–8 performed
- [ ] Acceptance criteria all met
- [ ] PR body restates the guard (below) and closes #19

**Guard statement for the PR body** (CLAUDE.md "Restate the guard"): no item enters either intake prompt, before or after an attempt. `IntakeReadInput` holds the pupil's text or image and a list of topic codes used only by the no-model reader; `InterviewInput` holds `{id, title, aliases}` per topic and the pupil's three answers. Neither type admits an `Item`, `ItemView` or `PreAttempt`, so `tsc` refuses one, and `src/api/intake.test.ts` runs both jobs over a pack whose items are all sentinels and finds none in any request. Both system messages still carry `PRE_ATTEMPT_GUARD`. The diagnostic calls no model; it marks in the browser with `quiz.mark`, as the boss does.

---

## OPEN QUESTIONS / ASSUMPTIONS

- **Q1. Should `/api/event` refuse an `intake` row whose topic is not in the pack?** Assumed no. `resolveTopic`'s comment says an unknown code passes on purpose. Worst case: a hand-posted or MCP `write_event` intake names an unknown code, and the map shows it as a topic card with no lesson; this is already true today. The intake page never posts one. If yes, it is a small `refusal` rule plus a test, and it changes T16's comment on `resolveTopic`.
- **Q2. What "confidence" means in the interview.** Assumed: the pupil's own confidence per topic, `confident | unsure | stuck` → G/A/R through `CONFIDENCE_RAG`, not the model's certainty about the match. The model's uncertainty is handled by the confirm list: model-produced rows start unticked, so nothing a model read or matched is saved until the pupil ticks it.
- **Q3. The diagnostic cap and pool.** Assumed 8 topics, one question each (derived above, about 18 minutes), drawn only from topics at rung 0, unrated first, so repeat runs reach the rest. Worst case: a pupil does one run and 14 topics stay grey; the sheet and interview doors fill those faster. A pupil with every topic on the ladder gets "nothing to ask", which is right: the boss re-tests those.
- **Q6. Red from a sheet or interview on a climbed topic.** The existing reducer sends rungs 2–4 back to 1 on any red intake row ("Red on a new school sheet sends 1 pass or better back to learning", `src/flow/ladder.ts:33`). This ticket keeps that for the sheet and the interview: a red school sheet and a pupil saying "this loses me" are both evidence. The confirm list shows the row before Save. If the interview should not demote, that is a door-aware reducer rule and a new event version; not planned.
- **Q4. Sheet photo privacy (decided).** A photo or pasted sheet goes to the parent's configured provider, name and school included. The parent chose the provider (PRD constraint 7); nothing is stored; the sheet tab says where it goes whenever a model is set up (`TEXT.goesToModel`, tested in 15b); with no model, text is read on the machine and nothing leaves it.
- **Q5. A stray letter before a code.** The reader takes only the token directly before a code, so an "A" sets amber only when written as `A U349`. Worst case: one row pre-set amber, visible and editable on the confirm list before Save.
- **Assumption.** No GitHub release exists (`gh release list` empty, observed 2026-09-29), so no event shape is frozen yet; this ticket changes none anyway.

## NOTES (open canvas)

**Why the interview is three fixed questions and one call, not a chat.** A chat loop makes the model decide when to stop and emits tutor prose every turn, which every guard then has to read. Three questions bound it by construction ("bounded chat job"), take about five minutes to answer (expected), and leave one typed output. The no-model form (self-rating checklist) is the same three levels.

**Why the page confirms before anything is written.** The photo path cannot be checked against the source in code (handwriting and print are not text the guard can read, as `examiner_mark.ts` notes). The confirm list is the check for R1 (vision misreads a code). It also makes all three doors end in the same `intakeBody`, which is what AC 3 tests.

**Why the diagnostic reuses `retest.js`.** `buildItems` already builds a question from `{topic, item, seed}` across subjects with `/api/topics` rows (T16). A second copy would be a third place where item-building can drift from `findItem` (`src/flow/chat.ts`) and `quiz.itemFromGenerated`.

**Why no attempt events.** A cold diagnostic answered right would add 10 XP per question, set Sure/correct calibration for a context that is not practice, and unlock `hasAttempt` for items so post-attempt jobs could see their answers. The intake line alone carries what the doors are for.

**Risks, each with how this plan closes it.**

| # | Risk | Closed by | Evidence |
|---|---|---|---|
| R1 | The cold test demotes a topic already on the ladder | Pool is rung 0 only (Task 7) | `diagnostic.test.ts` 4b |
| R2 | A vision model misreads one real code as another | Model rows start unticked and show `read as <code>` beside the title | 15b (i) |
| R3 | The no-model reader misses R/A/G when a parent copies from a viewer | Token-order rule, blind to line breaks | observed in planning: 25 of 25 on both donor sheets across four text engines (Task 2); Level 4 step 3b checks the clipboard |
| R4 | The sheet goes to the provider with the pupil's name | Nothing stored; the page says so when a model is set up; no-model reading is local | 15b (iv) |
| R5 | `retest.js` changes shape under a later ticket and breaks the cold test | 15d builds real questions through it | 15d |
| R6 | Fake-provider markers drift from the job prompts | Markers exported from the job files and imported by the fake (Task 13) | `tsc` |
| R7 | One large page script is hard to land in one pass | Split into 15a–15d, each with its own green DOM cases before the next | 15a–15d VALIDATE |
| R8 | A text-only model is given a photo | `reason:"failed"` has its own sentence and sends the pupil to paste text | 15b (iii), `api/intake.test.ts` 5 |

**Confidence for one-pass implementation: 10/10.** Every earlier doubt is now a fact checked during planning or a named test:
- The copy-layout question (R3) was run against real sheets on four text engines, not assumed.
- Every signature the plan leans on was read at `2b20646`: `preAttemptSystem`/`postAttemptSystem`, `buildItems`/`itemsFile` and the load guard in `retest.js`, `quiz.mark`, `decodeDataUrl`/`sniffImage`, `publicConfig`, the key-leak walk, the POST regex, `afterRed`, and `define.test.ts` (which calls `preAttemptSystem` with one argument, so the new third parameter breaks nothing).
- Each server task has a close twin in the repo: `hint.ts`, `examiner_mark.ts`, `boss.ts`, `chat.ts`, the `/api/coach` routes.
- The page (the one part without a twin) is cut into four steps, each gated by its own DOM cases.
- Every AC and edge case names the test or Level 4 step that proves it.

This is the planner's estimate (expected), not a result. The run proves it: `bun run check` green and Level 4 performed.

**Size.** Expected: jobs about 220 lines, flow about 200, API about 110, page about 380, tests about 600. About 1,500 with tests; the ticket's 700–1,000 likely excluded tests.

## AMENDMENTS

- 2026-09-29 — risks closed before implementation: R/A/G reader changed from a per-line rule to a token-order rule after observing four PDF text engines (the per-line rule failed PDFKit's layout); model rows show the code they were read as; the provider line on the sheet tab; fake-provider markers imported from the jobs; Task 15 split into 15a–15d with DOM cases each; risk table R1–R8; confidence 7 → 10 (expected).
- 2026-09-29 (implementation, supersedes the named task lines; see `.claude/reports/t17-intake-doors-report.md`):
  - Task 15a: `confirmRows(door, rows, source)` takes the door first, so Save knows it without hidden state (D1).
  - Task 15b / Level 4 step 4 / E8: when no row resolves, the confirm section stays hidden; there is no empty list and no Save, so nothing can be posted. `TEXT.nothingTicked` still shows when rows exist and none is ticked (D2).
  - Task 15c: with no model set up, the three textareas and the "This is an AI" line (`#ai-line`) are hidden, and the checklist shows at once (D3).
  - Task 17: `TEXT` gained strings beyond the draft list (`tick`, `save`, `confirmHead`, `pasteFirst`, `reading`, `nothingFound`, `match`, `matching`, `writeFirst`, `checklistHead`, `coldIntro`, `notLoaded`, `sure`, `notSure`, `check`, `correct`, `wrong`, `toMap`, `yourAnswer`) (D4). `no-ai-slop` and `humanizer` ran in detect mode with no hits (D6).
  - Task 15 shared shape: `globals().intake` also exports `ready`, `page`, `openDoor`, `LONG_SIDE` and `MAX_BYTES` as test seams (D5).
  - Task 2: the example reply code in `TASK` is `U100` (no pack alias), not `U349`, so an echoed example resolves to unknown (D8).
  - Level 4 step 3b not performed (needs a GUI clipboard copy).
