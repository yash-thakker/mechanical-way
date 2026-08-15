# The Mechanical Way

A browser game where **Tessa** — a Miss Minutes-inspired clock mascot — teaches you to
assemble a real mechanical watch, part by part, tool by tool. Inspired by Bartosz
Ciechanowski's [Mechanical Watch](https://ciechanow.ski/mechanical-watch/) and dressed
in the retro-brutalist look of the TVA from *Loki*.

Every wheel, jewel, spring and screw is procedurally modeled in three.js with real
meshing gear ratios: the escapement genuinely locks and unlocks, the balance swings at
5 beats per second, the fourth wheel turns once a minute, and when you're done —
**it ticks**.

## Play

```bash
npm install
npm run dev        # → http://localhost:5173
```

Hit **START**, tell Tessa your name, pick how deep you want to go, and build.

| Difficulty | Steps | What you build |
| --- | --- | --- |
| **EASY** — The Going Train | 13 | Barrel, mainspring, gear train, escapement, balance, dial & hands |
| **MEDIUM** — + Winding & Motion Works | 20 | Easy + barrel bridge, ratchet, click, crown wheel, cannon pinion, minute & hour wheels |
| **HARD** — The Full Movement | 29 | Medium + automatic winding (reversers, rotor), date mechanism, and the complete keyless works |

### Controls

- **Click a tool** on the leather roll to pick it up — every step needs the *right* tool
  (tweezers, mainspring winder, screwdriver, oiler, hand press)
- **Drag** the glowing part onto its ghost target
- **Click pulsing rings** to drive screws and oil jewels
- Put a tool back: **click the roll**, **right-click**, or **Esc**
- **Hold Z** — loupe zoom · **drag background** — orbit · **Space / click bubble** — skip dialogue

### Scoring & sharing

Score = difficulty base − mistakes − time. Your score lives on the **SHARE SCORE**
card: a TVA-hallway-style certificate PNG (with Tessa on it) handed to the native
share sheet, clipboard, or a download.

Finished runs also go on the **bench records** board — one per difficulty, since the
tiers score on different scales. Name only, no login: a uuid in `localStorage`
identifies the browser so a returning player updates their best instead of stacking
rows. The board is optional; with no API URL configured the game runs exactly as it
did before, board and all requests included. Setup: [`server/README.md`](server/README.md).

Dial styles — chosen mid-game, right before you give the watch its face:
**Cocktail** (blue sunburst, dauphine hands) · **Waffle** (navy grid, batons) ·
**Field** (black, Arabic numerals, syringe hands).

## Tech

- [three.js](https://threejs.org) + Vite, vanilla ES modules — no frameworks
- All geometry procedural (`src/parts/gearFactory.js`): extruded gear teeth, club-toothed
  escape wheel, archimedean spiral springs, lathe rings
- All audio procedural WebAudio (`src/audio.js`) — the placement *click* is the hero sound
- Character, UI chrome, and share card are canvas/SVG/DOM overlays

See [`CLAUDE.md`](CLAUDE.md) for architecture and working notes, and
[`docs/DESIGN.md`](docs/DESIGN.md) for the design system and module interfaces.

## Deploying (GitHub Pages)

The build is fully static and uses a relative base (`vite.config.js`), so it works at
any URL. A workflow is included: push to `main`, then in the repo settings set
**Pages → Source → GitHub Actions** — `.github/workflows/deploy.yml` builds and
publishes `dist/` automatically. (Any static host works the same way:
`npm run build` → serve `dist/`.)

## Testing

Headless self-playthroughs drive the real game in Chrome via `puppeteer-core` and the
`window.__mw` debug hook (`__mw.start({name, difficulty, dialStyle})`, `__mw.place()`).
All three difficulty tiers are played end-to-end this way — see CLAUDE.md.

## Credits

- Watch mechanics and educational sequence after
  [ciechanow.ski/mechanical-watch](https://ciechanow.ski/mechanical-watch/)
- Environment look inspired by the TVA sets from Marvel Studios' *Loki*
  (fan homage; no assets copied)
