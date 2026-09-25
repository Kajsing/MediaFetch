$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$taskPython = Join-Path $taskRoot 'native-host\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $taskPython)) { throw 'Create native-host/.venv and install native-host/requirements.txt first.' }
$taskPreviousPath = $env:PYTHONPATH
try {
    $env:PYTHONPATH = Join-Path $taskRoot 'native-host\src'
    & $taskPython -m unittest discover -s (Join-Path $taskRoot 'native-host\tests') -v
    if ($LASTEXITCODE -ne 0) { throw 'Native tests failed.' }
} finally { $env:PYTHONPATH = $taskPreviousPath }
