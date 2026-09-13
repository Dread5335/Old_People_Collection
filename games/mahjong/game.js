/* ============================================================
   MAHJONG (tile-matching / "Mahjong Solitaire" style)
   Plain vanilla JS. No frameworks, no network requests,
   no external assets.

   Tile faces reuse the same rank+suit glyphs as games/solitaire
   (A,2-10,J,Q,K x hearts/diamonds/clubs/spades) rather than the
   Unicode Mahjong-tile symbol block — that block has spotty font
   support across browsers/OSes, while these glyphs are already
   proven to render correctly in this exact project.

   Board shape: a "stepped pyramid" of square layers, each layer
   2 rows/cols smaller than the one below it and inset by 1 cell,
   so a layer-(L+1) tile at local (r,c) sits directly on top of the
   layer-L tile at local (r+1,c+1). This keeps the "covered" and
   "sandwiched" freedom rules simple 1:1 lookups instead of the
   four-way overlap math a true interlocking mahjong stack needs.

   Generation is done by simulating the game in *reverse*: compute
   a valid removal order for the empty geometry first (a tile only
   needs an existing tile above it and both flanks occupied to be
   blocked, and both properties are monotonic — once free, always
   free), then pair up tiles that become free *in the same round*
   (guaranteed mutually free at once) and hand out matching faces.
   That guarantees the freshly-dealt board is always solvable.
   ============================================================ */

(function () {
  'use strict';

  const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13];
  const RANK_LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
  const SUIT_GLYPH = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const RED_SUITS = new Set(['hearts', 'diamonds']);

  function rankLabel(r) { return RANK_LABEL[r] || String(r); }
  function isRed(suit) { return RED_SUITS.has(suit); }

  const ALL_FACES = [];
  for (const suit of SUITS) for (const rank of RANKS) ALL_FACES.push({ suit, rank });

  // Board sizes: { base size of the bottom layer, number of layers }.
  // Each layer shrinks by 2 and insets by 1, so layers stop once the
  // size would hit zero.
  const SIZES = {
    small:  { base: 6,  layers: 2 }, // 36 + 16          = 52 tiles
    medium: { base: 8,  layers: 3 }, // 64 + 36 + 16      = 116 tiles
    large:  { base: 10, layers: 4 }, // 100 + 64 + 36 + 16 = 216 tiles
  };

  const GAP = 3;    // px between tile cells
  const LIFT = 5;   // px each higher layer shifts up-and-left, for a stacked look

  // ---------- state ----------
  let state = null; // { sizeKey, layers, tiles, selected, matchedPairs, totalPairs, status }

  const els = {
    board: document.getElementById('board'),
    status: document.getElementById('statusMsg'),
    pairsLeft: document.getElementById('pairsLeft'),
  };

  function cryptoRandomInt(maxExclusive) {
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return buf[0] % maxExclusive;
    }
    return Math.floor(Math.random() * maxExclusive);
  }

  function shuffleCopy(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = cryptoRandomInt(i + 1);
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function uiScale() { return document.body.classList.contains('large-text') ? 1.25 : 1; }
  function cellPx() { return 34 * uiScale(); }

  // ---------- geometry ----------
  function buildLayers(baseSize, layerCount) {
    const layers = [];
    for (let i = 0; i < layerCount; i++) {
      const dim = baseSize - i * 2;
      if (dim <= 0) break;
      layers.push({ rows: dim, cols: dim });
    }
    return layers;
  }

  function keyOf(t) { return `${t.layer}-${t.row}-${t.col}`; }

  function buildAllTiles(layers) {
    const tiles = [];
    layers.forEach((L, idx) => {
      for (let r = 0; r < L.rows; r++) {
        for (let c = 0; c < L.cols; c++) tiles.push({ layer: idx, row: r, col: c, face: null, matched: false });
      }
    });
    return tiles;
  }

  // A tile is free if nothing sits directly on top of it (the layer
  // above's inset-by-1 tile) and it isn't flanked by a live tile on
  // BOTH sides in its own row. `liveKeys` is the set of tiles still
  // considered "present" — during generation that means "not yet
  // peeled off"; during play it means "not yet matched".
  function isFreeGiven(t, layers, liveKeys) {
    const L = t.layer, r = t.row, c = t.col;
    if (layers[L + 1]) {
      const ur = r - 1, uc = c - 1;
      if (ur >= 0 && uc >= 0 && ur < layers[L + 1].rows && uc < layers[L + 1].cols) {
        if (liveKeys.has(`${L + 1}-${ur}-${uc}`)) return false;
      }
    }
    const leftExists = c - 1 >= 0;
    const rightExists = c + 1 < layers[L].cols;
    const leftLive = leftExists && liveKeys.has(`${L}-${r}-${c - 1}`);
    const rightLive = rightExists && liveKeys.has(`${L}-${r}-${c + 1}`);
    if (leftExists && rightExists && leftLive && rightLive) return false;
    return true;
  }

  function currentLiveKeys() {
    return new Set(state.tiles.filter(t => !t.matched).map(keyOf));
  }

  // ---------- guaranteed-solvable generation ----------
  // Peels the given tiles off in rounds: each round is every tile that's
  // currently free given only tiles from earlier rounds are gone. Once a
  // tile is free it stays free (both blocking conditions only go away,
  // never come back), so everything in one round is free *simultaneously*.
  function computeBatches(tiles, layers) {
    const liveKeys = new Set(tiles.map(keyOf));
    const byKey = new Map(tiles.map(t => [keyOf(t), t]));
    const batches = [];
    while (liveKeys.size) {
      const frontierKeys = [];
      for (const key of liveKeys) {
        if (isFreeGiven(byKey.get(key), layers, liveKeys)) frontierKeys.push(key);
      }
      if (!frontierKeys.length) break; // geometry bug guard; shouldn't happen
      batches.push(frontierKeys.map(k => byKey.get(k)));
      for (const k of frontierKeys) liveKeys.delete(k);
    }
    return batches;
  }

  // Pairs up tiles within (and, for odd rounds, carried across) each
  // simultaneously-free batch, so every pair is guaranteed matchable
  // together at some point in a forward playthrough.
  function pairUpBatches(batches) {
    const pairs = [];
    let carry = [];
    for (const batch of batches) {
      const pool = shuffleCopy(carry.concat(batch));
      let i = 0;
      for (; i + 1 < pool.length; i += 2) pairs.push([pool[i], pool[i + 1]]);
      carry = (pool.length % 2 === 1) ? [pool[pool.length - 1]] : [];
    }
    return pairs;
  }

  function assignFaces(pairs) {
    const faceCycle = shuffleCopy(ALL_FACES);
    pairs.forEach((pair, idx) => {
      const face = faceCycle[idx % faceCycle.length];
      pair[0].face = face;
      pair[1].face = face;
    });
  }

  function dealTiles(tiles, layers) {
    assignFaces(pairUpBatches(computeBatches(tiles, layers)));
  }

  // ---------- new game ----------
  function newGame(sizeKey) {
    const key = SIZES[sizeKey] ? sizeKey : 'small';
    const cfg = SIZES[key];
    const layers = buildLayers(cfg.base, cfg.layers);
    const tiles = buildAllTiles(layers);
    dealTiles(tiles, layers);
    state = {
      sizeKey: key,
      layers,
      tiles,
      selected: null,
      matchedPairs: 0,
      totalPairs: tiles.length / 2,
      status: 'playing',
    };
    updateStatus('Tap two matching tiles to clear them.');
    render();
  }

  function getTileByKey(key) { return state.tiles.find(t => keyOf(t) === key); }
  function faceKey(face) { return `${face.suit}-${face.rank}`; }

  function hasAnyMove() {
    const live = state.tiles.filter(t => !t.matched);
    const liveKeys = new Set(live.map(keyOf));
    const free = live.filter(t => isFreeGiven(t, state.layers, liveKeys));
    const seen = new Set();
    for (const t of free) {
      const fk = faceKey(t.face);
      if (seen.has(fk)) return true;
      seen.add(fk);
    }
    return false;
  }

  function shuffleRemaining() {
    const remaining = state.tiles.filter(t => !t.matched);
    if (remaining.length < 2) return;
    dealTiles(remaining, state.layers);
    state.selected = null;
    hideModal('stuckModal');
    updateStatus('Tiles shuffled.');
    render();
  }

  // ---------- interaction ----------
  function handleTileTap(tile) {
    if (tile.matched) return;
    if (!isFreeGiven(tile, state.layers, currentLiveKeys())) {
      updateStatus('That tile is covered or stuck — clear around it first.');
      return;
    }

    const tileKey = keyOf(tile);

    if (!state.selected) {
      state.selected = tileKey;
      updateStatus('');
      render();
      return;
    }
    if (state.selected === tileKey) {
      state.selected = null; // tapping the selected tile again deselects it
      render();
      return;
    }

    const selTile = getTileByKey(state.selected);
    if (selTile && !selTile.matched && faceKey(selTile.face) === faceKey(tile.face)) {
      selTile.matched = true;
      tile.matched = true;
      state.selected = null;
      state.matchedPairs++;
      updateStatus('');
      render();
      checkWinOrStuck();
    } else {
      // Not a match — just move the selection to whatever was tapped,
      // rather than flashing an error and leaving the old tile stuck
      // selected forever.
      state.selected = tileKey;
      render();
    }
  }

  function checkWinOrStuck() {
    if (state.matchedPairs >= state.totalPairs) {
      state.status = 'won';
      updateStatus('You won!');
      document.getElementById('winMsg').textContent = `Cleared all ${state.totalPairs} pairs.`;
      render();
      showModal('winModal');
      return;
    }
    if (!hasAnyMove()) {
      showModal('stuckModal');
    }
  }

  function updateStatus(msg) {
    if (msg) els.status.textContent = msg;
    els.pairsLeft.textContent = String(state.totalPairs - state.matchedPairs);
  }

  // ---------- rendering ----------
  function render() {
    els.board.innerHTML = '';
    const cell = cellPx();
    const step = cell + GAP;
    const padLift = LIFT * (state.layers.length - 1);
    els.board.style.width = (state.layers[0].cols * step + padLift) + 'px';
    els.board.style.height = (state.layers[0].rows * step + padLift) + 'px';

    const liveKeys = currentLiveKeys();

    state.tiles.forEach(t => {
      if (t.matched) return;
      const free = isFreeGiven(t, state.layers, liveKeys);
      const div = document.createElement('div');
      div.className = 'tile' + (isRed(t.face.suit) ? ' red' : '') + (free ? '' : ' blocked') +
        (state.selected === keyOf(t) ? ' selected' : '');
      div.style.left = (padLift + t.col * step - t.layer * LIFT) + 'px';
      div.style.top = (padLift + t.row * step - t.layer * LIFT) + 'px';
      div.style.width = cell + 'px';
      div.style.height = cell + 'px';
      // Just needs to preserve layer order (higher layers on top of lower
      // ones) — kept small and well below shared/theme.css's
      // .modal-backdrop z-index (50), or tiles render on top of modals.
      div.style.zIndex = String(t.layer + 1);
      div.innerHTML = `<span class="corner">${rankLabel(t.face.rank)}</span><span class="suit-big">${SUIT_GLYPH[t.face.suit]}</span>`;
      div.tabIndex = 0;
      div.setAttribute('role', 'button');
      div.setAttribute('aria-label',
        `${rankLabel(t.face.rank)} of ${t.face.suit}${free ? '' : ', covered'}`);
      div.addEventListener('click', () => handleTileTap(t));
      div.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleTileTap(t); }
      });
      els.board.appendChild(div);
    });

    updateStatus();
  }

  // ---------- wiring ----------
  document.getElementById('shuffleBtn').addEventListener('click', shuffleRemaining);
  document.getElementById('stuckShuffleBtn').addEventListener('click', shuffleRemaining);

  const SIZE_BUTTON_IDS = { small: 'sizeSmallBtn', medium: 'sizeMediumBtn', large: 'sizeLargeBtn' };

  function openDifficultyModal() {
    const hasProgress = state && state.status === 'playing' && state.matchedPairs > 0;
    document.getElementById('difficultyWarning').hidden = !hasProgress;
    showModal('difficultyModal');
  }

  document.getElementById('newGameBtn').addEventListener('click', openDifficultyModal);
  document.getElementById('diffCancelBtn').addEventListener('click', () => hideModal('difficultyModal'));
  Object.keys(SIZE_BUTTON_IDS).forEach(key => {
    document.getElementById(SIZE_BUTTON_IDS[key]).addEventListener('click', () => {
      hideModal('difficultyModal');
      newGame(key);
    });
  });

  document.getElementById('rulesBtn').addEventListener('click', () => showModal('rulesModal'));
  document.getElementById('closeRulesBtn').addEventListener('click', () => hideModal('rulesModal'));

  document.getElementById('winNewGameBtn').addEventListener('click', () => { hideModal('winModal'); newGame(state.sizeKey); });
  document.getElementById('stuckNewGameBtn').addEventListener('click', () => { hideModal('stuckModal'); newGame(state.sizeKey); });

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
  // player to pick a size before they see it — same modal "New Game" uses.
  newGame('small');
  openDifficultyModal();
})();
