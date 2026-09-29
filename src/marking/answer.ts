/** The server port of quiz.js `mark`: right, or the named misconception the typed answer matches, or neither. answer.test.ts checks the two agree. */
import type { Item } from "../content/types";
import { normaliseAnswer } from "./normalise";

export function markAnswer(
  item: Pick<Item, "answers" | "misconceptions">,
  typed: string,
): { ok: boolean; named: string | null } {
  const val = normaliseAnswer(typed);
  const ok = (item.answers ?? []).some((a) => normaliseAnswer(a) === val);
  const named = ok
    ? null
    : (item.misconceptions.find((m) => normaliseAnswer(m.answer) === val)
        ?.message ?? null);
  return { ok, named };
}
