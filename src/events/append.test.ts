import { expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  appendEvent,
  ensureDataDir,
  listDataDir,
  makeDataDir,
  ownerAccount,
  readLines,
  readStoredState,
  removeDataFile,
  resolveInData,
  restrictDataDir,
  restrictToOwner,
  writeDataFile,
  writeIntakeFile,
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
  "append keeps correct: null on attempt@2 and drops a stray field",
  withTemp((_dir, data) => {
    appendEvent(
      data,
      {
        v: 2,
        type: "attempt",
        item: "8464/4.1.1.2#6",
        topic: "8464/4.1.1.2",
        correct: null,
        sure: false,
        answer: "x",
        bogus: 1,
      } as NewEvent,
      AT,
    );
    const [line] = readLines(data);
    expect(line).toContain('"correct":null');
    expect(line).not.toContain("bogus");
    const e = parseEvent(line as string);
    expect(e?.type === "attempt" && e.correct).toBeNull();
  }),
);

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
  "writeDataFile: a rename refused with EBUSY (OneDrive, an antivirus scan) is retried, then copied",
  withTemp((_dir, data) => {
    const rename = fs.renameSync;
    const busy = () => {
      throw Object.assign(new Error("resource busy"), { code: "EBUSY" });
    };
    // Busy once, then free: the retry renames, so the write stays atomic.
    let calls = 0;
    const once = spyOn(fs, "renameSync").mockImplementation((a, b) => {
      calls++;
      if (calls === 1) busy();
      rename(a, b);
    });
    try {
      writeDataFile(data, "config.json", "one\n");
      expect(calls).toBe(2);
    } finally {
      once.mockRestore();
    }
    expect(fs.readFileSync(path.join(data, "config.json"), "utf8")).toBe(
      "one\n",
    );
    // Busy every time: the copy fallback saves it and removes the temp file.
    const always = spyOn(fs, "renameSync").mockImplementation(busy);
    try {
      writeDataFile(data, "config.json", "two\n");
    } finally {
      always.mockRestore();
    }
    expect(fs.readFileSync(path.join(data, "config.json"), "utf8")).toBe(
      "two\n",
    );
    expect(fs.existsSync(path.join(data, "config.json.tmp"))).toBe(false);
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

test.skipIf(process.platform === "win32")(
  "writeDataFile writes the text owner-only",
  withTemp((_dir, data) => {
    writeDataFile(data, "config.json", '{"v":1}\n');
    const file = path.join(data, "config.json");
    expect(fs.readFileSync(file, "utf8")).toBe('{"v":1}\n');
    expect(fs.statSync(file).mode & 0o777).toBe(0o600);
    expect(fs.existsSync(`${file}.tmp`)).toBe(false);
  }),
);

test.skipIf(process.platform === "win32")(
  "writeDataFile: a leftover 0644 temp file still ends owner-only",
  withTemp((_dir, data) => {
    fs.mkdirSync(data);
    const tmp = path.join(data, "config.json.tmp");
    fs.writeFileSync(tmp, "old", { mode: 0o644 });
    fs.chmodSync(tmp, 0o644);
    writeDataFile(data, "config.json", "{}\n");
    expect(fs.statSync(path.join(data, "config.json")).mode & 0o777).toBe(
      0o600,
    );
  }),
);

test(
  "writeDataFile: a path that leaves data is refused and nothing is written outside",
  withTemp((dir, data) => {
    expect(() => writeDataFile(data, "../x.json", "{}")).toThrow(/Refused/);
    expect(fs.existsSync(path.join(dir, "x.json"))).toBe(false);
    expect(fs.existsSync(path.join(dir, "x.json.tmp"))).toBe(false);
  }),
);

test(
  "writeDataFile: a config.json symlinked out of data is refused and its target untouched",
  withTemp((dir, data) => {
    const outside = path.join(dir, "outside.json");
    fs.writeFileSync(outside, "keep\n");
    fs.mkdirSync(data);
    fs.symlinkSync(outside, path.join(data, "config.json"));
    expect(() => writeDataFile(data, "config.json", "{}")).toThrow(/Refused/);
    expect(fs.readFileSync(outside, "utf8")).toBe("keep\n");
  }),
);

test.skipIf(process.platform === "win32")(
  "a .tmp symlink to a file in data is replaced, not written through (PR #32 L3)",
  withTemp((_dir, data) => {
    appendEvent(data, ATTEMPT, AT);
    const log = fs.readFileSync(path.join(data, "events.jsonl"), "utf8");
    for (const rel of ["config.json", "state.json"]) {
      fs.symlinkSync("events.jsonl", path.join(data, `${rel}.tmp`));
      writeDataFile(data, rel, '{"written":true}\n');
      expect(fs.readFileSync(path.join(data, "events.jsonl"), "utf8")).toBe(
        log,
      );
      expect(fs.lstatSync(path.join(data, rel)).isFile()).toBe(true);
      expect(fs.readFileSync(path.join(data, rel), "utf8")).toBe(
        '{"written":true}\n',
      );
      expect(fs.existsSync(path.join(data, `${rel}.tmp`))).toBe(false);
    }
    // A plain leftover .tmp with loose permissions is replaced by an owner-only file.
    fs.writeFileSync(path.join(data, "profile.json.tmp"), "old", {
      mode: 0o644,
    });
    writeDataFile(data, "profile.json", "{}\n");
    expect(fs.statSync(path.join(data, "profile.json")).mode & 0o777).toBe(
      0o600,
    );
  }),
);

test("restrictToOwner runs icacls on Windows only, and a failure warns without throwing (#29)", () => {
  const calls: string[][] = [];
  const spawn = (cmd: string[]) => {
    calls.push(cmd);
    return { exitCode: 0 };
  };
  restrictToOwner("/d/data/config.json", "darwin", spawn, "pupil");
  restrictToOwner("/d/data/config.json", "linux", spawn, "pupil");
  expect(calls).toEqual([]);

  restrictToOwner("C:\\t\\data\\config.json", "win32", spawn, "pupil");
  expect(calls).toEqual([
    [
      "icacls",
      "C:\\t\\data\\config.json",
      "/inheritance:r",
      "/grant:r",
      "pupil:F",
    ],
  ]);

  const err = spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(() =>
      restrictToOwner("x", "win32", () => ({ exitCode: 5 }), "pupil"),
    ).not.toThrow();
    expect(() =>
      restrictToOwner(
        "x",
        "win32",
        () => {
          throw new Error("no icacls");
        },
        "pupil",
      ),
    ).not.toThrow();
    expect(err).toHaveBeenCalledTimes(2);
  } finally {
    err.mockRestore();
  }
});

test("ownerAccount qualifies the user with USERDOMAIN when it is set (#34)", () => {
  expect(ownerAccount({ USERDOMAIN: "SCHOOL" }, "pupil")).toBe("SCHOOL\\pupil");
  expect(ownerAccount({ USERDOMAIN: "" }, "pupil")).toBe("pupil");
  expect(ownerAccount({}, "pupil")).toBe("pupil");
});

test(
  "makeDataDir: makes data, squad and squad/<id> one level at a time; a second call is a no-op",
  withTemp((_dir, data) => {
    makeDataDir(data, "squad/year11-b");
    expect(
      fs.statSync(path.join(data, "squad", "year11-b")).isDirectory(),
    ).toBe(true);
    makeDataDir(data, "squad/year11-b");
    expect(listDataDir(data, "squad/year11-b")).toEqual({
      files: [],
      skipped: [],
    });
  }),
);

test(
  "makeDataDir: a squad symlinked out of data is refused and nothing is made outside",
  withTemp((dir, data) => {
    const outside = path.join(dir, "outside");
    fs.mkdirSync(outside);
    fs.mkdirSync(data);
    fs.symlinkSync(outside, path.join(data, "squad"));
    expect(() => makeDataDir(data, "squad/year11-b")).toThrow(
      /outside the data folder/,
    );
    expect(fs.readdirSync(outside)).toEqual([]);
  }),
);

test(
  "makeDataDir: a level that is a file is refused",
  withTemp((_dir, data) => {
    fs.mkdirSync(path.join(data, "squad"), { recursive: true });
    fs.writeFileSync(path.join(data, "squad", "year11-b"), "x");
    expect(() => makeDataDir(data, "squad/year11-b")).toThrow(
      /squad\/year11-b is not a folder/,
    );
  }),
);

test(
  "listDataDir: a missing folder, or a missing data, is empty",
  withTemp((_dir, data) => {
    const none = { files: [], skipped: [] };
    expect(listDataDir(data, "squad/year11-b")).toEqual(none);
    fs.mkdirSync(data);
    expect(listDataDir(data, "squad/year11-b")).toEqual(none);
  }),
);

test.skipIf(process.platform === "win32")(
  "listDataDir: regular files sorted; a symlink and a subfolder are named as skipped; a symlinked folder out of data is refused",
  withTemp((dir, data) => {
    const folder = path.join(data, "squad", "b");
    fs.mkdirSync(path.join(folder, "sub"), { recursive: true });
    fs.writeFileSync(path.join(folder, "zoe.json"), "{}");
    fs.writeFileSync(path.join(folder, "alex.json"), "{}");
    const outside = path.join(dir, "outside.json");
    fs.writeFileSync(outside, "{}");
    fs.symlinkSync(outside, path.join(folder, "link.json"));
    expect(listDataDir(data, "squad/b")).toEqual({
      files: ["alex.json", "zoe.json"],
      skipped: ["link.json", "sub"],
    });
    fs.symlinkSync(dir, path.join(data, "squad", "out"));
    expect(() => listDataDir(data, "squad/out")).toThrow(
      /outside the data folder/,
    );
  }),
);

test(
  "writeIntakeFile saves the bytes under data/intake byte for byte",
  withTemp((_dir, data) => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 255]);
    const rel = writeIntakeFile(data, "20261015-180000-a1b2c3.jpg", bytes);
    expect(rel).toBe("intake/20261015-180000-a1b2c3.jpg");
    expect(new Uint8Array(fs.readFileSync(path.join(data, rel)))).toEqual(
      bytes,
    );
  }),
);

test.skipIf(process.platform === "win32")(
  "writeIntakeFile writes the photo owner-only, in an owner-only intake folder",
  withTemp((_dir, data) => {
    const rel = writeIntakeFile(data, "a.png", new Uint8Array([1]));
    expect(fs.statSync(path.join(data, rel)).mode & 0o777).toBe(0o600);
    expect(fs.statSync(path.join(data, "intake")).mode & 0o777).toBe(0o700);
  }),
);

test.each(["../a.jpg", "x/a.jpg", "a.exe", "a.jpg.exe", ".jpg"])(
  "writeIntakeFile refuses the name %s",
  (name) =>
    withTemp((_dir, data) => {
      expect(() => writeIntakeFile(data, name, new Uint8Array([1]))).toThrow(
        /Refused/,
      );
    })(),
);

test(
  "writeIntakeFile refuses data/intake symlinked out of data and writes nothing there",
  withTemp((dir, data) => {
    const outside = path.join(dir, "outside");
    fs.mkdirSync(outside);
    fs.mkdirSync(data);
    fs.symlinkSync(outside, path.join(data, "intake"));
    expect(() => writeIntakeFile(data, "a.jpg", new Uint8Array([1]))).toThrow(
      /outside the data folder/,
    );
    expect(fs.readdirSync(outside)).toEqual([]);
  }),
);

test("restrictDataDir: on Windows the data folder itself goes owner-only, inherited by every file made in it later", () => {
  const calls: string[][] = [];
  const spawn = (cmd: string[]) => {
    calls.push(cmd);
    return { exitCode: 0 };
  };
  expect(restrictDataDir("/d/data", "darwin", spawn, "PC\\pupil")).toBe(true);
  expect(calls).toEqual([]);
  expect(restrictDataDir("C:\\t\\data", "win32", spawn, "PC\\pupil")).toBe(
    true,
  );
  // (OI)(CI): files and folders made inside inherit the grant; /inheritance:r drops the rest.
  expect(calls).toEqual([
    [
      "icacls",
      "C:\\t\\data",
      "/inheritance:r",
      "/grant:r",
      "PC\\pupil:(OI)(CI)F",
    ],
  ]);
  const err = spyOn(console, "error").mockImplementation(() => {});
  try {
    expect(
      restrictDataDir("x", "win32", () => ({ exitCode: 5 }), "pupil"),
    ).toBe(false);
    expect(err).toHaveBeenCalledTimes(1);
  } finally {
    err.mockRestore();
  }
});

test(
  "ensureDataDir restricts data/ when it makes it, before any file is written in it, and not again",
  withTemp((_dir, data) => {
    const seen: string[][] = [];
    const restrict = (dir: string) => {
      seen.push(fs.readdirSync(dir));
      return true;
    };
    ensureDataDir(data, restrict);
    expect(seen).toEqual([[]]);
    ensureDataDir(data, restrict);
    expect(seen).toHaveLength(1);
  }),
);

test.skipIf(process.platform === "win32")(
  "removeDataFile removes a planted symlink itself, never the file it points to, and refuses paths out of data/",
  withTemp((dir, data) => {
    appendEvent(data, ATTEMPT, AT);
    fs.symlinkSync(path.join(data, "events.jsonl"), path.join(data, "x.lock"));
    removeDataFile(data, "x.lock");
    expect(fs.existsSync(path.join(data, "x.lock"))).toBe(false);
    expect(readLines(data)).toHaveLength(1);
    fs.writeFileSync(path.join(dir, "outside"), "keep");
    expect(() => removeDataFile(data, "../outside")).toThrow("Refused");
    expect(fs.existsSync(path.join(dir, "outside"))).toBe(true);
    removeDataFile(data, "missing.lock");
    removeDataFile(path.join(dir, "no-data"), "x.lock");
  }),
);
