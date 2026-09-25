"""Single owned extraction/download attempt. No browser credentials or ambient config."""
import itertools
import json
import sys
import time
from pathlib import Path
from .errors import MediaFetchError, classify_error
from .providers import canonical, media_url_allowed
from .network import downloader_class
from .youtube import runtime_options, validate_video


def emit(value: dict):
    # Windows redirected stdout may use a legacy code page. JSON escapes keep
    # the pipe UTF-8-compatible while decoding restores the exact Unicode text.
    print(json.dumps(value, ensure_ascii=True, allow_nan=False), flush=True)


class QuietLogger:
    def debug(self, message): pass
    def warning(self, message): pass
    def error(self, message): pass


def extract_public_info(downloader, candidate, params, downloader_type):
    from yt_dlp.utils import DownloadError
    try:
        return downloader.extract_info(candidate["url"], download=False)
    except DownloadError as error:
        # X sometimes returns a non-JSON response from its public GraphQL route.
        # yt-dlp also supports the public embed endpoint. Never retry auth errors here.
        if candidate["provider"] != "x" or "Failed to parse JSON" not in str(error):
            raise
        fallback_params = {**params, "extractor_args": {"twitter": {"api": ["syndication"]}}}
        with downloader_type(fallback_params) as fallback:
            return fallback.extract_info(candidate["url"], download=False)


def identity(info: dict) -> dict:
    requested = info.get("requested_formats") or [info]
    return {"id": str(info.get("id")), "formats": [{"id": str(item.get("format_id")), "ext": item.get("ext"), "size": item.get("filesize"), "vcodec": item.get("vcodec"), "acodec": item.get("acodec")} for item in requested], "duration": info.get("duration")}


def format_selector(quality: str) -> str:
    if quality not in ("best", "1080", "720"):
        raise MediaFetchError("INVALID_REQUEST", "Unsupported quality.")
    return "bv*+ba/b" if quality == "best" else f"bv*[height<={quality}]+ba/b[height<={quality}]"


def run(spec: dict):
    # The API does not parse yt-dlp CLI configuration. Explicitly disable its plugin loader.
    import yt_dlp.globals
    yt_dlp.globals.plugin_dirs.value = []
    candidate = canonical(spec["url"])
    YoutubeDL = downloader_class(candidate["provider"], (lambda count: emit({"type": "resume", "bytes": count})) if spec.get("resume") else None, (lambda: emit({"type": "restart"})) if spec.get("resume") else None)
    folder = Path(spec["staging"])
    quality = spec["quality"]
    last_progress = 0.0
    def progress(data):
        nonlocal last_progress
        now = time.monotonic()
        if now - last_progress < 0.3 and data.get("status") != "finished":
            return
        last_progress = now
        downloaded = data.get("downloaded_bytes") or 0
        total = data.get("total_bytes") or data.get("total_bytes_estimate")
        emit({"type": "progress", "bytes": max(0, int(downloaded)), "progress": min(100, downloaded * 100 / total) if total else None})
    def postprocess(data):
        if data.get("status") == "started":
            emit({"type": "merging"})
    params = {
        "quiet": True, "no_warnings": True, "noprogress": True, "logger": QuietLogger(),
        "noplaylist": True, "playlistend": 17,
        "allowed_extractors": ["youtube$"] if candidate["provider"] == "youtube" else ["reddit", "twitter", "twitter:card", "twitter:amplify"],
        "format": format_selector(quality), "merge_output_format": "mp4", "format_sort": ["res", "vcodec:h264", "acodec:aac"],
        "outtmpl": str(folder / "media.%(ext)s"), "paths": {"home": str(folder), "temp": str(folder)},
        "continuedl": True, "nopart": False, "windowsfilenames": True,
        "ffmpeg_location": spec["ffmpeg"], "socket_timeout": 25, "retries": 2, "fragment_retries": 2,
        "skip_unavailable_fragments": False, "concurrent_fragment_downloads": 1,
        "progress_hooks": [progress], "postprocessor_hooks": [postprocess],
        "cachedir": False, "remote_components": [], "js_runtimes": {}, "enable_file_urls": False,
        "proxy": "", "usenetrc": False, "cookiefile": None, "cookiesfrombrowser": None,
        "writeinfojson": False, "writethumbnail": False, "writesubtitles": False,
    }
    if candidate["provider"] == "youtube":
        params.update(runtime_options(folder))
        params.update(external_downloader="native", hls_prefer_native=True)
        # Reject an ongoing stream before format selection or any media transfer.
        def single_video_filter(info, *, incomplete=False):
            if incomplete:
                if info.get("is_live") or info.get("live_status") in {"is_live", "is_upcoming", "post_live"}:
                    raise MediaFetchError("LIVE_UNSUPPORTED", "Live YouTube streams are not supported. Wait for the finished recording.")
            else:
                validate_video(info, candidate["contentId"])
            return None
        params["match_filter"] = single_video_filter
    with YoutubeDL(params) as downloader:
        info = extract_public_info(downloader, candidate, params, YoutubeDL)
        if not info:
            raise MediaFetchError("NO_MEDIA", "No supported video was found.")
        if candidate["provider"] == "youtube":
            validate_video(info, candidate["contentId"])
        if info.get("_type") in ("playlist", "multi_video") or "entries" in info:
            entries = [entry for entry in itertools.islice(info.get("entries") or [], 17) if entry]
            index = spec.get("mediaIndex")
            if len(entries) > 16:
                raise MediaFetchError("UNSUPPORTED_MEDIA", "This post has too many media items for a single-video download.")
            if len(entries) > 1 and not index:
                emit({"type": "selection", "count": len(entries)})
                raise MediaFetchError("CHOOSE_VIDEO", "This post has multiple videos. Choose a video below, then Retry.")
            if not entries or (index and index > len(entries)):
                raise MediaFetchError("NO_MEDIA", "The selected video is not available in this post.")
            info = entries[(index or 1) - 1]
        elif spec.get("mediaIndex") not in (None, 1):
            raise MediaFetchError("NO_MEDIA", "This post contains only one video.")
        if not info.get("formats") or info.get("vcodec") == "none":
            raise MediaFetchError("NO_MEDIA", "This post does not contain a supported video.")
        requested = info.get("requested_formats") or [info]
        for item in requested:
            if not media_url_allowed(item.get("url", ""), candidate["provider"]):
                raise MediaFetchError("UNSUPPORTED_MEDIA", "The video is hosted outside this provider's supported media servers.")
            if candidate["provider"] == "youtube":
                if item.get("has_drm") or item.get("protocol") not in {"https", "http_dash_segments", "m3u8_native"}:
                    raise MediaFetchError("UNSUPPORTED_MEDIA", "This YouTube format cannot use the controlled local downloader.")
        fingerprint = identity(info)
        expected = spec.get("resumeData")
        if expected and expected != fingerprint:
            raise MediaFetchError("RESUME_UNAVAILABLE", "The source format changed. Choose Retry to start a fresh download.")
        if spec.get("resume") and not expected:
            raise MediaFetchError("RESUME_UNAVAILABLE", "This attempt has no verified resume information. Choose Retry.")
        title = str(info.get("title") or candidate["contentId"])[:180]
        emit({"type": "identity", "data": fingerprint, "title": title})
        result = downloader.process_ie_result(info, download=True)
        final = result.get("filepath") or result.get("_filename") or downloader.prepare_filename(result)
        path = Path(final)
        # The merge may change the extension; prefer the extractor's final result, otherwise inspect only this job directory.
        if not path.is_file():
            candidates = [p for p in folder.iterdir() if p.suffix in (".mp4", ".webm", ".mkv", ".mov", ".m4v") and ".f" not in p.stem]
            if len(candidates) != 1:
                raise MediaFetchError("INVALID_OUTPUT", "The final merged video could not be identified.")
            path = candidates[0]
        if path.parent.resolve() != folder.resolve():
            raise MediaFetchError("INVALID_OUTPUT", "The extractor returned a file outside its job folder.")
        emit({"type": "complete", "filename": path.name, "title": title})


def main():
    try:
        spec = json.loads(sys.stdin.buffer.readline(256 * 1024))
        run(spec)
    except MediaFetchError as error:
        emit({"type": "error", "code": error.code, "message": str(error)})
        raise SystemExit(1)
    except Exception as error:
        code, message = classify_error(str(error))
        emit({"type": "error", "code": code, "message": message})
        raise SystemExit(1)
