// SPDX-License-Identifier: Apache-2.0
// Bundles the Recorder's web side into web/: one script and one style sheet. The editing screens bring their own styles.
import { build } from "esbuild";
import { copyFileSync, readFileSync, writeFileSync } from "node:fs";

await build({
  entryPoints: ["src/main.ts"],
  bundle: true,
  format: "iife",
  target: "es2022",
  outfile: "web/main.js",
  logLevel: "warning",
});

const app = readFileSync("src/app.css", "utf-8");
// The editing screens (the clip list, the timeline and the preview) bring their own styles, in their own namespaced names.
const screens = ["clip-list", "timeline", "preview", "layout"].map((n) => readFileSync(`../capture-timeline/src/${n}.css`, "utf-8")).join("\n");
writeFileSync("web/style.css", `${screens}\n\n/* ---- the app ---- */\n${app}`);
// The icon, from its source, for the page: the picture beside the heading and the tab icon.
copyFileSync("branding/OpenStageRecorder.svg", "web/icon.svg");
console.log("Built web/main.js, web/style.css and web/icon.svg");
