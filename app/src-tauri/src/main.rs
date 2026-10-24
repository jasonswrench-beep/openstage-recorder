// SPDX-License-Identifier: Apache-2.0
// Hide the console window in release builds on Windows.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    openstage_recorder_lib::run()
}
