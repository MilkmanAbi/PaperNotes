; PaperNotes installer (Inno Setup 6). Per-user, no admin: installs to %LOCALAPPDATA%\Programs\PaperNotes.
;
; The program only. Your notes live in the study folder you choose when PaperNotes first starts, and
; everything PaperNotes remembers about them (tags, done, reminders, stickies, backups) lives inside that
; folder, in .papernotes. Upgrading or uninstalling never touches either.
#define AppVer "2.5.1"

[Setup]
AppId={{9E5C2B71-4F3A-4D8E-B1C6-2A7F0D9E3B54}
AppName=PaperNotes
AppVersion={#AppVer}
AppVerName=PaperNotes {#AppVer}
AppPublisher=Abinaash
DefaultDirName={localappdata}\Programs\PaperNotes
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableReadyPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0.17763
OutputDir=dist
OutputBaseFilename=PaperNotes-Setup-{#AppVer}
SetupIconFile=papernotes.ico
UninstallDisplayIcon={app}\PaperNotes.exe
UninstallDisplayName=PaperNotes
LicenseFile=..\LICENSE.md
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
CloseApplications=no
RestartApplications=no
VersionInfoVersion={#AppVer}
VersionInfoDescription=PaperNotes setup

[Tasks]
Name: "desktopicon"; Description: "Put a PaperNotes shortcut on the desktop"; Flags: unchecked
Name: "startup"; Description: "Start PaperNotes when I sign in (for reminders)"; Flags: unchecked

[Files]
Source: "stage\PaperNotes.exe"; DestDir: "{app}"; Flags: ignoreversion
Source: "stage\app\*"; DestDir: "{app}\app"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "stage\mcp\*"; DestDir: "{app}\mcp"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "stage\LICENSE.md"; DestDir: "{app}"; Flags: ignoreversion

[InstallDelete]
; the program is replaced as a whole on upgrade; 1.x shipped a notes pack that is no longer used
Type: filesandordirs; Name: "{app}\app"
Type: filesandordirs; Name: "{app}\mcp"
Type: files; Name: "{app}\notes.pack"

[Icons]
Name: "{userprograms}\PaperNotes"; Filename: "{app}\PaperNotes.exe"; Comment: "Your notes, past papers and school material, with the tools to study them"
Name: "{userdesktop}\PaperNotes"; Filename: "{app}\PaperNotes.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "PaperNotes"; ValueData: """{app}\PaperNotes.exe"" /login"; Tasks: startup; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "PaperNotes"; Flags: dontcreatekey uninsdeletevalue
Root: HKCU; Subkey: "Software\PaperNotes"; Flags: uninsdeletekey

[Run]
Filename: "{app}\PaperNotes.exe"; Description: "Open PaperNotes"; Flags: postinstall nowait skipifsilent
; A one-click update from inside the app runs silently with /RELAUNCH=1: open it again afterwards.
Filename: "{app}\PaperNotes.exe"; Flags: nowait; Check: Relaunch

[UninstallDelete]
; the app's own caches (WebView2 profile, text cache); your notes are not here
Type: filesandordirs; Name: "{localappdata}\PaperNotes"
Type: dirifempty; Name: "{app}"

[Code]
// A running copy holds its files open: ask it to quit (it offers to save
// unsaved edits first) and wait for it.
function CloseRunning(): Boolean;
var
  I: Integer;
  W: HWND;
begin
  Result := True;
  W := FindWindowByClassName('PaperNotesWindow');
  if W = 0 then Exit;
  // WM_APP_QUIT (0x8004): quit for real. WM_CLOSE alone would only hide it
  // when "keep running in the notification area" is on.
  PostMessage(W, $8004, 0, 0);
  for I := 1 to 150 do begin
    Sleep(100);
    if FindWindowByClassName('PaperNotesWindow') = 0 then Break;
  end;
  if FindWindowByClassName('PaperNotesWindow') <> 0 then begin
    MsgBox('Please quit PaperNotes first (right-click its icon in the notification area, then Quit), then click OK.', mbInformation, MB_OK);
    Result := FindWindowByClassName('PaperNotesWindow') = 0;
  end;
  Sleep(500);
end;

function Relaunch(): Boolean;
begin
  Result := ExpandConstant('{param:RELAUNCH|0}') = '1';
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  if not CloseRunning() then Result := 'PaperNotes is still running.';
end;

function InitializeUninstall(): Boolean;
begin
  Result := CloseRunning();
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if (CurUninstallStep = usPostUninstall) and not UninstallSilent() then
    MsgBox('PaperNotes is uninstalled. Your study folder and everything in it are untouched.', mbInformation, MB_OK);
end;
