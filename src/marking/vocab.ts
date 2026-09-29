import { normaliseAnswer } from "./normalise";

/** A word answer: "the nucleus" and "nucleus" are the same answer. quiz.js `vocabCanon` is the browser twin; types.test.ts checks the two agree. */
export function vocabCanon(s: string): string {
  return normaliseAnswer(String(s).replace(/^\s*(the|a|an)\s+/i, ""));
}
