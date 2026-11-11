// SPDX-License-Identifier: Apache-2.0
// The editing screen: the preview, the timeline and the clip list of one recording, with a way to save the edit and to make a video from it.
//
// The editing screens themselves are the package capture-timeline (plain DOM, no dependencies). This gives them a page to live on, a way to reach
// the recording through the shell (recordingfolder.ts), and a way to save. An edit is a list of what to keep and what to add (cuts, transitions,
// blur, zoom, where the webcam sits). It is saved as `edit.json` inside the recording and never changes the recorded picture or sound.
//
// Taken from OpenStage Author's `editor/src/editrecording.ts`, which is a pop-up for a course. This is a page, with no course: nothing is put on
// a slide, no captions are written and no audio descriptions are made. Only Blur and Cover (a solid box that hides part of the picture completely)
// are offered among the callouts, because text, shapes and arrows are not part of this product. See docs/recorder/EXTRACTED-FROM-OPENSTAGE.md.
//
// The screens have their own F6, which moves between the preview, the timeline and the clip list and says where it arrived, and their own line
// of announcements, a polite live region. The app's own status line is not used as well, so nothing is read twice.
//
// The look (2026-11-10, the suite revamp, after the design specification's mockup S01): a bar with Back, the recording's name and whether
// the edit is saved, Save and the main Make a video; the other ways to finish (a sound file, a picture), Suggest zooms and the two choices
// about the video are in one More panel that opens and closes, so the bar is not two rows of wide buttons. The editing screens themselves
// (capture-timeline) are shared with OpenStage Author and are not changed: only their colour names are pointed at the suite's (app.css).

import { describeLength, describeSuggestion, describeTime, listCaption, modelLengthMs, serialize, suggestZooms, type ZoomSuggestion } from "../../capture-edit/src/index.ts";
import { h, nextId } from "../../capture-timeline/src/dom.ts";
import { mountEditor, type Editor } from "../../capture-timeline/src/editor.ts";
import { backupName, libraryOf, readProject } from "../../capture-timeline/src/project.ts";
import { EditSession, SOUND_NAMES, type BalanceSound } from "../../capture-timeline/src/session.ts";
import { errorText, type RecorderBackend } from "./backend.ts";
import { runOneShot } from "./capturecontroller.ts";
import { applyExportLine, exportPlan, finishedWords, initialExport, type ExportKind, type ExportPlan, type ExportState } from "./captureexport.ts";
import { recordingFolder } from "./recordingfolder.ts";
import { gatherClicks, nothingToSuggestFrom, videoSizeOf } from "./zoomsuggest.ts";
import { uiIcon } from "./uiicons.gen.ts";

export interface EditViewOptions {
  backend: RecorderBackend;
  /** The recordings folder. */
  library: string;
  /** The recording's folder name, such as `Recording 2026-10-23 2026.capture`. */
  name: string;
  /** Start a new edit of the newest take, not the edit saved before (the old one is kept as a copy when the new one is saved). */
  newestTake?: boolean;
  /** Go back to the Record screen. Called after the author has agreed to leave, and after the view has let go of the recording. */
  leave: () => void;
}

export interface EditView {
  readonly element: HTMLElement;
  /** Put the focus where the author will want it: the timeline, or the question that is waiting. */
  focus(): void;
  /** What to ask before the window closes, or null when closing loses nothing. */
  closeQuestion(): string | null;
  destroy(): void;
}

/** The longest a video may take to make before it is stopped. A long recording takes a while; this is only a safety net. */
export const EXPORT_LIMIT_MS = 4 * 60 * 60 * 1000;

/** The tools of the callout bar this product offers. Zoom is always offered by the screens themselves. */
export const CALLOUTS_OFFERED = ["blur", "cover"] as const;

/** The question to ask before going back to the recordings or closing the window, or null when nothing would be lost. */
export function closeQuestion(dirty: boolean, making: boolean, action: "leave" | "close" = "leave", what: "video" | "sound file" | "picture" = "video"): string | null {
  const go = action === "leave" ? "leave" : "close the window";
  if (making && dirty) return `A ${what} is still being made, and there are changes to the edit that are not saved. Stop the ${what}, lose the changes and ${go}?`;
  if (making) return `A ${what} is still being made. Stop it and ${go}?`;
  if (dirty) return `There are changes to this edit that are not saved. ${action === "leave" ? "Leave" : "Close the window"} and lose them?`;
  return null;
}

/** What the edit says about itself, beside the Save button. */
export function stateWords(dirty: boolean): string {
  return dirty ? "There are changes that are not saved." : "There are no unsaved changes.";
}

/** The first thing the screens say when a recording is opened. */
export function openingWords(title: string, lengthMs: number, caption: string, notes: readonly string[], problems: readonly { message: string }[]): string {
  const first = problems[0];
  const problem = first === undefined ? "" : ` ${problems.length === 1 ? "One thing needs a look" : `${problems.length} things need a look`}: ${first.message}`;
  return `Opened the recording ${title}, ${describeLength(lengthMs)} long. ${caption} ${notes.join(" ")}${problem}`.replace(/\s+/g, " ").trim();
}

export function mountEditView(host: HTMLElement, opts: EditViewOptions): EditView {
  const b = opts.backend;
  const uid = nextId("ev");
  const id = (name: string): string => `${uid}-${name}`;

  const heading = h("h2", { id: id("title"), tabindex: "-1" }, "Edit the recording");
  const intro = h(
    "p",
    { class: "rv-note" },
    "Your changes are saved as a list of what to keep and what to add. The recording itself, its picture and its sound, is never changed. Press F6 to move between the preview, the timeline and the clip list.",
  );
  const state = h("p", { id: id("state"), class: "rv-note" }, "Opening the recording.");
  const back = h("button", { type: "button", class: "os-cl-button" }, uiIcon(document, "arrow-left"), "Back to recordings");
  const save = h("button", { type: "button", class: "os-cl-button", "aria-describedby": id("state") }, uiIcon(document, "save"), "Save the edit");
  const suggestBtn = h("button", { type: "button", class: "os-cl-button", hidden: true }, uiIcon(document, "zoom-in"), "Suggest zooms from my clicks");
  const make = h("button", { type: "button", class: "os-cl-button rv-primary" }, uiIcon(document, "file-video-camera"), "Make a video from this edit");
  const makeSound = h("button", { type: "button", class: "os-cl-button" }, uiIcon(document, "file-volume"), "Make a sound file (WAV) from this edit");
  const makePicture = h("button", { type: "button", class: "os-cl-button" }, uiIcon(document, "image-down"), "Save the picture shown in the preview (PNG)");
  const cancelVideo = h("button", { type: "button", class: "os-cl-button", hidden: true }, "Cancel the video");
  // The other ways to finish, Suggest zooms and the choices about the video, in one panel that opens and closes (a native disclosure: Enter
  // and Space open it, a screen reader hears whether it is open, and Escape closes it and goes back to its button).
  const more = h("details", { class: "ev-more" });
  const moreBody = h("div", { class: "ev-more-body" });
  more.append(h("summary", {}, uiIcon(document, "ellipsis"), h("span", {}, "More ways to finish, and choices")), moreBody);
  more.addEventListener("keydown", (e) => {
    if (e.key !== "Escape" || !more.open) return;
    e.preventDefault();
    e.stopPropagation();
    more.open = false;
    more.querySelector<HTMLElement>("summary")?.focus();
  });
  const actions = h("div", { class: "rv-actions ev-actions" }, save, make, cancelVideo);
  const reduceBox = h("input", { type: "checkbox", id: id("reduce") });
  reduceBox.checked = typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const highlightBox = h("input", { type: "checkbox", id: id("highlight") });
  const highlight = h(
    "div",
    { class: "rv-check" },
    highlightBox,
    h("label", { for: id("highlight") }, "Show where the mouse pointer is in the video and in pictures (a soft yellow ring, and a red ring where a button was pressed). Only a recording made with the mouse noted can show it."),
  );
  const reduce = h(
    "div",
    { class: "rv-check" },
    reduceBox,
    h("label", { for: id("reduce") }, "Use cuts instead of animated zooms in the video (kinder to anyone bothered by movement)"),
  );

  // ---- the video
  const progress = h("progress", { id: id("progress"), max: "100", value: "0", hidden: true, "aria-labelledby": id("say") });
  const say = h("p", { id: id("say"), role: "status" });
  const notes = h("ul", { class: "rv-list", "aria-label": "What the recorder said about the video" });
  const reveal = h("button", { type: "button", class: "os-cl-button", hidden: true }, "Show the video in its folder");
  const videoTitle = h("h3", { id: id("video-title") }, "The video");
  const videoBox = h("section", { class: "rv-section", "aria-labelledby": id("video-title"), hidden: true }, videoTitle, progress, say, notes, h("div", { class: "rv-actions" }, reveal));

  // ---- zooms suggested from where the mouse was clicked
  const suggestTitle = h("h3", { id: id("suggest-title"), tabindex: "-1" }, "Suggested zooms");
  const suggestSay = h("p", { id: id("suggest-message") });
  const suggestList = h("ul", { class: "rv-list", "aria-label": "Suggested zooms" });
  const addAll = h("button", { type: "button", class: "os-cl-button", hidden: true }, "Add all");
  const closeSuggest = h("button", { type: "button", class: "os-cl-button" }, "Close the suggestions");
  const suggestBox = h("section", { class: "rv-section", "aria-labelledby": id("suggest-title"), hidden: true }, suggestTitle, suggestSay, suggestList, h("div", { class: "rv-actions" }, addAll, closeSuggest));

  // ---- the balance between your voice and the computer's sound, which a recording keeps on separate tracks
  const balanceHint = h(
    "p",
    { id: id("balance-hint"), class: "rv-note" },
    "Your voice and the computer's sound are on separate tracks, so each can be made louder or quieter in the video, for every clip of it at once. A whole number of decibels from -40 to 20. 0 is as it was heard, a minus number is quieter (-6 is about half as loud) and a plus number is louder. A box that is empty means the clips of that sound are not all the same; typing a number sets them all. To change just one clip, use Volume in that clip's form.",
  );
  const balanceBoxes = (["microphone", "system-audio"] as const).map((sound) => {
    const input = h("input", { id: id(`balance-${sound}`), type: "text", class: "os-cl-input os-cl-time", autocomplete: "off", spellcheck: "false", "aria-describedby": id("balance-hint") });
    const field = h("div", { class: "os-cl-field" }, h("label", { for: input.id }, `${SOUND_NAMES[sound]}, in decibels`), input);
    return { sound, input, field };
  });
  const balance = h("fieldset", { class: "rv-fieldset", hidden: true }, h("legend", {}, "Sound balance"), ...balanceBoxes.map((b) => b.field), balanceHint);

  const editorHost = h("div", { class: "ev-host" });
  moreBody.append(h("div", { class: "rv-actions" }, makeSound, makePicture, suggestBtn), reduce, highlight);
  const bar = h("div", { class: "ev-bar" },
    h("div", { class: "ev-bar-start" }, back, h("div", { class: "ev-bar-title" }, heading, state)),
    actions);
  const root = h("section", { class: "rv-section ev", "aria-labelledby": id("title") }, bar, more, intro, balance, suggestBox, videoBox, editorHost);
  host.append(root);

  const folder = recordingFolder(b, opts.library, opts.name);
  let session: EditSession | undefined;
  let editor: Editor | undefined;
  /** The saved edit that a new edit of the newest take replaces, until it has been copied aside. */
  let toKeep: { text: string; name: string } | undefined;
  let making = false;
  /** What is being made while `making` is true. */
  let makingWhat: ExportKind = "video";
  let plan: ExportPlan | null = null;
  /**
   * Whether the `edit.json` in the recording is the edit on the screen. It is not for an edit made fresh from the takes (there is none yet, or
   * it is an older one) until the first save, and the video maker reads `edit.json`, so a video is never made from a file that is not the edit.
   */
  let onDisk = false;

  const dirty = (): boolean => session?.dirty === true;
  const showState = (): void => {
    if (session !== undefined) state.textContent = stateWords(session.dirty);
  };

  /** Save the edit. Says whether it was saved. */
  async function saveEdit(): Promise<boolean> {
    if (session === undefined || editor === undefined) return false;
    let saved = false;
    try {
      if (toKeep !== undefined) {
        if (!(await folder.writeText(toKeep.name, toKeep.text))) {
          editor.announce(`The edit saved before could not be copied to ${toKeep.name}, so nothing was saved and nothing was changed on the disk.`);
          return false;
        }
        toKeep = undefined;
      }
      if (await folder.writeText("edit.json", serialize(session.model))) {
        session.markSaved();
        onDisk = true;
        saved = true;
        editor.announce(`Saved the edit in ${opts.name}.`);
      } else {
        editor.announce("The edit could not be saved. Nothing was changed on the disk.");
      }
    } catch (err) {
      editor.announce(`The edit could not be saved. ${errorText(err)}`);
    }
    showState();
    return saved;
  }

  function drawNotes(s: ExportState): void {
    notes.replaceChildren(...s.notes.map((n) => h("li", {}, h("strong", { class: n.ok ? "rv-pass" : "rv-problem" }, n.ok ? "Note. " : "Problem. "), h("span", {}, n.text))));
  }

  /** What is being made, for the words around it. */
  const thingOf = (kind: ExportKind): "video" | "sound file" | "picture" => (kind === "video" ? "video" : kind === "sound" ? "sound file" : "picture");

  /**
   * Make the video, or only the sound as a WAV file, from the saved edit. The edit is saved first, because the recorder reads edit.json.
   * The sound file is the voice and the computer's sound as they are mixed in the video, for listening to or using in another program.
   */
  async function makeFile(kind: ExportKind): Promise<void> {
    if (session === undefined) return;
    if (making) {
      videoBox.hidden = false;
      say.textContent = `A ${thingOf(makingWhat)} is already being made. Wait until it is finished, or cancel it.`;
      return;
    }
    const thing = thingOf(kind);
    if ((session.dirty || !onDisk) && !(await saveEdit())) {
      videoBox.hidden = false;
      say.textContent = `The edit could not be saved, so no ${thing} was made.`;
      return;
    }
    making = true;
    makingWhat = kind;
    plan = exportPlan(opts.library, opts.name, { reduceMotion: reduceBox.checked, highlightCursor: highlightBox.checked, audioOnly: kind === "sound", ...(kind === "picture" ? { frameMs: session.playheadMs } : {}) });
    let s = initialExport();
    videoTitle.textContent = kind === "video" ? "The video" : kind === "sound" ? "The sound file" : "The picture";
    notes.setAttribute("aria-label", `What the recorder said about the ${thing}`);
    reveal.textContent = `Show the ${thing} in its folder`;
    cancelVideo.textContent = `Cancel the ${thing}`;
    videoBox.hidden = false;
    reveal.hidden = true;
    notes.replaceChildren();
    // A picture is made in a moment and says nothing about progress, so there is no bar to show.
    progress.hidden = kind === "picture";
    progress.value = 0;
    make.setAttribute("aria-disabled", "true");
    makeSound.setAttribute("aria-disabled", "true");
    makePicture.setAttribute("aria-disabled", "true");
    cancelVideo.hidden = false;
    say.textContent =
      kind === "video"
        ? "Making the video. This can take a while for a long recording. You can keep editing, but the video is made from the edit as it was saved."
        : kind === "sound"
          ? "Making the sound file. You can keep editing, but the sound file is made from the edit as it was saved."
          : `Saving the picture at ${((plan.frameMs ?? 0) / 1000).toFixed(1)} seconds. You can keep editing, but the picture is made from the edit as it was saved.`;
    const job = await runOneShot(
      b,
      plan.args,
      (line) => {
        const u = applyExportLine(s, line);
        s = u.state;
        progress.value = s.percent;
        if (u.say.length > 0) say.textContent = u.say.join(" ");
        drawNotes(s);
      },
      EXPORT_LIMIT_MS,
    );
    making = false;
    make.removeAttribute("aria-disabled");
    makeSound.removeAttribute("aria-disabled");
    makePicture.removeAttribute("aria-disabled");
    cancelVideo.hidden = true;
    progress.hidden = true;
    const done = finishedWords(s, job.exit, job.problem, kind);
    say.textContent = done.sentence;
    drawNotes(s);
    reveal.hidden = !done.made;
    // The button is shown only when there is a file to show, so moving to it is moving to the next thing to do.
    if (done.made) reveal.focus();
  }

  // ---- suggested zooms: made from the clicks that were noted while recording, added only when the author says so
  let suggestions: ZoomSuggestion[] = [];

  const tell = (message: string): void => {
    suggestSay.textContent = message;
    editor?.announce(message);
  };

  function drawSuggestions(): void {
    suggestList.replaceChildren(
      ...suggestions.map((z) => {
        const when = describeTime(z.startMs);
        const add = h("button", { type: "button", class: "os-cl-button", "aria-label": `Add the zoom at ${when}` }, "Add this zoom");
        const skip = h("button", { type: "button", class: "os-cl-button", "aria-label": `Leave out the zoom at ${when}` }, "Leave it out");
        add.addEventListener("click", () => addSuggestion(z));
        skip.addEventListener("click", () => {
          suggestions = suggestions.filter((x) => x !== z);
          drawSuggestions();
          tell(`Left out the zoom at ${when}. ${suggestions.length === 0 ? "No suggestions are left." : `${suggestions.length} left.`}`);
          focusSuggestions();
        });
        return h("li", {}, h("span", {}, describeSuggestion(z)), " ", add, " ", skip);
      }),
    );
    addAll.hidden = suggestions.length < 2;
    addAll.textContent = `Add all ${suggestions.length}`;
  }

  /** The focus goes to the next thing to do: the first suggestion's Add button, or Close when none is left. */
  function focusSuggestions(): void {
    const first = suggestList.querySelector<HTMLButtonElement>("button");
    (first ?? closeSuggest).focus();
  }

  function addSuggestion(z: ZoomSuggestion): void {
    if (session === undefined) return;
    const outcome = session.addSuggestedZoom(z);
    if (!outcome.ok) {
      tell(outcome.message);
      return;
    }
    suggestions = suggestions.filter((x) => x !== z);
    drawSuggestions();
    tell(`${outcome.message} ${suggestions.length === 0 ? "No suggestions are left." : `${suggestions.length} left.`}`);
    focusSuggestions();
  }

  async function suggestNow(): Promise<void> {
    if (session === undefined) return;
    suggestBox.hidden = false;
    suggestions = [];
    drawSuggestions();
    tell("Looking at where you clicked.");
    const gathered = await gatherClicks(folder, session.model, videoSizeOf);
    if (gathered.takes.size === 0) {
      tell(nothingToSuggestFrom(gathered));
      suggestTitle.focus();
      return;
    }
    suggestions = suggestZooms(session.model, gathered.takes);
    drawSuggestions();
    const extra = gathered.notes.length > 0 ? ` ${gathered.notes.join(" ")}` : "";
    tell(
      suggestions.length === 0
        ? `No zoom is suggested: the clicks are too few, too far apart, or already covered by a zoom.${extra}`
        : `${suggestions.length === 1 ? "One zoom is" : `${suggestions.length} zooms are`} suggested from where you clicked. Add the ones you want. Each is an ordinary zoom afterwards, and still needs a description of what it shows.${extra}`,
    );
    if (suggestions.length > 0) focusSuggestions();
    else suggestTitle.focus();
  }

  suggestBtn.addEventListener("click", () => void suggestNow());
  addAll.addEventListener("click", () => {
    const all = [...suggestions];
    let added = 0;
    for (const z of all) {
      if (session?.addSuggestedZoom(z).ok === true) {
        added += 1;
        suggestions = suggestions.filter((x) => x !== z);
      }
    }
    drawSuggestions();
    tell(`Added ${added} of ${all.length} zooms. ${suggestions.length === 0 ? "No suggestions are left." : `${suggestions.length} could not be added and are still listed.`}`);
    focusSuggestions();
  });
  closeSuggest.addEventListener("click", () => {
    suggestBox.hidden = true;
    suggestions = [];
    suggestBtn.focus();
  });

  /** Leave for the Record screen, after asking if anything would be lost. */
  async function leaveNow(): Promise<void> {
    const ask = closeQuestion(dirty(), making, "leave", thingOf(makingWhat));
    if (ask !== null && !(await b.confirm(ask))) return;
    if (making) await b.streamStop().catch(() => false);
    opts.leave();
  }

  save.addEventListener("click", () => void saveEdit());
  make.addEventListener("click", () => void makeFile("video"));
  makeSound.addEventListener("click", () => void makeFile("sound"));
  makePicture.addEventListener("click", () => void makeFile("picture"));
  cancelVideo.addEventListener("click", () => {
    say.textContent = `Cancelling the ${thingOf(makingWhat)}.`;
    void b.streamStop().catch(() => false);
  });
  reveal.addEventListener("click", () => {
    if (plan !== null) void b.revealRecording(opts.library, opts.name, plan.rel).catch((err: unknown) => { say.textContent = `Could not show the folder. ${errorText(err)}`; });
  });
  back.addEventListener("click", () => void leaveNow());
  // Ctrl+S saves the edit. In a text box it is still the edit that is saved, and the page is never saved by the browser.
  root.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === "s") {
      e.preventDefault();
      void saveEdit();
    }
  });

  /** Ask which edit to open, when takes were recorded after the saved edit. Resolves to true for a new edit of the newest take. */
  function askWhich(newest: number, title: string): Promise<boolean> {
    return new Promise((done) => {
      const keep = h("button", { type: "button", class: "os-cl-button" }, "Open my saved edit");
      const fresh = h("button", { type: "button", class: "os-cl-button" }, `Start a new edit of the newest recording (take ${newest})`);
      const askTitle = h("h3", { id: id("ask-title"), tabindex: "-1" }, "Which edit do you want?");
      const box = h(
        "section",
        { "aria-labelledby": id("ask-title") },
        askTitle,
        h("p", {}, `${title} has a recording made after the edit you saved. Your saved edit is the older one. If you start a new edit of the newest recording, your saved edit is kept: it is copied to ${backupName(newest)} when you first save the new one.`),
        h("div", { class: "rv-actions" }, keep, fresh),
      );
      editorHost.replaceChildren(box);
      state.textContent = "Choose which edit to open, or press Back to leave.";
      keep.focus();
      const choose = (value: boolean): void => {
        box.remove();
        done(value);
      };
      keep.addEventListener("click", () => choose(false));
      fresh.addEventListener("click", () => choose(true));
    });
  }

  // Until the recording has been read, the focus is on the heading, so it is never left on a button that is no longer on the page.
  heading.focus();
  void (async () => {
    let result = await readProject(folder, opts.newestTake === true ? { newestTakeOnly: true } : {});
    const unused = result.ok ? result.project.unusedTakes : undefined;
    if (result.ok && unused !== undefined && unused[0] !== undefined) {
      if (await askWhich(unused[0], result.project.title)) result = await readProject(folder, { newestTakeOnly: true });
    }
    if (!result.ok) {
      state.textContent = result.message;
      save.hidden = true;
      make.hidden = true;
      reduce.hidden = true;
      back.focus();
      return;
    }
    const { project } = result;
    heading.textContent = `Edit the recording: ${project.title}`;
    onDisk = project.fromEditFile;
    if (project.replacedEdit !== undefined && project.newestTake !== undefined) toKeep = { text: project.replacedEdit, name: backupName(project.newestTake) };
    const live = new EditSession(project.model);
    session = live;
    suggestBtn.hidden = false;
    editor = mountEditor(editorHost, live, { library: libraryOf(project.folder), callouts: CALLOUTS_OFFERED });
    // The balance boxes show how loud each sound is now, and put away the box of a sound that this recording does not have.
    const showBalance = (): void => {
      let any = false;
      for (const { sound, input, field } of balanceBoxes) {
        const now = live.soundBalance(sound);
        field.hidden = now.clips === 0;
        any ||= now.clips > 0;
        // A box the author is typing in is left alone until they leave it or press Enter.
        if (document.activeElement !== input) {
          input.value = now.db === undefined ? "" : String(now.db);
          input.removeAttribute("aria-invalid");
        }
      }
      balance.hidden = !any;
    };
    for (const { sound, input } of balanceBoxes) {
      const commit = (): void => {
        const asked = input.value;
        const was = live.soundBalance(sound).db;
        if (asked.trim() === "" && was === undefined) return; // left as it was: different clips, nothing typed
        const outcome = live.setSoundBalance(sound, asked);
        editor?.announce(outcome.message);
        if (outcome.ok) {
          input.removeAttribute("aria-invalid");
          const db = live.soundBalance(sound).db;
          input.value = db === undefined ? "" : String(db);
        } else {
          // What was typed is kept, to be mended, and marked as not accepted.
          input.setAttribute("aria-invalid", "true");
        }
      };
      input.addEventListener("change", commit);
      input.addEventListener("input", () => input.removeAttribute("aria-invalid"));
      input.addEventListener("keydown", (e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        const db = live.soundBalance(sound).db;
        const text = db === undefined ? "" : String(db);
        // The first Escape puts the number back as it was; with nothing to put back, it returns to the timeline.
        if (input.value !== text) {
          input.value = text;
          input.removeAttribute("aria-invalid");
        } else editor?.focus();
      });
    }
    live.subscribe((kind) => {
      if (kind === "model" || kind === "saved") showState();
      if (kind === "model") showBalance();
    });
    showState();
    showBalance();
    editor.announce(openingWords(project.title, modelLengthMs(project.model), listCaption(project.model), project.notes, project.problems));
    editor.focus();
  })();

  return {
    element: root,
    focus: () => (editor === undefined ? heading : editor).focus(),
    closeQuestion: () => closeQuestion(dirty(), making, "close", thingOf(makingWhat)),
    destroy() {
      editor?.destroy();
      folder.release();
      root.remove();
    },
  };
}
