// SPDX-License-Identifier: Apache-2.0
// The parts of the window around the screens (main.ts): the word in the navy bar that says what the recorder is doing, and the Help tab.
// The word is pure and tested here (shell.test.ts); the Help tab is words and a table of keys, made from the same list of keys the recorder
// uses (recorder.ts), so it can never list a key that does not work, and the Check for updates button (updates.ts).

import { h } from "../../capture-timeline/src/dom.ts";
import type { Phase } from "./capturesession.ts";
import type { QuickPhase } from "./quickrecord.ts";
import { DEFAULT_HOTKEYS } from "./recorder.ts";
import { pageButtonText, parseUpdateAnswer, releaseWords } from "./updates.ts";

/** What the Help tab's Updates section needs from the shell (backend.ts). */
export interface UpdateChecks {
  recorderRelease(): Promise<string>;
  checkForUpdates(): Promise<string>;
  openReleasePage(url: string): Promise<void>;
}

/**
 * What the recorder is doing, in a word or two, for the bar at the top. Always words, never a colour or a dot alone. A quick recording's
 * video being made, or ready, is said over the plain recording's state, because that is what the person is waiting for.
 */
export function appStateWords(recording: Phase, quick: QuickPhase): string {
  if (quick === "making") return "Making the video";
  if (quick === "ready") return "Video ready";
  switch (recording) {
    case "starting": return "Starting";
    case "countdown": return "Counting down";
    case "recording": return "Recording";
    case "paused": return "Paused";
    case "stopping": return "Finishing";
    case "finished": return "Finished";
    case "failed": return "Did not finish";
    default: return "Ready";
  }
}

/** The keys that work while recording, from any program, and what each does (the start key is not offered by this app). */
export function recordingKeys(): { keys: string; does: string }[] {
  return DEFAULT_HOTKEYS.filter((k) => k.id !== "start").map((k) => ({ keys: k.keys, does: k.label }));
}

/** The keys of the window itself and of the editing screen. */
export const WINDOW_KEYS: readonly { keys: string; does: string }[] = [
  { keys: "Left, Right, Home, End", does: "On the tabs (Record, Recordings, Settings, Help), go to another tab and show it" },
  { keys: "Tab, Shift+Tab", does: "Go to the next or the previous box or button" },
  { keys: "Arrow keys", does: "Among the three cards of what to record, choose another" },
  { keys: "Enter or Space", does: "Open or close one of the More choices sections" },
  { keys: "F6", does: "In the editing screen, go between the preview, the timeline and the clip list" },
  { keys: "Space", does: "In the editing screen, play or pause" },
  { keys: "Ctrl+S", does: "In the editing screen, save the edit" },
  { keys: "Ctrl+Z, Ctrl+Y", does: "In the editing screen, undo and redo" },
];

/**
 * The Help tab's Updates section: which release this copy is, and a button that asks, once, whether a newer one is published. Notify only:
 * the answer is said in words, and a newer release's page opens in the person's own browser only if they press the second button.
 */
export function updatesSection(u: UpdateChecks): HTMLElement {
  const copy = h("p", { class: "rv-note", id: "update-copy" }, "This copy is OpenStage Recorder.");
  void u.recorderRelease().then((r) => { copy.textContent = `This copy is OpenStage Recorder ${releaseWords(r)}.`; }, () => undefined);
  const said = h("p", { class: "rv-status app-update-said", id: "update-said", role: "status", "aria-atomic": "true" });
  const check = h("button", { type: "button", class: "os-cl-button", id: "update-check" }, "Check for updates");
  const open = h("button", { type: "button", class: "os-cl-button rv-primary", id: "update-open" }, "Open the releases page");
  open.hidden = true;
  let page: string | undefined;
  check.addEventListener("click", () => {
    check.disabled = true;
    open.hidden = true;
    page = undefined;
    said.textContent = "Checking...";
    void u.checkForUpdates()
      .then((raw) => parseUpdateAnswer(raw), (err: unknown) => parseUpdateAnswer(JSON.stringify({ state: "error", message: err instanceof Error ? err.message : String(err) })))
      .then((a) => {
        said.textContent = a.message;
        page = a.url;
        if (page !== undefined) {
          open.textContent = pageButtonText(a);
          open.hidden = false;
        }
      })
      .finally(() => { check.disabled = false; });
  });
  open.addEventListener("click", () => {
    if (page === undefined) return;
    void u.openReleasePage(page).catch((err: unknown) => { said.textContent = err instanceof Error ? err.message : String(err); });
  });
  return h("section", { class: "app-updates", "aria-labelledby": "updates-title" },
    h("h3", { id: "updates-title" }, "Updates"),
    copy,
    h("p", { class: "rv-note" }, "Check for updates asks GitHub, once, whether a newer version of OpenStage Recorder is published. It happens only when you press the button. Nothing about you or your recordings is sent, and nothing is downloaded or installed: if there is a newer version, you can open its page in your browser, and running its setup updates this copy and keeps your recordings and settings."),
    h("div", { class: "rv-actions app-update-buttons" }, check, open),
    said);
}

/** The Help tab: the keys, in two tables, a few words about the app, and Check for updates. */
export function helpScreen(updates?: UpdateChecks): HTMLElement {
  const table = (caption: string, rows: readonly { keys: string; does: string }[]) =>
    h("table", { class: "app-keys" },
      h("caption", {}, caption),
      h("thead", {}, h("tr", {}, h("th", { scope: "col" }, "Keys"), h("th", { scope: "col" }, "What they do"))),
      h("tbody", {}, ...rows.map((r) => h("tr", {}, h("td", {}, r.keys), h("td", {}, r.does)))));
  return h("div", { class: "rv-section app-help" },
    h("h2", { id: "help-title" }, "Help"),
    h("p", { class: "rv-note" }, "OpenStage Recorder records your screen, your voice and the computer's sound, with an optional webcam, and has a simple editor for what you record. Everything stays on this computer: there is no account and your recordings are never sent anywhere. The only time it goes online is when you press Check for updates, below. It is free and open source (Apache 2.0)."),
    table("While recording, from any program", recordingKeys()),
    table("In this window", WINDOW_KEYS),
    h("p", { class: "rv-note" }, "A key another program already uses cannot work while recording: the recorder says so when it starts, and the buttons always work."),
    ...(updates ? [updatesSection(updates)] : []));
}

/** The time of a recording as a clock shows it: 00:02:34. For the large clock while recording, which is only to look at. */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const two = (n: number) => String(n).padStart(2, "0");
  return `${two(Math.floor(total / 3600))}:${two(Math.floor((total % 3600) / 60))}:${two(total % 60)}`;
}
