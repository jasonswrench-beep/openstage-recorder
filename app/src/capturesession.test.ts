// SPDX-License-Identifier: Apache-2.0
// Tests for the plain part of recording from the editor: the choices, the recorder's options, and what its lines mean.
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyLine, commandLine, plainWords, soundAdvice, defaultSettings, describeSession, formatTime, initialSession, keyAction, parseProbe, parseWindow, recordArgs, recordingFolderName, recordingPath,
  safeName, settingsProblem, STOP_LINE, type RecordSettings, type Session,
} from "./capturesession.ts";

const settings = (over: Partial<RecordSettings> = {}): RecordSettings => ({ ...defaultSettings(), ...over });
const line = (event: Record<string, unknown>): string => JSON.stringify(event);

// ---- the folder a recording is kept in

test("a recording's name becomes a safe folder name", () => {
  assert.equal(safeName("Week 3 demo"), "Week 3 demo");
  assert.equal(safeName("  Lab_1 - setup  "), "Lab_1 - setup");
  assert.equal(safeName("../../Windows/System32"), "Windows System32", "nothing can leave the recordings folder");
  assert.equal(safeName("a/b\\c:d*e?f\"g<h>i|j"), "a b c d e f g h i j");
  assert.equal(safeName("Caf\u00e9 \u00e0 Paris"), "Caf\u00e9 \u00e0 Paris", "letters of any language are kept");
  assert.equal(safeName("***"), "");
  assert.equal(safeName("x".repeat(200)).length, 60);
});

test("a recording is kept in the recordings folder, with that folder's own kind of slash", () => {
  assert.equal(recordingPath("D:\\Videos\\OpenStage Recorder", "Demo 1"), "D:\\Videos\\OpenStage Recorder\\Demo 1.capture");
  assert.equal(recordingPath("D:\\Videos\\OpenStage Recorder\\", "Demo 1"), "D:\\Videos\\OpenStage Recorder\\Demo 1.capture");
  assert.equal(recordingPath("/home/me/recordings", "Demo 1"), "/home/me/recordings/Demo 1.capture");
  assert.equal(recordingPath("D:\\Videos\\OpenStage Recorder", "../x"), "D:\\Videos\\OpenStage Recorder\\x.capture");
  assert.equal(recordingFolderName("Demo 1"), "Demo 1.capture");
  assert.equal(recordingFolderName("../x"), "x.capture");
});

// ---- what is wrong with the choices

test("the default choices are good enough to record with", () => {
  assert.equal(settingsProblem(defaultSettings()), null);
  const d = defaultSettings();
  assert.deepEqual([d.practice, d.interactions, d.camera, d.countdownSeconds, d.sounds], [false, "off", "none", 3, true], "nothing private is on unless asked for");
});

test("choices that cannot work are explained in words", () => {
  assert.match(settingsProblem(settings({ name: "   " }))!, /name/);
  assert.match(settingsProblem(settings({ name: "***" }))!, /name/);
  assert.match(settingsProblem(settings({ countdownSeconds: 11 }))!, /0 to 10/);
  assert.match(settingsProblem(settings({ countdownSeconds: 1.5 }))!, /whole number/);
  assert.match(settingsProblem(settings({ countdownSeconds: -1 }))!, /0 to 10/);
  assert.match(settingsProblem(settings({ display: 0 }))!, /screen/);
  assert.match(settingsProblem(settings({ target: "window", window: "  " }))!, /Look for windows/);
  assert.equal(settingsProblem(settings({ target: "window", window: "Notes" })), null);
  const region = (r: Partial<RecordSettings["region"]>) => settings({ target: "region", region: { ...defaultSettings().region, ...r } });
  assert.equal(settingsProblem(region({})), null);
  assert.match(settingsProblem(region({ left: "-5" }))!, /four whole numbers/);
  assert.match(settingsProblem(region({ width: "wide" }))!, /four whole numbers/);
  assert.match(settingsProblem(region({ top: "" }))!, /four whole numbers/);
  assert.match(settingsProblem(region({ width: "63" }))!, /at least 64/);
  assert.match(settingsProblem(region({ height: "10" }))!, /at least 64/);
});

test("a practice recording needs no screen, window or region", () => {
  assert.equal(settingsProblem(settings({ practice: true, target: "window", window: "" })), null);
  assert.equal(settingsProblem(settings({ practice: true, display: 0 })), null);
  assert.match(settingsProblem(settings({ practice: true, name: "" }))!, /name/, "it still needs a name");
});

// ---- the options the recorder is started with

test("a screen recording asks for the screen, the sound, no webcam and nothing noted", () => {
  assert.deepEqual(recordArgs(settings({ name: "Demo 1" }), "F:/c/Demo 1.capture"), [
    "record", "--project", "F:/c/Demo 1.capture", "--title", "Demo 1", "--countdown-ms", "3000", "--cues", "on",
    "--source", "screen", "--display", "1", "--microphone", "default", "--output", "default", "--camera", "none", "--interactions", "off",
  ]);
});

test("a window, or a part of a screen, is asked for the way the recorder takes it", () => {
  const w = recordArgs(settings({ target: "window", window: "  Lesson plan - Word " }), "f");
  assert.deepEqual(w.slice(w.indexOf("--window"), w.indexOf("--window") + 2), ["--window", "Lesson plan - Word"]);
  assert.ok(!w.includes("--region"));
  const r = recordArgs(settings({ target: "region", display: 2, region: { left: "100", top: "020", width: "1280", height: "720" } }), "f");
  assert.deepEqual(r.slice(r.indexOf("--display"), r.indexOf("--display") + 2), ["--display", "2"]);
  assert.deepEqual(r.slice(r.indexOf("--region"), r.indexOf("--region") + 2), ["--region", "100,20,1280,720"], "numbers are written plainly");
  assert.ok(!r.includes("--window"));
});

test("every choice reaches the recorder, and the sounds and countdown follow the author's wishes", () => {
  const a = recordArgs(settings({ microphone: "3", output: "none", camera: "1", interactions: "no-keys", countdownSeconds: 0, sounds: false }), "f");
  const pick = (flag: string) => a[a.indexOf(flag) + 1];
  assert.deepEqual([pick("--microphone"), pick("--output"), pick("--camera"), pick("--interactions"), pick("--countdown-ms"), pick("--cues")], ["3", "none", "1", "no-keys", "0", "off"]);
});

test("a practice recording uses the made-up source and asks for nothing real", () => {
  const a = recordArgs(settings({ practice: true, interactions: "on", camera: "1", countdownSeconds: 1, sounds: false }), "f");
  assert.equal(a[a.indexOf("--source") + 1], "synthetic");
  for (const flag of ["--display", "--window", "--region", "--microphone", "--output", "--camera", "--interactions"]) assert.ok(!a.includes(flag), `${flag} is refused with a made-up source, so it is not sent`);
  assert.equal(a[a.indexOf("--cues") + 1], "off");
});

// ---- what the recorder can use

const REAL_PROBE = line({
  event: "probe", platform: "windows",
  sources: [
    { id: "synthetic", available: true, note: "A built-in test source." },
    { id: "display:1", available: true, note: "Display 1, 1920 by 1080, main display. Record it with: record --source screen --display 1. Sound is chosen separately, with --microphone and --output." },
    { id: "display:2", available: true, note: "Display 2, 1920 by 1080, at position 7, -1080. Record it with: record --source screen --display 2. Sound is chosen separately." },
    { id: "microphone:1", available: true, note: "Microphone 1: Microphone (NVIDIA Broadcast). Record it with: record --source screen --microphone 1." },
    { id: "microphone:5", available: true, note: "Microphone 5: Microphone (NexiGo Iris 4K Webcam Audio), the default. Record it with: record --source screen --microphone 5." },
    { id: "output:4", available: true, note: "Sound output (records the sound it plays) 4: Headphones (Shure MV7), the default. Record it with: record --source screen --output 4." },
    { id: "camera:1", available: true, note: "Camera 1: NexiGo Iris 4K Webcam. Record it with: record --source screen --camera 1. It goes into webcam.mp4, beside the screen video." },
    { id: "camera:2", available: false, note: "Camera 2: Broken. Record it with: record --source screen --camera 2." },
  ],
});

test("the screens, microphones, sound outputs and cameras are read from the probe, named and with the default marked", () => {
  const s = parseProbe(REAL_PROBE);
  assert.deepEqual(s.map((x) => `${x.kind}:${x.number}`), ["display:1", "display:2", "microphone:1", "microphone:5", "output:4", "camera:1"], "the made-up source and an unavailable one are left out");
  assert.equal(s[0]!.label, "Display 1, 1920 by 1080, main display");
  assert.equal(s[1]!.label, "Display 2, 1920 by 1080, at position 7, -1080");
  assert.deepEqual([s[2]!.label, s[2]!.isDefault], ["Microphone (NVIDIA Broadcast)", false]);
  assert.deepEqual([s[3]!.label, s[3]!.isDefault], ["Microphone (NexiGo Iris 4K Webcam Audio)", true]);
  assert.deepEqual([s[4]!.label, s[4]!.isDefault], ["Headphones (Shure MV7)", true]);
  assert.equal(s[5]!.label, "NexiGo Iris 4K Webcam");
});

test("a line that is not a probe lists nothing", () => {
  for (const l of ["", "nonsense", "[1]", line({ event: "hello" }), line({ event: "probe" }), line({ event: "probe", sources: "x" }), line({ event: "probe", sources: [null, 5, { id: "display:x", available: true }] })]) {
    assert.deepEqual(parseProbe(l), [], l);
  }
});

test("a window is read from its finding, with the words that name it", () => {
  const w = parseWindow(line({ event: "check", check: "window", ok: true, message: "2. WINWORD.EXE: Lesson plan  -  Last saved by user - Word (1920 by 1032)" }));
  assert.deepEqual(w, { number: 2, label: "2. WINWORD.EXE: Lesson plan  -  Last saved by user - Word (1920 by 1032)", title: "Lesson plan  -  Last saved by user - Word" });
  assert.equal(parseWindow(line({ event: "check", check: "window", ok: true, message: "5. chrome.exe: Notes: week 3 \ud83c\udf81 - Google Chrome (1920 by 1032)" }))?.title, "Notes: week 3 \ud83c\udf81 - Google Chrome");
  assert.equal(parseWindow(line({ event: "check", check: "windows", ok: true, message: "11 windows can be recorded." })), null, "the count is not a window");
  assert.equal(parseWindow(line({ event: "check", check: "window", ok: true, message: "no number here" })), null);
  assert.equal(parseWindow(line({ event: "check", check: "window", ok: true, message: "3. x.exe:  (10 by 10)" })), null, "a window with no title cannot be asked for by title");
  assert.equal(parseWindow("garbage"), null);
});

// ---- words for times

test("a length of time is said in words", () => {
  assert.equal(formatTime(0), "0 seconds");
  assert.equal(formatTime(999), "0 seconds");
  assert.equal(formatTime(1000), "1 second");
  assert.equal(formatTime(45_300), "45 seconds");
  assert.equal(formatTime(60_000), "1 minute");
  assert.equal(formatTime(65_000), "1 minute 5 seconds");
  assert.equal(formatTime(125_000), "2 minutes 5 seconds");
  assert.equal(formatTime(3_600_000), "1 hour");
  assert.equal(formatTime(3_725_000), "1 hour 2 minutes");
  assert.equal(formatTime(-5), "0 seconds");
});

// ---- following a whole recording

const play = (lines: string[], from: Session = initialSession("F:/c/Demo.capture")): { session: Session; said: string[] } => {
  let session = from;
  const said: string[] = [];
  for (const l of lines) {
    const u = applyLine(session, l);
    session = u.session;
    said.push(...u.say);
  }
  return { session, said };
};

const HELLO = line({ event: "hello", protocol: "0.1", program: "openstage-capture", programVersion: "0.1.0", platform: "windows" });

test("a recording is followed from the countdown to the result, and only what matters is said", () => {
  const { session, said } = play([
    HELLO,
    line({ event: "state", state: "idle", elapsedMs: 0, take: 1 }),
    line({ event: "state", state: "countdown", elapsedMs: 0, take: 1 }),
    line({ event: "state", state: "countdown", elapsedMs: 0, take: 1 }),
    line({ event: "state", state: "recording", elapsedMs: 0, take: 1 }),
    line({ event: "level", source: "mic", peak: 0.5, text: "good", elapsedMs: 500 }),
    line({ event: "level", source: "system", peak: 0.1, text: "quiet", elapsedMs: 500 }),
    line({ event: "state", state: "recording", elapsedMs: 5200, take: 1 }),
    line({ event: "marker", label: "look here", elapsedMs: 5200 }),
    line({ event: "state", state: "paused", elapsedMs: 5300, take: 1 }),
    line({ event: "state", state: "paused", elapsedMs: 5300, take: 1 }),
    line({ event: "state", state: "recording", elapsedMs: 5400, take: 1 }),
    line({ event: "state", state: "stopping", elapsedMs: 9000, take: 1 }),
    line({ event: "state", state: "stopped", elapsedMs: 9000, take: 1 }),
    line({ event: "result", ok: true, project: "F:/c/Demo.capture", take: 1, state: "complete", durationMs: 9000, segments: 5 }),
  ]);
  assert.equal(session.phase, "finished");
  assert.deepEqual(session.markers, [{ label: "look here", elapsedMs: 5200 }]);
  assert.deepEqual(session.levels, { mic: "good", system: "quiet" });
  assert.deepEqual(said, [
    "Counting down to take 1. Recording starts when the countdown ends.",
    "Recording take 1.",
    "Marker added at 5 seconds: look here.",
    "Paused. Time spent paused is not recorded.",
    "Recording take 1.",
    "Stopping, and finishing the files.",
    "Finished. Take 1 is complete: 9 seconds.",
  ]);
  assert.equal(describeSession(session), "Finished. Take 1 is complete: 9 seconds.");
});

test("what is said while recording includes the sound levels and says when interactions are being noted", () => {
  const { session } = play([
    line({ event: "level", source: "mic", peak: 0.9, text: "too loud", elapsedMs: 10 }),
    line({ event: "state", state: "recording", elapsedMs: 65_000, take: 2, watching: true }),
  ]);
  assert.equal(describeSession(session), "Recording take 2, 1 minute 5 seconds. Interaction recording is on. Sound: microphone too loud.");
  const quiet = play([line({ event: "state", state: "recording", elapsedMs: 1000, take: 1, watching: true })]);
  assert.deepEqual(quiet.said, ["Recording take 1. Interaction recording is on."]);
});

test("starting again says that the old take was kept, and the new take is announced", () => {
  const { session, said } = play([
    line({ event: "state", state: "recording", elapsedMs: 4000, take: 1 }),
    line({ event: "takeSetAside", take: 1, nextTake: 2 }),
    line({ event: "state", state: "countdown", elapsedMs: 0, take: 2 }),
    line({ event: "state", state: "recording", elapsedMs: 0, take: 2 }),
  ]);
  assert.equal(session.setAside, 1);
  assert.equal(session.take, 2);
  assert.deepEqual(said, [
    "Recording take 1.",
    "Starting again. Take 1 was set aside, not erased.",
    "Counting down to take 2. Recording starts when the countdown ends.",
    "Recording take 2.",
  ]);
});

test("warnings and problems are said once, and the checks that matter are always said", () => {
  const warn = line({ event: "warning", code: "slow-save", message: "Saving to the disk took 300 ms just now." });
  const { session, said } = play([
    warn, warn,
    line({ event: "check", check: "interactions-on", ok: true, message: "What you do with the mouse is being noted." }),
    line({ event: "check", check: "run-cpu", ok: true, message: "Processor use was 4 percent." }),
    line({ event: "check", check: "video-readback", ok: false, message: "The video is 2 seconds shorter than the recording." }),
    line({ event: "error", code: "write-failed", message: "The disk is full.", fatal: true }),
  ]);
  assert.deepEqual(said, [
    "Saving to the disk took 300 ms just now.",
    "What you do with the mouse is being noted.",
    "Problem. The video is 2 seconds shorter than the recording.",
    "The recording is stopping because of a problem. The disk is full.",
  ]);
  assert.equal(session.notes.length, 5, "everything is kept in the list, but the repeated warning only once");
  assert.equal(session.problem, "The disk is full.");
});

test("a recording that did not finish says so and keeps the reason", () => {
  const { session, said } = play([
    line({ event: "error", code: "media-failed", message: "The window was closed.", fatal: true }),
    line({ event: "result", ok: false, project: "F:/c/Demo.capture", take: 1, state: "error", durationMs: 3000, segments: 1 }),
  ]);
  assert.equal(session.phase, "failed");
  assert.equal(describeSession(session), "The window was closed.");
  assert.equal(said.at(-1), "The window was closed.");
  const bare = play([line({ event: "result", ok: false, take: 0, state: "none", durationMs: 0, segments: 0 })]);
  assert.match(bare.session.problem, /did not finish properly/);
});

test("a recorder that speaks another version is not trusted", () => {
  const { session, said } = play([line({ event: "hello", protocol: "0.2", program: "openstage-capture" })]);
  assert.equal(session.phase, "failed");
  assert.match(said[0]!, /version 0\.2/);
  assert.match(said[0]!, /cannot work together/);
});

test("what is not understood changes nothing", () => {
  const before = initialSession("f");
  for (const l of ["", "nonsense", "[1]", "5", line({ event: "somethingNew", x: 1 }), line({ nothing: true }), line({ event: 5 }), line({ event: "recovered", take: 1 })]) {
    const u = applyLine(before, l);
    assert.deepEqual(u, { session: before, say: [] }, l);
  }
});

test("a state report after the end cannot bring a finished recording back", () => {
  const { session } = play([
    line({ event: "result", ok: true, take: 1, state: "complete", durationMs: 2000, segments: 1 }),
    line({ event: "state", state: "recording", elapsedMs: 2100, take: 1 }),
  ]);
  assert.equal(session.phase, "finished");
});

// ---- commands and keys

test("each command is one short line, and a marker's label is cleaned", () => {
  assert.equal(commandLine("pause"), '{"cmd":"pause"}');
  assert.equal(commandLine("resume"), '{"cmd":"resume"}');
  assert.equal(commandLine("restart"), '{"cmd":"restart"}');
  assert.equal(commandLine("stop"), STOP_LINE);
  assert.equal(commandLine("marker"), '{"cmd":"marker"}');
  assert.equal(commandLine("marker", "  oops \n again "), '{"cmd":"marker","label":"oops again"}');
  assert.equal(JSON.parse(commandLine("marker", "q\"uote\\")).label, 'q"uote\\', "quotes and backslashes cannot break the line");
  assert.ok(commandLine("marker", "x".repeat(1000)).length < 200);
  assert.ok(!commandLine("marker", "a\nb").includes("\n"));
});

test("a key does what fits the moment, or says why it cannot", () => {
  assert.deepEqual(keyAction("pause", "recording"), { cmd: "pause" });
  assert.deepEqual(keyAction("pause", "paused"), { cmd: "resume" });
  assert.deepEqual(keyAction("pause", "countdown"), { say: "Pause works only while recording." });
  assert.deepEqual(keyAction("stop", "recording"), { cmd: "stop" });
  assert.deepEqual(keyAction("stop", "paused"), { cmd: "stop" });
  assert.deepEqual(keyAction("stop", "countdown"), { cmd: "stop" });
  assert.deepEqual(keyAction("stop", "idle"), { say: "Nothing is recording." });
  assert.deepEqual(keyAction("restart", "recording"), { cmd: "restart" });
  assert.deepEqual(keyAction("restart", "countdown"), { say: "Starting again works only while recording." });
  assert.deepEqual(keyAction("start", "recording"), { say: "That key does nothing here." });
});

// ---- how loud each sound is in the video

test("the loudness of your voice and the computer's sound is asked for only when it is changed", () => {
  const base = { ...defaultSettings(), name: "Demo", countdownSeconds: 3 };
  const none = recordArgs(base, "D:/r/Demo.capture");
  assert.equal(none.includes("--mic-gain-db"), false);
  assert.equal(none.includes("--system-gain-db"), false);
  const quieter = recordArgs({ ...base, systemGainDb: -19 }, "D:/r/Demo.capture");
  assert.deepEqual(quieter.slice(-2), ["--system-gain-db", "-19"]);
  assert.equal(quieter.includes("--mic-gain-db"), false);
  const both = recordArgs({ ...base, micGainDb: 6, systemGainDb: -12 }, "D:/r/Demo.capture");
  assert.deepEqual(both.slice(-4), ["--mic-gain-db", "6", "--system-gain-db", "-12"]);
  assert.deepEqual(both.slice(0, none.length), none, "everything before is the same");
});

test("a practice recording has no real sound, so the loudness is left out of it", () => {
  const args = recordArgs({ ...defaultSettings(), practice: true, systemGainDb: -19 }, "D:/r/Demo.capture");
  assert.equal(args.includes("--system-gain-db"), false);
});

test("the loudness must be a whole number of decibels the recorder accepts, and is said in words if not", () => {
  const ok = { ...defaultSettings(), name: "Demo" };
  for (const db of [-40, -19, 0, 6, 20]) assert.equal(settingsProblem({ ...ok, systemGainDb: db }), null, String(db));
  for (const db of [-41, 21, 1.5, Number.NaN]) {
    const problem = settingsProblem({ ...ok, systemGainDb: db });
    assert.match(problem ?? "", /the computer's sound is in the video is a whole number of decibels from -40 to 20/, String(db));
  }
  assert.match(settingsProblem({ ...ok, micGainDb: 99 }) ?? "", /^How loud your voice is in the video/);
});

// ---- advice about the sounds is said as notes, not as problems ----

const LOUD_CHECK = "The computer's sound is about 13 decibels louder than your voice while each is making sound, so in the mixed video your voice may be hard to hear. To put your voice about 6 decibels above it, make the computer's sound 19 decibels quieter in the mix (record with --system-gain-db -19), or balance mic.wav and system.wav in the editor: the separate files are not changed by the mix.";
const LOUD_WARNING = "Balance: the computer's sound is about 13 decibels louder than your voice. To put your voice about 6 decibels above it, make the computer's sound 19 decibels quieter in the mix (record with --system-gain-db -19), or balance mic.wav and system.wav in the editor: the separate files are not changed by the mix.";
const SILENT = "The computer's sound track is silent: nothing was heard from Speakers (Realtek) during this recording. If sound was playing, it was probably going to a different sound output than sound output 1, Speakers (Realtek). FIND SOUND OUTPUT.bat shows which one carries the sound.";

test("a computer sound that drowns the voice is a note with a next step in this app's words, said once even though the recorder says it twice", () => {
  const { session, said } = play([
    line({ event: "check", check: "balance", ok: false, message: LOUD_CHECK }),
    line({ event: "warning", code: "sound-balance", message: LOUD_WARNING }),
  ]);
  assert.equal(said.length, 1, "the same finding is not said twice");
  assert.match(said[0] ?? "", /^Note\. The computer's sound is about 13 decibels louder than your voice/);
  assert.ok(!(said[0] ?? "").includes("Problem"), "not a problem");
  assert.ok(!(said[0] ?? "").includes("--system-gain-db"), "no command line option");
  assert.ok(!(said[0] ?? "").includes("mic.wav"), "no file names");
  assert.match(said[0] ?? "", /\(put -19 in the computer's sound box on the Record screen before recording\), or change it afterwards under Sound balance when you edit the recording\. The separate sound files are never changed\.$/);
  assert.deepEqual(session.notes.map((n) => n.ok), [true], "listed once, as a note");
});

test("the warning alone, arriving first, is said the same way and the check after it adds nothing", () => {
  const { said } = play([
    line({ event: "warning", code: "sound-balance", message: LOUD_WARNING }),
    line({ event: "check", check: "balance", ok: false, message: LOUD_CHECK }),
  ]);
  assert.equal(said.length, 1);
  assert.match(said[0] ?? "", /^Note\. The computer's sound is about 13 decibels louder than your voice\. To put your voice/);
});

test("a computer sound that was not heard says that is normal if nothing was playing, and where to choose another output", () => {
  const { session, said } = play([line({ event: "warning", code: "track-silent", message: SILENT })]);
  assert.deepEqual(said, [
    "Note. Nothing was heard from the computer's sound (Speakers (Realtek)) during this recording. That is normal if nothing was playing. If something was playing, it may have gone to a different sound output: choose the right one under \"The computer's own sound\" on the Record screen.",
  ]);
  assert.deepEqual(session.notes.map((n) => n.ok), [true]);
});

test("a microphone that was not heard stays a warning, because a recording with no voice is a real problem", () => {
  const message = "The microphone track is silent: nothing was heard from Webcam microphone during this recording. Check that the microphone is not muted.";
  const { said, session } = play([line({ event: "warning", code: "track-silent", message })]);
  assert.deepEqual(said, [message]);
  assert.deepEqual(session.notes.map((n) => n.ok), [false]);
  assert.equal(soundAdvice("warning", "track-silent", message), null);
});

test("a computer sound that goes quiet part way is a note; a balance that is good, and a sound level check, are left as they were", () => {
  const quiet = "The computer's sound was heard until 0:12 and was silent for the last 5 seconds of the recording. If something was meant to play, it may have gone to a different sound output: this recording kept to the output you chose.";
  assert.deepEqual(play([line({ event: "warning", code: "sound-went-quiet", message: quiet })]).said, [`Note. ${quiet}`]);
  const good = play([line({ event: "check", check: "balance", ok: true, message: "Your voice is about 6 decibels louder than the computer's sound while each is making sound. That is a good balance for narration." })]);
  assert.deepEqual(good.said, [], "a balance that is fine is listed but not said");
  assert.deepEqual(play([line({ event: "check", check: "run-cpu", ok: false, message: "Processor use was 90 percent." })]).said, ["Problem. Processor use was 90 percent."]);
});

test("a very quiet computer sound note uses this app's words for what to do, and anything unrecognised comes back as it was", () => {
  const veryQuiet = "The computer's sound is about 20 decibels quieter than your voice, which may be too quiet to hear in the mixed video. If it should be heard, raise it in the editor, or record with a higher --system-gain-db.";
  const advice = soundAdvice("check", "balance", veryQuiet);
  assert.ok(advice !== null);
  assert.match(advice.text, /raise it under Sound balance when you edit the recording, or put a higher number in the computer's sound box on the Record screen before recording\.$/);
  const odd = soundAdvice("check", "balance", "Something the recorder says in some new way.");
  assert.deepEqual(odd, { text: "Something the recorder says in some new way.", topic: "balance" });
});

// ---- notes that name the recorder's command line options are said in the window's own words ----

test("the notes about the short sounds and the webcam do not name command line options", () => {
  const cues = "The recorder will make a short sound for the countdown, the start, a pause, a resume, the stop and an error, at volume 70 of 100. None of them is recorded. Turn them off with --cues off, or change the volume with --cue-volume.";
  const camera = "Recording the webcam 1. NexiGo Iris 4K Webcam into webcam.mp4, beside the screen video. If the camera stops, the recording carries on without it and you are told. Leave out --camera to record no webcam.";
  const volume = "The sounds are played at volume 70 of 100. To change it use --cue-volume with a number from 1 to 100; --cues off turns them off.";
  const { session } = play([
    line({ event: "check", check: "cues", ok: true, message: cues }),
    line({ event: "check", check: "camera", ok: true, message: camera }),
    line({ event: "check", check: "cue-volume", ok: true, message: volume }),
  ]);
  const text = session.notes.map((n) => n.text);
  assert.ok(text.every((x) => !x.includes("--")), `a command line option is still named: ${text.join(" | ")}`);
  assert.match(text[0] ?? "", /None of them is recorded\. Turn them off with the box about a short sound for each step, under Starting\.$/);
  assert.match(text[1] ?? "", /you are told\. To record without it, choose no webcam in the list called A webcam\.$/);
  assert.match(text[2] ?? "", /at volume 70 of 100\. To turn them off, clear the box about a short sound for each step, under Starting\.$/);
  assert.equal(plainWords("Something else the recorder says."), "Something else the recorder says.");
});

