// SPDX-License-Identifier: Apache-2.0
//! Finding the recording program, `openstage-capture`, which the shell starts and talks to (see `stream.rs`). Nothing here records anything.

use std::path::PathBuf;

/// What the author is told when the recording program cannot be found.
pub const NO_CAPTURE: &str = "The recording program was not found. OpenStage Recorder needs openstage-capture.exe: put it in the same folder as OpenStage Recorder, or set OPENSTAGE_CAPTURE to its full path, then open OpenStage Recorder again.";

/// A path without the `\\?\` prefix that Windows adds when a path is made absolute, which most programs do not expect.
pub fn plain_path(p: PathBuf) -> PathBuf {
    match p.to_str().and_then(|s| s.strip_prefix(r"\\?\")) {
        Some(rest) => PathBuf::from(rest),
        None => p,
    }
}

/// The first `rel` found by looking upward from each of the starting places in turn.
pub fn find_in(starts: &[PathBuf], rel: &str) -> Option<PathBuf> {
    for start in starts {
        for ancestor in start.ancestors() {
            let candidate = ancestor.join(rel);
            if candidate.is_file() {
                return Some(candidate);
            }
        }
    }
    None
}

/// Where the recording program is: OPENSTAGE_CAPTURE if it is set, otherwise beside the app or in the usual build folders of the
/// repository it is run from. The Err is a message for the author.
pub fn capture_program_in(setting: Option<&str>, starts: &[PathBuf]) -> Result<PathBuf, String> {
    if let Some(p) = setting.map(str::trim).filter(|p| !p.is_empty()) {
        let path = PathBuf::from(p);
        return if path.is_file() {
            Ok(path)
        } else {
            Err(format!("OPENSTAGE_CAPTURE is set to {}, but there is no program there. Set it to the full path of openstage-capture.exe, or remove it so the app looks beside itself.", path.display()))
        };
    }
    let name = if cfg!(windows) { "openstage-capture.exe" } else { "openstage-capture" };
    for rel in [name.to_string(), format!("capture/target/release/{name}"), format!("target/release/{name}")] {
        if let Some(found) = find_in(starts, &rel) {
            return Ok(plain_path(found));
        }
    }
    Err(NO_CAPTURE.into())
}

/// Where the recording program is, looking where this program is run from.
pub fn capture_program() -> Result<PathBuf, String> {
    let mut starts: Vec<PathBuf> = Vec::new();
    if let Ok(exe) = std::env::current_exe() {
        starts.push(exe);
    }
    if let Ok(cwd) = std::env::current_dir() {
        starts.push(cwd);
    }
    capture_program_in(std::env::var("OPENSTAGE_CAPTURE").ok().as_deref(), &starts)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    fn temp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("openstage-recorder-test-{name}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn the_recording_program_is_found_beside_the_app_or_where_the_setting_says() {
        let dir = temp_dir("program");
        let name = if cfg!(windows) { "openstage-capture.exe" } else { "openstage-capture" };
        let app = dir.join("bin").join("recorder.exe");
        // nothing there yet: the message says what to do
        let none = capture_program_in(None, std::slice::from_ref(&app)).unwrap_err();
        assert_eq!(none, NO_CAPTURE);
        assert!(none.contains("OPENSTAGE_CAPTURE"));
        // beside the app
        fs::create_dir_all(dir.join("bin")).unwrap();
        fs::write(dir.join("bin").join(name), b"x").unwrap();
        assert_eq!(capture_program_in(None, std::slice::from_ref(&app)), Ok(dir.join("bin").join(name)));
        // an empty setting is the same as none
        assert_eq!(capture_program_in(Some("  "), std::slice::from_ref(&app)), Ok(dir.join("bin").join(name)));
        // the setting wins, wherever it points
        fs::write(dir.join("elsewhere.exe"), b"x").unwrap();
        assert_eq!(
            capture_program_in(Some(dir.join("elsewhere.exe").to_str().unwrap()), std::slice::from_ref(&app)),
            Ok(dir.join("elsewhere.exe"))
        );
        // a setting that points at nothing names the setting and the place, and does not quietly fall back
        let message = capture_program_in(Some(dir.join("nope.exe").to_str().unwrap()), &[app]).unwrap_err();
        assert!(message.starts_with("OPENSTAGE_CAPTURE is set to"), "{message}");
        assert!(message.contains("nope.exe"));
        // the repository's usual build folder, found from somewhere inside it
        let repo = dir.join("repo");
        fs::create_dir_all(repo.join("capture/target/release")).unwrap();
        fs::write(repo.join("capture/target/release").join(name), b"x").unwrap();
        assert_eq!(
            capture_program_in(None, &[repo.join("app/src-tauri/target/debug/x.exe")]),
            Ok(repo.join("capture/target/release").join(name))
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_path_made_absolute_by_windows_loses_its_prefix_and_others_are_left_alone() {
        assert_eq!(plain_path(PathBuf::from(r"\\?\C:\Videos\x")), PathBuf::from(r"C:\Videos\x"));
        assert_eq!(plain_path(PathBuf::from(r"C:\Videos\x")), PathBuf::from(r"C:\Videos\x"));
        assert_eq!(plain_path(PathBuf::from("/home/x")), PathBuf::from("/home/x"));
    }
}
