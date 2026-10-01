/* The squad page's code under happy-dom against a fake fetch that records every request and serves
   a squad view the test sets. Registered here and unregistered in afterAll, so no other test file sees
   a document. */

import { afterAll, expect, test } from "bun:test";
import path from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { loadCasePack } from "../api/case";
import type { SquadView } from "../api/squad";
import {
  PARENT_SLOTS,
  roll,
  type SquadFile,
  type SquadRound,
  squadRound,
} from "../flow/squad";
import { doc, type El, until as settle } from "./dom";

const pack = await loadCasePack("maths");
// What the generators.js script tag leaves on window.
(globalThis as { GEN?: unknown }).GEN = pack.gens;
const DAY = "2026-10-10";
const WEEK = "2026-W41";
const round = squadRound("year11-b", WEEK, pack) as SquadRound;
const qs = roll(round, pack);
const parentQs = roll(round, pack, round.parentSeeds);
const right = qs.map((q) => q.answers[0] as string);

GlobalRegistrator.register({
  url: `http://127.0.0.1:4731/squad.html?day=${DAY}`,
});
afterAll(() => GlobalRegistrator.unregister());

/** A round file where the first `score` answers are right. */
function file(pupil: string, score: number, working = ""): SquadFile {
  return {
    v: 1,
    app: "dev",
    squad: "year11-b",
    pupil,
    week: WEEK,
    topic: round.topic,
    seeds: round.seeds,
    answers: right.map((a, k) => ({
      answer: k < score ? a : "0",
      working: working || `${pupil} working ${k}`,
      correct: k < score,
    })),
    score,
    of: right.length,
  };
}

function view(over: Partial<SquadView> = {}): SquadView {
  return {
    day: DAY,
    week: WEEK,
    daysLeft: 2,
    profile: { squad: "year11-b", pupil: "sam" },
    folder: "/home/sam/tutor/data/squad/year11-b",
    round: { ...round, title: "Percentage of an amount" },
    mine: null,
    members: [],
    total: { score: 0, of: 0, rounds: 0 },
    unreadable: 0,
    shared: false,
    parentDone: false,
    nameTaken: false,
    ...over,
  };
}
const done = (over: Partial<SquadView> = {}) =>
  view({
    mine: file("sam", 4),
    shared: true,
    total: { score: 4, of: 5, rounds: 1 },
    ...over,
  });

const served = {
  view: view({ profile: null, folder: null, round: null }),
  squadStatus: 201,
};

doc().body.innerHTML =
  '<section id="join"></section><section id="week"></section><section id="round"></section><section id="compare"></section><section id="parent"></section><section id="share"></section><p id="status"></p>';

const calls: { method: string; url: string; body?: unknown }[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ method, url, body });
  if (url === "/api/squad/join" && method === "POST") {
    served.view = view();
    return Response.json({ profile: served.view.profile });
  }
  if (url === "/api/squad" && method === "POST") {
    if (served.squadStatus !== 201)
      return Response.json({ error: "x" }, { status: served.squadStatus });
    served.view = done();
    return Response.json(served.view, { status: 201 });
  }
  if (url === `/api/squad?day=${DAY}`) return Response.json(served.view);
  if (url === "/api/event" && method === "POST")
    return Response.json({ ...body, t: `${DAY}T16:00:00Z` }, { status: 201 });
  if (url === "/content/maths/topics.json") return Response.json(pack.topics);
  return new Response("Not found", { status: 404 });
}) as typeof fetch;

// `?dom` makes this a separate module from squad.test.ts's import: a cached module never re-runs its page code.
const app = path.resolve(import.meta.dir, "../../app");
await import(path.join(app, "quiz.js"));
await import(`${path.join(app, "squad.js")}?dom`);
type Page = {
  reload: () => Promise<void>;
  TEXT: Record<
    | "saved"
    | "solo"
    | "notShared"
    | "notComparable"
    | "folder"
    | "notSaved"
    | "parentDone",
    string
  > & { nameTaken: (name: string) => string };
};
const page = (globalThis as { squad?: Page }).squad as Page;
const TEXT = page.TEXT;

const until = async (fn: () => boolean) => expect(await settle(fn)).toBe(true);
const $ = (sel: string) => doc().querySelector(sel) as El;
const $$ = (sel: string) => [...doc().querySelectorAll(sel)] as El[];
const posts = (url?: string) =>
  calls.filter((c) => c.method === "POST" && (!url || c.url === url));
const texts = (sel: string) => $$(sel).map((e) => e.textContent ?? "");

/** Types into question i of `holder` and presses Check. */
function answer(holder: string, i: number, typed: string, working?: string) {
  const q = $$(`${holder} .q`)[i] as El;
  (q.querySelector("input") as El).value = typed;
  if (working !== undefined)
    (q.querySelector("textarea") as El).value = working;
  (q.querySelector(".check") as El).click();
  return q;
}

test("1. no profile: the join form; submitting posts squad and name to /api/squad/join once, then the round loads", async () => {
  await until(() => Boolean($("#join form")));
  expect($$("#round .q")).toHaveLength(0);
  const inputs = $$("#join input");
  (inputs[0] as El).value = "Year 11 B";
  (inputs[1] as El).value = "Sam";
  const g = globalThis as unknown as {
    Event: new (t: string, i: { cancelable: boolean }) => unknown;
  };
  $("#join form").dispatchEvent(new g.Event("submit", { cancelable: true }));
  await until(() => $$("#round .q").length === 5);
  expect(posts()).toEqual([
    {
      method: "POST",
      url: "/api/squad/join",
      body: { squad: "Year 11 B", pupil: "Sam" },
    },
  ]);
  expect($("#join").children).toHaveLength(0);
  // PR #43 L1: before the round, no 0-of-0 total and no solo line, but the folder is there to copy into
  expect(texts("#week p")).toEqual([
    "The squad week ends on Sunday. 2 days left, today included.",
    TEXT.folder,
    "/home/sam/tutor/data/squad/year11-b",
  ]);
});

test("2. the round: five questions, no working or named mistake before the save (PR #43 M2), one go each, then exactly one POST with the week and five answers", async () => {
  expect(texts("#week p")[0]).toBe(
    "The squad week ends on Sunday. 2 days left, today included.",
  );
  const before = $("#round").textContent ?? "";
  for (const q of qs) expect(before).not.toContain(q.working);
  expect($$("#round textarea")).toHaveLength(5);
  const q0 = answer("#round", 0, right[0] as string, "0.6 x 350");
  expect(q0.classList.contains("right")).toBe(true);
  expect(q0.textContent).not.toContain(qs[0]?.working as string);
  // one go: a second check changes nothing
  (q0.querySelector("input") as El).value = "999";
  (q0.querySelector(".check") as El).click();
  expect(q0.classList.contains("wrong")).toBe(false);
  expect((q0.querySelector("textarea") as El).disabled).toBe(true);
  const named = Object.keys(qs[3]?.wrong ?? {})[0] as string;
  for (let i = 1; i < 5; i++)
    answer("#round", i, i === 3 ? named : (right[i] as string), `w${i}`);
  const q3 = $$("#round .q")[3] as El;
  expect(q3.querySelector(".feedback")?.textContent).toBe("Not this time.");
  const shown = $("#round").textContent ?? "";
  for (const q of qs) expect(shown).not.toContain(q.working);
  await until(() => posts("/api/squad").length === 1);
  expect(posts("/api/squad")[0]?.body).toEqual({
    week: WEEK,
    answers: [
      { answer: right[0], working: "0.6 x 350" },
      { answer: right[1], working: "w1" },
      { answer: right[2], working: "w2" },
      { answer: named, working: "w3" },
      { answer: right[4], working: "w4" },
    ],
  });
  await until(() => $$("#compare .q").length === 5);
  expect($("#status").textContent).toBe(TEXT.saved);
  expect($("#share a").getAttribute("download")).toBe("sam.json");
  expect($("#week .folder").textContent).toBe(
    "/home/sam/tutor/data/squad/year11-b",
  );
});

test("3. compare: you, then friends by name not score; no per-person total; pupil-typed working shows as text", async () => {
  served.view = done({
    members: [
      { pupil: "zoe", comparable: true, answers: file("zoe", 5).answers },
      {
        pupil: "alex",
        comparable: true,
        answers: file("alex", 1, "<b>bold</b>").answers,
      },
    ],
    total: { score: 10, of: 15, rounds: 3 },
  });
  await page.reload();
  await until(() => $$("#compare .q").length === 5);
  for (const block of $$("#compare .q"))
    expect(
      [...block.querySelectorAll("li > b")].map((b) => b.textContent),
    ).toEqual(["You", "alex", "zoe"]);
  expect(
    ($$("#compare .q")[0] as El).querySelector(".working")?.textContent,
  ).toBe(`Worked answer: ${qs[0]?.working}`);
  const leaves = $$("body *").filter(
    (e) =>
      e.children.length === 0 && /\b\d+ of (5|15)\b/.test(e.textContent ?? ""),
  );
  expect(leaves.map((e) => e.textContent)).toEqual([
    "Squad total this week: 10 of 15 from 3 rounds.",
  ]);
  const alexWorking = $$("#compare li")
    .filter((li) => li.querySelector("b")?.textContent === "alex")
    .map((li) => li.querySelector("p.working") as El)[0] as El;
  expect(alexWorking.textContent).toBe("<b>bold</b>");
  expect(alexWorking.children).toHaveLength(0);
});

test("3b. a friend on other questions is named with the note and gets no rows", async () => {
  served.view = done({
    members: [
      { pupil: "kit", comparable: false, answers: file("kit", 5).answers },
    ],
  });
  await page.reload();
  await until(() => $$("#compare .q").length === 5);
  expect(
    [...($$("#compare .q")[0] as El).querySelectorAll("li > b")].map(
      (b) => b.textContent,
    ),
  ).toEqual(["You"]);
  expect(texts("#compare p.note")).toEqual([
    "kit: their tutor set different questions this week, so their round is not counted. Updating either tutor fixes it.",
  ]);
});

test("4. no members: the solo line; two unreadable files: the unreadable line", async () => {
  served.view = done({ unreadable: 2 });
  await page.reload();
  await until(() => $$("#compare .q").length === 5);
  const week = texts("#week p");
  expect(week).toContain(TEXT.solo);
  expect(week).toContain(
    "2 files in the squad folder could not be read and are left out.",
  );
  expect(week).not.toContain(TEXT.notShared);
});

test("5. a 500 from the save: Not saved and Try saving again, which re-posts the identical body", async () => {
  calls.length = 0;
  served.view = view();
  served.squadStatus = 500;
  await page.reload();
  await until(() => $$("#round .q").length === 5);
  for (let i = 0; i < 5; i++) answer("#round", i, right[i] as string, "");
  await until(() => Boolean($("#round > button")));
  expect($("#status").textContent).toBe(TEXT.notSaved);
  expect($("#round > button").textContent).toBe("Try saving again");
  served.squadStatus = 201;
  $("#round > button").click();
  await until(() => $$("#compare .q").length === 5);
  const saves = posts("/api/squad");
  expect(saves).toHaveLength(2);
  expect(saves[1]?.body).toEqual(saves[0]?.body);
});

test("6. shared false: the not-shared line", async () => {
  served.view = done({ shared: false });
  await page.reload();
  await until(() => $$("#compare .q").length === 5);
  expect(texts("#week p")).toContain(TEXT.notShared);
});

test("7. the parent round: three questions; two right posts one teachback of 2 of 3; when done it is not offered again", async () => {
  calls.length = 0;
  served.view = done();
  await page.reload();
  await until(() => $$("#parent .q").length === PARENT_SLOTS);
  expect($$("#parent textarea")).toHaveLength(0);
  const before = $("#parent").textContent ?? "";
  for (const q of parentQs) expect(before).not.toContain(q.working);
  for (let i = 0; i < 3; i++)
    answer("#parent", i, i === 1 ? "0" : (parentQs[i]?.answers[0] as string));
  await until(() => posts("/api/event").length === 1);
  expect(posts("/api/event")[0]?.body).toEqual({
    v: 1,
    type: "teachback",
    topic: round.topic,
    marks: 2,
    of: 3,
  });
  await until(() => Boolean($("#parent .result")));
  expect($("#parent .result").textContent).toBe(
    "Your parent got 2 of 3. Saved as a teach-back.",
  );

  served.view = done({ parentDone: true });
  await page.reload();
  await until(() => $$("#compare .q").length === 5);
  expect($$("#parent .q")).toHaveLength(0);
  expect(texts("#parent p")).toEqual([TEXT.parentDone]);
});

test("8. the parent's questions are none of the pupil's, whose worked answers are on the same page (M4)", async () => {
  // year11-b in 2026-W50 rolls 1MA1/R11/pressure, whose small table repeated two pupil stems in the parent round.
  const w50 = squadRound("year11-b", "2026-W50", pack) as SquadRound;
  served.view = done({
    week: "2026-W50",
    round: { ...w50, title: "Pressure" },
    parentDone: false,
  });
  await page.reload();
  await until(() => $$("#parent .q").length === PARENT_SLOTS);
  const stem = (e: El) =>
    (e.querySelector(".stem")?.textContent ?? "").replace(/^\d+\. /, "");
  const pupil = $$("#compare .q").map(stem);
  const parent = $$("#parent .q").map(stem);
  expect(pupil).toHaveLength(5);
  for (const s of parent) expect(pupil).not.toContain(s);
});

test("9. a taken name (F8): a save answered 409 reloads into the name sentence and the join form, squad kept, name empty and focused, no round", async () => {
  calls.length = 0;
  served.view = view();
  served.squadStatus = 409;
  await page.reload();
  await until(() => $$("#round .q").length === 5);
  served.view = view({ nameTaken: true });
  for (let i = 0; i < 5; i++) answer("#round", i, right[i] as string, "");
  await until(() => Boolean($("#join form")));
  expect(posts("/api/squad")).toHaveLength(1);
  expect(texts("#join p")).toEqual([
    "Someone else in this squad already uses the name sam. Pick another name so your rounds do not get mixed up.",
  ]);
  expect(TEXT.nameTaken("sam")).toBe(texts("#join p")[0] as string);
  const [squad, pupil] = $$("#join input") as [El, El];
  expect(squad.value).toBe("year11-b");
  expect(pupil.value).toBe("");
  expect((doc() as unknown as { activeElement: unknown }).activeElement).toBe(
    pupil,
  );
  for (const id of ["#week", "#round", "#compare", "#parent", "#share"])
    expect($(id).children).toHaveLength(0);
  served.squadStatus = 201;
});
