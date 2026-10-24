# OpenStage Recorder

A light, free screen recorder for Windows, with a simple editor. Apache 2.0. Made by the OpenStage Author project, but a product of its own: it has no courses, slides, quizzes or publishing, and runs without OpenStage Author installed.

Name: the product is OpenStage Recorder. The recorder inside OpenStage Author is called OpenScreen; do not mix the two names. The recording program and its crates keep the name `openstage-capture`, because they are shared with OpenStage Author on purpose.

Read `docs/recorder/plan.md` first. It says what is in the product, what is not, and the order of the work.

## What this is not

Not a course tool. Not a full or professional video editor. Not a cloud service. No accounts, no server.

## Where the code came from

`capture/`, `capture-edit/`, `capture-timeline/` and `docs/capture/` were copied from OpenStage Author (`jasonswrench-beep/openstage-author`, main, commit 01fc056). `docs/recorder/IMPORT-MANIFEST.md` lists every file and its checksum. Their paths are the same as in OpenStage Author so that a fix in one can be carried to the other by comparing like with like.

- Change those four folders only when the product needs it, and say so in the summary. Every change there is a difference that someone has to carry across later.
- Never edit OpenStage Author's own repository from here without the owner's yes.
- New work for this product goes in new folders (`app/` is the window and the screens), not inside the copied ones, unless there is no other way.
- `app/` took parts from OpenStage's editor. `docs/recorder/EXTRACTED-FROM-OPENSTAGE.md` says which, and what changed.

## Non-negotiable rules

### Accessibility

- ATAG Part A applies to the editor and recorder themselves. Every feature must be fully keyboard operable and usable with a screen reader. A feature that is not is not finished.
- Never introduce a keyboard trap. Every dialog, panel and window must be closable by keyboard alone.
- When a change could affect keyboard access, focus order or screen reader output, say so explicitly in the summary.
- Never claim something works with NVDA, Narrator, JAWS or VoiceOver, or on Windows, until the owner has run it and said so. Type-checking Windows-only code from Linux says only that it compiles.
- A video made with this product may have no captions. The product must say so in plain words when an export finishes, rather than leave it unmentioned.

### Licensing

This project is Apache 2.0. Apache 2.0 cannot incorporate GPL or AGPL code: the combined work would have to ship under the GPL. Treat a copyleft licence as a hard stop for anything linked, vendored or copied. Running a GPL tool the user installed, as a separate process, is a different question.

Before adding any dependency, check its licence. Permissive (MIT, BSD, Apache 2.0, ISC) is fine. LGPL is dynamic-linking only. GPL and AGPL are refused. Open model weights are not automatically open source, so audit those one by one. Record anything adopted in `NOTICE` with its attribution. `capture/tools/check_rules.py` enforces this for the Rust dependencies on every change.

**FFmpeg is not used.** Do not adopt a third-party recorder's code: ShareX, Cap and Recordly are copyleft.

### Architecture

- Rust for the recording program (screen capture needs native code). TypeScript for the edit model and screens. The shell is Tauri.
- Windows first. Windows-only code can be type-checked from Linux (`cargo check --target x86_64-pc-windows-msvc`); how it behaves is only known from a run on Windows.
- The recording folder format (`lesson.capture`, with `capture.json`, `edit.json` and takes) is the same as in OpenStage Author, so a recording made in one opens in the other. `docs/capture/capture-project-format.md` and `docs/capture/capture-edit-format.md` are the source of truth. Change them in the same commit as any code that reads or writes the formats.
- Editing never changes the original recording. Edits are stored on top of it.

## Out of scope: do not build these

- Courses, slides, quizzes, SCORM, publishing, or anything that makes a learning package.
- Cloud features, accounts, hosting, sign-in.
- Voice cloning.
- Bidirectional anything with other products.

## Working style

- Explain what changed in plain language. Do not assume familiarity with JavaScript or Rust tooling.
- Anything that needs running should be delivered as a double-clickable script, not as a terminal command to copy.
- Avoid em dashes in prose written for this project.
- When a decision could reasonably go either way, say so and ask rather than picking silently.
- Commit and push only when the owner says so.
