[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$taskRegistry = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\dk.kajsing.mediafetch'
if (Test-Path -LiteralPath $taskRegistry) {
    $taskRegistered = (Get-Item -LiteralPath $taskRegistry).GetValue('')
    if (-not (Test-Path -LiteralPath $taskRegistered)) { throw 'The registered host manifest is missing; inspect registration before removing it.' }
    $taskManifest = Get-Content -LiteralPath $taskRegistered -Raw | ConvertFrom-Json
    if ($taskManifest.name -ne 'dk.kajsing.mediafetch' -or (Split-Path -Leaf (Split-Path -Parent $taskRegistered)) -ne 'MediaFetch') { throw 'The registered host belongs to another installation; it was preserved.' }
    Remove-Item -LiteralPath $taskRegistry
}
Write-Output 'MediaFetch native integration is unregistered. Remove the extension in chrome://extensions.'
Write-Output 'Videos, partial files, job history, and the helper installation are preserved. You may reinstall to recover unfinished work.'
