"""Entry point used by the per-user launcher and isolated worker processes."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent / "src"))
if __name__ == "__main__":
    if "--worker" in sys.argv:
        from mediafetch_host.worker import main
    else:
        from mediafetch_host.main import main
    main()
