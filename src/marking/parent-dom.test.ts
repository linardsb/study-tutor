/* The weekly digest page's code under happy-dom against a fake fetch that records every request and
   serves a digest view the test sets. Registered here and unregistered in afterAll, so no other test
   file sees a document. */

import { afterAll, expect, test } from "bun:test";
import path from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type { DigestView } from "../api/digest";
import { doc, type El, until as settle } from "./dom";

const DAY = "2026-11-15";
GlobalRegistrator.register({
  url: `http://127.0.0.1:4731/parent.html?day=${DAY}`,
});
afterAll(() => GlobalRegistrator.unregister());

const VIEW: DigestView = {
  now: {
    week: "2026-W46",
    title: "Week of Monday 9 November 2026",
    lines: ["Practice days: 1 of 3.", "Re-tests: 1 taken, 1 passed."],
  },
  last: {
    week: "2026-W45",
    title: "Week of Monday 2 November 2026",
    lines: ["Practice days: 1 of 3.", "<b>x</b>"],
  },
};
const served: { fail: boolean } = { fail: false };

doc().body.innerHTML =
  '<section id="now"></section><section id="last"></section><p id="status"></p>';

const calls: string[] = [];
globalThis.fetch = (async (url: string) => {
  calls.push(url);
  if (served.fail) throw new TypeError("fetch failed");
  if (url === `/api/digest?day=${DAY}`) return Response.json(VIEW);
  return new Response("Not found", { status: 404 });
}) as typeof fetch;

const app = path.resolve(import.meta.dir, "../../app");
await import(`${path.join(app, "parent.js")}?dom`);
type Page = {
  reload: () => Promise<void>;
  TEXT: Record<"notLoaded" | "thisWeek" | "lastWeek", string>;
};
const page = (globalThis as { parent?: Page }).parent as Page;

const until = async (fn: () => boolean) => expect(await settle(fn)).toBe(true);
const $ = (sel: string) => doc().querySelector(sel) as El;
const texts = (sel: string) =>
  [...doc().querySelectorAll(sel)].map((e) => e.textContent ?? "");

test("the page's ?day= is passed through to the route", async () => {
  await until(() => calls.length > 0);
  expect(calls[0]).toBe(`/api/digest?day=${DAY}`);
});

test("both weeks render their heading, title and every line in order", async () => {
  await until(() => texts("#last li").length === 2);
  expect(texts("#now h2")).toEqual([page.TEXT.thisWeek]);
  expect(texts("#now h3")).toEqual([VIEW.now.title]);
  expect(texts("#now li")).toEqual(VIEW.now.lines);
  expect(texts("#last h2")).toEqual([page.TEXT.lastWeek]);
  expect(texts("#last h3")).toEqual([VIEW.last.title]);
  expect(texts("#last li")).toEqual(VIEW.last.lines);
});

test("a line holding markup is shown as text", () => {
  expect($("#last b")).toBeNull();
  expect(texts("#last li")[1]).toBe("<b>x</b>");
});

test("a failed load says so and shows no stale week", async () => {
  served.fail = true;
  await page.reload();
  expect($("#status").textContent).toBe(page.TEXT.notLoaded);
  expect(texts("li")).toEqual([]);
  served.fail = false;
});
