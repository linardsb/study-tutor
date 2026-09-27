# Feature: T10 — MCP server: read_state, write_event, open_lesson, clock (S3)

The following plan should be complete, but its important that you validate documentation and codebase patterns and task sanity before you start implementing.

Pay special attention to naming of existing utils types and models. Import from the right files etc.

## Feature Description

The binary gains a second mode, `StudyTutor --mcp`, in which it speaks the Model Context Protocol over
stdin/stdout so that an external harness (Claude Code, Codex CLI, Gemini CLI) can drive a tutoring session.
Four tools, defined once in `src/mcp/tools.ts` as plain functions the future in-app loop (T9) will call
directly:

| Tool | Kind | Does |
|---|---|---|
| `read_state` | read | The replayed snapshot (`replay(readLines(dataDir))`, nothing written), the topic list, and, given a topic, that topic's items: the full item for an item with an `attempt` event, `toItemView` (answer-free) for every other |
| `write_event` | write | Appends one `session` or `intake` event through `postEvent` → `appendEvent`; every other type is refused, `attempt` above all |
| `open_lesson` | read | The `http://127.0.0.1:<port>/content/maths/lessons/<file>.html` URL for a topic id or U-code |
| `clock` | read | `{ utc, day, week }` from `utcNow`, `localDay`, `isoWeek` |

In `--mcp` mode the process also runs the HTTP server (so `open_lesson`'s URL answers and the pupil's page
can post attempts), writes nothing but JSON-RPC to stdout, and exits when the harness closes stdin.

S3 is run and recorded: Claude Code drives the **compiled** binary through one session. The Codex leg is owed
by #28 (Codex CLI is not installed here, observed 2026-09-27).

## User Story

As a parent who already uses Codex, Claude Code or Gemini CLI
I want to point that harness at the tutor's folder
So that it can run a session on the pupil's record without being able to see an answer before the pupil
has tried the question

## Problem Statement

Architecture A1 and D11 promise that "any harness that speaks MCP can drive it" through exactly four tools,
and S3 asks whether that seam is real. Nothing in the tree speaks MCP: `src/mcp/` holds only `clock.ts`.
T4 left the topic → lesson mapping to this ticket (T4 plan, Out of Scope: "T10's `open_lesson` decides the
mapping").

## Solution Statement

- `src/mcp/tools.ts`: a compile-pinned `Record<ToolName, Tool>` with `kind: "read" | "write"`, a JSON
  Schema per tool and a `run(args, ctx)` returning `{ ok: true, value } | { ok: false, error }`. Read tools
  write nothing at all (not even `state.json`); the one write tool calls `postEvent`. That is the AC's
  "expressible as read_state or write_event", and a test proves `data/` is byte-identical after every read.
- `src/mcp/server.ts`: a hand-rolled JSON-RPC 2.0 adapter for MCP's stdio transport, `initialize`-handshake
  era. Pure `handle(message, ctx)` plus a line reader and `runStdio`. No SDK.
- `src/server.ts`: one `--mcp` branch inside `import.meta.main`.
- `src/events/append.ts`: `photo.file` must resolve inside `data/` (the only path-bearing event field), so
  `/api/event`, the in-app loop and MCP all inherit the refusal.
- `src/content/pack.ts`: `loadItems(subject, topicId, root)`, specified identically to T7's plan so
  whichever ticket merges second drops its copy.

### Guard restatement (CLAUDE.md "Restate the guard")

The answer stays withheld until an `attempt` event exists, by three facts in code, each with a test:

1. `read_state` builds the attempted set from `readLines` + `parseEvent` (exact `item` id match) and serves
   `toItemView(item)` for every item not in it. A practice attempt on `1MA1/R4#gen` never unlocks
   `1MA1/R4#1`.
2. MCP `write_event` writes `session` and `intake` only (`MCP_WRITABLE`, a `Record<EventType, boolean>`, so
   a new event type fails to compile until someone decides). `attempt` is refused: otherwise a harness
   could unlock any item with one call, and would be deciding `correct` itself, which breaks "flow in code".
3. No tool returns `answers`, `working`, `mark_scheme` or `misconceptions` for an unattempted item:
   `open_lesson` returns a URL, `clock` a time, `write_event` the stored `session`/`intake` event, which
   has no answer field.

Scope of the guard: the MCP surface, which is the whole surface of the in-app loop (D11). A third-party
harness's own file and fetch tools are outside it; D6 below records how S3 runs without them and why the
residue is accepted.

## Out of Scope / Non-Goals

- Not included: the in-app model loop that calls these functions (T9). T10 exports them; nothing in
  `src/flow` or `src/jobs` calls them yet.
- Not included: Streamable HTTP transport, the modern (`2026-07-28`, `server/discover`) protocol era,
  resources, prompts, `listChanged`, pagination, progress, cancellation. See D4.
- Not included: a `lesson` field on `Topic`, a lesson list route, or any change to `app/`.
- Not included: the Codex leg of S3 (#28).
- Not changing: `State` (`shape: 1`), `replay.ts`, `types.ts`, `writeState` (T8 rewrites it), the `/api/*`
  routes' behaviour except the photo-path refusal, `app/`, `content/`.
- Not included: the unrelated working-tree edit to `.claude/skills/piv-create-pr/SKILL.md`, nor the
  untracked `t7-detective-case.md` / `t8-setup-config-provider.md` plans from other sessions. None goes on
  this branch.

## Feature Metadata

**Feature Type**: New Capability
**Estimated Complexity**: Medium
**Primary Systems Affected**: `src/mcp`, `src/server.ts` (main only), `src/events/append.ts` (photo path),
`src/content/pack.ts` (item loader)
**Dependencies**: none new. Zero runtime dependencies stays true (`package.json` has only devDependencies,
observed).

## Related Work

**Implements**: #12 (T10) · **Epic**: #1, `docs/prd/study-tutor-v2.architecture.md` ("The tool contract is
an MCP server", A1, D2, D11, S3) · ticket file `docs/tickets/study-tutor-v2.md` §T10

**Back-references**:

- `.claude/plans/t4-server-and-lesson-bridge.md` — `postEvent`, `currentState`, `startServer`, the
  `data-items` attribute on each lesson; T4 deferred the lesson mapping here.
- `.claude/plans/t2-events-append-replay.md` — `appendEvent`, `resolveInData`, `readLines`, `parseEvent`.
- `.claude/plans/t3-maths-content-pack.md` — `Item`, `ItemView`, `toItemView`, `itemsFileName`.
- `.claude/plans/t7-detective-case.md` Task 2 — the same `loadItems`; T10 copies its contract verbatim.
- `.claude/plans/t8-setup-config-provider.md` Task 1 — rewrites `writeState`; T10 does not touch it.

**Forward-references**:

- #28 — S3 Codex leg, owed by this ticket.
- T9 (#11) — the in-app loop imports `TOOLS` from `src/mcp/tools.ts`.
- Merge order (ticket file, Wave 3): T5, T8, T10. T10 rebases last and takes any conflict (D7).

---

## DECISIONS (formerly open questions, each closed with evidence)

**D1 — MCP-writable event types: `session` and `intake` only.**

| Type | Writable | Reason |
|---|---|---|
| `session` | yes | A harness opens and closes its own sessions; `session` grants no XP and unlocks nothing (`replay.ts` `session@1` case moves a rung only on `phase: end, mode: lesson`, the same as the page) |
| `intake` | yes | T17's interview door is a conversation; an intake sets RAG and at most moves a rung to 1 (`replay.ts` `intake@1`); no XP, no answers |
| `attempt` | no | Guard: an attempt unlocks answers, and the page marks, not a model |
| `retest` | no | A scored cold test; the re-test page (T6) marks it |
| `teachback` | no | T9's `teachback_mark` job marks against `mark_scheme` (ticket T9, line 192), and no MCP tool serves a mark scheme to mark against; a harness-written teachback would be an unmarked score that T5 grants XP for |
| `xp` | no | Granted by flow code on scored events only (architecture "Gaming") |
| `squad` | no | Written by the squad page (T14) |
| `photo` | no | Written by the camera route (T15); a harness has no camera |
| `usage` | no | The provider seam's token counter (T8) |

Reversal cost: one boolean in one table plus one test row.

**D2 — `photo` not MCP-writable, and `appendEvent` confines `photo.file` anyway.** The path AC then holds
twice: at the tool (the allowlist refuses every photo) and at the only writer (`resolveInData`), which also
covers `/api/event` and the future camera route. Task 2 proves the second layer on its own.

**D3 — Full item after an attempt.** CLAUDE.md: "the answer enters a model prompt only after an `attempt`
event for that item exists", and the ticket's guard reads "the answer-free item view for items without an
attempt". After an attempt the tutor gets `answers`, `working` and `misconceptions`, so it can explain the
pupil's mistake. All 105 maths items are `cloze` with `answers` and `working` and none has `mark_scheme`
(observed, count over `content/maths/items/*.json`, 2026-09-27).

**D4 — Protocol era: `initialize` handshake, `SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18",
"2025-03-26", "2024-11-05"]`.** Observed 2026-09-27 with a logging probe: Claude Code 2.1.280 opens with
`{"method":"initialize","params":{"protocolVersion":"2025-11-25",…}}`, then `notifications/initialized`,
then `tools/list`, then `tools/call` whose `params` carry `_meta` (`claudecode/toolUseId`, a progress
token). A dual-era client that probes `server/discover` gets -32601 and falls back (spec versioning page,
matrix row "Dual-era × Legacy: Works"). A modern-only client is out of scope; #28 records what Codex sends.

**D5 — Two tutor processes on one `data/` folder.** With the app open and a harness running, two processes
serve HTTP on two ports over one log.
- Appends: safe. One `O_APPEND` write per line (`append.ts:92-96`), proven by the 200-append two-process
  test in `append.test.ts` (observed in the suite).
- `state.json`: T10's read tools do not write it (`replay(readLines())`, not `currentState`). Nothing in
  `app/` or the lessons calls `/api/state` (observed, grep 2026-09-27), so the `--mcp` process writes no
  `state.json` at all in practice. A lagging `state.json` is harmless: `replayCheck` replays only the
  prefix the stored file recorded (`check.ts`, `replay(lines.slice(0, stored.lines))`).
- Reads: every tool call re-reads `events.jsonl`, so neither process shows stale state.

**D6 — A harness's own tools.** The guard covers the MCP surface. Claude Code's built-in `Read`, or a
fetch of `http://127.0.0.1:<port>/content/maths/items/*.json` (served with answers because T4's `quiz.js`
marks in the page), sits outside it. Handling:
- S3 runs with `--tools ""`. Observed 2026-09-27 with a throwaway server: under `--tools ""
  --strict-mcp-config` the model reports its only tools as `mcp__tutor__clock` and `advisor` (a
  conversation-review tool, with no file or network access).
- The in-app loop (T9) has no tools beyond these four (D11), so the product path is fully guarded.
- For a family's own harness, this is the architecture's accepted posture ("A pupil can edit
  `events.jsonl` by hand; the design accepts this, since the school paper is the judge"; MCP is for
  "a machine where that is legal"). The S3 report and the PR body state it.

**D7 — Collisions with T7 and T8.**
- `loadItems`: T7's plan adds it with a contract (missing file → `[]`, shape check, throw
  `${file}: not a list of items`). T10 uses the same signature, body and test name. If T7 is on
  `origin/main` at branch time, skip Task 1 and import T7's.
- `writeState`: T8 rewrites it into `writeDataFile`. T10 does not touch it (D5 removes the need).
- `src/server.ts`: T7 and T8 add routes to `startServer`. T10 edits only the `import.meta.main` block.

**D8 — Hand-rolled protocol, no `@modelcontextprotocol/sdk`.** Four methods and a line reader. The repo has
zero runtime dependencies, and the SDK would put its schema library into the compiled binary. A throwaway
40-line server in the same shape as Task 5 completed a full Claude Code session (D4 run), so the approach
is proven.

**D9 — Bun process behaviour, observed 2026-09-27 on Bun 1.3.4.**
- `for await (const t of Bun.stdin.stream().pipeThrough(new TextDecoderStream()))` ends at stdin EOF,
  under `bun` and under a `bun build --compile` binary.
- `Bun.stdout.writer()` with `flush()` after each line, then `await out.end()`: two 200,022-byte lines
  arrived complete (400,044 bytes) in 3 of 3 runs, exit 0, with no `process.exit`.
- Without `server.stop(true)` the process never exits (`timeout 5` → exit 124). With it, exit 0 in
  113–649 ms.
- A compiled binary's `Bun.argv` is `["bun", "/$bunfs/root/<name>", "--mcp"]`, so `Bun.argv.includes("--mcp")`
  holds.
- The loop, the writer and `TextDecoderStream` type-check under the repo's `tsconfig.json`
  (`bunx tsc --noEmit` exit 0 with the throwaway server placed in `src/`, then removed).

---

## CONTEXT REFERENCES

### Relevant Codebase Files IMPORTANT: YOU MUST READ THESE FILES BEFORE IMPLEMENTING!

- `src/server.ts` (lines 1-15, 172-192) — `PORTS`, `ServerOptions`, `appRoot()`, the `import.meta.main`
  block. The only `console.log` in `src/` is line 184 (observed, grep); it must not run in `--mcp` mode.
- `src/server.ts` (lines 143-167) — `startServer` returns the `Bun.serve` server; `.port`, `.stop()`.
- `src/api/event.ts` (lines 15-18, 24-51) — `resolveTopic`, `postEvent` and its `PostResult`: 201 with the
  event, 400 for any message starting `Refused`, 500 otherwise. `write_event` wraps this, not `appendEvent`.
- `src/events/replay.ts` (lines 142-168) — `replay(lines)`: pure, reads no file. `read_state` calls it.
- `src/events/append.ts` (lines 26-53) — `resolveInData(dataDir, rel)`: throws `Refused: … outside the
  data folder`, but throws raw `ENOENT` when `dataDir` does not exist (`realpathSync` line 27) or when the
  target's parent folder does not exist (lines 43-44).
- `src/events/append.ts` (lines 59-100) — `appendEvent`: builds the line, `parseEvent`s it, throws
  `Refused` before `mkdirSync`; "a refused event creates nothing, not even `data/`".
- `src/events/append.ts` (lines 103-117) — `readLines`: `[]` when the file is missing, never creates.
- `src/events/types.ts` (lines 1-11) — `EVENT_TYPES`, `EventType`; (lines 64-68) `PhotoV1.file`;
  (lines 161-171) `KEYS`; (lines 176-196) `parseEvent`.
- `src/content/types.ts` (lines 37-60) — `Item`, `ItemView`.
- `src/content/pack.ts` (lines 4-18, 20-37, 40-43) — `itemsFileName`, `subjectDir`, `loadTopics`,
  `toItemView`.
- `src/mcp/clock.ts` — `utcNow`, `localDay`, `isoWeek`.
- `src/api/event.test.ts` (lines 1-32) — test style: `withTemp` realpathed temp dir, fixed `AT` clock,
  `loadTopics("maths")` at top level.
- `src/events/append.test.ts` (lines 100-150) — confinement tests incl. symlink cases to mirror.
- `src/server.test.ts` — how T4 tests `startServer` with port `0`.
- `content/maths/lessons/*.html` — each has exactly one `data-items="/content/maths/items/<file>.json"`;
  21 lessons, 21 topics, 1:1 (observed, grep 2026-09-27).

### New Files to Create

- `src/mcp/tools.ts` — `ToolName`, `ToolContext`, `Tool`, `TOOLS`, `MCP_WRITABLE`, `attemptedItems`,
  `lessonFile`.
- `src/mcp/tools.test.ts` — tool behaviour, guard, enumeration, confinement.
- `src/mcp/server.ts` — `SUPPORTED_VERSIONS`, `handle`, `jsonLines`, `runStdio`.
- `src/mcp/server.test.ts` — protocol tests in-process, plus one spawned-process test.
- `.claude/reports/s3-mcp-seam.md` — the S3 run, observed.

### Relevant Documentation YOU SHOULD READ THESE BEFORE IMPLEMENTING!

- [MCP 2025-11-25 lifecycle](https://modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle#initialization)
  — `initialize` request/response shape; Version Negotiation: "If the server supports the requested protocol
  version, it MUST respond with the same version. Otherwise … another protocol version it supports … SHOULD
  be the latest"; stdio shutdown: client closes stdin, then SIGTERM.
- [MCP 2025-11-25 transports, stdio](https://modelcontextprotocol.io/specification/2025-11-25/basic/transports#stdio)
  — newline-delimited, no embedded newlines, "MUST NOT write anything to its stdout that is not a valid MCP
  message", stderr is free for logs.
- [MCP 2025-11-25 tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools#error-handling)
  — `tools/list` shape; no-parameter schema `{ "type": "object", "additionalProperties": false }`;
  `structuredContent` plus the same JSON in a text block; unknown tool → JSON-RPC `-32602`; input and
  business errors → result with `isError: true`.
- [MCP versioning (latest, 2026-07-28)](https://modelcontextprotocol.io/specification/latest/basic/lifecycle)
  — the modern era and the compatibility matrix behind D4.
- `claude --help` (2.1.280, observed): `--mcp-config <configs...>`, `--strict-mcp-config`,
  `--tools <tools...>` (`""` disables all built-in tools), `--allowedTools <tools...>`. The flags are
  variadic: the prompt must come **directly after `-p`** or it is swallowed (observed: "Input must be
  provided either through stdin or as a prompt argument").

### Patterns to Follow

**Result shape, not exceptions, across a seam** (`src/api/event.ts:6-8`):

```ts
export type PostResult =
  | { status: 201; body: Event }
  | { status: 400 | 500; body: { error: string } };
```

Tools mirror it: `{ ok: true; value: Record<string, unknown> } | { ok: false; error: string }`.

**`Refused` prefix is the refusal contract** (`src/api/event.ts:44-46`): only messages starting `Refused`
become a 400; anything else is logged with `console.error` and becomes a generic text. Keep that: a tool
never returns a raw internal message.

**Compile-pinned enum sets** (`src/events/types.ts:161-171`, `KEYS … satisfies`): `MCP_WRITABLE` is
`Record<EventType, boolean>` written out in `EVENT_TYPES` order; `TOOLS` is `Record<ToolName, Tool>`.

**Injected clock** (`postEvent(..., now = utcNow)`): `ToolContext.now` defaults to `utcNow`; tests pass
`AT`.

**Doc comments**: one `/** … */` line or short paragraph above each export saying what and why, British
English, no filler (see `src/server.ts:17-30`).

**Tests**: `bun:test`, `test("plain sentence", withTemp(...))`, fixed clock, realpathed temp dirs, no
mocks of the file system. Figures in assertions carry `// observed …` when they come from content.

**Lint and format**: Biome `recommended` (`biome.json`). Run `bunx biome check --write src/mcp` after each
file so the formatter, not review, settles line breaks; `bun run check` is the gate. PR #23 H1 kept
`check.ts` under SonarCloud's cognitive complexity 15: keep `handle` a `switch` over method with each arm a
one-line call.

---

## IMPLEMENTATION PLAN

### Phase 0: Branch

Branch `feature/t10-mcp-server` from `origin/main` (9fe7317 at planning, observed; local `main` is behind
by #26/#27). The protocol probe is done (D4).

### Phase 1: Foundation (content loader, photo confinement)

`loadItems` in `pack.ts` (unless T7 has merged); photo path check in `appendEvent`.

### Phase 2: Tools

**Depends on:** Phase 1.

### Phase 3: Protocol adapter and `--mcp` entry

**Depends on:** Phase 2 (`TOOLS`).

### Phase 4: S3 run and report

**Depends on:** Phase 3 and `bun run build`.

---

## STEP-BY-STEP TASKS

### Task 0 — CREATE branch

- **IMPLEMENT**:
  ```bash
  git stash push -m "piv-create-pr skill edit, not T10" .claude/skills/piv-create-pr/SKILL.md
  git fetch && git switch -c feature/t10-mcp-server origin/main
  git log origin/main --oneline -5          # note whether T7 (loadItems) has merged: D7
  ```
  The stash is unconditional: the switch would carry the edit across silently, and `piv-commit` commits all
  uncommitted changes. Untracked plan files from other sessions (`t7-…`, `t8-…`) stay untracked; commit
  only `.claude/plans/t10-mcp-server.md` among the plans. Before every commit, `git status --short` lists
  only T10 files.
- **VALIDATE**: `git status --short` shows no `M .claude/skills/…`.
- **SATISFIES**: hygiene for all ACs.

### Task 1 — ADD `loadItems` to `src/content/pack.ts` (skip if T7 has merged it)

- **IMPLEMENT** (T7 plan Task 2 item 2, verbatim contract):
  ```ts
  /** The items file of one topic; a topic with no file is an empty list, never a throw (a pack may add a topic before its items). */
  export async function loadItems(subject: string, topicId: string, root = process.cwd()): Promise<Item[]> {
    const file = path.join(subjectDir(subject, root), "items", itemsFileName(topicId));
    const f = Bun.file(file);
    if (!(await f.exists())) return [];
    const rows: unknown = await f.json();
    const shaped =
      Array.isArray(rows) &&
      rows.every(
        (i) =>
          typeof i?.id === "string" &&
          i.topic === topicId &&
          typeof i.stem === "string" &&
          Array.isArray(i.misconceptions),
      );
    if (!shaped) throw new Error(`${file}: not a list of items`);
    return rows as Item[];
  }
  ```
- **PATTERN**: `loadTopics`, `src/content/pack.ts:20-37`.
- **IMPORTS**: `Item` added to the existing `import type { ItemView, Topic } from "./types"`.
- **GOTCHA**: `topicId` is always a resolved id from `topics.json`, never raw tool input (Task 3 checks
  membership first), so `itemsFileName` cannot build `..`.
- **VALIDATE**: `bun test src/content/pack.test.ts` with the T7 test: `loadItems("maths",
  "1MA1/R9/of-an-amount")` returns 5 items whose `topic` is the id (5 observed, `pack.test.ts:61`);
  `loadItems("maths", "1MA1/none")` returns `[]`.
- **SATISFIES**: AC 3.

### Task 2 — ADD photo path confinement to `appendEvent` (`src/events/append.ts`)

- **IMPLEMENT**: after `parseEvent` succeeds and **before** `fs.mkdirSync(dataDir, …)`:
  ```ts
  // photo.file is relative to data/ and must resolve inside it (D11): the one path an event carries.
  if (parsed.type === "photo") {
    try {
      resolveInData(dataDir, parsed.file);
    } catch (err) {
      const m = (err as Error).message;
      throw new Error(m.startsWith("Refused") ? m : `Refused: ${parsed.file} is not in the data folder`);
    }
  }
  ```
- **PATTERN**: `resolveInData` usage, `append.ts:88`.
- **GOTCHA**: `resolveInData` throws raw `ENOENT` when `data/` does not exist yet, or when the photo's
  parent folder does not exist. Unwrapped, `postEvent` would turn that into a 500 (`event.ts:44`); every
  throw becomes `Refused: …`. Placing the check before `mkdirSync` keeps "a refused event creates nothing".
  No existing test or script appends a photo event (observed: grep of `src/` and `scripts/`; only the
  replay fixture `photo.v1.jsonl` holds one, and replay does not call `appendEvent`).
- **VALIDATE**: new tests in `src/events/append.test.ts`, each asserting `toThrow(/Refused/)` and
  `events.jsonl` absent/unchanged: `file: "../outside.jpg"`; `file: "/etc/passwd"`; `file: "link/x.jpg"`
  where `data/link` is a symlink to a folder outside; `data/` missing entirely. One positive: `data/intake/`
  exists, `file: "intake/2026-10-14-1800.jpg"` appends. Mutation: delete the `if (parsed.type === "photo")`
  block → the four refusal tests go red and the positive stays green. Record both halves.
- **SATISFIES**: AC 2.

### Task 3 — CREATE `src/mcp/tools.ts`

- **IMPLEMENT**:
  ```ts
  export type ToolName = "read_state" | "write_event" | "open_lesson" | "clock";
  export type ToolContext = {
    root: string; dataDir: string; subject: string; topics: readonly Topic[];
    origin: string;            // http://127.0.0.1:<port>, no trailing slash
    now?: () => string;
  };
  export type ToolResult = { ok: true; value: Record<string, unknown> } | { ok: false; error: string };
  export type Tool = {
    kind: "read" | "write";
    description: string;
    inputSchema: Record<string, unknown>;
    run: (args: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult>;
  };

  /** Which event types a harness may append (plan D1). attempt: the page marks, and an attempt unlocks answers. */
  export const MCP_WRITABLE: Record<EventType, boolean> = {
    session: true, attempt: false, retest: false, teachback: false, intake: true,
    xp: false, squad: false, photo: false, usage: false,
  };
  const WRITABLE = EVENT_TYPES.filter((t) => MCP_WRITABLE[t]);
  ```
  Functions:
  - `attemptedItems(lines: readonly string[]): Set<string>` — `parseEvent` each, keep `type === "attempt"`,
    collect `item`.
  - `topicId(ctx, code): string | null` — `resolveTopic(ctx.topics, code)`, then `null` unless
    `ctx.topics.some(t => t.id === id)`. (Unlike `postEvent`, a tool refuses an unknown topic.)
  - `read_state` (`kind: "read"`, input `{ type:"object", properties:{ topic:{ type:"string" } },
    additionalProperties:false }`): `lines = readLines(dataDir)`, `state = replay(lines)`,
    `topics = ctx.topics.map(({ id, title, aliases }) => ({ id, title, aliases }))`. No topic →
    `{ state, topics }`. Topic given and unknown → `{ ok:false, error:"Unknown topic: <code>" }`. Else
    `seen = attemptedItems(lines)`, `items = (await loadItems(subject, id, root)).map(i => seen.has(i.id) ?
    i : toItemView(i))`, value `{ state, topics, topic: id, items }`.
  - `write_event` (`kind: "write"`, input `{ type:"object", properties:{ type:{ enum: WRITABLE }, v:{
    type:"integer" } }, required:["type","v"], additionalProperties:true }`; description built from
    `KEYS`: one sentence per writable type, e.g. "session v1 fields: phase, mode, topic"). Refusals, each
    writing nothing: args not a plain object, or `typeof type !== "string"`, or
    `!Object.hasOwn(MCP_WRITABLE, type)` → `Refused: not an event type`; `MCP_WRITABLE[type] === false` →
    `Refused: <type> events are written by the tutor's own pages, not by a tool`. Else
    `postEvent(args, dataDir, topics, now)`; 201 → `{ ok:true, value: body }`, else `{ ok:false, error:
    body.error }`.
  - `open_lesson` (`kind: "read"`, input `{ topic: string }` required, `additionalProperties:false`): `id`
    via `topicId`; unknown → error. `lessonFile(root, subject, id)`: `fs.readdirSync(path.join(subjectDir(
    subject, root), "lessons"))`, first `.html` whose text includes
    `data-items="/content/${subject}/items/${itemsFileName(id)}"`; none → `No lesson for <id>`. Value
    `{ topic: id, title, url: \`${origin}/content/${subject}/lessons/${file}\` }`.
  - `clock` (`kind: "read"`, input `{ type:"object", additionalProperties:false }`):
    `utc = (now ?? utcNow)()`, `day = localDay(utc)`, value `{ utc, day, week: isoWeek(day) }`.
  - One wrapper around every `run` call (in `server.ts`'s `tools/call` arm and exported for T9 as
    `runTool(name, args, ctx)`): a thrown error → `console.error(\`Tool ${name} failed: ${message}\`)`,
    result `{ ok:false, error: message.startsWith("Refused") ? message : "The tutor could not do that" }`.
- **PATTERN**: `postEvent`'s result mapping, `src/api/event.ts:24-51`; `KEYS`, `src/events/types.ts:161-171`.
- **IMPORTS**: `node:fs`, `node:path`; `postEvent`, `resolveTopic` from `../api/event`; `readLines` from
  `../events/append`; `replay` from `../events/replay`; `EVENT_TYPES`, `KEYS`, `parseEvent`,
  `type EventType` from `../events/types`; `itemsFileName`, `loadItems`, `subjectDir`, `toItemView` from
  `../content/pack`; `type Topic` from `../content/types`; `utcNow`, `localDay`, `isoWeek` from `./clock`.
- **GOTCHA**:
  - No tool takes a path, file name or subject from its arguments. `subject` comes from `ctx`;
    `open_lesson` matches on a resolved id only, so `topic: "../../etc"` is "Unknown topic".
  - Use `replay(readLines())`, **not** `currentState`: `currentState` writes `state.json` (`state.ts:10`),
    which would make a read tool a writer and reintroduce the two-process `.tmp` race (D5).
  - The attempted set stays out of `State` (`shape: 1`, replay-check compares snapshots).
  - Item order: file order; no shuffling (flow picks, T5).
- **VALIDATE**: `bunx tsc --noEmit` clean; Task 4.
- **SATISFIES**: AC 1, 2, 3, 4, 5.

### Task 4 — CREATE `src/mcp/tools.test.ts`

- **IMPLEMENT** (all in-process, temp `dataDir`, real `content/`, `root = process.cwd()`,
  `origin = "http://127.0.0.1:4731"`, `now = AT`):
  1. **Enumeration** (AC 1): `Object.keys(TOOLS).sort()` equals the four names; exactly one tool has
     `kind: "write"` and it is `write_event`. Seed `data/` with 3 events through `appendEvent`, snapshot
     every file under the temp root (path → bytes); run each `kind: "read"` tool with valid args; the
     snapshot is identical after (no file changed, none created, `state.json` included).
  2. **Guard, no attempt** (AC 3): `read_state({ topic: "U687" })` → 5 items, none has own property
     `answers`, `working`, `mark_scheme` or `misconceptions`.
  3. **Guard, one attempt** (AC 3): `appendEvent` an attempt on `1MA1/R4#1` directly (as the page would) →
     `#1` carries `answers`; `#2`–`#5` do not.
  4. **Guard, gen id** (AC 3): an attempt on `1MA1/R4#gen` unlocks nothing.
  5. **Guard, write refused** (AC 3): `write_event({ v:1, type:"attempt", item:"1MA1/R4#1", topic:"1MA1/R4",
     correct:true, sure:true, answer:"x" })` → `ok:false`, `/Refused/`; `events.jsonl` absent; a following
     `read_state` still has no `answers` on `#1`.
  6. **Allowlist** (AC 4): every `EVENT_TYPES` member with `MCP_WRITABLE === false` is refused with nothing
     written (loop over the table, so a flipped entry changes the test's input, not its code); `session`
     start with `topic: "U349"` is stored with `topic: "1MA1/R9/of-an-amount"` and `t === AT()`; an
     `intake` with `topics:[{ topic:"U687", rag:"R" }]` is stored with `topic:"1MA1/R4"`.
  7. **Not an event type** (AC 4): `type: "__proto__"`, `type: "banana"`, `type: 3`, args `[]` → refused,
     nothing written.
  8. **Path** (AC 2): `write_event` photo with `file: "../../x.jpg"` → refused, nothing written.
     `open_lesson({ topic: "../../../etc/passwd" })` and `read_state({ topic: "../x" })` → `Unknown topic`.
  9. **open_lesson** (AC 5): all 21 topic ids resolve to a URL whose file exists under
     `content/maths/lessons/` (21 observed); `"U349"` → `…/0001-U349-percentage-of-an-amount.html`.
  10. **clock**: with `AT = 2026-10-11T23:30:00Z` → `{ utc: AT, day: "2026-10-12", week: "2026-W42" }`
      (derived from `clock.test.ts`: `localDay("2026-10-11T23:30:00Z")` is `2026-10-12`, and
      `isoWeek("2026-10-12")` is `2026-W42`).
  11. **No leak on an empty log** (AC 3): with no `data/` folder, call `read_state` once per topic for all
      21 topics, plus `open_lesson` and `clock`; `JSON.stringify` of every value contains no `"answers"`
      key, and no `data/` folder exists afterwards.
  12. **Topics listed**: `read_state({})` value has 21 `topics`, each with `id`, `title`, `aliases` only.
- **PATTERN**: `withTemp`, `src/api/event.test.ts:21-32`.
- **GOTCHA**: mutation check for the projection, both directions, all results recorded in the execution
  report:
  - Replace `seen.has(i.id) ? i : toItemView(i)` with `i`: tests 2, 3 (its `#2`–`#5` half) and 11 go red.
  - Replace it with `toItemView(i)`: test 3 (its `#1` half) goes red; tests 2 and 11 stay green.
- **VALIDATE**: `bun test src/mcp/tools.test.ts`
- **SATISFIES**: AC 1, 2, 3, 4, 5.

### Task 5 — CREATE `src/mcp/server.ts`

- **IMPLEMENT**:
  ```ts
  /** initialize-handshake revisions, newest first (plan D4). */
  export const SUPPORTED_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;

  /** One parsed message → the reply, or null for a notification. Never throws. */
  export async function handle(msg: unknown, ctx: ToolContext): Promise<object | null>
  ```
  - Not an object, or an array (batching was removed in 2025-06-18) → `{ jsonrpc:"2.0", id:null,
    error:{ code:-32600, message:"Invalid request" } }`.
  - No `id` key (notification: `notifications/initialized`, `notifications/cancelled`, …) → `null`.
  - `initialize` → `protocolVersion`: the client's `params.protocolVersion` if in `SUPPORTED_VERSIONS`,
    else `SUPPORTED_VERSIONS[0]`; `capabilities: { tools: {} }`; `serverInfo: { name: "study-tutor",
    version: "0.0.0" }` (`package.json` has no `version`, observed); `instructions`: "Study tutor for a
    GCSE pupil. Call read_state first. An item's answers appear only after the pupil has attempted it in
    the lesson page, which open_lesson links to."
  - `ping` → `{}`.
  - `tools/list` → `{ tools: [ { name, description, inputSchema } … ] }` from `TOOLS`.
  - `tools/call` → `params.name` not an own key of `TOOLS` → error `-32602 "Unknown tool: <name>"`;
    `params.arguments` missing → `{}`; present but not a plain object → tool error "Arguments must be an
    object". Ignore `params._meta` (Claude Code sends one, D4). `runTool`; `ok` →
    `{ content:[{ type:"text", text: JSON.stringify(value) }], structuredContent: value, isError:false }`;
    else `{ content:[{ type:"text", text:error }], isError:true }`.
  - Any other method with an id (incl. `server/discover`) → `-32601 "Method not found"`.
  ```ts
  /** Newline-delimited UTF-8 lines from a byte stream; a line split across chunks is joined. */
  export async function* jsonLines(stream: ReadableStream<Uint8Array>): AsyncGenerator<string>
  /** Reads requests until the stream ends, one at a time in order; `write` gets one JSON line per reply. */
  export async function runStdio(input: ReadableStream<Uint8Array>, write: (line: string) => void, ctx: ToolContext): Promise<void>
  ```
  `jsonLines`: `for await` over the byte stream, `new TextDecoder().decode(chunk, { stream: true })` per chunk
  (amended: `TextDecoderStream` fails `tsc` here, see AMENDMENTS), buffer, split on `\n`, strip a trailing `\r`,
  skip blank lines, yield a non-blank tail at EOF (D9 pattern). `runStdio`: `JSON.parse` each line; a parse
  failure replies `{ jsonrpc:"2.0", id:null, error:{ code:-32700, message:"Parse error" } }`; otherwise
  `await handle`, and `write(JSON.stringify(reply))` when not null.
- **PATTERN**: one-line guards as in `refuseForeign`, `src/server.ts:83-97`.
- **IMPORTS**: `TOOLS`, `runTool`, `type ToolContext` from `./tools`.
- **GOTCHA**:
  - Every tool value is a plain object (`ToolResult` types it as `Record<string, unknown>`), as
    `structuredContent` requires.
  - `JSON.stringify` never emits a raw newline, so each reply is one line.
  - Requests run sequentially, so a `write_event` then `read_state` in one stream see each other.
  - No `console.log` in `src/mcp/`. Logs go to `console.error`.
- **VALIDATE**: Task 6.
- **SATISFIES**: AC 1, 6, 7.

### Task 6 — CREATE `src/mcp/server.test.ts`

- **IMPLEMENT**:
  - In-process (`handle` and `runStdio` with a temp `dataDir`, a `ReadableStream` built from chunks, and an
    array `write`):
    1. `initialize` with `2025-11-25` echoes it; with `"1900-01-01"` answers `"2025-11-25"`.
    2. `notifications/initialized` produces no reply.
    3. `ping` → `{}`; `server/discover` → -32601; `tools/call` for `"rm"` → -32602; `[]` → -32600.
    4. `tools/list` names equal `Object.keys(TOOLS)`; the `clock` schema is
       `{ type:"object", additionalProperties:false }`; `write_event`'s `type` enum is exactly
       `["session", "intake"]`.
    5. `tools/call write_event` attempt → `isError: true`, text matches `/Refused/`.
    6. `tools/call clock` with `_meta` in params (Claude Code's shape) → `isError: false`, `structuredContent`
       has `utc`.
    7. A stream of two requests split mid-line and mid-UTF-8 character (`"é"` across the chunk boundary),
       one `\r\n` line and one line of invalid JSON → three replies in order, the third a -32700.
  - Spawned process (one test, 15 s timeout): `Bun.spawn([process.execPath, "src/server.ts", "--mcp"],
    { stdin:"pipe", stdout:"pipe", stderr:"pipe" })`; write `initialize`, `notifications/initialized`,
    `tools/list`, `tools/call clock`; `stdin.end()`; await `exited`. Assert: exit code 0 (EOF exit, the
    port released), every stdout line parses as JSON with `jsonrpc: "2.0"` (stdout clean), exactly three
    replies with ids in order, and stderr contains `lessons at http://127.0.0.1:`. It uses the repo's real
    `data/` path, so it calls only data-free methods.
- **GOTCHA**: `process.execPath`, not `"bun"`: PATH differs in CI. The spawned server takes the first free
  port of `PORTS` or `0`, so a running dev instance does not break it.
- **VALIDATE**: `bun test src/mcp/server.test.ts`, 5 runs in a row (`for i in 1 2 3 4 5; do bun test
  src/mcp/server.test.ts || break; done`). Mutation: delete `server.stop(true)` from Task 7 → the spawned
  test times out (red, matching D9's exit 124); the in-process tests stay green. Record both.
- **SATISFIES**: AC 6, 7.

### Task 7 — UPDATE `src/server.ts` main: the `--mcp` branch

- **IMPLEMENT**: inside the existing `try` in `import.meta.main`, after `startServer(...)` and `const url`:
  ```ts
  if (Bun.argv.includes("--mcp")) {
    // stdout carries JSON-RPC only; the harness closing stdin ends the session.
    console.error(`Study tutor MCP server; lessons at ${url}`);
    const out = Bun.stdout.writer();
    await runStdio(
      Bun.stdin.stream(),
      (line) => {
        out.write(`${line}\n`);
        out.flush();
      },
      { root, dataDir, subject: "maths", topics, origin: url.slice(0, -1) },
    );
    await out.end(); // a stdout pipe can be asynchronous; the last reply must reach the harness
    server.stop(true); // nothing else holds the event loop, so the process exits 0 (D9)
  } else {
    console.log(`Study tutor is running at ${url}`);
    openBrowser(url);
  }
  ```
  Hoist `path.join(root, "data")` to `const dataDir` and use it in `startServer` too.
- **PATTERN**: the existing main block, `src/server.ts:172-192`; the shape is D9's observed run.
- **IMPORTS**: `runStdio` from `./mcp/server`.
- **GOTCHA**:
  - `Bun.argv.includes`, not a positional index (D9: compiled argv is `["bun", "/$bunfs/root/…", "--mcp"]`).
  - `url` ends in `/`; `origin` must not, or the lesson URL gets `//content`.
  - `src/mcp/server.ts` must not import `src/server.ts` (cycle). Everything reaches it through `ctx`.
  - No browser opens in `--mcp` mode.
- **VALIDATE**:
  `printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"sh","version":"0"}}}' | bun src/server.ts --mcp; echo "exit $?"`
  → one JSON line on stdout, `exit 0`.
- **SATISFIES**: AC 6, 7.

### Task 8 — Build, S3 run, report `.claude/reports/s3-mcp-seam.md`

- **IMPLEMENT** (`S` = a scratch folder outside the repo):
  1. `bun run build && unzip -o dist/StudyTutor-mac.zip -d "$S"`. The folder is `$S/StudyTutor/` with
     `StudyTutor-arm64`, `StudyTutor-x64`, `app/`, `content/`. Use the binary matching `uname -m` (amended).
  2. `$S/mcp.json`: `{"mcpServers":{"tutor":{"command":"<abs $S>/StudyTutor/StudyTutor-<arch>","args":["--mcp"]}}}`.
  3. Run 1 (prompt directly after `-p`, D4 flag note; `--tools ""` per D6):
     ```bash
     claude -p "You are tutoring a GCSE pupil. Call clock. Call read_state with no topic and pick the topic titled Simplifying ratio. Call read_state for that topic and say whether any item shows answers. Start a session with write_event. Call open_lesson for the topic. Try write_event with an attempt on that topic's first item marked correct, and report what happens. End the session with write_event. Report each tool result." \
       --mcp-config "$S/mcp.json" --strict-mcp-config --tools "" --allowedTools "mcp__tutor__read_state,mcp__tutor__write_event,mcp__tutor__open_lesson,mcp__tutor__clock" < /dev/null
     ```
     The prompt names no event fields: the harness must learn them from `tools/list` (the `write_event`
     description built from `KEYS`) and the topic from `read_state`'s `topics`. Expected: a session start
     and end stored, a lesson URL, the attempt `isError` with `Refused`, no item with `answers`.
  4. Pupil attempt: start `$S/StudyTutor/StudyTutor-arm64` normally (it opens the browser), open Simplifying
     ratio and answer item 1, **or**
     `curl -s -H 'Content-Type: application/json' -d '{"v":1,"type":"attempt","item":"1MA1/R4#1","topic":"U687","correct":false,"sure":true,"answer":"3:4"}' http://127.0.0.1:<port>/api/event`
     → 201. Stop it with Ctrl+C.
  5. Run 2: same flags, prompt "Call read_state for the topic Simplifying ratio (find it with read_state)
     and list which item ids include answers." Expected: `1MA1/R4#1` only.
  6. `pgrep -f StudyTutor-arm64 || echo "no leftover"` → `no leftover`.
  7. Report: date, Claude Code version, D4's first-request observation, both transcripts trimmed to tool
     calls and results, the leftover-process check, D6's tool-scope note, the S3 decision per the
     architecture's rule ("works → keep MCP in v1"), and "Codex leg owed by #28". Delete `$S/StudyTutor/data/`.
- **GOTCHA**: the compiled binary, not `bun src/server.ts`: `appRoot()` uses the cwd under `bun`, and the
  harness sets no cwd. If run 1 does not find the fields unaided, that is a finding: fix the
  `write_event` description, rebuild, rerun, and record both runs.
- **VALIDATE**: the report exists; every figure in it is `observed` with its run named.
- **SATISFIES**: AC 6.

### Task 9 — UPDATE docs

- **IMPLEMENT**: `.claude/references/events.md` — one line in the confinement section: `photo.file` is
  relative to `data/` and must resolve inside it; `appendEvent` refuses otherwise. `CLAUDE.md` Commands —
  one line: `bun src/server.ts --mcp   # MCP over stdio (T10); the harness closing stdin stops it`.
- **VALIDATE**: `bun run check`.
- **SATISFIES**: AC 8.

---

## TESTING STRATEGY

### Unit Tests

`src/mcp/tools.test.ts` (Task 4), `src/mcp/server.test.ts` in-process part (Task 6), photo-path cases in
`src/events/append.test.ts` (Task 2), `loadItems` in `src/content/pack.test.ts` (Task 1). Real `content/`,
temp `data/`, fixed clock. No provider is involved, so no mocked-provider test applies.

### Integration Tests

One spawned-process test in `src/mcp/server.test.ts`: the real entry over real pipes, in the order Claude
Code uses (observed, D4): `initialize` → `notifications/initialized` → `tools/list` → `tools/call`, then
stdin closed. The end-to-end with a real harness and the compiled binary is Task 8.

### Edge Cases

| Edge case | Verified in |
|---|---|
| Practice id `1MA1/R4#gen` does not unlock `1MA1/R4#1` | tools.test 4 |
| Harness writes an attempt to unlock answers | tools.test 5, server.test 5, S3 run 1 |
| `type: "__proto__"` / unknown / non-string type / array args | tools.test 7 |
| Photo path `..`, absolute, via symlinked folder, `data/` missing | append.test (Task 2) |
| Unknown or path-shaped topic in `open_lesson` and `read_state` | tools.test 8 |
| Read tools on an empty log create no `data/` | tools.test 11 |
| Read tools change no file, `state.json` included | tools.test 1 |
| Claude Code's `_meta` in `tools/call` params | server.test 6 |
| Line split across chunks, split UTF-8 char, `\r\n`, invalid JSON | server.test 7 |
| Unsupported client version | server.test 1 |
| `server/discover` from a dual-era client | server.test 3 |
| stdin closed → process exits 0, port released | server.test spawned, S3 step 6 |
| Two tutor processes on one log | D5: existing 200-append two-process test; read tools write nothing |
| London day across BST midnight in `clock` | tools.test 10 |
| Harness finds topics and event fields unaided | S3 run 1 (Task 8) |

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style

```bash
bunx tsc --noEmit
bunx biome check .
```

### Level 2: Unit Tests

```bash
bun test src/mcp src/events/append.test.ts src/content/pack.test.ts
```

### Level 3: Integration Tests

```bash
for i in 1 2 3 4 5; do bun test src/mcp/server.test.ts || break; done
bun run check        # the gate: tsc + biome + full bun test
```

### Level 4: Manual Validation

1. `printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"sh","version":"0"}}}' '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"clock","arguments":{}}}' | bun src/server.ts --mcp; echo "exit $?"`
   → two JSON lines on stdout, the lesson URL on stderr, `exit 0`.
2. Task 8 steps 1–6. Everything needed ships in this ticket or already exists: the build script, the
   `/api/event` route, the lesson page, `claude` 2.1.280 on PATH (observed).

### Level 5: Additional Validation (Optional)

None required.

---

## ACCEPTANCE CRITERIA

1. [ ] `TOOLS` holds exactly `read_state`, `write_event`, `open_lesson`, `clock`; a test enumerates them;
   only `write_event` writes, through `postEvent` → `appendEvent`; read tools leave every file under the
   temp root byte-identical.
2. [ ] A tool call carrying a path outside `data/` is refused: no tool takes a path argument, `photo` is not
   MCP-writable, and `appendEvent` refuses a `photo.file` that does not resolve inside `data/` (four cases).
3. [ ] No tool returns `answers` (or `working`, `mark_scheme`, `misconceptions`) for an item without an
   attempt event; an exact-id attempt unlocks that item only; MCP `write_event` refuses `attempt`.
4. [ ] `write_event` writes `session` and `intake` only and refuses anything else, writing nothing.
5. [ ] `open_lesson` returns a working URL for all 21 topics, by id or U-code.
6. [ ] S3 run on the compiled binary with Claude Code, unaided by field names, recorded in
   `.claude/reports/s3-mcp-seam.md` with a decision. Codex leg **owed by #28**.
7. [ ] `--mcp` mode writes only JSON-RPC to stdout and exits 0 when stdin closes.
8. [ ] `bun run check` green.

---

## COMPLETION CHECKLIST

- [ ] Tasks 0–9 done in order, each VALIDATE run
- [ ] Mutation checks in Tasks 2, 4, 6 run both ways and recorded
- [ ] `bun run check` green (observed)
- [ ] S3 report written; #28 linked from it
- [ ] PR body restates the guard (three facts) and D6
- [ ] `git status --short` before each commit lists only T10 files

---

## OPEN QUESTIONS / ASSUMPTIONS

None open. Every question raised in the first draft is closed as a decision above (D1–D9) with its evidence:

| First draft | Closed by | Evidence |
|---|---|---|
| Q1 writable set | D1 | `replay.ts` cases; T9 ticket: teach-back marked against `mark_scheme` by a job |
| Q2 photo | D2 | two-layer refusal, both tested |
| Q3 items after attempt | D3 | CLAUDE.md guard wording; item field count (observed) |
| Q4 protocol era | D4 | Claude Code 2.1.280 probe (observed) |
| Q5 two processes | D5 | `O_APPEND` test; no page calls `/api/state` (observed); `replayCheck` prefix logic |
| R1 harness file tools | D6 | `--tools ""` run (observed); architecture's accepted posture |
| Flush and exit | D9 | three timed runs, a mutation run, a compiled run (observed) |
| `loadItems` / `writeState` collisions | D7 | T7 and T8 plans read |

Confidence 10/10 rests on these being observed, not assumed. The one residue outside this machine is the
Codex client, owned by #28.

## NOTES (open canvas)

**Why `write_event` wraps `postEvent` and not `appendEvent`.** `postEvent` already resolves U-codes in
`topic` and `intake.topics[].topic`, maps `Refused` to a client error and hides internal errors. Reusing it
keeps one rule for "an event from outside the process", whether it came over HTTP or stdio.

**Why the attempted set is read from the log each call.** `State.confidentWrong` only holds sure-and-wrong
items and is cleared on a correct answer, so it cannot answer "has this item ever been attempted". A few
thousand lines per call is well inside D3's budget.

**Size.** Expected: `tools.ts` ~190 lines, `server.ts` ~120, tests ~330, `append.ts` +10, `pack.ts` +20,
`server.ts` main +15: about 685, inside the ticket's 400–700.

## AMENDMENTS

- 2026-09-27 — Q1–Q5 and R1 closed as D1–D9 after observed runs: a Claude Code 2.1.280 probe (first
  request `initialize` 2025-11-25), an end-to-end throwaway server under `--tools ""`, Bun 1.3.4
  stdin/stdout/exit experiments incl. a compiled binary, a `tsc` pass on the pattern, an item field count,
  and a read of the T7/T8 plans. Changes: `read_state` uses `replay(readLines())` and writes nothing;
  `teachback` no longer MCP-writable; `read_state` lists topics; `write_event` schema and description
  come from `MCP_WRITABLE` and `KEYS`; `loadItems` takes T7's contract; Task 7 uses the observed writer
  and exit shape; the S3 prompt no longer names event fields.
- 2026-09-27 (implementation, superseding parts of Tasks 0, 2, 5, 8; report
  `.claude/reports/t10-mcp-server-report.md`):
  - Task 0: built in worktree `~/Desktop/study-tutor-t10` (`git worktree add -b feature/t10-mcp-server
    ../study-tutor-t10 origin/main`) because a T7 session held the main checkout; no stash.
  - Task 2: the three outside-path refusals are one `for` loop of `test(...)` calls plus the missing-`data/`
    test; four refusal tests as planned.
  - Task 5: D9's `TextDecoderStream` does not type-check (TS2345, then TS2304 `BufferSource` with no DOM
    lib); `jsonLines` uses a streaming `TextDecoder`.
  - Task 8: this machine is Intel (`x86_64`), so S3 used `StudyTutor-x64`; the arm64 run failed (run 0).
    Claude Code declined to send the attempt, so the server refusal was shown by raw JSON-RPC to the
    compiled binary. The pupil attempt was posted by `curl` to `sleep 8 | StudyTutor-x64 --mcp` instead of
    a normal start with a browser and Ctrl+C.
- 2026-09-27 (PR #30 review round 1, `.claude/reports/pr-30-review-fixes.md`): the allowlist refusal
  test sends a valid fixture body per type and matches the exact message (M1); `appendEvent` reduces each
  intake row to `{ topic, rag }` (L1); the spawned `--mcp` test also calls `read_state` and a refused
  `write_event` (L2).
