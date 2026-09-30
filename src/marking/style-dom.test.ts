/* Layout rules the page tests cannot see: happy-dom lays nothing out, so these read app/style.css and
   the pages' inline styles as text. Each names the audit finding it guards. */

import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";

const app = path.resolve(import.meta.dir, "../../app");
const css = fs.readFileSync(path.join(app, "style.css"), "utf8");
const pages = fs
  .readdirSync(app)
  .filter((f) => f.endsWith(".html"))
  .map((f) => fs.readFileSync(path.join(app, f), "utf8"));

/** The body of the first rule for `selector` inside the phone-width media block that holds it. */
function phoneRule(selector: string): string {
  const blocks = css.split("@media (max-width: 600px)").slice(1);
  for (const whole of blocks) {
    const b = whole.slice(0, whole.indexOf("\n}\n")); // the media block alone
    const at = b.indexOf(`${selector} {`);
    if (at !== -1) return b.slice(at, b.indexOf("}", at));
  }
  return "";
}

test("M6: at phone width the main nav wraps, so every link is reachable without a hidden scroll", () => {
  const rule = phoneRule(".topnav");
  expect(rule).toContain("flex-wrap: wrap");
  expect(rule).toContain("overflow: visible");
  expect(rule).not.toContain("mask-image");
});

test("L13: no label is forced to capitals (sentence case)", () => {
  const caps = (text: string) => text.includes("text-transform: uppercase");
  expect(caps(css)).toBe(false);
  expect(pages.filter(caps)).toEqual([]);
});

test("L16: the settings Save bar sticks to the bottom of the window", () => {
  const at = css.indexOf(".app .settings .save-bar {");
  const rule = css.slice(at, css.indexOf("}", at));
  expect(rule).toContain("position: sticky");
  expect(rule).toContain("bottom: 0");
});
