declare const BUILD_VERSION: string | undefined;

/** The release this binary was built as ("0.2.0"), or "dev" under `bun run dev` and `bun test`. */
export const VERSION =
  typeof BUILD_VERSION === "string" ? BUILD_VERSION : "dev";

// One owner/repo for the feed and the page prefix (PRD Q6, #35).
export const RELEASES_FEED =
  "https://api.github.com/repos/linardsb/study-tutor/releases/latest";
export const RELEASES_PAGE =
  "https://github.com/linardsb/study-tutor/releases/";

export type UpdateInfo = {
  version: string;
  update: { version: string; url: string } | null;
};

type Fetch = (url: string, init: RequestInit) => Promise<Response>;

function parseVersion(s: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(s);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** True when `tag` ("v0.2.0" or "0.2.0") is a later release than `current`; false if either does not parse. */
export function isNewer(tag: string, current: string): boolean {
  const a = parseVersion(tag);
  const b = parseVersion(current);
  if (a === null || b === null) return false;
  for (let i = 0; i < 3; i++) {
    if (a[i] !== b[i]) return (a[i] ?? 0) > (b[i] ?? 0);
  }
  return false;
}

/**
 * Asks the releases feed once. Never rejects: offline, a timeout, any status but 200, a junk body, a tag
 * that is not newer, or a page outside RELEASES_PAGE all resolve to "no update". A dev build never asks.
 */
export async function checkForUpdate(
  current: string,
  feedUrl: string,
  fetchImpl: Fetch = fetch,
  timeoutMs = 5000,
): Promise<UpdateInfo> {
  const none: UpdateInfo = { version: current, update: null };
  if (current === "dev") return none;
  try {
    const r = await fetchImpl(feedUrl, {
      headers: {
        Accept: "application/vnd.github+json",
        "User-Agent": `study-tutor/${current}`,
      },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return none;
    const body = (await r.json()) as unknown;
    if (typeof body !== "object" || body === null) return none;
    const { tag_name: tag, html_url: url } = body as Record<string, unknown>;
    if (typeof tag !== "string" || typeof url !== "string") return none;
    if (!isNewer(tag, current) || !url.startsWith(RELEASES_PAGE)) return none;
    return {
      version: current,
      update: { version: tag.replace(/^v/, ""), url },
    };
  } catch {
    return none;
  }
}
