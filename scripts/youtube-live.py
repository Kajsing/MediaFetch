"""Opt-in real native YouTube acceptance in a separate journal and destination."""
import argparse
import json
import queue
import shutil
import subprocess
import sys
import tempfile
import threading
import time
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "native-host/src"))
from mediafetch_host.protocol import Writer, read_message


class Host:
    def __init__(self, config):
        self.process = subprocess.Popen([sys.executable, "-I", str(ROOT / "native-host/host.py"), "--config", str(config), f"chrome-extension://{'a' * 32}/"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
        self.messages = queue.Queue()
        self.writer = Writer(self.process.stdin)
        def read():
            try:
                while (message := read_message(self.process.stdout)) is not None:
                    self.messages.put(message)
            except (OSError, EOFError):
                pass
        self.reader = threading.Thread(target=read, daemon=True)
        self.reader.start()

    def call(self, action, **fields):
        request_id = str(uuid.uuid4())
        self.writer.send({"v": 1, "id": request_id, "action": action, **fields})
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            message = self.messages.get(timeout=max(.1, deadline - time.monotonic()))
            if message.get("id") == request_id:
                if not message["ok"]:
                    raise RuntimeError(message.get("error", "Native request failed"))
                return message["data"]
        raise TimeoutError("Native request timed out")

    def wait(self, job_id, states, timeout=300):
        deadline = time.monotonic() + timeout
        previous = None
        while time.monotonic() < deadline:
            job = next(j for j in self.call("snapshot")["jobs"] if j["id"] == job_id)
            if job["state"] != previous:
                print(f"YouTube attempt: {job['state']}", flush=True)
                previous = job["state"]
            # Publication is journaled before cleanup, then a second revision
            # reports cleanup success/failure. Wait for that settled revision.
            if job["state"] == "completed" and job["hasPartials"] and not job.get("errorCode"):
                time.sleep(.15)
                continue
            if job["state"] == "downloading" and "downloading" in states and job["bytes"] == 0:
                time.sleep(.05)
                continue  # Extractor identity precedes creation of the first partial file.
            if job["state"] in states or job["state"] in {"failed", "completed", "cancelled"}:
                return job
            time.sleep(.15)
        raise TimeoutError("YouTube attempt timed out")

    def close(self):
        self.process.stdin.close()
        try:
            self.process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.process.kill(); self.process.wait(timeout=5)
        self.reader.join(timeout=3)
        self.process.stdout.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", action="store_true", required=True)
    parser.add_argument("--recovery", action="store_true")
    parser.add_argument("--evidence", type=Path, default=ROOT / "artifacts/youtube-live.json")
    parser.add_argument("--expected-title")
    parser.add_argument("url")
    args = parser.parse_args()
    (ROOT / ".local").mkdir(exist_ok=True)
    local = Path(tempfile.mkdtemp(prefix="youtube-", dir=ROOT / ".local"))
    config = local / "config.json"
    ffmpeg = shutil.which("ffmpeg")
    if not ffmpeg:
        raise RuntimeError("ffmpeg is required")
    config.write_text(json.dumps({"extensionId": "a" * 32, "ffmpeg": str(Path(ffmpeg).resolve()), "stateDirectory": str(local / "state"), "attemptTimeout": 300}), encoding="utf-8")
    evidence = {"url": args.url, "isolatedState": str(local), "results": [], "checks": []}
    host = Host(config)
    try:
        hello = host.call("hello")
        assert "youtube" in hello["snapshot"]["providers"]
        host.call("configure", destination=str(local / "VideoDownload"))
        job_id = host.call("enqueue", url=args.url, quality="1080")["jobId"]
        job = host.wait(job_id, {"completed"})
        evidence["results"].append(job)
        assert job["state"] == "completed", job.get("error", job["state"])
        assert Path(job["path"]).is_file()
        if args.expected_title:
            assert Path(job["path"]).stem == args.expected_title, job["path"]
        assert not job["hasPartials"] and not job.get("errorCode"), job
        evidence["checks"].append("Framed native helper downloaded the owner-selected single video")
        if args.recovery:
            job_id = host.call("enqueue", url=args.url, quality="720")["jobId"]
            downloading = host.wait(job_id, {"downloading"})
            assert downloading["state"] == "downloading", "Transfer finished before recovery could be exercised"
            host.call("stop", jobId=job_id)
            stopped = host.wait(job_id, {"stopped"}, timeout=20)
            assert stopped["state"] == "stopped" and stopped["hasPartials"] and stopped["resumable"], stopped
            host.close(); host = Host(config); host.call("hello")
            host.call("resume", jobId=job_id)
            continued = host.wait(job_id, {"completed"})
            evidence["results"].append(continued)
            assert continued["state"] == "completed", continued.get("error")
            assert continued.get("resumedBytes", 0) > 0, "Continue must prove partial-byte reuse"
            assert not continued["hasPartials"] and not continued.get("errorCode"), continued
            evidence["checks"].append("Stop retained partials; Continue after helper restart reused bytes, completed and cleaned staging")
            job_id = host.call("enqueue", url=args.url, quality="720")["jobId"]
            downloading = host.wait(job_id, {"downloading"})
            assert downloading["state"] == "downloading"
            host.call("delete", jobId=job_id)
            cancelled = host.wait(job_id, {"cancelled"}, timeout=20)
            assert cancelled["state"] == "cancelled" and not cancelled["hasPartials"]
            assert not (local / "VideoDownload/.mediafetch-partials" / job_id).exists()
            assert all(Path(j["path"]).is_file() for j in evidence["results"])
            evidence["checks"].append("Stop and delete removed only the owned unfinished attempt")
    finally:
        host.close()
        (ROOT / "artifacts").mkdir(exist_ok=True)
        args.evidence.write_text(json.dumps(evidence, indent=2), encoding="utf-8")
        print(json.dumps(evidence, indent=2), flush=True)


if __name__ == "__main__":
    main()
