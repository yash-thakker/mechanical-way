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

import { LEADERBOARD_API as API } from './config.js';

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

function writeCache(payload) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ...payload, ts: Date.now() }));
  } catch (e) { /* private mode — the cache is a nicety */ }
}

// A cache written by the old per-tier build has no `ts` of its own, so it
// reads as infinitely stale and is simply skipped.
export function cachedBoard() {
  const hit = readCache();
  if (!hit.ts || Date.now() - hit.ts > CACHE_TTL_MS) return null;
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
  if (data) writeCache(data);
  return data;
}

export async function fetchBoard() {
  if (!API) return null;
  const q = new URLSearchParams({ playerId: getPlayerId(), limit: '10' });
  const data = await call(`/board?${q}`);
  if (data) writeCache(data);
  return data;
}

// Board first, cache second — callers render whichever arrives.
export async function board() {
  return (await fetchBoard()) || cachedBoard();
}

export async function remove() {
  if (!API) return false;
  const data = await call('/score', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId: getPlayerId() }),
  });
  return !!data;
}
