/**
 * O1 session machine, pure: no clock, no file, no Math.random. Idle → a session start (mode and topic)
 * → open → a session end → idle. Every transition is one event; replay keeps the open session.
 */
import type { NewEvent, SessionV1 } from "../events/types";
import { localDay } from "../mcp/clock";

export type Mode = SessionV1["mode"];
export type OpenSession = { mode: Mode; topic: string | null; t: string };

/** Replay's bookkeeping: a start opens (replacing any open one: a closed tab never ended it); an end closes whatever is open. */
export function onSession(
  _open: OpenSession | null,
  e: SessionV1,
): OpenSession | null {
  if (e.phase === "end") return null;
  return { mode: e.mode, topic: e.topic ?? null, t: e.t };
}

const body = (
  phase: SessionV1["phase"],
  mode: Mode,
  topic: string | null,
): NewEvent =>
  topic === null
    ? { v: 1, type: "session", phase, mode }
    : { v: 1, type: "session", phase, mode, topic };

/** The start event the page posts verbatim. A multi-topic boss has no topic. */
export function startBody(mode: Mode, topic: string | null): NewEvent {
  return body("start", mode, topic);
}

/** The end event for the open session, same mode and topic. */
export function endBody(open: OpenSession): NewEvent {
  return body("end", open.mode, open.topic);
}

/** The open session if it was started on `day` (London), else null: yesterday's unclosed tab is abandoned, not resumed. */
export function openToday(
  open: OpenSession | null,
  day: string,
): OpenSession | null {
  return open !== null && localDay(open.t) === day ? open : null;
}
