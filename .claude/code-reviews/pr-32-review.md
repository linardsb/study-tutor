# PR #32 review, round 1: T8 setup page, config and provider seam

**Head** 658ff96 · **Base** main @ `5669da48b2e4c462ee99743f62c6e86c813e33fe` · reviewed 2026-09-28 · first round (no prior report, so the guarantees and fix-mechanism passes did not run)

## Summary

Nothing is Critical or High. The key never reaches a response, a log line or an event. The host rule and the loopback check are exact. `refuseForeign` protects the new POST. The queue cannot wedge. There are 3 Medium findings: one silently raises the parent's spending limit, one is an undocumented divergence from a plan GOTCHA, and one is a figure in the PR body whose stated cause goes beyond what was observed. **Recommendation: request changes.** All three are small fixes.

## Issues

### Critical
None.

### High
None.

### Medium

**M1. Switching to "No model" and back quietly resets a custom monthly limit to 1,000,000.** `app/setup.js:111-116` sends no `cap` for `none`, and `src/config.ts:220` then saves `DEFAULT_CAP`. On reload, `setup.js:88` shows that value. So a parent who set 100,000, used "No model" for a week and then pasted an OpenAI key again saves a limit ten times higher without having chosen it. `setup.js:88` also hardcodes `1000000`, a copy of `DEFAULT_CAP` in the browser, which is what `src/api/config.ts:28` says the page should not hold (report deviation 8 notes the copy but not the reset).
Fix: in the `none` branch, use `readConfig(dataDir)?.cap ?? DEFAULT_CAP` when `body.cap` is undefined. Expose the default in `ConfigView` in place of the literal. Test: save OpenAI with cap 100000, then `none`, then assert the cap on disk is still 100000.

**M2. A 500 from `/api/config` sends `/` to the setup page, although plan GOTCHA line 534 says it stays on the index.** `app/index.html` runs `r.json().then(c => { if (!c.configured) … })`. Documented deviation 3 (`readRoute`) makes a failed read return a parseable `{error}` body. `c.configured` is then `undefined`, and `!undefined` redirects. Before `readRoute`, `r.json()` would have thrown and the `catch` would have kept the page. The deviation is documented, but this effect of it is not. The same cause affects `app/setup.js` `loadUsage`: a 500 from `/api/usage` shows the parent "This month: undefined of undefined tokens".
Fix: check `r.ok` in both places, or test `c.configured === false` and `typeof u.tokens === "number"`.

**M3. The PR body says "6 of 8 photo-marking calls failed this way". Only 4 of the 6 failures had their reply text captured.** The two failures in the script run were not captured (report, Issues: "their text was not captured"). "This way" (a second fenced block after "Wait, let me recalculate") is therefore `observed` for 4 failures and inferred for 2. The architecture doc's Q12 wording is scoped correctly: "6 of 8 vision calls this session did not parse; all 4 whose text was captured had two blocks". The count is right; the cause attached to it is too broad. Rated Medium rather than High because T9, which decides whether to widen `parseJsonReply`, is pointed at the architecture doc, and that doc carries the correct wording.
Fix: edit the PR body to "6 of 8 did not parse; all 4 whose text was captured had this form".

### Low

**L1. `base_url` accepts userinfo, a query string or a fragment, and `publicConfig` returns it as saved.** `checkBaseUrl` (`src/config.ts:183-195`) checks only the scheme and host. With `https://sk-abc@proxy.example/v1` or `…/v1?api-key=sk-abc`, `/api/config` returns the key inside `base_url`, so "never the key" holds only when the key is in the key field. A query string also produces `…?api-key=…/chat/completions`, which does not work. Fix: refuse when `url.username`, `url.password`, `url.search` or `url.hash` is non-empty, with a test for each.

**L2. The browser may still offer to save the key.** `app/setup.html:36` has `type="password" autocomplete="off"`. Chromium ignores `off` on password fields and offers to save the value, possibly to a synced account, which puts a copy of the key outside `data/`. Fix: `autocomplete="new-password"`. This is inferred browser behaviour and was not observed.

**L3. A `.tmp` symlink to a file inside `data/` makes a settings save overwrite that file, and plan GOTCHA line 266 says this cannot happen.** `resolveInData` returns the real path (`append.ts:34`). With `data/config.json.tmp -> events.jsonl`, the check passes, `O_NOFOLLOW` never sees a link, `O_TRUNC` empties `events.jsonl`, the config (key included) is written into it, and the rename moves it onto `config.json`. The pupil's record is lost. The GOTCHA's claim that a planted `config.json.tmp` symlink "fails with ELOOP" is true only for a link that leads out of `data/`. The same flaw is already on `main` through `writeState` and `state.json.tmp`. This PR adds two more temp names, and one of them carries the key. It needs local write access to `data/`, so it is hardening. Fix: `rmSync` the unresolved temp path, then open it with `O_CREAT | O_EXCL | O_NOFOLLOW`.

**L4. A 200 whose body cannot be read or parsed is not counted, but the PR body and the report say every 200 is.** `openai-compatible.ts:167-173` returns `bad-response` before `record`. For a non-JSON body this is intentional and tested ("a non-JSON body counts nothing"), and `model-jobs.md:29` scopes it correctly ("every 200 with a JSON object body"). Two gaps remain:
- A timeout while the body is streaming (headers arrive, then the body stalls) also lands here. It reports `bad-response` rather than `timeout`, and the tokens the provider bills are never counted. The real-socket hang test only stalls before the headers.
- The PR body ("Every successful (200) response is recorded") and the report ("for every 200") claim more than the code does.

Fix: map `TimeoutError` to `timeout` in that `catch`, and reword both claims to match `model-jobs.md`.

**L5. The key's characters are not checked when it is saved.** `src/config.ts:244` only trims, and U+200B survives `trim()`. A non-Latin-1 key makes the `authorization` header invalid, so every call fails as `network` while the settings page says "Saved." Fix: refuse keys that do not match `/^[\x21-\x7e]+$/` with a plain sentence.

**L6. Test gaps around behaviour that is correct today.** The host rule has no test for a port change, `https://api.openai.com@evil.example/v1` or an upper-case host. The loopback check has no test that refuses `localhost.evil.example`, `127.0.0.1.nip.io` or `0.0.0.0`. The exact-match code is correct, but a change to `startsWith` would pass the suite.

**L7. The PR body's footer describes a CI gate that does not exist.** It says CI's `ready` job checks `check`, `audit-diff` and `codeql`. `gh pr checks 32` lists only SonarCloud (observed), and the repo has no `.github/workflows`. The local `bun run check` is the only test gate. Fix: remove the footer.

**L8. The implementation report's gate figures predate the rebase.** The report gives "180 pass, 0 fail, 3083 expect() calls, 18 files" as the "final run after all changes". The PR body's figures at `658ff96` are 209, 3,247 and 20, and they match this review's run. Fix: re-stamp the report's figures with the commit, or point it to the PR body.

## Tripwire for round 2 (guarantees pass)

T7 (#31, `feature/t7-detective-case`) is open against the same base `5669da4`. It adds `/api/case` and `case@1` in `server.ts` and in the three tables in `types.ts`. **If T7 merges first**, this PR's rebase must move `/api/case` into `apiRoutes`. Otherwise "the key-leak test walks every `/api` route" stops covering it, and the suite stays green. **If this PR merges first**, T7's rebase has the same duty. Round 2 re-derives this by reading `apiRoutes` against every `/api/` string in `server.ts`, not by a green run.

## Answer guard

The PR body restates it. `chatJson` takes `Message[]` and imports nothing from `content/`, and a source-scan test pins that. The provider is neutral, so the guard is enforced by T9's job inputs. The S2 hint probe carries only the question, and the marking probes are post-attempt by construction. No new route reads `content/`. Confirmed by reading `openai-compatible.ts`, `scripts/s2-run.ts:95-149` and `src/api/config.ts`.

## Validation

| Check | Result | Provenance |
|---|---|---|
| `bun run check` at 658ff96 (T8 worktree, clean tree) | exit 0 | observed, this review |
| `tsc --noEmit` | clean | observed |
| `biome check .` | 80 files, 4 warnings (`app/style.css`, on `main` too per report) | observed |
| `bun test` | 209 pass, 0 fail, 3,247 `expect()`, 20 files | observed; matches the PR body |
| CI | SonarCloud pass only; no test CI exists | observed (`gh pr checks 32`) |

Numbers pass:
- Size: 1,107 + 1,070 + 12 + 922 = 3,111 added, 20 removed (re-derived from `git diff --numstat`, same bucketing).
- Spend: 103 + 426 + 1,303 + 1,300 = 3,132 (observed). 3,132 + 6 × 1,300 ≈ 10,900 (derived, and labelled as such).
- "6 of 8": 2 failed in the script run + 4 of 6 failed in diagnostics = 6 of 8 (derived, correct). The attached cause is M3.
- Mutation checks and Level 4 are labelled pre-rebase at `af53004`, which is correct.

## What is done well

- `publicConfig` builds the object field by field, and the key-leak test walks the same `apiRoutes` table the server serves. The mutation check shows the test goes red when the raw config is returned.
- The key-follows-host rule uses `URL.host`, so userinfo tricks, port changes and case differences all fail safe. The loopback check is an exact match.
- The provider error body is drained and discarded, and `fail` logs only the reason and status.
- `enqueue` catches rejections, so later calls still run. `chatJson` never throws, and a real-socket test confirms Bun's `TimeoutError` name.
- `readConfig` checks `base_url` again, so a hand edit cannot send the key over http to a LAN host.
- S2 fixed the definition of "clean" before the runs. It refused to widen `parseJsonReply` after seeing the result, and it records the figures with their provenance.

## Recommendation

**Request changes.** Fix M1 to M3 (the M3 fix is a PR body edit). L1, L4, L5 and L7 are also cheap. L3 is shared with `main` and could be a follow-up issue.
