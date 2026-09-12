# Old People Collection — project brief

## What this is

A suite of simple, ad-free web games (Solitaire, Minesweeper, and Mahjong)
built for people — especially older users — who get targeted by
predatory ad networks on free game sites (fake "your PC is infected" popups,
autoplaying video ads, deceptive "click here" buttons disguised as game
controls). The whole point of the project is what it *doesn't* have: no ads,
no ad SDKs, no analytics, no tracking, no network calls of any kind.

Eventual goal: publish to the Play Store and App Store, wrapped with
Capacitor (see "Wrapping for app stores" below). Web-first, store-wrapped
later.

## Non-negotiable constraints

These are product requirements, not style preferences — please don't
loosen them without checking with me first:

1. **Zero network requests.** No CDN fonts, no CDN libraries, no remote
   images, no analytics beacons, nothing. Everything the app needs ships in
   the folder. This is both a privacy commitment and what makes the app
   trustworthy to the audience it's for.
2. **No ads, ever.** No ad slots, no "sponsored" content, no affiliate
   links inside gameplay.
3. **No `window.alert` / `window.confirm` / `window.prompt`.** Native
   browser dialogs look identical to scareware popups. All dialogs are
   in-page, styled like the rest of the app (see `.modal-backdrop` /
   `.modal-box` in `shared/theme.css`).
4. **Big, plain-language UI.** Real buttons with real labels ("New Game",
   "Undo"), not icon-only controls. Minimum ~48px touch targets. A
   large-text toggle should exist on every game (Solitaire's is the
   pattern to copy — `#textSizeBtn` toggling a `large-text` class on
   `<body>`, with CSS using `var(--ui-scale)`).
5. **No drag-and-drop as the only input method.** Tap-to-select,
   tap-to-place is the accessible baseline (easier for anyone with a
   tremor, arthritis, or an unfamiliar trackpad/touchscreen). Drag can be
   added as a bonus later, but never as a requirement to play.
6. **No build step required to run it.** Plain HTML/CSS/JS, no bundler,
   no framework, no `npm install` needed just to open the game in a
   browser. (`npm install jsdom` is fine, but only as a *dev-time test
   dependency* — see Testing below.)

## Current state

```
quiet-games-suite/
  index.html              # hub/launcher page — tiles link out to each game
  shared/
    theme.css              # shared visual theme + reusable components
  games/
    solitaire/
      index.html
      style.css
      game.js               # fully playable, the original reference implementation
    minesweeper/
      index.html
      style.css
      game.js               # fully playable
    mahjong/
      index.html
      style.css
      game.js               # fully playable
  test/
    smoke.js                # headless jsdom smoke test (solitaire)
    minesweeper-smoke.js     # headless jsdom smoke test (minesweeper)
    mahjong-smoke.js         # headless jsdom smoke test (mahjong)
  README.md
```

- **Solitaire (Klondike) is done and playable.** Draw pile, waste,
  4 foundations, 7 tableau columns, undo, move counter, win detection,
  "How to Play" modal, new-game confirmation modal, large-text toggle.
- **Minesweeper is done and playable.** Board-size picker (Small 9×9,
  Medium 12×12, Large 16×16) plus an independent mine-count +/- stepper
  (bounded per size, roughly 6%-35% density), flood-fill reveal, a "Flag
  Mode" toggle button in place of right-click/long-press (accessible on
  touch), double-tap chording, win/lose modals, large-text toggle.
  No Undo — tapping a mine ends the game, same as classic Minesweeper.
- **Mahjong (tile-matching) is done and playable.** Board-size picker
  (Small 52 tiles, Medium 116, Large 216) laid out as a stepped pyramid
  of layers; tap two tiles with the same rank+suit (reusing Solitaire's
  card glyphs, not the Unicode Mahjong-tile block, which has weak font
  support) to clear them. Only "free" tiles (nothing on top, not boxed
  in on both sides) are tappable. The board is generated to always be
  solvable at the start (see the big comment atop `game.js`), and a
  "Shuffle Tiles" button/modal handles the case where the player's own
  moves paint them into a corner later. No Undo, same reasoning as
  Minesweeper.
- **All three games show a difficulty/size picker immediately on first
  load**, not only from "New Game" — don't regress that; it was a
  deliberate fix after Minesweeper originally only showed it from New
  Game and that confused first-time players.
- **No persistence yet.** Refreshing the page loses the current game.
  `localStorage` would be fine to add (it's on-device, not tracking) but
  hasn't been built.

## Design system (`shared/theme.css`)

Visual direction is a real card-table look — wood-grain frame (CSS
gradient, no image), green felt, an engraved brass nameplate for the
title — deliberately *not* generic app chrome, and deliberately *not* one
of the generic AI-design defaults (no cream+terracotta, no dark+neon
accent, no broadsheet/hairline-rule layout).

Reusable pieces any new game should use rather than reinvent:
- `.wood-frame` / `.felt` — page shell
- `.brass-plate` — title treatment
- `button`, `.btn`, `.btn.primary` — all buttons, already sized/styled
  for the accessibility requirements above
- `.modal-backdrop` / `.modal-box` / `.modal-actions` — the only dialog
  pattern to use (see constraint #3)
- CSS custom properties for color/type/spacing — new games should add
  game-specific variables in their own `style.css`, not hardcode colors
  that duplicate the theme

## How `game.js` is structured (the pattern for future games)

Solitaire's `game.js` is a single IIFE, no imports, no build tooling:

- `state` is one plain object; the DOM is purely a rendering of `state`,
  never a second source of truth.
- `render()` wipes and rebuilds the relevant DOM from `state` after every
  change. Not the most "efficient" possible approach, but simple to
  reason about and plenty fast for games this size — keep this pattern
  for future games rather than optimizing prematurely.
- `snapshot()` before every mutating move, pushed onto a `history` stack,
  popped by `undo()` — this is Solitaire's pattern, but Undo is a
  per-game call, not a hard rule: Minesweeper and Mahjong deliberately
  don't have it (undoing a mine, or an unfavorable tile match, would
  undercut the actual game). Add it only where taking back a move fits
  the game.
- Tap/click handling is centralized (`handleCardTap`, `handlePileTap`)
  rather than scattered inline handlers, and includes manual double-tap
  detection (not just `dblclick`) so it works on touch, not just desktop.

## Testing

Each game has a `test/<game>-smoke.js` that loads its real `index.html` +
`game.js` into a headless DOM via `jsdom` and clicks through a handful of
core interactions (deal/draw, select, a move or match attempt, new game,
modal open/close, text-size toggle) to catch runtime errors. These are
smoke tests, not full coverage — they've caught real regressions before
(see git history), but they run in jsdom, which doesn't apply CSS layout,
so a visual-only bug (wrong thing shown, wrong thing hidden) can pass a
green smoke test. Always also sanity-check a change in an actual browser.

```bash
npm install jsdom --no-save
node test/smoke.js
node test/minesweeper-smoke.js
node test/mahjong-smoke.js
```

When adding a new game, add an equivalent `test/<game>-smoke.js` that at
minimum: loads the page without throwing, deals/initializes correctly,
and exercises Undo and New Game.

## Wrapping for app stores (not done yet, but the plan)

Static HTML/CSS/JS wraps cleanly with [Capacitor](https://capacitorjs.com/):

```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init "Old People Collection" "com.yourname.oldpeoplecollection"
npx cap add android
npx cap add ios
```

Before an actual store submission: real app icons/splash screen, decide
hub-vs-single-game as the launch screen, and a one-line "this app collects
no data and makes no network requests" privacy policy page (both stores
require a privacy policy URL even for apps that collect nothing).

## Suggested next steps

All three planned games (Solitaire, Minesweeper, Mahjong) are done. From
here:

1. Consider `localStorage`-based "resume last game" — on-device only, so
   it doesn't violate the no-tracking constraint.
2. A downloadable release (see the GitHub Releases page) exists for
   offline/local play; keep it in sync by re-zipping the runtime files
   (not `test/` or this file) after meaningful changes, bumping the
   version tag.
3. Beyond that, new game ideas should stay in "quiet game" territory —
   see the README's "Got a game idea?" section for the bar to clear.
