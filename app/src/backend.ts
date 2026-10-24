// SPDX-License-Identifier: Apache-2.0
// How the app reaches the file system, the recording program and the keys that work in other programs. In the app these are Rust
// commands (app/src-tauri/src/lib.rs, with the rules in app/core). In a plain browser (the preview used for development and for the
// automatic checks) they are a pretend recorder and a recordings folder held in memory (standin.ts). The interface is the same either way.

import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm as confirmDialog, open as openDialog } from "@tauri-apps/plugin-dialog";
import type { CaptureCheck, HotkeyBinding, HotkeyResult, StreamExit, StreamState } from "./recorder.ts";
import { makePreviewBackend } from "./standin.ts";

/** A readable message from whatever was thrown, without the word "Error:" in front. */
export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

export interface RecorderBackend {
  /** True in a plain browser, where the recorder is a pretend one and nothing real is recorded. */
  readonly preview: boolean;

  // ---- the recordings folder: `<folder>/<name>.capture`, reached by the folder and the recording's NAME only

  /** Where recordings are kept unless the author chooses another folder. It may not exist yet. */
  defaultLibrary(): Promise<string>;
  /** Make the recordings folder if it is not there yet. */
  ensureLibrary(dir: string): Promise<void>;
  /** Ask the author for a folder. Null if they cancelled. */
  pickFolder(title: string): Promise<string | null>;
  /** The recordings in the folder, by folder name (`Week 3.capture`). */
  listRecordings(dir: string): Promise<string[]>;
  /** The text of a .json file inside a recording (`capture.json`, `edit.json`, `takes/take-001/take.json`), or undefined if there is none. */
  recordingRead(dir: string, name: string, rel: string): Promise<string | undefined>;
  /** The folders directly inside a place in a recording. */
  recordingFolders(dir: string, name: string, rel: string): Promise<string[]>;
  /** Save the edit of a recording as its edit.json, whole or not at all. The only file ever written in a recording. */
  recordingWriteEdit(dir: string, name: string, text: string): Promise<void>;
  /**
   * Keep a copy of the edit that a new edit of the newest take is about to replace, as `edit-before-take-<number>.json`. The only other file
   * ever written in a recording. It never replaces a copy that is already there: it refuses, and says why.
   */
  recordingKeepEdit(dir: string, name: string, file: string, text: string): Promise<void>;
  /** An address a video or sound of a take can be played from, with seeking. Only `takes/take-001/<file>` can be asked for. */
  recordingMediaUrl(dir: string, name: string, rel: string): Promise<string>;
  /** Show a recording, or a file inside it (`exports/Name.mp4`), in the file manager. */
  revealRecording(dir: string, name: string, rel: string): Promise<void>;

  // ---- the recording program: a separate program the app starts and talks to, one line of JSON at a time

  /** Where the recording program is, or a message that says why it cannot be used and what to do. */
  captureCheck(): Promise<CaptureCheck>;
  /** Start the recorder with these options. Refused politely if one is already running. */
  streamStart(args: string[]): Promise<void>;
  /** Send the recorder one command: one short line of JSON. */
  streamSend(line: string): Promise<void>;
  /** Tell the shell the recorder has paused or resumed. */
  streamSetPaused(paused: boolean): Promise<void>;
  streamState(): Promise<StreamState>;
  /** Stop the recorder: it is asked to finish and print its result, given ten seconds, and only then ended by force. */
  streamStop(stopLine?: string): Promise<boolean>;
  /** Called with each line the recorder prints, as it prints it. Returns a function that stops listening. */
  onStreamLine(listener: (line: string) => void): Promise<() => void>;
  /** Called once when a recorder run ends, with how it ended. */
  onStreamExit(listener: (exit: StreamExit) => void): Promise<() => void>;

  // ---- keys that work while another program has the focus

  /** Replace every registered key with these. Each comes back with whether it worked and, if not, why. */
  hotkeysSet(bindings: HotkeyBinding[]): Promise<HotkeyResult[]>;
  hotkeysClear(): Promise<void>;
  /** Called with the id of a key each time it is pressed. */
  onHotkey(listener: (id: string) => void): Promise<() => void>;

  // ---- the window

  confirm(message: string): Promise<boolean>;
  setTitle(title: string): Promise<void>;
  /** Ask before the window closes: `question` gives what to ask, or null when closing is fine. */
  guardClose(question: () => string | null): void;
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** The media of a take: `takes/take-001/screen.mp4`. Nothing else can be played. */
const TAKE_MEDIA = /^takes\/take-\d+\/[^/\\]+$/;

const tauriBackend: RecorderBackend = {
  preview: false,
  defaultLibrary: () => invoke<string>("default_library"),
  ensureLibrary: (dir) => invoke<void>("ensure_library", { dir }),
  async pickFolder(title) {
    const picked = await openDialog({ directory: true, multiple: false, title });
    return typeof picked === "string" ? picked : null;
  },
  listRecordings: (dir) => invoke<string[]>("list_recordings", { dir }),
  async recordingRead(dir, name, rel) {
    return (await invoke<string | null>("recording_read", { dir, name, rel })) ?? undefined;
  },
  recordingFolders: (dir, name, rel) => invoke<string[]>("recording_folders", { dir, name, rel }),
  recordingWriteEdit: (dir, name, text) => invoke<void>("recording_write_edit", { dir, name, text }),
  recordingKeepEdit: (dir, name, file, text) => invoke<void>("recording_keep_edit", { dir, name, file, text }),
  async recordingMediaUrl(dir, name, rel) {
    // The shell opens up only this recording's takes folder, and only for the rest of the session.
    if (!TAKE_MEDIA.test(rel)) throw new Error("That file is not in a take of the recording.");
    await invoke<void>("allow_recording_media", { dir, name });
    const sep = dir.includes("\\") ? "\\" : "/";
    return convertFileSrc([dir.replace(/[\\/]+$/, ""), name, ...rel.split("/")].join(sep));
  },
  revealRecording: (dir, name, rel) => invoke<void>("reveal_recording", { dir, name, rel }),
  async captureCheck() {
    try {
      return { ok: true, path: await invoke<string>("capture_check") };
    } catch (err) {
      return { ok: false, message: errorText(err) };
    }
  },
  streamStart: (args) => invoke<void>("stream_start", { args }),
  streamSend: (line) => invoke<void>("stream_send", { line }),
  streamSetPaused: (paused) => invoke<void>("stream_set_paused", { paused }),
  streamState: () => invoke<StreamState>("stream_state"),
  streamStop: (stopLine) => invoke<boolean>("stream_stop", { stopLine: stopLine ?? null }),
  onStreamLine: (listener) => listen<string>("stream-line", (e) => listener(e.payload)),
  onStreamExit: (listener) => listen<StreamExit>("stream-exit", (e) => listener(e.payload)),
  hotkeysSet: (bindings) => invoke<HotkeyResult[]>("hotkeys_set", { bindings }),
  hotkeysClear: () => invoke<void>("hotkeys_clear"),
  onHotkey: (listener) => listen<string>("hotkey", (e) => listener(e.payload)),
  confirm: (message) => confirmDialog(message, { title: "OpenStage Recorder", kind: "warning" }),
  setTitle: (title) => getCurrentWindow().setTitle(title),
  guardClose(question) {
    void getCurrentWindow().onCloseRequested(async (event) => {
      const ask = question();
      if (ask !== null && !(await confirmDialog(ask, { title: "OpenStage Recorder", kind: "warning" }))) event.preventDefault();
    });
  },
};

export const backend: RecorderBackend = isTauri ? tauriBackend : makePreviewBackend();
