# To carry back to OpenStage Author

Written 2026-10-24, at the project owner's request, for whoever works in `jasonswrench-beep/openstage-author` next (a person or a session).

OpenStage Recorder was built from a copy of OpenStage Author's recording engine, editing screens and recorder dialog (main, commit `01fc056`, 2026-10-23). Building it turned up three faults that are in OpenStage Author too, a few smaller things, and some changes that OpenStage Author may want. Everything below was found in that copy. **Check each item against OpenStage Author's current main first**, because main may have moved since.

Nothing in OpenStage Author has been changed from the Recorder's side, and nothing will be without the owner's yes. The Recorder's repository is `jasonswrench-beep/openstage-recorder`; the fixes are in its commit `2034037` and the commit after it.

How sure each item is: items 1 and 2 were read in the code and then shown by a browser check in the Recorder, against a pretend recorder. Item 3 was read in the code, and its fix is tested with unit tests and a browser check. **None of it has been run on Windows with the real recorder.** No screen reader has been used on any of it.

## Faults

### 1. A new edit of the newest recording can never be saved when an edit was saved before

**What an author sees.** They edit a recording and save. They record more into the same recording. They open it again, and are asked "Which edit do you want?". They choose "Start a new edit of the newest recording", change something and save. They are told "The edit saved before could not be copied to edit-before-take-N.json, so nothing was saved and nothing was changed on the disk." Every try gives the same answer. Nothing is lost, because the save refuses, but the new edit can never be saved.

**Why.** The dialog copies the older edit aside first (`editor/src/editrecording.ts`, `saveEdit`, lines 118 to 128, `toKeep`). The copy goes through `recordingFolder.writeText` (`editor/src/recordingfolder.ts`, lines 42 to 50), which returns false for any name except `edit.json`. The shell has only one command for writing, `recording_write_edit` (`editor/src-tauri/src/lib.rs`, line 2671, and `write_recording_edit_at`, line 2642), and it writes only `edit.json`.

**The fix used in the Recorder.** A second shell command that writes only `edit-before-take-<1 to 4 digits>.json`, checks the text is a JSON object of a sensible size, writes it whole or not at all, and **refuses to write over a copy that is already there**, so an older copy is never lost. Then `writeText` sends that one name to it. See the Recorder's `app/core/src/files.rs` (`kept_edit_name_ok`, `keep_recording_edit_at`, with tests), `app/src-tauri/src/lib.rs` (`recording_keep_edit`), `app/src/backend.ts`, `app/src/recordingfolder.ts` (`KEPT_EDIT`), and the browser check "a recording with a newer take asks which edit to open, and keeping the older edit lets the new one be saved" in `app/tools/browser-check.mjs`.

**Also:** `docs/capture/capture-project-format.md` did not list `edit-before-take-<n>.json` in the folder layout. The Recorder's copy of the format has one line for it.

### 2. "Make a video from this edit" can be refused, or can use an older edit

**What an author sees.** They open a recording that has never been edited and saved, change nothing, and press "Make a video from this edit". The video maker answers "There is no edit to export: ...edit.json does not exist". Or they start a new edit of the newest recording (so the edit on screen is new) and make a video without changing it: the video is made from the older `edit.json` still on disk.

**Why.** `makeVideo` saves only when `session.dirty` is true (`editor/src/editrecording.ts`, lines 152 to 156). A new edit made from the takes is not dirty, and the video maker reads `edit.json` (`capture/crates/openstage-capture-windows/src/render_cmd.rs`, `choose_edit`, reads the project's `edit.json` and refuses if it is missing).

**The fix used in the Recorder.** Remember whether `edit.json` on disk is the edit on the screen (`onDisk`, true only for an edit opened from `edit.json`, and after a successful save), and save first when it is dirty or `onDisk` is false. See the Recorder's `app/src/editview.ts` (`onDisk`, `saveEdit`, `makeVideo`) and the browser check "Make a video saves the edit first, shows progress, says it has no captions, and the focus moves to Show the video". The Recorder's pretend recorder now refuses a video when there is no saved edit, as the real one does, so the check would catch the fault coming back.

### 3. The loudness chosen when recording never reaches a video made from an edit

**What happens.** The recorder program can make your voice or the computer's sound louder or quieter in the mix (`--mic-gain-db`, `--system-gain-db`, whole decibels from -40 to 20). The format says these apply **only to the mix inside `screen.mp4`** (`docs/capture/capture-project-format.md`, section "Sound"; `take.json` keeps them as `mix` on the `screen.mp4` entry). But a video made from an edit is built from `mic.wav` and `system.wav`, as the volume of each clip, and a new edit made from a take gives every clip a volume of 0. So the choice affects what a player plays of the raw recording and nothing that is exported from the editor.

**Why it matters.** The recorder's own advice after a recording whose computer sound drowns the voice is to use `--system-gain-db`. An author who follows it and then edits and exports gets the unbalanced sound anyway, with no warning.

**Does OpenStage Author's recorder dialog have loudness boxes?** Not in the copy that was taken (the Recorder's two boxes are new there, in `app/src/capturesession.ts` and `app/src/recorderview.ts`). If OpenStage Author adds them, fault 3 applies from that moment. Either way, a new edit made from a take ignores `mix`.

**The fix used in the Recorder.** `TakeInfo` has an optional `mix`. `readProject` reads it from `take.json`. `editFromTakes` gives the microphone and computer-sound clips of a take that volume, if it is a whole decibel from -40 to 20, and adds a note ("Computer sound of take 1 is 19 decibels quieter than it was heard, as you set when recording. You can change it under Sound balance."). A take with no `mix`, or 0, gives clips as heard, and an edit already saved is left alone. See `capture-edit/src/fromTakes.ts` (and its test) and `capture-timeline/src/project.ts`.

**Also added, which OpenStage Author may want:** the owner asked for a way to balance voice and computer sound when editing. `EditSession.soundBalance(sound)` and `setSoundBalance(sound, text)` (in `capture-timeline/src/session.ts`, with `capture-timeline/test/balance.test.ts`) set every clip of the microphone, or of the computer's sound, as one undo step. The two boxes ("Your voice, in decibels", "The computer's sound, in decibels") are on the Recorder's editing page, `app/src/editview.ts`, not in the shared screens. OpenStage Author would put them wherever its editing dialog suits.

## Smaller things

### 4. The recorder dialog's status line can lose a message

`editor/src/recorderdialog.ts`, line 72: `say` sets `status.textContent` to the messages joined, which replaces what was there. When the recorder says two things at once (for example a take is set aside, then the next take starts), a screen reader may announce only the second. The Recorder adds each thing as its own line (a `span` with `display: block`) and turns `aria-atomic` off, so the first is not lost. See `app/src/recorderview.ts`, `say`, and the browser check "starting again sets a take aside, keeps it, and says so". This is a reading of how live regions are meant to work. It has not been heard with a screen reader.

### 5. A wrong sentence when the recorder program is missing

`editor/src/recorderdialog.ts`, line 214: "The recorder program was not found, so only a practice recording could be tried." A practice recording uses the same program, so it cannot be tried either. The Recorder says so.

### 6. Two browser checks in `capture-timeline` fail on current code

They fail in OpenStage Author's own copy of `capture-timeline/tools/browser-check.mjs` as well as the Recorder's (73 pass, 2 fail), and did not pass before any change made here:

- "the tool bar is one Tab stop; the arrow keys, Home and End move along it; it has Undo, Redo, Copy, Paste, Split and two Deletes and the Add track menu": its expected list is out of date. The bar now holds Undo, Redo, Copy, Paste, Split, Delete, Delete close gap, Mark start, Mark end, Remove stretch, Remove close gap, Clear marks, Snap, Add track and Tracks.
- "the timeline exposes a listbox of clips grouped by track, one Tab stop, and two grips for the chosen clip": a check that a track's name box has a label counts only `label` and `aria-label`, not `aria-labelledby`, so a box that does have a name is reported as having none.

Neither is a fault in the screens. The checks need updating.

## Changes in the Recorder's copy of the shared folders that OpenStage Author may want

These are listed, with the reason for each, in `docs/recorder/EXTRACTED-FROM-OPENSTAGE.md` under "Changes made inside the copied folders". All are additions, and with nothing asked for the screens behave as they did.

- `callouts` on the editor: which callout kinds the bar under the picture offers. OpenStage Author does not need it; the Recorder offers Blur only.
- Webcam place: `setWebcamPlace` and two boxes in a webcam clip's form, "Webcam picture: where" and "how big". The edit model, the preview and the exporter could already place a webcam, but no screen set it.
- The loudness carried into a new edit, and the sound balance (item 3).

## Suggested order

1. Fault 1 and fault 2, with the checks that show them, since an author can meet them now.
2. Fault 3, which also needs a decision about whether the recorder dialog should get loudness boxes.
3. Items 4 and 5, which are small.
4. Item 6, which restores two checks.
