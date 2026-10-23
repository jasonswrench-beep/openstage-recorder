// SPDX-License-Identifier: Apache-2.0
/**
 * Moving several clips, overlays and zooms at once, all by the same amount, so they keep their places in
 * relation to one another. It is done with the single moves (`setClipStart` and `moveItem`), one after
 * another, so every rule that holds for one holds for all: nothing before the start, no clip into another,
 * no zoom into another. If any one of them is refused, nothing at all is moved.
 */

import { clipEndMs, findClip, findItem, findTrack, itemEndMs, type Model } from "./model.ts";
import { moveItem } from "./items.ts";
import { setClipStart, type Done, type Refused, type Result } from "./ops.ts";
import { describeLength } from "./time.ts";

function refuse(message: string): Refused {
  return { ok: false, message };
}

function quote(name: string): string {
  return `"${name}"`;
}

export interface GroupRow {
  readonly id: string;
  readonly name: string;
  readonly startMs: number;
  readonly endMs: number;
  readonly isClip: boolean;
  readonly trackId: string;
  readonly isZoom: boolean;
}

function rowOf(model: Model, id: string): GroupRow | undefined {
  const clip = findClip(model, id);
  if (clip !== undefined) {
    return { id, name: clip.clip.name, startMs: clip.clip.startMs, endMs: clipEndMs(clip.clip), isClip: true, trackId: clip.track.id, isZoom: false };
  }
  const item = findItem(model, id);
  if (item === undefined) return undefined;
  return {
    id,
    name: item.item.name,
    startMs: item.item.startMs,
    endMs: itemEndMs(item.item),
    isClip: false,
    trackId: item.track.id,
    isZoom: item.item.kind === "zoom",
  };
}

/** The clips, overlays and zooms named, once each, as the editing model sees them; unknown ids are left out. */
export function rowsOf(model: Model, ids: readonly string[]): readonly GroupRow[] {
  const seen = new Set<string>();
  const rows: GroupRow[] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    seen.add(id);
    const row = rowOf(model, id);
    if (row !== undefined) rows.push(row);
  }
  return rows;
}

function about(rows: readonly GroupRow[]): string {
  const clips = rows.filter((r) => r.isClip).length;
  const items = rows.length - clips;
  if (items === 0) return `${clips} clips`;
  if (clips === 0) return `${items} overlays and zooms`;
  return `${rows.length} things`;
}

/**
 * Move every named clip, overlay and zoom by `deltaMs` (later when positive, earlier when negative).
 * They may be on different tracks. A zoom keeps its place in the order of its track: it does not jump
 * over a zoom that was not chosen, so what is allowed is one unbroken stretch either side of where things are.
 */
export function moveRowsBy(model: Model, ids: readonly string[], deltaMs: number): Result {
  const rows = rowsOf(model, ids);
  if (rows.length === 0) return refuse("Nothing was chosen to move.");
  // Not `wholeMs`: a move earlier is a negative number.
  const delta = Math.round(deltaMs) + 0;
  if (delta === 0) return { ok: true, model, label: "", message: "Nothing moved: the change was 0.", focus: rows.map((r) => r.id) } satisfies Done;

  const chosen = new Set(rows.map((r) => r.id));
  const words = `${about(rows)} ${describeLength(Math.abs(delta))} ${delta > 0 ? "later" : "earlier"}`;

  // The single moves treat a time before the beginning as the beginning, which for a group would break the spacing, so it is refused here.
  const tooEarly = rows.find((r) => r.startMs + delta < 0);
  if (tooEarly !== undefined) return refuse(`Cannot move ${words}: ${quote(tooEarly.name)} would start before the beginning.`);

  // A zoom stays on its side of every zoom that was not chosen.
  for (const row of rows) {
    if (!row.isZoom) continue;
    const track = findTrack(model, row.trackId);
    for (const other of track?.items ?? []) {
      if (other.kind !== "zoom" || chosen.has(other.id)) continue;
      const passes = other.startMs >= row.startMs ? row.startMs + delta >= other.startMs : row.startMs + delta <= other.startMs;
      if (passes) {
        return refuse(`Cannot move ${about(rows)} ${delta > 0 ? "later" : "earlier"}: ${quote(row.name)} would go past the zoom ${quote(other.name)}, and zooms keep their order.`);
      }
    }
  }

  // Later ones first when moving later, earlier ones first when moving earlier, so a chosen row is never in the way of the next.
  const order = [...rows].sort((a, b) => (delta > 0 ? b.startMs - a.startMs : a.startMs - b.startMs));
  let next = model;
  for (const row of order) {
    const result = row.isClip ? setClipStart(next, row.id, row.startMs + delta) : moveItem(next, row.id, row.startMs + delta);
    if (!result.ok) return refuse(rows.length === 1 ? result.message : `Cannot move ${words}: ${result.message}`);
    next = result.model;
  }
  if (rows.length === 1) {
    const only = rows[0];
    return { ok: true, model: next, label: "move", message: `Moved ${quote(only?.name ?? "")} ${describeLength(Math.abs(delta))} ${delta > 0 ? "later" : "earlier"}.`, focus: [only?.id ?? ""] };
  }
  return { ok: true, model: next, label: "move together", message: `Moved ${words}.`, focus: rows.map((r) => r.id) };
}
