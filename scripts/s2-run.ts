import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  type LimitField,
  PRESET_IDS,
  PRESETS,
  type PresetId,
  saveSetup,
} from "../src/config";
import { readLines } from "../src/events/append";
import {
  type ChatResult,
  chatJson,
  imagePart,
  type Message,
} from "../src/providers/openai-compatible";

// S2 spike: three probes (hint, teach-back mark, vision mark) through the real provider module.
// No data path: the run gets its own temp folder and never touches data/.

function flag(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? undefined : process.argv[i + 1];
}

const presetArg = flag("preset");
if (
  presetArg === undefined ||
  !(PRESET_IDS as readonly string[]).includes(presetArg) ||
  presetArg === "none"
) {
  console.error(
    "Usage: S2_KEY=... bun scripts/s2-run.ts --preset <id> [--model m] [--base-url u] [--max-field max_tokens|max_completion_tokens]",
  );
  process.exit(1);
}
const preset = presetArg as PresetId;
const model = flag("model") ?? PRESETS[preset].model;
const baseUrl = flag("base-url") ?? PRESETS[preset].base_url;
const maxField = flag("max-field");
if (
  maxField !== undefined &&
  maxField !== "max_tokens" &&
  maxField !== "max_completion_tokens"
) {
  console.error("--max-field must be max_tokens or max_completion_tokens");
  process.exit(1);
}
const limitField = maxField as LimitField | undefined;

const STEM = "Find 35% of 240.";
const SCHEME = [
  "1: finds 10% (24) or equivalent",
  "2: finds 30% and 5% (72 and 12) or equivalent",
  "3: adds to get the final value correctly",
].join("\n");
const MARK_SYSTEM = `You mark GCSE working against a mark scheme. Reply with JSON only, in this shape: {"marks":[{"line":1,"mark":0,"reason":"..."},{"line":2,...},{"line":3,...}]}. "line" is the mark scheme line number, 1 to 3, not a line of the pupil's working. Give exactly three entries, one per mark scheme line, in order. "mark" is 0 or 1. Name the mistake; never write a corrected solution.`;

type Probe = {
  job: string;
  messages: Message[];
  shape: (v: unknown) => boolean;
  note?: (v: unknown) => string;
};

type Mark = { line: number; mark: number; reason: string };
const marksOf = (v: unknown): Mark[] | null => {
  const m = (v as { marks?: unknown } | null)?.marks;
  return Array.isArray(m) ? (m as Mark[]) : null;
};
const marksShape = (v: unknown) => {
  const m = marksOf(v);
  return (
    m !== null &&
    m.length === 3 &&
    m.every(
      (e) =>
        typeof e === "object" &&
        e !== null &&
        typeof e.line === "number" &&
        (e.mark === 0 || e.mark === 1) &&
        typeof e.reason === "string",
    )
  );
};

async function probes(): Promise<Probe[]> {
  const photo = await Bun.file(
    path.join(import.meta.dir, "__fixtures__", "s2-working.jpg"),
  ).bytes();
  return [
    {
      // Pre-attempt: no answer and no mark scheme in the prompt.
      job: "s2_hint",
      messages: [
        {
          role: "system",
          content:
            'You help a GCSE maths pupil with one short hint. Do not state the answer. The pupil has not attempted this yet. Reply with JSON only, in this shape: {"hint":"..."}. British English, one or two sentences.',
        },
        { role: "user", content: STEM },
      ],
      shape: (v) =>
        typeof (v as { hint?: unknown } | null)?.hint === "string" &&
        (v as { hint: string }).hint.trim() !== "",
      note: (v) =>
        /\b84\b/.test(String((v as { hint?: unknown } | null)?.hint))
          ? "leak: states 84"
          : "no leak",
    },
    {
      // Post-attempt: the pupil's explanation of an attempt already made.
      job: "s2_teachback_mark",
      messages: [
        { role: "system", content: MARK_SYSTEM },
        {
          role: "user",
          content: `Question: ${STEM}\nMark scheme:\n${SCHEME}\nPupil's explanation: I found 10% by dividing 240 by 10, which is 24. Then 30% is 24 times 3, so 72, and 5% is half of 10%, so 12. I added 72 and 12 to get 84.`,
        },
      ],
      shape: marksShape,
    },
    {
      // Post-attempt: the photo is the attempt. Its last line says 72 + 12 = 86.
      job: "s2_vision_mark",
      messages: [
        { role: "system", content: MARK_SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Question: ${STEM}\nMark scheme:\n${SCHEME}\nThe photo is the pupil's working.`,
            },
            imagePart(photo, "image/jpeg"),
          ],
        },
      ],
      shape: marksShape,
      note: (v) => {
        const line3 = marksOf(v)?.find((e) => e.line === 3);
        return line3 === undefined
          ? "slip: no line 3"
          : line3.mark === 0
            ? "caught the slip"
            : "missed the slip";
      },
    },
  ];
}

type Try = {
  result: ChatResult;
  ms: number;
  usage: string;
  tokens: number;
  shape: boolean;
};

function lastUsage(
  data: string,
  before: number,
): { usage: string; tokens: number } {
  const lines = readLines(data).slice(before);
  const u = lines.map((l) => JSON.parse(l)).find((e) => e.type === "usage");
  if (u === undefined) return { usage: "none", tokens: 0 };
  return {
    usage: u.estimated ? "estimated" : "reported",
    tokens: u.input + u.output,
  };
}

const outcome = (t: Try) =>
  t.result.ok
    ? t.shape
      ? "json, shape ok"
      : "json, wrong shape"
    : `${t.result.reason}${t.result.status ? ` ${t.result.status}` : ""}`;

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "st-s2-"));
const data = path.join(dir, "data");
try {
  const saved = saveSetup(data, {
    preset,
    base_url: baseUrl,
    model,
    key: process.env.S2_KEY ?? "",
    cap: 1_000_000,
    weeklyTarget: 3,
  });
  if (!saved.ok) throw new Error(saved.error);

  console.log(
    "| provider | model | probe | http | first try | after retry | usage | tokens | ms | note |",
  );
  console.log("|---|---|---|---|---|---|---|---|---|---|");
  for (const p of await probes()) {
    const tries: Try[] = [];
    for (let i = 0; i < 2; i++) {
      const before = readLines(data).length;
      const start = performance.now();
      const result = await chatJson(data, p.messages, {
        job: p.job,
        ...(limitField ? { limitField } : {}),
      });
      const ms = Math.round(performance.now() - start);
      const shape = result.ok && p.shape(result.value);
      tries.push({ result, ms, shape, ...lastUsage(data, before) });
      // Retry once (the rule T9's jobs will have) only for a reply that parsed badly or has the wrong shape.
      const retry =
        (!result.ok && result.reason === "not-json") || (result.ok && !shape);
      if (!retry) break;
    }
    const first = tries[0] as Try;
    const last = tries[tries.length - 1] as Try;
    const http =
      !last.result.ok && last.result.reason === "http"
        ? String(last.result.status)
        : last.usage === "none"
          ? "-"
          : "200";
    const note = last.result.ok && p.note ? p.note(last.result.value) : "";
    console.log(
      `| ${preset} | ${model} | ${p.job} | ${http} | ${outcome(first)} | ${tries.length > 1 ? outcome(last) : "-"} | ${tries.map((t) => t.usage).join(", ")} | ${tries.map((t) => t.tokens).join(", ")} | ${tries.map((t) => t.ms).join(", ")} | ${note} |`,
    );
  }
} catch (err) {
  console.error(`S2 run stopped: ${(err as Error).message}`);
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
}
