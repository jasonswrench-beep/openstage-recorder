// SPDX-License-Identifier: Apache-2.0
// Serves the built web side (web/) to this computer's own browser, so the screens can be tried without the app, with a pretend recorder:
//
//   node dev-server.mjs [port] [--open]
//
// With --open it also opens the address in the browser.
//
// For development and the automatic checks only. It listens on 127.0.0.1, so no other computer can reach it, and it serves nothing but web/.
//
// With --media-test it also listens on the next port and serves one made-up tone, /tone.wav, from that other address, as the installed app
// serves a recording's sound from another address than the page, so the automatic checks can see whether that sound is heard.
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

if (argv.includes("--media-test")) {
  // Four seconds of 440 Hz, 16 bit, mono, 48000 samples a second.
  const rate = 48000;
  const count = rate * 4;
  const tone = Buffer.alloc(44 + count * 2);
  tone.write("RIFF", 0);
  tone.writeUInt32LE(36 + count * 2, 4);
  tone.write("WAVEfmt ", 8);
  tone.writeUInt32LE(16, 16);
  tone.writeUInt16LE(1, 20);
  tone.writeUInt16LE(1, 22);
  tone.writeUInt32LE(rate, 24);
  tone.writeUInt32LE(rate * 2, 28);
  tone.writeUInt16LE(2, 32);
  tone.writeUInt16LE(16, 34);
  tone.write("data", 36);
  tone.writeUInt32LE(count * 2, 40);
  for (let i = 0; i < count; i++) tone.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), 44 + i * 2);
  // Like the app's own protocol, it says the page's own address may use the file, and no other.
  createServer((req, res) => {
    res.writeHead(200, { "content-type": "audio/wav", "access-control-allow-origin": `http://127.0.0.1:${port}`, "cache-control": "no-store" });
    res.end(tone);
  }).listen(port + 1, "127.0.0.1");
}

server.listen(port, "127.0.0.1", () => {
  const address = `http://127.0.0.1:${port}/`;
  console.log(`OpenStage Recorder preview: ${address}`);
  if (argv.includes("--open")) openInBrowser(address);
});
