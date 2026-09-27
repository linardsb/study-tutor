import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadTopics } from "../content/pack";
import { handle, runStdio } from "./server";
import { TOOLS, type ToolContext } from "./tools";

const topics = await loadTopics("maths");
const AT = () => "2026-10-11T23:30:00Z";

/** A realpathed temp dir (macOS maps /var to /private/var), removed afterwards. */
function withTemp(fn: (ctx: ToolContext) => Promise<void>) {
  return async () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-mcp-server-")),
    );
    try {
      await fn({
        root: process.cwd(),
        dataDir: path.join(dir, "data"),
        subject: "maths",
        topics,
        origin: "http://127.0.0.1:4731",
        now: AT,
      });
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

const req = (id: number, method: string, params?: object) => ({
  jsonrpc: "2.0",
  id,
  method,
  ...(params ? { params } : {}),
});
const init = (protocolVersion: string) =>
  req(1, "initialize", {
    protocolVersion,
    capabilities: {},
    clientInfo: { name: "test", version: "0" },
  });

type Reply = {
  id: unknown;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
};
const ask = async (msg: unknown, ctx: ToolContext) =>
  (await handle(msg, ctx)) as Reply;

test(
  "initialize echoes a supported version and offers the newest otherwise",
  withTemp(async (ctx) => {
    expect((await ask(init("2025-11-25"), ctx)).result).toMatchObject({
      protocolVersion: "2025-11-25",
      capabilities: { tools: {} },
      serverInfo: { name: "study-tutor" },
    });
    expect((await ask(init("1900-01-01"), ctx)).result?.protocolVersion).toBe(
      "2025-11-25",
    );
  }),
);

test(
  "a notification gets no reply",
  withTemp(async (ctx) => {
    expect(
      await handle(
        { jsonrpc: "2.0", method: "notifications/initialized" },
        ctx,
      ),
    ).toBeNull();
  }),
);

test(
  "ping, an unknown method, an unknown tool and a batch",
  withTemp(async (ctx) => {
    expect((await ask(req(2, "ping"), ctx)).result).toEqual({});
    expect((await ask(req(3, "server/discover"), ctx)).error?.code).toBe(
      -32601,
    );
    expect(
      (await ask(req(4, "tools/call", { name: "rm", arguments: {} }), ctx))
        .error,
    ).toEqual({ code: -32602, message: "Unknown tool: rm" });
    expect((await ask([], ctx)).error?.code).toBe(-32600);
  }),
);

test(
  "tools/list: the four tools, clock takes nothing, write_event names session and intake only",
  withTemp(async (ctx) => {
    const tools = (await ask(req(5, "tools/list"), ctx)).result?.tools as {
      name: string;
      inputSchema: Record<string, unknown>;
    }[];
    expect(tools.map((t) => t.name)).toEqual(Object.keys(TOOLS));
    const by = Object.fromEntries(tools.map((t) => [t.name, t]));
    expect(by.clock?.inputSchema).toEqual({
      type: "object",
      additionalProperties: false,
    });
    const schema = by.write_event?.inputSchema as {
      properties: { type: { enum: string[] } };
    };
    expect(schema.properties.type.enum).toEqual(["session", "intake"]);
  }),
);

test(
  "tools/call write_event with an attempt is a tool error saying Refused",
  withTemp(async (ctx) => {
    const r = await ask(
      req(6, "tools/call", {
        name: "write_event",
        arguments: {
          v: 1,
          type: "attempt",
          item: "1MA1/R4#1",
          topic: "1MA1/R4",
          correct: true,
          sure: true,
          answer: "x",
        },
      }),
      ctx,
    );
    expect(r.result?.isError).toBe(true);
    const content = (r.result?.content ?? []) as { text: string }[];
    const [block] = content;
    expect(block?.text).toMatch(/Refused/);
    expect(fs.existsSync(ctx.dataDir)).toBe(false);
  }),
);

test(
  "tools/call clock with Claude Code's _meta in params",
  withTemp(async (ctx) => {
    const r = await ask(
      req(7, "tools/call", {
        name: "clock",
        arguments: {},
        _meta: { "claudecode/toolUseId": "toolu_x", progressToken: 7 },
      }),
      ctx,
    );
    expect(r.result?.isError).toBe(false);
    expect(r.result?.structuredContent).toMatchObject({ utc: AT() });
  }),
);

test(
  "stdio: lines split mid-line and mid-character, a CRLF line and bad JSON, answered in order",
  withTemp(async (ctx) => {
    const text = [
      JSON.stringify(req(1, "ping")),
      JSON.stringify({ ...req(2, "tools/call", { name: "clock" }), note: "é" }),
      "{not json",
    ];
    const bytes = new TextEncoder().encode(
      `${text[0]}\n${text[1]}\r\n${text[2]}`,
    );
    // Split inside the first line and between the two bytes of é.
    const e = bytes.indexOf(0xc3);
    const cuts = [0, 10, e + 1, bytes.length];
    const chunks = cuts.slice(1).map((c, i) => bytes.slice(cuts[i], c));
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        for (const chunk of chunks) c.enqueue(chunk);
        c.close();
      },
    });
    const out: string[] = [];
    await runStdio(stream, (l) => out.push(l), ctx);
    const replies = out.map((l) => JSON.parse(l) as Reply);
    expect(replies.map((r) => r.id)).toEqual([1, 2, null]);
    expect(replies[1]?.result?.isError).toBe(false);
    expect(replies[2]?.error?.code).toBe(-32700);
  }),
);

test("the --mcp process answers on a clean stdout and exits 0 when stdin closes", async () => {
  const proc = Bun.spawn([process.execPath, "src/server.ts", "--mcp"], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const lines = [
    init("2025-11-25"),
    { jsonrpc: "2.0", method: "notifications/initialized" },
    req(2, "tools/list"),
    req(3, "tools/call", { name: "clock", arguments: {} }),
    req(4, "tools/call", { name: "read_state", arguments: { topic: "U687" } }),
    // Refused by validation (rag "X"), so the run leaves the repo's data/ as it was.
    req(5, "tools/call", {
      name: "write_event",
      arguments: {
        v: 1,
        type: "intake",
        door: "interview",
        topics: [{ topic: "U687", rag: "X" }],
      },
    }),
  ];
  for (const l of lines) proc.stdin.write(`${JSON.stringify(l)}\n`);
  await proc.stdin.end();
  const [code, stdout, stderr] = await Promise.all([
    proc.exited,
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  expect(code).toBe(0);
  const replies = stdout
    .split("\n")
    .filter((l) => l !== "")
    .map((l) => JSON.parse(l) as Reply & { jsonrpc: string });
  for (const r of replies) expect(r.jsonrpc).toBe("2.0");
  expect(replies.map((r) => r.id)).toEqual([1, 2, 3, 4, 5]);
  expect(replies[3]?.result?.isError).toBe(false);
  expect(replies[4]?.result?.isError).toBe(true);
  expect(stderr).toContain("lessons at http://127.0.0.1:");
}, 15_000);
