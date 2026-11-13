// SPDX-License-Identifier: Apache-2.0
//! What the window may start the recording program with.
//!
//! The page builds the recorder's options (app/src: capturesession.ts, captureexport.ts, capturecheck.ts, recorderview.ts). Before the shell
//! starts the recorder, every option is checked here against the few commands the window uses, so a page that went wrong cannot start the
//! recorder with anything else. In particular it cannot choose where files are written: a recording is a folder whose name ends in
//! `.capture` (the same rule as files.rs), and an exported file goes only in that recording's `exports` folder, as a video, a sound file
//! or a picture.

use std::path::{Component, Path};

use crate::files::recording_name_ok;

/// What one option takes.
#[derive(Clone, Copy, PartialEq, Debug)]
enum Takes {
    /// Nothing: the option is a switch.
    Nothing,
    /// A whole number, which may be negative (a sound's level in decibels).
    Number,
    /// Words (a title, a window's title, a device's number or name, a word to hide windows by).
    Words,
    /// One of these words.
    OneOf(&'static [&'static str]),
    /// A region: four whole numbers, separated by commas.
    Region,
    /// A recording's folder: a full path whose last part is a recording's name (`Week 3.capture`).
    Recording,
    /// A file to make, inside the recording's `exports` folder.
    ExportFile,
    /// A folder (the recordings folder, for the check of this computer).
    Folder,
}

/// One option of a command: its name, what it takes, and whether it may be given more than once.
type Opt = (&'static str, Takes, bool);

const RECORD: &[Opt] = &[
    ("--project", Takes::Recording, false),
    ("--title", Takes::Words, false),
    ("--countdown-ms", Takes::Number, false),
    ("--cues", Takes::OneOf(&["on", "off"]), false),
    ("--source", Takes::OneOf(&["screen", "synthetic"]), false),
    ("--display", Takes::Number, false),
    ("--window", Takes::Words, false),
    ("--region", Takes::Region, false),
    ("--microphone", Takes::Words, false),
    ("--output", Takes::Words, false),
    ("--camera", Takes::Words, false),
    ("--interactions", Takes::Words, false),
    ("--hide", Takes::Words, true),
    ("--mic-gain-db", Takes::Number, false),
    ("--system-gain-db", Takes::Number, false),
];

const RENDER: &[Opt] = &[
    ("--project", Takes::Recording, false),
    ("--out", Takes::ExportFile, false),
    ("--audio-only", Takes::Nothing, false),
    ("--frame", Takes::Number, false),
    ("--reduce-motion", Takes::Nothing, false),
    ("--highlight-cursor", Takes::Nothing, false),
];

/// The commands the window uses, and the options of each.
const COMMANDS: &[(&str, &[Opt])] = &[
    ("record", RECORD),
    ("render", RENDER),
    ("recover", &[("--project", Takes::Recording, false)]),
    ("probe", &[]),
    ("windows", &[]),
    ("pick-window", &[("--timeout-ms", Takes::Number, false)]),
    ("setup-check", &[("--dir", Takes::Folder, false)]),
];

/// The extensions of the files an export makes: a video, a sound file, a picture.
const EXPORT_EXTENSIONS: &[&str] = &["mp4", "wav", "png"];

/// Whether a path is a full one with no `..` in it.
fn full_and_plain(path: &Path) -> bool {
    path.is_absolute() && !path.components().any(|c| matches!(c, Component::ParentDir | Component::CurDir))
}

fn value_ok(takes: Takes, value: &str) -> bool {
    match takes {
        Takes::Nothing => true,
        Takes::Number => {
            let digits = value.strip_prefix('-').unwrap_or(value);
            !digits.is_empty() && digits.len() <= 12 && digits.bytes().all(|b| b.is_ascii_digit())
        }
        Takes::Words => value.chars().count() <= 200 && !value.chars().any(char::is_control),
        Takes::OneOf(words) => words.contains(&value),
        Takes::Region => {
            let parts: Vec<&str> = value.split(',').collect();
            parts.len() == 4 && parts.iter().all(|p| value_ok(Takes::Number, p))
        }
        Takes::Recording => {
            let path = Path::new(value);
            full_and_plain(path) && path.file_name().and_then(|n| n.to_str()).is_some_and(recording_name_ok)
        }
        // Checked against the recording below, once all the options are known.
        Takes::ExportFile => full_and_plain(Path::new(value)),
        Takes::Folder => full_and_plain(Path::new(value)),
    }
}

/// Whether an export goes where exports go: `<recording>/exports/<name>.mp4`, `.wav` or `.png`.
fn export_in(recording: &Path, out: &Path) -> bool {
    let named = out.file_name().and_then(|n| n.to_str()).is_some_and(|name| {
        let stem_and_kind = name.rsplit_once('.');
        stem_and_kind.is_some_and(|(stem, kind)| {
            !stem.trim().is_empty()
                && EXPORT_EXTENSIONS.iter().any(|e| kind.eq_ignore_ascii_case(e))
                && name.chars().count() <= 150
                && name
                    .chars()
                    .all(|c| !c.is_control() && !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|'))
        })
    });
    named && out.parent() == Some(recording.join("exports").as_path())
}

/// Check what the window asks the recorder to be started with. The Err says, for the author, that it was refused, and why.
pub fn check(args: &[String]) -> Result<(), String> {
    let refuse = |why: &str| Err(format!("The recorder was not started: {why}"));
    let Some((command, rest)) = args.split_first() else { return refuse("no command was given.") };
    let Some((_, options)) = COMMANDS.iter().find(|(name, _)| name == command) else {
        return refuse("that is not something this window asks the recorder to do.");
    };
    let mut seen: Vec<&str> = Vec::new();
    let mut recording: Option<&str> = None;
    let mut out: Option<&str> = None;
    let mut i = 0;
    while i < rest.len() {
        let name = rest[i].as_str();
        let Some(&(_, takes, repeats)) = options.iter().find(|(n, _, _)| *n == name) else {
            return refuse(&format!("{name} is not one of its options here."));
        };
        if !repeats && seen.contains(&name) {
            return refuse(&format!("{name} was given twice."));
        }
        seen.push(name);
        if takes == Takes::Nothing {
            i += 1;
            continue;
        }
        let Some(value) = rest.get(i + 1) else { return refuse(&format!("{name} has nothing after it.")) };
        if !value_ok(takes, value) {
            return refuse(&format!("{name} cannot be {value:?}."));
        }
        match takes {
            Takes::Recording => recording = Some(value),
            Takes::ExportFile => out = Some(value),
            _ => {}
        }
        i += 2;
    }
    if let Some(out) = out {
        let Some(recording) = recording else { return refuse("a file to make needs the recording it is made from.") };
        if !export_in(Path::new(recording), Path::new(out)) {
            return refuse(
                "a file is made only in the recording's exports folder, as a video, a sound file or a picture.",
            );
        }
    }
    if *command == "render" && (recording.is_none() || out.is_none()) {
        return refuse("making a file needs the recording and the file.");
    }
    if (*command == "record" || *command == "recover") && recording.is_none() {
        return refuse("it needs the recording's folder.");
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(args: &[&str]) -> Vec<String> {
        args.iter().map(|s| s.to_string()).collect()
    }

    const LIB: &str = r"C:\Videos\OpenStage Recorder";

    #[test]
    fn what_the_window_asks_for_is_allowed() {
        let rec = format!(r"{LIB}\Week 3.capture");
        let video = format!(r"{rec}\exports\Week 3.mp4");
        let sound = format!(r"{rec}\exports\Week 3.wav");
        let picture = format!(r"{rec}\exports\Week 3 at 12.5 seconds.png");
        let slashes = "C:/Videos/OpenStage Recorder/Week 3.capture";
        for good in [
            v(&[
                "record",
                "--project",
                &rec,
                "--title",
                "Week 3",
                "--countdown-ms",
                "3000",
                "--cues",
                "on",
                "--source",
                "synthetic",
            ]),
            v(&[
                "record",
                "--project",
                &rec,
                "--title",
                "Week 3",
                "--countdown-ms",
                "0",
                "--cues",
                "off",
                "--source",
                "screen",
                "--display",
                "1",
                "--region",
                "10,20,640,480",
                "--microphone",
                "default",
                "--output",
                "none",
                "--camera",
                "2",
                "--interactions",
                "clicks",
                "--hide",
                "Passwords",
                "--hide",
                "Inbox - Mail",
                "--mic-gain-db",
                "-6",
                "--system-gain-db",
                "4",
            ]),
            v(&[
                "record",
                "--project",
                &rec,
                "--title",
                "",
                "--countdown-ms",
                "0",
                "--cues",
                "on",
                "--source",
                "screen",
                "--display",
                "2",
                "--window",
                "Lesson plan - Browser",
            ]),
            v(&["render", "--project", &rec, "--out", &video]),
            v(&["render", "--project", &rec, "--out", &video, "--reduce-motion", "--highlight-cursor"]),
            v(&["render", "--project", &rec, "--out", &sound, "--audio-only"]),
            v(&["render", "--project", &rec, "--out", &picture, "--frame", "12500", "--highlight-cursor"]),
            v(&["render", "--project", slashes, "--out", &format!("{slashes}/exports/Week 3.mp4")]),
            v(&["recover", "--project", &rec]),
            v(&["probe"]),
            v(&["windows"]),
            v(&["pick-window", "--timeout-ms", "30000"]),
            v(&["setup-check"]),
            v(&["setup-check", "--dir", LIB]),
        ] {
            assert_eq!(check(&good), Ok(()), "{good:?}");
        }
    }

    #[test]
    fn anything_else_is_refused_before_the_recorder_starts() {
        let rec = format!(r"{LIB}\Week 3.capture");
        let out = format!(r"{rec}\exports\Week 3.mp4");
        for bad in [
            v(&[]),
            v(&["video-test", "--out", r"C:\x.mp4"]),
            v(&["render", "--project", &rec]),
            v(&["render", "--out", &out]),
            v(&[
                "render",
                "--project",
                &rec,
                "--out",
                r"C:\Users\Someone\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup\x.mp4",
            ]),
            v(&["render", "--project", &rec, "--out", &format!(r"{rec}\exports\..\..\x.mp4")]),
            v(&["render", "--project", &rec, "--out", &format!(r"{rec}\exports\x.exe")]),
            v(&["render", "--project", &rec, "--out", &format!(r"{rec}\x.mp4")]),
            v(&["render", "--project", &rec, "--out", &format!(r"{rec}\exports\.mp4")]),
            v(&["render", "--project", &rec, "--out", &format!(r"{LIB}\Other.capture\exports\x.mp4")]),
            v(&["render", "--project", r"C:\Windows", "--out", r"C:\Windows\exports\x.mp4"]),
            v(&["render", "--project", r"Week 3.capture", "--out", r"Week 3.capture\exports\x.mp4"]),
            v(&["record", "--project", &format!(r"{LIB}\..\Week 3.capture"), "--source", "synthetic"]),
            v(&["record", "--project", r"C:\Users\Someone\Desktop", "--source", "synthetic"]),
            v(&["record", "--source", "synthetic"]),
            v(&["record", "--project", &rec, "--source", "file"]),
            v(&["record", "--project", &rec, "--display", "one"]),
            v(&["record", "--project", &rec, "--region", "1,2,3"]),
            v(&["record", "--project", &rec, "--title", "a", "--title", "b"]),
            v(&["record", "--project", &rec, "--title", "line\nbreak"]),
            v(&["record", "--project", &rec, "--title"]),
            v(&["record", "--project", &rec, "--out", &out]),
            v(&["record", "--project", &rec, "stray"]),
            v(&["recover", "--project", &rec, "--audio-only"]),
            v(&["probe", "--plain"]),
            v(&["setup-check", "--dir", "relative"]),
            v(&["pick-window", "--timeout-ms", "soon"]),
        ] {
            let said = check(&bad).expect_err(&format!("{bad:?} should be refused"));
            assert!(said.starts_with("The recorder was not started: "), "{said}");
        }
    }
}
