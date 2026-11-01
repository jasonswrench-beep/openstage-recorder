// SPDX-License-Identifier: Apache-2.0
//! Finding the windows that can be recorded. Windows only.
//!
//! The list is meant to match what a person sees as their open windows (what Alt+Tab shows): visible, not
//! minimized, not hidden on another virtual desktop, with a title, not a tool window, and not owned by
//! another window. The program's own windows (the region picker and the frame round a region) are left
//! out. It has been type-checked for Windows and never run: treat it as unproven.

use crate::hide::{matches_any, HideProvider, HideRect};
use crate::window::{number_windows, WindowInfo};
use crate::ScreenError;
use std::cell::RefCell;
use std::collections::HashMap;
use std::ffi::c_void;
use std::rc::Rc;
use std::time::{Duration, Instant};
use windows::core::{BOOL, PWSTR};
use windows::Win32::Foundation::{CloseHandle, HWND, LPARAM, RECT};
use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS};
use windows::Win32::System::Threading::{
    GetCurrentProcessId, OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION,
};
use windows::Win32::UI::WindowsAndMessaging::{
    EnumWindows, GetWindow, GetWindowLongW, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId, IsIconic,
    IsWindowVisible, GWL_EXSTYLE, GW_OWNER, WS_EX_APPWINDOW, WS_EX_TOOLWINDOW,
};

/// The windows that can be recorded, numbered from 1, the one in front first.
pub(crate) fn list_windows() -> Result<Vec<WindowInfo>, ScreenError> {
    crate::win::prepare();
    let mut found: Vec<WindowInfo> = Vec::new();
    unsafe extern "system" fn each(hwnd: HWND, data: LPARAM) -> BOOL {
        let found = unsafe { &mut *(data.0 as *mut Vec<WindowInfo>) };
        if let Some(window) = unsafe { describe(hwnd) } {
            found.push(window);
        }
        BOOL(1)
    }
    unsafe { EnumWindows(Some(each), LPARAM(&mut found as *mut Vec<WindowInfo> as isize)) }
        .map_err(|e| ScreenError::Failed(format!("Windows would not list the open windows: {e}")))?;
    Ok(number_windows(found))
}

/// How often the windows are looked through again for ones to hide. Where the ones already found are is asked for every picture.
const RESCAN: Duration = Duration::from_millis(100);

/// Where the windows to hide are. Every tenth of a second all the open windows are looked through for ones whose title or program name holds one of the
/// words (so a window that opens is found within that time); for every picture, only the places of the ones found are asked for again (so a window that
/// is moved or resized is followed at once). Unlike the list of windows that can be recorded, this takes in every visible window that is not minimized
/// or hidden on another virtual desktop, whether or not it has a title or belongs to another window, because a pop-up is as private as the window it came from.
pub(crate) fn hide_provider(words: &[String]) -> HideProvider {
    hide_provider_for(words, true)
}

/// The same, with a choice about this program's own windows: they are never the ones to hide when recording (`skip_own`), and only a test, whose own
/// windows are the ones it made, asks for them.
fn hide_provider_for(words: &[String], skip_own: bool) -> HideProvider {
    struct Looked {
        at: Option<Instant>,
        windows: Vec<isize>,
    }
    let words = words.to_vec();
    let looked = RefCell::new(Looked { at: None, windows: Vec::new() });
    Rc::new(move || {
        let mut looked = looked.borrow_mut();
        if looked.at.is_none_or(|at| at.elapsed() >= RESCAN) {
            looked.windows = unsafe { windows_to_hide(&words, skip_own) };
            looked.at = Some(Instant::now());
        }
        looked.windows.iter().filter_map(|&handle| unsafe { shown_bounds(HWND(handle as *mut c_void)) }).collect()
    })
}

/// Every open window that is visible and should be hidden, by its handle.
unsafe fn windows_to_hide(words: &[String], skip_own: bool) -> Vec<isize> {
    struct Search<'a> {
        words: &'a [String],
        skip_own: bool,
        programs: HashMap<u32, String>,
        found: Vec<isize>,
    }
    unsafe extern "system" fn each(hwnd: HWND, data: LPARAM) -> BOOL {
        let search = unsafe { &mut *(data.0 as *mut Search) };
        unsafe {
            if shown_bounds(hwnd).is_none() {
                return BOOL(1);
            }
            let mut process_id = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut process_id));
            if search.skip_own && process_id == GetCurrentProcessId() {
                return BOOL(1); // this program's own windows are never the ones to hide
            }
            let mut title = [0u16; 512];
            let length = GetWindowTextW(hwnd, &mut title).max(0) as usize;
            let title = String::from_utf16_lossy(&title[..length.min(title.len())]);
            let program = search.programs.entry(process_id).or_insert_with(|| program_name(process_id));
            if matches_any(search.words, &title, program) {
                search.found.push(hwnd.0 as isize);
            }
        }
        BOOL(1)
    }
    let mut search = Search { words, skip_own, programs: HashMap::new(), found: Vec::new() };
    let _ = unsafe { EnumWindows(Some(each), LPARAM(&mut search as *mut Search as isize)) };
    search.found
}

/// Where a window is on the desktop as a person sees it (without the invisible borders), or `None` if it is not showing: hidden, minimized, or on
/// another virtual desktop.
unsafe fn shown_bounds(hwnd: HWND) -> Option<HideRect> {
    unsafe {
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return None;
        }
        let mut cloaked = 0u32;
        let asked = DwmGetWindowAttribute(hwnd, DWMWA_CLOAKED, &mut cloaked as *mut u32 as *mut c_void, std::mem::size_of::<u32>() as u32);
        if asked.is_ok() && cloaked != 0 {
            return None;
        }
        let mut bounds = RECT::default();
        let measured = DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut bounds as *mut RECT as *mut c_void,
            std::mem::size_of::<RECT>() as u32,
        )
        .is_ok()
            || GetWindowRect(hwnd, &mut bounds).is_ok();
        if !measured || bounds.right <= bounds.left || bounds.bottom <= bounds.top {
            return None;
        }
        Some(HideRect { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom })
    }
}

/// What to say about one window, or `None` if it is not one that can be recorded: the same rule as the list of windows.
pub(crate) unsafe fn describe_window(hwnd: HWND) -> Option<WindowInfo> {
    unsafe { describe(hwnd) }
}

/// What to say about a window, or `None` if it is not one a person would call an open window.
unsafe fn describe(hwnd: HWND) -> Option<WindowInfo> {
    unsafe {
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return None;
        }
        // Hidden on another virtual desktop, or a suspended app: visible to Windows but not to the person.
        let mut cloaked = 0u32;
        let asked = DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut c_void,
            std::mem::size_of::<u32>() as u32,
        );
        if asked.is_ok() && cloaked != 0 {
            return None;
        }
        // The same rule as Alt+Tab: no tool windows, and nothing that belongs to another window.
        let style = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        let tool = style & WS_EX_TOOLWINDOW.0 != 0 && style & WS_EX_APPWINDOW.0 == 0;
        let owned = GetWindow(hwnd, GW_OWNER).map(|owner| !owner.0.is_null()).unwrap_or(false);
        if tool || (owned && style & WS_EX_APPWINDOW.0 == 0) {
            return None;
        }
        let mut title = [0u16; 512];
        let length = GetWindowTextW(hwnd, &mut title).max(0) as usize;
        if length == 0 {
            return None;
        }
        let title = String::from_utf16_lossy(&title[..length.min(title.len())]);
        if title == "Program Manager" {
            return None; // the desktop itself
        }
        let mut process_id = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut process_id));
        if process_id == GetCurrentProcessId() {
            return None; // this program's own windows
        }
        // The size a person sees: without the invisible borders Windows puts round most windows.
        let mut bounds = RECT::default();
        let measured = DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut bounds as *mut RECT as *mut c_void,
            std::mem::size_of::<RECT>() as u32,
        )
        .is_ok()
            || GetWindowRect(hwnd, &mut bounds).is_ok();
        let (width, height) = if measured {
            ((bounds.right - bounds.left).max(0) as u32, (bounds.bottom - bounds.top).max(0) as u32)
        } else {
            (0, 0)
        };
        if width == 0 || height == 0 {
            return None;
        }
        Some(WindowInfo { number: 0, handle: hwnd.0 as isize, title, process: program_name(process_id), width, height })
    }
}

/// The name of the program a process runs, such as `notepad.exe`.
pub(crate) unsafe fn program_name(process_id: u32) -> String {
    unsafe {
        let Ok(process) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, process_id) else {
            return "an unknown program".to_string();
        };
        let mut buffer = [0u16; 1024];
        let mut length = buffer.len() as u32;
        let ok =
            QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buffer.as_mut_ptr()), &mut length).is_ok();
        let _ = CloseHandle(process);
        if !ok {
            return "an unknown program".to_string();
        }
        let path = String::from_utf16_lossy(&buffer[..(length as usize).min(buffer.len())]);
        path.rsplit(['\\', '/']).next().unwrap_or(&path).to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::core::{w, HSTRING};
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DestroyWindow, SetWindowPos, ShowWindow, SWP_NOACTIVATE, SWP_NOSIZE, SWP_NOZORDER, SW_HIDE, SW_MINIMIZE,
        SW_SHOWNOACTIVATE, WINDOW_EX_STYLE, WS_OVERLAPPEDWINDOW, WS_VISIBLE,
    };

    /// A real window, made with Windows' own plain "STATIC" kind, shown without taking the focus.
    unsafe fn window(title: &str, x: i32, y: i32) -> HWND {
        unsafe {
            let title = HSTRING::from(title);
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE(0),
                w!("STATIC"),
                &title,
                WS_OVERLAPPEDWINDOW | WS_VISIBLE,
                x,
                y,
                400,
                300,
                None,
                None,
                None,
                None,
            )
            .expect("Windows made the test window");
            let _ = ShowWindow(hwnd, SW_SHOWNOACTIVATE);
            hwnd
        }
    }

    /// Makes real windows, so it needs a desktop to show them on: run it with `cargo test -- --ignored`. It records nothing and looks at no one's screen.
    #[test]
    #[ignore = "needs a desktop to show windows on"]
    fn real_windows_with_the_words_are_found_and_followed_and_others_are_not() {
        crate::win::prepare();
        unsafe {
            let secret = window("OpenStage hide test window 7f3a", 300, 300);
            let other = window("OpenStage other test window", 800, 300);
            let provider = hide_provider_for(&["HIDE TEST window 7f3a".to_string()], false);

            let found = provider();
            assert_eq!(found.len(), 1, "only the window with the words in its title: {found:?}");
            let place = found[0];
            // Windows keeps an invisible border of a few pixels round a window, which is left out; a window is never smaller than asked or far bigger.
            assert!((place.left - 300).abs() <= 16 && (place.top - 300).abs() <= 16, "where it was put: {place:?}");
            let (width, height) = (place.right - place.left, place.bottom - place.top);
            assert!((380..=420).contains(&width) && (280..=320).contains(&height), "its size, {width} by {height}");

            // Moved: followed at once, without waiting for the next look through the windows.
            SetWindowPos(secret, None, 500, 400, 0, 0, SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE).expect("moved");
            let moved = provider();
            assert_eq!(moved.len(), 1);
            assert!((moved[0].left - 500).abs() <= 16 && (moved[0].top - 400).abs() <= 16, "followed to where it was moved: {:?}", moved[0]);

            // A window that opens later is found within a tenth of a second or so.
            let late = window("OpenStage hide test window 7f3a (second)", 100, 100);
            std::thread::sleep(RESCAN + Duration::from_millis(60));
            assert_eq!(provider().len(), 2, "the window that opened later is covered too");

            // Hidden or minimized: nothing to cover.
            let _ = ShowWindow(late, SW_HIDE);
            let _ = ShowWindow(secret, SW_MINIMIZE);
            assert_eq!(provider().len(), 0, "a window that is not showing is not covered");

            // The program's own windows are never the ones to hide when recording, even when their title has the words.
            let own = hide_provider(&["other test window".to_string()]);
            assert_eq!(own().len(), 0, "this program's own windows are never the ones to hide");

            for hwnd in [secret, other, late] {
                let _ = DestroyWindow(hwnd);
            }
        }
    }
}
