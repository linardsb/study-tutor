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
    expect(readLines(data)).toHaveLength(1);
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
