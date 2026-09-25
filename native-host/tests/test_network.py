import unittest
from urllib.request import Request
from mediafetch_host.network import check_url, downloader_class
from mediafetch_host.errors import MediaFetchError


class NetworkTests(unittest.TestCase):
    def test_request_and_redirect_destinations_are_exact(self):
        check_url("https://video.twimg.com/abc/video.mp4?token=transient", "x")
        check_url("https://packaged-media.redd.it/abc", "reddit")
        for raw in ("https://127.0.0.1/", "https://x.com.evil.test/", "http://video.twimg.com/a", "https://user:pass@video.twimg.com/a", "https://youtube.com/watch?v=a"):
            with self.subTest(raw=raw), self.assertRaises(MediaFetchError):
                check_url(raw, "x")

    def test_redirect_rejected_before_following_it(self):
        from yt_dlp.networking import _urllib
        original = _urllib.RedirectHandler
        try:
            downloader_class("x")
            handler = _urllib.RedirectHandler()
            with self.assertRaises(MediaFetchError):
                handler.redirect_request(Request("https://video.twimg.com/a"), None, 302, "Found", {}, "https://127.0.0.1/internal")
        finally:
            _urllib.RedirectHandler = original
