import { replayCheck } from "../src/events/check";

// No path from the command line: the log is always data/ in the folder this runs from.
if (process.argv.includes("--data")) {
  console.error(
    "--data was removed: run this from the folder that holds data/.",
  );
  process.exit(1);
}
const data = "data";

try {
  const result = replayCheck(data);
  if (result.ok) {
    for (const line of result.changes) console.log(line);
  } else {
    const n = result.fallen.length;
    console.error(
      `Stopped: this version of the tutor would lower progress on ${n} ${n === 1 ? "topic" : "topics"}.`,
    );
    for (const f of result.fallen) {
      console.error(`  ${f.topic}: saved ${f.stored}, now ${f.replayed}`);
    }
    console.error(
      "Nothing was changed. Put the previous version back, or delete data/state.json to accept the new version.",
    );
    process.exit(1);
  }
} catch (err) {
  console.error(`Could not check progress: ${(err as Error).message}`);
  process.exit(1);
}
