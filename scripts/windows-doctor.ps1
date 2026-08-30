$ErrorActionPreference = "Stop"

$required = @(
    @{ Name = "Git"; Command = "git" },
    @{ Name = "GitHub CLI"; Command = "gh" },
    @{ Name = "Python launcher"; Command = "py" }
)

$recommended = @(
    @{ Name = "Node.js"; Command = "node" },
    @{ Name = "npm"; Command = "npm" },
    @{ Name = "Bun"; Command = "bun" }
)

$failed = $false

Write-Host "Native App Factory - Windows check" -ForegroundColor Cyan
Write-Host ""

foreach ($tool in $required) {
    $found = Get-Command $tool.Command -ErrorAction SilentlyContinue
    if ($found) {
        Write-Host "PASS  $($tool.Name): $($found.Source)" -ForegroundColor Green
    } else {
        Write-Host "FAIL  $($tool.Name): not installed or not on PATH" -ForegroundColor Red
        $failed = $true
    }
}

foreach ($tool in $recommended) {
    $found = Get-Command $tool.Command -ErrorAction SilentlyContinue
    if ($found) {
        Write-Host "PASS  $($tool.Name): $($found.Source)" -ForegroundColor Green
    } else {
        Write-Host "WARN  $($tool.Name): install if required by the Lovable repo" -ForegroundColor Yellow
    }
}

if (Get-Command py -ErrorAction SilentlyContinue) {
    try {
        $version = & py -3.12 --version 2>&1
        Write-Host "PASS  Python 3.12: $version" -ForegroundColor Green
    } catch {
        Write-Host "FAIL  Python 3.12 is not available through py" -ForegroundColor Red
        $failed = $true
    }
}

Write-Host ""
Write-Host "INFO  iOS builds will run on GitHub-hosted macOS; Xcode is not needed here."
Write-Host "INFO  Android Studio is optional for local Android emulation and key creation."

if ($failed) {
    exit 1
}

Write-Host ""
Write-Host "Windows prerequisites passed." -ForegroundColor Green
