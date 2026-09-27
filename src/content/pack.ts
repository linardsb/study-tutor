import path from "node:path";
import type { Item, ItemView, Topic } from "./types";

/** `1MA1/G17/cone` → `1MA1-G17-cone.json`: the file under content/<subject>/items/ that holds a topic's items. */
export function itemsFileName(topicId: string): string {
  return `${topicId.replaceAll("/", "-")}.json`;
}

/**
 * `<root>/content/<subject>`. A subject is a lower-case word, so a name from a route or a tool cannot
 * step outside content/. `root` is where the binary runs, not the cwd (D10; see generators.ts).
 */
export function subjectDir(subject: string, root = process.cwd()): string {
  if (!/^[a-z]+$/.test(subject))
    throw new Error(`subject must be a lower-case word, got "${subject}"`);
  return path.resolve(root, "content", subject);
}

/** `concept` is absent, or a rule with at least one distractor, all non-empty strings. */
const conceptShaped = (c: unknown): boolean =>
  c === undefined ||
  (typeof c === "object" &&
    c !== null &&
    typeof (c as { rule?: unknown }).rule === "string" &&
    Array.isArray((c as { distractors?: unknown }).distractors) &&
    (c as { distractors: unknown[] }).distractors.length > 0 &&
    (c as { distractors: unknown[] }).distractors.every(
      (d) => typeof d === "string" && d.length > 0,
    ));

export async function loadTopics(
  subject: string,
  root = process.cwd(),
): Promise<Topic[]> {
  const file = path.join(subjectDir(subject, root), "topics.json");
  const rows: unknown = await Bun.file(file).json();
  const shaped =
    Array.isArray(rows) &&
    rows.every(
      (t) =>
        typeof t?.id === "string" &&
        typeof t.title === "string" &&
        Array.isArray(t.aliases) &&
        Array.isArray(t.prerequisites) &&
        (t.tier === "F" || t.tier === "H") &&
        conceptShaped(t.concept),
    );
  if (!shaped) throw new Error(`${file}: not a list of topic rows`);
  return rows as Topic[];
}

/** The items file of one topic; a topic with no file is an empty list, never a throw (a pack may add a topic before its items). */
export async function loadItems(
  subject: string,
  topicId: string,
  root = process.cwd(),
): Promise<Item[]> {
  const file = path.join(
    subjectDir(subject, root),
    "items",
    itemsFileName(topicId),
  );
  const f = Bun.file(file);
  if (!(await f.exists())) return [];
  const rows: unknown = await f.json();
  const shaped =
    Array.isArray(rows) &&
    rows.every(
      (i) =>
        typeof i?.id === "string" &&
        i.topic === topicId &&
        typeof i.stem === "string" &&
        Array.isArray(i.misconceptions),
    );
  if (!shaped) throw new Error(`${file}: not a list of items`);
  return rows as Item[];
}

/** The item without its answer, at runtime: what a job gets until an `attempt` event exists for it. */
export function toItemView(item: Item): ItemView {
  const { answers, working, mark_scheme, misconceptions, ...view } = item;
  return view;
}
