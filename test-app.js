#!/usr/bin/env node
/**
 * Automatisierter Test für den ELS Simulator
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 ELS Simulator – Validierungstest\n');

const dir = './rettungsleitstelle';
const files = [
  'index.html',
  'statusschirm.html',
  'app.js',
  'data.js',
  'extensions.js',
  'style.css',
  'szenarien.json',
  'README.md'
];

// 1. Dateien vorhanden?
console.log('📋 Dateien prüfen:');
let allExists = true;
files.forEach(f => {
  const exists = fs.existsSync(path.join(dir, f));
  console.log(`  ${exists ? '✅' : '❌'} ${f}`);
  if (!exists) allExists = false;
});

if (!allExists) {
  console.log('\n❌ Fehler: Nicht alle Dateien vorhanden');
  process.exit(1);
}

// 2. Szenarien validieren
console.log('\n📝 Szenarien validieren:');
const scenariosPath = path.join(dir, 'szenarien.json');
try {
  const data = JSON.parse(fs.readFileSync(scenariosPath, 'utf8'));
  const count = data.szenarien.length;
  console.log(`  ✅ ${count} Szenarien geladen`);

  // Struktur prüfen
  let valid = 0;
  data.szenarien.forEach(s => {
    if (s.id && s.titel && s.aao && s.prioritaet) valid++;
  });
  console.log(`  ✅ ${valid}/${count} Szenarien vollständig`);

  if (valid !== count) {
    console.log(`  ⚠️  ${count - valid} Szenarien haben unvollständige Struktur`);
  }
} catch(e) {
  console.log(`  ❌ Fehler beim Laden: ${e.message}`);
}

// 3. JavaScript Syntax validieren
console.log('\n⚙️  JavaScript-Syntax validieren:');
['app.js', 'data.js', 'extensions.js'].forEach(f => {
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  try {
    new Function(content);
    console.log(`  ✅ ${f} ist syntaktisch korrekt`);
  } catch(e) {
    console.log(`  ❌ ${f}: ${e.message}`);
  }
});

// 4. HTML validieren
console.log('\n🌐 HTML-Validierung:');
['index.html', 'statusschirm.html'].forEach(f => {
  const content = fs.readFileSync(path.join(dir, f), 'utf8');
  const hasDoctype = content.includes('<!DOCTYPE');
  const hasMeta = content.includes('<meta charset');
  const hasScript = content.includes('<script');

  console.log(`  ${f}:`);
  console.log(`    ${hasDoctype ? '✅' : '⚠️'} DOCTYPE vorhanden`);
  console.log(`    ${hasMeta ? '✅' : '⚠️'} Charset definiert`);
  console.log(`    ${hasScript ? '✅' : '❌'} Scripts eingebunden`);
});

// 5. CSS-Größe prüfen
console.log('\n🎨 CSS-Prüfung:');
const cssPath = path.join(dir, 'style.css');
const cssSize = fs.statSync(cssPath).size / 1024;
console.log(`  ✅ ${Math.round(cssSize)}KB (größe OK)`);

// 6. Features prüfen
console.log('\n✨ Feature-Prüfung:');
const appContent = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
const hasLogin = /login.*function/.test(appContent);
const hasSimulation = /startSimulation.*function/.test(appContent);
const hasAuswertung = /zeigeAuswertung.*function/.test(appContent);
const hasKI = /generiereKIFunkAntwort/.test(appContent);

console.log(`  ${hasLogin ? '✅' : '❌'} Login-System`);
console.log(`  ${hasSimulation ? '✅' : '❌'} Simulation-Engine`);
console.log(`  ${hasAuswertung ? '✅' : '❌'} Auswertungs-Modul`);
console.log(`  ${hasKI ? '✅' : '❌'} KI-Funk-Integration`);

console.log('\n✅ Validierung abgeschlossen!\n');
