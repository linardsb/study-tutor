/* The Coach Dan page's code under happy-dom against a fake /api/coach. The <main> is the real
   coach.html markup. Each case loads the page afresh (a new query re-runs its code). Registered here
   and unregistered in afterAll. */

import { afterAll, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { doc, type El, until as settle } from "./dom";

const app = path.resolve(import.meta.dir, "../../app");
const html = fs.readFileSync(path.join(app, "coach.html"), "utf8");
const MAIN = html.slice(html.indexOf("<main"), html.indexOf("</main>") + 7);
const TOPIC = "1MA1/R9/of-an-amount";

GlobalRegistrator.register({ url: "http://127.0.0.1:4731/coach.html" });
const goTo = (url: string) =>
  (
    globalThis as unknown as {
      history: { replaceState: (s: null, t: string, u: string) => void };
    }
  ).history.replaceState(null, "", url);
afterAll(() => GlobalRegistrator.unregister());

const RANK = { name: "Noob", level: 0, toNext: 3 };
const served = { model: false };
const posts: Record<string, unknown>[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (url === "/api/coach" && init?.method === "POST") {
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    posts.push(body);
    if (body.step === "dan")
      return Response.json({ lines: ["20% is 45 / 20."] });
    return Response.json({
      caught: true,
      note: "Dan divided by 20.",
      named: null,
      working: "10% = 4.5, so 20% = 9.",
      rank: RANK,
      saved: true,
    });
  }
  if (url === "/api/coach")
    return Response.json({
      rank: RANK,
      topics: [{ id: TOPIC, title: "Percentage of an amount" }],
    });
  if (url.startsWith("/api/coach?"))
    return Response.json({
      ready: true,
      title: "Percentage of an amount",
      stem: "Find 20% of 45.",
      item: `${TOPIC}#gen`,
      seed: 7,
      model: served.model,
    });
  return new Response("Not found", { status: 404 });
}) as typeof fetch;

const until = async (fn: () => boolean) => expect(await settle(fn)).toBe(true);
const $ = (sel: string) => doc().querySelector(sel) as El;

let loads = 0;
async function load(url: string, model = false) {
  goTo(url);
  doc().body.innerHTML = MAIN;
  served.model = model;
  posts.length = 0;
  await import(`${path.join(app, "coach.js")}?dom${loads++}`);
}

const question = `/coach.html?topic=${encodeURIComponent(TOPIC)}`;

test("M5: the topic list has no model reply: the AI note is hidden", async () => {
  await load("/coach.html", true);
  await until(() => !$("#pick").hidden);
  expect($(".ai-note").hidden).toBe(true);
});

test("M5: a question with no model set up: the AI note is hidden", async () => {
  await load(question, false);
  await until(() => !$("#correct-form").hidden);
  expect($(".ai-note").hidden).toBe(true);
});

test("M5: a question with a model set up: the AI note shows", async () => {
  await load(question, true);
  await until(() => !$("#correct-form").hidden);
  expect($(".ai-note").hidden).toBe(false);
});

test("L14: neither Sure nor Not sure is ticked, and Check asks for one before posting", async () => {
  await load(question, false);
  await until(() => !$("#correct-form").hidden);
  const checked = (id: string) =>
    ($(`#${id}`) as unknown as { checked: boolean }).checked;
  expect(checked("sure")).toBe(false);
  expect(checked("notsure")).toBe(false);
  $("#answer").value = "9";
  ($("#correct-form button") as El).click();
  await until(() => $("#sure-fb").textContent === "Sure or not sure first");
  expect(posts.map((p) => p.step)).toEqual(["dan"]);
  ($("#notsure") as unknown as { checked: boolean }).checked = true;
  ($("#correct-form button") as El).click();
  await until(() => posts.length === 2);
  expect(posts[1]).toMatchObject({ step: "correct", answer: "9", sure: false });
});
