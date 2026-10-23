// SPDX-License-Identifier: Apache-2.0
/**
 * The callout gallery and zooms drawn on the picture (stories C5, C7, C8).
 *
 * A callout is a ready-made overlay (a title, a highlight box, an arrow, a blur) that is put in at a time with sensible
 * size, place and colours, so the author starts from something that already looks right and then changes it. A zoom is put
 * in from a rectangle on the picture. Both go on the first track that takes them, and a track is added when there is none.
 *
 * Nothing here is allowed to leave the edit unsound: each gives back a new edit and a sentence, or a sentence saying why not.
 */

import { addArrow, addBlur, addRedact, addShape, addText, addZoom, DEFAULT_ZOOM_TRANSITION_MS } from "./items.ts";
import { FULL, MIN_CLIP_MS, modelLengthMs, type Model, type Rect, type TrackKind } from "./model.ts";
import { addTrack, type Result } from "./ops.ts";
import { describeTime, wholeMs } from "./time.ts";

export type CalloutKind = "text" | "title" | "lower-third" | "highlight" | "circle" | "arrow" | "blur" | "cover";

export interface CalloutInfo {
  readonly kind: CalloutKind;
  /** The button's name. */
  readonly label: string;
  /** What it is, in a short phrase. */
  readonly hint: string;
}

/** The gallery, in the order it is shown. */
export const CALLOUTS: readonly CalloutInfo[] = [
  { kind: "text", label: "Text", hint: "Words in the middle of the picture" },
  { kind: "title", label: "Title", hint: "Large words, centred" },
  { kind: "lower-third", label: "Lower third", hint: "A name or caption along the bottom" },
  { kind: "highlight", label: "Highlight box", hint: "A yellow outline around something" },
  { kind: "circle", label: "Circle", hint: "A yellow circle around something" },
  { kind: "arrow", label: "Arrow", hint: "An arrow pointing at something" },
  { kind: "blur", label: "Blur", hint: "Hides something by blurring it" },
  { kind: "cover", label: "Cover", hint: "Hides something under a solid colour" },
];

/** How long a callout lasts when nothing else is said, and a zoom. */
export const DEFAULT_CALLOUT_MS = 3000;
export const DEFAULT_ZOOM_MS = 4000;

const MIDDLE: Rect = { x: 3000, y: 3800, width: 4000, height: 2400 };
const TITLE: Rect = { x: 1000, y: 3800, width: 8000, height: 2400 };
const BOX: Rect = { x: 3000, y: 3000, width: 4000, height: 4000 };
const HIDE: Rect = { x: 3500, y: 4000, width: 3000, height: 2000 };

export function calloutName(kind: CalloutKind): string {
  return CALLOUTS.find((c) => c.kind === kind)?.label ?? kind;
}

function refuse(message: string): Result {
  return { ok: false, message };
}

/** How long a new row can last when it starts at `startMs`: the wanted length, cut to the edit's end. Or a sentence saying why not. */
function lengthFor(model: Model, startMs: number, wanted: number, least: number): number | string {
  const end = modelLengthMs(model);
  if (end === 0) return "There is nothing in this edit yet, so there is no picture to put it on. Add a clip first.";
  const room = end - startMs;
  if (room < least) {
    return `The playhead is at ${describeTime(startMs)}, too near the end of the edit, ${describeTime(end)}, for this to last long enough. Move the playhead earlier.`;
  }
  return Math.min(wanted, room);
}

/** Add a row on the first track of this kind that takes it, adding a track if there is none. */
function onFirstTrack(model: Model, kind: TrackKind, add: (m: Model, trackId: string) => Result): Result {
  const tracks = model.tracks.filter((t) => t.kind === kind);
  let firstReason: string | undefined;
  for (const track of tracks) {
    const result = add(model, track.id);
    if (result.ok) return result;
    firstReason ??= result.message;
  }
  if (tracks.length > 0 && kind !== "zoom") return refuse(firstReason ?? "It could not be added.");
  const made = addTrack(model, kind);
  const result = add(made.model, made.focus?.[0] ?? "");
  if (!result.ok) return tracks.length > 0 ? refuse(firstReason ?? result.message) : result;
  return { ...result, message: `${made.message} ${result.message}` };
}

/** Put a ready-made callout in at `startMs`. Its first words, colours and place are a start for the author to change. */
export function addCallout(model: Model, kind: CalloutKind, startMs: number, wantedMs: number = DEFAULT_CALLOUT_MS): Result {
  const start = wholeMs(startMs);
  const length = lengthFor(model, start, wholeMs(wantedMs), MIN_CLIP_MS);
  if (typeof length === "string") return refuse(length);
  const timing = { startMs: start, durationMs: length };
  return onFirstTrack(model, "overlay", (m, trackId) => {
    switch (kind) {
      case "text":
        return addText(m, trackId, { ...timing, text: "Your text here", name: "Text", rect: MIDDLE, align: "center" });
      case "title":
        return addText(m, trackId, { ...timing, text: "Your title here", name: "Title", rect: TITLE, fontSizeBp: 700, bold: true, align: "center" });
      case "lower-third":
        return addText(m, trackId, { ...timing, text: "Name or caption", name: "Lower third" });
      case "highlight":
        return addShape(m, trackId, { ...timing, shape: "rectangle", rect: BOX, name: "Highlight box" });
      case "circle":
        return addShape(m, trackId, { ...timing, shape: "ellipse", rect: BOX, name: "Circle" });
      case "arrow":
        return addArrow(m, trackId, { ...timing, from: { x: 2500, y: 2500 }, to: { x: 5000, y: 5000 }, name: "Arrow" });
      case "blur":
        return addBlur(m, trackId, { ...timing, rect: HIDE });
      case "cover":
        return addRedact(m, trackId, { ...timing, rect: HIDE });
    }
  });
}

/**
 * Put a zoom in at `startMs` showing `rect`. A zoom keeps the picture's shape, so a rectangle that does not is made to
 * (the larger of its width and height is used for both), and the sentence says so. The zoom goes on the first zoom track with room.
 */
export function addZoomRegion(model: Model, rect: Rect, startMs: number, wantedMs: number = DEFAULT_ZOOM_MS): Result {
  const start = wholeMs(startMs);
  const shaped = keepShape(rect);
  const length = lengthFor(model, start, wholeMs(wantedMs), Math.min(wholeMs(wantedMs), DEFAULT_ZOOM_TRANSITION_MS * 2));
  if (typeof length === "string") return refuse(length);
  const result = onFirstTrack(model, "zoom", (m, trackId) =>
    addZoom(m, trackId, { startMs: start, durationMs: length, rect: shaped, transitionMs: Math.min(DEFAULT_ZOOM_TRANSITION_MS, Math.floor(length / 2)) }),
  );
  if (!result.ok) return result;
  const changed = shaped.width !== rect.width || shaped.height !== rect.height;
  return changed ? { ...result, message: `${result.message} The rectangle was made to fit the picture's shape.` } : result;
}

/** The rectangle made to have the picture's shape (equal parts of the width and the height), inside the picture. */
export function keepShape(rect: Rect): Rect {
  const size = Math.max(1, Math.min(FULL, Math.round(Math.max(rect.width, rect.height))));
  const x = Math.min(Math.max(0, rect.x), FULL - size);
  const y = Math.min(Math.max(0, rect.y), FULL - size);
  return { x, y, width: size, height: size };
}

