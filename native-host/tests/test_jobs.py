import os
import tempfile
import time
import unittest
from pathlib import Path
from mediafetch_host.jobs import Scheduler
from mediafetch_host.storage import Journal
from mediafetch_host.errors import MediaFetchError


@unittest.skipUnless(os.name == "nt", "Windows process/file semantics")
class JobTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.journal = Journal(self.root / "state", self.root / "videos")
        self.events = []
        self.scheduler = Scheduler(self.journal, {"ffmpeg": str(Path(__file__).resolve()), "attemptTimeout": 10}, self.events.append, Path(__file__).with_name("fake_worker.py").resolve())

    def tearDown(self):
        self.scheduler.close()
        self.journal.close()
        self.temp.cleanup()

    def add(self, number):
        return self.scheduler.enqueue({"url": f"https://x.com/fixture/status/{number}", "quality": "1080"})["jobId"]

    def job(self, job_id):
        return next(job for job in self.scheduler.snapshot()["jobs"] if job["id"] == job_id)

    def wait(self, job_id, states):
        deadline = time.monotonic() + 8
        while time.monotonic() < deadline:
            job = self.job(job_id)
            if job["state"] in states:
                return job
            time.sleep(0.03)
        self.fail(f"Job did not reach {states}: {self.job(job_id)}")

    def test_real_owned_worker_publishes_file(self):
        job = self.wait(self.add("101"), {"completed"})
        self.assertTrue(Path(job["path"]).is_file())
        self.assertGreater(job["bytes"], 0)

    def test_two_job_limit_and_queue(self):
        a, b, c = self.add("102"), self.add("104"), self.add("101")
        self.wait(a, {"downloading"})
        self.wait(b, {"merging"})
        self.assertEqual(self.job(c)["state"], "queued")
        self.assertEqual(len(self.scheduler.running), 2)
        self.scheduler.action("delete", {"jobId": a})
        self.wait(a, {"cancelled"})
        self.wait(c, {"completed"})

    def test_attempt_timeout_stops_owned_work_and_keeps_recovery_data(self):
        self.scheduler.config["attemptTimeout"] = 0.4
        job_id = self.add("102")
        job = self.wait(job_id, {"failed"})
        self.assertEqual(job["errorCode"], "TIMEOUT")
        self.assertTrue(job["hasPartials"])
        self.assertNotIn(job_id, self.scheduler.running)

    def test_missing_ffmpeg_rejects_before_creating_a_job(self):
        self.scheduler.capabilities["ffmpeg"] = False
        with self.assertRaises(MediaFetchError) as failure:
            self.add("101")
        self.assertEqual(failure.exception.code, "FFMPEG_NOT_FOUND")
        self.assertEqual(self.scheduler.snapshot()["jobs"], [])

    def test_destination_change_does_not_redirect_existing_job_cleanup(self):
        job_id = self.add("102")
        self.wait(job_id, {"downloading"})
        old_stage = self.root / "videos" / ".mediafetch-partials" / job_id
        new_root = self.root / "elsewhere"
        self.scheduler.configure(str(new_root))
        self.scheduler.action("delete", {"jobId": job_id})
        self.wait(job_id, {"cancelled"})
        self.assertFalse(old_stage.exists())
        self.assertEqual(list(new_root.iterdir()), [])

    def test_stop_preserves_resume_and_delete_removes_only_owned_files(self):
        job_id = self.add("102")
        self.wait(job_id, {"downloading"})
        self.scheduler.action("stop", {"jobId": job_id})
        job = self.wait(job_id, {"stopped"})
        self.assertTrue(job["hasPartials"])
        self.assertTrue(job["resumable"])
        with self.assertRaises(MediaFetchError):
            self.scheduler.action("forget", {"jobId": job_id})
        self.scheduler.action("delete", {"jobId": job_id})
        job = self.wait(job_id, {"cancelled"})
        self.assertFalse(job["hasPartials"])

    def test_cancel_during_merging(self):
        job_id = self.add("104")
        self.wait(job_id, {"merging"})
        self.scheduler.action("delete", {"jobId": job_id})
        job = self.wait(job_id, {"cancelled"})
        self.assertNotIn("path", job)
        self.assertFalse(job["hasPartials"])

    def test_retry_replaces_attempt_and_remains_one_list_entry(self):
        job_id = self.add("103")
        old = self.wait(job_id, {"failed"})["attemptId"]
        self.scheduler.action("retry", {"jobId": job_id})
        new = self.wait(job_id, {"failed"})["attemptId"]
        self.assertNotEqual(old, new)
        self.assertEqual(len(self.scheduler.snapshot()["jobs"]), 1)

    def test_shutdown_is_recoverable_and_does_not_autorestart(self):
        job_id = self.add("102")
        self.wait(job_id, {"downloading"})
        self.scheduler.close()
        self.assertEqual(self.job(job_id)["state"], "interrupted")
        replacement = Scheduler(self.journal, self.scheduler.config, self.events.append, self.scheduler.entry)
        self.scheduler = replacement
        self.assertEqual(self.job(job_id)["state"], "interrupted")
        self.assertEqual(len(self.scheduler.running), 0)

    def test_completed_file_is_not_deleted_by_late_cancel(self):
        job_id = self.add("101")
        path = self.wait(job_id, {"completed"})["path"]
        self.scheduler.action("delete", {"jobId": job_id})
        self.assertTrue(Path(path).is_file())
        self.assertEqual(self.job(job_id)["state"], "completed")

    def test_forgetting_completed_history_preserves_the_published_video(self):
        job_id = self.add("101")
        saved = Path(self.wait(job_id, {"completed"})["path"])
        # Completion is published before staging cleanup. Wait for the attempt to exit.
        deadline = time.monotonic() + 3
        while job_id in self.scheduler.running and time.monotonic() < deadline:
            time.sleep(0.01)
        original = saved.read_bytes()
        self.scheduler.action("forget", {"jobId": job_id})
        self.assertEqual(self.scheduler.snapshot()["jobs"], [])
        self.assertEqual(saved.read_bytes(), original)

    def test_changed_resume_identity_fails_without_overwriting_partials(self):
        job_id = self.add("102")
        self.wait(job_id, {"downloading"})
        self.scheduler.action("stop", {"jobId": job_id})
        self.wait(job_id, {"stopped"})
        with self.scheduler.lock:
            self.scheduler._find(job_id)["resumeData"] = {"id": "changed"}
        self.scheduler.action("resume", {"jobId": job_id})
        job = self.wait(job_id, {"failed"})
        self.assertEqual(job["errorCode"], "RESUME_UNAVAILABLE")
        self.assertTrue(job["hasPartials"])
        self.assertFalse(job["resumable"])
