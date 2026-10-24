// SPDX-License-Identifier: Apache-2.0
// Tests for what the app remembers between runs.
import assert from "node:assert/strict";
import { test } from "node:test";
import { defaultSettings } from "./capturesession.ts";
import { freshName, loadSettings, parseSettings, saveSettings, SETTINGS_KEY } from "./settings.ts";

const NOW = new Date(2026, 9, 23, 14, 5);

test("a new recording is named for the minute it is made, so it does not land on the last one", () => {
  assert.equal(freshName(NOW), "Recording 2026-10-23 1405");
  assert.equal(freshName(new Date(2026, 0, 2, 3, 4)), "Recording 2026-01-02 0304");
});

test("with nothing stored, or damage stored, the defaults are used", () => {
  const fresh = { ...defaultSettings(), name: freshName(NOW) };
  for (const raw of [null, undefined, "", "not json", "[1]", "42", "null", '"x"']) {
    assert.deepEqual(parseSettings(raw, NOW), { library: null, record: fresh }, String(raw));
  }
});

test("good choices are kept, and the name, the practice choice and the window are never kept", () => {
  const stored = JSON.stringify({
    library: "D:\\Videos\\Mine",
    record: {
      name: "Old name", practice: true, target: "region", display: 2, window: "Notes",
      region: { left: "10", top: "20", width: "800", height: "600" },
      microphone: "none", output: "3", camera: "1", interactions: "no-keys", countdownSeconds: 5, sounds: false,
    },
  });
  const s = parseSettings(stored, NOW);
  assert.equal(s.library, "D:\\Videos\\Mine");
  assert.equal(s.record.name, "Recording 2026-10-23 1405");
  assert.equal(s.record.practice, false);
  assert.equal(s.record.window, "");
  assert.equal(s.record.target, "region");
  assert.equal(s.record.display, 2);
  assert.deepEqual(s.record.region, { left: "10", top: "20", width: "800", height: "600" });
  assert.equal(s.record.microphone, "none");
  assert.equal(s.record.camera, "1");
  assert.equal(s.record.countdownSeconds, 5);
  assert.equal(s.record.sounds, false);
});

test("a value that is not one of the choices is replaced by the default for that choice and nothing else is disturbed", () => {
  const bad = JSON.stringify({
    library: 42,
    record: { target: "everything", display: -1, region: { left: "x".repeat(50) }, microphone: 7, interactions: "always", countdownSeconds: 99, sounds: "yes" },
  });
  const s = parseSettings(bad, NOW);
  const fresh = defaultSettings();
  assert.equal(s.library, null);
  assert.equal(s.record.target, fresh.target);
  assert.equal(s.record.display, fresh.display);
  assert.equal(s.record.region.left, fresh.region.left);
  assert.equal(s.record.microphone, fresh.microphone);
  assert.equal(s.record.interactions, fresh.interactions);
  assert.equal(s.record.countdownSeconds, fresh.countdownSeconds);
  assert.equal(s.record.sounds, fresh.sounds);
});

test("a blank folder is no folder", () => {
  assert.equal(parseSettings(JSON.stringify({ library: "   " }), NOW).library, null);
});

test("settings are saved and read back, without the choices that are never kept", () => {
  const box = new Map<string, string>();
  const storage = { getItem: (k: string) => box.get(k) ?? null, setItem: (k: string, v: string) => void box.set(k, v) };
  const record = { ...defaultSettings(), name: "A name", practice: true, window: "Notes", target: "window" as const, countdownSeconds: 2 };
  assert.equal(saveSettings({ library: "D:\\Mine", record }, storage), true);
  const raw = JSON.parse(box.get(SETTINGS_KEY) ?? "{}") as { record: { name: string; practice: boolean; window: string } };
  assert.equal(raw.record.name, "");
  assert.equal(raw.record.practice, false);
  assert.equal(raw.record.window, "");
  const back = loadSettings(storage);
  assert.equal(back.library, "D:\\Mine");
  assert.equal(back.record.target, "window");
  assert.equal(back.record.countdownSeconds, 2);
});

test("storage that is missing or refuses is no problem", () => {
  assert.equal(saveSettings({ library: null, record: defaultSettings() }, undefined), false);
  const refusing = { setItem: () => { throw new Error("blocked"); } };
  assert.equal(saveSettings({ library: null, record: defaultSettings() }, refusing), false);
  const throwing = { getItem: () => { throw new Error("blocked"); } };
  assert.deepEqual(loadSettings(throwing).library, null);
});

test("how loud each sound is in the video is kept when it is a whole number in range, and not otherwise", () => {
  const good = parseSettings(JSON.stringify({ record: { micGainDb: 6, systemGainDb: -19 } }), NOW).record;
  assert.equal(good.micGainDb, 6);
  assert.equal(good.systemGainDb, -19);
  for (const bad of [-41, 21, 1.5, "loud", null]) {
    const s = parseSettings(JSON.stringify({ record: { systemGainDb: bad, micGainDb: bad } }), NOW).record;
    assert.equal(s.systemGainDb, 0, String(bad));
    assert.equal(s.micGainDb, 0, String(bad));
  }
});
