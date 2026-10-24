// SPDX-License-Identifier: Apache-2.0
// Recording: the part that starts the recorder, sends it commands, listens to its keys and follows what it says.
//
// The dialog (recorderdialog.ts) only shows what this holds and calls its methods, so a recording goes on when the dialog is closed, and the
// same recorder can be asked for a list of its screens, then recorded, then asked to repair a take, one job at a time. Everything here talks to
// the recorder through the small part of the backend that streams, so it can be tested against a stand-in without recording anything.

import type { RecorderBackend } from "./backend.ts";
import { DEFAULT_HOTKEYS, type HotkeyBinding, type StreamExit } from "./recorder.ts";
import {
  applyLine, commandLine, formatTime, initialSession, keyAction, recordArgs, settingsProblem, STOP_LINE,
  type Phase, type RecordSettings, type Session,
} from "./capturesession.ts";

export type CaptureBackend = Pick<
  RecorderBackend,
  "streamStart" | "streamSend" | "streamStop" | "streamSetPaused" | "streamState" | "onStreamLine" | "onStreamExit" | "hotkeysSet" | "hotkeysClear" | "onHotkey"
>;

const why = (err: unknown): string => (err instanceof Error ? err.message : String(err));

export interface OneShot {
  /** Every line the recorder printed. */
  lines: string[];
  /** How it ended, or null if it could not be started or did not end. */
  exit: StreamExit | null;
  /** Why it could not be run, in words; empty if it ran to its end. */
  problem: string;
}

/** How long a short job (a list, a check, a repair) may take before it is stopped. */
export const ONE_SHOT_LIMIT_MS = 60_000;

/**
 * How long a short job waits for another one to finish before it gives up. The recorder dialog asks the recorder for its list of screens and sounds when it
 * opens, which can take several seconds, and the shell runs one thing at a time, so a video made at once would otherwise be told "a recording is already in
 * progress" when none was.
 */
export const BUSY_WAIT_MS = 20_000;
const BUSY_RETRY_MS = 400;

const isBusy = (err: unknown): boolean => /already in progress/i.test(why(err));

const BUSY_WORDS = "The recorder is busy with something else, such as a recording that is still going or a list it is still making. Wait a moment, or stop the recording, and try again.";

/**
 * Run the recorder for one short job and collect what it prints. It never throws: a failure is in `problem`.
 *
 * The shell runs one job at a time, and tells the page that a job has ended before it lets the next one begin. So if another short job is still running (the list of windows,
 * a check), this waits until the recorder says it is free (up to `busyWaitMs`) and only then starts listening: what the job before it printed, and how it ended, are never
 * taken for this job's. If someone else takes the slot in the moment between, whatever was heard is thrown away and it waits again.
 */
export async function runOneShot(b: CaptureBackend, args: string[], onLine?: (line: string) => void, limitMs = ONE_SHOT_LIMIT_MS, busyWaitMs = BUSY_WAIT_MS): Promise<OneShot> {
  const lines: string[] = [];
  let done: Promise<StreamExit> = new Promise<StreamExit>(() => {});
  let offLine: (() => void) | undefined;
  let offExit: (() => void) | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const detach = (): void => {
    offLine?.();
    offExit?.();
    offLine = undefined;
    offExit = undefined;
  };
  const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, BUSY_RETRY_MS));
  try {
    const began = Date.now();
    for (;;) {
      while ((await b.streamState().catch(() => ({ running: false, paused: false }))).running) {
        if (Date.now() - began >= busyWaitMs) throw new Error(BUSY_WORDS);
        await pause();
      }
      let ended: (exit: StreamExit) => void = () => {};
      done = new Promise<StreamExit>((resolve) => { ended = resolve; });
      lines.length = 0;
      const heard: string[] = [];
      let early: StreamExit | null = null;
      let live = false;
      offLine = await b.onStreamLine((line) => { if (live) { lines.push(line); onLine?.(line); } else heard.push(line); });
      offExit = await b.onStreamExit((exit) => { if (live) ended(exit); else early = exit; });
      try {
        // What comes while the start is being answered is this job's only if the start works (if it was refused it belongs to whoever holds the slot), so it is kept back
        // and passed on, in order, once the start has been accepted.
        await b.streamStart(args);
        for (const line of heard) { lines.push(line); onLine?.(line); }
        live = true;
        if (early !== null) ended(early);
        break;
      } catch (err) {
        live = false;
        detach();
        lines.length = 0;
        if (!isBusy(err)) throw err;
        if (Date.now() - began >= busyWaitMs) throw new Error(BUSY_WORDS);
        await pause();
      }
    }
    const timeout = new Promise<null>((resolve) => {
      timer = setTimeout(() => {
        void b.streamStop().catch(() => false);
        resolve(null);
      }, limitMs);
    });
    const exit = await Promise.race([done, timeout]);
    if (exit === null) return { lines, exit: null, problem: "It did not finish in time, so it was stopped." };
    return { lines, exit, problem: "" };
  } catch (err) {
    return { lines, exit: null, problem: why(err) };
  } finally {
    clearTimeout(timer);
    detach();
  }
}

export type Listener = (session: Session, say: string[]) => void;

/** The keys that work from any program while a recording goes on. "start" is not among them: a recording starts from the dialog. */
export const SESSION_KEYS: HotkeyBinding[] = DEFAULT_HOTKEYS.filter((k) => k.id !== "start").map(({ id, keys }) => ({ id, keys }));
const KEY_LABELS = new Map(DEFAULT_HOTKEYS.map((k) => [k.id, k.label.toLowerCase()]));

const BUSY: ReadonlySet<Phase> = new Set(["starting", "countdown", "recording", "paused", "stopping"]);

export class RecorderController {
  private s: Session = initialSession();
  private readonly listeners = new Set<Listener>();
  private offs: (() => void)[] = [];
  private wasPaused = false;

  private readonly b: CaptureBackend;

  constructor(backend: CaptureBackend) {
    this.b = backend;
  }

  get session(): Session {
    return this.s;
  }

  /** A recording is going: from the first moment of starting until it has finished or failed. */
  get busy(): boolean {
    return BUSY.has(this.s.phase);
  }

  /** Be told each time something changes, with what to say aloud. Returns a function that stops listening. */
  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private publish(session: Session, say: string[] = []): void {
    this.s = session;
    for (const l of [...this.listeners]) l(session, say);
  }

  /** Forget a finished or failed recording, so the dialog shows the choices again. */
  dismiss(): void {
    if (!this.busy) this.publish(initialSession());
  }

  /** Start recording. Returns why it could not be started, or null if the recorder was started. */
  async start(settings: RecordSettings, folder: string): Promise<string | null> {
    if (this.busy) return "A recording is already going.";
    const problem = settingsProblem(settings);
    if (problem) return problem;
    this.publish({ ...initialSession(folder), phase: "starting" }, ["Starting the recorder."]);
    try {
      this.offs.push(await this.b.onStreamLine((line) => this.line(line)));
      this.offs.push(await this.b.onStreamExit((exit) => void this.exited(exit)));
      this.offs.push(await this.b.onHotkey((id) => this.key(id)));
      await this.armKeys();
      await this.b.streamStart(recordArgs(settings, folder));
    } catch (err) {
      await this.fail(`The recorder could not be started. ${why(err)}`);
    }
    return null;
  }

  /** Register the keys that work from any program, and say which could not be used. They are a convenience: the buttons always work. */
  private async armKeys(): Promise<void> {
    const notes: string[] = [];
    try {
      const results = await this.b.hotkeysSet(SESSION_KEYS);
      for (const r of results) {
        const binding = SESSION_KEYS.find((k) => k.id === r.id);
        if (!r.ok) notes.push(`The key ${binding?.keys ?? r.id} (${KEY_LABELS.get(r.id) ?? r.id}) could not be used: ${r.message} You can still use the buttons.`);
      }
      if (results.length > 0 && notes.length === 0) {
        const keys = SESSION_KEYS.map((k) => `${k.keys} ${KEY_LABELS.get(k.id) ?? k.id}`).join(", ");
        this.publish({ ...this.s, notes: [...this.s.notes, { ok: true, text: `Keys that work from any program while recording: ${keys}.` }] });
      }
    } catch (err) {
      notes.push(`The keys that work from any program could not be set up. ${why(err)} You can still use the buttons.`);
    }
    if (notes.length > 0) this.publish({ ...this.s, notes: [...this.s.notes, ...notes.map((text) => ({ ok: false, text }))] }, notes);
  }

  private line(line: string): void {
    const before = this.s.phase;
    const { session, say } = applyLine(this.s, line);
    if (session === this.s && say.length === 0) return;
    this.publish(session, say);
    if (session.phase === "paused" && !this.wasPaused) {
      this.wasPaused = true;
      void this.b.streamSetPaused(true).catch(() => undefined);
    } else if (session.phase !== "paused" && this.wasPaused) {
      this.wasPaused = false;
      void this.b.streamSetPaused(false).catch(() => undefined);
    }
    if ((session.phase === "finished" || session.phase === "failed") && before !== session.phase) void this.clearKeys();
    // A recorder that cannot be trusted (it speaks another version) has sent no result and is still running: end it.
    if (session.phase === "failed" && before !== "failed" && session.result === null) void this.b.streamStop(STOP_LINE).catch(() => false);
  }

  private async clearKeys(): Promise<void> {
    await this.b.hotkeysClear().catch(() => undefined);
  }

  private detach(): void {
    for (const off of this.offs.splice(0)) off();
  }

  /** The recorder has ended. If it never sent its result, it did not end properly: say so, and repair what it recorded. */
  private async exited(exit: StreamExit): Promise<void> {
    this.detach();
    await this.clearKeys();
    if (this.wasPaused) {
      this.wasPaused = false;
      void this.b.streamSetPaused(false).catch(() => undefined);
    }
    if (!this.busy) return;
    const tail = exit.stderr_tail.trim().split(/\r?\n/).slice(-3).join(" ").trim().slice(0, 400);
    const hadStarted = this.s.take > 0 && this.s.folder !== "";
    // The recorder's own explanation, if it gave one before it ended, is better than a general one.
    await this.fail(this.s.problem !== "" ? this.s.problem : `The recorder stopped before it finished${exit.killed ? " and had to be ended" : ""}.${tail ? ` It said: ${tail}` : ""}`);
    if (hadStarted) await this.repair();
  }

  /** Repair the recording folder after the recorder ended without finishing. A recording loses at most about a second. */
  private async repair(): Promise<void> {
    const folder = this.s.folder;
    const job = await runOneShot(this.b, ["recover", "--project", folder]);
    const notes: string[] = [];
    for (const line of job.lines) {
      try {
        const d = JSON.parse(line) as Record<string, unknown>;
        if (d["event"] === "recovered" && typeof d["take"] === "number") {
          const ms = typeof d["durationMs"] === "number" ? d["durationMs"] : 0;
          const lost = typeof d["maxLossMs"] === "number" ? d["maxLossMs"] : 0;
          notes.push(`Take ${d["take"]} was repaired and kept: ${formatTime(ms)}. At most ${formatTime(lost) === "0 seconds" ? "a moment" : formatTime(lost)} of the end could be missing.`);
        }
      } catch {
        // not a line of JSON: ignore it, as the protocol says
      }
    }
    if (notes.length === 0) notes.push(job.problem === "" ? "Nothing needed repairing." : `The recording could not be repaired. ${job.problem}`);
    this.publish({ ...this.s, notes: [...this.s.notes, ...notes.map((text) => ({ ok: true, text }))] }, notes);
  }

  private async fail(problem: string): Promise<void> {
    this.detach();
    await this.clearKeys();
    this.publish({ ...this.s, phase: "failed", problem, notes: [...this.s.notes, { ok: false, text: problem }] }, [problem]);
  }

  // ---- what the author can do

  private say(message: string): void {
    this.publish(this.s, [message]);
  }

  private async send(command: "pause" | "resume" | "restart", label = ""): Promise<void> {
    try {
      await this.b.streamSend(commandLine(command, label));
    } catch (err) {
      this.say(`The recorder could not be told. ${why(err)}`);
    }
  }

  /** Pause or resume, whichever fits. */
  async togglePause(): Promise<void> {
    await this.act(this.s.phase === "paused" ? "resume" : "pause");
  }

  async act(action: "pause" | "resume" | "stop" | "restart"): Promise<void> {
    const phase = this.s.phase;
    const live = phase === "recording" || phase === "paused";
    if (action === "stop") {
      if (phase === "starting" || phase === "countdown" || live) await this.b.streamStop(STOP_LINE).catch(() => false);
      else this.say("Nothing is recording.");
    } else if (action === "pause") {
      if (phase === "recording") await this.send("pause");
      else this.say("Pause works only while recording.");
    } else if (action === "resume") {
      if (phase === "paused") await this.send("resume");
      else this.say("Resume works only while paused.");
    } else if (live) {
      await this.send("restart");
    } else {
      this.say("Starting again works only while recording.");
    }
  }

  /** Add a marker at this moment, with a few words if the author wants. */
  async marker(label = ""): Promise<void> {
    if (this.s.phase !== "recording" && this.s.phase !== "paused") {
      this.say("Markers can only be added while recording.");
      return;
    }
    try {
      await this.b.streamSend(commandLine("marker", label));
    } catch (err) {
      this.say(`The marker could not be added. ${why(err)}`);
    }
  }

  private key(id: string): void {
    const action = keyAction(id, this.s.phase);
    if ("say" in action) this.say(action.say);
    else void this.act(action.cmd);
  }
}
