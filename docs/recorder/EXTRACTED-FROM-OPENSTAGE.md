# Parts of the app taken from OpenStage Author

The app (`app/`) is new, but much of it was taken from the editor of OpenStage Author (`jasonswrench-beep/openstage-author`, main, commit `01fc056`, 2026-10-23), where the recorder is called OpenScreen. This note says which file came from where and what was changed, so that a fix made in one place can be carried to the other.

Paths on the left are in this repository. Paths on the right are in OpenStage Author.

## The Rust side

| Here | From there | What changed |
|---|---|---|
| `app/core/src/stream.rs` | `editor/src-tauri/src/stream.rs` | A licence line added and the code formatted to this project's settings. One test lost its two lines about the editor's publishing slot, which this app does not have. Two clippy complaints in the tests fixed. Nothing else |
| `app/core/src/files.rs` | `lib.rs`: the recording functions (`recording_name_ok`, `recording_rel`, `recording_at`, `list_recordings_at`, `read_recording_text_at`, `recording_folders_at`, `write_recording_edit_at`) and their tests | Recordings are in one recordings folder, `<folder>/<name>.capture`, not in a course's `captures` folder, so the check that the folder is a course is now a check that it is a full path to a folder. Saving the steps of a lesson was left out. New: `ensure_library_at`, `takes_folder_at`, and a test that a link out of the folder is not followed |
| `app/core/src/program.rs` | `lib.rs`: `plain_path`, `find_in`, `capture_program_in`, `capture_program` | The message says OpenStage Recorder. The `OPENSTAGE_REPO` setting is not used. The test is rewritten |
| `app/core/src/hotkeys.rs` | `lib.rs`: `hotkey_id_ok` and the checks inside `parse_hotkey` | Split in two so the checks that need no window system are tested anywhere. The part that asks the system to understand a key combination stays in `app/src-tauri/src/lib.rs` |
| `app/core/src/lib.rs` | `lib.rs`: `kill_tree` | Moved |
| `app/src-tauri/src/lib.rs` | `lib.rs`: the commands for the recorder, the keys and the recordings, and `run` | Only the commands this app needs are registered. New: `default_library`, `ensure_library`, `reveal_recording` |
| `app/src-tauri/tauri.conf.json`, `capabilities/default.json`, `Cargo.toml`, `build.rs`, `main.rs` | the same files in `editor/src-tauri` | Name, window size and security settings changed for this app. The permissions are the same |

## The web side

| Here | From there | What changed |
|---|---|---|
| `app/src/recorder.ts` | `editor/src/recorder.ts` | The comment only |
| `app/src/capturesession.ts` | `editor/src/capturesession.ts` | The recording is kept in the recordings folder (`recordingPath`, `recordingFolderName`). The words say "app", not "editor". New: how loud your voice and the computer's sound are in the video (`micGainDb`, `systemGainDb`), passed to the recorder as `--mic-gain-db` and `--system-gain-db` only when changed |
| `app/src/capturecontroller.ts` | `editor/src/capturecontroller.ts` | Talks to a smaller backend (`RecorderBackend`) |
| `app/src/capturecheck.ts` | `editor/src/capturecheck.ts` | The words say OpenStage Recorder |
| `app/src/captureexport.ts` | `editor/src/captureexport.ts` | The video is written in the recording's own `exports` folder, and the exporter is told nothing about a course's assets |
| `app/src/recordingfolder.ts` | `editor/src/recordingfolder.ts` | Talks to the smaller backend |
| `app/src/recorderview.ts` | `editor/src/recorderdialog.ts` | A page, not a pop-up. Without the course, the steps and the interaction notes. With a recordings folder of the author's choice. The status line announces each thing said as its own line, so two things said at once are both heard (see below) |
| `app/src/backend.ts` | `editor/src/backend.ts` | Only the parts for the recorder, the recordings, the keys and the window |
| `app/src/*.test.ts` (six files) | the tests of the same names | Changed to match the above |

New here, not from there: `app/branding/OpenRecorder.svg` (the icon, supplied by the owner) and the icon files made from it by `app/tools/make-icons.mjs`, `app/src/standin.ts` (a pretend recorder for trying the screens in a browser), `app/src/settings.ts`, `app/src/main.ts`, `app/src/app.css`, `app/tools/`, `app/build.mjs`, `app/dev-server.mjs`, the two scripts `OPEN RECORDER.bat` and `OPEN RECORDER PREVIEW.bat`.

## Something to carry back to OpenStage Author

OpenStage Author's recorder dialog replaces the text of its status line each time something is said. When the recorder says two things at once (a take is set aside, then the next take starts), the second replaces the first, and a screen reader may announce only the second. The Recorder's screen adds each thing as its own line and turns off `aria-atomic`, so the first is not lost. I have not heard either with a screen reader, so this is a reading of how live regions are meant to work, not a result.

The same dialog also says, when the recording program is not found, that "only a practice recording could be tried". A practice recording uses the same program, so it cannot be tried either. The Recorder says so.
