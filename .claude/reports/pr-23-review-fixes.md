# PR #23 review fixes, round 1

Review: https://github.com/linardsb/study-tutor/pull/23#issuecomment-5855313985 (head `71db912`).
Triage (Linards, 2026-09-27): fix all nine in this PR; H1 by confining `--data` to the current folder and moving `mkdirSync` out of the resolver. After Sonar stayed red on `44c2f5e`, Linards chose to drop `--data` entirely (see H1). Nothing deferred.

Every new test below was run against the unfixed tree first: 17 of the 18 new tests red, 74 green in total (`observed`, `bun test` on `71db912`'s source plus the new tests). The one new test not red was "a --data inside the current folder is used", a positive guard that passed on both trees by design; in the second commit it became "the scripts use data/ in the folder they run from". The L4 assertion, added to an existing test, also holds on the old code; see L4.

## Fixed

**H1. `--data` path reaches mkdir/open unchecked (SonarCloud red).**
- First attempt, `44c2f5e`: `scripts/data-arg.ts` refused a `--data` that did not resolve inside `process.cwd()` (`startsWith(cwd + path.sep)`). **SonarCloud stayed red** on that commit, flagging the same rule ("Path Traversal via faulty LLM-supplied CLI arguments") at `src/events/append.ts:62` and `:81` (`observed`, check run 108609321152 annotations, 2026-09-27). Its taint rule did not accept the guard as a sanitiser.
- Final fix, second commit: `--data` removed. Both scripts use `data/` in the folder they run from, and exit 1 with `--data was removed: run this from the folder that holds data/.` if the flag is given, so an old command is never silently pointed at another folder. `scripts/data-arg.ts` deleted; its test file became `scripts/scripts.test.ts`. No command-line text reaches a file path now.
- `resolveInData` no longer creates `dataDir`. `appendEvent`, `writeState` and `copyState` create it; `readLines` returns `[]` and `readStoredState` returns `null` on ENOENT only, so a "Refused" error still reaches the caller.
- `replayCheck` with no log and no readable `state.json` returns without writing, which is what stopped `--help` creating `data/state.json`.
- Tests: `scripts/scripts.test.ts` (both scripts refuse `--data` and create nothing; `--help` in an empty folder creates no `data/`; the scripts use `data/` in their folder), `append.test.ts` "readers do not create the data folder", `check.test.ts` "no log and no saved progress: nothing is written".
- Two existing resolver tests relied on the mkdir side effect; they now create `data` first.
- Reviewer's probe, `bun scripts/replay-check.ts --help` in the repo, run 2026-09-27 on the final tree: exit 0, `ls data` → "No such file or directory" (`observed`).
- New failure mode of the mechanism: a reader on a missing folder now meets ENOENT from `realpathSync`; covered by the reader test above. A caller who still passes `--data` gets exit 1 instead of the old behaviour; covered by the refusal test.
- **Sonar on the second commit `9bfc7a0`: still red**, same rule at `append.ts:62` and `:81` (`observed`, check run 108609910792, 2026-09-27). So the scripts' `--data` was not, or not only, the source. The one remaining place where command-line text reaches `appendEvent` is the test helper `src/events/__fixtures__/append-many.ts:4` (`process.argv[2]`), which has been there since `71db912`. That it is Sonar's source is `expected`: the issue flows need a SonarCloud login to read, and the public API returned 0 issues. Push cycles used: 2 of 3. Linards chose to mark both alerts safe in the SonarCloud UI (review option (b)) rather than spend the third cycle; the PR body carries a "Sonar disputed" line under Notes for the reviewer.
- Sonar also reported on `44c2f5e` a new cognitive-complexity failure at `src/events/check.ts:57` (19, allowed 15), which the M2 change caused. Fixed in the second commit by moving the fall-report loop into `falls()`; not a quality-gate condition, but it was mine.

**H2. `constructor` / `__proto__` topic ids.**
- `replay.ts`: every map in `State` (`topics`, `xp.byWeek`, `flame`, `confidentWrong`, `calibration`, `tokens`) is built with `dict()` = `Object.create(null)`. `check.ts`'s `project` builds `rungs` the same way.
- Not done: refusing these ids in `parseEvent`. With no prototype they are ordinary keys, and T3's spec-id pattern does not exist yet to check a regex against.
- Tests: `replay.test.ts` "a topic named constructor is its own topic", "a topic or item named __proto__ pollutes nothing and is kept" (asserts `({}).rag` is undefined; deletes `Object.prototype.rag` in `finally` so a red run cannot spread); `check.test.ts` "a topic named constructor does not stop the check" (the reviewer's `appendEvent` call verbatim, then `replayCheck` twice).
- Reviewer's probe through the CLI, run 2026-09-27: `appendEvent('d', {v:1, type:"retest", topic:"constructor", score:1, of:1, passed:true})`, then `replay-check --data d` twice → exit 0, exit 0 (`observed`; was exit 1 "Invalid Date").
- New failure mode: code that calls an `Object.prototype` method on a `State` map (`s.topics.hasOwnProperty`) now throws. Nothing does today (`grep -rn "hasOwnProperty\|\.toString()" src/events` → no hits). `JSON.stringify` and `toEqual` are unaffected (six-week test green; the `__proto__` test checks the JSON output).

**M1. Impossible or rolled-over `t`.** `parseEvent` now refuses a `t` where `new Date(t)` is NaN or its ISO form differs from `t` in the first 19 characters. The NaN check comes first because `toISOString()` throws on an invalid date. Refusal-table rows added with the reviewer's strings verbatim: `2026-13-01T10:00:00Z`, `2026-02-30T10:00:00Z`. Both were red on the old code. The optional per-case try/catch in `replay` was not added; nothing known still throws inside a case.

**M2. A hand edit that keeps the line count was blamed on the new build.**
- `State` gains `hash`: sha256 of the lines replayed, each followed by `\n`. `replayCheck` compares `replay(prefix).hash` with the stored `hash`; a mismatch takes the rebuild path with "(the log no longer matches the saved progress)". A stored state without `hash` keeps the old behaviour (the "old state shape" test still passes).
- `project` requires `Number.isInteger(lines) && lines >= 0`.
- The comment above the prefix replay now says what it can and cannot rule out. `events.md` and plan line 64 updated to match. The architecture doc's S5 block is a record of what ran and is left as written.
- Tests: `check.test.ts` "a hand edit that keeps the line count rebuilds instead of blaming the build" (flips R9's last retest in the six-week fixture), "a stored line count that is not a whole number is not trusted" (`lines: -1`), `replay.test.ts` "the hash covers exactly the lines replayed".
- Reviewer's probe, run 2026-09-27 in the scratchpad: `synth-events --data s5 --n 200 --seed 1` (on `44c2f5e`), `replay-check`, then line 196 `"passed":true` → `false`, 200 lines kept, `replay-check` → exit 0, `1MA1/R9: saved 3, now 1 (the log no longer matches the saved progress)` (`observed`; was exit 1 "Put the previous version back"). BOM on line 1 of a copy of the same folder → exit 0, no change lines (`observed`).
- S5 re-run on the final tree, from inside a scratch folder with no `--data`: rungs G20 4, A5 4, R9 3, N12 1, S4 1; `xp.total` 1140; `skipped` 0; `lines` 200 (`observed`). Same as the review's run.

**M3. PR body overclaimed the mutation results.** Sentence replaced with "each mutation turns its target test red, except T9(f) (drop `O_NOFOLLOW`), which no test can see; `NEXT_DAYS[3]` 30 → 31 turns two tests red. Full table in the report."

**L1. `v: "1"` and `type: ["attempt"]` parsed.** `parseEvent` requires `typeof type === "string"` and `Number.isInteger(v)` before building the key. Refusal-table rows "a string version" and "an array type", both red before.

**L2. Unknown caller fields written to the log.** `types.ts` adds `KEYS`: the fields each `(type, v)` may carry beyond `v`, `t`, `type`, checked with `satisfies` against the event types plus a `Missing` type that must be `never`. `appendEvent` copies only those keys, `t` from the clock. Compile check probed 2026-09-27: removing `"seed"` from `attempt@1` → `TS2322: Type 'true' is not assignable to type '"seed"'`, then restored (`observed`). Test: "fields the event type does not have are not written" (`correct_answer: "12"`), red before. Open: nested `intake.topics[]` rows can still carry extra keys; nothing reads them.

**L3. BOM skipped line 1.** `readLines` strips one leading `\uFEFF`. Test "a byte-order mark on line 1 is not a skipped line", red before.

**L4. Refusal test did not check the backup.** Added `expect(fs.existsSync(path.join(data, "state.prev.json"))).toBe(false)`. It passes on the old code too, as the review said the code was correct; it guards a regression and was not seen red.

## Deferred

None.

## Needs a manual look

- **SonarCloud** on the second commit (H1). If it is still red, the next step is the review's option (b): mark both alerts safe in the SonarCloud UI with the reason. That is a human action.
- Sonar's six test-style warnings (`toHaveLength`, a numeric separator in `synth-events.ts:30`) are not gate conditions and are left.

## Prose gate

`events.md` edits: a `no-ai-slop` pass by reading the changed lines against the blacklist; no banned words, no em dashes, figures none. Not a skill run.

## Gate

`bun run check` on the first commit `44c2f5e`: 91 pass, 234 expect() calls. On the final tree, 2026-09-27: tsc clean, biome no fixes, 91 pass, 0 fail, 236 expect() calls, 8 files (`observed`). Derived: 91 − 73 = 18 new tests (4 refusal rows, 3 replay, 4 check, 3 append, 4 script); 236 − 193 = 43 new expects.

## Stale-copy sweep

Grep run 2026-09-27 over the PR body (`gh pr view 23 --json body`), `.claude/plans/t2-events-append-replay.md`, `.claude/reports/t2-events-append-replay-report.md`, `docs/prd/study-tutor-v2.architecture.md`, `.claude/references/events.md`, `src/events/*.ts`, `scripts/*.ts`:

| `grep -n -e` | Hits before | Action |
|---|---|---|
| `73 ` / `193` | PR body :27 :29 :30; report :87 | PR body block replaced; report line added below :87 (original kept as the pre-review record) |
| `every targeted mutation` / `stay green` | PR body :35 | replaced (M3) |
| `only a code change` / `code change` | plan :64; arch :245; check.ts comment | plan :64 annotated; arch :245 is S5's recorded decision and still true, left; comment rewritten |
| `$T/data` | plan :752 :763 :876 (script calls); :764 :773 :877 :879 :883 (paths only) | the three script calls now run from inside `$T` with no `--data`; path-only lines unaffected |
| `--data` / `data-arg` / `dataArg` (second commit) | events.md :16; plan :716 :741 :747 :752 :763 :876; T2 report :89 | events.md reworded; plan commands drop `--data`, :716 :747 annotated; report :89 is what ran at the time, left |
| `mkdir` | plan :438 (resolver step) | annotated |
| `Object.assign` | PR body deviation 1; report deviation 1 | both marked superseded by L2 |
| `State keys` | events.md :21 | `hash` added |
