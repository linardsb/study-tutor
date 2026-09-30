import { readProfile } from "../config";
import { chosenOf } from "../content/profile";
import type { Chosen, Course } from "../content/types";
import { PROFILE_FILE, writeDataFile } from "../events/append";

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** Every course the tutor teaches and the ones the pupil has picked. */
export function getCourses(
  dataDir: string,
  courses: readonly Course[],
): { status: 200; body: { courses: readonly Course[]; chosen: Chosen[] } } {
  return {
    status: 200,
    body: { courses, chosen: chosenOf(readProfile(dataDir).courses, courses) },
  };
}

/** The first thing wrong with a posted list, in words that never repeat what was posted; null when it is fine. */
function refusal(body: unknown, courses: readonly Course[]): string | null {
  if (!isObj(body) || !Array.isArray(body.courses))
    return "Send a list of courses.";
  if (body.courses.length === 0) return "Pick at least one course.";
  const seen = new Set<string>();
  for (const e of body.courses as unknown[]) {
    const course = isObj(e)
      ? courses.find((c) => c.spec === e.spec)
      : undefined;
    if (!isObj(e) || course === undefined)
      return "That course is not in this tutor.";
    if (course.tiers.length === 0) {
      if (e.tier !== undefined)
        return `${course.title} has no Foundation or Higher.`;
    } else if (!course.tiers.some((t) => t === e.tier))
      return `Pick Foundation or Higher for ${course.title}.`;
    if (seen.has(course.spec)) return "Pick each course once.";
    seen.add(course.spec);
  }
  return null;
}

/** The pupil's courses into profile.json, every other key kept. Nothing is written on a refusal. */
export function saveCourses(
  body: unknown,
  dataDir: string,
  courses: readonly Course[],
):
  | { status: 200; body: { chosen: Chosen[] } }
  | { status: 400; body: { error: string } } {
  const error = refusal(body, courses);
  if (error !== null) return { status: 400, body: { error } };
  const chosen = chosenOf((body as Obj).courses, courses);
  const profile = { ...readProfile(dataDir), courses: chosen };
  writeDataFile(dataDir, PROFILE_FILE, `${JSON.stringify(profile, null, 2)}\n`);
  return { status: 200, body: { chosen } };
}
