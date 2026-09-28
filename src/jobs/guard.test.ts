import { expect, test } from "bun:test";
import { guardReply, numbersIn } from "./guard";

test("each rule fires on its sample", () => {
  const cases: [string, string][] = [
    ["Nice work 🎉", "emoji"],
    ["Great ✅", "emoji"],
    ["Well done!", "exclamation"],
    ["You are on track for a grade 5", "grade"],
    ["Grade 4 material", "grade"],
    ["you will pass the exam", "grade"],
  ];
  for (const [text, reason] of cases)
    expect({ text, r: guardReply([text], [text]) }).toEqual({
      text,
      r: reason,
    });
  expect(guardReply(["Multiply by 6.3"], ["Find 65% of 200."])).toBe(
    "invented-number",
  );
});

test("clean maths text passes when its numbers come from the sources", () => {
  const clean = [
    "Find 10% of 45 first.",
    "Use #1 and 2*3",
    "50% × 2 ÷ 4",
    "π r² gives the area",
    "x ≠ 3",
    "Go 2 → 3",
    "Predict how many times it lands on red.",
    "The gradient is 2.",
    "No upgrade needed.",
    "Area = ½ × b × h",
    "Angle = 45°",
    "© no",
    "£12.50 each",
    "1:2 ratio",
    "3 cm² → 300 mm²",
    "↔",
  ];
  for (const text of clean)
    expect({ text, r: guardReply([text], [text]) }).toEqual({ text, r: null });
});

test("numbersIn normalises thousands separators and trailing zeros", () => {
  expect(numbersIn("1,200 and 2.50")).toEqual(new Set(["1200", "2.5"]));
  expect(guardReply([], [])).toBeNull();
});
