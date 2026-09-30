import { expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DEFAULT_CAP } from "../config";
import { appendEvent } from "../events/append";
import { getConfig, getUsage, postConfig } from "./config";

const KEY = "sk-test-SECRET-9f3a";
const OPENAI = {
  preset: "openai",
  base_url: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  key: KEY,
  cap: 50_000,
  weeklyTarget: 4,
};

/** A realpathed temp dir (macOS maps /var to /private/var), removed afterwards. */
function withTemp(fn: (dir: string, data: string) => void) {
  return () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-api-config-")),
    );
    try {
      fn(dir, path.join(dir, "data"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test(
  "getConfig on an empty data folder: not configured, default target, nothing created",
  withTemp((_dir, data) => {
    const r = getConfig(data);
    expect(r.status).toBe(200);
    expect(r.body.configured).toBe(false);
    expect(r.body.config).toBeNull();
    expect(r.body.weeklyTarget).toBe(3);
    // The page shows the server's default, not a copy of it (PR #32 M1).
    expect(r.body.defaultCap).toBe(DEFAULT_CAP);
    expect(r.body.presets.map((p) => p.id)).toContain("none");
    expect(r.body.presets[0]).not.toHaveProperty("limitField");
    expect(fs.existsSync(data)).toBe(false);
  }),
);

test(
  "postConfig then getConfig: configured, keySet, no key anywhere",
  withTemp((_dir, data) => {
    const r = postConfig(OPENAI, data);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body)).not.toContain(KEY);
    const g = getConfig(data);
    expect(g.body.configured).toBe(true);
    expect(g.body.config?.keySet).toBe(true);
    expect(g.body.weeklyTarget).toBe(4);
    expect(JSON.stringify(g.body)).not.toContain(KEY);
  }),
);

test(
  "a refused post echoes no submitted field",
  withTemp((_dir, data) => {
    const r = postConfig({ ...OPENAI, preset: "nope" }, data);
    expect(r).toEqual({
      status: 400,
      body: { error: "Pick a provider from the list." },
    });
    expect(JSON.stringify(r)).not.toContain(KEY);
  }),
);

test(
  "a failed write is a 500 with a plain message",
  withTemp((dir, data) => {
    // data is a file, so mkdir inside it fails.
    fs.writeFileSync(data, "");
    const spy = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(postConfig(OPENAI, data)).toEqual({
        status: 500,
        body: { error: "Could not save the settings" },
      });
    } finally {
      spy.mockRestore();
    }
    expect(fs.readdirSync(dir)).toEqual(["data"]);
  }),
);

test(
  "getUsage sums only the London month",
  withTemp((_dir, data) => {
    const usage = {
      v: 1 as const,
      type: "usage" as const,
      job: "hint",
      model: "m",
      input: 100,
      output: 20,
    };
    // 23:59:59 BST on 30 September: September in London, though 1 October is an hour away.
    appendEvent(data, usage, () => "2026-09-30T22:59:59Z");
    appendEvent(data, usage, () => "2026-09-30T23:00:00Z");
    expect(getUsage(data, () => "2026-10-01T00:30:00Z").body).toEqual({
      month: "2026-10",
      tokens: 120,
      cap: null,
    });
    postConfig(OPENAI, data);
    expect(getUsage(data, () => "2026-09-15T12:00:00Z").body).toEqual({
      month: "2026-09",
      tokens: 120,
      cap: 50_000,
    });
  }),
);

test.skipIf(process.platform === "win32")(
  "squadFolder (#42): saved as its realpath, quotes dropped, kept when absent, cleared when empty; a bad one names no path",
  withTemp((dir) => {
    // The tutor's own folder is dir/tutor: a sync folder beside data/ would be inside it (M10).
    const data = path.join(dir, "tutor", "data");
    fs.mkdirSync(path.dirname(data));
    const synced = path.join(dir, "synced");
    fs.mkdirSync(synced);
    fs.symlinkSync(synced, path.join(dir, "link"));
    const r = postConfig(
      { ...OPENAI, squadFolder: `"${path.join(dir, "link")}"` },
      data,
    );
    expect(r.status).toBe(200);
    expect(getConfig(data).body.config?.squadFolder).toBe(synced);
    postConfig({ ...OPENAI, key: "" }, data);
    expect(getConfig(data).body.config?.squadFolder).toBe(synced);
    const missing = path.join(dir, "nope");
    const bad = postConfig({ ...OPENAI, squadFolder: missing }, data);
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).not.toContain(missing);
    expect(getConfig(data).body.config?.squadFolder).toBe(synced);
    postConfig({ ...OPENAI, key: "", squadFolder: "" }, data);
    expect(getConfig(data).body.config).not.toHaveProperty("squadFolder");
    expect(getConfig(data).body.config?.keySet).toBe(true);
  }),
);
