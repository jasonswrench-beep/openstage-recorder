// SPDX-License-Identifier: Apache-2.0
/**
 * The timeline on screen (story C3): the tracks and their clips drawn along a time axis, with a playhead, a zoom, and
 * clips that can be chosen, moved and trimmed by keyboard or by mouse. It shows the same session as the clip list
 * (`panel.ts`), so the two always make the same changes: nothing here is possible only with the mouse.
 *
 * How it is built for a screen reader and for a keyboard:
 *  - The clips are one `listbox` of `option`s, grouped by track (`group`), and the whole of it is one Tab stop: Left and
 *    Right choose the clip before or after in the track, Up and Down the track above or below, Home and End the first
 *    and last in the track. Each option is named by the same sentence as its row in the clip list.
 *  - The ruler is the playhead, a `slider`. Its spoken value says where it is and how that relates to the chosen clip.
 *  - The chosen clip has two real sliders, its start grip and its end grip (as in OpenStage's Timeline): Left and Right
 *    move a tenth of a second, with Shift a second, Page Up and Page Down five seconds, Home and End go to the ends of what
 *    the edit allows. A key held down is one undo step; Escape puts it back.
 *  - A mouse drag moves a clip (and, downwards or upwards onto another track that takes it, moves it to that track) or a
 *    grip. The whole drag is one undo step and Escape cancels it. Dragging one of several chosen clips moves them all
 *    together. A drag jumps to the playhead, to the edges of other clips and to the ends of the edit when it comes close
 *    (snapping, which can be turned off, or held off with Alt for one drag); a line shows where it has jumped to.
 *  - A stretch of time is marked with I (start) and O (end) at the playhead, and shown as a shaded band across every track;
 *    X removes it and leaves a gap, Shift+X removes it and closes the gap.
 *  - Zoom has buttons and keys; only the marks in view are drawn, so an hour-long edit stays quick.
 *
 * Not yet checked with NVDA, Narrator or VoiceOver. Whether a listbox of clips, grouped by track, reads well, and whether
 * the sliders announce clearly, is what the first test with one has to settle. The timeline must not ship until it has.
 */

import {
  describeLength,
  describeTime,
  findSource,
  formatTimecode,
  limitsOf,
  trackKindName,
  type Clip,
  type Limits,
  type Row,
  type StepKey,
  type TrackKind,
} from "../../capture-edit/src/index.ts";
import { Announcer } from "./announcer.ts";
import { COMMANDS, commandFor, isTextField } from "./commands.ts";
import { h, icon, nextId } from "./dom.ts";
import { contentMs, fitScale, mostScale, msAtX, navigate, scaleAtSlider, sliderOf, tickStepMs, ticksBetween, tidy, visibleSpanMs, zoomed, type Direction } from "./geometry.ts";
import type { MediaLibrary } from "./project.ts";
import type { DragKind, EditSession, Outcome } from "./session.ts";
import { createThumbnails, momentFor, TILE_PX } from "./thumbnails.ts";

export interface TimelineOptions {
  /** Where messages are said. Without it the panel makes its own line at the top. */
  announcer?: Announcer;
  /** Also tell this function every message, when the panel makes its own announcer. */
  announce?: (message: string) => void;
  /** The heading above the timeline. */
  title?: string;
  /** Called when the author asks to edit the chosen clip's details (Enter or F2). */
  onEdit?: () => void;
  /** The recordings, so the clips of pictures can show small pictures along them. Without it the clips show only their names. */
  library?: MediaLibrary;
}

export interface TimelinePanel {
  readonly element: HTMLElement;
  /** Put keyboard focus on the chosen clip. */
  focus(): void;
  announce(message: string): void;
  destroy(): void;
}

const PLAYHEAD_KEYS: Readonly<Record<string, StepKey>> = {
  ArrowLeft: "Left",
  ArrowRight: "Right",
  PageUp: "PageUp",
  PageDown: "PageDown",
  Home: "Home",
  End: "End",
};

const NAVIGATION: Readonly<Record<string, Direction>> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowUp: "up",
  ArrowDown: "down",
  Home: "first",
  End: "last",
};

/** The keys that move the playhead from the clips: a tenth of a second, a second with Shift, five seconds. */
const PLAYHEAD_FROM_CLIPS: Readonly<Record<string, readonly [StepKey, boolean]>> = {
  ",": ["Left", false],
  ".": ["Right", false],
  "<": ["Left", true],
  ">": ["Right", true],
  PageUp: ["PageUp", false],
  PageDown: ["PageDown", false],
};

const KEY_DRAG_IDLE_MS = 500;

/** How close, in pixels on the screen, an edge has to come to a time that matters before a drag jumps to it. */
const SNAP_PX = 8;

const TRACK_KINDS: readonly TrackKind[] = ["screen", "webcam", "audio", "media", "overlay", "zoom"];

export function mountTimeline(container: HTMLElement, session: EditSession, options: TimelineOptions = {}): TimelinePanel {
  const id = nextId("os-tl");
  const ownAnnouncer = options.announcer === undefined;
  const announcer = options.announcer ?? new Announcer(options.announce);

  // ---- the parts ----

  const ruler = h("div", {
    class: "os-tl-ruler",
    role: "slider",
    tabindex: 0,
    "aria-label": "Playhead",
    "aria-valuemin": 0,
    "aria-orientation": "horizontal",
    "aria-describedby": `${id}-ruler-hint`,
  });
  const corner = h("div", { class: "os-tl-corner", "aria-hidden": "true" }, "Time");
  const lanesEl = h("div", { class: "os-tl-lanes", role: "listbox", "aria-label": "Clips on the timeline", "aria-multiselectable": "true", "aria-describedby": `${id}-lanes-hint` });
  const gripsEl = h("div", { class: "os-tl-grips" });
  const playline = h("div", { class: "os-tl-playline", "aria-hidden": "true" });
  // The marked stretch is a shaded band over every track, with a mark at each end that is also drawn when only one end is set. Its words are in the announcements and in the Marked stretch line.
  const band = h("div", { class: "os-tl-band", "aria-hidden": "true", hidden: true });
  const markFrom = h("div", { class: "os-tl-mark os-tl-mark-from", "aria-hidden": "true", hidden: true });
  const markTo = h("div", { class: "os-tl-mark os-tl-mark-to", "aria-hidden": "true", hidden: true });
  // While a drag has jumped to something, a line shows what.
  const guide = h("div", { class: "os-tl-guide", "aria-hidden": "true", hidden: true });
  const canvas = h("div", { class: "os-tl-canvas" }, h("div", { class: "os-tl-rulerrow" }, corner, ruler), lanesEl, band, markFrom, markTo, gripsEl, guide, playline);
  const scroller = h("div", { class: "os-tl-scroll" }, canvas);
  const empty = h("p", { class: "os-cl-empty", tabindex: -1 }, "There are no clips yet. Record something, or add a clip, to start editing.");

  const grips = {
    start: h("div", { class: "os-tl-grip os-tl-grip-start", role: "slider", tabindex: 0, "data-grip": "start", "aria-orientation": "horizontal" }),
    end: h("div", { class: "os-tl-grip os-tl-grip-end", role: "slider", tabindex: 0, "data-grip": "end", "aria-orientation": "horizontal" }),
  };
  gripsEl.append(grips.start, grips.end);

  const timeInput = h("input", { id: `${id}-time`, type: "text", class: "os-cl-input", autocomplete: "off", spellcheck: "false", "aria-describedby": `${id}-time-hint` });
  const error = h("p", { class: "os-cl-error", id: `${id}-error` });
  const readout = h("p", { class: "os-cl-readout" });
  // The marked stretch written out, for anyone who cannot see the band.
  const stretchLine = h("p", { class: "os-tl-stretchline", hidden: true });


  // ---- the tool bar: the things done most, one press each. They are the same commands as the keys and the clip list. ----

  const commandOf = (commandId: string) => COMMANDS.find((c) => c.id === commandId);
  const toolButtons = new Map<string, HTMLButtonElement>();
  const tool = (commandId: string, label: string, drawing: SVGSVGElement): HTMLButtonElement => {
    const command = commandOf(commandId);
    const b = h(
      "button",
      { type: "button", class: "os-tl-tool", tabindex: -1, "data-command": commandId, title: `${command?.label ?? label} (${command?.key ?? ""})`, "aria-keyshortcuts": command?.aria },
      drawing,
      h("span", { class: "os-tl-tool-label" }, label),
    );
    b.addEventListener("click", () => {
      if (command !== undefined) run(command.run(session), command.readout === true);
    });
    toolButtons.set(commandId, b);
    return b;
  };
  const separator = (): HTMLElement => h("span", { class: "os-tl-sep", "aria-hidden": "true" });
  const toolbar = h(
    "div",
    { class: "os-tl-tools", role: "toolbar", "aria-label": "Editing tools", "aria-orientation": "horizontal" },
    tool("undo", "Undo", icon("M9 14 4 9l5-5", "M4 9h10.5a5.5 5.5 0 0 1 0 11H11")),
    tool("redo", "Redo", icon("M15 14l5-5-5-5", "M20 9H9.5a5.5 5.5 0 0 0 0 11H13")),
    separator(),
    tool("copy", "Copy", icon("M9 9h11v11H9z", "M5 15H4V4h11v1")),
    tool("paste", "Paste", icon("M9 4h6v3H9z", "M9 5.5H5V21h14v-3", "M12 12h8m-3-3 3 3-3 3")),
    separator(),
    tool("split", "Split", icon("M12 2v20", "M4 7h16v10H4z")),
    tool("delete-gap", "Delete", icon("M4 7h16", "M9 7V4h6v3", "M6 7l1 13h10l1-13", "M10 11v6", "M14 11v6")),
    tool("delete-close", "Delete, close gap", icon("M3 12h6", "M21 12h-6", "M6 9l3 3-3 3", "M18 9l-3 3 3 3")),
    separator(),
    tool("mark-start", "Mark start", icon("M7 3v18", "M7 5h10l-3 4 3 4H7")),
    tool("mark-end", "Mark end", icon("M17 3v18", "M17 5H7l3 4-3 4h10")),
    tool("remove-gap", "Remove stretch", icon("M4 8h5", "M15 8h5", "M9 5v6", "M15 5v6", "M4 16h16")),
    tool("remove-close", "Remove, close gap", icon("M3 8h6", "M21 8h-6", "M9 5v6", "M15 5v6", "M6 16l3 3-3 3", "M18 16l-3 3 3 3")),
    tool("clear-stretch", "Clear marks", icon("M5 5l14 14", "M19 5 5 19")),
    separator(),
    tool("snap", "Snap", icon("M6 4v8a6 6 0 0 0 12 0V4", "M6 8h4", "M14 8h4")),
    separator(),
  );

  // Add track: a button that opens a short menu of the kinds of track. (A box and a button took a row of their own.)
  const addTrackButton = h(
    "button",
    { type: "button", class: "os-tl-tool", tabindex: -1, id: `${id}-addtrack`, "aria-haspopup": "menu", "aria-expanded": "false", "aria-controls": `${id}-trackmenu`, title: "Add a track" },
    icon("M4 7h16v4H4z", "M4 14h9", "M18 13v6", "M15 16h6"),
    h("span", { class: "os-tl-tool-label" }, "Add track"),
  );
  const trackMenu = h("div", { class: "os-tl-menu", role: "menu", id: `${id}-trackmenu`, "aria-label": "Kind of track to add", hidden: true });
  const trackItems = TRACK_KINDS.map((k) => {
    const item = h("button", { type: "button", role: "menuitem", class: "os-tl-menuitem", tabindex: -1, "data-kind": k }, trackKindName(k));
    item.addEventListener("click", () => {
      closeTrackMenu(true);
      run(session.addTrack(k));
    });
    return item;
  });
  trackMenu.append(...trackItems);
  const menuHolder = h("span", { class: "os-tl-menuholder" }, addTrackButton, trackMenu);
  toolbar.append(menuHolder);
  function openTrackMenu(): void {
    trackMenu.hidden = false;
    addTrackButton.setAttribute("aria-expanded", "true");
    trackItems[0]?.focus();
  }
  function closeTrackMenu(refocus: boolean): void {
    if (trackMenu.hidden) return;
    trackMenu.hidden = true;
    addTrackButton.setAttribute("aria-expanded", "false");
    if (refocus) addTrackButton.focus();
  }
  addTrackButton.addEventListener("click", () => (trackMenu.hidden ? openTrackMenu() : closeTrackMenu(true)));
  addTrackButton.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      openTrackMenu();
      if (e.key === "ArrowUp") trackItems[trackItems.length - 1]?.focus();
    }
  });
  trackMenu.addEventListener("keydown", (e) => {
    const at = trackItems.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number): void => {
      e.preventDefault();
      e.stopPropagation();
      trackItems[(to + trackItems.length) % trackItems.length]?.focus();
    };
    if (e.key === "ArrowDown") move(at + 1);
    else if (e.key === "ArrowUp") move(at - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(trackItems.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeTrackMenu(true);
    } else if (e.key === "Tab") closeTrackMenu(false);
  });
  trackMenu.addEventListener("focusout", (e) => {
    const to = e.relatedTarget as Node | null;
    if (to === null || !menuHolder.contains(to)) closeTrackMenu(false);
  });

  // Tracks: a second menu, for the tracks that are already there: change a name, or delete one (an empty one at once;
  // one with something on it only after it is said that it goes together with that).
  const tracksButton = h(
    "button",
    { type: "button", class: "os-tl-tool", tabindex: -1, id: `${id}-tracks`, "aria-haspopup": "menu", "aria-expanded": "false", "aria-controls": `${id}-tracksmenu`, title: "Rename or delete a track" },
    icon("M4 6h16", "M4 12h16", "M4 18h16", "M17 9l3 3-3 3"),
    h("span", { class: "os-tl-tool-label" }, "Tracks"),
  );
  const tracksMenu = h("div", { class: "os-tl-menu os-tl-tracksmenu", role: "menu", id: `${id}-tracksmenu`, "aria-label": "Rename or delete a track", hidden: true });
  const tracksHolder = h("span", { class: "os-tl-menuholder" }, tracksButton, tracksMenu);
  toolbar.append(tracksHolder);
  const trackActions = (): HTMLButtonElement[] => [...tracksMenu.querySelectorAll<HTMLButtonElement>('button[role="menuitem"]')];
  function closeTracksMenu(refocus: boolean): void {
    if (tracksMenu.hidden) return;
    tracksMenu.hidden = true;
    tracksButton.setAttribute("aria-expanded", "false");
    if (refocus) tracksButton.focus();
  }
  /** What the menu offers is made each time it opens, from the tracks as they are now. */
  function openTracksMenu(): void {
    const tracks = session.model.tracks;
    if (tracks.length === 0) {
      say("There are no tracks yet. Add one first.");
      return;
    }
    const items: HTMLElement[] = [];
    for (const t of tracks) {
      const count = t.clips.length + t.items.length;
      const rename = h("button", { type: "button", role: "menuitem", class: "os-tl-menuitem", tabindex: -1 }, `Rename ${t.name}...`);
      rename.addEventListener("click", () => {
        closeTracksMenu(false);
        askTrackName(t.id, t.name);
      });
      const remove = h("button", { type: "button", role: "menuitem", class: "os-tl-menuitem", tabindex: -1 }, count === 0 ? `Delete ${t.name} (empty)` : `Delete ${t.name} and its ${count === 1 ? "one thing" : `${count} things`}...`);
      remove.addEventListener("click", () => {
        closeTracksMenu(false);
        if (count === 0) {
          run(session.deleteTrack(t.id, false));
          tracksButton.focus();
          return;
        }
        askDeleteTrack(t.id, t.name, count);
      });
      items.push(rename, remove);
    }
    tracksMenu.replaceChildren(...items);
    tracksMenu.hidden = false;
    tracksButton.setAttribute("aria-expanded", "true");
    trackActions()[0]?.focus();
  }
  tracksButton.addEventListener("click", () => (tracksMenu.hidden ? openTracksMenu() : closeTracksMenu(true)));
  tracksButton.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      e.stopPropagation();
      openTracksMenu();
      if (e.key === "ArrowUp") trackActions().at(-1)?.focus();
    }
  });
  tracksMenu.addEventListener("keydown", (e) => {
    const list = trackActions();
    const at = list.indexOf(document.activeElement as HTMLButtonElement);
    const move = (to: number): void => {
      e.preventDefault();
      e.stopPropagation();
      list[(to + list.length) % list.length]?.focus();
    };
    if (e.key === "ArrowDown") move(at + 1);
    else if (e.key === "ArrowUp") move(at - 1);
    else if (e.key === "Home") move(0);
    else if (e.key === "End") move(list.length - 1);
    else if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeTracksMenu(true);
    } else if (e.key === "Tab") closeTracksMenu(false);
  });
  tracksMenu.addEventListener("focusout", (e) => {
    const to = e.relatedTarget as Node | null;
    if (to === null || !tracksHolder.contains(to)) closeTracksMenu(false);
  });

  // A small form for a track's name, and a plain question before a track with things on it is deleted. They are part of the
  // panel (not a browser prompt), so a screen reader finds them where the focus goes, and Escape closes them.
  const trackForm = h("form", { class: "os-tl-trackform", role: "group", hidden: true, "aria-labelledby": `${id}-trackform-title` });
  const trackFormTitle = h("p", { class: "os-tl-trackform-title", id: `${id}-trackform-title` });
  const trackFormInput = h("input", { type: "text", class: "os-cl-input", id: `${id}-trackform-name`, autocomplete: "off", "aria-labelledby": `${id}-trackform-title` });
  const trackFormOk = h("button", { type: "submit", class: "os-cl-button" }, "Rename");
  const trackFormCancel = h("button", { type: "button", class: "os-cl-button" }, "Cancel");
  trackForm.append(trackFormTitle, trackFormInput, trackFormOk, trackFormCancel);
  let trackFormDo: (() => void) | undefined;
  function openTrackForm(title: string, okLabel: string, withInput: boolean, then: () => void): void {
    trackFormTitle.textContent = title;
    trackFormOk.textContent = okLabel;
    trackFormInput.hidden = !withInput;
    trackFormDo = then;
    trackForm.hidden = false;
    (withInput ? trackFormInput : trackFormCancel).focus();
    if (withInput) trackFormInput.select();
  }
  function closeTrackForm(): void {
    trackForm.hidden = true;
    trackFormDo = undefined;
    tracksButton.focus();
  }
  function askTrackName(trackId: string, current: string): void {
    trackFormInput.value = current;
    openTrackForm(`New name for the track ${current}`, "Rename", true, () => {
      const outcome = session.renameTrack(trackId, trackFormInput.value);
      say(outcome.message);
      if (outcome.ok) closeTrackForm();
      else trackFormInput.focus();
    });
  }
  function askDeleteTrack(trackId: string, name: string, count: number): void {
    openTrackForm(
      `The track ${name} has ${count === 1 ? "one thing" : `${count} things`} on it. Deleting the track deletes ${count === 1 ? "it" : "them"} too. Undo brings the track back.`,
      "Delete the track and what is on it",
      false,
      () => {
        run(session.deleteTrack(trackId, true));
        trackForm.hidden = true;
        trackFormDo = undefined;
        tracksButton.focus();
      },
    );
  }
  trackForm.addEventListener("submit", (e) => {
    e.preventDefault();
    trackFormDo?.();
  });
  trackFormCancel.addEventListener("click", () => {
    closeTrackForm();
    say("Nothing was changed.");
  });
  trackForm.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      closeTrackForm();
      say("Nothing was changed.");
    }
  });

  const toolList = [...toolButtons.values(), addTrackButton, tracksButton];
  let toolStop = 0;
  const showToolStop = (index: number): void => {
    toolStop = index;
    toolList.forEach((b, i) => b.setAttribute("tabindex", i === index ? "0" : "-1"));
  };
  showToolStop(0);
  toolbar.addEventListener("focusin", (e) => {
    const at = toolList.indexOf(e.target as HTMLButtonElement);
    if (at >= 0 && at !== toolStop) showToolStop(at);
  });
  // Left and Right move along the bar, Home and End go to the ends; Tab leaves it. The whole bar is one stop in the tab order.
  toolbar.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const to = e.key === "ArrowRight" ? toolStop + 1 : e.key === "ArrowLeft" ? toolStop - 1 : e.key === "Home" ? 0 : e.key === "End" ? toolList.length - 1 : undefined;
    if (to === undefined) return;
    e.preventDefault();
    const next = Math.min(toolList.length - 1, Math.max(0, to));
    showToolStop(next);
    toolList[next]?.focus();
  });

  /** Dim what cannot be done now. The buttons stay in the bar and can still be pressed: the answer says why not. */
  function syncTools(): void {
    const off = (commandId: string, value: boolean, title?: string): void => {
      const b = toolButtons.get(commandId);
      if (b === undefined) return;
      b.setAttribute("aria-disabled", value ? "true" : "false");
      if (title !== undefined) b.title = title;
    };
    off("undo", !session.canUndo, session.undoLabel === undefined ? "Undo (Ctrl+Z)" : `Undo ${session.undoLabel} (Ctrl+Z)`);
    off("redo", !session.canRedo, session.redoLabel === undefined ? "Redo (Ctrl+Y)" : `Redo ${session.redoLabel} (Ctrl+Y)`);
    off("paste", !session.canPaste);
    off("remove-gap", !session.stretchReady);
    off("remove-close", !session.stretchReady);
    off("clear-stretch", session.stretch.fromMs === undefined && session.stretch.toMs === undefined);
    const snap = toolButtons.get("snap");
    if (snap !== undefined) {
      snap.setAttribute("aria-pressed", session.snapping ? "true" : "false");
      snap.title = `Snapping is ${session.snapping ? "on" : "off"} (N)`;
    }
  }

  // ---- zoom: a slider and the buttons ----

  const zoomOutButton = h("button", { type: "button", class: "os-tl-tool os-tl-zoombutton", title: "Zoom out (-)", "aria-label": "Zoom out", "aria-keyshortcuts": "-" }, icon("M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z", "M15.5 16l5 5", "M7.5 10.5h6"));
  const zoomInButton = h("button", { type: "button", class: "os-tl-tool os-tl-zoombutton", title: "Zoom in (+)", "aria-label": "Zoom in", "aria-keyshortcuts": "+" }, icon("M10.5 4a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13z", "M15.5 16l5 5", "M7.5 10.5h6", "M10.5 7.5v6"));
  const fitButton = h("button", { type: "button", class: "os-tl-tool os-tl-zoombutton", title: "Show the whole edit (0)", "aria-label": "Show the whole edit", "aria-keyshortcuts": "0" }, icon("M3 12h18", "M3 7v10", "M21 7v10", "M7 9l-4 3 4 3", "M17 9l4 3-4 3"));
  const zoomSlider = h("input", { type: "range", class: "os-tl-zoomslider", id: `${id}-zoom`, min: 0, max: 100, step: 1, value: 0, "aria-label": "Zoom" });
  zoomOutButton.addEventListener("click", () => zoomBy("out"));
  zoomInButton.addEventListener("click", () => zoomBy("in"));
  fitButton.addEventListener("click", () => zoomFit());
  const zoomGroup = h("div", { class: "os-tl-zoom", role: "group", "aria-label": "Zoom" }, zoomOutButton, zoomSlider, zoomInButton, fitButton);

  const helpRows = [
    ["Left and Right arrows", "Choose the clip before or after, in the same track. With Shift, choose a range of clips."],
    ["Up and Down arrows", "Choose the clip showing at the same time in the track above or below. With Shift, add that track to the choice, so one moment across several tracks can be chosen and cut together."],
    ["Home and End", "Choose the first or last clip in the track."],
    ["Ctrl with the arrow keys", "Move without changing which clips are chosen. Then Ctrl+Space adds the clip you are on to the choice, or takes it out, so clips that are not next to each other can be chosen."],
    ["Ctrl+Space", "Add the clip you are on to the choice, or take it out."],
    ["Ctrl+A", "Choose every clip."],
    ["Escape", "Keep just the clip you are on."],
    ["Comma and period", "Move the playhead 0.1 second. With Shift (less than and greater than signs), 1 second. Page Up and Page Down move it 5 seconds."],
    ["Plus, minus and 0", "Zoom in, zoom out, and show the whole edit."],
    ["Enter or F2", "Edit the clip you are on: go to its name and times in the clip list."],
    ["On a start or end grip", "Left and Right move it 0.1 second, with Shift 1 second, Page Up and Page Down 5 seconds, Home and End to the ends of what is allowed. Escape puts it back."],
    ["On the playhead", "The same keys move the playhead. Home and End go to the start and end of the edit."],
    ...COMMANDS.map((c) => [c.key, c.label] as const),
    ["Mouse", "Drag a clip to move it, or onto another track that takes it to move it there. With several chosen, dragging one moves them all together. A drag jumps to the playhead and to the edges of other clips when it comes close (the Snap button, or N, turns that off; holding Alt turns it off for one drag). Drag a start or end grip to trim. Click the ruler or an empty part of a track to put the playhead there. Escape cancels a drag; one drag is one undo step."],
    ["Removing a stretch", "Put the playhead where the stretch starts and press I, then where it ends and press O. A shaded band shows it. X removes it from every track and leaves a gap; Shift+X removes it and moves everything after it earlier. Alt+X clears the marks. One undo puts it all back."],
  ] as const;
  const help = h(
    "details",
    { class: "os-cl-help" },
    h("summary", {}, "Keyboard shortcuts for the timeline"),
    h("p", {}, "Letters work when a clip, a grip or the playhead has focus, not inside a text box. Split, trim, delete and mute act on every chosen clip."),
    h("dl", {}, ...helpRows.flatMap(([keys, what]) => [h("dt", {}, keys), h("dd", {}, what)])),
  );

  const timeField = h("div", { class: "os-cl-field os-cl-field-inline os-tl-timefield" }, h("label", { for: `${id}-time` }, "Playhead time"), timeInput);

  const root = h(
    "section",
    { class: "os-cl os-tl", "aria-labelledby": `${id}-title` },
    h("h2", { id: `${id}-title`, class: "os-cl-title" }, options.title ?? "Timeline"),
    ownAnnouncer ? announcer.element : "",
    h("div", { class: "os-tl-bar" }, toolbar, timeField, zoomGroup),
    trackForm,
    h("p", { class: "os-cl-hint", id: `${id}-time-hint` }, "Type a time such as 72.4 (seconds), 1:12.4 (minutes and seconds) or 1m12.4s, then press Enter."),
    error,
    h("p", { class: "os-cl-hint", id: `${id}-ruler-hint` }, "The ruler is the playhead: Left and Right move it, Home and End go to the start and end."),
    h("p", { class: "os-cl-hint", id: `${id}-lanes-hint` }, "Left and Right choose the clip before or after, Up and Down the track above or below. The keys are listed under Keyboard shortcuts."),
    h("div", { class: "os-tl-frame" }, scroller, empty),
    stretchLine,
    readout,
    help,
  );
  container.append(root);

  // ---- state and drawing ----

  const optionEls = new Map<string, HTMLElement>();
  const thumbs = options.library === undefined ? undefined : createThumbnails(options.library);
  /** The strips of pictures on the clips that have a picture to show: what each shows is worked out from what is in view. */
  const strips = new Map<string, { readonly el: HTMLElement; readonly row: Row; readonly clip: Clip; shown: string }>();
  let scale = 0.05; // pixels for each millisecond
  let fitting = true; // following the whole edit, until the author zooms in
  let contentPx = 0;
  let keyDragTimer: number | undefined;

  const say = (message: string): void => announcer.say(message);

  function run(outcome: Outcome, keep = false): void {
    say(outcome.message);
    if (keep && outcome.ok) readout.textContent = outcome.message;
  }

  /** The width in pixels of the gutter that holds the track names: where time 0 is, counted from the canvas's left edge. */
  function gutterPx(): number {
    return ruler.offsetLeft;
  }

  /** Where time 0 is on the screen. */
  function originX(): number {
    return ruler.getBoundingClientRect().left;
  }

  function fit(): number {
    return fitScale(Math.max(scroller.clientWidth - gutterPx() - 16, 200), contentMs(session.lengthMs));
  }

  function noun(kind: TrackKind, count: number): string {
    const clips = kind !== "overlay" && kind !== "zoom";
    return `${count} ${clips ? (count === 1 ? "clip" : "clips") : count === 1 ? "item" : "items"}`;
  }

  function place(el: HTMLElement, row: Row): void {
    el.style.left = `${row.startMs * scale}px`;
    el.style.width = `${Math.max(4, row.lengthMs * scale)}px`;
  }

  function buildOption(row: Row, index: number, count: number, clip?: Clip): HTMLElement {
    const primary = row.clipId === session.selectedId;
    const sentence = session.describeRow(row.clipId);
    const el = h(
      "div",
      {
        role: "option",
        class: `os-tl-clip${primary ? " os-tl-primary" : ""}${row.state === "muted" ? " os-tl-muted" : ""}`,
        tabindex: primary ? 0 : -1,
        "aria-selected": session.isSelected(row.clipId) ? "true" : "false",
        "aria-label": sentence,
        "aria-posinset": index + 1,
        "aria-setsize": count,
        "data-id": row.clipId,
        title: sentence,
      },
      h("span", { class: "os-tl-clip-name" }, row.name),
    );
    if (row.state !== "ready") el.append(h("span", { class: "os-tl-badge" }, row.state));
    if (clip !== undefined) {
      // The pictures are decoration: hidden from a screen reader, which has the clip's name and sentence.
      const strip = h("span", { class: "os-tl-strip", "aria-hidden": "true" });
      el.prepend(strip);
      el.classList.add("os-tl-hasstrip");
      strips.set(row.clipId, { el: strip, row, clip, shown: "" });
      // A mark on the edge where a transition is, for the eye; the sentence tells everyone else.
      if (clip.transitionIn !== undefined) el.append(h("span", { class: "os-tl-trans os-tl-trans-in", "aria-hidden": "true" }));
      if (clip.transitionOut !== undefined) el.append(h("span", { class: "os-tl-trans os-tl-trans-out", "aria-hidden": "true" }));
    }
    place(el, row);
    return el;
  }

  function renderLanes(): void {
    const hadFocus = lanesEl.contains(document.activeElement) || document.activeElement === empty;
    const rows = session.rows;
    optionEls.clear();
    strips.clear();
    // Which clips have a picture to show: those of a screen, a webcam or an imported video.
    const pictured = new Map<string, Clip>();
    if (thumbs !== undefined) {
      for (const track of session.model.tracks) {
        for (const clip of track.clips) {
          const kind = findSource(session.model, clip.source)?.kind;
          if (kind === "screen" || kind === "webcam" || kind === "video") pictured.set(clip.id, clip);
        }
      }
    }
    const lanes = session.model.tracks.map((track) => {
      const mine = rows.filter((r) => r.trackId === track.id);
      const trackEl = h("div", { class: "os-tl-track", "data-track": track.id });
      trackEl.style.width = `${contentPx}px`;
      mine.forEach((row, i) => {
        const el = buildOption(row, i, mine.length, pictured.get(row.clipId));
        optionEls.set(row.clipId, el);
        trackEl.append(el);
      });
      return h(
        "div",
        { class: "os-tl-lane", role: "group", "aria-label": `${track.name} track, ${mine.length === 0 ? "empty" : noun(track.kind, mine.length)}`, "data-track": track.id, "data-kind": track.kind },
        h("span", { class: "os-tl-lane-name", "aria-hidden": "true", title: track.name }, h("span", { class: "os-tl-lane-title" }, track.name), h("span", { class: "os-tl-lane-kind" }, trackKindName(track.kind))),
        trackEl,
      );
    });
    lanesEl.replaceChildren(...lanes);
    lanesEl.hidden = rows.length === 0;
    empty.hidden = rows.length !== 0;
    if (hadFocus) focusPrimary();
  }

  function renderTicks(): void {
    const from = Math.max(0, scroller.scrollLeft / scale - 2000);
    const to = (scroller.scrollLeft + scroller.clientWidth) / scale + 2000;
    const step = tickStepMs(scale);
    const marks = ticksBetween(from, to, step, contentPx / scale).map((ms) => {
      const mark = h("span", { class: "os-tl-tick", "aria-hidden": "true" }, formatTimecode(ms));
      mark.style.left = `${ms * scale}px`;
      return mark;
    });
    ruler.replaceChildren(...marks);
  }

  function laneIndexOf(trackId: string): number {
    return session.model.tracks.findIndex((t) => t.id === trackId);
  }

  function positionGrip(grip: HTMLElement, ms: number, lane: number): void {
    grip.style.left = `calc(var(--os-tl-gutter) + ${ms * scale}px)`;
    grip.style.top = `calc(var(--os-tl-ruler-h) + ${lane} * var(--os-tl-lane-h))`;
  }

  /** The two grips of the chosen clip: their places, and what a screen reader says for them. */
  function renderGrips(limits?: Limits): void {
    const row = session.selectedRow;
    gripsEl.hidden = row === undefined || !session.singleChoice || lanesEl.hidden;
    if (row === undefined || gripsEl.hidden) return;
    const found = limits ?? limitsOf(session.model, row.clipId);
    const lane = laneIndexOf(row.trackId);
    positionGrip(grips.start, row.startMs, lane);
    positionGrip(grips.end, row.endMs, lane);
    grips.start.setAttribute("aria-label", `Start of "${row.name}"`);
    grips.end.setAttribute("aria-label", `End of "${row.name}"`);
    if (found !== undefined) {
      grips.start.setAttribute("aria-valuemin", String(found.trimStart.min));
      grips.start.setAttribute("aria-valuemax", String(found.trimStart.max));
      grips.end.setAttribute("aria-valuemin", String(found.trimEnd.min));
      grips.end.setAttribute("aria-valuemax", String(found.trimEnd.max));
    }
    updateGripValues(row);
  }

  function updateGripValues(row: Row): void {
    grips.start.setAttribute("aria-valuenow", String(row.startMs));
    grips.start.setAttribute("aria-valuetext", `starts at ${describeTime(row.startMs)}, ${describeLength(row.lengthMs)} long`);
    grips.end.setAttribute("aria-valuenow", String(row.endMs));
    grips.end.setAttribute("aria-valuetext", `ends at ${describeTime(row.endMs)}, ${describeLength(row.lengthMs)} long`);
    const lane = laneIndexOf(row.trackId);
    positionGrip(grips.start, row.startMs, lane);
    positionGrip(grips.end, row.endMs, lane);
  }

  /** The band and its two marks, and the line of words under the timeline. */
  function renderStretch(): void {
    const { fromMs, toMs } = session.stretch;
    const putAt = (el: HTMLElement, ms: number | undefined): void => {
      el.hidden = ms === undefined;
      if (ms !== undefined) el.style.left = `calc(var(--os-tl-gutter) + ${ms * scale}px)`;
    };
    putAt(markFrom, fromMs);
    putAt(markTo, toMs);
    const both = fromMs !== undefined && toMs !== undefined;
    band.hidden = !both;
    if (both) {
      band.style.left = `calc(var(--os-tl-gutter) + ${fromMs * scale}px)`;
      band.style.width = `${Math.max(2, (toMs - fromMs) * scale)}px`;
    }
    stretchLine.hidden = fromMs === undefined && toMs === undefined;
    stretchLine.textContent = both
      ? `Marked stretch: ${describeTime(fromMs)} to ${describeTime(toMs)}, ${describeLength(toMs - fromMs)}. X removes it and leaves a gap; Shift+X removes it and closes the gap.`
      : fromMs !== undefined
        ? `Marked stretch: starts at ${describeTime(fromMs)}. Move the playhead to where it ends and press O.`
        : toMs !== undefined
          ? `Marked stretch: ends at ${describeTime(toMs)}. Move the playhead to where it starts and press I.`
          : "";
  }

  function renderGuide(): void {
    const at = session.drag?.snappedTo;
    guide.hidden = at === undefined;
    if (at !== undefined) guide.style.left = `calc(var(--os-tl-gutter) + ${at * scale}px)`;
  }

  function syncPlayhead(): void {
    const at = session.playheadMs;
    playline.style.left = `calc(var(--os-tl-gutter) + ${at * scale}px)`;
    // While the author is in the box it is left alone, even while playing: otherwise each frame would put the playing time
    // back and a time could not be typed. It is brought up to date when they press Enter, or leave it.
    if (document.activeElement !== timeInput) timeInput.value = formatTimecode(at);
    // While it plays, the slider's value is not changed sixty times a second for a screen reader to announce: it is told
    // where the playhead is when it stops.
    if (!session.playing) {
      ruler.setAttribute("aria-valuemax", String(session.lengthMs));
      ruler.setAttribute("aria-valuenow", String(at));
      ruler.setAttribute("aria-valuetext", session.playheadText);
    }
    keepPlayheadInView();
  }

  /** If the playhead has gone out of view (a key moved it, or it is playing), scroll so it is in view again. */
  function keepPlayheadInView(): void {
    const x = session.playheadMs * scale;
    const left = scroller.scrollLeft;
    const room = scroller.clientWidth - gutterPx();
    if (x < left) scroller.scrollLeft = Math.max(0, x - 40);
    else if (x > left + room) scroller.scrollLeft = session.playing ? x - room * 0.15 : x - room + 40; // turn the page while playing
  }

  /**
   * Draw the pictures along the clips that are in view, and only those: a long clip zoomed in would otherwise need hundreds.
   * A picture that has been made before is put in at once; the others fill in as they are made, newest first.
   */
  function renderThumbs(): void {
    if (thumbs === undefined) return;
    const fromMs = Math.max(0, scroller.scrollLeft / scale - 1500);
    const toMs = (scroller.scrollLeft + scroller.clientWidth) / scale + 1500;
    const tileMs = TILE_PX / scale;
    for (const entry of strips.values()) {
      const { row, clip, el } = entry;
      if (row.endMs < fromMs || row.startMs > toMs) {
        if (entry.shown !== "") {
          el.replaceChildren();
          entry.shown = "";
        }
        continue;
      }
      if (!thumbs.usable(clip.source)) {
        thumbs.prepare(clip.source, scheduleThumbs);
        continue;
      }
      const first = Math.max(0, Math.floor((fromMs - row.startMs) / tileMs));
      const last = Math.min(Math.ceil(row.lengthMs / tileMs) - 1, Math.floor((toMs - row.startMs) / tileMs));
      const shown = `${scale.toPrecision(6)}:${first}-${last}`;
      if (entry.shown === shown) continue;
      entry.shown = shown;
      const tiles: HTMLElement[] = [];
      for (let i = first; i <= last; i++) {
        const tile = h("span", { class: "os-tl-tile" });
        tile.style.left = `${i * TILE_PX}px`;
        const at = Math.min(row.lengthMs - 1, i * tileMs);
        const moment = momentFor(clip.sourceStartMs + at, tileMs);
        const ready = thumbs.peek(clip.source, moment);
        if (ready !== undefined) tile.style.backgroundImage = `url("${ready}")`;
        else {
          void thumbs.frame(clip.source, moment, () => tile.isConnected).then((url) => {
            if (url !== undefined && tile.isConnected) tile.style.backgroundImage = `url("${url}")`;
          });
        }
        tiles.push(tile);
      }
      el.replaceChildren(...tiles);
    }
  }

  let thumbsQueued = false;
  function scheduleThumbs(): void {
    if (thumbsQueued || thumbs === undefined) return;
    thumbsQueued = true;
    window.requestAnimationFrame(() => {
      thumbsQueued = false;
      renderThumbs();
    });
  }

  function layout(): void {
    if (fitting) scale = fit();
    contentPx = contentMs(session.lengthMs) * scale;
    canvas.style.width = `calc(var(--os-tl-gutter) + ${contentPx}px)`;
    ruler.style.width = `${contentPx}px`;
    renderLanes();
    renderTicks();
    renderGrips();
    renderStretch();
    renderGuide(); // the edit is redrawn when a drag ends, which is when the line goes
    syncPlayhead();
    syncZoom();
    syncTools();
    renderThumbs();
  }

  function renderSelection(): void {
    for (const [rowId, el] of optionEls) {
      const primary = rowId === session.selectedId;
      el.tabIndex = primary ? 0 : -1;
      el.setAttribute("aria-selected", session.isSelected(rowId) ? "true" : "false");
      el.classList.toggle("os-tl-primary", primary);
    }
    renderGrips();
    syncPlayhead();
  }

  function focusPrimary(): void {
    const el = session.selectedId === undefined ? undefined : optionEls.get(session.selectedId);
    if (el !== undefined) el.focus();
    else empty.focus();
  }

  const stop = session.subscribe((kind) => {
    if (kind === "model") layout();
    else if (kind === "selection") renderSelection();
    else if (kind === "clipboard") syncTools();
    else if (kind === "tools") {
      renderStretch();
      syncTools();
    } else if (kind === "playhead" || kind === "transport") syncPlayhead();
    else if (kind === "drag") {
      const drag = session.drag;
      const row = drag === undefined ? undefined : session.rows.find((r) => r.clipId === drag.id);
      if (drag === undefined || row === undefined) return;
      for (const moving of drag.ids) {
        const movingRow = session.rows.find((r) => r.clipId === moving);
        const el = optionEls.get(moving);
        if (el !== undefined && movingRow !== undefined) place(el, movingRow); // its sentence is made again when the drag ends
      }
      updateGripValues(row);
      renderGuide();
    }
  });

  // ---- zoom ----

  /** Change the scale, keeping the playhead where it is on the screen. */
  function setScale(next: number): void {
    const at = session.playheadMs;
    const x = at * scale - scroller.scrollLeft;
    scale = next;
    fitting = Math.abs(next - fit()) < 1e-12;
    layout();
    scroller.scrollLeft = Math.max(0, at * scale - x);
    renderTicks();
  }

  function span(): string {
    return describeLength(visibleSpanMs(scroller.clientWidth - gutterPx(), scale));
  }

  function zoomBy(direction: "in" | "out"): void {
    const before = scale;
    const next = zoomed(scale, fit(), direction);
    if (next === before) {
      say(direction === "in" ? `Already as far in as it goes. About ${span()} fit across the timeline.` : `The whole edit is already showing, ${span()} across.`);
      return;
    }
    setScale(next);
    say(`Zoomed ${direction}. About ${span()} fit across the timeline.`);
  }

  function zoomFit(): void {
    fitting = true;
    scale = fit();
    layout();
    scroller.scrollLeft = 0;
    renderTicks();
    say(`Showing the whole edit, ${span()} across.`);
  }

  /** The slider shows where the zoom is, and says it in words: how much time fits across the timeline. */
  function syncZoom(): void {
    const whole = fit();
    // Not `disabled` (that would take it out of the Tab order): when there is nowhere to zoom to it is only marked.
    zoomSlider.setAttribute("aria-disabled", mostScale(whole) <= whole * 1.0001 ? "true" : "false");
    zoomSlider.value = String(sliderOf(scale, whole));
    zoomSlider.setAttribute("aria-valuetext", fitting ? `The whole edit, ${span()} across` : `${span()} across`);
  }

  zoomSlider.addEventListener("input", () => {
    setScale(scaleAtSlider(Number(zoomSlider.value), fit()));
  });
  zoomSlider.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.preventDefault();
      focusPrimary();
    }
  });

  // ---- keys ----

  function commandKey(e: KeyboardEvent): boolean {
    const command = commandFor(e);
    if (command === undefined) return false;
    e.preventDefault();
    run(command.run(session), command.readout === true);
    return true;
  }

  const EDGE: Readonly<Record<Direction, string>> = {
    left: "This is the first clip on this track.",
    right: "This is the last clip on this track.",
    first: "This is the first clip on this track.",
    last: "This is the last clip on this track.",
    up: "There is no track above this one with anything on it.",
    down: "There is no track below this one with anything on it.",
  };

  function go(direction: Direction, extend: boolean): void {
    const from = session.selectedId;
    if (from === undefined) return;
    const target = navigate(session.rows, session.model.tracks.map((t) => t.id), from, direction);
    if (target === undefined) {
      say(EDGE[direction]);
      return;
    }
    const moved = !extend ? session.select(target.clipId) : direction === "left" || direction === "right" ? session.selectRange(target.clipId) : session.selectBlock(target.clipId);
    focusPrimary();
    if (extend && moved.changed) say(moved.message);
  }

  /** Focus arriving by Tab or by a program on a clip that is not the one with the focus makes it the only chosen one. */
  lanesEl.addEventListener("focusin", (e) => {
    const rowId = (e.target as HTMLElement).closest<HTMLElement>(".os-tl-clip")?.dataset["id"];
    if (rowId !== undefined && rowId !== session.selectedId) session.select(rowId);
  });

  lanesEl.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    const key = e.key;
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && Object.hasOwn(NAVIGATION, key)) {
      // Ctrl with an arrow key moves without changing the choice; Ctrl+Space then adds the clip or takes it out.
      e.preventDefault();
      const from = session.selectedId;
      const target = from === undefined ? undefined : navigate(session.rows, session.model.tracks.map((t) => t.id), from, NAVIGATION[key] ?? "right");
      if (target === undefined) {
        say(EDGE[NAVIGATION[key] ?? "right"]);
        return;
      }
      session.focusOn(target.clipId);
      focusPrimary();
      return;
    }
    if (plain) {
      if (Object.hasOwn(NAVIGATION, key)) {
        e.preventDefault();
        go(NAVIGATION[key] ?? "right", e.shiftKey);
        return;
      }
      const step = PLAYHEAD_FROM_CLIPS[key];
      if (step !== undefined) {
        e.preventDefault();
        run(session.stepPlayhead(step[0], step[1] || e.shiftKey));
        return;
      }
      if (key === "+" || key === "=") {
        e.preventDefault();
        zoomBy("in");
        return;
      }
      if (key === "-" || key === "_") {
        e.preventDefault();
        zoomBy("out");
        return;
      }
      if (key === "0") {
        e.preventDefault();
        zoomFit();
        return;
      }
      if (key === "Enter" || key === "F2") {
        e.preventDefault();
        options.onEdit?.();
        return;
      }
      if (key === "Escape") {
        const moved = session.keepOnlyPrimary();
        if (moved.changed) {
          e.preventDefault();
          say(moved.message);
        }
        return;
      }
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (key.toLowerCase() === "a") {
        e.preventDefault();
        say(session.selectAll().message);
        return;
      }
      if (key === " ") {
        e.preventDefault();
        say(session.toggleSelected().message);
        return;
      }
    }
    commandKey(e);
  });

  // The playhead, with the keys of the Timeline. Its value is read as it changes, so the line of text is not used for it.
  ruler.addEventListener("keydown", (e) => {
    if (e.defaultPrevented) return;
    if (!e.ctrlKey && !e.metaKey && !e.altKey && Object.hasOwn(PLAYHEAD_KEYS, e.key)) {
      e.preventDefault();
      session.stepPlayhead(PLAYHEAD_KEYS[e.key] ?? "Right", e.shiftKey);
      return;
    }
    commandKey(e);
  });

  // The grips. A key held down is one drag, which ends by itself when the keys stop, or on any other command.
  function finishKeyDrag(): void {
    if (keyDragTimer !== undefined) {
      window.clearTimeout(keyDragTimer);
      keyDragTimer = undefined;
    }
    if (session.dragging && session.drag?.via === "keys") session.endDrag();
  }

  for (const kind of ["start", "end"] as const) {
    const grip = grips[kind];
    grip.addEventListener("keydown", (e) => {
      if (e.defaultPrevented) return;
      // Pressing Shift on its way to Shift+Right is not another command, and does not end the step.
      if (e.key === "Shift" || e.key === "Control" || e.key === "Alt" || e.key === "Meta") return;
      if (e.key === "Escape" && session.dragging && session.drag?.via === "keys") {
        e.preventDefault();
        if (keyDragTimer !== undefined) window.clearTimeout(keyDragTimer);
        keyDragTimer = undefined;
        run(session.cancelDrag());
        return;
      }
      if (!e.ctrlKey && !e.metaKey && !e.altKey && Object.hasOwn(PLAYHEAD_KEYS, e.key)) {
        e.preventDefault();
        const rowId = session.selectedId;
        if (rowId === undefined) return;
        if (!session.dragging) {
          const began = session.beginDrag(kind, rowId, "keys");
          if (!began.ok) {
            say(began.message);
            return;
          }
        }
        const stepped = session.dragStep(PLAYHEAD_KEYS[e.key] ?? "Right", e.shiftKey);
        // The grip's value is read as it changes; a sentence is only needed when it cannot go further.
        if (stepped.message !== "") say(stepped.message);
        if (keyDragTimer !== undefined) window.clearTimeout(keyDragTimer);
        keyDragTimer = window.setTimeout(finishKeyDrag, KEY_DRAG_IDLE_MS);
        return;
      }
      finishKeyDrag();
      commandKey(e);
    });
    grip.addEventListener("blur", finishKeyDrag);
  }

  // Undo, redo, copy and paste work from anywhere in the panel (the tool bar, the zoom slider) except a text box, where
  // they undo, copy and paste the typing.
  root.addEventListener("keydown", (e) => {
    if (e.defaultPrevented || isTextField(e.target)) return;
    const command = commandFor(e);
    if (command !== undefined && ["undo", "redo", "copy", "paste"].includes(command.id)) {
      e.preventDefault();
      finishKeyDrag();
      run(command.run(session));
    }
  });

  // ---- the mouse ----

  function autoscroll(clientX: number): void {
    const box = scroller.getBoundingClientRect();
    if (clientX > box.right - 40) scroller.scrollLeft += 24;
    else if (clientX < box.left + gutterPx() + 40) scroller.scrollLeft -= 24;
  }

  /** Follow the pointer until it is let go, calling `move` for each movement. `done` says how it ended. */
  function track(move: (ev: PointerEvent) => void, done: (cancelled: boolean) => void): void {
    const finish = (cancelled: boolean): void => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", onKey, true);
      done(cancelled);
    };
    const up = (): void => finish(false);
    const cancel = (): void => finish(true);
    // Escape calls off a drag from the keyboard, so a drag is never something that has to be finished with the mouse.
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== "Escape") return;
      ev.preventDefault();
      ev.stopPropagation();
      finish(true);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", onKey, true);
  }

  /** Drag a clip (`move`) or one of its grips (`start`, `end`). Nothing begins until the pointer has really moved. */
  function armDrag(kind: DragKind, rowId: string, e: PointerEvent): void {
    const startX = e.clientX;
    const startY = e.clientY;
    const first = session.rows.find((r) => r.clipId === rowId);
    if (first === undefined) return;
    const grab = msAtX(e.clientX, originX(), scale) - first.startMs;
    const from = first.trackId;
    let began = false;
    let drop: string | undefined;
    let lane: HTMLElement | undefined;
    const el = optionEls.get(rowId);
    // Dragging one of several chosen clips moves them all, so it cannot be dropped on another track and the choice is kept.
    const together = kind === "move" && session.selectionCount > 1 && session.isSelected(rowId);

    const showDrop = (target: HTMLElement | undefined): void => {
      if (lane !== undefined && lane !== target) lane.classList.remove("os-tl-drop-ok", "os-tl-drop-no");
      lane = target;
      if (target === undefined) return;
      const ok = session.trackChoices.some((c) => c.id === target.dataset["track"] && !c.current);
      target.classList.toggle("os-tl-drop-ok", ok);
      target.classList.toggle("os-tl-drop-no", !ok);
    };

    track(
      (ev) => {
        if (!began) {
          if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < (kind === "move" ? 4 : 2)) return;
          if (session.selectionCount > 1 && !together) session.select(rowId);
          const result = session.beginDrag(kind, rowId);
          if (!result.ok) {
            say(result.message);
            return;
          }
          began = true;
          el?.classList.add("os-tl-dragging");
        }
        const ms = msAtX(ev.clientX, originX(), scale);
        session.dragTo(tidy(kind === "move" ? ms - grab : ms), { snapWithinMs: ev.altKey ? 0 : SNAP_PX / scale });
        autoscroll(ev.clientX);
        if (kind === "move" && !together) {
          const under = document.elementFromPoint(ev.clientX, ev.clientY)?.closest<HTMLElement>(".os-tl-lane") ?? undefined;
          const trackId = under?.dataset["track"];
          drop = trackId !== undefined && trackId !== from ? trackId : undefined;
          showDrop(drop === undefined ? undefined : under);
        }
      },
      (cancelled) => {
        el?.classList.remove("os-tl-dragging");
        showDrop(undefined);
        if (!began) {
          // Only a click: a click on one of several chosen clips makes it the only one.
          if (kind === "move" && !cancelled && session.selectionCount > 1) session.select(rowId);
          return;
        }
        run(cancelled ? session.cancelDrag() : session.endDrag(drop === undefined ? {} : { dropTrackId: drop }));
        focusPrimary();
      },
    );
  }

  lanesEl.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    const rowId = target.closest<HTMLElement>(".os-tl-clip")?.dataset["id"];
    if (rowId === undefined) {
      // An empty part of a track puts the playhead there.
      if (target.classList.contains("os-tl-track")) {
        e.preventDefault();
        scrub(e);
      }
      return;
    }
    e.preventDefault(); // no text selection; the focus is put where it belongs below
    if (e.ctrlKey || e.metaKey) {
      say(session.toggleSelected(rowId).message);
      focusPrimary();
      return;
    }
    if (e.shiftKey) {
      say(session.selectBlock(rowId).message);
      focusPrimary();
      return;
    }
    if (!session.isSelected(rowId)) session.select(rowId);
    focusPrimary();
    armDrag("move", rowId, e);
  });

  for (const kind of ["start", "end"] as const) {
    grips[kind].addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const rowId = session.selectedId;
      if (rowId === undefined) return;
      e.preventDefault();
      grips[kind].focus();
      armDrag(kind, rowId, e);
    });
  }

  /** Put the playhead where the pointer is, and keep following it until it is let go. */
  function scrub(e: PointerEvent): void {
    session.setPlayhead(msAtX(e.clientX, originX(), scale));
    track(
      (ev) => {
        session.setPlayhead(msAtX(ev.clientX, originX(), scale));
        autoscroll(ev.clientX);
      },
      () => undefined,
    );
  }

  ruler.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    ruler.focus();
    scrub(e);
  });

  scroller.addEventListener("scroll", () => {
    window.requestAnimationFrame(renderTicks);
    scheduleThumbs();
  });

  // ---- the playhead time and the track kind ----

  let tried: string | undefined;
  // What the box showed when the author came to it, or last held a time they entered. Text that is still that was not typed by
  // them, so it is never entered: while it plays the playhead moves on from what the box shows, and leaving the box must not
  // put the playhead back.
  let baseline = timeInput.value;
  timeInput.addEventListener("focus", () => {
    baseline = timeInput.value;
  });
  const commitTime = (): void => {
    const text = timeInput.value;
    if (text === baseline || text === formatTimecode(session.playheadMs) || text === tried) return;
    const outcome = session.setPlayheadText(text);
    if (outcome.ok) {
      tried = undefined;
      timeInput.removeAttribute("aria-invalid");
      timeInput.removeAttribute("aria-errormessage");
      error.textContent = "";
      timeInput.value = formatTimecode(session.playheadMs);
      baseline = timeInput.value;
    } else {
      tried = text;
      timeInput.setAttribute("aria-invalid", "true");
      timeInput.setAttribute("aria-errormessage", error.id);
      error.textContent = outcome.message;
    }
    say(outcome.message);
  };
  timeInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commitTime();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (timeInput.value !== formatTimecode(session.playheadMs)) {
        timeInput.value = formatTimecode(session.playheadMs);
        baseline = timeInput.value;
        tried = undefined;
        timeInput.removeAttribute("aria-invalid");
        error.textContent = "";
        say("Put back as it was.");
      } else {
        focusPrimary();
      }
    }
  });
  timeInput.addEventListener("change", commitTime);
  // Leaving the box brings it up to date with the playhead, unless it holds a time that was refused (kept so it can be fixed).
  timeInput.addEventListener("blur", () => {
    if (tried === undefined) timeInput.value = formatTimecode(session.playheadMs);
  });
  timeInput.addEventListener("input", () => {
    tried = undefined;
  });

  // ---- size ----

  const observer = new ResizeObserver(() => {
    if (fitting) layout();
    else {
      renderTicks();
      syncZoom();
      scheduleThumbs();
    }
  });
  observer.observe(scroller);

  // ---- first draw ----
  layout();

  return {
    element: root,
    focus: focusPrimary,
    announce: say,
    destroy(): void {
      stop();
      observer.disconnect();
      thumbs?.destroy();
      if (keyDragTimer !== undefined) window.clearTimeout(keyDragTimer);
      if (ownAnnouncer) announcer.destroy();
      root.remove();
    },
  };
}
