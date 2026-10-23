// SPDX-License-Identifier: Apache-2.0
/**
 * Copy and paste of clips, overlays and zooms.
 *
 * Copying takes a snapshot of the chosen rows (nothing in the edit changes). Pasting puts copies in at a time,
 * keeping how far apart the copied rows were, each on the track it came from, or when that has no room, on another
 * track of the same kind. Pasting is all or nothing: if any copy has nowhere to go, nothing is pasted and the sentence
 * says which one and why, so the edit is never left half pasted.
 *
 * The copies are new rows with new ids. Everything else about them (the part of the recording, the volume, fades,
 * where the picture sits, the words and style of an overlay) is kept as it was.
 */

import {
  ALLOWED_ITEMS,
  clipEndMs,
  clipLengthMs,
  findClip,
  findItem,
  findSource,
  sortClips,
  sortItems,
  takeId,
  withTrack,
  type Clip,
  type Item,
  type Model,
  type Track,
  type TrackKind,
} from "./model.ts";
import type { Refused, Result } from "./ops.ts";
import { describeLength, describeTime, wholeMs } from "./time.ts";
import { itemKindName, validate, type Problem } from "./validate.ts";

/** One copied row, with where it came from. */
export type Copied =
  | { readonly what: "clip"; readonly trackId: string; readonly trackKind: TrackKind; readonly clip: Clip }
  | { readonly what: "item"; readonly trackId: string; readonly trackKind: TrackKind; readonly item: Item };

function startOf(c: Copied): number {
  return c.what === "clip" ? c.clip.startMs : c.item.startMs;
}

function nameOf(c: Copied): string {
  return c.what === "clip" ? c.clip.name : c.item.name;
}

function lengthOf(c: Copied): number {
  return c.what === "clip" ? clipLengthMs(c.clip) : c.item.durationMs;
}

function quote(name: string): string {
  return `"${name}"`;
}

function refuse(message: string): Refused {
  return { ok: false, message };
}

/** Take a snapshot of rows (clips, overlays, zooms) by id, in the order they start. Ids that are not found are left out. */
export function copyRows(model: Model, ids: readonly string[]): Copied[] {
  const out: Copied[] = [];
  for (const id of ids) {
    const clip = findClip(model, id);
    if (clip !== undefined) {
      out.push({ what: "clip", trackId: clip.track.id, trackKind: clip.track.kind, clip: clip.clip });
      continue;
    }
    const item = findItem(model, id);
    if (item !== undefined) out.push({ what: "item", trackId: item.track.id, trackKind: item.track.kind, item: item.item });
  }
  return out.sort((a, b) => startOf(a) - startOf(b));
}

/** What copying said, in words. */
export function describeCopied(copied: readonly Copied[]): string {
  const first = copied[0];
  if (first === undefined) return "Nothing was copied.";
  if (copied.length === 1) {
    return `Copied ${quote(nameOf(first))}, ${describeLength(lengthOf(first))} long.`;
  }
  const from = Math.min(...copied.map(startOf));
  const to = Math.max(...copied.map((c) => startOf(c) + lengthOf(c)));
  return `Copied ${copied.length} rows that together run ${describeLength(to - from)}.`;
}

/** Problems that the new rows made, or that were not there before: what a paste must not introduce. */
function newErrors(before: Model, after: Model, newIds: ReadonlySet<string>): Problem[] {
  const had = new Set(validate(before).filter((p) => p.severity === "error").map((p) => p.message));
  return validate(after).filter(
    (p) => p.severity === "error" && (!had.has(p.message) || (p.clipId !== undefined && newIds.has(p.clipId)) || (p.itemId !== undefined && newIds.has(p.itemId))),
  );
}

/** The tracks a copy may go on: the one it came from if it is still there, then the others of the same kind. */
function candidates(model: Model, c: Copied): Track[] {
  const same = model.tracks.filter((t) => t.kind === c.trackKind);
  const home = same.find((t) => t.id === c.trackId);
  return home === undefined ? same : [home, ...same.filter((t) => t !== home)];
}

interface Placed {
  readonly model: Model;
  readonly id: string;
  readonly track: Track;
}

/** Put one copy in the first track that takes it. Returns the new edit, or why none could. */
function placeOne(model: Model, c: Copied, startMs: number): Placed | string {
  const tracks = candidates(model, c);
  if (tracks.length === 0) {
    return `There is no ${c.trackKind} track to paste ${quote(nameOf(c))} on. Add one first.`;
  }
  if (c.what === "clip" && findSource(model, c.clip.source) === undefined) {
    return `The recording or file that ${quote(c.clip.name)} uses is no longer part of this edit.`;
  }
  let firstReason: string | undefined;
  for (const track of tracks) {
    if (c.what === "item" && !ALLOWED_ITEMS[track.kind].includes(c.item.kind)) continue;
    if (c.what === "clip") {
      const end = startMs + clipLengthMs(c.clip);
      const clash = track.clips.find((o) => startMs < clipEndMs(o) && o.startMs < end);
      if (clash !== undefined) {
        firstReason ??= `It would overlap ${quote(clash.name)} on the ${track.name} track, which runs from ${describeTime(clash.startMs)} to ${describeTime(clipEndMs(clash))}.`;
        continue;
      }
    }
    const taken = takeId(model, c.what === "clip" ? "clip" : "item");
    let next: Model;
    if (c.what === "clip") {
      const clip: Clip = { ...c.clip, id: taken.id, startMs };
      next = withTrack(taken.model, { ...track, clips: sortClips([...track.clips, clip]) });
    } else {
      const item: Item = { ...c.item, id: taken.id, startMs };
      next = withTrack(taken.model, { ...track, items: sortItems([...track.items, item]) });
    }
    const errors = newErrors(model, next, new Set([taken.id]));
    if (errors[0] === undefined) return { model: next, id: taken.id, track };
    firstReason ??= errors[0].message;
  }
  return firstReason ?? `${quote(nameOf(c))} cannot be pasted there.`;
}

/**
 * Paste copies so that the earliest begins at `atMs` and the rest keep their distance from it. All or nothing.
 * The sentence says where they went; `focus` is the new rows, in the order they start.
 */
export function pasteCopied(model: Model, copied: readonly Copied[], atMs: number): Result {
  if (copied.length === 0) return refuse("Nothing has been copied yet. Choose a clip and copy it first.");
  const base = Math.min(...copied.map(startOf));
  const at = wholeMs(atMs);
  let next = model;
  const ids: string[] = [];
  const where: string[] = [];
  for (const c of copied) {
    const start = at + (startOf(c) - base);
    const placed = placeOne(next, c, start);
    if (typeof placed === "string") {
      return refuse(
        copied.length === 1
          ? `Cannot paste ${quote(nameOf(c))} at ${describeTime(start)}. ${placed} Move the playhead to a free place and paste again.`
          : `Nothing was pasted. ${quote(nameOf(c))} would go at ${describeTime(start)}, but: ${placed} Move the playhead to a free place and paste again.`,
      );
    }
    next = placed.model;
    ids.push(placed.id);
    if (placed.track.id !== c.trackId) where.push(`${quote(nameOf(c))} went on the ${placed.track.name} track, because its own track had no room there`);
  }
  const first = copied[0];
  const what =
    copied.length === 1 && first !== undefined
      ? first.what === "clip"
        ? `the clip ${quote(first.clip.name)}`
        : `the ${itemKindName(first.item)} ${quote(first.item.name)}`
      : `${copied.length} rows`;
  const message =
    `Pasted ${what} at ${describeTime(at)}.` + (where.length > 0 ? ` ${where.join(". ")}.` : "") + ` The pasted ${copied.length === 1 ? "row is" : "rows are"} chosen.`;
  return { ok: true, model: next, label: copied.length === 1 ? "paste" : "paste rows", message, focus: ids };
}

/** Where the rows end when pasted at `atMs`, for putting the playhead there so that pasting again lays a copy right after. */
export function pastedEndMs(copied: readonly Copied[], atMs: number): number {
  if (copied.length === 0) return atMs;
  const base = Math.min(...copied.map(startOf));
  return wholeMs(atMs) + Math.max(...copied.map((c) => startOf(c) - base + lengthOf(c)));
}
