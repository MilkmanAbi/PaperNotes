# Fetches the WebView2 SDK (headers and loader) into desktop\third_party\webview2.
# build.bat runs this the first time; it's a NuGet package, unzipped.
#   powershell -File desktop\tools\get-webview2.ps1 [-Version 1.0.4258.31]
param([string]$Version = '1.0.4258.31')
$ErrorActionPreference = 'Stop'
$dest = Join-Path (Split-Path $PSScriptRoot) 'third_party\webview2'
$zip = Join-Path ([IO.Path]::GetTempPath()) "webview2-$Version.zip"
$url = "https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/$Version"
Write-Host "Downloading the WebView2 SDK $Version"
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
$tmp = Join-Path ([IO.Path]::GetTempPath()) "webview2-$Version"
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
Expand-Archive -Path $zip -DestinationPath $tmp
New-Item -ItemType Directory -Force (Join-Path $dest 'build\native\x64') | Out-Null
Copy-Item -Recurse -Force (Join-Path $tmp 'build\native\include') (Join-Path $dest 'build\native')
Copy-Item -Force (Join-Path $tmp 'build\native\x64\*') (Join-Path $dest 'build\native\x64')
Copy-Item -Force (Join-Path $tmp 'LICENSE.txt') $dest
Remove-Item -Recurse -Force $tmp, $zip
Write-Host "WebView2 SDK in $dest"
