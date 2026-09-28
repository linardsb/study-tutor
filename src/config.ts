import {
  CONFIG_FILE,
  PROFILE_FILE,
  readDataJson,
  resolveInData,
  restrictToOwner,
  writeDataFile,
} from "./events/append";

export const PRESET_IDS = [
  "none",
  "openai",
  "anthropic",
  "openrouter",
  "groq",
  "mistral",
  "deepseek",
  "ollama",
  "lmstudio",
  "custom",
] as const;
export type PresetId = (typeof PRESET_IDS)[number];
export type LimitField = "max_tokens" | "max_completion_tokens";
export type Preset = {
  label: string;
  base_url: string;
  model: string;
  needsKey: boolean;
  limitField: LimitField;
};

// Labels over the same three fields (D4). No Gemini (PRD non-goal). `limitField` is the name the
// provider honours for the reply-length limit: Ollama silently ignores max_completion_tokens, and
// OpenAI's o-series refuses max_tokens (provenance per row in the T8 plan, Task 3).
export const PRESETS: Record<PresetId, Preset> = {
  none: {
    label: "No model",
    base_url: "",
    model: "",
    needsKey: false,
    limitField: "max_tokens",
  },
  openai: {
    label: "OpenAI",
    base_url: "https://api.openai.com/v1",
    model: "gpt-4.1-mini",
    needsKey: true,
    limitField: "max_completion_tokens",
  },
  anthropic: {
    label: "Anthropic (OpenAI-compatible)",
    base_url: "https://api.anthropic.com/v1",
    model: "claude-haiku-4-5",
    needsKey: true,
    limitField: "max_completion_tokens",
  },
  openrouter: {
    label: "OpenRouter",
    base_url: "https://openrouter.ai/api/v1",
    model: "",
    needsKey: true,
    limitField: "max_completion_tokens",
  },
  groq: {
    label: "Groq",
    base_url: "https://api.groq.com/openai/v1",
    model: "",
    needsKey: true,
    limitField: "max_completion_tokens",
  },
  mistral: {
    label: "Mistral",
    base_url: "https://api.mistral.ai/v1",
    model: "mistral-small-latest",
    needsKey: true,
    limitField: "max_tokens",
  },
  deepseek: {
    label: "DeepSeek",
    base_url: "https://api.deepseek.com/v1",
    model: "deepseek-chat",
    needsKey: true,
    limitField: "max_tokens",
  },
  ollama: {
    label: "Ollama (on this computer)",
    base_url: "http://localhost:11434/v1",
    model: "qwen2.5:14b",
    needsKey: false,
    limitField: "max_tokens",
  },
  lmstudio: {
    label: "LM Studio (on this computer)",
    base_url: "http://localhost:1234/v1",
    model: "",
    needsKey: false,
    limitField: "max_tokens",
  },
  custom: {
    label: "Other OpenAI-compatible",
    base_url: "",
    model: "",
    needsKey: false,
    limitField: "max_tokens",
  },
};

export type Config = {
  v: 1;
  preset: PresetId;
  base_url: string;
  key: string;
  model: string;
  cap: number;
};
/** The only config shape that reaches the browser: no key, only whether one is saved. */
export type PublicConfig = Omit<Config, "key" | "v"> & { keySet: boolean };
export type Profile = { weeklyTarget: number } & Record<string, unknown>;

// Tokens per month: about 47 heavy sessions at 20 calls of ~1,061 tokens (derivation in the T8 plan).
export const DEFAULT_CAP = 1_000_000;
// Days a week with some practice; the parent sets it on the same form.
export const DEFAULT_WEEKLY_TARGET = 3;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const str = (x: unknown): x is string => typeof x === "string";
const intFrom = (x: unknown, min: number, max = Number.MAX_SAFE_INTEGER) =>
  Number.isInteger(x) && (x as number) >= min && (x as number) <= max;
const isPreset = (x: unknown): x is PresetId =>
  str(x) && (PRESET_IDS as readonly string[]).includes(x);

/** The saved config, or null when missing, unreadable or not the right shape. */
export function readConfig(dataDir: string): Config | null {
  const o = readDataJson(dataDir, CONFIG_FILE);
  if (
    !isObj(o) ||
    o.v !== 1 ||
    !isPreset(o.preset) ||
    !str(o.base_url) ||
    !str(o.key) ||
    !str(o.model) ||
    !intFrom(o.cap, 1) ||
    // A hand edit must not reach the provider or the host comparison with an address a save would refuse.
    (o.preset === "none"
      ? o.base_url !== ""
      : checkBaseUrl(o.base_url) !== o.base_url)
  )
    return null;
  return {
    v: 1,
    preset: o.preset,
    base_url: o.base_url,
    key: o.key,
    model: o.model,
    cap: o.cap as number,
  };
}

/** Built field by field, never by spreading `c`, so a field added to Config does not reach the browser. */
export function publicConfig(c: Config): PublicConfig {
  return {
    preset: c.preset,
    base_url: c.base_url,
    model: c.model,
    cap: c.cap,
    keySet: c.key !== "",
  };
}

/** The pupil profile; missing or unreadable gives the default weekly target. */
export function readProfile(dataDir: string): Profile {
  const o = readDataJson(dataDir, PROFILE_FILE);
  const kept = isObj(o) ? o : {};
  return {
    ...kept,
    weeklyTarget: intFrom(kept.weeklyTarget, 1, 7)
      ? (kept.weeklyTarget as number)
      : DEFAULT_WEEKLY_TARGET,
  };
}

/**
 * A trimmed base URL with no trailing slash, or null if the key could cross a network in clear or
 * ride in the address itself (user info, a query or a fragment), where publicConfig would show it.
 */
function checkBaseUrl(x: unknown): string | null {
  if (!str(x)) return null;
  const trimmed = x.trim().replace(/\/+$/, "");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }
  if (url.username !== "" || url.password !== "" || /[?#]/.test(trimmed))
    return null;
  if (url.protocol === "https:") return trimmed;
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  return url.protocol === "http:" && loopback ? trimmed : null;
}

const hostOf = (u: string) => new URL(u).host;
const CAP_ERROR =
  "The monthly limit must be a whole number of tokens, at least 1.";

export type SetupResult =
  | { ok: true; config: PublicConfig; weeklyTarget: number }
  | { ok: false; error: string };

/** Validates the setup form, then writes config.json and profile.json. Nothing is written on a refusal. */
export function saveSetup(dataDir: string, body: unknown): SetupResult {
  if (!isObj(body)) return { ok: false, error: "The settings did not arrive." };
  if (!isPreset(body.preset))
    return { ok: false, error: "Pick a provider from the list." };
  if (!intFrom(body.weeklyTarget, 1, 7))
    return {
      ok: false,
      error: "The weekly target must be a whole number of days from 1 to 7.",
    };
  const weeklyTarget = body.weeklyTarget as number;

  let config: Config;
  if (body.preset === "none") {
    // The form hides the limit for "No model"; the saved one is kept so switching back does not raise it.
    const cap =
      body.cap === undefined
        ? (readConfig(dataDir)?.cap ?? DEFAULT_CAP)
        : body.cap;
    if (!intFrom(cap, 1)) return { ok: false, error: CAP_ERROR };
    config = {
      v: 1,
      preset: "none",
      base_url: "",
      key: "",
      model: "",
      cap: cap as number,
    };
  } else {
    const base_url = checkBaseUrl(body.base_url);
    if (base_url === null)
      return {
        ok: false,
        error:
          "The address must start with https://, or http:// for a model on this computer, and have no user name, ? or # in it.",
      };
    const model = str(body.model) ? body.model.trim() : "";
    if (model === "") return { ok: false, error: "Name the model to use." };
    if (!intFrom(body.cap, 1)) return { ok: false, error: CAP_ERROR };

    // The key follows the host: an empty box keeps the saved key only for the same host, so an
    // OpenAI key is never sent to another provider after a preset switch.
    let key = str(body.key) ? body.key.trim() : "";
    // A header takes printable ASCII only; a zero-width space from a copy would fail every call.
    if (key !== "" && !/^[\x21-\x7e]+$/.test(key))
      return {
        ok: false,
        error:
          "The key has a character that cannot be sent. Copy it again from the provider's page.",
      };
    if (key === "") {
      const saved = readConfig(dataDir);
      if (
        saved !== null &&
        saved.base_url !== "" &&
        hostOf(saved.base_url) === hostOf(base_url)
      )
        key = saved.key;
    }
    if (PRESETS[body.preset].needsKey && key === "")
      return { ok: false, error: "Paste the key for this provider." };
    config = {
      v: 1,
      preset: body.preset,
      base_url,
      key,
      model,
      cap: body.cap as number,
    };
  }

  const profile = { ...readProfile(dataDir), weeklyTarget };
  writeDataFile(dataDir, CONFIG_FILE, `${JSON.stringify(config, null, 2)}\n`);
  restrictToOwner(resolveInData(dataDir, CONFIG_FILE));
  writeDataFile(dataDir, PROFILE_FILE, `${JSON.stringify(profile, null, 2)}\n`);
  return { ok: true, config: publicConfig(config), weeklyTarget };
}
