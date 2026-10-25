// SPDX-License-Identifier: Apache-2.0
// The plain part of recording: what the author chooses, the options the recorder is started with, what its lines mean,
// and the words for each state. No screen and no backend are used here, so every rule can be tested with Node alone.
//
// The recording program has no window of its own. The app starts it, sends it commands and reads what it prints, one
// line of JSON at a time (docs/capture/capture-protocol-spec.md). Everything it says is turned into plain sentences here, so that a state is
// never only something to look at: the dialog shows the sentences and speaks the ones that matter.

// ---- what the author chooses

export type Target = "screen" | "window" | "region";
export type Interactions = "off" | "no-keys" | "on";

export interface RecordSettings {
  /** What the recording is called. It names the folder that holds it, and is stored as the recording's title. */
  name: string;
  /** Record made-up picture and sound instead of the screen, to try the controls. Nothing real is recorded. */
  practice: boolean;
  target: Target;
  /** The screen to record, counted from 1 (1 is the main screen). */
  display: number;
  /** For `window`: words from the window's title, as the recorder takes them. */
  window: string;
  /** For `region`: how far from the left, how far from the top, the width and the height, in pixels. */
  region: { left: string; top: string; width: string; height: string };
  /** `default`, `none`, or a number from the recorder's own list. */
  microphone: string;
  output: string;
  camera: string;
  interactions: Interactions;
  /** How much louder (positive) or quieter (negative) your voice is in the mix inside the video, in whole decibels. 0 leaves it as heard. */
  micGainDb: number;
  /** The same for the computer's own sound. The separate sound files are never changed by this. */
  systemGainDb: number;
  /** Whole seconds, 0 to 10. */
  countdownSeconds: number;
  /** The recorder's own short sound for each step. */
  sounds: boolean;
}

export function defaultSettings(): RecordSettings {
  return {
    name: "Recording", practice: false, target: "screen", display: 1, window: "",
    region: { left: "0", top: "0", width: "1280", height: "720" },
    microphone: "default", output: "default", camera: "none", interactions: "off", micGainDb: 0, systemGainDb: 0, countdownSeconds: 3, sounds: true,
  };
}

export const MIN_REGION = 64;
/** The range the recording program accepts for how loud a sound is in the mix, in decibels (the same as MIN_GAIN_DB and MAX_GAIN_DB in its Rust code). */
export const MIN_GAIN_DB = -40;
export const MAX_GAIN_DB = 20;
export const MAX_COUNTDOWN = 10;

/** The folder name for a recording: letters, digits, spaces, hyphens and underscores, nothing that could leave the recordings folder. */
export function safeName(name: string): string {
  const plain = name.normalize("NFKC").replace(/[^\p{L}\p{N} _-]+/gu, " ").replace(/\s+/g, " ").trim().slice(0, 60).trim();
  return plain;
}

/**
 * Where a recording is kept: a folder named for the recording and ending in `.capture`, inside the author's recordings folder.
 * The separator follows the one the recordings folder already uses.
 */
export function recordingPath(library: string, name: string): string {
  const sep = library.includes("\\") ? "\\" : "/";
  const base = library.replace(/[\\/]+$/, "");
  return `${base}${sep}${safeName(name)}.capture`;
}

/** The folder name a recording of this name gets, such as `Week 3.capture`. */
export function recordingFolderName(name: string): string {
  return `${safeName(name)}.capture`;
}

const isWhole = (text: string): boolean => /^\d{1,6}$/.test(text.trim());

/** What is wrong with the choices, in words, or null if the recorder can be started with them. */
export function settingsProblem(s: RecordSettings): string | null {
  if (safeName(s.name) === "") return "Give the recording a name, using letters or numbers.";
  if (!Number.isInteger(s.countdownSeconds) || s.countdownSeconds < 0 || s.countdownSeconds > MAX_COUNTDOWN) {
    return `The countdown is a whole number of seconds from 0 to ${MAX_COUNTDOWN}.`;
  }
  if (s.practice) return null;
  for (const [what, db] of [["your voice", s.micGainDb], ["the computer's sound", s.systemGainDb]] as const) {
    if (!Number.isInteger(db) || db < MIN_GAIN_DB || db > MAX_GAIN_DB) {
      return `How loud ${what} is in the video is a whole number of decibels from ${MIN_GAIN_DB} to ${MAX_GAIN_DB}. 0 leaves it as heard, and a negative number makes it quieter.`;
    }
  }
  if (!Number.isInteger(s.display) || s.display < 1) return "Choose a screen.";
  if (s.target === "window" && s.window.trim() === "") return "Choose the window to record. Press Look for windows to list them.";
  if (s.target === "region") {
    const { left, top, width, height } = s.region;
    if (![left, top, width, height].every(isWhole)) return "The part of the screen is four whole numbers: how far from the left, how far from the top, the width and the height.";
    if (Number(width) < MIN_REGION || Number(height) < MIN_REGION) return `The part of the screen must be at least ${MIN_REGION} pixels wide and ${MIN_REGION} pixels high.`;
  }
  return null;
}

/** The options the recorder is started with. Call `settingsProblem` first: this does not check. */
export function recordArgs(s: RecordSettings, folder: string): string[] {
  const args = ["record", "--project", folder, "--title", safeName(s.name), "--countdown-ms", String(s.countdownSeconds * 1000), "--cues", s.sounds ? "on" : "off"];
  if (s.practice) return [...args, "--source", "synthetic"];
  args.push("--source", "screen", "--display", String(s.display));
  if (s.target === "window") args.push("--window", s.window.trim());
  if (s.target === "region") args.push("--region", [s.region.left, s.region.top, s.region.width, s.region.height].map((n) => String(Number(n))).join(","));
  args.push("--microphone", s.microphone, "--output", s.output, "--camera", s.camera, "--interactions", s.interactions);
  // Only when changed, so a recording made with nothing changed is asked for exactly as before.
  if (s.micGainDb !== 0) args.push("--mic-gain-db", String(s.micGainDb));
  if (s.systemGainDb !== 0) args.push("--system-gain-db", String(s.systemGainDb));
  return args;
}

// ---- what the recorder can use

export type SourceKind = "display" | "microphone" | "output" | "camera";

export interface Source {
  kind: SourceKind;
  /** The number the recorder takes for it. */
  number: number;
  /** What to call it: "Display 1, 1920 by 1080, main display", "Microphone (Shure MV7)". */
  label: string;
  isDefault: boolean;
}

/** The sources a `probe` line lists: screens, microphones, sound outputs and cameras. Anything else in the line, or any other line, gives none. */
export function parseProbe(line: string): Source[] {
  const d = parseJson(line);
  if (!d || d["event"] !== "probe" || !Array.isArray(d["sources"])) return [];
  const out: Source[] = [];
  for (const raw of d["sources"] as unknown[]) {
    if (typeof raw !== "object" || raw === null) continue;
    const s = raw as Record<string, unknown>;
    const id = typeof s["id"] === "string" ? s["id"] : "";
    const note = typeof s["note"] === "string" ? s["note"] : "";
    const m = /^(display|microphone|output|camera):(\d{1,3})$/.exec(id);
    if (!m || s["available"] !== true) continue;
    const kind = m[1] as SourceKind;
    let label = note.split(/\. Record it with/)[0] ?? note;
    if (kind !== "display") label = label.replace(/^[^:]*?\d+: /, "");
    const isDefault = /, the default$/.test(label);
    label = label.replace(/, the default$/, "").trim();
    out.push({ kind, number: Number(m[2]), label: label.slice(0, 200) || `${kind} ${m[2]}`, isDefault });
  }
  return out;
}

export interface WindowChoice {
  number: number;
  /** The whole line: "2. WINWORD.EXE: Lesson - Word (1920 by 1032)". */
  label: string;
  /** The words the recorder is asked to match: the window's title. */
  title: string;
}

/** A window from one `window` finding ("3. notepad.exe: Notes (800 by 600)"), or null for any other finding. */
export function parseWindow(line: string): WindowChoice | null {
  const d = parseJson(line);
  if (!d || d["event"] !== "check" || d["check"] !== "window" || typeof d["message"] !== "string") return null;
  const label = d["message"].trim().slice(0, 300);
  const m = /^(\d{1,4})\. ([^:]*): (.*?)(?: \(\d+ by \d+\))?$/s.exec(label);
  if (!m) return null;
  const title = (m[3] ?? "").trim();
  return title === "" ? null : { number: Number(m[1]), label, title };
}

// ---- what the recorder says while it records

export type Phase = "idle" | "starting" | "countdown" | "recording" | "paused" | "stopping" | "finished" | "failed";

export interface Marker {
  label: string;
  elapsedMs: number;
}

export interface Note {
  ok: boolean;
  text: string;
  /** What the note is about, so two findings about the same thing are not both listed (the balance of the sounds is found twice). */
  topic?: string;
}

export interface Session {
  phase: Phase;
  take: number;
  elapsedMs: number;
  /** The recorder is noting what the author does with the mouse and keyboard. */
  watching: boolean;
  /** The last words for each sound level: "good", "quiet", "too loud". */
  levels: { mic?: string; system?: string };
  markers: Marker[];
  notes: Note[];
  /** Takes the author started again, which are set aside and not erased. */
  setAside: number;
  folder: string;
  result: { ok: boolean; take: number; state: string; durationMs: number; segments: number } | null;
  /** Why it failed, in words. */
  problem: string;
}

export function initialSession(folder = ""): Session {
  return { phase: "idle", take: 0, elapsedMs: 0, watching: false, levels: {}, markers: [], notes: [], setAside: 0, folder, result: null, problem: "" };
}

/** The checks the author is always told about when they come, because they say what is being kept. */
const ALWAYS_SAID = new Set(["interactions", "interactions-on", "interactions-log", "region", "camera", "window", "sound-devices", "cues"]);
const MAX_NOTES = 60;

/**
 * Findings about how loud the sounds are, or about the computer's sound not being heard. They are advice, not a recording that went wrong: the
 * recording is whole and nothing is lost, and the author can still change it afterwards. So they are said as notes, with a next step an author can
 * follow, and not as problems. The recorder's own words are for people who use it from a command line, so the parts that name its options are
 * put in the words of this app. A finding that is not recognised comes back unchanged. Returns null for anything that is not sound advice.
 *
 * A silent microphone is not advice: a recording with no voice is a real problem, and stays one.
 */
export function soundAdvice(kind: "check" | "warning", name: string, message: string): { text: string; topic: string } | null {
  if ((kind === "check" && name === "balance") || (kind === "warning" && /^Balance:/.test(message))) {
    const text = message
      .replace(/^Balance: /, "")
      .replace(/\(record with --system-gain-db (-?\d+)\)/g, "(put $1 in the computer's sound box on the Record screen before recording)")
      .replace(/, or balance mic\.wav and system\.wav in the editor: the separate files are not changed by the mix\./, ", or change it afterwards under Sound balance when you edit the recording. The separate sound files are never changed.")
      .replace(/raise it in the editor, or record with a higher --system-gain-db\./, "raise it under Sound balance when you edit the recording, or put a higher number in the computer's sound box on the Record screen before recording.");
    return { text: text.charAt(0).toUpperCase() + text.slice(1), topic: "balance" };
  }
  if (kind === "warning" && name === "track-silent" && /^The computer's sound track is silent/.test(message)) {
    const device = /nothing was heard from (.+?) during this recording\./.exec(message)?.[1];
    return {
      text: `Nothing was heard from the computer's sound${device === undefined ? "" : ` (${device})`} during this recording. That is normal if nothing was playing. If something was playing, it may have gone to a different sound output: choose the right one under "The computer's own sound" on the Record screen.`,
      topic: "computer-silent",
    };
  }
  if (kind === "warning" && name === "sound-went-quiet") return { text: message, topic: "sound-went-quiet" };
  return null;
}

function parseJson(line: string): Record<string, unknown> | null {
  try {
    const d: unknown = JSON.parse(line);
    return typeof d === "object" && d !== null && !Array.isArray(d) ? (d as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown, max = 600): string => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : 0);

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** A length of time in words: "45 seconds", "1 minute 5 seconds", "1 hour 2 minutes". */
export function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return m > 0 ? `${plural(h, "hour", "hours")} ${plural(m, "minute", "minutes")}` : plural(h, "hour", "hours");
  if (m > 0) return s > 0 ? `${plural(m, "minute", "minutes")} ${plural(s, "second", "seconds")}` : plural(m, "minute", "minutes");
  return plural(s, "second", "seconds");
}

/** The state of a session as a sentence. */
export function describeSession(s: Session): string {
  const levels = [s.levels.mic ? `microphone ${s.levels.mic}` : "", s.levels.system ? `the computer's sound ${s.levels.system}` : ""].filter(Boolean).join(", ");
  switch (s.phase) {
    case "idle": return "Not recording.";
    case "starting": return "Starting the recorder.";
    case "countdown": return `Counting down to take ${Math.max(1, s.take)}. Recording starts when the countdown ends.`;
    case "recording": return `Recording take ${s.take}, ${formatTime(s.elapsedMs)}.${s.watching ? " Interaction recording is on." : ""}${levels ? ` Sound: ${levels}.` : ""}`;
    case "paused": return `Paused at ${formatTime(s.elapsedMs)}. Time spent paused is not recorded.`;
    case "stopping": return "Stopping, and finishing the files.";
    case "finished": return s.result ? `Finished. Take ${s.result.take} is complete: ${formatTime(s.result.durationMs)}.` : "Finished.";
    case "failed": return s.problem === "" ? "The recording did not finish." : s.problem;
  }
}

export interface Update {
  session: Session;
  /** What to say aloud for this line, if anything. */
  say: string[];
}

/**
 * Apply one line the recorder printed. A line that is not understood changes nothing, because a reader must ignore what it does not know
 * (protocol rule 2). Levels and the repeated state reports change what is shown but are never spoken.
 */
export function applyLine(s: Session, line: string): Update {
  const d = parseJson(line);
  if (!d || typeof d["event"] !== "string") return { session: s, say: [] };
  const say: string[] = [];
  let next: Session = { ...s };
  switch (d["event"]) {
    case "hello": {
      if (d["protocol"] !== "0.1") {
        const why = `This recorder speaks version ${str(d["protocol"], 20) || "unknown"} of the recorder's language, and this app knows version 0.1, so they cannot work together yet.`;
        next = { ...next, phase: "failed", problem: why };
        say.push(why);
      }
      break;
    }
    case "state": {
      const state = str(d["state"], 20);
      const take = num(d["take"]) || next.take;
      const phase: Phase | null = state === "countdown" ? "countdown" : state === "recording" ? "recording" : state === "paused" ? "paused" : state === "stopping" ? "stopping" : null;
      const watching = d["watching"] === true;
      const changed = phase !== null && (phase !== next.phase || (phase === "recording" && take !== next.take));
      next = { ...next, take, elapsedMs: num(d["elapsedMs"]), watching };
      if (phase !== null && next.phase !== "finished" && next.phase !== "failed") next.phase = phase;
      if (changed && phase !== null && next.phase === phase) {
        if (phase === "countdown") say.push(`Counting down to take ${take}. Recording starts when the countdown ends.`);
        else if (phase === "recording") say.push(`Recording take ${take}.${watching ? " Interaction recording is on." : ""}`);
        else if (phase === "paused") say.push("Paused. Time spent paused is not recorded.");
        else if (phase === "stopping") say.push("Stopping, and finishing the files.");
      }
      break;
    }
    case "level": {
      const text = str(d["text"], 20);
      if (d["source"] === "mic") next = { ...next, levels: { ...next.levels, mic: text } };
      else if (d["source"] === "system") next = { ...next, levels: { ...next.levels, system: text } };
      break;
    }
    case "marker": {
      const label = str(d["label"], 120);
      const at = num(d["elapsedMs"]);
      next = { ...next, markers: [...next.markers, { label, elapsedMs: at }] };
      say.push(`Marker added at ${formatTime(at)}${label ? `: ${label}` : ""}.`);
      break;
    }
    case "takeSetAside": {
      next = { ...next, setAside: next.setAside + 1 };
      say.push(`Starting again. Take ${num(d["take"])} was set aside, not erased.`);
      break;
    }
    case "warning": {
      const message = str(d["message"]);
      const advice = message === "" ? null : soundAdvice("warning", str(d["code"], 60), message);
      if (advice !== null) {
        if (!next.notes.some((n) => n.topic === advice.topic)) {
          next = { ...next, notes: [...next.notes, { ok: true, text: advice.text, topic: advice.topic }].slice(-MAX_NOTES) };
          say.push(`Note. ${advice.text}`);
        }
      } else if (message !== "") {
        const fresh = !next.notes.some((n) => n.text === message);
        if (fresh) {
          next = { ...next, notes: [...next.notes, { ok: false, text: message }].slice(-MAX_NOTES) };
          say.push(message);
        }
      }
      break;
    }
    case "error": {
      const message = str(d["message"]) || "The recorder reported a problem and gave no details.";
      next = { ...next, notes: [...next.notes, { ok: false, text: message }].slice(-MAX_NOTES) };
      if (d["fatal"] === true) next.problem = message;
      say.push(d["fatal"] === true ? `The recording is stopping because of a problem. ${message}` : message);
      break;
    }
    case "check": {
      const name = str(d["check"], 60);
      const message = str(d["message"]);
      if (name !== "" && message !== "" && typeof d["ok"] === "boolean") {
        const ok = d["ok"];
        const advice = ok ? null : soundAdvice("check", name, message);
        if (advice !== null) {
          if (!next.notes.some((n) => n.topic === advice.topic)) {
            next = { ...next, notes: [...next.notes, { ok: true, text: advice.text, topic: advice.topic }].slice(-MAX_NOTES) };
            say.push(`Note. ${advice.text}`);
          }
          break;
        }
        next = { ...next, notes: [...next.notes, { ok, text: message }].slice(-MAX_NOTES) };
        if (!ok || ALWAYS_SAID.has(name)) say.push(ok ? message : `Problem. ${message}`);
      }
      break;
    }
    case "result": {
      const ok = d["ok"] === true;
      const result = { ok, take: num(d["take"]), state: str(d["state"], 20), durationMs: num(d["durationMs"]), segments: num(d["segments"]) };
      next = { ...next, result, elapsedMs: result.durationMs };
      if (ok) {
        next.phase = "finished";
        say.push(`Finished. Take ${result.take} is complete: ${formatTime(result.durationMs)}.`);
      } else {
        next.phase = "failed";
        if (next.problem === "") next.problem = "The recording did not finish properly. Whatever was recorded has been kept.";
        say.push(next.problem);
      }
      break;
    }
    default:
      break;
  }
  return { session: next, say };
}

/** One command for the recorder, as the line it is sent. */
export function commandLine(cmd: "pause" | "resume" | "stop" | "restart" | "marker", label = ""): string {
  const clean = label.replace(/\s+/g, " ").trim().slice(0, 120);
  return cmd === "marker" && clean !== "" ? JSON.stringify({ cmd, label: clean }) : JSON.stringify({ cmd });
}

/** The line that asks the recorder to finish cleanly, for the shell's Stop (which sends it, closes the input, waits, and only then ends the program). */
export const STOP_LINE = '{"cmd":"stop"}';

/** What a key does in this phase, so a press that cannot do anything says why instead of doing nothing. */
export function keyAction(id: string, phase: Phase): { cmd: "pause" | "resume" | "stop" | "restart" } | { say: string } {
  const live = phase === "recording" || phase === "paused";
  if (id === "pause") {
    if (phase === "recording") return { cmd: "pause" };
    if (phase === "paused") return { cmd: "resume" };
    return { say: "Pause works only while recording." };
  }
  if (id === "stop") return phase === "countdown" || live ? { cmd: "stop" } : { say: "Nothing is recording." };
  if (id === "restart") return live ? { cmd: "restart" } : { say: "Starting again works only while recording." };
  return { say: "That key does nothing here." };
}
