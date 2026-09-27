import { expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendEvent,
  readLines,
  readStoredState,
  resolveInData,
  writeState,
} from "./append";
import { replay } from "./replay";
import { type NewEvent, parseEvent } from "./types";

const AT = () => "2026-10-05T16:00:00Z";
const ATTEMPT: NewEvent = {
  v: 1,
  type: "attempt",
  item: "maths/R9/1",
  topic: "1MA1/R9",
  correct: true,
  sure: true,
  answer: "12",
};

/** A realpathed temp dir (macOS maps /var to /private/var), removed afterwards. */
function withTemp(fn: (dir: string, data: string) => void | Promise<void>) {
  return async () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-events-")),
    );
    try {
      await fn(dir, path.join(dir, "data"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test(
  "append writes one stamped line per event",
  withTemp((_dir, data) => {
    const first = appendEvent(data, ATTEMPT, AT);
    appendEvent(data, { v: 1, type: "xp", amount: 10, reason: "attempt" }, AT);
    const text = fs.readFileSync(path.join(data, "events.jsonl"), "utf8");
    const lines = text.split("\n").filter(Boolean);
    expect(lines.length).toBe(2);
    for (const line of lines) {
      expect(line.startsWith('{"v":1,"t":"2026-10-05T16:00:00Z","type":')).toBe(
        true,
      );
    }
    expect(readLines(data).length).toBe(2);
    expect(first).toEqual(
      parseEvent(lines[0] as string) as NonNullable<
        ReturnType<typeof parseEvent>
      >,
    );
  }),
);

test(
  "append fsyncs every line",
  withTemp((_dir, data) => {
    const spy = spyOn(fs, "fsyncSync");
    try {
      for (let i = 0; i < 3; i++) appendEvent(data, ATTEMPT, AT);
      expect(spy).toHaveBeenCalledTimes(3);
    } finally {
      spy.mockRestore();
    }
  }),
);

test(
  "stray fields inside an intake row never reach the log",
  withTemp((_dir, data) => {
    const intake = {
      v: 1,
      type: "intake",
      door: "interview",
      topics: [{ topic: "U687", rag: "R", answers: ["3:4"], blob: "x" }],
    } as unknown as NewEvent;
    appendEvent(data, intake, AT);
    expect(JSON.parse(readLines(data)[0] as string).topics).toEqual([
      { topic: "U687", rag: "R" },
    ]);
  }),
);

test(
  "a log with no trailing newline keeps both lines whole",
  withTemp((_dir, data) => {
    fs.mkdirSync(data);
    fs.writeFileSync(
      path.join(data, "events.jsonl"),
      `{"v":1,"t":"2026-10-05T15:00:00Z","type":"xp","amount":10,"reason":"attempt"}`,
    );
    appendEvent(data, ATTEMPT, AT);
    expect(readLines(data).length).toBe(2);
    expect(replay(readLines(data)).skipped).toBe(0);
  }),
);

test(
  "an invalid event is refused and nothing is written",
  withTemp((_dir, data) => {
    expect(() =>
      appendEvent(
        data,
        { v: 1, type: "retest", topic: "x", score: 5, of: 3, passed: true },
        AT,
      ),
    ).toThrow(/Refused/);
    expect(fs.existsSync(path.join(data, "events.jsonl"))).toBe(false);
  }),
);

test(
  "confinement: ../ and absolute paths are refused",
  withTemp((dir, data) => {
    fs.mkdirSync(data);
    expect(() => resolveInData(data, "../outside.jsonl")).toThrow(
      /outside the data folder/,
    );
    expect(() => resolveInData(data, path.join(dir, "outside.jsonl"))).toThrow(
      /outside the data folder/,
    );
  }),
);

test(
  "confinement: a symlinked directory out of data is refused",
  withTemp((dir, data) => {
    const outside = path.join(dir, "outside");
    fs.mkdirSync(outside);
    fs.mkdirSync(data);
    fs.symlinkSync(outside, path.join(data, "link"));
    expect(() => resolveInData(data, "link/events.jsonl")).toThrow(
      /outside the data folder/,
    );
  }),
);

test(
  "confinement: a symlinked log is refused and its target untouched",
  withTemp((dir, data) => {
    const outside = path.join(dir, "outside.jsonl");
    fs.writeFileSync(outside, "keep\n");
    fs.mkdirSync(data);
    fs.symlinkSync(outside, path.join(data, "events.jsonl"));
    expect(() => appendEvent(data, ATTEMPT, AT)).toThrow(/Refused/);
    expect(fs.readFileSync(outside, "utf8")).toBe("keep\n");
  }),
);

test(
  "confinement: a dangling symlink is refused and its target not created",
  withTemp((dir, data) => {
    const made = path.join(dir, "made.jsonl");
    fs.mkdirSync(data);
    fs.symlinkSync(made, path.join(data, "events.jsonl"));
    expect(() => appendEvent(data, ATTEMPT, AT)).toThrow(/Refused/);
    expect(fs.existsSync(made)).toBe(false);
  }),
);

test(
  "a name that starts with two dots stays inside",
  withTemp((_dir, data) => {
    fs.mkdirSync(data);
    expect(resolveInData(data, "..notes")).toBe(path.join(data, "..notes"));
  }),
);

test(
  "data itself a symlink is followed",
  withTemp((dir, data) => {
    const realData = path.join(dir, "real-data");
    fs.mkdirSync(realData);
    fs.symlinkSync(realData, data);
    appendEvent(data, ATTEMPT, AT);
    expect(fs.existsSync(path.join(realData, "events.jsonl"))).toBe(true);
  }),
);

test(
  "state write round-trips and leaves no temp file",
  withTemp((_dir, data) => {
    const state = replay([]);
    writeState(data, state);
    expect(readStoredState(data)).toEqual(state);
    expect(fs.existsSync(path.join(data, "state.json.tmp"))).toBe(false);
    fs.writeFileSync(path.join(data, "state.json"), "{broken");
    expect(readStoredState(data)).toBeNull();
  }),
);

test(
  "the clock wins over a caller's t",
  withTemp((_dir, data) => {
    const e = appendEvent(
      data,
      { ...ATTEMPT, t: "1999-01-01T00:00:00Z" } as NewEvent,
      AT,
    );
    expect(e.t).toBe("2026-10-05T16:00:00Z");
    expect(readLines(data)[0]).toContain('"t":"2026-10-05T16:00:00Z"');
    expect(readLines(data)[0]).not.toContain("1999");
  }),
);

test(
  "two writer processes at once give whole lines",
  withTemp(async (_dir, data) => {
    const helper = path.join(import.meta.dir, "__fixtures__", "append-many.ts");
    const a = Bun.spawn(["bun", helper, data]);
    const b = Bun.spawn(["bun", helper, data]);
    expect(await Promise.all([a.exited, b.exited])).toEqual([0, 0]);
    expect(readLines(data).length).toBe(400);
    expect(replay(readLines(data)).skipped).toBe(0);
  }),
  20_000,
);

test.skipIf(process.platform === "win32")(
  "log and state are owner-only",
  withTemp((_dir, data) => {
    appendEvent(data, ATTEMPT, AT);
    writeState(data, replay(readLines(data)));
    for (const name of ["events.jsonl", "state.json"]) {
      expect(fs.statSync(path.join(data, name)).mode & 0o777).toBe(0o600);
    }
  }),
);

test(
  "a byte-order mark on line 1 is not a skipped line",
  withTemp((_dir, data) => {
    fs.mkdirSync(data);
    fs.writeFileSync(
      path.join(data, "events.jsonl"),
      `\uFEFF{"v":1,"t":"2026-10-05T15:00:00Z","type":"xp","amount":10,"reason":"attempt"}\n`,
    );
    expect(replay(readLines(data)).skipped).toBe(0);
  }),
);

test(
  "fields the event type does not have are not written",
  withTemp((_dir, data) => {
    const e = appendEvent(
      data,
      { ...ATTEMPT, correct_answer: "12" } as NewEvent,
      AT,
    );
    expect(readLines(data)[0]).not.toContain("correct_answer");
    expect(e).not.toHaveProperty("correct_answer");
  }),
);

test(
  "readers do not create the data folder",
  withTemp((_dir, data) => {
    expect(readLines(data)).toEqual([]);
    expect(readStoredState(data)).toBeNull();
    expect(fs.existsSync(data)).toBe(false);
  }),
);

test(
  "a refused event creates no data folder",
  withTemp((_dir, data) => {
    expect(() =>
      appendEvent(data, { v: 1, type: "attempt" } as NewEvent, AT),
    ).toThrow("Refused");
    expect(fs.existsSync(data)).toBe(false);
  }),
);

const photo = (file: string): NewEvent => ({
  v: 1,
  type: "photo",
  item: "1MA1/R4#1",
  topic: "1MA1/R4",
  file,
});

for (const file of ["../outside.jpg", "/etc/passwd", "link/x.jpg"]) {
  test(
    `photo: ${file} is outside data, refused, and nothing is written`,
    withTemp((dir, data) => {
      fs.mkdirSync(data);
      const outside = path.join(dir, "outside");
      fs.mkdirSync(outside);
      fs.symlinkSync(outside, path.join(data, "link"));
      expect(() => appendEvent(data, photo(file), AT)).toThrow(/Refused/);
      expect(fs.existsSync(path.join(data, "events.jsonl"))).toBe(false);
    }),
  );
}

test(
  "photo: with no data folder yet the event is refused and data is not created",
  withTemp((_dir, data) => {
    expect(() =>
      appendEvent(data, photo("intake/2026-10-14-1800.jpg"), AT),
    ).toThrow(/Refused/);
    expect(fs.existsSync(data)).toBe(false);
  }),
);

test(
  "photo: a file inside data appends",
  withTemp((_dir, data) => {
    fs.mkdirSync(path.join(data, "intake"), { recursive: true });
    const e = appendEvent(data, photo("intake/2026-10-14-1800.jpg"), AT);
    expect(e).toMatchObject({
      type: "photo",
      file: "intake/2026-10-14-1800.jpg",
    });
    expect(readLines(data)).toHaveLength(1);
  }),
);
