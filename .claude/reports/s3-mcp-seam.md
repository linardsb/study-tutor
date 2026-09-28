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

## Codex leg (#28)

**Date**: 2026-09-28   **Ticket**: #28   **Branch**: `chore/issue-28-codex-leg`
**Harness**: Codex CLI `codex-cli 0.158.0` (observed, `codex --version`); `codex login status` printed "Logged in using ChatGPT" before and after the run (observed)
**Server**: `StudyTutor-x64` from `bun run build` (`dist/StudyTutor-mac.zip`, 47,021,968 bytes, observed), unzipped to a scratch folder with no `data/`. The machine is `x86_64` (observed), so the x64 binary was used, per F1 above.

### Result

**Handshake works; the session did not run.** Codex started the server, completed `initialize` and `tools/list`, and got all four tools. The model turn then failed on Codex's own ChatGPT login (HTTP 401), so Codex sent no `tools/call`. The script (clock, read_state, open_lesson, write_event session start and end, write_event attempt refused) is still owed on Codex.

### Setup

- A shell shim between Codex and the binary logged both directions: `tee stdin.log | StudyTutor-x64 --mcp | tee stdout.log`.
- Block appended to `~/.codex/config.toml` for the run: `[mcp_servers.tutor]`, `command = "<scratch>/tutor-shim.sh"`, `args = []`. `codex mcp list` showed `tutor … enabled` (observed). The block was removed afterwards; the config is byte-identical to its state before the run (`cmp`, observed).
- Command: `codex exec --json --skip-git-repo-check --ephemeral -s read-only -c approval_policy='"never"' -c mcp_servers.pencil.enabled=false -c mcp_servers.inspector-gateway.enabled=false "<T10 run 1 prompt, prefixed with: Use only the tutor MCP tools; do not run shell commands or read files.>" < /dev/null`

### What Codex sent (observed, shim log)

```
→ {"jsonrpc":"2.0","id":0,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{"experimental":{"codex/auth-change":{}},"elicitation":{"form":{},"url":{}}},"clientInfo":{"name":"codex-mcp-client","title":"Codex","version":"0.158.0"}}}
← {"jsonrpc":"2.0","id":0,"result":{"protocolVersion":"2025-06-18","capabilities":{"tools":{}},"serverInfo":{"name":"study-tutor",...},...}}
→ {"jsonrpc":"2.0","method":"notifications/initialized"}
→ {"jsonrpc":"2.0","id":1,"method":"tools/list","params":{"_meta":{"progressToken":0}}}
← tools: read_state, write_event, open_lesson, clock
```

- First request: `initialize` (not `server/discover`), `protocolVersion` `2025-06-18` (observed). Claude Code sent `2025-11-25`, so the server's version echo works for both clients (observed across the two legs).
- Codex adds `experimental` and `elicitation` capabilities and a `_meta.progressToken` on `tools/list`. The server ignored them and answered normally (observed).
- Stdin lines: 3; `tools/call` lines: 0 (observed, `wc -l`, `grep -c`).

### Per-tool outcome

| Step | Outcome |
|---|---|
| clock | not called |
| read_state (no topic, then topic) | not called |
| write_event session start | not called |
| open_lesson | not called |
| write_event attempt | not called, so neither refused nor accepted on Codex. The server-side refusal stands as shown in the Claude Code leg |
| write_event session end | not called |

No `data/` folder was created in the scratch copy (observed), so nothing was written.

### The failure (observed, exact text)

`codex exec` exited 1. Its JSON stream ended with:

```
{"type":"turn.failed","error":{"message":"workspace routing discovery unauthorized (401)"}}
```

after `Reconnecting... 5/5` on WebSocket, a fall-back to HTTPS and `Reconnecting... 5/5` again, all with the same message. Codex's stderr repeated `ERROR codex_login::auth::manager: Failed to refresh token: Your access token could not be refreshed. Please log out and sign in again.` and, earlier, `ERROR codex_models_manager::manager: failed to refresh available models: unexpected status 401 Unauthorized: Could not parse your authentication token. Please try signing in again., url: https://chatgpt.com/backend-api/codex/models?client_version=0.158.0`. The server's own stderr held one line, `Study tutor MCP server; lessons at http://127.0.0.1:4731/`.

The cause is on the Codex side: the stored ChatGPT token cannot be refreshed, even though `codex login status` still reports a login. It is not an MCP incompatibility, because the MCP exchange had finished before the model call failed. The fix is `codex logout && codex login` in an interactive terminal. It was not retried here.

Process hygiene: `pgrep -fl StudyTutor` after the run printed nothing (observed). That the server exited when Codex closed stdin is derived from that.

### Decision

Architecture S3 rule: works → keep MCP in v1 / fails → in-app loop only, MCP deferred. **Not decided on Codex.** The protocol layer works with Codex 0.158.0 (handshake and tool list, observed). The session layer is untested because of the auth failure. The Claude Code leg's "keep MCP in v1" stands. The in-app loop (T9) does not use either harness, so it is unaffected. Remaining for #28: sign Codex in again, rerun the command above against the same shim and fill in the per-tool table. Whether `approval_policy="never"` lets MCP tool calls through or cancels them is expected to work but untested. Unlike T10's `--tools ""`, Codex kept its shell tool under `-s read-only` and was only asked not to use it, so this run is not equivalent to D6's tool scope; the rerun should note whether Codex read any file.

### Config a user adds

```toml
[mcp_servers.tutor]
command = "/path/to/StudyTutor/StudyTutor-arm64"   # StudyTutor-x64 on an Intel Mac
args = ["--mcp"]
```
