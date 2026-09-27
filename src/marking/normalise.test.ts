import { expect, test } from "bun:test";
import { normaliseAnswer } from "./normalise";

test("normaliseAnswer matches v1 quiz.js norm", () => {
  const rows: [string, string][] = [
    ["£7", "7"],
    ["60 pi", "60pi"],
    ["36 m³", "36m3"],
    ["0.50", "0.5"],
    [".5", "0.5"],
    ["-.5", "-0.5"],
    ["45°", "45"],
    ["−3", "-3"],
    ["1,200", "1200"],
  ];
  for (const [input, want] of rows) expect(normaliseAnswer(input)).toBe(want);
});
