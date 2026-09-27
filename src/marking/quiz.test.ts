import { expect, test } from "bun:test";
import path from "node:path";
import { lcg } from "../../scripts/test-generators";
import { loadGenerators } from "../content/generators";
import type { Generated, Misconception } from "../content/types";
import { normaliseAnswer } from "./normalise";

type QuizItem = {
  id: string;
  topic: string;
  answers: string[];
  misconceptions: Misconception[];
  seed?: number;
};
type Quiz = {
  norm: (s: string) => string;
  lcg: (seed: number) => () => number;
  mark: (
    item: Pick<QuizItem, "answers" | "misconceptions">,
    typed: string,
  ) => { ok: boolean; named: string | null };
  itemFromGenerated: (topic: string, spec: Generated, seed: number) => QuizItem;
};

// The browser file sets a global, the way generators.js does; nothing in it touches document at load.
await import(path.resolve(import.meta.dir, "../../app/quiz.js"));
const quiz = (globalThis as { quiz?: Quiz }).quiz;
if (!quiz) throw new Error("app/quiz.js did not set quiz");

test("norm in the browser is normaliseAnswer on the server", () => {
  for (const s of [
    "£7",
    "60 pi",
    "36 m³",
    "0.50",
    ".5",
    "-.5",
    "45°",
    "−3",
    "1,200",
    "+4",
    "007",
    "12 degrees",
    "y = 7x + 1",
    "3.",
    "30π",
    "36 cm²",
    "2³",
    "5º",
    "3 deg",
    "€1,000.50",
  ])
    expect(quiz.norm(s), s).toBe(normaliseAnswer(s));
});

test("lcg in the browser matches the generator gate's rng", () => {
  const a = quiz.lcg(24301);
  const b = lcg(24301);
  for (let i = 0; i < 10; i++) expect(a()).toBe(b());
});

test("mark: accepted forms, a named misconception with = inside its key, and an unnamed wrong answer", () => {
  const item = {
    answers: ["9", "9.0"],
    misconceptions: [{ answer: "y=7x+1", message: "Same gradient, wrong c." }],
  };
  expect(quiz.mark(item, "9.00")).toEqual({ ok: true, named: null });
  expect(quiz.mark(item, "y = 7x + 1")).toEqual({
    ok: false,
    named: "Same gradient, wrong c.",
  });
  expect(quiz.mark(item, "4")).toEqual({ ok: false, named: null });
});

test("itemFromGenerated carries the topic, the seed and every wrong key as a misconception", async () => {
  const table = await loadGenerators("maths");
  const gen = table.U349;
  if (!gen) throw new Error("no U349 generator");
  const spec = gen(lcg(7));
  const item = quiz.itemFromGenerated("1MA1/R9/of-an-amount", spec, 7);
  expect(item.id).toBe("1MA1/R9/of-an-amount#gen");
  expect(item.topic).toBe("1MA1/R9/of-an-amount");
  expect(item.seed).toBe(7);
  expect(item.answers).toEqual(spec.answers);
  expect(item.misconceptions.map((m) => m.answer)).toEqual(
    Object.keys(spec.wrong),
  );
});
