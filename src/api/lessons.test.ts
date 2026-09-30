import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPacks } from "./case";
import { lessonUrls } from "./lessons";

const root = process.cwd();

test("lessonUrls: one URL per pack topic with items, each a lesson file of the topic's subject the server can serve", async () => {
  const { pack, subjects } = await loadPacks(root);
  const urls = lessonUrls(root, subjects, pack.topics);
  // A topic has a lesson exactly when it has items; Year 11 rows have neither yet (a3 plan).
  expect(Object.keys(urls).sort()).toEqual(
    pack.topics
      .filter((t) => (pack.items.get(t.id)?.length ?? 0) > 0)
      .map((t) => t.id)
      .sort(),
  );
  for (const [id, url] of Object.entries(urls)) {
    expect(url).toMatch(
      new RegExp(
        `^/content/${subjects.get(id)}/lessons/\\d{4}-[A-Za-z0-9.-]+\\.html$`,
      ),
    );
    expect(fs.existsSync(path.join(root, url))).toBe(true);
  }
});

test("lessonUrls: a topic with no lesson file is left out, and the second call is the cached object", () => {
  const dir = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "st-lessons-")),
  );
  try {
    const subject = path.join(dir, "content", "maths");
    fs.mkdirSync(path.join(subject, "lessons"), { recursive: true });
    const topics = [
      {
        id: "1MA1/R4",
        title: "Simplifying ratio",
        aliases: ["U687"],
        prerequisites: [],
        tier: "F" as const,
      },
    ];
    fs.writeFileSync(path.join(subject, "topics.json"), JSON.stringify(topics));
    const subjects = new Map([["1MA1/R4", "maths"]]);
    const first = lessonUrls(dir, subjects, topics);
    expect(first).toEqual({});
    expect(lessonUrls(dir, subjects, topics)).toBe(first);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("lessonUrls: a subject with no lessons folder gives no URL and does not throw", () => {
  const dir = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "st-lessons-")),
  );
  try {
    fs.mkdirSync(path.join(dir, "content", "english"), { recursive: true });
    const topics = [
      {
        id: "8702/3.2.3",
        title: "Unseen poetry",
        aliases: [],
        prerequisites: [],
        tier: "F" as const,
      },
    ];
    const subjects = new Map([["8702/3.2.3", "english"]]);
    expect(lessonUrls(dir, subjects, topics)).toEqual({});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
