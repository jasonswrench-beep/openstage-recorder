// SPDX-License-Identifier: Apache-2.0
// Checks that the editing preview makes sound when the recording is served from another web address than the page.
//
// That is how the installed editor works: the page is at tauri.localhost and the recordings come from the file protocol at asset.localhost, which answers a
// CORS request with the page's address. The preview sends each sound through Web Audio (so a clip can be louder than recorded), and Chromium outputs silence
// for a media file from another address unless it was asked for with CORS (`crossOrigin = "anonymous"`). A browser that serves the page and the recording from
// one address never shows the fault, which is why browser-check.mjs did not.
//
// This starts two small servers on 127.0.0.1 (the page, with the editing screens' TypeScript stripped as it is asked for, and a 2 second tone from a second
// address that answers with the page's address as the allowed origin), opens the page in a headless Microsoft Edge with the sound muted, presses Play, and reads
// what reaches the speakers with an analyser. It runs the code as it was before the fix (the audio element is never asked for with CORS) and as it is now, and
// says whether the first was silent and the second was heard. Nothing is played aloud. It needs Node 22.13 or newer and Edge, nothing else:
//
//   node tools/preview-sound-check.mjs
//   EDGE="C:/path/to/msedge.exe" node tools/preview-sound-check.mjs

import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { createServer } from "node:http";
import module from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SERVED = ["capture-timeline", "capture-edit/src"].map((p) => resolve(repo, p));
const strip = module.stripTypeScriptTypes;
if (typeof strip !== "function") {
  console.error(`This copy of Node.js (${process.versions.node}) is too old: the check needs 22.13 or newer.`);
  process.exit(2);
}
process.emitWarning = () => {};
const PAGE_PORT = 9471;
const MEDIA_PORT = 9472;
const CDP_PORT = 9473;

const edgePath = [process.env.EDGE, "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "C:/Program Files/Microsoft/Edge/Application/msedge.exe"].find((p) => p !== undefined && existsSync(p));
if (edgePath === undefined) {
  console.error("Microsoft Edge was not found. Set EDGE to the path of msedge.exe.");
  process.exit(2);
}

/** A 2 second 440 Hz tone, 16-bit mono, 8000 samples a second. */
function tone() {
  const rate = 8000;
  const n = rate * 2;
  const data = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) data.writeInt16LE(Math.round(Math.sin((2 * Math.PI * 440 * i) / rate) * 12000), i * 2);
  const head = Buffer.alloc(44);
  head.write("RIFF", 0);
  head.writeUInt32LE(36 + data.length, 4);
  head.write("WAVEfmt ", 8);
  head.writeUInt32LE(16, 16);
  head.writeUInt16LE(1, 20);
  head.writeUInt16LE(1, 22);
  head.writeUInt32LE(rate, 24);
  head.writeUInt32LE(rate * 2, 28);
  head.writeUInt16LE(2, 32);
  head.writeUInt16LE(16, 34);
  head.write("data", 36);
  head.writeUInt32LE(data.length, 40);
  return Buffer.concat([head, data]);
}
const TONE = tone();

const HARNESS_HTML = `<!doctype html><meta charset="utf-8"><title>preview sound check</title><div id="host"></div><script type="module" src="/harness.js"></script>`;
const HARNESS_JS = `
const params = new URLSearchParams(location.search);
// Tap everything that is connected to the speakers.
const taps = [];
const realConnect = AudioNode.prototype.connect;
AudioNode.prototype.connect = function (dest, ...rest) {
  if (dest instanceof AudioDestinationNode) { const an = this.context.createAnalyser(); an.fftSize = 2048; realConnect.call(this, an); taps.push(an); }
  return realConnect.call(this, dest, ...rest);
};
// "old" is the code before the fix: the audio element is never asked for with CORS.
if (params.get("old") === "1") Object.defineProperty(HTMLMediaElement.prototype, "crossOrigin", { set() {}, get() { return null; }, configurable: true });
const { mountPreview } = await import("/capture-timeline/src/preview-panel.ts");
const { EditSession } = await import("/capture-timeline/src/session.ts");
const { editFromTakes } = await import("/capture-edit/src/index.ts");
const made = editFromTakes([{ take: 1, state: "complete", durationMs: 2000, media: [{ file: "mic.wav", kind: "microphone" }] }]);
const session = new EditSession(made.model);
const library = { url: async () => "http://127.0.0.1:${MEDIA_PORT}/tone.wav" };
mountPreview(document.getElementById("host"), session, library);
window.__run = async () => {
  [...document.querySelectorAll("button")].find((b) => b.textContent.startsWith("Play")).click();
  let peak = 0;
  const buf = new Float32Array(2048);
  for (let i = 0; i < 20; i++) {
    await new Promise((r) => setTimeout(r, 100));
    for (const an of taps) { an.getFloatTimeDomainData(buf); for (const v of buf) peak = Math.max(peak, Math.abs(v)); }
  }
  const audio = document.querySelector("audio");
  return { peak, crossOrigin: audio?.crossOrigin ?? null, error: audio?.error?.message ?? null };
};
window.__ready = true;
`;

const pageServer = createServer(async (req, res) => {
  const path = decodeURIComponent((req.url ?? "/").split("?")[0]);
  if (path === "/") {
    res.writeHead(200, { "content-type": "text/html" });
    return res.end(HARNESS_HTML);
  }
  if (path === "/harness.js") {
    res.writeHead(200, { "content-type": "text/javascript" });
    return res.end(HARNESS_JS);
  }
  const file = resolve(repo, normalize("." + path));
  if (!SERVED.some((root) => file.startsWith(root + sep))) {
    res.writeHead(404);
    return res.end("Not found.");
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error("not a file");
    const text = await readFile(file, "utf8");
    const isTs = extname(file) === ".ts";
    res.writeHead(200, { "content-type": isTs ? "text/javascript" : "text/plain", "cache-control": "no-store" });
    res.end(isTs ? strip(text, { mode: "strip" }) : text);
  } catch {
    res.writeHead(404);
    res.end("Not found.");
  }
}).listen(PAGE_PORT, "127.0.0.1");

// The recording's address: like Tauri's file protocol, it answers with the page's own address as the allowed origin.
const mediaServer = createServer((req, res) => {
  const head = { "content-type": "audio/wav", "access-control-allow-origin": `http://127.0.0.1:${PAGE_PORT}`, "accept-ranges": "bytes", "cache-control": "no-store" };
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
  if (range !== null) {
    const start = Number(range[1]);
    const end = range[2] !== "" ? Number(range[2]) : TONE.length - 1;
    res.writeHead(206, { ...head, "content-range": `bytes ${start}-${end}/${TONE.length}`, "content-length": end - start + 1 });
    return res.end(TONE.subarray(start, end + 1));
  }
  res.writeHead(200, { ...head, "content-length": TONE.length });
  res.end(TONE);
}).listen(MEDIA_PORT, "127.0.0.1");

const profile = mkdtempSync(join(tmpdir(), "openstage-preview-sound-"));
const edge = spawn(edgePath, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`, "--no-first-run", "--disable-gpu", "--mute-audio", "--autoplay-policy=no-user-gesture-required", "about:blank"], { stdio: "ignore" });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = {};
let send;
try {
  let targets = null;
  for (let i = 0; i < 40 && targets === null; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json();
    } catch {
      await sleep(250);
    }
  }
  const page = targets?.find((t) => t.type === "page");
  if (page === undefined) throw new Error("Edge did not start.");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((ok, bad) => {
    ws.onopen = ok;
    ws.onerror = bad;
  });
  let id = 0;
  const pending = new Map();
  ws.onmessage = (m) => {
    const d = JSON.parse(m.data);
    if (d.id && pending.has(d.id)) {
      pending.get(d.id)(d);
      pending.delete(d.id);
    }
  };
  send = (method, params = {}) => new Promise((ok) => {
    const n = ++id;
    pending.set(n, ok);
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evalJs = async (expr) => {
    const r = await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true });
    return r.result.result?.value ?? r.result.exceptionDetails?.exception?.description ?? r.result.exceptionDetails?.text;
  };
  await send("Page.enable");
  for (const [label, query] of [["before the fix (the sound is not asked for with CORS)", "?old=1"], ["now (the sound is asked for with CORS)", ""]]) {
    await send("Page.navigate", { url: `http://127.0.0.1:${PAGE_PORT}/${query}` });
    for (let i = 0; i < 60 && !(await evalJs("window.__ready === true")); i++) await sleep(250);
    await sleep(500);
    results[label] = await evalJs("window.__run()");
    console.log(`${label}: loudest sample ${typeof results[label] === "object" ? results[label].peak.toFixed(3) : results[label]}`);
  }
  await send("Browser.close").catch(() => undefined);
  ws.close();
} finally {
  edge.kill();
  pageServer.close();
  mediaServer.close();
}
await sleep(1500);
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 400 });
} catch {
  console.log(`(The temporary folder ${profile} could not be removed; delete it by hand.)`);
}
const [before, now] = Object.values(results).map((r) => (typeof r === "object" ? r.peak : -1));
const ok = before === 0 && now > 0.05;
console.log(ok ? "PASS  the check sees the fault in the old way and hears the sound in the new" : `FAIL  expected silence before the fix (got ${before}) and sound now (got ${now})`);
process.exit(ok ? 0 : 1);
