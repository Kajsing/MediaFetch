class MediaFetchError(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def classify_error(message: str) -> tuple[str, str]:
    """Map diagnostics to public messages without leaking raw URLs or credentials."""
    lower = message.lower()
    if "429" in lower or "rate limit" in lower:
        return "RATE_LIMITED", "The website is limiting requests. Wait a while, then retry."
    if any(word in lower for word in ("login", "log in", "sign in", "authentication", "401", "403", "age-restricted", "cookies")):
        return "AUTH_REQUIRED", "The website requires access that the local helper does not have. Browser cookies are not imported."
    if "requested format" in lower:
        return "FORMAT_UNAVAILABLE", "No video format meets this quality limit. Try another quality."
    if "unsupported url" in lower:
        return "UNSUPPORTED_MEDIA", "This post links to an unsupported media provider."
    if any(word in lower for word in ("no video", "no media", "does not contain", "no video could")):
        return "NO_MEDIA", "This post does not contain a supported video."
    if "timed out" in lower or "timeout" in lower:
        return "TIMEOUT", "The website did not respond in time. Retry when the connection is available."
    if "no space" in lower or "disk full" in lower:
        return "DISK_FULL", "There is not enough free space in the download folder."
    if "permission" in lower or "access is denied" in lower:
        return "PERMISSION_DENIED", "MediaFetch cannot write to the download folder."
    if "ffmpeg" in lower or "postprocessing" in lower:
        return "MERGE_FAILED", "The video could not be merged. Check ffmpeg and retry."
    if "404" in lower or "not found" in lower or "unavailable" in lower or "deleted" in lower:
        return "CONTENT_UNAVAILABLE", "The video is unavailable or has been removed."
    return "DOWNLOAD_FAILED", "The video could not be downloaded. Retry later or check for a helper update."
