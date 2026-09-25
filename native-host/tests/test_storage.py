import os
import subprocess
import tempfile
import unittest
import uuid
from pathlib import Path
from unittest.mock import patch
from mediafetch_host.storage import Journal, staging, cleanup, safe_filename, publish, has_partials
from mediafetch_host.errors import MediaFetchError
from mediafetch_host.windows import locked_directory


@unittest.skipUnless(os.name == "nt", "Windows filesystem semantics")
class StorageTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.job = str(uuid.uuid4())

    def tearDown(self):
        self.temp.cleanup()

    def test_cleanup_preserves_neighbors_and_completed_files(self):
        done = self.root / "keep.mp4"
        done.write_bytes(b"completed")
        other_id = str(uuid.uuid4())
        with staging(self.root, other_id) as other:
            (other / "media.part").write_bytes(b"other")
        with staging(self.root, self.job) as folder:
            (folder / "media.part").write_bytes(b"partial")
            (folder / "media.f137.mp4").write_bytes(b"track")
        cleanup(str(self.root), self.job)
        self.assertFalse(has_partials(str(self.root), self.job))
        self.assertTrue(has_partials(str(self.root), other_id))
        self.assertEqual(done.read_bytes(), b"completed")

    def test_locked_ancestor_cannot_be_renamed(self):
        with staging(self.root, self.job) as folder:
            with self.assertRaises(OSError):
                folder.rename(folder.with_name("swapped"))

    def test_cleanup_rejects_nested_directories(self):
        with staging(self.root, self.job) as folder:
            child = folder / "unexpected"
            child.mkdir()
            (child / "keep.txt").write_text("keep")
        with self.assertRaises(OSError):
            cleanup(str(self.root), self.job)
        self.assertEqual((child / "keep.txt").read_text(), "keep")

    def test_publish_never_overwrites(self):
        existing = self.root / "x_123_video.mp4"
        existing.write_bytes(b"original")
        with staging(self.root, self.job) as folder:
            source = folder / "media.mp4"
            source.write_bytes(b"new")
            target = publish(source, self.root, existing.name)
        self.assertEqual(target.name, "x_123_video (1).mp4")
        self.assertEqual(existing.read_bytes(), b"original")

    def test_filename_is_windows_safe(self):
        name = safe_filename('../CON: title? / 🎬', 'reddit', 'abc123', '.mp4')
        self.assertNotIn('..', name)
        self.assertNotIn('/', name)
        self.assertNotIn(':', name)

    def test_one_journal_writer(self):
        state = self.root / "state"
        first = Journal(state, self.root / "output")
        try:
            with self.assertRaises(MediaFetchError):
                Journal(state, self.root / "output")
        finally:
            first.close()

    def test_cleanup_removes_only_the_verified_legacy_runtime_alias(self):
        runtime = self.root / 'deno.exe'
        runtime.write_bytes(b'preserve runtime')
        completed = self.root / 'saved.mp4'
        completed.write_bytes(b'preserve video')
        for hardlink in (True, False):
            job_id = str(uuid.uuid4())
            with staging(self.root, job_id) as folder:
                shim = folder / '.runtime-cache/node_compat_bin'
                shim.mkdir(parents=True)
                alias = shim / 'node.exe'
                if hardlink:
                    os.link(runtime, alias)
                else:
                    alias.write_bytes(runtime.read_bytes())
            with patch('mediafetch_host.storage.runtime_path', return_value=runtime):
                cleanup(str(self.root), job_id)
            self.assertFalse(folder.exists())
            self.assertEqual(runtime.read_bytes(), b'preserve runtime')
            self.assertEqual(runtime.stat().st_nlink, 1)
            self.assertEqual(completed.read_bytes(), b'preserve video')

    def test_runtime_alias_cleanup_preserves_unexpected_contents_and_foreign_links(self):
        import _winapi
        runtime = self.root / 'deno.exe'
        runtime.write_bytes(b'runtime')
        foreign = self.root / 'unrelated.exe'
        foreign.write_bytes(b'preserve')
        for variant in ('foreign-hardlink', 'unknown-file', 'nested-directory', 'junction'):
            with self.subTest(variant=variant):
                job_id = str(uuid.uuid4())
                with staging(self.root, job_id) as folder:
                    cache = folder / '.runtime-cache'
                    cache.mkdir()
                    shim = cache / 'node_compat_bin'
                    if variant == 'junction':
                        outside = self.root / ('outside-' + job_id)
                        outside.mkdir()
                        (outside / 'node.exe').write_bytes(b'preserve')
                        _winapi.CreateJunction(str(outside), str(shim))
                    else:
                        shim.mkdir()
                        if variant == 'foreign-hardlink':
                            os.link(foreign, shim / 'node.exe')
                        elif variant == 'unknown-file':
                            (shim / 'unexpected.txt').write_bytes(b'preserve')
                        else:
                            (shim / 'node.exe').mkdir()
                            (shim / 'node.exe/keep.txt').write_bytes(b'preserve')
                try:
                    with patch('mediafetch_host.storage.runtime_path', return_value=runtime), self.assertRaises(OSError):
                        cleanup(str(self.root), job_id)
                    self.assertTrue(shim.exists())
                    self.assertEqual(foreign.read_bytes(), b'preserve')
                    self.assertEqual(runtime.read_bytes(), b'runtime')
                    if variant == 'junction':
                        self.assertEqual((outside / 'node.exe').read_bytes(), b'preserve')
                finally:
                    if variant == 'junction':
                        shim.rmdir()

    def test_youtube_uses_the_title_and_preserves_duplicate_downloads(self):
        for content_id, expected in (("GuseDyzBWWQ", "Purr.mp4"), ("abcdefghijk", "Purr (1).mp4")):
            with staging(self.root, str(uuid.uuid4())) as folder:
                source = folder / "media.mp4"
                source.write_bytes(content_id.encode())
                target = publish(source, self.root, safe_filename("Purr", "youtube", content_id, ".mp4"))
                self.assertEqual(target.name, expected)
        self.assertEqual((self.root / "Purr.mp4").read_bytes(), b"GuseDyzBWWQ")
        self.assertEqual((self.root / "Purr (1).mp4").read_bytes(), b"abcdefghijk")
        self.assertEqual(safe_filename("Tail Count Nine", "youtube", "MkycQONC3SE", ".webm"), "Tail Count Nine.webm")
        self.assertEqual(safe_filename("Title", "x", "123", ".mp4"), "x_123_Title.mp4")

    def test_youtube_titles_remain_valid_windows_files(self):
        cases = {
            "CON": "_CON.mp4", "nul.txt": "_nul.txt.mp4", "LPT¹": "_LPT¹.mp4",
            "COM2.demo": "_COM2.demo.mp4", "conout$": "_conout$.mp4",
            " . ": "video.mp4", "Nya… it's 🎬 time": "Nya… it's 🎬 time.mp4",
            '../outside/CON: title?\\take*\x00': '_outside_CON_ title__take__.mp4',
            "Wait... now. ": "Wait... now.mp4",
        }
        for title, expected in cases.items():
            with self.subTest(title=title):
                name = safe_filename(title, "youtube", "GuseDyzBWWQ", ".mp4")
                self.assertEqual(name, expected)
                target = self.root / name
                target.write_bytes(b"safe")
                self.assertEqual(target.parent, self.root)
                self.assertEqual(target.read_bytes(), b"safe")
        title = "🎬" * 100
        name = safe_filename(title, "youtube", "GuseDyzBWWQ", ".mp4")
        self.assertEqual(name, "🎬" * 90 + ".mp4")
        (self.root / name).write_bytes(b"unicode")

    def test_junction_is_rejected_without_touching_target(self):
        import _winapi
        outside = self.root / 'unrelated'
        outside.mkdir()
        keep = outside / 'keep.txt'
        keep.write_text('preserve')
        partials = self.root / '.mediafetch-partials'
        partials.mkdir()
        _winapi.CreateJunction(str(outside), str(partials / self.job))
        try:
            with self.assertRaises(OSError):
                cleanup(str(self.root), self.job)
            self.assertEqual(keep.read_text(), 'preserve')
        finally:
            (partials / self.job).rmdir()

    def test_locked_partial_file_remains_for_cleanup_retry(self):
        with staging(self.root, self.job) as folder:
            partial = folder / 'media.part'
            partial.write_bytes(b'preserve')
        with partial.open('rb'):
            with self.assertRaises(OSError):
                cleanup(str(self.root), self.job)
            self.assertTrue(partial.exists())
        cleanup(str(self.root), self.job)
        self.assertFalse(partial.exists())

    def test_replaced_destination_root_is_not_followed_during_cleanup(self):
        import _winapi
        outside = self.root / 'unrelated'
        foreign_stage = outside / '.mediafetch-partials' / self.job
        foreign_stage.mkdir(parents=True)
        keep = foreign_stage / 'keep.txt'
        keep.write_text('preserve')
        replaced = self.root / 'original-destination'
        _winapi.CreateJunction(str(outside), str(replaced))
        try:
            with self.assertRaises(OSError):
                cleanup(str(replaced), self.job)
            self.assertEqual(keep.read_text(), 'preserve')
        finally:
            replaced.rmdir()
