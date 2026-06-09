# RK Salzburg – Leitstellen Simulator
## Disponenten-Assessment Tool

---

## Dateien

```
rettungsleitstelle/
├── index.html          ← Hauptanwendung (hier starten)
├── statusschirm.html   ← Statusschirm für zweiten Monitor
├── style.css           ← Design
├── data.js             ← Einsatzmittel, Status-Definitionen
├── app.js              ← Hauptlogik
├── extensions.js       ← Sprachausgabe, API, Einstellungen
└── szenarien.json      ← 100 Szenarien (editierbar)
```

---

## ⚡ Schnellstart (3 Schritte)

### 1. Webserver starten
```bash
cd rettungsleitstelle
python3 -m http.server 8080
```

### 2. Browser öffnen
```
http://localhost:8080
```

### 3. Anmelden & Üben
- **Disponent:** PIN `1234` + beliebiger Name
- **Prüfer:** PIN `9999` + beliebiger Name
- **Start:** Prüfer-Panel (🔐) → "Übung starten"

---

## Detaillierte Anleitung

### Lokale Installation

**Voraussetzungen:** Python 3 oder Node.js

**Option 1: Python (empfohlen)**
```bash
cd rettungsleitstelle
python3 -m http.server 8080
# Öffne: http://localhost:8080
```

**Option 2: Node.js**
```bash
cd rettungsleitstelle
npx serve .
# Öffne: http://localhost:3000
```

**Option 3: VS Code Live Server Extension**
1. `index.html` öffnen
2. Rechtsklick → "Open with Live Server"
3. Automatisch im Browser geöffnet

---

## Login

| Rolle        | PIN  | Funktion                                    |
|--------------|------|---------------------------------------------|
| Disponent    | 1234 | Arbeitet mit der Einsatzmaske               |
| Prüfer       | 9999 | Startet Übung, sieht Auswertung, Log        |

**Namen sind frei wählbar** – beliebige Zeichen im Name-Feld eingeben.

---

## Zwei-Monitor-Betrieb

1. `index.html` auf Monitor 1 öffnen (Einsatzmaske + Funk)
2. Über **⚙ Einstellungen → "Statusschirm.html öffnen"** auf Monitor 2 ziehen
3. Statusschirm aktualisiert sich automatisch alle 2 Sekunden

Alternativ: Beide Fenster per **Menü-Tabs** (Statusschirm / Einsatzmaske) umschalten.

---

## KI-Funkgespräche (Anthropic API Key)

Die KI reagiert intelligent auf Funk-Eingaben des Disponenten wenn ein API Key hinterlegt ist.

### Echtzeit KI-Funkgespräche aktivieren:

1. **⚙ Einstellungen** öffnen (rechts unten)
2. Anthropic API Key eingeben (`sk-ant-...`)
3. **"Speichern"** – Key wird im Browser lokal gespeichert

### KI-Verhalten:

Die KI simuliert **realistische Funkgespräche** von Einsatzmitteln:
- **Kontext-Aware:** Berücksichtigt aktive Einsätze und Drucklevel
- **Österreichischer Funkkjargon:** Authentische Sprache von Sanitätern/Fahrern
- **Adaptive Antworten:** Reagiert auf Disponenten-Befehle mit Bestätigungen oder Problemmeldungen
- **Realismusgrad:** 2 Sätze max, keine Floskeln, direkter Funkstil

**Beispiele echter KI-Antworten:**
- "RTW 203 an Leitstelle – Auftrag INT Kardial empfangen, Mirabellplatz, wir rücken sofort aus."
- "NEF 101 – Patient vor Ort, sauerstoffabhängig, Reanimation läuft. UKH Kath-Labor verständigt?"
- "FR Gnigl – AED angelegt, Rhythmus ablesbar. RTW noch 4 Minuten, wir starten CPR."

**Ohne API Key:** Simulator funktioniert mit vordefinierten Fallback-Antworten (weniger dynamisch, aber vollständig nutzbar).

---

## Prüfer-Bedienung

1. Als **Prüfer** (PIN 9999) anmelden
2. 🔐-Button rechts unten öffnet das Prüfer-Panel
3. **"Übung starten"** → KI spielt automatisch Szenarien ein, erhöht Druck wenn Disponent untätig
4. **Manuell einzuspielen:** Szenario aus Katalog wählen → direkt einspielen
5. **Auswertung:** Klick auf **"Auswertung anzeigen"** um detaillierte Bewertung zu sehen

### Neue Auswertungs-Features

Die **erweiterte Auswertung** liefert objektive Leistungsmetriken:

| Metrik | Berechnung | Gewichtung |
|--------|-----------|-----------|
| Alarmquote | Alarmierte / Gesamt-Einsätze | 30 Punkte |
| Abschlussquote | Abgeschlossene / Gesamt-Einsätze | 30 Punkte |
| Reaktionszeit | Durchschnitt aller Reaktionen | 20 Punkte (< 2 Min) |
| Fehlerfreiheit | Keine fehlenden AAO / E1 | 20 Punkte |

**Gesamtbewertung:**
- ⭐ **Sehr gut** (80-100 Punkte) – Einsatzfähig
- 👍 **Gut** (60-79) – Mit Verbesserungen einsatzfähig
- 🤔 **Befriedigend** (40-59) – Weitere Schulung nötig
- ⚠️ **Fehlerberatung** (< 40) – Intensive Betreuung empfohlen

**Im Report enthalten:**
- Gesamtpunkte und Bewertung
- Ø Reaktionszeit pro Einsatz
- Fehleranalyse mit Kontext
- Top 5 schnellste Reaktionen
- Vollständiges Aktivitäts-Protokoll
- **PDF-Export** für Unterlagen

---

## 🔴 Drucklevel-System (Adaptive Schwierigkeitssteuerung)

Das System erhöht oder senkt **automatisch** den Druck basierend auf Disponent-Performance:

| Level | Auslöser | Pause zwischen Einsätzen | Szenario-Mix |
|-------|----------|-------------------------|-------------|
| 🟢 1 | Alles abgearbeitet, > 25s inaktiv | 60–90 Sek | Alle E1-E3 |
| 🟡 2 | Normal, 1–2 offene Einsätze | 40–60 Sek | 70% E2/E3, 30% E1 |
| 🟠 3 | 3 offene Einsätze | 25–40 Sek | 50% E1, 50% andere |
| 🔴 4 | 4+ offene Einsätze | 15–25 Sek | 80% E1, 20% andere |
| 🔥 5 | Überlastung: > 6 offene | 8–15 Sek | Nur E1 (Notarzt, Reanimation) |

**Intelligente Anpassung:** Das System erkennt wenn der Disponent "sabbotiert" (zu langsam) und erhöht den Druck. Wenn der Disponent alles schnell abarbeitet, wird es einfacher.

---

## Szenarien anpassen (`szenarien.json`)

Jedes Szenario hat diese Felder:

```json
{
  "id": "S001",
  "kategorie": "Interne Notfälle",
  "titel": "Herzinfarkt – Bürogebäude",
  "prioritaet": "E1",
  "stichwort": "INT – Kardial",
  "beschreibung": "...",
  "einsatzort": "Salzburg, Mirabellplatz 4",
  "patient": { "alter": 55, "geschlecht": "m", "bewusstsein": "wach", "atmung": "flach" },
  "aao": {
    "primaer": ["RTW", "NEF"],
    "sekundaer": [],
    "optional": ["EL"]
  },
  "eskalationen": [
    {
      "trigger": "nach 8 Min kein NEF disponiert",
      "ereignis": "RTW meldet: Patient bewusstlos – NEF dringend anfordern"
    }
  ],
  "erwartete_aktionen": ["RTW und NEF alarmieren", "Zielkrankenhaus festlegen"],
  "bewertungskriterien": ["Alarmierungszeit < 90 Sek", "NEF disponiert"]
}
```

**Szenarien hinzufügen:** Einfach neues Objekt mit fortlaufender ID (S101, S102...) ans Array anhängen.

**Eskalations-Trigger:** Format `"nach X Min"` – der Timer startet mit Alarm-Zeitpunkt.

---

## Status-Codes (Einsatzmittel)

| Code | Bedeutung              | Farbe       |
|------|------------------------|-------------|
| 00   | In Dienststelle        | Grün        |
| 01   | Auftrag angenommen     | Hellgrün    |
| 02   | Anfahrt Einsatzort     | Orange      |
| 03   | Am Einsatzort          | Rot         |
| 04   | Abfahrt vom EO         | Orange-Gelb |
| 05   | Am Zielort             | Hellblau    |
| 06   | Einsatzbereit          | Grün        |
| 07   | Unterwegs Dienststelle | Mittelgrün  |
| 08   | Position LKH           | Blauviolett |
| 09   | Position UKH           | Blauviolett |
| 10   | Position CDK           | Blauviolett |
| 19   | Pause                  | Grau        |
| 80   | Dienstfahrt            | Graublau    |
| 82   | Außer Betrieb          | Dunkelgrau  |
| 83   | Unbesetzt in DSt       | Fast schwarz|
| 88   | Anfahrt Position       | Gelb        |

---

## Einsatzmittel

| Kennung       | Typ          | Kompetenzen |
|---------------|--------------|-------------|
| 20-201..207   | RTW          | RS, RA      |
| 20-301..308   | KTW          | RS          |
| 10-101        | NEF          | NA, RA      |
| C6            | Hubschrauber | NA, RA      |
| 20-701        | Einsatzleiter| EL          |
| FR-Koppl..    | First Resp.  | EH, AED     |
| BRG-Grödig..  | Bergrettung  | BRG         |
| WR-Wolfg..    | Wasserrettung| WR          |
| HHR-Werfen    | Höhlenrettung| HHR         |
| KIT-SBG       | KIT          | KIT         |

---

## GitHub Einrichtung

```bash
git init
git add .
git commit -m "ELS Simulator v1.0"
git remote add origin https://github.com/DEIN-USER/els-simulator.git
git push -u origin main
```

Für Hosting ohne Server: **GitHub Pages** aktivieren → `index.html` läuft direkt im Browser.
(API-Calls funktionieren dann nur mit gesetztem API Key und aktiviertem CORS-Header)

---

## Bekannte Einschränkungen

- API-Calls direkt aus dem Browser benötigen `anthropic-dangerous-direct-browser-access: true`
- Sprachausgabe funktioniert am besten in Chrome/Edge (Deutsche Stimme)
- Beim direkten Öffnen als `file://` können API-Calls blockiert sein → lokalen Server nutzen

---

*Version 1.0 – RK Salzburg Leitstellen Simulator*
