# MediaFetch

**Save public Reddit, X and YouTube videos to your computer.**

MediaFetch pairs a Chrome extension with a local Windows helper. Pick a video, choose its quality, and manage the download from a persistent list. Videos are saved to `Downloads\VideoDownload` by default.

**Version 0.2.1 · Windows 11 · Chrome Manifest V3 · Unpacked installation**

[Install](#install) · [Download controls](#download-controls) · [Update](#update-and-uninstall) · [Troubleshooting](#troubleshooting)

## What it does

- Adds compact **Save video** buttons to supported pages, with a toolbar popup, pasted links and a context-menu action as other entry points.
- Downloads video with its available audio and merges separate streams locally.
- Saves YouTube videos and Shorts using their titles, such as `Purr.mp4`. Windows-incompatible names are normalized; duplicate names get a numbered suffix, preserving existing files.
- Offers **Up to 720p**, **Up to 1080p** (the default), and **Best available**. Capped choices never silently exceed their limit.
- Runs up to two downloads at once and queues the rest. Closing the popup does not stop work.
- Keeps unfinished downloads available for **Continue** or **Retry** after a browser/helper restart.
- Uses the **Slate** interface: a compact popup, grouped download list and Settings with a custom download folder and per-site button preferences.

## Supported sites

| Site | Supported workflow | Boundaries |
| --- | --- | --- |
| Reddit | Public native videos, post links and recognized detail/feed controls. | External embeds and ambiguous media are not guessed. |
| X / Twitter | Public video posts, recognized detail/feed controls and quoted-video targeting. | Recognized GIF-only players have no inline video button. Multiple videos may require an explicit selection. |
| YouTube | Public single videos through watch, youtu.be and Shorts links; inline controls on recognized watch/active-Short layouts. | No playlist/channel downloads, live or still-processing streams, authenticated/age-restricted videos, or DRM. Playlist/time/tracking context is discarded. |

If a page has no button, open the video's permalink or paste its link into MediaFetch. The current desktop Shorts layout is verified; mobile YouTube and other layout variants have no promised inline placement. See [acceptance evidence and coverage limits](DOCUMENTATION.md).

## Download controls

| Action | Result |
| --- | --- |
| Stop | Stop owned processing and keep partial data. |
| Continue | Re-resolve the post and try compatible retained data. Some servers require a restart. |
| Retry | Start a fresh attempt under the same list entry, cleaning up that job's obsolete partials. |
| Stop and delete / Delete partial files | Stop owned work and remove only that job's unfinished artifacts. |
| Remove from list | Remove an inactive entry without partial files; keep any saved video. |
| Remove all | Clear inactive entries without partial files. Keep saved videos, active/queued downloads, and recoverable partial data. |

Two jobs can run at once; others wait. Closing the popup or list does not stop downloads. Closing Chrome stops owned work; reopening restores unfinished jobs for an explicit Continue or Retry. Multiple videos require an explicit selection when the source cannot identify a single selected video.

## Install

Requirements: Windows 11, Chrome 123+, Python 3.12+, Node.js 24+ with pnpm, and a working `ffmpeg` executable. Use Git or download a copy of this repository. The tested interpreter is Python 3.12. No administrator access is required by MediaFetch; prerequisite tools must already be installed.

MediaFetch currently installs from source. The generated `extension/dist` folder is not included in Git. In PowerShell:

```powershell
git clone https://github.com/Kajsing/MediaFetch.git
cd MediaFetch
pnpm install --frozen-lockfile
pnpm build
powershell -NoProfile -ExecutionPolicy Bypass -File .\installer\install.ps1
```

If you already have a checkout, start from its root and omit the clone and `cd` commands. The execution-policy override applies only to that installer process. If Python or ffmpeg discovery fails, pass explicit paths:

```powershell
.\installer\install.ps1 -PythonPath 'C:\path\to\python.exe' -FfmpegPath 'C:\path\to\ffmpeg.exe'
```

Load the built extension:

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Choose **Load unpacked** and select `extension\dist` inside your checkout. Run `Resolve-Path .\extension\dist` in PowerShell if you need its full path.
3. Pin MediaFetch from Chrome's Extensions menu, open it, and check for **Local helper connected**.
4. Reload any Reddit, X or YouTube tabs that were already open.

Click **Save video** on a supported page, use **Download video with MediaFetch** in Chrome's context menu, or paste a video link into the popup and choose **Download video**. Open **View all downloads** for the list, grouped into **In progress**, **Needs attention** and **Finished**. Expand **Saved file** for a completed video's path.

The default destination follows the Windows Downloads known folder plus `VideoDownload`. Chrome's separate download-location setting does not control this helper. **Settings** displays the actual folder and lets you enter another absolute local path. Existing jobs keep their original destination; duplicate filenames receive a suffix instead of overwriting a saved video.

The checked-in public development key keeps the extension ID stable: `gemldedgcfjpnfoohndccolnbnpkhalf`. Do not regenerate it during ordinary updates. The helper accepts only this registered extension origin.

The installer creates a dedicated Python environment, installs pinned yt-dlp, EJS and Deno packages, validates a real protocol handshake and Deno execution, and registers `dk.kajsing.mediafetch` under HKCU. You do not need to install Deno separately. It resolves physical paths when a packaged terminal virtualizes LocalAppData. The HKCU registration's default value identifies the actual `native-host.json`; `config.json` and `state/jobs.json` are beside it.

## Update and uninstall

**Update both the helper and the extension for 0.2.1.** The helper change supplies title-based YouTube filenames; the extension change supplies current desktop Shorts controls. Existing downloaded files keep their names. Upgrading from 0.1.x also adds the local YouTube JavaScript runtime and exact YouTube page permissions. Older helpers continue to serve Reddit/X and display an update message for YouTube.

Let active downloads finish, or stop them to retain partials. Disable MediaFetch in `chrome://extensions` so the helper releases its journal. From your checkout:

```powershell
git switch main
git pull --ff-only
pnpm install --frozen-lockfile
pnpm check
powershell -NoProfile -ExecutionPolicy Bypass -File .\installer\install.ps1
```

For a checkout created before `main` existed, run `git fetch origin` first, then `git switch --track origin/main` instead of `git switch main`.

Enable/reload the extension and reload affected website tabs. Check for **Local helper connected**. Saved videos, settings, history and recoverable data are preserved; the installer refuses to replace an active helper.

To unregister the helper:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\installer\uninstall.ps1
```

Remove the extension separately in `chrome://extensions`. Uninstall preserves videos, partial files, history, and the installed helper files so a reinstall can recover work. It performs no recursive data deletion.

## Troubleshooting

| Message or symptom | Next step |
| --- | --- |
| Helper not connected | Install the helper for this checkout and Chrome user, then click Reconnect. Verify the extension ID above. |
| Active in another browser profile | Disable MediaFetch in that profile before reconnecting here. One scheduler owns the journal. |
| ffmpeg missing | Install ffmpeg, rerun the installer with its absolute path, and reconnect. |
| Update helper for YouTube | Disable the extension, rerun the helper installer, enable/reload the extension and click Reconnect. |
| Media server rejected request | Retry later. If it persists, check for a tested helper update. A 403 response alone does not establish that a video is private. |
| Access/authentication required | The helper uses public access only. Browser cookies are not imported. Private or gated videos may be unavailable. |
| Website rate limit / transient failure | Wait, then Retry. There is no endless retry loop. |
| Format unavailable | Choose a different quality. Capped presets never silently exceed their limit. |
| Source format changed | Use Retry; Continue will not reuse incompatible partials. |
| Could not delete partial files | Close programs using those files, then try Delete partial files again. Completed videos are preserved. |
| Folder not writable / disk full | Free space or select a writable folder for new jobs. Existing jobs keep their original destination. |
| Inline button absent | Reload the page and check the provider's toggle in Settings. Open the post permalink or paste its URL into MediaFetch. Ambiguous media is not guessed. |

## Development and validation

Version 0.2.1 passed **19 extension tests and 42 Windows native tests**, plus isolated content checks, live watch/Shorts placement and click identity, real downloads with title-based filenames, and full video/audio validation. The owner previously confirmed 0.2.0's watch-page workflow in normal Chrome; installation and normal-Chrome status for this update are recorded separately in [full evidence](DOCUMENTATION.md). These results do not guarantee every provider layout or format.

From a checkout with its JavaScript dependencies installed:

```powershell
pnpm check
py -3.12 -m venv native-host/.venv
native-host/.venv/Scripts/python.exe -m pip install -r native-host/requirements.txt
.\scripts\test-native.ps1
```

<details>
<summary>Browser fixtures and opt-in live tests</summary>

Install a test browser, then run the isolated content/UI fixtures:

```powershell
pnpm exec playwright install chromium
pnpm exec node scripts/content-smoke.mjs
pnpm exec node scripts/history-smoke.mjs
pnpm exec node scripts/ui-smoke.mjs
pnpm exec node scripts/youtube-content-smoke.mjs
```

For another Chrome for Testing binary, set `MEDIAFETCH_TEST_CHROME` to its executable. Browser scripts use isolated profiles under ignored `.local/`; they do not control the user's open Chrome. `content-smoke.mjs` uses controlled fixtures and a separate extension identity that cannot access the installed helper.

`history-smoke.mjs` tests the real list UI and service worker with a native-protocol test double and a separate extension identity. It never clears the user's history. Native file preservation is checked independently by the Windows scheduler tests.

`ui-smoke.mjs` uses the same isolation approach to exercise Slate's full state coverage, popup, settings, actions, keyboard focus, multi-video choice, helper reconnection and responsive layout. Its sample state matrix is deliberately broader than a real two-worker session; it is not a scheduler test. No real videos are downloaded.

The following checks use the installed helper. Keep other MediaFetch profiles disconnected while running them; live tests contact the providers and create real files:

```powershell
pnpm test:browser
pnpm exec node scripts/live-smoke.mjs --run 'https://www.reddit.com/r/accelerate/comments/1wplszd/enterprised_bridge_recreated_in_blender_using_400/' 'https://x.com/M1Astra/status/2103152489772073421'
pnpm exec node scripts/recovery-smoke.mjs --run
pnpm exec node scripts/validate-media.mjs
```

The Reddit/X live script uses the selected destination. Recovery tests temporarily use a new `.local/` directory and restore the destination. Media validation requires ffprobe as well as ffmpeg. Evidence and screenshots go into ignored `artifacts/`.

YouTube acceptance uses a separate journal and output folder and can run while the user's normal Chrome remains open:

```powershell
native-host/.venv/Scripts/python.exe scripts/youtube-live.py --run --recovery 'https://www.youtube.com/watch?v=MkycQONC3SE'
pnpm exec node scripts/validate-media.mjs --youtube
pnpm exec node scripts/youtube-content-smoke.mjs --live
```

The owner selected this video for testing. The content smoke's live mode checks both this watch page and the selected [Purr Short](https://www.youtube.com/shorts/GuseDyzBWWQ), using an isolated extension that cannot connect to the installed helper. Native acceptance separately verifies download, byte reuse, restart and deletion. Use `--evidence artifacts/youtube-shorts-live.json --expected-title Purr` with `youtube-live.py` and the Shorts URL to retain separate filename evidence; pass the same `--evidence` path to `validate-media.mjs --youtube`. Current live desktop coverage and sanitized SPA fixtures do not prove every Shorts layout.

</details>

## Scope and project records

`main` contains the integrated project, including the completed Reddit/X MVP, Slate design and YouTube milestone.

All downloads currently use the helper. Browser direct downloading stays disabled because destination equivalence and unfinished-file cleanup are not established; its unused permission is omitted. This follows the capability gate in [PLAN.md](PLAN.md). Audio-only exports and MCP/ChatGPT integration remain out of scope.

YouTube accepts HTTPS watch, youtu.be and Shorts links for one public video. Playlist, timestamp and tracking parameters are discarded; playlists/channels, live or still-processing streams, authenticated/age-restricted videos and DRM are unsupported. The inline control requires a matching current watch player or recognized active Short. If a layout does not expose a reliable identity/anchor, paste the video link. Mobile YouTube layouts and embedded players have no promised inline placement. Public media-server refusals can still require a later Retry; successful acceptance is not universal compatibility.

No browser credentials, arbitrary URL downloading, remote extension code, telemetry, or required cloud service. Source URLs and job metadata remain in the local journal; signed CDN URLs are not retained there. Codecs depend on source formats; the tested files are H.264/AAC MP4 and no expensive transcoding is silently introduced.

- [AGENTS.md](AGENTS.md): repository working instructions.
- [PLAN.md](PLAN.md): behavior and acceptance requirements.
- [DOCUMENTATION.md](DOCUMENTATION.md): implementation status, evidence, and limitations.
- [DEPENDENCIES.md](DEPENDENCIES.md): tested versions and redistribution boundaries.
- [Original feasibility study](mediafetch_chrome_extension_forundersoegelse.md): historical input, preserved in Danish.

New code, UI, and project documents are in English; conversation with the project owner is in Danish.
