import type { CasePack } from "../content/types";
import { type Diagnostic, diagnostic } from "../flow/diagnostic";
import { MAX_ANSWER, readSheet, runInterview } from "../flow/intake";
import type { JobDeps } from "../jobs/define";
import type { SheetSource } from "../jobs/intake_read";
import { CONFIDENCES, type Confidence } from "../jobs/interview";
import { decodeDataUrl, sniffImage } from "../snap";
import { titleOf } from "./chat";
import { currentState } from "./state";

/** Nothing here appends: the page posts the confirmed intake@1 body through /api/event. */
type Result = { status: number; body: unknown };

const MAX_SHEET = 20_000;

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const bad = (error: string): Result => ({ status: 400, body: { error } });

/** The sheet a body names, or the refusal. The refusal names the rule, never the text or the image. */
function sheetSource(body: unknown): SheetSource | Result {
  if (!isObj(body)) return bad("Body must be a JSON object");
  const hasText = body.text !== undefined;
  const hasImage = body.image !== undefined;
  if (hasText === hasImage) return bad("Send the sheet as text or as a photo");
  if (hasText) {
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (text.length < 1 || text.length > MAX_SHEET)
      return bad(`text must be 1 to ${MAX_SHEET} characters`);
    return { kind: "text", text };
  }
  const bytes = decodeDataUrl(body.image);
  const kind = bytes === null ? null : sniffImage(bytes);
  if (bytes === null || kind === null)
    return bad("The photo must be a JPEG, PNG or WebP under 5 MB");
  return { kind: "image", bytes, mime: kind.mime };
}

/** A sheet → the rows it names (with each topic's title and the code it was read from) and the codes the pack does not hold. */
export async function postSheet(
  body: unknown,
  pack: CasePack,
  deps: JobDeps,
): Promise<Result> {
  const source = sheetSource(body);
  if (!("kind" in source)) return source;
  const r = await readSheet(source, pack.topics, deps);
  if (r.by === "none") return { status: 200, body: r };
  return {
    status: 200,
    body: {
      by: r.by,
      rows: r.rows.map(({ topic, rag, code }) => ({
        topic,
        title: titleOf(pack, topic),
        rag,
        code,
      })),
      unknown: r.unknown,
    },
  };
}

/** Three answers → rows with the pupil's confidence as R/A/G. Validated in full before the job runs. */
export async function postInterview(
  body: unknown,
  pack: CasePack,
  deps: JobDeps,
): Promise<Result> {
  if (!isObj(body) || !isObj(body.answers))
    return bad("answers must be an object");
  const answers = {} as Record<Confidence, string>;
  for (const c of CONFIDENCES) {
    const a = body.answers[c];
    if (typeof a !== "string") return bad(`answers.${c} must be a string`);
    const text = a.trim();
    if (text.length > MAX_ANSWER)
      return bad(`Each answer must be at most ${MAX_ANSWER} characters`);
    answers[c] = text;
  }
  if (CONFIDENCES.every((c) => answers[c] === ""))
    return bad("Answer at least one question");
  const r = await runInterview(answers, pack.topics, deps);
  if (r.by === "none") return { status: 200, body: r };
  return {
    status: 200,
    body: {
      by: r.by,
      rows: r.rows.map(({ topic, rag }) => ({
        topic,
        title: titleOf(pack, topic),
        rag,
      })),
    },
  };
}

/** Today's cold test for the record in dataDir, or null when there is nothing to ask. No model. */
export function diagnosticForDay(
  dataDir: string,
  pack: CasePack,
  day: string,
): Diagnostic | null {
  return diagnostic(currentState(dataDir), day, pack);
}
