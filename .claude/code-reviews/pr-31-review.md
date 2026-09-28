# PR #31 review: T7 detective case

**Head** `5eabb48` · **Base** `main` @ `9fe7317` · round 1 · reviewed 2026-09-27

**Recommendation: request changes.** 0 Critical, 2 High, 1 Medium, 8 Low. A separate fresh-context pass by the `code-reviewer` agent found F2, F3, F5 and F6 independently and added F9 to F11. `bun run check` and the generator script are green and every figure in the PR body re-derives. The two Highs are the red SonarCloud gate (the only check this repo has) and a day validator that throws instead of returning false, which turns one hand-edited log line into a 500 on every state route.

## Validation

| Check | Result |
|---|---|
| `bun run check` at `5eabb48` | green: `tsc` clean; Biome 0 errors, 4 `noDescendingSpecificity` warnings at `app/style.css` 642, 643, 671, 672 (same four the PR body reports); 148 pass, 0 fail, 18 files, 62515 expect() calls (`observed`) |
| `bun scripts/test-generators.ts` | all 6300 runs pass, 21 generators × 300 (`observed`) |
| SonarCloud Code Analysis | **fail**: quality gate "D Reliability Rating on New Code" and "B Security Rating on New Code", both required ≥ A; 2 failure-level and 4 warning-level annotations (`observed`, check run 108653055945). Rule texts are not exposed by the API for this private project; the lines are named under F1 |
| Base moved under the PR? | no: `origin/main` after `git fetch` is `9fe7317`, equal to `baseRefOid`. First round, so the guarantees and fix-mechanism passes do not apply |
| Implementation report | `.claude/reports/t7-detective-case-report.md`, seven documented deviations; none of the findings below is one of them |

## Issues

### High

**F1 · SonarCloud quality gate red.** Two failure-level annotations (`observed`, check-run annotations):

- `src/flow/detective.ts:279` — `Object.keys(records).sort()` with no comparator. Correct for `YYYY-MM-DD` keys, but Sonar rates a bare `sort()` a Reliability bug and that alone puts new code at D. Fix: `.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))`.
- `app/case.js:212` — `fetch(\`/api/case${location.search}\`)` appends the raw query string to a request URL; this is what moves Security to B. Fix: read `day` with `new URLSearchParams(location.search).get("day")`, keep it only when it matches `/^\d{4}-\d{2}-\d{2}$/`, and build the URL from that one value. PR #23's experience says Sonar may still not accept a guard as a sanitiser; if it stays red after the change, the remaining step is marking the alert safe in the SonarCloud UI, which is a human action.

Warning-level (not gate conditions): `src/api/case.ts:57` and `:59` nested ternary (see F4), `src/flow/detective.ts:25` and `:47` (an alias of `string`, and the FNV loop).

**F2 · `src/events/types.ts:116` `isDay` throws on an out-of-range month or day instead of returning false.** `new Date("2026-13-01T00:00:00Z")` is an invalid date and `.toISOString()` on it throws `RangeError: Invalid Date`. The `t` check ten lines below guards `Number.isNaN(d.getTime())` first; `isDay` does not. `observed` on a live server (`startServer`, temp `data/`):

| Input | Expected | Observed |
|---|---|---|
| `GET /api/case?day=2026-13-01` | 400 `day must be YYYY-MM-DD` | 500, Bun's HTML error page (the throw is outside `getCase`'s `try`) |
| `POST /api/event` case body with `day: "2026-13-01"` | 400 `Refused` | 500 `Could not save the event`; nothing written, `data/` not created |
| one log line with `day: "2026-13-01"` (hand edit) | line skipped and counted | `replay` throws: `GET /api/state` 500, `GET /api/case` 500, `scripts/replay-check.ts` exit 1 |

The third row breaks the events reference's promise that unreadable lines are "skipped and counted, never fatal (a pupil may hand-edit the log)". `2026-02-30` is handled (it rolls, so the string compare catches it), which is why the existing tests pass. Fix in `isDay`:

```ts
const d = new Date(`${x}T00:00:00Z`);
return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === x;
```

Add `2026-13-01` beside `2026-02-30` in the `/api/case` server test, and a `replay` test that a case line with that `day` is one `skipped`, not a throw.

### Medium

**F3 · `app/case.html:14` the page header describes a mistake case on every day.** "Kai has answered a question. Find the mistake, or say there is none." is static HTML. On a rule day the pupil sees three worked instances and "What is the rule?"; Kai has answered nothing. Rule days are 26 of the 366 from 2026-10-01 (`observed`, `pickCase` over the maths pool). Fix: make the aim neutral ("One puzzle a day. Three minutes.") or set `.aim` from `c.kind` in `case.js` where the case is rendered.

### Low

**F4 · `src/api/case.ts:56-62` nested ternary for `source`.** Three levels deep, and the Sonar warning at `:57` and `:59` is this. An `if` chain with early returns, or a small `sourceOf(record)` helper, reads in one pass.

**F5 · `app/case.js:193-203` the re-ask renders before the first answer's POST resolves.** `postEvent` is fired and forgotten at `:193`; the re-ask is appended at `:203` in the same tick. If the first POST fails (the page shows "Not saved") or lands after the re-ask's POST, the log holds a `reask: true` line with no first answer for that day: the reducer keeps it as the day's only pair and never sets `caseSeed`, so tomorrow is not seeded. Seconds normally separate the two clicks, so this is an edge. Fix: render the re-ask inside the `.then(saved => …)` and only when `saved`.

**F6 · `?day=` is read-only on the route, not end to end.** The page posts against the returned `day`, so `?day=2031-01-01` answered today writes a 2031 record (`observed`: POST accepted, 201). A bet-3 miss there sets `caseSeed` for the next real day, and the record sits last in `calibration`'s sorted keys from then on, always inside the last seven. The plan's Task 15 GOTCHA documents exactly this and accepts it (the log is the pupil's own, D3), so it is a decision, not a defect. The PR body's "optional read-only `?day=`" overstates it; say "read-only on the server".

**F7 · `Case.hint` is sent and never shown.** `src/flow/detective.ts:160` copies the item's hint into the response; `app/case.js` `question()` renders stem, figure, scaffold, Kai's answer or the instances, and the question. Either render it or drop the field from `Case`.

**F8 · PR body footer names CI jobs this repo does not have.** "CI's `ready` job flips it when `check`, `audit-diff` and `codeql` are green" (`observed`: no `.github/workflows`; SonarCloud is the only check). Same note as PR #22's review; the human flips the draft. The uncommitted edit to `.claude/skills/piv-create-pr/SKILL.md` in the working tree looks like the fix in progress.

**F9 · `app/case.js:218-221` a reload after a bet-3 miss loses the re-ask.** The re-ask lives in memory only; a reload finds `r.record` and goes to `renderDone`, so "Same idea, new numbers" never shows again (the seed still sends the topic back tomorrow). `caseForDay` already returns `reask`, and the record says whether one is owed (`bets.length === 1`, first bet 3 and wrong), so `load` can branch on that. Related: `replay.ts:157` pushes any number of re-ask pairs, so two tabs can give `bets` of length 3 against the "at most one re-ask" wording (AC 6).

**F10 · Pupil-facing copy.** `app/case.js:186-190` and `:131`: on a rule case `c.options[c.correct]` and `c.working` are the same string (`detective.ts:201` sets `working: concept.rule`), so a wrong pick prints the rule twice in a row after the check. `app/case.js:180` "How sure? 1, 2 or 3 first" has no full stop; its sibling on `:176` does.

**F11 · `src/server.ts:17` `pack?` is a test-only branch in shipped code.** The binary always passes `pack`; the lazy `loadCasePack` at `:128` exists so `server.test.ts` need not change, and it caches a rejected promise in `packs` for the process lifetime. Making `pack` required and loading it in the test helper removes the branch, the `root` parameter to `getCase` and the cached-rejection edge.

## Numbers pass

Every figure in the PR body and the report was re-derived at `5eabb48`:

| Claim | Check |
|---|---|
| per-path added/removed: `src/flow` 576/0, `src/events` 119/5, `src/api` 178/0, `src/server*` 60/2, `src/content` 94/2, `src/marking` 69/0, `app/` 293/0, `content/` 24/3, `scripts/` 3/10, `.claude/` 1159/5; 2575/27 over 25 files | `observed`, `git diff --numstat origin/main..HEAD` grouped by path; every number matches |
| pool 108 sources, 3 rule cases | `observed`, `casePool(await loadCasePack("maths"))`: 108, 3 rules, 21 topics |
| first rule day 2026-10-23; 26 rule days a year (plan N5, R7) | `observed`, `pickCase` over 366 days from 2026-10-01: 26, first 2026-10-23 |
| at most five options (AC 6) | `observed`: max 4 over the pool on one day; the test's bound is 5 |
| `bun run check` figures, 4 Biome warnings | `observed`, matches |
| 6300 = 21 × 300 | `observed` |
| 0 blacklist hits, 0 exclamation marks in the 3 rules, 6 distractors and the page strings | `observed`, 98 blacklist words against `topics.json` concept text, every string literal in `case.js` and every text node in `case.html`: 0 hits, 0 exclamation marks |
| NO_NOTE share 0.252, consecutive days differ 364/365, 182 rule days when seeded, U283 fallback on 2027-07-13 | not re-run here; each is asserted by a range or a fixed day in `detective.test.ts` (lines 111, 156, 189, 215), and that suite is green |
| "18 consecutive runs" and the one unnamed failure | author-reported, not reproducible from the record; the suite passed once more here |

## The guard

`src/jobs` and `src/mcp` are untouched (`observed`, diff file list). `Case.correct` and `Case.working` travel to the browser in `/api/case` the way item `answers` travel in the items file; nothing in the ticket builds a prompt. `state` carries no `answers`, `mark_scheme` or `working` (the replay guard test now checks `working`); `state.cases` holds bets only, never `pick`. Restated in the PR body as the repo asks.

## What's good

- `src/flow/detective.ts` is pure and seeded: the same day, seed and pack always give the same case, and the tests prove it over a year of days rather than one.
- The reducer keys a case by its own `day` and the fixture's third line (23:30Z on the 7th, `day` the 7th) asserts the midnight rule rather than describing it.
- `KEYS` gains `case@1` under the `satisfies` check, so a field added to the type and not to the allowlist fails `tsc` rather than being dropped from the log.
- Range assertions carry their observed value in a comment, so a future drift shows what changed.

## Recommendation

Request changes. F1 and F2 before merge; F3 and F10 are pupil-facing and a few lines each; the rest at the author's discretion. No fix here touches a file the plan freezes (`grep` for "do not modify", "frozen", "no changes to" over the plan: none).

Next: `piv-fix-review-findings` on this report, then `bun run check` and a SonarCloud re-scan on the push.
