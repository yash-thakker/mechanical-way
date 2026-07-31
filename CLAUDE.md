# CLAUDE.md — working notes for The Mechanical Way

Vite + three.js (^0.166) browser game, vanilla JS ES modules, no frameworks, no TypeScript.
`npm run dev` → http://localhost:5173. No test runner — testing is headless browser
playthroughs (see Testing below). Design system + module interfaces: `docs/DESIGN.md`.

## Architecture map

| File | Owns |
| --- | --- |
| `src/main.js` | Orchestration: game state, step flow, service mode, cinematics (wind/wake/flip/finale), reveals, scoring hookup, `window.__mw` debug hook, tween engine |
| `src/assembly.js` | `STEPS` (31 defs with `tiers`), dialogue lines, `LEGEND`, service point coords, `Assembly` class (ghosts, placement, difficulty filtering) |
| `src/interaction.js` | Pointer: tool pick/drop/carry, tool-gated part dragging, service-point clicks, drag-plane heights, loupe zoom |
| `src/scene.js` | Renderer/camera/lights, bench mat + tray, `HOME_POSITIONS`, TVA hallway backdrop (ceiling discs, supergraphic wall, ticker) |
| `src/ticking.js` | `TickingSim` — the whole train geared to ONE snapped escapement clock τ at exact tooth ratios; pallet lock parity, reverser jiggle, hands |
| `src/parts/gearFactory.js` | Procedural geometry primitives (gear teeth incl. `lean` saw option, escape wheel, spirals, lathe rings, plates) |
| `src/parts/watchParts.js` | Every part builder + the tooth-true drivetrain: `TEETH`, pitch radii, DERIVED `PLAN`/`MOTION` distances, `ESCAPEMENT` stone geometry, phase baking (`alignDrivetrain`), `KEYLESS`/`AUTO`, `COLORS`, dial styles |
| `src/parts/tools.js` | The 5 bench tools + leather roll, `TOOLS` educational catalog |
| `src/score.js` | Scoring, TVA-style share-card canvas, share flow (no persistence — scores are share-only) |
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
  (`state.dialChosen`); `rebuildDialParts(style)` swaps the dial + three hand parts and the
  ghost must be re-made afterwards.
- Dialogue: `tessa.say(text, {mood, interrupt})`. Anything describing the *current*
  moment must pass `interrupt: true` (clears the stale queue; old line fades, new one
  types). Tool lessons queue normally.

## Invariants / gotchas (each of these was a real bug)

- **The drivetrain is DERIVED, never drawn.** `TEETH` + pitch radii produce every
  mesh distance (Σ pitch radii), tooth size (addendum 1.05·m / dedendum 1.35·m) and
  sim speed (`ticking.js` divides the same `TEETH`). Change a tooth count or move a
  wheel only through those tables — hand-typed positions/speeds reintroduce
  tip-kissing gears and teeth that grind through each other.
- **Tooth phase is baked once** (`alignDrivetrain`): gear meshes get child
  `rotation.y` so teeth interleave (phase-sum 0.5) at every mesh line. This only
  survives because (a) `assembly.place` seats parts at rotation 0 and (b) the sim
  turns wheels at exact tooth ratios off one clock τ. The escape wheel's bake parks
  a tooth tip on the engaged pallet stone each rest (entry even beats, exit odd);
  pallet rock amplitude/sign live in `pallet.userData` (`rockAmp`/`lockSign`).
- The barrel is TWO rigid pieces (`userData.drum`/`userData.arbor`): running spins
  the drum only, winding spins arbor + ratchet only (exactly 2 ratchet teeth per
  crank so the click's pawl ends parked in a gap).
- **Never store object references in `Object3D.userData`** — three's `clone()`
  JSON-round-trips userData; cycles throw and break ghost creation. Consumed refs
  (osc, pivots, drum/arbor, reverser units, ring meshes) are fine because
  `Assembly.makeGhost` strips/restores userData, but don't add new ones casually.
- **The train CLIMBS like a real movement**: every pinion hangs BELOW its wheel, so
  each wheel seats one step above its driver (center 1.9 → third 2.15 → fourth 2.4 →
  escape 2.6; bridge 2.9; balance rim 3.15; auto bridge 3.78 with reversers on studs
  under it at 3.48/3.6; slim cock 3.9; rotor 4.12 skimming it all on the auto
  bridge's central stud) —
  which is what makes drop-in placement physically possible. The plate is a
  landscape, not a slab: THREE machined levels (deep barrel/balance sinks at −0.14
  with bearing bosses, merged train sink at 0, deck at `DECK_H` 0.18), wells computed
  as disk unions (`diskUnionOutline`), milling rings + drilled holes in the finish.
  Nothing floats: every bridge stands on feet, every wheel rides a stud or arbor.
  Change a wheel height and you must re-check the whole vertical stack, the
  service-point Ys in assembly.js, and the drag planes.
- Service markers/screws parent into `movementGroup` **or** `dialGroup` — honor
  `step.service.space === 'dial'` (`serviceSpace()` in main, `targetWorldPos` in assembly).
- Drag plane is per-phase (`interaction.setDragHeight`): 5.2 movement side (the built
  stack tops ~4.6), 6.8 dial side. Drops are judged by the **cursor ray** at target
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

- `window.__mw` exposes `{state, assembly, parts, interaction, ticking, renderer, start(cfg), tool(id), place()}`.
  Poll `__mw.ticking.running` to detect the wake; drive full runs by polling the
  complete overlay's `mw-complete--visible` class, never by counting place() calls.
  `place()` auto-completes the current step (parts and service points).
- Full-tier runs: start with the fast path, loop `place()`; wait ~17s after the wind
  trigger (wind + wake + flip cinematic), ~6s after rotor on HARD.
- For real-input tests, project 3D positions through `interaction.camera` to screen
  coords, then use puppeteer mouse. Check `pageerror` + console errors — a clean run
  prints none.
- Verify visually with screenshots; read them back before claiming success.
- Close-up shots: `announceStep` tweens `controls.target` for ~0.9s after every
  advance (set the camera, wait ~1.1s, set it AGAIN, then shoot), and the selected
  tool hovers at the cursor ray — call `interaction.deselectTool()` first or it
  photobombs every frame.
- Mesh-geometry audit: every toothed mesh carries `userData.gear` ({teeth, p, tc});
  assert pair distance ≈ Σp and interleave phase-sum ≈ 0.5 (see `alignGearMesh`).

## Conventions

- Comments explain constraints, not narration; match surrounding density.
- New parts: build in `watchParts.js` (origin at plan position, y=0 at plate top),
  register in `buildAllParts`, add `COLORS` + `COLOR_WORDS` + `LEGEND` + `HOME_POSITIONS`
  + a step def with `tiers`, hide in `LATE_PARTS` if it arrives mid-game.
- Canvas textures: set `tex.colorSpace = THREE.SRGBColorSpace`.
- Distant set dressing uses `MeshBasicMaterial` + canvas textures (fog does the grading).
