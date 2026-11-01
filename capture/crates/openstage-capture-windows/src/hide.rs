// SPDX-License-Identifier: Apache-2.0
//! Hiding chosen windows from the recording (story A7 in `docs/prd.md`: "I can choose windows to exclude. Excluded windows appear blank or
//! blurred in the recording").
//!
//! Windows' screen capture takes the whole screen and cannot leave out another program's window, so the windows to hide are covered in every
//! picture before it is encoded: wherever such a window is on the screen, the picture has a plain dark grey box, and nothing of it is kept. This
//! file holds what can be checked without Windows: choosing the words, matching them to a window, and covering the boxes in a picture.
//! Finding the windows and where they are is `win_windows.rs`.
//!
//! What this does and does not do, so the author is never told more than is true:
//!
//! * The whole box of a hidden window is covered, even where another window is in front of it. That hides a little more than it has to and never less.
//! * A window that opens, moves or is resized is followed within a tenth of a second, so a pop-up can show for a few pictures before it is covered.
//! * Only a screen or part of a screen is covered. A recording of one window shows nothing but that window, so there is nothing to hide.
//! * The notes of what the author did (`--interactions`) still name the window in front, hidden or not, and the webcam and the sound are untouched.

use crate::{CaptureWork, Frame, FrameSource};
use std::rc::Rc;
use std::time::Duration;

/// How many words to hide windows by, at most.
pub const MAX_WORDS: usize = 8;
/// The longest a word may be.
pub const MAX_WORD_LEN: usize = 80;

/// The colour a hidden window is covered with: dark grey, blue green red alpha.
pub const HIDE_COLOUR: [u8; 4] = [0x20, 0x20, 0x20, 0xFF];

/// A box on the whole desktop, in pixels, from `left` and `top` up to but not including `right` and `bottom`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct HideRect {
    pub left: i32,
    pub top: i32,
    pub right: i32,
    pub bottom: i32,
}

/// Where the hidden windows are right now. Called for every picture, so it must be quick.
pub type HideProvider = Rc<dyn Fn() -> Vec<HideRect>>;

/// The words to hide windows by, tidied: spaces trimmed, nothing empty, at most [`MAX_WORDS`] of at most [`MAX_WORD_LEN`] characters. Says in words
/// what is wrong, or `None` for no words at all.
pub fn parse_words(raw: &[String]) -> Result<Vec<String>, String> {
    let words: Vec<String> = raw.iter().map(|w| w.trim().to_string()).filter(|w| !w.is_empty()).collect();
    if words.len() > MAX_WORDS {
        return Err(format!("Hide at most {MAX_WORDS} windows by their words. {} were given.", words.len()));
    }
    if let Some(long) = words.iter().find(|w| w.chars().count() > MAX_WORD_LEN) {
        return Err(format!("A word to hide windows by can be at most {MAX_WORD_LEN} characters. This one is longer: {long}"));
    }
    if let Some(odd) = words.iter().find(|w| w.chars().any(char::is_control)) {
        return Err(format!("A word to hide windows by cannot hold a control character: {odd:?}"));
    }
    Ok(words)
}

/// Whether a window is one to hide: any of the words is part of its title or of its program's name (capital letters do not matter).
pub fn matches_any(words: &[String], title: &str, process: &str) -> bool {
    let title = title.to_lowercase();
    let process = process.to_lowercase();
    words.iter().any(|w| {
        let w = w.to_lowercase();
        title.contains(&w) || process.contains(&w)
    })
}

/// Cover these boxes in a picture. `origin` is where the picture's top left corner is on the desktop. A box partly outside the picture is covered
/// where it is inside, one wholly outside does nothing, and a box with no size does nothing. Says how many boxes touched the picture.
pub fn cover(frame: &mut Frame, origin: (i32, i32), rects: &[HideRect]) -> usize {
    let (width, height) = (frame.width as i64, frame.height as i64);
    if width == 0 || height == 0 || frame.bgra.len() < (width * height * 4) as usize {
        return 0;
    }
    let mut touched = 0;
    for r in rects {
        let left = (r.left as i64 - origin.0 as i64).clamp(0, width);
        let right = (r.right as i64 - origin.0 as i64).clamp(0, width);
        let top = (r.top as i64 - origin.1 as i64).clamp(0, height);
        let bottom = (r.bottom as i64 - origin.1 as i64).clamp(0, height);
        if right <= left || bottom <= top {
            continue;
        }
        touched += 1;
        for y in top..bottom {
            let row = (y * width) as usize * 4;
            for x in left..right {
                let at = row + x as usize * 4;
                frame.bgra[at..at + 4].copy_from_slice(&HIDE_COLOUR);
            }
        }
    }
    touched
}

/// Pictures from another source with the hidden windows covered. Everything else passes through untouched.
pub struct HidingSource {
    inner: Box<dyn FrameSource>,
    origin: (i32, i32),
    provider: HideProvider,
}

impl HidingSource {
    /// `origin` is where the pictures of `inner` start on the desktop (the display's corner, or the region's corner on it).
    pub fn new(inner: Box<dyn FrameSource>, origin: (i32, i32), provider: HideProvider) -> Self {
        Self { inner, origin, provider }
    }
}

impl FrameSource for HidingSource {
    fn next_frame(&mut self, timeout: Duration) -> Option<Frame> {
        let mut frame = self.inner.next_frame(timeout)?;
        let rects = (self.provider)();
        if !rects.is_empty() {
            cover(&mut frame, self.origin, &rects);
        }
        Some(frame)
    }
    fn dropped(&self) -> u64 {
        self.inner.dropped()
    }
    fn received(&self) -> u64 {
        self.inner.received()
    }
    fn recycle(&mut self, frame: Frame) {
        self.inner.recycle(frame);
    }
    fn work(&self) -> CaptureWork {
        self.inner.work()
    }
    fn ended(&self) -> Option<String> {
        self.inner.ended()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    fn frame(width: u32, height: u32) -> Frame {
        Frame { width, height, t_ms: 0, captured_100ns: None, arrived_100ns: None, bgra: vec![0xAA; (width * height * 4) as usize] }
    }

    fn pixel(f: &Frame, x: u32, y: u32) -> [u8; 4] {
        let at = ((y * f.width + x) * 4) as usize;
        [f.bgra[at], f.bgra[at + 1], f.bgra[at + 2], f.bgra[at + 3]]
    }

    fn words(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn words_are_tidied_and_checked() {
        assert_eq!(parse_words(&words(&["  KeePass ", "", "Outlook"])).unwrap(), words(&["KeePass", "Outlook"]));
        assert_eq!(parse_words(&[]).unwrap(), Vec::<String>::new());
        assert_eq!(parse_words(&words(&["  ", ""])).unwrap(), Vec::<String>::new(), "only spaces is no word");
        let nine: Vec<String> = (0..9).map(|i| format!("w{i}")).collect();
        assert!(parse_words(&nine).unwrap_err().contains("at most 8"));
        assert!(parse_words(&[ "x".repeat(81) ]).unwrap_err().contains("at most 80"));
        assert!(parse_words(&[ "x".repeat(80) ]).is_ok());
        assert!(parse_words(&words(&["a\nb"])).unwrap_err().contains("control character"));
    }

    #[test]
    fn a_window_matches_by_a_part_of_its_title_or_its_program_whatever_the_capitals() {
        let w = words(&["keepass", "Mail"]);
        assert!(matches_any(&w, "Passwords - KeePass", "KeePass.exe"));
        assert!(matches_any(&w, "Inbox", "OUTLOOK.EXE") == false, "no word is in either");
        assert!(matches_any(&w, "Inbox - Mail", "HxOutlook.exe"));
        assert!(matches_any(&w, "Untitled", "keepass.exe"), "by the program alone");
        assert!(!matches_any(&[], "anything", "anything.exe"), "no words hide nothing");
    }

    #[test]
    fn a_box_inside_the_picture_is_covered_and_the_rest_is_left_alone() {
        let mut f = frame(10, 8);
        let n = cover(&mut f, (0, 0), &[HideRect { left: 2, top: 1, right: 5, bottom: 4 }]);
        assert_eq!(n, 1);
        assert_eq!(pixel(&f, 2, 1), HIDE_COLOUR);
        assert_eq!(pixel(&f, 4, 3), HIDE_COLOUR);
        assert_eq!(pixel(&f, 5, 3), [0xAA; 4], "right is not included");
        assert_eq!(pixel(&f, 4, 4), [0xAA; 4], "bottom is not included");
        assert_eq!(pixel(&f, 1, 1), [0xAA; 4]);
        let covered = (0..8).flat_map(|y| (0..10).map(move |x| (x, y))).filter(|&(x, y)| pixel(&f, x, y) == HIDE_COLOUR).count();
        assert_eq!(covered, 9, "3 by 3 pixels and no more");
    }

    #[test]
    fn a_box_is_placed_by_where_the_picture_starts_on_the_desktop() {
        let mut f = frame(10, 8);
        // The picture starts at (100, 50) on the desktop; the box is at (103, 52) there.
        cover(&mut f, (100, 50), &[HideRect { left: 103, top: 52, right: 105, bottom: 53 }]);
        assert_eq!(pixel(&f, 3, 2), HIDE_COLOUR);
        assert_eq!(pixel(&f, 4, 2), HIDE_COLOUR);
        assert_eq!(pixel(&f, 5, 2), [0xAA; 4]);
        assert_eq!(pixel(&f, 3, 3), [0xAA; 4]);
        // A display left of the main one starts at a negative place.
        let mut g = frame(10, 8);
        cover(&mut g, (-1920, 0), &[HideRect { left: -1918, top: 0, right: -1916, bottom: 1 }]);
        assert_eq!(pixel(&g, 2, 0), HIDE_COLOUR);
        assert_eq!(pixel(&g, 3, 0), HIDE_COLOUR);
        assert_eq!(pixel(&g, 4, 0), [0xAA; 4]);
    }

    #[test]
    fn a_box_partly_outside_is_covered_where_it_is_inside_and_one_wholly_outside_does_nothing() {
        let mut f = frame(10, 8);
        let n = cover(
            &mut f,
            (0, 0),
            &[
                HideRect { left: -5, top: -5, right: 2, bottom: 2 },
                HideRect { left: 8, top: 6, right: 40, bottom: 40 },
                HideRect { left: 20, top: 20, right: 30, bottom: 30 },
                HideRect { left: 3, top: 3, right: 3, bottom: 6 },
                HideRect { left: 5, top: 5, right: 4, bottom: 6 },
            ],
        );
        assert_eq!(n, 2, "only the first two touch the picture");
        assert_eq!(pixel(&f, 0, 0), HIDE_COLOUR);
        assert_eq!(pixel(&f, 1, 1), HIDE_COLOUR);
        assert_eq!(pixel(&f, 2, 2), [0xAA; 4]);
        assert_eq!(pixel(&f, 9, 7), HIDE_COLOUR);
        assert_eq!(pixel(&f, 8, 6), HIDE_COLOUR);
        assert_eq!(pixel(&f, 7, 6), [0xAA; 4]);
        assert_eq!(pixel(&f, 3, 4), [0xAA; 4], "a box with no width does nothing");
    }

    #[test]
    fn a_picture_that_is_not_the_size_it_says_is_left_alone_rather_than_overrun() {
        let mut f = frame(10, 8);
        f.bgra.truncate(20);
        assert_eq!(cover(&mut f, (0, 0), &[HideRect { left: 0, top: 0, right: 10, bottom: 8 }]), 0);
        assert_eq!(f.bgra.len(), 20);
    }

    struct Fixed(RefCell<Vec<Frame>>);
    impl FrameSource for Fixed {
        fn next_frame(&mut self, _: Duration) -> Option<Frame> {
            let mut frames = self.0.borrow_mut();
            if frames.is_empty() {
                None
            } else {
                Some(frames.remove(0))
            }
        }
        fn dropped(&self) -> u64 {
            3
        }
        fn received(&self) -> u64 {
            7
        }
        fn ended(&self) -> Option<String> {
            Some("gone".into())
        }
    }

    #[test]
    fn the_source_covers_the_boxes_as_they_are_for_each_picture_and_passes_the_rest_through() {
        let moving = Rc::new(RefCell::new(0i32));
        let seen = Rc::clone(&moving);
        let provider: HideProvider = Rc::new(move || {
            let step = *seen.borrow();
            *seen.borrow_mut() += 2;
            vec![HideRect { left: step, top: 0, right: step + 2, bottom: 1 }]
        });
        let mut source = HidingSource::new(Box::new(Fixed(RefCell::new(vec![frame(10, 2), frame(10, 2)]))), (0, 0), provider);
        let first = source.next_frame(Duration::from_millis(1)).unwrap();
        assert_eq!(pixel(&first, 0, 0), HIDE_COLOUR);
        assert_eq!(pixel(&first, 2, 0), [0xAA; 4]);
        let second = source.next_frame(Duration::from_millis(1)).unwrap();
        assert_eq!(pixel(&second, 0, 0), [0xAA; 4], "the box moved on with the window");
        assert_eq!(pixel(&second, 2, 0), HIDE_COLOUR);
        assert!(source.next_frame(Duration::from_millis(1)).is_none(), "no picture is made up");
        assert_eq!((source.dropped(), source.received(), source.ended().as_deref()), (3, 7, Some("gone")));
    }

    #[test]
    fn with_nothing_to_hide_a_picture_is_exactly_as_it_came() {
        let provider: HideProvider = Rc::new(Vec::new);
        let mut source = HidingSource::new(Box::new(Fixed(RefCell::new(vec![frame(6, 4)]))), (0, 0), provider);
        assert_eq!(source.next_frame(Duration::from_millis(1)).unwrap().bgra, frame(6, 4).bgra);
    }
}
