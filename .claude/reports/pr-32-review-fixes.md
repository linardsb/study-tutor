# PR #32 review fixes, round 1

Review: https://github.com/linardsb/study-tutor/pull/32#issuecomment-5866894132 (saved as `.claude/code-reviews/pr-32-review.md`), head `658ff96`.
Triage (the user's call, 2026-09-28): fix all eleven, L3 included. Nothing deferred.

PR state checked first: OPEN. Worktree `~/Desktop/study-tutor-t8`, clean apart from the review file. A `REBASE_HEAD` file is left from the finished rebase onto `5669da4`; there is no `rebase-merge` or `rebase-apply` directory, and `git status` shows no operation in progress.

## Fixed

Each new test was run against the unfixed code first. The review's own input was used unless noted.

| Code | Fix | Test | Red on unfixed code (observed) |
|---|---|---|---|
| M1 | `saveSetup` "none" branch keeps `readConfig(dataDir)?.cap ?? DEFAULT_CAP` when no `cap` is sent. `ConfigView.defaultCap` replaces the `1000000` literal in `setup.js`. | `src/config.test.ts` "No model and back keeps a custom cap" (the review's 100000 → none → cap on disk still 100000); "No model with nothing saved takes the default cap"; the existing "No model clears the saved key" now expects `OPENAI.cap`; `src/api/config.test.ts` asserts `defaultCap === DEFAULT_CAP` | yes: cap on disk was 1000000 |
| M2 | `app/index.html` checks `r.ok` and redirects only on `configured === false`. `app/setup.js` checks `r.ok` for `/api/config` and `/api/usage`, and clears the usage line unless `tokens` is a number. | No DOM test harness in the repo. Browser probe below. | yes, in the browser (below) |
| M3 | PR body: "6 of 8 did not parse; all 4 whose text was captured had this form". | Wording only. | n/a |
| L1 | `checkBaseUrl` refuses a user name, password, `?` or `#`. The save error names them. | `src/config.test.ts`: `https://sk-abc@proxy.example/v1`, `user:sk-abc@…`, `…/v1?api-key=sk-abc`, bare `?`, `#sk-abc`, bare `#` | yes: 6 of 6 saved |
| L2 | `autocomplete="new-password"` on the key box. | Browser probe reads `key.autocomplete === "new-password"`. The Chromium save-prompt behaviour is inferred, not observed. | n/a |
| L3 | `writeDataFile` removes the unresolved `${file}.tmp`, then opens it `O_CREAT \| O_EXCL \| O_NOFOLLOW`. `fchmodSync` is gone: the temp file is always new, so `openSync`'s `0o600` applies. This also covers `writeState` and `state.json.tmp`, which go through the same function. | `src/events/append.test.ts` "a .tmp symlink to a file in data is replaced, not written through": the review's `data/config.json.tmp -> events.jsonl`, plus `state.json.tmp`; a plain leftover `0644` `.tmp` still ends `0600` | yes: `ENOENT` on `events.jsonl`, the log was renamed onto `config.json` |
| L4 | The `res.json()` catch maps `TimeoutError` to `timeout`. PR body and report reworded to "every 200 whose body is a JSON object". | `src/providers/openai-compatible.test.ts` real-socket test: a `/stall` route sends headers and `{"choices":`, then stalls | yes: `bad-response` |
| L5 | A non-empty key must match `/^[\x21-\x7e]+$/`, else "The key has a character that cannot be sent. Copy it again from the provider's page." | `src/config.test.ts`: U+200B inside, a space inside, `é` | yes: 3 of 3 saved |
| L6 | Tests only. | `src/config.test.ts`: `localhost.evil.example`, `127.0.0.1.nip.io`, `0.0.0.0` refused over http; the saved key dropped on a port change and on `api.openai.com.evil.example`, kept on `API.OPENAI.COM`; `https://api.openai.com@evil.example/v1` now refused outright (L1), with the saved key and address unchanged | loopback and host cases passed on unfixed code, as expected for pins; the userinfo case went red because of L1 |
| L7 | PR body footer about CI's `ready` job removed. | n/a | n/a |
| L8 | Report re-stamped: 180 pass is labelled pre-rebase, 209 at `658ff96`, 225 after these fixes. | n/a | n/a |

### M2 browser probe (observed, 2026-09-28)

A data folder whose `config.json` is a symlink to `/etc/hosts` makes `/api/config` return 500. The server was started with `src/server.ts`'s `startServer` on port 0 from a scratch script, and agent-browser loaded `/`, then `/setup.html`:

```
OLD 500: /api/config 500 -> / ends at …/setup.html ; setup: "This month: undefined of undefined tokens | …"
NEW 500: /api/config 500 -> / ends at …/ ;           setup: " | … | err=The settings did not load. …"
NEW empty: /api/config 200 -> / ends at …/setup.html ; setup: "This month: 0 tokens | cap=1000000 | …"
```

"OLD" served `app/index.html` and `app/setup.js` from `git show HEAD:` (`658ff96`). The empty-folder row is the control: first run still redirects, and the cap box shows `defaultCap`.

## New failure modes of the mechanisms (the review had no High; noted for L3)

- L3: two separate tutor processes on the same `data/` can now race between `rmSync` and `openSync` (in one process, `--mcp` included, the writes are synchronous and cannot interleave). One `openSync` gets `EEXIST` and throws, or one rename moves the other's temp file. Before the fix, both opened the same temp file with `O_TRUNC` and could interleave writes, which is no safer. `writeState` has two callers (`grep -rn "writeState\|currentState(" src`): `currentState`, reached only from `GET /api/state`, whose `catch` returns a 500; and `src/events/check.ts` `write`, run at startup. Neither follows an `appendEvent`, so a throw cannot make a caller report a written event as failed and cause a retry to duplicate it. `state.json` is derived and rebuilt on the next replay. Not tested.
- L4: none new. The body read uses the same `AbortSignal` as the fetch, so the mapping cannot misfire on a non-timeout error.

## Answer guard

The provider change (L4) only renames a failure reason. `chatJson` still takes `Message[]` and imports nothing from `content/`, and the source-scan guard test still passes. No prompt changed.

## Claims chased

Greps run in the T8 worktree after the fixes, against the plan, the report, `.claude/references`, `docs/prd` and the PR body (saved to the scratchpad before the edit):

- `grep -n "this way\|6 of 8"`: PR body line 50 (fixed, M3); report line 81 and architecture doc line 308 already scoped to "4 whose text was captured" (no change).
- `grep -n "every 200\|Every successful\|(200)"`: PR body line 16 (fixed); report line 7 (fixed); plan line 414 already "whose body is a JSON object" (no change); plan AC 7 line 680 (amended).
- `grep -n "ready\` job\|audit-diff\|codeql"`: PR body line 78 (removed, L7).
- `grep -n "1000000\|1,000,000\|1_000_000\|DEFAULT_CAP"`: `app/setup.js` (fixed); plan line 333 (amended), 764 (amended); report deviation 8 (amended); plan 307 and 726 are the constant and its derivation (unchanged, still true).
- `grep -n "fchmod\|O_TRUNC\|ELOOP"`: `events.md` line 17 (fixed); report line 7 and mutation table (amended); plan GOTCHA 266 (amended). Plan lines 19, 249, 265, 273 and 692 describe the plan's original snippet and the mutation check as run at `af53004`; left as history under the 266 amendment. PR body line 40 labelled pre-rebase; a note added.
- `grep -n "autocomplete=\"off\""`: plan line 509 (amended); `app/setup.html` (fixed). The other two inputs keep `off`, which is correct for text fields.
- `grep -n "180 pass\|3083"`: report line 54 (re-stamped).
- `grep -n "configured"`: plan line 529 is the plan's snippet, GOTCHA 534 amended; report Level 4 step 6 describes a corrupt file, which still redirects (correct).

## Validation

`bun run check` in the T8 worktree after the fixes (2026-09-28): exit 0. `tsc --noEmit` clean; `biome check .` 80 files, 4 warnings, all in `app/style.css` as on `main`; `bun test` 225 pass, 0 fail, 3,292 `expect()` calls, 20 files (observed). Derived: 209 + 15 new tests in `src/config.test.ts` + 1 in `src/events/append.test.ts` = 225.

## Deferred

None.

## Needs a manual look

- L2: whether Chrome or Edge still offers to save the key with `new-password`. Inferred, not observed.
