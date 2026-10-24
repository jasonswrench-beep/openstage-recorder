// SPDX-License-Identifier: Apache-2.0
// Serves the built web side (web/) to this computer's own browser, so the screens can be tried without the app, with a pretend recorder:
//
//   node dev-server.mjs [port] [--open]
//
// With --open it also opens the address in the browser.
//
// For development and the automatic checks only. It listens on 127.0.0.1, so no other computer can reach it, and it serves nothing but web/.
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(here, "web");
const argv = process.argv.slice(2);
const port = Number(argv.find((a) => /^\d+$/.test(a)) ?? 5174);
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".png": "image/png", ".svg": "image/svg+xml", ".json": "application/json" };

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const name = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname).replace(/^\/+/, "");
  const file = path.normalize(path.join(web, name));
  if (!file.startsWith(web + path.sep)) {
    res.writeHead(404).end("Not found");
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, { "content-type": types[path.extname(file)] ?? "application/octet-stream", "cache-control": "no-store" });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

function openInBrowser(address) {
  const [command, args] =
    process.platform === "win32" ? ["cmd", ["/c", "start", "", address]] : process.platform === "darwin" ? ["open", [address]] : ["xdg-open", [address]];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => console.log("The browser could not be opened by itself. Please open the address above."));
  child.unref();
}

server.listen(port, "127.0.0.1", () => {
  const address = `http://127.0.0.1:${port}/`;
  console.log(`OpenStage Recorder preview: ${address}`);
  if (argv.includes("--open")) openInBrowser(address);
});
