/* The chat panel's code under happy-dom against a fake /api/chat: the teach-back label follows the
   item type. The <main> is the real chat.html markup. Each case imports chat.js afresh, because the
   page code runs once per module. Registered here and unregistered in afterAll. */

import { afterAll, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { doc, type El, until as settle } from "./dom";

const app = path.resolve(import.meta.dir, "../../app");
const html = fs.readFileSync(path.join(app, "chat.html"), "utf8");
const MAIN = html.slice(html.indexOf("<main"), html.indexOf("</main>") + 7);

GlobalRegistrator.register({
  url: "http://127.0.0.1:4731/chat.html?item=8464%2F4.1.1.2%236",
});
afterAll(() => GlobalRegistrator.unregister());

const served = { type: "short", title: "T-short", model: false };
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  if (url === "/api/chat" && init?.method === "POST")
    return Response.json({ kind: "text", text: "Noted." });
  if (url.startsWith("/api/chat?"))
    return Response.json({
      item: "8464/4.1.1.2#6",
      topic: "8464/4.1.1.2",
      title: served.title,
      type: served.type,
      stem: "Explain why.",
      attempted: true,
      model: served.model,
    });
  return new Response("Not found", { status: 404 });
}) as typeof fetch;

const until = async (fn: () => boolean) => expect(await settle(fn)).toBe(true);
const label = () => doc().querySelector('label[for="teach"]')?.textContent;
const button = () => doc().querySelector("#teach-form button")?.textContent;

async function open(query: string, type: string, title: string, model = false) {
  doc().body.innerHTML = MAIN;
  served.type = type;
  served.title = title;
  served.model = model;
  await import(`${path.join(app, "chat.js")}?${query}`);
  await until(() => doc().querySelector("#title")?.textContent === title);
}

test("a written-answer item asks for one point per line", async () => {
  await open("dom", "short", "T-short");
  expect(label()).toBe("Explain your answer, one point per line.");
  expect(button()).toBe("Mark my answer");
});

test("a markable item keeps the markup's step-by-step label", async () => {
  await open("dom2", "cloze", "T-cloze");
  expect(label()).toBe("Explain how you did it, one step per line.");
  expect(button()).toBe("Mark my steps");
});

const aiNote = () => doc().querySelector(".ai-note") as El;

test("M5: no model set up, so no model reply can appear: the AI note is hidden", async () => {
  await open("dom3", "cloze", "T-none");
  expect(aiNote().hidden).toBe(true);
});

test("M5: a model is set up: the AI note shows", async () => {
  await open("dom4", "cloze", "T-model", true);
  expect(aiNote().hidden).toBe(false);
});

test("L11: a multi-line teach-back keeps its line breaks in the You bubble, as text", async () => {
  await open("dom5", "cloze", "T-lines", true);
  const box = doc().querySelector("#teach") as El;
  box.value = "Find 10%.\nDouble it.\n<b>9</b>";
  (doc().querySelector("#teach-form button") as El).click();
  await until(() => doc().querySelector("#log li.you") !== null);
  const you = doc().querySelector("#log li.you") as El;
  const lines = [...you.querySelectorAll("p")].map((p) => p.textContent);
  expect(lines).toEqual(["You: Find 10%.", "Double it.", "<b>9</b>"]);
  expect(you.querySelector("b")).toBeNull();
});

const history = (
  globalThis as unknown as {
    history: { replaceState: (s: null, t: string, url: string) => void };
  }
).history;

test("opened with no question, the page says where to open it from, not a raw error", async () => {
  doc().body.innerHTML = MAIN;
  history.replaceState(null, "", "/chat.html");
  await import(`${path.join(app, "chat.js")}?dom-noitem`);
  await until(() => (doc().querySelector("#stem")?.textContent ?? "") !== "");
  expect(doc().querySelector("#stem")?.textContent).toBe(
    "Open the tutor chat from a question in a lesson or in practice.",
  );
  history.replaceState(null, "", "/chat.html?item=8464%2F4.1.1.2%236");
});
