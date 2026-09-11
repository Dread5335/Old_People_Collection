/* ============================================================
   KLONDIKE SOLITAIRE
   Plain vanilla JS. No frameworks, no network requests,
   no external assets. Everything the game needs is in this file.
   ============================================================ */

(function () {
  'use strict';

  const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
  const SUIT_GLYPH = { hearts: '♥', diamonds: '♦', clubs: '♣', spades: '♠' };
  const RED_SUITS = new Set(['hearts', 'diamonds']);
  const RANK_LABEL = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };

  function rankLabel(r) { return RANK_LABEL[r] || String(r); }
  function isRed(suit) { return RED_SUITS.has(suit); }

  // ---------- state ----------
  let state = null;      // { stock, waste, foundations, tableau }
  let selection = null;  // { from: 'waste'|'tableau'|'foundation', pile, index }
  let history = [];      // stack of deep-cloned states for Undo
  let moveCount = 0;
  let lastTapInfo = null; // for touch double-tap detection

  const els = {
    stock: document.getElementById('stock'),
    waste: document.getElementById('waste'),
    tableau: document.getElementById('tableau'),
    status: document.getElementById('statusMsg'),
    moveCount: document.getElementById('moveCount'),
    undoBtn: document.getElementById('undoBtn'),
  };
  const foundationEls = {};
  document.querySelectorAll('.pile.foundation').forEach(el => {
    const suit = el.dataset.suit;
    el.dataset.suitGlyph = SUIT_GLYPH[suit];
    foundationEls[suit] = el;
  });

  // ---------- deck / deal ----------
  function freshDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (let rank = 1; rank <= 13; rank++) {
        deck.push({ suit, rank, faceUp: false });
      }
    }
    // Fisher-Yates shuffle using crypto for unbiased randomness
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(cryptoRandom() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function cryptoRandom() {
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return buf[0] / 4294967296;
    }
    return Math.random();
  }

  function newGame() {
    const deck = freshDeck();
    const tableau = [[], [], [], [], [], [], []];
    for (let col = 0; col < 7; col++) {
      for (let row = 0; row <= col; row++) {
        const card = deck.pop();
        card.faceUp = (row === col);
        tableau[col].push(card);
      }
    }
    state = {
      stock: deck,
      waste: [],
      foundations: { hearts: [], diamonds: [], clubs: [], spades: [] },
      tableau,
    };
    selection = null;
    history = [];
    moveCount = 0;
    updateStatus('Tap the draw pile to begin.');
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
    selection = null;
    moveCount = Math.max(0, moveCount - 1);
    updateStatus('Move undone.');
    render();
  }

  // ---------- rules ----------
  function canPlaceOnTableau(card, destPile) {
    if (destPile.length === 0) return card.rank === 13; // only King on empty column
    const top = destPile[destPile.length - 1];
    if (!top.faceUp) return false;
    return top.rank === card.rank + 1 && (isRed(top.suit) !== isRed(card.suit));
  }
  function canPlaceOnFoundation(card, suit) {
    if (card.suit !== suit) return false;
    const pile = state.foundations[suit];
    const nextRank = pile.length + 1;
    return card.rank === nextRank;
  }

  // ---------- interactions ----------
  function drawFromStock() {
    snapshot();
    if (state.stock.length === 0) {
      if (state.waste.length === 0) { history.pop(); return; }
      // recycle waste back into stock, face down
      state.stock = state.waste.reverse().map(c => ({ ...c, faceUp: false }));
      state.waste = [];
      updateStatus('Draw pile reshuffled from the waste pile.');
    } else {
      const card = state.stock.pop();
      card.faceUp = true;
      state.waste.push(card);
      updateStatus('');
    }
    moveCount++;
    render();
  }

  function clearSelection() {
    selection = null;
    render();
  }

  function selectCard(from, pile, index) {
    // clicking the already-selected card deselects it
    if (selection && selection.from === from && selection.pile === pile && selection.index === index) {
      clearSelection();
      return;
    }
    selection = { from, pile, index };
    render();
  }

  function getSelectedRun() {
    if (!selection) return null;
    if (selection.from === 'waste') {
      const c = state.waste[state.waste.length - 1];
      return c ? [c] : null;
    }
    if (selection.from === 'foundation') {
      const p = state.foundations[selection.pile];
      const c = p[p.length - 1];
      return c ? [c] : null;
    }
    if (selection.from === 'tableau') {
      const col = state.tableau[selection.pile];
      return col.slice(selection.index);
    }
    return null;
  }

  function removeSelectedRun() {
    if (selection.from === 'waste') return [state.waste.pop()];
    if (selection.from === 'foundation') return [state.foundations[selection.pile].pop()];
    if (selection.from === 'tableau') {
      const col = state.tableau[selection.pile];
      return col.splice(selection.index, col.length - selection.index);
    }
    return [];
  }

  function tryMoveSelectionTo(target) {
    const run = getSelectedRun();
    if (!run || !run.length) { clearSelection(); return; }

    if (target.type === 'foundation') {
      if (run.length !== 1) { flashInvalid(); return; }
      if (!canPlaceOnFoundation(run[0], target.suit)) { flashInvalid(); return; }
      snapshot();
      removeSelectedRun();
      state.foundations[target.suit].push(run[0]);
      afterSuccessfulMove();
      return;
    }

    if (target.type === 'tableau') {
      if (!canPlaceOnTableau(run[0], state.tableau[target.col])) { flashInvalid(); return; }
      snapshot();
      removeSelectedRun();
      state.tableau[target.col].push(...run);
      afterSuccessfulMove();
      return;
    }
  }

  function afterSuccessfulMove() {
    // reveal newly-exposed tableau card
    for (const col of state.tableau) {
      if (col.length && !col[col.length - 1].faceUp) col[col.length - 1].faceUp = true;
    }
    selection = null;
    moveCount++;
    updateStatus('');
    render();
    checkWin();
  }

  function flashInvalid() {
    updateStatus("That card can't go there.");
  }

  function autoSendToFoundation(from, pile, index) {
    const run = pile === undefined
      ? (from === 'waste' ? [state.waste[state.waste.length - 1]] : [])
      : state.tableau[pile].slice(index);
    if (!run.length || run.length > 1) return false;
    const card = run[0];
    for (const suit of SUITS) {
      if (canPlaceOnFoundation(card, suit)) {
        selection = { from, pile, index };
        tryMoveSelectionTo({ type: 'foundation', suit });
        return true;
      }
    }
    return false;
  }

  function checkWin() {
    const total = SUITS.reduce((sum, s) => sum + state.foundations[s].length, 0);
    if (total === 52) {
      updateStatus('You won!');
      document.getElementById('winMsg').textContent =
        `Solved in ${moveCount} moves. Well played.`;
      showModal('winModal');
    }
  }

  function updateStatus(msg) {
    if (msg) els.status.textContent = msg;
    els.moveCount.textContent = String(moveCount);
    els.undoBtn.disabled = history.length === 0;
  }

  // ---------- rendering ----------
  function cardFace(card) {
    const glyph = SUIT_GLYPH[card.suit];
    const label = rankLabel(card.rank);
    return `<span class="corner top">${label}<br>${glyph}</span>` +
           `<span class="suit-big">${glyph}</span>` +
           `<span class="corner bottom">${label}<br>${glyph}</span>`;
  }

  function makeCardEl(card, faceDownOverride) {
    const div = document.createElement('div');
    const faceUp = faceDownOverride === undefined ? card.faceUp : !faceDownOverride;
    div.className = 'card' + (faceUp ? '' : ' facedown') + (isRed(card.suit) && faceUp ? ' red' : '');
    if (faceUp) div.innerHTML = cardFace(card);
    return div;
  }

  function stackGapPx() {
    if (typeof window.matchMedia === 'function') {
      return window.matchMedia('(max-width: 700px)').matches ? 20 : 28;
    }
    return window.innerWidth && window.innerWidth <= 700 ? 20 : 28;
  }

  function render() {
    // stock
    els.stock.innerHTML = '';
    if (state.stock.length) {
      els.stock.appendChild(makeCardEl(state.stock[state.stock.length - 1], true));
    } else {
      els.stock.classList.add('pile-empty');
    }

    // waste
    els.waste.innerHTML = '';
    if (state.waste.length) {
      const top = state.waste[state.waste.length - 1];
      const cardEl = makeCardEl(top);
      if (selection && selection.from === 'waste') cardEl.classList.add('selected');
      cardEl.addEventListener('click', (e) => { e.stopPropagation(); handleCardTap('waste', undefined, state.waste.length - 1); });
      els.waste.appendChild(cardEl);
    }

    // foundations
    for (const suit of SUITS) {
      const el = foundationEls[suit];
      el.innerHTML = '';
      const pile = state.foundations[suit];
      if (pile.length) {
        const top = pile[pile.length - 1];
        const cardEl = makeCardEl(top);
        if (selection && selection.from === 'foundation' && selection.pile === suit) cardEl.classList.add('selected');
        cardEl.addEventListener('click', (e) => { e.stopPropagation(); handleCardTap('foundation', suit, pile.length - 1); });
        el.appendChild(cardEl);
      }
    }

    // tableau
    els.tableau.innerHTML = '';
    const gap = stackGapPx();
    state.tableau.forEach((col, colIndex) => {
      const colEl = document.createElement('div');
      colEl.className = 'tableau-col';
      colEl.style.minHeight = (110 + gap * Math.max(col.length - 1, 0)) + 'px';
      colEl.addEventListener('click', () => handlePileTap({ type: 'tableau', col: colIndex }));

      if (col.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.className = 'pile';
        colEl.appendChild(placeholder);
      }

      col.forEach((card, i) => {
        const cardEl = makeCardEl(card);
        cardEl.style.top = (i * gap) + 'px';
        cardEl.style.zIndex = String(i);
        if (card.faceUp) {
          if (selection && selection.from === 'tableau' && selection.pile === colIndex && selection.index === i) {
            cardEl.classList.add('selected');
          }
          cardEl.addEventListener('click', (e) => {
            e.stopPropagation();
            handleCardTap('tableau', colIndex, i);
          });
        }
        colEl.appendChild(cardEl);
      });

      els.tableau.appendChild(colEl);
    });

    updateStatus();
  }

  // ---------- tap handling ----------
  function handleCardTap(from, pile, index) {
    const now = Date.now();
    const same = lastTapInfo && lastTapInfo.from === from && lastTapInfo.pile === pile && lastTapInfo.index === index;
    const isDoubleTap = same && (now - lastTapInfo.time) < 400;
    lastTapInfo = { from, pile, index, time: now };

    if (isDoubleTap) {
      lastTapInfo = null;
      if (autoSendToFoundation(from, pile, index)) return;
    }

    // face-down tableau top card: flip it instead of selecting
    if (from === 'tableau') {
      const col = state.tableau[pile];
      const card = col[index];
      if (!card.faceUp) return; // shouldn't happen, guarded at render time
    }

    if (selection) {
      // if same source pile clicked, treat as re-select (for tableau runs) or move-target check
      if (from === 'tableau') {
        tryMoveSelectionTo({ type: 'tableau', col: pile });
        return;
      }
      if (from === 'foundation') {
        tryMoveSelectionTo({ type: 'foundation', suit: pile });
        return;
      }
      // tapping waste again just reselects
    }
    selectCard(from, pile, index);
  }

  function handlePileTap(target) {
    if (target.type === 'tableau' && state.tableau[target.col].length === 0 && selection) {
      tryMoveSelectionTo(target);
    }
  }

  // ---------- wiring ----------
  els.stock.addEventListener('click', drawFromStock);
  els.stock.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); drawFromStock(); } });

  document.querySelectorAll('.pile.foundation').forEach(el => {
    el.addEventListener('click', () => {
      if (state.foundations[el.dataset.suit].length === 0 && selection) {
        tryMoveSelectionTo({ type: 'foundation', suit: el.dataset.suit });
      }
    });
  });

  els.tableau.addEventListener('click', () => { /* column click handled per-column above */ });

  document.getElementById('undoBtn').addEventListener('click', undo);

  document.getElementById('newGameBtn').addEventListener('click', () => {
    if (moveCount > 0) showModal('confirmModal');
    else newGame();
  });
  document.getElementById('confirmYesBtn').addEventListener('click', () => { hideModal('confirmModal'); newGame(); });
  document.getElementById('confirmCancelBtn').addEventListener('click', () => hideModal('confirmModal'));

  document.getElementById('rulesBtn').addEventListener('click', () => showModal('rulesModal'));
  document.getElementById('closeRulesBtn').addEventListener('click', () => hideModal('rulesModal'));

  document.getElementById('winNewGameBtn').addEventListener('click', () => { hideModal('winModal'); newGame(); });

  document.getElementById('textSizeBtn').addEventListener('click', (e) => {
    const on = document.body.classList.toggle('large-text');
    e.currentTarget.setAttribute('aria-pressed', String(on));
    e.currentTarget.textContent = on ? 'A+ Normal Text' : 'A+ Larger Text';
    render();
  });

  function showModal(id) { document.getElementById(id).hidden = false; }
  function hideModal(id) { document.getElementById(id).hidden = true; }

  window.addEventListener('resize', () => render());

  // ---------- start ----------
  newGame();
})();
