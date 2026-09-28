/* The map page's code under happy-dom against a fake fetch that records every request. Registered
   here and unregistered in afterAll, so no other test file sees a document. */

import { afterAll, expect, test } from "bun:test";
import path from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { loadCasePack } from "../api/case";
import { lessonUrls } from "../api/lessons";
import { replay } from "../events/replay";
import type { NewEvent } from "../events/types";
import { type Next, nextStep } from "../flow/next";
import { endBody } from "../flow/session";
import { doc, type El, until as settle } from "./dom";

GlobalRegistrator.register({ url: "http://127.0.0.1:4731/map.html" });
afterAll(() => GlobalRegistrator.unregister());

const pack = await loadCasePack("maths");
const DAY = "2026-10-10";
const first = pack.topics[0]?.id as string;
const lessons = lessonUrls(process.cwd(), "maths", pack.topics);
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
};

doc().body.innerHTML =
  '<div id="stats"></div><div id="today" hidden></div><div id="cards"></div><p id="status"></p>';

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
  if (url === "/api/next") return Response.json(served.next);
  if (url === "/content/maths/topics.json") return Response.json(pack.topics);
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
    "1 of 21",
  ]);
  expect($("#today").hidden).toBe(false);
  expect($("#today p").textContent).toStartWith(
    "Boss ready. 3 questions from 1 topic",
  );
  expect($$("#today a, #today button")).toHaveLength(1);
  expect($("#today a").getAttribute("href")).toBe("/retest.html");
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
