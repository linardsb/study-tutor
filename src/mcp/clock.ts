/** GCSE is England's exam, so the pupil's calendar day is London's, whatever the PC's zone. */
export const TIME_ZONE = "Europe/London";

/** UTC now to the second, e.g. 2026-10-03T17:42:10Z. The only clock events are stamped with. */
export function utcNow(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

// Built once. If the runtime had no time zone data this throws; fall back to the UTC day.
const london = (() => {
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: TIME_ZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
  } catch {
    return null;
  }
})();

/** YYYY-MM-DD in London of a UTC timestamp: 2026-10-11T23:30:00Z is 2026-10-12 (BST). */
export function localDay(t: string): string {
  if (london === null) return t.slice(0, 10);
  const p: Record<string, string> = {};
  for (const part of london.formatToParts(new Date(t)))
    p[part.type] = part.value;
  return `${p.year}-${p.month}-${p.day}`;
}

/** YYYY-MM-DD n days after a YYYY-MM-DD. Calendar arithmetic, so no DST effect. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** ISO 8601 week of a YYYY-MM-DD, e.g. 2026-W41. Week 1 holds the year's first Thursday. */
export function isoWeek(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7) + 3); // Thursday of this week
  const year = d.getUTCFullYear();
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const week =
    1 +
    Math.round(
      ((d.getTime() - jan4.getTime()) / 864e5 -
        3 +
        ((jan4.getUTCDay() + 6) % 7)) /
        7,
    );
  return `${year}-W${String(week).padStart(2, "0")}`;
}
