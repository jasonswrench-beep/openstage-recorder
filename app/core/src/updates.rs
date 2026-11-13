// SPDX-License-Identifier: Apache-2.0
//! Check for updates: when the person presses the button on the Help tab (never by itself), one request to the list of this program's releases
//! on GitHub, and an answer in words with a link to the newer release's page. Nothing is downloaded or installed; the person runs the new
//! setup, which updates the copy in place. It is the same in every tool of the OpenStage suite (docs/recorder/UPDATE-CHECK.md says what and
//! why).
//!
//! What is compared: the exact release this copy was built as (OPENSTAGE_RELEASE, set by app/tools/build_installer.py's RELEASE), with the
//! highest published tag: vMAJOR.MINOR.PATCH, or with -alpha.N, -beta.N or -rc.N after it (a final release comes after its pre-releases).
//! Pre-releases count, drafts never do. A copy not built by that script is told the newest published version.
//! What is sent: nothing about the person or their recordings, only a request for the list with a plain name for the program.
//! How: the request is made here, by Windows' own HTTPS code (WinHTTP), so the window itself still cannot reach the network (its content
//! security policy allows only the app's own channel), and no web library is added to the program.
//! Turning it off: OPENSTAGE_UPDATE_CHECK=off in the environment, or a file update-check.txt that says off, beside the program.

use std::path::Path;

pub const RELEASES_API_HOST: &str = "api.github.com";
pub const RELEASES_API_PATH: &str = "/repos/jasonswrench-beep/openstage-recorder/releases?per_page=30";
pub const RELEASES_PAGE: &str = "https://github.com/jasonswrench-beep/openstage-recorder/releases";
#[cfg_attr(not(windows), allow(dead_code))]
const USER_AGENT: &str = "OpenStageRecorder-update-check";
/// The most of an answer that is read.
#[cfg_attr(not(windows), allow(dead_code))]
const MOST: usize = 2 * 1024 * 1024;
/// How long each part of the request may take: finding the server, connecting, sending, and waiting for the answer.
#[cfg_attr(not(windows), allow(dead_code))]
const TIMEOUT_MS: i32 = 15_000;

/// The release this copy was built as, such as 0.1.0-alpha.4. Empty when it was not built by the installer script.
pub fn release() -> &'static str {
    option_env!("OPENSTAGE_RELEASE").unwrap_or("")
}

/// A version as it sorts: the three numbers, then where it stands (alpha, beta, rc, final) and its number.
pub fn version_key(text: &str) -> Option<(u64, u64, u64, u8, u64)> {
    let text = text.trim().trim_start_matches('v');
    let (main, pre) = match text.split_once('-') {
        Some((m, p)) => (m, Some(p)),
        None => (text, None),
    };
    let number =
        |n: &str| if n.is_empty() || !n.bytes().all(|b| b.is_ascii_digit()) { None } else { n.parse::<u64>().ok() };
    let mut nums = main.split('.').map(number);
    let (a, b, c) = (nums.next()??, nums.next()??, nums.next()??);
    if nums.next().is_some() {
        return None;
    }
    let (stage, n) = match pre {
        None => (3, 0),
        Some(p) => {
            let (word, num) = p.split_once('.')?;
            let stage = match word {
                "alpha" => 0,
                "beta" => 1,
                "rc" => 2,
                _ => return None,
            };
            (stage, number(num)?)
        }
    };
    Some((a, b, c, stage, n))
}

/// "0.1.0 alpha 4" for 0.1.0-alpha.4.
pub fn spoken(version: &str) -> String {
    let v = version.trim_start_matches('v');
    match v.split_once('-') {
        Some((main, pre)) => format!("{main} {}", pre.replace('.', " ")),
        None => v.to_string(),
    }
}

/// The page of a release of this program, and only of this program: a tag that is not a plain version gives the list of releases.
pub fn release_page(tag: &str) -> String {
    if version_key(tag).is_some() && tag.starts_with('v') {
        format!("{RELEASES_PAGE}/tag/{tag}")
    } else {
        RELEASES_PAGE.to_string()
    }
}

/// Whether an address is a page of this program's releases (the list, or one release by its tag): the only pages the window may open.
pub fn is_release_page(url: &str) -> bool {
    url == RELEASES_PAGE
        || url
            .strip_prefix(RELEASES_PAGE)
            .and_then(|rest| rest.strip_prefix("/tag/"))
            .is_some_and(|tag| tag.starts_with('v') && version_key(tag).is_some())
}

/// The answer, for the page: "newer", "current", "unknown" (a copy not built by the installer script), "off" or "error".
pub fn answer(installed: &str, releases_json: &str) -> serde_json::Value {
    let Ok(serde_json::Value::Array(list)) = serde_json::from_str::<serde_json::Value>(releases_json) else {
        return serde_json::json!({ "state": "error", "message": "The list of releases could not be read. Try again later, or look at the releases page.", "url": RELEASES_PAGE });
    };
    let newest = list
        .iter()
        .filter(|r| r["draft"].as_bool() != Some(true))
        .filter_map(|r| r["tag_name"].as_str())
        .filter_map(|tag| version_key(tag).map(|k| (k, tag.to_string())))
        .max();
    let Some((newest_key, tag)) = newest else {
        return serde_json::json!({ "state": "error", "message": "No release is published yet.", "url": RELEASES_PAGE });
    };
    let latest = tag.trim_start_matches('v').to_string();
    match version_key(installed) {
        None => serde_json::json!({
            "state": "unknown", "latest": latest, "url": release_page(&tag),
            "message": format!("This copy was not made by the setup, so its release is not known. The newest published version is {}.", spoken(&latest)),
        }),
        Some(mine) if newest_key > mine => serde_json::json!({
            "state": "newer", "latest": latest, "url": release_page(&tag),
            "message": format!("A newer version is published: {} (this copy is {}). Its page has what changed and the setup; running the setup updates this copy and keeps your recordings and settings.", spoken(&latest), spoken(installed)),
        }),
        Some(mine) => serde_json::json!({
            "state": "current", "latest": latest,
            "message": if newest_key == mine {
                format!("This copy is up to date: {} is the newest published version.", spoken(installed))
            } else {
                format!("This copy is up to date. It is {}, and the newest published version is {}.", spoken(installed), spoken(&latest))
            },
        }),
    }
}

/// Whether checking is turned off on this computer: OPENSTAGE_UPDATE_CHECK=off, or update-check.txt beside the program saying off.
pub fn turned_off(program_dir: Option<&Path>) -> bool {
    let off = |s: &str| s.trim().eq_ignore_ascii_case("off");
    std::env::var("OPENSTAGE_UPDATE_CHECK").is_ok_and(|v| off(&v))
        || program_dir.and_then(|d| std::fs::read_to_string(d.join("update-check.txt")).ok()).is_some_and(|t| off(&t))
}

/// Check now, as the button asks.
pub fn check(program_dir: Option<&Path>) -> serde_json::Value {
    if turned_off(program_dir) {
        return serde_json::json!({ "state": "off", "message": "Checking for updates is turned off on this computer (by whoever looks after it)." });
    }
    match fetch_releases() {
        Ok(text) => answer(release(), &text),
        Err(message) => serde_json::json!({ "state": "error", "message": message, "url": RELEASES_PAGE }),
    }
}

/// Ask GitHub for the list of releases, with Windows' own HTTPS code: HTTPS only, no redirects followed, no cookies, at most 2 MB, and
/// 15 seconds for each step.
#[cfg(windows)]
fn fetch_releases() -> Result<String, String> {
    winhttp::get(RELEASES_API_HOST, RELEASES_API_PATH)
}

#[cfg(not(windows))]
fn fetch_releases() -> Result<String, String> {
    Err("Checking for updates works only in the Windows program.".to_string())
}

#[cfg(windows)]
mod winhttp {
    use super::{MOST, TIMEOUT_MS, USER_AGENT};
    use std::ffi::c_void;
    use windows::core::{HSTRING, PCWSTR};
    use windows::Win32::Networking::WinHttp::{
        WinHttpCloseHandle, WinHttpConnect, WinHttpOpen, WinHttpOpenRequest, WinHttpQueryHeaders, WinHttpReadData,
        WinHttpReceiveResponse, WinHttpSendRequest, WinHttpSetOption, WinHttpSetTimeouts, INTERNET_DEFAULT_HTTPS_PORT,
        WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, WINHTTP_DISABLE_COOKIES, WINHTTP_DISABLE_REDIRECTS, WINHTTP_FLAG_SECURE,
        WINHTTP_OPTION_DISABLE_FEATURE, WINHTTP_OPTION_REDIRECT_POLICY, WINHTTP_OPTION_REDIRECT_POLICY_NEVER,
        WINHTTP_QUERY_FLAG_NUMBER, WINHTTP_QUERY_STATUS_CODE,
    };

    /// A WinHTTP handle that is closed when it goes.
    struct Handle(*mut c_void);

    impl Drop for Handle {
        fn drop(&mut self) {
            if !self.0.is_null() {
                unsafe {
                    let _ = WinHttpCloseHandle(self.0);
                }
            }
        }
    }

    fn opened(raw: *mut c_void) -> Result<Handle, String> {
        if raw.is_null() {
            Err(UNREACHABLE.to_string())
        } else {
            Ok(Handle(raw))
        }
    }

    const UNREACHABLE: &str =
        "GitHub could not be reached. Check the internet connection, or look at the releases page later.";

    fn set_number(handle: &Handle, option: u32, value: u32) -> Result<(), String> {
        let bytes = value.to_ne_bytes();
        unsafe { WinHttpSetOption(Some(handle.0 as *const c_void), option, Some(&bytes)) }
            .map_err(|_| UNREACHABLE.to_string())
    }

    /// GET https://host/path, and the answer as text.
    pub(super) fn get(host: &str, path: &str) -> Result<String, String> {
        let agent = HSTRING::from(USER_AGENT);
        let host = HSTRING::from(host);
        let path = HSTRING::from(path);
        let verb = HSTRING::from("GET");
        unsafe {
            let session =
                opened(WinHttpOpen(&agent, WINHTTP_ACCESS_TYPE_AUTOMATIC_PROXY, PCWSTR::null(), PCWSTR::null(), 0))?;
            WinHttpSetTimeouts(session.0, TIMEOUT_MS, TIMEOUT_MS, TIMEOUT_MS, TIMEOUT_MS)
                .map_err(|_| UNREACHABLE.to_string())?;
            set_number(&session, WINHTTP_OPTION_REDIRECT_POLICY, WINHTTP_OPTION_REDIRECT_POLICY_NEVER)?;
            let connection = opened(WinHttpConnect(session.0, &host, INTERNET_DEFAULT_HTTPS_PORT, 0))?;
            let request = opened(WinHttpOpenRequest(
                connection.0,
                &verb,
                &path,
                PCWSTR::null(),
                PCWSTR::null(),
                std::ptr::null(),
                WINHTTP_FLAG_SECURE,
            ))?;
            set_number(&request, WINHTTP_OPTION_DISABLE_FEATURE, WINHTTP_DISABLE_REDIRECTS | WINHTTP_DISABLE_COOKIES)?;
            let headers: Vec<u16> = "Accept: application/vnd.github+json\r\n".encode_utf16().collect();
            WinHttpSendRequest(request.0, Some(&headers), None, 0, 0, 0).map_err(|_| UNREACHABLE.to_string())?;
            WinHttpReceiveResponse(request.0, std::ptr::null_mut()).map_err(|_| UNREACHABLE.to_string())?;

            let mut status = 0u32;
            let mut size = std::mem::size_of::<u32>() as u32;
            WinHttpQueryHeaders(
                request.0,
                WINHTTP_QUERY_STATUS_CODE | WINHTTP_QUERY_FLAG_NUMBER,
                PCWSTR::null(),
                Some(&mut status as *mut u32 as *mut c_void),
                &mut size,
                std::ptr::null_mut(),
            )
            .map_err(|_| UNREACHABLE.to_string())?;
            if status != 200 {
                return Err(format!(
                    "GitHub answered with an error ({status}). Try again later, or look at the releases page."
                ));
            }

            let mut body: Vec<u8> = Vec::new();
            let mut chunk = vec![0u8; 64 * 1024];
            loop {
                let mut read = 0u32;
                WinHttpReadData(request.0, chunk.as_mut_ptr() as *mut c_void, chunk.len() as u32, &mut read)
                    .map_err(|_| "The list of releases did not arrive whole. Try again.".to_string())?;
                if read == 0 {
                    break;
                }
                body.extend_from_slice(&chunk[..read as usize]);
                if body.len() > MOST {
                    return Err("The list of releases was larger than expected, so it was not read.".into());
                }
            }
            String::from_utf8(body).map_err(|_| "The list of releases could not be read.".to_string())
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn versions_sort_with_pre_releases_before_the_final_one() {
        let order = [
            "0.1.0-alpha.1",
            "0.1.0-alpha.2",
            "0.1.0-alpha.10",
            "0.1.0-beta.1",
            "0.1.0-rc.1",
            "0.1.0",
            "0.1.1-alpha.1",
            "0.2.0",
            "1.0.0",
        ];
        for pair in order.windows(2) {
            assert!(version_key(pair[0]).unwrap() < version_key(pair[1]).unwrap(), "{} < {}", pair[0], pair[1]);
        }
        assert_eq!(version_key("v0.1.0-alpha.4"), version_key("0.1.0-alpha.4"));
        for bad in [
            "",
            "0.1",
            "0.1.0.1",
            "0.1.0-gamma.1",
            "0.1.0-alpha",
            "0.1.0-alpha.x",
            "x.1.0",
            "0.1.0-alpha.1.2",
            "0.1.0-alpha.+1",
        ] {
            assert_eq!(version_key(bad), None, "{bad}");
        }
    }

    #[test]
    fn a_version_is_said_in_words() {
        assert_eq!(spoken("0.1.0-alpha.4"), "0.1.0 alpha 4");
        assert_eq!(spoken("v1.2.3"), "1.2.3");
    }

    #[test]
    fn only_this_programs_release_pages_are_offered_or_opened() {
        assert_eq!(
            release_page("v0.1.0-alpha.4"),
            "https://github.com/jasonswrench-beep/openstage-recorder/releases/tag/v0.1.0-alpha.4"
        );
        assert_eq!(release_page("v0.1.0-alpha.4/../../../evil"), RELEASES_PAGE);
        assert_eq!(release_page("https://example.org"), RELEASES_PAGE);
        assert_eq!(release_page("0.1.0"), RELEASES_PAGE, "a tag without its v is not one of ours");
        assert!(is_release_page(RELEASES_PAGE));
        assert!(is_release_page("https://github.com/jasonswrench-beep/openstage-recorder/releases/tag/v0.1.0-alpha.4"));
        for bad in [
            "https://github.com/jasonswrench-beep/openstage-recorder/releases/tag/v0.1.0-alpha.4/../../x",
            "https://github.com/jasonswrench-beep/openstage-recorder/releases/tag/0.1.0",
            "https://github.com/jasonswrench-beep/openstage-recorder/releases/",
            "https://github.com/jasonswrench-beep/openstage-author/releases",
            "https://github.com/jasonswrench-beep/openstage-recorder/releases.example.org",
            "http://github.com/jasonswrench-beep/openstage-recorder/releases",
            "file:///C:/Windows/System32/calc.exe",
            "",
        ] {
            assert!(!is_release_page(bad), "{bad}");
        }
    }

    #[test]
    fn the_answer_says_newer_current_or_unknown_and_never_counts_a_draft() {
        let list = r#"[{"tag_name":"v0.1.0-alpha.5","draft":true},{"tag_name":"v0.1.0-alpha.4","draft":false,"prerelease":true},{"tag_name":"v0.1.0-alpha.3","draft":false},{"tag_name":"nonsense"}]"#;
        let newer = answer("0.1.0-alpha.3", list);
        assert_eq!(newer["state"], "newer");
        assert_eq!(newer["latest"], "0.1.0-alpha.4");
        assert_eq!(newer["url"], "https://github.com/jasonswrench-beep/openstage-recorder/releases/tag/v0.1.0-alpha.4");
        assert!(newer["message"].as_str().unwrap().contains("0.1.0 alpha 4"));
        assert!(newer["message"].as_str().unwrap().contains("keeps your recordings"));
        assert_eq!(answer("0.1.0-alpha.4", list)["state"], "current", "the draft alpha 5 is not offered");
        assert!(answer("0.1.0-alpha.4", list)["message"]
            .as_str()
            .unwrap()
            .contains("0.1.0 alpha 4 is the newest published version"));
        let ahead = answer("0.1.0-alpha.5", list);
        assert_eq!(ahead["state"], "current");
        assert!(
            ahead["message"]
                .as_str()
                .unwrap()
                .contains("It is 0.1.0 alpha 5, and the newest published version is 0.1.0 alpha 4."),
            "a copy newer than any release says so"
        );
        assert_eq!(answer("0.1.0", list)["state"], "current", "a final release is newer than its pre-releases");
        assert_eq!(answer("", list)["state"], "unknown");
        assert_eq!(answer("0.1.0-alpha.3", "not json")["state"], "error");
        assert_eq!(answer("0.1.0-alpha.3", "[]")["state"], "error");
        assert_eq!(answer("0.1.0-alpha.3", r#"{"message":"rate limited"}"#)["state"], "error");
    }

    /// Reaches GitHub, so it is run only by hand: `cargo test -- --ignored`. It sends nothing but the request for the public list.
    #[cfg(windows)]
    #[test]
    #[ignore = "reaches GitHub over the network"]
    fn the_real_list_is_read_and_a_redirect_is_not_followed() {
        let text = fetch_releases().expect("the list of releases");
        assert_eq!(answer("0.1.0-alpha.1", &text)["state"], "newer", "alpha 1 is older than what is published");
        // This address answers with a redirect to the newest release's page: it must come back as an error, not be followed.
        let said = winhttp::get("github.com", "/jasonswrench-beep/openstage-recorder/releases/latest").unwrap_err();
        assert!(said.contains("(302)"), "{said}");
    }

    #[test]
    fn it_can_be_turned_off_with_a_file_beside_the_program() {
        let dir = std::env::temp_dir().join(format!("openstage-recorder-test-updates-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert!(!turned_off(Some(&dir)));
        std::fs::write(dir.join("update-check.txt"), " OFF \r\n").unwrap();
        assert!(turned_off(Some(&dir)));
        assert_eq!(check(Some(&dir))["state"], "off", "turned off: nothing is asked of the network");
        std::fs::write(dir.join("update-check.txt"), "manual").unwrap();
        assert!(!turned_off(Some(&dir)));
        let _ = std::fs::remove_dir_all(&dir);
    }
}
