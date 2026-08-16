// Everything environment-specific, in one place. Nothing in the game hardcodes
// a domain — see .env.example for the full list and how to set them.
//
// This module is imported (transitively, via score.js) by the leaderboard
// worker, which runs in Cloudflare Workers where `import.meta.env` and `window`
// do not exist. Every read here has to survive that, hence the guards.

const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};

const str = (v) => String(v == null ? '' : v).trim();

// Where the game is served from — used for share links and the footer printed
// on the score card.
//
// Unset is the RIGHT default, not a missing config: it derives the URL from the
// running page, so a fork, a PR preview, a custom domain and localhost each
// share links that point back at themselves. Set VITE_PAGE_URL only to pin a
// canonical address (e.g. you have a short domain and want every shared card to
// advertise that one).
export const PAGE_URL = (() => {
  const pinned = str(env.VITE_PAGE_URL);
  if (pinned) return pinned.endsWith('/') ? pinned : `${pinned}/`;
  if (typeof window === 'undefined' || !window.location) return '/';
  const { origin, pathname } = window.location;
  return `${origin}${pathname.replace(/[^/]*$/, '')}`; // keep the directory, drop the document
})();

// The bench records worker. Unset disables the board entirely — no requests, no
// errors, no panel. That is a supported state, not a broken one.
export const LEADERBOARD_API = str(env.VITE_LEADERBOARD_API).replace(/\/+$/, '');

// What the game calls itself in share text and page copy.
export const SITE_NAME = str(env.VITE_SITE_NAME) || 'The Mechanical Way';
