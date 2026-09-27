import { loadGenerators } from "../content/generators";
import { loadItems, loadTopics, subjectDir } from "../content/pack";
import type { CasePack, Item } from "../content/types";
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
    return { topics, items, gens: await loadGenerators(subject, root) };
  })();
  packs.set(key, loading);
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

/** Today's case for the record in dataDir. The case is rebuilt from today's record when one exists, so the page can show the done state. */
export function caseForDay(
  dataDir: string,
  pack: CasePack,
  day: string,
): CaseResponse {
  const state = currentState(dataDir);
  const record = state.cases[day] ?? null;
  // A mistake record with no item (a hand-edited re-ask alone) has no case to rebuild: done, nothing shown.
  const source: CaseSource | null = record
    ? record.kind === "rule"
      ? { kind: "rule", topic: record.topic }
      : record.item === null
        ? null
        : { kind: "mistake", topic: record.topic, item: record.item }
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
