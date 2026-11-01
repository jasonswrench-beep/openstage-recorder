// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  MAX_SUGGESTIONS, MAX_ZOOM_SIZE, MIN_ZOOM_MS, MIN_ZOOM_SIZE, addClip, addTrack, addZoomRegion, createModel, describeSuggestion, readClicks, suggestZooms, validate,
  type LoggedClick, type TakeClicks,
} from "../src/index.ts";
import { SCREEN, SOURCES, ok, sample } from "./helpers.ts";

const WHOLE = { width: 1920, height: 1080, left: 0, top: 0 };
const click = (t: number, x: number, y: number, name = ""): LoggedClick => ({ t, x, y, name });
const takes = (clicks: LoggedClick[], picture = WHOLE): ReadonlyMap<number, TakeClicks> => new Map([[1, { clicks, picture }]]);

test("the clicks are read from the log: left and right presses, with the name of what was clicked, and bad lines are skipped", () => {
  const text = [
    '{"t":40,"type":"cursorMove","x":640,"y":470}',
    '{"t":1200,"type":"click","x":640,"y":480,"button":"left"}',
    '{"t":1200,"type":"element","name":"Save","role":"button"}',
    '{"t":2000,"type":"click","x":10,"y":20,"button":"middle"}',
    '{"t":2100,"type":"key","key":"s","modifiers":["ctrl"]}',
    "this line was cut short by a cras",
    '{"t":3000,"type":"click","x":700,"y":500,"button":"right"}',
    '{"t":3500,"type":"element","name":"Late","role":"button"}',
    '{"t":-5,"type":"click","x":1,"y":1,"button":"left"}',
    '{"t":4000,"type":"click","x":"7","y":1,"button":"left"}',
    "",
    '{"t":5000,"type":"click","x":900,"y":100,"button":"left"}',
  ].join("\r\n");
  assert.deepEqual(readClicks(text), [click(1200, 640, 480, "Save"), click(3000, 700, 500), click(5000, 900, 100)]);
  assert.deepEqual(readClicks(""), []);
});

test("two clicks close together are one moment: a zoom a second before the first click to a second and a half after the last", () => {
  const s = sample();
  const found = suggestZooms(s.model, takes([click(5000, 960, 540), click(6000, 1000, 560)]));
  assert.equal(found.length, 1);
  const z = found[0];
  assert.ok(z);
  assert.equal(z.startMs, 4000);
  assert.equal(z.durationMs, 3500);
  assert.equal(z.clicks, 2);
  assert.equal(z.rect.width, z.rect.height, "the picture's shape");
  assert.equal(z.rect.width, MIN_ZOOM_SIZE, "close clicks give the closest zoom, three times");
  const centre = z.rect.x + z.rect.width / 2;
  assert.ok(Math.abs(centre - 5100) < 60, `centred on the clicks, not ${centre}`);
  assert.equal(z.name, "");
});

test("a zoom is never shorter than 2.5 seconds, never starts before the beginning, and never leaves the picture", () => {
  const s = sample();
  const [z] = suggestZooms(s.model, takes([click(200, 10, 10)]));
  assert.ok(z);
  assert.equal(z.startMs, 0);
  assert.equal(z.durationMs, MIN_ZOOM_MS);
  assert.deepEqual([z.rect.x, z.rect.y], [0, 0], "kept inside the corner");
  const [far] = suggestZooms(s.model, takes([click(20_000, 1915, 1075)]));
  assert.ok(far);
  assert.equal(far.rect.x + far.rect.width, 10_000, "kept inside the opposite corner");
  assert.equal(far.rect.y + far.rect.height, 10_000);
});

test("clicks more than 4 seconds apart, or far apart on the picture, are different moments", () => {
  const s = sample();
  const apart = suggestZooms(s.model, takes([click(5000, 500, 500), click(9500, 520, 510)]));
  assert.equal(apart.length, 2, "4.5 seconds apart");
  const together = suggestZooms(s.model, takes([click(5000, 500, 500), click(9000, 520, 510)]));
  assert.equal(together.length, 1, "exactly 4 seconds apart is still one moment");
  const wide = suggestZooms(s.model, takes([click(5000, 100, 100), click(5500, 1800, 1000)]));
  assert.equal(wide.length, 1, "one in each corner is two moments, but their zooms would overlap, so only the first is kept");
  assert.ok(wide[0] && wide[0].clicks === 1 && wide[0].rect.x < 2000, "and it is the one at the top left");
  const medium = suggestZooms(s.model, takes([click(5000, 600, 400), click(5500, 1100, 700)]));
  assert.equal(medium.length, 1);
  assert.ok(medium[0] && medium[0].rect.width > MIN_ZOOM_SIZE && medium[0].rect.width <= MAX_ZOOM_SIZE, "clicks further apart need a wider zoom, but never wider than 1.5 times");
});

test("when every click of a moment was on the same named thing the suggestion says so, and otherwise it does not guess", () => {
  const s = sample();
  const same = suggestZooms(s.model, takes([click(5000, 960, 540, "Save"), click(6000, 980, 550, "Save")]));
  assert.equal(same[0]?.name, "Save");
  const mixed = suggestZooms(s.model, takes([click(5000, 960, 540, "Save"), click(6000, 980, 550, "Cancel")]));
  assert.equal(mixed[0]?.name, "");
  assert.match(describeSuggestion(same[0]!), /around "Save" \(2 clicks\)\.$/);
  assert.match(describeSuggestion(mixed[0]!), /around where you clicked \(2 clicks\)\.$/);
});

test("a recording of part of a screen puts the clicks on the picture by taking away where the region starts", () => {
  const s = sample();
  const region = { width: 1280, height: 720, left: 100, top: 200 };
  const [z] = suggestZooms(s.model, takes([click(5000, 740, 560)], region));
  assert.ok(z);
  const centreX = z.rect.x + z.rect.width / 2;
  const centreY = z.rect.y + z.rect.height / 2;
  assert.ok(Math.abs(centreX - 5000) <= 1 && Math.abs(centreY - 5000) <= 1, `the middle of the picture, not ${centreX}, ${centreY}`);
  assert.deepEqual(suggestZooms(s.model, takes([click(5000, 50, 560)], region)), [], "a click left of the region is not on the picture");
  assert.deepEqual(suggestZooms(s.model, takes([click(5000, 1500, 560)], region)), [], "nor one to its right");
});

test("only the part of the take that the edit uses counts, and times are those of the edit, not of the take", () => {
  const screen = addTrack(createModel(SOURCES), "screen");
  // The edit uses 10 to 30 seconds of the take and places it at 2 seconds: take time 12 s is edit time 4 s.
  const model = ok(addClip(screen.model, screen.focus?.[0] ?? "", { source: SCREEN, startMs: 2000, sourceStartMs: 10_000, sourceEndMs: 30_000, name: "Middle" })).model;
  const found = suggestZooms(model, takes([click(5000, 960, 540), click(12_000, 960, 540), click(40_000, 960, 540)]));
  assert.equal(found.length, 1, "the clicks before and after the used part are left out");
  assert.equal(found[0]?.startMs, 2000 + (12_000 - 10_000) - 1000, "edit time: 2 s + 2 s into the used part, less the lead");
});

test("no suggestion overlaps a zoom that is already there, or another suggestion", () => {
  const s = sample();
  const withZoom = ok(addZoomRegion(s.model, { x: 0, y: 0, width: 5000, height: 5000 }, 3000, 4000)).model;
  const found = suggestZooms(withZoom, takes([click(5000, 960, 540), click(20_000, 960, 540)]));
  assert.deepEqual(found.map((z) => z.startMs), [19_000], "the moment at 5 s falls in the zoom from 3 s to 7 s");
});

test("at most ten are suggested, the busiest moments first, and they come back in time order", () => {
  const s = sample();
  const clicks: LoggedClick[] = [];
  for (let i = 0; i < 14; i += 1) {
    const t = 1000 + i * 4200;
    clicks.push(click(t, 300, 300));
    if (i === 13) clicks.push(click(t + 500, 310, 300), click(t + 900, 320, 305));
  }
  const found = suggestZooms(s.model, takes(clicks));
  assert.equal(found.length, MAX_SUGGESTIONS);
  assert.ok(found.some((z) => z.clicks === 3), "the busiest moment is among them");
  assert.deepEqual(found.map((z) => z.startMs), [...found.map((z) => z.startMs)].sort((a, b) => a - b));
  assert.equal(suggestZooms(s.model, takes(clicks), 3).length, 3, "the limit can be asked for");
});

test("nothing is suggested without clicks, for a take that is not known, or for a picture with no size", () => {
  const s = sample();
  assert.deepEqual(suggestZooms(s.model, takes([])), []);
  assert.deepEqual(suggestZooms(s.model, new Map([[2, { clicks: [click(5000, 1, 1)], picture: WHOLE }]])), []);
  assert.deepEqual(suggestZooms(s.model, takes([click(5000, 1, 1)], { width: 0, height: 0, left: 0, top: 0 })), []);
});

test("every suggestion can be added to the edit as it stands, and leaves the edit with no errors", () => {
  const s = sample();
  const found = suggestZooms(s.model, takes([click(3000, 400, 300, "Open"), click(4000, 420, 310, "Open"), click(15_000, 1500, 800), click(30_000, 960, 540)]));
  assert.equal(found.length, 3);
  let model = s.model;
  for (const z of found) model = ok(addZoomRegion(model, z.rect, z.startMs, z.durationMs)).model;
  assert.deepEqual(validate(model).filter((p) => p.severity === "error"), []);
  const wording = validate(model).filter((p) => /no description/.test(p.message));
  assert.equal(wording.length, 3, "each still asks for a description: a suggestion does not invent one");
});

test("a suggestion is described in a sentence with its time, length, closeness, place and clicks", () => {
  const s = sample();
  const [z] = suggestZooms(s.model, takes([click(5000, 960, 540)]));
  assert.ok(z);
  assert.equal(describeSuggestion(z), "At 4 seconds, for 2.5 seconds: 3 times on the middle of the picture, around where you clicked (1 click).");
});
