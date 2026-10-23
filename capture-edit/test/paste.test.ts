// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  History,
  addText,
  addTrack,
  addZoom,
  copyRows,
  describeCopied,
  findItem,
  pastedEndMs,
  pasteCopied,
  setFades,
  setVolume,
  splitAt,
  validate,
} from "../src/index.ts";
import { clipOf, clipsOn, ok, refused, sample } from "./helpers.ts";

test("a copied clip is pasted after the original with new id and everything else the same", () => {
  const s = sample();
  let model = ok(setVolume(s.model, s.mic, -6)).model;
  model = ok(setFades(model, s.mic, 500, 1000)).model;
  const copied = copyRows(model, [s.mic]);
  assert.equal(copied.length, 1);
  assert.equal(describeCopied(copied), 'Copied "Voice", 1 minute long.');
  const result = ok(pasteCopied(model, copied, 60_000));
  const clips = clipsOn(result.model, s.audioTrack);
  assert.equal(clips.length, 2);
  const made = clipOf(result.model, result.focus?.[0] ?? "");
  assert.notEqual(made.id, s.mic);
  assert.equal(made.startMs, 60_000);
  assert.equal(made.volumeDb, -6);
  assert.equal(made.fadeInMs, 500);
  assert.equal(made.fadeOutMs, 1000);
  assert.equal(made.name, "Voice");
  assert.deepEqual(clipOf(result.model, s.mic), clipOf(model, s.mic), "the original is untouched");
  assert.deepEqual(validate(result.model).filter((p) => p.severity === "error"), []);
  assert.match(result.message, /^Pasted the clip "Voice" at /);
});

test("pasting where the track has no room goes to another track of the same kind, and says so", () => {
  const s = sample();
  const second = ok(addTrack(s.model, "audio"));
  const copied = copyRows(second.model, [s.mic]);
  const result = ok(pasteCopied(second.model, copied, 1000));
  const newTrack = second.focus?.[0] ?? "";
  assert.equal(clipsOn(result.model, newTrack).length, 1);
  assert.equal(clipsOn(result.model, s.audioTrack).length, 1);
  assert.match(result.message, /went on the Audio 2 track, because its own track had no room there/);
});

test("pasting where nothing has room is refused, changes nothing, and says what is in the way", () => {
  const s = sample();
  const copied = copyRows(s.model, [s.mic]);
  const message = refused(pasteCopied(s.model, copied, 1000));
  assert.match(message, /^Cannot paste "Voice" at /);
  assert.match(message, /It would overlap "Voice" on the Audio track, which runs from 0 seconds to 1 minute\./);
  assert.match(message, /Move the playhead to a free place and paste again\.$/);
});

test("several copied rows keep their distance from each other", () => {
  const s = sample();
  const split = ok(splitAt(s.model, 20_000, s.audioTrack)).model;
  const [a, b] = clipsOn(split, s.audioTrack);
  assert.ok(a !== undefined && b !== undefined);
  const copied = copyRows(split, [b.id, a.id]);
  assert.deepEqual(copied.map((c) => (c.what === "clip" ? c.clip.id : "")), [a.id, b.id], "kept in the order they start");
  const result = ok(pasteCopied(split, copied, 100_000));
  const clips = clipsOn(result.model, s.audioTrack);
  assert.equal(clips.length, 4);
  assert.deepEqual(clips.slice(2).map((c) => c.startMs), [100_000, 120_000]);
  assert.equal(result.focus?.length, 2);
  assert.equal(pastedEndMs(copied, 100_000), 160_000);
});

test("a paste is all or nothing", () => {
  const s = sample();
  const split = ok(splitAt(s.model, 20_000, s.audioTrack)).model;
  const [a, b] = clipsOn(split, s.audioTrack);
  assert.ok(a !== undefined && b !== undefined);
  const copied = copyRows(split, [a.id, b.id]);
  const message = refused(pasteCopied(split, copied, 10_000));
  assert.match(message, /^Nothing was pasted\./);
});

test("overlays may overlap and are pasted on their track; zooms may not and are refused where they would", () => {
  const s = sample();
  const overlay = ok(addTrack(s.model, "overlay"));
  const overlayTrack = overlay.focus?.[0] ?? "";
  const text = ok(addText(overlay.model, overlayTrack, { startMs: 1000, durationMs: 4000, text: "Look here", name: "Label" }));
  const textId = text.focus?.[0] ?? "";
  const pasted = ok(pasteCopied(text.model, copyRows(text.model, [textId]), 2000));
  const newId = pasted.focus?.[0] ?? "";
  const made = findItem(pasted.model, newId);
  assert.equal(made?.item.startMs, 2000);
  assert.equal(made?.item.kind === "text" ? made.item.text : "", "Look here");

  const zoomTrack = ok(addTrack(text.model, "zoom"));
  const zid = zoomTrack.focus?.[0] ?? "";
  const zoom = ok(addZoom(zoomTrack.model, zid, { startMs: 1000, durationMs: 4000, rect: { x: 2500, y: 2500, width: 5000, height: 5000 } }));
  const zoomId = zoom.focus?.[0] ?? "";
  const message = refused(pasteCopied(zoom.model, copyRows(zoom.model, [zoomId]), 2000));
  assert.match(message, /^Cannot paste "Zoom" at /);
  const fine = ok(pasteCopied(zoom.model, copyRows(zoom.model, [zoomId]), 10_000));
  assert.equal(findItem(fine.model, fine.focus?.[0] ?? "")?.track.id, zid);
});

test("a clip and an overlay can be copied together and each goes to its own kind of track", () => {
  const s = sample();
  const overlay = ok(addTrack(s.model, "overlay"));
  const text = ok(addText(overlay.model, overlay.focus?.[0] ?? "", { startMs: 0, durationMs: 3000, text: "Hi" }));
  const copied = copyRows(text.model, [text.focus?.[0] ?? "", s.mic]);
  assert.equal(copied.length, 2);
  const result = ok(pasteCopied(text.model, copied, 70_000));
  assert.equal(result.focus?.length, 2);
  assert.equal(clipsOn(result.model, s.audioTrack).length, 2);
});

test("pasting nothing says to copy first, and a paste is one undo step", () => {
  const s = sample();
  assert.match(refused(pasteCopied(s.model, [], 0)), /Nothing has been copied yet/);
  const h = new History(s.model);
  const copied = copyRows(s.model, [s.mic]);
  const worked = h.run((m) => pasteCopied(m, copied, 60_000));
  assert.ok(worked.ok);
  assert.equal(h.undoLabel, "paste");
  h.undo();
  assert.equal(h.model, s.model, "undo gives back exactly the edit before");
});
