// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  EDIT_SCHEMA_VERSION,
  addClip,
  deleteRange,
  describeClip,
  joinWithNext,
  momentAt,
  parse,
  serialize,
  setFades,
  setTransition,
  splitAt,
  trimEnd,
  validate,
  versionFor,
} from "../src/index.ts";
import { LONG_VIDEO, SHORT_VIDEO, clipOf, clipsOn, ok, refused, sample } from "./helpers.ts";

/** An edit with two touching clips from different files on the media track: the short video, then the long one. */
function twoVideos() {
  const s = sample();
  let model = s.model;
  const first = ok(addClip(model, s.mediaTrack, { source: SHORT_VIDEO, startMs: 0, sourceStartMs: 0, sourceEndMs: 10_000 }));
  model = first.model;
  const second = ok(addClip(model, s.mediaTrack, { source: LONG_VIDEO, startMs: 10_000, sourceStartMs: 0, sourceEndMs: 10_000 }));
  return { model: second.model, a: first.focus?.[0] ?? "", b: second.focus?.[0] ?? "", track: s.mediaTrack, screen: s.screen, mic: s.mic };
}

test("a transition is set, said, found in the clip's sentence, and taken away", () => {
  const t = twoVideos();
  const r = ok(setTransition(t.model, t.b, "in", "cross-fade", 800));
  assert.match(r.message, /now arrives with a cross-fade of 0.8 seconds/);
  assert.deepEqual(clipOf(r.model, t.b).transitionIn, { kind: "cross-fade", durationMs: 800 });
  assert.match(describeClip(r.model, t.b), /arrives with a cross-fade of 0.8 seconds/);
  assert.deepEqual(validate(r.model).filter((p) => p.severity === "error"), []);
  const gone = ok(setTransition(r.model, t.b, "in", null));
  assert.equal(clipOf(gone.model, t.b).transitionIn, undefined);
});

test("only a fade can be used on the way out, and sound has no transitions", () => {
  const t = twoVideos();
  assert.match(refused(setTransition(t.model, t.a, "out", "wipe-down")), /Only a fade can be used when a clip leaves/);
  assert.match(refused(setTransition(t.model, t.mic, "in", "fade")), /sound only/);
  assert.match(ok(setTransition(t.model, t.a, "out", "fade")).message, /leaves with a fade of 0.5 seconds/);
});

test("lengths are limited, and the two together must fit in the clip", () => {
  const t = twoVideos();
  assert.match(refused(setTransition(t.model, t.b, "in", "fade", 50)), /lasts from 0.1 seconds to 5 seconds/);
  assert.match(refused(setTransition(t.model, t.b, "in", "fade", 6000)), /lasts from/);
  const shorter = ok(trimEnd(t.model, t.b, 16_000)).model;
  const r = ok(setTransition(shorter, t.b, "in", "fade", 5000));
  assert.match(refused(setTransition(r.model, t.b, "out", "fade", 2000)), /together|longer/);
});

test("a blend with nothing before it comes in over black, and the sentence says so", () => {
  const t = twoVideos();
  const r = ok(setTransition(t.model, t.a, "in", "wipe-right"));
  assert.match(r.message, /Warning: .*no picture ends where it starts, so it comes in over black/);
  assert.equal(ok(setTransition(t.model, t.a, "in", "fade")).message.includes("Warning"), false, "a fade needs no neighbour");
});

test("an edit with a transition is written as 0.4 and read back the same; one without is still 0.3", () => {
  const t = twoVideos();
  assert.equal(versionFor(t.model), "0.3.0");
  const r = ok(setTransition(t.model, t.b, "in", "slide"));
  assert.equal(versionFor(r.model), EDIT_SCHEMA_VERSION);
  const text = serialize(r.model);
  assert.match(text, /"schemaVersion": "0.4.0"/);
  const back = parse(text);
  assert.ok(back.ok);
  if (back.ok) {
    assert.deepEqual(clipOf(back.model, t.b).transitionIn, { kind: "slide", durationMs: 500 });
    assert.equal(serialize(back.model), text, "saved, reopened and saved again is the same text");
  }
});

test("a file with a transition that is wrong is read, and its problems are given", () => {
  const t = twoVideos();
  const r = ok(setTransition(t.model, t.b, "in", "fade"));
  const doc = JSON.parse(serialize(r.model)) as { tracks: Array<{ clips: Array<Record<string, unknown>> }> };
  const clip = doc.tracks.flatMap((x) => x.clips).find((c) => c["id"] === t.b);
  if (clip === undefined) throw new Error("no clip");
  clip["transitionIn"] = { kind: "fade", durationMs: 99_000 };
  const back = parse(JSON.stringify(doc));
  assert.ok(back.ok);
  if (back.ok) assert.ok(back.problems.some((p) => p.code === "bad-transition" && p.severity === "error"));
  clip["transitionIn"] = { kind: "spin", durationMs: 500 };
  assert.match(JSON.stringify(parse(JSON.stringify(doc))), /does not know: spin/);
});

test("splitting puts the starting transition on the first piece and the ending one on the second", () => {
  const t = twoVideos();
  let model = ok(setTransition(t.model, t.b, "in", "cross-fade")).model;
  model = ok(setTransition(model, t.b, "out", "fade")).model;
  const split = ok(splitAt(model, 15_000, t.track));
  const [left, right] = clipsOn(split.model, t.track).filter((c) => c.startMs >= 10_000);
  assert.ok(left && right);
  assert.equal(left.transitionIn?.kind, "cross-fade");
  assert.equal(left.transitionOut, undefined);
  assert.equal(right.transitionIn, undefined);
  assert.equal(right.transitionOut?.kind, "fade");
  assert.deepEqual(validate(split.model).filter((p) => p.severity === "error"), []);
});

test("joining takes the starting transition of the first and the ending one of the second", () => {
  const t = twoVideos();
  let model = ok(splitAt(t.model, 15_000, t.track)).model;
  const [a, b] = clipsOn(model, t.track).filter((c) => c.startMs >= 10_000);
  assert.ok(a && b);
  model = ok(setTransition(model, a.id, "in", "wipe-down")).model;
  model = ok(setTransition(model, b.id, "out", "fade")).model;
  const joined = ok(joinWithNext(model, a.id));
  const one = clipOf(joined.model, joined.focus?.[0] ?? "");
  assert.equal(one.transitionIn?.kind, "wipe-down");
  assert.equal(one.transitionOut?.kind, "fade");
});

test("trimming a clip shorter shrinks a transition that no longer fits, as far as the least it can be", () => {
  const t = twoVideos();
  let model = ok(setTransition(t.model, t.b, "in", "fade", 2000)).model;
  model = ok(trimEnd(model, t.b, 11_500)).model;
  assert.equal(clipOf(model, t.b).transitionIn?.durationMs, 1500);
  model = ok(trimEnd(model, t.b, 10_100)).model;
  assert.equal(clipOf(model, t.b).transitionIn?.durationMs, 100, "never shorter than the least a transition can be");
  assert.deepEqual(validate(model).filter((p) => p.severity === "error"), []);
});

test("while it plays, a cross-fade holds the clip before underneath and eases in the new one; reduced motion cuts", () => {
  const t = twoVideos();
  const model = ok(setTransition(t.model, t.b, "in", "cross-fade", 1000)).model;
  const mid = momentAt(model, 10_500);
  const media = mid.pictures.filter((p) => p.trackKind === "media");
  assert.equal(media.length, 2);
  assert.equal(media[0]?.held, true);
  assert.equal(media[0]?.clipId, t.a);
  assert.equal(media[0]?.transition?.phase, "under");
  assert.equal(media[1]?.clipId, t.b);
  assert.equal(media[1]?.transition?.phase, "in");
  assert.equal(media[1]?.transition?.progress, 0.5);
  assert.ok((media[0]?.sourceMs ?? 0) < 10_000, "the held picture is the last of the clip before");
  const done = momentAt(model, 11_000).pictures.filter((p) => p.trackKind === "media");
  assert.equal(done.length, 1);
  assert.equal(done[0]?.transition, undefined);
  const cut = momentAt(model, 10_500, { reduceMotion: true }).pictures.filter((p) => p.trackKind === "media");
  assert.equal(cut.length, 1);
  assert.equal(cut[0]?.transition, undefined);
});

test("a fade is from black, and a blend with another part of the same recording is a cut", () => {
  const t = twoVideos();
  const fade = ok(setTransition(t.model, t.b, "in", "fade", 1000)).model;
  const m = momentAt(fade, 10_250).pictures.filter((p) => p.trackKind === "media");
  assert.equal(m.length, 1);
  assert.equal(m[0]?.transition?.kind, "fade");
  const same = ok(splitAt(t.model, 15_000, t.track)).model;
  const second = clipsOn(same, t.track).find((c) => c.startMs === 15_000);
  const blended = ok(setTransition(same, second?.id ?? "", "in", "cross-fade", 1000)).model;
  const during = momentAt(blended, 15_200).pictures.filter((p) => p.trackKind === "media");
  assert.equal(during.length, 1);
  assert.equal(during[0]?.transition, undefined, "the same recording carries on, so it is a cut");
  assert.equal(during[0]?.held, undefined);
});

test("deleting the middle of a clip drops the transition that would now sit mid-clip", () => {
  const t = twoVideos();
  let model = ok(setTransition(t.model, t.b, "in", "fade")).model;
  model = ok(setTransition(model, t.b, "out", "fade")).model;
  const cut = ok(deleteRange(model, 12_000, 14_000, false, [t.track]));
  const pieces = clipsOn(cut.model, t.track).filter((c) => c.startMs >= 10_000);
  assert.equal(pieces.length, 2);
  assert.equal(pieces[0]?.transitionIn?.kind, "fade");
  assert.equal(pieces[0]?.transitionOut, undefined);
  assert.equal(pieces[1]?.transitionIn, undefined);
  assert.equal(pieces[1]?.transitionOut?.kind, "fade");
  void setFades;
});
