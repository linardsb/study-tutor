/**
 * The parent digest: five plain facts about one ISO week, built from replayed state. Pure: no clock,
 * no file, no model. The markdown file and the page both render the same lines (plan D8).
 */
import type { State } from "./events/replay";
import { JOB_REASONS } from "./events/types";
import { addDays, isoWeek } from "./mcp/clock";

export type Digest = { week: string; title: string; lines: string[] };

// No Intl: the text must not depend on the ICU build of the Mac or Windows binary.
const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Plain words for each recorded reason. Several reasons share a label; labels are summed. */
export const REASON_TEXT: Record<(typeof JOB_REASONS)[number], string> = {
  cap: "monthly cap reached",
  timeout: "timed out",
  network: "no connection",
  http: "model service refused the call",
  "not-json": "reply could not be read",
  "bad-response": "reply could not be read",
  shape: "reply could not be read",
  guard: "reply held back by the tutor's checks",
};

/** Monday of the ISO week holding `day`. */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  return addDays(day, -((d.getUTCDay() + 6) % 7));
}

const n = (x: number) => x.toLocaleString("en-GB");
const monthName = (ym: string) =>
  `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/** The digest for the ISO week of `day`. `cap` null means no model is set up. */
export function buildDigest(
  state: State,
  day: string,
  target: number,
  cap: number | null,
): Digest {
  const week = isoWeek(day);
  const month = day.slice(0, 7);
  const monday = mondayOf(day);
  const title = `Week of Monday ${Number(monday.slice(8, 10))} ${monthName(monday.slice(0, 7))}`;
  const lines = [
    `Practice days: ${state.flame[week]?.length ?? 0} of ${target}.`,
  ];

  const r = state.retests[week];
  lines.push(
    r === undefined || r.taken === 0
      ? "Re-tests: none this week."
      : `Re-tests: ${r.taken} taken, ${r.passed} passed.`,
  );

  // Examiner mode (O3) is in use once any week has a photo; then every digest carries the line.
  if (Object.keys(state.photos).length > 0) {
    const p = state.photos[week];
    if (p === undefined || p.taken === 0) lines.push("Photos: none this week.");
    else if (p.marked === 0)
      lines.push(`Photos: ${p.taken} taken, none marked yet.`);
    else
      lines.push(
        `Photos: ${p.taken} taken, ${p.marked} marked. Marks left on the table: ${p.of - p.marks} of ${p.of}.`,
      );
  }

  const tokens = n(state.tokens[month] ?? 0);
  lines.push(
    cap === null
      ? `Model use in ${monthName(month)}: ${tokens} tokens. No model is set up.`
      : `Model use in ${monthName(month)}: ${tokens} of the ${n(cap)} token cap.`,
  );

  const failed = state.failed[week] ?? {};
  const byLabel = new Map<string, number>();
  for (const reason of JOB_REASONS) {
    const count = failed[reason] ?? 0;
    if (count === 0) continue;
    const label = REASON_TEXT[reason];
    byLabel.set(label, (byLabel.get(label) ?? 0) + count);
  }
  const total = [...byLabel.values()].reduce((a, b) => a + b, 0);
  lines.push(
    total === 0
      ? "Model calls that did not work: none."
      : `Model calls that did not work: ${total} (${[...byLabel]
          .map(([label, count]) => `${label} ${count}`)
          .join(", ")}). The tutor carried on without the model.`,
  );

  return { week, title, lines };
}

/** The digest as the markdown written to data/digest/<week>.md. */
export function digestMarkdown(d: Digest): string {
  return `# ${d.title}\n\n${d.lines.map((l) => `- ${l}`).join("\n")}\n`;
}
