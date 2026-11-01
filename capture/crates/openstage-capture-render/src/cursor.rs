// SPDX-License-Identifier: Apache-2.0
//! Showing where the pointer is, so a viewer can follow it.
//!
//! A soft yellow disc with an orange ring is laid over the picture at the pointer. When a button was pressed a moment ago, a red ring opens
//! from the pointer and fades. For a viewer who has asked for less motion (the same box that turns animated zooms into cuts) the ring does not
//! open: it is a steady, larger ring that goes away. The pointer is drawn over the recorded picture and under everything the author added,
//! so a blur or a blacked-out box hides the pointer as it hides the picture. Only the pointer's place is arithmetic on decimals; what is laid
//! on each pixel is whole numbers, so the same frame is always the same bytes.

use crate::canvas::{Canvas, Rgb};

/// Where the pointer was, in pixels of the picture it was over, and how long ago a button was pressed, if one was pressed in the last moment.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CursorMark {
    pub x: f64,
    pub y: f64,
    pub click_age_ms: Option<u64>,
}

/// How long a press stays on the screen.
pub const CLICK_SHOWN_MS: u64 = 450;
/// How long the steady ring of someone who has asked for less motion stays.
const STEADY_MS: u64 = 300;

const DISC: Rgb = Rgb(255, 214, 10);
const RING: Rgb = Rgb(255, 128, 0);
const PRESS: Rgb = Rgb(230, 40, 40);

/// Lay `colour` with `share` (0 to 255) over every pixel whose distance from (`cx`, `cy`) is more than `inner` and at most `outer`.
fn shade(canvas: &mut Canvas, cx: f64, cy: f64, inner: f64, outer: f64, colour: Rgb, share: u32) {
    if share == 0 || outer <= 0.0 {
        return;
    }
    let (w, h) = (canvas.width as i64, canvas.height as i64);
    let x0 = ((cx - outer).floor() as i64).max(0);
    let x1 = ((cx + outer).ceil() as i64).min(w - 1);
    let y0 = ((cy - outer).floor() as i64).max(0);
    let y1 = ((cy + outer).ceil() as i64).min(h - 1);
    for y in y0..=y1 {
        for x in x0..=x1 {
            let (dx, dy) = (x as f64 + 0.5 - cx, y as f64 + 0.5 - cy);
            let d2 = dx * dx + dy * dy;
            if d2 <= outer * outer && (inner <= 0.0 || d2 > inner * inner) {
                canvas.blend_pixel(x as u32, y as u32, colour, share);
            }
        }
    }
}

/// Draw the pointer at (`cx`, `cy`), in pixels of the canvas.
pub fn draw_cursor(canvas: &mut Canvas, cx: f64, cy: f64, mark: &CursorMark, reduce_motion: bool) {
    let base = (canvas.height as f64 * 0.03).max(14.0);
    let line = (base * 0.18).max(2.0);
    shade(canvas, cx, cy, 0.0, base, DISC, 90);
    shade(canvas, cx, cy, base - line, base, RING, 235);
    let Some(age) = mark.click_age_ms else { return };
    if reduce_motion {
        if age < STEADY_MS {
            shade(canvas, cx, cy, base * 1.6 - line * 1.5, base * 1.6, PRESS, 220);
        }
    } else if age < CLICK_SHOWN_MS {
        let p = age as f64 / CLICK_SHOWN_MS as f64;
        let radius = base * (1.0 + 1.2 * p);
        shade(canvas, cx, cy, radius - line, radius, PRESS, ((1.0 - p) * 230.0) as u32);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn black(w: u32, h: u32) -> Canvas {
        Canvas::new(w, h)
    }

    const BASE: f64 = 14.0; // a canvas 100 pixels high: 3 percent of it is under 14, so the least size is used

    #[test]
    fn the_pointer_is_a_soft_disc_with_a_ring_and_leaves_the_rest_of_the_picture_alone() {
        let mut c = black(100, 100);
        draw_cursor(&mut c, 50.0, 50.0, &CursorMark { x: 0.0, y: 0.0, click_age_ms: None }, false);
        let centre = c.pixel(50, 50);
        assert!(centre.0 > centre.1 && centre.1 > centre.2 && centre.0 > 60, "a yellow tint over black: {centre:?}");
        let ring = c.pixel(50 + BASE as u32 - 1, 50);
        assert!(ring.0 >= 200 && ring.1 > 80 && ring.2 < 40, "the ring is orange and strong: {ring:?}");
        assert_eq!(c.pixel(50 + BASE as u32 + 3, 50), Rgb(0, 0, 0), "outside the ring nothing is touched");
        assert_eq!(c.pixel(5, 5), Rgb(0, 0, 0));
    }

    #[test]
    fn the_same_pointer_is_the_same_bytes_every_time_and_a_pointer_off_the_picture_is_harmless() {
        let (mut a, mut b) = (black(120, 80), black(120, 80));
        let mark = CursorMark { x: 0.0, y: 0.0, click_age_ms: Some(100) };
        draw_cursor(&mut a, 40.3, 22.7, &mark, false);
        draw_cursor(&mut b, 40.3, 22.7, &mark, false);
        assert_eq!(a, b);
        let before = black(120, 80);
        let mut far = black(120, 80);
        draw_cursor(&mut far, -500.0, 900.0, &mark, false);
        assert_eq!(far, before, "a pointer far outside draws nothing");
        draw_cursor(&mut far, 2.0, 2.0, &mark, false);
        draw_cursor(&mut far, 119.0, 79.0, &mark, true);
        assert_ne!(far, before, "a pointer at an edge draws what fits");
    }

    #[test]
    fn a_press_opens_a_red_ring_that_grows_and_fades_and_is_gone_after_a_moment() {
        let red_at = |age: Option<u64>, distance: u32| {
            let mut c = black(100, 100);
            draw_cursor(&mut c, 50.0, 50.0, &CursorMark { x: 0.0, y: 0.0, click_age_ms: age }, false);
            c.pixel(50 + distance, 50)
        };
        let ring_start = red_at(Some(0), BASE as u32 - 1);
        assert!(
            ring_start.0 > ring_start.1 + 100,
            "at once the press ring is on the pointer's own ring: {ring_start:?}"
        );
        let mid_distance = (BASE * (1.0 + 1.2 * 0.5)) as u32 - 1;
        assert!(red_at(Some(225), mid_distance).0 > 100, "half way it is wider");
        assert_eq!(red_at(Some(225), mid_distance + 8), Rgb(0, 0, 0), "and not wider than it should be");
        // On the ring itself at two moments: early it is strong, late it is faint.
        let on_ring = |age: u64| {
            let p = age as f64 / CLICK_SHOWN_MS as f64;
            let radius = BASE * (1.0 + 1.2 * p);
            red_at(Some(age), radius.floor() as u32 - 1).0
        };
        assert!(on_ring(45) > 150 && on_ring(360) < 80 && on_ring(45) > 2 * on_ring(360), "it fades as it grows");
        let mut gone = black(100, 100);
        let mut none = black(100, 100);
        draw_cursor(&mut gone, 50.0, 50.0, &CursorMark { x: 0.0, y: 0.0, click_age_ms: Some(CLICK_SHOWN_MS) }, false);
        draw_cursor(&mut none, 50.0, 50.0, &CursorMark { x: 0.0, y: 0.0, click_age_ms: None }, false);
        assert_eq!(gone, none, "after the moment it is only the pointer again");
    }

    #[test]
    fn for_someone_who_asked_for_less_motion_a_press_is_a_steady_ring_that_does_not_open() {
        let draw = |age: u64| {
            let mut c = black(100, 100);
            draw_cursor(&mut c, 50.0, 50.0, &CursorMark { x: 0.0, y: 0.0, click_age_ms: Some(age) }, true);
            c
        };
        assert_eq!(
            draw(10),
            draw(250),
            "the ring is the same size and strength from the start to the end of its moment"
        );
        let mut none = black(100, 100);
        draw_cursor(&mut none, 50.0, 50.0, &CursorMark { x: 0.0, y: 0.0, click_age_ms: None }, true);
        assert_ne!(draw(10), none, "it is there");
        assert_eq!(draw(STEADY_MS), none, "and gone after its moment");
        let steady = draw(10).pixel(50 + (BASE * 1.6) as u32 - 1, 50);
        assert!(steady.0 > 150 && steady.1 < 100, "a red ring, larger than the pointer's: {steady:?}");
    }

    /// Not a check: writes a picture to look at, the pointer on a light ground and a dark one, with a press at three moments and a steady ring
    /// for someone who asked for less motion. Run it with `cargo test -p openstage-capture-render look_at_the_pointer -- --ignored`; it says where
    /// the picture is.
    #[test]
    #[ignore]
    fn look_at_the_pointer() {
        let mut c = Canvas::new(960, 360);
        c.clear(Rgb(243, 249, 253));
        for y in 0..360 {
            for x in 480..960 {
                c.set_pixel(x, y, Rgb(24, 30, 44));
            }
        }
        for (i, age) in [None, Some(60), Some(220), Some(400)].into_iter().enumerate() {
            let mark = CursorMark { x: 0.0, y: 0.0, click_age_ms: age };
            draw_cursor(&mut c, 70.0 + i as f64 * 105.0, 90.0, &mark, false);
            draw_cursor(&mut c, 550.0 + i as f64 * 105.0, 90.0, &mark, false);
        }
        for (i, age) in [None, Some(60), Some(220), Some(400)].into_iter().enumerate() {
            let mark = CursorMark { x: 0.0, y: 0.0, click_age_ms: age };
            draw_cursor(&mut c, 70.0 + i as f64 * 105.0, 250.0, &mark, true);
            draw_cursor(&mut c, 550.0 + i as f64 * 105.0, 250.0, &mark, true);
        }
        let path = std::env::temp_dir().join("openstage-pointer-look.png");
        std::fs::write(&path, crate::png::encode_png(c.width, c.height, &c.bgra)).unwrap();
        println!("the picture is at {}", path.display());
    }
}
