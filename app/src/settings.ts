// SPDX-License-Identifier: Apache-2.0
// What the app remembers between runs: where recordings are kept, and the choices the author made last time on the Record screen.
//
// It is kept in the window's own storage. That is a convenience only: if it is missing, blocked or damaged, the app starts with its
// defaults and nothing is lost but the author's last choices. Every value read back is checked, so a damaged entry cannot put the
// recorder into a state it could not have been put in by hand.

import { defaultSettings, MAX_GAIN_DB, MIN_GAIN_DB, type Interactions, type RecordSettings, type Target } from "./capturesession.ts";

export const SETTINGS_KEY = "openstage-recorder-settings";

/** A name for a new recording that no other is likely to have: `Recording 2026-10-23 1405`. */
export function freshName(now: Date = new Date()): string {
  const two = (n: number): string => String(n).padStart(2, "0");
  return `Recording ${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())} ${two(now.getHours())}${two(now.getMinutes())}`;
}

export interface StoredSettings {
  /** The recordings folder the author chose, or null to use the default. */
  library: string | null;
  record: RecordSettings;
}

type Reader = Pick<Storage, "getItem">;
type Writer = Pick<Storage, "setItem">;

const TARGETS: readonly Target[] = ["screen", "window", "region"];
const INTERACTIONS: readonly Interactions[] = ["off", "no-keys", "on"];

const gain = (v: unknown, fallback: number): number => (typeof v === "number" && Number.isInteger(v) && v >= MIN_GAIN_DB && v <= MAX_GAIN_DB ? v : fallback);
const text = (v: unknown, fallback: string, max = 300): string => (typeof v === "string" && v.length <= max ? v : fallback);

function storage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

/** The settings as a stored text read back: anything wrong in it is replaced by the default for that choice. */
export function parseSettings(raw: string | null | undefined, now: Date = new Date()): StoredSettings {
  const fresh = { ...defaultSettings(), name: freshName(now) };
  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) return { library: null, record: fresh };
  const d = data as Record<string, unknown>;
  const r = typeof d["record"] === "object" && d["record"] !== null ? (d["record"] as Record<string, unknown>) : {};
  const region = typeof r["region"] === "object" && r["region"] !== null ? (r["region"] as Record<string, unknown>) : {};
  const countdown = r["countdownSeconds"];
  return {
    library: typeof d["library"] === "string" && d["library"].trim() !== "" && d["library"].length <= 1000 ? d["library"] : null,
    record: {
      name: fresh.name, // never kept: recording again under the same name would add a take to the last recording
      practice: false, // the practice recording is for trying the controls; it is never kept as a standing choice
      target: TARGETS.includes(r["target"] as Target) ? (r["target"] as Target) : fresh.target,
      display: typeof r["display"] === "number" && Number.isInteger(r["display"]) && r["display"] >= 1 && r["display"] <= 64 ? r["display"] : fresh.display,
      window: "", // a window is chosen from the list of windows open now; one from last time may be gone
      region: {
        left: text(region["left"], fresh.region.left, 6),
        top: text(region["top"], fresh.region.top, 6),
        width: text(region["width"], fresh.region.width, 6),
        height: text(region["height"], fresh.region.height, 6),
      },
      microphone: text(r["microphone"], fresh.microphone, 20),
      output: text(r["output"], fresh.output, 20),
      camera: text(r["camera"], fresh.camera, 20),
      interactions: INTERACTIONS.includes(r["interactions"] as Interactions) ? (r["interactions"] as Interactions) : fresh.interactions,
      micGainDb: gain(r["micGainDb"], fresh.micGainDb),
      systemGainDb: gain(r["systemGainDb"], fresh.systemGainDb),
      countdownSeconds: typeof countdown === "number" && Number.isInteger(countdown) && countdown >= 0 && countdown <= 10 ? countdown : fresh.countdownSeconds,
      sounds: typeof r["sounds"] === "boolean" ? r["sounds"] : fresh.sounds,
    },
  };
}

export function loadSettings(from: Reader | undefined = storage()): StoredSettings {
  try {
    return parseSettings(from?.getItem(SETTINGS_KEY));
  } catch {
    return parseSettings(null);
  }
}

/** Keep the settings. Says whether it could; a failure is not an error the author needs to hear about. */
export function saveSettings(s: StoredSettings, to: Writer | undefined = storage()): boolean {
  try {
    if (to === undefined) return false;
    to.setItem(SETTINGS_KEY, JSON.stringify({ library: s.library, record: { ...s.record, name: "", practice: false, window: "" } }));
    return true;
  } catch {
    return false;
  }
}
