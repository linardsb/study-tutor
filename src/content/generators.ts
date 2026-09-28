import path from "node:path";
import { subjectDir } from "./pack";
import type { Generator } from "./types";

/** Seeded generator, so a failure can be reproduced from the seed printed with it. The browser copy is in app/quiz.js. */
export function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** One table per generators.js file. The file writes one global, so a repeat import must not re-read it. */
const tables = new Map<string, Record<string, Generator>>();

/**
 * Runs content/<subject>/generators.js under Bun (it assigns globalThis.GEN) and returns the table.
 * The path is resolved at runtime from `root`, so the file is read from disk beside the binary and is
 * never bundled into it (an update that replaces content/ reaches it, D10). A relative or template
 * import() fails inside a compiled binary: observed 2026-09-27, "Cannot find module" from /$bunfs/root.
 */
export async function loadGenerators(
  subject: string,
  root = process.cwd(),
): Promise<Record<string, Generator>> {
  const file = path.join(subjectDir(subject, root), "generators.js");
  const cached = tables.get(file);
  if (cached) return cached;
  await import(file);
  const table = (globalThis as { GEN?: Record<string, Generator> }).GEN;
  if (!table)
    throw new Error(`content/${subject}/generators.js did not set GEN`);
  tables.set(file, table);
  return table;
}
