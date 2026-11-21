$ErrorActionPreference = "Stop"

$RepositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $RepositoryRoot

python -m pip install ".[packaging]"
if ($LASTEXITCODE -ne 0) {
    throw "Installing Python packaging dependencies failed."
}

npm ci --prefix frontend
if ($LASTEXITCODE -ne 0) {
    throw "Installing frontend dependencies failed."
}

npm run build --prefix frontend
if ($LASTEXITCODE -ne 0) {
    throw "Building the frontend failed."
}

python -m PyInstaller --clean --noconfirm packaging/windows/sonatina.spec
if ($LASTEXITCODE -ne 0) {
    throw "Building the Sonatina application failed."
}

$InnoSetupCommand = Get-Command "ISCC.exe" -ErrorAction SilentlyContinue
if ($InnoSetupCommand) {
    $InnoSetupPath = $InnoSetupCommand.Source
} else {
    $InnoSetupPath = Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"
    if (-not (Test-Path $InnoSetupPath)) {
        throw "Inno Setup 6 was not found. Install it and ensure ISCC.exe is on PATH."
    }
}

& $InnoSetupPath packaging/windows/Sonatina.iss
if ($LASTEXITCODE -ne 0) {
    throw "Creating the Sonatina installer failed."
}

Write-Host "Installer created at $RepositoryRoot\release\Sonatina-Setup.exe"
