import type { CasePack, Chosen, Course, Topic } from "./types";

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * The courses a saved profile names that this tutor still teaches, at a tier the course has. `saved` is
 * `readProfile(dataDir).courses`, untrusted: a hand edit or a course an update removed is dropped, never a
 * throw. The first entry for a spec wins.
 */
export function chosenOf(saved: unknown, courses: readonly Course[]): Chosen[] {
  if (!Array.isArray(saved)) return [];
  const out: Chosen[] = [];
  for (const e of saved) {
    if (!isObj(e)) continue;
    const course = courses.find((c) => c.spec === e.spec);
    if (course === undefined || out.some((c) => c.spec === course.spec))
      continue;
    if (course.tiers.length === 0) {
      if (e.tier === undefined) out.push({ spec: course.spec });
    } else if (course.tiers.some((t) => t === e.tier))
      out.push({ spec: course.spec, tier: e.tier as Chosen["tier"] });
  }
  return out;
}

/**
 * The topics of the chosen courses. Higher includes Foundation: a Higher pupil keeps every tier, a
 * Foundation pupil keeps `F` topics only. Nothing chosen gives the same array back.
 */
export function filterTopics(
  topics: readonly Topic[],
  chosen: readonly Chosen[],
  courses: readonly Course[],
): readonly Topic[] {
  if (chosen.length === 0) return topics;
  return topics.filter((t) => {
    const spec = t.id.split("/")[0];
    const pick = chosen.find((c) => c.spec === spec);
    if (pick === undefined) return false;
    const tiered =
      (courses.find((c) => c.spec === spec)?.tiers.length ?? 0) > 0;
    return !tiered || pick.tier === "H" || t.tier === "F";
  });
}

/** The pack with only the chosen topics; items and generators stay whole, so a lookup of past work still resolves. */
export function filterPack(
  pack: CasePack,
  chosen: readonly Chosen[],
  courses: readonly Course[],
): CasePack {
  if (chosen.length === 0) return pack;
  return { ...pack, topics: filterTopics(pack.topics, chosen, courses) };
}
