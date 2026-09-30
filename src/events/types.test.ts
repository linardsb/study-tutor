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
  ["an unknown version", VALID_ATTEMPT.replace('"v":1', '"v":3')],
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
  [
    "a usage marked estimated false",
    `{"v":1,"t":"2026-10-08T16:00:00Z","type":"usage","job":"hint","model":"m","input":1,"output":1,"estimated":false}`,
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

const A2 = VALID_ATTEMPT.replace('"v":1', '"v":2');
test.each([
  ["v2 correct null", A2.replace('"correct":false', '"correct":null'), true],
  ["v2 correct false", A2, true],
  [
    "v2 correct as a string",
    A2.replace('"correct":false', '"correct":"null"'),
    false,
  ],
  ["v2 with correct missing", A2.replace('"correct":false,', ""), false],
  [
    "v1 correct null",
    VALID_ATTEMPT.replace('"correct":false', '"correct":null'),
    false,
  ],
])("attempt@2 shapes: %s parses = %p", (_name, line, ok) => {
  expect(parseEvent(line) !== null).toBe(ok);
});

test("parseEvent ignores extra keys", () => {
  const line = VALID_ATTEMPT.replace('"answer"', '"bet":2,"answer"');
  expect(parseEvent(line)).not.toBeNull();
});

const PHOTO = `{"v":1,"t":"2026-10-15T18:00:00Z","type":"photo","item":"1MA1/R9#1","topic":"1MA1/R9","file":"intake/20261015-180000-a1b2c3.jpg"`;
test.each([
  ["unmarked", `${PHOTO}}`, true],
  ["marked 3/5 not clean", `${PHOTO},"marks":3,"of":5,"clean":false}`, true],
  [
    "marked 5/5 clean with a seed",
    `${PHOTO},"seed":7,"marks":5,"of":5,"clean":true}`,
    true,
  ],
  ["marks without of", `${PHOTO},"marks":3,"clean":false}`, false],
  ["of without marks", `${PHOTO},"of":5,"clean":false}`, false],
  ["marks above of", `${PHOTO},"marks":6,"of":5,"clean":false}`, false],
  ["of zero", `${PHOTO},"marks":0,"of":0,"clean":false}`, false],
  ["clean without marks", `${PHOTO},"clean":true}`, false],
  ["clean as a string", `${PHOTO},"marks":3,"of":5,"clean":"yes"}`, false],
  ["a negative seed", `${PHOTO},"seed":-1}`, false],
])("photo: %s", (_name, line, ok) => {
  expect(parseEvent(line) !== null).toBe(ok);
});
