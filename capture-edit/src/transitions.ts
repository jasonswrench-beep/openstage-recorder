// SPDX-License-Identifier: Apache-2.0
/**
 * Transitions (new in 0.4): how a picture arrives at the start of a clip, or leaves at its end.
 *
 * A transition lasts inside the clip, so it never changes the clip's length or where anything sits on the timeline. A fade
 * goes from or to black. A cross-fade, a wipe or a slide, at the start of a clip, goes from the picture that ends exactly
 * where the clip starts (its last picture is held while the new one comes in); with no such picture it comes in over black,
 * and the sentence says so. Only a fade can be used on the way out. Only a clip that has a picture can have a transition.
 * Sound is never changed by a transition; the clip's own volume fades do that.
 */

import { describeLength } from "./time.ts";
import {
  DEFAULT_TRANSITION_MS,
  MAX_TRANSITION_MS,
  MIN_TRANSITION_MS,
  TRANSITION_NAMES,
  clipEndMs,
  clipLengthMs,
  findClip,
  findSource,
  withClip,
  type Clip,
  type Model,
  type Transition,
  type TransitionKind,
} from "./model.ts";
import type { Refused, Result } from "./ops.ts";
import { validate } from "./validate.ts";

function refuse(message: string): Refused {
  return { ok: false, message };
}

function quote(name: string): string {
  return `"${name}"`;
}

/** A transition in words: "a cross-fade of 0.5 seconds". */
export function describeTransition(t: Transition): string {
  const name = TRANSITION_NAMES[t.kind].toLowerCase();
  return `${/^[aeiou]/.test(name) ? "an" : "a"} ${name} of ${describeLength(t.durationMs)}`;
}

/** The transitions a clip has, in one sentence, or an empty string when it has none. */
export function describeTransitions(clip: Clip): string {
  const parts: string[] = [];
  if (clip.transitionIn !== undefined) parts.push(`arrives with ${describeTransition(clip.transitionIn)}`);
  if (clip.transitionOut !== undefined) parts.push(`leaves with ${describeTransition(clip.transitionOut)}`);
  return parts.join(" and ");
}

/** The kinds that can be used at the start of a clip, and at its end. */
export const IN_KINDS: readonly TransitionKind[] = ["fade", "cross-fade", "wipe-right", "wipe-down", "slide"];
export const OUT_KINDS: readonly TransitionKind[] = ["fade"];

/** Whether a clip's picture has a transition's start edge touching another picture on its track. */
export function hasNeighbour(model: Model, clipId: string): boolean {
  const found = findClip(model, clipId);
  if (found === undefined) return false;
  const before = found.track.clips[found.clipIndex - 1];
  return before !== undefined && clipEndMs(before) === found.clip.startMs;
}

/**
 * Set, change or take away a transition at the start (`"in"`) or end (`"out"`) of a clip. `null` takes it away. The length
 * is in milliseconds (half a second if left out). Refuses a clip with no picture, a kind that cannot be used there, a length
 * outside the allowed range, or one that does not fit in the clip together with the other transition.
 */
export function setTransition(model: Model, clipId: string, which: "in" | "out", kind: TransitionKind | null, durationMs: number = DEFAULT_TRANSITION_MS): Result {
  const found = findClip(model, clipId);
  if (found === undefined) return refuse(`There is no clip with the id ${clipId}.`);
  const { clip } = found;
  const source = findSource(model, clip.source);
  if (source !== undefined && ["microphone", "system-audio", "audio"].includes(source.kind)) {
    return refuse(`Clip ${quote(clip.name)} is sound only, so it has no transition. Transitions change the picture.`);
  }
  const field = which === "in" ? "transitionIn" : "transitionOut";
  const had = clip[field];
  const where = which === "in" ? "arrives" : "leaves";
  const { transitionIn: _i, transitionOut: _o, ...rest } = clip;
  const keep = (other: "transitionIn" | "transitionOut"): Partial<Clip> => (clip[other] === undefined ? {} : { [other]: clip[other] });
  if (kind === null) {
    if (had === undefined) return { ok: true, model, label: "", message: `Clip ${quote(clip.name)} has no transition when it ${which === "in" ? "arrives" : "leaves"}.` };
    const next: Clip = { ...rest, ...keep(which === "in" ? "transitionOut" : "transitionIn") };
    return { ok: true, model: withClip(model, found.track.id, next), label: "remove transition", message: `Clip ${quote(clip.name)} now ${where} with no transition.`, focus: [clipId] };
  }
  if (which === "out" && !OUT_KINDS.includes(kind)) {
    return refuse(`Only a fade can be used when a clip leaves. A ${TRANSITION_NAMES[kind].toLowerCase()} belongs at the start of the next clip.`);
  }
  const ms = Math.round(durationMs);
  if (!Number.isFinite(ms) || ms < MIN_TRANSITION_MS || ms > MAX_TRANSITION_MS) {
    return refuse(`A transition lasts from ${describeLength(MIN_TRANSITION_MS)} to ${describeLength(MAX_TRANSITION_MS)}.`);
  }
  const length = clipLengthMs(clip);
  const other = which === "in" ? clip.transitionOut : clip.transitionIn;
  if (ms + (other?.durationMs ?? 0) > length) {
    return refuse(
      `The transitions would last ${describeLength(ms + (other?.durationMs ?? 0))} together, but the clip is only ${describeLength(length)} long. Make one shorter.`,
    );
  }
  if (had !== undefined && had.kind === kind && had.durationMs === ms) {
    return { ok: true, model, label: "", message: `Clip ${quote(clip.name)} already ${where} with ${describeTransition(had)}.` };
  }
  const transition: Transition = { kind, durationMs: ms };
  const next: Clip = { ...rest, ...keep(which === "in" ? "transitionOut" : "transitionIn"), [field]: transition };
  const made = withClip(model, found.track.id, next);
  const errors = validate(made).filter((p) => p.severity === "error" && p.clipId === clipId);
  if (errors[0] !== undefined) return refuse(errors[0].message);
  const warned = validate(made).find((p) => p.code === "transition-no-neighbour" && p.clipId === clipId);
  return {
    ok: true,
    model: made,
    label: "set transition",
    message: `Clip ${quote(clip.name)} now ${where} with ${describeTransition(transition)}.` + (warned === undefined || which === "out" ? "" : ` Warning: ${warned.message}`),
    focus: [clipId],
  };
}
