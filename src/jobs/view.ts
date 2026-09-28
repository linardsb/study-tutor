/**
 * The answer guard by construction. This file is the only producer of the two brands: a pre-attempt
 * job takes `PreAttempt`, a post-attempt job takes `PostAttempt`, and a raw `Item` fits neither.
 */
import { toItemView } from "../content/pack";
import type { Item, ItemView } from "../content/types";
import { parseEvent } from "../events/types";

declare const PRE: unique symbol;
declare const POST: unique symbol;
/** The item a job may see before an attempt: toItemView's output, branded so a raw Item cannot pass for it. */
export type PreAttempt = ItemView & { readonly [PRE]: true };
/** The full item, minted only once hasAttempt reads true. */
export type PostAttempt = Item & { readonly [POST]: true };
export type ItemRef = { id: string; seed?: number };

/** True when the log holds an attempt for this item. A generated item (`#gen`) must match the seed as well. */
export function hasAttempt(lines: readonly string[], ref: ItemRef): boolean {
  // Every generated item of a topic shares `${topic}#gen`, so the id alone would unlock them all.
  const generated = ref.id.endsWith("#gen");
  if (generated && ref.seed === undefined) return false;
  for (const line of lines) {
    const e = parseEvent(line);
    if (e?.type !== "attempt" || e.item !== ref.id) continue;
    if (!generated || e.seed === ref.seed) return true;
  }
  return false;
}

/** The job's view of an item: the stripped view before an attempt, the full item after one. */
export function jobItem(
  lines: readonly string[],
  item: Item & { seed?: number },
):
  | { attempted: false; view: PreAttempt }
  | { attempted: true; item: PostAttempt } {
  if (hasAttempt(lines, item))
    return { attempted: true, item: item as PostAttempt };
  return { attempted: false, view: toItemView(item) as PreAttempt };
}
