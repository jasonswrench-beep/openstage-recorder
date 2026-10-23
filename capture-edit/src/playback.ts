// SPDX-License-Identifier: Apache-2.0
/**
 * What plays at a moment of the edit: which pictures and sounds, where in each recording they are, how loud, which
 * overlays are showing, and how far zoomed in. This is the schedule a preview follows, worked out from the edit
 * alone so it can be tested without a screen.
 *
 * It follows the exporter's rules (`openstage-capture-render`): a screen, webcam, video or image clip gives
 * picture and nothing else (a screen recording's own sound is not used; the microphone and the computer's sound
 * are separate clips), a microphone, computer-sound or sound-file clip gives sound, fades are straight lines, and
 * a zoom moves in and out along a smooth curve. The preview is a way to check the edit, and the exported video is
 * what counts.
 */

import {
  clipEndMs,
  findSource,
  itemEndMs,
  sameSource,
  FULL,
  type Clip,
  type Item,
  type Model,
  type Rect,
  type SourceKind,
  type SourceRef,
  type TrackKind,
  type TransitionKind,
} from "./model.ts";
import { wholeMs } from "./time.ts";

/** A clip that is playing at the moment asked about. */
export interface PlayingClip {
  readonly clipId: string;
  readonly trackId: string;
  readonly trackKind: TrackKind;
  readonly name: string;
  readonly source: SourceRef;
  readonly kind: SourceKind;
  /** Where in the recording this moment is, in the recording's own time. */
  readonly sourceMs: number;
  /** Where the picture sits in the frame, if the clip says. */
  readonly placement: Rect | undefined;
  /** How much to multiply the sound by: 0 silence, 1 as recorded. Always 1 for a picture. */
  readonly gain: number;
  /** A transition showing on this picture now (new in 0.4), if any. */
  readonly transition?: PlayingTransition;
  /** True for the last picture of the clip before, held still while the next one arrives (it is a picture only, never a sound). */
  readonly held?: boolean;
}

/**
 * A transition in progress. `progress` goes from 0 to 1 over its length, eased. For `in` the picture is visible by `progress`,
 * for `out` by `1 - progress`, and the picture held beneath an arriving one is `under` (a slide pushes it away; the others leave it still).
 */
export interface PlayingTransition {
  readonly kind: TransitionKind;
  readonly phase: "in" | "out" | "under";
  readonly progress: number;
}

export interface ZoomView {
  /** The part of the picture that fills the frame. The whole picture is `{0, 0, FULL, FULL}`. */
  readonly rect: Rect;
  /** True while it is moving in or out. */
  readonly moving: boolean;
}

export interface Moment {
  readonly timeMs: number;
  /** The pictures showing, in track order: later ones are drawn over earlier ones. */
  readonly pictures: readonly PlayingClip[];
  /** The sounds playing (muted clips are left out). */
  readonly sounds: readonly PlayingClip[];
  /** The text, shapes, arrows, blurs and redactions showing, in the order they are drawn. */
  readonly overlays: readonly Item[];
  readonly zoom: ZoomView;
}

const WHOLE: Rect = { x: 0, y: 0, width: FULL, height: FULL };

const PICTURE_TRACKS: readonly TrackKind[] = ["screen", "webcam", "media"];
const PICTURE_SOURCES: readonly SourceKind[] = ["screen", "webcam", "video", "image"];
const SOUND_SOURCES: readonly SourceKind[] = ["microphone", "system-audio", "audio"];

/** 0 to 1, starting and ending gently (the exporter's curve). */
export function smoothstep(p: number): number {
  const q = Math.min(1, Math.max(0, p));
  return q * q * (3 - 2 * q);
}

function lerp(a: Rect, b: Rect, p: number): Rect {
  const mix = (x: number, y: number) => x + (y - x) * p;
  return { x: mix(a.x, b.x), y: mix(a.y, b.y), width: mix(a.width, b.width), height: mix(a.height, b.height) };
}

/** How loud a clip is at a moment: the volume setting, with straight-line fades at each end. Muted is silent. */
export function gainAt(clip: Clip, timeMs: number): number {
  if (clip.muted || timeMs < clip.startMs || timeMs >= clipEndMs(clip)) return 0;
  let gain = 10 ** (clip.volumeDb / 20);
  const into = timeMs - clip.startMs;
  const before = clipEndMs(clip) - timeMs;
  if (clip.fadeInMs > 0 && into < clip.fadeInMs) gain *= into / clip.fadeInMs;
  if (clip.fadeOutMs > 0 && before < clip.fadeOutMs) gain *= before / clip.fadeOutMs;
  return gain;
}

/** How far back from the end of a clip its held last picture is taken, in the clip's own time (the very last moment of a video may be blank). */
const HELD_BACK_MS = 40;

/** The transition a clip is showing at a moment, or undefined. */
function transitionAt(clip: Clip, at: number): PlayingTransition | undefined {
  const tin = clip.transitionIn;
  if (tin !== undefined && at < clip.startMs + tin.durationMs) {
    return { kind: tin.kind, phase: "in", progress: smoothstep((at - clip.startMs) / tin.durationMs) };
  }
  const tout = clip.transitionOut;
  const end = clipEndMs(clip);
  if (tout !== undefined && at >= end - tout.durationMs) {
    return { kind: tout.kind, phase: "out", progress: smoothstep((at - (end - tout.durationMs)) / tout.durationMs) };
  }
  return undefined;
}

/** What plays at a moment. With `reduceMotion` a zoom cuts straight in and out instead of moving. */
export function momentAt(model: Model, timeMs: number, options: { readonly reduceMotion?: boolean } = {}): Moment {
  const at = wholeMs(timeMs);
  const pictures: PlayingClip[] = [];
  const sounds: PlayingClip[] = [];
  const overlays: Item[] = [];
  let zoom: ZoomView = { rect: WHOLE, moving: false };
  let zoomed = false;

  for (const track of model.tracks) {
    for (const clip of track.clips) {
      if (!(clip.startMs <= at && at < clipEndMs(clip))) continue;
      const source = findSource(model, clip.source);
      if (source === undefined) continue;
      const playing = (gain: number): PlayingClip => ({
        clipId: clip.id,
        trackId: track.id,
        trackKind: track.kind,
        name: clip.name,
        source: clip.source,
        kind: source.kind,
        sourceMs: clip.sourceStartMs + (at - clip.startMs),
        placement: clip.placement,
        gain,
      });
      if (PICTURE_TRACKS.includes(track.kind) && PICTURE_SOURCES.includes(source.kind)) {
        const moving = options.reduceMotion === true ? undefined : transitionAt(clip, at);
        if (moving !== undefined && moving.phase === "in" && moving.kind !== "fade") {
          // The picture before it, held still underneath. Another part of the same recording cannot be shown twice at once, so it is a cut.
          const before = track.clips.find((c) => clipEndMs(c) === clip.startMs && c.id !== clip.id);
          const beforeSource = before === undefined ? undefined : findSource(model, before.source);
          if (before !== undefined && beforeSource !== undefined && PICTURE_SOURCES.includes(beforeSource.kind) && !sameSource(before.source, clip.source)) {
            pictures.push({
              clipId: before.id,
              trackId: track.id,
              trackKind: track.kind,
              name: before.name,
              source: before.source,
              kind: beforeSource.kind,
              sourceMs: Math.max(before.sourceStartMs, before.sourceEndMs - HELD_BACK_MS),
              placement: before.placement,
              gain: 1,
              held: true,
              transition: { kind: moving.kind, phase: "under", progress: moving.progress },
            });
            pictures.push({ ...playing(1), transition: moving });
          } else if (before === undefined || beforeSource === undefined || !PICTURE_SOURCES.includes(beforeSource.kind)) {
            pictures.push({ ...playing(1), transition: moving }); // nothing before it: it comes in over black
          } else {
            pictures.push(playing(1));
          }
        } else {
          pictures.push(moving === undefined ? playing(1) : { ...playing(1), transition: moving });
        }
      }
      if (SOUND_SOURCES.includes(source.kind)) {
        const gain = gainAt(clip, at);
        if (gain > 0) sounds.push(playing(gain));
      }
    }
    for (const item of track.items) {
      if (!(item.startMs <= at && at < itemEndMs(item))) continue;
      if (item.kind !== "zoom") {
        overlays.push(item);
        continue;
      }
      if (zoomed) continue; // zooms do not overlap, so at most one applies
      zoomed = true;
      const end = itemEndMs(item);
      if (options.reduceMotion === true || item.transitionMs === 0) {
        zoom = { rect: item.rect, moving: false };
      } else if (at < item.startMs + item.transitionMs) {
        zoom = { rect: lerp(WHOLE, item.rect, smoothstep((at - item.startMs) / item.transitionMs)), moving: true };
      } else if (at >= end - item.transitionMs) {
        zoom = { rect: lerp(WHOLE, item.rect, smoothstep((end - at) / item.transitionMs)), moving: true };
      } else {
        zoom = { rect: item.rect, moving: false };
      }
    }
  }
  return { timeMs: at, pictures, sounds, overlays, zoom };
}
