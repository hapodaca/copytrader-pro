/**
 * start-vite.cjs — wrapper que libera el puerto 3000 antes de arrancar Vite
 * Evita el crash loop de PM2 por socket zombie en Windows
 */
const { execSync, spawn } = require('child_process')
const path = require('path')

// Mata cualquier proceso que tenga puerto 3000 en LISTEN
try {
  const ps = execSync(
    'powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"',
    { encoding: 'utf8', stdio: ['pipe','pipe','ignore'] }
  ).trim()
  if (ps && /^\d+$/.test(ps)) {
    console.log(`[start-vite] Killing zombie PID ${ps} on port 3000...`)
    execSync(`powershell -NoProfile -Command "Stop-Process -Id ${ps} -Force -ErrorAction SilentlyContinue"`, { stdio: 'ignore' })
    // Espera un momento para que el puerto quede libre
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 1500)
  }
} catch (_) { /* no zombie, todo bien */ }

// Arranca Vite normalmente
const vite = path.join(__dirname, '../../node_modules/vite/bin/vite.js')
const child = spawn(process.execPath, [vite], {
  stdio: 'inherit',
  cwd: __dirname,
})

child.on('exit', code => process.exit(code ?? 0))
process.on('SIGTERM', () => child.kill('SIGTERM'))
process.on('SIGINT',  () => child.kill('SIGINT'))
