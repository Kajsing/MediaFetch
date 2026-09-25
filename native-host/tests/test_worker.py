import io
import json
import unittest
from contextlib import redirect_stdout
from copy import deepcopy
from yt_dlp.utils import DownloadError, ExtractorError
from mediafetch_host.worker import emit, extract_public_info, format_selector, QuietLogger


class WorkerTests(unittest.TestCase):
    def test_worker_events_survive_non_utf8_windows_pipes(self):
        for encoding in ('cp1252', 'ascii', 'utf-8'):
            for title in ('Video æøå', 'わたし 🎬', 'Title with\nline break'):
                with self.subTest(encoding=encoding, title=title):
                    raw = io.BytesIO()
                    with io.TextIOWrapper(raw, encoding=encoding) as stream:
                        events = [
                            {'type': 'identity', 'title': title, 'data': {'id': 'fixture'}},
                            {'type': 'complete', 'title': title, 'filename': 'media.mp4'},
                        ]
                        with redirect_stdout(stream):
                            for event in events:
                                emit(event)
                        # Scheduler reads bytes and expects valid JSON, independent
                        # of the worker's Windows text-stream encoding.
                        self.assertEqual([json.loads(line) for line in raw.getvalue().splitlines()], events)

    def test_malformed_public_x_response_uses_supported_public_embed_endpoint(self):
        class Initial:
            def extract_info(self, url, download):
                raise DownloadError('Failed to parse JSON')
        seen = []
        class Fallback:
            def __init__(self, options): seen.append(options)
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def extract_info(self, url, download): return {"id": "123"}
        candidate = {"provider": "x", "url": "https://x.com/user/status/123"}
        self.assertEqual(extract_public_info(Initial(), candidate, {"cookiefile": None}, Fallback), {"id": "123"})
        self.assertEqual(seen[0]["extractor_args"], {"twitter": {"api": ["syndication"]}})
        self.assertIsNone(seen[0]["cookiefile"])

    def test_authentication_failure_is_not_retried_through_other_endpoint(self):
        class Initial:
            def extract_info(self, url, download):
                raise DownloadError('401 login required')
        def unexpected(options):
            self.fail('Authentication errors must not trigger fallback')
        with self.assertRaises(DownloadError):
            extract_public_info(Initial(), {"provider": "x", "url": "https://x.com/user/status/123"}, {}, unexpected)

    def test_quality_cap_applies_to_real_ytdlp_fallback_selection(self):
        from yt_dlp import YoutubeDL
        info = {'id': 'fixture', 'title': 'Fixture', 'extractor': 'fixture', 'formats': [
            {'format_id': 'high', 'url': 'https://example.invalid/high.mp4', 'ext': 'mp4', 'height': 1440, 'vcodec': 'h264', 'acodec': 'aac'},
            {'format_id': 'low', 'url': 'https://example.invalid/low.mp4', 'ext': 'mp4', 'height': 720, 'vcodec': 'h264', 'acodec': 'aac'},
        ]}
        with YoutubeDL({'format': format_selector('1080'), 'quiet': True, 'logger': QuietLogger(), 'cachedir': False}) as downloader:
            downloader.urlopen = lambda *args: self.fail('Format selection must not contact the network')
            selected = downloader.process_ie_result(deepcopy(info), download=False)
            self.assertEqual(selected['height'], 720)
            with self.assertRaisesRegex(ExtractorError, 'Requested format is not available'):
                downloader.process_ie_result({**info, 'formats': [info['formats'][0]]}, download=False)
