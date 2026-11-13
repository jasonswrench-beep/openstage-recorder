# The installer, and how it is signed

Rewritten 2026-11-13, after the independent security review of the same day. The earlier version of this page (2026-10-25 to 2026-10-28) weighed the ways a program can be signed; that choice is made, and the page now says how the installer is built and signed. The history is in the repository's history.

## What is set up

- `app/src-tauri/tauri.installer.conf.json`: the settings for a Windows installer made with NSIS. It installs for the **current user only** (into the user's own program folder, with no administrator password), puts the recording program, `openstage-capture.exe`, beside the app, and includes `LICENSE.txt`, `NOTICE.txt` and `THIRD-PARTY.md`. The app's icon is on the setup file, the setup window and the uninstaller, and the installer's first and last pages carry a picture of the icon with the product name (`app/src-tauri/installer/sidebar.bmp` and `header.bmp`, made from the icon by `app/tools/make-installer-images.mjs`; the words in them are part of the pictures, and the installer's own pages say everything in words).
- **The web view's setup is inside the installer** (`"webviewInstallMode": { "type": "embedBootstrapper" }`, since 2026-11-13). The window needs Windows' web view (WebView2), which recent Windows 10 and 11 already have. When a computer does not, the installer runs the small setup it carries, which is signed by its maker. It no longer downloads anything while installing.
- The installed app finds the recording program **beside itself, and nowhere else** (`app/core/src/program.rs`; since 2026-11-13 it no longer looks in the folders above it or in the folder it was started from). When it is run from the repository, the launchers in `app/` say where the recording program is with `OPENSTAGE_CAPTURE`.

## Three ways to build it

| Way | Who it is for | Signed | What it does |
|---|---|---|---|
| `python -I app/tools/build_installer.py --sign` | The owner, for a release | Yes | Builds both programs, checks them, signs everything, checks the signatures, and writes `app/dist/release/OpenStage-Recorder-<release>-Setup.exe` with its `.sha256.txt` (see `RELEASING.md`) |
| `app/BUILD INSTALLER.bat` | Anyone who wants to build it themselves: double-click | No | Asks before downloading, builds both programs and the installer, copies it to `app\installer\`, and shows it in a folder window |
| `.github/workflows/build-installer.yml` | A check that it builds on a clean Windows machine | No | Runs the app's checks and `build_installer.py` without `--sign`, and keeps the setup and a portable folder with the run. It cannot publish anything |

### No folder names of the building computer in the programs

A Rust program normally carries the full paths of the files it was built from, for its error messages, and those paths start with the builder's user folder (`C:\Users\<name>\.cargo\...`). All three ways give both programs `--remap-path-prefix` for the user folder, Rust's own folders and the repository, so those paths are written as `/home`, `/cargo`, `/rustup` and `/openstage-recorder`, and tell the linker to name the debug file without its folder (`/PDBALTPATH:%_PDB%`). The flags go in `CARGO_ENCODED_RUSTFLAGS`, which keeps a space in a folder's name whole. Because that setting replaces `capture/.cargo/config.toml`'s own flag (`+crt-static`, which builds the C runtime into the recording program), each way adds that flag back for the recording program.

`build_installer.py` then searches both programs for the user folder's name (as text and as UTF-16, with either kind of slash), and stops if it is there. It also stops if Tauri's installer script would download the web view's setup.

## How a release is signed

The setup file and every program in it are signed with a code-signing certificate in the publisher's own name, **Jason Wrench**, from a cloud code-signing service. Its certificates last three days and are renewed every day, so **every signature carries a timestamp** from the service's timestamp server: a signature with a timestamp stays valid after its certificate runs out, and one without does not, so the build fails if a timestamp is missing.

- `app/tools/sign_windows.py` is the suite's signing script (the same file as in OpenStage Author). It signs one file at a time with Windows' SignTool and the service's signing library, skips files their makers have signed, tries three times, and checks each result. The account's details come from environment variables (the top of the script names them), never from the repository. The sign-in is the owner's own, on the owner's computer.
- `build_installer.py --sign` gives Tauri a sign command that runs that script, so Tauri signs the app, the recording program it packs, the installer's plugins, the uninstaller and the setup file. Then the setup is unpacked with 7-Zip and the setup and every program in it must be signed and timestamped by the same publisher.
- Only files built from this repository are signed. The workflow on GitHub has no signing step and no secrets.

## How to get the workflow's files from GitHub

The workflow keeps its two results with each run, for about three months. They are **unsigned** and are for checking, not for giving to people. You may need to be signed in to GitHub.

1. Open https://github.com/jasonswrench-beep/openstage-recorder/actions
2. Click the newest run called "Build the Windows installer" (it has a green tick when it worked).
3. Scroll to the bottom of that page, to the heading **Artifacts**.
4. Click **OpenStage-Recorder-portable-unsigned** to download the folder as a zip file, or **OpenStage-Recorder-installer-unsigned** to download the setup file as a zip file.
5. Unzip it (right-click, Extract All). Open the folder `OpenStage Recorder` and double-click `OpenStage Recorder.exe`, or double-click the setup file.

A later run is made with "Run workflow" on the same Actions page (choose "Build the Windows installer" on the left, then the grey "Run workflow" button).

## What to check on a real computer

1. Double-click the installer. Windows SmartScreen may still warn on the first downloads of a new signer. If it does, choose **More info**, then **Run anyway**, but only if the file came from the release page and its checksum matches. It should not ask for an administrator password.
2. Right-click the setup file, Properties, Digital Signatures: it should name Jason Wrench and show a timestamp.
3. Is OpenStage Recorder in the Start menu? Does it open? Does "Check this computer" find the recording program?
4. Record ten seconds, edit it, press Play in the editing screen, make a video, and play the video.
5. On the Help tab, press **Check for updates**: it should say whether a newer version is published, in words.
6. Remove it from Settings, Apps, Installed apps. The app and the program should go. **Your recordings must stay** (they are in your own recordings folder, not in the app's folder).
7. Install it again. Does that work cleanly?
8. Do it all with the keyboard only, and with a screen reader if you can: the installer's own pages are made by NSIS, not by this project, and have not been tested for access by anyone here.
