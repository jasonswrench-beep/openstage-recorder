// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALLOUTS, LOGO_PLACE, LOWER_THIRD_BESIDE_LOGO, addCallout, addImportedFile, addLowerThirdWithLogo, addZoomRegion, findItem, keepShape, validate } from "../src/index.ts";
import { clipOf, ok, refused, sample } from "./helpers.ts";

test("every callout in the gallery can be added, on a new overlay track the first time", () => {
  const s = sample();
  for (const info of CALLOUTS) {
    const result = ok(addCallout(s.model, info.kind, 5000));
    const id = result.focus?.[0] ?? "";
    const found = findItem(result.model, id);
    assert.ok(found, info.kind);
    assert.equal(found.track.kind, "overlay");
    assert.equal(found.item.startMs, 5000);
    assert.equal(found.item.durationMs, 3000);
    assert.deepEqual(validate(result.model).filter((p) => p.severity === "error"), [], info.kind);
  }
});

test("a second callout goes on the same overlay track", () => {
  const s = sample();
  const one = ok(addCallout(s.model, "title", 0));
  const two = ok(addCallout(one.model, "arrow", 1000));
  assert.equal(two.model.tracks.filter((t) => t.kind === "overlay").length, 1);
  assert.doesNotMatch(two.message, /Added the track/);
});

test("a callout near the end is shortened, and one at the very end is refused", () => {
  const s = sample();
  const near = ok(addCallout(s.model, "text", 59_000));
  assert.equal(findItem(near.model, near.focus?.[0] ?? "")?.item.durationMs, 1000);
  assert.match(refused(addCallout(s.model, "text", 60_000)), /too near the end/);
});

test("the highlight box says what is still needed, in the sentence", () => {
  const s = sample();
  assert.match(ok(addCallout(s.model, "highlight", 0)).message, /Still needed/);
});

test("a zoom is put in from a rectangle, and made the picture's shape", () => {
  const s = sample();
  const result = ok(addZoomRegion(s.model, { x: 1000, y: 1000, width: 4000, height: 3000 }, 2000));
  const item = findItem(result.model, result.focus?.[0] ?? "")?.item;
  assert.equal(item?.kind, "zoom");
  if (item?.kind === "zoom") assert.deepEqual(item.rect, { x: 1000, y: 1000, width: 4000, height: 4000 });
  assert.match(result.message, /made to fit the picture's shape/);
});

test("a zoom that overlaps another goes on a new zoom track", () => {
  const s = sample();
  const first = ok(addZoomRegion(s.model, { x: 0, y: 0, width: 5000, height: 5000 }, 0));
  const second = ok(addZoomRegion(first.model, { x: 5000, y: 5000, width: 5000, height: 5000 }, 1000));
  assert.equal(second.model.tracks.filter((t) => t.kind === "zoom").length, 2);
});

test("keepShape stays inside the picture", () => {
  assert.deepEqual(keepShape({ x: 9000, y: 9500, width: 2000, height: 1000 }), { x: 8000, y: 8000, width: 2000, height: 2000 });
});

// ---- a lower third with a logo ----

const LOGO_FILE = { asset: "images/logo.png", kind: "image", name: "Logo", durationMs: null } as const;

test("a lower third with a logo is the words, narrower, and the picture at the left end, for the same time", () => {
  const s = sample();
  const r = ok(addLowerThirdWithLogo(s.model, LOGO_FILE, 5000));
  const words = findItem(r.model, r.focus?.[1] ?? "");
  assert.ok(words, "the words are a row");
  assert.deepEqual([words.item.kind, words.item.name, words.item.startMs, words.item.durationMs], ["text", "Lower third", 5000, 3000]);
  assert.ok(words.item.kind === "text");
  assert.deepEqual(words.item.rect, LOWER_THIRD_BESIDE_LOGO);
  const clip = clipOf(r.model, r.focus?.[0] ?? "");
  assert.deepEqual([clip.startMs, clip.sourceEndMs - clip.sourceStartMs], [5000, 3000], "the picture is shown for as long as the words");
  assert.deepEqual(clip.placement, LOGO_PLACE);
  // the logo and the words sit side by side in the lower third, with a gap, and neither covers the other
  assert.ok(LOGO_PLACE.x + LOGO_PLACE.width < LOWER_THIRD_BESIDE_LOGO.x, "a gap between them");
  assert.equal(LOGO_PLACE.y, LOWER_THIRD_BESIDE_LOGO.y);
  assert.equal(LOGO_PLACE.height, LOWER_THIRD_BESIDE_LOGO.height);
  assert.ok(LOWER_THIRD_BESIDE_LOGO.x + LOWER_THIRD_BESIDE_LOGO.width <= 9500, "the words end where a plain lower third ends");
  assert.match(r.message, /Added the text overlay "Lower third"/);
  assert.match(r.message, /Still needed: alt text for the image, or mark it as decorative/);
  assert.deepEqual(validate(r.model).filter((p) => p.severity === "error"), []);
});

test("a lower third with a logo near the end is shortened for both, and one at the end is refused, and it must be a picture", () => {
  const s = sample();
  const near = ok(addLowerThirdWithLogo(s.model, LOGO_FILE, 59_000));
  assert.equal(findItem(near.model, near.focus?.[1] ?? "")?.item.durationMs, 1000);
  const clip = clipOf(near.model, near.focus?.[0] ?? "");
  assert.equal(clip.sourceEndMs - clip.sourceStartMs, 1000, "the picture is shortened too");
  assert.match(refused(addLowerThirdWithLogo(s.model, LOGO_FILE, 60_000)), /too near the end/);
  assert.match(refused(addLowerThirdWithLogo(s.model, { ...LOGO_FILE, kind: "video", durationMs: 9000 }, 0)), /logo has to be a picture/);
  assert.match(refused(addLowerThirdWithLogo(s.model, { ...LOGO_FILE, kind: "audio", durationMs: 9000 }, 0)), /logo has to be a picture/);
});

test("a second lower third with a logo uses the same two tracks, and one that overlaps the first gets a second picture track", () => {
  const s = sample();
  const one = ok(addLowerThirdWithLogo(s.model, LOGO_FILE, 0));
  const two = ok(addLowerThirdWithLogo(one.model, LOGO_FILE, 10_000));
  assert.equal(two.model.tracks.filter((t) => t.kind === "overlay").length, 1, "one track for both bands of words");
  assert.equal(two.model.tracks.filter((t) => t.kind === "media").length, 1, "one track for both logos");
  assert.equal(two.model.tracks.find((t) => t.kind === "media")?.clips.length, 2);
  // overlays may overlap in time (the author may want that); the second logo cannot share a track with the first, so it gets its own
  const overlapping = ok(addLowerThirdWithLogo(one.model, LOGO_FILE, 1000));
  assert.equal(overlapping.model.tracks.filter((t) => t.kind === "overlay").length, 1);
  assert.equal(overlapping.model.tracks.filter((t) => t.kind === "media").length, 2);
});

test("a lower third with a logo shown for 3 seconds does not need 5 seconds of room on the picture track", () => {
  const s = sample();
  // a picture 4 seconds after the first lower third's start: a 5 second still would clash, a 3 second one fits on the same track
  const first = ok(addImportedFile(s.model, LOGO_FILE, 4000));
  const second = ok(addLowerThirdWithLogo(first.model, LOGO_FILE, 0));
  assert.equal(second.model.tracks.filter((t) => t.kind === "media").length, 1, "both pictures on one track");
});

test("a refused lower third with a logo leaves the edit exactly as it was", () => {
  const s = sample();
  const before = JSON.stringify(s.model);
  refused(addLowerThirdWithLogo(s.model, { ...LOGO_FILE, kind: "video", durationMs: 9000 }, 0));
  refused(addLowerThirdWithLogo(s.model, LOGO_FILE, 60_000));
  assert.equal(JSON.stringify(s.model), before);
});
