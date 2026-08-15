# DESIGN.md — The Mechanical Way

The single source of truth for how this game looks, sounds, and speaks — plus the
interfaces between its modules. (Supersedes the old CONTRACTS.md.)

## 1. Art direction

Two worlds, one palette:

- **The bench** — a watchmaker's leather mat, blueprint etchings, parchment paperwork.
  Warm, tactile, precise. "Retro time-bureau paperwork meets watchmaker's bench."
- **The room** — a TVA-style brutalist hallway (after Jene Yeo's *Loki* still):
  a chocolate ceiling of recessed cream light discs, travertine fin walls, a giant
  weathered burgundy supergraphic ("H.4") with orange/mustard diagonal stripes, a striped
  runner on the floor, and an amber dot-matrix ticker crawling overhead. Everything
  distant is `MeshBasicMaterial` over canvas textures, graded by warm fog.

### Bench / UI tokens (CSS variables in `src/styles.css`)

```css
--ink: #241a12;         /* deep umber, app bg & text on parchment */
--ink-soft: #3a2c1e;    /* panels */
--parchment: #f2e3be;   /* cards, text on ink */
--parchment-dim: #d9c69a;
--orange: #ff7a1a;      /* signal: guide, active, CTA */
--orange-deep: #c85a08;
--brass: #c89b3c;       /* metal accents, borders */
--teal: #2e6e63;        /* success */
--red: #b3402a;         /* error */
```

### TVA backdrop tokens (`TVA` in `src/scene.js`)

chocolate `#26150c` · disc `#ece0cb` · bulb `#fff6e0` · travertine `#9f8d72` /
`#71624c` · burgundy `#6e2318` · orange `#d96a1e` · mustard `#d9a624` ·
terracotta `#7d3f24` · cream `#cfc0a4`. Fog `#1f1207` (near 46, far 150).

### Type

- **Righteous** — display (titles, big numbers, tool GO buttons)
- **IBM Plex Sans** 400/600 — body, dialogue
- **IBM Plex Mono** 400/500/700 — labels, eyebrows (`// FIELD NOTES`), stats, ticker

Eyebrow convention: mono, letter-spaced, `//`-prefixed, orange-deep.

### Part color coding (teaching palette, `COLORS` in watchParts.js)

Every part has one saturated hue used in the 3D model, the spec sheet, the field notes
swatch, and Tessa's dialogue (spoken as a WORD: "the AMBER ratchet wheel"). Keep new
parts distinct from all existing hues; register in `COLORS` + `COLOR_WORDS` + `LEGEND`.

### The share card

A flat homage to the hallway still (1200×630): disc ceiling band → amber dot-matrix
ticker (player stats) → travertine wall with the score as a giant weathered burgundy
supergraphic + diagonal stripes → striped runner floor, Tessa standing in the hall,
grain + vignette. Only the player's name appears — never contact info. The card IS
the scoreboard: scores aren't stored anywhere.

## 2. Tessa (the mascot)

An original Miss Minutes-inspired character: a **round** orange (#ff7a1a) clock face,
thin dark outline, 12 black tick marks, center-dot nose, big white oval eyes with light
amber lashes (#c97a2b — lighter than the ticks so they don't read as hour marks), open
smile, striped stick arms with white cartoon gloves, orange sneakers, and a warm
holographic glow (CSS drop-shadows).

Stages (`setStage`): `'title'` — center of the landing page with REAL clock hands
showing local time (second hand ticks 1/s); `'center'` — center stage for the intro
questions (hands hidden); `'corner'` — bench duty, bottom-left. The speech bubble is a
parchment memo card beside her; lines type at 46 cps, auto-advance, fade out when idle.
Interrupts fade the old line out — never cut mid-word, never flush-jump.

Voice: warm Southern watchmaker. "Sugar", "darlin'", short sentences, mechanical
metaphors. Educational lines carry one fact each; corrections name the fix, not the sin.

## 3. Audio (`src/audio.js`)

All procedural WebAudio, no files. Warm, mechanical, miniature — music box + bench, not
arcade. Master gain ~0.5. Every function no-ops if AudioContext is unavailable.

```js
initAudio()          // lazily on first gesture; safe to call twice
playPickup()         // soft tweezer "tink"
playPlace()          // THE hero click: layered snap + metallic ring (~150ms)
playError()          // gentle wooden thunk
playHover()          // near-silent tick on hovering the right part
playWind(progress)   // ratchet click, 0..1 raises pitch (winding, screwing)
playChime()          // two-note step-complete chime
playFanfare()        // ~2s music-box finale
startTicking(bpm) / stopTicking()
setMuted(m) / isMuted()
```

## 4. Module interfaces

DOM (index.html — do not restructure): `#app > canvas#scene + #ui-root + #character-root`.
Overlay roots are `pointer-events: none`; interactive children re-enable. UI must not
cover the bottom-left 340×360 (Tessa's corner).

### `src/ui.js` (+ owns `src/styles.css`)

```js
initUI(handlers)   // { onStart(), onShare(), onToggleMute(), onToggleLegend(), onMagnifier() }
showTitle() / hideTitle()
setStep(index, total, label)      // "STEP 03 / 20 — THE ESCAPE WHEEL"
setProgress(fraction)
setTool(name, status)             // status: 'ok' | 'none' | 'wrong' (pulse/shake)
showNotes({title, color, lines})  // FIELD NOTES card (≤4 lines) / hideNotes()
showLegend(parts) / updateLegend(parts)  // [{name, color, blurb, done}]
showPrompt({eyebrow, mode: 'name'|'choices', placeholder, choices, center, onSubmit})
hidePrompt()
setHudVisible(v)                  // SND/SPEC/Z chips — shown only once the run begins
toast(text) / flashHint(text)
showComplete({name, score, grade, timeSec, mistakes, difficulty, dialStyle})
setShareStatus(text)              // transient "COPIED!" near the share button
```

### `src/character.js`

```js
initCharacter()
say(text, {mood, interrupt})  // moods: happy|excited|thinking|cheer|oops
                              // interrupt: drop queue, fade old line, speak now
celebrate() / setIdle()
onBubbleClick(cb)
setStage('title'|'center'|'corner')
mascotSVGMarkup(size)         // static self-contained SVG string (share card)
```

### `src/score.js`

```js
computeScore({difficulty, timeSec, mistakes}) → {score, grade}
fmtTime(sec) / makeShareText(entry)
makeShareCard(entry, mascotSvg) → Promise<Blob>
share(entry, mascotSvg) → status string       // native share → clipboard → download
```

`computeScore` is imported by the leaderboard worker to recompute every
submission, so it must stay free of anything browser-only. `entry.rank` /
`entry.rankTotal`, when present, stamp a rank on both card sizes.

### `src/leaderboard.js`

```js
enabled                                  // false when VITE_LEADERBOARD_API is unset
getPlayerId() → string                   // uuid in localStorage; NEVER render it
submit(entry) → Promise<payload|null>    // {board, you, total, runRank, improved, nameAdjusted}
fetchBoard(d) / board(d) / cachedBoard(d) / remove(d)
rankLine(you, total, difficulty) → string
```

Name-only, no login: the localStorage uuid is what makes a returning player
update their best instead of adding a row, and it is the only credential in the
system — whoever holds one owns that row, so it never reaches the DOM and the
server never returns another player's.

Every call is time-boxed and resolves `null` on any failure. Unconfigured is a
supported state: with no API URL the module makes no requests and the board
panel stays hidden. Nothing in the finish sequence may block on it.

`you` is the player's standing BEST row; `runRank` is where the run just played
would sit. The card and Tessa quote `runRank` (it has to agree with the score
printed beside it); the board panel highlights the standing row and labels it
"Your best". Backend: `server/` (Cloudflare Worker + D1) — see `server/README.md`.

`localStorage` holds `mw-name` (prefill), `mw-player-id`, `mw-board-cache`.

### Game core (`main`, `scene`, `interaction`, `assembly`, `ticking`, `parts/*`)

Core calls INTO ui/character/audio/score; those modules never import from core. No
module adds window/document listeners except: bubble clicks + Space skip (character),
'm'/'l' shortcuts (ui), Z/Esc/contextmenu (interaction) — all must ignore events
targeting INPUT/TEXTAREA.

## 5. Content rules

- Facts come from the mechanics of real watchmaking (source: ciechanow.ski/mechanical-watch).
  One idea per field-note line; Tessa's announce line teaches placement + tool + why.
- Wrong-tool lines explain what the held tool is FOR before naming the needed one.
- No brand names on dials — the three styles are homages under the MECHANICAL WAY brand.
- Collect nothing but a display name — no email, no login, no tracking. It goes on
  a public board, so the server inspects it (see `server/src/names.js`) and tells
  the player when it rewrote one rather than renaming them silently.
