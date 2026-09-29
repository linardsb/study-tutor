# PR #43 review, round 1: T14 O4 squad mode

**PR** https://github.com/linardsb/study-tutor/pull/43 · **Head** 2e17251780a1cfbd7d9737b3e130b9da343090c8 · **Base** main @ ab1ddd91c3ebac58909eb7d678e25dc7cbf55e32
**Reviewed** 2026-09-29 · round 1 (no prior report, so the guarantees and fix-mechanism passes do not apply)
**Recommendation: request changes** (0 Critical, 0 High, 3 Medium, 5 Low)

## Summary

The PR adds squad mode. Friends run a seeded five-question round each week, exchange one file per pupil, and see a question-by-question comparison and a pooled total, with no ranking. The core guarantees hold. `data/` confinement is enforced on every request-built path, and a friend's answers are served only after this pupil's own `squad` event exists. That check is made on the server, in one place, and a mutation test covers it. The three Mediums are about correctness of the compare view and total, not security: the pupil's own round can be counted twice, pupils can retake a round after seeing the worked answers, and a mid-week content update pairs saved answers with the wrong questions.

The only CI check is SonarCloud (pass). The gate for this review is a local `bun run check` at the head.

## Issues

### Medium

**M1. Rejoining under a new name counts the pupil's own round twice.** `src/api/squad.ts:86-94`, `:163-187`, `:351`
- Consequence: the pooled total and the member list include the pupil as their own friend.
- Mechanism: `mineEvent` (finds this week's round in the log) matches squad and week, not pupil. `joinSquad` rewrites `pupil` in `profile.json` and leaves the old `<pupil>.json` in place.
- Scenario: join as `sam`, do the round (4 of 5), rejoin as `sammy` to fix a typo. The next GET self-heals `sammy.json` from the same event. `friends()` then reads `sam.json`: its name is not `sammy.json`, its `pupil` is not `sammy`, and its squad, week and seeds match. It is counted, giving "8 of 10 from 2 rounds", and a "sam" row shows the pupil's own answers. A friend's install that holds both files double-counts as well.
- Not in the report; no test covers a rename.
- Fix: have `joinSquad` refuse a name change while this week's `squad` event exists (small, testable). Alternatively, when the pupil name changes, delete the old projection file in `data/squad/<squad>/`.

**M2. "One go each" holds only within one page load.** `app/squad.js:165-201`
- Consequence: a pupil can see the worked answers, reload and score 5 of 5. Friends then see "right" on every row and the pooled total rises.
- Mechanism: each check shows `item.working` immediately, but nothing is saved until all five are checked. A reload rolls the same seeds, so the same five questions come back.
- The boss round re-forms the same way after a reload, but the boss is solo. Here the score is shown to other pupils. The plan says "one go each" (`t14-squad-mode.md:93`, `:609`, `:658`) and does not accept this case.
- Fix: in the squad round, show only right or not yet on each check, and reveal the working after the POST succeeds. Otherwise record it in the plan and report as an accepted limit. The parent round is not affected, because `parentDone` still blocks repeat XP.

**M3. A mid-week content update pairs saved answers with the wrong questions.** `src/api/squad.ts:238-243`
- Consequence: the compare view the ticket exists to provide shows the pupil's answers, to them and to friends, against questions they never saw.
- Mechanism: the projection is built as `squadFile(e, profile.pupil, round.seeds, VERSION)`. That uses the current round's seeds, not seeds rebuilt from the event's own `topic`. If an update moves the topic pick mid-week, the self-heal writes a file whose seeds and answers do not match. That file then also passes `comparable()` against friends on the new pack.
- The report lists this under "Issues encountered" as not handled. It is not among the 15 deviations, so it is an undocumented divergence from AC 3.
- Fix: derive the seeds from `hash(squad, week, e.topic)`. That needs `src/flow/squad.ts` to expose seeds for a given topic. When `e.topic !== round.topic`, treat the pupil's own round as not comparable, and cover it with a test. Constraint pass: the plan freezes no file this fix touches (grep of "do not modify|read-only|frozen…" hits only `:478`, `:573` and `:696`, which concern `?day=` and friends' files).

### Low

**L1. The week block is wrong before the pupil's first round.** `app/squad.js:245-251`, `:404-410`, `:321-325`
- Right after joining, the page shows "Only your round so far…" and "Squad total this week: 0 of 0 from 0 rounds". The folder path is in `#share`, which only appears after the round. A parent copying a friend's file in first (Level 4 step 4) has no path to copy to.
- DOM test 2 checks only the first `#week p`.
- The `notComparable` note also renders with a capital mid-sentence ("kit Their tutor…"), which breaks the sentence-case rule.
- Fix: show `solo` only when `mine !== null`, and show the folder whenever `profile !== null`.

**L2. `comparable()` does not check the answer count.** `src/flow/squad.ts:175-182`
- A hand-edited friend's file with matching seeds but 50 answers is pooled at its own `score`/`of`.
- Fix: also require `f.answers.length === round.seeds.length`.

**L3. Friends' files are read with no size limit.** `src/api/squad.ts:170-172`
- Every GET parses each `*.json` synchronously. Answer and working strings have no length cap and are sent to the page.
- Fix: skip files over ~64 KB as unreadable. Apply `MAX_ANSWER`/`MAX_WORKING` in `parseSquadFile`.

**L4. A friend with the same name disappears without a note.** `src/api/squad.ts:167`, `:243`
- If a friend's `sam.json` replaces the local pupil's own file, the next GET self-heals over it. Because the own filename is skipped silently (deviation 3), nothing says why the friend is missing.
- Fix: before healing, count a valid file from another pupil as unreadable, or add a hint on the join form to pick a name unique in the squad.

**L5. Level 4 step 8 is missing from the report without a note.** `.claude/reports/t14-squad-mode-report.md` (Validation results)
- The plan's step 8 (`t14-squad-mode.md:787`, open `/retest.html` with nothing due) is neither reported nor listed as skipped. The report lists the UI half of steps 1, 5 and 7 as not run, but not step 8. The PR body's Level 4 list has the same gap.
- Fix: run it, or add it to the not-run note.

## Numbers pass

| Figure (PR body / report) | Check | Result |
|---|---|---|
| 479 pass, 0 fail, 48 files | `bun run check` at 2e17251 | observed by reviewer: 479 pass, 0 fail, 48 files, exit 0 |
| "all 6300 runs pass" | `bun scripts/test-generators.ts` | observed by reviewer: same, exit 0 |
| 23 files, +3490 / −37 | `git diff --shortstat origin/main..HEAD` | observed by reviewer: match |
| 1203 code + 1225 tests + 1062 docs | `git diff --numstat` | derived: tests 23+413+73+211+31+37+8+318+111 = 1225; code 1202 + 1-line fixture = 1203; docs 965+3+94 = 1062; total 3490 |
| Test counts 11 / 15 / 4 / 8 | grep of `^test(` | observed by reviewer: match |
| Test deltas +5 / +1 / +2 / +2 | grep on origin/main vs head | observed by reviewer: 28→33, 13→14, 6→8, 6→8 |
| Releases 0, tags 0 | `gh api …/releases`, `…/tags` | observed by reviewer: 0, 0 |
| Biome 4 warnings | check log | observed by reviewer: "Found 4 warnings", all `noDescendingSpecificity` |
| Plan estimate ~700–900 lines | plan `:80` | present; correctly labelled as the plan's estimate |
| "Two separate `bun -e` processes" | `src/flow/squad.test.ts:170-203` | confirmed: `Bun.spawnSync(["bun","-e",…])` with its own TZ and locale per child process |
| Level 4 values (6 of 10, 409, xp 15, `unreadable: 1`) | none saved | author-observed; the reviewer did not reproduce them |
| Mutation checks | not re-run | author-observed |

No derived figure is presented as observed.

## Guard and events

- **Answer guard:** `friends(dataDir, profile, round, mine !== null)` at `src/api/squad.ts:245` is the only place a friend's `answers` is attached. `?day=` for another week never writes. `/api/event` refuses squad bodies, and MCP has `squad: false`. The restatement in the PR body matches the code.
- **`squad@1` edited in place:** `.claude/references/events.md` permits this while no release exists (0 releases, 0 tags, observed). On origin/main, and in the t12/t13 worktrees, no code writes a `squad` event. The only line of that shape is the fixture this PR updates. The sibling branches do not touch that fixture, so a merge takes this PR's version. No finding.

## Validation

| Check | Result |
|---|---|
| `bun run check` (tsc + biome + bun test) | ✅ exit 0, 479 pass, 0 fail, 48 files |
| `bun scripts/test-generators.ts` | ✅ all 6300 runs pass |
| SonarCloud | ✅ pass (only CI check) |

## Done well

- The withheld-answer guard is enforced on the server in one place, and a mutation test turns red without it.
- The event is the record and the file is a projection of it. The event is written first, self-heal is limited to the same week, and `shared` means the file on disk matches the event, not merely that a file exists.
- `parseSquadFile` rebuilds the object from known fields, so stray keys in a friend's file never reach the page. All friend content enters the DOM through `textContent`, and a test pins that.
- The determinism test spawns separate Bun processes with different time zones and locales, pins golden stems, and greps `generators.js` for clock, locale and `Math.random`.
- `makeDataDir` realpath-checks each level, and `listDataDir` reports skipped symlinks, so AC 5's visible note is possible.

## Next

`piv-fix-review-findings` on this file in `~/Desktop/study-tutor-t14`, then re-run `bun run check`.
