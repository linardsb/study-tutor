/** The server port of quiz.js `mark`: right, or the named misconception the typed answer matches, or neither. answer.test.ts and types.test.ts check the two agree. */
import type { Item, ItemType } from "../content/types";
import { labelCanon } from "./label";
import { normaliseAnswer } from "./normalise";
import { sequenceCanon } from "./sequence";
import { vocabCanon } from "./vocab";

/** The canonical form for an item type; a generated item has no type and takes the plain normaliser. */
export function canonFor(type: ItemType | undefined): (s: string) => string {
  if (type === "vocab") return vocabCanon;
  if (type === "sequence") return sequenceCanon;
  if (type === "label") return labelCanon;
  return normaliseAnswer;
}

export function markAnswer(
  item: Pick<Item, "answers" | "misconceptions"> & { type?: ItemType },
  typed: string,
): { ok: boolean; named: string | null } {
  const canon = canonFor(item.type);
  const val = canon(typed);
  // An empty answer is never right, whatever the type.
  const ok = val !== "" && (item.answers ?? []).some((a) => canon(a) === val);
  const named = ok
    ? null
    : (item.misconceptions.find((m) => canon(m.answer) === val)?.message ??
      null);
  return { ok, named };
}
