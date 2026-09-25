# Unicode titles over the Windows worker pipe

The owner reported a generic failure for YouTube video `-XUltrEfXFc`. Reproduced through the real framed helper in a separate journal/destination, before the first identity update. Read-only inspection confirmed that the installed helper is still 0.2.0; current 0.2.1 source reproduced the same failure.

An isolated diagnostic under its own Windows Job Object identified `UnicodeEncodeError` in `worker.emit`: redirected stdout uses cp1252, while the extracted title contains Japanese characters (`MOIKALOOP x Bemax - Watashi (Original Song) わたし Phonk [AMV]`). Metadata and format extraction succeeded. A regression test also exposed malformed JSON bytes for Danish characters, which cp1252 can encode but the scheduler cannot decode as UTF-8. Raw URLs are redacted from diagnostic output; no browser credentials or extraction-policy changes are involved.

Fix: JSON-escape non-ASCII characters on the existing worker event pipe. JSON parsing restores the exact Unicode title for the UI, journal and filename. Apply to all worker event types/providers. Version 0.2.2 keeps the same protocol, dependencies, permissions and security boundaries, and includes the pending 0.2.1 title/Shorts changes.

Regression coverage: identity/completion events through cp1252, ASCII and UTF-8 streams; Danish/Japanese/emoji and embedded-newline titles; the scheduler's actual owned child uses the production emitter and verifies Unicode through final publication and the UTF-8 journal. Before the fix, four encoding cases failed as expected. After the fix, all 44 native tests passed; `pnpm check` passed typecheck, 19 extension tests and the 0.2.2 build.

The reported video now completes through the real framed helper in an isolated journal/destination, with its exact Japanese title in the filename and no partials/error. Full decode and Chrome playback passed: 1920×1080 H.264/AAC stereo, 117.632 seconds, 27,826,367 bytes, −7.8 dB mean audio and nonzero browser audio RMS. The playback screenshot was inspected. Ignored evidence: `youtube-reported-failure.json`, `youtube-unicode-live.json`, `youtube-unicode-media-validation.json` under `artifacts/`.

The owner then confirmed MediaFetch was disabled. The installed-helper lock was free; `installer/install.ps1` installed 0.2.2 and verified the framed handshake, all provider capabilities, ffmpeg and pinned Deno execution. All eleven installed Python source files match the tested source. The journal's SHA-256 is identical before/after, preserving eight entries. Registration retains only the exact stable extension origin. No browser process was restarted or terminated, and downloads/history were preserved.

Remaining: owner re-enables/reloads MediaFetch and verifies the existing failed entry via Retry in normal Chrome. Work remains on `main`; no new runtime tests were needed for this installation-only step after source hashes and the installer checks passed.
