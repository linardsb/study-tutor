import { expect, test } from "bun:test";
import { openBrowser, startServer } from "./server";

test("port ladder: skips a taken port, falls back to any free port, serves the page", async () => {
  // The OS picks the anchor, so no port in the ladder can already belong to another socket.
  const first = startServer([0]);
  const base = first.port ?? 0; // undefined only for a unix socket; the assertion below covers 0
  const second = startServer([base, base + 1, 0]);
  const last = startServer([base, 0]);
  try {
    expect(base).not.toBe(0);
    expect(second.port).not.toBe(base);
    expect(second.port).not.toBe(0);

    const page = await fetch(`http://127.0.0.1:${second.port}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await page.text()).toContain("Study tutor");

    const missing = await fetch(`http://127.0.0.1:${second.port}/nope`);
    expect(missing.status).toBe(404);

    expect(() => startServer([base])).toThrow(`No free port in ${base}`);

    expect(last.port).not.toBe(0);
    expect(last.port).not.toBe(base);
  } finally {
    first.stop(true);
    second.stop(true);
    last.stop(true);
  }
});

test("openBrowser does not throw when the opener is missing from PATH", () => {
  // Pretend to be Linux on a machine without xdg-open; the server must keep running.
  const platform = Object.getOwnPropertyDescriptor(process, "platform");
  Object.defineProperty(process, "platform", {
    value: "linux",
    configurable: true,
  });
  try {
    expect(Bun.which("xdg-open")).toBeNull();
    expect(() => openBrowser("http://127.0.0.1:1/")).not.toThrow();
  } finally {
    if (platform) Object.defineProperty(process, "platform", platform);
  }
});
