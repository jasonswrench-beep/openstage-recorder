# Requests to the shared core

What OpenStage Recorder needs from `openstage-core` that the core does not offer yet. Nothing here is built in the Recorder in its place: each is waiting on the core. Read the core's `CORE-NOTES.md` for what it offers now. Newest first.

Asked 15 November 2026, for the Recorder's development list of that day (items 2, 3 and 4). Core state when asked: `CORE-NOTES.md` of 2026-11-15 (second round, public). It lists the packages for C1, C2 and C4 as "Not started (priority 3)", and has no entry for C5; the roadmap puts the Recorder's round "next, together" with OpenExplainer and PrismQDA, once priority 3 has the C1 package.

## 1. C5, the speech engine: captions from speech (list item 2) and spoken audio description (list item 4)

The Shared Core Development List says C5 is built inside OpenStage Author (local captions from speech, text-to-speech narration and audio description, behind plugin contracts) and that the work is to lift it out so the Recorder, Studio, Rehearse and Scroll share one install of the voice and speech models. Neither the engine nor a spec for it is in the core yet. What the Recorder needs from it:

- **Speech to timed text.** Given a WAV file (the Recorder has the microphone as `mic.wav` in each take, 48 kHz) and a language (the project's BCP 47 `language`), timed cues: start and end in milliseconds of the take's clock, and the words. Run on the computer, nothing sent anywhere. A way to show progress and to cancel, since a recording can be an hour long.
- **Text to speech** for audio description: given a sentence and a voice, a WAV file and its length, so the Recorder can place it and say whether it fits the gap it is meant for.
- **Asking whether a model is installed**, and where to install it, so every tool shares one copy. With no model installed every feature still works: captions and descriptions are typed by a person, and the Recorder says plainly which parts need a model.
- **How a tool calls it.** The Recorder is a Tauri app with a Rust shell that already starts one separate program (`openstage-capture`) and talks to it one line of JSON at a time. A program of the same kind, or a Rust crate, would both fit. Licences: the engine and any model must pass the Recorder's rule (permissive, LGPL only dynamically linked, no GPL or AGPL), and open weights audited one by one.
- **A test set**: a short WAV with the expected cues within a stated tolerance, so the Recorder and Author are held to the same results.

## 2. C1, the capture format: what the caption, transcript and audio description tracks hold (list items 2 and 4)

`capture.json` has had `tracks.captions`, `tracks.transcript` and `tracks.audioDescription` since schema 0.1, and `docs/capture/capture-project-format.md` says "their contents are defined in later versions; in 0.1 they are empty". They are still empty in both the Recorder and OpenStage Author (schema 0.2.5; Author keeps its captions in its course model, not in the recording). Filling them is a format change, which the core's rules say starts in the core, with a new revision, before either tool writes it. The Recorder needs:

- **The shape of a caption cue and of an audio description cue** in the recording folder: where they live (`capture.json`'s tracks, or `edit.json`, since a cut moves every later cue), their times (the take's clock or the edit's), their text, language, and whether each was typed by a person or came from a model and has not been checked yet.
- **How cues follow the edit** when clips are cut, trimmed and moved, so a video made from the edit and its caption file agree.
- **What the video maker writes beside the MP4**: a WebVTT file of the same name (`<name>.vtt`, which most players find on their own), and for descriptions a `kind: descriptions` WebVTT file and, once C5 speaks them, the spoken description mixed into the sound or as a second sound file.
- **The schema version and the migration**, so a recording with captions made in the Recorder opens in OpenStage Author and the other way round, and an older reader refuses it in plain words rather than drop the captions.
- **The package**: a reader and writer for the recording folder format in TypeScript (the Recorder's edit model and screens are TypeScript; its recording program and shell are Rust), with the format's conformance files.

Until then the Recorder keeps saying, when a video is made, that it has no captions, as it does now.

## 3. C1, the "send to" path: a recording opened in OpenExplainer, OpenStage Studio or OpenStage Author (list item 3)

The Shared Core Development List gives C1 a "send to" path, so one capture opens as a guide, a video or a simulation. Today the recording folder format is shared with OpenStage Author only, OpenExplainer and Capture Express keep step formats of their own, and the core has no package or spec for sending. The Recorder needs, before it builds a "Send to" button:

- **What is sent**: the whole `.capture` folder, a copy of it, or a reference to it; and whether the receiving tool may write into it (the Recorder's rule is that editing never changes the original recording).
- **How the Recorder finds which of the tools are installed** and starts the right one with the recording (a file association, a registered command, or a small hand-off file), without the Recorder knowing each tool's install folder.
- **What each receiving tool needs from the recording** that the Recorder may not write today: OpenExplainer's steps, for example, come from the interaction log, which the Recorder only writes when "Note where the mouse goes and where I click" is ticked, and never with keys.
- **Provenance**: the link the receiving tool keeps back to the recording, so re-recording a step can update what was made from it, as the Shared Core list describes. The Recorder only needs to know whether it must write anything for that.
- A note on scope: the Recorder's own rules rule out anything bidirectional with other products, so the Recorder would only send, never receive.
