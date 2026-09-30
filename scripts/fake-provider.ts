// A stand-in OpenAI-compatible provider on 127.0.0.1 for tests and manual checks of the chat route.
// It answers POST /v1/chat/completions after `delayMs`: five examiner lines for a photo, marks for a
// teach-back, Dan's given wrong answer, two codes for a school sheet (text or photo), one topic for
// the intake interview, a fixed hint otherwise, or "not json" in not-json mode.
// Run it: bun scripts/fake-provider.ts --mode not-json --delay 70000
// --log <file> appends each request body as one JSON line, to check what reached the model.

import { appendFileSync } from "node:fs";

import { INTAKE_READ_MARK } from "../src/jobs/intake_read";
import { INTERVIEW_MARK } from "../src/jobs/interview";

export type FakeMode = "valid" | "not-json";

type Msg = { role?: string; content?: unknown };

// Scored 4 of 5, clean: 1 + 0 + 1 + 1 (units not needed) + 1.
const EXAMINER = {
  lines: [
    { kind: "method", mark: 1, note: "" },
    { kind: "accuracy", mark: 0, note: "Check the last step." },
    { kind: "answer", mark: 1, note: "" },
    { kind: "units", mark: null, note: "" },
    { kind: "sense", mark: 1, note: "" },
  ],
};

const hasImage = (m: Msg) =>
  Array.isArray(m.content) &&
  m.content.some((p) => (p as { type?: unknown })?.type === "image_url");

/** The reply content for one request: examiner lines for a photo, one mark per numbered pupil line for a teach-back, a hint otherwise. */
function contentFor(messages: Msg[], mode: FakeMode): string {
  if (mode === "not-json") return "not json";
  // Before the image check: a sheet photo is not an examiner's photo. A pasted sheet must hold both codes.
  const head = String(messages.find((m) => m.role === "system")?.content);
  if (head.includes(INTAKE_READ_MARK))
    return JSON.stringify({
      codes: [
        { code: "U349", rag: "R" },
        { code: "U976", rag: "G" },
      ],
    });
  if (head.includes(INTERVIEW_MARK))
    return JSON.stringify({
      topics: [{ topic: "1MA1/R4", confidence: "unsure" }],
    });
  // By structure, not wording: the examiner's user content is an array, which String() would spoil below.
  if (messages.some(hasImage)) return JSON.stringify(EXAMINER);
  const system = String(messages.find((m) => m.role === "system")?.content);
  if (system.includes("You are Dan")) {
    const user = String(messages.find((m) => m.role === "user")?.content);
    const answer = /The answer you reach: (.+)/.exec(user)?.[1] ?? "";
    return JSON.stringify({ lines: [`I get ${answer}.`] });
  }
  if (!system.includes("Mark the pupil's"))
    return JSON.stringify({ text: "Start with 10%." });
  const user = String(messages.find((m) => m.role === "user")?.content);
  const n = user.split("\n").filter((l) => /^\d+\. /.test(l)).length;
  return JSON.stringify({
    lines: Array.from({ length: n }, () => ({ mark: 1, note: "" })),
  });
}

/** Starts the fake on a free port. `url` is the base URL to save as the provider's address. */
export function startFakeProvider(opts: {
  delayMs?: number;
  mode: FakeMode;
  log?: string;
}) {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    idleTimeout: 0, // a delay past Bun's default 120 s must not drop the tutor's request
    routes: {
      "/v1/chat/completions": {
        POST: async (req) => {
          const body = (await req.json()) as { messages?: Msg[] };
          if (opts.log) appendFileSync(opts.log, `${JSON.stringify(body)}\n`);
          if (opts.delayMs) await Bun.sleep(opts.delayMs);
          return Response.json({
            choices: [
              {
                message: {
                  role: "assistant",
                  content: contentFor(body.messages ?? [], opts.mode),
                },
              },
            ],
            usage: { prompt_tokens: 20, completion_tokens: 10 },
          });
        },
      },
    },
    fetch: () => new Response("Not found", { status: 404 }),
  });
  return {
    url: `http://127.0.0.1:${server.port}/v1`,
    stop: () => server.stop(true),
  };
}

if (import.meta.main) {
  const flag = (name: string) => {
    const i = Bun.argv.indexOf(`--${name}`);
    return i === -1 ? undefined : Bun.argv[i + 1];
  };
  const mode = flag("mode") ?? "valid";
  if (mode !== "valid" && mode !== "not-json") {
    console.error("--mode must be valid or not-json");
    process.exit(1);
  }
  const delayMs = Number(flag("delay") ?? 0);
  const fake = startFakeProvider({ mode, delayMs, log: flag("log") });
  console.log(`Fake provider (${mode}, ${delayMs} ms) at ${fake.url}`);
}
