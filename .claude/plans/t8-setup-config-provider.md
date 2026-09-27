# Feature: T8 — Setup page, config, provider seam, token counter (S2)

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

The parent's side of the tutor: a setup page where the parent picks a provider, pastes a key, names a
model, sets a monthly token cap and the pupil's weekly target; one module that makes every model call; and
a monthly token count the parent can see. Six things ship:

1. `src/config.ts`: the preset table (a compile-pinned `Record<PresetId, Preset>`, no Gemini), the
   `data/config.json` shape, `readConfig`, `saveSetup` (validates, merges, writes `config.json` and
   `profile.json`), and `publicConfig` (the only config shape that ever reaches the browser: no key, a
   `keySet` boolean instead).
2. `src/events/append.ts` gains `writeDataFile`: the atomic, owner-only, symlink-refusing writer that
   `writeState` already is, generalised, so `config.json` and `profile.json` are written by `src/events`
   and "only `src/events/append.ts` writes under `data/`" (events.md) stays true. It `fchmod`s to `0o600`.
3. `src/providers/openai-compatible.ts`: `chatJson(dataDir, messages, opts)`, the one
   `POST ${base_url}/chat/completions` with `Authorization: Bearer ${key}`. It refuses before the fetch when
   no model is configured or this month's tokens have reached the cap; it appends a `usage@1` event from
   every response that carries `usage`; it parses JSON out of the reply text in code; it never throws and
   never returns or logs the key or the provider's error body. No retry here (retry is T9's `defineJob`).
4. `src/api/config.ts` + three routes in `src/server.ts`: `GET /api/config`, `POST /api/config`,
   `GET /api/usage`. The server's route table is lifted into an exported `apiRoutes(opts)` so the key-leak
   test walks every route that exists.
5. `app/setup.html` + `app/setup.js`: the parent's form, the monthly total against the cap, and a
   first-run redirect from `app/index.html` when no `config.json` exists. "No model" is a preset, so a
   family without a key gets past setup and the tutor runs its deterministic paths (constraint 2).
6. S2: `scripts/s2-run.ts` runs three probes (hint, teach-back mark, one vision mark) through the real
   provider module against a temp data folder. The implementer runs the Anthropic-compat and Ollama legs;
   Linards runs OpenAI, OpenRouter and Groq with their own keys (decided 2026-09-27). Result and Q12 go into the
   architecture doc.

## User Story

As a parent setting the tutor up on the family PC
I want to enter our own model key once, cap how much it can spend, and see this month's usage
So that the tutor uses the provider we pay for, the pupil never sees the key, and a leaked or runaway key
cannot run up a bill past the limit I set

## Problem Statement

T4 shipped a tutor that runs with no model. Every model job planned for T9 onwards (hint, teach-back mark,
examiner mark, intake read) needs three things that do not exist: a place the parent's key lives that the
browser can never read (D11, constraint 7), one network call that works across the providers families
actually use (D4), and a spend guardrail (PRD guardrail: monthly spend under the cap; R4: a leaked key is
bounded by the cap). S2 must also answer whether one OpenAI-compatible `fetch` really covers OpenAI,
Anthropic compat, OpenRouter, Groq and Ollama, and Q12 (does Anthropic compat carry vision and JSON).

## Solution Statement

Config is a file under `data/`, written only through `src/events/append.ts`'s new `writeDataFile` with
mode `0600`. The browser talks to it through `publicConfig`, which has no `key` field by type. The provider
module reads the config itself, so no caller (and no route) ever handles the key after it is saved. The
spend cap is a local monthly token limit (decided 2026-09-27): `chatJson` replays the log, reads
`state.tokens[month]` (already derived by T2's `"usage@1"` case in `CASES`, `src/events/replay.ts`) and
refuses before the fetch when it has reached `cap`. Failures are a closed union
(`no-model | cap | timeout | network | http | not-json | bad-response`) so T9's `defineJob` can map each to
its fallback without parsing strings.

## Out of Scope / Non-Goals

- Not included: `defineJob`, the retry-once rule, any real job (`hint`, `teachback_mark`, …), the chat panel
  or the reply guard. T9 owns them. The S2 probes are spike prompts in a script, not jobs.
- Not included: an "update available" check or any other outbound call (T11).
- Not included: a "test connection" button on the setup page. The S2 script is the connection test for
  now; a button is a T9 decision once a real job exists to call.
- Not included: auth on the setup page. D11 "Skipped: auth". The pupil can open `/setup.html` too (Q2).
- Not included: Windows ACLs for owner-only. POSIX mode only here; Windows is owed by #29.
- Not included: prices or money. The app counts tokens; the setup page tells the parent to set the money
  cap in the provider's own account (D4: "The spend cap is the provider's").
- Not included: a per-provider adapter. If S2 comes in worse than 4 of 5, that adapter is a new ticket
  (S2 decision rule), not a patch in T8.
- Not changing: the event union's members. `usage@1` exists (`UsageV1` in `src/events/types.ts`); T8 appends it and adds one optional
  field (`estimated`, Task 4a), which replay ignores. T8 does not change `State` or `state.shape`.
- Not changing: the unrelated working-tree edit to `.claude/skills/piv-create-pr/SKILL.md`. It stays out of
  the T8 branch.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium (small surface, but a secret, a network seam and a real multi-provider spike)
**Primary Systems Affected**: `src/config.ts` (new), `src/providers/` (new), `src/api/`, `src/server.ts`, `src/events/append.ts`, `app/`
**Dependencies**: none new. Bun's built-in `fetch`, `AbortSignal.timeout`, `Bun.serve`. No provider SDK (a test enforces it).

## Related Work

**Implements**: #10 (T8) · **Epic**: #1 · PRD `docs/prd/study-tutor-v2.prd.md` · Architecture `docs/prd/study-tutor-v2.architecture.md` (D4, D11, S2, Q12) · Ticket file `docs/tickets/study-tutor-v2.md` (T8)

**Back-references**:

- `.claude/plans/t2-events-append-replay.md` - Why: `appendEvent`, `resolveInData`, `writeState`, the `usage@1` shape and the `tokens` reducer this ticket writes to and reads from.
- `.claude/plans/t4-server-and-lesson-bridge.md` - Why: `startServer`, `refuseForeign`, the `json()` helper and the `withServer` test harness this ticket extends.

**Forward-references**:

- #29 - owner-only `config.json` on Windows (ACL), owed by this ticket.
- T9 (`defineJob`, jobs) consumes `chatJson` and its `Failure` union.
- T5 reads `profile.json`'s `weeklyTarget` for the flame ("n of target this week").

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `src/events/append.ts` (whole file, 168 lines) - Why: `resolveInData` (26-54), `OWNER_ONLY`/`WRITE` flags (12-21), `readStoredState` (122-135, the "missing → null" read to mirror), `writeState` (138-159, the atomic writer to generalise). `appendEvent` (60-102) is what the provider calls for `usage@1`.
- `src/events/types.ts` (`UsageV1`, `FIELDS["usage@1"]`, `KEYS["usage@1"]`, the `_complete` check) - Why: `UsageV1` = `{job, model, input, output}`, all non-negative integers for the counts; `KEYS["usage@1"]`. A float or negative count is refused by `appendEvent`.
- `src/events/replay.ts` (`State.tokens`, the `"usage@1"` case in `CASES`) - Why: `state.tokens` is keyed `YYYY-MM` of the **London** day (`localDay(e.t).slice(0, 7)`) and sums `input + output`. The cap check and `/api/usage` must use the same month key or the cap drifts by one night at month end.
- `src/mcp/clock.ts` (5-7, 24-30) - Why: `utcNow`, `localDay`. The provider's `now` parameter defaults to `utcNow`, same as `postEvent`.
- `src/server.ts` (whole, 190 lines) - Why: `json()` (70-75), `refuseForeign` (86-99), route handlers (101-127), `startServer` routes object (137-143). Lift the routes into `apiRoutes`.
- `src/api/event.ts` (whole) and `src/api/state.ts` (whole) - Why: the handler shape to mirror in `src/api/config.ts`: a pure function returning `{status, body}`, the route in `server.ts` doing `refuseForeign` and `req.json()`.
- `src/server.test.ts` (1-53 harness; the `refuseForeign` tests further down) - Why: `withTemp` / `withServer` harness to reuse for route tests and the key-leak test.
- `src/events/append.test.ts` - Why: temp-dir pattern (`fs.realpathSync.native(fs.mkdtempSync(...))`), symlink refusal tests to mirror for `writeDataFile`.
- `scripts/scripts.test.ts` (1-37) - Why: scripts run with `Bun.spawnSync` from a temp cwd; the "takes no path" rule (PR #23 H1). `s2-run.ts` takes no data path either.
- `scripts/replay-check.ts` - Why: script shape (top-level `try`, plain console text, `process.exit(1)` on failure).
- `app/index.html` - Why: the page to add the first-run redirect and a Setup link to. Plain JS, no bundler.
- `app/practice.js` - Why: how a page in `app/` fetches `/api/*` today (plain `fetch`, JSON).
- `.claude/references/events.md` - Why: "Only `src/events/append.ts` writes under `data/`", the Routes section to extend.
- `.claude/references/model-jobs.md` (Provider, Guard) - Why: the provider contract; update it with the failure union and the cap.
- `.claude/rules/content.md` - Why: register for any text on the setup page and in the S2 prompts; the system line "Do not state the answer. The pupil has not attempted this yet."

### New Files to Create

- `src/config.ts` - presets, `Config` type, `readConfig`, `saveSetup`, `publicConfig`, `readProfile`.
- `src/config.test.ts` - validation, merge rules (key follows host), file modes, profile merge.
- `src/providers/openai-compatible.ts` - `chatJson`, `parseJsonReply`, `imagePart`, `Failure` union.
- `src/providers/openai-compatible.test.ts` - mocked-fetch tests (success, non-JSON, HTTP error, timeout, network, no model, cap, missing usage) plus a real-socket test against a `Bun.serve` stub.
- `src/api/config.ts` - `getConfig`, `postConfig`, `getUsage` handlers.
- `src/api/config.test.ts` - handler tests.
- `app/setup.html`, `app/setup.js` - the parent's page.
- `scripts/s2-run.ts` - the S2 spike runner.
- `scripts/__fixtures__/s2-working.jpg` - one photo of handwritten working for the vision probe (Q4).

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [Anthropic: OpenAI SDK compatibility](https://platform.claude.com/docs/en/api/openai-sdk) — read during planning, 2026-09-27 (`observed`):
  - base URL `https://api.anthropic.com/v1/` (trailing slash), `authorization` header "Fully supported" (Bearer works).
  - `response_format` **ignored**: JSON must be asked for in the prompt, which is what D4 already says.
  - `image_url` content parts: `url` fully supported, `detail` ignored.
  - `usage.prompt_tokens` / `usage.completion_tokens` fully supported.
  - System messages are hoisted and concatenated; `temperature` capped at 1; `n` must be 1.
  - "If your key is a personal or service account key with access to multiple workspaces, also send the `anthropic-workspace-id` header on every request." The three-field seam has no slot for it (Q12, below).
- [OpenAI: Chat Completions API reference](https://platform.openai.com/docs/api-reference/chat/create) — `messages[].content` parts, `usage`, `max_tokens` vs `max_completion_tokens`. Why: some OpenAI models refuse `max_tokens` (`expected`, from memory; S2 records it).
- [Ollama: OpenAI compatibility](https://github.com/ollama/ollama/blob/main/docs/openai.md) — base URL `http://localhost:11434/v1`; a base64 JPEG data URL in an `image_url` part is accepted (`observed`, Ollama 0.30.10, `qwen2.5vl:3b`, 3 calls, 1,236 prompt tokens each); `usage` returned; `max_completion_tokens` silently ignored (`observed`).
- [Bun: fetch](https://bun.sh/docs/api/fetch) and [MDN: AbortSignal.timeout](https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static) — the rejection on timeout is a `DOMException` named `TimeoutError` (`expected`; the real-socket test in Task 6 pins what Bun actually throws).

### Patterns to Follow

**Handler shape** (`src/api/event.ts:6-8, 24-52`): a pure function returns `{ status, body }`; `server.ts` does `refuseForeign`, `req.json()` and `json(r.status, r.body)`. Refusals are `{ error: string }` in plain words.

**"Missing is null" reads** (`src/events/append.ts:122-135`):

```ts
export function readStoredState(dataDir: string): unknown {
  let file: string;
  try {
    file = resolveInData(dataDir, STATE_FILE);
  } catch (err) {
    if (isMissing(err)) return null;
    throw err;
  }
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}
```

**Validation style** (`src/events/types.ts:96-104`): small predicates (`str`, `int`, `oneOf`) over `Record<string, unknown>`, no schema library. Mirror that in `config.ts`.

**Compile-pinned sets** (`src/events/types.ts:117, 153-168`): a table typed `{ [K in Union]: X }` so a missing key fails `tsc`. Presets use `Record<PresetId, Preset>`.

**Console errors** (`src/server.ts:106`, `src/api/event.ts:49`): `console.error(\`Could not …: ${message}\`)`. In the provider, the message is built from the failure reason and HTTP status only. Never the key, never the provider's response body, never the request headers.

**Comments**: one short line of *why* above a non-obvious line, as in `append.ts`. No JSDoc on every function; a one-line `/** … */` on exported ones.

---

## THE ANSWER GUARD (CLAUDE.md "Restate the guard")

T8 touches the provider seam and writes prompts (the S2 probes), so the guard is restated here and in the PR body.

- **The provider never sees an item.** `chatJson` takes `Message[]` and nothing else. It has no import from `src/content`, no item type in its signature, and no way to look up `answers` or `mark_scheme`. Whether an answer can enter a prompt is decided entirely by the caller that builds the messages, which from T9 on is a job whose input type has no `answers` field until `hasAttempt(item)` reads true from the event log. A test asserts `src/providers/openai-compatible.ts` imports nothing from `src/content` (Task 7).
- **The S2 hint probe is answer-free.** Its user message is a hand-written stem with no answer and no mark scheme, and its system message carries the `content.md` line verbatim: "Do not state the answer. The pupil has not attempted this yet."
- **The teach-back and vision probes are post-attempt by construction.** A teach-back is the pupil's explanation of an attempt already made, and the photo *is* the attempt; both carry a mark scheme, and both ask for marks per line, never a corrected solution (model-jobs.md).
- **No route returns config secrets, and no route returns an item's answers.** T8 adds no route that reads `content/`.

---

## IMPLEMENTATION PLAN

### Phase 0: Branch

Work in a **separate worktree**, never in `~/Desktop/study-tutor`: during planning another session was implementing T7 in that checkout (uncommitted `case@1` edits to `replay.ts` and `types.ts`), and `piv-commit` commits all uncommitted changes, so a shared tree would mix the two tickets.

```bash
cd ~/Desktop/study-tutor && git fetch
git worktree add ../study-tutor-t8 -b feature/t8-setup-provider origin/main
cp .claude/plans/t8-setup-config-provider.md ../study-tutor-t8/.claude/plans/
mkdir -p ../study-tutor-t8/scripts/__fixtures__
cp scripts/__fixtures__/s2-working.svg scripts/__fixtures__/s2-working.jpg ../study-tutor-t8/scripts/__fixtures__/
cd ../study-tutor-t8 && bun install
```

Then `ls ~/Desktop/study-tutor/scripts/__fixtures__/s2-working.*` and `ls ~/Desktop/study-tutor/.claude/plans/t8-*`: if the T7 session has already committed them, tell Linards (they belong to T8). If the files are gone from the main checkout, rebuild the fixture from the SVG under Task 15. The unrelated `.claude/skills/piv-create-pr/SKILL.md` edit stays in the main checkout and out of T8.

### Phase 1: Foundation — the data-file writer, config

`writeDataFile` in `append.ts`, then `src/config.ts` on top of it. Everything else depends on these.

### Phase 2: Provider

**Depends on:** Phase 1 (`readConfig`).
**Independent of:** Phase 3 (the routes never call the provider).

### Phase 3: Routes and pages

**Depends on:** Phase 1.

`src/api/config.ts`, `apiRoutes` in `server.ts`, `app/setup.html`/`setup.js`, the redirect in `index.html`, the key-leak test.

### Phase 4: Docs, gate, S2

**Depends on:** Phases 1–3. S2 needs the provider (Phase 2) and `saveSetup` (Phase 1).

---

## STEP-BY-STEP TASKS

IMPORTANT: Execute every task in order, top to bottom. Each task is atomic and independently testable.

### 1. UPDATE `src/events/append.ts` — add `writeDataFile`, make `writeState` use it

- **IMPLEMENT**:

  ```ts
  /** Writes one file under data/ atomically (temp, fsync, rename), owner-only, refusing paths that leave data/. */
  export function writeDataFile(dataDir: string, rel: string, text: string): void {
    fs.mkdirSync(dataDir, { recursive: true });
    const file = resolveInData(dataDir, rel);
    const tmp = resolveInData(dataDir, `${rel}.tmp`);
    const fd = fs.openSync(tmp, WRITE, OWNER_ONLY);
    try {
      // openSync's mode applies only when it creates the file; a leftover .tmp keeps its old mode.
      fs.fchmodSync(fd, OWNER_ONLY);
      fs.writeSync(fd, text);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    // … the existing rename-then-copy fallback from writeState, unchanged
  }

  export function writeState(dataDir: string, state: State): void {
    writeDataFile(dataDir, STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);
  }
  ```

  Keep the rename fallback's comment. Export `CONFIG_FILE = "config.json"` and `PROFILE_FILE = "profile.json"` next to `EVENTS_FILE`/`STATE_FILE` (`append.ts:7-8`). Add `readDataJson(dataDir, rel): unknown` generalising `readStoredState` the same way, and make `readStoredState` call it.
- **PATTERN**: `append.ts:122-159`.
- **GOTCHA**: `fchmodSync` on Windows is accepted and does nothing useful; that is #29's leg, not an error. Do not branch on platform here.
- **GOTCHA**: `WRITE` already has `O_NOFOLLOW` (`append.ts:16-20`), so a `config.json.tmp` symlink planted in `data/` fails with `ELOOP`. Keep it.
- **VALIDATE**: `bun test src/events` — every existing `writeState`/`readStoredState` test stays green (refactor, no behaviour change), plus the new tests in Task 2.
- **SATISFIES**: AC 1 (owner-only), ground rule "only `src/events` writes `data/`".

### 2. UPDATE `src/events/append.test.ts` — `writeDataFile` tests

- **IMPLEMENT**: (a) writes the text, mode `& 0o777` is `0o600` (skip the mode assertion when `process.platform === "win32"`); (b) a pre-existing `config.json.tmp` with mode `0o644` → after the write, `config.json` is `0o600` (this is the `fchmod` case); (c) `rel` of `../x.json` is refused with nothing written outside; (d) `config.json` being a symlink to a file outside `data/` is refused (mirror the existing symlink tests).
- **VALIDATE**: `bun test src/events/append.test.ts`. Then, to prove (b) tests the `fchmod`: delete the `fchmodSync` line, run (b) → red; restore → green. Record both runs in the execution report.
- **SATISFIES**: AC 1.

### 3. CREATE `src/config.ts`

- **IMPLEMENT**:

  ```ts
  export const PRESET_IDS = ["none", "openai", "anthropic", "openrouter", "groq",
    "mistral", "deepseek", "ollama", "lmstudio", "custom"] as const;
  export type PresetId = (typeof PRESET_IDS)[number];
  export type LimitField = "max_tokens" | "max_completion_tokens";
  export type Preset = { label: string; base_url: string; model: string; needsKey: boolean; limitField: LimitField };

  // Labels over the same three fields (D4). No Gemini (PRD non-goal). `limitField` is the name the
  // provider honours for the reply-length limit: Ollama silently ignores max_completion_tokens, and
  // OpenAI's o-series refuses max_tokens (provenance per row in the table below the code).
  export const PRESETS: Record<PresetId, Preset> = {
    none:       { label: "No model", base_url: "", model: "", needsKey: false, limitField: "max_tokens" },
    openai:     { label: "OpenAI", base_url: "https://api.openai.com/v1", model: "gpt-4.1-mini", needsKey: true, limitField: "max_completion_tokens" },
    anthropic:  { label: "Anthropic (OpenAI-compatible)", base_url: "https://api.anthropic.com/v1", model: "claude-haiku-4-5", needsKey: true, limitField: "max_completion_tokens" },
    openrouter: { label: "OpenRouter", base_url: "https://openrouter.ai/api/v1", model: "", needsKey: true, limitField: "max_completion_tokens" },
    groq:       { label: "Groq", base_url: "https://api.groq.com/openai/v1", model: "", needsKey: true, limitField: "max_completion_tokens" },
    mistral:    { label: "Mistral", base_url: "https://api.mistral.ai/v1", model: "mistral-small-latest", needsKey: true, limitField: "max_tokens" },
    deepseek:   { label: "DeepSeek", base_url: "https://api.deepseek.com/v1", model: "deepseek-chat", needsKey: true, limitField: "max_tokens" },
    ollama:     { label: "Ollama (on this computer)", base_url: "http://localhost:11434/v1", model: "qwen2.5:14b", needsKey: false, limitField: "max_tokens" },
    lmstudio:   { label: "LM Studio (on this computer)", base_url: "http://localhost:1234/v1", model: "", needsKey: false, limitField: "max_tokens" },
    custom:     { label: "Other OpenAI-compatible", base_url: "", model: "", needsKey: false, limitField: "max_tokens" },
  };

  export type Config = { v: 1; preset: PresetId; base_url: string; key: string; model: string; cap: number };
  export type PublicConfig = Omit<Config, "key" | "v"> & { keySet: boolean };
  export type Profile = { weeklyTarget: number } & Record<string, unknown>;

  export const DEFAULT_CAP = 1_000_000;      // tokens per month; derived in Notes ("Default cap")
  export const DEFAULT_WEEKLY_TARGET = 3;    // days of work per week; the parent sets it on the same form

  export function readConfig(dataDir: string): Config | null;           // invalid or missing → null
  export function publicConfig(c: Config): PublicConfig;                // builds a new object field by field
  export function readProfile(dataDir: string): Profile;                // missing → { weeklyTarget: DEFAULT_WEEKLY_TARGET }
  export type SetupInput = { preset, base_url, model, key, cap, weeklyTarget }; // all unknown until validated
  export function saveSetup(dataDir: string, body: unknown):
    { ok: true; config: PublicConfig; weeklyTarget: number } | { ok: false; error: string };
  ```

  `limitField` provenance (planning session, 2026-09-27):

  | Preset | Field | Provenance |
  |---|---|---|
  | anthropic | `max_completion_tokens` | `observed`: `claude-haiku-4-5` via compat, limit 5 → 5 completion tokens, `finish_reason: length`, for both field names; no limit also 200 |
  | ollama | `max_tokens` | `observed`: Ollama 0.30.10, `qwen2.5:14b`, limit 5 → `max_tokens` gave 5 (`length`), `max_completion_tokens` gave 156 (`stop`, **ignored**) |
  | openai | `max_completion_tokens` | openai-node SDK doc comment, read 2026-09-27: `max_tokens` "is now deprecated in favor of `max_completion_tokens`, and is not compatible with o-series models" |
  | groq | `max_completion_tokens` | Groq API reference, read 2026-09-27: `max_tokens` "Deprecated in favor of max_completion_tokens" |
  | openrouter | `max_completion_tokens` | OpenRouter parameters doc, read 2026-09-27: both accepted, same meaning |
  | mistral, deepseek, lmstudio, custom | `max_tokens` | `expected`: the older name every OpenAI-compatible server listed here accepts; not in S2 |

  `limitField` is not a parent-facing field and is not stored in `config.json`: `chatJson` looks it up from `PRESETS[config.preset]`, so it can change in an update without touching `data/`.

  `saveSetup` rules, in order:
  1. `preset` must be in `PRESET_IDS`.
  2. `preset === "none"`: write `{v:1, preset:"none", base_url:"", key:"", model:"", cap}`. The saved key is **cleared**. `cap` absent → `DEFAULT_CAP` (the form hides it for "No model"; `readConfig` still needs an integer ≥ 1).
  3. Otherwise `base_url` is trimmed, a trailing `/` removed, must parse as a URL with `https:`, or `http:` only when the hostname is `localhost`, `127.0.0.1` or `[::1]` (the key must not cross a network in clear, ground rule "Network"). `model` is a non-empty trimmed string. `cap` is an integer ≥ 1.
  4. **The key follows the host.** `key` trimmed. Non-empty → use it. Empty → keep the saved key **only if** a saved config exists and `new URL(saved.base_url).host === new URL(base_url).host`; otherwise the key is `""`. Then, if `PRESETS[preset].needsKey` and the key is `""`, refuse: "Paste the key for this provider." This stops an OpenAI key being sent to Anthropic when the parent switches preset and leaves the key box empty.
  5. `weeklyTarget` integer 1–7. Profile is read with `readDataJson`, `weeklyTarget` set, other keys kept (T5 and later add `pupil`, `board`, …), written with `writeDataFile`.
  6. Write `config.json` then `profile.json`, both with `writeDataFile`. Return `publicConfig`.

  Refusal messages are plain parent-facing sentences ("The address must start with https://, or http:// for a model on this computer.").
- **PATTERN**: predicates as in `src/events/types.ts:96-104`; compile-pinned table as in `types.ts:117`.
- **IMPORTS**: `writeDataFile`, `readDataJson`, `CONFIG_FILE`, `PROFILE_FILE` from `./events/append`.
- **GOTCHA**: `publicConfig` must build a fresh object (`{preset: c.preset, base_url: c.base_url, model: c.model, cap: c.cap, keySet: c.key !== ""}`), never `{...c}` with a `delete`. A spread copies any future field added to `Config` straight to the browser; the explicit build does not.
- **GOTCHA**: model names in `PRESETS` are suggestions that go stale (R4). They are defaults in the form, editable. Where no model is known to fit, leave `""` and the form asks for one. S2 records the model each leg actually used.
- **GOTCHA**: the key-follows-host comparison runs only when the saved config has a non-empty `base_url`. A saved `none` config has `base_url: ""` and `new URL("")` throws, which would turn a normal save into a 500. Saved `none` → no key to keep.
- **GOTCHA**: `readConfig` validates shape (`v === 1`, `preset` in the list, strings, `cap` int ≥ 1) and returns `null` otherwise, so a hand-edited broken file behaves as "not set up", never as a crash.
- **VALIDATE**: `bun test src/config.test.ts` (Task 4).
- **SATISFIES**: AC 1, AC 2 (by type), AC 4 (presets).

### 4. CREATE `src/config.test.ts`

- **IMPLEMENT**, one test each:
  - valid OpenAI setup writes `config.json` (mode `0o600`, skip on win32) and `profile.json` with `weeklyTarget`.
  - `publicConfig` has no `key` property (`expect(Object.keys(pc)).not.toContain("key")`) and `keySet` true.
  - `http://` to a non-loopback host refused, nothing written; `http://localhost:11434/v1` accepted; `https://api.anthropic.com/v1/` stored without the trailing slash.
  - empty key, same host → saved key kept.
  - **empty key, preset switched openai → anthropic → refused** "Paste the key", and the saved file still holds the OpenAI config (not half-written).
  - empty key, preset switched openai → ollama → accepted with `key: ""` (the OpenAI key is not carried to a local host).
  - `none` clears the key.
  - `cap` 0, `-1`, `1.5`, `"10"` refused; `weeklyTarget` 0 and 8 refused.
  - existing `profile.json` with `{ "pupil": "M" }` keeps `pupil` after a save.
  - `readConfig` on a missing `data/` → `null` and creates nothing; on a corrupt file → `null`.
  - `PRESETS` has no id or label matching `/gemini/i`, and no `base_url` containing `googleapis` or `generativelanguage`.
  - `limitField` pinned per the provenance table: `ollama` is `max_tokens` (the observed silent-ignore case); `openai`, `anthropic`, `openrouter`, `groq` are `max_completion_tokens`.
- **PATTERN**: temp dir helper from `src/events/append.test.ts`.
- **VALIDATE**: `bun test src/config.test.ts`
- **SATISFIES**: AC 1, AC 4.

### 4a. UPDATE `src/events/types.ts` — optional `estimated` on `usage@1`

- **IMPLEMENT**: `UsageV1` gains `estimated?: true`; `FIELDS["usage@1"]` adds `&& (o.estimated === undefined || o.estimated === true)`; `KEYS["usage@1"]` adds `"estimated"` (the `_complete` check in `types.ts` fails `tsc` until it does). No reducer change: the `"usage@1"` case in `replay.ts` already sums `input + output`, estimated or not. Add one line with `"estimated":true` to the `usage@1` fixture under `src/events/__fixtures__/` and assert it parses.
- **WHY IN PLACE, NOT `usage@2`**: events.md allows editing a `(type, v)` in place "until the first GitHub release whose build can append it". `gh release list` returns nothing (`observed`, 2026-09-27), and no shipped build appends `usage@1` yet (T8 is its first writer).
- **GOTCHA (parallel work)**: the T7 session is adding `case@1` to the same three tables in `types.ts` (seen in the shared working tree during planning). Whichever merges second resolves by keeping both entries in `EVENT_TYPES`, `FIELDS` and `KEYS`; `tsc` catches a dropped one through `_complete`.
- **VALIDATE**: `bun test src/events` (replay, check, fixtures) green; `bunx tsc --noEmit` green.
- **SATISFIES**: AC 7 (a response without `usage` still counts toward the cap).

### 5. CREATE `src/providers/openai-compatible.ts`

- **IMPLEMENT**:

  ```ts
  export type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
  export type Message = { role: "system" | "user" | "assistant"; content: string | Part[] };
  export type Failure = "no-model" | "cap" | "timeout" | "network" | "http" | "not-json" | "bad-response";
  export type ChatResult =
    | { ok: true; value: unknown; text: string }
    | { ok: false; reason: Failure; status?: number };
  export type ChatOptions = {
    job: string;                     // goes into the usage event
    maxTokens?: number;              // default MAX_REPLY_TOKENS
    limitField?: LimitField;         // default PRESETS[config.preset].limitField; s2-run overrides it
    timeoutMs?: number;              // default 120_000; see GOTCHA on timeouts
    fetch?: typeof fetch;            // tests inject; default globalThis.fetch
    now?: () => string;              // default utcNow
  };
  export const MAX_REPLY_TOKENS = 1024; // observed largest probe reply: 204 tokens (vision mark); 1024 is 5× that
  export const IMAGE_TOKENS_ESTIMATE = 1000; // observed: text + one 900×610 JPEG = 857 prompt tokens (Anthropic compat)

  export function imagePart(bytes: Uint8Array, mime: string): Part;   // data: URL, base64
  export function parseJsonReply(text: string): unknown | undefined;   // undefined = not JSON
  export async function chatJson(dataDir: string, messages: Message[], opts: ChatOptions): Promise<ChatResult>;
  ```

  `chatJson` runs **one call at a time per process**: an exported `enqueue<T>(fn: () => Promise<T>): Promise<T>` over a module-level chain (`let queue: Promise<unknown> = Promise.resolve()`; `const run = queue.then(fn); queue = run.catch(() => {}); return run;`), and `chatJson` is `enqueue(() => call(dataDir, messages, opts))`. Steps 2 to 9 then never interleave, so a second call's cap check sees the first call's usage line. Worst case across processes is in Q1.

  `chatJson` steps (inside the queue):
  1. `readConfig(dataDir)`; `null` or `preset === "none"` → `{ok:false, reason:"no-model"}`. No fetch.
  2. `month = localDay(now()).slice(0, 7)`; `used = replay(readLines(dataDir)).tokens[month] ?? 0`; `used >= config.cap` → `{ok:false, reason:"cap"}`. No fetch. Use `replay`, not `currentState`: a read must not write `state.json` as a side effect.
  3. URL: `${config.base_url}/chat/completions` (`saveSetup` stripped any trailing slash, so no `//`).
  4. Headers: `content-type: application/json`; `authorization: Bearer ${key}` **only when `key !== ""`** (Ollama and LM Studio take none).
  5. Body: `{ model, messages, [limitField]: maxTokens }`. No `response_format` (Anthropic compat ignores it, `observed` in its doc; D4 says JSON is asked for in the prompt), no `temperature` (OpenAI's o-series accepts only the default; leaving it out is valid everywhere).
  6. `fetch(url, { method: "POST", headers, body, signal: AbortSignal.timeout(timeoutMs) })`. A rejection whose `name` is `"TimeoutError"` → `timeout` (`observed`, Bun 1.3.4: a hung `Bun.serve` stub with `AbortSignal.timeout(100)` rejects with `DOMException` named `TimeoutError`); any other rejection → `network` (`observed`: a refused port rejects with name `Error`, code `ConnectionRefused`).
  7. `!res.ok` → `{ok:false, reason:"http", status: res.status}`. Read and discard the body (`await res.text()` inside a `try`) so the socket is released; never put it anywhere.
  8. Parse the response body as JSON; a body that is not a JSON object → `bad-response`, and no usage event (nothing to count from).
  9. Usage: one event for every 200 response whose body is a JSON object, before the content is checked. `usage.prompt_tokens` and `usage.completion_tokens` both non-negative integers → `appendEvent(dataDir, { v:1, type:"usage", job, model: config.model, input, output }, now)`. Otherwise (field missing, float, negative) → the same event with an estimate and `estimated: true`: `input = ceil(textChars / 4) + IMAGE_TOKENS_ESTIMATE × imageParts`, `output = ceil(content.length / 4)` (0 when `choices[0].message.content` is not a string), where `textChars` counts the text of every message and text part and never the base64 of an image (a 51 kB JPEG as base64 would read as ~17,000 tokens against 857 `observed`). Four characters per token is the usual English rule of thumb (`expected`); it only needs to be the right order of magnitude to keep the cap live. Wrap the append in `try/catch`: a failed append logs `Could not record token use: <message>` and the reply is still returned. Usage is recorded **before** steps 10 and 11, so tokens spent on a malformed or non-JSON reply still count toward the cap.
  10. `choices[0].message.content` must be a string, else `bad-response`.
  11. `parseJsonReply(content)` → `undefined` gives `not-json`, else `{ok:true, value, text: content}`.

  `parseJsonReply`: trim; strip one leading `<think>…</think>` block (Qwen-family reasoning output via Ollama, S4's model); if the rest is a single fenced block (required, not defensive: `claude-haiku-4-5` via compat wrapped every JSON reply in ```` ```json ```` fences in all four planning calls, `observed`; Ollama `qwen2.5:14b` returned bare JSON in all three, `observed`) (```` ```json … ``` ```` or ```` ``` … ``` ````), take its inside; `JSON.parse`; any throw → `undefined`. No hunting for the first `{` in prose: a job that gets prose should fall back, not guess.

  Logging: on every failure except `no-model`, one `console.error` line: `Model call failed (${job}): ${reason}${status ? ` ${status}` : ""}`. Nothing else.
- **IMPORTS**: `readConfig`, `PRESETS`, `type LimitField` from `../config`; `appendEvent`, `readLines` from `../events/append`; `replay` from `../events/replay`; `localDay`, `utcNow` from `../mcp/clock`. **Nothing from `../content`** (guard).
- **GOTCHA**: never throw out of `chatJson`. T9's `defineJob` treats every `ok:false` as "fall back"; an exception would skip the fallback and break a session.
- **GOTCHA**: the `usage` event's `input`/`output` must be integers (`types.ts:98`). Check reported values with `Number.isInteger(x) && x >= 0`; anything else takes the estimate path, so the append is never refused and the cap never goes blind.
- **GOTCHA**: timeouts. 120 s default because a local vision model is the slow case: Ollama `qwen2.5vl:3b` on the dev Mac (Intel) took 63.8 s for the first vision call after loading, then 4.9 s and 11.2 s (`observed`, planning). 60 s would have timed out the first call. If S2 records a slower first call, raise the default and note the figure. The queue means one hung call delays the next by up to the timeout; that is the price of an exact cap, and T9's jobs run one at a time anyway.
- **GOTCHA**: the queue must not deadlock on a throw. `chatJson` never throws by design, but the `queue = run.catch(() => {})` line is what keeps a future bug from wedging every later call. Test it (Task 6).
- **VALIDATE**: `bun test src/providers`
- **SATISFIES**: AC 3, AC 5, AC 6, AC 7.

### 6. CREATE `src/providers/openai-compatible.test.ts`

- **IMPLEMENT**: a temp `data/` with a config written by `saveSetup` (key `sk-test-SECRET-9f3a`). Mocked `fetch` records `(url, init)`.
  - **success**: reply content `{"hint":"Start with 10%."}`, usage `{prompt_tokens: 120, completion_tokens: 30}` → `ok`, `value.hint` set; recorded URL is `${base_url}/chat/completions`; `authorization` is `Bearer sk-test-SECRET-9f3a`; body has `model`, `messages`, `max_completion_tokens: 1024` (the OpenAI preset's `limitField`), no `max_tokens`, no `response_format`, no `temperature`; one `usage@1` line in `events.jsonl` with `job`, `model`, `input: 120`, `output: 30`.
  - **fenced JSON** and **`<think>` prefix** parse.
  - **non-JSON**: content `Sure, here is a hint: …` → `{ok:false, reason:"not-json"}` and the usage line **is** appended.
  - **HTTP error**: 401 with body `{"error":{"message":"Incorrect API key provided: sk-test-SECRET-9f3a"}}` → `{reason:"http", status:401}`; `JSON.stringify(result)` does not contain the key; no usage line; spy on `console.error` and assert no logged argument contains the key.
  - **HTTP 500** → `http`, status 500.
  - **timeout** (mock): `fetch` returns a promise that rejects with `init.signal.reason` on abort; `timeoutMs: 20` → `timeout`.
  - **network**: `fetch` rejects with `TypeError("fetch failed")` → `network`.
  - **no model**: no `config.json` → `no-model`, `fetch` never called; `preset: "none"` → same.
  - **cap**: cap 100, a `usage@1` line of 60 + 40 this London month already in the log → `cap`, `fetch` never called. A line from last month does not count (use `now` to pin the date, e.g. `2026-10-01T00:30:00Z` with a usage line at `2026-09-30T22:59:59Z`, which is 23:59 BST on 30 September → September).
  - **missing usage** → `ok`, one `usage@1` line with `estimated: true`; for a system message of 400 characters, a user message of 40 characters plus one image part, and a 100-character reply: `input` = ceil(440 / 4) + 1000 = 1110, `output` = 25 (derived from the Task 5 formula). The image's base64 does not inflate `input`.
  - **float usage** (`prompt_tokens: 12.5`) → estimate path, `estimated: true`, no refused-append error logged.
  - **limit field**: Ollama preset sends `max_tokens`, not `max_completion_tokens`; `opts.limitField` overrides the preset.
  - **one at a time**: cap 100; the mock `fetch` resolves after 30 ms with usage 100 + 0. Fire two `chatJson` calls without awaiting the first. With the queue: the first reads 0 (< 100) and fetches; the second runs after the first's usage line exists, reads 100 (≥ 100) and returns `cap`; `fetch` called exactly once; one usage line. Without the queue both read 0 before either appends, both fetch, two usage lines (derived). Mutate by calling `call` directly instead of `enqueue(...)` and record the red run.
  - **queue survives a rejection**: `enqueue(() => Promise.reject(new Error("x")))` rejects; a following `enqueue(() => Promise.resolve(1))` resolves to 1.
  - **bad-response**: `{ "choices": [] }` → `bad-response`, with one `estimated: true` usage line (`output` 0: the request was still sent and billed); a 200 whose body is `not json` → `bad-response` and no usage line.
  - **no key** (Ollama preset): no `authorization` header sent.
  - **vision**: `imagePart(new Uint8Array([1,2,3]), "image/jpeg")` → `url` is `data:image/jpeg;base64,AQID`; the part appears unchanged in the sent body.
  - **real socket** (the mocks above only test the mocks): `Bun.serve({ port: 0, hostname: "127.0.0.1" })` stub with two paths. Config `custom` preset, `base_url` `http://127.0.0.1:<port>/v1/` (trailing slash, as Anthropic's documented URL has). Case A: stub answers 200 with content and usage → assert the stub saw path `/v1/chat/completions` exactly, the Bearer header and the JSON body. Case B: stub never answers (await a promise that never resolves) with `timeoutMs: 200` → `reason: "timeout"`. This pins what Bun's real `AbortSignal.timeout` rejection is named; if Bun reports something else, fix step 6 of Task 5, not the test.
- **PATTERN**: `withServer` in `src/server.test.ts:34-53` for the stub lifecycle (`server.stop(true)` in `finally`).
- **VALIDATE**: `bun test src/providers`. Then mutate: change the timeout check to `err.name === "AbortError"`; the mocked timeout test and the real-socket case B must both go red (if only one does, the other is not testing Bun's behaviour; record which). Restore.
- **SATISFIES**: AC 5 (success, non-JSON, HTTP error, timeout), AC 6, AC 7.

### 7. ADD provider-seam guard tests (in `src/providers/openai-compatible.test.ts`)

- **IMPLEMENT**:
  - Scan every `*.ts` under `src/` (`new Bun.Glob("src/**/*.ts").scan()`), excluding `*.test.ts`: the string `chat/completions` appears in `src/providers/openai-compatible.ts` only.
  - `package.json` `dependencies` and `devDependencies` contain no key matching `/^(openai|@anthropic-ai\/|ai$|@ai-sdk\/|litellm|groq-sdk|@mistralai\/)/`.
  - `src/providers/openai-compatible.ts` source has no import from `../content` (guard).
- **VALIDATE**: `bun test src/providers`
- **SATISFIES**: AC 3 ("the only model call"), guard.

### 8. CREATE `src/api/config.ts` and `src/api/config.test.ts`

- **IMPLEMENT**:

  ```ts
  export type ConfigView = { configured: boolean; config: PublicConfig | null; weeklyTarget: number;
    presets: { id: PresetId; label: string; base_url: string; model: string; needsKey: boolean }[] };
  export function getConfig(dataDir: string): { status: 200; body: ConfigView };
  export function postConfig(body: unknown, dataDir: string):
    { status: 200; body: ConfigView } | { status: 400 | 500; body: { error: string } };
  export function getUsage(dataDir: string, now?: () => string):
    { status: 200; body: { month: string; tokens: number; cap: number | null } };
  ```

  `presets` comes from `PRESETS` so `setup.js` holds no parallel list (ground rule "Types": no parallel interfaces). `getUsage` uses the same month key as the provider (`localDay(now()).slice(0, 7)`) and `replay(readLines(dataDir)).tokens`. `postConfig`'s 400 body is only `saveSetup`'s error string; it never echoes any submitted field. A thrown write error → 500 "Could not save the settings", logged as in `api/event.ts:49`.
- **VALIDATE**: `bun test src/api/config.test.ts` — `getConfig` on an empty data dir: `configured:false`, no `data/` created; after `postConfig`: `configured:true`, `keySet:true`, no `key` anywhere in `JSON.stringify(body)`; `getUsage` sums only the London month.
- **SATISFIES**: AC 2, AC 8 (monthly total).

### 9. UPDATE `src/server.ts` — `apiRoutes`, three routes

- **IMPLEMENT**: lift the `routes` object literal (`server.ts:137-143`) into

  ```ts
  /** Every /api route. Exported so the key-leak test walks the same table the server serves. */
  export function apiRoutes(opts: ServerOptions) { return { "/api/state": …, "/api/event": …, "/api/config": { GET, POST }, "/api/usage": { GET } }; }
  ```

  and pass `routes: apiRoutes(opts)` to `Bun.serve`. Each new handler starts with `refuseForeign(req)` exactly as `getState` does; `POST /api/config` reads `req.json()` with the same 400 on bad JSON as `postEventRoute`. Everything returned goes through `json()` (`cache-control: no-store`).
- **GOTCHA**: `refuseForeign` already requires `application/json` on POST (`server.ts:94-97`), so `setup.js` must send that header.
- **GOTCHA (merge order)**: ticket file Wave 3 merges T5, T8, T10 in that order (`docs/tickets/study-tutor-v2.md:350`). T5 adds `/api/next` to the inline `routes`; if T5 is on `main` first, its route moves into `apiRoutes` in this task (a one-line move, and the key-leak test then covers it for free). T10's plan edits only the `import.meta.main` block of `server.ts` and `appendEvent`'s photo check (`.claude/plans/t10-mcp-server.md:49-50, 705`), neither of which this ticket touches. T7 (Wave 4) registers `/api/case` after T8 merges, so it lands inside `apiRoutes`. Rebase on `origin/main` before opening the PR and rerun `bun run check`.
- **VALIDATE**: `bun test src/server.test.ts`
- **SATISFIES**: AC 2, AC 8.

### 10. UPDATE `src/server.test.ts` — the key-leak test

- **IMPLEMENT**: one test, `withServer`:
  1. `POST /api/config` a full OpenAI setup with key `sk-test-SECRET-9f3a` (the response body must not contain it).
  2. For **every path in `Object.keys(apiRoutes(opts))`** and every method it declares: send a GET (or a valid POST where declared) and an invalid POST (`{"preset":"nope","key":"sk-test-SECRET-9f3a"}`) — assert no response body contains the key. Assert the list of paths walked equals `Object.keys(apiRoutes(opts))`, so a new route is covered automatically.
  3. Static: `GET /setup.html`, `/setup.js`, `/data/config.json` → none contains the key, and `/data/config.json` is 404. No `..` or `%2e%2e` cases here: `fetch` normalises both to `/data/config.json` before sending (`observed`, `new URL("http://x/content/%2e%2e/data/config.json").pathname` is `/data/config.json`), so they would test nothing new. Traversal is covered by T4's `staticPath` unit tests.
  4. `data/config.json` on disk does contain the key (the test would pass vacuously if the save silently failed).
- **VALIDATE**: `bun test src/server.test.ts`. Mutate: make `getConfig` return `readConfig(dataDir)` raw; the test must go red. Restore.
- **SATISFIES**: AC 2 ("the key never appears in any response to the browser (test)").

### 11. CREATE `app/setup.html` and `app/setup.js`

- **IMPLEMENT**: `setup.html` in the `index.html` shape (`<main class="lesson">`, `/style.css`). Sections:
  - **Model**: a `<select id="preset">` filled from `/api/config`'s `presets`; `base_url`, `model` text inputs (preset fills them, editable); `key` as `<input type="password" autocomplete="off">` with placeholder "Saved. Leave empty to keep it." when `keySet` and the host is unchanged. Hidden when `No model` is chosen. The key box shows for every other preset, `custom` included (a hosted provider behind "Other" almost always needs a key); `needsKey` only decides whether an empty key is refused.
  - **Monthly limit**: `cap` number input (tokens per month), and one line: "This counts tokens on this computer. Set a money limit in your provider's account as well." Plus "This month: <tokens> of <cap> tokens" from `/api/usage`.
  - With the Anthropic preset selected, one line under the key box: "Use a key made for one workspace." (a multi-workspace key needs a header this setup does not send, Q7).
  - A line at the top: "These settings are for a parent." Anyone at the computer can open this page (decided 2026-09-27: accepted for v1, see Q2); the saved key is never shown back.
  - **Weekly target**: number input 1–7, "days a week with some practice".
  - Save → `fetch("/api/config", { method: "POST", headers: { "content-type": "application/json" }, body })`; on 200 show "Saved." and a link to `/`; on 400 show the error string in a `role="alert"` element.
  - The page never puts the key back into any field (it has no way to: the API does not return it).
- Parent-facing text: British English, sentence case, no emoji, no exclamation marks, plain words (`content.md` register applies in spirit; this is a parent page, not pupil text). Run the prose through `no-ai-slop` then `humanizer` before saving (CLAUDE.md "Prose is a gate").
- **PATTERN**: `app/practice.js` for fetch/DOM style; plain JS, no modules beyond what `practice.js` uses.
- **GOTCHA**: Biome lints `app/**` (`biome.json` includes `**`). No `innerHTML` with API strings; use `textContent`.
- **VALIDATE**: `bunx biome check app/` and Level 4 steps 1–5.
- **SATISFIES**: AC 1, AC 4, AC 8.

### 12. UPDATE `app/index.html` — first-run redirect and a Setup link

- **IMPLEMENT**: before `</body>`:

  ```html
  <script>
  // First run: no settings saved yet, so the parent sets up (or picks "No model") before anything else.
  fetch("/api/config").then((r) => r.json()).then((c) => { if (!c.configured) location.replace("/setup.html"); }).catch(() => {});
  </script>
  ```

  and in the footer `<p><a href="/setup.html">Settings</a> (for a parent)</p>`. Nothing else in `index.html` changes (T6 may rewrite this page; keep the diff to these lines).
- **GOTCHA**: two different cases. A failing `/api/config` (server error, network) stays on the index page (`catch` does nothing). A corrupt `config.json` is not a failure: `readConfig` returns null, `configured` is false, and `/` redirects to setup on every load until a save. That is acceptable because setup can always be completed with "No model", and lessons stay reachable by their direct URLs.
- **VALIDATE**: `bun test src/server.test.ts` still passes its `/` assertions (`server.test.ts:74-76`); Level 4 step 1.
- **SATISFIES**: AC 1 ("on first run").

### 13. UPDATE docs — `.claude/references/events.md`, `.claude/references/model-jobs.md`

- **IMPLEMENT**:
  - `events.md`: under the "Only `src/events/append.ts` writes under `data/`" bullet, name `writeDataFile` and the two new files. Add a short "Config and profile" section: `config.json` = `{v:1, preset, base_url, key, model, cap}` (owner-only; never sent to the browser; `publicConfig` is the browser shape); `profile.json` = `{weeklyTarget, …}` (other keys kept on save; T5 reads `weeklyTarget`, days per week). Routes section: `GET/POST /api/config`, `GET /api/usage`.
  - `events.md` Event line section: `usage` may carry `estimated: true` when the provider reported no usable token counts.
  - `model-jobs.md` Provider section: `chatJson(dataDir, messages, opts)`, the `Failure` union, one call at a time per process, cap refused before the fetch, usage appended (reported or estimated) before JSON parsing, no retry in the provider, key sent only when non-empty, per-preset `limitField`, no `response_format`, replies may arrive in a ```` ```json ```` fence.
- **VALIDATE**: `bunx biome check .` (docs are not linted, but the gate is run after every task).
- **SATISFIES**: documentation AC.

### 14. Gate

- **VALIDATE**: `bun run check` green. Paste the tail (tsc, biome, `bun test` pass count) into the execution report as `observed`.

### 15. CREATE `scripts/s2-run.ts`

- **IMPLEMENT** (write with the Write tool, not a heredoc: the secrets hook blocks Bash heredocs containing `process.env`):
  - Flags: `--preset <id>` (required), `--model <m>` (default the preset's), `--base-url <u>` (default the preset's), `--max-field max_tokens|max_completion_tokens` (default: the preset's `limitField`, passed as `opts.limitField` only when given). Key from `process.env.S2_KEY` (may be empty for Ollama). **No data path flag**: the script makes its own temp dir with `fs.mkdtempSync(path.join(os.tmpdir(), "st-s2-"))`, calls `saveSetup` there, and deletes it at the end. It never writes `data/`.
  - Three probes, each through `chatJson` with the probe's `job` name. If a reply is `not-json` or fails the probe's shape check, run it once more (the job-level retry T9 will have) and record both attempts.
    - **hint** (answer-free, pre-attempt): system message includes "Do not state the answer. The pupil has not attempted this yet." and asks for `{"hint": string}`; user message: a stem such as "Find 35% of 240." with no answer. Shape: `hint` is a non-empty string. Also record whether the hint contains `84` (the answer, 0.35 × 240; a leak is a finding, not a script failure).
    - Both marking probes use this system message, verbatim (the version tested in planning, which fixed the entry count):
      `You mark GCSE working against a mark scheme. Reply with JSON only, in this shape: {"marks":[{"line":1,"mark":0,"reason":"..."},{"line":2,...},{"line":3,...}]}. "line" is the mark scheme line number, 1 to 3, not a line of the pupil's working. Give exactly three entries, one per mark scheme line, in order. "mark" is 0 or 1. Name the mistake; never write a corrected solution.`
    - **teach-back mark** (post-attempt): a short mark scheme (3 lines) and a pupil explanation; asks for `{"marks":[{"line":number,"mark":0|1,"reason":string}]}` with no corrected solution and exactly one entry per mark scheme line. Shape: array of exactly 3 with those types.
    - **vision mark** (post-attempt): `imagePart(await Bun.file("scripts/__fixtures__/s2-working.jpg").bytes(), "image/jpeg")`, the stem "Find 35% of 240." and the 3-line mark scheme used in planning (1: finds 10% (24) or equivalent; 2: finds 30% and 5% (72 and 12) or equivalent; 3: adds to get the final value correctly). Same output shape as teach-back. Record a second column, **"caught the slip"**: the fixture's last line is written `72 + 12 = 86`, so a correct mark gives line 3 a 0. This is model quality, not seam: it is recorded, and it does not count toward "clean".
  - The fixture is already in the repo (made during planning, `observed`): `scripts/__fixtures__/s2-working.svg` (source, a handwriting-style font on ruled paper) rendered with `qlmanage -t` and cropped with `sips` to `s2-working.jpg`, 900×610, 51,257 bytes, no camera or GPS metadata (`sips -g all`). Rebuild it with those two commands if the SVG changes: `qlmanage -t -s 900 -o . s2-working.svg && sips -s format jpeg s2-working.svg.png --out s2-working.jpg && sips -c 610 900 --cropOffset 0 0 s2-working.jpg --out s2-working.jpg`. The SVG, in full, so the fixture can be rebuilt from this plan alone:

    <svg xmlns="http://www.w3.org/2000/svg" width="900" height="520" viewBox="0 0 900 520">
    <title>Worked solution to find 35% of 240, with a slip on the last line</title>
    <rect width="900" height="520" fill="#fbfaf4"/>
    <g stroke="#b9d3ea" stroke-width="2"><line x1="0" y1="110" x2="900" y2="110"/><line x1="0" y1="200" x2="900" y2="200"/><line x1="0" y1="290" x2="900" y2="290"/><line x1="0" y1="380" x2="900" y2="380"/><line x1="0" y1="470" x2="900" y2="470"/></g>
    <g font-family="Bradley Hand, Noteworthy, Chalkboard, cursive" font-size="44" fill="#1f2a6b">
    <text x="40" y="95">Find 35% of 240</text>
    <text x="60" y="185">10% of 240 = 24</text>
    <text x="60" y="275">30% = 24 x 3 = 72</text>
    <text x="60" y="365">5% = 24 / 2 = 12</text>
    <text x="60" y="455">35% = 72 + 12 = 86</text>
    </g></svg>
  - Output: one markdown table row per probe: `provider | model | probe | http | first try | after retry | usage present | tokens | ms`, plus the leak flag for the hint. Exit 0 always after running (the result is data, not a pass/fail).
- **VALIDATE**: `bun scripts/s2-run.ts --preset ollama --model qwen2.5vl:3b` runs end to end, all three probes. Run it once first to load the model: the first vision call after a cold start took 63.8 s in planning (`observed`), inside the 120 s timeout. `bun run check` still green (tsc covers `scripts/`).
- **SATISFIES**: AC 9 (S2 tool).

### 16. RUN S2 and record it

- **IMPLEMENT**:
  - "Clean" for a provider, defined now (before any run) at the level S2 asks about, whether one `fetch` carries the jobs: HTTP 200 on all three probes, the image accepted on the vision probe, `usage` reported (not estimated) on every response, and each reply parses as JSON under `parseJsonReply` within one retry. **Shape** (the probe's keys and exactly 3 entries), "caught the slip" and the hint-leak flag are recorded in their own columns and are not part of "clean": they measure the model, not the seam, and they feed T9's shape checks and S4. Reason, `observed` in planning: Ollama `qwen2.5vl:3b` carried the image in 6 of 6 calls (200, usage reported) and every reply the fixed script classified parsed as JSON, yet the shape was wrong in 3 of 5 classified replies and the marks were wrong in the rest. That says the 3B model is weak, not that the seam fails. A larger local vision model is S4's question, not T8's. Decision rule (architecture S2): 4 of 5 clean → plain fetch; worse → a thin per-provider adapter (new ticket), still no SDK.
  - **Implementer legs**: Anthropic compat (`S2_KEY` from the existing `ANTHROPIC_API_KEY` variable; model `claude-haiku-4-5`) and Ollama (`qwen2.5vl:3b` for all three probes; pulled during planning with Linards's go-ahead, 2026-09-27). Planning already ran these legs by hand with `curl` (the "Planning pre-run" table in Notes); the script run confirms them through the real module.
  - Linards's go-ahead covers the S2 calls: Anthropic spend is a few thousand tokens in total (derived: 3 probes, `observed` 75 to 1,061 tokens each, at most one retry each → under 6,400).
  - **Linards's legs**: OpenAI, OpenRouter, Groq. Hand Linards the exact commands (`S2_KEY=… bun scripts/s2-run.ts --preset openai`, etc.) and paste Linards's rows into the record.
  - If a leg returns HTTP 400 naming the limit field, rerun it with the other `--max-field` and record both; if the other name works, change that preset's `limitField` and its provenance row, and add the failing case to the `limitField` test.
  - Q12 is answered from the Anthropic leg: JSON (fenced, parsed by `parseJsonReply`), vision (`image_url` data URL), usage and Bearer auth. The workspace header is not needed for a workspace-scoped key (`observed` in planning: the existing key worked with no `anthropic-workspace-id`); record that a parent with a multi-workspace personal key must create a workspace-scoped key instead, which the setup page's Anthropic preset says in one line.
  - Record in `docs/prd/study-tutor-v2.architecture.md`: an "S2 result (date)" block after S5's, in the S5 style (every figure `observed` with the run named), the table, the decision by the rule; and Q12's answer under Open questions. A leg not yet run is written `pending, owner Linards` while the PR is open; #10 stays open until it is filled.
- **VALIDATE**: the architecture doc has the S2 block with at least the two implementer legs `observed`.
- **SATISFIES**: AC 9, AC 10.

### 17. Level 4 (below), then `system-execution-report`

---

## TESTING STRATEGY

### Unit Tests

`src/config.test.ts` (validation, key-follows-host, modes, profile merge, no Gemini), `src/events/append.test.ts` additions (`writeDataFile`), `src/api/config.test.ts` (handlers), `src/providers/openai-compatible.test.ts` (mocked fetch, all failure reasons, cap, usage, guard scans). Temp dirs realpathed, removed in `finally`.

### Integration Tests

- `src/server.test.ts` key-leak test over `apiRoutes` plus static paths, against a real `Bun.serve` on port 0.
- `src/providers/openai-compatible.test.ts` real-socket test: the provider's real `fetch` against a `Bun.serve` stub (URL join with a trailing-slash base, Bearer header, body, real timeout).

No socket or room joins in this ticket; the realtime rule does not apply.

### Edge Cases

| Edge case | Verified in |
|---|---|
| Leftover `config.json.tmp` with mode 0644 | `append.test.ts` (Task 2 b) |
| `config.json` symlinked outside `data/` | `append.test.ts` (Task 2 d) |
| Preset switched, key box left empty (key would cross providers) | `config.test.ts` |
| `http://` base URL to a non-loopback host | `config.test.ts` |
| Base URL with trailing slash (Anthropic's documented form) | `config.test.ts` + real-socket test |
| Hand-edited corrupt `config.json` | `config.test.ts` (`readConfig` → null); `/` redirects to setup, "No model" completes it, a lesson URL still opens (Level 4 step 6) |
| Provider echoes the key in its 401 body | `openai-compatible.test.ts` (HTTP error) |
| Non-JSON reply still counts tokens | `openai-compatible.test.ts` |
| Cap reached: no fetch | `openai-compatible.test.ts` |
| Usage at 23:59 BST on the last day of a month | `openai-compatible.test.ts` (cap) and `api/config.test.ts` (`getUsage`) |
| Provider omits `usage` or sends a float | `openai-compatible.test.ts` (estimate, `estimated: true`); per provider in S2 |
| Two calls in flight against a nearly full cap | `openai-compatible.test.ts` (one at a time) |
| Ollama given `max_completion_tokens` (silently ignored) | `config.test.ts` (`limitField` pin) |
| Reply wrapped in a ```` ```json ```` fence (Anthropic compat, always in planning) | `openai-compatible.test.ts` (fenced JSON) |
| Local preset sends no Authorization header | `openai-compatible.test.ts` |
| Invalid POST echoing the submitted key | `server.test.ts` key-leak |
| `/api/config` unreachable from the index page (server stopped) | Task 12 `catch` keeps the page; no automated test (`getConfig` cannot return 500 by its type), and no Level 4 step: the page is already open, so the redirect check is moot |
| Windows file permissions | not here: #29 |

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
bunx tsc --noEmit
bunx biome check .
```

### Level 2: Unit Tests

```bash
bun test src/config.test.ts src/events src/api src/providers
```

### Level 3: Integration Tests

```bash
bun test src/server.test.ts src/providers
bun run check
```

### Level 4: Manual Validation

All performable with a fresh clone, `bun run dev`, and no data: the first two steps start from no `data/`.

1. `rm -rf data && bun run dev`. The browser opens `/` and lands on `/setup.html` (first-run redirect).
2. Pick "No model", weekly target 3, Save → "Saved.". `/` now stays on the lesson list. `ls -l data/` shows `config.json` and `profile.json` as `-rw-------`. `cat data/config.json` shows `"preset":"none"` and `"key":""`.
3. Pick "Ollama (on this computer)", model `qwen2.5:14b`, key box left empty, cap 50000, Save → saved (Ollama needs no key). Reload: fields refilled, key box empty with no "Saved" placeholder. `curl -s http://127.0.0.1:<port>/api/config` shows no `key` field.
4. Pick "Anthropic", paste a real key, Save. Reload: key box shows the "Saved" placeholder and is empty. In devtools Network, every `/api/*` response body lacks the key. Switch to "OpenAI" with the key box empty, Save → the "Paste the key" error; `data/config.json` still says anthropic.
5. With Anthropic saved, run `S2_KEY="$ANTHROPIC_API_KEY" bun scripts/s2-run.ts --preset anthropic` (uses its own temp data; the real `data/` does not change: compare `events.jsonl` line count before and after). To see the monthly total move on the setup page, append one usage line through the real route: `curl -s -X POST -H 'content-type: application/json' -d '{"v":1,"type":"usage","job":"manual","model":"x","input":100,"output":20}' http://127.0.0.1:<port>/api/event`; reload setup → "This month: 120 of … tokens".
6. Break the file by hand (`echo '{' > data/config.json`), reload `/`: it redirects to setup (not configured). Open `/content/maths/lessons/0001-U349-percentage-of-an-amount.html` directly: the lesson renders. Pick "No model", Save: `/` stays on the lesson list again. The server console shows no stack trace.

### Level 5: Additional Validation (Optional)

`code-reviewer` agent on the diff, with the guard and key-leak points named.

---

## ACCEPTANCE CRITERIA

- [ ] AC 1: `data/config.json` (`preset`, `base_url`, `key`, `model`, `cap`) and `profile.json` (`weeklyTarget`) written by `app/setup.html` on first run, through `src/events/append.ts`, mode `0600` on POSIX (test). Windows owner-only owed by #29.
- [ ] AC 2: the key never appears in any response to the browser: a test walks every `apiRoutes` path, invalid POSTs and static attempts at `data/`.
- [ ] AC 3: `src/providers/openai-compatible.ts` is the only model call (`POST ${base_url}/chat/completions`); no provider SDK in `package.json` (test).
- [ ] AC 4: presets are labels over the same three fields; no Gemini (test).
- [ ] AC 5: provider mocked tests for success, non-JSON, HTTP error, timeout (plus network, no model, cap, missing usage, one-at-a-time, bad response) and a real-socket test.
- [ ] AC 6: `image_url` parts for vision (test on the sent body); JSON asked for in the prompt and parsed in code (`parseJsonReply`, no `response_format`).
- [ ] AC 7: every 200 response becomes a `usage@1` event (reported counts, or an estimate marked `estimated: true`), including for a non-JSON reply.
- [ ] AC 8: the monthly total and the cap are shown on the setup page (`/api/usage`); a reached cap refuses the call before the fetch.
- [ ] AC 9: one real S2 run logged, all five legs: Anthropic compat and Ollama `observed` by the implementer; OpenAI, OpenRouter, Groq run by Linards (decided 2026-09-27: the legs stay in this ticket). The S2 decision needs all five, so AC 9 stays unticked until they are in, and the PR says "Refs #10", not "Closes #10", until then.
- [ ] AC 10: Q12 answered in the architecture doc from the Anthropic leg (JSON, vision, usage, auth, workspace header).
- [ ] `bun run check` green; no regressions in existing tests.

---

## COMPLETION CHECKLIST

- [ ] All tasks completed in order
- [ ] Each task validation passed immediately
- [ ] Every mutation check (Task 2 b fchmod, Task 6 timeout name, Task 6 queue bypass, Task 10 raw config) recorded with red and green
- [ ] `bun run check` green (`observed`)
- [ ] Level 4 steps 1–6 done
- [ ] S2 block and Q12 in the architecture doc
- [ ] PR body restates the guard (the section above)

---

## OPEN QUESTIONS / ASSUMPTIONS

Every question raised at planning is answered below; none is left for the implementer to decide.

- **Q1 (answered 2026-09-27).** Spend cap = local monthly token cap, checked before each call. **Worst case for ordering:** calls in one process run one at a time (Task 5's queue), so within the tutor the cap is exact to the call: it can be passed by at most the one call that started below it, which is bounded by its prompt plus `MAX_REPLY_TOKENS` (derived: the largest `observed` probe was 857 + 204 = 1,061 tokens, so about 2,000 tokens with the 1,024 reply limit). A second process writing the same `data/` (T10's `--mcp` mode run by an external harness while the app is also open) has its own queue, so the worst case is one extra call per process: 2 processes → about 4,000 tokens past the cap (derived, same bound). A provider that reports no usage is still counted, by estimate (Task 5 step 9).
- **Q2 (answered 2026-09-27: accept for v1).** With no auth (D11), anyone at the computer can open `/setup.html`, raise the cap or swap in a different key; the saved key stays unreadable. The page says "These settings are for a parent." No PIN.
- **Q3 (answered 2026-09-27).** First run = redirect from `index.html` when `configured` is false; "No model" is a preset.
- **Q4 (answered in planning).** Vision fixture made and placed: `scripts/__fixtures__/s2-working.{svg,jpg}`, a handwriting-style font on ruled paper with a planted slip, no metadata (`observed`). It tests the property S2 asks about: that an image travels in an `image_url` part and marks come back. It is not a test of reading real handwriting, which belongs to O3's own spike when that ticket is planned.
- **Q5 (answered 2026-09-27).** Ollama vision model `qwen2.5vl:3b` pulled during planning with Linards's go-ahead (3.2 GB, `observed` in `ollama list`) and run 3 times on the fixture (see the pre-run table).
- **Q6 (answered in planning).** Limit field per preset (`limitField`), with each row's provenance in Task 3. Anthropic and Ollama `observed`; OpenAI, Groq, OpenRouter from their own docs; S2's Linards legs confirm the three hosted ones.
- **Q7 (answered in planning).** The Anthropic key on this machine works with no `anthropic-workspace-id` header (`observed`, 6 calls in the first round: 3 limit-field variants, 2 limit-5 calls, 1 vision; the 11 later vision calls also sent no workspace header). A multi-workspace personal key needs the header; the setup page tells that parent to use a workspace-scoped key. No fourth config field.
- **Q8 (the one item that depends on someone other than the implementer).** Linards runs the OpenAI, OpenRouter and Groq legs (decided 2026-09-27). This is a scheduled step, not an open design question: the code, tests and docs do not wait on it, and AC 9 tracks it.
- **Assumption, closed by the form.** Presets' model names are suggestions; the parent edits them. Where no current small model is known for a provider, the field is empty and the form asks.
- **Assumption, closed by the form.** `DEFAULT_WEEKLY_TARGET = 3` days: the parent sets the real value on the same page.
- **Decision.** http only to loopback (ground rule "Network": the key must not cross a LAN in clear). A family with Ollama on another machine uses https there; E2 will show whether any family needs more.

## NOTES (open canvas)

**Why the provider reads the config itself.** The alternative is `chatJson(config, messages)` with the caller passing the key. Then every job, the MCP loop (T10) and any route that triggers a job would hold the key in its scope, and one careless `json(200, {...ctx})` would leak it. Reading it inside the one module that sends it keeps the key's reach to `config.ts` and `openai-compatible.ts`.

**Why `writeDataFile` in `append.ts` and not `fs.writeFileSync` in `config.ts`.** Events.md says only `append.ts` writes under `data/`, and the ground rule is "every path resolves inside `data/` or is refused". `writeState` already has the realpath check, `O_NOFOLLOW`, the temp-rename and the Windows copy fallback. A second writer in `config.ts` would copy some of that and miss the rest.

**Why no retry in the provider.** The retry is part of the job contract (model-jobs.md: "one retry on invalid JSON, then fallback"), and only the job knows whether a parsed value has the right shape. A retry here would double-count failures and hide shape errors from the job.

**Why replay on every call for the cap.** The log is a few MB after years (architecture "What accumulates"); replay is a linear pass. `currentState` would be cheaper on a warm `state.json` but writes the file as a side effect of a read. If a profile ever shows this, cache by `hash`; not now.

**Default cap (derived).** `DEFAULT_CAP = 1,000,000` tokens a month. Condition: one session makes at most 20 model calls (T9's jobs: guess-first, hints, one teach-back; `expected`) at the vision probe's size, the largest `observed` (1,061 tokens). 20 × 1,061 = 21,220 tokens per session, so the default allows 1,000,000 / 21,220 ≈ 47 heavy sessions a month, against 12 to 13 at the default weekly target (3 × 52 / 12 = 13). A text-only session is far smaller (hint probe `observed` 74 to 90 tokens). The parent changes it on the same form, and the money limit stays with the provider.

**Planning pre-run (2026-09-27, `observed`, `curl` from the planning session, not the S2 script).**

| Provider · model | Call | HTTP | Usage | Reply form | Note |
|---|---|---|---|---|---|
| Anthropic compat · `claude-haiku-4-5` | hint, no limit field | 200 | 41 + 49 | fenced JSON | no workspace header sent |
| Anthropic compat · `claude-haiku-4-5` | hint, `max_tokens` 300 | 200 | 41 + 34 | fenced JSON | |
| Anthropic compat · `claude-haiku-4-5` | hint, `max_completion_tokens` 300 | 200 | 41 + 33 | fenced JSON | |
| Anthropic compat · `claude-haiku-4-5` | limit 5, either field | 200 | 5 out, `length` | | both fields honoured |
| Anthropic compat · `claude-haiku-4-5` | vision mark, loose prompt | 200 | 857 + 204 | fenced JSON | read the written 86 as 84, gave 4 entries for a 3-line scheme |
| Anthropic compat · `claude-haiku-4-5` | vision mark, tightened prompt (Task 15), 11 calls | 200 × 11 | 914 + 121 to 383 | fenced JSON | scripted batch of 6 through the plan's `parseJsonReply` rule: 6 parsed, 6 with exactly 3 entries, 1.6 to 1.8 s each. Of the 5 earlier hand runs, 1 failed to parse in the Python check ("Extra data"; raw text not captured), the others were single fenced blocks. Slip caught (line 3 given 0) in 1 of 10 readable replies; 1 unreadable |
| Ollama 0.30.10 · `qwen2.5:14b` | hint, each field and none | 200 | 48 + 26 to 30 | bare JSON | |
| Ollama 0.30.10 · `qwen2.5vl:3b` | vision mark, tightened prompt, 6 calls in 2 rounds | 200 × 6 | 1,236 + 32 to 150 | bare JSON × 4, fenced × 2 | Round 1: 63.8 s (cold), 4.9 s, 11.2 s; two bare replies parsed with 2 entries, the fenced one was not classified (the round-1 script printed NOT-JSON for any reply without a `marks` key, a script fault). Round 2, fixed script: 2.8 s, 9.8 s, 20.7 s; 3 of 3 parsed as JSON under the plan's rule; 2 had the right shape (3 entries, but every line marked 0, lines 1 and 2 wrongly), 1 was a top-level array of 1 (wrong shape) |
| Ollama 0.30.10 · `qwen2.5:14b` | limit 5 | 200 | `max_tokens` 5 (`length`); `max_completion_tokens` 156 (`stop`) | | `max_completion_tokens` ignored |

Two findings for later tickets, not T8: the Haiku vision mark missed the planted slip in 9 of 10 readable calls (it read or reasoned 72 + 12 = 84 and awarded the mark), so an examiner job (O3) must not let the model's reading of a number decide a mark alone (CLAUDE.md "No model call … decides a numeric answer"); and the loose prompt's fourth entry shows T9's shape check must enforce the entry count, not just the entry type (the tightened prompt fixed it in 6 of 6 scripted calls).

**Line budget.** Ticket says ~600–900 (`expected`). Rough split (`expected`): config 150, provider 170, api 70, server +40, setup page 180, s2 script 170, tests ~450. Tests push past 900; the code without tests sits near 780.

## CONFIDENCE

**10/10 for the implementer's work, Tasks 0 to 17 as specified.** Every fact that decides whether a task passes was read out of the source or `observed` on this machine during planning (file and line citations, Bun 1.3.4 behaviour, Anthropic compat and Ollama calls); every open question has an answer; every edge case names its test or Level 4 step.

Still `expected`, and why none of them can fail a task: `limitField` for mistral, deepseek, lmstudio and custom; four characters per token in the usage estimate; 20 calls per session behind `DEFAULT_CAP`; the suggested model names. The tests pin the values this plan specifies, not real-world accuracy, so each is a default a later ticket or the parent can change without any test here going red.

**Not scored:** the S2 verdict. Its three hosted legs (OpenAI, OpenRouter, Groq; Q8) are Linards's to run, and their results cannot be known in advance.

## AMENDMENTS


- 2026-09-27 — Pre-implementation hardening, same planning session, at Linards's request ("address all risks and doubts and Q"). Verified by hand on this machine: Anthropic compat (17 calls) and Ollama (text, and vision after pulling `qwen2.5vl:3b` with Linards's go-ahead); Bun's timeout and connection-refused rejection names. Changes: per-preset `limitField` (Ollama ignores `max_completion_tokens`); `usage@1` gains optional `estimated` so a provider without usage still counts; one call at a time per process (exact cap within the tutor); 120 s timeout from the observed cold-load time; tightened marking prompt (3 entries, 6 of 6); "clean" defined at the seam, with shape recorded apart; vision fixture made and committed with its SVG source inlined; Q2 (accept for v1) and Q5 (pull) answered by Linards; worktree for Phase 0 because a T7 session shares the main checkout; `server.ts` and `types.ts` merge order with T5, T7 and T10 written down.
- 2026-09-27 — Phase 0 done at planning time: worktree `~/Desktop/study-tutor-t8` on `feature/t8-setup-provider` from `origin/main` (9fe7317), with the plan and both fixtures committed there. The implementer starts in that worktree, runs `bun install`, and skips Phase 0's `worktree add` and `cp` lines.
