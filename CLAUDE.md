# CLAUDE.md — working notes for The Mechanical Way

Vite + three.js (^0.166) browser game, vanilla JS ES modules, no frameworks, no TypeScript.
`npm run dev` → http://localhost:5173. No test runner — testing is headless browser
playthroughs (see Testing below). Design system + module interfaces: `docs/DESIGN.md`.

## Architecture map

| File | Owns |
| --- | --- |
| `src/main.js` | Orchestration: game state, step flow, service mode, cinematics (wind/wake/flip/finale), reveals, scoring hookup, `window.__mw` debug hook, tween engine |
| `src/assembly.js` | `STEPS` (29 defs with `tiers`), dialogue lines, `LEGEND`, service point coords, `Assembly` class (ghosts, placement, difficulty filtering) |
| `src/interaction.js` | Pointer: tool pick/drop/carry, tool-gated part dragging, service-point clicks, drag-plane heights, loupe zoom |
| `src/scene.js` | Renderer/camera/lights, bench mat + tray, `HOME_POSITIONS`, TVA hallway backdrop (ceiling discs, supergraphic wall, ticker) |
| `src/ticking.js` | `TickingSim` — live escapement/train/motion-works/rotor/hands animation |
| `src/parts/gearFactory.js` | Procedural geometry primitives (gear teeth, escape wheel, spirals, lathe rings, plates) |
| `src/parts/watchParts.js` | Every watch part builder, `PLAN`/`MOTION`/`AUTO`/`KEYLESS` layouts, `COLORS`, 3 dial styles + hand shapes |
| `src/parts/tools.js` | The 5 bench tools + leather roll, `TOOLS` educational catalog |
| `src/score.js` | Scoring, localStorage leaderboard, TVA-style share-card canvas, share flow |
| `src/ui.js` + `src/styles.css` | All `#ui-root` DOM: title, HUD, prompts, notes, legend, complete screen |
| `src/character.js` | Tessa: SVG mascot, speech bubble queue/typing, stages (title/center/corner), landing-page live clock, `mascotSVGMarkup()` |
| `src/audio.js` | All-procedural WebAudio (see DESIGN.md for API) |

## Game flow (the parts that bite)

- Start paths: UI START → Tessa asks name/difficulty via `ui.showPrompt` (bench props
  hidden until `layOutBench()`); tests use the fast path `__mw.start({name, difficulty,
  dialStyle})` which skips the chat. Both must end in `layOutBench()` + `beginRun()` and
  `tessa.setStage('corner')`.
- Wind trigger differs by tier: EASY → after balance-cock screw; MEDIUM/HARD → after
  crown-wheel screw. HARD inserts auto-winding steps between `wake()` and
  `flipMovement()`; rotor screw completion triggers the flip.
- The dial style is chosen at the dial step via a gate in `assembly.onAdvance`
  (`state.dialChosen`); `rebuildDialParts(style)` swaps the dial/hands parts and the
  ghost must be re-made afterwards.
- Dialogue: `tessa.say(text, {mood, interrupt})`. Anything describing the *current*
  moment must pass `interrupt: true` (clears the stale queue; old line fades, new one
  types). Tool lessons queue normally.

## Invariants / gotchas (each of these was a real bug)

- **Never store object references in `Object3D.userData`** — three's `clone()`
  JSON-round-trips userData; cycles throw and break ghost creation. Consumed refs
  (osc, pivots) are fine because `Assembly.makeGhost` strips/restores userData, but
  don't add new ones casually.
- Service markers/screws parent into `movementGroup` **or** `dialGroup` — honor
  `step.service.space === 'dial'` (`serviceSpace()` in main, `targetWorldPos` in assembly).
- Drag plane is per-phase (`interaction.setDragHeight`): 3.6 movement side, 6.8 dial side
  (the flipped movement tops out ~4.8). Drops are judged by the **cursor ray** at target
  height, not the floating part position (parallax).
- Ticking only animates parts with `userData.placed` (motion works & rotor are placed
  after ticking starts — don't let tray parts spin).
- Hidden full-screen overlays must not keep `pointer-events` (the complete-screen card
  once ate clicks at screen center while invisible).
- Keyboard handlers (Z/Esc in interaction, M in ui, Space in character) must ignore
  events targeting INPUT/TEXTAREA.
- `mw-legend--hidden` / `mw-buttons--hidden` use `display:none` — HUD appears only at
  `beginRun()` via `ui.setHudVisible(true)`.
- Tray parts sit at `TRAY_SCALE` (0.5) and grow on grab; ghosts always `scale 1`.
- Progress denominators use `assembly.steps.length` (tier-filtered), never `STEPS.length`.

## Testing (how this project verifies itself)

The claude-in-chrome extension does not connect on this machine. Use `puppeteer-core`
(devDependency) with system Chrome headless
(`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`). Import via the full
path `node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js` when the script
lives outside the repo.

- `window.__mw` exposes `{state, assembly, parts, interaction, start(cfg), tool(id), place()}`.
  `place()` auto-completes the current step (parts and service points).
- Full-tier runs: start with the fast path, loop `place()`; wait ~17s after the wind
  trigger (wind + wake + flip cinematic), ~6s after rotor on HARD.
- For real-input tests, project 3D positions through `interaction.camera` to screen
  coords, then use puppeteer mouse. Check `pageerror` + console errors — a clean run
  prints none.
- Verify visually with screenshots; read them back before claiming success.

## Conventions

- Comments explain constraints, not narration; match surrounding density.
- New parts: build in `watchParts.js` (origin at plan position, y=0 at plate top),
  register in `buildAllParts`, add `COLORS` + `COLOR_WORDS` + `LEGEND` + `HOME_POSITIONS`
  + a step def with `tiers`, hide in `LATE_PARTS` if it arrives mid-game.
- Canvas textures: set `tex.colorSpace = THREE.SRGBColorSpace`.
- Distant set dressing uses `MeshBasicMaterial` + canvas textures (fog does the grading).
