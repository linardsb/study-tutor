import { type LimitField, PRESETS, readConfig } from "../config";
import { appendEvent, readLines } from "../events/append";
import { replay } from "../events/replay";
import { localDay, utcNow } from "../mcp/clock";

export type Part =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };
export type Message = {
  role: "system" | "user" | "assistant";
  content: string | Part[];
};
export type Failure =
  | "no-model"
  | "cap"
  | "timeout"
  | "network"
  | "http"
  | "not-json"
  | "bad-response";
export type ChatResult =
  | { ok: true; value: unknown; text: string }
  | { ok: false; reason: Failure; status?: number };
/** Bun's `typeof fetch` also carries `preconnect`; the provider only calls it. */
export type Fetch = (url: string, init: RequestInit) => Promise<Response>;
export type ChatOptions = {
  job: string; // goes into the usage event
  maxTokens?: number; // default MAX_REPLY_TOKENS
  limitField?: LimitField; // default PRESETS[config.preset].limitField; s2-run overrides it
  timeoutMs?: number; // default DEFAULT_TIMEOUT_MS
  fetch?: Fetch; // tests inject; default globalThis.fetch
  now?: () => string; // default utcNow
};

// Observed largest probe reply: 204 tokens (vision mark); 1024 is 5 times that.
export const MAX_REPLY_TOKENS = 1024;
// Observed: text plus one 900x610 JPEG = 857 prompt tokens (Anthropic compat).
export const IMAGE_TOKENS_ESTIMATE = 1000;
// A local vision model's first call after loading took 63.8 s in planning (Ollama, qwen2.5vl:3b).
export const DEFAULT_TIMEOUT_MS = 120_000;

/** An image as a data: URL content part. */
export function imagePart(bytes: Uint8Array, mime: string): Part {
  const b64 = Buffer.from(bytes).toString("base64");
  return {
    type: "image_url",
    image_url: { url: `data:${mime};base64,${b64}` },
  };
}

/** The JSON in a reply: bare, or in one fenced block, after an optional <think> block. undefined = not JSON. */
export function parseJsonReply(text: string): unknown | undefined {
  let t = text.trim();
  // Qwen-family models served by Ollama can open with their reasoning.
  t = t.replace(/^<think>[\s\S]*?<\/think>/, "").trim();
  // claude-haiku-4-5 via the compat endpoint fenced every JSON reply in planning.
  const fenced = /^```(?:json)?\s*\n?([\s\S]*?)\n?```$/.exec(t);
  if (fenced) t = (fenced[1] as string).trim();
  try {
    return JSON.parse(t);
  } catch {
    return undefined;
  }
}

let queue: Promise<unknown> = Promise.resolve();
/** Runs `fn` after every earlier call has settled, so a cap check always sees the last call's usage. */
export function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn);
  // A rejection must not wedge every later call.
  queue = run.catch(() => {});
  return run;
}

/** One chat completion with JSON asked for in the prompt. Never throws; every failure is a reason. */
export function chatJson(
  dataDir: string,
  messages: Message[],
  opts: ChatOptions,
): Promise<ChatResult> {
  return enqueue(() => call(dataDir, messages, opts));
}

const countInt = (x: unknown): x is number =>
  Number.isInteger(x) && (x as number) >= 0;

/** Rough token count of the prompt: four characters per token, a flat figure per image, never the base64. */
function estimateInput(messages: Message[]): number {
  let chars = 0;
  let images = 0;
  for (const m of messages) {
    if (typeof m.content === "string") chars += m.content.length;
    else
      for (const p of m.content) {
        if (p.type === "text") chars += p.text.length;
        else images += 1;
      }
  }
  return Math.ceil(chars / 4) + IMAGE_TOKENS_ESTIMATE * images;
}

function fail(job: string, reason: Failure, status?: number): ChatResult {
  // The reason and status only: never the key, the headers or the provider's body.
  console.error(
    `Model call failed (${job}): ${reason}${status ? ` ${status}` : ""}`,
  );
  return status === undefined
    ? { ok: false, reason }
    : { ok: false, reason, status };
}

async function call(
  dataDir: string,
  messages: Message[],
  opts: ChatOptions,
): Promise<ChatResult> {
  const { job } = opts;
  const now = opts.now ?? utcNow;
  try {
    const config = readConfig(dataDir);
    if (config === null || config.preset === "none")
      return { ok: false, reason: "no-model" };

    // replay, not currentState: a read must not write state.json as a side effect.
    const month = localDay(now()).slice(0, 7);
    const used = replay(readLines(dataDir)).tokens[month] ?? 0;
    if (used >= config.cap) return fail(job, "cap");

    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    // Ollama and LM Studio take no key.
    if (config.key !== "") headers.authorization = `Bearer ${config.key}`;
    const limitField = opts.limitField ?? PRESETS[config.preset].limitField;
    // No response_format (Anthropic compat ignores it) and no temperature (o-series takes only the default).
    const body = JSON.stringify({
      model: config.model,
      messages,
      [limitField]: opts.maxTokens ?? MAX_REPLY_TOKENS,
    });

    let res: Response;
    try {
      res = await (opts.fetch ?? fetch)(`${config.base_url}/chat/completions`, {
        method: "POST",
        headers,
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
      });
    } catch (err) {
      return fail(
        job,
        (err as { name?: string }).name === "TimeoutError"
          ? "timeout"
          : "network",
      );
    }
    if (!res.ok) {
      try {
        // Drained so the socket is released; the body can echo the key, so it goes nowhere.
        await res.text();
      } catch {}
      return fail(job, "http", res.status);
    }

    let reply: unknown;
    try {
      reply = await res.json();
    } catch (err) {
      // The same signal covers the body: a stall after the headers is a timeout, not a bad reply.
      return fail(
        job,
        (err as { name?: string }).name === "TimeoutError"
          ? "timeout"
          : "bad-response",
      );
    }
    if (typeof reply !== "object" || reply === null || Array.isArray(reply))
      return fail(job, "bad-response");

    const r = reply as {
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
      choices?: { message?: { content?: unknown } }[];
    };
    const content = Array.isArray(r.choices)
      ? r.choices[0]?.message?.content
      : undefined;
    // Recorded before the content is checked, so tokens spent on a bad reply still count.
    record(dataDir, job, config.model, messages, r.usage, content, now);

    if (typeof content !== "string") return fail(job, "bad-response");
    const value = parseJsonReply(content);
    if (value === undefined) return fail(job, "not-json");
    return { ok: true, value, text: content };
  } catch (err) {
    // A bug here must still fall back, not break a session.
    console.error(`Model call failed (${job}): ${(err as Error).name}`);
    return { ok: false, reason: "network" };
  }
}

function record(
  dataDir: string,
  job: string,
  model: string,
  messages: Message[],
  usage: { prompt_tokens?: unknown; completion_tokens?: unknown } | undefined,
  content: unknown,
  now: () => string,
): void {
  const input = usage?.prompt_tokens;
  const output = usage?.completion_tokens;
  const event =
    countInt(input) && countInt(output)
      ? { v: 1 as const, type: "usage" as const, job, model, input, output }
      : {
          v: 1 as const,
          type: "usage" as const,
          job,
          model,
          input: estimateInput(messages),
          output:
            typeof content === "string" ? Math.ceil(content.length / 4) : 0,
          estimated: true as const,
        };
  try {
    appendEvent(dataDir, event, now);
  } catch (err) {
    console.error(`Could not record token use: ${(err as Error).message}`);
  }
}
