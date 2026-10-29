# OpenStage Recorder: plan

The base (the recording engine and the editing parts, copied from OpenStage Author; `IMPORT-MANIFEST.md` lists every file), the window, the Record screen and the editing screen are built. The cursor highlight and the installer are not. Only the Record screen has been run on Windows; the editing screen has been run in a browser with a pretend recorder, not on Windows.

## Where we stopped (2026-10-29)

For whoever picks this up next, in plain words:

- **Signing is decided: the SignPath Foundation's free route for open source** (the owner's choice, 2026-10-29). The options and why are in `INSTALLER-AND-SIGNING.md`.
- **The repository is private, and SignPath needs a public one.** The owner has not yet answered: A, make this repository public as it is (one early commit shows his Gmail address as author, and 12 commit messages carry links to a Claude session); B, a new public repository with a clean copy of the files and this one kept private; C, not now. A scan on 2026-10-29 found no passwords, keys or tokens, no personal paths, and no large files in the history. Our rules do not allow rewriting history.
- **SignPath's own pages could not be read** in the session that wrote this, because the session's network list did not include them. The owner added `signpath.org`, `about.signpath.io` and `docs.signpath.io` to the environment's Allowed domains and saved, but a session already running does not pick the change up. **A session started after 2026-10-29 should be able to read them.** Read SignPath's terms and its GitHub Actions page first; what is written about SignPath here came from search results and is unchecked.
- **What to do once the owner answers A, B or C:** write the "Code signing policy" page SignPath requires and link it from the README and the release pages; draft the owner's application answers for him to paste (the application, the SignPath account and any payment-free approval are his, not ours); add a signing step to `.github/workflows/build-installer.yml` that stays switched off until SignPath approves, using SignPath's own current instructions and not guesses. Each of the six products would be its own project.
- **The owner's own tasks:** make a video from the editing screen and send the `.mp4` (none has been seen yet); a keyboard-only and a screen reader pass; decide the cursor highlight (recommended: drawn when the video is made, from recorded cursor positions); hand `CARRY-BACK-TO-OPENSTAGE.md` to OpenStage Author's own session when ready.
- **Done and tried by the owner on Windows:** the installed app records (screen, microphone, computer sound, webcam), and its editing preview; the sound fault he found is fixed in builds 4 and later and he has installed that build.

## Where the work stands

Written 2026-10-23, and updated 2026-10-24. Checked on Linux, and run once on Windows (see the table).

| Part | State |
|---|---|
| The base: recording program, edit model, editing screens, documents | Copied from OpenStage Author (`IMPORT-MANIFEST.md`) |
| The window's Rust shell (`app/src-tauri`) and the rules it keeps (`app/core`) | Built. The rules are tested on Linux. **Run on Windows once, on 2026-10-23**, built by `OPEN RECORDER.bat`: it opened, found the recording program, registered the keys that work from any program, and made one real recording |
| The Record screen (`app/src`): what to record (a screen, one window, part of a screen), the sound, a webcam to choose, the countdown, start, pause, marker, stop, start again, the check of the computer, the list of recordings | Built and checked in a browser with a pretend recorder: keyboard only, names for a screen reader, contrast, forced colours, 320 pixels wide |
| How loud your voice and the computer's sound are in the video | Two boxes on the Record screen, in whole decibels from -40 to 20, passed to the recorder. Added after the first real recording showed the computer's sound 13 decibels louder than the voice, with advice only a command line could follow |
| Editing a recording (`app/src/editview.ts`): open it, cut, transitions, blur, zoom, the webcam's place, save, back; and make a video with progress and cancel | **Built 2026-10-24 and checked in a browser with a pretend recorder** (keyboard only, names for a screen reader, what is announced, saving, the video, 320 pixels wide). **Not run on Windows yet**, and not heard with a screen reader |
| Sound balance (`app/src/editview.ts`, `capture-timeline/src/session.ts`) | Built 2026-10-24 after the owner asked for a way to balance the microphone and the computer's sound when editing. Two boxes, "Your voice, in decibels" and "The computer's sound, in decibels", set every clip of that sound in one undo step, from the keyboard. Found on the way: the loudness boxes on the Record screen only changed the mix inside the raw recording's `screen.mp4`, and a video made in the editor is built from the separate `mic.wav` and `system.wav`, so those choices never reached it. A new edit now starts with them (said when it opens). Checked in a browser with the pretend recorder; not run on Windows, so how the real video sounds is not known yet |
| Sound in the editing preview | **Fault found 2026-10-26 from the owner's first use of the installed app, and fixed:** pressing Play in the editing screen showed the picture but played no sound. The owner's own screen recording of it (Camtasia) showed the preview moving and its sound track silent, while the Record screen's notes in his other recording showed no silent-track warning, so the sound had been recorded. Cause: the preview sends each sound through Web Audio (so a clip can be made louder than recorded), and Chromium, which is what Windows' web view is, outputs silence from a file that comes from another web address than the page. In the installed app the recordings come from `asset.localhost`, and the page from `tauri.localhost`. Fix: the preview asks for its sound files with CORS (`crossOrigin = "anonymous"`), which Tauri's own file protocol answers for the page's address (read in Tauri 2.12.5's source). Proved in a real browser (the same tone is silent without it and loud with it), and now checked end to end: the browser check serves a tone from a second address, presses Play, reads what reaches the speakers, and fails on the old code. Not yet heard on Windows |
| The recorder's advice about the sounds | Reworded 2026-10-25 at the owner's request, and on 2026-10-26 the notes about the short sounds and the webcam stopped naming command line options too. When the computer's sound drowns the voice, is too quiet, goes quiet part way, or was not heard, the app says it as a **note**, not a problem, once (the recorder says the balance twice), with a next step in the app's own words: the number to put in the computer's sound box on the Record screen, or Sound balance when editing. A computer sound that was not heard says that is normal if nothing was playing. A silent **microphone** stays a problem, because a recording with no voice is one. The recorder's words for command line options and file names (`--system-gain-db`, `mic.wav`) are not said to the author. Checked with the recorder's real sentences in unit tests and in a browser; the wording has not been heard with a screen reader |
| The webcam controls beyond choosing a camera | Built: "Webcam picture: where" (four corners, or fills the picture) and "how big" (small, medium, large) in a webcam clip's form. Turning the webcam on or off before recording is "A webcam" on the Record screen, as before |
| Blur and zoom in the editor | Built: the bar under the picture offers Blur, Cover, Zoom on a part and Draw a zoom, and no text, shape or arrow tool |
| The cursor highlight | Not built anywhere |
| A message at the end of an export that the video has no captions | Built: said in the status line with the result whenever a video was made, and not said when there is none. Not heard with a screen reader |
| The icon | Supplied by the owner (`app/branding/OpenStageRecorder.svg`). In use for the window, the program file and the page. The icon files are made from it by `app/tools/make-icons.mjs` |
| The installer | **Set up 2026-10-25. The workflow has built it four times on a GitHub Windows machine and passed every time (about a 3.3 MB download). The owner installed the first build on his Windows computer on 2026-10-26 and used it: it recorded, and the editing preview played no sound (fixed in the fourth build, not yet heard). `BUILD INSTALLER.bat` has not been run.** `app/src-tauri/tauri.installer.conf.json` (an NSIS installer for the current user only, with the recording program and the licence texts beside the app), `app/BUILD INSTALLER.bat` (double-click, asks before downloading) and `.github/workflows/build-installer.yml` (builds it on a Windows machine, no secrets). The installed app finds the recording program beside itself, which the existing lookup already did. Not signed. Whether it installs, starts, records and uninstalls cleanly is not known. The same workflow also makes a portable folder (`OpenStage Recorder.exe` and the recording program, nothing to install). `INSTALLER-AND-SIGNING.md` has the download steps, the test list and the signing options |

## The first real recording (2026-10-23)

Made by the owner with the app on a Windows computer with 32 processor cores, from the recorder's own report, which the owner sent. Kept in a folder the owner chose on the Desktop.

- 13.6 seconds, 409 pictures. Windows read the saved video back as 13.6 seconds, and the sound track of the video as 13.6 seconds, the same as the recording time.
- The microphone (a webcam's microphone) was recorded: 13.6 seconds, loudest moment good (peak 0.22). Its sound card ran 31 ms fast against the computer's clock over the recording, and the program corrected for it; at worst the sound was 31 ms behind its picture.
- The computer's own sound was recorded as 13.6 seconds of silence, and the recorder said so as a problem: nothing was heard from the speakers. That is what happens when nothing is playing. It was not tried with something playing.
- The keys that work from any program (Ctrl+Shift+F10, F11 and F12) were registered.
- The program used about 46 percent of one core, which the recorder projected as 11.5 percent of a 4-core laptop, against a target of 10 percent. That needs a real measurement on a modest laptop.

Not yet tried in the app: one window, part of a screen, the webcam, a long recording, the keys with another program in front, and any screen reader.

## The editing screen: design, and what was built (2026-10-24)

What the owner asked for: cutting, transitions, blur and zoom, and the webcam as an option. Captions are made outside the program, and the text, shape and arrow tools are not wanted.

What is already in the editing screens copied from OpenStage Author, and what is not:

| Wanted | In the copied screens | What this product does |
|---|---|---|
| Cut, split, trim, join, move, undo | Yes (clip list, timeline, keys) | Nothing to add |
| Transitions | Yes: "Arrives with" and "Leaves with" in a clip's form | Nothing to add |
| Zoom | Yes: "Zoom on a part" and "Draw a zoom" in the bar under the picture | Nothing to add |
| Blur | Yes, as one button of the bar under the picture, beside seven others | Keep Blur, and Cover (a solid box that hides part of the picture completely, for something private; the owner said yes on 2026-10-25, after first leaving it out). Hide Text, Title, Lower third, Highlight box, Circle and Arrow with a new optional setting on the editor, `callouts`, whose default shows all of them, so OpenStage Author is unchanged. Also left out here: Picture, Video and Sound from a file |
| The webcam on or off before recording | Yes: "A webcam" on the Record screen | A clearer note beside it |
| Where the webcam's small picture sits, and how big | The edit format and the exporter support it (`placement`), and the preview draws it, **but no screen sets it** | New: two boxes in a webcam clip's form, "Where" (bottom right, bottom left, top right, top left, fill the picture) and "Size" (small, medium, large). Medium in the bottom right is exactly the default, so the edit is not changed unless the author changes it. No dragging, so it works by keyboard and in words |

Two changes are therefore made inside `capture-timeline/`, a copied folder: the `callouts` setting and the webcam boxes. Both are listed in `EXTRACTED-FROM-OPENSTAGE.md` so they can be carried back.

Taken from OpenStage's recording editor dialog for the edit view: opening a recording (and asking which edit to open when takes were recorded after the saved one), saving, the video maker with progress and cancel, and the cuts-instead-of-zooms choice. Left out: putting the video on a slide, captions and audio description, steps, alt text from clicks, adding media from files.

### Two faults found while building it, both also in OpenStage Author

Found by reading the code before checking the screens, and then caught by a browser check written for each.

1. **A new edit of the newest recording could never be saved when an edit had been saved before.** The screen first copies the older edit to `edit-before-take-N.json`, but the folder only allowed `edit.json` to be written, so the copy was refused, and with it the save. Nothing was lost (it refuses), but the new edit stayed unsaved. Here the shell has a second command that writes only that file, never over an existing one (`recording_keep_edit`), with tests in Rust and in the browser.
2. **"Make a video" on a recording that had never been edited and saved was refused by the video maker** ("There is no edit to export"), because the screen saved only when something had changed. Here the edit is saved first whenever the saved file is not the edit on the screen. The pretend recorder now refuses the same way the real video maker does, so a browser check would catch it coming back.

Both faults are in OpenStage Author's `editor/src/editrecording.ts` and `recordingfolder.ts` as copied (main, commit `01fc056`). I have not changed that repository and will not without the owner's yes.

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

- No text overlays, shapes or arrows in the first version. The engine can do them, so they can come back later. Redaction (the Cover tool, a blackout) was left out at first and added on 2026-10-25 at the owner's request.
- Captions are made outside the program in the first version, as you said. The program neither makes nor edits them, and there is no speech model to download, which keeps it light. One suggestion, which you can decline: when an export finishes, the program says in plain words that the video has no captions, and that a `.vtt` file with the same name as the video, kept beside it, is how most players find captions. A program that makes video should not let the missing captions go unmentioned. Captions made inside the program can come later.
- The recording folder format stays the same as in OpenStage Author, so a recording made in one opens in the other.

## Where it lives

The owner chose to pull the parts this product needs out of OpenStage Author into a folder of its own, rather than share one tree. The recording engine here is therefore a copy, taken at a named OpenStage commit (01fc056), with a manifest.

The cost is drift. In the first week after OpenStage Author took in the recorder, 17 commits touched the recorder folders there. Only 3 touched the Rust recording program. The rest were in the edit model and the editing screens, which are the parts this product copies and trims. A fix made in one place has to be carried to the other by hand, and each carry is something the owner says yes to. To keep that cheap, the copied folders keep the same paths as in OpenStage Author and are changed only when the product needs it.

**Still open:** whether this folder becomes its own GitHub repository (`openstage-recorder`, which the owner would create empty) or sits inside the OpenStage Author repository. Nothing has been pushed anywhere.
