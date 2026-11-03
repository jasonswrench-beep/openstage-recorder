// SPDX-License-Identifier: Apache-2.0
//! The icon in the notification area (the "tray") and what it may carry.
//!
//! The icon gives a way to start and stop a quick recording while the window is out of the way. What it can say is small: a tooltip,
//! which Windows cuts at 127 characters, and the ids of its menu items. The checks here need no window system; the shell makes the
//! icon and hands what the page asks for to these functions.

/// The longest tooltip Windows shows (the notification area's own limit is 128 characters including the end of the text).
pub const MAX_TOOLTIP: usize = 127;

/// The choices in the icon's menu, as the ids that reach the page, in the order shown, with the words on each.
pub const MENU: [(&str, &str); 4] =
    [("quick", "Quick record"), ("stop", "Stop recording"), ("show", "Show OpenStage Recorder"), ("quit", "Quit")];

/// A tooltip the system will show: one line, no control characters, never longer than the system allows, with a mark where it was cut.
pub fn tooltip_text(text: &str) -> String {
    let one_line: String = text.chars().map(|c| if c.is_control() { ' ' } else { c }).collect();
    let collapsed = one_line.split_whitespace().collect::<Vec<_>>().join(" ");
    if collapsed.chars().count() <= MAX_TOOLTIP {
        return collapsed;
    }
    let mut cut: String = collapsed.chars().take(MAX_TOOLTIP - 3).collect();
    while cut.ends_with(' ') {
        cut.pop();
    }
    cut.push_str("...");
    cut
}

/// Text for the clipboard: a path or a short sentence, never something that could be a very large paste or hold a control character.
pub fn clipboard_text_ok(text: &str) -> Result<(), String> {
    if text.is_empty() {
        return Err("There is nothing to copy.".into());
    }
    if text.chars().count() > 2000 {
        return Err("That is too long to copy.".into());
    }
    if text.chars().any(|c| c.is_control() && c != '\t') {
        return Err("That has characters in it that cannot be copied.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_menu_has_the_four_choices_in_order_with_plain_ids() {
        let ids: Vec<&str> = MENU.iter().map(|(id, _)| *id).collect();
        assert_eq!(ids, ["quick", "stop", "show", "quit"]);
        assert!(MENU.iter().all(|(id, words)| crate::hotkeys::hotkey_id_ok(id) && !words.is_empty()));
    }

    #[test]
    fn a_short_tooltip_is_kept_and_tidied_to_one_line() {
        assert_eq!(tooltip_text("OpenStage Recorder"), "OpenStage Recorder");
        assert_eq!(tooltip_text("  Recording\r\n  0:42 \t"), "Recording 0:42");
        assert_eq!(tooltip_text(""), "");
    }

    #[test]
    fn a_long_tooltip_is_cut_to_what_windows_shows_and_says_so() {
        let long = "word ".repeat(60);
        let cut = tooltip_text(&long);
        assert!(cut.chars().count() <= MAX_TOOLTIP, "{}", cut.chars().count());
        assert!(cut.ends_with("..."));
        assert!(!cut.contains("  "));
        let exact = "a".repeat(MAX_TOOLTIP);
        assert_eq!(tooltip_text(&exact), exact, "exactly the limit is kept whole");
        assert!(tooltip_text(&"a".repeat(MAX_TOOLTIP + 1)).ends_with("..."));
    }

    #[test]
    fn a_tooltip_with_wide_characters_is_cut_by_characters_not_bytes() {
        let cut = tooltip_text(&"é".repeat(300));
        assert_eq!(cut.chars().count(), MAX_TOOLTIP);
        assert!(cut.ends_with("..."));
    }

    #[test]
    fn only_a_path_sized_plain_text_is_copied() {
        assert!(clipboard_text_ok(
            r"C:\Users\You\Videos\OpenStage Recorder\Quick recording.capture\exports\Quick recording.mp4"
        )
        .is_ok());
        assert!(clipboard_text_ok("").is_err());
        assert!(clipboard_text_ok(&"x".repeat(2001)).is_err());
        assert!(clipboard_text_ok(&"x".repeat(2000)).is_ok());
        assert!(clipboard_text_ok("two\nlines").is_err());
        assert!(clipboard_text_ok("nul\0here").is_err());
    }
}
