import ctypes
import json
import os
import re
import stat
import uuid
from contextlib import ExitStack, contextmanager
from pathlib import Path
from .errors import MediaFetchError
from .protocol import require_uuid
from .windows import locked_directory, delete_regular_file, rename_regular_file


def downloads_folder() -> Path:
    from ctypes import wintypes
    class GUID(ctypes.Structure):
        _fields_ = [("data", ctypes.c_byte * 16)]
    folder = GUID.from_buffer_copy(uuid.UUID("374de290-123f-4565-9164-39c4925e467b").bytes_le)
    value = wintypes.LPWSTR()
    shell = ctypes.WinDLL("shell32", use_last_error=True)
    shell.SHGetKnownFolderPath.argtypes = [ctypes.c_void_p, wintypes.DWORD, wintypes.HANDLE, ctypes.POINTER(wintypes.LPWSTR)]
    result = shell.SHGetKnownFolderPath(ctypes.byref(folder), 0, None, ctypes.byref(value))
    if result:
        raise OSError("Windows Downloads folder could not be located")
    try:
        return Path(value.value)
    finally:
        ole = ctypes.WinDLL("ole32")
        ole.CoTaskMemFree.argtypes = [ctypes.c_void_p]
        ole.CoTaskMemFree(ctypes.cast(value, ctypes.c_void_p))


def local_state() -> Path:
    return Path(os.environ["LOCALAPPDATA"]) / "MediaFetch" / "state"


def safe_root(raw: str | Path) -> Path:
    value = Path(raw)
    if not value.is_absolute() or str(value).startswith("\\\\") or any(p == ".." for p in value.parts) or len(str(value)) > 240:
        raise MediaFetchError("INVALID_DESTINATION", "Choose an absolute local folder path without parent traversal.")
    resolved = value.resolve()
    if resolved == Path(resolved.anchor):
        raise MediaFetchError("INVALID_DESTINATION", "Choose a folder rather than a drive root.")
    return resolved


def reject_reparse(path: Path):
    info = path.lstat()
    if info.st_file_attributes & stat.FILE_ATTRIBUTE_REPARSE_POINT:
        raise OSError("Refusing a reparse point in managed storage")


@contextmanager
def staging(root: Path, job_id: str, create=True):
    require_uuid(job_id)
    # Destinations are resolved when selected. Do not follow a replacement
    # junction at the stored root during later recovery or deletion.
    safe_root(root)
    root = Path(root)
    if create:
        root.mkdir(parents=True, exist_ok=True)
    with ExitStack() as stack:
        # Lock every existing ancestor to stop a directory rename from changing containment.
        for ancestor in reversed((root, *root.parents)):
            stack.enter_context(locked_directory(ancestor))
        partials = root / ".mediafetch-partials"
        if create:
            partials.mkdir(exist_ok=True)
        stack.enter_context(locked_directory(partials))
        job = partials / job_id
        if create:
            job.mkdir(exist_ok=True)
        stack.enter_context(locked_directory(job))
        yield job


def has_partials(root: str, job_id: str) -> bool:
    path = Path(root) / ".mediafetch-partials" / require_uuid(job_id)
    try:
        reject_reparse(path.parent)
        reject_reparse(path)
        return any(path.iterdir())
    except FileNotFoundError:
        return False
    except OSError:
        return True  # A cleanup problem must remain visible, not be silently forgotten.


def cleanup(root: str, job_id: str):
    path = Path(root) / ".mediafetch-partials" / require_uuid(job_id)
    if not path.exists() and not path.is_symlink():
        return
    with staging(Path(root), job_id, create=False) as directory:
        for child in directory.iterdir():
            if child.name == ".runtime-cache":
                cleanup_runtime_cache(child)
            else:
                delete_regular_file(child)
    # Never recurse. If a directory was swapped, rmdir cannot delete its contents.
    path.rmdir()


def cleanup_runtime_cache(directory: Path):
    """Remove only Deno's fixed analysis files and empty npm directory. Never recurse."""
    allowed = {name + suffix for name in ("dep_analysis_cache_v2", "node_analysis_cache_v2") for suffix in ("", "-shm", "-wal")}
    # The caller holds the job and all ancestor handles. This handle rejects
    # reparse points and prevents the cache directory being replaced mid-cleanup.
    with locked_directory(directory):
        children = list(directory.iterdir())
        if any(child.name not in allowed | {"npm"} for child in children):
            raise OSError("Unrecognized runtime cache contents were preserved")
        for child in children:
            if child.name == "npm":
                with locked_directory(child):
                    if any(child.iterdir()):
                        raise OSError("Unexpected npm cache contents were preserved")
                child.rmdir()  # Empty directory only, including if its name raced.
            else:
                delete_regular_file(child)
    directory.rmdir()


def safe_filename(title: str, provider: str, content_id: str, suffix: str) -> str:
    if suffix not in (".mp4", ".webm", ".mkv", ".mov", ".m4v"):
        raise MediaFetchError("INVALID_OUTPUT", "The extractor produced an unsupported file type.")
    clean = re.sub(r'[<>:"/\\|?*\x00-\x1f]', "_", title)
    clean = re.sub(r"\s+", " ", clean).replace("..", "_").strip(" .")[:95]
    return f"{provider}_{content_id}_{clean or 'video'}{suffix}"


def publish(source: Path, root: Path, name: str) -> Path:
    reject_reparse(source)
    if not source.is_file() or source.stat().st_nlink != 1 or source.stat().st_size <= 0:
        raise MediaFetchError("INVALID_OUTPUT", "The final video file is missing or invalid.")
    target = root / name
    for number in range(10000):
        candidate = target if number == 0 else target.with_name(f"{target.stem} ({number}){target.suffix}")
        try:
            rename_regular_file(source, candidate)
            return candidate
        except FileExistsError:
            continue
    raise MediaFetchError("FILENAME_CONFLICT", "Too many files share this name.")


class Journal:
    def __init__(self, state_dir: Path, default_destination: Path | None = None):
        import msvcrt
        state_dir.mkdir(parents=True, exist_ok=True)
        reject_reparse(state_dir)
        self.directory = state_dir
        self.lockfile = (state_dir / "host.lock").open("a+b")
        self.lockfile.seek(0)
        try:
            msvcrt.locking(self.lockfile.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError:
            self.lockfile.close()
            raise MediaFetchError("HELPER_BUSY", "MediaFetch is active in another browser profile. Close that profile's MediaFetch connection first.") from None
        if not self.lockfile.read(1):
            self.lockfile.write(b"0")
            self.lockfile.flush()
        self.path = state_dir / "jobs.json"
        self.data = {"revision": 0, "destination": str(default_destination or (downloads_folder() / "VideoDownload")), "jobs": []}
        if self.path.exists():
            reject_reparse(self.path)
            value = json.loads(self.path.read_text("utf-8"))
            if not isinstance(value, dict) or not isinstance(value.get("jobs"), list) or len(value["jobs"]) > 250:
                raise MediaFetchError("STATE_INVALID", "The saved download list needs repair. It has been preserved.")
            safe_root(value["destination"])
            for job in value["jobs"]:
                require_uuid(job["id"])
                require_uuid(job["attemptId"])
                safe_root(job["destination"])
            self.data = value

    def save(self):
        temp = self.path.with_suffix(".tmp")
        if temp.exists():
            reject_reparse(temp)
        with temp.open("w", encoding="utf-8", newline="\n") as output:
            json.dump(self.data, output, ensure_ascii=False, allow_nan=False)
            output.flush()
            os.fsync(output.fileno())
        os.replace(temp, self.path)

    def close(self):
        import msvcrt
        self.lockfile.seek(0)
        msvcrt.locking(self.lockfile.fileno(), msvcrt.LK_UNLCK, 1)
        self.lockfile.close()
