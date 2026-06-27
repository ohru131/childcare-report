# PowerShell script to start the Childcare Report App

$ErrorActionPreference = "Stop"

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
    foreach ($pid in $pids) {
        if ($pid -eq $PID) {
            continue
        }

        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        if (-not $proc) {
            continue
        }

        $procName = $proc.ProcessName
        if ($procName -in @("java", "node")) {
            Write-Host "⚠️  Port $Port is already used by $procName (PID=$pid). Stopping it for emulator startup..." -ForegroundColor Yellow
            Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
        } else {
            throw "Port $Port is already in use by '$procName' (PID=$pid). Please stop it and retry."
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

# 3. Open browser after starting the server
# Run a background job to wait 4 seconds (allowing emulator startup time) and open the app and emulator UI in the default browser.
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 4
    Start-Process "http://localhost:3000"
    Start-Process "http://localhost:4000/firestore"
} | Out-Null

# 4. Start emulator in a separate terminal for safer data export on shutdown
$emulatorCommand = "npx firebase emulators:start --project=demo-childcare --only auth,firestore --import=.emulator-data --export-on-exit=.emulator-data"
$shell = if (Get-Command pwsh -ErrorAction SilentlyContinue) { "pwsh" } else { "powershell" }

Write-Host "🚀 Starting Firebase Emulator Suite in a separate terminal..." -ForegroundColor Green
Start-Process -FilePath $shell -ArgumentList "-NoExit", "-Command", $emulatorCommand | Out-Null

# 5. Start Vite in current terminal
Write-Host "🚀 Starting Vite development server in this terminal..." -ForegroundColor Green
Write-Host "終了時は、先にエミュレータ側ターミナルで Ctrl+C を押してデータを保存してください。" -ForegroundColor Yellow
npm run dev
