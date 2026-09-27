import path from "node:path";

/** The `--data` folder (default `data`), refused unless it resolves inside the current folder. */
export function dataArg(): string {
  const i = process.argv.indexOf("--data");
  const arg = i === -1 ? "data" : (process.argv[i + 1] ?? "data");
  const cwd = process.cwd();
  const dir = path.resolve(cwd, arg);
  if (!dir.startsWith(cwd + path.sep)) {
    console.error(`Refused: --data ${arg} is outside the current folder`);
    process.exit(1);
  }
  return dir;
}
