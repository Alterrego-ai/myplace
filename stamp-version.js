/**
 * Injecte le hash git + date/heure dans index.html
 * Remplace __BUILD_VERSION__ par "v<hash> · DD/MM/YYYY HH:MM"
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const htmlPath = path.join(__dirname, 'public', 'index.html');

let hash = 'dev';
try {
  hash = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
} catch (e) {
  // Fallback si pas de git
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const dateStr = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
const version = `v${hash} · ${dateStr}`;

let html = fs.readFileSync(htmlPath, 'utf8');
html = html.replace(/__BUILD_VERSION__/g, version);
fs.writeFileSync(htmlPath, html, 'utf8');

console.log(`✓ Version stamp: ${version}`);
