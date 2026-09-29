# PR #44 review: T13 examiner mode

**PR** https://github.com/linardsb/study-tutor/pull/44 · **Head** e728124 · **Base** main @ `ab1ddd91c3ebac58909eb7d678e25dc7cbf55e32` · round 1 · 2026-09-29
**Live base tip at review** `8a0e9f7` (T14 #43 merged after this PR opened)

**Recommendation: request changes.** There are 2 High findings. SonarCloud's quality gate is red, and the branch conflicts with `main` in 8 files. Three Medium findings sit under them. Most of the code is careful: the LAN listener, the token handling and the confinement of `data/` held up under review.

| Severity | Count |
|---|---|
| Critical | 0 |
| High | 2 |
| Medium | 3 |
| Low | 6 |

## Validation

| Check | Result | Provenance |
|---|---|---|
| `bun run check` (tsc + biome + bun test) at e728124 | exit 0, 518 pass, 0 fail, 48 files, 4 biome warnings | observed, reviewer run in `~/Desktop/study-tutor-t13` |
| `bun run build` at e728124 | exit 0. `StudyTutor-mac.zip` 47,048,063 bytes, `StudyTutor-windows.zip` 41,326,939 bytes, 0 `node_modules` entries in the mac zip | observed, reviewer run |
| SonarCloud Code Analysis | **fail**: Security Rating B, Reliability Rating D on new code (both must be A) | observed, check-run output |
| `codeql` / `audit-diff` / `check` CI jobs | not present on the PR. Code scanning API returns 403 "not enabled" | observed |
| Merge against `origin/main` @ 8a0e9f7 | **8 conflicting files** | observed, `git merge-tree --write-tree` |

Sizes differ by a few bytes from the report (47,047,818 and 41,326,694). This is expected, because a rebuild stamps new bytes.

## Findings

### F1 (High): SonarCloud quality gate red
- **What:** the only check on the PR fails. It gives Security B and Reliability D on new code. A D rating means at least one reliability bug of Critical impact. A B rating means at least one Minor vulnerability.
- **Not triaged here:** the issue list could not be read. An unauthenticated `api/issues/search` call answers "Project doesn't exist" because the project is private. None of F3–F11 can be matched to the Sonar list by `file:line`.
- **Fix:** open the dashboard link on the PR, then fix or justify each issue there. Record which Sonar issue each fix closes.

### F2 (High): branch conflicts with `main` after T14 (#43)
- **What:** 8 files conflict: `.claude/references/events.md`, `src/api/event.ts`, `src/events/append.test.ts`, `src/events/append.ts`, `src/events/types.ts`, `src/marking/map-dom.test.ts`, `src/marking/retest.test.ts`, `src/server.ts`. The PR cannot merge as it stands.
- **Fix:** rebase onto `origin/main`. Then re-derive the following, rather than relying on a green run:
  - **The plan's own tripwire fired.** Plan line 184 says that once `makeDataDir` is on `main`, Task 7 should call `makeDataDir(dataDir, INTAKE_DIR)`. It is on main now (T14).
    - `makeDataDir` calls `fs.mkdirSync(real)` with **no mode**, while the branch creates `intake/` as `0o700`.
    - Following the plan literally would leave `intake/` at the umask default.
    - Keep the folder owner-only: add a mode parameter or a `chmodSync`, and add a test that `intake/` is `0700` on POSIX.
  - **Page-POST guard in `src/marking/retest.test.ts:198`.** Main allows `event|config|chat|squad|squad/join`, and this branch allows `event|config|chat|snap|snap/photo`. The merged regex needs all seven entries, and the test title needs updating to match.
  - **`src/api/event.ts` `refusal`.** Keep both refusals (`squad`, `photo`). The docblock above it should name both.
  - **`src/events/types.ts`.** `squad@1` and `photo@1` were both edited in place. That was justified by `gh release list` being empty, and it still is (observed at review). Keep both `KEYS` rows.
  - **`src/server.ts`.** Merge both route sets. The LAN listener has its own route table (`src/snap.ts:386`), so `/api/squad*` does not leak onto the LAN. Confirm that after the rebase with the existing allow-list test.
  - **Plan line 671** says the conflict is "textual and adjacent only". Treat that as a claim to check against the rebased tree, not as a fact.

### F3 (Medium): in `--mcp` mode the phone listener outlives stdin
- **Where:** `src/server.ts:306-311` and `:448-470`.
- **Mechanism:** `apiRoutes` creates `snaps` itself (`opts.snaps ?? createSnaps()`), and `main` never passes one. After `runStdio` returns, `server.stop(true)` stops only the main server.
- **Failure:** the pupil mints a snap from the map during an MCP session, and then the harness closes stdin. The LAN `Bun.serve` and its `setTimeout` keep the process alive for up to 15 minutes, or 10 minutes after an upload.
  - It can still take an upload and append a `photo` event after the harness thinks the session has ended.
  - This breaks CLAUDE.md: "the harness closing stdin stops it".
- **Fix:** create `snaps` in `main`, pass it as `opts.snaps`, and `await snaps.closeAll()` before `server.stop(true)`.

### F4 (Medium): the number guard does not stop a spelled-out answer, and two instructions conflict
- **Where:** `src/jobs/examiner_mark.ts:38`, `:101`; `src/jobs/define.ts:20-33`; `src/jobs/guard.ts:14-19`.
- **(a) Spelled-out numbers get through.** The TASK asks for each note "in words", and `numbersIn` matches digits only.
  - **Failure:** the note "The final value should be twelve, not seven." passes the guard and reaches the phone.
  - The PR body, the report and the guard restatement all say "the corrected value cannot reach the screen". That is stronger than the code enforces.
  - No test uses a number word.
  - The CLAUDE.md ground rule still holds, because the job only runs on a `PostAttempt`. This is a defect in a stated guarantee, not an answer leaking before an attempt.
- **(b) The two instructions contradict each other.** `postAttemptSystem` appends NUM: "use only numbers that appear in the question, the lesson's hint or the pupil's own words". TASK says "do not write any number that is not printed in the question", and `sources` is the stem alone.
  - **Failure:** a model that follows NUM quotes the pupil's "12". The guard refuses it, and the retry sends the same messages. The result is `null`, shown as "stored, not marked".
  - How often this happens is not measured (`expected`, not observed).
- **Fix:**
  - Give `examiner_mark` a system message without NUM, or override NUM for this job.
  - Change TASK to "no numbers, in digits or in words".
  - Narrow the claim in the PR body, the report and `.claude/references/model-jobs.md` to "no digit outside the stem".
  - Optionally add a guard for number words from two upwards. "one" would give false refusals.

### F5 (Medium): no test checks what address the LAN listener binds to
- **Where:** `src/snap.test.ts:89` (`snapHost: () => "127.0.0.1"`).
- **Gap:** the report's mutation 1 shows that binding to `0.0.0.0` leaves the suite green. The CLAUDE.md network rule ("the O3 camera route on the LAN address") is currently covered only by the manual curl in Level 4.
- **Fix:** add a test that asserts the LAN listener's `server.hostname` equals `snapHost()`. That mutation should then turn the suite red.

### F6 (Low): LAN routes have no error handler
- **Where:** `src/snap.ts:382-423`.
- **Gap:** the localhost `snapRoute` wraps its handler in try/catch (`src/server.ts:294-301`). The LAN `Bun.serve` has no `error` handler.
- **How it throws:** `getSnap` calls `readConfig`, which rethrows an error from `resolveInData` other than a missing file, for example a `config.json` symlinked out of `data/`. That request would get Bun's default error response.
- **Fix:** add `error: () => json(500, …)`.

### F7 (Low): the phone page can poll forever
- **Where:** `app/snap.js:141-151`.
- **Failure:** a 409 or 500 reply resets `failed` to 0 and is neither `done` nor 403, so the page polls every 2 s with no end. This is separate from deviation 11, which covers failed connections.
- **Fix:** count every reply that is not OK towards `MAX_FAILED_POLLS`, and do not reset the count on one.

### F8 (Low): a lost 202 turns into "expired"
- **Where:** `app/snap.js:170-186`.
- **Failure:** the server saves the photo and sends 202, but the reply is lost on flaky Wi-Fi. The pupil retries and gets 403, and the page hides the form and says "expired" while marking is running.
- **Fix:** on a 403 after an upload attempt, GET the status and poll if the state is `marking` or `done`.

### F9 (Low): the map stat can mislead
- **Where:** `app/map.js:175-188`.
- **Failure:**
  - With no model set, photos are stored but never marked, so `of - marks` is 0 and the map shows "0 marks left on the table". That reads as a perfect week.
  - `lastLeft` takes the latest earlier week that has photos, which may be weeks back. The label and the PR body say "last week".
- **Fix:** hide `left` when `marked === 0`. Compare against the ISO week just before, or label the figure as the previous week with photos.

### F10 (Low): pupil-facing text
- `src/snap.ts:39`: `notSaved` has no full stop, and it reaches the phone through `body.error`. The `app/snap.js:11` version has one.
- `app/snap.js` `closed`: "Your marks are on the map" is false when the photo was stored but not marked.

### F11 (Low): the PR body describes CI that did not run
- The footer says CI's `ready` job flips the draft when `check`, `audit-diff` and `codeql` are green. None of those jobs ran on this PR (observed: only SonarCloud, and code scanning is disabled).
- This comes from the `piv-create-pr` template, not from T13. Fix the template.

## Numbers pass

Every figure in the PR body and the report was checked:
- **Line and file counts.** 3,435 lines added across 35 files was re-derived (`git diff --numstat ab1ddd9..HEAD`). The split is 748/1,451 if the fixture line counts as a test and 749/1,450 if it counts as src. The PR used the second, and the total matches.
- **Test counts.** 518 pass (observed). Per file, 18 `examiner_mark` and 27 `snap` tests (observed, `bun test` per file).
- **Constants.** `MAX_FAILED_POLLS` 15 × `POLL_MS` 2000 = 30 s, correctly labelled `expected`. `SNAP_TTL_MS` 15 min, `AFTER_UPLOAD_MS` 10 min and `LONG_SIDE` 1568 match the code.
- **Level 4 claims.** Reported as observed, with the phone step honestly marked as owed.
- **One overclaim.** "The corrected value cannot reach the screen" is a guarantee, not a figure. It is F4.

## Constraint pass

`grep -in "do not modify|frozen|…"` on the plan finds no freeze that any recommended fix would break. F2's `makeDataDir` step follows plan line 184.

## Done well

- The find-then-take claim re-checks the snap state inside `take`, and mutations 3 and 4 show that re-check is what stops a double upload.
- The LAN allow-list is independent of the bind address. Only `/snap.html` (token required), `/snap.js`, `/style.css` and the two snap routes are served. `/api/*` returns 404, and Host and Origin are checked.
- The token is 32 bytes from `crypto.getRandomValues`, compared with `timingSafeEqual`, one upload per token, with both a timer and a deadline for expiry.
- Upload hardening:
  - the length is checked before decoding
  - the image type comes from magic bytes
  - the file name is built by the server
  - `intake/` is checked with realpath, and symlinks are refused
  - the file is written `O_EXCL | O_NOFOLLOW` with mode `0600`
- `examiner_mark` validates exactly five lines in a fixed order and has no field for a solution. A sentinel test proves `answers` never enters the prompt. Stem, notes and errors go in with `textContent`.
- The report is honest about what a real phone still has to check (reach, the firewall prompt, HEIC in WebKit, locking the phone mid-mark), and it does not claim more.

## Next

Run `piv-fix-review-findings` on this report. Order: F2 (rebase) first, then F1 (Sonar list), then F3–F5. Re-run `bun run check` after the rebase.
