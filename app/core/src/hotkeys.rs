// SPDX-License-Identifier: Apache-2.0
//! Keys that work while another program has the focus.
//!
//! Recording means working in some other program, so starting, pausing and stopping have to work from there. The page names the
//! combinations; the shell registers them with the system and tells the page when one is pressed. The checks here are the ones that
//! need no system: the shell adds the check that the system itself understands the combination.

/// Ids are short plain words, so the page can tell them apart and nothing odd travels in an event.
pub fn hotkey_id_ok(id: &str) -> bool {
    !id.is_empty() && id.len() <= 32 && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
}

/// A combination such as Ctrl+Shift+F9 has to be something that can be written down at all.
pub fn check_length(keys: &str) -> Result<(), String> {
    let keys = keys.trim();
    if keys.is_empty() || keys.len() > 64 {
        return Err("Choose a key combination.".into());
    }
    Ok(())
}

/// A combination with only a plain letter or number would be pressed all the time while typing anywhere, so it needs Ctrl, Alt, Shift
/// or the Windows key with it, or has to be a function key on its own.
pub fn check_not_a_plain_key(keys: &str) -> Result<(), String> {
    let parts: Vec<&str> = keys.trim().split('+').map(str::trim).collect();
    let modifiers = [
        "ctrl",
        "control",
        "commandorcontrol",
        "cmdorctrl",
        "alt",
        "option",
        "shift",
        "super",
        "meta",
        "cmd",
        "command",
        "win",
        "windows",
    ];
    let has_modifier = parts[..parts.len() - 1].iter().any(|p| modifiers.contains(&p.to_ascii_lowercase().as_str()));
    let last = parts[parts.len() - 1].to_ascii_lowercase();
    let is_function_key = last.len() >= 2
        && last.starts_with('f')
        && last[1..].parse::<u8>().map(|n| (1..=24).contains(&n)).unwrap_or(false);
    if !has_modifier && !is_function_key {
        return Err("Use Ctrl, Alt or Shift with the key, or a function key on its own, so it is not pressed by accident while typing.".into());
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_key_id_is_a_short_plain_word() {
        for good in ["start", "pause", "stop", "start-again", "f9"] {
            assert!(hotkey_id_ok(good), "{good}");
        }
        for bad in ["", "Start", "has space", "x\"y", "a".repeat(33).as_str(), "../x"] {
            assert!(!hotkey_id_ok(bad), "{bad:?}");
        }
    }

    #[test]
    fn a_combination_has_to_be_writable_and_not_a_plain_key() {
        for good in
            ["Ctrl+Shift+F9", "CommandOrControl+Shift+F10", "Alt+F11", "F12", "ctrl+alt+r", "control + shift + f9"]
        {
            assert!(check_length(good).is_ok() && check_not_a_plain_key(good).is_ok(), "{good} should be accepted");
        }
        let plain = check_not_a_plain_key("R").unwrap_err();
        assert!(plain.contains("not pressed by accident"), "{plain}");
        assert!(check_not_a_plain_key("Shift").is_err(), "a modifier alone is not a key combination");
        assert!(check_not_a_plain_key("5").is_err());
        assert!(check_length("").is_err());
        assert!(check_length("   ").is_err());
        assert!(check_length(&format!("Ctrl+{}", "A".repeat(80))).is_err());
    }
}
