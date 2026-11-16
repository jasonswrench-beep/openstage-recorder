// SPDX-License-Identifier: Apache-2.0
// Tests for the start key and closing the window into the notification area.
import assert from "node:assert/strict";
import { test } from "node:test";
import { closeDecision, closeToTrayWords, START_KEY, StartKey, startKeyRefusal, startKeyWords } from "./background.ts";
import { RecorderController } from "./capturecontroller.ts";
import { makePreviewBackend } from "./standin.ts";

const on = { startKey: false, closeToTray: true };
const off = { startKey: false, closeToTray: false };

test("the start key is Ctrl+Shift+F9, the start key the recorder has always listed", () => {
  assert.deepEqual(START_KEY, { id: "start", keys: "Ctrl+Shift+F9" });
});

test("closing hides the window only when the author chose it, there is an icon to bring it back from, and Quit was not chosen", () => {
  assert.deepEqual(closeDecision(on, true, false, null), { kind: "hide" });
  assert.deepEqual(closeDecision(on, true, false, "A recording is still going."), { kind: "hide" }, "a recording goes on in the background");
  assert.deepEqual(closeDecision(on, false, false, null), { kind: "close" }, "without the icon the window would be lost");
  assert.deepEqual(closeDecision(on, true, true, null), { kind: "close" }, "Quit from the icon's menu quits");
  assert.deepEqual(closeDecision(on, true, true, "A recording is still going."), { kind: "ask", question: "A recording is still going." });
  assert.deepEqual(closeDecision(off, true, false, null), { kind: "close" });
  assert.deepEqual(closeDecision(off, true, false, "Unsaved."), { kind: "ask", question: "Unsaved." });
});

test("the start key's sentence says whether it is on, whether it worked, and what it does", () => {
  assert.match(startKeyWords(false, null, false), /^Off\. When it is on, Ctrl\+Shift\+F9 starts a quick recording/);
  assert.match(startKeyWords(true, null, false), /Setting up/);
  assert.match(startKeyWords(true, { id: "start", ok: true, message: "" }, false), /^On\. Ctrl\+Shift\+F9 starts a quick recording from any program: .* Ctrl\+Shift\+F11 stops it and makes the video\.$/);
  assert.match(startKeyWords(true, { id: "start", ok: false, message: "Another program already uses those keys." }, false), /could not be used: Another program already uses those keys\. Quick record .* still work\.$/);
  assert.match(startKeyWords(true, { id: "start", ok: true, message: "" }, true), /While a recording is going, Ctrl\+Shift\+F9 does nothing/);
});

test("the close box's sentence says where the window goes and how to bring it back by keyboard", () => {
  assert.match(closeToTrayWords(false, true), /^Off: closing the window quits/);
  assert.match(closeToTrayWords(true, true), /notification area.*Windows\+B.*Quit in the icon's menu ends it\.$/);
  assert.match(closeToTrayWords(true, false), /always quits/);
});

test("the start key does not start a recording while the editing screen is open, and says why", () => {
  assert.equal(startKeyRefusal(false), null);
  assert.match(startKeyRefusal(true) ?? "", /^The editing screen is open\./);
});

test("the start key is registered when switched on, let go when switched off, and put back after a recording", async () => {
  const b = makePreviewBackend({ speed: 50 });
  const c = new RecorderController(b);
  const key = new StartKey(b, c);
  await key.set(true);
  assert.deepEqual(b.controls.registered, ["start"]);
  assert.match(key.words, /^On\. Ctrl\+Shift\+F9 starts/);
  assert.deepEqual(c.idleKeys, [START_KEY]);
  await key.set(false);
  assert.deepEqual(b.controls.registered, []);
  assert.deepEqual(c.idleKeys, []);
  assert.match(key.words, /^Off\./);
});

test("a start key another program already uses is said, with what still works", async () => {
  const b = makePreviewBackend({ speed: 50 });
  b.controls.takenKeys.push("Ctrl+Shift+F9");
  const key = new StartKey(b, new RecorderController(b));
  await key.set(true);
  assert.deepEqual(b.controls.registered, []);
  assert.match(key.words, /could not be used: Another program already uses those keys/);
});
