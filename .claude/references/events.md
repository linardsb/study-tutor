# Events and replay

Source of truth: architecture D3. `data/events.jsonl` is the record; `data/state.json` is a cache rebuilt by replay and can be deleted at any time.

## Event line

```json
{"v":1,"t":"2026-10-03T17:42:10Z","type":"attempt","item":"maths/U349/g","topic":"1MA1/R9","correct":false,"sure":true,"answer":"4.5","seed":8812}
```

- `v` is the event-version for that `type`. A shape change bumps `v` and adds a reducer case; old lines are never rewritten.
- `type` is one of: `session` · `attempt` · `retest` · `teachback` · `intake` · `xp` · `squad` · `photo`. Add to the union in `src/events/types.ts` first.
- `t` is UTC from `src/mcp/clock`, never the browser clock.
- Only `src/events/append.ts` writes. It fsyncs per line and refuses any path outside `data/`.

## Replay

`replay(events) → state` is a pure reducer with one case per `(type, v)`. State holds: topic map with rung and next-due, XP, weekly flame, confident-wrong items (boss pool), calibration pairs, monthly token count. `scripts/replay-check.ts` runs on startup after an update: it replays with the new code, diffs against the stored `state.json`, and refuses to start if any rung would fall (S5).

## Tests

One fixture per event version under `src/events/__fixtures__/`. A replay test asserts the derived rung, XP and next-due for a scripted 6-week history.
