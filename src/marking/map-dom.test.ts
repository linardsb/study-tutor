/* The map page's code under happy-dom against a fake fetch that records every request. Registered
   here and unregistered in afterAll, so no other test file sees a document. */

import { afterAll, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { loadCasePack } from "../api/case";
import { lessonUrls } from "../api/lessons";
import { replay } from "../events/replay";
import type { NewEvent } from "../events/types";
import { type Next, nextStep } from "../flow/next";
import { endBody } from "../flow/session";
import { addDays, isoWeek } from "../mcp/clock";
import { doc, type El, until as settle } from "./dom";

GlobalRegistrator.register({
  url: "http://127.0.0.1:4731/map.html?day=2026-10-10",
});
afterAll(() => GlobalRegistrator.unregister());

const pack = await loadCasePack("maths");
const DAY = "2026-10-10";
const first = pack.topics[0]?.id as string;
const subjects = new Map(pack.topics.map((t) => [t.id, "maths"]));
const lessons = lessonUrls(process.cwd(), subjects, pack.topics);
const firstLesson = lessons[first] as string;

const state = replay([]);
state.topics[first] = { rung: 1, nextDue: DAY, rag: "R" };
state.xp.total = 30;
// The wire carries plain JSON, not replay's prototype-less maps.
const wire = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const served = {
  state: { status: 200, body: wire(state) } as {
    status: number;
    body: unknown;
  },
  next: nextStep(state, DAY, pack, 3) as Next,
  post: { status: 201 },
  snap: {
    status: 201,
    body: {
      local: "/snap.html?token=T",
      lan: "http://192.168.1.11:52311/snap.html?token=T",
      qr: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
      stem: "Find 20% of 45.",
    },
  } as { status: number; body: Record<string, unknown> },
  config: { configured: true, config: { preset: "openai" } } as Record<
    string,
    unknown
  >,
};

doc().body.innerHTML =
  '<div id="stats"></div><div id="today" hidden></div><button id="snap-open"></button><div id="snap"></div><div id="cards"></div><p id="status"></p>';

const calls: { method: string; url: string; body?: unknown }[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  const body = init?.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ method, url, body });
  if (url === "/api/event")
    return Response.json(
      { ...(body as object), t: `${DAY}T16:00:00Z` },
      { status: served.post.status },
    );
  if (url === "/api/state")
    return Response.json(served.state.body, { status: served.state.status });
  if (url === "/api/next?day=2026-13-45")
    return Response.json({ error: "day must be YYYY-MM-DD" }, { status: 400 });
  if (url.startsWith("/api/next")) return Response.json(served.next);
  if (url === "/api/config") return Response.json(served.config);
  if (url === "/api/snap")
    return Response.json(served.snap.body, { status: served.snap.status });
  if (url === "/api/topics")
    return Response.json(pack.topics.map((t) => ({ ...t, subject: "maths" })));
  if (url === "/api/lessons") return Response.json(lessons);
  return new Response("Not found", { status: 404 });
}) as typeof fetch;

// `?dom` makes this a separate module from map.test.ts's import: a cached module never re-runs its page code.
await import(`${path.resolve(import.meta.dir, "../../app/map.js")}?dom`);
type Api = { go: (href: string) => void; reload: () => Promise<void> };
const api = (globalThis as { map?: Api }).map as Api;
const went: string[] = [];
api.go = (href) => went.push(href);

const until = async (fn: () => boolean) => expect(await settle(fn)).toBe(true);
const $ = (sel: string) => doc().querySelector(sel) as El;
const $$ = (sel: string) => [...doc().querySelectorAll(sel)] as El[];
const button = (label: string) =>
  $$("#today button").find((b) => b.textContent === label) as El;
const posts = () => calls.filter((c) => c.method === "POST");

test("render: a card per pack topic with rung, due and lesson link; stats; the boss in the today box; nothing posted", async () => {
  expect(served.next.step.kind).toBe("boss");
  await until(() => $$("#cards .card").length === pack.topics.length);
  const card = $("#cards .card");
  expect(card.classList.contains("r")).toBe(true);
  expect(card.querySelectorAll(".ladder i.on")).toHaveLength(1);
  expect(card.querySelector(".rung")?.textContent).toBe(
    "learning · re-test due today",
  );
  expect(card.querySelector("a")?.getAttribute("href")).toBe(firstLesson);
  const second = $$("#cards .card")[1] as El;
  expect(second.querySelectorAll(".ladder i.on")).toHaveLength(0);
  expect(second.querySelector(".rung")?.textContent).toBe("not started");
  expect(second.classList.contains("o")).toBe(true);
  expect($$("#stats .stat b").map((b) => b.textContent)).toEqual([
    "0 of your 3 this week",
    "30",
    `1 of ${pack.topics.length}`,
  ]);
  expect($("#today").hidden).toBe(false);
  expect($("#today p").textContent).toStartWith(
    "Boss ready. 3 questions from 1 topic",
  );
  expect($$("#today a, #today button")).toHaveLength(1);
  expect($("#today a").getAttribute("href")).toBe(
    "/retest.html?day=2026-10-10",
  );
  expect(posts()).toHaveLength(0);
});

test("continue: Open it goes to the lesson; Done with it posts the served end body verbatim and re-renders in place", async () => {
  const end = endBody({ mode: "lesson", topic: first, t: `${DAY}T15:00:00Z` });
  served.next = {
    ...served.next,
    step: { kind: "continue", mode: "lesson", topic: first, end },
  };
  await api.reload();
  await until(
    () => $("#today p")?.textContent?.startsWith("Lesson open") ?? false,
  );
  expect($("#today p").textContent).toBe(
    "Lesson open: Percentage of an amount.",
  );
  expect($("#today a").textContent).toBe("Open it");
  expect($("#today a").getAttribute("href")).toBe(firstLesson);
  const before = calls.filter((c) => c.url === "/api/state").length;
  button("Done with it").click();
  await until(() => posts().length === 1);
  expect(posts()[0]?.body).toEqual(end);
  await until(
    () => calls.filter((c) => c.url === "/api/state").length > before,
  );
  expect(went).toHaveLength(0);
});

test("start a lesson: posts step.start then goes to the lesson; a failed post re-enables the button and says Not saved", async () => {
  calls.length = 0;
  went.length = 0;
  served.next = nextStep(replay([]), DAY, pack, 3);
  const start = (served.next.step as { start: NewEvent }).start;
  await api.reload();
  await until(() => Boolean(button("Start the lesson")));
  button("Start the lesson").click();
  await until(() => went.length === 1);
  expect(posts().map((p) => p.body)).toEqual([start]);
  expect(went).toEqual([firstLesson]);

  served.post = { status: 500 };
  await api.reload();
  await until(() => Boolean(button("Start the lesson")));
  button("Start the lesson").click();
  await until(() => ($("#today").textContent ?? "").includes("Not saved"));
  expect((button("Start the lesson") as El).disabled).toBe(false);
  expect(went).toHaveLength(1);
  // two more tries with the tutor still closed: one note, not three
  button("Start the lesson").click();
  await until(() => posts().length === 3);
  await until(() => !(button("Start the lesson") as El).disabled);
  button("Start the lesson").click();
  await until(() => posts().length === 4);
  await until(() => !(button("Start the lesson") as El).disabled);
  expect($$("#today .note")).toHaveLength(1);
  expect(went).toHaveLength(1);
  served.post = { status: 201 };
});

test("failure: a 500 from /api/state names the tutor window and leaves the map empty", async () => {
  served.state = { status: 500, body: { error: "x" } };
  await api.reload();
  await until(() => $("#status").textContent !== "");
  expect($("#status").textContent).toBe(
    "The map did not load. Check the tutor window is still open.",
  );
  expect($$("#cards .card")).toHaveLength(0);
  expect($("#today").hidden).toBe(true);
  // AC 7: every POST the page made went to /api/event
  expect(posts().every((p) => p.url === "/api/event")).toBe(true);
});

test("failure: with the server down and the lessons rejection landing last, the status still names the map", async () => {
  const upFetch = globalThis.fetch;
  let lessonsRejected = false;
  globalThis.fetch = (async (url: string): Promise<Response> => {
    if (url === "/api/lessons") {
      await Bun.sleep(20);
      lessonsRejected = true;
    }
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  await api.reload();
  await until(() => lessonsRejected);
  globalThis.fetch = upFetch;
  expect($("#status").textContent).toBe(
    "The map did not load. Check the tutor window is still open.",
  );
  expect($$("#cards .card")).toHaveLength(0);
});

test("failure: only /api/lessons down renders the map with no lesson links and says the lessons did not load", async () => {
  served.state = { status: 200, body: wire(state) };
  const upFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (url === "/api/lessons") return new Response("x", { status: 500 });
    return upFetch(url, init);
  }) as typeof fetch;
  await api.reload();
  await until(() => $$("#cards .card").length === pack.topics.length);
  globalThis.fetch = upFetch;
  expect($("#status").textContent).toBe(
    "The lessons did not load. Check the tutor window is still open.",
  );
  expect($("#cards .card").querySelector("a")).toBeNull();
});

test("F4: the page's ?day= is forwarded to /api/next", () => {
  expect(calls.some((c) => c.url === "/api/next?day=2026-10-10")).toBe(true);
});

test("F4: a malformed ?day= passes the shape check, the server refuses it, and the map says it did not load", async () => {
  // happy-dom's history; the repo's tsconfig carries no DOM lib
  const history = (
    globalThis as unknown as {
      history: { replaceState: (s: null, t: string, u: string) => void };
    }
  ).history;
  history.replaceState(null, "", "/map.html?day=2026-13-45");
  await api.reload();
  await until(() => $("#status").textContent !== "");
  expect(calls.some((c) => c.url === "/api/next?day=2026-13-45")).toBe(true);
  expect($("#status").textContent).toBe(
    "The map did not load. Check the tutor window is still open.",
  );
  expect($$("#cards .card")).toHaveLength(0);
  history.replaceState(null, "", "/map.html?day=2026-10-10");
});

test("examiner: the button posts {} to /api/snap and shows the stem, the QR code and the local link", async () => {
  calls.length = 0;
  $("#snap-open").click();
  await until(() => $("#snap svg") !== null);
  expect(posts()).toEqual([{ method: "POST", url: "/api/snap", body: {} }]);
  expect($("#snap .stem").textContent).toBe("Find 20% of 45.");
  expect($("#snap a").getAttribute("href")).toBe("/snap.html?token=T");
  expect($("#snap").textContent).toContain(
    "Scan this with your phone on the same Wi-Fi. It works once, for 15 minutes.",
  );
});

test("examiner: with no LAN address the map says to drop a photo on this computer", async () => {
  served.snap = {
    status: 201,
    body: { ...served.snap.body, lan: null, qr: null },
  };
  $("#snap-open").click();
  await until(() => ($("#snap").textContent ?? "").includes("cannot reach"));
  expect($("#snap svg")).toBeNull();
  expect($("#snap .note").textContent).toBe(
    "The phone cannot reach this computer from here. Drop a photo on this computer instead.",
  );
  expect($("#snap a").getAttribute("href")).toBe("/snap.html?token=T");
});

test("examiner: a 409 shows its sentence", async () => {
  served.snap = {
    status: 409,
    body: { error: "Try a question first. Then photograph your working." },
  };
  $("#snap-open").click();
  await until(() => ($("#snap").textContent ?? "").includes("Try a question"));
  expect($("#snap .note").textContent).toBe(
    "Try a question first. Then photograph your working.",
  );
});

test("examiner: photos this week and last week show marks left on the table and clean sheets", async () => {
  const week = served.next.flame.week;
  const lastWeek = isoWeek(addDays(served.next.day, -7));
  const withPhotos = wire(state) as unknown as Record<string, unknown>;
  withPhotos.photos = {
    "2000-W01": { taken: 1, marked: 1, marks: 0, of: 9, clean: 0 },
    [lastWeek]: { taken: 1, marked: 1, marks: 0, of: 5, clean: 0 },
    [week]: { taken: 2, marked: 2, marks: 8, of: 10, clean: 1 },
  };
  served.state = { status: 200, body: withPhotos };
  await api.reload();
  await until(() => $$("#stats .stat").length === 5);
  const stats = $$("#stats .stat");
  // derived: this week 10 − 8 = 2 left; the ISO week before 5 − 0 = 5 (2000-W01's 9 is not last week)
  expect(stats[3]?.textContent).toBe(
    "2marks left on the table this weeklast week 5",
  );
  expect(stats[4]?.textContent).toBe("1clean sheets this week");
  served.state = { status: 200, body: wire(state) };
});

test('examiner: an older week with photos is not "last week" (PR #44 F9)', async () => {
  const week = served.next.flame.week;
  const withPhotos = wire(state) as unknown as Record<string, unknown>;
  withPhotos.photos = {
    "2000-W01": { taken: 1, marked: 1, marks: 0, of: 5, clean: 0 },
    [week]: { taken: 2, marked: 2, marks: 8, of: 10, clean: 1 },
  };
  served.state = { status: 200, body: withPhotos };
  await api.reload();
  await until(() => $$("#stats .stat").length === 5);
  expect($$("#stats .stat")[3]?.textContent).toBe(
    "2marks left on the table this week",
  );
  served.state = { status: 200, body: wire(state) };
});

test("examiner: photos stored but none marked (no model) show no marks-left figure (PR #44 F9)", async () => {
  const week = served.next.flame.week;
  const withPhotos = wire(state) as unknown as Record<string, unknown>;
  withPhotos.photos = {
    [week]: { taken: 2, marked: 0, marks: 0, of: 0, clean: 0 },
  };
  served.state = { status: 200, body: withPhotos };
  await api.reload();
  await until(() => $$("#stats .stat").length === 3);
  expect($("#stats").textContent).not.toContain("left on the table");
  served.state = { status: 200, body: wire(state) };
});

const FIREWALL =
  "If the phone cannot open the link, this computer's firewall may be blocking it. Use the link below to drop a photo on this computer instead.";
const NO_MODEL =
  "No model is set up, so the tutor will store the photo but not mark it.";

test("M7: with the phone link shown, the map says the computer's firewall may block it, naming no one system, and points to the drop link", async () => {
  served.snap = {
    status: 201,
    body: {
      local: "/snap.html?token=T",
      lan: "http://192.168.1.11:52311/snap.html?token=T",
      qr: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>',
      stem: "Find 20% of 45.",
    },
  };
  $("#snap-open").click();
  await until(() => $("#snap svg") !== null);
  expect($("#snap").textContent).toContain(FIREWALL);
  expect($("#snap").textContent).not.toMatch(/Windows|Mac/);
  expect($("#snap").textContent).not.toContain(NO_MODEL);
});

test("L16: with no model set up, the minted link says the photo is stored, not marked", async () => {
  served.config = { configured: true, config: { preset: "none" } };
  $("#snap-open").click();
  await until(() => ($("#snap").textContent ?? "").includes(NO_MODEL));
  served.config = { configured: false, config: null };
  $("#snap-open").click();
  await until(() => ($("#snap").textContent ?? "").includes(NO_MODEL));
});

test("the Examiner card promises marking only when a model is set up", () => {
  const html = fs.readFileSync(
    path.resolve(import.meta.dir, "../../app/map.html"),
    "utf8",
  );
  const card = html.slice(
    html.indexOf('id="examiner"'),
    html.indexOf('id="snap-open"'),
  );
  expect(card).toContain(
    "With a model set up, the tutor marks it line by line",
  );
});
