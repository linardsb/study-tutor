import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { checkSquadFolder, readProfile } from "../config";
import type { CasePack } from "../content/types";
import {
  appendEvent,
  CONFIG_FILE,
  ensureDataDir,
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
  nameTaken,
  OWNER,
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
  folder: string | null; // data/squad/<squad> or the parent's sync folder, shown as text for "copy friends' files here"
  round: (SquadRound & { title: string }) | null;
  mine: SquadFile | null;
  members: SquadMember[]; // other pupils this week, by pupil name
  total: { score: number; of: number; rounds: number }; // mine + comparable members
  unreadable: number; // files in the folder left out: bad JSON, bad shape, a symlink, a copy of your own name
  shared: boolean; // mine's file is on disk and matches the event
  parentDone: boolean; // a parent-round teachback this ISO week
  nameTaken: boolean; // another tutor's file carries this pupil's name: nothing is written until they pick another (F8)
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

const TAKEN_POST =
  "Someone else in this squad uses your name. Pick another name first.";
const TAKEN_JOIN =
  "Someone in this squad already uses that name. Pick another one.";

/**
 * This tutor's squad owner id from profile.json, written into every squad file it writes so a file with
 * the same pupil name from another tutor is told apart (F8). Null when none is saved yet; `mint` saves one.
 */
function ownerId(dataDir: string, mint: boolean): string | null {
  const p = readProfile(dataDir);
  if (typeof p.squadOwner === "string" && OWNER.test(p.squadOwner))
    return p.squadOwner;
  if (!mint) return null;
  const squadOwner = randomUUID();
  writeDataFile(
    dataDir,
    PROFILE_FILE,
    `${JSON.stringify({ ...p, squadOwner }, null, 2)}\n`,
  );
  return squadOwner;
}

/**
 * Where squad files live. Unset: data/squad/<squad> (T14). Set in config.json: directly in the
 * parent's sync folder, pinned to its realpath (D9, #42). Set but failing the check: null, and nothing
 * is read or written; there is no fallback to data/.
 */
type Place = { root: string; dir: string; sync: boolean };
type Where = { place: Place | null; folder: string | null };

function squadPlace(dataDir: string, squad: string): Where {
  let o: unknown;
  try {
    o = readDataJson(dataDir, CONFIG_FILE);
  } catch {
    return { place: null, folder: null };
  }
  const set = isObj(o) ? o.squadFolder : undefined;
  if (set === undefined) {
    const dir = `squad/${squad}`;
    return {
      place: { root: dataDir, dir, sync: false },
      folder: path.join(fs.realpathSync.native(dataDir), "squad", squad),
    };
  }
  const real = checkSquadFolder(dataDir, set);
  return real === null
    ? { place: null, folder: typeof set === "string" ? set : null }
    : { place: { root: real, dir: "", sync: true }, folder: real };
}

const relOf = (p: Place, name: string) =>
  p.dir === "" ? name : `${p.dir}/${name}`;

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
export function writeMine(p: Place | null, f: SquadFile): boolean {
  if (p === null) return false;
  try {
    if (p.dir !== "") makeDataDir(p.root, p.dir);
    const rel = relOf(p, `${f.pupil}.json`);
    // A sync folder is its checked realpath: if it has since become a link, the file would land elsewhere.
    if (p.sync && path.dirname(resolveInData(p.root, rel)) !== p.root)
      throw new Error(`Refused: ${rel} resolves outside the squad folder`);
    writeDataFile(p.root, rel, `${JSON.stringify(f, null, 2)}\n`);
    return true;
  } catch (err) {
    console.error(`Could not write the squad file: ${(err as Error).message}`);
    return false;
  }
}

/** The on-disk file equals the projection, the version aside. File existence alone does not count. */
function onDisk(p: Place | null, f: SquadFile): boolean {
  if (p === null) return false;
  let x: unknown;
  try {
    x = readDataJson(p.root, relOf(p, `${f.pupil}.json`));
  } catch {
    return false;
  }
  const disk = parseSquadFile(x);
  return (
    disk !== null &&
    JSON.stringify({ ...disk, app: "" }) === JSON.stringify({ ...f, app: "" })
  );
}

/** True when any file in the squad folder carries this pupil's name and another tutor wrote it. Never throws. */
function takenIn(
  p: Place | null,
  pupil: string,
  owner: string | null,
  mine: SquadFile | null,
  week: string,
): boolean {
  if (p === null) return false;
  let files: string[];
  try {
    files = listDataDir(p.root, p.dir).files;
  } catch {
    return false;
  }
  // A kept-both copy (`alex 2.json`) carries the name inside, so every file is read, not only `<pupil>.json`.
  return files.some((name) => {
    if (!name.endsWith(".json")) return false;
    const rel = relOf(p, name);
    try {
      if (fs.statSync(resolveInData(p.root, rel)).size > MAX_FILE) return false;
      const f = parseSquadFile(readDataJson(p.root, rel));
      return f !== null && f.pupil === pupil && nameTaken(f, owner, mine, week);
    } catch {
      return false;
    }
  });
}

type Friends = {
  members: SquadMember[];
  counted: SquadFile[];
  unreadable: number;
};

/** Friends' files this week. Anything wrong with one file leaves that file out; nothing here throws. */
function friends(
  p: Place | null,
  profile: { squad: string; pupil: string },
  round: SquadRound,
  withAnswers: boolean,
  taken: boolean,
): Friends {
  const out: Friends = { members: [], counted: [], unreadable: 0 };
  if (p === null) {
    // The sync folder is set but fails the check: solo, with the note, and nothing read.
    out.unreadable = 1;
    return out;
  }
  let listed: { files: string[]; skipped: string[] };
  try {
    listed = listDataDir(p.root, p.dir);
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
    // A sync client's own files (`sam (1).json`, `Sam.json`) are not a pupil's file: ignored.
    if (p.sync && slug(name.slice(0, -5)) !== name.slice(0, -5)) continue;
    const rel = relOf(p, name);
    let f: SquadFile | null = null;
    try {
      if (fs.statSync(resolveInData(p.root, rel)).size <= MAX_FILE)
        f = parseSquadFile(readDataJson(p.root, rel));
    } catch {
      f = null;
    }
    // The page says the name is taken instead of counting the other pupil's file as unreadable.
    if (f !== null && f.pupil === profile.pupil && taken) continue;
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
    nameTaken: false,
  };
  if (profile === null) return { status: 200, body: view };
  // profile.json exists, so data/ does: this never creates it.
  const where = squadPlace(dataDir, profile.squad);
  view.folder = where.folder;
  const evs = events(dataDir);
  const e = mineEvent(evs, profile.squad, week);
  // A saved round keeps its own topic: a mid-week update that moves the pick must not re-pair its answers.
  const round =
    e === null
      ? squadRound(profile.squad, week, pack)
      : roundOf(profile.squad, week, e.topic, pack);
  if (round === null) return { status: 200, body: view };
  const title =
    pack.topics.find((t) => t.id === round.topic)?.title ?? round.topic;
  view.round = { ...round, title };
  // A look at another week (heal false) never writes, so it never mints the owner either.
  const owner = ownerId(dataDir, heal && e !== null);
  const mine =
    e === null
      ? null
      : squadFile(e, profile.pupil, round.seeds, VERSION, owner);
  view.mine = mine;
  view.nameTaken = takenIn(where.place, profile.pupil, owner, mine, week);
  if (mine !== null && !view.nameTaken) {
    view.shared =
      onDisk(where.place, mine) || (heal && writeMine(where.place, mine));
  }
  const f = friends(where.place, profile, round, mine !== null, view.nameTaken);
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
  const place = squadPlace(dataDir, profile.squad).place;
  const owner = ownerId(dataDir, true);
  // Checked before the event: a round saved under a taken name could not be shared this week.
  if (takenIn(place, profile.pupil, owner, null, week))
    return { status: 409, body: { error: TAKEN_POST } };
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
    place,
    squadFile(saved as SquadV1, profile.pupil, round.seeds, VERSION, owner),
  );
  return { status: 201, body: getSquad(dataDir, pack, day, true).body };
}

/**
 * Squad id and pupil name into profile.json, every other key kept. Once this week's round is saved,
 * both stay as they are until next week: a new name would leave the old file behind as a friend. The
 * exception is a taken name, whose file is the other pupil's. A new name another tutor uses is refused.
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
  // The squad place realpaths data/, which a join may be the first to need.
  ensureDataDir(dataDir);
  const now = squadProfile(dataDir);
  const week = isoWeek(day);
  const kept = readProfile(dataDir).squadOwner;
  const owner =
    typeof kept === "string" && OWNER.test(kept) ? kept : randomUUID();
  const changed = now !== null && (now.squad !== squad || now.pupil !== pupil);
  const nowTaken = () => {
    if (now === null) return false;
    const e = mineEvent(events(dataDir), now.squad, week);
    return takenIn(
      squadPlace(dataDir, now.squad).place,
      now.pupil,
      owner,
      e === null ? null : squadFile(e, now.pupil, [], VERSION, owner),
      week,
    );
  };
  if (
    changed &&
    mineEvent(events(dataDir), now.squad, week) !== null &&
    !nowTaken()
  )
    return {
      status: 409,
      body: {
        error:
          "You have done this week's round, so your squad and name stay as they are until Monday.",
      },
    };
  if (
    (now === null || changed) &&
    takenIn(squadPlace(dataDir, squad).place, pupil, owner, null, week)
  )
    return { status: 409, body: { error: TAKEN_JOIN } };
  const profile = {
    ...readProfile(dataDir),
    squad,
    pupil,
    squadOwner: owner,
  };
  writeDataFile(dataDir, PROFILE_FILE, `${JSON.stringify(profile, null, 2)}\n`);
  return { status: 200, body: { profile: { squad, pupil } } };
}
