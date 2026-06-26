# PowerShell script to start the Childcare Report App

$ErrorActionPreference = "Stop"

# 1. Check for .env file
if (-not (Test-Path ".env")) {
    Write-Host "⚠️  .env file not found!" -ForegroundColor Yellow
    if (Test-Path ".env.example") {
        Write-Host "📋 Creating .env from .env.example..." -ForegroundColor Cyan
        Copy-Item ".env.example" ".env"
        Write-Host "❗ Please edit the '.env' file in the root directory and set your GEMINI_API_KEY." -ForegroundColor Yellow
    } else {
        Write-Host "❌ Please create a .env file and set GEMINI_API_KEY." -ForegroundColor Red
    }
}

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

# 3. Open browser after starting the server
# Run a background job to wait 4 seconds (allowing emulator startup time) and open the app and emulator UI in the default browser.
Start-Job -ScriptBlock {
    Start-Sleep -Seconds 4
    Start-Process "http://localhost:3000"
    Start-Process "http://localhost:4000"
} | Out-Null

# 4. Start the application
Write-Host "🚀 Starting the Firebase Emulator Suite and Vite development server..." -ForegroundColor Green
Write-Host "Press Ctrl+C in this terminal to stop the server." -ForegroundColor Gray
npx firebase emulators:exec --only auth,firestore "npm run dev"
