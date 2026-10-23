# OpenStage Recorder: plan

Nothing is built yet except the base: the recording engine and the editing parts, copied from OpenStage Author (`IMPORT-MANIFEST.md` lists every file). The app itself does not exist.

## What it is

A light screen recorder for Windows that works on its own, away from OpenStage Author. You pick what to record: an app (one window), a screen, or part of a screen. It records your microphone and the computer's sound, and the webcam if you choose. A simple editor lets you cut it up, add transitions, blur part of the picture, zoom in, and highlight the cursor. It saves an MP4. Captions are made outside the program to start with.

It has no courses, slides, quizzes or publishing. **OpenScreen** stays the name of the recorder inside OpenStage Author. **OpenStage Recorder** is the standalone product.

## What already exists in the recording engine

From OpenStage's code as it stands today (main, commit 01fc056). Checked by reading, not by running.

- Recording a whole screen, one window, or a region (typed numbers, or dragging a rectangle with a keyboard version).
- Microphone, the computer's sound, pause and resume, hotkeys that work in other programs, spoken cues, saving that survives a crash, and a check of the recording afterwards.
- The webcam, recorded as its own file beside the screen, with a list of cameras. At export it can be drawn as a small picture in picture. Its recorder checks passed on a Windows work PC on 2026-10-15; how the picture looks, and whether it lines up with the voice, were not confirmed when it was handed over, and I have not seen a later result.
- Editing: split, trim, delete, join, move, volume and fades, transitions (fade, cross-fade, wipes, slide), blur and zoom (including a zoom drawn from a rectangle), undo and redo, a preview that plays, and export to MP4. Blur and zoom are drawn by the exporter itself, so they add no new library or download.
- The pointer can be included in the picture as it is (a Windows setting).

## What is new work

1. **The app itself**: a small window with the recorder and the editor, its keyboard paths, its settings, file dialogs, an icon, a double-click build script and an installer.
2. **A simple editor screen**: the existing editing screens, with the tools you did not ask for (text overlays, shapes, arrows, redaction) left out of view. Blur and zoom stay, and so does the webcam. Each needs a way to place a rectangle on the picture with the keyboard, in words as well as by dragging; the edit model already says where a rectangle is in words.
3. **The webcam controls**: choose a camera, turn it on or off before recording, see it in the preview, and choose where the small picture sits and how big it is.
4. **Cursor highlight**: not built anywhere yet. It is in the requirements (story C6) but the exporter does not draw it. There are two ways to do it:
   - *Drawn when exporting*, from the cursor positions the recorder can write down. You can switch it on or off after recording. This is more engine work, and it would record the pointer's position and clicks only, not window titles, clicked item names or keys. **My recommendation.**
   - *Drawn while recording*, by a small ring window that follows the pointer and gets recorded with the screen. Simpler, but it cannot be undone afterwards, and it would not appear when recording a single window.

## Assumptions you can veto

- No text overlays, shapes, arrows or redaction (blackout) in the first version. The engine can do them, so they can come back later. Redaction is close kin to blur, so say if you want it too.
- Captions are made outside the program in the first version, as you said. The program neither makes nor edits them, and there is no speech model to download, which keeps it light. One suggestion, which you can decline: when an export finishes, the program says in plain words that the video has no captions, and that a `.vtt` file with the same name as the video, kept beside it, is how most players find captions. A program that makes video should not let the missing captions go unmentioned. Captions made inside the program can come later.
- The recording folder format stays the same as in OpenStage Author, so a recording made in one opens in the other.

## Where it lives

The owner chose to pull the parts this product needs out of OpenStage Author into a folder of its own, rather than share one tree. The recording engine here is therefore a copy, taken at a named OpenStage commit (01fc056), with a manifest.

The cost is drift. In the first week after OpenStage Author took in the recorder, 17 commits touched the recorder folders there. Only 3 touched the Rust recording program. The rest were in the edit model and the editing screens, which are the parts this product copies and trims. A fix made in one place has to be carried to the other by hand, and each carry is something the owner says yes to. To keep that cheap, the copied folders keep the same paths as in OpenStage Author and are changed only when the product needs it.

**Still open:** whether this folder becomes its own GitHub repository (`openstage-recorder`, which the owner would create empty) or sits inside the OpenStage Author repository. Nothing has been pushed anywhere.
