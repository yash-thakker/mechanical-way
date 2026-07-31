// src/audio.js — procedural WebAudio sound design for Mechanical Way.
// Zero audio files. Warm, miniature, mechanical: watchmaker's bench + music box,
// never arcade bleeps. All WebAudio access is guarded inside functions so this
// module can be imported safely in environments without an AudioContext.

const MASTER_GAIN = 0.5;
const SCHEDULE_AHEAD_SEC = 0.1; // how far ahead we schedule ticking audio
const TICK_LOOKAHEAD_MS = 50; // scheduler wake-up interval

let ctx = null;
let masterGain = null;
let compressor = null;
let muted = false;

let tickTimerId = null;
let nextTickTime = 0;
let tickIntervalSec = 0.2;
let tickToggle = false;

/** Run fn and swallow any error — no sound function may ever throw. */
function safe(fn) {
  try {
    fn();
  } catch (e) {
    // intentionally silent
  }
}

/** Returns a usable AudioContext, or null if none exists / it's unusable. */
function getCtx() {
  if (!ctx) return null;
  if (ctx.state === 'closed') return null;
  if (ctx.state === 'suspended') {
    // Best-effort resume; if it never resolves the sound simply stays silent.
    ctx.resume().catch(() => {});
  }
  return ctx;
}

/** Short exponential attack/decay envelope helper, reused by every voice. */
function expEnv(param, t0, peak, attack, decay, floor = 0.0001) {
  const safePeak = Math.max(peak, floor);
  const a = Math.max(attack, 0.001);
  param.cancelScheduledValues(t0);
  param.setValueAtTime(floor, t0);
  param.exponentialRampToValueAtTime(safePeak, t0 + a);
  param.exponentialRampToValueAtTime(floor, t0 + a + Math.max(decay, 0.001));
}

/** Generates a fresh mono white-noise buffer of the given duration. */
function createNoiseBuffer(c, duration) {
  const length = Math.max(1, Math.floor(c.sampleRate * duration));
  const buffer = c.createBuffer(1, length, c.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

/**
 * One oscillator voice, optionally through a biquad filter, with an
 * exponential attack/decay envelope. Returns the gain node in case a
 * caller wants to tap it (e.g. feed a delay bus).
 */
function tone(c, dest, opts) {
  const {
    type = 'sine', freq, freqEnd, glideTime = 0.05,
    filterType, filterFreq, filterQ = 1,
    peak, attack, decay, start, dur,
  } = opts;

  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (freqEnd !== undefined) {
    osc.frequency.exponentialRampToValueAtTime(freqEnd, start + glideTime);
  }

  let node = osc;
  if (filterType) {
    const filt = c.createBiquadFilter();
    filt.type = filterType;
    filt.frequency.value = filterFreq ?? freq;
    filt.Q.value = filterQ;
    osc.connect(filt);
    node = filt;
  }

  const g = c.createGain();
  g.gain.value = 0.0001;
  node.connect(g);
  g.connect(dest);
  expEnv(g.gain, start, peak, attack, decay);

  osc.start(start);
  osc.stop(start + dur);
  return g;
}

/** One filtered white-noise burst with an exponential envelope. */
function noiseBurst(c, dest, opts) {
  const { filterType = 'highpass', filterFreq, filterQ = 1, peak, attack, decay, start, dur } = opts;

  const src = c.createBufferSource();
  src.buffer = createNoiseBuffer(c, dur);
  const filt = c.createBiquadFilter();
  filt.type = filterType;
  filt.frequency.value = filterFreq;
  filt.Q.value = filterQ;

  const g = c.createGain();
  g.gain.value = 0.0001;
  src.connect(filt);
  filt.connect(g);
  g.connect(dest);
  expEnv(g.gain, start, peak, attack, decay);

  src.start(start);
  src.stop(start + dur + 0.01);
  return g;
}

/** Optional stereo placement: pan by screen-x so the bench has a left and a right. */
function panDest(c, pan = 0) {
  if (!pan || !c.createStereoPanner) return masterGain;
  const p = c.createStereoPanner();
  p.pan.value = Math.max(-1, Math.min(1, pan)) * 0.6;
  p.connect(masterGain);
  return p;
}

// --- Room tone: the bench is never dead silent ---
// A low warm bed + faint air hiss, breathing on a very slow LFO. Starts with
// the AudioContext and simply lives under everything at ~-36 dB.
let roomToneOn = false;
function startRoomTone() {
  if (roomToneOn || !ctx || !masterGain) return;
  roomToneOn = true;
  const c = ctx;
  const bed = c.createBufferSource();
  bed.buffer = createNoiseBuffer(c, 4);
  bed.loop = true;
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 220;
  lp.Q.value = 0.4;
  const bedGain = c.createGain();
  bedGain.gain.value = 0.014;
  const lfo = c.createOscillator();
  lfo.frequency.value = 0.06;
  const lfoGain = c.createGain();
  lfoGain.gain.value = 0.005;
  lfo.connect(lfoGain);
  lfoGain.connect(bedGain.gain);
  bed.connect(lp);
  lp.connect(bedGain);
  bedGain.connect(masterGain);
  bed.start();
  lfo.start();
  const air = c.createBufferSource();
  air.buffer = createNoiseBuffer(c, 4);
  air.loop = true;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 4200;
  bp.Q.value = 0.5;
  const airGain = c.createGain();
  airGain.gain.value = 0.003;
  air.connect(bp);
  bp.connect(airGain);
  airGain.connect(masterGain);
  air.start();
}

// --- Setup ---
export function initAudio() {
  safe(() => {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    ctx = new AudioContextClass();

    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-18, ctx.currentTime);
    compressor.knee.setValueAtTime(24, ctx.currentTime);
    compressor.ratio.setValueAtTime(4, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.25, ctx.currentTime);

    masterGain = ctx.createGain();
    masterGain.gain.value = muted ? 0 : MASTER_GAIN;
    masterGain.connect(compressor);
    compressor.connect(ctx.destination);

    // Called from a user gesture per the contract — kick the context awake.
    ctx.resume().catch(() => {});
    startRoomTone();
  });
}

// --- One-shot sounds ---
export function playPickup(pan = 0) {
  safe(() => {
    const c = getCtx();
    if (!c || !masterGain) return;
    const t = c.currentTime;
    // tiny metallic tink — quieter and brighter than the place sound
    tone(c, panDest(c, pan), {
      freq: 3400, freqEnd: 2600, glideTime: 0.04,
      peak: 0.16, attack: 0.002, decay: 0.05, start: t, dur: 0.09,
    });
  });
}

export function playPlace(pan = 0) {
  safe(() => {
    const c = getCtx();
    if (!c || !masterGain) return;
    const t = c.currentTime;
    const dest = panDest(c, pan);

    // (a) short filtered noise click — the mechanical "snap"
    noiseBurst(c, dest, {
      filterType: 'highpass', filterFreq: 4200,
      peak: 0.45, attack: 0.001, decay: 0.004, start: t, dur: 0.004,
    });
    // (b) low woody thump ~180Hz, fast decay
    tone(c, dest, {
      freq: 190, freqEnd: 130, glideTime: 0.09,
      peak: 0.55, attack: 0.002, decay: 0.1, start: t, dur: 0.13,
    });
    // (c) faint high metallic ping, bandpass filtered, fast exp decay
    const pingStart = t + 0.006;
    tone(c, dest, {
      freq: 3300, filterType: 'bandpass', filterQ: 9,
      peak: 0.22, attack: 0.002, decay: 0.08, start: pingStart, dur: 0.1,
    });
  });
}

export function playError() {
  safe(() => {
    const c = getCtx();
    if (!c || !masterGain) return;
    const t = c.currentTime;
    // felt-mallet thunk: low sine body
    tone(c, masterGain, {
      freq: 125, freqEnd: 85, glideTime: 0.15,
      peak: 0.38, attack: 0.006, decay: 0.16, start: t, dur: 0.2,
    });
    // soft low-passed noise thud to round off the attack (felt, not buzz)
    noiseBurst(c, masterGain, {
      filterType: 'lowpass', filterFreq: 380,
      peak: 0.14, attack: 0.002, decay: 0.05, start: t, dur: 0.03,
    });
    // a clearly-"wrong" downward buzz: two low sawtooths a semitone apart,
    // lowpassed so it reads as a disapproving "nnnh", not an arcade error beep
    tone(c, masterGain, {
      type: 'sawtooth', freq: 208, freqEnd: 146, glideTime: 0.2,
      filterType: 'lowpass', filterFreq: 780, filterQ: 0.7,
      peak: 0.15, attack: 0.005, decay: 0.24, start: t, dur: 0.3,
    });
    tone(c, masterGain, {
      type: 'sawtooth', freq: 220, freqEnd: 155, glideTime: 0.2,
      filterType: 'lowpass', filterFreq: 780, filterQ: 0.7,
      peak: 0.12, attack: 0.005, decay: 0.24, start: t + 0.006, dur: 0.3,
    });
  });
}

export function playHover() {
  safe(() => {
    const c = getCtx();
    if (!c || !masterGain) return;
    const t = c.currentTime;
    tone(c, masterGain, {
      type: 'triangle', freq: 1800,
      peak: 0.05, attack: 0.001, decay: 0.02, start: t, dur: 0.03,
    });
  });
}

/** Soft parchment tap for DOM buttons and chips. */
export function playUiTap() {
  safe(() => {
    const c = getCtx();
    if (!c || !masterGain) return;
    const t = c.currentTime;
    tone(c, masterGain, {
      type: 'triangle', freq: 1250, freqEnd: 980, glideTime: 0.03,
      peak: 0.055, attack: 0.001, decay: 0.03, start: t, dur: 0.05,
    });
  });
}

/** Near-silent blip driving Tessa's typewriter (call sparsely, not per char). */
export function playTypeBlip() {
  safe(() => {
    const c = getCtx();
    if (!c || !masterGain) return;
    const t = c.currentTime;
    tone(c, masterGain, {
      type: 'sine', freq: 2200 + Math.random() * 320,
      peak: 0.016, attack: 0.001, decay: 0.012, start: t, dur: 0.02,
    });
  });
}

export function playWind(progress = 0) {
  safe(() => {
    const c = getCtx();
    if (!c || !masterGain) return;
    const p = Math.min(1, Math.max(0, progress));
    const pitchMul = 1 + 0.4 * p;
    const t = c.currentTime;
    // ratchet pawl click — filtered noise burst
    noiseBurst(c, masterGain, {
      filterType: 'bandpass', filterFreq: 2200 * pitchMul, filterQ: 3,
      peak: 0.32, attack: 0.001, decay: 0.02, start: t, dur: 0.008,
    });
    // faint tonal body for the click
    tone(c, masterGain, {
      type: 'square', freq: 900 * pitchMul,
      peak: 0.07, attack: 0.001, decay: 0.015, start: t, dur: 0.02,
    });
  });
}

function chimeNote(c, freq, t, dur) {
  const g = c.createGain();
  g.gain.value = 0.0001;
  g.connect(masterGain);

  const fundamental = c.createOscillator();
  fundamental.type = 'triangle';
  fundamental.frequency.value = freq;
  fundamental.connect(g);

  // slightly detuned octave overtone gives it a warm brass-ish shimmer
  const overtone = c.createOscillator();
  overtone.type = 'sine';
  overtone.frequency.value = freq * 2.01;
  const overtoneGain = c.createGain();
  overtoneGain.gain.value = 0.25;
  overtone.connect(overtoneGain);
  overtoneGain.connect(g);

  expEnv(g.gain, t, 0.3, 0.01, dur);
  fundamental.start(t);
  fundamental.stop(t + dur + 0.05);
  overtone.start(t);
  overtone.stop(t + dur + 0.05);
}

export function playChime() {
  safe(() => {
    const c = getCtx();
    if (!c || !masterGain) return;
    const t = c.currentTime;
    chimeNote(c, 659.25, t, 0.26); // E5
    chimeNote(c, 783.99, t + 0.22, 0.34); // G5
  });
}

function musicBoxNote(c, freq, t, sparkleBus) {
  const g = c.createGain();
  g.gain.value = 0.0001;
  g.connect(masterGain);
  if (sparkleBus) g.connect(sparkleBus);

  // sine fundamental + 3rd/5th harmonic partials = plucked music-box timbre
  const partials = [1, 3, 5];
  const partialGains = [1, 0.35, 0.15];
  partials.forEach((mult, i) => {
    const osc = c.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * mult;
    const pg = c.createGain();
    pg.gain.value = partialGains[i];
    osc.connect(pg);
    pg.connect(g);
    osc.start(t);
    osc.stop(t + 0.9);
  });

  expEnv(g.gain, t, 0.26, 0.004, 0.75);
}

export function playFanfare() {
  safe(() => {
    const c = getCtx();
    if (!c || !masterGain) return;
    const t = c.currentTime;

    // subtle feedback delay for a bit of music-box sparkle
    const delay = c.createDelay(1);
    delay.delayTime.value = 0.12;
    const feedback = c.createGain();
    feedback.gain.value = 0.25;
    const wet = c.createGain();
    wet.gain.value = 0.3;
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(wet);
    wet.connect(masterGain);

    // pentatonic music-box melody, ~2s total: C5 E5 G5 C6 G5 E5 C5
    const melody = [523.25, 659.25, 783.99, 1046.5, 783.99, 659.25, 523.25];
    const stepTime = 0.25;
    melody.forEach((freq, i) => musicBoxNote(c, freq, t + i * stepTime, delay));
  });
}

// --- Ticking loop — lookahead scheduler, not raw per-tick setTimeout ---
// Each tick carries ±2.5% pitch and ±15% level jitter (a machine, not a
// metronome); once the case closes over the movement the tick goes muffled.
let tickMuffled = false;
export function setTickMuffled(v) {
  tickMuffled = !!v;
}

function scheduleTick(time, isTock) {
  if (!ctx || !masterGain) return;
  const jitter = 1 + (Math.random() - 0.5) * 0.05;
  const freq = (isTock ? 1500 : 1900) * jitter * (tickMuffled ? 0.72 : 1);
  tone(ctx, masterGain, {
    type: 'square', freq,
    filterType: tickMuffled ? 'lowpass' : 'bandpass',
    filterFreq: tickMuffled ? 950 : undefined,
    filterQ: tickMuffled ? 0.8 : 6,
    peak: (tickMuffled ? 0.075 : 0.12) * (0.85 + Math.random() * 0.3),
    attack: 0.001, decay: tickMuffled ? 0.032 : 0.02, start: time, dur: 0.04,
  });
}

function tickScheduler() {
  const c = getCtx();
  if (!c) return;
  while (nextTickTime < c.currentTime + SCHEDULE_AHEAD_SEC) {
    scheduleTick(nextTickTime, tickToggle);
    tickToggle = !tickToggle;
    nextTickTime += tickIntervalSec;
  }
}

export function startTicking(bpm = 300) {
  safe(() => {
    const c = getCtx();
    if (!c) return;
    stopTicking();

    const ticksPerSecond = Math.max(0.1, bpm / 60);
    tickIntervalSec = 1 / ticksPerSecond;
    nextTickTime = c.currentTime + 0.05;
    tickToggle = false;

    tickTimerId = setInterval(() => safe(tickScheduler), TICK_LOOKAHEAD_MS);
  });
}

export function stopTicking() {
  safe(() => {
    if (tickTimerId !== null) {
      clearInterval(tickTimerId);
      tickTimerId = null;
    }
  });
}

// --- Mute ---
export function setMuted(m) {
  safe(() => {
    muted = !!m;
    if (!ctx || !masterGain) return;
    const now = ctx.currentTime;
    masterGain.gain.cancelScheduledValues(now);
    masterGain.gain.setValueAtTime(masterGain.gain.value, now);
    masterGain.gain.linearRampToValueAtTime(muted ? 0 : MASTER_GAIN, now + 0.03);
  });
}

export function isMuted() {
  return muted;
}
