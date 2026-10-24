// SPDX-License-Identifier: Apache-2.0
//! The recordings folder.
//!
//! The author keeps their recordings in one folder of their choice (by default `Videos\OpenStage Recorder`). A recording is a folder in
//! it, `<library>/<name>.capture`, that the recording program made. The editing screens read its small JSON files, write `edit.json` back
//! into it, and play its videos. Every function here takes the library's folder and the recording's folder NAME, never a path, so nothing
//! outside the library can be reached: a name is one plain folder name ending in `.capture`, a path inside a recording is plain names
//! joined by `/`, only `.json` files (and a take's interaction log) are read as text, and the only file ever written is `edit.json`.
//!
//! These are the same rules as in OpenStage Author's own shell, where the library is a course's `captures` folder. A recording can be
//! copied between the two by copying its folder.

use std::fs;
use std::path::{Path, PathBuf};

use crate::program::plain_path;

/// The most text read from, or written to, a recording's JSON file. An edit of a long recording is far smaller than this.
pub const MAX_RECORDING_TEXT: u64 = 8 * 1024 * 1024;

/// The most a take's interaction log may weigh when it is read. The cursor is noted about thirty times a second, so an hour is a few megabytes.
pub const MAX_INTERACTION_LOG: u64 = 32 * 1024 * 1024;

/// Whether a place inside a recording is a take's interaction log: `takes/take-001/events.jsonl`, and nothing else.
pub fn is_interaction_log(rel: &Path) -> bool {
    let parts: Vec<&str> = rel.iter().filter_map(|p| p.to_str()).collect();
    parts.len() == 3
        && parts[0] == "takes"
        && parts[1].len() > 5
        && parts[1].starts_with("take-")
        && parts[1][5..].chars().all(|c| c.is_ascii_digit())
        && parts[2] == "events.jsonl"
}

/// A recording's folder name: something, then `.capture`, with no way to name another folder or a drive.
pub fn recording_name_ok(name: &str) -> bool {
    let named = name.strip_suffix(".capture").is_some_and(|stem| !stem.trim().is_empty());
    named
        && name.chars().count() <= 100
        && !name.contains("..")
        && name.chars().all(|c| !c.is_control() && !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
}

/// A path inside a recording, as the page writes it: plain names joined by `/` (empty means the recording's own folder).
pub fn recording_rel(rel: &str) -> Result<PathBuf, String> {
    let mut out = PathBuf::new();
    if rel.is_empty() {
        return Ok(out);
    }
    let parts: Vec<&str> = rel.split('/').collect();
    if parts.len() > 6 {
        return Err("That is not a place inside a recording.".into());
    }
    for part in parts {
        let plain = !part.is_empty()
            && part != "."
            && part != ".."
            && part.chars().count() <= 100
            && part.chars().all(|c| !c.is_control() && !matches!(c, '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'));
        if !plain {
            return Err("That is not a place inside a recording.".into());
        }
        out.push(part);
    }
    Ok(out)
}

/// The recordings folder itself: it has to be a full path to a folder that exists. Making a new one is `ensure_library_at`.
fn library_at(dir: &Path) -> Result<&Path, String> {
    if !dir.is_absolute() || !dir.is_dir() {
        return Err("That is not a folder where recordings are kept.".into());
    }
    Ok(dir)
}

/// Make the recordings folder if it is not there yet, and say whether it is now a folder that can be used.
pub fn ensure_library_at(dir: &Path) -> Result<(), String> {
    if !dir.is_absolute() {
        return Err("That is not a folder where recordings can be kept.".into());
    }
    fs::create_dir_all(dir).map_err(|e| format!("Could not make the folder: {e}"))?;
    library_at(dir).map(|_| ())
}

/// The folder of one recording, if the library is a folder and the recording is really inside it.
pub fn recording_at(library: &Path, name: &str) -> Result<PathBuf, String> {
    let library = library_at(library)?;
    if !recording_name_ok(name) {
        return Err("That is not the name of a recording.".into());
    }
    let folder = library.join(name);
    if !folder.join("capture.json").is_file() {
        return Err("That recording was not found in the recordings folder.".into());
    }
    // A folder that is really a link to somewhere else is not followed out of the library.
    let base = library.canonicalize().map_err(|e| e.to_string())?;
    let real = folder.canonicalize().map_err(|e| e.to_string())?;
    if !real.starts_with(&base) {
        return Err("That recording is not inside the recordings folder.".into());
    }
    Ok(plain_path(real))
}

/// The recordings in the library, by folder name.
pub fn list_recordings_at(library: &Path) -> Result<Vec<String>, String> {
    let library = library_at(library)?;
    let Ok(entries) = fs::read_dir(library) else { return Ok(Vec::new()) };
    let mut out: Vec<String> = entries
        .flatten()
        .filter(|e| e.path().join("capture.json").is_file())
        .filter_map(|e| e.file_name().into_string().ok())
        .filter(|n| recording_name_ok(n))
        .collect();
    out.sort();
    out.truncate(500);
    Ok(out)
}

/// The text of a `.json` file inside a recording (or a take's interaction log), or None if there is no such file.
pub fn read_recording_text_at(library: &Path, name: &str, rel: &str) -> Result<Option<String>, String> {
    let base = recording_at(library, name)?;
    let rel = recording_rel(rel)?;
    let log = is_interaction_log(&rel);
    if rel.extension().and_then(|e| e.to_str()) != Some("json") && !log {
        return Err("Only the recording's .json files and its interaction logs can be read as text.".into());
    }
    let file = base.join(rel);
    let Ok(meta) = fs::metadata(&file) else { return Ok(None) };
    if !meta.is_file() {
        return Ok(None);
    }
    if meta.len() > if log { MAX_INTERACTION_LOG } else { MAX_RECORDING_TEXT } {
        return Err("That file is larger than a recording's notes should be.".into());
    }
    fs::read_to_string(&file).map(Some).map_err(|e| format!("Could not read the file: {e}"))
}

/// The names of the folders directly inside a place in a recording.
pub fn recording_folders_at(library: &Path, name: &str, rel: &str) -> Result<Vec<String>, String> {
    let base = recording_at(library, name)?;
    let place = base.join(recording_rel(rel)?);
    let Ok(entries) = fs::read_dir(&place) else { return Ok(Vec::new()) };
    let mut out: Vec<String> =
        entries.flatten().filter(|e| e.path().is_dir()).filter_map(|e| e.file_name().into_string().ok()).collect();
    out.sort();
    out.truncate(2000);
    Ok(out)
}

/// An edit has to be small enough and a JSON object.
fn edit_text_ok(text: &str) -> Result<(), String> {
    if text.len() as u64 > MAX_RECORDING_TEXT {
        return Err("That edit is larger than an edit should be.".into());
    }
    if !serde_json::from_str::<serde_json::Value>(text).map(|v| v.is_object()).unwrap_or(false) {
        return Err("The edit is not in a form that can be saved.".into());
    }
    Ok(())
}

/// Put text in a file of a recording whole or not at all: written beside it first, then renamed into place.
fn put_whole(base: &Path, file: &str, text: &str) -> Result<(), String> {
    let temp = base.join(format!("{file}.tmp"));
    fs::write(&temp, text).map_err(|e| format!("Could not save the edit: {e}"))?;
    fs::rename(&temp, base.join(file)).map_err(|e| {
        let _ = fs::remove_file(&temp);
        format!("Could not save the edit: {e}")
    })
}

/// Write `edit.json` into a recording. It has to be a JSON object, and it is put in place whole or not at all. The only other file the page
/// may write is the kept copy of an older edit (`keep_recording_edit_at`).
pub fn write_recording_edit_at(library: &Path, name: &str, text: &str) -> Result<(), String> {
    let base = recording_at(library, name)?;
    edit_text_ok(text)?;
    put_whole(&base, "edit.json", text)
}

/// The name of the copy of an older edit, kept when a new edit of the newest take replaces it: `edit-before-take-<number>.json`.
pub fn kept_edit_name_ok(file: &str) -> bool {
    file.strip_prefix("edit-before-take-")
        .and_then(|rest| rest.strip_suffix(".json"))
        .is_some_and(|n| (1..=4).contains(&n.len()) && n.bytes().all(|b| b.is_ascii_digit()))
}

/// Keep a copy of the edit that a new edit of the newest take is about to replace, as `edit-before-take-<number>.json` in the recording.
/// It never replaces a file that is already there, so an older copy is never lost; the author is told and nothing is saved.
pub fn keep_recording_edit_at(library: &Path, name: &str, file: &str, text: &str) -> Result<(), String> {
    if !kept_edit_name_ok(file) {
        return Err(format!("{file} is not a name this app keeps an older edit under."));
    }
    let base = recording_at(library, name)?;
    edit_text_ok(text)?;
    if fs::symlink_metadata(base.join(file)).is_ok() {
        return Err(format!(
            "A copy of an older edit named {file} is already in the recording, so another was not made and nothing was saved. Move or rename that file, then save again."
        ));
    }
    put_whole(&base, file, text)
}

/// The `takes` folder of a recording, if it has one: the only part of a recording the page is allowed to play from.
pub fn takes_folder_at(library: &Path, name: &str) -> Result<Option<PathBuf>, String> {
    let takes = recording_at(library, name)?.join("takes");
    Ok(takes.is_dir().then_some(takes))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_library(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("openstage-recorder-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn recording_in(library: &Path, name: &str) -> PathBuf {
        let folder = library.join(name);
        fs::create_dir_all(folder.join("takes").join("take-001")).unwrap();
        fs::write(folder.join("capture.json"), "{\"format\":\"openstage-capture-project\",\"title\":\"Demo\"}")
            .unwrap();
        fs::write(folder.join("takes").join("take-001").join("take.json"), "{\"id\":1}").unwrap();
        fs::write(folder.join("takes").join("take-001").join("screen.mp4"), [0u8, 1, 2]).unwrap();
        folder
    }

    #[test]
    fn a_recording_is_named_by_one_plain_folder_name() {
        for good in ["Demo.capture", "Week 3 demo.capture", "Caf\u{e9}.capture", "a-b_c.capture"] {
            assert!(recording_name_ok(good), "{good}");
        }
        for bad in [
            "",
            ".capture",
            " .capture",
            "Demo",
            "Demo.capture.txt",
            "../Demo.capture",
            "a/b.capture",
            "a\\b.capture",
            "C:.capture",
            "x..y.capture",
            "bad\u{0}.capture",
            "a*b.capture",
            &format!("{}.capture", "x".repeat(100)),
        ] {
            assert!(!recording_name_ok(bad), "{bad:?}");
        }
    }

    #[test]
    fn a_place_inside_a_recording_is_plain_names_and_nothing_that_climbs_out() {
        assert_eq!(recording_rel("").unwrap(), PathBuf::new());
        assert_eq!(
            recording_rel("takes/take-001/take.json").unwrap(),
            PathBuf::from("takes").join("take-001").join("take.json")
        );
        for bad in [
            "/takes",
            "takes/",
            "takes//x",
            "..",
            "../x",
            "takes/../x",
            "./x",
            "a\\b",
            "C:/x",
            "takes/x:y",
            "a/b/c/d/e/f/g",
            "x\u{0}y",
        ] {
            assert!(recording_rel(bad).is_err(), "{bad:?}");
        }
    }

    #[test]
    fn the_recordings_are_listed_and_read_and_nothing_else_is_reachable() {
        let library = temp_library("library");
        assert_eq!(list_recordings_at(&library).unwrap(), Vec::<String>::new(), "nothing recorded yet");
        recording_in(&library, "B demo.capture");
        recording_in(&library, "A demo.capture");
        fs::create_dir_all(library.join("not a recording")).unwrap();
        fs::create_dir_all(library.join("empty.capture")).unwrap();
        assert_eq!(
            list_recordings_at(&library).unwrap(),
            vec!["A demo.capture".to_string(), "B demo.capture".to_string()],
            "only real recordings, in order"
        );

        assert!(read_recording_text_at(&library, "A demo.capture", "capture.json")
            .unwrap()
            .unwrap()
            .contains("openstage-capture-project"));
        assert_eq!(
            read_recording_text_at(&library, "A demo.capture", "takes/take-001/take.json").unwrap().as_deref(),
            Some("{\"id\":1}")
        );
        assert_eq!(read_recording_text_at(&library, "A demo.capture", "edit.json").unwrap(), None, "no edit yet");
        assert_eq!(recording_folders_at(&library, "A demo.capture", "takes").unwrap(), vec!["take-001".to_string()]);
        assert_eq!(recording_folders_at(&library, "A demo.capture", "nothing").unwrap(), Vec::<String>::new());

        assert!(
            read_recording_text_at(&library, "A demo.capture", "takes/take-001/screen.mp4").is_err(),
            "a video is not text"
        );
        assert!(read_recording_text_at(&library, "A demo.capture", "../../x.json").is_err(), "cannot climb out");
        assert!(read_recording_text_at(&library, "../x.capture", "capture.json").is_err(), "a name is not a path");
        assert!(read_recording_text_at(&library, "Missing.capture", "capture.json").is_err());
        assert!(
            read_recording_text_at(Path::new("relative/folder"), "A demo.capture", "capture.json").is_err(),
            "a library is a full path"
        );
        assert!(
            read_recording_text_at(&library.join("no such folder"), "A demo.capture", "capture.json").is_err(),
            "a library exists"
        );
        assert!(list_recordings_at(&library.join("no such folder")).is_err());
        let _ = fs::remove_dir_all(&library);
    }

    #[test]
    fn a_takes_interaction_log_can_be_read_as_text_and_no_other_file_that_is_not_json() {
        let library = temp_library("interaction-log");
        let folder = recording_in(&library, "Demo.capture");
        let log = "{\"t\":0,\"type\":\"window\",\"title\":\"x\",\"process\":\"x.exe\"}\n";
        fs::write(folder.join("takes").join("take-001").join("events.jsonl"), log).unwrap();
        assert_eq!(
            read_recording_text_at(&library, "Demo.capture", "takes/take-001/events.jsonl").unwrap().as_deref(),
            Some(log)
        );
        assert_eq!(
            read_recording_text_at(&library, "Demo.capture", "takes/take-002/events.jsonl").unwrap(),
            None,
            "no such take, no log"
        );
        for bad in [
            "events.jsonl",
            "takes/events.jsonl",
            "takes/take-001/other.jsonl",
            "takes/take-/events.jsonl",
            "takes/take-1a/events.jsonl",
            "takes/take-001/sub/events.jsonl",
            "takes/take-001/screen.mp4",
            "takes/take-001/mic.wav",
        ] {
            assert!(
                read_recording_text_at(&library, "Demo.capture", bad).is_err()
                    || read_recording_text_at(&library, "Demo.capture", bad).unwrap().is_none(),
                "{bad:?}"
            );
        }
        assert!(
            read_recording_text_at(&library, "Demo.capture", "takes/take-001/other.jsonl").is_err(),
            "only the interaction log"
        );
        assert!(
            read_recording_text_at(&library, "Demo.capture", "takes/take-001/../take-001/events.jsonl").is_err(),
            "no climbing"
        );
        let _ = fs::remove_dir_all(&library);
    }

    #[test]
    fn an_older_edit_is_kept_under_its_own_name_and_never_replaced() {
        let library = temp_library("kept");
        let folder = recording_in(&library, "Demo.capture");
        for good in ["edit-before-take-1.json", "edit-before-take-0002.json", "edit-before-take-9999.json"] {
            assert!(kept_edit_name_ok(good), "{good}");
        }
        for bad in [
            "edit.json",
            "edit-before-take-.json",
            "edit-before-take-12345.json",
            "edit-before-take-1x.json",
            "edit-before-take-1.json.tmp",
            "../edit-before-take-1.json",
            "edit-before-take-1/../x.json",
            "capture.json",
            "",
        ] {
            assert!(!kept_edit_name_ok(bad), "{bad:?}");
            assert!(keep_recording_edit_at(&library, "Demo.capture", bad, "{}").is_err(), "{bad:?}");
        }
        keep_recording_edit_at(&library, "Demo.capture", "edit-before-take-2.json", "{\"version\":1}").unwrap();
        assert_eq!(fs::read_to_string(folder.join("edit-before-take-2.json")).unwrap(), "{\"version\":1}");
        assert!(!folder.join("edit-before-take-2.json.tmp").exists(), "no half-written file is left");
        let again =
            keep_recording_edit_at(&library, "Demo.capture", "edit-before-take-2.json", "{\"version\":2}").unwrap_err();
        assert!(again.contains("already in the recording"), "{again}");
        assert_eq!(
            fs::read_to_string(folder.join("edit-before-take-2.json")).unwrap(),
            "{\"version\":1}",
            "the older copy is untouched"
        );
        assert!(keep_recording_edit_at(&library, "Demo.capture", "edit-before-take-3.json", "not json").is_err());
        assert!(!folder.join("edit-before-take-3.json").exists(), "a refused copy leaves nothing");
        assert!(keep_recording_edit_at(&library, "Missing.capture", "edit-before-take-1.json", "{}").is_err());
        assert!(keep_recording_edit_at(&library, "../Demo.capture", "edit-before-take-1.json", "{}").is_err());
        let _ = fs::remove_dir_all(&library);
    }

    #[test]
    fn an_edit_is_saved_whole_into_edit_json_and_nothing_else_is_written() {
        let library = temp_library("edit");
        let folder = recording_in(&library, "Demo.capture");
        write_recording_edit_at(&library, "Demo.capture", "{\"version\":1,\"tracks\":[]}").unwrap();
        assert_eq!(fs::read_to_string(folder.join("edit.json")).unwrap(), "{\"version\":1,\"tracks\":[]}");
        write_recording_edit_at(&library, "Demo.capture", "{\"version\":1,\"tracks\":[1]}").unwrap();
        assert_eq!(
            read_recording_text_at(&library, "Demo.capture", "edit.json").unwrap().as_deref(),
            Some("{\"version\":1,\"tracks\":[1]}"),
            "replaced"
        );
        assert!(!folder.join("edit.json.tmp").exists(), "no half-written file is left");
        for bad in ["", "not json", "[1,2]", "{\"unfinished\":"] {
            assert!(write_recording_edit_at(&library, "Demo.capture", bad).is_err(), "{bad:?}");
        }
        assert_eq!(
            fs::read_to_string(folder.join("edit.json")).unwrap(),
            "{\"version\":1,\"tracks\":[1]}",
            "a refused edit changes nothing"
        );
        let huge = format!("{{\"x\":\"{}\"}}", "a".repeat(MAX_RECORDING_TEXT as usize));
        assert!(write_recording_edit_at(&library, "Demo.capture", &huge).is_err(), "too large");
        assert!(write_recording_edit_at(&library, "../Demo.capture", "{}").is_err());
        assert!(write_recording_edit_at(&library, "Missing.capture", "{}").is_err());
        assert_eq!(
            fs::read_to_string(folder.join("capture.json")).unwrap(),
            "{\"format\":\"openstage-capture-project\",\"title\":\"Demo\"}",
            "nothing else was touched"
        );
        let _ = fs::remove_dir_all(&library);
    }

    #[test]
    fn the_takes_folder_is_the_only_part_that_can_be_played_from() {
        let library = temp_library("takes");
        recording_in(&library, "Demo.capture");
        let takes = takes_folder_at(&library, "Demo.capture").unwrap().expect("it has takes");
        assert!(takes.ends_with("takes"));
        fs::create_dir_all(library.join("Bare.capture")).unwrap();
        fs::write(library.join("Bare.capture").join("capture.json"), "{}").unwrap();
        assert_eq!(takes_folder_at(&library, "Bare.capture").unwrap(), None, "a recording with no takes yet");
        assert!(takes_folder_at(&library, "Missing.capture").is_err());
        let _ = fs::remove_dir_all(&library);
    }

    #[test]
    fn a_recordings_folder_is_made_when_it_is_missing_and_only_from_a_full_path() {
        let library = temp_library("ensure");
        let inner = library.join("Videos").join("OpenStage Recorder");
        assert!(!inner.exists());
        ensure_library_at(&inner).unwrap();
        assert!(inner.is_dir());
        ensure_library_at(&inner).unwrap(); // already there: fine
        assert!(
            ensure_library_at(Path::new("Videos/OpenStage Recorder")).is_err(),
            "a relative place could be anywhere"
        );
        let _ = fs::remove_dir_all(&library);
    }

    /// A folder that is really a link to somewhere outside the library is not followed. Windows needs special rights to make links,
    /// so this is only tried where it can be made.
    #[cfg(unix)]
    #[test]
    fn a_recording_that_is_a_link_out_of_the_library_is_not_followed() {
        let library = temp_library("link-library");
        let outside = temp_library("link-outside");
        recording_in(&outside, "Elsewhere.capture");
        std::os::unix::fs::symlink(outside.join("Elsewhere.capture"), library.join("Linked.capture")).unwrap();
        assert!(recording_at(&library, "Linked.capture").is_err());
        assert!(read_recording_text_at(&library, "Linked.capture", "capture.json").is_err());
        assert!(write_recording_edit_at(&library, "Linked.capture", "{}").is_err());
        let _ = fs::remove_dir_all(&library);
        let _ = fs::remove_dir_all(&outside);
    }
}
