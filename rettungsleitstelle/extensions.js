// ============================================================
// extensions.js – Sprachausgabe, BroadcastChannel, API-Setup
// Wird nach app.js geladen
// ============================================================

// ---- BROADCAST CHANNEL (Statusschirm Sync) ----
const statusBC = new BroadcastChannel('els_status');
const einsatzBC = new BroadcastChannel('els_einsatz');

function broadcastStatus() {
  if (!STATE?.einsatzmittel) return;
  statusBC.postMessage({
    type: 'status_update',
    einsatzmittel: STATE.einsatzmittel
  });
}

function broadcastEinsatz(einsatz) {
  if (!STATE?.einsaetze) return;
  einsatzBC.postMessage({
    type: 'einsatz_update',
    einsaetze: STATE.einsaetze,
    neuerEinsatz: einsatz
  });
}

// Empfange Einsatz-Updates von anderen Tabs
einsatzBC.onmessage = (event) => {
  if (event.data.type === 'einsatz_update' && event.data.einsaetze) {
    // Update STATE mit neuesten Einsätzen von anderem Tab
    const neueIds = event.data.einsaetze.map(e => e.id);
    const altIds = STATE.einsaetze.map(e => e.id);

    // Nur hinzufügen wenn es neue sind
    const neuEinsaetze = event.data.einsaetze.filter(e => !altIds.includes(e.id));
    if (neuEinsaetze.length > 0) {
      STATE.einsaetze.push(...neuEinsaetze);
      renderEinsatzliste();
    }
  }
};

// Status-Updates broadcasten sobald sich was ändert
// Überschreibe renderStatusScreen um Broadcast einzuhängen
const _origRenderStatus = window.renderStatusScreen;
window.renderStatusScreen = function() {
  if (_origRenderStatus) _origRenderStatus();
  broadcastStatus();
};

// ---- SPRACHAUSGABE (Text-to-Speech mit Funk-Effekt) ----
const SPRACH_CONFIG = {
  aktiv:      true,
  stimme:     null,    // wird beim Init gesetzt
  rate:       0.95,
  pitch:      1.0,
  volume:     0.85,
  rauschAktiv: true
};

// AudioContext für Funkrauschen
let audioCtx = null;
let rauschBuffer = null;

function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    erstelleRauschBuffer();
  } catch(e) {
    console.log('AudioContext nicht verfügbar:', e);
  }
}

function erstelleRauschBuffer() {
  if (!audioCtx) return;
  const sampleRate = audioCtx.sampleRate;
  const dauer = 0.15; // 150ms Rauschen
  rauschBuffer = audioCtx.createBuffer(1, sampleRate * dauer, sampleRate);
  const data = rauschBuffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = (Math.random() * 2 - 1) * 0.3;
  }
}

function spieleFunkRauschen(davor = true) {
  if (!audioCtx || !rauschBuffer || !SPRACH_CONFIG.rauschAktiv) return Promise.resolve();

  return new Promise(resolve => {
    try {
      const quelle = audioCtx.createBufferSource();
      quelle.buffer = rauschBuffer;

      // Bandpass-Filter für Funk-Charakter
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
    } catch(e) {
      resolve();
    }
  });
}

function initStimme() {
  if (!window.speechSynthesis) return;

  function waehleStimme() {
    const stimmen = window.speechSynthesis.getVoices();
    // Deutsche Stimme bevorzugen
    const deutsch = stimmen.find(s =>
      s.lang.startsWith('de') && s.name.toLowerCase().includes('google')
    ) || stimmen.find(s =>
      s.lang.startsWith('de')
    ) || stimmen[0];
    SPRACH_CONFIG.stimme = deutsch || null;
  }

  if (window.speechSynthesis.getVoices().length > 0) {
    waehleStimme();
  } else {
    window.speechSynthesis.addEventListener('voiceschanged', waehleStimme);
  }
}

async function sprichFunkText(text, sender) {
  if (!SPRACH_CONFIG.aktiv || !window.speechSynthesis) return;
  if (!audioCtx) initAudio();

  // AudioContext resumieren (Browser-Policy)
  if (audioCtx?.state === 'suspended') {
    await audioCtx.resume();
  }

  // Rauschen vor der Meldung
  await spieleFunkRauschen(true);

  return new Promise(resolve => {
    const utterance = new SpeechSynthesisUtterance(text);

    if (SPRACH_CONFIG.stimme) utterance.voice = SPRACH_CONFIG.stimme;
    utterance.lang   = 'de-AT';
    utterance.rate   = SPRACH_CONFIG.rate;
    utterance.pitch  = SPRACH_CONFIG.pitch;
    utterance.volume = SPRACH_CONFIG.volume;

    utterance.onend = async () => {
      await spieleFunkRauschen(false);
      resolve();
    };
    utterance.onerror = resolve;

    window.speechSynthesis.cancel(); // laufende Ausgabe stoppen
    window.speechSynthesis.speak(utterance);
  });
}

// Original addFunkMsg überschreiben um TTS einzuhängen
const _origAddFunkMsg = window.addFunkMsg;
window.addFunkMsg = function(typ, sender, text) {
  if (_origAddFunkMsg) _origAddFunkMsg(typ, sender, text);

  // Nur eingehende Meldungen vorlesen (nicht System/Ausgehende)
  if (typ === 'incoming' && SPRACH_CONFIG.aktiv) {
    sprichFunkText(`${sender}: ${text}`);
  }
};

// ---- API KEY SETUP ----
function initApiKeySetup() {
  // API Key aus localStorage laden
  const gespeicherterKey = localStorage.getItem('els_api_key');
  if (gespeicherterKey) {
    STATE.apiKey = gespeicherterKey;
    setzteApiHeader();
  }
}

function setzteApiHeader() {
  // Monkey-patch fetch für Anthropic API mit Key
  if (!STATE.apiKey) return;
  const origFetch = window.fetch;
  window._patchedFetch = true;
  window.fetch = function(url, options = {}) {
    if (typeof url === 'string' && url.includes('anthropic.com')) {
      options.headers = {
        ...options.headers,
        'x-api-key': STATE.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true'
      };
    }
    return origFetch(url, options);
  };
}

// ---- EINSTELLUNGS-PANEL ----
function zeigeEinstellungen() {
  const existing = document.getElementById('einstellungen-overlay');
  if (existing) { existing.remove(); return; }

  const overlay = document.createElement('div');
  overlay.id = 'einstellungen-overlay';
  overlay.style.cssText = `
    position:fixed; inset:0; background:rgba(0,0,0,0.7);
    z-index:700; display:flex; align-items:center; justify-content:center;
  `;

  const panel = document.createElement('div');
  panel.style.cssText = `
    background:#161b22; border:1px solid #30363d; border-top:3px solid #00bcd4;
    border-radius:4px; padding:24px; width:440px; color:#e6edf3;
  `;

  const aktuellerKey = STATE.apiKey ? '●'.repeat(20) + STATE.apiKey.slice(-4) : '';

  panel.innerHTML = `
    <h2 style="font-size:14px;color:#00bcd4;margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid #30363d">
      ⚙️ Simulator-Einstellungen
    </h2>

    <div style="margin-bottom:16px">
      <label style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#484f58;display:block;margin-bottom:6px">
        Anthropic API Key (für KI-Funkgespräche)
      </label>
      <div style="display:flex;gap:8px">
        <input type="password" id="api-key-input" placeholder="sk-ant-..." value="${aktuellerKey}"
          style="flex:1;padding:8px;background:#0d1117;border:1px solid #30363d;
          border-radius:3px;color:#e6edf3;outline:none;font-family:monospace;font-size:12px">
        <button onclick="speichereApiKey()" style="
          padding:8px 14px;background:#21262d;border:1px solid #30363d;
          border-radius:3px;color:#e6edf3;cursor:pointer;font-size:12px">
          Speichern
        </button>
      </div>
      <p style="font-size:10px;color:#484f58;margin-top:6px">
        Der Key wird lokal im Browser gespeichert und nicht übertragen.<br>
        Ohne Key läuft der Simulator mit einfachen Fallback-Antworten.
      </p>
    </div>

    <div style="margin-bottom:16px">
      <label style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#484f58;display:block;margin-bottom:8px">
        Sprachausgabe Funk
      </label>
      <div style="display:flex;align-items:center;gap:10px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px">
          <input type="checkbox" id="tts-aktiv" ${SPRACH_CONFIG.aktiv ? 'checked' : ''}
            onchange="SPRACH_CONFIG.aktiv = this.checked" style="accent-color:#e3000b">
          Eingehende Funkmeldungen vorlesen (TTS)
        </label>
      </div>
      <div style="display:flex;align-items:center;gap:10px;margin-top:8px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px">
          <input type="checkbox" id="rausch-aktiv" ${SPRACH_CONFIG.rauschAktiv ? 'checked' : ''}
            onchange="SPRACH_CONFIG.rauschAktiv = this.checked" style="accent-color:#e3000b">
          Funkrauschen vor/nach Sprachmeldung
        </label>
      </div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:10px">
        <label style="font-size:11px;color:#8b949e;min-width:60px">Sprechrate</label>
        <input type="range" min="0.7" max="1.3" step="0.05" value="${SPRACH_CONFIG.rate}"
          oninput="SPRACH_CONFIG.rate=parseFloat(this.value);document.getElementById('rate-val').textContent=this.value"
          style="flex:1;accent-color:#e3000b">
        <span id="rate-val" style="font-size:11px;color:#484f58;min-width:30px">${SPRACH_CONFIG.rate}</span>
      </div>
      <div style="margin-top:6px">
        <button onclick="testeSprache()" style="
          padding:5px 12px;background:#21262d;border:1px solid #30363d;
          border-radius:3px;color:#8b949e;cursor:pointer;font-size:11px">
          🔊 Testton
        </button>
      </div>
    </div>

    <div style="margin-bottom:16px">
      <label style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;color:#484f58;display:block;margin-bottom:8px">
        Zweiter Monitor – Statusschirm
      </label>
      <button onclick="oeffneStatusschirm()" style="
        padding:8px 14px;background:#21262d;border:1px solid #30363d;
        border-radius:3px;color:#e6edf3;cursor:pointer;font-size:12px">
        ⧉ Statusschirm.html öffnen
      </button>
      <p style="font-size:10px;color:#484f58;margin-top:6px">
        Öffnet den Statusschirm in einem neuen Fenster – auf zweiten Monitor ziehen.
        Aktualisiert sich automatisch alle 2 Sekunden.
      </p>
    </div>

    <div style="text-align:right;border-top:1px solid #30363d;padding-top:12px;margin-top:4px">
      <button onclick="document.getElementById('einstellungen-overlay').remove()" style="
        padding:7px 16px;background:#e3000b;border:none;
        border-radius:3px;color:#fff;cursor:pointer;font-size:12px;font-weight:600">
        Schließen
      </button>
    </div>
  `;

  overlay.appendChild(panel);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  // AudioContext beim ersten Klick starten (Browser-Policy)
  document.addEventListener('click', () => {
    if (!audioCtx) initAudio();
  }, { once: true });
}

function speichereApiKey() {
  const input = document.getElementById('api-key-input');
  const key = input.value.trim();
  if (key && !key.startsWith('●')) {
    STATE.apiKey = key;
    localStorage.setItem('els_api_key', key);
    setzteApiHeader();
    input.value = '●'.repeat(20) + key.slice(-4);
    zeigeKurzToast('API Key gespeichert ✓', 'green');
  }
}

function testeSprache() {
  if (!audioCtx) initAudio();
  sprichFunkText('20-201 an Leitstelle: Auftrag erhalten, rücken aus. Über.', '20-201');
}

function oeffneStatusschirm() {
  window.open('statusschirm.html', 'els_status',
    'width=1200,height=800,menubar=no,toolbar=no,scrollbars=yes,resizable=yes');
}

function zeigeKurzToast(text, farbe = 'cyan') {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position:fixed;bottom:20px;left:50%;transform:translateX(-50%);
    background:#161b22;border:1px solid var(--${farbe},#00bcd4);
    padding:8px 16px;border-radius:4px;font-size:12px;color:#e6edf3;
    z-index:999;animation:fadein 0.3s ease;
  `;
  toast.textContent = text;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

// ---- EINSTELLUNGS-BUTTON IN MENÜLEISTE EINHÄNGEN ----
document.addEventListener('DOMContentLoaded', () => {
  // Warte bis App geladen
  setTimeout(() => {
    const menuRight = document.querySelector('.menubar-right');
    if (!menuRight) return;

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'menu-icon-btn';
    settingsBtn.title = 'Einstellungen';
    settingsBtn.textContent = '⚙';
    settingsBtn.addEventListener('click', zeigeEinstellungen);

    // Vor Logout-Button einfügen
    const logoutBtn = document.getElementById('btn-logout');
    if (logoutBtn) menuRight.insertBefore(settingsBtn, logoutBtn);
    else menuRight.appendChild(settingsBtn);

    initApiKeySetup();
    initStimme();
  }, 500);
});

// ---- STATUS BROADCAST LOOP ----
setInterval(() => {
  if (STATE?.simulation?.aktiv || STATE?.einsatzmittel?.length) {
    broadcastStatus();
  }
}, 2000);
