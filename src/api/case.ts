import fs from "node:fs";
import path from "node:path";
import { loadGenerators } from "../content/generators";
import {
  loadCourses,
  loadItems,
  loadTopics,
  subjectDir,
} from "../content/pack";
import type {
  CasePack,
  Course,
  Generator,
  Item,
  Topic,
} from "../content/types";
import type { CaseRecord } from "../events/replay";
import {
  buildCase,
  buildReask,
  type Case,
  type CaseSource,
  calibration,
  casePool,
  pickCase,
} from "../flow/detective";
import { currentState } from "./state";

/** One pack per subject folder. Composed here, not in content/, because pack.ts and generators.ts already import one way. */
const packs = new Map<string, Promise<CasePack>>();

/** Topics, every topic's items and the generator table, read once per root. What the case route needs. */
export function loadCasePack(
  subject: string,
  root = process.cwd(),
): Promise<CasePack> {
  const key = subjectDir(subject, root);
  const cached = packs.get(key);
  if (cached) return cached;
  const loading = (async (): Promise<CasePack> => {
    const topics = await loadTopics(subject, root);
    const items = new Map<string, readonly Item[]>();
    for (const t of topics)
      items.set(t.id, await loadItems(subject, t.id, root));
    // A subject may ship no generators.js (science): its topics take their fixed items only.
    const gens = fs.existsSync(path.join(key, "generators.js"))
      ? await loadGenerators(subject, root)
      : {};
    return { topics, items, gens };
  })();
  packs.set(key, loading);
  return loading;
}

export type Packs = {
  pack: CasePack;
  subjects: ReadonlyMap<string, string>;
  courses: readonly Course[];
};

const merged = new Map<string, Promise<Packs>>();

/**
 * Every content/<subject>/ with a topics.json, merged into one pack, plus topic id → subject and every
 * pack's courses. Topic ids, aliases, generator codes and course specs must be unique across subjects:
 * resolveTopic takes the first match. A topic's spec prefix must be a course of its own pack, at a tier
 * that course has.
 */
export function loadPacks(root = process.cwd()): Promise<Packs> {
  const key = path.resolve(root, "content");
  const cached = merged.get(key);
  if (cached) return cached;
  const loading = (async (): Promise<Packs> => {
    // A stray .DS_Store or e1 folder is not a subject: subjectDir would throw on it.
    const names = fs
      .readdirSync(key)
      .filter(
        (s) =>
          /^[a-z]+$/.test(s) && fs.existsSync(path.join(key, s, "topics.json")),
      )
      .sort((a, b) => a.localeCompare(b));
    const topics: Topic[] = [];
    const items = new Map<string, readonly Item[]>();
    const gens: Record<string, Generator> = {};
    const subjects = new Map<string, string>();
    const courses: Course[] = [];
    const owner = new Map<string, string>(); // "topic id x" / "alias x" / "generator code x" / "course x" → subject
    const claim = (s: string, what: string, file = "topics.json") => {
      const other = owner.get(what);
      if (other !== undefined)
        throw new Error(
          `content/${s}/${file}: ${what} is also in content/${other}`,
        );
      owner.set(what, s);
    };
    for (const s of names) {
      // Courses first: a spec in two packs is reported as a course, before any topic claim.
      const bySpec = new Map<string, Course>();
      for (const c of await loadCourses(s, root)) {
        claim(s, `course ${c.spec}`, "courses.json");
        bySpec.set(c.spec, c);
        courses.push(c);
      }
      const p = await loadCasePack(s, root);
      for (const t of p.topics) {
        const prefix = t.id.split("/")[0] ?? t.id;
        const course = bySpec.get(prefix);
        if (course === undefined)
          throw new Error(
            `content/${s}/topics.json: topic ${t.id} has spec ${prefix}, not in content/${s}/courses.json`,
          );
        if (course.tiers.length > 0 && !course.tiers.includes(t.tier))
          throw new Error(
            `content/${s}/topics.json: topic ${t.id} is tier ${t.tier}, not a tier of ${prefix}`,
          );
        claim(s, `topic id ${t.id}`);
        for (const a of t.aliases) claim(s, `alias ${a}`);
        topics.push(t);
        items.set(t.id, p.items.get(t.id) ?? []);
        subjects.set(t.id, s);
      }
      for (const [code, g] of Object.entries(p.gens)) {
        claim(s, `generator code ${code}`);
        gens[code] = g;
      }
    }
    return { pack: { topics, items, gens }, subjects, courses };
  })();
  merged.set(key, loading);
  return loading;
}

export type CaseResponse = {
  day: string;
  record: CaseRecord | null; // today's answers when the case is already done
  source: CaseSource | null;
  case: Case | null;
  reask: Case | null;
  calibration: { predicted: number; scored: number; n: number };
};

/** The source a record was built from; null for a mistake record with no item (a hand-edited re-ask alone), which has no case to rebuild. */
function sourceOf(record: CaseRecord): CaseSource | null {
  if (record.kind === "rule") return { kind: "rule", topic: record.topic };
  if (record.item === null) return null;
  return { kind: "mistake", topic: record.topic, item: record.item };
}

/** Today's case for the record in dataDir. The case is rebuilt from today's record when one exists, so the page can show the done state. */
export function caseForDay(
  dataDir: string,
  pack: CasePack,
  day: string,
  offer: CasePack = pack, // picks a new case; the full pack still builds one saved before a course change
): CaseResponse {
  const state = currentState(dataDir);
  const record = state.cases[day] ?? null;
  const source = record
    ? sourceOf(record)
    : pickCase(day, state.caseSeed, casePool(offer));
  return {
    day,
    record,
    source,
    case: source ? buildCase(source, day, pack) : null,
    reask: source ? buildReask(source, day, pack) : null,
    calibration: calibration(state.cases),
  };
}
