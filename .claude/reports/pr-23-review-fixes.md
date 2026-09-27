# PR #23 review fixes, round 1

Review: https://github.com/linardsb/study-tutor/pull/23#issuecomment-5855313985 (head `71db912`).
Triage (Linards, 2026-09-27): fix all nine in this PR; H1 by confining `--data` to the current folder and moving `mkdirSync` out of the resolver. Nothing deferred.

Every new test below was run against the unfixed tree first: 17 red, 74 green (`observed`, `bun test` at `71db912` plus the new tests only). The one exception is L4, whose assertion holds on the old code too; see L4.

## Fixed

**H1. `--data` path reaches mkdir/open unchecked (SonarCloud red).**
- `scripts/data-arg.ts` (new): `dataArg()` resolves `--data` against `process.cwd()` and exits 1 with `Refused: --data … is outside the current folder` unless the result starts with `cwd + path.sep`. Both scripts use it.
- `resolveInData` no longer creates `dataDir`. `appendEvent`, `writeState` and `copyState` create it; `readLines` returns `[]` and `readStoredState` returns `null` on ENOENT only, so a "Refused" error still reaches the caller.
- `replayCheck` with no log and no readable `state.json` returns without writing, which is what stopped `--help` creating `data/state.json`.
- Tests: `scripts/data-arg.test.ts` (both scripts refuse an outside `--data` and create nothing; `--help` in an empty folder creates no `data/`; an inside `--data` works), `append.test.ts` "readers do not create the data folder", `check.test.ts` "no log and no saved progress: nothing is written".
- Two existing resolver tests relied on the mkdir side effect; they now create `data` first.
- Reviewer's probe, `bun scripts/replay-check.ts --help` in the repo, run 2026-09-27 on the fixed tree: exit 0, `ls data` → "No such file or directory" before and after (`observed`).
- New failure mode of the mechanism: a reader on a missing folder now meets ENOENT from `realpathSync`. Covered by the reader test above. A symlink inside the current folder that points out is still followed, as before (`data itself a symlink is followed` test); the script check is on the argument, the realpath check stays in `resolveInData`.
- **Sonar status: not known until CI re-scans the pushed commit.** Whether its taint rule accepts the `startsWith(cwd + sep)` guard as a sanitiser is `expected`, not observed.

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
- Reviewer's probe, run 2026-09-27 in the scratchpad: `synth-events --data s5 --n 200 --seed 1`, `replay-check`, then line 196 `"passed":true` → `false`, 200 lines kept, `replay-check` → exit 0, `1MA1/R9: saved 3, now 1 (the log no longer matches the saved progress)` (`observed`; was exit 1 "Put the previous version back"). BOM on line 1 of a copy of the same folder → exit 0, no change lines (`observed`).
- S5 re-run on the fixed tree: rungs G20 4, A5 4, R9 3, N12 1, S4 1; `xp.total` 1140; `skipped` 0; `lines` 200 (`observed`). Same as the review's run.

**M3. PR body overclaimed the mutation results.** Sentence replaced with "each mutation turns its target test red, except T9(f) (drop `O_NOFOLLOW`), which no test can see; `NEXT_DAYS[3]` 30 → 31 turns two tests red. Full table in the report."

**L1. `v: "1"` and `type: ["attempt"]` parsed.** `parseEvent` requires `typeof type === "string"` and `Number.isInteger(v)` before building the key. Refusal-table rows "a string version" and "an array type", both red before.

**L2. Unknown caller fields written to the log.** `types.ts` adds `KEYS`: the fields each `(type, v)` may carry beyond `v`, `t`, `type`, checked with `satisfies` against the event types plus a `Missing` type that must be `never`. `appendEvent` copies only those keys, `t` from the clock. Compile check probed 2026-09-27: removing `"seed"` from `attempt@1` → `TS2322: Type 'true' is not assignable to type '"seed"'`, then restored (`observed`). Test: "fields the event type does not have are not written" (`correct_answer: "12"`), red before. Open: nested `intake.topics[]` rows can still carry extra keys; nothing reads them.

**L3. BOM skipped line 1.** `readLines` strips one leading `﻿`. Test "a byte-order mark on line 1 is not a skipped line", red before.

**L4. Refusal test did not check the backup.** Added `expect(fs.existsSync(path.join(data, "state.prev.json"))).toBe(false)`. It passes on the old code too, as the review said the code was correct; it guards a regression and was not seen red.

## Deferred

None.

## Needs a manual look

- **SonarCloud** on the pushed commit (H1). If it is still red, the next step is the review's option (b): mark both alerts safe in the SonarCloud UI with the reason. That is a human action.

## Gate

`bun run check` on the fixed tree, 2026-09-27: tsc clean, biome 24 files no fixes, 91 pass, 0 fail, 234 expect() calls, 8 files (`observed`). Derived: 91 − 73 = 18 new tests (4 refusal rows, 3 replay, 4 check, 3 append, 4 script); 234 − 193 = 41 new expects.

## Stale-copy sweep

Grep run 2026-09-27 over the PR body (`gh pr view 23 --json body`), `.claude/plans/t2-events-append-replay.md`, `.claude/reports/t2-events-append-replay-report.md`, `docs/prd/study-tutor-v2.architecture.md`, `.claude/references/events.md`, `src/events/*.ts`, `scripts/*.ts`:

| `grep -n -e` | Hits before | Action |
|---|---|---|
| `73 ` / `193` | PR body :27 :29 :30; report :87 | PR body block replaced; report line added below :87 (original kept as the pre-review record) |
| `every targeted mutation` / `stay green` | PR body :35 | replaced (M3) |
| `only a code change` / `code change` | plan :64; arch :245; check.ts comment | plan :64 annotated; arch :245 is S5's recorded decision and still true, left; comment rewritten |
| `$T/data` | plan :752 :763 :876 (script calls); :764 :773 :877 :879 :883 (paths only) | the three script calls now run from inside `$T` with `--data data`; path-only lines unaffected |
| `mkdir` | plan :438 (resolver step) | annotated |
| `Object.assign` | PR body deviation 1; report deviation 1 | both marked superseded by L2 |
| `State keys` | events.md :21 | `hash` added |
