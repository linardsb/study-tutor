/* The boss page's code under happy-dom against a fake fetch that records every request and plays
   the server's part: a boss start opens a session, a retest moves the topic, an end closes it.
   Registered here and unregistered in afterAll, so no other test file sees a document. */

import { afterAll, expect, test } from "bun:test";
import path from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { loadCasePack } from "../api/case";
import { loadGenerators } from "../content/generators";
import { itemsFileName } from "../content/pack";
import type { Generated, Item } from "../content/types";
import { replay } from "../events/replay";
import type { NewEvent } from "../events/types";
import { type Boss, boss } from "../flow/boss";
import { afterRetest } from "../flow/ladder";
import { type Next, nextStep, type Step } from "../flow/next";
import { endBody, startBody } from "../flow/session";
import { addDays } from "../mcp/clock";
import { doc, type El, keyEvent, until as settle } from "./dom";

const pack = await loadCasePack("maths");
const gens = await loadGenerators("maths");
// What the generators.js script tag leaves on window; another test file may have loaded a second table.
(globalThis as { GEN?: unknown }).GEN = gens;
const DAY = "2026-10-10";
const QUERY = `?day=${DAY}`;
const A = pack.topics[0]?.id as string;
const codeA = pack.topics[0]?.aliases[0] as string;
const packItems = pack.items.get(A) as Item[];

GlobalRegistrator.register({
  url: `http://127.0.0.1:4731/retest.html${QUERY}`,
});
afterAll(() => GlobalRegistrator.unregister());

const state = replay([]);
state.topics[A] = { rung: 1, nextDue: DAY, rag: null };
state.confidentWrong[`${A}#1`] = {
  topic: A,
  t: "2026-10-05T16:00:00Z",
  answer: "0",
};
const b = boss(state, DAY, pack) as Boss;
expect(b.topics).toEqual([A]);
expect(b.slots).toHaveLength(3);

const wire = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const bossStep: Step = {
  kind: "boss",
  boss: b,
  start: startBody("boss", null),
};
const lessonStep = nextStep(replay([]), DAY, pack, 3).step;
const flame = { week: "2026-W41", days: 0, target: 3 };
const served = {
  next: { day: DAY, flame, step: bossStep } as Next,
  state: wire(state) as {
    topics: Record<string, { rung: number; nextDue: string | null }>;
  },
  failRetest: false,
};
const setStep = (step: Step) => {
  served.next = { day: DAY, flame, step };
};

doc().body.innerHTML =
  '<section id="intro"></section><section id="boss" class="quiz"></section><section id="result" hidden></section><p id="status"></p>';

const calls: { method: string; url: string; body?: NewEvent }[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  const body = init?.body
    ? (JSON.parse(String(init.body)) as NewEvent)
    : undefined;
  calls.push({ method, url, body });
  if (url === "/api/event" && body) {
    if (body.type === "retest" && served.failRetest)
      return Response.json({ error: "x" }, { status: 500 });
    const t = `${DAY}T16:00:00Z`;
    if (body.type === "session" && body.phase === "start")
      setStep({
        kind: "continue",
        mode: body.mode,
        topic: body.topic ?? null,
        end: endBody({ mode: body.mode, topic: body.topic ?? null, t }),
      });
    if (body.type === "session" && body.phase === "end") setStep(lessonStep);
    if (body.type === "retest") {
      const rung = afterRetest(1, body.passed);
      served.state.topics[body.topic] = {
        rung,
        nextDue: addDays(DAY, rung === 2 ? 10 : 3),
      };
    }
    return Response.json({ ...body, t }, { status: 201 });
  }
  if (url === `/api/next${QUERY}`) return Response.json(served.next);
  if (url === "/api/state") return Response.json(served.state);
  if (url === "/api/topics")
    return Response.json(pack.topics.map((t) => ({ ...t, subject: "maths" })));
  if (url === `/content/maths/items/${itemsFileName(A)}`)
    return Response.json(packItems);
  return new Response("Not found", { status: 404 });
}) as typeof fetch;

const app = path.resolve(import.meta.dir, "../../app");
await import(path.join(app, "quiz.js"));
// `?dom` makes this a separate module from retest.test.ts's import: a cached module never re-runs its page code.
await import(`${path.join(app, "retest.js")}?dom`);
type Quiz = {
  lcg: (seed: number) => () => number;
  itemFromGenerated: (topic: string, spec: Generated, seed: number) => Item;
};
const quiz = (globalThis as { quiz?: Quiz }).quiz as Quiz;
const api = (globalThis as { boss?: { reload: () => Promise<void> } }).boss as {
  reload: () => Promise<void>;
};

const until = async (fn: () => boolean) => expect(await settle(fn)).toBe(true);
const $ = (sel: string) => doc().querySelector(sel) as El;
const $$ = (sel: string) => [...doc().querySelectorAll(sel)] as El[];
const posts = () =>
  calls.filter((c) => c.method === "POST").map((c) => c.body as NewEvent);

/** The item a slot builds, so the test knows each question's first accepted answer. */
function itemOf(slot: Boss["slots"][number]): Item {
  if (slot.item !== null)
    return packItems.find((i) => i.id === slot.item) as Item;
  const gen = gens[codeA] as (rng: () => number) => Generated;
  return quiz.itemFromGenerated(A, gen(quiz.lcg(slot.seed)), slot.seed);
}

/** Types an answer into question i and checks it: Enter on the first, the button on the rest. */
function answer(i: number, typed: string) {
  const q = $$("#boss .q")[i] as El;
  const input = q.querySelector("input") as El;
  input.value = typed;
  if (i === 0) input.dispatchEvent(keyEvent("Enter"));
  else (q.querySelector(".check") as El).click();
  return q;
}

/** Answers every question: the first accepted answer for all but the last, "nope" for the last. */
function answerAll() {
  const qs = $$("#boss .q");
  for (let i = 0; i < qs.length; i++) {
    const item = itemOf(b.slots[i] as Boss["slots"][number]);
    const right = i < qs.length - 1;
    const q = answer(i, right ? (item.answers?.[0] as string) : "nope");
    expect(q.classList.contains("done")).toBe(true);
    expect(q.classList.contains(right ? "right" : "wrong")).toBe(true);
    const fb = q.querySelector(".feedback")?.textContent ?? "";
    if (right) expect(fb).toBe("Correct.");
    else expect(fb.length).toBeGreaterThan(0);
    expect((q.querySelector(".working:not(.faded)") as El).hidden).toBe(false);
    expect(q.textContent).toContain(item.working as string);
  }
}

test("intro: the count of questions and topics, one Begin button, nothing posted", async () => {
  await until(() => Boolean($("#intro button")));
  expect($("#intro p").textContent).toStartWith("3 questions from 1 topic.");
  expect($$("#intro button")).toHaveLength(1);
  expect($("#boss").children).toHaveLength(0);
  expect(posts()).toHaveLength(0);
});

test("begin: posts the served start body, renders three unlabelled questions with no hint, no Sure control, no topic name, code or item id, and no working shown", async () => {
  $("#intro button").click();
  await until(() => $$("#boss .q").length === 3);
  expect(posts()).toEqual([startBody("boss", null)]);
  expect($("#intro").children).toHaveLength(0);
  const html = $("#boss").innerHTML;
  expect($$("#boss .hint")).toHaveLength(0);
  expect($$("#boss input[type=radio]")).toHaveLength(0);
  expect(html).not.toContain("Percentage of an amount");
  expect(html).not.toContain(codeA);
  expect(html).not.toContain("#1");
  // D5: the working is absent from the page, not merely hidden, until the pupil checks
  const text = $("#boss").textContent ?? "";
  for (const slot of b.slots) {
    const working = itemOf(slot).working as string;
    expect(working.length).toBeGreaterThan(0);
    expect(text).not.toContain(working);
  }
  const fixedAt = b.slots.findIndex((s) => s.item !== null);
  expect($$("#boss .q .stem")[fixedAt]?.textContent).toBe(
    `${fixedAt + 1}. ${packItems[0]?.stem}`,
  );
  expect($$("#boss .q .stem").map((s) => s.textContent?.slice(0, 3))).toEqual([
    "1. ",
    "2. ",
    "3. ",
  ]);
});

test("answer: each check marks, locks the question and reveals its working; then one retest, the served end body, and the result screen", async () => {
  answerAll();
  await until(() => Boolean($("#result h2")));
  expect(posts().slice(1)).toEqual([
    {
      v: 1,
      type: "retest",
      topic: A,
      score: 2,
      of: 3,
      passed: true,
      seed: b.seed,
    },
    { v: 1, type: "session", phase: "end", mode: "boss" },
  ]);
  expect($("#result").hidden).toBe(false);
  expect($("#result h2").textContent).toBe("Boss over.");
  expect($$("#result li").map((li) => li.textContent)).toEqual([
    "Percentage of an amount: 2 of 3. One cold pass. You did it from memory once. Next re-test in 10 days.",
  ]);
  expect($("#result a").getAttribute("href")).toBe(`/map.html${QUERY}`);
  // AC 7: every POST went to /api/event
  expect(
    calls
      .filter((c) => c.method === "POST")
      .every((c) => c.url === "/api/event"),
  ).toBe(true);
});

test("an open boss on load is ended with the served end body and re-formed; another open mode sends the pupil to the map; no boss says so", async () => {
  calls.length = 0;
  const end = endBody({ mode: "boss", topic: null, t: `${DAY}T15:00:00Z` });
  served.state = wire(state);
  // the fake answers the end post by serving the boss again
  const step: Step = { kind: "continue", mode: "boss", topic: null, end };
  setStep(step);
  const nextFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const res = await nextFetch(url, init);
    if (init?.method === "POST") setStep(bossStep);
    return res;
  }) as typeof fetch;
  await api.reload();
  await until(() => Boolean($("#intro button")));
  expect(posts()).toEqual([end]);
  expect($("#intro p").textContent).toStartWith("3 questions from 1 topic.");
  globalThis.fetch = nextFetch;

  calls.length = 0;
  setStep({ kind: "continue", mode: "lesson", topic: A, end });
  await api.reload();
  await until(
    () => $("#intro p")?.textContent?.startsWith("Something") ?? false,
  );
  expect($("#intro p").textContent).toBe(
    "Something else is open. Finish it on the map first.",
  );
  expect($("#intro a").getAttribute("href")).toBe(`/map.html${QUERY}`);
  expect(posts()).toHaveLength(0);

  setStep(lessonStep);
  await api.reload();
  await until(() => $("#intro p")?.textContent?.startsWith("No boss") ?? false);
  expect($("#intro p").textContent).toBe("No boss today. Nothing is due.");
  expect(posts()).toHaveLength(0);
});

test("a failed retest post: the row says not scored and not saved, and no end is posted", async () => {
  calls.length = 0;
  served.failRetest = true;
  served.state = wire(state);
  setStep(bossStep);
  await api.reload();
  await until(() => Boolean($("#intro button")));
  $("#intro button").click();
  await until(() => $$("#boss .q").length === 3);
  answerAll();
  await until(() => Boolean($("#result h2")));
  expect(posts().map((p) => p.type)).toEqual(["session", "retest"]);
  expect($("#result li").textContent).toBe(
    "Percentage of an amount: 2 of 3. Not scored yet. Not saved. Check the tutor window is still open.",
  );
  served.failRetest = false;
});

test("finish while a lesson is open elsewhere: the retest posts, and the lesson's end body is not posted", async () => {
  calls.length = 0;
  served.state = wire(state);
  setStep(bossStep);
  await api.reload();
  await until(() => Boolean($("#intro button")));
  $("#intro button").click();
  await until(() => $$("#boss .q").length === 3);
  // a lesson start in another tab replaced the open boss before the pupil finished
  const lessonEnd = endBody({
    mode: "lesson",
    topic: A,
    t: `${DAY}T16:30:00Z`,
  });
  const bossFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    const res = await bossFetch(url, init);
    if (url === "/api/event")
      setStep({ kind: "continue", mode: "lesson", topic: A, end: lessonEnd });
    return res;
  }) as typeof fetch;
  answerAll();
  await until(() => Boolean($("#result h2")));
  globalThis.fetch = bossFetch;
  expect(posts().map((p) => p.type)).toEqual(["session", "retest"]);
  expect(posts()[0]).toEqual(startBody("boss", null));
  expect($("#result h2").textContent).toBe("Boss over.");
});

test("F5: a boss with no buildable question says so, shows no Begin button and posts nothing", async () => {
  calls.length = 0;
  setStep({
    kind: "boss",
    boss: {
      day: DAY,
      seed: 1,
      topics: ["no/such"],
      slots: [{ topic: "no/such", item: null, seed: 1 }],
    },
    start: startBody("boss", null),
  });
  await api.reload();
  await until(() => $("#status").textContent !== "");
  expect($("#status").textContent).toBe(
    "The questions could not be built. Tell a parent.",
  );
  expect($("#intro button")).toBeNull();
  expect(posts()).toHaveLength(0);
});

test("F5: the intro counts the questions that were built, not the slots served", async () => {
  calls.length = 0;
  setStep({
    ...bossStep,
    boss: {
      ...b,
      topics: [A, "no/such"],
      slots: [...b.slots, { topic: "no/such", item: null, seed: 1 }],
    },
  } as Step);
  await api.reload();
  await until(() => Boolean($("#intro button")));
  expect($("#intro p").textContent).toStartWith("3 questions from 1 topic.");
  expect(posts()).toHaveLength(0);
});
