# PR #38 review fixes, round 1

Review: https://github.com/linardsb/study-tutor/pull/38#issuecomment-5873608717 (2 High, 1 Medium, 2 Low). No scope steer came with it. All five are in this PR's own files or in the one T6 test it breaks, so all five were fixed here and none was deferred.

Branch rebased onto `origin/main` 723fd13 (T6 #36) before any fix. The rebase applied cleanly. `bun install` added T6's `@happy-dom/global-registrator`.

## Fixed

| Finding | Fix | Test, and the unfixed run |
|---|---|---|
| F1 High, SonarCloud DOM XSS at `app/chat.js:37` | The figure is parsed with `new DOMParser().parseFromString(figure, "text/html")` and its body nodes are moved in with `replaceChildren`. No `innerHTML`. | See "F1 mechanism" below. SonarCloud Code Analysis on the pushed commit `0c15879`: pass (observed, `gh pr checks 38`, 2026-09-28). |
| F2 High, T6's POST allowlist refuses `/api/chat` on the merged tree | `src/marking/retest.test.ts`: the regex is `(event\|config\|chat)`, the title names `/api/chat`, and one comment line says the route saves only through `postEvent`. | With only this file reverted on the rebased tree, the test fails with `"p": "chat.js:/api/chat"` (observed). With the fix it passes. |
| F3 Medium, `numbersIn` does not see `¾`, `²` or full-width digits | `text.normalize("NFKC")` before the regex in `src/jobs/guard.ts`. | New test "vulgar fractions, superscripts and full-width digits count as numbers". It uses the review's own input, `guardReply(["It comes to ¾"], ["Share 6 in the ratio 1:2"])`, plus `x³` and `８`. On the unfixed code it failed with `Expected: "invented-number"`, `Received: null` (observed). |
| F4 Low, `1,000,000` read as 1000 and 0 | The comma is now dropped with a lookahead: `replace(/(\d),(?=\d{3}\b)/g, "$1")`. | One assertion added to the thousands test: `numbersIn("1,000,000")` → `{"1000000"}`. It failed on the unfixed code (observed). |
| F5 Low, the second taught-today check uses the day from the start of the request | `src/api/chat.ts` passes `localDay(now())` to the second `taughtOn` check. | New test "a teach-back that runs past London midnight checks the day it saves on". The clock reads 22:59:50Z (5 Oct, London). Inside the mocked provider call the clock moves to 23:00:10Z (6 Oct, BST), and a second tab's `teachback` is appended at 23:00:05Z. On the unfixed code the test failed (`saved` true, 2 teachback lines). With the fix it passes (observed). The review's input was a reasoned scenario rather than a runnable command, so this is the same scenario as a test. |

### F1 mechanism: the new failure mode it could have had

The review's suggested parse, `image/svg+xml`, would have broken every figure. `grep` finds 60 `"figure"` values under `content/maths/items`, and 0 of them carry `xmlns` (observed). An XML parse without `xmlns` puts `<svg>` in no namespace, so it would not render. The HTML parse assigns the SVG namespace just as `innerHTML` does. All 60 figures are well-formed XML (Python `minidom`, 0 errors, observed), but that check is irrelevant to the HTML parse.

Checks on the fixed code:
- happy-dom (a DOM implementation run in Bun, no browser): the `1MA1/G17/circle#1` figure parses to `svg` with `namespaceURI` `http://www.w3.org/2000/svg` and 5 child elements, and is adopted into the page document (observed).
- Chrome through agent-browser, with the server on 4799 and a scratch data dir: `/chat.html?item=1MA1%2FG17%2Fcircle%231` shows the circle. The SVG namespace is correct and the box is 130×120 (observed, screenshot in the session scratchpad).

If SonarCloud still flags the new line after the push, the fallback is the review's first option: a human marks the issue "Safe" in SonarCloud. No second code variant will be tried.

### F3 cost

After NFKC, a superscript is a number. `guardReply(["Use π r² for the area"], ["Find the area of a circle of radius 5 cm"])` → `"invented-number"` (observed). A hint that names `r²` on a question with no 2 in it now falls back to the canned reply. That is one more source of false refusals, next to R2 ("divide by 100"). The alternative is an exemption for superscripts. It was not built, because it is the user's decision.

## Deferred

None.

## Needs a manual look

- None left. SonarCloud passed on `0c15879` (observed), so the "mark Safe" fallback was not needed.

## Gate

- `bun run check` on the rebased, fixed tree: exit 0, 395 pass, 0 fail, 4 Biome warnings (the same `style.css` ones) (observed, 2026-09-28). Derived: the review's merged-tree run had 392 pass + 1 fail = 393 tests. This round adds 2 new tests, 393 + 2 = 395. The F4 assertion went into an existing test.
- `bun scripts/test-generators.ts`: all 6300 runs pass (observed).

## Stale-figure sweep

The rebase moved the base from 252e50b to 723fd13, and the fixes added lines, so the size and gate figures were re-checked.

| grep | plan | T9 report | PR body |
|---|---|---|---|
| `grep -n "252e50b"` | 0 | 0 | 0 (the body names `90e606b`, rewritten) |
| `grep -n "3,248\|3248"` | 0 | 0 | line 13, rewritten |
| `grep -n "363"` | 0 | line 44, now qualified with the 395 figure | line 26, rewritten |
| `grep -n "28 files"` | 0 | 0 | line 13, rewritten |
| `grep -n "1,004\|1,434\|810 \|715 "` | 0 | 0 | line 13, rewritten |
| `grep -n "event or /api/config\|(event\|config)"` | 0 | 0 | 0 |
| `grep -n "innerHTML"` | line 498 (Task 14 GOTCHA), superseded by the dated amendment | step 5 line: "sets `innerHTML` only for the figure", historical Level 4 record, left as it was observed | 0 |

The same greps over `.claude/references` and `docs` returned 0 hits. The one `363` match in `docs/prd` is an arXiv id. The new PR body figures are re-derived against `origin/main` 723fd13 at the pushed head.
