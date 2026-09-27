import { expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { appendEvent } from "../events/append";
import type { NewEvent } from "../events/types";
import { currentState } from "./state";

const AT = () => "2026-10-05T16:00:00Z";
const attempt = (item: string, correct: boolean): NewEvent => ({
  v: 1,
  type: "attempt",
  item,
  topic: "1MA1/R9/of-an-amount",
  correct,
  sure: true,
  answer: "4.5",
});

/** A realpathed temp dir (macOS maps /var to /private/var), removed afterwards. */
function withTemp(fn: (dir: string, data: string) => void | Promise<void>) {
  return async () => {
    const dir = fs.realpathSync.native(
      fs.mkdtempSync(path.join(os.tmpdir(), "st-api-")),
    );
    try {
      await fn(dir, path.join(dir, "data"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };
}

test(
  "an empty log gives an empty state and creates nothing",
  withTemp((_dir, data) => {
    expect(currentState(data).lines).toBe(0);
    expect(fs.existsSync(data)).toBe(false);
  }),
);

test(
  "after two attempts the sure-wrong item is in confidentWrong and state.json matches",
  withTemp((_dir, data) => {
    appendEvent(data, attempt("X", false), AT);
    appendEvent(data, attempt("Y", true), AT);
    const state = currentState(data);
    expect(state.lines).toBe(2);
    expect(state.confidentWrong.X?.topic).toBe("1MA1/R9/of-an-amount");
    expect(state.confidentWrong).not.toHaveProperty("Y");
    const stored = JSON.parse(
      fs.readFileSync(path.join(data, "state.json"), "utf8"),
    );
    expect(stored.hash).toBe(state.hash);
  }),
);

test(
  "a stale state.json is rewritten",
  withTemp((_dir, data) => {
    appendEvent(data, attempt("X", false), AT);
    fs.writeFileSync(path.join(data, "state.json"), '{"hash":"stale"}\n');
    const state = currentState(data);
    const stored = JSON.parse(
      fs.readFileSync(path.join(data, "state.json"), "utf8"),
    );
    expect(stored.hash).toBe(state.hash);
    expect(stored.hash).not.toBe("stale");
  }),
);
