// SPDX-License-Identifier: Apache-2.0
// The last editing screens: removing a marked stretch, snapping, moving several chosen clips together, and renaming or deleting a track.
import assert from "node:assert/strict";
import { test } from "node:test";
import { COMMANDS, commandFor } from "../src/commands.ts";
import { snapTargets, snapTo } from "../src/snap.ts";
import { EditSession, type ChangeKind } from "../src/session.ts";
import { names, open, row, select } from "./helpers.ts";

/** A key press as far as the command table looks at it (there is no browser here to make a real one). */
function key(init: { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean }): KeyboardEvent {
  return { ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...init } as KeyboardEvent;
}

function idOf(s: EditSession, name: string): string {
  return row(s, name).clipId;
}

// ---- the keys ----

test("I, O, X, Shift+X, Alt+X and N are the keys of the new commands, and no key does two things", () => {
  assert.equal(commandFor(key({ key: "i" }))?.id, "mark-start");
  assert.equal(commandFor(key({ key: "o" }))?.id, "mark-end");
  assert.equal(commandFor(key({ key: "x" }))?.id, "remove-gap");
  assert.equal(commandFor(key({ key: "X", shiftKey: true }))?.id, "remove-close");
  assert.equal(commandFor(key({ key: "x", altKey: true }))?.id, "clear-stretch");
  assert.equal(commandFor(key({ key: "n" }))?.id, "snap");
  assert.equal(commandFor(key({ key: "x", ctrlKey: true })), undefined);
  const written = COMMANDS.map((c) => c.key);
  assert.equal(new Set(written).size, written.length, "each key is written once in the table");
  // Every command that has a key matches exactly itself, for the keys as people write them.
  for (const c of COMMANDS) {
    const parts = c.key.split("+");
    const letter = parts[parts.length - 1] ?? "";
    if (letter.length !== 1) continue;
    const event = key({ key: parts.includes("Shift") ? letter.toUpperCase() : letter.toLowerCase(), shiftKey: parts.includes("Shift"), ctrlKey: parts.includes("Ctrl"), altKey: parts.includes("Alt") });
    assert.equal(COMMANDS.filter((x) => x.match(event)).length, 1, `${c.key} matches one command`);
  }
});

// ---- marking and removing a stretch ----

test("the start and end of a stretch are marked at the playhead, and the sentences say what to do next", () => {
  const s = open("Open the gradebook");
  const heard: ChangeKind[] = [];
  s.subscribe((kind) => heard.push(kind));
  s.setPlayhead(20_000);
  const start = s.markStretchStart();
  assert.equal(start.ok, true);
  assert.match(start.message, /^The start of the stretch is marked at 20 seconds\. Now move the playhead to where the stretch ends and press O\.$/);
  assert.deepEqual(s.stretch, { fromMs: 20_000, toMs: undefined });
  assert.equal(s.stretchReady, false);
  s.setPlayhead(30_000);
  const end = s.markStretchEnd();
  assert.match(end.message, /^The end of the stretch is marked at 30 seconds\. The stretch to remove runs from 20 seconds to 30 seconds, 10 seconds\. X removes it and leaves a gap; Shift\+X removes it and closes the gap; Alt\+X clears the marks\.$/);
  assert.equal(s.stretchReady, true);
  assert.deepEqual(heard.filter((k) => k === "tools"), ["tools", "tools"]);
  assert.equal(s.canUndo, false, "the marks are not part of the edit, so they are not an undo step");
});

test("an end that is not after the start is refused, and a start after the end clears the end", () => {
  const s = open("Open the gradebook");
  s.setPlayhead(20_000);
  s.markStretchStart();
  const same = s.markStretchEnd();
  assert.equal(same.ok, false);
  assert.match(same.message, /has to be after its start, 20 seconds/);
  assert.equal(s.stretch.toMs, undefined);
  s.setPlayhead(30_000);
  s.markStretchEnd();
  s.setPlayhead(40_000);
  const later = s.markStretchStart();
  assert.match(later.message, /The end mark was not after it, so it was cleared\./);
  assert.deepEqual(s.stretch, { fromMs: 40_000, toMs: undefined });
});

test("removing without marks, or with one mark, says what is missing", () => {
  const s = open("Open the gradebook");
  assert.match(s.removeStretch(false).message, /^No stretch is marked\. Move the playhead to where it starts and press I/);
  s.setPlayhead(10_000);
  s.markStretchStart();
  const half = s.removeStretch(true);
  assert.equal(half.ok, false);
  assert.match(half.message, /The end of the stretch is not marked/);
  assert.equal(s.canUndo, false);
});

test("removing a stretch and closing the gap cuts every track, moves later things earlier, and is one undo step", () => {
  const s = open("Open the gradebook");
  s.setPlayhead(20_000);
  s.markStretchStart();
  s.setPlayhead(30_000);
  s.markStretchEnd();
  const before = s.model;
  const result = s.removeStretch(true);
  assert.equal(result.ok, true);
  assert.match(result.message, /^Removed 10 seconds from 20 seconds to 30 seconds on 3 tracks, and moved everything after it earlier to close the gap\./);
  assert.match(result.message, /The marks were cleared and the playhead is at the cut, 20 seconds\.$/);
  assert.equal(row(s, "Open the gradebook").endMs, 20_000);
  assert.equal(row(s, "Add an assignment").startMs, 20_000);
  assert.equal(row(s, "Voice, part 2").startMs, 20_000);
  assert.equal(row(s, "Arrow to the Add button").startMs, 26_000, "an overlay after the stretch goes with the picture");
  assert.equal(row(s, "Zoom on the totals").startMs, 60_000);
  assert.equal(s.lengthMs, 80_000);
  assert.deepEqual(s.stretch, { fromMs: undefined, toMs: undefined });
  assert.equal(s.playheadMs, 20_000);
  assert.equal(s.undoLabel, "remove time");
  s.undo();
  assert.equal(s.model, before, "one undo puts everything back");
  assert.equal(s.canUndo, false);
});

test("removing a stretch can leave the gap instead", () => {
  const s = open("Open the gradebook");
  s.setPlayhead(20_000);
  s.markStretchStart();
  s.setPlayhead(30_000);
  s.markStretchEnd();
  const result = s.removeStretch(false);
  assert.match(result.message, /leaving a gap\./);
  assert.equal(row(s, "Add an assignment").startMs, 30_000);
  assert.equal(row(s, "Arrow to the Add button").startMs, 36_000);
  assert.equal(s.lengthMs, 90_000);
});

test("a stretch that cuts an overlay in two says what happened to the overlays", () => {
  const s = open("Open the gradebook");
  s.setPlayhead(13_000);
  s.markStretchStart();
  s.setPlayhead(15_000);
  s.markStretchEnd();
  const result = s.removeStretch(false);
  assert.match(result.message, / Overlays and zooms: 1 shortened or cut in two\./);
  assert.deepEqual(
    names(s, "Overlays"),
    ["Title: Open Settings", "Title: Open Settings", "Arrow to the Add button"],
    "both pieces keep the name",
  );
});

test("clearing the marks changes nothing in the edit", () => {
  const s = open("Open the gradebook");
  assert.equal(s.clearStretch().message, "No stretch is marked.");
  s.setPlayhead(5000);
  s.markStretchStart();
  const before = s.model;
  assert.equal(s.clearStretch().message, "The marks were cleared. Nothing in the edit was changed.");
  assert.deepEqual(s.stretch, { fromMs: undefined, toMs: undefined });
  assert.equal(s.model, before);
});

test("a stretch cannot be marked or removed while a drag is open", () => {
  const s = open("Check the totals");
  s.beginDrag("move", s.selectedId ?? "");
  assert.equal(s.markStretchStart().ok, false);
  assert.equal(s.clearStretch().ok, false);
  assert.equal(s.removeStretch(true).ok, false);
  s.cancelDrag();
});

// ---- snapping ----

test("snapTo jumps to the nearest edge that is close enough, and to nothing otherwise", () => {
  assert.deepEqual(snapTo({ ms: 94_000, edges: [0], targets: [95_000, 100_000], withinMs: 2000 }), { ms: 95_000, target: 95_000 });
  assert.deepEqual(snapTo({ ms: 94_000, edges: [0], targets: [95_000], withinMs: 500 }), { ms: 94_000, target: undefined });
  assert.deepEqual(snapTo({ ms: 94_000, edges: [0], targets: [95_000], withinMs: 0 }), { ms: 94_000, target: undefined });
  // The far edge of a clip that is moved whole snaps too, and the clip moves so that edge lands there.
  assert.deepEqual(snapTo({ ms: 31_500, edges: [0, 4000], targets: [36_000], withinMs: 1000 }), { ms: 32_000, target: 36_000 });
  // The nearer of two wins; on a tie the earlier time.
  assert.deepEqual(snapTo({ ms: 10_000, edges: [0], targets: [10_400, 9700], withinMs: 1000 }), { ms: 9700, target: 9700 });
  assert.deepEqual(snapTo({ ms: 10_000, edges: [0], targets: [10_300, 9700], withinMs: 1000 }), { ms: 9700, target: 9700 });
});

test("snap targets leave out what is being dragged and say each time once", () => {
  const rows = [
    { clipId: "a", startMs: 0, endMs: 1000 },
    { clipId: "b", startMs: 1000, endMs: 2000 },
  ];
  assert.deepEqual([...snapTargets(rows, new Set(["a"]), [500, undefined, 1000])].sort((x, y) => x - y), [500, 1000, 2000]);
});

test("a mouse drag jumps to the playhead when it comes close, and a line says where", () => {
  const s = open("Check the totals"); // 60 to 90 seconds
  s.setPlayhead(90_000);
  s.setPlayhead(0);
  const id = s.selectedId ?? "";
  s.beginDrag("move", id);
  // Nothing is near 70 seconds except the end of the edit at 90 and the zoom's edges (70 and 78): the zoom starts at 70 seconds.
  assert.equal(s.dragTo(69_600, { snapWithinMs: 1000 }), 70_000);
  assert.equal(s.drag?.snappedTo, 70_000);
  assert.equal(row(s, "Check the totals").startMs, 70_000);
  assert.equal(s.dragTo(75_000, { snapWithinMs: 1000 }), 75_000, "far from anything it goes where the pointer is");
  assert.equal(s.drag?.snappedTo, undefined);
  s.cancelDrag();
});

test("the far end of a clip snaps too", () => {
  const s = open("Title: Open Settings"); // 12 to 16 seconds on Overlays; the arrow starts at 36 seconds
  s.beginDrag("move", s.selectedId ?? "");
  assert.equal(s.dragTo(31_500, { snapWithinMs: 1000 }), 32_000);
  assert.equal(s.drag?.snappedTo, 36_000);
  s.endDrag();
  assert.equal(row(s, "Title: Open Settings").endMs, 36_000);
});

test("the marks of a stretch and the playhead are things to snap to", () => {
  const s = open("Title: Open Settings");
  s.setPlayhead(50_000);
  s.beginDrag("move", s.selectedId ?? "");
  assert.equal(s.dragTo(49_600, { snapWithinMs: 1000 }), 50_000);
  assert.equal(s.drag?.snappedTo, 50_000);
  s.cancelDrag();
  s.setPlayhead(25_000);
  s.markStretchStart();
  s.setPlayhead(0);
  s.beginDrag("move", s.selectedId ?? "");
  assert.equal(s.dragTo(25_300, { snapWithinMs: 1000 }), 25_000);
  s.cancelDrag();
});

test("snapping can be turned off, and the keys never snap", () => {
  const s = open("Title: Open Settings");
  s.setPlayhead(50_000);
  const off = s.toggleSnapping();
  assert.equal(s.snapping, false);
  assert.match(off.message, /^Snapping is off\./);
  s.beginDrag("move", s.selectedId ?? "");
  assert.equal(s.dragTo(49_600, { snapWithinMs: 1000 }), 49_600);
  s.cancelDrag();
  assert.match(s.toggleSnapping().message, /^Snapping is on\./);
  s.beginDrag("move", s.selectedId ?? "", "keys");
  assert.equal(s.dragTo(49_600, { snapWithinMs: 1000 }), 49_600, "a key is an exact step, so it is not pulled anywhere");
  s.cancelDrag();
});

test("a drag that snaps still stops at the limit, and then shows no line", () => {
  const s = open("Check the totals"); // cannot start before 60 seconds, where the clip before it ends
  s.setPlayhead(40_000);
  s.beginDrag("move", s.selectedId ?? "");
  assert.equal(s.dragTo(40_300, { snapWithinMs: 1000 }), 60_000);
  assert.equal(s.drag?.snappedTo, undefined);
  s.cancelDrag();
});

// ---- moving several chosen clips together ----

test("dragging one of several chosen clips moves all of them by the same amount, as one undo step", () => {
  const s = open("Check the totals");
  s.toggleSelected(idOf(s, "Voice, part 3"));
  s.toggleSelected(idOf(s, "Arrow to the Add button"));
  assert.equal(s.selectionCount, 3);
  const before = s.model;
  assert.equal(s.beginDrag("move", idOf(s, "Check the totals")).ok, true);
  assert.equal(s.drag?.ids.length, 3);
  assert.equal(s.dragTo(65_000), 65_000);
  assert.equal(row(s, "Voice, part 3").startMs, 65_000);
  assert.equal(row(s, "Arrow to the Add button").startMs, 41_000);
  assert.equal(s.dragTo(66_500), 66_500);
  const result = s.endDrag();
  assert.equal(result.ok, true);
  assert.match(result.message, /^Moved 3 things 6.5 seconds later\./);
  assert.equal(s.undoLabel, "move together");
  assert.equal(s.selectionCount, 3, "the choice is kept");
  s.undo();
  assert.equal(s.model, before);
  assert.equal(s.canUndo, false);
});

test("a group stops where the first of them would be refused, and one that would be left on its own is moved alone", () => {
  const s = open("Open the gradebook");
  s.toggleSelected(idOf(s, "Check the totals"));
  s.beginDrag("move", idOf(s, "Open the gradebook"));
  // The first clip cannot go later (the second is in the way), nor earlier (it is at the start).
  assert.deepEqual(s.drag?.range, { min: 0, max: 0 });
  assert.equal(s.dragTo(10_000), 0);
  s.cancelDrag();
  // Dragging a clip that is not chosen moves just it.
  select(s, "Open the gradebook");
  s.beginDrag("move", idOf(s, "Title: Open Settings"));
  assert.deepEqual(s.drag?.ids, [idOf(s, "Title: Open Settings")]);
  s.cancelDrag();
});

test("a group drag with the pointer ignores the track under it", () => {
  const s = open("Check the totals");
  s.toggleSelected(idOf(s, "Voice, part 3"));
  s.beginDrag("move", idOf(s, "Check the totals"));
  s.dragTo(62_000);
  const result = s.endDrag({ dropTrackId: "track-2" });
  assert.equal(result.ok, true);
  assert.equal(row(s, "Check the totals").trackName, "Screen", "not moved to the Voice track");
});

test("a group can be moved earlier too, and not before the beginning", () => {
  const s = open("Voice, part 2");
  s.toggleSelected(idOf(s, "Presenter, part 2"));
  s.beginDrag("move", idOf(s, "Voice, part 2"));
  // Part 1 is before each, so they cannot start before 30 seconds.
  assert.equal(s.drag?.range.min, 30_000);
  s.cancelDrag();
});

// ---- tracks ----

test("a track can be renamed, and an empty name is refused", () => {
  const s = open("Open the gradebook");
  const result = s.renameTrack("track-3", "Presenter camera");
  assert.deepEqual([result.ok, result.message], [true, 'The track "Webcam" is now called "Presenter camera".']);
  assert.equal(row(s, "Presenter, part 1").trackName, "Presenter camera");
  assert.equal(s.undoLabel, "rename track");
  const empty = s.renameTrack("track-3", "   ");
  assert.deepEqual([empty.ok, empty.message], [false, "A track needs a name."]);
  s.undo();
  assert.equal(row(s, "Presenter, part 1").trackName, "Webcam");
  assert.equal(s.renameTrack("nope", "x").ok, false);
});

test("an empty track is deleted at once; one with something on it only when the author says so", () => {
  const s = open("Open the gradebook");
  const added = s.addTrack("overlay");
  assert.equal(added.ok, true);
  const emptyId = s.model.tracks.at(-1)?.id ?? "";
  const gone = s.deleteTrack(emptyId, false);
  assert.match(gone.message, /^Deleted the empty track /);
  assert.equal(s.model.tracks.some((t) => t.id === emptyId), false);

  const refused = s.deleteTrack("track-3", false);
  assert.equal(refused.ok, false);
  assert.match(refused.message, /^The track "Webcam" has 3 clips on it\./);
  assert.equal(s.model.tracks.some((t) => t.id === "track-3"), true);

  const before = s.model;
  const withContents = s.deleteTrack("track-3", true);
  assert.deepEqual([withContents.ok, withContents.message.startsWith('Deleted the track "Webcam" and the 3 things on it.')], [true, true]);
  assert.deepEqual(names(s, "Webcam"), []);
  s.undo();
  assert.equal(s.model, before, "one undo brings the track and what was on it back");
});

test("deleting the track the choice is on moves the choice to a row that is left", () => {
  const s = open("Presenter, part 2");
  const result = s.deleteTrack("track-3", true);
  assert.equal(result.ok, true);
  assert.notEqual(s.selectedId, undefined);
  assert.ok(s.rows.some((r) => r.clipId === s.selectedId));
  assert.match(result.message, /Selected /);
});
