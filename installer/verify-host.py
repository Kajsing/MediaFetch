"""Exercise the real framed hello protocol without changing browser registration."""
import argparse
import json
import struct
import subprocess
import uuid

parser = argparse.ArgumentParser()
for name in ("python", "host", "config", "extension-id"):
    parser.add_argument(f"--{name}", required=True)
args = parser.parse_args()
request = {"v": 1, "id": str(uuid.uuid4()), "action": "hello"}
payload = json.dumps(request).encode()
result = subprocess.run([args.python, "-I", args.host, "--config", args.config, f"chrome-extension://{args.extension_id}/"], input=struct.pack("<I", len(payload)) + payload, capture_output=True, timeout=15, creationflags=subprocess.CREATE_NO_WINDOW)
if len(result.stdout) < 4:
    raise SystemExit("Helper produced no framed reply. Check the Python installation and local state lock.")
size = struct.unpack("<I", result.stdout[:4])[0]
reply = json.loads(result.stdout[4:4+size])
assert reply["ok"] and reply["id"] == request["id"], "Handshake was rejected"
assert reply["data"]["protocolVersion"] == 1, "Protocol version mismatch"
snapshot = reply["data"]["snapshot"]
assert snapshot["ffmpeg"] and snapshot["ytDlpVersion"], "A download dependency is missing"
print(f"Handshake passed: helper {snapshot['helperVersion']}, yt-dlp {snapshot['ytDlpVersion']}, ffmpeg ready.")
