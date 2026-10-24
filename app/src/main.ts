// SPDX-License-Identifier: Apache-2.0
// OpenStage Recorder: the window. A heading, the Record screen, and (in the next step) the editor for a recording.

import { h } from "../../capture-timeline/src/dom.ts";
import { backend, errorText } from "./backend.ts";
import { RecorderController } from "./capturecontroller.ts";
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
    editRecording() {
      // The editor for a recording is the next part to be built here. Until it is, say so, and do nothing else.
      const status = main.querySelector<HTMLElement>("[role=status]");
      if (status) status.textContent = "Editing a recording is not built into this app yet. The recording is kept safely in its folder, and nothing was changed.";
    },
  });

  backend.guardClose(() => (controller.busy ? "A recording is still going. Closing the window stops it. Close anyway?" : null));
  view.focus();
  if (library === "") {
    const status = main.querySelector<HTMLElement>("[role=status]");
    if (status) status.textContent = `A folder for recordings could not be found. ${errorText("Choose one with the button under Your recordings.")}`;
  }
}

void main();
