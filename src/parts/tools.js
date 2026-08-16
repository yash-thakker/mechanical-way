// The watchmaker's tools: modeled in 3D, laid out on a leather tool roll
// left of the movement. The player must pick the right tool for each step.
import * as THREE from 'three';

export const TOOLS = {
  tweezers: {
    name: 'Tweezers',
    blurb: 'Dumont-style brass tweezers. Fingers never touch a movement; skin oil corrodes steel.',
    use: 'Placing wheels, bridges and springs.',
  },
  winder: {
    name: 'Mainspring Winder',
    blurb: 'Coils the mainspring into a drum smaller than the barrel, then injects it.',
    use: 'Loading the mainspring. Hand-coiling ruins the spring.',
  },
  screwdriver: {
    name: 'Screwdriver',
    blurb: 'Watchmaker screwdrivers are color-coded by blade width. This is the 1.4mm.',
    use: 'Tightening bridge and cock screws.',
  },
  oiler: {
    name: 'Oiler',
    blurb: 'A needle that carries one droplet of synthetic oil at a time.',
    use: 'Oiling the jewel bearings. Too much oil is worse than none.',
  },
  press: {
    name: 'Hand Press',
    blurb: 'A hollow brass press that seats parts without bending them.',
    use: 'Pressing on lids, dials and hands.',
  },
};

const steel = new THREE.MeshStandardMaterial({ color: 0xb7bcc6, roughness: 0.25, metalness: 0.95 });
const brass = new THREE.MeshStandardMaterial({ color: 0xc89b3c, roughness: 0.3, metalness: 0.9 });

function labelSprite(text) {
  const cv = document.createElement('canvas');
  cv.width = 256; cv.height = 48;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = 'rgba(200,155,60,0.85)';
  ctx.font = '500 26px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 128, 26);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(3.4, 0.64),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  return m;
}

function buildTweezersTool() {
  const g = new THREE.Group();
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 3.6), steel);
    arm.position.set(side * 0.28, 0.15, 0);
    arm.rotation.y = -side * 0.13;
    arm.userData.prong = side; // interaction squeezes these while gripping
    g.add(arm);
  }
  const joint = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.5, 10), brass);
  joint.rotation.x = Math.PI / 2;
  joint.position.set(0, 0.16, 1.85);
  g.add(joint);
  // Built along its own z, but the roll runs along z and its pockets are only
  // 2.9 apart — at 3.9 tip-to-joint these overhung into the winder's pocket.
  // Quarter-turn so they lie ACROSS the roll like every other long tool, tips
  // at +x (screwdriver and oiler point the same way). The prong squeeze is a
  // local rotation.y on the arms, so it rides through this untouched.
  const across = new THREE.Group();
  across.rotation.y = -Math.PI / 2;
  across.add(g);
  return across;
}

function buildWinderTool() {
  const g = new THREE.Group();
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.85, 0.85, 1.1, 24), brass);
  drum.position.y = 0.55;
  g.add(drum);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 1.4, 10), steel);
  stem.position.y = 1.7;
  g.add(stem);
  const crank = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 0.16), steel);
  crank.position.y = 2.4;
  g.add(crank);
  const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.5, 10),
    new THREE.MeshStandardMaterial({ color: 0x5a3a22, roughness: 0.6, metalness: 0.1 }));
  knob.position.set(0.72, 2.62, 0);
  g.add(knob);
  return g;
}

function buildScrewdriverTool() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.28, 1.6, 12),
    new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.4, metalness: 0.3 }));
  handle.position.y = 0.24;
  handle.rotation.z = Math.PI / 2;
  g.add(handle);
  // knurl rings on the handle
  for (const dx of [-0.5, 0, 0.5]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.27, 0.03, 6, 16), steel);
    ring.rotation.y = Math.PI / 2;
    ring.position.set(dx, 0.24, 0);
    g.add(ring);
  }
  const swivel = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.14, 12), steel);
  swivel.rotation.z = Math.PI / 2;
  swivel.position.set(-0.9, 0.24, 0);
  g.add(swivel);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.5, 8), steel);
  shaft.rotation.z = Math.PI / 2;
  shaft.position.set(1.55, 0.24, 0);
  g.add(shaft);
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.03), steel);
  tip.position.set(2.35, 0.24, 0);
  g.add(tip);
  return g;
}

function buildOilerTool() {
  const g = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 1.8, 10),
    new THREE.MeshStandardMaterial({ color: 0x2ec4b6, roughness: 0.4, metalness: 0.3 }));
  handle.rotation.z = Math.PI / 2;
  handle.position.set(-0.5, 0.16, 0);
  g.add(handle);
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.6, 6), steel);
  needle.rotation.z = Math.PI / 2;
  needle.position.set(1.2, 0.16, 0);
  g.add(needle);
  const dropTip = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 8), steel);
  dropTip.position.set(2.0, 0.16, 0);
  g.add(dropTip);
  // little oil cup beside the oiler
  const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.3, 0.3, 16),
    new THREE.MeshStandardMaterial({ color: 0x30251a, roughness: 0.5, metalness: 0.2 }));
  cup.position.set(0.4, 0.15, 1.0);
  cup.userData.stayOnRoll = true;
  g.add(cup);
  const oil = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.06, 16),
    new THREE.MeshStandardMaterial({ color: 0x8a6a10, roughness: 0.1, metalness: 0.4 }));
  oil.position.set(0.4, 0.28, 1.0);
  oil.userData.stayOnRoll = true;
  g.add(oil);
  return g;
}

function buildPressTool() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.3, 1.7, 14), brass);
  body.position.y = 0.85;
  g.add(body);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.55, 14),
    new THREE.MeshStandardMaterial({ color: 0xf2e3be, roughness: 0.55, metalness: 0.05 }));
  grip.position.y = 1.95;
  g.add(grip);
  const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.3, 12), steel);
  tip.position.y = 0.05;
  g.add(tip);
  return g;
}

// The leather tool roll with all five tools. Returns { group, toolGroups }.
export function buildToolRoll() {
  const group = new THREE.Group();
  const leather = new THREE.MeshStandardMaterial({ color: 0x3a2718, roughness: 0.9, metalness: 0.02 });
  const strap = new THREE.MeshStandardMaterial({ color: 0x2a1c10, roughness: 0.85, metalness: 0.02 });

  const mat = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.16, 15.5), leather);
  mat.position.y = 0.08;
  group.add(mat);
  // rolled-up end
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 6.4, 18), leather);
  roll.rotation.z = Math.PI / 2;
  roll.position.set(0, 0.5, -8.2);
  group.add(roll);

  const builders = {
    tweezers: buildTweezersTool,
    winder: buildWinderTool,
    screwdriver: buildScrewdriverTool,
    oiler: buildOilerTool,
    press: buildPressTool,
  };

  const toolGroups = new Map();
  const ids = Object.keys(builders);
  ids.forEach((id, i) => {
    const slot = new THREE.Group();
    const z = -5.6 + i * 2.9;
    // pocket strip
    const pocket = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.1, 0.5), strap);
    pocket.position.set(0, 0.18, z + 1.15);
    group.add(pocket);

    const tool = builders[id]();
    tool.userData.toolId = id;
    tool.traverse((o) => { o.userData.toolId = id; });
    slot.add(tool);
    // invisible pad so thin tools are easy to click
    const pad = new THREE.Mesh(
      new THREE.BoxGeometry(5.8, 1.3, 2.5),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false })
    );
    pad.position.y = 0.55;
    pad.userData.toolId = id;
    slot.add(pad);
    // lay long tools along the roll's x
    slot.position.set(0, 0.16, z);
    slot.userData.toolId = id;
    slot.userData.restY = 0.16;
    group.add(slot);
    toolGroups.set(id, slot);

    const label = labelSprite(TOOLS[id].name);
    label.position.set(0, 0.2, z - 1.0);
    group.add(label);
  });

  return { group, toolGroups };
}
