import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { lcg, loadGenerators } from "../src/content/generators";
import { loadTopics, subjectDir } from "../src/content/pack";
import type { Generated, Generator } from "../src/content/types";
import { normaliseAnswer as norm } from "../src/marking/normalise";

export { lcg };

export const RUNS = 300;

const UNIT =
  /\s*(cm³|cm²|m³|m²|cm|mm|km|kg|g\/cm³|kg\/m³|n\/m²|n\/cm²|m\/s²|m\/s|ml|litres|degrees|pounds|off|each|n|m|g|p)\.?$/i;
const NUMBER = /-?\d+(?:\.\d+)?/g;

/** Every number in a string, with the typographic minus read as a sign. */
function numbers(s: string): number[] {
  return (s.replace(/\u2212/g, "-").match(NUMBER) ?? []).map(Number);
}

function tail(working: string): string | null {
  const at = working.lastIndexOf("=");
  if (at === -1) return null;
  return working
    .slice(at + 1)
    .replace(/[.\s]+$/, "")
    .replace(UNIT, "")
    .trim();
}

const SHAPE: Record<string, (v: string) => boolean> = {
  number: (v) => norm(v) !== "" && Number.isFinite(Number(norm(v))),
  pi: (v) => /^-?\d+(?:\.\d+)?pi$/.test(norm(v)),
  ratio: (v) => /^\d+(?:\.\d+)?(?::\d+(?:\.\d+)?)+$/.test(norm(v)),
  fraction: (v) =>
    /^-?\d+\/\d+$/.test(norm(v)) && Number(norm(v).split("/")[1]) !== 0,
  text: (v) => typeof v === "string" && v.trim().length > 0,
};

/** The working's last "=" is followed by an accepted answer (for text, the working ends on one). */
function checkWorking(q: Generated, accepted: string[]): string | null {
  const first = q.answers[0] ?? "";
  if (q.type === "text") {
    const end = norm(q.working).replace(/\.$/, "");
    if (!accepted.some((a) => end.endsWith(a)))
      return `the working does not end on the answer "${first}"`;
    return null;
  }
  const t = tail(q.working);
  if (t === null) return 'the working has no "="';
  if (!accepted.includes(norm(t)))
    return `the working ends "= ${t}" but the answer is "${first}"`;
  return null;
}

/**
 * Three assertions per generated question, from the v1 tool: the answer is well formed for its type; the
 * working's last "=" is followed by an accepted answer; every number in the stem appears again in the
 * working. Plus: no named wrong answer is an accepted answer.
 */
export function checkOne(q: Generated): string[] {
  if (
    !q.stem ||
    !q.working ||
    !q.hint ||
    !Array.isArray(q.answers) ||
    !q.answers.length
  )
    return ["a field is missing"];
  const type = q.type ?? "number";
  const shape = SHAPE[type];
  if (!shape) return [`unknown type ${type}`];
  const problems: string[] = [];
  const first = q.answers[0] ?? "";
  if (!shape(first)) problems.push(`answer "${first}" is not a valid ${type}`);
  const accepted = q.answers.map(norm);
  const working = checkWorking(q, accepted);
  if (working) problems.push(working);
  const inWorking = new Set(numbers(q.working));
  for (const n of new Set(numbers(q.stem)))
    if (!inWorking.has(n))
      problems.push(`the stem uses ${n} and the working never does`);
  for (const key of Object.keys(q.wrong ?? {}))
    if (accepted.includes(norm(key)))
      problems.push(`wrong lists the correct answer "${key}"`);
  return problems;
}

/** `runs` seeded questions per generator through `checkOne`; each failure line carries the code and seed. */
export function checkGenerators(
  table: Record<string, Generator>,
  runs = RUNS,
): string[] {
  const failures: string[] = [];
  for (const code of Object.keys(table).sort((a, b) => a.localeCompare(b))) {
    const build = table[code];
    if (!build) continue;
    for (let i = 0; i < runs; i += 1) {
      const seed = (0x5eed + i * 7919) >>> 0;
      let q: Generated;
      try {
        q = build(lcg(seed));
      } catch (e) {
        failures.push(`${code} seed ${seed}: threw ${(e as Error).message}`);
        continue;
      }
      for (const m of checkOne(q))
        failures.push(
          `${code} seed ${seed}: ${m}\n    stem:    ${q.stem}\n    working: ${q.working}`,
        );
    }
  }
  return failures;
}

export function checkCoverage(
  codes: string[],
  expected: string[],
): { missing: string[]; extra: string[] } {
  return {
    missing: expected.filter((c) => !codes.includes(c)),
    extra: codes.filter((c) => !expected.includes(c)),
  };
}

/** U-codes from lesson file names, `0001-U349-...html` → `U349`. */
export function lessonCodes(dir: string): string[] {
  return readdirSync(dir)
    .map((f) => /^\d{4}-(U\d+)-/.exec(f)?.[1])
    .filter((c): c is string => c !== undefined)
    .sort((a, b) => a.localeCompare(b));
}

const SHOW = 12;

/** Every subject under content/ that ships a generators file. No argument: the gate covers all of them. */
function subjects(): string[] {
  return readdirSync("content")
    .filter((d) => existsSync(path.join("content", d, "generators.js")))
    .sort((a, b) => a.localeCompare(b));
}

if (import.meta.main) {
  let failed = false;
  for (const subject of subjects()) {
    const table = await loadGenerators(subject);
    const codes = Object.keys(table).sort((a, b) => a.localeCompare(b));
    const topics = await loadTopics(subject);
    const expected = [
      ...new Set([
        ...topics.flatMap((t) => t.aliases),
        ...lessonCodes(path.join(subjectDir(subject), "lessons")),
      ]),
    ].sort((a, b) => a.localeCompare(b));
    const failures = checkGenerators(table);
    const { missing, extra } = checkCoverage(codes, expected);
    const lines = [
      `${subject}: generators: ${codes.length}   topics and lessons: ${expected.length}   runs each: ${RUNS}`,
    ];
    if (missing.length)
      lines.push(`codes with no generator: ${missing.join(", ")}`);
    if (extra.length)
      lines.push(`generators with no topic or lesson: ${extra.join(", ")}`);
    for (const code of codes) {
      const n = failures.filter((f) => f.startsWith(`${code} `)).length;
      lines.push(`  ${code}  ${n === 0 ? "pass" : `${n} failed`}`);
    }
    console.log(lines.join("\n"));
    if (failures.length || missing.length || extra.length) {
      failed = true;
      console.log(`\n${failures.slice(0, SHOW).join("\n")}`);
      if (failures.length > SHOW)
        console.log(`... and ${failures.length - SHOW} more`);
      console.log(
        `\n${failures.length} failures across ${codes.length * RUNS} runs`,
      );
    } else console.log(`\nall ${codes.length * RUNS} runs pass`);
  }
  if (failed) process.exit(1);
}
