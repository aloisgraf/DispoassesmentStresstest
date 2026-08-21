// ============================================================
// leittrain.js – LeitTrain-KI Trainingsengine
// Modus 1 Notrufannahme · Modus 3 Großschadenslage · Modus 5 Debriefing
// Modus 6 Szenario-Editor · Modus 7 LMS-Report
// Lädt nach app.js und extensions.js.
// ============================================================

const LEITTRAIN = {
  sitzung:      'uebung',      // 'uebung' | 'pruefung'
  betriebsart:  'notruf',      // 'notruf' = mit Notrufannahme, 'disposition' = Einsätze direkt
  modus:        'Disposition', // Anzeige in der Statuszeile
  phase:        'pausiert',    // 'laufend' | 'beendet' | 'pausiert'
  schwierigkeit: 3,
  kiVerfuegbar: false,

  // Laufender Notruf
  anruf: {
    aktiv:      false,
    klingelt:   false,
    szenario:   null,
    verlauf:    [],            // [{rolle:'disponent'|'anrufer', text, ts}]
    startTs:    null,
    endeTs:     null,
    einsatzId:  null,
    ringTimer:  null,
    wartet:     false
  },

  // Sitzungsprotokoll für das Debriefing
  notrufe:      [],            // abgeschlossene Gespräche
  funkVerlauf:  [],
  metriken: {
    gespraecheGefuehrt: 0,
    abfragePunkte:      {},    // szenarioId → Set-artiges Objekt
    zeitBisDisposition: []     // Sekunden je Einsatz
  }
};

// 5-W-Abfrageschema (Österreich/RK). Über LEITTRAIN.abfrageschema austauschbar.
const ABFRAGESCHEMA = [
  { key: 'wo',      label: 'Wo ist der Notfallort?',                muster: /\b(wo|adresse|straße|strasse|gasse|hausnummer|ort|gemeinde|stock|stiege|etage|wohin|befinden sie sich|standort)\b/i },
  { key: 'was',     label: 'Was ist geschehen?',                    muster: /\b(was ist|was hat|was passiert|was genau|erzählen|erzahlen|beschreiben|schildern|vorgefallen|geschehen)\b/i },
  { key: 'wieviele',label: 'Wie viele Betroffene?',                 muster: /\b(wie viele|wieviele|anzahl|noch jemand|weitere person|mehrere|nur eine|betroffen)\b/i },
  { key: 'welche',  label: 'Welche Art von Erkrankung/Verletzung?', muster: /\b(atmet|atmung|ansprechbar|bewusst|reagiert|wach|verletz|schmerz|blut|puls|brust|beschwerden|zustand|geht es)\b/i },
  { key: 'warten',  label: 'Warten auf Rückfragen',                 muster: /\b(rückfrage|ruckfrage|nicht auf|bleiben sie|bleibe dran|leitung|melden sie sich|ich bleibe|bei ihnen)\b/i }
];

// ============================================================
// SITZUNGSSTEUERUNG
// ============================================================

async function leittrainInit() {
  try {
    const resp = await fetch('/api/config');
    const cfg = await resp.json();
    LEITTRAIN.kiVerfuegbar = !!cfg.hasApiKey;
  } catch (e) {
    LEITTRAIN.kiVerfuegbar = false;
  }
  leittrainStatuszeile();
  leittrainInitHandlers();
}

function leittrainStatuszeile() {
  const el = document.getElementById('leittrain-statuszeile');
  if (!el) return;
  const sz = LEITTRAIN.anruf.szenario;
  const szName = sz ? `${sz.id} – ${sz.titel || sz.stichwort || ''}`.slice(0, 40) : '–';
  el.innerHTML =
    `<span class="lt-tag">MODUS: ${LEITTRAIN.modus}</span>` +
    `<span class="lt-tag">SZENARIO: ${szName}</span>` +
    `<span class="lt-tag lt-phase-${LEITTRAIN.phase}">PHASE: ${LEITTRAIN.phase}</span>` +
    (LEITTRAIN.sitzung === 'pruefung' ? '<span class="lt-tag lt-pruefung">PRÜFUNGSMODUS</span>' : '') +
    (LEITTRAIN.kiVerfuegbar ? '' : '<span class="lt-tag lt-warn">KI offline</span>');
}

function leittrainSetzeModus(modus, phase) {
  LEITTRAIN.modus = modus;
  if (phase) LEITTRAIN.phase = phase;
  leittrainStatuszeile();
}

function leittrainInitHandlers() {
  const bind = (id, ev, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener(ev, fn);
  };

  bind('btn-notruf-annehmen', 'click', notrufAnnehmen);
  bind('btn-notruf-beenden', 'click', notrufBeenden);
  bind('btn-notruf-einsatz', 'click', notrufEinsatzAnlegen);
  bind('btn-notruf-send', 'click', notrufSenden);
  bind('notruf-input', 'keydown', e => { if (e.key === 'Enter') notrufSenden(); });

  // Untere Panel-Tabs: Funk / Notruf
  document.querySelectorAll('.komm-tab').forEach(tab => {
    tab.addEventListener('click', () => komTabWechseln(tab.dataset.komm));
  });

  bind('btn-debriefing', 'click', zeigeDebriefing);
  bind('btn-szenario-generieren', 'click', szenarioGenerieren);
}

function komTabWechseln(ziel) {
  document.querySelectorAll('.komm-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.komm === ziel);
    if (t.dataset.komm === ziel) t.classList.remove('blinkt');
  });
  document.querySelectorAll('.komm-pane').forEach(p => {
    p.classList.toggle('active', p.dataset.komm === ziel);
  });
}

// ============================================================
// MODUS 1 – NOTRUFANNAHME
// ============================================================

function eingehenderNotruf(szenario) {
  if (LEITTRAIN.anruf.aktiv || LEITTRAIN.anruf.klingelt) {
    // Es läuft bereits ein Gespräch – der Anruf wartet in der Schlange
    prueferLog('warn', `Weiterer Notruf wartet: ${szenario.id}`);
    return;
  }

  LEITTRAIN.anruf.szenario = szenario;
  LEITTRAIN.anruf.klingelt = true;
  LEITTRAIN.anruf.verlauf  = [];
  LEITTRAIN.anruf.einsatzId = null;
  leittrainSetzeModus('Notrufannahme', 'laufend');

  const panel = document.getElementById('notruf-panel');
  if (panel) panel.classList.add('klingelt');
  const status = document.getElementById('notruf-status');
  if (status) status.textContent = 'Eingehender Notruf …';

  const tab = document.querySelector('.komm-tab[data-komm="notruf"]');
  if (tab) tab.classList.add('blinkt');
  komTabWechseln('notruf');

  document.getElementById('btn-notruf-annehmen')?.removeAttribute('disabled');
  klingeln();
  prueferLog('info', `Notruf eingegangen: ${szenario.id} – ${szenario.titel || szenario.stichwort}`);
}

function klingeln() {
  let n = 0;
  const ton = () => {
    if (!LEITTRAIN.anruf.klingelt) return;
    spieleKlingelton();
    if (++n < 20) LEITTRAIN.anruf.ringTimer = setTimeout(ton, 2500);
  };
  ton();
}

function spieleKlingelton() {
  try {
    if (typeof initAudio === 'function' && !audioCtx) initAudio();
    if (typeof audioCtx === 'undefined' || !audioCtx) return;
    [0, 0.35].forEach(offset => {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 940;
      gain.gain.value = 0.08;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(audioCtx.currentTime + offset);
      osc.stop(audioCtx.currentTime + offset + 0.25);
    });
  } catch (e) { /* Audio nicht verfügbar – kein Problem */ }
}

async function notrufAnnehmen() {
  if (!LEITTRAIN.anruf.klingelt) return;
  LEITTRAIN.anruf.klingelt = false;
  LEITTRAIN.anruf.aktiv    = true;
  LEITTRAIN.anruf.startTs  = Date.now();
  clearTimeout(LEITTRAIN.anruf.ringTimer);

  const panel = document.getElementById('notruf-panel');
  if (panel) panel.classList.remove('klingelt');
  document.getElementById('btn-notruf-annehmen')?.setAttribute('disabled', 'true');
  document.getElementById('btn-notruf-beenden')?.removeAttribute('disabled');
  document.getElementById('btn-notruf-einsatz')?.removeAttribute('disabled');
  document.getElementById('notruf-input')?.removeAttribute('disabled');
  document.getElementById('btn-notruf-send')?.removeAttribute('disabled');

  const status = document.getElementById('notruf-status');
  if (status) status.textContent = 'Gespräch läuft';

  prueferLog('good', 'Notruf angenommen');
  renderAbfrageschema();
  await anruferAntwortHolen();
}

function notrufSenden() {
  const input = document.getElementById('notruf-input');
  if (!input || !LEITTRAIN.anruf.aktiv || LEITTRAIN.anruf.wartet) return;
  const text = input.value.trim();
  if (!text) return;

  LEITTRAIN.anruf.verlauf.push({ rolle: 'disponent', text, ts: zeitStempel() });
  input.value = '';
  renderNotrufVerlauf();
  pruefeAbfrageschema(text);
  STATE.simulation.letzteAktion = Date.now();
  anruferAntwortHolen();
}

async function anruferAntwortHolen() {
  const sz = LEITTRAIN.anruf.szenario;
  if (!sz) return;

  LEITTRAIN.anruf.wartet = true;
  zeigeTippt(true);

  try {
    const resp = await fetch('/api/leittrain/notruf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        szenario: sz,
        anruferProfil: sz.anruferProfil || {},
        schwierigkeit: LEITTRAIN.schwierigkeit,
        pruefungsmodus: LEITTRAIN.sitzung === 'pruefung',
        modus: LEITTRAIN.modus,
        verlauf: LEITTRAIN.anruf.verlauf
      })
    });

    if (resp.ok) {
      const data = await resp.json();
      if (data.text) {
        LEITTRAIN.anruf.verlauf.push({ rolle: 'anrufer', text: data.text, ts: zeitStempel() });
        renderNotrufVerlauf();
        sprichAnrufer(data.text);
      }
    } else {
      const fehler = await resp.json().catch(() => ({}));
      notrufSystemhinweis(fehler.error || 'Anrufer-KI nicht erreichbar. Ohne ANTHROPIC_API_KEY läuft nur die Disposition.');
    }
  } catch (e) {
    notrufSystemhinweis('Verbindung zur Anrufer-KI unterbrochen.');
  } finally {
    LEITTRAIN.anruf.wartet = false;
    zeigeTippt(false);
  }
}

function sprichAnrufer(text) {
  // Sprachausgabe nur am Disponentenplatz, Klammer-Einblendungen nicht vorlesen
  if (STATE.rolle !== 'disponent') return;
  if (typeof sprichFunkText !== 'function') return;
  const sauber = text.replace(/\[[^\]]*\]/g, ' ').replace(/-/g, ' ').trim();
  if (sauber) sprichFunkText(sauber);
}

function zeigeTippt(an) {
  const el = document.getElementById('notruf-tippt');
  if (el) el.style.display = an ? 'block' : 'none';
}

function notrufSystemhinweis(text) {
  const container = document.getElementById('notruf-verlauf');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'notruf-systemhinweis';
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

function renderNotrufVerlauf() {
  const container = document.getElementById('notruf-verlauf');
  if (!container) return;
  container.innerHTML = LEITTRAIN.anruf.verlauf.map(t => `
    <div class="notruf-zeile ${t.rolle}">
      <span class="notruf-zeit">${t.ts}</span>
      <span class="notruf-wer">${t.rolle === 'anrufer' ? 'Anrufer:in' : 'Leitstelle'}</span>
      <span class="notruf-text">${escapeHtml(t.text)}</span>
    </div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ---- Abfrageschema live mitschreiben ----
function pruefeAbfrageschema(text) {
  const sz = LEITTRAIN.anruf.szenario;
  if (!sz) return;
  const id = sz.id;
  if (!LEITTRAIN.metriken.abfragePunkte[id]) LEITTRAIN.metriken.abfragePunkte[id] = {};
  ABFRAGESCHEMA.forEach(f => {
    if (f.muster.test(text)) LEITTRAIN.metriken.abfragePunkte[id][f.key] = true;
  });
  renderAbfrageschema();
}

function renderAbfrageschema() {
  const container = document.getElementById('abfrage-schema');
  if (!container) return;
  const sz = LEITTRAIN.anruf.szenario;
  const erhoben = (sz && LEITTRAIN.metriken.abfragePunkte[sz.id]) || {};
  // Im Prüfungsmodus keine Live-Hilfe anzeigen
  if (LEITTRAIN.sitzung === 'pruefung') {
    container.innerHTML = '<div class="abfrage-verdeckt">Abfrageschema im Prüfungsmodus verdeckt</div>';
    return;
  }
  container.innerHTML = ABFRAGESCHEMA.map(f => `
    <div class="abfrage-punkt ${erhoben[f.key] ? 'erledigt' : ''}">
      <span>${erhoben[f.key] ? '✓' : '○'}</span> ${f.label}
    </div>
  `).join('');
}

function abfrageVollstaendigkeit(szenarioId) {
  const erhoben = LEITTRAIN.metriken.abfragePunkte[szenarioId] || {};
  const anzahl = ABFRAGESCHEMA.filter(f => erhoben[f.key]).length;
  return Math.round((anzahl / ABFRAGESCHEMA.length) * 100);
}

// ---- Einsatz aus dem laufenden Gespräch anlegen ----
function notrufEinsatzAnlegen() {
  if (!LEITTRAIN.anruf.aktiv && !LEITTRAIN.anruf.verlauf.length) return;
  if (LEITTRAIN.anruf.einsatzId) {
    einsatzOeffnen(LEITTRAIN.anruf.einsatzId);
    return;
  }

  const sz = LEITTRAIN.anruf.szenario;
  // Leerer Einsatz: der Trainee trägt selbst ein, was er erfragt hat.
  // Nur die Szenario-Verknüpfung wird gesetzt, damit der AAO-Vorschlag greift.
  const einsatz = neuerEinsatz(null, true);
  einsatz.szenarioId   = sz ? sz.id : null;
  einsatz.ausNotruf    = true;
  einsatz.gespraechStartTs = LEITTRAIN.anruf.startTs;
  LEITTRAIN.anruf.einsatzId = einsatz.id;

  einsatzDokuInterneintrag(einsatz, 'Einsatz aus Notrufannahme angelegt');
  prueferLog('good', `Einsatz ${einsatz.rnkr} während des Notrufs angelegt`);
  if (window.syncEinsaetze) syncEinsaetze();
}

function notrufBeenden() {
  if (!LEITTRAIN.anruf.aktiv) return;
  LEITTRAIN.anruf.aktiv  = false;
  LEITTRAIN.anruf.endeTs = Date.now();

  const sz = LEITTRAIN.anruf.szenario;
  LEITTRAIN.notrufe.push({
    szenario:   sz,
    verlauf:    [...LEITTRAIN.anruf.verlauf],
    startTs:    LEITTRAIN.anruf.startTs,
    endeTs:     LEITTRAIN.anruf.endeTs,
    dauerSek:   Math.round((LEITTRAIN.anruf.endeTs - LEITTRAIN.anruf.startTs) / 1000),
    einsatzId:  LEITTRAIN.anruf.einsatzId,
    vollstaendigkeit: sz ? abfrageVollstaendigkeit(sz.id) : null
  });
  LEITTRAIN.metriken.gespraecheGefuehrt++;

  document.getElementById('btn-notruf-beenden')?.setAttribute('disabled', 'true');
  document.getElementById('notruf-input')?.setAttribute('disabled', 'true');
  document.getElementById('btn-notruf-send')?.setAttribute('disabled', 'true');
  const status = document.getElementById('notruf-status');
  if (status) status.textContent = 'Gespräch beendet';

  leittrainSetzeModus('Disposition', 'laufend');
  prueferLog('info', `Notruf beendet nach ${Math.round((LEITTRAIN.anruf.endeTs - LEITTRAIN.anruf.startTs) / 1000)}s`);
}

// ============================================================
// MODUS 5 – DEBRIEFING
// ============================================================

async function zeigeDebriefing() {
  const overlay = document.createElement('div');
  overlay.className = 'auswertung-overlay';
  overlay.innerHTML = `
    <div class="auswertung-panel">
      <div class="auswertung-kopf">
        <h2>Debriefing</h2>
        <button class="auswertung-schliessen" onclick="this.closest('.auswertung-overlay').remove()">✕</button>
      </div>
      <div id="debriefing-inhalt">
        <p class="debriefing-laedt">LeitTrain-KI wertet die Einheit aus …</p>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

  leittrainSetzeModus('Debriefing', 'beendet');

  const metriken = sammleMetriken();
  const inhalt = document.getElementById('debriefing-inhalt');

  // Kennzahlen sofort zeigen, KI-Text danach nachladen
  inhalt.innerHTML = renderKennzahlen(metriken) +
    '<p class="debriefing-laedt">LeitTrain-KI wertet die Einheit aus …</p>';

  try {
    const resp = await fetch('/api/leittrain/debriefing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pruefungsmodus: LEITTRAIN.sitzung === 'pruefung',
        abfrageschema: ABFRAGESCHEMA.map(f => f.label),
        szenario: LEITTRAIN.notrufe.map(n => n.szenario).filter(Boolean),
        notrufVerlauf: LEITTRAIN.notrufe.flatMap(n => n.verlauf),
        funkVerlauf: LEITTRAIN.funkVerlauf,
        einsaetze: STATE.einsaetze.map(e => ({
          rnkr: e.rnkr, stichwort: e.stichwort, prioritaet: e.prioritaet,
          adresse: e.adresse, status: e.status, aao: e.aao,
          disponiert: e.alarmiert,
          sekBisDisposition: (e.alarmiertTs && (e.gespraechStartTs || e.erstelltTs))
            ? Math.round((e.alarmiertTs - (e.gespraechStartTs || e.erstelltTs)) / 1000)
            : null
        })),
        metriken,
        protokoll: STATE.prueferLog.slice(-80)
      })
    });

    if (resp.ok) {
      const data = await resp.json();
      inhalt.innerHTML = renderKennzahlen(metriken) + renderDebriefing(data.debriefing);
      LEITTRAIN.letztesDebriefing = data.debriefing;
    } else {
      const fehler = await resp.json().catch(() => ({}));
      inhalt.innerHTML = renderKennzahlen(metriken) +
        `<div class="debriefing-fehler">KI-Auswertung nicht verfügbar: ${escapeHtml(fehler.error || 'unbekannter Fehler')}.
         Die Kennzahlen oben wurden lokal gemessen und sind vollständig.</div>`;
    }
  } catch (e) {
    inhalt.innerHTML = renderKennzahlen(metriken) +
      `<div class="debriefing-fehler">KI-Auswertung nicht erreichbar. Die Kennzahlen oben wurden lokal gemessen.</div>`;
  }

  inhalt.insertAdjacentHTML('beforeend', `
    <div class="debriefing-aktionen">
      <button class="btn-action btn-save" onclick="lmsExport()">LMS-Nachweis (JSON)</button>
      <button class="btn-action" onclick="this.closest('.auswertung-overlay').remove()">Schließen</button>
    </div>`);
}

function sammleMetriken() {
  const laufzeit = STATE.simulation.startzeit
    ? Math.round((Date.now() - STATE.simulation.startzeit) / 1000) : 0;

  const disponiert = STATE.einsaetze.filter(e => e.alarmiert);
  const zeiten = disponiert
    .map(e => {
      const start = e.gespraechStartTs || e.erstelltTs;
      return (e.alarmiertTs && start) ? Math.round((e.alarmiertTs - start) / 1000) : null;
    })
    .filter(z => z !== null);

  const vollstaendigkeiten = LEITTRAIN.notrufe
    .map(n => n.vollstaendigkeit).filter(v => v !== null);

  return {
    dauerSek: laufzeit,
    einsaetzeGesamt: STATE.einsaetze.length,
    disponiert: disponiert.length,
    abgeschlossen: STATE.einsaetze.filter(e => e.status === 'abgeschlossen').length,
    storniert: STATE.einsaetze.filter(e => e.status === 'storniert').length,
    offen: STATE.einsaetze.filter(e => e.status === 'offen').length,
    gespraeche: LEITTRAIN.metriken.gespraecheGefuehrt,
    zeitBisDispositionSek: zeiten.length
      ? Math.round(zeiten.reduce((a, b) => a + b, 0) / zeiten.length) : null,
    schnellsteDispositionSek: zeiten.length ? Math.min(...zeiten) : null,
    abfragevollstaendigkeitProzent: vollstaendigkeiten.length
      ? Math.round(vollstaendigkeiten.reduce((a, b) => a + b, 0) / vollstaendigkeiten.length) : null,
    maxDrucklevel: STATE.simulation.drucklevel,
    ohneAao: STATE.einsaetze.filter(e => e.alarmiert && (!e.aao || e.aao.length === 0)).length
  };
}

function renderKennzahlen(m) {
  const zeile = (label, wert, hinweis = '') =>
    `<div class="kennzahl"><span class="kennzahl-label">${label}</span>
     <span class="kennzahl-wert">${wert}</span>
     ${hinweis ? `<span class="kennzahl-hinweis">${hinweis}</span>` : ''}</div>`;

  const min = Math.floor(m.dauerSek / 60), sek = m.dauerSek % 60;

  return `
    <section class="debriefing-block">
      <h3>Gemessene Kennzahlen</h3>
      ${zeile('Übungsdauer', `${min}:${String(sek).padStart(2, '0')} min`)}
      ${zeile('Notrufgespräche geführt', m.gespraeche)}
      ${zeile('Ø Zeit bis Disposition',
        m.zeitBisDispositionSek !== null ? `${m.zeitBisDispositionSek} s` : 'nicht messbar',
        m.zeitBisDispositionSek !== null && m.zeitBisDispositionSek <= 120 ? 'im Zielbereich' : '')}
      ${zeile('Abfragevollständigkeit',
        m.abfragevollstaendigkeitProzent !== null ? `${m.abfragevollstaendigkeitProzent} %` : 'kein Gespräch',
        '5-W-Schema')}
      ${zeile('Einsätze gesamt', m.einsaetzeGesamt)}
      ${zeile('Davon disponiert', m.disponiert)}
      ${zeile('Abgeschlossen', m.abgeschlossen)}
      ${zeile('Storniert', m.storniert)}
      ${zeile('Noch offen', m.offen, m.offen > 0 ? 'nicht bearbeitet' : '')}
      ${zeile('Max. Drucklevel', `${m.maxDrucklevel}/5`)}
    </section>`;
}

function renderDebriefing(d) {
  if (!d) return '';
  const k = d.kennzahlen || {};
  return `
    <section class="debriefing-block">
      <h3>Verlauf</h3>
      <p>${escapeHtml(d.zusammenfassung)}</p>
    </section>

    <section class="debriefing-block">
      <h3>Stärken</h3>
      ${(d.staerken || []).map(s => `
        <div class="debriefing-punkt gut">
          <div class="dp-titel">${escapeHtml(s.punkt)}</div>
          <div class="dp-beleg">${escapeHtml(s.beleg)}</div>
        </div>`).join('') || '<p class="dp-leer">Keine belegbaren Stärken erfasst.</p>'}
    </section>

    <section class="debriefing-block">
      <h3>Entwicklungspunkte</h3>
      ${(d.entwicklungspunkte || []).map(s => `
        <div class="debriefing-punkt entwicklung">
          <div class="dp-titel">${escapeHtml(s.punkt)}</div>
          <div class="dp-beleg">${escapeHtml(s.beleg)}</div>
          <div class="dp-empfehlung">Empfehlung: ${escapeHtml(s.empfehlung)}</div>
        </div>`).join('') || '<p class="dp-leer">Keine Entwicklungspunkte erfasst.</p>'}
    </section>

    <section class="debriefing-block">
      <h3>Fachliche Bewertung</h3>
      <div class="kennzahl"><span class="kennzahl-label">Abfragevollständigkeit (KI)</span>
        <span class="kennzahl-wert">${k.abfragevollstaendigkeit} %</span></div>
      <p class="dp-beleg">${escapeHtml(k.abfrageBegruendung || '')}</p>
      <div class="kennzahl"><span class="kennzahl-label">Priorisierung</span>
        <span class="kennzahl-wert">${escapeHtml(k.priorisierung || '')}</span></div>
      <p class="dp-beleg">${escapeHtml(k.priorisierungBegruendung || '')}</p>
      <div class="kennzahl"><span class="kennzahl-label">Kommunikationsqualität</span>
        <span class="kennzahl-wert">Note ${k.kommunikationsqualitaet}</span></div>
      <p class="dp-beleg">${escapeHtml(k.kommunikationBegruendung || '')}</p>
    </section>

    <section class="debriefing-block">
      <h3>Lernzielbezug</h3>
      <p>${escapeHtml(d.lernzielbezug)}</p>
    </section>

    <section class="debriefing-block gesamturteil">
      <h3>Gesamturteil</h3>
      <p class="urteil">${escapeHtml(d.gesamturteil)}</p>
      <p class="dp-hinweis">Automatisch erstellte Auswertung. Sie unterstützt die fachliche
      Beurteilung durch die Ausbildung, ersetzt sie aber nicht.</p>
    </section>`;
}

// ============================================================
// MODUS 7 – LMS-REPORT
// ============================================================

function lmsExport() {
  const m = sammleMetriken();
  const nachweis = {
    system: 'LeitTrain-KI',
    version: 1,
    trainee: {
      name: STATE.user?.name || null,
      kuerzel: STATE.user?.kuerzel || null
    },
    sitzung: {
      art: LEITTRAIN.sitzung === 'pruefung' ? 'Prüfungsmodus' : 'Übungsmodus',
      betriebsart: LEITTRAIN.betriebsart,
      schwierigkeit: LEITTRAIN.schwierigkeit,
      datum: new Date().toISOString(),
      dauerSekunden: m.dauerSek
    },
    szenarien: LEITTRAIN.notrufe.map(n => ({
      id: n.szenario?.id || null,
      titel: n.szenario?.titel || null,
      gespraechsdauerSekunden: n.dauerSek,
      abfragevollstaendigkeitProzent: n.vollstaendigkeit
    })),
    kennzahlen: m,
    debriefing: LEITTRAIN.letztesDebriefing || null,
    ergebnis: LEITTRAIN.letztesDebriefing?.gesamturteil || 'formativ – keine Bewertung',
    instruktor_signatur: '',
    hinweis: 'Automatisch erzeugter Trainingsnachweis. Fachliche Freigabe durch Ausbilder:in erforderlich.'
  };

  const blob = new Blob([JSON.stringify(nachweis, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const stempel = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  link.download = `leittrain_${(STATE.user?.kuerzel || 'trainee').toLowerCase()}_${stempel}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  prueferLog('info', 'LMS-Trainingsnachweis exportiert');
}

// ============================================================
// MODUS 6 – SZENARIO-GENERATOR
// ============================================================

async function szenarioGenerieren() {
  const wunschEl = document.getElementById('szenario-wunsch');
  const ausgabe  = document.getElementById('szenario-generator-status');
  const wunsch   = wunschEl ? wunschEl.value.trim() : '';

  if (ausgabe) ausgabe.textContent = 'LeitTrain-KI erstellt ein Szenario …';

  try {
    const typen = [...new Set(STATE.einsatzmittel.map(e => e.typ))];
    const resp = await fetch('/api/leittrain/szenario', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        einsatzmittel: typen,
        schwierigkeit: LEITTRAIN.schwierigkeit,
        lernziel: wunsch,
        kategorie: document.getElementById('pruefer-filter-kat')?.value || '',
        wunsch
      })
    });

    if (!resp.ok) {
      const f = await resp.json().catch(() => ({}));
      if (ausgabe) ausgabe.textContent = 'Fehlgeschlagen: ' + (f.error || 'unbekannt');
      return;
    }

    const data = await resp.json();
    const sz = data.szenario;
    sz.generiert = true;
    STATE.szenarien.unshift(sz);
    renderPrueferSzenarioListe();
    if (ausgabe) {
      ausgabe.innerHTML = `Erstellt: <strong>${escapeHtml(sz.titel)}</strong> (${sz.prioritaet}).
        Steht oben in der Liste. <em>Vor dem Einsatz in der Ausbildung fachlich prüfen.</em>`;
    }
    prueferLog('good', `Szenario generiert: ${sz.id} – ${sz.titel}`);
  } catch (e) {
    if (ausgabe) ausgabe.textContent = 'Generator nicht erreichbar.';
  }
}

// ============================================================
// START
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  // Erst nach dem Login sind die Bedienelemente im DOM
  setTimeout(leittrainInit, 200);
});
