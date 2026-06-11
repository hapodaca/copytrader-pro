// Servidor estático mínimo para la landing page (puerto 8080)
// Sirve apps/web/public/index-landing.html y assets estáticos
const http = require('http')
const fs   = require('fs')
const path = require('path')

const PORT    = 8080
const PUBLIC  = path.join(__dirname, 'web/public')
const LANDING = path.join(PUBLIC, 'index-landing.html')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css':  'text/css',
  '.js':   'application/javascript',
  '.svg':  'image/svg+xml',
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.ico':  'image/x-icon',
  '.woff2':'font/woff2',
}

http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0]

  // Cualquier ruta desconocida → sirve la landing
  let filePath = path.join(PUBLIC, urlPath === '/' ? 'index-landing.html' : urlPath)

  // Evitar path traversal
  if (!filePath.startsWith(PUBLIC)) {
    res.writeHead(403); res.end('Forbidden'); return
  }

  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = LANDING
  }

  const ext  = path.extname(filePath)
  const mime = MIME[ext] || 'application/octet-stream'

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return }
    res.writeHead(200, { 'Content-Type': mime })
    res.end(data)
  })
}).listen(PORT, () => {
  console.log(`[landing] Servidor en http://localhost:${PORT}`)
})
