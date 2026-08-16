# CLAUDE.md — working notes for The Mechanical Way

Vite + three.js (^0.166) browser game, vanilla JS ES modules, no frameworks, no TypeScript.
`npm run dev` → http://localhost:5173. No test runner — testing is headless browser
playthroughs (see Testing below). Design system + module interfaces: `docs/DESIGN.md`.

## Architecture map

| File | Owns |
| --- | --- |
| `src/main.js` | Orchestration: game state, step flow, service mode, cinematics (wind/wake/flip/finale), reveals, scoring hookup, `window.__mw` debug hook, tween engine |
| `src/assembly.js` | `STEPS` (all 31, every run builds all of them), dialogue lines, `LEGEND`, service point coords, `Assembly` class (ghosts, placement) |
| `src/interaction.js` | Pointer: tool pick/drop/carry, tool-gated part dragging, service-point clicks, drag-plane heights, loupe zoom |
| `src/scene.js` | Renderer/camera/lights, bench mat + tray, `HOME_POSITIONS`, TVA hallway backdrop (ceiling discs, supergraphic wall, ticker) |
| `src/ticking.js` | `TickingSim` — the whole train geared to ONE snapped escapement clock τ at exact tooth ratios; pallet lock parity, reverser jiggle, hands |
| `src/parts/gearFactory.js` | Procedural geometry primitives (gear teeth incl. `lean` saw option, escape wheel, spirals, lathe rings, plates) |
| `src/parts/watchParts.js` | Every part builder + the tooth-true drivetrain: `TEETH`, pitch radii, DERIVED `PLAN`/`MOTION` distances, `ESCAPEMENT` stone geometry, phase baking (`alignDrivetrain`), `KEYLESS`/`AUTO`, `COLORS`, dial styles |
| `src/parts/tools.js` | The 5 bench tools + leather roll, `TOOLS` educational catalog |
| `src/config.js` | Every env-driven setting (`PAGE_URL`, `LEADERBOARD_API`, `SITE_NAME`). Nothing else reads `import.meta.env`; see `.env.example` |
| `src/score.js` | Scoring, TVA-style share-card canvas + rank stamp, share flow |
| `src/leaderboard.js` | Bench records client: localStorage `mw-player-id`, time-boxed submit/fetch, single board cache. Disabled and silent when `VITE_LEADERBOARD_API` is unset |
| `server/` | Cloudflare Worker + D1 behind the board (`wrangler.toml`, `src/worker.js`, `src/names.js`, `schema.sql`) — see `server/README.md` |
| `src/ui.js` + `src/styles.css` | All `#ui-root` DOM: title, HUD, prompts, notes, legend, complete screen |
| `scripts/build-404.mjs` | The off-branch 404 page, emitted into `dist/` by a plugin in `vite.config.js` |
| `src/character.js` | Tessa: SVG mascot, speech bubble queue/typing, stages (title/center/corner), landing-page live clock, `mascotSVGMarkup()` |
| `src/audio.js` | All-procedural WebAudio (see DESIGN.md for API) |

## Game flow (the parts that bite)

- Start paths: UI START → Tessa asks the name via `ui.showPrompt`, then the bench is
  laid out (bench props hidden until `layOutBench()`); tests use the fast path
  `__mw.start({name, dialStyle})` which skips the chat. Both must end in
  `layOutBench()` + `beginRun()` and `tessa.setStage('corner')`.
- There are no difficulty levels: every run is the same 31 steps. Winding fires
  after the crown-wheel screw; the auto-winding steps sit between `wake()` and
  `flipMovement()`, and rotor screw completion triggers the flip.
- The dial closes with `crownOut()` (crown pulled, train hacked, tick audio
  stops) so the three hands go on at a dead twelve; `onAllPlaced` then runs
  `setTheTime()` — wind the motion works to the player's own clock, push the
  crown home, restart the tick — before handing off to `finaleCasing()`. The
  crown-out line must be READ before the hour hand is announced, hence the
  double `delay` in `afterPlaced`.
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
- **Hands are built against the DIAL's sign.** `buildHand` and `buildDial` must
  both send shape `+y` (12 o'clock) to world `−z` — i.e. both `rotateX(-PI/2)`.
  A `+PI/2` in `buildHand` sends the hands to `+z` instead and every hand reads
  exactly half a turn off its own face (6h30m wrong). This shipped undetected
  because the cocktail/waffle dials are rotationally symmetric: **verify hand
  angles on the `field` dial, which has numerals**, or measure the tip's world
  angle (see Testing).
- **The crown hacks the movement.** `ticking.hack(true)` zeroes `dt`, which
  stops the balance and therefore the entire train — that is exactly why the
  three hands can be fitted at twelve, the only position where they can be
  proven to agree. `crownSec` drives ONLY the motion works and the hour/minute
  hands (the cannon pinion slips on its arbor — that friction fit IS
  time-setting); `trainSec` offsets the seconds hand alone, so setting the time
  never moves it. `ticking.release({watchSec, seconds})` hands back the
  wearer's real time. A movement leaves `start()` reading 12:00:00, not the
  wall clock.
- Service markers/screws parent into `movementGroup` **or** `dialGroup` — honor
  `step.service.space === 'dial'` (`serviceSpace()` in main, `targetWorldPos` in assembly).
- Drag plane is per-phase (`interaction.setDragHeight`): 5.2 movement side (the built
  stack tops ~4.6), 6.8 dial side. Drops are judged by the **cursor ray** at target
  height, not the floating part position (parallax).
- Ticking only animates parts with `userData.placed` (motion works & rotor are placed
  after ticking starts — don't let tray parts spin).
- **The leaderboard never gates the finish.** `leaderboard.submit()` is
  time-boxed and resolves `null` on every failure (offline, CORS, refused,
  unconfigured); the complete screen and card build proceed either way and the
  board panel simply stays hidden. `computeScore` is imported BY the worker, so
  changing the scoring formula changes what the server accepts — deploy both.
- **Nothing hardcodes a domain.** `config.js` derives `PAGE_URL` from
  `window.location` unless `VITE_PAGE_URL` pins it, so forks and preview
  deploys make share links back to themselves. It is imported (via `score.js`)
  by the Cloudflare worker, where `import.meta.env` and `window` are both
  absent — every read there has to stay guarded.
- **`404.html` is generated, self-contained, and build-only.** A host serves it
  at ANY unmatched path, so with `base: './'` a bundled asset link would
  resolve against whatever directory the visitor typed. It inlines everything
  and pulls Tessa from the real `mascotSVGMarkup()`. Vite's dev server does not
  serve it — check it with `node scripts/build-404.mjs`.
- **One board, no tiers.** The complete screen's records panel is fixed
  furniture except the rows: `.mw-complete__boardList` is the only scroll
  container, and `.mw-complete__boardRow--me` is `position: sticky; bottom: 0`
  so the player's row rides the bottom of that list until you scroll down to
  where it actually sits. Its background must stay OPAQUE or rows show through
  it while pinned.
- **`you` (standing best) ≠ `runRank` (the run just played).** They differ
  whenever an older, better run still holds the player's row. The card and
  Tessa quote `runRank` because the card prints that run's score next to it;
  the panel highlights the standing row and labels it "Your best". Stamping the
  standing rank on a worse run's card was a real bug.
- `mw-player-id` is the only credential the board has — whoever holds one owns
  that row. It must never reach the DOM, a share link, or another player's
  board response (rows carry a `you` boolean instead).
- Hidden full-screen overlays must not keep `pointer-events` (the complete-screen card
  once ate clicks at screen center while invisible).
- Keyboard handlers (Z/Esc in interaction, M in ui, Space in character) must ignore
  events targeting INPUT/TEXTAREA.
- `mw-legend--hidden` / `mw-buttons--hidden` use `display:none` — HUD appears only at
  `beginRun()` via `ui.setHudVisible(true)`.
- Tray parts sit at `TRAY_SCALE` (0.5) and grow on grab; ghosts always `scale 1`.
- Progress denominators use `assembly.steps.length`, never a hand-typed 31.

## Testing (how this project verifies itself)

The claude-in-chrome extension does not connect on this machine. Use `puppeteer-core`
(devDependency) with system Chrome headless
(`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`). Import via the full
path `node_modules/puppeteer-core/lib/esm/puppeteer/puppeteer-core.js` when the script
lives outside the repo.

- **Never pass `--use-gl=swiftshader`** — it drops this scene to ~4 fps, and because
  the cinematics advance by a dt clamped to 0.05/frame, a 15-step run stretches past
  10 minutes and looks like a hang. Plain `headless: true` with no GL flags gets the
  real GPU at 60 fps (a run is ~80s). Close each page before its browser context and
  leave ~3s between WebGL contexts or the GPU process crashes with `Target closed`.
- `window.__mw` exposes `{state, assembly, parts, interaction, ticking, renderer, leaderboard, start(cfg), tool(id), place()}`.
  Poll `__mw.ticking.running` to detect the wake; drive full runs by polling the
  complete overlay's `mw-complete--visible` class, never by counting place() calls.
  `place()` auto-completes the current step (parts and service points).
- Full runs: start with the fast path, loop `place()`; wait ~17s after the wind
  trigger (wind + wake + flip cinematic), ~6s after the rotor.
- For real-input tests, project 3D positions through `interaction.camera` to screen
  coords, then use puppeteer mouse. Check `pageerror` + console errors — a clean run
  prints none.
- Verify visually with screenshots; read them back before claiming success.
- Close-up shots: `announceStep` tweens `controls.target` for ~0.9s after every
  advance (set the camera, wait ~1.1s, set it AGAIN, then shoot), and the selected
  tool hovers at the cursor ray — call `interaction.deselectTool()` first or it
  photobombs every frame.
- Leaderboard: `npm run test:board` (46 rule assertions, no network), or
  `npm run board` + `npm run dev:board` to play against a live in-memory board on
  :5180, then `npm run test:board:e2e` (30 assertions). All of it runs the real
  `server/src/worker.js` against SQLite via `server/test/d1-shim.mjs` — which
  rewrites `?1`/`?2` to `?` because `node:sqlite` won't bind numbered params.
  `dev:board` pins its port with `--strictPort`: a drifted port silently serves a
  build with no `VITE_LEADERBOARD_API` and every board assertion fails for the
  wrong reason. A headless bot clears the worker's 95s floor on its own — to
  test a refused submission, keep resetting `state.startTime`.
- Hand-angle audit: pin the dial with `ticking.crownSec = (h*3600+m*60+s) -
  ticking.tau` and `trainSec = s - ticking.tau` (hands must already be placed),
  wait a frame, then take each hand's farthest vertex, `localToWorld` it, and
  read `atan2(dx, -dz)` — 12 o'clock is world `−z`, 3 o'clock is world `+x`.
  Rotations lag one frame behind a poke, so never assert in the same evaluate.
- Mesh-geometry audit: every toothed mesh carries `userData.gear` ({teeth, p, tc});
  assert pair distance ≈ Σp and interleave phase-sum ≈ 0.5 (see `alignGearMesh`).

## Conventions

- Comments explain constraints, not narration; match surrounding density.
- New parts: build in `watchParts.js` (origin at plan position, y=0 at plate top),
  register in `buildAllParts`, add `COLORS` + `COLOR_WORDS` + `LEGEND` + `HOME_POSITIONS`
  + a step def, hide in `LATE_PARTS` if it arrives mid-game.
- Canvas textures: set `tex.colorSpace = THREE.SRGBColorSpace`.
- Distant set dressing uses `MeshBasicMaterial` + canvas textures (fog does the grading).
