import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { ragFor } from "../flow/diagnostic";
import { INTERVIEW_QUESTIONS, intakeRecord } from "../flow/intake";
import { guardReply } from "../jobs/guard";

type Text = string | ((...args: never[]) => string) | Record<string, string>;
type IntakePage = {
  TEXT: Record<string, Text>;
  ragFor: (correct: boolean, sure: boolean) => string;
  intakeBody: (door: string, rows: { topic: string; rag: string }[]) => unknown;
  tickable: (row: { rag: string | null }) => boolean;
};

// The browser files set globals; with no document, intake.js runs no page code at load.
const app = path.resolve(import.meta.dir, "../../app");
await import(path.join(app, "quiz.js"));
await import(path.join(app, "retest.js"));
await import(path.join(app, "intake.js"));
const page = (globalThis as { intake?: IntakePage }).intake;
if (!page) throw new Error("app/intake.js did not set intake");

test("ragFor agrees with src/flow/diagnostic.ts on all four inputs", () => {
  for (const correct of [true, false])
    for (const sure of [true, false])
      expect(page.ragFor(correct, sure)).toBe(ragFor(correct, sure));
});

test("intakeBody agrees with intakeRecord, and both refuse an empty list", () => {
  const rows = [
    { topic: "1MA1/R9/of-an-amount", rag: "R" as const },
    { topic: "8464/4.1.1.2", rag: "G" as const },
  ];
  for (const door of ["sheet", "interview", "diagnostic"] as const)
    expect(page.intakeBody(door, rows)).toEqual(intakeRecord(door, rows));
  expect(page.intakeBody("sheet", [])).toBeNull();
  expect(intakeRecord("sheet", [])).toBeNull();
});

test("tickable: only a row with an R/A/G", () => {
  expect(page.tickable({ rag: "A" })).toBe(true);
  expect(page.tickable({ rag: null })).toBe(false);
});

test("the three questions match INTERVIEW_QUESTIONS", () => {
  expect(page.TEXT.questions).toEqual(INTERVIEW_QUESTIONS);
});

test("encode's limits match app/snap.js", () => {
  const read = (f: string) => fs.readFileSync(path.join(app, f), "utf8");
  const limits = (src: string) => ({
    long: /const LONG_SIDE = ([^;]+);/.exec(src)?.[1],
    max: /const MAX_BYTES = ([^;]+);/.exec(src)?.[1],
    types: /const SENDABLE = new Set\(([^)]+)\)/.exec(src)?.[1],
  });
  const snap = limits(read("snap.js"));
  expect(snap.long).toBeDefined();
  expect(limits(read("intake.js"))).toEqual(snap);
});

/** Every string in TEXT, a function called with a sample code. */
function strings(text: Record<string, Text>): string[] {
  return Object.values(text).flatMap((v) => {
    if (typeof v === "function") return [(v as (x: unknown) => string)("U349")];
    if (typeof v === "string") return [v];
    return Object.values(v);
  });
}

test("register: no exclamation mark, emoji or grade word on the page or in any string", () => {
  const html = fs
    .readFileSync(path.join(app, "intake.html"), "utf8")
    .replace(/<[^>]+>/g, " ");
  const all = [html, ...strings(page.TEXT)];
  expect(all.length).toBeGreaterThan(40);
  // The texts are their own sources, so only the register checks can fire.
  for (const s of all)
    expect({ s, broken: guardReply([s], [s]) }).toEqual({ s, broken: null });
  expect(html).toContain(page.TEXT.isAI as string);
});
