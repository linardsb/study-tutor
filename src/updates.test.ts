import { expect, test } from "bun:test";
import { checkForUpdate, isNewer, RELEASES_PAGE } from "./updates";

/** A loopback feed on a free port for the test's duration. */
async function withFeed(
  handler: (req: Request) => Response | Promise<Response>,
  fn: (url: string) => Promise<void>,
) {
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
  try {
    await fn(`http://127.0.0.1:${server.port}/releases/latest`);
  } finally {
    server.stop(true);
  }
}

const release = (tag: unknown, url: unknown = `${RELEASES_PAGE}tag/${tag}`) =>
  Response.json({ tag_name: tag, html_url: url });

test("isNewer compares X.Y.Z numerically and refuses anything else", () => {
  expect(isNewer("v0.2.0", "0.1.0")).toBe(true);
  expect(isNewer("0.10.0", "0.9.9")).toBe(true);
  expect(isNewer("1.0.0", "0.99.99")).toBe(true);
  expect(isNewer("v0.1.0", "0.1.0")).toBe(false);
  expect(isNewer("0.0.9", "0.1.0")).toBe(false);
  for (const junk of ["v1.0", "latest", ""]) {
    expect(isNewer(junk, "0.1.0")).toBe(false);
  }
  expect(isNewer("0.2.0", "dev")).toBe(false);
});

test("a dev build never asks the feed", async () => {
  const r = await checkForUpdate("dev", "http://127.0.0.1:1/", () => {
    throw new Error("fetched");
  });
  expect(r).toEqual({ version: "dev", update: null });
});

test("a newer release is reported with its version and page", async () => {
  await withFeed(
    () => release("v0.2.0"),
    async (url) => {
      expect(await checkForUpdate("0.1.0", url)).toEqual({
        version: "0.1.0",
        update: { version: "0.2.0", url: `${RELEASES_PAGE}tag/v0.2.0` },
      });
    },
  );
});

test.each(["v0.1.0", "v0.0.9"])(
  "release %s is not an update for 0.1.0",
  async (tag) => {
    await withFeed(
      () => release(tag),
      async (url) => {
        expect((await checkForUpdate("0.1.0", url)).update).toBeNull();
      },
    );
  },
);

// The body names a newer release, so only the status check keeps these at "no update".
test.each([404, 403, 500])("status %d is no update", async (status) => {
  await withFeed(
    () =>
      Response.json(
        { tag_name: "v9.9.9", html_url: `${RELEASES_PAGE}tag/v9.9.9` },
        { status },
      ),
    async (url) => {
      expect((await checkForUpdate("0.1.0", url)).update).toBeNull();
    },
  );
});

test.each([
  ["not json", () => new Response("not json")],
  ["{}", () => Response.json({})],
  ["a number tag", () => release(3)],
  ["null", () => Response.json(null)],
])("a junk body (%s) is no update", async (_name, handler) => {
  await withFeed(handler, async (url) => {
    expect((await checkForUpdate("0.1.0", url)).update).toBeNull();
  });
});

test("a page outside the releases prefix is no update", async () => {
  await withFeed(
    () => release("v0.2.0", "https://evil.example/x"),
    async (url) => {
      expect((await checkForUpdate("0.1.0", url)).update).toBeNull();
    },
  );
});

test("a feed that never answers resolves to no update after the timeout", async () => {
  await withFeed(
    () => new Promise<Response>(() => {}),
    async (url) => {
      const t = performance.now();
      const r = await checkForUpdate("0.1.0", url, fetch, 100);
      expect(r.update).toBeNull();
      expect(performance.now() - t).toBeLessThan(2000);
    },
  );
});

test("a refused connection is no update", async () => {
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(),
  });
  const url = `http://127.0.0.1:${server.port}/`;
  server.stop(true);
  expect((await checkForUpdate("0.1.0", url)).update).toBeNull();
});
