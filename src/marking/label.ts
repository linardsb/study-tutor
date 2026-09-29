import { vocabCanon } from "./vocab";

/** Lettered parts named in order, comma-separated: every slot and the count must match. quiz.js `labelCanon` is the browser twin. */
export function labelCanon(s: string): string {
  return String(s)
    .split(/[,;\n]/)
    .map(vocabCanon)
    .filter((x) => x !== "")
    .join("|");
}
