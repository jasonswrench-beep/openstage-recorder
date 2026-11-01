# OpenStage Recorder 0.1.0: an unsigned test release

A light, free screen recorder for Windows, with a simple editor. This is the first release. **It is a test release: it has not been used by anyone but its maker, nothing in it has been tried with a screen reader, and the installer is not signed**, so Windows will show a blue "Windows protected your PC" box. Choose "More info", then "Run anyway", only if you trust where you got the file. The source is in this repository, and the installer is built from it by the workflow in `.github/workflows/build-installer.yml`, which is the only way these files are made.

## Two ways to run it

- **The installer**, `OpenStage Recorder_0.1.0_x64-setup.exe`: installs the app for your own user, with no administrator password.
- **The portable folder**, `OpenStage-Recorder-portable.zip`: unzip it and double-click `OpenStage Recorder.exe`. Nothing is installed. It needs Microsoft's WebView2 runtime, which Windows 11 already has.

## What it does

- Records a whole screen, part of a screen (by typing four numbers, or by dragging), or one window (chosen from a list, or by clicking it), with your voice, the computer's own sound, and a webcam if you choose.
- **Quick record**: one press to start with the choices on the screen, one to stop, and then the video is made and its path is on the clipboard. The icon in the notification area can start and stop it too, with the window out of the way.
- Hides windows you name (for example a password manager) from the video, by covering them with a plain box before anything is saved.
- Edits what you recorded: cut, split, trim, join, move, transitions, blur, a solid box over private things, zoom (by hand, or suggested from where you clicked), a lower third with a logo, a ring round the mouse pointer.
- Makes an MP4, or only the sound as a WAV file, or a single picture as a PNG.
- Never changes what was recorded: edits are a list of what to keep and what to add.
- No account, no network use, nothing is sent anywhere. The recordings stay on your computer.

## What is not done, and what has not been tried

- **No captions.** The program does not make them. It tells you so every time a video is made.
- **Nobody has used it with NVDA, JAWS or Narrator.** It was built to work with the keyboard and a screen reader, and automatic checks prove the names, roles and focus, but how it sounds has not been heard.
- **The icon in the notification area, the clipboard, hiding windows and picking a window by clicking have been tried only against pretend or purpose-made windows**, not in everyday use. The list of what to try is in `TESTING-TODO.md` of OpenStage Author, the project this was made from.
- **Not signed.** Signing needs an approval from the SignPath Foundation that has not been asked for yet (`docs/recorder/SIGNPATH-APPLICATION.md`).
- The suggested zooms and the lower third are untried on a recording of a real screen.

## Licence

Apache-2.0. The libraries inside it and their licences are listed in `NOTICE` and `capture/THIRD-PARTY.md`.
