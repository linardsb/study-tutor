// Test helper for append.test.ts: 200 appends from one process. Imported by nothing.
import { appendEvent } from "../append";

const data = process.argv[2];
if (data === undefined) throw new Error("Usage: bun append-many.ts <data dir>");
for (let i = 0; i < 200; i++) {
  appendEvent(data, {
    v: 1,
    type: "attempt",
    item: `maths/R9/${i}`,
    topic: "1MA1/R9",
    correct: i % 2 === 0,
    sure: true,
    answer:
      "a fairly long answer to make each line a few hundred bytes ".repeat(4),
  });
}
