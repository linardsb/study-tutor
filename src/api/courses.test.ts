import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { Chosen, Course } from "../content/types";
import { PROFILE_FILE, writeDataFile } from "../events/append";
import { getCourses, saveCourses } from "./courses";

const courses: Course[] = [
  {
    spec: "1MA1",
    board: "Edexcel",
    title: "GCSE Mathematics",
    tiers: ["F", "H"],
  },
  { spec: "AA1", board: "B", title: "Untiered", tiers: [] },
  { spec: "HH1", board: "B", title: "Higher only", tiers: ["H"] },
];

/** A realpathed temp dir, removed afterwards. */
function withTemp(fn: (data: string) => void) {
  return () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-courses-")),
    );
    try {
      fn(path.join(dir, "data"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}
const profileOf = (data: string) =>
  JSON.parse(fs.readFileSync(path.join(data, PROFILE_FILE), "utf8"));

const REFUSED: [unknown, string][] = [
  [null, "Send a list of courses."],
  [{ preset: "nope", key: "sk-SECRET" }, "Send a list of courses."],
  [{ courses: "1MA1" }, "Send a list of courses."],
  [{ courses: [] }, "Pick at least one course."],
  [{ courses: [{ spec: "ZZZ9-SECRET" }] }, "That course is not in this tutor."],
  [{ courses: ["1MA1"] }, "That course is not in this tutor."],
  [
    { courses: [{ spec: "1MA1" }] },
    "Pick Foundation or Higher for GCSE Mathematics.",
  ],
  [
    { courses: [{ spec: "1MA1", tier: "X-SECRET" }] },
    "Pick Foundation or Higher for GCSE Mathematics.",
  ],
  [
    { courses: [{ spec: "HH1", tier: "F" }] },
    "Pick Foundation or Higher for Higher only.",
  ],
  [
    { courses: [{ spec: "AA1", tier: "F" }] },
    "Untiered has no Foundation or Higher.",
  ],
  [{ courses: [{ spec: "AA1" }, { spec: "AA1" }] }, "Pick each course once."],
];

test(
  "saveCourses: each refusal is one sentence, echoes nothing posted, and leaves profile.json byte-identical",
  withTemp((data) => {
    for (const [body, error] of REFUSED)
      expect(saveCourses(body, data, courses)).toEqual({
        status: 400,
        body: { error },
      });
    expect(fs.existsSync(path.join(data, PROFILE_FILE))).toBe(false);
    const before = '{"weeklyTarget":5,"courses":[{"spec":"AA1"}]}\n';
    writeDataFile(data, PROFILE_FILE, before);
    for (const [body, error] of REFUSED) {
      const r = saveCourses(body, data, courses);
      expect(r.body).toEqual({ error });
      expect(JSON.stringify(r.body)).not.toContain("SECRET");
    }
    expect(fs.readFileSync(path.join(data, PROFILE_FILE), "utf8")).toBe(before);
  }),
);

test(
  "saveCourses: a save keeps every other profile key; getCourses reads it back",
  withTemp((data) => {
    writeDataFile(
      data,
      PROFILE_FILE,
      JSON.stringify({ weeklyTarget: 5, squad: "y11", pupil: "sam" }),
    );
    const posted: Chosen[] = [{ spec: "1MA1", tier: "H" }, { spec: "AA1" }];
    expect(saveCourses({ courses: posted }, data, courses)).toEqual({
      status: 200,
      body: { chosen: posted },
    });
    expect(profileOf(data)).toEqual({
      weeklyTarget: 5,
      squad: "y11",
      pupil: "sam",
      courses: posted,
    });
    expect(getCourses(data, courses).body).toEqual({ courses, chosen: posted });
  }),
);

test(
  "saveCourses: on a fresh data/ the default weekly target is written beside the courses",
  withTemp((data) => {
    expect(getCourses(data, courses).body.chosen).toEqual([]);
    saveCourses({ courses: [{ spec: "1MA1", tier: "F" }] }, data, courses);
    expect(profileOf(data)).toEqual({
      weeklyTarget: 3,
      courses: [{ spec: "1MA1", tier: "F" }],
    });
  }),
);
