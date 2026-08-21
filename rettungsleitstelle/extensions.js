// ============================================================
// extensions.js – Sprachausgabe, Tab-Synchronisation, Einstellungen
// Lädt nach app.js, vor leittrain.js.
// ============================================================

// ---- BROADCAST CHANNELS ----
// els_status: Einweg-Feed für das Statusschirm-Popup (statusschirm.html)
// els_sync:   Zustand zwischen Haupt-Tabs (Prüfer ↔ Disponent)
const statusBC = new BroadcastChannel('els_status');
const syncBC   = new BroadcastChannel('els_sync');

let syncApplying = false;   // verhindert Broadcast-Schleifen

function broadcastStatus() {
  if (!STATE?.einsatzmittel) return;
  statusBC.postMessage({ type: 'status_update', einsatzmittel: STATE.einsatzmittel });
}

// ---- SENDEN ----
window.syncEinsaetze = function (initial = false) {
  if (syncApplying) return;
  syncBC.postMessage({
    type: 'einsaetze',
    einsaetze: STATE.einsaetze,
    counter: STATE.einsatzCounter,
    initial
  });
};

window.broadcastFunk = function (typ, sender, text) {
  if (syncApplying) return;
  syncBC.postMessage({ type: 'funk', typ, sender, text });
};

window.broadcastEmDiff = function (em) {
  if (syncApplying) return;
  syncBC.postMessage({
    type: 'em',
    em: {
      kennung: em.kennung, status: em.status, aktuelleAdresse: em.aktuelleAdresse,
      zeitAus: em.zeitAus, zeitEEO: em.zeitEEO, zeitAEO: em.zeitAEO, zeitEZO: em.zeitEZO,
      zeitStatus: em.zeitStatus, einsatzId: em.einsatzId
    }
  });
};

window.broadcastSim = function (aktiv) {
  if (syncApplying) return;
  syncBC.postMessage({ type: 'sim', aktiv });
};

window.broadcastLog = function (eintrag) {
  if (syncApplying) return;
  syncBC.postMessage({ type: 'log', eintrag });
};

// Beim Login vorhandenen Zustand von anderen Tabs anfordern
window.syncHello = function () {
  syncBC.postMessage({ type: 'hello' });
};

// ---- EMPFANGEN ----
syncBC.onmessage = (event) => {
  const d = event.data;
  if (!d || !d.type) return;
  syncApplying = true;
  try {
    switch (d.type) {
      case 'einsaetze': {
        const altIds = new Set(STATE.einsaetze.map(e => e.id));
        STATE.einsaetze = d.einsaetze || [];
        STATE.einsatzCounter = Math.max(STATE.einsatzCounter, d.counter || 0);
        renderEinsatzliste();
        if (!d.initial) {
          STATE.einsaetze
            .filter(e => !altIds.has(e.id) && e.status === 'offen')
            .forEach(e => zeigeNotrufBanner(e));
        }
        break;
      }
      case 'funk':
        addFunkMsg(d.typ, d.sender, d.text, { relayed: true });
        break;
      case 'em': {
        const em = STATE.einsatzmittel.find(x => x.kennung === d.em.kennung);
        if (em) { Object.assign(em, d.em); renderStatusScreen(); }
        break;
      }
      case 'sim':
        applySimState(d.aktiv);
        break;
      case 'log':
        if (d.eintrag) prueferLog(d.eintrag.typ, d.eintrag.text, true);
        break;
      case 'hello':
        if (STATE.user && (STATE.einsaetze.length > 0 || STATE.simulation.aktiv)) {
          syncApplying = false;
          window.syncEinsaetze(true);
          if (STATE.simulation.aktiv) window.broadcastSim(true);
        }
        break;
    }
  } finally {
    syncApplying = false;
  }
};

// Simulationsstatus anwenden – die Loops laufen nur im Prüfer-Tab
function applySimState(aktiv) {
  STATE.simulation.aktiv = aktiv;
  if (aktiv && !STATE.simulation.startzeit) STATE.simulation.startzeit = Date.now();

  const dot = document.querySelector('#sim-status-ind .status-dot');
  if (dot) dot.className = 'status-dot ' + (aktiv ? 'running' : 'idle');
  const txt = document.getElementById('sim-status-text');
  if (txt) txt.textContent = aktiv ? 'Übung läuft' : 'Bereit';

  const input = document.getElementById('funk-input');
  const btn   = document.getElementById('btn-funk-send');
  if (input) input.disabled = !aktiv;
  if (btn) btn.disabled = !aktiv;

  if (typeof LEITTRAIN !== 'undefined') {
    LEITTRAIN.phase = aktiv ? 'laufend' : 'beendet';
    if (typeof leittrainStatuszeile === 'function') leittrainStatuszeile();
  }
}
window.applySimState = applySimState;

// ---- NOTRUF-BANNER (neuer Einsatz von einem anderen Tab) ----
function zeigeNotrufBanner(einsatz) {
  const banner = document.createElement('div');
  banner.className = 'notruf-banner';
  banner.innerHTML = `<strong>Neuer Einsatz</strong> ${einsatz.prioritaet || ''} ` +
    `${einsatz.stichwort || 'ohne Stichwort'} – ${einsatz.adresse || 'Adresse offen'}`;
  document.body.appendChild(banner);
  spieleNotrufTon();
  setTimeout(() => banner.remove(), 6000);
}

function spieleNotrufTon() {
  try {
    if (!audioCtx) initAudio();
    if (!audioCtx) return;
    const osc  = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.value = 0.12;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.frequency.setValueAtTime(660, audioCtx.currentTime + 0.15);
    osc.stop(audioCtx.currentTime + 0.3);
  } catch (e) { /* Audio nicht verfügbar */ }
}

// Statusschirm-Popup mitversorgen
const _origRenderStatus = window.renderStatusScreen;
window.renderStatusScreen = function () {
  if (_origRenderStatus) _origRenderStatus();
  broadcastStatus();
};

// ============================================================
// SPRACHAUSGABE (TTS mit Funkeffekt)
// ============================================================
const SPRACH_CONFIG = {
  aktiv: true,
  stimme: null,
  rate: 0.95,
  pitch: 1.0,
  volume: 0.85,
  rauschAktiv: true
};

let audioCtx = null;
let rauschBuffer = null;

function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    erstelleRauschBuffer();
  } catch (e) {
    console.log('AudioContext nicht verfügbar:', e);
  }
}

function erstelleRauschBuffer() {
  if (!audioCtx) return;
  const dauer = 0.15;
  rauschBuffer = audioCtx.createBuffer(1, audioCtx.sampleRate * dauer, audioCtx.sampleRate);
  const data = rauschBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.3;
}

function spieleFunkRauschen(davor = true) {
  if (!audioCtx || !rauschBuffer || !SPRACH_CONFIG.rauschAktiv) return Promise.resolve();
  return new Promise(resolve => {
    try {
      const quelle = audioCtx.createBufferSource();
      quelle.buffer = rauschBuffer;
      const filter = audioCtx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1800;
      filter.Q.value = 0.8;
      const gain = audioCtx.createGain();
      gain.gain.value = davor ? 0.4 : 0.3;
      quelle.connect(filter);
      filter.connect(gain);
      gain.connect(audioCtx.destination);
      quelle.onended = resolve;
      quelle.start();
    } catch (e) { resolve(); }
  });
}

function initStimme() {
  if (!window.speechSynthesis) return;
  const waehleStimme = () => {
    const stimmen = window.speechSynthesis.getVoices();
    SPRACH_CONFIG.stimme =
      stimmen.find(s => s.lang.startsWith('de') && s.name.toLowerCase().includes('google')) ||
      stimmen.find(s => s.lang.startsWith('de')) || stimmen[0] || null;
  };
  if (window.speechSynthesis.getVoices().length > 0) waehleStimme();
  else window.speechSynthesis.addEventListener('voiceschanged', waehleStimme);
}

async function sprichFunkText(text) {
  if (!SPRACH_CONFIG.aktiv || !window.speechSynthesis) return;
  if (!audioCtx) initAudio();
  if (audioCtx?.state === 'suspended') await audioCtx.resume();
  await spieleFunkRauschen(true);

  return new Promise(resolve => {
    // Bindestriche nicht als "bis" vorlesen
    const utterance = new SpeechSynthesisUtterance(String(text).replace(/-/g, ' '));
    if (SPRACH_CONFIG.stimme) utterance.voice = SPRACH_CONFIG.stimme;
    utterance.lang   = 'de-AT';
    utterance.rate   = SPRACH_CONFIG.rate;
    utterance.pitch  = SPRACH_CONFIG.pitch;
    utterance.volume = SPRACH_CONFIG.volume;
    utterance.onend = async () => { await spieleFunkRauschen(false); resolve(); };
    utterance.onerror = resolve;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(utterance);
  });
}

// Eingehende Funkmeldungen vorlesen – nur am Disponentenplatz
const _origAddFunkMsg = window.addFunkMsg;
window.addFunkMsg = function (typ, sender, text, opts) {
  if (_origAddFunkMsg) _origAddFunkMsg(typ, sender, text, opts);
  if (typ === 'incoming' && SPRACH_CONFIG.aktiv && STATE.rolle === 'disponent') {
    sprichFunkText(`${sender}: ${text}`);
  }
};

// ============================================================
// EINSTELLUNGEN
// ============================================================
function zeigeEinstellungen() {
  const vorhanden = document.getElementById('einstellungen-overlay');
  if (vorhanden) { vorhanden.remove(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'einstellungen-overlay';
  overlay.className = 'auswertung-overlay';
  overlay.innerHTML = `
    <div class="auswertung-panel einstellungen-panel">
      <div class="auswertung-kopf">
        <h2>Einstellungen</h2>
        <button class="auswertung-schliessen" onclick="document.getElementById('einstellungen-overlay').remove()">✕</button>
      </div>

      <section class="debriefing-block">
        <h3>Sprachausgabe</h3>
        <label class="einst-zeile">
          <input type="checkbox" id="tts-aktiv" ${SPRACH_CONFIG.aktiv ? 'checked' : ''}>
          Eingehende Funk- und Notrufmeldungen vorlesen
        </label>
        <label class="einst-zeile">
          <input type="checkbox" id="rausch-aktiv" ${SPRACH_CONFIG.rauschAktiv ? 'checked' : ''}>
          Funkrauschen vor und nach der Meldung
        </label>
        <label class="einst-zeile">
          Sprechrate
          <input type="range" id="tts-rate" min="0.7" max="1.3" step="0.05" value="${SPRACH_CONFIG.rate}">
          <span id="rate-val">${SPRACH_CONFIG.rate}</span>
        </label>
        <button class="btn-action" id="btn-tts-test">Testton</button>
      </section>

      <section class="debriefing-block">
        <h3>Zweiter Monitor</h3>
        <button class="btn-action" id="btn-statusschirm-oeffnen">Statusschirm in neuem Fenster öffnen</button>
        <p class="dp-hinweis">Aktualisiert sich automatisch. Auf den zweiten Monitor ziehen.</p>
      </section>

      <section class="debriefing-block">
        <h3>LeitTrain-KI</h3>
        <p class="dp-hinweis" id="ki-status">Status wird geprüft …</p>
        <p class="dp-hinweis">Der API-Key liegt als Umgebungsvariable <code>ANTHROPIC_API_KEY</code>
        auf dem Server und wird nie an den Browser ausgeliefert.</p>
      </section>

      <div class="debriefing-aktionen">
        <button class="btn-action" onclick="document.getElementById('einstellungen-overlay').remove()">Schließen</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  document.getElementById('tts-aktiv').addEventListener('change', e => {
    SPRACH_CONFIG.aktiv = e.target.checked;
  });
  document.getElementById('rausch-aktiv').addEventListener('change', e => {
    SPRACH_CONFIG.rauschAktiv = e.target.checked;
  });
  document.getElementById('tts-rate').addEventListener('input', e => {
    SPRACH_CONFIG.rate = parseFloat(e.target.value);
    document.getElementById('rate-val').textContent = e.target.value;
  });
  document.getElementById('btn-tts-test').addEventListener('click', () => {
    if (!audioCtx) initAudio();
    sprichFunkText('20-201 an Leitstelle: Auftrag erhalten, wir rücken aus.');
  });
  document.getElementById('btn-statusschirm-oeffnen').addEventListener('click', () => {
    window.open('statusschirm.html', 'els_status',
      'width=1200,height=800,menubar=no,toolbar=no,scrollbars=yes,resizable=yes');
  });

  const kiStatus = document.getElementById('ki-status');
  fetch('/api/config').then(r => r.json()).then(cfg => {
    kiStatus.textContent = cfg.hasApiKey
      ? `KI aktiv (Modell ${cfg.modell}). Anrufer-Simulation und Debriefing verfügbar.`
      : 'KI inaktiv – ANTHROPIC_API_KEY ist am Server nicht gesetzt. Die Disposition funktioniert, Notrufgespräche und KI-Debriefing nicht.';
  }).catch(() => { kiStatus.textContent = 'KI-Status nicht abrufbar.'; });
}

function zeigeKurzToast(text, farbe = 'blue') {
  const toast = document.createElement('div');
  toast.className = `kurz-toast toast-${farbe}`;
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}
window.zeigeKurzToast = zeigeKurzToast;

// Einstellungs-Button in die Menüleiste hängen
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    const menuRight = document.querySelector('.menubar-right');
    if (!menuRight || document.getElementById('btn-einstellungen')) return;

    const btn = document.createElement('button');
    btn.id = 'btn-einstellungen';
    btn.className = 'menu-icon-btn';
    btn.title = 'Einstellungen';
    btn.textContent = '⚙';
    btn.addEventListener('click', zeigeEinstellungen);

    const logout = document.getElementById('btn-logout');
    if (logout) menuRight.insertBefore(btn, logout); else menuRight.appendChild(btn);

    initStimme();
    // AudioContext beim ersten Klick freischalten (Browser-Richtlinie)
    document.addEventListener('click', () => { if (!audioCtx) initAudio(); }, { once: true });
  }, 400);
});

// Statusschirm-Popup regelmäßig versorgen
setInterval(() => {
  if (STATE?.einsatzmittel?.length) broadcastStatus();
}, 2000);
