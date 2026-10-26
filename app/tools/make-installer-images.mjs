// SPDX-License-Identifier: Apache-2.0
// Makes the two pictures the Windows installer shows, from the one source picture, branding/OpenStageRecorder.svg:
//
//   src-tauri/installer/sidebar.bmp   164 by 314 pixels, down the left of the first and last pages of the installer
//   src-tauri/installer/header.bmp    150 by 57 pixels, at the top right of the pages in between
//
// The installer program wants plain 24-bit bitmap files, so they are written here by hand. The words in the sidebar are part of the picture
// (they are not text a screen reader reads): the installer's own pages say everything in words. Run it again whenever the picture changes.
// It draws in a real (headless) browser, so it needs Playwright, which is not part of this package: point PLAYWRIGHT_DIR at an installed
// copy (default: /opt/node-tools/node_modules/playwright).
//
//   node tools/make-installer-images.mjs

import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const app = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_DIR ?? "/opt/node-tools/node_modules/playwright");

const svg = readFileSync(resolve(app, "branding", "OpenStageRecorder.svg"), "utf-8");
const icon = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;

const pictures = {
  sidebar: {
    width: 164,
    height: 314,
    html: `<div style="width:164px;height:314px;box-sizing:border-box;background:linear-gradient(160deg,#102037,#0B172A);color:#fff;font-family:'Segoe UI','DejaVu Sans',Arial,sans-serif;text-align:center;padding-top:34px">
      <img src="${icon}" width="104" height="104" style="display:block;margin:0 auto 18px">
      <div style="font-size:19px;font-weight:700;line-height:1.2;padding:0 10px">OpenStage<br>Recorder</div>
      <div style="width:36px;height:3px;background:#FF9296;margin:14px auto"></div>
      <div style="font-size:12px;line-height:1.35;color:#D5DEEA;padding:0 14px">A light screen recorder for Windows</div>
    </div>`,
  },
  header: {
    width: 150,
    height: 57,
    // The installer's page header is white, so the picture is too, with the icon where the eye goes first.
    html: `<div style="width:150px;height:57px;background:#fff;position:relative"><img src="${icon}" width="44" height="44" style="position:absolute;right:8px;top:6px"></div>`,
  },
};

/** A 24-bit bitmap file: a 54 byte header, then the rows from the bottom up, each padded to a multiple of four bytes. */
function bmp(width, height, rgba) {
  const rowBytes = Math.ceil((width * 3) / 4) * 4;
  const out = Buffer.alloc(54 + rowBytes * height);
  out.write("BM", 0, "ascii");
  out.writeUInt32LE(out.length, 2);
  out.writeUInt32LE(54, 10);
  out.writeUInt32LE(40, 14);
  out.writeInt32LE(width, 18);
  out.writeInt32LE(height, 22);
  out.writeUInt16LE(1, 26);
  out.writeUInt16LE(24, 28);
  out.writeUInt32LE(rowBytes * height, 34);
  out.writeInt32LE(2835, 38);
  out.writeInt32LE(2835, 42);
  for (let y = 0; y < height; y++) {
    const row = 54 + (height - 1 - y) * rowBytes;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      out[row + x * 3] = rgba[i + 2];
      out[row + x * 3 + 1] = rgba[i + 1];
      out[row + x * 3 + 2] = rgba[i];
    }
  }
  return out;
}

const folder = resolve(app, "src-tauri", "installer");
mkdirSync(folder, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
for (const [name, p] of Object.entries(pictures)) {
  const page = await browser.newPage({ viewport: { width: p.width, height: p.height }, deviceScaleFactor: 1 });
  await page.setContent(`<html><body style="margin:0">${p.html}</body></html>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete && i.naturalWidth > 0));
  const png = await page.screenshot({ clip: { x: 0, y: 0, width: p.width, height: p.height } });
  // The picture's own pixels, read back through a canvas.
  const pixels = await page.evaluate(async (data) => {
    const img = new Image();
    img.src = data;
    await img.decode();
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0);
    return Array.from(ctx.getImageData(0, 0, canvas.width, canvas.height).data);
  }, `data:image/png;base64,${png.toString("base64")}`);
  writeFileSync(resolve(folder, `${name}.bmp`), bmp(p.width, p.height, pixels));
  await page.close();
}
await browser.close();
console.log("Made src-tauri/installer/sidebar.bmp and header.bmp");
