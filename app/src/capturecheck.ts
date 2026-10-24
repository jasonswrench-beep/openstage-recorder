// SPDX-License-Identifier: Apache-2.0
// What the app makes of the screen recorder's setup check ("is this computer ready to record?").
//
// The recorder (`openstage-capture setup-check`) looks at the computer and prints one line of JSON for each finding, in plain words
// (docs/capture/capture-protocol-spec.md, the `check` event). It records nothing, asks Windows for no permission and sends nothing anywhere.
// This file is the plain part: reading those lines, naming each check for a person, and saying in one sentence how it went. The screen that
// shows them is recorderview.ts.

import type { StreamExit } from "./recorder.ts";

/** How long the check may take before it is stopped. It takes a few seconds; this is only a safety net. */
export const CHECK_LIMIT_MS = 60_000;

/** The options the recorder is started with for the check: `dir` is where recordings will be kept, so the check can say how much room is there. */
export function checkArguments(dir: string | null): string[] {
  return dir ? ["setup-check", "--dir", dir] : ["setup-check"];
}

export interface Finding {
  /** The recorder's own name for the check, such as `video-encoder`. */
  check: string;
  /** The same for a person: "Video encoder". */
  label: string;
  ok: boolean;
  message: string;
}

const LABELS: Record<string, string> = {
  "windows-version": "Windows version",
  "screen-capture": "Screen capture",
  displays: "Displays",
  "video-encoder": "Video encoder",
  "sound-encoder": "Sound encoder",
  microphone: "Microphone",
  "sound-output": "The computer's own sound",
  "microphone-access": "Permission to use the microphone",
  camera: "Camera",
  "camera-access": "Permission to use the camera",
  "disk-space": "Space on the disk",
};

const MAX_MESSAGE = 1500;

/** A check's name for a person. One this app does not know is its own name with the hyphens taken out, so a new check is never hidden. */
export function labelFor(check: string): string {
  const known = LABELS[check];
  if (known) return known;
  const plain = check.replace(/[-_]+/g, " ").trim();
  return plain === "" ? "Check" : plain.charAt(0).toUpperCase() + plain.slice(1);
}

/** One finding from one line the recorder printed, or null for any line that is not a finding (the hello, a result, something else, or damage). */
export function parseFinding(line: string): Finding | null {
  let data: unknown;
  try {
    data = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof data !== "object" || data === null) return null;
  const d = data as Record<string, unknown>;
  if (d["event"] !== "check" || typeof d["check"] !== "string" || d["check"] === "" || typeof d["ok"] !== "boolean") return null;
  const message = typeof d["message"] === "string" ? d["message"].trim().slice(0, MAX_MESSAGE) : "";
  return { check: d["check"].slice(0, 80), label: labelFor(d["check"]), ok: d["ok"], message: message === "" ? "The recorder gave no details." : message };
}

export interface CheckSummary {
  /** Every check passed and the recorder finished normally. */
  ready: boolean;
  /** One sentence for the whole check, read aloud when it ends. */
  sentence: string;
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/**
 * How the check went, in one sentence. `exit` is how the recorder ended, or null if it could not be started at all. A check that found no
 * problem but ended badly is not called ready, because the list may be missing findings.
 */
export function summarise(findings: readonly Finding[], exit: StreamExit | null): CheckSummary {
  const problems = findings.filter((f) => !f.ok);
  if (exit === null) return { ready: false, sentence: "The check could not be started." };
  if (exit.code === 2 && findings.length === 0) {
    return { ready: false, sentence: "Recording works on Windows only, so this computer cannot record with OpenStage Recorder." };
  }
  if (exit.killed || exit.code === null) return { ready: false, sentence: "The check did not finish, so the list below may be incomplete." };
  if (problems.length > 0) {
    const names = problems.map((f) => f.label).join(", ");
    return { ready: false, sentence: `${plural(problems.length, "check found a problem", "checks found a problem")} out of ${findings.length}: ${names}. Each is explained below.` };
  }
  if (exit.code !== 0) return { ready: false, sentence: "The check ended with an error, so the list below may be incomplete." };
  if (findings.length === 0) return { ready: false, sentence: "The check ended without saying anything, so nothing is known about this computer." };
  return { ready: true, sentence: `This computer is ready to record. All ${plural(findings.length, "check", "checks")} passed.` };
}
