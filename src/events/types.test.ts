import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { EVENT_KEYS, parseEvent } from "./types";

const VALID_ATTEMPT = `{"v":1,"t":"2026-10-03T17:42:10Z","type":"attempt","item":"maths/U349/g","topic":"1MA1/R9","correct":false,"sure":true,"answer":"4.5"}`;

test.each([...EVENT_KEYS])(
  "fixture for %s exists and every line parses",
  (key) => {
    const [type, v] = key.split("@");
    const file = path.join(
      import.meta.dir,
      "__fixtures__",
      `${type}.v${v}.jsonl`,
    );
    expect(fs.existsSync(file)).toBe(true);
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      const e = parseEvent(line);
      expect(e).not.toBeNull();
      expect(e?.type).toBe(type as NonNullable<typeof e>["type"]);
      expect(String(e?.v)).toBe(v as string);
    }
  },
);

test.each([
  ["not json", "not json"],
  ["an array", "[]"],
  ["null", "null"],
  ["an unknown version", VALID_ATTEMPT.replace('"v":1', '"v":2')],
  ["an unknown type", VALID_ATTEMPT.replace('"attempt"', '"login"')],
  ["a missing field", VALID_ATTEMPT.replace(',"sure":true', "")],
  [
    "a non-UTC time",
    VALID_ATTEMPT.replace("2026-10-03T17:42:10Z", "2026-10-03T18:42:10+01:00"),
  ],
  [
    "a score above the total",
    `{"v":1,"t":"2026-10-08T16:00:00Z","type":"retest","topic":"1MA1/R9","score":4,"of":3,"passed":true}`,
  ],
  [
    "zero XP",
    `{"v":1,"t":"2026-10-08T16:00:00Z","type":"xp","amount":0,"reason":"attempt"}`,
  ],
  [
    "an impossible month",
    VALID_ATTEMPT.replace("2026-10-03T17:42:10Z", "2026-13-01T10:00:00Z"),
  ],
  [
    "a day that rolls over",
    VALID_ATTEMPT.replace("2026-10-03T17:42:10Z", "2026-02-30T10:00:00Z"),
  ],
  ["a string version", VALID_ATTEMPT.replace('"v":1', '"v":"1"')],
  ["an array type", VALID_ATTEMPT.replace('"attempt"', '["attempt"]')],
  [
    "an intake with no topics",
    `{"v":1,"t":"2026-10-08T16:00:00Z","type":"intake","door":"sheet","topics":[]}`,
  ],
])("parseEvent refuses %s", (_name, line) => {
  expect(parseEvent(line)).toBeNull();
});

test("parseEvent ignores extra keys", () => {
  const line = VALID_ATTEMPT.replace('"answer"', '"bet":2,"answer"');
  expect(parseEvent(line)).not.toBeNull();
});
