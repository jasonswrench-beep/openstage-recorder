# Code signing policy

**In force since 0.1.0 alpha 3 (2026-11-12).** Every published release of OpenStage Recorder is signed. Rewritten 2026-11-13; the version before it described a free signing route that was not used.

## Who signs

The setup file and every program in it are signed by the publisher, **Jason Wrench**, with a code-signing certificate in the publisher's own name from a cloud code-signing service. That is the name Windows shows for the signature. The certificates last three days and are renewed daily, so every signature carries a timestamp, which keeps it valid after its certificate runs out.

Only files built from this repository are signed. Files from other projects are never signed with this certificate; files that their makers have already signed, such as the web view's setup, keep their makers' signatures.

## Team roles

- **Committers and authors:** the owner, Jason S. Wrench ([jasonswrench-beep](https://github.com/jasonswrench-beep)). Most changes are written with an AI coding assistant in sessions the owner starts; the owner decides what is committed and what is released.
- **Reviewers:** the owner, and an independent security review before a release when one is asked for (the latest: 2026-11-13). There is no outside contributor whose changes would need another reviewer.
- **Approvers:** the owner. Nothing is signed or published without the owner's yes.

## Privacy policy

This program does not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

What that rests on, read from the project's files on 2026-11-13: the program has no accounts and no server, and its window may make no outside connections (the `connect-src` rule in `app/src-tauri/tauri.conf.json` allows only the app's own channel). The one network step is **Check for updates** on the Help tab, which happens only when it is pressed: one request from the program to GitHub's list of this project's releases, which sends nothing about the person or their recordings (`UPDATE-CHECK.md`). Whoever looks after a computer can turn it off. The installer carries the web view's setup and downloads nothing.

## How a release is signed

A release is built on the owner's computer from a commit that is already on GitHub, with `python -I app/tools/build_installer.py --sign` (`INSTALLER-AND-SIGNING.md`). It signs the app, the recording program, the installer's plugins, the uninstaller and the setup, then unpacks the setup and checks that every program in it, and the setup, is signed and timestamped by the publisher. The release page gives the setup's SHA-256. The workflow on GitHub only builds unsigned copies for checking and cannot publish (`RELEASING.md`).
