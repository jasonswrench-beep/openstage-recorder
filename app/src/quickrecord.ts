// SPDX-License-Identifier: Apache-2.0
// Quick record: one press records the screen with the choices already made on the Record screen, one press stops it, and what is left is a finished
// video and its path on the clipboard, ready to paste into an email or a message.
//
// It adds no new settings. It uses the Record screen's choices as they stand (the screen, the voice, the computer's sound, the webcam, the countdown, the
// sounds for each step), with a name made from the date and time, and it says in one sentence what it is going to do before anyone presses it. A window is
// not remembered from one run to the next, so a quick recording of "one window" records the whole screen instead, and the sentence says so.
//
// The plain rules (the name, the choices, the sentence) are here and need no screen. The `QuickRecord` object follows a recording from its start to a
// finished video, using the same recorder, the same recording folder and the same video maker as the rest of the app, so a quick recording is an ordinary
// recording that can be opened for editing afterwards.

import { modelLengthMs } from "../../capture-edit/src/index.ts";
import { editText, readProject } from "../../capture-timeline/src/project.ts";
import type { RecorderBackend } from "./backend.ts";
import { runOneShot, type CaptureBackend, type RecorderController } from "./capturecontroller.ts";
import { applyExportLine, exportPlan, finishedWords, initialExport } from "./captureexport.ts";
import { hideWords, recordingPath, recordingFolderName, settingsProblem, type Phase, type RecordSettings } from "./capturesession.ts";
import { EXPORT_LIMIT_MS } from "./editview.ts";
import { DEFAULT_HOTKEYS } from "./recorder.ts";
import { recordingFolder, recordingNameOf, type RecordingBackend } from "./recordingfolder.ts";

/** A name for a quick recording that no other has: `Quick recording 2026-11-01 1405`, then `... 2`, `... 3` if that minute is taken. */
export function quickName(now: Date, existing: readonly string[]): string {
  const two = (n: number): string => String(n).padStart(2, "0");
  const base = `Quick recording ${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}${two(now.getMinutes())}`;
  let name = base;
  for (let n = 2; existing.includes(recordingFolderName(name)); n += 1) name = `${base} ${n}`;
  return name;
}

/** The choices a quick recording is made with: the Record screen's, with its own name, for real, and the whole screen when a window was chosen. */
export function quickSettings(base: RecordSettings, name: string): RecordSettings {
  return {
    ...base,
    name,
    practice: false,
    target: base.target === "window" ? "screen" : base.target,
    window: "",
    region: { ...base.region },
  };
}

const KEYS = new Map(DEFAULT_HOTKEYS.map((k) => [k.id, k.keys]));

const voiceWords = (microphone: string): string =>
  microphone === "none" ? "no voice" : microphone === "default" ? "your voice (the default microphone)" : `your voice (microphone ${microphone})`;
const soundWords = (output: string): string =>
  output === "none" ? "none of the computer's sound" : output === "default" ? "the computer's own sound" : `the computer's own sound (output ${output})`;
const cameraWords = (camera: string): string => (camera === "none" ? "no webcam" : camera === "default" ? "the first webcam" : `webcam ${camera}`);

/** What a quick recording will do, in one honest sentence, worked out from the same choices it is started with. */
export function describeQuick(base: RecordSettings): string {
  const s = quickSettings(base, "x");
  const what =
    s.target === "region"
      ? `the part of screen ${s.display} that is chosen above (${s.region.width} by ${s.region.height} pixels)`
      : `the whole of screen ${s.display}${base.target === "window" ? " (a window is not remembered from one time to the next, so a quick recording takes the whole screen)" : ""}`;
  const start = s.countdownSeconds === 0 ? "at once" : `after a countdown of ${s.countdownSeconds} ${s.countdownSeconds === 1 ? "second" : "seconds"}`;
  const stop = KEYS.get("stop") ?? "the stop key";
  return `Quick record starts ${start} and records ${what}, with ${voiceWords(s.microphone)}, ${soundWords(s.output)} and ${cameraWords(s.camera)}. Stop it with ${stop} from any program, the Stop button, or Stop recording in the menu of the icon in the notification area. ${s.interactions === "off" ? "" : "The mouse is noted too: where it goes and where you click. "}${hideWords(s.hide).length === 0 || s.target === "window" ? "" : `Windows with ${hideWords(s.hide).join(", ")} in their title or program name are covered in the video. `}Then the video is made and its path is copied, ready to paste.`;
}

/** The icon's tooltip: what the recorder is doing, short enough to read at a glance. */
export function trayWords(recording: Phase, quick: QuickPhase): string {
  const name = "OpenStage Recorder";
  if (quick === "making") return `${name}: making the video of your quick recording`;
  if (quick === "ready") return `${name}: your quick recording is ready`;
  const stop = KEYS.get("stop") ?? "the stop key";
  switch (recording) {
    case "starting": case "countdown": return `${name}: starting a recording`;
    case "recording": return `${name}: recording. Stop with ${stop}`;
    case "paused": return `${name}: recording paused`;
    case "stopping": return `${name}: finishing the recording`;
    default: return name;
  }
}

export type QuickPhase = "idle" | "recording" | "making" | "ready" | "failed";

export interface QuickState {
  phase: QuickPhase;
  /** The recording's folder name, such as `Quick recording 2026-11-01 1405.capture`; empty when idle. */
  recording: string;
  /** What to tell the author now. */
  message: string;
  /** The finished video's full path; empty until it exists. */
  video: string;
  /** The same place inside the recording (`exports/Name.mp4`), for showing it. */
  videoRel: string;
  /** Whether the path is on the clipboard: null if it has not been tried. */
  copied: boolean | null;
  /** It was started from the icon in the notification area, with the window out of the way. */
  fromTray: boolean;
}

const idle = (): QuickState => ({ phase: "idle", recording: "", message: "", video: "", videoRel: "", copied: null, fromTray: false });

export type QuickListener = (state: QuickState, say: string[]) => void;

export type QuickBackend = CaptureBackend & RecordingBackend & Pick<RecorderBackend, "ensureLibrary" | "copyText">;

const why = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export class QuickRecord {
  private s: QuickState = idle();
  private readonly listeners = new Set<QuickListener>();
  private readonly off: () => void;
  private making = false;

  private readonly b: QuickBackend;
  private readonly c: RecorderController;
  /** The recordings folder in use, asked each time so a change of folder is followed. */
  private readonly library: () => string;

  constructor(b: QuickBackend, c: RecorderController, library: () => string) {
    this.b = b;
    this.c = c;
    this.library = library;
    this.off = c.subscribe((session) => {
      if (this.s.phase !== "recording") return;
      if (session.phase === "finished" && session.folder !== "") void this.make(session.folder);
      else if (session.phase === "failed") {
        this.set({ phase: "failed", message: `The recording did not finish. ${session.problem}`.trim() }, [`The recording did not finish. ${session.problem}`.trim()]);
      }
    });
  }

  get state(): QuickState {
    return this.s;
  }

  /** A quick recording is going, or its video is being made. */
  get busy(): boolean {
    return this.s.phase === "recording" || this.s.phase === "making";
  }

  subscribe(listener: QuickListener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  destroy(): void {
    this.off();
    this.listeners.clear();
  }

  private set(change: Partial<QuickState>, say: string[] = []): void {
    this.s = { ...this.s, ...change };
    for (const l of [...this.listeners]) l(this.s, say);
  }

  /** Forget a finished or failed quick recording (the recording itself stays). */
  dismiss(): void {
    if (!this.busy) this.set({ ...idle() });
  }

  /** Start a quick recording. Returns why it could not be started, or null once the recorder has been started. */
  async start(base: RecordSettings, existing: readonly string[], fromTray = false, now: Date = new Date()): Promise<string | null> {
    if (this.busy || this.c.busy) return "A recording is already going.";
    const library = this.library();
    if (library === "") return "Choose a recordings folder first, with the button under Your recordings.";
    const name = quickName(now, existing);
    const settings = quickSettings(base, name);
    const problem = settingsProblem(settings);
    if (problem !== null) return problem;
    try {
      await this.b.ensureLibrary(library);
    } catch (err) {
      return `The recordings folder could not be used. ${why(err)}`;
    }
    this.s = { ...idle(), phase: "recording", recording: recordingFolderName(name), message: "Starting a quick recording.", fromTray };
    const refused = await this.c.start(settings, recordingPath(library, name));
    if (refused !== null) {
      this.s = idle();
      return refused;
    }
    this.set({}, ["Starting a quick recording."]);
    return null;
  }

  /** Make the video from the recording just finished: an edit made from its takes, saved, and then the video maker. Then copy the path. */
  private async make(folderPath: string): Promise<void> {
    if (this.making) return;
    this.making = true;
    try {
      const library = this.library();
      const name = recordingNameOf(folderPath);
      this.set({ phase: "making", recording: name, message: "Making the video from your recording. This can take a little while." }, ["Making the video from your recording. This can take a little while."]);
      const folder = recordingFolder(this.b, library, name);
      const opened = await readProject(folder);
      if (!opened.ok) return this.fail(opened.message);
      if (modelLengthMs(opened.project.model) === 0) return this.fail("Nothing was recorded, so there is no video to make. The recording is kept in Your recordings.");
      if (!(await folder.writeText("edit.json", editText(opened.project.model)))) {
        return this.fail("The recording could not be prepared for a video, so none was made. It is kept in Your recordings, and can be opened for editing from there.");
      }
      const plan = exportPlan(library, name);
      let progress = initialExport();
      const job = await runOneShot(this.b, plan.args, (line) => {
        const update = applyExportLine(progress, line);
        progress = update.state;
        if (update.say.length > 0) this.set({ message: update.say.join(" ") }, update.say);
      }, EXPORT_LIMIT_MS);
      const done = finishedWords(progress, job.exit, job.problem, "video");
      if (!done.made) return this.fail(done.sentence);
      this.set({ video: plan.out, videoRel: plan.rel, message: done.sentence });
      const copied = await this.copyPath();
      const tail = copied ? "Its path is copied: paste it where you need it." : "The path could not be copied. Press Copy the path, or select it above and copy it.";
      this.set({ phase: "ready", message: `${done.sentence} ${tail}` }, [`${done.sentence} ${tail}`]);
    } finally {
      this.making = false;
    }
  }

  private fail(message: string): void {
    this.set({ phase: "failed", message }, [message]);
  }

  /** Put the finished video's path on the clipboard. Says whether it worked, and keeps the answer. */
  async copyPath(): Promise<boolean> {
    if (this.s.video === "") return false;
    let ok = false;
    try {
      await this.b.copyText(this.s.video);
      ok = true;
    } catch {
      ok = false;
    }
    this.set({ copied: ok });
    return ok;
  }
}
