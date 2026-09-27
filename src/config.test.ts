import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  DEFAULT_CAP,
  PRESET_IDS,
  PRESETS,
  publicConfig,
  readConfig,
  readProfile,
  saveSetup,
} from "./config";

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
      fs.mkdtempSync(path.join(os.tmpdir(), "st-config-")),
    );
    try {
      fn(dir, path.join(dir, "data"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

const onDisk = (data: string) =>
  JSON.parse(fs.readFileSync(path.join(data, "config.json"), "utf8"));

test(
  "a valid OpenAI setup writes config.json and profile.json",
  withTemp((_dir, data) => {
    const r = saveSetup(data, OPENAI);
    expect(r).toEqual({
      ok: true,
      config: {
        preset: "openai",
        base_url: "https://api.openai.com/v1",
        model: "gpt-4.1-mini",
        cap: 50_000,
        keySet: true,
      },
      weeklyTarget: 4,
    });
    expect(onDisk(data)).toEqual({
      v: 1,
      preset: "openai",
      base_url: "https://api.openai.com/v1",
      key: KEY,
      model: "gpt-4.1-mini",
      cap: 50_000,
    });
    expect(readProfile(data)).toEqual({ weeklyTarget: 4 });
    if (process.platform !== "win32") {
      for (const name of ["config.json", "profile.json"])
        expect(fs.statSync(path.join(data, name)).mode & 0o777).toBe(0o600);
    }
  }),
);

test(
  "publicConfig has no key, only keySet",
  withTemp((_dir, data) => {
    saveSetup(data, OPENAI);
    const pc = publicConfig(
      readConfig(data) as NonNullable<ReturnType<typeof readConfig>>,
    );
    expect(Object.keys(pc)).not.toContain("key");
    expect(pc.keySet).toBe(true);
    expect(JSON.stringify(pc)).not.toContain(KEY);
  }),
);

test(
  "http to a non-loopback host is refused and nothing is written",
  withTemp((_dir, data) => {
    const r = saveSetup(data, {
      ...OPENAI,
      preset: "custom",
      base_url: "http://192.168.1.20:11434/v1",
    });
    expect(r.ok).toBe(false);
    expect(fs.existsSync(data)).toBe(false);
  }),
);

test(
  "http to localhost is accepted; a trailing slash is stripped",
  withTemp((_dir, data) => {
    expect(
      saveSetup(data, {
        preset: "ollama",
        base_url: "http://localhost:11434/v1",
        model: "qwen2.5:14b",
        key: "",
        cap: 1000,
        weeklyTarget: 3,
      }).ok,
    ).toBe(true);
    saveSetup(data, {
      ...OPENAI,
      preset: "anthropic",
      base_url: "https://api.anthropic.com/v1/",
    });
    expect(onDisk(data).base_url).toBe("https://api.anthropic.com/v1");
  }),
);

test(
  "an empty key box on the same host keeps the saved key",
  withTemp((_dir, data) => {
    saveSetup(data, OPENAI);
    const r = saveSetup(data, { ...OPENAI, key: "", model: "gpt-4.1" });
    expect(r.ok).toBe(true);
    expect(onDisk(data).key).toBe(KEY);
    expect(onDisk(data).model).toBe("gpt-4.1");
  }),
);

test(
  "an empty key box after switching openai to anthropic is refused, and the saved file is unchanged",
  withTemp((_dir, data) => {
    saveSetup(data, OPENAI);
    const before = fs.readFileSync(path.join(data, "config.json"), "utf8");
    const r = saveSetup(data, {
      ...OPENAI,
      preset: "anthropic",
      base_url: "https://api.anthropic.com/v1",
      model: "claude-haiku-4-5",
      key: "",
    });
    expect(r).toEqual({ ok: false, error: "Paste the key for this provider." });
    expect(fs.readFileSync(path.join(data, "config.json"), "utf8")).toBe(
      before,
    );
  }),
);

test(
  "switching openai to ollama with an empty key box does not carry the key",
  withTemp((_dir, data) => {
    saveSetup(data, OPENAI);
    const r = saveSetup(data, {
      ...OPENAI,
      preset: "ollama",
      base_url: "http://localhost:11434/v1",
      model: "qwen2.5:14b",
      key: "",
    });
    expect(r.ok).toBe(true);
    expect(onDisk(data).key).toBe("");
  }),
);

test(
  "No model clears the saved key and needs no cap",
  withTemp((_dir, data) => {
    saveSetup(data, OPENAI);
    const r = saveSetup(data, { preset: "none", weeklyTarget: 3 });
    expect(r.ok).toBe(true);
    expect(onDisk(data)).toEqual({
      v: 1,
      preset: "none",
      base_url: "",
      key: "",
      model: "",
      cap: DEFAULT_CAP,
    });
    // A saved "none" has no host to compare against, so the next save must not throw.
    expect(saveSetup(data, { ...OPENAI, key: "" }).ok).toBe(false);
  }),
);

test.each([0, -1, 1.5, "10"])("cap %p is refused", (cap) =>
  withTemp((_dir, data) => {
    expect(saveSetup(data, { ...OPENAI, cap }).ok).toBe(false);
    expect(fs.existsSync(data)).toBe(false);
  })(),
);

test.each([0, 8])(
  "weeklyTarget %p is refused and nothing is written",
  (weeklyTarget) =>
    withTemp((_dir, data) => {
      expect(saveSetup(data, { ...OPENAI, weeklyTarget }).ok).toBe(false);
      expect(fs.existsSync(data)).toBe(false);
    })(),
);

test(
  "an existing profile keeps its other keys",
  withTemp((_dir, data) => {
    fs.mkdirSync(data);
    fs.writeFileSync(path.join(data, "profile.json"), '{ "pupil": "M" }');
    saveSetup(data, OPENAI);
    expect(readProfile(data)).toEqual({ pupil: "M", weeklyTarget: 4 });
  }),
);

test(
  "readConfig: missing data gives null and creates nothing; a corrupt file gives null",
  withTemp((_dir, data) => {
    expect(readConfig(data)).toBeNull();
    expect(fs.existsSync(data)).toBe(false);
    fs.mkdirSync(data);
    fs.writeFileSync(path.join(data, "config.json"), "{");
    expect(readConfig(data)).toBeNull();
    fs.writeFileSync(
      path.join(data, "config.json"),
      '{"v":1,"preset":"gemini","base_url":"","key":"","model":"","cap":1}',
    );
    expect(readConfig(data)).toBeNull();
    for (const base_url of [
      "x",
      "http://192.168.1.20/v1",
      "https://a.example/v1/",
    ]) {
      fs.writeFileSync(
        path.join(data, "config.json"),
        JSON.stringify({
          v: 1,
          preset: "custom",
          base_url,
          key: "",
          model: "m",
          cap: 1,
        }),
      );
      expect(readConfig(data)).toBeNull();
    }
    // Not configured, so a save with an empty key box is a plain refusal, not a thrown URL error.
    expect(saveSetup(data, { ...OPENAI, key: "" })).toEqual({
      ok: false,
      error: "Paste the key for this provider.",
    });
  }),
);

test("no Gemini preset", () => {
  for (const id of PRESET_IDS) {
    expect(id).not.toMatch(/gemini/i);
    expect(PRESETS[id].label).not.toMatch(/gemini/i);
    expect(PRESETS[id].base_url).not.toMatch(/googleapis|generativelanguage/);
  }
});

test("limitField per preset, as observed or documented", () => {
  expect(PRESETS.ollama.limitField).toBe("max_tokens");
  for (const id of ["openai", "anthropic", "openrouter", "groq"] as const)
    expect(PRESETS[id].limitField).toBe("max_completion_tokens");
});
