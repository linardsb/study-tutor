import { lessonFile, subjectDir } from "../content/pack";
import type { Topic } from "../content/types";

const cache = new Map<string, Record<string, string>>();

/** Topic id → the URL of its lesson page, for the topics that have one. Read once per root: content/ changes only with an update, which restarts the binary (D10). */
export function lessonUrls(
  root: string,
  subject: string,
  topics: readonly Topic[],
): Record<string, string> {
  const key = subjectDir(subject, root);
  const cached = cache.get(key);
  if (cached) return cached;
  const urls: Record<string, string> = {};
  for (const t of topics) {
    const file = lessonFile(root, subject, t.id);
    if (file !== null) urls[t.id] = `/content/${subject}/lessons/${file}`;
  }
  cache.set(key, urls);
  return urls;
}
