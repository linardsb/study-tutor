import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { replay } from "./events/replay";

// The real entry, started the way Start.command starts the binary: cwd is the app folder, no args.
const REPO = path.join(import.meta.dir, "..");
const SERVER = path.join(REPO, "src", "server.ts");
const FIXTURE = path.join(
  import.meta.dir,
  "events",
  "__fixtures__",
  "six-weeks.jsonl",
);

/** A temp app folder: app/ and content/ linked to the repo's, and its own data/. */
function withRoot(fn: (root: string) => Promise<void>) {
  return async () => {
    const root = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-start-")),
    );
    fs.symlinkSync(path.join(REPO, "app"), path.join(root, "app"));
    fs.symlinkSync(path.join(REPO, "content"), path.join(root, "content"));
    try {
      await fn(root);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  };
}

async function start(root: string, args: string[]) {
  const proc = Bun.spawn(["bun", SERVER, ...args], {
    cwd: root,
    stdin: "ignore",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 10_000,
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { stdout, stderr, code };
}

test(
  "--version prints the stamp and touches nothing",
  withRoot(async (root) => {
    const r = await start(root, ["--version"]);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("dev\n");
    expect(fs.existsSync(path.join(root, "data"))).toBe(false);
  }),
);

test(
  "a build that would lower a saved rung stops before serving and writes nothing",
  withRoot(async (root) => {
    const data = path.join(root, "data");
    fs.mkdirSync(data);
    fs.copyFileSync(FIXTURE, path.join(data, "events.jsonl"));
    const lines = fs.readFileSync(FIXTURE, "utf8").split("\n").filter(Boolean);
    const state = replay(lines);
    const n12 = state.topics["1MA1/N12"];
    if (n12 === undefined) throw new Error("fixture lost 1MA1/N12");
    n12.rung = 4;
    const file = path.join(data, "state.json");
    fs.writeFileSync(file, JSON.stringify(state));
    const bytes = fs.readFileSync(file);

    const r = await start(root, []);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain(
      "Stopped: this version of the tutor would lower progress on 1 topic.",
    );
    expect(r.stdout).not.toContain("is running at");
    expect(fs.readFileSync(file).equals(bytes)).toBe(true);
    expect(fs.existsSync(path.join(data, "state.prev.json"))).toBe(false);
  }),
  15_000, // past the spawn's 10 s timeout, so a server that never exits fails on the exit code
);

test(
  "--mcp runs the check too, and stdout stays JSON-RPC only",
  withRoot(async (root) => {
    const data = path.join(root, "data");
    fs.mkdirSync(data);
    fs.copyFileSync(FIXTURE, path.join(data, "events.jsonl"));

    const r = await start(root, ["--mcp"]);
    expect(r.code).toBe(0);
    const state = JSON.parse(
      fs.readFileSync(path.join(data, "state.json"), "utf8"),
    );
    expect(state.lines).toBe(33);
    for (const line of r.stdout.split("\n").filter(Boolean)) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  }),
);
