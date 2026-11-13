// SPDX-License-Identifier: Apache-2.0
// Check for updates: what the shell answers (app/core/src/updates.rs), as the Help tab shows it. Notify only: a newer version is named and
// its page offered; nothing is downloaded or installed here. docs/recorder/UPDATE-CHECK.md says why it is the same in every tool of the suite.

/** The list of this program's releases. */
export const RELEASES_PAGE = "https://github.com/jasonswrench-beep/openstage-recorder/releases";

export interface UpdateAnswer {
  /** newer: a newer version is published. current: this is the newest. unknown: this copy's release is not known. off: turned off here. error. */
  state: "newer" | "current" | "unknown" | "off" | "error";
  message: string;
  /** The page to offer: the newer release's, or the list. Only ever a page of this program's releases. */
  url?: string;
}

/** Whether an address is a page of this program's releases (the list, or one release by its tag), which is all the window will open. */
export function isReleasePage(url: string): boolean {
  return url === RELEASES_PAGE || /^https:\/\/github\.com\/jasonswrench-beep\/openstage-recorder\/releases\/tag\/v\d+\.\d+\.\d+(-(alpha|beta|rc)\.\d+)?$/.test(url);
}

/** The shell's JSON as an answer; anything that makes no sense is an error, and a link that is not one of the release pages is dropped. */
export function parseUpdateAnswer(raw: string): UpdateAnswer {
  try {
    const d = JSON.parse(raw) as Record<string, unknown>;
    const states = ["newer", "current", "unknown", "off", "error"] as const;
    const state = states.find((s) => s === d["state"]) ?? "error";
    const message = typeof d["message"] === "string" && d["message"].trim() !== "" ? d["message"] : "The answer could not be read.";
    const url = typeof d["url"] === "string" && isReleasePage(d["url"]) ? d["url"] : undefined;
    return url ? { state, message, url } : { state, message };
  } catch {
    return { state: "error", message: "The answer could not be read.", url: RELEASES_PAGE };
  }
}

/** The words on the button that opens the page, for the answer. */
export function pageButtonText(a: UpdateAnswer): string {
  return a.state === "newer" ? "Open the new version's page" : "Open the releases page";
}

/** "0.1.0 alpha 4" for 0.1.0-alpha.4; the words for a copy whose release is not known. */
export function releaseWords(release: string): string {
  const r = release.trim().replace(/^v/, "");
  if (r === "") return "a copy made from the source files, so its release is not known";
  const [main, pre] = r.split(/-(.*)/s);
  return pre ? `${main} ${pre.replace(/\./g, " ")}` : r;
}
