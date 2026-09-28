import { refusalLines, replayCheck } from "../src/events/check";

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
    for (const line of refusalLines(result.fallen)) console.error(line);
    process.exit(1);
  }
} catch (err) {
  console.error(`Could not check progress: ${(err as Error).message}`);
  process.exit(1);
}
