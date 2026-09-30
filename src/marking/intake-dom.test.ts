/* The intake page's code under happy-dom against a fake fetch that records every request and answers
   from a `served` table. Registered here and unregistered in afterAll, so no other test file sees a
   document. Built one door at a time: the confirm list (15a), sheet (15b), tell me (15c), cold test (15d). */

import { afterAll, expect, test } from "bun:test";
import path from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { loadPacks } from "../api/case";
import { loadGenerators } from "../content/generators";
import type { Generated, Item } from "../content/types";
import { replay } from "../events/replay";
import { type Diagnostic, diagnostic } from "../flow/diagnostic";
import { doc, type El, until as settle } from "./dom";

const root = path.resolve(import.meta.dir, "../..");
const { pack, subjects } = await loadPacks(root);
const gens = await loadGenerators("maths");
(globalThis as { GEN?: unknown }).GEN = gens;
const DAY = "2026-10-05";
const PCT = "1MA1/R9/of-an-amount";
const RATIO = "1MA1/R4";
const CELLS = "8464/4.1.1.2";
const cellsItems = pack.items.get(CELLS) as Item[];

GlobalRegistrator.register({ url: "http://127.0.0.1:4731/intake.html" });
afterAll(() => GlobalRegistrator.unregister());

const html = await Bun.file(path.join(root, "app/intake.html")).text();
doc().body.innerHTML = (
  /<main[\s\S]*<\/main>/.exec(html) as RegExpExecArray
)[0];

const wire = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const served = {
  preset: "none" as string,
  sheet: {} as unknown,
  interview: {} as unknown,
  diagnostic: null as Diagnostic | null,
  eventOk: true,
  sheetStatus: 200,
  courses: null as null | { courses: unknown[]; chosen: unknown[] },
  coursesPost: { status: 200, body: {} as unknown },
};
type Call = { method: string; url: string; body?: Record<string, unknown> };
const calls: Call[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ method, url, body });
  if (url === "/api/config")
    return Response.json({
      configured: true,
      config: { preset: served.preset },
    });
  if (url === "/api/courses" && method === "POST")
    return Response.json(served.coursesPost.body, {
      status: served.coursesPost.status,
    });
  if (url === "/api/courses" && served.courses !== null)
    return Response.json(wire(served.courses));
  if (url === "/api/topics")
    return Response.json(
      pack.topics.map((t) => ({ ...t, subject: subjects.get(t.id) })),
    );
  if (url === "/api/intake/sheet")
    return Response.json(served.sheet, { status: served.sheetStatus });
  if (url === "/api/intake/interview") return Response.json(served.interview);
  if (url === "/api/intake/diagnostic")
    return Response.json(wire(served.diagnostic));
  if (url === "/content/science/items/8464-4.1.1.2.json")
    return Response.json(cellsItems);
  if (url === "/api/event")
    return served.eventOk
      ? Response.json({ ...body, t: `${DAY}T16:00:00Z` }, { status: 201 })
      : Response.json({ error: "x" }, { status: 500 });
  return new Response("Not found", { status: 404 });
}) as typeof fetch;

const app = path.resolve(import.meta.dir, "../../app");
await import(path.join(app, "quiz.js"));
// retest.js is loaded for buildItems and itemsFile; with no #boss it does nothing at load.
await import(`${path.join(app, "retest.js")}?intake`);
// `?dom` makes this a separate module from intake.test.ts's import: a cached module never re-runs its page code.
await import(`${path.join(app, "intake.js")}?dom`);

type Row = { topic: string; title: string; rag: string | null; code?: string };
type Page = {
  TEXT: Record<
    | "saved"
    | "notSaved"
    | "nothingTicked"
    | "photoFailed"
    | "photoNoModel"
    | "goesToModel"
    | "matchFailed"
    | "answerFirst"
    | "sureFirst"
    | "nothingToAsk"
    | "notLoaded"
    | "sheetRefused",
    string
  > & {
    readAs: (code: string) => string;
    unknown: (code: string) => string;
  };
  ready: Promise<void>;
  reload: () => Promise<void>;
  encode: (file: unknown) => Promise<string>;
  confirmRows: (door: string, rows: Row[], source: string) => void;
  openDoor: (door: string) => Promise<void>;
  page: { topics: unknown };
};
const page = (globalThis as { intake?: Page }).intake as Page;
const { TEXT } = page;
await page.ready;

type Quiz = {
  lcg: (seed: number) => () => number;
  itemFromGenerated: (topic: string, spec: Generated, seed: number) => Item;
};
const quiz = (globalThis as { quiz?: Quiz }).quiz as Quiz;

const until = async (fn: () => boolean) => expect(await settle(fn)).toBe(true);
const $ = (sel: string) => doc().querySelector(sel) as El;
const $$ = (sel: string) => [...doc().querySelectorAll(sel)] as El[];
const status = () => $("#status").textContent ?? "";
const confirmLis = () => $$("#confirm li");
const box = (li: El) => li.querySelector("input[type=checkbox]") as El;
const eventPosts = () =>
  calls.filter((c) => c.method === "POST" && c.url === "/api/event");
const fresh = async (preset: string) => {
  served.preset = preset;
  await page.reload();
  calls.length = 0;
};

// ---- 15a: the confirm list ----

test("15a: a code row with R/A/G starts ticked; one without cannot be ticked until picked; Save posts both", async () => {
  await fresh("none");
  page.confirmRows(
    "sheet",
    [
      { topic: PCT, title: "Percentage of an amount", rag: "R" },
      { topic: RATIO, title: "Simplifying ratio", rag: null },
    ],
    "code",
  );
  const [first, second] = confirmLis() as [El, El];
  expect((box(first) as unknown as { checked: boolean }).checked).toBe(true);
  expect(box(second).disabled).toBe(true);
  (second.querySelector('input[value="A"]') as El).click();
  const again = confirmLis()[1] as El;
  expect(box(again).disabled).toBe(false);
  box(again).click();
  $("#save").click();
  await until(() => status() !== "");
  expect(eventPosts().map((c) => c.body)).toEqual([
    {
      v: 1,
      type: "intake",
      door: "sheet",
      topics: [
        { topic: PCT, rag: "R" },
        { topic: RATIO, rag: "A" },
      ],
    },
  ]);
  expect(status()).toStartWith(TEXT.saved);
});

test("15a: a model row starts unticked; Save with nothing ticked posts nothing", async () => {
  await fresh("none");
  page.confirmRows(
    "sheet",
    [{ topic: PCT, title: "Percentage of an amount", rag: "R", code: "U349" }],
    "model",
  );
  const [li] = confirmLis() as [El];
  expect((box(li) as unknown as { checked: boolean }).checked).toBe(false);
  $("#save").click();
  await until(() => status() === TEXT.nothingTicked);
  expect(eventPosts()).toHaveLength(0);
});

test("15a: a failed post says not saved", async () => {
  await fresh("none");
  served.eventOk = false;
  try {
    page.confirmRows(
      "sheet",
      [{ topic: PCT, title: "Percentage of an amount", rag: "G" }],
      "code",
    );
    $("#save").click();
    await until(() => status() === TEXT.notSaved);
  } finally {
    served.eventOk = true;
  }
});

test("15a (PR #51 F2): after a Save the list is gone, so changing a radio cannot post a second intake", async () => {
  await fresh("none");
  page.confirmRows(
    "sheet",
    [{ topic: PCT, title: "Percentage of an amount", rag: "R" }],
    "code",
  );
  $("#save").click();
  await until(() => eventPosts().length === 1);
  await until(() => status().startsWith(TEXT.saved));
  const radio = doc().querySelector('#confirm input[value="G"]') as El | null;
  radio?.click();
  (doc().querySelector("#save") as El | null)?.click();
  await Bun.sleep(20);
  expect(radio).toBeNull();
  expect(doc().querySelector("#save")).toBeNull();
  expect(eventPosts()).toHaveLength(1);
});

// ---- 15b: sheet or photo ----

async function readSheet(text: string) {
  await page.openDoor("sheet");
  $("#sheet-text").value = text;
  $("#sheet-read").click();
  await until(() => calls.some((c) => c.url === "/api/intake/sheet"));
}

test("15b (AC 2): a model reply shows the code it read, an unknown line, and saves no unknown code", async () => {
  await fresh("openai");
  served.sheet = {
    by: "model",
    rows: [
      {
        topic: PCT,
        title: "Percentage of an amount",
        rag: "R",
        code: "U349",
      },
    ],
    unknown: ["U976"],
  };
  await readSheet("U349 R\nU976 G");
  await until(() => confirmLis().length === 1);
  const [li] = confirmLis() as [El];
  expect(li.textContent).toContain(TEXT.readAs("U349"));
  expect((box(li) as unknown as { checked: boolean }).checked).toBe(false);
  expect($("#unknown").textContent).toContain(TEXT.unknown("U976"));
  box(li).click();
  $("#save").click();
  await until(() => eventPosts().length === 1);
  expect(eventPosts()[0]?.body).toEqual({
    v: 1,
    type: "intake",
    door: "sheet",
    topics: [{ topic: PCT, rag: "R" }],
  });
  expect(JSON.stringify(eventPosts())).not.toContain("U976");
});

test("15b: fallback rows start ticked", async () => {
  await fresh("none");
  served.sheet = {
    by: "fallback",
    rows: [
      { topic: PCT, title: "Percentage of an amount", rag: "R", code: "U349" },
    ],
    unknown: [],
  };
  await readSheet("R U349");
  await until(() => confirmLis().length === 1);
  const [li] = confirmLis() as [El];
  expect((box(li) as unknown as { checked: boolean }).checked).toBe(true);
  expect(li.textContent).not.toContain(TEXT.readAs("U349"));
});

test("15b: no verdict says why, one sentence per reason", async () => {
  await fresh("openai");
  served.sheet = { by: "none", reason: "failed" };
  await readSheet("x");
  await until(() => status() === TEXT.photoFailed);
  served.sheet = { by: "none", reason: "no-model" };
  await readSheet("x");
  await until(() => status() === TEXT.photoNoModel);
});

test("15b: the provider line shows only when a model is set up", async () => {
  await fresh("none");
  await page.openDoor("sheet");
  expect($("#model-line").hidden).toBe(true);
  await fresh("openai");
  await page.openDoor("sheet");
  expect($("#model-line").hidden).toBe(false);
  expect($("#model-line").textContent).toBe(TEXT.goesToModel);
});

test("15b: a chosen photo is encoded and posted as {image}", async () => {
  await fresh("openai");
  served.sheet = { by: "none", reason: "failed" };
  const URL_ = "data:image/jpeg;base64,/9j/AA==";
  const real = page.encode;
  page.encode = async () => URL_;
  try {
    await page.openDoor("sheet");
    const input = $("#sheet-file") as unknown as {
      onchange: (e: unknown) => void;
    };
    input.onchange({ target: { files: [{ type: "image/jpeg", size: 10 }] } });
    await until(() => calls.some((c) => c.url === "/api/intake/sheet"));
    expect(calls.find((c) => c.url === "/api/intake/sheet")?.body).toEqual({
      image: URL_,
    });
  } finally {
    page.encode = real;
  }
});

test("15b (PR #51 F4): a 400 from the sheet route names the size or type, not a closed window", async () => {
  await fresh("none");
  served.sheetStatus = 400;
  served.sheet = { error: "text must be 1 to 20000 characters" };
  try {
    await readSheet("x");
    await until(() => status() === TEXT.sheetRefused);
    expect(TEXT.sheetRefused).not.toBe(TEXT.notLoaded);
  } finally {
    served.sheetStatus = 200;
  }
});

// ---- 15c: tell me ----

async function tellMe(reply: unknown) {
  served.interview = reply;
  await page.openDoor("interview");
  $("#answer-unsure").value = "ratio";
  $("#match").click();
  await until(() => calls.some((c) => c.url === "/api/intake/interview"));
}

test("15c: a model reply gives unticked rows", async () => {
  await fresh("openai");
  await tellMe({
    by: "model",
    rows: [{ topic: RATIO, title: "Simplifying ratio", rag: "A" }],
  });
  await until(() => confirmLis().length === 1);
  expect(
    (box(confirmLis()[0] as El) as unknown as { checked: boolean }).checked,
  ).toBe(false);
  expect(calls.find((c) => c.url === "/api/intake/interview")?.body).toEqual({
    answers: { confident: "", unsure: "ratio", stuck: "" },
  });
  expect($("#ai-line").hidden).toBe(false);
});

test("15c: a failed match shows the checklist of every topic under its own line", async () => {
  await fresh("openai");
  await tellMe({ by: "none", reason: "failed" });
  await until(() => $$("#checklist li").length === pack.topics.length);
  expect($("#checklist").textContent).toContain(TEXT.matchFailed);
  expect(pack.topics).toHaveLength(22);
});

test("15c (AC 7): no model → the checklist with no interview post; lost on cells saves R", async () => {
  await fresh("none");
  await page.openDoor("interview");
  await until(() => $$("#checklist li").length === pack.topics.length);
  expect($("#answers").hidden).toBe(true);
  expect($("#ai-line").hidden).toBe(true);
  const cells = $(`#checklist li[data-topic="${CELLS}"]`);
  (cells.querySelector('button[data-rag="R"]') as El).click();
  await until(() => confirmLis().length === 1);
  $("#save").click();
  await until(() => eventPosts().length === 1);
  expect(eventPosts()[0]?.body).toEqual({
    v: 1,
    type: "intake",
    door: "interview",
    topics: [{ topic: CELLS, rag: "R" }],
  });
  expect(calls.some((c) => c.url === "/api/intake/interview")).toBe(false);
});

// ---- 15d: cold test ----

function genItem(slot: { topic: string; seed: number }): Item {
  const code = pack.topics.find((t) => t.id === slot.topic)
    ?.aliases[0] as string;
  const gen = gens[code] as (rng: () => number) => Generated;
  return quiz.itemFromGenerated(
    slot.topic,
    gen(quiz.lcg(slot.seed)),
    slot.seed,
  );
}

function answerCold(i: number, typed: string, sure: boolean) {
  const q = $$("#cold .q")[i] as El;
  (q.querySelector("input[type=text]") as El).value = typed;
  (
    q.querySelector(`input[value="${sure ? "sure" : "notsure"}"]`) as El
  ).click();
  (q.querySelector(".check") as El).click();
}

test("15d (AC 8): two answered questions save one intake body, G and R, and nothing before Save", async () => {
  await fresh("none");
  const d = diagnostic(replay([]), DAY, pack) as Diagnostic;
  const slots = d.slots.slice(0, 2);
  served.diagnostic = { ...d, slots, topics: slots.map((s) => s.topic) };
  await page.openDoor("diagnostic");
  await until(() => $$("#cold .q").length === 2);
  const [s1, s2] = slots as [(typeof slots)[0], (typeof slots)[0]];
  const first = genItem(s1);
  expect(doc().body.innerHTML).not.toContain(first.working as string);
  // Needs an answer, then a Sure choice.
  (($$("#cold .q")[0] as El).querySelector(".check") as El).click();
  expect(($$("#cold .q")[0] as El).textContent).toContain(TEXT.answerFirst);
  (($$("#cold .q")[0] as El).querySelector("input[type=text]") as El).value =
    "1";
  (($$("#cold .q")[0] as El).querySelector(".check") as El).click();
  expect(($$("#cold .q")[0] as El).textContent).toContain(TEXT.sureFirst);

  answerCold(0, first.answers?.[0] as string, true);
  answerCold(1, "-987654.321", true);
  expect(eventPosts()).toHaveLength(0);
  $("#cold-save").click();
  await until(() => confirmLis().length === 2);
  $("#save").click();
  await until(() => eventPosts().length === 1);
  expect(eventPosts()[0]?.body).toEqual({
    v: 1,
    type: "intake",
    door: "diagnostic",
    topics: [
      { topic: s1.topic, rag: "G" },
      { topic: s2.topic, rag: "R" },
    ],
  });
});

test("15d (PR #51 F2): after the cold test is saved, answering another question does not re-enable its Save", async () => {
  await fresh("none");
  const d = diagnostic(replay([]), DAY, pack) as Diagnostic;
  const slots = d.slots.slice(0, 2);
  served.diagnostic = { ...d, slots, topics: slots.map((s) => s.topic) };
  await page.openDoor("diagnostic");
  await until(() => $$("#cold .q").length === 2);
  answerCold(0, "-987654.321", true);
  $("#cold-save").click();
  await until(() => confirmLis().length === 1);
  $("#save").click();
  await until(() => eventPosts().length === 1);
  await until(() => status().startsWith(TEXT.saved));
  expect($("#cold-save").disabled).toBe(true);
  answerCold(1, "-987654.321", false);
  expect($("#cold-save").disabled).toBe(true);
  $("#cold-save").click();
  (doc().querySelector("#save") as El | null)?.click();
  await Bun.sleep(20);
  expect(eventPosts()).toHaveLength(1);
});

test("15d (AC 7): a science item slot builds its question from the items file", async () => {
  await fresh("none");
  served.diagnostic = {
    day: DAY,
    seed: 1,
    topics: [CELLS],
    slots: [{ topic: CELLS, item: `${CELLS}#1`, seed: 1 }],
  };
  await page.openDoor("diagnostic");
  await until(() => $$("#cold .q").length === 1);
  const item = cellsItems[0] as Item;
  expect($("#cold .q .stem").textContent).toBe(`1. ${item.stem}`);
});

test("15d: nothing to ask says so", async () => {
  await fresh("none");
  served.diagnostic = null;
  await page.openDoor("diagnostic");
  await until(() => $("#cold-intro").textContent === TEXT.nothingToAsk);
});

// ---- A2: the courses panel before the doors ----

const COURSES = [
  {
    spec: "1MA1",
    board: "Edexcel",
    title: "GCSE Mathematics",
    tiers: ["F", "H"],
  },
  {
    spec: "8464",
    board: "AQA",
    title: "GCSE Combined Science: Trilogy",
    tiers: ["F", "H"],
  },
];
const coursePosts = () =>
  calls.filter((c) => c.method === "POST" && c.url === "/api/courses");

test("A2 (AC 5): no courses saved → the panel shows and the doors hide; a save posts the ticks and brings the doors back", async () => {
  served.courses = { courses: COURSES, chosen: [] };
  await fresh("none");
  expect($("#courses").hidden).toBe(false);
  expect($("#doors").hidden).toBe(true);
  expect($("#courses-line").hidden).toBe(true);
  await page.openDoor("sheet"); // fills the topic cache the save must drop
  expect(page.page.topics).not.toBeNull();

  (
    $('#course-list input[data-spec="1MA1"]') as El & { checked: boolean }
  ).checked = true;
  (
    $('input[name="tier-1MA1"][value="F"]') as El & { checked: boolean }
  ).checked = true;
  served.coursesPost = {
    status: 200,
    body: { chosen: [{ spec: "1MA1", tier: "F" }] },
  };
  $("#courses-save").click();
  await until(() => status() === "Courses saved.");
  expect(coursePosts().map((c) => c.body)).toEqual([
    { courses: [{ spec: "1MA1", tier: "F" }] },
  ]);
  expect($("#doors").hidden).toBe(false);
  expect($("#courses").hidden).toBe(true);
  expect(page.page.topics).toBeNull();
  expect($("#courses-line").textContent).toContain(
    "Edexcel GCSE Mathematics, Foundation",
  );
});

test("A2: a refused save shows the server's sentence and keeps the doors hidden", async () => {
  served.courses = { courses: COURSES, chosen: [] };
  await fresh("none");
  (
    $('#course-list input[data-spec="1MA1"]') as El & { checked: boolean }
  ).checked = true;
  served.coursesPost = {
    status: 400,
    body: { error: "Pick Foundation or Higher for GCSE Mathematics." },
  };
  $("#courses-save").click();
  await until(
    () => status() === "Pick Foundation or Higher for GCSE Mathematics.",
  );
  expect(coursePosts().map((c) => c.body)).toEqual([
    { courses: [{ spec: "1MA1" }] },
  ]);
  expect($("#doors").hidden).toBe(true);
});

test("A2: saved courses → the doors show with a line naming them; no route → the page as before", async () => {
  served.courses = {
    courses: COURSES,
    chosen: [{ spec: "8464", tier: "H" }],
  };
  await fresh("none");
  expect($("#courses").hidden).toBe(true);
  expect($("#doors").hidden).toBe(false);
  expect($("#courses-line").textContent).toContain(
    "AQA GCSE Combined Science: Trilogy, Higher",
  );
  served.courses = null;
  await fresh("none");
  expect($("#courses").hidden).toBe(true);
  expect($("#courses-line").hidden).toBe(true);
  expect($("#doors").hidden).toBe(false);
});
