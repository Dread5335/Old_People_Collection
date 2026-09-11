/* ============================================================
   MINESWEEPER
   Plain vanilla JS. No frameworks, no network requests,
   no external assets. Everything the game needs is in this file.

   Follows the same pattern as games/solitaire/game.js:
   - `state` is one plain object; the DOM is purely a rendering of it.
   - render() wipes and rebuilds the board from state after every change.
   - snapshot() before every mutating move, popped by undo().
   - Deliberate accessibility choice for this audience: Undo works even
     after revealing a mine. A slip of the finger shouldn't end the game.
   ============================================================ */

(function () {
  'use strict';

  const DIFFICULTIES = {
    easy:   { rows: 9,  cols: 9,  mines: 10 },
    medium: { rows: 12, cols: 12, mines: 24 },
    hard:   { rows: 16, cols: 16, mines: 40 },
  };

  // ---------- state ----------
  let state = null;        // { level, rows, cols, mineCount, cells, minesPlaced, status, flagsPlaced, revealedCount, flagMode }
  let history = [];        // stack of deep-cloned states for Undo
  let lastTapInfo = null;  // for double-tap (chord) detection

  const els = {
    board: document.getElementById('board'),
    status: document.getElementById('statusMsg'),
    minesLeft: document.getElementById('minesLeft'),
    undoBtn: document.getElementById('undoBtn'),
    flagModeBtn: document.getElementById('flagModeBtn'),
  };

  function cryptoRandomInt(maxExclusive) {
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return buf[0] % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
  }

  // ---------- grid helpers ----------
  function makeCells(rows, cols) {
    const cells = [];
    for (let r = 0; r < rows; r++) {
      const row = [];
      for (let c = 0; c < cols; c++) {
        row.push({ mine: false, revealed: false, flagged: false, adjacent: 0, exploded: false });
      }
      cells.push(row);
    }
    return cells;
  }

  function forEachNeighbor(r, c, fn) {
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = r + dr, nc = c + dc;
        if (nr >= 0 && nr < state.rows && nc >= 0 && nc < state.cols) fn(nr, nc);
      }
    }
  }

  // Mines are placed on the first reveal, never under the tapped cell or
  // its immediate neighbors, so the opening tap is always safe and usually
  // opens up a little breathing room.
  function placeMines(safeR, safeC) {
    const excluded = new Set([`${safeR},${safeC}`]);
    forEachNeighbor(safeR, safeC, (r, c) => excluded.add(`${r},${c}`));

    const candidates = [];
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        if (!excluded.has(`${r},${c}`)) candidates.push([r, c]);
      }
    }
    // Fisher-Yates partial shuffle to pick mineCount cells
    const mineCount = Math.min(state.mineCount, candidates.length);
    for (let i = 0; i < mineCount; i++) {
      const j = i + cryptoRandomInt(candidates.length - i);
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
      const [r, c] = candidates[i];
      state.cells[r][c].mine = true;
    }

    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        if (state.cells[r][c].mine) continue;
        let count = 0;
        forEachNeighbor(r, c, (nr, nc) => { if (state.cells[nr][nc].mine) count++; });
        state.cells[r][c].adjacent = count;
      }
    }
    state.minesPlaced = true;
  }

  // ---------- new game ----------
  function newGame(level) {
    const cfg = DIFFICULTIES[level] || DIFFICULTIES.easy;
    state = {
      level: DIFFICULTIES[level] ? level : 'easy',
      rows: cfg.rows,
      cols: cfg.cols,
      mineCount: cfg.mines,
      cells: makeCells(cfg.rows, cfg.cols),
      minesPlaced: false,
      status: 'playing', // 'playing' | 'won' | 'lost'
      flagsPlaced: 0,
      revealedCount: 0,
      flagMode: false,
    };
    history = [];
    lastTapInfo = null;
    els.board.style.gridTemplateColumns = `repeat(${cfg.cols}, var(--cell-size))`;
    setFlagModeButton(false);
    updateStatus('Tap any tile to begin.');
    render();
  }

  // ---------- undo support ----------
  function snapshot() {
    history.push(JSON.parse(JSON.stringify(state)));
    if (history.length > 300) history.shift();
  }
  function undo() {
    if (!history.length) return;
    state = history.pop();
    els.board.style.gridTemplateColumns = `repeat(${state.cols}, var(--cell-size))`;
    hideModal('loseModal');
    updateStatus('Move undone.');
    render();
  }

  // ---------- reveal / flag logic ----------
  function revealCell(r, c) {
    const cell = state.cells[r][c];
    if (cell.revealed || cell.flagged) return;

    // flood-fill reveal via BFS, starting from (r, c)
    const queue = [[r, c]];
    const seen = new Set([`${r},${c}`]);
    while (queue.length) {
      const [cr, cc] = queue.shift();
      const cur = state.cells[cr][cc];
      if (cur.flagged) continue;
      cur.revealed = true;
      state.revealedCount++;
      if (!cur.mine && cur.adjacent === 0) {
        forEachNeighbor(cr, cc, (nr, nc) => {
          const key = `${nr},${nc}`;
          const nCell = state.cells[nr][nc];
          if (!seen.has(key) && !nCell.revealed && !nCell.flagged) {
            seen.add(key);
            queue.push([nr, nc]);
          }
        });
      }
    }
  }

  function toggleFlag(r, c) {
    const cell = state.cells[r][c];
    if (cell.revealed) return;
    cell.flagged = !cell.flagged;
    state.flagsPlaced += cell.flagged ? 1 : -1;
  }

  function countFlaggedNeighbors(r, c) {
    let n = 0;
    forEachNeighbor(r, c, (nr, nc) => { if (state.cells[nr][nc].flagged) n++; });
    return n;
  }

  // "Chord": tap a revealed number twice to open all its unflagged
  // neighbors at once, if enough neighbors are already flagged.
  function chord(r, c) {
    const cell = state.cells[r][c];
    if (!cell.revealed || cell.adjacent === 0) return false;
    if (countFlaggedNeighbors(r, c) !== cell.adjacent) return false;
    snapshot();
    let hitMine = false;
    forEachNeighbor(r, c, (nr, nc) => {
      const n = state.cells[nr][nc];
      if (!n.revealed && !n.flagged) {
        revealCell(nr, nc);
        if (n.mine && n.revealed) { n.exploded = true; hitMine = true; }
      }
    });
    afterReveal(hitMine);
    return true;
  }

  function handleTileTap(r, c) {
    const cell = state.cells[r][c];
    const now = Date.now();
    const same = lastTapInfo && lastTapInfo.r === r && lastTapInfo.c === c;
    const isDoubleTap = same && (now - lastTapInfo.time) < 400;
    lastTapInfo = { r, c, time: now };

    if (isDoubleTap) {
      lastTapInfo = null;
      if (chord(r, c)) return;
    }

    if (state.flagMode) {
      if (cell.revealed) return; // nothing to flag on an already-open tile
      snapshot();
      toggleFlag(r, c);
      updateStatus('');
      render();
      return;
    }

    if (cell.flagged) return; // must unflag before revealing
    if (cell.revealed) return; // tapping an open tile alone does nothing (use double-tap to chord)

    snapshot();
    if (!state.minesPlaced) placeMines(r, c);
    revealCell(r, c);
    const hitMine = cell.mine && cell.revealed;
    if (hitMine) cell.exploded = true;
    afterReveal(hitMine);
  }

  function afterReveal(hitMine) {
    if (hitMine) {
      state.status = 'lost';
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          const cell = state.cells[r][c];
          if (cell.mine) cell.revealed = true;
        }
      }
      updateStatus('That tile had a mine.');
      render();
      showModal('loseModal');
      return;
    }
    updateStatus('');
    render();
    checkWin();
  }

  function checkWin() {
    const totalSafe = state.rows * state.cols - state.mineCount;
    if (state.revealedCount >= totalSafe && state.status === 'playing') {
      state.status = 'won';
      // auto-flag remaining mines for a satisfying finish
      for (let r = 0; r < state.rows; r++) {
        for (let c = 0; c < state.cols; c++) {
          const cell = state.cells[r][c];
          if (cell.mine && !cell.flagged) { cell.flagged = true; state.flagsPlaced++; }
        }
      }
      updateStatus('You won!');
      document.getElementById('winMsg').textContent =
        `Cleared the ${state.rows}×${state.cols} board without a scratch.`;
      render();
      showModal('winModal');
    }
  }

  function updateStatus(msg) {
    if (msg) els.status.textContent = msg;
    const left = Math.max(0, state.mineCount - state.flagsPlaced);
    els.minesLeft.textContent = String(left);
    els.undoBtn.disabled = history.length === 0;
  }

  function setFlagModeButton(on) {
    state.flagMode = on;
    els.flagModeBtn.setAttribute('aria-pressed', String(on));
    els.flagModeBtn.textContent = on ? '🚩 Flag Mode: On' : '🚩 Flag Mode: Off';
  }

  // ---------- rendering ----------
  function render() {
    els.board.innerHTML = '';
    for (let r = 0; r < state.rows; r++) {
      for (let c = 0; c < state.cols; c++) {
        const cell = state.cells[r][c];
        const div = document.createElement('div');
        div.setAttribute('role', 'gridcell');
        div.tabIndex = 0;

        if (cell.revealed) {
          div.classList.add('cell', 'revealed');
          if (cell.mine) {
            div.classList.add('mine-cell');
            if (cell.exploded) div.classList.add('exploded');
            div.textContent = '💣';
          } else if (cell.adjacent > 0) {
            div.classList.add('num-' + cell.adjacent);
            div.textContent = String(cell.adjacent);
            if (cell.adjacent === countFlaggedNeighbors(r, c)) div.classList.add('chordable');
          }
          div.setAttribute('aria-label',
            cell.mine ? 'Mine' : (cell.adjacent ? `${cell.adjacent} mines nearby` : 'Empty'));
        } else {
          div.classList.add('cell', 'hidden-cell');
          if (state.flagMode) div.classList.add('flag-mode');
          if (cell.flagged) {
            div.classList.add('flag-cell');
            div.textContent = '🚩';
          }
          div.setAttribute('aria-label', cell.flagged ? 'Flagged tile' : 'Hidden tile');
        }

        div.addEventListener('click', () => handleTileTap(r, c));
        div.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTileTap(r, c); }
        });

        els.board.appendChild(div);
      }
    }
    updateStatus();
  }

  // ---------- wiring ----------
  document.getElementById('undoBtn').addEventListener('click', undo);
  document.getElementById('loseUndoBtn').addEventListener('click', () => { hideModal('loseModal'); undo(); });

  document.getElementById('flagModeBtn').addEventListener('click', () => {
    setFlagModeButton(!state.flagMode);
    render();
  });

  function openDifficultyModal() {
    const hasProgress = state && state.status === 'playing' &&
      (state.revealedCount > 0 || state.flagsPlaced > 0);
    document.getElementById('difficultyWarning').hidden = !hasProgress;
    showModal('difficultyModal');
  }

  document.getElementById('newGameBtn').addEventListener('click', openDifficultyModal);
  document.getElementById('diffCancelBtn').addEventListener('click', () => hideModal('difficultyModal'));
  document.getElementById('diffEasyBtn').addEventListener('click', () => { hideModal('difficultyModal'); newGame('easy'); });
  document.getElementById('diffMediumBtn').addEventListener('click', () => { hideModal('difficultyModal'); newGame('medium'); });
  document.getElementById('diffHardBtn').addEventListener('click', () => { hideModal('difficultyModal'); newGame('hard'); });

  document.getElementById('rulesBtn').addEventListener('click', () => showModal('rulesModal'));
  document.getElementById('closeRulesBtn').addEventListener('click', () => hideModal('rulesModal'));

  document.getElementById('winNewGameBtn').addEventListener('click', () => { hideModal('winModal'); newGame(state.level); });
  document.getElementById('loseNewGameBtn').addEventListener('click', () => { hideModal('loseModal'); newGame(state.level); });

  document.getElementById('textSizeBtn').addEventListener('click', (e) => {
    const on = document.body.classList.toggle('large-text');
    e.currentTarget.setAttribute('aria-pressed', String(on));
    e.currentTarget.textContent = on ? 'A+ Normal Text' : 'A+ Larger Text';
    render();
  });

  function showModal(id) { document.getElementById(id).hidden = false; }
  function hideModal(id) { document.getElementById(id).hidden = true; }

  // ---------- start ----------
  newGame('easy');
})();
