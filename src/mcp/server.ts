import { runTool, TOOLS, type ToolContext, type ToolName } from "./tools";

/** initialize-handshake revisions, newest first (plan D4). */
export const SUPPORTED_VERSIONS = [
  "2025-11-25",
  "2025-06-18",
  "2025-03-26",
  "2024-11-05",
] as const;

const INSTRUCTIONS =
  "Study tutor for a GCSE pupil. Call read_state first. An item's answers appear only after the pupil has attempted it in the lesson page, which open_lesson links to.";

type Obj = Record<string, unknown>;
type Id = string | number | null;

const isObj = (x: unknown): x is Obj =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const reply = (id: Id, result: object) => ({ jsonrpc: "2.0", id, result });
const fail = (id: Id, code: number, message: string) => ({
  jsonrpc: "2.0",
  id,
  error: { code, message },
});

function initialize(params: Obj) {
  const asked = params.protocolVersion;
  const known = (SUPPORTED_VERSIONS as readonly unknown[]).includes(asked);
  return {
    protocolVersion: known ? asked : SUPPORTED_VERSIONS[0],
    capabilities: { tools: {} },
    serverInfo: { name: "study-tutor", version: "0.0.0" },
    instructions: INSTRUCTIONS,
  };
}

function listTools() {
  return {
    tools: Object.entries(TOOLS).map(([name, t]) => ({
      name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  };
}

/** `tools/call`: an unknown tool is a protocol error, anything the tool says is a result (spec, error handling). */
async function callTool(id: Id, params: Obj, ctx: ToolContext) {
  const name = params.name;
  if (typeof name !== "string" || !Object.hasOwn(TOOLS, name))
    return fail(id, -32602, `Unknown tool: ${String(name)}`);
  // params._meta (Claude Code sends one) is ignored.
  const args = params.arguments ?? {};
  const r = isObj(args)
    ? await runTool(name as ToolName, args, ctx)
    : { ok: false as const, error: "Arguments must be an object" };
  return reply(
    id,
    r.ok
      ? {
          content: [{ type: "text", text: JSON.stringify(r.value) }],
          structuredContent: r.value,
          isError: false,
        }
      : { content: [{ type: "text", text: r.error }], isError: true },
  );
}

/** One parsed message → the reply, or null for a notification. Never throws. */
export async function handle(
  msg: unknown,
  ctx: ToolContext,
): Promise<object | null> {
  // An array is a batch, which 2025-06-18 removed.
  if (!isObj(msg)) return fail(null, -32600, "Invalid request");
  if (!Object.hasOwn(msg, "id")) return null;
  const id = msg.id as Id;
  const params = isObj(msg.params) ? msg.params : {};
  switch (msg.method) {
    case "initialize":
      return reply(id, initialize(params));
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, listTools());
    case "tools/call":
      return callTool(id, params, ctx);
    default:
      return fail(id, -32601, "Method not found");
  }
}

/** Newline-delimited UTF-8 lines from a byte stream; a line split across chunks is joined. */
export async function* jsonLines(
  stream: ReadableStream<Uint8Array>,
): AsyncGenerator<string> {
  // stream: true holds back a UTF-8 character split across two chunks until its last byte arrives.
  const decoder = new TextDecoder();
  let buf = "";
  for await (const chunk of stream) {
    buf += decoder.decode(chunk, { stream: true });
    let nl = buf.indexOf("\n");
    while (nl !== -1) {
      const line = buf.slice(0, nl).replace(/\r$/, "");
      buf = buf.slice(nl + 1);
      if (line.trim() !== "") yield line;
      nl = buf.indexOf("\n");
    }
  }
  buf += decoder.decode();
  if (buf.trim() !== "") yield buf.replace(/\r$/, "");
}

/** Reads requests until the stream ends, one at a time in order; `write` gets one JSON line per reply. */
export async function runStdio(
  input: ReadableStream<Uint8Array>,
  write: (line: string) => void,
  ctx: ToolContext,
): Promise<void> {
  for await (const line of jsonLines(input)) {
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      write(JSON.stringify(fail(null, -32700, "Parse error")));
      continue;
    }
    const out = await handle(msg, ctx);
    if (out !== null) write(JSON.stringify(out));
  }
}
