// Procedural geometry for watch parts: gears, pinions, escape wheels, spiral springs.
// All geometries are Y-up, centered at origin, lying flat in the XZ plane.
import * as THREE from 'three';

function polar(shapeOrPath, r, a, move = false) {
  const x = Math.cos(a) * r;
  const y = Math.sin(a) * r;
  if (move) shapeOrPath.moveTo(x, y);
  else shapeOrPath.lineTo(x, y);
}

// Trapezoidal-toothed wheel. Teeth flanks are straight; root lands are arcs.
// `lean` skews the tooth window (±1 = full saw: one near-radial flank, one
// long slope) for ratchet wheels. Tooth centers sit at shape angle
// (i + 0.275 + 0.13·lean)·step — the phase-alignment math depends on this.
export function createGearGeometry({
  teeth = 24,
  tipR = 3,
  rootR = 2.7,
  thickness = 0.3,
  holeR = 0.18,
  spokes = 0, // number of cutouts; 0 = solid web
  spokeInnerR = 0.8,
  spokeOuterR = 2.2,
  spokeWidth = 0.42, // solid material left between cutouts (world units at inner radius)
  lean = 0,
} = {}) {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  const skew = 0.13 * lean;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    polar(shape, rootR, a, i === 0);
    polar(shape, tipR, a + (0.15 + skew) * step);
    polar(shape, tipR, a + (0.40 + skew) * step);
    polar(shape, rootR, a + 0.55 * step);
    polar(shape, rootR, a + 0.775 * step); // root arc midpoint
  }
  shape.closePath();

  if (holeR > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }

  if (spokes > 0) {
    const span = (Math.PI * 2) / spokes;
    const margin = spokeWidth / 2 / spokeInnerR; // radians of solid material at inner radius
    for (let k = 0; k < spokes; k++) {
      const a0 = k * span + margin;
      const a1 = (k + 1) * span - margin;
      if (a1 <= a0) continue;
      const cut = new THREE.Path();
      cut.absarc(0, 0, spokeInnerR, a0, a1, false);
      cut.absarc(0, 0, spokeOuterR, a1, a0, true);
      cut.closePath();
      shape.holes.push(cut);
    }
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.08,
    bevelSize: 0.015,
    bevelSegments: 1,
    curveSegments: 6,
  });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// Escape wheel: backward-leaning club teeth, unmistakable silhouette.
export function createEscapeWheelGeometry({
  teeth = 15,
  tipR = 1.7,
  rootR = 1.25,
  thickness = 0.14,
  holeR = 0.1,
} = {}) {
  const shape = new THREE.Shape();
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    polar(shape, tipR, a, i === 0);                 // sharp tip
    polar(shape, tipR * 0.94, a + 0.10 * step);     // little club foot
    polar(shape, rootR, a + 0.42 * step);           // long leaning back face
    polar(shape, rootR, a + 0.71 * step);           // root arc midpoints
    polar(shape, rootR * 1.01, a + 0.94 * step);    // ramp up to next tip
  }
  shape.closePath();
  const hole = new THREE.Path();
  hole.absarc(0, 0, holeR, 0, Math.PI * 2, true);
  shape.holes.push(hole);
  // light 4-spoke web
  const spokes = 4;
  const span = (Math.PI * 2) / spokes;
  for (let k = 0; k < spokes; k++) {
    const a0 = k * span + 0.22;
    const a1 = (k + 1) * span - 0.22;
    const cut = new THREE.Path();
    cut.absarc(0, 0, 0.35, a0, a1, false);
    cut.absarc(0, 0, rootR * 0.78, a1, a0, true);
    cut.closePath();
    shape.holes.push(cut);
  }
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.22,
    bevelSize: 0.012,
    bevelSegments: 1,
    curveSegments: 5,
  });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(-Math.PI / 2);
  return geo;
}

// Flat archimedean spiral with a rectangular cross-section (mainspring / hairspring).
// Non-indexed so faces stay crisp on the thin edges.
export function createSpiralGeometry({
  turns = 5.5,
  innerR = 0.5,
  outerR = 1.9,
  bandHeight = 0.55, // along Y
  bandThickness = 0.06,
  segmentsPerTurn = 42,
} = {}) {
  const segs = Math.ceil(turns * segmentsPerTurn);
  const positions = [];
  const halfT = bandThickness / 2;
  const halfH = bandHeight / 2;

  // sample points + in-plane normals
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const a = t * turns * Math.PI * 2;
    const r = innerR + (outerR - innerR) * t;
    const cx = Math.cos(a), sx = Math.sin(a);
    // tangent of archimedean spiral: d/da (r(a)·[cos,sin])
    const dr = (outerR - innerR) / (turns * Math.PI * 2);
    let tx = dr * cx - r * sx;
    let tz = dr * sx + r * cx;
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    // in-plane normal (points outward)
    const nx = tz, nz = -tx;
    pts.push({ x: cx * r, z: sx * r, nx, nz });
  }

  const quad = (ax, ay, az, bx, by, bz, cx, cy, cz, dx, dy, dz) => {
    positions.push(ax, ay, az, bx, by, bz, cx, cy, cz, ax, ay, az, cx, cy, cz, dx, dy, dz);
  };

  for (let i = 0; i < segs; i++) {
    const p = pts[i], q = pts[i + 1];
    // corner rails: outer/inner × top/bottom
    const po = { x: p.x + p.nx * halfT, z: p.z + p.nz * halfT };
    const pi = { x: p.x - p.nx * halfT, z: p.z - p.nz * halfT };
    const qo = { x: q.x + q.nx * halfT, z: q.z + q.nz * halfT };
    const qi = { x: q.x - q.nx * halfT, z: q.z - q.nz * halfT };
    // outer face
    quad(po.x, -halfH, po.z, qo.x, -halfH, qo.z, qo.x, halfH, qo.z, po.x, halfH, po.z);
    // inner face
    quad(pi.x, halfH, pi.z, qi.x, halfH, qi.z, qi.x, -halfH, qi.z, pi.x, -halfH, pi.z);
    // top edge
    quad(po.x, halfH, po.z, qo.x, halfH, qo.z, qi.x, halfH, qi.z, pi.x, halfH, pi.z);
    // bottom edge
    quad(pi.x, -halfH, pi.z, qi.x, -halfH, qi.z, qo.x, -halfH, qo.z, po.x, -halfH, po.z);
  }
  // end caps
  const first = pts[0], last = pts[segs];
  for (const [p, flip] of [[first, false], [last, true]]) {
    const ox = p.x + p.nx * halfT, oz = p.z + p.nz * halfT;
    const ix = p.x - p.nx * halfT, iz = p.z - p.nz * halfT;
    if (flip) quad(ox, -halfH, oz, ox, halfH, oz, ix, halfH, iz, ix, -halfH, iz);
    else quad(ox, -halfH, oz, ix, -halfH, iz, ix, halfH, iz, ox, halfH, oz);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.computeVertexNormals();
  return geo;
}

// Simple filleted ring/disc via lathe (barrel drums, bezels, holders).
export function createLatheRing(profilePoints, radialSegments = 48) {
  const pts = profilePoints.map(([r, y]) => new THREE.Vector2(r, y));
  return new THREE.LatheGeometry(pts, radialSegments);
}

// Rounded-rectangle extruded plate (bridge arms, fork bodies).
export function createRoundedPlateGeometry(w, l, thickness, r = 0.2, curveSegments = 4) {
  const shape = new THREE.Shape();
  const hw = w / 2, hl = l / 2;
  shape.moveTo(-hw + r, -hl);
  shape.lineTo(hw - r, -hl);
  shape.absarc(hw - r, -hl + r, r, -Math.PI / 2, 0, false);
  shape.lineTo(hw, hl - r);
  shape.absarc(hw - r, hl - r, r, 0, Math.PI / 2, false);
  shape.lineTo(-hw + r, hl);
  shape.absarc(-hw + r, hl - r, r, Math.PI / 2, Math.PI, false);
  shape.lineTo(-hw, -hl + r);
  shape.absarc(-hw + r, -hl + r, r, Math.PI, Math.PI * 1.5, false);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness,
    bevelEnabled: true,
    bevelThickness: thickness * 0.15,
    bevelSize: 0.03,
    bevelSegments: 1,
    curveSegments,
  });
  geo.translate(0, 0, -thickness / 2);
  geo.rotateX(-Math.PI / 2);
  return geo;
}
