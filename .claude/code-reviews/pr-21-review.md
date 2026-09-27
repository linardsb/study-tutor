# PR #21 review: S1 spike and repo skeleton: Bun gate, hello-world server, launchers, build

**Head** db8388b · **Base** main @ `e7ee0244d7f1709821899e73a77f98b74f9b0262` · **Round** 1 · **Reviewed** 2026-09-27
**State** DRAFT (no CI workflow in this repo; SonarCloud quality gate passed) · **Diff** 17 files, +1125 / -14 (observed, `gh pr view 21`)

## Summary

The skeleton does what T1 asks and the parts that matter for S1 are right: the server binds `127.0.0.1` explicitly and never reads `PORT`, every side effect sits behind `import.meta.main`, the launchers handle spaces and the zip-preview case, and the build's ad hoc re-sign of both mac binaries closes a Gatekeeper dead end the plan did not know about. The gate is green at this head and every figure in the PR body, report and architecture doc re-derives at `db8388b`. The seven deviations in the implementation report are documented and taken as intentional. What remains is small: one flake in the gate the stop hook runs, one untested error code on the S1 edge, and a hook docstring that promises an escape hatch the code lacks.

**Recommendation: request changes** (small). 0 Critical · 0 High · 3 Medium · 6 Low.

Fresh eyes: the deep pass was run by the `code-reviewer` agent in a clean context, pointed at this repo's `CLAUDE.md` rather than the taxi standards its definition still carries (that agent file is on the unadapted list in `.claude/PORTED-FROM-TAXI.md`). Findings M1–M3 and L1–L4 are the agent's, verified by this session where a command could; L5 and L6 are this session's.

## Issues

### Medium

**M1 · `src/server.test.ts:5-8` · the random base port can already be taken.** `base = 20000 + random(30000)` overlaps the OS ephemeral range (Linux 32768–60999, macOS 49152–65535). If `base` or `base + 1` is held by a client socket at that moment, `startServer([base])` throws `No free port` and the gate is red, which is what the stop hook blocks on. Fix: let the OS pick the anchor and build the ladder from it.
```ts
const first = startServer([0]);
const base = first.port;
const second = startServer([base, base + 1, 0]);
const last = startServer([base, 0]);
// ...
expect(second.port).not.toBe(base);
expect(second.port).not.toBe(0);
```
The exact `base + 1` assertion goes; skip, 200, 404, throw and the `0` fallback stay deterministic.

**M2 · `src/server.ts:33` · the ladder stops on any code but `EADDRINUSE`** (`expected`, not observable on this Mac). On Windows 10/11, a port inside a Hyper-V or WSL excluded range fails bind with `EACCES`, not `EADDRINUSE`. If 4731 sits in one, the parent hits `Could not start` with four free ports and `0` never tried, at exactly the edge S1 measures. Fix: step on `EACCES` too, rethrow only for port `0`.
```ts
const code = (err as { code?: string }).code;
if (port === 0 || (code !== "EADDRINUSE" && code !== "EACCES")) throw err;
```
While there: the final message lists `0` as a port ("No free port in 4731, …, 4735, 0").

**M3 · `.claude/hooks/stop_check.py:19` vs `:61-75` · docstring promises "bun missing → exit 0"; the code exits 2.** With `shell=True` a missing `bun` is `returncode 127`, not an exception (`observed`: `subprocess.run('definitely-no-bun run check', shell=True)` → 127, no exception), so the hook prints `BLOCKED … command not found` and blocks the stop. Either `if shutil.which("bun") is None: sys.exit(0)` before the run, or drop the sentence. Everything else in the hook checks out: porcelain parsing, quoted paths, `stop_hook_active`, timeout, exit 2 on stderr. This file is fenced by guard 6, so the fix goes in by heredoc as the ticket's did.

### Low

**L1 · `scripts/build.ts:60` · `bun` is spawned by name and is the one tool not preflighted.** `Bun.spawnSync(["bun", …])` throws on a PATH without it (`observed`: "Executable not found in $PATH") instead of reaching the `Build failed` line. The script is already running under bun: use `process.execPath` and the dependency disappears.

**L2 · `src/server.ts:12`, `launchers/README.txt:5-6` · "black window" is wrong on a Mac.** `Start.command` opens Terminal, whose default profile is white. Say "the window that opened with it", or split the sentence by OS in the README. Register otherwise passes `.claude/rules/content.md`.

**L3 · `launchers/Start.command:2` · `cd` failure is not checked.** `cd "$(dirname "$0")" || exit 1`; otherwise `exec ./StudyTutor-x64` runs in the wrong directory with a bare "No such file" line.

**L4 · `tsconfig.json` · no `include`, so `tsc` parses `e1/`** (`observed`: `tsc --listFilesOnly` lists `e1/test-case.js`, `e1/assets/case.js`, `e1/assets/quiz.js` beside the three `src/` and `scripts/` files). `checkJs` is off so it is parse-only and green today, but a syntax quirk in the v1 donor code would redden the gate from a folder the plan fenced off for Biome. `"include": ["src", "scripts"]` matches the intent; widen when `app/` and `content/` land.

**L5 · `src/server.ts:51-58` · a missing opener kills a server that has already bound.** `Bun.spawn` throws synchronously when the command is not on PATH (`observed`: `Bun.spawn(["definitely-not-a-cmd"])` → "Executable not found in $PATH"), and `openBrowser(url)` sits inside the same `try` as `startServer`, so the process prints `Could not start` and exits 1 after the URL was printed and the port taken. Reachable only on Linux without `xdg-open`, which is not a shipped target. Fix: wrap `openBrowser` in its own `try` and swallow; the URL is already on the console.

**L6 · `docs/prd/study-tutor-v2.architecture.md:218-220` · one claim in the S1 result lacks a provenance tag.** "a quarantined binary with an invalid signature gets 'damaged' with no Open Anyway" is stated as fact between two `observed` clauses; it was not observed in this ticket (the re-sign was added before any quarantined run). It is the documented macOS behaviour and the reason for D1 in the report, so keep it, tagged `expected`. The same sentence appears in `scripts/build.ts:66-68` as a comment, where no tag is needed.

## Validation

| Check | Result | Provenance |
|---|---|---|
| `bun run check` at `db8388b` | exit 0: tsc clean, Biome "Checked 7 files, no fixes", `bun test` 1 pass / 0 fail / 9 expect() calls | observed, this review |
| `bun run build` at `db8388b` | exit 0: `dist/StudyTutor-windows.zip` 41,128,211 bytes, `dist/StudyTutor-mac.zip` 46,808,601 bytes | observed, this review |
| Zip contents | mac: `StudyTutor-x64` 65,995,184, `StudyTutor-arm64` 59,867,200, `Start.command` 185, `README.txt` 554; windows: `StudyTutor.exe` 115,691,608, `Start.bat` 185, `README.txt` 554 | observed, `unzip -l` this review; matches the PR body |
| SonarCloud | Quality Gate passed | observed, `gh api …/check-runs` |
| Base moved since PR opened? | No: live `origin/main` = `e7ee024` = `baseRefOid` | observed |
| `record-gate.sh` | exit 3 "GATE SHORT" at `db8388b` with `exit_code: 0`: the script parses turbo's task summary, which Bun never prints. Body says so; script is on the unadapted list | observed |
| `git diff --stat e1/`, `CLAUDE.md` | empty | observed |

Numbers pass: every figure in the PR body, the report and the S1 result names a run and re-derives at this head. The one unlabelled claim is L6. The three `pending` legs (dev-Mac dialog count, fresh Windows PC, fresh Apple silicon Mac) are labelled with owner and date; AC #5 allows that form.

Constraint pass: no recommended fix touches `e1/`, `docs/tickets/`, `CLAUDE.md` or `.claude/settings.json` (plan non-goals). M3 touches a guard-6 file; the plan's Q1 already sanctions the heredoc route for the hook.

## What is done well

- `hostname: "127.0.0.1"` explicit, `port` never read from the environment, `lsof` in the report backs the Network rule.
- `Start.bat` handles the zip-preview case (`%~dp0` in a temp folder, `if not exist`, `pause`), quotes for spaces, keeps `pause` after the exe so an error stays readable.
- The ad hoc re-sign is the right call and well commented; the S1 result separates `observed` from `pending` with owner and date.
- `import.meta.main` keeps side effects out of the test's import; teardown is `stop(true)` in `finally`.
- Zero runtime dependencies, `node:fs` for the delete, no shell string building, `rmSync` at the top sweeps a partial `dist/` from a failed run.
- The plan was amended to match what shipped, so the next round's reviewer reads one story.

## Recommendation

**Request changes.** Fix M1 before merge: it is a flake in the gate the stop hook runs. M2 and M3 are one line each and belong in this PR because they touch the S1 dead-end story and the hook's own contract. L1–L6 can ride along or follow. Nothing here changes the S1 protocol or the pending legs.

Next: `piv-fix-review-findings .claude/code-reviews/pr-21-review.md`, then a human reviews the code and this review and marks the PR ready.
