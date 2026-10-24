// SPDX-License-Identifier: Apache-2.0
// The keys that drive the recorder, checked before the system is asked to register them.
import assert from "node:assert/strict";
import { test } from "node:test";
import { checkHotkeys, DEFAULT_HOTKEYS, keyWarning, normalizeKeys, sameKeys } from "./recorder.ts";

test("the starting keys are four, each its own, and none is a key a screen reader or Windows keeps", () => {
  assert.deepEqual(DEFAULT_HOTKEYS.map((h) => h.id), ["start", "pause", "stop", "restart"]);
  assert.equal(new Set(DEFAULT_HOTKEYS.map((h) => normalizeKeys(h.keys))).size, 4);
  assert.deepEqual(checkHotkeys(DEFAULT_HOTKEYS), []);
  for (const h of DEFAULT_HOTKEYS) assert.equal(keyWarning(h.keys), null, h.keys);
  assert.ok(DEFAULT_HOTKEYS.every((h) => h.label.length > 0), "each has a name to show");
});

test("the same keys written differently are seen to be the same", () => {
  assert.equal(normalizeKeys("Ctrl+Shift+F9"), "ctrl+shift+f9");
  assert.ok(sameKeys("Ctrl+Shift+F9", "shift + control + f9"));
  assert.ok(sameKeys("CommandOrControl+Alt+R", "alt+ctrl+r"));
  assert.ok(!sameKeys("Ctrl+Shift+F9", "Ctrl+Shift+F10"));
  assert.ok(!sameKeys("Ctrl+F9", "Ctrl+Shift+F9"));
});

test("Insert and Caps Lock are warned about, because a screen reader needs them", () => {
  for (const keys of ["Insert+F9", "Ctrl+Insert", "CapsLock+F10", "Caps Lock+F10", "Shift+Ins", "Numpad0+F2"]) {
    const w = keyWarning(keys);
    assert.ok(w && /NVDA, JAWS and Narrator/.test(w), keys);
  }
  assert.equal(keyWarning("Ctrl+Alt+R"), null);
});

test("combinations with the Windows key are warned about too", () => {
  for (const keys of ["Win+R", "Super+F9", "Meta+Shift+F9", "Windows+F1"]) assert.match(keyWarning(keys)!, /Windows keeps/, keys);
});

test("a set of keys is checked for blanks, repeats and warnings, naming the one at fault", () => {
  const set = [
    { id: "start", keys: "Ctrl+Shift+F9", label: "Start recording" },
    { id: "pause", keys: "shift+ctrl+f9", label: "Pause or resume" },
    { id: "stop", keys: "", label: "Stop" },
    { id: "restart", keys: "Insert+F12", label: "Start again" },
  ];
  const problems = checkHotkeys(set);
  assert.deepEqual(problems.map((p) => p.id), ["pause", "stop", "restart"]);
  assert.match(problems[0]!.message, /Pause or resume uses the same keys as Start recording/);
  assert.match(problems[1]!.message, /Stop has no keys/);
  assert.match(problems[2]!.message, /^Start again: Insert and Caps Lock/);
});
