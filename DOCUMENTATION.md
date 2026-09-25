# MediaFetch project status

Last updated: 2026-09-26

## Current state

The integration and GitHub default branch is `main`, created from the merged `codex/mvp` at `4d5ff05`. The owner explicitly requested that this work remain on `main`; earlier feature branches remain available as history.

Version 0.2.3 is built and installed. It fixes YouTube cache cleanup when ordinary Chrome has no Node on PATH, and includes the Unicode-title fix and title filenames/Shorts controls. TypeScript/build, 19 extension tests and 48 Windows native tests passed; isolated no-Node acceptance and actual installed-helper cleanup passed. The owner then confirmed a complete large-video download with perfectly synchronized audio/video in normal Chrome. Its journal records 1,277,468,514 bytes, completed state, no error and no partials; the owned staging directory is absent. The reported reliability fixes now have both automated and normal-Chrome acceptance evidence below.

Extension and helper **0.2.0** implement public YouTube single-video support, preserving the owner-selected **Slate** design and existing download controls. TypeScript/build, 18 extension tests, 40 Windows native tests, isolated UI/content/history smokes, real watch-page placement/click identity, and native YouTube download/recovery/playback acceptance passed. After the owner disabled the extension, helper 0.2.0 was installed and its framed handshake, all provider capabilities and Deno execution passed. The existing journal's SHA-256 remained unchanged (the list was empty). The owner then enabled/reloaded MediaFetch and explicitly confirmed the correct YouTube button plus download and playback with sound in normal Chrome. Y1 is complete for the scoped single-video workflow. See the record below for exact evidence and coverage limits.

Version 0.1.0 is the completed initial MVP. Reddit and X extraction, real Windows/Chrome Native Messaging, output playback, Stop, Continue, Retry, Stop and delete, browser restart recovery, and fixture-based content controls passed. In normal Chrome the user confirmed Reddit's button, reported the X layout issue, and then confirmed the corrected X button plus download and playback with sound. The final helper storage guard is installed and verified. M0-M6 are complete for these supported public workflows; the evidence and limits below do not imply universal provider or format compatibility.

## Confirmed user decisions

- Conversation stays in Danish; new project material and UI stay in English.
- Default output is a `VideoDownload` subfolder of Downloads.
- Provide a persistent list for continued/retried downloads.
- Provide a way to stop and delete an unfinished download.
- Codex owns routine security and extractor configuration decisions within the approved architecture.
- MCP/ChatGPT integration is future work and does not need implementation now.
- The owner selected A — Slate from the four visual concepts for implementation.
- The owner authorized YouTube after Slate and chose their own public video, `MkycQONC3SE` (Tail Count Nine), as the acceptance target.
- The owner requested title-based YouTube filenames, desktop Shorts support using `GuseDyzBWWQ` (Purr), and development on `main`.

## Implementation assumptions and refinements

- Interpret Downloads initially as the Windows known folder; account explicitly for a separately configured Chrome destination.
- Provide both Stop (retain partials) and Stop and delete (remove owned partials), with distinct Continue and Retry behavior.
- Resume is source-dependent; offer an explicit fresh retry when safe reuse is unavailable.
- Preserve recoverable jobs across restarts. Interrupted jobs wait for user action rather than automatically restarting.
- Use a helper journal and per-job staging directories to make recovery and ownership verifiable. Chrome storage holds settings and the UI view of jobs.
- Use `Up to 1080p` as the initial default; `Best` is uncapped, and `Up to 720p` is also available. Do not let fallback formats bypass a cap.
- Keep the original hybrid architecture. Validate native downloading first and gate the direct path on equivalent destination and lifecycle behavior.

These are documented implementation choices, not claims of tested functionality. No change to product direction, required cloud services, or licensing has been made.

## M0 record — 2026-09-25

Completed:

- Reviewed the feasibility study and checked relevant official Chrome, yt-dlp, and Windows documentation.
- Defined the download destination, persistent history, recovery semantics, safe deletion, security baseline, and milestone acceptance criteria in `PLAN.md`.
- Added an English `README.md` entry point and this status document.

Files changed: `README.md`, `PLAN.md`, `DOCUMENTATION.md` added. The original Danish feasibility study is preserved unchanged.

Validation: reviewed requirements against the user's decisions and the feasibility study; checked local document links, Markdown structure, and repository changes. No build or runtime tests apply to this documentation-only milestone. Actual browser/helper/download behavior remains unverified.

Changes from the study: fixed default subfolder; durable recovery list instead of short-lived job history; explicit Stop/Continue/Retry/delete semantics; security introduced alongside components rather than deferred to hardening; helper-owned recovery journal; direct downloads subject to destination and cleanup acceptance.

Remaining: all M1-M6 implementation and runtime validation. M1 can proceed autonomously within `PLAN.md`; major scope, architecture, security, licensing, or required paid/cloud dependency changes still require the user's decision.

## Repository working files — 2026-09-25

Completed: added `AGENTS.md` with durable repository instructions and introduced `.editorconfig`, `.gitattributes`, and `.gitignore`. Added `.logs/2026-09-25-project-setup.md` as the first concise work record. Updated `README.md` to make the guidance discoverable.

Files changed: the five working/configuration files above added; `README.md` and this status document updated.

Validation: local document links, UTF-8 decoding, final newlines, and Markdown structure checked; representative Git ignore/attribute behavior checked; instructions reviewed for consistency with `PLAN.md`. Documentation, applicable lockfiles, sanitized fixtures, and Markdown work records remain trackable. No application build or runtime tests exist yet.

Assumptions: use UTF-8 and LF text by default, four-space Python/PowerShell indentation, and CRLF for Windows batch launchers. These are local development conventions and do not select new dependencies or change the approved stack.

Deviations: none to product behavior, architecture, or milestone scope. Remaining work starts at M1, which can proceed autonomously under the plan.

## M1 and native foundation — 2026-09-25

Implemented: TypeScript extension shell and original UI assets; stable public development identity; strict provider parsing and message routing; provider DOM modules and initial inline controls; Python protocol, journal, Windows process ownership, protected staging/cleanup, download worker and scheduler; per-user installer and unregister script.

Validation so far: `pnpm check` passed (typecheck, 8 behavioral tests, build). Isolated Chrome for Testing 154.0.8037.57 loaded the actual unpacked extension, rendered its pages, preserved Options after reload, registered the context menu, and rejected a deceptive URL without page errors. Twelve native boundary/filesystem tests passed, including directory rename protection, collision handling, exclusive journal ownership, and cleanup containment. The installer passed a real framed helper handshake with yt-dlp 2026.8.19 and ffmpeg 8.1.2.

Environment note: Playwright's default Chrome for Testing 153.0.8010.12 failed with Windows side-by-side error 14001. An official alternative test browser is used via `MEDIAFETCH_TEST_CHROME`. No changes were made to the user's normal Chrome session. Browser evidence is in ignored `artifacts/`; the smoke command can reproduce it.

Implementation choice: yt-dlp runs through its Python API in an isolated owned subprocess. The API does not load command-line configuration, and plugin discovery is explicitly disabled. This provides structured progress without parsing arbitrary console output and preserves the planned process boundary.

Remaining: process/crash/queue/recovery integration tests; real Chrome Native Messaging acceptance; live Reddit/X media verification; direct-path capability acceptance; final documentation. Continue autonomously within M2-M6. The product is not yet declared complete.

## M2-M6 implementation and acceptance — 2026-09-25

### Delivered components

- `extension/`: strict provider parsing, isolated Reddit/X adapters, bounded DOM observation, inline controls, context menu, toolbar popup, persistent list, Options, English UI and original icon assets. Privileged controls accept messages only from the extension's own UI.
- `native-host/`: versioned framed protocol, exclusive journal writer, two-job scheduler, per-attempt Windows Job Objects, isolated yt-dlp worker, pinned provider network/redirect policy, protected staging, collision-safe publication, and checked deletion of owned regular files. Worker failures and signed source URLs are sanitized before exposure.
- `installer/`: per-user install, physical-path handling for MSIX terminals, exact extension-origin registration, verified handshake, update guard, and unregister-only uninstall preserving data.
- `scripts/`, `extension/tests/`, `native-host/tests/`: reproducible builds and deterministic boundaries/process/filesystem tests, real Chrome content fixtures, opt-in live downloads/recovery, ffprobe/full decode/Chrome audio-video playback checks.
- `README.md`, `DEPENDENCIES.md`, `PLAN.md`, this file and `.logs/`: installation, controls, troubleshooting, tested versions, update procedure and evidence boundaries.

### Verification results

| Check | Result and scope |
| --- | --- |
| `pnpm check` | Passed: TypeScript, 8 behavioral tests, production build. |
| `scripts/test-native.ps1` | Passed: 32 tests. Two 31-test runs passed after fixing a handle-close race; the subsequent destination-root replacement regression also passed. |
| Per-user installation and uninstall/reinstall | Passed real framed handshake and HKCU registration; final state is installed. Existing history and videos preserved. |
| `pnpm test:browser` | Passed in Chrome for Testing 154.0.8037.57: actual unpacked extension, popup/list rendering, real helper status, settings persistence, menu registration, deceptive-URL rejection; no page errors. |
| `scripts/content-smoke.mjs` | Passed in real Chrome on controlled fixtures: exact Reddit inline/context post, recycled identity, distinct X quote/outer/neighbor context, SPA mutations, idempotence and settings toggles. Separate test extension identity cannot access the installed helper. |
| `scripts/live-smoke.mjs --run ...` | Both user-selected public videos completed through Chrome and the installed native helper into the default `VideoDownload` folder. |
| `scripts/recovery-smoke.mjs --run` | Actual UI Stop/Continue and Stop and delete passed. Retained data survived browser restart; Continue completed; cancellation removed the owned staging directory; Retry completed after the UI closed. Test destination restored afterward. |
| `scripts/validate-media.mjs` | Four files passed ffprobe, full ffmpeg decode, and Chrome playback: both originals plus continued/retried outputs. Video time advanced, frames decoded, Web Audio measured non-silent output, no media error. |
| `scripts/provider-smoke.mjs --run` | Live page acceptance blocked: Reddit displayed “Prove your humanity”; X returned `ERR_HTTP_RESPONSE_CODE_FAILURE`. No verification of live inline placement was inferred from fixture tests. |

The two supplied posts contain the same approximately 88.725-second Enterprise-D scene. Reddit produced H.264 1280×536 with stereo AAC at 48 kHz (12,041,763 bytes); X produced H.264 1920×804 with stereo AAC at 48 kHz (22,549,346 bytes). Mean audio was -19.4 dB, and measured Chrome audio RMS exceeded 0.14 in the playback sample. Visual inspection confirmed the rendered video and extension UI. These measurements establish decoded, non-silent playback; they are not a claim of subjective human listening.

Local evidence is in ignored `artifacts/browser-smoke.json`, `content-smoke.json`, `live-smoke.json`, `recovery-smoke.json`, `media-validation.json`, provider-page findings and screenshots. Avoid committing raw personal browsing/job data. The original videos remain in Windows Downloads; later recovery-test copies are in ignored `.local/`. Some earlier repeated acceptance runs produced collision-suffixed copies, which were preserved.

### Acceptance matrix and limits

| Requirement | Evidence / remaining limit |
| --- | --- |
| Public Reddit with separate audio; public X | Live extraction, real helper, stream inspection, full decode and Chrome playback passed for the supplied posts. |
| Detail/feed/quote/selected media identity | Provider URL/DOM tests and real content-script fixtures passed. The user verified live Reddit placement and live X placement/download. Quote/feed behavior has fixture evidence; the actual OS context-menu gesture and a live multi-video post are additional coverage not claimed here. |
| No media, unsupported provider, auth requirement | Explicit errors, extractor/network allowlists, exact-host and redirect tests. No cookie import or generic embed downloading. Not every provider error response was reproduced live. |
| Two active jobs and a queued third | Windows fake-worker integration test; the third remains queued until an owned slot exits. |
| UI closure / browser restart / helper crash | Real UI closure and restart passed; abrupt host termination test proved worker and grandchild exit. Recovered jobs wait for user action. |
| Continue / incompatible source | Live retained HLS fragments completed after restart; source fingerprint mismatch rejects reuse in deterministic tests. HTTP resume status only claims a byte-range offset after a 206 response; a 200 restart is communicated. Universal resume is not promised. |
| Stop/delete during transfer and merge | Real transfer controls plus deterministic merging cancellation. Partial cleanup, locked files, ancestor renames, junctions and neighboring files covered by Windows tests. |
| Completion/delete race | Published file survives late cancellation. A close/stop handle-disposal race found during tests was fixed by serializing disposal under the scheduler lock. |
| Destination change and collisions | Existing-job destination retention, real known-folder default, safe filename and no-overwrite publication tests passed. Windows known-folder redirection was not changed on the user's machine. |
| Malformed requests / unsafe paths / config isolation | Schema/framing/provider/filesystem tests; argument-array subprocess invocation, isolated Python API and disabled yt-dlp plugin/config inheritance. |
| Missing helper / ffmpeg / timeout | Real disconnected-helper handling; missing-ffmpeg admission and owned timeout tests; practical recovery messages. Disk-full and destination-denial messages are implemented but destructive full-disk or ACL experiments were not performed. |
| Browser direct engine | Disabled; all jobs use the verified helper fallback. No direct-engine lifecycle claims. |
| YouTube / future integrations | No enabled YouTube entry point or permission; MCP/ChatGPT work remains parked. |

### Decisions and deviations

The helper owns every currently enabled transfer. The plan explicitly gates direct downloading on destination and lifecycle parity. Chrome's documented relative filenames and completion-only `removeFile` do not establish that parity for unfinished data, so direct support remains unadvertised and its unused permission was removed. This is the planned conservative fallback, not a second partially implemented download engine. See the [Chrome Downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads).

X intermittently returned non-JSON from yt-dlp's public GraphQL route. The worker now uses yt-dlp's supported public syndication extraction option only for that precise parser failure. Authentication failures do not trigger this fallback. Controlled extraction, no cookies, capped quality, and the same network allowlist remain in force.

The pinned yt-dlp Python API supplies structured progress instead of parsing CLI console output. Output fingerprints use content/format identity, not expiring media URLs. A small crash window between final rename and journal persistence can leave a saved file alongside an interrupted entry; a Retry may create another collision-suffixed file. Recovery never deletes the published video.

The final storage regression rejects a destination root replaced with a junction after the job was recorded, in addition to rejecting junctions inside staging. This source change passed all 32 native tests. After the user disabled the extension, the final guard was installed, the framed handshake passed, and the installed storage module's SHA-256 matched the tested source.

No change was made to product direction, licensing, required cloud dependencies, or the deferred integration scope. Browser test binaries, dependencies, runtime artifacts and private signing material are not committed. Normal Chrome was not restarted or automated.

### Normal-Chrome acceptance and continuation

The user confirmed the Reddit button appears correctly. Their X screenshot revealed that appending the control directly to the article created a stretched flex column. The X adapter now locates the post's own native action row and mounts the compact control after that row, inside the content column. When that anchor is unavailable it waits for a DOM update instead of changing the article layout. The rebuilt extension passed `pnpm check` and the Chrome content smoke, including 320px/640px width checks and visual inspection. Reddit placement remains unchanged. No helper change is required for this visual fix.

The user enabled the rebuilt extension, reloaded X, and explicitly confirmed that the button, downloading and playback with sound work. Together with the earlier Reddit placement confirmation, automated native/browser checks and both public media downloads, this closes the initial MVP acceptance. The final native storage guard is installed. The installer first refused the active connection; after the user disabled the extension, update and verification succeeded.

The actual OS context-menu gesture, broader live quoted/feed/multi-video examples, redirected known-folder machines, and physical full-disk/ACL cases remain coverage limits rather than passed live checks. Their supported boundaries and automated evidence are listed above. No active implementation blocker remains for the initial MVP. Future provider changes or newly reported defects can be handled within the same architecture; direct-engine enablement and MCP/ChatGPT integration remain separate future work. Do not interrupt the user's running Chrome to start more tests.

## Post-MVP patch 0.1.1 — history and GIF controls

User request: add Remove all to the list and avoid the video button on X GIFs, illustrated with the site's shared video-player wrapper and a visible GIF label.

Implemented:

- Added Remove all to the full list, with visible file-preservation guidance, disabled/working states and result feedback. The trusted service worker requests a fresh native snapshot, captures eligible inactive jobs, and uses existing individual `forget` requests. The helper rechecks live state and real partial files for each request. Concurrent batch calls share one operation; individual refusals remain visible. No delete, stop, file removal or unrequested history clearing occurs.
- X checks GIF labels inside each player instead of interpreting every video wrapper as ordinary video. Text elsewhere in the post does not count as a GIF label; ordinary looping videos remain eligible. Late GIF labels remove an existing button, recycled players can regain it, and a GIF video context does not yield a download candidate. Quoted GIFs do not become the outer post's video. URL-based downloading remains governed by the existing extractor; this patch is a page-control filter, not a general GIF export feature.
- Updated the extension/package version to 0.1.1 and the UI footer to show the manifest version. Helper 0.1.0 and protocol 1 remain compatible, so the user's active native installation was not touched.

Changed files: `extension/src/background/history.ts`, service-worker routing, X adapter, content script, list UI, extension manifest/package version, extension tests, native forget-preservation test, browser smoke scripts, README/PLAN/status and implementation log.

Validation: `pnpm check` passed (14 tests, typecheck, build); `scripts/test-native.ps1` passed (33 tests, including actual saved-file preservation after forgetting history). `content-smoke.mjs` passed real Chrome controlled-fixture checks including late GIF labels and X layout. `history-smoke.mjs` passed actual UI/service-worker routing with an explicitly isolated native-protocol double: only eligible entries disappeared, active/retained jobs stayed, Remove all disabled when nothing remained eligible, and state survived page reload. The list screenshot was visually inspected. No live provider download or user's history deletion was required for these changes.

Assumptions: Remove all means clear removable history, preserving the original recovery/file-ownership contract. GIF suppression uses the GIF marker evidenced by the user's screenshot; a future unmarked layout could require another adapter adjustment. No architecture/security/licensing change or helper update was needed. The user subsequently confirmed that the patch works; no broader live-provider coverage is inferred from that confirmation.

## Visual exploration — 2026-09-25

The user requested mockups to choose a new visual direction. Four interactive concepts are ready: Slate, Canvas, Signal and Archive, each covering the full list, popup and compact in-page control. They differ in composition, typography, spacing and palette. See [design rationale and research](design/EXPLORATION.md).

Changed files: `design/EXPLORATION.md`, `design/mediafetch-directions.html`, `scripts/design-smoke.mjs`, this status document and `.logs/2026-09-25-design-exploration.md`. The conversation copy is displayed as an inline preview. No extension source, built extension, version, installed helper or user history changed.

Validation: the skill preview renderer and `pnpm exec node scripts/design-smoke.mjs` passed using the isolated Chrome for Testing binary. All eight variants rendered without page errors, all four directions fit 736px/360px/320px widths without horizontal overflow, and the default 408px-wide popup stayed within 600px height. Local sample interactions passed. Screenshots were visually inspected. This validates the prototypes, not production integration or the full accessibility surface.

Assumptions at exploration time: mock controls operate on illustrative jobs only; the current download, recovery, deletion and security contracts remain authoritative. Grouping, compact popup content and layout are proposed presentation changes. No architecture, security, licensing or future-integration deviation occurred. The owner subsequently selected Slate; the implementation follows below.

## Slate implementation 0.1.2 — 2026-09-25

Implemented the selected A direction in production extension pages. The cool graphite palette, lavender accent, compact header, sidebar and aligned job rows follow the concept. At narrow widths navigation becomes a horizontal row. Jobs are grouped into In progress, Needs attention and Finished; retained partials remain visible in Needs attention even for an otherwise completed state. Each state retains the actions from the existing contract. Merging is labeled explicitly and does not display a completed percentage.

The popup shows two recent entries, the total count, attention count and a persistent View all downloads link. Its shell is bounded to 600px; longer content and expanded helper guidance scroll within it. Settings keeps quality, Reddit/X toggles, destination configuration and setup guidance. Completed paths are available under Saved file. Original local icons and regenerated toolbar marks use the selected palette. The inline button uses the same palette with its existing compact geometry, anchors and GIF detection.

Interaction refinements: focus lost by disabling an action button is restored without overriding a user's move to another control; focused titles and file summaries survive refresh. Expanded file details and selected video numbers persist across background list updates. Native strings continue to render as text, with wrapping for long titles, errors and paths. The helper's ownership, recovery and deletion rules are unchanged.

Changed files: `extension/src/ui/app.ts`, new `ui/icons.ts`, `extension/assets/app.css`, page shells, logo/raster icons, content button CSS, the service-worker badge color, manifest/package version, icon generator, browser/UI smoke scripts, README, PLAN, design status, this document and the implementation log. No helper source, installer, permission, dependency or private state changed.

Validation:

- `pnpm check` passed after the final UI changes: TypeScript, 14 behavioral tests and production build. Stable extension ID remains `gemldedgcfjpnfoohndccolnbnpkhalf`.
- `scripts/ui-smoke.mjs` passed actual extension pages and service-worker routing with an isolated native-protocol double: all eleven job states, grouping, transitional actions, Stop/Continue/delete/removal, multi-video Retry including selection after focus moves, saved-file disclosure/focus retention, preferences after reload, destination routing, URL rejection, enqueue quality, popup bounds, reconnect and empty states. No page errors.
- `scripts/history-smoke.mjs` passed eligible-history-only removal, retained jobs, disabled states and reload. `scripts/content-smoke.mjs` passed Reddit identity, compact X geometry at 320px/640px, quote handling, late/recycled GIF labels and settings toggles.
- All three production pages fit 736px, 360px and 320px without horizontal overflow. Screenshots of desktop, popup, settings, narrow pages, empty and disconnected/long-content states were visually inspected. Evidence is in ignored `artifacts/slate/` plus the existing content/history artifacts.

An initial UI smoke exposed focus loss on Stop; the implementation was corrected. A later assertion needed the job ID because grouping correctly moved the changed failed entry away from the first row. Final smoke passed. Native integration/live download tests were not rerun for this presentation change; prior evidence remains historical. Browser doubles do not prove live extraction or filesystem effects. No claim is made of a full accessibility audit or activation in the user's normal Chrome.

Assumptions/deviations: the popup's two-entry limit and grouped rows implement the accepted concept. Setup guidance, saved paths, multi-video selection and unusual states remain available in the real product. Small focus/selection fixes support the new layout; there is no architecture/security/licensing change. Implementation is complete and can be activated through the standard extension reload once downloads finish. The installed helper and active browser were left running; no reinstall is required.

## YouTube Y1 / 0.2.0 — 2026-09-25

The owner authorized this provider after the Slate release and selected their own public video, [Tail Count Nine](https://www.youtube.com/watch?v=MkycQONC3SE), replacing the initial example. The implementation is on `codex/youtube`, based on the pushed Slate commit `4882916`.

Implemented:

- Exact HTTPS watch, youtu.be and Shorts URLs resolve to one 11-character ID. Playlist/time/tracking context is discarded. Playlist/channel downloads, ongoing/upcoming/still-processing streams, authenticated/age-restricted videos, DRM and unrelated media protocols are rejected. Existing quality limits and the helper's two-job queue/lifecycle remain authoritative.
- Extension/native provider schemas, persisted-settings migration, the YouTube inline preference, provider labels and capability admission are updated. Helpers without YouTube capability keep serving Reddit/X and give an actionable update message before a YouTube enqueue. Protocol 1 remains unchanged. Page permissions add only exact YouTube host variants.
- A separate YouTube DOM adapter checks the current watch page against its DOM video ID, or a recognized active Short against its ID/permalink. It waits for a placement anchor, suppresses advertisements and hidden/stale players, handles SPA identity changes, and rechecks identity at click time. Explicit video links can identify other videos independently. The watch control sits below the native channel/action row. Unknown/mobile/embedded layouts may require paste/context-menu use.
- Pinned local `yt-dlp-ejs==0.8.0` and `deno==2.9.5` accompany existing `yt-dlp==2026.8.19`. Deno is selected from the helper environment, with restricted execution and no ambient runtime options or remote components. The Python downloader validates YouTube metadata/CDN destinations and redirects before requests. External ffmpeg media downloading is disabled for this provider; local ffmpeg merging remains enabled. No browser credentials or alternate authenticated clients are introduced.
- Deno writes a small analysis cache even with code caching disabled. Cleanup recognizes only its fixed file names and an empty npm directory inside the job's `.runtime-cache`. Handles validate/lock ancestry, reparse points and file identity. Unexpected files, nested content and junctions remain preserved with a visible cleanup failure. There is no recursive deletion or shared runtime cache.
- Continued YouTube chunk transfers recognize bounded HTTP Range headers and report the first actual reused offset; fresh downloads no longer report ordinary chunks as resume. HTTP 403 alone is classified as a media-server refusal rather than proof of private/authenticated content.
- Installer wheels are pinned; verification requires all three provider capabilities and executable Deno 2.9.5 before updating registration. Active-helper protection remains in force.

Changed files: provider/content adapters and shared contracts, service-worker admission, Slate settings/provider text, manifest/package versions; native YouTube policy/runtime, network/worker/scheduler/storage/error handling and requirements; installer and verification; extension/native tests; YouTube live/content scripts and existing UI/media validation scripts; README/PLAN/DEPENDENCIES, AGENTS, this status document and `.logs/2026-09-25-youtube.md`.

Validation:

- `pnpm check`: passed typecheck, 18 tests and production build. Stable extension ID is unchanged. `scripts/test-native.ps1`: 40 tests passed, including Windows process-tree ownership, existing queue/recovery/deletion boundaries, strict YouTube URL/network/redirect restrictions, live/access rejection, runtime permission checks, missing-runtime capability, bounded Range reporting and cache/junction preservation.
- `scripts/ui-smoke.mjs`: passed actual Slate UI/service-worker routing with an isolated native-protocol double, including the YouTube preference and old/new helper capability behavior. `content-smoke.mjs` and `history-smoke.mjs`: existing Reddit/X targeting, GIF suppression, compact control layout and history preservation passed. These doubles do not prove provider downloads.
- `scripts/youtube-content-smoke.mjs --live`: watch/Shorts fixtures passed for click identity, ads, hidden/recycled players, mismatched URL/DOM during SPA navigation and settings toggles. The real owner-selected watch page rendered one compact control and a real click sent its canonical identity. The test used a separate extension identity/profile and could not connect to the user's helper. The fresh profile's EU consent dialog was dismissed using its visible Reject action; cookies were never transferred to the helper. Full OS context-menu gestures and broad live Shorts/mobile layouts remain unverified.
- `scripts/youtube-live.py --run --recovery <owner URL>`: the real framed native entry point used a separate journal/destination under `.local/youtube-g7ingeha`. First download completed; Stop preserved partial media; Continue after closing/reopening that helper reused **64,512 bytes**, completed, and left no staging data. A third active attempt was stopped/deleted; both completed files remained. Final evidence: ignored `artifacts/youtube-live.json`. The test waits for actual bytes before Stop and the settled cleanup revision after publication.
- `scripts/validate-media.mjs --youtube`: both outputs were **1280×720 H.264, stereo AAC 44.1 kHz, 224.862 seconds, 59,295,588 bytes**. Full ffmpeg decode passed; mean audio was **−15.3 dB**. Chrome decoded 113/114 frames during the sampled playback with nonzero audio RMS and no media errors. The visualizer frame was visually inspected. Evidence: `artifacts/youtube-media-validation.json` and playback screenshots. Automated audio measurement establishes non-silent decoded audio; the owner subsequently confirmed download/playback with sound in normal Chrome as the separate manual acceptance step.

Findings and limits: early public media requests intermittently returned 403; subsequent ordinary attempts succeeded without credential import, client overrides or access-control workarounds. Native acceptance exposed and fixed the Deno cache cleanup gap. Two intermediate smoke failures were synchronization issues: terminal publication precedes its cleanup revision, and the downloading state can precede the first byte. The tests now require settled outcomes rather than accepting those transient snapshots. The cookie-dialog test initially used its visible text instead of its longer accessible name; correcting the test locator completed the real click check. No universal YouTube/Shorts compatibility claim is made.

Assumptions/deviations: this is the owner-authorized single-video extension of the existing helper architecture. Local runtime dependencies, the fixed cache layout and conservative DOM anchors are supporting implementation details. Private/unpacked distribution, security/data-ownership model and licensing remain unchanged; MCP/ChatGPT and direct downloads stay parked. No paid/cloud dependency was added. The installed helper's active lock was checked without changing the user's session. After the owner explicitly disabled MediaFetch, `installer/install.ps1` installed 0.2.0 and passed its framed handshake, Reddit/X/YouTube capability checks and Deno version/execution check. Existing registration keeps the stable extension ID and physical packaged-app path; the journal's SHA-256 was identical before/after (zero entries). No normal Chrome process was restarted or terminated. The final live-page screenshot was visually inspected after consent dismissal.

The owner enabled/reloaded MediaFetch and confirmed that the YouTube button and download with sound work. This closes Y1's scoped implementation, build, installation and normal-Chrome acceptance. No implementation blocker remains. Broader provider coverage can continue within these boundaries if requested; live Shorts/mobile layouts and universal resumability remain coverage limits, and the future MCP/ChatGPT integration stays parked. Delivery branch: `codex/youtube`. The owner subsequently requested committing and pushing this completed milestone.

## Main branch and README refresh — 2026-09-25

After merging YouTube through PR #1, the owner requested a README update on `main`. Remote inspection showed that `codex/mvp` was still the default branch and no `main` existed. The owner explicitly chose to create `main` from the merged MVP and make it the default. The new branch starts at `4d5ff05`, preserving the complete history and integrated 0.2.0 code; no earlier branch is deleted or rewritten.

README now introduces the current product, supported providers and limits, quality choices and download controls. Installation starts from a fresh clone and explains that `extension/dist` must be built. It replaces the development machine's fixed checkout path with a local path lookup, documents the 0.1.x upgrade and transition to `main`, and distinguishes isolated fixtures from tests that connect to the installed helper. Detailed browser commands are collapsed for easier reading. Existing acceptance results remain historical evidence, with their limits intact.

Changed files: `README.md`, this status document and `.logs/2026-09-25-main-readme.md`. Validation passed for 12 local Markdown links/anchors, balanced code fences/details markup, UTF-8/final newline, referenced scripts and package/manifest version consistency. Installer, native-host and browser-test source were inspected to verify the instructions; `git diff --check` passed. Runtime tests were not repeated for documentation-only edits. No implementation, build output, installed helper, user history or active Chrome state changed. Delivery consists of committing/pushing `main`, changing GitHub's default branch with the owner's authorization, and checking remote/local synchronization.

## Y1.1 — YouTube title filenames and desktop Shorts — 2026-09-25

New YouTube downloads publish as the extracted title plus the actual media extension (`Purr.mp4`, `Tail Count Nine.mp4`), with Windows-invalid characters normalized, reserved device names guarded, whitespace/trailing dots handled, and a 180 UTF-16-unit title bound that preserves whole Unicode characters. Collisions use the existing atomic no-overwrite publication (`Purr (1).mp4`). Existing files and Reddit/X naming remain intact.

The actual desktop Shorts renderer has no `is-active` or `video-id`; its visible shared player owns the explicit permalink. The adapter requires that permalink to match the current URL and ignores blank/fragment-only links, hidden players and ads. A compact button sits below the native top controls, anchored inside their overlay without resizing the player/actions. Pointer events are explicitly enabled because YouTube's containing overlay disables them. Moving a shared player between renderers and URL/DOM disagreement remove stale controls. Legacy recognized layouts and settings toggles remain supported.

Changed files: YouTube adapter, shared content placement and YouTube tests; native storage/filename tests; package/extension/helper versions (0.2.1); YouTube content/native acceptance scripts and media validator; README, PLAN, this document and `.logs/2026-09-25-youtube-titles-shorts.md`.

Validation:

- `pnpm check`: TypeScript, 19 tests and production build passed. `scripts/test-native.ps1`: 42 tests passed, including real Windows creation of reserved/invalid/Unicode title variants and collision-safe publication of two distinct videos with the same title. Existing process ownership, queue/recovery, cleanup and network-policy tests remain green.
- `scripts/youtube-content-smoke.mjs --live`: old/current Shorts fixtures, moved shared player, blank permalink rejection, hidden/advertisement states, stale URL/DOM identities, settings toggles and actual enqueue identities passed. Both real owner-selected pages rendered one compact button and accepted a real pointer click for the correct video. Chrome for Testing 154.0.8037.57 used a separate profile and extension identity without access to the installed helper. An initial live click exposed inherited `pointer-events:none`; the final control explicitly enables pointer events and the real click passed. `scripts/content-smoke.mjs` passed existing Reddit/X/GIF/layout regressions.
- `scripts/youtube-live.py --run --expected-title Purr --evidence artifacts/youtube-shorts-live.json https://www.youtube.com/shorts/GuseDyzBWWQ`: real framed helper downloaded `Purr.mp4` with no retained staging or error. The analogous watch test with `--expected-title 'Tail Count Nine' --evidence artifacts/youtube-title-live.json` downloaded `Tail Count Nine.mp4`. Each used its own journal/destination under `.local`, with no user-history changes.
- `scripts/validate-media.mjs --youtube --evidence <test evidence> --output <separate validation evidence>`: Purr is 608×1080 VP9 with stereo AAC 44.1 kHz, 151.673 seconds and 4,018,504 bytes; Tail Count Nine is 1280×720 H.264 with stereo AAC 44.1 kHz, 224.862 seconds and 59,295,588 bytes. Both full ffmpeg decodes passed. Mean audio is −14.6/−15.3 dB; Chrome playback decoded frames, advanced time, measured nonzero audio RMS and reported no media error. This proves decoded non-silent audio, not a human listening check. Separate evidence lives in ignored `artifacts/youtube-shorts-media-validation.json` and `artifacts/youtube-title-media-validation.json`.

Assumptions/deviations: the owner requested these local refinements on `main`; no architecture, protocol, dependency, permission, licensing, security-model or data-ownership change. Title normalization and collision suffixes are necessary Windows publication details. No previous file is renamed. Current desktop layout coverage does not promise mobile or all future Shorts layouts. The saved Purr frame and Shorts placement screenshot were visually inspected. Documentation formatting/local links, version consistency and `git diff --check` passed. Helper installation and normal-Chrome acceptance remain the final steps: the registered 0.2.0 helper's lock is active, so the owner was asked to finish downloads and disable the extension before installation. No process was terminated. The owner subsequently requested committing and pushing 0.2.1 directly to `main`; delivery completed as `18c3754`, with local installation pending independently of Git delivery.

## Y1.2 — Unicode worker-pipe reliability — 2026-09-25

The owner reported repeated generic failures on `-XUltrEfXFc`. The same failure reproduced with the current source in an isolated native session, so the older installed helper was not the sole explanation. Metadata extraction actually succeeded; emitting its title (`MOIKALOOP x Bemax - Watashi (Original Song) わたし Phonk [AMV]`) raised `UnicodeEncodeError` because Windows redirected stdout used cp1252. Danish characters also exposed the inverse failure: cp1252 could write them, but the scheduler could not parse those bytes as UTF-8 JSON.

The worker now emits ASCII-safe JSON escapes. Parsing restores the original Unicode title in status, journal and filenames. This small fix applies to all worker event types and providers. No credentials, alternate endpoints, network-policy relaxation, dependency change or broad retry behavior is involved. The protocol and security model stay unchanged.

Changed files: native `worker.py`; worker encoding tests and scheduler integration test/fixture; extension/package/helper versions (0.2.2); README, PLAN, this document and `.logs/2026-09-25-unicode-worker-pipe.md`.

Validation:

- Regression tests first reproduced four failing encoding cases. After the fix, `scripts/test-native.ps1` passed all **44 tests**, including identity/completion over cp1252, ASCII and UTF-8, exact Danish/Japanese/emoji roundtrips, newline framing, and a real owned subprocess publishing the Unicode filename and persisting its title in the journal. The scheduler fixture now uses the production emitter rather than a separate implementation.
- `pnpm check` passed typecheck, **19 tests** and the 0.2.2 production build. Extension identity is unchanged. Browser DOM code was unchanged in this fix, so prior watch/Shorts acceptance was not repeated.
- `scripts/youtube-live.py --run --evidence artifacts/youtube-unicode-live.json https://www.youtube.com/watch?v=-XUltrEfXFc` completed through the real framed helper in a separate journal/destination under `.local/youtube-04366cpy`. The title and filename retain the Japanese text; no partials/error remain. The original failure is retained in ignored `artifacts/youtube-reported-failure.json`.
- `scripts/validate-media.mjs --youtube --evidence artifacts/youtube-unicode-live.json --output artifacts/youtube-unicode-media-validation.json`: **1920×1080 H.264**, stereo AAC 44.1 kHz, **117.632 seconds**, **27,826,367 bytes**. Full decode passed, mean audio was **−7.8 dB**, and Chrome decoded 90 sampled frames with nonzero audio RMS, advancing playback and no media error. The downloaded video's playback screenshot was visually inspected. Audio is verified by decoding/measurement; normal-Chrome owner confirmation remains separate.

Installation: the owner confirmed MediaFetch was disabled. The inactive-helper check passed; `installer/install.ps1` upgraded the existing per-user installation to 0.2.2, including the filename/Shorts changes. The real framed handshake, Reddit/X/YouTube capabilities, ffmpeg and pinned Deno execution checks passed. All eleven installed Python source files match the tested source. The journal's SHA-256 was identical before/after, preserving all eight entries. Native registration retains the exact stable extension origin. No browser was restarted or terminated, no user history was edited, and no existing video was renamed.

The owner re-enabled MediaFetch and confirmed the video reached disk with its Unicode title. Normal Chrome then exposed a separate runtime-cache cleanup failure, recorded in Y1.3 below. The Unicode failure is resolved; this is not evidence that cleanup passed in that environment.

## Y1.3 — Deno cache cleanup without Node on PATH — 2026-09-26

Read-only inspection of the completed Watashi job found normal analysis caches plus `.runtime-cache/node_compat_bin/node.exe`, a two-link alias of Deno. The pinned [Deno 2.9.5 implementation](https://github.com/denoland/deno/blob/v2.9.5/cli/node_compat_shim.rs) creates this compatibility alias when no real Node executable is on PATH. The development environment had Node, so earlier acceptance missed the ordinary-Chrome behavior. The existing bounded cleanup correctly refused an unknown directory/hardlink and preserved the final video.

Runtime setup now explicitly applies `DENO_DISABLE_NODE_SHIM=1` after clearing inherited overrides. This optional shim is unnecessary for the local EJS solver. Legacy cleanup recognizes only `node_compat_bin/node.exe`: copied files use normal deletion; hardlinks must match the trusted installed runtime's volume/file identity through no-follow handles. The owned alias handle denies name replacement during validation and deletion. No recursion, arbitrary hardlinks, directory links or unknown children are accepted; the runtime and published video remain intact. Remove all keeps its existing retained-files guard.

Changed files: runtime setup, bounded cache cleanup and Windows handle helper; runtime/storage/scheduler tests; YouTube live script's optional `--without-node` mode; package/extension/helper versions (0.2.3); README/PLAN, this document and `.logs/2026-09-26-deno-cache-cleanup.md`. No dependency, protocol, permission or deployment change; this retains the existing job-ownership model.

Validation:

- The real Deno regression first reproduced shim creation with an empty PATH; it passes after the explicit opt-out. `scripts/test-native.ps1` passed **48 tests**, including copy/hardlink cleanup preserving the runtime and completed video, unknown/nested/junction/foreign-link preservation, and a completed-job cleanup retry that clears the warning while retaining its saved file/state. Existing Unicode, process ownership, network, queue and recovery checks remain green.
- `pnpm check`: typecheck, **19 tests** and the 0.2.3 production build passed. Browser DOM code is unchanged in this cleanup fix.
- `scripts/youtube-live.py --run --without-node --evidence artifacts/youtube-no-node-live.json https://www.youtube.com/watch?v=-XUltrEfXFc`: the real framed helper downloaded the reported video with `nodeOnPath: false`, finished with no partials/error and removed staging. The restricted PATH applies only to this isolated test process and its children. Evidence uses a separate journal/destination under `.local/youtube-otnwhain`.
- `scripts/validate-media.mjs --youtube --evidence artifacts/youtube-no-node-live.json --output artifacts/youtube-no-node-media-validation.json`: full decode and Chrome playback passed, **1920×1080 H.264/AAC stereo**, **117.632 seconds**, **27,826,367 bytes**, **−7.8 dB** mean audio, nonzero browser audio RMS, 90 sampled decoded frames and no media error.

Installation and repair: the owner cleared ten eligible history entries and then disabled MediaFetch. The inactive-helper check passed; `installer/install.ps1` installed 0.2.3 and verified the framed handshake, all provider capabilities, ffmpeg and the pinned Deno runtime. All eleven installed Python source files match the tested source. Installation itself preserved the one-entry journal byte-for-byte.

The installed helper then processed only that completed row's native `delete` action (cleanup of retained artifacts). The job remains completed with the same title/path, no error and no partials; its owned staging directory is absent. SHA-256 comparisons confirm the saved MP4 and installed Deno executable are unchanged. Other job records are unchanged; the completed entry remains available for Remove all. An ignored local repair script issued framed requests and recorded boolean verification evidence in `.local/cleanup-repair-evidence.json`; it did not manually edit the journal. No browser process was stopped or restarted.

The reported cleanup failure is repaired on `main`; documentation/version checks and `git diff --check` passed. No further permission or installation prerequisite remains for this repair.

Normal-Chrome follow-up: the owner reported that a subsequent large YouTube video downloaded completely and that audio/video remained perfectly synchronized. Their Explorer screenshot reports 1,247,528 KB. A read-only check of the corresponding helper record confirms **completed**, **1,277,468,514 bytes**, **no error**, **no partials**, and an absent owned staging directory. Playback/synchronization is owner-observed evidence; this file was not independently decoded by the agent. This closes the outstanding normal-Chrome large-download acceptance check without claiming universal provider compatibility. Only DOCUMENTATION.md, PLAN.md and the implementation log changed for this acceptance record; documentation consistency and whitespace checks passed, and runtime tests were not unnecessarily repeated.
