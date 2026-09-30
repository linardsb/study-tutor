# PR #54 review fixes, round 1

Review: https://github.com/linardsb/study-tutor/pull/54#issuecomment-5906714538 (head `a00d78c`).
Triage (the user's call, 2026-09-30): fix all six, L3 included. Nothing deferred.

## Fixed

**F1 (High) SonarCloud reliability gate** (`app/quiz.js`, open-item click handler)
- Wrong: `postAttempt(...).then(...)` was a floating promise to Sonar's rule, though `postAttempt` ends in `.catch(() => false)` and cannot reject.
- Fix: the chain (now `already.then(...).then(...)`, see L2) is prefixed with `void`. `quiz.js:417` and `chat.js:163` predate this PR and were left alone.
- Failure mode of the fix: none at run time. `void` changes no behaviour; a throw inside `.then` was an unhandled rejection before and still is. The L2 chain is the only new promise chain in new code, and it is the one carrying `void`.
- Closing command: `gh pr checks 54` after each push (no local SonarCloud).
  - At `6a24f1f` (observed 2026-09-30): still **fail**, "C Reliability Rating on New Code". The `quiz.js:497` annotation was gone; the two left of the same rule were `app/quiz.js:426` (the markable item's `postAttempt(...).then`) and `app/chat.js:165` (`load();`). The review blamed both to earlier commits, but Sonar counts them as new in this PR, so the gate cannot go green without them.
  - At `4aea089`, both `void`-prefixed (neither rejects; behaviour unchanged): SonarCloud Code Analysis **pass** (observed 2026-09-30, `gh pr checks 54`).

**L1 (Low) server does not enforce v1 for markable items** (`.claude/references/events.md:21`)
- Fix: reworded. The page picks the version; `/api/event` accepts `null` on any `attempt@2` whether or not the item has `answers`. No code change (the option the user took from the review's two).

**L2 (Low) a lost reply let a retry write a second attempt and 10 XP** (`app/quiz.js`)
- Fix: after a save that got no reply at all (`postAttempt` resolves `null` on a rejected fetch; a 4xx/5xx reply resolves `false`), the next click first asks `GET /api/chat?item=…[&seed=…]` (built from `chatHref`) whether an attempt exists; `attempted: true` is treated as saved and nothing is posted. The first click never asks.
- Test: `quiz-dom.test.ts` "a saved line whose reply was lost is not posted again on retry (PR #54 L2)". The fake stores the line, then throws (the review's scenario: appended, response lost). Asserts 1 post, 1 GET, item done.
- Mutation probes on the final tree (observed 2026-09-30): GET removed (`const already = Promise.resolve(false)`) → 2 fail (the L2 test, the chat-down test). GET on every click → 5 fail, including "the first save does not ask the server first". `lost = true` on any failure (the `8225826` behaviour) → 2 fail, including the regression test below.
- Failure mode of the fix's mechanism, found by the advisor after the first push (`8225826`): `hasAttempt` matches any earlier attempt for the item, and the lesson quiz comes back on the 3/10/30/60 ladder, so earlier attempts are normal. At `8225826` any failed save set `lost`, so a plain 500 on a revisit made the retry skip the post and show "Saved": today's line, flame day and XP lost. Probe: item already saved, `next = "fail"`, click, retry → at `8225826` 1 post and `chatGets` 1 (`Expected: 0 Received: 1`, observed). Fixed in the second commit: only a rejected fetch sets `lost`; a refusal retries straight to the post. Test "a refused save on an item answered before is posted again, not reported saved" (2 posts, 0 GETs).
- Remaining, accepted: (a) the GET itself fails → the retry posts, which may duplicate (the pre-fix behaviour); test "a retry whose check cannot reach the tutor posts, rather than claiming the line was saved". (b) A save with no reply on a revisit: the GET finds the earlier visit's attempt and reports saved without today's line. Untested; stated in the PR body's notes as the review allowed ("accept it and say so in the PR").

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
- Prose gate: a mental pass only (no-ai-slop and humanizer were not run as skills): "Mark my answer" is three plain words in the page's existing register.

## Deferred

None.

## Needs a manual look

- The browser steps from the PR (type, save, click the link, read the label and button on screen) are still pending by hand; happy-dom covers them.
- SonarCloud's verdict after the push (F1).

## Gate

`bun run check` on the final tree (2026-09-30, issue49 worktree): exit 0, 755 pass, 0 fail, 72 files; biome 194 files, no fixes, 4 warnings (observed). 755 = 748 + 7 new tests (4 in `quiz-dom.test.ts`, 3 in `snap.test.ts`; derived). The first push (`8225826`) had 754. `bun scripts/test-generators.ts`: all 6300 runs pass (observed).

## Copy sweep (retired values and nouns)

Greps over `.claude/plans/issue-49-short-attempt.md` (plan), `.claude/reports/issue-49-short-attempt-report.md` (report), PR body (`gh pr view 54 --json body`):

| `grep -n` pattern | Hits before | Action |
|---|---|---|
| `748`, `754` | PR body :24, report :41 | PR body validation updated to 755; report :41 kept as the `a00d78c` figure, a round-1 line added |
| `72 files` | PR body :24, report :41 | unchanged (still 72) |
| `194` | PR body :24 | unchanged (still 194) |
| `6300` | PR body :25, report :42 | unchanged (re-run, still 6300) |
| `18 files\|1146\|34 del` | PR body :14 | updated to the post-fix diff stat |
| `examiner\|snap\|lastAttempt` | PR body :46, plan :11, plan :515, report :58, `events.md:28` | PR body :46 rewritten; plan :515 marked retired; `events.md:28` states the filter; plan :11 (pre-PR state) and report :58 (null-handling grep) stay true |
| `Mark my steps` | plan :443 | changed to "Mark my answer" |
| `retry\|Not saved` | plan :291, :404, report :55 | still true (a failed post stays retryable); no change |
