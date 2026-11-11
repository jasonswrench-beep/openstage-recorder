// SPDX-License-Identifier: Apache-2.0
// The word in the navy bar, and the keys the Help tab lists.
import { test } from "node:test";
import assert from "node:assert/strict";
import { appStateWords, recordingKeys } from "./shell.ts";
import { SESSION_KEYS } from "./capturecontroller.ts";

test("the bar says what the recorder is doing in words, for every state", () => {
  assert.equal(appStateWords("idle", "idle"), "Ready");
  assert.equal(appStateWords("countdown", "idle"), "Counting down");
  assert.equal(appStateWords("recording", "idle"), "Recording");
  assert.equal(appStateWords("paused", "idle"), "Paused");
  assert.equal(appStateWords("stopping", "idle"), "Finishing");
  assert.equal(appStateWords("finished", "idle"), "Finished");
  assert.equal(appStateWords("failed", "idle"), "Did not finish");
});

test("a quick recording's video is said over the recording's own state, because that is what is awaited", () => {
  assert.equal(appStateWords("finished", "making"), "Making the video");
  assert.equal(appStateWords("finished", "ready"), "Video ready");
  assert.equal(appStateWords("recording", "recording"), "Recording");
});

test("the Help tab lists exactly the keys the recorder listens for while recording", () => {
  assert.deepEqual(recordingKeys().map((k) => k.keys), SESSION_KEYS.map((k) => k.keys));
  assert.deepEqual(recordingKeys().map((k) => k.does), ["Pause or resume", "Stop", "Start again"]);
});

test("the large clock shows hours, minutes and seconds, and never less than nothing", async () => {
  const { clockText } = await import("./shell.ts");
  assert.equal(clockText(0), "00:00:00");
  assert.equal(clockText(154_900), "00:02:34");
  assert.equal(clockText(3_723_000), "01:02:03");
  assert.equal(clockText(-5), "00:00:00");
});
