# Runs the Zotero integration tests in the isolated scaffold profile and makes
# sure the test instance (and only it) is stopped afterwards.
$root = Split-Path $PSScriptRoot -Parent
Set-Location $root
if (-not $env:ZOTERO_PLUGIN_ZOTERO_BIN_PATH) {
  $env:ZOTERO_PLUGIN_ZOTERO_BIN_PATH = Join-Path $env:LOCALAPPDATA "Zotero\zotero.exe"
}
$env:ZOTERO_PLUGIN_KILL_COMMAND = "powershell -NoProfile -File `"$PSScriptRoot\kill-test-zotero.ps1`""
try {
  npm test
  $code = $LASTEXITCODE
}
finally {
  & "$PSScriptRoot\kill-test-zotero.ps1"
}
exit $code
