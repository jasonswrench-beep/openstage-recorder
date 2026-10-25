// SPDX-License-Identifier: Apache-2.0
// Makes the icon files the app needs from the one source picture, branding/OpenStageRecorder.svg:
//
//   src-tauri/icons/32x32.png, 128x128.png, 128x128@2x.png, icon.png   the pictures Tauri uses for the window
//   src-tauri/icons/icon.ico                                           the Windows program icon (16, 24, 32, 48, 64 and 256 pixels)
//
// Run it again whenever the picture changes. It draws the picture in a real (headless) browser, so it needs Playwright, which is not part of
// this package: point PLAYWRIGHT_DIR at an installed copy (default: /opt/node-tools/node_modules/playwright).
//
//   node tools/make-icons.mjs

import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_DIR ?? "/opt/node-tools/node_modules/playwright");

const svg = readFileSync(resolve(app, "branding", "OpenStageRecorder.svg"), "utf-8");
const address = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const drawn = new Map();
for (const size of [16, 24, 32, 48, 64, 128, 256, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img src="${address}" width="${size}" height="${size}" style="display:block"></body></html>`);
  await page.waitForFunction(() => document.images[0].complete && document.images[0].naturalWidth > 0);
  // Transparent outside the rounded tile, so the corners of the icon show whatever is behind it.
  drawn.set(size, await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } }));
  await page.close();
}
await browser.close();

const icons = resolve(app, "src-tauri", "icons");
writeFileSync(resolve(icons, "32x32.png"), drawn.get(32));
writeFileSync(resolve(icons, "128x128.png"), drawn.get(128));
writeFileSync(resolve(icons, "128x128@2x.png"), drawn.get(256));
writeFileSync(resolve(icons, "icon.png"), drawn.get(512));

// A Windows icon file: a small header, one entry for each size, then the pictures themselves (as PNG, which Windows reads from Vista on).
const sizes = [16, 24, 32, 48, 64, 256];
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
const entries = [];
let offset = 6 + 16 * sizes.length;
for (const size of sizes) {
  const png = drawn.get(size);
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size;
  entry[1] = size >= 256 ? 0 : size;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(offset, 12);
  entries.push(entry);
  offset += png.length;
}
writeFileSync(resolve(icons, "icon.ico"), Buffer.concat([header, ...entries, ...sizes.map((s) => drawn.get(s))]));
console.log("Made the icon files in src-tauri/icons.");
