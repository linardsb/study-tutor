# PR #54 review fixes, round 1

Review: https://github.com/linardsb/study-tutor/pull/54#issuecomment-5906714538 (head `a00d78c`).
Triage (the user's call, 2026-09-30): fix all six, L3 included. Nothing deferred.

## Fixed

**F1 (High) SonarCloud reliability gate** (`app/quiz.js`, open-item click handler)
- Wrong: `postAttempt(...).then(...)` was a floating promise to Sonar's rule, though `postAttempt` ends in `.catch(() => false)` and cannot reject.
- Fix: the chain (now `already.then(...).then(...)`, see L2) is prefixed with `void`. `quiz.js:417` and `chat.js:163` predate this PR and were left alone.
- Failure mode of the fix: none at run time. `void` changes no behaviour; a throw inside `.then` was an unhandled rejection before and still is. The L2 chain is the only new promise chain in new code, and it is the one carrying `void`.
- Closing command: `gh pr checks 54` after the push. Not reproducible locally (no local SonarCloud); result recorded below once CI runs.

**L1 (Low) server does not enforce v1 for markable items** (`.claude/references/events.md:21`)
- Fix: reworded. The page picks the version; `/api/event` accepts `null` on any `attempt@2` whether or not the item has `answers`. No code change (the option the user took from the review's two).

**L2 (Low) a lost reply let a retry write a second attempt and 10 XP** (`app/quiz.js`)
- Fix: after a failed save (`lost = true`), the next click first asks `GET /api/chat?item=…[&seed=…]` (built from `chatHref`) whether an attempt exists; `attempted: true` is treated as saved and nothing is posted. The first click never asks.
- Test: `quiz-dom.test.ts` "a saved line whose reply was lost is not posted again on retry (PR #54 L2)". The fake stores the line, then throws (the review's scenario: appended, response lost). Asserts 1 post, 1 GET, item done.
- Mutation probes (observed 2026-09-30): GET removed (`const already = Promise.resolve(false)`) → the L2 test and the retry test fail (2 fail). GET on every click → 3 fail, including "the first save does not ask the server first".
- Failure mode of the fix's mechanism: (a) the GET itself fails → `attempted()` resolves false and the retry posts, which is the old behaviour; test "a retry whose check cannot reach the tutor posts, rather than claiming the line was saved" (2 posts). (b) `hasAttempt` matches any earlier attempt for the item, so if a pupil answered this item on an earlier day and today's first save fails, the retry reports saved without writing today's line. Accepted: it only happens after a failed save, the tutor already holds an attempt that opens the chat, and the teach-back marks the chat text, not the saved answer. Named here, not tested.

**L3 (Low) examiner mode marked a written answer on the numeric rubric** (`src/flow/examiner.ts`, `src/snap.ts`)
- Fix: `lastAttempt(log, keep)` takes an optional filter; `mintSnap` passes one that skips items whose `answers` are empty. An item no longer in the pack is kept, so it still reaches the existing `TEXT.gone` 409. A log whose only attempts are written answers gets the `noAttempt` 409.
- Tests: `snap.test.ts` "mintSnap skips written-answer items": written-only → 409 `noAttempt`; markable then written → 201 with the markable stem; markable then an id not in the pack → 409 `gone`.
- Probed with the review's own case (last attempt `8464/4.1.1.2#6` on the science pack) against the unfixed `mintSnap`: 2 fail, `Expected: 409 Received: 201` and the written item's stem returned (observed).
- Mutation: filter changed to drop gone items (`it !== null && …`) → the `gone` test fails (observed). Seeded generator attempts: the existing "a generated item: the snap and the event carry its seed" test still passes.

**L4 (Low) quiz DOM tests depended on run order** (`src/marking/quiz-dom.test.ts`)
- Fix: a `beforeEach` resets the section, `posts`, the fake's saved set and GET log, and calls `quiz.initQuiz` on a fresh section. Each case sets up its own typed text and ticks through `filled()`.
- Closing command, the review's own: `bun test src/marking/quiz-dom.test.ts -t "retry posts attempt@2"`. On the `a00d78c` test file: 0 pass, 1 fail. On the fixed file: 1 pass, 0 fail (observed 2026-09-30).

**L5 (Low) copy mismatches for written items** (`app/chat.js`, `app/quiz.js`)
- Fix: for `short`/`extended`/`practical-method` the teach-back button reads "Mark my answer" beside the "Explain your answer, one point per line." label. Once an open item is saved, "Ask the tutor" (`.ask`) is hidden, so only "Get it marked by the tutor" shows.
- Tests: `chat-dom.test.ts` asserts the button text for both types; with `app/chat.js` reverted the written case fails (observed). `quiz-dom.test.ts` retry case asserts `.ask` hidden; deleting `ask.hidden = true` fails it (observed).
- Prose gate: "Mark my answer" is three plain words in the page's existing register; no-ai-slop / humanizer pass, no change.

## Deferred

None.

## Needs a manual look

- The browser steps from the PR (type, save, click the link, read the label and button on screen) are still pending by hand; happy-dom covers them.
- SonarCloud's verdict after the push (F1).

## Gate

`bun run check` on the fixed tree (2026-09-30, issue49 worktree): exit 0, 754 pass, 0 fail, 72 files; biome 194 files, no fixes, 4 warnings (observed). 754 = 748 + 6 new tests (3 in `quiz-dom.test.ts`, 3 in `snap.test.ts`; derived). `bun scripts/test-generators.ts`: all 6300 runs pass (observed).

## Copy sweep (retired values and nouns)

Greps over `.claude/plans/issue-49-short-attempt.md` (plan), `.claude/reports/issue-49-short-attempt-report.md` (report), PR body (`gh pr view 54 --json body`):

| `grep -n` pattern | Hits before | Action |
|---|---|---|
| `748` | PR body :24, report :41 | PR body validation updated to 754; report :41 kept as the `a00d78c` figure, a round-1 line added |
| `72 files` | PR body :24, report :41 | unchanged (still 72) |
| `194` | PR body :24 | unchanged (still 194) |
| `6300` | PR body :25, report :42 | unchanged (re-run, still 6300) |
| `18 files\|1146\|34 del` | PR body :14 | updated to the post-fix diff stat |
| `examiner\|snap\|lastAttempt` | PR body :46, plan :11, plan :515, report :58, `events.md:28` | PR body :46 rewritten; plan :515 marked retired; `events.md:28` states the filter; plan :11 (pre-PR state) and report :58 (null-handling grep) stay true |
| `Mark my steps` | plan :443 | changed to "Mark my answer" |
| `retry\|Not saved` | plan :291, :404, report :55 | still true (a failed post stays retryable); no change |
