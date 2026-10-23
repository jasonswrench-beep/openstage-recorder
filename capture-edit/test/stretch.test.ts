// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addShape,
  addTrack,
  addZoom,
  deleteRange,
  deleteTrack,
  itemEndMs,
  validate,
  type Item,
  type Model,
  type Rect,
} from "../src/index.ts";
import { ok, refused, sample } from "./helpers.ts";

const HALF: Rect = { x: 2500, y: 2500, width: 5000, height: 5000 };

interface Layers {
  readonly model: Model;
  readonly overlays: string;
  readonly zooms: string;
  readonly screenTrack: string;
}

function layers(): Layers {
  const s = sample();
  const o = addTrack(s.model, "overlay");
  const z = addTrack(o.model, "zoom");
  return { model: z.model, overlays: o.focus?.[0] ?? "", zooms: z.focus?.[0] ?? "", screenTrack: s.screenTrack };
}

function put(model: Model, track: string, startMs: number, durationMs: number, name: string): Model {
  return ok(addShape(model, track, { startMs, durationMs, name, rect: HALF })).model;
}

function itemsOn(model: Model, trackId: string): readonly Item[] {
  const track = model.tracks.find((t) => t.id === trackId);
  assert.ok(track, `no track ${trackId}`);
  return track.items;
}

const spans = (items: readonly Item[]): ReadonlyArray<readonly [string, number, number]> =>
  items.map((i) => [i.name, i.startMs, itemEndMs(i)] as const);

const errorsIn = (model: Model): number => validate(model).filter((p) => p.severity === "error").length;

// ---- removing a stretch, with overlays and zooms ----

test("an overlay wholly inside the stretch goes, and later ones move earlier when the gap is closed", () => {
  const t = layers();
  let m = put(t.model, t.overlays, 11_000, 2000, "Inside");
  m = put(m, t.overlays, 20_000, 3000, "After");
  m = put(m, t.overlays, 2000, 3000, "Before");
  const r = ok(deleteRange(m, 10_000, 15_000, true));
  assert.deepEqual(spans(itemsOn(r.model, t.overlays)), [
    ["Before", 2000, 5000],
    ["After", 15_000, 18_000],
  ]);
  assert.match(r.message, / Overlays and zooms: 1 removed because it was inside the stretch\.$/);
  assert.equal(errorsIn(r.model), 0);
});

test("leaving the gap keeps later overlays where they were", () => {
  const t = layers();
  let m = put(t.model, t.overlays, 11_000, 2000, "Inside");
  m = put(m, t.overlays, 20_000, 3000, "After");
  const r = ok(deleteRange(m, 10_000, 15_000, false));
  assert.deepEqual(spans(itemsOn(r.model, t.overlays)), [["After", 20_000, 23_000]]);
});

test("an overlay that crosses one edge is shortened to that edge", () => {
  const t = layers();
  let m = put(t.model, t.overlays, 8000, 4000, "Crosses the start");
  m = put(m, t.overlays, 14_000, 6000, "Crosses the end");
  const gap = ok(deleteRange(m, 10_000, 15_000, false));
  assert.deepEqual(spans(itemsOn(gap.model, t.overlays)), [
    ["Crosses the start", 8000, 10_000],
    ["Crosses the end", 15_000, 20_000],
  ]);
  const closed = ok(deleteRange(m, 10_000, 15_000, true));
  assert.deepEqual(spans(itemsOn(closed.model, t.overlays)), [
    ["Crosses the start", 8000, 10_000],
    ["Crosses the end", 10_000, 15_000],
  ]);
  assert.match(gap.message, / Overlays and zooms: 2 shortened or cut in two\.$/);
  assert.equal(errorsIn(gap.model) + errorsIn(closed.model), 0);
});

test("an overlay that spans the whole stretch gets shorter when the gap is closed and is cut in two when it is left", () => {
  const t = layers();
  const m = put(t.model, t.overlays, 5000, 20_000, "Long");
  const closed = ok(deleteRange(m, 10_000, 15_000, true));
  assert.deepEqual(spans(itemsOn(closed.model, t.overlays)), [["Long", 5000, 20_000]]);
  const left = ok(deleteRange(m, 10_000, 15_000, false));
  const pieces = itemsOn(left.model, t.overlays);
  assert.deepEqual(spans(pieces), [
    ["Long", 5000, 10_000],
    ["Long", 15_000, 25_000],
  ]);
  assert.notEqual(pieces[0]?.id, pieces[1]?.id, "each piece has its own id");
  assert.equal(errorsIn(left.model), 0);
});

test("a piece too short to keep is dropped, and the sentence says so", () => {
  const t = layers();
  const m = put(t.model, t.overlays, 9950, 2000, "Sliver");
  const r = ok(deleteRange(m, 10_000, 15_000, true));
  assert.deepEqual(itemsOn(r.model, t.overlays), []);
  assert.match(r.message, / Overlays and zooms: 1 dropped because less than 0.1 seconds of it was left\.$/);
});

test("a zoom is cut and moved with the picture, and its neighbour rule still holds", () => {
  const t = layers();
  let m = ok(addZoom(t.model, t.zooms, { startMs: 12_000, durationMs: 4000, rect: HALF })).model;
  m = ok(addZoom(m, t.zooms, { startMs: 30_000, durationMs: 4000, rect: HALF })).model;
  const r = ok(deleteRange(m, 10_000, 15_000, true));
  assert.deepEqual(r.model.tracks.find((x) => x.id === t.zooms)?.items.map((i) => [i.startMs, itemEndMs(i)]), [
    [10_000, 11_000],
    [25_000, 29_000],
  ]);
  assert.equal(errorsIn(r.model), 0);
});

test("a stretch with only overlays in it can be taken out when the gap is closed, but not left as a gap", () => {
  const t = layers();
  const m = put(t.model, t.overlays, 62_000, 2000, "Past the video");
  // No clip is at 62-64 s, so leaving a gap would change only the overlay, which is what deleting the overlay is for: refused.
  assert.match(refused(deleteRange(m, 61_000, 65_000, false)), /Nothing to remove between 1 minute 1 second and 1 minute 5 seconds: no clip is there/);
  assert.match(refused(deleteRange(layers().model, 61_000, 65_000, false)), /no clip, overlay or zoom is there/);
  const closed = ok(deleteRange(m, 61_000, 65_000, true));
  assert.deepEqual(itemsOn(closed.model, t.overlays), []);
});

test("only the chosen tracks are touched", () => {
  const t = layers();
  let m = put(t.model, t.overlays, 11_000, 2000, "Inside");
  const r = ok(deleteRange(m, 10_000, 15_000, false, [t.screenTrack]));
  assert.deepEqual(spans(itemsOn(r.model, t.overlays)), [["Inside", 11_000, 13_000]]);
});

// ---- deleting a track ----

test("an empty track can be deleted, and the sentence says so", () => {
  const t = layers();
  const r = ok(deleteTrack(t.model, t.overlays, false));
  assert.equal(r.message, "Deleted the empty track \"Overlays\".");
  assert.equal(r.model.tracks.some((x) => x.id === t.overlays), false);
  assert.equal(errorsIn(r.model), 0);
});

test("a track with something on it is not deleted unless the author says so", () => {
  const t = layers();
  const m = put(t.model, t.overlays, 1000, 2000, "A box");
  assert.match(refused(deleteTrack(m, t.overlays, false)), /The track "Overlays" has 1 overlay or zoom on it\. Delete it first, or delete the track together with what is on it\./);
  const gone = ok(deleteTrack(m, t.overlays, true));
  assert.equal(gone.message, 'Deleted the track "Overlays" and the one thing on it.');
  const clips = refused(deleteTrack(t.model, t.screenTrack, false));
  assert.match(clips, /has 1 clip on it/);
  assert.match(ok(deleteTrack(t.model, t.screenTrack, true)).message, /Deleted the track "Screen" and the one thing on it\./);
});

test("deleting a track that is not there is refused", () => {
  assert.match(refused(deleteTrack(layers().model, "t999", false)), /There is no track with the id t999\./);
});
