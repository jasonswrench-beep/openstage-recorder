# How a release is made

This is the owner's standing release rule, written down so any session or person follows it. It was given on 2026-11-03.

## When

Whenever a new Windows installer is built, the checks pass, and the installer has been checked, it is published as a GitHub release.

**This repository is public**, so a release is visible to everyone. The owner is asked first, and told that the repository is public, every time. A release is never made without his yes. (For a private repository the rule is to go ahead without asking. Nobody makes a repository public except the owner.)

## How

On GitHub: Actions, "Build the Windows installer", "Run workflow", and choose **release**:

- **no**: only build (the default).
- **dry-run**: do everything except publish, and say in notices on the run what would be published: the tag, the title, the commit, the file name and its SHA-256.
- **publish**: make the release.

The workflow runs the app's own checks (type check and tests) on the Windows machine first, then builds the installer from **exactly the commit that was pushed**, and publishes a **pre-release** whose tag points at that commit.

## The rules it follows

1. The commit the installer is built from is pushed first. The tag points at that exact commit (the full hash).
2. The version is the app's version number with `-alpha.N` while nobody has run the installer by hand, for example `v0.1.0-alpha.1`. The workflow uses the next number each time, from the tags that exist. **A tag is never reused or moved**, and the workflow stops if the tag already exists. (If the alpha rule stops fitting, change it here and in the workflow, with the owner.)
3. It is a pre-release. The title is "OpenStage Recorder X.Y.Z alpha N".
4. Only two files are attached: the setup `.exe` and its `.sha256.txt`. Nothing else: not the portable zip, not logs. (GitHub changes the spaces in a file name to dots, so the installer is `OpenStage.Recorder_X.Y.Z_x64-setup.exe`.)
5. The notes are in plain words with no em dashes. They give the two file names, the full SHA-256, that the installer is unsigned and Windows may say "unknown publisher" (More info, then Run anyway), what has NOT been tried, and the commit it was built from. The words are in `RELEASE-NOTES-ALPHA.md`: keep "what has NOT been tried" true.
6. After it is created, it is checked: that the tag points at the right commit, that GitHub's own SHA-256 of the installer is the one that was computed, that there are exactly two files, that it is a published pre-release, and that the repository is still public (as authorized). The workflow checks the first four itself and stops with an error if one is wrong. A person or session also looks at the release page and gives the owner the link and says what was checked.
7. Where a check cannot be done from where a session runs (for example downloading the installer back and hashing it, when the network blocks GitHub's file storage), the report says so plainly, and does not say it was done.

## Releases so far

- **v0.1.0-alpha.1**, published 2026-11-03 as a pre-release, built from commit `a4ce118d8e0937eaab3a5ba29c66483b324cbe1b` by run 7 of the workflow (a dry run, run 6, was done first). The installer is `OpenStage.Recorder_0.1.0_x64-setup.exe` (3,568,266 bytes), SHA-256 `0c517a37e0df5c2970023c0b2df5ac20f88f650dce3a08614a3cbcd7c8ee059c`. Checked afterwards with GitHub's API: a published pre-release, the tag points at that commit, exactly two files, GitHub's hash of the installer is the hash in the notes, no em dash in the notes, the repository public as authorized. The installer was also downloaded back from GitHub and hashed, and the hash matched, and the `.sha256.txt` line matched too. Nobody has run this exact build, and it is unsigned.

## The earlier draft

`v0.1.0` exists as a **draft** pre-release made on 2026-11-01 by the tag-push step of the same workflow (an unsigned test release with the installer and the portable zip). It was made before this rule. It has not been published and has not been changed. The owner decides what to do with it.

## Signing

When the SignPath Foundation approves the project and signing is switched on (`SIGNPATH_SIGNING`), the release step stops until `RELEASE-NOTES-ALPHA.md` and the step are updated, because they say the installer is unsigned. See `SIGNPATH-APPLICATION.md`.
