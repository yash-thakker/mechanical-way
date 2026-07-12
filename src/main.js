// The Mechanical Way — game orchestration (v2: tools + service work).
import * as THREE from 'three';
import { createScene, createBlobShadow, HOME_POSITIONS } from './scene.js';
import { buildAllParts, buildPlate, buildCase, buildHolder, buildDial, buildHands, COLORS } from './parts/watchParts.js';
import { Assembly, STEPS, LEGEND, wrongPartLine, wrongToolLine, stepNotes } from './assembly.js';
import { buildToolRoll, TOOLS } from './parts/tools.js';
import { Interaction } from './interaction.js';
import { TickingSim } from './ticking.js';
import * as ui from './ui.js';
import * as tessa from './character.js';
import * as audio from './audio.js';
import * as score from './score.js';

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

// ---------------------------------------------------------------------------
// world setup
// ---------------------------------------------------------------------------
const canvas = document.getElementById('scene');
const { renderer, scene, camera, controls, tray, backdrop } = createScene(canvas);

const holder = buildHolder();
scene.add(holder);

const movementGroup = new THREE.Group();
movementGroup.position.y = 1.75; // plate rests on the holder ledge
scene.add(movementGroup);
movementGroup.add(buildPlate());

const dialGroup = new THREE.Group();
dialGroup.position.set(0, 4.6, 0); // top of the flipped movement
scene.add(dialGroup);

const caseGroup = buildCase();
caseGroup.visible = false;
scene.add(caseGroup);

const blobShadow = createBlobShadow();
scene.add(blobShadow);

// the tool roll, on the watchmaker's left
const { group: toolRoll, toolGroups } = buildToolRoll();
toolRoll.position.set(-12.5, 0, 0.8); // upper-left, clear of the mascot's corner
scene.add(toolRoll);

const parts = buildAllParts();

// Parts wait in the tray at miniature scale so twelve of them fit a bench
// tray; they grow to full size in the player's grip.
const TRAY_SCALE = 0.5;

// settle each part into its tray home, resting on the surface
const homes = new Map();
const bbox = new THREE.Box3();
for (const [id, part] of parts) {
  const [hx, hz] = HOME_POSITIONS[id];
  part.scale.setScalar(TRAY_SCALE);
  bbox.setFromObject(part);
  const restY = 0.42 - bbox.min.y;
  part.position.set(hx, restY, hz);
  part.rotation.y = (Math.random() - 0.5) * 0.7;
  homes.set(id, new THREE.Vector3(hx, restY, hz));
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
  'datejumper', 'dateindicator', 'datering',
  'stem', 'settinglever', 'yoke', 'jumper',
  'dial', 'hands',
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
    barrel: parts.get('barrel'),
    center: parts.get('center'),
    third: parts.get('third'),
    fourth: parts.get('fourth'),
  },
  motion: {
    cannon: parts.get('cannon'),
    minuteWheel: parts.get('minutewheel'),
    hourWheel: parts.get('hourwheel'),
  },
  rotor: parts.get('rotor'),
  hands: {
    hour: parts.get('hands').userData.hourPivot,
    minute: parts.get('hands').userData.minutePivot,
    second: parts.get('hands').userData.secondPivot,
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
  playerName: 'WATCHMAKER',
  difficulty: 'medium',
  dialStyle: 'cocktail',
  dialChosen: false,
};

function legendParts() {
  return LEGEND.map((p) => ({ ...p, done: assembly.placed.has(p.id) }));
}

function setPulse(partId) {
  state.currentPulse = partId;
}

function applyPulse(time) {
  for (const [id, mats] of partMats) {
    const active = id === state.currentPulse && !assembly.placed.has(id);
    const k = active ? (Math.sin(time * 4.5) * 0.5 + 0.5) * 0.4 : 0;
    for (const m of mats) {
      if (active) {
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

// ---------------------------------------------------------------------------
// service work: screw tightening and jewel oiling via point markers
// ---------------------------------------------------------------------------
function makeServiceMarker(p, color, index) {
  const g = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(0.5, 0.06, 8, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, depthWrite: false })
  );
  ring.rotation.x = Math.PI / 2;
  g.add(ring);
  // generous invisible hit target
  const hit = new THREE.Mesh(
    new THREE.SphereGeometry(0.75, 8, 8),
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
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.14, 14), steel);
  g.add(head);
  const slot = new THREE.Mesh(
    new THREE.BoxGeometry(0.44, 0.03, 0.09),
    new THREE.MeshStandardMaterial({ color: 0x2a2d33, roughness: 0.5, metalness: 0.6 })
  );
  slot.position.y = 0.07;
  slot.rotation.y = Math.random() * Math.PI;
  g.add(slot);
  return g;
}

function serviceSpace(step) {
  return step.service.space === 'dial' ? dialGroup : movementGroup;
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
  if (svc.done.size === total) {
    interaction.clearService();
    delay(0.55, () => finishService(step));
  } else {
    ui.toast(`${svc.done.size} OF ${total}`);
  }
}

function finishService(step) {
  state.service = null;
  const line = (state.difficulty === 'easy' && step.service.doneEasy) || step.service.done;
  tessa.say(line, { mood: 'happy', interrupt: true });
  ui.setProgress((assembly.stepIndex + 1) / assembly.steps.length);
  const windTrigger = state.difficulty === 'easy' ? 'balance' : 'crownwheel';
  if (step.id === windTrigger) {
    windAndWake();
  } else if (step.id === 'rotor') {
    // hard tier: the self-winding system caps the movement side — flip her
    delay(1.2, flipMovement);
  } else {
    delay(1.0, () => assembly.advance());
  }
}

// ---------------------------------------------------------------------------
// step flow
// ---------------------------------------------------------------------------
const SUCCESS_MOODS = ['happy', 'excited', 'cheer'];

assembly.onAdvance = (step, index) => {
  ui.setStep(index + 1, assembly.steps.length, step.label);
  ui.setProgress(index / assembly.steps.length);
  ui.updateLegend(legendParts());
  if (step.id === 'dial' && !state.dialChosen) {
    // pre-dial: Tessa offers the three faces before the dial step begins
    interaction.enabled = false;
    setPulse(null);
    tessa.say("Almost home, sugar. Time to give her a FACE — which dial are we dressin' her in?", { mood: 'excited', interrupt: true });
    ui.showPrompt?.({
      eyebrow: '// PICK HER FACE',
      choices: [
        { value: 'cocktail', label: 'COCKTAIL', sub: 'BLUE SUNBURST', swatch: 'cocktail' },
        { value: 'waffle', label: 'WAFFLE', sub: 'NAVY GRID', swatch: 'waffle' },
        { value: 'field', label: 'FIELD', sub: 'BLACK · NUMERALS', swatch: 'field' },
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
  tessa.say(step.announce, { mood: index === 0 ? 'excited' : 'happy', interrupt: true });
  const part = parts.get(step.id);
  if (step.phase === 'dial' && part) part.visible = true;
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
  interaction.setDragHeight(step.phase === 'dial' ? 6.8 : 3.6);
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
  // framed; the +z bias keeps the near tray rows on screen
  const to = new THREE.Vector3(t.x * 0.18, THREE.MathUtils.clamp(t.y * 0.5, 1.2, 3.2), 2.2 + t.z * 0.18);
  tween(0.9, (k) => controls.target.lerpVectors(from, to, k), { ease: easeInOutCubic });
}

assembly.onAllPlaced = () => {
  finaleCasing();
};

const interaction = new Interaction({
  camera, canvas, controls, scene, parts, assembly, blobShadow,
  callbacks: {
    onGrab(part) {
      audio.playPickup();
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
      if (!state.dropHintShown) {
        state.dropHintShown = true;
        ui.flashHint('PUT A TOOL BACK: CLICK THE ROLL · RIGHT-CLICK · ESC');
      }
      // first pickup of each tool earns its lesson
      if (!state.toolsSeen.has(id)) {
        state.toolsSeen.add(id);
        tessa.say(TOOLS[id].blurb, { mood: 'thinking' });
      }
    },
    onWrongTool(needed, selected) {
      state.mistakes += 1;
      audio.playError();
      if (selected) ui.setTool?.(TOOLS[selected].name, 'wrong');
      else ui.setTool?.('', 'none');
      tessa.say(wrongToolLine(needed, selected), { mood: 'oops', interrupt: true });
    },
    onServicePoint(index) {
      handleServicePoint(index);
    },
    onWrongClick(part) {
      state.mistakes += 1;
      audio.playError();
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
    onDropMiss(part, home) {
      // was it a genuine attempt near the plate? count a slip
      if (Math.hypot(part.position.x, part.position.z) < 11) state.mistakes += 1;
      const from = part.position.clone();
      const s0 = part.scale.x;
      tween(0.55, (k) => {
        part.position.lerpVectors(from, home, k);
        part.scale.setScalar(s0 + (TRAY_SCALE - s0) * k);
      }, { ease: easeInOutCubic });
      setPulse(part.userData.partId);
    },
  },
});
interaction.setTools(toolGroups, toolRoll);

function snapPart(part) {
  const step = assembly.currentStep;
  interaction.enabled = false;
  state.placingBusy = true;
  const target = assembly.targetWorldPos(new THREE.Vector3());
  const from = part.position.clone();
  const fromRot = part.rotation.y;
  tween(0.3, (k) => {
    part.position.lerpVectors(from, target, k);
    part.rotation.y = fromRot * (1 - k);
  }, {
    onDone: () => {
      assembly.place(step.id);
      audio.playPlace();
      // satisfaction pop
      tween(0.22, (k) => {
        const s = 1 + Math.sin(k * Math.PI) * 0.06;
        part.scale.setScalar(s);
      }, { onDone: () => part.scale.setScalar(1) });
      ui.setProgress((assembly.stepIndex + 1) / assembly.steps.length);
      ui.updateLegend(legendParts());
      state.placingBusy = false;
      afterPlaced(step);
    },
  });
}

function afterPlaced(step) {
  const mood = SUCCESS_MOODS[assembly.stepIndex % SUCCESS_MOODS.length];
  tessa.say(step.success, { mood, interrupt: true });
  if (step.id === 'mainspring') audio.playWind(0.6);
  audio.playChime();

  if (step.service) {
    // the part is down; now the tool work (screws) before we move on
    delay(0.8, () => enterService(step));
  } else if (step.id === 'hands') {
    delay(0.6, () => assembly.advance()); // triggers onAllPlaced
  } else {
    delay(1.2, () => assembly.advance()); // give the success line a beat to land
  }
}

// after the crown wheel is screwed down: wind through the real chain —
// crown wheel → ratchet → arbor — with the click snapping tooth by tooth
function windAndWake() {
  interaction.enabled = false;
  delay(1.6, () => {
    const hasClickSystem = assembly.placed.has('crownwheel');
    tessa.say(hasClickSystem
      ? "Windin' her up now... hear that click-click-click? That's your little pink lever earnin' its keep."
      : "Windin' her up now... listen close.", { mood: 'thinking', interrupt: true });
    const crown = parts.get('crownwheel');
    const ratchet = parts.get('ratchet');
    const barrel = parts.get('barrel');
    let i = 0;
    const clicks = 7;
    const wind = () => {
      audio.playWind(i / clicks);
      if (hasClickSystem) {
        const c0 = crown.rotation.y;
        const r0 = ratchet.rotation.y;
        tween(0.13, (k) => {
          crown.rotation.y = c0 + k * 0.5;           // meshing pair counter-rotates
          ratchet.rotation.y = r0 - k * 0.5 * (1.55 / 2.3);
        });
      } else {
        const b0 = barrel.rotation.y;
        tween(0.13, (k) => { barrel.rotation.y = b0 + k * 0.35; });
      }
      i += 1;
      if (i < clicks) delay(0.17, wind);
      else delay(0.5, wake);
    };
    wind();
  });
}

function wake() {
  ticking.start();
  audio.startTicking(300);
  tessa.say("SHE'S ALIVE! Look at that heart beat — five times a second, steady as sunrise. Let her run a spell...", { mood: 'cheer', interrupt: true });
  tessa.celebrate();
  if (state.difficulty === 'hard') {
    // assemble the automatic winding onto the LIVE movement, then flip
    delay(4.5, () => assembly.advance());
  } else {
    // admire the running train, then flip the movement for the dial side
    delay(5.0, flipMovement);
  }
}

function flipMovement() {
  tessa.say("Now we flip her over, dial-side up. Hold your breath...", { mood: 'thinking', interrupt: true });
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

// the case drops on — the end cinematic
function finaleCasing() {
  interaction.enabled = false;
  interaction.deselectTool();
  ui.hideNotes?.();
  ui.setStep(assembly.steps.length, assembly.steps.length, 'THE CASE');
  ui.setProgress(1);
  tessa.say("And now, sugar... the case. Stand back — this one's mine.", { mood: 'excited', interrupt: true });

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
        tessa.celebrate();
        tessa.say("IT TICKS. You hear that? YOU built that, darlin'. A whole beating heart of steel and rubies. I am just so proud!", { mood: 'cheer', interrupt: true });
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
            name: state.playerName, score: pts, difficulty: state.difficulty,
            dialStyle: state.dialStyle, timeSec, mistakes: state.mistakes, ts: Date.now(),
          };
          const { leaderboard, isNewBest } = score.saveScore(state.lastEntry);
          ui.showComplete({
            name: state.playerName, score: pts, grade, timeSec,
            mistakes: state.mistakes, difficulty: state.difficulty,
            dialStyle: state.dialStyle, leaderboard: leaderboard.slice(0, 8), isNewBest,
          });
        });
      },
    });
  });
}

// ---------------------------------------------------------------------------
// boot
// ---------------------------------------------------------------------------
ui.initUI({
  onStart: startGame,
  onShare: async () => {
    if (!state.lastEntry) return;
    const svg = tessa.mascotSVGMarkup ? tessa.mascotSVGMarkup(400) : '';
    const status = await score.share(state.lastEntry, svg);
    if (status) ui.setShareStatus?.(status);
  },
  onToggleMute: () => audio.setMuted(!audio.isMuted()),
  onToggleLegend: () => {},
  onMagnifier: () => {},
});
tessa.initCharacter();
tessa.setStage?.('title'); // she greets you on the landing page, telling the time
ui.showTitle();

function rebuildDialParts(style) {
  for (const [id, build] of [['dial', buildDial], ['hands', buildHands]]) {
    const old = parts.get(id);
    scene.remove(old);
    const fresh = build(style);
    fresh.userData.partId = id;
    fresh.traverse((o) => { o.userData.partId = id; });
    fresh.scale.setScalar(TRAY_SCALE);
    bbox.setFromObject(fresh);
    const [hx, hz] = HOME_POSITIONS[id];
    const restY = 0.42 - bbox.min.y;
    fresh.position.set(hx, restY, hz);
    fresh.rotation.y = (Math.random() - 0.5) * 0.7;
    homes.set(id, new THREE.Vector3(hx, restY, hz));
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
      hour: parts.get('hands').userData.hourPivot,
      minute: parts.get('hands').userData.minutePivot,
      second: parts.get('hands').userData.secondPivot,
    },
  });
}

function startGame(config = {}) {
  if (state.started) return;
  state.started = true;
  audio.initAudio();
  ui.hideTitle();

  // camera sweep down to the full bench view: tools left, parts right
  const from = camera.position.clone();
  const to = new THREE.Vector3(0, 27, 25.5);
  controls.enabled = false;
  tween(2.0, (k) => camera.position.lerpVectors(from, to, k), {
    ease: easeInOutCubic,
    onDone: () => { controls.enabled = true; },
  });

  // headless/debug fast path: config supplies everything, skip the chat
  if (config && config.name) {
    state.playerName = String(config.name).trim().slice(0, 16) || 'WATCHMAKER';
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

  // Tessa takes center stage for the intro: name first, then how deep we go
  tessa.setStage?.('center');
  delay(1.2, () => {
    tessa.say("Well hey there, sugar! I'm Tessa, and this here's my bench. Before we touch a single wheel — what do folks call you?", { mood: 'excited', interrupt: true });
    ui.showPrompt?.({
      eyebrow: '// TESSA ASKS — YOUR NAME',
      mode: 'name',
      placeholder: 'J. WATCHMAKER',
      center: true,
      onSubmit: (name) => {
        state.playerName = name.trim().slice(0, 16) || 'WATCHMAKER';
        tessa.say(`${state.playerName}! Mighty fine name. Now — how deep into this movement are we goin' today?`, { mood: 'happy', interrupt: true });
        ui.showPrompt?.({
          eyebrow: '// TESSA ASKS — HOW DEEP?',
          center: true,
          choices: [
            { value: 'easy', label: 'EASY', sub: 'THE GOING TRAIN · 13 STEPS' },
            { value: 'medium', label: 'MEDIUM', sub: '+ WINDING & MOTION WORKS · 20' },
            { value: 'hard', label: 'HARD', sub: 'THE FULL MOVEMENT · 29' },
          ],
          onSubmit: (d) => {
            state.difficulty = d;
            assembly.setDifficulty(d);
            tessa.setStage?.('corner');
            tessa.say("Then let's get to it: tools wait in the roll on your LEFT, parts in the tray on your RIGHT. Pick the right tool, then drag the glowing part onto its ghost.", { mood: 'happy', interrupt: true });
            delay(1.0, layOutBench);
            delay(2.8, beginRun);
          },
        });
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
}

function beginRun() {
  state.startTime = performance.now(); // the clock starts when the work does
  ui.setHudVisible?.(true);
  ui.showLegend(legendParts());
  ui.setTool?.('', 'none');
  ui.flashHint('PICK A TOOL FROM THE ROLL · HOLD Z TO MAGNIFY · DRAG BACKGROUND TO ORBIT');
  assembly.begin();
}

// ---------------------------------------------------------------------------
// debug hook (self-testing): window.__mw.place() completes the current step
// ---------------------------------------------------------------------------
window.__mw = {
  state, assembly, parts, interaction,
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
    if (step.type === 'service') return 'service starting — retry shortly';
    if (assembly.placed.has(step.id)) return 'waiting on service/advance';
    if (state.placingBusy) return 'busy';
    const part = parts.get(step.id);
    part.visible = true;
    interaction.selectTool(step.tool);
    const t = assembly.targetWorldPos(new THREE.Vector3());
    part.position.set(t.x, 3.6, t.z);
    snapPart(part);
    return `placed ${step.id}`;
  },
};

// ---------------------------------------------------------------------------
// main loop
// ---------------------------------------------------------------------------
const clock = new THREE.Clock();
let elapsed = 0;

function loop() {
  requestAnimationFrame(loop);
  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;
  updateTweens(dt);
  backdrop.update(dt);
  assembly.update(dt);
  interaction.update(dt);
  ticking.update(dt);
  applyPulse(elapsed);
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
