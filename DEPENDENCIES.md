# Dependencies and distribution

Tested on Windows 11 on 2026-09-25:

| Component | Version used | Delivery |
| --- | --- | --- |
| Python | 3.12 | Existing local interpreter; installer creates its own venv. |
| yt-dlp | 2026.8.19 | Pinned in `native-host/requirements.txt` and `pyproject.toml`; installed from PyPI. |
| ffmpeg / ffprobe | 8.1.2, local Gyan full build | Existing installation; absolute ffmpeg path recorded by installer. |
| Chrome for Testing | 154.0.8037.57 | Separate official test binary; not part of the product. |
| Node.js | 24.19.0 | Development/build tool. |
| pnpm | 11.25.0 | Development package manager. |
| TypeScript / esbuild | 7.0.2 / 0.28.2 | Locked development dependencies. |
| Playwright / linkedom | 1.63.0 / 0.18.13 | Locked validation dependencies. |

No third-party executable is redistributed by this repository or the unpacked extension build. The helper installer downloads the pinned yt-dlp Python package; it does not bundle the standalone yt-dlp executable. The installed ffmpeg build is GPL-enabled. Do not redistribute that binary without reviewing its build-specific notices and obligations. Upstream license material remains with installed dependencies. This work does not assign a new license to MediaFetch.

For an extractor update, deliberately change both Python version pins, install into the development venv, run the native and extension checks, then rerun public Reddit/X extraction, recovery and playback acceptance. The network request adapter uses yt-dlp's pinned urllib interfaces, so a version bump requires redirect-policy regression tests. Reinstall the helper only after validation; retain the previous pinned revision as the rollback reference. Avoid unpinned automatic production updates.

Playwright's initially downloaded Chrome 153.0.8010.12 failed on this machine with Windows side-by-side error 14001. The alternative above came from the official Chrome for Testing download listing and was selected through `MEDIAFETCH_TEST_CHROME`. This is an environment finding, not evidence that MediaFetch works in every Chrome build.
