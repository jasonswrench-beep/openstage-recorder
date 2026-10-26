# OpenStage Recorder

A light, free screen recorder for Windows. Apache-2.0.

You pick what to record: an app (one window), a screen, or part of a screen. It records your microphone and the computer's sound, and the webcam if you choose. A simple editor lets you cut the recording up, add transitions, blur part of the picture, zoom in, and highlight the cursor. It saves an MP4. Captions are made outside the program to start with.

It has no courses, slides, quizzes or publishing. It is its own product, made by the OpenStage Author project. The recorder that sits inside OpenStage Author is called OpenScreen; this one is OpenStage Recorder.

## Where this stands

**The app is written for everything in the first scope, and has been tried on Windows only as far as the Record screen.** The recording engine and the editing parts were taken from OpenStage Author. On top of them there is a window (`app/`) with the Record screen (choose an app, a screen or part of a screen, start, pause, mark, stop) and an editing screen for a recording (cut, transitions, blur, cover, zoom, where the webcam sits, balance of your voice and the computer's sound, save, and make an MP4 that says plainly it has no captions). The window was run once on a Windows computer (2026-10-23), where it made a real 13.6 second recording of a screen, a microphone and the computer's sound. **The editing screen and the video maker have not been run on Windows**, only in a browser against a pretend recorder. No screen reader has been used on any of it.

| Part | What it is | State |
|---|---|---|
| `capture/` | The recording program (`openstage-capture`), the exporter, the Windows parts, the double-click test scripts and the rule checker. Rust | Run on a Windows computer in OpenStage's work; see `capture/README.md` for exactly what passed |
| `capture-edit/` | The edit model: clips, trim, split, join, transitions, blur, zoom, undo and redo, in plain words. TypeScript, no runtime dependencies | Tested by scripts |
| `capture-timeline/` | The editing screens: clip list, timeline, preview, opening and saving. TypeScript and plain DOM | Tested by scripts and in a browser. **Not heard with a screen reader by me**; see its README |
| `docs/capture/` | The documents the engine was built from: the protocol, the two file formats, the brief, the requirements, the roadmap | Written for OpenStage Capture, which is wider than this product. Read them as background |
| `app/` | The window: the Record screen (TypeScript), a thin Tauri shell (Rust) and the rules it keeps (`app/core`, Rust, tested without a window). Includes a pretend recorder so the screens can be tried and checked in a browser | The Rust rules and the web checks pass on Linux. On 2026-10-23 the owner built and ran it on Windows and made one real recording with it; the recorder's own checks passed for the picture and the microphone. Not yet tried: choosing one window or part of a screen, the webcam, a long recording, the keys with another program in front, a keyboard or screen reader pass |
| `docs/recorder/` | This product: the plan, the manifest of what was copied and from where, what the app took from OpenStage Author, and decision records | New |

The layout and the paths of the first four are the same as in OpenStage Author on purpose, so a fix made in one place can be carried to the other by comparing like with like.

## What is not built yet

The cursor highlight. The installer is set up but has never been built or run (`docs/recorder/INSTALLER-AND-SIGNING.md`), and is not signed. `docs/recorder/plan.md` says what each is and the order.

## Trying it

On Windows, double-click one of these, in the `app` folder. Both ask before they download anything.

- `OPEN RECORDER PREVIEW.bat` shows the Record screen in your web browser with a pretend recorder. Nothing real is recorded. Use it to try the screen with a keyboard or a screen reader.
- `OPEN RECORDER.bat` builds the app and the recording program the first time, then opens the real thing. It was run once, on 2026-10-23, and built and opened the app.
- `BUILD INSTALLER.bat` builds one installer file, named like `OpenStage Recorder_0.1.0_x64-setup.exe`, in `app\installer`, which installs the app for your own user with no administrator password. **Never run yet.** It is not signed, so Windows will show a blue "Windows protected your PC" box the first time. A build at GitHub also makes a portable folder you can unzip and double-click with nothing to install, and both can be downloaded from the Actions page (steps in `docs/recorder/INSTALLER-AND-SIGNING.md`). `docs/recorder/INSTALLER-AND-SIGNING.md` has what to check and what signing would change.

## Checking it

The same checks as in OpenStage, run from this folder:

- `python -I capture/tools/check_rules.py` (on Windows `python`, not `python3`): licences of the Rust libraries, no FFmpeg, file headers, no em dashes, batch file rules.
- Rust: `cargo test --workspace` in `capture/` (needs `rust-setup.bat` first on a Windows computer without Rust on the PATH).
- TypeScript: `tsc` and `node --test "test/*.test.ts"` in `capture-edit/` and `capture-timeline/`.
- The app: in `app/`, `npm install`, then `npx tsc --noEmit`, `node --test src/*.test.ts`, `npm run build` and `node tools/browser-check.mjs` (needs Playwright); `cargo test` in `app/core`; `python -I app/tools/check_app_licences.py` for the licences of the app's libraries.

`capture/README.md` lists the double-click scripts for Windows.

## Licence

Apache License 2.0. See `LICENSE` and `NOTICE`.
