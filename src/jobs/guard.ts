/** The reply guard: regex checks on every string a job will show, then the invented-number rule. */

const CHECKS: readonly [reason: string, re: RegExp][] = [
  // © ® ™ and the ↔-↙ ↩ ↪ arrows are Extended_Pictographic but appear in plain text (observed in planning: "©" and "↔" matched the bare class).
  // Not \p{Emoji}: that matches 0-9, # and *, which every maths reply holds.
  ["emoji", /(?![©®™↔-↙↩↪])\p{Extended_Pictographic}/u],
  ["exclamation", /!/],
  ["grade", /\bgrades?\b/i],
  ["grade", /\bon track (?:for|to)\b/i],
  ["grade", /\b(?:pass|fail)(?:ing)?\s+(?:the|your)\s+(?:exam|gcse|test)\b/i],
];

/** Every number in a text, normalised: "1,200" → "1200", "2.50" → "2.5", "¾" → 3 and 4. */
export function numbersIn(text: string): Set<string> {
  // NFKC first: \d is [0-9] only, so "¾", "²" and full-width digits would otherwise not be numbers.
  const plain = text.normalize("NFKC").replace(/(\d),(?=\d{3}\b)/g, "$1");
  return new Set(
    (plain.match(/\d+(?:\.\d+)?/g) ?? []).map((n) => String(Number(n))),
  );
}

/** The first rule a reply breaks, or null. `texts` is every string the job will show; `sources` is what the reply may take numbers from. */
export function guardReply(
  texts: readonly string[],
  sources: readonly string[],
): string | null {
  for (const [reason, re] of CHECKS)
    if (texts.some((t) => re.test(t))) return reason;
  // A number the question and the pupil never gave is the model doing maths (CLAUDE.md: no model decides a numeric answer).
  const allowed = numbersIn(sources.join(" "));
  for (const t of texts)
    for (const n of numbersIn(t)) if (!allowed.has(n)) return "invented-number";
  return null;
}

/** A second opinion that may say "would block" and is never obeyed in v1. */
export type ShadowJudge = (
  job: string,
  texts: readonly string[],
) => Promise<boolean>;
