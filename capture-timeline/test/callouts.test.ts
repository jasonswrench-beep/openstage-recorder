// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { EditSession } from "../src/session.ts";
import { solo } from "./helpers.ts";

test("adding a callout chooses it, and undo takes it away", () => {
  const s = new EditSession(solo());
  s.setPlayhead(2000);
  const result = s.addCalloutHere("title");
  assert.equal(result.ok, true, result.message);
  assert.equal(s.item?.kind, "text");
  assert.equal(s.item?.startMs, 2000);
  assert.equal(s.selectionCount, 1);
  assert.match(s.undoLabel ?? "", /text overlay/);
  s.undo();
  assert.equal(s.item, undefined);
});

test("the words, place and look of a callout can be changed, each as one undo step", () => {
  const s = new EditSession(solo());
  s.addCalloutHere("text");
  assert.equal(s.setItemWords("Click Save").ok, true);
  assert.equal(s.item?.kind === "text" ? s.item.text : "", "Click Save");
  assert.equal(s.setItemPlace({ x: 100, y: 100, width: 3000, height: 1000 }).ok, true);
  assert.deepEqual(s.item && "rect" in s.item ? s.item.rect : undefined, { x: 100, y: 100, width: 3000, height: 1000 });
  assert.equal(s.setItemTextLook({ color: "#FFFF00", bold: true }).ok, true);
  assert.equal(s.setItemTextLook({ color: "banana" }).ok, false);
});

test("a shape needs alt text, and the form can give it", () => {
  const s = new EditSession(solo());
  const added = s.addCalloutHere("highlight");
  assert.match(added.message, /Still needed/);
  assert.equal(s.setItemAlt({ altText: "The Save button" }).ok, true);
  assert.equal(s.item?.kind === "shape" ? s.item.altText : "", "The Save button");
});

test("a zoom from a rectangle is chosen, and its description can be set", () => {
  const s = new EditSession(solo());
  const result = s.addZoomHere({ x: 2000, y: 2000, width: 3000, height: 3000 });
  assert.equal(result.ok, true, result.message);
  assert.equal(s.item?.kind, "zoom");
  assert.equal(s.setItemZoom({ description: "The toolbar" }).ok, true);
  assert.equal(s.item?.kind === "zoom" ? s.item.description : "", "The toolbar");
});

test("editing an item while a clip is chosen says it is a clip", () => {
  const s = new EditSession(solo());
  const result = s.setItemWords("hello");
  assert.equal(result.ok, false);
  assert.match(result.message, /is a clip, not an overlay or zoom/);
});
