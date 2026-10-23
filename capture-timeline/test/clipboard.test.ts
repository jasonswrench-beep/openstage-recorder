// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import { EditSession } from "../src/session.ts";
import { commandFor } from "../src/commands.ts";
import { solo } from "./helpers.ts";

/** A key press as far as the command table looks at it (there is no browser here to make a real one). */
function key(init: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }): KeyboardEvent {
  return { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...init } as KeyboardEvent;
}

test("paste before anything is copied says to copy first", () => {
  const s = new EditSession(solo());
  const result = s.paste();
  assert.equal(result.ok, false);
  assert.match(result.message, /Nothing has been copied yet/);
  assert.equal(s.canPaste, false);
});

test("copy says what was copied and changes nothing; paste puts a copy at the playhead, chooses it and moves the playhead to its end", () => {
  const s = new EditSession(solo());
  const model = s.model;
  const copied = s.copySelected();
  assert.equal(copied.ok, true);
  assert.match(copied.message, /^Copied "Only clip", 10 seconds long\./);
  assert.equal(s.model, model);
  assert.equal(s.canUndo, false);
  assert.equal(s.canPaste, true);

  s.setPlayhead(10_000);
  const pasted = s.paste();
  assert.equal(pasted.ok, true, pasted.message);
  assert.match(pasted.message, /^Pasted the clip "Only clip" at 10 seconds\./);
  assert.match(pasted.message, /The playhead is now at 20 seconds/);
  assert.equal(s.rows.length, 2);
  assert.equal(s.playheadMs, 20_000);
  assert.equal(s.selectionCount, 1);
  assert.equal(s.selectedRow?.startMs, 10_000, "the pasted copy is the one chosen");

  // pasting again lays another copy right after the last one
  const again = s.paste();
  assert.equal(again.ok, true, again.message);
  assert.deepEqual(s.rows.map((r) => r.startMs), [0, 10_000, 20_000]);
});

test("a paste is one undo step, and undo and redo bring it back", () => {
  const s = new EditSession(solo());
  const before = s.model;
  s.copySelected();
  s.setPlayhead(10_000);
  s.paste();
  assert.equal(s.canUndo, true);
  assert.equal(s.undoLabel, "paste");
  s.undo();
  assert.equal(s.model, before);
  s.redo();
  assert.equal(s.rows.length, 2);
});

test("pasting where there is no room is refused with the reason, and the edit and the playhead stay", () => {
  const s = new EditSession(solo());
  s.copySelected();
  s.setPlayhead(2000);
  const before = s.model;
  const result = s.paste();
  assert.equal(result.ok, false);
  assert.match(result.message, /^Cannot paste "Only clip" at 2 seconds\. It would overlap "Only clip"/);
  assert.equal(s.model, before);
  assert.equal(s.playheadMs, 2000);
});

test("Ctrl+C and Ctrl+V are the keys, and a plain C or V is not", () => {
  assert.equal(commandFor(key({ key: "c", ctrlKey: true }))?.id, "copy");
  assert.equal(commandFor(key({ key: "v", ctrlKey: true }))?.id, "paste");
  assert.equal(commandFor(key({ key: "C", metaKey: true }))?.id, "copy");
  assert.equal(commandFor(key({ key: "c" })), undefined);
  assert.equal(commandFor(key({ key: "v", ctrlKey: true, shiftKey: true })), undefined);
});
