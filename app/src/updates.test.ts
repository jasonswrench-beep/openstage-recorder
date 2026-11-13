// SPDX-License-Identifier: Apache-2.0
// Check for updates, as the Help tab reads the shell's answer. No test reaches the network.
import { test } from "node:test";
import assert from "node:assert/strict";
import { isReleasePage, pageButtonText, parseUpdateAnswer, releaseWords, RELEASES_PAGE } from "./updates.ts";

test("only this program's release pages can be opened", () => {
  assert.ok(isReleasePage(RELEASES_PAGE));
  assert.ok(isReleasePage("https://github.com/jasonswrench-beep/openstage-recorder/releases/tag/v0.1.0-alpha.4"));
  assert.ok(isReleasePage("https://github.com/jasonswrench-beep/openstage-recorder/releases/tag/v1.2.3"));
  for (const bad of [
    "https://github.com/jasonswrench-beep/openstage-recorder/releases/tag/v0.1.0-alpha.4/../../x",
    "https://github.com/jasonswrench-beep/openstage-recorder/releases/tag/0.1.0",
    "https://github.com/jasonswrench-beep/openstage-author/releases",
    "https://github.com/jasonswrench-beep/openstage-recorder/releases.example.org",
    "http://github.com/jasonswrench-beep/openstage-recorder/releases",
    "javascript:alert(1)",
    "",
  ]) {
    assert.equal(isReleasePage(bad), false, bad);
  }
});

test("the answer is read, and a link that is not a release page is dropped", () => {
  const newer = parseUpdateAnswer(JSON.stringify({ state: "newer", message: "A newer version is published.", url: `${RELEASES_PAGE}/tag/v0.1.0-alpha.5` }));
  assert.deepEqual(newer, { state: "newer", message: "A newer version is published.", url: `${RELEASES_PAGE}/tag/v0.1.0-alpha.5` });
  assert.equal(pageButtonText(newer), "Open the new version's page");
  const sly = parseUpdateAnswer(JSON.stringify({ state: "newer", message: "Go here.", url: "https://example.org/setup.exe" }));
  assert.equal(sly.url, undefined);
  assert.equal(parseUpdateAnswer(JSON.stringify({ state: "current", message: "Up to date." })).state, "current");
  assert.equal(parseUpdateAnswer(JSON.stringify({ state: "something", message: "x" })).state, "error");
  assert.equal(parseUpdateAnswer(JSON.stringify({ state: "off", message: "" })).message, "The answer could not be read.");
  const broken = parseUpdateAnswer("not json");
  assert.equal(broken.state, "error");
  assert.equal(pageButtonText(broken), "Open the releases page");
});

test("the release is said in words", () => {
  assert.equal(releaseWords("0.1.0-alpha.4"), "0.1.0 alpha 4");
  assert.equal(releaseWords("v1.2.3"), "1.2.3");
  assert.match(releaseWords(""), /not known/);
});
