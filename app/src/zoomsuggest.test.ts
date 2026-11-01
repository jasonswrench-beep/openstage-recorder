// SPDX-License-Identifier: Apache-2.0
// Tests for finding the clicks and the picture size that suggested zooms need, against the pretend recorder and against folders held in memory.
import assert from "node:assert/strict";
import { test } from "node:test";
import { suggestZooms } from "../../capture-edit/src/index.ts";
import { memoryFolder, readProject } from "../../capture-timeline/src/project.ts";
import { RecorderController } from "./capturecontroller.ts";
import { defaultSettings, recordingPath, type RecordSettings } from "./capturesession.ts";
import { recordingFolder } from "./recordingfolder.ts";
import { makePreviewBackend } from "./standin.ts";
import { gatherClicks, nothingToSuggestFrom, screenTakes } from "./zoomsuggest.ts";

const SPEED = 100;
const LIBRARY = "C:\\Users\\You\\Videos\\OpenStage Recorder";

async function until(what: string, ok: () => boolean): Promise<void> {
  const end = Date.now() + 5000;
  while (Date.now() < end) {
    if (ok()) return;
    await new Promise((r) => setTimeout(r, 5));
  }
  assert.fail(`timed out waiting for ${what}`);
}

/** Record for about 20 pretend seconds with the pretend recorder, with these choices, and open what it made. */
async function recorded(over: Partial<RecordSettings>) {
  const b = makePreviewBackend({ speed: SPEED });
  const c = new RecorderController(b);
  const settings: RecordSettings = { ...defaultSettings(), name: "Demo", countdownSeconds: 0, ...over };
  assert.equal(await c.start(settings, recordingPath(LIBRARY, "Demo")), null);
  await until("20 seconds", () => c.session.elapsedMs >= 20_000);
  await c.act("stop");
  await until("finished", () => c.session.phase === "finished");
  const folder = recordingFolder(b, LIBRARY, "Demo.capture");
  const opened = await readProject(folder);
  assert.ok(opened.ok);
  return { b, folder, model: opened.project.model };
}

const noSize = async (): Promise<undefined> => undefined;

test("a part of a screen recorded with the mouse noted gives its clicks and the picture they were made on, and three zooms", async () => {
  const { folder, model } = await recorded({ target: "region", region: { left: "100", top: "200", width: "1280", height: "720" }, interactions: "no-keys" });
  assert.deepEqual(screenTakes(model), [1]);
  const got = await gatherClicks(folder, model, noSize);
  assert.deepEqual(got.notes, []);
  assert.equal(got.notNoted, 0);
  const take = got.takes.get(1);
  assert.ok(take);
  assert.deepEqual(take.picture, { width: 1280, height: 720, left: 100, top: 200 });
  assert.deepEqual(take.clicks.map((c) => c.name), ["Open", "Open", "Save", ""]);
  const found = suggestZooms(model, got.takes);
  assert.equal(found.length, 3, "two clicks on Open are one moment, then Save, then the last");
  assert.equal(found[0]?.name, "Open");
  assert.equal(found[0]?.clicks, 2);
  assert.equal(found[1]?.name, "Save");
  // the second moment is at 0.8 and 0.75 of the picture, whatever its size and corner
  const second = found[1]?.rect;
  assert.ok(second && Math.abs(second.x + second.width / 2 - 8000) < 60 || (second && second.x + second.width === 10_000), "towards the right");
});

test("a whole screen needs the picture's size read from the video, and says so in words when it cannot be", async () => {
  const { folder, model } = await recorded({ interactions: "no-keys" });
  const got = await gatherClicks(folder, model, noSize);
  assert.equal(got.takes.size, 0);
  assert.match(got.notes.join(" "), /^The size of the picture of take 1 could not be read, so no zooms are suggested from its clicks\.$/);
  assert.match(nothingToSuggestFrom(got), /could not be read/);
});

test("a whole screen with a readable video gives the same clicks on a picture of the video's size", async () => {
  const files = {
    "capture.json": JSON.stringify({ format: "openstage-capture-project", title: "Lesson" }),
    "takes/take-001/take.json": JSON.stringify({
      id: 1, state: "complete", durationMs: 20_000,
      media: [{ file: "screen.mp4", kind: "screen" }, { file: "events.jsonl", kind: "interactions", container: "jsonl", interactions: { display: 1, keys: false } }],
    }),
    "takes/take-001/events.jsonl": '{"t":2000,"type":"click","x":640,"y":360,"button":"left"}\n',
  };
  const folder = memoryFolder("Lesson.capture", files, { "takes/take-001/screen.mp4": "blob:video" });
  const opened = await readProject(folder);
  assert.ok(opened.ok);
  const asked: string[] = [];
  const got = await gatherClicks(folder, opened.project.model, async (url) => { asked.push(url); return { width: 1280, height: 720 }; });
  assert.deepEqual(asked, ["blob:video"]);
  assert.deepEqual(got.takes.get(1)?.picture, { width: 1280, height: 720, left: 0, top: 0 });
  const [z] = suggestZooms(opened.project.model, got.takes);
  assert.ok(z);
  assert.ok(Math.abs(z.rect.x + z.rect.width / 2 - 5000) <= 1, "the click was in the middle of a 1280 by 720 picture");
});

test("a recording that did not note the mouse says how to, and a log with no clicks says there were none", async () => {
  const { folder, model } = await recorded({ interactions: "off" });
  const got = await gatherClicks(folder, model, noSize);
  assert.equal(got.takes.size, 0);
  assert.equal(got.notNoted, 1);
  assert.match(nothingToSuggestFrom(got), /did not note where the mouse went.*Tick "Note where the mouse goes and where I click"/);

  const files = {
    "capture.json": JSON.stringify({ format: "openstage-capture-project", title: "Quiet" }),
    "takes/take-001/take.json": JSON.stringify({
      id: 1, state: "complete", durationMs: 20_000,
      media: [{ file: "screen.mp4", kind: "screen" }, { file: "events.jsonl", kind: "interactions", container: "jsonl", interactions: { display: 1, keys: false } }],
    }),
    "takes/take-001/events.jsonl": '{"t":40,"type":"cursorMove","x":1,"y":1}\n',
  };
  const quiet = memoryFolder("Quiet.capture", files);
  const opened = await readProject(quiet);
  assert.ok(opened.ok);
  const none = await gatherClicks(quiet, opened.project.model, noSize);
  assert.equal(none.takes.size, 0);
  assert.equal(none.notNoted, 0);
  assert.match(nothingToSuggestFrom(none), /^No clicks were noted in this recording/);
});

test("a take file that cannot be read does not stop the others being used", async () => {
  const good = JSON.stringify({ id: 1, state: "complete", durationMs: 20_000, media: [{ file: "screen.mp4", kind: "screen", region: { display: 1, x: 0, y: 0, width: 640, height: 360 } }, { file: "events.jsonl", kind: "interactions", container: "jsonl", interactions: { display: 1, keys: false } }] });
  const files = {
    "capture.json": JSON.stringify({ format: "openstage-capture-project", title: "Two" }),
    "takes/take-001/take.json": good,
    "takes/take-001/events.jsonl": '{"t":2000,"type":"click","x":320,"y":180,"button":"left"}\n',
    "takes/take-002/take.json": good.replace('"id":1', '"id":2'),
    "takes/take-002/events.jsonl": "not json at all\n",
  };
  const folder = memoryFolder("Two.capture", files);
  const opened = await readProject(folder);
  assert.ok(opened.ok);
  assert.deepEqual(screenTakes(opened.project.model), [1, 2]);
  const got = await gatherClicks(folder, opened.project.model, noSize);
  assert.deepEqual([...got.takes.keys()], [1]);
});
