// SPDX-License-Identifier: Apache-2.0
//! The plan for a finished video: what is shown at every frame, and what is heard.
//!
//! [`plan`] checks that an edit can be rendered and turns it into lists of spans. [`RenderPlan::frame`]
//! then says, for any frame number, which pictures are layered (the first track at the bottom, the
//! last on top), which overlays are showing, and what part of the picture the zoom has reached. Frame
//! times are exact: frame `n` is at `n / fps` seconds, worked out in whole microseconds so there is
//! never a rounding surprise.

use crate::audio::AudioSpan;
use crate::zoom::{zoom_view, ZoomSpan, ZoomView};
use openstage_capture_project::{
    validate_edit, Edit, EditItem, EditRect, EditSeverity, EditSourceKind, EditSourceRef, EditTrackKind,
    EditTransitionKind,
};

/// How the video is to be made.
#[derive(Debug, Clone, PartialEq)]
pub struct RenderSettings {
    pub fps: u32,
    pub width: u32,
    pub height: u32,
    /// Samples a second of the sound that is mixed (the recorder's files are 48,000).
    pub sample_rate: u32,
    /// Use cuts instead of animated zooms, for viewers who cannot turn motion off (story C5).
    pub reduce_motion: bool,
    /// Refuse an edit that is sound but still lacks something OpenStage requires (alt text, a
    /// description). On by default: export does not finish until it is given.
    pub require_complete: bool,
}

impl Default for RenderSettings {
    fn default() -> Self {
        Self { fps: 30, width: 1920, height: 1080, sample_rate: 48_000, reduce_motion: false, require_complete: true }
    }
}

/// How far back from the end of the clip before, in milliseconds, the picture held under an arriving one is taken from.
const HELD_BACK_MS: u64 = 40;

/// A transition at the start or end of a picture, as the plan keeps it (new in edit format 0.4).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct SpanTransition {
    pub kind: EditTransitionKind,
    pub duration_ms: u64,
}

/// Where a layer is in a transition.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TransitionPhase {
    /// The picture is arriving: it shows by `progress`.
    In,
    /// The picture is leaving (a fade): it shows by `1 - progress`.
    Out,
    /// The last picture of the clip before, held still while the next one arrives (a slide pushes it away).
    Under,
}

/// A transition in progress on a layer. `progress` goes from 0 to 1 over its length, eased.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct LayerTransition {
    pub kind: EditTransitionKind,
    pub phase: TransitionPhase,
    pub progress: f64,
}

fn smoothstep(t: f64) -> f64 {
    let t = t.clamp(0.0, 1.0);
    t * t * (3.0 - 2.0 * t)
}

/// A picture (a recording of the screen or webcam, an imported video or an image) placed in the video.
#[derive(Debug, Clone, PartialEq)]
pub struct VideoSpan {
    pub clip_id: String,
    pub track_id: String,
    pub track_kind: EditTrackKind,
    pub source: EditSourceRef,
    pub kind: EditSourceKind,
    /// Where on the frame it sits, if the author said (new in edit format 0.3).
    pub placement: Option<EditRect>,
    pub out_start_ms: u64,
    pub out_end_ms: u64,
    /// Where in the source it starts. Zero for an image.
    pub source_start_ms: u64,
    /// Where in the source it ends (the last moment a held picture is taken from).
    pub source_end_ms: u64,
    /// How it arrives and leaves (new in edit format 0.4).
    pub transition_in: Option<SpanTransition>,
    pub transition_out: Option<SpanTransition>,
}

/// One picture to draw in a frame.
#[derive(Debug, Clone, PartialEq)]
pub struct Layer {
    pub clip_id: String,
    /// The kind of track it is on: a webcam is drawn as a small picture on top, anything else as the main picture.
    pub track_kind: EditTrackKind,
    pub source: EditSourceRef,
    pub kind: EditSourceKind,
    /// Where on the frame it sits, if the author said.
    pub placement: Option<EditRect>,
    /// Which moment of the source to show.
    pub source_time_ms: u64,
    /// True for the last picture of the clip before, held still under an arriving one.
    pub held: bool,
    /// A transition showing on this layer now, if any.
    pub transition: Option<LayerTransition>,
}

/// Everything needed to draw one frame.
#[derive(Debug, Clone, PartialEq)]
pub struct FrameRecipe {
    pub index: u64,
    pub time_us: u64,
    /// Bottom first.
    pub layers: Vec<Layer>,
    /// The overlays showing, in the order they are drawn (later ones on top). Zooms are not here.
    pub overlays: Vec<EditItem>,
    pub zoom: ZoomView,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RenderPlan {
    pub settings: RenderSettings,
    pub length_ms: u64,
    pub frame_count: u64,
    pub video: Vec<VideoSpan>,
    pub overlays: Vec<EditItem>,
    pub zooms: Vec<ZoomSpan>,
    pub audio: Vec<AudioSpan>,
}

fn whole(ms: f64) -> u64 {
    ms.max(0.0).round() as u64
}

fn span_transition(t: Option<&openstage_capture_project::EditTransition>) -> Option<SpanTransition> {
    let t = t?;
    Some(SpanTransition { kind: t.known_kind()?, duration_ms: whole(t.duration_ms) })
}

/// Check an edit and the settings, and make the plan. `Err` says in words why it cannot be rendered.
pub fn plan(edit: &Edit, settings: &RenderSettings) -> Result<RenderPlan, String> {
    if settings.fps == 0 {
        return Err("The video needs at least 1 picture a second.".into());
    }
    if settings.width == 0 || settings.height == 0 || settings.width & 1 == 1 || settings.height & 1 == 1 {
        return Err(format!(
            "The video size {} by {} cannot be used: H.264 video needs an even width and height.",
            settings.width, settings.height
        ));
    }
    let problems = validate_edit(edit);
    let errors: Vec<&str> =
        problems.iter().filter(|p| p.severity == EditSeverity::Error).map(|p| p.message.as_str()).collect();
    if let Some(first) = errors.first() {
        return Err(format!(
            "The edit cannot be rendered: {first}{}",
            if errors.len() > 1 { format!(" ({} more problems)", errors.len() - 1) } else { String::new() }
        ));
    }
    if settings.require_complete {
        let missing: Vec<&str> = problems
            .iter()
            .filter(|p| p.severity == EditSeverity::NeedsAttention)
            .map(|p| p.message.as_str())
            .collect();
        if !missing.is_empty() {
            return Err(format!(
                "The edit is not finished: {}{}",
                missing.iter().take(3).copied().collect::<Vec<_>>().join(" "),
                if missing.len() > 3 {
                    format!(" ({} more things are needed)", missing.len() - 3)
                } else {
                    String::new()
                }
            ));
        }
    }

    let mut video = Vec::new();
    let mut audio = Vec::new();
    let mut overlays = Vec::new();
    let mut zooms = Vec::new();
    for track in &edit.tracks {
        for clip in &track.clips {
            let Some(source) = edit.sources.iter().find(|s| s.source == clip.source) else { continue };
            let (out_start, out_end) = (whole(clip.start_ms), whole(clip.end_ms()));
            let shows = matches!(track.kind, EditTrackKind::Screen | EditTrackKind::Webcam | EditTrackKind::Media)
                && matches!(
                    source.kind,
                    EditSourceKind::Screen | EditSourceKind::Webcam | EditSourceKind::Video | EditSourceKind::Image
                );
            if shows {
                video.push(VideoSpan {
                    clip_id: clip.id.clone(),
                    track_id: track.id.clone(),
                    track_kind: track.kind,
                    source: clip.source.clone(),
                    kind: source.kind,
                    placement: clip.placement,
                    out_start_ms: out_start,
                    out_end_ms: out_end,
                    source_start_ms: whole(clip.source_start_ms),
                    source_end_ms: whole(clip.source_end_ms),
                    transition_in: span_transition(clip.transition_in.as_ref()),
                    transition_out: span_transition(clip.transition_out.as_ref()),
                });
            }
            if matches!(source.kind, EditSourceKind::Microphone | EditSourceKind::SystemAudio | EditSourceKind::Audio) {
                audio.push(AudioSpan {
                    clip_id: clip.id.clone(),
                    source: clip.source.clone(),
                    out_start_ms: out_start,
                    out_end_ms: out_end,
                    source_start_ms: whole(clip.source_start_ms),
                    volume_db: clip.volume_db as i32,
                    muted: clip.muted,
                    fade_in_ms: whole(clip.fade_in_ms),
                    fade_out_ms: whole(clip.fade_out_ms),
                });
            }
        }
        for item in &track.items {
            match item {
                EditItem::Zoom { id, start_ms, duration_ms, rect, transition_ms, .. } => zooms.push(ZoomSpan {
                    id: id.clone(),
                    start_ms: whole(*start_ms),
                    end_ms: whole(*start_ms + *duration_ms),
                    rect: *rect,
                    transition_ms: whole(*transition_ms),
                }),
                other => overlays.push(other.clone()),
            }
        }
    }
    zooms.sort_by_key(|z| z.start_ms);
    let length_ms = whole(edit.length_ms());
    Ok(RenderPlan {
        settings: settings.clone(),
        length_ms,
        frame_count: (length_ms * settings.fps as u64).div_ceil(1000),
        video,
        overlays,
        zooms,
        audio,
    })
}

/// The transition a picture is showing at a moment (in microseconds), if any.
fn transition_at(span: &VideoSpan, time_us: u64) -> Option<LayerTransition> {
    if let Some(t) = span.transition_in {
        let length_us = t.duration_ms * 1000;
        let into = time_us.saturating_sub(span.out_start_ms * 1000);
        if length_us > 0 && into < length_us {
            return Some(LayerTransition {
                kind: t.kind,
                phase: TransitionPhase::In,
                progress: smoothstep(into as f64 / length_us as f64),
            });
        }
    }
    if let Some(t) = span.transition_out {
        let length_us = t.duration_ms * 1000;
        let starts_us = (span.out_end_ms * 1000).saturating_sub(length_us);
        if length_us > 0 && time_us >= starts_us {
            return Some(LayerTransition {
                kind: t.kind,
                phase: TransitionPhase::Out,
                progress: smoothstep((time_us - starts_us) as f64 / length_us as f64),
            });
        }
    }
    None
}

impl RenderPlan {
    /// When frame `index` is shown, in microseconds.
    pub fn frame_time_us(&self, index: u64) -> u64 {
        index * 1_000_000 / self.settings.fps as u64
    }

    /// The picture of a span at the moment it begins (used to find out how big the recorded pictures are).
    pub fn layer_for(&self, span: &VideoSpan) -> Layer {
        Layer {
            clip_id: span.clip_id.clone(),
            track_kind: span.track_kind,
            source: span.source.clone(),
            kind: span.kind,
            placement: span.placement,
            source_time_ms: span.source_start_ms,
            held: false,
            transition: None,
        }
    }

    /// Everything needed to draw frame `index`.
    pub fn frame(&self, index: u64) -> FrameRecipe {
        let time_us = self.frame_time_us(index);
        let mut layers = Vec::new();
        for s in self.video.iter().filter(|s| s.out_start_ms * 1000 <= time_us && time_us < s.out_end_ms * 1000) {
            let transition = if self.settings.reduce_motion { None } else { transition_at(s, time_us) };
            // A cross-fade, wipe or slide needs the clip before under it, held at its last picture.
            if let Some(t) = transition.filter(|t| t.phase == TransitionPhase::In && t.kind != EditTransitionKind::Fade)
            {
                let before = self.video.iter().find(|p| p.track_id == s.track_id && p.out_end_ms == s.out_start_ms);
                if let Some(p) = before {
                    let time = if p.kind == EditSourceKind::Image {
                        p.source_start_ms
                    } else {
                        p.source_end_ms.saturating_sub(HELD_BACK_MS).max(p.source_start_ms)
                    };
                    layers.push(Layer {
                        clip_id: p.clip_id.clone(),
                        track_kind: p.track_kind,
                        source: p.source.clone(),
                        kind: p.kind,
                        placement: p.placement,
                        source_time_ms: time,
                        held: true,
                        transition: Some(LayerTransition {
                            kind: t.kind,
                            phase: TransitionPhase::Under,
                            progress: t.progress,
                        }),
                    });
                }
            }
            layers.push(Layer {
                clip_id: s.clip_id.clone(),
                track_kind: s.track_kind,
                source: s.source.clone(),
                kind: s.kind,
                placement: s.placement,
                source_time_ms: s.source_start_ms + (time_us - s.out_start_ms * 1000) / 1000,
                held: false,
                transition,
            });
        }
        let overlays = self
            .overlays
            .iter()
            .filter(|o| o.start_ms() * 1000.0 <= time_us as f64 && (time_us as f64) < o.end_ms() * 1000.0)
            .cloned()
            .collect();
        FrameRecipe {
            index,
            time_us,
            layers,
            overlays,
            zoom: zoom_view(&self.zooms, time_us, self.settings.reduce_motion),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use openstage_capture_project::{parse_edit, EDIT_FULL};
    use std::fs;
    use std::path::PathBuf;

    fn fixture(name: &str) -> Edit {
        let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../capture-edit/fixtures").join(name);
        parse_edit(&fs::read_to_string(path).unwrap()).unwrap().edit
    }

    fn settings() -> RenderSettings {
        RenderSettings::default()
    }

    #[test]
    fn a_plain_recording_is_a_screen_layer_and_two_sounds_for_its_whole_length() {
        let p = plan(&fixture("valid-basic.json"), &settings()).unwrap();
        assert_eq!((p.length_ms, p.frame_count), (60_000, 1800));
        assert_eq!(p.video.len(), 2, "the screen track was split once");
        assert_eq!(p.audio.len(), 4, "voice and computer sound were each split once");
        assert!(p.overlays.is_empty() && p.zooms.is_empty());
    }

    #[test]
    fn frames_are_at_exact_times() {
        let p = plan(&fixture("valid-basic.json"), &settings()).unwrap();
        assert_eq!(p.frame_time_us(0), 0);
        assert_eq!(p.frame_time_us(1), 33_333);
        assert_eq!(p.frame_time_us(30), 1_000_000);
        assert_eq!(p.frame_time_us(1799), 59_966_666);
        let ntsc = RenderSettings { fps: 24, ..settings() };
        let q = plan(&fixture("valid-basic.json"), &ntsc).unwrap();
        assert_eq!(q.frame_time_us(24), 1_000_000);
        assert_eq!(q.frame_count, 1440);
    }

    #[test]
    fn each_frame_shows_the_clip_that_is_playing_and_the_moment_of_the_recording_to_draw() {
        let p = plan(&fixture("valid-basic.json"), &settings()).unwrap();
        let before = p.frame(599); // 19.966 s: the first piece
        assert_eq!(before.layers.len(), 1);
        assert_eq!(before.layers[0].source_time_ms, 19_966);
        let after = p.frame(600); // exactly 20 s: the second piece, which continues the recording
        assert_eq!(after.layers.len(), 1);
        assert_ne!(after.layers[0].clip_id, before.layers[0].clip_id);
        assert_eq!(after.layers[0].source_time_ms, 20_000, "no moment is skipped or repeated across the cut");
        // The last frame still has a picture; one past the end has none.
        assert_eq!(p.frame(1799).layers.len(), 1);
        assert!(p.frame(1800).layers.is_empty());
    }

    #[test]
    fn overlays_and_zooms_follow_the_edit() {
        let p = plan(&fixture("valid-with-overlays.json"), &settings()).unwrap();
        assert_eq!(p.overlays.len(), 5);
        assert_eq!(p.zooms.len(), 1);
        // 6.5 seconds: the text (5 to 8 s), the shape and the arrow (6 to 8 s) are showing, in the order they were added.
        let f = p.frame(195);
        let names: Vec<&str> = f.overlays.iter().map(|o| o.name()).collect();
        assert_eq!(names, ["Title", "Ellipse", "Arrow"]);
        // 11 seconds: the blur and the redaction.
        let later = p.frame(330);
        let names: Vec<&str> = later.overlays.iter().map(|o| o.name()).collect();
        assert_eq!(names, ["Blur", "Redaction"]);
        assert!(p.frame(100).overlays.is_empty());
    }

    #[test]
    fn the_zoom_moves_in_holds_and_moves_out_and_reduced_motion_cuts() {
        let p = plan(&fixture("valid-with-overlays.json"), &settings()).unwrap();
        let rect = |frame: u64| p.frame(frame).zoom;
        assert_eq!(rect(599).rect.width, EDIT_FULL, "before the zoom (20 s) the whole picture shows");
        assert!(rect(607).moving && rect(607).rect.width < EDIT_FULL && rect(607).rect.width > 5000.0, "moving in");
        assert_eq!(rect(640), rect(641), "holding");
        assert_eq!(rect(640).rect.width, 5000.0);
        assert!(rect(748).moving, "moving out, 0.1 s before it ends at 25 s");
        assert_eq!(rect(750).rect.width, EDIT_FULL);

        let still =
            plan(&fixture("valid-with-overlays.json"), &RenderSettings { reduce_motion: true, ..settings() }).unwrap();
        for frame in 600..750 {
            let z = still.frame(frame).zoom;
            assert!(!z.moving);
            assert_eq!(z.rect.width, 5000.0, "frame {frame}");
        }
        assert_eq!(still.frame(599).zoom.rect.width, EDIT_FULL);
        assert_eq!(still.frame(750).zoom.rect.width, EDIT_FULL);
    }

    #[test]
    fn sound_comes_from_the_audio_clips_with_their_settings() {
        let p = plan(&fixture("valid-with-imports.json"), &settings()).unwrap();
        let voice = p.audio.iter().find(|a| a.clip_id == "clip-5").expect("the voice");
        assert_eq!((voice.fade_in_ms, voice.fade_out_ms), (1000, 2000));
        assert_eq!(voice.source, EditSourceRef::Take { take: 1, media: "mic.wav".into() });
        assert!(
            p.audio.iter().any(|a| a.source == EditSourceRef::Asset { asset: "music.mp3".into() }),
            "imported music is mixed"
        );
        // The imported image and video are pictures, not sound.
        assert!(p.video.iter().any(|v| v.kind == EditSourceKind::Image));
        assert!(p.video.iter().any(|v| v.kind == EditSourceKind::Video));
        assert!(!p.audio.iter().any(|a| matches!(&a.source, EditSourceRef::Asset { asset } if asset.ends_with(".mp4") || asset.ends_with(".png"))));
    }

    #[test]
    fn an_edit_with_errors_is_refused_with_the_first_problem_in_words() {
        let e = plan(&fixture("overlap.json"), &settings()).unwrap_err();
        assert!(e.starts_with("The edit cannot be rendered: The clip \"Lesson\" on the Screen track starts at"), "{e}");
        let many = plan(&fixture("duplicate-id.json"), &settings()).unwrap_err();
        assert!(many.contains("cannot be rendered"), "{many}");
    }

    #[test]
    fn an_edit_that_lacks_something_is_refused_unless_told_otherwise() {
        let e = plan(&fixture("needs-attention.json"), &settings()).unwrap_err();
        assert!(e.starts_with("The edit is not finished: "), "{e}");
        assert!(e.contains("image with no alt text"), "{e}");
        let ok =
            plan(&fixture("needs-attention.json"), &RenderSettings { require_complete: false, ..settings() }).unwrap();
        assert_eq!(ok.video.len(), 1);
    }

    #[test]
    fn warnings_do_not_stop_a_render() {
        assert!(plan(&fixture("warnings.json"), &settings()).is_ok());
    }

    #[test]
    fn settings_that_cannot_be_encoded_are_refused() {
        let e = fixture("valid-basic.json");
        assert!(plan(&e, &RenderSettings { fps: 0, ..settings() })
            .unwrap_err()
            .contains("at least 1 picture a second"));
        assert!(plan(&e, &RenderSettings { width: 1921, ..settings() }).unwrap_err().contains("even width and height"));
        assert!(plan(&e, &RenderSettings { height: 0, ..settings() }).is_err());
    }

    #[test]
    fn planning_twice_gives_the_same_plan() {
        let e = fixture("valid-with-overlays.json");
        assert_eq!(plan(&e, &settings()).unwrap(), plan(&e, &settings()).unwrap());
    }

    #[test]
    fn a_fade_at_the_start_is_a_transition_on_the_clip_for_its_length_and_then_none() {
        let p = plan(&fixture("valid-transition.json"), &settings()).unwrap();
        // The second piece starts at 20 s with a cross-fade of 0.8 s; the first ends with a fade of 0.5 s.
        let early = p.frame(19 * 30 + 29); // 19.966 s, inside the last 0.5 s of the first piece
        let out = early.layers[0].transition.expect("leaving with a fade");
        assert_eq!((out.kind, out.phase), (EditTransitionKind::Fade, TransitionPhase::Out));
        assert!(out.progress > 0.9, "nearly gone, not {}", out.progress);
        assert!(p.frame(300).layers[0].transition.is_none(), "10 s in, none");
    }

    #[test]
    fn a_cross_fade_holds_the_last_picture_of_the_clip_before_under_the_new_one() {
        let p = plan(&fixture("valid-transition.json"), &settings()).unwrap();
        let f = p.frame(600 + 12); // 0.4 s into the cross-fade
        assert_eq!(f.layers.len(), 2);
        assert!(f.layers[0].held && !f.layers[1].held);
        assert_eq!(f.layers[0].transition.unwrap().phase, TransitionPhase::Under);
        assert_eq!(f.layers[1].transition.unwrap().phase, TransitionPhase::In);
        assert_eq!(f.layers[0].source_time_ms, 19_960, "40 ms before the end of the first piece");
        assert_eq!(f.layers[1].source_time_ms, 20_400);
        let after = p.frame(600 + 24 + 1); // 0.83 s: over
        assert_eq!(after.layers.len(), 1);
        assert!(after.layers[0].transition.is_none());
    }

    #[test]
    fn reduced_motion_cuts_instead_of_blending() {
        let still =
            plan(&fixture("valid-transition.json"), &RenderSettings { reduce_motion: true, ..settings() }).unwrap();
        let f = still.frame(600 + 12);
        assert_eq!(f.layers.len(), 1);
        assert!(f.layers[0].transition.is_none());
    }
}
