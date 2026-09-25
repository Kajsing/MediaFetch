"""Deterministic local worker used only by scheduler integration tests."""
import json
import subprocess
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from mediafetch_host.worker import emit

spec = json.loads(sys.stdin.buffer.readline())
folder = Path(spec["staging"])
content_id = spec["url"].split("/")[-1]
title = 'Fixture æøå わたし 🎬' if content_id == '107' else f'Fixture {content_id}'

if content_id == "103":
    emit({"type": "error", "code": "CONTENT_UNAVAILABLE", "message": "Test source is unavailable."})
    raise SystemExit(1)
fingerprint = {"id": content_id, "formats": [{"id": "test", "ext": "mp4"}]}
if spec.get("resumeData") and spec["resumeData"] != fingerprint:
    emit({"type": "error", "code": "RESUME_UNAVAILABLE", "message": "The source format changed. Choose Retry."})
    raise SystemExit(1)
emit({"type": "identity", "title": title, "data": fingerprint})
partial = folder / "media.mp4.part"
with partial.open("ab") as output:
    output.write(b"fixture data")
emit({"type": "progress", "bytes": partial.stat().st_size, "progress": 25})
if content_id in ("102", "104", "106"):
    child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(90)"], creationflags=subprocess.CREATE_NO_WINDOW)
    (folder / "child.pid").write_text(str(child.pid))
    if content_id == "104":
        emit({"type": "merging"})
    time.sleep(30)
else:
    time.sleep(0.15)
partial.rename(folder / "media.mp4")
emit({"type": "complete", "filename": "media.mp4", "title": title})
