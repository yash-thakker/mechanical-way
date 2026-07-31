// The living movement: balance oscillation, stepped escape wheel, rocking
// pallet fork, and a going train driven — like the real thing — by ONE clock:
// the escapement's snapped time. Wheels turn at exact tooth ratios with
// meshing neighbors counter-rotating, so the tooth-into-gap phase baked at
// build time holds forever, still or running.
import * as THREE from 'three';
import { TEETH } from './parts/watchParts.js';

const BEAT_HZ = 5; // 5 beats/sec (2.5 Hz balance) = 18,000 bph

// Escapement beats are violent: unlock, impulse, dead stop against the
// banking. easeOutBack gives each half-tooth advance a snap with a little
// overshoot that settles — the opposite of a smoothed glide.
const SNAP_TIME = 0.055; // seconds from unlock to locked again
function snapEase(p) {
  const c1 = 2.6, c3 = c1 + 1;
  const q = p - 1;
  return 1 + c3 * q * q * q + c1 * q * q;
}

// Angular speeds fall straight out of the tooth counts — the same numbers
// the geometry meshes with. Escape: 15 teeth × 2 beats each per rev.
const W_ESCAPE = (Math.PI * 2 * BEAT_HZ) / (2 * TEETH.escape);            // 1 rev/6 s
const W_FOURTH = W_ESCAPE * (TEETH.escapePinion / TEETH.fourth);          // 1 rev/min
const W_THIRD = W_FOURTH * (TEETH.fourthPinion / TEETH.third);            // 1 rev/7.5 min
const W_CENTER = W_THIRD * (TEETH.thirdPinion / TEETH.center);            // 1 rev/hour
const W_BARREL = W_CENTER * (TEETH.centerPinion / TEETH.barrel);          // 1 rev/6 h
const W_MINUTE_WHEEL = W_CENTER * (TEETH.cannon / TEETH.minuteWheel);     // 1 rev/3 h
const W_HOUR = W_MINUTE_WHEEL * (TEETH.minutePinion / TEETH.hourWheel);   // 1 rev/12 h

export class TickingSim {
  constructor() {
    this.running = false;
    this.t = 0;
    this.beat = 0;
    this.beatT = 1; // time since the current beat began
    this.refs = {}; // filled via register()
    this.handsStart = { h: (10 + 9.5 / 60) / 12, m: 9.5 / 60, s: 0 }; // pre-start fallback
  }

  // refs: { balance (osc sub-group), hairspring, escape, pallet,
  //   wheels: {barrelDrum, center, third, fourth},
  //   motion: {cannon, minuteWheel, hourWheel},
  //   rotor, reverserUnits, hands: {hour, minute, second} }
  register(refs) {
    Object.assign(this.refs, refs);
  }

  start() {
    this.running = true;
    this.t = 0;
    this.beat = 0;
    this.beatT = 0;
    // The watch is set to the wearer's OWN time: sample the local clock at
    // the first heartbeat. τ then advances in real seconds, so the hands the
    // player presses on later show their actual current time, continuously.
    const d = new Date();
    this.handsStart = {
      h: ((d.getHours() % 12) + d.getMinutes() / 60 + d.getSeconds() / 3600) / 12,
      m: (d.getMinutes() + d.getSeconds() / 60) / 60,
      s: d.getSeconds() / 60,
    };
  }

  update(dt) {
    if (!this.running) return;
    this.t += dt;
    const r = this.refs;

    // ---- the one clock: snapped time ------------------------------------
    // τ advances 1/BEAT_HZ per beat, each advance squeezed into the snap.
    // The whole train is geared to τ: it moves ONLY while the escapement is
    // unlocked, exactly like a real train fed through a locked escape wheel.
    const beatNow = Math.floor(this.t * BEAT_HZ);
    if (beatNow !== this.beat) {
      this.beat = beatNow;
      this.beatT = 0;
    }
    this.beatT += dt;
    const k = snapEase(Math.min(1, this.beatT / SNAP_TIME));
    const tau = (this.beat + k) / BEAT_HZ;

    // balance: sinusoidal oscillation, amplitude building up from the first
    // wind to full swing over ~3 seconds — she wakes, she doesn't switch on
    const amp = 2.4 * (0.3 + 0.7 * Math.min(1, this.t / 3));
    const balRot = Math.sin(this.t * Math.PI * 2 * (BEAT_HZ / 2)) * amp;
    if (r.balance) r.balance.rotation.y = balRot;
    if (r.hairspring) {
      // the spring coils down one way and opens the other — breathing tracks
      // the balance ANGLE (tightest at full swing), not its own beat
      const breathe = 1 - (balRot / 2.4) * 0.055;
      r.hairspring.scale.set(breathe, 1, breathe);
    }

    // escapement: wheel and train snap forward half a tooth per beat, then
    // slam into lock. Geared to τ, so lock/impulse timing is shared.
    if (r.escape) r.escape.rotation.y = -tau * W_ESCAPE;
    if (r.pallet) {
      // Each rest presses the stone a tooth tip just landed on: entry stone
      // on even beats, exit on odd (set by the wheel's baked phase). The
      // rock amplitude comes from the stone geometry itself.
      const lockSign = r.pallet.userData.lockSign ?? 1;
      const rockAmp = r.pallet.userData.rockAmp ?? 0.09;
      const side = (this.beat % 2 === 0 ? 1 : -1) * lockSign;
      r.pallet.rotation.y = side * rockAmp * (2 * k - 1);
    }

    // going train: every wheel geared to τ at its true tooth ratio, meshing
    // neighbors counter-rotating. Signs are pinned by horology: the fourth
    // wheel carries the seconds hand, the center wheel the minute hand —
    // both must read clockwise from the dial side after the flip.
    const w = r.wheels || {};
    if (w.fourth) w.fourth.rotation.y = tau * W_FOURTH;
    if (w.third) w.third.rotation.y = -tau * W_THIRD;
    if (w.center) w.center.rotation.y = tau * W_CENTER;
    // the barrel DRUM creeps as the train lets it; the arbor (and ratchet on
    // it) stays parked against the click — that's the click's whole job
    if (w.barrelDrum) w.barrelDrum.rotation.y = -tau * W_BARREL;

    // motion works on the dial side: cannon 1 rev/h drives minute wheel 1:3,
    // whose pinion drives the hour wheel 1:4 — 12:1 to the hour hand.
    // (ticking starts before these are placed — don't spin them in the tray)
    const m = r.motion || {};
    if (m.cannon?.userData.placed) m.cannon.rotation.y = -tau * W_CENTER;
    if (m.minuteWheel?.userData.placed) m.minuteWheel.rotation.y = tau * W_MINUTE_WHEEL;
    if (m.hourWheel?.userData.placed) m.hourWheel.rotation.y = -tau * W_HOUR;

    // the rotor sways lazily once mounted, as if the bench were being nudged;
    // its sway gears into the reverser pair, which counter-rotate (that IS
    // their job: turning either sway direction into one winding direction)
    if (r.rotor?.userData.placed) {
      const sway = Math.sin(this.t * 0.55) * 0.85 + Math.sin(this.t * 0.13) * 1.2;
      r.rotor.rotation.y = sway;
      if (r.reverserUnits?.length === 2 && r.reverserUnits[0].parent?.userData.placed) {
        r.reverserUnits[0].rotation.y = sway * 2.4;
        r.reverserUnits[1].rotation.y = -sway * 2.4;
      }
    }

    // hands (clockwise seen from the dial = negative Y here). A hand only
    // turns once pressed onto the movement — never in the tray or mid-carry.
    // The center seconds hand is geared to the same τ·(rev/60s) as the fourth
    // wheel — it deadbeats in the same 5 snaps a second as the train.
    const h = r.hands || {};
    if (h.second && h.second.parent?.userData.placed) {
      h.second.rotation.y = -(this.handsStart.s + tau / 60) * Math.PI * 2;
    }
    if (h.minute && h.minute.parent?.userData.placed) {
      h.minute.rotation.y = -(this.handsStart.m + tau / 3600) * Math.PI * 2;
    }
    if (h.hour && h.hour.parent?.userData.placed) {
      h.hour.rotation.y = -(this.handsStart.h + tau / 43200) * Math.PI * 2;
    }
  }
}
