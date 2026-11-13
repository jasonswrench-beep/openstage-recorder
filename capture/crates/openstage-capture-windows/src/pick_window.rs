// SPDX-License-Identifier: Apache-2.0
//! The `pick-window` command: choose the window to record by clicking it (story A1 in `docs/prd.md`).
//!
//! The author runs it, then clicks the window they want. The click only chooses: it is not passed on to the window, so nothing in it is pressed.
//! Escape cancels. The program then says which window was chosen, in the same words the list of windows uses, so what it says can be given to
//! `record --window`. The part that watches the mouse is `win_pick_window.rs`; this is what surrounds it: waiting for a limited time, finding the
//! window in the list, and saying in words what happened, which can all be checked without Windows.

use crate::{check, system_platform, Check, Platform, ScreenError, WindowInfo};
use std::time::Duration;

/// How long to wait for a click, unless told otherwise.
pub const DEFAULT_WAIT: Duration = Duration::from_secs(60);

/// What happened while waiting for a click.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum WindowPick {
    /// The click was on this window (the window in front at that place, taken as a whole).
    Window(WindowInfo),
    /// The click was somewhere that is not a window that can be recorded: the desktop, the taskbar, a pop-up, or a window with no title.
    NotAWindow,
    /// Escape was pressed.
    Cancelled,
    /// Nothing was clicked in time.
    TimedOut,
}

/// What to do.
#[derive(Debug, Clone)]
pub struct PickWindowOptions {
    /// How long to wait for a click.
    pub wait: Duration,
}

impl Default for PickWindowOptions {
    fn default() -> Self {
        Self { wait: DEFAULT_WAIT }
    }
}

/// What to tell the author before waiting.
pub fn instruction(wait: Duration) -> Check {
    check(
        "pick-window",
        true,
        format!(
            "Click the window you want to record. The click only chooses it: the window does not get the click, so nothing in it is pressed. Press Escape to cancel. This waits up to {} seconds.",
            wait.as_secs()
        ),
    )
}

/// The findings for what happened, and whether a window was chosen. A chosen window is reported first as a `window` finding in the same form the
/// list of windows uses, so a program that reads that list can read this.
pub fn findings(pick: &WindowPick, wait: Duration) -> (Vec<Check>, bool) {
    match pick {
        WindowPick::Window(window) => (
            vec![
                check("window", true, window.describe()),
                check(
                    "window-chosen",
                    true,
                    format!("Chosen: {}. To record it, use --window \"{}\". Windows with the same title as another cannot be told apart that way: use the number instead, while the windows are as they are now.", window.describe(), window.title),
                ),
            ],
            true,
        ),
        WindowPick::NotAWindow => (
            vec![check(
                "window-chosen",
                false,
                "That is not a window that can be recorded: it may be the desktop, the taskbar, a pop-up or a window with no title. Try again and click an ordinary open window.".to_string(),
            )],
            false,
        ),
        WindowPick::Cancelled => (vec![check("window-chosen", false, "Escape was pressed, so no window was chosen.".to_string())], false),
        WindowPick::TimedOut => (
            vec![check("window-chosen", false, format!("No window was clicked within {} seconds, so none was chosen.", wait.as_secs()))],
            false,
        ),
    }
}

/// Wait for the author to click a window on this computer. Reports the findings; true if a window was chosen.
pub fn run_pick_window(opts: &PickWindowOptions, report: &mut dyn FnMut(Check)) -> bool {
    run_pick_window_with(system_platform().as_ref(), opts, report)
}

/// The same with the screen given, so that it can be tried without one.
pub fn run_pick_window_with(platform: &dyn Platform, opts: &PickWindowOptions, report: &mut dyn FnMut(Check)) -> bool {
    report(instruction(opts.wait));
    let pick = match platform.pick_window(opts.wait) {
        Ok(WindowPick::Window(clicked)) => {
            // Said with the number the list gives it, so `--window 3` means this window now.
            match platform.list_windows() {
                Ok(list) => match list.into_iter().find(|w| w.handle == clicked.handle) {
                    Some(listed) => WindowPick::Window(listed),
                    None => WindowPick::NotAWindow,
                },
                Err(e) => {
                    report(check("window-chosen", false, format!("A window was clicked, but the list of windows could not be read: {e}")));
                    return false;
                }
            }
        }
        Ok(other) => other,
        Err(ScreenError::NotWindows) => {
            report(check("window-chosen", false, "Choosing a window by clicking works on Windows only.".to_string()));
            return false;
        }
        Err(e) => {
            report(check("window-chosen", false, format!("Windows would not let the program wait for a click: {e}")));
            return false;
        }
    };
    let (found, chosen) = findings(&pick, opts.wait);
    for finding in found {
        report(finding);
    }
    chosen
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{DisplayInfo, FrameSource, WindowsVersion};
    use std::cell::RefCell;

    fn window(number: u32, handle: isize, title: &str) -> WindowInfo {
        WindowInfo { number, handle, title: title.into(), process: "notepad.exe".into(), width: 800, height: 600 }
    }

    /// A screen that answers a click with what it is told to, and has these windows open.
    struct Screen {
        answer: RefCell<Option<Result<WindowPick, ScreenError>>>,
        open: Vec<WindowInfo>,
        waited: RefCell<Vec<Duration>>,
    }
    impl Platform for Screen {
        fn windows_version(&self) -> Result<WindowsVersion, ScreenError> {
            Ok(WindowsVersion { major: 10, minor: 0, build: 26200 })
        }
        fn capture_supported(&self) -> bool {
            true
        }
        fn list_displays(&self) -> Result<Vec<DisplayInfo>, ScreenError> {
            Ok(Vec::new())
        }
        fn start_display_capture(&self, _: &DisplayInfo, _: bool) -> Result<Box<dyn FrameSource>, ScreenError> {
            Err(ScreenError::NotWindows)
        }
        fn list_windows(&self) -> Result<Vec<WindowInfo>, ScreenError> {
            Ok(self.open.clone())
        }
        fn pick_window(&self, wait: Duration) -> Result<WindowPick, ScreenError> {
            self.waited.borrow_mut().push(wait);
            self.answer.borrow_mut().take().expect("asked once")
        }
    }

    fn screen(answer: Result<WindowPick, ScreenError>) -> Screen {
        Screen {
            answer: RefCell::new(Some(answer)),
            open: vec![window(1, 11, "Notes"), window(2, 22, "Lesson plan - Editor"), window(3, 33, "Week 3")],
            waited: RefCell::new(Vec::new()),
        }
    }

    fn run(screen: &Screen) -> (bool, Vec<Check>) {
        let mut said = Vec::new();
        let chosen = run_pick_window_with(screen, &PickWindowOptions { wait: Duration::from_secs(20) }, &mut |c| said.push(c));
        (chosen, said)
    }

    #[test]
    fn the_author_is_told_what_to_do_first_and_how_long_it_waits() {
        let s = screen(Ok(WindowPick::Cancelled));
        let (_, said) = run(&s);
        assert_eq!(said[0].check, "pick-window");
        assert!(said[0].message.contains("Click the window you want to record"));
        assert!(said[0].message.contains("does not get the click"));
        assert!(said[0].message.contains("Press Escape to cancel"));
        assert!(said[0].message.contains("up to 20 seconds"));
        assert_eq!(*s.waited.borrow(), vec![Duration::from_secs(20)]);
    }

    #[test]
    fn a_clicked_window_is_said_as_the_list_says_it_with_the_number_the_list_gives_it() {
        // The click found the window by its handle only; the list says it is number 2.
        let s = screen(Ok(WindowPick::Window(window(0, 22, "Lesson plan - Editor"))));
        let (chosen, said) = run(&s);
        assert!(chosen);
        assert_eq!((said[1].check.as_str(), said[1].ok), ("window", true));
        assert_eq!(said[1].message, "2. notepad.exe: Lesson plan - Editor (800 by 600)");
        assert_eq!(said[2].check, "window-chosen");
        assert!(said[2].message.contains("To record it, use --window \"Lesson plan - Editor\"."));
    }

    #[test]
    fn a_window_that_has_gone_from_the_list_by_the_time_it_is_looked_up_is_not_chosen() {
        let s = screen(Ok(WindowPick::Window(window(0, 999, "Gone"))));
        let (chosen, said) = run(&s);
        assert!(!chosen);
        assert!(said[1].message.contains("not a window that can be recorded"));
    }

    #[test]
    fn a_click_on_the_desktop_escape_and_a_wait_that_ran_out_each_say_so_and_choose_nothing() {
        let (chosen, said) = run(&screen(Ok(WindowPick::NotAWindow)));
        assert!(!chosen && !said[1].ok && said[1].message.contains("desktop, the taskbar"));
        let (chosen, said) = run(&screen(Ok(WindowPick::Cancelled)));
        assert!(!chosen && said[1].message == "Escape was pressed, so no window was chosen.");
        let (chosen, said) = run(&screen(Ok(WindowPick::TimedOut)));
        assert!(!chosen && said[1].message == "No window was clicked within 20 seconds, so none was chosen.");
    }

    #[test]
    fn a_computer_that_is_not_windows_and_a_failure_are_said_in_words() {
        let (chosen, said) = run(&screen(Err(ScreenError::NotWindows)));
        assert!(!chosen && said[1].message == "Choosing a window by clicking works on Windows only.");
        let (chosen, said) = run(&screen(Err(ScreenError::Failed("no hook".into()))));
        assert!(!chosen && said[1].message == "Windows would not let the program wait for a click: no hook");
    }
}
