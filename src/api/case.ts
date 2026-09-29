import fs from "node:fs";
import path from "node:path";
import { loadGenerators } from "../content/generators";
import { loadItems, loadTopics, subjectDir } from "../content/pack";
import type { CasePack, Generator, Item, Topic } from "../content/types";
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

export type Packs = { pack: CasePack; subjects: ReadonlyMap<string, string> };

const merged = new Map<string, Promise<Packs>>();

/** Every content/<subject>/ with a topics.json, merged into one pack, plus topic id → subject. Topic ids, aliases and generator codes must be unique across subjects: resolveTopic takes the first match. */
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
    const owner = new Map<string, string>(); // "topic id x" / "alias x" / "generator code x" → subject
    const claim = (s: string, what: string) => {
      const other = owner.get(what);
      if (other !== undefined)
        throw new Error(
          `content/${s}/topics.json: ${what} is also in content/${other}`,
        );
      owner.set(what, s);
    };
    for (const s of names) {
      const p = await loadCasePack(s, root);
      for (const t of p.topics) {
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
    return { pack: { topics, items, gens }, subjects };
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
): CaseResponse {
  const state = currentState(dataDir);
  const record = state.cases[day] ?? null;
  const source = record
    ? sourceOf(record)
    : pickCase(day, state.caseSeed, casePool(pack));
  return {
    day,
    record,
    source,
    case: source ? buildCase(source, day, pack) : null,
    reask: source ? buildReask(source, day, pack) : null,
    calibration: calibration(state.cases),
  };
}
