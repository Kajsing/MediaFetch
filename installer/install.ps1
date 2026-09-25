[CmdletBinding()]
param(
    [string]$PythonPath,
    [string]$FfmpegPath,
    [string]$ExtensionDirectory = (Join-Path $PSScriptRoot '..\extension\dist')
)
$ErrorActionPreference = 'Stop'
if ($env:OS -ne 'Windows_NT') { throw 'MediaFetch requires Windows.' }
$taskRepository = Split-Path -Parent $PSScriptRoot
$taskExtension = [IO.Path]::GetFullPath($ExtensionDirectory)
$taskManifestFile = Join-Path $taskExtension 'manifest.json'
if (-not (Test-Path -LiteralPath $taskManifestFile)) { throw 'Build the extension first with pnpm build.' }
$taskManifest = Get-Content -LiteralPath $taskManifestFile -Raw | ConvertFrom-Json
$taskHash = [Security.Cryptography.SHA256]::Create().ComputeHash([Convert]::FromBase64String($taskManifest.key))
$taskExtensionId = -join ($taskHash[0..15] | ForEach-Object { [char](97 + ($_ -shr 4)); [char](97 + ($_ -band 15)) })
if (-not $PythonPath) {
    $taskPy = Get-Command py -ErrorAction SilentlyContinue
    if ($taskPy) { $PythonPath = & $taskPy.Source -3.12 -c 'import sys; print(sys.executable)' }
    if (-not $PythonPath) { $PythonPath = (Get-Command python -ErrorAction Stop).Source }
}
$PythonPath = [IO.Path]::GetFullPath($PythonPath)
& $PythonPath -c 'import sys; assert sys.version_info >= (3, 12), "Python 3.12 or newer is required"'
if ($LASTEXITCODE -ne 0) { throw 'A working Python 3.12+ installation is required.' }
if (-not $FfmpegPath) { $FfmpegPath = (Get-Command ffmpeg -ErrorAction Stop).Source }
$FfmpegPath = (Resolve-Path -LiteralPath $FfmpegPath).Path
& $FfmpegPath -version | Select-Object -First 1
if ($LASTEXITCODE -ne 0) { throw 'ffmpeg could not run.' }
$taskInstallRoot = Join-Path $env:LOCALAPPDATA 'MediaFetch'
New-Item -ItemType Directory -Path $taskInstallRoot -Force | Out-Null
# Packaged terminals may virtualize LocalAppData. Register the physical path so
# an ordinary Chrome process outside that package can reach the same installation.
$taskInstallRoot = & $PythonPath -c 'import os,sys; print(os.path.realpath(sys.argv[1]))' $taskInstallRoot
if ($LASTEXITCODE -ne 0 -or -not [IO.Path]::IsPathRooted($taskInstallRoot)) { throw 'Could not resolve the physical install directory.' }
$taskApp = Join-Path $taskInstallRoot 'app'
$taskVenv = Join-Path $taskInstallRoot 'venv'
# Avoid replacing the helper while it owns a live journal.
$taskLockPath = Join-Path $taskInstallRoot 'state\host.lock'
if (Test-Path -LiteralPath $taskLockPath) {
    try { $taskLock = [IO.File]::Open($taskLockPath, 'Open', 'ReadWrite', 'None'); $taskLock.Dispose() }
    catch { throw 'The helper is active. Stop downloads and disable MediaFetch in Chrome before updating.' }
}
& $PythonPath -m venv $taskVenv
if ($LASTEXITCODE -ne 0) { throw 'Could not create the helper Python environment.' }
$taskPython = Join-Path $taskVenv 'Scripts\python.exe'
& $taskPython -m pip install --disable-pip-version-check -r (Join-Path $taskRepository 'native-host\requirements.txt')
if ($LASTEXITCODE -ne 0) { throw 'Could not install the pinned download dependency.' }
New-Item -ItemType Directory -Path $taskApp -Force | Out-Null
Copy-Item -LiteralPath (Join-Path $taskRepository 'native-host\host.py') -Destination $taskApp -Force
Copy-Item -LiteralPath (Join-Path $taskRepository 'native-host\src') -Destination $taskApp -Recurse -Force
$taskConfig = @{ extensionId = $taskExtensionId; ffmpeg = $FfmpegPath; stateDirectory = (Join-Path $taskInstallRoot 'state') }
$taskConfig | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $taskInstallRoot 'config.json') -Encoding UTF8
$taskLauncher = '@echo off' + "`r`n" + '@"%~dp0venv\Scripts\python.exe" -I "%~dp0app\host.py" --config "%~dp0config.json" %*' + "`r`n"
[IO.File]::WriteAllText((Join-Path $taskInstallRoot 'mediafetch-host.cmd'), $taskLauncher, [Text.Encoding]::ASCII)
$taskHost = @{ name = 'dk.kajsing.mediafetch'; description = 'MediaFetch local download helper'; path = (Join-Path $taskInstallRoot 'mediafetch-host.cmd'); type = 'stdio'; allowed_origins = @("chrome-extension://$taskExtensionId/") }
$taskHostFile = Join-Path $taskInstallRoot 'native-host.json'
$taskHost | ConvertTo-Json | Set-Content -LiteralPath $taskHostFile -Encoding UTF8
& $taskPython (Join-Path $PSScriptRoot 'verify-host.py') --python $taskPython --host (Join-Path $taskApp 'host.py') --config (Join-Path $taskInstallRoot 'config.json') --extension-id $taskExtensionId
if ($LASTEXITCODE -ne 0) { throw 'The native helper handshake failed. Chrome registration was not changed.' }
$taskRegistry = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\dk.kajsing.mediafetch'
New-Item -Path $taskRegistry -Force | Out-Null
Set-Item -LiteralPath $taskRegistry -Value $taskHostFile
Write-Output "MediaFetch helper installed for $taskExtensionId"
Write-Output "In chrome://extensions, enable Developer mode and Load unpacked: $taskExtension"
