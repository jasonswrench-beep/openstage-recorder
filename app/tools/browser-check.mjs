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

const server = spawn(process.execPath, [resolve(here, "..", "dev-server.mjs"), String(PORT), "--media-test"], { stdio: ["ignore", "pipe", "inherit"] });
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

/** Open one of the Record screen's More choices sections (the mouse, windows to hide, sound balance), if it is closed. */
const moreSection = (page, title) => page.locator("details.rv-more").filter({ has: page.locator("summary", { hasText: title }) });
async function openMore(page, title) {
  const section = moreSection(page, title);
  if (!(await section.evaluate((d) => d.open))) await section.locator("summary").click();
}

/** Open the editing screen's More panel (the sound file, the picture, Suggest zooms, the choices about the video), if it is closed. */
async function openFinish(page) {
  const more = page.locator("details.ev-more");
  if (!(await more.evaluate((d) => d.open))) await more.locator("summary").click();
}

// ---- the page and its names ----

await check("the page has a heading, a main region, and a section for each job, each named", async (page) => {
  assertEqual(await page.locator("h1").count(), 1, "one main heading");
  assertEqual(await page.locator("header").count(), 1, "one header");
  assertEqual(await page.locator("main").count(), 1, "one main region");
  const tabs = await page.getByRole("tab").allTextContents();
  assertEqual(tabs, ["Record", "Recordings", "Settings", "Help"], "the tabs, in order");
  assertEqual(await page.getByRole("tab", { name: "Record", exact: true }).getAttribute("aria-selected"), "true", "Record is the tab shown first");
  assertEqual(await page.locator("h2:visible").allTextContents(), ["Record"], "the Record screen has its heading");
  assertEqual(await page.getByRole("region", { name: "Record", exact: true }).count(), 1, "the Record section is a named region");
  await page.getByRole("tab", { name: "Recordings" }).click();
  assertEqual(await page.locator("h2:visible").allTextContents(), ["Your recordings"], "the Recordings tab");
  await page.getByRole("tab", { name: "Settings" }).click();
  assertEqual(await page.locator("h2:visible").allTextContents(), ["Where recordings are kept", "Is this computer ready to record?"], "the Settings tab");
  for (const name of ["Where recordings are kept", "Is this computer ready to record?"]) {
    assertEqual(await page.getByRole("region", { name, exact: true }).count(), 1, `the ${name} section is a named region`);
  }
  await page.getByRole("tab", { name: "Help" }).click();
  assertEqual(await page.getByRole("table", { name: "While recording, from any program" }).locator("tbody tr").count(), 3, "Help lists the three keys that work while recording");
  await page.getByRole("tab", { name: "Help" }).focus();
  await page.keyboard.press("Home");
  assertEqual(await page.getByRole("tab", { name: "Record", exact: true }).evaluate((el) => document.activeElement === el && el.getAttribute("aria-selected") === "true"), true, "Home goes back to Record and shows it");
  await page.keyboard.press("ArrowLeft");
  assertEqual(await page.getByRole("tab", { name: "Help" }).getAttribute("aria-selected"), "true", "Left from the first tab goes round to Help");
  await page.keyboard.press("ArrowRight");
  assertEqual(await page.getByRole("tab", { name: "Record", exact: true }).getAttribute("aria-selected"), "true", "and Right comes back");
  assertMatch(await page.locator(".app-preview").textContent(), /pretend recorder/, "the preview says it is a pretend recorder");
  const icon = page.locator("header img.app-icon");
  assertEqual(await icon.getAttribute("alt"), "", "the icon is decoration and has no words");
  assertEqual(await icon.evaluate((el) => el.complete && el.naturalWidth > 0), true, "the icon loaded");
  assertEqual(await page.locator('link[rel="icon"]').getAttribute("href"), "icon.svg", "the tab icon");
  assertEqual(await page.locator("html").getAttribute("lang"), "en", "the page language");
});

await check("Check for updates on the Help tab says what it found in words, and opens only the release page, only when asked", async (page, t) => {
  await page.getByRole("tab", { name: "Help" }).click();
  assertEqual(await page.getByRole("region", { name: "Updates" }).count(), 1, "the Updates section is a named region");
  assertMatch(await page.locator("#update-copy").textContent(), /^This copy is OpenStage Recorder 0\.1\.0 alpha 4\.$/, "which release this copy is");
  assertEqual(await page.getByRole("button", { name: /Open the/ }).count(), 0, "no page is offered before checking");
  assertEqual(await t.standIn(() => window.__openstageStandIn.openedPages.length), 0, "nothing is opened by itself");
  await page.getByRole("button", { name: "Check for updates" }).click();
  await page.getByRole("button", { name: "Open the new version's page" }).waitFor();
  assertMatch(await page.getByRole("status").filter({ hasText: "newer version" }).textContent(), /A newer version is published: 0\.1\.0 alpha 99/, "the answer is said in the status line");
  assertEqual(await t.standIn(() => window.__openstageStandIn.openedPages.length), 0, "checking opens nothing");
  await page.getByRole("button", { name: "Open the new version's page" }).click();
  assertEqual(await t.standIn(() => window.__openstageStandIn.openedPages), ["https://github.com/jasonswrench-beep/openstage-recorder/releases/tag/v0.1.0-alpha.99"], "the release's page, once, when asked");
  // An answer whose link is not one of this program's release pages offers no page at all.
  await t.standIn(() => { window.__openstageStandIn.updateAnswer = JSON.stringify({ state: "newer", message: "Get it here.", url: "https://example.org/setup.exe" }); });
  await page.getByRole("button", { name: "Check for updates" }).click();
  await page.getByRole("status").filter({ hasText: "Get it here." }).waitFor();
  assertEqual(await page.getByRole("button", { name: /Open the/ }).count(), 0, "no button for a page that is not a release page");
  await t.standIn(() => { window.__openstageStandIn.updateAnswer = JSON.stringify({ state: "current", message: "This copy is up to date." }); });
  await page.getByRole("button", { name: "Check for updates" }).click();
  await page.getByRole("status").filter({ hasText: "This copy is up to date." }).waitFor();
  assertEqual(await page.getByRole("button", { name: /Open the/ }).count(), 0, "up to date: no page is offered");
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
  const listed = await page.locator(".rv-rec-name").allTextContents();
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
  await openMore(page, "Sound balance");
  const box = page.getByLabel(/^The computer's sound in the video/);
  assertEqual(await box.inputValue(), "0", "it starts as heard");
  assertMatch(await page.getByText(/^0 leaves a sound as it is heard/).textContent(), /never changed by this\. When you edit the recording, these numbers are where each sound starts, and you can change them again there, under Sound balance\.$/, "what the boxes mean is written beside them, and where to change them again");
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

await check("advice about the sounds is said as a note, once, in this app's words, and is listed as a note, never as a problem", async (page, t) => {
  await page.evaluate(() => { window.__openstageStandIn.soundFindings = true; });
  await page.getByLabel("Name of the recording").fill("Sound advice");
  await page.getByLabel(/^Countdown/).fill("0");
  await page.getByLabel(/^Practice/).uncheck();
  await page.getByRole("button", { name: "Start recording" }).focus();
  await t.key("Enter");
  await page.getByRole("heading", { name: "Recording", exact: true }).waitFor();
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("heading", { name: "Finished" }).waitFor();
  const said = await t.said();
  assertEqual((said.match(/The computer's sound is about 13 decibels louder/g) ?? []).length, 1, "the balance is said once, though the recorder says it twice");
  assertMatch(said, /Note\. The computer's sound is about 13 decibels louder than your voice/, "it is said as a note");
  assertMatch(said, /Note\. Nothing was heard from the computer's sound \(Speakers \(Pretend\)\) during this recording\. That is normal if nothing was playing\./, "a computer sound that was not heard is said as a note, with the reassurance");
  assert(!/Problem/.test(said), "nothing is called a problem");
  assert(!/--system-gain-db|mic\.wav|system\.wav|FIND SOUND OUTPUT/.test(said), "none of the recorder's command line words are said");
  assertMatch(said, /put -19 in the computer's sound box on the Record screen before recording\)/, "the next step is in this app's words");
  const items = await page.getByRole("list", { name: "What the recorder said" }).locator("li").allTextContents();
  const advice = items.filter((x) => /decibels louder|Nothing was heard/.test(x));
  assertEqual(advice.length, 2, "listed once each");
  assert(advice.every((x) => x.startsWith("Note. ")), "listed as notes");
  assertEqual(items.filter((x) => x.startsWith("Problem.")).length, 0, "no problem is listed");
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
  await page.getByRole("radio", { name: /^One window/ }).check();
  assertMatch(await page.locator('[id$="-problem"]').textContent(), /Choose the window to record/, "the reason");
  await page.getByRole("button", { name: "Look for windows" }).focus();
  await t.key("Enter");
  await t.waitSaid(/Found 3 windows\. Choose one\./);
  assertEqual(await t.focusLabel(), "Which window", "the focus moves to the list of windows");
  assertEqual(await page.getByLabel("Which window").evaluate((el) => el.options[0].textContent), "Choose a window", "and its first choice says what to do");
  const options = await page.getByLabel("Which window").locator("option").allTextContents();
  assertEqual(options.slice(1), ["1. notepad.exe: Notes (800 by 600)", "2. editor.exe: Lesson plan - Editor (1920 by 1032)", "3. browser.exe: Week 3 - Browser (1920 by 1032)"], "the windows are listed in words");
  await page.getByLabel("Which window").selectOption({ index: 2 });
  assertEqual(await page.getByRole("button", { name: "Start recording" }).getAttribute("aria-disabled"), null, "Start is available");
});

await check("recording part of a screen takes four whole numbers, and a wrong one is said in words", async (page) => {
  await page.getByRole("radio", { name: /^Part of a screen/ }).check();
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

// ---- the Recordings tab ----

await check("the Recordings tab has a card for each recording with its length and whether it is edited, a search, an order, and New recording", async (page, t) => {
  await page.getByRole("tab", { name: "Recordings" }).click();
  assertEqual(await page.locator('[id$="-rec-count"]').textContent(), "Nothing has been recorded in this folder yet.", "an empty folder says so");
  await page.getByRole("button", { name: "New recording" }).click();
  assertEqual(await page.getByRole("tab", { name: "Record", exact: true }).getAttribute("aria-selected"), "true", "New recording goes to the Record tab");
  assertEqual(await t.focusLabel(), "Start recording", "with the focus on Start");
  for (const name of ["Week 3 walkthrough", "Alpha demo"]) {
    await page.getByLabel("Name of the recording").fill(name);
    await page.getByLabel(/^Countdown/).fill("0");
    await page.getByLabel(/^Practice/).check();
    await page.getByRole("button", { name: "Start recording" }).click();
    await page.getByRole("heading", { name: "Recording", exact: true }).waitFor();
    await page.waitForTimeout(150);
    await page.getByRole("button", { name: "Stop" }).click();
    await page.getByRole("heading", { name: "Finished" }).waitFor();
    await page.getByRole("button", { name: "Done" }).click();
  }
  await page.getByRole("tab", { name: "Recordings" }).click();
  await page.locator(".rv-rec-card").nth(1).waitFor();
  assertEqual(await page.locator('[id$="-rec-count"]').textContent(), "2 recordings.", "the count");
  const card = page.getByRole("listitem", { name: "Alpha demo" });
  assertMatch(await card.locator(".rv-rec-details").textContent(), /^\d+ seconds?$/, "the card says how long it is");
  assertEqual(await card.locator(".rv-rec-badge").textContent(), "Not edited yet", "and that it has no edit yet");
  assertEqual(await card.getByRole("button", { name: "Show Alpha demo in its folder" }).getAttribute("title"), "Show in its folder", "the folder button has a name and a tooltip");
  await page.getByLabel("Order", { exact: true }).selectOption("name");
  assertEqual(await page.locator(".rv-rec-name").allTextContents(), ["Alpha demo", "Week 3 walkthrough"], "A to Z");
  await page.getByLabel("Find a recording").fill("week");
  assertEqual(await page.locator(".rv-rec-name").allTextContents(), ["Week 3 walkthrough"], "the search keeps what fits");
  assertEqual(await page.locator('[id$="-rec-count"]').textContent(), "1 of 2 recordings fits the search.", "and says how many fit");
  await page.getByLabel("Find a recording").fill("");
  await card.getByRole("button", { name: "Edit Alpha demo" }).click();
  await page.getByRole("heading", { level: 2, name: "Edit the recording: Alpha demo" }).waitFor();
});

// ---- the check ----

await check("checking this computer lists what it found and says in a sentence how it went", async (page, t) => {
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Check this computer" }).focus();
  await t.key("Enter");
  await t.waitSaid(/This computer is ready to record\. All 9 checks passed\./);
  const found = await page.getByRole("list", { name: "What the check found" }).locator("li").allTextContents();
  assertEqual(found.length, 9, "nine findings");
  assertMatch(found[0], /^Passed\. Windows version: /, "a finding is a sentence with its result first");
});

await check("a recording program that is not installed is said everywhere it matters, and nothing pretends to work", async (page, t) => {
  assertMatch(await page.locator('[id$="-found"]').textContent(), /The recording program was not found/, "the message under the check");
  assertMatch(await page.locator('[id$="-computer"]').textContent(), /The recording program was not found/, "the card beside the steps says so too");
  await page.getByRole("tab", { name: "Settings" }).click();
  assertEqual(await page.getByRole("button", { name: "Check this computer" }).getAttribute("aria-disabled"), "true", "the check is unavailable");
  await page.getByRole("tab", { name: "Record", exact: true }).click();
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

// ---- editing a recording ----

/** Make a pretend recording with the keyboard-free shortcuts and come back to the Record screen with it in the list. */
async function makeRecording(page, t, { name = "Edit demo", webcam = false, real = false, micGain, systemGain } = {}) {
  await page.getByLabel("Name of the recording").fill(name);
  await page.getByLabel(/^Countdown/).fill("0");
  if (webcam || real) {
    await page.getByLabel(/^Practice/).uncheck();
    if (micGain !== undefined || systemGain !== undefined) await openMore(page, "Sound balance");
    if (micGain !== undefined) await page.getByLabel(/^Your voice in the video/).fill(String(micGain));
    if (systemGain !== undefined) await page.getByLabel(/^The computer's sound in the video/).fill(String(systemGain));
  }
  if (webcam) {
    const value = await page.getByLabel("A webcam", { exact: true }).evaluate((el) => [...el.options].find((o) => /Pretend webcam/.test(o.textContent))?.value);
    await page.getByLabel("A webcam", { exact: true }).selectOption(value);
  } else if (!real) {
    await page.getByLabel(/^Practice/).check();
  }
  await page.getByRole("button", { name: "Start recording" }).focus();
  await t.key("Enter");
  await page.getByRole("heading", { name: "Recording", exact: true }).waitFor();
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("heading", { name: "Finished" }).waitFor();
  await page.getByRole("button", { name: "Done" }).click();
}

const openEdit = async (page, t) => {
  await page.getByRole("tab", { name: "Recordings" }).click();
  await page.locator(".rv-rec-card").first().getByRole("button", { name: /^Edit / }).focus();
  await t.key("Enter");
  await page.getByRole("heading", { level: 2, name: /^Edit the recording: / }).waitFor();
  await page.waitForFunction(() => /^Opened the recording/.test(document.querySelector(".os-cl-status")?.textContent ?? ""));
};
const editSaid = async (page) => {
  await page.waitForTimeout(150);
  return (await page.locator(".os-cl-status").first().textContent()) ?? "";
};

await check("Edit the recording I just made opens the editing screen on a new edit of that take, changes nothing on disk, and Back returns to the button", async (page, t) => {
  await startPractice(page, t, { name: "Edit me" });
  await t.waitNow(/^Recording take 1/);
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("heading", { name: "Finished" }).waitFor();
  await page.getByRole("button", { name: "Edit the recording I just made" }).focus();
  await t.key("Enter");
  await page.getByRole("heading", { level: 2, name: "Edit the recording: Edit me" }).waitFor();
  await page.waitForFunction(() => /^Opened the recording/.test(document.querySelector(".os-cl-status")?.textContent ?? ""));
  assertMatch(await editSaid(page), /Started a new edit from your newest recording, take 1\./, "it says what it made the edit from");
  assertEqual(await t.standIn(() => [...window.__openstageStandIn.files.keys()].filter((k) => k.endsWith("edit.json"))), [], "no edit file is made until the edit is saved");
  await page.getByRole("button", { name: "Back to recordings" }).click();
  assertEqual(await t.focusLabel(), "Edit the recording I just made", "the focus is back on the button that was used");
});

const stateText = async (page) => (await page.locator('[id$="-state"]').first().textContent()) ?? "";
const saved = (page, file) => page.evaluate((f) => window.__openstageStandIn.files.get(f), file);

await check("Edit opens the editing screen for a recording, says what it opened, puts the focus in the timeline, and Back returns to the button", async (page, t) => {
  await makeRecording(page, t);
  assertEqual(await t.focusLabel(), "Start recording", "Done gives the focus back to Start");
  await openEdit(page, t);
  assertMatch(await editSaid(page), /^Opened the recording Edit demo, \d+ seconds? long\. Tracks and clips: 2 clips on 2 tracks/, "what was opened is said");
  assertEqual(await page.getByRole("heading", { level: 2, name: "Edit the recording: Edit demo" }).count(), 1, "the screen has its own heading");
  assertEqual(await page.getByRole("heading", { level: 2, name: "Record", exact: true }).isVisible(), false, "the Record screen is put away while editing");
  assertEqual(await page.evaluate(() => document.activeElement?.closest(".os-ed-timeline") !== null), true, "the focus is in the timeline");
  assertEqual(await page.title(), "OpenStage Recorder: editing Edit demo", "the window's title says what is being edited");
  assertEqual(await page.locator(".app-main.is-editing").count(), 1, "the page takes the whole width");
  await page.getByRole("button", { name: "Back to recordings" }).focus();
  await t.key("Enter");
  assertEqual(await page.locator(".os-ed").count(), 0, "the editing screens are gone");
  assertEqual(await page.getByRole("heading", { level: 2, name: "Your recordings", exact: true }).isVisible(), true, "the Recordings tab it was opened from is back");
  assertMatch(await t.focusLabel(), /^Edit /, "the focus is back on the button that was used");
  assertEqual(await page.title(), "OpenStage Recorder", "the title is back");
});

await check("only Blur and Cover are offered among the callouts, with Zoom, and no text, shape or arrow tool", async (page, t) => {
  await makeRecording(page, t);
  await openEdit(page, t);
  assertEqual(await page.locator(".os-ed-callouts button").allTextContents(), ["Blur", "Cover", "Zoom on a part", "Draw a zoom"], "the callout bar");
  const everything = (await page.locator(".os-ed button").allTextContents()).join(" | ");
  for (const word of ["Text", "Title", "Lower third", "Highlight", "Circle", "Arrow", "Picture", "Video", "Sound"]) {
    assert(!new RegExp(`(^|\\| )${word}( |\\||$)`).test(everything), `${word} is offered`);
  }
});

await check("a Cover is added from the bar with the keyboard, says it cannot be undone once the video is made, has a colour and a place to set, and one undo takes it away", async (page, t) => {
  await makeRecording(page, t);
  await openEdit(page, t);
  await page.getByRole("button", { name: "Cover", exact: true }).focus();
  await t.key("Enter");
  await page.waitForFunction(() => /nobody can take this cover off/.test(document.querySelector(".os-cl-status")?.textContent ?? ""));
  assertMatch(await editSaid(page), /Once the video is exported, nobody can take this cover off\./, "the warning is said");
  assertEqual(await stateText(page), "There are changes that are not saved.", "adding it is a change to save");
  for (const label of ["Cover colour", "Left (%)", "Top (%)", "Width (%)", "Height (%)"]) {
    assertEqual(await page.getByLabel(label, { exact: true }).count(), 1, `${label} can be set`);
  }
  assertEqual(await page.evaluate(() => document.activeElement?.closest(".os-ed-list, .os-ed") !== null), true, "the focus is in the editing screen, on the new cover's form");
  await page.locator(".os-ed button", { hasText: /^Undo/ }).first().click();
  assertEqual(await stateText(page), "There are no unsaved changes.", "one undo takes it away");
});

await check("a webcam clip has Where and How big boxes, they are named, change the edit in one undo step, and are saved and read back", async (page, t) => {
  await makeRecording(page, t, { name: "Webcam demo", webcam: true });
  await openEdit(page, t);
  await page.locator('.os-tl-lane[data-kind="webcam"] .os-tl-clip').first().click();
  await page.getByRole("button", { name: "Properties and clip list" }).click();
  const where = page.getByLabel("Webcam picture: where", { exact: true });
  const size = page.getByLabel("Webcam picture: how big", { exact: true });
  await where.waitFor();
  assertEqual(await where.inputValue(), "bottom-right", "starts in the default corner");
  assertEqual(await size.inputValue(), "medium", "starts at the default size");
  assertEqual(await page.getByRole("group", { name: "Where the webcam picture sits" }).count(), 1, "the boxes are a named group");
  assertMatch((await where.getAttribute("aria-describedby")) ?? "", /-cam-hint$/, "the boxes point at their hint");
  await where.focus();
  await page.keyboard.press("Escape");
  assertEqual(await page.evaluate(() => document.activeElement?.getAttribute("role")), "row", "Escape in the box returns to the clip's row in the list");
  await where.selectOption("top-left");
  assertMatch(await editSaid(page), /./, "something is said");
  await size.selectOption("large");
  assertEqual([await where.inputValue(), await size.inputValue()], ["top-left", "large"], "the choices are kept");
  await page.keyboard.press("Control+s");
  assertMatch(await editSaid(page), /^Saved the edit in Webcam demo\.capture\./, "the save is said");
  const text = await saved(page, "Webcam demo.capture/edit.json");
  assert(text !== undefined && /"placement":\{"x":250,"y":450,"width":3200,"height":3200\}/.test(text.replace(/\s+/g, "")), "the place is in the saved edit");
  await page.getByRole("button", { name: "Back to recordings" }).click();
  await openEdit(page, t);
  await page.locator('.os-tl-lane[data-kind="webcam"] .os-tl-clip').first().click();
  await page.getByRole("button", { name: "Properties and clip list" }).click();
  assertEqual([await where.inputValue(), await size.inputValue()], ["top-left", "large"], "the saved place is read back");
  await where.selectOption("bottom-right");
  await size.selectOption("medium");
  await page.keyboard.press("Control+s");
  await editSaid(page);
  const back = await saved(page, "Webcam demo.capture/edit.json");
  assert(back !== undefined && !/placement/.test(back), "the default choice takes the place out of the edit");
});

await check("a clip that is not a webcam has no webcam boxes", async (page, t) => {
  await makeRecording(page, t, { webcam: true });
  await openEdit(page, t);
  await page.locator('.os-tl-lane[data-kind="screen"] .os-tl-clip').first().click();
  await page.getByRole("button", { name: "Properties and clip list" }).click();
  assertEqual(await page.getByLabel("Webcam picture: where", { exact: true }).isVisible(), false, "no boxes on a screen clip");
  assertEqual(await page.locator(".os-cl-webcam").evaluate((el) => el.hidden), true, "the group is put away");
});

await check("changes are said to be unsaved, Ctrl+S saves and says so, and leaving with changes asks first", async (page, t) => {
  await makeRecording(page, t);
  await openEdit(page, t);
  assertEqual(await stateText(page), "There are no unsaved changes.", "nothing is changed yet");
  assertEqual(await saved(page, "Edit demo.capture/edit.json"), undefined, "nothing is saved yet");
  await t.key("t");
  assertMatch(await editSaid(page), /fade/, "the change is said");
  assertEqual(await stateText(page), "There are changes that are not saved.", "the change is not saved yet");
  await t.key("Control+s");
  assertMatch(await editSaid(page), /^Saved the edit in Edit demo\.capture\./, "the save is said");
  assertEqual(await stateText(page), "There are no unsaved changes.", "and it is saved");
  assert((await saved(page, "Edit demo.capture/edit.json"))?.includes("transition") === true, "the edit is in edit.json");
  await t.key("Control+z");
  assertEqual(await stateText(page), "There are changes that are not saved.", "undoing makes it differ from what was saved");
  const asked = [];
  let answer = false;
  page.on("dialog", async (d) => { asked.push(d.message()); if (answer) await d.accept(); else await d.dismiss(); });
  await page.getByRole("button", { name: "Back to recordings" }).click();
  await page.waitForTimeout(150);
  assertEqual(asked, ["There are changes to this edit that are not saved. Leave and lose them?"], "leaving is asked about");
  assertEqual(await page.locator(".os-ed").count(), 1, "answering no keeps the editing screen");
  answer = true;
  await page.getByRole("button", { name: "Back to recordings" }).click();
  await page.locator(".os-ed").waitFor({ state: "detached" });
  assertMatch(await t.focusLabel(), /^Edit /, "the focus is back on the button that was used");
});

await check("a recording with a newer take asks which edit to open, and keeping the older edit lets the new one be saved", async (page, t) => {
  await makeRecording(page, t, { name: "Which demo" });
  await openEdit(page, t);
  await t.key("t");
  await t.key("Control+s");
  await editSaid(page);
  await page.getByRole("button", { name: "Back to recordings" }).click();
  await page.evaluate(() => window.__openstageStandIn.files.set("Which demo.capture/takes/take-002/take.json", JSON.stringify({ id: 2, state: "complete", durationMs: 5000, media: [{ file: "screen.mp4", kind: "screen" }, { file: "mic.wav", kind: "microphone" }] })));
  await page.getByRole("tab", { name: "Recordings" }).click();
  await page.locator(".rv-rec-card").first().getByRole("button", { name: /^Edit / }).focus();
  await t.key("Enter");
  await page.getByRole("heading", { name: "Which edit do you want?" }).waitFor();
  assertEqual(await t.focusLabel(), "Open my saved edit", "the focus is on the first answer");
  assertEqual(await page.getByRole("button", { name: /^Start a new edit of the newest recording \(take 2\)/ }).count(), 1, "the other answer is offered");
  const before = await saved(page, "Which demo.capture/edit.json");
  await page.getByRole("button", { name: /^Start a new edit of the newest recording/ }).click();
  await page.waitForFunction(() => /Started a new edit from your newest recording, take 2\./.test(document.querySelector(".os-cl-status")?.textContent ?? ""));
  assertMatch(await editSaid(page), /The edit saved before is kept: when you save this one, the old one is first copied to edit-before-take-2\.json\./, "the copy is promised");
  await t.key("Control+s");
  assertMatch(await editSaid(page), /^Saved the edit in Which demo\.capture\./, "the new edit is saved");
  assertEqual(await saved(page, "Which demo.capture/edit-before-take-2.json"), before, "the older edit is kept as it was");
  assert((await saved(page, "Which demo.capture/edit.json")) !== before, "edit.json is now the new edit");
});

await check("the loudness chosen when recording is where Sound balance starts, and the opening words say so", async (page, t) => {
  await makeRecording(page, t, { name: "Loud demo", real: true, micGain: 6, systemGain: -19 });
  await openEdit(page, t);
  assertEqual(await page.getByRole("group", { name: "Sound balance" }).isVisible(), true, "the balance is offered");
  assertEqual(await page.getByLabel("Your voice, in decibels", { exact: true }).inputValue(), "6", "your voice starts where it was set");
  assertEqual(await page.getByLabel("The computer's sound, in decibels", { exact: true }).inputValue(), "-19", "the computer's sound starts where it was set");
  assertMatch(await editSaid(page), /Microphone of take 1 is 6 decibels louder than it was heard, as you set when recording\. You can change it under Sound balance\. Computer sound of take 1 is 19 decibels quieter than it was heard/, "the opening words say what was carried over");
});

await check("Sound balance sets every clip of a sound from the keyboard, says so, saves, takes one undo, and a wrong number is said and kept to mend", async (page, t) => {
  await makeRecording(page, t, { name: "Balance demo", real: true });
  await openEdit(page, t);
  const system = page.getByLabel("The computer's sound, in decibels", { exact: true });
  const voice = page.getByLabel("Your voice, in decibels", { exact: true });
  assertEqual([await voice.inputValue(), await system.inputValue()], ["0", "0"], "both start as heard");
  assertMatch((await system.getAttribute("aria-describedby")) ?? "", /-balance-hint$/, "the boxes point at their hint");
  await system.focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("-12");
  await t.key("Enter");
  assertMatch(await editSaid(page), /^The computer's sound is now 12 decibels quieter than it was heard, in its one clip\./, "the change is said");
  assertEqual(await stateText(page), "There are changes that are not saved.", "it is a change to save");
  assertEqual(await voice.inputValue(), "0", "your voice is not touched");
  await t.key("Escape"); // nothing left to put back, so back to the timeline
  assertEqual(await page.evaluate(() => document.activeElement?.closest(".os-ed-timeline") !== null), true, "Escape returns to the timeline");
  await t.key("Control+s");
  await editSaid(page);
  const text = ((await saved(page, "Balance demo.capture/edit.json")) ?? "").replace(/\s+/g, "");
  assert(/"volumeDb":-12/.test(text), "the volume is in the saved edit");
  await t.key("Control+z");
  assertEqual(await system.inputValue(), "0", "one undo takes the balance back");
  // a wrong number is said, marked, and kept to mend; Escape puts the number back
  await voice.focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.type("99");
  await t.key("Enter");
  assertMatch(await editSaid(page), /whole number of decibels from -40 to 20/, "the wrong number is said in words");
  assertEqual(await voice.getAttribute("aria-invalid"), "true", "the box is marked as not accepted");
  assertEqual(await voice.inputValue(), "99", "what was typed is kept");
  await t.key("Escape");
  assertEqual([await voice.inputValue(), await voice.getAttribute("aria-invalid")], ["0", null], "Escape puts the number back and clears the mark");
});

await check("Sound balance offers only the sounds the recording has", async (page, t) => {
  await makeRecording(page, t);
  await openEdit(page, t);
  assertEqual(await page.getByRole("group", { name: "Sound balance" }).isVisible(), true, "a practice recording has a voice to balance");
  assertEqual(await page.getByLabel("Your voice, in decibels", { exact: true }).isVisible(), true, "the voice box is there");
  assertEqual(await page.getByLabel("The computer's sound, in decibels", { exact: true }).isVisible(), false, "the computer's sound box is put away when none was recorded");
});

await check("pressing Play in the editing screen is heard: the sound of the recording, from another web address than the page as in the installed app, reaches the speakers", async (page, t) => {
  await makeRecording(page, t, { name: "Heard demo", real: true });
  // Put an analyser after every sound the preview sends through Web Audio, to read what really reaches the speakers.
  await page.evaluate(() => {
    window.__tapped = [];
    const original = AudioContext.prototype.createMediaElementSource;
    AudioContext.prototype.createMediaElementSource = function (element) {
      const node = original.call(this, element);
      const analyser = this.createAnalyser();
      node.connect(analyser);
      window.__tapped.push(analyser);
      return node;
    };
  });
  await openEdit(page, t);
  await page.getByRole("button", { name: "Play", exact: false }).first().click();
  await page.waitForFunction(() => document.querySelectorAll("audio").length > 0, null, { timeout: 5000 });
  await page.waitForTimeout(900);
  const heard = await page.evaluate(() => {
    const peaks = window.__tapped.map((analyser) => {
      const data = new Float32Array(analyser.fftSize);
      analyser.getFloatTimeDomainData(data);
      return Math.max(...data.map(Math.abs));
    });
    return { sources: peaks.length, loudest: Math.max(0, ...peaks), crossOrigin: [...document.querySelectorAll("audio")].map((a) => a.crossOrigin) };
  });
  assert(heard.sources >= 1, "the preview sent no sound through Web Audio");
  assert(heard.loudest > 0.05, `the sound reaching the speakers was silent (loudest sample ${heard.loudest.toFixed(4)})`);
  assertEqual(heard.crossOrigin.every((c) => c === "anonymous"), true, "every sound is asked for with CORS");
}, { search: "&media=1" });

await check("Make a video saves the edit first, shows progress, says it has no captions, and the focus moves to Show the video", async (page, t) => {
  await makeRecording(page, t);
  await openEdit(page, t);
  assertEqual(await saved(page, "Edit demo.capture/edit.json"), undefined, "nothing has been saved yet, so the video maker would have nothing to read");
  await page.getByRole("button", { name: "Make a video from this edit" }).focus();
  await t.key("Enter");
  await page.getByRole("button", { name: "Show the video in its folder" }).waitFor();
  assert((await saved(page, "Edit demo.capture/edit.json")) !== undefined, "the edit was saved first");
  const said = (await page.locator('[id$="-say"]').textContent()) ?? "";
  assertMatch(said, /^The video was made\. Made Edit demo\.mp4: 12\.0 seconds long, 1920 by 1080, with sound\./, "what was made is said");
  assertMatch(said, /This video has no captions\. OpenStage Recorder does not make them yet\. If the people who watch it need captions, make them in another program and put them with the video where you share it\.$/, "the no-captions words close it");
  assertEqual(await t.focusLabel(), "Show the video in its folder", "the focus moved to the next thing to do");
  assertEqual(await page.locator("progress").isHidden(), true, "the progress bar is gone");
  assertEqual(await page.getByRole("button", { name: "Cancel the video" }).isHidden(), true, "Cancel is gone");
  assert((await page.locator('[id$="-say"]').getAttribute("role")) === "status", "the line is a status for a screen reader");
  const args = await page.evaluate(() => window.__openstageStandIn.started.at(-1));
  assertEqual(args.includes("--reduce-motion"), false, "motion is not reduced unless asked for");
  await page.getByRole("button", { name: "Show the video in its folder" }).click();
  await page.waitForTimeout(100);
  assertEqual(await page.evaluate(() => window.__openstageStandIn.revealed.at(-1)), "Edit demo.capture/exports/Edit demo.mp4", "it asks to show the video inside the recording's exports folder");
  assertMatch((await page.locator('[id$="-say"]').textContent()) ?? "", /^Could not show the folder\. This is a pretend recording/, "the pretend recording explains why it cannot");
});

await check("Make a sound file saves the edit first, shows progress, says what was made with no words about captions, and the focus moves to Show the sound file", async (page, t) => {
  await makeRecording(page, t);
  await openEdit(page, t);
  assertEqual(await saved(page, "Edit demo.capture/edit.json"), undefined, "nothing has been saved yet, so the recorder would have nothing to read");
  await openFinish(page);
  await page.getByRole("button", { name: "Make a sound file (WAV) from this edit" }).focus();
  await t.key("Enter");
  await page.getByRole("button", { name: "Show the sound file in its folder" }).waitFor();
  assert((await saved(page, "Edit demo.capture/edit.json")) !== undefined, "the edit was saved first");
  const said = (await page.locator('[id$="-say"]').textContent()) ?? "";
  assertMatch(said, /^The sound file was made\. Exported 12\.0 seconds of sound as a WAV file \(two channels, 48000 samples a second\): .*Edit demo\.wav/, "what was made is said");
  assertEqual(said.includes("captions"), false, "captions are about a video, so nothing is said about them");
  assertEqual(await t.focusLabel(), "Show the sound file in its folder", "the focus moved to the next thing to do");
  assertEqual(await page.locator("progress").isHidden(), true, "the progress bar is gone");
  assertEqual(await page.getByRole("button", { name: "Cancel the sound file" }).isHidden(), true, "Cancel is gone");
  assertEqual(await page.getByRole("heading", { name: "The sound file" }).count(), 1, "the section is named for what is made");
  assert((await page.locator('[id$="-say"]').getAttribute("role")) === "status", "the line is a status for a screen reader");
  const args = await page.evaluate(() => window.__openstageStandIn.started.at(-1));
  assertEqual(args.includes("--audio-only"), true, "--audio-only is passed");
  assertEqual(args.includes("--reduce-motion"), false, "motion has nothing to do with a sound file");
  assert(args[args.indexOf("--out") + 1].endsWith(".wav"), "the name ends in .wav");
  await page.getByRole("button", { name: "Show the sound file in its folder" }).click();
  await page.waitForTimeout(100);
  assertEqual(await page.evaluate(() => window.__openstageStandIn.revealed.at(-1)), "Edit demo.capture/exports/Edit demo.wav", "it asks to show the sound file inside the recording's exports folder");
});

await check("a sound file can be cancelled, a second request while one is made is refused in words, and a video made afterwards is a video again", async (page, t) => {
  await makeRecording(page, t);
  await openEdit(page, t);
  await page.evaluate(() => { window.__openstageStandIn.holdRender = true; });
  await openFinish(page);
  await page.getByRole("button", { name: "Make a sound file (WAV) from this edit" }).click();
  await page.getByRole("button", { name: "Cancel the sound file" }).waitFor();
  for (const name of ["Make a sound file (WAV) from this edit", "Make a video from this edit"]) {
    assertEqual(await page.getByRole("button", { name }).getAttribute("aria-disabled"), "true", `${name} is marked as not available while the sound file is made`);
  }
  await page.getByRole("button", { name: "Make a video from this edit" }).focus();
  await t.key("Enter");
  assertMatch((await page.locator('[id$="-say"]').textContent()) ?? "", /A sound file is already being made/, "the request is refused in the words for what is being made");
  await page.getByRole("button", { name: "Cancel the sound file" }).click();
  await page.waitForFunction(() => /^Making the sound file did not finish, so there is no sound file\./.test(document.querySelector('[id$="-say"]')?.textContent ?? ""));
  assertEqual(await page.getByRole("button", { name: "Show the sound file in its folder" }).isHidden(), true, "nothing to show");
  assertEqual(await page.getByRole("button", { name: "Make a video from this edit" }).getAttribute("aria-disabled"), null, "Make is available again");
  await page.getByRole("button", { name: "Make a video from this edit" }).click();
  await page.getByRole("button", { name: "Show the video in its folder" }).waitFor();
  assertMatch((await page.locator('[id$="-say"]').textContent()) ?? "", /^The video was made\./, "a video is worded as a video");
  assertEqual(await page.getByRole("heading", { name: "The video" }).count(), 1, "the section is named for the video again");
});

await check("Save the picture shown in the preview saves the edit first, asks for the playhead's moment as a PNG, names it for the moment, and the focus moves to Show the picture", async (page, t) => {
  await makeRecording(page, t);
  await openEdit(page, t);
  const box = page.getByLabel("Playhead time", { exact: true });
  await box.fill("7");
  await box.press("Enter");
  assertEqual(await saved(page, "Edit demo.capture/edit.json"), undefined, "nothing has been saved yet");
  await openFinish(page);
  await page.getByRole("button", { name: "Save the picture shown in the preview (PNG)" }).focus();
  await t.key("Enter");
  await page.getByRole("button", { name: "Show the picture in its folder" }).waitFor();
  assert((await saved(page, "Edit demo.capture/edit.json")) !== undefined, "the edit was saved first");
  const said = (await page.locator('[id$="-say"]').textContent()) ?? "";
  assertMatch(said, /^The picture was made\. Exported the picture at 7\.0 seconds as a PNG \(1920 by 1080 pixels\): .*Edit demo at 7\.0 seconds\.png$/, "what was made is said, with the moment");
  assertEqual(said.includes("captions"), false, "captions are about a video, so nothing is said about them");
  assertEqual(await t.focusLabel(), "Show the picture in its folder", "the focus moved to the next thing to do");
  assertEqual(await page.locator("progress").isHidden(), true, "there is no progress bar for a picture");
  assertEqual(await page.getByRole("button", { name: "Cancel the picture" }).isHidden(), true, "Cancel is gone");
  assertEqual(await page.getByRole("heading", { name: "The picture" }).count(), 1, "the section is named for what is made");
  const args = await page.evaluate(() => window.__openstageStandIn.started.at(-1));
  assertEqual(args[args.indexOf("--frame") + 1], "7000", "the playhead's moment is asked for, in milliseconds");
  assertEqual(args.includes("--audio-only"), false, "it is not a sound file");
  assert(args[args.indexOf("--out") + 1].endsWith("Edit demo at 7.0 seconds.png"), "the name says the moment and ends in .png");
  await page.getByRole("button", { name: "Show the picture in its folder" }).click();
  await page.waitForTimeout(100);
  assertEqual(await page.evaluate(() => window.__openstageStandIn.revealed.at(-1)), "Edit demo.capture/exports/Edit demo at 7.0 seconds.png", "it asks to show the picture inside the recording's exports folder");
  // a second moment makes a second picture beside the first, and the video button still makes a video
  await box.fill("2.5");
  await box.press("Enter");
  await openFinish(page);
  await page.getByRole("button", { name: "Save the picture shown in the preview (PNG)" }).click();
  await page.waitForFunction(() => /seconds as a PNG/.test(document.querySelector('[id$="-say"]')?.textContent ?? "") && /at 2\.5 seconds/.test(document.querySelector('[id$="-say"]')?.textContent ?? ""));
  assertEqual((await page.evaluate(() => window.__openstageStandIn.started.at(-1))).includes("2500"), true, "the new moment is asked for");
});

await check("a picture request while a file is being made is refused in the words for that file, and Cancel names it", async (page, t) => {
  await makeRecording(page, t);
  await openEdit(page, t);
  await page.evaluate(() => { window.__openstageStandIn.holdRender = true; });
  await page.getByRole("button", { name: "Make a video from this edit" }).click();
  await page.getByRole("button", { name: "Cancel the video" }).waitFor();
  await openFinish(page);
  assertEqual(await page.getByRole("button", { name: "Save the picture shown in the preview (PNG)" }).getAttribute("aria-disabled"), "true", "the picture button is marked as not available while a video is made");
  await page.getByRole("button", { name: "Save the picture shown in the preview (PNG)" }).focus();
  await t.key("Enter");
  assertMatch((await page.locator('[id$="-say"]').textContent()) ?? "", /A video is already being made/, "the request is refused in the words for what is being made");
  await page.getByRole("button", { name: "Cancel the video" }).click();
  await page.waitForFunction(() => /^Making the video did not finish/.test(document.querySelector('[id$="-say"]')?.textContent ?? ""));
  assertEqual(await page.getByRole("button", { name: "Save the picture shown in the preview (PNG)" }).getAttribute("aria-disabled"), null, "the picture button is available again");
});

await check("the reduce-motion box is ticked for someone whose computer asks for less motion, and it reaches the video maker", async (page, t) => {
  await makeRecording(page, t);
  await openEdit(page, t);
  await openFinish(page);
  const box = page.getByLabel(/^Use cuts instead of animated zooms/);
  assertEqual(await box.isChecked(), true, "ticked from the computer's own setting");
  await page.getByRole("button", { name: "Make a video from this edit" }).click();
  await page.getByRole("button", { name: "Show the video in its folder" }).waitFor();
  assertEqual((await page.evaluate(() => window.__openstageStandIn.started.at(-1))).includes("--reduce-motion"), true, "--reduce-motion is passed");
}, { reducedMotion: "reduce" });

await check("the pointer box is off until the author ticks it, and then it reaches a video and a picture but not a sound file", async (page, t) => {
  await makeRecording(page, t);
  await openEdit(page, t);
  await openFinish(page);
  const box = page.getByLabel(/^Show where the mouse pointer is in the video and in pictures/);
  assertEqual(await box.isChecked(), false, "off to begin with");
  assertMatch((await page.locator("label", { hasText: /^Show where the mouse pointer is/ }).textContent()) ?? "", /Only a recording made with the mouse noted can show it\./, "the box says what it needs");
  await page.getByRole("button", { name: "Make a video from this edit" }).click();
  await page.getByRole("button", { name: "Show the video in its folder" }).waitFor();
  assertEqual((await page.evaluate(() => window.__openstageStandIn.started.at(-1))).includes("--highlight-cursor"), false, "not asked for, not passed");
  await box.focus();
  await t.key("Space");
  assertEqual(await box.isChecked(), true, "Space ticks it from the keyboard");
  await page.getByRole("button", { name: "Make a video from this edit" }).click();
  await page.waitForFunction(() => window.__openstageStandIn.started.length >= 2 && window.__openstageStandIn.started.at(-1).includes("--highlight-cursor"));
  await page.getByRole("button", { name: "Show the video in its folder" }).waitFor();
  await openFinish(page);
  await page.getByRole("button", { name: "Save the picture shown in the preview (PNG)" }).click();
  await page.waitForFunction(() => /^The picture was made\./.test(document.querySelector('[id$="-say"]')?.textContent ?? ""));
  assertEqual((await page.evaluate(() => window.__openstageStandIn.started.at(-1))).includes("--highlight-cursor"), true, "a picture is asked to show it too");
  await openFinish(page);
  await page.getByRole("button", { name: "Make a sound file (WAV) from this edit" }).click();
  await page.waitForFunction(() => /^The sound file was made\./.test(document.querySelector('[id$="-say"]')?.textContent ?? ""));
  assertEqual((await page.evaluate(() => window.__openstageStandIn.started.at(-1))).includes("--highlight-cursor"), false, "a sound file is never asked to, even with the box ticked");
});

await check("a video can be cancelled, and nothing is said about captions when there is no video", async (page, t) => {
  await makeRecording(page, t);
  await openEdit(page, t);
  await page.evaluate(() => { window.__openstageStandIn.holdRender = true; });
  await page.getByRole("button", { name: "Make a video from this edit" }).click();
  await page.getByRole("button", { name: "Cancel the video" }).waitFor();
  assertEqual(await page.getByRole("button", { name: "Make a video from this edit" }).getAttribute("aria-disabled"), "true", "Make is marked as not available while a video is made");
  await page.getByRole("button", { name: "Make a video from this edit" }).focus();
  await t.key("Enter");
  assertMatch((await page.locator('[id$="-say"]').textContent()) ?? "", /A video is already being made/, "pressing it again says so");
  await page.getByRole("button", { name: "Cancel the video" }).click();
  await page.waitForFunction(() => /did not finish, so there is no video/.test(document.querySelector('[id$="-say"]')?.textContent ?? ""));
  const said = (await page.locator('[id$="-say"]').textContent()) ?? "";
  assert(!/captions/.test(said), "no words about captions without a video");
  assertEqual(await page.getByRole("button", { name: "Show the video in its folder" }).isHidden(), true, "nothing to show");
  assertEqual(await page.getByRole("button", { name: "Make a video from this edit" }).getAttribute("aria-disabled"), null, "Make is available again");
});

await check("a video that is being made is asked about before leaving, and leaving stops it", async (page, t) => {
  await makeRecording(page, t);
  await openEdit(page, t);
  await page.evaluate(() => { window.__openstageStandIn.holdRender = true; });
  await page.getByRole("button", { name: "Make a video from this edit" }).click();
  await page.getByRole("button", { name: "Cancel the video" }).waitFor();
  const asked = [];
  page.on("dialog", async (d) => { asked.push(d.message()); await d.dismiss(); });
  await page.getByRole("button", { name: "Back to recordings" }).click();
  await page.waitForTimeout(150);
  assertEqual(asked, ["A video is still being made. Stop it and leave?"], "leaving is asked about");
  assertEqual(await page.locator(".os-ed").count(), 1, "answering no keeps the editing screen");
});

// ---- Quick record ----

await check("Quick record sits beside Start recording, says in a sentence what it will do from the choices on the screen, and the sentence follows them", async (page, t) => {
  const quick = page.getByRole("button", { name: "Quick record" });
  assertEqual(await quick.count(), 1, "one Quick record button");
  assertMatch((await quick.getAttribute("aria-describedby")) ?? "", /quick-note/, "the sentence is the button's description");
  const note = page.locator('[id$="-quick-note"]');
  assertMatch(await note.textContent(), /^Quick record starts after a countdown of 3 seconds and records the whole of screen 1, with your voice \(the default microphone\), the computer's own sound and no webcam\. Stop it with Ctrl\+Shift\+F11 from any program/, "what it will do");
  await page.getByLabel(/^Countdown/).fill("0");
  await page.getByLabel("Your voice", { exact: true }).selectOption("none");
  assertMatch(await note.textContent(), /^Quick record starts at once and records the whole of screen 1, with no voice, /, "the sentence follows the choices");
  assertEqual(await quick.getAttribute("aria-disabled"), null, "available");
  await page.getByLabel("Name of the recording").fill("");
  assertEqual(await quick.getAttribute("aria-disabled"), null, "a missing name does not stop it: the name is made");
  await page.getByLabel(/^Countdown/).fill("99");
  assertEqual(await quick.getAttribute("aria-disabled"), "true", "a wrong countdown does");
  assertMatch(await note.textContent(), /countdown is a whole number of seconds/, "and says why");
  await quick.focus();
  await t.key("Enter");
  assertMatch(await t.said(), /countdown is a whole number of seconds/, "pressing it says so");
  assertEqual(await page.getByRole("heading", { name: "Recording", exact: true }).isVisible().catch(() => false), false, "nothing started");
});

await check("Quick record records at once, and when it is stopped makes the video, copies its path, says so, and puts the focus on Copy the path", async (page, t) => {
  await page.getByLabel(/^Countdown/).fill("0");
  await page.getByLabel("Name of the recording").fill("Typed name");
  await page.getByRole("button", { name: "Quick record" }).focus();
  await t.key("Enter");
  await page.getByRole("heading", { name: "Recording", exact: true }).waitFor();
  await t.waitNow(/^Recording take 1/);
  const args = await page.evaluate(() => window.__openstageStandIn.started.find((a) => a[0] === "record"));
  assertEqual(args?.[0], "record", "the recorder was started");
  assertMatch(args[args.indexOf("--title") + 1], /^Quick recording \d{4}-\d{2}-\d{2} \d{4}$/, "named for the time, not the typed name");
  assertEqual(args[args.indexOf("--source") + 1], "screen", "the real screen, not a practice");
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("button", { name: "Copy the path" }).waitFor();
  await page.waitForFunction(() => document.activeElement?.textContent === "Copy the path");
  assertEqual(await t.focusLabel(), "Copy the path", "the focus is on the next thing to do");
  const path = await page.getByLabel("Path of the finished video").inputValue();
  assertMatch(path, /\\exports\\Quick recording \d{4}-\d{2}-\d{2} \d{4}\.mp4$/, "the path of the video is shown");
  assertEqual(await page.evaluate(() => window.__openstageStandIn.copied), [path], "and it was put on the clipboard");
  const said = await page.locator('[id$="-quick-message"]').textContent();
  assertMatch(said, /^The video was made\. /, "the video was made");
  assertMatch(said, /This video has no captions\./, "the missing captions are still said");
  assertMatch(said, /Its path is copied: paste it where you need it\.$/, "the path is said to be copied");
  assertMatch(await t.said(), /Its path is copied/, "and it is spoken through the status line");
  assertEqual(await page.getByLabel("Path of the finished video").getAttribute("readonly"), "", "the path can be selected but not changed");
  await page.getByRole("button", { name: "Show the video in its folder" }).click();
  await page.waitForTimeout(100);
  assertMatch(await page.evaluate(() => window.__openstageStandIn.revealed.at(-1)), /^Quick recording \d{4}-\d{2}-\d{2} \d{4}\.capture\/exports\/Quick recording \d{4}-\d{2}-\d{2} \d{4}\.mp4$/, "it asks to show the video in the recording's exports folder");
  await page.getByRole("button", { name: "Copy the path" }).click();
  assertEqual((await page.evaluate(() => window.__openstageStandIn.copied)).length, 2, "Copy the path copies again");
  assertMatch(await t.said(), /The path is copied\./, "and says so");
  await page.getByRole("button", { name: "Edit the recording I just made" }).click();
  await page.getByRole("heading", { level: 2, name: /^Edit the recording: Quick recording / }).waitFor();
  assertEqual(await t.standIn(() => [...window.__openstageStandIn.files.keys()].filter((k) => k.endsWith("edit.json")).length), 1, "a quick recording is an ordinary recording: its edit was saved and it opens for editing");
  await page.getByRole("button", { name: "Back to recordings" }).click();
  await page.getByRole("button", { name: "Done" }).click();
  assertEqual(await page.locator('[id$="-quick-message"]').isHidden(), true, "Done puts the quick box away");
});

await check("when the clipboard cannot be used the path is still shown, the failure is said, and Copy the path tries again", async (page, t) => {
  await page.evaluate(() => { window.__openstageStandIn.failNextCopy = true; });
  await page.getByLabel(/^Countdown/).fill("0");
  await page.getByRole("button", { name: "Quick record" }).click();
  await t.waitNow(/^Recording take 1/);
  await page.waitForTimeout(150);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("button", { name: "Copy the path" }).waitFor();
  assertMatch(await page.locator('[id$="-quick-message"]').textContent(), /The path could not be copied\. Press Copy the path, or select it above and copy it\.$/, "the failure is said in words");
  assertEqual(await page.evaluate(() => window.__openstageStandIn.copied), [], "nothing was copied");
  assert((await page.getByLabel("Path of the finished video").inputValue()).endsWith(".mp4"), "the path is there to select");
  await page.getByRole("button", { name: "Copy the path" }).click();
  assertEqual((await page.evaluate(() => window.__openstageStandIn.copied)).length, 1, "pressing the button copies it");
});

await check("from the icon in the notification area: Quick record puts the window away and starts, Stop makes the video and brings the window back, and the tooltip says what is happening", async (page, t) => {
  await page.getByLabel(/^Countdown/).fill("0");
  assertEqual(await page.evaluate(() => window.__openstageStandIn.tooltip), "OpenStage Recorder", "the tooltip names the app to begin with");
  await page.evaluate(() => window.__openstageStandIn.pressTray("quick"));
  await page.getByRole("heading", { name: "Recording", exact: true }).waitFor();
  assertEqual(await page.evaluate(() => window.__openstageStandIn.windowCalls), ["minimize"], "the window was put away so it is not filmed");
  await page.waitForFunction(() => /recording\. Stop with Ctrl\+Shift\+F11$/.test(window.__openstageStandIn.tooltip));
  await page.waitForTimeout(150);
  await page.evaluate(() => window.__openstageStandIn.pressTray("stop"));
  await page.getByRole("button", { name: "Copy the path" }).waitFor();
  assertEqual(await page.evaluate(() => window.__openstageStandIn.windowCalls), ["minimize", "restore"], "the window came back, once, to show the video");
  assertEqual((await page.evaluate(() => window.__openstageStandIn.copied)).length, 1, "the path is on the clipboard");
  await page.waitForFunction(() => /your quick recording is ready$/.test(window.__openstageStandIn.tooltip));
  await page.getByRole("button", { name: "Done" }).click();
  await page.waitForFunction(() => window.__openstageStandIn.tooltip === "OpenStage Recorder");
});

await check("Quick record from the icon says why it did not start and brings the window back, instead of hiding it for nothing", async (page, t) => {
  await page.getByLabel(/^Countdown/).fill("99");
  await page.evaluate(() => window.__openstageStandIn.pressTray("quick"));
  await page.waitForFunction(() => window.__openstageStandIn.windowCalls.includes("restore"));
  assertEqual(await page.evaluate(() => window.__openstageStandIn.windowCalls), ["restore"], "the window was not put away");
  assertMatch(await t.said(), /countdown is a whole number of seconds/, "the reason is on the status line");
  assertEqual(await page.evaluate(() => window.__openstageStandIn.started.filter((a) => a[0] === "record").length), 0, "nothing was recorded");
});

await check("Stop from the icon with nothing recording says so, and Quick record is refused in words while the editing screen is open", async (page, t) => {
  await page.evaluate(() => window.__openstageStandIn.pressTray("stop"));
  assertMatch(await t.said(), /Nothing is recording\./, "stop with nothing going");
  await makeRecording(page, t);
  await openEdit(page, t);
  await page.evaluate(() => window.__openstageStandIn.pressTray("quick"));
  await page.waitForFunction(() => window.__openstageStandIn.windowCalls.includes("restore"));
  assertEqual(await page.evaluate(() => window.__openstageStandIn.windowCalls), ["restore"], "the window came forward, not away");
  assertEqual(await page.evaluate(() => window.__openstageStandIn.started.filter((a) => a[0] === "record").length), 1, "only the earlier recording was ever started");
});

await check("Quick record cannot start without the recording program, and says so", async (page, t) => {
  const quick = page.getByRole("button", { name: "Quick record" });
  assertEqual(await quick.getAttribute("aria-disabled"), "true", "marked unavailable");
  assertMatch(await page.locator('[id$="-quick-note"]').textContent(), /The recording program was not found, so nothing can be recorded/, "the reason is the description");
  await quick.focus();
  await t.key("Enter");
  assertMatch(await t.said(), /nothing can be recorded/, "pressing it says so");
}, { search: "&norecorder=1" });

// ---- Noting the mouse, and zooms suggested from the clicks ----

/** Wait until the running recording has gone on for at least this many seconds (the pretend recorder runs a hundred times faster than the clock). */
const recordedFor = (page, seconds) =>
  page.waitForFunction((wanted) => {
    const m = /^Recording take 1, (?:(\d+) minutes? )?(\d+) seconds?/.exec(document.querySelector('[id$="-now"]')?.textContent ?? "");
    return m !== null && Number(m[1] ?? 0) * 60 + Number(m[2]) >= wanted;
  }, seconds);

/** Record a part of a screen with the mouse noted for about 20 seconds, stop, and open the editing screen on it. */
async function recordClicksAndEdit(page, { whole = false, note = true } = {}) {
  await page.getByLabel("Name of the recording").fill("Clicks demo");
  await page.getByLabel(/^Countdown/).fill("0");
  if (!whole) {
    await page.locator('input[id$="-target-region"]').check();
    await page.getByLabel("Pixels from the left of the screen").fill("100");
    await page.getByLabel("Pixels from the top of the screen").fill("200");
    await page.getByLabel("Width in pixels").fill("1280");
    await page.getByLabel("Height in pixels").fill("720");
  }
  if (note) {
    await openMore(page, "The mouse");
    await page.getByLabel(/^Note where the mouse goes and where I click/).check();
  }
  await page.getByRole("button", { name: "Start recording" }).click();
  await page.getByRole("heading", { name: "Recording", exact: true }).waitFor();
  await recordedFor(page, 18);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("heading", { name: "Finished" }).waitFor();
  await page.getByRole("button", { name: "Edit the recording I just made" }).click();
  await page.getByRole("heading", { level: 2, name: "Edit the recording: Clicks demo" }).waitFor();
  await page.waitForFunction(() => /^Opened the recording/.test(document.querySelector(".os-cl-status")?.textContent ?? ""));
}

const suggestSaid = async (page) => (await page.locator('[id$="-suggest-message"]').textContent()) ?? "";

await check("the mouse box is off until it is ticked, then the recorder is asked to note the mouse but never the keys, the choice is kept for next time, and Quick record says so", async (page, t) => {
  assertEqual(await moreSection(page, "The mouse").evaluate((d) => d.open), false, "its section is closed while it is off");
  await openMore(page, "The mouse");
  const box = page.getByLabel(/^Note where the mouse goes and where I click/);
  assertEqual(await box.isChecked(), false, "off to start with");
  assertEqual((await page.locator('[id$="-quick-note"]').textContent()).includes("mouse is noted"), false, "Quick record does not mention it while it is off");
  await page.getByLabel(/^Countdown/).fill("0");
  await box.check();
  assertMatch(await page.locator('[id$="-quick-note"]').textContent(), /The mouse is noted too: where it goes and where you click\. Then the video is made/, "Quick record says the mouse is noted");
  await page.getByRole("button", { name: "Start recording" }).click();
  await page.getByRole("heading", { name: "Recording", exact: true }).waitFor();
  const args = await page.evaluate(() => window.__openstageStandIn.started.find((a) => a[0] === "record"));
  assertEqual(args[args.indexOf("--interactions") + 1], "no-keys", "the mouse, and not the keys");
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("heading", { name: "Finished" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { level: 1, name: "OpenStage Recorder" }).waitFor();
  assertEqual(await page.getByLabel(/^Note where the mouse goes and where I click/).isChecked(), true, "and it is still ticked next time");
  assertEqual(await moreSection(page, "The mouse").evaluate((d) => d.open), true, "with its section open, so the choice is in sight");
});

await check("without the box ticked the recorder is told to note nothing", async (page) => {
  await page.getByLabel(/^Countdown/).fill("0");
  await page.getByRole("button", { name: "Start recording" }).click();
  await page.getByRole("heading", { name: "Recording", exact: true }).waitFor();
  const args = await page.evaluate(() => window.__openstageStandIn.started.find((a) => a[0] === "record"));
  assertEqual(args[args.indexOf("--interactions") + 1], "off", "nothing noted");
  await page.getByRole("button", { name: "Stop" }).click();
});

await check("Suggest zooms from my clicks lists a zoom for each moment of clicking, adds the ones chosen as ordinary zooms, and they are saved", async (page, t) => {
  await recordClicksAndEdit(page);
  await openFinish(page);
  const suggest = page.getByRole("button", { name: "Suggest zooms from my clicks" });
  await suggest.focus();
  await t.key("Enter");
  await page.getByRole("heading", { name: "Suggested zooms" }).waitFor();
  await page.waitForFunction(() => /zooms are suggested from where you clicked/.test(document.querySelector('[id$="-suggest-message"]')?.textContent ?? ""));
  assertMatch(await suggestSaid(page), /^3 zooms are suggested from where you clicked\. Add the ones you want\. Each is an ordinary zoom afterwards, and still needs a description of what it shows\.$/, "what was found");
  const items = page.locator('ul[aria-label="Suggested zooms"] li');
  assertEqual(await items.count(), 3, "three moments of clicking");
  assertMatch(await items.nth(0).locator("span").textContent(), /^At 0\.5 seconds, for 3\.3 seconds: 3 times on the .* of the picture, around "Open" \(2 clicks\)\.$/, "the first says when, how long, how close, where and what was clicked");
  assertMatch(await items.nth(1).locator("span").textContent(), /around "Save" \(1 click\)\.$/, "the second");
  assertMatch(await items.nth(2).locator("span").textContent(), /around where you clicked \(1 click\)\.$/, "the third had no name for what was clicked, so none is guessed");
  assertEqual(await t.focusLabel(), "Add the zoom at 0.5 seconds", "the focus is on the first Add button, named for its time");
  assertEqual(await page.getByRole("button", { name: "Add all 3" }).isVisible(), true, "Add all says how many");
  await t.key("Enter");
  assertMatch(await editSaid(page), /Added the zoom "Zoom" to the Zoom track at 0\.5 seconds/, "the editing screen says it added it");
  assertMatch(await suggestSaid(page), /Still needed: .* has no description\. .*2 left\.$/, "it still asks for a description, and says how many are left");
  assertEqual(await items.count(), 2, "the added one is off the list");
  assertEqual(await t.focusLabel(), "Add the zoom at 8 seconds", "the focus moved to the next suggestion");
  await page.getByRole("button", { name: "Leave out the zoom at 8 seconds" }).click();
  assertEqual(await items.count(), 1, "the one left out is off the list");
  assertMatch(await suggestSaid(page), /^Left out the zoom at 8 seconds\. 1 left\.$/, "and says so");
  await page.getByRole("button", { name: "Add the zoom at 15 seconds" }).click();
  assertMatch(await suggestSaid(page), /No suggestions are left\.$/, "none left");
  assertEqual(await t.focusLabel(), "Close the suggestions", "the focus is on Close");
  await t.key("Control+s");
  await page.waitForTimeout(150);
  const edit = JSON.parse(await saved(page, "Clicks demo.capture/edit.json"));
  const zooms = edit.tracks.flatMap((track) => track.items ?? []).filter((item) => item.kind === "zoom");
  assertEqual(zooms.length, 2, "two zooms were saved, not three");
  assert(zooms.every((z) => z.rect.width === z.rect.height), "each has the picture's shape");
  await page.getByRole("button", { name: "Close the suggestions" }).click();
  assertEqual(await t.focusLabel(), "Suggest zooms from my clicks", "Close gives the focus back to the button");
  assertEqual(await page.getByRole("heading", { name: "Suggested zooms" }).isHidden(), true, "and puts the list away");
});

await check("Add all puts every suggestion in and saves them, and asking again finds nothing new", async (page, t) => {
  await recordClicksAndEdit(page);
  await openFinish(page);
  await page.getByRole("button", { name: "Suggest zooms from my clicks" }).click();
  await page.getByRole("button", { name: "Add all 3" }).click();
  assertMatch(await suggestSaid(page), /^Added 3 of 3 zooms\. No suggestions are left\.$/, "all three");
  await t.key("Control+s");
  await page.waitForTimeout(150);
  const edit = JSON.parse(await saved(page, "Clicks demo.capture/edit.json"));
  assertEqual(edit.tracks.flatMap((track) => track.items ?? []).filter((item) => item.kind === "zoom").length, 3, "three zooms in the saved edit");
  await openFinish(page);
  await page.getByRole("button", { name: "Suggest zooms from my clicks" }).click();
  await page.waitForFunction(() => /No zoom is suggested/.test(document.querySelector('[id$="-suggest-message"]')?.textContent ?? ""));
  assertMatch(await suggestSaid(page), /^No zoom is suggested: the clicks are too few, too far apart, or already covered by a zoom\./, "asking again finds nothing new, since the zooms are in");
});

await check("a recording that did not note the mouse says how to, in the suggestions box, and the focus goes there", async (page, t) => {
  await recordClicksAndEdit(page, { note: false });
  await openFinish(page);
  await page.getByRole("button", { name: "Suggest zooms from my clicks" }).click();
  await page.waitForFunction(() => /did not note where the mouse went/.test(document.querySelector('[id$="-suggest-message"]')?.textContent ?? ""));
  assertMatch(await suggestSaid(page), /Tick "Note where the mouse goes and where I click" on the Record screen before the next recording\.$/, "how to");
  assertEqual(await t.focusLabel(), "Suggested zooms", "the focus is on the heading, where the words are");
  assertEqual(await page.locator('ul[aria-label="Suggested zooms"] li').count(), 0, "nothing listed");
});

await check("a whole screen whose picture size cannot be read says so instead of guessing where the clicks were", async (page, t) => {
  await recordClicksAndEdit(page, { whole: true });
  await openFinish(page);
  await page.getByRole("button", { name: "Suggest zooms from my clicks" }).click();
  await page.waitForFunction(() => /could not be read/.test(document.querySelector('[id$="-suggest-message"]')?.textContent ?? ""));
  assertMatch(await suggestSaid(page), /^The size of the picture of take 1 could not be read, so no zooms are suggested from its clicks\.$/, "said in words");
});

// ---- Windows to hide ----

await check("the windows to hide are typed with semicolons between them, each reaches the recorder on its own, the check the recorder makes is said, and the words are kept for next time", async (page, t) => {
  await openMore(page, "Windows to hide");
  const box = page.getByLabel(/^Hide windows with these words/);
  assertEqual(await box.inputValue(), "", "nothing is hidden to start with");
  await page.getByLabel(/^Countdown/).fill("0");
  await box.fill("KeePass ; Outlook;");
  await page.getByRole("button", { name: "Start recording" }).click();
  await page.getByRole("heading", { name: "Recording", exact: true }).waitFor();
  const args = await page.evaluate(() => window.__openstageStandIn.started.find((a) => a[0] === "record"));
  assertEqual(args.flatMap((a, i) => (a === "--hide" ? [args[i + 1]] : [])), ["KeePass", "Outlook"], "one --hide for each word, tidied");
  await t.waitSaid(/Hiding windows whose title or program name holds: KeePass, Outlook\./);
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("heading", { name: "Finished" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { level: 1, name: "OpenStage Recorder" }).waitFor();
  assertEqual(await page.getByLabel(/^Hide windows with these words/).inputValue(), "KeePass ; Outlook;", "kept for next time");
  assertMatch(await page.locator('[id$="-quick-note"]').textContent(), /Windows with KeePass, Outlook in their title or program name are covered in the video\./, "Quick record says so too");
});

await check("nothing is hidden when the box is empty, and a recording of one window cannot hide windows and says why", async (page, t) => {
  await page.getByLabel(/^Countdown/).fill("0");
  await page.getByRole("button", { name: "Start recording" }).click();
  await page.getByRole("heading", { name: "Recording", exact: true }).waitFor();
  const args = await page.evaluate(() => window.__openstageStandIn.started.find((a) => a[0] === "record"));
  assertEqual(args.includes("--hide"), false, "no --hide at all");
  await page.getByRole("button", { name: "Stop" }).click();
  await page.getByRole("heading", { name: "Finished" }).waitFor();
  await page.getByRole("button", { name: "Done" }).click();
  await openMore(page, "Windows to hide");
  await page.getByLabel(/^Hide windows with these words/).fill("KeePass");
  await page.locator('input[id$="-target-window"]').check();
  await page.getByRole("button", { name: "Look for windows" }).click();
  await page.waitForFunction(() => /Found \d+ windows/.test(document.querySelector('[role="status"]')?.innerText ?? ""));
  await page.locator('select[id$="-window"]').selectOption({ index: 1 });
  assertMatch(await page.locator('[id$="-problem"]').textContent(), /Hiding windows works when recording a screen or part of one, not one window/, "the reason is written beside Start");
  assertEqual(await page.getByRole("button", { name: "Start recording" }).getAttribute("aria-disabled"), "true", "Start is not available");
});

// ---- Picking a window by clicking it ----

await check("Pick a window by clicking it steps the window aside, takes the window that was clicked, selects it, and makes Start available", async (page, t) => {
  await page.locator('input[id$="-target-window"]').check();
  await page.getByLabel(/^Countdown/).fill("0");
  assertEqual(await page.getByRole("button", { name: "Start recording" }).getAttribute("aria-disabled"), "true", "Start needs a window first");
  const pick = page.getByRole("button", { name: "Pick a window by clicking it" });
  await pick.focus();
  await t.key("Enter");
  await t.waitSaid(/Chosen: 2\. editor\.exe: Lesson plan - Editor \(1920 by 1032\)\./);
  assertEqual(await page.evaluate(() => window.__openstageStandIn.windowCalls), ["minimize", "restore"], "the window stepped aside and came back");
  assertEqual(await page.locator('select[id$="-window"]').inputValue(), "Lesson plan - Editor", "the window clicked is the one chosen");
  assertEqual(await t.focusLabel(), "Which window", "the focus is on the choice, where it now says which window");
  assertEqual(await page.getByRole("button", { name: "Start recording" }).getAttribute("aria-disabled"), null, "Start is available");
  assertEqual(await pick.getAttribute("aria-disabled"), null, "the button is ready to be used again");
  const args = await page.evaluate(() => window.__openstageStandIn.started.find((a) => a[0] === "pick-window"));
  assertEqual(args.includes("--timeout-ms"), true, "the recorder is told how long to wait");
});

await check("when no window is clicked, or Escape is pressed, it says so, brings the window back, and chooses nothing", async (page, t) => {
  await page.locator('input[id$="-target-window"]').check();
  for (const [how, words] of [["none", /No window was clicked within 30 seconds, so none was chosen\./], ["cancel", /Escape was pressed, so no window was chosen\./]]) {
    await page.evaluate((v) => { window.__openstageStandIn.pick = v; }, how);
    await page.getByRole("button", { name: "Pick a window by clicking it" }).click();
    await t.waitSaid(words);
    assertEqual(await page.locator('select[id$="-window"]').inputValue(), "", `nothing chosen after ${how}`);
    assertEqual(await t.focusLabel(), "Pick a window by clicking it", "the focus stays on the button to try again");
  }
  assertEqual((await page.evaluate(() => window.__openstageStandIn.windowCalls)).filter((c) => c === "restore").length, 2, "the window came back both times");
});

await check("Pick a window by clicking it says why it cannot work without the recording program, and does not put the window away for nothing", async (page, t) => {
  await page.locator('input[id$="-target-window"]').check();
  await page.getByRole("button", { name: "Pick a window by clicking it" }).click();
  assertMatch(await t.said(), /The recording program was not found/, "said");
  assertEqual(await page.evaluate(() => window.__openstageStandIn.windowCalls), [], "the window was not put away for nothing");
}, { search: "&norecorder=1" });

await check("every box, choice and button on the editing screen has a name, and the screen fits 320 pixels without sideways scrolling", async (page, t) => {
  await makeRecording(page, t, { webcam: true });
  await openEdit(page, t);
  await page.locator('.os-tl-lane[data-kind="webcam"] .os-tl-clip').first().click();
  await page.getByRole("button", { name: "Properties and clip list" }).click();
  const unnamed = await page.evaluate(() => {
    const named = (el) => {
      if (el.getAttribute("aria-label")) return true;
      const by = el.getAttribute("aria-labelledby");
      if (by && by.split(/\s+/).some((id) => (document.getElementById(id)?.textContent ?? "").trim() !== "")) return true;
      if (el.labels && [...el.labels].some((l) => l.textContent.trim() !== "")) return true;
      return el.tagName === "BUTTON" && el.textContent.trim() !== "";
    };
    return [...document.querySelectorAll("main input, main select, main textarea, main button")].filter((el) => !el.hidden && el.offsetParent !== null && !named(el)).map((el) => el.id || el.outerHTML.slice(0, 80));
  });
  assertEqual(unnamed, [], "controls with no name");
  await page.setViewportSize({ width: 320, height: 800 });
  await page.waitForTimeout(200);
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  assert(over <= 0, `the page is ${over} pixels wider than the window`);
}, { viewport: { width: 1100, height: 1800 } });

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

await check("the editing screen keeps Back, Save and Make a video in sight, and the rest in a More panel that Enter opens and Escape closes", async (page, t) => {
  await makeRecording(page, t, { name: "More demo" });
  await openEdit(page, t);
  for (const name of ["Back to recordings", "Save the edit", "Make a video from this edit"]) assertEqual(await page.getByRole("button", { name }).isVisible(), true, `${name} is in sight`);
  assertEqual(await page.locator("details.ev-more").evaluate((d) => d.open), false, "the More panel starts closed");
  assertEqual(await page.getByRole("button", { name: "Make a sound file (WAV) from this edit" }).isVisible(), false, "with the sound file in it");
  await page.locator("details.ev-more summary").focus();
  await t.key("Enter");
  assertEqual(await page.getByRole("button", { name: "Make a sound file (WAV) from this edit" }).isVisible(), true, "Enter opens it");
  await page.getByRole("button", { name: "Make a sound file (WAV) from this edit" }).focus();
  await t.key("Escape");
  assertEqual(await page.locator("details.ev-more").evaluate((d) => d.open), false, "Escape closes it");
  assertEqual(await page.evaluate(() => document.activeElement?.tagName), "SUMMARY", "and the focus goes back to its button");
  assertEqual(await page.locator(".os-ed").count(), 1, "and the editing screen is still open");
});

await browser.close();
server.kill();
console.log(`\n${passes} passed, ${failures} failed.`);
process.exit(failures === 0 ? 0 : 1);
