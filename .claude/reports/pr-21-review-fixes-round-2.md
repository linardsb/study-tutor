# PR #21 review fixes, round 2

**Review** `.claude/code-reviews/pr-21-review-round-2.md` (2 Medium, 2 Low) · **Fix commit** `abd939f` on `feature/s1-spike-and-repo-skeleton` · **Date** 2026-09-27

Triage: R2-1, R2-2 and R2-4 fixed in this PR. R2-3 deferred to T4 (#6), the next open epic ticket that touches `src/server.ts`. R2-2 reverses round 1's "exit 0" steer; the review left it to Linards, and this session applied the review's fix under the assumption below (Q1) because it is one line and reverts in one line.

## Fixed

Every probe below ran on this Mac (macOS 15.7.3 Intel, Bun 1.3.4), `observed` unless tagged otherwise. "Old" is the tree at `1338d98`, "new" is `abd939f`.

**R2-1 · `src/server.test.ts` · the ladder walk was untested.** Probe with the review's own mutant (`startServer` = bind `ports[0]`, on failure bind `ports[ports.length - 1]`, else throw `No free port in …`) against the old test: `bun test` 2 pass, 0 fail, 12 expect() calls. False green reproduced. A first attempt at the mutant without the `No free port` message failed the old test at line 23 on the message alone, not on the ladder; the faithful mutant is the one quoted. New test binds and releases a second OS-picked port (`probe = startServer([0])`, `free = probe.port`, `probe.stop(true)`), then asserts `startServer([base, free, 0]).port` is `free`. Against the mutant: `(fail) port ladder … expect(received).toBe(expected) Expected: 52058 Received: 52059`, 1 pass 1 fail. Against the shipped `server.ts`: 2 pass, 0 fail, 12 expect() calls (two assertions removed, two added, so the count is unchanged). `second` and `last` are now created inside the `try` and stopped with `?.` in `finally`. Residual flake (another process taking `free` between release and rebind): 20 consecutive `bun test` runs, 0 failures.

**R2-2 · `.claude/hooks/stop_check.py` · missing `bun` was silent.** Old: `sys.exit(0)`, no output. New: `stop_check: bun not on PATH, \`bun run check\` not run` on stderr, `sys.exit(1)`. Probe, dirty `src/`, `PATH=/usr/bin:/bin`, `echo '{}' | python3 .claude/hooks/stop_check.py` → that line on stderr, exit 1. Regression probe with bun on PATH and the same dirty tree → the gate ran and passed, exit 0, no output. Docstring line 19 now reads "exit 1 with a note on stderr (non-blocking…)". Written by heredoc: guard 6 fences Edit and Write on `.claude/hooks/`, plan Q1. `expected`, not run: Claude Code shows a stop hook's stderr to the user and lets the stop proceed for any exit other than 0 or 2, per the hooks documentation; the `stop_hook_active` hatch stands in front of it either way, so a wrong reading cannot loop.

**R2-4 · `launchers/README.txt` · Mac step 4 stopped one click short.** Step 4 now ends "Mac: click Terminate if it asks." README stays at 10 lines (plan Task 4 allows 12); 607 bytes, was 574. The Terminal dialog itself is `expected` (Terminal's default "Ask before closing" profile) and lands on the pending dev-Mac leg of S1.

## Figures that changed, and where each copy was updated

`bun run build` at `abd939f` (three compiles, two re-signs, exit 0):

| Value | At `176f255` | At `abd939f` |
|---|---|---|
| `dist/StudyTutor-windows.zip` | 41,127,839 | 41,127,857 |
| `dist/StudyTutor-mac.zip` | 46,808,746 | 46,808,764 |
| `README.txt` | 574 | 607 |
| `bun test` | 2 pass, 12 expect() | 2 pass, 12 expect() |
| Biome | Checked 7 files | Checked 7 files |
| `StudyTutor-x64` / `-arm64` / `.exe` / `Start.command` / `Start.bat` | 65,995,184 / 59,867,200 / 115,691,608 / 195 / 185 | unchanged (`unzip -l`) |

Sweep, run on the tree at `abd939f` plus the PR body saved to the scratchpad (`grep -rnE <pattern> --include='*.md' --include='*.ts' --include='*.txt' --include='*.py' --include='*.json' .`, excluding `node_modules`, `e1/`, `dist/` and both review files):

- `41,127,839`, `46,808,746` → round 1 fixes report table (historical, kept), `s1-spike-and-repo-skeleton-report.md:40-41` (updated, old values kept as history), `study-tutor-v2.architecture.md:211` (updated), PR body line 15 (updated below).
- `\b574\b` → round 1 fixes report table (historical, kept), PR body line 15 (updated).
- `41127839`, `46808746` → no hits.
- `falls back to any free port` (old test name) → plan line 20, the ticket's feature description, still a true statement about the server; kept.
- `base \+ 1` → plan line 314 (updated to the new test shape), round 1 fixes report M1 (historical, kept).
- `bun missing`, `which("bun")`, `exit 0` → hook docstring (updated); plan line 98 (updated); round 1 fixes report M3 "→ exit 0" (historical, kept); implementation report hook line (new probe appended); PR body line 19 (updated below).
- `Terminate` → README only.

Updated: `.claude/plans/s1-spike-and-repo-skeleton.md` (Task 3 test shape, Task 6 hatch note, an AMENDMENTS line), `.claude/reports/s1-spike-and-repo-skeleton-report.md` (gate line, zip sizes and contents, hook probe), `docs/prd/study-tutor-v2.architecture.md` (S1 result sizes), and the PR body's Validation and Notes sections.

## Deferred

- **R2-3 (Low) · `src/server.test.ts:42` asserts no `xdg-open` on the machine.** Appended as a checklist line to #6 (T4, server and lesson bridge), the next ticket that touches `openBrowser`. The review confirmed the cheap fix (an empty `PATH`) does not work on this Mac; the real fix is an `env` option on the production spawn, which belongs with the next change to that function.

## Needs a human look

- **Q1, R2-2.** Round 1 asked for exit 0; round 2 argued for exit 1 with a note. Applied exit 1. If exit 0 was the intended contract, revert the two lines in `stop_check.py` by heredoc and the docstring line with them.
- **R2-4's dialog** is `expected`; the dev-Mac leg of S1 (owner Linards, expected 2026-10-04) is where it is observed.
- **M2 and L5 from round 1** stand as before: `EACCES` on Windows is `expected`; the opener test assumes no `xdg-open` on the dev Mac until R2-3 lands.

## Validation

- `bun run check` at `abd939f`, 2026-09-27T09:49:29Z → exit 0: tsc clean, Biome "Checked 7 files in 6ms. No fixes applied", `bun test` 2 pass, 0 fail, 12 expect() calls (`observed`).
- `bun run build` at `abd939f` → exit 0, sizes in the table above (`observed`).
- `python3 -m py_compile .claude/hooks/stop_check.py` → clean; the cache directory it wrote was removed before the commit (`observed`).
- `git diff --stat origin/main..HEAD -- e1/ CLAUDE.md .claude/settings.json` → empty (`observed`).
- Note: `piv-validate` still describes the taxi monorepo gate (unadapted, on the list in `.claude/PORTED-FROM-TAXI.md`); this repo's gate is `bun run check` per CLAUDE.md, which is what ran.

## Pushed

Fix commit `abd939f` and this report's commit pushed to `feature/s1-spike-and-repo-skeleton`; PR #21 body updated (head, sizes, hook probe, round 2 note). See the PR for the pushed head.
