"""YouTube runtime and single-video policy; no ambient runtime discovery."""
import importlib.metadata
import os
import sysconfig
from pathlib import Path
from .errors import MediaFetchError


def runtime_path() -> Path | None:
    try:
        if importlib.metadata.version("yt-dlp-ejs") != "0.8.0" or importlib.metadata.version("deno") != "2.9.5":
            return None
        path = Path(sysconfig.get_path("scripts")) / ("deno.exe" if os.name == "nt" else "deno")
        return path if path.is_absolute() and path.is_file() else None
    except importlib.metadata.PackageNotFoundError:
        return None


def runtime_options(folder: Path) -> dict:
    runtime = runtime_path()
    if not runtime:
        raise MediaFetchError("YOUTUBE_RUNTIME_MISSING", "Update the local helper to install YouTube support, then reconnect.")
    # This function runs only inside an owned single-attempt worker. Deno inherits
    # no user runtime options, proxy overrides or shared component cache.
    for key in list(os.environ):
        if key.upper().startswith(("DENO_", "NODE_", "NPM_", "BUN_")) or key.upper() in {"HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY"}:
            del os.environ[key]
    os.environ.update(DENO_DIR=str(folder / ".runtime-cache"), DENO_NO_UPDATE_CHECK="1", DENO_NO_PROMPT="1")
    # HLS can otherwise silently delegate an unsupported manifest to ffmpeg,
    # whose own HTTP client does not pass through our redirect policy.
    from yt_dlp.downloader.external import FFmpegFD
    def reject_external_download(*args, **kwargs):
        raise MediaFetchError("UNSUPPORTED_MEDIA", "This YouTube format cannot use the controlled local downloader.")
    FFmpegFD.real_download = reject_external_download
    return {"js_runtimes": {"deno": {"path": str(runtime)}}, "remote_components": []}


def validate_video(info: dict, video_id: str):
    if info.get("_type") not in (None, "video") or "entries" in info or str(info.get("id")) != video_id:
        raise MediaFetchError("UNSUPPORTED_MEDIA", "Open one YouTube video. Playlists and channel downloads are not supported.")
    if info.get("is_live") or info.get("live_status") in {"is_live", "is_upcoming", "post_live"}:
        raise MediaFetchError("LIVE_UNSUPPORTED", "This YouTube stream is live or still processing. Retry when the recording is available.")
    if info.get("has_drm"):
        raise MediaFetchError("DRM_UNSUPPORTED", "This video uses protected media and cannot be downloaded by MediaFetch.")
    if (info.get("age_limit") or 0) >= 18 or info.get("availability") in {"private", "premium_only", "subscriber_only", "needs_auth"}:
        raise MediaFetchError("AUTH_REQUIRED", "This video requires access that the local helper does not have. Browser cookies are not imported.")
