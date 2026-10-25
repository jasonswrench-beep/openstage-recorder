// SPDX-License-Identifier: Apache-2.0
// The Record screen: choose what to record and how, start it, and control it while it goes on (pause, resume, stop, start again, add a marker).
//
// What the recorder does is held by the RecorderController (capturecontroller.ts), not by this screen, so a recording goes on whatever is
// shown, and the screen shows it again when it comes back. Every state is a sentence, and the sentences that matter are spoken through a
// status region. The recorder also has keys that work from any program, because the author is looking at another program while they record.
//
// This is a page, not a pop-up: nothing traps the keyboard. It is OpenStage Author's recorder dialog (editor/src/recorderdialog.ts there)
// without the course, the steps and the interaction notes, and with a recordings folder of the author's choice instead of a course folder.

import { h, nextId } from "../../capture-timeline/src/dom.ts";
import { errorText, type RecorderBackend } from "./backend.ts";
import { CHECK_LIMIT_MS, checkArguments, parseFinding, summarise, type Finding } from "./capturecheck.ts";
import { runOneShot, type RecorderController } from "./capturecontroller.ts";
import {
  describeSession, formatTime, MAX_COUNTDOWN, MAX_GAIN_DB, MIN_GAIN_DB, parseProbe, parseWindow, recordingFolderName, recordingPath, settingsProblem,
  type RecordSettings, type Session, type Source, type Target, type WindowChoice,
} from "./capturesession.ts";
import { recordingNameOf } from "./recordingfolder.ts";
import { freshName } from "./settings.ts";

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
}

export interface RecorderView {
  readonly element: HTMLElement;
  /** Put the focus where the author will want it: the Start button, or the heading of a recording that is going. */
  focus(): void;
  /** The recordings folder has changed. */
  setLibrary(dir: string): Promise<void>;
  refreshRecordings(): Promise<void>;
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
  const target = h("select", { id: id("target"), class: "os-cl-input" },
    h("option", { value: "screen" }, "A whole screen"), h("option", { value: "window" }, "One window (an app)"), h("option", { value: "region" }, "Part of a screen"));
  target.value = s.target;
  const display = h("select", { id: id("display"), class: "os-cl-input" });
  const windowSel = h("select", { id: id("window"), class: "os-cl-input" }, h("option", { value: "" }, "No window chosen yet"));
  const findWindows = h("button", { type: "button", class: "os-cl-button" }, "Look for windows");
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
      name: name.value, practice: practice.checked, target: target.value as Target, display: Number(display.value) || 1,
      window: windowSel.value, region: { left: left.input.value, top: top.input.value, width: width.input.value, height: height.input.value },
      microphone: microphone.value, output: output.value, camera: camera.value,
      micGainDb: micGain.value.trim() === "" ? Number.NaN : Number(micGain.value),
      systemGainDb: systemGain.value.trim() === "" ? Number.NaN : Number(systemGain.value),
      // Noting the mouse is for highlighting the cursor, which is not built yet, so it is never switched on from here.
      interactions: "off",
      countdownSeconds: countdown.value.trim() === "" ? Number.NaN : Number(countdown.value), sounds: sounds.checked,
    };
  }

  const screenGroup = h("div", {}, field(id("display"), "Which screen", display));
  const windowGroup = h("div", {}, field(id("window"), "Which window", windowSel, [findWindows]));
  const regionGroup = h("div", {}, h("p", { class: "rv-note" }, "Choose which screen above, then the part of it, in pixels, counted from the top left corner. It must be at least 64 by 64."),
    h("div", { class: "os-cl-fields" }, left.field, top.field, width.field, height.field));
  const realGroup = h("div", {},
    h("fieldset", { class: "rv-fieldset" }, h("legend", {}, "What to record"), field(id("target"), "Record", target), screenGroup, windowGroup, regionGroup),
    h("fieldset", { class: "rv-fieldset" }, h("legend", {}, "Sound, and a picture of you"),
      field(id("microphone"), "Your voice", microphone), field(id("output"), "The computer's own sound", output), field(id("camera"), "A webcam", camera),
      h("p", { class: "rv-note" }, "A webcam, and your voice, are recorded only if you choose them. The computer's own sound includes a screen reader's speech."),
      field(id("micgain"), `Your voice in the video: louder or quieter, in decibels (${MIN_GAIN_DB} to ${MAX_GAIN_DB})`, micGain),
      field(id("systemgain"), `The computer's sound in the video: louder or quieter, in decibels (${MIN_GAIN_DB} to ${MAX_GAIN_DB})`, systemGain),
      h("p", { class: "rv-note" }, "0 leaves a sound as it is heard. A negative number makes it quieter: every 6 decibels is about half as loud, and 6 above is about twice as loud. If the recorder tells you, after a recording, that the computer's sound drowns your voice, put the number it gives in the computer's sound box for the next one. The separate sound files of the recording are never changed by this. When you edit the recording, these numbers are where each sound starts, and you can change them again there, under Sound balance.")));

  const problem = h("p", { id: id("problem"), class: "rv-note" });
  const start = h("button", { type: "button", id: id("start"), class: "os-cl-button rv-primary", "aria-describedby": id("problem") }, "Start recording");
  const setupTitle = h("h2", { id: id("setup-title") }, "Record");
  const setup = h("section", { class: "rv-section", "aria-labelledby": id("setup-title") },
    setupTitle,
    field(id("name"), "Name of the recording", name),
    h("div", { class: "rv-check" }, practice, " ", h("label", { for: id("practice") }, "Practice: try the controls with a made-up picture and sound. Nothing on your screen is recorded.")),
    realGroup,
    h("fieldset", { class: "rv-fieldset" }, h("legend", {}, "Starting"),
      field(id("countdown"), `Countdown, in seconds (0 to ${MAX_COUNTDOWN})`, countdown),
      h("div", { class: "rv-check" }, sounds, " ", h("label", { for: id("sounds") }, "Play a short sound for each step (the countdown, start, pause, resume and stop). Recommended for anyone who cannot see the screen. The sounds are never recorded."))),
    problem, h("div", { class: "rv-actions" }, start));

  // ---- the recording as it goes
  const liveTitle = h("h2", { id: id("live-title"), tabindex: "-1" }, "Recording");
  const now = h("p", { id: id("now") });
  // Said as soon as the recording heading is reached, so nobody mistakes the preview for the real thing.
  const pretendLive = h("p", { class: "rv-pretend" }, "This is a pretend recording. Nothing is being recorded, and nothing will be saved on your computer. To record for real, open the app with OPEN RECORDER.bat.");
  pretendLive.hidden = !b.preview;
  const pause = h("button", { type: "button", class: "os-cl-button" }, "Pause");
  const stop = h("button", { type: "button", class: "os-cl-button" }, "Stop");
  const again = h("button", { type: "button", class: "os-cl-button" }, "Start again");
  const markerLabel = h("input", { type: "text", id: id("marker"), class: "os-cl-input", maxlength: "120" });
  const addMarker = h("button", { type: "button", class: "os-cl-button" }, "Add a marker");
  const markers = h("ul", { class: "rv-list", "aria-label": "Markers" });
  const notes = h("ul", { class: "rv-list", "aria-label": "What the recorder said" });
  const where = h("p", { id: id("where") });
  const show = h("button", { type: "button", class: "os-cl-button" }, "Show the recording in its folder");
  const done = h("button", { type: "button", class: "os-cl-button" }, "Done");
  const editNow = h("button", { type: "button", class: "os-cl-button rv-primary" }, "Edit the recording I just made");
  const doneRow = h("div", { class: "rv-actions" }, editNow, show, done);
  const controls = h("div", { class: "rv-actions" }, pause, stop, again);
  const markerRow = h("div", { class: "os-cl-field" }, h("label", { for: id("marker") }, "Words for a marker (optional)"), h("div", { class: "rv-control" }, markerLabel, " ", addMarker));
  const live = h("section", { class: "rv-section", "aria-labelledby": id("live-title"), hidden: true }, liveTitle, pretendLive, now, controls, markerRow,
    h("h3", {}, "Markers"), markers, h("h3", {}, "What the recorder said"), notes, where, doneRow);

  // ---- the recordings already made
  const folderText = h("p", { id: id("folder") });
  const recordingsSel = h("select", { id: id("recordings"), class: "os-cl-input" });
  const editBtn = h("button", { type: "button", class: "os-cl-button" }, "Edit this recording");
  const revealBtn = h("button", { type: "button", class: "os-cl-button" }, "Show this recording in its folder");
  const changeFolder = h("button", { type: "button", class: "os-cl-button" }, "Choose another recordings folder");
  const noRecordings = h("p", { class: "rv-note" }, "Nothing has been recorded in this folder yet.");
  const recordingsPick = h("div", { hidden: true }, field(id("recordings"), "Recording", recordingsSel), h("div", { class: "rv-actions" }, editBtn, revealBtn));
  const recordingsTitle = h("h2", { id: id("recordings-title") }, "Your recordings");
  const recordingsBox = h("section", { class: "rv-section", "aria-labelledby": id("recordings-title") },
    recordingsTitle, folderText, noRecordings, recordingsPick, h("div", { class: "rv-actions" }, changeFolder));

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
    const keep = recordingsSel.value;
    recordingsSel.replaceChildren(...names.map((n) => h("option", { value: n }, n.replace(/\.capture$/, ""))));
    if (names.includes(keep)) recordingsSel.value = keep;
    recordingsPick.hidden = names.length === 0;
    noRecordings.hidden = names.length > 0;
    showSetup();
  }

  function showFolder(): void {
    // The preview keeps nothing on the disk, so it must not say "kept in" as if it did.
    folderText.textContent =
      library === "" ? "No recordings folder is chosen yet."
      : b.preview ? `This preview keeps only pretend recordings, inside this page, until you close it. The real app keeps recordings in: ${library}`
      : `Recordings are kept in: ${library}`;
  }

  // ---- showing the state
  function ready(): string | null {
    if (library === "") return "Choose a recordings folder first, with the button under Your recordings.";
    if (!usable) return "The recording program was not found, so nothing can be recorded, not even a practice. See the message under the check.";
    return settingsProblem(readSettings());
  }

  function showSetup(): void {
    const isPractice = practice.checked;
    realGroup.hidden = isPractice;
    screenGroup.hidden = target.value !== "screen" && target.value !== "region";
    windowGroup.hidden = target.value !== "window";
    regionGroup.hidden = target.value !== "region";
    const why = busyQuery ? "Looking at what this computer has." : (ready() ?? "");
    const again = existing.includes(recordingFolderName(name.value)) ? `A recording called ${name.value.trim()} already exists. Recording again adds another take to it. Change the name to start a new recording.` : "";
    problem.textContent = why !== "" ? why : again;
    start.setAttribute("aria-disabled", why === "" ? "false" : "true");
    if (why === "") start.removeAttribute("aria-disabled");
  }

  function showSession(session: Session): void {
    const idle = session.phase === "idle";
    const over = session.phase === "finished" || session.phase === "failed";
    live.hidden = idle;
    setup.hidden = !idle;
    now.textContent = describeSession(session);
    pause.textContent = session.phase === "paused" ? "Resume" : "Pause";
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
    name.value = freshName();
    say([]);
    showSetup();
    start.focus();
  });
  editBtn.addEventListener("click", () => {
    if (recordingsSel.value === "") return;
    if (c.busy) { say(["A recording is going. Wait until it is finished, then edit."]); return; }
    opts.editRecording(recordingsSel.value);
  });
  editNow.addEventListener("click", () => {
    if (c.busy) return;
    opts.editRecording(recordingNameOf(c.session.folder), true);
  });
  const reveal = (recording: string): void => {
    void b.revealRecording(library, recording, "").catch((err: unknown) => say([`Could not show the folder. ${errorText(err)}`]));
  };
  revealBtn.addEventListener("click", () => { if (recordingsSel.value !== "") reveal(recordingsSel.value); });
  show.addEventListener("click", () => reveal(recordingNameOf(c.session.folder)));
  changeFolder.addEventListener("click", async () => {
    if (c.busy) { say(["A recording is going. Wait until it is finished, then choose another folder."]); return; }
    const chosen = await opts.chooseLibrary();
    if (chosen === null) { say(["The recordings folder was not changed."]); changeFolder.focus(); return; }
    await view.setLibrary(chosen);
    say([`Recordings are now kept in ${chosen}.`]);
    changeFolder.focus();
  });
  for (const el of [name, practice, target, display, windowSel, microphone, output, camera, micGain, systemGain, countdown, sounds, left.input, top.input, width.input, height.input]) {
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

  root.append(status, live, setup, recordingsBox, checkBox);
  host.replaceChildren(root);
  try {
    fillChoices();
  } catch (err) {
    say([`The lists of screens and devices could not be filled in. ${errorText(err)}`]);
  }
  showFolder();
  showSession(c.session);
  showSetup();
  found.textContent = "Looking for the recording program...";
  check.setAttribute("aria-disabled", "true");
  void refreshRecordings();

  void (async () => {
    const located = await b.captureCheck().catch((err: unknown) => ({ ok: false as const, message: `Could not look for the recording program. ${errorText(err)}` }));
    usable = located.ok;
    found.textContent = located.ok ? `The recording program was found: ${located.path}` : located.message;
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
    destroy() {
      unsubscribe();
      opts.keepSettings(readSettings());
      root.remove();
    },
  };
  return view;
}
