import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendEvent, readLines } from "../events/append";
import {
  PARENT_SLOTS,
  roll,
  type SquadFile,
  type SquadRound,
  squadFile,
  squadRound,
} from "../flow/squad";
import { VERSION } from "../updates";
import { loadCasePack } from "./case";
import { postEvent } from "./event";
import { getSquad, joinSquad, postSquad } from "./squad";

const pack = await loadCasePack("maths");
const DAY = "2026-10-10"; // Saturday of 2026-W41
const WEEK = "2026-W41";
const AT = () => "2026-10-10T11:00:00Z";
const round = squadRound("year11-b", WEEK, pack) as SquadRound;
const right = roll(round, pack).map((q) => q.answers[0] as string);

/** Four right answers and one wrong, each with a line of working. */
const answers = right.map((a, k) => ({
  answer: k === 3 ? "nope" : a,
  working: `step ${k}`,
}));

/** A realpathed temp dir (macOS maps /var to /private/var), removed afterwards. */
function withTemp(fn: (dir: string, data: string) => void | Promise<void>) {
  return async () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-squad-")),
    );
    try {
      await fn(dir, path.join(dir, "data"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

const join = (data: string) =>
  joinSquad({ squad: " Year11 B", pupil: "Sam" }, data);
const post = (data: string) =>
  postSquad({ week: WEEK, answers }, data, pack, DAY, AT);
const squadLines = (data: string) =>
  readLines(data)
    .map((l) => JSON.parse(l))
    .filter((e) => e.type === "squad");
const folder = (data: string) => path.join(data, "squad", "year11-b");

/** A friend's file as their tutor would write it: every answer given, `score` of them right. */
function friendFile(pupil: string, score: number, over = {}): SquadFile {
  return {
    v: 1,
    app: "0.1.0",
    squad: "year11-b",
    pupil,
    week: WEEK,
    topic: round.topic,
    seeds: round.seeds,
    answers: right.map((a, k) => ({
      answer: k < score ? a : "0",
      working: `${pupil} ${k}`,
      correct: k < score,
    })),
    score,
    of: right.length,
    ...over,
  };
}
const put = (data: string, name: string, body: unknown) => {
  fs.mkdirSync(folder(data), { recursive: true });
  fs.writeFileSync(
    path.join(folder(data), name),
    typeof body === "string" ? body : JSON.stringify(body),
  );
};

test(
  "1. no profile: 200, profile null, nothing built, and no data/ created",
  withTemp((_dir, data) => {
    const r = getSquad(data, pack, DAY, true);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      day: DAY,
      week: WEEK,
      daysLeft: 2,
      profile: null,
      folder: null,
      round: null,
      mine: null,
      members: [],
      total: { score: 0, of: 0, rounds: 0 },
    });
    expect(fs.existsSync(data)).toBe(false);
  }),
);

test(
  "2. join: slugs into profile.json with the weekly target kept; a path-shaped name is refused and the profile unchanged",
  withTemp((_dir, data) => {
    fs.mkdirSync(data);
    fs.writeFileSync(
      path.join(data, "profile.json"),
      JSON.stringify({ weeklyTarget: 5 }),
    );
    expect(join(data)).toEqual({
      status: 200,
      body: { profile: { squad: "year11-b", pupil: "sam" } },
    });
    const saved = () =>
      JSON.parse(fs.readFileSync(path.join(data, "profile.json"), "utf8"));
    expect(saved()).toEqual({
      weeklyTarget: 5,
      squad: "year11-b",
      pupil: "sam",
    });
    const before = saved();
    expect(joinSquad({ squad: "b", pupil: "../x" }, data).status).toBe(400);
    expect(joinSquad(null, data).status).toBe(400);
    expect(saved()).toEqual(before);
    const view = getSquad(data, pack, DAY, true).body;
    expect(view.folder).toBe(folder(data));
    expect(view.round).toMatchObject({
      topic: round.topic,
      seeds: round.seeds,
      title: "Percentage of an amount",
    });
  }),
);

test(
  "3. a round with four right: 201, one squad line marked by the server with working kept, and the file equals the projection",
  withTemp((_dir, data) => {
    join(data);
    const r = post(data);
    expect(r.status).toBe(201);
    const lines = squadLines(data);
    expect(lines).toHaveLength(1);
    const line = lines[0];
    expect(line).toMatchObject({ score: 4, of: 5, topic: round.topic });
    expect(line.answers.map((a: { correct: boolean }) => a.correct)).toEqual([
      true,
      true,
      true,
      false,
      true,
    ]);
    expect(line.answers[2].working).toBe("step 2");
    const file = JSON.parse(
      fs.readFileSync(path.join(folder(data), "sam.json"), "utf8"),
    );
    const expected = squadFile(
      { ...line, t: AT() },
      "sam",
      round.seeds,
      VERSION,
    );
    expect(file).toEqual(expected);
    const view = (r.body as { mine: SquadFile; shared: boolean }).mine;
    expect(view).toEqual(expected);
    expect((r.body as { shared: boolean }).shared).toBe(true);
  }),
);

test(
  "4. a second round in the same week: 409, still one squad line",
  withTemp((_dir, data) => {
    join(data);
    post(data);
    const again = post(data);
    expect(again).toEqual({
      status: 409,
      body: { error: "You have done this week's round." },
    });
    expect(squadLines(data)).toHaveLength(1);
  }),
);

test(
  "5. a week mismatch is 409 and a bad body 400, with nothing written; no profile is 400",
  withTemp((_dir, data) => {
    expect(post(data).status).toBe(400);
    join(data);
    const stale = postSquad({ week: "2026-W40", answers }, data, pack, DAY, AT);
    expect(stale.status).toBe(409);
    for (const bad of [
      null,
      { week: WEEK },
      { week: WEEK, answers: answers.slice(1) },
      {
        week: WEEK,
        answers: [...answers.slice(1), { answer: 1, working: "" }],
      },
      {
        week: WEEK,
        answers: [
          ...answers.slice(1),
          { answer: "x".repeat(101), working: "" },
        ],
      },
      {
        week: WEEK,
        answers: [
          ...answers.slice(1),
          { answer: "1", working: "x".repeat(501) },
        ],
      },
    ])
      expect(postSquad(bad, data, pack, DAY, AT).status).toBe(400);
    expect(squadLines(data)).toHaveLength(0);
    expect(fs.existsSync(folder(data))).toBe(false);
  }),
);

test(
  "6. guard: a friend's answers are withheld until this pupil's own round is in the log",
  withTemp((_dir, data) => {
    join(data);
    put(data, "alex.json", friendFile("alex", 3));
    const before = getSquad(data, pack, DAY, true).body;
    expect(before.members).toEqual([{ pupil: "alex", comparable: true }]);
    expect("answers" in (before.members[0] as object)).toBe(false);
    expect(before.total).toEqual({ score: 3, of: 5, rounds: 1 });
    expect(JSON.stringify(before)).not.toContain("alex 0");
    const after = post(data).body as ReturnType<typeof getSquad>["body"];
    expect(after.members[0]?.answers).toEqual(friendFile("alex", 3).answers);
    expect(after.total).toEqual({ score: 7, of: 10, rounds: 2 });
  }),
);

test.skipIf(process.platform === "win32")(
  "7. degrade: bad JSON, a bad shape, a symlink out, a copy of your own name, another squad's file and a duplicate pupil are counted as unreadable; another week is left out silently",
  withTemp((dir, data) => {
    join(data);
    post(data);
    put(data, "alex.json", friendFile("alex", 3));
    put(data, "alex2.json", friendFile("alex", 5));
    put(data, "bad.json", "{");
    put(data, "shape.json", { v: 1 });
    put(data, "me.json", friendFile("sam", 5));
    put(data, "old.json", friendFile("olly", 2, { week: "2026-W40" }));
    put(data, "notes.txt", "hello");
    put(data, "kit.json", friendFile("kit", 5, { squad: "year11-c" }));
    const outside = path.join(dir, "outside.json");
    fs.writeFileSync(outside, JSON.stringify(friendFile("mallory", 5)));
    fs.symlinkSync(outside, path.join(folder(data), "link.json"));
    const r = getSquad(data, pack, DAY, true);
    expect(r.status).toBe(200);
    expect(r.body.members.map((m) => m.pupil)).toEqual(["alex"]);
    // alex2.json is the duplicate: alex.json sorts first by file name
    expect(r.body.members[0]?.answers?.[4]?.correct).toBe(false);
    expect(r.body.unreadable).toBe(6);
    expect(r.body.total).toEqual({ score: 7, of: 10, rounds: 2 });
  }),
);

test(
  "8. a friend on another topic is listed as not comparable and left out of the total",
  withTemp((_dir, data) => {
    join(data);
    post(data);
    put(data, "zoe.json", friendFile("zoe", 5, { topic: "1MA1/N1" }));
    const view = getSquad(data, pack, DAY, true).body;
    expect(view.members.map((m) => [m.pupil, m.comparable])).toEqual([
      ["zoe", false],
    ]);
    expect(view.total).toEqual({ score: 4, of: 5, rounds: 1 });
  }),
);

test(
  "9. no squad folder at all: 200 and solo",
  withTemp((_dir, data) => {
    join(data);
    const before = getSquad(data, pack, DAY, false).body;
    expect(before.members).toEqual([]);
    expect(before.total).toEqual({ score: 0, of: 0, rounds: 0 });
    expect(fs.existsSync(path.join(data, "squad"))).toBe(false);
    post(data);
    fs.rmSync(path.join(data, "squad"), { recursive: true });
    const after = getSquad(data, pack, DAY, false).body;
    expect(after.members).toEqual([]);
    expect(after.total).toEqual({ score: 4, of: 5, rounds: 1 });
  }),
);

test.skipIf(process.platform === "win32")(
  "9b. a squad folder symlinked out of data: 200, solo, and one unreadable for the note",
  withTemp((dir, data) => {
    join(data);
    const outside = path.join(dir, "synced");
    fs.mkdirSync(outside);
    fs.writeFileSync(
      path.join(outside, "alex.json"),
      JSON.stringify(friendFile("alex", 3)),
    );
    fs.mkdirSync(path.join(data, "squad"));
    fs.symlinkSync(outside, folder(data));
    const view = getSquad(data, pack, DAY, true).body;
    expect(view.members).toEqual([]);
    expect(view.unreadable).toBe(1);
  }),
);

test(
  "10. self-heal: a deleted own file is rewritten by a heal GET and reported missing by a read-only one",
  withTemp((_dir, data) => {
    join(data);
    post(data);
    const own = path.join(folder(data), "sam.json");
    fs.rmSync(own);
    const still = getSquad(data, pack, DAY, false).body;
    expect(still.shared).toBe(false);
    expect(fs.existsSync(own)).toBe(false);
    const healed = getSquad(data, pack, DAY, true).body;
    expect(healed.shared).toBe(true);
    expect(JSON.parse(fs.readFileSync(own, "utf8"))).toEqual(healed.mine);
  }),
);

test(
  "10b. no cross-week heal: a look at last week leaves this week's file byte-identical; a corrupt file is healed only by a heal GET",
  withTemp((_dir, data) => {
    join(data);
    post(data);
    const own = path.join(folder(data), "sam.json");
    const bytes = fs.readFileSync(own);
    const last = getSquad(data, pack, "2026-10-03", false).body;
    expect(last.week).toBe("2026-W40");
    expect(last.mine).toBeNull();
    expect(fs.readFileSync(own)).toEqual(bytes);
    fs.writeFileSync(own, "{");
    expect(getSquad(data, pack, DAY, false).body.shared).toBe(false);
    expect(fs.readFileSync(own, "utf8")).toBe("{");
    expect(getSquad(data, pack, DAY, true).body.shared).toBe(true);
    expect(fs.readFileSync(own)).toEqual(bytes);
  }),
);

test(
  "11. the file write fails: 201, shared false, and the squad line is saved",
  withTemp((_dir, data) => {
    join(data);
    fs.mkdirSync(path.join(data, "squad"));
    fs.writeFileSync(folder(data), "not a folder");
    const r = post(data);
    expect(r.status).toBe(201);
    expect((r.body as { shared: boolean }).shared).toBe(false);
    expect(squadLines(data)).toHaveLength(1);
  }),
);

test(
  "12. /api/event refuses a squad body",
  withTemp((_dir, data) => {
    join(data);
    const r = postEvent(
      {
        v: 1,
        type: "squad",
        squad: "year11-b",
        week: WEEK,
        topic: round.topic,
        score: 0,
        of: 0,
        answers: [],
      },
      data,
      pack.topics,
      AT,
    );
    expect(r.status).toBe(400);
    expect(squadLines(data)).toHaveLength(0);
  }),
);

test(
  "13. parentDone: only a parent-round teachback (no item, this topic, of 3) in this London ISO week",
  withTemp((_dir, data) => {
    join(data);
    post(data);
    const done = () => getSquad(data, pack, DAY, false).body.parentDone;
    expect(done()).toBe(false);
    const tb = (over: Record<string, unknown>, t: string) =>
      appendEvent(
        data,
        {
          v: 1,
          type: "teachback",
          topic: round.topic,
          marks: 2,
          of: PARENT_SLOTS,
          ...over,
        } as never,
        () => t,
      );
    tb({ topic: "1MA1/N1" }, "2026-10-10T12:00:00Z");
    tb({}, "2026-10-04T12:00:00Z"); // last week
    tb({ item: "maths/x/1", marks: 3, of: 4 }, "2026-10-10T12:00:00Z"); // a chat teach-back
    tb({ item: "maths/x/1" }, "2026-10-10T12:00:00Z");
    // Sunday 23:30 UTC is Monday 00:30 in London (BST): next week's
    tb({}, "2026-10-11T23:30:00Z");
    expect(done()).toBe(false);
    tb({}, "2026-10-10T12:00:00Z");
    expect(done()).toBe(true);
  }),
);
