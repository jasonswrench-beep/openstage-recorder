// SPDX-License-Identifier: Apache-2.0
// The Recordings tab's cards (the design specification's mockup R03): what each recording is, read from its own files (capture.json for
// its title and when it was made, a take.json for each take with how long it ran, and whether an edit.json is there), and the words on its
// card. It is all read, never written: a recording is never changed by being listed. The pure parts are tested in library.test.ts.

import { formatTime } from "./capturesession.ts";

export interface RecordingSummary {
  /** The folder's name, such as `Recording 2026-11-10 2214.capture`. */
  name: string;
  /** What the card is called: the recording's own title, or the folder's name without `.capture`. */
  title: string;
  /** When it was made (ISO 8601), or null if its files do not say. */
  created: string | null;
  /** How long its takes ran, not counting a take set aside with Start again. */
  lengthMs: number;
  /** How many takes count (set-aside takes are kept, but not counted). */
  takes: number;
  /** Whether it has a saved edit. */
  edited: boolean;
  /** Why it could not be read, or an empty text. */
  problem: string;
}

const object = (text: string | undefined): Record<string, unknown> | null => {
  if (text === undefined) return null;
  try {
    const v: unknown = JSON.parse(text);
    return v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
};

/** What a recording is, from its files as they were read (undefined for a file that is not there). */
export function summarize(name: string, captureText: string | undefined, takeTexts: readonly (string | undefined)[], editText: string | undefined): RecordingSummary {
  const fallback = name.replace(/\.capture$/i, "");
  const capture = object(captureText);
  const title = typeof capture?.["title"] === "string" && capture["title"].trim() !== "" ? capture["title"].trim() : fallback;
  const created = typeof capture?.["created"] === "string" && !Number.isNaN(Date.parse(capture["created"])) ? capture["created"] : null;
  let lengthMs = 0;
  let takes = 0;
  for (const text of takeTexts) {
    const take = object(text);
    if (take === null || take["state"] === "setAside") continue;
    takes++;
    const ms = Number(take["durationMs"]);
    if (Number.isFinite(ms) && ms > 0) lengthMs += ms;
  }
  const problem = capture === null ? "Its description (capture.json) could not be read, so it may not open." : "";
  return { name, title, created, lengthMs, takes, edited: editText !== undefined, problem };
}

/** "Today", "Yesterday", or the date in words (November 10, 2026), in the computer's own time. */
export function madeWords(iso: string, now: Date): string {
  const made = new Date(iso);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((day(now) - day(made)) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return made.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

/** The line under a card's name: "4 minutes 18 seconds, 1 take, made today". */
export function detailsText(s: RecordingSummary, now: Date): string {
  if (s.problem !== "") return s.problem;
  const parts = [s.takes === 0 ? "No take recorded yet" : formatTime(s.lengthMs), s.takes > 1 ? `${s.takes} takes` : ""];
  if (s.created !== null) parts.push(`made ${madeWords(s.created, now)}`);
  return parts.filter((p) => p !== "").join(", ");
}

export type SortOrder = "newest" | "oldest" | "name";

/** The recordings in the order chosen. Without a date, the folder's name stands in (a new recording's name starts with the date and time). */
export function sortRecordings(list: readonly RecordingSummary[], order: SortOrder): RecordingSummary[] {
  const when = (s: RecordingSummary) => s.created ?? s.name;
  const byName = (a: RecordingSummary, b: RecordingSummary) => a.title.localeCompare(b.title, "en", { numeric: true, sensitivity: "base" });
  return [...list].sort((a, b) =>
    order === "name" ? byName(a, b)
    : order === "oldest" ? when(a).localeCompare(when(b)) || byName(a, b)
    : when(b).localeCompare(when(a)) || byName(a, b));
}

/** Whether a recording fits what was typed in the search box: every word, anywhere in its title or folder name, ignoring case. */
export function matchesSearch(s: RecordingSummary, query: string): boolean {
  const words = query.toLocaleLowerCase().split(/\s+/).filter((w) => w !== "");
  const hay = `${s.title} ${s.name}`.toLocaleLowerCase();
  return words.every((w) => hay.includes(w));
}

/** The line above the cards: how many there are, or how many fit the search. */
export function countText(shown: number, total: number, query: string): string {
  if (total === 0) return "Nothing has been recorded in this folder yet.";
  const all = `${total} ${total === 1 ? "recording" : "recordings"}`;
  if (query.trim() === "") return `${all}.`;
  return shown === 0 ? `None of the ${all} has those words in its name.` : `${shown} of ${all} ${shown === 1 ? "fits" : "fit"} the search.`;
}
