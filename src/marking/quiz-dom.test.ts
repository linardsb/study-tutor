/* The lesson quiz's code under happy-dom against the science items file and a fake fetch that plays
   the server: /api/event parses the body with the real parseEvent, so a body the route would refuse
   fails here too. Each case builds a fresh quiz with fresh posts, so any one runs alone.
   Registered here and unregistered in afterAll, so no other test file sees a document. */

import { afterAll, beforeEach, expect, test } from "bun:test";
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
const SECTION = `<section class="quiz" data-code="4.1.1.2" data-items="${ITEMS_URL}"><h2>Try it</h2><p>Answer from memory.</p></section>`;

GlobalRegistrator.register({
  url: "http://127.0.0.1:4731/content/science/lessons/0001-8464-4.1.1.2-animal-and-plant-cells.html",
});
afterAll(() => GlobalRegistrator.unregister());

/* next: how the fake answers the next /api/event. "fail" is a 500 with nothing saved; "lost" saves
   the line and then drops the reply, as a closed connection would */
const served: { next: "ok" | "fail" | "lost"; chatDown: boolean } = {
  next: "ok",
  chatDown: false,
};
const posts: Record<string, unknown>[] = [];
const saved = new Set<string>();
const chatGets: string[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (url === ITEMS_URL)
    return new Response(itemsText, {
      headers: { "content-type": "application/json" },
    });
  if (url.startsWith("/api/chat?")) {
    chatGets.push(url);
    if (served.chatDown) throw new TypeError("Failed to fetch");
    const item = new URLSearchParams(url.slice(10)).get("item") ?? "";
    return Response.json({ item, attempted: saved.has(item) });
  }
  if (url === "/api/event") {
    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    posts.push(body);
    const next = served.next;
    served.next = "ok";
    if (next === "fail") return Response.json({ error: "x" }, { status: 500 });
    const e = parseEvent(
      JSON.stringify({ ...body, t: "2026-10-06T16:00:00Z" }),
    );
    if (e === null) return Response.json({ error: "Refused" }, { status: 400 });
    saved.add(String(body.item));
    if (next === "lost") throw new TypeError("Failed to fetch");
    return Response.json(e, { status: 201 });
  }
  return new Response("Not found", { status: 404 });
}) as typeof fetch;

// ?dom: quiz.test.ts and squad-dom.test.ts import quiz.js without a document; a fresh module runs start().
await import(`${path.join(root, "app", "quiz.js")}?dom`);
const initQuiz = (
  globalThis as unknown as {
    quiz: { initQuiz: (section: unknown, items: Item[]) => void };
  }
).quiz.initQuiz;

const until = async (fn: () => boolean) => expect(await settle(fn)).toBe(true);
const $ = (sel: string) => doc().querySelector(sel) as El;
const tick = (r: El) => {
  (r as unknown as { checked: boolean }).checked = true;
};
const bodyText = () => doc().body.textContent ?? "";

beforeEach(() => {
  doc().body.innerHTML = SECTION;
  posts.length = 0;
  saved.clear();
  chatGets.length = 0;
  served.next = "ok";
  served.chatDown = false;
  initQuiz($(".quiz"), ITEMS);
});

/** The open item with an answer typed and Sure ticked, ready to save. */
function filled(): { open: El; btn: El } {
  const open = $(".q.open");
  (open.querySelector("textarea") as El).value = "They are underground.";
  tick(open.querySelector('input[value="sure"]') as El);
  return { open, btn: open.querySelector(".check") as El };
}

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
  const { open, btn } = filled();
  served.next = "fail";
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
  const { open, btn } = filled();
  served.next = "fail";
  btn.click();
  await until(() => !btn.disabled);
  btn.click();
  await until(() => open.classList.contains("done"));
  expect(chatGets.length).toBe(0);
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
  expect((open.querySelector(".ask") as El).hidden).toBe(true);
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
  await until(() => posts.length === 5);
  expect($(".score").textContent).toBe("5/5 on 4.1.1.2. No wrong answers.");
  for (const p of posts) {
    expect(p.v).toBe(1);
    expect(typeof p.correct).toBe("boolean");
  }
});

test("a saved line whose reply was lost is not posted again on retry (PR #54 L2)", async () => {
  const { open, btn } = filled();
  served.next = "lost";
  btn.click();
  await until(() => !btn.disabled);
  expect(open.querySelector(".feedback")?.textContent).toBe(
    "Not saved. Check the tutor window is still open.",
  );
  btn.click();
  await until(() => open.classList.contains("done"));
  expect(chatGets).toEqual(["/api/chat?item=8464%2F4.1.1.2%236"]);
  expect(posts.length).toBe(1);
  expect((open.querySelector(".marked") as El).hidden).toBe(false);
});

test("the first save does not ask the server first", async () => {
  const { open, btn } = filled();
  btn.click();
  await until(() => open.classList.contains("done"));
  expect(chatGets.length).toBe(0);
  expect(posts.length).toBe(1);
});

test("a retry whose check cannot reach the tutor posts, rather than claiming the line was saved", async () => {
  const { open, btn } = filled();
  served.next = "lost";
  btn.click();
  await until(() => !btn.disabled);
  served.chatDown = true;
  btn.click();
  await until(() => open.classList.contains("done"));
  expect(chatGets.length).toBe(1);
  expect(posts.length).toBe(2);
});

test("a refused save on an item answered before is posted again, not reported saved", async () => {
  saved.add(OPEN.id); // an attempt from an earlier visit to this lesson
  const { open, btn } = filled();
  served.next = "fail";
  btn.click();
  await until(() => !btn.disabled);
  btn.click();
  await until(() => open.classList.contains("done"));
  expect(chatGets.length).toBe(0);
  expect(posts.length).toBe(2);
});
