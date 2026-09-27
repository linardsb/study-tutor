---
title: "Architecture — Study tutor v2"
status: decided
created: 2026-09-26
slug: study-tutor-v2
---

# Architecture — Study tutor v2

Intent: [study-tutor-v2.prd.md](./study-tutor-v2.prd.md)

Grounding: the PRD's base constraints 1–7 and non-goals; the v1 tutor at `Matis/` (both copies, read
2026-09-26); the v1 architecture doc in the Fredis repo (`.agent/plans/study-tutor-architecture.md`).
The five research briefs of 2026-09-26 the PRD cites were not on disk; this doc uses the PRD's summary
of them.

## Problem & goals

A tutor any family can download, unzip and double-click on Windows or macOS, run on their own model key
(or no model at all), on any GCSE subject, that a 15-year-old opens three times a week unprompted. Every
decision below is judged against three things: does the parent finish setup unaided in under 30 minutes,
does the pupil's data survive every update, and does the model ever get a chance to hand over an answer
before an attempt.

Two facts about v1 shape the design. The whole session flow lives in the model (a 16k-character study
skill the model executes), so nothing runs without a model and the engine is welded to one vendor's
harness. And no page persists anything: `quiz.js` copies a score line to the clipboard for the pupil to
paste into chat, so progress tracking depends on the model being present.

## Approaches considered

| | Shape | For | Against | Verdict |
|---|---|---|---|---|
| **A1** | Local app: one folder with a compiled single-file runtime that serves the pages on localhost, writes state, holds the key, runs a provider-agnostic model loop and exposes the same tools as an MCP server | Key never in the browser (constraint 7); pages can write state; runs with no model; any harness that speaks MCP can drive it; one folder is the whole deployment | Unsigned binary meets Gatekeeper and SmartScreen once; two builds to own | **Chosen** |
| A2 | Browser-only PWA: pages plus key in browser storage, File System Access API for files, direct calls to the provider | No binary, no build | Key in the browser breaks constraint 7; Safari and Firefox lack directory handles; local models need CORS set by hand; no harness can plug in | Rejected |
| A3 | Parent-deployed Cloudflare Worker holding the key and proxying the model, static pages and local files | Free small model via Workers AI for no-card families | A Cloudflare account and a deploy step inside the 30-minute budget; a per-family hosted service | Kept as the R5 experiment, not the base |

## Recommended approach

One folder, three parts:

```
StudyTutor/
├── StudyTutor(.exe)      compiled Bun binary: static server · state writer · clock · model loop · MCP server
├── Start.command / Start.bat
├── app/                  pages, assets, quiz.js, style           ← replaced by updates
├── content/<subject>/    topics, items, generators, lessons     ← replaced by updates
└── data/                 the pupil's records                     ← never touched by updates
```

Double-click starts the binary, which opens the browser at `http://localhost:<port>`. The browser is the
whole pupil-facing surface: level map, lessons, practice, chat panel, camera page. The binary is the only
thing that touches the file system, the clock, the key and the network.

**Code holds the flow; the model gets bounded jobs.** The session state machine, the 3/10/30/60 re-test
ladder, XP and the weekly flame, boss selection from confident-wrong items, seeded squad tests and the
daily detective case are code. The model is called at named points with a typed result expected back:
the guess-first dialogue, a hint, a teach-back mark against the mark scheme, Dan's scripted wrong step
(O2), an examiner mark of a photo (O3), reading a sheet or photo at intake. With no key set, every path
that needs a model degrades to its deterministic form and O1, O4, O5, practice and re-tests run in full.

This inverts v1 and buys three things at once: the no-model mode of constraint 2, deterministic marking
of constraint 3, and a structural answer guard (below).

**The tool contract is an MCP server.** Four tools: `read_state`, `write_event` (confined to `data/`),
`open_lesson`, `clock`. The in-app loop uses them; so can Codex, Claude Code or Gemini CLI on a machine
where that is legal. The portability seam the PRD asked for is a standard, not a bespoke adapter.

## Key decisions

**D1 Engine: A1, a compiled local app.** See above. Reversibility: low. This is the one-way door, and
S1 tests its worst edge before anything is built on it.

**D2 Flow in code, model as component.** The model never orchestrates. Each model job has a prompt, an
input shape, an output shape validated in code, one retry, and a deterministic fallback ("no verdict",
continue). Consequence for the guard: for any item with a right answer, the model is not given the
answer until an attempt event exists, so answer-before-attempt is impossible by construction for
generator items; a small-model judge in shadow mode covers free dialogue. The Jev guard and grader
(PRD Q5) do not carry over as a base dependency: a second vendor and a second key a parent must obtain
is setup cost with no pupil-facing benefit. They stay as optional developer-side shadow tooling.

**D3 Data: append-only events, derived snapshot, plain JSON.**
`data/events.jsonl` is the record (attempt, session, retest, teachback, intake, xp). `data/state.json`
(topic map, rung per topic, XP, flame, next-due) is rebuilt by replaying events and can be deleted at
any time. A schema change in an update is a replay, never a migration, which is how constraint 6 is
met. `profile.json` holds pupil, board, subjects, weekly target, squad id. v1's `topics.md` and
`sessions.md` survive as generated human views, not as the store. Rejected: SQLite (binary blob,
driver, nothing gained at this volume); markdown tables as the store (the model edited them; code does
not need to).

**D4 Provider seam: one setting, OpenAI-compatible chat completions, plain `fetch`.**
`base_url` + `key` + `model` covers OpenAI, OpenRouter, Groq, Mistral, DeepSeek, Ollama, LM Studio and
Anthropic's compatibility endpoint. Vision goes as `image_url` content parts. Structured output is JSON
requested in the prompt and validated in code, not a provider feature, so the floor is any model that
can return JSON. No AI SDK, no LiteLLM. The spend cap is the provider's; the app keeps a local monthly
token count and shows it to the parent (PRD guardrail metric). Gemini is not offered as a preset
(non-goal).

**D5 Content: one item schema, subject packs.**
`content/<subject>/topics.json` keys topics by exam-board specification statement id (for example
`1MA1/R9`) with school codes (Sparx U-codes) as aliases, so a school sheet resolves to a topic without
touching content. An item is `{id, topic, type, stem, params?, answers?, mark_scheme?, misconceptions[]}`
with `type` one of generator, cloze, label, sequence, short, extended, vocab, practical-method.
Generator items carry `params` for `generators.js`; cloze, label, sequence and vocab mark in code; short
and extended go to the model with the mark scheme. Misconceptions are per item and feed O2's scripted
errors and O5's planted mistakes, so those two options are content work, not engine work. `generators.js`
runs unchanged in the browser (practice) and in the binary (seeded squad tests, marking). Maths pack
first, from the 21 lessons and 21 generators; science second from Oak National Academy under OGL;
exam-board material link-out only.

**D6 Runtime: Bun, `bun build --compile`, one binary per OS.**
The lessons, `quiz.js` and the generators are JS and must run on both sides, so a JS runtime keeps one
language. Bun compiles to a single file with built-in `serve`, `fetch` and `sqlite` (unused), no
installer. Deno `compile` is the equal alternative if S1 finds a Bun-specific problem. Rejected: Python or
Node (not present on a family PC), Electron or Tauri (a build and signing pipeline the PRD excludes),
shipping a portable runtime in the zip (same Gatekeeper cost, more files).
Language and gate (settled 2026-09-26 with `rules-create-global`): server code in TypeScript, browser
assets in plain JS; Biome for lint and format; `bun run check` = `tsc --noEmit` + `biome check` +
`bun test`, and that command is the stop hook's gate.

**D7 Lesson bridge: served pages post events.**
Pages come from localhost, so `quiz.js` posts an `attempt` event to the binary instead of copying a
score line. The 21 existing lessons need no markup change: `quiz.js` already injects the score line and
the Sure/Not sure controls. Confidence (Sure) and correctness travel in the event, which is what boss
selection and the calibration line read.

**D8 O3 photos: the phone is a camera, the PC marks.**
The map shows a QR code for `http://<pc-lan-ip>:<port>/snap?token=<one-time>`; the phone on the same
Wi-Fi opens it and takes the photo; the binary saves it to `data/intake/` and sends it to the vision
model with the item's mark scheme. Fallback: drop a file on the page. This is the only listening
address beyond loopback, bound for the session and gated by the token. Rejected: any relay (non-goal),
email or messaging (outbound channels are non-goals).

**D9 Squad (O4): files, no server.**
Seed = hash(squad id, ISO week, topic), so identical numbers need no exchange. Results are one file per
pupil in `squad/<squad-id>/`, which any sync folder (Drive, OneDrive, iCloud) or a hand-passed
`.squad.json` can carry. Each pupil writes only their own file. Answers PRD Q9: a shared folder is a
convenience, not a requirement.

**D10 Distribution and updates.**
GitHub Releases, two zips (`windows`, `mac`). An update replaces `StudyTutor`, `app/` and `content/` and
never `data/`. The binary reads the releases feed and shows "update available"; the parent downloads.
No auto-update, no signing in v1; the parent's first run on macOS is right-click → Open, documented with
a screenshot.

**D11 Under-18 posture (constraint 7).**
The key lives in `data/config.json` with owner-only permissions, written by the parent through a setup
page on first run and never sent to the browser. The model has no shell, no file tools beyond the four
MCP tools, and `write_event` refuses paths outside `data/`. "This is an AI" is fixed in the chat panel.
Session logs and the monthly token count live in `data/` for the parent's digest. Terms are re-checked
each release (R4).

Skipped, with reason: auth (single-user local app, none needed); a database (D3); a build pipeline
beyond `bun build` (non-goal).

## System behaviour

- **What accumulates:** `events.jsonl` grows about one line per item, a few kB per session; years fit in
  a few MB. Token spend accumulates per month and is shown, not hidden. Content packs grow by subject.
- **Delayed feedback:** a provider changing its terms or compatibility endpoint shows up as failed jobs
  weeks later; the deterministic fallback keeps sessions running and the failure is logged where the
  parent digest reads it. A replay bug in state derivation shows only after an update; a `replay
  --check` on startup compares the old and new snapshot and refuses to start if a rung would fall.
- **Bottleneck once it works:** content authoring. Every option after O1 is bounded by items with good
  misconception banks, not by engine work.
- **Gaming:** XP is granted only on attempt events with a score and on teach-backs, never on a click;
  the guardrail metric (re-test score must not fall while XP rises) is computed from the same events.
  A pupil can edit `events.jsonl` by hand; the design accepts this, since the school paper is the judge.

## Missing pieces

- The Bun binary itself: static server, event writer with `data/` confinement, replay, clock, provider
  loop, MCP server.
- Setup page (parent enters key, model preset, spend cap) and the "update available" check.
- The item schema and a converter from the 21 lessons' hand-written items and generators into the maths
  pack.
- Level map, boss battle, weekly flame and detective case pages (O1, O5) on top of `state.json`.
- Camera page and one-time token (O3); squad folder reader and seeded test page (O4); Dan job and
  misconception bank format (O2).
- Parent digest generator (PRD Q7 decides its content).
- A test that runs every generator 300 times (exists in v1 as `test-generators.js`) and a replay test.

## Spikes & experiments

```
S1  Question:      does an unsigned Bun binary plus a .command/.bat launcher get a parent from zip to
                   first page on a fresh Mac and a fresh Windows PC?
    Spike:         hello-world server, zip, run on both, time a non-technical adult · half a day
    Decision rule: under 10 min with no dead end → A1 as drawn / Mac fails → Windows first, Mac via one
                   Terminal line, revisit A2 for Mac only

S2  Question:      is one OpenAI-compatible fetch enough across providers?
    Spike:         hint, teach-back mark, one vision mark through OpenAI, Anthropic compat, OpenRouter,
                   Groq, Ollama · 2 hours
    Decision rule: 4 of 5 clean → plain fetch / worse → thin per-provider adapter, still no SDK

S3  Question:      is the MCP seam real?
    Spike:         Codex CLI connects to the binary's MCP server and runs one session · 2 hours
    Decision rule: works → keep MCP in v1 / fails → in-app loop only, MCP deferred

S4  Question:      can a local 8B model do the three jobs without inventing numbers?
    Spike:         Qwen3-8B via Ollama on S2's jobs with the answer withheld · 1 hour
    Decision rule: zero wrong-number outputs → local allowed for all jobs / else "local: hints only"

S5  Question:      does replay hold across a schema change?
    Spike:         write 200 synthetic events, change the state shape, replay, diff · 1 hour
    Decision rule: identical rungs and XP → ship / drift → add the startup `replay --check` first
```

**S1 result (2026-09-27).** Zips built on the dev Mac by `bun run build` (T1, #3; `observed` after the PR #21 round 2 fixes: Windows
41,127,857 bytes, mac 46,808,764 bytes with both arm64 and x64 binaries).

- Mac, dev machine (macOS 15.7.3, Intel), run by the implementing session: the x64 binary from the
  extracted zip served 200 through `Start.command` (`observed`). Dialog count: `pending`, owner Linards,
  expected 2026-10-04; the Safari download and Finder double-click need a person at the screen. In its
  place, Gatekeeper's verdict on quarantined copies was read with `spctl`: `rejected, source=no usable
  signature` for both `Start.command` and the binary (`observed`), which is the "cannot be verified"
  dialog with an Open Anyway path, not the "damaged" dead end. That holds only because the build re-signs
  both mac binaries ad hoc: Bun's darwin-x64 compile leaves Bun's own Developer ID signature in place and
  invalidates it (`observed`: `codesign -vv` reports "code or signature have been modified"), and a
  quarantined binary with an invalid signature gets "damaged" with no Open Anyway (`expected`: documented
  macOS behaviour, not run in this ticket). On macOS 15 and 26 the
  path is Done, System Settings, Privacy & Security, Open Anyway, open again; D10's right-click Open no
  longer exists on these versions.
- Windows, a fresh PC: `pending`, owner Linards, expected 2026-10-04. Protocol: plan
  `.claude/plans/s1-spike-and-repo-skeleton.md`, Level 4 step 4.
- Mac, a fresh Apple silicon machine: `pending`, owner Linards, expected 2026-10-04. Level 4 step 5.
- Decision by the rule: `pending` until both fresh-machine legs are in.

PRD experiments E1–E5 stand. E1 (adherence on the existing folder) runs before any of this is built.

## Open questions

- PRD Q1–Q4, Q6–Q8, Q10 unchanged. Q5 is answered above (structural guard; Jev optional). Q9 is
  answered by D9.
- Q11. Settled by S1: the first free of 4731 to 4735, then any free port; the URL is printed in the console
  either way.
- Q12. Does Anthropic's compatibility endpoint carry vision and JSON well enough, or does Anthropic need
  the one adapter S2 allows for? Settled by S2.
- Q13. Where does the parent digest go with no outbound channel: a page, a file in `data/digest/`, or
  both? Depends on Q7.
- Q14. Does the maths pack keep Sparx U-codes as the primary key until Edexcel is confirmed (Q2), or
  switch to spec statement ids now with U-codes as aliases? Recommendation: switch now; the alias table
  is the same work either way.
