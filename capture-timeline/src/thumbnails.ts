// SPDX-License-Identifier: Apache-2.0
/**
 * Small pictures of a recording at a moment, for the strips on the clips of the timeline.
 *
 * They are decoration, so everything here is allowed to fail quietly: a recording that cannot be read, a web view that
 * refuses to hand over a picture, a file still being written. A clip with no pictures is shown as it was before, with its
 * name and its colour, and nothing is said about it, because nothing the author needs is missing.
 *
 * A picture is taken by seeking a hidden video to the moment and drawing it on a canvas (the same way the steps feature
 * grabs pictures; see docs/decisions/0003-steps-and-practice.md, which found that the web view only lets a canvas be read
 * back when the video has `crossOrigin = "anonymous"`). One video for each recording, one seek at a time, the newest request
 * first, and a request is dropped if nobody wants its picture any more by the time its turn comes (the author has scrolled
 * or zoomed on). Pictures are kept as small JPEG data addresses, up to a few hundred.
 */

import type { SourceRef } from "../../capture-edit/src/index.ts";
import type { MediaLibrary } from "./project.ts";

/** How wide one picture is on the screen, in pixels. */
export const TILE_PX = 56;

const FRAME_W = 112;
const FRAME_H = 63;
const MAX_KEPT = 400;
const LOAD_TIMEOUT_MS = 10_000;
const SEEK_TIMEOUT_MS = 3000;

/** The moments pictures are taken at, so a picture can be used again when the timeline is zoomed or scrolled a little. */
const STEPS_MS = [250, 500, 1000, 2000, 5000, 10_000, 30_000, 60_000];

/** The step a picture's moment is rounded down to: the largest that is no more than the time one picture covers. */
export function stepFor(tileMs: number): number {
  let best = STEPS_MS[0] ?? 250;
  for (const step of STEPS_MS) if (step <= tileMs) best = step;
  return best;
}

/** The moment a picture is taken at: the middle of what it covers, rounded down to a step. */
export function momentFor(startMs: number, tileMs: number): number {
  const step = stepFor(tileMs);
  return Math.floor((startMs + tileMs / 2) / step) * step;
}

export interface Thumbnails {
  /** Is there a picture to be had from this recording? False until `prepare` has finished, and for ever if it cannot be read. */
  usable(ref: SourceRef): boolean;
  /** Start finding out. `then` is called once, when it is known to be usable (never if it is not). */
  prepare(ref: SourceRef, then: () => void): void;
  /** A picture that has already been made, or undefined. */
  peek(ref: SourceRef, ms: number): string | undefined;
  /** Make a picture. `wanted` is asked when its turn comes; if it says no, the answer is undefined and no seek is made. */
  frame(ref: SourceRef, ms: number, wanted: () => boolean): Promise<string | undefined>;
  destroy(): void;
}

interface Request {
  readonly key: string;
  readonly ms: number;
  readonly wanted: () => boolean;
  readonly done: (url: string | undefined) => void;
}

interface Recording {
  state: "loading" | "ready" | "failed";
  video: HTMLVideoElement | undefined;
  readonly waiting: Set<() => void>;
  readonly queue: Request[];
  busy: boolean;
}

function keyOf(ref: SourceRef): string {
  return ref.kind === "take" ? `take:${ref.take}:${ref.media}` : `asset:${ref.asset}`;
}

export function createThumbnails(library: MediaLibrary): Thumbnails {
  const recordings = new Map<string, Recording>();
  const kept = new Map<string, string>();
  let canvas: HTMLCanvasElement | undefined;
  let destroyed = false;

  function remember(key: string, url: string): void {
    kept.set(key, url);
    if (kept.size > MAX_KEPT) {
      const oldest = kept.keys().next().value;
      if (oldest !== undefined) kept.delete(oldest);
    }
  }

  function fail(rec: Recording): void {
    rec.state = "failed";
    rec.waiting.clear();
    for (const request of rec.queue.splice(0)) request.done(undefined);
    if (rec.video !== undefined) {
      rec.video.removeAttribute("src");
      rec.video.load();
      rec.video = undefined;
    }
  }

  function open(rec: Recording, url: string): void {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "auto";
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    rec.video = video;
    const timer = window.setTimeout(() => fail(rec), LOAD_TIMEOUT_MS);
    video.addEventListener(
      "loadeddata",
      () => {
        window.clearTimeout(timer);
        if (destroyed || rec.state !== "loading") return;
        rec.state = "ready";
        const callbacks = [...rec.waiting];
        rec.waiting.clear();
        for (const then of callbacks) then();
      },
      { once: true },
    );
    video.addEventListener("error", () => {
      window.clearTimeout(timer);
      if (rec.state !== "failed") fail(rec);
    });
    video.src = url;
  }

  function seek(video: HTMLVideoElement, seconds: number): Promise<boolean> {
    const target = Number.isFinite(video.duration) && video.duration > 0 ? Math.min(seconds, Math.max(0, video.duration - 0.05)) : seconds;
    if (video.readyState >= 2 && Math.abs(video.currentTime - target) < 0.001) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => {
        video.removeEventListener("seeked", onSeeked);
        resolve(false);
      }, SEEK_TIMEOUT_MS);
      const onSeeked = (): void => {
        window.clearTimeout(timer);
        resolve(true);
      };
      video.addEventListener("seeked", onSeeked, { once: true });
      video.currentTime = target;
    });
  }

  /** Draw what the video shows now, filling the small frame (the middle of the picture if the shape differs). */
  function draw(video: HTMLVideoElement): string | undefined {
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (vw === 0 || vh === 0) return undefined;
    canvas ??= document.createElement("canvas");
    canvas.width = FRAME_W;
    canvas.height = FRAME_H;
    const context = canvas.getContext("2d");
    if (context === null) return undefined;
    const scale = Math.max(FRAME_W / vw, FRAME_H / vh);
    const sw = FRAME_W / scale;
    const sh = FRAME_H / scale;
    context.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, FRAME_W, FRAME_H);
    return canvas.toDataURL("image/jpeg", 0.6); // throws if the web view will not hand the picture over
  }

  async function pump(rec: Recording): Promise<void> {
    if (rec.busy) return;
    rec.busy = true;
    // Wait a moment first, so the caller has finished putting its pictures on the page before it is asked whether it wants them.
    await Promise.resolve();
    try {
      while (rec.state === "ready" && rec.video !== undefined) {
        const request = rec.queue.pop(); // the newest first: it is the one on the screen now
        if (request === undefined) break;
        if (destroyed || !request.wanted()) {
          request.done(undefined);
          continue;
        }
        const cached = kept.get(request.key);
        if (cached !== undefined) {
          request.done(cached);
          continue;
        }
        const video = rec.video;
        const seeked = await seek(video, request.ms / 1000);
        if (!seeked || rec.state !== "ready") {
          request.done(undefined);
          continue;
        }
        try {
          const url = draw(video);
          if (url !== undefined) remember(request.key, url);
          request.done(url);
        } catch {
          // The web view will not give pictures from this recording. Do not keep trying.
          request.done(undefined);
          fail(rec);
        }
      }
    } finally {
      rec.busy = false;
    }
  }

  function recordingFor(ref: SourceRef): Recording | undefined {
    return recordings.get(keyOf(ref));
  }

  return {
    usable(ref) {
      return recordingFor(ref)?.state === "ready";
    },
    prepare(ref, then) {
      if (destroyed) return;
      const key = keyOf(ref);
      const known = recordings.get(key);
      if (known !== undefined) {
        if (known.state === "ready") then();
        else if (known.state === "loading") known.waiting.add(then);
        return;
      }
      const rec: Recording = { state: "loading", video: undefined, waiting: new Set([then]), queue: [], busy: false };
      recordings.set(key, rec);
      void library
        .url(ref)
        .then((url) => {
          if (destroyed) return;
          if (url === undefined) fail(rec);
          else open(rec, url);
        })
        .catch(() => fail(rec));
    },
    peek(ref, ms) {
      return kept.get(`${keyOf(ref)}@${ms}`);
    },
    frame(ref, ms, wanted) {
      const key = `${keyOf(ref)}@${ms}`;
      const have = kept.get(key);
      if (have !== undefined) return Promise.resolve(have);
      const rec = recordingFor(ref);
      if (rec === undefined || rec.state !== "ready") return Promise.resolve(undefined);
      return new Promise((resolve) => {
        rec.queue.push({ key, ms, wanted, done: resolve });
        void pump(rec);
      });
    },
    destroy() {
      destroyed = true;
      for (const rec of recordings.values()) {
        for (const request of rec.queue.splice(0)) request.done(undefined);
        if (rec.video !== undefined) {
          rec.video.removeAttribute("src");
          rec.video.load();
          rec.video = undefined;
        }
      }
      recordings.clear();
      kept.clear();
    },
  };
}
