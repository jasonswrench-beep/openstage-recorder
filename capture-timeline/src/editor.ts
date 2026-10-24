// SPDX-License-Identifier: Apache-2.0
/**
 * The editing screens together: the timeline above and the clip list below, on one session, sharing one line of
 * announcements. F6 and Shift+F6 move between the two (region cycling, as OpenStage's own panels do).
 */

import { Announcer } from "./announcer.ts";
import type { CalloutKind } from "../../capture-edit/src/index.ts";
import { h } from "./dom.ts";
import { mountCalloutBar, type AddMedia, type CalloutBar } from "./callout-panel.ts";
import { mountItemForm, type ItemFormOptions, type ItemFormPanel } from "./item-form.ts";
import { mountClipList, type ClipListPanel } from "./panel.ts";
import { EMPTY_LIBRARY, type MediaLibrary } from "./project.ts";
import { mountPreview, type PreviewPanel } from "./preview-panel.ts";
import type { EditSession } from "./session.ts";
import { mountTimeline, type TimelinePanel } from "./timeline-panel.ts";

export interface EditorOptions {
  /** Also tell this function every message. */
  announce?: (message: string) => void;
  /** How the rows of the clip list are named for a screen reader. */
  rows?: "sentence" | "cells";
  /** The recordings the preview plays. Without it the preview shows placeholders. */
  library?: MediaLibrary;
  /** Start with the clip list and its form open at the side. They are closed by default so the picture and the timeline have the room. */
  listOpen?: boolean;
  /** How a picture, video or sound is chosen and brought into the course. Without it the buttons for files are left out. */
  addMedia?: AddMedia;
  /** Which ready-made callouts the bar under the picture offers (text, title, lower third, highlight, circle, arrow, blur, cover). Without it, all of them. Zoom is always offered. */
  callouts?: readonly CalloutKind[];
  /** Suggests alt text for a shape or arrow, shown beside its alt text box for the author to use or ignore (story D6). Without it nothing is suggested. */
  suggestAlt?: ItemFormOptions["suggestAlt"];
}

export interface Editor {
  readonly element: HTMLElement;
  readonly preview: PreviewPanel;
  readonly timeline: TimelinePanel;
  readonly list: ClipListPanel;
  readonly callouts: CalloutBar;
  readonly itemForm: ItemFormPanel;
  readonly announcer: Announcer;
  /** Put keyboard focus on the timeline. */
  focus(): void;
  announce(message: string): void;
  destroy(): void;
}

export function mountEditor(container: HTMLElement, session: EditSession, options: EditorOptions = {}): Editor {
  const announcer = new Announcer(options.announce);
  const previewHost = h("div", { class: "os-ed-preview" });
  const calloutHost = h("div", { class: "os-ed-callouts" });
  const timelineHost = h("div", { class: "os-ed-timeline" });
  const listHost = h("div", { class: "os-ed-list" });
  const propertiesButton = h("button", { type: "button", class: "os-cl-button", "aria-expanded": "false", "aria-controls": "os-ed-list" }, "Properties and clip list");
  const split = h("div", { class: "os-ed-split", role: "separator", "aria-orientation": "vertical", tabindex: 0, "aria-controls": "os-ed-list", "aria-label": "Width of the Properties panel", title: "Drag, or use the Left and Right arrow keys, to change the width of the Properties panel" });
  const bar = h("div", { class: "os-ed-bar", role: "group", "aria-label": "Editing screens" }, propertiesButton);
  listHost.id = "os-ed-list";
  listHost.hidden = !(options.listOpen ?? false);
  split.hidden = listHost.hidden;
  propertiesButton.setAttribute("aria-expanded", listHost.hidden ? "false" : "true");
  const root = h("div", { class: "os-ed" }, announcer.element, bar, previewHost, calloutHost, timelineHost, split, listHost);
  container.append(root);

  // The gallery wraps into columns when the row it sits in is short. How many columns it needs depends on the window and on what is above the
  // editor, so it is measured, not guessed from the window's height: a column is added while the buttons run past the side and would be hidden.
  const fitGallery = (): void => {
    let cols = 1;
    root.style.setProperty("--os-co-cols", "1");
    while (cols < 4 && calloutHost.scrollWidth > calloutHost.clientWidth + 1) {
      cols++;
      root.style.setProperty("--os-co-cols", String(cols));
    }
  };
  const galleryWatcher = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(fitGallery);
  galleryWatcher?.observe(root);
  fitGallery();

  /** Show or hide the clip list and its form. Whatever sends focus to the list opens it first, so focus is never sent to something hidden. */
  const setListOpen = (open: boolean): void => {
    listHost.hidden = !open;
    split.hidden = !open;
    propertiesButton.setAttribute("aria-expanded", open ? "true" : "false");
  };
  const openList = (): void => { if (listHost.hidden) setListOpen(true); };
  propertiesButton.addEventListener("click", () => {
    const open = Boolean(listHost.hidden); // it is closed now, so this press opens it
    setListOpen(open);
    announcer.say(open ? "Properties and clip list opened." : "Properties and clip list closed.");
    if (open) list.focus();
  });

  // The splitter. The width is kept in pixels, between a quarter and two thirds of the editor, and reported to a screen reader
  // as a percentage with the width in words. Left makes the panel wider, Right narrower (it is on the right), Shift takes bigger steps.
  const widthLimits = (): { min: number; max: number } => {
    const whole = root.getBoundingClientRect().width || 1000;
    return { min: Math.min(320, whole * 0.25), max: Math.max(360, whole * 0.66) };
  };
  const setListWidth = (px: number, say: boolean): void => {
    const { min, max } = widthLimits();
    const width = Math.round(Math.min(max, Math.max(min, px)));
    root.style.setProperty("--os-ed-list-width", `${width}px`);
    const whole = root.getBoundingClientRect().width || 1;
    split.setAttribute("aria-valuemin", String(Math.round((min / whole) * 100)));
    split.setAttribute("aria-valuemax", String(Math.round((max / whole) * 100)));
    const percent = Math.round((width / whole) * 100);
    split.setAttribute("aria-valuenow", String(percent));
    split.setAttribute("aria-valuetext", `Properties panel is ${percent} percent of the width`);
    if (say) announcer.say(`Properties panel is ${percent} percent of the width.`);
  };
  const currentListWidth = (): number => listHost.getBoundingClientRect().width || 480;
  split.addEventListener("focus", () => setListWidth(currentListWidth(), false));
  split.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const step = e.shiftKey ? 120 : 32;
    const { min, max } = widthLimits();
    let next: number | undefined;
    if (e.key === "ArrowLeft") next = currentListWidth() + step;
    else if (e.key === "ArrowRight") next = currentListWidth() - step;
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    if (next === undefined) return;
    e.preventDefault();
    setListWidth(next, true);
  });
  split.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    split.setPointerCapture(e.pointerId);
    const move = (m: PointerEvent): void => setListWidth(root.getBoundingClientRect().right - m.clientX, false);
    const stop = (): void => {
      split.removeEventListener("pointermove", move);
      split.removeEventListener("pointerup", stop);
      split.removeEventListener("pointercancel", stop);
      announcer.say(split.getAttribute("aria-valuetext") ?? "");
    };
    split.addEventListener("pointermove", move);
    split.addEventListener("pointerup", stop);
    split.addEventListener("pointercancel", stop);
  });

  // The form for a chosen overlay or zoom sits above the clip list in the same panel.
  const itemHost = h("div", { class: "os-ed-item" });
  listHost.append(itemHost);
  const itemForm = mountItemForm(itemHost, session, { announcer, leave: () => timeline.focus(), ...(options.suggestAlt === undefined ? {} : { suggestAlt: options.suggestAlt }) });
  const list = mountClipList(listHost, session, { announcer, playhead: false, ...(options.rows === undefined ? {} : { rows: options.rows }), title: "Clip list" });
  const timeline = mountTimeline(timelineHost, session, {
    announcer,
    onEdit: () => { openList(); if (!itemForm.focus()) list.focusDetails(); },
    ...(options.library === undefined ? {} : { library: options.library }),
  });
  /** Something was added to the picture: show its form and put focus in the first box that needs filling in. */
  const showAdded = (): void => {
    openList();
    if (!itemForm.focus()) list.focusDetails();
  };
  const preview = mountPreview(previewHost, session, options.library ?? EMPTY_LIBRARY, { announcer, onAdded: showAdded });
  const callouts = mountCalloutBar(calloutHost, session, {
    announcer,
    drawZoom: () => preview.toggleDrawZoom(),
    onDrawingChange: (fn) => preview.onDrawingChange(fn),
    onAdded: showAdded,
    ...(options.addMedia === undefined ? {} : { addMedia: options.addMedia }),
    ...(options.callouts === undefined ? {} : { kinds: options.callouts }),
  });

  const regions = [
    { name: "Preview", element: preview.element, focus: () => preview.focus() },
    { name: "Timeline", element: timeline.element, focus: () => timeline.focus() },
    { name: "Clip list", element: list.element, focus: () => { openList(); list.focus(); } },
  ];

  // F6 and Shift+F6 move between the regions, and say which one they arrived in.
  root.addEventListener("keydown", (e) => {
    if (e.key !== "F6" || e.ctrlKey || e.metaKey || e.altKey) return;
    e.preventDefault();
    const here = regions.findIndex((r) => r.element.contains(document.activeElement));
    const next = regions[(here + (e.shiftKey ? -1 : 1) + regions.length) % regions.length];
    if (next === undefined) return;
    next.focus();
    announcer.say(`${next.name}.`);
  });

  return {
    element: root,
    preview,
    timeline,
    list,
    callouts,
    itemForm,
    announcer,
    focus: () => timeline.focus(),
    announce: (message) => announcer.say(message),
    destroy(): void {
      galleryWatcher?.disconnect();
      preview.destroy();
      callouts.destroy();
      timeline.destroy();
      itemForm.destroy();
      list.destroy();
      announcer.destroy();
      root.remove();
    },
  };
}
