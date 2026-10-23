// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ROOM_PAST_END_MS,
  addShape,
  addTrack,
  addZoom,
  groupMoveLimits,
  moveRowsBy,
  splitAt,
  validate,
  type Model,
  type Rect,
} from "../src/index.ts";
import { clipOf, clipsOn, ok, refused, sample } from "./helpers.ts";

const HALF: Rect = { x: 2500, y: 2500, width: 5000, height: 5000 };
const errorsIn = (model: Model): number => validate(model).filter((p) => p.severity === "error").length;

test("clips on different tracks move together by the same amount", () => {
  const s = sample();
  const r = ok(moveRowsBy(s.model, [s.screen, s.mic], 5000));
  assert.equal(r.message, "Moved 2 clips 5 seconds later.");
  assert.equal(clipOf(r.model, s.screen).startMs, 5000);
  assert.equal(clipOf(r.model, s.mic).startMs, 5000);
  assert.equal(r.label, "move together");
  assert.deepEqual([...(r.focus ?? [])].sort(), [s.screen, s.mic].sort());
  assert.equal(errorsIn(r.model), 0);
});

test("one chosen thing is told about on its own", () => {
  const s = sample();
  const r = ok(moveRowsBy(s.model, [s.screen, s.screen], 1500));
  assert.equal(r.message, 'Moved "Lesson" 1.5 seconds later.');
});

test("moving earlier than the beginning is refused, and nothing at all is moved", () => {
  const s = sample();
  const later = ok(moveRowsBy(s.model, [s.mic], 4000)).model;
  const message = refused(moveRowsBy(later, [s.screen, s.mic], -1000));
  assert.match(message, /^Cannot move 2 clips 1 second earlier: "Lesson" would start before the beginning\./);
  assert.equal(clipOf(later, s.mic).startMs, 4000, "the model that was passed in is not changed");
});

test("neighbours that are both chosen move together, one alone cannot run into the other", () => {
  const s = sample();
  const split = ok(splitAt(s.model, 30_000, s.screenTrack)).model;
  const [a, b] = clipsOn(split, s.screenTrack);
  assert.ok(a && b);
  const both = ok(moveRowsBy(split, [a.id, b.id], 10_000));
  assert.deepEqual(clipsOn(both.model, s.screenTrack).map((c) => c.startMs), [10_000, 40_000]);
  const backwards = ok(moveRowsBy(both.model, [b.id, a.id], -10_000));
  assert.deepEqual(clipsOn(backwards.model, s.screenTrack).map((c) => c.startMs), [0, 30_000]);
  assert.match(refused(moveRowsBy(split, [a.id], 5000)), /run into the clip/);
});

test("a clip and an overlay move together", () => {
  const s = sample();
  const o = addTrack(s.model, "overlay");
  const box = ok(addShape(o.model, o.focus?.[0] ?? "", { startMs: 2000, durationMs: 3000, rect: HALF, name: "Box" }));
  const r = ok(moveRowsBy(box.model, [s.screen, box.focus?.[0] ?? ""], 1000));
  assert.equal(r.message, "Moved 2 things 1 second later.");
  assert.equal(r.model.tracks.find((t) => t.kind === "overlay")?.items[0]?.startMs, 3000);
});

test("a chosen zoom may not jump over one that was not chosen", () => {
  const s = sample();
  const z = addTrack(s.model, "zoom");
  const track = z.focus?.[0] ?? "";
  const first = ok(addZoom(z.model, track, { startMs: 10_000, durationMs: 2000, rect: HALF }));
  const second = ok(addZoom(first.model, track, { startMs: 20_000, durationMs: 2000, rect: HALF }));
  const a = second.model.tracks.find((t) => t.id === track)?.items[0]?.id ?? "";
  assert.match(refused(moveRowsBy(second.model, [a], 12_000)), /would go past the zoom .*, and zooms keep their order\./);
  assert.match(refused(moveRowsBy(second.model, [a], 9000)), /run|overlap|zoom/i);
  const near = ok(moveRowsBy(second.model, [a], 8000));
  assert.equal(near.model.tracks.find((t) => t.id === track)?.items[0]?.startMs, 18_000);
});

test("nothing chosen, an unknown id and a change of nothing", () => {
  const s = sample();
  assert.match(refused(moveRowsBy(s.model, [], 1000)), /Nothing was chosen to move\./);
  assert.match(refused(moveRowsBy(s.model, ["nope"], 1000)), /Nothing was chosen to move\./);
  const none = ok(moveRowsBy(s.model, [s.screen], 0));
  assert.equal(none.label, "");
  assert.equal(none.model, s.model);
});

test("the limits of a group stop where the edit model would refuse", () => {
  const s = sample();
  const o = addTrack(s.model, "overlay");
  const z = addTrack(o.model, "zoom");
  const zt = z.focus?.[0] ?? "";
  const boxA = ok(addShape(z.model, o.focus?.[0] ?? "", { startMs: 10_000, durationMs: 2000, rect: HALF }));
  const zoomA = ok(addZoom(boxA.model, zt, { startMs: 10_000, durationMs: 2000, rect: HALF }));
  const zoomB = ok(addZoom(zoomA.model, zt, { startMs: 20_000, durationMs: 2000, rect: HALF }));
  const ids = zoomB.model.tracks.find((t) => t.id === zt)?.items.map((i) => i.id) ?? [];
  const a = ids[0] ?? "";
  assert.deepEqual(groupMoveLimits(zoomB.model, [a]), { min: -10_000, max: 8000 });
  const lim = groupMoveLimits(zoomB.model, [s.screen, s.mic]);
  assert.deepEqual(lim, { min: 0, max: 60_000 + ROOM_PAST_END_MS });
  assert.equal(groupMoveLimits(zoomB.model, ["nope"]), undefined);
  // One step beyond either end is refused; the end itself is accepted.
  assert.equal(moveRowsBy(zoomB.model, [a], 8000).ok, true);
  assert.equal(moveRowsBy(zoomB.model, [a], 8001).ok, false);
  assert.equal(moveRowsBy(zoomB.model, [a], -10_000).ok, true);
  assert.equal(moveRowsBy(zoomB.model, [a], -10_001).ok, false);
});
