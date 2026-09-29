# Implementation Report — T13 O3 Examiner mode

**Plan**: `.claude/plans/t13-examiner-mode.md`   **Branch**: `feature/t13-examiner-mode` (worktree `~/Desktop/study-tutor-t13`)   **Status**: COMPLETE (Level 4 steps that need a phone are owed; see Issues)

## Summary

The map mints a one-time snap for the pupil's last attempted item. It shows a QR code for a listener bound to the PC's Wi-Fi address only while that snap is open, plus a local link for a dropped file. The upload is saved to `data/intake/` and answered with 202. It is then marked in the background by the `examiner_mark` vision job: five fixed lines, out of 5. The photo event is appended after that, and the page polls for the result. `photo@1` gains `seed`, `marks`, `of` and `clean` in place. Replay adds weekly `photos` sums (shape 4). The map shows marks left on the table this week against last week, and the week's clean sheets.

**Guard (restated per CLAUDE.md).** `examiner_mark` takes `PostAttempt` only. `jobItem` mints that brand only after `hasAttempt` finds an attempt event for the item id, and for the seed of a `#gen` item (`src/jobs/view.ts`). `src/flow/examiner.ts` returns `refused` without calling the job otherwise (tests: 0 fetches). The mint route also picks its item from the last attempt event. The prompt is the post-attempt variant, carries `mark_scheme ?? working` and never `answers`, and asks for marks per line only. `sources` is the stem alone. So a note can quote no number from the working or the photo, and the corrected value cannot reach the screen (test: "The answer is 9." → `guard`).

## Tasks completed

- Task 0: shape-3 data captured in scratchpad `shape3/` (`jq .shape` → 3). `git grep -c makeDataDir origin/main -- src/events/append.ts` found nothing, so Task 7 uses the inline `mkdirSync` and `isDirectory` lines as written.
- Task 1 → `src/events/types.ts` (UPDATE): `photo@1` fields, `FIELDS`, `KEYS`
- Task 2 → `src/events/__fixtures__/photo.v1.jsonl` (UPDATE): marked `#gen` line added
- Task 3 → `src/events/types.test.ts` (UPDATE)
- Task 4 → `src/events/replay.ts` (UPDATE): `PhotoWeek`, `photos`, shape 4
- Task 5 → `src/events/replay.test.ts` (UPDATE)
- Task 6 → `src/api/event.ts`, `src/api/event.test.ts` (UPDATE): posted photo refused
- Task 7 → `src/events/append.ts`, `src/events/append.test.ts` (UPDATE): `writeDataFile` takes bytes; `INTAKE_DIR`, `writeIntakeFile`
- Task 8 → `src/jobs/examiner_mark.ts` (CREATE)
- Task 9 → `src/jobs/examiner_mark.test.ts` (CREATE)
- Task 10 → `src/flow/examiner.ts`, `src/flow/examiner.test.ts` (CREATE)
- Task 11 → `scripts/fake-provider.ts` (UPDATE): examiner branch, matched on an `image_url` part
- Task 12 → `package.json`, `bun.lock` (UPDATE): `uqr@0.1.3`
- Task 13 → `src/snap.ts` (CREATE); `src/api/chat.ts` (UPDATE: `titleOf` exported)
- Task 14 → `src/server.ts` (UPDATE): `snapHost`, `snaps` options, `/api/snap`, `/api/snap/photo`
- Task 15 → `src/snap.test.ts` (CREATE)
- Task 16 → `app/snap.html`, `app/snap.js` (CREATE)
- Task 17 → `app/map.html`, `app/map.js` (UPDATE)
- Task 18 → `src/marking/snap-dom.test.ts` (CREATE); `src/marking/map-dom.test.ts`, `src/marking/map.test.ts`, `src/server.test.ts` (UPDATE)
- Task 19 → `.claude/references/events.md`, `.claude/references/model-jobs.md`, `docs/prd/study-tutor-v2.architecture.md` (UPDATE)
- Task 20: gate, build and shape-3 replay (below)

## Tests added

- `types.test.ts`: 10-row photo parse table (3 accepted, 7 refused).
- `replay.test.ts`: two-week photo sums. Week A `{taken 3, marked 2, marks 8, of 10, clean 1}`, week B `{1, 1, 1, 5, 0}`, so marks left A 2 and B 4 (`derived`: 10 − 8, 5 − 1).
- `append.test.ts`: bytes round trip; `0600` on POSIX; 5 refused names; `intake` symlinked out of `data/` is refused and nothing is written there.
- `event.test.ts`: a posted marked photo gives 400, and nothing is written, not even `data/`.
- `examiner_mark.test.ts`: 18 cases.
  - valid (4 of 5, clean), units 0 (3 of 5, not clean)
  - four rows twice (shape, 2 calls); seven wrong shapes (order, six rows, unknown kind, mark 2, `true` or `"1"`, null off units)
  - guard on the answer from the working; guard on `!`
  - invalid JSON twice (2 calls); down (`network`, 1 call); preset none (0 calls); HTTP 400 (`http`, 1 call)
  - prompt contents: no pre-attempt line, "Never write the corrected step", `SENTINEL-SCHEME` in part 0, no `SENTINEL-ANSWER-731` anywhere, part 1 a `data:image/jpeg;base64,` image; the working as the scheme when there is no `mark_scheme`
- `examiner.test.ts`: 5 cases. `lastAttempt`; refused with no attempt (0 fetches); refused on a seed mismatch (0 fetches); marks and not-marked; `photoRecord` round trip.
- `snap.test.ts`: 27 cases, the plan's 1–15 including 5b, 7a, 7b, 12b and 13b, plus a `decodeDataUrl` table. Everything runs through the real `startServer`, a real second listener on loopback, and the fake provider.
- `snap-dom.test.ts`: 11 cases: the plan's 9, a failed upload, and polls that cannot connect (the closed sentence after `MAX_FAILED_POLLS`; a good read in between resets the count).
- `map-dom.test.ts`: 4 cases (QR and link, `lan: null`, 409, photo stats). `map.test.ts`: `photoStats`. `server.test.ts`: `snap.html` static "This is an AI" markup.

**Mutation checks (Task 15), each observed:**

1. Listener bound to `0.0.0.0`: the "LAN: nothing without a valid token" test stays green, so the allow-list refuses `/api/state`, not the bind.
2. `find` check removed from `/snap.html`: the same test goes red.
3. Race (a), `await Bun.sleep(0)` between `find` and `take`: the race test stays green, because `take` re-checks the state.
4. Race (b), (a) plus `take` without its re-check: the race test goes red.
5. Extra, from the advisor's review: the LAN Host comparison turned off makes the foreign Host/Origin test go red. The 403 comes from the Host check itself. This was confirmed first: a Bun `fetch` with `host: evil.example` sends that header (observed probe).

## Validation results

- `bun run check` (tsc + biome + bun test): green, **518 pass, 0 fail**, 48 files (observed, final run after the F1 fix). biome shows 4 warnings, all in existing CSS/JS (`noDescendingSpecificity` in `style.css`); no errors.
- `bun run build`: `dist/StudyTutor-mac.zip` 47,047,818 bytes and `dist/StudyTutor-windows.zip` 41,326,694 bytes; `unzip -l` finds 0 `node_modules` entries (observed).
- Shape-3 replay (Task 20): the Task 2 marked line was appended to the scratchpad `shape3/data/events.jsonl`. `replay-check.ts` then exits 0, `state.json` has `.shape` 4 and `.photos` `{"2026-W42": {taken 1, marked 1, marks 3, of 5, clean 0}}`, and `state.prev.json` has shape 3 (observed).
- `gh release list`: empty, re-checked right before the commit (observed). The in-place `photo@1` edit stands.

**Level 4.** Run against the compiled `StudyTutor-x64` from the mac zip (this Mac is `x86_64`), with `scripts/fake-provider.ts`:

| Step | Result |
|---|---|
| 1 fake provider, `custom` preset | done by `POST /api/config` (200) |
| 2 mint after an attempt | 201; `lan` = `http://192.168.1.11:<port>/snap.html?token=…`, this Mac's Wi-Fi address; `qr` starts `<svg`; map in Chrome shows the stem, the QR and the link |
| 3 curl on the LAN address | `/api/state` 404; `/snap.html` 403; `?token=wrong` 403; `?token=<token>` 200; `127.0.0.1:<same port>` connection refused (curl exit 7) |
| 4 phone upload | **Not run with a phone.** A curl upload to the LAN address from this Mac stood in. That traffic stays on this Mac and never crosses the Wi-Fi or the macOS application firewall. So it shows the bind and the allow-list work, not that a phone can reach the listener. Result: 202, then `done` 4 of 5, clean. A second upload gave 403. One `.jpg` in `data/intake`, and the last line is `photo` with `marks 4, of 5, clean true`. `/api/state` has `photos["2026-W40"]` `{taken 1, marked 1, marks 4, of 5, clean 1}`; the map shows 1 left and 1 clean sheet. |
| 5 no model | preset none, local upload 202, `{model: false, state: done, result: {recorded: true, marked: false}}`; `photo` line with no `marks`. The previous snap's listener was refused after the re-mint. |
| 6 local link fallback | PC half done in Chrome (agent-browser): the snap page's real canvas `encode` took a 3000×2000 JPEG down to a 1568×1045 file (`sips`), and the page showed the five rows, "4 of 5. Marks left on the table: 1." and "Clean sheet.". The saved file is mode 0600. Slow model (`--delay 30000`): the LAN upload answered 202 in 0.005 s; the local link opened on the PC showed "Marking your working…" and then the five rows. **Locking a real phone was not done.** |
| F1 end to end | LAN page opened in Chrome, photo sent from the page, then a new mint stopped that listener. 36 s later the page read "This link has closed. Your marks are on the map on the computer." (observed) |
| 7 compiled binary | the QR renders from the compiled binary, so `uqr` is bundled |

## Deviations from the plan

1. `createSnaps().closeAll()` returns `Promise<void>`. The plan's signature said `void`, but its own bullet and every test await it.
2. `app/snap.js` exposes `api.upload`, set inside `start()`. The DOM test calls it in place of the file picker, because happy-dom cannot fill `input.files`. The plan named only `encode` and `wait` as seams.
3. Dropping a file on `#drop` uploads at once, with no Send press. The Send button serves the camera or file input.
4. Three sentences not in the plan cover states the plan left unworded. Each had a mental `no-ai-slop` / `humanizer` pass:
   - `snap.js` `notSaved`: "The photo was not saved. Take a new photo from the map." Shown when the status is `done` with `result: null`, after a failed file write.
   - `snap.js` `notLoaded`: "The page did not load. Check your Wi-Fi and try again." For a failed first GET.
   - `map.js` `snapFailed`: "The photo link did not open. Check the tutor window is still open." For a failed mint request.
5. Prose gate edits to the plan's wording:
   - `map.html` intro: "the way an examiner would" replaces "like an exam".
   - HEIC sentence: "This page cannot read that type of photo. …" replaces "This photo type cannot be read here. …", which was passive.
   - The prompt task line is unchanged.
6. `src/marking/retest.test.ts` (not in the plan): the "no page writes a file" guard allowed POSTs to `/api/event|config|chat` only.
   - It now allows `/api/snap` (mints a token held in memory) and `/api/snap/photo` (saves on the server through `writeIntakeFile` and `appendEvent`).
   - Its path regex widened from `[a-z]+` to `[a-z/]+`. Without that, a POST to `/api/snap/photo` was not seen by the guard at all.
7. `app/style.css` (not in the plan): `.examiner .qr svg` is capped at 14rem. The Level 4 screenshot showed the QR filling the 750 px column. There is also a margin on `#snap`.
8. `lanAddress` ranks `192.168.56.*` after `172.16/12`. The plan did not place it; the VirtualBox adapter is also dropped by name.
9. `getSnap` answers 409 "That question is no longer in the pack." when the snap's item cannot be rebuilt. The plan did not name this case.
10. `api.encode` is written from the plan's description. The planning spike's exact `scratchpad/canvas/page.html` belonged to another session and was not available. The replacement was checked in Chrome instead: 3000×2000 in, 1568×1045 JPEG out (observed).
11. On the phone, the closed state comes from failed connections, not a 403. Closing a snap stops its LAN listener, so the phone's next poll cannot connect; it never gets the 403 the plan's Task 16 expects. `snap.js` counts failed polls in a row and shows the closed sentence after `MAX_FAILED_POLLS` = 15, about 30 s (`expected`). Any good read resets the count, so a slow model reading `marking` never trips it. The 403 branch still covers the PC's local link. Found in the final review, before commit.
12. `snap.test.ts` oversize case also posts the 6 MB body to the localhost route and gets 400. The LAN listener's result is 400 or 413, as the plan allows.

UX states per surface:
- Snap page: loading ("Loading the question."), empty or expired (403 sentence, form hidden), error (not a photo, not saved, not recorded, HEIC), offline (network sentence on upload, `notLoaded` on the first GET, silent retry while polling), marking, done.
- Map examiner block: 409 empty state, `lan: null`, network failure (`snapFailed`), success. No state the plan named was left out.

## Issues encountered

- Level 4 step 4 needs a real iPhone, and it is owed to the user. It covers the HEIC and WebKit check, the macOS firewall prompt, and whether a phone can reach the listener at all. Plan A1 and its 9/10 confidence rest on this step. Locking the phone mid-mark (step 6) also needs one. The LAN path was exercised with curl and Chrome on this Mac only. No firewall dialog was visible to this session, but that does not prove none appeared on screen.
- AC 10 (Windows firewall prompt, phone reach) is owed by follow-up #41.
- Port 4731 was taken by another local session, so the compiled tutor took 4732 (the port ladder working).
- `StudyTutor-arm64` gives "bad CPU type" on this `x86_64` Mac. That is expected for the wrong architecture; the x64 binary ran.
- The repo hook refuses `rm -rf`, so the Level 4 run unzipped into a fresh folder (`scratchpad/l4run`).
