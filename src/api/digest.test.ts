import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveSetup } from "../config";
import { digestMarkdown } from "../digest";
import { PROFILE_FILE, writeDataFile } from "../events/append";
import { getDigest } from "./digest";

const SIX_WEEKS = fs.readFileSync(
  path.join(import.meta.dir, "..", "events", "__fixtures__", "six-weeks.jsonl"),
  "utf8",
);
const RETEST_W46 =
  '{"v":1,"t":"2026-11-12T17:00:00Z","type":"retest","topic":"1MA1/R9","score":1,"of":3,"passed":false}\n';

/** A realpathed temp dir (macOS maps /var to /private/var), removed afterwards. */
function withTemp(fn: (data: string) => void) {
  return () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-digest-")),
    );
    try {
      fn(path.join(dir, "data"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}
const withLog = (fn: (data: string) => void) =>
  withTemp((data) => {
    fs.mkdirSync(data);
    fs.writeFileSync(path.join(data, "events.jsonl"), SIX_WEEKS);
    fn(data);
  });
const file = (data: string, week: string) =>
  path.join(data, "digest", `${week}.md`);
/** Every file under data/digest with its bytes, to show a call wrote nothing. */
const snapshot = (data: string) => {
  const dir = path.join(data, "digest");
  if (!fs.existsSync(dir)) return {};
  return Object.fromEntries(
    fs
      .readdirSync(dir)
      .sort()
      .map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]),
  );
};

test(
  "a current-week view returns this week and last week and writes both files",
  withLog((data) => {
    const { status, body } = getDigest(data, "2026-11-15", "2026-11-15");
    expect(status).toBe(200);
    expect(body.now.week).toBe("2026-W46");
    expect(body.last.week).toBe("2026-W45");
    expect(fs.readFileSync(file(data, "2026-W46"), "utf8")).toBe(
      digestMarkdown(body.now),
    );
    expect(fs.readFileSync(file(data, "2026-W45"), "utf8")).toBe(
      digestMarkdown(body.last),
    );
  }),
);

test.skipIf(process.platform === "win32")(
  "digest files are owner-only",
  withLog((data) => {
    getDigest(data, "2026-11-15", "2026-11-15");
    expect(fs.statSync(file(data, "2026-W46")).mode & 0o777).toBe(0o600);
  }),
);

test(
  "next week's view rewrites the week before as last week",
  withLog((data) => {
    getDigest(data, "2026-11-15", "2026-11-15");
    fs.appendFileSync(path.join(data, "events.jsonl"), RETEST_W46);
    const { body } = getDigest(data, "2026-11-18", "2026-11-18");
    expect(body.last.week).toBe("2026-W46");
    expect(body.last.lines).toContain("Re-tests: 2 taken, 1 passed.");
    expect(fs.readFileSync(file(data, "2026-W46"), "utf8")).toBe(
      digestMarkdown(body.last),
    );
    expect(fs.readFileSync(file(data, "2026-W47"), "utf8")).toBe(
      digestMarkdown(body.now),
    );
  }),
);

test(
  "a day in another week returns the digest and writes nothing",
  withLog((data) => {
    getDigest(data, "2026-11-18", "2026-11-18");
    const before = snapshot(data);
    const { body } = getDigest(data, "2026-11-01", "2026-11-18");
    expect(body.now.week).toBe("2026-W44");
    expect(snapshot(data)).toEqual(before);
    expect(Object.keys(before)).toEqual(["2026-W46.md", "2026-W47.md"]);
  }),
);

test(
  "a past week's spend line names the month of its Sunday, whichever day was asked",
  withLog((data) => {
    // W44 runs Monday 26 October to Sunday 1 November.
    for (const day of ["2026-10-27", "2026-11-01"])
      expect(getDigest(data, day, "2026-11-18").body.now.lines).toContain(
        "Model use in November 2026: 600 tokens. No model is set up.",
      );
  }),
);

test(
  "an empty log returns zeros and creates no data folder",
  withTemp((data) => {
    const { body } = getDigest(data, "2026-11-15", "2026-11-15");
    expect(body.now.lines[0]).toBe("Practice days: 0 of 3.");
    expect(body.now.lines).toContain("Re-tests: none this week.");
    expect(fs.existsSync(data)).toBe(false);
  }),
);

test(
  "the parent's weekly target is the figure days are counted against",
  withLog((data) => {
    writeDataFile(data, PROFILE_FILE, '{"weeklyTarget":5}\n');
    const { body } = getDigest(data, "2026-11-15", "2026-11-15");
    expect(body.now.lines[0]).toBe("Practice days: 1 of 5.");
  }),
);

test(
  "a No model save keeps a cap, and the digest still says no model is set up",
  withLog((data) => {
    expect(saveSetup(data, { preset: "none", weeklyTarget: 3 }).ok).toBe(true);
    const { body } = getDigest(data, "2026-11-15", "2026-11-15");
    expect(body.now.lines).toContain(
      "Model use in November 2026: 600 tokens. No model is set up.",
    );
  }),
);
