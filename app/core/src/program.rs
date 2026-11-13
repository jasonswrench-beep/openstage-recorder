// SPDX-License-Identifier: Apache-2.0
//! Finding the recording program, `openstage-capture`, which the shell starts and talks to (see `stream.rs`). Nothing here records anything.

use std::path::{Path, PathBuf};

/// What the author is told when the recording program cannot be found.
pub const NO_CAPTURE: &str = "The recording program was not found. OpenStage Recorder needs openstage-capture.exe: put it in the same folder as OpenStage Recorder, or set OPENSTAGE_CAPTURE to its full path, then open OpenStage Recorder again.";

/// A path without the `\\?\` prefix that Windows adds when a path is made absolute, which most programs do not expect.
pub fn plain_path(p: PathBuf) -> PathBuf {
    match p.to_str().and_then(|s| s.strip_prefix(r"\\?\")) {
        Some(rest) => PathBuf::from(rest),
        None => p,
    }
}

/// Where the recording program is: OPENSTAGE_CAPTURE if it is set (the launchers in app/ set it when the app is run from the repository),
/// otherwise beside the app. Nowhere else is looked at, so a program of the same name in a folder above, or in the folder the app was started
/// from, is never run. The Err is a message for the author.
pub fn capture_program_in(setting: Option<&str>, app: Option<&Path>) -> Result<PathBuf, String> {
    if let Some(p) = setting.map(str::trim).filter(|p| !p.is_empty()) {
        let path = PathBuf::from(p);
        return if path.is_file() {
            Ok(path)
        } else {
            Err(format!("OPENSTAGE_CAPTURE is set to {}, but there is no program there. Set it to the full path of openstage-capture.exe, or remove it so the app looks beside itself.", path.display()))
        };
    }
    let name = if cfg!(windows) { "openstage-capture.exe" } else { "openstage-capture" };
    match app.and_then(Path::parent).map(|folder| folder.join(name)) {
        Some(beside) if beside.is_file() => Ok(plain_path(beside)),
        _ => Err(NO_CAPTURE.into()),
    }
}

/// Where the recording program is: OPENSTAGE_CAPTURE, or beside this program.
pub fn capture_program() -> Result<PathBuf, String> {
    let exe = std::env::current_exe().ok();
    capture_program_in(std::env::var("OPENSTAGE_CAPTURE").ok().as_deref(), exe.as_deref())
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
        let none = capture_program_in(None, Some(&app)).unwrap_err();
        assert_eq!(none, NO_CAPTURE);
        assert!(none.contains("OPENSTAGE_CAPTURE"));
        // beside the app
        fs::create_dir_all(dir.join("bin")).unwrap();
        fs::write(dir.join("bin").join(name), b"x").unwrap();
        assert_eq!(capture_program_in(None, Some(&app)), Ok(dir.join("bin").join(name)));
        // an empty setting is the same as none
        assert_eq!(capture_program_in(Some("  "), Some(&app)), Ok(dir.join("bin").join(name)));
        // the setting wins, wherever it points
        fs::write(dir.join("elsewhere.exe"), b"x").unwrap();
        assert_eq!(
            capture_program_in(Some(dir.join("elsewhere.exe").to_str().unwrap()), Some(&app)),
            Ok(dir.join("elsewhere.exe"))
        );
        // a setting that points at nothing names the setting and the place, and does not quietly fall back
        let message = capture_program_in(Some(dir.join("nope.exe").to_str().unwrap()), Some(&app)).unwrap_err();
        assert!(message.starts_with("OPENSTAGE_CAPTURE is set to"), "{message}");
        assert!(message.contains("nope.exe"));
        // nowhere else: not a folder above the app, and not a build folder of the repository it was built in
        let repo = dir.join("repo");
        fs::create_dir_all(repo.join("capture/target/release")).unwrap();
        fs::write(repo.join("capture/target/release").join(name), b"x").unwrap();
        fs::write(repo.join(name), b"x").unwrap();
        assert_eq!(
            capture_program_in(None, Some(&repo.join("app/src-tauri/target/debug/x.exe"))),
            Err(NO_CAPTURE.to_string())
        );
        assert_eq!(capture_program_in(None, None), Err(NO_CAPTURE.to_string()));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn a_path_made_absolute_by_windows_loses_its_prefix_and_others_are_left_alone() {
        assert_eq!(plain_path(PathBuf::from(r"\\?\C:\Videos\x")), PathBuf::from(r"C:\Videos\x"));
        assert_eq!(plain_path(PathBuf::from(r"C:\Videos\x")), PathBuf::from(r"C:\Videos\x"));
        assert_eq!(plain_path(PathBuf::from("/home/x")), PathBuf::from("/home/x"));
    }
}
