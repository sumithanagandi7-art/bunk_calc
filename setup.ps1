#!/usr/bin/env pwsh
# Bunk Calculator — Local Dev Setup Script (SQLite Version)
# Run from D:\BunkCalculator\: .\setup.ps1

Write-Host "`n🎓 Bunk Calculator — Setup" -ForegroundColor Cyan
Write-Host "=================================`n"

# Check Node
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js not found. Install from https://nodejs.org" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Node $(node -v) found"

# ── Backend setup ──────────────────────────────────────────────────────────────
Write-Host "`n📦 Setting up backend..." -ForegroundColor Yellow

Set-Location backend

if (-not (Test-Path .env)) {
    Copy-Item .env.example .env
    Write-Host "📝 Created backend/.env from example"
}

# The backend .env should now be using SQLite
$envFile = Get-Content .env
$envFile = $envFile -replace 'DATABASE_URL="postgresql://.*"', 'DATABASE_URL="file:./dev.db"'
Set-Content .env $envFile

Write-Host "Installing backend dependencies..."
npm install --silent

Write-Host "Generating Prisma client..."
npx prisma generate

Write-Host "Syncing SQLite database schema..."
npx prisma db push

Write-Host "Seeding database..."
npm run db:seed

Set-Location ..

# ── Frontend setup ─────────────────────────────────────────────────────────────
Write-Host "`n🎨 Setting up frontend..." -ForegroundColor Yellow
Set-Location frontend

Write-Host "Installing frontend dependencies..."
npm install --silent

Set-Location ..

# ── Done ───────────────────────────────────────────────────────────────────────
Write-Host "`n✅ Setup complete!" -ForegroundColor Green
Write-Host "`nTo start development:`n"
Write-Host "  1. Open a terminal and run the backend:"
Write-Host "     cd backend && npm run dev" -ForegroundColor Cyan
Write-Host "  2. Open a second terminal and run the frontend:"
Write-Host "     cd frontend && npm run dev" -ForegroundColor Cyan
Write-Host "`nThe app will be available at http://localhost:3000`n"
