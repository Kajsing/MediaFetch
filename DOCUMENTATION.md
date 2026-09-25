# MediaFetch project status

Last updated: 2026-09-25

## Current state

Version 0.1.0 is a runnable MVP candidate. M0-M3 are complete. Reddit and X extraction, real Windows/Chrome Native Messaging, output playback, Stop, Continue, Retry, Stop and delete, browser restart recovery, and fixture-based content controls have passed. The user confirmed Reddit controls appear correctly in normal Chrome and reported an X layout problem. That problem is fixed in the rebuilt extension and awaits live recheck. M6 documentation and automated evidence are recorded below; this is not yet an unconditional final acceptance claim.

## Confirmed user decisions

- Conversation stays in Danish; new project material and UI stay in English.
- Default output is a `VideoDownload` subfolder of Downloads.
- Provide a persistent list for continued/retried downloads.
- Provide a way to stop and delete an unfinished download.
- Codex owns routine security and extractor configuration decisions within the approved architecture.
- MCP/ChatGPT integration is future work and does not need implementation now.

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
| Detail/feed/quote/selected media identity | Provider URL/DOM tests and real content-script fixtures passed. Current live site markup and native context-menu gesture still need normal-Chrome verification. Multi-video selection is implemented; no live multi-video post has been accepted. |
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

### Remaining work and continuation

The user confirmed the Reddit button appears correctly. Their X screenshot revealed that appending the control directly to the article created a stretched flex column. The X adapter now locates the post's own native action row and mounts the compact control after that row, inside the content column. When that anchor is unavailable it waits for a DOM update instead of changing the article layout. The rebuilt extension passed `pnpm check` and the Chrome content smoke, including 320px/640px width checks and visual inspection. Reddit placement remains unchanged. No helper change is required for this visual fix.

Confirm the rebuilt X control in normal Chrome, helper connection, the selected post/video, an actual context-menu action and a short human playback/listening check. Broader live multi-video examples remain useful additional coverage. The final native storage guard is installed. The installer first refused the active connection; after the user disabled the extension, update and verification succeeded. The user can now enable it and reload the website.

It is safe to continue with documentation or isolated fixture work. Avoid reinstalling or taking the shared native-host journal while the user's Chrome test is running. The MVP goal remains active until the outstanding acceptance result is incorporated; no completion is inferred from the user's agreement to try it.
