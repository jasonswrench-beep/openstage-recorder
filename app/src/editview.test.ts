// SPDX-License-Identifier: Apache-2.0
// Tests for the rules of the editing screen that need no page: what is asked before leaving, what is said about unsaved changes, and the first words.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CALLOUTS_OFFERED, closeQuestion, openingWords, stateWords } from "./editview.ts";

test("nothing is asked when nothing would be lost", () => {
  assert.equal(closeQuestion(false, false), null);
  assert.equal(closeQuestion(false, false, "close"), null);
});

test("unsaved changes are asked about, in words for going back and for closing the window", () => {
  assert.equal(closeQuestion(true, false), "There are changes to this edit that are not saved. Leave and lose them?");
  assert.equal(closeQuestion(true, false, "close"), "There are changes to this edit that are not saved. Close the window and lose them?");
});

test("a video that is still being made is asked about, with or without unsaved changes", () => {
  assert.equal(closeQuestion(false, true), "A video is still being made. Stop it and leave?");
  assert.equal(closeQuestion(false, true, "close"), "A video is still being made. Stop it and close the window?");
  assert.match(closeQuestion(true, true) ?? "", /still being made, and there are changes to the edit that are not saved\. Stop the video, lose the changes and leave\?$/);
});

test("the state beside the Save button says one of two plain things", () => {
  assert.equal(stateWords(true), "There are changes that are not saved.");
  assert.equal(stateWords(false), "There are no unsaved changes.");
});

test("the first words say what was opened, how long it is, what it holds, and the first thing that needs a look", () => {
  assert.equal(
    openingWords("Demo", 90_000, "Tracks and clips: 3 clips.", ["Made from take 2."], []),
    "Opened the recording Demo, 1 minute 30 seconds long. Tracks and clips: 3 clips. Made from take 2.",
  );
  assert.match(openingWords("Demo", 5000, "Caption.", [], [{ message: "A clip is too short." }]), /One thing needs a look: A clip is too short\.$/);
  assert.match(openingWords("Demo", 5000, "Caption.", [], [{ message: "A" }, { message: "B" }]), /2 things need a look: A$/);
});

test("only Blur and Cover are offered among the callouts: text, shapes and arrows are not part of this product", () => {
  assert.deepEqual([...CALLOUTS_OFFERED], ["blur", "cover"]);
});
