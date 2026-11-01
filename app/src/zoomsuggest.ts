// SPDX-License-Identifier: Apache-2.0
// Suggested zooms, as far as the app goes: finding, for each take the edit uses, the clicks that were noted while recording and how big the picture
// they were made on is. The rules that turn clicks into zooms are in capture-edit (suggest.ts); this reads the recording for them and says in
// words why there is nothing to suggest from.
//
// A click is measured in pixels of the display. For a part of a screen the take says where that part starts and how big it is, which is all that is
// needed. For a whole screen the picture is the display, whose size the take does not say, so it is read from the video itself (asked of the
// caller, which has a way to look at a video).

import { readClicks, type Model, type TakeClicks } from "../../capture-edit/src/index.ts";
import type { ProjectFolder } from "../../capture-timeline/src/project.ts";

export interface VideoSize {
  readonly width: number;
  readonly height: number;
}

export interface Gathered {
  /** The clicks and picture of each take that has any, by the take's number. */
  readonly takes: ReadonlyMap<number, TakeClicks>;
  /** In words, what could not be used and why. */
  readonly notes: readonly string[];
  /** How many takes the edit uses that did not note the mouse at all. */
  readonly notNoted: number;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const whole = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

/** The numbers of the takes whose pictures the edit shows, in order. */
export function screenTakes(model: Model): number[] {
  const found = new Set<number>();
  for (const track of model.tracks) {
    if (track.kind !== "screen") continue;
    for (const clip of track.clips) if (clip.source.kind === "take") found.add(clip.source.take);
  }
  return [...found].sort((a, b) => a - b);
}

const takeFolder = (take: number): string => `takes/take-${String(take).padStart(3, "0")}`;

/** Read what is needed to suggest zooms for every take the edit shows. Never throws: what cannot be read is a note. */
export async function gatherClicks(folder: ProjectFolder, model: Model, videoSize: (url: string) => Promise<VideoSize | undefined>): Promise<Gathered> {
  const takes = new Map<number, TakeClicks>();
  const notes: string[] = [];
  let notNoted = 0;
  for (const take of screenTakes(model)) {
    const where = takeFolder(take);
    let manifest: unknown;
    try {
      const text = await folder.readText(`${where}/take.json`);
      manifest = text === undefined ? undefined : JSON.parse(text);
    } catch {
      manifest = undefined;
    }
    const media = isObject(manifest) && Array.isArray(manifest["media"]) ? (manifest["media"] as unknown[]).filter(isObject) : [];
    const screen = media.find((m) => m["kind"] === "screen");
    const log = media.find((m) => m["kind"] === "interactions");
    if (screen === undefined || log === undefined) {
      notNoted += 1;
      continue;
    }
    const file = typeof log["file"] === "string" && /^[\w.-]+$/.test(log["file"]) ? log["file"] : "events.jsonl";
    const clicks = readClicks((await folder.readText(`${where}/${file}`).catch(() => undefined)) ?? "");
    if (clicks.length === 0) continue;
    const region = isObject(screen["region"]) ? screen["region"] : undefined;
    if (region !== undefined) {
      const width = whole(region["width"]);
      const height = whole(region["height"]);
      const left = whole(region["x"]) ?? 0;
      const top = whole(region["y"]) ?? 0;
      if (width === undefined || height === undefined || width <= 0 || height <= 0) {
        notes.push(`Take ${take} recorded part of a screen, but the size of that part could not be read, so no zooms are suggested from it.`);
        continue;
      }
      takes.set(take, { clicks, picture: { width, height, left, top } });
      continue;
    }
    const mediaFile = typeof screen["file"] === "string" && /^[\w.-]+$/.test(screen["file"]) ? screen["file"] : "screen.mp4";
    const url = await folder.mediaUrl(`${where}/${mediaFile}`).catch(() => undefined);
    const size = url === undefined ? undefined : await videoSize(url).catch(() => undefined);
    if (size === undefined || size.width <= 0 || size.height <= 0) {
      notes.push(`The size of the picture of take ${take} could not be read, so no zooms are suggested from its clicks.`);
      continue;
    }
    takes.set(take, { clicks, picture: { width: size.width, height: size.height, left: 0, top: 0 } });
  }
  return { takes, notes, notNoted };
}

/** What to tell the author when there is nothing to suggest from. */
export function nothingToSuggestFrom(g: Gathered): string {
  if (g.notes.length > 0) return g.notes.join(" ");
  if (g.notNoted > 0) {
    return "This recording did not note where the mouse went, so there is nothing to suggest zooms from. Tick \"Note where the mouse goes and where I click\" on the Record screen before the next recording.";
  }
  return "No clicks were noted in this recording, so there is nothing to suggest zooms from.";
}

/** Look at a video's first moment for its size in pixels. Resolves to nothing if it cannot be read in a few seconds. */
export function videoSizeOf(url: string, timeoutMs = 5000): Promise<VideoSize | undefined> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    let done = false;
    const finish = (size: VideoSize | undefined): void => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      video.removeAttribute("src");
      video.load();
      resolve(size);
    };
    const timer = setTimeout(() => finish(undefined), timeoutMs);
    video.addEventListener("loadedmetadata", () => finish(video.videoWidth > 0 && video.videoHeight > 0 ? { width: video.videoWidth, height: video.videoHeight } : undefined));
    video.addEventListener("error", () => finish(undefined));
    video.src = url;
  });
}
