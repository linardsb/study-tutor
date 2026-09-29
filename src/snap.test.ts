import { expect, mock, spyOn, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { startFakeProvider } from "../scripts/fake-provider";
import { loadCasePack } from "./api/case";
import { saveSetup } from "./config";
import { loadTopics } from "./content/pack";
import { appendEvent, readLines } from "./events/append";
import { startServer } from "./server";
import {
  AFTER_UPLOAD_MS,
  createSnaps,
  decodeDataUrl,
  lanAddress,
  MAX_PHOTO_BYTES,
  SNAP_TTL_MS,
  type Snaps,
  sniffImage,
} from "./snap";

const root = process.cwd();
const topics = await loadTopics("maths");
const pack = await loadCasePack("maths");
const ITEM = "1MA1/R9/of-an-amount#1";
const TOPIC = "1MA1/R9/of-an-amount";
const NO_MODEL = { preset: "none", weeklyTarget: 3 };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
const dataUrl = (b: Uint8Array, mime = "image/jpeg") =>
  `data:${mime};base64,${Buffer.from(b).toString("base64")}`;

type H = {
  data: string;
  snaps: Snaps;
  main: (p: string, init?: RequestInit) => Promise<Response>;
  attempt: (item?: string, seed?: number) => void;
  mint: () => Promise<{ status: number; body: Record<string, unknown> }>;
  upload: (
    base: string,
    token: string,
    image?: string,
    headers?: Record<string, string>,
  ) => Promise<Response>;
  lanBase: (body: Record<string, unknown>) => string;
  intake: () => string[];
};

/**
 * One tutor on a free port with the "LAN" listener on loopback. Setup: a config body, "fake" for the
 * fake provider, or null. Closes the snaps (awaiting background marking) before the folder goes.
 */
function withSnap(
  setup: Record<string, unknown> | "fake" | null,
  fn: (h: H) => Promise<void>,
  store: Parameters<typeof createSnaps>[0] = {},
  fakeOpts: { delayMs?: number } = {},
) {
  return async () => {
    const quiet = spyOn(console, "error").mockImplementation(() => {});
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-snap-")),
    );
    const data = path.join(dir, "data");
    const fake =
      setup === "fake"
        ? startFakeProvider({ mode: "valid", ...fakeOpts })
        : null;
    const config =
      fake !== null
        ? {
            preset: "custom",
            base_url: fake.url,
            model: "fake",
            key: "",
            cap: 50_000,
            weeklyTarget: 3,
          }
        : setup;
    if (config !== null) {
      const r = saveSetup(data, config as Record<string, unknown>);
      if (!r.ok) throw new Error(r.error);
    }
    const snaps = createSnaps(store);
    const server = startServer([0], {
      root,
      dataDir: data,
      topics,
      pack,
      snapHost: () => "127.0.0.1",
      snaps,
    });
    const main = (p: string, init?: RequestInit) =>
      fetch(`http://127.0.0.1:${server.port}${p}`, init);
    const h: H = {
      data,
      snaps,
      main,
      attempt: (item = ITEM, seed) => {
        appendEvent(data, {
          v: 1,
          type: "attempt",
          item,
          topic: TOPIC,
          correct: false,
          sure: true,
          answer: "8",
          ...(seed === undefined ? {} : { seed }),
        });
      },
      mint: async () => {
        const r = await main("/api/snap", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        return {
          status: r.status,
          body: (await r.json()) as Record<string, unknown>,
        };
      },
      upload: (base, token, image = dataUrl(JPEG), headers = {}) =>
        fetch(`${base}/api/snap/photo`, {
          method: "POST",
          headers: { "content-type": "application/json", ...headers },
          body: JSON.stringify({ token, image }),
        }),
      lanBase: (body) => new URL(String(body.lan)).origin,
      intake: () => {
        const d = path.join(data, "intake");
        return fs.existsSync(d) ? fs.readdirSync(d) : [];
      },
    };
    try {
      await fn(h);
    } finally {
      await snaps.closeAll();
      server.stop(true);
      fake?.stop();
      fs.rmSync(dir, { recursive: true, force: true });
      quiet.mockRestore();
    }
  };
}

type Body = { state?: string; error?: string; result?: unknown };
/** A snap route's JSON body, typed loosely for assertions. */
const read = async (r: Response | Promise<Response>) =>
  (await (await r).json()) as Body;

const tokenOf = (body: Record<string, unknown>) =>
  new URL(String(body.local), "http://x").searchParams.get("token") as string;
const lastEvent = (data: string) =>
  JSON.parse(readLines(data).at(-1) as string) as Record<string, unknown>;

const iface = (address: string, family = "IPv4", internal = false) =>
  ({ address, family, internal }) as os.NetworkInterfaceInfo;

test.each([
  [
    "this Mac",
    { lo0: [iface("127.0.0.1", "IPv4", true)], en1: [iface("192.168.1.11")] },
    "192.168.1.11",
  ],
  ["link-local only", { en0: [iface("169.254.3.4")] }, null],
  [
    "a VPN beside Wi-Fi",
    { utun3: [iface("10.8.0.2")], en0: [iface("192.168.0.5")] },
    "192.168.0.5",
  ],
  [
    "Windows with WSL",
    {
      "vEthernet (WSL)": [iface("172.28.0.1")],
      "Wi-Fi": [iface("192.168.1.20")],
    },
    "192.168.1.20",
  ],
  [
    "VirtualBox beside Ethernet",
    {
      "VirtualBox Host-Only Network": [iface("192.168.56.1")],
      Ethernet: [iface("10.0.0.12")],
    },
    "10.0.0.12",
  ],
  ["IPv6 only", { en0: [iface("fe80::1", "IPv6")] }, null],
  ["a public address only", { en0: [iface("8.8.8.8")] }, null],
])("lanAddress: %s", (_name, ifaces, want) => {
  expect(lanAddress(ifaces)).toBe(want);
});

test("sniffImage: JPEG, PNG and WebP by their bytes; HEIC, GIF and PDF refused", () => {
  const b = (...x: (number | string)[]) =>
    new Uint8Array(
      x.flatMap((v) => (typeof v === "string" ? [...Buffer.from(v)] : [v])),
    );
  expect(sniffImage(JPEG)?.mime).toBe("image/jpeg");
  expect(sniffImage(b(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe(
    "image/png",
  );
  expect(sniffImage(b("RIFF", 0, 0, 0, 0, "WEBP"))?.mime).toBe("image/webp");
  expect(sniffImage(b(0, 0, 0, 0x18, "ftypheic"))).toBeNull();
  expect(sniffImage(b("GIF89a"))).toBeNull();
  expect(sniffImage(b("%PDF-1.4"))).toBeNull();
});

test("decodeDataUrl: an image data URL within the cap, nothing else", () => {
  expect(decodeDataUrl(dataUrl(JPEG))).toEqual(JPEG);
  expect(decodeDataUrl(dataUrl(JPEG, "image/heic"))).toBeNull();
  expect(decodeDataUrl("data:text/html;base64,PGI+")).toBeNull();
  expect(decodeDataUrl(42)).toBeNull();
  expect(
    decodeDataUrl(dataUrl(new Uint8Array(MAX_PHOTO_BYTES + 1))),
  ).toBeNull();
});

test(
  "mint with no attempt → 409, and no listener is started",
  withSnap(NO_MODEL, async (h) => {
    const r = await h.mint();
    expect(r.status).toBe(409);
    expect(r.body.error).toBe(
      "Try a question first. Then photograph your working.",
    );
    expect(h.snaps.current()).toBeNull();
  }),
);

test(
  "mint after an attempt → 201 with the phone link, a QR code and the stem, and no answer side",
  withSnap(NO_MODEL, async (h) => {
    h.attempt();
    const r = await h.mint();
    expect(r.status).toBe(201);
    expect(String(r.body.lan)).toStartWith("http://127.0.0.1:");
    expect(String(r.body.qr)).toStartWith("<svg");
    const item = pack.items.get(TOPIC)?.find((i) => i.id === ITEM);
    expect(r.body.stem).toBe(item?.stem as string);
    const text = JSON.stringify(r.body);
    expect(text).not.toContain('"answers"');
    expect(text).not.toContain('"working"');
  }),
);

test(
  "single use: a second upload with the token → 403 and still one file; the status stays readable",
  withSnap("fake", async (h) => {
    h.attempt();
    const { body } = await h.mint();
    const base = h.lanBase(body);
    const token = tokenOf(body);
    const first = await h.upload(base, token);
    expect(first.status).toBe(202);
    expect(await first.json()).toEqual({ saved: true });
    expect((await h.upload(base, token)).status).toBe(403);
    expect(h.intake()).toHaveLength(1);
    const s = await fetch(`${base}/api/snap?token=${token}`);
    expect(s.status).toBe(200);
    expect(["marking", "done"]).toContain(String((await read(s)).state));
    await h.snaps.current()?.done;
  }),
);

test(
  "race: two uploads on one token → one 202, one 403, one file, one photo event",
  withSnap("fake", async (h) => {
    h.attempt();
    const { body } = await h.mint();
    const base = h.lanBase(body);
    const token = tokenOf(body);
    const rs = await Promise.all([
      h.upload(base, token),
      h.upload(base, token),
    ]);
    expect(rs.map((r) => r.status).sort()).toEqual([202, 403]);
    await h.snaps.current()?.done;
    expect(h.intake()).toHaveLength(1);
    expect(
      readLines(h.data).filter((l) => JSON.parse(l).type === "photo"),
    ).toHaveLength(1);
  }),
);

test(
  "session-bound: a new mint kills the old token and stops the old listener",
  withSnap(NO_MODEL, async (h) => {
    h.attempt();
    const a = (await h.mint()).body;
    const b = (await h.mint()).body;
    const ta = tokenOf(a);
    const tb = tokenOf(b);
    expect((await h.main(`/api/snap?token=${ta}`)).status).toBe(403);
    expect((await fetch(`${h.lanBase(b)}/api/snap?token=${ta}`)).status).toBe(
      403,
    );
    expect((await h.main(`/api/snap?token=${tb}`)).status).toBe(200);
    expect((await fetch(`${h.lanBase(b)}/api/snap?token=${tb}`)).status).toBe(
      200,
    );
    await expect(
      fetch(`${h.lanBase(a)}/api/snap?token=${ta}`),
    ).rejects.toThrow();
  }),
);

let clock = 0;
test(
  "expiry: past 15 minutes the token → 403 on read and upload",
  withSnap(
    NO_MODEL,
    async (h) => {
      clock = 0;
      h.attempt();
      const { body } = await h.mint();
      const token = tokenOf(body);
      clock = SNAP_TTL_MS;
      expect((await h.main(`/api/snap?token=${token}`)).status).toBe(403);
      expect((await h.upload(h.lanBase(body), token)).status).toBe(403);
    },
    { now: () => clock },
  ),
);

test(
  "the deadline moves on upload: 10 minutes after it, past the mint's 15",
  withSnap(
    NO_MODEL,
    async (h) => {
      clock = 0;
      h.attempt();
      const { body } = await h.mint();
      const token = tokenOf(body);
      clock = 14 * 60_000;
      expect((await h.upload(h.lanBase(body), token)).status).toBe(202);
      await h.snaps.current()?.done;
      clock = 20 * 60_000;
      const r = await h.main(`/api/snap?token=${token}`);
      expect(r.status).toBe(200);
      expect((await read(r)).state).toBe("done");
      clock = 14 * 60_000 + AFTER_UPLOAD_MS + 1000;
      expect((await h.main(`/api/snap?token=${token}`)).status).toBe(403);
    },
    { now: () => clock },
  ),
);

const timers: { fn: () => void; cancel: ReturnType<typeof mock> }[] = [];
test(
  "an old snap's timer cannot close the new one",
  withSnap(
    NO_MODEL,
    async (h) => {
      timers.length = 0;
      h.attempt();
      const a = (await h.mint()).body;
      const b = (await h.mint()).body;
      expect(timers[0]?.cancel).toHaveBeenCalled();
      timers[0]?.fn();
      const tb = tokenOf(b);
      expect((await h.main(`/api/snap?token=${tb}`)).status).toBe(200);
      expect((await fetch(`${h.lanBase(b)}/api/snap?token=${tb}`)).status).toBe(
        200,
      );
      expect(a.lan).not.toBe(b.lan);
    },
    {
      schedule: (fn) => {
        const cancel = mock(() => {});
        timers.push({ fn, cancel });
        return cancel;
      },
    },
  ),
);

test(
  "LAN: nothing without a valid token, and nothing beyond the snap routes",
  withSnap(NO_MODEL, async (h) => {
    h.attempt();
    const { body } = await h.mint();
    const base = h.lanBase(body);
    expect((await fetch(`${base}/snap.html`)).status).toBe(403);
    expect((await fetch(`${base}/snap.html?token=wrong`)).status).toBe(403);
    expect(
      (await fetch(`${base}/snap.html?token=${tokenOf(body)}`)).status,
    ).toBe(200);
    expect((await fetch(`${base}/api/snap`)).status).toBe(403);
    const empty = await fetch(`${base}/api/snap/photo`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(empty.status).toBe(403);
    for (const p of [
      "/api/state",
      "/api/squad",
      "/api/coach",
      "/",
      "/map.html",
    ])
      expect((await fetch(`${base}${p}`)).status).toBe(404);
    const ev = await fetch(`${base}/api/event`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    expect(ev.status).toBe(404);
  }),
);

test(
  "LAN: a foreign Host or Origin → 403",
  withSnap(NO_MODEL, async (h) => {
    h.attempt();
    const { body } = await h.mint();
    const base = h.lanBase(body);
    const q = `${base}/api/snap?token=${tokenOf(body)}`;
    expect((await fetch(q)).status).toBe(200);
    expect((await fetch(q, { headers: { host: "evil.example" } })).status).toBe(
      403,
    );
    expect(
      (await fetch(q, { headers: { origin: "http://evil.example" } })).status,
    ).toBe(403);
  }),
);

test(
  "not a photo → 400 and the token stays open",
  withSnap(NO_MODEL, async (h) => {
    h.attempt();
    const { body } = await h.mint();
    const base = h.lanBase(body);
    const token = tokenOf(body);
    const pdf = dataUrl(new Uint8Array(Buffer.from("%PDF-1.4")));
    const r = await h.upload(base, token, pdf);
    expect(r.status).toBe(400);
    expect((await read(r)).error).toBe(
      "That file is not a photo the tutor can read. Use a JPEG or PNG.",
    );
    expect((await h.upload(base, token)).status).toBe(202);
    await h.snaps.current()?.done;
  }),
);

test(
  "an oversized photo is refused and nothing is saved",
  withSnap(NO_MODEL, async (h) => {
    h.attempt();
    const { body } = await h.mint();
    const big = new Uint8Array(6 * 1024 * 1024);
    big.set(JPEG);
    const r = await h.upload(h.lanBase(body), tokenOf(body), dataUrl(big));
    expect([400, 413]).toContain(r.status);
    const local = await h.upload(
      new URL((await h.main("/")).url).origin,
      tokenOf(body),
      dataUrl(big),
    );
    expect(local.status).toBe(400);
    expect(h.intake()).toEqual([]);
  }),
);

test(
  "upload with a vision model: saved, marked 4 of 5 clean, one photo event with the marks",
  withSnap("fake", async (h) => {
    h.attempt();
    const { body } = await h.mint();
    const base = h.lanBase(body);
    const token = tokenOf(body);
    expect((await h.upload(base, token)).status).toBe(202);
    await h.snaps.current()?.done;
    const s = (await (
      await fetch(`${base}/api/snap?token=${token}`)
    ).json()) as {
      state: string;
      result: Record<string, unknown>;
    };
    expect(s.state).toBe("done");
    expect(s.result).toMatchObject({
      recorded: true,
      marked: true,
      marks: 4,
      of: 5,
      clean: true,
    });
    const files = h.intake();
    expect(files).toHaveLength(1);
    expect(lastEvent(h.data)).toMatchObject({
      type: "photo",
      item: ITEM,
      file: `intake/${files[0]}`,
      marks: 4,
      of: 5,
      clean: true,
    });
  }),
);

test(
  "a slow model: the upload answers at once and the status reads marking",
  withSnap(
    "fake",
    async (h) => {
      h.attempt();
      const { body } = await h.mint();
      const base = h.lanBase(body);
      const token = tokenOf(body);
      const t0 = performance.now();
      expect((await h.upload(base, token)).status).toBe(202);
      expect(performance.now() - t0).toBeLessThan(200);
      const s = await read(fetch(`${base}/api/snap?token=${token}`));
      expect(s.state).toBe("marking");
      expect(s.result).toBeNull();
      await h.snaps.current()?.done;
    },
    {},
    { delayMs: 500 },
  ),
);

test(
  "no model: the photo is saved and recorded, not marked",
  withSnap(NO_MODEL, async (h) => {
    h.attempt();
    const { body } = await h.mint();
    const token = tokenOf(body);
    expect((await h.upload(h.lanBase(body), token)).status).toBe(202);
    await h.snaps.current()?.done;
    const s = await read(h.main(`/api/snap?token=${token}`));
    expect(s).toMatchObject({
      model: false,
      state: "done",
      result: { recorded: true, marked: false },
    });
    expect(h.intake()).toHaveLength(1);
    const e = lastEvent(h.data);
    expect(e.type).toBe("photo");
    expect(e).not.toHaveProperty("marks");
  }),
);

test(
  "the event append fails: recorded false, and the photo stays on disk",
  withSnap(
    "fake",
    async (h) => {
      h.attempt();
      const { body } = await h.mint();
      const token = tokenOf(body);
      expect((await h.upload(h.lanBase(body), token)).status).toBe(202);
      const log = path.join(h.data, "events.jsonl");
      fs.rmSync(log);
      fs.mkdirSync(log);
      await h.snaps.current()?.done;
      const s = await read(h.main(`/api/snap?token=${token}`));
      expect(s.result).toMatchObject({ recorded: false, marked: true });
      expect(h.intake()).toHaveLength(1);
    },
    {},
    { delayMs: 300 },
  ),
);

test(
  "drop-a-file fallback on localhost: same result; a foreign Origin → 403",
  withSnap("fake", async (h) => {
    h.attempt();
    const { body } = await h.mint();
    const token = tokenOf(body);
    const local = new URL((await h.main("/")).url).origin;
    const foreign = await h.upload(local, token, undefined, {
      origin: "http://evil.example",
    });
    expect(foreign.status).toBe(403);
    expect((await h.upload(local, token)).status).toBe(202);
    await h.snaps.current()?.done;
    const s = await read(h.main(`/api/snap?token=${token}`));
    expect(s.result).toMatchObject({
      recorded: true,
      marked: true,
      marks: 4,
      of: 5,
    });
  }),
);

test(
  "a generated item: the snap and the event carry its seed",
  withSnap(NO_MODEL, async (h) => {
    h.attempt(`${TOPIC}#gen`, 5);
    const { body } = await h.mint();
    expect(h.snaps.current()?.ref).toEqual({ id: `${TOPIC}#gen`, seed: 5 });
    expect((await h.upload(h.lanBase(body), tokenOf(body))).status).toBe(202);
    await h.snaps.current()?.done;
    expect(lastEvent(h.data)).toMatchObject({
      type: "photo",
      item: `${TOPIC}#gen`,
      seed: 5,
    });
  }),
);
