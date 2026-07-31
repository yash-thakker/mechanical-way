// Assembly sequence: step definitions, dialogue, tools, ghost targets, placement.
import * as THREE from 'three';
import {
  PLAN, MOTION, AUTO, KEYLESS, COLORS, STEM_GEOM,
  TRAIN_BRIDGE_FEET, BARREL_BRIDGE_FEET,
} from './parts/watchParts.js';
import { TOOLS } from './parts/tools.js';

const c = (n) => '#' + n.toString(16).padStart(6, '0');

// Bridge screw / jewel positions in movement-local space — derived from the
// same exported geometry the bridges are built from, so they can't drift.
const BRIDGE_Y = 3.1; // train bridge top now 3.03 (climbing train)
const SCREW_POINTS = TRAIN_BRIDGE_FEET.map((f) => [f.x, BRIDGE_Y, f.y]);
const OIL_POINTS = [
  [PLAN.third.x, BRIDGE_Y + 0.05, PLAN.third.y],
  [PLAN.fourth.x, BRIDGE_Y + 0.05, PLAN.fourth.y],
  [PLAN.escape.x, BRIDGE_Y + 0.05, PLAN.escape.y],
];
const COCK_DIR = PLAN.balance.clone().normalize();
const COCK_SCREW = [[PLAN.balance.x + COCK_DIR.x * 2.5, 4.19, PLAN.balance.y + COCK_DIR.y * 2.5]];
// Click-system screws: barrel bridge feet (offsets from the barrel), then the
// ratchet screw on the arbor and the crown wheel's LEFT-threaded screw.
const BB_SCREWS = BARREL_BRIDGE_FEET.map((f) => [PLAN.barrel.x + f.x, 2.5, PLAN.barrel.y + f.y]);
const RATCHET_SCREW = [[PLAN.barrel.x, 2.79, PLAN.barrel.y]];
const CROWN_SCREW = [[PLAN.crownWheel.x, 2.8, PLAN.crownWheel.y]];
const ROTOR_SCREW = [[0, 4.46, 0]];
// the keyless jumper screw lives on the DIAL side (space: 'dial'); its head
// base must land ON the jumper plate top (0.42), not float above it
const JUMPER_SCREW = [[KEYLESS.jumper.x, 0.45, KEYLESS.jumper.y]];

// Dial-side placement offsets (dialGroup local): motion works stack beneath
// the dial, which is why the dial and hands sit higher than in a bare build.
const DIAL_OFFSETS = {
  cannon: [0, 0, 0],
  minutewheel: [MOTION.minuteWheel.x, 0, MOTION.minuteWheel.y],
  hourwheel: [0, 0.18, 0],
  // Keyless stack, reconciled against the parts' real geometry so nothing
  // interpenetrates and nothing floats (and it all still fits under the dial
  // at 0.44): lever plate 0.02..0.14 with its groove post dipping to the stem
  // · yoke arm 0.15..0.25 with its tongue down IN the pinion groove at rod
  // height · stem rod centered 0.02 passing UNDER the jumper plate.
  stem: [KEYLESS.stem.x, -0.1, KEYLESS.stem.y], // rod sits at rim level, half-recessed
  settinglever: [KEYLESS.settinglever.x, 0.02, KEYLESS.settinglever.y],
  yoke: [KEYLESS.yoke.x, 0.1, KEYLESS.yoke.y],
  jumper: [KEYLESS.jumper.x, 0.16, KEYLESS.jumper.y],
  datejumper: [KEYLESS.datejumper.x, 0.02, KEYLESS.datejumper.y],
  dateindicator: [KEYLESS.dateindicator.x, 0.02, KEYLESS.dateindicator.y],
  // the ring rides ON the lever jumper's plate (its top is 0.38) the way a
  // real calendar ring rides its guides; the dial still covers it at 0.44
  datering: [0, 0.33, 0],
  dial: [0, 0.44, 0],
  // hands sit ON their posts: hour hub wraps the hour-wheel pipe (top 0.68),
  // minute cap covers the cannon's tip (0.83), seconds hub takes the little
  // subdial pivot built into the dial
  hourhand: [0, 0.6, 0],
  minutehand: [0, 0.66, 0],
  secondhand: [0, 0.65, 0],
};

// Parts that really SLIDE into engagement get an approach vector: the tween
// first carries them to target+offset, then slides them home along −offset.
// The stem inserts inward through the case edge; the yoke slides its tongue
// sideways into the sliding pinion's groove.
export const APPROACH = {
  stem: [2.6, 0.35, 0],
  yoke: (() => {
    const dir = new THREE.Vector2(KEYLESS.stem.x + STEM_GEOM.slidingPinionX, 0)
      .sub(KEYLESS.yoke).normalize();
    return [-dir.x * 1.15, 0.3, -dir.y * 1.15];
  })(),
};

// Each step: a part placement (type 'place'), a pure tool action (type 'service'),
// or a placement followed by a tool action (service field on a place step).
export const STEPS = [
  {
    id: 'barrel', tiers: ['easy', 'medium', 'hard'], label: 'The Barrel', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.barrel.x, 0, PLAN.barrel.y),
    announce: "We start where the power lives: the orange barrel drum. Tweezers, and set it on its jewel, left of center.",
    success: "Click. That drum will hold near a week of power.",
    fact: 'The barrel is the fuel tank: a hollow drum whose outer teeth drive the whole gear train.',
  },
  {
    id: 'mainspring', tiers: ['easy', 'medium', 'hard'], label: 'The Mainspring', phase: 'movement', tool: 'winder',
    pos: new THREE.Vector3(PLAN.barrel.x, 0.12, PLAN.barrel.y),
    announce: "The blue mainspring. Use the mainspring winder; hand-coiling kinks it for good.",
    success: "In she goes. Every tick you'll ever hear starts right there.",
    fact: 'A mainspring stores energy by fighting its own shape. Blued steel resists fatigue for decades.',
    fact2: 'Relaxed, it forms an S-curve, so inner and outer coils carry similar tension when wound tight.',
  },
  {
    id: 'lid', tiers: ['easy', 'medium', 'hard'], label: 'The Barrel Lid', phase: 'movement', tool: 'press',
    pos: new THREE.Vector3(PLAN.barrel.x, 1.42, PLAN.barrel.y),
    announce: "Cap the barrel with the light-orange lid. Hand press, so it seats dead square.",
    success: "Sealed. One little power plant.",
    fact: 'The lid snaps into a groove in the barrel wall. Crooked by a hair, and the spring escapes.',
  },
  {
    id: 'center', tiers: ['easy', 'medium', 'hard'], label: 'The Center Wheel', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(0, 0, 0),
    announce: "Tweezers for the gold center wheel, dead center. It turns once an hour.",
    success: "Hear the teeth catch? That's a gear train being born.",
    fact: 'Big wheel drives small pinion: each stage of the train trades force for speed.',
  },
  {
    id: 'third', tiers: ['easy', 'medium', 'hard'], label: 'The Third Wheel', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.third.x, 0, PLAN.third.y),
    announce: "The green third wheel, upper right — it seats one step ABOVE the center wheel. The train climbs.",
    success: "Power's flowing: barrel to center to third.",
    fact: 'Every pinion hangs under its wheel, so each wheel rides a step higher than the one driving it.',
  },
  {
    id: 'fourth', tiers: ['easy', 'medium', 'hard'], label: 'The Fourth Wheel', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.fourth.x, 0, PLAN.fourth.y),
    announce: "The blue fourth wheel, near the edge — another step up the staircase. It turns once a minute, exactly.",
    success: "One turn a minute. The seconds hand will live here.",
    fact: 'On many watches the small-seconds ring on the dial sits directly over this wheel.',
  },
  {
    id: 'escape', tiers: ['easy', 'medium', 'hard'], label: 'The Escape Wheel', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.escape.x, 0, PLAN.escape.y),
    announce: "Gently now: the red escape wheel, the most delicate part on this bench.",
    success: "Down safe. It keeps the train from unwinding all at once.",
    fact: "Escape teeth are shaped to lock against ruby pallets, then 'escape' one tooth per beat.",
  },
  {
    id: 'bridge', tiers: ['easy', 'medium', 'hard'], label: 'The Train Bridge', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(0, 0, 0),
    announce: "The brass train bridge. Line its three rubies over the arbors and lower it flat.",
    success: "Beautiful fit. Now the screwdriver: snug down both screws.",
    service: {
      tool: 'screwdriver', verb: 'screw', points: SCREW_POINTS,
      done: "Snug, and no more. Small threads strip like wet paper.",
    },
    fact: 'Bridges make a movement serviceable: unscrew one and a whole layer lifts out.',
  },
  {
    id: 'oil', tiers: ['easy', 'medium', 'hard'], label: 'Oil the Jewels', phase: 'movement', tool: 'oiler', type: 'service',
    announce: "Oiler time: one droplet on each of the three bridge jewels. No more, no less.",
    service: {
      tool: 'oiler', verb: 'oil', points: OIL_POINTS,
      done: "Three perfect droplets. Good for five years.",
    },
    fact: 'Rubies are used as bearings because oiled ruby-on-steel barely wears. Jewels are functional, not decoration.',
    fact2: 'Each jewel has a tiny basin cut into it; surface tension holds the droplet against the spinning pivot for years.',
  },
  {
    id: 'pallet', tiers: ['easy', 'medium', 'hard'], label: 'The Pallet Fork', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.pallet.x, 0, PLAN.pallet.y),
    announce: "The purple pallet fork, the gatekeeper. Its ruby fingers make the tick and the tock.",
    success: "Placed. That was plumbing, sugar. Next comes the soul.",
    fact: 'The fork does two jobs: it meters the train AND passes a tiny push back to keep the balance swinging.',
    fact2: 'Its horns and guard pin are a safety: they stop the fork switching sides if the watch is knocked mid-beat.',
  },
  {
    id: 'balance', tiers: ['easy', 'medium', 'hard'], label: 'The Balance Wheel', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.balance.x, 0, PLAN.balance.y),
    announce: "And now the heart: the teal balance wheel and its hairspring. Lower her in, real careful.",
    success: "Look at her settle. Now pin the cock down: one screw.",
    service: {
      tool: 'screwdriver', verb: 'screw', points: COCK_SCREW,
      done: "Pinned. But nothing holds the spring yet, sugar. We need the click.",
      doneEasy: "That's it. Hold your breath, darlin'. Time to wind her up.",
    },
    fact: 'The hairspring is the timekeeper: its stiffness and the wheel’s inertia set the beat, not the gears.',
    fact2: 'The regulator on the cock slides along the hairspring to shorten or lengthen its live length. Faster or slower.',
  },
  {
    id: 'barrelbridge', tiers: ['medium', 'hard'], label: 'The Barrel Bridge', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.barrel.x, 0, PLAN.barrel.y),
    announce: "Fresh parts! The tan barrel bridge caps the barrel and hosts the winding gear.",
    success: "Solid. Screwdriver: both feet.",
    service: {
      tool: 'screwdriver', verb: 'screw', points: BB_SCREWS,
      done: "Good. Foundation first, machinery second.",
    },
    fact: 'The barrel arbor pokes through this bridge. Its square tip is what the ratchet wheel will grab.',
  },
  {
    id: 'ratchet', tiers: ['medium', 'hard'], label: 'The Ratchet Wheel', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.barrel.x, 0, PLAN.barrel.y),
    announce: "The amber ratchet wheel. Its square hole grips the arbor to wind the spring.",
    success: "Seated on the square. One screw down the middle.",
    service: {
      tool: 'screwdriver', verb: 'screw', points: RATCHET_SCREW,
      done: "Snug. Now, what stops it spinning straight back?",
    },
    fact: 'Square-on-square drive: the ratchet cannot slip on the arbor the way a round hole would.',
  },
  {
    id: 'click', tiers: ['medium', 'hard'], label: 'The Click', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.click.x, 0, PLAN.click.y),
    announce: "The pink click. Forward it slips, backward it jams. One-way traffic.",
    success: "In place. That little lever holds back the whole spring.",
    fact: "Every 'click' you hear winding a watch is this beak snapping back onto the wheel. That sound named the part.",
    fact2: 'The click spring is just a springy sliver of steel. Squeeze it and it pushes the beak back into the teeth.',
  },
  {
    id: 'crownwheel', tiers: ['medium', 'hard'], label: 'The Crown Wheel', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.crownWheel.x, 0, PLAN.crownWheel.y),
    announce: "Last of the winding gear: the steel-blue crown wheel. The crown you twist drives this.",
    success: "A secret, hon: its screw is left-threaded. Tighten it counterclockwise.",
    service: {
      tool: 'screwdriver', verb: 'screw', points: CROWN_SCREW,
      done: "That's the winding train done. Now we wind her. Hold your breath, darlin'.",
    },
    fact: 'The crown wheel screw is left-hand threaded so the winding motion tightens it instead of backing it out.',
  },
  {
    id: 'reversers', tiers: ['hard'], label: 'The Reverser Wheels', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(AUTO.reversers.x, 0, AUTO.reversers.y),
    announce: "Now she feeds herself: the yellow-and-blue reverser wheels. Any swing becomes winding.",
    success: "In they go. Clockwise or counter, the mainspring wins.",
    fact: 'Inside each pair, fish-shaped levers jam against the yellow wheel one way and skate over it the other.',
    fact2: 'One pair drives directly; the other runs through its twin to flip the direction first.',
  },
  {
    id: 'rotor', tiers: ['hard'], label: 'The Rotor', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(0, 0, 0),
    announce: "The violet rotor: a half-moon weight. Every move of your wrist winds her.",
    success: "Beautiful. One screw through the heart.",
    service: {
      tool: 'screwdriver', verb: 'screw', points: ROTOR_SCREW,
      done: "Done. She's self-winding now. Time to flip her over.",
    },
    fact: 'The rim carries most of the mass. Heavier metal at the edge means more winding from every swing.',
  },
  {
    id: 'cannon', tiers: ['medium', 'hard'], label: 'The Cannon Pinion', phase: 'dial', tool: 'press',
    announce: "Dial side up! Press the dark-gold cannon pinion onto the center arbor. Friction, not screws.",
    success: "Pressed. That slip-fit is the clutch for setting time.",
    fact: 'The cannon pinion turns once an hour with the center wheel. The minute hand will ride this very tube.',
    fact2: 'When you set a watch, the cannon slips on its arbor while the train stands still. Friction is the clutch.',
  },
  {
    id: 'minutewheel', tiers: ['medium', 'hard'], label: 'The Minute Wheel', phase: 'dial', tool: 'tweezers',
    announce: "The sage minute wheel, between cannon and hour wheel. The 12-to-1 magic.",
    success: "Meshed. One hour in, one-twelfth out.",
    fact: 'Minute-to-hour is 12:1, done in two stages: cannon to minute wheel, then minute pinion to hour wheel.',
  },
  {
    id: 'hourwheel', tiers: ['medium', 'hard'], label: 'The Hour Wheel', phase: 'dial', tool: 'tweezers',
    announce: "The copper hour wheel drops loose over the cannon. Two tubes, one axis.",
    success: "Twelve times slower than the cannon under it. Motion works done.",
    fact: 'The hour wheel is not fixed to anything. It floats on the cannon, held down by the dial itself.',
  },
  {
    id: 'stem', tiers: ['hard'], label: 'The Crown & Stem', phase: 'dial', tool: 'tweezers',
    announce: "Now the keyless works, my favorite. Slide the steel stem in at three o'clock.",
    success: "In. One shaft, three jobs: wind, date, time.",
    fact: 'The sliding pinion has a square hole; the winding pinion a round one. That one difference makes the whole crown work.',
    fact2: "Turn the crown backwards and the pinions' sawtooth faces just shove each other apart. Nothing breaks.",
  },
  {
    id: 'settinglever', tiers: ['hard'], label: 'The Setting Lever', phase: 'dial', tool: 'tweezers',
    announce: "The rust setting lever drops its post into the stem's groove.",
    success: "Hooked. Pull once for the date, twice for the time.",
    fact: 'Each crown position parks the lever in a different groove. That is the click you feel pulling a crown out.',
  },
  {
    id: 'yoke', tiers: ['hard'], label: 'The Yoke', phase: 'dial', tool: 'tweezers',
    announce: "The olive yoke slides the pinion between winding and setting. Same crown, different gears.",
    success: "That's the clutch pedal of a watch, right there.",
    fact: 'In time-setting mode a stop lever also brushes the balance and halts it ("hacking"), so you can set to the second.',
  },
  {
    id: 'jumper', tiers: ['hard'], label: 'The Lever Jumper', phase: 'dial', tool: 'tweezers',
    announce: "Last of the keyless works: the mustard lever jumper. It gives the crown its three click-stops.",
    success: "Cover her with the screw, sugar. Screwdriver.",
    service: {
      tool: 'screwdriver', verb: 'screw', points: JUMPER_SCREW, space: 'dial',
      done: "Wind, date, time, one little crown. Clockmaker's poetry.",
    },
    fact: "Three grooves in its arm = the crown's three positions: wind, date, time.",
  },
  {
    id: 'datejumper', tiers: ['hard'], label: 'The Date Jumper', phase: 'dial', tool: 'tweezers',
    announce: "Now the calendar, right on top. The rose date jumper makes the date snap at midnight.",
    success: "Set. No snap, and today would smear into tomorrow.",
    fact: 'A date that changed continuously would sit half-way between numbers for hours. The jumper stores force and releases it in one snap.',
  },
  {
    id: 'dateindicator', tiers: ['hard'], label: 'The Date Indicator', phase: 'dial', tool: 'tweezers',
    announce: "The jade indicator gear. It winds up all evening... and lets go at midnight.",
    success: "That hidden spring is the calendar's patience.",
    fact: 'The indicator turns once per day off the hour wheel: two turns of the hour hand to one of the date drive.',
  },
  {
    id: 'datering', tiers: ['hard'], label: 'The Date Ring', phase: 'dial', tool: 'tweezers',
    announce: "The white date ring, thirty-one days round. It floats over everything you just built.",
    success: "A whole calendar under there. Short months you nudge by hand.",
    fact: 'The whole ring turns one tooth per midnight. The dial will hide all of it but one little window.',
  },
  {
    id: 'dial', tiers: ['easy', 'medium', 'hard'], label: 'The Dial', phase: 'dial', tool: 'tweezers',
    announce: "Her face: the cream dial. Hold it by the edges; a fingerprint is forever.",
    success: "Well now. Ain't she pretty.",
    fact: 'Dial feet solder to the back and press into the plate. No glue, no screws from the front.',
    fact2: 'The dial also does a job: it holds the floating hour wheel down against the movement.',
  },
  {
    id: 'hourhand', tiers: ['easy', 'medium', 'hard'], label: 'The Hour Hand', phase: 'dial', tool: 'press',
    announce: "Hands go on slowest first. Press the hour hand straight down onto its pipe.",
    success: "One hand on. She can almost tell time.",
    fact: 'Hands are friction-fit: pressed cones grip polished posts. No fastener at all.',
  },
  {
    id: 'minutehand', tiers: ['easy', 'medium', 'hard'], label: 'The Minute Hand', phase: 'dial', tool: 'press',
    announce: "Now the minute hand, onto the cannon pinion inside the hour hand.",
    success: "Two hands, one axis, different speeds.",
    fact: 'Watchmakers set both hands dead on twelve before pressing, so they never argue about the hour.',
  },
  {
    id: 'secondhand', tiers: ['easy', 'medium', 'hard'], label: 'The Second Hand', phase: 'dial', tool: 'press',
    announce: "Last: the little seconds hand, in the small ring. Breathe out, then press.",
    success: "Hands are on! One more thing, and you know exactly what it is...",
    fact: 'The small-seconds ring sits directly over the fourth wheel, which turns once a minute.',
  },
];

export const LEGEND = [
  { id: 'barrel', name: 'Barrel', color: c(COLORS.barrel), blurb: 'Power plant. Houses the mainspring.' },
  { id: 'mainspring', name: 'Mainspring', color: c(COLORS.mainspring), blurb: 'Coiled steel ribbon. The energy source.' },
  { id: 'lid', name: 'Barrel Lid', color: c(COLORS.lid), blurb: 'Seals the spring inside the drum.' },
  { id: 'center', name: 'Center Wheel', color: c(COLORS.center), blurb: '1 turn per hour. Minutes live here.' },
  { id: 'third', name: 'Third Wheel', color: c(COLORS.third), blurb: 'Speed multiplier between center and fourth.' },
  { id: 'fourth', name: 'Fourth Wheel', color: c(COLORS.fourth), blurb: '1 turn per minute. Seconds live here.' },
  { id: 'escape', name: 'Escape Wheel', color: c(COLORS.escape), blurb: '15 club teeth, released one per beat.' },
  { id: 'bridge', name: 'Train Bridge', color: c(COLORS.bridge), blurb: 'Jeweled roof holding the upper pivots.' },
  { id: 'pallet', name: 'Pallet Fork', color: c(COLORS.pallet), blurb: 'Locks and unlocks the train. Tick, tock.' },
  { id: 'balance', name: 'Balance Wheel', color: c(COLORS.balance), blurb: 'The heart. 18,000 beats per hour.' },
  { id: 'barrelbridge', name: 'Barrel Bridge', color: c(COLORS.barrelbridge), blurb: 'Foundation for the winding system.' },
  { id: 'ratchet', name: 'Ratchet Wheel', color: c(COLORS.ratchet), blurb: 'Square hole on the arbor. Turns it to wind.' },
  { id: 'click', name: 'Click', color: c(COLORS.click), blurb: 'One-way stop. The sound named the part.' },
  { id: 'crownwheel', name: 'Crown Wheel', color: c(COLORS.crownwheel), blurb: 'Winds the ratchet. Left-threaded screw!' },
  { id: 'reversers', name: 'Reverser Wheels', color: c(COLORS.reversers), blurb: 'One-way gears: any swing becomes winding.' },
  { id: 'rotor', name: 'Rotor', color: c(COLORS.rotor), blurb: 'Half-moon weight. Your wrist is the winder.' },
  { id: 'cannon', name: 'Cannon Pinion', color: c(COLORS.cannon), blurb: 'Friction-fit. The clutch for time-setting.' },
  { id: 'minutewheel', name: 'Minute Wheel', color: c(COLORS.minutewheel), blurb: 'The 12:1 go-between of the motion works.' },
  { id: 'hourwheel', name: 'Hour Wheel', color: c(COLORS.hourwheel), blurb: 'Floats on the cannon. 1 turn per 12 hours.' },
  { id: 'stem', name: 'Crown & Stem', color: c(COLORS.stem), blurb: 'One shaft, three jobs: wind, date, time.' },
  { id: 'settinglever', name: 'Setting Lever', color: c(COLORS.settinglever), blurb: 'Turns a crown-pull into a mode switch.' },
  { id: 'yoke', name: 'Yoke', color: c(COLORS.yoke), blurb: 'The clutch pedal: slides the pinion between gears.' },
  { id: 'jumper', name: 'Lever Jumper', color: c(COLORS.jumper), blurb: 'Three grooves = the crown’s three click-stops.' },
  { id: 'datejumper', name: 'Date Jumper', color: c(COLORS.datejumper), blurb: 'Spring finger. Makes the date snap at midnight.' },
  { id: 'dateindicator', name: 'Date Indicator', color: c(COLORS.dateindicator), blurb: 'Slow gear + hidden spring driving the ring.' },
  { id: 'datering', name: 'Date Ring', color: c(COLORS.datering), blurb: '31 days, one tooth per midnight.' },
  { id: 'dial', name: 'Dial', color: c(COLORS.dial), blurb: 'The face. Small seconds over the fourth wheel.' },
  { id: 'hourhand', name: 'Hour Hand', color: c(COLORS.hourhand), blurb: 'Rides the hour wheel pipe. 1 turn per 12 hours.' },
  { id: 'minutehand', name: 'Minute Hand', color: c(COLORS.minutehand), blurb: 'Friction-fit on the cannon pinion.' },
  { id: 'secondhand', name: 'Second Hand', color: c(COLORS.secondhand), blurb: 'On the fourth wheel arbor, in the small ring.' },
];

const WRONG_PART_LINES = [
  "Not that one yet, hon. We need the {COLOR} {NAME}. Check the spec sheet.",
  "Patience! That part's turn will come. Right now: the {COLOR} {NAME}.",
  "I admire the hustle, but the watch don't. {COLOR} {NAME} first.",
];

const COLOR_WORDS = {
  barrel: 'orange', mainspring: 'blue', lid: 'light-orange', center: 'gold',
  third: 'green', fourth: 'blue', escape: 'red', bridge: 'brass',
  pallet: 'purple', balance: 'teal', dial: 'cream',
  hourhand: 'blued-steel', minutehand: 'blued-steel', secondhand: 'blued-steel',
  barrelbridge: 'tan', ratchet: 'amber', click: 'pink', crownwheel: 'steel-blue',
  cannon: 'dark-gold', minutewheel: 'sage', hourwheel: 'copper',
  reversers: 'yellow-and-blue', rotor: 'violet', datejumper: 'rose',
  dateindicator: 'jade', datering: 'white', stem: 'steel',
  settinglever: 'rust', yoke: 'olive', jumper: 'mustard',
};

export function wrongPartLine(step, n) {
  if (!step || step.type === 'service') {
    return "No parts just now, sugar. This is tool work. Eyes on the glowing rings.";
  }
  return WRONG_PART_LINES[n % WRONG_PART_LINES.length]
    .replace('{COLOR}', COLOR_WORDS[step.id])
    .replace('{NAME}', step.label.replace('The ', '').toLowerCase());
}

export function wrongToolLine(neededId, selectedId) {
  const needed = TOOLS[neededId].name.toLowerCase();
  if (!selectedId) {
    return `Tools first, sugar! Fetch the ${needed} from the leather roll on your left.`;
  }
  const sel = TOOLS[selectedId];
  return `Whoa, that's the ${sel.name.toLowerCase()}. This job needs the ${needed}.`;
}

export function stepNotes(step) {
  const lines = [step.fact];
  if (step.fact2) lines.push(step.fact2);
  lines.push(`Tool: ${TOOLS[step.tool].name}`);
  if (step.service && step.service.tool !== step.tool) {
    lines.push(`Then: ${TOOLS[step.service.tool].name}`);
  }
  return {
    title: step.label,
    color: step.id === 'oil' ? c(COLORS.ruby) : c(COLORS[step.id]),
    lines,
  };
}

const GHOST_OPACITY = 0.22;

export class Assembly {
  constructor({ parts, movementGroup, dialGroup, scene }) {
    this.parts = parts;
    this.movementGroup = movementGroup;
    this.dialGroup = dialGroup;
    this.scene = scene;
    this.difficulty = 'medium';
    this.steps = STEPS.filter((s) => s.tiers.includes('medium'));
    this.stepIndex = -1;
    this.ghost = null;
    this.ghostMats = [];
    this.placed = new Set();
    this.onAdvance = null;
    this.onAllPlaced = null;
    this.time = 0;
  }

  setDifficulty(d) {
    this.difficulty = d;
    this.steps = STEPS.filter((s) => s.tiers.includes(d));
  }

  get currentStep() {
    return this.steps[this.stepIndex] || null;
  }

  begin() {
    this.stepIndex = -1;
    this.advance();
  }

  advance() {
    this.clearGhost();
    this.stepIndex += 1;
    if (this.stepIndex >= this.steps.length) {
      if (this.onAllPlaced) this.onAllPlaced();
      return;
    }
    const step = this.currentStep;
    if (step.type !== 'service') this.makeGhost(step);
    if (this.onAdvance) this.onAdvance(step, this.stepIndex);
  }

  targetWorldPos(out = new THREE.Vector3()) {
    if (this.ghost) return this.ghost.getWorldPosition(out);
    const step = this.currentStep;
    if (step?.service?.points?.length) {
      const p = step.service.points[0];
      const space = step.service.space === 'dial' ? this.dialGroup : this.movementGroup;
      return space.localToWorld(out.set(p[0], p[1], p[2]));
    }
    return out.set(0, 2, 0);
  }

  makeGhost(step) {
    const source = this.parts.get(step.id);
    if (!source) return;
    // Object3D.copy JSON-round-trips userData; ours holds object references
    // (osc, pivots), so blank it during the clone and restore after.
    const saved = [];
    source.traverse((o) => { saved.push([o, o.userData]); o.userData = {}; });
    const ghost = source.clone(true);
    for (const [o, u] of saved) o.userData = u;
    this.ghostMats = [];
    this.ghostBaseColors = [];
    ghost.traverse((o) => {
      if (o.isMesh) {
        const mat = new THREE.MeshBasicMaterial({
          color: o.material.color ? o.material.color.getHex() : 0xffffff,
          transparent: true,
          opacity: GHOST_OPACITY,
          depthWrite: false,
        });
        o.material = mat;
        this.ghostMats.push(mat);
        this.ghostBaseColors.push(mat.color.getHex());
        o.raycast = () => {};
        o.castShadow = false; // the clone copies the real part's shadow flags
        o.receiveShadow = false;
      }
    });
    if (step.phase === 'movement') {
      ghost.position.copy(step.pos);
      this.movementGroup.add(ghost);
    } else {
      ghost.position.copy(this.dialTargetWorld(step));
      this.scene.add(ghost);
    }
    ghost.rotation.set(0, 0, 0);
    ghost.scale.set(1, 1, 1); // source part sits mini in the tray
    ghost.visible = true; // source part may be hidden until its phase begins
    this.ghost = ghost;
  }

  dialTargetWorld(step) {
    const base = this.dialGroup.position;
    const [ox, oy, oz] = DIAL_OFFSETS[step.id] || [0, 0, 0];
    return new THREE.Vector3(base.x + ox, base.y + oy, base.z + oz);
  }

  clearGhost() {
    if (this.ghost) {
      this.ghost.parent?.remove(this.ghost);
      this.ghostMats.forEach((m) => m.dispose());
      this.ghost = null;
      this.ghostMats = [];
      this.ghostBaseColors = [];
    }
  }

  // A missed drop flares the ghost red for a beat: "HERE, not there."
  flareGhost() {
    this.flareT = 0.6;
  }

  update(dt) {
    this.time += dt;
    if (this.flareT > 0) this.flareT = Math.max(0, this.flareT - dt);
    if (this.ghostMats.length) {
      const flaring = this.flareT > 0;
      const o = flaring ? 0.55 : GHOST_OPACITY + Math.sin(this.time * 3.2) * 0.1;
      this.ghostMats.forEach((m, i) => {
        m.opacity = Math.max(0.08, o);
        const want = flaring ? 0xd93a24 : (this.ghostBaseColors[i] ?? 0xffffff);
        if (m.color.getHex() !== want) m.color.setHex(want);
      });
    }
  }

  // threshold is generous: dragged parts float ~1.9 units of drag-plane
  // parallax above the target, and only one target is live at a time
  isNearTarget(worldPos, threshold = 2.5) {
    const t = this.targetWorldPos(new THREE.Vector3());
    return Math.hypot(worldPos.x - t.x, worldPos.z - t.z) < threshold;
  }

  place(partId) {
    const step = this.currentStep;
    if (!step || step.id !== partId) return null;
    const part = this.parts.get(partId);
    const world = this.targetWorldPos(new THREE.Vector3());
    if (step.phase === 'movement') {
      this.movementGroup.add(part);
      part.position.copy(step.pos);
    } else {
      this.dialGroup.add(part);
      part.position.copy(this.dialTargetWorld(step)).sub(this.dialGroup.position);
    }
    part.rotation.set(0, 0, 0);
    part.userData.placed = true; // ticking only animates placed parts
    this.placed.add(partId);
    this.clearGhost();
    return world;
  }
}
