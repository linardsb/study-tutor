export const PORTS = [4731, 4732, 4733, 4734, 4735] as const;

const PAGE = `<!doctype html>
<html lang="en-GB">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Study tutor</title>
</head>
<body>
<h1>Study tutor</h1>
<p>It works. Close this window when you are done, and close the black window to stop.</p>
</body>
</html>
`;

function handle(req: Request): Response {
  const { pathname } = new URL(req.url);
  if (pathname === "/") {
    return new Response(PAGE, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
  return new Response("Not found", { status: 404 });
}

/** Binds 127.0.0.1 on the first free port in the list; `0` asks the OS for any free port. */
export function startServer(ports: readonly number[]) {
  for (const port of ports) {
    try {
      return Bun.serve({ hostname: "127.0.0.1", port, fetch: handle });
    } catch (err) {
      if ((err as { code?: string }).code !== "EADDRINUSE") throw err;
    }
  }
  throw new Error(`No free port in ${ports.join(", ")}`);
}

export function openBrowser(url: string): void {
  const cmd =
    process.platform === "darwin"
      ? ["open", url]
      : process.platform === "win32"
        ? ["cmd", "/c", "start", "", url]
        : ["xdg-open", url];
  Bun.spawn(cmd, { stdio: ["ignore", "ignore", "ignore"] });
}

if (import.meta.main) {
  try {
    const server = startServer([...PORTS, 0]);
    const url = `http://127.0.0.1:${server.port}/`;
    console.log(`Study tutor is running at ${url}`);
    openBrowser(url);
  } catch (err) {
    console.error(`Could not start: ${(err as Error).message}`);
    process.exit(1);
  }
}
