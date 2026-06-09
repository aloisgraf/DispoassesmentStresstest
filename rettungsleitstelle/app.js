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

  // Startmeldung im Funk
  setTimeout(() => addFunkMsg('system', 'LEITSTELLE', 'Simulator bereit. Verbindung aufgebaut.'), 500);
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
      const rowClass = `status-row s-${em.status.replace('0','0')}`;
      const sNr = em.status.padStart(2,'0');
      html += `<tr class="${rowClass}" data-kennung="${em.kennung}" onclick="emStatusKlick('${em.kennung}')">
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
  document.getElementById('em-total').textContent =
    `${STATE.einsatzmittel.filter(e => e.besetzt).length} Einsatzmittel`;
}

function emStatusKlick(kennung) {
  // Einsatzmittel-Status manuell ändern (nur Prüfer oder Admin)
  if (STATE.rolle !== 'pruefer') return;
  const em = STATE.einsatzmittel.find(e => e.kennung === kennung);
  if (!em) return;
  const statusKeys = Object.keys(STATUS_DEFINITIONEN);
  const aktIdx = statusKeys.indexOf(em.status);
  em.status = statusKeys[(aktIdx + 1) % statusKeys.length];
  renderStatusScreen();
}

// ---- EINSATZ HANDLERS ----
function initEinsatzHandlers() {
  document.getElementById('btn-new-einsatz').addEventListener('click', neuerEinsatz);
  document.getElementById('btn-close-einsatz').addEventListener('click', einsatzSchliessen);
  document.getElementById('btn-alarmieren').addEventListener('click', alarmieren);
  document.getElementById('btn-einsatz-save').addEventListener('click', einsatzSpeichern);
  document.getElementById('btn-einsatz-abschliessen').addEventListener('click', einsatzAbschliessen);
  document.getElementById('btn-aao-add').addEventListener('click', aaoHinzufuegen);
  document.getElementById('btn-aao-vorschlag').addEventListener('click', aaoVorschlag);

  document.getElementById('doku-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') dokuEintrag();
  });
  document.getElementById('btn-doku-add').addEventListener('click', dokuEintrag);
}

function neuerEinsatz(szenario = null) {
  STATE.einsatzCounter++;
  const rnkr = neueRNKR();
  const einsatz = {
    id:         STATE.einsatzCounter,
    rnkr,
    zeitErstellt: zeitStempel(),
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
    doku:       [],
    status:     'offen',
    szenarioId: szenario ? szenario.id : null,
    alarmiert:  false
  };

  // Erste Doku-Eintrag automatisch
  einsatzDokuInterneintrag(einsatz, `Einsatz erstellt. ${szenario ? 'Szenario: ' + szenario.titel : ''}`);

  STATE.einsaetze.push(einsatz);
  renderEinsatzliste();
  einsatzOeffnen(einsatz.id);

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
  document.getElementById('f-stichwort').value    = einsatz.stichwort || '';
  document.getElementById('f-prioritaet').value   = einsatz.prioritaet || 'E1';
  document.getElementById('f-einsatzart').value   = einsatz.einsatzart || 'RD';
  document.getElementById('f-adresse').value      = einsatz.adresse || '';
  document.getElementById('f-etage').value        = einsatz.etage || '';
  document.getElementById('f-zielort').value      = einsatz.zielort || '';
  document.getElementById('f-ziel-station').value = einsatz.zielStation || '';
  document.getElementById('f-patient').value      = einsatz.patient || '';
  document.getElementById('f-alter').value        = einsatz.alter || '';
  document.getElementById('f-geschlecht').value   = einsatz.geschlecht || '-';
  document.getElementById('f-bewusstsein').value  = einsatz.bewusstsein || '-';
  document.getElementById('f-einsatz-status').value = einsatz.status || 'offen';
  document.getElementById('em-rnkr').textContent  = einsatz.rnkr;
  document.getElementById('doku-user').textContent = STATE.user ? `[${STATE.user.kuerzel}]` : '';

  // AAO Chips
  renderAaoChips(einsatz.aao);

  // Doku
  renderDoku(einsatz.doku);

  document.getElementById('einsatzmaske-panel').style.display = 'flex';

  // Aktive Zeile in Liste markieren
  document.querySelectorAll('.einsatz-row').forEach(r => r.classList.remove('active'));
  const row = document.querySelector(`[data-einsatz-id="${id}"]`);
  if (row) row.classList.add('active');
}

function einsatzSchliessen() {
  einsatzSpeichern();
  STATE.aktiverEinsatz = null;
  document.getElementById('einsatzmaske-panel').style.display = 'none';
  document.querySelectorAll('.einsatz-row').forEach(r => r.classList.remove('active'));
}

function einsatzSpeichern() {
  if (!STATE.aktiverEinsatz) return;
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;

  einsatz.stichwort   = document.getElementById('f-stichwort').value;
  einsatz.prioritaet  = document.getElementById('f-prioritaet').value;
  einsatz.einsatzart  = document.getElementById('f-einsatzart').value;
  einsatz.adresse     = document.getElementById('f-adresse').value;
  einsatz.etage       = document.getElementById('f-etage').value;
  einsatz.zielort     = document.getElementById('f-zielort').value;
  einsatz.zielStation = document.getElementById('f-ziel-station').value;
  einsatz.patient     = document.getElementById('f-patient').value;
  einsatz.alter       = document.getElementById('f-alter').value;
  einsatz.geschlecht  = document.getElementById('f-geschlecht').value;
  einsatz.bewusstsein = document.getElementById('f-bewusstsein').value;
  einsatz.status      = document.getElementById('f-einsatz-status').value;

  renderEinsatzliste();
  STATE.simulation.letzteAktion = Date.now();
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
}

// ---- AAO ----
function renderAaoChips(aao) {
  const container = document.getElementById('aao-chips');
  container.innerHTML = '';
  (aao || []).forEach((em, idx) => {
    const chip = document.createElement('div');
    chip.className = 'aao-chip';
    chip.innerHTML = `<span>${em}</span><button class="chip-remove" onclick="aaoEntfernen(${idx})">✕</button>`;
    container.appendChild(chip);
  });
}

function aaoHinzufuegen() {
  const sel = document.getElementById('aao-select-em');
  const val = sel.value;
  if (!val) return;
  if (!STATE.aktiverEinsatz) return;

  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;
  if (!einsatz.aao.includes(val)) {
    einsatz.aao.push(val);
    renderAaoChips(einsatz.aao);
  }
  sel.value = '';
  STATE.simulation.letzteAktion = Date.now();
}

function aaoEntfernen(idx) {
  if (!STATE.aktiverEinsatz) return;
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;
  einsatz.aao.splice(idx, 1);
  renderAaoChips(einsatz.aao);
}

function aaoVorschlag() {
  if (!STATE.aktiverEinsatz) return;
  const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
  if (!einsatz) return;

  // Szenario-AAO Vorschlag wenn vorhanden
  if (einsatz.szenarioId) {
    const sz = STATE.szenarien.find(s => s.id === einsatz.szenarioId);
    if (sz && sz.aao) {
      const vorschlag = [...(sz.aao.primaer || [])];
      const hint = document.getElementById('aao-hint');
      hint.textContent = `Vorschlag: ${vorschlag.join(', ')}`;

      einsatz.aao = vorschlag.map(v => {
        // Typ zu Kennung mappen
        if (v === 'RTW') return zufallVerfuegbaresEm('RTW');
        if (v === 'NEF') return '10-101';
        if (v === 'KTW') return zufallVerfuegbaresEm('KTW');
        if (v === 'EL')  return '20-701';
        if (v === 'C6')  return 'C6';
        if (v === 'First Responder') return 'FR-Gnigl';
        if (v === 'KIT') return 'KIT-SBG';
        return v;
      }).filter(Boolean);

      renderAaoChips(einsatz.aao);
      prueferLog('info', `AAO-Vorschlag angefordert für ${einsatz.rnkr}`);
      return;
    }
  }
  document.getElementById('aao-hint').textContent = 'Kein Szenario aktiv';
}

function zufallVerfuegbaresEm(typ) {
  const verfuegbar = STATE.einsatzmittel.filter(em =>
    em.typ === typ && (em.status === '00' || em.status === '06') && em.besetzt
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
    addFunkMsg('system', 'SYSTEM', 'Keine Einsatzmittel in der AAO – bitte zuerst Einsatzmittel zuweisen.');
    return;
  }

  einsatz.alarmiert = true;
  einsatz.status = 'laufend';
  document.getElementById('f-einsatz-status').value = 'laufend';

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

  // Funk-Bestätigung von erstem EM
  const erstesEm = einsatz.aao[0];
  const em = STATE.einsatzmittel.find(e => e.kennung === erstesEm);
  if (em) {
    setTimeout(() => {
      addFunkMsg('incoming', erstesEm, `${erstesEm} an Leitstelle – Auftrag für ${einsatz.stichwort} empfangen, Adresse ${einsatz.adresse || '?'}, wir rücken aus.`);
    }, zufallZahl(15, 45) * 1000);
  }
}

// ---- FAHRT-ZYKLUS SIMULATION ----
function starteFahrtZyklus(kennung, einsatz) {
  const em = STATE.einsatzmittel.find(e => e.kennung === kennung);
  if (!em) return;

  const fahrtzeit = getFahrtzeit(em.typ); // Minuten
  const einsatzdauer = zufallZahl(15, 35); // Minuten
  const rueckfahrt   = getFahrtzeit(em.typ);
  const einsatzAdresse = einsatz.adresse || 'unbekannt';

  // Status 01
  setEmStatus(kennung, '01', einsatzAdresse);

  // Status 02 nach 30-90 Sek
  setTimeout(() => {
    setEmStatus(kennung, '02', einsatzAdresse);
    em.zeitAus = zeitStempel();
  }, zufallZahl(30, 90) * 1000);

  // Status 03 nach Fahrtzeit
  setTimeout(() => {
    setEmStatus(kennung, '03', einsatzAdresse);
    em.zeitEEO = zeitStempel();
    einsatzDokuInterneintrag(einsatz, `${kennung} am Einsatzort (${em.zeitEEO})`);
    renderDoku(einsatz.doku);
  }, (fahrtzeit * 60) * 1000);

  // Status 04 nach Einsatzdauer
  setTimeout(() => {
    setEmStatus(kennung, '04', einsatz.zielort || 'Ziel');
    em.zeitAEO = zeitStempel();
    einsatzDokuInterneintrag(einsatz, `${kennung} Abfahrt Einsatzort → ${einsatz.zielort || 'Ziel'} (${em.zeitAEO})`);
    renderDoku(einsatz.doku);
  }, ((fahrtzeit + einsatzdauer) * 60) * 1000);

  // Status 05/07 nach Fahrt zum Ziel
  setTimeout(() => {
    if (einsatz.zielort) {
      setEmStatus(kennung, '05', einsatz.zielort);
      em.zeitEZO = zeitStempel();
    } else {
      setEmStatus(kennung, '07', '');
    }
  }, ((fahrtzeit + einsatzdauer + rueckfahrt) * 60) * 1000);

  // Status 00 zurück
  setTimeout(() => {
    setEmStatus(kennung, '00', '');
    em.zeitAus = em.zeitEEO = em.zeitAEO = em.zeitEZO = null;
    em.aktuelleAdresse = '';
    einsatz.einsatzmittelZurueck = (einsatz.einsatzmittelZurueck || 0) + 1;
    renderStatusScreen();
  }, ((fahrtzeit + einsatzdauer + rueckfahrt + 10) * 60) * 1000);
}

function setEmStatus(kennung, status, adresse) {
  const em = STATE.einsatzmittel.find(e => e.kennung === kennung);
  if (!em) return;
  em.status = status;
  if (adresse !== undefined) em.aktuelleAdresse = adresse;
  em.zeitStatus = zeitStempel();
  renderStatusScreen();
}

// ---- EINSATZLISTE ----
function renderEinsatzliste() {
  const tbody = document.getElementById('einsatzliste-tbody');
  const aktive = STATE.einsaetze.filter(e => e.status !== 'abgeschlossen');

  if (aktive.length === 0) {
    tbody.innerHTML = '<tr class="einsatz-empty-row"><td colspan="8">Keine aktiven Einsätze</td></tr>';
    return;
  }

  tbody.innerHTML = aktive.map(e => `
    <tr class="einsatz-row${STATE.aktiverEinsatz === e.id ? ' active' : ''}" data-einsatz-id="${e.id}" onclick="einsatzOeffnen(${e.id})">
      <td>${e.zeitErstellt}</td>
      <td style="font-family:var(--font-mono);font-size:10px;color:var(--cyan)">${e.rnkr}</td>
      <td>${e.stichwort || '–'}</td>
      <td><span style="font-size:10px;color:var(--text-secondary)">${e.status}</span></td>
      <td style="font-size:10px;max-width:140px;overflow:hidden;text-overflow:ellipsis">${e.adresse || '–'}</td>
      <td style="font-size:10px;color:var(--text-dim)">${(e.aao||[]).slice(0,3).join(', ')}${e.aao?.length > 3 ? '…' : ''}</td>
      <td><span class="prio-badge prio-${e.prioritaet}">${e.prioritaet}</span></td>
      <td><button class="btn-small" onclick="event.stopPropagation();einsatzOeffnen(${e.id})">Öffnen</button></td>
    </tr>
  `).join('');
}

// ---- FUNK ----
function initFunkHandlers() {
  const input  = document.getElementById('funk-input');
  const btnSend = document.getElementById('btn-funk-send');

  input.addEventListener('keydown', e => { if (e.key === 'Enter') sendFunk(); });
  btnSend.addEventListener('click', sendFunk);
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

function addFunkMsg(typ, sender, text) {
  const container = document.getElementById('funk-messages');
  const div = document.createElement('div');
  div.className = `funk-msg ${typ}`;
  div.innerHTML = `
    <span class="funk-msg-time">${zeitStempel()}</span>
    <span class="funk-msg-sender">${sender}:</span>
    <span class="funk-msg-text">${text}</span>
  `;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;

  // Funk-Input aktivieren sobald Simulation läuft
  if (STATE.simulation.aktiv) {
    document.getElementById('funk-input').disabled = false;
    document.getElementById('btn-funk-send').disabled = false;
  }
}

// ---- ALARM TOAST ----
function zeigeAlarmToast(szenario) {
  // Alte Toasts entfernen
  document.querySelectorAll('.alarm-toast').forEach(t => t.remove());

  const toast = document.createElement('div');
  toast.className = 'alarm-toast';
  toast.innerHTML = `
    <div class="alarm-toast-header">🚨 Neuer Notruf – ${szenario.prioritaet}</div>
    <div class="alarm-toast-body">
      <strong>${szenario.stichwort}</strong><br>
      ${szenario.einsatzort}<br>
      <span style="color:var(--text-secondary);font-size:11px">${szenario.beschreibung?.slice(0,100)}...</span>
    </div>
    <div class="alarm-toast-actions">
      <button class="btn-alarm-accept" onclick="toastAnnehmen(${JSON.stringify(szenario.id).replace(/"/g,'&quot;')})">✓ Einsatz anlegen</button>
      <button class="btn-alarm-later" onclick="this.closest('.alarm-toast').remove()">Später</button>
    </div>
  `;
  document.body.appendChild(toast);

  // Nach 45 Sek automatisch weg – aber dann KI bewertet
  setTimeout(() => {
    if (toast.parentNode) {
      toast.remove();
      prueferLog('warn', `Notruf ${szenario.id} nicht angenommen innerhalb 45 Sek`);
    }
  }, 45000);
}

function toastAnnehmen(szenarioId) {
  document.querySelectorAll('.alarm-toast').forEach(t => t.remove());
  const sz = STATE.szenarien.find(s => s.id === szenarioId);
  if (sz) {
    const einsatz = neuerEinsatz(sz);
    prueferLog('good', `Notruf ${szenarioId} angenommen, Einsatz ${einsatz.rnkr} erstellt`);
    // Funk: eingehender Notruf
    addFunkMsg('incoming', 'NOTRUF', `Eingehender Notruf: ${sz.stichwort} – ${sz.einsatzort}`);
  }
}

// ---- KI FUNK-ANTWORT (Anthropic API) ----
async function generiereKIFunkAntwort(disponenText) {
  const aktiveEinsaetze = STATE.einsaetze.filter(e => e.status !== 'abgeschlossen');
  const emStatus = STATE.einsatzmittel.slice(0,10).map(em =>
    `${em.kennung}(${em.status})`
  ).join(', ');

  const systemPrompt = `Du bist ein Funk-Simulator für eine Rettungsleitstelle in Salzburg, Österreich.
Du simulierst Funkgespräche von Einsatzmitteln (RTW, NEF, KTW, Bergrettung etc.) an die Leitstelle.
Aktuelle Lage: ${aktiveEinsaetze.length} aktive Einsätze. Einsatzmittel-Status: ${emStatus}.
Drucklevel: ${STATE.simulation.drucklevel}/5.
Antworte KURZ und REALISTISCH wie ein echter Sanitäter/Rettungsfahrer im Funk.
Österreichischer Funkkjargon. Max 2 Sätze. Kein "Guten Tag" etc.
Wenn der Disponent etwas anweist: bestätige oder melde ein Problem.
Reagiere auf was der Disponent sagt: "${disponenText}"`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 150,
        messages: [{ role: 'user', content: disponenText }],
        system: systemPrompt
      })
    });

    if (response.ok) {
      const data = await response.json();
      const antwort = data.content?.[0]?.text?.trim();
      if (antwort) {
        // Welches Einsatzmittel antwortet?
        const sender = ermittleFunkSender();
        setTimeout(() => {
          addFunkMsg('incoming', sender, antwort);
        }, zufallZahl(2, 6) * 1000);
      }
    }
  } catch(e) {
    // API nicht verfügbar – einfache Fallback-Antwort
    const sender = ermittleFunkSender();
    setTimeout(() => {
      const antworten = [
        'Verstanden, führen aus.',
        'Kopiert, wir sind unterwegs.',
        'Bestätigt. Melden uns bei Eintreffen.',
        'Roger, Leitstelle. Auf dem Weg.',
        'Ja, erledigt. Danke.'
      ];
      addFunkMsg('incoming', sender, antworten[Math.floor(Math.random()*antworten.length)]);
    }, zufallZahl(2, 5) * 1000);
  }
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

  document.getElementById('sim-status-ind').querySelector('.status-dot').className = 'status-dot running';
  document.getElementById('sim-status-text').textContent = 'Läuft';
  document.getElementById('funk-input').disabled = false;
  document.getElementById('btn-funk-send').disabled = false;

  addFunkMsg('alert', '⚡ SIMULATOR', 'Übung gestartet. Erste Einsätze werden eingespielt...');
  prueferLog('good', 'Simulation gestartet');

  // Erstes Szenario nach 5-10 Sek
  setTimeout(spieleSzenarioEin, zufallZahl(5, 10) * 1000);

  // Drucksteuerungs-Loop alle 30 Sek
  STATE.simulation.druckLoop = setInterval(aktualisiereDrucklevel, 30000);

  if (STATE.rolle === 'pruefer') {
    document.getElementById('btn-uebung-start').disabled = true;
    document.getElementById('btn-uebung-stop').disabled = false;
  }
}

function stoppSimulation() {
  STATE.simulation.aktiv = false;
  clearInterval(STATE.simulation.druckLoop);
  STATE.simulation.eskalationsTimer.forEach(t => clearTimeout(t));
  STATE.simulation.eskalationsTimer = [];

  document.getElementById('sim-status-ind').querySelector('.status-dot').className = 'status-dot idle';
  document.getElementById('sim-status-text').textContent = 'Gestoppt';

  addFunkMsg('system', 'SIMULATOR', 'Übung beendet.');
  prueferLog('info', 'Simulation gestoppt');

  if (STATE.rolle === 'pruefer') {
    document.getElementById('btn-uebung-start').disabled = false;
    document.getElementById('btn-uebung-stop').disabled = true;
  }
}

function aktualisiereDrucklevel() {
  if (!STATE.simulation.aktiv) return;

  const offeneEinsaetze = STATE.einsaetze.filter(e => e.status !== 'abgeschlossen').length;
  const sekSeitLetzterAktion = (Date.now() - (STATE.simulation.letzteAktion || Date.now())) / 1000;
  const alteLevel = STATE.simulation.drucklevel;

  // Drucklevel berechnen
  if (offeneEinsaetze === 0 && sekSeitLetzterAktion > 20) {
    // Disponent hat nichts zu tun – Druck erhöhen
    STATE.simulation.drucklevel = Math.min(5, STATE.simulation.drucklevel + 1);
  } else if (offeneEinsaetze >= 4) {
    STATE.simulation.drucklevel = Math.min(5, STATE.simulation.drucklevel + 1);
  } else if (offeneEinsaetze <= 1 && sekSeitLetzterAktion < 30) {
    STATE.simulation.drucklevel = Math.max(1, STATE.simulation.drucklevel - 1);
  }

  if (STATE.simulation.drucklevel !== alteLevel) {
    prueferLog('info', `Drucklevel: ${STATE.simulation.drucklevel}/5`);
  }

  // Nächstes Szenario basierend auf Drucklevel
  const pauseMs = berechnePause();
  setTimeout(spieleSzenarioEin, pauseMs);
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

  // Alarm-Toast zeigen
  zeigeAlarmToast(sz);

  // Funk-Notruf
  addFunkMsg('alert', '⚡ NOTRUF', `Eingehend: ${sz.stichwort} – ${sz.einsatzort}`);

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
  planEskalationen(sz);
}

function planEskalationen(sz) {
  if (!sz.eskalationen || sz.eskalationen.length === 0) return;

  sz.eskalationen.forEach(esk => {
    // Trigger-Zeit parsen (z.B. "nach 8 Min")
    const match = esk.trigger.match(/nach (\d+) Min/);
    const minuten = match ? parseInt(match[1]) : 15;

    const timer = setTimeout(() => {
      if (!STATE.simulation.aktiv) return;

      // Funk-Meldung
      const aktiveEm = STATE.einsatzmittel.find(em => ['02','03'].includes(em.status));
      const sender = aktiveEm ? aktiveEm.kennung : 'EINHEIT';
      addFunkMsg('incoming', sender, esk.ereignis);

      // Prüfer-Log
      prueferLog('warn', `Eskalation: ${esk.ereignis.slice(0,60)}`);

      // Doku-Eintrag im aktiven Einsatz
      if (STATE.aktiverEinsatz) {
        const einsatz = STATE.einsaetze.find(e => e.id === STATE.aktiverEinsatz);
        if (einsatz) {
          einsatz.doku.push({
            ts: zeitStempel(), wer: sender, text: esk.ereignis, ki: true
          });
          renderDoku(einsatz.doku);
        }
      }
    }, minuten * 60 * 1000);

    STATE.simulation.eskalationsTimer.push(timer);
  });
}

// ---- PRÜFER PANEL ----
function initPrueferPanel() {
  document.getElementById('pruefer-toggle-btn').addEventListener('click', () => {
    const overlay = document.getElementById('pruefer-overlay');
    overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
  });

  document.getElementById('btn-pruefer-close').addEventListener('click', () => {
    document.getElementById('pruefer-overlay').style.display = 'none';
  });

  document.getElementById('btn-uebung-start').addEventListener('click', startSimulation);
  document.getElementById('btn-uebung-stop').addEventListener('click', stoppSimulation);
  document.getElementById('btn-uebung-auswertung').addEventListener('click', zeigeAuswertung);

  renderPrueferSzenarioListe();

  document.getElementById('pruefer-filter-kat').addEventListener('change', renderPrueferSzenarioListe);
  document.getElementById('btn-manuell-szenario').addEventListener('click', manuellSzenario);
}

function renderPrueferSzenarioListe() {
  const filter = document.getElementById('pruefer-filter-kat').value;
  const liste  = document.getElementById('pruefer-szenario-liste');
  const gefiltert = filter
    ? STATE.szenarien.filter(s => s.kategorie === filter)
    : STATE.szenarien;

  liste.innerHTML = gefiltert.slice(0, 30).map(sz => `
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
  zeigeAlarmToast(sz);
  addFunkMsg('alert', '⚡ NOTRUF', `Eingehend (manuell): ${sz.stichwort} – ${sz.einsatzort}`);
  prueferLog('info', `Manuell eingespielt: ${sz.id}`);
  document.getElementById('pruefer-overlay').style.display = 'none';
}

// ---- PRÜFER LOG ----
function prueferLog(typ, text) {
  const eintrag = { ts: zeitStempel(), typ, text };
  STATE.prueferLog.push(eintrag);

  const container = document.getElementById('pruefer-log');
  if (!container) return;

  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `<span class="log-ts">${eintrag.ts}</span><span class="log-${typ}">${text}</span>`;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// ---- AUSWERTUNG ----
function zeigeAuswertung() {
  const overlay = document.createElement('div');
  overlay.className = 'auswertung-overlay';

  const laufzeit = STATE.simulation.startzeit
    ? Math.floor((Date.now() - STATE.simulation.startzeit) / 60000)
    : 0;

  const gesamtEinsaetze = STATE.einsaetze.length;
  const abgeschlossen   = STATE.einsaetze.filter(e => e.status === 'abgeschlossen').length;
  const alarmiert       = STATE.einsaetze.filter(e => e.alarmiert).length;

  overlay.innerHTML = `
    <div class="auswertung-panel">
      <h2>📊 Übungsauswertung</h2>
      <div class="auswertung-section">
        <h3>Übersicht</h3>
        <div class="auswertung-kriterium">
          <span class="krit-icon">⏱</span>
          <span class="krit-text">Übungsdauer</span>
          <span class="krit-zeit">${laufzeit} Minuten</span>
        </div>
        <div class="auswertung-kriterium">
          <span class="krit-icon">📋</span>
          <span class="krit-text">Einsätze gesamt angelegt</span>
          <span class="krit-zeit">${gesamtEinsaetze}</span>
        </div>
        <div class="auswertung-kriterium">
          <span class="krit-icon">${alarmiert === gesamtEinsaetze ? '✅' : '⚠️'}</span>
          <span class="krit-text">Einsätze alarmiert</span>
          <span class="krit-zeit">${alarmiert} / ${gesamtEinsaetze}</span>
        </div>
        <div class="auswertung-kriterium">
          <span class="krit-icon">${abgeschlossen > 0 ? '✅' : '⚠️'}</span>
          <span class="krit-text">Einsätze abgeschlossen</span>
          <span class="krit-zeit">${abgeschlossen} / ${gesamtEinsaetze}</span>
        </div>
      </div>
      <div class="auswertung-section">
        <h3>Aktivitäts-Protokoll (letzte 20 Einträge)</h3>
        ${STATE.prueferLog.slice(-20).map(e =>
          `<div class="auswertung-kriterium">
            <span class="krit-icon" style="color:var(--${e.typ==='good'?'green':e.typ==='warn'?'yellow':'cyan'})">${e.typ==='good'?'✓':e.typ==='warn'?'⚠':e.typ==='bad'?'✗':'ℹ'}</span>
            <span class="krit-text">${e.text}</span>
            <span class="krit-zeit">${e.ts}</span>
          </div>`
        ).join('')}
      </div>
      <div style="text-align:center;margin-top:16px">
        <button class="btn-action btn-save" onclick="this.closest('.auswertung-overlay').remove()">Schließen</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
}
