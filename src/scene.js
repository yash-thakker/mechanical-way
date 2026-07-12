// Renderer, camera, lights, and the watchmaker's bench.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PLAN } from './parts/watchParts.js';

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
  ctx.fillText('FIG. 1 — THE GOING TRAIN', ox, oy + 14);

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
// RIGHT of the bench; the tool roll lives on the left. Every home keeps the
// part's radius clear of the movement holder (outer r 9.8) — big parts get
// the outer slots. Big dial-phase parts lie beside the tray on the mat.
export const HOME_POSITIONS = {
  barrel: [11.6, 4.0], mainspring: [15.1, 4.0], lid: [18.6, 4.0],
  fourth: [11.6, 7.0], center: [15.1, 7.0], escape: [18.6, 7.0],
  third: [11.6, 10.0], bridge: [15.1, 10.0], pallet: [18.6, 10.0],
  balance: [11.6, 13.0],
  // later-phase parts appear only after earlier rows have emptied — they
  // reuse those freed, well-framed slots (click system after the balance,
  // motion works after the flip)
  barrelbridge: [11.6, 4.0], ratchet: [15.1, 4.0], click: [18.6, 4.0], crownwheel: [11.6, 7.0],
  cannon: [15.1, 7.0], minutewheel: [18.6, 7.0], hourwheel: [11.6, 10.0],
  // hard tier: auto-winding arrives after the wake, date + keyless after the flip
  reversers: [13.2, 5.6], rotor: [16.4, 8.4],
  datejumper: [11.6, 4.0], dateindicator: [15.1, 4.0], datering: [15.1, 10.6],
  stem: [18.6, 4.0], settinglever: [11.6, 7.0], yoke: [18.6, 7.0], jumper: [11.6, 10.0],
  dial: [13.2, 5.6], hands: [16.8, 5.6],
};

function buildTray() {
  const g = new THREE.Group();
  const wood = new THREE.MeshStandardMaterial({ color: 0x453425, roughness: 0.8, metalness: 0.05 });
  const felt = new THREE.MeshStandardMaterial({ color: 0x30251a, roughness: 0.97, metalness: 0 });
  const W = 10.6, D = 12.4, cx = 15.1, cz = 8.5;
  const base = new THREE.Mesh(new THREE.BoxGeometry(W, 0.35, D), felt);
  base.position.set(cx, 0.17, cz);
  g.add(base);
  const wallGeoX = new THREE.BoxGeometry(W + 0.5, 0.6, 0.25);
  const wallGeoZ = new THREE.BoxGeometry(0.25, 0.6, D + 0.5);
  for (const [gx, gz, geo] of [
    [cx, cz - D / 2 - 0.12, wallGeoX], [cx, cz + D / 2 + 0.12, wallGeoX],
    [cx - W / 2 - 0.12, cz, wallGeoZ], [cx + W / 2 + 0.12, cz, wallGeoZ],
  ]) {
    const w = new THREE.Mesh(geo, wood);
    w.position.set(gx, 0.3, gz);
    g.add(w);
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
  const W = 256, H = 1024;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = TVA.orange;
  ctx.fillRect(0, 0, W / 2, H);
  ctx.fillStyle = TVA.mustard;
  ctx.fillRect(W / 2, 0, W / 2, H);
  grunge(ctx, W, H, 0.1, 700);
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

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x170e07);
  scene.fog = new THREE.Fog(0x1f1207, 46, 150); // warm TVA haze; walls sit deep in it

  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 200);
  camera.position.set(0, 26, 24); // intro position; tweened down on start

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();

  const hemi = new THREE.HemisphereLight(0xfff2dd, 0x33241a, 0.55);
  scene.add(hemi);
  const key = new THREE.DirectionalLight(0xffe7c4, 2.1);
  key.position.set(7, 16, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffd9a0, 0.55);
  fill.position.set(-9, 9, -5);
  scene.add(fill);
  // warm lamp glow over the tool roll — retro desk-lamp feel
  const lamp = new THREE.PointLight(0xff8a2a, 18, 26, 2);
  lamp.position.set(-11, 7.5, 2.5);
  scene.add(lamp);

  // bench mat
  const bench = new THREE.Mesh(
    new THREE.PlaneGeometry(46, 34.5),
    new THREE.MeshStandardMaterial({ map: drawBenchTexture(), roughness: 0.92, metalness: 0.02 })
  );
  bench.rotation.x = -Math.PI / 2;
  scene.add(bench);

  // wooden table extending beyond the mat
  const table = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 120),
    new THREE.MeshStandardMaterial({ color: 0x241a12, roughness: 0.95, metalness: 0 })
  );
  table.rotation.x = -Math.PI / 2;
  table.position.y = -0.05;
  scene.add(table);

  const tray = buildTray();
  scene.add(tray);

  const backdrop = buildBackdrop(scene);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.enablePan = false;
  controls.minDistance = 7;
  controls.maxDistance = 39;
  controls.minPolarAngle = 0.2;
  controls.maxPolarAngle = 1.25;
  controls.target.set(0, 1.6, 2.2);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { renderer, scene, camera, controls, tray, backdrop };
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
