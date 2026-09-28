import { readProfile } from "../config";
import type { CasePack } from "../content/types";
import { type Next, nextStep } from "../flow/next";
import { currentState } from "./state";

/** The next step on `day` for the record in dataDir, with the flame against the profile's weekly target. */
export function nextForDay(dataDir: string, pack: CasePack, day: string): Next {
  return nextStep(
    currentState(dataDir),
    day,
    pack,
    readProfile(dataDir).weeklyTarget,
  );
}
