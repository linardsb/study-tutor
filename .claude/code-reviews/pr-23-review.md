# PR #23 review: T2 events (types, append with data/ confinement, replay, replay-check)

**Head** 71db912 · **Base** main @ `379b35c851d777a0e441d33cb6bb630c18a93cf8` · Round 1 (no prior report, so the guarantees pass and the fix-mechanism pass were skipped)

**Recommendation: request changes.** 0 Critical, 2 High, 3 Medium, 4 Low. `bun run check` is green, but SonarCloud is red. One event that the API accepts today stops `replay-check` on every run from then on.

## Validation

| Check | Result |
|---|---|
| `bun run check` (tsc, biome, bun test) at 71db912 | pass: 73 tests, 0 fail, 193 expects, 7 files (`observed`, this review) |
| SonarCloud Code Analysis | **fail**: quality gate "C Security Rating on New Code" (`observed`, check run) |
| S5 re-run: `synth-events --n 200 --seed 1` then `replay-check` | exit 0; rungs A5 4, G20 4, R9 3, N12 1, S4 1; XP 1,140; 0 skipped. Matches the architecture doc (`observed`) |
| PR body size figures | 764 / 582 / 66 / 1,196 / 2,608, 11 fixture files. All re-derived from `git diff --numstat origin/main..HEAD` (`observed`) |
| CI workflows | none in repo; the draft must be marked ready by hand, as the body says |

## Issues

### High

**H1. SonarCloud gate red: path traversal at `src/events/append.ts:25` and `:72`.**
- **What Sonar reports:** the check-run annotations list two failures, both titled "Path Traversal via faulty LLM-supplied CLI arguments". The source is the `--data` argument in `scripts/replay-check.ts` and `scripts/synth-events.ts`. It flows unchecked into `fs.mkdirSync(dataDir)` (`resolveInData`, line 25) and `fs.openSync` (line 72).
- **What `resolveInData` does and does not cover:** it confines `rel` (the file name) inside `dataDir` (the data folder). `dataDir` itself is trusted as given.
- **Exploitability is low.** The operator runs the CLI, and T11 will pass a fixed path. The gate is still red, though.
- **Side effect:** `resolveInData` also creates `dataDir`. Running `bun scripts/replay-check.ts --help` in the repo created `data/state.json` (`observed`, this review, then removed).
- **Fix, either of:**
  - (a) resolve `--data` against the app folder and refuse anything outside it, in the two scripts;
  - (b) mark both alerts "safe" in SonarCloud with the reason (operator-supplied root; `rel` is confined) and say so in the PR.
- Moving `mkdirSync` out of the resolver into the writers would also stop read paths from creating folders.

**H2. A topic id of `constructor` or `__proto__` permanently stops `replay-check`, and `__proto__` pollutes `Object.prototype`.** `src/events/replay.ts:43-49`, `:89`, `:140-145`; `src/events/types.ts:120-148`.
- **Cause:**
  - `topic()` treats any non-`undefined` lookup as an existing entry.
  - `s.topics["constructor"]` is the `Object` function, and `s.topics["__proto__"]` is `Object.prototype`.
  - `parseEvent` accepts these ids, so `appendEvent`, T4's POST and T10's `write_event` will all write them.
- **Observed, this review:**
  1. `appendEvent(d, {v:1, type:"retest", topic:"constructor", score:1, of:1, passed:true})` succeeds.
  2. `bun scripts/replay-check.ts --data d` exits 1 with "Could not check progress: Invalid Date". The cause is `afterRetest(undefined)` giving `NEXT_DAYS[undefined]`, so `addDays` throws.
  3. A second run gives the same result. The line sits in an append-only log that CLAUDE.md forbids editing, so once T11 wires the check into start-up, the tutor never starts again.
- **Observed, `__proto__`:** an `intake` row `{topic: "__proto__", rag: "R"}` replays without error and leaves `({}).rag === "R"` for the whole process.
- **Other losses:** `confidentWrong["__proto__"] = …` replaces that map's prototype and the entry is lost. A `constructor` topic never appears in `state.topics`.
- **Fix:**
  - Build `topics`, `confidentWrong`, `flame`, `calibration`, `tokens` and `xp.byWeek` with `Object.create(null)`, or check `Object.hasOwn` in `topic()`.
  - Refuse such ids in `parseEvent`. A spec id pattern such as `^[A-Z0-9]+/[A-Z0-9.]+$` is the stricter option, but check it against T3's ids first.
  - Tests:
    - a replay test with a `__proto__` topic that asserts `({} as any).rag === undefined`;
    - a `check.test.ts` case with a `constructor` retest that expects `ok: true`.

### Medium

**M1. An impossible or rolled-over `t` either crashes replay or is accepted silently.** `src/events/types.ts:94,164`; `src/mcp/clock.ts:27,36`.
- **Cause:** `parseEvent` checks `t` against a regex only.
- **Observed:**
  - `2026-13-01T10:00:00Z` parses, then `localDay` throws a `RangeError`, so all of replay throws.
  - `2026-02-30T10:00:00Z` parses and replays into 2026-W10, because it rolls over to 2 March.
- **Reach:** `appendEvent` stamps `t` from the clock, so only a hand edit gets such a line into the log. That is why this is Medium. It still breaks the events.md rule that unreadable lines are "skipped and counted, never fatal".
- **Fix:**
  - In `parseEvent`, require `new Date(t).toISOString().slice(0, 19) === t.slice(0, 19)`.
  - Optionally, wrap each case call in `replay` so that a throwing line counts as skipped.
  - Add the two times above to the refusal table.

**M2. A hand edit that keeps the line count is blamed on the new build.** `src/events/check.ts:62`, `:76-86`.
- **Cause:** the comment at `:76` says "only a code change can make a rung fall here", and the S5 block repeats it. It holds only when the stored prefix is unchanged.
- **Observed, this review:** in the S5 folder, change line 196 (R9's last retest) from `"passed":true` to `false`, keep 200 lines, and run `replay-check`. It exits 1 with "1MA1/R9: saved 3, now 1 … Put the previous version back". No version changed, so that advice does nothing.
- **Other routes to the same refusal:**
  - a UTF-8 BOM on line 1 (L3);
  - deleting one line and appending one;
  - a stored `"lines": -1`, which `project` accepts because it checks only for a finite number, so `slice(0, -1)` drops the last line.
- **Fix:**
  - Store a hash of the first `lines` lines in `State` as an additive field. On a mismatch, take the truncated path.
  - Require `Number.isInteger(lines) && lines >= 0` in `project`.
  - Soften the `:76` comment and the S5 sentence to match.

**M3. The PR body overclaims the mutation results.**
- **The claim:** the body says "every targeted mutation turns red only its own test, and all other tests stay green".
- **What the report's own table shows:**
  - T9(f) (drop `O_NOFOLLOW`) turns no test red.
  - `NEXT_DAYS[3]` 30 → 31 turns two tests red.
- **Why Medium:** a later ticket reading the body would take the symlink-race defence as test-covered, and it is not.
- **Fix:** reword the sentence to "each mutation turns its target test red, except T9(f), which no test can see (see the report)".

### Low

**L1. The event key is built with `String()`, so the `as Event` cast can be false.** `src/events/types.ts:165-167`.
- `{"v":"1", …}` and `"type":["attempt"]` both build a valid key and parse, so the returned event has `v: "1"`, a string (`observed`: parse succeeds).
- Fix: require `typeof obj.type === "string" && obj.v` to be an integer before building the key.

**L2. `appendEvent` writes unknown caller fields into the log.** `src/events/append.ts:62-67`.
- `observed`: an `attempt` sent with `correct_answer: "12"` is written to `events.jsonl` exactly as sent.
- Guard point 2 ("no event type carries a correct answer") holds for the typed shape but not for the bytes in the log.
- Nothing reads raw lines into a prompt today, and `state.json` drops extra keys, so this is not a breach now.
- Fix: write only the known fields for that `(type, v)`, from a list of allowed keys kept next to `FIELDS`.

**L3. A UTF-8 BOM skips line 1.** `src/events/append.ts:97-105`.
- `observed`: a BOM prepended to a one-line log gives `skipped: 1`.
- Windows editors can add one, and it then triggers M2.
- Fix: strip one leading `﻿` in `readLines`.

**L4. The refusal test does not check the backup file.** `src/events/check.test.ts:50-66`.
- The test compares the bytes of `state.json` but never asserts that `state.prev.json` was not created. The code is correct today, since it returns before `write()`, but no test would catch a regression.
- Fix: add `expect(fs.existsSync(path.join(data, "state.prev.json"))).toBe(false)`.

## Numbers and constraints passes

- **Size figures and S5 figures:** re-derived, and they match (see the validation table).
- **"GATE SHORT … a gap in the script":** confirmed. `.claude/skills/piv-create-pr/scripts/record-gate.sh:152` parses turbo's "N successful, N total" line, and a Bun gate prints none.
- **Plan constraints:** `grep -in "do not modify|…|frozen"` on the plan finds nothing, so none of the fixes above breaks the PR's acceptance criteria.
- **Documented deviations:** plan deviations 1–6 and ticket deviations Q2 and Q4 were not flagged.

## What is done well

- **Compile-checked tables.** The parser table `FIELDS` and the reducer table `CASES` are both keyed by `type@v`. A half-wired event version fails `tsc`, and the mutation records show both halves.
- **`replayCheck` compares the stored-lines prefix.** This cleanly separates "same events, new code" from a real failed re-test appended later, and S5 and the tests both show it.
- **Confinement covers both symlink cases.** The `lstat` check for dangling symlinks plus `O_NOFOLLOW` handles the check-time case and the swap race. Traversal, absolute paths, names starting with `..` and `data/` itself being a symlink are all refused.
- **One write per line.** The trailing-newline repair and the line go out in a single `writeSync` on an `O_APPEND` handle. The two-process test keeps that guarantee in place.
- **Time and ladder logic checked correct:** ISO weeks (W53 in 2020 and 2026, year boundaries), `addDays` across DST, `localDay` on both clock-change nights, the ladder tables, and the six-week rung and XP values.
