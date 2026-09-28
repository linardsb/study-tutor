import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadTopics } from "../content/pack";
import { readLines } from "../events/append";
import { postEvent, resolveTopic } from "./event";

const topics = await loadTopics("maths");
const AT = () => "2026-10-05T16:00:00Z";
const attempt = {
  v: 1,
  type: "attempt",
  item: "1MA1/R9/of-an-amount#1",
  topic: "U349",
  correct: false,
  sure: true,
  answer: "4.5",
};

/** A realpathed temp dir (macOS maps /var to /private/var), removed afterwards. */
function withTemp(fn: (dir: string, data: string) => void | Promise<void>) {
  return async () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-api-")),
    );
    try {
      await fn(dir, path.join(dir, "data"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test(
  "an attempt with a U-code lands with the topic id and the server's clock",
  withTemp((_dir, data) => {
    const r = postEvent(attempt, data, topics, AT);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({
      topic: "1MA1/R9/of-an-amount",
      t: AT(),
      item: attempt.item,
    });
    const lines = readLines(data);
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1] as string)).toMatchObject({
      type: "xp",
      amount: 10,
      reason: "attempt",
    });
  }),
);

test(
  "a topic id or an unknown code passes through unchanged",
  withTemp((_dir, data) => {
    expect(resolveTopic(topics, "1MA1/R4")).toBe("1MA1/R4");
    expect(resolveTopic(topics, "U999")).toBe("U999");
    const a = postEvent({ ...attempt, topic: "1MA1/R4" }, data, topics, AT);
    expect(a.body).toMatchObject({ topic: "1MA1/R4" });
    const b = postEvent({ ...attempt, topic: "U999" }, data, topics, AT);
    expect(b.body).toMatchObject({ topic: "U999" });
  }),
);

test(
  "an intake's topics[].topic codes resolve too",
  withTemp((_dir, data) => {
    const r = postEvent(
      {
        v: 1,
        type: "intake",
        door: "sheet",
        topics: [
          { topic: "U687", rag: "R" },
          { topic: "1MA1/R5", rag: "G" },
        ],
      },
      data,
      topics,
      AT,
    );
    expect(r.status).toBe(201);
    expect(JSON.parse(readLines(data)[0] ?? "").topics).toEqual([
      { topic: "1MA1/R4", rag: "R" },
      { topic: "1MA1/R5", rag: "G" },
    ]);
  }),
);

test(
  "a malformed event is refused with 400 and no data folder",
  withTemp((_dir, data) => {
    const r = postEvent({ v: 1, type: "attempt", item: "x" }, data, topics, AT);
    expect(r.status).toBe(400);
    expect(r.body).toEqual({
      error: "Refused: not a valid attempt v1 event",
    });
    expect(fs.existsSync(data)).toBe(false);
  }),
);

test(
  "a body that is not an object is refused with 400 and no data folder",
  withTemp((_dir, data) => {
    for (const body of [[], null, "x"]) {
      const r = postEvent(body, data, topics, AT);
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ error: "Body must be a JSON object" });
    }
    expect(fs.existsSync(data)).toBe(false);
  }),
);

test(
  "a posted answers, working or t never reaches the log",
  withTemp((_dir, data) => {
    const r = postEvent(
      {
        ...attempt,
        answers: ["9"],
        working: "10% of 45 = 4.5. 20% = 9.",
        t: "1999-01-01T00:00:00Z",
      },
      data,
      topics,
      AT,
    );
    expect(r.status).toBe(201);
    const line = JSON.parse(readLines(data)[0] ?? "");
    expect(line).not.toHaveProperty("answers");
    expect(line).not.toHaveProperty("working");
    expect(line.t).toBe(AT());
  }),
);

const types = (data: string) =>
  readLines(data).map((l) => (JSON.parse(l) as { type: string }).type);

test(
  "an attempt appends its xp line after it and returns the attempt",
  withTemp((_dir, data) => {
    const r = postEvent(attempt, data, topics, AT);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ type: "attempt" });
    expect(readLines(data).map((l) => JSON.parse(l))).toEqual([
      expect.objectContaining({ type: "attempt" }),
      { v: 1, t: AT(), type: "xp", amount: 10, reason: "attempt" },
    ]);
  }),
);

test(
  "a teachback earns 15 and a passed retest 20",
  withTemp((_dir, data) => {
    postEvent(
      { v: 1, type: "teachback", topic: "U349", marks: 1, of: 2 },
      data,
      topics,
      AT,
    );
    postEvent(
      { v: 1, type: "retest", topic: "U349", score: 3, of: 3, passed: true },
      data,
      topics,
      AT,
    );
    const xp = readLines(data)
      .map((l) => JSON.parse(l) as { type: string; amount?: number })
      .filter((e) => e.type === "xp")
      .map((e) => e.amount);
    expect(xp).toEqual([15, 20]);
    expect(types(data)).toEqual(["teachback", "xp", "retest", "xp"]);
  }),
);

test(
  "a session or an intake appends one line",
  withTemp((_dir, data) => {
    postEvent(
      { v: 1, type: "session", phase: "start", mode: "lesson" },
      data,
      topics,
      AT,
    );
    postEvent(
      {
        v: 1,
        type: "intake",
        door: "sheet",
        topics: [{ topic: "U349", rag: "R" }],
      },
      data,
      topics,
      AT,
    );
    expect(types(data)).toEqual(["session", "intake"]);
  }),
);

test(
  "a posted xp body is refused and writes nothing, not even data/",
  withTemp((_dir, data) => {
    const r = postEvent(
      { v: 1, type: "xp", amount: 500, reason: "attempt" },
      data,
      topics,
      AT,
    );
    expect(r).toEqual({
      status: 400,
      body: { error: "Refused: XP is written by the tutor, not posted" },
    });
    expect(readLines(data)).toEqual([]);
    expect(fs.existsSync(data)).toBe(false);
  }),
);

test(
  "a retest whose passed flag disagrees with its score is refused",
  withTemp((_dir, data) => {
    for (const [score, passed] of [
      [0, true],
      [2, false],
    ] as const) {
      const r = postEvent(
        { v: 1, type: "retest", topic: "U349", score, of: 3, passed },
        data,
        topics,
        AT,
      );
      expect(r).toEqual({
        status: 400,
        body: { error: "Refused: passed does not match the score" },
      });
    }
    expect(readLines(data)).toEqual([]);
    expect(fs.existsSync(data)).toBe(false);
  }),
);

test(
  "a retest out of 0 is refused, so it cannot drop a rung",
  withTemp((_dir, data) => {
    const r = postEvent(
      { v: 1, type: "retest", topic: "U349", score: 0, of: 0, passed: false },
      data,
      topics,
      AT,
    );
    expect(r).toEqual({
      status: 400,
      body: { error: "Refused: a re-test needs at least one question" },
    });
    expect(fs.existsSync(data)).toBe(false);
  }),
);

test(
  "a failed xp append still returns 201 with the saved attempt",
  withTemp((_dir, data) => {
    let calls = 0;
    const now = () => (calls++ === 0 ? AT() : "bad");
    const r = postEvent(attempt, data, topics, now);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ type: "attempt", t: AT() });
    expect(types(data)).toEqual(["attempt"]);
  }),
);
