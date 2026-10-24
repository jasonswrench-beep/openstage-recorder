// SPDX-License-Identifier: Apache-2.0
//! The parts of OpenStage Recorder's shell that need no window.
//!
//! The shell (`app/src-tauri`) does only what a web page cannot: touch the file system, start the recording program and talk to it,
//! and register keys that work while another program has the focus. The rules for doing those things safely live here, in a crate
//! that does not need a window system, so they are tested on any computer. The shell is thin: it hands what the page asks for to
//! these functions.
//!
//! The recording program, its protocol and the recording folder are shared with OpenStage Author, which is why the pieces here
//! follow the editor's own shell (`editor/src-tauri` in that project) closely.

use std::process::Command;

pub mod files;
pub mod hotkeys;
pub mod program;
pub mod stream;

/// Tests that use the one recorder slot take turns, because the slot is shared by the whole program.
#[cfg(test)]
pub(crate) static JOB_TESTS: std::sync::Mutex<()> = std::sync::Mutex::new(());

/// Stop a process and everything it started.
pub(crate) fn kill_tree(pid: u32) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        let _ =
            Command::new("taskkill").args(["/PID", &pid.to_string(), "/T", "/F"]).creation_flags(0x0800_0000).output();
    }
    #[cfg(not(windows))]
    {
        let _ = Command::new("kill").args(["-TERM", &pid.to_string()]).output();
    }
}
