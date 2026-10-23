# OpenStage Capture: the edit model

The editing logic of OpenStage Capture, without a screen: tracks and clips laid out in time, and the
actions that change them (add, split, trim, move, delete, join, reorder, volume and fades), undo and
redo, the clip list, and a description of what is on screen at any moment. Every action says what it
did in plain words, because the editor must work without a mouse and with a screen reader.

Licence: Apache-2.0. TypeScript, no runtime dependencies.

The file format and the choices made are in [`../docs/capture/capture-edit-format.md`](../docs/capture/capture-edit-format.md).
The same file is read and checked by the Rust renderer side
(`../capture/crates/openstage-capture-project/src/edit.rs`); the examples in `fixtures/` are read by both and
must give the same findings.

## What is in it

| File | What it holds |
|---|---|
| `src/model.ts` | The data: tracks, clips, sources, and small helpers |
| `src/time.ts` | Times in words ("1 minute 12.4 seconds"), typed times, the keyboard steps |
| `src/ops.ts` | The editing actions on clips, and on tracks: removing a stretch of time from every track (clips cut, overlays and zooms shortened, cut in two or dropped, and later things moved earlier when the gap is closed), deleting a track |
| `src/group.ts` | Moving several clips, overlays and zooms at once by the same amount: all or nothing, built on the single moves |
| `src/items.ts` | The actions on overlays and zooms: text, shapes, arrows, blur, redaction, zoom |
| `src/paste.ts` | Copy and paste of clips, overlays and zooms: a snapshot of chosen rows, pasted at a time, all or nothing, on the same kind of track |
| `src/media.ts` | Putting an imported picture, video or sound in the edit (source, track, clip), and saying what text it still needs |
| `src/transitions.ts` | Transitions (fade, cross-fade, two wipes, slide) on the way into or out of a clip: set, change, take away, and said in words (edit format 0.4) |
| `src/callouts.ts` | The callout gallery (text, title, lower third, highlight box, circle, arrow, blur, cover) put in at a time on the first track that takes it, and a zoom from a rectangle made the picture's shape |
| `src/contrast.ts`, `src/regions.ts` | Colours and contrast; rectangles on the picture and saying where they are in words |
| `src/history.ts` | Undo and redo, with a drag as one step |
| `src/limits.ts` | How far a clip, overlay or zoom can be moved or trimmed (the ends of a slider), and how far a group can be moved together, found by asking the editing actions |
| `src/fromTakes.ts` | The first edit of a project, made from its finished takes |
| `src/playback.ts` | What plays at a moment: pictures, sounds and how loud, overlays, zoom |
| `src/validate.ts` | The checks, with codes shared with the Rust reader |
| `src/serialize.ts` | Saving and reading `edit.json` |
| `src/preview.ts` | The clip list, a sentence for a clip (and `describeRows`, one for every row in a single pass, which the clip list screen uses), the described preview |
| `test/` | The tests, including 150 random editing sessions that must stay sound and undo exactly, and 60 random edits checking that every limit agrees with the actions |
| `fixtures/` | Shared examples and `expected.json`, read by the TypeScript and the Rust tests |

## Running the tests

Needs Node 22.6 or later (it runs TypeScript directly, so there is no build step) and, for the type
check, the `typescript` and `@types/node` packages.

```
node --test "test/*.test.ts"      # the tests
tsc -p .                          # the type check
```

Nothing here needs Windows. A person who does not use a terminal does not need to run it: it is checked
before each delivery, and its results are reported in `docs/roadmap.md`.
