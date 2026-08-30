$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$ProjectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $ProjectRoot

if (-not (Get-Command py -ErrorAction SilentlyContinue)) {
    throw "Python is not installed. Install Python 3.12 and enable Add Python to PATH."
}

if (-not (Test-Path ".venv\Scripts\python.exe")) {
    Write-Host "Creating the Native Factory Python environment..." -ForegroundColor Cyan
    py -3.12 -m venv .venv
}

& ".venv\Scripts\python.exe" -m pip install --upgrade pip
& ".venv\Scripts\python.exe" -m pip install -e .

Write-Host "Opening Native Factory Studio..." -ForegroundColor Green
& ".venv\Scripts\python.exe" -m native_factory.cli studio
