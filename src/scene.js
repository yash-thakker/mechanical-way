// Renderer, camera, lights, and the watchmaker's bench.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PLAN } from './parts/watchParts.js';

// Radiance environment the metals reflect: a miniature of the TVA hallway
// (warm ceiling discs, travertine fins, the orange/mustard stripe, a hot
// lamp-side accent) instead of a neutral photo studio. MeshBasicMaterial
// colors above 1.0 read as HDR emitters through PMREM.
function buildEnvironmentScene() {
  const env = new THREE.Scene();
  const plane = (w, h, color, x, y, z, rx = 0, ry = 0) => {
    const c = new THREE.Color();
    Array.isArray(color) ? c.setRGB(...color) : c.set(color);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide })
    );
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    env.add(m);
    return m;
  };
  // room shell: warm chocolate ceiling field, travertine walls, dark floor
  plane(60, 60, [0.055, 0.032, 0.018], 0, 14, 0, Math.PI / 2);
  plane(60, 60, [0.03, 0.02, 0.013], 0, -6, 0, -Math.PI / 2);
  plane(60, 20, [0.17, 0.145, 0.105], 0, 4, -30);
  plane(60, 20, [0.14, 0.12, 0.085], 0, 4, 30, 0, Math.PI);
  plane(60, 20, [0.17, 0.14, 0.10], -30, 4, 0, 0, Math.PI / 2);
  plane(60, 20, [0.13, 0.11, 0.08], 30, 4, 0, 0, -Math.PI / 2);
  // ceiling discs: the dominant warm light source, in a grid overhead
  const discGeo = new THREE.CircleGeometry(2.6, 24);
  const discMat = new THREE.MeshBasicMaterial({ color: new THREE.Color().setRGB(2.6, 2.3, 1.85) });
  for (let gx = -18; gx <= 18; gx += 9) {
    for (let gz = -18; gz <= 18; gz += 9) {
      const d = new THREE.Mesh(discGeo, discMat);
      d.position.set(gx, 13.8, gz);
      d.rotation.x = Math.PI / 2;
      env.add(d);
    }
  }
  // the supergraphic stripe pair on one wall — warm color in the reflections
  plane(7, 20, [0.85, 0.34, 0.08], -6, 4, -29.5);
  plane(7, 20, [0.8, 0.57, 0.11], 1, 4, -29.5);
  // hot lamp-side accent, low on the left, where the desk lamp burns
  const hot = plane(6, 5, [4.2, 2.0, 0.6], -26, 3, 6, 0, Math.PI / 2);
  hot.rotation.x = 0.35;
  return env;
}

function drawBenchTexture() {
  const W = 1024, H = 768;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  // dark leather mat with a warm center glow
  const grad = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, W * 0.62);
  grad.addColorStop(0, '#332619');
  grad.addColorStop(0.55, '#2a1f14');
  grad.addColorStop(1, '#1d150d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // faint leather grain
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${20 + Math.random() * 40}, ${16 + Math.random() * 28}, ${10 + Math.random() * 16}, 0.08)`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 3, 1 + Math.random() * 2);
  }

  // stitched border
  ctx.strokeStyle = 'rgba(200, 155, 60, 0.35)';
  ctx.lineWidth = 3;
  ctx.setLineDash([14, 10]);
  ctx.strokeRect(26, 26, W - 52, H - 52);
  ctx.setLineDash([]);

  // ---- blueprint etching: the gear-train plan, printed on the mat ----------
  // world→canvas: bench plane is 46 x 34.5 world units
  const pxu = W / 46; // px per world unit
  const toC = (x, z) => [W / 2 + x * pxu, H / 2 + z * pxu];

  // decorative schematic in the far-left corner, clear of the tool roll
  const bx = -14.5, bz = -9.0, s = 0.55;
  ctx.strokeStyle = 'rgba(200, 155, 60, 0.28)';
  ctx.fillStyle = 'rgba(200, 155, 60, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.font = `500 ${Math.round(pxu * 0.62)}px "IBM Plex Mono", monospace`;
  ctx.textAlign = 'center';

  const rings = [
    ['barrel', 3.6, 'BARREL'],
    ['center', 3.4, 'CENTER'],
    ['third', 2.6, 'III'],
    ['fourth', 2.2, 'IV'],
    ['escape', 1.7, 'ESC'],
    ['balance', 2.35, 'BAL'],
  ];
  for (const [key, r, label] of rings) {
    const p = PLAN[key];
    const [cx, cy] = toC(bx + p.x * s, bz + p.y * s);
    ctx.beginPath();
    ctx.arc(cx, cy, r * s * pxu, 0, Math.PI * 2);
    ctx.stroke();
    // center cross
    ctx.beginPath();
    ctx.moveTo(cx - 4, cy); ctx.lineTo(cx + 4, cy);
    ctx.moveTo(cx, cy - 4); ctx.lineTo(cx, cy + 4);
    ctx.stroke();
    ctx.fillText(label, cx, cy - r * s * pxu - 4);
  }
  const [ox, oy] = toC(bx, bz + 6.2);
  ctx.fillText('FIG. 1 · THE GOING TRAIN', ox, oy + 14);

  // outline where the movement holder sits
  const [mx, my] = toC(0, 0);
  ctx.strokeStyle = 'rgba(200, 155, 60, 0.18)';
  ctx.beginPath();
  ctx.arc(mx, my, 10.4 * pxu, 0, Math.PI * 2);
  ctx.stroke();

  // department stamp, top-right of the mat, slightly askew
  const [sx, sy] = toC(13.6, -13.2);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(-0.06);
  ctx.strokeStyle = 'rgba(255, 122, 26, 0.30)';
  ctx.fillStyle = 'rgba(255, 122, 26, 0.34)';
  ctx.lineWidth = 2.5;
  const stampW = 15.5 * pxu * 0.55, stampH = 2.6 * pxu * 0.55;
  ctx.strokeRect(-stampW / 2, -stampH / 2, stampW, stampH);
  ctx.font = `700 ${Math.round(pxu * 0.66)}px "IBM Plex Mono", monospace`;
  ctx.fillText('PROPERTY OF THE HOROLOGY DEPT.', 0, pxu * 0.24);
  ctx.restore();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Where each part waits before assembly (world XZ). Parts tray sits on the
// RIGHT of the bench; the tool roll lives on the left. Slots mark where a
// part's VISUAL center goes (main.js recenters each part by its bounding box,
// so off-origin builds like the bridges land square on their slot). Spacing
// was checked against half-scale bounding radii of every group that shares
// the tray at the same time: the ten phase-1 parts, the four click-system
// parts, and the auto-winding pair. One-at-a-time reveals may share slots.
export const HOME_POSITIONS = {
  // phase 1: all ten out together
  barrel: [13.3, -6.4], mainspring: [17.6, -6.4],
  lid: [13.3, -2.4], center: [17.6, -2.4],
  third: [13.3, 1.6], fourth: [17.6, 1.6],
  bridge: [15.4, 5.6], // big and off-center: gets a full row to itself
  pallet: [12.9, 9.6], escape: [15.3, 9.6], balance: [17.95, 9.6],
  // click system (arrives together in the emptied tray)
  barrelbridge: [15.4, -4.8], ratchet: [13.3, -0.4], crownwheel: [17.6, -0.4], click: [15.4, 2.8],
  // auto-winding pair
  reversers: [15.4, -3.6], rotor: [15.4, 11.0],
  // dial-side parts appear one at a time, so the tray middle is theirs
  cannon: [15.4, 0.4], minutewheel: [15.4, 2.4], hourwheel: [15.4, 4.4],
  stem: [15.4, -1.6], settinglever: [15.4, 0.4], yoke: [15.4, 2.4], jumper: [15.4, 4.4],
  datejumper: [15.4, -1.6], dateindicator: [15.4, 0.4], datering: [15.4, 11.0],
  dial: [15.4, 11.0],
  hourhand: [15.4, 1.4], minutehand: [15.4, 1.4], secondhand: [15.4, 1.4],
};

function drawWoodTexture() {
  const W = 1024, H = 1024;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#241a12';
  ctx.fillRect(0, 0, W, H);
  // long walnut grain streaks with occasional darker seams
  for (let i = 0; i < 240; i++) {
    const y = Math.random() * H;
    const warm = 20 + Math.random() * 26;
    ctx.strokeStyle = `rgba(${warm + 22}, ${warm + 6}, ${warm - 8}, ${0.10 + Math.random() * 0.16})`;
    ctx.lineWidth = 1 + Math.random() * 3.5;
    ctx.beginPath();
    ctx.moveTo(-20, y);
    ctx.bezierCurveTo(W * 0.3, y + (Math.random() - 0.5) * 26, W * 0.7, y + (Math.random() - 0.5) * 26, W + 20, y + (Math.random() - 0.5) * 14);
    ctx.stroke();
  }
  for (let i = 0; i < 7; i++) {
    const y = Math.random() * H;
    ctx.strokeStyle = 'rgba(10, 6, 3, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.bezierCurveTo(W * 0.35, y + 10, W * 0.65, y - 10, W, y + 4);
    ctx.stroke();
  }
  // faint knots
  for (let i = 0; i < 5; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const kn = ctx.createRadialGradient(x, y, 2, x, y, 26);
    kn.addColorStop(0, 'rgba(16, 9, 4, 0.55)');
    kn.addColorStop(1, 'rgba(16, 9, 4, 0)');
    ctx.fillStyle = kn;
    ctx.beginPath();
    ctx.arc(x, y, 26, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}

function drawFeltTexture() {
  const S = 512;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#30251a';
  ctx.fillRect(0, 0, S, S);
  // short fiber flecks in both directions read as brushed felt
  for (let i = 0; i < 3200; i++) {
    const l = 18 + Math.random() * 30;
    ctx.fillStyle = `rgba(${l + 22}, ${l + 10}, ${l - 4}, ${0.05 + Math.random() * 0.08})`;
    const x = Math.random() * S, y = Math.random() * S;
    const a = Math.random() * Math.PI;
    ctx.fillRect(x, y, Math.cos(a) * 4, 1);
  }
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

function buildTray() {
  const g = new THREE.Group();
  const woodTex = drawWoodTexture();
  woodTex.repeat.set(0.6, 0.12);
  const wood = new THREE.MeshStandardMaterial({ map: woodTex, color: 0x8a6b4d, roughness: 0.72, metalness: 0.05 });
  const felt = new THREE.MeshStandardMaterial({ map: drawFeltTexture(), roughness: 0.97, metalness: 0 });
  const brassTrim = new THREE.MeshStandardMaterial({ color: 0xc89b3c, roughness: 0.35, metalness: 0.9, envMapIntensity: 1.2 });
  // sized so the widest tenants (the date ring, the dial, the rotor) rest
  // fully inside the felt at half scale
  const W = 8.6, D = 24.0, cx = 15.4, cz = 3.6;
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, 0.35, D), felt);
  base.position.set(cx, 0.17, cz);
  base.receiveShadow = true;
  g.add(base);
  const wallGeoX = new THREE.BoxGeometry(W + 0.5, 0.6, 0.25);
  const wallGeoZ = new THREE.BoxGeometry(0.25, 0.6, D + 0.5);
  const trimGeoX = new THREE.BoxGeometry(W + 0.56, 0.05, 0.29);
  const trimGeoZ = new THREE.BoxGeometry(0.29, 0.05, D + 0.56);
  for (const [gx, gz, geo, trimGeo] of [
    [cx, cz - D / 2 - 0.12, wallGeoX, trimGeoX], [cx, cz + D / 2 + 0.12, wallGeoX, trimGeoX],
    [cx - W / 2 - 0.12, cz, wallGeoZ, trimGeoZ], [cx + W / 2 + 0.12, cz, wallGeoZ, trimGeoZ],
  ]) {
    const w = new THREE.Mesh(geo, wood);
    w.position.set(gx, 0.3, gz);
    w.castShadow = true;
    w.receiveShadow = true;
    g.add(w);
    // slim brass cap rail along each wall top
    const t = new THREE.Mesh(trimGeo, brassTrim);
    t.position.set(gx, 0.62, gz);
    g.add(t);
  }
  // riveted brass corner brackets
  for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const corner = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.68, 0.5), brassTrim);
    corner.position.set(cx + sx * (W / 2 + 0.12), 0.32, cz + sz * (D / 2 + 0.12));
    g.add(corner);
  }
  return g;
}

// ---------------------------------------------------------------------------
// TVA hallway backdrop (after Jene Yeo's Loki still): a chocolate ceiling of
// recessed cream light discs, travertine fin walls, a giant weathered
// supergraphic with diagonal stripes on the back wall, a striped runner on
// the floor, and an amber dot-matrix ticker crawling overhead.
// ---------------------------------------------------------------------------

const TVA = {
  chocolate: '#26150c',
  disc: '#ece0cb',
  bulb: '#fff6e0',
  travertine: '#9f8d72',
  travertineDark: '#71624c',
  burgundy: '#6e2318',
  orange: '#d96a1e',
  mustard: '#d9a624',
  terracotta: '#7d3f24',
  cream: '#cfc0a4',
};

function grunge(ctx, W, H, alpha = 0.06, n = 900) {
  for (let i = 0; i < n; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '20,12,6' : '235,225,205'}, ${Math.random() * alpha})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 4, 1 + Math.random() * 4);
  }
}

function drawCeilingTexture() {
  const S = 1024;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = TVA.chocolate;
  ctx.fillRect(0, 0, S, S);
  // recessed cream discs in a grid, each with a hot little bulb
  const step = 256;
  for (let y = step / 2; y < S; y += step) {
    for (let x = step / 2; x < S; x += step) {
      const r = 104;
      const disc = ctx.createRadialGradient(x - r * 0.25, y - r * 0.25, r * 0.2, x, y, r);
      disc.addColorStop(0, '#f4ead8');
      disc.addColorStop(0.75, TVA.disc);
      disc.addColorStop(1, '#c9b998');
      ctx.fillStyle = disc;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      // recess shadow rim
      ctx.strokeStyle = 'rgba(30, 16, 8, 0.55)';
      ctx.lineWidth = 7;
      ctx.stroke();
      // center bulb + glow
      const glow = ctx.createRadialGradient(x, y, 2, x, y, 40);
      glow.addColorStop(0, 'rgba(255, 250, 235, 1)');
      glow.addColorStop(0.35, 'rgba(255, 236, 200, 0.85)');
      glow.addColorStop(1, 'rgba(255, 230, 190, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 40, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  grunge(ctx, S, S, 0.05, 500);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}

function drawSideWallTexture() {
  const W = 2048, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  // travertine base, darker toward the floor
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#84745c');
  g.addColorStop(0.25, TVA.travertine);
  g.addColorStop(1, '#5b4d3b');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // marching vertical fins: lit face + deep shadow gap
  const fin = 128;
  for (let x = 0; x < W; x += fin) {
    ctx.fillStyle = 'rgba(255, 230, 190, 0.10)';
    ctx.fillRect(x, 0, fin * 0.42, H);
    ctx.fillStyle = 'rgba(22, 12, 6, 0.5)';
    ctx.fillRect(x + fin * 0.42, 0, fin * 0.12, H);
  }
  // warm fluorescent cove strip
  const strip = ctx.createLinearGradient(0, H * 0.30, 0, H * 0.40);
  strip.addColorStop(0, 'rgba(255, 215, 160, 0)');
  strip.addColorStop(0.5, 'rgba(255, 215, 160, 0.75)');
  strip.addColorStop(1, 'rgba(255, 215, 160, 0)');
  ctx.fillStyle = strip;
  ctx.fillRect(0, H * 0.30, W, H * 0.10);
  // orange lockers + dark doors along the base
  for (let x = 90; x < W; x += 512) {
    ctx.fillStyle = '#b34f16';
    ctx.fillRect(x, H * 0.55, 150, H * 0.45);
    ctx.fillStyle = 'rgba(30, 14, 6, 0.5)';
    ctx.fillRect(x + 71, H * 0.55, 8, H * 0.45);
    ctx.fillStyle = '#2a1a10';
    ctx.fillRect(x + 260, H * 0.60, 105, H * 0.40);
  }
  grunge(ctx, W, H, 0.07, 1200);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  return tex;
}

function drawBackWallTexture() {
  const W = 2048, H = 512;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  // weathered cream panels
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, TVA.cream);
  g.addColorStop(0.8, '#b3a385');
  g.addColorStop(1, '#6f6350');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  // faint panel seams
  ctx.strokeStyle = 'rgba(60, 44, 28, 0.25)';
  ctx.lineWidth = 3;
  for (const x of [0.25, 0.5, 0.75]) {
    ctx.beginPath(); ctx.moveTo(W * x, 0); ctx.lineTo(W * x, H); ctx.stroke();
  }
  // Diagonal stripes CONTINUE the floor runner up the wall (one graphic that
  // bends at the base, as in the reference). Wall texture: 2048px = 150 world,
  // floor line (world y=0) sits at y = (18/38)*512; the 13-world-wide runner
  // arrives centered, so each color meets the wall 88.7px wide.
  const floorY = (18 / 38) * H;             // ≈ 242
  const cut = (6.5 / 150) * W;              // horizontal footprint per color
  const a = 0.62;                            // lean up-right
  const w = cut * Math.cos(a);              // perpendicular stripe width
  ctx.save();
  ctx.translate(W / 2 - cut, floorY);
  ctx.rotate(a);
  ctx.fillStyle = TVA.orange;
  ctx.fillRect(0, H, w, -H * 6);            // start below the floor line
  ctx.fillStyle = TVA.mustard;
  ctx.fillRect(w, H, w, -H * 6);
  ctx.restore();
  // the giant burgundy supergraphic — this bench lives in Horology Dept. 4
  ctx.fillStyle = TVA.burgundy;
  ctx.font = '400 260px Righteous, Georgia, serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillText('H.4', W * 0.26, (18 / 38) * H - 8);
  // weathering: peel speckles knock paint back to plaster
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 380; i++) {
    ctx.globalAlpha = Math.random() * 0.5;
    ctx.beginPath();
    ctx.arc(Math.random() * W, Math.random() * H, Math.random() * 7, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  grunge(ctx, W, H, 0.08, 1500);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawRunnerTexture() {
  const W = 512, H = 1024;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = TVA.orange;
  ctx.fillRect(0, 0, W / 2, H);
  ctx.fillStyle = TVA.mustard;
  ctx.fillRect(W / 2, 0, W / 2, H);
  // carpet pile: horizontal weave lines + heavy traffic wear down the middle
  for (let y = 0; y < H; y += 4) {
    ctx.fillStyle = `rgba(30, 16, 8, ${0.04 + Math.random() * 0.05})`;
    ctx.fillRect(0, y, W, 1.6);
  }
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const wear = ctx.createRadialGradient(x, y, 4, x, y, 30 + Math.random() * 50);
    wear.addColorStop(0, 'rgba(240, 225, 190, 0.09)');
    wear.addColorStop(1, 'rgba(240, 225, 190, 0)');
    ctx.fillStyle = wear;
    ctx.fillRect(0, 0, W, H);
  }
  // stitched selvedge along both edges and the color seam
  ctx.strokeStyle = 'rgba(40, 20, 8, 0.55)';
  ctx.lineWidth = 5;
  ctx.setLineDash([18, 12]);
  for (const x of [10, W / 2, W - 10]) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, H);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  grunge(ctx, W, H, 0.12, 1400);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawTickerTexture() {
  const W = 2048, H = 160;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#0f0b08';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#ffb734';
  ctx.font = '700 78px "IBM Plex Mono", monospace';
  ctx.textBaseline = 'middle';
  ctx.fillText('HOROLOGY DEPT.  ·  BRANCH STABLE  ·  VARIANT: WATCHMAKER  ·  STATUS: ASSEMBLING  ·  ', 0, H / 2 + 4);
  // punch an LED grid through the glyphs
  ctx.globalCompositeOperation = 'destination-out';
  ctx.fillStyle = 'rgba(0,0,0,1)';
  for (let x = 0; x < W; x += 8) ctx.fillRect(x, 0, 2.5, H);
  for (let y = 0; y < H; y += 8) ctx.fillRect(0, y, W, 2.5);
  ctx.globalCompositeOperation = 'source-over';
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function buildBackdrop(scene) {
  const group = new THREE.Group();

  // ceiling of glowing discs
  const ceiling = new THREE.Mesh(
    new THREE.PlaneGeometry(190, 190),
    new THREE.MeshBasicMaterial({ map: drawCeilingTexture() })
  );
  ceiling.rotation.x = Math.PI / 2; // face down
  ceiling.position.y = 18;
  group.add(ceiling);

  // back wall with the supergraphic (the default camera faces -z)
  const back = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 38),
    new THREE.MeshBasicMaterial({ map: drawBackWallTexture(), color: 0xb6a996 })
  );
  back.position.set(0, -1, -64);
  group.add(back);

  // fin walls left / right, and one behind the camera to close the room
  const sideTex = drawSideWallTexture();
  for (const [x, ry] of [[-58, Math.PI / 2], [58, -Math.PI / 2]]) {
    const wall = new THREE.Mesh(
      new THREE.PlaneGeometry(150, 38),
      new THREE.MeshBasicMaterial({ map: sideTex })
    );
    wall.position.set(x, -1, -10);
    wall.rotation.y = ry;
    group.add(wall);
  }
  const rear = new THREE.Mesh(
    new THREE.PlaneGeometry(150, 38),
    new THREE.MeshBasicMaterial({ map: sideTex })
  );
  rear.position.set(0, -1, 62);
  rear.rotation.y = Math.PI;
  group.add(rear);

  // striped runner on the floor, leading to the supergraphic
  const runner = new THREE.Mesh(
    new THREE.PlaneGeometry(13, 46),
    new THREE.MeshBasicMaterial({ map: drawRunnerTexture(), color: 0xcfc2b0 })
  );
  runner.rotation.x = -Math.PI / 2;
  runner.position.set(0, -0.02, -41);
  group.add(runner);
  // terracotta carpet fields flanking the concrete
  for (const x of [-33, 33]) {
    const carpet = new THREE.Mesh(
      new THREE.PlaneGeometry(46, 34),
      new THREE.MeshBasicMaterial({ color: 0x63301b })
    );
    carpet.rotation.x = -Math.PI / 2;
    carpet.position.set(x, -0.03, -32);
    group.add(carpet);
  }

  // amber dot-matrix ticker hanging over the hallway
  const tickerTex = drawTickerTexture();
  tickerTex.repeat.set(0.55, 1);
  const ticker = new THREE.Mesh(
    new THREE.PlaneGeometry(30, 2.4),
    new THREE.MeshBasicMaterial({ map: tickerTex, transparent: true })
  );
  ticker.position.set(0, 13, -46);
  group.add(ticker);
  const tickerFrame = new THREE.Mesh(
    new THREE.PlaneGeometry(31, 3.2),
    new THREE.MeshBasicMaterial({ color: 0x0a0705 })
  );
  tickerFrame.position.set(0, 13, -46.1);
  group.add(tickerFrame);

  scene.add(group);
  return {
    group,
    update(dt) {
      tickerTex.offset.x += dt * 0.045; // the eternal TVA crawl
    },
  };
}


export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x170e07);
  scene.fog = new THREE.Fog(0x1f1207, 46, 150); // warm TVA haze; walls sit deep in it

  // Portrait viewports lose horizontal FOV; widen the vertical FOV there so
  // the movement and both bench sides stay reachable on phones.
  const fovForAspect = (a) => (a < 0.8 ? 54 : 40);
  const camera = new THREE.PerspectiveCamera(
    fovForAspect(window.innerWidth / window.innerHeight),
    window.innerWidth / window.innerHeight, 0.1, 200
  );
  camera.position.set(0, 26, 24); // intro position; tweened down on start

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = buildEnvironmentScene();
  scene.environment = pmrem.fromScene(envScene, 0.06).texture;
  envScene.traverse((o) => { if (o.isMesh) o.geometry.dispose(); });
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xfff2dd, 0x33241a, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffe7c4, 2.1);
  key.position.set(7, 16, 6);
  key.castShadow = true;
  // frustum hugs the props exactly (lamp base -19.2, tray wall +19.8, roll
  // z -15.9, tray z +15.7) — wasted frustum is blurred screw shadows
  key.shadow.camera.left = -21;
  key.shadow.camera.right = 21;
  key.shadow.camera.top = 17;
  key.shadow.camera.bottom = -17;
  key.shadow.camera.near = 2;
  key.shadow.camera.far = 60;
  key.shadow.mapSize.setScalar(window.innerWidth <= 820 ? 1024 : 2048);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.035;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffd9a0, 0.55);
  fill.position.set(-9, 9, -5);
  scene.add(fill);
  // cool rim from behind separates the steel movement from the warm mat
  const rim = new THREE.DirectionalLight(0xaec4f0, 0.5);
  rim.position.set(-4, 7, -14);
  scene.add(rim);

  // bench mat
  const bench = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 34.5),
    new THREE.MeshStandardMaterial({ map: drawBenchTexture(), roughness: 0.92, metalness: 0.02 })
  );
  bench.rotation.x = -Math.PI / 2;
  bench.receiveShadow = true;
  scene.add(bench);

  // wooden table extending beyond the mat
  const tableTex = drawWoodTexture();
  tableTex.repeat.set(3, 2.2);
  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 120),
    new THREE.MeshStandardMaterial({ map: tableTex, roughness: 0.88, metalness: 0 })
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.05;
  table.receiveShadow = true;
  scene.add(table);

  const tray = buildTray();
  scene.add(tray);

  // warm work-light pool over the tool-roll side (an invisible source, like
  // the key light): a soft omni for the pool plus a shadow-casting spot so
  // the parts still throw grounded shadows on the mat
  const workPoint = new THREE.PointLight(0xff8a2a, 12, 28, 2);
  workPoint.position.set(-13.2, 6.9, 5.2);
  scene.add(workPoint);
  const workSpot = new THREE.SpotLight(0xff9a3a, 160, 34, 0.58, 0.5, 2);
  workSpot.position.set(-13.2, 6.9, 5.2);
  workSpot.castShadow = true;
  workSpot.shadow.mapSize.setScalar(1024);
  workSpot.shadow.camera.near = 1.5;
  workSpot.shadow.camera.far = 34;
  workSpot.shadow.bias = -0.0003;
  workSpot.shadow.normalBias = 0.03;
  workSpot.target.position.set(-5, 0, 1.5);
  scene.add(workSpot);
  scene.add(workSpot.target);

  scene.add(buildBenchDressing());

  const backdrop = buildBackdrop(scene);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 7;
  controls.maxDistance = 47; // portrait rests farther out
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = 1.25;
  controls.target.set(0, 1.6, 2.2);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = fovForAspect(camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, controls, tray, backdrop };
}

// Loose bench clutter — decorative only, never raycast targets. Fills the
// dead mat space around the movement without crowding drag paths.
function buildBenchDressing() {
  const g = new THREE.Group();
  const brass = new THREE.MeshStandardMaterial({ color: 0xc89b3c, roughness: 0.34, metalness: 0.9, envMapIntensity: 1.2 });
  const steel = new THREE.MeshStandardMaterial({ color: 0x9aa0ad, roughness: 0.3, metalness: 0.9 });

  // brass parts dish with spare screws, back-right of the movement
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.2, 0.4, 24, 1, true), brass);
  dish.position.set(7.8, 0.2, -9.5);
  dish.material = dish.material.clone();
  dish.material.side = THREE.DoubleSide;
  const dishBase = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 0.08, 24), brass);
  dishBase.position.set(7.8, 0.05, -9.5);
  dish.castShadow = dishBase.castShadow = true;
  g.add(dish, dishBase);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.4;
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.3, 8), steel);
    s.position.set(7.8 + Math.cos(a) * (0.3 + (i % 3) * 0.22), 0.16, -9.5 + Math.sin(a) * (0.3 + (i % 3) * 0.22));
    // spilled, not arranged: each screw lies at its own angle and tilt
    s.rotation.set(Math.PI / 2 + (Math.random() - 0.5) * 0.35, 0, Math.random() * Math.PI * 2);
    g.add(s);
  }

  // folded polishing cloth, back-left — woven, not a bare white quad
  const clothCv = document.createElement('canvas');
  clothCv.width = clothCv.height = 256;
  {
    const cctx = clothCv.getContext('2d');
    cctx.fillStyle = '#e6d9b8';
    cctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 3) {
      cctx.fillStyle = `rgba(120, 100, 70, ${0.05 + Math.random() * 0.06})`;
      cctx.fillRect(0, y, 256, 1.2);
    }
    for (let x = 0; x < 256; x += 3) {
      cctx.fillStyle = `rgba(255, 250, 235, ${0.04 + Math.random() * 0.05})`;
      cctx.fillRect(x, 0, 1.2, 256);
    }
    // a couple of polish smudges
    for (let i = 0; i < 4; i++) {
      const sx = Math.random() * 256, sy = Math.random() * 256;
      const sm = cctx.createRadialGradient(sx, sy, 3, sx, sy, 34);
      sm.addColorStop(0, 'rgba(110, 95, 65, 0.12)');
      sm.addColorStop(1, 'rgba(110, 95, 65, 0)');
      cctx.fillStyle = sm;
      cctx.beginPath(); cctx.arc(sx, sy, 34, 0, Math.PI * 2); cctx.fill();
    }
  }
  const clothTex = new THREE.CanvasTexture(clothCv);
  clothTex.colorSpace = THREE.SRGBColorSpace;
  clothTex.wrapS = clothTex.wrapT = THREE.RepeatWrapping;
  const clothMat = new THREE.MeshStandardMaterial({ map: clothTex, roughness: 0.95, metalness: 0 });
  const fold1 = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.18, 3.2), clothMat);
  fold1.position.set(-6.2, 0.09, -11.6);
  fold1.rotation.y = 0.28;
  const fold2 = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.18, 2.5), clothMat);
  fold2.position.set(-6.5, 0.27, -11.3);
  fold2.rotation.y = 0.16;
  fold1.castShadow = fold2.castShadow = true;
  fold1.receiveShadow = fold2.receiveShadow = true;
  g.add(fold1, fold2);

  // bureau pencil, front-right, angled like it was just set down
  const pencilBody = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 3.4, 6),
    new THREE.MeshStandardMaterial({ color: 0xd96a1e, roughness: 0.55, metalness: 0.05 }));
  pencilBody.position.set(5.6, 0.12, 13.4);
  pencilBody.rotation.set(0, 0.9, Math.PI / 2);
  const pencilTip = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.42, 6),
    new THREE.MeshStandardMaterial({ color: 0x8a6b4d, roughness: 0.8 }));
  pencilTip.position.set(5.6 + Math.cos(-0.9) * 1.9, 0.12, 13.4 + Math.sin(-0.9) * 1.9);
  pencilTip.rotation.set(0, 0.9, -Math.PI / 2);
  pencilBody.castShadow = pencilTip.castShadow = true;
  g.add(pencilBody, pencilTip);

  return g;
}

// A soft round blob shadow that follows dragged parts.
export function createBlobShadow() {
  const S = 128;
  const cv = document.createElement('canvas');
  cv.width = cv.height = S;
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 6, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.42)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 5),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  m.visible = false;
  return m;
}
