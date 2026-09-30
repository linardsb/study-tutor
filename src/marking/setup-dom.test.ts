/* The settings page's code under happy-dom against a fake fetch. The <main> is the real setup.html
   markup. Registered here and unregistered in afterAll. */

import { afterAll, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { doc, type El, until as settle } from "./dom";

const app = path.resolve(import.meta.dir, "../../app");
const html = fs.readFileSync(path.join(app, "setup.html"), "utf8");
const MAIN = html.slice(html.indexOf("<main"), html.indexOf("</main>") + 7);

GlobalRegistrator.register({ url: "http://127.0.0.1:4731/setup.html" });
afterAll(() => GlobalRegistrator.unregister());

globalThis.fetch = (async (url: string) => {
  if (url === "/api/config")
    return Response.json({
      configured: false,
      config: null,
      weeklyTarget: 3,
      defaultCap: 1000000,
      presets: [
        {
          id: "none",
          label: "No model",
          base_url: "",
          model: "",
          needsKey: false,
        },
      ],
    });
  if (url === "/api/usage")
    return Response.json({ month: "2026-10", tokens: 0 });
  if (url === "/api/update")
    return Response.json({ version: "0.1.2", update: null });
  return new Response("Not found", { status: 404 });
}) as typeof fetch;

const until = async (fn: () => boolean) => expect(await settle(fn)).toBe(true);

test("L5: the settings page shows the running version, from /api/update", async () => {
  doc().body.innerHTML = MAIN;
  await import(`${path.join(app, "setup.js")}?dom`);
  const version = () =>
    (doc().querySelector("#version") as El | null)?.textContent;
  await until(() => version() === "Study tutor version 0.1.2.");
});
