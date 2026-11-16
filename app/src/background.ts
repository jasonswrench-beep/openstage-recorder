// SPDX-License-Identifier: Apache-2.0
// Working with the window out of the way: a key that starts a quick recording from any program, and closing the window into the
// notification area (the "tray") instead of quitting.
//
// Both are off until the author switches them on in Settings, because each changes what happens outside this window: the start key takes
// Ctrl+Shift+F9 from every other program for as long as the app runs, and a window that does not quit when it is closed can be forgotten.
// The rules are plain functions, tested on their own; `mountBackgroundSettings` is the Settings card, and `StartKey` keeps the key registered
// whenever no recording is going (a recording registers its own keys, and they replace every other while it lasts).

import { h, nextId } from "../../capture-timeline/src/dom.ts";
import type { RecorderBackend } from "./backend.ts";
import type { RecorderController } from "./capturecontroller.ts";
import { DEFAULT_HOTKEYS, type HotkeyBinding, type HotkeyResult } from "./recorder.ts";

/** The key that starts a quick recording from any program. */
export const START_KEY: HotkeyBinding = (() => {
  const start = DEFAULT_HOTKEYS.find((k) => k.id === "start");
  return { id: "start", keys: start?.keys ?? "Ctrl+Shift+F9" };
})();

export interface BackgroundChoices {
  /** Ctrl+Shift+F9 from any program starts a quick recording. */
  startKey: boolean;
  /** Closing the window puts it in the notification area; Quit in the icon's menu ends the app. */
  closeToTray: boolean;
}

export const defaultBackground = (): BackgroundChoices => ({ startKey: false, closeToTray: false });

/** What to do when the window is asked to close. */
export type CloseDecision = { kind: "close" } | { kind: "ask"; question: string } | { kind: "hide" };

/**
 * Closing the window: put it in the notification area when the author chose that and there is an icon to bring it back from (without the
 * icon the window would be lost), unless Quit was chosen in the icon's menu. Otherwise the usual question, if there is something to lose.
 */
export function closeDecision(choices: BackgroundChoices, trayPresent: boolean, quitting: boolean, question: string | null): CloseDecision {
  if (choices.closeToTray && trayPresent && !quitting) return { kind: "hide" };
  return question === null ? { kind: "close" } : { kind: "ask", question };
}

/** The sentence under the start key's box, from what the system said when the key was registered (or not yet). */
export function startKeyWords(enabled: boolean, result: HotkeyResult | null, recording: boolean): string {
  if (!enabled) return `Off. When it is on, ${START_KEY.keys} starts a quick recording from any program, with the choices on the Record screen.`;
  if (recording) return `On. While a recording is going, ${START_KEY.keys} does nothing; the keys for pause, stop and start again work instead.`;
  if (result === null) return `On. Setting up ${START_KEY.keys}...`;
  if (!result.ok) return `${START_KEY.keys} could not be used: ${result.message} Quick record on the Record screen and in the icon's menu still work.`;
  return `On. ${START_KEY.keys} starts a quick recording from any program: this window goes to the taskbar, the countdown runs, and ${stopKeys()} stops it and makes the video.`;
}

function stopKeys(): string {
  return DEFAULT_HOTKEYS.find((k) => k.id === "stop")?.keys ?? "Ctrl+Shift+F11";
}

/** The sentence under the close box. */
export function closeToTrayWords(enabled: boolean, trayPresent: boolean): string {
  if (!trayPresent) return "The icon in the notification area could not be made on this computer, so closing the window always quits.";
  if (!enabled) return "Off: closing the window quits OpenStage Recorder.";
  return "On: closing the window puts OpenStage Recorder in the notification area, beside the clock, and it keeps running. Bring it back by choosing its icon (from the keyboard, Windows+B goes to the notification area), or by starting OpenStage Recorder again. Quit in the icon's menu ends it.";
}

/** A key press from any program: whether it starts a quick recording now, or why not. */
export function startKeyRefusal(editing: boolean): string | null {
  return editing ? "The editing screen is open. Go back to the recordings with Back to recordings, then use the start key or Quick record." : null;
}

/** Keeps the start key registered whenever it is switched on and no recording is going. */
export class StartKey {
  private enabled = false;
  private result: HotkeyResult | null = null;
  private listeners = new Set<() => void>();

  private readonly b: Pick<RecorderBackend, "hotkeysSet" | "hotkeysClear">;
  private readonly c: RecorderController;

  constructor(b: Pick<RecorderBackend, "hotkeysSet" | "hotkeysClear">, c: RecorderController) {
    this.b = b;
    this.c = c;
    // A recording puts its own keys in place of every other; when it is over, the controller puts back the ones it is given here.
    c.subscribe(() => this.publish());
  }

  get on(): boolean {
    return this.enabled;
  }

  get words(): string {
    return startKeyWords(this.enabled, this.result, this.c.busy);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private publish(): void {
    for (const l of [...this.listeners]) l();
  }

  /** Switch the key on or off. Registering waits while a recording is going, since the recording's keys are in place then. */
  async set(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    this.c.idleKeys = enabled ? [START_KEY] : [];
    this.result = null;
    this.publish();
    if (this.c.busy) return;
    try {
      if (enabled) {
        const results = await this.b.hotkeysSet([START_KEY]);
        this.result = results.find((r) => r.id === START_KEY.id) ?? { id: START_KEY.id, ok: false, message: "The system gave no answer." };
      } else {
        await this.b.hotkeysClear();
      }
    } catch (err) {
      this.result = { id: START_KEY.id, ok: false, message: err instanceof Error ? err.message : String(err) };
    }
    this.publish();
  }
}

export interface BackgroundSettingsOptions {
  choices: BackgroundChoices;
  keep: (choices: BackgroundChoices) => void;
  startKey: StartKey;
  trayPresent: Promise<boolean>;
}

/** The Settings card: two boxes, each with a sentence that says what it does now. */
export function mountBackgroundSettings(host: HTMLElement, opts: BackgroundSettingsOptions): { destroy(): void } {
  const choices = { ...opts.choices };
  const keyId = nextId("bg-key");
  const trayId = nextId("bg-tray");
  const keyBox = h("input", { type: "checkbox", id: keyId, "aria-describedby": `${keyId}-note` }) as HTMLInputElement;
  const trayBox = h("input", { type: "checkbox", id: trayId, "aria-describedby": `${trayId}-note` }) as HTMLInputElement;
  keyBox.checked = choices.startKey;
  trayBox.checked = choices.closeToTray;
  const keyNote = h("p", { class: "rv-note", id: `${keyId}-note` });
  const trayNote = h("p", { class: "rv-note", id: `${trayId}-note` });
  let trayPresent = true;
  const showKey = (): void => { keyNote.textContent = opts.startKey.words; };
  const showTray = (): void => {
    trayNote.textContent = closeToTrayWords(choices.closeToTray, trayPresent);
    trayBox.disabled = !trayPresent;
  };
  keyBox.addEventListener("change", () => {
    choices.startKey = keyBox.checked;
    opts.keep({ ...choices });
    void opts.startKey.set(keyBox.checked);
  });
  trayBox.addEventListener("change", () => {
    choices.closeToTray = trayBox.checked;
    opts.keep({ ...choices });
    showTray();
  });
  const off = opts.startKey.subscribe(showKey);
  void opts.trayPresent.then((present) => { trayPresent = present; showTray(); }, () => { trayPresent = false; showTray(); });
  showKey();
  showTray();
  const card = h("section", { class: "rv-section app-background", "aria-labelledby": "background-title" },
    h("h2", { id: "background-title" }, "With the window out of the way"),
    h("div", { class: "os-cl-field" }, h("label", { class: "os-cl-check", for: keyId }, keyBox, ` Start a quick recording with ${START_KEY.keys} from any program`)),
    keyNote,
    h("div", { class: "os-cl-field" }, h("label", { class: "os-cl-check", for: trayId }, trayBox, " Closing the window keeps OpenStage Recorder in the notification area")),
    trayNote);
  host.append(card);
  return { destroy() { off(); card.remove(); } };
}
