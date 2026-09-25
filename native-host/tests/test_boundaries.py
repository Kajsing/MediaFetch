import io
import json
import struct
import unittest
import uuid
from mediafetch_host.protocol import read_message, validate, Writer
from mediafetch_host.providers import canonical, media_url_allowed
from mediafetch_host.errors import MediaFetchError, classify_error


class Boundaries(unittest.TestCase):
    def test_provider_urls(self):
        self.assertEqual(canonical("https://old.reddit.com/r/a/comments/abc123/title/?track=secret")["url"], "https://www.reddit.com/comments/abc123/")
        self.assertEqual(canonical("https://x.com/M1Astra/status/2103152489772073421/video/2")["mediaIndex"], 2)
        for url in ("http://x.com/a/status/1", "https://x.com.evil.test/a/status/1", "https://u:p@x.com/a/status/1", "https://x.com:444/a/status/1", "https://youtube.com/watch?v=a", "https://x.com/a", "https://v.redd.it/abc", "https://x.com/a/status/1/video/50"):
            with self.subTest(url=url), self.assertRaises(MediaFetchError):
                canonical(url)

    def test_only_expected_media_hosts(self):
        self.assertTrue(media_url_allowed("https://v.redd.it/abc/DASH_720.mp4", "reddit"))
        for url in ("https://localhost/video.mp4", "file:///c:/x", "https://video.twimg.com.evil.test/a", "https://u:p@video.twimg.com/a"):
            self.assertFalse(media_url_allowed(url, "x"))

    def test_strict_schema(self):
        request = {"v": 1, "id": str(uuid.uuid4()), "action": "enqueue", "url": "https://x.com/a/status/1", "quality": "1080"}
        self.assertEqual(validate(request), request)
        for fields in ({"args": ["--exec", "bad"]}, {"destination": "C:\\"}, {"mediaIndex": True}, {"quality": "999"}, {"v": True}):
            with self.subTest(fields=fields), self.assertRaises(MediaFetchError):
                validate(request | fields)

    def test_partial_reads_and_unicode_frames(self):
        output = io.BytesIO()
        Writer(output).send({"title": "Video æøå 🎬"})
        class ShortReads(io.BytesIO):
            def read(self, count=-1):
                return super().read(min(count, 2))
        self.assertEqual(read_message(ShortReads(output.getvalue())), {"title": "Video æøå 🎬"})
        self.assertIsNone(read_message(io.BytesIO()))

    def test_invalid_frames(self):
        for payload in (struct.pack("<I", 0), struct.pack("<I", 300000), struct.pack("<I", 1) + b"\xff"):
            with self.assertRaises(MediaFetchError):
                read_message(io.BytesIO(payload))
        with self.assertRaises(EOFError):
            read_message(io.BytesIO(b"\x02\x00"))

    def test_errors_do_not_echo_sensitive_details(self):
        code, message = classify_error("403 https://video.twimg.com/private?token=secret")
        self.assertEqual(code, "AUTH_REQUIRED")
        self.assertNotIn("secret", message)
