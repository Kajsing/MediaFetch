# MediaFetch implementation plan

Date: 2026-09-25  
Status: M0-M6 complete for the initial public Reddit/X MVP. Automated, live-download and normal-Chrome user acceptance are recorded in DOCUMENTATION.md, together with coverage limits. Direct downloading remains gated off; the verified native fallback is used.

## 1. Scope and approach

Build the Chrome extension described in the [feasibility study](mediafetch_chrome_extension_forundersoegelse.md), incorporating the user's subsequent decisions about destination, recovery, and deletion.

Use TypeScript for the Manifest V3 extension and Python 3.12+ for the local Native Messaging helper. Use yt-dlp for extraction and ffmpeg for merging. Begin with private/unpacked installation on Windows 11, Reddit first, then X. Keep YouTube disabled and leave MCP/ChatGPT integration outside current work.

Keep the hybrid architecture. Prove the native path first; enable a browser direct-download path only for complete media and only when it meets the same destination, recovery, and cleanup requirements. Do not claim browser-path support before those requirements have been tested.

The first live end-to-end acceptance target is a public Reddit video, including separate video/audio tracks, saved with sound in the correct folder, with visible progress and working cancellation.

## 2. Destination and file ownership

- Default destination: the user's Windows Downloads known folder, with a `VideoDownload` child folder. Resolve the known folder through Windows rather than assuming a hard-coded user profile path.
- Show the resolved destination in Options. Create the folder on the first download and report permission or disk errors clearly.
- Retain configurable destinations from the study, through trusted extension Options and helper-owned destination IDs. Page messages cannot set paths.
- Interpret the user's reference to the Downloads folder as the Windows known folder initially. Chrome may have a different default download location; document this distinction rather than silently sending files to two places.
- Chrome direct downloads use a relative filename such as `VideoDownload/<safe filename>`. Enable that path only when its destination is known to match the selected helper destination; otherwise use the helper. Do not inspect private Chrome profile files to guess this setting.
- Each native job gets a private staging directory under `VideoDownload\.mediafetch-partials\<job-id>`. Persist the actual destination ID for each job so changing Options does not redirect recovery or cleanup for existing jobs.
- Keep partial streams, fragments, merge output, and resume bookkeeping inside that job directory. Publish the final file only after successful processing, using a collision-safe move that never replaces an existing file.
- Use stable staging filenames based on content and format identity; titles are display metadata and may change between attempts.
- Keep the authoritative native job journal under `%LOCALAPPDATA%\MediaFetch`. Avoid duplicate full metadata dumps that may contain signed URLs.
- Normalize and validate paths, Windows reserved names, lengths, and destination containment. Reject junction/symlink/reparse-point escapes in managed staging and cleanup paths. Filesystem races must be covered by the implementation design and tests, not just a string-prefix check.

## 3. Persistent download list

The popup shows recent jobs and links to a full download list implemented as an extension page. No local HTTP server is needed.

Each row shows the provider, title or content ID, selected quality, state, available progress, and relevant actions. During merging, show `Merging` rather than reporting completion at 100% network transfer.

Persist the canonical post URL, job ID, attempt ID, provider/content identity, quality, destination ID, timestamps, engine, engine reference, latest state, and a sanitized error. Persist resume identity only as needed; do not store signed media URLs or credentials in the journal.

| State | User-facing meaning | Actions |
| --- | --- | --- |
| Queued | Waiting for an available slot | Stop; Stop and delete |
| Resolving / Downloading / Merging | Work is active | Stop; Stop and delete |
| Stopping / Deleting | Waiting for processes or cleanup | No duplicate action |
| Stopped / Interrupted | Work is inactive; partial data may remain | Continue when supported; otherwise Retry; Delete partial files |
| Failed | The attempt failed | Retry; Delete partial files if present |
| Completed | The final file was published | Remove from list |
| Cancelled | Stopped and owned partial files were deleted | Retry; Remove from list |

- **Stop:** remove a queued job from scheduling, or stop its active work. Preserve reusable partial files and the list entry.
- **Continue:** re-resolve the canonical URL and attempt to reuse compatible partial files. Do not promise byte-perfect resume. Validate content/format identity before reuse; if it changed or the source cannot resume, explain that a fresh retry is needed. A server may also force a restart, which must be reflected in status.
- **Retry:** create a new attempt under the same list entry using the canonical URL and selected settings. Start fresh; discard only that job's obsolete partial data through the same checked cleanup procedure. Never reuse an expired signed URL as the source of truth.
- **Stop and delete:** stop the job and its entire owned process tree, wait for exit, then delete only its unfinished staging artifacts. Retain a `Cancelled` entry so the outcome is visible and retry remains available.
- **Delete partial files:** use the same job-scoped cleanup procedure for inactive jobs. After successful cleanup, mark the job `Cancelled` and retain Retry.
- **Remove from list:** remove a terminal entry without deleting a completed video. Jobs with retained partial files must be cleaned up explicitly first so removing an entry cannot orphan those files.

Retries and continuations are user-triggered and respect the shared two-job limit. Bound transient retries within an attempt; do not run an indefinite background retry loop.

Retain unfinished, stopped, and failed entries until the user resolves them. Do not automatically purge their partial files. Bound completed/cancelled history to the latest 100 entries; pruning history never deletes completed videos. This replaces the study's general instruction to discard completed jobs after a short time.

## 4. Lifecycle, recovery, and cancellation

- The service worker owns the native connection. Closing the popup or list page must not stop a download.
- Store settings and the extension's job view in `chrome.storage.local`. The native journal is authoritative for native job state; Chrome download items are authoritative for browser-engine state.
- Include a job snapshot/reconciliation operation in the versioned native protocol. Reopening the UI must recover state without starting another download.
- Track attempt IDs and monotonically increasing event revisions so delayed progress or completion messages cannot revive stopped or deleted attempts.
- Enforce one native scheduler/writer for the user's job journal. Additional host connections must not launch a second scheduler; return a clear busy result if necessary. This prevents multiple windows/profiles from bypassing the two-job limit.
- On browser exit, extension reload, lost native connection, or helper failure, stop owned subprocesses and retain recovery data. Downloads do not need to run while Chrome is closed.
- Use a Windows process-tree ownership mechanism, such as a kill-on-close Job Object, so helper failure cannot leave yt-dlp/ffmpeg running unattended. Validate this behavior before live acceptance.
- On startup, reconcile stale active journal entries to `Interrupted` unless live ownership is proven. Recover queued jobs into a stopped/recoverable state after a session interruption; do not silently launch them on browser startup.
- Persist a deletion request before beginning cleanup. After an interruption during deletion, retry only that recorded job's checked cleanup before admitting a new attempt.
- Serialize completion and deletion for a job. If cancellation wins before publication, no final file is published. If publication wins first, preserve the completed file and report `Completed`; an in-flight delete request does not become permission to delete finished videos.
- If a file is locked or cleanup fails, retain the job and show `Could not delete partial files` with a cleanup retry. Never report deletion success until it is verified.
- Process cleanup targets verified owned processes, never broad names such as all `python.exe` or `ffmpeg.exe` processes.

## 5. Security and predictable extraction

These requirements apply when each component is first introduced; M6 verifies them rather than introducing them late.

- Validate schemas, payload sizes, action names, options, and URL structure in the service worker and again in the helper. Check extension sender identity and the expected origin/tab context for content-script requests.
- Privileged commands such as destination changes and job deletion originate from trusted extension UI. Pages cannot choose filesystem paths, command arguments, or arbitrary job ownership.
- Accept only supported HTTPS post URLs with exact allowed hosts and provider-specific paths. Reject embedded credentials, unsupported ports, generic URL downloads, and provider-disabled requests.
- Restrict extractor selection and delegated extraction to the supported providers. A Reddit post containing an unsupported external embed must not become a general downloader. Test redirects and external embeds explicitly.
- Native registration permits only the exact stable extension ID. Install per user under `%LOCALAPPDATA%\MediaFetch` with HKCU registration; do not require Program Files or administrator access.
- Use explicit trusted executable locations, argument arrays, `shell=False`, bounded timeouts, and controlled output paths. Disable inherited yt-dlp configuration and plugin discovery with the supported flags. No page-supplied executable, raw arguments, cookies, passwords, or tokens.
- Keep native stdout exclusively for framed protocol messages; send sanitized diagnostics elsewhere. Validate message framing and reject malformed or oversized input.
- Keep permissions narrow. No `<all_urls>`, `debugger`, or `cookies` permission. Add optional functionality and its permissions only when implemented.
- Redact credentials and signed CDN URLs from errors and logs. Keep local browsing-related metadata limited to user-requested jobs.
- Record dependency versions and a tested update procedure. Check redistribution licenses before packaging third-party binaries; do not silently change the project's licensing model.

Quality presets are `Best`, `Up to 1080p`, and `Up to 720p`, with `Up to 1080p` as the initial default. `Best` has no resolution cap. Every fallback for a capped preset must keep the cap; missing compatible formats produce a clear error. Treat this as maximum encoded video height initially and label it consistently.

MP4 is the preferred output container. Validate actual codec compatibility and playback on Windows; a merge into MP4 alone does not prove playback support. Do not silently introduce expensive transcoding. Audio-only remains future work.

## 6. Milestones

### M0 — Decisions and implementation baseline

- [x] Record destination, persistent jobs, stop/delete, and recovery behavior.
- [x] Record safety boundaries and controlled extraction defaults.
- [x] Preserve the original study and provide English project entry points.

Exit: the next implementation milestone is explicit; no runnable-product claims.

### M1 — Extension foundation

Build the TypeScript MV3 extension, toolbar popup, download-list page, Options storage, and context menu. Define shared message contracts, job states, quality presets, and provider URL parsing. Wire clear empty, unsupported-page, and helper-missing states. Establish a stable development extension ID and reproducible local build.

Validation: typecheck/build; focused tests for URL parsing, message boundaries, and job transitions; load unpacked in Chrome and verify navigation, settings persistence, and context-menu targeting. Stub behavior must be identified as such and cannot report a successful download.

Exit: a usable shell with correct state and failure behavior, ready for native integration.

### M2 — Native bridge and installer

Build framed Python protocol handling, version/capability handshake, per-user install/uninstall scripts, connection ownership, and destination resolution. Introduce the native journal and snapshot contract. Use a fake worker to exercise lifecycle and process-tree shutdown without yt-dlp.

Validation: framing/schema/origin tests; real Chrome-to-host handshake; Windows path handling; install/uninstall registration correctness; disconnect and helper-crash cleanup. Uninstall must preserve downloaded videos and recoverable user data unless separately requested.

Exit: Chrome can communicate with the verified host; missing/incompatible installations have actionable errors.

### M3 — Download engine and recovery

Add controlled yt-dlp execution, ffmpeg discovery, safe staging/publication, structured progress, a two-job queue, persistent jobs, Stop, Continue, Retry, and Stop and delete. Implement attempt isolation, recovery reconciliation, and explicit cleanup failures.

Validation: deterministic fake-extractor/process tests for success, failure, timeout, queueing, resume, restart fallback, stale events, cancellation during merging, crash recovery, and deletion races. Verify malicious paths and unrelated files/processes remain unaffected.

Exit: the complete job lifecycle works through the extension and native protocol in integration tests. Provider live support is still pending.

### M4 — Reddit vertical slice

Connect real Reddit detection and extraction. Start with detail pages, toolbar, and context menu; then add feed targeting and inline UI. Support the intended Reddit host variants and canonicalize short links safely. Reject ambiguous or unsupported media rather than downloading a neighboring post.

Validation: sanitized fixtures for detail/feed/crossposts and dynamic replacement; opt-in live public video tests including separate audio/video; inspect output with ffprobe, decode/playback, and listen for audio. Exercise stop, resume/retry, restart, and cleanup with real downloads.

Exit: the first full acceptance target works and its evidence is recorded.

### M5 — X adapter and direct-download path

Add X/Twitter URL handling, detail/feed targeting, inline UI, and dynamic DOM observation. Cover quoted posts, multiple media, and recycled feed nodes. Ensure ambiguous multi-video posts identify the selected video or ask the user to select one; never silently download every item.

Add a conservative direct-download strategy where complete media, destination matching, and lifecycle behavior can be proven. Browser cancellation and partial cleanup require their own real-Chrome acceptance checks; do not treat history erasure as file deletion. Keep the native fallback for sources that do not satisfy these checks. Record any direct-path acceptance gap explicitly.

Validation: fixture tests plus live public X downloads; exact clicked-post/media identity; SPA navigation and inline-button idempotence; browser/native destination agreement and cleanup.

Exit: supported X and Reddit entry points work, with honest strategy capabilities and no guessed media association.

### M6 — MVP acceptance and documentation

Run the full acceptance matrix below, resolve findings, finish installation/troubleshooting documentation, and record verified dependency versions. Recheck security controls, logging, accessibility, resource use, and output quality. Keep network-dependent provider tests opt-in rather than blocking normal CI.

Exit: all required acceptance checks pass, or a concrete remaining blocker is reported. Documentation must distinguish automated evidence from actual Windows/Chrome/live-provider checks.

YouTube and MCP/ChatGPT integration require separate future scope; do not add placeholder implementations now.

## 7. Required acceptance evidence

| Scenario | Expected evidence |
| --- | --- |
| Public Reddit video with separate audio | Correct final video and audible sound in `VideoDownload` |
| X detail/feed/quoted post | Download belongs to the selected post and video |
| No media, unsupported embed, or authentication required | Explicit actionable error; no unrelated download |
| Third job submitted while two run | Third remains queued; total active count never exceeds two |
| Popup closed and reopened | Download continues; status is reconstructed |
| Browser restarted or helper terminated | No orphan worker; unfinished job returns as recoverable, not permanently active |
| Compatible partial transfer | Continue reuses valid data, with verified final output |
| Expired URL or incompatible partial transfer | Canonical URL is re-resolved; fresh retry is available and restart is communicated |
| Stop during download or merge | All owned work stops; recoverable data remains |
| Stop and delete during transfer/merge | Owned partial data is removed; unrelated and completed files survive |
| Completion races with deletion | One deterministic outcome; no deletion of a published file |
| Locked file or interrupted deletion | Clear cleanup failure/pending status; safe retry after recovery |
| Destination changed, duplicate filenames | Existing jobs keep their destination; existing videos are never overwritten |
| Redirected Windows Downloads / different Chrome destination | Correct known-folder behavior; direct path does not silently save elsewhere |
| Malformed messages / unsafe paths / inherited yt-dlp config | Requests fail safely and cannot alter command or path policy |
| Direct engine stop/resume/delete | Real Chrome behavior satisfies the same user contract, or helper is selected |
| Helper/ffmpeg missing; disk full; access denied | Accurate error and practical recovery action |
| YouTube disabled | No enabled YouTube download entry point or permission |

After each substantial milestone, update `DOCUMENTATION.md` with changed files, validation results, assumptions, deviations, remaining work, and whether the next planned step can proceed autonomously. Add concise implementation logs when complex work begins or a project log directory exists.

## 8. Technical references

Checked on 2026-09-25. These describe platform capabilities; they are not proof of an implemented MediaFetch feature.

- [Chrome Downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads): relative destination names and download lifecycle operations; `removeFile` applies to completed items, and erasing history is not file deletion.
- [Chrome Native Messaging](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging): host registration, framed messages, sender validation, and connection lifetime.
- [yt-dlp documentation](https://github.com/yt-dlp/yt-dlp): partial-file continuation, format selection, configuration isolation, and plugin controls.
- [Windows known folders](https://learn.microsoft.com/en-us/windows/win32/shell/knownfolderid): `FOLDERID_Downloads`.
