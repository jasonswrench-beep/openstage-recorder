// SPDX-License-Identifier: Apache-2.0
// OpenStage Recorder: the window. A heading, the Record screen, and the editing screen for a recording.

import { h } from "../../capture-timeline/src/dom.ts";
import { backend, errorText } from "./backend.ts";
import { RecorderController } from "./capturecontroller.ts";
import { mountEditView, type EditView } from "./editview.ts";
import { mountRecorderView } from "./recorderview.ts";
import { loadSettings, saveSettings, type StoredSettings } from "./settings.ts";

async function main(): Promise<void> {
  const app = document.getElementById("app");
  if (app === null) return;
  const stored: StoredSettings = loadSettings();
  const controller = new RecorderController(backend);
  let library = stored.library ?? (await backend.defaultLibrary().catch(() => ""));

  const heading = h("h1", {}, "OpenStage Recorder");
  // The icon is decoration: the heading already says what the app is, so the picture has no words of its own.
  const icon = h("img", { class: "app-icon", src: "icon.svg", alt: "", width: "40", height: "40" });
  const title = h("div", { class: "app-title" }, icon, heading);
  const previewNote = h("p", { class: "app-preview" }, "This is a preview in a web browser, with a pretend recorder. Nothing real is recorded.");
  previewNote.hidden = !backend.preview;
  const header = h("header", { class: "app-header" }, title, previewNote);
  const main = h("main", { id: "app-main", class: "app-main", tabindex: "-1" });
  app.replaceChildren(header, main);
  document.documentElement.lang = "en";
  void backend.setTitle("OpenStage Recorder");

  const keep = (): void => {
    saveSettings(stored);
  };

  // The editing screen takes the page while it is open. The Record screen stays where it is, out of sight, so nothing the author set is lost.
  let editing: EditView | undefined;
  let returnTo: HTMLElement | null = null;
  const openEditor = (name: string, newestTake?: boolean): void => {
    if (editing !== undefined) return;
    returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    view.element.hidden = true;
    main.classList.add("is-editing");
    editing = mountEditView(main, { backend, library, name, ...(newestTake === true ? { newestTake: true } : {}), leave: closeEditor });
    void backend.setTitle(`OpenStage Recorder: editing ${name.replace(/\.capture$/i, "")}`);
  };
  const closeEditor = (): void => {
    editing?.destroy();
    editing = undefined;
    main.classList.remove("is-editing");
    view.element.hidden = false;
    void backend.setTitle("OpenStage Recorder");
    // Back to the button that was used to start editing, if it is still there to use.
    const target = returnTo;
    returnTo = null;
    if (target !== null && target.isConnected && target.closest("[hidden]") === null) target.focus();
    else view.focus();
  };

  const view = mountRecorderView(main, {
    backend,
    controller,
    library,
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
  });

  backend.guardClose(() => (controller.busy ? "A recording is still going. Closing the window stops it. Close anyway?" : editing?.closeQuestion() ?? null));
  view.focus();
  if (library === "") {
    const status = main.querySelector<HTMLElement>("[role=status]");
    if (status) status.textContent = `A folder for recordings could not be found. ${errorText("Choose one with the button under Your recordings.")}`;
  }
}

void main();
