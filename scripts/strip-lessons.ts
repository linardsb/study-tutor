import { readdirSync } from "node:fs";
import path from "node:path";
import { itemsFileName, loadTopics } from "../src/content/pack";
import type { Topic } from "../src/content/types";

/**
 * `../assets/` and `../page` links become the paths the binary serves. Applied to lessons and reference
 * sheets. The `#explore` section goes with `solids.js` and `three.min.js`: without them its "drag the
 * shape" prose sat above an empty div (PR #26 F4).
 */
const LINKS: [RegExp, string][] = [
  [/href="\.\.\/assets\/style\.css"/g, 'href="/style.css"'],
  [
    /<script src="\.\.\/assets\/quiz\.js"><\/script>/g,
    '<script src="/quiz.js"></script>',
  ],
  [
    /<script src="\.\.\/assets\/generate\.js"><\/script>/g,
    '<script src="/content/maths/generators.js"></script>',
  ],
  [
    /[ \t]*<script src="\.\.\/assets\/(read|solids|vendor\/three\.min)\.js"><\/script>\r?\n/g,
    "",
  ],
  [/[ \t]*<section id="explore">[\s\S]*?<\/section>\r?\n(\r?\n)?/g, ""],
  [/href="\.\.\/progress\.html"/g, 'href="/"'],
  [/href="\.\.\/reference\//g, 'href="/content/maths/reference/'],
  [/href="\.\.\/lessons\//g, 'href="/content/maths/lessons/'],
];

export function rewriteLinks(html: string): string {
  return LINKS.reduce((h, [re, to]) => h.replace(re, to), html);
}

/** Drops every `.q` block from the quiz section and names the items file it now reads. Idempotent. */
export function stripQuiz(html: string, itemsUrl: string): string {
  return html.replace(
    /(<section id="quiz"[^>]*)(>)([\s\S]*?)(<\/section>)/,
    (_, open: string, gt: string, inner: string, close: string) => {
      const at = inner.indexOf('<div class="q"');
      const kept = at === -1 ? inner : `${inner.slice(0, at).trimEnd()}\n  `;
      const tag = open.includes(' data-items="')
        ? open
        : `${open} data-items="${itemsUrl}"`;
      return `${tag}${gt}${kept}${close}`;
    },
  );
}

/** A lesson: quiz stripped, links rewritten. Throws if the code has no topic row. */
export function stripLesson(
  html: string,
  topics: readonly Topic[],
  name = "lesson",
): string {
  const code = /<section id="quiz"[^>]*data-code="(U\d+)"/.exec(html)?.[1];
  if (!code) throw new Error(`${name}: no quiz section with a data-code`);
  const topic = topics.find((t) => t.aliases.includes(code));
  if (!topic)
    throw new Error(`${name}: no topic in topics.json has alias ${code}`);
  return rewriteLinks(
    stripQuiz(html, `/content/maths/items/${itemsFileName(topic.id)}`),
  );
}

/** The v1 maths pack is the only source; paths are fixed, not arguments (PR #23 H1). */
if (import.meta.main) {
  const topics = await loadTopics("maths");
  let changed = 0;
  for (const [dir, fn] of [
    [
      "content/maths/lessons",
      (h: string, n: string) => stripLesson(h, topics, n),
    ],
    ["content/maths/reference", (h: string) => rewriteLinks(h)],
  ] as const) {
    for (const file of readdirSync(dir)
      .filter((f) => f.endsWith(".html"))
      .sort()) {
      const p = path.join(dir, file);
      const before = await Bun.file(p).text();
      const after = fn(before, file);
      if (after !== before) {
        await Bun.write(p, after);
        changed++;
      }
    }
  }
  console.log(`${changed} files changed`);
}
