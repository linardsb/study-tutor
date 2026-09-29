import { readConfig, readProfile } from "../config";
import { buildDigest, type Digest, digestMarkdown, mondayOf } from "../digest";
import { makeDataDir, readLines, writeDataFile } from "../events/append";
import { replay } from "../events/replay";
import { addDays, isoWeek } from "../mcp/clock";

export type DigestView = { now: Digest; last: Digest };
export const DIGEST_DIR = "digest";

/**
 * This week's digest and last week's, for `day`. When `day` is in the real current week (`today`),
 * rewrites data/digest/<week>.md for both; otherwise writes nothing. Nothing for an empty log.
 * The file name comes from isoWeek(), never from the request.
 */
export function getDigest(
  dataDir: string,
  day: string,
  today: string,
): { status: 200; body: DigestView } {
  const lines = readLines(dataDir);
  const state = replay(lines);
  const target = readProfile(dataDir).weeklyTarget;
  const config = readConfig(dataDir);
  // A "No model" save keeps its cap, so the preset decides, not the cap.
  const cap = config === null || config.preset === "none" ? null : config.cap;
  const current = isoWeek(day) === isoWeek(today);
  // The reference day names the spend month: today in the current week, the Sunday otherwise (plan D6).
  const now = buildDigest(
    state,
    current ? day : addDays(mondayOf(day), 6),
    target,
    cap,
  );
  const last = buildDigest(state, addDays(mondayOf(day), -1), target, cap);
  if (lines.length > 0 && current) {
    makeDataDir(dataDir, DIGEST_DIR);
    for (const d of [now, last])
      writeDataFile(dataDir, `${DIGEST_DIR}/${d.week}.md`, digestMarkdown(d));
  }
  return { status: 200, body: { now, last } };
}
