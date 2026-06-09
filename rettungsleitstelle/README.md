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

## Starten

### Lokal im Browser
1. Ordner auf beliebigem Webserver ablegen ODER direkt öffnen
2. `index.html` im Browser öffnen (Chrome/Edge empfohlen)
3. **Wichtig:** Für die KI-Funkgespräche braucht es einen lokalen Webserver
   (CORS-Beschränkung bei file://) – z.B. mit VS Code Live Server

### Mit lokalem Webserver (empfohlen)
```bash
# Option 1: Python
cd rettungsleitstelle
python3 -m http.server 8080
# → http://localhost:8080

# Option 2: Node.js
npx serve .
# → http://localhost:3000
```

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

Die KI reagiert auf Funk-Eingaben des Disponenten wenn ein API Key hinterlegt ist.

1. **⚙ Einstellungen** öffnen
2. Anthropic API Key eingeben (`sk-ant-...`)
3. "Speichern" – Key wird im Browser lokal gespeichert

**Ohne API Key:** Simulator funktioniert vollständig mit vorgefertigten Fallback-Antworten.

---

## Prüfer-Bedienung

1. Als **Prüfer** (PIN 9999) anmelden
2. 🔐-Button rechts unten öffnet das Prüfer-Panel
3. **"Übung starten"** → KI spielt automatisch Szenarien ein, erhöht Druck wenn Disponent untätig
4. **Manuell einzuspielen:** Szenario aus Katalog wählen → direkt einspielen
5. **Auswertung:** Protokoll aller Disponenten-Aktionen mit Zeitstempeln

---

## Drucklevel-Logik

| Level | Trigger                                | Pause zwischen Szenarien |
|-------|----------------------------------------|--------------------------|
| 1     | Ruhig, alles abgearbeitet              | 60–90 Sek               |
| 2     | Normal                                 | 40–60 Sek               |
| 3     | 2–3 offene Einsätze                    | 25–40 Sek               |
| 4     | 4+ offene Einsätze                     | 15–25 Sek               |
| 5     | Disponent reagiert nicht / viel offen  | 8–15 Sek                |

Die KI wählt bei Level 4–5 bevorzugt E1-Szenarien.

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
