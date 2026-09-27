import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { itemsFileName, loadTopics } from "../src/content/pack";
import { convert, parseLesson, splitWrong } from "./convert-lessons";

test("splitWrong: plain key, key holding '=', message holding ' = ' and starting with a symbol", () => {
  expect(splitWrong("4.5=That is 10% of 45.")).toEqual({
    answer: "4.5",
    message: "That is 10% of 45.",
  });
  expect(
    splitWrong(
      "y=2x+16=You added 6 instead of taking it away. 10 = 6 + c, so c = 10 − 6.",
    ),
  ).toEqual({
    answer: "y=2x+16",
    message:
      "You added 6 instead of taking it away. 10 = 6 + c, so c = 10 − 6.",
  });
  expect(
    splitWrong(
      "60=½ is cos 60°, but you have O and H, so it is sin. sin 30° = ½.",
    ),
  ).toEqual({
    answer: "60",
    message: "½ is cos 60°, but you have O and H, so it is sin. sin 30° = ½.",
  });
});

const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const fixture = `<section id="quiz" class="quiz" data-code="U999">
  <h2>Try it</h2>
  <div class="q" data-a="${b64("9|9.0")}" data-wrong="${b64("4.5=Half way.|18=Twice.")}">
    <p class="stem">1. Find 20% of 45. Finish it.</p>
    <svg viewBox="0 0 10 10"><title>A box</title><rect width="1" height="1"/></svg>
    <div class="working faded"><p>10% of 45 = 4.5. …</p></div>
    <label>Your answer <input type="text"></label>
    <p class="hint" hidden>Two lots of 10%.</p>
    <div class="working" hidden><p>10% of 45 = 4.5. 20% = 9.</p></div>
  </div>
  <div class="q" data-a="${b64("130")}" data-wrong="${b64("120=Not yet.|65=Copied.")}">
    <p class="stem">2. Find 65% of 200.</p>
    <p class="hint" hidden>10% of 200 is 20.</p>
    <div class="working" hidden><p>60% = 120. 5% = 10. 65% = 130.</p></div>
  </div>
</section>`;

test("parseLesson: stems lose their number, figure and scaffold appear only where the lesson has them", () => {
  const { code, items } = parseLesson(fixture, "fixture");
  expect(code).toBe("U999");
  expect(items).toHaveLength(2);
  const [a, b] = items;
  expect(a?.stem).toBe("Find 20% of 45. Finish it.");
  expect(a?.figure).toStartWith("<svg");
  expect(a?.figure).toEndWith("</svg>");
  expect(a?.scaffold).toBe("10% of 45 = 4.5. …");
  expect(a?.answers).toEqual(["9", "9.0"]);
  expect(a?.misconceptions).toEqual([
    { answer: "4.5", message: "Half way." },
    { answer: "18", message: "Twice." },
  ]);
  expect(b?.stem).toBe("Find 65% of 200.");
  expect(b).not.toHaveProperty("figure");
  expect(b).not.toHaveProperty("scaffold");
  expect(b?.working).toBe("60% = 120. 5% = 10. 65% = 130.");
});

test("convert refuses a lesson whose code has no topic row", async () => {
  const topics = (await loadTopics("maths")).filter(
    (t) => !t.aliases.includes("U349"),
  );
  await expect(convert("content/maths/lessons", topics)).rejects.toThrow(
    "no topic in topics.json has alias U349",
  );
});

test("the committed items are what the converter produces from the committed lessons", async () => {
  const topics = await loadTopics("maths");
  const packs = await convert("content/maths/lessons", topics);
  const files = readdirSync("content/maths/items").sort();
  expect(files).toEqual([...packs.keys()].map(itemsFileName).sort());
  for (const [id, items] of packs) {
    const committed = await Bun.file(
      `content/maths/items/${itemsFileName(id)}`,
    ).json();
    expect(committed).toEqual(items);
  }
});
