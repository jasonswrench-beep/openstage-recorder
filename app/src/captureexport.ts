// SPDX-License-Identifier: Apache-2.0
// Making a finished video from an edit of a recording, as far as the app goes: the options the recorder is asked with, what its lines mean
// while it works, and how it went in words. No screen and no backend are used here, so every rule can be tested with Node alone.
//
// The recorder's `render` command turns a recording and its saved edit into an MP4. It says how far it has got (about every tenth, in words, so
// that someone who cannot see a bar can hear it), what it made, and then reads the finished video back the way a player would. The video is
// written inside the recording, in its `exports` folder, as a `.part` file that is renamed only when it is whole, so a half-made video is never mistaken for a finished one.

import type { StreamExit } from "./recorder.ts";

export interface ExportPlan {
  /** Where the finished video is written: `<recordings folder>/<name>/exports/<recording>.mp4`. */
  out: string;
  /** The same place, as a path inside the recording (`exports/<recording>.mp4`), for showing it in the file manager. */
  rel: string;
  /** The options the recorder is started with. */
  args: string[];
  /** Only the sound is made, as a WAV file, not a video. */
  audioOnly: boolean;
  /** Only the picture at this moment (milliseconds from the start) is made, as a PNG file, not a video; null for a video. */
  frameMs: number | null;
}

export interface ExportOptions {
  /** Cuts instead of animated zooms, for a viewer who is bothered by movement (WCAG 2.3.3). */
  reduceMotion?: boolean;
  /** Make only the sound, as a WAV file (`exports/<recording>.wav`), instead of a video. */
  audioOnly?: boolean;
  /** Make only the picture the video has at this moment, in milliseconds from its start, as a PNG file (`exports/<recording> at <seconds> seconds.png`). */
  frameMs?: number;
}

/** What is being made: a video, only the sound, or one picture. */
export type ExportKind = "video" | "sound" | "picture";

/** The options for exporting a recording in the recordings folder. The separator follows the one the folder already uses. */
export function exportPlan(library: string, name: string, options: ExportOptions = {}): ExportPlan {
  const sep = library.includes("\\") ? "\\" : "/";
  const base = library.replace(/[\\/]+$/, "");
  const folder = `${base}${sep}${name}`;
  const stem = name.replace(/\.capture$/i, "") || "recording";
  const audioOnly = options.audioOnly === true;
  const frameMs = !audioOnly && options.frameMs !== undefined ? Math.max(0, Math.round(options.frameMs)) : null;
  const extension = audioOnly ? "wav" : frameMs !== null ? "png" : "mp4";
  // A picture is named for its moment, so pictures from different moments sit side by side instead of replacing one another.
  const fileName = frameMs !== null ? `${stem} at ${(frameMs / 1000).toFixed(1)} seconds` : stem;
  const rel = `exports/${fileName}.${extension}`;
  const out = `${folder}${sep}exports${sep}${fileName}.${extension}`;
  const args = ["render", "--project", folder, "--out", out];
  // Zooms are pictures, so "cuts instead of animated zooms" has nothing to say about a sound file.
  if (audioOnly) args.push("--audio-only");
  else {
    if (frameMs !== null) args.push("--frame", String(frameMs));
    // A picture in the middle of a zoom is drawn as the video draws it, so it follows the same choice about motion.
    if (options.reduceMotion === true) args.push("--reduce-motion");
  }
  return { out, rel, args, audioOnly, frameMs };
}

export interface ExportNote {
  ok: boolean;
  text: string;
}

export interface ExportState {
  /** 0 to 100. */
  percent: number;
  /** How far it has got, in words. */
  message: string;
  /** Everything the recorder said about the video, in order. */
  notes: ExportNote[];
  /** The recorder said it made the video. */
  made: boolean;
  /** What it said it made: the length, the size, whether it has sound. */
  madeMessage: string;
  /** Why it could not be made, in the recorder's words. */
  problem: string;
}

export const initialExport = (): ExportState => ({ percent: 0, message: "", notes: [], made: false, madeMessage: "", problem: "" });

/** Checks that are always said when they come: what is being exported, and what was made. */
const ALWAYS_SAID = new Set(["edit", "export"]);
const MAX_NOTES = 40;

const str = (v: unknown, max = 800): string => (typeof v === "string" ? v.trim().slice(0, max) : "");

export interface ExportUpdate {
  state: ExportState;
  /** What to say aloud for this line, if anything. */
  say: string[];
}

/** Apply one line the recorder printed while exporting. A line that is not understood changes nothing (protocol rule 2). */
export function applyExportLine(s: ExportState, line: string): ExportUpdate {
  let d: unknown;
  try {
    d = JSON.parse(line);
  } catch {
    return { state: s, say: [] };
  }
  if (typeof d !== "object" || d === null || Array.isArray(d)) return { state: s, say: [] };
  const e = d as Record<string, unknown>;
  switch (e["event"]) {
    case "progress": {
      const percent = typeof e["percent"] === "number" && Number.isFinite(e["percent"]) ? Math.min(100, Math.max(0, Math.round(e["percent"]))) : s.percent;
      const message = str(e["message"]) || `Exporting: ${percent} percent.`;
      return { state: { ...s, percent, message }, say: [message] };
    }
    case "check": {
      const name = str(e["check"], 60);
      const message = str(e["message"]);
      if (name === "" || message === "" || typeof e["ok"] !== "boolean") return { state: s, say: [] };
      const ok = e["ok"];
      let next: ExportState = { ...s, notes: [...s.notes, { ok, text: message }].slice(-MAX_NOTES) };
      if (name === "export") next = ok ? { ...next, made: true, madeMessage: message, percent: 100 } : { ...next, problem: message };
      else if (name === "edit" && !ok) next = { ...next, problem: message };
      return { state: next, say: ok && !ALWAYS_SAID.has(name) ? [] : [ok ? message : `Problem. ${message}`] };
    }
    case "error": {
      const message = str(e["message"]) || "The recorder reported a problem and gave no details.";
      return { state: { ...s, problem: s.problem === "" ? message : s.problem, notes: [...s.notes, { ok: false, text: message }].slice(-MAX_NOTES) }, say: [message] };
    }
    default:
      return { state: s, say: [] };
  }
}

export interface ExportSummary {
  /** The video was made and read back as it should be. */
  ok: boolean;
  /** One sentence for the end. */
  sentence: string;
}

/** How it went, in one sentence. A video the recorder made but could not read back is never called good. */
export function summariseExport(s: ExportState, exit: StreamExit | null, kind: ExportKind = "video"): ExportSummary {
  const thing = kind === "video" ? "video" : kind === "sound" ? "sound file" : "picture";
  if (exit === null) return { ok: false, sentence: `The ${thing} could not be made.${s.problem === "" ? "" : ` ${s.problem}`}` };
  if (exit.code === 2 && s.notes.length === 0) return { ok: false, sentence: `Making a ${thing} works on Windows only.` };
  if (exit.killed || exit.code === null) return { ok: false, sentence: `Making the ${thing} did not finish, so there is no ${thing}.` };
  const failed = s.notes.filter((n) => !n.ok);
  if (exit.code === 0 && s.made) {
    const unread = failed.length > 0 ? ` ${failed.length === 1 ? "One check found a problem" : `${failed.length} checks found a problem`}, so look at the list before using it.` : "";
    return { ok: failed.length === 0, sentence: `The ${thing} was made. ${s.madeMessage}${unread}`.trim() };
  }
  const why = s.problem !== "" ? s.problem : failed[0]?.text ?? "";
  return { ok: false, sentence: `The ${thing} could not be made.${why === "" ? "" : ` ${why}`}` };
}

/** Said whenever a video has been made. This product makes no captions yet, and an author must hear that now, not find out when a viewer asks. */
export const NO_CAPTIONS =
  "This video has no captions. OpenStage Recorder does not make them yet. If the people who watch it need captions, make them in another program and put them with the video where you share it.";

export interface FinishedWords {
  /** Whether a finished video now exists. */
  made: boolean;
  /** Everything to say when the job ends: how it went, any trouble the recorder named, and, when a video was made, that it has no captions. */
  sentence: string;
}

/** The words for the end of the job. `problem` is what the job runner itself had to report (a time limit, a recorder that would not start). */
export function finishedWords(s: ExportState, exit: StreamExit | null, problem = "", kind: ExportKind = "video"): FinishedWords {
  const summary = summariseExport(s, exit, kind);
  const made = exit !== null && exit.code === 0 && s.made;
  const how = problem === "" ? summary.sentence : `${summary.sentence} ${problem}`;
  // The caption note is about a video someone watches; a sound file has nothing to caption.
  return { made, sentence: made && kind === "video" ? `${how} ${NO_CAPTIONS}` : how };
}
