// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { addImportedFile, clipsUsing, findSource, importedSourceOf, parse, serialize, setHasTextAlternative, validate } from "../src/index.ts";
import { clipOf, ok, refused, sample } from "./helpers.ts";

const LOGO = { asset: "images/logo.png", kind: "image", name: "Logo", durationMs: null } as const;
const TOUR = { asset: "video/tour.mp4", kind: "video", name: "Tour", durationMs: 45_000 } as const;
const MUSIC = { asset: "audio/music.wav", kind: "audio", name: "Music", durationMs: 20_000 } as const;

test("a picture is added to a new Imported media track for 5 seconds, and says what it still needs", () => {
  const s = sample();
  const r = ok(addImportedFile(s.model, LOGO, 12_000));
  assert.match(r.message, /Added the clip "Logo" to the Imported media track at 12 seconds, 5 seconds long/);
  assert.match(r.message, /Still needed: alt text for the image, or mark it as decorative/);
  const clip = clipOf(r.model, r.focus?.[0] ?? "");
  assert.deepEqual([clip.startMs, clip.sourceEndMs - clip.sourceStartMs], [12_000, 5000]);
  assert.equal(findSource(r.model, { kind: "asset", asset: "images/logo.png" })?.durationMs, null);
});

test("a video longer than 30 seconds uses its first 30 and says so, and its own sound is said not to be used", () => {
  const r = ok(addImportedFile(sample().model, TOUR, 0));
  assert.match(r.message, /30 seconds long/);
  assert.match(r.message, /Only its first 30 seconds are used/);
  assert.match(r.message, /own sound is not used/);
  assert.match(r.message, /captions, a script or a transcript/);
});

test("sound goes on an Audio track, in the free space, or a new track when there is none", () => {
  const s = sample();
  const first = ok(addImportedFile(s.model, MUSIC, 0));
  const track = first.model.tracks.find((t) => t.clips.some((c) => c.source.kind === "asset"));
  assert.ok(track);
  assert.equal(track.kind, "audio");
  const again = ok(addImportedFile(first.model, MUSIC, 5000));
  const tracks = again.model.tracks.filter((t) => t.clips.some((c) => c.source.kind === "asset"));
  assert.equal(tracks.length, 2, "the first track has no room at 5 seconds, so the second clip gets its own");
  assert.equal(clipsUsing(again.model, { kind: "asset", asset: "audio/music.wav" }), 2);
  assert.equal(again.model.sources.filter((x) => x.ref.kind === "asset" && x.ref.asset === "audio/music.wav").length, 1, "one source however many clips");
});

test("a file with no readable length is not added, and nothing changes", () => {
  const s = sample();
  assert.match(refused(addImportedFile(s.model, { ...MUSIC, durationMs: null }, 0)), /no length that could be read/);
  assert.equal(s.model.tracks.length, sample().model.tracks.length);
});

test("captions are recorded on the file, and the need for them goes away", () => {
  let model = ok(addImportedFile(sample().model, MUSIC, 0)).model;
  const needs = (m: typeof model) => validate(m).filter((p) => p.code === "needs-text-alternative").length;
  assert.equal(needs(model), 1);
  model = ok(setHasTextAlternative(model, { kind: "asset", asset: "audio/music.wav" }, true)).model;
  assert.equal(needs(model), 0);
  assert.match(refused(setHasTextAlternative(model, { kind: "take", take: 1, media: "screen.mp4" }, true)), /not an imported video or sound/);
});

test("an imported file survives saving and opening, and is found from its clip", () => {
  const r = ok(addImportedFile(sample().model, LOGO, 0));
  const back = parse(serialize(r.model));
  assert.ok(back.ok);
  if (back.ok) {
    assert.equal(importedSourceOf(back.model, r.focus?.[0] ?? "")?.name, "Logo");
    assert.equal(serialize(back.model), serialize(r.model));
  }
});
