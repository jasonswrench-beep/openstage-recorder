// SPDX-License-Identifier: Apache-2.0
/**
 * Working directly on the picture: drag a rectangle to make a zoom, and move or resize the chosen overlay or zoom by
 * dragging its frame. Every one of these has a keyboard way as well, so nothing needs a mouse:
 *
 *  - The frame takes focus (Tab). Arrow keys move it 1 percent of the picture, with Shift 5 percent. Alt with the arrow
 *    keys makes it larger or smaller (Left and Up smaller, Right and Down larger) by the same steps.
 *  - Ctrl+Z and Ctrl+Y (or Ctrl+Shift+Z) undo and redo from the frame, as everywhere else.
 *  - The form in the Properties panel has the place written out in percentages (see `item-form.ts`).
 *  - "Zoom on a part" in the callout bar adds a zoom of the middle of the picture, to be placed with the form or the frame.
 *
 * A drag is one change: the frame follows the pointer while it is held, and the edit changes once, when the pointer is let
 * go, so one drag is one undo step. Escape during a drag puts everything back. A zoom keeps the picture's shape, so the
 * rectangle drawn for a zoom, and the frame of a zoom, are always the picture's shape.
 *
 * The frame sits in a layer beside the picture, not inside it: the picture is a single image for a screen reader and has no
 * parts of its own.
 */

import { FULL, keepShape, type Item, type Rect } from "../../capture-edit/src/index.ts";
import type { Announcer } from "./announcer.ts";
import { h } from "./dom.ts";
import type { EditSession } from "./session.ts";

export interface PictureEditing {
  /** Start (or stop) drawing a zoom with the pointer. Says what to do. */
  toggleDrawZoom(): { ok: boolean; message: string; drawing: boolean };
  readonly drawing: boolean;
  /** The zoom showing at the playhead, so the frame is put where the item is seen. */
  setZoom(rect: Rect): void;
  /** Redraw the frame for the chosen item. */
  update(): void;
  /** Called when drawing starts or stops. */
  onDrawingChange(listener: (drawing: boolean) => void): void;
  destroy(): void;
}

export interface PictureEditingOptions {
  readonly figure: HTMLElement;
  readonly stage: HTMLElement;
  readonly session: EditSession;
  readonly announcer: Announcer;
  /** Where focus goes on Escape from the frame. */
  readonly leave: () => void;
  /** Something was added by drawing (a zoom), so the form can be shown. */
  readonly onAdded: () => void;
}

const SMALLEST = 200; // two percent of the picture
const STEP = 100;
const BIG_STEP = 500;

function rectOf(item: Item | undefined): Rect | undefined {
  return item !== undefined && "rect" in item ? item.rect : undefined;
}

function clampRect(r: Rect, keepSquare: boolean): Rect {
  let width = Math.min(FULL, Math.max(SMALLEST, Math.round(r.width)));
  let height = Math.min(FULL, Math.max(SMALLEST, Math.round(r.height)));
  if (keepSquare) {
    width = Math.max(width, height);
    height = width;
  }
  const x = Math.min(Math.max(0, Math.round(r.x)), FULL - width);
  const y = Math.min(Math.max(0, Math.round(r.y)), FULL - height);
  return { x, y, width, height };
}

export function attachPictureEditing(options: PictureEditingOptions): PictureEditing {
  const { figure, stage, session, announcer } = options;
  const layer = h("div", { class: "os-pv-draw" });
  const handle = h("span", { class: "os-pv-handle", "aria-hidden": "true" });
  const frame = h("div", { class: "os-pv-frame", tabindex: 0, role: "group" }, handle);
  const band = h("div", { class: "os-pv-band", "aria-hidden": "true" });
  frame.hidden = true;
  band.hidden = true;
  layer.append(frame, band);
  figure.append(layer);

  let zoom: Rect = { x: 0, y: 0, width: FULL, height: FULL };
  let drawing = false;
  let listener: ((drawing: boolean) => void) | undefined;
  let shown = "";
  /** The place the frame has during a drag, before it is entered in the edit. */
  let live: Rect | undefined;

  /** How the picture is scaled and shifted by the zoom now, for items that move with it. */
  function view(item: Item | undefined): { s: number; cx: number; cy: number } {
    if (item === undefined || item.kind === "text") return { s: 1, cx: FULL / 2, cy: FULL / 2 };
    const s = Math.min(FULL / zoom.width, FULL / zoom.height);
    return { s, cx: zoom.x + zoom.width / 2, cy: zoom.y + zoom.height / 2 };
  }

  function fit(): void {
    layer.style.left = `${stage.offsetLeft}px`;
    layer.style.top = `${stage.offsetTop}px`;
    layer.style.width = `${stage.offsetWidth}px`;
    layer.style.height = `${stage.offsetHeight}px`;
  }

  function put(el: HTMLElement, rect: Rect, item: Item | undefined): void {
    const { s, cx, cy } = view(item);
    const left = 50 + (s * (rect.x - cx) * 100) / FULL;
    const top = 50 + (s * (rect.y - cy) * 100) / FULL;
    el.style.left = `${left}%`;
    el.style.top = `${top}%`;
    el.style.width = `${(s * rect.width * 100) / FULL}%`;
    el.style.height = `${(s * rect.height * 100) / FULL}%`;
  }

  function update(): void {
    fit();
    const item = session.singleChoice && session.selectionCount === 1 ? session.item : undefined;
    const rect = live ?? rectOf(item);
    if (item === undefined || rect === undefined) {
      frame.hidden = true;
      shown = "";
      return;
    }
    const label = `Frame of the ${item.kind === "zoom" ? "zoom" : item.kind} "${item.name}". Arrow keys move it, Alt with the arrow keys resizes it, Shift makes the steps larger.`;
    const signature = `${item.id}|${JSON.stringify(rect)}|${zoom.x},${zoom.y},${zoom.width},${zoom.height}|${stage.offsetWidth}`;
    if (signature === shown) return;
    shown = signature;
    frame.hidden = false;
    frame.setAttribute("aria-label", label);
    frame.classList.toggle("os-pv-frame-zoom", item.kind === "zoom");
    put(frame, rect, item);
  }

  const resize = new ResizeObserver(() => {
    shown = "";
    update();
  });
  resize.observe(stage);

  // ---- moving and resizing with the pointer ----

  let drag: { mode: "move" | "size"; startX: number; startY: number; rect: Rect; item: Item } | undefined;

  frame.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const item = session.item;
    const rect = rectOf(item);
    if (item === undefined || rect === undefined) return;
    e.preventDefault();
    frame.focus();
    drag = { mode: e.target === handle ? "size" : "move", startX: e.clientX, startY: e.clientY, rect, item };
    frame.setPointerCapture(e.pointerId);
  });

  frame.addEventListener("pointermove", (e) => {
    if (drag === undefined) return;
    const { s } = view(drag.item);
    const dx = ((e.clientX - drag.startX) / Math.max(1, stage.offsetWidth)) * (FULL / s);
    const dy = ((e.clientY - drag.startY) / Math.max(1, stage.offsetHeight)) * (FULL / s);
    const r = drag.rect;
    live = drag.mode === "move" ? clampRect({ ...r, x: r.x + dx, y: r.y + dy }, drag.item.kind === "zoom") : clampRect({ ...r, width: r.width + dx, height: r.height + dy }, drag.item.kind === "zoom");
    shown = "";
    update();
  });

  function finishDrag(commit: boolean): void {
    const d = drag;
    drag = undefined;
    const rect = live;
    live = undefined;
    shown = "";
    if (d === undefined) return;
    if (commit && rect !== undefined && JSON.stringify(rect) !== JSON.stringify(d.rect)) {
      announcer.say(session.setItemPlace(rect).message);
    } else if (!commit) {
      announcer.say("Put back as it was.");
    }
    update();
  }

  frame.addEventListener("pointerup", () => finishDrag(true));
  frame.addEventListener("pointercancel", () => finishDrag(false));

  frame.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      const key = e.key.toLowerCase();
      if (key === "z" || key === "y") {
        e.preventDefault();
        announcer.say((key === "y" || e.shiftKey ? session.redo() : session.undo()).message);
      }
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (drag !== undefined) finishDrag(false);
      else options.leave();
      return;
    }
    const dir = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (dir === undefined) return;
    const item = session.item;
    const rect = rectOf(item);
    if (item === undefined || rect === undefined) return;
    e.preventDefault();
    const step = e.shiftKey ? BIG_STEP : STEP;
    const [mx = 0, my = 0] = dir;
    const square = item.kind === "zoom";
    const grow = (mx !== 0 ? mx : my) * step;
    const next = e.altKey
      ? clampRect(square ? { ...rect, width: rect.width + grow, height: rect.height + grow } : { ...rect, width: rect.width + mx * step, height: rect.height + my * step }, square)
      : clampRect({ ...rect, x: rect.x + mx * step, y: rect.y + my * step }, square);
    announcer.say(session.setItemPlace(next).message);
  });

  // ---- drawing a zoom ----

  let start: { x: number; y: number } | undefined;

  function setDrawing(on: boolean): void {
    drawing = on;
    layer.classList.toggle("os-pv-drawing", on);
    band.hidden = true;
    start = undefined;
    listener?.(on);
  }

  function fractions(e: PointerEvent): { x: number; y: number } {
    const box = layer.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - box.left) / Math.max(1, box.width))), y: Math.min(1, Math.max(0, (e.clientY - box.top) / Math.max(1, box.height))) };
  }

  /** The square (in the picture's own shape) from where the pointer went down to where it is now, as fractions of the stage. */
  function bandOf(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number; size: number } {
    const size = Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    return { x: b.x < a.x ? Math.max(0, a.x - size) : a.x, y: b.y < a.y ? Math.max(0, a.y - size) : a.y, size };
  }

  layer.addEventListener("pointerdown", (e) => {
    if (!drawing || e.target !== layer || e.button !== 0) return;
    e.preventDefault();
    start = fractions(e);
    layer.setPointerCapture(e.pointerId);
  });

  layer.addEventListener("pointermove", (e) => {
    if (!drawing || start === undefined) return;
    const b = bandOf(start, fractions(e));
    band.hidden = false;
    band.style.left = `${b.x * 100}%`;
    band.style.top = `${b.y * 100}%`;
    band.style.width = `${b.size * 100}%`;
    band.style.height = `${b.size * 100}%`;
  });

  layer.addEventListener("pointerup", (e) => {
    if (!drawing || start === undefined) return;
    const b = bandOf(start, fractions(e));
    setDrawing(false);
    if (b.size * FULL < SMALLEST) {
      announcer.say("That rectangle was too small, so no zoom was made. Press Draw a zoom and drag a larger one.");
      return;
    }
    // Back from the stage to the picture: what the zoom shows now, undone, because a zoom is drawn on what is seen.
    const s = Math.min(FULL / zoom.width, FULL / zoom.height);
    const cx = zoom.x + zoom.width / 2;
    const cy = zoom.y + zoom.height / 2;
    const toSource = (f: number, c: number): number => c + ((f - 0.5) * FULL) / s;
    const rect = keepShape(clampRect({ x: toSource(b.x, cx), y: toSource(b.y, cy), width: (b.size * FULL) / s, height: (b.size * FULL) / s }, true));
    const outcome = session.addZoomHere(rect);
    announcer.say(outcome.message);
    if (outcome.ok) options.onAdded();
  });

  layer.addEventListener("pointercancel", () => setDrawing(false));
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape" && drawing) {
      setDrawing(false);
      announcer.say("Drawing a zoom was cancelled.");
    }
  };
  document.addEventListener("keydown", onKey);

  return {
    toggleDrawZoom() {
      if (drawing) {
        setDrawing(false);
        return { ok: true, message: "Drawing a zoom was cancelled.", drawing: false };
      }
      if (session.lengthMs === 0) return { ok: false, message: "There is nothing in this edit yet, so there is no picture to zoom. Add a clip first.", drawing: false };
      setDrawing(true);
      return {
        ok: true,
        message: "Drawing a zoom. Drag across the picture to choose the part to zoom in on, or press Escape to cancel. Without a mouse, use Zoom on a part instead and place it with the form.",
        drawing: true,
      };
    },
    get drawing() {
      return drawing;
    },
    setZoom(rect) {
      zoom = rect;
    },
    update,
    onDrawingChange(fn) {
      listener = fn;
    },
    destroy() {
      document.removeEventListener("keydown", onKey);
      resize.disconnect();
      layer.remove();
    },
  };
}
