// Name inspection. Names go on a public page with the author's name on it, so
// they get checked server-side — the client's 16-char cap is a courtesy, not a
// control.
//
// The lists below are a starting point, not a moderation system. Swap in a
// maintained wordlist (e.g. the `obscenity` package) if the board ever sees
// real traffic; the shape of cleanName() won't change.

// Unambiguous strings — matched anywhere in the flattened name. Only put words
// here that can't hide inside an innocent one.
const BLOCK_SUBSTRING = [
  'fuck', 'shit', 'cunt', 'bitch', 'bastard', 'wanker', 'whore',
  'nigger', 'nigga', 'faggot', 'tranny', 'kike', 'chink', 'spic',
  'rapist', 'nazi', 'hitler', 'retard', 'pedo', 'porn',
];

// Short or substring-prone words — matched only as whole tokens, so "Cockburn",
// "Analog" and "Sussex" survive the inspection.
const BLOCK_WORD = [
  'ass', 'anal', 'cock', 'dick', 'fag', 'sex', 'slut', 'twat', 'rape', 'cum',
];

// Cheap leetspeak fold so "sh1t" and "f_u_c_k" land on the same string.
const LEET = {
  0: 'o', 1: 'i', 3: 'e', 4: 'a', 5: 's', 7: 't', 8: 'b',
  '@': 'a', $: 's', '!': 'i', '|': 'i', '+': 't',
};

// Invisible characters: C0/C1 controls, zero-width joiners and the bidi
// overrides that can make a board row render as something else entirely.
const CONTROL_RE = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069\ufeff]/g;

const LEET_RE = /[0134578@$!|+]/g;

function fold(s) {
  return s.toLowerCase().replace(LEET_RE, (c) => LEET[c] || c);
}

function flatten(s) {
  return fold(s).replace(/[^a-z]/g, '');
}

function tokens(s) {
  return fold(s).split(/[^a-z]+/).filter(Boolean);
}

// Returns the name to store. `adjusted` tells the client to explain itself —
// silently renaming someone reads as a bug.
export function cleanName(raw) {
  const name = String(raw == null ? '' : raw)
    .replace(CONTROL_RE, '') // control chars, zero-width, bidi overrides
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 16);

  if (!name) return { name: 'Watchmaker', adjusted: false };

  const flat = flatten(name);
  if (BLOCK_SUBSTRING.some((w) => flat.includes(w))) return { name: 'Watchmaker', adjusted: true };
  const parts = tokens(name);
  if (parts.some((t) => BLOCK_WORD.includes(t))) return { name: 'Watchmaker', adjusted: true };
  // a name with no letters at all ("...", "!!!") is noise on the board
  if (!flat) return { name: 'Watchmaker', adjusted: true };

  return { name, adjusted: false };
}
