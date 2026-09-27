import {
  PRESET_IDS,
  PRESETS,
  type PresetId,
  type PublicConfig,
  publicConfig,
  readConfig,
  readProfile,
  saveSetup,
} from "../config";
import { readLines } from "../events/append";
import { replay } from "../events/replay";
import { localDay, utcNow } from "../mcp/clock";

export type ConfigView = {
  configured: boolean;
  config: PublicConfig | null;
  weeklyTarget: number;
  presets: {
    id: PresetId;
    label: string;
    base_url: string;
    model: string;
    needsKey: boolean;
  }[];
};

// From PRESETS, so setup.js holds no parallel list. limitField stays server-side.
const PRESET_VIEW = PRESET_IDS.map((id) => ({
  id,
  label: PRESETS[id].label,
  base_url: PRESETS[id].base_url,
  model: PRESETS[id].model,
  needsKey: PRESETS[id].needsKey,
}));

/** What the setup page shows. Never the key. */
export function getConfig(dataDir: string): { status: 200; body: ConfigView } {
  const c = readConfig(dataDir);
  return {
    status: 200,
    body: {
      configured: c !== null,
      config: c === null ? null : publicConfig(c),
      weeklyTarget: readProfile(dataDir).weeklyTarget,
      presets: PRESET_VIEW,
    },
  };
}

/** Saves the setup form. A refusal carries only saveSetup's sentence, never a submitted field. */
export function postConfig(
  body: unknown,
  dataDir: string,
):
  | { status: 200; body: ConfigView }
  | { status: 400 | 500; body: { error: string } } {
  try {
    const r = saveSetup(dataDir, body);
    if (!r.ok) return { status: 400, body: { error: r.error } };
  } catch (err) {
    console.error(`Could not save the settings: ${(err as Error).message}`);
    return { status: 500, body: { error: "Could not save the settings" } };
  }
  return getConfig(dataDir);
}

/** This London month's tokens, keyed as replay keys them, against the saved cap. */
export function getUsage(
  dataDir: string,
  now: () => string = utcNow,
): {
  status: 200;
  body: { month: string; tokens: number; cap: number | null };
} {
  const month = localDay(now()).slice(0, 7);
  return {
    status: 200,
    body: {
      month,
      tokens: replay(readLines(dataDir)).tokens[month] ?? 0,
      cap: readConfig(dataDir)?.cap ?? null,
    },
  };
}
