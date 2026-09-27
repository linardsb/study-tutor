# PR #30 review fixes, round 1

Review: https://github.com/linardsb/study-tutor/pull/30#issuecomment-5857418401 (head `cca4fdf`).
No scope was given, so triage followed the review's recommendation: M1 in this PR, L1 and L2 with it
because each is a few lines, L3 not fixed.

## Fixed

**M1 · `src/mcp/tools.test.ts`: the allowlist test can now fail.**
The refusal loop sent `{ v: 1, type, topic: "U687" }`, which `appendEvent` refuses as malformed, so
`/^Refused/` passed whether or not the allowlist ran. Each non-writable type now sends the first line of
`src/events/__fixtures__/<type>.v1.jsonl` with `t` dropped, and the test asserts the exact message
`Refused: <type> events are written by the tutor's own pages, not by a tool` and that `ctx.dataDir` does
not exist afterwards.
- Probe, the review's mutation verbatim: `tools.ts:139` changed to `if (type === "attempt")`.
  `bun test src/mcp`: 25 pass, 1 fail, the failing test being this one (observed, 2026-09-27). Reverted;
  `git diff --stat src/mcp/tools.ts` empty afterwards (observed).
- On the real code: `bun test src/mcp/tools.test.ts` 14 pass, 0 fail (observed).

**L1 · `src/events/append.ts`: an intake row keeps only `topic` and `rag`.**
`appendEvent` copied the type's own keys at the top level only, so extra fields inside an intake row
reached the log. After the top-level copy, each object row in `topics` is rebuilt as `{ topic, rag }`.
Non-object rows pass through unchanged, so `parseEvent` still refuses them.
- Test: `append.test.ts` "stray fields inside an intake row never reach the log", with the review's
  row verbatim (`{topic:"U687",rag:"R",answers:["3:4"],blob:"x"}`). Against the unfixed `append.ts`:
  0 pass, 1 fail, the diff showing `"answers"` in the stored row (observed). After the fix: pass.
- Probed at the `appendEvent` level, not through `write_event` as the review did. `write_event` calls
  `postEvent`, which calls `appendEvent`, and the fix is inside `appendEvent`.
- Mechanism risk: a row with no `rag` becomes `{ topic, rag: undefined }`, which `JSON.stringify`
  drops, so `parseEvent` refuses the event as before. No new test for that; the existing validation
  tests for intake cover a bad `rag`.

**L2 · `src/mcp/server.test.ts`: the spawned `--mcp` test runs `read_state` and `write_event`.**
Two calls were added: `read_state {topic:"U687"}` (expects `isError: false`), and a `write_event` intake
with `rag: "X"` (expects `isError: true`). The write is refused by validation, so the run does not
change the repo's `data/`, which is the spawned process's data folder. Every stdout line is already
passed through `JSON.parse`, which throws on a non-JSON line.
- Note: the review cited `src/server.test.ts:187-214`; the test is in `src/mcp/server.test.ts:187`.
- Probe: `console.log("stray")` inserted in `read_state`'s `run`, then separately before `postEvent`
  in `write_event`'s `run`. Each gave 0 pass, 1 fail, with
  `SyntaxError: JSON Parse error: Unexpected identifier "stray"` (observed). Reverted.
- `ls data` in the worktree after the run: nothing (observed).
- `for i in 1 2 3 4 5; do bun test src/mcp/server.test.ts; done`: 8 pass on each of 5 runs (observed).

## Not fixed

**L3 · `src/mcp/server.ts:80-83`.** A JSON-RPC response from the client gets a `-32601` reply, and an
object `id` is echoed. Neither can happen while the server sends no requests to the client, and the
review itself says to fix it only if that changes. Dropped with no ticket.

## Deferred

None.

## Needs a manual look

None beyond the S3 runs, which these fixes do not touch.

## Validation

- `bun run check` in `~/Desktop/study-tutor-t10`: exit 0, 158 pass, 0 fail, 17 files (observed,
  2026-09-27). Biome: the same 4 warnings, all in `app/style.css` (observed, `bunx biome check .`).
- `bun test src/mcp src/events/append.test.ts src/content/pack.test.ts`: 57 pass, 0 fail, 5 files
  (observed).

## Figure sweep

The fixes change three figures: the total test count (157 to 158), the report's subset count (56 to 57)
and the `src/` size.

- `grep -nE "157|\b56\b" .claude/reports/t10-mcp-server-report.md`: lines 52, 54. Both now give the
  old figure at `cca4fdf` and the new one after this round.
- `grep -nE "157|\b56\b|997|587|410" .claude/plans/t10-mcp-server.md`: no hits.
- PR body: line 14 (size) and line 26 (157). Line 26 is a record of the run at `cca4fdf` and stays; a
  line for this round is added under Validation. Line 14 is recomputed from
  `git diff --numstat 9fe7317 -- src` on the fixed tree (observed): non-test
  27 + 23 + 132 + 217 + 21 = 420; tests 14 + 61 + 227 + 322 = 624; 420 + 624 = 1044.
- Subject sweep: `grep -n "allowlist loop" .claude/reports/t10-mcp-server-report.md` line 14 now says
  the loop sends a valid fixture body. `events.md`'s "a stray caller field never reaches the log" is
  now true for intake rows and needs no edit.
- Unchanged: `tools.test.ts` 14 tests (one replaced, none added), `server.test.ts` 8 tests.
