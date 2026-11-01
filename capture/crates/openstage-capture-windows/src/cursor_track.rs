// SPDX-License-Identifier: Apache-2.0
//! Where the pointer was at a moment of a recording, from the mouse positions the take noted (story A6; the author turns that on before recording).
//!
//! The log (`events.jsonl`) holds the pointer's place in pixels of a display, and a line for each button press. The video of the screen may show only a
//! part of that display (its `region`) and may be a different size than that part, so a place is moved to the video's own pixels by taking away where
//! the region starts and scaling by how much larger or smaller the video is. A place outside the video, or measured on another display than the one
//! the video shows, is not shown. Nothing here needs Windows, so it is tested everywhere.

use openstage_capture_project::{read_log, read_take, take_dir, LogEvent, LogLine, RegionInfo};
use openstage_capture_render::{CursorMark, CLICK_SHOWN_MS};
use std::path::Path;

/// The places the pointer was, and when a button was pressed, for one take.
pub struct CursorTrack {
    /// When (milliseconds of recording time), and where, oldest first. A press is also a place.
    places: Vec<(u64, i32, i32)>,
    presses: Vec<u64>,
    region: Option<RegionInfo>,
    display: u32,
}

impl CursorTrack {
    /// `None` when the log has no place at all.
    pub fn new(lines: &[LogLine], region: Option<RegionInfo>, display: u32) -> Option<Self> {
        let mut places = Vec::new();
        let mut presses = Vec::new();
        for line in lines {
            match &line.event {
                LogEvent::CursorMove { x, y } => places.push((line.t, *x, *y)),
                LogEvent::Click { x, y, .. } => {
                    places.push((line.t, *x, *y));
                    presses.push(line.t);
                }
                _ => {}
            }
        }
        if places.is_empty() {
            return None;
        }
        places.sort_by_key(|p| p.0);
        presses.sort_unstable();
        Some(Self { places, presses, region, display })
    }

    /// Where the pointer was at `t_ms`, in pixels of a picture of `width` by `height`, and how long ago a button was pressed if that was in the
    /// last moment. The last place it reached is where it still is: the recorder writes a place only when the pointer moves.
    pub fn mark_at(&self, t_ms: u64, width: u32, height: u32) -> Option<CursorMark> {
        let count = self.places.partition_point(|p| p.0 <= t_ms);
        let &(_, x, y) = self.places.get(count.checked_sub(1)?)?;
        let (px, py) = match self.region {
            Some(r) => {
                if r.display != self.display || r.width == 0 || r.height == 0 {
                    return None;
                }
                (
                    (x as f64 - r.x as f64) * width as f64 / r.width as f64,
                    (y as f64 - r.y as f64) * height as f64 / r.height as f64,
                )
            }
            None => (x as f64, y as f64),
        };
        if px < 0.0 || py < 0.0 || px >= width as f64 || py >= height as f64 {
            return None;
        }
        let last = self.presses.partition_point(|&p| p <= t_ms).checked_sub(1).map(|i| self.presses[i]);
        let click_age_ms = last.map(|p| t_ms - p).filter(|age| *age < CLICK_SHOWN_MS);
        Some(CursorMark { x: px, y: py, click_age_ms })
    }
}

/// The track for the screen video `media` of a take, if the author had the mouse noted. `None` when there is none: no log, no places in it, no
/// note in the take of which display they were measured on, or no such video in the take.
pub fn load_cursor_track(project: &Path, take: u32, media: &str) -> Option<CursorTrack> {
    let manifest = read_take(project, take).ok()?;
    let video = manifest.media.iter().find(|m| m.file == media)?;
    let display = manifest.media.iter().find_map(|m| m.interactions.map(|i| i.display))?;
    let lines = read_log(&take_dir(project, take).join("events.jsonl")).ok()?;
    CursorTrack::new(&lines, video.region, display)
}

#[cfg(test)]
mod tests {
    use super::*;
    use openstage_capture_project::{create_project, create_take_with, finish_take, InteractionInfo, MediaFile};
    use std::fs;

    fn at(t: u64, x: i32, y: i32) -> LogLine {
        LogLine { t, event: LogEvent::CursorMove { x, y } }
    }
    fn press(t: u64, x: i32, y: i32) -> LogLine {
        LogLine { t, event: LogEvent::Click { x, y, button: "left".into() } }
    }
    fn region(x: u32, y: u32, width: u32, height: u32) -> Option<RegionInfo> {
        Some(RegionInfo { display: 1, x, y, width, height })
    }

    #[test]
    fn a_place_is_moved_into_the_video_by_taking_away_where_the_region_starts_and_scaling() {
        let track = CursorTrack::new(&[at(0, 500, 350)], region(100, 50, 800, 600), 1).unwrap();
        let mark = track.mark_at(10, 400, 300).unwrap();
        assert_eq!((mark.x, mark.y), (200.0, 150.0), "(500 - 100) / 2 and (350 - 50) / 2");
        let whole = CursorTrack::new(&[at(0, 500, 350)], None, 1).unwrap();
        let mark = whole.mark_at(10, 1920, 1080).unwrap();
        assert_eq!((mark.x, mark.y), (500.0, 350.0), "a whole display is the video's own pixels");
    }

    #[test]
    fn the_pointer_stays_where_it_last_was_until_it_moves_and_is_unknown_before_the_first_place() {
        let track = CursorTrack::new(&[at(100, 10, 10), at(500, 60, 70)], None, 1).unwrap();
        assert_eq!(track.mark_at(99, 800, 600), None, "before the first place nothing is known");
        assert_eq!(track.mark_at(100, 800, 600).map(|m| (m.x, m.y)), Some((10.0, 10.0)));
        assert_eq!(track.mark_at(499, 800, 600).map(|m| (m.x, m.y)), Some((10.0, 10.0)));
        assert_eq!(track.mark_at(500, 800, 600).map(|m| (m.x, m.y)), Some((60.0, 70.0)));
        assert_eq!(
            track.mark_at(60_000, 800, 600).map(|m| (m.x, m.y)),
            Some((60.0, 70.0)),
            "an hour later it is still there"
        );
    }

    #[test]
    fn a_press_shows_for_a_moment_and_the_pointer_is_where_the_press_was() {
        let track = CursorTrack::new(&[at(0, 5, 5), press(1000, 300, 200), at(1200, 310, 210)], None, 1).unwrap();
        assert_eq!(track.mark_at(999, 800, 600).unwrap().click_age_ms, None);
        let at_press = track.mark_at(1000, 800, 600).unwrap();
        assert_eq!((at_press.x, at_press.y, at_press.click_age_ms), (300.0, 200.0, Some(0)));
        assert_eq!(track.mark_at(1100, 800, 600).unwrap().click_age_ms, Some(100));
        let later = track.mark_at(1200, 800, 600).unwrap();
        assert_eq!(
            (later.x, later.y, later.click_age_ms),
            (310.0, 210.0, Some(200)),
            "the pointer moves on while the ring opens"
        );
        assert_eq!(
            track.mark_at(1000 + CLICK_SHOWN_MS, 800, 600).unwrap().click_age_ms,
            None,
            "and the ring is gone after its moment"
        );
    }

    #[test]
    fn a_place_outside_the_video_or_on_another_display_is_not_shown() {
        let track = CursorTrack::new(
            &[at(0, 50, 60), at(100, 950, 400), at(200, 500, 700), at(300, -20, 100)],
            region(100, 50, 800, 600),
            1,
        )
        .unwrap();
        assert_eq!(track.mark_at(0, 800, 600), None, "left of the region");
        assert_eq!(track.mark_at(100, 800, 600), None, "right of the region");
        assert_eq!(track.mark_at(200, 800, 600), None, "below the region");
        assert_eq!(track.mark_at(300, 800, 600), None, "on a display to the left");
        let other = CursorTrack::new(&[at(0, 500, 350)], region(100, 50, 800, 600), 2).unwrap();
        assert_eq!(
            other.mark_at(0, 800, 600),
            None,
            "positions measured on display 2 say nothing about a video of display 1"
        );
    }

    #[test]
    fn a_log_with_no_place_has_no_track() {
        assert!(CursorTrack::new(&[], None, 1).is_none());
        let only_a_marker = LogLine { t: 5, event: LogEvent::Marker { label: "Start".into() } };
        assert!(CursorTrack::new(&[only_a_marker], None, 1).is_none());
    }

    fn media(file: &str, kind: &str, container: &str) -> MediaFile {
        MediaFile {
            file: file.into(),
            kind: kind.into(),
            container: container.into(),
            mix: None,
            region: None,
            camera: None,
            interactions: None,
        }
    }

    /// A project with take 1: a screen video of a 800 by 600 part of display 1, and (if asked) a log of the mouse.
    fn project_with_log(log: Option<&str>, noted: bool) -> (tempfile::TempDir, std::path::PathBuf) {
        let dir = tempfile::tempdir().unwrap();
        let project = dir.path().join("p.capture");
        create_project(&project, "t", "en-US").unwrap();
        let mut screen = media("screen.mp4", "screen", "fragmented-mp4");
        screen.region = region(100, 50, 800, 600);
        let mut files = vec![screen];
        if noted {
            let mut log_entry = media("events.jsonl", "interactions", "jsonl");
            log_entry.interactions = Some(InteractionInfo { display: 1, keys: false });
            files.push(log_entry);
        }
        create_take_with(&project, 1, vec!["screen:1".into()], None, 2000, files).unwrap();
        finish_take(&project, 1, 5000, 3).unwrap();
        if let Some(text) = log {
            fs::write(take_dir(&project, 1).join("events.jsonl"), text).unwrap();
        }
        (dir, project)
    }

    const LOG: &str = "{\"t\":40,\"type\":\"cursorMove\",\"x\":500,\"y\":350}\n{\"t\":1200,\"type\":\"click\",\"x\":500,\"y\":350,\"button\":\"left\"}\n";

    #[test]
    fn the_track_of_a_take_is_read_from_its_log_with_the_region_and_display_the_take_says() {
        let (_dir, project) = project_with_log(Some(LOG), true);
        let track = load_cursor_track(&project, 1, "screen.mp4").expect("the take noted the mouse");
        let mark = track.mark_at(1250, 800, 600).unwrap();
        assert_eq!((mark.x, mark.y, mark.click_age_ms), (400.0, 300.0, Some(50)));
    }

    #[test]
    fn a_take_without_a_noted_mouse_has_no_track_and_no_trouble() {
        let (_dir, project) = project_with_log(None, false);
        assert!(load_cursor_track(&project, 1, "screen.mp4").is_none(), "nothing was noted");
        let (_dir, project) = project_with_log(Some(LOG), false);
        assert!(
            load_cursor_track(&project, 1, "screen.mp4").is_none(),
            "a log the take does not say it has is not trusted"
        );
        let (_dir, project) = project_with_log(None, true);
        assert!(
            load_cursor_track(&project, 1, "screen.mp4").is_none(),
            "the take says it noted the mouse but the file is not there"
        );
        let (_dir, project) = project_with_log(Some(LOG), true);
        assert!(load_cursor_track(&project, 1, "webcam.mp4").is_none(), "no such video in the take");
        assert!(load_cursor_track(&project, 7, "screen.mp4").is_none(), "no such take");
    }
}
