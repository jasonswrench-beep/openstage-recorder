// SPDX-License-Identifier: Apache-2.0
// The pretend recorder, driven by the real controller, so the screens can be trusted to behave in a browser as they do with the real program.
import assert from "node:assert/strict";
import { test } from "node:test";
import { parseFinding } from "./capturecheck.ts";
import { RecorderController, runOneShot } from "./capturecontroller.ts";
import { defaultSettings, parseProbe, parseWindow, recordingPath, type RecordSettings, type Session } from "./capturesession.ts";
import { recordingFolder } from "./recordingfolder.ts";
import { makePreviewBackend } from "./standin.ts";
import { readProject } from "../../capture-timeline/src/project.ts";

const SPEED = 100;
const LIBRARY = "C:\\Users\\You\\Videos\\OpenStage Recorder";
const practice = (): RecordSettings => ({ ...defaultSettings(), name: "Demo", practice: true, countdownSeconds: 0 });

async function until(what: string, ok: () => boolean): Promise<void> {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (ok()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`timed out waiting for ${what}`);
}

test("a practice recording goes through its states, is listed afterwards, and opens as an edit of its take", async () => {
  const b = makePreviewBackend({ speed: SPEED });
  const c = new RecorderController(b);
  const seen: string[] = [];
  c.subscribe((s: Session) => { if (seen[seen.length - 1] !== s.phase) seen.push(s.phase); });
  assert.equal(await c.start(practice(), recordingPath(LIBRARY, "Demo")), null);
  await until("recording", () => c.session.phase === "recording");
  await c.act("pause");
  await until("paused", () => c.session.phase === "paused");
  await c.togglePause();
  await until("recording again", () => c.session.phase === "recording");
  await c.marker("here");
  await until("a marker", () => c.session.markers.length === 1);
  await until("some time recorded", () => c.session.elapsedMs >= 2000);
  await c.act("stop");
  await until("finished", () => c.session.phase === "finished");
  assert.deepEqual(seen, ["starting", "recording", "paused", "recording", "stopping", "finished"]);
  assert.equal(c.session.markers[0]?.label, "here");
  assert.deepEqual(await b.listRecordings(LIBRARY), ["Demo.capture"]);
  const opened = await readProject(recordingFolder(b, LIBRARY, "Demo.capture"));
  assert.equal(opened.ok, true, opened.ok ? "" : opened.message);
  if (opened.ok) {
    assert.equal(opened.project.title, "Demo");
    assert.ok(opened.project.model.tracks.some((t) => t.clips.length > 0), "the take is laid out as clips");
  }
});

test("starting again sets the take aside and the next one is recorded; both are kept", async () => {
  const b = makePreviewBackend({ speed: SPEED });
  const c = new RecorderController(b);
  await c.start(practice(), recordingPath(LIBRARY, "Two takes"));
  await until("recording", () => c.session.phase === "recording");
  await until("some time recorded", () => c.session.elapsedMs >= 1000);
  await c.act("restart");
  await until("take 2", () => c.session.take === 2 && c.session.phase === "recording");
  await until("some time recorded in take 2", () => c.session.elapsedMs >= 1000);
  assert.equal(c.session.setAside, 1);
  await c.act("stop");
  await until("finished", () => c.session.phase === "finished");
  assert.equal(await b.recordingRead(LIBRARY, "Two takes.capture", "takes/take-001/take.json").then((t) => JSON.parse(t ?? "{}").state), "setAside");
  assert.equal(await b.recordingRead(LIBRARY, "Two takes.capture", "takes/take-002/take.json").then((t) => JSON.parse(t ?? "{}").state), "complete");
  assert.deepEqual(await b.recordingFolders(LIBRARY, "Two takes.capture", "takes"), ["take-001", "take-002"]);
});

test("a second recording cannot start while one is going, and says so in words the controller knows", async () => {
  const b = makePreviewBackend({ speed: SPEED });
  await b.streamStart(["record", "--project", "X\\a.capture"]);
  await assert.rejects(b.streamStart(["probe"]), /already in progress/);
  assert.equal((await b.streamState()).running, true);
  assert.equal(await b.streamStop(), true);
  assert.equal(await b.streamStop(), false, "nothing to stop now");
});

test("the list of sources, the windows and the check are in the shapes the screens read", async () => {
  const b = makePreviewBackend({ speed: SPEED });
  const sources = (await runOneShot(b, ["probe"])).lines.flatMap(parseProbe);
  assert.ok(sources.some((s) => s.kind === "display" && s.number === 2));
  assert.ok(sources.some((s) => s.kind === "camera"));
  assert.ok(sources.find((s) => s.kind === "microphone")?.isDefault);
  const windows = (await runOneShot(b, ["windows"])).lines.map(parseWindow).filter((w) => w !== null);
  assert.equal(windows.length, 3);
  assert.ok(windows.every((w) => w.title !== ""));
  const check = await runOneShot(b, ["setup-check", "--dir", LIBRARY]);
  const findings = check.lines.map(parseFinding).filter((f) => f !== null);
  assert.ok(findings.length >= 8 && findings.every((f) => f.ok));
  assert.equal(check.exit?.code, 0);
});

test("making a video reports its progress and what it made", async () => {
  const b = makePreviewBackend({ speed: SPEED });
  const job = await runOneShot(b, ["render", "--project", `${LIBRARY}\\Demo.capture`, "--out", `${LIBRARY}\\Demo.capture\\exports\\Demo.mp4`]);
  assert.equal(job.exit?.code, 0);
  assert.ok(job.lines.some((l) => l.includes('"progress"')));
  assert.ok(job.lines.some((l) => l.includes('"check":"export"')));
});

test("a recorder that is not installed is said so, and starting it fails politely", async () => {
  const b = makePreviewBackend({ speed: SPEED });
  b.controls.recorderMissing = true;
  const where = await b.captureCheck();
  assert.equal(where.ok, false);
  const c = new RecorderController(b);
  await c.start(practice(), recordingPath(LIBRARY, "Nope"));
  await until("failed", () => c.session.phase === "failed");
  assert.match(c.session.problem, /not found/);
});

test("the edit of a recording can be saved and read back", async () => {
  const b = makePreviewBackend({ speed: SPEED });
  const c = new RecorderController(b);
  await c.start(practice(), recordingPath(LIBRARY, "Edit me"));
  await until("recording", () => c.session.phase === "recording");
  await c.act("stop");
  await until("finished", () => c.session.phase === "finished");
  assert.equal(await b.recordingRead(LIBRARY, "Edit me.capture", "edit.json"), undefined);
  await b.recordingWriteEdit(LIBRARY, "Edit me.capture", '{"x":1}');
  assert.equal(await b.recordingRead(LIBRARY, "Edit me.capture", "edit.json"), '{"x":1}');
});
