# PR #22 review fixes, round 1

**Review** `.claude/code-reviews/pr-22-review.md` (2 High, 4 Medium, 6 Low) · **Fix commit** `1c2abd1` on `feature/t3-maths-content-pack` · **Date** 2026-09-27

Triage, following the review's own recommendation (no separate steer was given): F1 to F5 and F7 to F11 fixed in this PR. F6 stays on issue #24, which the review opened. F12 is a note on what the 6300 figure proves; nothing to change.

## Fixed

Every probe below ran on this Mac (Bun 1.3.4) in the worktree, `observed`. "Old" is the tree at `509696f`, "new" is `1c2abd1`. Closing probes ran at 12:20 on 2026-09-27 against the committed tree.

**F1 · SonarCloud gate: argv paths, bare `.sort()`, complexity.** `process.argv` is gone from both scripts: `convert-lessons.ts` is fixed to `content/maths/lessons` and `content/maths/items` (the only lessons with hand-written quiz blocks), and `test-generators.ts` walks every directory under `content/` that has a `generators.js`, so the gate covers a second subject without an argument. `grep -n process.argv scripts/*.ts` → no hits. Every `.sort()` on a string array in a non-test file carries `(a, b) => a.localeCompare(b)`: `grep -n "\.sort()" scripts/*.ts src/content/*.ts | grep -v test` → no hits. `checkGenerators` now loops seeds and calls `checkOne(q): string[]`, with the working check in `checkWorking`; the planted-fault test still asserts all three messages and the seed prefix. Cognitive complexity is `derived` by hand at 11 for `checkOne`, 5 for `checkWorking`, 11 for `checkGenerators`; SonarCloud's own count is the gate and runs on the push. The PR body's CI `ready` sentence is replaced (see PR body below).

**F2 · `ItemView` was compile-time only and kept `mark_scheme`.** Old probe, the review's own shape: `const v: ItemView = item; JSON.stringify(v)` → keys `id,topic,type,stem,answers,working,mark_scheme,misconceptions`. New: `ItemView` omits `mark_scheme` too, and `toItemView(item)` in `pack.ts` destructures the four fields away. Closing probe on the same item → `id,topic,type,stem`. Test `toItemView drops the answer and everything that narrows it, at runtime` asserts the JSON keys contain none of the four and equal the rest. New failure mode of the mechanism: none that swallows anything; the function is a rest destructure with no branch. The plan's GOTCHA and Appendix snippet, and the PR body's guard paragraph, now say four fields and name `toItemView`.

**F3 · a second subject replaced the first's generator table.** Old probe, the review's own sequence: `loadGenerators("maths")`, `loadGenerators("other", <tmp>)`, `loadGenerators("maths")` → `21 X 1 X` (the third call returned `other`'s table). New: a module-level `Map` keyed by the resolved `generators.js` path. Closing probe → `21 X 21 true` (the third result is the first object). Test `loadGenerators returns each subject's own table on a repeat call…` writes a temp `content/other/generators.js` and asserts the same. Against old sources (stashed) the test failed on `toHaveLength(21)`, and its polluted global also knocked over the two maths generator tests that follow it, which is the finding as stated. Fix-mechanism check: the cache is keyed by file path, not subject, so the same subject under two roots is two entries, and a table that failed to set `GEN` is never cached (the throw comes first).

**F4 · `loadTopics` cwd-relative, `subject` unvalidated.** Old probes: from the scratchpad directory `loadTopics("maths")` → `ENOENT`; `loadGenerators("../x", <tmp>)` printed `TRAVERSAL RAN` from a planted `<tmp>/x/generators.js`. New: `subjectDir(subject, root)` in `pack.ts` throws unless `subject` matches `/^[a-z]+$/`, and both loaders go through it; `loadTopics` takes `root`. Closing probes: from the scratchpad, `loadTopics("maths", <repo>)` → 21; `loadGenerators("../x", <tmp>)` → `subject must be a lower-case word, got "../x"`. Tests: `subjectDir refuses anything but a lower-case word…` (five bad names, one good), `loadTopics reads from root, not the cwd…` (chdir to a temp dir, restore in `finally`). The cwd test could not be run against old sources because the file imports `subjectDir`, which did not exist; the manual ENOENT probe above is the old-tree evidence.

**F5 · `splitWrong` mis-split on an unspaced `=` in a message.** Old probe, the review's input verbatim: `splitWrong("y=2x+16=You added 6, so c=4.")` → `{"answer":"y=2x+16=You added 6, so c","message":"4."}`. New: throws when the key holds whitespace. Closing probe → `wrong-answer key "y=2x+16=You added 6, so c" holds a space: an unspaced "=" inside the message of "…"?`. Test `splitWrong refuses a key holding a space…`, red on old sources (`expect(received).toThrow`), green on new. The 312 committed pairs still convert (`bun run convert` leaves `git status --short content/` empty).

**F7 · 60 figures and 42 scaffolds pinned.** Old probe: a `bun -e` count over `items/*.json` → `figures 60 scaffolds 42`. The items test now counts both and asserts them with the same "observed" comment style. No old-code run: the test is a new assertion on committed data, and the deep-equal test already covers the converter side.

**F8 · `SHAPE.number` bypassed `norm`; `NUMBER` missed U+2212.** Old probe: `Number("1,200")` → `NaN`, `Number("")` → `0`, `"−5".match(NUMBER)` → `["5"]`. New: `norm(v) !== "" && Number.isFinite(Number(norm(v)))`, and `numbers()` replaces `−` with `-` before matching. Closing probe through `checkGenerators(…, 1)`: empty answer 1 failure, `1,200` 0, stem `−5` with working `-5` 0. Test `checkGenerators: an empty answer is not a number…`, red on old sources. One fixture correction during the round: the stem-number check reads `1,200` in a working as `1` and `200`, so the grouped fixture's stem uses `600` (a fixture matter, not the finding; the comma case in `numbers()` is untouched).

**F9 · `"$10."`.** Replacer function `(_, sign) => \`${sign}0.\``. Closing probe: `.5` → `0.5`, `-.5` → `-0.5`, `0.50` → `0.5`. Normalise test gains the `-.5` row. Behaviour unchanged, so no red run exists; the old form also passed.

**F10 · `text()` entities; `loadTopics` cast unchecked.** `&nbsp;` → space, `&times;` → `×`, `&#(\d+);` → `String.fromCodePoint`. Closing probe on a stem `65%&nbsp;of 200&#39;s &times; 1.` → `65% of 200's × 1.`; the parse test's second stem now carries those three entities and was red on old sources (`expect(received).toBe`). The one `&nbsp;` in the committed lessons is in an SVG outside the quiz section of lesson 0011 (`awk` over the quiz sections → no hits), so `items/` is unchanged. `loadTopics` checks every row for string `id` and `title`, array `aliases` and `prerequisites`, tier `F` or `H`, and throws `<file>: not a list of topic rows`; tested with a temp `content/bad/topics.json`.

**F11 · `content-pack.md`.** Layout lines 9 and 10 now show the `/<slug>` id form and `figure?`, `scaffold?`, `hint?`, `working?`.

## Figures that changed, and where each copy was updated

| Value | At `509696f` | At `1c2abd1` |
|---|---|---|
| `bun test` | 13 pass, 2260 expect() calls, 5 files | 19 pass, 2326 expect() calls, 5 files |
| Biome | Checked 40 files | Checked 40 files |
| Generator gate | `all 6300 runs pass` | `maths: generators: 21 …` then `all 6300 runs pass` |
| `ItemView` omits | 3 fields | 4 fields, plus `toItemView` |

Sweep at `1c2abd1`, `grep -rn` over `.claude/plans/t3-maths-content-pack.md`, `.claude/reports/t3-maths-content-pack-report.md`, `.claude/references`, `docs/prd`:

- `13 pass` → plan line 394 (now "19 pass … after the PR #22 round-1 fixes; 13 before"), report line 52 (both figures, dated).
- `2260` → report line 52 only, kept beside the new figure.
- `omits \`answers\`` → no hits in the tree; the PR body's guard paragraph is rewritten (below).
- `ItemView` → plan lines 238, 244, 881 updated; `types.ts` docblock names `toItemView`.
- `loadTopics(subject)` → plan lines 128 and 239 updated to `loadTopics(subject, root)`.
- `argv`, `.sort()`, `checkGenerators` in the plan's Appendix listings (lines 985 to 1560) are the pre-review source, left as written and declared so in the plan's AMENDMENTS entry for this round.
- `ready\` job` → no hits in the tree; the PR body footer is replaced.

## Deferred

- **F6 (Medium, content rule breaches in the v1 lessons)** → issue #24, opened by the review. Fixing it means editing lesson markup, which AC #6 freezes for this ticket; the converter change in F10 does not touch it either.

## Won't fix

- **F12** is a note on what the 6300-run gate checks (consistency, not arithmetic). No change asked; the PR body's "all 6300 runs pass" wording stands.

## Needs a human look

- **SonarCloud** on the pushed branch: `SonarCloud Code Analysis pass` (`observed`, `gh pr checks 22` after the push, 22 s). Remaining annotations are all warning level: `replace` → `replaceAll` notes on `normalise.ts` and `text()`, two regex notes on `test-generators.ts`. Cycle 1 of 3; no second cycle needed.
- **`loadTopics` root test uses `process.chdir`** inside `bun test`, restored in `finally`. Bun runs the five test files in one process in sequence, so no other file sees the temp cwd; if the suite is ever run with file-level parallelism, this test is the one to revisit.

## Pushed

Fix commit `1c2abd1` and this report's commit are on `feature/t3-maths-content-pack`; PR #22 body updated (guard paragraph, validation block, draft footer).
