# MVP implementation record

## Extension foundation and native bridge

- Implemented the MV3 TypeScript shell, English popup/list/Options, context menu, isolated provider modules, and initial fixtures.
- Added pinned JavaScript tooling, reproducible build, a stable public extension key, and original geometric icons.
- Added Python framing/schema/provider boundaries, Windows Job Object ownership, exclusive journal access, controlled extraction worker, queue, staging, and safe cleanup/publication.
- Added a per-user installer with pinned yt-dlp and framed handshake verification.
- `pnpm check`: typecheck/build and 8 tests passed.
- Python unittest discovery: 12 tests passed after fixing journal-lock acquisition and requesting directory read access for effective rename protection.
- Real unpacked Chrome for Testing UI smoke passed in a separate profile. Initial bundled test browser had error 14001; the official alternative build ran successfully.
- Installer handshake passed. Queue/crash/recovery tests and real provider acceptance are next.

The user's designated live test posts are Reddit content ID `1wplszd` and X status ID `2103152489772073421`. No credentials are requested or imported.

## Native downloads and final acceptance candidate

Completed the native bridge, per-user installation, protected job lifecycle and real Reddit/X downloads. Both supplied posts saved to the Windows Downloads `VideoDownload` folder and passed full ffmpeg decode and Chrome audio/video playback. Real UI Stop, Continue across browser restart, Stop and delete, and Retry after closing the UI passed. Controlled Chrome content fixtures passed post/quote association, recycled nodes, SPA mutations and settings changes.

Final automated count at this checkpoint: 8 extension tests and 31 native tests, plus real browser/content/live/recovery/media scripts. A concurrent close/stop race discovered in repeated native tests was fixed by serializing Job Object handle disposal; the two subsequent native runs passed. Installation was unregistered/reinstalled as an acceptance check and is currently installed. No normal user Chrome session was closed or controlled.

Documentation now includes installation, troubleshooting, dependencies, measured output details and remaining acceptance. Browser direct download remains disabled under the plan's capability gate; the unused downloads permission was removed. An X public-response parser fallback uses yt-dlp's supported syndication option only on the specific malformed-JSON failure, with unchanged authentication and network boundaries.

Outstanding: live website controls in normal Chrome (test browser hit Reddit humanity protection and X HTTP failure), subjective listening and broader live multi-video coverage. User agreed to perform the normal-Chrome check. Keep the goal active; do not claim complete acceptance yet.

Final storage review added a regression for a stored destination replaced with a junction. Recovery/deletion now validates the stored path without resolving through the replacement. All 32 native tests pass. This final helper update awaits the end of the user's live Chrome test; source and installed helper are explicitly distinguished until then.

## Live X layout correction

The user confirmed Reddit's inline control and supplied a screenshot of an incorrectly stretched X control. Moved the X control from the article's flex children into the content column after its own native action row. Enforced a compact 32px button and wait for a recognized anchor. Updated the Chrome fixture to reproduce a horizontal article layout; checks at 320px and 640px pass. `pnpm check` and the content-script browser smoke passed; the fixture screenshot was inspected. Updated build is ready to reload.

The installer refused the final native guard update because the user's helper connection was active. No process was stopped or active installation overwritten. User action is needed to release that connection after testing; this is an operational lock, not a new permission requirement.
