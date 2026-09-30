/**
 * Examiner mode's camera route (O3, D8). The map mints one snap for the pupil's last attempted item. A
 * second listener, bound to the PC's private IPv4 address only while that snap is open, serves the snap
 * page to the phone. The upload is saved, answered with 202, and marked in the background; the page
 * polls the status. The same routes on localhost take a dropped file when the phone cannot reach the PC.
 */
import crypto from "node:crypto";
import type os from "node:os";
import path from "node:path";
import { renderSVG } from "uqr";
import { titleOf } from "./api/chat";
import { readConfig } from "./config";
import { toItemView } from "./content/pack";
import type { CasePack } from "./content/types";
import { appendEvent, readLines, writeIntakeFile } from "./events/append";
import { findItem } from "./flow/chat";
import { examine, lastAttempt, photoRecord } from "./flow/examiner";
import type { ExamLine } from "./jobs/examiner_mark";
import type { ItemRef } from "./jobs/view";
import { utcNow } from "./mcp/clock";

// expected: long enough to find a phone and take a photo.
export const SNAP_TTL_MS = 15 * 60_000;
// derived: the worst-case job is 240 s (two tries at the provider's 120 s timeout), so 10 minutes
// leaves 6 to read the result.
export const AFTER_UPLOAD_MS = 10 * 60_000;
// expected: Anthropic's per-image limit (vision docs).
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
// derived: base64 inflates by 4/3, so 5 MB is about 6.7 MB, plus the JSON.
export const MAX_LAN_BODY = 8 * 1024 * 1024;

export const TEXT = {
  noAttempt: "Try a question first. Then photograph your working.",
  gone: "That question is no longer in the pack.",
  expired: "This link has expired. Open a new one from the map.",
  expiredPage:
    "This link has expired. Open a new one from the map on the computer.",
  notPhoto: "That file is not a photo the tutor can read. Use a JPEG or PNG.",
  notSaved: "Could not save the photo.",
} as const;

type Result = { status: number; body: unknown };
type Listener = ReturnType<typeof Bun.serve>;

const VIRTUAL =
  /(?:^(?:utun|awdl|llw|bridge|docker|vboxnet|vmnet))|(?:vEthernet|VirtualBox|VMware|Hyper-V|WSL|Tailscale|ZeroTier)/i;

/** Rank of a private IPv4 address a phone on the home Wi-Fi can reach; null when it is not one. */
function rank(a: string): number | null {
  const [p, q] = a.split(".").map(Number) as [number, number];
  if (p === 192 && q === 168) return a.startsWith("192.168.56.") ? 3 : 0; // 56: VirtualBox host-only
  if (p === 10) return 1;
  if (p === 172 && q >= 16 && q <= 31) return 2;
  return null;
}

/** The PC's Wi-Fi address: private IPv4, not loopback, link-local or a virtual adapter. Null when none. */
export function lanAddress(
  ifaces: NodeJS.Dict<os.NetworkInterfaceInfo[]>,
): string | null {
  const found: { a: string; r: number }[] = [];
  for (const [name, list] of Object.entries(ifaces)) {
    if (VIRTUAL.test(name)) continue;
    for (const i of list ?? []) {
      if (i.family !== "IPv4" || i.internal) continue;
      const r = rank(i.address);
      if (r !== null) found.push({ a: i.address, r });
    }
  }
  found.sort((x, y) => x.r - y.r);
  return found[0]?.a ?? null;
}

/** JPEG, PNG or WebP by their magic bytes; anything else (HEIC, GIF, PDF) is null. */
export function sniffImage(
  b: Uint8Array,
): { mime: string; ext: "jpg" | "png" | "webp" } | null {
  const at = (i: number, bytes: number[]) =>
    bytes.every((x, j) => b[i + j] === x);
  if (at(0, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (at(0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return { mime: "image/png", ext: "png" };
  if (at(0, [0x52, 0x49, 0x46, 0x46]) && at(8, [0x57, 0x45, 0x42, 0x50]))
    return { mime: "image/webp", ext: "webp" };
  return null;
}

const DATA_URL = /^data:image\/(?:jpeg|png|webp);base64,/;

/** The bytes of an image data URL within MAX_PHOTO_BYTES, or null. The length is checked before decoding. */
export function decodeDataUrl(s: unknown): Uint8Array | null {
  if (typeof s !== "string") return null;
  if (s.length > Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 64) return null;
  const m = DATA_URL.exec(s);
  if (m === null) return null;
  const bytes = new Uint8Array(Buffer.from(s.slice(m[0].length), "base64"));
  return bytes.length > 0 && bytes.length <= MAX_PHOTO_BYTES ? bytes : null;
}

export type SnapResult =
  | { recorded: boolean; marked: false }
  | {
      recorded: boolean;
      marked: true;
      lines: ExamLine[];
      marks: number;
      of: number;
      clean: boolean;
    };
export type Snap = {
  token: string;
  ref: ItemRef;
  lan: Listener | null;
  state: "open" | "marking" | "done";
  result: SnapResult | null;
  deadline: number;
  spent: boolean; // the marked result has been served once; the token is refused from then on (L7)
  done: Promise<void>; // background marking; resolved when there is none
  cancel: () => void; // this snap's own expiry timer
};
export type Snaps = ReturnType<typeof createSnaps>;

const base64url = (b: Uint8Array) => Buffer.from(b).toString("base64url");

/** The snap store: one live snap, held in memory, so a restart ends it. */
export function createSnaps({
  now = Date.now,
  token = () => base64url(crypto.getRandomValues(new Uint8Array(32))),
  schedule = (fn: () => void, ms: number) => {
    const t = setTimeout(fn, ms);
    t.unref();
    return () => clearTimeout(t);
  },
}: {
  now?: () => number;
  token?: () => string;
  schedule?: (fn: () => void, ms: number) => () => void;
} = {}) {
  let live: Snap | null = null;
  const known = new Set<Snap>(); // every snap not yet closed and settled, for closeAll

  /** Acts on this snap by identity: an old snap's timer can never close the one minted after it. */
  function close(snap: Snap): void {
    snap.cancel();
    snap.lan?.stop(true);
    snap.lan = null;
    if (live === snap) live = null;
    void snap.done.finally(() => known.delete(snap));
  }

  function open(ref: ItemRef, lan: Listener | null): Snap {
    if (live !== null) close(live);
    const snap: Snap = {
      token: token(),
      ref,
      lan,
      state: "open",
      result: null,
      deadline: now() + SNAP_TTL_MS,
      spent: false,
      done: Promise.resolve(),
      cancel: () => {},
    };
    snap.cancel = schedule(() => close(snap), SNAP_TTL_MS);
    live = snap;
    known.add(snap);
    return snap;
  }

  /** The live snap for this token before its deadline and before its result was served. Status reads use it. */
  function find(t: unknown): Snap | null {
    if (
      live === null ||
      live.spent ||
      typeof t !== "string" ||
      now() >= live.deadline
    )
      return null;
    const a = Buffer.from(t);
    const b = Buffer.from(live.token);
    return a.length === b.length && crypto.timingSafeEqual(a, b) ? live : null;
  }

  /** The upload's claim: re-checks and sets the state in one synchronous step, so two uploads cannot both pass. */
  function take(t: unknown): Snap | null {
    const snap = find(t);
    if (snap?.state !== "open") return null;
    snap.state = "marking";
    snap.deadline = Math.max(snap.deadline, now() + AFTER_UPLOAD_MS);
    snap.cancel();
    snap.cancel = schedule(() => close(snap), snap.deadline - now());
    return snap;
  }

  return {
    open,
    find,
    take,
    current: () => live,
    /**
     * Stops every listener and timer first, so no snap takes another upload, then waits for background
     * marking: a photo already taken is still marked and recorded.
     */
    async closeAll(): Promise<void> {
      const all = [...known];
      for (const s of all) close(s);
      await Promise.all(all.map((s) => s.done));
      known.clear();
    },
  };
}

export type SnapContext = {
  root: string;
  dataDir: string;
  pack: CasePack;
  snaps: Snaps;
  snapHost: () => string | null;
};

/** POST /api/snap (localhost only): a snap for the last attempted item with `answers`, with the phone's link and its QR code. */
export function mintSnap(ctx: SnapContext): Result {
  // examiner_mark scores on a numeric rubric, so a written answer (no `answers`) is passed over. A gone
  // item is kept, so it still gets its own refusal below.
  const ref = lastAttempt(readLines(ctx.dataDir), (r) => {
    const it = findItem(ctx.pack, r.id, r.seed);
    return it === null || (it.answers ?? []).length > 0;
  });
  if (ref === null) return { status: 409, body: { error: TEXT.noAttempt } };
  const item = findItem(ctx.pack, ref.id, ref.seed);
  if (item === null) return { status: 409, body: { error: TEXT.gone } };
  const host = ctx.snapHost();
  let lan: Listener | null = null;
  if (host !== null) {
    try {
      lan = startSnapListener(host, ctx);
    } catch (err) {
      console.error(`Could not open the phone link: ${(err as Error).message}`);
    }
  }
  const snap = ctx.snaps.open(ref, lan);
  const q = `/snap.html?token=${snap.token}`;
  const lanUrl = lan === null ? null : `http://${host}:${lan.port}${q}`;
  return {
    status: 201,
    body: {
      local: q,
      lan: lanUrl,
      qr: lanUrl === null ? null : renderSVG(lanUrl, { border: 2 }),
      title: titleOf(ctx.pack, item.topic),
      stem: item.stem,
      expires: new Date(snap.deadline).toISOString(),
    },
  };
}

/** GET /api/snap?token=: the question side of the item, whether a model is set, and the marking status. */
export function getSnap(token: unknown, ctx: SnapContext): Result {
  const snap = ctx.snaps.find(token);
  if (snap === null) return { status: 403, body: { error: TEXT.expired } };
  const item = findItem(ctx.pack, snap.ref.id, snap.ref.seed);
  if (item === null) return { status: 409, body: { error: TEXT.gone } };
  // Named fields from the stripped view: answers, working and mark_scheme never reach the page.
  const view = toItemView(item);
  const preset = readConfig(ctx.dataDir)?.preset;
  // The token travels over plain HTTP on the LAN, so it ends once the result is served (L7). The
  // listener is left to the snap's own timer: stopping it here could drop this very response.
  if (snap.state === "done") snap.spent = true;
  return {
    status: 200,
    body: {
      title: titleOf(ctx.pack, view.topic),
      stem: view.stem,
      ...(view.figure === undefined ? {} : { figure: view.figure }),
      model: preset !== undefined && preset !== "none",
      state: snap.state,
      result: snap.state === "done" ? snap.result : null,
    },
  };
}

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * POST /api/snap/photo, body {token, image}. The token first, so `{}` is a 403. From the find to the take
 * nothing is awaited, and take re-checks the state itself. Saves the file, answers 202, marks in the background.
 */
export async function postPhoto(
  body: unknown,
  ctx: SnapContext,
): Promise<Result> {
  const token = isObj(body) ? body.token : undefined;
  const open = ctx.snaps.find(token);
  if (open?.state !== "open")
    return { status: 403, body: { error: TEXT.expired } };
  const bytes = decodeDataUrl(isObj(body) ? body.image : undefined);
  const kind = bytes === null ? null : sniffImage(bytes);
  if (bytes === null || kind === null)
    return { status: 400, body: { error: TEXT.notPhoto } };
  const snap = ctx.snaps.take(token);
  if (snap === null) return { status: 403, body: { error: TEXT.expired } };
  const stamp = utcNow().replace(/[-:]/g, "").replace("T", "-").slice(0, 15);
  const hex = Buffer.from(crypto.getRandomValues(new Uint8Array(3))).toString(
    "hex",
  );
  let rel: string;
  try {
    rel = writeIntakeFile(ctx.dataDir, `${stamp}-${hex}.${kind.ext}`, bytes);
  } catch (err) {
    console.error(`Could not save the photo: ${(err as Error).message}`);
    snap.state = "done";
    snap.result = null;
    return { status: 500, body: { error: TEXT.notSaved } };
  }
  snap.done = markInBackground(snap, rel, bytes, kind.mime, ctx);
  return { status: 202, body: { saved: true } };
}

/** Marks the saved photo, then appends the photo event. Never rejects: every failure ends in `done`. */
async function markInBackground(
  snap: Snap,
  rel: string,
  bytes: Uint8Array,
  mime: string,
  ctx: SnapContext,
): Promise<void> {
  try {
    const item = findItem(ctx.pack, snap.ref.id, snap.ref.seed);
    if (item === null) throw new Error("the item is no longer in the pack");
    const reply = await examine(
      {
        item,
        topic: titleOf(ctx.pack, item.topic),
        photo: { bytes, mime },
      },
      readLines(ctx.dataDir),
      { dataDir: ctx.dataDir },
    );
    // After the job: the event names a file that already exists.
    let recorded = false;
    try {
      appendEvent(ctx.dataDir, photoRecord(item, rel, reply));
      recorded = true;
    } catch (err) {
      console.error(`Could not record the photo: ${(err as Error).message}`);
    }
    snap.result =
      reply.kind === "marks"
        ? {
            recorded,
            marked: true,
            lines: reply.lines,
            marks: reply.marks,
            of: reply.of,
            clean: reply.clean,
          }
        : { recorded, marked: false };
  } catch (err) {
    console.error(`Could not mark the photo: ${(err as Error).message}`);
    snap.result = { recorded: false, marked: false };
  }
  snap.state = "done";
}

function json(status: number, body: unknown): Response {
  return Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

/** The LAN listener's own check: Host is exactly this listener, an Origin when present is too, a POST is JSON. */
export function refuseLan(req: Request, expected: string): Response | null {
  if (req.headers.get("host") !== expected)
    return json(403, { error: "Refused: not this tutor's address" });
  const origin = req.headers.get("origin");
  if (origin !== null && origin !== `http://${expected}`)
    return json(403, { error: "Refused: not the tutor's own page" });
  if (req.method === "POST") {
    const type = req.headers.get("content-type") ?? "";
    if (!/^application\/json\b/i.test(type))
      return json(415, { error: "Body must be application/json" });
  }
  return null;
}

/**
 * The phone's listener, bound to `host` itself, never a wildcard. It serves an allow-list: the snap page
 * (token required), its script and stylesheet, and the two snap routes. Everything else, /api/* included, is 404.
 */
export function startSnapListener(host: string, ctx: SnapContext): Listener {
  type Srv = { port?: number };
  const guard = (req: Request, server: Srv) =>
    refuseLan(req, `${host}:${server.port}`);
  const appFile = (name: string) => (req: Request, server: Srv) =>
    guard(req, server) ??
    new Response(Bun.file(path.join(ctx.root, "app", name)), {
      headers: { "cache-control": "no-cache" },
    });
  return Bun.serve({
    hostname: host,
    port: 0,
    maxRequestBodySize: MAX_LAN_BODY,
    routes: {
      "/snap.html": {
        GET: (req, server) => {
          const refused = guard(req, server);
          if (refused) return refused;
          const token = new URL(req.url).searchParams.get("token");
          if (ctx.snaps.find(token) === null)
            return new Response(TEXT.expiredPage, { status: 403 });
          return appFile("snap.html")(req, server);
        },
      },
      "/snap.js": { GET: appFile("snap.js") },
      "/style.css": { GET: appFile("style.css") },
      "/api/snap": {
        GET: (req, server) => {
          const refused = guard(req, server);
          if (refused) return refused;
          const r = getSnap(new URL(req.url).searchParams.get("token"), ctx);
          return json(r.status, r.body);
        },
      },
      "/api/snap/photo": {
        POST: async (req, server) => {
          const refused = guard(req, server);
          if (refused) return refused;
          let body: unknown;
          try {
            body = await req.json();
          } catch {
            return json(400, { error: "Body is not JSON" });
          }
          const r = await postPhoto(body, ctx);
          return json(r.status, r.body);
        },
      },
    },
    fetch: () => new Response("Not found", { status: 404 }),
    // The localhost snapRoute's catch, for the phone: a throw never reaches it as Bun's error page.
    error: (err) => {
      console.error(`Could not open the photo link: ${err.message}`);
      return json(500, { error: "Could not open the photo link" });
    },
  });
}
