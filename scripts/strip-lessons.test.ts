import { expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import path from "node:path";
import { loadTopics } from "../src/content/pack";
import { rewriteLinks, stripLesson } from "./strip-lessons";

const topics = await loadTopics("maths");

const fixture = `<!doctype html>
<link rel="stylesheet" href="../assets/style.css">
<p class="crumb"><a href="../progress.html">Progress</a> · U349</p>
<section id="quiz" class="quiz" data-code="U349">
    <h2>Try it</h2>
    <p>Answer from memory.</p>

    <div class="q" data-a="OQ==" data-wrong="NC41PUhhbGYu">
      <p class="stem">1. Find 20% of 45.</p>
      <svg viewBox="0 0 10 10"><title>A box</title><rect width="1" height="1"/></svg>
      <div class="working faded"><p>10% of 45 = 4.5. …</p></div>
      <label>Your answer <input type="text" autocomplete="off"></label>
      <p class="hint" hidden>Two lots of 10%.</p>
      <div class="working" hidden><p>10% of 45 = 4.5. 20% = 9.</p></div>
    </div>

    <div class="q" data-a="MTMw">
      <p class="stem">2. Find 65% of 200.</p>
      <div class="working" hidden><p>60% = 120. 5% = 10. 65% = 130.</p></div>
    </div>
  </section>
<footer><a href="../reference/U349-percentage-of-an-amount.html">U349</a></footer>
<script src="../assets/read.js"></script>
<script src="../assets/generate.js"></script>
<script src="../assets/quiz.js"></script>
`;

const expected = `<!doctype html>
<link rel="stylesheet" href="/style.css">
<p class="crumb"><a href="/">Progress</a> · U349</p>
<section id="quiz" class="quiz" data-code="U349" data-items="/content/maths/items/1MA1-R9-of-an-amount.json">
    <h2>Try it</h2>
    <p>Answer from memory.</p>
  </section>
<footer><a href="/content/maths/reference/U349-percentage-of-an-amount.html">U349</a></footer>
<script src="/content/maths/generators.js"></script>
<script src="/quiz.js"></script>
`;

const reference = `<link rel="stylesheet" href="../assets/style.css">
<p><a href="../progress.html">Progress</a> · <a href="../lessons/0001-U349-percentage-of-an-amount.html">lesson</a></p>
`;

test("stripLesson: the quiz section keeps its heading and intro, gains data-items, and every link points at a served path", () => {
  expect(stripLesson(fixture, topics)).toBe(expected);
  expect(() =>
    stripLesson(
      fixture.replace('data-code="U349"', 'data-code="U999"'),
      topics,
    ),
  ).toThrow("no topic in topics.json has alias U999");
  expect(() => stripLesson("<p>no quiz</p>", topics, "x.html")).toThrow(
    "x.html: no quiz section with a data-code",
  );
});

test("stripLesson and rewriteLinks are idempotent", () => {
  const once = stripLesson(fixture, topics);
  expect(stripLesson(once, topics)).toBe(once);
  const links = rewriteLinks(reference);
  expect(links).toBe(
    `<link rel="stylesheet" href="/style.css">
<p><a href="/">Progress</a> · <a href="/content/maths/lessons/0001-U349-percentage-of-an-amount.html">lesson</a></p>
`,
  );
  expect(rewriteLinks(links)).toBe(links);
});

const html = (dir: string) =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".html"))
    .sort();

test("the committed lessons and reference sheets are fixed points of the strip", async () => {
  const lessons = html("content/maths/lessons");
  expect(lessons).toHaveLength(21);
  for (const file of lessons) {
    const text = await Bun.file(
      path.join("content/maths/lessons", file),
    ).text();
    expect(stripLesson(text, topics, file)).toBe(text);
  }
  const sheets = html("content/maths/reference");
  expect(sheets).toHaveLength(21);
  for (const file of sheets) {
    const text = await Bun.file(
      path.join("content/maths/reference", file),
    ).text();
    expect(rewriteLinks(text)).toBe(text);
  }
});

test("every lesson's data-items names an items file whose items carry the topic its data-code aliases", async () => {
  for (const file of html("content/maths/lessons")) {
    const text = await Bun.file(
      path.join("content/maths/lessons", file),
    ).text();
    const m =
      /<section id="quiz"[^>]*data-code="(U\d+)" data-items="\/content\/maths\/items\/([^"]+)"/.exec(
        text,
      );
    expect(m, file).not.toBeNull();
    const [, code, itemsFile] = m as unknown as [string, string, string];
    const topic = topics.find((t) => t.aliases.includes(code));
    expect(topic, file).toBeDefined();
    const items: { topic: string }[] = await Bun.file(
      path.join("content/maths/items", itemsFile),
    ).json();
    expect(items.length, file).toBeGreaterThan(0);
    for (const item of items) expect(item.topic, file).toBe(topic?.id ?? "");
  }
});

test("every lesson is linked once from app/index.html and every lesson link resolves", async () => {
  const index = await Bun.file("app/index.html").text();
  const links = [
    ...index.matchAll(/href="\/content\/maths\/lessons\/([^"]+)"/g),
  ]
    .map((m) => m[1])
    .sort();
  expect(links).toEqual(html("content/maths/lessons"));
});
