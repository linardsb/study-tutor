# PR #21 review fixes, round 1

**Review** `.claude/code-reviews/pr-21-review.md` (3 Medium, 6 Low) · **Fix commit** `176f255` on `feature/s1-spike-and-repo-skeleton` · **Date** 2026-09-27

Triage: all nine findings fixed in this PR. Each is confined to a file this PR introduced and is a few lines; deferring any of them would cost more than fixing. Nothing deferred, nothing dropped, no epic ticket touched.

## Fixed

Every probe below ran on this Mac (macOS 15.7.3 Intel, Bun 1.3.4), `observed` unless tagged otherwise. "Old" is the tree at `db8388b`, "new" is `176f255`.

**M1 · `src/server.test.ts` · random anchor port can already be taken.** Old test picked `base = 20000 + random(30000)`. Probe with the finding's own condition (a socket already holding `base`): a scratch script bound port 0, took that port as `base`, then ran the old shape `startServer([base])` → `No free port in 49312`. New test lets the OS pick the anchor (`startServer([0])`, `base = first.port`) and asserts `second.port` is neither `base` nor `0`; the exact `base + 1` assertion is gone. The random flake itself cannot be reproduced on demand; the held-port probe is the mechanism it fails by.

**M2 · `src/server.ts` · ladder stopped on any code but `EADDRINUSE`.** New code steps on `EACCES` too and rethrows only when `port === 0`. That rethrow also closes the "message lists 0 as a port" note: the `No free port` line is now reachable only for a list without 0. **Not reproduced**: Bun on this Mac reports port 1 as `EADDRINUSE`, not `EACCES` (probe: `Bun.serve({port: 1})` → `code: EADDRINUSE | Failed to start server. Is port 1 in use?`), and the review tagged the Windows behaviour `expected`. No test added; the branch is two lines of string comparison and a mock of `Bun.serve` is not worth its weight. It lands on the fresh Windows leg of S1 (owner Linards).

**M3 · `.claude/hooks/stop_check.py` · docstring promised exit 0 when bun is missing, code exited 2.** Old probe: dirty `src/`, `PATH=/usr/bin:/bin`, `echo '{}' | python3 .claude/hooks/stop_check.py` → `BLOCKED ... /bin/sh: bun: command not found`, exit 2. New code checks `shutil.which("bun")` before the run. Same probe on the new file → exit 0. Regression probe with bun on PATH and a dirty tree → the gate ran (it reported the then-red tsc error and exited 2), so the escape hatch does not skip the check when bun is present. Written by heredoc: guard 6 fences Edit and Write on `.claude/hooks/`, plan Q1.

**L1 · `scripts/build.ts` · `bun` spawned by name.** Old probe: `PATH=/usr/bin:/bin bun -e 'Bun.spawnSync(["bun","--version"])'` → `Executable not found in $PATH: "bun"`. New code spawns `process.execPath` (`/Users/Berzins/.bun/bin/bun` here). Closing run: `PATH=/usr/bin:/bin /Users/Berzins/.bun/bin/bun scripts/build.ts` → three compiles, two re-signs, both zips written. That run is also the source of the new sizes below.

**L2 · `src/server.ts`, `launchers/README.txt` · "black window".** Page now reads "It works. When you are done, close this tab, then close the window that started the tutor." README step 3 is "A window opens with a line of text, then your browser opens on the tutor's page." and step 4 "close the window from step 3 to stop". Smoke from the extracted mac zip: `Start.command` printed the URL, `curl /` → 200 with the new `<p>` text. The plan's three quotes of the old wording (lines 294, 353, 589) now match.

**L3 · `launchers/Start.command` · unchecked `cd`.** Probe: `bash -c "$(cat launchers/Start.command)" /nonexistent-dir/Start.command`. Old → `cd: No such file`, then two `exec` errors for a binary in the wrong directory, exit 126. New → the `cd` error only, exit 1.

**L4 · `tsconfig.json` · no `include`.** Old: `tsc --listFilesOnly` listed `e1/test-case.js`, `e1/assets/case.js`, `e1/assets/quiz.js` beside the three project files. New (`"include": ["src", "scripts"]`) lists `src/server.ts`, `src/server.test.ts`, `scripts/build.ts` only.

**L5 · `src/server.ts` · a missing opener killed a bound server.** `Bun.spawn` did not throw with an empty PATH on this Mac (it found `open` anyway), so the test sets `process.platform` to `linux` and asserts `Bun.which("xdg-open")` is null, then `openBrowser(url)` does not throw. Run against the old `server.ts` (`git stash push -- src/server.ts && bun test`): `(fail) openBrowser does not throw when the opener is missing from PATH`, 1 pass 1 fail. Against the new: 2 pass. `openBrowser` now wraps the spawn in a try; the URL is already printed.

**L6 · `docs/prd/study-tutor-v2.architecture.md` · untagged claim.** The "damaged" sentence now carries "(`expected`: documented macOS behaviour, not run in this ticket)". The comment in `scripts/build.ts` is unchanged, as the review allowed.

## Figures that changed, and where each copy was updated

The code edits changed the compiled binaries' inputs and both launcher text files, so the zip sizes moved. Binary sizes did not (`observed`, `unzip -l` at `176f255`).

| Value | At `db8388b` | At `176f255` |
|---|---|---|
| `dist/StudyTutor-windows.zip` | 41,128,211 | 41,127,839 |
| `dist/StudyTutor-mac.zip` | 46,808,601 | 46,808,746 |
| `Start.command` | 185 | 195 |
| `README.txt` | 554 | 574 |
| `bun test` | 1 pass, 9 expect() | 2 pass, 12 expect() |
| Biome | Checked 7 files | Checked 7 files |
| `StudyTutor-x64` / `-arm64` / `.exe` | 65,995,184 / 59,867,200 / 115,691,608 | unchanged |

Sweep, run on the tree at `176f255` (`grep -rn <value> --include='*.md' --include='*.ts' --include='*.txt' --include='*.command' --include='*.json' .`, excluding `node_modules`, `e1/`, `dist/` and the review file itself):

- `41,128,211`, `46,808,601` → only the report's "was X at `db8388b`" notes on lines 40–41.
- `20000`, `black window`, `9 expect`, `\b185\b`, `\b554\b` → no hits.
- `1 pass` → plan lines 318 and 611 (the pre-implementation sketch run, a historical observation, kept) and the E1 plan's rung ladder (unrelated).
- `Checked 7` → report line 36, still true.
- `EADDRINUSE` → plan line 193 pattern snippet updated to the shipped code.

Updated: `.claude/plans/s1-spike-and-repo-skeleton.md` (Task 2 snippet, Task 3 IMPLEMENT and VALIDATE, three "black window" quotes, an AMENDMENTS line), `.claude/reports/s1-spike-and-repo-skeleton-report.md` (tests paragraph, gate line, zip sizes), `docs/prd/study-tutor-v2.architecture.md` (S1 result sizes, L6 tag), and the PR body's Validation section (see below).

## Deferred

None.

## Needs a human look

- **M2 on Windows.** The `EACCES` step is `expected`; the fresh Windows PC leg of S1 (plan Level 4 step 4, owner Linards) is where it is observed or not.
- **L5's test assumes no `xdg-open` on the dev Mac.** It asserts that first, so on a machine that has one the test fails loudly rather than opening a browser tab to port 1.

## Validation at `176f255`

- `bun run check` → exit 0: tsc clean, Biome "Checked 7 files, no fixes", `bun test` 2 pass, 0 fail, 12 expect() calls (`observed`, log in the session scratchpad).
- `bun scripts/build.ts` with `PATH=/usr/bin:/bin` → exit 0, sizes in the table above (`observed`).
- Extracted mac zip: `Start.command` → URL printed, `curl /` 200 with the new page text; `codesign -vv StudyTutor-x64` → "satisfies its Designated Requirement" (`observed`).
- `git diff --stat e1/` at `176f255` → empty (`observed`).

## Pushed

Fix commit `176f255`, plus the docs commit that adds this report, pushed to `origin/feature/s1-spike-and-repo-skeleton`; PR #21 body updated. Next: `piv-review-pr 21` round 2, then a human marks the PR ready.
