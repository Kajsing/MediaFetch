"""Per-worker network policy, including redirects before a new request is sent."""
from urllib.parse import urlsplit
from .errors import MediaFetchError

HOSTS = {
    "reddit": {"reddit.com", "www.reddit.com", "old.reddit.com", "oauth.reddit.com", "v.redd.it", "packaged-media.redd.it"},
    "x": {"x.com", "www.x.com", "twitter.com", "www.twitter.com", "api.x.com", "api.twitter.com", "cdn.syndication.twimg.com", "syndication.twitter.com", "video.twimg.com"},
}


def check_url(raw: str, provider: str):
    try:
        url = urlsplit(raw)
        if url.scheme == "https" and url.hostname in HOSTS[provider] and not url.username and not url.password and url.port in (None, 443):
            return
    except (ValueError, KeyError):
        pass
    raise MediaFetchError("UNSUPPORTED_MEDIA", "The provider requested an unsupported network destination.")


def downloader_class(provider, on_resume=None, on_restart=None):
    from yt_dlp import YoutubeDL
    from yt_dlp.networking import _urllib
    original_redirect = _urllib.RedirectHandler

    class ProviderRedirect(original_redirect):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            check_url(newurl, provider)
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    # Workers are single-attempt processes. No other request or provider shares this class.
    _urllib.RedirectHandler = ProviderRedirect

    class ProviderDownloader(YoutubeDL):
        def build_request_director(self, handlers, preferences=None):
            return super().build_request_director([_urllib.UrllibRH], preferences)

        def urlopen(self, request):
            raw = request if isinstance(request, str) else getattr(request, "url", None) or request.get_full_url()
            check_url(raw, provider)
            resume_start = 0
            if on_resume and not isinstance(request, str):
                import re
                header = getattr(request, 'headers', {}).get('Range', '')
                match = re.fullmatch(r'bytes=(\d+)-', header)
                if match and int(match[1]) > 0:
                    resume_start = int(match[1])
            response = super().urlopen(request)
            if resume_start and response.status == 206:
                on_resume(resume_start)
            elif resume_start and response.status == 200 and on_restart:
                on_restart()
            return response

    return ProviderDownloader
