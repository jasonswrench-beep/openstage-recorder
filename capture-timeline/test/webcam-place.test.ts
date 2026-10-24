// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { findClip } from "../../capture-edit/src/index.ts";
import { WEBCAM_SIZES, WEBCAM_WHERES, webcamChoice, webcamRect } from "../src/webcam-place.ts";
import { open, row, select } from "./helpers.ts";

// ---- the choices and the rectangles they mean ----

test("the default choice (bottom right, medium) is no placement at all, so the clip keeps the default's behaviour", () => {
  assert.equal(webcamRect("bottom-right", "medium"), null);
  assert.deepEqual(webcamChoice(undefined), { where: "bottom-right", size: "medium" });
});

test("filling the picture is the whole frame, whatever the size says", () => {
  for (const { value: size } of WEBCAM_SIZES) assert.deepEqual(webcamRect("fill", size), { x: 0, y: 0, width: 10_000, height: 10_000 });
  assert.deepEqual(webcamChoice({ x: 0, y: 0, width: 10_000, height: 10_000 }), { where: "fill", size: "medium" });
});

test("every corner and size is a square share of the picture, inside the picture, and is read back as the same choice", () => {
  for (const { value: where } of WEBCAM_WHERES) {
    for (const { value: size } of WEBCAM_SIZES) {
      const rect = webcamRect(where, size);
      if (rect === null) continue;
      assert.ok(rect.x >= 0 && rect.y >= 0, `${where} ${size} starts inside`);
      assert.ok(rect.x + rect.width <= 10_000 && rect.y + rect.height <= 10_000, `${where} ${size} ends inside`);
      if (where !== "fill") assert.equal(rect.width, rect.height, `${where} ${size} keeps its shape`);
      const back = webcamChoice(rect);
      assert.equal(back.where, where);
      if (where !== "fill") assert.equal(back.size, size);
    }
  }
});

test("the corners are on the sides they say", () => {
  const left = webcamRect("top-left", "small");
  const right = webcamRect("top-right", "small");
  const bottom = webcamRect("bottom-left", "small");
  assert.ok(left !== null && right !== null && bottom !== null);
  assert.ok(left.x < right.x, "left is left of right");
  assert.ok(left.y < bottom.y, "top is above bottom");
  assert.equal(left.y, right.y);
});

test("a place that is none of the choices is read back as custom", () => {
  assert.deepEqual(webcamChoice({ x: 1234, y: 4321, width: 2000, height: 1500 }), { where: "custom", size: "custom" });
});

// ---- the session ----

test("the form offers the webcam boxes for a webcam clip, and for nothing else", () => {
  const s = open("Presenter, part 1");
  assert.deepEqual(s.details?.webcam, { where: "bottom-right", size: "medium" });
  select(s, "Open the gradebook");
  assert.equal(s.details?.webcam, undefined);
  select(s, "Voice, part 1");
  assert.equal(s.details?.webcam, undefined);
});

test("choosing a corner and a size sets the place, says so, and one command is one undo step", () => {
  const s = open("Presenter, part 1");
  const id = row(s, "Presenter, part 1").clipId;
  const done = s.setWebcamPlace("top-left", "large");
  assert.equal(done.ok, true);
  assert.deepEqual(s.details?.webcam, { where: "top-left", size: "large" });
  assert.deepEqual(findClip(s.model, id)?.clip.placement, webcamRect("top-left", "large"));
  assert.equal(s.undo().ok, true);
  assert.deepEqual(s.details?.webcam, { where: "bottom-right", size: "medium" });
  assert.equal(findClip(s.model, id)?.clip.placement, undefined);
});

test("choosing the default again takes the place away", () => {
  const s = open("Presenter, part 1");
  const id = row(s, "Presenter, part 1").clipId;
  assert.equal(s.setWebcamPlace("bottom-left", "small").ok, true);
  assert.equal(s.setWebcamPlace("bottom-right", "medium").ok, true);
  assert.equal(findClip(s.model, id)?.clip.placement, undefined);
});

test("a screen clip, a sound clip and several chosen rows get a sentence instead", () => {
  const screen = open("Open the gradebook");
  const refused = screen.setWebcamPlace("top-left", "small");
  assert.equal(refused.ok, false);
  assert.match(refused.message, /not a webcam recording/);
  const sound = open("Voice, part 1");
  assert.equal(sound.setWebcamPlace("top-left", "small").ok, false);
  const overlay = open();
  select(overlay, "Zoom on the totals");
  assert.equal(overlay.setWebcamPlace("top-left", "small").ok, false);
});

test("a choice that is not one of the choices is refused and changes nothing", () => {
  const s = open("Presenter, part 1");
  const before = s.model;
  const refused = s.setWebcamPlace("middle", "small");
  assert.equal(refused.ok, false);
  assert.match(refused.message, /not one of the choices/);
  assert.equal(s.setWebcamPlace("top-left", "huge").ok, false);
  assert.equal(s.model, before);
  assert.equal(s.canUndo, false);
});
