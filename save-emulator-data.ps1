$ErrorActionPreference = "Stop"

if ($PSScriptRoot) {
    Set-Location -LiteralPath $PSScriptRoot
}

$bypassHosts = "127.0.0.1,localhost,::1"
$env:NO_PROXY = $bypassHosts
$env:no_proxy = $bypassHosts

function Get-ProjectId {
    $configPath = Join-Path (Get-Location) "firebase-applet-config.json"
    if (-not (Test-Path -LiteralPath $configPath)) {
        return "demo-childcare"
    }

    try {
        $raw = Get-Content -LiteralPath $configPath -Raw
        $config = $raw | ConvertFrom-Json
        if ($config -and $config.projectId) {
            return [string]$config.projectId
        }
    } catch {
        Write-Host "Failed to parse firebase-applet-config.json. Fallback to demo-childcare." -ForegroundColor Yellow
    }

    return "demo-childcare"
}

$projectId = Get-ProjectId
$workspacePath = (Get-Location).Path
$exportDir = Join-Path $workspacePath ".emulator-data"
$stagingDir = Join-Path $env:TEMP ("emulator-data-staging-" + [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())

Write-Host "Exporting emulator data..." -ForegroundColor Cyan
Write-Host "projectId: $projectId" -ForegroundColor Cyan
Write-Host "target: $exportDir" -ForegroundColor Cyan
Write-Host "staging: $stagingDir" -ForegroundColor Cyan

function Replace-Directory {
    param(
        [Parameter(Mandatory = $true)]
        [string]$SourcePath,
        [Parameter(Mandatory = $true)]
        [string]$DestinationPath
    )

    if (Test-Path -LiteralPath $DestinationPath) {
        Remove-Item -LiteralPath $DestinationPath -Recurse -Force -ErrorAction SilentlyContinue
    }

    try {
        Move-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
    } catch {
        # EPERM対策: renameが失敗した場合はコピーで確実に置換
        if (-not (Test-Path -LiteralPath $DestinationPath)) {
            New-Item -ItemType Directory -Path $DestinationPath | Out-Null
        }
        Copy-Item -LiteralPath (Join-Path $SourcePath "*") -Destination $DestinationPath -Recurse -Force
        Remove-Item -LiteralPath $SourcePath -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# Proxy経由で localhost:4400 (emulator hub) へ行ってしまう環境向けに、
# export中だけ proxy 変数を退避して無効化する。
$proxyVars = @("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "http_proxy", "https_proxy", "all_proxy")
$proxyBackup = @{}
foreach ($name in $proxyVars) {
    $proxyBackup[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    [Environment]::SetEnvironmentVariable($name, $null, "Process")
}

try {
    npx firebase emulators:export $stagingDir --project=$projectId
    if ($LASTEXITCODE -ne 0) {
        # Fallback: firebase-tools may leave a complete firebase-export-* directory
        # even when final move reports failure.
        $fallback = Get-ChildItem -LiteralPath . -Directory -Filter "firebase-export-*" -ErrorAction SilentlyContinue |
            Sort-Object LastWriteTime -Descending |
            Where-Object {
                (Test-Path -LiteralPath (Join-Path $_.FullName "firebase-export-metadata.json")) -and
                (Test-Path -LiteralPath (Join-Path $_.FullName "firestore_export"))
            } |
            Select-Object -First 1

        if ($fallback) {
            Write-Host "⚠️  Export command reported failure, but recoverable export folder found: $($fallback.Name)" -ForegroundColor Yellow

            Replace-Directory -SourcePath $fallback.FullName -DestinationPath $exportDir
            Write-Host "Recovered export data from fallback folder." -ForegroundColor Green
        } else {
            throw "Failed to export emulator data."
        }
    } else {
        Replace-Directory -SourcePath $stagingDir -DestinationPath $exportDir
    }
} finally {
    foreach ($name in $proxyVars) {
        [Environment]::SetEnvironmentVariable($name, $proxyBackup[$name], "Process")
    }
}

Write-Host "Export completed." -ForegroundColor Green
