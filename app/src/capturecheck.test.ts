// SPDX-License-Identifier: Apache-2.0
// Tests for reading the screen recorder's setup check and saying how it went.
import assert from "node:assert/strict";
import { test } from "node:test";
import { CHECK_LIMIT_MS, checkArguments, labelFor, parseFinding, summarise, type Finding } from "./capturecheck.ts";
import type { StreamExit } from "./recorder.ts";

const done = (over: Partial<StreamExit> = {}): StreamExit => ({ code: 0, killed: false, stderr_tail: "", ...over });
const finding = (check: string, ok = true, message = "Fine."): Finding => ({ check, label: labelFor(check), ok, message });

test("a finding is read from the line the recorder prints", () => {
  const f = parseFinding('{"event":"check","check":"video-encoder","ok":true,"message":" An H.264 video encoder was found. "}');
  assert.deepEqual(f, { check: "video-encoder", label: "Video encoder", ok: true, message: "An H.264 video encoder was found." });
  const bad = parseFinding('{"event":"check","check":"disk-space","ok":false,"message":"Only 1 GB is free."}');
  assert.equal(bad?.ok, false);
  assert.equal(bad?.label, "Space on the disk");
});

test("every check the recorder names has words a person understands, and a new one is still shown", () => {
  for (const c of ["windows-version", "screen-capture", "displays", "video-encoder", "sound-encoder", "microphone", "sound-output", "microphone-access", "camera", "camera-access", "disk-space"]) {
    assert.ok(!labelFor(c).includes("-"), c);
    assert.match(labelFor(c), /^[A-Z]/, `${c} starts with a capital letter`);
  }
  assert.equal(labelFor("gpu-memory"), "Gpu memory");
  assert.equal(labelFor("x"), "X");
  assert.equal(labelFor("--"), "Check");
});

test("a line that is not a finding is ignored, whatever it is", () => {
  for (const line of [
    "", "nonsense", "null", "[1]", "5", '"check"',
    '{"event":"hello","protocol":1}',
    '{"event":"result","ok":true}',
    '{"event":"check","ok":true,"message":"no name"}',
    '{"event":"check","check":"","ok":true,"message":"empty name"}',
    '{"event":"check","check":"x","ok":"yes","message":"not a true or false"}',
    '{"event":"check","check":5,"ok":true,"message":"name is a number"}',
    '{"check":"x","ok":true,"message":"no event"}',
  ]) {
    assert.equal(parseFinding(line), null, line);
  }
});

test("a finding with no words, or far too many, is still safe to show", () => {
  assert.equal(parseFinding('{"event":"check","check":"camera","ok":true}')?.message, "The recorder gave no details.");
  assert.equal(parseFinding('{"event":"check","check":"camera","ok":true,"message":"   "}')?.message, "The recorder gave no details.");
  assert.equal(parseFinding(JSON.stringify({ event: "check", check: "camera", ok: true, message: "x".repeat(5000) }))?.message.length, 1500);
  assert.equal(parseFinding(JSON.stringify({ event: "check", check: "c".repeat(500), ok: true, message: "m" }))?.check.length, 80);
});

test("a computer with nothing wrong is ready", () => {
  const s = summarise([finding("windows-version"), finding("screen-capture"), finding("disk-space")], done());
  assert.equal(s.ready, true);
  assert.equal(s.sentence, "This computer is ready to record. All 3 checks passed.");
  assert.equal(summarise([finding("camera")], done()).sentence, "This computer is ready to record. All 1 check passed.");
});

test("a problem is named and counted, with the checks that passed not blamed", () => {
  const s = summarise([finding("windows-version"), finding("video-encoder", false, "No encoder."), finding("microphone-access", false, "Blocked."), finding("camera")], done({ code: 1 }));
  assert.equal(s.ready, false);
  assert.equal(s.sentence, "2 checks found a problem out of 4: Video encoder, Permission to use the microphone. Each is explained below.");
  assert.equal(summarise([finding("disk-space", false)], done({ code: 1 })).sentence, "1 check found a problem out of 1: Space on the disk. Each is explained below.");
});

test("a check that ended badly is never called ready, even with no problem listed", () => {
  const all = [finding("windows-version"), finding("screen-capture")];
  assert.equal(summarise(all, done({ code: 1 })).ready, false);
  assert.match(summarise(all, done({ code: 1 })).sentence, /ended with an error/);
  assert.match(summarise(all, done({ code: null })).sentence, /did not finish/);
  assert.match(summarise(all, done({ killed: true })).sentence, /did not finish/);
  assert.match(summarise([], done({ code: 0 })).sentence, /without saying anything/);
  assert.equal(summarise([], done({ code: 0 })).ready, false);
});

test("a computer that is not running Windows, and a recorder that would not start, are said plainly", () => {
  assert.equal(summarise([], done({ code: 2 })).sentence, "Recording works on Windows only, so this computer cannot record with OpenStage Recorder.");
  assert.equal(summarise([], null).sentence, "The check could not be started.");
  assert.equal(summarise([finding("x")], null).ready, false);
});

test("the recorder is asked only for its setup check, with the folder when there is one", () => {
  assert.deepEqual(checkArguments(null), ["setup-check"]);
  assert.deepEqual(checkArguments("D:/Courses/Safety"), ["setup-check", "--dir", "D:/Courses/Safety"]);
  assert.ok(CHECK_LIMIT_MS >= 30_000 && CHECK_LIMIT_MS <= 120_000, "long enough for a slow computer, short enough that a stuck check is stopped");
});
