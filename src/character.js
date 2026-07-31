// src/character.js
// "Tessa" — an original cartoon clock-face mascot (Miss Minutes-inspired look).
// Vanilla JS ES module, no deps.
// Builds an inline SVG + speech bubble into #character-root. Owner: character subagent.
// Contract: docs/DESIGN.md — exports initCharacter, say, celebrate, setIdle, onBubbleClick.

import * as audio from './audio.js';

// ---------------------------------------------------------------------------
// Module state (all DOM refs are null until initCharacter() runs)
// ---------------------------------------------------------------------------
let root = null;
let bubbleEl = null;
let bubbleTextEl = null;
let mascotEl = null;
let handsGroupEl = null;
let eyesGroupEl = null;
let leftLidEl = null;
let rightLidEl = null;
let mouthEl = null;
let mouthShapeEl = null;
let toothEl = null;
let leftArmEl = null;
let rightArmEl = null;

let timecardEl = null;
let clockTimer = null;
let clockHourEl = null;
let clockMinuteEl = null;
let clockSecondEl = null;
let clickCb = null;
let initialized = false;
let reducedMotion = false;

let blinkTimer = null;
let tickTimer = null;
let moodTimer = null;

// typing / speech-queue state
let typing = false;
let typeTimer = null;
let queue = []; // [{text, opts}]
let currentFullText = '';
let bubbleShown = false;
let bubbleFullyTyped = false;
let bubbleDim = false;
let autoTimer = null; // auto-advance / auto-hide
let pendingNext = null;  // newest interrupt line, waiting a beat so the
let pendingTimer = null; // current sentence can land before the next begins

// The standing line for the current game state (a step instruction, a
// cinematic beat). It never auto-hides: it stays on screen until the next
// sticky line replaces it. Transient lines (error feedback, tool lessons)
// cut in over it and it comes back when they are done.
let stickyLine = null;       // {text, opts} | null
let currentIsSticky = false; // is the bubble currently showing stickyLine?
let restoreToken = 0;        // cancels an in-flight restore when a new line lands


// Fast type-on, long hold: instructions should appear quickly and then stay
// readable — the hold time scales with line length (see scheduleAutoAdvance).
const CHARS_PER_SEC = 62;

// ---------------------------------------------------------------------------
// Styles (scoped, injected once)
// ---------------------------------------------------------------------------
const STYLE_ID = 'tessa-styles';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
#character-root { overflow: visible; }
.tessa-wrap { position: absolute; left: 8px; bottom: 0; width: 320px; height: 340px; pointer-events: none; }
.tessa-mascot { position: absolute; left: 4px; bottom: 4px; width: 148px; height: auto; overflow: visible; animation: tessa-bob 2.4s ease-in-out infinite; transform-origin: 50% 100%;
  filter: drop-shadow(0 0 14px rgba(255, 140, 42, 0.7)) drop-shadow(0 0 42px rgba(255, 122, 26, 0.38));
  transition: left 0.7s ease, bottom 0.7s ease, width 0.7s ease; }
/* center-stage: she steps to the middle of the screen to talk to the player */
.tessa-wrap--center .tessa-mascot { width: 300px; left: calc(50vw - 158px); bottom: calc(50vh - 195px); }
.tessa-wrap--center .tessa-bubble { left: calc(50vw + 170px); bottom: calc(50vh - 40px); }
.tessa-mascot.tessa-mood-excited { animation: tessa-bob-fast 0.5s ease-in-out 2; }
.tessa-mascot.tessa-mood-cheer { animation: tessa-jump 0.45s ease-in-out 2; }
.tessa-mascot.tessa-mood-oops { animation: tessa-shake 0.5s ease-in-out 1; }
.tessa-mascot.tessa-mood-thinking { animation: tessa-tilt 1.2s ease-in-out 1; }
.tessa-mascot.tessa-celebrate { animation: tessa-jump-big 0.5s ease-in-out 3; }

@keyframes tessa-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
@keyframes tessa-bob-fast { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-14px) scale(1.03); } }
@keyframes tessa-jump { 0%, 100% { transform: translateY(0); } 40%, 60% { transform: translateY(-20px); } }
@keyframes tessa-jump-big { 0%, 100% { transform: translateY(0) rotate(0deg); } 35% { transform: translateY(-30px) rotate(-4deg); } 55% { transform: translateY(-30px) rotate(4deg); } }
@keyframes tessa-shake {
  0%, 100% { transform: translateX(0) rotate(0deg) scale(1); }
  20% { transform: translateX(-6px) rotate(-4deg) scale(0.97); }
  40% { transform: translateX(6px) rotate(4deg) scale(0.97); }
  60% { transform: translateX(-4px) rotate(-2deg) scale(0.97); }
  80% { transform: translateX(4px) rotate(2deg) scale(0.97); }
}
@keyframes tessa-tilt { 0%, 100% { transform: rotate(0deg); } 50% { transform: rotate(-6deg); } }

.tessa-eyelid { transform-origin: 50% 50%; transform: scaleY(0.01); opacity: 0; }
.tessa-eyelid.tessa-blinking { animation: tessa-blink 0.22s ease-in-out; }
@keyframes tessa-blink { 0%, 100% { transform: scaleY(0.01); opacity: 0; } 50% { transform: scaleY(1); opacity: 1; } }

.tessa-eyes.tessa-mood-excited .tessa-eye { transform: scale(1.18); }
.tessa-eyes.tessa-mood-thinking .tessa-pupil { transform: translate(3px, -3px); }
.tessa-eyes.tessa-mood-oops .tessa-eye { transform: scaleY(0.15); }
.tessa-eye { transform-origin: 100px 96px; transition: transform 0.2s ease; }
.tessa-pupil { transition: transform 0.2s ease; }

.tessa-arm { transform-origin: var(--tessa-arm-origin-x, 50%) var(--tessa-arm-origin-y, 0%); }
.tessa-arm-right.tessa-mood-excited, .tessa-arm-left.tessa-mood-excited { animation: tessa-arm-spin 0.6s linear 1; }
.tessa-arm-right.tessa-mood-cheer, .tessa-arm-left.tessa-mood-cheer { animation: tessa-arm-up 0.9s ease-in-out 1; }
.tessa-arm-right.tessa-celebrate, .tessa-arm-left.tessa-celebrate { animation: tessa-arm-up 0.6s ease-in-out 3; }
.tessa-arm-right.tessa-mood-thinking { animation: tessa-tap-chin 1.2s ease-in-out 1; }

@keyframes tessa-arm-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
@keyframes tessa-arm-up { 0%, 100% { transform: rotate(0deg) translateY(0); } 50% { transform: rotate(-35deg) translateY(-10px); } }
@keyframes tessa-tap-chin { 0%, 100% { transform: rotate(0deg); } 30%, 50%, 70% { transform: rotate(-18deg); } 40%, 60% { transform: rotate(-8deg); } }

.tessa-hands-group.tessa-mood-excited, .tessa-hands-group.tessa-celebrate { animation: tessa-hand-spin 0.5s linear 2; }
/* the group carries an SVG transform="translate(100 124)"; a CSS transform
   REPLACES it, so the keyframes must re-state the translate or the center
   dot (her nose) flies to the svg origin, off her face */
@keyframes tessa-hand-spin { 0% { transform: translate(100px, 124px) rotate(0deg); } 100% { transform: translate(100px, 124px) rotate(360deg); } }

/* Landing page: she stands over the title screen (z 100) telling the time */
.tessa-wrap--title .tessa-mascot { z-index: 120; width: 330px; left: calc(50vw - 173px); bottom: calc(50vh - 212px); }
.tessa-clock { display: none; }
.tessa-wrap--title .tessa-clock,
.tessa-wrap--corner .tessa-clock { display: block; }

/* her mouth actually moves while she talks */
.tessa-mouth { transform-box: fill-box; transform-origin: 50% 30%; }
.tessa-mouth.tessa-talking { animation: tessa-mouth-flap 0.24s ease-in-out infinite; }
@keyframes tessa-mouth-flap {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(0.55); }
}
.tessa-timecard {
  display: none;
  position: absolute;
  left: calc(50vw - 200px);
  width: 400px;
  bottom: calc(50vh - 292px);
  z-index: 120;
  text-align: center;
  pointer-events: none;
}

.tessa-timecard-date {
  font-family: var(--font-mono, monospace);
  font-size: 14px;
  letter-spacing: 0.22em;
  color: var(--brass, #c89b3c);
}

/* Speech bubble: parchment memo card */
.tessa-bubble {
  position: absolute; left: 160px; bottom: 14px; width: 340px; max-width: 420px;
  background: var(--parchment, #f2e3be); border: 2px solid var(--brass, #c89b3c); border-radius: 6px;
  box-shadow: 3px 3px 0 rgba(0,0,0,.35); transform: rotate(-1.2deg); padding: 10px 14px 12px;
  pointer-events: none; cursor: pointer; opacity: 0; transition: opacity 0.3s ease, filter 0.15s ease; z-index: 5;
}
.tessa-bubble.tessa-bubble-visible { opacity: 1; pointer-events: auto; }
.tessa-bubble.tessa-bubble-dim { filter: brightness(0.85) saturate(0.8); }
.tessa-bubble::after {
  content: ''; position: absolute; left: -16px; bottom: 24px; width: 0; height: 0;
  border-top: 9px solid transparent; border-bottom: 5px solid transparent;
  border-right: 16px solid var(--brass, #c89b3c); transform: rotate(6deg);
}
.tessa-bubble::before {
  content: ''; position: absolute; left: -11px; bottom: 27px; width: 0; height: 0;
  border-top: 7px solid transparent; border-bottom: 4px solid transparent;
  border-right: 12px solid var(--parchment, #f2e3be); transform: rotate(6deg); z-index: 1;
}
.tessa-bubble-eyebrow { font-family: var(--font-mono, monospace); font-size: 10px; letter-spacing: 0.06em; color: var(--orange, #ff7a1a); font-weight: 500; margin-bottom: 4px; }
.tessa-bubble-text { font-family: var(--font-body, sans-serif); font-size: 14px; line-height: 1.35; color: var(--ink, #241a12); min-height: 1.35em; white-space: pre-wrap; transition: opacity 0.18s ease; }

/* Confetti */
.tessa-confetti-layer { position: absolute; inset: 0; pointer-events: none; overflow: visible; }
.tessa-confetto { position: absolute; left: 90px; bottom: 140px; width: 7px; height: 7px; opacity: 1; animation: tessa-confetti-burst 1.6s cubic-bezier(0.2, 0.7, 0.4, 1) forwards; }
@keyframes tessa-confetti-burst {
  0% { transform: translate(0, 0) rotate(0deg); opacity: 1; }
  100% { transform: var(--tessa-confetti-end, translate(0, -120px) rotate(300deg)); opacity: 0; }
}

@media (prefers-reduced-motion: reduce) {
  .tessa-mascot, .tessa-arm, .tessa-hands-group, .tessa-mouth { animation: none !important; }
  .tessa-mascot { transition: opacity 0.4s ease; }
  .tessa-eyelid.tessa-blinking { animation-duration: 0.01s; }
  .tessa-confetto { animation-name: tessa-confetti-fade; }
  @keyframes tessa-confetti-fade { 0% { opacity: 1; } 100% { opacity: 0; } }
}
`;
  document.head.appendChild(style);
}

// ---------------------------------------------------------------------------
// SVG construction
// ---------------------------------------------------------------------------
const SVG_NS = 'http://www.w3.org/2000/svg';

function el(tag, attrs) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  return e;
}

// Shared geometry for the 12 clock-face tick marks (used by both the live
// DOM build and the static mascotSVGMarkup() string), so the two stay in
// sync. Face circle is centered at (100, 124) with r 76.
function tickMarks() {
  const marks = [];
  for (let i = 0; i < 12; i++) {
    const ang = (i / 12) * Math.PI * 2;
    const major = i % 3 === 0; // 12 / 3 / 6 / 9 o'clock
    const outerF = 0.90;
    const innerF = major ? 0.66 : 0.78;
    marks.push({
      x1: 100 + 76 * outerF * Math.sin(ang),
      y1: 124 - 76 * outerF * Math.cos(ang),
      x2: 100 + 76 * innerF * Math.sin(ang),
      y2: 124 - 76 * innerF * Math.cos(ang),
      w: major ? 3.4 : 2.1,
    });
  }
  return marks;
}

// Big white cartoon glove: a rounded palm plus a 3-finger fan.
function makeGlove(cx, cy) {
  const glove = el('g', { class: 'tessa-glove' });
  glove.appendChild(el('ellipse', { cx, cy, rx: 15, ry: 13, fill: '#ffffff', stroke: '#241a12', 'stroke-width': 2 }));
  glove.appendChild(el('ellipse', {
    cx: cx - 13, cy: cy - 12, rx: 6, ry: 8, fill: '#ffffff', stroke: '#241a12', 'stroke-width': 1.6,
    transform: `rotate(-18 ${cx - 13} ${cy - 12})`,
  }));
  glove.appendChild(el('ellipse', { cx, cy: cy - 17, rx: 6, ry: 9, fill: '#ffffff', stroke: '#241a12', 'stroke-width': 1.6 }));
  glove.appendChild(el('ellipse', {
    cx: cx + 13, cy: cy - 12, rx: 6, ry: 8, fill: '#ffffff', stroke: '#241a12', 'stroke-width': 1.6,
    transform: `rotate(18 ${cx + 13} ${cy - 12})`,
  }));
  return glove;
}

function buildSVG() {
  const svg = el('svg', {
    class: 'tessa-mascot',
    viewBox: '0 0 200 250',
    xmlns: SVG_NS,
  });

  // Face gradient: warm lighter center fading to a deeper orange at the rim
  const defs = el('defs', {});
  const grad = el('radialGradient', { id: 'tessaFaceGrad', cx: '42%', cy: '36%', r: '70%' });
  grad.appendChild(el('stop', { offset: '0%', 'stop-color': '#ff8f35' }));
  grad.appendChild(el('stop', { offset: '100%', 'stop-color': '#f06d0e' }));
  defs.appendChild(grad);
  svg.appendChild(defs);

  // Thin black stick legs + chunky orange sneakers with white soles
  const legs = el('g', { class: 'tessa-legs' });
  legs.appendChild(el('line', { x1: 80, y1: 198, x2: 78, y2: 230, stroke: '#241a12', 'stroke-width': 6, 'stroke-linecap': 'round' }));
  legs.appendChild(el('line', { x1: 120, y1: 198, x2: 122, y2: 230, stroke: '#241a12', 'stroke-width': 6, 'stroke-linecap': 'round' }));
  legs.appendChild(el('rect', { x: 59, y: 240, width: 38, height: 7, rx: 3, fill: '#ffffff', stroke: '#241a12', 'stroke-width': 2 }));
  legs.appendChild(el('rect', { x: 61, y: 226, width: 34, height: 17, rx: 8, fill: '#ff7a1a', stroke: '#241a12', 'stroke-width': 2.5 }));
  legs.appendChild(el('rect', { x: 103, y: 240, width: 38, height: 7, rx: 3, fill: '#ffffff', stroke: '#241a12', 'stroke-width': 2 }));
  legs.appendChild(el('rect', { x: 105, y: 226, width: 34, height: 17, rx: 8, fill: '#ff7a1a', stroke: '#241a12', 'stroke-width': 2.5 }));
  svg.appendChild(legs);

  // Left arm (resting) — the top of the path sits inside the body ellipse
  // (hidden under the face fill, drawn next) so it reads as emerging from
  // the body, then curves clear of the body outline for a good visible
  // stretch before ending in a big white glove.
  const leftArm = el('g', {
    class: 'tessa-arm tessa-arm-left',
    style: '--tessa-arm-origin-x:52px; --tessa-arm-origin-y:148px;',
  });
  leftArm.appendChild(el('path', {
    d: 'M 52 148 C 34 160, 16 176, 20 202',
    fill: 'none', stroke: '#ff7a1a', 'stroke-width': 9, 'stroke-linecap': 'round',
  }));
  leftArm.appendChild(el('line', { x1: 12, y1: 172, x2: 32, y2: 176, stroke: '#c85a08', 'stroke-width': 5, 'stroke-linecap': 'round' }));
  leftArm.appendChild(el('line', { x1: 10, y1: 180, x2: 30, y2: 184, stroke: '#c85a08', 'stroke-width': 5, 'stroke-linecap': 'round' }));
  leftArm.appendChild(makeGlove(20, 202));
  leftArmEl = leftArm;
  svg.appendChild(leftArm);

  // Right arm (gesturing)
  const rightArm = el('g', {
    class: 'tessa-arm tessa-arm-right',
    style: '--tessa-arm-origin-x:148px; --tessa-arm-origin-y:148px;',
  });
  rightArm.appendChild(el('path', {
    d: 'M 148 148 C 166 160, 184 176, 180 202',
    fill: 'none', stroke: '#ff7a1a', 'stroke-width': 9, 'stroke-linecap': 'round',
  }));
  rightArm.appendChild(el('line', { x1: 188, y1: 172, x2: 168, y2: 176, stroke: '#c85a08', 'stroke-width': 5, 'stroke-linecap': 'round' }));
  rightArm.appendChild(el('line', { x1: 190, y1: 180, x2: 170, y2: 184, stroke: '#c85a08', 'stroke-width': 5, 'stroke-linecap': 'round' }));
  rightArm.appendChild(makeGlove(180, 202));
  rightArmEl = rightArm;
  svg.appendChild(rightArm);

  // Body: single tall clock-face ellipse, thin dark outline, warm radial gradient
  const body = el('g', { class: 'tessa-body' });
  body.appendChild(el('circle', { cx: 100, cy: 124, r: 76, fill: 'url(#tessaFaceGrad)', stroke: '#241a12', 'stroke-width': 3 }));
  svg.appendChild(body);

  // Tick marks around the inside of the face (12/3/6/9 longer + thicker)
  const ticks = el('g', { class: 'tessa-ticks' });
  tickMarks().forEach((t) => {
    ticks.appendChild(el('line', {
      x1: t.x1, y1: t.y1, x2: t.x2, y2: t.y2, stroke: '#241a12', 'stroke-width': t.w, 'stroke-linecap': 'round',
    }));
  });
  svg.appendChild(ticks);

  // Center post ("nose") — the clock's center dot. This group also keeps the
  // old .tessa-hands-group hook alive: there are no clock hands to tick
  // anymore (see startHandTicking, now a no-op), but mood animations that
  // target this class still have a sensible element to attach to.
  const handsGroup = el('g', { class: 'tessa-hands-group', transform: 'translate(100 124)' });
  // landing-page clock hands: hour / minute / second, rotated to real local time
  const clock = el('g', { class: 'tessa-clock' });
  clockHourEl = el('line', { x1: 0, y1: 6, x2: 0, y2: -34, stroke: '#241a12', 'stroke-width': 6, 'stroke-linecap': 'round' });
  clockMinuteEl = el('line', { x1: 0, y1: 8, x2: 0, y2: -52, stroke: '#241a12', 'stroke-width': 4, 'stroke-linecap': 'round' });
  clockSecondEl = el('line', { x1: 0, y1: 12, x2: 0, y2: -58, stroke: '#c8500a', 'stroke-width': 2, 'stroke-linecap': 'round' });
  clock.appendChild(clockHourEl);
  clock.appendChild(clockMinuteEl);
  clock.appendChild(clockSecondEl);
  handsGroup.appendChild(clock);
  handsGroup.appendChild(el('circle', { cx: 0, cy: 0, r: 5, fill: '#241a12' }));
  handsGroupEl = handsGroup;
  svg.appendChild(handsGroup);

  // Eyes: big upright ovals with lashes + eyelids for blinking
  const eyesGroup = el('g', { class: 'tessa-eyes' });

  const LASH = '#c97a2b'; // lighter than the tick marks so they don't compete
  const leftEye = el('g', { class: 'tessa-eye tessa-eye-left' });
  leftEye.appendChild(el('ellipse', { cx: 78, cy: 99, rx: 12, ry: 16, fill: '#ffffff', stroke: '#241a12', 'stroke-width': 2 }));
  leftEye.appendChild(el('ellipse', { class: 'tessa-pupil', cx: 80, cy: 102, rx: 6.5, ry: 9, fill: '#241a12' }));
  leftEye.appendChild(el('line', { x1: 69, y1: 85, x2: 62, y2: 76, stroke: LASH, 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
  leftEye.appendChild(el('line', { x1: 73, y1: 82, x2: 69, y2: 71, stroke: LASH, 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
  leftEye.appendChild(el('line', { x1: 79, y1: 81, x2: 79, y2: 69, stroke: LASH, 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
  eyesGroup.appendChild(leftEye);

  const rightEye = el('g', { class: 'tessa-eye tessa-eye-right' });
  rightEye.appendChild(el('ellipse', { cx: 122, cy: 99, rx: 12, ry: 16, fill: '#ffffff', stroke: '#241a12', 'stroke-width': 2 }));
  rightEye.appendChild(el('ellipse', { class: 'tessa-pupil', cx: 120, cy: 102, rx: 6.5, ry: 9, fill: '#241a12' }));
  rightEye.appendChild(el('line', { x1: 131, y1: 85, x2: 138, y2: 76, stroke: LASH, 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
  rightEye.appendChild(el('line', { x1: 127, y1: 82, x2: 131, y2: 71, stroke: LASH, 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
  rightEye.appendChild(el('line', { x1: 121, y1: 81, x2: 121, y2: 69, stroke: LASH, 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
  eyesGroup.appendChild(rightEye);

  // Eyelids (default hidden via CSS, animate on blink)
  const leftLid = el('ellipse', { class: 'tessa-eyelid', cx: 78, cy: 99, rx: 12, ry: 16, fill: '#ff8235' });
  const rightLid = el('ellipse', { class: 'tessa-eyelid', cx: 122, cy: 99, rx: 12, ry: 16, fill: '#ff8235' });
  leftLidEl = leftLid;
  rightLidEl = rightLid;
  eyesGroup.appendChild(leftLid);
  eyesGroup.appendChild(rightLid);

  eyesGroupEl = eyesGroup;
  svg.appendChild(eyesGroup);

  // Mouth: black open-smile shape + white tooth-strip (reshaped per mood)
  const mouth = el('g', { class: 'tessa-mouth' });
  const mouthShape = el('path', {
    d: 'M 80 150 Q 100 178, 120 150 Q 100 166, 80 150 Z',
    fill: '#241a12',
  });
  const tooth = el('path', {
    d: 'M 88 154 Q 100 162, 112 154 L 110 158 Q 100 165, 90 158 Z',
    fill: '#ffffff',
  });
  mouth.appendChild(mouthShape);
  mouth.appendChild(tooth);
  mouthEl = mouth;
  mouthShapeEl = mouthShape;
  toothEl = tooth;
  svg.appendChild(mouth);

  return svg;
}

// ---------------------------------------------------------------------------
// Root DOM build
// ---------------------------------------------------------------------------
function buildDOM() {
  root = document.getElementById('character-root');
  if (!root) return false;
  root.innerHTML = '';

  const wrap = document.createElement('div');
  wrap.className = 'tessa-wrap';

  const svg = buildSVG();
  mascotEl = svg;
  wrap.appendChild(svg);

  const confettiLayer = document.createElement('div');
  confettiLayer.className = 'tessa-confetti-layer';
  wrap.appendChild(confettiLayer);

  const bubble = document.createElement('div');
  bubble.className = 'tessa-bubble';

  const eyebrow = document.createElement('div');
  eyebrow.className = 'tessa-bubble-eyebrow';
  eyebrow.textContent = 'Tessa';
  bubble.appendChild(eyebrow);

  const text = document.createElement('div');
  text.className = 'tessa-bubble-text';
  bubble.appendChild(text);
  bubbleTextEl = text;

  // clicking the bubble still skips the typewriter / advances — an invisible
  // affordance for impatient players, never advertised as required input
  bubble.addEventListener('click', handleBubbleClick);
  wrap.appendChild(bubble);
  bubbleEl = bubble;

  // little live clock card she presents on the landing page
  const timecard = document.createElement('div');
  timecard.className = 'tessa-timecard';
  timecard.innerHTML = '<div class="tessa-timecard-date"></div>';
  wrap.appendChild(timecard);
  timecardEl = timecard;

  root.appendChild(wrap);
  return true;
}

// ---------------------------------------------------------------------------
// Idle animations: blink + hands ticking
// ---------------------------------------------------------------------------
function scheduleBlink() {
  clearTimeout(blinkTimer);
  if (reducedMotion) return;
  const delay = 3000 + Math.random() * 2000;
  blinkTimer = setTimeout(() => {
    if (leftLidEl && rightLidEl) {
      leftLidEl.classList.remove('tessa-blinking');
      rightLidEl.classList.remove('tessa-blinking');
      // force reflow to restart animation
      void leftLidEl.offsetWidth;
      leftLidEl.classList.add('tessa-blinking');
      rightLidEl.classList.add('tessa-blinking');
    }
    scheduleBlink();
  }, delay);
}

function startHandTicking() {
  // Miss Minutes' face has no clock hands anymore (ticks + a center dot
  // only) — this is now a safe no-op, kept so existing call sites
  // (initCharacter) don't need to change.
  clearInterval(tickTimer);
}

// ---------------------------------------------------------------------------
// Mood handling
// ---------------------------------------------------------------------------
const MOOD_CLASSES = ['tessa-mood-happy', 'tessa-mood-excited', 'tessa-mood-thinking', 'tessa-mood-cheer', 'tessa-mood-oops'];

function clearMoodClasses() {
  if (!mascotEl) return;
  MOOD_CLASSES.forEach((c) => mascotEl.classList.remove(c));
  if (eyesGroupEl) MOOD_CLASSES.forEach((c) => eyesGroupEl.classList.remove(c));
  if (leftArmEl) MOOD_CLASSES.forEach((c) => leftArmEl.classList.remove(c));
  if (rightArmEl) MOOD_CLASSES.forEach((c) => rightArmEl.classList.remove(c));
  if (handsGroupEl) MOOD_CLASSES.forEach((c) => handsGroupEl.classList.remove(c));
  mascotEl.classList.remove('tessa-celebrate');
  if (leftArmEl) leftArmEl.classList.remove('tessa-celebrate');
  if (rightArmEl) rightArmEl.classList.remove('tessa-celebrate');
  if (handsGroupEl) handsGroupEl.classList.remove('tessa-celebrate');
}

function applyMouthForMood(mood) {
  if (!mouthShapeEl || !toothEl) return;
  switch (mood) {
    case 'excited':
      mouthShapeEl.setAttribute('d', 'M 74 148 Q 100 192, 126 148 Q 100 174, 74 148 Z');
      mouthShapeEl.setAttribute('fill', '#241a12');
      mouthShapeEl.removeAttribute('stroke');
      toothEl.setAttribute('d', 'M 84 154 Q 100 166, 116 154 L 113 160 Q 100 170, 87 160 Z');
      toothEl.setAttribute('opacity', '1');
      break;
    case 'oops':
      mouthShapeEl.setAttribute('d', 'M 82 162 L 118 162');
      mouthShapeEl.setAttribute('fill', 'none');
      mouthShapeEl.setAttribute('stroke', '#241a12');
      mouthShapeEl.setAttribute('stroke-width', '4');
      mouthShapeEl.setAttribute('stroke-linecap', 'round');
      toothEl.setAttribute('opacity', '0');
      break;
    case 'thinking':
      mouthShapeEl.setAttribute('d', 'M 86 164 Q 100 170, 114 160');
      mouthShapeEl.setAttribute('fill', 'none');
      mouthShapeEl.setAttribute('stroke', '#241a12');
      mouthShapeEl.setAttribute('stroke-width', '3.5');
      mouthShapeEl.setAttribute('stroke-linecap', 'round');
      toothEl.setAttribute('opacity', '0');
      break;
    case 'cheer':
      mouthShapeEl.setAttribute('d', 'M 76 149 Q 100 190, 124 149 Q 100 172, 76 149 Z');
      mouthShapeEl.setAttribute('fill', '#241a12');
      mouthShapeEl.removeAttribute('stroke');
      toothEl.setAttribute('d', 'M 86 154 Q 100 164, 114 154 L 112 159 Q 100 168, 88 159 Z');
      toothEl.setAttribute('opacity', '1');
      break;
    case 'happy':
    default:
      mouthShapeEl.setAttribute('d', 'M 80 150 Q 100 178, 120 150 Q 100 166, 80 150 Z');
      mouthShapeEl.setAttribute('fill', '#241a12');
      mouthShapeEl.removeAttribute('stroke');
      toothEl.setAttribute('d', 'M 88 154 Q 100 162, 112 154 L 110 158 Q 100 165, 90 158 Z');
      toothEl.setAttribute('opacity', '1');
      break;
  }
}

function applyMood(mood, opts = {}) {
  if (!initialized || !mascotEl) return;
  clearTimeout(moodTimer);
  clearMoodClasses();
  applyMouthForMood(mood);

  const moodClass = `tessa-mood-${mood}`;
  if (mood && mood !== 'happy') {
    mascotEl.classList.add(moodClass);
    if (eyesGroupEl) eyesGroupEl.classList.add(moodClass);
    if (leftArmEl) leftArmEl.classList.add(moodClass);
    if (rightArmEl) rightArmEl.classList.add(moodClass);
    if (handsGroupEl) handsGroupEl.classList.add(moodClass);
  }

  const duration = opts.duration || 1300;
  moodTimer = setTimeout(() => {
    clearMoodClasses();
    applyMouthForMood('happy');
  }, duration);
}

// ---------------------------------------------------------------------------
// Speech bubble typing
// ---------------------------------------------------------------------------
function showBubble() {
  if (!bubbleEl) return;
  bubbleEl.classList.add('tessa-bubble-visible');
  bubbleEl.classList.remove('tessa-bubble-dim');
  bubbleDim = false;
  bubbleShown = true;
}

function hideBubble() {
  if (!bubbleEl) return;
  bubbleEl.classList.remove('tessa-bubble-visible');
  bubbleShown = false;
  bubbleFullyTyped = false;
}

// Transient messages advance on their own. The hold time scales with line
// length (~180 wpm reading pace) and is never capped short: players must be
// able to finish a line without clicking. When the chain runs dry the
// standing instruction comes back; only with no standing line does the
// bubble dim and slip away.
function scheduleAutoAdvance(text) {
  clearTimeout(autoTimer);
  const readMs = Math.min(11000, Math.max(2600, 700 + text.length * 36));
  autoTimer = setTimeout(() => {
    if (typing) return;
    if (queue.length > 0) {
      advanceQueue();
    } else if (stickyLine && !currentIsSticky) {
      restoreSticky();
    } else if (!stickyLine) {
      if (bubbleEl) {
        bubbleEl.classList.add('tessa-bubble-dim');
        bubbleDim = true;
      }
      clearTimeout(autoTimer);
      autoTimer = setTimeout(hideBubble, 4500);
    }
  }, readMs);
}

// Bring the standing instruction back after feedback: full text with a soft
// fade, no re-typing — the player already watched it type on once.
function restoreSticky() {
  const s = stickyLine;
  if (!s) return;
  clearTimeout(autoTimer);
  clearInterval(typeTimer);
  typing = false;
  currentIsSticky = true;
  bubbleFullyTyped = true;
  currentFullText = s.text;
  showBubble();
  const token = ++restoreToken;
  if (bubbleTextEl) {
    bubbleTextEl.style.opacity = '0';
    setTimeout(() => {
      if (token !== restoreToken || typing || pendingNext) return;
      bubbleTextEl.textContent = s.text;
      bubbleTextEl.style.opacity = '1';
    }, 200);
  }
}

// Gentle handoff between lines: fade the current text, then type the new one.
function swapTo(text, opts) {
  clearInterval(typeTimer);
  typing = false;
  setTalking(false);
  if (bubbleTextEl) bubbleTextEl.style.opacity = '0';
  clearTimeout(pendingTimer);
  pendingNext = { text, opts };
  pendingTimer = setTimeout(() => {
    const p = pendingNext;
    pendingNext = null;
    if (p) startTyping(p.text, p.opts);
  }, 220);
}

function setTalking(v) {
  if (!mouthEl) return;
  if (reducedMotion) v = false;
  mouthEl.classList.toggle('tessa-talking', !!v);
}

function startTyping(text, opts) {
  typing = true;
  setTalking(true);
  bubbleFullyTyped = false;
  currentIsSticky = !!(opts && opts.sticky);
  restoreToken++; // cancel any in-flight sticky restore
  currentFullText = text;
  clearTimeout(autoTimer);
  showBubble();
  if (bubbleTextEl) {
    bubbleTextEl.textContent = '';
    bubbleTextEl.style.opacity = '1';
  }
  applyMood((opts && opts.mood) || 'happy', { duration: 1400 });

  let i = 0;
  const stepMs = 1000 / CHARS_PER_SEC;
  clearInterval(typeTimer);
  typeTimer = setInterval(() => {
    i++;
    if (bubbleTextEl) bubbleTextEl.textContent = text.slice(0, i);
    if (i >= text.length) {
      clearInterval(typeTimer);
      typing = false;
      setTalking(false);
      bubbleFullyTyped = true;
      // a standing line with nothing queued behind it just rests on screen
      if (!currentIsSticky || queue.length > 0) scheduleAutoAdvance(text);
    }
  }, stepMs);
}

function finishTypingInstantly() {
  clearInterval(typeTimer);
  typing = false;
  setTalking(false);
  bubbleFullyTyped = true;
  if (bubbleTextEl) bubbleTextEl.textContent = currentFullText;
  if (!currentIsSticky || queue.length > 0) scheduleAutoAdvance(currentFullText);
}

function advanceQueue() {
  if (queue.length > 0) {
    const next = queue.shift();
    startTyping(next.text, next.opts);
    return;
  }
  if (stickyLine) {
    // the standing instruction takes the bubble back (or simply keeps it)
    if (!currentIsSticky) restoreSticky();
    return;
  }
  // Queue empty, nothing standing: dim the bubble, then fade off the bench.
  if (bubbleEl) {
    bubbleEl.classList.add('tessa-bubble-dim');
    bubbleDim = true;
  }
  clearTimeout(autoTimer);
  autoTimer = setTimeout(hideBubble, 4500);
  if (typeof clickCb === 'function') {
    try { clickCb(); } catch (e) { /* swallow consumer errors */ }
  }
}

function handleBubbleClick() {
  if (!initialized) return;
  if (pendingNext) {
    // a newer line is waiting its beat — skip straight to it
    clearTimeout(pendingTimer);
    const p = pendingNext;
    pendingNext = null;
    startTyping(p.text, p.opts);
    return;
  }
  if (typing) {
    finishTypingInstantly();
  } else if (bubbleShown && bubbleFullyTyped) {
    advanceQueue();
  }
}

// ---------------------------------------------------------------------------
// Confetti
// ---------------------------------------------------------------------------
const CONFETTI_COLORS = ['#ff7a1a', '#c89b3c', '#f2e3be', '#2e6e63', '#c85a08'];

function burstConfetti() {
  if (!root) return;
  const layer = root.querySelector('.tessa-confetti-layer');
  if (!layer) return;
  const count = 20 + Math.floor(Math.random() * 11); // 20-30
  const frag = document.createDocumentFragment();
  const pieces = [];
  for (let i = 0; i < count; i++) {
    const piece = document.createElement('div');
    piece.className = 'tessa-confetto';
    const isCircle = Math.random() < 0.5;
    const color = CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)];
    piece.style.background = color;
    if (isCircle) piece.style.borderRadius = '50%';
    const size = 5 + Math.random() * 6;
    piece.style.width = `${size}px`;
    piece.style.height = `${size}px`;
    const startX = 60 + Math.random() * 70;
    const startY = 100 + Math.random() * 60;
    piece.style.left = `${startX}px`;
    piece.style.bottom = `${startY}px`;
    const dx = (Math.random() - 0.5) * 220;
    const dy = -(80 + Math.random() * 140);
    const rot = (Math.random() - 0.5) * 720;
    piece.style.setProperty('--tessa-confetti-end', `translate(${dx}px, ${dy}px) rotate(${rot}deg)`);
    piece.style.animationDuration = `${1.4 + Math.random() * 0.8}s`;
    frag.appendChild(piece);
    pieces.push(piece);
  }
  layer.appendChild(frag);
  setTimeout(() => {
    pieces.forEach((p) => p.remove());
  }, 2500);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
export function initCharacter() {
  if (typeof document === 'undefined') return;
  if (initialized) return;

  try {
    reducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {
    reducedMotion = false;
  }

  injectStyles();
  const ok = buildDOM();
  if (!ok) return;

  initialized = true;
  scheduleBlink();
  startHandTicking();

  try {
    if (window.matchMedia) {
      const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
      const handler = (e) => { reducedMotion = e.matches; };
      if (mq.addEventListener) mq.addEventListener('change', handler);
      else if (mq.addListener) mq.addListener(handler);
    }
  } catch (e) { /* ignore */ }
}

export function say(text, opts = {}) {
  if (!initialized) return;
  if (typeof text !== 'string' || text.length === 0) return;

  // sticky: the new standing line for the current game state. It replaces
  // everything (stale queued chatter included) and stays on screen until the
  // next sticky line arrives.
  if (opts.sticky) {
    stickyLine = { text, opts };
    queue = [];
    clearTimeout(autoTimer);
    if (bubbleShown && (typing || bubbleFullyTyped)) swapTo(text, opts);
    else startTyping(text, opts);
    return;
  }

  // interrupt (transient feedback, e.g. wrong tool): cut in right now; the
  // standing instruction returns when it has been read.
  if (opts.interrupt) {
    queue = [];
    clearTimeout(autoTimer);
    if (bubbleShown && (typing || bubbleFullyTyped)) swapTo(text, opts);
    else startTyping(text, opts);
    return;
  }

  // queued chatter (tool lessons): waits for typing or an unread transient,
  // but a RESTING standing line yields to it immediately.
  if (typing || (bubbleShown && bubbleFullyTyped && !bubbleDim && !currentIsSticky)) {
    queue.push({ text, opts });
    return;
  }
  if (bubbleShown && bubbleFullyTyped) swapTo(text, opts);
  else startTyping(text, opts);
}

// Her eyes follow whatever the player is carrying (NDC coords, -1..1).
let pupilEls = null;
export function lookToward(nx, ny = 0) {
  if (!initialized || !mascotEl) return;
  if (!pupilEls) pupilEls = mascotEl.querySelectorAll('.tessa-pupil');
  const x = Math.max(-1, Math.min(1, nx)) * 3.5;
  const y = Math.max(-1, Math.min(1, ny)) * 2;
  pupilEls.forEach((el) => { el.style.transform = `translate(${x}px, ${y}px)`; });
}

export function lookIdle() {
  if (pupilEls) pupilEls.forEach((el) => { el.style.transform = ''; });
}

export function celebrate() {
  if (!initialized || !mascotEl) return;
  clearMoodClasses();
  mascotEl.classList.add('tessa-celebrate');
  if (leftArmEl) leftArmEl.classList.add('tessa-celebrate');
  if (rightArmEl) rightArmEl.classList.add('tessa-celebrate');
  if (handsGroupEl) handsGroupEl.classList.add('tessa-celebrate');
  applyMouthForMood('cheer');

  burstConfetti();

  clearTimeout(moodTimer);
  moodTimer = setTimeout(() => {
    clearMoodClasses();
    applyMouthForMood('happy');
  }, 1600);
}

export function setIdle() {
  if (!initialized) return;
  clearTimeout(moodTimer);
  clearMoodClasses();
  applyMouthForMood('happy');
}

export function onBubbleClick(cb) {
  clickCb = typeof cb === 'function' ? cb : null;
}

// Self-contained static markup of the mascot in its happy pose — no CSS
// classes required, inline fill/stroke attributes only, no external refs.
// Handy for drawing the mascot onto a <canvas> via `new Image()` + a data
// URI, where the live DOM/CSS mascot isn't available.
function updateClock() {
  const now = new Date();
  const sec = now.getSeconds();
  const min = now.getMinutes() + sec / 60;
  const hr = (now.getHours() % 12) + min / 60;
  if (clockSecondEl) clockSecondEl.setAttribute('transform', `rotate(${sec * 6})`);
  if (clockMinuteEl) clockMinuteEl.setAttribute('transform', `rotate(${min * 6})`);
  if (clockHourEl) clockHourEl.setAttribute('transform', `rotate(${hr * 30})`);
  if (timecardEl) {
    const d = timecardEl.querySelector('.tessa-timecard-date');
    if (d) d.textContent = now.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }
}

// 'title' — landing page: centered, presenting the live local time & date.
// 'center' — intro questions: centered, clock away.
// 'corner' — bench duty, back to her corner.
export function setStage(mode) {
  if (!root) return;
  const wrap = root.querySelector('.tessa-wrap');
  if (!wrap) return;
  wrap.classList.toggle('tessa-wrap--center', mode === 'center' || mode === 'title');
  wrap.classList.toggle('tessa-wrap--title', mode === 'title');
  wrap.classList.toggle('tessa-wrap--corner', mode === 'corner');
  clearInterval(clockTimer);
  if (mode === 'title' || mode === 'corner') {
    // she IS a clock: her face tells real local time even on bench duty
    updateClock();
    clockTimer = setInterval(updateClock, 1000);
  }
}

export function mascotSVGMarkup(size = 400) {
  const s = Number(size) || 400;
  const ticks = tickMarks()
    .map((t) => `<line x1="${t.x1.toFixed(2)}" y1="${t.y1.toFixed(2)}" x2="${t.x2.toFixed(2)}" y2="${t.y2.toFixed(2)}" stroke="#241a12" stroke-width="${t.w}" stroke-linecap="round" />`)
    .join('\n  ');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 250" width="${s}" height="${s}">
  <defs>
    <radialGradient id="tessaFaceGradStatic" cx="42%" cy="36%" r="70%">
      <stop offset="0%" stop-color="#ff8f35" />
      <stop offset="100%" stop-color="#f06d0e" />
    </radialGradient>
    <radialGradient id="tessaGlowStatic">
      <stop offset="35%" stop-color="#ff8a2a" stop-opacity="0.55" />
      <stop offset="100%" stop-color="#ff8a2a" stop-opacity="0" />
    </radialGradient>
  </defs>
  <circle cx="100" cy="130" r="98" fill="url(#tessaGlowStatic)" />
  <line x1="80" y1="198" x2="78" y2="230" stroke="#241a12" stroke-width="6" stroke-linecap="round" />
  <line x1="120" y1="198" x2="122" y2="230" stroke="#241a12" stroke-width="6" stroke-linecap="round" />
  <rect x="59" y="240" width="38" height="7" rx="3" fill="#ffffff" stroke="#241a12" stroke-width="2" />
  <rect x="61" y="226" width="34" height="17" rx="8" fill="#ff7a1a" stroke="#241a12" stroke-width="2.5" />
  <rect x="103" y="240" width="38" height="7" rx="3" fill="#ffffff" stroke="#241a12" stroke-width="2" />
  <rect x="105" y="226" width="34" height="17" rx="8" fill="#ff7a1a" stroke="#241a12" stroke-width="2.5" />
  <path d="M 52 148 C 34 160, 16 176, 20 202" fill="none" stroke="#ff7a1a" stroke-width="9" stroke-linecap="round" />
  <line x1="12" y1="172" x2="32" y2="176" stroke="#c85a08" stroke-width="5" stroke-linecap="round" />
  <line x1="10" y1="180" x2="30" y2="184" stroke="#c85a08" stroke-width="5" stroke-linecap="round" />
  <ellipse cx="20" cy="202" rx="15" ry="13" fill="#ffffff" stroke="#241a12" stroke-width="2" />
  <ellipse cx="7" cy="190" rx="6" ry="8" fill="#ffffff" stroke="#241a12" stroke-width="1.6" transform="rotate(-18 7 190)" />
  <ellipse cx="20" cy="185" rx="6" ry="9" fill="#ffffff" stroke="#241a12" stroke-width="1.6" />
  <ellipse cx="33" cy="190" rx="6" ry="8" fill="#ffffff" stroke="#241a12" stroke-width="1.6" transform="rotate(18 33 190)" />
  <path d="M 148 148 C 166 160, 184 176, 180 202" fill="none" stroke="#ff7a1a" stroke-width="9" stroke-linecap="round" />
  <line x1="188" y1="172" x2="168" y2="176" stroke="#c85a08" stroke-width="5" stroke-linecap="round" />
  <line x1="190" y1="180" x2="170" y2="184" stroke="#c85a08" stroke-width="5" stroke-linecap="round" />
  <ellipse cx="180" cy="202" rx="15" ry="13" fill="#ffffff" stroke="#241a12" stroke-width="2" />
  <ellipse cx="167" cy="190" rx="6" ry="8" fill="#ffffff" stroke="#241a12" stroke-width="1.6" transform="rotate(-18 167 190)" />
  <ellipse cx="180" cy="185" rx="6" ry="9" fill="#ffffff" stroke="#241a12" stroke-width="1.6" />
  <ellipse cx="193" cy="190" rx="6" ry="8" fill="#ffffff" stroke="#241a12" stroke-width="1.6" transform="rotate(18 193 190)" />
  <circle cx="100" cy="124" r="76" fill="url(#tessaFaceGradStatic)" stroke="#241a12" stroke-width="3" />
  ${ticks}
  <circle cx="100" cy="124" r="5" fill="#241a12" />
  <ellipse cx="78" cy="99" rx="12" ry="16" fill="#ffffff" stroke="#241a12" stroke-width="2" />
  <ellipse cx="80" cy="102" rx="6.5" ry="9" fill="#241a12" />
  <line x1="69" y1="85" x2="62" y2="76" stroke="#c97a2b" stroke-width="2.2" stroke-linecap="round" />
  <line x1="73" y1="82" x2="69" y2="71" stroke="#c97a2b" stroke-width="2.2" stroke-linecap="round" />
  <line x1="79" y1="81" x2="79" y2="69" stroke="#c97a2b" stroke-width="2.2" stroke-linecap="round" />
  <ellipse cx="122" cy="99" rx="12" ry="16" fill="#ffffff" stroke="#241a12" stroke-width="2" />
  <ellipse cx="120" cy="102" rx="6.5" ry="9" fill="#241a12" />
  <line x1="131" y1="85" x2="138" y2="76" stroke="#c97a2b" stroke-width="2.2" stroke-linecap="round" />
  <line x1="127" y1="82" x2="131" y2="71" stroke="#c97a2b" stroke-width="2.2" stroke-linecap="round" />
  <line x1="121" y1="81" x2="121" y2="69" stroke="#c97a2b" stroke-width="2.2" stroke-linecap="round" />
  <path d="M 80 150 Q 100 178, 120 150 Q 100 166, 80 150 Z" fill="#241a12" />
  <path d="M 88 154 Q 100 162, 112 154 L 110 158 Q 100 165, 90 158 Z" fill="#ffffff" />
</svg>`;
}
