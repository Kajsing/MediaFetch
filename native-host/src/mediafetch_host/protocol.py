import json
import struct
import threading
import uuid
from .errors import MediaFetchError

MAX_FRAME = 256 * 1024
ACTIONS = {"hello", "snapshot", "enqueue", "stop", "delete", "retry", "resume", "forget", "configure"}
FIELDS = {
    "hello": set(), "snapshot": set(),
    "enqueue": {"url", "quality", "mediaIndex"},
    "configure": {"destination"},
    **{name: {"jobId"} for name in ("stop", "delete", "resume", "forget")},
    "retry": {"jobId", "mediaIndex"},
}


def require_uuid(value: object) -> str:
    try:
        parsed = uuid.UUID(str(value))
        if parsed.version != 4 or str(parsed) != value:
            raise ValueError()
        return str(parsed)
    except (ValueError, AttributeError):
        raise MediaFetchError("INVALID_REQUEST", "Invalid download or request ID.") from None


def validate(message: object) -> dict:
    if not isinstance(message, dict) or message.get("v") != 1 or type(message.get("v")) is not int:
        raise MediaFetchError("PROTOCOL_MISMATCH", "Update the extension and helper together.")
    require_uuid(message.get("id"))
    action = message.get("action")
    if not isinstance(action, str) or action not in ACTIONS or set(message) - {"v", "id", "action"} - FIELDS[action]:
        raise MediaFetchError("INVALID_REQUEST", "Unsupported request or options.")
    if action in {"stop", "delete", "retry", "resume", "forget"}:
        require_uuid(message.get("jobId"))
    if action == "enqueue" and message.get("quality") not in ("best", "1080", "720"):
        raise MediaFetchError("INVALID_REQUEST", "Choose a supported quality.")
    index = message.get("mediaIndex")
    if index is not None and (type(index) is not int or not 1 <= index <= 16):
        raise MediaFetchError("INVALID_REQUEST", "Choose a valid video number.")
    if action == "configure" and (not isinstance(message.get("destination"), str) or len(message["destination"]) > 240):
        raise MediaFetchError("INVALID_REQUEST", "Enter a local download folder.")
    return message


def read_exact(stream, size: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < size:
        chunk = stream.read(size - len(chunks))
        if not chunk:
            raise EOFError("Truncated native frame")
        chunks.extend(chunk)
    return bytes(chunks)


def read_message(stream):
    first = stream.read(1)
    if not first:
        return None
    size = struct.unpack("<I", first + read_exact(stream, 3))[0]
    if not 0 < size <= MAX_FRAME:
        raise MediaFetchError("INVALID_REQUEST", "Invalid native message size.")
    try:
        return json.loads(read_exact(stream, size).decode("utf-8"))
    except (ValueError, UnicodeError):
        raise MediaFetchError("INVALID_REQUEST", "Invalid native JSON message.") from None


class Writer:
    def __init__(self, stream):
        self.stream = stream
        self.lock = threading.Lock()

    def send(self, value: dict):
        payload = json.dumps(value, ensure_ascii=False, separators=(",", ":"), allow_nan=False).encode("utf-8")
        if len(payload) > 1024 * 1024:
            raise ValueError("Native output exceeds Chrome limit")
        with self.lock:
            self.stream.write(struct.pack("<I", len(payload)) + payload)
            self.stream.flush()
