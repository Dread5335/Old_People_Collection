# Quiet Games

A small suite of ad-free, distraction-free games — starting with Klondike
Solitaire — built for people who don't want to gamble with fake "Your PC is
infected" popups just to play a game of cards.

**Play it now, no install:** https://dread5335.github.io/Old_People_Collection/

See `CLAUDE.md` for the full project brief (constraints, architecture,
roadmap) — that file is written for handing this project to Claude Code.

## Mission

Quiet Games exists because a lot of the "free games" corner of the internet
has quietly become hostile territory, and the people most often on the
receiving end are the ones least equipped to spot it — grandparents, parents
who didn't grow up with this stuff, anyone who just wants to play a hand of
Solitaire without being treated as an ad-revenue target. Full-screen "Your PC
is infected, call this number" popups, autoplaying video ads with a fake
close button, "click here" prompts disguised as part of the game — none of
that is accidental, and none of it belongs anywhere near something meant to
be relaxing.

This project is built with the help of AI (Claude), but every constraint
below is a deliberate product decision, not a default:

- **No ads. No analytics. No tracking. No network calls, period.** Once a
  page loads, it never talks to the internet again — nothing to inject an ad
  into, nothing to sell your attention to.
- **No native browser popups** (`alert`/`confirm`/`prompt`). Those dialogs
  are visually indistinguishable from scareware, so this suite never uses
  them — every dialog is our own, styled, and obviously part of the game.
- **Built for hands and eyes that aren't 25 anymore.** Big buttons, real
  labels, a large-text toggle, tap-to-select instead of finicky
  drag-and-drop.

The goal is a small library of games — Solitaire is done, Mahjong and
Minesweeper are next — that you could hand to your grandparent, walk away,
and never worry about what they might accidentally click.

**Found a bug?** [Open an issue](../../issues) and I'll take a look when I
get a chance — no promises on turnaround, but I do read them.

**Got a game idea?** This suite is meant to stay in "quiet game" territory on
purpose — simple rules, low pressure, nothing twitchy or time-pressured,
nothing that needs an explanation longer than a sentence or two. Solitaire,
Mahjong, Minesweeper, checkers, hearts, dominoes, that kind of thing. If
you've got a suggestion in that spirit, [open an issue](../../issues) for
it — genuinely open to ideas, just keep it in the "quiet" lane rather than
something that needs real-time reflexes or a tutorial.

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
