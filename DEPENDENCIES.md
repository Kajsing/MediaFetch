# Dependencies and distribution

Tested on Windows 11 on 2026-09-25:

| Component | Version used | Delivery |
| --- | --- | --- |
| Python | 3.12 | Existing local interpreter; installer creates its own venv. |
| yt-dlp | 2026.8.19 | Pinned in `native-host/requirements.txt` and `pyproject.toml`; installed from PyPI. |
| yt-dlp-ejs | 0.8.0 | Matching local YouTube solver package, pinned with yt-dlp. |
| Deno | 2.9.5 | Official PyPI Windows wheel, installed in the helper venv; no PATH-based runtime selection. |
| ffmpeg / ffprobe | 8.1.2, local Gyan full build | Existing installation; absolute ffmpeg path recorded by installer. |
| Chrome for Testing | 154.0.8037.57 | Separate official test binary; not part of the product. |
| Node.js | 24.19.0 | Development/build tool. |
| pnpm | 11.25.0 | Development package manager. |
| TypeScript / esbuild | 7.0.2 / 0.28.2 | Locked development dependencies. |
| Playwright / linkedom | 1.63.0 / 0.18.13 | Locked validation dependencies. |

No third-party executable is redistributed by this repository or the unpacked extension build. The helper installer downloads pinned PyPI wheels for yt-dlp, EJS and Deno; it does not bundle the standalone yt-dlp executable. yt-dlp and EJS use the Unlicense with upstream third-party notices; EJS includes MIT/ISC components. Deno uses the MIT license. The installed ffmpeg build is GPL-enabled. Do not redistribute that binary without reviewing its build-specific notices and obligations. Upstream license material remains with installed dependencies. This work does not assign a new license to MediaFetch.

For an extractor update, deliberately change matching pins in both Python requirement files, install into the development venv, run the native and extension checks, then rerun public Reddit/X/YouTube extraction, recovery and playback acceptance. The network adapter uses yt-dlp's pinned urllib interfaces; YouTube also disables external ffmpeg downloads and depends on the pinned runtime's restricted execution flags and fixed analysis-cache layout. Bumps require redirect, downloader, runtime and cache-cleanup regression tests. Reinstall the helper only after validation; retain the previous pinned revision as the rollback reference. Avoid unpinned automatic production updates.

YouTube's EJS is installed locally; remote component downloads are disabled. Deno receives no filesystem, network, process or environment permissions for executed JavaScript. Its own analysis cache is contained in the owned job folder and cleaned with fixed-name, handle-validated operations, without recursive deletion. The helper suppresses ambient runtime/proxy options and never imports browser credentials. See the [yt-dlp EJS guide](https://github.com/yt-dlp/yt-dlp/wiki/EJS), [pinned dependencies](https://github.com/yt-dlp/yt-dlp/blob/2026.08.19/pyproject.toml), [Deno wheel](https://pypi.org/project/deno/2.9.5/) and [upstream cache limitation](https://github.com/yt-dlp/yt-dlp/pull/14849).

Playwright's initially downloaded Chrome 153.0.8010.12 failed on this machine with Windows side-by-side error 14001. The alternative above came from the official Chrome for Testing download listing and was selected through `MEDIAFETCH_TEST_CHROME`. This is an environment finding, not evidence that MediaFetch works in every Chrome build.
