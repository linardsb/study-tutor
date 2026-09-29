# Issue #42: optional parent-chosen squad sync folder

Epic #1 · follows T14 (#16). D9 amended 2026-09-29 and the CLAUDE.md `data/` confinement rule given
its one exception, both approved by the user.

## Goal

A parent can set one folder (for example inside Google Drive or OneDrive) on the setup page. When it
is set, squad files live directly in it as `<folder>/<pupil-slug>.json`: the tutor writes only the
local pupil's file and reads the others. Unset, T14's `data/squad/<squad-id>/` behaviour is unchanged.

## Design

- `squadFolder` is an optional string in `data/config.json`, saved through `saveSetup`. There are no
  events, and an old config without the key still loads. In the POST body, `undefined` keeps the saved
  value, `""` unsets it, and anything else is checked before any write.
- `checkSquadFolder(dataDir, p)` in `src/config.ts` returns the folder's realpath, or null when the
  path is not a string, not absolute, missing or not a directory, or when it is `data/` itself or a
  folder inside `data/`. That last check stops a pupil slug such as `config` overwriting
  `config.json`. The same check runs at save time and on every squad call.
- `src/api/squad.ts` works out where the files go once per call:
  - The `squadFolder` key is absent: `data/squad/<id>`, as T14 does it.
  - The key is set and passes the check: the folder's realpath.
  - The key is set and fails the check: nothing is read or written, and the page shows the existing
    "left out" note.

  The key is read raw with `readDataJson`, not through `readConfig`. A bad `base_url` makes
  `readConfig` return null, and that must not quietly switch the squad back to `data/`.
- Pinning reuses `resolveInData`, `readDataJson` and `writeDataFile`, with the folder's realpath as the
  root. A symlink or `..` escape is refused. `listDataDir(root, "")` now lists the root itself: this is
  the one change to `src/events/append.ts`. In sync mode only, a file is read only if its name is
  `<slug>.json`, so sync-client copies such as `sam (1).json` are ignored.
- Setup page: a "Squad sync folder" field, sent with both the "No model" body and the model body.

## Guard

No model job, MCP tool or prompt is touched. The answer-withheld guard in `friends()` is unchanged:
a friend's answers reach the page only once this pupil's own round is in the log.

## Tasks

1. Amend the docs (D9 and CLAUDE.md). Check: the diff shows only the two approved sentences.
2. `src/config.ts`: `squadFolder` in `Config`, `publicConfig`, `saveSetup` and `checkSquadFolder`.
   Check: config tests.
3. `listDataDir` root listing, then `src/api/squad.ts` with a `Place`. Check: the existing squad
   tests 1 to 9b pass unedited.
4. Setup page field. Check: `tsc` and `biome` pass.
5. New tests:
   - a symlink escape is refused
   - a `..` or relative path is refused
   - non-slug names are ignored
   - a folder inside `data/` (and `DATA` on macOS) is refused at save time and at use
   - with the folder unset, behaviour is unchanged
   - a friend's file shows in the compare view
   - the local pupil's file is the only one written
   - the own file planted as a symlink to `config.json` is refused
6. `bun run check`.

## Known limit

`writeDataFile` makes its root folder when that folder is missing. The per-use check runs just
before the write, so the only gap is a folder removed between the check and the write, which could
recreate it locally. This is accepted.
