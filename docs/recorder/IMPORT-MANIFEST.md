# Import manifest

What was copied into OpenStage Recorder from OpenStage Author, and from which commit.

| | |
|---|---|
| Source repository | `jasonswrench-beep/openstage-author` |
| Source branch | `main` |
| Source commit | `01fc056b2e121295c798a86f001f3f48c1620e3a` |
| Source commit date | 2026-10-23T18:32:44-04:00 |
| Files copied | 246 |
| Files changed after copying | 9: `capture-edit/src/fromTakes.ts`, `capture-edit/test/fromTakes.test.ts`, `capture-timeline/src/callout-panel.ts`, `editor.ts`, `index.ts`, `panel.ts`, `project.ts`, `session.ts` and `docs/capture/capture-project-format.md`. What changed and why is in `EXTRACTED-FROM-OPENSTAGE.md`, under "Changes made inside the copied folders". The checksums in the table below are of the files as copied |
| Files added to the copied folders after copying | 3: `capture-timeline/src/webcam-place.ts`, `capture-timeline/test/webcam-place.test.ts` and `capture-timeline/test/balance.test.ts` (not in the table below) |

## What was copied

| Folder | What it is |
|---|---|
| `capture/` | The recording program, the exporter, the Windows parts, the test scripts, the rule checker |
| `capture-edit/` | The edit model |
| `capture-timeline/` | The editing screens |
| `docs/capture/` | Capture's documents |
| `LICENSE`, `.gitattributes` | The licence text and the line-ending rules (Windows scripts keep Windows line endings) |

The paths are the same as in OpenStage Author on purpose.

## Not copied

- `docs/capture/HANDOVER.md`: it describes the earlier move of Capture into OpenStage Author, not this product.
- `docs/capture/IMPORT-MANIFEST.md`: it describes the earlier move of Capture into OpenStage Author, not this product.
- Everything else in OpenStage Author: the course editor, the player, the schema, the themes, the tools, the examples, and the Tauri shell (`editor/`). The recorder controls and the shell will be taken from `editor/` in a later step, and the manifest for that step will say so.

## Added here (not from OpenStage Author)

- `README.md`
- `NOTICE`
- `CLAUDE.md`
- `.gitignore`
- `docs/recorder/plan.md`
- `docs/recorder/IMPORT-MANIFEST.md` (this file)

`CLAUDE.md` is new and was written for this product. Its accessibility, licensing and working-style rules follow OpenStage Author's. Please read it, because it records choices on your behalf.

## Checks run on this base, on Linux

| Check | Result |
|---|---|
| `python -I capture/tools/check_rules.py` | All passed (65 Rust libraries, all on the allowed licence list; no FFmpeg; file headers; no em dashes; batch file rules) |
| `cargo fmt --all -- --check` and `cargo clippy --workspace --all-targets -- -D warnings` | Clean |
| `cargo test --workspace` | 683 passed, 0 failed, 1 ignored |
| `cargo check --workspace --all-targets --target x86_64-pc-windows-msvc` (the Windows-only code, type-checked from Linux) | Clean. This says it compiles, nothing about how it behaves on Windows |
| `capture-edit`: `tsc` and `node --test` | Clean; 217 tests passed |
| `capture-timeline`: `tsc` and `node --test` | Clean; 143 tests passed |
| `capture-timeline`: `node tools/browser-check.mjs` (a real browser, keyboard only) | 73 passed, **2 failed** (see below) |

### The two browser checks that fail

Both fail in exactly the same way in OpenStage Author's own copy, so they were there before this copy was made. Neither was changed here.

1. *The timeline exposes a listbox of clips grouped by track.* It ends by asking that every text box have a `label` or an `aria-label`. The new track name box is named with `aria-labelledby`, which the check does not count. From reading the code, the box does have a name. I have not opened the form in a browser to confirm what a screen reader is given.
2. *The tool bar is one Tab stop.* It expects the older list of tools. The tool bar now also has Mark start, Mark end, Remove stretch, Remove and close gap, Clear marks, Snap and Tracks. The check is out of date, and the keyboard steps after that line did not run.

## Files

SHA-256 of each file as it is now in this folder. Each one matches the source commit apart from line endings.

| File | Bytes | SHA-256 |
|---|---|---|
| `.gitattributes` | 503 | `96b63f1e2d2e00104aee1954c1b6cbb9c9054279d02e80a16d144aa9be363930` |
| `LICENSE` | 11357 | `c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4` |
| `capture-edit/.gitignore` | 14 | `4d56952b0fb13bf8f9b6c13a6d4c34a075bac3af447636a1df4335d7576e2f97` |
| `capture-edit/README.md` | 3771 | `11c0bdae4e65ca3c992831de96132a2b62a343f9f88cd7b04e9abbd94cb4b871` |
| `capture-edit/fixtures/bad-color.json` | 3792 | `4e6539be2979a7bb7f34c580af5a8f267f1194967d7c9642dba3337ff3114042` |
| `capture-edit/fixtures/bad-item-time.json` | 3794 | `713a40d0e90fc287efaf6b127dddedc688e5445dd0016860266db8915cc84f7f` |
| `capture-edit/fixtures/bad-placement.json` | 4217 | `f3815530ed154c74f7b18d8507bf881a40b7fe816c193802918484f0e186430e` |
| `capture-edit/fixtures/bad-rect.json` | 3793 | `3daab1313b1bf9cd1c1179244f9fd708f3490232a42d9e254a9fb45e9060124f` |
| `capture-edit/fixtures/bad-style.json` | 3798 | `9a440bb26262f4c6dc0a46eb4d75421741552f1f79620ca7e1b37788d6888adc` |
| `capture-edit/fixtures/bad-time.json` | 3377 | `5cf1e220137242fd8ca61494d7a2d6687fcadfd4c8fb14cf0b11ddd8a7e4817e` |
| `capture-edit/fixtures/bad-track-kind.json` | 3378 | `efcdc130b3729d052cef1a020fe33d994961fdeadb09ab8cf475b3c37cda333f` |
| `capture-edit/fixtures/bad-transition.json` | 3478 | `e02ebd41c25b1544df401f8885e3542038fb6b17e94276fc993ece29d4077f0d` |
| `capture-edit/fixtures/beyond-source.json` | 3376 | `101b30f4b2ec0932a2db903d0820f18308637b952edbafed76154190d5b3a3a2` |
| `capture-edit/fixtures/duplicate-id.json` | 3376 | `2ab34e232dee477e5c14f18566259d7aa8768b16131145e6aa4b63be33f5aa22` |
| `capture-edit/fixtures/expected.json` | 4724 | `43856897acb3bbcf15dff1ceca7eeba006a9c21a53bc76ea82d3fff8e31f5e8a` |
| `capture-edit/fixtures/fade-too-long.json` | 3384 | `34bda22173bbcb1ba85e5add487fd2c6dce7f402883c9fa376a9c8f01cdb9d51` |
| `capture-edit/fixtures/future-version.json` | 3376 | `bf1bbda624e92ab10931c3d7a465c7aa4783fa3cf67426f7c5cace8b5b9251bb` |
| `capture-edit/fixtures/imported-video-too-long.json` | 3757 | `ed09167c83e6334b4895a8c49f1bf40beaf0f551161c3002c1c9762b7d2e821b` |
| `capture-edit/fixtures/item-too-short.json` | 3794 | `6e6e7d9b4a97f3462c17210deb72d2d8ce6a93010b24ad8ec8c63a976245fa28` |
| `capture-edit/fixtures/item-wrong-track.json` | 4271 | `ab9a70377b120e954c417ea0d01641e9c344540c0984ab1b2e3eb023a099dd8c` |
| `capture-edit/fixtures/needs-attention.json` | 2322 | `42071b12fb2b965b57da20d9884ec52934c612bb582ff1b76eb0ce1e28376c5e` |
| `capture-edit/fixtures/needs-item-attention.json` | 3738 | `f833f1563590d87c044f3eb0fedbe82363cf66f80b9f067ca2d6be1b0e8e83be` |
| `capture-edit/fixtures/not-an-edit.json` | 3368 | `7093a3380930a7757066c2938aea2e5a4254ff4315586fd41eb830f5edcb36ad` |
| `capture-edit/fixtures/overlap.json` | 3376 | `be306f0aa4a2301366f9dbe15aaecfbb8cad8b0e1f01348899016860ba1f09f4` |
| `capture-edit/fixtures/placement-on-sound.json` | 4348 | `649553166edae40625fe3df2a8ef08f23c7f79afb67a0bfd9543e130a96934ac` |
| `capture-edit/fixtures/source-not-allowed.json` | 3373 | `11aef6c5caea13d3cbbc5e53361e7182894ce0d72ea84f252832b5a9bdc8fba9` |
| `capture-edit/fixtures/text-empty.json` | 3778 | `2c4960b2cea39aee40528e347cd011fd1f50f837a0189244c7447c4d80a9c0fd` |
| `capture-edit/fixtures/too-many-zooms.json` | 4883 | `b1c7127cb40f37856bc7b3a8662afeec1bb9c5512ad5719601ded69ecce01d39` |
| `capture-edit/fixtures/too-short.json` | 3376 | `9abc668a617d493e705e9884b80eac3146fa50bfbb89c96fc31248ee98d6283b` |
| `capture-edit/fixtures/transition-no-neighbour.json` | 3480 | `077d346b8d45e38da95033064795224f2a6488ea0b64073dce6c374731fb213f` |
| `capture-edit/fixtures/transition-on-sound.json` | 3475 | `f8765624a3ed97cf86b7e84d255a43b71e90924e70ec9636c93225dfd60a5f98` |
| `capture-edit/fixtures/transition-too-long.json` | 3797 | `97dd014fa93eeb1cb8933095318b9ef60c271096b69071922297447249cdf8c9` |
| `capture-edit/fixtures/unknown-item-kind.json` | 3800 | `4256f29194bcd654c8ef5be547822d39b1d8f9f004466e56d116d512e9f0cafa` |
| `capture-edit/fixtures/unknown-source.json` | 3376 | `ce5dcc1d0a09a734d5a5a75439ad3addb7464453c10527df2bd42243ba753131` |
| `capture-edit/fixtures/unsorted-items.json` | 3796 | `8f85d3569413ce302d3d8228ab6f95e58fcea159895c25a6ed2160fea4dee307` |
| `capture-edit/fixtures/unsorted.json` | 3376 | `5fb735950cea5f1e02539be65c70855739a3e10f3c1b19b3647b0f0a33ff6d8c` |
| `capture-edit/fixtures/valid-basic.json` | 3376 | `1d66c4bc30337486fd6be12f177cc8dbbb5eec9d3fd8589b61f97ecdc82ff754` |
| `capture-edit/fixtures/valid-placement.json` | 4216 | `e40cd13e0a249d5ad8aa780242c5e7123daf8eeed930fe580396e49d7f86b5d4` |
| `capture-edit/fixtures/valid-transition.json` | 3581 | `c36226eb6b90d2d4aba1a7d56b71de8a7171a7db0a4297fd1ba5cc6fb39829cc` |
| `capture-edit/fixtures/valid-with-imports.json` | 3758 | `c9e2b9b34d5800364bcfee445e605f7a942258c71a602286aa9badd02acfc109` |
| `capture-edit/fixtures/valid-with-overlays.json` | 3796 | `bb7def8533d6779f34ebebb0cd31b1c0a86fcc8253523519dacd3397b23922cb` |
| `capture-edit/fixtures/volume-range.json` | 3377 | `b8bb57212a0c3e112885fbb8eaf9453cb012da8a6fc8761b6ffdaf4b7b2ebe1a` |
| `capture-edit/fixtures/warnings.json` | 4274 | `cd87634bc4ffe00ab80c40f1d69788dff18347f1ffd0cfbf6a1fdc83b61c854c` |
| `capture-edit/fixtures/zoom-overlap.json` | 4163 | `cc41957e31398839ed2d7cd5836e92f3e0c6da16d95da86bcfcb545861ce3047` |
| `capture-edit/package.json` | 519 | `64964ca0d8a0e373a20bdf5de725f2561f9279192af8af9d5e35494c4b308ba1` |
| `capture-edit/src/callouts.ts` | 7132 | `e66f10d21a4d22a55030b77113b40473cad1834b7a9c813fbd3797d4abe6170f` |
| `capture-edit/src/contrast.ts` | 2632 | `3ca1f7f670638d05d5163150dd71bd9f96f12bcf98f89c5d58bccde07255daa5` |
| `capture-edit/src/fromTakes.ts` | 5248 | `890a3e0c03fcc531c1109bda3010dcde40184bcd15ae983749e4907d54e35934` |
| `capture-edit/src/group.ts` | 5162 | `6d01eb562348282fcc16a589b374ed44139eb281986124c7bfe10e37831b5886` |
| `capture-edit/src/history.ts` | 4620 | `7986e02ec3b73ac8418c48f99dce0de06c0f2a93af06d18d59e07431a7d4ec8c` |
| `capture-edit/src/index.ts` | 573 | `7304411fd7af8114f190b30a0c51cd941e0fda0d4daa17bbcdd9f97c99f1f781` |
| `capture-edit/src/items.ts` | 20485 | `0fa982e2f7c0d8f56947fe0088216289fcb700498d8393634a68f3dc521994ea` |
| `capture-edit/src/limits.ts` | 5457 | `4b9d5c0b8b2d9975eebe9d0156b46ce07ed65ff0bd9a1f49e5e3e0ba57136487` |
| `capture-edit/src/media.ts` | 6236 | `fe098396b51336b3fe9d9cb2f66dd4d2ce65efe62b079b54d3de603743bee28b` |
| `capture-edit/src/model.ts` | 13014 | `ca6176cf49b7eb909db440a73bc26fba7f6fe3cfe73e996833c9d52e1a725464` |
| `capture-edit/src/ops.ts` | 39492 | `33fb2c6288e8f743063101735058f79caad3f938faf53468e427a00ad3534fa5` |
| `capture-edit/src/paste.ts` | 8075 | `fae479bb0de87f23525f37c368c7249478ed4e9895b34dd7c967cd12f9ecea56` |
| `capture-edit/src/playback.ts` | 8981 | `67b6b0021449d844a0a2416812d90caf444e532a77ab3537cf68c6ab8aaaba54` |
| `capture-edit/src/preview.ts` | 13234 | `f719c243e2fc410b7ff1c0e837e576d46c6c2fc8454f9787d205d7fabd9a1421` |
| `capture-edit/src/regions.ts` | 3197 | `12a58a9782f605709ab6f14ad5d329ab36c8b5ca1113b4739c7db69b824bb073` |
| `capture-edit/src/serialize.ts` | 14538 | `f871a26e6b2efaaa93ad9dfa44620b5f1472d70fedbdb08576809a4647f462aa` |
| `capture-edit/src/time.ts` | 5946 | `0eecb386c81748ef66880831c70eea3084085cb4a977ad2e39ca8b940c2f402e` |
| `capture-edit/src/transitions.ts` | 6145 | `236b23f3a406eaf35fdea26d478627e6232e1f27ed80965de87bc400d0a73c2f` |
| `capture-edit/src/validate.ts` | 19220 | `c8cf9b44ad054ecf609d1438295f303e687928e20ed99f341858973891135139` |
| `capture-edit/test/callouts.test.ts` | 2744 | `4b6184e76ed171037d99769e790a31dd71a4b57429d1e5f0fdb898fd589b8c69` |
| `capture-edit/test/fixtures.test.ts` | 1324 | `f313e8318fd08872306e296bf1d718fd2cab87b6ab0a32827568b2f55c23b021` |
| `capture-edit/test/fromTakes.test.ts` | 3938 | `973c33c56b43756c367196639ed23b123474a7d46c5f946f7ef177fe8bd3546d` |
| `capture-edit/test/fuzz.test.ts` | 7595 | `6e6335cb10a82bca0057ff905e8a2fde66450cbdd65f732bfe740d6e2fdc96ab` |
| `capture-edit/test/group.test.ts` | 5280 | `5c9a7b13332a454da4cf72938d8034553fbd4d5d44b4710ef4c0e7e7f146495f` |
| `capture-edit/test/helpers.ts` | 3256 | `eeeada7b62918d0a7f9c47a8f34d349a166621939719de9540eef5d7d8ed7429` |
| `capture-edit/test/history.test.ts` | 5274 | `a372f5bcce7a0df03bcce862ffda421e2e8caad69424abc5fcd73bb9a175eb48` |
| `capture-edit/test/items.test.ts` | 21329 | `ddc3c9b18ab5c122632c1178de678212bf5b10511f9d8caf521ada16585360c4` |
| `capture-edit/test/limits.test.ts` | 8666 | `b1e48128d31de0779b9ec6f03ad352497a2aa706dad51f5eec503d8f2743a36b` |
| `capture-edit/test/media.test.ts` | 3769 | `4e692750239b07e850470d130c516bab32760b39877998b25a66cb70d6916223` |
| `capture-edit/test/ops.test.ts` | 24742 | `4da665ee0e081a3c62e73aa4a6d51b115a5a8a1e15b7f1be807aa3f8fa15e2c1` |
| `capture-edit/test/paste.test.ts` | 5969 | `c890a69fa8ae995492fe73770b5c4e85b867c95c0706d64ce53d3b080a705a84` |
| `capture-edit/test/playback.test.ts` | 5814 | `febe05872ac4ed5e8cad3cc06c845254d860024db533a32cc058807e5f3a8ef2` |
| `capture-edit/test/preview.test.ts` | 4238 | `10999490b106dff615cedf82e042a9f755f89dc99655fbf8d8e23906e508ff8c` |
| `capture-edit/test/serialize.test.ts` | 4433 | `d7f9bf7d734340a2d293a523ff96e6a6ec6b2302c474e10569b53a0a32b846bd` |
| `capture-edit/test/stretch.test.ts` | 7157 | `885e2a4a38f3a3bd16616ef203523f4a989cab81fb8954e13e17fdea547946cc` |
| `capture-edit/test/time.test.ts` | 3388 | `c1f9dabacf368eeed56a39c1ef1167917c225723581fab8c5e000e4b1087b21d` |
| `capture-edit/test/tracks.test.ts` | 5722 | `04a8c9cf776ceedba03f26e203069120d5d5d0fb31941ddd4981bf772acb3e5b` |
| `capture-edit/test/transitions.test.ts` | 9096 | `6c701679bdebb7c4547f5e5068d4a354ed4336b201d1e263430a92171b431250` |
| `capture-edit/test/validate.test.ts` | 4158 | `d98a0ea4e07f89a79935622f09ef4c165cc94ed8ecc006399abe2a05857fdaed` |
| `capture-edit/tsconfig.json` | 530 | `6290e2ac1ecfc7026e9c8d551fb5b81aca25c829a13ab2bc330ec2707d4cf88c` |
| `capture-timeline/README.md` | 37399 | `4dc6e9239b9320be4e5b67ece30d6f545f270a9172ce586f37d2675ac62865fd` |
| `capture-timeline/demo/demo.ts` | 8445 | `1cd780ecda457846162b9381218d1b2353f84e42ee4ed5fd7d423c37822b2857` |
| `capture-timeline/demo/files.ts` | 4899 | `3a124d6faea6e553cd282c1b25c8ce5129a439cd2eb77a152cd952db3e2bc791` |
| `capture-timeline/demo/index.html` | 2752 | `0ee3e65c900e1745c04432ec2eb0e107ad3a1372afce1c149e9c4373741a87dc` |
| `capture-timeline/demo/serve.mjs` | 6054 | `fee108fb1df1ed9c06e67c1d402761d1d501c8b39d827642df167d796836aadb` |
| `capture-timeline/package.json` | 567 | `3c0f53855eb537c746ab95802c557bd569c904ea194aab4f458dda4d290d715f` |
| `capture-timeline/src/announcer.ts` | 1729 | `ccee242061cfb982f85db9014131410a15519dc23c5a371529552fb0d5567ad2` |
| `capture-timeline/src/callout-panel.ts` | 6290 | `1191da8776e38ca01723a56fe39e6bcee9fce454b43d1f803e04d98587d41570` |
| `capture-timeline/src/clip-list.css` | 6772 | `57bea9c81b1ca989396bddf72ba34c43cab43f3bfba212cac1b375c9d5dd3a4a` |
| `capture-timeline/src/commands.ts` | 5944 | `b8492e7c64dd3a43dbfe0f5e738c50a4a1c4129e29672b605d57de384ba484be` |
| `capture-timeline/src/dom.ts` | 1851 | `32a9fbe1219282bb3e1e6c63011fb5b4248103d56fc42b3d33001d1273f3b022` |
| `capture-timeline/src/editor.ts` | 9980 | `0b4f6d112178bacc35609d5277045f96460f7e788f255cfc8fcd8d14abc49c90` |
| `capture-timeline/src/geometry.ts` | 5557 | `10a9cd0696a47a9a6feeb2e2e43e3d71398259428d6222a49f3984478cecd40a` |
| `capture-timeline/src/index.ts` | 455 | `49c2a1e379b27cade07c59b79f98a1b4fc5ac3cca74bfd8c88b1bc2635518bb2` |
| `capture-timeline/src/item-form.ts` | 20785 | `8e2e793b9d3a3921da84289a6e35bfb8258a300ceca69a55052d80b6d99fd960` |
| `capture-timeline/src/layout.css` | 7387 | `72f7a5bd011886c6fb63a118b2972a0e48ae572bde4012a724b6239a802cb167` |
| `capture-timeline/src/panel.ts` | 33285 | `7cd77e3ab9f328f5e130ce34bdfc69f4b0e5928b2a8d21bd6cfc5a64c11d7fec` |
| `capture-timeline/src/picture-edit.ts` | 12562 | `b325f05caf011d7e69ec2892d72f54228a359bc9d4ea45475ed203f17231a6c8` |
| `capture-timeline/src/preview-panel.ts` | 21097 | `ffd8518ebd575e29e6f54159504331c1e16bca51bf732a17bbbc9b35d94fe690` |
| `capture-timeline/src/preview.css` | 4300 | `94de7fe36f393d0475017cba95cef0974a115001baff3344a9a1b1aa86b53c3e` |
| `capture-timeline/src/project.ts` | 15620 | `a1162ffec80fc1e04d50c7765c5467ecf9224f2f5e927cb16a1a9a8ee1c3bf10` |
| `capture-timeline/src/sample.ts` | 4675 | `31721d5749343406bb3518a578758f15408d21056636b4e1e875d175f705d632` |
| `capture-timeline/src/session.ts` | 65097 | `a300ea53439d162c4543388d8735e7d91c72a8ccae1e9794f7093d42aaf22c4f` |
| `capture-timeline/src/snap.ts` | 2595 | `f5798585e3ac5d5f3ac869d9e34634f39881c350d5d633c698d323677ab43e87` |
| `capture-timeline/src/thumbnails.ts` | 9483 | `fb2d31426c7f0dd1546283d0bed9e2965e3b9ad8a04c90e5ef8bbbc41cdceb84` |
| `capture-timeline/src/timeline-panel.ts` | 58015 | `3d7ad18d2f9767d01f5375e8d2d7f521103292d6bed3c1d339313dfca53afea0` |
| `capture-timeline/src/timeline.css` | 12642 | `565d927e11ff9d07d7e871e223f852bf8f6c03af7c0b23f0ac810ba35282c510` |
| `capture-timeline/test/callouts.test.ts` | 2344 | `e860684af6c291d1c6f7d5244a7aecac2070937cb49fe0f754f4f7ea1263dc1d` |
| `capture-timeline/test/choice.test.ts` | 13916 | `8c6f547371594db81dce0fb56a7481364904d434d3274fdddf512e9c257e6168` |
| `capture-timeline/test/clipboard.test.ts` | 3233 | `fa88ca12e2ad191fedd9c6baa13be93e136011d0c0153742e73bc6951b2974ea` |
| `capture-timeline/test/drag.test.ts` | 13180 | `2e3dd28037443ecbc1211350ba26ff3ad629e0f4a1523112bf7ecf1e8f697d44` |
| `capture-timeline/test/finishing.test.ts` | 16180 | `13054a5e0349e0ebfcb0728b08bd7b0f9b72622d618678d202298990a497b179` |
| `capture-timeline/test/geometry.test.ts` | 6721 | `0a83be35fc8ea592af48397f43e62d6a8d041c31365268ec39ccf34054b63e8a` |
| `capture-timeline/test/helpers.ts` | 1553 | `80ac75b076531f749a20cd33e96039e3c977ac64270ca5bfdd0ea437d8cf5fbc` |
| `capture-timeline/test/project.test.ts` | 11781 | `19a0d8796ebd4fb580e8a83260bce66f556dc0d56993b4630af44b14dc5f1297` |
| `capture-timeline/test/session.test.ts` | 27445 | `11ad787d1ff98ca5071fc594267078b77b444e25fd3cbb5df40d1ac5cdb22dae` |
| `capture-timeline/test/thumbnails.test.ts` | 1134 | `d01f1af66d6f8012380dc445c926015f4b3d8581e76dcc48fae07c6cf510f84a` |
| `capture-timeline/test/transport.test.ts` | 1736 | `63ffc2c1029657626d9ec3f2040af3492181795aec33f7d92d3f41ee256b049f` |
| `capture-timeline/tools/browser-check.mjs` | 98580 | `0cae19ae71900f7e4bd90459647a994c771b91ec621d0ef705d20cb80d1b524a` |
| `capture-timeline/tools/make-fixture.mjs` | 2556 | `eb62a379bc9cc4a6085fb246324e73c7e789646252f54f6d21573e6c3602122a` |
| `capture-timeline/tsconfig.json` | 569 | `a3e2d0bc65a9aff568978211c7e0e315ab5cf6c3fd88de87b2ff5708ae3daccf` |
| `capture/.cargo/config.toml` | 362 | `44fd493587251cafc21d774f080e208d9db38acdaca41390fc353c804c363056` |
| `capture/.gitignore` | 803 | `f9afdd257bc869f5aa3c1d7d8022ddf998d109c56e9fb440f3d35af0bd715fb3` |
| `capture/BUILD CAPTURE.bat` | 2878 | `4c71525b3fa7a8453bdfb1e503d4ecbd4e9023cc3bc7628a0c2911727b972cdf` |
| `capture/CHECK MY COMPUTER.bat` | 2571 | `1d41c02685cfaa77c507b32dfefd149bc690bd1efedb1010a15ca94b69afaa49` |
| `capture/CHOOSE REGION.bat` | 3859 | `587385c67252c74e4e12c295d99c00aa3f45ec4c57fa39b9e8a49b5f2ea3c0a7` |
| `capture/Cargo.lock` | 14722 | `d88e49f813cc396d4f7b57d52d9a4958d367da671a052a82423171d3d6bd4c3a` |
| `capture/Cargo.toml` | 748 | `6e34c9f71b0b7c958ffc3d26348b5a67494bbee3419d99d664258e9339334513` |
| `capture/FIND SOUND OUTPUT.bat` | 3387 | `6297ba9b81081d63a7b71d0e08515f35adf3ae16c4e26b8e03b5466ab4af1e4e` |
| `capture/OPEN TIMELINE DEMO.bat` | 1591 | `46ba702d4c0acb61ae319de085364c80d87a5695809e699125b8e0e2083786eb` |
| `capture/README.md` | 24365 | `473e6686aacca25182e6b3b54de0a65e2f6afcf07a80409cb88ca296ceff6f9d` |
| `capture/TEST AUDIO CAPTURE.bat` | 4772 | `5138adfbe4cef727a96c68db1e8d37eb45a8061d19c00736afac3d32cc0f8d19` |
| `capture/TEST CAPTURE.bat` | 3690 | `9b085b59aa3d53a23280f97d94449ee3a0d2dc326b3ea2e5c9a2b0633061de46` |
| `capture/TEST CUES.bat` | 3427 | `0011f4113ccd9f6375cf8c2cbc4051936ca254671c3f4eb8c3a45ccb52d101e6` |
| `capture/TEST EXPORT.bat` | 6663 | `437de3ee2a2c179b80f41b4fa6a568cfe3bd74ea8d13f467bc5f4cfedb9e447e` |
| `capture/TEST INTERACTIONS.bat` | 7260 | `45aca7cee17429c894980de2b2ef63578efc0755802022c091579664459683cc` |
| `capture/TEST LONG RECORDING.bat` | 7026 | `4cd691baa46b8e9f6db32ec26577d672637dd859026147d48e0712738592f7ed` |
| `capture/TEST OUTPUT SWITCH.bat` | 5317 | `25d89cf181c3db50071d24c48fd860c4868da4b0c930b74f9bec23f8e7b088b8` |
| `capture/TEST RECORD SCREEN.bat` | 6211 | `913de1887830f6e16685cb98725ae7d2e61bbe1de1d89925d66d8257a9502b5d` |
| `capture/TEST RECORDER CRASH.bat` | 4298 | `4ca4c5ab9158690c3f2d3be73ef0d24e990cac2722ecf12a83db35ed61dae96b` |
| `capture/TEST REGION.bat` | 5284 | `371ade29153026ba3285628f97f310243f98a46f6679c192c1d7d63d005b2863` |
| `capture/TEST SCREEN CAPTURE.bat` | 3859 | `fe579d0e617f0e1f5bb0864071f8ed2f4b0c59476b67bb490b9bf724ec0e97b8` |
| `capture/TEST SYNC TIMING.bat` | 4078 | `8c8b71cefc0e3f985e61fc2d4a8e63f04f76be30aef4b104f29816762027dd6d` |
| `capture/TEST VIDEO CAPTURE.bat` | 3804 | `db38a5e369ba0a2a836d33c0e3c3c1489c85aaa2383208454186f7d05a3238fe` |
| `capture/TEST VIDEO CRASH.bat` | 3969 | `442caf6d75320e9e76b53c3686f05c8ef17576de6e4bb9561e5ba9ca0e619ab6` |
| `capture/TEST WEBCAM.bat` | 5417 | `56640dacbd39adf7d8e910b574326651332becfaddc16fd59b5a3bce7eccd980` |
| `capture/TEST WINDOW.bat` | 4787 | `6b9ba2fb2d1c187ed88c31f31cbc017896c867e1dbf2e651347e76e33f0dc6de` |
| `capture/THIRD-PARTY.md` | 2887 | `b3c6dc40b1342d6a30cb8a41628c3e0c7221780cab34c8c3087ebd63c89941ef` |
| `capture/cargo-run.bat` | 2057 | `d2da8b70b714ad1edde1b62b37014354ed07d8865a359113bf374f963e9b97f3` |
| `capture/ci/capture.yml` | 2234 | `4bf2e0a527f86942bb18b227fe694f09b61a28af9502c964b3970a626a45759b` |
| `capture/crates/openstage-capture-cli/Cargo.toml` | 694 | `a665b6c775080885bb6dbbdb580f7eef4a73c1d137c149e362c7ec5c56b0fae3` |
| `capture/crates/openstage-capture-cli/src/checks.rs` | 11805 | `b46d677d72f917fc02dfafc4a895c615e8b029825b3ce490965879e8b92bbc08` |
| `capture/crates/openstage-capture-cli/src/demo.rs` | 3260 | `9a7914b169213f0c8dcbac25188b7d5bc5316376bc6e10194d74dfa418ba37f6` |
| `capture/crates/openstage-capture-cli/src/interactions_cmd.rs` | 11705 | `07ce6ee1ec6cdb4674051bd24e3f593c647223095f374dc4505ab7c33bcf3e8a` |
| `capture/crates/openstage-capture-cli/src/main.rs` | 67014 | `de4d3f6db8f84d0ec5314c25942c59b1271c41c303582f108de1ed41c904eea9` |
| `capture/crates/openstage-capture-cli/src/plain.rs` | 13811 | `74e3bdb350f992992241a15bdc09c1d2111e85480fe800755bb050684dcb59ed` |
| `capture/crates/openstage-capture-cli/tests/cli.rs` | 34268 | `c2d96a8e0f2a6a6c3cb420be78f3fd0f59b98fd8fb02b40cd572bc064407bc15` |
| `capture/crates/openstage-capture-project/Cargo.toml` | 468 | `f0cfe842b333ec07c45276c1506be4cbe83f000910bea917bb7b266d84ec9978` |
| `capture/crates/openstage-capture-project/src/edit.rs` | 42315 | `22564564e4b58b4c7f4c1f905011baa378cb1d6dd0ac3937bb347e41c6c32ee4` |
| `capture/crates/openstage-capture-project/src/error.rs` | 699 | `9a197f06febfa89a80a2e187af0944fa5fa4aa5051b6430f5aca96547aadd40d` |
| `capture/crates/openstage-capture-project/src/events_log.rs` | 19380 | `93609c11bb3e7823c9211ab11e98df1b00a8f851e1c5cce18aa14ddbc1ff4387` |
| `capture/crates/openstage-capture-project/src/fmp4.rs` | 10402 | `e22029874251185c84e278c06a02005798adfbf04c11850de554e4b310c3ace6` |
| `capture/crates/openstage-capture-project/src/fsutil.rs` | 2505 | `b7a8d22881e7b49f4a74066e1a6b82738740d8248b18032b6e280b1595a02ad5` |
| `capture/crates/openstage-capture-project/src/interaction_review.rs` | 22282 | `33af4cec69276b8feddcc8dc9910a38c1ec1dbd6fdcb0cb1e871e8bb6c3d06bb` |
| `capture/crates/openstage-capture-project/src/lib.rs` | 2917 | `95718e3e971912cc1ff3e2b63a2dfae29296f25a4c3f6eeaeba905f8eadb6156` |
| `capture/crates/openstage-capture-project/src/manifest.rs` | 5494 | `44a048c17b82416fb00a01b2db91eeac9cd1a3380e4360dc0786c4acb431f355` |
| `capture/crates/openstage-capture-project/src/recover.rs` | 19267 | `fe4620abd31935572ecddbef1dcc3690ca80ad795908105b71050c8cd38441ec` |
| `capture/crates/openstage-capture-project/src/segment.rs` | 11132 | `3445adb0a99dc76d4d52735be073d1d495af459f7eea74a3e37d3ac08cba370f` |
| `capture/crates/openstage-capture-project/src/take.rs` | 18721 | `f47adec061d836b74454b18b4a96dc5ce2610e3f029660102c9426dc4b9f80c8` |
| `capture/crates/openstage-capture-project/src/wav.rs` | 29860 | `3ad056e13be038088e4cd504b3e538a94b73f0d6a0ca2cc84fed8698c1656d31` |
| `capture/crates/openstage-capture-protocol/Cargo.toml` | 361 | `fa9d379e894bc36ff5a491e074936b91f0c036a5954d6d3ccdfecc37fa48f2c1` |
| `capture/crates/openstage-capture-protocol/src/lib.rs` | 10922 | `5740dc56a223b38b6a649c1eff34ba7b94f3cde7f72e3c4448b95c999b5f2ff0` |
| `capture/crates/openstage-capture-render/Cargo.toml` | 449 | `d24c9be9012e16882a73229ccae996e869c2bc07d201fb9d4ab5af62425d6bc8` |
| `capture/crates/openstage-capture-render/src/audio.rs` | 8615 | `78e42a3e247afdfe30ffc59a4909543ed67a83cf1b7589ee788c46d1fb87121d` |
| `capture/crates/openstage-capture-render/src/canvas.rs` | 36214 | `3b64e112d91c456c787c22795731512203474d097565ebf15114c2debb7525c5` |
| `capture/crates/openstage-capture-render/src/compose.rs` | 35522 | `606ec20965f24e84d11a6fe69526f0f3b6b3df6d919d19ee6ddd204013be0954` |
| `capture/crates/openstage-capture-render/src/lib.rs` | 1202 | `d08f1a1e7f4270fa61f6d6bdc6c03779b7950f80d89f06c056cfdb6d37fe1325` |
| `capture/crates/openstage-capture-render/src/plan.rs` | 22770 | `bcf04b6927eba51f476c9b34817cf12765e5948a1c2da5d1ae03c430a26fa705` |
| `capture/crates/openstage-capture-render/src/text.rs` | 10009 | `1c075fbc9e3ffe0ecb36ea9b16f1097e3146318ba12df6f52b4655bf19b437a8` |
| `capture/crates/openstage-capture-render/src/zoom.rs` | 5753 | `02173ebd881e932a7ca9d66e77a9932f7963eef91a81b4f3fd4b9260e6e18331` |
| `capture/crates/openstage-capture-windows/Cargo.toml` | 2010 | `4a5feae069c617c97ac1716de3472fd81008dab7486663daad7ca6184687a4ee` |
| `capture/crates/openstage-capture-windows/src/audio.rs` | 69633 | `4825de0d53181008f740d0241bf66b32bf3e114b69923f053ef0f892f3e77b47` |
| `capture/crates/openstage-capture-windows/src/balance.rs` | 18732 | `9d220c20b8cd01751a554a792ddabc0e1dab12425d1566dc7bbc02eb187bff0f` |
| `capture/crates/openstage-capture-windows/src/bmp.rs` | 3694 | `8aeca7bc56c3baa077398389154dc868ba7083addcc33e8120776a82605fab59` |
| `capture/crates/openstage-capture-windows/src/crash.rs` | 14565 | `97654e0c9c2ae7c0402809a02539fd8b58833fc638e9f1b5bb0e33eaee269d26` |
| `capture/crates/openstage-capture-windows/src/crash_words.rs` | 3369 | `91eaa4e600f8b4b324d6a6d7ee6db039cd32102e05a09d97daf2cbe0b88b145a` |
| `capture/crates/openstage-capture-windows/src/cue_player.rs` | 6671 | `6006f641c997c5803255464cdedfc634fa1d2a49bac38645d24788e94483208b` |
| `capture/crates/openstage-capture-windows/src/echo.rs` | 16853 | `4623fd35f1cecb529783511e9fe9f26d490437628aad7efde26b6157b4f26587` |
| `capture/crates/openstage-capture-windows/src/export.rs` | 36224 | `5c03d1fffafa1735082bbcab3a72c2a867f2f225eee53d52822148f102f1f3ab` |
| `capture/crates/openstage-capture-windows/src/interactions.rs` | 58197 | `7fbf7bc6901ad8880f9e3e0cea806b4a4db8100f26511d77c68e2e7e0f775f93` |
| `capture/crates/openstage-capture-windows/src/lib.rs` | 29118 | `c993f8324ceb38b7f9b4ecf37fa563e96be99d2a9674fe1d0935e6b8a3bbd9e8` |
| `capture/crates/openstage-capture-windows/src/make_edit.rs` | 14741 | `27f27e386b1134f6aeca3b479d27a4019d98e303c327c0c7b50dce5b571f1f85` |
| `capture/crates/openstage-capture-windows/src/pick.rs` | 9906 | `a0bd728bd610832077e170f2e5e7bdd8554c3b6c703c2ed97b133e5504a7fa7f` |
| `capture/crates/openstage-capture-windows/src/queue.rs` | 9769 | `adae916b3400cbe81bb44250a7afba143272168bfe5d93e5b1cc989e401e0a06` |
| `capture/crates/openstage-capture-windows/src/record.rs` | 123446 | `80b4e276aafe30da68dc7ff51a1849590fa909b7a6ee7a0dfc1c8d29160fd524` |
| `capture/crates/openstage-capture-windows/src/region.rs` | 16611 | `9ffe0f00f68c5abf4ac86eee05a6ddc6a0e2f2c7fde2e1f239494fe0e550dc56` |
| `capture/crates/openstage-capture-windows/src/region_editor.rs` | 23344 | `ed4dca4b284257b17abf9a64a605964a5b66d69b8a7c1d6bfb62c4572c5dc625` |
| `capture/crates/openstage-capture-windows/src/region_paint.rs` | 12895 | `6db4f46871c61776fc5d8b897b07f872a04fc318751673d4c58cf0dfd6aa7f7b` |
| `capture/crates/openstage-capture-windows/src/render_cmd.rs` | 18791 | `f1c9d52057634b3ea406dfa6b823adbf10e468c93c008dc1cbc88be6b155bfba` |
| `capture/crates/openstage-capture-windows/src/report.rs` | 42539 | `7bfd499dd5677fc32c5fa3e9c5408a9744c1ddf86a20e9860c6799a6305fdae2` |
| `capture/crates/openstage-capture-windows/src/setup.rs` | 24192 | `91b76c3d8e657997b5cef79178dd30ae6a448f53fc6b6385d94c5fd51f128129` |
| `capture/crates/openstage-capture-windows/src/sound.rs` | 73434 | `3e7e12d6e44f138c9a2cb1c4125095f4fcafd1066602c0e1d64eab8e2822609e` |
| `capture/crates/openstage-capture-windows/src/stats.rs` | 2919 | `19057d83d703d520763fe6d23515529379a293e72467b4c94ebdd9bbe057738c` |
| `capture/crates/openstage-capture-windows/src/timing.rs` | 20751 | `69b9686d4d4a0ff0ae661026a8a7a5df2dc51ecb43482e2d88ead392211611c0` |
| `capture/crates/openstage-capture-windows/src/video.rs` | 58265 | `b1c61b54e20e5b8170fc4c19b03d9298cf53a3d30adfdef7bd95c18b52759a9c` |
| `capture/crates/openstage-capture-windows/src/webcam.rs` | 55811 | `8eefe1581bb0a5ae9f7d31577a359413acd48587c8a755ca191b0d3692b163ca` |
| `capture/crates/openstage-capture-windows/src/win.rs` | 19705 | `83ff9482db6bfae6ed1d5e3ab8e841f025dc02e4360e0c0e5104990e1e7b68ee` |
| `capture/crates/openstage-capture-windows/src/win_audio.rs` | 17041 | `f8c942c66917b87bfc87de9816d90f8d7f6ec2c76983d9c918d8ca19b75f7061` |
| `capture/crates/openstage-capture-windows/src/win_camera.rs` | 20552 | `cc64c8e632b80a3a87f448d3bac6abc1c9381df043a5ad9b0a0ff13f04cf05af` |
| `capture/crates/openstage-capture-windows/src/win_console.rs` | 3759 | `2ff3e295e2db9e2fcc22b9e3648e4b56e71bbca984c5b39dc055968ae1999c8c` |
| `capture/crates/openstage-capture-windows/src/win_cues.rs` | 1798 | `f9e4ade4d04e9adda21f0a87eeb82db6c830931d1fb93aa32a65e768eabb7cda` |
| `capture/crates/openstage-capture-windows/src/win_interactions.rs` | 16815 | `02d8191ef609ac76aee0785eb537ee3d8a599afb4bf17eabce0af0581c3ce91e` |
| `capture/crates/openstage-capture-windows/src/win_layered.rs` | 6248 | `e16922cc0995ea58240aabc2e292864a0a2e21174e399b414ddbc802e5c88824` |
| `capture/crates/openstage-capture-windows/src/win_outline.rs` | 5228 | `b0aa099825d53a61befe0b2fd2ceae8013d0341194c3cac259011155fcac2c3a` |
| `capture/crates/openstage-capture-windows/src/win_pictures.rs` | 18881 | `3f55c794c820ca474ae56788d371502eacaefc1797aba8997465d3e88be8befe` |
| `capture/crates/openstage-capture-windows/src/win_region.rs` | 20014 | `1063f806b7d934c118f08a4fd30f899ccf4b50cefa98278acc5b2b155c38dd53` |
| `capture/crates/openstage-capture-windows/src/win_setup.rs` | 3782 | `64c392d82c6baed52a403e5b0d718a299c70fe030a3bf6702eed569cecf0773f` |
| `capture/crates/openstage-capture-windows/src/win_text.rs` | 6830 | `9f90b3fc6fd3746ac3b55b3a57f7a0a8de44ff5a99c1e7a4282d4d1e7bca373c` |
| `capture/crates/openstage-capture-windows/src/win_video.rs` | 24828 | `704f2eb48727aa9e60b6a0e0bb6e59601eca3b76b75cbff01cb08cec1d6e09a4` |
| `capture/crates/openstage-capture-windows/src/win_windows.rs` | 5251 | `4674f00d5d8423856039f08a2bcd174890714b8a9422fffeefff4a06220df78c` |
| `capture/crates/openstage-capture-windows/src/window.rs` | 15357 | `71512a409a7231b6799e845c5fe83e41a99e626eb981a1295bd631ad845d648a` |
| `capture/crates/openstage-capture-windows/src/yuv.rs` | 12750 | `3a9e7fc8507875d6082e8d099a517737d99b77974bedc60bcf84999f07222562` |
| `capture/crates/openstage-capture/Cargo.toml` | 519 | `afd4f9443c3c4c226b878d8194017552a6aab22f3ed4322b82d8486eaf19eeb5` |
| `capture/crates/openstage-capture/src/clock.rs` | 1678 | `14006f45bf03da810f6ac2722b3ed91ebe77400837bc2314a8495c14042cfb74` |
| `capture/crates/openstage-capture/src/cues.rs` | 15181 | `f908038f824903c8b5a189010b27242e63a79ba5a194084608eede92fb85c858` |
| `capture/crates/openstage-capture/src/lib.rs` | 1089 | `a663103d49509d3acb6c1ce5164b7b374a4f9680002bf5faf21ebcec9f3843f1` |
| `capture/crates/openstage-capture/src/media.rs` | 7650 | `aa70d4027a7f6e783a050c92f248f2db17fa3b685a828b1983437aed452f3702` |
| `capture/crates/openstage-capture/src/session.rs` | 71375 | `97ca52e8a8b6646e8b18fe58d0ab294104edd3c726bcc10a8c58aa77cbb67f34` |
| `capture/crates/openstage-capture/src/source.rs` | 5463 | `bd4d61c31724273d833eb579650def3dc6998ae6ac2b70758211f6d851b5e970` |
| `capture/rust-setup.bat` | 2990 | `b5d6eb3158faa9613958e227e6b01596884ad4690d025fc036b529e4eff767cb` |
| `capture/rustfmt.toml` | 45 | `93ed1668bb2ca659e88711456b72320bf2f53369ecf278c4a61af0cb63cc3a1e` |
| `capture/tools/check_rules.py` | 13756 | `ee5308799a64bae0c86f3be62a513e3abe9cb449bb19f22d99c3330fd1d98763` |
| `capture/tools/hands-free-helper.ps1` | 6322 | `7e70fecaea52cfb549ec1db2d06665cd50c724df4391f10b49708188e75012ad` |
| `docs/capture/capture-edit-format.md` | 28310 | `c56ec3795fa35f80a6b57d046cedcb101ff28d85ce18bf8f01f3ac060db215ad` |
| `docs/capture/capture-project-format.md` | 23839 | `e87ef0361a66f7567eaa5161bdf9b65875e4c97ec06ac85aed09b5fcd16bf5cd` |
| `docs/capture/capture-protocol-spec.md` | 54032 | `7055fb03dde993b150deef6b93ddfc9b9f752618fd318cc679874aeeb5ae2ae7` |
| `docs/capture/openstage-requests.md` | 22290 | `68d8be48e44d4ac6e59fa1158e5e15fe2fec03d04796f7d8225384aa95b50538` |
| `docs/capture/openstage-session-handoff.md` | 25693 | `31177399f7087d399a8a86bd650844c74155f45c2a1a7d944ed39889cc03e864` |
| `docs/capture/prd.md` | 47509 | `7a00138a577412fd2e8736d94ee431c860eabe7ed417cb57503a0e689e8e4774` |
| `docs/capture/product-brief.md` | 78150 | `62de2b8f7fe71d5937f13f36b42c943f18457e8b3db3ce1abcc61837976758af` |
| `docs/capture/roadmap.md` | 106720 | `b65f9038eab09f3e31c0f1c7784bc76b62f0a4c3b6eb1e858d9c38f4ce688dfc` |
