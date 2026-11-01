// SPDX-License-Identifier: Apache-2.0
// Tests for Quick record: its plain rules, and a quick recording followed from start to a finished video with the pretend recorder. Nothing is recorded.
import assert from "node:assert/strict";
import { test } from "node:test";
import { RecorderController } from "./capturecontroller.ts";
import { defaultSettings, type RecordSettings } from "./capturesession.ts";
import { describeQuick, quickName, QuickRecord, quickSettings, trayWords, type QuickState } from "./quickrecord.ts";
import { makePreviewBackend } from "./standin.ts";

const SPEED = 100;
const LIBRARY = "C:\\Users\\You\\Videos\\OpenStage Recorder";
const NOW = new Date(2026, 10, 1, 14, 5);

async function until(what: string, ok: () => boolean): Promise<void> {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (ok()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`timed out waiting for ${what}`);
}

function setup(library = LIBRARY) {
  const b = makePreviewBackend({ speed: SPEED });
  const c = new RecorderController(b);
  const q = new QuickRecord(b, c, () => library);
  const states: QuickState["phase"][] = [];
  const said: string[] = [];
  q.subscribe((s, say) => {
    if (states[states.length - 1] !== s.phase) states.push(s.phase);
    said.push(...say);
  });
  return { b, c, q, states, said };
}

test("a quick recording is named for the minute it was started, and a name already used gets a number", () => {
  assert.equal(quickName(NOW, []), "Quick recording 2026-11-01 1405");
  assert.equal(quickName(NOW, ["Quick recording 2026-11-01 1405.capture"]), "Quick recording 2026-11-01 1405 2");
  assert.equal(quickName(NOW, ["Quick recording 2026-11-01 1405.capture", "Quick recording 2026-11-01 1405 2.capture"]), "Quick recording 2026-11-01 1405 3");
  assert.equal(quickName(new Date(2026, 0, 2, 3, 4), []), "Quick recording 2026-01-02 0304", "single digits are padded");
});

test("quick settings are the Record screen's own, with a made name, for real, and the whole screen when a window was chosen", () => {
  const base: RecordSettings = { ...defaultSettings(), name: "Typed", practice: true, target: "window", window: "Notes", display: 2, camera: "default", micGainDb: -3 };
  const q = quickSettings(base, "Quick recording 2026-11-01 1405");
  assert.equal(q.name, "Quick recording 2026-11-01 1405");
  assert.equal(q.practice, false);
  assert.equal(q.target, "screen");
  assert.equal(q.window, "");
  assert.equal(q.display, 2, "the screen chosen is kept");
  assert.equal(q.camera, "default", "so are the webcam and the loudness");
  assert.equal(q.micGainDb, -3);
  const region = quickSettings({ ...base, target: "region", region: { left: "10", top: "20", width: "640", height: "480" } }, "x");
  assert.equal(region.target, "region", "a part of a screen is kept");
  assert.notEqual(region.region, base.region, "the copy does not share the object");
  assert.equal(q.interactions, "off", "the mouse is noted only when the Record screen says so");
  assert.equal(quickSettings({ ...base, interactions: "no-keys" }, "x").interactions, "no-keys", "and then it is");
  assert.equal(base.practice, true, "the Record screen's own choices are not changed");
  assert.equal(base.target, "window");
});

test("the sentence says what a quick recording will do, from the same choices, and how to stop it", () => {
  const words = describeQuick(defaultSettings());
  assert.match(words, /^Quick record starts after a countdown of 3 seconds and records the whole of screen 1, with your voice \(the default microphone\), the computer's own sound and no webcam\./);
  assert.match(words, /Stop it with Ctrl\+Shift\+F11 from any program, the Stop button, or Stop recording in the menu of the icon in the notification area\./);
  assert.match(words, /Then the video is made and its path is copied, ready to paste\.$/);
  const quiet = describeQuick({ ...defaultSettings(), countdownSeconds: 0, microphone: "none", output: "none", camera: "default", display: 2 });
  assert.match(quiet, /^Quick record starts at once and records the whole of screen 2, with no voice, none of the computer's sound and the first webcam\./);
  assert.match(describeQuick({ ...defaultSettings(), countdownSeconds: 1 }), /after a countdown of 1 second and/);
  assert.doesNotMatch(describeQuick(defaultSettings()), /mouse is noted/, "nothing about the mouse while it is not noted");
  assert.match(describeQuick({ ...defaultSettings(), interactions: "no-keys" }), /ready to paste\.$|The mouse is noted too: where it goes and where you click\. Then the video is made and its path is copied, ready to paste\.$/, "and a sentence about it when it is");
  assert.match(describeQuick({ ...defaultSettings(), microphone: "2", output: "3", camera: "2" }), /your voice \(microphone 2\), the computer's own sound \(output 3\) and webcam 2/);
  assert.match(describeQuick({ ...defaultSettings(), target: "region", region: { left: "0", top: "0", width: "640", height: "360" } }), /the part of screen 1 that is chosen above \(640 by 360 pixels\)/);
  assert.match(describeQuick({ ...defaultSettings(), target: "window", window: "Notes" }), /the whole of screen 1 \(a window is not remembered from one time to the next, so a quick recording takes the whole screen\)/);
});

test("the icon's tooltip says what is happening, and a quick recording's own steps come first", () => {
  assert.equal(trayWords("idle", "idle"), "OpenStage Recorder");
  assert.equal(trayWords("countdown", "recording"), "OpenStage Recorder: starting a recording");
  assert.equal(trayWords("recording", "recording"), "OpenStage Recorder: recording. Stop with Ctrl+Shift+F11");
  assert.equal(trayWords("paused", "idle"), "OpenStage Recorder: recording paused");
  assert.equal(trayWords("stopping", "recording"), "OpenStage Recorder: finishing the recording");
  assert.equal(trayWords("finished", "making"), "OpenStage Recorder: making the video of your quick recording");
  assert.equal(trayWords("finished", "ready"), "OpenStage Recorder: your quick recording is ready");
  assert.equal(trayWords("finished", "failed"), "OpenStage Recorder");
});

test("a quick recording goes from start to a finished video whose path is on the clipboard", async () => {
  const { b, c, q, states, said } = setup();
  assert.equal(await q.start({ ...defaultSettings(), name: "Typed", countdownSeconds: 0 }, [], false, NOW), null);
  assert.equal(q.state.phase, "recording");
  assert.equal(q.busy, true);
  await until("recording", () => c.session.phase === "recording");
  const args = b.controls.started[0] ?? [];
  assert.equal(args[0], "record");
  assert.equal(args[args.indexOf("--title") + 1], "Quick recording 2026-11-01 1405", "the name is made, not the one typed");
  assert.equal(args[args.indexOf("--source") + 1], "screen", "a real recording, not a practice");
  assert.equal(args[args.indexOf("--project") + 1], `${LIBRARY}\\Quick recording 2026-11-01 1405.capture`);
  await until("some time recorded", () => c.session.elapsedMs >= 2000);
  await c.act("stop");
  await until("the video is ready", () => q.state.phase === "ready");
  assert.deepEqual(states, ["recording", "making", "ready"]);
  const expected = `${LIBRARY}\\Quick recording 2026-11-01 1405.capture\\exports\\Quick recording 2026-11-01 1405.mp4`;
  assert.equal(q.state.video, expected);
  assert.equal(q.state.videoRel, "exports/Quick recording 2026-11-01 1405.mp4");
  assert.equal(q.state.recording, "Quick recording 2026-11-01 1405.capture");
  assert.equal(q.state.copied, true);
  assert.deepEqual(b.controls.copied, [expected], "the path was put on the clipboard, once");
  assert.ok(b.controls.files.has("Quick recording 2026-11-01 1405.capture/edit.json"), "the edit was saved for the video maker to read");
  assert.equal(b.controls.started.at(-1)?.[0], "render");
  assert.match(q.state.message, /^The video was made\. Made Quick recording 2026-11-01 1405\.mp4: /);
  assert.match(q.state.message, /This video has no captions\./, "the missing captions are still said");
  assert.match(q.state.message, /Its path is copied: paste it where you need it\.$/);
  assert.ok(said.some((s) => /^Making the video from your recording/.test(s)), "the making was said");
  assert.equal(q.busy, false);
  q.dismiss();
  assert.equal(q.state.phase, "idle");
  assert.equal(q.state.video, "");
});

test("when the clipboard cannot be used the video is still ready and the sentence says to copy the path by hand", async () => {
  const { b, c, q } = setup();
  b.controls.failNextCopy = true;
  await q.start({ ...defaultSettings(), countdownSeconds: 0 }, [], true, NOW);
  assert.equal(q.state.fromTray, true);
  await until("recording", () => c.session.elapsedMs >= 1000);
  await c.act("stop");
  await until("the video is ready", () => q.state.phase === "ready");
  assert.equal(q.state.copied, false);
  assert.deepEqual(b.controls.copied, []);
  assert.match(q.state.message, /The path could not be copied\. Press Copy the path, or select it above and copy it\.$/);
  assert.equal(await q.copyPath(), true, "pressing Copy the path again works");
  assert.equal(q.state.copied, true);
  assert.equal(b.controls.copied.length, 1);
});

test("copying with no video yet does nothing", async () => {
  const { b, q } = setup();
  assert.equal(await q.copyPath(), false);
  assert.deepEqual(b.controls.copied, []);
  assert.equal(q.state.copied, null, "nothing was tried");
});

test("a quick recording is refused with a reason when it cannot start, and nothing is left half started", async () => {
  const none = setup("");
  assert.match((await none.q.start(defaultSettings(), [], false, NOW)) ?? "", /Choose a recordings folder first/);
  assert.equal(none.q.state.phase, "idle");
  assert.deepEqual(none.b.controls.started, []);

  const bad = setup();
  assert.match((await bad.q.start({ ...defaultSettings(), countdownSeconds: 99 }, [], false, NOW)) ?? "", /countdown is a whole number of seconds/);
  assert.equal(bad.q.state.phase, "idle");

  const twice = setup();
  assert.equal(await twice.q.start({ ...defaultSettings(), countdownSeconds: 0 }, [], false, NOW), null);
  assert.equal(await twice.q.start({ ...defaultSettings(), countdownSeconds: 0 }, [], false, NOW), "A recording is already going.");
  assert.equal(twice.b.controls.started.length, 1, "the second press started nothing");
  await until("recording", () => twice.c.session.elapsedMs >= 1000);
  await twice.c.act("stop");
  await until("ready", () => twice.q.state.phase === "ready");
});

test("a recorder that cannot be started ends the quick recording with the reason", async () => {
  const { b, c, q, said } = setup();
  b.controls.failNextStart = "The screen could not be reached.";
  assert.equal(await q.start({ ...defaultSettings(), countdownSeconds: 0 }, [], false, NOW), null);
  await until("failed", () => q.state.phase === "failed");
  assert.match(q.state.message, /^The recording did not finish\. The recorder could not be started\. The screen could not be reached\./);
  assert.ok(said.some((s) => /The screen could not be reached/.test(s)));
  assert.equal(q.busy, false);
  // a new quick recording can be tried straight away
  assert.equal(await q.start({ ...defaultSettings(), countdownSeconds: 0 }, [], false, NOW), null);
  assert.equal(q.state.phase, "recording");
  await until("recording", () => c.session.elapsedMs >= 1000);
  await c.act("stop");
  await until("ready", () => q.state.phase === "ready");
});

test("a video that is cancelled while it is made is reported as not made, and the recording is kept", async () => {
  const { b, c, q } = setup();
  await q.start({ ...defaultSettings(), countdownSeconds: 0 }, [], false, NOW);
  await until("some time recorded", () => c.session.elapsedMs >= 1000);
  b.controls.holdRender = true;
  await c.act("stop");
  await until("making", () => q.state.phase === "making");
  await until("the video maker is running", () => b.controls.started.at(-1)?.[0] === "render");
  await b.streamStop();
  await until("failed", () => q.state.phase === "failed");
  assert.match(q.state.message, /did not finish, so there is no video\./);
  assert.equal(q.state.video, "");
  assert.equal(b.controls.copied.length, 0, "nothing is copied when there is no video");
  assert.deepEqual(await b.listRecordings(LIBRARY), ["Quick recording 2026-11-01 1405.capture"], "the recording itself is kept");
});

test("a recording of a name already in the folder gets a number, not a second take of the old one", async () => {
  const { b, c, q } = setup();
  await q.start({ ...defaultSettings(), countdownSeconds: 0 }, ["Quick recording 2026-11-01 1405.capture"], false, NOW);
  await until("recording", () => c.session.elapsedMs >= 1000);
  assert.equal(q.state.recording, "Quick recording 2026-11-01 1405 2.capture");
  await c.act("stop");
  await until("ready", () => q.state.phase === "ready");
  assert.ok(b.controls.files.has("Quick recording 2026-11-01 1405 2.capture/edit.json"));
});
