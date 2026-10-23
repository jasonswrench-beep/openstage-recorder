// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { momentFor, stepFor, TILE_PX } from "../src/thumbnails.ts";

test("a picture's moment is rounded to a tidy step so zooming a little can use the same picture again", () => {
  assert.equal(stepFor(100), 250, "never finer than a quarter of a second");
  assert.equal(stepFor(250), 250);
  assert.equal(stepFor(900), 500);
  assert.equal(stepFor(3300), 2000);
  assert.equal(stepFor(70_000), 60_000, "never coarser than a minute");
});

test("the picture for a stretch is taken from its middle, rounded down to a step", () => {
  assert.equal(momentFor(0, 3300), 0, "the middle is 1.65 seconds, in steps of 2 seconds");
  assert.equal(momentFor(4000, 2000), 4000, "the middle is 5 seconds, in steps of 2 seconds");
  assert.equal(momentFor(4000, 2000), momentFor(4900, 2000), "a small scroll uses the same picture");
  assert.equal(momentFor(10_000, 600), 10_000, "the middle is 10.3 seconds, in steps of half a second");
  assert.equal(TILE_PX, 56, "the style sheet says 56 pixels too; change both together");
});
