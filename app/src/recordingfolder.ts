// SPDX-License-Identifier: Apache-2.0
// A recording in the recordings folder, reached through the app's own shell, as the editing screens want it.
//
// The editing screens (capture-timeline) read a recording through a small interface, `ProjectFolder`: read a text file, list the folders in a
// place, give an address for a video, and write `edit.json`. In a browser that is a folder the author picked; here it is a folder of the recordings
// folder, `<recordings folder>/<name>.capture`, reached only by the recordings folder and the recording's name, so nothing else on the computer is in
// reach. The shell does the checking (app/core/src/files.rs); this only asks the right questions and turns a refusal into "there is none".

import type { RecorderBackend } from "./backend.ts";
import type { ProjectFolder } from "../../capture-timeline/src/project.ts";

export type RecordingBackend = Pick<RecorderBackend, "recordingRead" | "recordingFolders" | "recordingWriteEdit" | "recordingMediaUrl">;

/** The media of a take: `takes/take-001/screen.mp4`. Nothing else can be played. */
export const TAKE_MEDIA = /^takes\/take-\d+\/[^/\\]+$/;

export function recordingFolder(b: RecordingBackend, dir: string, name: string): ProjectFolder {
  return {
    name,
    canWrite: true,
    async readText(path) {
      try {
        return await b.recordingRead(dir, name, path);
      } catch {
        return undefined;
      }
    },
    async listFolders(path) {
      try {
        return await b.recordingFolders(dir, name, path);
      } catch {
        return [];
      }
    },
    async mediaUrl(path) {
      if (!TAKE_MEDIA.test(path)) return undefined;
      try {
        return await b.recordingMediaUrl(dir, name, path);
      } catch {
        return undefined;
      }
    },
    async writeText(path, text) {
      if (path !== "edit.json") return false;
      try {
        await b.recordingWriteEdit(dir, name, text);
        return true;
      } catch {
        return false;
      }
    },
    release() {
      // The addresses are the shell's own, with nothing to give back.
    },
  };
}

/** The folder name of a recording from the path the recorder reported ("D:/Videos/OpenStage Recorder/Demo.capture"). */
export function recordingNameOf(folder: string): string {
  const parts = folder.split(/[\\/]+/).filter((p) => p !== "");
  return parts[parts.length - 1] ?? "";
}
