# SignPath Foundation: application draft and switch-on steps

Written 2026-10-28 from SignPath's own pages, read that day: `signpath.org/terms`, `signpath.org/apply` (the form was looked at by scrolling; nothing was typed), and `docs.signpath.io` (the GitHub trusted build system, the artifact configuration syntax and reference). **Nothing has been applied for, no SignPath account exists, nothing has been signed, and the signing step in the workflow is switched off.** The application, the account and every approval are the owner's.

## Decision, 2026-10-28

The owner chose this free route over Microsoft Artifact Signing (about $9.99 a month for 5,000 signatures, a paid Azure account, and a registered business that Microsoft can validate), to spend nothing. The cost of that choice: a signed file shows **SignPath Foundation** as its publisher, not Open Torch Press. Open Torch Press is a brand in text only; it is a domain, not a registered business. If SignPath says no, the project stays unsigned until the owner decides otherwise.

## What SignPath asks, and where the project is

| What SignPath asks (`signpath.org/terms`) | Where the project is |
|---|---|
| An OSI-approved licence for all components, no commercial dual licensing | Apache-2.0. `capture/tools/check_rules.py` and `app/tools/check_app_licences.py` check the libraries |
| No proprietary parts (system libraries are allowed) | None known |
| Actively maintained | Yes |
| **Already released in the form that will be signed** | **Not met.** The repository has no release (checked on GitHub, 2026-10-28). The workflow keeps an installer and a portable folder with each run for about three months, which is not a release. A release needs a version tag (for example `v0.1.0`) with the installer attached. That publishes something, so it needs the owner's yes |
| Functions described on the download page, and the page says the project uses SignPath Foundation for code signing | The release notes below. The application form says the download page "must mention" SignPath. SignPath does not say whether wording that says signing is planned is accepted before approval; only their answer would show |
| Sign only your own source and binaries | The build compiles the owner's code (`capture/` was copied from OpenStage Author, same owner) plus open source libraries. WebView2 is not bundled; the installer downloads it from Microsoft only when missing |
| "Code signing policy" on the home page and the download page, with SignPath's exact lines and the team roles | Added in this change: a README section and `docs/recorder/CODE-SIGNING-POLICY.md`. It says plainly that it is not yet in force. Still to do: the same heading and link on the release page |
| Privacy: say so if data leaves the computer | The policy page uses SignPath's own sentence. It rests on a read of the files (no outside connections in the window's rules, no accounts, no server), not on a network test |
| Announce system changes; provide uninstalling | The NSIS installer installs for the current user only and has an uninstaller (`INSTALLER-AND-SIGNING.md`). **Open for the owner:** whether the program changes any Windows setting. It registers three keys that work from any program (Ctrl+Shift+F10, F11, F12) while it runs, and the plan mentions the pointer as "a Windows setting" |
| Two-step sign-in on both SignPath and GitHub | **Owner to do**, on both |
| Roles: authors, reviewers, approvers | One person, the owner, in all three, and an AI assistant that writes most changes and pushes to `main` under standing permission. The policy page says so plainly. SignPath does not say whether a one-person team, or one with no human reviewer, is accepted |
| Product name and one version on every signed file, enforced by SignPath | Tauri says `OpenStage Recorder` and `0.1.0`. **Not checked:** whether the NSIS installer file carries those as file properties. Look at a built installer before relying on the artifact configuration below |
| Built from the repository in a verifiable way; every release approved by hand | The workflow runs on GitHub's own machines (`windows-latest`), which is what SignPath's open source check requires. Each release is approved by the owner in SignPath |
| "A certain verifiable reputation" | **The open question.** SignPath gives no number and decides alone. The form asks for links such as media coverage, download statistics, GitHub insights or community discussions. At the moment the repository has no releases to download, no stars and no forks. Nothing is invented here |

## One choice that is the owner's: which installer

SignPath's artifact configuration has an element for MSI and MSIX installers that signs the installer and the programs inside it in one request. Its reference has no element for NSIS (searched on 2026-10-28), and NSIS is what this project builds.

- **NSIS, signing only the installer (what the switched-off step does):** one request, one approval. The installer file is signed. `OpenStage Recorder.exe` and `openstage-capture.exe` inside it are not.
- **NSIS, signing the programs first and then the installer:** two requests and two approvals per release, and the build has to be reordered so the installer is made from the signed programs. Not built.
- **MSI:** one request signs everything. It means changing the installer type, and it looks different from OpenStage Author's installer. Not built.

Nothing needs deciding until the owner is close to applying.

## Draft answers for the form (nothing submitted)

The form is on `signpath.org/apply`. The owner checks every answer and types the personal ones. The menus for Category, Maintainer type, Build system and Primary discovery channel could not be read without opening them.

| Field | Draft |
|---|---|
| Project name | OpenStage Recorder |
| Repository URL | https://github.com/jasonswrench-beep/openstage-recorder |
| Homepage URL | https://github.com/jasonswrench-beep/openstage-recorder (its README is the home page) |
| Download URL | The release page, once a release exists: https://github.com/jasonswrench-beep/openstage-recorder/releases |
| Privacy policy URL | https://github.com/jasonswrench-beep/openstage-recorder/blob/main/docs/recorder/CODE-SIGNING-POLICY.md (the privacy section) |
| Wikipedia URL | Leave empty |
| Tagline | A light, free screen recorder for Windows, with a simple editor |
| Category | Menu not read. Productivity or Graphics fits; the owner picks |
| Description | Records a screen, one window or part of a screen, with the microphone, the computer's sound and an optional webcam, then cuts, blurs, zooms and exports an MP4. Keyboard operable and built for use with a screen reader. No accounts, no server |
| Reputation | Only true facts, as they stand on the day: downloads, stars, who uses it, links to coverage. At the moment there is nothing to put here |
| Maintainer type | Menu not read. The owner picks |
| Build system | GitHub (the workflow `.github/workflows/build-installer.yml`) |
| First name, last name, email, company | The owner's own, typed by the owner |
| Discovery channel and source | The owner's own |
| reCAPTCHA and the two boxes (code of conduct, other communications) | The owner's own. Agreeing to the code of conduct, which says certificates can be revoked if the rules are broken, is the owner's decision |

## Text for the release page

For the first release (title `OpenStage Recorder 0.1.0`), to be pasted by the owner when the release is made:

> A light, free screen recorder for Windows, with a simple editor. It records a screen, one window or part of a screen, with your microphone, the computer's sound and a webcam if you choose, then cuts, blurs, zooms and saves an MP4. Apache-2.0.
>
> **Download:** `OpenStage Recorder_0.1.0_x64-setup.exe` installs it for your own user, with no administrator password. The portable folder needs no installing.
>
> **This release is not signed.** Windows will show "Windows protected your PC". Click "More info", then "Run anyway".
>
> ## Code signing policy
>
> This project plans to use free code signing provided by [SignPath.io](https://signpath.io), certificate by [SignPath Foundation](https://signpath.org). It is not in force until the Foundation approves the project. The policy is in [CODE-SIGNING-POLICY.md](https://github.com/jasonswrench-beep/openstage-recorder/blob/main/docs/recorder/CODE-SIGNING-POLICY.md).

## After SignPath approves (the owner's steps, then the switch)

1. In SignPath: make the project for OpenStage Recorder (the plan notes that each of the six products would be its own project), add the predefined trusted build system "GitHub.com" to the organisation and link it to the project, and add the signing policy. Install the SignPath GitHub App on the repository, which SignPath's GitHub page says is needed for its audit log checks.
2. In SignPath: add this artifact configuration (the syntax is from `docs.signpath.io/artifact-configuration/syntax`; the element and attributes are the documented ones, but the installer's file properties have not been checked, see above):

   ```xml
   <artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
     <parameters>
       <parameter name="version" required="true" />
     </parameters>
     <zip-file>
       <pe-file path="OpenStage Recorder_${version}_x64-setup.exe" product-name="OpenStage Recorder" product-version="${version}">
         <authenticode-sign/>
       </pe-file>
     </zip-file>
   </artifact-configuration>
   ```

   The root is a `zip-file` because GitHub's upload action stores the artifact as a zip by default.
3. In GitHub, under the repository's Settings, Secrets and variables, Actions: add the secret `SIGNPATH_API_TOKEN` (a token for a SignPath user who may submit signing requests), and the variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG` and `SIGNPATH_SIGNING_POLICY_SLUG`. The workflow reads these four names and guesses none of the values.
4. Add the variable `SIGNPATH_SIGNING` with the value `true`. This is the switch. Until it exists, the three signing steps at the end of the workflow are skipped.
5. Run the workflow by hand, approve the request in SignPath, and take `OpenStage-Recorder-installer-signed` from the run.

Before step 4, check on SignPath's GitHub page that the action is still `signpath/github-action-submit-signing-request@v3` and consider pinning it to a full commit, since it is a third party action that handles the token.

## Not checked

- The workflow has not been run since the signing steps were added, and the YAML was read, not machine-checked, because no YAML tool is installed on the computer it was written on. The steps are skipped unless `SIGNPATH_SIGNING` is `true`, so a mistake in them should not stop the build, but a mistake in the YAML itself would. Run the workflow by hand once after it is pushed.
- Whether the NSIS installer carries the product name and version as file properties.
- Whether SignPath accepts a one-person, AI-assisted project with no releases and no users yet. Only an application would show it.
- The menus on the application form.
- Microsoft's own route (Artifact Signing, about $9.99 a month as read on 2026-10-25) as the fallback if SignPath says no. Not read again.
