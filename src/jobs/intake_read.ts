/**
 * intake_read: a school sheet (pasted text or a photo) → the topic codes printed on it, each with the
 * R/A/G printed beside it. It sees the pupil's sheet and nothing from the pack: no item, no answer and no
 * list of codes to pick from. src/flow/intake resolves the codes to topics; the page confirms them.
 */
import type { Rag } from "../events/types";
import { imagePart, type Message } from "../providers/openai-compatible";
import { defineJob, preAttemptSystem } from "./define";

export type SheetSource =
  | { kind: "text"; text: string }
  | { kind: "image"; bytes: Uint8Array; mime: string };
export type IntakeReadInput = { source: SheetSource; known: readonly string[] }; // known: every topic id and alias, for the no-model reader only
export type CodeRow = { code: string; rag: Rag | null };
export type IntakeReadOutput = { codes: CodeRow[] };
export const MAX_CODES = 80;
const MAX_CODE = 40; // observed: the longest topic id is 25 characters (1MA1/R9/increase-decrease)
const CODE = /^[A-Za-z0-9./-]+$/;
const RAGS: readonly unknown[] = ["R", "A", "G"];

/** The phrase TASK starts with; scripts/fake-provider.ts finds this job by it. */
export const INTAKE_READ_MARK = "Read the school sheet.";
const TASK = `${INTAKE_READ_MARK} List every topic code printed on it, with the R, A or G printed beside that code, or null when none is printed. Reply with JSON only: {"codes": [{"code": "U100", "rag": "R"}]}`;
// Replaces define.ts's NUM: there is no question here, and the codes are what the reply copies.
const NUM =
  "Copy each code exactly as it is printed. Never make up a code, and never add a code for a topic name that has no code printed beside it.";

const SPARX = /^[UM]\d{3}$/;

/**
 * The codes in pasted text, deterministic and blind to line breaks. A code is a Sparx-shaped token
 * (U349, M113) or a known topic id or alias, case-insensitive, with one trailing comma dropped. Two
 * readings of the R/A/G are tried. Before: the token directly before the code when that is R, A or G,
 * else the R/A/G of a code directly before it that ends in a comma ("G U745, U736"). After: the first
 * R, A or G after the code and before the next code ("U349 Percentage of an amount R"). The reading that
 * leaves fewer R/A/G tokens unused wins; on a tie where they disagree, every rating is null, so the pupil
 * picks each one on the confirm list rather than getting ratings shifted by a row. Rows in text order,
 * duplicates kept.
 */
export function readCodes(text: string, known: readonly string[]): CodeRow[] {
  const byUpper = new Set(known.map((k) => k.toUpperCase()));
  const tokens = text.split(/\s+/).filter((t) => t !== "");
  const codes: { code: string; at: number; comma: boolean }[] = [];
  for (const [at, token] of tokens.entries()) {
    const comma = token.endsWith(",");
    const code = (comma ? token.slice(0, -1) : token).toUpperCase();
    if (SPARX.test(code) || byUpper.has(code)) codes.push({ code, at, comma });
  }
  const rags = tokens.filter((t) => RAGS.includes(t)).length;

  const before: (Rag | null)[] = [];
  let usedBefore = 0;
  for (const [i, c] of codes.entries()) {
    const t = tokens[c.at - 1];
    const prev = codes[i - 1];
    let rag: Rag | null = null;
    if (t !== undefined && RAGS.includes(t)) {
      rag = t as Rag;
      usedBefore += 1;
    } else if (prev?.comma && prev.at === c.at - 1) rag = before[i - 1] ?? null;
    before.push(rag);
  }

  const after: (Rag | null)[] = [];
  let usedAfter = 0;
  for (const [i, c] of codes.entries()) {
    const end = codes[i + 1]?.at ?? tokens.length;
    const t = tokens.slice(c.at + 1, end).find((x) => RAGS.includes(x));
    if (t !== undefined) usedAfter += 1;
    after.push((t as Rag | undefined) ?? null);
  }

  const unusedBefore = rags - usedBefore;
  const unusedAfter = rags - usedAfter;
  const tie =
    unusedBefore === unusedAfter && before.some((r, i) => r !== after[i]);
  const pick = unusedAfter < unusedBefore ? after : before;
  return codes.map((c, i) => ({
    code: c.code,
    rag: tie ? null : (pick[i] ?? null),
  }));
}

function prompt({ source }: IntakeReadInput): Message[] {
  const system = preAttemptSystem(TASK, undefined, NUM);
  if (source.kind === "text")
    return [system, { role: "user", content: `Sheet text:\n${source.text}` }];
  return [
    system,
    {
      role: "user",
      content: [
        { type: "text", text: "The photo is a school sheet." },
        imagePart(source.bytes, source.mime),
      ],
    },
  ];
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const squash = (s: string) => s.toUpperCase().replace(/\s+/g, "");

/** At most MAX_CODES rows of a code-shaped string and R/A/G or null. From pasted text, every code must be in the text. */
function validate(
  value: unknown,
  { source }: IntakeReadInput,
): IntakeReadOutput | null {
  if (!isObj(value) || !Array.isArray(value.codes)) return null;
  if (value.codes.length > MAX_CODES) return null;
  const text = source.kind === "text" ? squash(source.text) : null;
  const codes: CodeRow[] = [];
  for (const row of value.codes as unknown[]) {
    if (!isObj(row) || typeof row.code !== "string") return null;
    const code = squash(row.code);
    if (code.length < 1 || code.length > MAX_CODE || !CODE.test(code))
      return null;
    if (row.rag !== null && !RAGS.includes(row.rag)) return null;
    if (text !== null && !text.includes(code)) return null;
    codes.push({ code, rag: row.rag as Rag | null });
  }
  return { codes };
}

export const intakeRead = defineJob<IntakeReadInput, IntakeReadOutput>({
  name: "intake_read",
  prompt,
  validate,
  // Empty: codes are identifiers checked by CODE in validate, not prose. The guard's number rule would
  // refuse every code in a photo reply (a photo has no text source). A pasted sheet's codes must be in
  // the text (validate); a photo's are checked by the pupil on the confirm list.
  texts: () => [],
  sources: () => [],
  fallback: ({ source, known }) =>
    source.kind === "text" ? { codes: readCodes(source.text, known) } : null,
});
