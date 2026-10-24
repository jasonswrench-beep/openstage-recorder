// SPDX-License-Identifier: Apache-2.0
// Drives OpenStage Recorder's screens in a real (headless) Chromium with the keyboard only, against the pretend recorder, and checks what a
// screen reader would be given: names, roles, states, focus, what is announced, colour contrast, and how the page fits a narrow screen.
//
// A developer check, not something the author runs. It needs Playwright, which is not part of this package: point PLAYWRIGHT_DIR at an
// installed copy (default: /opt/node-tools/node_modules/playwright). Build the page first (`npm run build`).
//
// What it can and cannot say: it proves the page exposes the right roles, names and states, that every command works from the keyboard, and
// that focus never gets lost or stuck. It cannot say how NVDA, Narrator or VoiceOver will speak any of it, or how the real recorder behaves
// on Windows. That has to be heard and run on a real computer.
//
//   node tools/browser-check.mjs [screenshot-folder]

import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_DIR ?? "/opt/node-tools/node_modules/playwright");
const shots = process.argv[2];
const PORT = 8794;
const BASE = `http://127.0.0.1:${PORT}/`;

const server = spawn(process.execPath, [resolve(here, "..", "dev-server.mjs"), String(PORT)], { stdio: ["ignore", "pipe", "inherit"] });
await new Promise((ready, fail) => {
  server.stdout.on("data", (chunk) => String(chunk).includes("preview") && ready());
  server.on("exit", () => fail(new Error("the preview server stopped")));
});

const browser = await chromium.launch({ args: ["--no-sandbox"] });
let failures = 0;
let passes = 0;

const assert = (ok, what) => {
  if (!ok) throw new Error(what);
};
const assertEqual = (actual, expected, what) => {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${what}: expected ${JSON.stringify(expected)} but got ${JSON.stringify(actual)}`);
};
const assertMatch = (text, pattern, what) => {
  if (!pattern.test(text)) throw new Error(`${what}: ${JSON.stringify(text)} does not match ${pattern}`);
};

async function check(name, body, options = {}) {
  if (process.env.ONLY !== undefined && !name.includes(process.env.ONLY)) return; // ONLY="part of a name" runs just those checks
  const context = await browser.newContext({ viewport: { width: 1100, height: 1800 }, ...options });
  const page = await context.newPage();
  const problems = [];
  page.on("pageerror", (e) => problems.push(`page error: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && problems.push(`console error: ${m.text()}`));
  try {
    // The pretend recorder runs a hundred times faster than the real one, so a check does not wait for seconds.
    await page.goto(`${BASE}?speed=100${options.search ?? ""}`);
    await page.getByRole("heading", { level: 1, name: "OpenStage Recorder" }).waitFor();
    await page.waitForFunction(() => /^The recording program was/.test(document.querySelector('[id$="-found"]')?.textContent ?? ""));
    await body(page, new Helpers(page));
    if (problems.length > 0) throw new Error(problems.join("; "));
    passes += 1;
    console.log(`PASS  ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL  ${name}\n      ${error instanceof Error ? error.message : error}`);
    if (shots) await page.screenshot({ path: resolve(shots, `fail-${failures}.png`), fullPage: true }).catch(() => {});
  } finally {
    await context.close();
  }
}

class Helpers {
  constructor(page) {
    this.page = page;
  }
  /** What the status line says, once it has had time to be filled: each thing said on its own line. */
  async said() {
    await this.page.waitForTimeout(100);
    return (await this.page.locator('[role="status"]').first().innerText()) ?? "";
  }
  async focusLabel() {
    return this.page.evaluate(() => {
      const el = document.activeElement;
      if (el === document.body) return "(nothing)";
      const label = el.labels?.[0]?.textContent?.trim();
      return el.getAttribute("aria-label") ?? label?.slice(0, 50) ?? el.textContent?.trim().slice(0, 50) ?? el.tagName;
    });
  }
  async key(...keys) {
    for (const key of keys) await this.page.keyboard.press(key);
  }
  /** Tab until the focus is on the control with this name, or fail. */
  async tabTo(name, limit = 60) {
    for (let i = 0; i < limit; i++) {
      await this.page.keyboard.press("Tab");
      if ((await this.focusLabel()) === name) return;
    }
    throw new Error(`Tab never reached "${name}"; the focus was on "${await this.focusLabel()}"`);
  }
  async standIn(fn, arg) {
    return this.page.evaluate(fn, arg);
  }
  /** Wait until the status line matches. */
  async waitSaid(pattern) {
    await this.page.waitForFunction((source) => new RegExp(source).test(document.querySelector('[role="status"]')?.innerText ?? ""), pattern.source, { timeout: 5000 });
  }
  /** Wait until the "now" sentence of a recording matches. */
  async waitNow(pattern) {
    await this.page.waitForFunction((source) => new RegExp(source).test(document.querySelector('[id$="-now"]')?.textContent ?? ""), pattern.source, { timeout: 5000 });
  }
}

/** Start a practice recording with the keyboard and leave the recording going. */
async function startPractice(page, t, { name = "Keyboard demo" } = {}) {
  await page.getByLabel("Name of the recording").fill(name);
  await page.getByLabel(/^Practice/).check();
  await page.getByLabel(/^Countdown/).fill("0");
  await page.getByRole("button", { name: "Start recording" }).focus();
  await t.key("Enter");
  await page.getByRole("heading", { name: "Recording", exact: true }).waitFor();
}

// ---- the page and its names ----

await check("the page has a heading, a main region, and a section for each job, each named", async (page) => {
  assertEqual(await page.locator("h1").count(), 1, "one main heading");
  assertEqual(await page.locator("header").count(), 1, "one header");
  assertEqual(await page.locator("main").count(), 1, "one main region");
  const headings = await page.locator("h2:visible").allTextContents();
  assertEqual(headings, ["Record", "Your recordings", "Is this computer ready to record?"], "the sections, in order");
  for (const name of ["Record", "Your recordings", "Is this computer ready to record?"]) {
    assertEqual(await page.getByRole("region", { name, exact: true }).count(), 1, `the ${name} section is a named region`);
  }
  assertMatch(await page.locator(".app-preview").textContent(), /pretend recorder/, "the preview says it is a pretend recorder");
  const icon = page.locator("header img.app-icon");
  assertEqual(await icon.getAttribute("alt"), "", "the icon is decoration and has no words");
  assertEqual(await icon.evaluate((el) => el.complete && el.naturalWidth > 0), true, "the icon loaded");
  assertEqual(await page.locator('link[rel="icon"]').getAttribute("href"), "icon.svg", "the tab icon");
  assertEqual(await page.locator("html").getAttribute("lang"), "en", "the page language");
});

await check("every box, choice and button has a name a screen reader can use", async (page) => {
  const unnamed = await page.evaluate(() => {
    const named = (el) => {
      if (el.getAttribute("aria-label")) return true;
      const by = el.getAttribute("aria-labelledby");
      if (by && by.split(/\s+/).some((id) => (document.getElementById(id)?.textContent ?? "").trim() !== "")) return true;
      if (el.labels && [...el.labels].some((l) => l.textContent.trim() !== "")) return true;
      return el.tagName === "BUTTON" && el.textContent.trim() !== "";
    };
    return [...document.querySelectorAll("input, select, textarea, button")].filter((el) => !el.hidden && el.offsetParent !== null && !named(el)).map((el) => el.id || el.outerHTML.slice(0, 60));
  });
  assertEqual(unnamed, [], "controls with no name");
});

await check("the screens, microphones, sounds and webcams the recorder found are in the lists, the default marked", async (page) => {
  const options = async (label) => page.getByLabel(label, { exact: true }).locator("option").allTextContents();
  assert((await options("Which screen")).some((o) => /Display 2/.test(o)), "the second display is listed");
  assertEqual((await options("Your voice"))[0], "The default microphone", "your voice starts with the default");
  assert((await options("Your voice")).some((o) => /Pretend USB.*default/.test(o)), "the microphone is named and the default marked");
  assert((await options("A webcam")).some((o) => /Pretend webcam/.test(o)), "the webcam is listed");
  assert((await options("The computer's own sound")).some((o) => /Speakers/.test(o)), "the sound output is listed");
});

// ---- recording with the keyboard ----

await check("a practice recording is started, paused, marked, resumed and stopped with the keyboard, and each step is said", async (page, t) => {
  await page.getByLabel("Name of the recording").focus();
  await t.key("Control+a");
  await page.keyboard.type("Keyboard demo");
  await t.key("Tab");
  assertMatch(await t.focusLabel(), /^Practice: try the controls/, "Tab goes from the name to Practice");
  await t.key("Space");
  assert(await page.getByLabel(/^Practice/).isChecked(), "Space ticks Practice");
  assertEqual(await page.getByRole("group", { name: "What to record" }).isVisible(), false, "the real choices are put away for a practice");
  await page.getByLabel(/^Countdown/).fill("0");
  await t.tabTo("Start recording");
  await t.key("Enter");
  assertEqual(await page.getByRole("heading", { name: "Recording", exact: true }).evaluate((el) => document.activeElement === el), true, "the focus is on the Recording heading");
  await t.waitNow(/^Recording take 1/);
  assertMatch(await t.said(), /Recording take 1\./, "start is said");
  await page.getByRole("button", { name: "Pause" }).focus();
  await t.key("Enter");
  await t.waitNow(/^Paused/);
  assertMatch(await t.said(), /Paused\. Time spent paused is not recorded\./, "pause is said");
  assertEqual(await page.getByRole("button", { name: "Resume" }).count(), 1, "the button now says Resume");
  await page.getByLabel(/^Words for a marker/).focus();
  await page.keyboard.type("the setup");
  await t.key("Enter");
  assertMatch(await t.said(), /Marker added at .*: the setup\./, "a marker is said");
  assertEqual(await page.getByLabel(/^Words for a marker/).inputValue(), "", "the marker box is emptied");
  const marked = await page.getByRole("list", { name: "Markers" }).locator("li").allTextContents();
  assertEqual(marked.length, 1, "one marker is listed");
  assertMatch(marked[0], /^\d+ seconds?: the setup$/, "the marker is listed with its time and words");
  await page.getByRole("button", { name: "Resume" }).focus();
  await t.key("Space");
  await t.waitNow(/^Recording take 1/);
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Stop" }).focus();
  await t.key("Enter");
  await page.getByRole("heading", { name: "Finished" }).waitFor();
  assertMatch(await t.said(), /Finished\. Take 1 is complete/, "the end is said");
  assertEqual(await page.getByRole("button", { name: "Edit the recording I just made" }).isVisible(), true, "editing is offered");
  assertMatch(await page.locator(".rv-pretend").textContent(), /pretend recording\. Nothing is being recorded, and nothing will be saved on your computer\. To record for real, open the app with OPEN RECORDER\.bat\./, "the preview says the recording is pretend");
  await page.getByRole("button", { name: "Done" }).focus();
  await t.key("Enter");
  assertEqual(await t.focusLabel(), "Start recording", "Done gives the focus back to Start");
  const listed = await page.getByLabel("Recording", { exact: true }).locator("option").allTextContents();
  assertEqual(listed, ["Keyboard demo"], "the recording is in the list");
  assertEqual(await page.getByLabel("Name of the recording").evaluate((el) => /^Recording \d{4}-\d\d-\d\d \d{4}$/.test(el.value)), true, "the next recording has a fresh name");
});

await check("the keys that work from any program pause, resume and stop a recording and say so", async (page, t) => {
  await startPractice(page, t, { name: "Keys demo" });
  await t.waitNow(/^Recording take 1/);
  await t.standIn(() => window.__openstageStandIn.pressKey("pause"));
  await t.waitNow(/^Paused/);
  await t.standIn(() => window.__openstageStandIn.pressKey("pause"));
  await t.waitNow(/^Recording take 1/);
  await page.waitForTimeout(120);
  await t.standIn(() => window.__openstageStandIn.pressKey("stop"));
  await page.getByRole("heading", { name: "Finished" }).waitFor();
  const notes = await page.getByRole("list", { name: "What the recorder said" }).locator("li").allTextContents();
  assert(notes.some((n) => /Keys that work from any program while recording: Ctrl\+Shift\+F10 pause or resume/.test(n)), "the keys are listed in the notes");
});

await check("starting again sets a take aside, keeps it, and says so", async (page, t) => {
  await startPractice(page, t, { name: "Again demo" });
  await t.waitNow(/^Recording take 1/);
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Start again" }).focus();
  await t.key("Enter");
  assertMatch(await (async () => { await t.waitSaid(/set aside, not erased/); return t.said(); })(), /Take 1 was set aside, not erased\./, "said");
  await t.waitNow(/^Recording take 2/);
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Stop" }).focus();
  await t.key("Enter");
  await page.getByRole("heading", { name: "Finished" }).waitFor();
  assertMatch(await page.locator('[id$="-where"]').textContent(), /1 earlier take was set aside, not erased\./, "the place says one take was set aside");
});

// ---- how loud each sound is in the video ----

await check("the loudness of the computer's sound can be set in decibels and goes to the recorder, and a wrong number is said in words", async (page, t) => {
  const box = page.getByLabel(/^The computer's sound in the video/);
  assertEqual(await box.inputValue(), "0", "it starts as heard");
  assertMatch(await page.getByText(/^0 leaves a sound as it is heard/).textContent(), /never changed by this\.$/, "what the boxes mean is written beside them");
  await box.fill("-19");
  await page.getByLabel(/^Countdown/).fill("0");
  await page.getByRole("button", { name: "Start recording" }).focus();
  await t.key("Enter");
  await page.getByRole("heading", { name: "Recording", exact: true }).waitFor();
  const started = await t.standIn(() => window.__openstageStandIn.started.filter((a) => a[0] === "record").map((a) => a.slice(a.indexOf("--interactions"))));
  assertEqual(started, [["--interactions", "off", "--system-gain-db", "-19"]], "the recorder was started with the computer's sound 19 decibels quieter");
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("heading", { name: "Finished" }).waitFor();
  await page.getByRole("button", { name: "Done" }).click();
  await box.fill("30");
  assertMatch(await page.locator('[id$="-problem"]').textContent(), /the computer's sound is in the video is a whole number of decibels from -40 to 20/, "too loud a number is refused in words");
  assertEqual(await page.getByRole("button", { name: "Start recording" }).getAttribute("aria-disabled"), "true", "and Start waits");
});

// ---- choices that cannot work are said, not hidden ----

await check("Start says why it cannot start, and pressing it says so instead of doing nothing", async (page, t) => {
  await page.getByLabel("Name of the recording").fill("");
  const start = page.getByRole("button", { name: "Start recording" });
  assertEqual(await start.getAttribute("aria-disabled"), "true", "Start is marked unavailable");
  assertMatch(await page.locator('[id$="-problem"]').textContent(), /Give the recording a name/, "the reason is written beside it");
  assertMatch((await start.getAttribute("aria-describedby")) ?? "", /problem/, "and it is the button's description");
  await start.focus();
  assertEqual(await t.focusLabel(), "Start recording", "an unavailable Start can still be reached by keyboard");
  await t.key("Enter");
  assertMatch(await t.said(), /Give the recording a name/, "pressing it says why");
  assertEqual(await page.getByRole("heading", { name: "Recording", exact: true }).isVisible().catch(() => false), false, "nothing started");
});

await check("recording one window needs the list of windows first, and choosing one makes Start available", async (page, t) => {
  await page.getByRole("combobox", { name: "Record", exact: true }).selectOption("window");
  assertMatch(await page.locator('[id$="-problem"]').textContent(), /Choose the window to record/, "the reason");
  await page.getByRole("button", { name: "Look for windows" }).focus();
  await t.key("Enter");
  await t.waitSaid(/Found 3 windows\. Choose one\./);
  assertEqual(await t.focusLabel(), "Which window", "the focus moves to the list of windows");
  assertEqual(await page.getByLabel("Which window").evaluate((el) => el.options[0].textContent), "Choose a window", "and its first choice says what to do");
  const options = await page.getByLabel("Which window").locator("option").allTextContents();
  assertEqual(options.slice(1), ["1. notepad.exe: Notes (800 by 600)", "2. WINWORD.EXE: Lesson plan - Word (1920 by 1032)", "3. chrome.exe: Week 3 - Google Chrome (1920 by 1032)"], "the windows are listed in words");
  await page.getByLabel("Which window").selectOption({ index: 2 });
  assertEqual(await page.getByRole("button", { name: "Start recording" }).getAttribute("aria-disabled"), null, "Start is available");
});

await check("recording part of a screen takes four whole numbers, and a wrong one is said in words", async (page) => {
  await page.getByRole("combobox", { name: "Record", exact: true }).selectOption("region");
  assertEqual(await page.getByLabel("Width in pixels").isVisible(), true, "the four boxes are shown");
  await page.getByLabel("Width in pixels").fill("10");
  assertMatch(await page.locator('[id$="-problem"]').textContent(), /at least 64 pixels wide/, "too small");
  await page.getByLabel("Width in pixels").fill("abc");
  assertMatch(await page.locator('[id$="-problem"]').textContent(), /four whole numbers/, "not a number");
  await page.getByLabel("Width in pixels").fill("1280");
  assertEqual(await page.getByRole("button", { name: "Start recording" }).getAttribute("aria-disabled"), null, "a good region is accepted");
});

await check("a recording of the same name warns that it will add a take, and the recordings folder can be shown and chosen again", async (page, t) => {
  await startPractice(page, t, { name: "Same name" });
  await t.waitNow(/^Recording take 1/);
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("heading", { name: "Finished" }).waitFor();
  assertMatch(await page.locator('[id$="-where"]').textContent(), /^This is a pretend recording\. Nothing is kept on your computer/, "the preview says the recording is pretend, not kept");
  assert(!/Kept in:/.test(await page.locator('[id$="-where"]').textContent()), "the preview never says kept in");
  await page.getByRole("button", { name: "Show the recording in its folder" }).click();
  assertEqual(await t.standIn(() => window.__openstageStandIn.revealed), ["Same name.capture"], "the recording's folder was asked for");
  assertMatch(await t.said(), /Could not show the folder\. This is a pretend recording.*no folder to show\./, "and the preview says why nothing opened");
  await page.getByRole("button", { name: "Done" }).click();
  await page.getByLabel("Name of the recording").fill("Same name");
  assertMatch(await page.locator('[id$="-problem"]').textContent(), /A recording called Same name already exists\. Recording again adds another take to it\./, "the warning");
  assertEqual(await page.getByRole("button", { name: "Start recording" }).getAttribute("aria-disabled"), null, "it is a warning, not a block");
  assertMatch(await page.locator('[id$="-folder"]').textContent(), /^This preview keeps only pretend recordings, inside this page, until you close it\. The real app keeps recordings in: C:\\Users\\You\\Videos\\OpenStage Recorder$/, "the preview says what is kept and where the real app would keep it");
});

await check("Edit this recording is honest that the editor is not built yet, and changes nothing", async (page, t) => {
  await startPractice(page, t, { name: "Edit me" });
  await t.waitNow(/^Recording take 1/);
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("heading", { name: "Finished" }).waitFor();
  await page.getByRole("button", { name: "Edit the recording I just made" }).click();
  assertMatch(await t.said(), /not built into this app yet.*nothing was changed/, "it says so");
  assertEqual(await t.standIn(() => [...window.__openstageStandIn.files.keys()].filter((k) => k.endsWith("edit.json"))), [], "no edit file was made");
});

// ---- the check ----

await check("checking this computer lists what it found and says in a sentence how it went", async (page, t) => {
  await page.getByRole("button", { name: "Check this computer" }).focus();
  await t.key("Enter");
  await t.waitSaid(/This computer is ready to record\. All 9 checks passed\./);
  const found = await page.getByRole("list", { name: "What the check found" }).locator("li").allTextContents();
  assertEqual(found.length, 9, "nine findings");
  assertMatch(found[0], /^Passed\. Windows version: /, "a finding is a sentence with its result first");
});

await check("a recording program that is not installed is said everywhere it matters, and nothing pretends to work", async (page, t) => {
  assertMatch(await page.locator('[id$="-found"]').textContent(), /The recording program was not found/, "the message under the check");
  assertEqual(await page.getByRole("button", { name: "Check this computer" }).getAttribute("aria-disabled"), "true", "the check is unavailable");
  assertMatch(await page.locator('[id$="-problem"]').textContent(), /nothing can be recorded, not even a practice/, "the reason Start cannot start");
  await page.getByRole("button", { name: "Start recording" }).focus();
  await t.key("Enter");
  assertMatch(await t.said(), /nothing can be recorded/, "pressing Start says so");
}, { search: "&norecorder=1" });

// ---- looking at it ----

async function contrast(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { missing: true };
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      const [r, g, b, a = 1] = m[1].split(/[ ,\/]+/).filter(Boolean).map(Number);
      return { r, g, b, a };
    };
    const bg = (node) => {
      const layers = [];
      for (let n = node; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (c.a > 0) layers.push(c);
        if (c.a === 1) break;
      }
      let out = { r: 255, g: 255, b: 255 };
      for (const c of layers.reverse()) out = { r: c.r * c.a + out.r * (1 - c.a), g: c.g * c.a + out.g * (1 - c.a), b: c.b * c.a + out.b * (1 - c.a) };
      return out;
    };
    const lum = ({ r, g, b }) => {
      const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const [a, b] = [lum(parse(getComputedStyle(el).color)), lum(bg(el))].sort((x, y) => y - x);
    return { ratio: (a + 0.05) / (b + 0.05) };
  }, selector);
}

for (const scheme of ["light", "dark"]) {
  await check(`text and controls have enough contrast (${scheme} colours)`, async (page, t) => {
    await page.getByLabel("Name of the recording").fill("");
    await t.key("Tab");
    await page.getByRole("button", { name: "Start recording" }).focus();
    await t.key("Enter");
    const wanted = [".app-header h1", ".app-preview", ".rv-status", "label", ".rv-note", ".os-cl-button", ".rv-primary", ".os-cl-input", ".rv-section h2", ".rv-fieldset legend"];
    for (const selector of wanted) {
      const result = await contrast(page, selector);
      if (result.missing) throw new Error(`${selector} was not on the page`);
      if (result.ratio < 4.5) throw new Error(`${selector} has contrast ${result.ratio.toFixed(2)}:1, under 4.5:1`);
    }
  }, { colorScheme: scheme });
}

await check("Windows high contrast (forced colours): the choices and Start are still there and the page still works", async (page, t) => {
  await page.getByRole("button", { name: "Start recording" }).waitFor();
  await page.getByLabel(/^Practice/).check();
  await page.getByRole("button", { name: "Start recording" }).focus();
  await t.key("Enter");
  await page.getByRole("heading", { name: "Recording", exact: true }).waitFor();
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("heading", { name: "Finished" }).waitFor();
}, { forcedColors: "active" });

await check("at 320 pixels wide and text twice the size, the page does not scroll sideways", async (page) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.addStyleTag({ content: "html { font-size: 200%; }" });
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(over <= 0, `the page is ${over} pixels wider than the window`);
  const wide = await page.evaluate(() => [...document.querySelectorAll("main *")].filter((el) => el.getBoundingClientRect().right > document.documentElement.clientWidth + 1 && el.offsetParent !== null).map((el) => el.id || el.tagName).slice(0, 5));
  assertEqual(wide, [], "elements that stick out");
}, { viewport: { width: 320, height: 800 } });

await check("no animation or motion is used", async (page) => {
  const moving = await page.evaluate(() => [...document.querySelectorAll("*")].filter((el) => getComputedStyle(el).animationName !== "none" || parseFloat(getComputedStyle(el).transitionDuration) > 0).length);
  assertEqual(moving, 0, "elements with an animation or a transition");
}, { reducedMotion: "reduce" });

await browser.close();
server.kill();
console.log(`\n${passes} passed, ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
