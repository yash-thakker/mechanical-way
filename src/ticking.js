// The living movement: balance oscillation, stepped escape wheel, rocking
// pallet fork, creeping train wheels, ticking hands.
import * as THREE from 'three';

const BEAT_HZ = 5;            // 5 beats/sec (2.5 Hz balance)
const ESCAPE_TEETH = 15;

export class TickingSim {
  constructor() {
    this.running = false;
    this.t = 0;
    this.beat = -1;
    this.refs = {}; // filled via register()
    this.escapeAngle = 0;
    this.escapeTarget = 0;
    this.palletSide = 1;
    this.handsStart = { h: (10 + 9.5 / 60) / 12, m: 9.5 / 60, s: 0 }; // 10:09:30 showroom time
  }

  // refs: { balance (osc sub-group), hairspring, escape, pallet, wheels: {barrel, center, third, fourth}, hands: {hour, minute, second} }
  register(refs) {
    Object.assign(this.refs, refs);
  }

  start() {
    this.running = true;
    this.t = 0;
    this.beat = -1;
  }

  update(dt) {
    if (!this.running) return;
    this.t += dt;
    const r = this.refs;

    // balance: sinusoidal oscillation, ±~1.4 turns feel
    if (r.balance) {
      r.balance.rotation.y = Math.sin(this.t * Math.PI * 2 * (BEAT_HZ / 2)) * 2.4;
    }
    if (r.hairspring) {
      const breathe = 1 + Math.sin(this.t * Math.PI * 2 * (BEAT_HZ / 2) + Math.PI / 2) * 0.06;
      r.hairspring.scale.set(breathe, 1, breathe);
    }

    // escapement: advance half a tooth per beat, pallet flips side
    const beatNow = Math.floor(this.t * BEAT_HZ);
    if (beatNow !== this.beat) {
      this.beat = beatNow;
      this.escapeTarget -= (Math.PI * 2 / ESCAPE_TEETH) / 2;
      this.palletSide *= -1;
    }
    const k = 1 - Math.exp(-26 * dt);
    this.escapeAngle += (this.escapeTarget - this.escapeAngle) * k;
    if (r.escape) r.escape.rotation.y = this.escapeAngle;
    if (r.pallet) {
      r.pallet.rotation.y += (this.palletSide * 0.09 - r.pallet.rotation.y) * k;
    }

    // going train: meshing wheels counter-rotate, speeds are real-ish
    const w = r.wheels || {};
    if (w.fourth) w.fourth.rotation.y = -this.t * (Math.PI * 2 / 60);        // 1 rev/min
    if (w.third) w.third.rotation.y = this.t * (Math.PI * 2 / 450);          // ~1 rev/7.5min
    if (w.center) w.center.rotation.y = -this.t * (Math.PI * 2 / 3600);      // 1 rev/hour
    if (w.barrel) w.barrel.rotation.y = this.t * (Math.PI * 2 / 21600);      // 1 rev/6h

    // motion works on the dial side: cannon pinion 1 rev/hr, hour wheel 1 rev/12h
    // (ticking starts before these are placed — don't spin them in the tray)
    const m = r.motion || {};
    if (m.cannon?.userData.placed) m.cannon.rotation.y = -this.t * (Math.PI * 2 / 3600);
    if (m.minuteWheel?.userData.placed) m.minuteWheel.rotation.y = this.t * (Math.PI * 2 / 3600) * (0.85 / 1.55);
    if (m.hourWheel?.userData.placed) m.hourWheel.rotation.y = -this.t * (Math.PI * 2 / 43200);

    // the rotor sways lazily once mounted, as if the bench were being nudged
    if (r.rotor?.userData.placed) {
      r.rotor.rotation.y = Math.sin(this.t * 0.55) * 0.85 + Math.sin(this.t * 0.13) * 1.2;
    }

    // hands (clockwise seen from above = negative Y here)
    const h = r.hands || {};
    if (h.second) {
      const stepped = Math.floor(this.t * BEAT_HZ) / BEAT_HZ; // ticks in 1/5s steps
      h.second.rotation.y = -(this.handsStart.s + stepped / 60) * Math.PI * 2;
    }
    if (h.minute) h.minute.rotation.y = -(this.handsStart.m + this.t / 3600) * Math.PI * 2;
    if (h.hour) h.hour.rotation.y = -(this.handsStart.h + this.t / 43200) * Math.PI * 2;
  }
}
