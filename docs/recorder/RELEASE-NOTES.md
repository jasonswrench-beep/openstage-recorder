# OpenStage Recorder: what each release changed

A light, free screen recorder for Windows, with a simple editor. Every release so far is a pre-release. Each release page gives its setup file, the setup's SHA-256, who signed it, and the commit it was built from (`RELEASING.md` says how a release is made).

## 0.1.0 alpha 5 (2026-11-15)

Built and signed on the owner's computer from commit `1007ed8`, and published as a pre-release on 2026-11-15.

- **Seven fixes from testing alpha 4 with the keyboard:** Check for updates keeps the keyboard's place while it checks; when a recording ends the focus goes to its heading instead of a button that has just gone; a name changed to fit a folder is said before Start and when recording starts; the computer check's camera line says what to choose on the Record screen instead of naming a command; a practice offers nothing to edit and its card says it is a practice; Done after a practice switches Practice off, and the next name is never one already used; the clip list's column headings are no longer broken in the middle of a word.
- **No Windows user name on the screens.** Where recordings are kept, and where the recording program is, are said in words, such as "OpenStage Recorder, in Videos, in your user folder", so the user name is not shown to anyone looking at the screen or at a recording of it. **Copy the full path**, in Settings, copies the whole path for anyone who needs it.
- **About OpenStage Recorder**, on the Help tab: which copy this is, who makes it, its licence, and where its source code is.
- **A key that starts a recording from any program.** In Settings, "Start a quick recording with Ctrl+Shift+F9 from any program". Off until you switch it on. It does what Quick record in the icon's menu does.
- **Closing the window can keep the program in the notification area.** In Settings, off until you switch it on. Quit in the icon's menu ends it. Starting OpenStage Recorder again while it runs brings back the window that is running, instead of opening a second copy.
- **Text and shapes in the editor:** Text, Title, Lower third, Highlight box, Circle and Arrow, beside Blur and Cover.

Not tried on Windows yet: everything above was checked only in a browser with a pretend recorder, and none of it has been used with a screen reader.

## 0.1.0 alpha 4 (2026-11-13)

The fixes from an independent security review of 2026-11-13, which found no high or medium problems, and a Check for updates button.

- **Check for updates**, on the Help tab. Only when it is pressed, the program asks GitHub's list of this project's releases whether a newer version is published, and says so in words. If there is one, a second button opens its page in your browser. Nothing is downloaded or installed, and nothing about you or your recordings is sent. Whoever looks after a computer can turn it off (`UPDATE-CHECK.md`). This is the only time the program goes online; the window itself still cannot.
- **No picture of the screen is left in the temporary folder.** Before a recording starts, the recording program wakes the video encoder with a short throwaway file. That file now holds a blank picture instead of the first picture of the screen; it is removed even if the program fails while making it, and one left by a program that was ended is removed the next time the recording program starts.
- **No folder names of the building computer in the programs.** The programs used to carry the full paths of the files they were built from, which begin with the builder's user folder. They are now written as short stand-in names, and the build checks that the user folder's name is not in either program (`INSTALLER-AND-SIGNING.md`).
- **The installer downloads nothing.** It carries the web view's setup, for the rare computer that does not have the web view, instead of fetching it while installing.
- **The recording program is started only with what the window uses.** The app's own code checks every command and option the window asks the recording program to be started with; a file is written only into a recording's folder (a folder whose name ends in `.capture`), and an exported video, sound file or picture only into that recording's `exports` folder.
- **The recording program is found only beside the app** (or where `OPENSTAGE_CAPTURE` says, for development), never in a folder above it or in the folder the app was started from.
- **The window can no longer open web addresses by itself.** Showing a folder and opening a release page are done by the app's own commands, which check what they open.
- **The build workflow on GitHub cannot publish.** It builds unsigned copies for checking; releases are built and signed on the owner's computer, and every program in the setup must be signed and timestamped (`CODE-SIGNING-POLICY.md`).
- Generic names in the tests and the design documents instead of other companies' product names.

Tried after it was published: installed over alpha 3 on the publisher's computer, and Check for updates pressed in the installed window; it works. Not tried yet: nobody else has installed this release, and no screen reader has been used with the Updates section.

## 0.1.0 alpha 3 (2026-11-12)

The same program as alpha 2, and the first signed release: the setup and every program in it signed by Jason Wrench, with timestamps.

## 0.1.0 alpha 2 (2026-11-11)

The OpenStage suite's new look: the navy bar, tabs for Record, Recordings, Settings and Help, and the suite's icons.

## 0.1.0 alpha 1 (2026-11-03)

The first release: recording a screen, part of a screen or one window, with your voice, the computer's sound and a webcam; quick record; hiding windows by their words; the editor (cut, transitions, blur, cover, zoom, a lower third with a logo, the mouse pointer's ring); MP4, WAV and PNG exports. Unsigned.

## What is not done, and what has not been tried, in every release so far

- **No captions.** The program does not make them. It tells you so every time a video is made.
- **Nobody has used it with a screen reader.** It was built to work with the keyboard and a screen reader, and automatic checks prove the names, roles and focus, but how it sounds has not been heard.
- **The icon in the notification area, the clipboard, hiding windows and picking a window by clicking have been tried only against pretend or purpose-made windows**, not in everyday use.
- The suggested zooms and the lower third are untried on a recording of a real screen.

## Licence

Apache-2.0. The libraries inside it and their licences are listed in `NOTICE` and `capture/THIRD-PARTY.md`.
