# Check for updates

OpenStage Recorder has a **Check for updates** button on the Help tab, in the section called Updates. It works the same way as in the other tools of the OpenStage suite. Added 2026-11-13.

## What it does

* **Only when asked.** Nothing is checked when the program starts or on a timer, and nothing runs in the background.
* **Notify only.** It says, in words in the section's status line, whether a newer version is published and, if so, offers a button that opens that release's page (what changed, the checksum and the signed setup) in the person's own browser. It downloads and installs nothing. Running the new setup updates the copy in place and keeps the recordings and the settings.
* **Where it looks.** One HTTPS request from the program to
  `https://api.github.com/repos/jasonswrench-beep/openstage-recorder/releases?per_page=30`, made with Windows' own HTTPS code (WinHTTP): no redirects followed, no cookies, at most 2 MB read, and 15 seconds for each step. Pre-releases count, because every release so far is one; drafts never do. The request carries only a plain name for the program (`OpenStageRecorder-update-check`); nothing about the person or their recordings is sent.
* **The window still cannot reach the network.** The request is made by the program's own code (`app/core/src/updates.rs`), not by the page, and the window's content security policy is unchanged: it allows only the app's own channel. No web library was added to the program.
* **What it compares.** The exact release this copy was built as, which the release build records in the program (`RELEASE` in `app/tools/build_installer.py`, passed as `OPENSTAGE_RELEASE`; raise it for every release), with the highest published tag (`vMAJOR.MINOR.PATCH`, or `-alpha.N`, `-beta.N` or `-rc.N` after it; a final release sorts after its pre-releases). The Updates section says which release this copy is. A copy built another way (`BUILD INSTALLER.bat`, the workflow, or the launchers) is told the newest published version instead.
* **Links.** Only a release page of this repository (`https://github.com/jasonswrench-beep/openstage-recorder/releases/tag/v...`) or the list of releases is ever offered, and the program's own command that opens it refuses any other address. The window has no permission to open addresses itself.
* **Turning it off.** Whoever looks after the computer can set the environment variable `OPENSTAGE_UPDATE_CHECK=off`, or put a file called `update-check.txt` containing `off` in the program's folder. The section then says that checking is turned off on this computer and asks nothing.
* **Signing.** No separate update key is needed, because nothing is installed automatically. The setup itself is signed with the publisher's code-signing certificate, and the release page carries its SHA-256.

## Code and tests

* `app/core/src/updates.rs` (the versions, the request, the answers, the switch, and which pages may be opened); the commands `recorder_release`, `check_for_updates` and `open_release_page` in `app/src-tauri/src/lib.rs`; `app/src/updates.ts` (reading the answer, and which pages may be offered) and the Updates section in `app/src/shell.ts`.
* Tests: `updates.rs` (sorting, the answers, drafts, the release pages, the switch), `app/src/updates.test.ts`, and the browser check "Check for updates on the Help tab ...", against the preview's pretend answer. None of these reaches the network. One more test in `updates.rs` reads the real list from GitHub and shows that a redirect is refused, not followed; it runs only by hand (`cargo test -- --ignored` in `app/core`).
