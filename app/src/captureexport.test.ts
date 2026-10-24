// SPDX-License-Identifier: Apache-2.0
// Tests for making a video from an edit: the options, what the recorder's lines mean while it works, and how it went.
import assert from "node:assert/strict";
import { test } from "node:test";
import { NO_CAPTIONS, applyExportLine, exportPlan, finishedWords, initialExport, summariseExport, type ExportState } from "./captureexport.ts";
import type { StreamExit } from "./recorder.ts";

const line = (event: Record<string, unknown>): string => JSON.stringify(event);
const exit = (over: Partial<StreamExit> = {}): StreamExit => ({ code: 0, killed: false, stderr_tail: "", ...over });

const play = (lines: string[]): { state: ExportState; said: string[] } => {
  let state = initialExport();
  const said: string[] = [];
  for (const l of lines) {
    const u = applyExportLine(state, l);
    state = u.state;
    said.push(...u.say);
  }
  return { state, said };
};

test("the video is written in the recording's exports folder, and the exporter is told nothing about courses", () => {
  const p = exportPlan("D:\\Videos\\OpenStage Recorder", "Week 3 demo.capture");
  assert.equal(p.out, "D:\\Videos\\OpenStage Recorder\\Week 3 demo.capture\\exports\\Week 3 demo.mp4");
  assert.equal(p.rel, "exports/Week 3 demo.mp4", "the place inside the recording, for showing it");
  assert.deepEqual(p.args, ["render", "--project", "D:\\Videos\\OpenStage Recorder\\Week 3 demo.capture", "--out", p.out]);
  const q = exportPlan("/home/me/recordings/", "Demo.capture");
  assert.equal(q.out, "/home/me/recordings/Demo.capture/exports/Demo.mp4");
  assert.equal(q.args.includes("--assets"), false, "there is no course folder of assets");
  assert.ok(p.out.endsWith(".mp4"), "the recorder needs the name to end in .mp4");
});

test("cuts instead of animated zooms are asked for only when the author chooses them", () => {
  assert.ok(!exportPlan("D:/c", "Demo.capture").args.includes("--reduce-motion"));
  assert.ok(!exportPlan("D:/c", "Demo.capture", { reduceMotion: false }).args.includes("--reduce-motion"));
  const p = exportPlan("D:/c", "Demo.capture", { reduceMotion: true });
  assert.equal(p.args[p.args.length - 1], "--reduce-motion");
  assert.deepEqual(p.args.slice(0, 5), exportPlan("D:/c", "Demo.capture").args.slice(0, 5), "everything else is the same");
});

test("an export is followed from its first line to the video it made, and what is said is the progress and the result", () => {
  const { state, said } = play([
    line({ event: "hello", protocol: "0.1" }),
    line({ event: "check", check: "edit", ok: true, message: "Exporting the edit in Demo.capture/edit.json, 6.0 seconds long." }),
    line({ event: "progress", task: "export", percent: 10, message: "Exporting: 10 percent (18 of 180 pictures)." }),
    line({ event: "progress", task: "export", percent: 50, message: "Exporting: 50 percent (90 of 180 pictures)." }),
    line({ event: "check", check: "export", ok: true, message: "Exported 6.0 seconds of video, 180 pictures at 640 by 360 pixels, with sound: x.mp4" }),
    line({ event: "check", check: "video-readback", ok: true, message: "Windows read the saved video back: 6.0 seconds long." }),
    line({ event: "check", check: "video-size", ok: true, message: "The saved video is 640 by 360 pixels." }),
  ]);
  assert.equal(state.made, true);
  assert.equal(state.percent, 100);
  assert.equal(state.madeMessage, "Exported 6.0 seconds of video, 180 pictures at 640 by 360 pixels, with sound: x.mp4");
  assert.equal(state.notes.length, 4, "the checks are kept as notes; progress is not");
  assert.deepEqual(said, [
    "Exporting the edit in Demo.capture/edit.json, 6.0 seconds long.",
    "Exporting: 10 percent (18 of 180 pictures).",
    "Exporting: 50 percent (90 of 180 pictures).",
    "Exported 6.0 seconds of video, 180 pictures at 640 by 360 pixels, with sound: x.mp4",
  ]);
  assert.deepEqual(summariseExport(state, exit()), { ok: true, sentence: "The video was made. Exported 6.0 seconds of video, 180 pictures at 640 by 360 pixels, with sound: x.mp4" });
});

test("a refused export says what is missing, in the recorder's words", () => {
  const { state, said } = play([
    line({ event: "check", check: "edit", ok: false, message: "This edit is not ready: the text overlay Welcome has no description for a screen reader." }),
  ]);
  assert.equal(state.problem, "This edit is not ready: the text overlay Welcome has no description for a screen reader.");
  assert.deepEqual(said, ["Problem. This edit is not ready: the text overlay Welcome has no description for a screen reader."]);
  const s = summariseExport(state, exit({ code: 1 }));
  assert.equal(s.ok, false);
  assert.equal(s.sentence, "The video could not be made. This edit is not ready: the text overlay Welcome has no description for a screen reader.");
});

test("a failed export or a sound file it could not read is a problem, never a video", () => {
  const { state } = play([
    line({ event: "check", check: "edit", ok: true, message: "Exporting." }),
    line({ event: "check", check: "export", ok: false, message: "The sound file mic.wav could not be opened." }),
  ]);
  assert.equal(state.made, false);
  assert.equal(summariseExport(state, exit({ code: 1 })).sentence, "The video could not be made. The sound file mic.wav could not be opened.");
  const fromError = play([line({ event: "error", code: "x", message: "The disk is full." })]);
  assert.equal(summariseExport(fromError.state, exit({ code: 1 })).sentence, "The video could not be made. The disk is full.");
  assert.equal(summariseExport(initialExport(), exit({ code: 1 })).sentence, "The video could not be made.");
});

test("a video that was made but did not read back right is not called good", () => {
  const { state } = play([
    line({ event: "check", check: "export", ok: true, message: "Exported 6.0 seconds." }),
    line({ event: "check", check: "video-readback", ok: false, message: "The video is 2 seconds shorter than it should be." }),
  ]);
  const s = summariseExport(state, exit());
  assert.equal(s.ok, false);
  assert.match(s.sentence, /One check found a problem, so look at the list before using it\.$/);
  assert.ok(state.notes.some((n) => !n.ok));
});

test("notes the recorder adds, such as text that does not fit, are kept for the author and do not stop the video", () => {
  const { state, said } = play([
    line({ event: "check", check: "export", ok: true, message: "Exported 6.0 seconds." }),
    line({ event: "check", check: "export-note", ok: false, message: "The words of the text overlay do not fit its box and are cut off." }),
  ]);
  assert.equal(state.made, true);
  assert.equal(said.at(-1), "Problem. The words of the text overlay do not fit its box and are cut off.");
  assert.equal(summariseExport(state, exit()).ok, false, "the author is told to look");
});

test("an ending that is not a clean one is said plainly", () => {
  const made = play([line({ event: "check", check: "export", ok: true, message: "Exported." })]).state;
  assert.match(summariseExport(made, exit({ killed: true })).sentence, /did not finish, so there is no video/);
  assert.match(summariseExport(made, exit({ code: null })).sentence, /did not finish/);
  assert.equal(summariseExport(initialExport(), exit({ code: 2 })).sentence, "Making a video works on Windows only.");
  assert.match(summariseExport(initialExport(), null).sentence, /could not be made/);
  assert.match(summariseExport({ ...initialExport(), problem: "No recorder." }, null).sentence, /No recorder\.$/);
});

test("progress is kept within 0 to 100, and what is not understood changes nothing", () => {
  assert.equal(play([line({ event: "progress", percent: 250, message: "Way over." })]).state.percent, 100);
  assert.equal(play([line({ event: "progress", percent: -5 })]).state.percent, 0);
  assert.equal(play([line({ event: "progress", percent: 40 })]).state.message, "Exporting: 40 percent.");
  const before = initialExport();
  for (const l of ["", "nonsense", "[1]", "5", line({ event: "recovered" }), line({ event: 5 }), line({ event: "check", ok: true }), line({ event: "check", check: "x", ok: "yes", message: "m" }), line({ event: "check", check: "x", ok: true, message: "" })]) {
    assert.deepEqual(applyExportLine(before, l), { state: before, say: [] }, l);
  }
});

test("a video that was made always comes with the plain words that it has no captions", () => {
  const { state } = play([line({ event: "check", check: "export", ok: true, message: "Exported 6.0 seconds." })]);
  const done = finishedWords(state, exit());
  assert.equal(done.made, true);
  assert.equal(done.sentence, `The video was made. Exported 6.0 seconds. ${NO_CAPTIONS}`);
  assert.match(NO_CAPTIONS, /^This video has no captions\./);
  assert.equal(NO_CAPTIONS.includes("\u2014"), false, "no em dash in the words");
});

test("the no-captions words are said even when a check found a problem with a video that was made, and the runner's own trouble comes before them", () => {
  const { state } = play([
    line({ event: "check", check: "export", ok: true, message: "Exported 6.0 seconds." }),
    line({ event: "check", check: "video-readback", ok: false, message: "The video is 2 seconds shorter than it should be." }),
  ]);
  const done = finishedWords(state, exit(), "It took longer than expected.");
  assert.equal(done.made, true);
  assert.match(done.sentence, /look at the list before using it\. It took longer than expected\. This video has no captions\./);
});

test("when no video was made nothing is said about captions", () => {
  const { state } = play([line({ event: "check", check: "export", ok: false, message: "The disk is full." })]);
  for (const done of [finishedWords(state, exit({ code: 1 })), finishedWords(initialExport(), null), finishedWords(initialExport(), exit({ killed: true, code: null }))]) {
    assert.equal(done.made, false);
    assert.equal(done.sentence.includes("captions"), false);
  }
});
