import { mkdirSync, readdirSync } from "node:fs";
import path from "node:path";
import { itemsFileName, loadTopics } from "../src/content/pack";
import type { Item, Misconception, Topic } from "../src/content/types";

export interface ParsedItem {
  stem: string;
  figure?: string;
  scaffold?: string;
  hint: string;
  answers: string[];
  working: string;
  misconceptions: Misconception[];
}

/** base64 in the lesson markup is UTF-8, as v1 quiz.js decodeB64 reads it. */
export function decodeB64(s: string): string {
  return Buffer.from(s, "base64").toString("utf8");
}

/**
 * One data-wrong pair is `<typed answer>=<message>`. Keys can hold "=" (`y=7x+1`) and messages can hold
 * " = " (`10 = 6 + c`), so the split is the last "=" with a non-space character on both sides.
 */
export function splitWrong(pair: string): Misconception {
  let at = -1;
  for (let i = 1; i < pair.length - 1; i += 1)
    if (pair[i] === "=" && pair[i - 1] !== " " && pair[i + 1] !== " ") at = i;
  if (at < 1) throw new Error(`no key=message split in "${pair}"`);
  const answer = pair.slice(0, at).trim();
  if (/\s/.test(answer))
    throw new Error(
      `wrong-answer key "${answer}" holds a space: an unspaced "=" inside the message of "${pair}"?`,
    );
  return { answer, message: pair.slice(at + 1).trim() };
}

function text(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ")
    .replace(/&times;/g, "×")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

function first(re: RegExp, s: string): string | undefined {
  return re.exec(s)?.[1];
}

/** The quiz section's U-code and its `.q` blocks. Every block is one item. */
export function parseLesson(
  html: string,
  name = "lesson",
): { code: string; items: ParsedItem[] } {
  const m =
    /<section id="quiz"[^>]*data-code="(U\d+)"[^>]*>([\s\S]*?)<\/section>/.exec(
      html,
    );
  const code = m?.[1];
  const section = m?.[2];
  if (!code || section === undefined)
    throw new Error(`${name}: no quiz section with a data-code`);
  const items = section
    .split('<div class="q"')
    .slice(1)
    .map((block, i) => {
      const need = (label: string, v: string | undefined): string => {
        if (v === undefined)
          throw new Error(`${name} item ${i + 1}: no ${label}`);
        return v;
      };
      const wrong = first(/data-wrong="([^"]*)"/, block);
      const item: ParsedItem = {
        stem: text(
          need("stem", first(/<p class="stem">([\s\S]*?)<\/p>/, block)),
        ).replace(/^\d+\.\s+/, ""),
        hint: text(
          need("hint", first(/<p class="hint" hidden>([\s\S]*?)<\/p>/, block)),
        ),
        answers: decodeB64(need("data-a", first(/data-a="([^"]*)"/, block)))
          .split("|")
          .map((s) => s.trim()),
        working: text(
          need(
            "working",
            first(/<div class="working" hidden><p>([\s\S]*?)<\/p>/, block),
          ),
        ),
        misconceptions: wrong
          ? decodeB64(wrong).split("|").map(splitWrong)
          : [],
      };
      const figure = first(/(<svg[\s\S]*?<\/svg>)/, block);
      if (figure) item.figure = figure;
      const scaffold = first(
        /<div class="working faded"><p>([\s\S]*?)<\/p>/,
        block,
      );
      if (scaffold) item.scaffold = text(scaffold);
      return item;
    });
  return { code, items };
}

/** Items per topic id, from every lesson in the folder. A lesson whose code has no topic row is an error. */
export async function convert(
  lessonsDir: string,
  topics: Topic[],
): Promise<Map<string, Item[]>> {
  const out = new Map<string, Item[]>();
  const files = readdirSync(lessonsDir)
    .filter((f) => f.endsWith(".html"))
    .sort((a, b) => a.localeCompare(b));
  for (const file of files) {
    const html = await Bun.file(path.join(lessonsDir, file)).text();
    const { code, items } = parseLesson(html, file);
    const topic = topics.find((t) => t.aliases.includes(code));
    if (!topic)
      throw new Error(`${file}: no topic in topics.json has alias ${code}`);
    out.set(
      topic.id,
      items.map(
        (
          { stem, figure, scaffold, hint, answers, working, misconceptions },
          i,
        ) => ({
          id: `${topic.id}#${i + 1}`,
          topic: topic.id,
          type: "cloze" as const,
          stem,
          ...(figure === undefined ? {} : { figure }),
          ...(scaffold === undefined ? {} : { scaffold }),
          hint,
          answers,
          working,
          misconceptions,
        }),
      ),
    );
  }
  return out;
}

/** The v1 maths lessons are the only hand-written quiz blocks; the paths are fixed, not arguments. */
if (import.meta.main) {
  const lessonsDir = "content/maths/lessons";
  const outDir = "content/maths/items";
  const topics = await loadTopics("maths");
  mkdirSync(outDir, { recursive: true });
  const packs = await convert(lessonsDir, topics);
  let count = 0;
  for (const [id, items] of packs) {
    count += items.length;
    await Bun.write(
      path.join(outDir, itemsFileName(id)),
      `${JSON.stringify(items, null, 2)}\n`,
    );
  }
  console.log(`${packs.size} topics, ${count} items`);
}
