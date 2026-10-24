// SPDX-License-Identifier: Apache-2.0
// Tests for reaching a recording in the recordings folder through the shell, as the editing screens want it.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readProject } from "../../capture-timeline/src/project.ts";
import { recordingFolder, recordingNameOf, TAKE_MEDIA, type RecordingBackend } from "./recordingfolder.ts";

class Fake implements RecordingBackend {
  files: Record<string, string> = {};
  folders: Record<string, string[]> = {};
  written: string[] = [];
  kept: [string, string][] = [];
  asked: string[] = [];
  fail = false;
  async recordingRead(dir: string, name: string, rel: string): Promise<string | undefined> {
    this.asked.push(`read ${dir} ${name} ${rel}`);
    if (this.fail) throw new Error("refused");
    return this.files[rel];
  }
  async recordingFolders(dir: string, name: string, rel: string): Promise<string[]> {
    this.asked.push(`folders ${dir} ${name} ${rel}`);
    if (this.fail) throw new Error("refused");
    return this.folders[rel] ?? [];
  }
  async recordingWriteEdit(_dir: string, _name: string, text: string): Promise<void> {
    if (this.fail) throw new Error("refused");
    this.written.push(text);
  }
  async recordingKeepEdit(_dir: string, _name: string, file: string, text: string): Promise<void> {
    if (this.fail) throw new Error("refused");
    this.kept.push([file, text]);
  }
  async recordingMediaUrl(_dir: string, _name: string, rel: string): Promise<string> {
    if (this.fail) throw new Error("refused");
    return `asset://localhost/${rel}`;
  }
}

test("a recording is read, listed and written through the recordings folder and the recording's name", async () => {
  const fake = new Fake();
  fake.files["capture.json"] = "{}";
  fake.folders["takes"] = ["take-001"];
  const f = recordingFolder(fake, "D:/recordings", "Demo.capture");
  assert.deepEqual([f.name, f.canWrite], ["Demo.capture", true]);
  assert.equal(await f.readText("capture.json"), "{}");
  assert.equal(await f.readText("edit.json"), undefined);
  assert.deepEqual(await f.listFolders("takes"), ["take-001"]);
  assert.equal(await f.writeText("edit.json", "{\"a\":1}"), true);
  assert.deepEqual(fake.written, ["{\"a\":1}"]);
  assert.ok(fake.asked.every((a) => a.includes("D:/recordings Demo.capture")), "every question names the recordings folder and the recording, never a path");
});

test("only edit.json and the kept copy of an older edit can be written, and only the media of a take can be played", async () => {
  const fake = new Fake();
  const f = recordingFolder(fake, "D:/recordings", "Demo.capture");
  for (const path of ["capture.json", "takes/take-001/take.json", "../edit.json", "edit.json/x", "Edit.json", "", "edit-before-take-.json", "edit-before-take-12345.json", "../edit-before-take-1.json", "edit-before-take-1.json.tmp", "Edit-before-take-1.json"]) {
    assert.equal(await f.writeText(path, "{}"), false, path);
  }
  assert.deepEqual(fake.written, []);
  assert.deepEqual(fake.kept, []);
  assert.equal(await f.writeText("edit-before-take-2.json", "{\"old\":1}"), true);
  assert.deepEqual(fake.kept, [["edit-before-take-2.json", "{\"old\":1}"]], "the kept copy goes to its own call, never to edit.json");
  assert.deepEqual(fake.written, []);
  assert.equal(await f.mediaUrl("takes/take-001/screen.mp4"), "asset://localhost/takes/take-001/screen.mp4");
  assert.equal(await f.mediaUrl("takes/take-12/mic.wav"), "asset://localhost/takes/take-12/mic.wav");
  for (const path of ["capture.json", "takes/take-001", "takes/take-001/sub/x.mp4", "takes/../x.mp4", "takes/take-001/..\\x.mp4", "edit.json", "takes/take-x/a.mp4"]) {
    assert.equal(await f.mediaUrl(path), undefined, path);
  }
  assert.ok(TAKE_MEDIA.test("takes/take-001/webcam.mp4"));
});

test("a refusal from the shell is the same as there being nothing there", async () => {
  const fake = new Fake();
  fake.fail = true;
  const f = recordingFolder(fake, "D:/recordings", "Demo.capture");
  assert.equal(await f.readText("capture.json"), undefined);
  assert.deepEqual(await f.listFolders("takes"), []);
  assert.equal(await f.mediaUrl("takes/take-001/screen.mp4"), undefined);
  assert.equal(await f.writeText("edit.json", "{}"), false);
  assert.doesNotThrow(() => f.release());
});

test("the editing screens can open a recording through it, and say plainly when there is none", async () => {
  const fake = new Fake();
  fake.files["capture.json"] = JSON.stringify({ format: "openstage-capture-project", title: "Demo" });
  fake.folders["takes"] = ["take-001"];
  fake.files["takes/take-001/take.json"] = JSON.stringify({ id: 1, state: "complete", durationMs: 5000, media: [{ file: "screen.mp4", kind: "screen" }, { file: "mic.wav", kind: "microphone" }] });
  const opened = await readProject(recordingFolder(fake, "D:/recordings", "Demo.capture"));
  assert.equal(opened.ok, true);
  if (opened.ok) {
    assert.equal(opened.project.title, "Demo");
    assert.equal(opened.project.fromEditFile, false, "a first edit is made from the takes");
  }
  const none = await readProject(recordingFolder(new Fake(), "D:/recordings", "Nothing.capture"));
  assert.equal(none.ok, false);
  if (!none.ok) assert.match(none.message, /capture\.json/);
});

test("a recording's name is the last part of the folder the recorder reported", () => {
  assert.equal(recordingNameOf("D:/recordings/Week 3.capture"), "Week 3.capture");
  assert.equal(recordingNameOf("D:\\recordings\\Week 3.capture\\"), "Week 3.capture");
  assert.equal(recordingNameOf(""), "");
});
