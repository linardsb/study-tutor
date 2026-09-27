# PR #21 review, round 2: S1 spike and repo skeleton

**Head** 1338d98 (fixes in `176f255`, report in `1338d98`) · **Base** main @ `e7ee0244d7f1709821899e73a77f98b74f9b0262` · **Round** 2 · **Reviewed** 2026-09-27
**State** OPEN, ready for review (linardsb flipped it from draft at 09:02Z, before the round 1 fixes were pushed; SonarCloud quality gate passed; no CI workflow in this repo) · **Diff vs main** 19 files, +1318 / -14 (observed, `git diff --stat origin/main..HEAD`)

## Summary

All nine round 1 findings are fixed and each fix does what its closing probe says. The gate is green at this head and every figure in the PR body, the fixes report, the implementation report and the S1 result re-derives (numbers pass below). What round 2 adds is about the fixes' own mechanisms: the ladder test no longer holds the one property it is named for, and the hook's new escape hatch turned a loud wrong answer into a silent one. Neither blocks merge on its own; R2-1 is the one to fix before the next ticket builds on that test.

**Recommendation: request changes** (small). 0 Critical · 0 High · 2 Medium · 2 Low.

Fresh eyes: the deep pass ran in the `code-reviewer` agent in a clean context, pointed at this repo's `CLAUDE.md` (its own definition still carries the taxi standards; on the unadapted list in `.claude/PORTED-FROM-TAXI.md`). R2-1 to R2-4 are the agent's; this session verified R2-1 by running the mutation, and ran the two probes under R2-3 and R2-1's edge note.

## Issues

### Medium

**R2-1 · `src/server.test.ts:8-9, 23-26` · the ladder walk is untested; "first rung, else last rung" goes green.** Round 1's M1 dropped the `base + 1` assertion, and nothing now depends on a middle rung being tried. Verified (`observed`): with `startServer` replaced by "bind `ports[0]`, on any failure bind `ports[ports.length - 1]`", `bun test` is 2 pass, 0 fail. AC #2 (first free port of 4731 to 4735) is what this file exists to hold. Two side notes on the same lines: `second` and `last` are created before the `try`, so if either throws, `first` is never stopped; and `base + 1` can be 65536, which Bun clamps to 65535 rather than rejecting (`observed`: `Bun.serve({port: 65536}).port` → 65535), so that edge is harmless but the term is dead weight.
Fix: make the middle rung a port the test just released, assert it is the one chosen, and create the servers inside the `try`.
```ts
const first = startServer([0]);
const base = first.port ?? 0;
const probe = startServer([0]);
const free = probe.port ?? 0;
probe.stop(true);
let second: ReturnType<typeof startServer> | undefined;
let last: ReturnType<typeof startServer> | undefined;
try {
  expect(base).not.toBe(0);
  expect(free).not.toBe(0);
  second = startServer([base, free, 0]);
  expect(second.port).toBe(free); // rung 1 skipped, rung 2 tried before rung 3
  // page, 404, No free port as now
  last = startServer([base, 0]);
  expect(last.port).not.toBe(0);
  expect(last.port).not.toBe(base);
} finally {
  first.stop(true);
  second?.stop(true);
  last?.stop(true);
}
```
Residual: another process could take `free` between `stop(true)` and the rebind. The ephemeral allocator moves forward, so this is far below M1's random-anchor class (`expected`, not measured). Re-run the mutation above after the fix and watch it fail.

**R2-2 · `.claude/hooks/stop_check.py:64-65` · M3's fix made a missing `bun` silent.** At `db8388b` a missing `bun` blocked with "command not found": wrong, but visible. At `176f255` it is `sys.exit(0)` with no output. Scenario: Claude Code launched from a desktop launcher whose environment never sourced `.zshrc`, so PATH lacks `~/.bun/bin`; every stop with dirty `src/` passes, the agent says done, the gate never ran and nobody is told. That is the say-so the docstring's first line says the hook exists to prevent. Note: round 1 asked for exactly `sys.exit(0)` "or drop the sentence", so this reverses that steer; a human decides. Fix, by heredoc (guard 6):
```python
if shutil.which("bun") is None:
    print("stop_check: bun not on PATH, `bun run check` not run", file=sys.stderr)
    sys.exit(1)  # non-blocking: stderr reaches the user, the stop proceeds
```
Claude Code treats a stop hook exit other than 0 or 2 as non-blocking with stderr shown to the user (`expected`, from the hooks documentation, not run here), so the fail-open promise on docstring line 19 still holds; reword that line to "exit 1 with a note". The `TimeoutExpired` path vanishes into `except Exception` the same way, but that is pre-existing and not this PR's.

### Low

**R2-3 · `src/server.test.ts:42` · the L5 test asserts a fact about the machine.** `expect(Bun.which("xdg-open")).toBeNull()` reddens the gate on any Mac with `xdg-utils` (MacPorts, nix, conda), and the stop hook then blocks every turn with "fix the failures" for a test with nothing to fix. It fails safe (no tab opens, the precondition runs first) and the fixes report flags it. The agent's proposed fix, pointing `PATH` at a directory with no executables for the call, does not work: `Bun.spawn` still found `open` with `PATH` set to `src/` (`observed`, this session; the same as the empty-PATH result in the fixes report). No cheap fix without an `env` option on the production spawn. Keep the loud precondition, or accept an `env: { PATH }` parameter on `openBrowser` for the test only if the next ticket touches it anyway.

**R2-4 · `launchers/README.txt:6` · Mac step 4 stops one click short.** `Start.command` runs under a Terminal login shell and `exec`s the binary, so closing that window triggers Terminal's default "Close this window? Closing will terminate: StudyTutor-x64" with Terminate / Cancel (`expected`: Terminal's default "Ask before closing" profile setting; not run here, it needs a person at the screen and is part of the pending dev-Mac leg). Step 4 promises that closing the window stops the tutor; a cautious parent clicks Cancel and is stuck. Fix: append to step 4 `Mac: click Terminate if it asks.` README stays at 10 lines (plan Task 4 allows 12). Register otherwise passes `.claude/rules/content.md`.

## Fix-mechanism pass (round 1 closures)

Round 1 raised no Critical or High. The pass was run on all nine anyway:

- M1: repro closed (held-port probe). Mechanism: the OS-picked anchor removed the flake and the middle-rung assertion with it → R2-1.
- M2: `expected` on Windows, no test; port 0 rethrow is the only way the loop exits with 0 untried, and then the raw Bun message reaches the parent ("Is port 0 in use?"), reachable only when loopback cannot bind any ephemeral port. Accepted.
- M3: repro closed (exit 2 → 0 with bun off PATH; gate still runs with bun present). Mechanism: silence → R2-2.
- L1: `process.execPath` is the bun binary under `bun scripts/build.ts` (`observed`); wrong only if `build.ts` were itself compiled, which nothing does.
- L5: catch swallows only the synchronous "executable not found". `Subprocess.exited` resolves, never rejects, and nothing awaits it; stdio ignored; no leak. `process.platform` is an own data property (`observed`), so the test's descriptor restore is exact.
- L3, L4, L6: closed by their probes; no new mechanism.
- L2: text passes the register rules → R2-4 is the one trip.

## Validation

| Check | Result | Provenance |
|---|---|---|
| `bun run check` at `1338d98` | exit 0: tsc clean, Biome "Checked 7 files, no fixes", `bun test` 2 pass / 0 fail / 12 expect() calls | observed, this review |
| `bun run build` at `1338d98` | exit 0: `dist/StudyTutor-windows.zip` 41,127,839 bytes, `dist/StudyTutor-mac.zip` 46,808,746 bytes | observed, this review; matches the PR body |
| Zip contents | mac: `StudyTutor-x64` 65,995,184, `StudyTutor-arm64` 59,867,200, `Start.command` 195, `README.txt` 574; windows: `StudyTutor.exe` 115,691,608, `Start.bat` 185, `README.txt` 574 | observed, `unzip -l`; matches the PR body and the fixes report |
| Fix commit size | `176f255`: 10 files, +74 / -34 | observed, `git show --shortstat`; matches the PR body |
| SonarCloud | Quality Gate passed | observed, `gh pr checks 21` |
| Base moved since round 1? | No: live `origin/main` = `e7ee024` = round 1's recorded base | observed; guarantees pass skipped |
| `git diff --stat origin/main..HEAD -- e1/ CLAUDE.md` | empty | observed |
| R2-1 mutation (`ports[0]` else `ports[last]`) | 2 pass, 0 fail against the current test | observed, this review |

Numbers pass: every figure in the PR body names its run and re-derives at this head. The fixes report's sweep list was spot-checked (`41,128,211`, `black window`, `9 expect`) and holds. The three `pending` S1 legs keep owner and date.

Constraint pass: no recommended fix touches `e1/`, `docs/tickets/`, `CLAUDE.md` or `.claude/settings.json`. R2-2 touches a guard 6 file; plan Q1 sanctions the heredoc route. R2-4 stays inside plan Task 4's line budget.

## What is done well

- Each round 1 closing probe was run against the old tree and the fixed tree, and the L5 test was shown red on the old `server.ts` before it went green.
- `startServer` rethrows only for port 0, which also retires the "No free port in …, 0" message for the shipped list.
- `openBrowser` sits after the `console.log`, so the fallback its docblock promises holds in order.
- Biome's `!!e1` and tsc's `include` now agree, with the reason in a comment.
- The S1 result separates `observed`, `expected` and `pending` with owner and date, and every changed figure was swept across its copies with the greps listed.

## Recommendation

**Request changes** (small). R2-1 before merge: it is the only test for AC #2 and it cannot see the ladder. R2-2 is a one-line judgement call that reverses round 1's steer; Linards decides. R2-3 and R2-4 can ride or follow.

Next: `piv-fix-review-findings .claude/code-reviews/pr-21-review-round-2.md`, then a human reviews the code and both rounds and merges.
