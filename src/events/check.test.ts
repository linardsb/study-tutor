import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendEvent } from "./append";
import { replayCheck } from "./check";
import { replay } from "./replay";

const FIXTURE = path.join(import.meta.dir, "__fixtures__", "six-weeks.jsonl");
const LINES = fs.readFileSync(FIXTURE, "utf8").split("\n").filter(Boolean);

/** A realpathed temp data/ holding the six-week log, removed afterwards. */
function withLog(fn: (data: string) => void) {
  return () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-check-")),
    );
    const data = path.join(dir, "data");
    fs.mkdirSync(data);
    fs.copyFileSync(FIXTURE, path.join(data, "events.jsonl"));
    try {
      fn(data);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

const readState = (data: string) =>
  JSON.parse(fs.readFileSync(path.join(data, "state.json"), "utf8"));

test(
  "no state.json: rebuilds from the log",
  withLog((data) => {
    expect(replayCheck(data).ok).toBe(true);
    expect(readState(data).lines).toBe(33);
  }),
);

test(
  "a second run reports no rung changes",
  withLog((data) => {
    replayCheck(data);
    const second = replayCheck(data);
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.changes).toEqual([]);
  }),
);

test(
  "a code change that lowers a rung is refused and nothing is written",
  withLog((data) => {
    const state = replay(LINES);
    const n12 = state.topics["1MA1/N12"];
    if (n12 === undefined) throw new Error("fixture lost 1MA1/N12");
    n12.rung = 4;
    const file = path.join(data, "state.json");
    fs.writeFileSync(file, JSON.stringify(state));
    const bytes = fs.readFileSync(file);
    expect(replayCheck(data)).toEqual({
      ok: false,
      fallen: [{ topic: "1MA1/N12", stored: 4, replayed: 3 }],
    });
    expect(fs.readFileSync(file).equals(bytes)).toBe(true);
  }),
);

test(
  "a real failed re-test after the last write is not a refusal",
  withLog((data) => {
    replayCheck(data);
    appendEvent(data, {
      v: 1,
      type: "retest",
      topic: "1MA1/N12",
      score: 0,
      of: 3,
      passed: false,
    });
    expect(replayCheck(data).ok).toBe(true);
    expect(readState(data).topics["1MA1/N12"].rung).toBe(1);
  }),
);

test(
  "a truncated log rebuilds, reports the fall and keeps a backup",
  withLog((data) => {
    replayCheck(data);
    const first = readState(data);
    fs.writeFileSync(
      path.join(data, "events.jsonl"),
      `${LINES.slice(0, 20).join("\n")}\n`,
    );
    const result = replayCheck(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.truncated).toBe(true);
    expect(result.changes.length).toBe(1);
    expect(result.changes[0]).toStartWith("1MA1/N12: saved 3, now 2");
    const prev = JSON.parse(
      fs.readFileSync(path.join(data, "state.prev.json"), "utf8"),
    );
    expect(prev).toEqual(first);
  }),
);

test(
  "an old state shape with the contract paths is read",
  withLog((data) => {
    fs.writeFileSync(
      path.join(data, "state.json"),
      JSON.stringify({
        lines: 33,
        topics: { "1MA1/R9": { rung: 3 } },
        xp: { total: 205 },
        weeks: {},
      }),
    );
    expect(replayCheck(data).ok).toBe(true);
  }),
);

test(
  "a broken state.json is rebuilt",
  withLog((data) => {
    fs.writeFileSync(path.join(data, "state.json"), "{");
    expect(replayCheck(data).ok).toBe(true);
    expect(readState(data).lines).toBe(33);
  }),
);
