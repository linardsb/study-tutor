# Implementation Report — T11 distribution and updates

**Plan**: `.claude/plans/t11-distribution-and-updates.md`   **Branch**: `feature/t11-distribution`   **Status**: COMPLETE (Mac scope; Windows legs owed by #34, live feed and public links by #35)

## Summary

The build now stamps `package.json`'s version into the three binaries (`--version`). The folder inside each zip carries the version (`StudyTutor-0.1.0/`). The build refuses a zip that holds a top-level `data` entry and prints the release tag and the `gh release create` line. Each page-mode start asks the GitHub releases feed once, in the background, with a 5 s timeout, and never rejects. `/api/update` returns the result, and `app/update.js` shows one line on the landing page. `replayCheck` runs before `startServer` on every start, including `--mcp`, and a refusal exits 1. `replayCheck` no longer rewrites an unchanged `state.json`, and backs it up only when this build's replay of its lines differs from it, so the pre-update `state.prev.json` survives later starts, including after lines appended without a state write (PR #37 review F1). It also replays once instead of twice when no lines were added. `README.md` and `launchers/README.txt` give the parent the download, first start, settings and a copy-then-delete update procedure. On win32, `data/config.json` gets an owner-only ACL through `icacls` (#29), after each save and on each start, since an update's copied `data` takes the new folder's inherited ACL (PR #37 review F2).

## Guard restatement

T11 touches no file under `src/jobs` or `src/mcp` and no prompt, and adds no model call. `/api/update` returns only a version string and a release page URL that, once parsed, must start with `RELEASES_PAGE`. `checkOnStart` writes only `state.json` / `state.prev.json`, through the existing `writeState` / `copyState`. The answer-withheld guard is unaffected.

## Tasks completed

- Task 0 → worktree `~/Desktop/study-tutor-t11`, baseline `bun run check` 301 pass; memory `t11-worktree.md`
- Task 1 → `src/updates.ts` (CREATE): `VERSION`, `RELEASES_FEED`, `RELEASES_PAGE`, `UpdateInfo`, `isNewer`, `checkForUpdate`
- Task 2 → `src/updates.test.ts` (CREATE)
- Task 3 → `src/events/check.ts` (UPDATE): `refusalLines`, D2 skip-write, D1a single replay
- Task 4 → `src/events/check.test.ts`, `scripts/replay-check.ts` (UPDATE)
- Task 5 → `src/server.ts` (UPDATE): `ServerOptions.update`, `checkOnStart`, `/api/update` (last route), `--version`, start order
- Task 6 → `src/server.test.ts` (UPDATE), `src/start.test.ts` (CREATE)
- Task 7 → `scripts/build.ts` (UPDATE): `readVersion`, `stageFolder`, `assertNoData`, `--define BUILD_VERSION`, `import.meta.main` guard, versioned folder; `package.json` `"version": "0.1.0"`
- Task 8 → `scripts/build.test.ts` (CREATE)
- Task 9 → `app/update.js` (CREATE), `app/index.html` (tag last before `</body>`), `app/style.css` (`.update` last rule)
- Task 10 → `src/events/append.ts` (`restrictToOwner`), `src/config.ts` (call after the config write, and `restrictConfigOnStart` from `src/server.ts` on each start), `src/events/append.test.ts`
- Task 11 → timing re-run, recorded in the execution record
- Task 12 → `README.md` (CREATE), `launchers/README.txt` (UPDATE), `docs/setup-mac.png` (CREATE)
- Task 13 → `.claude/execution-reports/t11-distribution-and-updates.md`

## Tests added

- `src/updates.test.ts`, 18 tests: `isNewer` (numeric compare, junk); a dev build never fetches; newer → update; same/older → null; 404/403/500 with a newer body → null; junk bodies (not JSON, `{}`, number tag, `null`) → null; `html_url` off-prefix (another host, `study-tutor-evil`, `releases-evil`, `releases/../..`) → null; a hung feed resolves null under 2 s with a 100 ms timeout; refused connection → null.
- `src/events/check.test.ts`, +4: an unchanged state is not rewritten and the backup survives (mtime unchanged); a line appended without a state write keeps the backup; a new build's first start after appended lines still takes it; `refusalLines` exact text for 1 and 2 topics.
- `src/server.test.ts`, +2: `/api/update` with no check → `{version: "dev", update: null}`, with a check → its body, foreign Origin → 403; a hanging feed does not hold up `/api/state` and `/api/update` ends as no update.
- `src/start.test.ts`, 3 tests (spawns `src/server.ts` in a temp root): `--version` → `dev`, no `data/`; a refusal exits 1 with the "Stopped:" line, `state.json` byte-identical, no "is running at"; `--mcp` with closed stdin exits 0, writes `state.json` (`lines: 33`), stdout JSON-only.
- `scripts/build.test.ts`, 6 tests: `readVersion`; `assertNoData` (top-level `data` only, `database.txt` passes); `listZip` throws on a failed listing; `stageFolder` contents and `0o755`; the README update steps keep every `data/` file's sha256 and a second `replayCheck` rewrites nothing; a zip of a staged tree has no `data` even beside a source `data/`.
- `src/config.test.ts`, +1: `restrictConfigOnStart` calls `restrict` only when `config.json` exists.
- `src/events/append.test.ts`, +1: `restrictToOwner` no-op on darwin/linux, exact `icacls` argv on win32, exit 5 and a throw warn without throwing.

Mutation checks for Tasks 2, 4, 6 and 8 were run both ways. Results are in the execution record.

## Validation results

- `bunx tsc --noEmit`: clean.
- `bunx biome check .`: clean apart from 4 existing `noDescendingSpecificity` warnings in `app/style.css` (lines 642–672, not touched).
- `bun run check`: **336 pass, 0 fail**, 31 files (`observed`, after the PR #37 review round 1 fixes; 329 before them). Baseline was 301.
- `bun scripts/test-generators.ts`: all 6,300 runs pass.
- Level 4 steps 1–4: pass. Step 5 was not run (see Deviations). Details are in `.claude/execution-reports/t11-distribution-and-updates.md`.

## Deviations from the plan

1. **Task 6 case 3 (`server.test.ts`) asserts ordering, not a 200 ms bound.** The test checks that `/api/state` answers 200 while the update promise is still unsettled (a `settled` flag), then that `/api/update` settles as null. An absolute timing bound flakes under load, and the property is "does not wait on the feed".
2. **Task 6 mutation (b) is not caught by any test**, as the plan expected. The check-before-serve order is guarded by the doc comment on `checkOnStart` and by review.
3. **`--version` is handled before the `try` block**, and `--mcp` is read into a variable up front. `startServer` used to run before the MCP branch split, so the `update` option is chosen as `mcp ? undefined : checkForUpdate(...)` just before `startServer`. The effect is the same as the plan's "MCP branch passes no `update`".
4. **Task 8 case 4 writes ten `usage` events**, not attempts. Any valid event exercises the copy, and `usage` needs no topic fixture.
5. **Task 9: no DOM test and no `map.html` tag.** At Task 0 and again before this report, `git log origin/main -- app/map.html` was empty and happy-dom is not a dependency. T6 owes `<script src="/update.js" defer></script>` in `app/map.html`; comment this on #8 when the PR opens. Level 4 step 2 is the banner's check.
6. **Task 12 validation grep.** The plan says `grep -n "right-click" README.md launchers/README.txt` should return nothing. It returns the update step "right-click the `data` folder and choose Copy", which is the plan's own Solution 5 wording. D4's intent holds: neither file says "right-click → Open".
7. **README wording differs from the plan in three places, each checked against the code.**
   - The plan's text says "only the chat is off". The chat panel does not exist yet, so the README says "only the parts that need a model are switched off".
   - The macOS second-open dialog wording is unverified, so the step reads "If the Mac asks once more, choose to open it".
   - Finder's context menu says "Paste Item", so the paste step names both "Paste" and "Paste Item" (the plan said the words are the same on both OSes).
   
   The per-step times are labelled as estimates: download 5, one OS's first start 5, settings 5, so 15 minutes for one parent (derived), plus 10 for an update. Zip sizes are the observed 41 MB and 47 MB. The settings section says Key and Tokens per month appear only after a provider is picked (observed in the agent-browser snapshot with "No model").
8. **Level 4 step 2** used the `bun` harness for both halves. The "no line" half ran the harness without `update` instead of `bun run dev`. It is the same code path (`VERSION` is `dev` from source) and avoids a browser tab and a `data/` in the worktree.
9. **Level 4 step 3c** copied `data` with `cp -Rp`, not by Finder right-click. Scripting Finder was refused (`-1743`). Owed: one Finder copy by a person, with no expected difference.
10. **Level 4 step 4** ran `./Start.command` from the shell, not by a Finder double-click. `Start.command` `exec`s the binary, so the output is the same.
11. **Level 4 step 5 (Wi-Fi off) was not run.** It would cut this session's model connection. The evidence in its place is the stamped 0.1.1 binary's live feed call (404 → `update: null`), the hang and refused-connection unit tests, and the hanging-feed server test. Owed to a person.
12. **Screenshot is cropped** to the Security block (475×180). The first full-window capture showed the account name and photo and was discarded.
13. **`dist/` currently holds the 0.1.1 build** from Level 4 step 3b. It is gitignored. Run `bun run build` again before any release.

14. **`src/start.test.ts` sets a 15 s test timeout** so a server that never exits fails on the exit-code assertion (spawn timeout 10 s) instead of the runner's 5 s default.

## Issues encountered

- The Bash hook blocks `rm -rf` even in the scratchpad, so each run used new scratch directories.
- Finder Apple events are not authorised for this terminal (`-1743`).
- System Settings opened in a window that was not on screen, so the first capture missed the user's scroll.

## Owed

- #34: the Windows update leg, a `state.json` held open in Notepad, two appends at once on Windows, `icacls` from a second account, and SmartScreen text.
- #35: the live feed and README download links once the repo is public (PRD Q6, plan Q1).
- Licence line: omitted from `README.md` until Q6 decides (plan Task 12); state this in the PR body.
- Q2 (user's call): amend D10's wording to the versioned-folder copy procedure (D3/D3a). The PR body lists D3/D3a and D4 as divergences from the issue text.
