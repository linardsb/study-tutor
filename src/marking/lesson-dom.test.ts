/* A real lesson page under happy-dom with quiz.js loaded as the page loads it: the injected main nav,
   the lesson's done control (the same session end the map's "Done with it" posts), the scoreline's
   topic name and the provider-neutral wording. The fake fetch plays the server; /api/event parses
   the body with the real parseEvent. Registered here and unregistered in afterAll. */

import { afterAll, beforeAll, beforeEach, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { parseEvent } from "../events/types";
import { doc, type El, until as settle } from "./dom";

const root = path.resolve(import.meta.dir, "../..");
const LESSON = "/content/maths/lessons/0001-U349-percentage-of-an-amount.html";
const TOPIC = "1MA1/R9/of-an-amount";
const ITEMS_URL = "/content/maths/items/1MA1-R9-of-an-amount.json";
const itemsText = fs.readFileSync(path.join(root, ITEMS_URL), "utf8");
const html = fs.readFileSync(path.join(root, LESSON), "utf8");
const MAIN = html.slice(html.indexOf("<main"), html.indexOf("</main>") + 7);

GlobalRegistrator.register({ url: `http://127.0.0.1:4731${LESSON}` });
afterAll(() => GlobalRegistrator.unregister());

const END = {
  v: 1,
  type: "session",
  phase: "end",
  mode: "lesson",
  topic: TOPIC,
};
const served: { step: unknown } = { step: { kind: "none" } };
const posts: Record<string, unknown>[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (url === ITEMS_URL)
    return new Response(itemsText, {
      headers: { "content-type": "application/json" },
    });
  if (url === "/api/lessons") return Response.json({ [TOPIC]: LESSON });
  if (url === "/api/next")
    return Response.json({ day: "2026-10-06", step: served.step });
  if (url === "/api/event") {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    posts.push(body);
    const e = parseEvent(
      JSON.stringify({ ...body, t: "2026-10-06T16:00:00Z" }),
    );
    if (e === null) return Response.json({ error: "Refused" }, { status: 400 });
    return Response.json(e, { status: 201 });
  }
  return new Response("Not found", { status: 404 });
}) as typeof fetch;

const until = async (fn: () => boolean) => expect(await settle(fn)).toBe(true);
const $ = (sel: string) => doc().querySelector(sel) as El;
const $$ = (sel: string) => [...doc().querySelectorAll(sel)];

let loads = 0;
async function load() {
  doc().body.innerHTML = MAIN;
  posts.length = 0;
  await import(`${path.join(root, "app", "quiz.js")}?lesson${loads++}`);
  await until(() => doc().querySelectorAll(".quiz .q").length > 0);
}

beforeAll(load);
beforeEach(() => {
  posts.length = 0;
  served.step = { kind: "none" };
});

test("M3: the lesson page gets the main nav, with every app page", () => {
  const links = $$("header.topbar nav.topnav a").map((a) => a.textContent);
  expect(links).toEqual([
    "Lessons",
    "Map",
    "Practice",
    "Today's case",
    "Squad",
    "Coach Dan",
  ]);
});

test("M3: done with an open lesson session posts the served end body verbatim, as the map does", async () => {
  served.step = { kind: "continue", mode: "lesson", topic: TOPIC, end: END };
  const btn = $("#lesson-done button");
  expect(btn.textContent).toBe("Done with this lesson");
  btn.click();
  await until(() => ($("#lesson-done").textContent ?? "").includes("Saved"));
  expect(posts).toEqual([END]);
  expect($("#lesson-done a").getAttribute("href")).toBe("/map.html");
});

test("M3: done with no lesson session open posts a start then the end for this lesson's topic", async () => {
  await load();
  served.step = {
    kind: "practice",
    topic: TOPIC,
    start: { ...END, phase: "start", mode: "practice" },
  };
  $("#lesson-done button").click();
  await until(() => ($("#lesson-done").textContent ?? "").includes("Saved"));
  expect(posts).toEqual([{ ...END, phase: "start" }, END]);
});

test("L13: the scoreline names the topic, not its code", async () => {
  await load();
  const q = $(".quiz .q");
  (q.querySelector("input[type=text], input:not([type])") as El).value = "9";
  (
    q.querySelector('input[value="sure"]') as unknown as { checked: boolean }
  ).checked = true;
  (q.querySelector(".check") as El).click();
  await until(() => $(".scoreline") !== null);
  expect($(".scoreline").textContent).toContain("on Percentage of an amount.");
  expect($(".scoreline").textContent).not.toContain("U349");
});

test("M2: no button or feedback names one provider", async () => {
  await load();
  const labels = $$("#method .copy").map((b) => b.getAttribute("aria-label"));
  expect(labels[0]).toBe("Copy step 1 as a question");
  const q = $(".quiz .q");
  const input = q.querySelector("input[type=text], input:not([type])") as El;
  (
    q.querySelector('input[value="sure"]') as unknown as { checked: boolean }
  ).checked = true;
  for (const guess of ["1", "2"]) {
    input.value = guess;
    (q.querySelector(".check") as El).click();
  }
  const fb = (q.querySelector(".feedback") as El).textContent ?? "";
  expect(fb).toBe(
    "Not this time. Read the working and find the step where yours went a different way.",
  );
});
