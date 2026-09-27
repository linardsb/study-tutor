# Events and replay

Source of truth: architecture D3. `data/events.jsonl` is the record; `data/state.json` is a cache rebuilt by replay and can be deleted at any time.

## Event line

```json
{"v":1,"t":"2026-10-03T17:42:10Z","type":"attempt","item":"maths/U349/g","topic":"1MA1/R9","correct":false,"sure":true,"answer":"4.5","seed":8812}
```

- `v` is the event-version for that `type`. A shape change bumps `v` and adds a reducer case; old lines are never rewritten.
- `type` is one of: `session` · `attempt` · `retest` · `teachback` · `intake` · `xp` · `squad` · `photo` · `usage`. `usage` carries a model job's token counts, because the monthly token count needs an event and no other type holds tokens. Add to the union in `src/events/types.ts` first; `tsc` fails until the parser table and the reducer table both have the new `type@v` key.
- A `(type, v)` shape may be edited in place until the first GitHub release whose build can append it; after that, a change is a new `v`.
- `t` is UTC from `src/mcp/clock`, never the browser clock. `appendEvent` stamps it; a caller's `t` is overwritten. A `t` that is not a real date (`2026-02-30`) is refused.
- `appendEvent` writes only the fields `KEYS` lists for that `(type, v)`; a stray caller field (a correct answer) never reaches the log. `tsc` fails if `KEYS` misses a field of the type.
- Only `src/events/append.ts` writes under `data/`. It fsyncs per line, opens with `O_NOFOLLOW`, writes owner-only files, and refuses any path whose realpath is outside `data/` (`../`, absolute paths, symlinks, dangling symlinks). Only writers create `data/`; readers treat a missing folder as empty. The scripts take no path: they use `data/` in the folder they run from.
- `photo.file` is relative to `data/` and must resolve inside it; `appendEvent` refuses the event otherwise, before anything is created.

## Routes

`POST /api/event` takes a body without `t`, resolves a U-code in `topic` and `topics[].topic` to the topic id, and appends through `appendEvent`; a refusal is 400 and writes nothing, not even `data/`. `GET /api/state` is `replay` of the log and refreshes `state.json` when it is missing or behind; an empty log creates nothing. Both live in `src/api/`.

## Replay

`replay(lines) → State` in `src/events/replay.ts` is a pure reducer with one case per `(type, v)`. It reads no clock and no file. Lines are walked in file order, never sorted by `t`: a PC clock change can write an earlier `t` after a later one. Unreadable lines are skipped and counted, never fatal (a pupil may hand-edit the log). Every day, week and month is the London day of `t` (`localDay`). A leading byte-order mark is stripped. Every map in `State` has no prototype, so a topic or item id such as `__proto__` or `constructor` is an ordinary key.

State keys: `shape` (bump on a type change), `lines` (log lines it was built from), `skipped`, `hash` (sha256 of those lines), `topics` (id → `rung` 0–4, `nextDue`, `rag`), `xp` (`total`, `byWeek`), `flame` (ISO week → distinct days of real work), `confidentWrong` (item id → the pupil's wrong answer), `calibration` (ISO week → Sure/correct counts), `tokens` (YYYY-MM → input + output).

Compatibility contract: `lines`, `topics[id].rung` and `xp.total` keep their paths across shape versions, or `project` in `src/events/check.ts` changes in the same PR. `hash` is read when present.

## Replay check

`replayCheck` (`src/events/check.ts`, CLI `scripts/replay-check.ts`) runs on start after an update:

- No readable `state.json`: rebuild from the log.
- Otherwise replay exactly the stored `lines` prefix with this build. Any rung below the stored rung refuses (exit 1, nothing written). Events appended after the last state write never trip it, so a real failed re-test is not a refusal.
- A log shorter than `lines`, or whose first `lines` lines no longer match `hash` (hand edit), rebuilds without refusing and lists every rung that fell. A stored `state.json` without `hash` cannot tell an edit from a code change.
- No log and no readable `state.json`: nothing is written.
- Every write first copies the old state to `data/state.prev.json`.

## Tests

One fixture per event version under `src/events/__fixtures__/`, enforced by a test over `EVENT_KEYS`. `replay.test.ts` asserts rung, next-due, XP, flame, calibration and tokens for the scripted six-week history (`six-weeks.jsonl`).
