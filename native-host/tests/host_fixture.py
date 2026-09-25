"""Real host lifecycle with a local fake worker; this file is never installed."""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from mediafetch_host import main as host
from mediafetch_host.jobs import Scheduler


class FixtureScheduler(Scheduler):
    def __init__(self, journal, config, emit):
        super().__init__(journal, config, emit, Path(__file__).with_name("fake_worker.py"))


host.Scheduler = FixtureScheduler
host.main()
