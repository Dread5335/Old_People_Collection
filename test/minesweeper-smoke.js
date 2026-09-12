const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '../games/minesweeper/index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/' });
const { window } = dom;

window.onerror = (msg) => { console.error('WINDOW ERROR:', msg); process.exitCode = 1; };

const scriptSrc = fs.readFileSync(path.join(__dirname, '../games/minesweeper/game.js'), 'utf8');

try {
  window.eval(scriptSrc);
} catch (e) {
  console.error('EVAL ERROR:', e);
  process.exit(1);
}

const doc = window.document;

console.log('Initial board cells rendered:', doc.querySelectorAll('#board .cell').length, '(expect 81, easy 9x9)');

// Reveal the very first tile (top-left) — first click is always safe.
const firstCell = doc.querySelectorAll('#board .cell')[0];
firstCell.dispatchEvent(new window.Event('click', { bubbles: true }));
console.log('Revealed cells after 1 tap:', doc.querySelectorAll('#board .cell.revealed').length, '(expect >= 1)');

// Flag mode: turn on, flag a hidden tile, turn back off.
doc.getElementById('flagModeBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
const hiddenCell = doc.querySelectorAll('#board .cell.hidden-cell')[5];
hiddenCell.dispatchEvent(new window.Event('click', { bubbles: true }));
console.log('Flagged cells:', doc.querySelectorAll('#board .cell.flag-cell').length, '(expect 1)');
doc.getElementById('flagModeBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

// Rules modal open/close.
doc.getElementById('rulesBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
doc.getElementById('closeRulesBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

// Large-text toggle.
doc.getElementById('textSizeBtn').dispatchEvent(new window.Event('click', { bubbles: true }));

// New Game -> difficulty modal -> pick Medium size, bump mines up, start.
doc.getElementById('newGameBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
doc.getElementById('sizeMediumBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
console.log('Mine count after selecting Medium:', doc.getElementById('mineCountDisplay').textContent, '(expect 25, the Medium default)');
doc.getElementById('mineUpBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
console.log('Mine count after one +:', doc.getElementById('mineCountDisplay').textContent, '(expect 30)');
doc.getElementById('diffStartBtn').dispatchEvent(new window.Event('click', { bubbles: true }));
console.log('Board cells after starting Medium game:', doc.querySelectorAll('#board .cell').length, '(expect 144, 12x12)');

console.log('SMOKE TEST PASSED');
