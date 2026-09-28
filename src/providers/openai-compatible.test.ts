import { expect, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveSetup } from "../config";
import { appendEvent, readLines } from "../events/append";
import {
  type ChatOptions,
  chatJson,
  enqueue,
  type Fetch,
  imagePart,
  type Message,
  parseJsonReply,
} from "./openai-compatible";

const KEY = "sk-test-SECRET-9f3a";
const NOW = () => "2026-10-05T16:00:00Z";
const OPENAI = {
  preset: "openai",
  base_url: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  key: KEY,
  cap: 1_000_000,
  weeklyTarget: 3,
};
const ASK: Message[] = [
  { role: "system", content: "Reply with JSON only." },
  { role: "user", content: "Find 35% of 240." },
];

/** A realpathed temp dir with a saved config, removed afterwards. */
function withData(
  setup: Record<string, unknown> | null,
  fn: (data: string) => Promise<void>,
) {
  return async () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-provider-")),
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

type Call = { url: string; init: RequestInit };
/** A fetch that records its calls and answers with `reply`. */
function mockFetch(reply: () => Response | Promise<Response>) {
  const calls: Call[] = [];
  const f: Fetch = async (url, init) => {
    calls.push({ url, init });
    return reply();
  };
  return { f, calls };
}

const completion = (content: unknown, usage?: unknown) =>
  Response.json({
    choices: [{ message: { role: "assistant", content } }],
    ...(usage === undefined ? {} : { usage }),
  });

const usageLines = (data: string) =>
  readLines(data)
    .map((l) => JSON.parse(l))
    .filter((e) => e.type === "usage");

const opts = (f: Fetch, extra: Partial<ChatOptions> = {}): ChatOptions => ({
  job: "hint",
  fetch: f,
  now: NOW,
  ...extra,
});

/** Silences and captures console.error for the test's duration. */
async function quiet(fn: (logged: () => string) => Promise<void>) {
  const spy = spyOn(console, "error").mockImplementation(() => {});
  try {
    await fn(() => JSON.stringify(spy.mock.calls));
  } finally {
    spy.mockRestore();
  }
}

test(
  "success: one POST to base_url/chat/completions with Bearer, the limit field and one usage line",
  withData(OPENAI, async (data) => {
    const { f, calls } = mockFetch(() =>
      completion('{"hint":"Start with 10%."}', {
        prompt_tokens: 120,
        completion_tokens: 30,
      }),
    );
    const r = await chatJson(data, ASK, opts(f));
    expect(r).toEqual({
      ok: true,
      value: { hint: "Start with 10%." },
      text: '{"hint":"Start with 10%."}',
    });
    expect(calls.length).toBe(1);
    const call = calls[0] as Call;
    expect(call.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(call.init.method).toBe("POST");
    const headers = call.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(call.init.body as string);
    expect(body).toEqual({
      model: "gpt-4.1-mini",
      messages: ASK,
      max_completion_tokens: 1024,
    });
    expect(usageLines(data)).toEqual([
      {
        v: 1,
        t: NOW(),
        type: "usage",
        job: "hint",
        model: "gpt-4.1-mini",
        input: 120,
        output: 30,
      },
    ]);
  }),
);

test("parseJsonReply: bare, fenced, <think> prefix, prose", () => {
  expect(parseJsonReply('{"a":1}')).toEqual({ a: 1 });
  expect(parseJsonReply('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  expect(parseJsonReply('```\n{"a":1}\n```')).toEqual({ a: 1 });
  expect(parseJsonReply('<think>10% is 24</think>\n{"a":1}')).toEqual({
    a: 1,
  });
  expect(parseJsonReply('Here you go: {"a":1}')).toBeUndefined();
});

test(
  "fenced JSON and a <think> prefix parse through chatJson",
  withData(OPENAI, async (data) => {
    for (const content of [
      '```json\n{"hint":"x"}\n```',
      '<think>hmm</think>{"hint":"x"}',
    ]) {
      const { f } = mockFetch(() =>
        completion(content, { prompt_tokens: 1, completion_tokens: 1 }),
      );
      const r = await chatJson(data, ASK, opts(f));
      expect(r.ok && r.value).toEqual({ hint: "x" });
    }
  }),
);

test(
  "non-JSON reply: not-json, and the tokens still count",
  withData(OPENAI, (data) =>
    quiet(async () => {
      const { f } = mockFetch(() =>
        completion("Sure, here is a hint: start with 10%.", {
          prompt_tokens: 50,
          completion_tokens: 12,
        }),
      );
      expect(await chatJson(data, ASK, opts(f))).toEqual({
        ok: false,
        reason: "not-json",
      });
      expect(usageLines(data).length).toBe(1);
      expect(usageLines(data)[0].input).toBe(50);
    }),
  ),
);

test(
  "HTTP 401 echoing the key: http 401, the key is in no result or log, no usage",
  withData(OPENAI, (data) =>
    quiet(async (logged) => {
      const { f } = mockFetch(() =>
        Response.json(
          {
            error: { message: `Incorrect API key provided: ${KEY}` },
          },
          { status: 401 },
        ),
      );
      const r = await chatJson(data, ASK, opts(f));
      expect(r).toEqual({ ok: false, reason: "http", status: 401 });
      expect(JSON.stringify(r)).not.toContain(KEY);
      expect(logged()).not.toContain(KEY);
      expect(logged()).toContain("http 401");
      expect(usageLines(data)).toEqual([]);
    }),
  ),
);

test(
  "HTTP 500: http 500",
  withData(OPENAI, (data) =>
    quiet(async () => {
      const { f } = mockFetch(() => new Response("oops", { status: 500 }));
      expect(await chatJson(data, ASK, opts(f))).toEqual({
        ok: false,
        reason: "http",
        status: 500,
      });
    }),
  ),
);

test(
  "timeout: the abort reason is a timeout",
  withData(OPENAI, (data) =>
    quiet(async () => {
      const f: Fetch = (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () =>
            reject(init.signal?.reason),
          );
        });
      expect(await chatJson(data, ASK, opts(f, { timeoutMs: 20 }))).toEqual({
        ok: false,
        reason: "timeout",
      });
    }),
  ),
);

test(
  "network: a rejected fetch",
  withData(OPENAI, (data) =>
    quiet(async () => {
      const f: Fetch = () => Promise.reject(new TypeError("fetch failed"));
      expect(await chatJson(data, ASK, opts(f))).toEqual({
        ok: false,
        reason: "network",
      });
    }),
  ),
);

test(
  "no model: no config.json, fetch never called",
  withData(null, async (data) => {
    const { f, calls } = mockFetch(() => completion("{}"));
    expect(await chatJson(data, ASK, opts(f))).toEqual({
      ok: false,
      reason: "no-model",
    });
    expect(calls.length).toBe(0);
    expect(fs.existsSync(data)).toBe(false);
  }),
);

test(
  "no model: preset none, fetch never called",
  withData({ preset: "none", weeklyTarget: 3 }, async (data) => {
    const { f, calls } = mockFetch(() => completion("{}"));
    expect(await chatJson(data, ASK, opts(f))).toEqual({
      ok: false,
      reason: "no-model",
    });
    expect(calls.length).toBe(0);
  }),
);

test(
  "cap: this London month at the cap refuses before the fetch; last month does not count",
  withData({ ...OPENAI, cap: 100 }, (data) =>
    quiet(async () => {
      const at = (t: string) => () => t;
      const usage = {
        v: 1 as const,
        type: "usage" as const,
        job: "hint",
        model: "m",
        input: 60,
        output: 40,
      };
      // 22:59:59Z on 30 September is 23:59:59 BST: still September in London.
      appendEvent(data, usage, at("2026-09-30T22:59:59Z"));
      const { f, calls } = mockFetch(() =>
        completion('{"a":1}', { prompt_tokens: 1, completion_tokens: 1 }),
      );
      const october = at("2026-10-01T00:30:00Z");
      expect((await chatJson(data, ASK, opts(f, { now: october }))).ok).toBe(
        true,
      );
      expect(calls.length).toBe(1);

      appendEvent(data, usage, at("2026-10-01T08:00:00Z"));
      expect(await chatJson(data, ASK, opts(f, { now: october }))).toEqual({
        ok: false,
        reason: "cap",
      });
      expect(calls.length).toBe(1);
    }),
  ),
);

test(
  "missing usage: an estimate marked estimated, the image's base64 not counted",
  withData(OPENAI, async (data) => {
    const reply = "x".repeat(100);
    const { f } = mockFetch(() => completion(`"${reply.slice(2)}"`));
    const messages: Message[] = [
      { role: "system", content: "s".repeat(400) },
      {
        role: "user",
        content: [
          { type: "text", text: "u".repeat(40) },
          imagePart(new Uint8Array(50_000), "image/jpeg"),
        ],
      },
    ];
    const r = await chatJson(data, messages, opts(f));
    expect(r.ok).toBe(true);
    // ceil(440 / 4) + 1000 = 1110; the reply is 100 characters → ceil(100 / 4) = 25.
    expect(usageLines(data)).toEqual([
      {
        v: 1,
        t: NOW(),
        type: "usage",
        job: "hint",
        model: "gpt-4.1-mini",
        input: 1110,
        output: 25,
        estimated: true,
      },
    ]);
  }),
);

test(
  "float usage: the estimate path, no refused append",
  withData(OPENAI, (data) =>
    quiet(async (logged) => {
      const { f } = mockFetch(() =>
        completion('{"a":1}', { prompt_tokens: 12.5, completion_tokens: 3 }),
      );
      expect((await chatJson(data, ASK, opts(f))).ok).toBe(true);
      expect(usageLines(data)[0].estimated).toBe(true);
      expect(logged()).not.toContain("Could not record");
    }),
  ),
);

test(
  "limit field: Ollama sends max_tokens; opts.limitField overrides the preset",
  withData(
    {
      preset: "ollama",
      base_url: "http://localhost:11434/v1",
      model: "qwen2.5:14b",
      key: "",
      cap: 1000,
      weeklyTarget: 3,
    },
    async (data) => {
      const { f, calls } = mockFetch(() =>
        completion('{"a":1}', { prompt_tokens: 1, completion_tokens: 1 }),
      );
      await chatJson(data, ASK, opts(f, { maxTokens: 300 }));
      const first = JSON.parse((calls[0] as Call).init.body as string);
      expect(first.max_tokens).toBe(300);
      expect(first).not.toHaveProperty("max_completion_tokens");
      // No key saved: no Authorization header.
      expect(
        Object.keys((calls[0] as Call).init.headers as Record<string, string>),
      ).not.toContain("authorization");

      await chatJson(
        data,
        ASK,
        opts(f, { limitField: "max_completion_tokens" }),
      );
      const second = JSON.parse((calls[1] as Call).init.body as string);
      expect(second.max_completion_tokens).toBe(1024);
      expect(second).not.toHaveProperty("max_tokens");
    },
  ),
);

test(
  "one at a time: a second call waits and sees the first call's usage",
  withData({ ...OPENAI, cap: 100 }, (data) =>
    quiet(async () => {
      const { f, calls } = mockFetch(
        () =>
          new Promise((resolve) =>
            setTimeout(
              () =>
                resolve(
                  completion('{"a":1}', {
                    prompt_tokens: 100,
                    completion_tokens: 0,
                  }),
                ),
              30,
            ),
          ),
      );
      const [a, b] = await Promise.all([
        chatJson(data, ASK, opts(f)),
        chatJson(data, ASK, opts(f)),
      ]);
      expect(a.ok).toBe(true);
      expect(b).toEqual({ ok: false, reason: "cap" });
      expect(calls.length).toBe(1);
      expect(usageLines(data).length).toBe(1);
    }),
  ),
);

test("the queue survives a rejection", async () => {
  await expect(enqueue(() => Promise.reject(new Error("x")))).rejects.toThrow(
    "x",
  );
  expect(await enqueue(() => Promise.resolve(1))).toBe(1);
});

test(
  "bad response: no choices counts an estimate with output 0; a non-JSON body counts nothing",
  withData(OPENAI, (data) =>
    quiet(async () => {
      const empty = mockFetch(() => Response.json({ choices: [] }));
      expect(await chatJson(data, ASK, opts(empty.f))).toEqual({
        ok: false,
        reason: "bad-response",
      });
      expect(usageLines(data).length).toBe(1);
      expect(usageLines(data)[0].estimated).toBe(true);
      expect(usageLines(data)[0].output).toBe(0);

      const text = mockFetch(() => new Response("not json"));
      expect(await chatJson(data, ASK, opts(text.f))).toEqual({
        ok: false,
        reason: "bad-response",
      });
      expect(usageLines(data).length).toBe(1);
    }),
  ),
);

test(
  "vision: imagePart is a base64 data URL and travels unchanged",
  withData(OPENAI, async (data) => {
    const part = imagePart(new Uint8Array([1, 2, 3]), "image/jpeg");
    expect(part).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AQID" },
    });
    const { f, calls } = mockFetch(() =>
      completion('{"a":1}', { prompt_tokens: 1, completion_tokens: 1 }),
    );
    await chatJson(
      data,
      [{ role: "user", content: [{ type: "text", text: "Mark this." }, part] }],
      opts(f),
    );
    const body = JSON.parse((calls[0] as Call).init.body as string);
    expect(body.messages[0].content[1]).toEqual(part);
  }),
);

test(
  "real socket: the URL join, header and body on the wire, and Bun's real timeout",
  withData(null, (data) =>
    quiet(async () => {
      const seen: { path: string; auth: string | null; body: unknown }[] = [];
      const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        routes: {
          "/v1/chat/completions": async (req) => {
            seen.push({
              path: new URL(req.url).pathname,
              auth: req.headers.get("authorization"),
              body: await req.json(),
            });
            return completion('{"ok":true}', {
              prompt_tokens: 5,
              completion_tokens: 2,
            });
          },
          "/hang/v1/chat/completions": () => new Promise<Response>(() => {}),
          // Headers and a first chunk arrive, then the body stalls (PR #32 L4).
          "/stall/v1/chat/completions": () =>
            new Response(
              new ReadableStream({
                start(c) {
                  c.enqueue(new TextEncoder().encode('{"choices":'));
                },
              }),
              { headers: { "content-type": "application/json" } },
            ),
        },
      });
      try {
        const setup = (base: string) => {
          const r = saveSetup(data, {
            preset: "custom",
            base_url: base,
            model: "stub",
            key: KEY,
            cap: 1000,
            weeklyTarget: 3,
          });
          if (!r.ok) throw new Error(r.error);
        };
        setup(`http://127.0.0.1:${server.port}/v1/`);
        const a = await chatJson(data, ASK, { job: "hint", now: NOW });
        expect(a).toEqual({
          ok: true,
          value: { ok: true },
          text: '{"ok":true}',
        });
        expect(seen).toEqual([
          {
            path: "/v1/chat/completions",
            auth: `Bearer ${KEY}`,
            body: { model: "stub", messages: ASK, max_tokens: 1024 },
          },
        ]);

        setup(`http://127.0.0.1:${server.port}/hang/v1`);
        const b = await chatJson(data, ASK, {
          job: "hint",
          now: NOW,
          timeoutMs: 200,
        });
        expect(b).toEqual({ ok: false, reason: "timeout" });

        setup(`http://127.0.0.1:${server.port}/stall/v1`);
        const c = await chatJson(data, ASK, {
          job: "hint",
          now: NOW,
          timeoutMs: 200,
        });
        expect(c).toEqual({ ok: false, reason: "timeout" });
      } finally {
        server.stop(true);
      }
    }),
  ),
);

const SRC = path.join(import.meta.dir, "..");

test("guard: chat/completions appears in the provider module only", async () => {
  const hits: string[] = [];
  for await (const rel of new Bun.Glob("**/*.ts").scan(SRC)) {
    if (rel.endsWith(".test.ts")) continue;
    const text = fs.readFileSync(path.join(SRC, rel), "utf8");
    if (text.includes("chat/completions"))
      hits.push(rel.split(path.sep).join("/"));
  }
  expect(hits).toEqual(["providers/openai-compatible.ts"]);
});

test("guard: no provider SDK in package.json", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(SRC, "..", "package.json"), "utf8"),
  );
  const names = Object.keys({
    ...(pkg.dependencies ?? {}),
    ...(pkg.devDependencies ?? {}),
  });
  const sdk =
    /^(openai|@anthropic-ai\/|ai$|@ai-sdk\/|litellm|groq-sdk|@mistralai\/)/;
  expect(names.filter((n) => sdk.test(n))).toEqual([]);
});

test("guard: the provider imports nothing from content", () => {
  const text = fs.readFileSync(
    path.join(import.meta.dir, "openai-compatible.ts"),
    "utf8",
  );
  expect(text).not.toMatch(/from\s+["'][./]*\/?content/);
  expect(text).not.toContain("../content");
});
