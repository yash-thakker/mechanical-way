// Every part of the watch, procedurally modeled. Layout follows a real movement:
// barrel → center wheel → third wheel → fourth wheel → escape wheel → pallet → balance,
// with meshing distances computed so teeth visually line up.
import * as THREE from 'three';
import {
  createGearGeometry,
  createEscapeWheelGeometry,
  createSpiralGeometry,
  createLatheRing,
  createRoundedPlateGeometry,
} from './gearFactory.js';

// ---- movement plan (x, z on the plate, plate top = y 0) -------------------
export const PLAN = {
  plateR: 8.3,
  center: new THREE.Vector2(0, 0),
  barrel: new THREE.Vector2(-3.15, -3.15), // dist 4.45 = barrel tip 3.6 + center pinion 0.85
  third: new THREE.Vector2(3.55, 2.05),    // dist 4.10 = center wheel 3.4 + third pinion 0.7
  fourth: new THREE.Vector2(2.2, 5.0),     // dist 3.24 = third wheel 2.6 + fourth pinion 0.65
  escape: new THREE.Vector2(-0.5, 4.6),    // dist 2.73 = fourth wheel 2.2 + escape pinion 0.55
  pallet: new THREE.Vector2(-2.55, 3.35),
  balance: new THREE.Vector2(-4.7, 2.2),
  // click system (on the barrel bridge): ratchet screws onto the barrel arbor,
  // crown wheel meshes it at dist 3.85 = ratchet 2.3 + crown 1.55
  crownWheel: new THREE.Vector2(0.44, -4.11),
  click: new THREE.Vector2(-1.3, -3.85),
};

// Motion works live on the DIAL side (dialGroup local): the cannon pinion's
// driving wheel (r .85) meshes the minute wheel (r 1.55) at dist 2.40, whose
// pinion (r .52) meshes the hour wheel (r 1.88) at the same 2.40.
export const MOTION = {
  minuteWheel: new THREE.Vector2(1.78, -1.61),
};

// Hard-tier plans. Auto-winding sits on the MOVEMENT side (over the bridges);
// the date mechanism and keyless works live on the DIAL side, near 3 o'clock.
export const AUTO = {
  reversers: new THREE.Vector2(2.6, -1.9),
};
export const KEYLESS = {
  stem: new THREE.Vector2(6.9, 0),          // rod runs outward through the case edge
  settinglever: new THREE.Vector2(5.5, 1.3),
  yoke: new THREE.Vector2(5.4, -1.5),
  jumper: new THREE.Vector2(5.0, 0.1),
  datejumper: new THREE.Vector2(-4.6, -2.0),
  dateindicator: new THREE.Vector2(-3.3, 0.9),
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
  hands: 0x33427a,
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

function metal(color, roughness = 0.32, metalness = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

const rubyMat = new THREE.MeshStandardMaterial({
  color: COLORS.ruby, roughness: 0.15, metalness: 0.3,
  emissive: COLORS.ruby, emissiveIntensity: 0.25,
});

function jewel(r = 0.18, h = 0.07) {
  return new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 16), rubyMat);
}

function screwHead(mat) {
  const g = new THREE.Group();
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.08, 12), mat));
  const slot = mesh(new THREE.BoxGeometry(0.32, 0.03, 0.07),
    new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.6, metalness: 0.4 }));
  slot.position.y = 0.045;
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
  // floor + wall (open top drum)
  g.add(mesh(new THREE.CylinderGeometry(3.2, 3.2, 0.16, 48), mat, 0, 0.1, 0));
  g.add(new THREE.Mesh(createLatheRing([[3.12, 0.1], [3.32, 0.1], [3.32, 1.5], [3.12, 1.5]]), mat));
  // arbor with hook
  const arborMat = metal(COLORS.steel, 0.3, 0.9);
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.3, 1.7, 16), arborMat, 0, 0.85, 0));
  g.add(mesh(new THREE.BoxGeometry(0.18, 0.5, 0.14), arborMat, 0.33, 0.85, 0));
  // tooth ring around the base
  const ring = new THREE.Mesh(createGearGeometry({
    teeth: 64, tipR: 3.62, rootR: 3.34, thickness: 0.55, holeR: 3.0,
  }), mat);
  ring.position.y = 0.45;
  g.add(ring);
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

// A train wheel: big toothed wheel + pinion + arbor, at authentic stacked heights.
function buildTrainWheel({ color, wheel, pinion, arborTop }) {
  const g = new THREE.Group();
  const mat = metal(color, 0.3, 0.88);
  const w = new THREE.Mesh(createGearGeometry(wheel), mat);
  w.position.y = wheel.y;
  g.add(w);
  if (pinion) {
    const p = new THREE.Mesh(createGearGeometry(pinion), mat);
    p.position.y = pinion.y;
    g.add(p);
  }
  const arborMat = metal(COLORS.steel, 0.28, 0.92);
  g.add(mesh(new THREE.CylinderGeometry(0.11, 0.11, arborTop - 0.02, 12), arborMat, 0, arborTop / 2, 0));
  return g;
}

function buildEscapeWheel() {
  const g = new THREE.Group();
  const mat = metal(COLORS.escape, 0.28, 0.88);
  const w = new THREE.Mesh(createEscapeWheelGeometry({
    teeth: 15, tipR: 1.7, rootR: 1.22, thickness: 0.14,
  }), mat);
  w.position.y = 1.52;
  g.add(w);
  const p = new THREE.Mesh(createGearGeometry({
    teeth: 6, tipR: 0.55, rootR: 0.38, thickness: 0.3, holeR: 0.08,
  }), mat);
  p.position.y = 0.65;
  g.add(p);
  g.add(mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.95, 12), metal(COLORS.steel, 0.28, 0.92), 0, 0.98, 0));
  return g;
}

function buildTrainBridge() {
  const g = new THREE.Group();
  const mat = metal(COLORS.bridge, 0.34, 0.9);
  const y = 2.24, th = 0.26;
  const arm1 = bridgeArm(PLAN.third, PLAN.fourth, 1.5, th, mat);
  const arm2 = bridgeArm(PLAN.fourth, PLAN.escape, 1.5, th, mat);
  arm1.position.y = y; arm2.position.y = y;
  g.add(arm1, arm2);
  for (const p of [PLAN.third, PLAN.fourth, PLAN.escape]) {
    g.add(mesh(new THREE.CylinderGeometry(1.02, 1.08, th, 24), mat, p.x, y, p.y));
    const j = jewel(); j.position.set(p.x, y + th / 2 + 0.02, p.y); g.add(j);
  }
  // feet + screws at the two ends
  const feet = [
    new THREE.Vector2(4.7, 1.3), // beyond third
    new THREE.Vector2(-1.6, 5.6), // beyond escape
  ];
  for (const f of feet) {
    g.add(mesh(new THREE.CylinderGeometry(0.32, 0.36, y, 14), mat, f.x, y / 2, f.y));
    const s = screwHead(metal(COLORS.steel, 0.25, 0.95));
    s.position.set(f.x, y + th / 2 + 0.02, f.y);
    g.add(s);
    const disc = mesh(new THREE.CylinderGeometry(0.55, 0.55, th, 16), mat, f.x, y, f.y);
    g.add(disc);
  }
  // connect feet to arms
  const c1 = bridgeArm(feet[0], PLAN.third, 1.1, th, mat, 0.6); c1.position.y = y; g.add(c1);
  const c2 = bridgeArm(feet[1], PLAN.escape, 1.1, th, mat, 0.6); c2.position.y = y; g.add(c2);
  return g;
}

function buildPalletFork() {
  const g = new THREE.Group(); // origin at pallet pivot
  const mat = metal(COLORS.pallet, 0.3, 0.85);
  const y = 1.54;
  const toEscape = new THREE.Vector2().subVectors(PLAN.escape, PLAN.pallet);
  const toBalance = new THREE.Vector2().subVectors(PLAN.balance, PLAN.pallet);

  const arm1 = new THREE.Mesh(createRoundedPlateGeometry(0.5, 2.1, 0.15, 0.22), mat);
  arm1.position.set(toEscape.x * 0.42, y, toEscape.y * 0.42);
  arm1.rotation.y = Math.atan2(toEscape.x, toEscape.y);
  g.add(arm1);

  // two ruby pallet stones at the escape end
  for (const side of [-1, 1]) {
    const stone = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.5), rubyMat);
    const t = 0.86;
    stone.position.set(toEscape.x * t + side * 0.42, y, toEscape.y * t - side * 0.1);
    stone.rotation.y = Math.atan2(toEscape.x, toEscape.y) + side * 0.5;
    g.add(stone);
  }

  const arm2 = new THREE.Mesh(createRoundedPlateGeometry(0.42, 2.0, 0.15, 0.2), mat);
  arm2.position.set(toBalance.x * 0.4, y, toBalance.y * 0.4);
  arm2.rotation.y = Math.atan2(toBalance.x, toBalance.y);
  g.add(arm2);

  // fork horns at balance end
  const hornBase = new THREE.Vector2(toBalance.x * 0.82, toBalance.y * 0.82);
  const perp = new THREE.Vector2(-toBalance.y, toBalance.x).normalize();
  for (const side of [-1, 1]) {
    const horn = mesh(new THREE.BoxGeometry(0.12, 0.15, 0.42), mat,
      hornBase.x + perp.x * side * 0.19, y, hornBase.y + perp.y * side * 0.19);
    horn.rotation.y = Math.atan2(toBalance.x, toBalance.y);
    g.add(horn);
  }
  // pivot + tiny bridge above
  g.add(mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.9, 12), metal(COLORS.steel, 0.28, 0.92), 0, y + 0.1, 0));
  const bridge = new THREE.Mesh(createRoundedPlateGeometry(0.7, 1.7, 0.18, 0.3), mat);
  bridge.position.y = y + 0.5;
  bridge.rotation.y = Math.atan2(toEscape.x, toEscape.y) + Math.PI / 2;
  g.add(bridge);
  const j = jewel(0.14, 0.06); j.position.set(0, y + 0.62, 0); g.add(j);
  return g;
}

function buildBalanceAssembly() {
  const g = new THREE.Group(); // origin at balance pivot on plate

  // oscillating sub-group (wheel + hairspring + roller)
  const osc = new THREE.Group();
  const wheelMat = metal(COLORS.balance, 0.25, 0.9);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(2.15, 0.22, 12, 48), wheelMat);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 2.5;
  osc.add(rim);
  for (const a of [0, Math.PI / 2]) {
    const arm = mesh(new THREE.BoxGeometry(4.1, 0.1, 0.34), wheelMat, 0, 2.5, 0);
    arm.rotation.y = a;
    osc.add(arm);
  }
  // timing screws on the rim
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const s = mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.3, 8),
      metal(0xd9b45a, 0.3, 0.9), Math.cos(a) * 2.42, 2.5, Math.sin(a) * 2.42);
    s.rotation.z = Math.PI / 2;
    s.rotation.y = -a;
    osc.add(s);
  }
  const staffMat = metal(COLORS.steel, 0.25, 0.95);
  osc.add(mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.0, 12), staffMat, 0, 1.55, 0));
  const roller = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 16), staffMat, 0, 1.75, 0);
  osc.add(roller);
  const impulse = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.2, 0.08), rubyMat);
  impulse.position.set(0.26, 1.75, 0);
  osc.add(impulse);
  // hairspring (blued steel)
  const hs = new THREE.Mesh(createSpiralGeometry({
    turns: 5, innerR: 0.28, outerR: 1.55, bandHeight: 0.1, bandThickness: 0.035,
    segmentsPerTurn: 30,
  }), metal(COLORS.mainspring, 0.3, 0.8));
  hs.position.y = 2.95;
  osc.add(hs);
  g.add(osc);
  g.userData.osc = osc;
  g.userData.hairspring = hs;

  // balance cock (bridge arm anchored toward the plate edge)
  const cockMat = metal(COLORS.bridge, 0.34, 0.9);
  const outward = PLAN.balance.clone().normalize();
  const foot = outward.clone().multiplyScalar(2.5);
  const cockY = 3.3;
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

  // arbor hole: show the square top of the barrel arbor through the bridge
  const hole = mesh(new THREE.CylinderGeometry(0.42, 0.42, th + 0.04, 16),
    metal(0x2a2018, 0.6, 0.4), 0, y, 0);
  g.add(hole);

  // feet + screw heads at the two service points
  const feet = [new THREE.Vector2(-2.3, -2.0), new THREE.Vector2(2.15, 1.05)];
  for (const f of feet) {
    g.add(mesh(new THREE.CylinderGeometry(0.32, 0.38, y, 14), mat, f.x, y / 2, f.y));
    g.add(mesh(new THREE.CylinderGeometry(0.55, 0.55, th, 16), mat, f.x, y, f.y));
  }
  return g;
}

function buildRatchetWheel() {
  const g = new THREE.Group();
  const mat = metal(COLORS.ratchet, 0.3, 0.9);
  const w = new THREE.Mesh(createGearGeometry({
    teeth: 40, tipR: 2.3, rootR: 2.1, thickness: 0.16, holeR: 0.26,
  }), mat);
  w.position.y = 2.52;
  g.add(w);
  // engraved circle + square boss that mates with the barrel arbor
  g.add(mesh(new THREE.TorusGeometry(1.5, 0.02, 6, 40).rotateX(Math.PI / 2),
    metal(0xb87718, 0.5, 0.6), 0, 2.61, 0));
  const boss = mesh(new THREE.BoxGeometry(0.5, 0.12, 0.5), metal(COLORS.steel, 0.3, 0.9), 0, 2.62, 0);
  g.add(boss);
  return g;
}

function buildClick() {
  const g = new THREE.Group(); // origin at the click pivot
  const mat = metal(COLORS.click, 0.32, 0.85);
  const y = 2.55;
  // beak lever that falls between the crown wheel's teeth
  const beak = new THREE.Mesh(createRoundedPlateGeometry(0.3, 1.15, 0.14, 0.13), mat);
  beak.position.set(0.32, y, -0.28);
  beak.rotation.y = Math.atan2(0.9, -0.75);
  g.add(beak);
  g.add(mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.26, 12), mat, 0, y, 0));
  // click spring: a springy strip pressing on the lever's tail
  const springMat = metal(COLORS.steel, 0.28, 0.92);
  const s1 = mesh(new THREE.BoxGeometry(0.9, 0.1, 0.08), springMat, -0.62, y, 0.18);
  s1.rotation.y = 0.5;
  const s2 = mesh(new THREE.BoxGeometry(0.55, 0.1, 0.08), springMat, -1.02, y, 0.5);
  s2.rotation.y = 1.25;
  g.add(s1, s2);
  return g;
}

function buildCrownWheel() {
  const g = new THREE.Group();
  const mat = metal(COLORS.crownwheel, 0.28, 0.9);
  // coarse, widely-spaced teeth (it looks like every other tooth is missing)
  const w = new THREE.Mesh(createGearGeometry({
    teeth: 14, tipR: 1.55, rootR: 1.28, thickness: 0.18, holeR: 0.22,
  }), mat);
  w.position.y = 2.52;
  g.add(w);
  g.add(mesh(new THREE.CylinderGeometry(0.62, 0.66, 0.1, 18), mat, 0, 2.64, 0));
  return g;
}

// ---- motion works (dial side): cannon pinion, minute wheel, hour wheel -----

function buildCannonPinion() {
  const g = new THREE.Group(); // origin at dial center, y 0 = movement top
  const mat = metal(COLORS.cannon, 0.28, 0.9);
  // driving wheel meshing the minute wheel
  const w = new THREE.Mesh(createGearGeometry({
    teeth: 18, tipR: 0.85, rootR: 0.68, thickness: 0.12, holeR: 0.16,
  }), mat);
  w.position.y = 0.06;
  g.add(w);
  // the cannon: a friction-fit tube the minute hand will ride
  g.add(mesh(new THREE.CylinderGeometry(0.2, 0.24, 0.42, 14), mat, 0, 0.28, 0));
  g.add(mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.16, 10), metal(COLORS.steel, 0.25, 0.95), 0, 0.55, 0));
  return g;
}

function buildMinuteWheel() {
  const g = new THREE.Group();
  const mat = metal(COLORS.minutewheel, 0.3, 0.88);
  const w = new THREE.Mesh(createGearGeometry({
    teeth: 32, tipR: 1.55, rootR: 1.38, thickness: 0.12, holeR: 0.1, spokes: 3, spokeInnerR: 0.35, spokeOuterR: 1.2,
  }), mat);
  w.position.y = 0.06;
  g.add(w);
  const p = new THREE.Mesh(createGearGeometry({
    teeth: 8, tipR: 0.52, rootR: 0.36, thickness: 0.16, holeR: 0.08,
  }), mat);
  p.position.y = 0.2;
  g.add(p);
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 10), metal(COLORS.steel, 0.25, 0.95), 0, 0.17, 0));
  return g;
}

function buildHourWheel() {
  const g = new THREE.Group(); // origin at dial center; rides loosely on the cannon
  const mat = metal(COLORS.hourwheel, 0.3, 0.88);
  const w = new THREE.Mesh(createGearGeometry({
    teeth: 36, tipR: 1.88, rootR: 1.7, thickness: 0.12, holeR: 0.3, spokes: 4, spokeInnerR: 0.5, spokeOuterR: 1.45,
  }), mat);
  w.position.y = 0.06;
  g.add(w);
  // the pipe the hour hand rides — hollow, sleeved over the cannon
  g.add(new THREE.Mesh(createLatheRing([[0.26, 0.1], [0.34, 0.1], [0.34, 0.34], [0.26, 0.34]], 16), mat));
  return g;
}

// ---- automatic winding (movement side, assembled on the running watch) ----

function buildReversers() {
  const g = new THREE.Group(); // origin at its plan spot, over the train bridge
  const plate = metal(0x9a8a6a, 0.4, 0.8);
  const y = 3.02;
  const arm = new THREE.Mesh(createRoundedPlateGeometry(1.3, 3.4, 0.14, 0.5), plate);
  arm.position.y = y;
  arm.rotation.y = 0.6;
  g.add(arm);
  // the two reverser pairs: yellow wheel with a blue wheel riding on it
  for (const [dx, dz] of [[-0.85, -0.6], [0.85, 0.6]]) {
    const yellow = new THREE.Mesh(createGearGeometry({
      teeth: 22, tipR: 1.05, rootR: 0.92, thickness: 0.12, holeR: 0.12,
    }), metal(COLORS.reversers, 0.3, 0.9));
    yellow.position.set(dx, y + 0.12, dz);
    g.add(yellow);
    const blue = new THREE.Mesh(createGearGeometry({
      teeth: 16, tipR: 0.68, rootR: 0.56, thickness: 0.1, holeR: 0.1,
    }), metal(0x4a7fd6, 0.3, 0.9));
    blue.position.set(dx, y + 0.24, dz);
    g.add(blue);
  }
  return g;
}

function buildRotor() {
  const g = new THREE.Group(); // origin at the movement center
  const body = metal(COLORS.rotor, 0.35, 0.85);
  const y = 3.55;
  // half-moon weight: half annulus, heavier rim at the outer edge
  const shape = new THREE.Shape();
  shape.absarc(0, 0, 6.9, 0, Math.PI, false);
  shape.absarc(0, 0, 2.0, Math.PI, 0, true);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.16, bevelEnabled: false, curveSegments: 40 });
  geo.rotateX(Math.PI / 2);
  const disc = new THREE.Mesh(geo, body);
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

// ---- date mechanism (dial side) --------------------------------------------

function buildDateJumper() {
  const g = new THREE.Group();
  const mat = metal(COLORS.datejumper, 0.32, 0.85);
  const plate = new THREE.Mesh(createRoundedPlateGeometry(1.5, 2.2, 0.12, 0.4), mat);
  plate.position.y = 0.06;
  plate.rotation.y = 0.9;
  g.add(plate);
  // the springy finger that snaps the ring tooth-to-tooth
  const s1 = mesh(new THREE.BoxGeometry(1.6, 0.08, 0.1), metal(COLORS.steel, 0.3, 0.9), 0.9, 0.14, -0.55);
  s1.rotation.y = -0.55;
  g.add(s1);
  const tip = mesh(new THREE.ConeGeometry(0.12, 0.3, 6), metal(COLORS.steel, 0.3, 0.9), 1.6, 0.14, -0.85);
  tip.rotation.z = -Math.PI / 2;
  g.add(tip);
  // its little gear
  const gear = new THREE.Mesh(createGearGeometry({ teeth: 14, tipR: 0.55, rootR: 0.45, thickness: 0.1, holeR: 0.08 }), mat);
  gear.position.set(-0.5, 0.16, 0.4);
  g.add(gear);
  return g;
}

function buildDateIndicator() {
  const g = new THREE.Group();
  const mat = metal(COLORS.dateindicator, 0.32, 0.85);
  const gear = new THREE.Mesh(createGearGeometry({ teeth: 20, tipR: 0.85, rootR: 0.72, thickness: 0.1, holeR: 0.1 }), mat);
  gear.position.y = 0.06;
  g.add(gear);
  // domed cover hiding the little torsion spring
  g.add(mesh(new THREE.CylinderGeometry(0.55, 0.62, 0.12, 18), mat, 0, 0.17, 0));
  const finger = mesh(new THREE.BoxGeometry(0.85, 0.06, 0.12), metal(COLORS.steel, 0.3, 0.9), 0.6, 0.24, 0);
  finger.rotation.y = 0.3;
  g.add(finger);
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
  ctx.arc(cx, cy, S * 0.36, 0, Math.PI * 2, true);
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
  // inner teeth ring body
  const body = new THREE.Mesh(new THREE.CylinderGeometry(7.95, 7.95, 0.1, 64, 1, true),
    metal(0xd9d2bd, 0.5, 0.4));
  body.position.y = 0.1;
  g.add(body);
  const face = new THREE.Mesh(new THREE.RingGeometry(5.75, 7.95, 64),
    new THREE.MeshStandardMaterial({ map: drawDateRingTexture(), transparent: true, roughness: 0.6, metalness: 0.05 }));
  face.rotation.x = -Math.PI / 2;
  face.position.y = 0.16;
  g.add(face);
  // inner drive teeth (hinted)
  const teeth = new THREE.Mesh(createGearGeometry({ teeth: 31, tipR: 5.85, rootR: 5.68, thickness: 0.08, holeR: 5.5 }),
    metal(0xd9d2bd, 0.5, 0.4));
  teeth.position.y = 0.1;
  g.add(teeth);
  return g;
}

// ---- keyless works (dial side, at 3 o'clock) --------------------------------

function buildStem() {
  const g = new THREE.Group(); // origin where the stem crosses the plate edge zone
  const steelM = metal(COLORS.stem, 0.25, 0.95);
  // stem rod with a square mid-section
  const rod = mesh(new THREE.CylinderGeometry(0.11, 0.11, 3.6, 10), steelM, 0.3, 0.12, 0);
  rod.rotation.z = Math.PI / 2;
  g.add(rod);
  g.add(mesh(new THREE.BoxGeometry(1.1, 0.19, 0.19), steelM, -0.6, 0.12, 0));
  // winding pinion + sliding pinion (crown-toothed cones)
  g.add(mesh(new THREE.CylinderGeometry(0.42, 0.3, 0.3, 12), steelM, -1.35, 0.12, 0).rotateZ(Math.PI / 2));
  g.add(mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.3, 12), steelM, -0.75, 0.12, 0).rotateZ(Math.PI / 2));
  // the crown, knurled, sitting proud of the case edge
  const gold = metal(0xd8b978, 0.28, 0.95);
  const crown = mesh(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 16), gold, 2.2, 0.12, 0);
  crown.rotation.z = Math.PI / 2;
  g.add(crown);
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const k = mesh(new THREE.BoxGeometry(0.5, 0.07, 0.07), gold,
      2.2, 0.12 + Math.sin(a) * 0.62, Math.cos(a) * 0.62);
    k.rotation.x = -a;
    g.add(k);
  }
  return g;
}

function buildSettingLever() {
  const g = new THREE.Group();
  const mat = metal(COLORS.settinglever, 0.32, 0.85);
  const lever = new THREE.Mesh(createRoundedPlateGeometry(0.85, 2.4, 0.12, 0.3), mat);
  lever.position.y = 0.06;
  lever.rotation.y = -0.7;
  g.add(lever);
  // posts that lock into the stem groove and push the corrector
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.34, 10), metal(COLORS.steel, 0.3, 0.9), 0.7, 0.2, -0.55));
  g.add(mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.34, 10), metal(COLORS.steel, 0.3, 0.9), -0.6, 0.2, 0.75));
  // corrector lever, thinner, angled away
  const corr = new THREE.Mesh(createRoundedPlateGeometry(0.5, 2.0, 0.1, 0.22), mat);
  corr.position.set(-1.0, 0.05, 0.9);
  corr.rotation.y = 0.5;
  g.add(corr);
  return g;
}

function buildYoke() {
  const g = new THREE.Group();
  const mat = metal(COLORS.yoke, 0.32, 0.85);
  // long curved arm that shifts the sliding pinion
  const a1 = new THREE.Mesh(createRoundedPlateGeometry(0.42, 2.2, 0.1, 0.2), mat);
  a1.position.y = 0.1;
  a1.rotation.y = 1.0;
  g.add(a1);
  const a2 = new THREE.Mesh(createRoundedPlateGeometry(0.42, 1.6, 0.1, 0.2), mat);
  a2.position.set(-1.15, 0.1, 0.35);
  a2.rotation.y = 1.9;
  g.add(a2);
  // setting wheel riding its post
  const wheel = new THREE.Mesh(createGearGeometry({ teeth: 16, tipR: 0.62, rootR: 0.5, thickness: 0.1, holeR: 0.08 }),
    metal(COLORS.steel, 0.3, 0.9));
  wheel.position.set(0.95, 0.16, -0.7);
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
  const f1 = new THREE.Mesh(createRoundedPlateGeometry(0.3, 1.9, 0.1, 0.14), mat);
  f1.position.set(0.9, 0.16, -0.9);
  f1.rotation.y = 1.2;
  g.add(f1);
  const f2 = new THREE.Mesh(createRoundedPlateGeometry(0.3, 1.6, 0.1, 0.14), mat);
  f2.position.set(-0.9, 0.16, 1.0);
  f2.rotation.y = -1.1;
  g.add(f2);
  return g;
}

function buildPlate() {
  const g = new THREE.Group();
  const mat = metal(COLORS.plate, 0.42, 0.75);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(PLAN.plateR, PLAN.plateR, 1.2, 64), mat);
  plate.position.y = -0.6;
  g.add(plate);
  // jewel bearings visible at every pivot — the "map" the player fills in
  for (const key of ['barrel', 'center', 'third', 'fourth', 'escape', 'pallet', 'balance']) {
    const p = PLAN[key];
    const seat = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14), metal(COLORS.bridge, 0.4, 0.8), p.x, 0.02, p.y);
    g.add(seat);
    const j = jewel(0.16, 0.05);
    j.position.set(p.x, 0.05, p.y);
    g.add(j);
  }
  // engraved rim
  const rimGroove = new THREE.Mesh(new THREE.TorusGeometry(PLAN.plateR - 0.35, 0.025, 6, 64), metal(0x9096a2, 0.5, 0.6));
  rimGroove.rotation.x = Math.PI / 2;
  rimGroove.position.y = 0.005;
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

function drawDialTexture(style = 'cocktail') {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const cx = S / 2, cy = S / 2, R = S / 2;

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
      // leave room for the subdial
      const nx = cx + Math.cos(a) * R * 0.63;
      const ny = cy + Math.sin(a) * R * 0.63;
      const d = Math.hypot(nx - (cx + SUBDIAL.x * (R / 8.45)), ny - (cy + SUBDIAL.y * (R / 8.45)));
      if (d < 1.85 * (R / 8.45)) continue;
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

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function buildDial(style = 'cocktail') {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.CylinderGeometry(8.45, 8.45, 0.2, 64),
    new THREE.MeshStandardMaterial({ color: 0x20242c, roughness: 0.7, metalness: 0.1 }));
  base.position.y = 0.1;
  g.add(base);
  const face = new THREE.Mesh(new THREE.CircleGeometry(8.45, 64),
    new THREE.MeshStandardMaterial({ map: drawDialTexture(style), roughness: style === 'field' ? 0.75 : 0.45, metalness: style === 'field' ? 0.05 : 0.25 }));
  face.rotation.x = -Math.PI / 2; // local +y (canvas up / 12 o'clock) → world -z
  face.position.y = 0.205;
  g.add(face);
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
    depth: thickness, bevelEnabled: false, curveSegments: 4,
  });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(Math.PI / 2); // shape +y (12 o'clock) → world -z, flat in XZ
  return new THREE.Mesh(geo, metal(look.color, look.rough, look.metal));
}

export function buildHands(style = 'cocktail') {
  const look = HAND_LOOKS[style] || HAND_LOOKS.cocktail;
  const g = new THREE.Group(); // origin at dial center, y 0 = dial face
  const hourPivot = new THREE.Group();
  hourPivot.add(buildHand(look, 4.1, 0.7, 0.36));
  hourPivot.position.y = 0.12;
  const minutePivot = new THREE.Group();
  minutePivot.add(buildHand(look, 6.6, 0.9, 0.27));
  minutePivot.position.y = 0.24;
  const secondPivot = new THREE.Group();
  const sec = buildHand({ ...look, kind: 'baton' }, 1.35, 0.55, 0.07, 0.035);
  secondPivot.add(sec);
  secondPivot.position.set(SUBDIAL.x, 0.1, SUBDIAL.y);
  // center cap + subdial cap
  const capMat = metal(look.color, look.rough, look.metal);
  const cap = mesh(new THREE.CylinderGeometry(0.3, 0.34, 0.34, 16), capMat, 0, 0.17, 0);
  const scap = mesh(new THREE.CylinderGeometry(0.11, 0.13, 0.18, 12), capMat, SUBDIAL.x, 0.09, SUBDIAL.y);
  g.add(hourPivot, minutePivot, secondPivot, cap, scap);
  g.userData.hourPivot = hourPivot;
  g.userData.minutePivot = minutePivot;
  g.userData.secondPivot = secondPivot;
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
  const mat = metal(0x6e747f, 0.45, 0.7);
  g.add(new THREE.Mesh(createLatheRing([
    [8.6, 0], [9.6, 0], [9.8, 0.4], [9.8, 1.5], [9.4, 1.75], [8.6, 1.75],
  ], 64), mat));
  // three clamp tabs
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5;
    const tab = mesh(new THREE.BoxGeometry(0.9, 0.18, 0.5), mat,
      Math.cos(a) * 8.45, 1.72, Math.sin(a) * 8.45);
    tab.rotation.y = -a + Math.PI / 2;
    g.add(tab);
  }
  return g;
}

// ---------------------------------------------------------------------------
// Assembly-facing catalog
// ---------------------------------------------------------------------------
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
  add('center', buildTrainWheel({
    color: COLORS.center,
    wheel: { teeth: 54, tipR: 3.4, rootR: 3.14, thickness: 0.16, holeR: 0.14, spokes: 5, spokeInnerR: 0.7, spokeOuterR: 2.8, y: 1.9 },
    pinion: { teeth: 8, tipR: 0.85, rootR: 0.6, thickness: 0.6, holeR: 0.12, y: 0.45 },
    arborTop: 2.6,
  }));
  add('third', buildTrainWheel({
    color: COLORS.third,
    wheel: { teeth: 44, tipR: 2.6, rootR: 2.38, thickness: 0.14, holeR: 0.12, spokes: 4, spokeInnerR: 0.55, spokeOuterR: 2.1, y: 1.25 },
    pinion: { teeth: 7, tipR: 0.7, rootR: 0.48, thickness: 0.32, holeR: 0.1, y: 1.9 },
    arborTop: 2.15,
  }));
  add('fourth', buildTrainWheel({
    color: COLORS.fourth,
    wheel: { teeth: 40, tipR: 2.2, rootR: 2.0, thickness: 0.14, holeR: 0.12, spokes: 4, spokeInnerR: 0.5, spokeOuterR: 1.75, y: 0.65 },
    pinion: { teeth: 7, tipR: 0.65, rootR: 0.44, thickness: 0.3, holeR: 0.1, y: 1.25 },
    arborTop: 2.05,
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
  add('hands', buildHands());

  return parts;
}

export { buildPlate, buildCase };
