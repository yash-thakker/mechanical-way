// Pointer interaction, v2: pick a tool from the roll first, then work.
// - Tools raise off the roll when selected and follow the cursor.
// - Parts can only be grabbed while the step's required tool is in hand.
// - Service steps expose clickable point markers (screws, jewels).
// - Hold Z for the loupe (fov zoom).
import * as THREE from 'three';

const DRAG_HEIGHT = 5.2;      // movement phase: above the full climbing stack (rotor tops ~4.6)
const TOOL_HOVER_MARGIN = 1.4; // carried tool floats this far above the drag plane

// how each tool sits when carried above the bench (rough "in use" tilt)
const HELD_POSE = {
  tweezers: new THREE.Euler(-0.75, 0, 0.1),
  winder: new THREE.Euler(0.18, 0, 0),
  screwdriver: new THREE.Euler(0, 0, -0.95),
  oiler: new THREE.Euler(0, 0, -0.95),
  press: new THREE.Euler(0.18, 0, 0),
};

export class Interaction {
  constructor({ camera, canvas, controls, scene, parts, assembly, blobShadow, callbacks }) {
    this.camera = camera;
    this.canvas = canvas;
    this.controls = controls;
    this.scene = scene;
    this.parts = parts;
    this.assembly = assembly;
    this.blobShadow = blobShadow;
    // { onGrab, onDropSnap, onDropMiss, onWrongClick, onHoverChange,
    //   onToolSelect, onWrongTool, onServicePoint }
    this.cb = callbacks;

    this.enabled = false;
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.dragHeight = DRAG_HEIGHT;
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DRAG_HEIGHT);
    this.planeHit = new THREE.Vector3();

    this.held = null;         // part group being dragged
    this.downConsumed = false; // last pointerdown hit a tool/part/marker (lamp defers to it)
    this.dragTarget = new THREE.Vector3();
    this.hovered = null;
    this.hoverKind = null;    // 'part' | 'tool' | 'service'
    this.grabbablePool = [];  // tray part groups (all not-yet-placed)
    this.homes = new Map();   // partId -> Vector3 tray home

    // tools
    this.toolGroups = new Map();   // toolId -> slot group (on the roll)
    this.toolPool = [];            // slot groups, for raycasting
    this.rollGroup = null;         // the leather roll (click it to drop a tool)
    this.selectedTool = null;      // toolId or null
    this.selectedSlot = null;      // the detached slot group following the cursor
    this.returning = [];           // slots flying back to their pockets
    this.toolTarget = new THREE.Vector3();

    // service mode
    this.serviceMarkers = [];      // clickable marker meshes
    this.serviceTool = null;       // toolId required for the markers
    this.dipT = 0;                 // tool dip animation (screw/oil actions)

    // magnifier
    this.zooming = false;
    this.baseFov = camera.fov;
    this.touchZoom = false;   // loupe engaged by a long-press
    this.pressTimer = null;
    this.pressAt = null;

    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    window.addEventListener('pointerup', (e) => this.onUp(e));
    // touch: holding a still finger on the bench for half a second is the
    // loupe (phones have no Z key); it releases with the finger
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'touch' || this.held) return;
      this.pressAt = [e.clientX, e.clientY];
      clearTimeout(this.pressTimer);
      this.pressTimer = setTimeout(() => {
        if (this.pressAt && !this.held) {
          this.touchZoom = true;
          this.zooming = true;
        }
      }, 480);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!this.pressAt) return;
      if (Math.hypot(e.clientX - this.pressAt[0], e.clientY - this.pressAt[1]) > 12) {
        this.pressAt = null;
        clearTimeout(this.pressTimer);
      }
    });
    window.addEventListener('pointerup', () => {
      this.pressAt = null;
      clearTimeout(this.pressTimer);
      if (this.touchZoom) {
        this.touchZoom = false;
        this.zooming = false;
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'z' || e.key === 'Z') this.zooming = true;
      if (e.key === 'Escape' && this.selectedTool && !this.held) this.deselectTool();
    });
    canvas.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (this.selectedTool && !this.held) this.deselectTool();
    });
    window.addEventListener('keyup', (e) => {
      if (e.key === 'z' || e.key === 'Z') this.zooming = false;
    });
    window.addEventListener('blur', () => { this.zooming = false; });
  }

  setGrabbable(groups, homes) {
    this.grabbablePool = groups;
    if (homes) this.homes = homes;
  }

  setTools(toolGroups, rollGroup) {
    this.toolGroups = toolGroups;
    this.toolPool = [...toolGroups.values()];
    this.rollGroup = rollGroup || null;
    for (const slot of this.toolPool) {
      slot.userData.home = {
        parent: slot.parent,
        position: slot.position.clone(),
        quaternion: slot.quaternion.clone(),
      };
    }
  }

  setService(markers, tool) {
    this.serviceMarkers = markers || [];
    this.serviceTool = tool || null;
  }

  // dial-phase steps drag higher: the flipped movement stack tops out ~4.8,
  // so the dial and hands must float above it, not through it
  setDragHeight(h) {
    this.dragHeight = h;
    this.dragPlane.constant = -h;
  }

  clearService() {
    this.serviceMarkers = [];
    this.serviceTool = null;
  }

  // the loupe chip on touch HUDs toggles the same fov zoom Z holds
  setZoom(v) {
    this.zooming = !!v;
  }

  // quick down-and-up motion of the carried tool (tightening, oiling)
  dip() {
    this.dipT = 1;
  }

  // ---- tool selection -------------------------------------------------

  selectTool(id) {
    if (id === this.selectedTool) return;
    this.returnTool();
    const slot = this.toolGroups.get(id);
    if (!slot) return;
    // grabbing a tool that is mid-flight back to the roll
    this.returning = this.returning.filter((s) => s !== slot);
    this.selectedTool = id;
    this.selectedSlot = slot;
    this.prongs = [];
    slot.traverse((o) => { if (o.userData.prong) this.prongs.push(o); });
    // world position before detaching, so the follow lerp starts from the roll
    slot.getWorldPosition(this.toolTarget);
    this.scene.attach(slot);
    slot.traverse((o) => { if (o.userData.stayOnRoll) o.visible = false; });
    const pose = HELD_POSE[id];
    if (pose) slot.rotation.copy(pose);
    this.cb.onToolSelect?.(id);
  }

  // start flying the carried tool back toward its pocket (finishes in update)
  returnTool() {
    const slot = this.selectedSlot;
    if (!slot) return;
    this.returning.push(slot);
    this.selectedSlot = null;
    this.selectedTool = null;
  }

  finishReturn(slot) {
    const home = slot.userData.home;
    home.parent.add(slot);
    slot.position.copy(home.position);
    slot.quaternion.copy(home.quaternion);
    slot.traverse((o) => {
      if (o.userData.stayOnRoll) o.visible = true;
      if (o.userData.prong) o.rotation.y = -o.userData.prong * 0.13; // rest pose
    });
  }

  deselectTool() {
    if (!this.selectedTool) return;
    this.returnTool();
    this.cb.onToolSelect?.(null);
  }

  // ---- picking --------------------------------------------------------

  updatePointer(e) {
    const r = this.canvas.getBoundingClientRect();
    this.pointer.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    this.pointer.y = -((e.clientY - r.top) / r.height) * 2 + 1;
  }

  pickPart() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.grabbablePool, true);
    if (!hits.length) return null;
    // tray parts overlap on screen (tall arbors cross the row behind);
    // if the ray touches the wanted part at all, assume that's the aim
    const stepId = this.assembly.currentStep?.id;
    const wanted = stepId && hits.find((h) => h.object.userData.partId === stepId);
    const id = (wanted || hits[0]).object.userData.partId;
    return this.parts.get(id) || null;
  }

  pickTool() {
    if (!this.toolPool.length) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const pool = this.toolPool.filter((s) => s !== this.selectedSlot);
    const hits = this.raycaster.intersectObjects(pool, true);
    if (!hits.length) return null;
    return hits[0].object.userData.toolId || null;
  }

  pickServiceMarker() {
    if (!this.serviceMarkers.length) return null;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(this.serviceMarkers, true);
    if (!hits.length) return null;
    let o = hits[0].object;
    while (o && o.userData.serviceIndex === undefined) o = o.parent;
    return o || null;
  }

  pointerOnRoll() {
    if (!this.rollGroup) return false;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObject(this.rollGroup, true).length > 0;
  }

  // ---- pointer events ---------------------------------------------------

  onDown(e) {
    // pickTool detaches the slot from the roll immediately, so by the time
    // the browser 'click' event fires the roll raycast can no longer see it —
    // this flag is how the lamp toggle knows the click belonged to the work
    this.downConsumed = false;
    if (!this.enabled || this.held) return;
    this.updatePointer(e);

    // 1) tool roll: pick a tool, or drop the carried one back on the leather
    const toolId = this.pickTool();
    if (toolId) {
      this.downConsumed = true;
      this.selectTool(toolId);
      return;
    }
    if (this.selectedTool && this.pointerOnRoll()) {
      this.downConsumed = true;
      this.deselectTool();
      return;
    }

    // 2) service points (screws / jewels)
    const marker = this.pickServiceMarker();
    if (marker) {
      this.downConsumed = true;
      if (this.selectedTool !== this.serviceTool) {
        this.cb.onWrongTool?.(this.serviceTool, this.selectedTool);
        return;
      }
      this.cb.onServicePoint?.(marker.userData.serviceIndex, marker);
      return;
    }

    // 3) parts
    const part = this.pickPart();
    if (!part) return;
    const step = this.assembly.currentStep;
    if (!step) return;
    this.downConsumed = true;
    if (part.userData.partId !== step.id) {
      this.cb.onWrongClick?.(part);
      return;
    }
    if (step.tool && this.selectedTool !== step.tool) {
      this.cb.onWrongTool?.(step.tool, this.selectedTool);
      return;
    }
    // grab it
    this.held = part;
    this.controls.enabled = false;
    this.dragTarget.copy(part.position).setY(this.dragHeight);
    this.updateDragTarget();
    this.blobShadow.visible = true;
    this.cb.onGrab?.(part);
  }

  onMove(e) {
    this.updatePointer(e);
    if (this.held) {
      this.updateDragTarget();
      return;
    }
    if (!this.enabled) return;

    // hover feedback: tools > service points > parts
    const toolId = this.pickTool();
    if (toolId) {
      this.setHover(toolId, 'tool', 'pointer');
      return;
    }
    if (this.selectedTool && this.pointerOnRoll()) {
      this.setHover(this.rollGroup, 'roll', 'pointer');
      return;
    }
    const marker = this.pickServiceMarker();
    if (marker) {
      const ok = this.selectedTool === this.serviceTool;
      this.setHover(marker, 'service', ok ? 'pointer' : 'not-allowed');
      return;
    }
    const part = this.pickPart();
    if (part) {
      const step = this.assembly.currentStep;
      const isCurrent = part.userData.partId === step?.id;
      const hasTool = !step?.tool || this.selectedTool === step.tool;
      const cursor = isCurrent ? (hasTool ? 'grab' : 'not-allowed') : 'not-allowed';
      if (part !== this.hovered || this.hoverKind !== 'part') {
        this.hovered = part;
        this.hoverKind = 'part';
        this.canvas.style.cursor = cursor;
        this.cb.onHoverChange?.(part, isCurrent);
      } else {
        this.canvas.style.cursor = cursor;
      }
      return;
    }
    this.setHover(null, null, 'default');
  }

  setHover(target, kind, cursor) {
    if (this.hoverKind === 'part' && kind !== 'part') {
      this.cb.onHoverChange?.(null, false);
    }
    this.hovered = target;
    this.hoverKind = kind;
    this.canvas.style.cursor = cursor;
  }

  updateDragTarget() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeHit)) {
      // keep parts over the bench
      this.planeHit.x = THREE.MathUtils.clamp(this.planeHit.x, -21, 21);
      this.planeHit.z = THREE.MathUtils.clamp(this.planeHit.z, -15, 15);
      this.dragTarget.copy(this.planeHit);
    }
  }

  onUp() {
    if (!this.held) return;
    const part = this.held;
    this.held = null;
    this.controls.enabled = true;
    this.blobShadow.visible = false;
    this.canvas.style.cursor = 'default';
    // judge the drop by where the cursor ray meets the target's height —
    // the held part floats above the target, so its own XZ is parallax-shifted
    const target = this.assembly.targetWorldPos(new THREE.Vector3());
    const targetPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -target.y);
    const hit = new THREE.Vector3();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const dropPoint = this.raycaster.ray.intersectPlane(targetPlane, hit) ? hit : part.position;
    if (this.assembly.isNearTarget(dropPoint)) {
      this.cb.onDropSnap?.(part);
    } else {
      this.cb.onDropMiss?.(part, this.homes.get(part.userData.partId));
    }
  }

  // called each frame
  update(dt) {
    const now = performance.now();

    // drag follow (stiff exponential approach)
    if (this.held) {
      const k = 1 - Math.exp(-14 * dt);
      this.held.position.lerp(this.dragTarget, k);
      // hover wobble
      this.held.rotation.y += Math.sin(now * 0.002) * 0.0006;
      // shadow under the part
      this.blobShadow.position.set(this.held.position.x, 0.06, this.held.position.z);
      const h = this.held.position.y / this.dragHeight;
      this.blobShadow.scale.setScalar(0.7 + h * 0.5);
      this.blobShadow.material.opacity = 1.2 - h * 0.55;
    }

    // the selected tool floats after the cursor (or above the held part)
    if (this.selectedSlot) {
      let tx;
      let ty;
      let tz;
      if (this.held) {
        tx = this.held.position.x;
        ty = this.held.position.y + 1.5;
        tz = this.held.position.z;
      } else {
        this.raycaster.setFromCamera(this.pointer, this.camera);
        if (this.raycaster.ray.intersectPlane(this.dragPlane, this.planeHit)) {
          this.toolTarget.set(
            THREE.MathUtils.clamp(this.planeHit.x, -21, 21),
            this.dragHeight + TOOL_HOVER_MARGIN,
            THREE.MathUtils.clamp(this.planeHit.z, -15, 15)
          );
        }
        tx = this.toolTarget.x;
        ty = this.toolTarget.y + Math.sin(now * 0.0022) * 0.18;
        tz = this.toolTarget.z;
      }
      if (this.dipT > 0) {
        ty -= Math.sin(this.dipT * Math.PI) * 1.4;
        this.dipT = Math.max(0, this.dipT - dt * 2.2);
      }
      const k = 1 - Math.exp(-12 * dt);
      const p = this.selectedSlot.position;
      p.x += (tx - p.x) * k;
      p.y += (ty - p.y) * k;
      p.z += (tz - p.z) * k;
    }

    // dropped tools fly back to their pockets on the roll
    if (this.returning.length) {
      const k = 1 - Math.exp(-9 * dt);
      const homeW = new THREE.Vector3();
      for (let i = this.returning.length - 1; i >= 0; i--) {
        const slot = this.returning[i];
        const home = slot.userData.home;
        home.parent.localToWorld(homeW.copy(home.position));
        slot.position.lerp(homeW, k);
        slot.quaternion.slerp(home.quaternion, k); // roll group is unrotated
        if (slot.position.distanceTo(homeW) < 0.12) {
          this.finishReturn(slot);
          this.returning.splice(i, 1);
        }
      }
    }

    // tweezer prongs: relaxed while carried empty, squeezed around a part
    if (this.prongs && this.prongs.length && this.selectedSlot) {
      const grip = this.held ? 0.18 : 0.1;
      const pk = 1 - Math.exp(-10 * dt);
      for (const prong of this.prongs) {
        const target = -prong.userData.prong * grip;
        prong.rotation.y += (target - prong.rotation.y) * pk;
      }
    }

    // magnifier: smooth fov lerp
    const targetFov = this.zooming ? 15 : this.baseFov;
    if (Math.abs(this.camera.fov - targetFov) > 0.01) {
      this.camera.fov += (targetFov - this.camera.fov) * (1 - Math.exp(-8 * dt));
      this.camera.updateProjectionMatrix();
    }
    this.controls.rotateSpeed = this.zooming ? 0.35 : 1.0;
  }
}
