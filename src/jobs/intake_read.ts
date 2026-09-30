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
export const MAX_CODE = 40; // observed: the longest topic id is 29 characters (8702/3.2.2/power-and-conflict); packs.test.ts pins every id under it
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
 * (U349, M113) or a known topic id or alias, case-insensitive, with one trailing comma dropped. Its R/A/G
 * is the token directly before it when that is R, A or G; else the R/A/G of a code directly before it
 * that ends in a comma ("G U745, U736"); else null. Rows in text order, duplicates kept.
 */
export function readCodes(text: string, known: readonly string[]): CodeRow[] {
  const byUpper = new Set(known.map((k) => k.toUpperCase()));
  const tokens = text.split(/\s+/).filter((t) => t !== "");
  const rows: CodeRow[] = [];
  let prev: { comma: boolean; rag: Rag | null } | null = null;
  let before: string | undefined;
  for (const token of tokens) {
    const comma = token.endsWith(",");
    const code = (comma ? token.slice(0, -1) : token).toUpperCase();
    if (SPARX.test(code) || byUpper.has(code)) {
      let rag: Rag | null = null;
      if (before !== undefined && RAGS.includes(before)) rag = before as Rag;
      else if (prev?.comma) rag = prev.rag;
      rows.push({ code, rag });
      prev = { comma, rag };
    } else prev = null;
    before = token;
  }
  return rows;
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
