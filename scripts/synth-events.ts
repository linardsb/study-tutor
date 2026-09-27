import { appendEvent } from "../src/events/append";
import type { NewEvent } from "../src/events/types";
import { dataArg } from "./data-arg";

function arg(name: string, fallback: string): string {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

/** mulberry32: a small seeded PRNG, so the same seed gives the same log. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const data = dataArg();
const n = Number(arg("n", "200"));
const rand = mulberry32(Number(arg("seed", "1")));
const TOPICS = ["1MA1/R9", "1MA1/N12", "1MA1/A5", "1MA1/G20", "1MA1/S4"];

let ms = Date.parse("2026-10-05T16:00:00Z");
const clock = () => {
  const t = new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
  ms += (2 + Math.floor(rand() * 29)) * 3600_000; // 2 to 30 hours
  return t;
};
const pick = <T>(xs: readonly T[]): T =>
  xs[Math.floor(rand() * xs.length)] as T;

let written = 0;
const add = (e: NewEvent) => {
  if (written >= n) return;
  appendEvent(data, e, clock);
  written++;
};

while (written < n) {
  const topic = pick(TOPICS);
  const roll = rand();
  if (roll < 0.2) {
    add({ v: 1, type: "session", phase: "end", mode: "lesson", topic });
  } else if (roll < 0.55) {
    const correct = rand() < 0.6;
    add({
      v: 1,
      type: "attempt",
      item: `maths/${topic.slice(5)}/${Math.floor(rand() * 5)}`,
      topic,
      correct,
      sure: rand() < 0.5,
      answer: String(Math.floor(rand() * 100)),
    });
    add({ v: 1, type: "xp", amount: 10, reason: "attempt" });
  } else if (roll < 0.85) {
    const passed = rand() < 0.7;
    add({ v: 1, type: "retest", topic, score: passed ? 3 : 1, of: 3, passed });
    add({ v: 1, type: "xp", amount: 20, reason: "retest" });
  } else if (roll < 0.95) {
    add({
      v: 1,
      type: "teachback",
      topic,
      marks: Math.floor(rand() * 5),
      of: 4,
    });
  } else {
    add({
      v: 1,
      type: "usage",
      job: "hint",
      model: "gpt-5-mini",
      input: 200 + Math.floor(rand() * 1000),
      output: 50 + Math.floor(rand() * 300),
    });
  }
}
console.log(`${written} events written to ${data}`);
