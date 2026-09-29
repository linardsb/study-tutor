import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendEvent, readLines } from "../events/append";
import {
  PARENT_SLOTS,
  roll,
  roundOf,
  type SquadFile,
  type SquadRound,
  squadFile,
  squadRound,
} from "../flow/squad";
import { VERSION } from "../updates";
import { loadCasePack } from "./case";
import { postConfig } from "./config";
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
  joinSquad({ squad: " Year11 B", pupil: "Sam" }, data, DAY);
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
    expect(joinSquad({ squad: "b", pupil: "../x" }, data, DAY).status).toBe(
      400,
    );
    expect(joinSquad(null, data, DAY).status).toBe(400);
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

test(
  "14. no rename once the week's round is saved (PR #43 M1): a new name or squad is 409, so the old file is never counted as a friend",
  withTemp((_dir, data) => {
    join(data);
    post(data);
    const profile = () =>
      JSON.parse(fs.readFileSync(path.join(data, "profile.json"), "utf8"));
    const before = profile();
    const rename = (squad: string, pupil: string, day = DAY) =>
      joinSquad({ squad, pupil }, data, day);
    expect(rename("year11-b", "sammy").status).toBe(409);
    // the two-join path: another squad first, then back under the new name
    expect(rename("year11-c", "sammy").status).toBe(409);
    expect(profile()).toEqual(before);
    const view = getSquad(data, pack, DAY, true).body;
    expect(view.members).toEqual([]);
    expect(view.total).toEqual({ score: 4, of: 5, rounds: 1 });
    // the same name typed again is not a change; next Monday the name is free
    expect(rename("Year11 B", "SAM").status).toBe(200);
    expect(rename("year11-b", "sammy", "2026-10-12").status).toBe(200);
  }),
);

test(
  "15. a saved round keeps its own topic after an update moves the pick (PR #43 M3): mine's seeds, the view round and the comparison follow the event",
  withTemp((_dir, data) => {
    join(data);
    const other = "1MA1/R4";
    expect(other).not.toBe(round.topic);
    const was = roundOf("year11-b", WEEK, other);
    appendEvent(
      data,
      {
        v: 1,
        type: "squad",
        squad: "year11-b",
        week: WEEK,
        topic: other,
        score: 1,
        of: 5,
        answers: was.seeds.map((_, k) => ({
          answer: String(k),
          working: "",
          correct: k === 0,
        })),
      },
      AT,
    );
    put(data, "alex.json", friendFile("alex", 3));
    const view = getSquad(data, pack, DAY, true).body;
    expect(view.round?.topic).toBe(other);
    expect(view.round?.seeds).toEqual(was.seeds);
    expect(view.round?.parentSeeds).toEqual(was.parentSeeds);
    expect(view.mine?.seeds).toEqual(was.seeds);
    expect(view.members.map((m) => [m.pupil, m.comparable])).toEqual([
      ["alex", false],
    ]);
    expect(view.total).toEqual({ score: 1, of: 5, rounds: 1 });
    const own = JSON.parse(
      fs.readFileSync(path.join(folder(data), "sam.json"), "utf8"),
    );
    expect(own.seeds).toEqual(was.seeds);
  }),
);

test(
  "16. a friend's file over 64 KB, or with an answer over the page's cap, is unreadable (PR #43 L3)",
  withTemp((_dir, data) => {
    join(data);
    post(data);
    put(data, "big.json", { ...friendFile("big", 5), pad: "x".repeat(70_000) });
    const long = friendFile("long", 5);
    (long.answers[0] as { answer: string }).answer = "1".repeat(101);
    put(data, "long.json", long);
    const view = getSquad(data, pack, DAY, true).body;
    expect(view.members).toEqual([]);
    expect(view.unreadable).toBe(2);
    expect(view.total).toEqual({ score: 4, of: 5, rounds: 1 });
  }),
);

// #42: the parent's squad sync folder. Files sit directly in it as <pupil>.json.
const sync = (dir: string) => path.join(dir, "synced");
/** Sets the sync folder through the setup form, as a parent would. */
function setSync(dir: string, data: string, folderPath = sync(dir)) {
  fs.mkdirSync(folderPath, { recursive: true });
  const r = postConfig(
    { preset: "none", weeklyTarget: 3, squadFolder: folderPath },
    data,
  );
  expect(r.status).toBe(200);
}
/** A hand edit of config.json, past the setup form's check. */
function handSet(data: string, squadFolder: unknown) {
  fs.mkdirSync(data, { recursive: true });
  fs.writeFileSync(
    path.join(data, "config.json"),
    JSON.stringify({
      v: 1,
      preset: "none",
      base_url: "",
      key: "",
      model: "",
      cap: 1000,
      squadFolder,
    }),
  );
}
const putSync = (dir: string, name: string, body: unknown) =>
  fs.writeFileSync(
    path.join(sync(dir), name),
    typeof body === "string" ? body : JSON.stringify(body),
  );

test(
  "S1. sync folder: a friend's file placed there is in the compare view, and the pupil's own file is the only one written",
  withTemp((dir, data) => {
    join(data);
    setSync(dir, data);
    putSync(dir, "alex.json", friendFile("alex", 3));
    const alexBytes = fs.readFileSync(path.join(sync(dir), "alex.json"));
    const before = getSquad(data, pack, DAY, true).body;
    expect(before.folder).toBe(sync(dir));
    expect(before.members).toEqual([{ pupil: "alex", comparable: true }]);
    expect(post(data).status).toBe(201);
    const view = getSquad(data, pack, DAY, true).body;
    expect(view.shared).toBe(true);
    expect(view.members.map((m) => m.pupil)).toEqual(["alex"]);
    expect(view.total).toEqual({ score: 7, of: 10, rounds: 2 });
    expect(fs.readdirSync(sync(dir)).sort()).toEqual(["alex.json", "sam.json"]);
    expect(fs.readFileSync(path.join(sync(dir), "alex.json"))).toEqual(
      alexBytes,
    );
    expect(
      JSON.parse(fs.readFileSync(path.join(sync(dir), "sam.json"), "utf8")),
    ).toEqual(view.mine);
    expect(fs.existsSync(path.join(data, "squad"))).toBe(false);
  }),
);

test(
  "S2. sync folder: names that are not a slug (a sync client's copies) are ignored, not counted",
  withTemp((dir, data) => {
    join(data);
    setSync(dir, data);
    post(data);
    putSync(dir, "alex.json", friendFile("alex", 3));
    putSync(dir, "alex copy.json", friendFile("zed", 5));
    putSync(dir, "alex (1).json", friendFile("yan", 5));
    putSync(dir, "..json", friendFile("xi", 5));
    const view = getSquad(data, pack, DAY, true).body;
    expect(view.members.map((m) => m.pupil)).toEqual(["alex"]);
    expect(view.unreadable).toBe(0);
  }),
);

test.skipIf(process.platform === "win32")(
  "S3. sync folder: a symlinked friend's file is left out, and an own file planted as a symlink to config.json is never written through",
  withTemp((dir, data) => {
    join(data);
    setSync(dir, data);
    const outside = path.join(dir, "outside.json");
    fs.writeFileSync(outside, JSON.stringify(friendFile("mallory", 5)));
    fs.symlinkSync(outside, path.join(sync(dir), "mallory.json"));
    const config = path.join(data, "config.json");
    const configBytes = fs.readFileSync(config);
    fs.symlinkSync(config, path.join(sync(dir), "sam.json"));
    post(data);
    const view = getSquad(data, pack, DAY, true).body;
    expect(view.members).toEqual([]);
    expect(view.shared).toBe(false);
    expect(view.unreadable).toBe(2); // mallory.json and sam.json, both symlinks, as T14 counts them
    expect(fs.readFileSync(config)).toEqual(configBytes);
    expect(fs.readFileSync(outside, "utf8")).toContain("mallory");
  }),
);

test(
  "S4. traversal: a relative path or a `..` path onto data/ is refused on save, and on use when hand-edited",
  withTemp((dir, data) => {
    join(data);
    fs.mkdirSync(sync(dir));
    for (const squadFolder of [
      "../synced",
      "synced",
      path.join(sync(dir), "..", "data"),
    ]) {
      const r = postConfig(
        { preset: "none", weeklyTarget: 3, squadFolder },
        data,
      );
      expect(r.status).toBe(400);
      expect(JSON.stringify(r.body)).not.toContain(squadFolder);
    }
    expect(fs.existsSync(path.join(data, "config.json"))).toBe(false);
    for (const squadFolder of [
      "../synced",
      path.join(sync(dir), "..", "data"),
    ]) {
      handSet(data, squadFolder);
      const config = fs.readFileSync(path.join(data, "config.json"));
      post(data); // the second pass is a 409: the event is already in the log
      const view = getSquad(data, pack, DAY, true).body;
      expect(view.shared).toBe(false);
      expect(view.members).toEqual([]);
      expect(view.unreadable).toBe(1);
      expect(fs.readFileSync(path.join(data, "config.json"))).toEqual(config);
      expect(fs.existsSync(path.join(data, "sam.json"))).toBe(false);
      expect(fs.existsSync(path.join(data, "squad"))).toBe(false);
    }
  }),
);

test(
  "S5. a folder that is data/ or inside it is refused on save and on use; nothing is written in data/",
  withTemp((dir, data) => {
    join(data);
    const inside = path.join(data, "squad");
    fs.mkdirSync(inside);
    const tries = [data, inside];
    // macOS and Windows ignore case: DATA is data/ (realpath gives the stored case)
    if (process.platform !== "linux") tries.push(path.join(dir, "DATA"));
    for (const squadFolder of tries) {
      const r = postConfig(
        { preset: "none", weeklyTarget: 3, squadFolder },
        data,
      );
      expect(r.status).toBe(400);
    }
    expect(fs.existsSync(path.join(data, "config.json"))).toBe(false);
    handSet(data, data);
    const config = fs.readFileSync(path.join(data, "config.json"));
    post(data);
    const view = getSquad(data, pack, DAY, true).body;
    expect(view.unreadable).toBe(1);
    expect(view.shared).toBe(false);
    expect(fs.existsSync(path.join(data, "sam.json"))).toBe(false);
    expect(fs.readFileSync(path.join(data, "config.json"))).toEqual(config);
    expect(fs.readdirSync(inside)).toEqual([]);
  }),
);

test(
  "S6. a set folder that has gone (Drive not running) shows the note, writes nothing and does not fall back to data/",
  withTemp((dir, data) => {
    join(data);
    setSync(dir, data);
    fs.rmSync(sync(dir), { recursive: true });
    post(data);
    const view = getSquad(data, pack, DAY, true).body;
    expect(view.folder).toBe(sync(dir));
    expect(view.unreadable).toBe(1);
    expect(view.shared).toBe(false);
    expect(fs.existsSync(sync(dir))).toBe(false);
    expect(fs.existsSync(path.join(data, "squad"))).toBe(false);
  }),
);

test(
  "S7. unset again: an empty field puts squad files back in data/squad/<squad>, as T14",
  withTemp((dir, data) => {
    join(data);
    setSync(dir, data);
    expect(
      postConfig({ preset: "none", weeklyTarget: 3, squadFolder: "" }, data)
        .status,
    ).toBe(200);
    expect(
      JSON.parse(fs.readFileSync(path.join(data, "config.json"), "utf8")),
    ).not.toHaveProperty("squadFolder");
    put(data, "alex.json", friendFile("alex", 3));
    post(data);
    const view = getSquad(data, pack, DAY, true).body;
    expect(view.folder).toBe(folder(data));
    expect(view.shared).toBe(true);
    expect(view.members.map((m) => m.pupil)).toEqual(["alex"]);
    expect(fs.readdirSync(sync(dir))).toEqual([]);
  }),
);
