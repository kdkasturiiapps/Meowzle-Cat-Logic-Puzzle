// Builds www/ for the Android app: inlines the puzzle engine and reminder planner
// into the game page and swaps Google Fonts for bundled font files (works offline).
const fs = require('fs');
const path = require('path');

const { buildSync } = require('esbuild');
const cloud = buildSync({ entryPoints: [path.join(__dirname, 'src', 'cloud.js')], bundle: true, format: 'iife', minify: true, target: 'es2019', write: false, legalComments: 'none' }).outputFiles[0].text;
const strip = f => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8').replace(/if \(typeof module[^\n]*\n?/, '');
let html = fs.readFileSync(path.join(__dirname, 'src', 'game.html'), 'utf8');

html = html
  .replace('/*ENGINE*/', () => strip('engine.js'))
  .replace('/*REMINDERS*/', () => strip('reminders.js'))
  .replace("'__ADS_MODE__'", JSON.stringify(process.env.ADS_MODE === 'live' ? 'live' : 'test'))
  .replace('/*CLOUD*/', () => cloud.replace(/<\/script/gi, '<\\/script'))
  .replace(/<link rel="preconnect"[^\n]*\n/, '')
  .replace(/<link href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link href="fonts/nunito.css" rel="stylesheet">');

const out = path.join(__dirname, 'www');
fs.mkdirSync(path.join(out, 'fonts'), { recursive: true });
let css = '';
for (const w of [600, 700, 800]) {
  const name = `nunito-latin-${w}-normal.woff2`;
  fs.copyFileSync(path.join(__dirname, 'node_modules/@fontsource/nunito/files', name), path.join(out, 'fonts', name));
  css += `@font-face{font-family:"Nunito";font-style:normal;font-weight:${w};font-display:swap;src:url(${name}) format("woff2")}\n`;
}
fs.writeFileSync(path.join(out, 'fonts', 'nunito.css'), css);
fs.writeFileSync(path.join(out, 'index.html'), html);
console.log('www/index.html built:', Math.round(html.length / 1024), 'KB', '· ads:', process.env.ADS_MODE === 'live' ? 'LIVE' : 'test');
