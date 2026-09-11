# Quiet Games

A small suite of ad-free, distraction-free games — starting with Klondike
Solitaire — built for people who don't want to gamble with fake "Your PC is
infected" popups just to play a game of cards.

See `CLAUDE.md` for the full project brief (constraints, architecture,
roadmap) — that file is written for handing this project to Claude Code.

## Running it

No build step, no install. Just open `index.html` in a browser.

If a game doesn't load correctly straight from `file://`, serve the folder
locally instead (still fully offline, this just avoids browser file:// quirks):

```bash
cd quiet-games-suite
python3 -m http.server 8000
# then open http://localhost:8000
```

## Testing

```bash
npm install jsdom --no-save
node test/smoke.js
```
