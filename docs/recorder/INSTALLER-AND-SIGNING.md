# The installer, and whether to sign it

Written 2026-10-25. **The installer has been built once, on a Windows machine at GitHub, and the build passed** (the workflow "Build the Windows installer", its first run, 2026-10-25: the recording program took about two and a half minutes, the installer about five and a half, and the result is a 3.2 MB download called `OpenStage-Recorder-installer`, kept by GitHub for about three months). Later runs on 2026-10-26 also passed: run 2 (with the portable folder), run 3 (the installer's icon and pictures, which the installer program accepted) and run 4 (the fix for the silent editing preview), each leaving the installer and the portable folder; the newest run is the one to take. **The owner installed and ran the build from run 1 on 2026-10-26** and found the editing preview silent, which run 4 fixes (not yet heard). Apart from that, **the installer has not been tried on any other computer, and its contents have not been looked inside**: the computer this was written on cannot reach the place the download is kept. `BUILD INSTALLER.bat` has not been run. Before that run, its settings were also checked on Linux by Tauri's own reader.

## What is set up

- `app/src-tauri/tauri.installer.conf.json`: the settings for a Windows installer made with NSIS. It installs for the **current user only** (into the user's own program folder, with no administrator password), puts the recording program, `openstage-capture.exe`, beside the app, and includes `LICENSE.txt`, `NOTICE.txt` and `THIRD-PARTY.md`. The app's icon is on the setup file, the setup window and the uninstaller, and the installer's first and last pages carry a picture of the icon with the product name (`app/src-tauri/installer/sidebar.bmp` and `header.bmp`, made from the icon by `app/tools/make-installer-images.mjs`; the words in them are part of the pictures, and the installer's own pages say everything in words). Added 2026-10-26 after the owner asked for the icon on the installer; the first build had the program's icon but not the installer's own. Windows' web view (WebView2), which the window needs, is downloaded by the installer only if the computer does not already have it; recent Windows 10 and 11 normally do.
- `app/BUILD INSTALLER.bat`: double-click. It asks before downloading, builds the recording program and the app, makes the installer, copies it to `app\installer\`, and shows it in a folder window. It says plainly that the installer is not signed and what Windows will show.
- `.github/workflows/build-installer.yml`: makes the same installer on a Windows machine at GitHub, from what is in the repository (run it by hand from the Actions tab, or push a version tag such as `v0.1.0`). It uses no secret and does not sign.

- **A portable folder**, made by the same workflow run: `OpenStage Recorder.exe`, `openstage-capture.exe` (the recording program), the licence texts and a short `READ ME FIRST.txt`. Unzip it anywhere and double-click `OpenStage Recorder.exe`: nothing is installed, and deleting the folder removes it. It is the same program as the installed one, and equally unsigned.

## How to get the files from GitHub

The workflow keeps its two results with each run, for about three months. No special tools are needed, only a web browser, and you may need to be signed in to GitHub.

1. Open https://github.com/jasonswrench-beep/openstage-recorder/actions
2. Click the newest run called "Build the Windows installer" (it has a green tick when it worked).
3. Scroll to the bottom of that page, to the heading **Artifacts**.
4. Click **OpenStage-Recorder-portable** to download the folder as a zip file, or **OpenStage-Recorder-installer** to download the setup file as a zip file.
5. Unzip it (right-click, Extract All). Open the folder `OpenStage Recorder` and double-click `OpenStage Recorder.exe`, or double-click the setup file.

A later run is made with "Run workflow" on the same Actions page (choose "Build the Windows installer" on the left, then the grey "Run workflow" button). It takes about nine minutes.

The installed app finds the recording program beside itself. `app/core/src/program.rs` already looked there first; only a unit test has shown it.

## What to check on a real computer

1. Run `BUILD INSTALLER.bat`. Does it make a file in `app\installer`? If not, send me what the window shows.
2. Double-click the installer. Windows will probably show a blue "Windows protected your PC" box, because the installer is not signed. Click "More info", then "Run anyway". It should not ask for an administrator password.
3. Is OpenStage Recorder in the Start menu? Does it open? Does "Check this computer" find the recording program?
4. Record ten seconds, edit it, press Play in the editing screen (you should hear your voice; the first installed build played no sound there, fixed 2026-10-26), make a video, and play the video.
5. Remove it from Settings, Apps, Installed apps. The app and the program should go. **Your recordings must stay** (they are in your own recordings folder, not in the app's folder).
6. Install it again. Does that work cleanly?
7. Do it all with the keyboard only, and with a screen reader if you can: the installer's own pages are made by NSIS, not by this project, and have not been tested for access by anyone here.

## Why it is not signed yet, and what that means

An unsigned installer shows Windows' blue "Windows protected your PC" box and "Unknown publisher". People can click through. But computers managed by a school or a company can be set to block unsigned programs outright, or to ask their IT department first, and the first audience for this suite is higher education and business. A signature also shows who made the program, and lets an IT department allow a publisher once instead of one file at a time.

**Signing is a step added at the end of the same build.** Nothing built now has to be redone for it, so there is no reason to wait for a certificate before building the installer.

*Added 2026-10-28:* the SignPath Foundation route was chosen, and the signing step now exists in the workflow, switched off until the repository variable `SIGNPATH_SIGNING` is `true`. It signs the installer file only. `SIGNPATH-APPLICATION.md` has the conditions as SignPath's own pages state them, the draft application answers, and the steps to switch it on.

## The options

| Route | Cost | What it needs | What people see | Cautions |
|---|---|---|---|---|
| Unsigned (now) | Nothing | Nothing | "Windows protected your PC", "Unknown publisher" | May be blocked outright on managed computers |
| SignPath Foundation, for open source | Nothing | An OSI-approved licence (Apache-2.0 is), a public source repository, free downloads, no proprietary code, an actively maintained project, a build made automatically from the repository (the workflow above is that), a published page called "Code signing policy", and (as others report) approval of each signing request | As I understand it, the publisher is shown as the SignPath Foundation, not as OpenStage | Conditions are theirs and can change: check their application page before relying on it. Whether the repository is public matters |
| Microsoft Artifact Signing (called Trusted Signing until recently) | About $9.99 a month for the basic plan (5,000 signatures a month, which is far more than a few installers need) | Identity checking first, which takes some business days. Individuals only in the USA and Canada; organisations in the USA, Canada, the EU and the UK | The checked name: yours, or an organisation's | Microsoft's own pages disagree on how soon the blue box stops appearing for a new publisher, so do not expect it to vanish on the first day. Tauri can sign with it through a custom signing command |
| A certificate from a commercial authority | Usually several hundred dollars a year | Identity checking and a hardware key or a cloud signing service | The checked name | More costly than the Microsoft plan, with the same SmartScreen caution |
| The Microsoft Store | A registration fee I have not checked | A different package type (MSIX) and Microsoft's review | Microsoft signs it | A separate piece of work, and the Store copy cannot be passed around |

## Is the $10 a month worth it?

For six products, yes, in my view, but not yet.

- **It is about one publisher, not six products.** As I read the plan, it is priced by signatures (5,000 a month) and not by product, so one account would sign the whole suite. $120 a year is small against even a few messages from people who cannot install a program, or a campus IT department that will not allow one.
- **Why not today.** There is nothing to sign until the installer has been built and has installed and run on a real computer, and the signing account takes some business days to check an identity. Starting the checking early is fine. Paying for months with nothing to sign is not useful.
- **Two decisions come first, and they are yours:**
  1. **Whose name is the publisher?** An individual account shows a person's legal name. A name such as "OpenStage" needs an organisation (for example a limited company or a non-profit) that can be checked, and an organisation may have to have existed for some time. Is there one, or is one planned?
  2. **Would the free route do?** If the repositories are public and you are content with the SignPath Foundation as the name shown, it costs nothing and fits an open source suite. If you want your own name shown, or do not want to depend on a foundation's approval of each release, pay Microsoft.
- **What I cannot do.** Checking an identity and paying are yours: they need your documents and your money, and I will not do either. I can do everything on the building side: a signing step in the workflow once you have chosen, with the keys kept as secrets at GitHub and never in the repository.

## Sources, read on 2026-10-25

- [Microsoft: code signing options](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options)
- [Microsoft: Artifact Signing](https://azure.microsoft.com/en-gb/products/artifact-signing)
- [Microsoft: Artifact Signing pricing](https://azure.microsoft.com/fr-fr/pricing/details/artifact-signing/)
- [SignPath for open source projects](https://about.signpath.io/product/open-source)
- [SignPath Foundation conditions (a draft)](https://signpath.org/terms)
- [An open source project's code signing policy, as an example](https://pandoc.org/code-signing-policy.html)
- [Tauri bundler release notes (custom Windows signing command)](https://v2.tauri.app/release/tauri-bundler/v2.9.3/)

Prices and conditions change. Check the pages before paying or applying.
