import fs from "node:fs";
import path from "node:path";

const DIST = "dist";
const STAGE = {
  windows: path.join(DIST, "stage", "windows"),
  mac: path.join(DIST, "stage", "mac"),
};

type Target = { target: string; outfile: string };

const TARGETS: Target[] = [
  {
    target: "bun-windows-x64",
    outfile: path.join(STAGE.windows, "StudyTutor", "StudyTutor"),
  },
  {
    target: "bun-darwin-arm64",
    outfile: path.join(STAGE.mac, "StudyTutor", "StudyTutor-arm64"),
  },
  {
    target: "bun-darwin-x64",
    outfile: path.join(STAGE.mac, "StudyTutor", "StudyTutor-x64"),
  },
];

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

function copyLauncher(name: string, into: string, mode?: number): void {
  const dest = path.join(into, "StudyTutor", name);
  fs.copyFileSync(path.join("launchers", name), dest);
  if (mode !== undefined) fs.chmodSync(dest, mode);
}

for (const tool of ["zip", "codesign"]) {
  if (Bun.which(tool) === null) {
    console.error(
      `Build needs the ${tool} command on PATH. It ships with macOS in /usr/bin.`,
    );
    process.exit(1);
  }
}

fs.rmSync(DIST, { recursive: true, force: true });
for (const stage of Object.values(STAGE))
  fs.mkdirSync(path.join(stage, "StudyTutor"), { recursive: true });

for (const { target, outfile } of TARGETS) {
  console.log(`Compiling ${target}`);
  run([
    process.execPath,
    "build",
    "--compile",
    `--target=${target}`,
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

copyLauncher("Start.bat", STAGE.windows);
copyLauncher("README.txt", STAGE.windows);
copyLauncher("Start.command", STAGE.mac, 0o755);
copyLauncher("README.txt", STAGE.mac);

run(
  ["zip", "-qr", "../../StudyTutor-windows.zip", "StudyTutor"],
  STAGE.windows,
);
run(["zip", "-qr", "../../StudyTutor-mac.zip", "StudyTutor"], STAGE.mac);

for (const zip of ["StudyTutor-windows.zip", "StudyTutor-mac.zip"]) {
  const file = path.join(DIST, zip);
  console.log(
    `${file}  ${fs.statSync(file).size.toLocaleString("en-GB")} bytes`,
  );
}
