/* The snap page's code under happy-dom against a fake fetch. Each case loads the page afresh (a new
   `?dom` query re-runs its code). Registered here and unregistered in afterAll. */

import { afterAll, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { doc, type El, until as settle } from "./dom";

GlobalRegistrator.register({ url: "http://127.0.0.1:4731/snap.html?token=T" });
afterAll(() => GlobalRegistrator.unregister());

const file = path.resolve(import.meta.dir, "../../app/snap.js");
const html = fs.readFileSync(
  path.resolve(import.meta.dir, "../../app/snap.html"),
  "utf8",
);
const MAIN = html.slice(html.indexOf("<main"), html.indexOf("</main>") + 7);
const DATA = "data:image/jpeg;base64,/9j/4A==";

type Reply = { status: number; body: unknown };
const served: { gets: Reply[]; post: Reply } = {
  gets: [],
  post: { status: 202, body: { saved: true } },
};
const calls: { method: string; url: string; body?: unknown }[] = [];
globalThis.fetch = (async (url: string, init?: RequestInit) => {
  const method = init?.method ?? "GET";
  calls.push({
    method,
    url,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
  });
  if (method === "POST" && url === "/api/snap/photo")
    return Response.json(served.post.body, { status: served.post.status });
  if (url === "/api/snap?token=T") {
    const r = (
      served.gets.length > 1 ? served.gets.shift() : served.gets[0]
    ) as Reply;
    return Response.json(r.body, { status: r.status });
  }
  return new Response("Not found", { status: 404 });
}) as typeof fetch;

type Api = {
  encode: (f: unknown) => Promise<string>;
  wait: (ms: number) => Promise<void>;
  upload: (f: unknown) => Promise<void>;
  ready: Promise<void>;
};
let loads = 0;
/** A fresh page: markup, served replies, then the script. */
async function load(
  gets: Reply[],
  post: Reply = { status: 202, body: { saved: true } },
) {
  doc().body.innerHTML = MAIN;
  served.gets = [...gets];
  served.post = post;
  calls.length = 0;
  await import(`${file}?dom${loads++}`);
  const api = (globalThis as { snap?: Api }).snap as Api;
  api.encode = async () => DATA;
  api.wait = async () => {};
  await api.ready;
  return api;
}

const until = async (fn: () => boolean) => expect(await settle(fn)).toBe(true);
const $ = (sel: string) => doc().querySelector(sel) as El;
const rows = () =>
  [...doc().querySelectorAll("#result p")].map((p) => p.textContent);
const view = (over: Record<string, unknown> = {}): Reply => ({
  status: 200,
  body: {
    title: "Percentages",
    stem: "Find 20% of 45.",
    model: true,
    state: "open",
    result: null,
    ...over,
  },
});
const FIVE = [
  { kind: "method", mark: 1, note: "" },
  { kind: "accuracy", mark: 0, note: "Check the last step." },
  { kind: "answer", mark: 1, note: "" },
  { kind: "units", mark: null, note: "" },
  { kind: "sense", mark: 1, note: "" },
];
const marked = (over: Record<string, unknown> = {}) => ({
  recorded: true,
  marked: true,
  lines: FIVE,
  marks: 4,
  of: 5,
  clean: true,
  ...over,
});
const PHOTO = { name: "a.jpg", type: "image/jpeg", size: 10 };

test("no model: the note shows and the form is offered", async () => {
  await load([view({ model: false })]);
  expect($("#no-model").hidden).toBe(false);
  expect($("#snap-form").hidden).toBe(false);
  expect($("#stem").textContent).toBe("Find 20% of 45.");
});

test("send, then two polls (marking, then done unmarked): the stored sentence", async () => {
  const api = await load([
    view(),
    view({ state: "marking" }),
    view({ state: "done", result: { recorded: true, marked: false } }),
  ]);
  await api.upload(PHOTO);
  await until(() => rows().length > 0);
  expect(calls.filter((c) => c.method === "POST")).toEqual([
    {
      method: "POST",
      url: "/api/snap/photo",
      body: { token: "T", image: DATA },
    },
  ]);
  expect(rows()).toEqual(["Your photo is stored. It is not marked yet."]);
  expect($("#snap-form").hidden).toBe(true);
});

test("done with five lines: a row each, the total, marks left on the table, and the clean sheet", async () => {
  const api = await load([view(), view({ state: "done", result: marked() })]);
  await api.upload(PHOTO);
  await until(() => rows().length > 0);
  expect(rows()).toEqual([
    "Method: 1 mark",
    "Accuracy: 0 marks. Check the last step.",
    "Answer: 1 mark",
    "Units: not needed",
    "Sense: 1 mark",
    "4 of 5. Marks left on the table: 1.",
    "Clean sheet.",
  ]);
});

test("not recorded: the record sentence shows", async () => {
  const api = await load([
    view(),
    view({ state: "done", result: marked({ recorded: false }) }),
  ]);
  await api.upload(PHOTO);
  await until(() => rows().length > 0);
  expect(rows().at(-1)).toBe(
    "It did not go into your record. Take a new photo from the map.",
  );
});

test("loaded when done (a reload): no form, the result shows", async () => {
  await load([view({ state: "done", result: marked({ clean: false }) })]);
  expect($("#snap-form").hidden).toBe(true);
  expect(rows()).toContain("4 of 5. Marks left on the table: 1.");
  expect(rows()).not.toContain("Clean sheet.");
});

test("a poll answered 403: the closed sentence", async () => {
  const api = await load([view(), { status: 403, body: { error: "x" } }]);
  await api.upload(PHOTO);
  await until(() => ($("#status").textContent ?? "").includes("closed"));
  expect($("#status").textContent).toBe(
    "This link has closed. Look at the map on the computer.",
  );
});

test("a photo the page cannot read: the sentence shows and nothing is posted", async () => {
  const api = await load([view()]);
  api.encode = async () => {
    throw new Error(
      (globalThis as { snap?: { TEXT: { heic: string } } }).snap?.TEXT.heic,
    );
  };
  await api.upload({ name: "a.heic", type: "image/heic", size: 10 });
  expect($("#status").textContent).toBe(
    "This page cannot read that type of photo. Take the photo with the camera button, or use a JPEG or PNG.",
  );
  expect(calls.filter((c) => c.method === "POST")).toEqual([]);
});

test("a note holding markup renders as text", async () => {
  const lines = FIVE.map((l, i) => (i === 1 ? { ...l, note: "<b>x</b>" } : l));
  await load([view({ state: "done", result: marked({ lines }) })]);
  expect(rows()[1]).toBe("Accuracy: 0 marks. <b>x</b>");
  expect(doc().querySelector("#result b")).toBeNull();
});

test("an expired link: the form stays hidden and the error shows", async () => {
  await load([
    {
      status: 403,
      body: { error: "This link has expired. Open a new one from the map." },
    },
  ]);
  expect($("#snap-form").hidden).toBe(true);
  expect($("#status").textContent).toBe(
    "This link has expired. Open a new one from the map.",
  );
});

test("a failed upload: the network sentence, and the form stays for another try", async () => {
  const api = await load([view()]);
  const up = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") throw new TypeError("fetch failed");
    return up(url, init);
  }) as typeof fetch;
  try {
    await api.upload(PHOTO);
  } finally {
    globalThis.fetch = up;
  }
  expect($("#status").textContent).toBe(
    "The photo may not have been sent. Check your Wi-Fi and try again.",
  );
  expect($("#snap-form").hidden).toBe(false);
});

test("polls that cannot connect (the phone's listener stopped): the closed sentence after the bound, and a good read resets the count", async () => {
  const api = await load([view()]);
  const bound = (globalThis as { snap?: { MAX_FAILED_POLLS: number } }).snap
    ?.MAX_FAILED_POLLS as number;
  const up = globalThis.fetch;
  let polls = 0;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return up(url, init);
    polls += 1;
    // one good "marking" read just before the bound: the count starts again
    if (polls === bound - 1)
      return Response.json(
        (view({ state: "marking" }) as { body: unknown }).body,
      );
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  try {
    await api.upload(PHOTO);
    await until(() => ($("#status").textContent ?? "").includes("closed"));
  } finally {
    globalThis.fetch = up;
  }
  expect(polls).toBe(bound - 1 + bound);
  expect($("#status").textContent).toBe(
    "This link has closed. Look at the map on the computer.",
  );
});

test("polls answered with an error (500): the closed sentence after the bound, not a poll every 2 s for ever (PR #44 F7)", async () => {
  const api = await load([view(), { status: 500, body: { error: "x" } }]);
  const bound = (globalThis as { snap?: { MAX_FAILED_POLLS: number } }).snap
    ?.MAX_FAILED_POLLS as number;
  await api.upload(PHOTO);
  await until(() => ($("#status").textContent ?? "").includes("closed"));
  // the first GET is the page load; every poll after the upload is a 500
  expect(calls.filter((c) => c.method === "GET")).toHaveLength(1 + bound);
});

test("a lost 202: the retry's 403 reads the snap, and a photo being marked is polled, not called expired (PR #44 F8)", async () => {
  const api = await load(
    [
      view(),
      view({ state: "marking" }),
      view({ state: "done", result: marked({ lines: FIVE }) }),
    ],
    {
      status: 403,
      body: { error: "This link has expired. Open a new one from the map." },
    },
  );
  const up = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") throw new TypeError("fetch failed");
    return up(url, init);
  }) as typeof fetch;
  try {
    await api.upload(PHOTO);
  } finally {
    globalThis.fetch = up;
  }
  await api.upload(PHOTO);
  await until(() => rows().length > 0);
  expect($("#snap-form").hidden).toBe(true);
  expect(rows()[0]).toBe("Method: 1 mark");
  expect($("#status").textContent).toBe("");
});
