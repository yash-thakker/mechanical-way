// The Mechanical Way — game orchestration (v2: tools + service work).
import * as THREE from 'three';
import { createScene, createBlobShadow, HOME_POSITIONS } from './scene.js';
import {
  buildAllParts, buildPlate, buildCase, buildHolder, buildDial,
  buildHourHand, buildMinuteHand, buildSecondHand, COLORS, TEETH,
} from './parts/watchParts.js';
import { Assembly, STEPS, LEGEND, APPROACH, wrongPartLine, wrongToolLine, stepNotes } from './assembly.js';
import { buildToolRoll, TOOLS } from './parts/tools.js';
import { Interaction } from './interaction.js';
import { TickingSim } from './ticking.js';
import * as ui from './ui.js';
import * as tessa from './character.js';
import * as audio from './audio.js';
import * as score from './score.js';
import * as leaderboard from './leaderboard.js';

// ---------------------------------------------------------------------------
// tiny tween engine
// ---------------------------------------------------------------------------
const tweens = [];
const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
const easeInOutCubic = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function tween(dur, onUpdate, { ease = easeOutCubic, onDone } = {}) {
  tweens.push({ t: 0, dur, ease, onUpdate, onDone });
}
function delay(dur, fn) {
  tween(dur, () => {}, { onDone: fn });
}
function updateTweens(dt) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    const tw = tweens[i];
    tw.t += dt;
    const k = Math.min(1, tw.t / tw.dur);
    tw.onUpdate(tw.ease(k));
    if (k >= 1) {
      tweens.splice(i, 1);
      tw.onDone?.();
    }
  }
}

// A hitstop freezes the WORLD (ticking, ghosts, backdrop) for a few frames
// while feedback (tweens, FX) keeps running — the seat "bites".
let hitstopT = 0;
function hitstop(sec) {
  hitstopT = Math.max(hitstopT, sec);
}

// Per-part emissive flash on seating (decays in applyPulse)
const flashK = new Map();
function flashPart(id) {
  flashK.set(id, 1);
}

// ---------------------------------------------------------------------------
// world setup
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const { renderer, scene, camera, controls, tray, backdrop } = createScene(canvas);

// Opt a group's solid meshes into the shadow pass. Transparent and unlit
// materials stay out (ghosts, markers, the case crystal, light cones).
function enableShadows(root, { receive = false } = {}) {
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    if (mats.some((m) => m.transparent || m.isMeshBasicMaterial)) return;
    o.castShadow = true;
    if (receive) o.receiveShadow = true;
  });
}

const holder = buildHolder();
enableShadows(holder);
scene.add(holder);

const movementGroup = new THREE.Group();
movementGroup.position.y = 1.75; // plate rests on the holder ledge
scene.add(movementGroup);
const basePlate = buildPlate();
enableShadows(basePlate, { receive: true }); // bridges shadow onto the perlage
movementGroup.add(basePlate);

const dialGroup = new THREE.Group();
dialGroup.position.set(0, 4.6, 0); // top of the flipped movement
scene.add(dialGroup);

const caseGroup = buildCase();
enableShadows(caseGroup);
caseGroup.visible = false;
scene.add(caseGroup);

const blobShadow = createBlobShadow();
scene.add(blobShadow);

// the tool roll, on the watchmaker's left — far enough out that the holder's
// clamp knobs (outer r ~10.2) never read as touching the leather
const { group: toolRoll, toolGroups } = buildToolRoll();
toolRoll.position.set(-15.2, 0, 0.8);
enableShadows(toolRoll);
scene.add(toolRoll);

const parts = buildAllParts();
for (const part of parts.values()) enableShadows(part, { receive: true });

// Parts wait in the tray at miniature scale so twelve of them fit a bench
// tray; they grow to full size in the player's grip.
const TRAY_SCALE = 0.5;

// Footprint of the watch (the movement/case sits at the world origin). A part
// released within this radius but off its glowing seat counts as a real
// misplacement — negative feedback. Farther out (the tray/tools) is a harmless
// "put it back". Either way the part returns cleanly to its tray slot.
const WATCH_RADIUS = 11;

// Settle each part into its tray home, resting on the surface. Slots mark
// the part's VISUAL center: many builders keep their origin at a pivot, not
// the centroid (bridges, the rotor), so shift by the bounding-box error or
// big parts sprawl over their neighbors' slots.
const homes = new Map();
const bbox = new THREE.Box3();
// A hand is the one part whose ORIENTATION is information: it points at a
// time. The bench scatter that makes a gear look hand-laid makes a hand look
// broken — you carry it askew and it snaps square on the drop. Hands lie
// straight, pointing at twelve exactly as they will on the dial.
const NO_SCATTER = ['hourhand', 'minutehand', 'secondhand'];

function settleInTray(part, id) {
  const [hx, hz] = HOME_POSITIONS[id];
  part.scale.setScalar(TRAY_SCALE);
  part.rotation.y = NO_SCATTER.includes(id) ? 0 : (Math.random() - 0.5) * 0.5;
  part.position.set(hx, 0, hz);
  bbox.setFromObject(part);
  part.position.x += hx - (bbox.min.x + bbox.max.x) / 2;
  part.position.z += hz - (bbox.min.z + bbox.max.z) / 2;
  part.position.y = 0.42 - bbox.min.y;
  homes.set(id, part.position.clone());
}
for (const [id, part] of parts) {
  settleInTray(part, id);
  scene.add(part);
}
// later-phase parts hide until their moment: the click system arrives after
// the balance is pinned, the motion works after the flip, the dial and hands
// last (they'd give away the ending)
const CLICK_SYSTEM = ['barrelbridge', 'ratchet', 'click', 'crownwheel'];
const AUTO_SYSTEM = ['reversers', 'rotor'];
const LATE_PARTS = [
  ...CLICK_SYSTEM, ...AUTO_SYSTEM,
  'cannon', 'minutewheel', 'hourwheel',
  'stem', 'settinglever', 'yoke', 'jumper',
  'datejumper', 'dateindicator', 'datering',
  'dial', 'hourhand', 'minutehand', 'secondhand',
];
for (const id of LATE_PARTS) parts.get(id).visible = false;

// Until Tessa's intro questions are answered, the bench shows only the mat:
// props and parts arrive when the actual work begins (beginRun).
const BENCH_PROPS = [holder, movementGroup, toolRoll, tray];
for (const g of BENCH_PROPS) g.visible = false;
for (const part of parts.values()) part.visible = false;

// emissive-pulse material cache per part (skip jewels, which already glow)
const partMats = new Map();
for (const [id, part] of parts) {
  const mats = new Set();
  part.traverse((o) => {
    if (o.isMesh && o.material.isMeshStandardMaterial && o.material.emissiveIntensity === 1 && o.material.emissive.getHex() === 0) {
      mats.add(o.material);
    }
  });
  partMats.set(id, [...mats]);
}

const assembly = new Assembly({ parts, movementGroup, dialGroup, scene });
const ticking = new TickingSim();
ticking.register({
  balance: parts.get('balance').userData.osc,
  hairspring: parts.get('balance').userData.hairspring,
  escape: parts.get('escape'),
  pallet: parts.get('pallet'),
  wheels: {
    // the DRUM turns while running; the arbor stays parked on the click
    barrelDrum: parts.get('barrel').userData.drum,
    center: parts.get('center'),
    third: parts.get('third'),
    fourth: parts.get('fourth'),
  },
  reverserUnits: parts.get('reversers').userData.units,
  motion: {
    cannon: parts.get('cannon'),
    minuteWheel: parts.get('minutewheel'),
    hourWheel: parts.get('hourwheel'),
  },
  rotor: parts.get('rotor'),
  hands: {
    hour: parts.get('hourhand').userData.pivot,
    minute: parts.get('minutehand').userData.pivot,
    second: parts.get('secondhand').userData.pivot,
  },
});

// ---------------------------------------------------------------------------
// game state
// ---------------------------------------------------------------------------
const state = {
  started: false,
  mistakes: 0,
  startTime: 0,
  placingBusy: false,
  currentPulse: null,  // partId being highlighted in the tray
  service: null,       // { step, markers, done:Set } while screwing / oiling
  toolsSeen: new Set(),
  dropHintShown: false,
  playerName: 'Watchmaker',
  difficulty: 'medium',
  dialStyle: 'cocktail',
  dialChosen: false,
};

// A shared link recreates the sender's exact challenge: ?level&goal&from.
state.challenge = (() => {
  try {
    const q = new URLSearchParams(window.location.search);
    const goal = parseInt(q.get('goal'), 10);
    const level = q.get('level');
    const from = (q.get('from') || '').trim().slice(0, 16);
    if (!goal || goal < 1 || !['easy', 'medium', 'hard'].includes(level)) return null;
    return { goal, level, from: from || 'A rival' };
  } catch (e) {
    return null;
  }
})();

function legendParts() {
  return LEGEND.map((p) => ({ ...p, done: assembly.placed.has(p.id) }));
}

function setPulse(partId) {
  state.currentPulse = partId;
}

function applyPulse(time, dt) {
  for (const [id, mats] of partMats) {
    const active = id === state.currentPulse && !assembly.placed.has(id);
    const pulse = active ? (Math.sin(time * 4.5) * 0.5 + 0.5) * 0.4 : 0;
    let flash = flashK.get(id) || 0;
    if (flash > 0) {
      flash = Math.max(0, flash - dt * 3.2);
      if (flash === 0) flashK.delete(id);
      else flashK.set(id, flash);
    }
    const k = Math.max(pulse, flash * 0.85);
    for (const m of mats) {
      if (k > 0) {
        m.emissive.setHex(COLORS[id === 'lid' ? 'lid' : id] ?? 0xffffff);
        m.emissiveIntensity = k;
      } else if (m.emissiveIntensity !== 0) {
        m.emissiveIntensity = 0;
      }
    }
  }
}

function refreshGrabbable() {
  const pool = [];
  for (const [id, part] of parts) {
    if (!assembly.placed.has(id) && part.visible) pool.push(part);
  }
  interaction.setGrabbable(pool, homes);
}

// which tool does the game want in hand right now?
function neededTool() {
  if (state.service) return state.service.step.service.tool;
  const s = assembly.currentStep;
  if (!s) return null;
  return s.type === 'service' ? s.service.tool : s.tool;
}

function refreshToolChip() {
  const sel = interaction.selectedTool;
  if (!sel) ui.setTool?.('', 'none');
  else ui.setTool?.(TOOLS[sel].name, sel === neededTool() ? 'ok' : 'wrong');
}

// A slip: wrong tool, wrong part, or a part dropped on the watch off its seat.
// Count it, show the running tally, and give clear negative feedback — a screen
// shake, a low "wrong" sound, and Tessa's disagreement (mood: 'oops') at each
// call site.
function registerSlip() {
  state.mistakes += 1;
  ui.setSlips?.(state.mistakes);
  ui.shake?.();
  audio.playError();
}

// Tessa's line when a part lands on the watch but misses its glowing seat.
const MISS_LINES = [
  "Not quite, sugar. Drop her on the glowing ghost.",
  "Ooh, close! She seats on the lit ring, not just anywhere.",
  "Almost, darlin'. Right onto the glowing outline.",
  "Steady now. Aim for the ghost.",
];
let missLineIdx = 0;
function missPlacementLine() {
  const line = MISS_LINES[missLineIdx % MISS_LINES.length];
  missLineIdx += 1;
  return line;
}

// ---------------------------------------------------------------------------
// service work: screw tightening and jewel oiling via point markers
// ---------------------------------------------------------------------------
function makeServiceMarker(p, color, index) {
  const g = new THREE.Group();
  // A just-placed bridge or wheel can sit right over its own screw points, so
  // the markers draw ON TOP of everything (depthTest off, high renderOrder) —
  // the player always sees where to work, even through the part.
  const onTop = (extra = {}) => new THREE.MeshBasicMaterial({
    color, transparent: true, depthTest: false, depthWrite: false, ...extra,
  });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.09, 10, 28), onTop({ opacity: 0.95 }));
  ring.rotation.x = Math.PI / 2;
  ring.renderOrder = 20;
  g.add(ring);
  const dot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 10, 10), onTop({ opacity: 0.9 }));
  dot.renderOrder = 20;
  g.add(dot);
  // generous invisible hit target
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.85, 8, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
  );
  g.add(hit);
  g.position.set(p[0], p[1], p[2]);
  g.userData.serviceIndex = index;
  g.traverse((o) => { o.userData.serviceIndex = index; });
  return g;
}

function buildScrewHead() {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0ab, roughness: 0.2, metalness: 0.95 });
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 20), steel);
  g.add(head);
  // flush dark sliver = a cut slot, not a bar resting on the head
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.06, 0.08),
    new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.7, metalness: 0.3 })
  );
  slot.position.y = 0.042;
  slot.rotation.y = Math.random() * Math.PI;
  g.add(slot);
  return g;
}

function serviceSpace(step) {
  return step.service.space === 'dial' ? dialGroup : movementGroup;
}

// The emptied tray slides off the bench during the cinematic stretches (wind,
// wake, flip, casing) instead of sitting as a dead brown rectangle, and slides
// back when new parts arrive.
let trayShown = true;
function setTrayVisible(v) {
  if (v === trayShown) return;
  trayShown = v;
  const from = { x: tray.position.x, y: tray.position.y };
  const to = v ? { x: 0, y: 0 } : { x: 15, y: -1.1 };
  if (v) tray.visible = true;
  tween(0.9, (k) => {
    tray.position.x = from.x + (to.x - from.x) * k;
    tray.position.y = from.y + (to.y - from.y) * k;
  }, {
    ease: easeInOutCubic,
    onDone: () => { if (!trayShown) tray.visible = false; },
  });
}

function enterService(step) {
  const svc = step.service;
  const color = svc.verb === 'oil' ? COLORS.ruby : COLORS.barrel;
  const space = serviceSpace(step);
  const markers = svc.points.map((p, i) => {
    const m = makeServiceMarker(p, color, i);
    space.add(m);
    return m;
  });
  state.service = { step, markers, done: new Set() };
  interaction.setService(markers, svc.tool);
  // the part is already seated (placed) — rebuild the grabbable pool so it drops
  // out of it. Otherwise the just-placed part stays pickable during its own
  // screw/oil work, which is why the barrel bridge could be lifted back off.
  refreshGrabbable();
  interaction.enabled = true;
  refreshToolChip();
}

function handleServicePoint(i) {
  const svc = state.service;
  if (!svc || svc.done.has(i) || state.placingBusy) return;
  svc.done.add(i);
  const step = svc.step;
  const marker = svc.markers[i];
  interaction.dip();

  if (step.service.verb === 'oil') {
    audio.playChime();
    // a droplet stays behind on the jewel
    const drop = new THREE.Mesh(
      new THREE.SphereGeometry(0.17, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xe8b13a, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.85 })
    );
    drop.position.copy(marker.position);
    drop.scale.setScalar(0.01);
    serviceSpace(step).add(drop);
    tween(0.35, (k) => drop.scale.setScalar(k));
  } else if (step.service.verb === 'press') {
    // the part visibly seats: a firm dip onto its post, no residue left
    audio.playPlace();
    const part = parts.get(step.id);
    if (part) {
      const y0 = part.position.y;
      tween(0.35, (k) => {
        part.position.y = y0 - Math.sin(k * Math.PI) * 0.09;
      }, { onDone: () => { part.position.y = y0; } });
    }
  } else {
    audio.playWind(0.85);
    // the screw head appears, seated
    const head = buildScrewHead();
    head.position.copy(marker.position);
    head.scale.setScalar(0.01);
    serviceSpace(step).add(head);
    tween(0.3, (k) => head.scale.setScalar(k));
  }

  tween(0.3, (k) => marker.scale.setScalar(Math.max(0.01, 1 - k)), {
    onDone: () => marker.parent?.remove(marker),
  });

  const total = step.service.points.length;
  ui.toast(`${svc.done.size} of ${total}`);
  if (svc.done.size === total) {
    interaction.clearService();
    delay(0.55, () => finishService(step));
  }
}

function finishService(step) {
  state.service = null;
  const line = (state.difficulty === 'easy' && step.service.doneEasy) || step.service.done;
  tessa.say(line, { mood: 'happy', interrupt: true, sticky: true });
  ui.setProgress((assembly.stepIndex + 1) / assembly.steps.length);
  const windTrigger = state.difficulty === 'easy' ? 'balance' : 'crownwheel';
  if (step.id === windTrigger) {
    windAndWake();
  } else if (step.id === 'rotor') {
    // hard tier: the self-winding system caps the movement side — flip her
    delay(lineBeat(line), flipMovement);
  } else {
    delay(lineBeat(line), () => assembly.advance());
  }
}

// ---------------------------------------------------------------------------
// step flow
// ---------------------------------------------------------------------------
const SUCCESS_MOODS = ['happy', 'excited', 'cheer'];

// Seconds a line needs on screen before the next one may replace it: the
// typewriter time (62 chars/s, see character.js) plus a real reading beat.
// The player must get to READ a success line before the next step's
// instruction takes the bubble.
function lineBeat(text) {
  const len = (text || '').length;
  return Math.min(5, len / 62 + Math.max(1.6, len * 0.028) + 0.3);
}

assembly.onAdvance = (step, index) => {
  ui.setStep(index + 1, assembly.steps.length, step.label);
  ui.setProgress(index / assembly.steps.length);
  ui.updateLegend(legendParts());
  if (step.id === 'dial' && !state.dialChosen) {
    // pre-dial: Tessa offers the three faces before the dial step begins
    interaction.enabled = false;
    setPulse(null);
    ui.hideNotes?.(); // the previous step's notes are stale here
    tessa.say("Almost home, sugar. Which face are we givin' her?", { mood: 'excited', interrupt: true, sticky: true });
    ui.showPrompt?.({
      eyebrow: 'Pick her face',
      choices: [
        { value: 'cocktail', label: 'Cocktail', sub: 'Blue sunburst', swatch: 'cocktail' },
        { value: 'waffle', label: 'Waffle', sub: 'Navy grid', swatch: 'waffle' },
        { value: 'field', label: 'Field', sub: 'Black · numerals', swatch: 'field' },
      ],
      onSubmit: (style) => {
        state.dialChosen = true;
        state.dialStyle = style;
        rebuildDialParts(style);
        assembly.clearGhost();
        assembly.makeGhost(step);
        announceStep(step, index);
      },
    });
    return;
  }
  announceStep(step, index);
};

function announceStep(step, index) {
  ui.showNotes?.(stepNotes(step));
  tessa.say(step.announce, { mood: index === 0 ? 'excited' : 'happy', interrupt: true, sticky: true });
  const part = parts.get(step.id);
  if (step.phase === 'dial' && part) part.visible = true;
  if (step.phase === 'dial' || { barrelbridge: 1, reversers: 1 }[step.id]) setTrayVisible(true);
  const revealGroup = { barrelbridge: CLICK_SYSTEM, reversers: AUTO_SYSTEM }[step.id];
  if (revealGroup) {
    // these parts arrive together, popping into the emptied tray
    revealGroup.forEach((id, i) => {
      const p = parts.get(id);
      if (p.visible) return;
      p.visible = true;
      const s = p.scale.x;
      p.scale.setScalar(0.01);
      delay(0.15 * i, () => tween(0.3, (k) => p.scale.setScalar(0.01 + (s - 0.01) * k)));
    });
  }
  ui.setCinematic?.(false);
  interaction.setDragHeight(step.phase === 'dial' ? 6.8 : 5.2);
  if (step.type === 'service') {
    setPulse(null);
    enterService(step);
  } else {
    setPulse(step.id);
  }
  refreshGrabbable();
  refreshToolChip();
  interaction.enabled = true;
  // ease the view toward the action
  const t = assembly.targetWorldPos(new THREE.Vector3());
  const from = controls.target.clone();
  // gentle nudge only — the full bench (tools left, tray right) must stay
  // framed; the +z bias keeps the near tray rows on screen. Portrait screens
  // can't hold both sides at once, so the camera looks where the work is:
  // toward the roll until the tool is in hand, back to the movement after.
  const needTool = !interaction.selectedTool && !!(step.tool || step.service);
  const tx = isPortrait() && needTool ? -6.5 : t.x * 0.18;
  const to = new THREE.Vector3(tx, THREE.MathUtils.clamp(t.y * 0.5, 1.2, 3.2), 2.2 + t.z * 0.18);
  tween(0.9, (k) => controls.target.lerpVectors(from, to, k), { ease: easeInOutCubic });
}

assembly.onAllPlaced = () => {
  setTheTime(finaleCasing);
};

const interaction = new Interaction({
  camera, canvas, controls, scene, parts, assembly, blobShadow,
  callbacks: {
    onGrab(part) {
      audio.playPickup(THREE.MathUtils.clamp(part.position.x / 18, -1, 1));
      setPulse(null);
      // grow from tray-miniature to true size in the grip
      const s0 = part.scale.x;
      tween(0.28, (k) => part.scale.setScalar(s0 + (1 - s0) * k));
    },
    onHoverChange(part, isCurrent) {
      if (isCurrent) audio.playHover();
    },
    onToolSelect(id) {
      refreshToolChip();
      if (!id) {
        audio.playHover(); // soft: tool laid back on the roll
        return;
      }
      audio.playPickup();
      if (isPortrait()) {
        // tool in hand: the portrait camera returns to the movement
        const from = controls.target.clone();
        const to = from.clone().setX(0.4);
        tween(0.8, (k) => controls.target.lerpVectors(from, to, k), { ease: easeInOutCubic });
      }
      if (!state.dropHintShown) {
        state.dropHintShown = true;
        ui.flashHint(HINT_TOOL_BACK);
      }
      // first pickup of each tool earns its lesson
      if (!state.toolsSeen.has(id)) {
        state.toolsSeen.add(id);
        tessa.say(TOOLS[id].blurb, { mood: 'thinking' });
      }
    },
    onWrongTool(needed, selected) {
      registerSlip();
      if (selected) ui.setTool?.(TOOLS[selected].name, 'wrong');
      else ui.setTool?.('', 'none');
      tessa.say(wrongToolLine(needed, selected), { mood: 'oops', interrupt: true });
    },
    onServicePoint(index) {
      handleServicePoint(index);
    },
    onWrongClick(part) {
      registerSlip();
      const g = part;
      const baseRot = g.rotation.y;
      tween(0.5, (k) => {
        g.rotation.y = baseRot + Math.sin(k * Math.PI * 5) * 0.12 * (1 - k);
      });
      tessa.say(wrongPartLine(assembly.currentStep, state.mistakes), { mood: 'oops', interrupt: true });
    },
    onDropSnap(part) {
      snapPart(part);
    },
    onDropMiss(part) {
      // A part let go anywhere but its glowing seat comes cleanly back to its
      // own tray slot — no piling on other parts, no resting on the felt (that
      // read as a hard "mat outline"). If the miss was ON the watch, it's a real
      // misplacement: shake, sound, and Tessa disagreeing, and it counts.
      const id = part.userData.partId;
      const overWatch = Math.hypot(part.position.x, part.position.z) < WATCH_RADIUS;
      if (overWatch) {
        registerSlip();
        try { navigator.vibrate?.([10, 40, 10]); } catch (e) { /* no haptics */ }
        // the miss reads on the bench too: a red ring where the part landed,
        // and the ghost flares red to show where it SHOULD have gone
        spawnMissFx(new THREE.Vector3(part.position.x, assembly.targetWorldPos(new THREE.Vector3()).y + 0.3, part.position.z));
        assembly.flareGhost?.();
        tessa.say(missPlacementLine(), { mood: 'oops', interrupt: true });
      }
      const home = homes.get(id);
      const fromPos = part.position.clone();
      const fromScale = part.scale.x;
      tween(0.5, (k) => {
        part.position.lerpVectors(fromPos, home, k);
        part.scale.setScalar(fromScale + (TRAY_SCALE - fromScale) * k);
      }, { ease: easeInOutCubic });
      setPulse(id);
    },
  },
});
interaction.setTools(toolGroups, toolRoll);

// keyboard-only instructions read as bugs on touch screens
const COARSE = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
const HINT_START = COARSE
  ? 'Tap a tool from the roll · Drag the background to orbit'
  : 'Pick a tool from the roll · Hold Z to magnify · Drag the background to orbit';
const HINT_TOOL_BACK = COARSE
  ? 'Put a tool back: tap the roll'
  : 'Put a tool back: click the roll · Right-click · Esc';

// Placement feedback: an expanding ring + a handful of glints at the seat
// point, in the part's own color. Placements are rare (max ~30 a run), so
// spawn-and-dispose is fine.
function spawnPlacementFx(worldPos, colorHex) {
  // normal blending on purpose: additive rings vanish against the bright plate
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.7, 0.13, 8, 32),
    new THREE.MeshBasicMaterial({
      color: colorHex, transparent: true, opacity: 1, depthWrite: false,
    })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(worldPos).y += 0.25;
  scene.add(ring);
  tween(0.7, (k) => {
    ring.scale.setScalar(1 + k * 3.4);
    ring.material.opacity = 1 - k;
  }, {
    onDone: () => { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); },
  });

  const sparkGeo = new THREE.SphereGeometry(0.07, 6, 6);
  const sparks = [];
  for (let i = 0; i < 8; i++) {
    const s = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({
      color: i % 2 ? 0xff8a2a : colorHex, transparent: true, opacity: 1, depthWrite: false,
    }));
    const a = (i / 8) * Math.PI * 2 + Math.random() * 0.5;
    s.position.copy(worldPos).y += 0.3;
    s.userData.vel = new THREE.Vector3(Math.cos(a) * 2.6, 2.2 + Math.random() * 1.6, Math.sin(a) * 2.6);
    scene.add(s);
    sparks.push(s);
  }
  tween(0.5, (k) => {
    for (const s of sparks) {
      s.position.addScaledVector(s.userData.vel, 0.016);
      s.userData.vel.y -= 0.22; // gravity per tick
      s.material.opacity = 1 - k;
      s.scale.setScalar(1 - k * 0.6);
    }
  }, {
    onDone: () => {
      for (const s of sparks) { scene.remove(s); s.material.dispose(); }
      sparkGeo.dispose();
    },
  });
}

// A miss on the watch: one flat red ring, no celebration sparks.
function spawnMissFx(worldPos) {
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.8, 0.11, 8, 32),
    new THREE.MeshBasicMaterial({ color: 0xb3402a, transparent: true, opacity: 0.95, depthWrite: false })
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.copy(worldPos);
  scene.add(ring);
  tween(0.55, (k) => {
    ring.scale.setScalar(1 + k * 2.2);
    ring.material.opacity = 0.95 * (1 - k);
  }, {
    onDone: () => { scene.remove(ring); ring.geometry.dispose(); ring.material.dispose(); },
  });
}

function snapPart(part) {
  const step = assembly.currentStep;
  interaction.enabled = false;
  state.placingBusy = true;
  interaction.dip(); // the carried tool presses down with the part
  const target = assembly.targetWorldPos(new THREE.Vector3());
  const from = part.position.clone();
  const fromRot = part.rotation.y;
  // Parts that engage sideways (the stem through the case edge, the yoke's
  // tongue into the pinion groove) first settle at an offset, then SLIDE
  // home along their real insertion line instead of dropping through parts.
  const appr = APPROACH[step.id];
  const drop = (to, done) => tween(0.3, (k) => {
    part.position.lerpVectors(from, to, k);
    part.rotation.y = fromRot * (1 - k);
  }, { onDone: done });
  const slideThen = (done) => drop(target.clone().add(new THREE.Vector3(...appr)), () => {
    const staging = part.position.clone();
    audio.playHover();
    tween(0.42, (k) => part.position.lerpVectors(staging, target, k), { ease: easeInOutCubic, onDone: done });
  });
  const finish = () => {
      assembly.place(step.id);
      audio.playPlace(THREE.MathUtils.clamp(target.x / 18, -1, 1));
      hitstop(0.07); // the world holds its breath for four frames
      flashPart(step.id);
      try { navigator.vibrate?.(12); } catch (e) { /* no haptics */ }
      // burst at the part's crown — a seat-height ring hides inside tall drums
      const top = new THREE.Box3().setFromObject(part).max.y;
      spawnPlacementFx(new THREE.Vector3(target.x, top, target.z), COLORS[step.id] ?? 0xffc86b);
      // satisfaction pop
      tween(0.22, (k) => {
        const s = 1 + Math.sin(k * Math.PI) * 0.06;
        part.scale.setScalar(s);
      }, { onDone: () => part.scale.setScalar(1) });
      ui.setProgress((assembly.stepIndex + 1) / assembly.steps.length);
      ui.updateLegend(legendParts());
      state.placingBusy = false;
      afterPlaced(step);
  };
  if (appr) slideThen(finish);
  else drop(target, finish);
}

function afterPlaced(step) {
  const mood = SUCCESS_MOODS[assembly.stepIndex % SUCCESS_MOODS.length];
  tessa.say(step.success, { mood, interrupt: true, sticky: true });
  if (step.id === 'mainspring') audio.playWind(0.6);
  audio.playChime();

  if (step.service) {
    // the part is down; now the tool work (screws) before we move on
    delay(0.8, () => enterService(step));
  } else if (step.id === 'dial') {
    // pulling the crown closes the dial step — but its line has to be READ
    // before the hour hand is announced, or the two fight over the bubble
    delay(lineBeat(step.success), crownOut);
    delay(lineBeat(step.success) + lineBeat(CROWN_OUT_LINE), () => assembly.advance());
  } else if (step.id === 'secondhand') {
    delay(lineBeat(step.success), () => assembly.advance()); // triggers onAllPlaced
  } else {
    // hold long enough that the success line types on AND gets read
    delay(lineBeat(step.success), () => assembly.advance());
  }
}

// after the crown wheel is screwed down: wind through the real chain —
// crown wheel → ratchet → arbor — with the click snapping tooth by tooth
function windAndWake() {
  interaction.enabled = false;
  ui.setCinematic?.(true); // stale tool/hint chips leak the machinery
  setTrayVisible(false); // every movement-side part is on the watch now
  delay(2.6, () => { // let the screw-done line land first
    const hasClickSystem = assembly.placed.has('crownwheel');
    tessa.say(hasClickSystem
      ? "Windin' her up... hear the click-click-click? That's your pink lever workin'."
      : "Windin' her up now... listen close.", { mood: 'thinking', interrupt: true, sticky: true });
    const crown = parts.get('crownwheel');
    const ratchet = parts.get('ratchet');
    const click = parts.get('click');
    const arbor = parts.get('barrel').userData.arbor;
    let i = 0;
    const clicks = 7;
    // Each crank advances the ratchet EXACTLY two teeth — so the pawl ends
    // parked back in a tooth gap — and turns the arbor with it (they're
    // squared together) while the crown wheel counter-rotates at the true
    // 40:24 tooth ratio. The drum never moves: winding loads the spring
    // from the inside. The pink click kicks once per passing tooth.
    const dR = (Math.PI * 2 / TEETH.ratchet) * 2;
    const wind = () => {
      audio.playWind(i / clicks);
      if (hasClickSystem) {
        const c0 = crown.rotation.y;
        const r0 = ratchet.rotation.y;
        const a0 = arbor.rotation.y;
        tween(0.15, (k) => {
          ratchet.rotation.y = r0 - k * dR;
          arbor.rotation.y = a0 - k * dR;
          crown.rotation.y = c0 + k * dR * (TEETH.ratchet / TEETH.crown);
          click.rotation.y = Math.abs(Math.sin(k * Math.PI * 2)) * 0.05;
        });
      } else {
        // easy tier has no ratchet yet: the bare arbor square turns instead
        const a0 = arbor.rotation.y;
        tween(0.15, (k) => { arbor.rotation.y = a0 - k * 0.35; });
      }
      i += 1;
      if (i < clicks) delay(0.19, wind);
      else delay(0.5, wake);
    };
    wind();
  });
}

function wake() {
  ticking.start();
  audio.startTicking(300);
  // the first heartbeat rolls a golden pulse off the movement
  const pulse = movementGroup.localToWorld(new THREE.Vector3(0, 0.4, 0));
  spawnPlacementFx(pulse, 0xffc86b);
  tessa.say("She's alive! Five beats a second, steady as sunrise.", { mood: 'cheer', interrupt: true, sticky: true });
  tessa.celebrate();

  // The camera leans in to watch the heart start — the aha the whole game
  // builds toward plays in close-up, then hands the bench back.
  const balPos = parts.get('balance').getWorldPosition(new THREE.Vector3());
  balPos.y += 1.2;
  const savedCam = camera.position.clone();
  const savedTarget = controls.target.clone();
  const dir = new THREE.Vector3().subVectors(savedCam, savedTarget).normalize();
  const closeCam = balPos.clone().addScaledVector(dir, 8.2).add(new THREE.Vector3(0, 1.2, 0));
  controls.enabled = false;
  tween(1.4, (k) => {
    camera.position.lerpVectors(savedCam, closeCam, k);
    controls.target.lerpVectors(savedTarget, balPos, k);
  }, { ease: easeInOutCubic });
  delay(3.9, () => {
    tween(1.2, (k) => {
      camera.position.lerpVectors(closeCam, savedCam, k);
      controls.target.lerpVectors(balPos, savedTarget, k);
    }, {
      ease: easeInOutCubic,
      onDone: () => { controls.enabled = true; },
    });
  });

  if (state.difficulty === 'hard') {
    // assemble the automatic winding onto the LIVE movement, then flip
    delay(5.4, () => assembly.advance());
  } else {
    // admire the running train, then flip the movement for the dial side
    delay(5.4, flipMovement);
  }
}

function flipMovement() {
  tessa.say("Now we flip her, dial-side up. Hold your breath...", { mood: 'thinking', interrupt: true, sticky: true });
  delay(1.2, () => {
    const y0 = movementGroup.position.y;
    tween(1.5, (k) => {
      movementGroup.rotation.z = Math.PI * k;
      // rise in an arc, settle at the flipped resting height
      movementGroup.position.y = y0 + (3.4 - y0) * k + Math.sin(k * Math.PI) * 1.4;
    }, {
      ease: easeInOutCubic,
      onDone: () => {
        movementGroup.rotation.z = Math.PI;
        movementGroup.position.y = 3.4;
        audio.playPlace();
        delay(0.5, () => assembly.advance());
      },
    });
  });
}

// Photograph the finished watch for the share card: everything but the watch
// and the lights hides, the fog lifts, and one square frame renders straight
// off the main canvas (read synchronously, before the compositor clears it).
function renderWatchSnapshot(size = 720) {
  try {
    const keep = new Set([caseGroup, movementGroup, dialGroup]);
    const hidden = [];
    for (const child of scene.children) {
      if (!keep.has(child) && !child.isLight && child.visible) {
        child.visible = false;
        hidden.push(child);
      }
    }
    const oldBg = scene.background;
    const oldFog = scene.fog;
    scene.background = new THREE.Color(0xc9b998);
    scene.fog = null;
    const cam = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
    // dead-straight product shot: pure pitch, no yaw — 12 o'clock points
    // exactly up in the frame instead of leaning
    cam.position.set(0, 30, 5.2);
    cam.lookAt(0, 2.0, 0);
    renderer.setSize(size, size, false);
    renderer.render(scene, cam);
    const url = renderer.domElement.toDataURL('image/png');
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    scene.background = oldBg;
    scene.fog = oldFog;
    for (const child of hidden) child.visible = true;
    return url;
  } catch (e) {
    try {
      renderer.setSize(window.innerWidth, window.innerHeight, false);
    } catch (e2) { /* renderer is wedged; the card just goes without */ }
    return null;
  }
}

// the case drops on — the end cinematic
const CROWN_OUT_LINE = "Crown out — hear her stop? Now the hands go on square.";

// Seconds since twelve on the player's own clock — what the crown has to wind
// in for the watch to agree with the wall it will hang beside.
function watchSecondsNow() {
  const d = new Date();
  return (d.getHours() % 12) * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

// The stem exists only on HARD; the crown is narrated on every tier. Local +x
// is outward (the bushing at +1.4 is the plate rim), so a pull is +x and the
// winding turn is about the rod's own axis.
function stemPull(out) {
  const stem = parts.get('stem');
  if (!stem || !stem.userData.placed) return;
  if (stem.userData.stemX === undefined) stem.userData.stemX = stem.position.x;
  const from = stem.position.x;
  const to = stem.userData.stemX + (out ? 0.32 : 0);
  tween(0.32, (k) => { stem.position.x = from + (to - from) * k; }, { ease: easeOutCubic });
}

// Crown out, the moment the dial goes down. This is why a watchmaker does it
// here and not later: with the balance held the train is dead, so all three
// hands can be fitted at exactly twelve — the one position where they can be
// proven to agree with each other. The movement is dial-side up by now, so the
// stopped train is felt rather than seen: the ticking simply stops.
function crownOut() {
  if (!ticking.running || ticking.hacked) return;
  ticking.hack(true);
  audio.stopTicking();
  audio.playUiTap();
  stemPull(true);
  tessa.say(CROWN_OUT_LINE, { mood: 'thinking', interrupt: true, sticky: true });
}

// Crown in. The motion works wind forward on their own (the cannon pinion
// slips on its arbor — that friction fit IS time-setting), the going train
// stays put, and on the push home she runs at the wearer's real time.
function setTheTime(done) {
  if (!ticking.hacked) { done(); return; } // nothing to set — go straight to the case
  interaction.enabled = false;
  ui.setCinematic?.(true);

  // lean in on the dial: this beat is all in the hands
  const camFrom = camera.position.clone();
  const tgtFrom = controls.target.clone();
  const dialC = dialGroup.position.clone();
  const dir = new THREE.Vector3().subVectors(camFrom, tgtFrom).normalize();
  // frame the whole dial from wherever the player happens to be orbiting: a
  // fixed dolly distance puts the camera inside the face on a wide screen and
  // loses the hands on a narrow one
  const halfV = THREE.MathUtils.degToRad(camera.fov / 2);
  const halfH = Math.atan(Math.tan(halfV) * camera.aspect);
  const DIAL_R = 9.4; // dial plus case rim, with margin
  const fit = Math.max(DIAL_R / Math.tan(halfV), DIAL_R / Math.tan(halfH));
  const camTo = dialC.clone().addScaledVector(dir, fit);
  controls.enabled = false;
  tween(1.3, (k) => {
    camera.position.lerpVectors(camFrom, camTo, k);
    controls.target.lerpVectors(tgtFrom, dialC, k);
  }, { ease: easeInOutCubic });

  tessa.say("But she still reads twelve. Let's give her a time, sugar.", { mood: 'happy', interrupt: true, sticky: true });

  const target = watchSecondsNow();
  const tau0 = ticking.tau; // frozen while hacked, so the wind is a clean 0 → target

  delay(2.4, () => {
    tessa.say("Windin' her forward — the cannon pinion slips on its arbor, so the train never feels it.", { mood: 'thinking', interrupt: true, sticky: true });
    tween(3.6, (k) => {
      ticking.crownSec = -tau0 + target * k;
      const stem = parts.get('stem');
      if (stem && stem.userData.placed) stem.rotation.x = -k * (target / 3600) * 1.4;
    }, { ease: easeInOutCubic });
  });

  delay(6.4, () => {
    // push home: re-read the clock so she leaves the bench dead accurate
    const d = new Date();
    ticking.release({ watchSec: watchSecondsNow(), seconds: d.getSeconds() });
    audio.startTicking(300);
    audio.playPlace();
    stemPull(false);
    hitstop(0.08);
    tessa.say("Crown in. She's away — and she's keepin' YOUR time now.", { mood: 'cheer', interrupt: true, sticky: true });
    tessa.celebrate();
  });

  delay(8.8, () => {
    tween(1.1, (k) => {
      camera.position.lerpVectors(camTo, camFrom, k);
      controls.target.lerpVectors(dialC, tgtFrom, k);
    }, { ease: easeInOutCubic, onDone: () => { controls.enabled = true; } });
    done();
  });
}

function finaleCasing() {
  interaction.enabled = false;
  interaction.deselectTool();
  ui.setCinematic?.(true);
  setTrayVisible(false); // clear the bench for the casing
  ui.hideNotes?.();
  ui.setStep(assembly.steps.length, assembly.steps.length, 'The Case');
  ui.setProgress(1);
  tessa.say("And now... the case. Stand back, this one's mine.", { mood: 'excited', interrupt: true, sticky: true });

  delay(1.8, () => {
    // the holder bows out
    const holderMats = [];
    holder.traverse((o) => { if (o.isMesh) { o.material.transparent = true; holderMats.push(o.material); } });
    tween(0.7, (k) => holderMats.forEach((m) => { m.opacity = 1 - k; }), {
      onDone: () => { holder.visible = false; },
    });
  });

  delay(2.7, () => {
    caseGroup.visible = true;
    caseGroup.position.y = 22;
    tween(1.7, (k) => {
      caseGroup.position.y = 22 * (1 - k);
    }, {
      ease: easeOutCubic,
      onDone: () => {
        audio.playPlace();
        audio.playFanfare();
        audio.setTickMuffled?.(true); // the crystal closes over the heartbeat
        hitstop(0.12);
        ui.flashWhite?.();
        const camY = camera.position.y;
        tween(0.34, (k) => { camera.position.y = camY + Math.sin(k * Math.PI) * 0.55; });
        tessa.celebrate();
        tessa.say("It ticks. You built that, darlin'. I am just so proud!", { mood: 'cheer', interrupt: true, sticky: true });
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.7;
        const from = controls.target.clone();
        tween(1.4, (k) => controls.target.lerpVectors(from, new THREE.Vector3(0, 2.8, 0), k), { ease: easeInOutCubic });
        delay(2.6, () => {
          const timeSec = Math.round((performance.now() - state.startTime) / 1000);
          const { score: pts, grade } = score.computeScore({
            difficulty: state.difficulty, timeSec, mistakes: state.mistakes,
          });
          state.lastEntry = {
            name: state.playerName, score: pts, grade, difficulty: state.difficulty,
            dialStyle: state.dialStyle, timeSec, mistakes: state.mistakes, ts: Date.now(),
            watchImage: renderWatchSnapshot(),
          };
          const ch = state.challenge;
          const challengeLine = ch && ch.level === state.difficulty
            ? (pts >= ch.goal
              ? `Challenge beaten: ${pts.toLocaleString()} vs ${ch.from}'s ${ch.goal.toLocaleString()}.`
              : `${ch.from}'s ${ch.goal.toLocaleString()} still stands. You: ${pts.toLocaleString()}.`)
            : '';
          const nextTier = { easy: 'medium', medium: 'hard' }[state.difficulty] || null;
          const svg = tessa.mascotSVGMarkup ? tessa.mascotSVGMarkup(400) : '';
          // The board goes first so the rank can be stamped on the card — but
          // submit() is time-boxed and resolves null on any failure, so a slow
          // or absent board costs a beat, never the complete screen.
          leaderboard.submit(state.lastEntry).then((board) => {
            // the card carries THIS run's score, so it gets this run's rank —
            // not the standing rank, which an older better run may be holding
            if (board && board.runRank) {
              state.lastEntry.rank = board.runRank;
              // a run that placed behind the player's own stored best ranks one
              // past every row on the board — "#6 of 5" would read as a bug
              state.lastEntry.rankTotal = Math.max(board.total || 0, board.runRank);
            }
            const finish = (cardUrl) => ui.showComplete({
              name: state.playerName, score: pts, grade, timeSec,
              mistakes: state.mistakes, difficulty: state.difficulty,
              dialStyle: state.dialStyle, cardUrl, challengeLine, nextTier,
              board,
            });
            score.makeShareCard(state.lastEntry, svg)
              .then((blob) => finish(blob ? URL.createObjectURL(blob) : null))
              .catch(() => finish(null));
            delay(1.6, () => sayRank(board));
          });
        });
      },
    });
  });
}

// Tessa reads the board out loud — the rank becomes the standing line of the
// complete screen, so it goes up sticky. A name the inspector rewrote queues
// behind it: the player has to be told, and the rank returns once it's read.
function sayRank(board) {
  if (!board) return;
  const rank = board.runRank;
  if (rank) {
    const tier = state.difficulty.charAt(0).toUpperCase() + state.difficulty.slice(1);
    let line;
    // she speaks to the run just played; a standing best that beat it is news
    if (!board.improved && board.you) line = `Number ${rank} this time. Your best still stands at ${board.you.rank}.`;
    else if (rank === 1) line = `First on the ${tier} bench, darlin'!`;
    else if (rank <= 3) line = `Number ${rank} on the ${tier} bench. Podium work.`;
    else if (rank <= 10) line = `Number ${rank} on the ${tier} bench — top ten.`;
    else line = `Number ${rank} of ${(board.total || rank).toLocaleString()} on the ${tier} bench.`;
    tessa.say(line, { mood: board.improved && rank <= 3 ? 'cheer' : 'happy', interrupt: true, sticky: true });
  }
  if (board.nameAdjusted) {
    tessa.say("The bench inspector didn't care for that name, so the board has you as Watchmaker.", { mood: 'oops' });
  }
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
ui.initUI({
  onStart: startGame,
  onShare: async (platform) => {
    if (!state.lastEntry || state.sharing) return;
    state.sharing = true;
    try {
      const svg = tessa.mascotSVGMarkup ? tessa.mascotSVGMarkup(400) : '';
      const status = await score.share(state.lastEntry, svg, platform);
      if (status) ui.setShareStatus?.(status);
    } finally {
      state.sharing = false;
    }
  },
  onBoardTab: async (difficulty) => {
    // cache first so the panel never sits empty, then whatever the board says
    const cached = leaderboard.cachedBoard(difficulty);
    if (cached) ui.setBoard(cached);
    ui.setBoard((await leaderboard.fetchBoard(difficulty)) || cached || { difficulty, offline: true });
  },
  onToggleMute: () => audio.setMuted(!audio.isMuted()),
  onToggleLegend: () => {},
  onMagnifier: (on) => interaction.setZoom(on),
  onRestart: (nextTier) => {
    // keep the name across the reload: replays skip straight to the level
    // pick — or straight INTO the next tier when "Continue" was pressed
    try {
      sessionStorage.setItem('mw-replay', state.playerName);
      if (nextTier) sessionStorage.setItem('mw-next', nextTier);
    } catch (e) { /* private mode */ }
    window.location.reload();
  },
});
tessa.initCharacter();

// "Build another" reloads with the name kept — a returning watchmaker goes
// straight back to the level pick, never through the name question again
const replayName = (() => {
  try {
    const n = sessionStorage.getItem('mw-replay');
    if (n) sessionStorage.removeItem('mw-replay');
    return n;
  } catch (e) {
    return null;
  }
})();
const replayNext = (() => {
  try {
    const t = sessionStorage.getItem('mw-next');
    if (t) sessionStorage.removeItem('mw-next');
    return ['easy', 'medium', 'hard'].includes(t) ? t : null;
  } catch (e) {
    return null;
  }
})();
if (replayName && replayNext) {
  // "Continue": straight into the next tier, no questions, no briefing
  state.started = true;
  state.playerName = replayName;
  state.difficulty = replayNext;
  assembly.setDifficulty(replayNext);
  sweepCameraToBench();
  tessa.setStage?.('corner');
  const steps = { easy: 15, medium: 22, hard: 31 }[replayNext];
  delay(0.8, () => {
    tessa.say(`Back for more, ${replayName}? ${replayNext[0].toUpperCase()}${replayNext.slice(1)}: ${steps} steps. Let's go.`, { mood: 'excited', interrupt: true, sticky: true });
    layOutBench();
    delay(2.2, beginRun);
  });
} else if (replayName) {
  state.started = true;
  state.playerName = replayName;
  sweepCameraToBench();
  tessa.setStage?.('center');
  delay(1.0, () => askLevel(`Back already, ${replayName}? Pick your level.`, { briefing: false }));
} else {
  tessa.setStage?.('title'); // she greets you on the landing page, telling the time
  ui.showTitle();
}

function rebuildDialParts(style) {
  const builders = [
    ['dial', buildDial],
    ['hourhand', buildHourHand],
    ['minutehand', buildMinuteHand],
    ['secondhand', buildSecondHand],
  ];
  for (const [id, build] of builders) {
    const old = parts.get(id);
    scene.remove(old);
    // hard tier gets the punched date window over its ring (hands ignore it)
    const fresh = build(style, { dateWindow: state.difficulty === 'hard' });
    fresh.userData.partId = id;
    fresh.traverse((o) => { o.userData.partId = id; });
    enableShadows(fresh, { receive: true });
    settleInTray(fresh, id);
    fresh.visible = false;
    scene.add(fresh);
    parts.set(id, fresh);
    // refresh the emissive-pulse cache for the rebuilt part
    const mats = new Set();
    fresh.traverse((o) => {
      if (o.isMesh && o.material.isMeshStandardMaterial && o.material.emissiveIntensity === 1 && o.material.emissive.getHex() === 0) {
        mats.add(o.material);
      }
    });
    partMats.set(id, [...mats]);
  }
  ticking.register({
    hands: {
      hour: parts.get('hourhand').userData.pivot,
      minute: parts.get('minutehand').userData.pivot,
      second: parts.get('secondhand').userData.pivot,
    },
  });
}

// hoisted: the replay boot path calls sweepCameraToBench during module eval
function isPortrait() {
  return window.innerWidth / window.innerHeight < 0.8;
}

function sweepCameraToBench() {
  const from = camera.position.clone();
  // portrait keeps the tool roll and tray inside the frame: higher and farther
  const to = isPortrait() ? new THREE.Vector3(0, 33, 30.5) : new THREE.Vector3(0, 27, 25.5);
  controls.enabled = false;
  tween(2.0, (k) => camera.position.lerpVectors(from, to, k), {
    ease: easeInOutCubic,
    onDone: () => { controls.enabled = true; },
  });
}

// The level question, shared by the first run and "Build another" replays.
function askLevel(intro, { briefing = true } = {}) {
  const ch = state.challenge;
  const mark = (lvl, sub) => (ch && ch.level === lvl ? `${sub} · Challenge` : sub);
  tessa.say(intro, { mood: 'happy', interrupt: true, sticky: true });
  ui.showPrompt?.({
    eyebrow: 'Pick your level',
    center: true,
    choices: [
      { value: 'easy', label: 'Easy', sub: mark('easy', '15 steps') },
      { value: 'medium', label: 'Medium', sub: mark('medium', '22 steps') },
      { value: 'hard', label: 'Hard', sub: mark('hard', '31 steps') },
    ],
    onSubmit: (d) => {
      audio.initAudio(); // replay boots carry no gesture yet; this click is one
      state.difficulty = d;
      assembly.setDifficulty(d);
      tessa.setStage?.('corner');
      tessa.say("Then let me lay out the bench, sugar. Watch how we work.", { mood: 'happy', interrupt: true, sticky: true });
      delay(1.0, layOutBench);
      if (briefing) delay(2.0, showBriefing);
      else delay(2.4, beginRun);
    },
  });
}

function startGame(config = {}) {
  if (state.started) return;
  state.started = true;
  audio.initAudio();
  ui.hideTitle();
  sweepCameraToBench();

  // headless/debug fast path: config supplies everything, skip the chat
  if (config && config.name) {
    state.playerName = String(config.name).trim().slice(0, 16) || 'Watchmaker';
    state.difficulty = ['easy', 'medium', 'hard'].includes(config.difficulty) ? config.difficulty : 'medium';
    if (['cocktail', 'waffle', 'field'].includes(config.dialStyle)) {
      state.dialStyle = config.dialStyle;
      state.dialChosen = true;
      rebuildDialParts(config.dialStyle);
    }
    assembly.setDifficulty(state.difficulty);
    tessa.setStage?.('corner');
    layOutBench();
    beginRun();
    return;
  }

  // Tessa takes center stage for the intro: name first, then the level
  tessa.setStage?.('center');
  delay(1.2, () => {
    tessa.say("Well hey there, sugar! I'm Tessa. What do folks call you?", { mood: 'excited', interrupt: true, sticky: true });
    ui.showPrompt?.({
      eyebrow: 'Your name',
      mode: 'name',
      placeholder: 'J. Watchmaker',
      center: true,
      onSubmit: (name) => {
        state.playerName = name.trim().slice(0, 16) || 'Watchmaker';
        const ch = state.challenge;
        askLevel(ch
          ? `${ch.from} scored ${ch.goal.toLocaleString()} on ${ch.level}. Beat that, sugar?`
          : `${state.playerName}! Mighty fine. Now pick your level.`);
      },
    });
  });
}

// the bench dresses itself: props fade in, tray parts pop in one by one
function layOutBench() {
  BENCH_PROPS.forEach((g, i) => {
    delay(0.12 * i, () => { g.visible = true; });
  });
  let n = 0;
  for (const [id, part] of parts) {
    if (LATE_PARTS.includes(id)) continue;
    n += 1;
    delay(0.35 + n * 0.07, () => {
      part.visible = true;
      const s = part.scale.x;
      part.scale.setScalar(0.01);
      tween(0.25, (k) => part.scale.setScalar(0.01 + (s - 0.01) * k));
    });
  }
  // the grabbable pool filters on visibility — rebuild it once every part is
  // in, or a run whose step 1 was announced first (the fast path) starts with
  // an empty pool and no part responds to the pointer
  delay(0.35 + (n + 1) * 0.07 + 0.3, refreshGrabbable);
}

// One card that teaches the whole bench, with the spec sheet held open so
// the player sees what the card is pointing at. The run clock starts after.
function showBriefing() {
  ui.setHudVisible?.(true);
  ui.showLegend(legendParts());
  ui.setLegendOpen?.(true);
  ui.showPrompt?.({
    eyebrow: 'Bench briefing',
    center: true,
    lines: [
      'Tools live on the leather roll to your left. Every job needs the right one.',
      'Parts wait in the tray to your right. Drag the glowing part onto its ghost.',
      'Drag the background to orbit the bench.',
      COARSE ? 'Put a tool back by tapping the roll.' : 'Hold Z to magnify.',
      'The spec sheet (open on the right) knows every part.',
    ],
    choices: [{ value: 'go', label: "Let's build" }],
    onSubmit: () => {
      ui.setLegendOpen?.(false);
      beginRun();
    },
  });
}

function beginRun() {
  state.startTime = performance.now(); // the clock starts when the work does
  ui.setHudVisible?.(true);
  ui.showLegend(legendParts());
  ui.setTool?.('', 'none');
  ui.setSlips?.(0);
  ui.flashHint(HINT_START);
  assembly.begin();
}

// ---------------------------------------------------------------------------
// debug hook (self-testing): window.__mw.place() completes the current step
// ---------------------------------------------------------------------------
window.__mw = {
  state, assembly, parts, interaction, renderer, ticking, leaderboard,
  fx: (x = 0, y = 3, z = 0, color = 0xffc86b) => spawnPlacementFx(new THREE.Vector3(x, y, z), color),
  start: (cfg) => startGame(cfg),
  tool: (id) => interaction.selectTool(id),
  place: () => {
    const step = assembly.currentStep;
    if (!step) return 'no step';
    if (state.service) {
      const n = state.service.step.service.points.length;
      for (let i = 0; i < n; i++) handleServicePoint(i);
      return `service: ${state.service ? 'in progress' : 'done'}`;
    }
    if (step.type === 'service') return 'service starting, retry shortly';
    if (assembly.placed.has(step.id)) return 'waiting on service/advance';
    if (state.placingBusy) return 'busy';
    const part = parts.get(step.id);
    part.visible = true;
    interaction.selectTool(step.tool);
    const t = assembly.targetWorldPos(new THREE.Vector3());
    part.position.set(t.x, 5.2, t.z);
    snapPart(part);
    return `placed ${step.id}`;
  },
};

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let elapsed = 0;
const gazeV = new THREE.Vector3();
let gazeWas = false;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  // world time crawls during a hitstop; feedback (tweens, FX) keeps moving
  const wdt = hitstopT > 0 ? dt * 0.05 : dt;
  hitstopT = Math.max(0, hitstopT - dt);
  updateTweens(dt);
  backdrop.update(wdt);
  assembly.update(wdt);
  interaction.update(dt);
  ticking.update(wdt);
  ui.setLoupe?.(interaction.zooming);
  // Tessa watches the part being carried across the bench
  if (interaction.held) {
    gazeV.copy(interaction.held.position).project(camera);
    tessa.lookToward?.(gazeV.x, -gazeV.y * 0.6);
    gazeWas = true;
  } else if (gazeWas) {
    gazeWas = false;
    tessa.lookIdle?.();
  }
  applyPulse(elapsed, dt);
  // pulse any live service markers
  if (state.service) {
    const s = 1 + Math.sin(elapsed * 4.2) * 0.14;
    for (const m of state.service.markers) {
      if (!state.service.done.has(m.userData.serviceIndex)) m.scale.setScalar(s);
    }
  }
  controls.update();
  renderer.render(scene, camera);
}
loop();
