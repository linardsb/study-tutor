import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const SCRIPTS = import.meta.dir;

function run(cwd: string, script: string, args: string[]) {
  return Bun.spawnSync(["bun", path.join(SCRIPTS, script), ...args], { cwd });
}

function withTemp(fn: (dir: string) => void) {
  return () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-scripts-")),
    );
    try {
      fn(dir);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test.each(["replay-check.ts", "synth-events.ts"])(
  "%s refuses --data and creates nothing",
  (script) =>
    withTemp((dir) => {
      const cwd = path.join(dir, "app");
      fs.mkdirSync(cwd);
      const outside = path.join(dir, "elsewhere");
      const r = run(cwd, script, ["--data", outside, "--n", "2"]);
      expect(r.exitCode).toBe(1);
      expect(r.stderr.toString()).toContain("--data was removed");
      expect(fs.existsSync(outside)).toBe(false);
      expect(fs.existsSync(path.join(cwd, "data"))).toBe(false);
    })(),
);

test(
  "replay-check --help creates no data folder",
  withTemp((dir) => {
    expect(run(dir, "replay-check.ts", ["--help"]).exitCode).toBe(0);
    expect(fs.existsSync(path.join(dir, "data"))).toBe(false);
  }),
);

test(
  "the scripts use data/ in the folder they run from",
  withTemp((dir) => {
    expect(run(dir, "synth-events.ts", ["--n", "5"]).exitCode).toBe(0);
    expect(run(dir, "replay-check.ts", []).exitCode).toBe(0);
    expect(fs.existsSync(path.join(dir, "data", "state.json"))).toBe(true);
  }),
);
