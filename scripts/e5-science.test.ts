/* E5: the science topic from intake to a passed re-test, over the real content/ and a tmp data/, with
   engine functions only. It lives in scripts/ so the pack adds nothing under src/. The order is the
   app's own: the map reads the intake, the lesson posts attempts, the boss runs on nextDue. */
import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadPacks } from "../src/api/case";
import { postEvent } from "../src/api/event";
import { lessonUrls } from "../src/api/lessons";
import { currentState } from "../src/api/state";
import { toItemView } from "../src/content/pack";
import type { Item } from "../src/content/types";
import { nextStep } from "../src/flow/next";
import { markAnswer } from "../src/marking/answer";
import { runTool, type ToolContext } from "../src/mcp/tools";

const SUBJECT = "science";
const TOPIC = "8464/4.1.1.2";
const ALIAS = "4.1.1.2";
const LESSON =
  "/content/science/lessons/0001-8464-4.1.1.2-animal-and-plant-cells.html";
const SHORT = `${TOPIC}#6`;

const root = ".";
const { pack, subjects } = await loadPacks(root);
const items = pack.items.get(TOPIC) ?? [];
const byId = (id: string) => items.find((i) => i.id === id) as Item;

test("E5: intake by alias, lesson, attempts, a boss three days on, a passed re-test, rung 2; lesson URL and MCP tools for the new subject", async () => {
  expect(subjects.get(TOPIC)).toBe(SUBJECT);
  const dir = fs.realpathSync.native(
    fs.mkdtempSync(path.join(os.tmpdir(), "st-e5-")),
  );
  const dataDir = path.join(dir, "data");
  let T = "2026-10-05T16:00:00Z";
  const post = (body: unknown) => {
    const r = postEvent(body, dataDir, pack.topics, () => T);
    expect({ body, status: r.status }).toEqual({ body, status: 201 });
    return r;
  };
  try {
    // 1: an intake names the topic by its school code; the map shows it red
    post({
      v: 1,
      type: "intake",
      door: "sheet",
      topics: [{ topic: ALIAS, rag: "R" }],
    });
    expect(currentState(dataDir).topics[TOPIC]).toEqual({
      rung: 0,
      nextDue: null,
      rag: "R",
    });

    // 2: red comes first, so the next step is this topic's lesson
    const lesson = nextStep(currentState(dataDir), "2026-10-05", pack, 3).step;
    expect(lesson).toMatchObject({ kind: "lesson", topic: TOPIC });
    if (lesson.kind !== "lesson") throw new Error("not a lesson");
    post(lesson.start);

    // 3: every answerable item attempted right, then the served end
    const answerable = items.filter((i) => (i.answers?.length ?? 0) > 0);
    expect(answerable).toHaveLength(5); // derived: 3 vocab + 1 label + 1 sequence
    for (const item of answerable) {
      const answer = item.answers?.[0] ?? "";
      const correct = markAnswer(item, answer).ok;
      expect({ id: item.id, correct }).toEqual({ id: item.id, correct: true });
      post({
        v: 1,
        type: "attempt",
        item: item.id,
        topic: TOPIC,
        correct,
        sure: true,
        answer,
      });
    }
    const open = nextStep(currentState(dataDir), "2026-10-05", pack, 3).step;
    expect(open.kind).toBe("continue");
    if (open.kind !== "continue") throw new Error("not open");
    post(open.end);
    // derived: 2026-10-05 + NEXT_DAYS[1] (3 days)
    expect(currentState(dataDir).topics[TOPIC]).toMatchObject({
      rung: 1,
      nextDue: "2026-10-08",
    });

    // 4: three days on, the boss: 3 fixed slots from the answerable items, never the short item
    T = "2026-10-08T16:00:00Z";
    const step = nextStep(currentState(dataDir), "2026-10-08", pack, 3).step;
    expect(step.kind).toBe("boss");
    if (step.kind !== "boss") throw new Error("not a boss");
    expect(step.boss.slots).toHaveLength(3); // derived: no generator, RETEST_SLOTS = 3
    for (const s of step.boss.slots) {
      expect(s.topic).toBe(TOPIC);
      expect(s.item).not.toBeNull();
      expect(s.item).not.toBe(SHORT);
    }
    post(step.start);

    // 5: each slot marked right by its type's marker; the retest, then the served end
    for (const s of step.boss.slots) {
      const item = byId(s.item as string);
      expect(markAnswer(item, item.answers?.[0] ?? "").ok).toBe(true);
    }
    post({
      v: 1,
      type: "retest",
      topic: TOPIC,
      score: 3,
      of: 3,
      passed: true,
      seed: step.boss.seed,
    });
    const after = nextStep(currentState(dataDir), "2026-10-08", pack, 3).step;
    expect(after.kind).toBe("continue");
    if (after.kind !== "continue") throw new Error("not open");
    post(after.end);
    // derived: 2026-10-08 + NEXT_DAYS[2] (10 days)
    expect(currentState(dataDir).topics[TOPIC]).toMatchObject({
      rung: 2,
      nextDue: "2026-10-18",
    });

    // 6: the lesson list names this subject's lesson
    expect(lessonUrls(root, subjects, pack.topics)[TOPIC]).toBe(LESSON);

    // 7: the short item's view holds no answer and no mark scheme
    const view = JSON.parse(JSON.stringify(toItemView(byId(SHORT))));
    expect(view).not.toHaveProperty("mark_scheme");
    expect(view).not.toHaveProperty("answers");

    // 8: the MCP tools find the topic by alias, and read_state unlocks only attempted items
    const ctx: ToolContext = {
      root,
      dataDir,
      subjects,
      topics: pack.topics,
      origin: "http://127.0.0.1:1",
      now: () => T,
    };
    const opened = await runTool("open_lesson", { topic: ALIAS }, ctx);
    expect(opened.ok).toBe(true);
    if (!opened.ok) throw new Error(opened.error);
    expect(String(opened.value.url)).toBe(`http://127.0.0.1:1${LESSON}`);
    const read = await runTool("read_state", { topic: TOPIC }, ctx);
    if (!read.ok) throw new Error(read.error);
    const seen = read.value.items as Record<string, unknown>[];
    const short = seen.find((i) => i.id === SHORT);
    expect(short).not.toHaveProperty("mark_scheme");
    expect(seen.find((i) => i.id === `${TOPIC}#1`)).toHaveProperty("answers");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
