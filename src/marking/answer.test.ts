import { expect, test } from "bun:test";
import path from "node:path";
import type { Misconception } from "../content/types";
import { markAnswer } from "./answer";

type Quiz = {
  mark: (
    item: { answers: string[]; misconceptions: Misconception[] },
    typed: string,
  ) => { ok: boolean; named: string | null };
};

// The browser file sets a global, the way generators.js does; nothing in it touches document at load.
await import(path.resolve(import.meta.dir, "../../app/quiz.js"));
const quiz = (globalThis as { quiz?: Quiz }).quiz;
if (!quiz) throw new Error("app/quiz.js did not set quiz");

const item = {
  answers: ["9", "£9", "9.00"],
  misconceptions: [
    { answer: "4.5", message: "That is 10%, not 20%." },
    { answer: "36", message: "That takes 20% off instead of finding it." },
  ],
};

test("markAnswer on the server is quiz.mark in the browser", () => {
  const rows = [
    "9",
    "£9",
    " 9.0 ",
    "9.00",
    "09",
    "4.5",
    "4,5",
    "36",
    "£36",
    "7",
    "",
    "nine",
  ];
  for (const s of rows)
    expect({ s, r: markAnswer(item, s) }).toEqual({ s, r: quiz.mark(item, s) });
  expect(markAnswer(item, "4.5")).toEqual({
    ok: false,
    named: "That is 10%, not 20%.",
  });
  expect(markAnswer(item, "7")).toEqual({ ok: false, named: null });
  expect(markAnswer(item, "£9")).toEqual({ ok: true, named: null });
});

test("markAnswer: an item with no answers is never right", () => {
  expect(markAnswer({ misconceptions: [] }, "9")).toEqual({
    ok: false,
    named: null,
  });
});
