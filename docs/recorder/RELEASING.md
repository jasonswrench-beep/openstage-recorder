# How a release is made

This is the owner's standing release rule, written down so any session or person follows it. It was given on 2026-11-03 and changed on 2026-11-13: since then a release is built and signed on the owner's computer, and the GitHub workflow only builds unsigned copies for checking.

## When

Whenever a new Windows installer is built, the checks pass, and the installer has been checked, it is published as a GitHub release.

**This repository is public**, so a release is visible to everyone. The owner is asked first, and told that the repository is public, every time. A release is never made without the owner's yes. (Nobody makes a repository public except the owner.)

## How

1. Raise `RELEASE` in `app/tools/build_installer.py` to the new version, for example `0.1.0-alpha.4`. Check for updates compares it with the published releases (`UPDATE-CHECK.md`).
2. Run the checks (`app/RUN CHECKS.bat`, `cargo test` in `app/core`, `app/src-tauri` and `capture`, `python -I app/tools/check_app_licences.py` and `capture/tools/check_rules.py`), commit, run `python -I app/tools/check_commit_identity.py` (the author, the committer and the message of every commit not yet pushed), and push the commit to `main` first.
3. Tag that commit before anything is built (the owner's rule, 2026-11-17): `git tag v<release> <full commit hash>` and `git push origin refs/tags/v<release>`, with nothing uncommitted. Then build from a clean copy at that tag.
4. On the owner's computer, signed in to the signing service, with the account's details in the environment (the top of `app/tools/sign_windows.py` names them): `python -I app/tools/build_installer.py --sign`. It stops on any problem. It writes `app/dist/release/OpenStage-Recorder-<release>-Setup.exe` and its `.sha256.txt`.
5. Make the pre-release with exactly those two files, on the tag made in step 3 (`--verify-tag`, so a missing tag stops it instead of making a new one):
   `gh release create v<release> --repo jasonswrench-beep/openstage-recorder --verify-tag --prerelease --title "OpenStage Recorder X.Y.Z alpha N" --notes-file <notes> <setup> <setup>.sha256.txt`
   Pushing the tag starts the workflow, which only builds; it makes no draft.

## The rules it follows

1. The commit the installer is built from is pushed and tagged first, before the build. The tag points at that exact commit. **A tag is never reused or moved**, apart from the two moves the owner asked for on 2026-11-17 (below).
2. The version is the app's version number with `-alpha.N` while nobody has run the installer by hand, for example `v0.1.0-alpha.4`, the next number each time. (If the alpha rule stops fitting, change it here, with the owner.)
3. It is a pre-release. The title is "OpenStage Recorder X.Y.Z alpha N".
4. Only two files are attached: the setup `.exe` and its `.sha256.txt`. Nothing else: not the portable zip, not logs.
5. The notes are in plain words with no em dashes and no product names of other companies. They give the two file names, the full SHA-256, who signed it, what has NOT been tried, and the commit it was built from.
6. After it is created, it is checked: that the tag points at the right commit, that GitHub's own SHA-256 of the installer is the one that was computed, that there are exactly two files, that it is a published pre-release, and that the downloaded copy is signed. The installer is downloaded back from GitHub and hashed. The owner is given the link and told what was checked.
7. Where a check cannot be done from where a session runs, the report says so plainly, and does not say it was done.

## Releases so far

- **v0.1.0-alpha.1**, 2026-11-03, built from commit `a4ce118` by the workflow. `OpenStage.Recorder_0.1.0_x64-setup.exe`, SHA-256 `0c517a37e0df5c2970023c0b2df5ac20f88f650dce3a08614a3cbcd7c8ee059c`. Unsigned.
- **v0.1.0-alpha.2**, 2026-11-11, built from commit `3ad79c6` by the workflow (the suite's new look). Unsigned.
- **v0.1.0-alpha.3**, 2026-11-12, the same commit `3ad79c6`, built and signed on the owner's computer. `OpenStage-Recorder_0.1.0_x64-setup.exe`, SHA-256 `42761091ceb2282072e5df03d6f0c02909981ec59148aeb5f84d615498270eda`. The first signed release.
- **v0.1.0-alpha.4**: the fixes from the security review of 2026-11-13 and Check for updates, built with `build_installer.py --sign`.
- **v0.1.0-alpha.5**, 2026-11-15, built from commit `1007ed8` and signed on the owner's computer. `OpenStage-Recorder-0.1.0-alpha.5-Setup.exe` (5,486,512 bytes), SHA-256 `4414cbea77319abf9c800842972c98fe2c911881c7234adeeec3ec1bde161618`. Checked after publishing: the tag points at `1007ed8`, GitHub's SHA-256 matches, two files, a published pre-release, and the copy downloaded back is signed by Jason Wrench with a timestamp. Installed on the owner's computer the same day; the owner checked that no user name shows, Copy the full path, and About.

## The history rewritten on 2026-11-16 and 2026-11-17, and the tags moved

At the owner's request, the Claude co-author line was taken out of every commit message on `main`, and `main` was force-pushed on 2026-11-16. The files are the same; every commit has a new ID. On 2026-11-17, also at the owner's request, each release tag was moved onto the rewritten commit with the same files and the same message (apart from the removed line), and only the tags were force-pushed. The releases' files, notes and titles were not changed. The commit IDs named above and in older documents are the old ones:

Later on 2026-11-17, also at the owner's request, the 21 commits whose author was "Claude" or "Jason Wrench" with an Anthropic address were given the owner's identity (`jasonswrench-beep`, GitHub's private address), `main` was force-pushed again, and the tags were moved again the same way. Files, dates and messages did not change.

| Tag | Commit built from | After 2026-11-16 | Commit now |
|---|---|---|---|
| v0.1.0 (draft only) | `6eba1d2` | `3f6069f` | `e0dfdc6` |
| v0.1.0-alpha.1 | `f0bd700` | `e3e3625` | `ef19985` |
| v0.1.0-alpha.2 and alpha.3 | `3ad79c6` | `3f42483` | `7eb32d8` |
| v0.1.0-alpha.4 | `6dfbda8` | `5c44567` | `496ca65` |
| v0.1.0-alpha.5 | `1007ed8` | `cd80783` | `46b5d96` |

The full list, every old commit beside its new one, with how to undo the move, is in `C:\Dev\openstage-recorder-tag-move-20261117.tsv` (the first move) and `C:\Dev\openstage-recorder-author-rewrite-20261117.tsv` (the second) on the owner's computer, beside copies of the whole repository as it was before each rewrite (`C:\Dev\openstage-recorder-before-coauthor-removal-20261116.bundle` and `C:\Dev\openstage-recorder-before-author-rewrite-20261117.bundle`). Each release's "target" on GitHub still names the old commit as text; the tag is what GitHub uses. The old commits GitHub still serves although nothing points to them (153: 60 from the author rewrite, 57 from the co-author rewrite and 36 from the rewrite of 2026-11-05) are listed for GitHub Support in `C:\Dev\openstage-recorder-commits-to-purge-20261117.txt`.

## Drafts left from the old workflow

The old workflow made a draft release each time a version tag was pushed. Four drafts with unsigned files are still on the Releases page (only the owner and collaborators can see drafts): `v0.1.0` (two), `v0.1.0-alpha.1` and `v0.1.0-alpha.3`. They were never published. Deleting them is the owner's to do, from the Releases page. The workflow no longer makes drafts.
