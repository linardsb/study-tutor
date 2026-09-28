import { expect, test } from "bun:test";
import { parseEvent, type SessionV1 } from "../events/types";
import {
  endBody,
  type OpenSession,
  onSession,
  openToday,
  startBody,
} from "./session";

const start = (
  mode: SessionV1["mode"],
  topic: string | undefined,
  t: string,
): SessionV1 =>
  topic === undefined
    ? { v: 1, t, type: "session", phase: "start", mode }
    : { v: 1, t, type: "session", phase: "start", mode, topic };
const end = (t: string): SessionV1 => ({
  v: 1,
  t,
  type: "session",
  phase: "end",
  mode: "lesson",
});

test("a start opens a session", () => {
  expect(
    onSession(null, start("lesson", "1MA1/R4", "2026-10-05T16:00:00Z")),
  ).toEqual({
    mode: "lesson",
    topic: "1MA1/R4",
    t: "2026-10-05T16:00:00Z",
  });
});

test("a start while one is open replaces it", () => {
  const open: OpenSession = {
    mode: "lesson",
    topic: "1MA1/R4",
    t: "2026-10-05T16:00:00Z",
  };
  expect(
    onSession(open, start("boss", undefined, "2026-10-05T17:00:00Z")),
  ).toEqual({
    mode: "boss",
    topic: null,
    t: "2026-10-05T17:00:00Z",
  });
});

test("an end closes whatever is open, and closing nothing stays idle", () => {
  const open: OpenSession = {
    mode: "practice",
    topic: "1MA1/N12",
    t: "2026-10-05T16:00:00Z",
  };
  expect(onSession(open, end("2026-10-05T16:30:00Z"))).toBeNull();
  expect(onSession(null, end("2026-10-05T16:30:00Z"))).toBeNull();
});

test("the bodies parse once t is added; no topic key when there is no topic", () => {
  const t = "2026-10-05T16:00:00Z";
  const boss = startBody("boss", null);
  expect("topic" in boss).toBe(false);
  expect(parseEvent(JSON.stringify({ ...boss, t }))).not.toBeNull();
  const lesson = startBody("lesson", "1MA1/R4");
  expect(parseEvent(JSON.stringify({ ...lesson, t }))).not.toBeNull();
  const e = endBody({ mode: "lesson", topic: "1MA1/R4", t });
  expect(e).toEqual({
    v: 1,
    type: "session",
    phase: "end",
    mode: "lesson",
    topic: "1MA1/R4",
  });
  expect(parseEvent(JSON.stringify({ ...e, t }))).not.toBeNull();
  expect("topic" in endBody({ mode: "boss", topic: null, t })).toBe(false);
});

test("openToday: a session started today in London is open, one from yesterday is not", () => {
  // 23:30Z on 11 Oct is 00:30 on 12 Oct in BST.
  const open: OpenSession = {
    mode: "lesson",
    topic: "1MA1/R4",
    t: "2026-10-11T23:30:00Z",
  };
  expect(openToday(open, "2026-10-12")).toEqual(open);
  expect(openToday(open, "2026-10-13")).toBeNull();
  expect(
    openToday({ ...open, t: "2026-10-11T22:30:00Z" }, "2026-10-12"),
  ).toBeNull();
  expect(openToday(null, "2026-10-12")).toBeNull();
});
