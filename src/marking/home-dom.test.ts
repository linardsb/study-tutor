/* The home page with nothing saved yet. The page must stay reachable: the getting-started list
   points the parent to settings, and nothing sends the pupil away from Lessons. */

import { afterAll, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { doc, until as settle } from "./dom";

const app = path.resolve(import.meta.dir, "../../app");
const html = fs.readFileSync(path.join(app, "index.html"), "utf8");
const MAIN = html.slice(html.indexOf("<main"), html.indexOf("</main>") + 7);

GlobalRegistrator.register({ url: "http://127.0.0.1:4731/" });
afterAll(() => GlobalRegistrator.unregister());

globalThis.fetch = (async (url: string) => {
  if (url === "/api/config") return Response.json({ configured: false });
  if (url === "/api/state")
    return Response.json({ topics: {}, xp: { total: 0 } });
  return new Response("Not found", { status: 404 });
}) as typeof fetch;

test("with no settings saved, the home page does not redirect to settings", () => {
  expect(html).not.toMatch(/location\.(replace|assign|href)[^;]*setup\.html/);
});

test("with no settings saved, the first step points to settings", async () => {
  doc().body.innerHTML = MAIN;
  await import(`${path.join(app, "home.js")}?dom`);
  const box = doc().querySelector("#getting-started");
  await settle(() => box?.hidden === false);
  const step = doc().querySelector('li[data-step="settings"] .button');
  expect(step?.getAttribute("href")).toBe("/setup.html");
  expect(step?.hidden).toBe(false);
  expect(step?.classList.contains("secondary")).toBe(false);
});
