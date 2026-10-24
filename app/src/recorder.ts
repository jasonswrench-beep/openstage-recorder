// SPDX-License-Identifier: Apache-2.0
// What the app knows about the recording program and the keys that drive it.
//
// The recording program (openstage-capture) is a separate program that the app starts and talks to, one line of JSON at a time (the Rust side is in
// app/core/src/stream.rs, and it does not read the protocol: the lines pass through to here untouched). This file is the shapes the
// page works with, the keys that start and stop a recording while another program has the focus, and the checks on those keys that
// can be made before the system is asked to register them.

/** How a recorder run ended. */
export interface StreamExit {
  /** The program's exit code, or null if it did not end normally. */
  code: number | null;
  /** True if it did not finish in the time it was given after Stop, and was ended by force. */
  killed: boolean;
  /** The last things it printed on its error channel, for a message when it went wrong. */
  stderr_tail: string;
}

export interface StreamState {
  running: boolean;
  paused: boolean;
}

/** Where the recorder is, or why it cannot be used. */
export type CaptureCheck = { ok: true; path: string } | { ok: false; message: string };

export interface HotkeyBinding {
  id: string;
  keys: string;
}

/** Whether one key combination was registered, and if not, why, in words for the author. */
export interface HotkeyResult {
  id: string;
  ok: boolean;
  message: string;
}

export interface HotkeyChoice extends HotkeyBinding {
  label: string;
}

/**
 * The keys to start with. They work from any program. Ctrl and Shift together with a function key are free in Windows and in
 * the common screen readers (NVDA, JAWS and Narrator use Insert or Caps Lock as their own key, and Windows keeps the Windows key). The author can
 * change every one.
 */
export const DEFAULT_HOTKEYS: HotkeyChoice[] = [
  { id: "start", keys: "Ctrl+Shift+F9", label: "Start recording" },
  { id: "pause", keys: "Ctrl+Shift+F10", label: "Pause or resume" },
  { id: "stop", keys: "Ctrl+Shift+F11", label: "Stop" },
  { id: "restart", keys: "Ctrl+Shift+F12", label: "Start again" },
];

const MODIFIER_NAMES: Record<string, string> = {
  ctrl: "ctrl", control: "ctrl", commandorcontrol: "ctrl", cmdorctrl: "ctrl",
  alt: "alt", option: "alt",
  shift: "shift",
  super: "win", meta: "win", cmd: "win", command: "win", win: "win", windows: "win",
};
const MODIFIER_ORDER = ["ctrl", "alt", "shift", "win"];

/** A combination in one fixed form, so Ctrl+Shift+F9 and shift + control + f9 are seen to be the same. */
export function normalizeKeys(keys: string): string {
  const parts = keys.split("+").map((p) => p.trim().toLowerCase()).filter(Boolean);
  const modifiers = new Set<string>();
  const others: string[] = [];
  for (const p of parts) {
    const m = MODIFIER_NAMES[p.replace(/\s+/g, "")];
    if (m) modifiers.add(m);
    else others.push(p.replace(/\s+/g, ""));
  }
  return [...MODIFIER_ORDER.filter((m) => modifiers.has(m)), ...others].join("+");
}

export function sameKeys(a: string, b: string): boolean {
  return normalizeKeys(a) === normalizeKeys(b);
}

const SCREEN_READER_KEYS = new Set(["insert", "ins", "capslock", "caps", "numpad0", "numpadinsert"]);

/**
 * A reason not to use this combination, or null if there is none. Screen readers keep Insert and Caps Lock as the key their own commands
 * start with, so a recording key that uses one could stop those commands working just when an author who uses a screen reader needs them.
 * Windows keeps most combinations with the Windows key.
 */
export function keyWarning(keys: string): string | null {
  const parts = normalizeKeys(keys).split("+");
  if (parts.some((p) => SCREEN_READER_KEYS.has(p))) {
    return "Insert and Caps Lock are the keys NVDA, JAWS and Narrator use for their own commands. Using one here could stop those commands working while you record. Choose another key.";
  }
  if (parts.includes("win")) {
    return "Windows keeps most combinations that use the Windows key for itself, so this one may not work. Choose Ctrl, Alt or Shift instead.";
  }
  return null;
}

/** The plain-words problems with a set of combinations as typed, before the system is asked: a blank, a repeat, or a key a screen reader needs. */
export function checkHotkeys(choices: HotkeyChoice[]): { id: string; message: string }[] {
  const problems: { id: string; message: string }[] = [];
  choices.forEach((c, i) => {
    if (c.keys.trim() === "") {
      problems.push({ id: c.id, message: `${c.label} has no keys. Choose a combination.` });
      return;
    }
    const twin = choices.slice(0, i).find((o) => o.keys.trim() !== "" && sameKeys(o.keys, c.keys));
    if (twin) problems.push({ id: c.id, message: `${c.label} uses the same keys as ${twin.label}. Give each its own.` });
    const warning = keyWarning(c.keys);
    if (warning) problems.push({ id: c.id, message: `${c.label}: ${warning}` });
  });
  return problems;
}
