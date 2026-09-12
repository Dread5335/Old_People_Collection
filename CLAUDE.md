# Quiet Games — project brief

## What this is

A suite of simple, ad-free web games (Solitaire, and eventually Mahjong and
Minesweeper) built for people — especially older users — who get targeted by
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
  test/
    smoke.js                # headless jsdom smoke test (solitaire)
    minesweeper-smoke.js     # headless jsdom smoke test (minesweeper)
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
- **Mahjong is not started.** It's still listed as a greyed-out
  "Coming soon" tile on the hub page.
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
  for Mahjong/Minesweeper rather than optimizing prematurely.
- `snapshot()` before every mutating move, pushed onto a `history` stack,
  popped by `undo()`. Every game should offer Undo the same way.
- Tap/click handling is centralized (`handleCardTap`, `handlePileTap`)
  rather than scattered inline handlers, and includes manual double-tap
  detection (not just `dblclick`) so it works on touch, not just desktop.

## Testing

`test/smoke.js` loads the real `index.html` + `game.js` into a headless
DOM via `jsdom` and clicks through a handful of core interactions (draw,
select, move attempt, undo, new game, modal open/close, text-size toggle)
to catch runtime errors. It's a smoke test, not full coverage.

```bash
npm install jsdom --no-save
node test/smoke.js
```

When adding a new game, add an equivalent `test/<game>-smoke.js` that at
minimum: loads the page without throwing, deals/initializes correctly,
and exercises Undo and New Game.

## Wrapping for app stores (not done yet, but the plan)

Static HTML/CSS/JS wraps cleanly with [Capacitor](https://capacitorjs.com/):

```bash
npm init -y
npm install @capacitor/core @capacitor/cli @capacitor/android @capacitor/ios
npx cap init "Quiet Games" "com.yourname.quietgames"
npx cap add android
npx cap add ios
```

Before an actual store submission: real app icons/splash screen, decide
hub-vs-single-game as the launch screen, and a one-line "this app collects
no data and makes no network requests" privacy policy page (both stores
require a privacy policy URL even for apps that collect nothing).

## Suggested next steps

1. Add Mahjong (tile-matching) under `games/mahjong/`, reusing
   `shared/theme.css` and the `state` + `render()` + `snapshot()/undo()`
   pattern above.
2. Add a tile for it on the hub `index.html` (remove the `soon` class,
   point the link at the new game) — same as was done for Minesweeper.
3. Consider `localStorage`-based "resume last game" — on-device only, so
   it doesn't violate the no-tracking constraint.
