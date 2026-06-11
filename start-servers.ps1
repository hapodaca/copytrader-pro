# CopyTrader Pro — Arranque automático
# Este script lo ejecuta el Task Scheduler al iniciar Windows

Set-Location 'C:\ClaudeCodeProject\copytrader_pro'

# ── 1. Redis ──────────────────────────────────────────────────────────────────
$redisRunning = & 'C:\ClaudeCodeProject\redis5\redis-cli.exe' -p 6380 ping 2>$null
if ($redisRunning -ne 'PONG') {
    Start-Process 'C:\ClaudeCodeProject\redis5\redis-server.exe' `
        -ArgumentList '--port 6380' -WindowStyle Hidden
    Start-Sleep -Seconds 2
    Write-Host "[1/4] Redis iniciado en puerto 6380" -ForegroundColor Green
} else {
    Write-Host "[1/4] Redis ya estaba corriendo" -ForegroundColor DarkGray
}

# ── 2. Cloudflare Tunnel ──────────────────────────────────────────────────────
$cfExe   = "$env:LOCALAPPDATA\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
$cfLog   = 'C:\ClaudeCodeProject\copytrader_pro\cloudflare-tunnel.log'
$envFile = 'C:\ClaudeCodeProject\copytrader_pro\.env'

if (Test-Path $cfExe) {
    # Matar instancia previa si existe
    Get-Process cloudflared -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1

    # Limpiar log anterior
    if (Test-Path $cfLog) { Remove-Item $cfLog -Force }

    # Iniciar cloudflared redirigiendo stderr (donde imprime la URL) a un archivo de log
    Start-Process -FilePath $cfExe `
        -ArgumentList "tunnel", "--url", "http://localhost:3001", "--logfile", $cfLog `
        -WindowStyle Hidden

    # Esperar hasta 25s a que aparezca la URL (trycloudflare.com)
    $newUrl = $null
    for ($i = 0; $i -lt 25; $i++) {
        Start-Sleep -Seconds 1
        if (Test-Path $cfLog) {
            $content = Get-Content $cfLog -Raw -ErrorAction SilentlyContinue
            if ($content -match 'https://[a-z0-9\-]+\.trycloudflare\.com') {
                $newUrl = $matches[0]
                break
            }
        }
    }

    if ($newUrl) {
        # Actualizar VITE_WEBHOOK_PUBLIC_URL en .env
        (Get-Content $envFile) `
            -replace 'VITE_WEBHOOK_PUBLIC_URL=.*', "VITE_WEBHOOK_PUBLIC_URL=$newUrl" `
            | Set-Content $envFile

        Write-Host "[2/4] Tunnel activo: $newUrl" -ForegroundColor Cyan
        Write-Host "      ⚠  Actualiza la alerta en TradingView si cambió la URL" -ForegroundColor Yellow
    } else {
        Write-Host "[2/4] ⚠  Cloudflare Tunnel no pudo arrancar (sin URL)" -ForegroundColor Yellow
    }
} else {
    Write-Host "[2/4] cloudflared no encontrado, saltando túnel" -ForegroundColor DarkGray
}

# ── 3. PM2 — API + Web ────────────────────────────────────────────────────────
Write-Host "[3/4] Iniciando PM2..." -ForegroundColor White
& npm exec -g pm2 -- delete copytrader-api copytrader-web 2>$null
& npm exec -g pm2 -- start ecosystem.config.cjs --update-env
& npm exec -g pm2 -- save

# ── 4. Estado ─────────────────────────────────────────────────────────────────
Write-Host "[4/4] Estado de procesos:" -ForegroundColor White
& npm exec -g pm2 -- status

# Mostrar URL del webhook al final para que sea fácil copiar
if ($newUrl) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor DarkCyan
    Write-Host "  WEBHOOK URL PARA TRADINGVIEW (actualiza si cambió):  " -ForegroundColor Cyan
    Write-Host "  $newUrl/api/webhook/<tu-token>  " -ForegroundColor White
    Write-Host "═══════════════════════════════════════════════════════" -ForegroundColor DarkCyan
}
