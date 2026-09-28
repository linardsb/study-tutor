# Execution record — T11 distribution and updates

**Plan**: `.claude/plans/t11-distribution-and-updates.md`   **Branch**: `feature/t11-distribution` (worktree `~/Desktop/study-tutor-t11`)
**Machine**: Intel i9-9900K, macOS, Bun 1.3.4, 2026-09-28. Every figure below is `observed` unless labelled.

## Mutation checks

| Task | Mutation | Result | Restored |
|---|---|---|---|
| 2 | delete `if (!r.ok) return none` in `checkForUpdate` | 3 fail (status 404, 403, 500; bodies name `v9.9.9`) | 15 pass |
| 4 | delete the D2 early return in `write` | 1 fail (backup test); the refusal and truncation tests stay green | 13 pass |
| 6a | delete `checkOnStart` from `main` | `start.test` case 2 red (test timed out at 5,001 ms because the server kept running), case 3 red (no `state.json`); case 1 green | 3 pass |
| 6b | move `checkOnStart` after `startServer` | 3 pass. The order is not guarded by a test; the doc comment on `checkOnStart` and review guard it | n/a |
| 8 | `stageFolder` also copies `data` (a temp `data/events.jsonl` at the repo root) | cases 3 and 5 red, case 4 green | 5 pass |

## Task 11: start check timing after D1a

`replayCheck` three times in one process, `synth-events.ts --seed 1`:

| Log | Size | 1st | 2nd | 3rd | Plan (before D1a/D2) |
|---|---|---|---|---|---|
| 5,000 events | 490,787 B | 62 ms | 56 ms | 51 ms | 62 / 107 / 96 |
| 50,000 events | 4,892,946 B | 536 ms | 499 ms | 481 ms | 683 / 1,085 / 928 |

The 2nd and 3rd calls are below the 1st, so D1a took effect. The 50,000-event start costs about 0.5 s, which is under the 1 s budget.

## Level 4

1. **Stamp and zips.** `bun run build` exit 0. Output ends with `Release tag: v0.1.0` and `gh release create v0.1.0 dist/StudyTutor-windows.zip dist/StudyTutor-mac.zip --title "v0.1.0"`. Windows zip 41,290,363 B, mac zip 46,994,346 B. `unzip -Z1 … | grep -c '^[^/]*/data'` gives 0 for both zips. The first entry in both is `StudyTutor-0.1.0/`. The extracted `StudyTutor-x64 --version` prints `0.1.0`.
2. **Banner.** This used a `bun` harness: `saveSetup` with "No model" returned `ok: true`, then `startServer([0], { update: Promise.resolve({… 0.2.0 …}) })`. In agent-browser, `p.update` is the first child of `main`. Its text is "Version 0.2.0 of the tutor is out. A parent can download it here." and its `href` is `https://github.com/linardsb/study-tutor/releases/tag/v0.2.0`. A screenshot was checked by eye: the amber line sits above the heading. The same harness without `update` (VERSION `dev`) gives `/api/update` → `{"version":"dev","update":null}` and 0 `p.update` elements.
3. **Update keeps progress.**
   - a. v1 is the 0.1.0 zip. Settings was saved as "No model" through agent-browser. Two "Mixed 6" sets gave 12 `attempt` lines and 12 `xp` lines (24 in total). The `shasum` of `data/*` was saved.
   - b. `package.json` was set to 0.1.1. `bun run build` exited 0 with `Release tag: v0.1.1`. `package.json` was then reverted, and `git diff` was empty. Running `open -W -a "Archive Utility"` on the 0.1.1 zip inside the v1 folder put `StudyTutor-0.1.1` beside `StudyTutor-0.1.0` with no prompt (D3a). The v2 `--version` prints `0.1.1`. v2 started with no `data` opened `/setup.html` and created no `data/`. That start's `/api/update` came from the stamped binary against the live feed and returned `{"version":"0.1.1","update":null}` within 1 s (the repo is private, so the feed answers 404).
   - c. The Finder copy through `osascript` was refused (`-1743 Not authorised to send Apple events to Finder`), so `cp -Rp` was used. The v1 and v2 `data/*` hashes both equal the saved list. On v2 start, `/api/state` `{lines 24, hash, xp 120, 12 rungs}` equals v1's `state.json` (`jq -S` diff empty), and `/` loads with no banner. After v2 stopped, its hashes still equalled the saved list: no rewrite and no `state.prev.json` (D2). v1 was untouched.
   - d. `package.json` is at 0.1.0.
4. **Refusal on start.** In a copy of the v2 folder, `jq` raised `1MA1/R4` from rung 0 to 1. `./Start.command` printed `Stopped: this version of the tutor would lower progress on 1 topic.`, then `  1MA1/R4: saved 1, now 0`, then the "Nothing was changed…" line, and exited 1. `shasum -c` on `state.json` passed, and no `state.prev.json` exists. This was run from the shell, not a Finder double-click; `Start.command` `exec`s the binary, so the output is the same.
5. **Feed down.** Not run. Turning Wi-Fi off would cut this session's model connection. The evidence in its place is the live 404 in step 3b, `src/updates.test.ts` (hang, refused connection, 403/404/500) and `src/server.test.ts` (a hanging feed does not hold up `/api/state`). Owed: a person runs step 5 by hand.

## Screenshot

`docs/setup-mac.png` (475×180) is a crop of the Privacy & Security window's Security block: "“Start.command” was blocked to protect your Mac." with Open Anyway. Gatekeeper's block came from a quarantined scratch copy (`xattr -w com.apple.quarantine`). The user did one scroll. The first capture was discarded: it was not scrolled, and the sidebar showed the account name and photo. The crop contains no name, path or other app.
