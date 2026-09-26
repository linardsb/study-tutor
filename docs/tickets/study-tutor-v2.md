---
title: "Ticket breakdown — Study tutor v2"
epic: docs/prd/study-tutor-v2.prd.md
architecture: docs/prd/study-tutor-v2.architecture.md
created: 2026-09-26
status: sliced, not yet on GitHub (PRD Q6 open: no repo name, no remote)
---

# Ticket breakdown — Study tutor v2

## Epic summary

A downloadable GCSE tutor a family runs on their own PC or Mac with their own model key or no model. One
folder: a compiled Bun binary serves the pages, writes the pupil's records as an append-only event log, holds
the parent's key, runs bounded model jobs and exposes four MCP tools. Flow lives in code; the model gets typed
jobs and can never see an answer before an attempt event exists. Maths pack first from the 21 v1 lessons.

Every size below is **expected** (an estimate before planning), lines of change including 20–50% tests.
Every ticket inherits D1–D11 and the three references under `.claude/references/`. It plans only what is
left at ticket level.

## Assumptions the slicing rests on

- **A1.** E1 (adherence on the v1 folder, two weeks) gates all engine work except the S1 spike. The
  architecture pairs S1 with the one-way door and it is a hello-world, so it runs during E1's two weeks
  rather than after. If E1 fires WRONG, T1 is the only engine cost sunk.
- **A2.** Q1 is taken as `~/Desktop/Matis_study_tutor/` (CLAUDE.md names it master). T0 and T3 read from it.
- **A3.** Q14 is taken as the architecture's recommendation: topics keyed by Edexcel `1MA1/...` spec ids now,
  U-codes as aliases. If Q2 turns out AQA, the key column is renamed and the alias table stays.
- **A4.** Q7 and Q13 (digest content and where it goes) stay open; T15 is written against the evidenced shape
  (weekly, factual, a page plus a file) and is the one ticket a PRD answer can reshape.

## Tickets

### T0 — E1: O1 and O5 on the v1 folder, no engine change

- **Scope / AC.** On the master v1 folder, add a static level map (rung per topic from `topics.md`, weekly
  flame "n of 3 this week" from `sessions.md`) and a daily detective case page (one planted mistake in a
  worked solution built from a generator's `wrong` map, a 1–3 confidence bet, a calibration line). Both work
  from `file://`, no model, no server. Install on Matis's PC. AC: the pupil can open the map and a case
  without the chat; the two pages record nothing the existing `sessions.md` row does not already hold; a
  two-week count of unprompted opens exists (the E1 read).
- **Context.** PRD: problem statement, O1, O5, E1, R1. Not this repo: lives in the v1 folder. Nothing here
  carries over as code, but the page shapes inform T6 and T7.
- **Files.** `~/Desktop/Matis_study_tutor/map.html`, `case.html`, small additions to `assets/quiz.js` or a
  new `assets/case.js`, `README-for-Matis.md`.
- **Size.** ~300–500 lines.
- **Depends on.** none. **Gates.** everything after T1 (A1).

### T1 — S1 spike and repo skeleton: Bun binary, launchers, gate

- **Scope / AC.** `package.json`, `tsconfig`, Biome config, `bun run check` (tsc + biome + bun test) with one
  passing test; `src/server.ts` as a hello-world `Bun.serve` on `127.0.0.1` that picks a free port from a
  fixed list and opens the browser; `scripts/build.ts` running `bun build --compile` per OS into
  `dist/StudyTutor-windows.zip` and `dist/StudyTutor-mac.zip` with `Start.bat` and `Start.command`;
  `.claude/hooks/stop_check.py` switched from `pnpm check` to `bun run check` (it still names the taxi
  gate). Run the zip on a fresh Mac and a fresh Windows PC, time a non-technical adult, record the S1
  decision (under 10 min with no dead end → A1 as drawn) and Q11 (port and fallback) in the architecture doc.
- **Context.** Architecture D1, D6, D10, S1, Q11. CLAUDE.md commands block.
- **Files.** `package.json`, `tsconfig.json`, `biome.json`, `src/server.ts`, `scripts/build.ts`,
  `Start.bat`, `Start.command`, `src/server.test.ts`, `.claude/hooks/stop_check.py`,
  `docs/prd/study-tutor-v2.architecture.md` (S1 result only).
- **Size.** ~300–500 lines.
- **Depends on.** none.

### T2 — Events: types, append with `data/` confinement, replay, replay-check

- **Scope / AC.** `src/events/types.ts` string union (`session` · `attempt` · `retest` · `teachback` ·
  `intake` · `xp` · `squad` · `photo`, each with `v`); `src/events/append.ts` as the only writer of
  `data/events.jsonl` (fsync per line, realpath check refuses any path outside `data/`);
  `src/mcp/clock.ts` supplying UTC `t`; `src/events/replay.ts` as a pure reducer with one case per
  `(type, v)` deriving the state shape in `events.md` (topic map with rung and next-due, XP, weekly flame,
  confident-wrong pool, calibration pairs, monthly token count); `scripts/replay-check.ts` that replays with
  new code, diffs the stored `state.json` and refuses to start if any rung would fall. S5 run: 200
  synthetic events, change the state shape, replay, diff. AC: one fixture per event version under
  `src/events/__fixtures__/`; a replay test asserts rung, XP and next-due for a scripted six-week history;
  a confinement test proves `../` and symlinks out of `data/` are refused; S5 result recorded.
- **Context.** `.claude/references/events.md` · architecture D3, D11, S5, "System behaviour" ·
  CLAUDE.md "Events are the record" and "`data/` confinement".
- **Files.** `src/events/{types,append,replay}.ts` and tests, `src/events/__fixtures__/*.jsonl`,
  `src/mcp/clock.ts`, `scripts/replay-check.ts`.
- **Size.** ~700–1000 lines.
- **Depends on.** T1 (skeleton and gate).

### T3 — Maths content pack: schema, topics, items converted from the 21 lessons, generator test

- **Scope / AC.** `src/content/types.ts` (item `type` union and the item, topic and misconception shapes);
  `content/maths/topics.json` with 21 rows keyed by `1MA1/...` spec id, U-codes as `aliases`, tier F,
  prerequisites where the v1 `topics.md` "goes with" notes name one; a one-off `scripts/convert-lessons.ts`
  that reads the base64 `.q` items out of each v1 lesson into `content/maths/items/<topic>.json` with
  `misconceptions` from `data-wrong`; `content/maths/generators.js` carried from `assets/generate.js`
  unchanged in shape (`GEN[code](rng)`), runnable in the browser and in Bun; `lessons/` and `reference/`
  copied as-is; `content/maths/LICENCE.md`; `scripts/test-generators.ts` running every generator 300
  times (port of the v1 `test-generators.js`). AC: 21 topics, every lesson's items present with their
  misconceptions, generator test green, no exam-board question text (grep for board wording in the
  converter's output).
- **Context.** `.claude/references/content-pack.md` · `.claude/rules/content.md` · architecture D5, Q14
  (A3) · PRD constraint 5, non-goals (licence) · donor `~/Desktop/Matis_study_tutor/` (lessons, reference,
  `assets/generate.js`, `.claude/tools/test-generators.js`).
- **Files.** `src/content/types.ts`, `content/maths/**`, `scripts/convert-lessons.ts`,
  `scripts/test-generators.ts`, tests.
- **Size.** ~600–900 lines of new code; copied assets not counted.
- **Depends on.** T1. Independent of T2 (no shared files).

### T4 — Server and lesson bridge: pages served, quiz.js posts attempts, state read back

- **Scope / AC.** `src/server.ts` serves `app/` and `content/` as static, `GET /api/state` (replays if
  `state.json` is missing), `POST /api/event` (validated against the union, appended through `src/events`,
  alias resolution U-code → topic id); `app/quiz.js` carried from v1 with the clipboard score line replaced
  by a post of an `attempt` event carrying item, topic, correct, sure, answer, seed; items load from
  `/content/maths/items/` and the inline `.q` markup is stripped from the 21 lessons in the same change (the
  "converted once" step in `content-pack.md`); `app/practice.html` ported to fresh-number practice from
  `generators.js`; `app/style.css` carried. AC: open a lesson, answer an item, one `attempt` line lands in
  `data/events.jsonl`, `/api/state` shows the topic's confident-wrong count; a lesson still renders from
  the binary with no model configured; posting a malformed event is refused with no write.
- **Context.** Architecture D7, D1 · `.claude/references/events.md` (event line) · CLAUDE.md "A new page"
  rule · donor `assets/quiz.js`, `practice.html`.
- **Files.** `src/server.ts`, `src/api/{state,event}.ts` (or routes inside server), `app/quiz.js`,
  `app/practice.html`, `app/style.css`, `content/maths/lessons/*.html` (quiz section only), tests with a
  temp `data/`.
- **Size.** ~800–1200 lines.
- **Depends on.** T2, T3. First slim end-to-end slice: a lesson becomes a record.

### T5 — Flow: session machine, 3/10/30/60 ladder, XP, weekly flame, boss pick, next

- **Scope / AC.** `src/flow/ladder.ts` (rungs, the 3/10/30/60 day schedule, practice never drops a rung, a
  failed cold re-test does); `src/flow/xp.ts` (XP only on attempt events with a score and on teach-backs,
  weekly not daily, flame "n of target this week" from `profile.json`'s weekly target); `src/flow/boss.ts`
  (boss built from the pupil's confident-wrong items, mixed and unlabelled, seeded); `src/flow/session.ts`
  (state machine: open → pick topic → lesson or practice or re-test → close, every step an event);
  `GET /api/next` returning the deterministic next step. AC: property tests over synthetic histories
  (rung never rises without a passed re-test, XP never rises without an attempt with a score); the
  guardrail pair (re-test score vs XP) is computable from state; no model call anywhere in `src/flow`.
- **Context.** PRD O1 (mechanism and evidence), R6, guardrail metrics · architecture "Code holds the flow",
  D2, "Gaming" · CLAUDE.md "Flow in code".
- **Files.** `src/flow/{ladder,xp,boss,session,next}.ts` and tests, one route in `src/server.ts`.
- **Size.** ~700–1000 lines.
- **Depends on.** T4.

### T6 — O1 pages: level map, boss battle, cold re-test, weekly flame

- **Scope / AC.** `app/map.html` (level per topic from `/api/state`, next-due, flame, boss available),
  `app/retest.html` (cold, unlabelled, mixed items from `generators.js` with the boss seed, posts `retest`
  events, no hint path), boss result screen (rung change stated as what the pupil can and cannot do yet, no
  grade). AC: a full loop with no model: map → boss → retest event → map shows the new rung; register rules
  pass (`no-ai-slop` then `humanizer` on every prose block); nothing in `app/` writes a file.
- **Context.** PRD O1, target user (register), success metrics (flame) · `.claude/rules/content.md` ·
  T0's page shapes.
- **Files.** `app/map.html`, `app/retest.html`, `app/map.js`, `app/style.css`, page tests via
  `bun test` against the served routes.
- **Size.** ~600–900 lines.
- **Depends on.** T5.

### T7 — O5 detective case: daily case, confidence bet, hypercorrection, calibration

- **Scope / AC.** `src/flow/detective.ts` picks one case a day (seeded by date): a planted mistake in a
  worked solution built from an item's `misconceptions` and its generator's `working`, or an
  invent-the-rule case from three contrasting instances for topics flagged `concept` in `topics.json`;
  every answer carries a 1–3 bet; confident-wrong triggers an immediate re-ask and seeds tomorrow's case;
  calibration pairs accumulate in state and the page shows "you predicted n, you scored m".
  `app/case.html`. AC: an item with no misconceptions never appears (test); the same date and pupil give
  the same case (test); calibration gap is computable from state; three-minute size (one case, one re-ask).
- **Context.** PRD O5, success metrics (calibration gap) · architecture D5 (misconceptions feed O5) ·
  `.claude/references/content-pack.md` · `.claude/rules/content.md`.
- **Files.** `src/flow/detective.ts` and tests, `app/case.html`, `app/case.js`, one route,
  `content/maths/topics.json` (`concept` flag only).
- **Size.** ~600–900 lines.
- **Depends on.** T5.

### T8 — Setup page, config, provider seam, token counter (S2)

- **Scope / AC.** `data/config.json` written with owner-only permissions by `app/setup.html` on first run
  (`base_url`, `key`, `model`, preset label, spend cap, weekly target into `profile.json`); the key never
  appears in any response to the browser (test); `src/providers/openai-compatible.ts` as the only model
  call (`POST ${base_url}/chat/completions`, `image_url` parts for vision, JSON asked for in the prompt and
  parsed in code); presets as labels over the same three fields, no Gemini; usage from each response
  becomes a token-count event and the monthly total is shown on the setup page. S2 run: hint, teach-back
  mark, one vision mark through OpenAI, Anthropic compat, OpenRouter, Groq, Ollama; result and Q12
  recorded. AC: provider mocked tests for success, non-JSON, HTTP error, timeout; one real S2 run logged.
- **Context.** Architecture D4, D11, S2, Q12 · `.claude/references/model-jobs.md` (Provider) · PRD
  constraints 2 and 7, R4, R5, guardrail (spend).
- **Files.** `src/providers/openai-compatible.ts`, `src/config.ts`, `app/setup.html`, routes for config
  and usage, tests.
- **Size.** ~600–900 lines.
- **Depends on.** T4. Independent of T5–T7 (different files; one route each in `server.ts`).

### T9 — Model jobs: defineJob, guess_first, hint, teachback_mark, chat panel, guard

- **Scope / AC.** `src/jobs/define.ts` (prompt, input shape, output shape validated in code, one retry on
  invalid JSON, then `fallback`); `src/jobs/{guess_first,hint,teachback_mark}.ts`; the answer-free item
  view is the only input until an `attempt` event for that item exists in the log, checked in code, not in
  the prompt; `teachback_mark` receives `mark_scheme` and returns marks per line, never a corrected
  solution; regex guard on every reply (emoji, exclamation marks, grade prediction phrases) with a logged
  `would_block` shadow-judge hook that never blocks in v1; `app/chat.html` panel with "This is an AI" fixed
  on screen. `src/flow` calls each job at its named point and continues on `no verdict`. AC: every job has
  a mocked test for valid output, invalid JSON twice, provider down; a test proves the pre-attempt view has
  no `answers` or `mark_scheme`; with no key set, every path runs its fallback.
- **Guard.** Answer withheld by construction: the job input type for a numeric item has no `answers`
  field until `hasAttempt(item)` reads true from the event log; the post-attempt prompt variant is a
  separate function. Restate this in the plan and PR body.
- **Context.** `.claude/references/model-jobs.md` · `.claude/rules/content.md` (prompt guard line) ·
  architecture D2, R3, R8 · CLAUDE.md "Restate the guard".
- **Files.** `src/jobs/**`, `src/flow/session.ts` (call points), `app/chat.html`, `app/chat.js`, tests.
- **Size.** ~900–1300 lines.
- **Depends on.** T5, T8.

### T10 — MCP server: read_state, write_event, open_lesson, clock (S3)

- **Scope / AC.** `src/mcp/tools.ts` exposing four tools over stdio (and the in-app loop using the same
  functions): `read_state` returns the derived snapshot, `write_event` appends through `src/events` and
  refuses anything outside `data/` or outside the type union, `open_lesson` returns a lesson URL,
  `clock` returns UTC. S3 run: Codex CLI connects and runs one session; result recorded. AC: every tool is
  expressible as read_state or write_event (a test enumerates them); a tool call carrying a path outside
  `data/` is refused; no tool returns `answers` for an item without an attempt event.
- **Guard.** `read_state` serves the answer-free item view for items without an attempt; the MCP surface
  has no tool that returns `answers` or `mark_scheme` on its own.
- **Context.** Architecture "The tool contract is an MCP server", D11, S3 · CLAUDE.md "A new tool".
- **Files.** `src/mcp/{server,tools}.ts`, tests.
- **Size.** ~400–700 lines.
- **Depends on.** T4. Independent of T5–T9.

### T11 — Distribution and updates: releases, update check, first-run docs

- **Scope / AC.** `scripts/build.ts` finished (version stamp, two zips, `app/` and `content/` inside,
  `data/` absent); `src/updates.ts` reads the GitHub releases feed on start (the only outbound call beyond
  the provider) and shows "update available" on the map; `replay-check` from T2 runs on start after an
  update; a manual update test: install v1, log ten events, replace the binary and folders with v2, state
  survives; parent README with the macOS right-click → Open screenshot and the 30-minute setup path.
  AC: an update never touches `data/` (test on a temp tree); the releases feed being down does not block
  start.
- **Context.** Architecture D10, D6, "Delayed feedback" · PRD constraints 1 and 6, E2, Q6.
- **Files.** `scripts/build.ts`, `src/updates.ts`, `README.md`, `docs/setup-mac.png`, tests.
- **Size.** ~400–600 lines.
- **Depends on.** T2, T8. E2 ships after T6, T7, T9, T10, T11 and T17.

### T12 — O2 Coach the noob: Dan's scripted wrong step

- **Scope / AC.** `src/jobs/dan_wrong_step.ts`: after a teach-back, Dan attempts the next fresh-number item
  and makes one wrong step chosen in code from the item's `misconceptions` (the model voices it, never
  invents it); the pupil catches and corrects; Dan's rank in state rises per caught error; fallback with no
  model is a written wrong step from the bank. `app/coach.html`. AC: a test proves the wrong step always
  comes from the bank (R8); an item with no misconceptions is skipped; mocked job tests; the catch rate
  (O2 signal) is computable from state.
- **Guard.** Dan's prompt receives the misconception's wrong answer and message only; the correct answer
  is withheld until the pupil's correction is an attempt event.
- **Context.** PRD O2, R8, E3 · architecture D5 · `.claude/references/model-jobs.md`.
- **Files.** `src/jobs/dan_wrong_step.ts`, `src/flow/coach.ts`, `app/coach.html`, tests.
- **Size.** ~600–900 lines.
- **Depends on.** T9.

### T13 — O3 Examiner mode: phone camera route, vision mark, marks left on the table

- **Scope / AC.** A LAN-bound route `/snap?token=<one-time>` shown as a QR on the map, bound for the
  session only, refusing any other token; the photo saved to `data/intake/`; drop-a-file fallback on the
  page; `src/jobs/examiner_mark.ts` (vision) marking method and accuracy lines, boxed answer, units,
  reasonableness against the item's `mark_scheme`, returning marks per line and never a solution; a
  `photo` event; "marks left on the table" and the clean-sheet badge derived in replay. AC: token
  single-use and session-bound (test); a request from the LAN address without a token is refused; mocked
  vision job tests; with no vision model the page says the photo is stored and not marked yet.
- **Guard.** `examiner_mark` runs only after an attempt event for the item; the prompt states marks per
  line only.
- **Context.** PRD O3, Q10, E3 · architecture D8, D11 · CLAUDE.md "Network".
- **Files.** `src/snap.ts`, `src/jobs/examiner_mark.ts`, `app/snap.html`, `app/map.html` (QR block),
  `src/events/replay.ts` (photo case), tests.
- **Size.** ~700–1000 lines.
- **Depends on.** T9, T6.

### T14 — O4 Squad mode: seeded shared re-test, squad files, co-op total

- **Scope / AC.** Seed = hash(squad id, ISO week, topic) so two pupils get identical numbers with no
  exchange; `squad/<squad-id>/<pupil>.json` written only for the local pupil, read for the others from any
  synced or hand-passed folder; `app/squad.html` with the shared countdown, compare-working view and the
  pooled weekly total; a parent-as-student round (pupil teaches, teach-back event); no individual ranking
  anywhere (test greps the page). AC: the same seed on two machines yields the same items (test runs
  `generators.js` in Bun twice); a missing or malformed squad file degrades to solo; a `squad` event per
  round.
- **Context.** PRD O4, R7, Q9, E4 · architecture D9 · `.claude/references/events.md`.
- **Files.** `src/flow/squad.ts`, `app/squad.html`, `app/squad.js`, tests.
- **Size.** ~500–800 lines.
- **Depends on.** T6. No model.

### T15 — Parent digest

- **Scope / AC.** A weekly, factual digest from `events.jsonl` and the token count: sessions this week
  against target, re-tests taken and passed, marks left on the table if O3 is in use, spend this month
  against the cap, any failed model jobs. Written to `data/digest/<iso-week>.md` and shown at
  `app/parent.html`; the pupil sees the same page (PRD: "the pupil sees exactly what the parent sees").
  AC: a digest from the six-week fixture matches a snapshot; no grade prediction (test).
- **Context.** PRD Q7, target user (parent), R4 · architecture Q13, D11. Open until Q7 is answered; the
  shape here is the evidenced default (A4).
- **Files.** `src/digest.ts`, `app/parent.html`, tests.
- **Size.** ~300–500 lines.
- **Depends on.** T8 (token count), T5. Blocked on Q7 for content.

### T16 — E5: science pack from Oak, one topic end to end

- **Scope / AC.** Oak coverage check for AQA 8464 written up in `content/science/COVERAGE.md`;
  `content/science/topics.json` keyed by `8464/...`; one topic's items (`vocab`, `sequence`, `label` in
  code; one `short` with a mark scheme) from Oak under OGL with attribution in `LICENCE.md`; that topic runs
  through all three intake doors and one re-test cycle with nothing in `src/` changed (the test is a
  diff of `src/` before and after). AC: `src/` unchanged; markers for vocab, sequence and label exist in
  `src/marking/` (added here if T4 did not need them).
- **Context.** PRD constraint 5, R9, Q8, E5, non-goals (sources) · architecture D5 ·
  `.claude/references/content-pack.md`.
- **Files.** `content/science/**`, `src/marking/{vocab,sequence,label}.ts` if absent, tests.
- **Size.** ~500–800 lines.
- **Depends on.** T17, T6.

### T17 — Intake doors: sheet or photo, five-minute interview, cold diagnostic

- **Scope / AC.** `src/jobs/intake_read.ts` (a school sheet or photo → topic codes, resolved through
  `aliases` to topic ids, unknown codes listed back, never a topic invented); the interview as a bounded
  chat job returning topic ids with confidence; the cold diagnostic as a deterministic mixed test from
  `generators.js` over the pack's topics, no model; all three land as `intake` events that replay into the
  topic map. `app/intake.html`. AC: the diagnostic runs with no key; a sheet with an unknown code produces
  an "unknown code" line, not a guess (mocked test); the topic map after each door is identical for the
  same codes (test).
- **Guard.** Intake jobs receive no items and no answers; they return codes only.
- **Context.** PRD constraint 4, non-goals (Sparx inputs allowed: public sheet, screenshots, reports) ·
  architecture D5 · donor `intake/` for sample sheets (never committed).
- **Files.** `src/jobs/intake_read.ts`, `src/jobs/interview.ts`, `src/flow/diagnostic.ts`,
  `app/intake.html`, tests.
- **Size.** ~700–1000 lines.
- **Depends on.** T9, T3.

## Dependency graph

```
T0 (E1, v1 folder) ──gates──▶ T2 and everything after (A1)
T1 ─┬─▶ T2 ─┬─────────────────────────────▶ T4 ─┬─▶ T5 ─┬─▶ T6 ─┬─▶ T13 (also T9)
    │       │                                   │        │        ├─▶ T14
    └─▶ T3 ─┘                                   │        │        └─▶ T16 (also T17)
                                                │        ├─▶ T7
                                                │        ├─▶ T9 (also T8) ─┬─▶ T12
                                                │        │                 ├─▶ T17 (also T3)
                                                │        │                 └─▶ T13 (also T6)
                                                │        └─▶ T15 (also T8)
                                                ├─▶ T8 ─┬─▶ T9
                                                │       ├─▶ T11 (also T2)
                                                │       └─▶ T15
                                                └─▶ T10
```

## Suggested execution order

- **Wave 0 (parallel, two weeks):** T0 (E1 on the v1 folder), T1 (S1 spike and skeleton). E1's read
  decides whether Wave 1 starts.
- **Wave 1 (parallel):** T2, T3. No shared files.
- **Wave 2:** T4. First end-to-end slice: a lesson attempt becomes a record.
- **Wave 3 (parallel):** T5, T8, T10. Each adds its own route to `server.ts`; merge order T5, T8, T10.
- **Wave 4 (parallel):** T6, T7, T9, T11. Model-free MVP (O1, O5) is T6 + T7.
- **Wave 5 (parallel):** T12, T13, T14, T15, T17. E2 (the giveaway) ships once T11 and T17 are in.
- **Wave 6:** T16 (E5). E3 reads T12 and T13; E4 reads T14.

Plan dependent tickets just in time: T4 is planned after T2 and T3 are implemented, not before.

## Converting to GitHub Issues (after Q6)

Once the repo exists and has a remote: create one issue per ticket from its section above (body = the
section, plus a first line linking the epic issue), then one `epic`-labelled issue whose body links both
PRD docs and carries one task-list row per ticket in the form `piv-next` parses:

```
- [ ] #<n> — T2 Events: types, append, replay, replay-check (depends on #<T1> · wave 1)
```

`bash .claude/skills/piv-next/next.sh` then reads the queue back.
