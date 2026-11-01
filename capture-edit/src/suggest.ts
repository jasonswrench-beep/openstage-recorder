// SPDX-License-Identifier: Apache-2.0
/**
 * Suggested zooms, made from where the author clicked (PRD story C8: "Capture can suggest zooms from where I clicked. I accept, edit, or reject each one").
 *
 * A recording made with the mouse noted keeps a private log of each click and where it was. This turns those clicks into a short list of zooms the
 * author can add, one by one, and nothing is added without the author saying so. The rules are plain, so they can be said in words:
 *
 * * Clicks that come one after another (no more than 4 seconds apart) and stay close together are one moment. A click far from the others starts a new one.
 * * A zoom starts 1 second before the first click of a moment and ends 1.5 seconds after the last, and lasts between 2.5 and 12 seconds.
 * * A zoom shows between a third and two thirds of the picture's width (1.5 to 3 times), centred on the clicks, kept inside the picture.
 * * No suggestion overlaps another or a zoom that is already in the edit, and there are at most 10, the busiest moments first.
 *
 * The description of a zoom is left empty on purpose. A suggestion knows where the author clicked, not what the picture shows, and a guess that looks
 * finished would let a zoom with no real description pass. The edit asks for one, as it does for any zoom.
 *
 * Positions in the log are pixels of the display, so the caller says how big the picture is and where its top left corner sits on the display (the
 * region's corner, or 0 and 0 for the whole display).
 */

import { FULL, type Model, type Rect } from "./model.ts";
import { describeMagnification, describePlace } from "./regions.ts";
import { describeLength, describeTime } from "./time.ts";

/** One click from the log, with the name of what was clicked if Windows gave one. */
export interface LoggedClick {
  /** Milliseconds from the start of the take. */
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly name: string;
}

/** Where the picture of a take sits on the display the log measures, and how big it is, in pixels. */
export interface PictureOnDisplay {
  readonly width: number;
  readonly height: number;
  readonly left: number;
  readonly top: number;
}

/** What is known about one take: its clicks and the picture they were made on. */
export interface TakeClicks {
  readonly clicks: readonly LoggedClick[];
  readonly picture: PictureOnDisplay;
}

export interface ZoomSuggestion {
  /** Where on the timeline the zoom would start. */
  readonly startMs: number;
  readonly durationMs: number;
  readonly rect: Rect;
  /** How many clicks it is made from. */
  readonly clicks: number;
  /** What was clicked, when every click of the moment was on the same named thing; otherwise empty. */
  readonly name: string;
}

/** Clicks further apart than this (in time) are different moments. */
export const MOMENT_GAP_MS = 4000;
export const LEAD_MS = 1000;
export const TAIL_MS = 1500;
export const MIN_ZOOM_MS = 2500;
export const MAX_ZOOM_MS = 12_000;
/** A third of the picture's width: three times closer. */
export const MIN_ZOOM_SIZE = 3300;
/** Two thirds of the picture's width: one and a half times closer. */
export const MAX_ZOOM_SIZE = 6700;
/** Clicks spread over more than this much of the picture (across or down) are not one moment. */
export const MAX_SPREAD = 4800;
/** Room left round the clicks, on each side. */
export const PADDING = 1500;
export const MAX_SUGGESTIONS = 10;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The clicks in a take's `events.jsonl`: left and right button presses with their places, each with the name of the item clicked if the log gave one
 * right after it. A line that cannot be read is skipped, as the log's format says a reader must.
 */
export function readClicks(text: string): LoggedClick[] {
  const found: { t: number; x: number; y: number; name: string }[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (!isObject(parsed)) continue;
    const t = parsed["t"];
    if (typeof t !== "number" || !Number.isFinite(t) || t < 0) continue;
    if (parsed["type"] === "click") {
      const x = parsed["x"];
      const y = parsed["y"];
      const button = parsed["button"];
      if (typeof x !== "number" || typeof y !== "number" || !Number.isFinite(x) || !Number.isFinite(y)) continue;
      if (button !== "left" && button !== "right") continue;
      found.push({ t, x, y, name: "" });
    } else if (parsed["type"] === "element") {
      const name = parsed["name"];
      const last = found[found.length - 1];
      if (typeof name === "string" && last !== undefined && last.t === t && last.name === "") last.name = name.trim().slice(0, 80);
    }
  }
  return found;
}

interface Placed {
  readonly t: number;
  readonly x: number;
  readonly y: number;
  readonly name: string;
}

const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n));

/** The clicks of every screen clip in the edit, placed on the timeline and on the picture (0 to 10000 across and down), in time order. */
function placedClicks(model: Model, takes: ReadonlyMap<number, TakeClicks>): Placed[] {
  const out: Placed[] = [];
  for (const track of model.tracks) {
    if (track.kind !== "screen") continue;
    for (const clip of track.clips) {
      if (clip.source.kind !== "take") continue;
      const known = takes.get(clip.source.take);
      if (known === undefined || known.picture.width <= 0 || known.picture.height <= 0) continue;
      const { width, height, left, top } = known.picture;
      for (const c of known.clicks) {
        if (c.t < clip.sourceStartMs || c.t >= clip.sourceEndMs) continue;
        const x = Math.round(((c.x - left) / width) * FULL);
        const y = Math.round(((c.y - top) / height) * FULL);
        if (x < 0 || x > FULL || y < 0 || y > FULL) continue;
        out.push({ t: clip.startMs + (c.t - clip.sourceStartMs), x, y, name: c.name });
      }
    }
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Group clicks into moments: close in time, and close together on the picture. */
function moments(clicks: readonly Placed[]): Placed[][] {
  const groups: Placed[][] = [];
  let group: Placed[] = [];
  let box = { left: 0, top: 0, right: 0, bottom: 0 };
  for (const c of clicks) {
    const last = group[group.length - 1];
    const wider = {
      left: Math.min(box.left, c.x),
      top: Math.min(box.top, c.y),
      right: Math.max(box.right, c.x),
      bottom: Math.max(box.bottom, c.y),
    };
    const together = last !== undefined && c.t - last.t <= MOMENT_GAP_MS && wider.right - wider.left <= MAX_SPREAD && wider.bottom - wider.top <= MAX_SPREAD;
    if (together) {
      group.push(c);
      box = wider;
    } else {
      if (group.length > 0) groups.push(group);
      group = [c];
      box = { left: c.x, top: c.y, right: c.x, bottom: c.y };
    }
  }
  if (group.length > 0) groups.push(group);
  return groups;
}

function existingZooms(model: Model): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const track of model.tracks) {
    for (const item of track.items) if (item.kind === "zoom") out.push({ start: item.startMs, end: item.startMs + item.durationMs });
  }
  return out;
}

/**
 * The zooms to suggest for this edit, in time order. `takes` holds the clicks of each take that has any, by the take's number. Takes that are not
 * in it, and clicks outside the part of a take the edit uses, give nothing.
 */
export function suggestZooms(model: Model, takes: ReadonlyMap<number, TakeClicks>, limit: number = MAX_SUGGESTIONS): ZoomSuggestion[] {
  const all: ZoomSuggestion[] = [];
  for (const group of moments(placedClicks(model, takes))) {
    const first = group[0];
    const last = group[group.length - 1];
    if (first === undefined || last === undefined) continue;
    const xs = group.map((c) => c.x);
    const ys = group.map((c) => c.y);
    const spread = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    const size = clamp(spread + 2 * PADDING, MIN_ZOOM_SIZE, MAX_ZOOM_SIZE);
    const centreX = (Math.max(...xs) + Math.min(...xs)) / 2;
    const centreY = (Math.max(...ys) + Math.min(...ys)) / 2;
    const rect: Rect = {
      x: clamp(Math.round(centreX - size / 2), 0, FULL - size),
      y: clamp(Math.round(centreY - size / 2), 0, FULL - size),
      width: size,
      height: size,
    };
    const startMs = Math.max(0, first.t - LEAD_MS);
    const durationMs = clamp(last.t + TAIL_MS - startMs, MIN_ZOOM_MS, MAX_ZOOM_MS);
    const names = new Set(group.map((c) => c.name));
    const only = names.size === 1 ? [...names][0] ?? "" : "";
    all.push({ startMs, durationMs, rect, clicks: group.length, name: only });
  }
  // The busiest moments first when there are too many, then back into time order.
  const busiest = [...all].sort((a, b) => b.clicks - a.clicks || a.startMs - b.startMs).slice(0, Math.max(0, limit * 2));
  const blocked = existingZooms(model);
  const chosen: ZoomSuggestion[] = [];
  for (const s of busiest) {
    const end = s.startMs + s.durationMs;
    const clash = (other: { start: number; end: number }): boolean => s.startMs < other.end && other.start < end;
    if (blocked.some(clash)) continue;
    if (chosen.some((c) => clash({ start: c.startMs, end: c.startMs + c.durationMs }))) continue;
    chosen.push(s);
    if (chosen.length >= limit) break;
  }
  return chosen.sort((a, b) => a.startMs - b.startMs);
}

/** One suggestion in a sentence, to read or hear: when, how long, what it would show and what it is made from. */
export function describeSuggestion(s: ZoomSuggestion): string {
  const where = s.name !== "" ? `around "${s.name}"` : "around where you clicked";
  const from = s.clicks === 1 ? "1 click" : `${s.clicks} clicks`;
  return `At ${describeTime(s.startMs)}, for ${describeLength(s.durationMs)}: ${describeMagnification(s.rect)} on ${describePlace(s.rect)} of the picture, ${where} (${from}).`;
}
