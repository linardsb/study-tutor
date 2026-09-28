import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadTopics } from "../content/pack";
import { lessonUrls } from "./lessons";

const root = process.cwd();

test("lessonUrls: one URL per pack topic, each a lesson file the server can serve", async () => {
  const topics = await loadTopics("maths");
  const urls = lessonUrls(root, "maths", topics);
  expect(Object.keys(urls).sort()).toEqual(topics.map((t) => t.id).sort());
  for (const url of Object.values(urls)) {
    expect(url).toMatch(
      /^\/content\/maths\/lessons\/\d{4}-U\d+-[a-z0-9-]+\.html$/,
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
    const first = lessonUrls(dir, "maths", topics);
    expect(first).toEqual({});
    expect(lessonUrls(dir, "maths", topics)).toBe(first);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
