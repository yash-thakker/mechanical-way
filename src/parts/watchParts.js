// Every part of the watch, procedurally modeled. Layout follows a real movement:
// barrel → center wheel → third wheel → fourth wheel → escape wheel → pallet → balance.
// Nothing about the gear geometry is hand-placed: tooth counts are a textbook
// 18,000 bph train, center distances are sums of PITCH radii (how real gears
// mesh), and every mesh is later phase-rotated tooth-into-gap (buildAllParts).
import * as THREE from 'three';
import {
  createGearGeometry,
  createEscapeWheelGeometry,
  createSpiralGeometry,
  createLatheRing,
  createRoundedPlateGeometry,
} from './gearFactory.js';

// ---- tooth-true drivetrain -------------------------------------------------
// Real ratios, exact by construction:
//   barrel 72 : center pinion 12  → barrel turns once per 6 h
//   center 64 : third pinion 8    → third wheel once per 7.5 min
//   third  60 : fourth pinion 8   → fourth wheel once per minute (seconds!)
//   fourth 60 : escape pinion 6   → escape wheel once per 6 s
//   escape 15 club teeth × 2 beats/tooth × 1/6 rev/s = 5 beats/s = 18,000 bph
export const TEETH = {
  barrel: 72, centerPinion: 12, center: 64, thirdPinion: 8, third: 60,
  fourthPinion: 8, fourth: 60, escapePinion: 6, escape: 15,
  ratchet: 40, crown: 24,
  cannon: 14, minuteWheel: 42, minutePinion: 9, hourWheel: 36,
  dateRing: 31,
};
// Pitch radii of the big wheels (their drawn size). Each pinion's pitch
// radius follows from its wheel's module — equal tooth spacing at the mesh
// is what lets teeth roll tooth-into-gap instead of grinding.
const PITCH = { barrel: 3.48, center: 3.27, third: 2.49, fourth: 2.1, ratchet: 2.2 };
const modOf = (id) => (2 * PITCH[id]) / TEETH[id];
const pinionPitch = (wheelId, pinionTeeth) => (modOf(wheelId) * pinionTeeth) / 2;
// addendum 1.05·m, dedendum 1.35·m: at center distance p1+p2 the tips clear
// the mating root by 0.3·m — true rolling contact with real clearance
export function gearDims(p, teeth) {
  const m = (2 * p) / teeth;
  return { tipR: p + 1.05 * m, rootR: p - 1.35 * m };
}
const P_CENTER_PINION = pinionPitch('barrel', TEETH.centerPinion); // 0.58
const P_THIRD_PINION = pinionPitch('center', TEETH.thirdPinion);   // 0.409
const P_FOURTH_PINION = pinionPitch('third', TEETH.fourthPinion);  // 0.332
const P_ESCAPE_PINION = pinionPitch('fourth', TEETH.escapePinion); // 0.21
const P_CROWN = pinionPitch('ratchet', TEETH.crown);               // 1.32

// ---- movement plan (x, z on the plate, plate top = y 0) -------------------
// Positions are DERIVED: each wheel sits along the same layout direction as
// ever, at exactly the meshing distance (sum of pitch radii) from its driver.
const dirTo = (x, z) => new THREE.Vector2(x, z).normalize();
const at = (from, dir, dist) => from.clone().addScaledVector(dir, dist);
const CENTER = new THREE.Vector2(0, 0);
const BARREL = at(CENTER, dirTo(-1, -1), PITCH.barrel + P_CENTER_PINION);
const THIRD = at(CENTER, dirTo(0.866, 0.5), PITCH.center + P_THIRD_PINION);
const FOURTH = at(THIRD, dirTo(-1.35, 2.95), PITCH.third + P_FOURTH_PINION);
const ESCAPE = at(FOURTH, dirTo(-2.7, -0.4), PITCH.fourth + P_ESCAPE_PINION);
// Escapement geometry: the pallet pivot sits where the two stones (placed ON
// the escape tooth circle, ±30° about the line of centers = 2.5 tooth spans)
// come out equidistant; the balance axis continues the same line.
const PALLET = at(ESCAPE, dirTo(-2.05, -1.25), 2.2);
const BALANCE = at(PALLET, dirTo(-2.15, -1.15), 2.3);
export const PLAN = {
  plateR: 8.3,
  center: CENTER,
  barrel: BARREL,
  third: THIRD,
  fourth: FOURTH,
  escape: ESCAPE,
  pallet: PALLET,
  balance: BALANCE,
  // click system (on the barrel bridge): the ratchet screws onto the barrel
  // arbor, the crown wheel meshes it at ratchet-pitch + crown-pitch, and the
  // click's pawl rests IN the ratchet teeth from a pivot just outside them.
  crownWheel: at(BARREL, dirTo(3.59, -0.96), PITCH.ratchet + P_CROWN),
  click: at(BARREL, dirTo(2.44, 0.55), 2.72),
};

// Motion works live on the DIAL side (dialGroup local). Both meshes share the
// one center distance D (cannon and hour wheel are coaxial), split by the
// real ratios: cannon:minute-wheel 1:3 and minute-pinion:hour-wheel 1:4
// multiply to the 12:1 of hours. Pitch radii follow from D alone.
export const MOTION = {
  minuteWheel: new THREE.Vector2(1.78, -1.61),
};
const D_MOTION = MOTION.minuteWheel.length(); // 2.40
export const MOTION_PITCH = {
  cannon: D_MOTION / 4,
  minuteWheel: (3 * D_MOTION) / 4,
  minutePinion: D_MOTION / 5,
  hourWheel: (4 * D_MOTION) / 5,
};

// Hard-tier plans. Auto-winding sits on the MOVEMENT side (over the bridges);
// the date mechanism and keyless works live on the DIAL side, near 3 o'clock.
export const AUTO = {
  reversers: new THREE.Vector2(2.6, -1.9),
};
// Date ring phasing: face and teeth are one rigid ring, so ONE baked rotation
// must (a) center a printed numeral in the dial's window at +x and (b) put
// tooth gaps under both steel contacts. (a) fixes the rotation; the contacts'
// PLAN angles are then derived from exact gap directions near their old spots.
const RING_STEP = (Math.PI * 2) / TEETH.dateRing;
export const RING_BAKE = (() => {
  // numerals sit at world φ = canvasAngle − bake; numeral d's canvas angle is
  // ((d−1)/31)·2π − π/2, so bake ≡ −π/2 (mod pitch) centers one at +x
  let b = (-Math.PI / 2) % RING_STEP;
  if (b < -RING_STEP / 2) b += RING_STEP;
  if (b > RING_STEP / 2) b -= RING_STEP;
  return b;
})();
const ringGapAngle = (target) => {
  // gap centers sit at φ = −(i + 0.275 + 0.5)·step − RING_BAKE
  const k = Math.round((-target - RING_BAKE) / RING_STEP - 0.775);
  return -(k + 0.775) * RING_STEP - RING_BAKE;
};
const IND_ANGLE = ringGapAngle(Math.atan2(1.29, -4.75));
const JMP_ANGLE = ringGapAngle(Math.atan2(-2.03, -5.70));

export const KEYLESS = {
  stem: new THREE.Vector2(6.9, 0),          // rod runs outward through the case edge
  settinglever: new THREE.Vector2(5.5, 1.3),
  yoke: new THREE.Vector2(5.4, -1.5),
  jumper: new THREE.Vector2(5.0, 0.1),
  // Both date parts genuinely reach the ring: the indicator's finger tip and
  // the jumper's spring beak sit at EXACT tooth-gap angles (see RING_BAKE).
  datejumper: new THREE.Vector2(Math.cos(JMP_ANGLE) * 6.05, Math.sin(JMP_ANGLE) * 6.05),
  dateindicator: new THREE.Vector2(Math.cos(IND_ANGLE) * 4.95, Math.sin(IND_ANGLE) * 4.95),
};
// where the stem's parts sit along its local X (used by yoke/lever/dial too)
export const STEM_GEOM = {
  slidingPinionX: -0.75, // sliding pinion (clutch) center, stem-local
  grooveX: -0.35,        // detent groove the setting-lever post drops into
  rodY: 0.12,            // rod centerline height in stem-local space
};

export const COLORS = {
  plate: 0xb8bcc4,
  barrel: 0xff7a1a,
  lid: 0xffa04f,
  mainspring: 0x3d5abf,
  center: 0xe6b93f,
  third: 0x58b368,
  fourth: 0x3fa7d6,
  escape: 0xe0503a,
  bridge: 0xc89b3c,
  pallet: 0x9b59b6,
  balance: 0x2ec4b6,
  dial: 0xf2e3be,
  hourhand: 0x33427a,
  minutehand: 0x33427a,
  secondhand: 0x33427a,
  ruby: 0xd42a4d,
  steel: 0x9aa0ad,
  barrelbridge: 0xb5885a,
  ratchet: 0xd98e2b,
  click: 0xe0507a,
  crownwheel: 0x8fa8c9,
  cannon: 0xd4a017,
  minutewheel: 0x7aa874,
  hourwheel: 0xcf7f43,
  reversers: 0xd6b53a,
  rotor: 0x66589e,
  datejumper: 0xcc5f8a,
  dateindicator: 0x5fae9e,
  datering: 0xf4f1e6,
  stem: 0xb9c2cc,
  settinglever: 0xd07840,
  yoke: 0x7f9e58,
  jumper: 0xc4a94e,
};

// Deterministic per-hue jitter so the 26 teaching colors stop sharing one
// uniform sheen: same color always gets the same finish, but finishes differ.
function hueJitter(color) {
  const h = (color * 2654435761) >>> 0;
  return ((h >>> 16) & 0xff) / 255 - 0.5; // -0.5..0.5
}

function metal(color, roughness = 0.32, metalness = 0.85) {
  // clearcoat gives the color-coded parts an anodized-metal sheen instead of
  // flat plastic, without touching the educational color language
  return new THREE.MeshPhysicalMaterial({
    color,
    roughness: THREE.MathUtils.clamp(roughness + hueJitter(color) * 0.14, 0.12, 0.72),
    metalness, envMapIntensity: 1.15,
    clearcoat: 0.35, clearcoatRoughness: 0.28,
  });
}

// Radial machining marks (sunray brushing) shared by every wheel face. Drawn
// once; each brushed material clones the texture so its repeat/offset can map
// the gear's own shape-space UVs (ExtrudeGeometry UVs are in shape units).
let brushCanvasTex = null;
function brushTexture() {
  if (brushCanvasTex) return brushCanvasTex;
  const S = 256;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#8f8f8f';
  ctx.fillRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2;
  // concentric cutter rings with per-ring brightness wobble
  for (let r = 2; r < S * 0.75; r += 1.6) {
    const v = 128 + Math.round((Math.random() - 0.5) * 90);
    ctx.strokeStyle = `rgba(${v}, ${v}, ${v}, ${0.5 + Math.random() * 0.3})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  brushCanvasTex = new THREE.CanvasTexture(cv); // linear space: data, not color
  brushCanvasTex.wrapS = brushCanvasTex.wrapT = THREE.RepeatWrapping;
  return brushCanvasTex;
}

// A metal() with radial machining on its flat faces. `radius` is the part's
// outer radius in shape units, so the brush rings center on the arbor.
function brushedMetal(color, roughness, metalness, radius) {
  const m = metal(color, roughness, metalness);
  const tex = brushTexture().clone();
  tex.needsUpdate = true;
  tex.repeat.setScalar(1 / (radius * 2));
  tex.offset.setScalar(0.5);
  m.roughnessMap = tex;
  m.bumpMap = tex;
  m.bumpScale = 0.008;
  m.roughness = Math.min(1, m.roughness + 0.22); // map darkens it back down
  return m;
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

// "A whole beating heart of steel and rubies" — polished corundum look via
// clearcoat + hot env reflections. (True transmission was tried and cut: it
// forces a full-scene pre-render pass, halving the frame rate for seventeen
// tiny stones the dome-and-bezel build already sells.)
const rubyMat = new THREE.MeshPhysicalMaterial({
  color: COLORS.ruby, roughness: 0.05, metalness: 0.15,
  clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 2.2,
  emissive: COLORS.ruby, emissiveIntensity: 0.26,
});

const bezelMat = new THREE.MeshPhysicalMaterial({
  color: 0xc89b3c, roughness: 0.24, metalness: 0.95, envMapIntensity: 1.3,
});

// A jewel bearing: domed ruby in a brass bezel, the way plates mount them.
function jewel(r = 0.18, h = 0.07) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(r, r, h, 20), rubyMat));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r * 0.92, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), rubyMat);
  dome.scale.y = 0.45;
  dome.position.y = h / 2;
  g.add(dome);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(r + 0.025, 0.032, 8, 20), bezelMat);
  bezel.rotation.x = Math.PI / 2;
  bezel.position.y = h * 0.3;
  g.add(bezel);
  return g;
}

function screwHead(mat) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 20), mat));
  // the slot sits flush with the head top: a dark sliver reads as a cut
  // groove, not a bar resting on the screw
  const slot = mesh(new THREE.BoxGeometry(0.34, 0.05, 0.06),
    new THREE.MeshStandardMaterial({ color: 0x14100c, roughness: 0.7, metalness: 0.3 }));
  slot.position.y = 0.017;
  slot.rotation.y = Math.random() * Math.PI;
  g.add(slot);
  return g;
}

// Capsule-ish plate between two XZ points (for bridges).
function bridgeArm(a, b, width, thickness, mat, pad = 1.1) {
  const dx = b.x - a.x, dz = b.y - a.y;
  const len = Math.hypot(dx, dz) + pad;
  const m = new THREE.Mesh(createRoundedPlateGeometry(width, len, thickness, width * 0.45), mat);
  m.position.set((a.x + b.x) / 2, 0, (a.y + b.y) / 2);
  m.rotation.y = Math.atan2(dx, dz);
  return m;
}

// ---------------------------------------------------------------------------
// Individual part builders. Each returns a Group whose local origin sits on
// the plate top (y 0) at its plan position — so placing = position at plan.
// ---------------------------------------------------------------------------

function buildBarrelDrum() {
  const g = new THREE.Group();
  const mat = metal(COLORS.barrel, 0.38, 0.8);
  // The drum (with its tooth ring) and the arbor are separate rigid pieces,
  // because they genuinely move separately: winding turns the ARBOR (with the
  // ratchet) while the drum holds still; running turns the DRUM while the
  // click holds the arbor. The ticking sim and wind cinematic use these refs.
  const drum = new THREE.Group();
  drum.add(mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.16, 48), mat, 0, 0.1, 0));
  drum.add(new THREE.Mesh(createLatheRing([[3.12, 0.1], [3.32, 0.1], [3.32, 1.5], [3.12, 1.5]]), mat));
  const bd = gearDims(PITCH.barrel, TEETH.barrel);
  const ring = new THREE.Mesh(createGearGeometry({
    teeth: TEETH.barrel, tipR: bd.tipR, rootR: bd.rootR, thickness: 0.55, holeR: 3.0,
  }), mat);
  ring.position.y = 0.45;
  tagGear(ring, TEETH.barrel, PITCH.barrel);
  drum.add(ring);
  g.add(drum);
  // arbor with hook; its square upper section rises through the barrel bridge
  // to just under the ratchet wheel, whose square hole it drives
  const arbor = new THREE.Group();
  const arborMat = metal(COLORS.steel, 0.3, 0.9);
  arbor.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.9, 16), arborMat, 0, 0.95, 0));
  arbor.add(mesh(new THREE.BoxGeometry(0.18, 0.5, 0.14), arborMat, 0.33, 0.85, 0));
  // square section: corner half-diagonal 0.226 clears the bridge bore (0.24)
  arbor.add(mesh(new THREE.BoxGeometry(0.32, 0.57, 0.32), arborMat, 0, 2.185, 0));
  g.add(arbor);
  g.userData.drum = drum;
  g.userData.arbor = arbor;
  return g;
}

function buildMainspring() {
  const g = new THREE.Group();
  const mat = metal(COLORS.mainspring, 0.35, 0.75);
  const spring = new THREE.Mesh(createSpiralGeometry({
    turns: 6, innerR: 0.45, outerR: 2.95, bandHeight: 0.95, bandThickness: 0.075,
    segmentsPerTurn: 34,
  }), mat);
  spring.position.y = 0.75;
  g.add(spring);
  return g;
}

function buildBarrelLid() {
  const g = new THREE.Group();
  const mat = metal(COLORS.lid, 0.3, 0.85);
  const lid = new THREE.Mesh(createLatheRing(
    [[0.42, 0], [3.05, 0], [3.28, 0.06], [3.28, 0.16], [0.42, 0.16]], 48), mat);
  g.add(lid);
  // decorative engraved groove
  g.add(mesh(new THREE.TorusGeometry(2.2, 0.02, 6, 48).rotateX(Math.PI / 2),
    metal(COLORS.barrel, 0.5, 0.6), 0, 0.165, 0));
  return g;
}

// Tags a toothed mesh with what the phase-alignment pass needs: tooth count,
// pitch radius, and the tooth-center fraction of the shape (0.275 + 0.13·lean
// for createGearGeometry; 0 for the escape wheel's sharp tips). Primitives
// only — userData must survive three's JSON round-trip on clone().
function tagGear(m, teeth, p, tc = 0.275) {
  m.userData.gear = { teeth, p, tc };
}

// A train wheel: big toothed wheel + pinion + arbor, at authentic stacked heights.
function buildTrainWheel({ color, wheel, pinion, arborTop }) {
  const g = new THREE.Group();
  const mat = metal(color, 0.3, 0.88);
  const w = new THREE.Mesh(createGearGeometry(wheel), brushedMetal(color, 0.3, 0.88, wheel.tipR));
  w.position.y = wheel.y;
  tagGear(w, wheel.teeth, wheel.p);
  g.add(w);
  if (pinion) {
    const p = new THREE.Mesh(createGearGeometry(pinion), mat);
    p.position.y = pinion.y;
    tagGear(p, pinion.teeth, pinion.p);
    g.add(p);
  }
  const arborMat = metal(COLORS.steel, 0.28, 0.92);
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, arborTop - 0.02, 12), arborMat, 0, arborTop / 2, 0));
  return g;
}

function buildEscapeWheel() {
  const g = new THREE.Group();
  const mat = metal(COLORS.escape, 0.28, 0.88);
  // top of the climbing train: wheel at 2.6, its pinion below at the fourth
  // wheel's plane — the last and highest wheel before the balance
  const w = new THREE.Mesh(createEscapeWheelGeometry({
    teeth: TEETH.escape, tipR: 1.7, rootR: 1.22, thickness: 0.14,
  }), brushedMetal(COLORS.escape, 0.28, 0.88, 1.7));
  w.position.y = 2.6;
  tagGear(w, TEETH.escape, 1.7, 0); // sharp tip points sit exactly at i·step
  g.add(w);
  const ed = gearDims(P_ESCAPE_PINION, TEETH.escapePinion);
  const p = new THREE.Mesh(createGearGeometry({
    teeth: TEETH.escapePinion, tipR: ed.tipR, rootR: ed.rootR, thickness: 0.3, holeR: 0.05,
  }), mat);
  p.position.y = 2.4;
  tagGear(p, TEETH.escapePinion, P_ESCAPE_PINION);
  g.add(p);
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.9, 12), metal(COLORS.steel, 0.28, 0.92), 0, 1.47, 0));
  return g;
}

// Bridge feet stand OUTSIDE every wheel's swept circle (tooth tips + the
// 0.32 post radius + margin) — a post inside a wheel's sweep gets carved by
// the spokes every revolution, which is the kind of thing eyes catch.
export const TRAIN_BRIDGE_FEET = [
  at(PLAN.third, dirTo(0.866, 0.5), gearDims(PITCH.third, TEETH.third).tipR + 0.38 + 0.05),
  at(PLAN.escape, dirTo(-0.067, 0.998), 1.7 + 0.38 + 0.06),
];

function buildTrainBridge() {
  const g = new THREE.Group();
  const mat = metal(COLORS.bridge, 0.34, 0.9);
  const y = 2.9, th = 0.26; // caps the climbing train (escape wheel tops 2.67)
  const arm1 = bridgeArm(PLAN.third, PLAN.fourth, 1.5, th, mat);
  const arm2 = bridgeArm(PLAN.fourth, PLAN.escape, 1.5, th, mat);
  arm1.position.y = y; arm2.position.y = y;
  g.add(arm1, arm2);
  for (const p of [PLAN.third, PLAN.fourth, PLAN.escape]) {
    g.add(mesh(new THREE.CylinderGeometry(1.02, 1.08, th, 24), mat, p.x, y, p.y));
    const j = jewel(); j.position.set(p.x, y + th / 2 + 0.02, p.y); g.add(j);
  }
  // feet + screws at the two ends
  for (const f of TRAIN_BRIDGE_FEET) {
    g.add(mesh(new THREE.CylinderGeometry(0.32, 0.36, y, 14), mat, f.x, y / 2, f.y));
    const s = screwHead(metal(COLORS.steel, 0.25, 0.95));
    s.position.set(f.x, y + th / 2 + 0.02, f.y);
    g.add(s);
    const disc = mesh(new THREE.CylinderGeometry(0.55, 0.55, th, 16), mat, f.x, y, f.y);
    g.add(disc);
  }
  // connect feet to arms
  const c1 = bridgeArm(TRAIN_BRIDGE_FEET[0], PLAN.third, 1.1, th, mat, 0.6); c1.position.y = y; g.add(c1);
  const c2 = bridgeArm(TRAIN_BRIDGE_FEET[1], PLAN.escape, 1.1, th, mat, 0.6); c2.position.y = y; g.add(c2);
  return g;
}

// ---- escapement contact geometry -------------------------------------------
// The stones straddle the escape wheel at ±30° about the line of centers
// (2.5 tooth spans of a 15-tooth wheel — the classic Swiss lever numbers).
// Teeth march toward increasing world angle (the sim turns the wheel with
// rotation.y decreasing), so the −30° stone is the ENTRY stone. Each locked
// rest parks a tooth tip against a stone's side face; the fork's rock
// amplitude is derived from how far the stone must swing between "tip
// overlaps me by lockDepth" and "tips clear me by unlockClear".
const ESC_TIP_R = 1.7;
const STONE = { len: 0.5, width: 0.14, height: 0.2 };
const LOCK_DEPTH = 0.10, UNLOCK_CLEAR = 0.04;
export const ESCAPEMENT = (() => {
  const E = PLAN.escape, P = PLAN.pallet;
  const psi = Math.atan2(P.y - E.y, P.x - E.x); // escape → pallet
  const span = Math.PI / 6; // ±30°
  const rRest = ESC_TIP_R + (UNLOCK_CLEAR - LOCK_DEPTH) / 2 + STONE.len / 2; // stone center at fork angle 0
  const stones = [-1, 1].map((side) => {
    const dir = psi + side * span;
    const world = new THREE.Vector2(E.x + Math.cos(dir) * rRest, E.y + Math.sin(dir) * rRest);
    const local = world.clone().sub(P);
    return { side, dir, world, local };
  });
  // rock amplitude: radial swing needed / (arm length × how radial the swing is)
  const s0 = stones[0];
  const perp = new THREE.Vector2(s0.local.y, -s0.local.x).normalize(); // motion per +rad of fork
  const radial = Math.abs(perp.dot(new THREE.Vector2(Math.cos(s0.dir), Math.sin(s0.dir))));
  const rockAmp = (LOCK_DEPTH + UNLOCK_CLEAR) / 2 / (s0.local.length() * radial);
  // does +rock press the entry stone toward the wheel? (entry = −30° side)
  const swung = s0.local.clone().rotateAround(new THREE.Vector2(0, 0), -rockAmp); // rotation.y=+a turns plan vectors by −a
  const lockSign = swung.add(P).sub(E).length() < rRest ? 1 : -1;
  // where a tooth TIP rests at lock: against the stone's −angle side face
  const contactOffset = (STONE.width / 2) / ESC_TIP_R + 0.006;
  return { psi, stones, rockAmp, lockSign, entryContact: stones[0].dir - contactOffset };
})();

function buildPalletFork() {
  const g = new THREE.Group(); // origin at pallet pivot
  const mat = metal(COLORS.pallet, 0.3, 0.85);
  const y = 2.62; // works in the escape wheel's plane (2.53–2.67), top of train
  const toBalance = new THREE.Vector2().subVectors(PLAN.balance, PLAN.pallet);

  // anchor arms: one per stone, reaching from the pivot to just short of it
  for (const st of ESCAPEMENT.stones) {
    const len = st.local.length();
    const arm = new THREE.Mesh(createRoundedPlateGeometry(0.32, len - 0.1, 0.15, 0.15), mat);
    arm.position.set(st.local.x * 0.45, y, st.local.y * 0.45);
    arm.rotation.y = Math.atan2(st.local.x, st.local.y);
    g.add(arm);
    // ruby stone: long axis radial to the escape wheel, slight draw tilt
    const stone = new THREE.Mesh(new THREE.BoxGeometry(STONE.width, STONE.height, STONE.len), rubyMat);
    stone.position.set(st.local.x, 2.6, st.local.y);
    stone.rotation.y = Math.PI / 2 - st.dir + st.side * 0.1;
    g.add(stone);
  }

  const arm2 = new THREE.Mesh(createRoundedPlateGeometry(0.4, 1.8, 0.15, 0.2), mat);
  arm2.position.set(toBalance.x * 0.42, y, toBalance.y * 0.42);
  arm2.rotation.y = Math.atan2(toBalance.x, toBalance.y);
  g.add(arm2);

  // Fork slot at the impulse-pin circle: the notch center sits exactly where
  // the balance's ruby pin crosses (balance distance − pin radius), so the
  // pin passes between the horns at every zero-crossing — which is the same
  // instant the fork flips sides. Horns ride BELOW the roller table (2.79).
  const notchDist = toBalance.length() - 0.26;
  const balDir = toBalance.clone().normalize();
  const perp = new THREE.Vector2(-balDir.y, balDir.x);
  const hornY = 2.665; // tops at 2.74, under the roller's 2.79
  for (const side of [-1, 1]) {
    const horn = mesh(new THREE.BoxGeometry(0.1, 0.15, 0.34), mat,
      balDir.x * (notchDist + 0.03) + perp.x * side * 0.135, hornY,
      balDir.y * (notchDist + 0.03) + perp.y * side * 0.135);
    horn.rotation.y = Math.atan2(toBalance.x, toBalance.y);
    g.add(horn);
  }
  // guard pin on the centerline, just behind the notch
  g.add(mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.24, 8),
    metal(COLORS.steel, 0.28, 0.92), balDir.x * (notchDist - 0.14), 2.71, balDir.y * (notchDist - 0.14)));

  // arbor from the plate jewel up into its own low cock — the cock stays a
  // thin flat plate because the balance rim (bottom 2.93) swings right over it
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.68, 12), metal(COLORS.steel, 0.28, 0.92), 0, 1.36, 0));
  const bridge = new THREE.Mesh(createRoundedPlateGeometry(0.7, 1.5, 0.14, 0.3), mat);
  bridge.position.y = 2.76;
  bridge.rotation.y = Math.atan2(PLAN.escape.x - PLAN.pallet.x, PLAN.escape.y - PLAN.pallet.y) + Math.PI / 2;
  g.add(bridge);
  const j = jewel(0.11, 0.035); j.position.set(0, 2.85, 0); g.add(j);
  g.userData.rockAmp = ESCAPEMENT.rockAmp;
  g.userData.lockSign = ESCAPEMENT.lockSign;
  return g;
}

function buildBalanceAssembly() {
  const g = new THREE.Group(); // origin at balance pivot on plate

  // oscillating sub-group (wheel + hairspring + roller) — the balance rides
  // ABOVE the whole train (rim bottom 2.93 over the 2.9 bridge plane)
  const osc = new THREE.Group();
  const wheelMat = metal(COLORS.balance, 0.25, 0.9);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.22, 12, 48), wheelMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 3.15;
  osc.add(rim);
  for (const a of [0, Math.PI / 2]) {
    const arm = mesh(new THREE.BoxGeometry(4.1, 0.1, 0.34), wheelMat, 0, 3.15, 0);
    arm.rotation.y = a;
    osc.add(arm);
  }
  // timing screws on the rim
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8),
      metal(0xd9b45a, 0.3, 0.9), Math.cos(a) * 2.42, 3.15, Math.sin(a) * 2.42);
    s.rotation.z = Math.PI / 2;
    s.rotation.y = -a;
    osc.add(s);
  }
  const staffMat = metal(COLORS.steel, 0.25, 0.95);
  osc.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.76, 16), staffMat, 0, 1.9, 0));
  const roller = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 24), staffMat, 0, 2.85, 0);
  osc.add(roller);
  // The impulse pin hangs DOWN from the roller's edge into the fork-notch
  // plane, mounted so that at rest (rotation 0 — every zero-crossing) it
  // points exactly at the fork slot. That's the instant the fork flips, so
  // pin and notch meet the way the real pair does.
  const toFork = new THREE.Vector2().subVectors(PLAN.pallet, PLAN.balance).normalize();
  const impulse = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.27, 10), rubyMat);
  impulse.position.set(toFork.x * 0.26, 2.8, toFork.y * 0.26);
  osc.add(impulse);
  // hairspring (blued steel)
  const hs = new THREE.Mesh(createSpiralGeometry({
    turns: 5, innerR: 0.28, outerR: 1.55, bandHeight: 0.1, bandThickness: 0.035,
    segmentsPerTurn: 30,
  }), metal(COLORS.mainspring, 0.3, 0.8));
  hs.position.y = 3.6;
  osc.add(hs);
  g.add(osc);
  g.userData.osc = osc;
  g.userData.hairspring = hs;

  // balance cock (bridge arm anchored toward the plate edge)
  const cockMat = metal(COLORS.bridge, 0.34, 0.9);
  const outward = PLAN.balance.clone().normalize();
  const foot = outward.clone().multiplyScalar(2.5);
  const cockY = 3.95;
  const arm = new THREE.Mesh(createRoundedPlateGeometry(1.05, 2.9, 0.2, 0.5), cockMat);
  arm.position.set(foot.x / 2, cockY, foot.y / 2);
  arm.rotation.y = Math.atan2(outward.x, outward.y);
  g.add(arm);
  g.add(mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.2, 24), cockMat, 0, cockY, 0));
  // shock jewel cap
  const capRing = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.09, 8, 20), cockMat);
  capRing.rotation.x = Math.PI / 2;
  capRing.position.y = cockY + 0.14;
  g.add(capRing);
  const j = jewel(0.17, 0.08); j.position.y = cockY + 0.14; g.add(j);
  // foot post down to the plate + screw
  g.add(mesh(new THREE.CylinderGeometry(0.32, 0.38, cockY, 14), cockMat, foot.x, cockY / 2, foot.y));
  const s = screwHead(metal(COLORS.steel, 0.25, 0.95));
  s.position.set(foot.x, cockY + 0.12, foot.y);
  g.add(s);
  return g;
}

// ---- click system: barrel bridge, ratchet wheel, click, crown wheel --------
// These live on top of the barrel: the ratchet screws onto the barrel arbor's
// square, the crown wheel winds the ratchet, and the click stops it unwinding.

// Barrel-bridge feet, exported for the screw service points. The second foot
// must stand clear of the center wheel's sweep (it used to sit inside it and
// the spokes carved through it once an hour).
export const BARREL_BRIDGE_FEET = [
  new THREE.Vector2(-2.3, -2.0),
  new THREE.Vector2(1.9, -2.4),
];

function buildBarrelBridge() {
  const g = new THREE.Group(); // origin at the BARREL position
  const mat = metal(COLORS.barrelbridge, 0.36, 0.88);
  const y = 2.32, th = 0.24;
  const crownLocal = new THREE.Vector2().subVectors(PLAN.crownWheel, PLAN.barrel);

  // main plate: disc over the barrel + arm out to the crown-wheel seat
  const disc = mesh(new THREE.CylinderGeometry(3.05, 3.15, th, 40), mat, 0, y, 0);
  g.add(disc);
  const arm = bridgeArm(new THREE.Vector2(0, 0), crownLocal, 2.6, th, mat);
  arm.position.y = y;
  g.add(arm);
  g.add(mesh(new THREE.CylinderGeometry(1.75, 1.8, th, 28), mat, crownLocal.x, y, crownLocal.y));

  // arbor bore: a bushing ring the barrel arbor's square genuinely rises
  // through (the arbor is a real separate piece that turns during winding)
  const bore = new THREE.Mesh(createLatheRing(
    [[0.24, -0.02], [0.42, -0.02], [0.42, th + 0.04], [0.24, th + 0.04]], 20), metal(0x6b5636, 0.5, 0.6));
  bore.position.y = y - th / 2;
  g.add(bore);

  // feet + screw heads at the two service points
  for (const f of BARREL_BRIDGE_FEET) {
    g.add(mesh(new THREE.CylinderGeometry(0.32, 0.38, y, 14), mat, f.x, y / 2, f.y));
    g.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, th, 16), mat, f.x, y, f.y));
  }
  return g;
}

function buildRatchetWheel() {
  const g = new THREE.Group();
  const rd = gearDims(PITCH.ratchet, TEETH.ratchet);
  // saw-leaning teeth (lean +1): the long slope leads while winding, so the
  // click's pawl skates over it; the steep face trails and butts the pawl
  // the instant the spring tries to unwind. Sits 2.48+, clear of the bridge.
  const w = new THREE.Mesh(createGearGeometry({
    teeth: TEETH.ratchet, tipR: rd.tipR, rootR: rd.rootR, thickness: 0.16, holeR: 0.26, lean: 1,
  }), brushedMetal(COLORS.ratchet, 0.3, 0.9, rd.tipR));
  w.position.y = 2.56;
  tagGear(w, TEETH.ratchet, PITCH.ratchet, 0.275 + 0.13);
  g.add(w);
  // engraved circle + square boss that mates with the barrel arbor
  g.add(mesh(new THREE.TorusGeometry(1.5, 0.02, 6, 40).rotateX(Math.PI / 2),
    metal(0xb87718, 0.5, 0.6), 0, 2.65, 0));
  const boss = mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), metal(COLORS.steel, 0.3, 0.9), 0, 2.66, 0);
  g.add(boss);
  return g;
}

// Where the click's pawl tip rests: just inside the ratchet's tooth band,
// along the pivot→ratchet line. The ratchet is phase-rotated at build time so
// a tooth gap centers exactly here; the pawl genuinely sits between teeth.
export const CLICK_CONTACT = (() => {
  const toRatchet = new THREE.Vector2().subVectors(PLAN.barrel, PLAN.click);
  const rd = gearDims(PITCH.ratchet, TEETH.ratchet);
  const rTip = (rd.tipR + rd.rootR) / 2 - 0.02; // tip of the pawl, radially
  const world = at(PLAN.barrel, toRatchet.clone().normalize().negate(), rTip);
  return { world, dirFromRatchet: Math.atan2(world.y - PLAN.barrel.y, world.x - PLAN.barrel.x) };
})();

function buildClick() {
  const g = new THREE.Group(); // origin at the click pivot
  const mat = metal(COLORS.click, 0.32, 0.85);
  const y = 2.74; // the lever rides ABOVE the ratchet teeth (they top out 2.64)
  // the pawl reaches from the pivot to its rest point IN the ratchet teeth
  const aim = CLICK_CONTACT.world.clone().sub(PLAN.click);
  const reach = aim.length();
  const beak = new THREE.Mesh(createRoundedPlateGeometry(0.24, reach + 0.24, 0.14, 0.11), mat);
  beak.position.set(aim.x * 0.5, y, aim.y * 0.5);
  beak.rotation.y = Math.atan2(aim.x, aim.y);
  g.add(beak);
  // only the tooth-catching tip dips down into the tooth band's plane
  const tip = mesh(new THREE.BoxGeometry(0.12, 0.24, 0.26), mat, aim.x, 2.6, aim.y);
  tip.rotation.y = Math.atan2(aim.x, aim.y) + 0.35; // angled like a pawl, not radial
  g.add(tip);
  // pivot post grounds on the barrel bridge top (2.44), not in mid-air
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.5, 12), mat, 0, 2.68, 0));
  // click spring: a springy strip pressing on the lever's tail, running up
  // the clear wedge between the ratchet and crown rims (never over either)
  const springMat = metal(COLORS.steel, 0.28, 0.92);
  const away = aim.clone().normalize().negate(); // away from the ratchet
  const crownDir = new THREE.Vector2().subVectors(PLAN.crownWheel, PLAN.click).normalize();
  const wedge = away.clone().sub(crownDir).normalize(); // between the two rims
  const sy = 2.7;
  const s1 = mesh(new THREE.BoxGeometry(0.55, 0.08, 0.08), springMat, wedge.x * 0.3, sy, wedge.y * 0.3);
  s1.rotation.y = Math.atan2(-wedge.y, wedge.x);
  const s2 = mesh(new THREE.BoxGeometry(0.32, 0.08, 0.08), springMat, wedge.x * 0.62, sy, wedge.y * 0.62);
  s2.rotation.y = Math.atan2(-wedge.y, wedge.x) + 0.5;
  g.add(s1, s2);
  return g;
}

function buildCrownWheel() {
  const g = new THREE.Group();
  const mat = metal(COLORS.crownwheel, 0.28, 0.9);
  const cd = gearDims(P_CROWN, TEETH.crown);
  // module-matched to the ratchet it winds — same tooth spacing at the mesh
  const w = new THREE.Mesh(createGearGeometry({
    teeth: TEETH.crown, tipR: cd.tipR, rootR: cd.rootR, thickness: 0.18, holeR: 0.22,
  }), brushedMetal(COLORS.crownwheel, 0.28, 0.9, cd.tipR));
  w.position.y = 2.56;
  tagGear(w, TEETH.crown, P_CROWN);
  g.add(w);
  g.add(mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.1, 18), mat, 0, 2.68, 0));
  return g;
}

// ---- motion works (dial side): cannon pinion, minute wheel, hour wheel -----

function buildCannonPinion() {
  const g = new THREE.Group(); // origin at dial center, y 0 = movement top
  const mat = metal(COLORS.cannon, 0.28, 0.9);
  // driving wheel meshing the minute wheel (1:3 — first half of the 12:1)
  const cd = gearDims(MOTION_PITCH.cannon, TEETH.cannon);
  const w = new THREE.Mesh(createGearGeometry({
    teeth: TEETH.cannon, tipR: cd.tipR, rootR: cd.rootR, thickness: 0.12, holeR: 0.16,
  }), mat);
  w.position.y = 0.06;
  tagGear(w, TEETH.cannon, MOTION_PITCH.cannon);
  g.add(w);
  // the cannon: a friction-fit tube the minute hand will ride, tall enough
  // to poke through the dial's center hole
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.62, 24), mat, 0, 0.38, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.16, 16), metal(COLORS.steel, 0.25, 0.95), 0, 0.75, 0));
  return g;
}

function buildMinuteWheel() {
  const g = new THREE.Group();
  const mat = metal(COLORS.minutewheel, 0.3, 0.88);
  const wd = gearDims(MOTION_PITCH.minuteWheel, TEETH.minuteWheel);
  const w = new THREE.Mesh(createGearGeometry({
    teeth: TEETH.minuteWheel, tipR: wd.tipR, rootR: wd.rootR, thickness: 0.12, holeR: 0.1, spokes: 3, spokeInnerR: 0.35, spokeOuterR: 1.45,
  }), brushedMetal(COLORS.minutewheel, 0.3, 0.88, wd.tipR));
  w.position.y = 0.06;
  tagGear(w, TEETH.minuteWheel, MOTION_PITCH.minuteWheel);
  g.add(w);
  const pd = gearDims(MOTION_PITCH.minutePinion, TEETH.minutePinion);
  const p = new THREE.Mesh(createGearGeometry({
    teeth: TEETH.minutePinion, tipR: pd.tipR, rootR: pd.rootR, thickness: 0.16, holeR: 0.08,
  }), mat);
  p.position.y = 0.2;
  tagGear(p, TEETH.minutePinion, MOTION_PITCH.minutePinion);
  g.add(p);
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 10), metal(COLORS.steel, 0.25, 0.95), 0, 0.17, 0));
  return g;
}

function buildHourWheel() {
  const g = new THREE.Group(); // origin at dial center; rides loosely on the cannon
  const mat = metal(COLORS.hourwheel, 0.3, 0.88);
  const hd = gearDims(MOTION_PITCH.hourWheel, TEETH.hourWheel);
  const w = new THREE.Mesh(createGearGeometry({
    teeth: TEETH.hourWheel, tipR: hd.tipR, rootR: hd.rootR, thickness: 0.12, holeR: 0.3, spokes: 4, spokeInnerR: 0.5, spokeOuterR: 1.5,
  }), brushedMetal(COLORS.hourwheel, 0.3, 0.88, hd.tipR));
  w.position.y = 0.06;
  tagGear(w, TEETH.hourWheel, MOTION_PITCH.hourWheel);
  g.add(w);
  // the pipe the hour hand rides — hollow, sleeved over the cannon, reaching
  // just proud of the dial face so the hand visibly presses onto it
  g.add(new THREE.Mesh(createLatheRing([[0.26, 0.1], [0.34, 0.1], [0.34, 0.5], [0.26, 0.5]], 16), mat));
  return g;
}

// ---- automatic winding (movement side, assembled on the running watch) ----

function buildReversers() {
  const g = new THREE.Group(); // origin at its plan spot, over the train bridge
  const plate = metal(0x9a8a6a, 0.4, 0.8);
  const y = 3.3; // over the raised train bridge (top 3.03)
  const arm = new THREE.Mesh(createRoundedPlateGeometry(1.3, 3.4, 0.14, 0.5), plate);
  arm.position.y = y;
  arm.rotation.y = 0.6;
  g.add(arm);
  // The two reverser units genuinely MESH each other (that's how one pair
  // reverses the other's direction): pitch radius = half their spacing, so
  // the yellow wheels roll tooth-into-gap. The sim counter-rotates them off
  // the rotor's sway; each blue clutch wheel rides its yellow.
  const spots = [[-0.85, -0.6], [0.85, 0.6]];
  const pYellow = Math.hypot(spots[1][0] - spots[0][0], spots[1][1] - spots[0][1]) / 2;
  const yd = gearDims(pYellow, 22);
  g.userData.units = [];
  for (const [dx, dz] of spots) {
    const unit = new THREE.Group();
    unit.position.set(dx, 0, dz);
    const yellow = new THREE.Mesh(createGearGeometry({
      teeth: 22, tipR: yd.tipR, rootR: yd.rootR, thickness: 0.12, holeR: 0.12,
    }), metal(COLORS.reversers, 0.3, 0.9));
    yellow.position.y = y + 0.12;
    tagGear(yellow, 22, pYellow);
    unit.add(yellow);
    const blue = new THREE.Mesh(createGearGeometry({
      teeth: 16, tipR: 0.68, rootR: 0.56, thickness: 0.1, holeR: 0.1,
    }), metal(0x4a7fd6, 0.3, 0.9));
    blue.position.y = y + 0.24;
    unit.add(blue);
    g.add(unit);
    g.userData.units.push(unit);
  }
  alignGearMesh(
    g.userData.units[1].children[0], new THREE.Vector2(spots[1][0], spots[1][1]),
    g.userData.units[0].children[0], new THREE.Vector2(spots[0][0], spots[0][1])
  );
  return g;
}

function buildRotor() {
  const g = new THREE.Group(); // origin at the movement center
  const body = metal(COLORS.rotor, 0.35, 0.85);
  const y = 4.3; // swings over the balance cock (screw tops ~4.11)
  // half-moon weight: half annulus, heavier rim at the outer edge
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 6.9, 0, Math.PI, false);
  shape.absarc(0, 0, 2.0, Math.PI, 0, true);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.16, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03,
    bevelSegments: 1, curveSegments: 40,
  });
  geo.rotateX(Math.PI / 2);
  const disc = new THREE.Mesh(geo, brushedMetal(COLORS.rotor, 0.35, 0.85, 6.9));
  disc.position.y = y + 0.16;
  g.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(6.55, 0.24, 8, 40, Math.PI),
    metal(0x4d4160, 0.3, 0.9));
  rim.rotation.x = Math.PI / 2;
  rim.position.y = y + 0.1;
  g.add(rim);
  // hub + engraving groove
  g.add(mesh(new THREE.CylinderGeometry(1.0, 1.1, 0.24, 24), body, 0, y + 0.1, 0));
  g.add(mesh(new THREE.TorusGeometry(4.4, 0.025, 6, 48, Math.PI).rotateX(Math.PI / 2),
    metal(0x4d4160, 0.5, 0.6), 0, y + 0.2, 0));
  return g;
}

// ---- tooth-phase alignment --------------------------------------------------
// Rotates gear mesh B about its own axis so its teeth interleave gear A's at
// the line joining their centers. For a tagged gear (userData.gear), the
// fractional tooth index pointing along world angle `ang` is
//   phase = ((−ang − rotY)/step − tc) mod 1     (0 ⇒ a tooth center on `ang`)
// and for two meshed gears phaseA(→B) + phaseB(→A) is invariant while they
// roll at the true tooth ratio — so baking it to 0.5 (tooth-on-gap) once
// keeps every mesh clean forever, static or running.
function gearPhase(gearMesh, ang) {
  const { teeth, tc } = gearMesh.userData.gear;
  const step = (Math.PI * 2) / teeth;
  const ph = (-ang - gearMesh.rotation.y) / step - tc;
  return ((ph % 1) + 1) % 1;
}
function alignGearMesh(meshB, posB, meshA, posA) {
  const angAB = Math.atan2(posB.y - posA.y, posB.x - posA.x); // A → B
  const angBA = angAB + Math.PI;
  const phaseA = gearPhase(meshA, angAB);
  const want = 0.5 - phaseA; // phaseB target (mod 1)
  const { teeth, tc } = meshB.userData.gear;
  const step = (Math.PI * 2) / teeth;
  const cur = (-angBA - meshB.rotation.y) / step - tc;
  let delta = (want - cur) % 1;
  if (delta > 0.5) delta -= 1;
  if (delta < -0.5) delta += 1;
  meshB.rotation.y -= delta * step; // phase grows as rotY shrinks
}

// ---- date mechanism (dial side) --------------------------------------------

// The date ring's tooth band lives at r 5.68–5.85, world y 0.39–0.47 (its
// 0.33 dial offset + local heights). Both date parts reach INTO that band:
// contact tips at r ≈ 5.75, raised on posts to y-local ≈ 0.40.
const RING_CONTACT_R = 5.75;

function buildDateJumper() {
  const g = new THREE.Group();
  const mat = metal(COLORS.datejumper, 0.32, 0.85);
  const pos = KEYLESS.datejumper;
  const inward = pos.clone().normalize().negate(); // toward the ring center
  const plate = new THREE.Mesh(createRoundedPlateGeometry(1.4, 2.0, 0.12, 0.4), mat);
  plate.position.y = 0.06;
  plate.rotation.y = Math.atan2(inward.x, inward.y) + 0.5;
  g.add(plate);
  // the springy finger that snaps the ring tooth-to-tooth: it rises off the
  // plate and its beak rests IN a tooth gap of the ring
  const steelM = metal(COLORS.steel, 0.3, 0.9);
  const reach = pos.length() - RING_CONTACT_R; // how far inward the beak tip sits
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.3, 8), steelM, inward.x * -0.35, 0.2, inward.y * -0.35));
  const springLen = reach + 0.55;
  const s1 = mesh(new THREE.BoxGeometry(0.09, 0.07, springLen), steelM,
    inward.x * (reach - springLen / 2), 0.36, inward.y * (reach - springLen / 2));
  s1.rotation.y = Math.atan2(inward.x, inward.y);
  g.add(s1);
  const tip = mesh(new THREE.ConeGeometry(0.1, 0.26, 6), steelM, inward.x * reach, 0.36, inward.y * reach);
  tip.rotation.x = Math.PI / 2;
  tip.rotation.z = Math.atan2(inward.x, inward.y) + Math.PI;
  g.add(tip);
  return g;
}

function buildDateIndicator() {
  const g = new THREE.Group();
  const mat = metal(COLORS.dateindicator, 0.32, 0.85);
  const pos = KEYLESS.dateindicator;
  const outward = pos.clone().normalize(); // toward the ring teeth
  const gear = new THREE.Mesh(createGearGeometry({ teeth: 20, tipR: 0.85, rootR: 0.72, thickness: 0.1, holeR: 0.1 }), mat);
  gear.position.y = 0.06;
  g.add(gear);
  // domed cover hiding the little torsion spring, with the post that lifts
  // the drive finger up into the ring's tooth plane
  g.add(mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.12, 18), mat, 0, 0.17, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.11, 0.18, 10), metal(COLORS.steel, 0.3, 0.9), 0, 0.29, 0));
  // the once-a-day drive finger: its tip lands between two ring teeth (the
  // ring is phase-baked to put a gap exactly here)
  const reach = RING_CONTACT_R - pos.length();
  const fingerLen = reach + 0.3;
  const finger = mesh(new THREE.BoxGeometry(0.12, 0.07, fingerLen), metal(COLORS.steel, 0.3, 0.9),
    outward.x * (reach - fingerLen / 2), 0.36, outward.y * (reach - fingerLen / 2));
  finger.rotation.y = Math.atan2(outward.x, outward.y);
  g.add(finger);
  const tip = mesh(new THREE.ConeGeometry(0.09, 0.24, 6), metal(COLORS.steel, 0.3, 0.9), outward.x * reach, 0.36, outward.y * reach);
  tip.rotation.x = Math.PI / 2;
  tip.rotation.z = Math.atan2(outward.x, outward.y) + Math.PI;
  g.add(tip);
  return g;
}

function drawDateRingTexture() {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.clearRect(0, 0, S, S);
  const cx = S / 2, cy = S / 2;
  ctx.fillStyle = '#f4f1e6';
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.5, 0, Math.PI * 2);
  ctx.arc(cx, cy, S * 0.378, 0, Math.PI * 2, true); // face stops short of the teeth
  ctx.fill();
  ctx.fillStyle = '#241a12';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(S * 0.042)}px "IBM Plex Sans", sans-serif`;
  for (let d = 1; d <= 31; d++) {
    const a = ((d - 1) / 31) * Math.PI * 2 - Math.PI / 2;
    const r = S * 0.43;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    ctx.rotate(a + Math.PI / 2);
    ctx.fillText(String(d), 0, 0);
    ctx.restore();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

function buildDateRing() {
  const g = new THREE.Group(); // origin at dial center
  // inner teeth ring body (kept low so nothing pokes into the dial base)
  const body = new THREE.Mesh(new THREE.CylinderGeometry(7.95, 7.95, 0.1, 64, 1, true),
    metal(0xd9d2bd, 0.5, 0.4));
  body.position.y = 0.05;
  g.add(body);
  // The printed face starts OUTSIDE the tooth band (5.68–5.85), so the teeth
  // — and the two steel tips that rest in them — stay visible from above.
  // It sits LOW (0.10) so the ring slips under the dial base (bottom 0.44
  // with the ring's 0.33 offset) with its numerals right below the window.
  const face = new THREE.Mesh(new THREE.RingGeometry(6.02, 7.95, 64),
    new THREE.MeshStandardMaterial({ map: drawDateRingTexture(), transparent: true, roughness: 0.6, metalness: 0.05 }));
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.1;
  g.userData.faceMesh = face;
  g.add(face);
  // drive teeth: one tooth per day of the month, and the two steel tips that
  // work them (indicator finger, jumper beak) rest in their gaps
  const teeth = new THREE.Mesh(createGearGeometry({ teeth: TEETH.dateRing, tipR: 5.85, rootR: 5.68, thickness: 0.08, holeR: 5.5 }),
    metal(0xd9d2bd, 0.5, 0.4));
  teeth.position.y = 0.04;
  tagGear(teeth, TEETH.dateRing, 5.765);
  g.userData.teethMesh = teeth;
  g.add(teeth);
  return g;
}

// ---- keyless works (dial side, at 3 o'clock) --------------------------------

function buildStem() {
  const g = new THREE.Group(); // origin where the stem crosses the plate edge zone
  const steelM = metal(COLORS.stem, 0.25, 0.95);
  const rodY = STEM_GEOM.rodY;
  // stem rod with a square mid-section
  const rod = mesh(new THREE.CylinderGeometry(0.09, 0.09, 3.6, 16), steelM, 0.3, rodY, 0);
  rod.rotation.z = Math.PI / 2;
  g.add(rod);
  // the bushing the stem passes through at the plate rim — the rod visibly
  // enters the movement instead of ending in air (plate rim is 1.4 out from
  // the stem's plan position)
  const bushing = mesh(new THREE.CylinderGeometry(0.17, 0.17, 0.34, 14),
    metal(COLORS.bridge, 0.34, 0.9), 1.4, rodY, 0);
  bushing.rotation.z = Math.PI / 2;
  g.add(bushing);
  g.add(mesh(new THREE.BoxGeometry(0.75, 0.19, 0.19), steelM, -1.72, rodY, 0));
  // winding pinion: crown-toothed cone facing the sliding pinion
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.15, 0.26, 20), steelM, -1.32, rodY, 0).rotateZ(Math.PI / 2));
  // sliding pinion (the clutch): two toothed cones back-to-back around a
  // waisted neck — the groove the yoke's fork genuinely rides in
  const sp = STEM_GEOM.slidingPinionX;
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.15, 20), steelM, sp - 0.145, rodY, 0).rotateZ(Math.PI / 2));
  g.add(mesh(new THREE.CylinderGeometry(0.115, 0.115, 0.15, 16), steelM, sp, rodY, 0).rotateZ(Math.PI / 2));
  g.add(mesh(new THREE.CylinderGeometry(0.22, 0.15, 0.15, 20), steelM, sp + 0.145, rodY, 0).rotateZ(Math.PI / 2));
  // detent groove: two flanges with the bare rod between — the setting
  // lever's post drops in here and rides the crown's pull clicks
  for (const dx of [-0.075, 0.075]) {
    const flange = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 16), steelM, STEM_GEOM.grooveX + dx, rodY, 0);
    flange.rotation.z = Math.PI / 2;
    g.add(flange);
  }
  // the crown, knurled, sitting proud of the case edge
  const gold = metal(0xd8b978, 0.28, 0.95);
  const crown = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 24), gold, 2.2, rodY, 0);
  crown.rotation.z = Math.PI / 2;
  g.add(crown);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const k = mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07), gold,
      2.2, rodY + Math.sin(a) * 0.62, Math.cos(a) * 0.62);
    k.rotation.x = -a;
    g.add(k);
  }
  return g;
}

function buildSettingLever() {
  const g = new THREE.Group();
  const mat = metal(COLORS.settinglever, 0.32, 0.85);
  // the post that locks into the stem's detent groove — world (6.55, 0),
  // expressed from this part's plan spot. It's the whole point of the part.
  const groove = new THREE.Vector2(KEYLESS.stem.x + STEM_GEOM.grooveX, 0).sub(KEYLESS.settinglever);
  const gLen = groove.length();
  // main plate stops short of the stem rod; a raised finger carries on OVER
  // the rod (top 0.11) and drops the post into the groove from above —
  // exactly how a real setting lever rides the stem
  const lever = new THREE.Mesh(createRoundedPlateGeometry(0.8, gLen - 0.15, 0.12, 0.3), mat);
  lever.position.set(groove.x * 0.42, 0.06, groove.y * 0.42);
  lever.rotation.y = Math.atan2(groove.x, groove.y);
  g.add(lever);
  const finger = new THREE.Mesh(createRoundedPlateGeometry(0.32, 0.75, 0.1, 0.12), mat);
  finger.position.set(groove.x * 0.85, 0.17, groove.y * 0.85);
  finger.rotation.y = Math.atan2(groove.x, groove.y);
  g.add(finger);
  // slim steel post, sized to drop between the groove's flanges
  g.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.24, 10), metal(COLORS.steel, 0.3, 0.9), groove.x, 0.1, groove.y));
  // pivot boss at the part origin + corrector lever angled away
  g.add(mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.18, 12), mat, 0, 0.1, 0));
  const corr = new THREE.Mesh(createRoundedPlateGeometry(0.5, 2.0, 0.1, 0.22), mat);
  corr.position.set(-1.0, 0.05, 0.9);
  corr.rotation.y = 0.5;
  g.add(corr);
  return g;
}

function buildYoke() {
  const g = new THREE.Group();
  const mat = metal(COLORS.yoke, 0.32, 0.85);
  // The yoke's whole job: its tongue rides IN the sliding pinion's waist
  // groove (world 6.15,0 — see STEM_GEOM) and shoves the clutch between
  // winding and setting. The tongue is thinner than the groove (0.12 vs
  // 0.15), sits at rod height, and its tip stops 0.005 off the neck — the
  // groove's two walls bear on its faces, which is the real mechanism.
  const pinion = new THREE.Vector2(KEYLESS.stem.x + STEM_GEOM.slidingPinionX, 0).sub(KEYLESS.yoke);
  const tongueBase = new THREE.Vector2(pinion.x, pinion.y - 0.31);
  const a1 = new THREE.Mesh(createRoundedPlateGeometry(0.42, tongueBase.length() - 0.1, 0.1, 0.2), mat);
  a1.position.set(tongueBase.x * 0.42, 0.1, tongueBase.y * 0.42);
  a1.rotation.y = Math.atan2(tongueBase.x, tongueBase.y);
  g.add(a1);
  // tongue: reaches from the arm into the groove, kissing the neck (r .115)
  const tongue = mesh(new THREE.BoxGeometry(0.12, 0.14, 0.38), mat,
    pinion.x, -0.08, pinion.y - 0.31);
  g.add(tongue);
  // step joining the raised arm down to the rod-height tongue
  g.add(mesh(new THREE.BoxGeometry(0.3, 0.22, 0.16), mat, pinion.x, 0.02, pinion.y - 0.52));
  // tail arm toward the setting lever's push point
  const a2 = new THREE.Mesh(createRoundedPlateGeometry(0.42, 1.6, 0.1, 0.2), mat);
  a2.position.set(-1.15, 0.1, 0.35);
  a2.rotation.y = 1.9;
  g.add(a2);
  // setting wheel on its post, tucked against the sliding pinion's dial-side
  // cone — the gear the clutch drives in time-setting position
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.12, 0.2, 12), metal(COLORS.steel, 0.3, 0.9), pinion.x - 0.15, 0.02, pinion.y - 0.62));
  const wheel = new THREE.Mesh(createGearGeometry({ teeth: 16, tipR: 0.62, rootR: 0.5, thickness: 0.1, holeR: 0.08 }),
    metal(COLORS.steel, 0.3, 0.9));
  wheel.position.set(pinion.x - 0.15, 0.03, pinion.y - 0.62);
  g.add(wheel);
  return g;
}

function buildLeverJumper() {
  const g = new THREE.Group();
  const mat = metal(COLORS.jumper, 0.34, 0.85);
  // plate with springy arms that give the crown its three click-stops
  const plate = new THREE.Mesh(createRoundedPlateGeometry(1.7, 2.5, 0.12, 0.5), mat);
  plate.position.y = 0.16;
  plate.rotation.y = -0.3;
  g.add(plate);
  // detent arm: its tip presses ON the setting lever's groove post (world
  // 6.55, 0) — that spring-on-post contact IS the crown's three click-stops
  const post = new THREE.Vector2(KEYLESS.stem.x + STEM_GEOM.grooveX, 0).sub(KEYLESS.jumper);
  const f1 = new THREE.Mesh(createRoundedPlateGeometry(0.26, post.length() + 0.3, 0.1, 0.13), mat);
  f1.position.set(post.x * 0.44, 0.16, post.y * 0.44);
  f1.rotation.y = Math.atan2(post.x, post.y);
  g.add(f1);
  const f2 = new THREE.Mesh(createRoundedPlateGeometry(0.3, 1.6, 0.1, 0.14), mat);
  f2.position.set(-0.9, 0.16, 1.0);
  f2.rotation.y = -1.1;
  g.add(f2);
  return g;
}

// Perlage: the overlapping circular-graining finish real plates get, plus
// machined recess rings at every pivot from the PLAN and an engraved caliber
// mark. Drawn once; the plate top wears it as its color map.
function drawPlateTexture(rotateForCap = true) {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const cx = S / 2, cy = S / 2, R = S / 2;
  const pxu = R / PLAN.plateR; // px per world unit

  // CylinderGeometry's top cap maps u ← world z and v ← world x (a 90°
  // transpose, verified on-screen). Drawing in natural plan space and then
  // rotating the whole canvas -90° about center lands every PLAN position
  // and glyph the right way up in world space. The terrace deck uses plain
  // planar UVs instead (u ← x, v ← −z), so it skips the rotation.
  if (rotateForCap) {
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 2);
    ctx.translate(-cx, -cy);
  }

  // champagne-rhodium ground
  const ground = ctx.createRadialGradient(cx - R * 0.2, cy - R * 0.2, R * 0.1, cx, cy, R);
  ground.addColorStop(0, '#d6d3c9');
  ground.addColorStop(0.7, '#c1beb5');
  ground.addColorStop(1, '#a6a198');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, S, S);

  // perlage: rows of overlapping circular swirls, offset every other row
  const step = S / 17;
  for (let row = 0; row < 19; row++) {
    for (let col = 0; col < 19; col++) {
      const px = col * step + (row % 2 ? step / 2 : 0);
      const py = row * step;
      const grain = ctx.createRadialGradient(px - step * 0.15, py - step * 0.15, step * 0.04, px, py, step * 0.58);
      grain.addColorStop(0, 'rgba(255, 253, 244, 0.11)');
      grain.addColorStop(0.6, 'rgba(190, 184, 168, 0.05)');
      grain.addColorStop(1, 'rgba(115, 108, 94, 0.11)');
      ctx.fillStyle = grain;
      ctx.beginPath();
      ctx.arc(px, py, step * 0.58, 0, Math.PI * 2);
      ctx.fill();
      // each swirl is a stack of faint concentric cutter rings
      ctx.strokeStyle = 'rgba(110, 102, 86, 0.075)';
      ctx.lineWidth = 1;
      for (const rr of [0.55, 0.38, 0.22]) {
        ctx.beginPath();
        ctx.arc(px, py, step * rr, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // machined recesses where the work happens: barrel pocket + train pockets
  const pocket = (key, r) => {
    const p = PLAN[key];
    const px = cx + p.x * pxu, py = cy + p.y * pxu;
    const rp = r * pxu;
    const rec = ctx.createRadialGradient(px, py, rp * 0.5, px, py, rp);
    rec.addColorStop(0, 'rgba(60, 54, 44, 0.05)');
    rec.addColorStop(0.85, 'rgba(60, 54, 44, 0.09)');
    rec.addColorStop(1, 'rgba(30, 26, 20, 0.22)');
    ctx.fillStyle = rec;
    ctx.beginPath();
    ctx.arc(px, py, rp, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 252, 240, 0.22)'; // catch-light on the cut edge
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(px, py, rp + 1.5, 0, Math.PI * 2);
    ctx.stroke();
  };
  pocket('barrel', 3.45);
  pocket('center', 1.15);
  pocket('third', 0.95);
  pocket('fourth', 0.9);
  pocket('escape', 0.85);
  pocket('pallet', 0.8);
  pocket('balance', 2.5);

  // engraved caliber mark, curved along the lower rim
  ctx.fillStyle = 'rgba(90, 82, 68, 0.85)';
  ctx.font = `500 ${Math.round(S * 0.026)}px "IBM Plex Mono", monospace`;
  ctx.textAlign = 'center';
  const arcR = R * 0.88;
  const label = 'MW CAL. 001 · 17 JEWELS';
  const arcSpan = 0.62;
  for (let i = 0; i < label.length; i++) {
    // bottom-arc text reads left→right only when the angle DECREASES
    const a = Math.PI / 2 + arcSpan / 2 - (i / (label.length - 1)) * arcSpan;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * arcR, cy + Math.sin(a) * arcR);
    ctx.rotate(a - Math.PI / 2);
    ctx.fillText(label[i], 0, 0);
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// Dial-side finish for the plate's underside — the face the player watches
// through the whole dial phase after the flip. Circular graining only, so it
// is rotation-proof (that cap's UV orientation flips with the movement).
function drawDialSideTexture() {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const cx = S / 2, cy = S / 2, R = S / 2;
  const ground = ctx.createRadialGradient(cx, cy, R * 0.1, cx, cy, R);
  ground.addColorStop(0, '#cfccc2');
  ground.addColorStop(0.75, '#bdb9ae');
  ground.addColorStop(1, '#a19c8f');
  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, S, S);
  // fine circular graining
  for (let r = 8; r < R; r += 3.5) {
    ctx.strokeStyle = `rgba(${r % 7 < 3.5 ? '255, 252, 240' : '105, 99, 86'}, ${0.05 + Math.random() * 0.05})`;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // machined step rings: center boss, motion-works field, keyless margin
  for (const [rr, alpha] of [[0.16, 0.5], [0.42, 0.35], [0.8, 0.4]]) {
    ctx.strokeStyle = `rgba(70, 64, 52, ${alpha})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, R * rr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255, 252, 240, 0.3)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, R * rr + 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

// ---- machined plate relief ---------------------------------------------------
// Real main plates are landscapes: a raised deck with circular wells milled
// where each rotating assembly nests. The wells here are the union of the
// wheels' swept circles (+ running clearance), merged into one milled pocket
// where they overlap — computed as a disk-union outline, not hand-drawn.
const DECK_H = 0.18;

function wellCircles() {
  const tip = (id) => gearDims(PITCH[id], TEETH[id]).tipR;
  return [
    { x: PLAN.barrel.x, y: PLAN.barrel.y, r: 3.585 + 0.22 }, // drum + tooth ring
    { x: 0, y: 0, r: tip('center') + 0.16 },
    { x: PLAN.third.x, y: PLAN.third.y, r: tip('third') + 0.16 },
    { x: PLAN.fourth.x, y: PLAN.fourth.y, r: tip('fourth') + 0.16 },
    { x: PLAN.escape.x, y: PLAN.escape.y, r: 1.7 + 0.16 },
    { x: PLAN.pallet.x, y: PLAN.pallet.y, r: 1.5 },
    { x: PLAN.balance.x, y: PLAN.balance.y, r: 2.37 + 0.18 },
  ];
}

// Boundary of a union of disks: for each circle keep the arc angles not
// inside any neighbour, then stitch arcs end-to-end (arc endpoints coincide
// at circle–circle intersections). Assumes one connected blob, no inner voids
// — true for this plan, and cheap to verify by eye.
function diskUnionOutline(circles) {
  const TAU = Math.PI * 2;
  const arcs = [];
  for (let i = 0; i < circles.length; i++) {
    const ci = circles[i];
    const cover = [];
    let swallowed = false;
    for (let j = 0; j < circles.length; j++) {
      if (i === j) continue;
      const cj = circles[j];
      const d = Math.hypot(cj.x - ci.x, cj.y - ci.y);
      if (d + ci.r <= cj.r + 1e-9) { swallowed = true; break; }
      if (d >= ci.r + cj.r) continue;
      const a = Math.atan2(cj.y - ci.y, cj.x - ci.x);
      const half = Math.acos(THREE.MathUtils.clamp((d * d + ci.r * ci.r - cj.r * cj.r) / (2 * d * ci.r), -1, 1));
      cover.push([a - half, a + half]);
    }
    if (swallowed) continue;
    // normalize covered intervals into [0, τ), split wraps, merge
    const norm = [];
    for (let [a0, a1] of cover) {
      a0 = ((a0 % TAU) + TAU) % TAU;
      a1 = ((a1 % TAU) + TAU) % TAU;
      if (a1 < a0) { norm.push([a0, TAU]); norm.push([0, a1]); } else norm.push([a0, a1]);
    }
    norm.sort((p, q) => p[0] - q[0]);
    const merged = [];
    for (const iv of norm) {
      const last = merged[merged.length - 1];
      if (last && iv[0] <= last[1] + 1e-9) last[1] = Math.max(last[1], iv[1]);
      else merged.push([...iv]);
    }
    if (!merged.length) { arcs.push({ c: ci, a0: 0, a1: TAU }); continue; }
    for (let k = 0; k < merged.length; k++) {
      const end = merged[k][1];
      const next = k + 1 < merged.length ? merged[k + 1][0] : merged[0][0] + TAU;
      if (next - end > 1e-5) arcs.push({ c: ci, a0: end, a1: next });
    }
  }
  // stitch into one loop, sampling each arc
  const pt = (arc, a) => [arc.c.x + Math.cos(a) * arc.c.r, arc.c.y + Math.sin(a) * arc.c.r];
  const loop = [];
  let cur = arcs.shift();
  const start = pt(cur, cur.a0);
  for (let guard = 0; guard < 64 && cur; guard++) {
    const n = Math.max(6, Math.ceil((cur.a1 - cur.a0) * cur.c.r * 7));
    for (let s = 0; s < n; s++) loop.push(pt(cur, cur.a0 + ((cur.a1 - cur.a0) * s) / n));
    const end = pt(cur, cur.a1);
    if (!arcs.length || Math.hypot(end[0] - start[0], end[1] - start[1]) < 0.02) break;
    let bi = 0, bd = Infinity;
    for (let k = 0; k < arcs.length; k++) {
      const p = pt(arcs[k], arcs[k].a0);
      const dd = Math.hypot(p[0] - end[0], p[1] - end[1]);
      if (dd < bd) { bd = dd; bi = k; }
    }
    cur = arcs.splice(bi, 1)[0];
  }
  return loop;
}

function buildPlate() {
  const g = new THREE.Group();
  const mat = metal(COLORS.plate, 0.42, 0.75);
  // well floors carry the perlage; side keeps a plain machined finish
  const topMat = new THREE.MeshStandardMaterial({
    map: drawPlateTexture(), color: 0xe8e2d2, roughness: 0.34, metalness: 0.82, envMapIntensity: 1.1,
  });
  const bottomMat = new THREE.MeshStandardMaterial({
    map: drawDialSideTexture(), color: 0xe4e0d2, roughness: 0.4, metalness: 0.78, envMapIntensity: 1.05,
  });
  // deck top: same perlage, planar UVs (u ← x, v ← −z), a shade brighter so
  // the raised level reads against the well floors
  const deckMat = new THREE.MeshStandardMaterial({
    map: drawPlateTexture(false), color: 0xf2ecdc, roughness: 0.32, metalness: 0.84, envMapIntensity: 1.15,
  });
  // the finish canvases double as relief: perlage swirls and graining rings
  // sweep light as the camera orbits instead of staying a printed photo
  for (const [m, scale] of [[topMat, 0.02], [bottomMat, 0.015], [deckMat, 0.02]]) {
    const bump = m.map.clone();
    bump.colorSpace = THREE.NoColorSpace;
    bump.needsUpdate = true;
    m.bumpMap = bump;
    m.bumpScale = scale;
  }
  const plate = new THREE.Mesh(
    new THREE.CylinderGeometry(PLAN.plateR, PLAN.plateR, 1.2, 64),
    [mat, topMat, bottomMat] // side / top / bottom
  );
  plate.position.y = -0.6;
  g.add(plate);

  // the raised deck with its milled wells (the "enclosures" wheels nest into)
  const deckShape = new THREE.Shape();
  deckShape.absarc(0, 0, PLAN.plateR, 0, Math.PI * 2, false);
  const wellPath = new THREE.Path();
  const outline = diskUnionOutline(wellCircles());
  outline.forEach(([x, z], i) => {
    if (i === 0) wellPath.moveTo(x, -z); // plan (x,z) → shape (x,−z): rotateX undoes it
    else wellPath.lineTo(x, -z);
  });
  wellPath.closePath();
  deckShape.holes.push(wellPath);
  const deckGeo = new THREE.ExtrudeGeometry(deckShape, {
    depth: DECK_H - 0.02, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.035,
    bevelSegments: 2, curveSegments: 48,
  });
  // planar UVs over the plate disc, matching the un-rotated texture
  const uv = deckGeo.attributes.uv;
  const dpos = deckGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, dpos.getX(i) / (PLAN.plateR * 2) + 0.5, dpos.getY(i) / (PLAN.plateR * 2) + 0.5);
  }
  deckGeo.rotateX(-Math.PI / 2);
  const deck = new THREE.Mesh(deckGeo, [deckMat, mat]); // caps / side walls
  g.add(deck);

  // beveled rim ring crowns the deck edge
  const rim = new THREE.Mesh(new THREE.TorusGeometry(PLAN.plateR - 0.04, 0.09, 8, 64), mat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = DECK_H + 0.01;
  g.add(rim);
  // jewel bearings visible at every pivot — the "map" the player fills in
  for (const key of ['barrel', 'center', 'third', 'fourth', 'escape', 'pallet', 'balance']) {
    const p = PLAN[key];
    const seat = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14), metal(COLORS.bridge, 0.4, 0.8), p.x, 0.02, p.y);
    g.add(seat);
    const j = jewel(0.16, 0.05);
    j.position.set(p.x, 0.05, p.y);
    g.add(j);
  }
  // engraved ring on the deck
  const rimGroove = new THREE.Mesh(new THREE.TorusGeometry(PLAN.plateR - 0.35, 0.025, 6, 64), metal(0x9096a2, 0.5, 0.6));
  rimGroove.rotation.x = Math.PI / 2;
  rimGroove.position.y = DECK_H + 0.005;
  g.add(rimGroove);
  return g;
}

// ---- dial ------------------------------------------------------------------
// After the movement flips (rotation.z = π), the fourth wheel pivot lands at
// world (-2.2, 5.0): that's where the small-seconds subdial goes.
export const SUBDIAL = new THREE.Vector2(-PLAN.fourth.x, PLAN.fourth.y);

// Three dial styles the player can choose — each an homage, not a replica:
// 'cocktail' (blue sunburst, dagger indices), 'waffle' (navy grid, batons),
// 'field' (black, full Arabic numerals, syringe hands).
export const DIAL_STYLES = {
  cocktail: { name: 'COCKTAIL', ink: '#e8ecf2' },
  waffle: { name: 'WAFFLE', ink: '#dfe6ee' },
  field: { name: 'FIELD', ink: '#d8c9a3' },
};

function drawSubdial(ctx, S, ink) {
  const cx = S / 2, cy = S / 2, R = S / 2;
  const pxPerUnit = R / 8.45;
  const sx = cx + SUBDIAL.x * pxPerUnit;
  const sy = cy + SUBDIAL.y * pxPerUnit;
  const sr = 1.55 * pxPerUnit;
  ctx.strokeStyle = ink;
  ctx.globalAlpha = 0.55;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(sx, sy, sr, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.lineWidth = i % 3 === 0 ? 4 : 2;
    ctx.beginPath();
    ctx.moveTo(sx + Math.cos(a) * sr * 0.8, sy + Math.sin(a) * sr * 0.8);
    ctx.lineTo(sx + Math.cos(a) * sr * 0.94, sy + Math.sin(a) * sr * 0.94);
    ctx.stroke();
  }
  ctx.fillStyle = ink;
  ctx.font = `${Math.round(S * 0.022)}px Georgia, serif`;
  ctx.textAlign = 'center';
  ctx.fillText('60', sx, sy - sr * 0.55);
}

function brandText(ctx, S, ink, sub) {
  const cx = S / 2, cy = S / 2, R = S / 2;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = ink;
  ctx.font = `600 ${Math.round(S * 0.03)}px Georgia, serif`;
  ctx.fillText('M E C H A N I C A L   W A Y', cx, cy - R * 0.36);
  ctx.globalAlpha = 0.75;
  ctx.font = `${Math.round(S * 0.02)}px "IBM Plex Mono", monospace`;
  ctx.fillText(sub, cx, cy - R * 0.285);
  ctx.globalAlpha = 1;
}

function drawDialTexture(style = 'cocktail', dateWindow = false) {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const cx = S / 2, cy = S / 2, R = S / 2;
  // the punched date aperture: glyphs must keep clear of it, and it gets a
  // printed frame at the end (drawn only on the hard tier's dial)
  const winPx = { x: cx + DATE_WINDOW.x * (R / 8.45), y: cy, w: DATE_WINDOW.w * (R / 8.45), h: DATE_WINDOW.h * (R / 8.45) };

  if (style === 'waffle') {
    // navy ground, darker at the rim
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, '#16305a');
    grad.addColorStop(0.72, '#122a4d');
    grad.addColorStop(1, '#0a1830');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    // waffle grid of embossed squares
    const cell = 30, gap = 7;
    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R * 0.94, 0, Math.PI * 2); ctx.clip();
    for (let y = gap; y < S; y += cell) {
      for (let x = gap; x < S; x += cell) {
        ctx.fillStyle = 'rgba(255,255,255,0.05)';
        ctx.fillRect(x, y, cell - gap, 2);
        ctx.fillRect(x, y, 2, cell - gap);
        ctx.fillStyle = 'rgba(0,0,0,0.32)';
        ctx.fillRect(x, y + cell - gap - 2, cell - gap, 2);
        ctx.fillRect(x + cell - gap - 2, y, 2, cell - gap);
      }
    }
    ctx.restore();
    // baton indices
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const len = i === 0 ? R * 0.135 : R * 0.105, w = i === 0 ? 26 : 18;
      const r1 = R * 0.92;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * (r1 - len / 2), cy + Math.sin(a) * (r1 - len / 2));
      ctx.rotate(a + Math.PI / 2);
      const m = ctx.createLinearGradient(-w / 2, 0, w / 2, 0);
      m.addColorStop(0, '#7f8a99'); m.addColorStop(0.5, '#eef2f7'); m.addColorStop(1, '#7f8a99');
      ctx.fillStyle = m;
      ctx.fillRect(-w / 2, -len / 2, w, len);
      ctx.restore();
    }
    // minute ticks
    ctx.strokeStyle = 'rgba(230,238,246,0.8)';
    for (let i = 0; i < 60; i++) {
      if (i % 5 === 0) continue;
      const a = (i / 60) * Math.PI * 2;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * 0.935, cy + Math.sin(a) * R * 0.935);
      ctx.lineTo(cx + Math.cos(a) * R * 0.965, cy + Math.sin(a) * R * 0.965);
      ctx.stroke();
    }
    brandText(ctx, S, DIAL_STYLES.waffle.ink, 'POWER RESERVE 80 · HAND ASSEMBLED');
    drawSubdial(ctx, S, DIAL_STYLES.waffle.ink);
  } else if (style === 'field') {
    // near-black ground
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, '#1c1c1c');
    grad.addColorStop(1, '#0d0d0d');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    const ink = DIAL_STYLES.field.ink;
    // outer minute track with 5-minute numerals
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2 - Math.PI / 2;
      ctx.lineWidth = i % 5 === 0 ? 4 : 2;
      const r0 = i % 5 === 0 ? R * 0.9 : R * 0.925;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0);
      ctx.lineTo(cx + Math.cos(a) * R * 0.955, cy + Math.sin(a) * R * 0.955);
      ctx.stroke();
    }
    ctx.font = `600 ${Math.round(S * 0.033)}px "IBM Plex Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const n = String(i * 5).padStart(2, '0');
      ctx.fillText(n === '60' ? '60' : n, cx + Math.cos(a) * R * 0.845, cy + Math.sin(a) * R * 0.845);
    }
    // big Arabic hour numerals
    ctx.font = `700 ${Math.round(S * 0.105)}px "IBM Plex Sans", sans-serif`;
    for (let i = 1; i <= 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      // leave room for the subdial (and the date window on hard tier)
      const nx = cx + Math.cos(a) * R * 0.63;
      const ny = cy + Math.sin(a) * R * 0.63;
      const d = Math.hypot(nx - (cx + SUBDIAL.x * (R / 8.45)), ny - (cy + SUBDIAL.y * (R / 8.45)));
      if (d < 1.85 * (R / 8.45)) continue;
      if (dateWindow && Math.abs(nx - winPx.x) < winPx.w * 1.1 && Math.abs(ny - winPx.y) < winPx.h * 1.1) continue;
      ctx.fillText(String(i), nx, ny);
    }
    brandText(ctx, S, ink, 'FIELD AUTOMATIC · HAND ASSEMBLED');
    drawSubdial(ctx, S, ink);
  } else {
    // cocktail: deep blue sunburst with fine rays
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, '#2f6aa8');
    grad.addColorStop(0.45, '#1c477c');
    grad.addColorStop(0.85, '#0e2a52');
    grad.addColorStop(1, '#081c3a');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    // sunray texture
    ctx.save();
    ctx.translate(cx, cy);
    for (let i = 0; i < 240; i++) {
      ctx.rotate((Math.PI * 2) / 240);
      ctx.strokeStyle = i % 2 ? 'rgba(255,255,255,0.045)' : 'rgba(0,0,20,0.05)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 24);
      ctx.lineTo(0, R);
      ctx.stroke();
    }
    ctx.restore();
    // applied dagger indices
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const len = i === 0 ? R * 0.2 : R * 0.16, w = 17;
      const rTip = R * 0.93;
      ctx.save();
      ctx.translate(cx + Math.cos(a) * rTip, cy + Math.sin(a) * rTip);
      ctx.rotate(a + Math.PI / 2);
      const m = ctx.createLinearGradient(-w, 0, w, 0);
      m.addColorStop(0, '#5f6a78'); m.addColorStop(0.45, '#f2f6fb'); m.addColorStop(1, '#7c8794');
      ctx.fillStyle = m;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w / 2, len * 0.28);
      ctx.lineTo(w / 3, len);
      ctx.lineTo(-w / 3, len);
      ctx.lineTo(-w / 2, len * 0.28);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    // fine minute track
    ctx.strokeStyle = 'rgba(235,242,250,0.75)';
    for (let i = 0; i < 60; i++) {
      const a = (i / 60) * Math.PI * 2;
      ctx.lineWidth = i % 5 === 0 ? 3.5 : 1.8;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * R * 0.945, cy + Math.sin(a) * R * 0.945);
      ctx.lineTo(cx + Math.cos(a) * R * 0.97, cy + Math.sin(a) * R * 0.97);
      ctx.stroke();
    }
    brandText(ctx, S, DIAL_STYLES.cocktail.ink, 'COCKTAIL · HAND ASSEMBLED');
    drawSubdial(ctx, S, DIAL_STYLES.cocktail.ink);
  }

  if (dateWindow) {
    // printed frame around the punched aperture
    const ink = (DIAL_STYLES[style] || DIAL_STYLES.cocktail).ink;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 5;
    ctx.strokeRect(winPx.x - winPx.w / 2 - 6, winPx.y - winPx.h / 2 - 6, winPx.w + 12, winPx.h + 12);
  }

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Date window aperture, dial-local (3 o'clock, world +x after the face's
// rotateX): the hole through which the date ring's number shows on hard tier.
// x matches the ring's numeral track radius (they print at r ≈ 6.84).
export const DATE_WINDOW = { x: 6.84, w: 1.2, h: 1.0 };

function dialShape(withWindow) {
  const s = new THREE.Shape();
  s.absarc(0, 0, 8.45, 0, Math.PI * 2, false);
  // center hole: the cannon pinion and hour-wheel pipe genuinely poke through
  const center = new THREE.Path();
  center.absarc(0, 0, 0.4, 0, Math.PI * 2, true);
  s.holes.push(center);
  if (withWindow) {
    const w = new THREE.Path();
    const { x, w: ww, h } = DATE_WINDOW;
    w.moveTo(x - ww / 2, -h / 2);
    w.lineTo(x + ww / 2, -h / 2);
    w.lineTo(x + ww / 2, h / 2);
    w.lineTo(x - ww / 2, h / 2);
    w.closePath();
    s.holes.push(w);
  }
  return s;
}

export function buildDial(style = 'cocktail', { dateWindow = false } = {}) {
  const g = new THREE.Group();
  const shape = dialShape(dateWindow);
  const baseGeo = new THREE.ExtrudeGeometry(shape, { depth: 0.2, bevelEnabled: false, curveSegments: 48 });
  baseGeo.rotateX(-Math.PI / 2); // shape +y (12h) → world −z; extrude depth → down
  baseGeo.translate(0, 0.2, 0);
  const base = new THREE.Mesh(baseGeo,
    new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.7, metalness: 0.1 }));
  g.add(base);
  // face: same punched shape, UV-mapped exactly like the old full circle
  const faceGeo = new THREE.ShapeGeometry(shape, 48);
  const uv = faceGeo.attributes.uv;
  const posA = faceGeo.attributes.position;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, posA.getX(i) / 16.9 + 0.5, posA.getY(i) / 16.9 + 0.5);
  }
  faceGeo.rotateX(-Math.PI / 2);
  const face = new THREE.Mesh(faceGeo,
    new THREE.MeshStandardMaterial({ map: drawDialTexture(style, dateWindow), roughness: style === 'field' ? 0.75 : 0.45, metalness: style === 'field' ? 0.05 : 0.25 }));
  face.position.y = 0.205;
  g.add(face);
  // brass collar around the center hole — the "pipe socket" the hands stack in
  const collar = new THREE.Mesh(createLatheRing([[0.4, 0.02], [0.46, 0.02], [0.46, 0.24], [0.4, 0.24]], 24),
    metal(0xc8a24a, 0.3, 0.9));
  g.add(collar);
  // small-seconds pivot: the fourth wheel's dial-side pivot, poking through
  // a counterbore for the seconds hand to press onto
  const bore = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.02, 12),
    new THREE.MeshStandardMaterial({ color: 0x1a1611, roughness: 0.6, metalness: 0.3 }), SUBDIAL.x, 0.207, SUBDIAL.y);
  g.add(bore);
  g.add(mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.13, 10), metal(COLORS.steel, 0.25, 0.95), SUBDIAL.x, 0.27, SUBDIAL.y));
  return g;
}

// Hand silhouettes per dial style. All shapes point up (+y = 12 o'clock).
function handShape(kind, len, tailLen, w) {
  const s = new THREE.Shape();
  if (kind === 'dauphine') {
    // slim polished kite
    s.moveTo(0, -tailLen);
    s.lineTo(w, 0);
    s.lineTo(0, len);
    s.lineTo(-w, 0);
  } else if (kind === 'syringe') {
    // thin rod, wider lume barrel, needle tip
    const rod = w * 0.45, barrel = w;
    s.moveTo(0, -tailLen);
    s.lineTo(rod, -tailLen);
    s.lineTo(rod, len * 0.56);
    s.lineTo(barrel, len * 0.6);
    s.lineTo(barrel, len * 0.84);
    s.lineTo(0, len);
    s.lineTo(-barrel, len * 0.84);
    s.lineTo(-barrel, len * 0.6);
    s.lineTo(-rod, len * 0.56);
    s.lineTo(-rod, -tailLen);
  } else {
    // baton: straight sides, short angled tip
    s.moveTo(w * 0.85, -tailLen);
    s.lineTo(w, len * 0.9);
    s.lineTo(0, len);
    s.lineTo(-w, len * 0.9);
    s.lineTo(-w * 0.85, -tailLen);
  }
  s.closePath();
  return s;
}

const HAND_LOOKS = {
  cocktail: { kind: 'dauphine', color: 0xd9dee6, rough: 0.15, metal: 0.95 },
  waffle: { kind: 'baton', color: 0xc9cfd8, rough: 0.2, metal: 0.9 },
  field: { kind: 'syringe', color: 0xd8c9a3, rough: 0.45, metal: 0.35 },
};

function buildHand(look, len, tailLen, w, thickness = 0.05) {
  const geo = new THREE.ExtrudeGeometry(handShape(look.kind, len, tailLen, w), {
    depth: thickness, bevelEnabled: true, bevelThickness: thickness * 0.3,
    bevelSize: 0.008, bevelSegments: 1, curveSegments: 4,
  });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(Math.PI / 2); // shape +y (12 o'clock) → world -z, flat in XZ
  return new THREE.Mesh(geo, metal(look.color, look.rough, look.metal));
}

// Each hand is its own part (pressed on in its own step, like the real job).
// All three share an origin at dial center, y 0 = dial face; `userData.pivot`
// is the group the ticking sim rotates.
export function buildHourHand(style = 'cocktail') {
  const look = HAND_LOOKS[style] || HAND_LOOKS.cocktail;
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.add(buildHand(look, 4.1, 0.7, 0.36));
  pivot.position.y = 0.12;
  g.add(pivot);
  // socket hub: wraps the hour-wheel pipe it presses onto
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.1, 16), metal(look.color, look.rough, look.metal), 0, 0.07, 0));
  g.userData.pivot = pivot;
  return g;
}

export function buildMinuteHand(style = 'cocktail') {
  const look = HAND_LOOKS[style] || HAND_LOOKS.cocktail;
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.add(buildHand(look, 6.6, 0.9, 0.27));
  pivot.position.y = 0.24;
  g.add(pivot);
  // the center cap rides on with the last centered hand
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.34, 16), metal(look.color, look.rough, look.metal), 0, 0.17, 0));
  g.userData.pivot = pivot;
  return g;
}

export function buildSecondHand(style = 'cocktail') {
  const look = HAND_LOOKS[style] || HAND_LOOKS.cocktail;
  const g = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.add(buildHand({ ...look, kind: 'baton' }, 1.35, 0.55, 0.07, 0.035));
  pivot.position.set(SUBDIAL.x, 0.1, SUBDIAL.y);
  g.add(pivot);
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.18, 12), metal(look.color, look.rough, look.metal), SUBDIAL.x, 0.09, SUBDIAL.y));
  g.userData.pivot = pivot;
  return g;
}

function buildCase() {
  const g = new THREE.Group();
  const mat = metal(0xd8b978, 0.28, 0.95); // warm gold case
  // deep pocket-watch band: encloses the full movement + dial stack (~5 units)
  const band = new THREE.Mesh(createLatheRing([
    [9.0, 0], [10.0, 0.4], [10.35, 2.4], [10.0, 4.3], [9.0, 4.95],
  ], 64), mat);
  g.add(band);
  const bezel = new THREE.Mesh(new THREE.TorusGeometry(9.35, 0.32, 12, 64), mat);
  bezel.rotation.x = Math.PI / 2;
  bezel.position.y = 4.88;
  g.add(bezel);
  const crystal = new THREE.Mesh(new THREE.SphereGeometry(9.15, 48, 12, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshStandardMaterial({
      color: 0xdfeaf2, transparent: true, opacity: 0.14, roughness: 0.05,
      metalness: 0, envMapIntensity: 2.4, depthWrite: false,
    }));
  crystal.scale.set(1, 0.24, 1);
  crystal.position.y = 4.8;
  g.add(crystal);
  // crown + bow at 12 (world -z)
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.7, 14), mat);
  crown.rotation.x = Math.PI / 2;
  crown.position.set(0, 2.4, -10.7);
  g.add(crown);
  for (let i = 0; i < 14; i++) { // knurling ridges around the crown
    const a = (i / 14) * Math.PI * 2;
    const k = mesh(new THREE.BoxGeometry(0.08, 0.08, 0.72), mat,
      Math.cos(a) * 0.62, 2.4 + Math.sin(a) * 0.62, -10.7);
    k.rotation.z = a;
    g.add(k);
  }
  const bow = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.15, 10, 28), mat);
  bow.position.set(0, 2.4, -12.4);
  g.add(bow);
  return g;
}

export function buildHolder() {
  const g = new THREE.Group();
  // bench movement holders are brass; keep steel for the clamp hardware
  const mat = metal(0xa8834a, 0.38, 0.88);
  const steelM = metal(COLORS.steel, 0.3, 0.9);
  g.add(new THREE.Mesh(createLatheRing([
    [8.6, 0], [9.6, 0], [9.8, 0.4], [9.8, 1.5], [9.4, 1.75], [8.6, 1.75],
  ], 64), mat));
  // engraved ring around the wall
  g.add(mesh(new THREE.TorusGeometry(9.82, 0.03, 6, 64).rotateX(Math.PI / 2), metal(0x7a5c30, 0.5, 0.7), 0, 0.95, 0));
  // three clamp tabs, each with a knurled adjustment screw on the outside
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const tab = mesh(new THREE.BoxGeometry(0.9, 0.18, 0.5), steelM,
      Math.cos(a) * 8.45, 1.72, Math.sin(a) * 8.45);
    tab.rotation.y = -a + Math.PI / 2;
    g.add(tab);
    const knob = mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.42, 18),
      steelM, Math.cos(a) * 10.15, 0.95, Math.sin(a) * 10.15);
    knob.rotation.z = Math.PI / 2;
    knob.rotation.y = -a;
    g.add(knob);
    for (let k = 0; k < 8; k++) { // knurling ridges
      const ka = (k / 8) * Math.PI * 2;
      const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.05, 0.05), steelM);
      ridge.position.copy(knob.position);
      ridge.rotation.copy(knob.rotation);
      ridge.translateY(Math.cos(ka) * 0.34);
      ridge.translateZ(Math.sin(ka) * 0.34);
      ridge.rotateX(-ka);
      g.add(ridge);
    }
  }
  return g;
}

// ---------------------------------------------------------------------------
// Assembly-facing catalog
// ---------------------------------------------------------------------------

// find the (single) tagged gear mesh with the given tooth count inside a part
function gearOf(part, teeth) {
  let found = null;
  part.traverse((o) => { if (o.userData.gear?.teeth === teeth) found = o; });
  return found;
}

// Phase-align the whole movement: walk each mesh in drive order and rotate
// the driven gear tooth-into-gap. Because the ticking sim turns everything at
// the true tooth ratios, alignment done once here holds forever.
function alignDrivetrain(parts) {
  const P = PLAN;
  const chain = [
    // [driven part, driven teeth, driven pos, driver part, driver teeth, driver pos]
    ['center', TEETH.centerPinion, P.center, 'barrel', TEETH.barrel, P.barrel],
    ['third', TEETH.thirdPinion, P.third, 'center', TEETH.center, P.center],
    ['fourth', TEETH.fourthPinion, P.fourth, 'third', TEETH.third, P.third],
    ['escape', TEETH.escapePinion, P.escape, 'fourth', TEETH.fourth, P.fourth],
  ];
  for (const [bId, bTeeth, bPos, aId, aTeeth, aPos] of chain) {
    alignGearMesh(gearOf(parts.get(bId), bTeeth), bPos, gearOf(parts.get(aId), aTeeth), aPos);
  }

  // Escape wheel: not a gear mesh — its teeth land on the pallet stones. At
  // every locked rest the wheel sits at −(k+1)·(pitch/2); rotate the wheel
  // mesh so those rests put a tooth TIP exactly on the engaged stone's
  // contact face, alternating entry/exit (the ±30° spacing is 2.5 pitches,
  // so one offset serves both).
  const esc = gearOf(parts.get('escape'), TEETH.escape);
  const step = (Math.PI * 2) / TEETH.escape;
  const want = step / 2 - ESCAPEMENT.entryContact; // tip angle −i·step − rot = contact at rest
  esc.rotation.y = ((want % step) + step) % step;
  if (esc.rotation.y > step / 2) esc.rotation.y -= step;

  // Ratchet: park a tooth gap under the click's pawl tip, then mesh the
  // crown wheel to the ratchet as rotated.
  const ratchet = gearOf(parts.get('ratchet'), TEETH.ratchet);
  const rStep = (Math.PI * 2) / TEETH.ratchet;
  const rTc = ratchet.userData.gear.tc;
  // gap center (tooth phase 0.5) at the pawl contact direction
  const cur = (-CLICK_CONTACT.dirFromRatchet - ratchet.rotation.y) / rStep - rTc;
  let d = (0.5 - cur) % 1;
  if (d > 0.5) d -= 1;
  if (d < -0.5) d += 1;
  ratchet.rotation.y -= d * rStep;
  alignGearMesh(gearOf(parts.get('crownwheel'), TEETH.crown), P.crownWheel, ratchet, P.barrel);

  // Motion works (dial side): cannon → minute wheel → hour wheel
  const mwPos = MOTION.minuteWheel, ctr = new THREE.Vector2(0, 0);
  alignGearMesh(gearOf(parts.get('minutewheel'), TEETH.minuteWheel), mwPos, gearOf(parts.get('cannon'), TEETH.cannon), ctr);
  alignGearMesh(gearOf(parts.get('hourwheel'), TEETH.hourWheel), ctr, gearOf(parts.get('minutewheel'), TEETH.minutePinion), mwPos);

  // Date ring: face and teeth turn together to RING_BAKE — a numeral centers
  // in the dial window while tooth gaps land on both steel contacts (their
  // PLAN angles were derived from this same rotation).
  const ringPart = parts.get('datering');
  ringPart.userData.teethMesh.rotation.y = RING_BAKE;
  ringPart.userData.faceMesh.rotation.z = RING_BAKE; // face is rotateX'd: its local z is world y
}

export function buildAllParts() {
  const parts = new Map();
  const add = (id, group) => {
    group.userData.partId = id;
    group.traverse((o) => { o.userData.partId = id; });
    parts.set(id, group);
  };

  add('barrel', buildBarrelDrum());
  add('mainspring', buildMainspring());
  add('lid', buildBarrelLid());
  // The train CLIMBS, the way real movements are built: every pinion hangs
  // BELOW its wheel, so each wheel rides one step above the wheel driving it
  // (center 1.9 → third 2.15 → fourth 2.4 → escape 2.6, bridge above all).
  // That's also what makes drop-in assembly physically possible — each new
  // wheel lands ABOVE the ones already seated, never through them.
  const cw = gearDims(PITCH.center, TEETH.center);
  const cp = gearDims(P_CENTER_PINION, TEETH.centerPinion);
  add('center', buildTrainWheel({
    color: COLORS.center,
    wheel: { teeth: TEETH.center, p: PITCH.center, ...cw, thickness: 0.16, holeR: 0.14, spokes: 5, spokeInnerR: 0.7, spokeOuterR: 2.8, y: 1.9 },
    pinion: { teeth: TEETH.centerPinion, p: P_CENTER_PINION, ...cp, thickness: 0.6, holeR: 0.1, y: 0.45 },
    arborTop: 2.6,
  }));
  const tw = gearDims(PITCH.third, TEETH.third);
  const tp = gearDims(P_THIRD_PINION, TEETH.thirdPinion);
  add('third', buildTrainWheel({
    color: COLORS.third,
    wheel: { teeth: TEETH.third, p: PITCH.third, ...tw, thickness: 0.14, holeR: 0.12, spokes: 4, spokeInnerR: 0.55, spokeOuterR: 2.1, y: 2.15 },
    pinion: { teeth: TEETH.thirdPinion, p: P_THIRD_PINION, ...tp, thickness: 0.32, holeR: 0.06, y: 1.9 },
    arborTop: 2.92,
  }));
  const fw = gearDims(PITCH.fourth, TEETH.fourth);
  const fp = gearDims(P_FOURTH_PINION, TEETH.fourthPinion);
  add('fourth', buildTrainWheel({
    color: COLORS.fourth,
    wheel: { teeth: TEETH.fourth, p: PITCH.fourth, ...fw, thickness: 0.14, holeR: 0.12, spokes: 4, spokeInnerR: 0.5, spokeOuterR: 1.75, y: 2.4 },
    pinion: { teeth: TEETH.fourthPinion, p: P_FOURTH_PINION, ...fp, thickness: 0.3, holeR: 0.06, y: 2.15 },
    arborTop: 2.92,
  }));
  add('escape', buildEscapeWheel());
  add('bridge', buildTrainBridge());
  add('pallet', buildPalletFork());
  add('balance', buildBalanceAssembly());
  add('barrelbridge', buildBarrelBridge());
  add('ratchet', buildRatchetWheel());
  add('click', buildClick());
  add('crownwheel', buildCrownWheel());
  add('cannon', buildCannonPinion());
  add('minutewheel', buildMinuteWheel());
  add('hourwheel', buildHourWheel());
  add('reversers', buildReversers());
  add('rotor', buildRotor());
  add('datejumper', buildDateJumper());
  add('dateindicator', buildDateIndicator());
  add('datering', buildDateRing());
  add('stem', buildStem());
  add('settinglever', buildSettingLever());
  add('yoke', buildYoke());
  add('jumper', buildLeverJumper());
  add('dial', buildDial());
  add('hourhand', buildHourHand());
  add('minutehand', buildMinuteHand());
  add('secondhand', buildSecondHand());

  alignDrivetrain(parts);
  return parts;
}

export { buildPlate, buildCase };
