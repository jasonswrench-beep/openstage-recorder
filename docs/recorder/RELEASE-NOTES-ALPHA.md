# OpenStage Recorder {{VERSION}} alpha {{N}}

A light, free screen recorder for Windows, with a simple editor. This is a pre-release for testing, not a finished version. It is free and open source under the Apache License 2.0.

## The two files

- `{{INSTALLER}}`: the installer. It installs OpenStage Recorder for your own user, and does not ask for an administrator password.
- `{{INSTALLER}}.sha256.txt`: the SHA-256 hash of the installer, so you can check that the file you downloaded is the file that was built.

The full SHA-256 of the installer is:

`{{HASH}}`

## The installer is not signed

Windows may say "Windows protected your PC" or "unknown publisher". That is because the installer is not signed yet. Choose "More info", then "Run anyway", only if you trust where you got the file and its hash matches the one above.

## What has NOT been tried

- This exact build had not been run by anyone when it was published. Earlier builds were run by the project's owner on one Windows computer, and that is the only computer anything has been tried on.
- No screen reader (NVDA, JAWS or Narrator) has been used with it. It was built to work with the keyboard and a screen reader, and automatic checks look at names, roles and focus, but nobody has heard how it sounds.
- The installer's own pages, which are made by a tool called NSIS and not by this project, have not been tried with a keyboard only or a screen reader.
- A video made from the editing screen with all the tools together (blur, cover, zoom, transitions, the webcam's corner, the sound balance, the pointer ring and the lower third) has not been checked from start to finish. The project's notes record no such check.
- Quick record, the icon in the notification area, the clipboard, hiding windows, choosing a window by clicking it, suggested zooms and the lower third have been tried only against pretend or purpose-made windows, not in everyday use.
- It makes no captions. It tells you so every time a video is made.

## Built from

Commit `{{COMMIT}}` of this repository. The installer was built on a GitHub Windows machine by the workflow in `.github/workflows/build-installer.yml`: {{RUN_URL}}

The source is in this repository. The libraries inside the installer and their licences are listed in `NOTICE` and `capture/THIRD-PARTY.md`.
