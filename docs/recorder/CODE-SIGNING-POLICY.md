# Code signing policy

**Status, 2026-10-28: not yet in force.** OpenStage Recorder has not been approved for code signing. Until the SignPath Foundation approves the project and a release is signed, every release is unsigned, and Windows shows its blue "Windows protected your PC" box the first time an installer is run. This page says how signing will work once it is in force, so the policy is written down before the first signed release and not after.

## What the policy will be

Free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org).

The certificate is issued to the SignPath Foundation. A signed file will therefore show the SignPath Foundation as its publisher, not this project.

Only files built from this repository are signed. Files from other projects are never signed with this certificate.

## Team roles

- **Committers and authors:** the owner, Jason S. Wrench ([jasonswrench-beep](https://github.com/jasonswrench-beep)). Most changes are written by an AI coding assistant (Claude) working in sessions the owner starts, and are committed to `main` under the owner's standing permission (`CLAUDE.md`, "Working style"). They appear on GitHub as commits by `claude`.
- **Reviewers:** the owner. There is no second reviewer yet, and no outside contributor whose changes would need one.
- **Approvers:** the owner. Every release is approved by hand in SignPath before it is signed.

## Privacy policy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

What that rests on, read from the project's files on 2026-10-28 and not tested with a network monitor: the program has no accounts and no server, and its window is set to allow no outside connections (the `connect-src` rule in `app/src-tauri/tauri.conf.json`). The one network step is in the installer. If a computer does not have Microsoft's WebView2 runtime, the installer downloads Microsoft's small setup program for it from Microsoft (`webviewInstallMode` in `app/src-tauri/tauri.installer.conf.json`). That download is Microsoft's, under Microsoft's terms.

## How a release is signed

Releases are built from this repository by a GitHub Actions workflow on GitHub's own build machines (`.github/workflows/build-installer.yml`). SignPath checks that the file it is asked to sign was made by that workflow from this repository, and the owner approves each signing request in SignPath. The signing step in the workflow is switched off until the SignPath Foundation approves the project. `docs/recorder/SIGNPATH-APPLICATION.md` says how it is switched on.
