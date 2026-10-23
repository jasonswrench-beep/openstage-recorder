// SPDX-License-Identifier: Apache-2.0
/**
 * Everything behind the editing screens, with no screen: which rows are chosen, where the playhead is, every
 * command (split, trim, delete, join, move, rename, set an exact time, volume and fades, move to another track,
 * undo), and the drags (a mouse drag, or a key held down on a grip) that are many small changes but one undo step.
 *
 * The screens (`panel.ts`, `timeline-panel.ts`) only show this and pass keys and pointer movements to it, so every
 * behaviour can be tested here without a browser. Every command gives back a sentence in plain words, either what
 * it did or why it could not, and the screens say that sentence aloud through a live region.
 *
 * Choices made here that could have gone the other way (listed in `README.md` for the owner to veto):
 * the choice stays on the same clip after a split or a join; after a delete it goes to the row that took the
 * deleted row's place; the playhead is kept inside the edit; Delete leaves a gap and Shift+Delete closes it (the
 * edit model gives no default, so both are offered and named); with several rows chosen, split, trim, delete and
 * mute act on all of them as one undo step, and everything else asks for one row.
 */

import {
  ALLOWED_ITEMS,
  DEFAULT_TRANSITION_MS,
  TRANSITION_KINDS,
  TRANSITION_NAMES,
  hasNeighbour,
  setTransition,
  type Clip,
  type Transition,
  type TransitionKind,
  ALLOWED_SOURCES,
  MAX_VOLUME_DB,
  MIN_VOLUME_DB,
  addCallout,
  addImportedFile,
  setHasTextAlternative,
  setImageText,
  type ImportedFile,
  addTrack,
  addZoomRegion,
  copyRows,
  deleteClip,
  deleteItem,
  deleteRange,
  deleteTrack,
  describeAt,
  describeCopied,
  describeChange,
  describeLength,
  describeRows,
  describeTime,
  findClip,
  findItem,
  findSource,
  History,
  groupMoveLimits,
  joinWithNext,
  limitsOf,
  listCaption,
  listRows,
  modelLengthMs,
  moveClipToTrack,
  moveItem,
  moveItemToTrack,
  moveRowsBy,
  parseTime,
  pastedEndMs,
  pasteCopied,
  renameClip,
  renameItem,
  renameTrack,
  reorderClip,
  setClipLength,
  setArrowEnds,
  setArrowStyle,
  setClipStart,
  setCoverColor,
  setFades,
  setItemAltText,
  setItemRect,
  setShapeStyle,
  setText,
  setTextStyle,
  setZoom,
  setMuted,
  setVolume,
  splitAt,
  stepTime,
  trimEnd,
  trimItemEnd,
  trimItemStart,
  trimStart,
  type ArrowStyle,
  type CalloutKind,
  type Copied,
  type Item,
  type Model,
  type Point,
  type Rect,
  type ShapeStyle,
  type TextStyle,
  type ZoomSettings,
  type Range,
  type Result,
  type Row,
  type StepKey,
  type TrackKind,
} from "../../capture-edit/src/index.ts";
import { snapTargets, snapTo } from "./snap.ts";

/** What a command says back: a sentence for the author, and whether it worked. */
export interface Outcome {
  readonly ok: boolean;
  /** What to tell the author, in words. */
  readonly message: string;
}

/** An outcome of moving the choice, which also says whether the choice actually moved. */
export interface Moved extends Outcome {
  readonly changed: boolean;
}

/**
 * What changed, so a screen only redraws what it must. `drag` is the edit changing under a drag in progress: a
 * screen that is not showing the drag leaves it until the drag ends and `model` follows. `saved` is the edit being
 * marked as saved. `transport` is playing starting or stopping. `clipboard` is something being copied, so a Paste button can show it can be used.
 * `tools` is the marks of a stretch to remove, or snapping, being changed: not the edit, so nothing is redrawn but those.
 */
export type ChangeKind = "model" | "selection" | "playhead" | "drag" | "saved" | "transport" | "clipboard" | "tools";

export type Where = "previous" | "next" | "first" | "last";

/** Whatever plays the edit (the preview): the session only asks it to start or stop, and is told when it has. */
export interface Transport {
  toggle(): Outcome;
}

/** What is being dragged: the whole clip (its start moves, its length stays), or one of its two grips. */
export type DragKind = "move" | "start" | "end";

/** What the form under the list shows for the primary row. */
export interface Details {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly trackId: string;
  readonly trackName: string;
  readonly startMs: number;
  readonly lengthMs: number;
  readonly endMs: number;
  /** A clip can be split, joined, reordered, muted and given a volume; an overlay or zoom cannot. */
  readonly isClip: boolean;
  readonly muted: boolean;
  readonly volumeDb: number;
  readonly fadeInMs: number;
  readonly fadeOutMs: number;
  /** A clip with a picture can have transitions; a sound cannot. */
  readonly hasPicture: boolean;
  /** An image: it needs alt text, or to be marked decorative. */
  readonly isImage: boolean;
  readonly altText: string;
  readonly decorative: boolean;
  /** An imported video or sound: it needs captions, a script or a transcript. */
  readonly isImportedMedia: boolean;
  readonly hasTextAlternative: boolean;
  readonly transitionIn?: Transition;
  readonly transitionOut?: Transition;
}

/** A track the primary row could be moved to, or is on now. */
export interface TrackChoice {
  readonly id: string;
  readonly name: string;
  readonly current: boolean;
}

/** A drag in progress, for the screen that shows it. */
export interface DragState {
  readonly id: string;
  readonly kind: DragKind;
  readonly via: "pointer" | "keys";
  /** The lowest and highest time the dragged thing can be taken to (a start for `move` and `start`, an end for `end`). */
  readonly range: Range;
  /** Where it is now. */
  readonly value: number;
  /** Every row that moves with it: just itself, unless several were chosen and the whole of them is being moved. */
  readonly ids: readonly string[];
  /** The time it has snapped to, so a guide can be drawn there; undefined when it is not snapped to anything. */
  readonly snappedTo: number | undefined;
}

/** A drag as the session keeps it: the same as `DragState`, with what it needs to finish or cancel. */
interface OpenDrag {
  readonly id: string;
  readonly kind: DragKind;
  readonly via: "pointer" | "keys";
  readonly range: Range;
  value: number;
  readonly before: Model;
  readonly label: string;
  lastMessage: string;
  /** Every row moving together (only more than one when a group of chosen rows is moved whole). */
  readonly ids: readonly string[];
  readonly group: boolean;
  /** Where the dragged value was when the drag began: the group's total shift is `value - origin`. */
  readonly origin: number;
  /** The edges that can snap, counted from the dragged value (see `snapTo`). */
  readonly edges: readonly number[];
  snappedTo: number | undefined;
}

function quote(name: string): string {
  return `"${name}"`;
}

function ok(message: string): Outcome {
  return { ok: true, message };
}

function no(message: string): Outcome {
  return { ok: false, message };
}

const NOTHING_SELECTED = "Nothing is selected. Select a row in the list first.";
const DRAG_IN_PROGRESS = "A drag is in progress. Let go to finish it, or press Escape to cancel it.";

/** What was typed for a volume: "-6", "+3", "3 dB", "-6 decibels". */
export function parseDecibels(text: string): { ok: true; db: number } | { ok: false; message: string } {
  const how = `Type a whole number of decibels from ${MIN_VOLUME_DB} to ${MAX_VOLUME_DB}, such as -6 (quieter) or 3 (louder). 0 leaves the sound as recorded.`;
  const trimmed = text.trim();
  if (trimmed === "") return { ok: false, message: `Nothing was typed. ${how}` };
  const found = /^([+-]?\d+(?:\.\d+)?)\s*(?:db|decibels?)?$/i.exec(trimmed);
  if (found === null) return { ok: false, message: `"${trimmed}" is not a number of decibels. ${how}` };
  const db = Number(found[1]);
  if (!Number.isInteger(db)) return { ok: false, message: `The volume is changed in whole decibels, so "${trimmed}" is not allowed. ${how}` };
  return { ok: true, db };
}

export class EditSession {
  readonly #history: History;
  #playheadMs = 0;
  /** The row that has the focus, and the one the form and the grips belong to. */
  #primaryId: string | undefined;
  /** Every row that is chosen, the primary one included. */
  #chosen = new Set<string>();
  /** Where a range of rows, chosen with Shift, starts. */
  #anchorId: string | undefined;
  readonly #listeners = new Set<(kind: ChangeKind) => void>();
  #rowsFor: Model | undefined;
  #rows: readonly Row[] = [];
  #labelsFor: Model | undefined;
  #labels = new Map<string, string>();
  #saved: Model;
  #drag: OpenDrag | undefined;
  #transport: Transport | undefined;
  #playing = false;
  /** What was copied: kept inside the session, not on the computer's clipboard, so it is only ever this edit's own rows. */
  #clipboard: readonly Copied[] = [];
  /** Whether a drag with the mouse jumps to times that matter when it comes close. On unless the author turns it off. */
  #snapping = true;
  /** The marks of a stretch of time to remove, put at the playhead. They are the author's view, not part of the edit, so they are not in the undo history. */
  #stretchFrom: number | undefined;
  #stretchTo: number | undefined;

  constructor(model: Model, limit?: number) {
    this.#history = new History(model, limit);
    this.#saved = model;
    this.#primaryId = this.rows[0]?.clipId;
    if (this.#primaryId !== undefined) this.#chosen.add(this.#primaryId);
    this.#anchorId = this.#primaryId;
  }

  // ---- what the screens show ----

  get model(): Model {
    return this.#history.model;
  }

  /** Every clip, overlay and zoom, in track order and then time order. Worked out once per change. */
  get rows(): readonly Row[] {
    const model = this.#history.model;
    if (this.#rowsFor !== model) {
      this.#rows = listRows(model);
      this.#rowsFor = model;
    }
    return this.#rows;
  }

  /** A sentence saying how much the list holds, for its caption. */
  get caption(): string {
    return listCaption(this.#history.model);
  }

  /** How long the edit is, in milliseconds. */
  get lengthMs(): number {
    return modelLengthMs(this.#history.model);
  }

  get playheadMs(): number {
    return this.#playheadMs;
  }

  /** The row with the focus: the one the form and the grips belong to. */
  get selectedId(): string | undefined {
    return this.#primaryId;
  }

  get selectedRow(): Row | undefined {
    return this.rows.find((r) => r.clipId === this.#primaryId);
  }

  /** Every chosen row, in the order of the list. */
  get selectedRows(): readonly Row[] {
    return this.rows.filter((r) => this.#chosen.has(r.clipId));
  }

  get selectionCount(): number {
    return this.#chosen.size;
  }

  /** True when exactly one row is chosen and it is the one with the focus: then the form and the grips apply to it. */
  get singleChoice(): boolean {
    return this.#chosen.size === 1 && this.#primaryId !== undefined && this.#chosen.has(this.#primaryId);
  }

  isSelected(id: string): boolean {
    return this.#chosen.has(id);
  }

  /** The numbers and words the form shows for the primary row. */
  get details(): Details | undefined {
    const row = this.selectedRow;
    if (row === undefined) return undefined;
    const found = findClip(this.#history.model, row.clipId);
    const sourceKind = found === undefined ? undefined : findSource(this.#history.model, found.clip.source)?.kind;
    return {
      id: row.clipId,
      name: row.name,
      type: row.type,
      trackId: row.trackId,
      trackName: row.trackName,
      startMs: row.startMs,
      lengthMs: row.lengthMs,
      endMs: row.endMs,
      isClip: found !== undefined,
      muted: found?.clip.muted ?? false,
      volumeDb: found?.clip.volumeDb ?? 0,
      fadeInMs: found?.clip.fadeInMs ?? 0,
      fadeOutMs: found?.clip.fadeOutMs ?? 0,
      isImage: sourceKind === "image",
      altText: found?.clip.altText ?? "",
      decorative: found?.clip.decorative === true,
      isImportedMedia: found !== undefined && found.clip.source.kind === "asset" && (sourceKind === "video" || sourceKind === "audio"),
      hasTextAlternative: found === undefined ? false : findSource(this.#history.model, found.clip.source)?.hasTextAlternative === true,
      hasPicture: found !== undefined && !["microphone", "system-audio", "audio"].includes(findSource(this.#history.model, found.clip.source)?.kind ?? "audio"),
      ...(found?.clip.transitionIn === undefined ? {} : { transitionIn: found.clip.transitionIn }),
      ...(found?.clip.transitionOut === undefined ? {} : { transitionOut: found.clip.transitionOut }),
    };
  }

  /** The tracks the primary row can be on (the ones that take what it holds), with the one it is on marked. */
  get trackChoices(): readonly TrackChoice[] {
    const row = this.selectedRow;
    if (row === undefined) return [];
    const model = this.#history.model;
    const clip = findClip(model, row.clipId)?.clip;
    const item = clip === undefined ? findItem(model, row.clipId)?.item : undefined;
    const sourceKind = clip === undefined ? undefined : findSource(model, clip.source)?.kind;
    return model.tracks
      .filter((t) =>
        clip !== undefined
          ? sourceKind !== undefined && ALLOWED_SOURCES[t.kind].includes(sourceKind)
          : item !== undefined && ALLOWED_ITEMS[t.kind].includes(item.kind),
      )
      .map((t) => ({ id: t.id, name: t.name, current: t.id === row.trackId }));
  }

  get canUndo(): boolean {
    return this.#history.canUndo;
  }

  get canRedo(): boolean {
    return this.#history.canRedo;
  }

  get undoLabel(): string | undefined {
    return this.#history.undoLabel;
  }

  get redoLabel(): string | undefined {
    return this.#history.redoLabel;
  }

  /** True while the edit differs from the last time it was marked as saved. Undoing back to the saved edit clears it. */
  get dirty(): boolean {
    return this.#history.model !== this.#saved;
  }

  /** Say that the edit as it is now has been saved. */
  markSaved(): void {
    this.#saved = this.#history.model;
    this.#emit("saved");
  }

  /** Be told when something changes. Returns a function that stops the telling. */
  subscribe(listener: (kind: ChangeKind) => void): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  #emit(kind: ChangeKind): void {
    for (const listener of [...this.#listeners]) listener(kind);
  }

  /** One row in a sentence, as it is read when the row takes focus. Every row's sentence is worked out in one pass. */
  describeRow(id: string): string {
    const model = this.#history.model;
    if (this.#labelsFor !== model) {
      this.#labels = describeRows(model);
      this.#labelsFor = model;
    }
    return this.#labels.get(id) ?? `There is no row with the id ${id}.`;
  }

  /** The primary row in a sentence (on request). */
  describeSelected(): Outcome {
    const id = this.#primaryId;
    if (id === undefined) return no(NOTHING_SELECTED);
    const count = this.#chosen.size;
    return ok(count > 1 ? `${count} rows are chosen. The one with the focus: ${this.describeRow(id)}` : this.describeRow(id));
  }

  /** What is on screen and in the sound at the playhead, in words (story C4, on request). */
  describePlayhead(): Outcome {
    return ok(describeAt(this.#history.model, this.#playheadMs));
  }

  // ---- choosing rows ----

  /** Choose one row by its id (and no other). */
  select(id: string): Moved {
    const row = this.rows.find((r) => r.clipId === id);
    if (row === undefined) return { ok: false, message: `There is no row with the id ${id}.`, changed: false };
    this.#settle();
    const changed = this.#primaryId !== id || this.#chosen.size !== 1;
    this.#primaryId = id;
    this.#anchorId = id;
    this.#chosen = new Set([id]);
    if (changed) this.#emit("selection");
    return { ok: true, message: this.describeRow(id), changed };
  }

  /** Move the choice up, down, or to the first or last row. With `extend` the rows from where it started are all chosen. */
  moveSelection(where: Where, extend = false): Moved {
    this.#settle();
    const rows = this.rows;
    if (rows.length === 0) return { ok: false, message: "The list is empty.", changed: false };
    const at = rows.findIndex((r) => r.clipId === this.#primaryId);
    const last = rows.length - 1;
    let to: number;
    switch (where) {
      case "first":
        to = 0;
        break;
      case "last":
        to = last;
        break;
      case "previous":
        to = at <= 0 ? 0 : at - 1;
        break;
      case "next":
        to = at < 0 ? 0 : Math.min(at + 1, last);
        break;
    }
    const target = rows[to];
    if (target === undefined) return { ok: false, message: "The list is empty.", changed: false };
    if (at === to) {
      const edge = to === 0 ? "first" : "last";
      return { ok: true, message: rows.length === 1 ? "This is the only row." : `This is the ${edge} row.`, changed: false };
    }
    if (!extend) return this.select(target.clipId);
    return this.selectRange(target.clipId);
  }

  /** Move the focus up, down, or to the first or last row, without changing which rows are chosen (Ctrl with the arrow keys). */
  moveFocus(where: Where): Moved {
    this.#settle();
    const rows = this.rows;
    if (rows.length === 0) return { ok: false, message: "The list is empty.", changed: false };
    const at = rows.findIndex((r) => r.clipId === this.#primaryId);
    const last = rows.length - 1;
    const to = where === "first" ? 0 : where === "last" ? last : where === "previous" ? Math.max(0, at - 1) : Math.min(last, at + 1);
    const target = rows[to];
    if (target === undefined) return { ok: false, message: "The list is empty.", changed: false };
    if (at === to) return { ok: true, message: to === 0 ? "This is the first row." : "This is the last row.", changed: false };
    return this.focusOn(target.clipId);
  }

  /** Put the focus on a row without changing which rows are chosen. */
  focusOn(id: string): Moved {
    this.#settle();
    const row = this.rows.find((r) => r.clipId === id);
    if (row === undefined) return { ok: false, message: `There is no row with the id ${id}.`, changed: false };
    const changed = this.#primaryId !== id;
    this.#primaryId = id;
    if (changed) this.#emit("selection");
    return { ok: true, message: this.describeRow(id), changed };
  }

  /** Choose every row from where the choice started (the anchor) to this one, and put the focus on this one. */
  selectRange(id: string): Moved {
    this.#settle();
    const rows = this.rows;
    const to = rows.findIndex((r) => r.clipId === id);
    if (to < 0) return { ok: false, message: `There is no row with the id ${id}.`, changed: false };
    const from = Math.max(0, rows.findIndex((r) => r.clipId === (this.#anchorId ?? this.#primaryId)));
    const [low, high] = from <= to ? [from, to] : [to, from];
    const next = new Set(rows.slice(low, high + 1).map((r) => r.clipId));
    const changed = this.#primaryId !== id || next.size !== this.#chosen.size || [...next].some((x) => !this.#chosen.has(x));
    this.#chosen = next;
    this.#primaryId = id;
    if (changed) this.#emit("selection");
    return { ok: true, message: this.#choiceSentence(), changed };
  }

  /**
   * Choose a block of the timeline: every clip on the tracks from the one where the choice started to this one (in the order the
   * tracks are shown) that is showing at some time between the two clips. Shift and click on a clip in another track chooses what
   * is showing across all the tracks in between at that time, which is what cutting one moment out of a recording needs.
   */
  selectBlock(id: string): Moved {
    this.#settle();
    const rows = this.rows;
    const target = rows.find((r) => r.clipId === id);
    if (target === undefined) return { ok: false, message: `There is no row with the id ${id}.`, changed: false };
    const start = rows.find((r) => r.clipId === (this.#anchorId ?? this.#primaryId)) ?? target;
    const order = this.model.tracks.map((t) => t.id);
    const a = order.indexOf(start.trackId);
    const b = order.indexOf(target.trackId);
    const [lowTrack, highTrack] = a <= b ? [a, b] : [b, a];
    const from = Math.min(start.startMs, target.startMs);
    const to = Math.max(start.endMs, target.endMs);
    const next = new Set<string>([start.clipId, target.clipId]);
    for (const r of rows) {
      const t = order.indexOf(r.trackId);
      if (t < lowTrack || t > highTrack) continue;
      const showing = r.lengthMs === 0 ? r.startMs >= from && r.startMs <= to : r.startMs < to && r.endMs > from;
      if (showing) next.add(r.clipId);
    }
    const changed = this.#primaryId !== id || next.size !== this.#chosen.size || [...next].some((x) => !this.#chosen.has(x));
    this.#chosen = next;
    this.#primaryId = id;
    if (changed) this.#emit("selection");
    return { ok: true, message: this.#choiceSentence(), changed };
  }

  /** Add a row to the choice, or take it out (Ctrl+Space). One row always stays chosen. */
  toggleSelected(id: string | undefined = this.#primaryId): Moved {
    this.#settle();
    const row = this.rows.find((r) => r.clipId === id);
    if (id === undefined || row === undefined) return { ok: false, message: NOTHING_SELECTED, changed: false };
    if (this.#chosen.has(id)) {
      if (this.#chosen.size === 1) return { ok: false, message: "One row has to stay chosen.", changed: false };
      this.#chosen.delete(id);
      this.#primaryId = id; // the focus stays where it is
      this.#anchorId = id;
      this.#emit("selection");
      return { ok: true, message: `${quote(row.name)} is no longer chosen. ${this.#choiceSentence()}`, changed: true };
    }
    this.#chosen.add(id);
    this.#primaryId = id;
    this.#anchorId = id;
    this.#emit("selection");
    return { ok: true, message: `${quote(row.name)} is chosen too. ${this.#choiceSentence()}`, changed: true };
  }

  /** Choose every row. The focus stays where it is. */
  selectAll(): Moved {
    this.#settle();
    const rows = this.rows;
    if (rows.length === 0) return { ok: false, message: "The list is empty.", changed: false };
    const changed = this.#chosen.size !== rows.length;
    this.#chosen = new Set(rows.map((r) => r.clipId));
    if (this.#primaryId === undefined) this.#primaryId = rows[0]?.clipId;
    if (changed) this.#emit("selection");
    return { ok: true, message: `All ${rows.length} rows are chosen.`, changed };
  }

  /** Keep only the row that has the focus chosen (Escape). */
  keepOnlyPrimary(): Moved {
    this.#settle();
    const id = this.#primaryId;
    if (id === undefined) return { ok: false, message: NOTHING_SELECTED, changed: false };
    if (this.#chosen.size === 1) return { ok: true, message: "Only one row is chosen.", changed: false };
    this.#chosen = new Set([id]);
    this.#anchorId = id;
    this.#emit("selection");
    const row = this.selectedRow;
    return { ok: true, message: `Only ${quote(row?.name ?? "")} is chosen now.`, changed: true };
  }

  #choiceSentence(): string {
    const count = this.#chosen.size;
    return count === 1 ? "1 row is chosen." : `${count} rows are chosen.`;
  }

  // ---- the playhead ----

  /**
   * Where the playhead is, in words, and how that relates to the primary row, such as
   * `12.4 seconds, 2.4 seconds into "Lesson"`. This is what a screen reader says for the playhead slider.
   */
  get playheadText(): string {
    const at = this.#playheadMs;
    const base = describeTime(at);
    const row = this.selectedRow;
    if (row === undefined) return base;
    const name = quote(row.name);
    if (at < row.startMs) return `${base}, ${describeLength(row.startMs - at)} before ${name}`;
    if (at === row.startMs) return `${base}, at the start of ${name}`;
    if (at < row.endMs) return `${base}, ${describeLength(at - row.startMs)} into ${name}`;
    if (at === row.endMs) return `${base}, at the end of ${name}`;
    return `${base}, ${describeLength(at - row.endMs)} after ${name}`;
  }

  #playheadSentence(): string {
    return `Playhead at ${this.playheadText}.`;
  }

  #movePlayhead(to: number): void {
    if (to !== this.#playheadMs) {
      this.#playheadMs = to;
      this.#emit("playhead");
    }
  }

  /** Move the playhead with the keys of the Timeline: 0.1 second, with Shift 1 second, Page keys 5 seconds, Home and End. */
  stepPlayhead(key: StepKey, shift = false): Outcome {
    const from = this.#playheadMs;
    const to = stepTime(key, from, 0, this.lengthMs, { shift });
    this.#movePlayhead(to);
    if (to === from) {
      if (this.lengthMs === 0) return ok("The edit is empty, so the playhead stays at 0 seconds.");
      return ok(to === 0 ? "The playhead is at the start." : `The playhead is at the end, ${describeTime(to)}.`);
    }
    return ok(this.#playheadSentence());
  }

  /** Put the playhead at a time. A time beyond the end goes to the end, and says so. */
  setPlayhead(ms: number): Outcome {
    const length = this.lengthMs;
    const target = Math.max(0, Math.round(ms));
    const to = Math.min(target, length);
    this.#movePlayhead(to);
    return ok(target > length ? `The edit is only ${describeLength(length)} long, so the playhead went to the end. ${this.#playheadSentence()}` : this.#playheadSentence());
  }

  /** Put the playhead at what the author typed ("72.4", "1:12.4", "1m12.4s"). */
  setPlayheadText(text: string): Outcome {
    const parsed = parseTime(text);
    return parsed.ok ? this.setPlayhead(parsed.ms) : no(parsed.message);
  }

  /** Move the playhead to where the primary row starts. */
  playheadToSelectedStart(): Outcome {
    const row = this.selectedRow;
    if (row === undefined) return no(NOTHING_SELECTED);
    this.#movePlayhead(Math.min(row.startMs, this.lengthMs));
    return ok(this.#playheadSentence());
  }

  /** Move the playhead to where the primary row ends. */
  playheadToSelectedEnd(): Outcome {
    const row = this.selectedRow;
    if (row === undefined) return no(NOTHING_SELECTED);
    this.#movePlayhead(Math.min(row.endMs, this.lengthMs));
    return ok(this.#playheadSentence());
  }

  // ---- changing the edit ----

  /** A key held on a grip is a drag that ends by itself the moment any other command comes. */
  #settle(): void {
    if (this.#drag?.via === "keys") this.endDrag();
  }

  /**
   * Run an editing action. If it changed the edit, keep the choice and the playhead sound and tell the screens.
   * The edit model's own sentence is what the author hears.
   */
  #run(action: (model: Model) => Result): Outcome {
    this.#settle();
    if (this.#drag !== undefined) return no(DRAG_IN_PROGRESS);
    const before = this.#history.model;
    const index = this.rows.findIndex((r) => r.clipId === this.#primaryId);
    const result = this.#history.run(action);
    if (!result.ok) return no(result.message);
    if (this.#history.model === before) return ok(result.message);
    return ok(result.message + this.#afterChange(index));
  }

  /**
   * Run an action for each of several rows, as one undo step. `say` makes the sentence from how many worked.
   * Nothing is recorded if none of them changed anything.
   */
  #runEach(label: string, rows: readonly Row[], action: (model: Model, row: Row) => Result, say: (worked: number, failed: readonly string[]) => string): Outcome {
    this.#settle();
    if (this.#drag !== undefined) return no(DRAG_IN_PROGRESS);
    const before = this.#history.model;
    const index = this.rows.findIndex((r) => r.clipId === this.#primaryId);
    this.#history.beginGroup(label);
    let worked = 0;
    const failed: string[] = [];
    for (const row of rows) {
      const was = this.#history.model;
      const result = this.#history.run((m) => action(m, row));
      if (!result.ok) failed.push(result.message);
      else if (this.#history.model !== was) worked += 1;
    }
    this.#history.endGroup();
    if (this.#history.model === before) return no(failed[0] ?? "Nothing was changed.");
    return ok(say(worked, failed) + this.#afterChange(index));
  }

  /** After the edit changed: keep the choice on rows that exist and the playhead inside the edit. */
  #afterChange(previousIndex: number): string {
    const rows = this.rows;
    let extra = "";
    const here = new Set(rows.map((r) => r.clipId));
    for (const id of [...this.#chosen]) if (!here.has(id)) this.#chosen.delete(id);
    if (this.#primaryId === undefined || !here.has(this.#primaryId)) {
      // The focus goes to a chosen row that is left (the nearest to where it was), else to the row that took its place.
      const left = rows.map((r, i) => ({ r, i })).filter(({ r }) => this.#chosen.has(r.clipId));
      left.sort((a, b) => Math.abs(a.i - previousIndex) - Math.abs(b.i - previousIndex));
      const next = left[0]?.r ?? rows[Math.min(Math.max(previousIndex, 0), rows.length - 1)];
      this.#primaryId = next?.clipId;
      if (left.length === 0) this.#chosen = next === undefined ? new Set() : new Set([next.clipId]);
      this.#anchorId = this.#primaryId;
      extra += next === undefined ? " The list is now empty." : ` Selected ${quote(next.name)}.`;
    } else if (this.#chosen.size === 0) {
      this.#chosen.add(this.#primaryId);
    }
    if (this.#anchorId !== undefined && !here.has(this.#anchorId)) this.#anchorId = this.#primaryId;
    const length = this.lengthMs;
    if (this.#playheadMs > length) {
      this.#playheadMs = length;
      extra += ` The playhead moved back to the end, ${describeTime(length)}.`;
    }
    this.#emit("model");
    return extra;
  }

  /** The one chosen row a command that cannot act on several works on, or a sentence saying why not. */
  #one(): Row | Outcome {
    const rows = this.selectedRows;
    const only = rows[0];
    if (only === undefined) return no(NOTHING_SELECTED);
    if (rows.length > 1) {
      return no(`This works on one row at a time, and ${rows.length} rows are chosen. Press Escape to keep just the one you are on.`);
    }
    return only;
  }

  #isClip(row: Row): boolean {
    return findClip(this.#history.model, row.clipId) !== undefined;
  }

  #notAClip(row: Row, what: string): Outcome {
    return no(`${quote(row.name)} is ${/^[aeiou]/i.test(row.type) ? "an" : "a"} ${row.type.toLowerCase()}, not a clip. ${what}`);
  }

  /** Split the chosen clip at the playhead (or each chosen clip that the playhead is inside). */
  splitSelected(): Outcome {
    const rows = this.selectedRows;
    if (rows.length === 0) return no(NOTHING_SELECTED);
    const at = this.#playheadMs;
    if (rows.length > 1) {
      const hits = rows.filter((r) => this.#isClip(r) && r.startMs < at && at < r.endMs);
      if (hits.length === 0) return no(`None of the ${rows.length} chosen rows can be split at ${describeTime(at)}: the playhead is not inside any of the clips.`);
      return this.#runEach(
        "split clips",
        hits,
        (m, r) => splitAt(m, at, r.trackId),
        (worked) => `Split ${worked} ${worked === 1 ? "clip" : "clips"} at ${describeTime(at)}; each is now two clips.` + (hits.length < rows.length ? ` The other ${rows.length - hits.length} chosen rows were left alone.` : ""),
      );
    }
    const row = this.#one();
    if ("ok" in row) return row;
    if (!this.#isClip(row)) return this.#notAClip(row, "Only clips can be split.");
    if (!(row.startMs < at && at < row.endMs)) {
      return no(
        `Cannot split ${quote(row.name)} at ${describeTime(at)}: it runs from ${describeTime(row.startMs)} to ${describeTime(row.endMs)}, so the playhead has to be inside it.`,
      );
    }
    return this.#run((m) => splitAt(m, at, row.trackId));
  }

  /** Split every clip that the playhead is inside, on every track, so picture and sound are cut together. */
  splitEveryTrack(): Outcome {
    return this.#run((m) => splitAt(m, this.#playheadMs));
  }

  /** Move the start of the chosen row (or rows) to the playhead. */
  trimStartToPlayhead(): Outcome {
    const rows = this.selectedRows;
    if (rows.length === 0) return no(NOTHING_SELECTED);
    const at = this.#playheadMs;
    const act = (m: Model, r: Row) => (this.#isClip(r) ? trimStart(m, r.clipId, at) : trimItemStart(m, r.clipId, at));
    if (rows.length > 1) {
      return this.#runEach("trim start", rows, act, (worked, failed) => `Moved the start of ${worked} rows to ${describeTime(at)}.` + (failed.length > 0 ? ` ${failed.length} could not be moved. ${failed[0] ?? ""}` : ""));
    }
    const row = this.#one();
    if ("ok" in row) return row;
    return this.#run((m) => act(m, row));
  }

  /** Move the end of the chosen row (or rows) to the playhead. */
  trimEndToPlayhead(): Outcome {
    const rows = this.selectedRows;
    if (rows.length === 0) return no(NOTHING_SELECTED);
    const at = this.#playheadMs;
    const act = (m: Model, r: Row) => (this.#isClip(r) ? trimEnd(m, r.clipId, at) : trimItemEnd(m, r.clipId, at));
    if (rows.length > 1) {
      return this.#runEach("trim end", rows, act, (worked, failed) => `Moved the end of ${worked} rows to ${describeTime(at)}.` + (failed.length > 0 ? ` ${failed.length} could not be moved. ${failed[0] ?? ""}` : ""));
    }
    const row = this.#one();
    if ("ok" in row) return row;
    return this.#run((m) => act(m, row));
  }

  /** Delete the chosen row (or rows). For a clip the author chooses: leave a gap, or move the later clips earlier to close it. */
  deleteSelected(closeGap: boolean): Outcome {
    const rows = this.selectedRows;
    if (rows.length === 0) return no(NOTHING_SELECTED);
    const act = (m: Model, r: Row) => (this.#isClip(r) ? deleteClip(m, r.clipId, closeGap) : deleteItem(m, r.clipId));
    if (rows.length > 1) {
      const anyClip = rows.some((r) => this.#isClip(r)); // asked before they are gone
      return this.#runEach(
        "delete rows",
        rows,
        act,
        (worked) => `Deleted ${worked} rows` + (anyClip ? (closeGap ? ", closing the gaps." : ", leaving the gaps.") : "."),
      );
    }
    const row = this.#one();
    if ("ok" in row) return row;
    return this.#run((m) => act(m, row));
  }

  /** Join the chosen clip with the one after it. */
  joinSelectedWithNext(): Outcome {
    const row = this.#one();
    if ("ok" in row) return row;
    if (!this.#isClip(row)) return this.#notAClip(row, "Only clips can be joined.");
    return this.#run((m) => joinWithNext(m, row.clipId));
  }

  /** Copy the chosen rows (clips, overlays, zooms). Nothing in the edit changes. */
  copySelected(): Outcome {
    this.#settle();
    const ids = this.selectedRows.map((r) => r.clipId);
    if (ids.length === 0) return no(NOTHING_SELECTED);
    const copied = copyRows(this.#history.model, ids);
    if (copied.length === 0) return no("Nothing that can be copied is chosen.");
    this.#clipboard = copied;
    this.#emit("clipboard");
    return ok(`${describeCopied(copied)} Move the playhead and paste to put ${copied.length === 1 ? "it" : "them"} there.`);
  }

  /** Is there anything copied to paste? */
  get canPaste(): boolean {
    return this.#clipboard.length > 0;
  }

  /**
   * Paste what was copied so that it begins at the playhead. The pasted rows become the choice, and the playhead moves to
   * where they end, so pasting again lays another copy right after.
   */
  paste(): Outcome {
    this.#settle();
    if (this.#drag !== undefined) return no(DRAG_IN_PROGRESS);
    if (this.#clipboard.length === 0) return no("Nothing has been copied yet. Choose a clip, copy it, then paste.");
    const at = this.#playheadMs;
    const before = this.#history.model;
    const index = this.rows.findIndex((r) => r.clipId === this.#primaryId);
    const copied = this.#clipboard;
    const result = this.#history.run((m) => pasteCopied(m, copied, at));
    if (!result.ok) return no(result.message);
    if (this.#history.model === before) return ok(result.message);
    const ids = result.focus ?? [];
    const first = ids[0];
    if (first !== undefined) {
      // The choice moves to the pasted rows before the screens redraw, so focus goes to them and not to the old row.
      this.#chosen = new Set(ids);
      this.#primaryId = first;
      this.#anchorId = first;
    }
    const extra = this.#afterChange(index);
    const end = pastedEndMs(copied, at);
    this.#movePlayhead(Math.min(end, this.lengthMs));
    return ok(`${result.message} The playhead is now at ${describeTime(this.#playheadMs)}, where the pasted ${ids.length === 1 ? "row ends" : "rows end"}.${extra}`);
  }

  // ---- callouts, zooms and the look of an overlay ----

  /** The overlay or zoom the form shows (the primary row), or undefined when a clip or nothing is chosen. */
  get item(): Item | undefined {
    const id = this.#primaryId;
    return id === undefined ? undefined : findItem(this.#history.model, id)?.item;
  }

  /** Add a row made by `make`, and choose it, so the screens move focus to it. */
  #addRow(make: (model: Model) => Result): Outcome {
    this.#settle();
    if (this.#drag !== undefined) return no(DRAG_IN_PROGRESS);
    const before = this.#history.model;
    const index = this.rows.findIndex((r) => r.clipId === this.#primaryId);
    const result = this.#history.run(make);
    if (!result.ok) return no(result.message);
    if (this.#history.model === before) return ok(result.message);
    const first = result.focus?.find((id) => findItem(this.#history.model, id) !== undefined || findClip(this.#history.model, id) !== undefined);
    if (first !== undefined) {
      this.#chosen = new Set([first]);
      this.#primaryId = first;
      this.#anchorId = first;
    }
    return ok(result.message + this.#afterChange(index));
  }

  /** Put a ready-made callout in at the playhead and choose it. */
  addCalloutHere(kind: CalloutKind): Outcome {
    const at = this.#playheadMs;
    return this.#addRow((m) => addCallout(m, kind, at));
  }

  /** Put a picture, video or sound from the course's files in at the playhead, and choose it. */
  addMediaFile(file: ImportedFile): Outcome {
    const at = this.#playheadMs;
    return this.#addRow((m) => addImportedFile(m, file, at));
  }

  /** The chosen image clip, or a sentence saying why not. */
  #oneImage(): { clipId: string } | Outcome {
    const row = this.#one();
    if ("ok" in row) return row;
    const found = findClip(this.#history.model, row.clipId);
    if (found === undefined) return this.#notAClip(row, "Only an image has alt text.");
    if (findSource(this.#history.model, found.clip.source)?.kind !== "image") return no(`${quote(row.name)} is not an image, so it has no alt text.`);
    return { clipId: row.clipId };
  }

  /** What the chosen image shows, in words. */
  setImageAlt(text: string): Outcome {
    const c = this.#oneImage();
    if ("ok" in c) return c;
    return this.#run((m) => setImageText(m, c.clipId, { altText: text }));
  }

  /** Mark the chosen image as decorative, or not. */
  setImageDecorative(decorative: boolean): Outcome {
    const c = this.#oneImage();
    if ("ok" in c) return c;
    return this.#run((m) => setImageText(m, c.clipId, { decorative }));
  }

  /** Say whether the imported video or sound the chosen clip uses has captions, a script or a transcript. */
  setMediaHasText(has: boolean): Outcome {
    const row = this.#one();
    if ("ok" in row) return row;
    const found = findClip(this.#history.model, row.clipId);
    if (found === undefined) return this.#notAClip(row, "Only an imported video or sound has captions or a transcript.");
    return this.#run((m) => setHasTextAlternative(m, found.clip.source, has));
  }

  /** Put a zoom in at the playhead, showing a rectangle of the picture, and choose it. */
  addZoomHere(rect: Rect): Outcome {
    const at = this.#playheadMs;
    return this.#addRow((m) => addZoomRegion(m, rect, at));
  }

  /** The chosen overlay or zoom, or a sentence saying that it is not one. */
  #oneItem(): Item | Outcome {
    const row = this.#one();
    if ("ok" in row) return row;
    const item = findItem(this.#history.model, row.clipId)?.item;
    if (item === undefined) return this.#notAnItem(row);
    return item;
  }

  #notAnItem(row: Row): Outcome {
    return no(`${quote(row.name)} is a clip, not an overlay or zoom. This is for the things drawn on the picture.`);
  }

  /** Move or resize the chosen overlay or zoom: where on the picture it shows. */
  setItemPlace(rect: Rect): Outcome {
    const item = this.#oneItem();
    if ("ok" in item) return item;
    return this.#run((m) => setItemRect(m, item.id, rect));
  }

  /** Change the ends of the chosen arrow. */
  setArrowPlace(from: Point, to: Point): Outcome {
    const item = this.#oneItem();
    if ("ok" in item) return item;
    return this.#run((m) => setArrowEnds(m, item.id, from, to));
  }

  /** Change the words of the chosen text overlay. */
  setItemWords(text: string): Outcome {
    const item = this.#oneItem();
    if ("ok" in item) return item;
    return this.#run((m) => setText(m, item.id, text));
  }

  /** Change the look of the chosen text overlay. */
  setItemTextLook(style: TextStyle): Outcome {
    const item = this.#oneItem();
    if ("ok" in item) return item;
    return this.#run((m) => setTextStyle(m, item.id, style));
  }

  /** Change the look of the chosen shape. */
  setItemShapeLook(style: ShapeStyle): Outcome {
    const item = this.#oneItem();
    if ("ok" in item) return item;
    return this.#run((m) => setShapeStyle(m, item.id, style));
  }

  /** Change the look of the chosen arrow. */
  setItemArrowLook(style: ArrowStyle): Outcome {
    const item = this.#oneItem();
    if ("ok" in item) return item;
    return this.#run((m) => setArrowStyle(m, item.id, style));
  }

  /** Change the colour of the chosen cover. */
  setItemCoverColor(color: string): Outcome {
    const item = this.#oneItem();
    if ("ok" in item) return item;
    return this.#run((m) => setCoverColor(m, item.id, color));
  }

  /** Change the description or the move time of the chosen zoom. */
  setItemZoom(settings: ZoomSettings): Outcome {
    const item = this.#oneItem();
    if ("ok" in item) return item;
    return this.#run((m) => setZoom(m, item.id, settings));
  }

  /** Say what the chosen shape or arrow points out, or that it is only decoration. */
  setItemAlt(text: { altText?: string; decorative?: boolean }): Outcome {
    const item = this.#oneItem();
    if ("ok" in item) return item;
    return this.#run((m) => setItemAltText(m, item.id, text));
  }

  /** Move the chosen clip one place earlier or later in the order of its track. */
  moveSelected(direction: "earlier" | "later"): Outcome {
    const row = this.#one();
    if ("ok" in row) return row;
    if (!this.#isClip(row)) return this.#notAClip(row, "Overlays and zooms are placed by their start time, so they have no order to change.");
    const found = findClip(this.#history.model, row.clipId);
    if (found === undefined) return no(`There is no clip with the id ${row.clipId}.`);
    const to = found.clipIndex + (direction === "earlier" ? -1 : 1);
    if (to < 0) return no(`${quote(row.name)} is already the first clip on the ${row.trackName} track.`);
    if (to >= found.track.clips.length) return no(`${quote(row.name)} is already the last clip on the ${row.trackName} track.`);
    return this.#run((m) => reorderClip(m, row.clipId, to));
  }

  /** Mute or unmute the chosen clip (or clips). */
  setSelectedMuted(muted: boolean): Outcome {
    const rows = this.selectedRows;
    if (rows.length === 0) return no(NOTHING_SELECTED);
    if (rows.length > 1) {
      const clips = rows.filter((r) => this.#isClip(r));
      if (clips.length === 0) return no("None of the chosen rows is a clip, and only clips can be muted.");
      return this.#runEach(
        muted ? "mute clips" : "unmute clips",
        clips,
        (m, r) => setMuted(m, r.clipId, muted),
        (worked) => `${muted ? "Muted" : "Unmuted"} ${worked} ${worked === 1 ? "clip" : "clips"}.` + (clips.length < rows.length ? ` The other ${rows.length - clips.length} chosen rows are not clips.` : ""),
      );
    }
    const row = this.#one();
    if ("ok" in row) return row;
    if (!this.#isClip(row)) return this.#notAClip(row, "Only clips can be muted.");
    return this.#run((m) => setMuted(m, row.clipId, muted));
  }

  /** Mute the chosen clip if its sound is on, unmute it if it is muted. With several chosen, unmute if all are muted, else mute. */
  toggleMute(): Outcome {
    const clips = this.selectedRows.filter((r) => this.#isClip(r));
    if (this.selectedRows.length === 0) return no(NOTHING_SELECTED);
    const allMuted = clips.length > 0 && clips.every((r) => findClip(this.#history.model, r.clipId)?.clip.muted === true);
    return this.setSelectedMuted(!allMuted);
  }

  /** Move the chosen row to another track that takes it (the Track box in the form, or a drag to another track). */
  moveSelectedToTrack(trackId: string): Outcome {
    const row = this.#one();
    if ("ok" in row) return row;
    return this.#run((m) => (this.#isClip(row) ? moveClipToTrack(m, row.clipId, trackId) : moveItemToTrack(m, row.clipId, trackId)));
  }

  /** Add an empty track of a kind (so clips, overlays or zooms can be moved onto it). */
  addTrack(kind: TrackKind): Outcome {
    return this.#run((m) => addTrack(m, kind));
  }

  /** Give a track a new name. */
  renameTrack(trackId: string, text: string): Outcome {
    return this.#run((m) => renameTrack(m, trackId, text));
  }

  /**
   * Delete a track. One with something on it is refused (and the sentence says what is on it) unless `withContents` says the author
   * wants it gone together with that; the choice moves to a row that is left.
   */
  deleteTrack(trackId: string, withContents: boolean): Outcome {
    return this.#run((m) => deleteTrack(m, trackId, withContents));
  }

  // ---- a stretch of time to remove ----

  /** The marks of the stretch to remove, as set so far: either may be missing. */
  get stretch(): { readonly fromMs: number | undefined; readonly toMs: number | undefined } {
    return { fromMs: this.#stretchFrom, toMs: this.#stretchTo };
  }

  /** Whether both ends are marked, so the stretch can be removed. */
  get stretchReady(): boolean {
    return this.#stretchFrom !== undefined && this.#stretchTo !== undefined && this.#stretchTo > this.#stretchFrom;
  }

  #stretchSentence(): string {
    const from = this.#stretchFrom;
    const to = this.#stretchTo;
    if (from !== undefined && to !== undefined) {
      return ` The stretch to remove runs from ${describeTime(from)} to ${describeTime(to)}, ${describeLength(to - from)}. X removes it and leaves a gap; Shift+X removes it and closes the gap; Alt+X clears the marks.`;
    }
    return from !== undefined ? " Now move the playhead to where the stretch ends and press O." : to !== undefined ? " Now move the playhead to where the stretch starts and press I." : "";
  }

  /** Mark the start of the stretch at the playhead. */
  markStretchStart(): Outcome {
    this.#settle();
    if (this.#drag !== undefined) return no(DRAG_IN_PROGRESS);
    const at = this.#playheadMs;
    let said = `The start of the stretch is marked at ${describeTime(at)}.`;
    this.#stretchFrom = at;
    if (this.#stretchTo !== undefined && this.#stretchTo <= at) {
      this.#stretchTo = undefined;
      said += " The end mark was not after it, so it was cleared.";
    }
    this.#emit("tools");
    return ok(said + this.#stretchSentence());
  }

  /** Mark the end of the stretch at the playhead. */
  markStretchEnd(): Outcome {
    this.#settle();
    if (this.#drag !== undefined) return no(DRAG_IN_PROGRESS);
    const at = this.#playheadMs;
    if (this.#stretchFrom !== undefined && at <= this.#stretchFrom) {
      return no(`The end of the stretch has to be after its start, ${describeTime(this.#stretchFrom)}. Move the playhead later and press O again.`);
    }
    this.#stretchTo = at;
    this.#emit("tools");
    return ok(`The end of the stretch is marked at ${describeTime(at)}.` + this.#stretchSentence());
  }

  /** Forget the marks. */
  clearStretch(): Outcome {
    this.#settle();
    if (this.#drag !== undefined) return no(DRAG_IN_PROGRESS);
    if (this.#stretchFrom === undefined && this.#stretchTo === undefined) return ok("No stretch is marked.");
    this.#stretchFrom = undefined;
    this.#stretchTo = undefined;
    this.#emit("tools");
    return ok("The marks were cleared. Nothing in the edit was changed.");
  }

  /**
   * Take the marked stretch out of every track, picture and sound together. The author chooses whether the gap is left or closed
   * (the edit model gives no default). It is one undo step; the marks are cleared and the playhead goes to the cut.
   */
  removeStretch(closeGap: boolean): Outcome {
    this.#settle();
    if (this.#drag !== undefined) return no(DRAG_IN_PROGRESS);
    const from = this.#stretchFrom;
    const to = this.#stretchTo;
    if (from === undefined || to === undefined) {
      return no(
        from === undefined && to === undefined
          ? "No stretch is marked. Move the playhead to where it starts and press I, then to where it ends and press O."
          : from === undefined
            ? "The start of the stretch is not marked. Move the playhead to where it starts and press I."
            : "The end of the stretch is not marked. Move the playhead to where it ends and press O.",
      );
    }
    const outcome = this.#run((m) => deleteRange(m, from, to, closeGap));
    if (!outcome.ok) return outcome;
    this.#stretchFrom = undefined;
    this.#stretchTo = undefined;
    this.#movePlayhead(Math.min(from, this.lengthMs));
    this.#emit("tools");
    return ok(`${outcome.message} The marks were cleared and the playhead is at the cut, ${describeTime(this.#playheadMs)}.`);
  }

  // ---- the form: exact values ----

  /** Give the chosen row a new name. */
  rename(text: string): Outcome {
    const row = this.#one();
    if ("ok" in row) return row;
    return this.#run((m) => (this.#isClip(row) ? renameClip(m, row.clipId, text) : renameItem(m, row.clipId, text)));
  }

  /** Set where the chosen row starts, from what the author typed. A clip moves whole; its length stays. */
  setStartText(text: string): Outcome {
    const row = this.#one();
    if ("ok" in row) return row;
    const parsed = parseTime(text);
    if (!parsed.ok) return no(parsed.message);
    return this.#run((m) => (this.#isClip(row) ? setClipStart(m, row.clipId, parsed.ms) : moveItem(m, row.clipId, parsed.ms)));
  }

  /** Set how long the chosen row lasts, from what the author typed. The start stays; the end moves. */
  setLengthText(text: string): Outcome {
    const row = this.#one();
    if ("ok" in row) return row;
    const parsed = parseTime(text);
    if (!parsed.ok) return no(parsed.message);
    return this.#run((m) =>
      this.#isClip(row) ? setClipLength(m, row.clipId, parsed.ms) : trimItemEnd(m, row.clipId, row.startMs + parsed.ms),
    );
  }

  /** Set where the chosen row ends, from what the author typed. The start stays; the length changes. */
  setEndText(text: string): Outcome {
    const row = this.#one();
    if ("ok" in row) return row;
    const parsed = parseTime(text);
    if (!parsed.ok) return no(parsed.message);
    return this.#run((m) => (this.#isClip(row) ? trimEnd(m, row.clipId, parsed.ms) : trimItemEnd(m, row.clipId, parsed.ms)));
  }

  /** Set a clip's volume from what the author typed, in whole decibels from -40 to 20. */
  setVolumeText(text: string): Outcome {
    const row = this.#one();
    if ("ok" in row) return row;
    if (!this.#isClip(row)) return this.#notAClip(row, "Only clips have a volume.");
    const parsed = parseDecibels(text);
    if (!parsed.ok) return no(parsed.message);
    return this.#run((m) => setVolume(m, row.clipId, parsed.db));
  }

  /** Set how long a clip's sound fades in, from what the author typed. */
  setFadeInText(text: string): Outcome {
    return this.#setFade("in", text);
  }

  /** Set how long a clip's sound fades out, from what the author typed. */
  setFadeOutText(text: string): Outcome {
    return this.#setFade("out", text);
  }

  #setFade(which: "in" | "out", text: string): Outcome {
    const row = this.#one();
    if ("ok" in row) return row;
    const found = findClip(this.#history.model, row.clipId);
    if (found === undefined) return this.#notAClip(row, "Only clips have fades.");
    const parsed = parseTime(text);
    if (!parsed.ok) return no(parsed.message);
    const { fadeInMs, fadeOutMs } = found.clip;
    return this.#run((m) => setFades(m, row.clipId, which === "in" ? parsed.ms : fadeInMs, which === "out" ? parsed.ms : fadeOutMs));
  }

  // ---- transitions ----

  /** The chosen clip, for a transition command, or a sentence saying why not. */
  #transitionClip(): { clipId: string; clip: Clip } | Outcome {
    const row = this.#one();
    if ("ok" in row) return row;
    const found = findClip(this.#history.model, row.clipId);
    if (found === undefined) return this.#notAClip(row, "Only clips have transitions.");
    return { clipId: row.clipId, clip: found.clip };
  }

  /** The button on a cut: give the chosen clip a transition where it arrives (a cross-fade if a picture comes before it, otherwise a fade). */
  addTransitionHere(): Outcome {
    const c = this.#transitionClip();
    if ("ok" in c) return c;
    if (c.clip.transitionIn !== undefined) {
      return no(`${quote(c.clip.name)} already arrives with a ${TRANSITION_NAMES[c.clip.transitionIn.kind].toLowerCase()}. Change or remove it with the Arrives with box in the form.`);
    }
    const kind: TransitionKind = hasNeighbour(this.#history.model, c.clipId) ? "cross-fade" : "fade";
    return this.#run((m) => setTransition(m, c.clipId, "in", kind));
  }

  /** Choose how the chosen clip arrives or leaves: a transition's name, or "none" to take it away. */
  setTransitionKind(which: "in" | "out", value: string): Outcome {
    const c = this.#transitionClip();
    if ("ok" in c) return c;
    if (value === "none") return this.#run((m) => setTransition(m, c.clipId, which, null));
    const kind = TRANSITION_KINDS.find((k) => k === value);
    if (kind === undefined) return no("That is not one of the transitions.");
    const had = which === "in" ? c.clip.transitionIn : c.clip.transitionOut;
    return this.#run((m) => setTransition(m, c.clipId, which, kind, had?.durationMs ?? DEFAULT_TRANSITION_MS));
  }

  /** Set how long a transition lasts, from what the author typed (seconds, like the fades). */
  setTransitionLengthText(which: "in" | "out", text: string): Outcome {
    const c = this.#transitionClip();
    if ("ok" in c) return c;
    const had = which === "in" ? c.clip.transitionIn : c.clip.transitionOut;
    if (had === undefined) return no(`Choose a transition for when ${quote(c.clip.name)} ${which === "in" ? "arrives" : "leaves"} first, then set how long it lasts.`);
    const parsed = parseTime(text);
    if (!parsed.ok) return no(parsed.message);
    return this.#run((m) => setTransition(m, c.clipId, which, had.kind, parsed.ms));
  }

  // ---- drags ----

  /** True while a drag is open (a mouse drag, or a key held on a grip). */
  get dragging(): boolean {
    return this.#drag !== undefined;
  }

  /** The drag in progress, for the screen that shows it. */
  get drag(): DragState | undefined {
    const d = this.#drag;
    return d === undefined ? undefined : { id: d.id, kind: d.kind, via: d.via, range: d.range, value: d.value, ids: d.ids, snappedTo: d.snappedTo };
  }

  /**
   * Start a drag of a whole clip, overlay or zoom (`move`) or of one of its grips (`start`, `end`). Everything done
   * until `endDrag` is one undo step; `cancelDrag` puts it all back. The grips stop at the limits the edit allows.
   * A `move` of one of several chosen rows moves all of them together, by the same amount, and stops where the first of them would be refused.
   */
  beginDrag(kind: DragKind, id: string, via: "pointer" | "keys" = "pointer"): Outcome {
    this.#settle();
    if (this.#drag !== undefined) return no(DRAG_IN_PROGRESS);
    const row = this.rows.find((r) => r.clipId === id);
    const model = this.#history.model;
    const limits = limitsOf(model, id);
    if (row === undefined || limits === undefined) return no(`There is no row with the id ${id}.`);
    const together = kind === "move" && this.#chosen.size > 1 && this.#chosen.has(id);
    const ids = together ? this.selectedRows.map((r) => r.clipId) : [id];
    let range: Range = kind === "move" ? limits.move : kind === "start" ? limits.trimStart : limits.trimEnd;
    let edges: number[] = kind === "move" ? [0, row.endMs - row.startMs] : [0];
    if (together) {
      const shift = groupMoveLimits(model, ids);
      if (shift === undefined) return no(`There is no row with the id ${id}.`);
      range = { min: row.startMs + shift.min, max: row.startMs + shift.max };
      edges = this.selectedRows.flatMap((r) => [r.startMs - row.startMs, r.endMs - row.startMs]);
    }
    const label = together
      ? "move together"
      : limits.kind === "clip"
        ? kind === "move"
          ? "move clip"
          : kind === "start"
            ? "trim clip start"
            : "trim clip end"
        : kind === "move"
          ? "move"
          : kind === "start"
            ? "trim start"
            : "trim end";
    const started = this.#history.beginGroup(label);
    if (!started.ok) return no(started.message);
    const origin = kind === "end" ? row.endMs : row.startMs;
    this.#drag = { id, kind, via, range, value: origin, before: model, label, lastMessage: "", ids, group: together, origin, edges, snappedTo: undefined };
    return ok("");
  }

  /** Whether dragging with the mouse jumps to times that matter. */
  get snapping(): boolean {
    return this.#snapping;
  }

  /** Turn snapping on or off, and say what it does. */
  toggleSnapping(): Outcome {
    this.#snapping = !this.#snapping;
    this.#emit("tools");
    return ok(
      this.#snapping
        ? "Snapping is on. Dragging a clip, an overlay or a grip with the mouse jumps to the playhead, to the start or end of other clips and to the ends of the edit when it comes close. The keys are not affected."
        : "Snapping is off. A drag with the mouse goes exactly where the pointer is.",
    );
  }

  /**
   * Take the dragged thing to a time, kept inside what the edit allows. Returns where it ended up. With `snapWithinMs` (how many
   * milliseconds a few pixels come to at the zoom the screen has) and snapping on, a mouse drag jumps to a time that matters when an edge comes that close.
   */
  dragTo(ms: number, options: { readonly snapWithinMs?: number } = {}): number | undefined {
    const drag = this.#drag;
    if (drag === undefined) return undefined;
    let wanted = Math.round(ms);
    let snapped: number | undefined;
    if (this.#snapping && drag.via === "pointer" && (options.snapWithinMs ?? 0) > 0) {
      const found = snapTo({
        ms: wanted,
        edges: drag.edges,
        targets: snapTargets(this.rows, new Set(drag.ids), [this.#playheadMs, 0, this.lengthMs, this.#stretchFrom, this.#stretchTo]),
        withinMs: options.snapWithinMs ?? 0,
      });
      wanted = found.ms;
      snapped = found.target;
    }
    const to = Math.min(Math.max(wanted, drag.range.min), drag.range.max);
    // Pushed back by a limit, it is not at the time it snapped to.
    const guide = to === wanted ? snapped : undefined;
    const act = (m: Model): Result => {
      if (drag.group) return moveRowsBy(m, drag.ids, to - drag.value);
      const clip = findClip(m, drag.id) !== undefined;
      switch (drag.kind) {
        case "move":
          return clip ? setClipStart(m, drag.id, to) : moveItem(m, drag.id, to);
        case "start":
          return clip ? trimStart(m, drag.id, to) : trimItemStart(m, drag.id, to);
        case "end":
          return clip ? trimEnd(m, drag.id, to) : trimItemEnd(m, drag.id, to);
      }
    };
    const before = this.#history.model;
    const guideChanged = guide !== drag.snappedTo;
    drag.snappedTo = guide;
    const result = this.#history.run(act);
    if (!result.ok) {
      drag.lastMessage = result.message;
      if (guideChanged) this.#emit("drag");
      return drag.value;
    }
    drag.value = to;
    drag.lastMessage = result.message;
    if (this.#history.model !== before || guideChanged) this.#emit("drag");
    return to;
  }

  /** Step the dragged thing with the keys of the Timeline (a key held on a grip). Says why when it cannot go further. */
  dragStep(key: StepKey, shift = false): Outcome {
    const drag = this.#drag;
    if (drag === undefined) return no("No drag is in progress.");
    const to = stepTime(key, drag.value, drag.range.min, drag.range.max, { shift });
    if (to === drag.value) {
      const early = key === "Left" || key === "PageDown" || key === "Home";
      const edge = early ? drag.range.min : drag.range.max;
      const verb = drag.kind === "end" ? "end" : "start";
      return ok(`It cannot ${verb} any ${early ? "earlier" : "later"}: the ${early ? "earliest" : "latest"} it can ${verb} is ${describeTime(edge)}.`);
    }
    this.dragTo(to);
    return ok("");
  }

  /**
   * Finish the drag. It is one undo step, and the sentence says what the whole drag came to. `dropTrackId` is the track
   * the thing was dropped on, if it is not the one it came from: it is moved there too, in the same step, when that track
   * takes it; if not, the reason is said and it stays where it was.
   */
  endDrag(options: { readonly dropTrackId?: string } = {}): Outcome {
    const drag = this.#drag;
    if (drag === undefined) return no("No drag is in progress.");
    const index = this.rows.findIndex((r) => r.clipId === this.#primaryId);
    const beforeDrop = this.#history.model;
    const sentences: string[] = [];
    if (drag.group) {
      // Many small shifts: the sentence is for the whole of it, from where it began to where it ended.
      const whole = moveRowsBy(drag.before, drag.ids, drag.value - drag.origin);
      if (whole.ok && beforeDrop !== drag.before) sentences.push(whole.message);
    } else {
      const sideways = describeChange(drag.before, beforeDrop);
      if (sideways !== undefined) sentences.push(sideways);
      else if (beforeDrop !== drag.before && drag.lastMessage !== "") sentences.push(drag.lastMessage);
    }
    let failed = false;
    const here = this.rows.find((r) => r.clipId === drag.id);
    if (!drag.group && options.dropTrackId !== undefined && here !== undefined && options.dropTrackId !== here.trackId) {
      const result = this.#history.run((m) =>
        findClip(m, drag.id) !== undefined ? moveClipToTrack(m, drag.id, options.dropTrackId ?? "") : moveItemToTrack(m, drag.id, options.dropTrackId ?? ""),
      );
      sentences.push(result.message);
      failed = !result.ok;
    }
    this.#history.endGroup();
    this.#drag = undefined;
    const changed = this.#history.model !== drag.before;
    if (!changed && !failed) sentences.push("Nothing was changed.");
    let extra = "";
    if (changed) extra = this.#afterChange(index);
    else this.#emit("model");
    return { ok: !failed || changed, message: sentences.filter((x) => x !== "").join(" ") + extra };
  }

  /** Put everything back as it was when the drag began, and record nothing (Escape during a drag). */
  cancelDrag(): Outcome {
    if (this.#drag === undefined) return no("No drag is in progress.");
    const result = this.#history.cancelGroup();
    this.#drag = undefined;
    this.#emit("model");
    return ok(result.message);
  }

  // ---- playing ----

  /** Whether the edit is playing (the playhead is moving by itself). */
  get playing(): boolean {
    return this.#playing;
  }

  /** Say what plays the edit, or that nothing does. */
  setTransport(transport: Transport | undefined): void {
    this.#transport = transport;
  }

  /** The player says it has started or stopped. */
  setPlaying(playing: boolean): void {
    if (playing === this.#playing) return;
    this.#playing = playing;
    this.#emit("transport");
  }

  /** Play from the playhead, or pause. */
  togglePlay(): Outcome {
    return this.#transport?.toggle() ?? no("There is nothing here to play the edit with.");
  }

  // ---- history ----

  undo(): Outcome {
    this.#settle();
    const before = this.#history.model;
    const index = this.rows.findIndex((r) => r.clipId === this.#primaryId);
    const result = this.#history.undo();
    if (!result.ok) return no(result.message);
    return ok(result.message + (this.#history.model === before ? "" : this.#afterChange(index)));
  }

  redo(): Outcome {
    this.#settle();
    const before = this.#history.model;
    const index = this.rows.findIndex((r) => r.clipId === this.#primaryId);
    const result = this.#history.redo();
    if (!result.ok) return no(result.message);
    return ok(result.message + (this.#history.model === before ? "" : this.#afterChange(index)));
  }
}
