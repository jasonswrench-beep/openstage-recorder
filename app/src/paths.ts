// SPDX-License-Identifier: Apache-2.0
// Folder paths as the screens say them. A full path on Windows starts with the person's own user folder, `C:\Users\<their name>\`, so a
// screen that shows it shows their Windows user name to anyone looking at the screen or at a recording of it (a screen recorder's own
// window is often filmed). The screens say where a folder is in words, without the user name: "OpenStage Recorder, in Videos, in your
// user folder". The full path is still there to copy, from a button, for anyone who needs it.

/** The user folder at the start of a path, on Windows (`C:\Users\name`) and, for the preview, Linux and macOS (`/home/name`, `/Users/name`). */
const USER_FOLDER = /^(?:[A-Za-z]:[\\/]+Users[\\/]+[^\\/]+|\/home\/[^/]+|\/Users\/[^/]+)(?:[\\/]+(.*))?$/i;

/** The most folders named in words before the rest is left out; a deeper path says "and more". */
const MOST = 4;

/** Where a folder or file is, in words, with no user name: the last name first, then each folder it is in. Other paths are kept as they are. */
export function pathWords(path: string): string {
  const trimmed = path.trim().replace(/[\\/]+$/, "");
  const m = USER_FOLDER.exec(trimmed);
  if (m === null) return trimmed;
  const parts = (m[1] ?? "").split(/[\\/]+/).filter((p) => p !== "");
  if (parts.length === 0) return "your user folder";
  const named = parts.reverse();
  const shown = named.slice(0, MOST);
  const rest = named.length > MOST ? ", in other folders" : "";
  return `${shown.join(", in ")}${rest}, in your user folder`;
}

/** Whether a path has the user folder in it, so the screen offers the full path only to copy rather than show. */
export function hasUserFolder(path: string): boolean {
  return USER_FOLDER.test(path.trim().replace(/[\\/]+$/, ""));
}
