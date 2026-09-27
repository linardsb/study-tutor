# Implementation Report — T1: S1 spike and repo skeleton

**Plan**: `.claude/plans/s1-spike-and-repo-skeleton.md`   **Branch**: `feature/s1-spike-and-repo-skeleton`
**Status**: PARTIAL (code complete; the S1 spike's human legs are `pending`, owner Linards)

## Summary

The repo now has its gate (`bun run check` = `tsc --noEmit` + `biome check .` + `bun test`), a hello-world
`Bun.serve` on `127.0.0.1` with the 4731–4735 port ladder and a `port: 0` fallback, launchers, and a build
script that cross-compiles three targets from this Mac into `dist/StudyTutor-windows.zip` and
`dist/StudyTutor-mac.zip`. The stop hook now runs `bun run check` on this repo's folders. The architecture
doc carries an S1 result with the dev-Mac observations and three `pending` legs, and Q11 is answered.

## Tasks completed

- Gate → `package.json`, `tsconfig.json`, `biome.json`, `bun.lock`, `.gitattributes` (CREATE), `.gitignore` (UPDATE)
- Server → `src/server.ts` (CREATE)
- Test → `src/server.test.ts` (CREATE)
- Launchers → `launchers/Start.bat`, `launchers/Start.command` (755), `launchers/README.txt` (10 lines) (CREATE)
- Build → `scripts/build.ts` (CREATE)
- Stop hook → `.claude/hooks/stop_check.py` (UPDATE, via Bash heredoc), `.claude/PORTED-FROM-TAXI.md` row (UPDATE)
- Architecture doc → `docs/prd/study-tutor-v2.architecture.md` S1 result after the spikes block, Q11 in place (UPDATE)

## Tests added

`src/server.test.ts`, two tests, 12 assertions (figures updated after the PR #21 round 1 fixes: M1 lets the
OS pick the anchor port, L5 adds the opener test): `first` binds port 0 and the OS-chosen port is the anchor; `second`
steps past it; `/` is 200 with `text/html; charset=utf-8` and contains "Study tutor"; `/nope` is 404; `startServer([base])`
throws `No free port`; `startServer([base, 0]).port` is neither 0 nor `base`; `openBrowser` does not throw with the platform
set to linux and no `xdg-open` on PATH. Result: 2 pass, 0 fail (`observed`, `bun test` 2026-09-27, round 1 fixes).

## Validation results

All `observed` on 2026-09-27, macOS 15.7.3 Intel, Bun 1.3.4, TypeScript 7.0.2, Biome 2.5.14:

- `bun run check`: tsc clean, Biome "Checked 7 files, no fixes", 2 pass 0 fail, 12 expect() calls, exit 0 (`observed` after the PR #21 round 2 fixes; the same figures after round 1).
- `bun src/server.ts`: `Study tutor is running at http://127.0.0.1:4731/`; curl `/` 200, `/nope` 404;
  `lsof` shows the listener on `127.0.0.1:4731` only.
- `bun run build`: three compiles plus two ad hoc re-signs in about 9.5 s (runtimes already cached);
  `dist/StudyTutor-windows.zip` 41,127,857 bytes (round 2 fixes; 41,127,839 after round 1, 41,128,211 at `db8388b`) (`StudyTutor.exe` 115,691,608, `Start.bat` 185, `README.txt` 607);
  `dist/StudyTutor-mac.zip` 46,808,764 bytes (round 2 fixes; 46,808,746 after round 1, 46,808,601 at `db8388b`) (`StudyTutor-arm64` 59,867,200, `StudyTutor-x64` 65,995,184 after the ad hoc re-sign,
  `Start.command` 195, mode 755, `README.txt` 607); both extract to one `StudyTutor/` folder.
- Extracted mac zip in a scratch folder: `./StudyTutor/Start.command` picked the x64 binary, printed the
  URL, curl 200.
- `codesign -vv` on both extracted mac binaries: "satisfies its Designated Requirement", `Signature=adhoc`.
- `spctl -a -t exec` on quarantined copies of `Start.command` and `StudyTutor-x64`: `rejected, source=no
  usable signature` (the Open Anyway kind of dialog, not "damaged").
- Missing `zip` probe (`PATH=/nonexistent`): refusal message, exit 1.
- `git ls-files -s launchers/Start.command` → `100755`; `file launchers/Start.bat` → CRLF; `README.txt` 10 lines.
- Stop hook: dirty `src/` with a red scratch test → `BLOCKED: engine code changed but \`bun run check\` is
  red ...`, exit 2; scratch files removed → exit 0. `grep` for pnpm, apps/, services/, packages/, db/, turbo,
  taxi in the hook → none. Clean-tree probe after the wip commit `67a636b`: exit 0. Dirty `src/` with `bun` off
  PATH (round 2 fixes): `stop_check: bun not on PATH, \`bun run check\` not run` on stderr, exit 1 (non-blocking).
- `git diff --stat e1/` and `git diff --stat CLAUDE.md`: empty.

Level 4 steps 1–3 (Safari download, Finder double-click, dialog count on this Mac) were not run: they need
a person at the screen. Steps 4–6 are Linards's.

## Deviations from the plan

1. **Ad hoc re-sign of both mac binaries in `scripts/build.ts`** (not in the plan). Bun's darwin-x64
   compile keeps Bun's own Developer ID signature (`Authority=Developer ID Application: Jarred Sumner`)
   and the compile invalidates it: `codesign -vv` reported "invalid signature (code or signature have been
   modified)" and `spctl` refused to assess it. A quarantined binary with an invalid signature gets
   Gatekeeper's "damaged, move to Bin" dialog with no Open Anyway, a dead end S1 would have hit on the
   Intel leg. The plan's `Signature=adhoc` observation held for the arm64 cross-compile only. The build
   now runs `codesign --force --sign -` on each darwin outfile and refuses if `codesign` is missing,
   alongside the `zip` check. Both binaries then verify as valid ad hoc. Recorded in the S1 result.
2. **`.gitattributes` is `launchers/*.bat`, not `*.bat`.** The plan's `*.bat` made git renormalise
   `e1/Open map.bat` and `e1/Open case.bat` (they showed as modified with no content change), which
   breaks the "e1 untouched" criterion. Scoping to `launchers/` keeps the CRLF guarantee where it is
   needed and leaves `e1/` alone.
3. **Stop hook edited through a Bash heredoc** (Q1, decided in the plan). Guard 6 in `pre_tool_use.py`
   blocks Edit and Write on `.claude/hooks/`; its own docstring names the heredoc as the deliberate path
   when the user asked. The ticket asked.
4. **Mac leg on this machine is `pending` for the dialog count.** The plan's Level 4 step 2 wanted the
   number of Gatekeeper dialogs from a Finder double-click after a Safari download. The session cannot
   click dialogs, so the S1 result records the `spctl` verdict on quarantined copies as the observed proxy
   and leaves the count to Linards. The expected date on all three pending legs, 2026-10-04, is an
   assumption (one week); change it if wrong.
5. **Test asserts the `content-type` header too.** One assertion beyond the plan's list; it pins the
   `charset=utf-8` the page depends on.
6. **`@types/bun` pinned `^1.4.2`**, not `latest` as `bun init` wrote; `typescript` moved from
   `peerDependencies` (where `bun init` put it) to `devDependencies` as the plan's shape says.
7. **`.claude/settings.json` untouched**, as the plan's non-goals say: its permission list still names
   pnpm; irrelevant under bypass mode and fenced by guard 6.

## Issues encountered

- Two validation servers outlived their subshells (`kill %1` inside `( ... )` did not reach them) and held
  4731 while the extracted-zip run took 4732. Killed by pid; the port ladder did what it should.
- `bun init -y` installed `typescript@5.9.3` as a peer dependency first; `bun add -d typescript` then
  pinned 7.0.2, matching the plan's observed version.
- `Start.command` and the README were not exercised on Apple silicon; the arm64 binary is built,
  re-signed and zipped but unrun (this Mac is Intel).
