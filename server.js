#!/usr/bin/env node
/**
 * HTTP Server für LeitTrain – RK Salzburg Leitstellen-Simulator
 *
 * - Statische Dateien aus ./rettungsleitstelle
 * - GET  /api/config              → meldet nur, OB ein Server-API-Key existiert
 * - POST /api/leittrain/notruf    → Modus 1/3: Anrufer:in am Notruf
 * - POST /api/leittrain/funk      → Modus 2/3: Einsatzkraft im Funkverkehr
 * - POST /api/leittrain/debriefing→ Modus 5: strukturierte Auswertung (JSON)
 * - POST /api/leittrain/szenario  → Modus 6: Szenario-Generator (JSON)
 *
 * Der ANTHROPIC_API_KEY liegt als Environment-Variable auf dem Server
 * und wird niemals an den Browser ausgeliefert.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const P = require('./leittrain-prompts');

const PORT = process.env.PORT || 3000;
const BASE_DIR = path.join(__dirname, 'rettungsleitstelle');
const MODELL = process.env.LEITTRAIN_MODELL || 'claude-opus-4-8';

// Das SDK wird bewusst weich eingebunden: fehlt es oder fehlt der Key,
// läuft der Simulator ohne KI weiter statt gar nicht zu starten.
let anthropic = null;
let kiFehler = null;
if (!process.env.ANTHROPIC_API_KEY) {
  kiFehler = 'ANTHROPIC_API_KEY ist nicht gesetzt';
} else {
  try {
    const Anthropic = require('@anthropic-ai/sdk').default;
    anthropic = new Anthropic();
  } catch (e) {
    kiFehler = 'Anthropic-SDK nicht installiert (npm install ausführen)';
    console.error('LeitTrain-KI deaktiviert:', e.message);
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2'
};

function getMimeType(filename) {
  return MIME_TYPES[path.extname(filename).toLowerCase()] || 'application/octet-stream';
}

function sendJson(res, status, obj) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(obj));
}

// Request-Body einlesen (max. 512 KB – Gesprächsverläufe können lang werden)
function leseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 512000) {
        reject(new Error('Body zu groß'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Ungültiges JSON'));
      }
    });
    req.on('error', reject);
  });
}

function textAus(message) {
  return (message.content || [])
    .filter(b => b.type === 'text')
    .map(b => b.text)
    .join(' ')
    .trim();
}

// Gesprächsverlauf vom Client in Messages-Format bringen.
// Der Client schickt [{rolle:'disponent'|'anrufer', text:'...'}]
function verlaufZuMessages(verlauf, maxTurns = 40) {
  const gekuerzt = Array.isArray(verlauf) ? verlauf.slice(-maxTurns) : [];
  const messages = gekuerzt.map(t => ({
    role: t.rolle === 'anrufer' || t.rolle === 'assistant' ? 'assistant' : 'user',
    content: String(t.text || '').slice(0, 4000)
  }));
  // Die API verlangt einen User-Turn am Anfang
  while (messages.length && messages[0].role === 'assistant') messages.shift();
  return messages;
}

// ---- ENDPUNKT: Anrufer:in am Notruf ----
async function handleNotruf(req, res) {
  const body = await leseBody(req);
  const messages = verlaufZuMessages(body.verlauf);

  if (messages.length === 0) {
    // Gesprächseröffnung: der Trainee hebt ab, die anrufende Person beginnt.
    messages.push({
      role: 'user',
      content: '[Die Leitstelle hat abgehoben und meldet sich. Beginne das Gespräch als anrufende Person.]'
    });
  }

  const msg = await anthropic.messages.create({
    model: MODELL,
    max_tokens: 400,
    system: P.promptNotruf({
      szenario: body.szenario || {},
      anruferProfil: body.anruferProfil || {},
      schwierigkeit: body.schwierigkeit,
      modus: body.modus || 'Notrufannahme',
      pruefungsmodus: !!body.pruefungsmodus
    }),
    messages
  });

  sendJson(res, 200, { text: textAus(msg), modell: msg.model });
}

// ---- ENDPUNKT: Einsatzkraft im Funk ----
async function handleFunk(req, res) {
  const body = await leseBody(req);
  const messages = verlaufZuMessages(body.verlauf, 20);

  if (messages.length === 0) {
    messages.push({ role: 'user', content: String(body.prompt || 'Leitstelle ruft.').slice(0, 4000) });
  }

  const msg = await anthropic.messages.create({
    model: MODELL,
    max_tokens: 300,
    system: P.promptFunk({
      sender: body.sender,
      lage: body.lage || {},
      einsatz: body.einsatz || null,
      pruefungsmodus: !!body.pruefungsmodus
    }),
    messages
  });

  sendJson(res, 200, { text: textAus(msg) });
}

// ---- ENDPUNKT: Debriefing (strukturiertes JSON) ----
async function handleDebriefing(req, res) {
  const body = await leseBody(req);

  const msg = await anthropic.messages.create({
    model: MODELL,
    max_tokens: 4000,
    system: P.promptDebriefing({
      pruefungsmodus: !!body.pruefungsmodus,
      abfrageschema: body.abfrageschema || []
    }),
    output_config: {
      format: { type: 'json_schema', schema: P.DEBRIEFING_SCHEMA }
    },
    messages: [{
      role: 'user',
      content: `Werte die folgende Trainingseinheit aus.\n\n` +
        `## Szenario\n${JSON.stringify(body.szenario || {}, null, 2)}\n\n` +
        `## Notrufgespräch\n${(body.notrufVerlauf || [])
          .map(t => `${t.rolle === 'anrufer' ? 'ANRUFER' : 'DISPONENT'}: ${t.text}`)
          .join('\n') || '(kein Notrufgespräch geführt)'}\n\n` +
        `## Funkverkehr\n${(body.funkVerlauf || [])
          .map(t => `${t.sender}: ${t.text}`).join('\n') || '(kein Funkverkehr)'}\n\n` +
        `## Einsätze und Disposition\n${JSON.stringify(body.einsaetze || [], null, 2)}\n\n` +
        `## Gemessene Kennzahlen\n${JSON.stringify(body.metriken || {}, null, 2)}\n\n` +
        `## Protokoll\n${(body.protokoll || []).map(e => `${e.ts} [${e.typ}] ${e.text}`).join('\n')}`
    }]
  });

  const text = textAus(msg);
  try {
    sendJson(res, 200, { debriefing: JSON.parse(text) });
  } catch (e) {
    sendJson(res, 502, { error: 'Auswertung nicht lesbar', roh: text.slice(0, 2000) });
  }
}

// ---- ENDPUNKT: Szenario-Generator ----
async function handleSzenario(req, res) {
  const body = await leseBody(req);

  const msg = await anthropic.messages.create({
    model: MODELL,
    max_tokens: 3000,
    system: P.promptSzenario({
      einsatzmittel: body.einsatzmittel || [],
      schwierigkeit: body.schwierigkeit,
      lernziel: body.lernziel,
      kategorie: body.kategorie
    }),
    output_config: {
      format: { type: 'json_schema', schema: P.SZENARIO_SCHEMA }
    },
    messages: [{
      role: 'user',
      content: body.wunsch
        ? `Erzeuge ein Szenario mit folgender Vorgabe: ${String(body.wunsch).slice(0, 2000)}`
        : 'Erzeuge ein passendes Trainingsszenario.'
    }]
  });

  const text = textAus(msg);
  try {
    sendJson(res, 200, { szenario: JSON.parse(text) });
  } catch (e) {
    sendJson(res, 502, { error: 'Szenario nicht lesbar', roh: text.slice(0, 2000) });
  }
}

const ROUTEN = {
  'api/leittrain/notruf': handleNotruf,
  'api/leittrain/funk': handleFunk,
  'api/leittrain/debriefing': handleDebriefing,
  'api/leittrain/szenario': handleSzenario
};

const server = http.createServer(async (req, res) => {
  let pathname;
  try {
    pathname = decodeURI(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request');
    return;
  }

  if (pathname.startsWith('/')) pathname = pathname.slice(1);

  // ---- Konfiguration (nie den Key selbst) ----
  if (pathname === 'api/config') {
    sendJson(res, 200, {
      hasApiKey: !!anthropic,
      modell: anthropic ? MODELL : null,
      grund: anthropic ? null : kiFehler
    });
    return;
  }

  // ---- LeitTrain-KI-Endpunkte ----
  const handler = ROUTEN[pathname];
  if (handler) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Nur POST' });
      return;
    }
    if (!anthropic) {
      sendJson(res, 503, { error: 'LeitTrain-KI nicht verfügbar: ' + kiFehler });
      return;
    }
    try {
      await handler(req, res);
    } catch (e) {
      console.error(`[${pathname}] Fehler:`, e.message);
      if (!res.headersSent) sendJson(res, 502, { error: 'KI-Anfrage fehlgeschlagen: ' + e.message });
    }
    return;
  }

  // ---- Statische Dateien ----
  if (pathname === '' || pathname === '/') pathname = 'index.html';

  const filePath = path.join(BASE_DIR, pathname);
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

    const cacheControl = /\.(html|css|js)$/.test(pathname)
      ? 'public, max-age=0, must-revalidate'
      : 'public, max-age=86400';

    res.writeHead(200, {
      'Content-Type': getMimeType(filePath),
      'Cache-Control': cacheControl,
      'X-Content-Type-Options': 'nosniff'
    });
    res.end(data);
  });
});

server.listen(PORT, () => {
  console.log(`LeitTrain – Leitstellen-Simulator läuft auf Port ${PORT}`);
  console.log(anthropic
    ? `LeitTrain-KI aktiv (Modell ${MODELL})`
    : 'LeitTrain-KI INAKTIV – ANTHROPIC_API_KEY fehlt (Simulator läuft mit Standardantworten)');
});

server.on('error', (err) => {
  console.error('Server error:', err);
  process.exit(1);
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
