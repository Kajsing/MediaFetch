# YouTube title filenames and desktop Shorts

Owner request: use YouTube titles as filenames, support the linked Purr Short, and remain on `main`.

The live desktop Shorts renderer has neither `is-active` nor `video-id`. Its visible shared player owns an explicit permalink and moves between reel renderers. Its playback controls provide a bounded overlay anchor; the former `#actions` anchor is absent. Keep URL/permalink agreement rather than guessing from the current URL alone.

Implementation: title-only publication for YouTube with Windows name normalization, reserved-device guards, Unicode bounds and existing no-overwrite collision handling; current Shorts player identity and compact overlay placement; version 0.2.1. No dependency, protocol, permission, security-model or deployment change. Older downloaded files remain intact.

Validation passed: `pnpm check` (typecheck, 19 tests, build), `scripts/test-native.ps1` (42 Windows tests), Reddit/X content regressions, and old/current Shorts content fixtures. Both owner-selected live pages rendered compact controls and a real pointer click sent the exact video ID. The first live Shorts click exposed inherited pointer-event suppression; the control now explicitly enables pointer events and the repeated real click passed. Hidden players stay rejected even when legacy active attributes are present.

Real isolated native downloads published `Purr.mp4` and `Tail Count Nine.mp4`, left no staging/errors, and passed ffprobe, full ffmpeg decode and Chrome playback with nonzero audio. Purr: 608×1080 VP9/AAC, 151.673 seconds, 4,018,504 bytes, −14.6 dB mean audio. Tail Count Nine: 1280×720 H.264/AAC, 224.862 seconds, 59,295,588 bytes, −15.3 dB. The saved Purr frame and live Shorts placement screenshot were visually inspected. Separate ignored JSON evidence avoids overwriting earlier recovery acceptance. No user history or downloaded file was modified.

Remaining: safely install helper 0.2.1 after the existing helper is inactive, then owner acceptance in normal Chrome. The source and unpacked build are ready on `main`. The owner subsequently requested committing and pushing these changes directly to `main`; that delivery does not change the pending local installation status. The final diff and whitespace checks passed, and the existing test/build results remain applicable because no implementation changed during delivery.
