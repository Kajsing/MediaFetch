import os
import subprocess
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from urllib.request import Request
from mediafetch_host.errors import MediaFetchError
from mediafetch_host.providers import canonical, media_url_allowed
from mediafetch_host.network import check_url, downloader_class
from mediafetch_host.youtube import runtime_options, runtime_path, validate_video


class YouTubeTests(unittest.TestCase):
    def test_single_video_urls_and_media_boundary(self):
        video = "MkycQONC3SE"
        for raw in (f"https://youtu.be/{video}?si=private", f"https://m.youtube.com/shorts/{video}/", f"https://youtube.com/watch?v={video}&list=PLx&t=8"):
            self.assertEqual(canonical(raw)["url"], f"https://www.youtube.com/watch?v={video}")
        for raw in (f"https://youtube.com/watch?v={video}&v=abcdefghijk", "https://youtube.com/playlist?list=x", "https://youtube.com/@Kajsing", f"https://youtube.com/embed/{video}", f"https://youtu.be.evil.test/{video}", f"https://youtube.com/watch?v={video}x"):
            with self.subTest(raw=raw), self.assertRaises(MediaFetchError): canonical(raw)
        self.assertTrue(media_url_allowed("https://rr1---sn-abc.googlevideo.com/videoplayback?transient=value", "youtube"))
        for raw in ("https://googlevideo.com/a", "https://googlevideo.com.evil.test/a", "https://u:p@r.googlevideo.com/a", "https://r.googlevideo.com:444/a", "http://r.googlevideo.com/a", "https://127.0.0.1/a", "https://video.twimg.com/a"):
            self.assertFalse(media_url_allowed(raw, "youtube"), raw)
        self.assertFalse(media_url_allowed("https://video.twimg.com/a", "unknown"))

    def test_network_metadata_and_redirects(self):
        from yt_dlp.networking import _urllib
        for raw in ("https://www.youtube.com/watch?v=MkycQONC3SE", "https://youtubei.googleapis.com/youtubei/v1/player", "https://rr1.googlevideo.com/a"):
            check_url(raw, "youtube")
        original = _urllib.RedirectHandler
        try:
            downloader_class("youtube")
            handler = _urllib.RedirectHandler()
            for raw in ("https://127.0.0.1/", "https://googlevideo.com.evil.test/", "https://accounts.google.com/", "https://video.twimg.com/a"):
                with self.subTest(raw=raw), self.assertRaises(MediaFetchError):
                    handler.redirect_request(Request("https://www.youtube.com/a"), None, 302, "Found", {}, raw)
        finally:
            _urllib.RedirectHandler = original

    def test_rejects_wrong_identity_playlists_live_and_restricted_media(self):
        base = {"id": "MkycQONC3SE", "live_status": "not_live", "availability": "public"}
        validate_video(base, base["id"])
        validate_video({**base, "live_status": "was_live"}, base["id"])
        for extra in ({"id": "abcdefghijk"}, {"_type": "playlist"}, {"entries": []}, {"is_live": True}, {"live_status": "is_upcoming"}, {"live_status": "post_live"}, {"has_drm": True}, {"age_limit": 18}, {"availability": "needs_auth"}, {"availability": "private"}):
            with self.subTest(extra=extra), self.assertRaises(MediaFetchError): validate_video({**base, **extra}, base["id"])

    def test_missing_runtime_disables_admission_without_breaking_other_providers(self):
        from mediafetch_host.jobs import Scheduler
        with patch('mediafetch_host.jobs.runtime_path', return_value=None):
            scheduler = Scheduler.__new__(Scheduler)
            scheduler.config = {}
            self.assertEqual(scheduler._capabilities()["providers"], ["reddit", "x"])
        with patch('mediafetch_host.youtube.runtime_path', return_value=None), self.assertRaises(MediaFetchError) as failure:
            runtime_options(Path("unused"))
        self.assertEqual(failure.exception.code, "YOUTUBE_RUNTIME_MISSING")

    def test_local_runtime_is_restricted_and_external_downloader_is_disabled(self):
        from yt_dlp.downloader.external import FFmpegFD
        from yt_dlp.extractor.youtube.jsc._builtin.deno import DenoJCP
        runtime = runtime_path()
        self.assertIsNotNone(runtime, "Install pinned development requirements")
        with tempfile.TemporaryDirectory() as temp, patch.dict(os.environ, {"DENO_AUTH_TOKENS": "fixture", "NODE_OPTIONS": "fixture", "HTTPS_PROXY": "fixture"}), patch.object(FFmpegFD, 'real_download'):
            options = runtime_options(Path(temp))
            self.assertEqual(options["remote_components"], [])
            self.assertEqual(options["js_runtimes"], {"deno": {"path": str(runtime)}})
            self.assertNotIn("DENO_AUTH_TOKENS", os.environ)
            self.assertNotIn("NODE_OPTIONS", os.environ)
            self.assertNotIn("HTTPS_PROXY", os.environ)
            with self.assertRaises(MediaFetchError): FFmpegFD.real_download(None, 'media.mp4', {})
            script = 'for (const name of ["read","write","net","env","run"]) { if ((await Deno.permissions.query({name})).state !== "prompt") throw new Error(name); } try { Deno.readTextFileSync("denied.txt"); throw new Error("read permitted"); } catch(e) { if(e.name !== "NotCapable") throw e; } console.log("restricted");'
            command = [str(runtime), 'run', *DenoJCP._DENO_BASE_OPTIONS, '--no-npm', '--cached-only', '-']
            self.assertFalse(any(arg.startswith('--allow-') for arg in command))
            result = subprocess.run(command, input=script, text=True, capture_output=True, timeout=20, cwd=temp)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('restricted', result.stdout)

    def test_runtime_cache_cleanup_is_bounded_and_never_follows_links(self):
        import uuid
        from mediafetch_host.storage import cleanup, staging
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp) / 'VideoDownload'
            job_id = str(uuid.uuid4())
            with staging(root, job_id) as folder:
                cache = folder / '.runtime-cache'
                cache.mkdir()
                (cache / 'npm').mkdir()
                (cache / 'dep_analysis_cache_v2').write_bytes(b'fixture')
            cleanup(str(root), job_id)
            self.assertFalse(folder.exists())
            with staging(root, job_id) as folder:
                cache = folder / '.runtime-cache'; cache.mkdir()
                (cache / 'unknown').mkdir()
                (cache / 'unknown/keep.txt').write_text('preserve')
            with self.assertRaises(OSError): cleanup(str(root), job_id)
            self.assertTrue((cache / 'unknown/keep.txt').is_file())
            # A separate attempt with a cache junction must preserve its target.
            linked_id = str(uuid.uuid4())
            target = Path(temp) / 'outside'; target.mkdir()
            (target / 'dep_analysis_cache_v2').write_text('preserve')
            with staging(root, linked_id) as linked:
                import _winapi
                _winapi.CreateJunction(str(target), str(linked / '.runtime-cache'))
            with self.assertRaises(OSError): cleanup(str(root), linked_id)
            self.assertEqual((target / 'dep_analysis_cache_v2').read_text(), 'preserve')

    def test_chunked_range_resume_is_reported_once(self):
        from yt_dlp import YoutubeDL
        from yt_dlp.networking import Request as YtRequest, _urllib
        from types import SimpleNamespace
        original = _urllib.RedirectHandler
        resumed = []
        try:
            downloader = downloader_class('youtube', resumed.append)
            with patch.object(YoutubeDL, 'urlopen', return_value=SimpleNamespace(status=206)), downloader({'quiet': True}) as instance:
                for start in (8192, 10485760):
                    instance.urlopen(YtRequest('https://rr1.googlevideo.com/a', headers={'Range': f'bytes={start}-{start + 1000}'}))
            self.assertEqual(resumed, [8192])
        finally:
            _urllib.RedirectHandler = original
