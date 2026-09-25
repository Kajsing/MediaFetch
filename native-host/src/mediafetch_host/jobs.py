import json
import os
import subprocess
import sys
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from . import __version__
from .errors import MediaFetchError, classify_error
from .providers import canonical
from .storage import Journal, staging, cleanup, has_partials, safe_root, safe_filename, publish, downloads_folder
from .windows import JobObject

ACTIVE = {"queued", "resolving", "downloading", "merging", "stopping", "deleting"}
PUBLIC_FIELDS = {"id", "attemptId", "revision", "provider", "url", "title", "quality", "state", "progress", "createdAt", "updatedAt", "bytes", "error", "errorCode", "path", "resumable", "hasPartials", "mediaCount", "mediaIndex", "resumedBytes", "resumeRestarted"}


def now():
    return datetime.now(timezone.utc).isoformat()


class Attempt:
    def __init__(self):
        self.stop = threading.Event()
        self.tree: JobObject | None = None
        self.process: subprocess.Popen | None = None
        self.timed_out = False


class Scheduler:
    def __init__(self, journal: Journal, config: dict, emit, worker_entry: Path | None = None):
        self.journal, self.config, self.emit = journal, config, emit
        self.entry = worker_entry or Path(__file__).resolve().parents[2] / "host.py"
        self.lock = threading.RLock()
        self.running: dict[str, Attempt] = {}
        self.threads: set[threading.Thread] = set()
        self.closing = False
        self.capabilities = self._capabilities()
        for job in self.journal.data["jobs"]:
            if job["state"] == "deleting":
                self._cleanup_job(job)
            elif job["state"] in ACTIVE:
                job.update(state="interrupted", error="The previous session ended. Continue or retry when ready.", errorCode="INTERRUPTED")
            self._partial_state(job)
        self.journal.save()

    def _capabilities(self):
        try:
            import importlib.metadata
            version = importlib.metadata.version("yt-dlp")
        except importlib.metadata.PackageNotFoundError:
            version = None
        ffmpeg = self.config.get("ffmpeg")
        return {"ytDlpVersion": version, "ffmpeg": bool(ffmpeg and Path(ffmpeg).is_absolute() and Path(ffmpeg).is_file()), "helperVersion": __version__}

    def snapshot(self):
        with self.lock:
            return {"revision": self.journal.data["revision"], "jobs": [{key: value for key, value in job.items() if key in PUBLIC_FIELDS} for job in reversed(self.journal.data["jobs"])], "destination": self.journal.data["destination"], **self.capabilities}

    def _changed(self, job=None):
        self.journal.data["revision"] += 1
        if job is not None:
            job["revision"] = self.journal.data["revision"]
            job["updatedAt"] = now()
        terminal = [job for job in self.journal.data["jobs"] if job["state"] in ("completed", "cancelled") and not job.get("hasPartials")]
        prune = {job["id"] for job in terminal[:-100]}
        self.journal.data["jobs"] = [job for job in self.journal.data["jobs"] if job["id"] not in prune]
        self.journal.save()
        try:
            self.emit({"kind": "snapshot", "data": self.snapshot()})
        except (OSError, ValueError):
            pass  # The main loop handles a closed Chrome pipe and shuts workers down.

    def _partial_state(self, job):
        job["hasPartials"] = has_partials(job["destination"], job["id"])
        job["resumable"] = bool(job["hasPartials"] and job.get("resumeData") and job["state"] in ("stopped", "interrupted", "failed") and job.get("errorCode") != "RESUME_UNAVAILABLE")

    def _find(self, job_id):
        for job in self.journal.data["jobs"]:
            if job["id"] == job_id:
                return job
        raise MediaFetchError("JOB_NOT_FOUND", "This download is no longer in the list.")

    def enqueue(self, request):
        candidate = canonical(request["url"])
        with self.lock:
            if self.closing:
                raise MediaFetchError("HELPER_CLOSING", "The helper is shutting down. Reconnect and retry.")
            if not self.capabilities["ytDlpVersion"]:
                raise MediaFetchError("YTDLP_NOT_FOUND", "Reinstall the helper to restore yt-dlp.")
            if not self.capabilities["ffmpeg"]:
                raise MediaFetchError("FFMPEG_NOT_FOUND", "Install ffmpeg and run the helper installer again.")
            if len(self.journal.data["jobs"]) >= 200:
                raise MediaFetchError("QUEUE_FULL", "Remove old finished downloads before adding more.")
            media_index = request.get("mediaIndex") or candidate["mediaIndex"]
            for job in self.journal.data["jobs"]:
                if job["url"] == candidate["url"] and job["quality"] == request["quality"] and job.get("mediaIndex") == media_index and job["state"] in ACTIVE:
                    return {"jobId": job["id"]}
            job = {"id": str(uuid.uuid4()), "attemptId": str(uuid.uuid4()), "revision": 0, **candidate, "mediaIndex": media_index, "title": f"{candidate['provider'].capitalize()} video {candidate['contentId']}", "quality": request["quality"], "state": "queued", "progress": None, "bytes": 0, "destination": self.journal.data["destination"], "createdAt": now(), "updatedAt": now(), "resumable": False, "hasPartials": False}
            self.journal.data["jobs"].append(job)
            self._changed(job)
            self._schedule()
            return {"jobId": job["id"]}

    def _schedule(self):
        if self.closing:
            return
        for job in self.journal.data["jobs"]:
            if len(self.running) >= 2:
                break
            if job["state"] != "queued" or job["id"] in self.running:
                continue
            control = Attempt()
            self.running[job["id"]] = control
            job["state"] = "resolving"
            self._changed(job)
            thread = threading.Thread(target=self._run, args=(job, control), daemon=True)
            self.threads.add(thread)
            thread.start()

    def _stop_process(self, control):
        control.stop.set()
        if control.tree:
            control.tree.stop()

    def _cleanup_job(self, job):
        try:
            cleanup(job["destination"], job["id"])
            job.update(state="cancelled", progress=None, bytes=0, resumable=False, hasPartials=False)
            for key in ("resumeData", "error", "errorCode"):
                job.pop(key, None)
        except OSError:
            job.update(state="failed", errorCode="CLEANUP_FAILED", error="Could not delete partial files. Close any program using them and try Delete partial files again.", hasPartials=True, resumable=False)

    def action(self, action, request):
        with self.lock:
            job = self._find(request["jobId"])
            if action == "forget":
                if job["state"] in ACTIVE or has_partials(job["destination"], job["id"]):
                    raise MediaFetchError("PARTIALS_REMAIN", "Stop this download and delete its partial files before removing it.")
                self.journal.data["jobs"].remove(job)
                self._changed()
                return {}
            if job["state"] == "completed":
                if action == "delete" and has_partials(job["destination"], job["id"]):
                    try:
                        cleanup(job["destination"], job["id"])
                        job.pop("error", None)
                        job.pop("errorCode", None)
                    except OSError:
                        job.update(errorCode="CLEANUP_FAILED", error="Could not delete partial files. Close any program using them and try again.")
                    self._partial_state(job)
                    self._changed(job)
                return {"state": "completed"}
            if job["state"] in ("stopping", "deleting"):
                return {"state": job["state"]}
            if action in ("stop", "delete"):
                if action == "stop" and job["state"] not in ACTIVE:
                    return {"state": job["state"]}
                job["state"] = "deleting" if action == "delete" else "stopping"
                self._changed(job)
                control = self.running.get(job["id"])
                if control:
                    self._stop_process(control)
                elif action == "delete":
                    self._cleanup_job(job)
                else:
                    job["state"] = "stopped"
                    self._partial_state(job)
                self._changed(job)
            elif action in ("retry", "resume"):
                if job["state"] in ACTIVE:
                    raise MediaFetchError("JOB_ACTIVE", "Stop the current attempt first.")
                self._partial_state(job)
                if action == "resume" and not job["resumable"]:
                    raise MediaFetchError("RESUME_UNAVAILABLE", "This download cannot safely continue. Choose Retry.")
                if action == "retry":
                    self._cleanup_job(job)
                    if job.get("errorCode") == "CLEANUP_FAILED":
                        self._changed(job)
                        raise MediaFetchError("CLEANUP_FAILED", job["error"])
                    if request.get("mediaIndex"):
                        job["mediaIndex"] = request["mediaIndex"]
                job.update(state="queued", attemptId=str(uuid.uuid4()), progress=None, resume=action == "resume")
                job.pop("resumedBytes", None)
                job.pop("resumeRestarted", None)
                for key in ("error", "errorCode", "mediaCount"):
                    job.pop(key, None)
                self._changed(job)
                self._schedule()
            return {"state": job["state"]}

    def configure(self, destination: str):
        path = safe_root(destination or (downloads_folder() / "VideoDownload"))
        path.mkdir(parents=True, exist_ok=True)
        # Validate writable local storage using a uniquely owned empty probe file.
        probe = path / f".mediafetch-probe-{uuid.uuid4()}"
        try:
            with probe.open("xb"):
                pass
        finally:
            if probe.exists():
                probe.unlink()
        with self.lock:
            self.journal.data["destination"] = str(path)
            self._changed()
        return {"destination": str(path)}

    def _event(self, job, control, event):
        with self.lock:
            if control.stop.is_set():
                return
            kind = event.get("type")
            if kind == "identity":
                job["resumeData"] = event["data"]
                job["title"] = str(event["title"])[:180]
                job["state"] = "downloading"
            elif kind == "progress":
                job.update(state="downloading", bytes=event["bytes"], progress=event["progress"], hasPartials=True)
            elif kind == "merging":
                job.update(state="merging", progress=None)
            elif kind == "resume":
                job["resumedBytes"] = max(job.get("resumedBytes", 0), int(event["bytes"]))
            elif kind == "restart":
                job["resumeRestarted"] = True
            elif kind == "selection":
                job["mediaCount"] = min(int(event["count"]), 16)
            elif kind == "error":
                job.update(error=str(event["message"])[:300], errorCode=str(event["code"])[:60])
            else:
                return
            self._changed(job)

    def _run(self, job, control):
        timer = None
        final_event = None
        try:
            with staging(Path(job["destination"]), job["id"]) as folder:
                tree = JobObject()
                with self.lock:
                    control.tree = tree
                    if control.stop.is_set():
                        return
                    process = subprocess.Popen([sys.executable, "-I", str(self.entry), "--worker"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW, shell=False)
                    control.process = process
                    try:
                        tree.assign(process)
                    except OSError:
                        process.kill()
                        process.wait()
                        raise
                    spec = {key: job.get(key) for key in ("url", "quality", "mediaIndex", "resume", "resumeData")}
                    spec.update(staging=str(folder), ffmpeg=self.config["ffmpeg"])
                    process.stdin.write((json.dumps(spec) + "\n").encode("utf-8"))
                    process.stdin.close()
                def timeout():
                    with self.lock:
                        control.timed_out = True
                        self._stop_process(control)
                timer = threading.Timer(self.config.get("attemptTimeout", 1800), timeout)
                timer.daemon = True
                timer.start()
                while line := process.stdout.readline(65537):
                    if len(line) > 65536:
                        raise MediaFetchError("INVALID_OUTPUT", "The extractor returned an oversized event.")
                    event = json.loads(line)
                    if event.get("type") == "complete":
                        final_event = event
                    else:
                        self._event(job, control, event)
                process.wait(timeout=10)
                with self.lock:
                    if control.stop.is_set():
                        return
                    if process.returncode or not final_event:
                        job["state"] = "failed"
                        job.setdefault("error", "The download process ended before a final video was produced.")
                        job.setdefault("errorCode", "DOWNLOAD_FAILED")
                    else:
                        name = final_event["filename"]
                        if Path(name).name != name or "/" in name or "\\" in name:
                            raise MediaFetchError("INVALID_OUTPUT", "The extractor returned an unsafe filename.")
                        source = folder / name
                        target = publish(source, Path(job["destination"]), safe_filename(final_event["title"], job["provider"], job["contentId"], source.suffix))
                        job.update(state="completed", path=str(target), title=final_event["title"], bytes=target.stat().st_size, progress=100, resumable=False)
                        job.pop("resumeData", None)
                        # Save publication before any staging cleanup: recovery must preserve this file.
                        self._changed(job)
        except Exception as error:
            with self.lock:
                if job["state"] != "completed" and not control.stop.is_set():
                    code, message = (error.code, str(error)) if isinstance(error, MediaFetchError) else classify_error(str(error))
                    job.update(state="failed", errorCode=code, error=message)
        finally:
            if timer:
                timer.cancel()
            # Stop, timeout and shutdown share this handle. Serialize its disposal
            # with those actions so none can terminate an already-closed handle.
            with self.lock:
                if control.tree:
                    control.tree.close()
                    control.tree = None
            if control.process:
                try:
                    control.process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    control.process.kill()
                    control.process.wait()
                if control.process.stdout:
                    control.process.stdout.close()
            with self.lock:
                if job["state"] == "deleting":
                    self._cleanup_job(job)
                elif control.timed_out and job["state"] != "completed":
                    job.update(state="failed", errorCode="TIMEOUT", error="The download exceeded its time limit. Continue or retry when ready.")
                elif control.stop.is_set() and job["state"] != "completed":
                    job["state"] = "interrupted" if self.closing else "stopped"
                if job["state"] == "completed":
                    try:
                        cleanup(job["destination"], job["id"])
                    except OSError:
                        job.update(errorCode="CLEANUP_FAILED", error="The video is saved, but some temporary files could not be removed.")
                self._partial_state(job)
                self.running.pop(job["id"], None)
                self.threads.discard(threading.current_thread())
                self._changed(job)
                self._schedule()

    def close(self):
        with self.lock:
            self.closing = True
            for control in list(self.running.values()):
                self._stop_process(control)
            for job in self.journal.data["jobs"]:
                if job["state"] == "queued":
                    job["state"] = "interrupted"
            threads = list(self.threads)
        for thread in threads:
            thread.join(timeout=20)
        with self.lock:
            self.journal.save()
