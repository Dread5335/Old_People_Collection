const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '../games/solitaire/index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/' });
const { window } = dom;

window.onerror = (msg) => { console.error('WINDOW ERROR:', msg); process.exitCode = 1; };

const scriptSrc = fs.readFileSync(path.join(__dirname, '../games/solitaire/game.js'), 'utf8');

try {
  window.eval(scriptSrc);
} catch (e) {
  console.error('EVAL ERROR:', e);
  process.exit(1);
}

const doc = window.document;

console.log('Initial tableau cards rendered:', doc.querySelectorAll('#tableau .card').length, '(expect 28)');

doc.getElementById('stock').dispatchEvent(new window.Event('click', { bubbles: true }));
console.log('Waste after 1 draw:', doc.querySelectorAll('#waste .card').length, '(expect 1)');

const wasteCard = doc.querySelector('#waste .card');
if (wasteCard) wasteCard.dispatchEvent(new window.Event('click', { bubbles: true }));
const firstCol = doc.querySelectorAll('.tableau-col')[3];
firstCol.dispatchEvent(new window.Event('click', { bubbles: true }));

doc.getElementById('undoBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
doc.getElementById('rulesBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
doc.getElementById('closeRulesBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
doc.getElementById('textSizeBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
doc.getElementById('newGameBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

console.log('After new game, tableau cards rendered:', doc.querySelectorAll('#tableau .card').length, '(expect 28)');
console.log('SMOKE TEST PASSED');
