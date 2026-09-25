import argparse
import json
import os
import sys
from pathlib import Path
from . import PROTOCOL_VERSION
from .errors import MediaFetchError
from .protocol import Writer, read_message, validate
from .storage import Journal, local_state
from .jobs import Scheduler
from .windows import JobObject


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--config", type=Path, required=True)
    parser.add_argument("origin")
    parser.add_argument("--parent-window")
    args = parser.parse_args()
    if os.name != "nt":
        raise SystemExit("MediaFetch requires Windows.")
    import msvcrt
    msvcrt.setmode(sys.stdin.fileno(), os.O_BINARY)
    msvcrt.setmode(sys.stdout.fileno(), os.O_BINARY)
    writer = Writer(sys.stdout.buffer)
    journal = None
    scheduler = None
    request_id = None
    # Owning the host also contains children created immediately before per-job assignment.
    owner = JobObject(own_current=True)
    try:
        config = json.loads(args.config.read_text("utf-8-sig"))
        if args.origin != f"chrome-extension://{config['extensionId']}/":
            raise SystemExit("Unexpected extension origin.")
        journal = Journal(Path(config.get("stateDirectory") or local_state()))
        scheduler = Scheduler(journal, config, writer.send)
        while (message := read_message(sys.stdin.buffer)) is not None:
            request_id = message.get("id") if isinstance(message, dict) else None
            try:
                request = validate(message)
                action = request["action"]
                if action == "hello":
                    data = {"protocolVersion": PROTOCOL_VERSION, "snapshot": scheduler.snapshot()}
                elif action == "snapshot":
                    data = scheduler.snapshot()
                elif action == "enqueue":
                    data = scheduler.enqueue(request)
                elif action == "configure":
                    data = scheduler.configure(request["destination"])
                else:
                    data = scheduler.action(action, request)
                writer.send({"kind": "reply", "id": request_id, "ok": True, "data": data})
            except MediaFetchError as error:
                writer.send({"kind": "reply", "id": request_id, "ok": False, "error": str(error), "code": error.code})
            except (OSError, ValueError, KeyError, TypeError):
                writer.send({"kind": "reply", "id": request_id, "ok": False, "error": "The local request failed. Check the destination and helper installation.", "code": "LOCAL_ERROR"})
    except MediaFetchError as error:
        try:
            if request_id is None:
                first = read_message(sys.stdin.buffer)
                request_id = first.get("id") if isinstance(first, dict) else None
            writer.send({"kind": "reply", "id": request_id, "ok": False, "error": str(error), "code": error.code})
        except (OSError, EOFError, MediaFetchError):
            pass
    except (EOFError, BrokenPipeError, OSError, ValueError):
        # Never print raw exceptions, URLs, or stack traces to the native protocol stream.
        pass
    finally:
        if scheduler:
            scheduler.close()
        if journal:
            journal.close()
        # The outer kill-on-close handle is deliberately retained until process exit.
        # Closing it here would terminate this host before Python finished flushing.
