# 🚀 Deployment Anleitung – ELS Simulator

## Render.com Deployment (Empfohlen für kostenlosen Hosting)

### Schritt 1: Render Account erstellen
1. https://render.com aufrufen
2. GitHub Account verbinden
3. Neuen Service erstellen → Web Service

### Schritt 2: Repository verbinden
```
Repository: aloisgraf/dispoassesmentstresstest
Branch: claude/vigilant-brahmagupta-iwu7qp
```

### Schritt 3: Build-Einstellungen
```
Build Command:       npm install
Start Command:       npm start
Environment:         Node 18.x
Plan:               Free (oder Pro für bessere Performance)
```

### Schritt 4: Environment Variables (optional)
```
PORT: 3000
NODE_ENV: production
```

### Schritt 5: Deploy
Render kümmert sich automatisch um:
- ✅ Git Pull
- ✅ Dependencies Installation
- ✅ Server Start
- ✅ SSL/TLS Certificate
- ✅ Auto-Redeploy bei jedem Push

---

## Lokal entwickeln

### Start im Dev-Modus
```bash
npm start
# oder
npm run dev
```

Server läuft auf: **http://localhost:3000**

### Testing
```bash
npm test
```

---

## Alternative: Docker Deployment

### Dockerfile erstellen (optional)
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package.json .
RUN npm install
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
```

### Docker Build & Run
```bash
docker build -t els-simulator .
docker run -p 3000:3000 els-simulator
```

---

## Produktions-Checklist

- [ ] API-Key in Render Secrets speichern (nicht im Code!)
- [ ] CORS-Headers konfigurieren (wenn nötig)
- [ ] Health-Check testen: `curl https://YOUR-DOMAIN/`
- [ ] Szenarien.json ist aktuell
- [ ] SSL/TLS aktiviert (Render macht das automatisch)
- [ ] Performance testen unter Last

---

## URLs nach Deployment

**Render Subdomain:**
```
https://els-simulator.onrender.com
```

**Custom Domain (optional):**
```
Einstellungen → Custom Domain → Deine Domain verknüpfen
```

---

## Troubleshooting

### App startet nicht
```bash
# Logs auf Render.com anschauen
# oder lokal testen:
npm start
```

### 404 Fehler bei Static Files
- Prüfen: `server.js` hat `rettungsleitstelle` als BASE_DIR
- Prüfen: Alle Dateien sind commitet

### API Key funktioniert nicht
- Render Environment Variable prüfen
- Browser Console öffnen (F12) und localStorage checken
- API-Key im Settings Panel speichern (wird lokal gecacht)

---

## Performance-Tipps

1. **Caching:**
   - HTML: max-age=0 (nicht cachen)
   - Assets: max-age=86400 (24h cachen)

2. **Render Upgrade bei viel Traffic:**
   - Free Plan: ~5 gleichzeitige User
   - Pro/Standard: unbegrenzt

3. **Database (future):**
   - Wenn ihr Trainings-Logs speichern wollt:
   - Render PostgreSQL hinzufügen
   - `app.js` um DB-Queries erweitern

---

## Autom. Deployments bei Git Push

✅ Standardmäßig aktiviert!

```bash
# Einfach pushen → Render deployed automatisch
git push origin claude/vigilant-brahmagupta-iwu7qp
```

Render hat ein Webhook vom GitHub eingerichtet.

---

## Monitoring

### Health Check einrichten
In Render Dashboard:
```
Settings → Health Check → /
```

### Logs live ansehen
```bash
# Render CLI (optional)
brew install render-cli
render logs --service els-simulator
```

---

## Support & Dokumentation

- **Render Docs:** https://render.com/docs
- **Node.js Server:** server.js (einfacher HTTP Server, keine Dependencies!)
- **Simulator Docs:** rettungsleitstelle/README.md

---

*Version 1.0 – Production Ready*
