/* The lesson quiz's code under happy-dom against the science items file and a fake fetch that plays
   the server: /api/event parses the body with the real parseEvent, so a body the route would refuse
   fails here too. Registered here and unregistered in afterAll, so no other test file sees a document. */

import { afterAll, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { Item } from "../content/types";
import { parseEvent } from "../events/types";
import { doc, type El, until as settle } from "./dom";

const root = path.resolve(import.meta.dir, "../..");
const ITEMS_URL = "/content/science/items/8464-4.1.1.2.json";
const itemsText = fs.readFileSync(path.join(root, ITEMS_URL), "utf8");
const ITEMS = JSON.parse(itemsText) as Item[];
const OPEN = ITEMS.find((i) => i.id === "8464/4.1.1.2#6") as Item;

GlobalRegistrator.register({
  url: "http://127.0.0.1:4731/content/science/lessons/0001-8464-4.1.1.2-animal-and-plant-cells.html",
});
afterAll(() => GlobalRegistrator.unregister());

doc().body.innerHTML = `<section class="quiz" data-code="4.1.1.2" data-items="${ITEMS_URL}"><h2>Try it</h2><p>Answer from memory.</p></section>`;

const served = { failNext: false };
const posts: Record<string, unknown>[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (url === ITEMS_URL)
    return new Response(itemsText, {
      headers: { "content-type": "application/json" },
    });
  if (url === "/api/event") {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    posts.push(body);
    if (served.failNext) {
      served.failNext = false;
      return Response.json({ error: "x" }, { status: 500 });
    }
    const e = parseEvent(
      JSON.stringify({ ...body, t: "2026-10-06T16:00:00Z" }),
    );
    return e === null
      ? Response.json({ error: "Refused" }, { status: 400 })
      : Response.json(e, { status: 201 });
  }
  return new Response("Not found", { status: 404 });
}) as typeof fetch;

// ?dom: quiz.test.ts and squad-dom.test.ts import quiz.js without a document; a fresh module runs start().
await import(`${path.join(root, "app", "quiz.js")}?dom`);

const until = async (fn: () => boolean) => expect(await settle(fn)).toBe(true);
const $ = (sel: string) => doc().querySelector(sel) as El;
const tick = (r: El) => {
  (r as unknown as { checked: boolean }).checked = true;
};
const bodyText = () => doc().body.textContent ?? "";

test("five markable items and one open item; the open item has a box and no working", async () => {
  await until(() => doc().querySelectorAll(".q").length === 6);
  expect(doc().querySelectorAll(".q:not(.open)").length).toBe(5);
  const open = $(".q.open");
  expect(open.querySelector("textarea")).not.toBeNull();
  expect(open.querySelector(".working")).toBeNull();
  expect(bodyText()).not.toContain(OPEN.working as string);
  expect(bodyText()).not.toContain(OPEN.mark_scheme as string);
});

test("an empty box or no Sure / Not sure is refused before any post", () => {
  const open = $(".q.open");
  const fb = open.querySelector(".feedback") as El;
  (open.querySelector(".check") as El).click();
  expect(fb.textContent).toBe("Write an answer first, even a guess.");
  (open.querySelector("textarea") as El).value = "They are underground.";
  (open.querySelector(".check") as El).click();
  expect(fb.textContent).toBe("Sure or not sure first");
  expect(posts.length).toBe(0);
});

test("a lost post says not saved, re-enables the button and keeps the link hidden", async () => {
  const open = $(".q.open");
  const btn = open.querySelector(".check") as El;
  tick(open.querySelector('input[value="sure"]') as El);
  served.failNext = true;
  btn.click();
  await until(() => !btn.disabled);
  expect(posts.length).toBe(1);
  expect(open.querySelector(".feedback")?.textContent).toBe(
    "Not saved. Check the tutor window is still open.",
  );
  expect((open.querySelector(".marked") as El).hidden).toBe(true);
  expect(open.classList.contains("done")).toBe(false);
});

test("the retry posts attempt@2 with correct: null, then shows the link; a third click posts nothing", async () => {
  const open = $(".q.open");
  const btn = open.querySelector(".check") as El;
  btn.click();
  await until(() => open.classList.contains("done"));
  expect(posts.length).toBe(2);
  expect(posts[1]).toEqual({
    v: 2,
    type: "attempt",
    item: "8464/4.1.1.2#6",
    topic: "8464/4.1.1.2",
    correct: null,
    sure: true,
    answer: "They are underground.",
  });
  const marked = open.querySelector(".marked") as El;
  expect(marked.hidden).toBe(false);
  expect(marked.querySelector("a")?.getAttribute("href")).toBe(
    "/chat.html?item=8464%2F4.1.1.2%236",
  );
  expect(bodyText()).not.toContain(OPEN.working as string);
  expect(bodyText()).not.toContain(OPEN.mark_scheme as string);
  btn.click();
  await Bun.sleep(20);
  expect(posts.length).toBe(2);
});

test("the open item stays out of the score line; markable items still post attempt@1", async () => {
  const qs = [...doc().querySelectorAll(".q:not(.open)")];
  const markable = ITEMS.filter((i) => (i.answers ?? []).length > 0);
  qs.forEach((q, i) => {
    tick(q.querySelector('input[value="notsure"]') as El);
    (q.querySelector("input[type=text]") as El).value = markable[i]
      ?.answers?.[0] as string;
    (q.querySelector(".check") as El).click();
  });
  await until(() => posts.length === 7);
  expect($(".score").textContent).toBe("5/5 on 4.1.1.2. No wrong answers.");
  for (const p of posts.slice(2)) {
    expect(p.v).toBe(1);
    expect(typeof p.correct).toBe("boolean");
  }
});
