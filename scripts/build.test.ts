import { expect, test } from "bun:test";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendEvent, writeDataFile } from "../src/events/append";
import { replayCheck } from "../src/events/check";
import { assertNoData, listZip, readVersion, stageFolder } from "./build";

const REPO = path.join(import.meta.dir, "..");

function withTemp(fn: (dir: string) => void) {
  return () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-build-")),
    );
    try {
      fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

/** sha256 of every file under `dir`, keyed by path relative to it. */
function hashes(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rel of fs.readdirSync(dir, { recursive: true }) as string[]) {
    const file = path.join(dir, rel);
    if (!fs.statSync(file).isFile()) continue;
    out[rel] = crypto
      .createHash("sha256")
      .update(fs.readFileSync(file))
      .digest("hex");
  }
  return out;
}

test(
  "readVersion takes X.Y.Z and refuses anything else",
  withTemp((dir) => {
    const pkg = path.join(dir, "package.json");
    fs.writeFileSync(pkg, JSON.stringify({ version: "0.1.0" }));
    expect(readVersion(pkg)).toBe("0.1.0");
    for (const bad of [{ version: "1.0" }, {}, { version: "v0.1.0" }]) {
      fs.writeFileSync(pkg, JSON.stringify(bad));
      expect(() => readVersion(pkg)).toThrow('"version": "X.Y.Z"');
    }
  }),
);

test("assertNoData refuses only a top-level folder's data", () => {
  expect(() =>
    assertNoData([
      "StudyTutor-0.1.0/",
      "StudyTutor-0.1.0/app/index.html",
      "StudyTutor-0.1.0/content/maths/data-handling.json",
      "StudyTutor-0.1.0/app/data/x",
      "StudyTutor-0.1.0/database.txt",
    ]),
  ).not.toThrow();
  for (const entry of [
    "StudyTutor-0.1.0/data/events.jsonl",
    "StudyTutor-9.9.9/data/",
    "StudyTutor-0.1.0/data",
  ]) {
    expect(() => assertNoData(["StudyTutor-0.1.0/", entry])).toThrow(entry);
  }
});

test(
  "stageFolder copies the launcher, pages and content, and no data",
  withTemp((dir) => {
    stageFolder(dir, "mac", "StudyTutor-0.1.0", REPO);
    const f = path.join(dir, "StudyTutor-0.1.0");
    expect(fs.existsSync(path.join(f, "app", "index.html"))).toBe(true);
    expect(fs.existsSync(path.join(f, "content", "maths", "topics.json"))).toBe(
      true,
    );
    expect(
      fs.existsSync(path.join(f, "content", "maths", "courses.json")),
    ).toBe(true);
    expect(fs.existsSync(path.join(f, "README.txt"))).toBe(true);
    expect(fs.statSync(path.join(f, "Start.command")).mode & 0o777).toBe(0o755);
    expect(fs.existsSync(path.join(f, "data"))).toBe(false);
  }),
);

test(
  "the README's update steps keep every data file byte for byte",
  withTemp((dir) => {
    stageFolder(dir, "mac", "StudyTutor-0.1.0", REPO);
    stageFolder(dir, "mac", "StudyTutor-0.1.1", REPO);
    const oldData = path.join(dir, "StudyTutor-0.1.0", "data");
    const newData = path.join(dir, "StudyTutor-0.1.1", "data");
    for (let i = 0; i < 10; i++) {
      appendEvent(oldData, {
        v: 1,
        type: "usage",
        job: "manual",
        model: "x",
        input: i,
        output: 1,
      });
    }
    writeDataFile(oldData, "config.json", '{"v":1,"preset":"none"}\n');
    expect(replayCheck(oldData).ok).toBe(true);
    const before = hashes(oldData);
    expect(Object.keys(before).sort()).toEqual([
      "config.json",
      "events.jsonl",
      "state.json",
    ]);

    // Step 3: copy the data folder from the old folder into the new one.
    fs.cpSync(oldData, newData, { recursive: true });
    expect(hashes(oldData)).toEqual(before);
    expect(hashes(newData)).toEqual(before);

    // Step 4: the new version starts; an unchanged state is not rewritten.
    const r = replayCheck(newData);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.changes).toEqual([]);
    expect(hashes(newData)).toEqual(before);
  }),
);

test.skipIf(Bun.which("zip") === null)(
  "a zip of the staged folder holds no data even when the sources sit beside a data folder",
  withTemp((dir) => {
    const src = path.join(dir, "src");
    fs.mkdirSync(path.join(src, "data"), { recursive: true });
    fs.writeFileSync(path.join(src, "data", "events.jsonl"), "{}\n");
    for (const sub of ["app", "content", "launchers"]) {
      fs.symlinkSync(path.join(REPO, sub), path.join(src, sub));
    }
    const stage = path.join(dir, "stage");
    stageFolder(stage, "mac", "StudyTutor-0.1.0", src);
    const zip = path.join(dir, "t.zip");
    expect(
      Bun.spawnSync(["zip", "-qr", zip, "StudyTutor-0.1.0"], { cwd: stage })
        .exitCode,
    ).toBe(0);
    const list = Bun.spawnSync(["unzip", "-Z1", zip])
      .stdout.toString()
      .split("\n")
      .filter(Boolean);
    expect(list).toContain("StudyTutor-0.1.0/app/index.html");
    expect(() => assertNoData(list)).not.toThrow();
  }),
);

test.skipIf(Bun.which("unzip") === null)(
  "listZip throws when unzip cannot list the file",
  () => {
    expect(() => listZip("/no/such/StudyTutor.zip")).toThrow("exited");
  },
);
