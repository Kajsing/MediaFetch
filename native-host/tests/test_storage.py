import os
import subprocess
import tempfile
import unittest
import uuid
from pathlib import Path
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
