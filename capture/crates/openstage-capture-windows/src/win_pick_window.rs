// SPDX-License-Identifier: Apache-2.0
//! Waiting for a click on a window, and finding which window it was. Windows only.
//!
//! A thread of its own watches every mouse click and every key (the way the notes of what the author does do, `win_interactions.rs`). The first
//! left click is taken for itself: the button going down and coming up are both kept from the window under the mouse, so choosing a window never
//! presses anything in it. Escape cancels, and is kept from the program in front too. Nothing else is touched, and the watching stops as soon as
//! it has an answer, or when the time is up. It has been type-checked and tried against a window of its own making; whether it feels right to a
//! person with a real mouse is not known.

use crate::pick_window::WindowPick;
use crate::win_windows::describe_window;
use crate::ScreenError;
use std::cell::RefCell;
use std::sync::mpsc::{self, RecvTimeoutError, Sender};
use std::time::Duration;
use windows::Win32::Foundation::{LPARAM, LRESULT, POINT, WPARAM};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::System::Threading::GetCurrentThreadId;
use windows::Win32::UI::Input::KeyboardAndMouse::VK_ESCAPE;
use windows::Win32::UI::WindowsAndMessaging::{
    CallNextHookEx, DispatchMessageW, GetAncestor, GetMessageW, PostThreadMessageW, SetWindowsHookExW, UnhookWindowsHookEx,
    WindowFromPoint, GA_ROOT, KBDLLHOOKSTRUCT, MSG, MSLLHOOKSTRUCT, WH_KEYBOARD_LL, WH_MOUSE_LL, WM_KEYDOWN, WM_LBUTTONDOWN,
    WM_LBUTTONUP, WM_QUIT, WM_SYSKEYDOWN,
};

/// What the hooks saw.
enum Saw {
    Click(POINT),
    Escape,
}

struct Hooked {
    tx: Sender<Saw>,
    thread_id: u32,
    /// The button went down and was kept back, so its coming up must be kept back too.
    down_kept: bool,
}

thread_local! {
    static HOOKED: RefCell<Option<Hooked>> = const { RefCell::new(None) };
}

/// Stop the thread's message loop, so the hooks are let go.
fn finish(thread_id: u32) {
    unsafe {
        let _ = PostThreadMessageW(thread_id, WM_QUIT, WPARAM(0), LPARAM(0));
    }
}

unsafe extern "system" fn mouse_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 {
        let info = unsafe { &*(lparam.0 as *const MSLLHOOKSTRUCT) };
        let kept = HOOKED.with(|slot| {
            let Ok(mut slot) = slot.try_borrow_mut() else { return false };
            let Some(state) = slot.as_mut() else { return false };
            match wparam.0 as u32 {
                WM_LBUTTONDOWN if !state.down_kept => {
                    state.down_kept = true;
                    let _ = state.tx.send(Saw::Click(info.pt));
                    true
                }
                WM_LBUTTONUP if state.down_kept => {
                    // The click is over: let go of the hooks, after keeping this back too.
                    finish(state.thread_id);
                    true
                }
                _ => false,
            }
        });
        if kept {
            return LRESULT(1);
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

unsafe extern "system" fn keyboard_hook(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code >= 0 && matches!(wparam.0 as u32, WM_KEYDOWN | WM_SYSKEYDOWN) {
        let info = unsafe { &*(lparam.0 as *const KBDLLHOOKSTRUCT) };
        if info.vkCode == VK_ESCAPE.0 as u32 {
            let kept = HOOKED.with(|slot| {
                let Ok(slot) = slot.try_borrow() else { return false };
                let Some(state) = slot.as_ref() else { return false };
                let _ = state.tx.send(Saw::Escape);
                finish(state.thread_id);
                true
            });
            if kept {
                return LRESULT(1);
            }
        }
    }
    unsafe { CallNextHookEx(None, code, wparam, lparam) }
}

/// The thread that owns the hooks. A hook works only while its thread handles messages.
fn run_hooks(tx: Sender<Saw>, ready: Sender<Result<u32, String>>, done: Sender<()>) {
    crate::win::prepare();
    unsafe {
        let thread_id = GetCurrentThreadId();
        HOOKED.with(|slot| *slot.borrow_mut() = Some(Hooked { tx, thread_id, down_kept: false }));
        let module = match GetModuleHandleW(None) {
            Ok(module) => module,
            Err(e) => {
                let _ = ready.send(Err(format!("Windows would not say which program this is: {e}")));
                return;
            }
        };
        let mouse = match SetWindowsHookExW(WH_MOUSE_LL, Some(mouse_hook), Some(module.into()), 0) {
            Ok(hook) => hook,
            Err(e) => {
                let _ = ready.send(Err(format!("Windows would not let the program watch the mouse buttons: {e}")));
                return;
            }
        };
        let keyboard = match SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard_hook), Some(module.into()), 0) {
            Ok(hook) => hook,
            Err(e) => {
                let _ = UnhookWindowsHookEx(mouse);
                let _ = ready.send(Err(format!("Windows would not let the program watch the Escape key: {e}")));
                return;
            }
        };
        let _ = ready.send(Ok(thread_id));
        let mut message = MSG::default();
        while GetMessageW(&mut message, None, 0, 0).as_bool() {
            DispatchMessageW(&message);
        }
        let _ = UnhookWindowsHookEx(mouse);
        let _ = UnhookWindowsHookEx(keyboard);
    }
    HOOKED.with(|slot| slot.borrow_mut().take());
    let _ = done.send(());
}

/// How long to wait, after a click was kept back, for the button to come up so that is kept back too.
const BUTTON_UP_WAIT: Duration = Duration::from_secs(3);

/// Wait up to `wait` for a left click or Escape, and say which window a click was on.
pub(crate) fn pick_window(wait: Duration) -> Result<WindowPick, ScreenError> {
    let (tx, rx) = mpsc::channel();
    let (ready_tx, ready_rx) = mpsc::channel();
    let (done_tx, done_rx) = mpsc::channel();
    let worker = std::thread::spawn(move || run_hooks(tx, ready_tx, done_tx));
    let thread_id = match ready_rx.recv_timeout(Duration::from_secs(5)) {
        Ok(Ok(id)) => id,
        Ok(Err(message)) => {
            let _ = worker.join();
            return Err(ScreenError::Failed(message));
        }
        Err(_) => return Err(ScreenError::Failed("The program could not start watching the mouse within 5 seconds.".into())),
    };
    let saw = rx.recv_timeout(wait);
    if matches!(saw, Ok(Saw::Click(_))) {
        // The button is still down. Its coming up is kept back too (the hooks end themselves then), so nothing is pressed in the window clicked.
        let _ = done_rx.recv_timeout(BUTTON_UP_WAIT);
    }
    finish(thread_id);
    let _ = worker.join();
    match saw {
        Ok(Saw::Escape) => Ok(WindowPick::Cancelled),
        Err(RecvTimeoutError::Timeout) => Ok(WindowPick::TimedOut),
        Err(RecvTimeoutError::Disconnected) => Ok(WindowPick::Cancelled),
        Ok(Saw::Click(point)) => Ok(unsafe {
            let hit = WindowFromPoint(point);
            let root = if hit.0.is_null() { hit } else { GetAncestor(hit, GA_ROOT) };
            match describe_window(root) {
                Some(window) => WindowPick::Window(window),
                None => WindowPick::NotAWindow,
            }
        }),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use windows::core::{w, HSTRING};
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        SendInput, INPUT, INPUT_0, INPUT_MOUSE, MOUSEEVENTF_LEFTDOWN, MOUSEEVENTF_LEFTUP, MOUSEINPUT,
    };
    use windows::Win32::UI::WindowsAndMessaging::{
        CreateWindowExW, DestroyWindow, GetCursorPos, SetCursorPos, WINDOW_EX_STYLE, WS_EX_NOACTIVATE, WS_EX_TOPMOST, WS_OVERLAPPEDWINDOW,
        WS_VISIBLE,
    };

    fn mouse(flags: windows::Win32::UI::Input::KeyboardAndMouse::MOUSE_EVENT_FLAGS) -> INPUT {
        INPUT { r#type: INPUT_MOUSE, Anonymous: INPUT_0 { mi: MOUSEINPUT { dx: 0, dy: 0, mouseData: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } } }
    }

    /// Makes a window of its own on top, clicks the middle of it (the mouse jumps there for a moment and goes back), and checks the click chose it.
    /// It needs a desktop and someone not using the mouse for a second: run it with `cargo test -- --ignored`. It will not click anywhere unless
    /// its own window is the one under that place.
    #[test]
    #[ignore = "needs a desktop, and moves the mouse for a moment"]
    fn a_click_on_a_window_of_its_own_chooses_it() {
        crate::win::prepare();
        unsafe {
            let title = HSTRING::from("OpenStage pick test window 5c2d");
            let hwnd = CreateWindowExW(
                WINDOW_EX_STYLE(WS_EX_TOPMOST.0 | WS_EX_NOACTIVATE.0),
                w!("STATIC"),
                &title,
                WS_OVERLAPPEDWINDOW | WS_VISIBLE,
                400,
                400,
                300,
                200,
                None,
                None,
                None,
                None,
            )
            .expect("Windows made the test window");
            let (x, y) = (550, 520);
            let under = WindowFromPoint(POINT { x, y });
            if under.0.is_null() || GetAncestor(under, GA_ROOT) != hwnd {
                let _ = DestroyWindow(hwnd);
                eprintln!("another window is on top of the test window's middle, so nothing was clicked and nothing was checked");
                return;
            }
            let mut before = POINT::default();
            let _ = GetCursorPos(&mut before);
            let clicker = std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(800));
                let _ = SetCursorPos(x, y);
                let down = [mouse(MOUSEEVENTF_LEFTDOWN)];
                let up = [mouse(MOUSEEVENTF_LEFTUP)];
                SendInput(&down, std::mem::size_of::<INPUT>() as i32);
                std::thread::sleep(Duration::from_millis(60));
                SendInput(&up, std::mem::size_of::<INPUT>() as i32);
            });
            let picked = pick_window(Duration::from_secs(10));
            let _ = clicker.join();
            let _ = SetCursorPos(before.x, before.y);
            let _ = DestroyWindow(hwnd);
            match picked.expect("the mouse could be watched") {
                WindowPick::Window(window) => {
                    assert_eq!(window.title, "OpenStage pick test window 5c2d");
                    assert_eq!((window.width, window.height) > (0, 0), true);
                }
                other => panic!("the click should have chosen the window, but it was {other:?}"),
            }
        }
    }

    #[test]
    #[ignore = "needs a desktop"]
    fn with_no_click_the_wait_runs_out_and_the_hooks_are_let_go() {
        crate::win::prepare();
        let began = std::time::Instant::now();
        let picked = pick_window(Duration::from_millis(400)).expect("the mouse could be watched");
        assert_eq!(picked, WindowPick::TimedOut);
        assert!(began.elapsed() < Duration::from_secs(3), "it came back soon after the wait");
        // A second wait works at once, so the hooks of the first were let go.
        assert_eq!(pick_window(Duration::from_millis(100)).unwrap(), WindowPick::TimedOut);
    }
}
