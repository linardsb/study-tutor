# Feature: T13 O3 Examiner mode: phone camera route, vision mark, marks left on the table

The following plan should be complete, but validate documentation, codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils, types and models. Import from the right files.

Work in the worktree `~/Desktop/study-tutor-t13` on `feature/t13-examiner-mode` (cut from `origin/main` at `ab1ddd9`). The main checkout's `main` is 5 commits behind and has uncommitted edits that belong to another session; do not pull there.

## Feature Description

The pupil photographs handwritten working for the question they just attempted. The map shows a QR code for a one-time link on the PC's Wi-Fi address; the phone opens it, takes the photo and sends it. The binary saves the photo under `data/intake/`, sends it with the item's mark scheme to a vision model through the existing provider seam, and gets marks per line back: method and accuracy marks, then three presentation checks (final answer shown, units, a sensible size). It never gets or shows a solution. The result is a `photo` event carrying the marks. Replay sums marks per ISO week, so the map shows "marks left on the table" this week against last week and a count of clean sheets (all presentation checks earned). With no vision model the photo is still saved and recorded, and the page says it is stored and not marked yet. When the phone cannot reach the PC, the same page on the PC takes a dropped file.

## User Story

As a GCSE pupil who loses marks on presentation and slips rather than method
I want to photograph my written working and have it marked line by line the way an examiner would
So that I can see where marks go, and watch that number fall week on week

## Problem Statement

Foundation examiners' reports put lost marks in execution and presentation (PRD O3). The tutor marks typed answers only. Handwritten working, where those marks go, never reaches it. The PC has the model key and the record; the camera is on the phone; and the architecture allows no relay or outbound channel (D8).

## Solution Statement

- A snap session held in memory in `src/snap.ts`: one live token at a time, minted by the map through a localhost route for the pupil's latest attempted item. The token uploads once. After the upload it can still read that snap's marking status until the snap closes. The snap closes 15 minutes after minting (10 minutes after an upload, whichever is later), when a new one is minted, or on restart.
- A second `Bun.serve` bound to the PC's private IPv4 address only, started when a snap opens and stopped with `stop(true)` when it closes. It has its own route allow-list (the snap page, its script and stylesheet, the item and status read, and the upload), its own Host and Origin check, and a 404 for everything else, `/api/*` included.
- The upload is a JSON body `{token, image: dataURL}`. The page downscales the photo on a canvas first, to at most 1568 px on the long side as JPEG 0.85. The same JSON route serves the localhost drop-a-file fallback under the unchanged `refuseForeign`. When the browser cannot decode the file (HEIC in Chrome, observed), the page sends the original if it is JPEG, PNG or WebP and under the cap, and otherwise says which formats work.
- The upload answers `202` as soon as the file is saved. Marking runs in the background, and the page polls `GET /api/snap?token=` until the status is `done`. No phone or browser request is held open for the model call, so the worst-case 240 s job cannot outlast the phone's connection.
- `src/jobs/examiner_mark.ts` is a vision job on `defineJob`. It takes a `PostAttempt` item only, `mark_scheme ?? working` as the scheme, and returns exactly five lines in a fixed order: method, accuracy, answer, units, sense. Units is `null` when the question needs none, and scores 1 in that case. So every marked photo is out of 5, the same denominator every week. Notes may quote no number that is not printed in the question.
- `src/flow/examiner.ts` picks the item (latest attempt), runs the job and builds the `photo` record. `src/snap.ts` saves the file, answers `202`, then runs the job and appends the event.
- `photo@1` gains `seed`, `marks`, `of` and `clean`. It is edited in place: no GitHub release exists (`gh release list` empty, observed 2026-09-29), and events.md allows an in-place edit until the first release whose build can append it. Replay adds `state.photos` (ISO week → sums), so the shape goes to 4.
- `POST /api/event` refuses a posted `photo`, as it refuses `xp`: the tutor writes marks, the page does not.

## Out of Scope / Non-Goals

- Not included: marking a stored-but-unmarked photo later ("mark it now" once a model is set). Decided (D-Q3): the pupil takes a new photo once a model is set. The event records the file, so a later ticket can add a re-mark without an event change.
- Not included: XP or flame credit for a photo. `xpFor` (`src/flow/xp.ts:20`) stays as is.
- Not included: photographing a named item from `quiz.js` or the chat panel. The map mints for the latest attempt only.
- Not included: writing `mark_scheme` into the maths items. No item has one (observed: `grep -c mark_scheme content/maths/items/*.json` all 0), so the job uses `working`, as `teachback_mark` does (`src/jobs/teachback_mark.ts:22-27`).
- Not included: T17's intake photo read (`intake_read`). It will share `data/intake/` and nothing else.
- Not changing: `refuseForeign` (`src/server.ts:100`), the provider module, `defineJob`'s retry table, `parseJsonReply`'s single-block rule.
- Not changing: `MCP_WRITABLE.photo` stays `false` (`src/mcp/tools.ts:42`).

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: High (a second listener on a LAN address, a vision job, an event edit, two pages)
**Primary Systems Affected**: `src/snap.ts` (new), `src/jobs`, `src/flow`, `src/events`, `src/api/event.ts`, `src/server.ts`, `app/map.*`, `app/snap.*`, `scripts/fake-provider.ts`
**Dependencies**: `uqr@0.1.3` (MIT, QR code to SVG, no dependencies of its own). The repo's first runtime dependency; `bun build --compile` bundles it. Nothing in the epic forbids one: D6 (`architecture.md:111-118`) rules out an installer and a portable runtime, not packages, and CLAUDE.md's only package rule is "no provider SDK".

## Related Work

**Implements**: #15 (T13) · **Epic**: #1 · PRD `docs/prd/study-tutor-v2.prd.md` (O3, Q10, E3) · Architecture `docs/prd/study-tutor-v2.architecture.md` (D8, D11) · Ticket file `docs/tickets/study-tutor-v2.md:251-265`

**Back-references**:

- `.claude/plans/t9-model-jobs.md`: `defineJob`, `PostAttempt`, the reply guard, the chat API shape this mirrors
- `.claude/plans/t8-setup-config-provider.md`: provider seam, `imagePart`, S2's vision probe (the prompt form this job's prompt follows)
- `.claude/plans/t6-o1-pages.md`: the map page and its DOM test
- `.claude/plans/t2-events-append-replay.md`: event versioning, `resolveInData`, `writeDataFile`

**Forward-references**:

- #41: T13 follow-up: the camera route on Windows (firewall prompt, phone reach). Owed by this ticket.
- T15 (parent digest) reads `state.photos`.
- T17 (intake doors) writes to the same `data/intake/` folder through the helper added here.

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `CLAUDE.md`: ground rules "Answer withheld by construction", "`data/` confinement", "Network", "Pupil-facing text"; "Restate the guard"
- `.claude/references/events.md`, `.claude/references/model-jobs.md`, `.claude/rules/content.md`
- `src/events/types.ts:66-70` (`PhotoV1`), `:170` (`FIELDS["photo@1"]`), `:198` (`KEYS["photo@1"]`), `:112-127` (`int`, `optInt`, `outOf`, `bool`)
- `src/events/replay.ts:36-54` (`State`, `shape: 3`), `:144-146` (photo case), `:180-196` (initial state), `:177` (`dict`)
- `src/events/append.ts:28-55` (`resolveInData`), `:93-105` (photo file must resolve inside `data/`), `:167-194` (`writeDataFile`, text only today)
- `src/events/__fixtures__/photo.v1.jsonl`: the one photo fixture; `src/events/types.test.ts:8-14` requires a fixture per event version
- `src/events/replay.test.ts:56`: `expect(s.shape).toBe(3)`
- `src/jobs/define.ts:31-34` (`postAttemptSystem`), `:46-54` (`JobSpec`), `:69-108` (run policy)
- `src/jobs/teachback_mark.ts` (the whole file): the job this one mirrors (validate, texts, sources, `fallback: () => null`)
- `src/jobs/teachback_mark.test.ts`: the test set to mirror (valid, wrong shape twice, guard, invalid JSON twice, down, preset none, prompt contents)
- `src/jobs/view.ts:18-40`: `hasAttempt` (id and seed for `#gen`), `jobItem`
- `src/jobs/guard.ts:23-34`: `guardReply`, `invented-number`
- `src/jobs/__fixtures__/provider.ts`: `withData`, `mockFetch`, `chatReply`, `down`, `sentinelItem`, `attemptLine`, `NOW`, `OPENAI`, `NO_MODEL`
- `src/providers/openai-compatible.ts:6-12` (`Part`, `Message`), `:43-49` (`imagePart`), `:35-40` (reply and timeout limits)
- `scripts/s2-run.ts:120-140`: the vision probe's post-attempt message (text part, then image part). The job's user message takes this form.
- `src/flow/chat.ts:32-69` (`findItem`), `:103-155` (`chat`: pure, returns the record for the API to write)
- `src/api/chat.ts:32-48` (`resolveItem`, `titleOf`), `:51-78` (`getChat`: named fields from `toItemView`), `:80-135` (`postChat`)
- `src/api/event.ts:26-41` (`refusal`), `src/api/event.test.ts:206-213` (the xp refusal test to mirror)
- `src/server.ts:84-113` (`json`, `refuseForeign`), `:211-259` (`IdleControl`, `server.timeout(req, 0)` for a long job), `:261-308` (`apiRoutes`), `:311-329` (`startServer`)
- `src/server.test.ts:23-57` (`withTemp`, `withServer`), `:340-395` (key-leak walk over `apiRoutes`), `:756-766` ("This is an AI" static-markup test)
- `app/map.html`, `app/map.js:150-172` (`el`, `stat`, `renderStats`), `:249-279` (`load`), `:295-305` (exports for tests)
- `app/chat.html:8-21` (`.ai-note` sticky), `app/chat.js:33-43` (figure through `DOMParser`, every model string through `textContent`)
- `src/marking/map-dom.test.ts:1-75`: happy-dom registration, fake `fetch`, `?dom` import
- `scripts/fake-provider.ts:9-21`: `contentFor`, which needs an examiner branch
- `package.json`: no `dependencies` block yet

### New Files to Create

- `src/snap.ts`: snap store, `lanAddress`, `sniffImage`, the three routes, the LAN listener
- `src/snap.test.ts`: token life, the LAN allow-list, upload paths, fallback, no-model path
- `src/jobs/examiner_mark.ts`: the vision job
- `src/jobs/examiner_mark.test.ts`: provider-mocked job tests
- `src/flow/examiner.ts`: `lastAttempt`, `examine`, `photoRecord`
- `src/flow/examiner.test.ts`
- `app/snap.html`, `app/snap.js`: the phone and drop-a-file page
- `src/marking/snap-dom.test.ts`: the snap page under happy-dom

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [uqr README](https://github.com/unjs/uqr#readme): `renderSVG(text, { border })`. Observed on 0.1.3 in planning:
  - A 60-character URL gives a 10,404-character SVG string starting `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 370 370">`.
  - `bun build --compile` of a script importing it, run with `node_modules` moved away, printed the same SVG (66 MB binary), so the compiled tutor bundles it.
  - Chrome's `BarcodeDetector` on macOS decoded the rendered SVG (drawn to a 740 px canvas) to the exact 108-character `http://192.168.1.11:52311/snap.html?token=<43 chars>` URL it was given.
- [Bun.serve](https://bun.sh/docs/api/http): `hostname`, `port: 0`, `routes`, `maxRequestBodySize`, `server.stop(true)`. Observed on Bun 1.3.4 in planning (`scratchpad/lan.ts`, `scratchpad/life.ts`):
  - A server bound to `192.168.1.11` answered on that address and refused `127.0.0.1` on the same port.
  - A route that starts a background promise and returns `202` at once: the next status read saw `marking`, and a read 400 ms later saw `done` with the result.
  - The main server's handler calling `lan.stop(true)` on the listener: the next request to it was refused, even on the keep-alive socket `fetch` had just used, and a second listener minted in the same handler served 200.
- [Node `os.networkInterfaces()`](https://nodejs.org/api/os.html#osnetworkinterfaces): `{family, address, internal}` per address. Observed on this Mac: `en1 192.168.1.11` external, `lo0 127.0.0.1` internal, `utun*` and `awdl0` with no IPv4.
- [HTML `capture` attribute](https://developer.mozilla.org/en-US/docs/Web/HTML/Attributes/capture): `accept="image/*" capture="environment"` opens the rear camera on a phone.
- Canvas encoder, observed in headless Chrome via `agent-browser` in planning (`scratchpad/canvas/page.html`, the exact `encode` in Task 16): a 4032×3024 JPEG (2.9 MB, the size of a 12 MP phone photo) became a 1568×1176 JPEG data URL of 136,063 characters, about 102 KB decoded. A 4032×3024 HEIC failed to decode (`img.onerror`), so the Task 16 fallback is required, not optional.
- [Anthropic vision limits](https://docs.anthropic.com/en/docs/build-with-claude/vision#evaluate-image-size): images over 1568 px on the long edge are resized down; per-image size limit 5 MB. `expected` (read from docs, not tested this session). The page's 1568 px bound and the 5 MB server cap come from here.

### Patterns to Follow

**Job file** (mirror `src/jobs/teachback_mark.ts`):

```ts
export const teachbackMark = defineJob<TeachbackInput, TeachbackOutput>({
  name: "teachback_mark",
  prompt, validate,
  texts: (o) => o.lines.map((l) => l.note),
  sources: ({ item, lines }) => [item.stem, ...lines, lines.map((_, i) => i + 1).join(" ")],
  fallback: () => null,
});
```

**Pure flow, API writes** (`src/flow/chat.ts:103-155` returns `record: NewEvent`; `src/api/chat.ts:117-120` appends it). `src/flow/examiner.ts` reads no clock and no file; `src/snap.ts` does the I/O.

**Route shape** (`src/server.ts:232-259`): `refuseForeign`, `server.timeout(req, 0)` for a job, `req.json()` in try/catch → 400 `"Body is not JSON"`, handler returns `{status, body}`, a throw is a logged 500 with a plain sentence.

**Error text**: pupil-facing, one plain sentence, no field echoed: `"Try the question first."` (`src/api/chat.ts:21`).

**Page code** (`app/map.js`, `app/chat.js`): an IIFE; every model string by `textContent`; nothing touches `document` at load when `document` is undefined; exports on `root.<page>` for tests; a seam object `api` the DOM test replaces.

**Tests**: `bun:test`, temp data dirs through `withData` / `withTemp`, `spyOn(console, "error")` to quiet logged refusals.

---

## IMPLEMENTATION PLAN

### Phase A: Event and storage foundation

`photo@1` fields, replay sums and shape 4, the posted-photo refusal, binary writes and the intake folder.

### Phase B: The job and the flow

**Depends on:** Phase A (the record type).

`examiner_mark` and `src/flow/examiner.ts`, the fake provider's examiner branch.

### Phase C: The snap routes and the LAN listener

**Depends on:** A and B.

`src/snap.ts`, registration in `apiRoutes`, `uqr`.

### Phase D: Pages

**Depends on:** C (the routes' bodies). The HTML/CSS can be drafted alongside C.

`app/snap.*`, the map's examiner block and stats, DOM tests, docs.

---

## STEP-BY-STEP TASKS

### Task 0 (before Task 1). Capture a shape-3 data folder

- **IMPLEMENT**: while the worktree is still at `ab1ddd9` (shape 3), make `<scratchpad>/shape3/data/`. Copy `src/events/__fixtures__/six-weeks.jsonl` there as `events.jsonl`. From `<scratchpad>/shape3/`, run `bun ~/Desktop/study-tutor-t13/scripts/replay-check.ts`. That writes a shape-3 `state.json`, because the scripts take no path and use `data/` in the folder they run from.
- **VALIDATE**: `jq .shape <scratchpad>/shape3/data/state.json` prints `3`.
- **ALSO**: `git fetch && git grep -c makeDataDir origin/main -- src/events/append.ts`. A count means T14 has merged: rebase this branch onto `origin/main` first, and in Task 7 call `makeDataDir(dataDir, INTAKE_DIR, 0o700)` (T14 plan B3; PR #44 F2 added the `mode` argument, since `makeDataDir` made folders at the umask default) instead of the inline `mkdirSync` and `isDirectory` lines. No match (T14 had no commits and no PR at planning, observed 2026-09-29): use Task 7 as written. Record which branch was taken in the execution report.

### Task 1. UPDATE `src/events/types.ts`: `photo@1` in place

- **IMPLEMENT**:
  ```ts
  export type PhotoV1 = Line<"photo", 1> & {
    item: string;
    topic: string;
    file: string; // relative to data/, e.g. intake/20261014-180000-a1b2c3.jpg
    seed?: number; // a generated (#gen) item's seed, so the item can be rebuilt
    // Present together when the photo was marked; all absent when it is stored and not marked yet.
    marks?: number;
    of?: number;
    clean?: boolean; // every presentation line (answer, units, sense) earned its mark
  };
  ```
  `FIELDS["photo@1"]`: `str(item) && str(topic) && str(file) && optInt(seed) && (unmarked || marked)`, where unmarked = `marks`, `of`, `clean` all `undefined`, and marked = `outOf(marks, of) && (of as number) >= 1 && bool(clean)`.
  `KEYS["photo@1"]`: `["item", "topic", "file", "seed", "marks", "of", "clean"]`.
- **PATTERN**: `teachback@1` / `retest@1` rows at `src/events/types.ts:150-152`.
- **GOTCHA**: this is an in-place edit of a shipped-in-source `(type, v)`. It is allowed only because no release exists (`gh release list` printed nothing, observed 2026-09-29) and events.md line "A `(type, v)` shape may be edited in place until the first GitHub release whose build can append it". Re-run `gh release list` before committing. If a release has appeared, stop and make this `photo@2` with a reducer case instead.
- **GOTCHA**: `_complete` (`types.ts:203-206`) fails `tsc` if a new field is missing from `KEYS`. That is the check working.
- **VALIDATE**: `test -z "$(gh release list)" && bun test src/events/types.test.ts && bunx tsc --noEmit`. The first command fails when a release exists, which is the signal to switch to `photo@2`.
- **SATISFIES**: AC 6

### Task 2. UPDATE `src/events/__fixtures__/photo.v1.jsonl`

- **IMPLEMENT**: keep line 1 (unmarked, now the "stored, not marked yet" shape) and add a marked line, a `#gen` item with seed:
  `{"v":1,"t":"2026-10-15T18:00:00Z","type":"photo","item":"1MA1/R9/of-an-amount#gen","topic":"1MA1/R9/of-an-amount","file":"intake/20261015-180000-a1b2c3.jpg","seed":8812,"marks":3,"of":5,"clean":false}`
- **VALIDATE**: `bun test src/events/types.test.ts src/events/replay.test.ts`
- **SATISFIES**: AC 6

### Task 3. ADD type tests for the photo fields, in `src/events/types.test.ts`

- **IMPLEMENT**: one `test.each` table of photo lines to `parseEvent`: accepted: unmarked; marked `3/5 clean:false`; marked `5/5 clean:true` with seed. Refused (null): `marks` without `of`; `of` without `marks`; `marks > of`; `of: 0`; `clean` without marks; `clean: "yes"`; `seed: -1`.
- **VALIDATE**: `bun test src/events/types.test.ts`
- **SATISFIES**: AC 6

### Task 4. UPDATE `src/events/replay.ts`: `photos` and shape 4

- **IMPLEMENT**:
  ```ts
  export type PhotoWeek = { taken: number; marked: number; marks: number; of: number; clean: number };
  // State: shape: 4 (5 after the PR #44 rebase: T12 also bumped 3 → 4); photos: Record<string, PhotoWeek>; // ISO week → photo counts and summed marks (O3)
  "photo@1": (s, e) => {
    topic(s, e.topic);
    const week = isoWeek(localDay(e.t));
    const w = s.photos[week] ?? { taken: 0, marked: 0, marks: 0, of: 0, clean: 0 };
    w.taken += 1;
    if (e.marks !== undefined && e.of !== undefined) {
      w.marked += 1; w.marks += e.marks; w.of += e.of;
      if (e.clean) w.clean += 1;
    }
    s.photos[week] = w;
  },
  ```
  Initial state: `photos: dict()`. "Marks left on the table" for a week = `of − marks`, worked out by the reader (the map). Sums, not a stored "left", so the metric's definition can change without another shape bump.
- **GOTCHA**: `shape` is the literal type `3` in two places (`replay.ts:37`, `:182`). Bump both. `src/events/check.ts` `project` (`:26-48`) reads only `lines`, `topics[].rung`, `xp.total`, `hash`, so an old shape-3 `state.json` still projects. `currentState` (`src/api/state.ts:5-12`) rewrites `state.json` whenever the stored `hash` differs from the replayed one and serves the fresh replay, never the stored file. So a stored shape-3 file is never served as it is, and no migration is needed.
- **VALIDATE**: `bun test src/events/`
- **SATISFIES**: AC 6

### Task 5. UPDATE `src/events/replay.test.ts`

- **IMPLEMENT**: `:56` → `toBe(4)`. New test: replay of four lines across two ISO weeks (week A: one marked `3/5 clean:false`, one marked `5/5 clean:true`, one unmarked; week B: one marked `1/5 clean:false`) gives `photos[A] = {taken 3, marked 2, marks 8, of 10, clean 1}` and `photos[B] = {taken 1, marked 1, marks 1, of 5, clean 0}`. Left: A 2, B 4 (`derived`: 10 − 8, 5 − 1). Check the ISO weeks with `isoWeek(localDay(t))` in the test rather than hand-writing them.
- **VALIDATE**: `bun test src/events/replay.test.ts`
- **SATISFIES**: AC 6

### Task 6. UPDATE `src/api/event.ts`: refuse a posted photo

- **IMPLEMENT**: in `refusal` (`:26`), after the xp line: `if (event.type === "photo") return "Refused: photos are saved by the tutor, not posted";`
- **PATTERN**: xp refusal `src/api/event.ts:27-28`; test `src/api/event.test.ts:206-213`.
- **VALIDATE**: `bun test src/api/event.test.ts` with a new test: posting a valid-shaped marked photo body gives 400 with that sentence, and `readLines(data)` is `[]` (nothing written, not even `data/`).
- **SATISFIES**: AC 9

### Task 7. UPDATE `src/events/append.ts`: bytes and the intake folder

- **IMPLEMENT**:
  - `writeDataFile(dataDir, rel, data: string | Uint8Array)`. Inside, branch the write: `typeof data === "string" ? fs.writeSync(fd, data) : fs.writeSync(fd, data)`.
  - New export:
    ```ts
    export const INTAKE_DIR = "intake";
    /** Saves one photo as data/intake/<name>, owner-only, and returns its path relative to data/. */
    export function writeIntakeFile(dataDir: string, name: string, bytes: Uint8Array): string {
      if (!/^[A-Za-z0-9-]+\.(?:jpg|png|webp)$/.test(name)) throw new Error(`Refused: ${name} is not a photo name`);
      fs.mkdirSync(dataDir, { recursive: true });
      const dir = resolveInData(dataDir, INTAKE_DIR);
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      if (!fs.lstatSync(dir).isDirectory()) throw new Error(`Refused: ${INTAKE_DIR} is not a folder`);
      // Task 0 decides: when T14's makeDataDir is on main, these three lines become makeDataDir(dataDir, INTAKE_DIR).
      const rel = `${INTAKE_DIR}/${name}`;
      writeDataFile(dataDir, rel, bytes);
      return rel;
    }
    ```
- **GOTCHA**: `fs.writeSync` has separate overloads for `string` and `ArrayBufferView`; a `string | Uint8Array` argument matches neither, so `tsc` fails without the branch.
- **GOTCHA**: `resolveInData(dataDir, "intake")` works when `intake/` is missing (its ENOENT branch, `append.ts:34-44`). It throws when `intake` is a symlink out of `data/`, which is the confinement rule. No `mkdirSync` on an unresolved path.
- **VALIDATE**: `bun test src/events/append.test.ts` with new tests: bytes round-trip byte for byte; the file mode is `0o600` on POSIX (skip on win32, as the existing mode tests do); a name with `/`, `..` or `.exe` is refused; `data/intake` as a symlink to a temp dir outside `data/` is refused and nothing is written there.
- **SATISFIES**: AC 7, CLAUDE.md "`data/` confinement"

### Task 8. CREATE `src/jobs/examiner_mark.ts`

- **IMPLEMENT**:
  ```ts
  export const KINDS = ["method", "accuracy", "answer", "units", "sense"] as const;
  export type Kind = (typeof KINDS)[number];
  export const PRESENTATION: Record<Kind, boolean> = { method: false, accuracy: false, answer: true, units: true, sense: true };
  // mark null only on "units": the question needs no units.
  export type ExamLine = { kind: Kind; mark: 0 | 1 | null; note: string };
  export type ExaminerInput = { item: PostAttempt; topic: string; photo: { bytes: Uint8Array; mime: string } };
  export type ExaminerOutput = { lines: ExamLine[] };
  export const EXAM_OF = KINDS.length; // 5: every marked photo is out of the same total
  ```
  `KINDS` is a compile-pinned list and `PRESENTATION` a `Record<Kind, boolean>`, so a sixth kind fails `tsc` until both are updated.
  Prompt: `postAttemptSystem(task)` plus one user message with `content: Part[]`: a text part (`Topic: …`, `Question: ${item.stem}`, `Mark scheme: ${item.mark_scheme ?? item.working ?? ""}`, `The photo is the pupil's working.`), then `imagePart(photo.bytes, photo.mime)`. That is the S2 probe's form (`scripts/s2-run.ts:125-137`).
  Task line (put through `no-ai-slop` and `humanizer`; it is a prompt, and its notes are pupil-facing):
  > Mark the photographed working the way a GCSE examiner does, against the mark scheme. Give exactly five entries, in this order. "method": 1 if the working shows a correct method all the way through. "accuracy": 1 if the working reaches the correct final value. "answer": 1 if the final answer is clearly marked, boxed or underlined. "units": 1 if the units are written, 0 if they are missing, null if the question needs no units. "sense": 1 if the final answer is a sensible size for the question. Each note says what is missing or wrong in one short sentence, or is empty when the mark is earned. (PR #44 F4: "in words" dropped; it pushed the model towards number words.) Do not write any number that is not printed in the question. Never write the corrected step, the working or the answer. If the photo shows no working for this question, give every entry 0 (units null if no units are needed) and say so in the first note. Reply with JSON only: {"lines": [{"kind": "method", "mark": 0 or 1, "note": "..."}, ...]}.
  `validate`: object with `lines`, an array of exactly `EXAM_OF` rows. Row `i` must have `kind === KINDS[i]`. `mark` is exactly `0 | 1`, or `null` on the `units` row only. `note` is a string of 160 characters or fewer (trimmed). Otherwise null.
  `texts: (o) => o.lines.map((l) => l.note)`; `sources: ({ item }) => [item.stem]`; `fallback: () => null`; `maxTokens` default.
  Also export `score(out) → { marks, of, clean }`: `marks` = sum of marks with `null` counted as 1; `of` = `EXAM_OF`; `clean` = every row with `PRESENTATION[kind]` has mark 1 or null. Pure, used by the flow.
  Why fixed: no maths item has a `mark_scheme`, and the `working` strings have no fixed step format (observed: `1MA1/R11/pressure#1` has no `=`, `1MA1/R10#4` has three). So neither code nor the model can give a stable count of method marks per question. One method mark and one accuracy mark per photo is coarser than a real scheme, but every photo is out of 5, and week-on-week "marks left on the table" compares like with like, which is what the PRD's success metric reads.
- **GUARD (restated per CLAUDE.md)**: the input type is `PostAttempt`, which only `jobItem` mints, and only after `hasAttempt` finds an attempt event for the item id (and seed for `#gen`) (`src/jobs/view.ts:18-40`). A `PreAttempt` or raw `Item` does not type-check. The prompt is the post-attempt variant, so it has no pre-attempt guard line (`.claude/rules/content.md`, last bullet). It carries the mark scheme and never `answers`, and it asks for marks per line only. `sources` is the stem alone: the pupil's handwriting is not text the guard can read, so a note may quote no number from the photo. That means no number from the working either. (PR #44 F4: the guard reads digits only, so `validate` also refuses a number word the stem does not print, "zero", "nought" and "two" to "million". The guarantee is "no whole number outside the stem", except "one" and fractions in words.)
- **GOTCHA**: no transcription field. A "what the pupil wrote" field would let the model write the answer and attribute it to the pupil, and the number guard would then have to trust it.
- **GOTCHA**: `NUM` in `postAttemptSystem` (`define.ts:20-21`) says numbers may come from "the pupil's own words". The task line narrows that to the question. (PR #44 F4: the two lines conflicted, so a model following NUM was refused on retry too. `examiner_mark` now passes its own NUM line to `postAttemptSystem(task, num)`.)
- **VALIDATE**: `bun test src/jobs/examiner_mark.test.ts`
- **SATISFIES**: AC 3, AC 5

### Task 9. CREATE `src/jobs/examiner_mark.test.ts`

- **IMPLEMENT** (mirror `teachback_mark.test.ts`; input built through `jobItem` after `attemptLine`, the photo a 4-byte JPEG header `ff d8 ff e0`):
  1. valid reply (method 1, accuracy 0 with note "Check the last multiplication.", answer 1, units null, sense 1) → `{by: "model"}`, and `score` gives `{marks: 4, of: 5, clean: true}` (`derived`: 1 + 0 + 1 + 1 (null) + 1)
  1b. the same with units 0 → `score` gives `{marks: 3, of: 5, clean: false}`
  2. four rows (no `sense`), twice → `{by: "fallback", value: null, reason: "shape"}`, 2 calls
  3. rows in the wrong order → shape; six rows → shape; `kind: "presentation"` → shape; `mark: 2`, `true` or `"1"` → shape; `mark: null` on `method` → shape
  4. a note carrying a number only the working holds (`working: "10% of 45 = 4.5. 20% = 2 × 4.5 = 9."`, note "The answer is 9.") → `reason: "guard"`
  5. a note with an exclamation mark → `guard`
  6. invalid JSON twice → null, 2 calls
  7. provider down → `reason: "network"`, 1 call
  8. preset none → null, 0 calls
  9. prompt: system has no `PRE_ATTEMPT_GUARD` and contains "Never write the corrected step"; user content is an array whose part 0 text contains `Mark scheme: SENTINEL-SCHEME` and not `SENTINEL-ANSWER-731`, and whose part 1 is `image_url` with a `data:image/jpeg;base64,` URL
  10. with no `mark_scheme`, part 0 contains `Mark scheme: ${WORKING}`
  11. a text-only model refusing the image (HTTP 400) → `{by: "fallback", value: null, reason: "http"}`, 1 call (`http` is not retryable, `define.ts:61-65`)
- **VALIDATE**: `bun test src/jobs/examiner_mark.test.ts`
- **SATISFIES**: AC 3, AC 5

### Task 10. CREATE `src/flow/examiner.ts` and `src/flow/examiner.test.ts`

- **IMPLEMENT**:
  ```ts
  export type ItemRef = { id: string; seed?: number };
  /** The item of the last attempt in the log, in file order, or null. */
  export function lastAttempt(log: readonly string[]): ItemRef | null;
  export type ExamReply =
    | { kind: "marks"; lines: ExamLine[]; marks: number; of: number; clean: boolean }
    | { kind: "not-marked" }
    | { kind: "refused" }; // no attempt for this item: the job never runs
  /** Pure: no clock, no file. The API saves the photo first and passes its path. */
  export async function examine(ask: { item: Item & { seed?: number }; topic: string; photo: { bytes: Uint8Array; mime: string } }, log: readonly string[], deps: JobDeps): Promise<ExamReply>;
  export function photoRecord(item: Item & { seed?: number }, file: string, reply: ExamReply): NewEvent;
  ```
  `examine`: `jobItem(log, item)`; not attempted → `refused`; else `examinerMark.run(...)`; fallback or null → `not-marked`; else `marks` via `score`. `photoRecord`: `{v: 1, type: "photo", item: item.id, topic: item.topic, file, seed?, marks?, of?, clean?}`, with the marks trio only for `kind: "marks"`.
- **PATTERN**: `src/flow/chat.ts:103-155`.
- **VALIDATE**: `bun test src/flow/examiner.test.ts`. Tests:
  - `lastAttempt`: returns the last of three attempts with its seed, skips non-attempt and unreadable lines, `[]` gives null.
  - `examine` with no attempt in the log → `refused` and `mockFetch` has 0 calls.
  - A `#gen` item attempted with seed 5 and asked with seed 6 → `refused`, 0 calls.
  - Valid → `marks`; preset none → `not-marked`.
  - `photoRecord` round-trips through `parseEvent(JSON.stringify({...rec, t}))` for both kinds.
- **SATISFIES**: AC 5, AC 6

### Task 11. UPDATE `scripts/fake-provider.ts`: examiner branch

- **IMPLEMENT**: in `contentFor`, before the teach-back check: if any message's `content` is an array holding an `image_url` part, return `{"lines":[{"kind":"method","mark":1,"note":""},{"kind":"accuracy","mark":0,"note":"Check the last step."},{"kind":"answer","mark":1,"note":""},{"kind":"units","mark":null,"note":""},{"kind":"sense","mark":1,"note":""}]}`. Scored: 4 of 5, clean (`derived`, as Task 9 case 1).
- **GOTCHA**: the examiner's user `content` is an array; the teach-back branch's `String(content)` would read `[object Object]`. The examiner branch has to come first. It matches on structure, not wording, because the task line is rewritten by `no-ai-slop` and `humanizer` before it is saved.
- **VALIDATE**: `bun test src/server.test.ts` (existing fake-provider tests still green)
- **SATISFIES**: Level 4 steps

### Task 12. ADD dependency `uqr`

- **IMPLEMENT**: `bun add uqr@0.1.3` (writes a `dependencies` block and `bun.lock`).
- **VALIDATE**: `bun run build` and then `unzip -l dist/StudyTutor-mac.zip`: the build succeeds with the import bundled (no `node_modules` in the zip). Task 13 is what first imports it, so run this again after Task 13. The planning spike already compiled and ran a `uqr` import with `node_modules` removed (observed); this confirms it through the repo's own `scripts/build.ts`.
- **SATISFIES**: AC 8

### Task 13. CREATE `src/snap.ts`

- **IMPLEMENT** (all exported for tests):
  - `SNAP_TTL_MS = 15 * 60_000` (`expected`: long enough to find a phone and take a photo). `AFTER_UPLOAD_MS = 10 * 60_000` (`derived`: the worst-case job is 240 s, two tries at the 120 s provider timeout (`openai-compatible.ts:40`), so 10 minutes leaves 6 minutes to read the result).
  - `MAX_PHOTO_BYTES = 5 * 1024 * 1024` (`expected`: Anthropic's per-image limit from its docs). `MAX_LAN_BODY = 8 * 1024 * 1024` (`derived`: base64 inflates by 4/3, so 5 MB is about 6.7 MB, plus the JSON).
  - `lanAddress(ifaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>): string | null`: IPv4, non-internal addresses in 10/8, 172.16/12 or 192.168/16.
    - Skip 169.254/16, and skip interfaces whose name matches `/^(utun|awdl|llw|bridge|docker|vboxnet|vmnet)|vEthernet|VirtualBox|VMware|Hyper-V|WSL|Tailscale|ZeroTier/i`. These are the virtual adapters (VPN, Hyper-V and WSL, Docker, VirtualBox, VMware) whose subnets a phone on the home Wi-Fi cannot reach.
    - Rank what is left: `192.168.*` other than `192.168.56.*` (VirtualBox's default host-only range) first, then `10.*`, then `172.16/12`. Take the first.
  - `sniffImage(bytes) → { mime, ext } | null`: JPEG `ff d8 ff`; PNG `89 50 4e 47 0d 0a 1a 0a`; WebP `RIFF....WEBP`. Anything else (HEIC, GIF, PDF) → null.
  - `decodeDataUrl(s: unknown) → Uint8Array | null`: `^data:image/(?:jpeg|png|webp);base64,` then base64. Refuse before decoding when `s.length > Math.ceil(MAX_PHOTO_BYTES * 4 / 3) + 64`; refuse after decoding when bytes exceed `MAX_PHOTO_BYTES`.
  - `Snap = { token, ref, lan: Server | null, state: "open" | "marking" | "done", result: SnapResult | null, deadline: number, done: Promise<void>, cancel: () => void }`, where `SnapResult = { recorded: boolean; marked: false } | { recorded: boolean; marked: true; lines; marks; of; clean }`.
  - `createSnaps({ now = Date.now, token = () => base64url(crypto.getRandomValues(new Uint8Array(32))), schedule = (fn, ms) => { const t = setTimeout(fn, ms); t.unref(); return () => clearTimeout(t); } })` → `{ open(ref, lan): Snap; find(token): Snap | null; take(token): Snap | null; current(): Snap | null; closeAll(): void }`.
    - There is one live snap. `open` closes the previous snap (`lan.stop(true)`, cancels its timer) and replaces it.
    - `find` returns the live snap when the token matches (`crypto.timingSafeEqual` on equal-length buffers) and `now() < deadline`, whatever its state. Status reads use it.
    - `take` is `find` plus `state === "open"`. It sets `state = "marking"` synchronously. It also moves the deadline to `max(deadline, now() + AFTER_UPLOAD_MS)` and reschedules that snap's own timer. A second `take` on the same token returns null.
    - Expiry: each snap holds the cancel function its own `schedule(() => close(thisSnap), ms)` returned. `close(snap)` acts on that snap by identity (`if (live === snap) live = null`) and never on "whatever is current". So A's timer firing after B was minted cannot stop B.
    - `closeAll(): Promise<void>` awaits every snap's pending `done` (background marking), then stops every listener with `stop(true)` and cancels every timer. Tests `await snaps.closeAll()` in `finally` before the temp folder is removed and before the fake provider stops. Otherwise a background job would outlive the test, and `appendEvent`'s `mkdirSync(dataDir, {recursive: true})` would recreate the deleted temp tree.
    - The listener is stopped only by `close` (timer, re-mint, `closeAll`), never from inside one of its own handlers. The spike showed `stop(true)` from another server's handler refuses even a reused keep-alive socket (observed).
  - Handlers, each `(req, ctx) → Promise<{status, body}>` so the localhost table and the LAN listener share them:
    - `mintSnap` (POST `/api/snap`, localhost only). Steps: `lastAttempt(readLines)`; none → 409 `"Try a question first. Then photograph your working."`. `findItem(pack, id, seed)`; none → 409 `"That question is no longer in the pack."`. `host = ctx.snapHost()`; when non-null, `startSnapListener(host, …)` in try/catch (a bind failure logs and gives `lan: null`). Then `snaps.open(ref, lan)`; `lanUrl = http://${host}:${port}/snap.html?token=…`; `qr = renderSVG(lanUrl, { border: 2 })`. Returns 201 `{local: "/snap.html?token=…", lan: lanUrl | null, qr: svg | null, title, stem, expires: ISO}`.
    - `getSnap` (GET `/api/snap?token=`): `find`; null → 403 `"This link has expired. Open a new one from the map."`. Otherwise 200 `{title, stem, figure?, model: preset set and not "none", state, result}`, the item fields named from `toItemView` as `getChat` does (`src/api/chat.ts:61-77`). `result` is null until `state === "done"`.
    - `postPhoto` (POST `/api/snap/photo`, body `{token, image}`). Steps:
      1. `snaps.find(token)` with `state === "open"` (sync). A miss → 403 as above. The token comes first, so a body with no token (`{}`) is a 403, never a 400 (test 8, AC 2).
      2. `decodeDataUrl` and `sniffImage` (sync). Bad → 400 `"That file is not a photo the tutor can read. Use a JPEG or PNG."`; the token stays open.
      2b. `snaps.take(token)` (sync); null → 403. Steps 1 to 3 run after `await req.json()` with no `await` between them. `take` also re-checks `state` and sets it in one synchronous step, so two racing uploads cannot both pass (test 5b).
      3. `writeIntakeFile(dataDir, `${stamp}-${hex6}.${ext}`, bytes)`, where `stamp` is `YYYYMMDD-HHMMSS` from `utcNow()`. A throw → set `state = "done"`, `result = null`, and 500 `"Could not save the photo"` (the token is spent; the pupil opens a new one from the map).
      4. Start `snap.done = markInBackground(snap, rel, bytes, mime)` without awaiting it, and return 202 `{saved: true}`.
      `markInBackground` (async; the whole body in try/catch so nothing rejects unhandled): `findItem`, then `examine(...)` with a fresh `readLines(dataDir)`. Then `appendEvent(dataDir, photoRecord(...))` in its own try/catch; a failure is logged and gives `recorded: false`. Then `snap.result = {recorded, marked, ...}` and `snap.state = "done"`. On any other throw: logged, `result = {recorded: false, marked: false}`, `state = "done"`. The event is appended only after the job, so a process killed mid-job leaves the photo file without an event. The file is harmless; the photo counts once a new one is taken.
  - `startSnapListener(host, deps)`: `Bun.serve({ hostname: host, port: 0, maxRequestBodySize: MAX_LAN_BODY, routes: {...}, fetch: () => 404 })`. Routes:
    - `/snap.html` GET: `find(token)` from the query; null → 403 plain text `"This link has expired. Open a new one from the map on the computer."`; found → `Bun.file(app/snap.html)`.
    - `/snap.js`, `/style.css` GET: the app files.
    - `/api/snap` GET and `/api/snap/photo` POST: the shared handlers.
    Every route first runs `refuseLan(req, expectedHost)`: `Host` must equal `${host}:${port}`, an `Origin` when present must be `http://${host}:${port}`, and a POST must be `application/json`. No `server.timeout(req, 0)` is needed: no request waits on the model.
- **IMPORTS**: `renderSVG` from `uqr`; `readLines`, `appendEvent`, `writeIntakeFile` from `./events/append`; `findItem` from `./flow/chat`; `lastAttempt`, `examine`, `photoRecord` from `./flow/examiner`; `toItemView` from `./content/pack`; `readConfig` from `./config`; `utcNow` from `./mcp/clock`; `titleOf` from `./api/chat` (export it there; it is currently module-private at `src/api/chat.ts:47`).
- **GOTCHA**: bind `host` itself, never `0.0.0.0` or `::`. A wildcard bind would expose the listener on every interface, loopback included, and the LAN Host check would be the only thing refusing `/api/*` there.
- **GOTCHA**: `markInBackground` must not be awaited by the handler. Tests await `snap.done` (exposed through `current()`) rather than sleeping.
- **GOTCHA**: this file must not write under `data/` itself. Every write goes through `writeIntakeFile` and `appendEvent` (CLAUDE.md "Events are the record"; events.md "Only `src/events/append.ts` writes under `data/`").
- **GOTCHA**: the order is save the file, answer 202, mark, then append the event. `appendEvent` resolves `photo.file` inside `data/` (`append.ts:94-105`), and the event should not name a file that does not exist.
- **VALIDATE**: `bun test src/snap.test.ts && bunx tsc --noEmit && bunx biome check src/snap.ts`
- **SATISFIES**: AC 1, 2, 4, 7, 8

### Task 14. UPDATE `src/server.ts`: register the routes

- **IMPLEMENT**: `ServerOptions` gains `snapHost?: () => string | null` and `snaps?: Snaps`. Inside `apiRoutes` the default is `() => null` (no LAN listener), and only the `import.meta.main` block passes `snapHost: () => lanAddress(os.networkInterfaces())`. `apiRoutes` uses `opts.snaps ?? createSnaps()` and adds:
  - `/api/snap`: `GET` → `refuseForeign` then `getSnap`; `POST` → `refuseForeign`, `req.json()`, `mintSnap`
  - `/api/snap/photo`: `POST` → `refuseForeign`, `req.json()`, `postPhoto`
  Each handler loads the pack as `postChatRoute` does (`pack ?? await loadCasePack("maths", root)`).
- **GOTCHA**: the key-leak walk (`src/server.test.ts:340-395`) POSTs `{preset: "nope", key: KEY}` to every POST route and asserts `walked` equals `Object.keys(apiRoutes(opts))`. The new routes join the walk automatically. Their bodies must not echo a submitted field (they do not: every error is a fixed sentence).
- **GOTCHA**: `apiRoutes(opts)` is called twice in that test; each call making its own snap store is harmless. `startServer` calls it once, so the server has one store.
- **GOTCHA**: the LAN default is off inside `apiRoutes` on purpose. With the real address as the default, any test that mints would bind this Mac's Wi-Fi address mid-`bun test`. That can raise the macOS firewall prompt, and a live `Bun.serve` keeps the test process open.
- **VALIDATE**: `bun test src/server.test.ts`
- **SATISFIES**: AC 1, 7

### Task 15. CREATE `src/snap.test.ts`

- **IMPLEMENT**. One server via `startServer([0], {...opts, snapHost: () => "127.0.0.1", snaps})`, so the "LAN" listener binds loopback on its own port. `await snaps.closeAll()`, then `server.stop(true)`, then the fake provider's stop, run in every test's `finally`, in that order. Every test that gets a 202 also awaits `snaps.current()?.done` before asserting on the log. Data from `withData(OPENAI)` or `NO_MODEL`, with `fetch` stubbed on the job deps, or `scripts/fake-provider.ts` started for the upload tests (its `url` saved as `base_url`). Tests:
  1. `lanAddress`, a table:
     - this Mac's observed shape (`lo0 127.0.0.1 internal`, `en1 192.168.1.11`) → `192.168.1.11`
     - `169.254.3.4` only → null
     - `utun3 10.8.0.2` plus `en0 192.168.0.5` → `192.168.0.5`
     - Windows: `vEthernet (WSL) 172.28.0.1` plus `Wi-Fi 192.168.1.20` → `192.168.1.20`
     - `VirtualBox Host-Only Network 192.168.56.1` plus `Ethernet 10.0.0.12` → `10.0.0.12`
     - IPv6 only → null; public `8.8.8.8` only → null
  2. `sniffImage`: JPEG, PNG, WebP → mime; HEIC `ftypheic`, GIF, `%PDF` → null.
  3. Mint with no attempt → 409, and no listener is started (the store's `current()` is null).
  4. Mint after an attempt → 201. `lan` and `qr` are non-null, `qr` starts with `<svg`, and the body holds the stem but not `answers` or `working`.
  5. **Single-use** (AC 1): POST a photo with the token → 202 `{saved: true}`. POST again with the same token → 403, and still one file in `data/intake/`. GET `/api/snap?token` → 200 with `state` `marking` or `done` (a status read, not an upload).
  5b. **Race**: two POSTs with the same token through `Promise.all` → exactly one 202 and one 403, one file, and (after `await current().done`) one `photo` event.
  6. **Session-bound** (AC 1): mint A, mint B. A's token → 403 on the main server's `/api/snap` and on B's listener. B → 200. A request to A's port fails (stopped). The planning spike saw `stop(true)` refuse even a reused keep-alive socket (observed), so no `connection: close` is needed.
  7. **Expiry**: store with `now` injected; advance past `SNAP_TTL_MS`; the token → 403 on GET and POST.
  7a. **Deadline moves on upload**: `now` at 14 minutes, upload → 202. At 20 minutes (past the mint's 15), GET → 200 `done`. At 24 minutes and 1 second (past upload + 10), GET → 403.
  7b. **A's timer cannot close B**: store with an injected `schedule` that records `(fn, ms)` and returns a cancel spy. Mint A, then B. Assert A's cancel spy was called. Call A's recorded `fn` anyway. B's token still → 200 and B's listener still answers.
  8. **LAN without a token** (AC 2), against the listener's URL: `/snap.html` with no token → 403; wrong token → 403; `/api/snap` with no token → 403; `/api/snap/photo` with `{}` → 403; `/api/state`, `/`, `/map.html`, `/api/event` POST → 404.
  9. LAN Host check: a request with `Host: evil.example` → 403; `Origin: http://evil.example` → 403.
  10. Not a photo: a `data:image/jpeg;base64,` URL whose bytes are `%PDF` → 400, token still open (the next valid POST → 202).
  11. Oversize: 6 MB of bytes behind a JPEG header → 400 or 413, nothing in `data/intake/`.
  12. Upload with the fake provider → 202, then `await current().done`, then GET → `{state: "done", result: {recorded: true, marked: true, marks: 4, of: 5, clean: true}}` (`derived`: Task 11). `data/intake/` holds one file, and the log's last line is `photo` with that `file`, `marks: 4`, `of: 5`, `clean: true`.
  12b. Slow provider: the fake with `delayMs: 500`. The POST returns 202 in under 200 ms (`expected`: no model wait in the request), and a GET before `done` reads `state: "marking"`.
  13. **No model** (AC 4): `NO_MODEL` → after `done`, `result` is `{recorded: true, marked: false}`, the file exists, and the photo event has no `marks`.
  13b. Append fails (make `data/events.jsonl` a directory before `done`) → `result.recorded === false`, and the file is still on disk.
  14. **Drop-a-file fallback** (AC 7): the same upload through `http://127.0.0.1:<main port>/api/snap/photo` → 202 and the same result; with `Origin: http://evil.example` → 403 (the unchanged `refuseForeign`).
  15. `#gen` item: attempt with seed 5, mint → the snap's ref has seed 5, and the event carries `seed: 5`.
- **VALIDATE**: `bun test src/snap.test.ts`. Also mutation-check AC 2: change the listener's `hostname` to `"0.0.0.0"` and confirm test 8's `/api/state` 404 still holds (the allow-list, not the bind, refuses it). Then remove the `find` check on `/snap.html` and confirm test 8 goes red on the first assertion. Then run the race mutation in two variants and record both results:
  - (a) Insert `await Bun.sleep(0)` between step 1 (`find`) and step 2b (`take`). Expected: test 5b stays green, because `take` re-checks and sets `state` in one synchronous step. This shows the guarantee sits in `take`, not in the absence of `await`.
  - (b) Also make `take` set `state = "marking"` without re-checking it. Expected: test 5b goes red with two 202s.
  Four results in total (the `0.0.0.0` bind, the `find` removal, race (a), race (b)), each written down as observed.
- **SATISFIES**: AC 1, 2, 4, 7

### Task 16. CREATE `app/snap.html` and `app/snap.js`

- **IMPLEMENT**:
  - `snap.html`: `.ai-note` sticky, static, first in `<main>`, with the text "This is an AI. It can be wrong. It marks your working and never writes the answer." (styled as in `chat.html:9`). Header "Mark my working". `#item` (`#stem`, `#figure`). `#no-model` note (hidden). A form with `<input type="file" id="photo" accept="image/*" capture="environment">`, a `#drop` zone "Or drop a photo here", a Send button. `#result`. `#status`.
  - `snap.js`, an IIFE like `map.js`:
    - The token from `location.search`, then `GET /api/snap?token=`. 403 → show the error sentence and hide the form. A status of `marking` or `done` on load (the pupil reloaded, or opened the link on the PC after sending from the phone) → skip the form and go to polling or the result.
    - `api.encode(file) → Promise<string>`: the exact function run in the planning spike (see Relevant Documentation). An `Image` from `URL.createObjectURL(file)`, drawn on a canvas scaled so the long side is at most 1568 px (`expected`, Anthropic's no-resize bound), then `toDataURL("image/jpeg", 0.85)`. On `img.onerror`: if `file.type` is `image/jpeg`, `image/png` or `image/webp` and `file.size` ≤ 5 MB, read the original with `FileReader.readAsDataURL`. Otherwise reject with `"This photo type cannot be read here. Take the photo with the camera button, or use a JPEG or PNG."`.
    - POST `{token, image}` as JSON to `/api/snap/photo`. On 202, show "Marking your working. This can take a minute." and poll `GET /api/snap?token=` every 2 s (`api.wait`, a seam) until `state === "done"`, then render `result`. A failed poll is retried on the next tick. A 403 while polling (the snap closed) → "This link has closed. Look at the map on the computer. (PR #44 F10: was "Your marks are on the map", false for an unmarked photo.)"
    - Render with `textContent` only: one row per line, `"Method: 1 mark"`, `"Accuracy: 0 marks. <note>"`, `"Units: not needed"` for null (labels from a `LABELS` table keyed by kind). Then `"<marks> of <of>. Marks left on the table: <of − marks>."`, then `"Clean sheet."` when `clean`. For `marked: false`: `"Your photo is stored. It is not marked yet."`. For `recorded: false`, add `"It did not go into your record. Take a new photo from the map."`. A network failure on the POST: `"The photo may not have been sent. Check your Wi-Fi and try again."`
    - Exports `root.snap = Object.assign(api, { TEXT, LABELS, resultLines })` for tests.
  - Every visible sentence passes `no-ai-slop` then `humanizer` before saving (`.claude/rules/content.md`). British English, sentence case, no exclamation marks.
- **GOTCHA**: `capture="environment"` on iOS opens the camera straight away and hides the photo library. Keep `accept="image/*"` so desktop browsers still offer a file picker; the drop zone is the PC's path.
- **GOTCHA**: happy-dom has no canvas. `api.encode` and `api.wait` are the seams the DOM test replaces.
- **GOTCHA**: iOS HEIC. Chrome on macOS could not decode HEIC (observed). WebKit, which every iOS browser uses, could not be tested on this Mac because Safari's "Allow remote automation" is off. So the page does not depend on HEIC decoding: iOS normally hands the page a JPEG from the camera (`expected`), a decodable file is re-encoded, and an undecodable HEIC gets the plain message. Level 4 step 4 (a real iPhone) closes this.
- **VALIDATE**: `bunx biome check app/snap.js` and Task 18
- **SATISFIES**: AC 4, 7

### Task 17. UPDATE `app/map.html` and `app/map.js`: examiner block and stats

- **IMPLEMENT**:
  - `map.html`: after `#today`, add `<section class="examiner" id="examiner"><h2>Examiner</h2><p>Photograph the working for your last question. The tutor marks it line by line, like an exam, and never writes the answer.</p><button type="button" id="snap-open">Mark my written working</button><div id="snap"></div></section>`.
  - `map.js`:
    - On click, POST `/api/snap` with `{}` (content-type JSON).
    - 201: render the stem; the QR (`qr` through `DOMParser(..., "image/svg+xml")`; it is the tutor's own SVG from `uqr`, never model text); the sentence "Scan this with your phone on the same Wi-Fi. It works once, for 15 minutes."; and a link `"Or drop a photo on this computer"` → `local`.
    - `lan: null`: "The phone cannot reach this computer from here. Drop a photo on this computer instead." plus the link.
    - 409: the error sentence.
  - `renderStats`: when `state.photos[next.flame.week]` exists, add `stat(String(of − marks), "marks left on the table this week")`. Add a second line `"last week <n>"` from the ISO week just before the current one, when it has a marked photo. (PR #44 F9: it was the greatest earlier key, which could be weeks back; and a week with no marked photo shows no figure.) Add `stat(String(clean), "clean sheets this week")`.
  - Add `TEXT` entries for every new string. Export any new pure helper (`photoStats(state, week) → {left, lastLeft | null, clean} | null`).
- **GOTCHA**: ISO week keys `YYYY-Www` sort correctly as strings (zero-padded week), so "the greatest key below the current week" is a string comparison. (Retired by PR #44 F9: `photoStats` now reads the ISO week just before, from `next.day` minus 7 days.)
- **VALIDATE**: `bun test src/marking/map.test.ts src/marking/map-dom.test.ts`
- **SATISFIES**: AC 6, AC 8

### Task 18. CREATE `src/marking/snap-dom.test.ts`; UPDATE `src/marking/map-dom.test.ts`, `src/marking/map.test.ts`, `src/server.test.ts`

- **IMPLEMENT**:
  - `snap-dom.test.ts` (pattern: `map-dom.test.ts:1-75`; register at `http://127.0.0.1:4731/snap.html?token=T`; import `app/snap.js?dom`; replace `snap.encode` with `async () => "data:image/jpeg;base64,/9j/4A=="`). Cases:
    - GET 200 with `model: false` → the `#no-model` note shows.
    - POST 202, then two polls (`marking`, then `done` with `marked: false`) → `#result` reads "Your photo is stored. It is not marked yet."
    - `done` with the fake's five lines → five rows including "Units: not needed", `"4 of 5. Marks left on the table: 1."`, "Clean sheet.".
    - `recorded: false` → the record sentence shows.
    - Load with `state: "done"` → no form, the result shows.
    - A poll 403 → the "closed" sentence.
    - `encode` rejecting with the HEIC sentence → it shows, and nothing is posted.
    - A note holding `<b>x</b>` renders as text (no `b` element).
    - GET 403 → the form is hidden.
  - `map.test.ts`: `photoStats` for no photos, one week and two weeks.
  - `map-dom.test.ts`:
    - The fake fetch answers `POST /api/snap` with a 201 body holding a tiny `<svg>`. The click renders an `svg` element and the local link. Posted body `{}`.
    - A 409 body shows its error sentence.
    - A state with `photos` shows the two new stats.
  - `server.test.ts`: the same static-markup test as `:756-766` for `snap.html` (the note before `#item`, `#result`; sticky).
- **VALIDATE**: `bun test src/marking/ src/server.test.ts`
- **SATISFIES**: AC 4, 6, 8, and "This is an AI" (CLAUDE.md)

### Task 19. UPDATE docs

- **IMPLEMENT**:
  - `.claude/references/events.md`:
    - The `photo` fields and the marked/unmarked rule.
    - The in-place edit, with the date and "no release existed".
    - State `shape` 4 (5 after the PR #44 rebase) and the `photos` key.
    - The refused posted photo in the Routes paragraph.
    - The three snap routes and the LAN listener (allow-list, token, TTL).
    - `data/intake/` written by `writeIntakeFile`.
  - `.claude/references/model-jobs.md`: `examiner_mark` shipped. Input `PostAttempt` plus an image part; `sources` is the stem only, with the reason why; `fallback` null → "stored, not marked yet".
  - `docs/prd/study-tutor-v2.architecture.md` D8: one line recording that the path is `/snap.html?token=` and naming the TTL.
  All prose passes `no-ai-slop` then `humanizer`.
- **VALIDATE**: `bunx biome check .` (docs are not linted; this is the whole-tree check before the gate)

### Task 20. Gate and build

- **VALIDATE**:
  - `bun run check` green.
  - `bun run build` succeeds.
  - From `<scratchpad>/shape3/`, append the Task 2 marked photo line to `data/events.jsonl`, then run `bun ~/Desktop/study-tutor-t13/scripts/replay-check.ts`. It exits 0 with no rung fallen, and `jq '.shape, .photos' data/state.json` shows `4` and one week. `data/state.prev.json` is the shape-3 copy.

---

## TESTING STRATEGY

### Unit Tests

- Events: photo parse table (Task 3), replay sums (Task 5), bytes and intake confinement (Task 7), posted-photo refusal (Task 6).
- Job: fourteen provider-mocked cases (Task 9: 1, 1b, 2, 3 and 4 to 11, with case 3 covering five wrong shapes). The three the model-jobs rule requires are there: valid, invalid JSON twice, provider down.
- Flow: `lastAttempt`, the refused-without-attempt path with 0 fetches, and the record round trip (Task 10).
- Pure snap helpers: `lanAddress`, `sniffImage`, `decodeDataUrl`, store expiry with an injected clock (Task 15).

### Integration Tests

`src/snap.test.ts` runs the real `startServer` and a real second listener, in the order the app uses: an attempt appended, the map's mint POST on the main port, then the phone's GET of the page and the item, then the upload on the listener's port. It asserts what arrives: the 202, then after `await snaps.current().done` the file on disk, the event in the log, and the status body the page polls. The upload tests run the real provider module against `scripts/fake-provider.ts`, so the image part really goes out as JSON over HTTP.

### Edge Cases

| Edge case | Verified in |
|---|---|
| Token reused after a successful upload | `snap.test.ts` 5 |
| Old token after a new mint | `snap.test.ts` 6 |
| Token after 15 minutes | `snap.test.ts` 7 |
| LAN request with no token or a wrong token, or for `/api/*` | `snap.test.ts` 8; Level 4 step 3 |
| Foreign Host or Origin on the LAN listener | `snap.test.ts` 9 |
| A non-image or HEIC body | `snap.test.ts` 10, `sniffImage` table; page side `snap-dom.test.ts` (HEIC sentence) |
| Two uploads racing on one token | `snap.test.ts` 5b, and the Task 15 mutation check |
| Upload near the end of the 15 minutes | `snap.test.ts` 7a |
| A slow model (up to 240 s) | `snap.test.ts` 12b; the phone polls, no request waits |
| The event append fails | `snap.test.ts` 13b; `snap-dom.test.ts` |
| Virtual adapters (WSL, VirtualBox, VPN) | `lanAddress` table, test 1 |
| An oversized body | `snap.test.ts` 11 |
| No model set | `snap.test.ts` 13; `snap-dom.test.ts`; Level 4 step 5 |
| A text-only model (HTTP 400 on the image) | same path as no model: `examiner_mark.test.ts` 11 |
| No attempt yet | `snap.test.ts` 3; `examiner.test.ts` |
| `#gen` item seed carried through | `snap.test.ts` 15; `examiner.test.ts` |
| A note that states the answer | `examiner_mark.test.ts` 4 |
| Model text with HTML | `snap-dom.test.ts` |
| No private IPv4 (no Wi-Fi) | `lanAddress` table; map text for `lan: null` in `map-dom.test.ts` |
| `data/intake` symlinked outside `data/` | `append.test.ts` (Task 7) |
| A page posting a photo event with marks | `event.test.ts` (Task 6) |
| The phone drops while marking | the result stays readable by token on the PC's local link until the deadline (`snap.test.ts` 7a, 14); Level 4 step 6 |
| Windows firewall prompt, phone reach on Windows | owed by #41 |

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
bunx tsc --noEmit
bunx biome check .
```

### Level 2: Unit Tests

```bash
bun test src/events/ src/api/event.test.ts src/jobs/examiner_mark.test.ts src/flow/examiner.test.ts
```

### Level 3: Integration Tests

```bash
bun test src/snap.test.ts src/server.test.ts src/marking/
bun run check
bun run build
```

### Level 4: Manual Validation

Every step uses what this ticket ships plus `scripts/fake-provider.ts` and a practice question. Run from the worktree with a throwaway `data/` (move any real one aside first).

1. Fake provider: `bun scripts/fake-provider.ts` and note its URL. `bun run dev`. On `/setup.html`, pick "Other OpenAI-compatible" (preset `custom`, no key), set the base URL to the fake's `url` and the model to `fake`. This is the config `src/server.test.ts:663-670` saves for the same fake.
2. Do one practice question (any answer). On the map, click "Mark my written working". Expect the stem, a QR code and the local link. Record the QR URL's host: it should be this Mac's Wi-Fi address (`192.168.1.11` when planned, observed).
3. From the Mac's terminal, against that host and port:
   - `curl -i http://<ip>:<port>/api/state` → 404
   - `curl -i http://<ip>:<port>/snap.html` → 403
   - `curl -i "http://<ip>:<port>/snap.html?token=wrong"` → 403
   - `curl -i "http://<ip>:<port>/snap.html?token=<token>"` → 200
   - `curl -i http://127.0.0.1:<port>/snap.html` → connection refused (the listener is bound to the Wi-Fi address only)
4. Phone on the same Wi-Fi (Linards's iPhone; an Android phone as well if one is to hand): scan the QR code, take a photo of written working with the camera button, send. Expect five marked lines, "4 of 5", "Marks left on the table: 1", "Clean sheet". Then:
   - reload the phone page → the result shows again, no form (a status read).
   - post again from the phone (the browser's back and resend, or `curl` the upload with the token) → 403.
   - `ls data/intake` → one `.jpg`, whatever format the phone captured in. This is the HEIC check on a real device.
   - `tail -1 data/events.jsonl` → `photo` with `marks: 4`, `of: 5`.
   - On the map, reload: "marks left on the table this week" shows 1, "clean sheets this week" shows 1.
   On macOS, if the firewall prompts for incoming connections, record the wording and the choice.
5. No model: set preset "none" on `/setup.html`, mint again, open the local link on the Mac, drop a photo. Expect "Your photo is stored. It is not marked yet." and a `photo` line with no `marks`.
6. Fallback with the phone unreachable: mint, then open the local link in the Mac's browser and drop a JPEG. Expect marks as in step 4 (with the fake set back). Then the dropped-phone case: restart the fake with `--delay 30000`, mint, send from the phone, lock the phone at once, then open the local link on the Mac. It shows "Marking your working" and then the result.
7. `bun run build`, unzip the mac zip to a temp folder, start the binary, and repeat step 2. The QR renders, so `uqr` is bundled.

### Level 5: Additional Validation (Optional)

With a real vision key, one leg (OpenAI `gpt-4.1-mini`, or Anthropic compat `claude-haiku-4-5`): photograph a worked 20% of 45 with a deliberate slip on the last line. Record the marks, the token count from `/api/usage` and the seconds taken, as `observed`. S2 recorded Anthropic compat's vision reply as two fenced blocks in 6 of 8 calls (`observed`, architecture doc S2). The `ONE` line in every system prompt (`define.ts:18-19`) is T9's answer to that. This step records whether the examiner prompt parses. If it does not, record it; do not widen `parseJsonReply` here.

---

## ACCEPTANCE CRITERIA

- [ ] AC 1: the token is single-use and session-bound: one live snap; one upload per token, including under a race; status reads until the deadline; dead on a new mint, at the deadline, or on restart (`snap.test.ts` 5, 5b, 6, 7, 7a, 7b).
- [ ] AC 2: a request from the LAN address without a valid token is refused, and `/api/*` beyond the snap routes is not served there (`snap.test.ts` 8–9, Level 4 step 3). Exception, by design: `/snap.js` and `/style.css` are served without a token. They are public app files, identical to what localhost serves, and the listener exists only while a snap is open (until its deadline: 15 minutes after minting, or 10 after an upload). A `<script src>` cannot carry the token. `style.css` loads nothing further (0 `url(` or `@import`, observed), so the allow-list needs no other asset.
- [ ] AC 3: mocked vision job tests: valid, wrong shape twice, invalid JSON twice, provider down, preset none, HTTP 400, guard refusal, prompt contents (`examiner_mark.test.ts`).
- [ ] AC 4: with no vision model the page says the photo is stored and not marked yet, and the photo and its event are saved (`snap.test.ts` 13, `snap-dom.test.ts`, Level 4 step 5).
- [ ] AC 5 (guard): `examiner_mark` runs only after an attempt event for the item (and seed); the prompt asks for marks per line only; no note may carry a number outside the question (`examiner.test.ts`, `examiner_mark.test.ts` 4 and 9).
- [ ] AC 6: a `photo` event with marks; replay derives weekly `photos` sums; the map shows marks left on the table this week and last week, and the clean-sheet count (`replay.test.ts`, `map-dom.test.ts`).
- [ ] AC 7: drop-a-file fallback on the PC through the localhost route under `refuseForeign` (`snap.test.ts` 14, Level 4 step 6).
- [ ] AC 8: the QR block on the map (`map-dom.test.ts`, Level 4 steps 2 and 7).
- [ ] AC 9: a page cannot post a `photo` event (`event.test.ts`).
- [ ] AC 10: on Windows, the firewall prompt and phone reach: **owed by #41**.
- [ ] `bun run check` green; `bun run build` succeeds.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] All four Task 15 mutation checks run and recorded (bind, `find` removal, race a, race b)
- [ ] `bun run check` green (the stop hook's gate)
- [ ] Level 4 steps 1–7 run and recorded in the execution report
- [ ] `gh release list` re-checked empty before the commit (Task 1 gotcha)
- [ ] Every new pupil-facing sentence passed `no-ai-slop` then `humanizer`
- [ ] PR body restates the guard (Task 8 GUARD paragraph) and names #41 as owed, using wording that does not close it ("follow-up: #41"; memory: a negated close keyword still closes)

---

## OPEN QUESTIONS / ASSUMPTIONS

Every item below is decided. None blocks implementation. Each names the evidence or the test that holds it.

- **D-Q1. "Session-bound" = the snap session.** The token is bound to the one live snap, which is minted by the map and closed by a re-mint, the deadline or a restart. The other reading, tied to `state.session`, would refuse most real uploads: `MODES` (`src/events/types.ts:129-138`) has no examiner mode, and a lesson's session is closed by the time the pupil photographs working. Worst case if the ticket meant the other reading: a single-use link, shown only on the pupil's own screen, outlives a lesson by up to 15 minutes. Tests 5–7b.
- **D-Q2. "Left on the table" = `of − marks`** over the fixed five lines. Presentation and accuracy are four of the five lines, which is the PRD's evidence (execution and presentation). Replay stores sums, and every photo is out of 5, so the weekly number compares like with like. Task 5.
- **D-Q3. No re-mark of an unmarked photo.** Out of scope, above.
- **D-Q4. Fixed five-line scheme.** This replaces the model-decided `of`. Evidence: no item has a `mark_scheme`, and `working` has no step format (Task 8, observed). Task 9 enforces the order and the count.
- **D-Q5. No request waits on the model.** The upload is answered with 202 and the page polls. The design was spiked on Bun 1.3.4 (observed, Relevant Documentation). Tests 12b and 7a.
- **D-Q6. Race on one token.** `take` is synchronous with no `await` after the body read. Test 5b, plus the Task 15 mutation that inserts an `await` and must turn it red.
- **Q7. Overlap with T14** (planned in parallel, `~/Desktop/study-tutor-t14/.claude/plans/t14-squad-mode.md`). T14 touches the same files, at different rows:
  - `src/events/types.ts`: `squad@1` gains `answers`, edited in place.
  - `src/api/event.ts` `refusal`: a squad refusal.
  - `app/map.js`: review items F4 and F5.
  - `src/events/append.ts`: adds `makeDataDir(dataDir, rel)`. It makes one level at a time, resolves each level first and checks that each is a directory.
  T14 does not bump the state shape. Task 0 checks `origin/main` for `makeDataDir` and picks the branch mechanically (observed at planning: T14 has no commits and no PR). The rows T13 and T14 edit in `types.ts`, `event.ts` and `map.js` are disjoint, so a rebase conflict is textual and adjacent only. (PR #44 F2: false. T12 (#45) and T13 each bumped the state shape 3 → 4, a collision no conflict marker showed; the rebased shape is 5. `makeDataDir` also needed a `mode` argument to keep `intake/` at 0700.)
- **A1 (closed by design, confirmed by Level 4 step 4).** Phone photo formats. JPEG re-encoding works (observed). HEIC in a browser that cannot decode it gets a plain message rather than a failed upload (observed failure in Chrome, handled in Task 16). WebKit's own HEIC decoding is the one thing this Mac could not test: Safari's remote automation is off. Turning on Safari → Settings → Developer → "Allow remote automation" would let the implementer run the Task 16 encoder in WebKit before Level 4.
- **A2 (closed by ranking, confirmed by #41).** Picking the Wi-Fi address. `lanAddress` drops virtual adapters and ranks home-router ranges first (test 1). The map's local link covers any remaining miss. #41 records a real Windows PC.

## NOTES (open canvas)

**Chosen after review: 202 plus polling on the snap page** (was "rejected: map polling"). The first version held the phone's request open for up to 240 s. Polling puts the result on the snap page itself, the same page on the phone or on the PC's local link, so `map.js` gets no loop. The status is one more field on the existing GET route. The spike showed the pieces work on Bun 1.3.4.

**Rejected: raw image POST.** A `image/jpeg` body would need a second origin check beside `refuseForeign` for the localhost fallback. The JSON data-URL body reuses `refuseForeign` unchanged, and the in-page canvas step is needed anyway for size and HEIC.

**Rejected: a transcription field** ("what the pupil wrote" per line). It would let number checks use the pupil's own numbers, but the model would be writing text attributed to the pupil, and the answer could arrive that way. Words-only notes cost some precision ("check the last multiplication" rather than "4.5 × 2 is not 8") and keep the guard structural.

**Rejected: a vendored QR encoder in `app/`.** About 1,000 lines of third-party browser JS against a 79 kB unpacked MIT package (`uqr` 0.1.3, observed on npm) used server-side only.

**Why the listener starts per snap and is not always on.** D8 says the LAN address is "bound for the session and gated by the token". A listener that exists only while a token is live means a closed port nearly all the time, so there is nothing to probe between photos.

**Size**: `expected` 1,100–1,400 lines including tests, against the ticket's `expected` 700–1,000. The extra comes from the listener tests, the polling state and two DOM tests.

**Confidence**: 9/10 for a one-pass implementation. Each risk has an observed spike, a named test, or both. The last point is the one fact this machine cannot produce: how a real iPhone's WebKit hands over a camera photo (A1). The design no longer depends on the answer, but Level 4 step 4 is where that is shown rather than argued. Turning on Safari's remote automation, or running step 4 first, would settle it.

**Prompt cost per photo**: `expected` about 1,300–1,400 tokens (S2's vision probe with one 900×610 JPEG: 1,303–1,359 tokens observed across Ollama and Anthropic compat). A 1568 px photo may cost more on providers that tile images; Level 5 records it.

## AMENDMENTS

- 2026-09-29: risk pass after the first draft, with five planning spikes (compiled `uqr`, QR decode, canvas encode on a 12 MP JPEG and HEIC, 202 plus polling, `stop(true)` across servers, all observed).
  - Upload changed from synchronous to 202 plus polling (R5).
  - Scheme fixed at five lines, `of` = 5 (R4).
  - HEIC fallback added to the encoder (A1).
  - `lanAddress` gained virtual-adapter filtering and ranking (A2).
  - Race test and mutation added (Q6).
  - Task 0 decides the T14 helper branch (R3).
  - Task 1 checks for a release before the edit (R1).
  - Open questions turned into decisions.
- 2026-09-29: review fixes to the risk pass.
  - `postPhoto` checks the token before the image, so `{}` is a 403 (AC 2).
  - The race mutation is split into two variants with stated expectations.
  - `closeAll` awaits background marking before a test's temp folder is removed.
  - Stale counts corrected.
- 2026-09-29: implementation. What shipped where it differs from the tasks above; see `.claude/reports/t13-examiner-mode-report.md`.
  - Task 13: `closeAll()` returns `Promise<void>`, not `void`. `lanAddress` ranks `192.168.56.*` after `172.16/12`. `getSnap` answers 409 "That question is no longer in the pack." when the snap's item cannot be rebuilt.
  - Task 15: the oversize case also posts the 6 MB body to the localhost route and expects 400. A fifth mutation check was added: the LAN Host check turned off turns the foreign Host/Origin test red.
  - Task 16, polling: supersedes "A 403 while polling → closed". On the phone, a closed snap's listener is stopped, so a poll fails to connect instead of getting a 403. `snap.js` shows the closed sentence after `MAX_FAILED_POLLS` = 15 failed polls in a row, about 30 s (`expected`). A good read resets the count; the 403 branch stays for the PC's local link.
  - Task 16, encoder: `api.upload` is a third seam, set inside `start()`, for the DOM test. A drop on `#drop` uploads at once. `encode` was rewritten from this plan's description, because the planning spike's page was not available; it was checked in Chrome (3000×2000 in, 1568×1045 out, observed).
  - Tasks 16–17, wording: three sentences were added for states the plan left unworded (`notSaved`, `notLoaded` on the snap page; `snapFailed` on the map). The prose gate changed two: the map intro now says "the way an examiner would", and the HEIC sentence now reads "This page cannot read that type of photo. …".
  - Task 17: `app/style.css` caps `.examiner .qr svg` at 14rem, because the QR code filled the column.
  - Task 18: `src/marking/retest.test.ts`'s page-POST guard now allows `/api/snap` and `/api/snap/photo`, and its path regex is `[a-z/]+`. `snap-dom.test.ts` has 11 cases: the 9 above, a failed upload, and failed polls reaching the closed sentence.
  - Level 4: steps 1–3, 5, 6 (PC half and slow model) and 7 were run on the compiled x64 binary (observed). Step 4 with a real phone and the locked-phone half of step 6 are owed to the user; AC 10 is owed by #41.
