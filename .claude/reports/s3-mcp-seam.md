# S3 — is the MCP seam real? (Claude Code leg)

**Date**: 2026-09-27   **Ticket**: #12 (T10)   **Branch**: `feature/t10-mcp-server`
**Harness**: Claude Code 2.1.280 (observed, `claude --version`)
**Server**: the compiled binary `StudyTutor-x64` from `bun run build` (`dist/StudyTutor-mac.zip`, 46,969,572 bytes, observed), unzipped to a scratch folder outside the repo
**Machine**: Intel Core i9-9900K, `uname -m` = `x86_64` (observed)

## Decision

**Works → keep MCP in v1** (architecture S3 rule). Claude Code connected to the compiled binary and ran a whole session through the four tools. It found the topic from `read_state` and the event fields from the `write_event` description, with no field named in the prompt. No answer appeared before an attempt existed. After the pupil's attempt, exactly that item's answers appeared.

**Codex leg owed by [#28](https://github.com/linardsb/study-tutor/issues/28)** (open, observed). The architecture's S3 spike names Codex CLI, and Codex CLI is not installed on this machine (observed during planning, 2026-09-27). This report covers the Claude Code client only.

## Setup

- `mcp.json`: `{"mcpServers":{"tutor":{"command":"<scratch>/StudyTutor/StudyTutor-x64","args":["--mcp"]}}}`
- Flags on both runs: `--mcp-config mcp.json --strict-mcp-config --tools "" --allowedTools "mcp__tutor__read_state,mcp__tutor__write_event,mcp__tutor__open_lesson,mcp__tutor__clock" --output-format stream-json --verbose`
- `init` line of run 1 (observed): `mcp_servers: [{"name":"tutor","status":"connected"}]`, `tools: ["mcp__tutor__clock","mcp__tutor__open_lesson","mcp__tutor__read_state","mcp__tutor__write_event"]`. No built-in file or fetch tool was available (plan D6).
- First request from Claude Code: `initialize` with `protocolVersion` `2025-11-25`, then `notifications/initialized`, `tools/list` and `tools/call` carrying `_meta` (plan D4 probe, observed at planning). The server echoes `2025-11-25`, as `server.test.ts` checks.

## Run 0: wrong binary (observed)

The plan named `StudyTutor-arm64`. Claude Code's `init` line reported `"status":"failed"` and the model said it had no tutor tools (observed). Nothing was written. The cause is derived, not traced: `uname -m` is `x86_64`, and an arm64 binary does not run on an Intel CPU. The mac zip ships both binaries, and `Start.command` picks one with `case "$(uname -m)" in arm64) … *) ./StudyTutor-x64` (observed, read from the unzipped folder). An MCP config names the binary directly, so it must name the one that matches the CPU. The runs below use `StudyTutor-x64`.

## Run 1: a session, unaided (observed)

Prompt: the plan's Task 8 step 3 text, which names no event field.

| # | Tool call (as sent by Claude Code) | Result |
|---|---|---|
| 1 | `clock {}` | `{"utc":"2026-09-27T15:34:00Z","day":"2026-09-27","week":"2026-W39"}` |
| 2 | `read_state {}` | empty record (`lines: 0`), 21 topics incl. `{"id":"1MA1/R4","title":"Simplifying ratio","aliases":["U687"]}` |
| 3 | `read_state {"topic":"1MA1/R4"}` | 5 items `1MA1/R4#1`–`#5`; `"answers"` occurs 0 times in the result |
| 4 | `write_event {"type":"session","v":1,"phase":"start","mode":"lesson","topic":"1MA1/R4"}` | stored, `t` `2026-09-27T15:34:08Z` |
| 5 | `open_lesson {"topic":"1MA1/R4"}` | `http://127.0.0.1:4731/content/maths/lessons/0002-U687-simplifying-ratio.html` |
| 6 | (attempt on `#1` marked correct) | **not sent.** The model declined, citing the `type` enum (`session`, `intake`) and the description ("Attempts are written by the lesson page, never by a tool") |
| 7 | `write_event {"type":"session","v":1,"phase":"end","mode":"lesson","topic":"1MA1/R4"}` | stored, `t` `2026-09-27T15:34:11Z` |

`data/events.jsonl` after run 1 (observed): two `session` lines, zero `attempt` lines.

**Which layer stopped the attempt.** In run 1 the model stopped it, before any request reached the server. To show the server layer on the same compiled binary, the call was sent as raw JSON-RPC over stdin:

```
→ tools/call write_event {"v":1,"type":"attempt","item":"1MA1/R4#1","topic":"U687","correct":true,"sure":true,"answer":"x"}
← {"result":{"content":[{"type":"text","text":"Refused: attempt events are written by the tutor's own pages, not by a tool"}],"isError":true}}
```

`events.jsonl` still held 2 lines afterwards (observed). The same refusal through `handle` is covered by `src/mcp/server.test.ts` ("tools/call write_event with an attempt is a tool error saying Refused").

## Pupil attempt (observed)

The plan's step 4 starts the binary normally, which opens a browser, and stops it with Ctrl+C. Neither is possible from this shell. Instead the binary ran as `sleep 8 | StudyTutor-x64 --mcp`, which serves HTTP until stdin closes:

```
POST /api/event {"v":1,"type":"attempt","item":"1MA1/R4#1","topic":"U687","correct":false,"sure":true,"answer":"3:4"}
→ 201 {"v":1,"t":"2026-09-27T15:34:40Z","type":"attempt","item":"1MA1/R4#1","topic":"1MA1/R4",...}
GET /content/maths/lessons/0002-U687-simplifying-ratio.html → 200
```

That is the same route and body `quiz.js` posts from the lesson page. The process exited by itself when `sleep` ended.

## Run 2: answers after the attempt (observed)

Prompt: "Call read_state for the topic Simplifying ratio (find it with read_state) and list which item ids include answers."

| # | Tool call | Result |
|---|---|---|
| 1 | `read_state {}` | 3 lines in the record |
| 2 | `read_state {"topic":"1MA1/R4"}` | `"answers"` occurs once in the result |

Model's answer: "Only `1MA1/R4#1` comes back with answers … `1MA1/R4#2` to `#5` show only the question and hint."

## Process hygiene (observed)

`pgrep -fl StudyTutor` after run 0, run 1, the raw call, the HTTP step and run 2: nothing, each time. Every run's server exited when Claude Code closed stdin. The scratch `data/` folder was deleted after the runs.

## Scope of the guard (plan D6)

The guard covers the MCP surface: no tool returns `answers`, `working`, `mark_scheme` or `misconceptions` for an item without an attempt event, and no tool writes an attempt. These runs used `--tools ""`, so Claude Code had no file or network tool of its own. A family's harness with its own `Read` or `fetch` can open `content/maths/items/*.json`, which holds the answers because the lesson page marks in the browser. The architecture accepts this ("the school paper is the judge"). The in-app loop (T9) has only the four tools, so the product path is fully guarded.

## Findings

- F1: an MCP config must name the binary that matches the CPU (run 0). A README line for parents who wire a harness is owed when that doc is written; not in T10's scope.
- F2: the `write_event` description as planned (field names from `KEYS`) was enough. Claude Code filled `phase` and `mode` with valid values unaided, so no description change or rebuild was needed.
