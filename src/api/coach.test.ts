import { expect, spyOn, test } from "bun:test";
import { appendEvent, readLines } from "../events/append";
import { findItem } from "../flow/chat";
import { chooseWrong, pickItem } from "../flow/coach";
import {
  attemptLine,
  chatReply,
  KEY,
  mockFetch,
  NO_MODEL,
  NOW,
  OPENAI,
  withData,
} from "../jobs/__fixtures__/provider";
import { loadCasePack } from "./case";
import { getCoach, postCoach } from "./coach";

const pack = await loadCasePack("maths");
const ID = "1MA1/R9/of-an-amount#1";
const TOPIC = "1MA1/R9/of-an-amount";
const DAY = "2026-10-05";
const ANSWER_KEYS = ["answers", "working", "mark_scheme", "misconceptions"];

const events = (data: string) => readLines(data).map((l) => JSON.parse(l));
const q = (topic?: string) =>
  new URLSearchParams(topic === undefined ? {} : { topic });
type Ready = { ready: true; item: string; seed?: number } & Record<
  string,
  unknown
>;

/** The GET's item for the topic today, rebuilt in full for the test's own use. */
function pickedItem(data: string) {
  const got = getCoach(data, pack, DAY, q(TOPIC)) as Ready;
  if (got.ready !== true) throw new Error("expected ready");
  const item = findItem(pack, got.item, got.seed);
  if (item === null) throw new Error("no item");
  return { got, item };
}

test(
  "postCoach: a malformed request is a 400 before any job runs",
  withData(OPENAI, async (data) => {
    const { f, calls } = mockFetch(chatReply('{"lines":["x"]}'));
    const deps = { dataDir: data, fetch: f, now: NOW };
    const bodies: unknown[] = [
      null,
      "dan",
      { step: "solve", item: ID },
      { item: ID },
      { step: "dan" },
      { step: "dan", item: `${TOPIC}#gen` },
      { step: "correct", item: ID, sure: true },
      { step: "correct", item: ID, answer: "", sure: true },
      { step: "correct", item: ID, answer: "x".repeat(201), sure: true },
      { step: "correct", item: ID, answer: "9" },
      { step: "correct", item: ID, answer: "9", sure: "yes" },
      { preset: "nope", key: KEY },
    ];
    for (const body of bodies) {
      const r = await postCoach(body, data, pack, deps);
      expect({ body, s: r.status }).toEqual({ body, s: 400 });
      expect(JSON.stringify(r.body)).not.toContain(KEY);
    }
    expect(calls.length).toBe(0);
    expect(readLines(data)).toEqual([]);
  }),
);

test(
  "postCoach: an unknown item is a 404; both steps are 409 before an attempt on the topic",
  withData(NO_MODEL, async (data) => {
    const deps = { dataDir: data, now: NOW };
    expect(
      (await postCoach({ step: "dan", item: `${TOPIC}#999` }, data, pack, deps))
        .status,
    ).toBe(404);
    expect(
      await postCoach({ step: "dan", item: ID }, data, pack, deps),
    ).toEqual({
      status: 409,
      body: { error: "Try a question on this topic first." },
    });
    expect(
      await postCoach(
        { step: "correct", item: ID, answer: "9", sure: true },
        data,
        pack,
        deps,
      ),
    ).toEqual({
      status: 409,
      body: { error: "Try a question on this topic first." },
    });
    expect(readLines(data)).toEqual([]);
  }),
);

test(
  "getCoach: the list is empty, then holds the tried topic; a topic is not ready, then ready with the question side only",
  withData(NO_MODEL, async (data) => {
    expect(getCoach(data, pack, DAY, q())).toEqual({
      rank: { level: 0, name: "Noob", toNext: 3 },
      shown: 0,
      caught: 0,
      topics: [],
    });
    expect(getCoach(data, pack, DAY, q("1MA1/nope"))).toEqual({
      ready: false,
      reason: "no-topic",
    });
    expect(getCoach(data, pack, DAY, q(TOPIC))).toEqual({
      ready: false,
      reason: "try-first",
      title: "Percentage of an amount",
    });
    appendEvent(data, attemptLine({ id: ID, topic: TOPIC }), NOW);
    expect(getCoach(data, pack, DAY, q())).toMatchObject({
      topics: [{ id: TOPIC, title: "Percentage of an amount" }],
    });
    const { got } = pickedItem(data);
    expect(got).toMatchObject({
      ready: true,
      topic: TOPIC,
      title: "Percentage of an amount",
      item: `${TOPIC}#gen`,
      rank: { level: 0, name: "Noob", toNext: 3 },
      model: false,
    });
    expect(typeof got.seed).toBe("number");
    expect(typeof got.stem).toBe("string");
    for (const k of ANSWER_KEYS) expect(Object.keys(got)).not.toContain(k);
    // Same day and shown count: the same question comes back on a reload.
    expect(getCoach(data, pack, DAY, q(TOPIC))).toEqual(got);
    expect(
      (getCoach(data, pack, "2026-10-06", q(TOPIC)) as Ready).seed,
    ).not.toBe(got.seed);
    expect(readLines(data)).toHaveLength(1);
  }),
);

test(
  "postCoach dan: with no model the lines are the fallback with the bank's answer and carry no answer key; nothing is written",
  withData(NO_MODEL, async (data) => {
    appendEvent(data, attemptLine({ id: ID, topic: TOPIC }), NOW);
    const { got, item } = pickedItem(data);
    const r = await postCoach(
      { step: "dan", item: got.item, seed: got.seed },
      data,
      pack,
      { dataDir: data, now: NOW },
    );
    expect(r.status).toBe(200);
    const body = r.body as { kind: string; by: string; lines: string[] };
    expect(body).toMatchObject({ kind: "dan", by: "fallback" });
    expect(body.lines.join(" ")).toContain(chooseWrong(item)?.answer as string);
    for (const k of ANSWER_KEYS) expect(Object.keys(body)).not.toContain(k);
    expect(readLines(data)).toHaveLength(1);
  }),
);

test(
  "postCoach dan: an item with no misconception is a 404",
  withData(NO_MODEL, async (data) => {
    appendEvent(data, attemptLine({ id: ID, topic: TOPIC }), NOW);
    const bare = {
      ...pack,
      items: new Map(
        [...pack.items].map(([k, v]) => [
          k,
          v.map((i) => ({ ...i, misconceptions: [] })),
        ]),
      ),
    };
    const r = await postCoach({ step: "dan", item: `${TOPIC}#2` }, data, bare, {
      dataDir: data,
      now: NOW,
    });
    expect(r).toEqual({
      status: 404,
      body: { error: "Dan has no wrong step for this question" },
    });
    const c = await postCoach(
      { step: "correct", item: `${TOPIC}#2`, answer: "9", sure: true },
      data,
      bare,
      { dataDir: data, now: NOW },
    );
    expect(c.status).toBe(404);
    expect(readLines(data)).toHaveLength(1);
  }),
);

test(
  "postCoach correct: writes attempt, xp 10 and coach in that order; returns the working and the note; a second correct is 409 and writes nothing; the rank moves",
  withData(NO_MODEL, async (data) => {
    appendEvent(data, attemptLine({ id: ID, topic: TOPIC }), NOW);
    const { got, item } = pickedItem(data);
    const wrong = chooseWrong(item);
    if (wrong === null) throw new Error("no bank");
    const right = item.answers?.[0] as string;
    const deps = { dataDir: data, now: NOW };
    const body = {
      step: "correct",
      item: got.item,
      seed: got.seed,
      sure: true,
    };

    const r = await postCoach({ ...body, answer: right }, data, pack, deps);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({
      kind: "marked",
      correct: true,
      caught: true,
      named: null,
      note: wrong.message,
      working: item.working,
      rank: { level: 0, name: "Noob", toNext: 2 },
      saved: true,
    });
    const log = events(data);
    expect(log.map((e) => e.type)).toEqual([
      "attempt",
      "attempt",
      "xp",
      "coach",
    ]);
    expect(log[1]).toMatchObject({
      item: got.item,
      seed: got.seed,
      correct: true,
      sure: true,
      answer: right,
    });
    expect(log[2]).toMatchObject({ amount: 10, reason: "attempt" });
    expect(log[3]).toMatchObject({
      topic: TOPIC,
      item: got.item,
      seed: got.seed,
      wrong: wrong.answer,
      caught: true,
    });
    for (const k of ANSWER_KEYS)
      expect(Object.keys(log[3] as object)).not.toContain(k);

    const again = await postCoach({ ...body, answer: right }, data, pack, deps);
    expect(again).toEqual({
      status: 409,
      body: { error: "You have answered this one. Ask for another." },
    });
    expect(readLines(data)).toHaveLength(4);

    // The shown count moved, so the next GET is a new question; Dan's own wrong answer is not a catch.
    expect(getCoach(data, pack, DAY, q())).toMatchObject({
      shown: 1,
      caught: 1,
    });
    const next = pickedItem(data);
    expect(next.got.seed).not.toBe(got.seed);
    const nextWrong = chooseWrong(next.item);
    if (nextWrong === null) throw new Error("no bank");
    const miss = await postCoach(
      {
        step: "correct",
        item: next.got.item,
        seed: next.got.seed,
        answer: nextWrong.answer,
        sure: false,
      },
      data,
      pack,
      deps,
    );
    expect(miss.body).toMatchObject({
      correct: false,
      caught: false,
      named: nextWrong.message,
      note: nextWrong.message,
      rank: { level: 0, name: "Noob", toNext: 2 },
      saved: true,
    });
    expect(events(data).at(-1)).toMatchObject({ type: "coach", caught: false });
  }),
);

test(
  "postCoach: a dan request still running when another tab answers writes nothing; the correct that follows is 409",
  withData(OPENAI, async (data) => {
    appendEvent(data, attemptLine({ id: ID, topic: TOPIC }), NOW);
    const { got, item } = pickedItem(data);
    const wrong = chooseWrong(item)?.answer as string;
    const reply = chatReply(JSON.stringify({ lines: [`I get ${wrong}.`] }));
    const { f } = mockFetch(() => {
      appendEvent(data, attemptLine(item, got.seed), NOW);
      return reply();
    });
    const deps = { dataDir: data, fetch: f, now: NOW };
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    try {
      const r = await postCoach(
        { step: "dan", item: got.item, seed: got.seed },
        data,
        pack,
        deps,
      );
      expect(r.status).toBe(200);
      expect(r.body).toMatchObject({ kind: "dan", by: "model" });
      const c = await postCoach(
        {
          step: "correct",
          item: got.item,
          seed: got.seed,
          answer: item.answers?.[0] as string,
          sure: true,
        },
        data,
        pack,
        deps,
      );
      expect(c.status).toBe(409);
    } finally {
      quiet.mockRestore();
    }
    const log = events(data);
    expect(log.filter((e) => e.type === "attempt")).toHaveLength(2);
    expect(log.filter((e) => e.type === "coach")).toHaveLength(0);
    expect(log.filter((e) => e.type === "usage")).toHaveLength(1);
  }),
);

test("pickItem through getCoach uses the day and the shown count as the base", () => {
  const a = pickItem(pack, TOPIC, `${DAY}:${TOPIC}:coach:0`);
  const b = pickItem(pack, TOPIC, `${DAY}:${TOPIC}:coach:1`);
  expect(a?.seed).not.toBe(b?.seed);
});
