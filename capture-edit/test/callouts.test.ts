// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALLOUTS, addCallout, addZoomRegion, findItem, keepShape, validate } from "../src/index.ts";
import { ok, refused, sample } from "./helpers.ts";

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
