import { expect, spyOn, test } from "bun:test";
import path from "node:path";
import type { CasePack, Item } from "../content/types";
import { readLines } from "../events/append";
import { MAX_DIAGNOSTIC_TOPICS } from "../flow/diagnostic";
import {
  type Call,
  chatReply,
  KEY,
  mockFetch,
  NO_MODEL,
  NOW,
  OPENAI,
  SENTINELS,
  sentinelItem,
  withData,
} from "../jobs/__fixtures__/provider";
import { apiRoutes } from "../server";
import { loadPacks } from "./case";
import { diagnosticForDay, postInterview, postSheet } from "./intake";

const root = path.resolve(import.meta.dir, "../..");
const { pack, subjects } = await loadPacks(root);
const DAY = "2026-10-05";
// A PNG signature: enough for sniffImage, and the provider is mocked.
const PNG = `data:image/png;base64,${Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString("base64")}`;
const ANSWERS = { confident: "cells", unsure: "ratio", stuck: "percentages" };

async function quietly(fn: () => Promise<void>) {
  const quiet = spyOn(console, "error").mockImplementation(() => {});
  try {
    await fn();
  } finally {
    quiet.mockRestore();
  }
}

test(
  "AC 1: the cold test is built with no key and nothing is fetched, directly and through the route",
  withData(null, async (data) => {
    const spy = spyOn(globalThis, "fetch");
    try {
      const d = diagnosticForDay(data, pack, DAY);
      expect(d?.slots).toHaveLength(MAX_DIAGNOSTIC_TOPICS);
      const res = await apiRoutes({
        root,
        dataDir: data,
        topics: pack.topics,
        pack,
        subjects,
      })["/api/intake/diagnostic"].GET(
        new Request(`http://127.0.0.1:4731/api/intake/diagnostic?day=${DAY}`, {
          headers: { host: "127.0.0.1:4731" },
        }),
      );
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual(JSON.parse(JSON.stringify(d)));
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  }),
);

test(
  "AC 2: an unknown code on a sheet is listed back, not guessed, and nothing is written",
  withData(OPENAI, async (data) => {
    const { f } = mockFetch(
      chatReply(
        '{"codes":[{"code":"U349","rag":"R"},{"code":"U976","rag":"G"}]}',
      ),
    );
    const r = await postSheet({ text: "U349 R\nU976 G" }, pack, {
      dataDir: data,
      fetch: f,
      now: NOW,
    });
    expect(r).toEqual({
      status: 200,
      body: {
        by: "model",
        rows: [
          {
            topic: "1MA1/R9/of-an-amount",
            title: "Percentage of an amount",
            rag: "R",
            code: "U349",
          },
        ],
        unknown: ["U976"],
      },
    });
    expect(readLines(data).some((l) => JSON.parse(l).type === "intake")).toBe(
      false,
    );
  }),
);

test(
  "guard: over a pack whose every item is a sentinel, no request carries item text",
  withData(OPENAI, async (data) => {
    const items = new Map<string, readonly Item[]>(
      pack.topics.map((t) => [
        t.id,
        [sentinelItem({ id: `${t.id}#1`, topic: t.id })],
      ]),
    );
    const sentinelPack: CasePack = { ...pack, items };
    const { f, calls } = mockFetch(
      chatReply('{"codes":[{"code":"U349","rag":"R"}]}'),
      chatReply('{"topics":[]}'),
    );
    const deps = { dataDir: data, fetch: f, now: NOW };
    await postSheet({ text: "R U349" }, sentinelPack, deps);
    await postInterview({ answers: ANSWERS }, sentinelPack, deps);
    expect(calls.length).toBe(2);
    const sent = calls.map((c: Call) => String(c.init.body)).join("\n");
    for (const s of SENTINELS) expect(sent).not.toContain(s);
    expect(sent).not.toContain("Find 20% of 45.");
  }),
);

test(
  "validation: a malformed body is a 400 before any job runs, and names no field value",
  withData(OPENAI, async (data) => {
    const { f, calls } = mockFetch(chatReply("{}"));
    const deps = { dataDir: data, fetch: f, now: NOW };
    const sheets: unknown[] = [
      {},
      null,
      { text: "U349", image: PNG },
      { text: "   " },
      { text: "x".repeat(20_001) },
      { image: "data:text/plain;base64,aGVsbG8=" },
      {
        image: `data:image/png;base64,${Buffer.from("GIF89a").toString("base64")}`,
      },
      { preset: "nope", key: KEY },
    ];
    for (const body of sheets) {
      const r = await postSheet(body, pack, deps);
      expect({ body, s: r.status }).toEqual({ body, s: 400 });
      expect(JSON.stringify(r.body)).not.toContain(KEY);
    }
    const interviews: unknown[] = [
      {},
      { answers: { confident: "", unsure: " ", stuck: "" } },
      { answers: { confident: "x".repeat(501), unsure: "", stuck: "" } },
      { answers: { confident: "x", unsure: "" } },
      { preset: "nope", key: KEY },
    ];
    for (const body of interviews)
      expect({
        body,
        s: (await postInterview(body, pack, deps)).status,
      }).toEqual({ body, s: 400 });
    expect(calls.length).toBe(0);
  }),
);

test(
  "a photo with no model → no verdict, no-model, nothing fetched",
  withData(NO_MODEL, async (data) => {
    const { f, calls } = mockFetch(chatReply("{}"));
    const r = await postSheet({ image: PNG }, pack, {
      dataDir: data,
      fetch: f,
    });
    expect(r).toEqual({
      status: 200,
      body: { by: "none", reason: "no-model" },
    });
    expect(calls.length).toBe(0);
  }),
);

test(
  "a photo the set-up model refuses (HTTP 400) → no verdict, failed",
  withData(OPENAI, (data) =>
    quietly(async () => {
      const { f } = mockFetch(() => new Response("no images", { status: 400 }));
      const r = await postSheet({ image: PNG }, pack, {
        dataDir: data,
        fetch: f,
        now: NOW,
      });
      expect(r).toEqual({
        status: 200,
        body: { by: "none", reason: "failed" },
      });
    }),
  ),
);

test(
  "postInterview: a model reply gives rows with titles and R/A/G",
  withData(OPENAI, async (data) => {
    const { f } = mockFetch(
      chatReply('{"topics":[{"topic":"8464/4.1.1.2","confidence":"stuck"}]}'),
    );
    const r = await postInterview({ answers: ANSWERS }, pack, {
      dataDir: data,
      fetch: f,
      now: NOW,
    });
    expect(r).toEqual({
      status: 200,
      body: {
        by: "model",
        rows: [
          { topic: "8464/4.1.1.2", title: "Animal and plant cells", rag: "R" },
        ],
      },
    });
  }),
);
