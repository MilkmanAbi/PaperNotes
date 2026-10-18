@echo off
rem Builds PaperNotes for Windows.
rem   build.bat        the web app, the MCP server, PaperNotes.exe, stage\ and the installer
rem   build.bat exe    PaperNotes.exe only
rem   build.bat stage  everything except the installer
rem
rem Needs: Visual Studio 2022 or later with "Desktop development with C++",
rem Node.js 20+, and Inno Setup 6 for the installer. The WebView2 SDK is
rem fetched into third_party\ the first time (tools\get-webview2.ps1).
rem
rem stage\ is what the installer ships. No notes: PaperNotes opens a study
rem folder the user chooses on first run.
rem   PaperNotes.exe
rem   app\            the web app (Vite's dist\ without content\ and db\)
rem   mcp\server.mjs  the PaperNotes tools for Claude Code (one bundled file)
setlocal
cd /d "%~dp0"

rem -- the C++ compiler, wherever Visual Studio is ----------------------
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
set "VSDIR="
if exist "%VSWHERE%" for /f "usebackq delims=" %%i in (`"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath`) do set "VSDIR=%%i"
if not defined VSDIR (echo Visual Studio with the C++ tools was not found. & exit /b 1)
call "%VSDIR%\VC\Auxiliary\Build\vcvars64.bat" >nul || exit /b 1

set WV2=third_party\webview2\build\native
if not exist %WV2%\include\WebView2.h (
  powershell -NoProfile -ExecutionPolicy Bypass -File tools\get-webview2.ps1 || exit /b 1
)

rc /nologo papernotes.rc || exit /b 1
cl /nologo /utf-8 /O2 /MT /EHsc /std:c++17 /W3 /DUNICODE /D_UNICODE /I%WV2%\include ^
   papernotes.cpp papernotes.res /Fe:PaperNotes.exe ^
   /link /SUBSYSTEM:WINDOWS /OPT:REF /OPT:ICF /MANIFEST:NO /LIBPATH:%WV2%\x64 || exit /b 1
del /q *.obj papernotes.res 2>nul
if /i "%1"=="exe" exit /b 0

rem -- the web app and the MCP server -----------------------------------
pushd ..
call npm run build || (popd & exit /b 1)
node desktop\mcp\build.mjs || (popd & exit /b 1)
popd

rem -- stage ------------------------------------------------------------
if exist stage rmdir /s /q stage
mkdir stage
copy /y PaperNotes.exe stage\ >nul || exit /b 1
robocopy ..\dist stage\app /e /xd content db /njh /njs /nfl /ndl >nul
if errorlevel 8 exit /b 1
rem Relax mode's video, if you've put one in relax\ (it isn't in the repo).
if exist relax (
  robocopy relax stage\app\relax /e /njh /njs /nfl /ndl >nul
  if errorlevel 8 exit /b 1
)
mkdir stage\mcp
copy /y mcp\server.mjs stage\mcp\ >nul || exit /b 1
copy /y ..\LICENSE.md stage\ >nul || exit /b 1
if /i "%1"=="stage" exit /b 0

rem -- installer --------------------------------------------------------
set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (echo Inno Setup 6 was not found. & exit /b 1)
"%ISCC%" /Q setup.iss || exit /b 1
echo built dist\PaperNotes-Setup.exe
