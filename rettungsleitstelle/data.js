// ============================================================
// data.js – Einsatzmittel, Status-Definitionen, Stammdaten
// RK Salzburg – Leitstellen Simulator
// ============================================================

const STATUS_DEFINITIONEN = {
  "00": { text: "In Dienststelle",         farbe: "#00c853", dunkel: false },
  "01": { text: "Auftrag angenommen",      farbe: "#76ff03", dunkel: false },
  "02": { text: "Anfahrt EO",              farbe: "#ff6d00", dunkel: true  },
  "03": { text: "Am Einsatzort",           farbe: "#e3000b", dunkel: true  },
  "04": { text: "Abfahrt vom EO",          farbe: "#ff9100", dunkel: true  },
  "05": { text: "Am Zielort",              farbe: "#29b6f6", dunkel: false },
  "06": { text: "Einsatzbereit",           farbe: "#00c853", dunkel: false },
  "07": { text: "Unterwegs Dienststelle",  farbe: "#66bb6a", dunkel: false },
  "08": { text: "Position LKH",            farbe: "#5c6bc0", dunkel: true  },
  "09": { text: "Position UKH",            farbe: "#5c6bc0", dunkel: true  },
  "10": { text: "Position CDK",            farbe: "#5c6bc0", dunkel: true  },
  "19": { text: "Pause",                   farbe: "#9e9e9e", dunkel: false },
  "80": { text: "Dienstfahrt",             farbe: "#78909c", dunkel: true  },
  "82": { text: "Außer Betrieb",           farbe: "#37474f", dunkel: true  },
  "83": { text: "Unbesetzt in DSt",        farbe: "#263238", dunkel: true  },
  "88": { text: "Anfahrt Position",        farbe: "#ffd600", dunkel: false }
};

// Alle Einsatzmittel des Simulators
const EINSATZMITTEL_STAMM = [
  // ---- RTW ----
  { kennung: "20-201", typ: "RTW",  name: "RTW 201", gruppe: "RK Salzburg Stadt", kompetenzen: ["RS","RA"], status: "00", besetzt: true  },
  { kennung: "20-202", typ: "RTW",  name: "RTW 202", gruppe: "RK Salzburg Stadt", kompetenzen: ["RS","RA"], status: "00", besetzt: true  },
  { kennung: "20-203", typ: "RTW",  name: "RTW 203", gruppe: "RK Salzburg Stadt", kompetenzen: ["RS","RA"], status: "00", besetzt: true  },
  { kennung: "20-204", typ: "RTW",  name: "RTW 204", gruppe: "RK Salzburg Stadt", kompetenzen: ["RS","RA"], status: "06", besetzt: true  },
  { kennung: "20-205", typ: "RTW",  name: "RTW 205", gruppe: "RK Salzburg Stadt", kompetenzen: ["RS","RA"], status: "00", besetzt: true  },
  { kennung: "20-206", typ: "RTW",  name: "RTW 206", gruppe: "RK Salzburg Stadt", kompetenzen: ["RS","RA"], status: "83", besetzt: false },
  { kennung: "20-207", typ: "RTW",  name: "RTW 207", gruppe: "RK Salzburg Stadt", kompetenzen: ["RS","RA"], status: "82", besetzt: false },

  // ---- KTW ----
  { kennung: "20-301", typ: "KTW",  name: "KTW 301", gruppe: "RK Salzburg Stadt", kompetenzen: ["RS"],      status: "00", besetzt: true  },
  { kennung: "20-302", typ: "KTW",  name: "KTW 302", gruppe: "RK Salzburg Stadt", kompetenzen: ["RS"],      status: "00", besetzt: true  },
  { kennung: "20-303", typ: "KTW",  name: "KTW 303", gruppe: "RK Salzburg Stadt", kompetenzen: ["RS"],      status: "19", besetzt: true  },
  { kennung: "20-304", typ: "KTW",  name: "KTW 304", gruppe: "RK Salzburg Stadt", kompetenzen: ["RS"],      status: "00", besetzt: true  },
  { kennung: "20-305", typ: "KTW",  name: "KTW 305", gruppe: "RK Salzburg Stadt", kompetenzen: ["RS"],      status: "83", besetzt: false },
  { kennung: "20-306", typ: "KTW",  name: "KTW 306", gruppe: "RK Salzburg Stadt", kompetenzen: ["RS"],      status: "83", besetzt: false },
  { kennung: "20-307", typ: "KTW",  name: "KTW 307", gruppe: "RK Salzburg Stadt", kompetenzen: ["RS"],      status: "00", besetzt: true  },
  { kennung: "20-308", typ: "KTW",  name: "KTW 308", gruppe: "RK Salzburg Stadt", kompetenzen: ["RS"],      status: "00", besetzt: true  },

  // ---- NEF ----
  { kennung: "10-101", typ: "NEF",  name: "NEF 101", gruppe: "RK Salzburg Stadt", kompetenzen: ["NA","RA"], status: "00", besetzt: true  },

  // ---- Hubschrauber ----
  { kennung: "C6",     typ: "HELI", name: "Christophorus 6", gruppe: "Luftrettung", kompetenzen: ["NA","RA"], status: "00", besetzt: true },

  // ---- Einsatzleiter ----
  { kennung: "20-701", typ: "EL",   name: "Einsatzleiter", gruppe: "RK Salzburg Stadt", kompetenzen: ["EL"], status: "00", besetzt: true },

  // ---- First Responder ----
  { kennung: "FR-Koppl",    typ: "FR", name: "FR Koppl",    gruppe: "First Responder", kompetenzen: ["EH","AED"], status: "00", besetzt: true },
  { kennung: "FR-Gnigl",    typ: "FR", name: "FR Gnigl",    gruppe: "First Responder", kompetenzen: ["EH","AED"], status: "00", besetzt: true },
  { kennung: "FR-Maxglan",  typ: "FR", name: "FR Maxglan",  gruppe: "First Responder", kompetenzen: ["EH","AED"], status: "00", besetzt: true },
  { kennung: "FR-Liefering",typ: "FR", name: "FR Liefering",gruppe: "First Responder", kompetenzen: ["EH","AED"], status: "00", besetzt: true },
  { kennung: "FR-Bergheim", typ: "FR", name: "FR Bergheim", gruppe: "First Responder", kompetenzen: ["EH","AED"], status: "00", besetzt: true },
  { kennung: "FR-Taxham",   typ: "FR", name: "FR Taxham",   gruppe: "First Responder", kompetenzen: ["EH","AED"], status: "00", besetzt: true },

  // ---- Bergrettung ----
  { kennung: "BRG-Grödig",        typ: "BRG", name: "Bergrettung Grödig",         gruppe: "Bergrettung", kompetenzen: ["BRG"], status: "00", besetzt: true },
  { kennung: "BRG-Gaisberg",      typ: "BRG", name: "Bergrettung Gaisberg",       gruppe: "Bergrettung", kompetenzen: ["BRG"], status: "00", besetzt: true },
  { kennung: "BRG-Saalbach",      typ: "BRG", name: "Bergrettung Saalbach",       gruppe: "Bergrettung", kompetenzen: ["BRG"], status: "00", besetzt: true },
  { kennung: "BRG-Mühlbach",      typ: "BRG", name: "Bergrettung Mühlbach",       gruppe: "Bergrettung", kompetenzen: ["BRG"], status: "00", besetzt: true },
  { kennung: "BRG-Werfen",        typ: "BRG", name: "Bergrettung Werfen",         gruppe: "Bergrettung", kompetenzen: ["BRG"], status: "00", besetzt: true },
  { kennung: "BRG-Hintersee",     typ: "BRG", name: "Bergrettung Hintersee",      gruppe: "Bergrettung", kompetenzen: ["BRG"], status: "00", besetzt: true },
  { kennung: "BRG-StGilgen",      typ: "BRG", name: "Bergrettung St. Gilgen",     gruppe: "Bergrettung", kompetenzen: ["BRG"], status: "00", besetzt: true },
  { kennung: "BRG-Bischofshofen", typ: "BRG", name: "Bergrettung Bischofshofen", gruppe: "Bergrettung", kompetenzen: ["BRG"], status: "00", besetzt: true },

  // ---- Wasserrettung ----
  { kennung: "WR-Wolfgangsee", typ: "WR", name: "Wasserrettung Wolfgangsee", gruppe: "Wasserrettung", kompetenzen: ["WR"], status: "00", besetzt: true },
  { kennung: "WR-Mondsee",     typ: "WR", name: "Wasserrettung Mondsee",     gruppe: "Wasserrettung", kompetenzen: ["WR"], status: "00", besetzt: true },
  { kennung: "WR-Mattsee",     typ: "WR", name: "Wasserrettung Mattsee",     gruppe: "Wasserrettung", kompetenzen: ["WR"], status: "00", besetzt: true },
  { kennung: "WR-Fuschlsee",   typ: "WR", name: "Wasserrettung Fuschlsee",   gruppe: "Wasserrettung", kompetenzen: ["WR"], status: "00", besetzt: true },
  { kennung: "WR-Salzach",     typ: "WR", name: "Wasserrettung Salzach",     gruppe: "Wasserrettung", kompetenzen: ["WR"], status: "00", besetzt: true },
  { kennung: "WR-Golling",     typ: "WR", name: "Wasserrettung Golling",     gruppe: "Wasserrettung", kompetenzen: ["WR"], status: "00", besetzt: true },

  // ---- Höhlenrettung ----
  { kennung: "HHR-Werfen", typ: "HHR", name: "Höhlenrettung Werfen", gruppe: "Höhlenrettung", kompetenzen: ["HHR"], status: "00", besetzt: true },

  // ---- KIT ----
  { kennung: "KIT-SBG", typ: "KIT", name: "KIT Salzburg", gruppe: "KIT", kompetenzen: ["KIT"], status: "00", besetzt: true }
];

// Realistische Fahrtzeiten (Minuten) nach Einsatzmittel-Typ
const FAHRTZEITEN = {
  RTW:  { min: 4,  max: 12, stadtfaktor: 0.7  },
  KTW:  { min: 5,  max: 15, stadtfaktor: 0.8  },
  NEF:  { min: 4,  max: 10, stadtfaktor: 0.7  },
  HELI: { min: 8,  max: 20, stadtfaktor: 1.0  },
  EL:   { min: 5,  max: 15, stadtfaktor: 0.8  },
  FR:   { min: 3,  max: 8,  stadtfaktor: 0.6  },
  BRG:  { min: 20, max: 60, stadtfaktor: 1.2  },
  WR:   { min: 10, max: 25, stadtfaktor: 1.0  },
  HHR:  { min: 25, max: 45, stadtfaktor: 1.1  },
  KIT:  { min: 8,  max: 20, stadtfaktor: 0.8  }
};

// Einsatzdauer nach Kategorie (Minuten am Einsatzort)
const EINSATZDAUERN = {
  "INT – Kardial":         { min: 15, max: 35 },
  "INT – Reanimation":     { min: 25, max: 50 },
  "INT – Neurologie":      { min: 15, max: 30 },
  "INT – Atemnot":         { min: 12, max: 25 },
  "INT – Sturz":           { min: 15, max: 30 },
  "INT – Bewusstlosigkeit":{ min: 15, max: 30 },
  "KT":                    { min: 10, max: 20 },
  "VU":                    { min: 20, max: 60 },
  "Berg":                  { min: 30, max: 120 },
  "Wasser":                { min: 15, max: 45 },
  "default":               { min: 15, max: 35 }
};

// Benutzer für Login (PIN 1234 für Disponenten, 9999 für Prüfer)
const BENUTZER = [
  { name: "Muster Maria",    kuerzel: "MM", pin: "1234", rolle: "disponent" },
  { name: "Bauer Thomas",    kuerzel: "BT", pin: "1234", rolle: "disponent" },
  { name: "Huber Anna",      kuerzel: "HA", pin: "1234", rolle: "disponent" },
  { name: "Wagner Klaus",    kuerzel: "WK", pin: "1234", rolle: "disponent" },
  { name: "Prüfer Admin",    kuerzel: "PA", pin: "9999", rolle: "pruefer"   },
  { name: "Schreiber Lisa",  kuerzel: "SL", pin: "9999", rolle: "pruefer"   }
];

// RNKR-Zähler Start
let rnkrZaehler = 1000;

function neueRNKR() {
  rnkrZaehler++;
  const datum = new Date();
  const dd = String(datum.getDate()).padStart(2,'0');
  const mm = String(datum.getMonth()+1).padStart(2,'0');
  return `${dd}${mm}-${rnkrZaehler}`;
}

function zeitStempel() {
  const n = new Date();
  return n.toTimeString().slice(0,8);
}

function zufallZahl(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getFahrtzeit(typ) {
  const ft = FAHRTZEITEN[typ] || FAHRTZEITEN.RTW;
  return zufallZahl(ft.min, ft.max);
}

// ============================================================
// PRIORITÄTEN (Schema RK Salzburg)
// ============================================================
const PRIORITAETEN = {
  "A1": "Notarzteinsatz",
  "A3": "Notarzteinsatz (Arzt fordert an)",
  "B1": "Rettungsdienst mit Blaulicht",
  "B3": "Rettungsdienst ohne Blaulicht",
  "D1": "Krankentransport liegend",
  "D2": "Krankentransport sitzend"
};

// Einsatzfahrt = mit Sondersignal → in der Liste fett und rot
function istEinsatzfahrt(prio) {
  return ['A1', 'A3', 'B1'].includes(prio);
}

// Alte Szenario-Codes (E1/E2/E3/KT) auf das neue Schema heben
function konvertierePrio(sz) {
  if (!sz) return 'B1';
  const p = sz.prioritaet;
  if (PRIORITAETEN[p]) return p;

  const primaer = (sz.aao && sz.aao.primaer) || [];
  const brauchtNotarzt = primaer.includes('NEF') || primaer.includes('C6') || primaer.includes('HELI');

  if (p === 'E1') return brauchtNotarzt ? 'A1' : 'B1';
  if (p === 'E2') return brauchtNotarzt ? 'A3' : 'B1';
  if (p === 'E3') return 'B3';
  if (p === 'KT') {
    const text = `${sz.beschreibung || ''} ${sz.titel || ''} ${sz.stichwort || ''}`.toLowerCase();
    return /liegend|trage|bettl|immobil/.test(text) ? 'D1' : 'D2';
  }
  return brauchtNotarzt ? 'A1' : 'B1';
}

// ============================================================
// FUNKSPRÜCHE – Anliegen der Fahrzeuge, nach Status gruppiert.
// Reine Statuswechsel werden NICHT gefunkt, die stehen im Statusschirm.
// ============================================================
const FUNKSPRUECHE = {
  // Status 00/06 – frei
  frei: [
    "wir müssen in die Werkstatt, das Fahrzeug zeigt eine Fehlermeldung.",
    "ist eine Dienstfahrt zur Tankstelle möglich?",
    "können wir auf Pause gehen?",
    "wir bräuchten eine Materialergänzung, Freigabe zur Fahrt ins Lager?",
    "bitte um Fahrzeugtausch, die Hecktür schließt nicht mehr richtig.",
    "ist eine Dienstfahrt zur Wäscherei möglich?",
    "wir würden zur Desinfektion einrücken, Freigabe?",
    "können wir eine Einschulungsfahrt mit dem neuen Kollegen machen?",
    "wir sind wieder verfügbar, melden uns einsatzbereit."
  ],
  // Status 02 – Anfahrt
  anfahrt: [
    "Anfahrt verzögert sich, Stau auf der Westautobahn.",
    "bitte um genauere Objektangabe, wir finden die Zufahrt nicht.",
    "Straße gesperrt, wir fahren Umleitung – Eintreffen verzögert sich.",
    "bitte um Rückruf beim Anrufer, niemand öffnet die Tür.",
    "ist am Einsatzort mit Polizei zu rechnen?"
  ],
  // Status 03 – am Einsatzort
  einsatzort: [
    "wir fordern einen Notarzt nach.",
    "Patient verweigert den Transport, wie sollen wir vorgehen?",
    "wir benötigen die Polizei an der Einsatzstelle.",
    "wir brauchen ein zweites Fahrzeug, zweiter Patient vor Ort.",
    "Türöffnung erforderlich, bitte Feuerwehr alarmieren.",
    "bitte um Tragehilfe, Patient im vierten Stock ohne Lift.",
    "Lage anders als gemeldet, kein Notfall – wir übernehmen als Transport.",
    "Angehörige stark belastet, Kriseninterventionsteam wäre sinnvoll.",
    "bitte um freies Transportziel, wohin sollen wir fahren?"
  ],
  // Status 04/05 – Transport / Zielort
  transport: [
    "Zielklinik hat keinen Platz, bitte um alternatives Transportziel.",
    "Übergabe verzögert sich, Schockraum noch belegt.",
    "Patient wird während der Fahrt instabil, wir fordern ein NEF zum Treffpunkt.",
    "bitte Voranmeldung durchgeben: Verdacht auf Schlaganfall.",
    "Übergabe erfolgt, wir melden uns gleich wieder verfügbar."
  ]
};
