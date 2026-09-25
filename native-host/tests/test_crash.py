import ctypes
import json
import os
import queue
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import uuid
from ctypes import wintypes
from pathlib import Path
from mediafetch_host.protocol import Writer, read_message


@unittest.skipUnless(os.name == "nt", "Windows process ownership")
class CrashTests(unittest.TestCase):
    def test_killing_host_terminates_owned_worker_and_grandchild(self):
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            extension_id = 'a' * 32
            config = root / 'config.json'
            config.write_text(json.dumps({"extensionId": extension_id, "ffmpeg": str(Path(__file__).resolve()), "stateDirectory": str(root / 'state')}))
            host = subprocess.Popen([sys.executable, '-I', str(Path(__file__).with_name('host_fixture.py')), '--config', str(config), f'chrome-extension://{extension_id}/'], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, creationflags=subprocess.CREATE_NO_WINDOW)
            messages = queue.Queue()
            def read():
                try:
                    while (message := read_message(host.stdout)) is not None:
                        messages.put(message)
                except (OSError, EOFError):
                    pass
            reader = threading.Thread(target=read, daemon=True)
            reader.start()
            writer = Writer(host.stdin)
            def call(action, **fields):
                request_id = str(uuid.uuid4())
                writer.send({"v": 1, "id": request_id, "action": action, **fields})
                deadline = time.monotonic() + 10
                while time.monotonic() < deadline:
                    message = messages.get(timeout=10)
                    if message.get('id') == request_id:
                        self.assertTrue(message['ok'], message)
                        return message['data']
                self.fail('Native request did not reply')
            handle = None
            kernel = ctypes.WinDLL('kernel32', use_last_error=True)
            kernel.OpenProcess.argtypes = [wintypes.DWORD, wintypes.BOOL, wintypes.DWORD]
            kernel.OpenProcess.restype = wintypes.HANDLE
            kernel.WaitForSingleObject.argtypes = [wintypes.HANDLE, wintypes.DWORD]
            kernel.CloseHandle.argtypes = [wintypes.HANDLE]
            try:
                call('hello')
                call('configure', destination=str(root / 'videos'))
                job = call('enqueue', url='https://x.com/fixture/status/102', quality='1080')['jobId']
                pid_file = root / 'videos' / '.mediafetch-partials' / job / 'child.pid'
                deadline = time.monotonic() + 8
                while not pid_file.exists() and time.monotonic() < deadline:
                    time.sleep(.03)
                self.assertTrue(pid_file.exists())
                pid = int(pid_file.read_text())
                handle = kernel.OpenProcess(0x100000, False, pid)
                self.assertTrue(handle)
                self.assertEqual(kernel.WaitForSingleObject(handle, 0), 258)
                host.kill()
                host.wait(timeout=5)
                self.assertEqual(kernel.WaitForSingleObject(handle, 5000), 0, 'Owned child survived a host crash')
                state = json.loads((root / 'state/jobs.json').read_text())
                self.assertEqual(state['jobs'][0]['id'], job)
            finally:
                if host.poll() is None:
                    host.kill()
                    host.wait(timeout=5)
                if handle:
                    kernel.CloseHandle(handle)
                host.stdin.close()
                reader.join(timeout=5)
                host.stdout.close()
