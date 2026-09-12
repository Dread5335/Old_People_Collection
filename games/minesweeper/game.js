/* ============================================================
   MINESWEEPER
   Plain vanilla JS. No frameworks, no network requests,
   no external assets. Everything the game needs is in this file.

   Follows the same pattern as games/solitaire/game.js:
   - `state` is one plain object; the DOM is purely a rendering of it.
   - render() wipes and rebuilds the board from state after every change.
   ============================================================ */

(function () {
  'use strict';

  const SIZES = {
    small:  { rows: 9,  cols: 9  },
    medium: { rows: 12, cols: 12 },
    large:  { rows: 16, cols: 16 },
  };
  // Mine-count bounds per board size, roughly 6%-35% of the board so a
  // board always stays winnable at one end and genuinely hard at the
  // other. Step is how much each +/- tap changes the count.
  const MINE_BOUNDS = {
    small:  { min: 5,  max: 25, default: 10, step: 5 },
    medium: { min: 10, max: 50, default: 25, step: 5 },
    large:  { min: 15, max: 80, default: 40, step: 5 },
  };

  // ---------- state ----------
  let state = null;        // { sizeKey, rows, cols, mineCount, cells, minesPlaced, status, flagsPlaced, revealedCount, flagMode }
  let lastTapInfo = null;  // for double-tap (chord) detection

  // Pending selection while the difficulty modal is open, applied on "Start Game".
  let pendingSize = 'small';
  let pendingMines = MINE_BOUNDS.small.default;

  const els = {
    board: document.getElementById('board'),
    status: document.getElementById('statusMsg'),
    minesLeft: document.getElementById('minesLeft'),
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
  function newGame(sizeKey, mineCount) {
    const key = SIZES[sizeKey] ? sizeKey : 'small';
    const size = SIZES[key];
    const bounds = MINE_BOUNDS[key];
    const mines = clamp(mineCount == null ? bounds.default : mineCount, bounds.min, bounds.max);
    state = {
      sizeKey: key,
      rows: size.rows,
      cols: size.cols,
      mineCount: mines,
      cells: makeCells(size.rows, size.cols),
      minesPlaced: false,
      status: 'playing', // 'playing' | 'won' | 'lost'
      flagsPlaced: 0,
      revealedCount: 0,
      flagMode: false,
    };
    lastTapInfo = null;
    els.board.style.gridTemplateColumns = `repeat(${size.cols}, var(--cell-size))`;
    setFlagModeButton(false);
    updateStatus('Tap any tile to begin.');
    render();
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

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
      toggleFlag(r, c);
      updateStatus('');
      render();
      return;
    }

    if (cell.flagged) return; // must unflag before revealing
    if (cell.revealed) return; // tapping an open tile alone does nothing (use double-tap to chord)

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
  document.getElementById('flagModeBtn').addEventListener('click', () => {
    setFlagModeButton(!state.flagMode);
    render();
  });

  const SIZE_BUTTON_IDS = { small: 'sizeSmallBtn', medium: 'sizeMediumBtn', large: 'sizeLargeBtn' };

  function selectSize(sizeKey) {
    pendingSize = sizeKey;
    pendingMines = MINE_BOUNDS[sizeKey].default;
    syncDifficultyUI();
  }

  function adjustMines(delta) {
    const bounds = MINE_BOUNDS[pendingSize];
    pendingMines = clamp(pendingMines + delta, bounds.min, bounds.max);
    syncDifficultyUI();
  }

  function syncDifficultyUI() {
    Object.keys(SIZE_BUTTON_IDS).forEach(key => {
      document.getElementById(SIZE_BUTTON_IDS[key]).setAttribute('aria-pressed', String(key === pendingSize));
    });
    document.getElementById('mineCountDisplay').textContent = String(pendingMines);
    const size = SIZES[pendingSize];
    const pct = Math.round((pendingMines / (size.rows * size.cols)) * 100);
    const label = pct < 15 ? 'Easy' : (pct < 25 ? 'Medium' : 'Hard');
    document.getElementById('mineDensityMsg').textContent = `${label} — about ${pct}% of tiles are mines.`;
  }

  function openDifficultyModal() {
    const hasProgress = state && state.status === 'playing' &&
      (state.revealedCount > 0 || state.flagsPlaced > 0);
    document.getElementById('difficultyWarning').hidden = !hasProgress;
    pendingSize = state ? state.sizeKey : 'small';
    pendingMines = state ? state.mineCount : MINE_BOUNDS.small.default;
    syncDifficultyUI();
    showModal('difficultyModal');
  }

  document.getElementById('newGameBtn').addEventListener('click', openDifficultyModal);
  document.getElementById('diffCancelBtn').addEventListener('click', () => hideModal('difficultyModal'));
  document.getElementById('diffStartBtn').addEventListener('click', () => {
    hideModal('difficultyModal');
    newGame(pendingSize, pendingMines);
  });
  Object.keys(SIZE_BUTTON_IDS).forEach(key => {
    document.getElementById(SIZE_BUTTON_IDS[key]).addEventListener('click', () => selectSize(key));
  });
  document.getElementById('mineDownBtn').addEventListener('click', () => adjustMines(-MINE_BOUNDS[pendingSize].step));
  document.getElementById('mineUpBtn').addEventListener('click', () => adjustMines(MINE_BOUNDS[pendingSize].step));

  document.getElementById('rulesBtn').addEventListener('click', () => showModal('rulesModal'));
  document.getElementById('closeRulesBtn').addEventListener('click', () => hideModal('rulesModal'));

  document.getElementById('winNewGameBtn').addEventListener('click', () => { hideModal('winModal'); newGame(state.sizeKey, state.mineCount); });
  document.getElementById('loseNewGameBtn').addEventListener('click', () => { hideModal('loseModal'); newGame(state.sizeKey, state.mineCount); });

  document.getElementById('textSizeBtn').addEventListener('click', (e) => {
    const on = document.body.classList.toggle('large-text');
    e.currentTarget.setAttribute('aria-pressed', String(on));
    e.currentTarget.textContent = on ? 'A+ Normal Text' : 'A+ Larger Text';
    render();
  });

  function showModal(id) { document.getElementById(id).hidden = false; }
  function hideModal(id) { document.getElementById(id).hidden = true; }

  // ---------- start ----------
  // Start with a default board rendered behind the scenes, but ask the
  // player to pick a size/mine count before they see it — same modal
  // "New Game" uses, just shown immediately on first visit too.
  newGame('small');
  openDifficultyModal();
})();
