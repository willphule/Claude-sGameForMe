# Drowned Bell

An original 2D exploration platformer, built by Claude from a list of favorite games
(Metroid, Castlevania, Soul Reaver, Prince of Persia, BioShock, Myst, Oddworld and more).

The city of Carillon sank fifty years ago, the night its great bell rang. You're a diver who finds
a clockmaker's pocket watch that lets you step between **NOW** (the flooded ruins) and **THEN**
(the last stormy night before the flood). Platforms that rotted away still stand in THEN, and rubble
that fell after the flood blocks the way in NOW. Changes you make in THEN carry forward into NOW.

**Play it:** https://willphule.github.io/Claude-sGameForMe/ (once GitHub Pages is turned on, see below)

## Controls

| Action | Keyboard | Gamepad | Touch |
| --- | --- | --- | --- |
| Move | Arrows / WASD | Stick / D-pad | ◀ ▶ |
| Jump / swim up | Z / Space | A | JUMP |
| Dive | Down / S | Down | ▼ |
| Turn the watch (NOW ⇄ THEN) | X / Shift | X / bumpers | ◷ |
| Use | E / Up | B / Y | USE |
| Pause | Esc / P | Start | II |
| Sound on/off | M | | SOUND button |

## Sound

All sound effects, ambience and music are synthesised live in the browser with the Web Audio API, with no audio files.
The music is a single piece played in two versions at once: glassy and underwater for NOW, and a music box
with a ticking clock for THEN. Turning the watch crossfades between them.

## Roadmap

- [x] **Stage 1:** movement, swimming, the time-shift, one small area (rooftops → time-crossing → machine hall → floodgate shaft)
- [ ] **Stage 2:** several connected areas, a new ability, a boss
- [x] Sound effects, music, ambience and visual effects (added after Stage 1)
- [ ] **Stage 3:** story, menus, saving, polish

## Running locally

It's plain HTML and JavaScript with no build step. Serve the folder with any static server, for example:

```
python3 -m http.server
```

Then open http://localhost:8000. Opening `index.html` directly from disk won't work, because browsers
block JavaScript modules on `file://` pages.

Developer shortcuts (URL parameters): `?map` shows the whole level in both eras, and
`?play&watch&at=60,8&era=then` starts at a tile position with the watch.

## Turning on GitHub Pages

Settings → Pages → Source: *Deploy from a branch* → Branch: `main`, folder `/ (root)` → Save.
