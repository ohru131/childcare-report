# PowerShell script to start the Childcare Report App

$ErrorActionPreference = "Stop"

# Always run from this script's directory to avoid path parsing issues
# with parentheses or non-ASCII folder names.
if ($PSScriptRoot) {
    Set-Location -LiteralPath $PSScriptRoot
}

function Resolve-EmulatorPortConflict {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    $listeners = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $listeners) {
        return
    }

    $pids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($targetPid in $pids) {
        if ($targetPid -eq $PID) {
            continue
        }

        $proc = Get-Process -Id $targetPid -ErrorAction SilentlyContinue
        if (-not $proc) {
            continue
        }

        $procName = $proc.ProcessName
        if ($procName -in @("java", "node")) {
            Write-Host "⚠️  Port $Port is already used by $procName (PID=$targetPid). Stopping it for emulator startup..." -ForegroundColor Yellow
            Stop-Process -Id $targetPid -Force -ErrorAction SilentlyContinue
        } else {
            throw "Port $Port is already in use by '$procName' (PID=$targetPid). Please stop it and retry."
        }
    }
}

function Ensure-ViteGeminiKey {
    $envPath = Join-Path (Get-Location) ".env"
    if (-not (Test-Path $envPath)) {
        return
    }

    $content = Get-Content -Path $envPath -Raw
    if ($content -match "(?m)^\s*VITE_GEMINI_API_KEY\s*=") {
        return
    }

    if ($content -match "(?m)^\s*GEMINI_API_KEY\s*=\s*(.+)$") {
        $legacyValue = $Matches[1].Trim()
        Add-Content -Path $envPath -Value "`r`nVITE_GEMINI_API_KEY=$legacyValue"
        Write-Host "ℹ️  Added VITE_GEMINI_API_KEY from legacy GEMINI_API_KEY in .env" -ForegroundColor Cyan
    } else {
        Write-Host "⚠️  VITE_GEMINI_API_KEY is missing in .env" -ForegroundColor Yellow
    }
}

function Remove-StaleFirebaseHubFile {
    param(
        [Parameter(Mandatory = $true)]
        [string]$ProjectId
    )

    $hubPath = Join-Path $env:TEMP ("hub-" + $ProjectId + ".json")
    if (-not (Test-Path $hubPath)) {
        return
    }

    try {
        # Do not delete hub file for a currently running emulator process.
        $hubRaw = Get-Content -LiteralPath $hubPath -Raw -ErrorAction SilentlyContinue
        if ($hubRaw) {
            $hubJson = $hubRaw | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($hubJson -and $hubJson.pid) {
                $running = Get-Process -Id ([int]$hubJson.pid) -ErrorAction SilentlyContinue
                if ($running) {
                    Write-Host "ℹ️  Hub file is active (Project=$ProjectId, PID=$($hubJson.pid)). Skip deleting." -ForegroundColor Cyan
                    return
                }
            }
        }

        Remove-Item -Path $hubPath -Force
        Write-Host "🧹 Removed stale emulator hub file: $hubPath" -ForegroundColor Cyan
    } catch {
        Write-Host "⚠️  Failed to remove stale hub file: $hubPath" -ForegroundColor Yellow
    }
}

function Test-EmulatorRunning {
    param(
        [Parameter(Mandatory = $true)]
        [int]$Port
    )

    $listeners = Get-NetTCPConnection -LocalAddress "127.0.0.1" -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    return $null -ne $listeners
}

function Get-ProjectId {
    $configPath = Join-Path (Get-Location) "firebase-applet-config.json"
    if (-not (Test-Path $configPath)) {
        return "demo-childcare"
    }

    try {
        $raw = Get-Content -LiteralPath $configPath -Raw
        $config = $raw | ConvertFrom-Json
        if ($config -and $config.projectId) {
            return [string]$config.projectId
        }
    } catch {
        Write-Host "⚠️  Failed to parse firebase-applet-config.json. Falling back to demo-childcare." -ForegroundColor Yellow
    }

    return "demo-childcare"
}

function Set-LocalBypassProxy {
    $bypassHosts = "127.0.0.1,localhost,::1"
    $env:NO_PROXY = $bypassHosts
    $env:no_proxy = $bypassHosts
}

function Save-EmulatorData {
    param(
        [Parameter(Mandatory = $true)]
        [string]$WorkspacePath
    )

    $saveScript = Join-Path $WorkspacePath "save-emulator-data.ps1"
    if (-not (Test-Path -LiteralPath $saveScript)) {
        Write-Host "⚠️  save-emulator-data.ps1 not found. Skipping auto-save." -ForegroundColor Yellow
        return
    }

    try {
        Write-Host "💾 Auto-saving emulator data..." -ForegroundColor Cyan
        & $saveScript
    } catch {
        Write-Host "⚠️  Auto-save failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# 1. Check for .env file
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  .env file not found!" -ForegroundColor Yellow
    if (Test-Path ".env.example") {
        Write-Host "📋 Creating .env from .env.example..." -ForegroundColor Cyan
        Copy-Item ".env.example" ".env"
        Write-Host "❗ Please edit the '.env' file in the root directory and set your VITE_GEMINI_API_KEY." -ForegroundColor Yellow
    } else {
        Write-Host "❌ Please create a .env file and set VITE_GEMINI_API_KEY." -ForegroundColor Red
    }
}

Ensure-ViteGeminiKey
Set-LocalBypassProxy

# 2. Check for node_modules
if (-not (Test-Path "node_modules")) {
    Write-Host "📦 node_modules not found. Installing dependencies..." -ForegroundColor Cyan
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Failed to install dependencies. Please run 'npm install' manually." -ForegroundColor Red
        Read-Host "Press Enter to exit..."
        exit 1
    }
}

# 2.5 Resolve emulator port conflicts from stale processes
Resolve-EmulatorPortConflict -Port 8080
Resolve-EmulatorPortConflict -Port 9099
Resolve-EmulatorPortConflict -Port 4000
Resolve-EmulatorPortConflict -Port 4400
Resolve-EmulatorPortConflict -Port 4500

$projectId = Get-ProjectId
Remove-StaleFirebaseHubFile -ProjectId $projectId
# Legacy cleanup in case previous runs used a different hardcoded project id
Remove-StaleFirebaseHubFile -ProjectId "demo-childcare"

$workspacePath = (Get-Location).Path
$emulatorDataDir = ".emulator-data"
$emulatorDataPath = Join-Path $workspacePath $emulatorDataDir
if (-not (Test-Path -LiteralPath $emulatorDataPath)) {
    New-Item -ItemType Directory -Path $emulatorDataPath | Out-Null
}

# 3. Open browser after starting the server
# Run a background job to wait 4 seconds (allowing emulator startup time) and open the app and emulator UI in the default browser.
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 4
    Start-Process "http://localhost:3000"
    Start-Process "http://localhost:4000/firestore"
} | Out-Null

# 4. Start emulator in a separate terminal.
# NOTE: On some Windows environments --export-on-exit can fail with a hub status check timeout.
# We keep import here and provide an explicit save script for reliable persistence.
$emulatorCommandTemplate = @'
$env:HTTP_PROXY = ''
$env:HTTPS_PROXY = ''
$env:ALL_PROXY = ''
$env:http_proxy = ''
$env:https_proxy = ''
$env:all_proxy = ''
$env:NO_PROXY = '127.0.0.1,localhost,::1'
$env:no_proxy = '127.0.0.1,localhost,::1'
npx firebase emulators:start --project="{0}" --only auth,firestore --import="{1}"
'@
$emulatorCommand = [string]::Format($emulatorCommandTemplate, $projectId, $emulatorDataDir)
$shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell" }

Write-Host "🚀 Starting Firebase Emulator Suite in a separate terminal..." -ForegroundColor Green
Write-Host "ℹ️  projectId: $projectId" -ForegroundColor Cyan
Write-Host "ℹ️  emulator data: $emulatorDataPath" -ForegroundColor Cyan

if ((Test-EmulatorRunning -Port 8080) -or (Test-EmulatorRunning -Port 9099)) {
    Write-Host "ℹ️  Emulator appears to be already running. Skip starting a second instance." -ForegroundColor Yellow
} else {
    $emulatorShellProcess = Start-Process -FilePath $shell -WorkingDirectory $workspacePath -ArgumentList "-NoExit", "-Command", $emulatorCommand -PassThru
}

# 5. Start Vite in current terminal
Write-Host "🚀 Starting Vite development server in this terminal..." -ForegroundColor Green
Write-Host "このターミナルで npm run dev を終了した際は、自動で保存を実行します（EPERM表示でも Export completed が出れば保存済み）。" -ForegroundColor Yellow

try {
    npm run dev
} finally {
    Save-EmulatorData -WorkspacePath $workspacePath
    if ($emulatorShellProcess -and -not $emulatorShellProcess.HasExited) {
        Write-Host "ℹ️  Emulator terminal is still running. 必要に応じてそちらを終了してください。" -ForegroundColor Cyan
    }
}
