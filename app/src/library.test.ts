// SPDX-License-Identifier: Apache-2.0
// The Recordings tab's cards: what is read from a recording's files, the words on its card, sorting and searching.
import { test } from "node:test";
import assert from "node:assert/strict";
import { countText, detailsText, madeWords, matchesSearch, sortRecordings, summarize, type RecordingSummary } from "./library.ts";

const capture = (title: string, created?: string) => JSON.stringify({ format: "openstage-capture-project", title, ...(created ? { created } : {}) });
const take = (state: string, durationMs: number) => JSON.stringify({ id: 1, state, durationMs });

test("a recording's title, date, length and takes are read from its files; a take set aside is kept but not counted", () => {
  const s = summarize("Week 3.capture", capture("Week 3 walkthrough", "2026-11-10T14:00:00Z"), [take("complete", 60_000), take("setAside", 9_000), take("recovered", 18_000)], "{}");
  assert.deepEqual(s, { name: "Week 3.capture", title: "Week 3 walkthrough", created: "2026-11-10T14:00:00Z", lengthMs: 78_000, takes: 2, edited: true, problem: "" });
});

test("a recording without a title is called by its folder; one whose description cannot be read says so", () => {
  assert.equal(summarize("Demo.capture", capture(""), [], undefined).title, "Demo");
  const broken = summarize("Broken.capture", "{not json", [], undefined);
  assert.equal(broken.title, "Broken");
  assert.match(broken.problem, /could not be read/);
  assert.match(detailsText(broken, new Date()), /could not be read/);
});

test("the line under a card says how long, how many takes, and when it was made", () => {
  const now = new Date(2026, 10, 10, 15, 0);
  const s = summarize("A.capture", capture("A", new Date(2026, 10, 10, 9, 0).toISOString()), [take("complete", 258_000)], undefined);
  assert.equal(detailsText(s, now), "4 minutes 18 seconds, made today");
  assert.equal(detailsText({ ...s, takes: 3 }, now), "4 minutes 18 seconds, 3 takes, made today");
  assert.equal(detailsText({ ...s, created: null }, now), "4 minutes 18 seconds");
  assert.equal(detailsText({ ...s, takes: 0, lengthMs: 0 }, now), "No take recorded yet, made today");
  assert.equal(madeWords(new Date(2026, 10, 9, 23, 0).toISOString(), now), "yesterday");
  assert.equal(madeWords(new Date(2026, 9, 31, 12, 0).toISOString(), now), "October 31, 2026");
});

test("newest first, oldest first, or A to Z; without a date the folder's name (which starts with the date) stands in", () => {
  const r = (title: string, created: string | null, name = `${title}.capture`): RecordingSummary => ({ name, title, created, lengthMs: 0, takes: 1, edited: false, problem: "" });
  const list = [r("Beta", "2026-11-09T10:00:00Z"), r("alpha", "2026-11-10T10:00:00Z"), r("Gamma", "2026-11-08T10:00:00Z")];
  assert.deepEqual(sortRecordings(list, "newest").map((s) => s.title), ["alpha", "Beta", "Gamma"]);
  assert.deepEqual(sortRecordings(list, "oldest").map((s) => s.title), ["Gamma", "Beta", "alpha"]);
  assert.deepEqual(sortRecordings(list, "name").map((s) => s.title), ["alpha", "Beta", "Gamma"]);
  const undated = [r("x", null, "Recording 2026-11-09 1000.capture"), r("y", null, "Recording 2026-11-10 0900.capture")];
  assert.deepEqual(sortRecordings(undated, "newest").map((s) => s.title), ["y", "x"]);
  assert.deepEqual(sortRecordings(list, "name"), sortRecordings([...list].reverse(), "name"), "the order does not depend on the order read");
});

test("the search fits every word typed, anywhere in the title or the folder's name, ignoring case", () => {
  const s: RecordingSummary = { name: "Recording 2026-11-10 2214.capture", title: "Week 3 walkthrough", created: null, lengthMs: 0, takes: 1, edited: false, problem: "" };
  assert.ok(matchesSearch(s, "week WALK"));
  assert.ok(matchesSearch(s, "2214"));
  assert.ok(matchesSearch(s, "   "));
  assert.ok(!matchesSearch(s, "week 5"));
});

test("the count above the cards", () => {
  assert.equal(countText(0, 0, ""), "Nothing has been recorded in this folder yet.");
  assert.equal(countText(3, 3, ""), "3 recordings.");
  assert.equal(countText(1, 1, ""), "1 recording.");
  assert.equal(countText(1, 3, "week"), "1 of 3 recordings fits the search.");
  assert.equal(countText(0, 3, "zzz"), "None of the 3 recordings has those words in its name.");
});
