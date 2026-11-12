//! Initial window placement: centred in the work area (without panels and
//! taskbars) of the monitor under the mouse pointer, using 95 % of its height
//! and a portrait reading width derived from that height.

use std::time::Duration;

use tauri::{Monitor, PhysicalPosition, PhysicalSize, WebviewWindow};

/// Share of the work area's height the whole window (incl. title bar) uses.
const HEIGHT_SHARE: f64 = 0.95;
/// Width relative to height. 0.9 leaves room for the 750 px reading column
/// plus margins even on 1080p screens; A4 (0.71) would squeeze it there.
const ASPECT: f64 = 0.9;
/// Never wider than this share of the work area (e.g. on portrait screens).
const MAX_WIDTH_SHARE: f64 = 0.95;

fn target_monitor(window: &WebviewWindow) -> Option<Monitor> {
    window
        .cursor_position()
        .ok()
        .and_then(|p| window.monitor_from_point(p.x, p.y).ok().flatten())
        .or_else(|| window.current_monitor().ok().flatten())
        .or_else(|| window.primary_monitor().ok().flatten())
}

/// Height taken by the system frame (title bar, borders); 0 while unknown.
fn frame_height(window: &WebviewWindow) -> u32 {
    match (window.outer_size(), window.inner_size()) {
        (Ok(outer), Ok(inner)) => outer.height.saturating_sub(inner.height),
        _ => 0,
    }
}

/// Places the hidden window, shows it, and places it once more as soon as the
/// window manager has added its frame: on X11 the title bar height is only
/// known after mapping, so the first pass can only guess it as 0.
pub fn place_and_show(window: &WebviewWindow) {
    place(window);
    let _ = window.show();

    let window = window.clone();
    std::thread::spawn(move || {
        for _ in 0..25 {
            std::thread::sleep(Duration::from_millis(20));
            if frame_height(&window) > 0 {
                let w = window.clone();
                let _ = window.run_on_main_thread(move || place(&w));
                return;
            }
        }
    });
}

fn place(window: &WebviewWindow) {
    let Some(monitor) = target_monitor(window) else {
        let _ = window.center();
        return;
    };
    let area = monitor.work_area();
    let (area_w, area_h) = (area.size.width as f64, area.size.height as f64);

    let outer_h = (area_h * HEIGHT_SHARE).round();
    let inner_h = outer_h - frame_height(window) as f64;
    let width = (outer_h * ASPECT).min(area_w * MAX_WIDTH_SHARE).round();

    let _ = window.set_size(PhysicalSize::new(width as u32, inner_h as u32));
    let _ = window.set_position(PhysicalPosition::new(
        area.position.x + ((area_w - width) / 2.0) as i32,
        area.position.y + ((area_h - outer_h) / 2.0) as i32,
    ));
}

/// Outer position and inner size of a window, to put it back later.
pub struct Geometry {
    position: PhysicalPosition<i32>,
    size: PhysicalSize<u32>,
}

/// Stretches the window over the full width of its monitor's work area,
/// keeping height and vertical position. Returns the previous geometry, or
/// None if nothing was changed (maximized window, unknown monitor).
pub fn widen(window: &WebviewWindow) -> Option<Geometry> {
    if window.is_maximized().unwrap_or(false) {
        return None;
    }
    let monitor = window.current_monitor().ok().flatten()?;
    let area = monitor.work_area();
    let position = window.outer_position().ok()?;
    let size = window.inner_size().ok()?;
    let frame_w = window.outer_size().ok()?.width.saturating_sub(size.width);

    let _ = window.set_size(PhysicalSize::new(area.size.width.saturating_sub(frame_w), size.height));
    let _ = window.set_position(PhysicalPosition::new(area.position.x, position.y));
    Some(Geometry { position, size })
}

pub fn restore(window: &WebviewWindow, geometry: Geometry) {
    let _ = window.set_size(geometry.size);
    let _ = window.set_position(geometry.position);
}
