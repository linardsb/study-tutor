import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendEvent } from "../events/append";
import type { NewEvent } from "../events/types";
import { caseForDay, loadCasePack, loadPacks } from "./case";

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

test("loadCasePack: 58 topics, 105 items, 21 generators, the same object on a second call", async () => {
  expect(pack.topics).toHaveLength(58); // derived: 21 + 37 Year 11 rows (a3 plan)
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

/** A tmp root with content/<subject>/topics.json and courses.json; by default one untiered course per topic prefix. No generators.js unless written. */
function writeSubject(
  dir: string,
  subject: string,
  topics: { id: string; [k: string]: unknown }[],
  courses: object[] = [...new Set(topics.map((t) => t.id.split("/")[0]))].map(
    (spec) => ({ spec, board: "B", title: spec, tiers: [] }),
  ),
) {
  const d = path.join(dir, "content", subject);
  fs.mkdirSync(d, { recursive: true });
  fs.writeFileSync(path.join(d, "topics.json"), JSON.stringify(topics));
  fs.writeFileSync(path.join(d, "courses.json"), JSON.stringify(courses));
}
const row = (id: string, alias: string) => ({
  id,
  title: id,
  aliases: [alias],
  prerequisites: [],
  tier: "F",
});

test("loadPacks: the repo's subjects merged, each topic mapped to its subject", async () => {
  const { pack: all, subjects, courses } = await loadPacks();
  expect(subjects.get("1MA1/R4")).toBe("maths");
  expect(courses.map((c) => c.spec)).toEqual(["8700", "8702", "1MA1", "8464"]);
  expect(subjects.get("8702/3.1.1/macbeth")).toBe("english");
  for (const t of pack.topics) expect(all.topics).toContain(t);
  expect(Object.keys(all.gens)).toEqual(
    expect.arrayContaining(Object.keys(pack.gens)),
  );
  expect((await loadPacks()).pack).toBe(all);
});

test(
  "loadPacks: an alias in two subjects is refused, naming both files",
  withTemp(async (dir) => {
    writeSubject(dir, "aaa", [row("AA1/X1", "SAME")]);
    writeSubject(dir, "bbb", [row("BB1/X1", "SAME")]);
    await expect(loadPacks(dir)).rejects.toThrow(
      "content/bbb/topics.json: alias SAME is also in content/aaa",
    );
  }),
);

test(
  "loadPacks: a subject with no generators.js loads with no generators; a non-word folder is skipped",
  withTemp(async (dir) => {
    writeSubject(dir, "zz", [row("ZZ1/X1", "ZZX1")]);
    fs.mkdirSync(path.join(dir, "content", ".DS_Store"));
    fs.mkdirSync(path.join(dir, "content", "e1"));
    const { pack: p, subjects } = await loadPacks(dir);
    expect(p.gens).toEqual({});
    expect(p.items.get("ZZ1/X1")).toEqual([]);
    expect([...subjects]).toEqual([["ZZ1/X1", "zz"]]);
  }),
);

test(
  "loadPacks: a course spec in two subjects is refused, naming both",
  withTemp(async (dir) => {
    const course = { spec: "AA1", board: "B", title: "T", tiers: [] };
    writeSubject(dir, "aaa", [row("AA1/X1", "A1")], [course]);
    writeSubject(
      dir,
      "bbb",
      [row("BB1/X1", "B1")],
      [course, { ...course, spec: "BB1" }],
    );
    await expect(loadPacks(dir)).rejects.toThrow(
      "content/bbb/courses.json: course AA1 is also in content/aaa",
    );
  }),
);

test(
  "loadPacks: a topic whose spec is not a course of its pack is refused",
  withTemp(async (dir) => {
    writeSubject(
      dir,
      "aaa",
      [row("AA1/X1", "A1"), row("CC1/X1", "C1")],
      [{ spec: "AA1", board: "B", title: "T", tiers: [] }],
    );
    await expect(loadPacks(dir)).rejects.toThrow(
      "content/aaa/topics.json: topic CC1/X1 has spec CC1, not in content/aaa/courses.json",
    );
  }),
);

test(
  "loadPacks: a topic tier its course does not have is refused",
  withTemp(async (dir) => {
    writeSubject(
      dir,
      "aaa",
      [{ ...row("AA1/X1", "A1"), tier: "H" }],
      [{ spec: "AA1", board: "B", title: "T", tiers: ["F"] }],
    );
    await expect(loadPacks(dir)).rejects.toThrow(
      "content/aaa/topics.json: topic AA1/X1 is tier H, not a tier of AA1",
    );
  }),
);

test(
  "caseForDay: a new case is picked from the offer pack; a saved one is rebuilt from the full pack",
  withTemp((_dir, data) => {
    const only = pack.topics.find((t) => t.id === "1MA1/R9/of-an-amount");
    if (!only) throw new Error("fixture topic missing");
    const offer = { ...pack, topics: [only] };
    expect(caseForDay(data, pack, DAY, offer).source?.topic).toBe(only.id);
    appendEvent(data, { ...first, topic: "1MA1/R4", item: "1MA1/R4#1" }, AT);
    const r = caseForDay(data, pack, DAY, offer);
    expect(r.source?.topic).toBe("1MA1/R4");
    expect(r.case).not.toBeNull();
  }),
);
