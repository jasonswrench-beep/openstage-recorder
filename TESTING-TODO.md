# What only the owner can check

Things that need a real Windows computer, a real recording, a listener, a screen reader or a decision from the owner. Everything else is checked by `app\RUN CHECKS.bat`. Newest round first. Tick an item by deleting it, or write what you found under it.

## From the development list of 2026-11-15

### Item 1: your checks on the installed app (alpha 4, or the next build)

- [ ] **A real MP4.** Open a recording in the editing screen and press Make a video from this edit. Play the `.mp4` from the recording's `exports` folder in an ordinary video player: picture, your voice, the computer's sound, and the length the editing screen said. Send it if you can; none has been seen yet.
- [ ] **A real WAV.** More ways to finish, then Make a sound file (WAV) from this edit. Listen to it: it should sound like the video's sound and be as long as the video would be.
- [ ] **A real PNG.** Put the playhead somewhere, then Save the picture shown in the preview (PNG). Open it: it should be what the preview shows at that moment.
- [ ] **The pointer.** Record with "Note where the mouse goes and where I click" ticked, then make a video with "Show where the mouse pointer is" ticked. Judge the pointer's colours and size (they are my choices, in `capture/crates/openstage-capture-render/src/cursor.rs`).
- [ ] **A keyboard-only pass**: every tab, the Record screen, a recording, the editing screen, Make a video, and back, without the mouse.
- [ ] **A screen reader pass** with NVDA or Narrator over the same path. Note anything said twice, not said, or said in a confusing way.
- [ ] **Hand `docs/recorder/CARRY-BACK-TO-OPENSTAGE.md` to OpenStage Author's own session** when you are ready. Nothing in Author's repository has been changed from here.

### Item 5: the start key, closing to the notification area, and text and shapes (built 2026-11-15, checked only in a browser with a pretend recorder)

- [ ] **The start key.** Settings, tick "Start a quick recording with Ctrl+Shift+F9 from any program". Go to another program and press Ctrl+Shift+F9: the window should go to the taskbar, the countdown run, and Ctrl+Shift+F11 should stop it, make the video and bring the window back with the video's path copied. Try it with a screen reader running (NVDA, Narrator), and with a program in front that might use the same keys.
- [ ] **The start key comes back after a recording.** After that recording, press Ctrl+Shift+F9 again from another program: a second quick recording should start.
- [ ] **Closing to the notification area.** Settings, tick "Closing the window keeps OpenStage Recorder in the notification area", then close the window with its X and with Alt+F4. It should vanish from the screen and the taskbar and its icon stay beside the clock. Bring it back three ways: clicking the icon; from the keyboard (Windows+B, arrow keys to the icon, Enter); and starting OpenStage Recorder again from the Start menu (it should bring back the same window, not open a second copy).
- [ ] **Quit from the icon's menu** with that box ticked: it should end the program, asking first if a recording is still going.
- [ ] **The start key while the window is put away** in the notification area: Ctrl+Shift+F9 should still start a quick recording, and the window should come back when the video is ready.
- [ ] **Text and shapes in a real video.** In the editing screen, add a Text, a Title, a Lower third, a Highlight box, a Circle and an Arrow from the bar under the picture, give each its words or what it points out, and make a video. Check each is drawn where the preview shows it, and the words are readable.

Decided by the owner on 2026-11-15: the start key starts a quick recording, as built, and both boxes start off (the owner left that to the builder's judgment).

### Alpha 5: build, sign and publish (the owner said yes on 2026-11-15)

- [x] On your computer, signed in to the signing service: `python -I app/tools/build_installer.py --sign`, from a copy of `main` at or after the commit that set `RELEASE` to `0.1.0-alpha.5`. It stops on any problem.
- [x] (Done 2026-11-15: https://github.com/jasonswrench-beep/openstage-recorder/releases/tag/v0.1.0-alpha.5) Publish it as a pre-release with the two files it writes, as `docs/recorder/RELEASING.md` says (a new session can do the `gh release create` step and the checks after it, once the two files exist). The repository is public, so the release is seen by everyone. The notes are in `docs/recorder/RELEASE-NOTES.md`.
- [x] (Installed on the owner's computer 2026-11-15, and all three checked by the owner that day.) After installing it: Settings and the Record screen should show no `C:\Users\<your name>` anywhere; Copy the full path should paste the whole path; Help should end with About OpenStage Recorder, saying 0.1.0 alpha 5.

### The GitHub alert about glib

- [x] (Dismissed 2026-11-15 at the owner's request.) Dismiss alert 1 on the repository's Security tab (Dependabot) as "Vulnerable code is not actually used". Checked 2026-11-15: `cargo tree --target x86_64-pc-windows-msvc -i glib` finds nothing, so glib is only in the Linux build of the window's framework and is not in the Windows program.

### Items 2, 3 and 4: waiting on the shared core

Nothing to check yet. Captions, "Send to" and audio description need C1 and C5 from `openstage-core`, which do not exist there yet; what the Recorder asked for is in `CORE-REQUESTS.md`.
