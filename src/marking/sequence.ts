/** An order of lettered steps: "B, D, A, C", "b then d then a then c" and "BDAC" are all "bdac". quiz.js `sequenceCanon` is the browser twin. */
export function sequenceCanon(s: string): string {
  return String(s)
    .toLowerCase()
    .replace(/\b(then|and)\b/g, "")
    .replace(/[^a-z]/g, "");
}
