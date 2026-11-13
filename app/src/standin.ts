// SPDX-License-Identifier: Apache-2.0
// A pretend recorder and a recordings folder held in memory, for trying the screens in a plain browser and for the automatic checks of them.
//
// Nothing real is recorded. The pretend recorder says what the real one says, in the same words and the same shapes
// (docs/capture/capture-protocol-spec.md), so the screens behave here as they do with the real program. It is used only when the app is
// not running inside its own window, and the screens say so. A test can steer it through `window.__openstageStandIn`.

import type { RecorderBackend } from "./backend.ts";
import type { CaptureCheck, HotkeyBinding, HotkeyResult, StreamExit, StreamState } from "./recorder.ts";
import { isReleasePage } from "./updates.ts";

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
  /** Make the next recording end with the findings the real recorder makes about sound: the computer's sound drowns the voice (said twice, as the real one does), and the computer's sound was not heard. */
  soundFindings: boolean;
  /** Make the next video never finish by itself, so Cancel can be tried (a real video of a long recording takes minutes). */
  holdRender: boolean;
  /** What clicking a window does when the app asks for one to be picked: it chooses a window, nothing was clicked in time, or Escape was pressed. */
  pick: "window" | "none" | "cancel";
  /** Choose from the menu of the icon in the notification area, as if from the taskbar (`quick` or `stop`). */
  pressTray(id: string): void;
  /** Everything put on the clipboard, in order. */
  copied: string[];
  /** Make the next copy to the clipboard fail. */
  failNextCopy: boolean;
  /** What the window was asked to do, in order: `minimize`, `restore`. */
  windowCalls: string[];
  /** The icon's tooltip as last set. */
  tooltip: string;
  /** What Check for updates answers in the preview (the shell's JSON). The preview never goes online. */
  updateAnswer: string;
  /** The release pages the app asked to open. */
  openedPages: string[];
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

const WINDOWS = ["1. notepad.exe: Notes (800 by 600)", "2. editor.exe: Lesson plan - Editor (1920 by 1032)", "3. browser.exe: Week 3 - Browser (1920 by 1032)"];

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
  private mode: "record" | "render" | "other" = "other";
  private take = 1;
  private elapsed = 0;
  private folder = "";
  private title = "";
  private lastTakeMs = 0;
  private takes: { take: number; ms: number; state: string }[] = [];
  /** The `--camera` the recording was started with: `none`, or the number of a camera. */
  private camera = "none";
  /** The computer's own sound is recorded (`--output` was given and is not `none`), and the loudness asked for, as the real program writes it into the mixed video's `mix`. */
  private system = false;
  private gains = { microphoneGainDb: 0, systemGainDb: 0 };
  /** The words windows are hidden by (`--hide`, given once for each). */
  private hidden: string[] = [];
  /** What picking a window does here; set by the test through the controls. */
  pick: "window" | "none" | "cancel" = "window";
  /** What the author asked to have noted (`--interactions`): `off`, `no-keys` or `on`. A practice recording never notes anything. */
  private interactions = "off";
  /** The part of the display recorded (`--region`): left, top, width and height; absent for the whole display. */
  private region: { x: number; y: number; width: number; height: number } | undefined;
  /** A video that never finishes by itself: it runs until it is stopped. */
  holdRender = false;
  /** The recording ends with the recorder's findings about the sounds (see `StandInControls.soundFindings`). */
  soundFindings = false;

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

  private end(code: number | null, killed = false): void {
    clearInterval(this.ticker);
    this.ticker = undefined;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.running = false;
    this.paused = false;
    const exit: StreamExit = { code, killed, stderr_tail: "" };
    for (const l of [...this.exitListeners]) l(exit);
  }

  start(args: string[]): void {
    const opt = (name: string): string | undefined => {
      const i = args.indexOf(name);
      return i >= 0 ? args[i + 1] : undefined;
    };
    this.running = true;
    this.paused = false;
    this.mode = "other";
    this.camera = opt("--camera") ?? "none";
    this.system = (opt("--output") ?? "none") !== "none";
    this.gains = { microphoneGainDb: Number(opt("--mic-gain-db") ?? 0), systemGainDb: Number(opt("--system-gain-db") ?? 0) };
    this.interactions = (opt("--source") ?? "") === "synthetic" ? "off" : (opt("--interactions") ?? "off");
    this.hidden = args.flatMap((a, i) => (a === "--hide" ? [args[i + 1] ?? ""] : []));
    const box = (opt("--region") ?? "").split(/[,\s]+/).map(Number);
    this.region = box.length === 4 && box.every((n) => Number.isFinite(n)) ? { x: box[0] ?? 0, y: box[1] ?? 0, width: box[2] ?? 0, height: box[3] ?? 0 } : undefined;
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
      case "pick-window":
        this.later(() => {
          this.emit({ event: "check", check: "pick-window", ok: true, message: "Click the window you want to record. The click only chooses it: the window does not get the click, so nothing in it is pressed. Press Escape to cancel. This waits up to 30 seconds." });
          if (this.pick === "window") {
            this.emit({ event: "check", check: "window", ok: true, message: WINDOWS[1] ?? "" });
            this.emit({ event: "check", check: "window-chosen", ok: true, message: `Chosen: ${WINDOWS[1] ?? ""}. To record it, use --window "Lesson plan - Editor".` });
            this.end(0);
          } else {
            const why = this.pick === "cancel" ? "Escape was pressed, so no window was chosen." : "No window was clicked within 30 seconds, so none was chosen.";
            this.emit({ event: "check", check: "window-chosen", ok: false, message: why });
            this.end(1);
          }
        }, 60);
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
        this.render(opt("--out") ?? "video.mp4", opt("--project") ?? "", args.includes("--audio-only"), opt("--frame"));
        break;
      case "record":
        this.record(opt("--project") ?? "", opt("--title") ?? "Recording", Number(opt("--countdown-ms") ?? "0"));
        break;
      default:
        this.later(() => { this.emit({ event: "error", code: "unknown-command", message: `The pretend recorder does not know ${args[0] ?? "that"}.`, fatal: true }); this.end(2); }, 10);
    }
  }

  private render(out: string, project: string, audioOnly = false, frame?: string): void {
    this.mode = "render";
    const name = lastPart(out);
    // Like the real video maker, it reads the saved edit.json, and has nothing to make a video from without one.
    if (!this.files.has(`${lastPart(project)}/edit.json`)) {
      this.later(() => {
        this.emit({ event: "check", check: "edit", ok: false, message: `There is no edit to export: ${project}/edit.json does not exist. To export a recording as it was made, use --take <number>.` });
        this.end(1);
      }, 20);
      return;
    }
    this.later(() => this.emit({ event: "check", check: "edit", ok: true, message: "Exporting the edit in edit.json, 12.0 seconds long." }), 20);
    if (audioOnly && !name.toLowerCase().endsWith(".wav")) {
      // Like the real recorder: a sound-only export is a WAV file, and it says so before it makes anything.
      this.later(() => {
        this.emit({ event: "check", check: "export", ok: false, message: `A sound-only export is a WAV file, so its name has to end in .wav: ${out}` });
        this.end(1);
      }, 40);
      return;
    }
    if (frame !== undefined) {
      // One picture: no progress, and like the real recorder it needs a PNG name.
      const seconds = (Number(frame) / 1000).toFixed(1);
      if (!name.toLowerCase().endsWith(".png")) {
        this.later(() => {
          this.emit({ event: "check", check: "export", ok: false, message: `A single picture is a PNG file, so its name has to end in .png: ${out}` });
          this.end(1);
        }, 40);
        return;
      }
      if (this.holdRender) return;
      this.later(() => {
        this.emit({ event: "check", check: "export", ok: true, message: `Exported the picture at ${seconds} seconds as a PNG (1920 by 1080 pixels): ${out}` });
        this.emit({ event: "check", check: "frame-readback", ok: true, message: "The picture file reads back as 1920 by 1080 pixels, the size it should be." });
        this.end(0);
      }, 120);
      return;
    }
    [0, 40, 80].forEach((percent, i) =>
      this.later(() => this.emit({ event: "progress", task: "export", percent, message: audioOnly ? `Exporting: ${percent} percent of the sound.` : `Exporting: ${percent} percent.` }), 60 + i * 60),
    );
    if (this.holdRender) return;
    this.later(() => {
      if (audioOnly) {
        this.emit({ event: "check", check: "export", ok: true, message: `Exported 12.0 seconds of sound as a WAV file (two channels, 48000 samples a second): ${out}` });
        this.emit({ event: "check", check: "audio-readback", ok: true, message: "The sound file reads back as 12.0 seconds of sound, the length it should be." });
      } else {
        this.emit({ event: "check", check: "export", ok: true, message: `Made ${name}: 12.0 seconds long, 1920 by 1080, with sound.` });
      }
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
    if (this.hidden.length > 0) {
      this.later(() => this.emit({ event: "check", check: "hide", ok: true, message: `Hiding windows whose title or program name holds: ${this.hidden.join(", ")}. Wherever such a window is on the screen it is covered with a plain dark box in every picture, and nothing of it is kept.` }), 10);
    }
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
      const noted = this.interactions !== "off";
      this.files.set(`${dir}/take.json`, JSON.stringify({ id: t.take, state: t.state, durationMs: t.ms, media: [
        { file: "screen.mp4", kind: "screen", mix: this.gains, ...(this.region === undefined ? {} : { region: { display: 1, ...this.region } }) },
        { file: "mic.wav", kind: "microphone" },
        ...(this.system ? [{ file: "system.wav", kind: "system-audio" }] : []),
        ...(this.camera === "none" ? [] : [{ file: "webcam.mp4", kind: "webcam" }]),
        ...(noted ? [{ file: "events.jsonl", kind: "interactions", container: "jsonl", interactions: { display: 1, keys: this.interactions === "on" } }] : []),
      ] }));
      if (noted) this.files.set(`${dir}/events.jsonl`, this.clicksFor(t.ms));
    }
  }

  /**
   * The pretend recorder's log of what the author did: a few clicks that cluster into three moments, at places that are the same shares of the picture
   * whatever its size, in the display's own pixels (so a region's corner is added). Only those that fall inside the take are written.
   */
  private clicksFor(ms: number): string {
    const width = this.region?.width ?? 1920;
    const height = this.region?.height ?? 1080;
    const left = this.region?.x ?? 0;
    const top = this.region?.y ?? 0;
    const at = (fx: number, fy: number) => ({ x: left + Math.round(fx * width), y: top + Math.round(fy * height) });
    const clicks: { t: number; fx: number; fy: number; name: string }[] = [
      { t: 1500, fx: 0.3, fy: 0.4, name: "Open" },
      { t: 2300, fx: 0.31, fy: 0.41, name: "Open" },
      { t: 9000, fx: 0.8, fy: 0.75, name: "Save" },
      { t: 16_000, fx: 0.5, fy: 0.2, name: "" },
    ];
    const lines: string[] = [];
    for (const c of clicks) {
      if (c.t >= ms) continue;
      const p = at(c.fx, c.fy);
      lines.push(line({ t: c.t, type: "click", x: p.x, y: p.y, button: "left" }));
      if (c.name !== "") lines.push(line({ t: c.t, type: "element", name: c.name, role: "button" }));
    }
    return lines.length === 0 ? "" : `${lines.join("\n")}\n`;
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
    if (this.mode === "render") {
      // The real shell asks the program to stop, waits, and ends it by force. What the app sees is a program that was ended, with no result.
      this.end(null, true);
      return;
    }
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
      if (this.soundFindings) {
        const advice = "To put your voice about 6 decibels above it, make the computer's sound 19 decibels quieter in the mix (record with --system-gain-db -19), or balance mic.wav and system.wav in the editor: the separate files are not changed by the mix.";
        this.emit({ event: "check", check: "balance", ok: false, message: `The computer's sound is about 13 decibels louder than your voice while each is making sound, so in the mixed video your voice may be hard to hear. ${advice}` });
        this.emit({ event: "warning", code: "sound-balance", message: `Balance: the computer's sound is about 13 decibels louder than your voice. ${advice}` });
        this.emit({ event: "warning", code: "track-silent", message: "The computer's sound track is silent: nothing was heard from Speakers (Pretend) during this recording. If sound was playing, it was probably going to a different sound output than sound output 1, Speakers (Pretend). FIND SOUND OUTPUT.bat shows which one carries the sound." });
      }
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
  const trayListeners = new Set<(id: string) => void>();
  const controls: StandInControls = {
    pressKey: (id) => { for (const l of [...hotkeyListeners]) l(id); },
    recorderMissing: params.get("norecorder") === "1",
    failNextStart: "",
    files,
    revealed: [],
    started: [],
    soundFindings: false,
    holdRender: false,
    pick: "window",
    pressTray: (id) => { for (const l of [...trayListeners]) l(id); },
    copied: [],
    failNextCopy: false,
    windowCalls: [],
    tooltip: "OpenStage Recorder",
    updateAnswer: JSON.stringify({
      state: "newer",
      message: "A newer version is published: 0.1.0 alpha 99 (this copy is 0.1.0 alpha 4). This is the preview's pretend answer: nothing was checked.",
      url: "https://github.com/jasonswrench-beep/openstage-recorder/releases/tag/v0.1.0-alpha.99",
    }),
    openedPages: [],
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
    async recordingKeepEdit(_dir, name, file, text) {
      if (!/^edit-before-take-\d{1,4}\.json$/.test(file)) throw new Error(`${file} is not a name this app keeps an older edit under.`);
      if (files.has(fileKey(name, file))) throw new Error(`A copy of an older edit named ${file} is already in the recording, so another was not made and nothing was saved.`);
      files.set(fileKey(name, file), text);
    },
    async recordingMediaUrl(_dir, _name, rel) {
      // With ?media=1 (the automatic checks, served by dev-server.mjs --media-test) the sound files are a tone from another address than the
      // page, as in the installed app. Pictures are never offered: the pretend recorder makes none.
      if (params.get("media") === "1" && rel.endsWith(".wav")) return `${location.protocol}//${location.hostname}:${Number(location.port) + 1}/tone.wav`;
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
      recorder.pick = controls.pick;
      recorder.holdRender = controls.holdRender;
      controls.holdRender = false;
      recorder.soundFindings = controls.soundFindings;
      controls.soundFindings = false;
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
    async copyText(text) {
      if (controls.failNextCopy) {
        controls.failNextCopy = false;
        throw new Error("The pretend clipboard was told to fail.");
      }
      controls.copied.push(text);
    },
    async onTray(listener) {
      trayListeners.add(listener);
      return () => { trayListeners.delete(listener); };
    },
    async traySet(tooltip) {
      controls.tooltip = tooltip;
    },
    async windowMinimize() {
      controls.windowCalls.push("minimize");
    },
    async windowRestore() {
      controls.windowCalls.push("restore");
    },
    async recorderRelease() {
      return "0.1.0-alpha.4";
    },
    async checkForUpdates() {
      return controls.updateAnswer;
    },
    async openReleasePage(url) {
      if (!isReleasePage(url)) throw new Error("Only the pages of OpenStage Recorder's releases can be opened from here.");
      controls.openedPages.push(url);
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
