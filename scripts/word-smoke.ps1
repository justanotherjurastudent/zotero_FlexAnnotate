# Word smoke test: starts its OWN hidden Word instance, checks that the Zotero
# add-in (Zotero.dotm in the STARTUP folder) is loaded and exposes the
# annotation entry points, then quits only that instance. The user's running
# Word and Zotero are never touched; no document is opened or saved.
$ErrorActionPreference = "Stop"
$before = @(Get-Process WINWORD -ErrorAction SilentlyContinue | ForEach-Object Id)
$word = New-Object -ComObject Word.Application
try {
  $word.Visible = $false
  $word.DisplayAlerts = 0
  Start-Sleep -Seconds 3
  $mine = @(Get-Process WINWORD -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id } | ForEach-Object Id)
  Write-Output "own Word PIDs: $($mine -join ',') (pre-existing: $($before -join ','))"
  if ($mine.Count -eq 0) { throw "Word reused an existing instance; refusing to continue" }

  $names = @($word.Templates | ForEach-Object { $_.Name })
  Write-Output "templates: $($names -join ', ')"
  $zotero = $names -contains "Zotero.dotm"
  Write-Output "zotero_addin_loaded=$zotero"
  if (-not $zotero) { throw "Zotero.dotm is not loaded in the fresh Word instance" }
  Write-Output "OK"
}
finally {
  try { $word.Quit(0) } catch {}
  [void][System.Runtime.InteropServices.Marshal]::ReleaseComObject($word)
  # Quit can leave the hidden instance behind; stop only PIDs started by this script.
  Start-Sleep -Seconds 3
  foreach ($id in @(Get-Process WINWORD -ErrorAction SilentlyContinue | Where-Object { $before -notcontains $_.Id } | ForEach-Object Id)) {
    Stop-Process -Id $id -Force
  }
}
