/* The chat panel's code under happy-dom against a fake /api/chat: the teach-back label follows the
   item type. The <main> is the real chat.html markup. Each case imports chat.js afresh, because the
   page code runs once per module. Registered here and unregistered in afterAll. */

import { afterAll, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { doc, until as settle } from "./dom";

const app = path.resolve(import.meta.dir, "../../app");
const html = fs.readFileSync(path.join(app, "chat.html"), "utf8");
const MAIN = html.slice(html.indexOf("<main"), html.indexOf("</main>") + 7);

GlobalRegistrator.register({
  url: "http://127.0.0.1:4731/chat.html?item=8464%2F4.1.1.2%236",
});
afterAll(() => GlobalRegistrator.unregister());

const served = { type: "short", title: "T-short" };
globalThis.fetch = (async (url: string) => {
  if (url.startsWith("/api/chat?"))
    return Response.json({
      item: "8464/4.1.1.2#6",
      topic: "8464/4.1.1.2",
      title: served.title,
      type: served.type,
      stem: "Explain why.",
      attempted: true,
      model: false,
    });
  return new Response("Not found", { status: 404 });
}) as typeof fetch;

const until = async (fn: () => boolean) => expect(await settle(fn)).toBe(true);
const label = () => doc().querySelector('label[for="teach"]')?.textContent;
const button = () => doc().querySelector("#teach-form button")?.textContent;

async function open(query: string, type: string, title: string) {
  doc().body.innerHTML = MAIN;
  served.type = type;
  served.title = title;
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
