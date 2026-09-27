# PR #22 review: T3 maths content pack

**Head** `509696f` · **Base** main @ `379b35c851d777a0e441d33cb6bb630c18a93cf8` · **Round** 1 · **Reviewed** 2026-09-27
**State** DRAFT (SonarCloud quality gate failed; no CI workflow in this repo, so nothing flips the draft) · **Diff vs main** 80 files, +11345 / -3 (observed, `git diff --shortstat origin/main..HEAD`)

## Summary

The pack is what the plan describes and every figure in the PR body and the report re-derives (numbers pass below). Lessons and reference sheets are byte-identical to the donor, `generators.js` is byte-identical to the donor run through the formatter, the three reported mutations go red when re-run, and `bun run check` plus the 6300-run gate are green in the worktree. Two things block merge: the only required check is red with seven gate-level annotations, and the guard the PR body names ("`ItemView` omits `answers`, `working` and `misconceptions`") is a type alias with no runtime projection and it keeps `mark_scheme`. Below those, the loaders have a second-subject and a working-directory problem that T4 will hit, and the v1 lessons carry pupil-facing text that breaks `.claude/rules/content.md`, which the plan's own ACs stop this PR from fixing (issue #24).

**Recommendation: request changes.** 0 Critical · 2 High · 4 Medium · 6 Low.

Fresh eyes: the deep pass ran in the `code-reviewer` agent in a clean context, pointed at this repo's `CLAUDE.md`, `content-pack.md` and `rules/content.md`. F2 to F6, F7, F8 and F10 are the agent's, each re-checked here; F1, F9, F11 and F12 are this session's.

## Issues

### High

**F1 · SonarCloud quality gate red: D reliability, C security on new code.** `observed` via `gh api …/check-runs/{id}/annotations`: 24 annotations, 7 at failure level. The seven, with the fix each wants:
- `scripts/convert-lessons.ts:112`, `:151` and `scripts/test-generators.ts:118`: "Path traversal via LLM-supplied CLI arguments". `process.argv` paths go straight into `readdirSync` and `Bun.write`. Fix: resolve each against the repo root and refuse anything outside `content/` (`const p = path.resolve(arg); if (!p.startsWith(path.resolve("content") + path.sep)) throw`), or drop the argv override and hardcode the two `content/maths` paths, which is all the script is used for.
- `scripts/test-generators.ts:51`, `:129`, `:136`: `.sort()` with no comparator on string arrays. Fix: `.sort((a, b) => a.localeCompare(b))`; the order is only for determinism, so any comparator serves.
- `scripts/test-generators.ts:46`: `checkGenerators` cognitive complexity 40 of 15. Fix: lift the per-run body into `checkOne(code, seed, q): string[]` and keep the loop in `checkGenerators`.

The 17 warnings are `replace` → `replaceAll`, regex backtracking notes and one `toHaveLength`; none is gate-level, but the `$10.` one is real (F9). Two PR-body claims fall with this: "CI's `ready` job flips it when `check`, `audit-diff` and `codeql` are green" describes jobs this repo does not have (`observed`: no `.github/workflows`, same as PR #21's review), so the draft stays a draft until a human flips it; and SonarCloud, the one check that exists, is the required gate.

**F2 · `src/content/types.ts:51` · the answer guard is a type alias, and it keeps `mark_scheme`.** `ItemView = Omit<Item, "answers" | "working" | "misconceptions">` is compile-time only: `const v: ItemView = item` compiles with all three fields still on the object, and `JSON.stringify(v)` (the path into a prompt) ships them. `mark_scheme` is not omitted, and for `short`, `extended` and `practical-method` items it is the answer. The ground rule says "withheld by construction"; the PR body's guard paragraph leans on this alias. Nothing reads it yet, which is why this is High rather than Critical. Fix: omit `mark_scheme` too, export `toItemView(item: Item): ItemView` that destructures the four fields away, and one test: `expect(Object.keys(toItemView(item))).not.toContain("answers")` (and the other three).

### Medium

**F3 · `src/content/generators.ts:14-15` · a second subject returns the wrong table.** `generators.js` does `var GEN = {}; root.GEN = GEN` (lines 42, 1776), so each subject's file replaces the one global; `import()` caches by path, so a repeat import does not re-run the file. `loadGenerators("maths")`, `loadGenerators("science")`, `loadGenerators("maths")` returns science's table on the third call. One subject today; a new subject is "nothing in `src/` changes" per `CLAUDE.md`, so the loader has to be right before then. Fix: memoise per subject in a module-level `Map<string, Record<string, Generator>>` and return the cached table on a repeat call.

**F4 · `src/content/pack.ts:9` and `generators.ts:12-14` · `loadTopics` is cwd-relative, `loadGenerators` takes `root`, and neither validates `subject`.** `observed` from another directory: `loadTopics("maths")` → `ENOENT`; `loadGenerators("maths", root)` → 21 generators. The loader's own comment says why `root` exists (D10, the compiled binary reads `content/` beside itself); `loadTopics` ignores it. And `subject` is interpolated into a path that one caller executes: `loadGenerators("../../x")` imports and runs `<root>/x/generators.js`. Both callers are tests and scripts now; T4's routes and the `open_lesson` MCP tool are the next callers. Fix: same `root = process.cwd()` parameter on `loadTopics` with `path.resolve(root, "content", subject, "topics.json")`, and `if (!/^[a-z]+$/.test(subject)) throw` at the top of both (or one shared `subjectDir(subject, root)` that does both).

**F5 · `scripts/convert-lessons.ts:25-34` · `splitWrong` mis-splits silently on an unspaced `=` inside a message.** `y=2x+16=You added 6, so c=4.` yields `answer: "y=2x+16=You added 6, so c"`, `message: "4."`. The deep-equal test only proves the committed JSON matches the converter, and `pack.test.ts` checks `answer.length > 0`, so a future lesson edit that does this ships. The 312 current pairs are clean (`observed`: no misconception answer contains whitespace or exceeds 12 characters). Fix: after the split, `if (/\s/.test(answer)) throw new Error(...)`; a typed answer never holds whitespace after `normaliseAnswer`, so the check is exact.

**F6 · pupil-facing text in the pack breaks `.claude/rules/content.md` (carried from v1; fix blocked by AC #3 and AC #6 → issue #24).** `observed` by scans over `content/maths/items` at `509696f`:
- Two hints state the result: `1MA1/G17/cone#1` hint "60 times π." (answer `60pi`), `1MA1/G17/sphere#1` hint "288 times π." (answer `288pi`). The rule: a hint names the next step, not the result.
- Five trig messages state the corrected answer: `1MA1/G20/angle#2` "cos 60° = ½" (answer 60), `angle#3` "sin 30° = ½" (30), `side#1` "12 × ½ is 6" (6), `side#2` "8 × ½ is 4" (4), `side#4` "sin 30° = ½" (30).
- Two in `1MA1/A9`: `#1` "m stays 4; only c changes, to 7." (answer `y=4x+7`), `#5` "so 10 + 5 = 15" (the corrected constant).
- Nine "You dropped the π. Write the number times π, like 60pi." messages across `G17/cone`, `circle` and `sphere` quote the accepted form back. The pupil already has the number, so this is a format correction; whether it counts as "the corrected answer" is a judgement call recorded on the issue.
- Sparx codes in post-attempt `working` text in 14 item files ("This is U980, reading a graph."); the rule keeps the Sparx name, and the code means nothing read aloud.

The text lives in the lessons' `data-wrong` and hint markup, the lessons are frozen by AC #6, and `items/` must deep-equal the converter's output (AC #3), so the fix is edit lesson, `bun run convert`, commit both, in T4 or a small content ticket. Not an inline recommendation for this PR.

### Low

**F7 · `src/content/pack.test.ts:48-82` · the 60 figures and 42 scaffolds in the PR body have no test behind them.** `figure` and `scaffold` capture in the converter is silent on a miss (a class string or `<p>` placement change makes the field absent; a second `<svg>` in a block is dropped). Fix: count both across the 105 items in the items test and pin 60 and 42 with the same "observed bound" comment style.

**F8 · `scripts/test-generators.ts:20, 33` · `SHAPE.number` bypasses `norm`, and `NUMBER` misses U+2212.** `Number("1,200")` is NaN so a canonical answer in that form fails spuriously, `Number("")` is 0 so `answers: [""]` passes; a stem with `−5` and a working with `-5` compare 5 against -5 (a false alarm, the safe direction). Fix: `Number.isFinite(Number(norm(v))) && norm(v) !== ""`, and normalise `−` before the number match.

**F9 · `src/marking/normalise.ts:16` · `"$10."` relies on the spec's fallback for a group that does not exist.** `observed` in Bun: `".5"` → `"0.5"`, `"-.5"` → `"-0.5"`, so it works, by ECMAScript's rule that `$nn` above the group count reads as `$n` plus a literal digit. Sonar flags it and the next reader will too. Fix: `.replace(/^(-?)\./, (_, sign) => `${sign}0.`)`.

**F10 · `scripts/convert-lessons.ts:36-45` and `src/content/pack.ts:9` · `text()` decodes four entities, `loadTopics` casts unchecked.** `&nbsp;`, `&#39;` and `&times;` would land in JSON as literal text (none in the current lessons, `observed`); a malformed `topics.json` from a content update surfaces as a `TypeError` in `t.aliases.includes`. Fix: `&nbsp;` → space and `&#(\d+);` → `String.fromCodePoint`, or a header comment naming the constraint; a five-line shape check in `loadTopics` that throws with the file name.

**F11 · `.claude/references/content-pack.md:9-10` · the reference is behind the code it describes.** It shows `id: "1MA1/R9"` without the `/<slug>` form that `types.ts:14-18` documents and 10 of 21 rows use, and an items shape without `figure`, `scaffold`, `hint` or `working`. Fix: two lines.

**F12 · note on what the 6300 figure proves.** The gate checks consistency (the working ends on the answer; every stem number reappears in the working; no `wrong` key is an accepted answer), not arithmetic. `observed`: an off-by-one in U349's `ans`, which feeds both `answers` and `working`, passes 300 runs; the report's M1, which shifts `answers` alone, goes red with the message quoted (`U349 seed 24301: the working ends "= 97.5" but the answer is "98.5"`). No fix; the PR body's wording ("all 6300 runs pass") is accurate. Worth knowing before the figure is cited as "the generators are correct".

## Numbers pass

Every figure in the PR body and the report, re-derived at `509696f` in the worktree:

| Figure | Claimed | Re-derived | How |
|---|---|---|---|
| Topic rows, with a prerequisite, tier | 21, 6, F | 21, 6, F | `bun -e` over `topics.json` |
| Item files, items, misconceptions, figures, scaffolds, hints | 21, 105, 312, 60, 42, 105 | same | `bun -e` over `items/*.json` |
| Lessons, reference sheets | 21, 21 | 21, 21 | `ls \| wc -l` |
| Files, insertions, deletions | 80, 11345, 3 | same | `git diff --shortstat origin/main..HEAD` |
| `bun test` | 13 pass, 0 fail, 2260 expects, 5 files | same | `bun run check` |
| Generator runs | 6300 (21 × 300) | `all 6300 runs pass` | `bun scripts/test-generators.ts` |
| Titles equal lesson `<h1>` | 21 of 21 | 21 of 21, 0 mismatches | `bun -e` |
| Lessons, reference byte-for-byte | claimed | `diff -rq` empty against `~/Desktop/Matis_study_tutor/{lessons,reference}` | observed |
| `generators.js` = formatted donor | claimed | `cmp` equal against `biome format` of `assets/generate.js` | observed |
| `bun run convert` idempotent | claimed | `git status --short content/` empty after a run | observed |
| `1MA1/G17/cone#1`, `1MA1/A9#1` Level 4 spot checks | as in the report | 9 answers from `60pi`, `<svg`, scaffold ends `60 × π = …`, 3 misconceptions first `180pi`; A9 keys `y=7x+1, y=4x+1, y=x+7` | observed |
| Mutations M1, M2, M3 | red then reverted | red: M1 quoted above, M2 deep-equal fails, M3 `1MA1-R4.json matches /\b(Edexcel…)\b/` | observed |
| Sizes on disk | 344 KB, 84 KB, 180 KB | 344, 84, 180 | `du -sk` (the plan's notes still say 147 KB for items; the report is the current figure) |
| Headless Chrome load | `21 generators; Find 25% of 80.` | not re-run | Chrome not driven from this session |

No figure in the PR body or the report is mislabelled. The one claim that does not hold is the CI `ready` job sentence (F1).

## Validation

| Check | Result | Provenance |
|---|---|---|
| `tsc --noEmit` | clean | observed, `bun run check` in the worktree |
| `biome check .` | 40 files, no diagnostics | observed |
| `bun test` | 13 pass, 0 fail, 2260 expects, 5 files | observed |
| `bun scripts/test-generators.ts` | all 6300 runs pass | observed |
| SonarCloud | Quality Gate failed: D reliability, C security on new code; 7 failure-level annotations | observed, `gh pr checks 22` and the check-run annotations |
| Other CI | none exists | observed, no `.github/workflows` |

Guarantees pass: first round, skipped. Fix-mechanism pass: first round, skipped. Constraint pass: F6's fix breaks AC #3 and AC #6 → issue #24; every other fix touches `src/content`, `scripts`, `src/marking` or `.claude/references`, none frozen by the plan.

## What's good

- The v1 `quiz.js` first-`=` split bug (plan N2) is gone: `1MA1/A9`'s misconception keys are whole equations, and the PR body says why.
- Fail-loud where it matters: `need()` on stem, hint, working and `data-a`; `convert` refuses a lesson with no topic row.
- One normaliser, used per generator run and per converted item, so "no wrong answer is an accepted answer" is checked the same way in both places. N6's reason for landing `normalise.ts` now holds up.
- Seeded LCG with the seed in every failure line, and a planted-fault test that asserts all three failure messages and the seed prefix.
- `BOARD` regexes carry no `g` flag, so `re.test` in a loop is stateless.
- The loader comment records the observed compiled-binary failure that justified `path.resolve(root, …)`, so the next person does not undo it.
- `topics.json` matches the `Topic` type and the id grammar exactly; all six prerequisites resolve, none self-references.
- Every figure in the PR body names its command and every mutation names its test. This is the first PR on the repo where the numbers pass found nothing to correct.

## Recommendation

**Request changes.** Fix F1 and F2 before merge; F3 to F5 are cheap and stop T4 from inheriting them; F7 to F11 at the author's discretion; F6 is issue #24. Then `bun run check`, push, and this review runs again.
