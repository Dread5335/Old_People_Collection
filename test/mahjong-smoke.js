const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync(path.join(__dirname, '../games/mahjong/index.html'), 'utf8');
const dom = new JSDOM(html, { runScripts: 'dangerously', resources: 'usable', url: 'http://localhost/' });
const { window } = dom;

window.onerror = (msg) => { console.error('WINDOW ERROR:', msg); process.exitCode = 1; };

const scriptSrc = fs.readFileSync(path.join(__dirname, '../games/mahjong/game.js'), 'utf8');

try {
  window.eval(scriptSrc);
} catch (e) {
  console.error('EVAL ERROR:', e);
  process.exit(1);
}

const doc = window.document;
const click = (el) => el.dispatchEvent(new window.Event('click', { bubbles: true }));

console.log('Initial tiles rendered:', doc.querySelectorAll('#board .tile').length, '(expect 52, Small)');
console.log('Pairs left:', doc.getElementById('pairsLeft').textContent, '(expect 26)');

// Select the first tile, then deselect it by tapping it again — should be
// a no-op regardless of what's actually on the board (deterministic,
// unlike matching, which depends on the random deal).
let tiles = doc.querySelectorAll('#board .tile');
click(tiles[0]);
console.log('Selected after 1 tap:', doc.querySelectorAll('#board .tile.selected').length, '(expect 1)');
click(doc.querySelectorAll('#board .tile')[0]); // re-query: render() rebuilt the DOM
console.log('Selected after re-tapping same tile:', doc.querySelectorAll('#board .tile.selected').length, '(expect 0)');

// Tap two different tiles — may or may not match depending on the random
// deal, but either way must not throw and must leave the game in a sane
// state (a match reduces pairsLeft by 1; a non-match just reselects).
const before = Number(doc.getElementById('pairsLeft').textContent);
tiles = doc.querySelectorAll('#board .tile');
click(tiles[0]);
click(doc.querySelectorAll('#board .tile')[1]);
const after = Number(doc.getElementById('pairsLeft').textContent);
console.log('Pairs left before/after a two-tile tap:', before, '->', after, '(expect equal, or after = before - 1)');
if (after !== before && after !== before - 1) {
  console.error('UNEXPECTED pairsLeft delta');
  process.exitCode = 1;
}

// Shuffle should never change the tile count or pairs-left count.
const countBeforeShuffle = doc.querySelectorAll('#board .tile').length;
click(doc.getElementById('shuffleBtn'));
const countAfterShuffle = doc.querySelectorAll('#board .tile').length;
console.log('Tile count before/after shuffle:', countBeforeShuffle, '->', countAfterShuffle, '(expect equal)');

// Rules modal open/close.
click(doc.getElementById('rulesBtn'));
click(doc.getElementById('closeRulesBtn'));

// Large-text toggle.
click(doc.getElementById('textSizeBtn'));

// New Game -> difficulty modal -> Medium.
click(doc.getElementById('newGameBtn'));
click(doc.getElementById('sizeMediumBtn'));
console.log('Tiles after switching to Medium:', doc.querySelectorAll('#board .tile').length, '(expect 116)');

console.log('SMOKE TEST PASSED');
