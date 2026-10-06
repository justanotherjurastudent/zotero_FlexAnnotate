# Stops ONLY Zotero processes started with the Annotree test profile
# (.scaffold\test\profile). The user's own Zotero is never touched.
# Used as ZOTERO_PLUGIN_KILL_COMMAND for `npm run test:zotero`.
$marker = Join-Path $PSScriptRoot "..\.scaffold\test"
$marker = [System.IO.Path]::GetFullPath($marker)
Get-CimInstance Win32_Process -Filter "Name='zotero.exe'" |
  Where-Object { $_.CommandLine -and $_.CommandLine.Contains($marker) } |
  ForEach-Object { taskkill /PID $_.ProcessId /T /F | Out-Null }
exit 0
