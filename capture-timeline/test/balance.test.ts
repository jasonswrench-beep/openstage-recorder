// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { addClip, addTrack, createModel, findClip, splitAt, type Model, type SourceInfo } from "../../capture-edit/src/index.ts";
import { memoryFolder, readProject } from "../src/project.ts";
import { EditSession, SOUND_NAMES } from "../src/session.ts";
import { row } from "./helpers.ts";

const SOURCES: readonly SourceInfo[] = [
  { ref: { kind: "take", take: 1, media: "screen.mp4" }, kind: "screen", name: "Screen of take 1", durationMs: 10_000 },
  { ref: { kind: "take", take: 1, media: "mic.wav" }, kind: "microphone", name: "Microphone of take 1", durationMs: 10_000 },
  { ref: { kind: "take", take: 1, media: "system.wav" }, kind: "system-audio", name: "Computer sound of take 1", durationMs: 10_000 },
];

/** A screen, a voice and the computer's sound, each cut in two at 4 seconds. */
function twoSounds(): Model {
  let model = createModel(SOURCES);
  for (const [kind, name, media] of [["screen", "Screen", "screen.mp4"], ["audio", "Voice", "mic.wav"], ["audio", "Computer sound", "system.wav"]] as const) {
    const track = addTrack(model, kind, name);
    model = track.model;
    const added = addClip(model, track.focus?.[0] ?? "", { source: { kind: "take", take: 1, media }, startMs: 0, name });
    assert.ok(added.ok);
    model = added.model;
  }
  const split = splitAt(model, 4000);
  assert.ok(split.ok);
  return split.model;
}

const volumes = (s: EditSession, trackName: string): number[] =>
  s.model.tracks.find((t) => t.name === trackName)?.clips.map((c) => c.volumeDb) ?? [];

test("the balance says how many clips each sound has and how loud they all are, or that they differ", () => {
  const s = new EditSession(twoSounds());
  assert.deepEqual(s.soundBalance("microphone"), { clips: 2, db: 0 });
  assert.deepEqual(s.soundBalance("system-audio"), { clips: 2, db: 0 });
  const second = s.model.tracks.find((t) => t.name === "Voice")?.clips[1];
  assert.ok(second);
  assert.ok(s.select(row(s, second.name).clipId).ok);
  assert.equal(s.setVolumeText("-6").ok, true);
  assert.deepEqual(s.soundBalance("microphone"), { clips: 2 }, "different clips, so no single number");
  assert.deepEqual(s.soundBalance("system-audio"), { clips: 2, db: 0 }, "the other sound is not touched");
});

test("a sound that is not in the edit has no clips", () => {
  const model = createModel(SOURCES);
  const track = addTrack(model, "audio", "Voice");
  const added = addClip(track.model, track.focus?.[0] ?? "", { source: { kind: "take", take: 1, media: "mic.wav" }, startMs: 0, name: "Voice" });
  assert.ok(added.ok);
  const s = new EditSession(added.model);
  assert.deepEqual(s.soundBalance("system-audio"), { clips: 0 });
  const refused = s.setSoundBalance("system-audio", "-6");
  assert.equal(refused.ok, false);
  assert.match(refused.message, /no computer sound in this edit/);
});

test("setting the balance changes every clip of that sound and none of the other, says so, and is one undo step", () => {
  const s = new EditSession(twoSounds());
  const done = s.setSoundBalance("system-audio", "-12");
  assert.equal(done.ok, true);
  assert.match(done.message, /^The computer's sound is now 12 decibels quieter than it was heard, in all 2 clips\./);
  assert.deepEqual(volumes(s, "Computer sound"), [-12, -12]);
  assert.deepEqual(volumes(s, "Voice"), [0, 0]);
  assert.deepEqual(s.soundBalance("system-audio"), { clips: 2, db: -12 });
  assert.equal(s.dirty, true);
  assert.equal(s.undo().ok, true);
  assert.deepEqual(volumes(s, "Computer sound"), [0, 0], "both clips come back with one undo");
  assert.equal(s.canUndo, false, "and it was only one step");
  assert.equal(s.setSoundBalance("microphone", "+6").ok, true);
  assert.deepEqual(volumes(s, "Voice"), [6, 6]);
  assert.match(s.setSoundBalance("microphone", "0").message, /^Your voice is now as it was heard, in all 2 clips\./);
});

test("setting it to what it already is says so and records nothing", () => {
  const s = new EditSession(twoSounds());
  const same = s.setSoundBalance("microphone", "0");
  assert.equal(same.ok, true);
  assert.equal(same.message, "Your voice is already as it was heard.");
  assert.equal(s.canUndo, false);
  assert.equal(s.dirty, false);
});

test("clips that were set one by one are brought to the same number by the balance", () => {
  const s = new EditSession(twoSounds());
  const first = s.model.tracks.find((t) => t.name === "Voice")?.clips[0];
  assert.ok(first);
  assert.ok(s.select(row(s, first.name).clipId).ok);
  assert.equal(s.setVolumeText("3").ok, true);
  assert.deepEqual(s.soundBalance("microphone"), { clips: 2 });
  assert.equal(s.setSoundBalance("microphone", "-3").ok, true);
  assert.deepEqual(volumes(s, "Voice"), [-3, -3]);
  assert.equal(findClip(s.model, first.id)?.clip.volumeDb, -3);
});

test("a wrong number is said in words and nothing changes", () => {
  const s = new EditSession(twoSounds());
  const before = s.model;
  for (const bad of ["", "loud", "1.5", "99", "-41", "21", "six"]) {
    const refused = s.setSoundBalance("microphone", bad);
    assert.equal(refused.ok, false, bad);
    assert.match(refused.message, /decibels/, bad);
  }
  assert.equal(s.model, before);
  assert.equal(s.canUndo, false);
});

test("the two sounds are named the way the recorder names them", () => {
  assert.deepEqual(SOUND_NAMES, { microphone: "Your voice", "system-audio": "The computer's sound" });
});

// ---- the loudness chosen when recording reaches the edit ----

const manifest = JSON.stringify({ format: "openstage-capture-project", schemaVersion: "0.2.5", id: "cap-1", title: "Lesson 1", language: "en-US", tracks: {}, edit: null });
const media = (mix?: { microphoneGainDb: number; systemGainDb: number }) => [
  { file: "screen.mp4", kind: "screen", ...(mix === undefined ? {} : { mix }) },
  { file: "mic.wav", kind: "microphone" },
  { file: "system.wav", kind: "system-audio" },
];

test("the loudness chosen when recording is the volume of the voice and computer sound clips of a new edit, and is said", async () => {
  const folder = memoryFolder("lesson.capture", {
    "capture.json": manifest,
    "takes/take-001/take.json": JSON.stringify({ id: 1, state: "complete", durationMs: 12_000, media: media({ microphoneGainDb: 6, systemGainDb: -19 }) }),
  });
  const result = await readProject(folder);
  assert.ok(result.ok);
  const s = new EditSession(result.project.model);
  assert.deepEqual(s.soundBalance("microphone"), { clips: 1, db: 6 });
  assert.deepEqual(s.soundBalance("system-audio"), { clips: 1, db: -19 });
  assert.deepEqual(result.project.notes, [
    "Microphone of take 1 is 6 decibels louder than it was heard, as you set when recording. You can change it under Sound balance.",
    "Computer sound of take 1 is 19 decibels quieter than it was heard, as you set when recording. You can change it under Sound balance.",
  ]);
});

test("a take recorded with no change to the loudness gives clips as heard and says nothing", async () => {
  for (const mix of [undefined, { microphoneGainDb: 0, systemGainDb: 0 }]) {
    const folder = memoryFolder("lesson.capture", {
      "capture.json": manifest,
      "takes/take-001/take.json": JSON.stringify({ id: 1, state: "complete", durationMs: 12_000, media: media(mix) }),
    });
    const result = await readProject(folder);
    assert.ok(result.ok);
    const s = new EditSession(result.project.model);
    assert.deepEqual([s.soundBalance("microphone").db, s.soundBalance("system-audio").db], [0, 0]);
    assert.deepEqual(result.project.notes, []);
  }
});

test("each take brings its own loudness, and a number that is not a whole decibel in range is ignored", async () => {
  const folder = memoryFolder("lesson.capture", {
    "capture.json": manifest,
    "takes/take-001/take.json": JSON.stringify({ id: 1, state: "complete", durationMs: 12_000, media: media({ microphoneGainDb: 3, systemGainDb: 0 }) }),
    "takes/take-002/take.json": JSON.stringify({ id: 2, state: "complete", durationMs: 8_000, media: media({ microphoneGainDb: 25, systemGainDb: 1.5 }) }),
  });
  const result = await readProject(folder);
  assert.ok(result.ok);
  const s = new EditSession(result.project.model);
  assert.deepEqual(volumes(s, "Microphone"), [3, 0], "take 1 as set, take 2 ignored");
  assert.deepEqual(volumes(s, "Computer sound"), [0, 0]);
});
