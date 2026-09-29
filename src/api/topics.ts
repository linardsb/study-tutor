import type { CasePack, Topic } from "../content/types";

/** Every topic with the subject folder it lives in, in pack order: what the map and the re-test page need to build content URLs. */
export function topicRows(
  pack: CasePack,
  subjects: ReadonlyMap<string, string>,
): Array<Topic & { subject: string }> {
  return pack.topics.map((t) => ({ ...t, subject: subjects.get(t.id) ?? "" }));
}
