// ============================================================
// app.js – Leitstellen-Logik (Einsatzmaske, Disposition, Statusschirm)
// LeitTrain – RK Salzburg
// ============================================================

const STATE = {
  user:           null,
  rolle:          null,
  einsaetze:      [],
  einsatzCounter: 0,
  aktiverEinsatz: null,
  einsatzmittel:  [],
  szenarien:      [],
  listenFilter:   'offen',
  simulation: {
    aktiv:        false,
    drucklevel:   1,
    letzteAktion: null,
    eskalationsTimer: [],
    szenarioGespielt: [],
    startzeit:    null,
    druckLoop:    null,
    funkLoop:     null
  },
  prueferLog:     []
};

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  initEinsatzmittel();
  ladeSzenarien();
  initClock();
  initLoginHandlers();
});

function initEinsatzmittel() {
  STATE.einsatzmittel = EINSATZMITTEL_STAMM.map(em => ({
    ...em, einsatzId: null, zeitStatus: null, fahrtTimers: []
  }));
}

async function ladeSzenarien() {
  try {
    const resp = await fetch('szenarien.json');
    const data = await resp.json();
    // Alte E1/E2/E3/KT-Codes auf das Schema A1/A3/B1/B3/D1/D2 heben
    STATE.szenarien = (data.szenarien || []).map(sz => ({
      ...sz, prioritaet: konvertierePrio(sz)
    }));
  } catch (e) {
    console.warn('szenarien.json nicht geladen – Demo-Modus');
    STATE.szenarien = [];
  }
}

function initClock() {
  const tick = () => {
    const el = document.getElementById('clock');
    if (el) el.textContent = new Date().toTimeString().slice(0, 8);
  };
  tick();
  setInterval(tick, 1000);
}

// ---- LOGIN ----
function initLoginHandlers() {
  let aktuelleRolle = 'disponent';
  const roleBtns = document.querySelectorAll('.role-btn');
  roleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      roleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      aktuelleRolle = btn.dataset.role;
    });
  });

  const sitzungBtns = document.querySelectorAll('.sitzung-btn');
  sitzungBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sitzungBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (typeof LEITTRAIN !== 'undefined') LEITTRAIN.sitzung = btn.dataset.sitzung;
      const hinweis = document.getElementById('sitzung-hinweis');
      if (hinweis) {
        hinweis.textContent = btn.dataset.sitzung === 'pruefung'
          ? 'Prüfungsmodus: keine Hilfestellungen, Ergebnis wird dokumentiert.'
          : 'Übungsmodus: Hilfestellungen sichtbar, Rückmeldung formativ.';
      }
    });
  });

  const loginBtn = document.getElementById('login-btn');
  if (loginBtn) loginBtn.addEventListener('click', () => login(aktuelleRolle));
  const pin = document.getElementById('login-pin');
  if (pin) pin.addEventListener('keydown', e => { if (e.key === 'Enter') login(aktuelleRolle); });
}

function login(rolle) {
  const nameInput = document.getElementById('login-name').value.trim();
  const pinWert   = document.getElementById('login-pin').value.trim();

  const benutzer = BENUTZER.find(b =>
    b.pin === pinWert && b.rolle === rolle &&
    (nameInput === '' || b.name.toLowerCase().includes(nameInput.toLowerCase()) ||
     b.kuerzel.toLowerCase() === nameInput.toLowerCase())
  );

  const pinOk = benutzer ||
    (rolle === 'disponent' && pinWert === '1234') ||
    (rolle === 'pruefer'   && pinWert === '9999');

  if (!pinOk) {
    document.getElementById('login-error').style.display = 'block';
    return;
  }

  STATE.user = benutzer || {
    name: nameInput || (rolle === 'pruefer' ? 'Prüfer' : 'Disponent'),
    kuerzel: nameInput.slice(0, 2).toUpperCase() || 'XX',
    rolle
  };
  STATE.rolle = STATE.user.rolle;

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('current-user').textContent = STATE.user.name;

  renderStatusScreen();
  renderEinsatzliste();
  initMenuHandlers();
  initEinsatzHandlers();
  initFunkHandlers();
  initListenTabs();

  if (STATE.rolle === 'pruefer') {
    document.getElementById('pruefer-toggle-btn').style.display = 'flex';
    initPrueferPanel();
  }

  setTimeout(() => { if (window.syncHello) syncHello(); }, 300);
}

// ---- MENÜ ----
function initMenuHandlers() {
  document.querySelectorAll('.menu-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.menu-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const layout = document.getElementById('main-layout');
      layout.className = 'main-layout';
      if (btn.dataset.window === 'status')  layout.classList.add('mode-status');
      if (btn.dataset.window === 'einsatz') layout.classList.add('mode-einsatz');
    });
  });

  const logout = document.getElementById('btn-logout');
  if (logout) logout.addEventListener('click', () => location.reload());

  const popout = document.getElementById('btn-popout-status');
  if (popout) popout.addEventListener('click', () => {
    const popup = window.open('statusschirm.html', 'els_status',
      'width=1200,height=800,menubar=no,toolbar=no,scrollbars=yes,resizable=yes');
    if (!popup) alert('Popup wurde blockiert – bitte für diese Seite erlauben.');
  });
}

// ============================================================
// STATUSSCHIRM
// ============================================================
function renderStatusScreen() {
  const container = document.getElementById('status-screen');
  if (!container) return;

  const gruppen = {};
  STATE.einsatzmittel.forEach(em => {
    (gruppen[em.gruppe] = gruppen[em.gruppe] || []).push(em);
  });

  let html = '';
  for (const [gruppenName, einheiten] of Object.entries(gruppen)) {
    html += `<div class="status-group"><div class="status-group-header">${gruppenName}</div>
      <table class="status-table"><thead><tr>
        <th>Kennung</th><th>Typ</th><th>Status</th><th>Komp.</th>
        <th>Aus</th><th>E:EO</th><th>A:EO</th><th>E:ZO</th><th>Adresse / Info</th>
      </tr></thead><tbody>`;

    einheiten.forEach(em => {
      const def = STATUS_DEFINITIONEN[em.status] || STATUS_DEFINITIONEN['00'];
      const s = em.status.padStart(2, '0');
      const klick = STATE.rolle === 'pruefer'
        ? `emStatusKlick('${em.kennung}')`
        : `emAaoZusammenfassen('${em.kennung}')`;
      html += `<tr class="status-row s-${s}" data-kennung="${em.kennung}" onclick="${klick}">
        <td><span class="em-kennung">${em.kennung}</span></td>
        <td><span class="em-typ">${em.typ}</span></td>
        <td><span class="status-badge badge-${s}">${s}</span>
            <span class="status-text">${def.text}</span></td>
        <td class="em-komp">${em.kompetenzen.join(' ')}</td>
        <td class="em-time">${em.zeitAus || '–'}</td>
        <td class="em-time">${em.zeitEEO || '–'}</td>
        <td class="em-time">${em.zeitAEO || '–'}</td>
        <td class="em-time">${em.zeitEZO || '–'}</td>
        <td class="em-adresse">${em.aktuelleAdresse || '–'}</td>
      </tr>`;
    });
    html += `</tbody></table></div>`;
  }
  container.innerHTML = html;

  const total = document.getElementById('em-total');
  if (total) {
    const frei = STATE.einsatzmittel.filter(emVerfuegbar).length;
    total.textContent = `${frei} frei / ${STATE.einsatzmittel.filter(e => e.besetzt).length} besetzt`;
  }
  aktualisiereAaoSelect();
}

function emStatusKlick(kennung) {
  if (STATE.rolle !== 'pruefer') return;
  const em = STATE.einsatzmittel.find(e => e.kennung === kennung);
  if (!em) return;
  const keys = Object.keys(STATUS_DEFINITIONEN);
  setEmStatus(kennung, keys[(keys.indexOf(em.status) + 1) % keys.length]);
}

// Verfügbar = besetzt, einsatzbereit und keinem Einsatz zugeteilt
function emVerfuegbar(em) {
  return !!em && em.besetzt && !em.einsatzId && (em.status === '00' || em.status === '06');
}

function freieAnzahl(typ) {
  return STATE.einsatzmittel.filter(em => em.typ === typ && emVerfuegbar(em)).length;
}

function aaoHint(text) {
  const hint = document.getElementById('aao-hint');
  if (hint) hint.textContent = text;
}

function aktualisiereAaoSelect() {
  const sel = document.getElementById('aao-select-em');
  if (!sel) return;
  Array.from(sel.options).forEach(opt => {
    if (!opt.value) return;
    const em = STATE.einsatzmittel.find(e => e.kennung === opt.value);
    if (em) {
      opt.disabled = !emVerfuegbar(em);
      opt.textContent = opt.textContent.replace(/ \(belegt\)$/, '') + (opt.disabled ? ' (belegt)' : '');
    }
  });
}

function emAaoZusammenfassen(kennung) {
  if (!STATE.aktiverEinsatz) { aaoHint('Zuerst einen Einsatz öffnen'); return; }
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;
  const em = STATE.einsatzmittel.find(e => e.kennung === kennung);
  if (!emVerfuegbar(em)) {
    aaoHint(`${kennung} nicht verfügbar (Status ${em ? em.status : '?'})`);
    return;
  }
  if (!einsatz.aao.includes(kennung)) {
    einsatz.aao.push(kennung);
    renderAaoChips(einsatz);
    aaoHint(`${kennung} übernommen`);
    if (window.syncEinsaetze) syncEinsaetze();
  }
  STATE.simulation.letzteAktion = Date.now();
}

// ============================================================
// EINSATZMASKE
// ============================================================
function initEinsatzHandlers() {
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  };
  bind('btn-new-einsatz',            () => neuerEinsatz(null, true));
  bind('btn-alarmieren',             disponieren);
  bind('btn-einsatz-save',           einsatzSpeichern);
  bind('btn-einsatz-abschliessen',   einsatzAbschliessen);
  bind('btn-einsatz-stornieren',     einsatzStornieren);
  bind('btn-aao-add',                aaoHinzufuegen);
  bind('btn-aao-vorschlag',          aaoVorschlag);
}

function neuerEinsatz(szenario = null, autoOeffnen = true) {
  STATE.einsatzCounter++;
  const jetzt = new Date();
  const rnkr = `${String(jetzt.getDate()).padStart(2, '0')}${String(jetzt.getMonth() + 1).padStart(2, '0')}-${1000 + STATE.einsatzCounter}`;

  const einsatz = {
    id: STATE.einsatzCounter,
    rnkr,
    zeitErstellt: zeitStempel(),
    erstelltTs:   Date.now(),
    stichwort:    szenario ? szenario.stichwort : '',
    prioritaet:   szenario ? konvertierePrio(szenario) : 'B1',
    einsatzart:   szenario ? einsatzartAusKategorie(szenario.kategorie) : 'RD',
    adresse:      szenario ? szenario.einsatzort : '',
    etage:        '',
    zielort:      '',
    zielStation:  '',
    patient:      '',
    alter:        szenario?.patient?.alter ?? '',
    geschlecht:   szenario?.patient?.geschlecht || '-',
    aao:          [],
    aaoNichtVerfuegbar: [],
    doku:         [],
    status:       'offen',
    szenarioId:   szenario ? szenario.id : null,
    alarmiert:    false,
    alarmiertTs:  null,
    gespraechStartTs: null
  };

  einsatzDokuInterneintrag(einsatz, `Einsatz angelegt${szenario ? ' – Szenario ' + szenario.id : ''}`);
  STATE.einsaetze.push(einsatz);
  renderEinsatzliste();
  if (window.syncEinsaetze) syncEinsaetze();
  if (autoOeffnen) einsatzOeffnen(einsatz.id);

  prueferLog('info', `Neuer Einsatz ${rnkr}`);
  STATE.simulation.letzteAktion = Date.now();
  return einsatz;
}

function einsatzartAusKategorie(kat) {
  const map = {
    'Krankentransport': 'KT', 'Bergeinsatz': 'BRG',
    'Wassereinsatz': 'WS', 'Sonderlage': 'SL'
  };
  return map[kat] || 'RD';
}

function einsatzDokuInterneintrag(einsatz, text) {
  einsatz.doku.push({ ts: zeitStempel(), wer: 'SYS', text, ki: false });
}

function setzeFeld(id, wert) {
  const el = document.getElementById(id);
  if (el) el.value = wert ?? '';
}

function leseFeld(id, fallback = '') {
  const el = document.getElementById(id);
  return el ? el.value : fallback;
}

function einsatzOeffnen(id) {
  const einsatz = STATE.einsaetze.find(e => e.id === id);
  if (!einsatz) return;
  STATE.aktiverEinsatz = id;

  setzeFeld('f-adresse',      einsatz.adresse);
  setzeFeld('f-etage',        einsatz.etage);
  setzeFeld('f-prioritaet',   einsatz.prioritaet || 'B1');
  setzeFeld('f-stichwort',    einsatz.stichwort);
  setzeFeld('f-einsatzart',   einsatz.einsatzart || 'RD');
  setzeFeld('f-patient',      einsatz.patient);
  setzeFeld('f-alter',        einsatz.alter);
  setzeFeld('f-geschlecht',   einsatz.geschlecht || '-');
  setzeFeld('f-zielort',      einsatz.zielort);
  setzeFeld('f-ziel-station', einsatz.zielStation);

  const rnkrEl = document.getElementById('em-rnkr');
  if (rnkrEl) rnkrEl.textContent = `${einsatz.rnkr} · ${einsatz.status}`;

  renderAaoChips(einsatz);

  document.querySelectorAll('.einsatz-row').forEach(r => r.classList.remove('active'));
  const row = document.querySelector(`[data-einsatz-id="${id}"]`);
  if (row) row.classList.add('active');
}

function einsatzSpeichern(still = false) {
  if (!STATE.aktiverEinsatz) return;
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;

  einsatz.adresse     = leseFeld('f-adresse', einsatz.adresse);
  einsatz.etage       = leseFeld('f-etage', einsatz.etage);
  einsatz.prioritaet  = leseFeld('f-prioritaet', einsatz.prioritaet);
  einsatz.stichwort   = leseFeld('f-stichwort', einsatz.stichwort);
  einsatz.einsatzart  = leseFeld('f-einsatzart', einsatz.einsatzart);
  einsatz.patient     = leseFeld('f-patient', einsatz.patient);
  einsatz.alter       = leseFeld('f-alter', einsatz.alter);
  einsatz.geschlecht  = leseFeld('f-geschlecht', einsatz.geschlecht);
  einsatz.zielort     = leseFeld('f-zielort', einsatz.zielort);
  einsatz.zielStation = leseFeld('f-ziel-station', einsatz.zielStation);

  renderEinsatzliste();
  STATE.simulation.letzteAktion = Date.now();
  if (window.syncEinsaetze) syncEinsaetze();
  if (!still) prueferLog('info', `Einsatz ${einsatz.rnkr} gespeichert`);
}

function einsatzAbschliessen() {
  if (!STATE.aktiverEinsatz) return;
  einsatzSpeichern(true);
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;

  einsatz.status = 'abgeschlossen';
  einsatzDokuInterneintrag(einsatz, `Abgeschlossen durch ${STATE.user?.kuerzel || '–'}`);
  prueferLog('good', `Einsatz ${einsatz.rnkr} abgeschlossen`);

  STATE.listenFilter = 'abgeschlossen';
  aktualisiereListenTabs();
  renderEinsatzliste();
  einsatzOeffnen(einsatz.id);
  if (window.syncEinsaetze) syncEinsaetze();
}

function einsatzStornieren() {
  if (!STATE.aktiverEinsatz) return;
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;
  if (einsatz.status === 'storniert') return;

  // Alle gebundenen Fahrzeuge freigeben
  [...einsatz.aao].forEach(kennung => fahrzeugFreigeben(kennung, einsatz, 'Einsatz storniert'));

  einsatz.status = 'storniert';
  einsatz.alarmiert = false;
  einsatzDokuInterneintrag(einsatz, `Einsatz storniert durch ${STATE.user?.kuerzel || '–'}`);
  prueferLog('warn', `Einsatz ${einsatz.rnkr} storniert`);

  STATE.listenFilter = 'storniert';
  aktualisiereListenTabs();
  renderEinsatzliste();
  einsatzOeffnen(einsatz.id);
  if (window.syncEinsaetze) syncEinsaetze();
}

// ============================================================
// AAO
// ============================================================
function renderAaoChips(einsatz) {
  const container = document.getElementById('aao-chips');
  if (!container) return;
  container.innerHTML = '';

  (einsatz.aao || []).forEach((kennung, idx) => {
    const em = STATE.einsatzmittel.find(e => e.kennung === kennung);
    const unterwegs = em && em.einsatzId === einsatz.id;
    const chip = document.createElement('div');
    chip.className = 'aao-chip' + (unterwegs ? ' unterwegs' : '');
    chip.innerHTML = `<span>${kennung}</span>` +
      (unterwegs
        ? `<button class="chip-remove" title="Auftrag stornieren – Fahrzeug wird frei"
             onclick="event.stopPropagation();auftragStornieren('${kennung}')">⨯</button>`
        : `<button class="chip-remove" title="Aus AAO entfernen"
             onclick="event.stopPropagation();aaoEntfernen(${idx})">✕</button>`);
    container.appendChild(chip);
  });

  (einsatz.aaoNichtVerfuegbar || []).forEach(label => {
    const chip = document.createElement('div');
    chip.className = 'aao-chip disabled';
    chip.title = 'Vorgeschlagen, aber kein Mittel dieses Typs frei';
    chip.innerHTML = `<span>${label}</span>`;
    container.appendChild(chip);
  });
}

function aaoHinzufuegen() {
  const sel = document.getElementById('aao-select-em');
  if (!sel || !sel.value) return;
  if (!STATE.aktiverEinsatz) { aaoHint('Zuerst einen Einsatz öffnen'); return; }

  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;

  const em = STATE.einsatzmittel.find(e => e.kennung === sel.value);
  if (em && !emVerfuegbar(em)) {
    aaoHint(`${sel.value} nicht verfügbar (Status ${em.status})`);
    sel.value = '';
    return;
  }
  if (!einsatz.aao.includes(sel.value)) {
    einsatz.aao.push(sel.value);
    renderAaoChips(einsatz);
    if (window.syncEinsaetze) syncEinsaetze();
  }
  sel.value = '';
  STATE.simulation.letzteAktion = Date.now();
}

function aaoEntfernen(idx) {
  if (!STATE.aktiverEinsatz) return;
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;
  einsatz.aao.splice(idx, 1);
  renderAaoChips(einsatz);
  if (window.syncEinsaetze) syncEinsaetze();
}

// Einzelnen Auftrag stornieren: Fahrzeug wird sofort frei und kann anders disponiert werden
function auftragStornieren(kennung) {
  if (!STATE.aktiverEinsatz) return;
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;

  fahrzeugFreigeben(kennung, einsatz, 'Auftrag storniert');
  einsatz.aao = einsatz.aao.filter(k => k !== kennung);

  renderAaoChips(einsatz);
  renderEinsatzliste();
  aaoHint(`${kennung} storniert – Fahrzeug wieder frei`);
  prueferLog('warn', `${kennung} von Einsatz ${einsatz.rnkr} abgezogen`);
  if (window.syncEinsaetze) syncEinsaetze();
}

function fahrzeugFreigeben(kennung, einsatz, grund) {
  const em = STATE.einsatzmittel.find(e => e.kennung === kennung);
  if (!em) return;
  (em.fahrtTimers || []).forEach(t => clearTimeout(t));
  em.fahrtTimers = [];
  em.einsatzId = null;
  if (einsatz) einsatzDokuInterneintrag(einsatz, `${kennung}: ${grund}`);
  setEmStatus(kennung, '00', '');
}

function aaoVorschlag() {
  if (!STATE.aktiverEinsatz) { aaoHint('Zuerst einen Einsatz öffnen'); return; }
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;

  const sz = STATE.szenarien.find(s => s.id === einsatz.szenarioId);
  if (!sz || !sz.aao) { aaoHint('Kein hinterlegter AAO-Vorschlag für diesen Einsatz'); return; }

  const vorschlag = [...(sz.aao.primaer || [])];
  const zugewiesen = [];
  const nichtVerfuegbar = [];
  const FIX = { NEF: '10-101', EL: '20-701', C6: 'C6', HELI: 'C6', KIT: 'KIT-SBG' };

  vorschlag.forEach(v => {
    let kennung = null;
    if (FIX[v]) {
      const em = STATE.einsatzmittel.find(e => e.kennung === FIX[v]);
      kennung = (emVerfuegbar(em) && !zugewiesen.includes(em.kennung)) ? em.kennung : null;
    } else {
      const typ = (v === 'First Responder') ? 'FR' : v;
      kennung = zufallVerfuegbaresEm(typ, zugewiesen);
      if (!kennung) {
        const treffer = STATE.einsatzmittel.find(e =>
          (e.kennung === v || e.name.includes(v)) && emVerfuegbar(e) && !zugewiesen.includes(e.kennung));
        kennung = treffer ? treffer.kennung : null;
      }
    }
    if (kennung) zugewiesen.push(kennung); else nichtVerfuegbar.push(v);
  });

  einsatz.aao = zugewiesen;
  einsatz.aaoNichtVerfuegbar = nichtVerfuegbar;

  aaoHint(nichtVerfuegbar.length
    ? `Vorschlag ${vorschlag.join(', ')} – nicht frei: ${nichtVerfuegbar.join(', ')}`
    : `Vorschlag: ${vorschlag.join(', ')}`);

  renderAaoChips(einsatz);
  prueferLog('info', `AAO-Vorschlag ${einsatz.rnkr}: ${zugewiesen.join(', ') || 'nichts frei'}`);
  if (window.syncEinsaetze) syncEinsaetze();
}

function zufallVerfuegbaresEm(typ, ausschluss = []) {
  const frei = STATE.einsatzmittel.filter(em =>
    em.typ === typ && emVerfuegbar(em) && !ausschluss.includes(em.kennung));
  return frei.length ? frei[Math.floor(Math.random() * frei.length)].kennung : null;
}

// ============================================================
// DISPONIEREN
// ============================================================
function disponieren() {
  if (!STATE.aktiverEinsatz) return;
  einsatzSpeichern(true);
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;

  if (einsatz.status === 'storniert' || einsatz.status === 'abgeschlossen') {
    aaoHint('Einsatz ist bereits beendet');
    return;
  }
  if (!einsatz.aao || einsatz.aao.length === 0) {
    aaoHint('Keine Einsatzmittel in der AAO');
    if (window.zeigeKurzToast) zeigeKurzToast('Keine Einsatzmittel in der AAO', 'red');
    return;
  }

  einsatz.alarmiert   = true;
  einsatz.alarmiertTs = Date.now();
  einsatz.status      = 'disponiert';

  einsatzDokuInterneintrag(einsatz, `Disponiert um ${zeitStempel()} – ${einsatz.aao.join(', ')}`);
  einsatz.aao.forEach(kennung => starteFahrtZyklus(kennung, einsatz));

  STATE.listenFilter = 'disponiert';
  aktualisiereListenTabs();
  renderEinsatzliste();
  einsatzOeffnen(einsatz.id);

  prueferLog('good', `Disponiert: ${einsatz.rnkr} ${einsatz.prioritaet} – ${einsatz.aao.join(', ')}`);
  STATE.simulation.letzteAktion = Date.now();
  if (window.syncEinsaetze) syncEinsaetze();
}

// ---- FAHRT-ZYKLUS ----
// Statuswechsel setzen die Zeiten selbst und erzeugen KEINE Funkmeldung.
function starteFahrtZyklus(kennung, einsatz) {
  const em = STATE.einsatzmittel.find(e => e.kennung === kennung);
  if (!em) return;
  if (em.einsatzId && em.einsatzId !== einsatz.id) {
    einsatzDokuInterneintrag(einsatz, `${kennung} nicht verfügbar (anderweitig gebunden)`);
    return;
  }

  em.einsatzId = einsatz.id;
  (em.fahrtTimers || []).forEach(t => clearTimeout(t));
  em.fahrtTimers = [];

  const anfahrt   = getFahrtzeit(em.typ);
  const vorOrt    = zufallZahl(15, 35);
  const zumZiel   = getFahrtzeit(em.typ);
  const adresse   = einsatz.adresse || 'Einsatzort';

  const plane = (sek, fn) => {
    const t = setTimeout(() => {
      // Auftrag könnte zwischenzeitlich storniert worden sein
      if (em.einsatzId !== einsatz.id) return;
      fn();
    }, sek * 1000);
    em.fahrtTimers.push(t);
    STATE.simulation.eskalationsTimer.push(t);
  };

  setEmStatus(kennung, '01', adresse);
  plane(zufallZahl(30, 90),                        () => setEmStatus(kennung, '02', adresse));
  plane(anfahrt * 60,                              () => setEmStatus(kennung, '03', adresse));
  plane((anfahrt + vorOrt) * 60,                   () => setEmStatus(kennung, '04', einsatz.zielort || 'Zielort'));
  plane((anfahrt + vorOrt + zumZiel) * 60,         () => setEmStatus(kennung, einsatz.zielort ? '05' : '07', einsatz.zielort || ''));
  plane((anfahrt + vorOrt + zumZiel + 10) * 60,    () => {
    em.einsatzId = null;
    setEmStatus(kennung, '00', '');
  });
}

// Zentral: Status setzt die zugehörige Zeitspalte automatisch.
function setEmStatus(kennung, status, adresse) {
  const em = STATE.einsatzmittel.find(e => e.kennung === kennung);
  if (!em) return;

  em.status = status;
  if (adresse !== undefined) em.aktuelleAdresse = adresse;
  em.zeitStatus = zeitStempel();

  switch (status) {
    case '01': em.zeitAus = em.zeitEEO = em.zeitAEO = em.zeitEZO = null; break;
    case '02': em.zeitAus = zeitStempel(); break;   // ausgerückt
    case '03': em.zeitEEO = zeitStempel(); break;   // Eintreffen Einsatzort
    case '04': em.zeitAEO = zeitStempel(); break;   // Abfahrt Einsatzort
    case '05': em.zeitEZO = zeitStempel(); break;   // Eintreffen Zielort
    case '00': case '06':
      em.zeitAus = em.zeitEEO = em.zeitAEO = em.zeitEZO = null;
      em.aktuelleAdresse = '';
      break;
  }

  // Doku im zugehörigen Einsatz – aber kein Funkspruch.
  const einsatz = STATE.einsaetze.find(e => e.id === em.einsatzId);
  if (einsatz && ['02', '03', '04', '05'].includes(status)) {
    const text = {
      '02': `${kennung} ausgerückt`,
      '03': `${kennung} am Einsatzort`,
      '04': `${kennung} Abfahrt Einsatzort → ${einsatz.zielort || 'Zielort'}`,
      '05': `${kennung} am Zielort ${einsatz.zielort || ''}`
    }[status];
    einsatzDokuInterneintrag(einsatz, `${text} (${zeitStempel()})`);
  }

  renderStatusScreen();
  if (window.broadcastEmDiff) broadcastEmDiff(em);
}

// ============================================================
// EINSATZLISTE MIT TABS
// ============================================================
function initListenTabs() {
  document.querySelectorAll('.einsatz-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      STATE.listenFilter = tab.dataset.liste;
      aktualisiereListenTabs();
      renderEinsatzliste();
    });
  });
  aktualisiereListenTabs();
}

function aktualisiereListenTabs() {
  document.querySelectorAll('.einsatz-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.liste === STATE.listenFilter);
  });
}

function einsaetzeNachStatus(status) {
  if (status === 'offen')  return STATE.einsaetze.filter(e => e.status === 'offen');
  return STATE.einsaetze.filter(e => e.status === status);
}

function renderEinsatzliste() {
  ['offen', 'disponiert', 'abgeschlossen', 'storniert'].forEach(s => {
    const el = document.getElementById('zahl-' + s);
    if (el) el.textContent = einsaetzeNachStatus(s).length;
  });

  const tbody = document.getElementById('einsatzliste-tbody');
  if (!tbody) return;

  const liste = einsaetzeNachStatus(STATE.listenFilter)
    .sort((a, b) => b.id - a.id);

  if (liste.length === 0) {
    tbody.innerHTML = `<tr class="einsatz-empty-row"><td colspan="7">Keine Einsätze in „${STATE.listenFilter}“</td></tr>`;
    return;
  }

  tbody.innerHTML = liste.map(e => {
    const dringend = istEinsatzfahrt(e.prioritaet) && e.status === 'offen';
    return `
    <tr class="einsatz-row${STATE.aktiverEinsatz === e.id ? ' active' : ''}${dringend ? ' einsatzfahrt' : ''}"
        data-einsatz-id="${e.id}" onclick="einsatzOeffnen(${e.id})">
      <td class="el-zeit">${e.zeitErstellt}</td>
      <td class="el-rnkr">${e.rnkr}</td>
      <td><span class="prio-badge prio-${e.prioritaet}">${e.prioritaet}</span></td>
      <td>${e.stichwort || '–'}</td>
      <td class="el-ort">${e.adresse || '–'}</td>
      <td class="el-mittel">${(e.aao || []).slice(0, 3).join(', ')}${e.aao?.length > 3 ? '…' : ''}</td>
      <td><button class="btn-small" onclick="event.stopPropagation();einsatzOeffnen(${e.id})">Öffnen</button></td>
    </tr>`;
  }).join('');
}

// ============================================================
// FUNK
// ============================================================
function initFunkHandlers() {
  const input = document.getElementById('funk-input');
  const btn   = document.getElementById('btn-funk-send');
  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') sendFunk(); });
  if (btn) btn.addEventListener('click', sendFunk);
}

function sendFunk() {
  const input = document.getElementById('funk-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  addFunkMsg('outgoing', `LEITSTELLE ${STATE.user?.kuerzel || ''}`.trim(), text);
  input.value = '';
  STATE.simulation.letzteAktion = Date.now();
  prueferLog('info', `Funk ab: "${text.slice(0, 50)}"`);
  generiereKIFunkAntwort(text);
}

function addFunkMsg(typ, sender, text, opts = {}) {
  const container = document.getElementById('funk-messages');
  if (container) {
    const div = document.createElement('div');
    div.className = `funk-msg ${typ}`;
    div.innerHTML = `<span class="funk-msg-time">${zeitStempel()}</span>` +
      `<span class="funk-msg-sender">${sender}</span>` +
      `<span class="funk-msg-text">${text}</span>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  if (typeof LEITTRAIN !== 'undefined') {
    LEITTRAIN.funkVerlauf.push({ ts: zeitStempel(), sender, text, typ });
  }
  if (!opts.relayed && window.broadcastFunk) broadcastFunk(typ, sender, text);
}

function ermittleFunkSender() {
  const unterwegs = STATE.einsatzmittel.filter(em => ['02', '03', '04', '05'].includes(em.status));
  if (unterwegs.length) return unterwegs[Math.floor(Math.random() * unterwegs.length)].kennung;
  const besetzt = STATE.einsatzmittel.filter(em => em.besetzt);
  return besetzt.length ? besetzt[Math.floor(Math.random() * besetzt.length)].kennung : 'EINHEIT';
}

async function generiereKIFunkAntwort(disponentText) {
  const sender = ermittleFunkSender();
  const em = STATE.einsatzmittel.find(e => e.kennung === sender);
  const einsatz = em ? STATE.einsaetze.find(e => e.id === em.einsatzId) : null;

  try {
    const resp = await fetch('/api/leittrain/funk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender,
        pruefungsmodus: typeof LEITTRAIN !== 'undefined' && LEITTRAIN.sitzung === 'pruefung',
        lage: {
          offeneEinsaetze: einsaetzeNachStatus('offen').length,
          emStatus: STATE.einsatzmittel.slice(0, 12).map(e => `${e.kennung}(${e.status})`).join(', '),
          drucklevel: STATE.simulation.drucklevel
        },
        einsatz: einsatz ? {
          stichwort: einsatz.stichwort, adresse: einsatz.adresse, prioritaet: einsatz.prioritaet
        } : null,
        prompt: disponentText,
        verlauf: [{ rolle: 'disponent', text: disponentText }]
      })
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.text) {
        setTimeout(() => addFunkMsg('incoming', sender, data.text), zufallZahl(2, 6) * 1000);
        return;
      }
    }
  } catch (e) { /* Fallback unten */ }

  setTimeout(() => addFunkMsg('incoming', sender, 'Verstanden, Leitstelle.'), zufallZahl(2, 5) * 1000);
}

// Spontane Anliegen der Fahrzeuge – passend zum Status, nie ein reiner Statuswechsel.
function spontanerFunkspruch() {
  if (!STATE.simulation.aktiv) return;

  const kandidaten = STATE.einsatzmittel.filter(em => em.besetzt);
  if (!kandidaten.length) return;
  const em = kandidaten[Math.floor(Math.random() * kandidaten.length)];

  let pool;
  if (['00', '06'].includes(em.status))      pool = FUNKSPRUECHE.frei;
  else if (em.status === '02')               pool = FUNKSPRUECHE.anfahrt;
  else if (em.status === '03')               pool = FUNKSPRUECHE.einsatzort;
  else if (['04', '05'].includes(em.status)) pool = FUNKSPRUECHE.transport;
  else return;

  const text = pool[Math.floor(Math.random() * pool.length)];
  addFunkMsg('incoming', em.kennung, `${em.kennung} an Leitstelle – ${text}`);
  prueferLog('info', `Funkanliegen von ${em.kennung}`);
}

// ============================================================
// SIMULATION
// ============================================================
function startSimulation() {
  if (STATE.simulation.aktiv) return;
  STATE.simulation.aktiv        = true;
  STATE.simulation.startzeit    = Date.now();
  STATE.simulation.drucklevel   = 1;
  STATE.simulation.letzteAktion = Date.now();

  if (typeof LEITTRAIN !== 'undefined') {
    LEITTRAIN.betriebsart   = document.getElementById('pruefer-betriebsart')?.value || 'notruf';
    LEITTRAIN.schwierigkeit = parseInt(document.getElementById('pruefer-schwierigkeit')?.value || '3', 10);
    leittrainSetzeModus(LEITTRAIN.betriebsart === 'notruf' ? 'Notrufannahme' : 'Disposition', 'laufend');
  }

  if (window.applySimState) applySimState(true);
  if (window.broadcastSim) broadcastSim(true);
  if (window.zeigeKurzToast) zeigeKurzToast('Übung gestartet', 'green');
  prueferLog('good', 'Übung gestartet');

  setTimeout(spieleSzenarioEin, zufallZahl(5, 10) * 1000);
  STATE.simulation.druckLoop = setInterval(aktualisiereDrucklevel, 20000);
  STATE.simulation.funkLoop  = setInterval(() => {
    if (Math.random() < 0.35) spontanerFunkspruch();
  }, 45000);

  const s = document.getElementById('btn-uebung-start');
  const p = document.getElementById('btn-uebung-stop');
  if (s) s.disabled = true;
  if (p) p.disabled = false;
}

function stoppSimulation() {
  STATE.simulation.aktiv = false;
  clearInterval(STATE.simulation.druckLoop);
  clearInterval(STATE.simulation.funkLoop);
  STATE.simulation.eskalationsTimer.forEach(t => clearTimeout(t));
  STATE.simulation.eskalationsTimer = [];

  if (window.applySimState) applySimState(false);
  if (window.broadcastSim) broadcastSim(false);
  if (window.zeigeKurzToast) zeigeKurzToast('Übung beendet', 'red');
  if (typeof LEITTRAIN !== 'undefined') leittrainSetzeModus('Debriefing', 'beendet');
  prueferLog('info', 'Übung beendet');

  const s = document.getElementById('btn-uebung-start');
  const p = document.getElementById('btn-uebung-stop');
  if (s) s.disabled = false;
  if (p) p.disabled = true;
}

function aktualisiereDrucklevel() {
  if (!STATE.simulation.aktiv) return;

  const offen = einsaetzeNachStatus('offen').length;
  const sekSeitAktion = (Date.now() - (STATE.simulation.letzteAktion || Date.now())) / 1000;
  const alt = STATE.simulation.drucklevel;

  if (offen === 0 && sekSeitAktion > 25)      STATE.simulation.drucklevel = Math.min(5, alt + 1);
  else if (offen >= 5)                        STATE.simulation.drucklevel = 5;
  else if (offen >= 3)                        STATE.simulation.drucklevel = Math.min(5, alt + 1);
  else if (offen <= 1 && sekSeitAktion < 30)  STATE.simulation.drucklevel = Math.max(1, alt - 1);

  if (STATE.simulation.drucklevel !== alt) {
    prueferLog('info', `Drucklevel ${STATE.simulation.drucklevel}/5 (${offen} offen)`);
  }

  if (offen < 6) setTimeout(spieleSzenarioEin, berechnePause());
}

function berechnePause() {
  const p = { 1: [60, 90], 2: [40, 60], 3: [25, 40], 4: [15, 25], 5: [8, 15] };
  const [min, max] = p[STATE.simulation.drucklevel] || p[1];
  return zufallZahl(min, max) * 1000;
}

// Ressourcenbewusst: keine Häufung von Einsätzen, für die kein Mittel frei ist.
function szenarioDisponierbar(sz) {
  const primaer = sz.aao?.primaer || [];
  const brauchtNotarzt = primaer.includes('NEF') || primaer.includes('C6') || primaer.includes('HELI');

  if (brauchtNotarzt) {
    const notarztFrei = freieAnzahl('NEF') + freieAnzahl('HELI');
    if (notarztFrei === 0) {
      // Ein einzelner nicht bedienbarer Notarzteinsatz ist realistisch – ein Stapel nicht.
      const offeneNotarzt = STATE.einsaetze.filter(e => {
        if (e.status !== 'offen') return false;
        return ['A1', 'A3'].includes(e.prioritaet);
      }).length;
      if (offeneNotarzt >= 1) return false;
    }
  }

  // Bodengebundenes Mittel muss grundsätzlich in Sicht sein
  const brauchtRtw = primaer.includes('RTW');
  const brauchtKtw = primaer.includes('KTW');
  if (brauchtRtw && freieAnzahl('RTW') === 0 && freieAnzahl('KTW') === 0) {
    const offeneOhneMittel = STATE.einsaetze.filter(e => e.status === 'offen').length;
    if (offeneOhneMittel >= 2) return false;
  }
  if (brauchtKtw && freieAnzahl('KTW') === 0 && freieAnzahl('RTW') === 0) return false;

  return true;
}

function spieleSzenarioEin() {
  if (!STATE.simulation.aktiv) return;

  let ungespielt = STATE.szenarien.filter(s => !STATE.simulation.szenarioGespielt.includes(s.id));
  if (!ungespielt.length) {
    STATE.simulation.szenarioGespielt = [];
    ungespielt = STATE.szenarien;
  }
  if (!ungespielt.length) return;

  // Drucklevel gewichtet die Dringlichkeit
  let kandidaten = ungespielt;
  if (STATE.simulation.drucklevel >= 4) {
    const dringend = ungespielt.filter(s => istEinsatzfahrt(s.prioritaet));
    if (dringend.length) kandidaten = dringend;
  } else if (STATE.simulation.drucklevel === 1) {
    const ruhig = ungespielt.filter(s => !istEinsatzfahrt(s.prioritaet));
    if (ruhig.length) kandidaten = ruhig;
  }

  // Ressourcenlage berücksichtigen
  const machbar = kandidaten.filter(szenarioDisponierbar);
  if (machbar.length) kandidaten = machbar;
  else {
    prueferLog('warn', 'Kein Szenario eingespielt – keine Mittel frei');
    return;
  }

  const sz = kandidaten[Math.floor(Math.random() * Math.min(kandidaten.length, 10))];
  STATE.simulation.szenarioGespielt.push(sz.id);

  const infoDiv = document.getElementById('pruefer-szenario-info');
  if (infoDiv) {
    infoDiv.innerHTML = `<strong>${sz.id}</strong> – ${sz.titel}<br>
      <span class="sz-meta">${sz.kategorie} · ${sz.prioritaet}</span><br>
      <span class="sz-meta">AAO erwartet: ${(sz.aao?.primaer || []).join(', ') || '–'}</span>`;
  }

  // Mit Notrufannahme klingelt das Telefon; sonst landet der Einsatz direkt in der Liste.
  if (typeof LEITTRAIN !== 'undefined' && LEITTRAIN.betriebsart === 'notruf') {
    eingehenderNotruf(sz);
    planEskalationen(sz, null);
  } else {
    const einsatz = neuerEinsatz(sz, false);
    planEskalationen(sz, einsatz);
  }
  prueferLog('info', `Szenario ${sz.id} eingespielt`);
}

function planEskalationen(sz, einsatz) {
  if (!sz.eskalationen || !sz.eskalationen.length) return;

  sz.eskalationen.forEach(esk => {
    const match = String(esk.trigger || '').match(/nach (\d+) Min/);
    const minuten = match ? parseInt(match[1], 10) : 15;

    const timer = setTimeout(() => {
      if (!STATE.simulation.aktiv) return;

      const ziel = einsatz
        ? STATE.einsaetze.find(e => e.id === einsatz.id)
        : STATE.einsaetze.find(e => e.szenarioId === sz.id);

      const zugeteilt = ziel && ziel.aao?.length
        ? STATE.einsatzmittel.find(em => ziel.aao.includes(em.kennung))
        : null;
      const sender = (zugeteilt || STATE.einsatzmittel.find(em => ['02', '03'].includes(em.status)))?.kennung || 'EINHEIT';

      addFunkMsg('incoming', sender, esk.ereignis);
      prueferLog('warn', `Eskalation: ${String(esk.ereignis).slice(0, 60)}`);

      if (ziel) {
        ziel.doku.push({ ts: zeitStempel(), wer: sender, text: esk.ereignis, ki: true });
      }
    }, minuten * 60 * 1000);

    STATE.simulation.eskalationsTimer.push(timer);
  });
}

// ============================================================
// PRÜFER-PANEL
// ============================================================
function initPrueferPanel() {
  const toggle = document.getElementById('pruefer-toggle-btn');
  if (toggle) toggle.addEventListener('click', () => {
    const overlay = document.getElementById('pruefer-overlay');
    if (overlay) overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
  });

  const close = document.getElementById('btn-pruefer-close');
  if (close) close.addEventListener('click', () => {
    document.getElementById('pruefer-overlay').style.display = 'none';
  });

  const start = document.getElementById('btn-uebung-start');
  if (start) start.addEventListener('click', startSimulation);
  const stop = document.getElementById('btn-uebung-stop');
  if (stop) stop.addEventListener('click', stoppSimulation);

  const filter = document.getElementById('pruefer-filter-kat');
  if (filter) filter.addEventListener('change', renderPrueferSzenarioListe);

  const schwer = document.getElementById('pruefer-schwierigkeit');
  if (schwer) schwer.addEventListener('change', () => {
    if (typeof LEITTRAIN !== 'undefined') LEITTRAIN.schwierigkeit = parseInt(schwer.value, 10);
  });

  const betrieb = document.getElementById('pruefer-betriebsart');
  if (betrieb) betrieb.addEventListener('change', () => {
    if (typeof LEITTRAIN !== 'undefined') LEITTRAIN.betriebsart = betrieb.value;
  });

  renderPrueferSzenarioListe();
}

function renderPrueferSzenarioListe() {
  const filterEl = document.getElementById('pruefer-filter-kat');
  const listeEl  = document.getElementById('pruefer-szenario-liste');
  if (!listeEl) return;

  const filter = filterEl ? filterEl.value : '';
  const gefiltert = filter ? STATE.szenarien.filter(s => s.kategorie === filter) : STATE.szenarien;

  listeEl.innerHTML = gefiltert.slice(0, 40).map(sz => `
    <div class="pruefer-sz-item" onclick="manuellSzenarioEinspielen('${sz.id}')">
      <span class="sz-id">${sz.id}</span>
      <span class="sz-title">${sz.titel}${sz.generiert ? ' ·neu' : ''}</span>
      <span class="prio-badge prio-${sz.prioritaet}">${sz.prioritaet}</span>
    </div>`).join('') || '<div class="sz-leer">Keine Szenarien geladen</div>';
}

function manuellSzenarioEinspielen(id) {
  const sz = STATE.szenarien.find(s => s.id === id);
  if (!sz) return;

  if (typeof LEITTRAIN !== 'undefined' && LEITTRAIN.betriebsart === 'notruf') {
    eingehenderNotruf(sz);
    planEskalationen(sz, null);
  } else {
    const einsatz = neuerEinsatz(sz, false);
    planEskalationen(sz, einsatz);
  }

  prueferLog('info', `Szenario ${sz.id} manuell eingespielt`);
  const overlay = document.getElementById('pruefer-overlay');
  if (overlay) overlay.style.display = 'none';
}

function prueferLog(typ, text, relayed = false) {
  const eintrag = { ts: zeitStempel(), typ, text };
  STATE.prueferLog.push(eintrag);
  if (!relayed && window.broadcastLog) broadcastLog(eintrag);

  const container = document.getElementById('pruefer-log');
  if (!container) return;
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-ts">${eintrag.ts}</span><span class="log-${typ}">${text}</span>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// zeitStempel, zufallZahl, getFahrtzeit, PRIORITAETEN, istEinsatzfahrt,
// konvertierePrio und FUNKSPRUECHE stammen aus data.js.
