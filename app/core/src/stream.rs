// SPDX-License-Identifier: Apache-2.0
//! A helper program that runs for a long time and talks as it goes: the Capture recorder.
//!
//! The other helpers (publish, preview, narration) are run to the end and their answer is read afterwards. A recording lasts as long as
//! the author is working, and needs commands while it runs (pause, resume, stop, restart, mark) and a live picture of what it is doing.
//! So this keeps the program's standard input open, reads its standard output a line at a time while it runs, and has a slot of its own,
//! separate from the preview-or-publish slot.
//!
//! The shell does not read the protocol. Each line the program prints goes to the page untouched, and the page decides what it means;
//! each line the page sends goes to the program, after a check that it is one short line of JSON. The one thing the shell does know is
//! how to stop: send the stop line, wait for the program to finish and print its result, and only then end it by force.

use serde::Serialize;
use std::collections::VecDeque;
use std::io::{BufRead, BufReader, Read, Write};
use std::path::Path;
use std::process::{ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// The longest line read from the program. Longer ones are dropped, so a program that prints without ending a line cannot fill memory.
const MAX_OUT_LINE: usize = 1024 * 1024;
/// The longest line sent to the program. Commands are small.
const MAX_IN_LINE: usize = 8 * 1024;
/// How long Stop waits for the program to finish and print its result, before ending it.
pub const STOP_GRACE: Duration = Duration::from_secs(10);
/// What the program is told to stop with, when the page does not say.
pub const DEFAULT_STOP_LINE: &str = "{\"type\":\"stop\"}";

/// How a run ended.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct Exit {
    /// The program's exit code, if it ended normally.
    pub code: Option<i32>,
    /// True if it had to be ended by force because it did not finish in time.
    pub killed: bool,
    /// The last things it printed on its error channel, for a message when it went wrong.
    pub stderr_tail: String,
}

struct Running {
    pid: u32,
    stdin: Option<ChildStdin>,
    paused: bool,
}

/// True from the moment a run starts until its end has been reported.
static ACTIVE: AtomicBool = AtomicBool::new(false);
static RUNNING: Mutex<Option<Running>> = Mutex::new(None);
/// Set when Stop had to end the program by force, so the end can say so.
static FORCED: AtomicBool = AtomicBool::new(false);

fn running() -> std::sync::MutexGuard<'static, Option<Running>> {
    RUNNING.lock().unwrap_or_else(|e| e.into_inner())
}

pub fn is_active() -> bool {
    ACTIVE.load(Ordering::SeqCst)
}

/// What the page can ask about: is a run going, and is it paused.
#[derive(Serialize, Clone, Debug, PartialEq)]
pub struct State {
    pub running: bool,
    pub paused: bool,
}

pub fn state() -> State {
    let active = is_active();
    State { running: active, paused: active && running().as_ref().map(|r| r.paused).unwrap_or(false) }
}

/// Whether a preview, a publish or narration has to wait: a recording is going and has not been paused. While it is paused the
/// computer is free for heavy work, and editing and saving are never held back.
pub fn blocks_jobs() -> bool {
    is_active() && !running().as_ref().map(|r| r.paused).unwrap_or(false)
}

pub const BUSY_MESSAGE: &str =
    "A recording is in progress. Pause or stop it, then try again. You can keep editing and saving meanwhile.";
const ALREADY: &str = "A recording is already in progress. Stop it first.";

/// The page says the recorder has paused or resumed, so heavy jobs know whether they may run.
pub fn set_paused(paused: bool) {
    if let Some(r) = running().as_mut() {
        r.paused = paused;
    }
}

/// The window has gone. Ask the recorder to finish, briefly, then end it, so no recorder is left running with nothing to command it.
pub fn shutdown() {
    let _ = stop(DEFAULT_STOP_LINE, Duration::from_secs(3));
}

/// Start the program. `on_line` is called for each line it prints, in order, from another thread; `on_exit` once, after the last line.
pub fn start(
    program: &Path,
    args: &[String],
    on_line: impl Fn(String) + Send + 'static,
    on_exit: impl FnOnce(Exit) + Send + 'static,
) -> Result<(), String> {
    if ACTIVE.swap(true, Ordering::SeqCst) {
        return Err(ALREADY.into());
    }
    FORCED.store(false, Ordering::SeqCst);
    let mut cmd = Command::new(program);
    cmd.args(args).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x0800_0000); // no console window flashing up
    }
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            ACTIVE.store(false, Ordering::SeqCst);
            return Err(format!("Could not start the recorder: {e}"));
        }
    };
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();
    *running() = Some(Running { pid: child.id(), stdin: child.stdin.take(), paused: false });

    // What it prints on the error channel is kept for the end, in case it went wrong.
    let tail: Arc<Mutex<VecDeque<String>>> = Arc::new(Mutex::new(VecDeque::new()));
    let tail_for_reader = Arc::clone(&tail);
    let errors = std::thread::spawn(move || {
        if let Some(stderr) = stderr {
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                let mut t = tail_for_reader.lock().unwrap_or_else(|e| e.into_inner());
                t.push_back(line);
                while t.len() > 20 {
                    t.pop_front();
                }
            }
        }
    });

    std::thread::spawn(move || {
        if let Some(stdout) = stdout {
            read_lines(stdout, &on_line);
        }
        let status = child.wait().ok();
        let _ = errors.join();
        let mut stderr_tail =
            tail.lock().unwrap_or_else(|e| e.into_inner()).iter().cloned().collect::<Vec<_>>().join("\n");
        if stderr_tail.len() > 4000 {
            stderr_tail = stderr_tail[stderr_tail.len() - 4000..].to_string();
        }
        let exit =
            Exit { code: status.and_then(|s| s.code()), killed: FORCED.swap(false, Ordering::SeqCst), stderr_tail };
        *running() = None;
        on_exit(exit);
        // Only now is the slot free, so the page has been told before another run can begin.
        ACTIVE.store(false, Ordering::SeqCst);
    });
    Ok(())
}

/// Read a program's output a line at a time. A line longer than the limit is dropped whole, and an empty line is skipped.
fn read_lines(source: impl Read, on_line: &dyn Fn(String)) {
    let mut reader = BufReader::new(source);
    let mut buf: Vec<u8> = Vec::new();
    loop {
        buf.clear();
        // Read up to the end of the line, but never hold more than the limit.
        let mut too_long = false;
        loop {
            let chunk = match reader.fill_buf() {
                Ok(c) if !c.is_empty() => c,
                _ => {
                    if buf.is_empty() && !too_long {
                        return;
                    }
                    break;
                }
            };
            match chunk.iter().position(|b| *b == b'\n') {
                Some(at) => {
                    if !too_long {
                        buf.extend_from_slice(&chunk[..at]);
                    }
                    reader.consume(at + 1);
                    break;
                }
                None => {
                    let n = chunk.len();
                    if !too_long {
                        buf.extend_from_slice(chunk);
                        if buf.len() > MAX_OUT_LINE {
                            too_long = true;
                            buf.clear();
                        }
                    }
                    reader.consume(n);
                }
            }
        }
        if too_long {
            continue;
        }
        let line = String::from_utf8_lossy(&buf).trim_end_matches('\r').to_string();
        if line.trim().is_empty() {
            continue;
        }
        if line.len() > MAX_OUT_LINE {
            continue;
        }
        on_line(line);
    }
}

/// Is this something the page may send? One short line of JSON, an object, with no line break inside it.
pub fn check_line(line: &str) -> Result<(), String> {
    if line.len() > MAX_IN_LINE {
        return Err("That command is too long to send to the recorder.".into());
    }
    if line.contains('\n') || line.contains('\r') {
        return Err("A command to the recorder is one line.".into());
    }
    match serde_json::from_str::<serde_json::Value>(line) {
        Ok(v) if v.is_object() => Ok(()),
        _ => Err("A command to the recorder is one JSON object on one line.".into()),
    }
}

/// Send one command to the running program.
pub fn send(line: &str) -> Result<(), String> {
    check_line(line)?;
    let mut guard = running();
    let r = guard.as_mut().filter(|_| is_active()).ok_or("The recorder is not running.")?;
    let stdin = r.stdin.as_mut().ok_or("The recorder is already stopping.")?;
    stdin
        .write_all(line.as_bytes())
        .and_then(|_| stdin.write_all(b"\n"))
        .and_then(|_| stdin.flush())
        .map_err(|_| "The recorder is not listening any more.".to_string())
}

/// Stop the program the polite way: tell it to stop, close its input, give it `grace` to finish and print its result, and only then end it
/// by force. Returns false if it was not running, true once it has ended.
pub fn stop(stop_line: &str, grace: Duration) -> Result<bool, String> {
    check_line(stop_line)?;
    if !is_active() {
        return Ok(false);
    }
    let pid = {
        let mut guard = running();
        let Some(r) = guard.as_mut() else { return Ok(false) };
        if let Some(stdin) = r.stdin.as_mut() {
            let _ =
                stdin.write_all(stop_line.as_bytes()).and_then(|_| stdin.write_all(b"\n")).and_then(|_| stdin.flush());
        }
        // A program that reads until the end of its input will end on its own once the input closes.
        r.stdin = None;
        r.pid
    };
    let deadline = Instant::now() + grace;
    while is_active() && Instant::now() < deadline {
        std::thread::sleep(Duration::from_millis(20));
    }
    if is_active() {
        FORCED.store(true, Ordering::SeqCst);
        crate::kill_tree(pid);
        let hard = Instant::now() + Duration::from_secs(5);
        while is_active() && Instant::now() < hard {
            std::thread::sleep(Duration::from_millis(20));
        }
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A stand-in recorder written in Node, which every machine that publishes a course has. It prints its protocol version, answers each
    /// command it is sent, and on `stop` prints a result and ends. `MODE` changes how it behaves.
    const SCRIPT: &str = r#"
const mode = process.env.STUB_MODE || 'normal';
const out = (o) => process.stdout.write(JSON.stringify(o) + '\n');
out({ type: 'hello', protocol: 1 });
process.stderr.write('stub started\n');
let buf = '';
process.stdin.on('data', (d) => {
  buf += d;
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    const cmd = JSON.parse(line);
    if (cmd.type === 'stop') { if (mode !== 'deaf' && mode !== 'ends-with-input') { out({ type: 'result', ok: true }); process.exit(0); } }
    else out({ type: 'echo', got: cmd });
  }
});
process.stdin.on('end', () => { if (mode === 'ends-with-input') { out({ type: 'result', ok: true, by: 'input closed' }); process.exit(0); } });
if (mode === 'deaf') setInterval(() => {}, 1000); // ignores stop, and stays alive even when its input closes
if (mode === 'long-line') { process.stdout.write('x'.repeat(2 * 1024 * 1024) + '\n'); out({ type: 'after' }); }
if (mode === 'crash') { process.stderr.write('boom\n'); process.exit(3); }
"#;

    fn node() -> Option<std::path::PathBuf> {
        let name = if cfg!(windows) { "node.exe" } else { "node" };
        std::env::var_os("PATH")?
            .to_str()?
            .split(if cfg!(windows) { ';' } else { ':' })
            .map(|d| Path::new(d).join(name))
            .find(|p| p.is_file())
    }

    fn script_file() -> std::path::PathBuf {
        let p = std::env::temp_dir().join(format!("openstage-stub-recorder-{}.js", std::process::id()));
        std::fs::write(&p, SCRIPT).unwrap();
        p
    }

    struct Run {
        lines: Arc<Mutex<Vec<String>>>,
        exit: Arc<Mutex<Option<Exit>>>,
    }

    fn launch(mode: &str) -> Option<Run> {
        let node = node()?;
        std::env::set_var("STUB_MODE", mode);
        let lines = Arc::new(Mutex::new(Vec::new()));
        let exit = Arc::new(Mutex::new(None));
        let (l, e) = (Arc::clone(&lines), Arc::clone(&exit));
        start(
            &node,
            &[script_file().to_string_lossy().into_owned()],
            move |line| l.lock().unwrap().push(line),
            move |x| *e.lock().unwrap() = Some(x),
        )
        .unwrap();
        Some(Run { lines, exit })
    }

    fn wait_for(what: &str, mut ok: impl FnMut() -> bool) {
        let end = Instant::now() + Duration::from_secs(10);
        while Instant::now() < end {
            if ok() {
                return;
            }
            std::thread::sleep(Duration::from_millis(20));
        }
        panic!("timed out waiting for {what}");
    }

    fn finish() {
        // Whatever a test left running must not leak into the next one.
        let _ = stop(DEFAULT_STOP_LINE, Duration::from_millis(300));
        wait_for("the slot to free", || !is_active());
    }

    #[test]
    fn lines_arrive_in_order_while_the_program_runs_and_a_command_gets_an_answer() {
        let _serial = crate::JOB_TESTS.lock().unwrap_or_else(|e| e.into_inner());
        let Some(run) = launch("normal") else {
            eprintln!("node not found: skipped");
            return;
        };
        wait_for("the hello line", || !run.lines.lock().unwrap().is_empty());
        assert_eq!(run.lines.lock().unwrap()[0], "{\"type\":\"hello\",\"protocol\":1}");
        assert!(run.exit.lock().unwrap().is_none(), "still running: lines come before the end");
        send("{\"type\":\"pause\"}").unwrap();
        send("{\"type\":\"marker\",\"label\":\"here\"}").unwrap();
        wait_for("two echoes", || run.lines.lock().unwrap().len() >= 3);
        let lines = run.lines.lock().unwrap().clone();
        assert_eq!(lines[1], "{\"type\":\"echo\",\"got\":{\"type\":\"pause\"}}");
        assert_eq!(lines[2], "{\"type\":\"echo\",\"got\":{\"type\":\"marker\",\"label\":\"here\"}}");
        finish();
    }

    /// Frees the slot whatever a test did, even if it panicked half way.
    struct Cleanup;
    impl Drop for Cleanup {
        fn drop(&mut self) {
            finish();
        }
    }

    #[test]
    fn stop_asks_first_and_the_program_finishes_and_reports_its_result() {
        let _serial = crate::JOB_TESTS.lock().unwrap_or_else(|e| e.into_inner());
        let _clean = Cleanup;
        let Some(run) = launch("normal") else {
            eprintln!("node not found: skipped");
            return;
        };
        wait_for("the hello line", || !run.lines.lock().unwrap().is_empty());
        assert_eq!(stop(DEFAULT_STOP_LINE, STOP_GRACE), Ok(true));
        let exit = run.exit.lock().unwrap().clone().expect("the end was reported before stop returned");
        assert_eq!(exit.code, Some(0));
        assert!(!exit.killed, "it finished by itself");
        assert!(exit.stderr_tail.contains("stub started"));
        assert!(
            run.lines.lock().unwrap().iter().any(|l| l == "{\"type\":\"result\",\"ok\":true}"),
            "its result arrived before the end"
        );
        assert!(!is_active());
    }

    #[test]
    fn a_program_that_reads_until_its_input_closes_ends_when_stop_closes_it() {
        let _serial = crate::JOB_TESTS.lock().unwrap_or_else(|e| e.into_inner());
        let _clean = Cleanup;
        let Some(run) = launch("ends-with-input") else {
            eprintln!("node not found: skipped");
            return;
        };
        wait_for("the hello line", || !run.lines.lock().unwrap().is_empty());
        assert_eq!(stop(DEFAULT_STOP_LINE, STOP_GRACE), Ok(true));
        let exit = run.exit.lock().unwrap().clone().unwrap();
        assert!(!exit.killed);
        assert!(run.lines.lock().unwrap().iter().any(|l| l.contains("input closed")));
    }

    #[test]
    fn a_program_that_ignores_stop_is_ended_by_force_after_the_grace_and_that_is_reported() {
        let _serial = crate::JOB_TESTS.lock().unwrap_or_else(|e| e.into_inner());
        let _clean = Cleanup;
        let Some(run) = launch("deaf") else {
            eprintln!("node not found: skipped");
            return;
        };
        wait_for("the hello line", || !run.lines.lock().unwrap().is_empty());
        let began = Instant::now();
        assert_eq!(stop(DEFAULT_STOP_LINE, Duration::from_millis(400)), Ok(true));
        assert!(began.elapsed() >= Duration::from_millis(400), "it was given its grace first");
        assert!(run.exit.lock().unwrap().clone().unwrap().killed);
        assert!(!is_active());
    }

    #[test]
    fn a_second_recording_is_refused_politely_while_one_runs() {
        let _serial = crate::JOB_TESTS.lock().unwrap_or_else(|e| e.into_inner());
        let _clean = Cleanup;
        let Some(_run) = launch("normal") else {
            eprintln!("node not found: skipped");
            return;
        };
        let again = start(Path::new("whatever"), &[], |_| {}, |_| {});
        assert_eq!(again, Err(ALREADY.to_string()));
        assert!(is_active(), "the first is not disturbed");
    }

    #[test]
    fn a_program_that_will_not_start_frees_the_slot_and_says_so() {
        let _serial = crate::JOB_TESTS.lock().unwrap_or_else(|e| e.into_inner());
        let result = start(Path::new("openstage-no-such-program"), &[], |_| {}, |_| {});
        assert!(result.unwrap_err().starts_with("Could not start the recorder"));
        assert!(!is_active());
    }

    #[test]
    fn a_crash_is_reported_with_its_code_and_what_it_said() {
        let _serial = crate::JOB_TESTS.lock().unwrap_or_else(|e| e.into_inner());
        let _clean = Cleanup;
        let Some(run) = launch("crash") else {
            eprintln!("node not found: skipped");
            return;
        };
        wait_for("the end", || run.exit.lock().unwrap().is_some());
        let exit = run.exit.lock().unwrap().clone().unwrap();
        assert_eq!(exit.code, Some(3));
        assert!(!exit.killed);
        assert!(exit.stderr_tail.contains("boom"));
    }

    #[test]
    fn a_line_over_the_limit_is_dropped_whole_and_the_next_still_arrives() {
        let _serial = crate::JOB_TESTS.lock().unwrap_or_else(|e| e.into_inner());
        let _clean = Cleanup;
        let Some(run) = launch("long-line") else {
            eprintln!("node not found: skipped");
            return;
        };
        wait_for("the line after", || run.lines.lock().unwrap().iter().any(|l| l.contains("after")));
        assert!(run.lines.lock().unwrap().iter().all(|l| l.len() < 1000), "the huge line never reached the page");
    }

    #[test]
    fn heavy_jobs_wait_while_recording_unless_paused_and_come_back_after() {
        let _serial = crate::JOB_TESTS.lock().unwrap_or_else(|e| e.into_inner());
        let _clean = Cleanup;
        assert!(!blocks_jobs(), "nothing is recording");
        let Some(run) = launch("normal") else {
            eprintln!("node not found: skipped");
            return;
        };
        wait_for("the hello line", || !run.lines.lock().unwrap().is_empty());
        assert_eq!(state(), State { running: true, paused: false });
        assert!(blocks_jobs());
        set_paused(true);
        assert_eq!(state(), State { running: true, paused: true });
        assert!(!blocks_jobs(), "paused, so the computer is free");
        set_paused(false);
        assert!(blocks_jobs());
        finish();
        assert_eq!(state(), State { running: false, paused: false });
        assert!(!blocks_jobs());
    }

    #[test]
    fn only_one_short_line_of_json_may_be_sent() {
        assert!(check_line("{\"type\":\"pause\"}").is_ok());
        assert!(check_line("{}").is_ok());
        for bad in [
            "",
            "pause",
            "[1]",
            "42",
            "\"stop\"",
            "{\"type\":\"a\"}\n{\"type\":\"b\"}",
            "{\"type\":\"a\"}\r",
            "{not json}",
        ] {
            assert!(check_line(bad).is_err(), "should refuse {bad:?}");
        }
        let long = format!("{{\"note\":\"{}\"}}", "x".repeat(MAX_IN_LINE));
        assert!(check_line(&long).is_err(), "too long");
    }

    #[test]
    fn sending_or_stopping_with_nothing_running_says_so_and_changes_nothing() {
        let _serial = crate::JOB_TESTS.lock().unwrap_or_else(|e| e.into_inner());
        assert_eq!(send("{\"type\":\"pause\"}"), Err("The recorder is not running.".to_string()));
        assert_eq!(stop(DEFAULT_STOP_LINE, Duration::from_millis(50)), Ok(false));
        assert!(stop("not json", Duration::from_millis(50)).is_err());
    }
}
