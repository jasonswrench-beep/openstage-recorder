// SPDX-License-Identifier: Apache-2.0
// The Record screen: choose what to record and how, start it, and control it while it goes on (pause, resume, stop, start again, add a marker).
//
// What the recorder does is held by the RecorderController (capturecontroller.ts), not by this screen, so a recording goes on whatever is
// shown, and the screen shows it again when it comes back. Every state is a sentence, and the sentences that matter are spoken through a
// status region. The recorder also has keys that work from any program, because the author is looking at another program while they record.
//
// This is a page, not a pop-up: nothing traps the keyboard. It is OpenStage Author's recorder dialog (editor/src/recorderdialog.ts there)
// without the course, the steps and the interaction notes, and with a recordings folder of the author's choice instead of a course folder.
//
// The look (2026-11-10, the suite revamp, after the design specification's mockup R01): three numbered steps (what to record, as three cards
// that are radio buttons; the voice, the computer's sound and a webcam, as three cards; the name and Start), and beside them where recordings
// are kept, the choices most people leave alone (the mouse, windows to hide, sound balance) as sections that open and close, the recordings
// made so far and whether this computer is ready. The recordings and the computer check have their own tabs (main.ts), given as `hosts`.

import { h, nextId } from "../../capture-timeline/src/dom.ts";
import { errorText, type RecorderBackend } from "./backend.ts";
import { CHECK_LIMIT_MS, checkArguments, parseFinding, summarise, type Finding } from "./capturecheck.ts";
import { runOneShot, type RecorderController } from "./capturecontroller.ts";
import {
  describeSession, formatTime, MAX_COUNTDOWN, MAX_GAIN_DB, MIN_GAIN_DB, parseProbe, parseWindow, recordingFolderName, recordingPath, settingsProblem,
  type RecordSettings, type Session, type Source, type Target, type WindowChoice,
} from "./capturesession.ts";
import { recordingNameOf } from "./recordingfolder.ts";
import { describeQuick, quickSettings, type QuickRecord, type QuickState } from "./quickrecord.ts";
import { freshName } from "./settings.ts";
import { uiIcon, type UiIconName } from "./uiicons.gen.ts";
import { appStateWords, clockText } from "./shell.ts";
import { countText as recordingsCountText, detailsText, matchesSearch, sortRecordings, summarize, type RecordingSummary, type SortOrder } from "./library.ts";

export interface RecorderViewOptions {
  backend: RecorderBackend;
  controller: RecorderController;
  /** The recordings folder in use. */
  library: string;
  /** The choices as the author left them last time, and a way to keep them. */
  settings: RecordSettings;
  keepSettings: (s: RecordSettings) => void;
  /** Ask the author for another recordings folder. Resolves to the one chosen and kept, or null if they changed their mind. */
  chooseLibrary: () => Promise<string | null>;
  /** Open the editing screens on a recording, by its folder name. */
  editRecording: (name: string, newestTake?: boolean) => void;
  /** Say something through the app's own status line as well (a recording's news while another screen is open). */
  announce?: (message: string) => void;
  /** Quick record: one press to record with the choices made here, and a finished video and its path afterwards. Without it, the button is not offered. */
  quick?: QuickRecord;
  /** Where the recordings list, the settings (the folder and the computer check) and the status line go: the app's tabs. Without them, all of it goes on this screen. */
  hosts?: { recordings: HTMLElement; settings: HTMLElement; status: HTMLElement };
  /** Show another tab, from the cards beside the steps (and New recording on the Recordings tab). */
  showTab?: (tab: "record" | "recordings" | "settings") => void;
}

export interface RecorderView {
  readonly element: HTMLElement;
  /** Put the focus where the author will want it: the Start button, or the heading of a recording that is going. */
  focus(): void;
  /** The recordings folder has changed. */
  setLibrary(dir: string): Promise<void>;
  refreshRecordings(): Promise<void>;
  /** Start a quick recording with the choices as they stand. Returns why it could not be started, or null once it has begun. */
  startQuick(fromTray?: boolean): Promise<string | null>;
  destroy(): void;
}

export function mountRecorderView(host: HTMLElement, opts: RecorderViewOptions): RecorderView {
  const b = opts.backend;
  const c = opts.controller;
  let library = opts.library;
  const s: RecordSettings = { ...opts.settings, region: { ...opts.settings.region } };
  let sources: Source[] = [];
  let usable = false;
  let checking = false;
  let busyQuery = false;
  let existing: string[] = [];
  const uid = nextId("rv");
  const id = (name: string): string => `${uid}-${name}`;

  const root = h("div", { class: "rv" });
  // Each thing said is its own line in the status region, and the region announces what is added, not the whole of it again (aria-atomic is off).
  // So two things said at once, such as "take set aside" and "recording take 2", are both heard, in order, and neither replaces the other.
  // Lines stay for a second after the last one, then the next thing said starts the region afresh.
  const status = h("p", { id: id("status"), class: "rv-status", role: "status", "aria-atomic": "false" });
  let lastSaid = 0;
  const say = (messages: string[]): void => {
    const now = Date.now();
    if (messages.length === 0 || now - lastSaid > 1000) status.replaceChildren();
    lastSaid = now;
    for (const message of messages) if (message !== "") status.append(h("span", { class: "rv-said" }, message));
  };

  // ---- choices
  const name = h("input", { type: "text", id: id("name"), class: "os-cl-input", value: s.name, maxlength: "60" });
  const practice = h("input", { type: "checkbox", id: id("practice") });
  practice.checked = s.practice;
  // What to record, as three cards: each is a radio button with its words in its label, so the arrow keys move between them and a screen reader
  // hears "Entire screen, Everything on one screen, radio button, checked, 1 of 3". The tick and the outline show which is chosen, never colour alone.
  const TARGETS: { value: Target; title: string; detail: string; icon: UiIconName }[] = [
    { value: "screen", title: "Entire screen", detail: "Everything on one screen", icon: "monitor" },
    { value: "window", title: "One window", detail: "A single app", icon: "app-window" },
    { value: "region", title: "Part of a screen", detail: "An area you choose", icon: "square-dashed" },
  ];
  const targetRadios = TARGETS.map((t) => {
    const input = h("input", { type: "radio", name: id("target"), id: id(`target-${t.value}`), value: t.value, class: "rv-choice-input" });
    input.checked = s.target === t.value;
    const chosen = uiIcon(document, "check");
    chosen.classList.add("rv-choice-tick");
    const label = h("label", { for: id(`target-${t.value}`), class: "rv-choice" }, uiIcon(document, t.icon), h("span", { class: "rv-choice-title" }, t.title), " ", h("span", { class: "rv-choice-detail" }, t.detail), chosen);
    return { value: t.value, input, cell: h("div", { class: "rv-choice-cell" }, input, label) };
  });
  if (!targetRadios.some((r) => r.input.checked)) targetRadios[0]!.input.checked = true;
  const targetValue = (): Target => targetRadios.find((r) => r.input.checked)?.value ?? "screen";
  const display = h("select", { id: id("display"), class: "os-cl-input" });
  const windowSel = h("select", { id: id("window"), class: "os-cl-input" }, h("option", { value: "" }, "No window chosen yet"));
  const findWindows = h("button", { type: "button", class: "os-cl-button" }, "Look for windows");
  const pickWindow = h("button", { type: "button", class: "os-cl-button" }, "Pick a window by clicking it");
  const region = (key: string, label: string, value: string) => {
    const input = h("input", { type: "text", id: id(`region-${key}`), class: "os-cl-input", inputmode: "numeric", size: "6", value });
    return { input, field: h("div", { class: "os-cl-field os-cl-field-inline" }, h("label", { for: id(`region-${key}`) }, label), input) };
  };
  const left = region("left", "Pixels from the left of the screen", s.region.left);
  const top = region("top", "Pixels from the top of the screen", s.region.top);
  const width = region("width", "Width in pixels", s.region.width);
  const height = region("height", "Height in pixels", s.region.height);
  const microphone = h("select", { id: id("microphone"), class: "os-cl-input" });
  const output = h("select", { id: id("output"), class: "os-cl-input" });
  const camera = h("select", { id: id("camera"), class: "os-cl-input" });
  const gainBox = (key: string, value: number) =>
    h("input", { type: "number", id: id(key), class: "os-cl-input", min: String(MIN_GAIN_DB), max: String(MAX_GAIN_DB), step: "1", value: String(value) });
  const micGain = gainBox("micgain", s.micGainDb);
  const systemGain = gainBox("systemgain", s.systemGainDb);
  const countdown = h("input", { type: "number", id: id("countdown"), class: "os-cl-input", min: "0", max: String(MAX_COUNTDOWN), step: "1", value: String(s.countdownSeconds) });
  const sounds = h("input", { type: "checkbox", id: id("sounds") });
  sounds.checked = s.sounds;
  const noteMouse = h("input", { type: "checkbox", id: id("notemouse") });
  noteMouse.checked = s.interactions !== "off";
  const hideBox = h("input", { type: "text", id: id("hide"), class: "os-cl-input", maxlength: "400", value: s.hide, autocomplete: "off", spellcheck: "false" });

  const field = (fieldId: string, label: string, control: HTMLElement, extra: Node[] = []) =>
    h("div", { class: "os-cl-field" }, h("label", { for: fieldId }, label), h("div", { class: "rv-control" }, control, ...extra));

  function fillChoices(): void {
    const options = (kind: Source["kind"], first: [string, string][], current: string, select: HTMLSelectElement) => {
      const items = sources.filter((x) => x.kind === kind);
      select.replaceChildren(
        ...first.map(([value, text]) => h("option", { value }, text)),
        ...items.map((x) => h("option", { value: String(x.number) }, `${x.label}${x.isDefault ? " (the default)" : ""}`)),
      );
      if (select.options.length === 0 && kind === "display") select.append(h("option", { value: "1" }, "Screen 1"));
      const values = [...select.options].map((o) => o.value);
      select.value = values.includes(current) ? current : (values[0] ?? "");
    };
    options("display", [], String(s.display), display);
    options("microphone", [["default", "The default microphone"], ["none", "No microphone"]], s.microphone, microphone);
    options("output", [["default", "The default sound the computer plays"], ["none", "None of the computer's sound"]], s.output, output);
    options("camera", [["none", "No webcam"], ["default", "The first webcam"]], s.camera, camera);
  }

  function readSettings(): RecordSettings {
    return {
      name: name.value, practice: practice.checked, target: targetValue(), display: Number(display.value) || 1,
      window: windowSel.value, region: { left: left.input.value, top: top.input.value, width: width.input.value, height: height.input.value },
      microphone: microphone.value, output: output.value, camera: camera.value,
      micGainDb: micGain.value.trim() === "" ? Number.NaN : Number(micGain.value),
      systemGainDb: systemGain.value.trim() === "" ? Number.NaN : Number(systemGain.value),
      // The keys that are pressed are never noted from here: the mouse is, or nothing is.
      interactions: noteMouse.checked ? "no-keys" : "off",
      hide: hideBox.value,
      countdownSeconds: countdown.value.trim() === "" ? Number.NaN : Number(countdown.value), sounds: sounds.checked,
    };
  }

  const screenGroup = h("div", { class: "rv-sub" }, field(id("display"), "Which screen", display));
  const windowGroup = h("div", { class: "rv-sub" }, field(id("window"), "Which window", windowSel, [findWindows, document.createTextNode(" "), pickWindow]),
    h("p", { class: "rv-note" }, "Or press Pick a window by clicking it, then click the window you want. The click only chooses the window, and nothing in it is pressed. This window goes out of the way first, and comes back after. Press Escape to cancel."));
  const regionGroup = h("div", { class: "rv-sub" }, h("p", { class: "rv-note" }, "Choose which screen above, then the part of it, in pixels, counted from the top left corner. It must be at least 64 by 64."),
    h("div", { class: "os-cl-fields" }, left.field, top.field, width.field, height.field));
  /** A numbered step: a group named by its words (the number is only to look at). */
  const step = (n: number, legend: string, ...kids: Node[]) =>
    h("fieldset", { class: "rv-fieldset rv-step" }, h("legend", {}, h("span", { class: "rv-step-number", "aria-hidden": "true" }, String(n)), legend), ...kids);
  /** A card for a sound or the webcam: its icon, and the list of what to use, whose label is the card's title. */
  const device = (icon: UiIconName, fieldId: string, label: string, control: HTMLElement) =>
    h("div", { class: "rv-device" }, h("div", { class: "rv-device-head" }, uiIcon(document, icon), h("label", { for: fieldId }, label)), control);
  /** One of the choices most people leave alone: a section that opens and closes (a native disclosure, so Enter and Space open it and a screen reader hears whether it is open). */
  const more = (icon: UiIconName, title: string, ...kids: Node[]) =>
    h("details", { class: "rv-more" }, h("summary", {}, uiIcon(document, icon), h("span", { class: "rv-more-title" }, title)), h("div", { class: "rv-more-body" }, ...kids));
  const whatStep = step(1, "What to record",
    h("div", { class: "rv-choices", role: "radiogroup", "aria-label": "What to record" }, ...targetRadios.map((r) => r.cell)),
    screenGroup, windowGroup, regionGroup);
  const soundStep = step(2, "Sound, and a picture of you",
    h("div", { class: "rv-devices" },
      device("mic", id("microphone"), "Your voice", microphone),
      device("volume-2", id("output"), "The computer's own sound", output),
      device("webcam", id("camera"), "A webcam", camera)),
    h("p", { class: "rv-note" }, "A webcam, and your voice, are recorded only if you choose them. The computer's own sound includes a screen reader's speech."));
  const mouseMore = more("mouse-pointer-2", "The mouse",
    h("div", { class: "rv-check" }, noteMouse, " ", h("label", { for: id("notemouse") }, "Note where the mouse goes and where I click. This lets a video show a ring round the pointer, and lets the editor suggest zooms from your clicks.")),
    h("p", { class: "rv-note" }, "The notes stay inside the recording, on this computer, and are never published. They also say which window was in front and the name of what you clicked, which can give away private things such as the title of a page. The keys you press are never noted. Leave this off when you do not need it."));
  const hideMore = more("eye-off", "Windows to hide",
    field(id("hide"), "Hide windows with these words in their title or program name (separate several with semicolons, for example KeePass; Outlook)", hideBox),
    h("p", { class: "rv-note" }, "Wherever such a window is on the screen, the video has a plain dark box instead, and nothing of the window is kept. This is for recording a screen or part of one, not one window. The whole window is covered even where another window is in front of it, and a window that has only just opened can show for a moment. The notes of the mouse still name the window that is in front, and the sound and the webcam are not changed. Nothing is hidden from anyone looking at your screen while you record."));
  const balanceMore = more("sliders-horizontal", "Sound balance",
    field(id("micgain"), `Your voice in the video: louder or quieter, in decibels (${MIN_GAIN_DB} to ${MAX_GAIN_DB})`, micGain),
    field(id("systemgain"), `The computer's sound in the video: louder or quieter, in decibels (${MIN_GAIN_DB} to ${MAX_GAIN_DB})`, systemGain),
    h("p", { class: "rv-note" }, "0 leaves a sound as it is heard. A negative number makes it quieter: every 6 decibels is about half as loud, and 6 above is about twice as loud. If the recorder tells you, after a recording, that the computer's sound drowns your voice, put the number it gives in the computer's sound box for the next one. The separate sound files of the recording are never changed by this. When you edit the recording, these numbers are where each sound starts, and you can change them again there, under Sound balance."));
  // A section with something set in it is open, so nothing chosen is out of sight.
  mouseMore.open = noteMouse.checked;
  hideMore.open = hideBox.value.trim() !== "";
  balanceMore.open = (Number(micGain.value) || 0) !== 0 || (Number(systemGain.value) || 0) !== 0;
  const moreTitle = h("h3", { id: id("more-title") }, "More choices");
  const moreCard = h("section", { class: "rv-card", "aria-labelledby": id("more-title") }, moreTitle,
    h("p", { class: "rv-note" }, "Most recordings need none of these."), mouseMore, hideMore, balanceMore);
  const realGroup = h("div", { class: "rv-real" }, whatStep, soundStep);

  const problem = h("p", { id: id("problem"), class: "rv-note" });
  const start = h("button", { type: "button", id: id("start"), class: "os-cl-button rv-primary", "aria-describedby": id("problem") }, "Start recording");
  const quickNote = h("p", { id: id("quick-note"), class: "rv-note" });
  const quickBtn = h("button", { type: "button", id: id("quick"), class: "os-cl-button", "aria-describedby": id("quick-note"), hidden: opts.quick === undefined }, "Quick record");
  quickNote.hidden = opts.quick === undefined;
  start.prepend(uiIcon(document, "circle-dot"));
  quickBtn.prepend(uiIcon(document, "zap"));
  const setupTitle = h("h2", { id: id("setup-title") }, "Record");
  const startStep = step(3, "Name, and start",
    field(id("name"), "Name of the recording", name),
    h("div", { class: "rv-check" }, practice, " ", h("label", { for: id("practice") }, "Practice: try the controls with a made-up picture and sound. Nothing on your screen is recorded.")),
    h("div", { class: "rv-start-options" },
      field(id("countdown"), `Countdown, in seconds (0 to ${MAX_COUNTDOWN})`, countdown),
      h("div", { class: "rv-check" }, sounds, " ", h("label", { for: id("sounds") }, "Play a short sound for each step (the countdown, start, pause, resume and stop). Recommended for anyone who cannot see the screen. The sounds are never recorded."))),
    problem, h("div", { class: "rv-actions rv-start-row" }, start, quickBtn), quickNote);
  // ---- beside the steps: where recordings are kept, the choices most people leave alone, the recordings so far, and this computer
  const keptWhere = h("p", { class: "rv-note", id: id("kept") });
  const privacyCard = h("section", { class: "rv-card rv-privacy", "aria-labelledby": id("privacy-title") },
    h("h3", { id: id("privacy-title") }, uiIcon(document, "shield-check"), h("span", {}, "Recordings stay on this computer")),
    h("p", { class: "rv-note" }, "Nothing is sent anywhere, and there is no account. Your voice and a webcam are recorded only if you choose them."),
    keptWhere);
  const countText = h("p", { class: "rv-note", id: id("count") });
  const openRecordings = h("button", { type: "button", class: "os-cl-button" }, uiIcon(document, "film"), "Open your recordings");
  const recordingsCard = h("section", { class: "rv-card", "aria-labelledby": id("rc-title") }, h("h3", { id: id("rc-title") }, "Your recordings"), countText, h("div", { class: "rv-actions" }, openRecordings));
  const computerText = h("p", { class: "rv-note", id: id("computer") });
  const openSettings = h("button", { type: "button", class: "os-cl-button" }, uiIcon(document, "settings"), "Open Settings");
  const computerCard = h("section", { class: "rv-card", "aria-labelledby": id("pc-title") }, h("h3", { id: id("pc-title") }, "This computer"), computerText, h("div", { class: "rv-actions" }, openSettings));
  openRecordings.hidden = opts.showTab === undefined;
  openSettings.hidden = opts.showTab === undefined;
  openRecordings.addEventListener("click", () => opts.showTab?.("recordings"));
  openSettings.addEventListener("click", () => opts.showTab?.("settings"));
  const side = h("div", { class: "rv-side" }, privacyCard, moreCard, recordingsCard, computerCard);
  const setup = h("section", { class: "rv-section rv-setup", "aria-labelledby": id("setup-title") },
    h("div", { class: "rv-setup-head" }, setupTitle, h("p", { class: "rv-lead" }, "Choose what to record and whose sound, then start. Every choice is kept for next time.")),
    h("div", { class: "rv-setup-grid" }, h("div", { class: "rv-steps" }, realGroup, startStep), side));

  // ---- the recording as it goes
  const liveTitle = h("h2", { id: id("live-title"), tabindex: "-1" }, "Recording");
  const now = h("p", { id: id("now"), class: "rv-now" });
  // The time, large, as a clock: only to look at. A screen reader has the sentence under it, and the status line says each change once,
  // never the seconds as they pass.
  const clock = h("p", { class: "rv-clock", "aria-hidden": "true" }, "00:00:00");
  const liveWord = h("span", { class: "rv-live-word" });
  const liveChip = h("p", { class: "rv-live-chip", "aria-hidden": "true" }, h("span", { class: "rv-live-dot" }), liveWord);
  // Said as soon as the recording heading is reached, so nobody mistakes the preview for the real thing.
  const pretendLive = h("p", { class: "rv-pretend" }, "This is a pretend recording. Nothing is being recorded, and nothing will be saved on your computer. To record for real, open the app with OPEN RECORDER.bat.");
  pretendLive.hidden = !b.preview;
  const pause = h("button", { type: "button", class: "os-cl-button" }, uiIcon(document, "pause"), "Pause");
  const stop = h("button", { type: "button", class: "os-cl-button rv-primary" }, uiIcon(document, "square"), "Stop");
  const again = h("button", { type: "button", class: "os-cl-button" }, uiIcon(document, "rotate-ccw"), "Start again");
  const markerLabel = h("input", { type: "text", id: id("marker"), class: "os-cl-input", maxlength: "120" });
  const addMarker = h("button", { type: "button", class: "os-cl-button" }, uiIcon(document, "bookmark-plus"), "Add a marker");
  const markers = h("ul", { class: "rv-list", "aria-label": "Markers" });
  const notes = h("ul", { class: "rv-list", "aria-label": "What the recorder said" });
  const where = h("p", { id: id("where") });
  const show = h("button", { type: "button", class: "os-cl-button" }, uiIcon(document, "folder-open"), "Show the recording in its folder");
  const done = h("button", { type: "button", class: "os-cl-button" }, uiIcon(document, "circle-check"), "Done");
  const editNow = h("button", { type: "button", class: "os-cl-button rv-primary" }, uiIcon(document, "scissors"), "Edit the recording I just made");
  const doneRow = h("div", { class: "rv-actions" }, editNow, show, done);
  // ---- a quick recording: what is happening to it, and the path of the finished video
  const quickTitle = h("h3", { id: id("quick-title") }, "Quick recording");
  const quickSay = h("p", { id: id("quick-message") });
  const quickPath = h("input", { type: "text", id: id("quick-path"), class: "os-cl-input rv-path", readonly: "", spellcheck: "false", autocomplete: "off" });
  const quickPathField = h("div", { class: "os-cl-field" }, h("label", { for: id("quick-path") }, "Path of the finished video"), h("div", { class: "rv-control" }, quickPath));
  const copyPath = h("button", { type: "button", class: "os-cl-button rv-primary" }, uiIcon(document, "clipboard-copy"), "Copy the path");
  const showVideo = h("button", { type: "button", class: "os-cl-button" }, uiIcon(document, "folder-open"), "Show the video in its folder");
  const quickBox = h("section", { class: "rv-section rv-quick", "aria-labelledby": id("quick-title"), hidden: true }, quickTitle, quickSay, quickPathField, h("div", { class: "rv-actions" }, copyPath, showVideo));
  const controls = h("div", { class: "rv-actions rv-live-controls" }, pause, stop, again);
  const markerRow = h("div", { class: "os-cl-field rv-marker-row" }, h("label", { for: id("marker") }, "Words for a marker (optional)"), h("div", { class: "rv-control" }, markerLabel, " ", addMarker));
  const live = h("section", { class: "rv-section rv-live", "aria-labelledby": id("live-title"), hidden: true },
    h("div", { class: "rv-live-head" }, liveTitle, liveChip),
    pretendLive,
    h("div", { class: "rv-live-top" }, h("div", { class: "rv-live-time" }, clock, now), controls),
    quickBox, markerRow,
    h("div", { class: "rv-live-cards" },
      h("div", { class: "rv-card" }, h("h3", {}, uiIcon(document, "bookmark-plus"), h("span", {}, "Markers")), markers),
      h("div", { class: "rv-card" }, h("h3", {}, uiIcon(document, "list-checks"), h("span", {}, "What the recorder said")), notes)),
    where, doneRow);

  // ---- the recordings already made
  const folderText = h("p", { id: id("folder") });
  // The recordings, as the design specification's mockup R03 has them: a card for each, with its length, its takes and when it was made, read
  // from its own files (library.ts), an Edit button and a Show in its folder button, each named after the recording; a search and an order.
  const changeFolder = h("button", { type: "button", class: "os-cl-button" }, "Choose another recordings folder");
  const recSearch = h("input", { type: "search", id: id("rec-search"), class: "os-cl-input", autocomplete: "off", spellcheck: "false", placeholder: "Words from its name" });
  const recSort = h("select", { id: id("rec-sort"), class: "os-cl-input" },
    h("option", { value: "newest" }, "Newest first"), h("option", { value: "oldest" }, "Oldest first"), h("option", { value: "name" }, "A to Z"));
  const recCount = h("p", { id: id("rec-count"), class: "rv-note" });
  const recList = h("ul", { class: "rv-rec-list", role: "list", "aria-labelledby": id("recordings-title") });
  const newRecording = h("button", { type: "button", class: "os-cl-button rv-primary" }, uiIcon(document, "circle-dot"), "New recording");
  newRecording.hidden = opts.showTab === undefined;
  newRecording.addEventListener("click", () => { opts.showTab?.("record"); start.focus(); });
  const recordingsTitle = h("h2", { id: id("recordings-title") }, "Your recordings");
  const recordingsBox = h("section", { class: "rv-section rv-recordings", "aria-labelledby": id("recordings-title") },
    h("div", { class: "rv-rec-head" }, h("div", {}, recordingsTitle, h("p", { class: "rv-lead" }, "Everything is kept on this computer. Edit a recording to trim it, hide parts of it and make a video.")), newRecording),
    h("div", { class: "rv-rec-tools" },
      h("div", { class: "os-cl-field" }, h("label", { for: id("rec-search") }, "Find a recording"), recSearch),
      h("div", { class: "os-cl-field" }, h("label", { for: id("rec-sort") }, "Order"), recSort)),
    recCount, recList);
  let summaries: RecordingSummary[] = [];
  const editRecordingNamed = (recording: string): void => {
    if (c.busy) { say(["A recording is going. Wait until it is finished, then edit."]); return; }
    opts.editRecording(recording);
  };
  /** Draw the cards for the recordings read, in the order chosen and fitting the search. Focus stays on the button it was on. */
  function drawRecordings(): void {
    const focusKey = recList.contains(document.activeElement) ? (document.activeElement as HTMLElement).dataset["key"] ?? "" : "";
    const now = new Date();
    const shown = sortRecordings(summaries, recSort.value as SortOrder).filter((s) => matchesSearch(s, recSearch.value));
    recCount.textContent = recordingsCountText(shown.length, summaries.length, recSearch.value);
    recList.replaceChildren(...shown.map((s) => {
      const nameId = `${id("rec")}-${encodeURIComponent(s.name).replace(/[^A-Za-z0-9-]/g, "_")}`;
      const edit = h("button", { type: "button", class: "os-cl-button rv-primary", "aria-label": `Edit ${s.title}`, "data-key": `rec-edit:${s.name}` }, uiIcon(document, "scissors"), "Edit");
      const reveal = h("button", { type: "button", class: "os-cl-button rv-icon-button", "aria-label": `Show ${s.title} in its folder`, title: "Show in its folder", "data-key": `rec-show:${s.name}` }, uiIcon(document, "folder-open"));
      edit.addEventListener("click", () => editRecordingNamed(s.name));
      reveal.addEventListener("click", () => reveal_(s.name));
      return h("li", { class: "rv-rec-card", "aria-labelledby": nameId },
        h("div", { class: "rv-rec-picture", "aria-hidden": "true" }, uiIcon(document, "film")),
        h("div", { class: "rv-rec-body" },
          h("h3", { class: "rv-rec-name", id: nameId }, s.title),
          h("p", { class: "rv-rec-details" }, detailsText(s, now)),
          h("p", { class: `rv-rec-badge${s.edited ? " is-edited" : ""}` }, s.edited ? "Edited" : "Not edited yet")),
        h("div", { class: "rv-rec-actions" }, edit, reveal));
    }));
    if (focusKey !== "") [...recList.querySelectorAll<HTMLElement>("[data-key]")].find((el) => el.dataset["key"] === focusKey)?.focus();
  }
  recSearch.addEventListener("input", drawRecordings);
  recSort.addEventListener("change", drawRecordings);
  /** Read what each recording is from its own files. A file that cannot be read is said on its card; nothing is written. */
  async function readSummary(recording: string): Promise<RecordingSummary> {
    const read = (rel: string) => b.recordingRead(library, recording, rel).catch(() => undefined);
    const takes = await b.recordingFolders(library, recording, "takes").catch(() => [] as string[]);
    const [captureText, editText, ...takeTexts] = await Promise.all([read("capture.json"), read("edit.json"), ...takes.map((t) => read(`takes/${t}/take.json`))]);
    return summarize(recording, captureText, takeTexts, editText);
  }
  changeFolder.prepend(uiIcon(document, "folder-input"));
  const folderTitle = h("h2", { id: id("folder-title") }, "Where recordings are kept");
  const folderBox = h("section", { class: "rv-section", "aria-labelledby": id("folder-title") }, folderTitle, folderText, h("div", { class: "rv-actions" }, changeFolder));

  // ---- the check
  const found = h("p", { id: id("found") });
  const check = h("button", { type: "button", class: "os-cl-button", "aria-describedby": id("found") }, "Check this computer");
  const findings: Finding[] = [];
  const list = h("ul", { class: "rv-list", "aria-label": "What the check found" });
  const checkTitle = h("h2", { id: id("check-title") }, "Is this computer ready to record?");
  const checkBox = h("section", { class: "rv-section", "aria-labelledby": id("check-title") }, checkTitle, found, h("div", { class: "rv-actions" }, check), list);

  async function refreshRecordings(): Promise<void> {
    const names = await b.listRecordings(library).catch(() => [] as string[]);
    existing = names;
    summaries = await Promise.all(names.map(readSummary));
    drawRecordings();
    countText.textContent = names.length === 0 ? "Nothing has been recorded in this folder yet." : `${names.length} ${names.length === 1 ? "recording" : "recordings"} in this folder.`;
    showSetup();
  }

  function reveal_(recording: string): void {
    void b.revealRecording(library, recording, "").catch((err: unknown) => say([`Could not show the folder. ${errorText(err)}`]));
  }

  function showFolder(): void {
    // The preview keeps nothing on the disk, so it must not say "kept in" as if it did.
    folderText.textContent =
      library === "" ? "No recordings folder is chosen yet."
      : b.preview ? `This preview keeps only pretend recordings, inside this page, until you close it. The real app keeps recordings in: ${library}`
      : `Recordings are kept in: ${library}`;
    keptWhere.textContent = library === "" ? "No recordings folder is chosen yet." : b.preview ? "This preview keeps pretend recordings only, inside this page." : `In ${library}`;
  }

  // ---- showing the state
  function ready(): string | null {
    if (library === "") return "Choose a recordings folder first, with the button under Your recordings.";
    if (!usable) return "The recording program was not found, so nothing can be recorded, not even a practice. See the message under the check.";
    return settingsProblem(readSettings());
  }

  /** Why a quick recording cannot start now, or an empty text. The name is not asked for: it is made. */
  function quickProblem(): string {
    if (library === "") return "Choose a recordings folder first, with the button under Your recordings.";
    if (!usable) return "The recording program was not found, so nothing can be recorded. See the message under the check.";
    return settingsProblem(quickSettings(readSettings(), "Quick recording")) ?? "";
  }

  function showSetup(): void {
    const isPractice = practice.checked;
    realGroup.hidden = isPractice;
    moreCard.hidden = isPractice;
    const chosen = targetValue();
    screenGroup.hidden = chosen !== "screen" && chosen !== "region";
    windowGroup.hidden = chosen !== "window";
    regionGroup.hidden = chosen !== "region";
    const why = busyQuery ? "Looking at what this computer has." : (ready() ?? "");
    const again = existing.includes(recordingFolderName(name.value)) ? `A recording called ${name.value.trim()} already exists. Recording again adds another take to it. Change the name to start a new recording.` : "";
    problem.textContent = why !== "" ? why : again;
    start.setAttribute("aria-disabled", why === "" ? "false" : "true");
    if (why === "") start.removeAttribute("aria-disabled");
    if (opts.quick !== undefined) {
      const quickWhy = busyQuery ? why : quickProblem();
      quickNote.textContent = quickWhy !== "" ? quickWhy : describeQuick(readSettings());
      if (quickWhy === "") quickBtn.removeAttribute("aria-disabled");
      else quickBtn.setAttribute("aria-disabled", "true");
    }
  }

  function showSession(session: Session): void {
    const idle = session.phase === "idle";
    const over = session.phase === "finished" || session.phase === "failed";
    live.hidden = idle;
    setup.hidden = !idle;
    now.textContent = describeSession(session);
    const paused = session.phase === "paused";
    pause.replaceChildren(uiIcon(document, paused ? "play" : "pause"), paused ? "Resume" : "Pause");
    clock.textContent = clockText(session.phase === "finished" && session.result ? session.result.durationMs : session.elapsedMs);
    clock.hidden = session.phase === "failed";
    liveWord.textContent = appStateWords(session.phase, "idle");
    live.dataset["phase"] = session.phase;
    controls.hidden = over;
    markerRow.hidden = over;
    doneRow.hidden = !over;
    show.hidden = session.phase !== "finished" || session.folder === "";
    editNow.hidden = show.hidden;
    liveTitle.textContent = session.phase === "finished" ? "Finished" : session.phase === "failed" ? "The recording did not finish" : "Recording";
    markers.replaceChildren(...session.markers.map((m) => h("li", {}, `${formatTime(m.elapsedMs)}${m.label ? `: ${m.label}` : ""}`)));
    notes.replaceChildren(...session.notes.map((n) => h("li", {}, h("strong", { class: n.ok ? "rv-pass" : "rv-problem" }, n.ok ? "Note. " : "Problem. "), h("span", {}, n.text))));
    const asideWords = session.setAside > 0 ? `. ${session.setAside} earlier ${session.setAside === 1 ? "take was" : "takes were"} set aside, not erased.` : "";
    where.textContent =
      session.folder === "" ? ""
      : b.preview ? `This is a pretend recording. Nothing is kept on your computer: it stays inside this page until you close it. The real app would keep it in: ${session.folder}${asideWords}`
      : `Kept in: ${session.folder}${asideWords}`;
  }

  function showQuick(state: QuickState): void {
    const active = state.phase !== "idle";
    quickBox.hidden = !active;
    quickSay.textContent = state.message;
    quickPath.value = state.video;
    quickPathField.hidden = state.video === "";
    copyPath.hidden = state.video === "";
    showVideo.hidden = state.video === "";
    // A quick recording is told about by its own box; the plain Edit and Show buttons of a finished recording stay for the recording itself.
  }

  let quickPhase: QuickState["phase"] = opts.quick?.state.phase ?? "idle";
  const unsubscribeQuick = opts.quick?.subscribe((state, messages) => {
    const before = quickPhase;
    quickPhase = state.phase;
    showQuick(state);
    if (messages.length > 0) {
      say(messages);
      opts.announce?.(messages.join(" "));
    }
    // The next thing to do is on the video's path: when the video is ready the focus goes to its Copy button, as the editing screen does for Show the video.
    if (state.phase === "ready" && before !== "ready") copyPath.focus();
  });

  const unsubscribe = c.subscribe((session, messages) => {
    showSession(session);
    if (messages.length > 0) {
      say(messages);
      opts.announce?.(messages.join(" "));
    }
    if (session.phase === "finished") void refreshRecordings();
  });

  // ---- what the author does
  start.addEventListener("click", async () => {
    if (start.getAttribute("aria-disabled") === "true") {
      say([problem.textContent || "Something needs a choice first."]);
      return;
    }
    const chosen = readSettings();
    opts.keepSettings(chosen);
    try {
      await b.ensureLibrary(library);
    } catch (err) {
      say([`The recordings folder could not be used. ${errorText(err)}`]);
      return;
    }
    const message = await c.start(chosen, recordingPath(library, chosen.name));
    if (message !== null) {
      say([message]);
      return;
    }
    liveTitle.focus();
  });
  async function startQuick(fromTray = false): Promise<string | null> {
    const quick = opts.quick;
    if (quick === undefined) return "Quick record is not available here.";
    if (c.busy || quick.busy) return "A recording is already going.";
    const why = quickProblem();
    if (why !== "") return why;
    const chosen = readSettings();
    opts.keepSettings(chosen);
    return quick.start(chosen, existing, fromTray);
  }
  quickBtn.addEventListener("click", async () => {
    if (quickBtn.getAttribute("aria-disabled") === "true") {
      say([quickNote.textContent || "Something needs a choice first."]);
      return;
    }
    const message = await startQuick(false);
    if (message !== null) {
      say([message]);
      return;
    }
    liveTitle.focus();
  });
  copyPath.addEventListener("click", async () => {
    const ok = (await opts.quick?.copyPath()) === true;
    say([ok ? "The path is copied." : "The path could not be copied. Select it in the box above and copy it."]);
  });
  showVideo.addEventListener("click", () => {
    const state = opts.quick?.state;
    if (state === undefined || state.recording === "") return;
    void b.revealRecording(library, state.recording, state.videoRel).catch((err: unknown) => say([`Could not show the folder. ${errorText(err)}`]));
  });
  pause.addEventListener("click", () => void c.togglePause());
  stop.addEventListener("click", () => void c.act("stop"));
  again.addEventListener("click", () => void c.act("restart"));
  addMarker.addEventListener("click", async () => {
    await c.marker(markerLabel.value);
    markerLabel.value = "";
    markerLabel.focus();
  });
  markerLabel.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addMarker.click();
    }
  });
  done.addEventListener("click", () => {
    c.dismiss();
    opts.quick?.dismiss();
    name.value = freshName();
    say([]);
    showSetup();
    start.focus();
  });
  editNow.addEventListener("click", () => {
    if (c.busy) return;
    opts.editRecording(recordingNameOf(c.session.folder), true);
  });
  show.addEventListener("click", () => reveal_(recordingNameOf(c.session.folder)));
  changeFolder.addEventListener("click", async () => {
    if (c.busy) { say(["A recording is going. Wait until it is finished, then choose another folder."]); return; }
    const chosen = await opts.chooseLibrary();
    if (chosen === null) { say(["The recordings folder was not changed."]); changeFolder.focus(); return; }
    await view.setLibrary(chosen);
    say([`Recordings are now kept in ${chosen}.`]);
    changeFolder.focus();
  });
  for (const el of [name, practice, ...targetRadios.map((r) => r.input), display, windowSel, microphone, output, camera, micGain, systemGain, countdown, sounds, noteMouse, hideBox, left.input, top.input, width.input, height.input]) {
    el.addEventListener("input", showSetup);
    el.addEventListener("change", showSetup);
  }

  async function lookForWindows(): Promise<void> {
    if (busyQuery || !usable) { say([usable ? "Already looking." : "The recording program was not found."]); return; }
    busyQuery = true;
    findWindows.setAttribute("aria-disabled", "true");
    say(["Looking for windows."]);
    showSetup();
    const listed: WindowChoice[] = [];
    const job = await runOneShot(b, ["windows"], (line) => { const w = parseWindow(line); if (w) listed.push(w); });
    busyQuery = false;
    findWindows.removeAttribute("aria-disabled");
    windowSel.replaceChildren(h("option", { value: "" }, listed.length > 0 ? "Choose a window" : "No window chosen yet"), ...listed.map((w) => h("option", { value: w.title }, w.label)));
    say([listed.length > 0 ? `Found ${listed.length} ${listed.length === 1 ? "window" : "windows"}. Choose one.` : job.problem !== "" ? `Could not list the windows. ${job.problem}` : "No window can be recorded right now."]);
    showSetup();
    if (listed.length > 0) windowSel.focus();
  }
  findWindows.addEventListener("click", () => { if (findWindows.getAttribute("aria-disabled") !== "true") void lookForWindows(); });

  /** Choose the window by clicking it: the recorder waits for the click, this window steps aside, and what it says is the chosen window (or why none). */
  async function pickByClicking(): Promise<void> {
    if (busyQuery || !usable || c.busy) { say([c.busy ? "A recording is going, so a window cannot be picked now." : usable ? "Already looking." : "The recording program was not found."]); return; }
    busyQuery = true;
    pickWindow.setAttribute("aria-disabled", "true");
    findWindows.setAttribute("aria-disabled", "true");
    say(["Click the window you want to record. This window goes out of the way first. Press Escape to cancel."]);
    showSetup();
    const chosen: WindowChoice[] = [];
    let why = "";
    await b.windowMinimize().catch(() => undefined);
    const job = await runOneShot(b, ["pick-window", "--timeout-ms", "30000"], (line) => {
      const w = parseWindow(line);
      if (w) chosen.push(w);
      const f = parseFinding(line);
      if (f && f.check === "window-chosen" && !f.ok) why = f.message;
    }, 45_000);
    await b.windowRestore().catch(() => undefined);
    busyQuery = false;
    pickWindow.removeAttribute("aria-disabled");
    findWindows.removeAttribute("aria-disabled");
    const picked = chosen[0];
    if (picked !== undefined) {
      if (![...windowSel.options].some((o) => o.value === picked.title)) windowSel.append(h("option", { value: picked.title }, picked.label));
      windowSel.value = picked.title;
      say([`Chosen: ${picked.label}.`]);
      showSetup();
      windowSel.focus();
      return;
    }
    say([why !== "" ? why : job.problem !== "" ? `No window was chosen. ${job.problem}` : "No window was chosen."]);
    showSetup();
    pickWindow.focus();
  }
  pickWindow.addEventListener("click", () => { if (pickWindow.getAttribute("aria-disabled") !== "true") void pickByClicking(); });

  async function runCheck(): Promise<void> {
    if (!usable || checking || c.busy) { say([c.busy ? "A recording is going, so the check waits until it is over." : "The recording program was not found."]); return; }
    checking = true;
    findings.length = 0;
    list.replaceChildren();
    check.textContent = "Checking...";
    check.setAttribute("aria-disabled", "true");
    say(["Checking this computer. This takes a few seconds."]);
    await b.ensureLibrary(library).catch(() => undefined);
    const job = await runOneShot(b, checkArguments(library === "" ? null : library), (line) => {
      const f = parseFinding(line);
      if (f && findings.length < 100) {
        findings.push(f);
        list.replaceChildren(...findings.map((x) => h("li", {}, h("strong", { class: x.ok ? "rv-pass" : "rv-problem" }, x.ok ? "Passed. " : "Problem. "), h("span", {}, `${x.label}: ${x.message}`))));
      }
    }, CHECK_LIMIT_MS);
    checking = false;
    check.textContent = "Check this computer";
    check.removeAttribute("aria-disabled");
    const summary = summarise(findings, job.exit);
    say([job.problem === "" ? summary.sentence : `${summary.sentence} ${job.problem}`]);
  }
  check.addEventListener("click", () => { if (check.getAttribute("aria-disabled") !== "true") void runCheck(); });

  if (opts.hosts) {
    // The app's tabs: this screen is Record; the recordings and the settings have tabs of their own; the status line is above them all.
    root.append(live, setup);
    host.replaceChildren(root);
    opts.hosts.status.replaceChildren(status);
    opts.hosts.recordings.replaceChildren(recordingsBox);
    opts.hosts.settings.replaceChildren(folderBox, checkBox);
  } else {
    root.append(status, live, setup, recordingsBox, folderBox, checkBox);
    host.replaceChildren(root);
  }
  try {
    fillChoices();
  } catch (err) {
    say([`The lists of screens and devices could not be filled in. ${errorText(err)}`]);
  }
  showFolder();
  showSession(c.session);
  if (opts.quick !== undefined) showQuick(opts.quick.state);
  showSetup();
  found.textContent = "Looking for the recording program...";
  computerText.textContent = "Looking for the recording program...";
  check.setAttribute("aria-disabled", "true");
  void refreshRecordings();

  void (async () => {
    const located = await b.captureCheck().catch((err: unknown) => ({ ok: false as const, message: `Could not look for the recording program. ${errorText(err)}` }));
    usable = located.ok;
    found.textContent = located.ok ? `The recording program was found: ${located.path}` : located.message;
    computerText.textContent = located.ok ? "The recording program is here. Settings has a check that the screen, the sound and the folder all work." : located.message;
    if (located.ok && !checking) check.removeAttribute("aria-disabled");
    if (located.ok && !c.busy) {
      const job = await runOneShot(b, ["probe"], (line) => { sources = sources.concat(parseProbe(line)); });
      if (job.problem === "" || sources.length > 0) {
        try { fillChoices(); } catch (err) { say([`The lists of screens and devices could not be filled in. ${errorText(err)}`]); }
      }
    }
    showSetup();
  })();

  const view: RecorderView = {
    element: root,
    focus: () => (c.busy || c.session.phase !== "idle" ? liveTitle : start).focus(),
    async setLibrary(dir) {
      library = dir;
      showFolder();
      await refreshRecordings();
    },
    refreshRecordings,
    startQuick,
    destroy() {
      unsubscribe();
      unsubscribeQuick?.();
      opts.keepSettings(readSettings());
      root.remove();
    },
  };
  return view;
}
