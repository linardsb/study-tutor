import fs from "node:fs";
import path from "node:path";

const DIST = "dist";
const STAGE = {
  windows: path.join(DIST, "stage", "windows"),
  mac: path.join(DIST, "stage", "mac"),
};

type Os = keyof typeof STAGE;
type Target = { target: string; outfile: string };

/** The version to stamp: package.json's `version`, which must be X.Y.Z. */
export function readVersion(pkgPath = "package.json"): string {
  let version: unknown;
  try {
    version = JSON.parse(fs.readFileSync(pkgPath, "utf8")).version;
  } catch {
    version = undefined;
  }
  if (typeof version !== "string" || !/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error('Build needs "version": "X.Y.Z" in package.json');
  }
  return version;
}

/** Throws on the first zip entry inside a top-level folder's data/: pupil records never ship. */
export function assertNoData(entries: string[]): void {
  const hit = entries.find((e) => /^[^/]+\/data(\/|$)/.test(e));
  if (hit !== undefined) throw new Error(`Zip holds pupil data: ${hit}`);
}

/** The zip's entry names; throws when unzip fails, since an empty listing would pass assertNoData. */
export function listZip(file: string): string[] {
  const r = Bun.spawnSync(["unzip", "-Z1", file], {
    stdio: ["ignore", "pipe", "ignore"],
  });
  if (r.exitCode !== 0)
    throw new Error(`unzip -Z1 ${file} exited ${r.exitCode}`);
  return r.stdout.toString().split("\n").filter(Boolean);
}

function copyLauncher(
  name: string,
  into: string,
  folder: string,
  from: string,
  mode?: number,
): void {
  const dest = path.join(into, folder, name);
  fs.copyFileSync(path.join(from, "launchers", name), dest);
  if (mode !== undefined) fs.chmodSync(dest, mode);
}

/**
 * Everything but the binaries for one OS, into `stage/folder`: the launchers, then the pages and the
 * content pack, which sit beside the binary and are read from disk at run time (D10). Nothing from
 * data/, e1/ or src/.
 */
export function stageFolder(
  stage: string,
  os: Os,
  folder: string,
  from = ".",
): void {
  fs.mkdirSync(path.join(stage, folder), { recursive: true });
  if (os === "windows") {
    copyLauncher("Start.bat", stage, folder, from);
  } else {
    copyLauncher("Start.command", stage, folder, from, 0o755);
  }
  copyLauncher("README.txt", stage, folder, from);
  for (const sub of ["app", "content"]) {
    fs.cpSync(path.join(from, sub), path.join(stage, folder, sub), {
      recursive: true,
    });
  }
}

function targets(folder: string): Target[] {
  return [
    {
      target: "bun-windows-x64",
      outfile: path.join(STAGE.windows, folder, "StudyTutor"),
    },
    {
      target: "bun-darwin-arm64",
      outfile: path.join(STAGE.mac, folder, "StudyTutor-arm64"),
    },
    {
      target: "bun-darwin-x64",
      outfile: path.join(STAGE.mac, folder, "StudyTutor-x64"),
    },
  ];
}

function run(cmd: string[], cwd?: string): void {
  const result = Bun.spawnSync(cmd, {
    cwd,
    stdio: ["ignore", "inherit", "inherit"],
  });
  if (result.exitCode !== 0) {
    console.error(`Build failed: ${cmd.join(" ")} exited ${result.exitCode}`);
    process.exit(1);
  }
}

if (import.meta.main) {
  for (const tool of ["zip", "unzip", "codesign"]) {
    if (Bun.which(tool) === null) {
      console.error(
        `Build needs the ${tool} command on PATH. It ships with macOS in /usr/bin.`,
      );
      process.exit(1);
    }
  }

  let version: string;
  try {
    version = readVersion();
  } catch (err) {
    console.error((err as Error).message);
    process.exit(1);
  }
  // The folder inside each zip carries the version, so a new release never extracts over the old one (D3a).
  const folder = `StudyTutor-${version}`;

  fs.rmSync(DIST, { recursive: true, force: true });
  for (const stage of Object.values(STAGE))
    fs.mkdirSync(path.join(stage, folder), { recursive: true });

  for (const { target, outfile } of targets(folder)) {
    console.log(`Compiling ${target}`);
    run([
      process.execPath,
      "build",
      "--compile",
      `--target=${target}`,
      "--define",
      `BUILD_VERSION=${JSON.stringify(version)}`,
      "src/server.ts",
      "--outfile",
      outfile,
    ]);
    // Bun leaves its own, now invalid, Developer ID signature on the darwin-x64 build. A quarantined
    // binary with an invalid signature gets Gatekeeper's "damaged" dialog with no Open Anyway, so
    // re-sign both mac binaries ad hoc: the verdict the arm64 build already gets from Bun.
    if (target.startsWith("bun-darwin"))
      run(["codesign", "--force", "--sign", "-", outfile]);
  }

  stageFolder(STAGE.windows, "windows", folder);
  stageFolder(STAGE.mac, "mac", folder);

  for (const os of ["windows", "mac"] as const) {
    const zip = `StudyTutor-${os}.zip`;
    run(["zip", "-qr", `../../${zip}`, folder], STAGE[os]);
    const file = path.join(DIST, zip);
    try {
      assertNoData(listZip(file));
    } catch (err) {
      console.error(`Build failed: ${(err as Error).message}`);
      process.exit(1);
    }
    console.log(
      `${file}  ${fs.statSync(file).size.toLocaleString("en-GB")} bytes`,
    );
  }

  console.log(`Release tag: v${version}`);
  console.log(
    `gh release create v${version} dist/StudyTutor-windows.zip dist/StudyTutor-mac.zip --title "v${version}"`,
  );
}
