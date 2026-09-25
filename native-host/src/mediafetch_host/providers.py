import re
from urllib.parse import parse_qs, urlsplit
from .errors import MediaFetchError

X_HOSTS = {"x.com", "www.x.com", "twitter.com", "www.twitter.com"}
REDDIT_HOSTS = {"reddit.com", "www.reddit.com", "old.reddit.com", "new.reddit.com", "sh.reddit.com", "redd.it"}
YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"}


def youtube_media_host(host: str | None) -> bool:
    return bool(host and re.fullmatch(r"[a-z0-9-]+(?:\.[a-z0-9-]+)*\.googlevideo\.com", host))


def canonical(value: object) -> dict:
    if not isinstance(value, str) or len(value) > 2048 or any(ord(c) < 33 for c in value) or "\\" in value:
        raise MediaFetchError("UNSUPPORTED_PAGE", "Enter a Reddit, X or YouTube video URL.")
    try:
        url = urlsplit(value)
        if url.scheme != "https" or url.username or url.password or url.port not in (None, 443):
            raise ValueError()
        host = url.hostname
        if host in X_HOSTS:
            match = re.fullmatch(r"/([A-Za-z0-9_]{1,15}|i/web)/status/(\d{1,25})(?:/video/([1-9]\d?))?/?", url.path)
            if match:
                index = int(match[3]) if match[3] else None
                if index and index > 16:
                    raise ValueError()
                return {"provider": "x", "contentId": match[2], "url": f"https://x.com/{match[1]}/status/{match[2]}", "mediaIndex": index}
        elif host in YOUTUBE_HOSTS:
            if host == "youtu.be":
                match = re.fullmatch(r"/([A-Za-z0-9_-]{11})/?", url.path)
                content_id = match[1] if match else None
            elif url.path == "/watch":
                values = parse_qs(url.query, keep_blank_values=True).get("v", [])
                content_id = values[0] if len(values) == 1 else None
            else:
                match = re.fullmatch(r"/shorts/([A-Za-z0-9_-]{11})/?", url.path)
                content_id = match[1] if match else None
            if content_id and re.fullmatch(r"[A-Za-z0-9_-]{11}", content_id):
                return {"provider": "youtube", "contentId": content_id, "url": f"https://www.youtube.com/watch?v={content_id}", "mediaIndex": None}
        elif host in REDDIT_HOSTS:
            pattern = r"/([a-z0-9]{3,12})/?" if host == "redd.it" else r"/(?:r/[^/]+/)?comments/([a-z0-9]{3,12})(?:/[^/]*)?/?"
            match = re.fullmatch(pattern, url.path, re.I)
            if match:
                content_id = match[1].lower()
                return {"provider": "reddit", "contentId": content_id, "url": f"https://www.reddit.com/comments/{content_id}/", "mediaIndex": None}
    except (ValueError, UnicodeError):
        pass
    raise MediaFetchError("UNSUPPORTED_PAGE", "Enter a Reddit, X or YouTube video URL.")


def media_url_allowed(value: str, provider: str) -> bool:
    try:
        url = urlsplit(value)
        hosts = {"reddit": {"v.redd.it", "packaged-media.redd.it"}, "x": {"video.twimg.com"}}.get(provider, set())
        allowed_host = youtube_media_host(url.hostname) if provider == "youtube" else url.hostname in hosts
        return url.scheme == "https" and allowed_host and not url.username and not url.password and url.port in (None, 443)
    except ValueError:
        return False
