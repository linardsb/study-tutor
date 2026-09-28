// Test helpers for src/jobs, src/flow/chat and src/api/chat: a temp data dir with a saved config and a mocked provider.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveSetup } from "../../config";
import type { Item } from "../../content/types";
import { readLines } from "../../events/append";
import type { NewEvent } from "../../events/types";
import type { Fetch } from "../../providers/openai-compatible";

export const KEY = "sk-test-SECRET-9f3a";
export const NOW = () => "2026-10-05T16:00:00Z";
export const NO_MODEL = { preset: "none", weeklyTarget: 3 };
export const OPENAI = {
  preset: "openai",
  base_url: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  key: KEY,
  cap: 1_000_000,
  weeklyTarget: 3,
};

/** A realpathed temp dir with a saved config (none when `setup` is null), removed afterwards. */
export function withData(
  setup: Record<string, unknown> | null,
  fn: (data: string) => Promise<void>,
) {
  return async () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-jobs-")),
    );
    const data = path.join(dir, "data");
    try {
      if (setup !== null) {
        const r = saveSetup(data, setup);
        if (!r.ok) throw new Error(r.error);
      }
      await fn(data);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

export type Call = { url: string; init: RequestInit };
/** A reply returns a Response, or throws to simulate the provider being down. */
export type Reply = () => Response | Promise<Response>;

/** A fetch that answers call n with `replies[n]` (the last one repeats) and records every call. */
export function mockFetch(...replies: Reply[]) {
  const calls: Call[] = [];
  const f: Fetch = async (url, init) => {
    calls.push({ url, init });
    const reply = replies[Math.min(calls.length, replies.length) - 1];
    if (reply === undefined) throw new Error("mockFetch: no reply given");
    return reply();
  };
  return { f, calls };
}

/** A 200 chat completion whose message content is `content`. */
export const chatReply =
  (content: string): Reply =>
  () =>
    Response.json({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });

/** The provider is down: fetch itself throws. */
export const down: Reply = () => {
  throw new TypeError("fetch failed");
};

/** The count of usage lines in the log. */
export const countUsage = (dataDir: string): number =>
  readLines(dataDir).filter((l) => JSON.parse(l).type === "usage").length;

/** An item whose answer-side fields hold sentinels, so a leak into a prompt is a plain string search. */
export function sentinelItem(over: Partial<Item> = {}): Item {
  return {
    id: "1MA1/R9/of-an-amount#1",
    topic: "1MA1/R9/of-an-amount",
    type: "cloze",
    stem: "Find 20% of 45.",
    scaffold: "10% of 45 = 4.5.",
    hint: "20% is two lots of 10%.",
    answers: ["SENTINEL-ANSWER-731"],
    working: "SENTINEL-WORKING",
    mark_scheme: "SENTINEL-SCHEME",
    misconceptions: [{ answer: "SENTINEL-WRONG", message: "SENTINEL-MESSAGE" }],
    ...over,
  };
}
export const SENTINELS = [
  "SENTINEL-ANSWER-731",
  "SENTINEL-WORKING",
  "SENTINEL-SCHEME",
  "SENTINEL-WRONG",
  "SENTINEL-MESSAGE",
];

/** An attempt event body for `appendEvent`. */
export function attemptLine(
  item: { id: string; topic: string },
  seed?: number,
): NewEvent {
  return {
    v: 1,
    type: "attempt",
    item: item.id,
    topic: item.topic,
    correct: true,
    sure: true,
    answer: "9",
    ...(seed === undefined ? {} : { seed }),
  };
}
