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
        (t.tier === "F" || t.tier === "H"),
    );
  if (!shaped) throw new Error(`${file}: not a list of topic rows`);
  return rows as Topic[];
}

/** The item without its answer, at runtime: what a job gets until an `attempt` event exists for it. */
export function toItemView(item: Item): ItemView {
  const { answers, working, mark_scheme, misconceptions, ...view } = item;
  return view;
}
