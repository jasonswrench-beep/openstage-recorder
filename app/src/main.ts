// SPDX-License-Identifier: Apache-2.0
// OpenStage Recorder: the window. A navy bar with the app's name and what it is doing, tabs for Record, Recordings, Settings and Help, a
// status line, and the editing screen for a recording, which takes the page while it is open.
//
// The look is the OpenStage suite's (2026-11-10, after the design specification's mockups R01 to R03): the colours are openstage-ui.css,
// version 1, with the Recorder's own colour, and the icons are Lucide (uiicons.gen.ts). The tabs follow the ARIA tabs pattern: one Tab stop,
// Left, Right, Home and End move between them and show the screen they name.

import { h } from "../../capture-timeline/src/dom.ts";
import { backend, errorText } from "./backend.ts";
import { RecorderController } from "./capturecontroller.ts";
import { mountEditView, type EditView } from "./editview.ts";
import { QuickRecord, trayWords } from "./quickrecord.ts";
import { mountRecorderView } from "./recorderview.ts";
import { loadSettings, saveSettings, type StoredSettings } from "./settings.ts";
import { appStateWords, helpScreen } from "./shell.ts";
import { uiIcon, type UiIconName } from "./uiicons.gen.ts";

async function main(): Promise<void> {
  const app = document.getElementById("app");
  if (app === null) return;
  const stored: StoredSettings = loadSettings();
  const controller = new RecorderController(backend);
  let library = stored.library ?? (await backend.defaultLibrary().catch(() => ""));
  const quick = new QuickRecord(backend, controller, () => library);

  const heading = h("h1", { class: "app-name" }, h("span", { class: "app-name-suite" }, "OpenStage"), " ", h("span", { class: "app-name-product" }, "Recorder"));
  // The icon is decoration: the heading already says what the app is, so the picture has no words of its own.
  const icon = h("img", { class: "app-icon", src: "icon.svg", alt: "", width: "32", height: "32" });
  const title = h("div", { class: "app-title" }, icon, heading);
  // What the recorder is doing, in a word, always visible in the bar. It is not a live region: the status line says each change once.
  const stateWord = h("span", { class: "app-state-word" }, "Ready");
  const stateChip = h("p", { class: "app-state", id: "app-doing" }, h("span", { class: "app-state-dot", "aria-hidden": "true" }), stateWord);
  const previewNote = h("p", { class: "app-preview" }, "Preview in a web browser, with a pretend recorder. Nothing real is recorded.");
  previewNote.hidden = !backend.preview;
  const header = h("header", { class: "app-header" }, title, h("div", { class: "app-bar-end" }, previewNote, stateChip));

  // ---- the tabs, and a panel for each
  const TABS: { id: "record" | "recordings" | "settings" | "help"; label: string; icon: UiIconName }[] = [
    { id: "record", label: "Record", icon: "circle-dot" },
    { id: "recordings", label: "Recordings", icon: "film" },
    { id: "settings", label: "Settings", icon: "settings" },
    { id: "help", label: "Help", icon: "circle-question-mark" },
  ];
  type TabId = (typeof TABS)[number]["id"];
  const panels = new Map<TabId, HTMLElement>();
  const tabButtons = new Map<TabId, HTMLButtonElement>();
  const tabList = h("div", { class: "app-tabs", role: "tablist", "aria-label": "Screens" });
  let current: TabId = "record";
  const showTab = (tab: TabId, focus = false): void => {
    current = tab;
    for (const [id, panel] of panels) panel.hidden = id !== tab;
    for (const [id, button] of tabButtons) {
      button.setAttribute("aria-selected", String(id === tab));
      button.tabIndex = id === tab ? 0 : -1;
    }
    if (focus) tabButtons.get(tab)?.focus();
    if (tab === "recordings") void view.refreshRecordings();
  };
  for (const t of TABS) {
    const panel = h("section", { class: "app-panel", id: `panel-${t.id}`, role: "tabpanel", "aria-labelledby": `tab-${t.id}` });
    const button = h("button", { type: "button", class: "app-tab", role: "tab", id: `tab-${t.id}`, "aria-controls": `panel-${t.id}` }, uiIcon(document, t.icon), h("span", {}, t.label));
    button.addEventListener("click", () => showTab(t.id));
    button.addEventListener("keydown", (e) => {
      const ids = TABS.map((x) => x.id);
      const at = ids.indexOf(t.id);
      const to = e.key === "ArrowRight" ? ids[(at + 1) % ids.length] : e.key === "ArrowLeft" ? ids[(at - 1 + ids.length) % ids.length] : e.key === "Home" ? ids[0] : e.key === "End" ? ids[ids.length - 1] : undefined;
      if (to === undefined || e.altKey || e.ctrlKey || e.metaKey) return;
      e.preventDefault();
      showTab(to, true);
    });
    panels.set(t.id, panel);
    tabButtons.set(t.id, button);
    tabList.append(button);
  }
  const tabRow = h("div", { class: "app-tab-row" }, tabList);
  const statusHost = h("div", { class: "app-status-host" });
  const main = h("main", { id: "app-main", class: "app-main", tabindex: "-1" }, statusHost, ...panels.values());
  const footer = h("footer", { class: "app-footer" },
    h("span", {}, uiIcon(document, "shield-check"), "Recordings stay on this computer. No account."),
    h("span", {}, uiIcon(document, "keyboard"), "Ctrl+Shift+F11 stops a recording from any program"));
  app.replaceChildren(header, tabRow, main, footer);
  panels.get("help")!.replaceChildren(helpScreen(backend));
  document.documentElement.lang = "en";
  void backend.setTitle("OpenStage Recorder");

  /** Say something on the Record screen's status line. */
  const statusLine = (message: string): void => {
    const status = main.querySelector<HTMLElement>("[role=status]");
    if (status) status.replaceChildren(h("span", { class: "rv-said" }, message));
  };

  const keep = (): void => {
    saveSettings(stored);
  };

  // The editing screen takes the page while it is open. The Record screen stays where it is, out of sight, so nothing the author set is lost.
  let editing: EditView | undefined;
  let returnTo: HTMLElement | null = null;
  const openEditor = (name: string, newestTake?: boolean): void => {
    if (editing !== undefined) return;
    returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // The editing screen takes the page: the tabs and their screens are put away until it closes, where they are left as they were.
    for (const panel of panels.values()) panel.hidden = true;
    statusHost.hidden = true;
    tabRow.hidden = true;
    showState("Editing");
    main.classList.add("is-editing");
    editing = mountEditView(main, { backend, library, name, ...(newestTake === true ? { newestTake: true } : {}), leave: closeEditor });
    void backend.setTitle(`OpenStage Recorder: editing ${name.replace(/\.capture$/i, "")}`);
  };
  const closeEditor = (): void => {
    editing?.destroy();
    editing = undefined;
    main.classList.remove("is-editing");
    tabRow.hidden = false;
    statusHost.hidden = false;
    showTab(current);
    showState(appStateWords(controller.session.phase, quick.state.phase));
    void backend.setTitle("OpenStage Recorder");
    // Back to the button that was used to start editing, if it is still there to use.
    const target = returnTo;
    returnTo = null;
    if (target !== null && target.isConnected && target.closest("[hidden]") === null) target.focus();
    else view.focus();
  };

  /** Put a word in the bar: Ready, Recording, Paused, Editing and so on. */
  const showState = (word: string): void => {
    stateWord.textContent = word;
    stateChip.dataset["state"] = word.toLowerCase().replace(/[^a-z]+/g, "-");
  };
  const view = mountRecorderView(panels.get("record")!, {
    backend,
    controller,
    library,
    hosts: { recordings: panels.get("recordings")!, settings: panels.get("settings")!, status: statusHost },
    showTab: (tab) => showTab(tab, true),
    settings: stored.record,
    keepSettings: (record) => {
      stored.record = record;
      keep();
    },
    async chooseLibrary() {
      const picked = await backend.pickFolder("Choose the folder to keep recordings in").catch(() => null);
      if (picked === null) return null;
      library = picked;
      stored.library = picked;
      keep();
      return picked;
    },
    editRecording: openEditor,
    quick,
  });

  // ---- the icon in the notification area: Quick record and Stop from the taskbar, with the window out of the way
  // The tooltip says what is happening. A quick recording started from the icon puts the window away so it is not filmed, and brings it back when
  // the recording ends, to show the video and its path.
  let windowAway = false;
  const showTooltip = (): void => {
    void backend.traySet(trayWords(controller.session.phase, quick.state.phase)).catch(() => undefined);
  };
  controller.subscribe(showTooltip);
  const followState = (): void => { if (editing === undefined) showState(appStateWords(controller.session.phase, quick.state.phase)); };
  controller.subscribe(followState);
  quick.subscribe(followState);
  quick.subscribe((state) => {
    showTooltip();
    if (windowAway && state.phase !== "recording" && state.phase !== "idle") {
      windowAway = false;
      void backend.windowRestore().catch(() => undefined);
    }
  });
  void backend.onTray(async (id) => {
    if (id === "stop") {
      await controller.act("stop");
      return;
    }
    if (id !== "quick") return;
    if (editing !== undefined) {
      await backend.windowRestore().catch(() => undefined);
      statusLine("The editing screen is open. Go back to the recordings with Back to recordings, then use Quick record.");
      return;
    }
    const message = await view.startQuick(true);
    if (message !== null) {
      await backend.windowRestore().catch(() => undefined);
      statusLine(message);
      return;
    }
    windowAway = true;
    await backend.windowMinimize().catch(() => { windowAway = false; });
  }).catch(() => undefined);

  showTab("record");
  backend.guardClose(() => (controller.busy ? "A recording is still going. Closing the window stops it. Close anyway?" : quick.busy ? "The video of your quick recording is still being made. Closing the window stops it. Close anyway?" : editing?.closeQuestion() ?? null));
  view.focus();
  if (library === "") {
    const status = main.querySelector<HTMLElement>("[role=status]");
    if (status) status.textContent = `A folder for recordings could not be found. ${errorText("Choose one with the button under Your recordings.")}`;
  }
}

void main();
