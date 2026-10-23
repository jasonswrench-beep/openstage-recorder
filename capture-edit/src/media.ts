// SPDX-License-Identifier: Apache-2.0
/**
 * Bringing a picture, a video or a sound from the course's files into the edit (story C10).
 *
 * The host program (which can open file dialogs and copy a file into the course) hands over what it found out about
 * the file: where it is in the course's files, what it is, what to call it and how long it is. Everything else is
 * here: making the file one of the edit's sources, finding a track with room for it, and saying what the author
 * still has to do (an image needs alt text or to be marked decorative; a video or a sound needs captions, a script or a
 * transcript).
 */

import { addClip, addTrack, type Result } from "./ops.ts";
import {
  MAX_IMPORTED_VIDEO_MS,
  clipEndMs,
  findClip,
  findSource,
  sameSource,
  type Model,
  type SourceInfo,
  type SourceRef,
  type Track,
} from "./model.ts";
import { describeLength, wholeMs } from "./time.ts";

/** What the host knows about a file it has put in the course's files. */
export interface ImportedFile {
  /** Where it is, inside the course's `assets` folder, such as `images/logo.png`. */
  readonly asset: string;
  readonly kind: "image" | "video" | "audio";
  /** What to call it in words, such as "Logo". */
  readonly name: string;
  /** How long it plays, in milliseconds. `null` for a still image. */
  readonly durationMs: number | null;
}

function quote(name: string): string {
  return `"${name}"`;
}

function hasRoom(track: Track, startMs: number, endMs: number): boolean {
  return !track.clips.some((c) => startMs < clipEndMs(c) && c.startMs < endMs);
}

/**
 * Put an imported file in the edit at a time. A picture or video goes on the first Imported media track with room, a sound on
 * the first Audio track with room; a track is added if there is none. A video clip uses at most its first 30 seconds (the
 * limit for imported video), and a still image is shown for 5 seconds. Picture clips are drawn over the pictures of the
 * tracks above them in the list, filling the frame unless given a place.
 */
export function addImportedFile(model: Model, file: ImportedFile, startMs: number): Result {
  const ref: SourceRef = { kind: "asset", asset: file.asset };
  const existing = findSource(model, ref);
  const info: SourceInfo = existing ?? {
    ref,
    kind: file.kind,
    name: file.name,
    durationMs: file.kind === "image" ? null : file.durationMs === null ? null : wholeMs(file.durationMs),
    ...(file.kind === "image" ? {} : { hasTextAlternative: false }),
  };
  if (existing !== undefined && existing.kind !== file.kind) {
    return { ok: false, message: `${existing.name} is already in this edit as a ${existing.kind}, so it cannot also be a ${file.kind}.` };
  }
  if (info.kind !== "image" && (info.durationMs === null || info.durationMs < 100)) {
    return { ok: false, message: `${file.name} has no length that could be read, so it was not added. Is it a ${file.kind} file this program can play?` };
  }
  const start = wholeMs(startMs);
  let length: number | undefined;
  let shortened = false;
  if (info.kind === "video" && info.durationMs !== null && info.durationMs > MAX_IMPORTED_VIDEO_MS) {
    length = MAX_IMPORTED_VIDEO_MS;
    shortened = true;
  }
  const kind = info.kind === "audio" ? "audio" : "media";
  const wanted = length ?? info.durationMs ?? 5000;
  let working: Model = existing === undefined ? { ...model, sources: [...model.sources, info] } : model;
  let track = working.tracks.find((t) => t.kind === kind && hasRoom(t, start, start + wanted));
  let made = "";
  if (track === undefined) {
    const added = addTrack(working, kind);
    working = added.model;
    track = working.tracks.find((t) => t.id === added.focus?.[0]);
    made = ` ${added.message}`;
  }
  if (track === undefined) return { ok: false, message: "A track for it could not be made." };
  const result = addClip(working, track.id, { source: ref, startMs: start, name: info.name, ...(length === undefined ? {} : { lengthMs: length }) });
  if (!result.ok) return result;
  const note = shortened ? ` Only its first ${describeLength(MAX_IMPORTED_VIDEO_MS)} are used, because imported video is limited to that; trim or move the clip to use another part.` : "";
  const sound =
    info.kind === "video"
      ? " The video's own sound is not used in the finished video; add it as a sound file if it is needed."
      : "";
  return { ...result, label: "add media", message: `${made.trim()} ${result.message}${note}${sound}`.trim() };
}

/** Say that an imported video or sound has (or has not) captions, a script or a transcript. */
export function setHasTextAlternative(model: Model, ref: SourceRef, has: boolean): Result {
  const info = findSource(model, ref);
  if (info === undefined) return { ok: false, message: "That file is not part of this edit." };
  if (ref.kind !== "asset" || (info.kind !== "video" && info.kind !== "audio")) {
    return { ok: false, message: `${info.name} is not an imported video or sound, so it has no captions or transcript to record.` };
  }
  if ((info.hasTextAlternative ?? false) === has) {
    return { ok: true, model, label: "", message: `${info.name} is already marked as ${has ? "having" : "not having"} captions, a script or a transcript.` };
  }
  const next: Model = {
    ...model,
    sources: model.sources.map((s) => (sameSource(s.ref, ref) ? { ...s, hasTextAlternative: has } : s)),
  };
  return {
    ok: true,
    model: next,
    label: "text for media",
    message: has
      ? `${info.name} is now marked as having captions, a script or a transcript.`
      : `${info.name} is now marked as needing captions, a script or a transcript.`,
  };
}

/** Where the author is told a file is used, for a sentence: how many clips use it. */
export function clipsUsing(model: Model, ref: SourceRef): number {
  return model.tracks.reduce((n, t) => n + t.clips.filter((c) => sameSource(c.source, ref)).length, 0);
}

/** The imported file a clip uses, if it uses one. */
export function importedSourceOf(model: Model, clipId: string): SourceInfo | undefined {
  const found = findClip(model, clipId);
  if (found === undefined || found.clip.source.kind !== "asset") return undefined;
  return findSource(model, found.clip.source);
}

