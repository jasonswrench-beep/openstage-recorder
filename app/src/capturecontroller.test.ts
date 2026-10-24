// SPDX-License-Identifier: Apache-2.0
// Tests for the recorder controller, against a stand-in for the recorder and the shell. Nothing is recorded and no sound is made.
import assert from "node:assert/strict";
import { test } from "node:test";
import { ONE_SHOT_LIMIT_MS, RecorderController, runOneShot, SESSION_KEYS, type CaptureBackend } from "./capturecontroller.ts";
import { defaultSettings, STOP_LINE, type RecordSettings, type Session } from "./capturesession.ts";
import type { HotkeyBinding, HotkeyResult, StreamExit } from "./recorder.ts";

const line = (event: Record<string, unknown>): string => JSON.stringify(event);
const exit = (over: Partial<StreamExit> = {}): StreamExit => ({ code: 0, killed: false, stderr_tail: "", ...over });
const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 5));

class Fake implements CaptureBackend {
  starts: string[][] = [];
  sent: string[] = [];
  stops: (string | undefined)[] = [];
  paused: boolean[] = [];
  keysSet: HotkeyBinding[][] = [];
  keysCleared = 0;
  lineListeners = new Set<(l: string) => void>();
  exitListeners = new Set<(e: StreamExit) => void>();
  keyListeners = new Set<(id: string) => void>();
  startError: Error | null = null;
  /** How many times streamStart says another job is running before it works. */
  busyTimes = 0;
  /** Runs each time streamStart says another job is running: what that other job is saying and doing meanwhile. */
  onBusy: ((fake: Fake) => void) | null = null;
  /** How many times streamState says another job is running before it says the recorder is free, and what happens at each of those times. */
  runningPolls = 0;
  onPoll: ((fake: Fake) => void) | null = null;
  keyResults: HotkeyResult[] | null = null;
  keysError: Error | null = null;
  /** Runs inside streamStart, after the listeners are attached: a way to make the stand-in recorder say things. */
  onStart: ((args: string[], fake: Fake) => void) | null = null;

  async streamStart(args: string[]): Promise<void> {
    if (this.busyTimes > 0) { this.busyTimes--; this.onBusy?.(this); throw new Error("A recording is already in progress. Stop it first."); }
    if (this.startError) throw this.startError;
    this.starts.push(args);
    this.onStart?.(args, this);
  }
  async streamState(): Promise<{ running: boolean; paused: boolean }> {
    if (this.runningPolls > 0) { this.runningPolls--; this.onPoll?.(this); return { running: true, paused: false }; }
    return { running: false, paused: false };
  }
  async streamSend(l: string): Promise<void> { this.sent.push(l); }
  async streamStop(stopLine?: string): Promise<boolean> { this.stops.push(stopLine); return true; }
  async streamSetPaused(p: boolean): Promise<void> { this.paused.push(p); }
  async onStreamLine(l: (line: string) => void): Promise<() => void> { this.lineListeners.add(l); return () => { this.lineListeners.delete(l); }; }
  async onStreamExit(l: (e: StreamExit) => void): Promise<() => void> { this.exitListeners.add(l); return () => { this.exitListeners.delete(l); }; }
  async onHotkey(l: (id: string) => void): Promise<() => void> { this.keyListeners.add(l); return () => { this.keyListeners.delete(l); }; }
  async hotkeysSet(b: HotkeyBinding[]): Promise<HotkeyResult[]> {
    if (this.keysError) throw this.keysError;
    this.keysSet.push(b);
    return this.keyResults ?? b.map((x) => ({ id: x.id, ok: true, message: "" }));
  }
  async hotkeysClear(): Promise<void> { this.keysCleared++; }

  say(l: string): void { for (const f of [...this.lineListeners]) f(l); }
  end(e: StreamExit): void { for (const f of [...this.exitListeners]) f(e); }
  press(id: string): void { for (const f of [...this.keyListeners]) f(id); }
  get listening(): number { return this.lineListeners.size + this.exitListeners.size + this.keyListeners.size; }
}

const FOLDER = "F:/recordings/Demo.capture";
const recording = (take = 1, elapsedMs = 1000) => line({ event: "state", state: "recording", elapsedMs, take });

async function started(over: Partial<RecordSettings> = {}): Promise<{ fake: Fake; c: RecorderController; said: string[] }> {
  const fake = new Fake();
  const c = new RecorderController(fake);
  const said: string[] = [];
  c.subscribe((_s, say) => said.push(...say));
  const problem = await c.start({ ...defaultSettings(), name: "Demo", ...over }, FOLDER);
  assert.equal(problem, null);
  return { fake, c, said };
}

test("choices that cannot work are refused before anything is started", async () => {
  const fake = new Fake();
  const c = new RecorderController(fake);
  assert.match((await c.start({ ...defaultSettings(), name: "" }, FOLDER))!, /name/);
  assert.match((await c.start({ ...defaultSettings(), target: "window", window: "" }, FOLDER))!, /Look for windows/);
  assert.deepEqual([fake.starts.length, fake.keysSet.length, fake.listening], [0, 0, 0]);
  assert.equal(c.session.phase, "idle");
});

test("starting asks the recorder for the author's choices and sets up the keys that work from any program", async () => {
  const { fake, c, said } = await started({ target: "window", window: "Notes", interactions: "no-keys" });
  assert.equal(fake.starts.length, 1);
  const args = fake.starts[0]!;
  assert.deepEqual(args.slice(0, 5), ["record", "--project", FOLDER, "--title", "Demo"]);
  assert.equal(args[args.indexOf("--window") + 1], "Notes");
  assert.equal(args[args.indexOf("--interactions") + 1], "no-keys");
  assert.deepEqual(fake.keysSet.map((set) => set.map((k) => k.id)), [["pause", "stop", "restart"]], "a recording is started from the dialog, so no key starts one");
  assert.equal(c.session.phase, "starting");
  assert.equal(c.busy, true);
  assert.equal(said[0], "Starting the recorder.");
  assert.ok(c.session.notes.some((n) => n.ok && n.text.includes("Ctrl+Shift+F10") && n.text.includes("pause or resume")), "the keys are listed in the notes");
  assert.deepEqual(SESSION_KEYS.map((k) => k.keys), ["Ctrl+Shift+F10", "Ctrl+Shift+F11", "Ctrl+Shift+F12"]);
});

test("a second recording cannot start while one is going", async () => {
  const { fake, c } = await started();
  assert.equal(await c.start(defaultSettings(), FOLDER), "A recording is already going.");
  assert.equal(fake.starts.length, 1);
});

test("a whole recording: the shell is told about pauses, and the keys are let go at the end", async () => {
  const { fake, c, said } = await started();
  fake.say(line({ event: "hello", protocol: "0.1", program: "openstage-capture" }));
  fake.say(line({ event: "state", state: "countdown", elapsedMs: 0, take: 1 }));
  fake.say(recording());
  fake.say(line({ event: "state", state: "paused", elapsedMs: 4000, take: 1 }));
  fake.say(line({ event: "state", state: "paused", elapsedMs: 4000, take: 1 }));
  fake.say(recording(1, 4100));
  assert.deepEqual(fake.paused, [true, false], "the shell holds heavy jobs only while recording and not paused");
  fake.say(line({ event: "state", state: "stopping", elapsedMs: 9000, take: 1 }));
  fake.say(line({ event: "result", ok: true, project: FOLDER, take: 1, state: "complete", durationMs: 9000, segments: 5 }));
  await settle();
  assert.equal(c.session.phase, "finished");
  assert.equal(c.busy, false);
  assert.equal(fake.keysCleared, 1, "the keys are let go as soon as the result arrives");
  fake.end(exit());
  await settle();
  assert.equal(fake.listening, 0, "nothing is left listening once the recorder has ended");
  assert.equal(fake.keysCleared, 2, "and the keys are let go again, harmlessly");
  assert.ok(said.includes("Finished. Take 1 is complete: 9 seconds."));
  assert.equal(fake.starts.length, 1, "a recording that finished properly needs no repair");
});

test("a key does what fits the moment", async () => {
  const { fake, c, said } = await started();
  fake.say(line({ event: "state", state: "countdown", elapsedMs: 0, take: 1 }));
  fake.press("pause");
  await settle();
  assert.equal(fake.sent.length, 0);
  assert.equal(said.at(-1), "Pause works only while recording.");
  fake.say(recording());
  fake.press("pause");
  await settle();
  assert.deepEqual(fake.sent, ['{"cmd":"pause"}']);
  fake.say(line({ event: "state", state: "paused", elapsedMs: 2000, take: 1 }));
  fake.press("pause");
  await settle();
  assert.deepEqual(fake.sent, ['{"cmd":"pause"}', '{"cmd":"resume"}']);
  fake.press("restart");
  await settle();
  assert.equal(fake.sent.at(-1), '{"cmd":"restart"}');
  fake.press("stop");
  await settle();
  assert.deepEqual(fake.stops, [STOP_LINE], "stop goes through the shell, which asks politely, waits, and only then ends the program");
  fake.press("start");
  await settle();
  assert.equal(said.at(-1), "That key does nothing here.");
  assert.equal(c.session.phase, "paused");
});

test("the buttons say why when they cannot do anything", async () => {
  const fake = new Fake();
  const c = new RecorderController(fake);
  const said: string[] = [];
  c.subscribe((_s, say) => said.push(...say));
  await c.act("stop");
  await c.act("pause");
  await c.act("resume");
  await c.act("restart");
  await c.marker("x");
  assert.deepEqual(said, ["Nothing is recording.", "Pause works only while recording.", "Resume works only while paused.", "Starting again works only while recording.", "Markers can only be added while recording."]);
  assert.deepEqual([fake.sent.length, fake.stops.length], [0, 0]);
});

test("a marker carries the author's words", async () => {
  const { fake, c } = await started();
  fake.say(recording());
  await c.marker("  the \n button ");
  await c.marker();
  assert.deepEqual(fake.sent, ['{"cmd":"marker","label":"the button"}', '{"cmd":"marker"}']);
});

test("a recorder that ends without a result is said to have stopped early, and what it recorded is repaired", async () => {
  const { fake, c, said } = await started();
  fake.say(line({ event: "state", state: "countdown", elapsedMs: 0, take: 1 }));
  fake.say(recording(1, 7000));
  fake.onStart = (args, f) => {
    assert.deepEqual(args, ["recover", "--project", FOLDER]);
    f.say(line({ event: "recovered", take: 1, durationMs: 6500, maxLossMs: 1000, segments: 3 }));
    f.end(exit());
  };
  fake.end(exit({ code: 1, stderr_tail: "something\nTHE PROGRAM STOPPED SUDDENLY\n" }));
  await settle();
  await settle();
  assert.equal(c.session.phase, "failed");
  assert.match(c.session.problem, /stopped before it finished/);
  assert.match(c.session.problem, /THE PROGRAM STOPPED SUDDENLY/);
  assert.deepEqual(fake.starts.map((a) => a[0]), ["record", "recover"]);
  assert.ok(said.some((m) => m === "Take 1 was repaired and kept: 6 seconds. At most 1 second of the end could be missing."), said.join(" | "));
  assert.equal(fake.listening, 0);
  assert.ok(fake.keysCleared >= 1);
});

test("a recorder that refuses the options says why, and nothing is repaired because nothing was recorded", async () => {
  const { fake, c } = await started();
  fake.say(line({ event: "error", code: "bad-option", message: "That window was closed.", fatal: true }));
  fake.end(exit({ code: 2 }));
  await settle();
  assert.equal(c.session.phase, "failed");
  assert.equal(c.session.problem, "That window was closed.", "the recorder's own words, not a general sentence");
  assert.equal(fake.starts.length, 1, "no take was begun, so there is nothing to repair");
});

test("keys that cannot be used are named, and the recording goes on", async () => {
  const fake = new Fake();
  fake.keyResults = [{ id: "pause", ok: true, message: "" }, { id: "stop", ok: false, message: "Another program already uses it." }, { id: "restart", ok: true, message: "" }];
  const c = new RecorderController(fake);
  const said: string[] = [];
  c.subscribe((_s, say) => said.push(...say));
  await c.start(defaultSettings(), FOLDER);
  assert.equal(fake.starts.length, 1, "the recorder is started anyway");
  const note = c.session.notes.find((n) => !n.ok);
  assert.equal(note?.text, "The key Ctrl+Shift+F11 (stop) could not be used: Another program already uses it. You can still use the buttons.");
  assert.ok(said.includes(note!.text));
  assert.ok(!c.session.notes.some((n) => n.ok && n.text.startsWith("Keys that work")), "no list of keys is promised when one does not work");
});

test("keys that cannot be set up at all do not stop a recording", async () => {
  const fake = new Fake();
  fake.keysError = new Error("The keys are not available.");
  const c = new RecorderController(fake);
  await c.start(defaultSettings(), FOLDER);
  assert.equal(fake.starts.length, 1);
  assert.match(c.session.notes[0]!.text, /could not be set up\. The keys are not available\. You can still use the buttons\./);
});

test("a recorder that cannot be started leaves nothing behind", async () => {
  const fake = new Fake();
  fake.startError = new Error("A recording is already running.");
  const c = new RecorderController(fake);
  assert.equal(await c.start(defaultSettings(), FOLDER), null, "the attempt was made; the answer is in the session");
  assert.equal(c.session.phase, "failed");
  assert.equal(c.session.problem, "The recorder could not be started. A recording is already running.");
  assert.equal(fake.listening, 0);
  assert.equal(fake.keysCleared, 1);
  assert.equal(c.busy, false);
});

test("a recorder that speaks another version is ended, not trusted", async () => {
  const { fake, c } = await started();
  fake.say(line({ event: "hello", protocol: "9.9", program: "openstage-capture" }));
  await settle();
  assert.equal(c.session.phase, "failed");
  assert.deepEqual(fake.stops, [STOP_LINE]);
});

test("a finished recording is forgotten when the author is ready for the choices again, but never while recording", async () => {
  const { fake, c } = await started();
  fake.say(recording());
  c.dismiss();
  assert.equal(c.session.phase, "recording", "a recording that is going cannot be dismissed");
  fake.say(line({ event: "result", ok: true, take: 1, state: "complete", durationMs: 2000, segments: 1 }));
  fake.end(exit());
  await settle();
  c.dismiss();
  assert.equal(c.session.phase, "idle");
  assert.equal(c.session.folder, "");
});

test("listeners hear each change with what to say, until they stop listening", async () => {
  const fake = new Fake();
  const c = new RecorderController(fake);
  const seen: [string, string[]][] = [];
  const off = c.subscribe((s: Session, say) => seen.push([s.phase, say]));
  await c.start(defaultSettings(), FOLDER);
  assert.deepEqual(seen[0], ["starting", ["Starting the recorder."]]);
  const count = seen.length;
  off();
  fake.say(recording());
  assert.equal(seen.length, count);
});

test("a short job collects what the recorder prints and how it ended", async () => {
  const fake = new Fake();
  fake.onStart = (_a, f) => { f.say("one"); f.say("two"); f.end(exit({ code: 1 })); };
  const heard: string[] = [];
  const job = await runOneShot(fake, ["probe"], (l) => heard.push(l));
  assert.deepEqual(job.lines, ["one", "two"]);
  assert.deepEqual(heard, ["one", "two"]);
  assert.equal(job.exit?.code, 1);
  assert.equal(job.problem, "");
  assert.equal(fake.listening, 0);
});

test("a short job waits for another short job that is still running, instead of saying a recording is going", async () => {
  const fake = new Fake();
  fake.busyTimes = 2;
  fake.onStart = (_a, f) => { f.say("done"); f.end(exit()); };
  const job = await runOneShot(fake, ["render"], undefined, 1000, 5000);
  assert.deepEqual([job.problem, job.lines, fake.starts.length], ["", ["done"], 1]);
  assert.equal(fake.listening, 0);
});

test("while it waits, what the job before it prints and how that job ends are not taken for this job's", async () => {
  const fake = new Fake();
  fake.busyTimes = 3;
  fake.onBusy = (f) => { f.say("a line of the other job"); f.end(exit({ code: 7 })); };
  fake.onStart = (_a, f) => { f.say("mine"); f.end(exit({ code: 0 })); };
  const heard: string[] = [];
  const job = await runOneShot(fake, ["render"], (l) => heard.push(l), 1000, 5000);
  assert.deepEqual([job.lines, heard, job.exit?.code, job.problem], [["mine"], ["mine"], 0, ""]);
  assert.equal(fake.listening, 0);
});

test("it waits for the recorder to say it is free, and does not listen to the job that is still running", async () => {
  const fake = new Fake();
  fake.runningPolls = 3;
  let listeningWhileWaiting = 0;
  fake.onPoll = (f) => { listeningWhileWaiting += f.listening; f.say("a line of the other job"); f.end(exit({ code: 7 })); };
  fake.onStart = (_a, f) => { f.say("mine"); f.end(exit({ code: 0 })); };
  const heard: string[] = [];
  const job = await runOneShot(fake, ["render"], (l) => heard.push(l), 1000, 5000);
  assert.deepEqual([job.lines, heard, job.exit?.code, job.problem, listeningWhileWaiting], [["mine"], ["mine"], 0, "", 0]);
  assert.equal(fake.listening, 0);
});

test("a recorder that stays busy for the whole wait is reported in plain words, and nothing is started", async () => {
  const fake = new Fake();
  fake.runningPolls = 1000;
  const job = await runOneShot(fake, ["render"], undefined, 1000, 600);
  assert.match(job.problem, /busy with something else/);
  assert.deepEqual([fake.starts.length, fake.listening], [0, 0]);
});

test("a short job that is still told the recorder is busy after waiting says so in plain words", async () => {
  const fake = new Fake();
  fake.busyTimes = 1000;
  const job = await runOneShot(fake, ["render"], undefined, 1000, 600);
  assert.equal(job.exit, null);
  assert.match(job.problem, /^The recorder is busy with something else/);
  assert.doesNotMatch(job.problem, /already in progress/);
  assert.equal(fake.starts.length, 0);
  assert.equal(fake.listening, 0);
});

test("a short job that cannot be started, or never ends, says so and cleans up", async () => {
  const bad = new Fake();
  bad.startError = new Error("The recorder needs the desktop app.");
  const a = await runOneShot(bad, ["probe"]);
  assert.deepEqual([a.exit, a.problem], [null, "The recorder needs the desktop app."]);
  assert.equal(bad.listening, 0);

  const slow = new Fake();
  const b = await runOneShot(slow, ["windows"], undefined, 20);
  assert.equal(b.exit, null);
  assert.equal(b.problem, "It did not finish in time, so it was stopped.");
  assert.equal(slow.stops.length, 1);
  assert.equal(slow.listening, 0);
  assert.ok(ONE_SHOT_LIMIT_MS >= 30_000);
});
