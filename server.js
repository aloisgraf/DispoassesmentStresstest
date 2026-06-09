#!/usr/bin/env node
/**
 * Simple HTTP Server für ELS Simulator
 * Serves static files from ./rettungsleitstelle
 * Compatible with Render.com
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const PORT = process.env.PORT || 3000;
const BASE_DIR = path.join(__dirname, 'rettungsleitstelle');

// MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

const server = http.createServer((req, res) => {
  const parsedUrl = url.parse(req.url, true);
  let pathname = decodeURI(parsedUrl.pathname);

  // Remove leading slash
  if (pathname.startsWith('/')) {
    pathname = pathname.slice(1);
  }

  // API Endpoints
  if (pathname === 'api/config') {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      hasApiKey: !!apiKey,
      apiKey: apiKey || null
    }));
    return;
  }

  // Default to index.html for root
  if (pathname === '' || pathname === '/') {
    pathname = 'index.html';
  }

  // Build file path
  let filePath = path.join(BASE_DIR, pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(BASE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  // Try to read the file
  fs.readFile(filePath, (err, data) => {
    if (err) {
      // If file not found and it's not index.html, try index.html
      if (err.code === 'ENOENT' && pathname !== 'index.html') {
        fs.readFile(path.join(BASE_DIR, 'index.html'), (fallbackErr, fallbackData) => {
          if (fallbackErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found\n');
            console.error(`[404] ${req.method} ${req.url}`);
            return;
          }

          res.writeHead(200, {
            'Content-Type': getMimeType('index.html'),
            'Cache-Control': 'public, max-age=0, must-revalidate'
          });
          res.end(fallbackData);
          console.log(`[200] ${req.method} ${req.url} (served as index.html)`);
        });
        return;
      }

      // Other errors
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error\n');
      console.error(`[500] ${req.method} ${req.url}:`, err.message);
      return;
    }

    // File found
    const mimeType = getMimeType(filePath);
    // Never cache HTML, CSS, or JS in development mode
    const cacheControl = (pathname.endsWith('.html') || pathname.endsWith('.css') || pathname.endsWith('.js'))
      ? 'public, max-age=0, must-revalidate'  // Don't cache HTML/CSS/JS
      : 'public, max-age=86400';               // Cache static assets (images, fonts) for 24h

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': cacheControl,
      'Access-Control-Allow-Origin': '*',
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
    console.log(`[200] ${req.method} ${req.url}`);
  });
});

server.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════════════════════╗
║  🚨 RK Salzburg – Leitstellen Simulator                   ║
║                                                           ║
║  🌐 Server läuft auf http://localhost:${PORT}
║  📍 Dateien: ./rettungsleitstelle/                       ║
║                                                           ║
║  Login:                                                   ║
║  • Disponent: PIN 1234                                   ║
║  • Prüfer: PIN 9999                                      ║
║                                                           ║
║  Strg+C zum Beenden                                      ║
╚═══════════════════════════════════════════════════════════╝
  `);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Server wird beendet...');
  server.close(() => {
    console.log('Server gestoppt.');
    process.exit(0);
  });
});
