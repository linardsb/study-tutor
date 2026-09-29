# CLAUDE.md — Study tutor v2

## What this is

A downloadable GCSE tutor a family runs on their own PC or Mac with their own model key, or with no model at all. One folder: a compiled Bun binary serves the pages on localhost, writes the pupil's records, holds the parent's key, runs bounded model jobs and exposes four MCP tools. Stack: Bun + TypeScript server, plain-JS browser pages (no framework, no bundler), JSON files in `data/`, any OpenAI-compatible model over `fetch`. Intent: `docs/prd/study-tutor-v2.prd.md`. Decisions: `docs/prd/study-tutor-v2.architecture.md` (D1–D11). Greenfield: the tree below is the designed layout; S1 (the Gatekeeper spike) creates the first files.

## Architecture map

```
src/
  server.ts            Bun.serve: static app/ + content/, /api routes, port pick, opens the browser
  events/              event types · append (the only writer of data/events.jsonl) · replay → data/state.json
  flow/                session state machine, 3/10/30/60 ladder, XP and weekly flame, boss pick, detective case, squad seed
  marking/             deterministic markers, one per item type (generator, cloze, label, sequence, vocab)
  jobs/                one file per model job: prompt, input shape, output shape, validate, retry once, fallback
  providers/           the one fetch to `${base_url}/chat/completions` · monthly token counter
  mcp/                 the tool contract: read_state · write_event · open_lesson · clock
app/                   pages and assets served as-is; quiz.js and style carry over from v1
content/<subject>/     topics.json · items/ · generators.js · lessons/ · reference/   (maths first)
scripts/               build.ts (bun build --compile per OS) · test-generators.ts · replay-check.ts
data/                  the pupil's records; gitignored; written only through src/events
docs/prd/              PRD and architecture doc, linked both ways
.claude/               skills, hooks, references, rules, PIV artefacts
```

## Ground rules

- **Flow in code.** `src/flow` decides what happens next. A model job returns a typed value or `no verdict`, and the deterministic path continues. No model call orchestrates a session, loops over tools outside `src/mcp`, or decides a numeric answer.
- **Answer withheld by construction.** For any item with `answers`, the answer enters a model prompt only after an `attempt` event for that item exists. Jobs take the answer-free item view until then.
- **Events are the record.** Only `src/events` appends to `data/events.jsonl`. `state.json` is derived and deletable. A shape change is a new event version plus a reducer case, never a migration and never an edit of a past line.
- **`data/` confinement.** Every path from a tool or route resolves (realpath) inside `data/` or is refused. The one exception is the parent's optional squad sync folder (D9), used only by the squad read and write path and realpath-pinned to that folder. Updates replace `app/`, `content/` and the binary, and never touch `data/`.
- **One provider seam.** `base_url` + `key` + `model`; plain `fetch`; no provider SDK; no Gemini preset. Structured output is JSON requested in the prompt, parsed and validated in code, one retry, then fallback.
- **Types.** Event and item `type` fields are string unions in `src/events/types.ts` and `src/content/types.ts`. Browser JS reads the same JSON shape; no parallel interfaces.
- **Browser assets are plain JS.** No framework, no bundler. `content/*/generators.js` runs in the browser and in Bun: no DOM, no Bun APIs inside it.
- **Content keys.** Topics keyed by exam-board specification statement id (`1MA1/R9`); Sparx U-codes are aliases only. No exam-board question text or mark schemes in `content/` (licence). Oak material under OGL with attribution.
- **Network.** Bind `127.0.0.1` only, except the O3 camera route on the LAN address behind a one-time session token. Outbound: the configured provider and the GitHub releases feed, nothing else.
- **Pupil-facing text.** 15-year-old register, British English, sentence case, no emoji, no exclamation marks, no grade prediction. "This is an AI" stays visible in the chat panel. Detail: `.claude/rules/content.md`.
- **Testing.** Every generator runs 300 times (`scripts/test-generators.ts`). Replay has a test per event version. Every job has a fallback test with the provider mocked. Done = `bun run check` green, never say-so.
- **Git.** Trunk `main`; one branch per ticket; commits via `piv-commit`, PRs via `piv-create-pr`.

## Working principles (agent steering)

Global `~/.claude/CLAUDE.md` already holds think-before-coding, simplicity first, surgical changes and goal-driven execution. This repo adds:

- **Prose is a gate.** Any lesson, hint, chat prompt or record text passes `no-ai-slop` then `humanizer` before it is saved. For chat replies it is a mental pass, not narrated.
- **Numbers carry provenance.** Every figure in a plan, report or PR body is `observed` (name the run), `derived` (show the arithmetic and the condition) or `expected`. Re-derive a figure you copy.
- **One ticket per PIV loop, one experiment per epic.** E1 (adherence on the existing v1 folder) runs before any engine work. Do not pull the next experiment forward.
- **Restate the guard.** Any change touching `src/jobs`, `src/mcp` or a prompt names, in the plan and the PR body, how the answer stays withheld until an attempt event exists.

## Commands

```bash
bun install
bun run check          # tsc --noEmit + biome check + bun test — the gate the stop hook runs
bun test               # quick loop
bun run dev            # src/server.ts, opens the browser on localhost
bun src/server.ts --mcp   # MCP over stdio (T10); the harness closing stdin stops it
bun run build          # scripts/build.ts → dist/StudyTutor-windows.zip, dist/StudyTutor-mac.zip
bun scripts/test-generators.ts   # 300 runs per generator
```

## Workflow (PIV loop)

Research → Plan → Implement → Validate, one ticket per loop, fresh session per phase. Epic level: `plan-create-prd` → `plan-architecture` → `piv-slice-epic` → GitHub Issues. All PIV artefacts live under `.claude/` (`plans/`, `reports/`, `code-reviews/`, `execution-reports/`, `system-reviews/`), never `.agent/`. Skills carry their own descriptions; do not re-document them here.

## Where new code goes

- A new model job → `src/jobs/<job>.ts` (prompt, shapes, validate, fallback) + a mocked fallback test. Register it in `src/flow`, not the other way round.
- A new event → `src/events/types.ts` union + a reducer case in `src/events/replay.ts` + a replay test.
- A new item type → `src/marking/<type>.ts` if deterministic; otherwise a job with a `mark_scheme` input.
- A new subject → `content/<subject>/` with `topics.json`, `items/`, `generators.js`; nothing in `src/` changes.
- A new page → `app/<page>.html` reading `/api/state` and posting events; no page writes files.
- A new tool for external harnesses → `src/mcp/tools.ts`; it must be expressible as read_state or write_event.

## On-demand context

| When touching | Read first |
|---|---|
| Events, replay, `state.json` | `.claude/references/events.md` |
| A model job, a prompt, the provider seam | `.claude/references/model-jobs.md` |
| Items, topics, generators, a new subject | `.claude/references/content-pack.md` |
| Lessons, hints, any pupil-facing text | `.claude/rules/content.md` (path-scoped, loads for `content/**` and `src/jobs/**`) |
| Product intent, experiments E1–E5, open questions | `docs/prd/study-tutor-v2.prd.md` |
| Decisions D1–D11, spikes S1–S5 | `docs/prd/study-tutor-v2.architecture.md` |
| v1 donor (lessons, quiz.js, generators, formats) | `~/Desktop/Matis_study_tutor/` (master copy, PRD Q1) |
