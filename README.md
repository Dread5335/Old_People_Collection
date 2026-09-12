# Old People Collection

A small suite of ad-free, distraction-free games — Klondike Solitaire,
Minesweeper, and Mahjong (tile-matching) — built for people who don't want
to gamble with fake "Your PC is infected" popups just to play a game of
cards.

**Download a copy to keep and play offline:** grab the zip from the
[latest release](../../releases/latest). Unzip it anywhere and open
`index.html` — no internet connection is needed or used, ever. This is
the better option for someone who isn't comfortable typing a web
address, since the unzipped folder can sit on the desktop as its own
icon instead.

See `CLAUDE.md` for the full project brief (constraints, architecture,
roadmap) — that file is written for handing this project to Claude Code.

## Mission

Old People Collection exists because a lot of the "free games" corner of the internet
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

The goal is a small library of games — Solitaire, Minesweeper, and Mahjong
are all done — that you could hand to your grandparent, walk away, and
never worry about what they might accidentally click.

**Found a bug?** [Open an issue](../../issues) and I'll take a look when I
get a chance — no promises on turnaround, but I do read them.

**Got a game idea?** This suite is meant to stay in "quiet game" territory on
purpose — simple rules, low pressure, nothing twitchy or time-pressured,
nothing that needs an explanation longer than a sentence or two. Checkers,
hearts, dominoes, that kind of thing. If you've got a suggestion in that
spirit, [open an issue](../../issues) for it — genuinely open to ideas,
just keep it in the "quiet" lane rather than something that needs
real-time reflexes or a tutorial.

## Testing

```bash
npm install jsdom --no-save
node test/smoke.js
node test/minesweeper-smoke.js
node test/mahjong-smoke.js
```
