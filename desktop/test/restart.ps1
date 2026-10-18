# Quit the running test app (politely, through the page), rebuild PaperNotes.exe, start it again
# with the DevTools port open for cdp.mjs.   restart.ps1 [-NoBuild] [-Web]
param([switch]$NoBuild, [switch]$Web)
$here = Split-Path $PSScriptRoot
$cdp = Join-Path $PSScriptRoot 'cdp.mjs'
if (Get-Process PaperNotes -ErrorAction SilentlyContinue) {
  node $cdp "chrome.webview.postMessage('1' + String.fromCharCode(31) + 'quit')" | Out-Null
  for ($i = 0; $i -lt 50 -and (Get-Process PaperNotes -ErrorAction SilentlyContinue); $i++) { Start-Sleep -Milliseconds 100 }
}
if ($Web) {
  Push-Location (Split-Path $here); npm run build *> $null; Pop-Location
  if (Test-Path "$here\app") { Remove-Item -Recurse -Force "$here\app" }
  robocopy (Join-Path (Split-Path $here) 'dist') "$here\app" /e /xd content db /njh /njs /nfl /ndl | Out-Null
  robocopy "$here\relax" "$here\app\relax" /e /njh /njs /nfl /ndl | Out-Null
}
if (-not $NoBuild) {
  $out = cmd /c "`"$here\build.bat`" exe" 2>&1 | Where-Object { $_ -match 'error|warning C' }
  if ($out) { $out; exit 1 }
}
$env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = '--remote-debugging-port=9333'
Start-Process "$here\PaperNotes.exe" -ArgumentList '/dev'
Start-Sleep 5
'started'
