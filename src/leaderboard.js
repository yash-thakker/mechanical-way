// src/leaderboard.js — the bench records board (see server/README.md)
//
// Name-only, no login. A uuid in localStorage identifies the browser so a
// returning player UPDATES their best instead of stacking rows. That id is the
// only credential in the system — never render it, never put it in a share
// link, never let it into the DOM.
//
// Every call here is best-effort and time-boxed: a slow or dead board must
// never hold up the complete screen. Failures resolve to null, and callers
// fall back to the cached board (or to no board at all).
//
// Unconfigured is a supported state: with no VITE_LEADERBOARD_API the module
// reports enabled === false and makes no requests ever.

const API = String(
  (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_LEADERBOARD_API) || ''
).replace(/\/+$/, '');

const ID_KEY = 'mw-player-id';
const CACHE_KEY = 'mw-board-cache';
const TIMEOUT_MS = 4000;
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

export const enabled = !!API;

// ---------------------------------------------------------------------------
// player id
// ---------------------------------------------------------------------------

let memoryId = ''; // private browsing: the run still lands, it just can't be updated later

function newId() {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch (e) { /* fall through */ }
  return `p-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getPlayerId() {
  try {
    const saved = localStorage.getItem(ID_KEY);
    if (saved) return saved;
    const id = newId();
    localStorage.setItem(ID_KEY, id);
    return id;
  } catch (e) {
    if (!memoryId) memoryId = newId();
    return memoryId;
  }
}

// ---------------------------------------------------------------------------
// cache — the panel should never open empty on a returning player
// ---------------------------------------------------------------------------

function readCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const obj = raw ? JSON.parse(raw) : null;
    return obj && typeof obj === 'object' ? obj : {};
  } catch (e) {
    return {};
  }
}

function writeCache(difficulty, payload) {
  try {
    const all = readCache();
    all[difficulty] = { ...payload, ts: Date.now() };
    localStorage.setItem(CACHE_KEY, JSON.stringify(all));
  } catch (e) { /* private mode — the cache is a nicety */ }
}

export function cachedBoard(difficulty) {
  const hit = readCache()[difficulty];
  if (!hit || Date.now() - (hit.ts || 0) > CACHE_TTL_MS) return null;
  return { ...hit, stale: true };
}

// ---------------------------------------------------------------------------
// transport
// ---------------------------------------------------------------------------

async function call(path, options = {}) {
  if (!API) return null;
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetch(API + path, { ...options, signal: ctrl ? ctrl.signal : undefined });
    if (!res.ok) return null;
    const data = await res.json();
    return data && typeof data === 'object' && !data.error ? data : null;
  } catch (e) {
    return null; // offline, blocked, timed out, CORS — all the same to the game
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// public API — every one of these resolves null instead of throwing
// ---------------------------------------------------------------------------

export async function submit(entry) {
  if (!API || !entry) return null;
  const payload = {
    playerId: getPlayerId(),
    name: entry.name,
    difficulty: entry.difficulty,
    score: entry.score,
    timeSec: entry.timeSec,
    mistakes: entry.mistakes,
    dialStyle: entry.dialStyle,
  };
  const data = await call('/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (data) writeCache(data.difficulty || entry.difficulty, data);
  return data;
}

export async function fetchBoard(difficulty) {
  if (!API) return null;
  const q = new URLSearchParams({ difficulty, playerId: getPlayerId(), limit: '10' });
  const data = await call(`/board?${q}`);
  if (data) writeCache(difficulty, data);
  return data;
}

// Board first, cache second — callers render whichever arrives.
export async function board(difficulty) {
  return (await fetchBoard(difficulty)) || cachedBoard(difficulty);
}

export async function remove(difficulty) {
  if (!API) return false;
  const body = { playerId: getPlayerId() };
  if (difficulty) body.difficulty = difficulty;
  const data = await call('/score', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return !!data;
}

// "#7 of 1,204" — the line that makes a player press Build another.
export function rankLine(you, total, difficulty) {
  if (!you || !you.rank) return '';
  const tier = difficulty ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1) : '';
  const of = total ? ` of ${Number(total).toLocaleString()}` : '';
  return `#${Number(you.rank).toLocaleString()}${of}${tier ? ` on ${tier}` : ''}`;
}
