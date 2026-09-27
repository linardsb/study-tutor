import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendEvent } from "../events/append";
import type { NewEvent } from "../events/types";
import { caseForDay, loadCasePack } from "./case";

const DAY = "2026-10-06";
const AT = () => `${DAY}T07:12:00Z`;
const pack = await loadCasePack("maths");

const first: NewEvent = {
  v: 1,
  type: "case",
  day: DAY,
  kind: "mistake",
  topic: "1MA1/R9/of-an-amount",
  item: "1MA1/R9/of-an-amount#1",
  pick: "That is half of 45, which is 50%. You want 20%.",
  bet: 3,
  correct: false,
  reask: false,
};
const again: NewEvent = {
  v: 1,
  type: "case",
  day: DAY,
  kind: "mistake",
  topic: "1MA1/R9/of-an-amount",
  pick: "No note needed. The answer is right.",
  bet: 2,
  correct: true,
  reask: true,
};

/** A realpathed temp dir (macOS maps /var to /private/var), removed afterwards. */
function withTemp(fn: (dir: string, data: string) => void | Promise<void>) {
  return async () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-case-")),
    );
    try {
      await fn(dir, path.join(dir, "data"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test("loadCasePack: 21 topics, 105 items, 21 generators, the same object on a second call", async () => {
  expect(pack.topics).toHaveLength(21);
  let total = 0;
  for (const items of pack.items.values()) total += items.length;
  expect(total).toBe(105);
  expect(Object.keys(pack.gens)).toHaveLength(21);
  expect(await loadCasePack("maths")).toBe(pack);
});

test(
  "an empty log gives a case, a re-ask, no record, a zero calibration, and creates no data/",
  withTemp((_dir, data) => {
    const r = caseForDay(data, pack, DAY);
    expect(r.day).toBe(DAY);
    expect(r.record).toBeNull();
    expect(r.source).not.toBeNull();
    expect(r.case?.options.length).toBeGreaterThanOrEqual(2);
    expect(r.reask).not.toBeNull();
    expect(r.calibration).toEqual({ predicted: 0, scored: 0, n: 0 });
    expect(fs.existsSync(data)).toBe(false);
  }),
);

test(
  "after a confident-wrong answer and its re-ask: the record's bets, the case rebuilt from the record's item, the calibration, and the next day on the seeded topic",
  withTemp((_dir, data) => {
    appendEvent(data, first, AT);
    appendEvent(data, again, AT);
    const r = caseForDay(data, pack, DAY);
    expect(r.record?.bets).toEqual([
      [3, false],
      [2, true],
    ]);
    expect(r.source).toEqual({
      kind: "mistake",
      topic: "1MA1/R9/of-an-amount",
      item: "1MA1/R9/of-an-amount#1",
    });
    expect(r.case?.item).toBe("1MA1/R9/of-an-amount#1");
    // derived: 3 + 2 predicted; only the bet-2 right answer scored
    expect(r.calibration).toEqual({ predicted: 5, scored: 2, n: 2 });
    const next = caseForDay(data, pack, "2026-10-07");
    expect(next.record).toBeNull();
    expect(next.source?.topic).toBe("1MA1/R9/of-an-amount");
  }),
);

test(
  "a record for an item no longer in the pack gives the record and no case",
  withTemp((_dir, data) => {
    appendEvent(data, { ...first, item: "1MA1/R9/of-an-amount#99" }, AT);
    const r = caseForDay(data, pack, DAY);
    expect(r.record?.item).toBe("1MA1/R9/of-an-amount#99");
    expect(r.case).toBeNull();
    expect(r.reask).not.toBeNull(); // the topic still exists, so the same-idea re-ask can be built
  }),
);
