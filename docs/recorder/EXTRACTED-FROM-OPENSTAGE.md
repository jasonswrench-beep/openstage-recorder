# Parts of the app taken from OpenStage Author

The app (`app/`) is new, but much of it was taken from the editor of OpenStage Author (`jasonswrench-beep/openstage-author`, main, commit `01fc056`, 2026-10-23), where the recorder is called OpenScreen. This note says which file came from where and what was changed, so that a fix made in one place can be carried to the other.

Paths on the left are in this repository. Paths on the right are in OpenStage Author.

## The Rust side

| Here | From there | What changed |
|---|---|---|
| `app/core/src/stream.rs` | `editor/src-tauri/src/stream.rs` | A licence line added and the code formatted to this project's settings. One test lost its two lines about the editor's publishing slot, which this app does not have. Two clippy complaints in the tests fixed. Nothing else |
| `app/core/src/files.rs` | `lib.rs`: the recording functions (`recording_name_ok`, `recording_rel`, `recording_at`, `list_recordings_at`, `read_recording_text_at`, `recording_folders_at`, `write_recording_edit_at`) and their tests | Recordings are in one recordings folder, `<folder>/<name>.capture`, not in a course's `captures` folder, so the check that the folder is a course is now a check that it is a full path to a folder. Saving the steps of a lesson was left out. New: `ensure_library_at`, `takes_folder_at`, a test that a link out of the folder is not followed, and `keep_recording_edit_at` with `kept_edit_name_ok` (the one other file the page may write, `edit-before-take-<n>.json`, never over an existing one) |
| `app/core/src/program.rs` | `lib.rs`: `plain_path`, `find_in`, `capture_program_in`, `capture_program` | The message says OpenStage Recorder. The `OPENSTAGE_REPO` setting is not used. The test is rewritten |
| `app/core/src/hotkeys.rs` | `lib.rs`: `hotkey_id_ok` and the checks inside `parse_hotkey` | Split in two so the checks that need no window system are tested anywhere. The part that asks the system to understand a key combination stays in `app/src-tauri/src/lib.rs` |
| `app/core/src/lib.rs` | `lib.rs`: `kill_tree` | Moved |
| `app/src-tauri/src/lib.rs` | `lib.rs`: the commands for the recorder, the keys and the recordings, and `run` | Only the commands this app needs are registered. New: `default_library`, `ensure_library`, `reveal_recording`, `recording_keep_edit` |
| `app/src-tauri/tauri.conf.json`, `capabilities/default.json`, `Cargo.toml`, `build.rs`, `main.rs` | the same files in `editor/src-tauri` | Name, window size and security settings changed for this app. The permissions are the same |

## The web side

| Here | From there | What changed |
|---|---|---|
| `app/src/recorder.ts` | `editor/src/recorder.ts` | The comment only |
| `app/src/capturesession.ts` | `editor/src/capturesession.ts` | The recording is kept in the recordings folder (`recordingPath`, `recordingFolderName`). The words say "app", not "editor". New: how loud your voice and the computer's sound are in the video (`micGainDb`, `systemGainDb`), passed to the recorder as `--mic-gain-db` and `--system-gain-db` only when changed. New: `soundAdvice`, which says the recorder's advice about the sounds (balance, a silent computer sound, a computer sound that goes quiet) as notes in this app's words, once, and not as problems, and `plainWords`, which puts the notes about the short sounds and the webcam in the window's words, not the command line's |
| `app/src/capturecontroller.ts` | `editor/src/capturecontroller.ts` | Talks to a smaller backend (`RecorderBackend`) |
| `app/src/capturecheck.ts` | `editor/src/capturecheck.ts` | The words say OpenStage Recorder |
| `app/src/captureexport.ts` | `editor/src/captureexport.ts` | The video is written in the recording's own `exports` folder, and the exporter is told nothing about a course's assets. New: `NO_CAPTIONS` and `finishedWords`, the words for the end of the job |
| `app/src/recordingfolder.ts` | `editor/src/recordingfolder.ts` | Talks to the smaller backend. Also writes the kept copy of an older edit (`edit-before-take-<n>.json`) through its own call, which the original refused (see below) |
| `app/src/editview.ts` | `editor/src/editrecording.ts` | A page, not a pop-up, and with no course: nothing is put on a slide, no captions or audio descriptions are written, no steps or alt text from clicks are made, and no media is added from files. Only Blur and Cover are offered among the callouts (`callouts: ["blur", "cover"]`). The edit is saved before a video is made whenever the saved file is not the edit on the screen. The reduce-motion box starts ticked when the computer asks for less motion. When a video has been made, the result ends with the plain sentence that it has no captions (`NO_CAPTIONS` in `captureexport.ts`). The pure rules (what is asked before leaving, the first words) are exported and tested |
| `app/src/recorderview.ts` | `editor/src/recorderdialog.ts` | A page, not a pop-up. Without the course, the steps and the interaction notes. With a recordings folder of the author's choice. The status line announces each thing said as its own line, so two things said at once are both heard (see below) |
| `app/src/backend.ts` | `editor/src/backend.ts` | Only the parts for the recorder, the recordings, the keys and the window |
| `app/src/*.test.ts` (six files) | the tests of the same names | Changed to match the above |

New here, not from there: `app/branding/OpenStageRecorder.svg` (the icon, supplied by the owner as OpenRecorder.svg) and the icon files made from it by `app/tools/make-icons.mjs`, `app/src/standin.ts` (a pretend recorder for trying the screens in a browser), `app/src/settings.ts`, `app/src/main.ts`, `app/src/app.css`, `app/tools/`, `app/build.mjs`, `app/dev-server.mjs`, the two scripts `OPEN RECORDER.bat` and `OPEN RECORDER PREVIEW.bat`.

## Changes made inside the copied folders

The four copied folders are meant to stay the same as OpenStage Author's. Two small changes were made in `capture-timeline/` for the editing screen, because there was no other way. Both are additions: with nothing asked for, the screens behave as they did, and OpenStage Author's own tests and browser checks give the same results. Each is worth carrying back, so that the two copies do not drift.

| File | Change | Why |
|---|---|---|
| `capture-timeline/src/callout-panel.ts`, `capture-timeline/src/editor.ts` | A new option, `callouts`, on the editor (and `kinds` on the callout bar): the list of callout kinds to offer. Left out, every kind is offered, as before | OpenStage Recorder offers Blur and Cover only, not text, shapes or arrows |
| `capture-timeline/src/preview-panel.ts` | The preview's sound files are asked for with CORS (`crossOrigin = "anonymous"` on each audio element). One line and a comment | The preview sends sound through Web Audio, which plays nothing from a file at another web address unless CORS is asked for; in the installed app the recordings are at another address than the page, so the preview was silent. OpenStage Author's editor serves recordings the same way and probably has the same fault |
| `docs/capture/capture-project-format.md` | One line in the folder layout for `edit-before-take-<n>.json`, a file the editing screens already wrote (or tried to) and the format did not list. In the Sound section, a sentence saying that a new edit starts with the take's `mix` gains | The format document must say every file the program writes, and what the program does with what the recorder wrote |
| `capture-edit/src/fromTakes.ts` (and its test), `capture-timeline/src/project.ts` | `TakeInfo` has an optional `mix` (the loudness chosen when recording, read from `take.json`). A new edit made from a take gives its microphone and computer-sound clips that volume, and says so in the notes. Nothing else changes: a take without `mix`, with 0, or with a number that is not a whole decibel from -40 to 20, gives clips as heard | The video made from an edit is built from `mic.wav` and `system.wav`, not from the mix inside `screen.mp4`, so the loudness chosen when recording never reached it |
| `capture-timeline/src/session.ts` (and `test/balance.test.ts`, new) | `soundBalance(sound)` and `setSoundBalance(sound, text)`, with `SOUND_NAMES`: how loud every clip of the microphone, or of the computer's sound, is, and setting all of them as one undo step | The balance boxes on the editing screen. The boxes themselves are in `app/src/editview.ts`, which is this product's own |
| `capture-timeline/src/webcam-place.ts` (new), `session.ts`, `panel.ts`, `index.ts` | `setWebcamPlace(where, size)` on the session, `webcam` in the row details, and two boxes in the form of a webcam clip: where (four corners, or fills the picture) and how big (small, medium, large). The default choice clears the place, so the clip keeps the exporter's default of filling the picture when it is alone. Ten tests in `capture-timeline/test/webcam-place.test.ts` | The edit model, the preview and the exporter could already place a webcam, but no screen set it |

Not run on a real screen reader. The two boxes are ordinary labelled selects with a hint tied to them by `aria-describedby`, and Escape returns to the list like the other selects.

## Something to carry back to OpenStage Author

Two faults in OpenStage Author's recording editor dialog (`editor/src/editrecording.ts` and `recordingfolder.ts`, as at `01fc056`). Both were found by reading and then shown by a browser check here. Neither loses an author's work: the first refuses to save, the second makes the video maker refuse.

1. Starting a new edit of the newest recording, when an edit was saved before, can never be saved. The dialog copies the older edit to `edit-before-take-<n>.json` first, but `recordingFolder.writeText` returns false for any name except `edit.json`, so the copy fails and the dialog says "The edit saved before could not be copied". The Recorder gives the copy its own shell command and its own call, which never writes over an existing copy.
2. "Make a video from this edit" on a recording with no saved `edit.json`, or one whose saved edit is older than the edit on screen, skips the save when nothing has changed, and the video maker then says "There is no edit to export" (or makes the video from the older edit). The Recorder saves first whenever the saved file is not the edit on the screen.

OpenStage Author's recorder dialog replaces the text of its status line each time something is said. When the recorder says two things at once (a take is set aside, then the next take starts), the second replaces the first, and a screen reader may announce only the second. The Recorder's screen adds each thing as its own line and turns off `aria-atomic`, so the first is not lost. I have not heard either with a screen reader, so this is a reading of how live regions are meant to work, not a result.

The same dialog also says, when the recording program is not found, that "only a practice recording could be tried". A practice recording uses the same program, so it cannot be tried either. The Recorder says so.
