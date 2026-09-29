/** Dan's rank (O2), pure and import-free so replay and the coach flow can both read it. */
export const RANKS = [
  "Noob",
  "Learner",
  "Getting there",
  "Steady",
  "Sorted",
] as const; // pupil-facing, .claude/rules/content.md
export const PER_RANK = 3; // expected: catches per rank; E3 reads the rate, not this
export type Rank = { level: number; name: string; toNext: number | null }; // toNext null at the top

export const rankFor = (caught: number): number =>
  Math.min(RANKS.length - 1, Math.floor(caught / PER_RANK));

export function rank(caught: number): Rank {
  const level = rankFor(caught);
  const top = level === RANKS.length - 1;
  return {
    level,
    name: RANKS[level] as string,
    toNext: top ? null : (level + 1) * PER_RANK - caught,
  };
}
