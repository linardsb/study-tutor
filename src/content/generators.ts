import path from "node:path";
import type { Generator } from "./types";

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
  await import(path.resolve(root, "content", subject, "generators.js"));
  const table = (globalThis as { GEN?: Record<string, Generator> }).GEN;
  if (!table)
    throw new Error(`content/${subject}/generators.js did not set GEN`);
  return table;
}
