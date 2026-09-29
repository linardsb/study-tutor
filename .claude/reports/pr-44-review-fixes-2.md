# PR #44 review fixes, round 2 (F1: SonarCloud)

Input: the SonarCloud check run on `2917bb0` (id `109365178018`), 23 annotations, read with
`gh api --paginate repos/linardsb/study-tutor/check-runs/109365178018/annotations`. Round 1 said the list was
not readable; that was wrong, the annotations carry every issue with its file and line. Gate on `2917bb0`:
Security Rating B, Reliability Rating C on new code (observed, check-run summary).

Triage chosen by the user: fix what drives the gate plus the cheap in-diff warnings; leave the number-word regex
and `role="status"` with a reason; leave issues in lines earlier PRs wrote.

## Gate

- `bun run check` in `~/Desktop/study-tutor-t13` on the round-2 tree: exit 0, **620 pass, 0 fail**, 57 files
  (619 + the one new test). biome: 4 warnings, the same `noDescendingSpecificity` ones in `app/style.css`.
  Observed 2026-09-29.
- `bun run build`: exit 0, mac zip 47,074,400 bytes, windows zip 41,343,676 bytes. Observed, same run.
- `bun test src/marking/snap-dom.test.ts`: 14 pass (observed).

## Fixed

### Security (the gate's B): client-side request forgery, `app/snap.js:132` and `:231`

The page read `token` from its own URL and put it, encoded, into `fetch("/api/snap?token=…")`. The path is fixed
and the value is `encodeURIComponent`-ed, so it could not reach another route. It still sent any string. The page
now sends the token only if it has the shape `src/snap.ts` mints (32 bytes as base64url, `/^[\w-]{43}$/`), and an
empty token otherwise, which the server answers with 403 and the expired sentence (`getSnap`: `find("")` is null).

- Test `a token that is not the minted shape is not sent…` (`snap-dom.test.ts`), with `T`, `../api/config` and
  a valid token plus `&x=1`. Unfixed `app/snap.js` (stashed): red, `Expected "/api/snap?token=", Received
  "/api/snap?token=T"`. Fixed: pass.
- The other tests now use a token of the minted shape (`TOK`); `T` was never a real token.
- Reduced claim: whether SonarCloud's taint analysis counts the shape check as a sanitiser is known only from
  CI's rescan of the pushed commit. Result on `1e650ab` (check run `109367759982`, observed): **Quality Gate passed**, 6 new issues left, none at either `fetch`.
- New failure mode of the mechanism: if `src/snap.ts` ever mints a token of another length, every link reads as
  expired. The regex comment names the source; a change of `createSnaps`'s `token` needs this line changed too.

### Reliability (the gate's C)

- `src/events/append.ts:180` identical branches (`fs.writeSync` on both sides of a `typeof`). Now
  `fs.writeFileSync(fd, data)`: it takes a string or bytes, and it loops until all bytes are written, which
  `fs.writeSync` does not promise. Covered by the existing `writeDataFile` tests (string) and the intake tests
  (bytes). No failing probe: the old code behaved the same for the sizes written.
- `src/snap.ts:46` regex precedence: `^` bound only the first group. Grouping made explicit,
  `(?:^(?:utun|…))|(?:vEthernet|…)`, same matches. Covered by the `lanAddress` tests (`utun3`, `vEthernet (WSL)`).
- `app/snap.js:68` `String(reader.result)`: `readAsDataURL` gives a string, so the result is passed as it is.

### Maintainability warnings in this PR's lines

- `expect(calls.length).toBe(n)` → `expect(calls).toHaveLength(n)`: 6 in `examiner_mark.test.ts`, 2 in
  `examiner.test.ts`.
- `SENDABLE` is a `Set`, checked with `.has`.
- `src/snap.ts:180` and `:280`: `snap?.state !== "open"`.
- `app/snap.js:94` nested template: the note is built first.

## Left, with a reason (for the PR body)

The rescan of `1e650ab` lists exactly these 6 (observed, annotations of check run `109367759982`): `app/map.js:27`, `:310`, `app/snap.js:86`, `app/snap.html:41`, `src/events/append.ts:230`, `src/jobs/examiner_mark.ts:42`.

- `src/jobs/examiner_mark.ts:42` regex complexity 30: it is a flat list of number words; splitting it makes the
  guard harder to read against the words it claims to cover.
- `app/snap.html:41` `role="status"` → `<output>`: `role="status"` on a `<p>` is valid ARIA and is announced by
  screen readers; `<output>` is a form-result element and the status is not one.
- `app/snap.js:84` cognitive complexity 20 (`resultLines`): not in the agreed set. The nested-template change
  may lower it; not measured, the rescan shows it.
- Lines written by earlier PRs, which ride: `app/map.js:27`, `:310` (T6, `723fd13`), `src/events/append.ts:231`
  (T14, `8a0e9f7`).

## Guard

No prompt, job input or tool changed. `src/jobs` changes only in `examiner_mark.test.ts` assertions. The answer
stays withheld until an attempt event exists as in round 1: `examiner_mark` takes `PostAttempt` only, minted by
`jobItem` after `hasAttempt`.

## Copy sweep

| grep -n | hits before | action |
|---|---|---|
| `619`, `57 files` | body:37 | body gate line re-derived for the round-2 commit |
| `47,074,294`, `41,343,544` | body:38 | body build line re-derived |
| `Sonar` | body:74, body:80 | body:74 rewritten (list readable, what was fixed and left) |
| `writeSync` | plan:261, plan:278 | annotated as retired by round 2 |
| `not readable` | round-1 report:78 | annotated as superseded |
| `SENDABLE` | none | none |

Plan = `.claude/plans/t13-examiner-mode.md`, report = `.claude/reports/t13-examiner-mode-report.md` (no hits),
body = `gh pr view 44 --json body` fetched before the edit.
