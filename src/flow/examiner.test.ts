import { expect, spyOn, test } from "bun:test";
import { parseEvent } from "../events/types";
import {
  attemptLine,
  chatReply,
  mockFetch,
  NO_MODEL,
  NOW,
  OPENAI,
  sentinelItem,
  withData,
} from "../jobs/__fixtures__/provider";
import { examine, lastAttempt, photoRecord } from "./examiner";

const line = (o: object) => JSON.stringify({ ...o, t: NOW() });
const PHOTO = { bytes: new Uint8Array([0xff, 0xd8, 0xff]), mime: "image/jpeg" };
const FIVE = JSON.stringify({
  lines: [
    { kind: "method", mark: 1, note: "" },
    { kind: "accuracy", mark: 0, note: "Check the last step." },
    { kind: "answer", mark: 1, note: "" },
    { kind: "units", mark: null, note: "" },
    { kind: "sense", mark: 1, note: "" },
  ],
});

test("lastAttempt: the last of three attempts with its seed; other and unreadable lines are skipped", () => {
  const a = sentinelItem({ id: "1MA1/R9#1" });
  const g = sentinelItem({ id: "1MA1/R9#gen" });
  const log = [
    line(attemptLine(a)),
    line(attemptLine(a)),
    line(attemptLine(g, 42)),
    line({ v: 1, type: "session", phase: "end", mode: "practice" }),
    "not json",
  ];
  expect(lastAttempt(log)).toEqual({ id: "1MA1/R9#gen", seed: 42 });
  expect(lastAttempt(log.slice(0, 2))).toEqual({ id: "1MA1/R9#1" });
  expect(lastAttempt([])).toBeNull();
});

async function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const s = spyOn(console, "error").mockImplementation(() => {});
  try {
    return await fn();
  } finally {
    s.mockRestore();
  }
}

test(
  "examine: no attempt in the log → refused, no fetch",
  withData(OPENAI, async (data) => {
    const { f, calls } = mockFetch(chatReply(FIVE));
    const r = await examine(
      { item: sentinelItem(), topic: "T", photo: PHOTO },
      [],
      { dataDir: data, fetch: f, now: NOW },
    );
    expect(r).toEqual({ kind: "refused" });
    expect(calls).toHaveLength(0);
  }),
);

test(
  "examine: a generated item attempted with seed 5 and asked with seed 6 → refused, no fetch",
  withData(OPENAI, async (data) => {
    const item = { ...sentinelItem({ id: "1MA1/R9#gen" }), seed: 6 };
    const { f, calls } = mockFetch(chatReply(FIVE));
    const r = await examine(
      { item, topic: "T", photo: PHOTO },
      [line(attemptLine(item, 5))],
      { dataDir: data, fetch: f, now: NOW },
    );
    expect(r).toEqual({ kind: "refused" });
    expect(calls).toHaveLength(0);
  }),
);

test(
  "examine: a valid reply → marks; preset none → not-marked",
  withData(OPENAI, async (data) => {
    const item = sentinelItem();
    const log = [line(attemptLine(item))];
    const { f } = mockFetch(chatReply(FIVE));
    const r = await examine({ item, topic: "T", photo: PHOTO }, log, {
      dataDir: data,
      fetch: f,
      now: NOW,
    });
    expect(r).toMatchObject({ kind: "marks", marks: 4, of: 5, clean: true });
    await withData(NO_MODEL, async (none) => {
      const n = await quiet(() =>
        examine({ item, topic: "T", photo: PHOTO }, log, {
          dataDir: none,
          fetch: f,
          now: NOW,
        }),
      );
      expect(n).toEqual({ kind: "not-marked" });
    })();
  }),
);

test("photoRecord round-trips through parseEvent for both kinds", () => {
  const item = { ...sentinelItem({ id: "1MA1/R9#gen" }), seed: 5 };
  const marked = photoRecord(item, "intake/a.jpg", {
    kind: "marks",
    lines: [],
    marks: 4,
    of: 5,
    clean: true,
  });
  const unmarked = photoRecord(item, "intake/b.jpg", { kind: "not-marked" });
  expect(parseEvent(JSON.stringify({ ...marked, t: NOW() }))).toEqual({
    ...marked,
    t: NOW(),
  } as never);
  expect(marked).toMatchObject({ seed: 5, marks: 4, of: 5, clean: true });
  const u = parseEvent(JSON.stringify({ ...unmarked, t: NOW() }));
  expect(u).not.toBeNull();
  expect(u).not.toHaveProperty("marks");
});
