#define AppName "Sonatina"
#define AppVersion "0.1.0"

[Setup]
AppId={{AA275FDA-0AE8-4555-A483-4F86EBE96570}
AppName={#AppName}
AppVersion={#AppVersion}
DefaultDirName={localappdata}\Programs\{#AppName}
DefaultGroupName={#AppName}
UninstallDisplayIcon={app}\Sonatina.exe
OutputDir=..\..\release
OutputBaseFilename=Sonatina-Setup
PrivilegesRequired=lowest
ArchitecturesInstallIn64BitMode=x64
Compression=lzma2
SolidCompression=yes
WizardStyle=modern

[Files]
Source: "..\..\dist\Sonatina\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\Sonatina.exe"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\Sonatina.exe"; Tasks: desktopicon

[Tasks]
Name: "desktopicon"; Description: "Create a &desktop shortcut"; GroupDescription: "Additional icons:"

[Run]
Filename: "{app}\Sonatina.exe"; Description: "Launch {#AppName}"; Flags: postinstall nowait skipifsilent
