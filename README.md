# OpenStage Recorder

A light, free screen recorder for Windows. Apache-2.0.

You pick what to record: an app (one window), a screen, or part of a screen. It records your microphone and the computer's sound, and the webcam if you choose. A simple editor lets you cut the recording up, add transitions, blur part of the picture, zoom in, and highlight the cursor. It saves an MP4. Captions are made outside the program to start with.

It has no courses, slides, quizzes or publishing. It is its own product, made by the OpenStage Author project. The recorder that sits inside OpenStage Author is called OpenScreen; this one is OpenStage Recorder.

## Where this stands

**This is the base only. The app does not exist yet.** What is here is the recording engine and the editing parts, taken from OpenStage Author, so that the app can be built on them. Nothing in this folder has a window of its own.

| Part | What it is | State |
|---|---|---|
| `capture/` | The recording program (`openstage-capture`), the exporter, the Windows parts, the double-click test scripts and the rule checker. Rust | Run on a Windows computer in OpenStage's work; see `capture/README.md` for exactly what passed |
| `capture-edit/` | The edit model: clips, trim, split, join, transitions, blur, zoom, undo and redo, in plain words. TypeScript, no runtime dependencies | Tested by scripts |
| `capture-timeline/` | The editing screens: clip list, timeline, preview, opening and saving. TypeScript and plain DOM | Tested by scripts and in a browser. **Not heard with a screen reader by me**; see its README |
| `docs/capture/` | The documents the engine was built from: the protocol, the two file formats, the brief, the requirements, the roadmap | Written for OpenStage Capture, which is wider than this product. Read them as background |
| `docs/recorder/` | This product: the plan, the manifest of what was copied and from where, and decision records | New |

The layout and the paths of the first four are the same as in OpenStage Author on purpose, so a fix made in one place can be carried to the other by comparing like with like.

## What is not built yet

The app window, the recorder controls (choose a window, screen or region; choose a camera), the simple editor screen with the tools left out that this product does not offer, the cursor highlight, an installer. `docs/recorder/plan.md` says what each is and the order.

## Checking it

The same checks as in OpenStage, run from this folder:

- `python -I capture/tools/check_rules.py` (on Windows `python`, not `python3`): licences of the Rust libraries, no FFmpeg, file headers, no em dashes, batch file rules.
- Rust: `cargo test --workspace` in `capture/` (needs `rust-setup.bat` first on a Windows computer without Rust on the PATH).
- TypeScript: `tsc` and `node --test "test/*.test.ts"` in `capture-edit/` and `capture-timeline/`.

`capture/README.md` lists the double-click scripts for Windows.

## Licence

Apache License 2.0. See `LICENSE` and `NOTICE`.
