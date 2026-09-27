import { expect, test } from "bun:test";
import { startServer } from "./server";

test("port ladder: skips a taken port, falls back to any free port, serves the page", async () => {
  const base = 20000 + Math.floor(Math.random() * 30000);
  const first = startServer([base]);
  const second = startServer([base, base + 1]);
  const last = startServer([base, 0]);
  try {
    expect(first.port).toBe(base);
    expect(second.port).toBe(base + 1);

    const page = await fetch(`http://127.0.0.1:${second.port}/`);
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(await page.text()).toContain("Study tutor");

    const missing = await fetch(`http://127.0.0.1:${second.port}/nope`);
    expect(missing.status).toBe(404);

    expect(() => startServer([base])).toThrow("No free port");

    expect(last.port).not.toBe(0);
    expect(last.port).not.toBe(base);
  } finally {
    first.stop(true);
    second.stop(true);
    last.stop(true);
  }
});
