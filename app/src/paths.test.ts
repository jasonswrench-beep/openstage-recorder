// SPDX-License-Identifier: Apache-2.0
// Tests for saying where a folder is without the person's user name.
import assert from "node:assert/strict";
import { test } from "node:test";
import { hasUserFolder, pathWords } from "./paths.ts";

test("a folder in the user folder is said in words, without the user name", () => {
  assert.equal(pathWords("C:\\Users\\Someone\\Videos\\OpenStage Recorder"), "OpenStage Recorder, in Videos, in your user folder");
  assert.equal(pathWords("c:\\users\\Someone\\Videos\\OpenStage Recorder\\"), "OpenStage Recorder, in Videos, in your user folder", "capitals and a last backslash do not matter");
  assert.equal(pathWords("C:/Users/Someone/Desktop"), "Desktop, in your user folder");
  assert.equal(pathWords("C:\\Users\\Someone"), "your user folder");
  assert.equal(pathWords("/home/someone/Videos"), "Videos, in your user folder");
  assert.ok(!pathWords("C:\\Users\\Someone\\Videos").includes("Someone"));
});

test("a deep folder names its last four folders and says there are more", () => {
  assert.equal(pathWords("C:\\Users\\Someone\\AppData\\Local\\Programs\\OpenStage Recorder\\openstage-capture.exe"),
    "openstage-capture.exe, in OpenStage Recorder, in Programs, in Local, in other folders, in your user folder");
});

test("a folder outside the user folder has no user name in it, so it is shown as it is", () => {
  assert.equal(pathWords("D:\\Recordings"), "D:\\Recordings");
  assert.equal(pathWords("C:\\Program Files\\OpenStage Recorder"), "C:\\Program Files\\OpenStage Recorder");
  assert.equal(hasUserFolder("D:\\Recordings"), false);
  assert.equal(hasUserFolder("C:\\Users\\Someone\\Videos"), true);
});
