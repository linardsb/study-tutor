import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendEvent } from "./append";
import { refusalLines, replayCheck } from "./check";
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
    expect(fs.existsSync(path.join(data, "state.prev.json"))).toBe(false);
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

test(
  "a topic named constructor does not stop the check",
  withLog((data) => {
    appendEvent(data, {
      v: 1,
      type: "retest",
      topic: "constructor",
      score: 1,
      of: 1,
      passed: true,
    });
    expect(replayCheck(data).ok).toBe(true);
    expect(replayCheck(data).ok).toBe(true);
  }),
);

test(
  "a hand edit that keeps the line count rebuilds instead of blaming the build",
  withLog((data) => {
    replayCheck(data);
    const edited = [...LINES];
    edited[29] = (edited[29] as string).replace(
      '"passed":true',
      '"passed":false',
    );
    fs.writeFileSync(path.join(data, "events.jsonl"), `${edited.join("\n")}\n`);
    const result = replayCheck(data);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.truncated).toBe(true);
    expect(result.changes).toEqual([
      "1MA1/R9: saved 3, now 1 (the log no longer matches the saved progress)",
    ]);
    expect(readState(data).topics["1MA1/R9"].rung).toBe(1);
  }),
);

test(
  "a stored line count that is not a whole number is not trusted",
  withLog((data) => {
    fs.writeFileSync(
      path.join(data, "state.json"),
      JSON.stringify({ ...replay(LINES), lines: -1 }),
    );
    const result = replayCheck(data);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.changes).toEqual([
        "No saved progress to compare; rebuilt from the log.",
      ]);
    }
  }),
);

test("no log and no saved progress: nothing is written", () => {
  const dir = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "st-check-")),
  );
  try {
    const data = path.join(dir, "data");
    expect(replayCheck(data).ok).toBe(true);
    expect(fs.existsSync(data)).toBe(false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test(
  "an unchanged state is not rewritten, so the pre-update backup survives later starts",
  withLog((data) => {
    replayCheck(data);
    const file = path.join(data, "state.json");
    // A previous build's shape: same lines and hash, one extra key.
    fs.writeFileSync(
      file,
      `${JSON.stringify({ ...readState(data), old: true }, null, 2)}\n`,
    );
    replayCheck(data);
    const prev = path.join(data, "state.prev.json");
    expect(JSON.parse(fs.readFileSync(prev, "utf8")).old).toBe(true);
    const mtime = fs.statSync(file).mtimeMs;
    const second = replayCheck(data);
    expect(second.ok).toBe(true);
    expect(JSON.parse(fs.readFileSync(prev, "utf8")).old).toBe(true);
    expect(fs.statSync(file).mtimeMs).toBe(mtime);
  }),
);

test("refusalLines names each topic and the way back", () => {
  expect(
    refusalLines([
      { topic: "1MA1/N12", stored: 4, replayed: 3 },
      { topic: "1MA1/R9", stored: 2, replayed: 1 },
    ]),
  ).toEqual([
    "Stopped: this version of the tutor would lower progress on 2 topics.",
    "  1MA1/N12: saved 4, now 3",
    "  1MA1/R9: saved 2, now 1",
    "Nothing was changed. Put the previous version back, or delete data/state.json to accept the new version.",
  ]);
  expect(refusalLines([{ topic: "1MA1/N12", stored: 4, replayed: 3 }])[0]).toBe(
    "Stopped: this version of the tutor would lower progress on 1 topic.",
  );
});
