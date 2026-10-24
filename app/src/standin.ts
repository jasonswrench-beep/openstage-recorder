// SPDX-License-Identifier: Apache-2.0
// A pretend recorder and a recordings folder held in memory, for trying the screens in a plain browser and for the automatic checks of them.
//
// Nothing real is recorded. The pretend recorder says what the real one says, in the same words and the same shapes
// (docs/capture/capture-protocol-spec.md), so the screens behave here as they do with the real program. It is used only when the app is
// not running inside its own window, and the screens say so. A test can steer it through `window.__openstageStandIn`.

import type { RecorderBackend } from "./backend.ts";
import type { CaptureCheck, HotkeyBinding, HotkeyResult, StreamExit, StreamState } from "./recorder.ts";

/** What a test can do to the pretend recorder, and see of it. */
export interface StandInControls {
  /** Press one of the keys that work from any program, as if from another program. */
  pressKey(id: string): void;
  /** Make the recording program "not installed", so the screens show what they do then. */
  recorderMissing: boolean;
  /** Make the next start of the recorder fail, with this message. */
  failNextStart: string;
  /** The recordings folder as it is held: path to text. */
  files: Map<string, string>;
  /** What the app asked to have shown in the file manager. */
  revealed: string[];
  /** Every set of options the recorder was started with. */
  started: string[][];
}

declare global {
  interface Window {
    __openstageStandIn?: StandInControls;
  }
}

const NO_RECORDER = "The recording program was not found. OpenStage Recorder needs openstage-capture.exe: put it in the same folder as OpenStage Recorder, or set OPENSTAGE_CAPTURE to its full path, then open OpenStage Recorder again.";

const REAL_SOURCES = [
  { id: "synthetic", available: true, note: "A built-in test source." },
  { id: "display:1", available: true, note: "Display 1, 1920 by 1080, main display. Record it with: record --source screen --display 1. Sound is chosen separately, with --microphone and --output." },
  { id: "display:2", available: true, note: "Display 2, 1280 by 1024, at position 1920, 0. Record it with: record --source screen --display 2. Sound is chosen separately." },
  { id: "microphone:1", available: true, note: "Microphone 1: Microphone (Pretend USB), the default. Record it with: record --source screen --microphone 1." },
  { id: "output:1", available: true, note: "Sound output (records the sound it plays) 1: Speakers (Pretend), the default. Record it with: record --source screen --output 1." },
  { id: "camera:1", available: true, note: "Camera 1: Pretend webcam. Record it with: record --source screen --camera 1. It goes into webcam.mp4, beside the screen video." },
];

const WINDOWS = ["1. notepad.exe: Notes (800 by 600)", "2. WINWORD.EXE: Lesson plan - Word (1920 by 1032)", "3. chrome.exe: Week 3 - Google Chrome (1920 by 1032)"];

const SETUP_CHECKS: [string, string][] = [
  ["windows-version", "Windows 11, build 26200. Screen capture needs Windows 10 version 1903 or later."],
  ["screen-capture", "Received 151 pictures in 5.0 seconds from Display 1, 1920 by 1080, main display. Each picture is 1920 by 1080 pixels."],
  ["displays", "2 displays found."],
  ["video-encoder", "Windows can make MP4 video (H.264) on this computer."],
  ["sound-encoder", "Windows can make AAC sound on this computer."],
  ["microphone", "1 microphone found: Microphone (Pretend USB), the default."],
  ["sound-output", "The computer's own sound can be recorded from Speakers (Pretend)."],
  ["camera", "1 camera found: Pretend webcam."],
  ["disk-space", "There is room for about 40 hours of recording."],
];

const line = (o: Record<string, unknown>): string => JSON.stringify(o);

/** The folder name at the end of a path of either kind. */
const lastPart = (p: string): string => p.split(/[\\/]+/).filter((x) => x !== "").pop() ?? "";

class PretendRecorder {
  readonly lineListeners = new Set<(l: string) => void>();
  readonly exitListeners = new Set<(e: StreamExit) => void>();
  running = false;
  paused = false;
  private timers = new Set<ReturnType<typeof setTimeout>>();
  private ticker: ReturnType<typeof setInterval> | undefined;
  private mode: "record" | "other" = "other";
  private take = 1;
  private elapsed = 0;
  private folder = "";
  private title = "";
  private lastTakeMs = 0;
  private takes: { take: number; ms: number; state: string }[] = [];

  private readonly speed: number;
  private readonly files: Map<string, string>;

  constructor(speed: number, files: Map<string, string>) {
    this.speed = speed;
    this.files = files;
  }

  private later(fn: () => void, ms: number): void {
    const t = setTimeout(() => {
      this.timers.delete(t);
      fn();
    }, Math.max(1, Math.round(ms / this.speed)));
    this.timers.add(t);
  }

  private emit(o: Record<string, unknown>): void {
    const text = line(o);
    for (const l of [...this.lineListeners]) l(text);
  }

  private end(code: number): void {
    clearInterval(this.ticker);
    this.ticker = undefined;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.running = false;
    this.paused = false;
    const exit: StreamExit = { code, killed: false, stderr_tail: "" };
    for (const l of [...this.exitListeners]) l(exit);
  }

  start(args: string[]): void {
    const opt = (name: string): string | undefined => {
      const i = args.indexOf(name);
      return i >= 0 ? args[i + 1] : undefined;
    };
    this.running = true;
    this.paused = false;
    this.later(() => this.emit({ event: "hello", protocol: "0.1", program: "openstage-capture", programVersion: "0.1.0", platform: "pretend" }), 5);
    switch (args[0]) {
      case "probe":
        this.later(() => { this.emit({ event: "probe", platform: "pretend", sources: REAL_SOURCES }); this.end(0); }, 30);
        break;
      case "windows":
        this.later(() => {
          for (const w of WINDOWS) this.emit({ event: "check", check: "window", ok: true, message: w });
          this.emit({ event: "check", check: "windows", ok: true, message: `${WINDOWS.length} windows can be recorded.` });
          this.end(0);
        }, 30);
        break;
      case "setup-check":
        this.later(() => {
          for (const [check, message] of SETUP_CHECKS) this.emit({ event: "check", check, ok: true, message });
          this.end(0);
        }, 40);
        break;
      case "recover":
        this.later(() => this.end(0), 20);
        break;
      case "render":
        this.render(opt("--out") ?? "video.mp4");
        break;
      case "record":
        this.record(opt("--project") ?? "", opt("--title") ?? "Recording", Number(opt("--countdown-ms") ?? "0"));
        break;
      default:
        this.later(() => { this.emit({ event: "error", code: "unknown-command", message: `The pretend recorder does not know ${args[0] ?? "that"}.`, fatal: true }); this.end(2); }, 10);
    }
  }

  private render(out: string): void {
    const name = lastPart(out);
    this.later(() => this.emit({ event: "check", check: "edit", ok: true, message: "Exporting the edit in edit.json, 12.0 seconds long." }), 20);
    [0, 40, 80].forEach((percent, i) => this.later(() => this.emit({ event: "progress", task: "export", percent, message: `Exporting: ${percent} percent.` }), 60 + i * 60));
    this.later(() => {
      this.emit({ event: "check", check: "export", ok: true, message: `Made ${name}: 12.0 seconds long, 1920 by 1080, with sound.` });
      this.end(0);
    }, 260);
  }

  private record(folder: string, title: string, countdownMs: number): void {
    this.mode = "record";
    this.folder = folder;
    this.title = title;
    this.take = 1;
    this.elapsed = 0;
    this.takes = [];
    const begin = (): void => {
      this.emit({ event: "state", state: "recording", elapsedMs: 0, take: this.take });
      this.ticker = setInterval(() => {
        if (this.paused) return;
        this.elapsed += 1000;
        this.emit({ event: "state", state: "recording", elapsedMs: this.elapsed, take: this.take });
        this.emit({ event: "level", source: "mic", peak: 0.4, text: "good", elapsedMs: this.elapsed });
      }, Math.max(1, Math.round(1000 / this.speed)));
    };
    if (countdownMs > 0) {
      this.later(() => this.emit({ event: "state", state: "countdown", elapsedMs: 0, take: this.take }), 20);
      this.later(begin, 20 + countdownMs);
    } else {
      this.later(begin, 20);
    }
  }

  private finishTake(state: string): void {
    this.takes.push({ take: this.take, ms: this.elapsed, state });
    this.lastTakeMs = this.elapsed;
  }

  /** Put the recording into the folder the way the real program does: capture.json, and a take.json for each take. */
  private writeRecording(): void {
    const root = this.folder.replace(/[\\/]+$/, "");
    const name = lastPart(root);
    this.files.set(`${name}/capture.json`, JSON.stringify({ format: "openstage-capture-project", title: this.title }));
    for (const t of this.takes) {
      const dir = `${name}/takes/take-${String(t.take).padStart(3, "0")}`;
      this.files.set(`${dir}/take.json`, JSON.stringify({ id: t.take, state: t.state, durationMs: t.ms, media: [{ file: "screen.mp4", kind: "screen" }, { file: "mic.wav", kind: "microphone" }] }));
    }
  }

  command(text: string): void {
    let d: unknown;
    try {
      d = JSON.parse(text);
    } catch {
      return;
    }
    if (typeof d !== "object" || d === null || this.mode !== "record") return;
    const cmd = (d as Record<string, unknown>)["cmd"];
    const label = typeof (d as Record<string, unknown>)["label"] === "string" ? String((d as Record<string, unknown>)["label"]) : "";
    const live = this.ticker !== undefined;
    if (cmd === "pause" && live && !this.paused) {
      this.paused = true;
      this.emit({ event: "state", state: "paused", elapsedMs: this.elapsed, take: this.take });
    } else if (cmd === "resume" && live && this.paused) {
      this.paused = false;
      this.emit({ event: "state", state: "recording", elapsedMs: this.elapsed, take: this.take });
    } else if (cmd === "marker" && live) {
      this.emit({ event: "marker", label, elapsedMs: this.elapsed });
    } else if (cmd === "restart" && live) {
      const old = this.take;
      this.finishTake("setAside");
      this.take += 1;
      this.elapsed = 0;
      this.paused = false;
      this.emit({ event: "takeSetAside", take: old, nextTake: this.take });
      this.emit({ event: "state", state: "recording", elapsedMs: 0, take: this.take });
    } else if (cmd === "stop") {
      this.stop();
    } else if (cmd === "pause" || cmd === "resume") {
      this.emit({ event: "warning", code: "not-paused", message: cmd === "resume" ? "Resume only works while paused." : "Pause only works while recording." });
    }
  }

  /** Stop, and come back when the run has ended, as the real shell does. */
  stopAndWait(): Promise<boolean> {
    if (!this.running) return Promise.resolve(false);
    return new Promise((resolve) => {
      const ended = (): void => {
        this.exitListeners.delete(ended);
        resolve(true);
      };
      this.exitListeners.add(ended);
      this.stop();
    });
  }

  stop(): void {
    if (!this.running) return;
    if (this.mode !== "record") {
      this.end(0);
      return;
    }
    clearInterval(this.ticker);
    this.ticker = undefined;
    this.emit({ event: "state", state: "stopping", elapsedMs: this.elapsed, take: this.take });
    this.later(() => {
      this.finishTake("complete");
      this.writeRecording();
      this.emit({ event: "result", ok: true, project: this.folder, take: this.take, state: "complete", durationMs: this.lastTakeMs, segments: Math.max(1, Math.ceil(this.lastTakeMs / 2000)) });
      this.end(0);
    }, 60);
  }
}

/** The pretend backend, with a recordings folder held in memory. */
export function makePreviewBackend(options: { speed?: number } = {}): RecorderBackend & { readonly controls: StandInControls } {
  const params = typeof location === "undefined" ? new URLSearchParams() : new URLSearchParams(location.search);
  const speed = Math.max(1, options.speed ?? (Number(params.get("speed")) || 1));
  const files = new Map<string, string>();
  const hotkeyListeners = new Set<(id: string) => void>();
  const controls: StandInControls = {
    pressKey: (id) => { for (const l of [...hotkeyListeners]) l(id); },
    recorderMissing: params.get("norecorder") === "1",
    failNextStart: "",
    files,
    revealed: [],
    started: [],
  };
  if (typeof window !== "undefined") window.__openstageStandIn = controls;
  const recorder = new PretendRecorder(speed, files);

  const names = (): string[] => [...new Set([...files.keys()].filter((k) => k.endsWith("/capture.json")).map((k) => k.split("/")[0] ?? ""))].sort();
  const fileKey = (name: string, rel: string): string => `${name}/${rel}`;

  return {
    preview: true,
    controls,
    async defaultLibrary() {
      return "C:\\Users\\You\\Videos\\OpenStage Recorder";
    },
    async ensureLibrary() {},
    async pickFolder(title) {
      return params.get("folder") ?? window.prompt(title);
    },
    async listRecordings() {
      return names();
    },
    async recordingRead(_dir, name, rel) {
      return files.get(fileKey(name, rel));
    },
    async recordingFolders(_dir, name, rel) {
      const prefix = fileKey(name, rel === "" ? "" : `${rel}/`);
      return [...new Set([...files.keys()].filter((k) => k.startsWith(prefix) && k.slice(prefix.length).includes("/")).map((k) => k.slice(prefix.length).split("/")[0] ?? ""))].sort();
    },
    async recordingWriteEdit(_dir, name, text) {
      files.set(fileKey(name, "edit.json"), text);
    },
    async recordingMediaUrl() {
      throw new Error("The pretend recorder makes no pictures or sounds to play.");
    },
    async revealRecording(_dir, name, rel) {
      controls.revealed.push(rel === "" ? name : `${name}/${rel}`);
      throw new Error("This is a pretend recording, kept only inside this page, so there is no folder to show.");
    },
    async captureCheck(): Promise<CaptureCheck> {
      return controls.recorderMissing ? { ok: false, message: NO_RECORDER } : { ok: true, path: "the pretend recorder (nothing real is recorded)" };
    },
    async streamStart(args) {
      if (recorder.running) throw new Error("A recording is already in progress.");
      if (controls.recorderMissing) throw new Error(NO_RECORDER);
      if (controls.failNextStart !== "") {
        const message = controls.failNextStart;
        controls.failNextStart = "";
        throw new Error(message);
      }
      controls.started.push(args);
      recorder.start(args);
    },
    async streamSend(text) {
      if (!recorder.running) throw new Error("The recorder is not running.");
      recorder.command(text);
    },
    async streamSetPaused() {},
    async streamState(): Promise<StreamState> {
      return { running: recorder.running, paused: recorder.paused };
    },
    async streamStop() {
      return recorder.stopAndWait();
    },
    async onStreamLine(listener) {
      recorder.lineListeners.add(listener);
      return () => { recorder.lineListeners.delete(listener); };
    },
    async onStreamExit(listener) {
      recorder.exitListeners.add(listener);
      return () => { recorder.exitListeners.delete(listener); };
    },
    async hotkeysSet(bindings: HotkeyBinding[]): Promise<HotkeyResult[]> {
      return bindings.map((b) => ({ id: b.id, ok: true, message: "" }));
    },
    async hotkeysClear() {},
    async onHotkey(listener) {
      hotkeyListeners.add(listener);
      return () => { hotkeyListeners.delete(listener); };
    },
    async confirm(message) {
      return window.confirm(message);
    },
    async setTitle(title) {
      document.title = title;
    },
    guardClose(question) {
      window.addEventListener("beforeunload", (e) => {
        if (question() !== null) e.preventDefault();
      });
    },
  };
}
