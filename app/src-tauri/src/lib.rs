// SPDX-License-Identifier: Apache-2.0
//! OpenStage Recorder's native side.
//!
//! It does only what a web page cannot: touch the file system, start the recording program and talk to it, and register keys that work
//! while another program has the focus. Everything the author sees is in the web layer. The rules for doing those things safely are in
//! `openstage-recorder-core` (`app/core`), where they are tested without a window; this file hands what the page asks for to them.
//!
//! The recording program, `openstage-capture`, is a separate program. Nothing here records anything. Each line it prints reaches the page
//! untouched as a `stream-line` event, and the end of a run as a `stream-exit` event.

use openstage_recorder_core::{files, hotkeys, program, stream};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_opener::OpenerExt as _;

// ---- the recordings folder

/// Where recordings are kept unless the author chooses another folder: `Videos\OpenStage Recorder`. It is not made until the author
/// records or chooses it.
#[tauri::command]
fn default_library(app: tauri::AppHandle) -> Result<String, String> {
    let base = app.path().video_dir().or_else(|_| app.path().document_dir()).map_err(|_| {
        "This computer has no Videos or Documents folder to keep recordings in. Choose a folder.".to_string()
    })?;
    Ok(program::plain_path(base.join("OpenStage Recorder")).to_string_lossy().into_owned())
}

/// Make the recordings folder if it is not there yet.
#[tauri::command]
fn ensure_library(dir: String) -> Result<(), String> {
    files::ensure_library_at(Path::new(&dir))
}

/// The recordings in the folder, by folder name.
#[tauri::command]
fn list_recordings(dir: String) -> Result<Vec<String>, String> {
    files::list_recordings_at(Path::new(&dir))
}

/// The text of a `.json` file inside a recording (`capture.json`, `edit.json`, a take's `take.json`), or null if there is none.
#[tauri::command]
fn recording_read(dir: String, name: String, rel: String) -> Result<Option<String>, String> {
    files::read_recording_text_at(Path::new(&dir), &name, &rel)
}

/// The folders directly inside a place in a recording.
#[tauri::command]
fn recording_folders(dir: String, name: String, rel: String) -> Result<Vec<String>, String> {
    files::recording_folders_at(Path::new(&dir), &name, &rel)
}

/// Save the edit of a recording as its `edit.json`.
#[tauri::command]
fn recording_write_edit(dir: String, name: String, text: String) -> Result<(), String> {
    files::write_recording_edit_at(Path::new(&dir), &name, &text)
}

/// Keep a copy of the edit a new edit is about to replace, as `edit-before-take-<number>.json`. The only other file the page can write.
#[tauri::command]
fn recording_keep_edit(dir: String, name: String, file: String, text: String) -> Result<(), String> {
    files::keep_recording_edit_at(Path::new(&dir), &name, &file, &text)
}

/// Let the page play the videos and sounds of one recording straight from disk, with seeking. Only that recording's `takes` folder is
/// opened up, for the rest of the session, and only after the recording has been found inside the recordings folder.
#[tauri::command]
fn allow_recording_media(app: tauri::AppHandle, dir: String, name: String) -> Result<(), String> {
    let Some(takes) = files::takes_folder_at(Path::new(&dir), &name)? else { return Ok(()) };
    app.asset_protocol_scope().allow_directory(&takes, true).map_err(|e| e.to_string())
}

/// Show a recording, or a file inside it such as the exported video (`exports/Name.mp4`), in the file manager. Only a recording found inside
/// the recordings folder can be shown, and only a plain place inside it. An empty `rel` shows the recording's own folder.
#[tauri::command]
fn reveal_recording(app: tauri::AppHandle, dir: String, name: String, rel: String) -> Result<(), String> {
    let base: PathBuf = files::recording_at(Path::new(&dir), &name)?;
    let target = base.join(files::recording_rel(&rel)?);
    if !target.exists() {
        return Err("That is not there any more.".into());
    }
    app.opener().reveal_item_in_dir(target).map_err(|e| e.to_string())
}

// ---- the recorder

/// Whether the recording program can be found: its path if so, or a message that says what to do.
#[tauri::command]
fn capture_check() -> Result<String, String> {
    program::capture_program().map(|p| p.to_string_lossy().into_owned())
}

/// Start the recorder. Each line it prints reaches the page as a `stream-line` event, and its end as a `stream-exit` event.
#[tauri::command]
fn stream_start(app: tauri::AppHandle, args: Vec<String>) -> Result<(), String> {
    if args.len() > 32 || args.iter().any(|a| a.len() > 2000 || a.contains('\0')) {
        return Err("Those are not options the recorder can be started with.".into());
    }
    let program = program::capture_program()?;
    let for_lines = app.clone();
    stream::start(
        &program,
        &args,
        move |line| {
            let _ = for_lines.emit("stream-line", line);
        },
        move |exit| {
            let _ = app.emit("stream-exit", exit);
        },
    )
}

/// Send the recorder one command: one short line of JSON.
#[tauri::command]
fn stream_send(line: String) -> Result<(), String> {
    stream::send(&line)
}

/// The page says the recorder paused or resumed.
#[tauri::command]
fn stream_set_paused(paused: bool) {
    stream::set_paused(paused)
}

#[tauri::command]
fn stream_state() -> stream::State {
    stream::state()
}

/// Stop the recorder: ask it to finish and print its result, give it ten seconds, and only then end it. Returns whether a recording was running.
#[tauri::command]
async fn stream_stop(stop_line: Option<String>) -> Result<bool, String> {
    let line = stop_line.unwrap_or_else(|| stream::DEFAULT_STOP_LINE.to_string());
    tauri::async_runtime::spawn_blocking(move || stream::stop(&line, stream::STOP_GRACE))
        .await
        .map_err(|e| e.to_string())?
}

// ---- keys that work while another program has the focus
//
// Recording means working in some other program, so starting, pausing and stopping have to work from there. The page names the
// combinations; this registers them with the system and tells the page when one is pressed (a `hotkey` event carrying the id).

#[derive(Deserialize)]
struct HotkeyBinding {
    id: String,
    keys: String,
}

#[derive(Serialize, Debug, PartialEq)]
struct HotkeyResult {
    id: String,
    ok: bool,
    message: String,
}

/// A combination such as Ctrl+Shift+F9, or the reason it cannot be used.
fn parse_hotkey(keys: &str) -> Result<Shortcut, String> {
    hotkeys::check_length(keys)?;
    // Something that is not a key combination at all is said so first.
    let shortcut = keys.trim().parse::<Shortcut>().map_err(|_| {
        "That is not a key combination the system understands. Write it like Ctrl+Shift+F9.".to_string()
    })?;
    hotkeys::check_not_a_plain_key(keys)?;
    Ok(shortcut)
}

/// Replace every registered key with these. Each binding comes back with whether it worked and, if not, why (another program may already
/// use the combination). Nothing stays registered from before, and a failure of one does not stop the rest.
#[tauri::command]
fn hotkeys_set(app: tauri::AppHandle, bindings: Vec<HotkeyBinding>) -> Result<Vec<HotkeyResult>, String> {
    let keys = app.global_shortcut();
    keys.unregister_all().map_err(|e| e.to_string())?;
    let mut taken: Vec<Shortcut> = Vec::new();
    let mut out = Vec::new();
    for b in bindings.into_iter().take(16) {
        let result = (|| -> Result<(), String> {
            if !hotkeys::hotkey_id_ok(&b.id) {
                return Err("That key has no usable name.".into());
            }
            let shortcut = parse_hotkey(&b.keys)?;
            if taken.contains(&shortcut) {
                return Err("Two of these use the same keys. Give each its own.".into());
            }
            let id = b.id.clone();
            keys.on_shortcut(shortcut, move |app, _shortcut, event| {
                if event.state == ShortcutState::Pressed {
                    let _ = app.emit("hotkey", id.clone());
                }
            })
            .map_err(|_| "Another program already uses those keys. Choose different ones.".to_string())?;
            taken.push(shortcut);
            Ok(())
        })();
        out.push(match result {
            Ok(()) => HotkeyResult { id: b.id, ok: true, message: String::new() },
            Err(message) => HotkeyResult { id: b.id, ok: false, message },
        });
    }
    Ok(out)
}

/// Let go of every key, for example when recording is not in use.
#[tauri::command]
fn hotkeys_clear(app: tauri::AppHandle) -> Result<(), String> {
    app.global_shortcut().unregister_all().map_err(|e| e.to_string())
}

// ---- the program

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            default_library,
            ensure_library,
            list_recordings,
            recording_read,
            recording_folders,
            recording_write_edit,
            recording_keep_edit,
            allow_recording_media,
            reveal_recording,
            capture_check,
            stream_start,
            stream_send,
            stream_set_paused,
            stream_state,
            stream_stop,
            hotkeys_set,
            hotkeys_clear,
        ])
        .on_window_event(|window, event| {
            // If the window is gone, a recording must not carry on with nothing to command it, and the keys are let go.
            if let tauri::WindowEvent::Destroyed = event {
                let _ = window.app_handle().global_shortcut().unregister_all();
                stream::shutdown();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running OpenStage Recorder");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn key_combinations_are_checked_before_they_are_registered() {
        for good in ["Ctrl+Shift+F9", "CommandOrControl+Shift+F10", "Alt+F11", "F12", "ctrl+alt+r"] {
            assert!(parse_hotkey(good).is_ok(), "{good} should be accepted");
        }
        let plain = parse_hotkey("R").unwrap_err();
        assert!(plain.contains("not pressed by accident"), "{plain}");
        assert!(parse_hotkey("Shift").is_err());
        assert!(parse_hotkey("").is_err());
        assert!(parse_hotkey("   ").is_err());
        assert!(parse_hotkey("Ctrl+Banana").unwrap_err().contains("not a key combination"));
        assert!(parse_hotkey(&format!("Ctrl+{}", "A".repeat(80))).is_err());
        assert_eq!(
            parse_hotkey("Ctrl+Shift+F9").unwrap(),
            parse_hotkey("control + shift + f9").unwrap(),
            "case and spaces do not matter"
        );
    }
}
