import fs from "node:fs";
import path from "node:path";
import { readProfile } from "../config";
import type { CasePack } from "../content/types";
import {
  appendEvent,
  listDataDir,
  makeDataDir,
  PROFILE_FILE,
  readDataJson,
  readLines,
  resolveInData,
  writeDataFile,
} from "../events/append";
import {
  type Event,
  parseEvent,
  type SquadAnswer,
  type SquadV1,
} from "../events/types";
import {
  comparable,
  daysLeft,
  MAX_ANSWER,
  MAX_WORKING,
  markRound,
  PARENT_SLOTS,
  parseSquadFile,
  pool,
  roll,
  roundOf,
  SQUAD_SLOTS,
  type SquadFile,
  type SquadRound,
  slug,
  squadFile,
  squadRound,
} from "../flow/squad";
import { isoWeek, localDay, utcNow } from "../mcp/clock";
import { VERSION } from "../updates";

/** A friend this week. No score or of: the pooled total is the only place a score is shown. */
export type SquadMember = {
  pupil: string;
  comparable: boolean;
  answers?: SquadAnswer[]; // present only once this pupil's own round for the week is in the log
};
export type SquadView = {
  day: string;
  week: string;
  daysLeft: number;
  profile: { squad: string; pupil: string } | null;
  folder: string | null; // absolute path of data/squad/<squad>, shown as text for "copy friends' files here"
  round: (SquadRound & { title: string }) | null;
  mine: SquadFile | null;
  members: SquadMember[]; // other pupils this week, by pupil name
  total: { score: number; of: number; rounds: number }; // mine + comparable members
  unreadable: number; // files in the folder left out: bad JSON, bad shape, a symlink, a copy of your own name
  shared: boolean; // mine's file is on disk and matches the event
  parentDone: boolean; // a parent-round teachback this ISO week
};
type Refusal = { status: 400 | 409 | 500; body: { error: string } };

// derived: 5 answers × (100 + 500) characters ≈ 3 KB of text, plus keys and seeds; 64 KB leaves room for any honest file
const MAX_FILE = 64 * 1024;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** The squad id and pupil name from profile.json, both through slug; null until the pupil has joined. */
export function squadProfile(
  dataDir: string,
): { squad: string; pupil: string } | null {
  const p = readProfile(dataDir);
  const squad = slug(p.squad);
  const pupil = slug(p.pupil);
  return squad !== null && pupil !== null ? { squad, pupil } : null;
}

const fileOf = (squad: string, pupil: string) => `squad/${squad}/${pupil}.json`;

function events(dataDir: string): Event[] {
  return readLines(dataDir)
    .map(parseEvent)
    .filter((e): e is Event => e !== null);
}

/** The first squad event of this squad and week in log order; a second one (two tabs racing) is ignored. */
function mineEvent(
  evs: readonly Event[],
  squad: string,
  week: string,
): SquadV1 | null {
  for (const e of evs)
    if (e.type === "squad" && e.squad === squad && e.week === week) return e;
  return null;
}

/** A parent-round teachback: no item (T9's chat teach-backs always carry one), this topic, of 3, in this London ISO week. */
function parentDone(evs: readonly Event[], topic: string, week: string) {
  return evs.some(
    (e) =>
      e.type === "teachback" &&
      e.item === undefined &&
      e.topic === topic &&
      e.of === PARENT_SLOTS &&
      isoWeek(localDay(e.t)) === week,
  );
}

/** mine's file, logged and left for the next GET when the disk refuses. True when it landed. */
function writeMine(dataDir: string, f: SquadFile): boolean {
  try {
    makeDataDir(dataDir, `squad/${f.squad}`);
    writeDataFile(
      dataDir,
      fileOf(f.squad, f.pupil),
      `${JSON.stringify(f, null, 2)}\n`,
    );
    return true;
  } catch (err) {
    console.error(`Could not write the squad file: ${(err as Error).message}`);
    return false;
  }
}

/** The on-disk file equals the projection, the version aside. File existence alone does not count. */
function onDisk(dataDir: string, f: SquadFile): boolean {
  let x: unknown;
  try {
    x = readDataJson(dataDir, fileOf(f.squad, f.pupil));
  } catch {
    return false;
  }
  const disk = parseSquadFile(x);
  return (
    disk !== null &&
    JSON.stringify({ ...disk, app: "" }) === JSON.stringify({ ...f, app: "" })
  );
}

type Friends = {
  members: SquadMember[];
  counted: SquadFile[];
  unreadable: number;
};

/** Friends' files this week. Anything wrong with one file leaves that file out; nothing here throws. */
function friends(
  dataDir: string,
  profile: { squad: string; pupil: string },
  round: SquadRound,
  withAnswers: boolean,
): Friends {
  const out: Friends = { members: [], counted: [], unreadable: 0 };
  let listed: { files: string[]; skipped: string[] };
  try {
    listed = listDataDir(dataDir, `squad/${profile.squad}`);
  } catch (err) {
    // The squad folder itself leaves data/ (a symlink to a synced folder, #42): solo, with the note.
    console.error(`Could not list the squad folder: ${(err as Error).message}`);
    out.unreadable = 1;
    return out;
  }
  out.unreadable += listed.skipped.filter((n) => n.endsWith(".json")).length;
  const own = `${profile.pupil}.json`;
  const seen = new Set<string>();
  const files: SquadFile[] = [];
  for (const name of listed.files) {
    if (!name.endsWith(".json") || name === own) continue;
    const rel = `squad/${profile.squad}/${name}`;
    let f: SquadFile | null = null;
    try {
      if (fs.statSync(resolveInData(dataDir, rel)).size <= MAX_FILE)
        f = parseSquadFile(readDataJson(dataDir, rel));
    } catch {
      f = null;
    }
    // Another squad's file has other seeds by construction: not a friend's round here.
    if (f === null || f.pupil === profile.pupil || f.squad !== profile.squad) {
      out.unreadable += 1;
      continue;
    }
    if (f.week !== round.week) continue;
    if (seen.has(f.pupil)) {
      out.unreadable += 1;
      continue;
    }
    seen.add(f.pupil);
    files.push(f);
  }
  files.sort((a, b) => (a.pupil < b.pupil ? -1 : a.pupil > b.pupil ? 1 : 0));
  for (const f of files) {
    const ok = comparable(round, f);
    if (ok) out.counted.push(f);
    // The guard: a friend's answers reach the page only after this pupil's own round is saved.
    out.members.push(
      withAnswers
        ? { pupil: f.pupil, comparable: ok, answers: f.answers }
        : { pupil: f.pupil, comparable: ok },
    );
  }
  return out;
}

/**
 * The week's squad view for one London day. `heal` rewrites a missing or stale own file; the route
 * passes true only for this week, so a `?day=` look at another week never writes.
 */
export function getSquad(
  dataDir: string,
  pack: CasePack,
  day: string,
  heal: boolean,
): { status: 200; body: SquadView } {
  const week = isoWeek(day);
  const profile = squadProfile(dataDir);
  const view: SquadView = {
    day,
    week,
    daysLeft: daysLeft(day),
    profile,
    folder: null,
    round: null,
    mine: null,
    members: [],
    total: pool([]),
    unreadable: 0,
    shared: false,
    parentDone: false,
  };
  if (profile === null) return { status: 200, body: view };
  // profile.json exists, so data/ does: this never creates it.
  view.folder = path.join(fs.realpathSync(dataDir), "squad", profile.squad);
  const evs = events(dataDir);
  const e = mineEvent(evs, profile.squad, week);
  // A saved round keeps its own topic: a mid-week update that moves the pick must not re-pair its answers.
  const round =
    e === null
      ? squadRound(profile.squad, week, pack)
      : roundOf(profile.squad, week, e.topic);
  if (round === null) return { status: 200, body: view };
  const title =
    pack.topics.find((t) => t.id === round.topic)?.title ?? round.topic;
  view.round = { ...round, title };
  const mine =
    e === null ? null : squadFile(e, profile.pupil, round.seeds, VERSION);
  view.mine = mine;
  if (mine !== null) {
    view.shared = onDisk(dataDir, mine) || (heal && writeMine(dataDir, mine));
  }
  const f = friends(dataDir, profile, round, mine !== null);
  view.members = f.members;
  view.unreadable = f.unreadable;
  view.total = pool(mine === null ? f.counted : [mine, ...f.counted]);
  view.parentDone = parentDone(evs, round.topic, week);
  return { status: 200, body: view };
}

/**
 * Saves one round: marked again here (the page's marks are not trusted), one squad event, then the
 * pupil's own file. Event first: a failed file write leaves the record right and the next GET writes it.
 */
export function postSquad(
  body: unknown,
  dataDir: string,
  pack: CasePack,
  day: string,
  now: () => string = utcNow,
): { status: 201; body: SquadView } | Refusal {
  const profile = squadProfile(dataDir);
  if (profile === null)
    return { status: 400, body: { error: "Join a squad first." } };
  const week = isoWeek(day);
  const round = squadRound(profile.squad, week, pack);
  if (round === null)
    return { status: 400, body: { error: "There is no squad round to save." } };
  if (!isObj(body) || typeof body.week !== "string")
    return { status: 400, body: { error: "Send the week and the answers." } };
  if (body.week !== week)
    return {
      status: 409,
      body: {
        error: "The squad week has changed. Reload for this week's round.",
      },
    };
  const answers = body.answers;
  if (
    !Array.isArray(answers) ||
    answers.length !== SQUAD_SLOTS ||
    !answers.every(
      (a) =>
        isObj(a) &&
        typeof a.answer === "string" &&
        a.answer.length <= MAX_ANSWER &&
        typeof a.working === "string" &&
        a.working.length <= MAX_WORKING,
    )
  )
    return {
      status: 400,
      body: {
        error: `A round is ${SQUAD_SLOTS} answers of up to ${MAX_ANSWER} characters, with working of up to ${MAX_WORKING}.`,
      },
    };
  if (mineEvent(events(dataDir), profile.squad, week) !== null)
    return { status: 409, body: { error: "You have done this week's round." } };
  const marked = markRound(
    roll(round, pack),
    (answers as Obj[]).map((a) => ({
      answer: a.answer as string,
      working: a.working as string,
    })),
  );
  let saved: Event;
  try {
    saved = appendEvent(
      dataDir,
      {
        v: 1,
        type: "squad",
        squad: profile.squad,
        week,
        topic: round.topic,
        score: marked.filter((a) => a.correct).length,
        of: marked.length,
        answers: marked,
      },
      now,
    );
  } catch (err) {
    console.error(`Could not save the squad round: ${(err as Error).message}`);
    return { status: 500, body: { error: "Could not save the round." } };
  }
  writeMine(
    dataDir,
    squadFile(saved as SquadV1, profile.pupil, round.seeds, VERSION),
  );
  return { status: 201, body: getSquad(dataDir, pack, day, true).body };
}

/**
 * Squad id and pupil name into profile.json, every other key kept. Once this week's round is saved,
 * both stay as they are until next week: a new name would leave the old file behind as a friend.
 */
export function joinSquad(
  body: unknown,
  dataDir: string,
  day: string,
):
  | { status: 200; body: { profile: { squad: string; pupil: string } } }
  | { status: 400 | 409; body: { error: string } } {
  const squad = isObj(body) ? slug(body.squad) : null;
  const pupil = isObj(body) ? slug(body.pupil) : null;
  if (squad === null || pupil === null)
    return {
      status: 400,
      body: {
        error: "Use letters, numbers and dashes for the squad and your name.",
      },
    };
  const now = squadProfile(dataDir);
  if (
    now !== null &&
    (now.squad !== squad || now.pupil !== pupil) &&
    mineEvent(events(dataDir), now.squad, isoWeek(day)) !== null
  )
    return {
      status: 409,
      body: {
        error:
          "You have done this week's round, so your squad and name stay as they are until Monday.",
      },
    };
  const profile = { ...readProfile(dataDir), squad, pupil };
  writeDataFile(dataDir, PROFILE_FILE, `${JSON.stringify(profile, null, 2)}\n`);
  return { status: 200, body: { profile: { squad, pupil } } };
}
