# MediaFetch

Save public Reddit and X videos to `Downloads\VideoDownload` with a Windows Chrome extension and a local download helper.

**Extension 0.1.1, compatible with helper 0.1.0.** The working MVP now includes **Remove all** on the download list and hides X's inline button on recognized GIF-only posts. See [validation evidence and coverage limits](DOCUMENTATION.md).

## Start using this checkout

The extension is built in `extension/dist`. The helper has been installed and verified on the development machine.

1. Open `chrome://extensions` in Chrome and enable **Developer mode**.
2. Choose **Load unpacked** and select `C:\project\MediaFetch\extension\dist` (or the equivalent folder in your checkout).
3. Pin MediaFetch from Chrome's Extensions menu. Open it and look for **Local helper connected**.
4. Paste a Reddit or X post link, select a quality, and choose **Download video**. Alternatively, use **Save video** on a supported post or the **Download video with MediaFetch** context menu.
5. Open **View all** for the persistent download list. Reload existing Reddit/X tabs after installing or reloading the extension.

Default output follows the Windows Downloads known folder, not Chrome's independently configurable download location. **Settings** shows the actual folder and lets you choose a different absolute local path. Existing jobs keep their original destination.

## Download controls

| Action | Result |
| --- | --- |
| Stop | Stop owned processing and keep partial data. |
| Continue | Re-resolve the post and try compatible retained data. Some servers require a restart. |
| Retry | Start a fresh attempt under the same list entry, cleaning up that job's obsolete partials. |
| Stop and delete / Delete partial files | Stop owned work and remove only that job's unfinished artifacts. |
| Remove from list | Remove a finished entry; keep the saved video. |
| Remove all | Clear inactive entries without partial files. Keep saved videos, active/queued downloads, and recoverable partial data. |

Two jobs can run at once; others wait. Closing the popup or list does not stop downloads. Closing Chrome stops owned work; reopening restores unfinished jobs for an explicit Continue or Retry. Multiple videos require an explicit selection when the source cannot identify a single selected video.

## Install on another Windows machine

Requirements: Windows 11, Chrome 123+, Python 3.12+, Node.js 24+ with pnpm, and a working `ffmpeg` executable. No administrator access is required by MediaFetch. Install prerequisite tools separately; no third-party binaries are bundled here.

From the repository root in PowerShell:

```powershell
pnpm install --frozen-lockfile
pnpm build
powershell -NoProfile -ExecutionPolicy Bypass -File .\installer\install.ps1
```

The execution-policy override applies to that one process; it does not change the system policy. If discovery fails, pass explicit paths:

```powershell
.\installer\install.ps1 -PythonPath 'C:\path\to\python.exe' -FfmpegPath 'C:\path\to\ffmpeg.exe'
```

Then load `extension/dist` as described above. The checked-in public development key keeps the extension ID stable: `gemldedgcfjpnfoohndccolnbnpkhalf`. Do not regenerate it during ordinary updates. The helper accepts only this registered extension origin.

The installer creates a dedicated Python environment, installs pinned yt-dlp, validates a real protocol handshake, and registers `dk.kajsing.mediafetch` under HKCU. It resolves physical paths when a packaged terminal virtualizes LocalAppData. The HKCU registration's default value identifies the actual `native-host.json`; `config.json` and `state/jobs.json` are beside it.

## Update and uninstall

For the 0.1.1 extension update, wait for active downloads to finish, click MediaFetch's reload button in `chrome://extensions`, then reload the download-list page and open X tabs. The existing helper 0.1.0 already supports this update; no helper reinstall is needed.

Stop downloads and disable MediaFetch in Chrome before updating the helper. Run `pnpm install --frozen-lockfile`, `pnpm check`, and the installer, then enable/reload the extension. Reload affected website tabs. Update extension and helper together.

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
| Access/authentication required | The helper uses public access only. Browser cookies are not imported. Private or gated videos may be unavailable. |
| Website rate limit / transient failure | Wait, then Retry. There is no endless retry loop. |
| Format unavailable | Choose a different quality. Capped presets never silently exceed their limit. |
| Source format changed | Use Retry; Continue will not reuse incompatible partials. |
| Could not delete partial files | Close programs using those files, then try Delete partial files again. Completed videos are preserved. |
| Folder not writable / disk full | Free space or select a writable folder for new jobs. Existing jobs keep their original destination. |
| Inline button absent | Reload the page and check the provider's toggle in Settings. Open the post permalink or paste its URL into MediaFetch. Ambiguous media is not guessed. |

## Development and validation

```powershell
pnpm check
py -3.12 -m venv native-host/.venv
native-host/.venv/Scripts/python.exe -m pip install -r native-host/requirements.txt
.\scripts\test-native.ps1
pnpm exec playwright install chromium
pnpm test:browser
pnpm exec node scripts/content-smoke.mjs
pnpm exec node scripts/history-smoke.mjs
```

For another Chrome for Testing binary, set `MEDIAFETCH_TEST_CHROME` to its executable. Browser scripts use isolated profiles under ignored `.local/`; they do not control the user's open Chrome. `content-smoke.mjs` uses controlled fixtures and a separate extension identity that cannot access the installed helper.

`history-smoke.mjs` tests the real list UI and service worker with a native-protocol test double and a separate extension identity. It never clears the user's history. Native file preservation is checked independently by the Windows scheduler tests.

Live tests contact the providers and create real files. Keep other MediaFetch profiles disconnected while running them:

```powershell
pnpm exec node scripts/live-smoke.mjs --run 'https://www.reddit.com/r/accelerate/comments/1wplszd/enterprised_bridge_recreated_in_blender_using_400/' 'https://x.com/M1Astra/status/2103152489772073421'
pnpm exec node scripts/recovery-smoke.mjs --run
pnpm exec node scripts/validate-media.mjs
```

The first script uses the selected destination. Recovery tests temporarily use a new `.local/` directory and restore the destination. Media validation requires ffprobe as well as ffmpeg. Evidence and screenshots go into ignored `artifacts/`.

## Scope and project records

All released downloads currently use the helper. Browser direct downloading stays disabled because destination equivalence and unfinished-file cleanup are not established; its unused permission is omitted. This follows the capability gate in [PLAN.md](PLAN.md). YouTube, audio-only exports, and MCP/ChatGPT integration remain out of scope.

No browser credentials, arbitrary URL downloading, remote extension code, telemetry, or required cloud service. Source URLs and job metadata remain in the local journal; signed CDN URLs are not retained there. Codecs depend on source formats; the tested files are H.264/AAC MP4 and no expensive transcoding is silently introduced.

- [AGENTS.md](AGENTS.md): repository working instructions.
- [PLAN.md](PLAN.md): behavior and acceptance requirements.
- [DOCUMENTATION.md](DOCUMENTATION.md): implementation status, evidence, and limitations.
- [DEPENDENCIES.md](DEPENDENCIES.md): tested versions and redistribution boundaries.
- [Original feasibility study](mediafetch_chrome_extension_forundersoegelse.md): historical input, preserved in Danish.

New code, UI, and project documents are in English; conversation with the project owner is in Danish.
