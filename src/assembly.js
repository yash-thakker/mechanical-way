// Assembly sequence: step definitions, dialogue, tools, ghost targets, placement.
import * as THREE from 'three';
import { PLAN, MOTION, AUTO, KEYLESS, COLORS } from './parts/watchParts.js';
import { TOOLS } from './parts/tools.js';

const c = (n) => '#' + n.toString(16).padStart(6, '0');

// Bridge screw / jewel positions in movement-local space
const BRIDGE_Y = 2.5;
const SCREW_POINTS = [[4.7, BRIDGE_Y, 1.3], [-1.6, BRIDGE_Y, 5.6]];
const OIL_POINTS = [
  [PLAN.third.x, BRIDGE_Y + 0.05, PLAN.third.y],
  [PLAN.fourth.x, BRIDGE_Y + 0.05, PLAN.fourth.y],
  [PLAN.escape.x, BRIDGE_Y + 0.05, PLAN.escape.y],
];
const COCK_DIR = PLAN.balance.clone().normalize();
const COCK_SCREW = [[PLAN.balance.x + COCK_DIR.x * 2.5, 3.55, PLAN.balance.y + COCK_DIR.y * 2.5]];
// Click-system screws: barrel bridge feet (offsets from the barrel), then the
// ratchet screw on the arbor and the crown wheel's LEFT-threaded screw.
const BB_SCREWS = [
  [PLAN.barrel.x - 2.3, 2.5, PLAN.barrel.y - 2.0],
  [PLAN.barrel.x + 2.15, 2.5, PLAN.barrel.y + 1.05],
];
const RATCHET_SCREW = [[PLAN.barrel.x, 2.72, PLAN.barrel.y]];
const CROWN_SCREW = [[PLAN.crownWheel.x, 2.72, PLAN.crownWheel.y]];
const ROTOR_SCREW = [[0, 4.0, 0]];
// the keyless jumper screw lives on the DIAL side (space: 'dial')
const JUMPER_SCREW = [[KEYLESS.jumper.x, 0.5, KEYLESS.jumper.y]];

// Dial-side placement offsets (dialGroup local): motion works stack beneath
// the dial, which is why the dial and hands sit higher than in a bare build.
const DIAL_OFFSETS = {
  cannon: [0, 0, 0],
  minutewheel: [MOTION.minuteWheel.x, 0, MOTION.minuteWheel.y],
  hourwheel: [0, 0.18, 0],
  datejumper: [KEYLESS.datejumper.x, 0.02, KEYLESS.datejumper.y],
  dateindicator: [KEYLESS.dateindicator.x, 0.02, KEYLESS.dateindicator.y],
  datering: [0, 0.26, 0],
  stem: [KEYLESS.stem.x, 0.04, KEYLESS.stem.y],
  settinglever: [KEYLESS.settinglever.x, 0.02, KEYLESS.settinglever.y],
  yoke: [KEYLESS.yoke.x, 0.06, KEYLESS.yoke.y],
  jumper: [KEYLESS.jumper.x, 0.12, KEYLESS.jumper.y],
  dial: [0, 0.44, 0],
  hands: [0, 0.66, 0],
};

// Each step: a part placement (type 'place'), a pure tool action (type 'service'),
// or a placement followed by a tool action (service field on a place step).
export const STEPS = [
  {
    id: 'barrel', tiers: ['easy', 'medium', 'hard'], label: 'THE BARREL', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.barrel.x, 0, PLAN.barrel.y),
    announce: "We start where the power lives: the ORANGE barrel drum. Take the TWEEZERS from the roll — never fingers, sugar, skin oil rusts watch steel — and set the drum on its ruby jewel, left of center.",
    success: "Click. That drum will hold near a week of energy once its spring is inside.",
    fact: 'The barrel is the fuel tank: a hollow drum whose outer teeth drive the whole gear train.',
  },
  {
    id: 'mainspring', tiers: ['easy', 'medium', 'hard'], label: 'THE MAINSPRING', phase: 'movement', tool: 'winder',
    pos: new THREE.Vector3(PLAN.barrel.x, 0.12, PLAN.barrel.y),
    announce: "The BLUE mainspring: two feet of hardened steel ribbon coiled into two inches. You'll want the MAINSPRING WINDER — coil one by hand and you'll kink it, and a kinked spring never keeps time again.",
    success: "In she goes. Fully wound, that ribbon pushes like a mousetrap — every tick you'll ever hear starts right there.",
    fact: 'A mainspring stores energy by fighting its own shape. Blued steel resists fatigue for decades.',
    fact2: 'Relaxed, it forms an S-curve — so inner and outer coils carry similar tension when wound tight.',
  },
  {
    id: 'lid', tiers: ['easy', 'medium', 'hard'], label: 'THE BARREL LID', phase: 'movement', tool: 'press',
    pos: new THREE.Vector3(PLAN.barrel.x, 1.42, PLAN.barrel.y),
    announce: "Cap the barrel with its LIGHT-ORANGE lid, and use the HAND PRESS — it seats the lid dead square, so the spring can't pop it under pressure.",
    success: "Sealed. One little power plant, pressure-tight.",
    fact: 'The lid snaps into a groove in the barrel wall. Crooked by a hair, and the spring escapes.',
  },
  {
    id: 'center', tiers: ['easy', 'medium', 'hard'], label: 'THE CENTER WHEEL', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(0, 0, 0),
    announce: "TWEEZERS again, for the GOLD center wheel. It sits dead center and turns exactly once an hour — the minute hand will ride its long arbor.",
    success: "Hear the barrel's teeth catch that little pinion? That's a gear train being born.",
    fact: 'Big wheel drives small pinion: each stage of the train trades force for speed.',
  },
  {
    id: 'third', tiers: ['easy', 'medium', 'hard'], label: 'THE THIRD WHEEL', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.third.x, 0, PLAN.third.y),
    announce: "The GREEN third wheel is the go-between. Every wheel in the train spins faster than the one before it — that's how one slow spring drives a fast heartbeat. Upper right, on its jewel.",
    success: "Power's flowing: barrel to center to third. Feel the speed building?",
    fact: 'The third wheel exists purely to multiply speed between the center and fourth wheels.',
  },
  {
    id: 'fourth', tiers: ['easy', 'medium', 'hard'], label: 'THE FOURTH WHEEL', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.fourth.x, 0, PLAN.fourth.y),
    announce: "The BLUE fourth wheel turns once a minute, exactly — which is why the seconds hand will live on its pivot. Set it down low, near the edge.",
    success: "One turn a minute. Sixty seconds, metered out like clockwork — literally.",
    fact: 'On many watches the small-seconds ring on the dial sits directly over this wheel.',
  },
  {
    id: 'escape', tiers: ['easy', 'medium', 'hard'], label: 'THE ESCAPE WHEEL', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.escape.x, 0, PLAN.escape.y),
    announce: "Gently now — the RED escape wheel, the most delicate part on this bench. Fifteen club-shaped teeth, and the whole point of a watch: it keeps the train from unwinding all at once.",
    success: "Down safe. Without it, your watch would spend a week of power in three noisy seconds.",
    fact: "Escape teeth are shaped to lock against ruby pallets, then 'escape' one tooth per beat.",
  },
  {
    id: 'bridge', tiers: ['easy', 'medium', 'hard'], label: 'THE TRAIN BRIDGE', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(0, 0, 0),
    announce: "The BRASS train bridge is the roof over the train — it catches every wheel's upper pivot in a ruby jewel. Line its three rubies up over the arbors and lower it flat.",
    success: "Beautiful fit. Now she needs her screws — take the SCREWDRIVER and snug down both.",
    service: {
      tool: 'screwdriver', verb: 'screw', points: SCREW_POINTS,
      done: "Snug — and no more. Threads this size strip like wet paper if you crank them.",
    },
    fact: 'Bridges make a movement serviceable: unscrew one and a whole layer lifts out.',
  },
  {
    id: 'oil', tiers: ['easy', 'medium', 'hard'], label: 'OIL THE JEWELS', phase: 'movement', tool: 'oiler', type: 'service',
    announce: "Before the fork goes in: oil. Take the OILER and touch one droplet to each of the three bridge jewels. A dry jewel grinds; an over-oiled one slings oil everywhere. One droplet, dead center.",
    service: {
      tool: 'oiler', verb: 'oil', points: OIL_POINTS,
      done: "Three perfect droplets. That oil will still be doing its job in five years.",
    },
    fact: 'Rubies are used as bearings because oiled ruby-on-steel barely wears — jewels are functional, not decoration.',
    fact2: 'Each jewel has a tiny basin cut into it; surface tension holds the droplet against the spinning pivot for years.',
  },
  {
    id: 'pallet', tiers: ['easy', 'medium', 'hard'], label: 'THE PALLET FORK', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.pallet.x, 0, PLAN.pallet.y),
    announce: "The PURPLE pallet fork — the escapement's gatekeeper. Its two ruby fingers rock in and out of the escape wheel: lock, unlock, lock. That right there is your tick and your tock.",
    success: "Placed. Everything so far was plumbing, sugar. The next part is the soul.",
    fact: 'The fork does two jobs: it meters the train AND passes a tiny push back to keep the balance swinging.',
    fact2: 'Its horns and guard pin are a safety: they stop the fork switching sides if the watch is knocked mid-beat.',
  },
  {
    id: 'balance', tiers: ['easy', 'medium', 'hard'], label: 'THE BALANCE WHEEL', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.balance.x, 0, PLAN.balance.y),
    announce: "And now the heart: the TEAL balance wheel, under its brass cock, with a hairspring finer than a human hair. See the tiny ruby peg under it? That's the IMPULSE JEWEL — it's what kicks the pallet fork, and gets kicked back. Lower her in, real careful.",
    success: "Oh, my stars — look at her settle. Now pin the cock down: one screw, with the SCREWDRIVER.",
    service: {
      tool: 'screwdriver', verb: 'screw', points: COCK_SCREW,
      done: "Pinned. But don't wind her yet, sugar — nothing's holding the spring! Let go of that arbor now and it'd spin right back. We need the CLICK.",
      doneEasy: "That's it. Hold your breath, darlin' — time to wind her UP.",
    },
    fact: 'The hairspring is the timekeeper: its stiffness and the wheel’s inertia set the beat, not the gears.',
    fact2: 'The regulator on the cock slides along the hairspring to shorten or lengthen its live length — faster or slower.',
  },
  {
    id: 'barrelbridge', tiers: ['medium', 'hard'], label: 'THE BARREL BRIDGE', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.barrel.x, 0, PLAN.barrel.y),
    announce: "Fresh parts from the drawer! First the TAN barrel bridge — the foundation of the whole winding system. It caps the barrel arbor and gives the click and crown wheel somewhere to live. Two screws.",
    success: "Solid. Now she needs her screws — SCREWDRIVER, both feet.",
    service: {
      tool: 'screwdriver', verb: 'screw', points: BB_SCREWS,
      done: "Good. Foundation first, machinery second — that's the way.",
    },
    fact: 'The barrel arbor pokes through this bridge — its square tip is what the ratchet wheel will grab.',
  },
  {
    id: 'ratchet', tiers: ['medium', 'hard'], label: 'THE RATCHET WHEEL', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.barrel.x, 0, PLAN.barrel.y),
    announce: "The AMBER ratchet wheel. Look at its middle: a SQUARE hole, for the square tip of the barrel arbor. Turn this wheel and you turn the arbor — and the arbor winds the mainspring from the inside.",
    success: "Seated on the square. One screw down the middle — SCREWDRIVER.",
    service: {
      tool: 'screwdriver', verb: 'screw', points: RATCHET_SCREW,
      done: "Snug. Now — what stops it spinning straight back? That li'l thing is next.",
    },
    fact: 'Square-on-square drive: the ratchet cannot slip on the arbor the way a round hole would.',
  },
  {
    id: 'click', tiers: ['medium', 'hard'], label: 'THE CLICK', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.click.x, 0, PLAN.click.y),
    announce: "The PINK click, with its little click spring. Its beak drops between the winding teeth: forward it slips over 'em, backward it JAMS. One-way traffic for the mainspring.",
    success: "In place. That little lever is the only thing between a wound spring and chaos.",
    fact: "Every 'click' you hear winding a watch is this beak snapping back onto the wheel. That sound named the part.",
    fact2: 'The click spring is just a springy sliver of steel — squeeze it and it pushes the beak back into the teeth.',
  },
  {
    id: 'crownwheel', tiers: ['medium', 'hard'], label: 'THE CROWN WHEEL', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(PLAN.crownWheel.x, 0, PLAN.crownWheel.y),
    announce: "Last of the winding gear: the STEEL-BLUE crown wheel. It looks like it's missing every other tooth — those gaps are where the click's beak falls. In a cased watch, the crown you twist with your fingers drives THIS wheel.",
    success: "And here's a secret, hon: its screw is LEFT-threaded. Righty-loosey on this one — tighten it counterclockwise, or you'll snap it.",
    service: {
      tool: 'screwdriver', verb: 'screw', points: CROWN_SCREW,
      done: "That's the whole winding train: crown wheel to ratchet to arbor to spring. NOW we wind her. Hold your breath, darlin'.",
    },
    fact: 'The crown wheel screw is left-hand threaded so the winding motion tightens it instead of backing it out.',
  },
  {
    id: 'reversers', tiers: ['hard'], label: 'THE REVERSER WHEELS', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(AUTO.reversers.x, 0, AUTO.reversers.y),
    announce: "She's running — now let's teach her to feed herself. These YELLOW-AND-BLUE reverser wheels are a one-way trick: little levers inside catch in one direction and slide free in the other. Whichever way the rotor swings, the output turns the SAME way.",
    success: "In they go. Two pairs, so clockwise or counter, the mainspring always wins.",
    fact: 'Inside each pair, fish-shaped levers jam against the yellow wheel one way and skate over it the other.',
    fact2: 'One pair drives directly; the other runs through its twin to flip the direction first.',
  },
  {
    id: 'rotor', tiers: ['hard'], label: 'THE ROTOR', phase: 'movement', tool: 'tweezers',
    pos: new THREE.Vector3(0, 0, 0),
    announce: "The VIOLET rotor: a half-moon weight swinging free on the center. Every time your wrist moves, gravity swings it, the reversers straighten the motion out, and the ratchet winds. Walk around all day and she never runs down.",
    success: "Beautiful. One screw through the heart — SCREWDRIVER.",
    service: {
      tool: 'screwdriver', verb: 'screw', points: ROTOR_SCREW,
      done: "Done — she's self-winding now. Time to flip her over and give her a face.",
    },
    fact: 'The rim carries most of the mass — heavier metal at the edge means more winding from every swing.',
  },
  {
    id: 'cannon', tiers: ['medium', 'hard'], label: 'THE CANNON PINION', phase: 'dial', tool: 'press',
    announce: "Dial side up! Time for the MOTION WORKS — the gears that split one train into three hands. First the DARK-GOLD cannon pinion: press it onto the center arbor. Not screwed — FRICTION. Snug enough to turn with the train, loose enough to slip when you set the time.",
    success: "Pressed. That slip-fit is why setting your watch doesn't strip its gears.",
    fact: 'The cannon pinion turns once an hour with the center wheel — the minute hand will ride this very tube.',
    fact2: 'When you set a watch, the cannon slips on its arbor while the train stands still. Friction is the clutch.',
  },
  {
    id: 'minutewheel', tiers: ['medium', 'hard'], label: 'THE MINUTE WHEEL', phase: 'dial', tool: 'tweezers',
    announce: "The SAGE minute wheel is the go-between of the dial side. Its big wheel meshes the cannon pinion; its little pinion will drive the hour wheel. This is where the 12-to-1 reduction happens.",
    success: "Meshed. One hour in, one-twelfth of a turn out — almost.",
    fact: 'Minute-to-hour is 12:1, done in two stages: cannon→minute wheel, then minute pinion→hour wheel.',
  },
  {
    id: 'hourwheel', tiers: ['medium', 'hard'], label: 'THE HOUR WHEEL', phase: 'dial', tool: 'tweezers',
    announce: "The COPPER hour wheel drops loosely OVER the cannon pinion — two tubes, one inside the other, turning at different speeds on the same axis. Hour hand outside, minute hand inside. Ain't that clever?",
    success: "Twelve times slower than the cannon under it. The motion works are done.",
    fact: 'The hour wheel is not fixed to anything — it floats on the cannon, held down by the dial itself.',
  },
  {
    id: 'datejumper', tiers: ['hard'], label: 'THE DATE JUMPER', phase: 'dial', tool: 'tweezers',
    announce: "Now the calendar. First the ROSE date jumper plate: its gear will take a slow feed off the hour wheel, and its springy steel finger is what makes the date SNAP over at midnight instead of creeping all day.",
    success: "Set. Without that spring, today's date would smear into tomorrow's all afternoon.",
    fact: 'A date that changed continuously would sit half-way between numbers for hours — the jumper stores force and releases it in one snap.',
  },
  {
    id: 'dateindicator', tiers: ['hard'], label: 'THE DATE INDICATOR', phase: 'dial', tool: 'tweezers',
    announce: "The JADE indicator gear, with a tiny torsion spring hiding under its cover. It winds up slowly all evening, snags a tooth on the date ring... and lets GO at midnight.",
    success: "That little spring under the cover is the patience of the whole calendar.",
    fact: 'The indicator turns once per day off the hour wheel — 2 turns of the hour hand to 1 of the date drive.',
  },
  {
    id: 'datering', tiers: ['hard'], label: 'THE DATE RING', phase: 'dial', tool: 'tweezers',
    announce: "The WHITE date ring — all thirty-one days printed round its face. It floats loose around the movement; only the jumper and its spring hold it on a number.",
    success: "Now there's a window's worth of calendar under there. Mind: she counts 31 every month — short months you nudge her by hand.",
    fact: 'The whole ring turns one tooth per midnight. The dial will hide all of it but one little window.',
  },
  {
    id: 'stem', tiers: ['hard'], label: 'THE CROWN & STEM', phase: 'dial', tool: 'tweezers',
    announce: "The keyless works — my favorite mechanical marvel. Slide the STEEL stem in at three o'clock: the crown rides its tip, the WINDING pinion spins loose on it, and the SLIDING pinion locks onto its square so it must turn with the crown.",
    success: "In. One shaft, three jobs — wind, set the date, set the time — all by pulling it in and out.",
    fact: 'The sliding pinion has a SQUARE hole; the winding pinion a round one. That one difference makes the whole crown work.',
    fact2: "Turn the crown backwards and the pinions' sawtooth faces just shove each other apart — nothing breaks.",
  },
  {
    id: 'settinglever', tiers: ['hard'], label: 'THE SETTING LEVER', phase: 'dial', tool: 'tweezers',
    announce: "The RUST setting lever drops its post into the stem's groove — pull the crown and this lever ROTATES. Its other post hooks the corrector lever beside it. This is how a pull becomes a mode switch.",
    success: "Hooked. Pull once for the date, twice for the time.",
    fact: 'Each crown position parks the lever in a different groove — that is the click you feel pulling a crown out.',
  },
  {
    id: 'yoke', tiers: ['hard'], label: 'THE YOKE', phase: 'dial', tool: 'tweezers',
    announce: "The OLIVE yoke rides in the sliding pinion's groove and shoves it along the stem: pushed in, the pinion meets the winding gear; pulled out, it meets the little setting wheel instead. Same crown, different gears.",
    success: "That's the clutch pedal of a watch, right there.",
    fact: 'In time-setting mode a stop lever also brushes the balance and HALTS it — "hacking" — so you can set to the second.',
  },
  {
    id: 'jumper', tiers: ['hard'], label: 'THE LEVER JUMPER', phase: 'dial', tool: 'tweezers',
    announce: "Last of the keyless works: the MUSTARD lever jumper. It presses everything flat, its long arm gives the crown its three firm click-stops, and its springy tail walks the yoke home when you push the crown back in. One part, three jobs.",
    success: "Cover her with the screw — SCREWDRIVER — and the keyless works are done.",
    service: {
      tool: 'screwdriver', verb: 'screw', points: JUMPER_SCREW, space: 'dial',
      done: "Wind, date, time — all from one little crown. Pure clockmaker's poetry.",
    },
    fact: "Three grooves in its arm = the crown's three positions: wind, date, time.",
  },
  {
    id: 'dial', tiers: ['easy', 'medium', 'hard'], label: 'THE DIAL', phase: 'dial', tool: 'tweezers',
    announce: "Time to give her a face: the CREAM dial. Tweezers, and hold it by the edges — a fingerprint on a dial is forever. Notice the little seconds ring: it sits right over the fourth wheel.",
    success: "Well now. Ain't she pretty.",
    fact: 'Dial feet solder to the back and press into the plate — no glue, no screws from the front.',
    fact2: 'The dial also does a job: it holds the floating hour wheel down against the movement.',
  },
  {
    id: 'hands', tiers: ['easy', 'medium', 'hard'], label: 'THE HANDS', phase: 'dial', tool: 'press',
    announce: "Last: the BLUED-STEEL hands, with the HAND PRESS. Hour hand on the hour wheel's pipe, minute hand on the cannon, little seconds on the fourth wheel's long arbor. Press straight down — a bent hand stops the whole show.",
    success: "Hands are on! One more thing, and you know exactly what it is...",
    fact: 'Hands are friction-fit: pressed cones grip polished posts. No fastener at all.',
  },
];

export const LEGEND = [
  { id: 'barrel', name: 'Barrel', color: c(COLORS.barrel), blurb: 'Power plant — houses the mainspring.' },
  { id: 'mainspring', name: 'Mainspring', color: c(COLORS.mainspring), blurb: 'Coiled steel ribbon. The energy source.' },
  { id: 'lid', name: 'Barrel Lid', color: c(COLORS.lid), blurb: 'Seals the spring inside the drum.' },
  { id: 'center', name: 'Center Wheel', color: c(COLORS.center), blurb: '1 turn per hour — minutes live here.' },
  { id: 'third', name: 'Third Wheel', color: c(COLORS.third), blurb: 'Speed multiplier between center and fourth.' },
  { id: 'fourth', name: 'Fourth Wheel', color: c(COLORS.fourth), blurb: '1 turn per minute — seconds live here.' },
  { id: 'escape', name: 'Escape Wheel', color: c(COLORS.escape), blurb: '15 club teeth, released one per beat.' },
  { id: 'bridge', name: 'Train Bridge', color: c(COLORS.bridge), blurb: 'Jeweled roof holding the upper pivots.' },
  { id: 'pallet', name: 'Pallet Fork', color: c(COLORS.pallet), blurb: 'Locks and unlocks the train. Tick, tock.' },
  { id: 'balance', name: 'Balance Wheel', color: c(COLORS.balance), blurb: 'The heart — 18,000 beats per hour.' },
  { id: 'barrelbridge', name: 'Barrel Bridge', color: c(COLORS.barrelbridge), blurb: 'Foundation for the winding system.' },
  { id: 'ratchet', name: 'Ratchet Wheel', color: c(COLORS.ratchet), blurb: 'Square hole on the arbor — turns it to wind.' },
  { id: 'click', name: 'Click', color: c(COLORS.click), blurb: 'One-way stop. The sound named the part.' },
  { id: 'crownwheel', name: 'Crown Wheel', color: c(COLORS.crownwheel), blurb: 'Winds the ratchet. Left-threaded screw!' },
  { id: 'reversers', name: 'Reverser Wheels', color: c(COLORS.reversers), blurb: 'One-way gears: any swing becomes winding.' },
  { id: 'rotor', name: 'Rotor', color: c(COLORS.rotor), blurb: 'Half-moon weight. Your wrist is the winder.' },
  { id: 'cannon', name: 'Cannon Pinion', color: c(COLORS.cannon), blurb: 'Friction-fit — the clutch for time-setting.' },
  { id: 'minutewheel', name: 'Minute Wheel', color: c(COLORS.minutewheel), blurb: 'The 12:1 go-between of the motion works.' },
  { id: 'hourwheel', name: 'Hour Wheel', color: c(COLORS.hourwheel), blurb: 'Floats on the cannon. 1 turn per 12 hours.' },
  { id: 'datejumper', name: 'Date Jumper', color: c(COLORS.datejumper), blurb: 'Spring finger — makes the date SNAP at midnight.' },
  { id: 'dateindicator', name: 'Date Indicator', color: c(COLORS.dateindicator), blurb: 'Slow gear + hidden spring driving the ring.' },
  { id: 'datering', name: 'Date Ring', color: c(COLORS.datering), blurb: '31 days, one tooth per midnight.' },
  { id: 'stem', name: 'Crown & Stem', color: c(COLORS.stem), blurb: 'One shaft, three jobs: wind, date, time.' },
  { id: 'settinglever', name: 'Setting Lever', color: c(COLORS.settinglever), blurb: 'Turns a crown-pull into a mode switch.' },
  { id: 'yoke', name: 'Yoke', color: c(COLORS.yoke), blurb: 'The clutch pedal: slides the pinion between gears.' },
  { id: 'jumper', name: 'Lever Jumper', color: c(COLORS.jumper), blurb: 'Three grooves = the crown’s three click-stops.' },
  { id: 'dial', name: 'Dial', color: c(COLORS.dial), blurb: 'The face. Small seconds over the fourth wheel.' },
  { id: 'hands', name: 'Hands', color: c(COLORS.hands), blurb: 'Blued steel, friction-fit on their posts.' },
];

const WRONG_PART_LINES = [
  "Not that one yet, hon — we need the {COLOR} {NAME}. Check the spec sheet.",
  "Patience! That part's turn will come. Right now: the {COLOR} {NAME}.",
  "I admire the hustle, but the watch don't. {COLOR} {NAME} first.",
];

const COLOR_WORDS = {
  barrel: 'ORANGE', mainspring: 'BLUE', lid: 'LIGHT-ORANGE', center: 'GOLD',
  third: 'GREEN', fourth: 'BLUE', escape: 'RED', bridge: 'BRASS',
  pallet: 'PURPLE', balance: 'TEAL', dial: 'CREAM', hands: 'DARK-BLUE',
  barrelbridge: 'TAN', ratchet: 'AMBER', click: 'PINK', crownwheel: 'STEEL-BLUE',
  cannon: 'DARK-GOLD', minutewheel: 'SAGE', hourwheel: 'COPPER',
  reversers: 'YELLOW-AND-BLUE', rotor: 'VIOLET', datejumper: 'ROSE',
  dateindicator: 'JADE', datering: 'WHITE', stem: 'STEEL',
  settinglever: 'RUST', yoke: 'OLIVE', jumper: 'MUSTARD',
};

export function wrongPartLine(step, n) {
  if (!step || step.type === 'service') {
    return "No parts just now, sugar — this is tool work. Eyes on the glowing rings.";
  }
  return WRONG_PART_LINES[n % WRONG_PART_LINES.length]
    .replace('{COLOR}', COLOR_WORDS[step.id])
    .replace('{NAME}', step.label.replace('THE ', '').toLowerCase());
}

export function wrongToolLine(neededId, selectedId) {
  const needed = TOOLS[neededId].name;
  if (!selectedId) {
    return `Tools first, sugar! Fetch the ${needed} from the leather roll on your left.`;
  }
  const sel = TOOLS[selectedId];
  return `Whoa — that's the ${sel.name}. ${sel.use} This job calls for the ${needed}.`;
}

export function stepNotes(step) {
  const lines = [step.fact];
  if (step.fact2) lines.push(step.fact2);
  lines.push(`TOOL — ${TOOLS[step.tool].name}`);
  if (step.service && step.service.tool !== step.tool) {
    lines.push(`THEN — ${TOOLS[step.service.tool].name}`);
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
    }
  }

  update(dt) {
    this.time += dt;
    if (this.ghostMats.length) {
      const o = GHOST_OPACITY + Math.sin(this.time * 3.2) * 0.1;
      for (const m of this.ghostMats) m.opacity = Math.max(0.08, o);
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
