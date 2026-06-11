// ============================================================
// app.js – Hauptlogik RK Salzburg Leitstellen Simulator
// ============================================================

// ---- GLOBALER STATE ----
const STATE = {
  user:           null,
  rolle:          null,
  einsaetze:      [],       // aktive Einsätze
  einsatzCounter: 0,
  aktiverEinsatz: null,     // aktuell geöffneter Einsatz
  einsatzmittel:  [],       // Live-Kopie der Einsatzmittel
  szenarien:      [],       // geladen aus szenarien.json
  simulation: {
    aktiv:        false,
    drucklevel:   1,        // 1-5
    letzteAktion: null,     // Timestamp letzte Disponent-Aktion
    aktiveSzenarien: [],    // gerade laufende Szenarien
    eskalationsTimer: [],   // aktive Timers
    szenarioGespielt: [],   // bereits gespielte IDs
    startzeit:    null
  },
  prueferLog:     [],
  funkKanal:      "Kanal 1 – RD Salzburg",
  apiKey:         null      // wird aus localStorage geholt falls vorhanden
};

// ---- INIT ----
document.addEventListener('DOMContentLoaded', () => {
  initEinsatzmittel();
  ladeSzenarien();
  initClock();
  initLoginHandlers();
});

function initEinsatzmittel() {
  STATE.einsatzmittel = EINSATZMITTEL_STAMM.map(em => ({ ...em, einsatzId: null, zeitStatus: null }));
}

async function ladeSzenarien() {
  try {
    const resp = await fetch('szenarien.json');
    const data = await resp.json();
    STATE.szenarien = data.szenarien;
  } catch(e) {
    console.warn('szenarien.json nicht geladen – Demo-Modus');
    STATE.szenarien = [];
  }
}

// ---- UHR ----
function initClock() {
  function tick() {
    const n = new Date();
    document.getElementById('clock').textContent = n.toTimeString().slice(0,8);
  }
  tick();
  setInterval(tick, 1000);
}

// ---- LOGIN ----
function initLoginHandlers() {
  const roleBtns = document.querySelectorAll('.role-btn');
  let aktuelleRolle = 'disponent';

  roleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      roleBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      aktuelleRolle = btn.dataset.role;
    });
  });

  document.getElementById('login-btn').addEventListener('click', () => login(aktuelleRolle));
  document.getElementById('login-pin').addEventListener('keydown', e => {
    if (e.key === 'Enter') login(aktuelleRolle);
  });
}

function login(rolle) {
  const nameInput = document.getElementById('login-name').value.trim();
  const pin       = document.getElementById('login-pin').value.trim();

  // Pin und Rolle prüfen
  const benutzer = BENUTZER.find(b =>
    b.pin === pin &&
    b.rolle === rolle &&
    (nameInput === '' || b.name.toLowerCase().includes(nameInput.toLowerCase()) ||
     b.kuerzel.toLowerCase() === nameInput.toLowerCase())
  );

  if (!benutzer && !(rolle === 'disponent' && pin === '1234') && !(rolle === 'pruefer' && pin === '9999')) {
    document.getElementById('login-error').style.display = 'block';
    return;
  }

  const user = benutzer || { name: nameInput || 'Disponent', kuerzel: nameInput.slice(0,2).toUpperCase() || 'XX', rolle };
  STATE.user = user;
  STATE.rolle = user.rolle;

  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('current-user').textContent = user.name || user.kuerzel;

  renderStatusScreen();
  initMenuHandlers();
  initEinsatzHandlers();
  initFunkHandlers();

  if (user.rolle === 'pruefer') {
    document.getElementById('pruefer-toggle-btn').style.display = 'flex';
    initPrueferPanel();
  }

  // Zustand von bereits laufenden Tabs übernehmen (z.B. Prüfer hat schon Einsätze angelegt)
  setTimeout(() => { if (window.syncHello) syncHello(); }, 300);
}

// ---- MENÜ ----
function initMenuHandlers() {
  document.querySelectorAll('.menu-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.menu-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.window;
      const layout = document.getElementById('main-layout');
      layout.className = 'main-layout';
      if (mode === 'status') layout.classList.add('mode-status');
      if (mode === 'einsatz') layout.classList.add('mode-einsatz');
    });
  });

  document.getElementById('btn-logout').addEventListener('click', () => {
    location.reload();
  });

  // Pop-out Statusschirm
  document.getElementById('btn-popout-status').addEventListener('click', () => {
    const popup = window.open('', 'statusschirm', 'width=900,height=700,menubar=no,toolbar=no,scrollbars=yes');
    popup.document.write(`<!DOCTYPE html><html><head>
      <meta charset="UTF-8">
      <title>Statusschirm – RK Salzburg</title>
      <link rel="stylesheet" href="style.css">
      </head><body style="overflow:auto;height:auto">
      <div style="padding:6px">
        <div class="panel-header"><span class="panel-title">Statusschirm – Einsatzmittel</span></div>
        <div id="status-screen-popup" class="status-screen" style="height:auto;overflow:visible"></div>
      </div>
      <script src="data.js"></script>
      <script>
        function updateStatus(html) {
          document.getElementById('status-screen-popup').innerHTML = html;
        }
      </scr` + `ipt></body></html>`);
    popup.document.close();
    // Interval für Updates
    setInterval(() => {
      if (!popup.closed) {
        const html = document.getElementById('status-screen').innerHTML;
        try { popup.updateStatus(html); } catch(e) {}
      }
    }, 2000);
  });
}

// ---- STATUSSCHIRM RENDERN ----
function renderStatusScreen() {
  const container = document.getElementById('status-screen');
  if (!container) return;
  const gruppen = {};

  STATE.einsatzmittel.forEach(em => {
    if (!gruppen[em.gruppe]) gruppen[em.gruppe] = [];
    gruppen[em.gruppe].push(em);
  });

  let html = '';
  for (const [gruppenName, einheiten] of Object.entries(gruppen)) {
    html += `<div class="status-group">`;
    html += `<div class="status-group-header">${gruppenName}</div>`;
    html += `<table class="status-table">
      <thead><tr>
        <th>Kennung</th>
        <th>Typ</th>
        <th>Status</th>
        <th>Kompetenzen</th>
        <th>Aus</th>
        <th>E:EO</th>
        <th>A:EO</th>
        <th>E:ZO</th>
        <th>Adresse / Info</th>
      </tr></thead>
      <tbody>`;

    einheiten.forEach(em => {
      const statusDef = STATUS_DEFINITIONEN[em.status] || STATUS_DEFINITIONEN["00"];
      const sNr = em.status.padStart(2,'0');
      const clickHandler = STATE.rolle === 'pruefer' ? `emStatusKlick('${em.kennung}')` : `emAaoZusammenfassen('${em.kennung}')`;
      html += `<tr class="status-row s-${sNr}" data-kennung="${em.kennung}" onclick="${clickHandler}" style="cursor: pointer;">
        <td><span class="em-kennung">${em.kennung}</span></td>
        <td><span class="em-typ">${em.typ}</span></td>
        <td><span class="status-badge badge-${sNr}">${sNr}</span> <span style="font-size:10px;color:var(--text-secondary)">${statusDef.text}</span></td>
        <td style="font-size:10px;color:var(--text-dim)">${em.kompetenzen.join(' ')}</td>
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

  const totalEl = document.getElementById('em-total');
  if (totalEl) {
    totalEl.textContent =
      `${STATE.einsatzmittel.filter(e => e.besetzt).length} Einsatzmittel`;
  }

  aktualisiereAaoSelect();
}

function emStatusKlick(kennung) {
  // Einsatzmittel-Status manuell durchschalten (nur Prüfer)
  if (STATE.rolle !== 'pruefer') return;
  const em = STATE.einsatzmittel.find(e => e.kennung === kennung);
  if (!em) return;
  const statusKeys = Object.keys(STATUS_DEFINITIONEN);
  const aktIdx = statusKeys.indexOf(em.status);
  setEmStatus(kennung, statusKeys[(aktIdx + 1) % statusKeys.length]);
}

// Verfügbar = einsatzbereit, besetzt und keinem Einsatz zugeteilt
function emVerfuegbar(em) {
  return !!em && em.besetzt && !em.einsatzId && (em.status === '00' || em.status === '06');
}

function aaoHint(text) {
  const hint = document.getElementById('aao-hint');
  if (hint) hint.textContent = text;
}

// Dropdown: bereits disponierte / nicht verfügbare Fahrzeuge ausgrauen
function aktualisiereAaoSelect() {
  const sel = document.getElementById('aao-select-em');
  if (!sel) return;
  Array.from(sel.options).forEach(opt => {
    if (!opt.value) return;
    const em = STATE.einsatzmittel.find(e => e.kennung === opt.value);
    if (em) opt.disabled = !emVerfuegbar(em);
  });
}

function emAaoZusammenfassen(kennung) {
  // Disponent: Klick auf die Kennung im Statusschirm übernimmt das Fahrzeug in die AAO
  if (!STATE.aktiverEinsatz) { aaoHint('Zuerst einen Einsatz öffnen'); return; }
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;
  const em = STATE.einsatzmittel.find(e => e.kennung === kennung);
  if (!emVerfuegbar(em)) {
    aaoHint(`${kennung} ist nicht verfügbar (Status ${em ? em.status : '?'})`);
    return;
  }
  if (!einsatz.aao.includes(kennung)) {
    einsatz.aao.push(kennung);
    renderAaoChips(einsatz.aao, einsatz.aaoNichtVerfuegbar);
    aaoHint(`${kennung} zur AAO hinzugefügt`);
    if (window.syncEinsaetze) syncEinsaetze();
  }
  STATE.simulation.letzteAktion = Date.now();
}

// ---- EINSATZ HANDLERS ----
function initEinsatzHandlers() {
  const btnNewEinsatz = document.getElementById('btn-new-einsatz');
  if (btnNewEinsatz) btnNewEinsatz.addEventListener('click', () => neuerEinsatz(null, true));

  const btnAlarmieren = document.getElementById('btn-alarmieren');
  if (btnAlarmieren) btnAlarmieren.addEventListener('click', alarmieren);

  const btnSave = document.getElementById('btn-einsatz-save');
  if (btnSave) btnSave.addEventListener('click', einsatzSpeichern);

  const btnAbschliessen = document.getElementById('btn-einsatz-abschliessen');
  if (btnAbschliessen) btnAbschliessen.addEventListener('click', einsatzAbschliessen);

  const btnAaoAdd = document.getElementById('btn-aao-add');
  if (btnAaoAdd) btnAaoAdd.addEventListener('click', aaoHinzufuegen);

  const btnAaoVorschlag = document.getElementById('btn-aao-vorschlag');
  if (btnAaoVorschlag) btnAaoVorschlag.addEventListener('click', aaoVorschlag);

  const dokuInput = document.getElementById('doku-input');
  if (dokuInput) {
    dokuInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') dokuEintrag();
    });
  }

  const btnDokuAdd = document.getElementById('btn-doku-add');
  if (btnDokuAdd) btnDokuAdd.addEventListener('click', dokuEintrag);
}

function neuerEinsatz(szenario = null, autoOeffnen = true) {
  STATE.einsatzCounter++;
  const jetzt = new Date();
  const rnkr = `${String(jetzt.getDate()).padStart(2,'0')}${String(jetzt.getMonth()+1).padStart(2,'0')}-${1000 + STATE.einsatzCounter}`;
  const einsatz = {
    id:         STATE.einsatzCounter,
    rnkr,
    zeitErstellt: zeitStempel(),
    erstelltTs: Date.now(),
    stichwort:  szenario ? szenario.stichwort : '',
    prioritaet: szenario ? szenario.prioritaet : 'E1',
    einsatzart: 'RD',
    adresse:    szenario ? szenario.einsatzort : '',
    etage:      '',
    zielort:    '',
    zielStation:'',
    patient:    szenario ? (szenario.patient ? `${szenario.patient.alter}J / ${szenario.patient.geschlecht}` : '') : '',
    alter:      szenario ? szenario.patient?.alter : '',
    geschlecht: szenario ? szenario.patient?.geschlecht : '-',
    bewusstsein:szenario ? szenario.patient?.bewusstsein : '-',
    aao:        [],
    aaoNichtVerfuegbar: [],
    doku:       [],
    status:     'offen',
    szenarioId: szenario ? szenario.id : null,
    alarmiert:  false,
    alarmiertTs: null
  };

  // Erster Doku-Eintrag automatisch
  einsatzDokuInterneintrag(einsatz, `Einsatz erstellt. ${szenario ? 'Szenario: ' + szenario.titel : ''}`);

  STATE.einsaetze.push(einsatz);
  renderEinsatzliste();
  if (window.syncEinsaetze) syncEinsaetze();

  if (autoOeffnen) einsatzOeffnen(einsatz.id);

  prueferLog('info', `Neuer Einsatz: ${rnkr} – ${einsatz.stichwort || 'ohne Stichwort'}`);
  STATE.simulation.letzteAktion = Date.now();

  return einsatz;
}

function einsatzDokuInterneintrag(einsatz, text) {
  einsatz.doku.push({
    ts:   zeitStempel(),
    wer:  'SYS',
    text,
    ki:   false
  });
}

function einsatzOeffnen(id) {
  const einsatz = STATE.einsaetze.find(e => e.id === id);
  if (!einsatz) return;
  STATE.aktiverEinsatz = id;

  // Maske befüllen
  const stichwortField = document.getElementById('f-stichwort');
  if (stichwortField) stichwortField.value = einsatz.stichwort || '';

  const prioritaetField = document.getElementById('f-prioritaet');
  if (prioritaetField) prioritaetField.value = einsatz.prioritaet || 'E1';

  const einsatzartField = document.getElementById('f-einsatzart');
  if (einsatzartField) einsatzartField.value = einsatz.einsatzart || 'RD';

  const adresseField = document.getElementById('f-adresse');
  if (adresseField) adresseField.value = einsatz.adresse || '';

  const etageField = document.getElementById('f-etage');
  if (etageField) etageField.value = einsatz.etage || '';

  const zielortField = document.getElementById('f-zielort');
  if (zielortField) zielortField.value = einsatz.zielort || '';

  const zielStationField = document.getElementById('f-ziel-station');
  if (zielStationField) zielStationField.value = einsatz.zielStation || '';

  const patientField = document.getElementById('f-patient');
  if (patientField) patientField.value = einsatz.patient || '';

  const alterField = document.getElementById('f-alter');
  if (alterField) alterField.value = einsatz.alter || '';

  const geschlechtField = document.getElementById('f-geschlecht');
  if (geschlechtField) geschlechtField.value = einsatz.geschlecht || '-';

  const bewusstseinField = document.getElementById('f-bewusstsein');
  if (bewusstseinField) bewusstseinField.value = einsatz.bewusstsein || '-';

  const statusField = document.getElementById('f-einsatz-status');
  if (statusField) statusField.value = einsatz.status || 'offen';

  const rnkrEl = document.getElementById('em-rnkr');
  if (rnkrEl) rnkrEl.textContent = einsatz.rnkr;

  const dokuUserEl = document.getElementById('doku-user');
  if (dokuUserEl) dokuUserEl.textContent = STATE.user ? `[${STATE.user.kuerzel}]` : '';

  // AAO Chips
  renderAaoChips(einsatz.aao, einsatz.aaoNichtVerfuegbar || []);

  // Doku
  renderDoku(einsatz.doku);

  // Aktive Zeile in Liste markieren
  document.querySelectorAll('.einsatz-row').forEach(r => r.classList.remove('active'));
  const row = document.querySelector(`[data-einsatz-id="${id}"]`);
  if (row) row.classList.add('active');
}

function einsatzSchliessen() {
  einsatzSpeichern();
  STATE.aktiverEinsatz = null;
  const panel = document.getElementById('einsatzmaske-panel');
  if (panel) panel.style.display = 'none';
  document.querySelectorAll('.einsatz-row').forEach(r => r.classList.remove('active'));
}

function einsatzSpeichern() {
  if (!STATE.aktiverEinsatz) return;
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;

  const getSafeValue = (id) => {
    const el = document.getElementById(id);
    return el ? el.value : (einsatz[id.substring(2)] || '');
  };

  einsatz.stichwort   = getSafeValue('f-stichwort');
  einsatz.prioritaet  = getSafeValue('f-prioritaet');
  einsatz.einsatzart  = getSafeValue('f-einsatzart');
  einsatz.adresse     = getSafeValue('f-adresse');
  einsatz.etage       = getSafeValue('f-etage');
  einsatz.zielort     = getSafeValue('f-zielort');
  einsatz.zielStation = getSafeValue('f-ziel-station');
  einsatz.patient     = getSafeValue('f-patient');
  einsatz.alter       = getSafeValue('f-alter');
  einsatz.geschlecht  = getSafeValue('f-geschlecht');
  einsatz.bewusstsein = getSafeValue('f-bewusstsein');
  einsatz.status      = getSafeValue('f-einsatz-status');

  renderEinsatzliste();
  STATE.simulation.letzteAktion = Date.now();
  if (window.syncEinsaetze) syncEinsaetze();
  prueferLog('info', `Einsatz ${einsatz.rnkr} gespeichert`);
}

function einsatzAbschliessen() {
  if (!STATE.aktiverEinsatz) return;
  einsatzSpeichern();
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (einsatz) {
    einsatz.status = 'abgeschlossen';
    einsatzDokuInterneintrag(einsatz, `Einsatz abgeschlossen durch ${STATE.user?.kuerzel || '–'}`);
    prueferLog('good', `Einsatz ${einsatz.rnkr} abgeschlossen`);
  }
  renderEinsatzliste();
  STATE.simulation.letzteAktion = Date.now();
  if (window.syncEinsaetze) syncEinsaetze();
}

// ---- AAO ----
function renderAaoChips(aao, nichtVerfuegbar = []) {
  const container = document.getElementById('aao-chips');
  if (!container) return;
  container.innerHTML = '';
  (aao || []).forEach((em, idx) => {
    const chip = document.createElement('div');
    chip.className = 'aao-chip';
    chip.innerHTML = `<span>${em}</span><button class="chip-remove" onclick="aaoEntfernen(${idx})">✕</button>`;
    container.appendChild(chip);
  });
  // Vorgeschlagene, aber nicht verfügbare Mittel: ausgegraut, nicht disponierbar
  (nichtVerfuegbar || []).forEach(label => {
    const chip = document.createElement('div');
    chip.className = 'aao-chip disabled';
    chip.title = 'Nicht verfügbar – bereits disponiert oder außer Dienst';
    chip.innerHTML = `<span>${label}</span>`;
    container.appendChild(chip);
  });
}

function aaoHinzufuegen() {
  const sel = document.getElementById('aao-select-em');
  if (!sel) return;
  const val = sel.value;
  if (!val) return;
  if (!STATE.aktiverEinsatz) { aaoHint('Zuerst einen Einsatz öffnen'); return; }

  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;

  const em = STATE.einsatzmittel.find(e => e.kennung === val);
  if (em && !emVerfuegbar(em)) {
    aaoHint(`${val} ist nicht verfügbar (Status ${em.status})`);
    sel.value = '';
    return;
  }

  if (!einsatz.aao.includes(val)) {
    einsatz.aao.push(val);
    renderAaoChips(einsatz.aao, einsatz.aaoNichtVerfuegbar);
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
  renderAaoChips(einsatz.aao, einsatz.aaoNichtVerfuegbar);
  if (window.syncEinsaetze) syncEinsaetze();
}

function aaoVorschlag() {
  if (!STATE.aktiverEinsatz) { aaoHint('Zuerst einen Einsatz öffnen'); return; }
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;

  if (!einsatz.szenarioId) { aaoHint('Kein Szenario aktiv'); return; }
  const sz = STATE.szenarien.find(s => s.id === einsatz.szenarioId);
  if (!sz || !sz.aao) { aaoHint('Kein AAO-Vorschlag hinterlegt'); return; }

  const vorschlag = [...(sz.aao.primaer || [])];
  const zugewiesen = [];
  const nichtVerfuegbar = [];

  const FIXE_KENNUNGEN = { 'NEF': '10-101', 'EL': '20-701', 'C6': 'C6', 'KIT': 'KIT-SBG' };

  vorschlag.forEach(v => {
    let kennung = null;
    if (v === 'RTW' || v === 'KTW') {
      kennung = zufallVerfuegbaresEm(v, zugewiesen);
    } else if (v === 'First Responder' || v === 'FR') {
      kennung = zufallVerfuegbaresEm('FR', zugewiesen);
    } else if (FIXE_KENNUNGEN[v]) {
      const em = STATE.einsatzmittel.find(e => e.kennung === FIXE_KENNUNGEN[v]);
      kennung = (emVerfuegbar(em) && !zugewiesen.includes(em.kennung)) ? em.kennung : null;
    } else {
      // Direkter Kennungs-, Typ- oder Namens-Treffer (z.B. Bergrettung, Wasserrettung)
      const direkt = STATE.einsatzmittel.find(e => e.kennung === v);
      if (direkt) {
        kennung = (emVerfuegbar(direkt) && !zugewiesen.includes(direkt.kennung)) ? direkt.kennung : null;
      } else {
        const treffer = STATE.einsatzmittel.find(e =>
          (e.typ === v || e.name.includes(v)) && emVerfuegbar(e) && !zugewiesen.includes(e.kennung)
        );
        kennung = treffer ? treffer.kennung : null;
      }
    }

    if (kennung) zugewiesen.push(kennung);
    else nichtVerfuegbar.push(v);
  });

  einsatz.aao = zugewiesen;
  einsatz.aaoNichtVerfuegbar = nichtVerfuegbar;

  if (nichtVerfuegbar.length > 0) {
    aaoHint(`Vorschlag: ${vorschlag.join(', ')} – nicht verfügbar: ${nichtVerfuegbar.join(', ')}`);
  } else {
    aaoHint(`Vorschlag: ${vorschlag.join(', ')}`);
  }

  renderAaoChips(einsatz.aao, nichtVerfuegbar);
  prueferLog('info', `AAO-Vorschlag für ${einsatz.rnkr}: ${zugewiesen.join(', ') || 'keine Mittel frei'}`);
  if (window.syncEinsaetze) syncEinsaetze();
}

function zufallVerfuegbaresEm(typ, ausschluss = []) {
  const verfuegbar = STATE.einsatzmittel.filter(em =>
    em.typ === typ && emVerfuegbar(em) && !ausschluss.includes(em.kennung)
  );
  if (verfuegbar.length === 0) return null;
  return verfuegbar[Math.floor(Math.random() * verfuegbar.length)].kennung;
}

// ---- DOKU ----
function dokuEintrag() {
  const input = document.getElementById('doku-input');
  const text = input.value.trim();
  if (!text || !STATE.aktiverEinsatz) return;

  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;

  const eintrag = {
    ts:   zeitStempel(),
    wer:  STATE.user?.kuerzel || '??',
    text,
    ki:   false
  };
  einsatz.doku.push(eintrag);
  renderDoku(einsatz.doku);
  input.value = '';
  STATE.simulation.letzteAktion = Date.now();
  prueferLog('info', `Doku: "${text.slice(0,40)}"`);
}

function renderDoku(doku) {
  const container = document.getElementById('doku-entries');
  if (!container) return;
  container.innerHTML = '';
  (doku || []).forEach(e => {
    const div = document.createElement('div');
    div.className = `doku-entry${e.ki ? ' doku-ki' : ''}`;
    div.innerHTML = `<span class="doku-ts">${e.ts}</span><span class="doku-who">[${e.wer}]</span><span class="doku-text">${e.text}</span>`;
    container.appendChild(div);
  });
  container.scrollTop = container.scrollHeight;
}

// ---- ALARMIEREN ----
function alarmieren() {
  if (!STATE.aktiverEinsatz) return;
  einsatzSpeichern();
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;
  if (!einsatz.aao || einsatz.aao.length === 0) {
    aaoHint('Keine Einsatzmittel in der AAO – zuerst Einsatzmittel zuweisen.');
    if (window.zeigeKurzToast) zeigeKurzToast('Keine Einsatzmittel in der AAO', 'red');
    return;
  }

  einsatz.alarmiert = true;
  einsatz.alarmiertTs = Date.now();
  einsatz.status = 'laufend';
  const statusField = document.getElementById('f-einsatz-status');
  if (statusField) statusField.value = 'laufend';

  const alarmzeit = zeitStempel();
  einsatzDokuInterneintrag(einsatz, `ALARM ausgelöst um ${alarmzeit} – AAO: ${einsatz.aao.join(', ')}`);
  renderDoku(einsatz.doku);

  // Einsatzmittel auf Status 01 setzen und Fahrtenabfolge starten
  einsatz.aao.forEach(kennung => {
    starteFahrtZyklus(kennung, einsatz);
  });

  renderEinsatzliste();
  prueferLog('good', `ALARM: ${einsatz.rnkr} – ${einsatz.stichwort} – AAO: ${einsatz.aao.join(', ')}`);
  STATE.simulation.letzteAktion = Date.now();
  if (window.syncEinsaetze) syncEinsaetze();

  // Funk-Bestätigung vom ersten EM
  const erstesEm = einsatz.aao[0];
  const em = STATE.einsatzmittel.find(e => e.kennung === erstesEm);
  if (em) {
    setTimeout(() => {
      addFunkMsg('incoming', erstesEm, `${erstesEm} an Leitstelle – Auftrag für ${einsatz.stichwort || 'Einsatz'} empfangen, ${einsatz.adresse || 'Adresse folgt'}, wir rücken aus.`);
    }, zufallZahl(15, 45) * 1000);
  }
}

// ---- FAHRT-ZYKLUS SIMULATION ----
function starteFahrtZyklus(kennung, einsatz) {
  const em = STATE.einsatzmittel.find(e => e.kennung === kennung);
  if (!em) return;
  if (em.einsatzId && em.einsatzId !== einsatz.id) {
    einsatzDokuInterneintrag(einsatz, `${kennung} nicht verfügbar (bereits disponiert)`);
    return;
  }

  em.einsatzId = einsatz.id;

  const fahrtzeit = getFahrtzeit(em.typ); // Minuten
  const einsatzdauer = zufallZahl(15, 35); // Minuten
  const rueckfahrt   = getFahrtzeit(em.typ);
  const einsatzAdresse = einsatz.adresse || 'unbekannt';

  // Status 01
  setEmStatus(kennung, '01', einsatzAdresse);

  // Status 02 nach 30-90 Sek
  setTimeout(() => {
    em.zeitAus = zeitStempel();
    setEmStatus(kennung, '02', einsatzAdresse);
  }, zufallZahl(30, 90) * 1000);

  // Status 03 nach Fahrtzeit
  setTimeout(() => {
    em.zeitEEO = zeitStempel();
    setEmStatus(kennung, '03', einsatzAdresse);
    einsatzDokuInterneintrag(einsatz, `${kennung} am Einsatzort (${em.zeitEEO})`);
    renderDoku(einsatz.doku);
  }, (fahrtzeit * 60) * 1000);

  // Status 04 nach Einsatzdauer
  setTimeout(() => {
    em.zeitAEO = zeitStempel();
    setEmStatus(kennung, '04', einsatz.zielort || 'Ziel');
    einsatzDokuInterneintrag(einsatz, `${kennung} Abfahrt Einsatzort → ${einsatz.zielort || 'Ziel'} (${em.zeitAEO})`);
    renderDoku(einsatz.doku);
  }, ((fahrtzeit + einsatzdauer) * 60) * 1000);

  // Status 05/07 nach Fahrt zum Ziel
  setTimeout(() => {
    if (einsatz.zielort) {
      em.zeitEZO = zeitStempel();
      setEmStatus(kennung, '05', einsatz.zielort);
    } else {
      setEmStatus(kennung, '07', '');
    }
  }, ((fahrtzeit + einsatzdauer + rueckfahrt) * 60) * 1000);

  // Status 00 zurück – Fahrzeug wieder frei
  setTimeout(() => {
    em.zeitAus = em.zeitEEO = em.zeitAEO = em.zeitEZO = null;
    em.einsatzId = null;
    einsatz.einsatzmittelZurueck = (einsatz.einsatzmittelZurueck || 0) + 1;
    setEmStatus(kennung, '00', '');
  }, ((fahrtzeit + einsatzdauer + rueckfahrt + 10) * 60) * 1000);
}

function setEmStatus(kennung, status, adresse) {
  const em = STATE.einsatzmittel.find(e => e.kennung === kennung);
  if (!em) return;
  em.status = status;
  if (adresse !== undefined) em.aktuelleAdresse = adresse;
  em.zeitStatus = zeitStempel();
  renderStatusScreen();
  if (window.broadcastEmDiff) broadcastEmDiff(em);
}

// ---- EINSATZLISTE ----
function renderEinsatzliste() {
  const tbody = document.getElementById('einsatzliste-tbody');
  if (!tbody) return;
  const aktive = STATE.einsaetze.filter(e => e.status !== 'abgeschlossen');

  // Noch nicht disponierte Einsätze zuerst, danach die neuesten oben
  aktive.sort((a, b) => {
    if (a.alarmiert !== b.alarmiert) return a.alarmiert ? 1 : -1;
    return b.id - a.id;
  });

  if (aktive.length === 0) {
    tbody.innerHTML = '<tr class="einsatz-empty-row"><td colspan="8">Keine aktiven Einsätze</td></tr>';
    return;
  }

  tbody.innerHTML = aktive.map(e => `
    <tr class="einsatz-row${STATE.aktiverEinsatz === e.id ? ' active' : ''}" data-einsatz-id="${e.id}" onclick="einsatzOeffnen(${e.id})">
      <td>${e.zeitErstellt}</td>
      <td style="font-family:var(--font-mono);font-size:11px;color:var(--blue)">${e.rnkr}</td>
      <td>${e.stichwort || '–'}</td>
      <td><span style="font-size:11px;color:var(--text-secondary)">${e.status}</span></td>
      <td style="font-size:11px;max-width:160px;overflow:hidden;text-overflow:ellipsis">${e.adresse || '–'}</td>
      <td style="font-size:11px;color:var(--text-dim)">${(e.aao||[]).slice(0,3).join(', ')}${e.aao?.length > 3 ? '…' : ''}</td>
      <td><span class="prio-badge prio-${e.prioritaet}">${e.prioritaet}</span></td>
      <td><button class="btn-small" onclick="event.stopPropagation();einsatzOeffnen(${e.id})">Öffnen</button></td>
    </tr>
  `).join('');
}

// ---- FUNK ----
function initFunkHandlers() {
  const input  = document.getElementById('funk-input');
  const btnSend = document.getElementById('btn-funk-send');

  if (input) input.addEventListener('keydown', e => { if (e.key === 'Enter') sendFunk(); });
  if (btnSend) btnSend.addEventListener('click', sendFunk);
}

function sendFunk() {
  const input = document.getElementById('funk-input');
  const text = input.value.trim();
  if (!text) return;

  addFunkMsg('outgoing', `LEITSTELLE [${STATE.user?.kuerzel || '??'}]`, text);
  input.value = '';
  STATE.simulation.letzteAktion = Date.now();
  prueferLog('info', `Funk-Ausgang: "${text.slice(0,50)}"`);

  // KI-Reaktion via API wenn Simulation aktiv
  if (STATE.simulation.aktiv) {
    generiereKIFunkAntwort(text);
  }
}

function addFunkMsg(typ, sender, text, opts = {}) {
  const container = document.getElementById('funk-messages');
  if (container) {
    const div = document.createElement('div');
    div.className = `funk-msg ${typ}`;
    div.innerHTML = `
      <span class="funk-msg-time">${zeitStempel()}</span>
      <span class="funk-msg-sender">${sender}:</span>
      <span class="funk-msg-text">${text}</span>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  // An andere Tabs weiterreichen (außer die Meldung kam selbst von dort)
  if (!opts.relayed && window.broadcastFunk) {
    broadcastFunk(typ, sender, text);
  }

  // Funk-Input aktivieren sobald Simulation läuft
  if (STATE.simulation.aktiv) {
    const input = document.getElementById('funk-input');
    const btn = document.getElementById('btn-funk-send');
    if (input) input.disabled = false;
    if (btn) btn.disabled = false;
  }
}

// ---- KI FUNK-ANTWORT ----
// Primär: Server-Proxy /api/funk (Key liegt als ANTHROPIC_API_KEY auf Render und verlässt den Server nie).
// Fallback 1: direkter Browser-Aufruf mit lokal gespeichertem Key.
// Fallback 2: einfache Standard-Antworten.
function fallbackFunkAntwort(sender) {
  const antworten = [
    'Verstanden, führen aus.',
    'Kopiert, wir sind unterwegs.',
    'Bestätigt. Melden uns bei Eintreffen.',
    'Roger, Leitstelle. Auf dem Weg.',
    'Ja, erledigt. Danke.'
  ];
  setTimeout(() => {
    addFunkMsg('incoming', sender, antworten[Math.floor(Math.random() * antworten.length)]);
  }, zufallZahl(2, 5) * 1000);
}

async function generiereKIFunkAntwort(disponenText) {
  const sender = ermittleFunkSender();

  const aktiveEinsaetze = STATE.einsaetze.filter(e => e.status !== 'abgeschlossen');
  const emStatus = STATE.einsatzmittel.slice(0, 10).map(em =>
    `${em.kennung}(${em.status})`
  ).join(', ');

  const systemPrompt = `Du bist ein Funk-Simulator für eine Rettungsleitstelle in Salzburg, Österreich.
Du simulierst Funkgespräche von Einsatzmitteln (RTW, NEF, KTW, Bergrettung etc.) an die Leitstelle.
Aktuelle Lage: ${aktiveEinsaetze.length} aktive Einsätze. Einsatzmittel-Status: ${emStatus}.
Drucklevel: ${STATE.simulation.drucklevel}/5.
Antworte KURZ und REALISTISCH wie ein echter Sanitäter/Rettungsfahrer im Funk.
Österreichischer Funkjargon. Max 2 Sätze. Kein "Guten Tag" etc.
Wenn der Disponent etwas anweist: bestätige oder melde ein Problem.`;

  const prompt = `Der Disponent funkt: "${disponenText}"\nAntworte als Einsatzmittel ${sender}.`;

  // 1) Server-Proxy (empfohlen)
  try {
    const resp = await fetch('/api/funk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ system: systemPrompt, prompt })
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.text) {
        setTimeout(() => addFunkMsg('incoming', sender, data.text), zufallZahl(2, 6) * 1000);
        return;
      }
    }
  } catch (e) {
    console.warn('KI über Server nicht erreichbar:', e.message);
  }

  // 2) Direkt aus dem Browser (lokal gespeicherter Key)
  const apiKey = localStorage.getItem('els_api_key');
  if (apiKey) {
    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: 'claude-opus-4-8',
          max_tokens: 300,
          system: systemPrompt,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      if (response.ok) {
        const data = await response.json();
        const antwort = data.content?.filter(b => b.type === 'text').map(b => b.text).join(' ').trim();
        if (antwort) {
          setTimeout(() => addFunkMsg('incoming', sender, antwort), zufallZahl(2, 6) * 1000);
          return;
        }
      }
    } catch (e) {
      console.warn('KI-Funk (direkt) fehlgeschlagen:', e);
    }
  }

  // 3) Standard-Antworten
  fallbackFunkAntwort(sender);
}

function ermittleFunkSender() {
  const aktiveEm = STATE.einsatzmittel.filter(em =>
    ['02','03','04'].includes(em.status)
  );
  if (aktiveEm.length > 0) {
    return aktiveEm[Math.floor(Math.random() * aktiveEm.length)].kennung;
  }
  return 'EINHEIT';
}

// ---- KI SIMULATION ENGINE ----
function startSimulation() {
  if (STATE.simulation.aktiv) return;
  STATE.simulation.aktiv    = true;
  STATE.simulation.startzeit = Date.now();
  STATE.simulation.drucklevel = 1;
  STATE.simulation.letzteAktion = Date.now();

  if (window.applySimState) applySimState(true);
  if (window.broadcastSim) broadcastSim(true);
  if (window.zeigeKurzToast) zeigeKurzToast('Übung gestartet', 'green');
  prueferLog('good', 'Simulation gestartet');

  // Erstes Szenario nach 5-10 Sek
  setTimeout(spieleSzenarioEin, zufallZahl(5, 10) * 1000);

  // Drucksteuerungs-Loop alle 20 Sek
  STATE.simulation.druckLoop = setInterval(aktualisiereDrucklevel, 20000);

  if (STATE.rolle === 'pruefer') {
    const s = document.getElementById('btn-uebung-start');
    const p = document.getElementById('btn-uebung-stop');
    if (s) s.disabled = true;
    if (p) p.disabled = false;
  }
}

function stoppSimulation() {
  STATE.simulation.aktiv = false;
  clearInterval(STATE.simulation.druckLoop);
  clearInterval(STATE.simulation.szenarioLoop);
  STATE.simulation.eskalationsTimer.forEach(t => clearTimeout(t));
  STATE.simulation.eskalationsTimer = [];

  if (window.applySimState) applySimState(false);
  if (window.broadcastSim) broadcastSim(false);
  if (window.zeigeKurzToast) zeigeKurzToast('Übung beendet', 'red');
  prueferLog('info', 'Simulation gestoppt');

  if (STATE.rolle === 'pruefer') {
    const s = document.getElementById('btn-uebung-start');
    const p = document.getElementById('btn-uebung-stop');
    if (s) s.disabled = false;
    if (p) p.disabled = true;
  }
}

function aktualisiereDrucklevel() {
  if (!STATE.simulation.aktiv) return;

  const offeneEinsaetze = STATE.einsaetze.filter(e => e.status !== 'abgeschlossen').length;
  const sekSeitLetzterAktion = (Date.now() - (STATE.simulation.letzteAktion || Date.now())) / 1000;
  const alteLevel = STATE.simulation.drucklevel;

  // Drucklevel berechnen
  if (offeneEinsaetze === 0 && sekSeitLetzterAktion > 25) {
    STATE.simulation.drucklevel = Math.min(5, STATE.simulation.drucklevel + 1);
  } else if (offeneEinsaetze >= 5) {
    STATE.simulation.drucklevel = 5;
  } else if (offeneEinsaetze >= 3) {
    STATE.simulation.drucklevel = Math.min(5, STATE.simulation.drucklevel + 1);
  } else if (offeneEinsaetze <= 1 && sekSeitLetzterAktion < 30) {
    STATE.simulation.drucklevel = Math.max(1, STATE.simulation.drucklevel - 1);
  }

  if (STATE.simulation.drucklevel !== alteLevel) {
    prueferLog('info', `🔴 Drucklevel: ${STATE.simulation.drucklevel}/5 (${offeneEinsaetze} Einsätze offen)`);
  }

  // Szenario einzuspielen wenn Kapazität da
  if (offeneEinsaetze < 6) {
    const pauseMs = berechnePause();
    setTimeout(spieleSzenarioEin, pauseMs);
  }
}

function berechnePause() {
  const level = STATE.simulation.drucklevel;
  // Level 1: 60-90 Sek, Level 5: 8-15 Sek
  const pauses = { 1: [60,90], 2: [40,60], 3: [25,40], 4: [15,25], 5: [8,15] };
  const [min, max] = pauses[level] || pauses[1];
  return zufallZahl(min, max) * 1000;
}

function spieleSzenarioEin() {
  if (!STATE.simulation.aktiv) return;

  // Ungespieltes Szenario wählen
  const ungespielt = STATE.szenarien.filter(s =>
    !STATE.simulation.szenarioGespielt.includes(s.id)
  );
  if (ungespielt.length === 0) {
    STATE.simulation.szenarioGespielt = []; // Reset
    return;
  }

  // Kategorie-Gewichtung nach Drucklevel
  let kandidaten = ungespielt;
  if (STATE.simulation.drucklevel >= 4) {
    kandidaten = ungespielt.filter(s => s.prioritaet === 'E1') || ungespielt;
  } else if (STATE.simulation.drucklevel === 1) {
    kandidaten = ungespielt.filter(s => ['KT','E3','E2'].includes(s.prioritaet)) || ungespielt;
  }

  const sz = kandidaten[Math.floor(Math.random() * Math.min(kandidaten.length, 10))];
  STATE.simulation.szenarioGespielt.push(sz.id);

  // Einsatz direkt anlegen – erscheint in der Einsatzliste (nicht im Funk).
  // Auf den anderen Tabs zeigt der Sync ein Notruf-Banner.
  const einsatz = neuerEinsatz(sz, false);

  prueferLog('info', `Szenario eingespielt: ${sz.id} – ${sz.titel}`);

  // Prüfer-Info updaten
  const infoDiv = document.getElementById('pruefer-szenario-info');
  if (infoDiv) {
    infoDiv.innerHTML = `
      <strong>${sz.id}</strong> – ${sz.titel}<br>
      <span style="color:var(--text-dim)">${sz.kategorie} | ${sz.prioritaet}</span><br>
      AAO erwartet: ${sz.aao?.primaer?.join(', ')}<br>
      <span style="font-size:10px;color:var(--text-dim)">${sz.beschreibung?.slice(0,80)}...</span>
    `;
  }

  // Eskalationen planen
  planEskalationen(sz, einsatz);
}

function planEskalationen(sz, einsatz) {
  if (!sz.eskalationen || sz.eskalationen.length === 0) return;

  sz.eskalationen.forEach(esk => {
    // Trigger-Zeit parsen (z.B. "nach 8 Min")
    const match = esk.trigger.match(/nach (\d+) Min/);
    const minuten = match ? parseInt(match[1]) : 15;

    const timer = setTimeout(() => {
      if (!STATE.simulation.aktiv) return;

      // Funkt vorzugsweise ein dem Einsatz zugeteiltes Fahrzeug
      const zugeteilt = einsatz && einsatz.aao && einsatz.aao.length > 0
        ? STATE.einsatzmittel.find(em => einsatz.aao.includes(em.kennung))
        : null;
      const aktivesEm = zugeteilt || STATE.einsatzmittel.find(em => ['02','03'].includes(em.status));
      const sender = aktivesEm ? aktivesEm.kennung : 'EINHEIT';
      addFunkMsg('incoming', sender, esk.ereignis);

      // Prüfer-Log
      prueferLog('warn', `Eskalation: ${esk.ereignis.slice(0,60)}`);

      // Doku-Eintrag im zugehörigen Einsatz (nicht im gerade offenen)
      const ziel = einsatz ? STATE.einsaetze.find(e => e.id === einsatz.id) : null;
      if (ziel) {
        ziel.doku.push({
          ts: zeitStempel(), wer: sender, text: esk.ereignis, ki: true
        });
        if (STATE.aktiverEinsatz === ziel.id) renderDoku(ziel.doku);
      }
    }, minuten * 60 * 1000);

    STATE.simulation.eskalationsTimer.push(timer);
  });
}

// ---- PRÜFER PANEL ----
function initPrueferPanel() {
  const toggleBtn = document.getElementById('pruefer-toggle-btn');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const overlay = document.getElementById('pruefer-overlay');
      if (overlay) overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
    });
  }

  const btnPrueferClose = document.getElementById('btn-pruefer-close');
  if (btnPrueferClose) {
    btnPrueferClose.addEventListener('click', () => {
      document.getElementById('pruefer-overlay').style.display = 'none';
    });
  }

  const btnStart = document.getElementById('btn-uebung-start');
  if (btnStart) btnStart.addEventListener('click', startSimulation);

  const btnStop = document.getElementById('btn-uebung-stop');
  if (btnStop) btnStop.addEventListener('click', stoppSimulation);

  const btnAuswertung = document.getElementById('btn-uebung-auswertung');
  if (btnAuswertung) btnAuswertung.addEventListener('click', zeigeAuswertung);

  renderPrueferSzenarioListe();

  const filterKat = document.getElementById('pruefer-filter-kat');
  if (filterKat) filterKat.addEventListener('change', renderPrueferSzenarioListe);

  const btnManuell = document.getElementById('btn-manuell-szenario');
  if (btnManuell) btnManuell.addEventListener('click', manuellSzenario);
}

function renderPrueferSzenarioListe() {
  const filterEl = document.getElementById('pruefer-filter-kat');
  const listeEl = document.getElementById('pruefer-szenario-liste');
  if (!filterEl || !listeEl) return;

  const filter = filterEl.value;
  const gefiltert = filter
    ? STATE.szenarien.filter(s => s.kategorie === filter)
    : STATE.szenarien;

  listeEl.innerHTML = gefiltert.slice(0, 30).map(sz => `
    <div class="pruefer-sz-item" onclick="manuellSzenarioEinspielen('${sz.id}')">
      <span class="sz-id">${sz.id}</span>
      <span class="sz-title">${sz.titel}</span>
      <span class="sz-prio"><span class="prio-badge prio-${sz.prioritaet}">${sz.prioritaet}</span></span>
    </div>
  `).join('');
}

function manuellSzenario() {
  const liste = document.getElementById('pruefer-szenario-liste');
  liste.scrollIntoView({ behavior: 'smooth' });
}

function manuellSzenarioEinspielen(id) {
  const sz = STATE.szenarien.find(s => s.id === id);
  if (!sz) return;
  const einsatz = neuerEinsatz(sz, false);
  planEskalationen(sz, einsatz);
  prueferLog('info', `Szenario eingespielt: ${sz.id} – ${sz.stichwort}`);
  const overlay = document.getElementById('pruefer-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ---- PRÜFER LOG ----
function prueferLog(typ, text, relayed = false) {
  const eintrag = { ts: zeitStempel(), typ, text };
  STATE.prueferLog.push(eintrag);

  // Disponenten-Aktionen auch im Prüfer-Tab protokollieren (und umgekehrt)
  if (!relayed && window.broadcastLog) broadcastLog(eintrag);

  const container = document.getElementById('pruefer-log');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-ts">${eintrag.ts}</span><span class="log-${typ}">${text}</span>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ---- AUSWERTUNG (erweitert) ----
function zeigeAuswertung() {
  const overlay = document.createElement('div');
  overlay.className = 'auswertung-overlay';

  const laufzeit = STATE.simulation.startzeit
    ? Math.floor((Date.now() - STATE.simulation.startzeit) / 1000)
    : 0;
  const laufzeitMin = Math.floor(laufzeit / 60);
  const laufzeitSek = laufzeit % 60;

  const gesamtEinsaetze = STATE.einsaetze.length;
  const abgeschlossen   = STATE.einsaetze.filter(e => e.status === 'abgeschlossen').length;
  const alarmiert       = STATE.einsaetze.filter(e => e.alarmiert).length;
  const offen           = STATE.einsaetze.filter(e => e.status === 'offen' || e.status === 'laufend').length;

  if (gesamtEinsaetze === 0) {
    overlay.innerHTML = `
      <div class="auswertung-panel">
        <h2 style="margin:0 0 12px 0">📊 Übungsauswertung</h2>
        <p style="padding:12px 0">Noch keine Einsätze vorhanden.</p>
        <div style="text-align:center">
          <button class="btn-action" onclick="this.closest('.auswertung-overlay').remove()">Schließen</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    return;
  }

  // Detaillierte Einsatz-Analyse (Reaktionszeit = Erstellung → Alarmierung)
  const einsatzAnalysen = STATE.einsaetze.map(e => {
    const reactionTime = (e.alarmiertTs && e.erstelltTs)
      ? Math.max(0, Math.floor((e.alarmiertTs - e.erstelltTs) / 1000))
      : null;

    return {
      rnkr: e.rnkr,
      stichwort: e.stichwort,
      status: e.status,
      aao: e.aao || [],
      reactionTime,
      dokuEintraege: e.doku.length,
      prioVerfehlt: e.prioritaet === 'E1' && e.status === 'offen'
    };
  });

  // Statistiken
  const mitReaktion = einsatzAnalysen.filter(ea => ea.reactionTime !== null);
  const durmschnittReactionTime = mitReaktion.length > 0
    ? mitReaktion.reduce((sum, ea) => sum + ea.reactionTime, 0) / mitReaktion.length
    : null;

  const fehlerAnzahl = einsatzAnalysen.filter(ea => ea.prioVerfehlt || ea.aao.length === 0).length;

  const reaktionPunkte = durmschnittReactionTime === null ? 10
    : durmschnittReactionTime < 120 ? 20
    : durmschnittReactionTime < 180 ? 10 : 0;
  const gesamtPunkte = Math.round(
    (alarmiert / gesamtEinsaetze * 30) +
    (abgeschlossen / gesamtEinsaetze * 30) +
    reaktionPunkte +
    (fehlerAnzahl === 0 ? 20 : 10)
  );

  const bewertung = () => {
    if (gesamtPunkte >= 80) return { text: '⭐ Sehr gut', color: 'var(--green)' };
    if (gesamtPunkte >= 60) return { text: '👍 Gut', color: 'var(--blue)' };
    if (gesamtPunkte >= 40) return { text: '🤔 Befriedigend', color: 'var(--yellow)' };
    return { text: '⚠️ Fehlerberatung nötig', color: 'var(--red)' };
  };
  const notes = bewertung();

  overlay.innerHTML = `
    <div class="auswertung-panel" style="max-height:90vh;overflow-y:auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px">
        <h2 style="margin:0">📊 Übungsauswertung</h2>
        <button onclick="this.closest('.auswertung-overlay').remove()" style="background:none;border:none;font-size:18px;cursor:pointer">✕</button>
      </div>

      <!-- Gesamtbewertung -->
      <div class="auswertung-section" style="background:linear-gradient(135deg, rgba(0,200,255,0.1), rgba(100,150,255,0.1));border:2px solid ${notes.color};border-radius:8px;padding:16px">
        <div style="text-align:center;font-size:24px;margin-bottom:8px">${notes.text}</div>
        <div class="auswertung-kriterium" style="justify-content:space-between">
          <span style="font-size:12px">Gesamtpunkte</span>
          <span style="font-weight:bold;color:${notes.color};font-size:16px">${gesamtPunkte}/100</span>
        </div>
      </div>

      <!-- Basis-Metriken -->
      <div class="auswertung-section">
        <h3>⏱ Zeiten</h3>
        <div class="auswertung-kriterium">
          <span class="krit-icon">⏱</span>
          <span class="krit-text">Übungsdauer</span>
          <span class="krit-zeit">${laufzeitMin}:${String(laufzeitSek).padStart(2,'0')} Min</span>
        </div>
        <div class="auswertung-kriterium">
          <span class="krit-icon">${durmschnittReactionTime !== null && durmschnittReactionTime < 120 ? '✅' : '⚠️'}</span>
          <span class="krit-text">Ø Reaktionszeit (Erstellung → Alarm)</span>
          <span class="krit-zeit">${durmschnittReactionTime !== null ? Math.round(durmschnittReactionTime) + 's' : '–'}</span>
        </div>
        <div class="auswertung-kriterium">
          <span class="krit-icon">📈</span>
          <span class="krit-text">Max Drucklevel erreicht</span>
          <span class="krit-zeit">${STATE.simulation.drucklevel}/5</span>
        </div>
      </div>

      <!-- Einsatzbearbeitung -->
      <div class="auswertung-section">
        <h3>📋 Einsatzbearbeitung</h3>
        <div class="auswertung-kriterium">
          <span class="krit-icon">📊</span>
          <span class="krit-text">Einsätze gesamt</span>
          <span class="krit-zeit">${gesamtEinsaetze}</span>
        </div>
        <div class="auswertung-kriterium">
          <span class="krit-icon">${alarmiert === gesamtEinsaetze ? '✅' : '⚠️'}</span>
          <span class="krit-text">Alarmiert</span>
          <span class="krit-zeit">${alarmiert}/${gesamtEinsaetze}</span>
        </div>
        <div class="auswertung-kriterium">
          <span class="krit-icon">${abgeschlossen === gesamtEinsaetze ? '✅' : '⚠️'}</span>
          <span class="krit-text">Abgeschlossen</span>
          <span class="krit-zeit">${abgeschlossen}/${gesamtEinsaetze}</span>
        </div>
        <div class="auswertung-kriterium">
          <span class="krit-icon">⏳</span>
          <span class="krit-text">Noch offen</span>
          <span class="krit-zeit" style="color:var(--yellow)">${offen}</span>
        </div>
      </div>

      <!-- Fehleranalyse -->
      <div class="auswertung-section">
        <h3>🔍 Fehleranalyse</h3>
        ${fehlerAnzahl === 0 ?
          `<div class="auswertung-kriterium" style="color:var(--green)">
            <span class="krit-icon">✅</span>
            <span class="krit-text">Keine Fehler erkannt</span>
          </div>` :
          `<div class="auswertung-kriterium">
            <span class="krit-icon">⚠️</span>
            <span class="krit-text">Fehler gefunden</span>
            <span class="krit-zeit" style="color:var(--yellow)">${fehlerAnzahl}</span>
          </div>
          ${einsatzAnalysen.filter(ea => ea.prioVerfehlt || ea.aao.length === 0).map(ea =>
            `<div style="font-size:11px;color:var(--text-secondary);padding:8px;background:var(--bg-dark);border-left:3px solid var(--yellow);margin:4px 0">
              <strong>${ea.rnkr}</strong>: ${ea.prioVerfehlt ? 'E1 nicht bearbeitet' : 'Keine AAO zugewiesen'} – ${ea.stichwort}
            </div>`
          ).join('')}`
        }
      </div>

      <!-- Top 5 Einsätze -->
      <div class="auswertung-section">
        <h3>🎯 Einsatzdetails (schnellste Reaktionen)</h3>
        ${einsatzAnalysen
          .filter(ea => ea.reactionTime)
          .sort((a, b) => a.reactionTime - b.reactionTime)
          .slice(0, 5)
          .map((ea, idx) => `
            <div class="auswertung-kriterium" style="padding:8px;background:var(--bg-dark);border-radius:4px;margin:4px 0">
              <span style="font-weight:bold">#${idx+1}</span>
              <span style="flex:1;margin-left:8px">
                <strong>${ea.rnkr}</strong> – ${ea.stichwort} <br>
                <span style="font-size:10px;color:var(--text-dim)">AAO: ${ea.aao.join(', ') || 'keine'}</span>
              </span>
              <span style="color:${ea.reactionTime < 120 ? 'var(--green)' : 'var(--yellow)'};font-weight:bold">${ea.reactionTime}s</span>
            </div>
          `).join('')}
      </div>

      <!-- Aktivitäts-Log -->
      <div class="auswertung-section">
        <h3>📜 Aktivitäts-Protokoll (letzten 30 Einträge)</h3>
        ${STATE.prueferLog.slice(-30).map(e =>
          `<div class="auswertung-kriterium" style="font-size:11px;padding:4px;border-bottom:1px solid var(--border)">
            <span style="color:var(--${e.typ==='good'?'green':e.typ==='warn'?'yellow':e.typ==='bad'?'red':'cyan'})">${e.typ==='good'?'✓':e.typ==='warn'?'⚠':e.typ==='bad'?'✗':'ℹ'}</span>
            <span style="margin:0 8px">${e.text}</span>
            <span style="color:var(--text-dim)">${e.ts}</span>
          </div>`
        ).join('')}
      </div>

      <div style="text-align:center;margin-top:20px;display:flex;gap:8px;justify-content:center">
        <button class="btn-action btn-save" onclick="downloadAuswertung()">💾 Export PDF</button>
        <button class="btn-action btn-action" onclick="this.closest('.auswertung-overlay').remove()">Schließen</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
}

function downloadAuswertung() {
  const timestamp = new Date().toLocaleString('de-AT');
  const report = `
LEITSTELLEN-SIMULATOR AUSWERTUNG
================================
Disponent: ${STATE.user?.name || 'Unbekannt'}
Datum/Zeit: ${timestamp}
Dauer: ${STATE.simulation.startzeit ? Math.floor((Date.now() - STATE.simulation.startzeit) / 60000) + ' Minuten' : '–'}

ERGEBNISSE:
-----------
Einsätze gesamt: ${STATE.einsaetze.length}
Alarmiert: ${STATE.einsaetze.filter(e => e.alarmiert).length}
Abgeschlossen: ${STATE.einsaetze.filter(e => e.status === 'abgeschlossen').length}
Max Drucklevel: ${STATE.simulation.drucklevel}/5

EINSATZ-DETAILS:
${STATE.einsaetze.map(e => `${e.rnkr} – ${e.stichwort} (${e.status}) – AAO: ${e.aao.join(', ') || 'keine'}`).join('\n')}

PROTOKOLL:
${STATE.prueferLog.map(e => `${e.ts} [${e.typ}] ${e.text}`).join('\n')}
  `;

  const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `auswertung_${Date.now()}.txt`;
  link.click();
}

// Hilfsfunktionen (zeitStempel, zufallZahl, getFahrtzeit) kommen aus data.js –
// dort sind die korrekten Fahrtzeiten je Einsatzmittel-Typ hinterlegt.
