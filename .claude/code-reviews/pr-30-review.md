# PR #30 review, round 1: T10 MCP server

**PR** #30 · **Head** `cca4fdf` · **Base** main @ `9fe73178474d949e2ab0af9c878dc54b6106a6bf` · reviewed 2026-09-27 in `~/Desktop/study-tutor-t10`

## Summary

The PR adds `StudyTutor --mcp`, which speaks JSON-RPC over stdio and exposes four tools (`read_state`, `write_event`, `open_lesson`, `clock`). It also stops an event from carrying a `photo.file` path outside `data/`. The answer guard holds on every MCP path I traced. The one real gap is test coverage: the runtime allowlist, which stops a harness writing `teachback`, `xp`, `retest` and similar events, can be weakened and every test stays green (M1, observed by mutation). No Critical or High findings.

First round, so the guarantees pass and fix-mechanism pass do not apply: no earlier `pr-30-review*.md` exists, and the live `origin/main` tip equals `baseRefOid` (`9fe7317`, observed).

## Issues

### Critical
None.

### High
None.

### Medium

**M1 · tests · `src/mcp/tools.test.ts:162-174`, guarding `src/mcp/tools.ts:139`**
The runtime allowlist has no test that can fail. The test "every type not MCP-writable is refused" sends `{ v: 1, type, topic: "U687" }`, which is not a valid event for any type. `appendEvent` therefore refuses it as malformed (`Refused: not a valid … event`), and the test's `/^Refused/` matches either way.
- Observed: changing `tools.ts:139` to `if (type === "attempt")`, so that only `attempt` is blocked, leaves `bun test src/mcp` at 26 pass, 0 fail. The file was reverted afterwards.
- Consequence if it regresses: a harness can write a well-formed `teachback`, `xp` or `retest` event, which puts unmarked scores or XP in the record. Plan D1 rules that out.
- Fix: for each non-writable type, send a valid v1 body taken from `src/events/__fixtures__/<type>.v1.jsonl` with `t` dropped. Assert the exact message `Refused: <type> events are written by the tutor's own pages, not by a tool`, and assert that `ctx.dataDir` does not exist afterwards.

### Low

**L1 · events contract · `src/events/append.ts:72-76` with `src/api/event.ts:36-39` (existing behaviour, newly reachable from a harness)**
`appendEvent` keeps only the event type's own keys, but only at the top level. Fields inside an intake row pass through unchecked.
- Observed: `write_event {v:1,type:"intake",door:"interview",topics:[{topic:"U687",rag:"R",answers:["3:4"],blob:"x"}]}` returned ok, and the line in `events.jsonl` kept `answers` and `blob`.
- Nothing is revealed, because replay reads only `topic` and `rag`. It does contradict `events.md` ("a stray caller field … never reaches the log") and the comment at `append.ts:65-66`, and there is no size limit on what a harness can store this way.
- Fix: in `appendEvent`, reduce each intake row to `{ topic, rag }`, and add one test.

**L2 · tests · `src/server.test.ts:187-214`**
The spawned `--mcp` test only calls `clock`. The `read_state` and `write_event` paths never run in the child process, so no test would catch a later `console.log` on those paths corrupting stdout. A grep shows stdout is clean today: the only `console.log` in `src/` is `server.ts:197`, in the non-MCP branch (observed).
- Fix: add `tools/call read_state {topic:"U687"}` to the spawned input, and assert that every stdout line parses as JSON-RPC.

**L3 · protocol · `src/mcp/server.ts:80-83`**
`handle` treats any object with an `id` as a request. A JSON-RPC *response* sent by the client (it has an `id` but no `method`) gets a `-32601` error back, and an `id` that is an object or array is echoed without a check. Neither can happen today, because the server never sends requests. Fix only if server-to-client requests are ever added.

### Constraint pass
Grepping the plan for `do not modify|read-only|no changes to|frozen` finds nothing, so no fix above conflicts with the plan's acceptance criteria.

### Rebase note for T7 (not a finding on this PR)
T7 adds a `case` event that carries `correct`. `MCP_WRITABLE` is typed `Record<EventType, boolean>`, so `tsc` will fail until the table gets a `case` row, and that row must be `false`. Whichever of the two merges second should add `case` to M1's valid-body refusal test.

## Validation

| Check | Result |
|---|---|
| `bun run check` (tsc + biome + bun test) at `cca4fdf` | exit 0 · 157 pass, 0 fail, 17 files (observed) |
| Biome warnings | 4, all in `app/style.css` lines 621, 622, 650, 651, which this PR does not touch (observed) |
| `bun test src/mcp src/events/append.test.ts src/content/pack.test.ts` | 56 pass, 0 fail, 5 files (observed, same figure as the report) |
| CI | SonarCloud pass; PR is draft per #165 |

## Numbers pass

Every figure in the PR body and the report was re-derived:
- The `src/` size figures (27 + 13 + 132 + 217 + 21 = 410; 14 + 45 + 214 + 314 = 587; 997 total) match `git diff --numstat 9fe7317..HEAD -- src` (observed).
- The 157 pass across 17 files and the 4 biome warnings in `app/style.css` match my own run (observed).
- The test counts (14 in `tools.test.ts`, 8 in `server.test.ts`) and "all 21 topics" match a count of the test files and of `topics.json` (observed).
- For the mutation table, I reran only the reviewer's allowlist mutation above. The report's four rows were not re-run and are taken as recorded.
- The S3 claims (Claude Code version, the x64 and arm64 runs) are manual runs that this review did not reproduce.

## Guard

- **`read_state`** projects every item through `toItemView` unless an attempt event exists for that exact item id. Item ids carry their topic, so ids from different topics cannot collide, and `#gen` unlocks nothing else.
- **`write_event`** echoes back only the parsed event, and only `session` and `intake` can be written.
- **Errors**: a non-`Refused` error is masked. The only caller input an error message echoes is the topic string.
- **Item fields**: across all 105 items, the only fields besides the four stripped ones are `id`, `topic`, `type`, `stem`, `scaffold`, `hint` and `figure` (observed).

The guard holds.

## What is good

- The guard is enforced twice, first by the allowlist and then by the `KEYS` projection in the single writer. `MCP_WRITABLE` is typed so that a new event type does not compile until someone decides whether a harness may write it.
- `resolveInData` checks real paths before anything is created. A dangling symlink, `..` or an absolute path is refused, and the log is opened with `O_NOFOLLOW` (the open fails if the file is a symlink).
- The JSON-RPC layer uses no SDK. Its line reader joins a UTF-8 character split across chunks, and a spawned-process test covers exit 0 when stdin closes. The deviations are documented honestly, including the `TextDecoderStream` type failure.

## Recommendation

**Approve, with M1 fixed before merge.** There are no Critical or High findings, validation is green, and the PR matches its stated intent. M1 is a test-only change, but the test it fixes protects part of the answer guard, so it should land in this PR. L1 to L3 can go in this PR or a follow-up issue.
