# Feature: T11 — Distribution and updates: version stamp, update check, replay-check on start, parent README

The following plan should be complete, but it's important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils, types and models. Import from the right files.

## Feature Description

T11 turns the S1 build into something a family can download, start, and update without losing progress.

- `scripts/build.ts` stamps a version (from `package.json`) into the binary, keeps the two zips, and refuses
  to finish if a zip holds a `data/` entry. It prints the tag to create for the release.
- `src/updates.ts` asks the GitHub releases feed once per start, in the background, with a timeout, and the
  server answers `/api/update` with the stamped version and, when a newer release exists, its version and page.
- `app/update.js` shows one line on the landing page ("Version 0.2.0 of the tutor is out. A parent can
  download it here.") and T6's map includes the same file with one tag.
- The server runs `replayCheck` (T2's `src/events/check.ts`) before it serves anything, on every start, and
  refuses to start if this build would lower a saved rung.
- `README.md` (the public download page) and `launchers/README.txt` (inside the zip) give the parent the
  30-minute path: download, first start past Gatekeeper or SmartScreen, the setup page, and a data-safe
  update procedure. `docs/setup-mac.png` shows the macOS Open Anyway step.
- Folded-in #29: on Windows, `data/config.json` gets an owner-only ACL through `icacls` after each save.

## User Story

As a parent who downloaded the tutor from a link
I want to see when a new version is out and update it by following written steps
So that my child's progress survives every update and I never need a developer to help

## Problem Statement

PRD constraint 1 (public download, unzip, double-click) and constraint 6 (pupil data survives every update)
are not met yet. S1 built zips with no version, no update path and a ten-line README. Nothing tells a family
that an update exists. Nothing stops a new build that replays the log differently from silently lowering
rungs: T2 shipped `replayCheck` as a script, and the architecture ("Delayed feedback") says it must run on
start. `/api/state` rewrites `state.json` whenever the hash differs (`src/api/state.ts:10`), so if the check
runs after the server starts, the first page load can overwrite the saved state it needed to compare.

## Solution Statement

1. **One version source.** `package.json` gets `"version": "0.1.0"`. `build.ts` reads it, refuses a value
   that is not `X.Y.Z`, compiles with `--define BUILD_VERSION="X.Y.Z"`, and prints `v X.Y.Z` as the tag.
   `src/updates.ts` reads `typeof BUILD_VERSION === "string" ? BUILD_VERSION : "dev"` (`observed` in this
   planning session: Bun 1.3.4 prints `dev` under `bun v.ts` and `0.2.0` from a `--compile --define` binary).
2. **Update check, never blocking.** `checkForUpdate(current, feedUrl, fetchImpl, timeoutMs)` returns a
   promise that never rejects: `dev`, a timeout, a non-200, junk JSON, an unparseable tag, a tag not newer,
   or a page URL outside the repo's releases prefix all resolve to "no update". `main` starts it after the
   server is listening and passes the promise in through `ServerOptions.update`. The feed URL and `fetch` are
   parameters that only `main` fills with the real constant, so the binary's outbound set stays the provider
   and one GitHub URL by construction (CLAUDE.md "Network"); tests use a loopback `Bun.serve` fake.
3. **Check before serve.** `checkOnStart(dataDir, log)` in `src/server.ts` runs `replayCheck`, logs to
   stderr (stdout carries JSON-RPC in `--mcp` mode), and returns false on a refusal; `main` exits 1 before
   `startServer`. The refusal text moves from `scripts/replay-check.ts` into `src/events/check.ts`
   (`refusalLines`) so the script and the start say the same thing.
4. **Keep the pre-update backup.** `replayCheck` currently rewrites `state.json` and rotates
   `state.prev.json` on every call (`src/events/check.ts:61-65`, `:120`). Running it on every start would
   replace the pre-update backup on the second start of the new version. It now skips the write when the
   replayed state serialises identically to the stored one.
5. **The update procedure fails safe.** Parent steps: (1) stop the tutor; (2) extract the new zip to its own
   folder; (3) copy the `data` folder from the old folder into the new one (right-click, Copy, then Paste in
   the new folder: the same words on both OSes); (4) start the new one and check the progress is there;
   (5) only then delete the old folder. Until step 5 the old folder is a complete rollback, which is what the
   refusal text's "put the previous version back" needs. The temp-tree test runs this exact sequence and
   compares a sha256 of every file under `data/` in both folders.
6. **Windows owner-only config (#29).** `restrictToOwner(file, platform, spawn)` in `src/events/append.ts`
   runs `icacls <file> /inheritance:r /grant:r <user>:F` on win32 only, called by `saveSetup` after the
   config write. Command shape tested on the Mac with an injected platform and spawn; the property is owed
   to a Windows host (#34).

### Guard restatement (CLAUDE.md "Restate the guard")

T11 touches no file under `src/jobs` or `src/mcp` and no prompt. No model call is added. The answer-withheld
guard is unaffected: `/api/update` returns only the version and a release page URL; `checkOnStart` writes
only `state.json` / `state.prev.json` through the existing `writeState` / `copyState`.

## Out of Scope / Non-Goals

- Not included: auto-update, download or unzip by the binary (D10: "the parent downloads").
- Not included: code signing or notarisation (D10: "no signing in v1").
- Not included: publishing a release or making the repo public. Both wait on PRD Q6 (owed by #35). The build
  prints the `gh release create` command; it does not run it.
- Not included: the level map page (T6, #8). T11 ships `app/update.js`; T6 adds one `<script>` tag.
- Not included: detecting "first start after an update" with a version file in `data/`. The check runs on
  every start, which is a superset and writes nothing new into `data/`.
- Not changing: port ladder, `refuseForeign`, `staticPath`, `writeDataFile`'s atomic write, the launchers'
  logic (`Start.bat`, `Start.command`), the zip names (`StudyTutor-windows.zip`, `StudyTutor-mac.zip`) —
  stable names make `releases/latest/download/<name>` a permanent link.
- Not showing the update line over MCP. `--mcp` mode does not run the feed check (a pending fetch would hold
  the event loop after stdin closes, against T10's clean exit, `src/server.ts:291`).

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: `scripts/build.ts`, `src/server.ts`, `src/events/check.ts`, `src/events/append.ts`, `src/config.ts`, `app/`, `launchers/README.txt`, `README.md`
**Dependencies**: none new. GitHub REST API `GET /repos/{owner}/{repo}/releases/latest` over plain `fetch`; `zip`/`unzip`/`codesign` from macOS for the build.

## Related Work

**Implements**: #13 (T11) · **Epic**: #1, architecture `docs/prd/study-tutor-v2.architecture.md` (D6, D10, D11, "Delayed feedback", S1 and S5 results) · PRD `docs/prd/study-tutor-v2.prd.md` (constraints 1 and 6, E2, Q6) · ticket file `docs/tickets/study-tutor-v2.md` T11.

**Folded in**: #29 (owner-only `config.json` on Windows).

**Owed by**: #34 (Windows legs: update on a PC, Notepad-open `state.json`, two appends at once, #29's
`icacls` from a second account, SmartScreen text) · #35 (live releases feed and README download links once
the repo is public, Q6).

**Back-references**:

- `.claude/plans/s1-spike-and-repo-skeleton.md` - Why: built `scripts/build.ts`, the launchers and the ten-line README this ticket replaces; its Level 4 steps 4 and 5 are the fresh-machine protocol.
- `.claude/plans/t2-events-append-replay.md` - Why: `replayCheck`, `writeDataFile`, `state.prev.json`; S5 says "T11 wires it into start".
- `.claude/plans/t8-setup-config-provider.md` - Why: `saveSetup` and the 0600 config write #29 extends.
- `.claude/plans/t10-mcp-server.md` - Why: `--mcp` stdout is JSON-RPC only and the process exits when stdin closes (its D9).

**Forward-references**:

- T6 (#8): `app/map.html` adds `<script src="/update.js" defer></script>`.
- #34, #35.

---

## DECISIONS (settled at planning, each with its reason)

- **D1 Check on every start, not only after an update.** Detecting an update needs a stamp file in `data/`
  (a new write, and a new thing to trust). Every-start is a superset. Cost today: two replays of the log per
  start (`check.ts:71` and `:92`). `observed` at planning (Intel i9-9900K, Bun 1.3.4, `synth-events.ts
  --seed 1`, `replayCheck` called three times in one process):

  | Log | Size | 1st call (rebuild) | 2nd | 3rd |
  |---|---|---|---|---|
  | 5,000 events | 490,787 B | 62 ms | 107 ms | 96 ms |
  | 50,000 events | 4,892,946 B | 683 ms | 1,085 ms | 928 ms |

  The architecture's "years fit in a few MB" is the 50,000 row. **D1a:** when `stored.lines ===
  lines.length` (the usual start: `/api/state` rewrites `state.json` on every change, `src/api/state.ts:10`),
  the prefix replay is the full replay, so reuse `now` as `before` instead of replaying twice. `derived`:
  one replay instead of two, so the every-start cost is about the "1st call" column (~0.7 s at 4.9 MB),
  under the 1 s start budget this plan sets. Task 11 re-times it after the change.
- **D2 Skip the rewrite when nothing changed.** See Solution 4. Comparison is
  `JSON.stringify(raw) === JSON.stringify(now)`, where `raw` is `readStoredState` (the parsed file). This
  holds because `writeState` writes `JSON.stringify(state, null, 2)` (`src/events/append.ts:197`), so key
  order matches. A shape change in a new build still rewrites once, and `state.prev.json` then keeps the old
  shape across later starts.
- **D3 Update procedure: copy `data` into a freshly extracted folder, delete the old folder last.** Finder's
  "Replace" on a folder deletes the old folder, `data/` with it; Archive Utility extracts into
  `StudyTutor 2` when `StudyTutor` exists; Explorer merges (`expected`, documented platform behaviour, not
  run here). "Replace the files in place" fails destructively if a parent drags the whole folder. Moving
  `data` was rejected: after a move the old folder has no progress, so "start the old folder again" after a
  refusal would open a fresh setup page. Copying keeps the old folder a full rollback until the parent has
  seen progress in the new one, which matches `refusalLines`' advice ("put the previous version back").
  Deleting the old folder last stops progress being split across two folders.
- **D3a The folder inside each zip carries the version: `StudyTutor-0.1.0/`.** This removes the one
  destructive path (A4) by construction: a new release extracts to `StudyTutor-0.2.0`, a name no earlier
  folder has, so neither Finder nor Explorer can offer "Replace" or merge over the old folder, whichever
  way the parent extracts or drags it. On Windows, "Extract All" into an existing `StudyTutor-windows`
  folder places `StudyTutor-0.2.0` beside `StudyTutor-0.1.0`. The zip file names stay fixed
  (`StudyTutor-mac.zip`, `StudyTutor-windows.zip`) for the permanent download link. Nothing reads the
  folder name: `appRoot` uses the binary's directory (`src/server.ts:27`) and the launchers use their own
  directory (`launchers/Start.command:2`, `launchers/Start.bat:2`), `observed` by reading them.
- **D4 S1 over the ticket wording on macOS.** The ticket says "right-click → Open screenshot". The S1 result
  (architecture, "S1 result") records that on macOS 15 and 26 the path is Done, System Settings, Privacy &
  Security, Open Anyway, open again; right-click Open is gone. The README and screenshot follow S1. The PR
  body notes this as a divergence from the issue text, inherited from S1.
- **D5 Feed URL is one constant; Q6 is an assumption.** `RELEASES_FEED =
  "https://api.github.com/repos/linardsb/study-tutor/releases/latest"`, `RELEASES_PAGE =
  "https://github.com/linardsb/study-tutor/releases/"`. `observed` in planning: the feed answers 404 today
  because the repo is private (`curl -w %{http_code}`), which the code treats as "no update". If Q6 picks
  another owner/repo, only these two constants and the README links change.
- **D6 Feed timeout 5,000 ms.** `expected` choice: long enough for a slow home connection, short enough that
  `/api/update` (which awaits the promise) answers within a page view. The start never awaits it.
- **D7 GitHub request shape.** `Accept: application/vnd.github+json`, `User-Agent: study-tutor/<version>`
  (the REST API requires a User-Agent; `expected` from GitHub docs). Unauthenticated limit 60 requests an
  hour per IP (`expected`, GitHub docs); one per start is far below it, and a 403 is "no update".
  `/releases/latest` excludes drafts and pre-releases (`expected`, GitHub docs).
- **D8 Page URL validated.** The release `html_url` reaches the page only if it starts with `RELEASES_PAGE`;
  otherwise the result is "no update". The page builds the line with `textContent` / `append`, never
  `innerHTML`.
- **D9 `restrictToOwner` warns, it does not throw.** The config has already been written when `icacls` runs;
  throwing would show the parent a failed save for a file that saved. It logs to stderr, and #34 verifies
  the property on a real PC. User from `os.userInfo().username`, not an environment variable.
- **D10 `--version` flag.** `StudyTutor --version` prints the stamp and exits 0 before anything else runs.
  It is the Level 4 oracle for the stamp.
- **D11 Overlap with T6, settled.** `observed` at planning: T6 has a worktree (`~/Desktop/study-tutor-t6`,
  `feature/t6-o1-pages`, no commits yet) and a plan (`.claude/plans/t6-o1-pages.md` there) that adds
  `GET /api/lessons` to `apiRoutes`, creates `app/map.html`, adds a link to `app/index.html`, appends to
  `app/style.css`, and adds `@happy-dom/global-registrator` to `package.json` devDependencies. No T9 branch
  exists. Rules, so either merge order works without judgement:
  - T11 adds `/api/update` as the **last** entry of `apiRoutes`, `update.js`'s tag as the **last** element
    before `</body>` in `index.html`, and `.update` as the **last** rule in `style.css`. Conflicts are then
    adjacent-append only: keep both sides.
  - `package.json`: T11's `version` line and T6's devDependency are different hunks; git merges them.
  - At Task 0 and again before `piv-create-pr`, run `git log --oneline main -- app/map.html`. If `map.html`
    is on `main`, rebase and add `<script src="/update.js" defer></script>` to it in this ticket (Task 9).
    If not, T6's PR owes that one line: comment it on #8 when T11's PR opens.
  - If happy-dom is on `main` at Task 9, add a DOM test for `update.js` (Task 9); otherwise Level 4 step 2
    is its check.
  - After any rebase, `bun run check`: the key-leak walk (`src/server.test.ts:364`) covers the merged table.

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `scripts/build.ts` (whole file, 105 lines) - Why: the build you finish; top-level code today, so it needs an `import.meta.main` guard to be importable by a test.
- `launchers/README.txt`, `launchers/Start.command`, `launchers/Start.bat` - Why: the zip's own README; `Start.command` strips quarantine from the binary only, so the only macOS dialog is for `Start.command` itself.
- `src/server.ts:16-21` (`ServerOptions`, with the optional `pack?` precedent), `:157-172` (`readRoute`), `:190-224` (`apiRoutes`), `:265-300` (`main`) - Why: where the route, the option and the start sequence go.
- `src/events/check.ts:61-65` (`write`), `:67-122` (`replayCheck`) - Why: D2's change and `refusalLines`.
- `scripts/replay-check.ts:14-28` - Why: the refusal text that moves into `check.ts`.
- `src/events/append.ts:165-193` (`writeDataFile`) - Why: `restrictToOwner` sits beside it; the copy fallback at `:185-191` is why #29 is applied after the call returns, not inside the rename branch.
- `src/config.ts:211-283` (`saveSetup`; config write at `:282`) - Why: the one call site of `restrictToOwner`.
- `src/api/state.ts:5-12` (`currentState`) - Why: the reason the check must run before `startServer`.
- `src/events/check.test.ts:1-120` - Why: `withLog` helper, six-weeks fixture, and the refusal fixture (same hash, bumped rung, `:50-68`). A different hash takes the truncated path and does not refuse.
- `src/server.test.ts:1-100`, `:355-390` - Why: `withTemp` / `withServer` helpers; the key-leak walk that will include `/api/update`.
- `scripts/scripts.test.ts` (whole file) - Why: the `run` / `withTemp` pattern for spawning scripts in a temp cwd.
- `src/events/append.test.ts:210-225` - Why: the concurrent-append test, which is the POSIX half of the ticket's "two appends at once" leg (already green; nothing to add).
- `app/index.html` (whole file, esp. the closing `<script>`) - Why: the landing page that gets the `update.js` tag; the inline fetch pattern to mirror.
- `.claude/rules/content.md` - Why: register for the pupil-facing update line and the README.

### New Files to Create

- `src/updates.ts` - `VERSION`, `RELEASES_FEED`, `RELEASES_PAGE`, `UpdateInfo`, `isNewer`, `checkForUpdate`.
- `src/updates.test.ts` - version compare, feed outcomes against a loopback fake.
- `src/start.test.ts` - spawns `bun src/server.ts` in a temp root: `--version`, refusal exits 1, `--mcp` with closed stdin runs the check and exits 0.
- `scripts/build.test.ts` - staged tree has no `data/`; `assertNoData`; the D3 update procedure keeps every `data/` file's hash.
- `app/update.js` - the one-line banner.
- `README.md` - the parent's download and setup page.
- `docs/setup-mac.png` - window-only capture of the Open Anyway step (Task 12, needs a person at the screen).

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [GitHub REST: Get the latest release](https://docs.github.com/en/rest/releases/releases#get-the-latest-release)
  - Why: response fields `tag_name`, `html_url`; drafts and pre-releases excluded; 404 when none or private.
- [GitHub REST: User-Agent required](https://docs.github.com/en/rest/using-the-rest-api/getting-started-with-the-rest-api#user-agent)
  - Why: D7.
- [GitHub REST: rate limits for unauthenticated requests](https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api#primary-rate-limit-for-unauthenticated-users)
  - Why: D7, a 403 must read as "no update".
- [GitHub: linking to the latest release asset](https://docs.github.com/en/repositories/releasing-projects-on-github/linking-to-releases#linking-to-the-latest-release)
  - Why: README download links `releases/latest/download/StudyTutor-mac.zip`.
- [Bun: `bun build --define`](https://bun.sh/docs/bundler#define) and [single-file executables](https://bun.sh/docs/bundler/executables)
  - Why: the version stamp; `observed` working in a compiled binary during planning.
- [MDN: `AbortSignal.timeout()`](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static)
  - Why: D6.
- [Microsoft: icacls](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/icacls)
  - Why: `/inheritance:r` and `/grant:r` semantics for #29.

### Patterns to Follow

**Injected platform and process for testability** (`src/server.ts:248-263`, `openBrowser(url, env = process.env)`): default parameters carry the real thing; tests pass fakes. Mirror for `restrictToOwner(file, platform = process.platform, spawn = defaultSpawn)` and `checkForUpdate(current, feedUrl, fetchImpl = fetch, timeoutMs = 5000)`.

**Optional server option** (`src/server.ts:20`): `pack?: CasePack; // loaded on the first /api/case when absent`. Mirror: `update?: Promise<UpdateInfo>; // the start-up feed check; absent → no update`.

**Route shape**: every route calls `refuseForeign(req)` first and answers through `json(status, body)` with `cache-control: no-store` (`src/server.ts:73-78`, `:104-113`).

**Temp dirs in tests**: `fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "st-<name>-")))`, removed in `finally` (`src/events/check.test.ts:13-27`).

**Loopback fake server in tests**: `Bun.serve({ hostname: "127.0.0.1", port: 0, fetch })`, `server.stop(true)` in `finally`.

**User-facing console text**: plain sentences, British English, no exclamation marks (`scripts/replay-check.ts:18-26`, `src/server.ts:269-271`).

**Biome**: `recommended` preset, double quotes, 2-space indent (`biome.json`). `biome check .` covers `app/*.js` and `scripts/`. `noNonNullAssertion` is in `recommended` (style group; `expected`, check `biome lint` output): guard with an `if` and throw instead of `!`. `tsc` covers `src` and `scripts` only (`tsconfig.json` `include`).

**Hook gotcha** (memory): a Bash heredoc containing `process` + `.env` trips the secrets guard. Write files with Write/Edit.

---

## IMPLEMENTATION PLAN

### Phase 0: Branch and worktree
Worktree `~/Desktop/study-tutor-t11` on `feature/t11-distribution` from `main` (the main checkout is shared with other ticket sessions).

### Phase 1: Foundation — `src/updates.ts`, `refusalLines`, D2 skip-write
### Phase 2: Start sequence and route — `checkOnStart`, `/api/update`, `--version`, `main`
**Depends on:** Phase 1.
### Phase 3: Build — version stamp, `assertNoData`, importable staging
**Independent of:** Phase 2 (touches only `scripts/build.ts`, `package.json`).
### Phase 4: Page and #29 — `app/update.js`, `restrictToOwner`
**Independent of:** Phase 3.
### Phase 5: Docs — `README.md`, `launchers/README.txt`, screenshot
**Depends on:** Phase 3 (the README quotes the zip names and the version flag).
### Phase 6: Manual validation and report

---

## STEP-BY-STEP TASKS

### Task 0 — CREATE worktree

- **IMPLEMENT**: `git -C ~/Desktop/study-tutor worktree add ~/Desktop/study-tutor-t11 -b feature/t11-distribution main`, then `cd ~/Desktop/study-tutor-t11 && bun install`. Copy this plan into the worktree's `.claude/plans/`. Save a memory `t11-worktree.md` like `t10-worktree.md`.
- **GOTCHA**: do not touch the main checkout's modified `.claude/skills/piv-create-pr/SKILL.md`; it belongs to another session.
- **VALIDATE**: `cd ~/Desktop/study-tutor-t11 && git branch --show-current && bun run check` (green before any change).
- **SATISFIES**: process.

### Task 1 — CREATE `src/updates.ts`

- **IMPLEMENT**:
  ```ts
  declare const BUILD_VERSION: string | undefined;
  /** The release this binary was built as ("0.2.0"), or "dev" under `bun run dev` and `bun test`. */
  export const VERSION = typeof BUILD_VERSION === "string" ? BUILD_VERSION : "dev";
  // One owner/repo for the feed and the page prefix (PRD Q6, #35).
  export const RELEASES_FEED = "https://api.github.com/repos/linardsb/study-tutor/releases/latest";
  export const RELEASES_PAGE = "https://github.com/linardsb/study-tutor/releases/";
  export type UpdateInfo = { version: string; update: { version: string; url: string } | null };
  ```
  - `parseVersion(s): [number, number, number] | null` for `/^v?(\d+)\.(\d+)\.(\d+)$/`.
  - `isNewer(tag, current): boolean`: false if either does not parse; lexicographic compare of the triples.
  - `checkForUpdate(current, feedUrl, fetchImpl = fetch, timeoutMs = 5000): Promise<UpdateInfo>`:
    `none = { version: current, update: null }`; if `current === "dev"` return `none` without calling
    `fetchImpl`; else `try { const r = await fetchImpl(feedUrl, { headers: {...D7}, signal: AbortSignal.timeout(timeoutMs) }); if (!r.ok) return none; const body = await r.json() as unknown; ... }` reading `tag_name` and `html_url` as strings; return `none` unless `isNewer(tag, current)` and `new URL(html_url).href.startsWith(RELEASES_PAGE)` (parsed: PR #37 review F5); `update.version` is the tag without a leading `v`. `catch { return none; }`.
  - `fetchImpl` type: `(url: string, init: RequestInit) => Promise<Response>` (avoids Bun's `typeof fetch` extra members).
- **PATTERN**: `src/server.ts:248` default-parameter injection.
- **GOTCHA**: never reject: a rejected promise stored in `ServerOptions` and awaited in a route would 500 the page. The whole body sits in one `try`. Do not log on failure (a family offline every day would see noise); one `console.error` line is acceptable only for a non-404 status if you want it, not required.
- **GOTCHA**: `RELEASES_PAGE` check is on the page URL the feed returns, not on `feedUrl`; tests use a loopback feed URL but must return an `html_url` under `RELEASES_PAGE` for the positive case.
- **VALIDATE**: `bunx tsc --noEmit && bunx biome check src/updates.ts`
- **SATISFIES**: AC 2, AC 3.

### Task 2 — CREATE `src/updates.test.ts`

- **IMPLEMENT**: a `withFeed(handler, fn)` helper around `Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler })`. Cases:
  1. `isNewer`: `v0.2.0` > `0.1.0`; `0.10.0` > `0.9.9`; equal false; older false; `v1.0` / `latest` / `""` false.
  2. `dev` never fetches: pass a `fetchImpl` that throws; result `{ version: "dev", update: null }`.
  3. Newer tag → `{ version: "0.1.0", update: { version: "0.2.0", url: RELEASES_PAGE + "tag/v0.2.0" } }`.
  4. Same tag → `update: null`. Older tag → `null`.
  5. 404, 403, 500 → `null` (one `test.each`).
  6. Body `not json` with 200 → `null`; body `{}` → `null`; `tag_name: 3` → `null`.
  7. `html_url: "https://evil.example/x"` with a newer tag → `null` (D8).
  8. Hang: handler returns `new Promise(() => {})`; `timeoutMs: 100`; resolves `null` within 2,000 ms (`expect(elapsed).toBeLessThan(2000)`).
  9. Connection refused: feed URL `http://127.0.0.1:<port of a stopped server>` → `null`.
- **GOTCHA**: a hanging handler keeps the fake server busy; `server.stop(true)` force-closes it in `finally`.
- **VALIDATE**: `bun test src/updates.test.ts`. Mutation check: change `if (!r.ok) return none` to skip the status check → case 5 goes red (the 404 body has no `tag_name`, so also run case 5 with a 500 whose body is `{"tag_name":"v9.9.9","html_url":"<RELEASES_PAGE>tag/v9.9.9"}` so the status check is what saves it). Record both results.
- **SATISFIES**: AC 2, AC 3.

### Task 3 — UPDATE `src/events/check.ts`: `refusalLines` and D2

- **IMPLEMENT**:
  - `export function refusalLines(fallen: Fall[]): string[]` returning exactly the three-part text now in `scripts/replay-check.ts:17-26` (headline, one `  topic: saved X, now Y` per fall, the "Nothing was changed…" line).
  - `write(dataDir, state, raw: unknown)`: `if (JSON.stringify(raw) === JSON.stringify(state)) return;` before `copyState`. `replayCheck` keeps `const raw = readStoredState(dataDir)` and passes it to `project(raw)` and to every `write` call.
  - D1a: `const before = stored.lines > lines.length ? null : stored.lines === lines.length ? now : replay(lines.slice(0, stored.lines));` (replay is a pure function of its lines, so the two are equal by construction).
- **GOTCHA**: the refusal branch (`:116`) must still write nothing; D2 does not touch it.
- **GOTCHA**: `JSON.stringify(state)` of the `State` returned by `replay` versus the parsed file: identical only when the file was written by `writeState`. A hand-edited `state.json` with reordered keys rewrites once, which is correct.
- **VALIDATE**: `bun test src/events/check.test.ts` (existing tests stay green, including `:65` and `:102`).
- **SATISFIES**: AC 4, AC 5.

### Task 4 — UPDATE `src/events/check.test.ts` and `scripts/replay-check.ts`

- **IMPLEMENT**:
  - Test "an unchanged state is not rewritten and the backup survives": `replayCheck` once; overwrite `state.json` with the replayed state plus an extra key `"old": true` (same `lines` and `hash`, simulating a previous shape); `replayCheck` → `state.prev.json` contains `"old": true`; `replayCheck` again → `state.prev.json` still contains `"old": true` and `state.json`'s mtime is unchanged (`fs.statSync(...).mtimeMs`).
  - Test `refusalLines` on two falls: exact array equality with the script's current text.
  - `scripts/replay-check.ts`: replace the inline `console.error` block with `for (const line of refusalLines(result.fallen)) console.error(line);`.
- **VALIDATE**: `bun test src/events/check.test.ts scripts/scripts.test.ts`. Mutation: delete the D2 early return → the new backup test goes red on the second call; `:65`/`:102` stay green. Record both.
- **SATISFIES**: AC 5.

### Task 5 — UPDATE `src/server.ts`: `checkOnStart`, `/api/update`, `main`

- **IMPLEMENT**:
  - `import { checkForUpdate, RELEASES_FEED, type UpdateInfo, VERSION } from "./updates";` and `refusalLines, replayCheck` from `./events/check`.
  - `ServerOptions`: add `update?: Promise<UpdateInfo>; // the start-up feed check; absent → no update`.
  - ```ts
    /** Runs the replay check before anything is served; false when this build would lower a saved rung. */
    export function checkOnStart(dataDir: string, log: (line: string) => void = console.error): boolean
    ```
    `result.ok` → log each `changes` line, return true; else log `refusalLines(result.fallen)`, return false.
    Logs go to stderr: `--mcp` stdout is JSON-RPC only.
  - Route in `apiRoutes`: `"/api/update": { GET: (req: Request) => getUpdate(req, update) }` with
    `async function getUpdate(req, update?)`: `refuseForeign`, then `json(200, await (update ?? Promise.resolve({ version: VERSION, update: null })))`.
  - `main`, in this order: `if (Bun.argv.includes("--version")) { console.log(VERSION); process.exit(0); }` as the first statement inside the `if (import.meta.main)` block, before `appRoot()`; then root check, topics, `dataDir`, pack; then `if (!checkOnStart(dataDir)) process.exit(1);`; then `startServer`. In the non-MCP branch only: `const update = checkForUpdate(VERSION, RELEASES_FEED)` created **before** `startServer` and passed as `update` (the call returns a promise at once and does not delay `Bun.serve`). The MCP branch passes no `update`.
- **PATTERN**: `readRoute` (`:157-172`) for shape; `dayRoute` (`:119-138`) for an async route.
- **GOTCHA**: `checkOnStart` must precede `startServer`: once serving, `/api/state` → `currentState` rewrites `state.json` on a hash mismatch (`src/api/state.ts:10`), destroying the comparison.
- **GOTCHA**: `process.exit(1)` on refusal: `Start.bat` ends in `pause` and the macOS Terminal window stays open, so the parent can read the message (`launchers/Start.bat`).
- **GOTCHA**: the key-leak walk (`src/server.test.ts:364-385`) now includes `/api/update`; with no `update` in `opts` it resolves at once, so no change to that test is expected. Run it.
- **VALIDATE**: `bunx tsc --noEmit && bun test src/server.test.ts`
- **SATISFIES**: AC 2, AC 3, AC 4.

### Task 6 — ADD route and start tests: `src/server.test.ts`, `src/start.test.ts`

- **IMPLEMENT** in `src/server.test.ts` (reuse `withServer`, passing `update` through a variant of `withTemp` or by spreading `opts`):
  1. `/api/update` with no `update` option → 200 `{ version: "dev", update: null }`.
  2. With `update: Promise.resolve({ version: "0.1.0", update: { version: "0.2.0", url } })` → that body.
  3. Feed down does not block start: build `update` with `checkForUpdate("0.1.0", <hanging fake>, fetch, 300)`; while it is pending, `GET /api/state` answers 200 in under 200 ms; then `GET /api/update` answers `update: null`.
  4. `/api/update` with a foreign `Origin` → 403 (one line; the walk already covers it, keep only if the walk does not assert per route).
- **IMPLEMENT** `src/start.test.ts` — spawn `bun <repo>/src/server.ts` with `cwd` = a temp root holding symlinks `app` → `<repo>/app`, `content` → `<repo>/content`, and a real `data/`:
  1. `--version` → exit 0, stdout `dev\n`, no `data/` created.
  2. Refusal: copy `src/events/__fixtures__/six-weeks.jsonl` to `data/events.jsonl`, write the refusal `state.json` from `check.test.ts:50-68` (same hash, `1MA1/N12` rung bumped to 4). Spawn with no args, `stdin: "ignore"`, timeout 10 s → exit 1, stderr contains `Stopped: this version of the tutor would lower progress on 1 topic.`, `state.json` bytes unchanged, stdout does not contain `is running at`.
  3. Check runs in `--mcp` mode: log only, no `state.json`; spawn `--mcp` with `stdin: "ignore"` (EOF at once) → exit 0; `data/state.json` exists with `lines: 33`; stdout contains no non-JSON line (every non-empty stdout line `JSON.parse`s, or stdout is empty).
- **GOTCHA**: case 2 must fail on the check, not earlier: the symlinked `app/index.html` and `content/maths` make `appRoot` / `loadTopics` succeed. If `import.meta.main` code opens a browser on success, case 2 never reaches that point; case 3 is `--mcp`, which never opens one.
- **GOTCHA**: `app` and `content` are symlinks. If `loadTopics` / `loadCasePack` refuse a path that resolves outside the root, case 2 exits 1 for the wrong reason; the `Stopped:` assertion on stderr is what proves the check ran, so never weaken case 2 to an exit-code check alone. If the symlinks are refused, copy the two folders instead.
- **GOTCHA**: the spawned server binds a real port from `PORTS`; a dev server already on 4731 moves it along the ladder. Fine.
- **VALIDATE**: `bun test src/server.test.ts src/start.test.ts`. Two mutations, both run and recorded:
  (a) delete the `checkOnStart` line → case 2 goes red (the server starts and is killed by the 10 s timeout, exit code not 1) and case 3 goes red (nothing calls `read_state`, so `state.json` is never written).
  (b) move `checkOnStart` after `startServer` → cases 2 and 3 stay green, because no request reaches `/api/state` before the check. The ordering is guarded by the GOTCHA and review, not by these tests; say so in the report.
- **SATISFIES**: AC 3, AC 4.

### Task 7 — UPDATE `scripts/build.ts`: version stamp, importable staging, `assertNoData`

- **IMPLEMENT**:
  - Export `readVersion(pkgPath = "package.json"): string` — reads `version`, throws `Build needs "version": "X.Y.Z" in package.json` unless it matches `/^\d+\.\d+\.\d+$/`.
  - Export `stageFolder(stage: string, os: "windows" | "mac", folder: string, from = "."): void` — the launcher copies (`:88-91`) and the `app`/`content` copies (`:95-101`) for one OS, read from `from/launchers`, `from/app`, `from/content`, into `<stage>/<folder>`. No binaries. `copyLauncher` gains the same `folder` and `from`.
  - D3a: `folder` is `StudyTutor-${version}` everywhere `build.ts` says `"StudyTutor"` as a folder (the three `outfile`s, `copyLauncher`, the `app`/`content` copies, both `zip -qr` arguments). Binary and launcher file names do not change.
  - Export `assertNoData(entries: string[]): void` — throws naming the first entry matching `/^[^/]+\/data(\/|$)/` (a top-level folder's `data`, whatever the version).
  - Wrap the rest (tool check, `rmSync`, compile loop, zips, sizes) in `if (import.meta.main) { ... }`. Compile gains `--define`, `` `BUILD_VERSION=${JSON.stringify(version)}` `` (one argv element: `--define`, then `BUILD_VERSION="0.1.0"`).
  - After each zip: `assertNoData(listZip(zip));`, where `listZip` throws on a non-zero `unzip -Z1` exit (PR #37 review F6), and add `unzip` to the tool check.
  - End by printing `Release tag: v${version}` and `gh release create v${version} dist/StudyTutor-windows.zip dist/StudyTutor-mac.zip --title "v${version}"` (printed only).
- **UPDATE** `package.json`: `"version": "0.1.0"`.
- **GOTCHA**: `import.meta.main` is false when `scripts/build.test.ts` imports the file; nothing may run at import time (today the tool check and `rmSync(DIST)` do).
- **GOTCHA**: `--define` value must be a JS expression; `JSON.stringify("0.1.0")` gives `"0.1.0"` with the quotes. `Bun.spawnSync` passes argv directly, so no shell quoting.
- **VALIDATE**: `bun run build` (three compiles; `expected` a few minutes) then `unzip -Z1 dist/StudyTutor-mac.zip | grep -c '^[^/]*/data'` prints `0`, `unzip -Z1 dist/StudyTutor-mac.zip | head -1` prints `StudyTutor-0.1.0/`, and `unzip -o dist/StudyTutor-mac.zip -d "$SCRATCH/m" && "$SCRATCH/m/StudyTutor-0.1.0/StudyTutor-$( [ "$(uname -m)" = arm64 ] && echo arm64 || echo x64)" --version` prints `0.1.0`.
- **SATISFIES**: AC 1.

### Task 8 — CREATE `scripts/build.test.ts`

- **IMPLEMENT**:
  1. `readVersion` on a temp `package.json`: `0.1.0` ok; `1.0`, missing, `v0.1.0` throw.
  2. `assertNoData`: passes `["StudyTutor-0.1.0/", "StudyTutor-0.1.0/app/index.html"]`; throws on `StudyTutor-0.1.0/data/events.jsonl`, `StudyTutor-9.9.9/data/` and `StudyTutor-0.1.0/data`; passes `StudyTutor-0.1.0/content/maths/data-handling.json` and `StudyTutor-0.1.0/app/data/x` (only a top-level folder's `data` is refused).
  3. `stageFolder(tmp, "mac", "StudyTutor-0.1.0")` holds `StudyTutor-0.1.0/app/index.html`, `StudyTutor-0.1.0/content/maths/topics.json`, `StudyTutor-0.1.0/Start.command` (mode `0o755` on POSIX), and no `StudyTutor-0.1.0/data`.
  4. **The documented update keeps `data/` (D3):** stage `StudyTutor-0.1.0` and `StudyTutor-0.1.1` for `mac` side by side in one temp dir (D3a: distinct names, so nothing collides); in `StudyTutor-0.1.0/data` write ten events with `appendEvent`, a `config.json` via `writeDataFile`, and `state.json` via `replayCheck`; hash every file under `data/` (sha256 of bytes, keyed by relative path); perform the README steps as filesystem calls: `fs.cpSync(StudyTutor-0.1.0/data, StudyTutor-0.1.1/data, { recursive: true })`; the hash maps under both `data` folders equal the first; then `replayCheck(StudyTutor-0.1.1/data)` is `ok` with `changes: []` and the new hash map is still equal (D2: an unchanged state is not rewritten).
  5. The zip of a staged tree holds no `data/` even when a `data/` exists beside the sources: a temp source root with `app`, `content`, `launchers` symlinked to the repo's and a real `data/events.jsonl`; `stageFolder(stage, "mac", "StudyTutor-0.1.0", sourceRoot)`; `zip -qr` the stage; `assertNoData(unzip -Z1 list)` passes. Skip with `test.skipIf(Bun.which("zip") === null)`.
- **VALIDATE**: `bun test scripts/build.test.ts`. Mutation: make `stageFolder` also copy `data` → cases 3 and 5 go red; case 4 stays green (it copies data explicitly). Record both.
- **SATISFIES**: AC 1, AC 5.

### Task 9 — CREATE `app/update.js`, UPDATE `app/index.html`, `app/style.css`

- **IMPLEMENT** `app/update.js`:
  ```js
  // Shows one line when the start-up check found a newer release. Included by index.html and the map (T6).
  fetch("/api/update")
    .then((r) => (r.ok ? r.json() : null))
    .then((u) => {
      if (!u?.update) return;
      const link = document.createElement("a");
      link.href = u.update.url;
      link.textContent = "A parent can download it here";
      const line = document.createElement("p");
      line.className = "update";
      line.append(`Version ${u.update.version} of the tutor is out. `, link, ".");
      document.querySelector("main")?.prepend(line);
    })
    .catch(() => {});
  ```
  `app/index.html`: `<script src="/update.js" defer></script>` as the last element before `</body>` (D11). `app/style.css`: one `.update` rule, last in the file, using existing tokens (read the file's variables first; no new colours). If `app/map.html` is on `main` (D11 check), add the same tag to it.
  If `@happy-dom/global-registrator` is on `main`, add `app/update.test.ts` mirroring T6's DOM test setup: stub `fetch` to return `{ version: "0.1.0", update: { version: "0.2.0", url } }` → one `p.update` prepended to `main` with the link's `href` equal to `url`; `update: null` → no `p.update`; `fetch` rejecting → no element and no throw; a version string `<b>x</b>` renders as text (no `b` element), which pins the no-`innerHTML` rule.
- **GOTCHA**: pupil-facing text: pass the line through `no-ai-slop` then `humanizer` (CLAUDE.md "Prose is a gate"); no exclamation marks, sentence case, British English. If the wording changes, change it in Task 2/6 fixtures only if they assert text (they should not).
- **GOTCHA**: no `innerHTML` (D8).
- **VALIDATE**: `bunx biome check app/update.js app/index.html` and Level 4 step 2.
- **SATISFIES**: AC 2.

### Task 10 — ADD `restrictToOwner` (#29): `src/events/append.ts`, `src/config.ts`, tests

- **IMPLEMENT** in `src/events/append.ts`:
  ```ts
  type Spawn = (cmd: string[]) => { exitCode: number | null };
  /** Windows ignores 0600, so the file takes the folder's ACL: drop inheritance, grant only this account (#29). */
  export function restrictToOwner(file: string, platform: NodeJS.Platform = process.platform,
    spawn: Spawn = (cmd) => Bun.spawnSync(cmd, { stdio: ["ignore", "ignore", "pipe"] }),
    user = os.userInfo().username): void
  ```
  No-op unless `platform === "win32"`. Runs `["icacls", file, "/inheritance:r", "/grant:r", `${user}:F`]`; on a non-zero exit or a throw, `console.error("Could not limit data/config.json to this account; other accounts on this PC may be able to read the key.")` (D9).
  `src/config.ts:282`: after `writeDataFile(dataDir, CONFIG_FILE, …)`, `restrictToOwner(resolveInData(dataDir, CONFIG_FILE));`. Also on each start, through `restrictConfigOnStart` before `checkOnStart`: a copied `data` loses the ACL (PR #37 review F2).
- **TESTS** (`src/events/append.test.ts` or `src/config.test.ts`, whichever holds the config-write tests): darwin → spawn never called; win32 → called once with exactly the argv above for a given `user`; win32 with a spawn returning exit 5 → no throw.
- **GOTCHA**: `user` default comes from `os.userInfo()`, not an environment variable (memory: the hook blocks that substring in heredocs; also `USERNAME` can be absent in a service context).
- **GOTCHA**: applied after `writeDataFile` returns, so it covers both the rename and the Notepad copy fallback (`append.ts:183-192`).
- **VALIDATE**: `bun test src/events/append.test.ts src/config.test.ts`. The property (second account denied) is owed by #34.
- **SATISFIES**: AC 7 (Mac half), #29.

### Task 11 — Re-time the start check after D1a

- **IMPLEMENT**: no code. In two fresh scratch dirs: `bun <worktree>/scripts/synth-events.ts --n 5000 --seed 1` and `--n 50000 --seed 1`. In each, write `t.ts` with the Write tool: `import { replayCheck } from "<worktree>/src/events/check.ts"; for (const l of ["first", "second", "third"]) { const t = performance.now(); replayCheck("data"); console.log(l, Math.round(performance.now() - t)); }` and run `bun t.ts`. Record the three numbers per log as `observed` with the machine, next to D1's planning table.
- **GOTCHA**: `synth-events.ts` refuses `--data`; run it from the scratch dir so it writes `./data` (`scripts/scripts.test.ts:48-54`). The hook blocks `rm -rf`: use a new scratch dir per run.
- **VALIDATE**: the 2nd and 3rd calls on the 50,000 log are at or under the 1st call's time (+10 %), about half of the planning table's 1,085 / 928 ms. If they are not, D1a did not take effect: check `stored.lines === lines.length` is reached.
- **SATISFIES**: D1, AC 4.

### Task 12 — CREATE `README.md`, UPDATE `launchers/README.txt`, CREATE `docs/setup-mac.png`

- **IMPLEMENT** `README.md` (parent audience; sections in this order):
  1. One paragraph: what it is (GCSE maths practice on your own computer; works with no AI model; the parent's key stays on the PC).
  2. Download: `https://github.com/linardsb/study-tutor/releases/latest/download/StudyTutor-windows.zip` and `…/StudyTutor-mac.zip` (D5; #35 confirms they resolve).
  3. First start on a Mac: extract, open `StudyTutor`, double-click `Start.command`; the "cannot be verified" dialog → Done → System Settings → Privacy & Security → Open Anyway → open again (S1). Image `docs/setup-mac.png`.
  4. First start on Windows: Extract All, `Start.bat`, "Windows protected your PC" → More info → Run anyway.
  5. Setup page: pick a provider and paste the key, or pick "No model"; the monthly cap. Match the labels in `app/setup.html` exactly (read it).
  6. Updating (D3): the five steps from Solution 5 (copy, not move; delete the old folder last), plus "Do not copy the new folder over the old one." and "If the tutor asks for setup again, you started the new folder without its data folder: close it and do step 3." and "The Mac or Windows warning from the first start comes back after each update; answer it the same way." and "If the tutor stops with 'this version of the tutor would lower progress', start the old folder again and tell us."
  7. Where the records live: the `data` folder; copy it somewhere to back it up; never share `config.json` (it holds the key).
  8. Stopping the tutor.
  9. A time budget line per step, labelled as an estimate (E2 measures the real one; `expected`, summing to 30 minutes or less).
  Licence line: omit until Q6 decides (note in the PR body).
- **UPDATE** `launchers/README.txt`: step 1 now reads "You should have a folder called StudyTutor followed by a version number, for example StudyTutor-0.1.0." (D3a); keep the other numbered steps and OS notes; add a short "Updating" block with the same five steps, and "Your progress is in the data folder."
- **CREATE** `docs/setup-mac.png` (needs a person at the screen, the user is present): `bun run build`; `mkdir -p "$SCRATCH/shot" && unzip -q dist/StudyTutor-mac.zip -d "$SCRATCH/shot"`; `xattr -w com.apple.quarantine "0081;$(printf %x "$(date +%s)");Safari;" "$SCRATCH/shot/StudyTutor-0.1.0/Start.command"`; `open "$SCRATCH/shot/StudyTutor-0.1.0/Start.command"` (Gatekeeper blocks it and shows "cannot be verified"); **the one human action:** the user clicks Done, then in System Settings (opened by `osascript -e 'tell application "System Settings" to quit'`, then `open "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension"`, then poll `osascript -e 'tell application "System Settings" to get name of window 1'` until it prints `Privacy & Security`; `observed`: without the quit, the URL leaves System Settings on the last sub-pane, "Screen & System Audio Recording") scrolls to the Security section showing "Start.command was blocked" and Open Anyway, and says "ready". Then capture the System Settings window only, non-interactively: write `$SCRATCH/wid.swift` with the Write tool —
  ```swift
  import CoreGraphics
  let name = CommandLine.arguments[1]
  let list = CGWindowListCopyWindowInfo([.optionOnScreenOnly], kCGNullWindowID) as! [[String: Any]]
  for w in list where (w[kCGWindowOwnerName as String] as? String) == name && (w[kCGWindowLayer as String] as? Int) == 0 {
    print(w[kCGWindowNumber as String]!); break
  }
  ```
  — then `screencapture -x -o -l"$(swift "$SCRATCH/wid.swift" "System Settings")" docs/setup-mac.png`. `observed` at planning: the script returned a window id for Finder and `screencapture -x -o -l<id>` wrote a 1211×708 window-only PNG with its contents (so this Terminal has Screen Recording permission). Read the PNG back and check it shows no user name, file path outside the scratch folder, or other app; crop with `sips` if needed. Do not click Open Anyway (it would whitelist the scratch copy only, harmless, but not needed).
  Fallback only if the user is away: leave the `README.md` image line out, keep the text steps, and add "screenshot owed" to #35.
- **GOTCHA**: all prose passes `no-ai-slop` then `humanizer` before save; British English; no emoji; sentence case headings.
- **GOTCHA**: do not write "right-click → Open" anywhere (D4).
- **VALIDATE**: `bunx biome check .` (Markdown is not linted; check links by eye) and `grep -n "right-click" README.md launchers/README.txt` returns nothing.
- **SATISFIES**: AC 6.

### Task 13 — Manual validation (Level 4) and execution report

- **IMPLEMENT**: run Level 4 steps 1–5, record each result `observed` with the command, in `.claude/execution-reports/t11-distribution-and-updates.md`.
- **SATISFIES**: AC 1–6.

---

## TESTING STRATEGY

### Unit Tests

- `src/updates.test.ts`: `isNewer`, every "no update" outcome of `checkForUpdate`, the positive case, the hang bounded by the timeout (Task 2).
- `src/events/check.test.ts`: `refusalLines` text; D2 keeps the backup (Task 4).
- `scripts/build.test.ts`: `readVersion`, `assertNoData`, `stageFolder` (Task 8).
- `restrictToOwner` argv and no-op off Windows (Task 10).

### Integration Tests

- `src/server.test.ts`: `/api/update` through a real `Bun.serve`; a pending feed check does not delay `/api/state` (Task 6, case 3).
- `src/start.test.ts`: the real `src/server.ts` entry spawned the way `Start.command` runs the binary (cwd = the app folder, no args), refusal exits 1 before serving; `--mcp` runs the check with clean stdout (Task 6).
- `scripts/build.test.ts` case 4: the parent's update procedure on a temp tree, hash-compared (Task 8).

No socket or realtime path in this ticket.

### Edge Cases

| Edge case | Where verified |
|---|---|
| Feed 404 (private repo, no release yet) | `src/updates.test.ts` case 5 |
| Feed 403 (rate limit) | `src/updates.test.ts` case 5 |
| Feed hangs | `src/updates.test.ts` case 8; `src/server.test.ts` case 3 |
| Offline (connection refused) | `src/updates.test.ts` case 9 |
| Junk body, missing fields | `src/updates.test.ts` case 6 |
| Hostile `html_url` | `src/updates.test.ts` case 7 |
| `0.10.0` vs `0.9.9` | `src/updates.test.ts` case 1 |
| `dev` build makes no request | `src/updates.test.ts` case 2 |
| New build lowers a rung | `src/start.test.ts` case 2 |
| `--mcp` stdout stays JSON-only with the check's output | `src/start.test.ts` case 3 |
| Second start of v2 keeps the pre-update `state.prev.json`, also after lines appended without a state write | `src/events/check.test.ts` (Task 4; PR #37 review F1) |
| `data/` at the repo root at build time | `scripts/build.test.ts` case 5 |
| Folder named `data-…` inside content is not refused | `scripts/build.test.ts` case 2 |
| Parent forgets to copy `data` | README step text; old folder untouched by construction (D3); Level 4 step 3b |
| `state.json` open in Notepad during a write | owed by #34 |
| Two appends at once on Windows | owed by #34 (POSIX half: `src/events/append.test.ts:210-225`, already green) |
| Second Windows account reads `config.json` | owed by #34 |
| Real GitHub feed shows the line | owed by #35 |

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
bunx tsc --noEmit
bunx biome check .
```

### Level 2: Unit Tests

```bash
bun test src/updates.test.ts src/events/check.test.ts scripts/build.test.ts src/events/append.test.ts src/config.test.ts
```

### Level 3: Integration Tests

```bash
bun test src/server.test.ts src/start.test.ts scripts/scripts.test.ts
bun run check          # the gate: tsc + biome + every test
bun scripts/test-generators.ts
```

### Level 4: Manual Validation

`$SCRATCH` is the session scratchpad. Every step uses only what this ticket ships.

1. **Stamp and zips.** `bun run build`. Output ends with `Release tag: v0.1.0` and the `gh release create` line. `unzip -Z1 dist/StudyTutor-windows.zip | grep -c '^[^/]*/data'` → `0`; same for mac; the first entry of each is `StudyTutor-0.1.0/`. Extract the mac zip to `$SCRATCH/v1`; the binary for this Mac with `--version` prints `0.1.0`.
2. **Banner.** From the worktree root:
   `bun -e 'import {startServer} from "./src/server.ts"; import {saveSetup} from "./src/config.ts"; import {loadTopics} from "./src/content/pack.ts"; const root=process.cwd(); const dataDir="'$SCRATCH'/banner-data"; console.log(saveSetup(dataDir,{preset:"none",weeklyTarget:3})); const s=startServer([0],{root,dataDir,topics:await loadTopics("maths",root),update:Promise.resolve({version:"0.1.0",update:{version:"0.2.0",url:"https://github.com/linardsb/study-tutor/releases/tag/v0.2.0"}})}); console.log(s.port)'`
   (leave running; `saveSetup` must print `ok: true`, otherwise `index.html` redirects to `setup.html`, which does not load `update.js`), open `http://127.0.0.1:<port>/` with `agent-browser`, screenshot: the line reads "Version 0.2.0 of the tutor is out. A parent can download it here." above the heading, link points at the release page. Stop the process. Then `bun run dev` (version `dev`): no line, and `curl -s 127.0.0.1:<port>/api/update` → `{"version":"dev","update":null}`.
3. **Update keeps progress (Mac leg of the ticket's manual test).**
   a. In `$SCRATCH/v1/StudyTutor-0.1.0`, start the binary; complete the setup page with "No model"; answer ten items in Practice (ten `attempt` lines). Stop it. `shasum -a 256 data/*` → save.
   b. Set `package.json` version to `0.1.1` locally (do not commit), `bun run build`, extract to `$SCRATCH/v2`. Copy `dist/StudyTutor-mac.zip` (v2) into `$SCRATCH/v1` and extract it there with Archive Utility (`open -W -a "Archive Utility" StudyTutor-mac.zip`, or a double-click; never `unzip`, which never offers Replace and would pass either way). Confirm `StudyTutor-0.1.1` sits beside `StudyTutor-0.1.0` with no prompt (D3a). First start `$SCRATCH/v2/StudyTutor-0.1.1` with **no** `data`: the setup page appears (the README's "forgot step 3" case); stop it and delete `$SCRATCH/v2/StudyTutor-0.1.1/data` (Finder, Move to Bin).
   c. Follow the README update steps literally with Finder: right-click `data` in `$SCRATCH/v1/StudyTutor-0.1.0`, Copy, then Paste in `$SCRATCH/v2/StudyTutor-0.1.1`. `shasum -a 256 data/*` in both v1 and v2 matches the saved list. Start v2: `--version` says `0.1.1`; the page shows the same practice progress; `curl -s 127.0.0.1:<port>/api/state` has the same `lines`, `hash`, every topic's `rung` and `xp.total` as v1's saved `state.json` (`jq '{lines,hash,xp:.xp.total,rungs:(.topics|map_values(.rung))}'` on both, then `diff`). No fixed count: a practice attempt also appends an `xp` line (`src/api/event.ts:48`).
   d. Revert `package.json` to `0.1.0`.
4. **Refusal on start.** In a scratch copy of v2's folder, edit `data/state.json` to raise one topic's `rung` by 1 without touching `lines`/`hash`. Double-click `Start.command`: the Terminal window shows "Stopped: this version of the tutor would lower progress on 1 topic." and the browser does not open; `state.json` is unchanged.
5. **Feed down.** Turn Wi-Fi off, start v2 from Level 4 step 3: the page opens as normal and shows no update line; `/api/update` answers within about 5 s with `update: null`.

### Level 5: Additional Validation (Optional)

- `bun run build` then `spctl -a -vv -t exec` on a quarantined copy of each mac binary still reports `rejected, source=no usable signature` (S1's verdict; the ad-hoc re-sign is unchanged).

---

## ACCEPTANCE CRITERIA

- [ ] AC 1 — `bun run build` stamps `package.json`'s version into all three binaries (`--version`), writes both zips with `app/` and `content/`, and fails if either zip holds a top-level `data` entry; the folder inside each zip is `StudyTutor-<version>` (D3a). (Task 7, 8; Level 4 step 1)
- [ ] AC 2 — `src/updates.ts` reads the releases feed once per page-mode start (the only outbound call beyond the provider) and the landing page shows the update line when a newer release exists. (Tasks 1, 2, 5, 9; Level 4 step 2) Live GitHub leg owed by #35.
- [ ] AC 3 — the releases feed being down, slow, rate-limited or junk does not block start or any page. (Task 2 cases 5–9; Task 6 case 3; Level 4 step 5)
- [ ] AC 4 — `replayCheck` runs on every start before anything is served; a refusal exits 1 with the plain message and writes nothing. (Tasks 5, 6; Level 4 step 4)
- [ ] AC 5 — an update never touches `data/`: the zips carry none, and the README procedure keeps every file's hash on a temp tree; the second start on a new version keeps the pre-update `state.prev.json`. (Tasks 4, 8)
- [ ] AC 6 — `README.md` gives the download, first start on Mac (with `docs/setup-mac.png`) and Windows, setup page and update path; `launchers/README.txt` carries the update steps. (Task 12) Screenshot owed by #35 only if the user is unavailable.
- [ ] AC 7 — #29: on win32, saving the config runs `icacls … /inheritance:r /grant:r <user>:F` (tested by argv on the Mac). Property on a PC owed by #34.
- [ ] Manual update test on Windows, Notepad-open `state.json`, two appends at once on Windows: owed by #34.
- [ ] `bun run check` green; `bun scripts/test-generators.ts` green.

---

## COMPLETION CHECKLIST

- [ ] Tasks 0–13 done in order, each VALIDATE run and recorded
- [ ] Every mutation check in Tasks 2, 4, 6, 8 run both ways and recorded
- [ ] `bun run check` green (observed, named in the report)
- [ ] Level 4 steps 1–5 recorded `observed`
- [ ] README and banner text passed `no-ai-slop` then `humanizer`
- [ ] PR body: guard restatement (no job, prompt or MCP file touched), D4 and D3/D3a divergences from the issue text and D10's wording (Q2), Q6 assumption, #34 and #35 as owed (write "Refs #34, #35", never a negated close keyword: memory says "does not close #N" still closes it)

---

## OPEN QUESTIONS / ASSUMPTIONS

- **Q1 (user's call, PRD Q6): where do public releases live?** Options: make `linardsb/study-tutor` public
  (with a licence), or keep it private and publish zips from a separate public repo (for example
  `linardsb/study-tutor-releases`). This plan assumes the first; the second changes only `RELEASES_FEED`,
  `RELEASES_PAGE` and the README links. Nothing is published by this ticket. Owed by #35.
- **A1** Version starts at `0.1.0` (`expected`: no release exists; the first public zip is v0.1.0).
- **A2** Worst case of the every-start check: closed by D1's table and D1a. At 4.9 MB (the architecture's
  multi-year size) the start pays ~0.7 s once (`derived` from the `observed` 1st-call column). Beyond that it
  grows linearly with the log; no further optimisation in this ticket.
- **A3** Worst case of the fire-and-forget feed call: the check never settles. It cannot: `AbortSignal.timeout`
  aborts the fetch and the body read, and `checkForUpdate` catches everything. Worst case for the page is a
  5 s wait on `/api/update`, which the page does not wait on (the fetch is async, `defer`red).
- **A4** Worst case of the procedure, before D3a: the parent drags the new folder over the old one and
  chooses Replace, deleting the old `data`. After D3a the two folders never share a name, so no OS offers
  Replace; the remaining failure is the parent forgetting step 3, which is safe (the new folder opens the
  setup page, the old folder still holds everything, and the README names the fix).
- **A5** The page receives `update.url` already validated (D8); the banner does not re-check it.
- **A6** Level 4 step 3c compares v2's state with v1's saved state instead of a fixed line count, because
  attempts also write `xp` lines (`src/api/event.ts:48`) and later tickets may add more.
- **Q2 (user's call): amend D10's wording?** D10 says an update "replaces `StudyTutor`, `app/` and
  `content/`", and the ticket's manual test says "replace the binary and folders with v2". D3/D3a change the
  mechanism to a new versioned folder with `data` copied in; the property D10 protects (`data/` never
  touched by an update) holds, and the architecture tree still draws `StudyTutor/`. Proposed: the PR body
  lists it as a divergence beside D4, and a one-paragraph amendment to D10 lands in the same PR if you agree.

## NOTES (open canvas)

**Planning spikes (all `observed` on the dev Mac, Bun 1.3.4, 2026-09-28), each closing an assumption the
tasks rely on:**

| Assumption | Run | Result |
|---|---|---|
| `--define` stamps a compiled binary; source run sees `dev` | `bun build --compile --define 'BUILD_VERSION="0.2.0"'` on a 3-line file | `dev` from source, `0.2.0` from the binary |
| `AbortSignal.timeout` ends a hung response and a stalled body | loopback `Bun.serve` that never answers / sends 6 bytes then stalls; `timeout(200)` | `TimeoutError` at 202 ms both; refused port throws `Error` |
| `start.test.ts` can use a symlinked root and `--mcp` with closed stdin | `app`, `content` symlinked, six-weeks log, `Bun.spawn([... "--mcp"], { stdin: "ignore" })` | exit 0, stdout empty, one stderr line |
| Feed answers for a private repo | `curl` the `releases/latest` URL | 404 (handled as "no update") |
| Every-start cost | D1 table | 62–1,085 ms by log size; D1a halves the usual case |
| Biome flags `x!` | `biome lint` on a file with `a!.length` | `lint/style/noNonNullAssertion` |
| `unzip` present for `assertNoData` | `which unzip` | `/usr/bin/unzip` |
| Window-only screenshot without a click | `swift` window-id script + `screencapture -x -o -l<id>` | 1211×708 PNG of the window contents |
| The Privacy & Security page opens by URL, and its window id resolves | quit System Settings, `open x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension`, poll window title, window-id script | title `Privacy & Security`, id returned; without the quit it stayed on "Screen & System Audio Recording" |
| Versioned root folders never collide in Archive Utility (D3a) | two zips with roots `X-0.1.0/`, `X-0.1.1/`, `open -W -a "Archive Utility"` each in one folder, then the first again | `X-0.1.0` and `X-0.1.1` side by side, re-extract gave `X-0.1.0 2`, no Replace prompt |
| Level 4 step 2 harness can seed a "No model" config | `saveSetup(dir, { preset: "none", weeklyTarget: 3 })` | `ok: true` |
| Practice writes only `attempt` lines | grep `appendEvent` in `src/api`, `src/flow` | false: `src/api/event.ts:48` also appends `xp`; step 3c compares states instead |

Remaining unknowns, none of which the Mac can answer, are owned: Windows behaviour by #34, the live feed and
public links by #35 (after Q6).

**Rejected: a sibling-folder hint** (the new folder, started without `data`, looks for `../StudyTutor-*/data`
and says "copy it here"). It reads outside `data/`, which CLAUDE.md's confinement rule is written against,
to cover a case D3a already makes safe.

**Rejected: env override for the feed URL.** Would let a manual test point the binary at a local fake, but it
ships a way to change the binary's outbound target. The `update` option in `ServerOptions` plus a `bun -e`
harness (Level 4 step 2) gives the same visual check with nothing extra in the binary.

**Rejected: a `data/last-version` file to run the check only after an update.** A new file in `data/`, a new
write path, and a rule about when it is trusted, to save two replays per start (D1).

**Rejected: the binary downloads and swaps itself.** D10: no auto-update in v1.

**Size**, `expected`: `src/updates.ts` ~70, `src/server.ts` +45, `check.ts` +20, `append.ts`/`config.ts` +25,
`scripts/build.ts` +50, `app/update.js` 18, tests ~300, `README.md` ~110, `launchers/README.txt` +10: about
650, the top of the ticket's 400–600 because of the start-sequence tests.

**Why stable zip names matter.** `releases/latest/download/StudyTutor-mac.zip` only works if every release
uses the same asset names; a versioned name would break the README link on every release.

## CONFIDENCE

**10/10 for one-pass implementation of the Mac-verifiable scope.** Every assumption a task depends on is
`observed` in the planning spikes table above (the Windows Explorer behaviour in D3a stays `expected` and is
owned by #34); the four risks from the first draft are closed in the plan:
R1 by D1's timing table and D1a, R2 by D3a (a version in the folder name, so no Replace), R3 by D11's
append-last rules and the T6 check at Task 0, R4 by the non-interactive window capture. What stays outside
this score is not implementation risk but verification that needs other hardware or a decision: #34
(Windows), #35 (public feed, gated on Q6).

## AMENDMENTS

- 2026-09-28 — Risks closed before implementation, at the user's request: D1 timing `observed` (5,000 and
  50,000 events) plus D1a (reuse the full replay when no lines were added); D3a versioned folder inside each
  zip, which removes the Replace path and rewrites A4; D11 settled against T6's actual plan and worktree
  (append-last rules, `map.html` tag, optional happy-dom test); Task 12 screenshot made non-interactive
  apart from one Done-and-scroll by the user; planning spikes table added; confidence 7 → 10.
- 2026-09-28 — Advisor pass: Archive Utility, System Settings URL and the step 2 harness run and added to the
  spikes table; step 3b uses Archive Utility, not `unzip`; step 3c compares states (attempts also write `xp`);
  Q2 added on D10's wording.
- 2026-09-28 — Implementation, superseding these task lines (detail: `.claude/reports/t11-distribution-and-updates-report.md`):
  - Task 5: `--version` is handled before the `try`; `--mcp` is read up front and `update` is
    `mcp ? undefined : checkForUpdate(...)`, because `startServer` runs before the MCP branch splits.
  - Task 6 case 3: asserts `/api/state` answers while the feed promise is unsettled (a flag), not a 200 ms
    bound. `src/start.test.ts` case 2 carries a 15 s test timeout, past the spawn's 10 s.
  - Task 8 case 4: ten `usage` events, not attempts.
  - Task 9: no DOM test and no `map.html` tag (neither happy-dom nor `map.html` on `main`); T6 owes the tag.
  - Task 12: the "right-click" grep returns the Copy step (Solution 5's wording); the D4 check is "no
    right-click Open". README says "parts that need a model" (no chat panel yet), "If the Mac asks once more,
    choose to open it", "Paste" / "Paste Item", 15 minutes for one parent, 41 MB / 47 MB zips, and that Key
    and Tokens per month appear only after a provider is picked. Screenshot cropped to the Security block.
  - Level 4: step 2 both halves via the harness; step 3c `cp -Rp` (Finder scripting refused, -1743);
    step 4 via `./Start.command` from the shell; step 5 not run (owed to a person).
