import type { Topic } from "./types";

/** `1MA1/G17/cone` → `1MA1-G17-cone.json`: the file under content/<subject>/items/ that holds a topic's items. */
export function itemsFileName(topicId: string): string {
  return `${topicId.replaceAll("/", "-")}.json`;
}

export async function loadTopics(subject: string): Promise<Topic[]> {
  return (await Bun.file(`content/${subject}/topics.json`).json()) as Topic[];
}
