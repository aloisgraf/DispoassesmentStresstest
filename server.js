#!/usr/bin/env node
/**
 * HTTP Server für ELS Simulator
 * - Statische Dateien aus ./rettungsleitstelle
 * - GET  /api/config → meldet nur, OB ein Server-API-Key existiert (der Key selbst verlässt den Server nie)
 * - POST /api/funk   → Proxy zur Anthropic API; der Key bleibt serverseitig (Render env var ANTHROPIC_API_KEY)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk').default;

const PORT = process.env.PORT || 3000;
const BASE_DIR = path.join(__dirname, 'rettungsleitstelle');

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;

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

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}

function handleFunkProxy(req, res) {
  let body = '';
  req.on('data', chunk => {
    body += chunk;
    if (body.length > 100000) req.destroy();
  });
  req.on('end', async () => {
    if (!anthropic) {
      sendJson(res, 503, { error: 'Kein ANTHROPIC_API_KEY am Server konfiguriert' });
      return;
    }
    try {
      const { system, prompt } = JSON.parse(body || '{}');
      if (!prompt) {
        sendJson(res, 400, { error: 'prompt fehlt' });
        return;
      }
      const msg = await anthropic.messages.create({
        model: 'claude-opus-4-8',
        max_tokens: 300,
        system: typeof system === 'string' ? system.slice(0, 8000) : undefined,
        messages: [{ role: 'user', content: String(prompt).slice(0, 4000) }]
      });
      const text = msg.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join(' ')
        .trim();
      sendJson(res, 200, { text });
    } catch (e) {
      console.error('[api/funk] Fehler:', e.message);
      sendJson(res, 502, { error: 'KI-Anfrage fehlgeschlagen' });
    }
  });
}

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURI(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  if (pathname.startsWith('/')) {
    pathname = pathname.slice(1);
  }

  // ---- API-Endpunkte ----
  if (pathname === 'api/config') {
    sendJson(res, 200, { hasApiKey: !!anthropic });
    return;
  }
  if (pathname === 'api/funk' && req.method === 'POST') {
    handleFunkProxy(req, res);
    return;
  }

  // ---- Statische Dateien ----
  if (pathname === '' || pathname === '/') {
    pathname = 'index.html';
  }

  let filePath = path.join(BASE_DIR, pathname);

  // Security: prevent directory traversal
  if (!filePath.startsWith(BASE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (err, data) => {
    if (err) {
      if (err.code === 'ENOENT' && pathname !== 'index.html') {
        fs.readFile(path.join(BASE_DIR, 'index.html'), (fallbackErr, fallbackData) => {
          if (fallbackErr) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found\n');
            return;
          }
          res.writeHead(200, {
            'Content-Type': getMimeType('index.html'),
            'Cache-Control': 'public, max-age=0, must-revalidate'
          });
          res.end(fallbackData);
        });
        return;
      }
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('500 Internal Server Error\n');
      console.error(`[500] ${req.method} ${req.url}:`, err.message);
      return;
    }

    const mimeType = getMimeType(filePath);
    const cacheControl = (pathname.endsWith('.html') || pathname.endsWith('.css') || pathname.endsWith('.js'))
      ? 'public, max-age=0, must-revalidate'
      : 'public, max-age=86400';

    res.writeHead(200, {
      'Content-Type': mimeType,
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`ELS Simulator läuft auf Port ${PORT}`);
  console.log(`KI-Funk (Anthropic): ${anthropic ? 'aktiv (Server-Key gesetzt)' : 'INAKTIV – ANTHROPIC_API_KEY fehlt'}`);
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

process.on('SIGTERM', () => {
  server.close(() => process.exit(0));
});
