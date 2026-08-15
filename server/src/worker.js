// The bench records board — a Cloudflare Worker over D1.
//
// Name-only, no accounts. A uuid generated in the browser (player_id) is what
// makes a returning player update their own best instead of adding a row, and
// it is the only credential there is: WHOEVER HOLDS AN ID OWNS THAT ROW. So it
// is never returned to anyone — board rows carry a `you` boolean instead.
//
// Scores are not trusted. computeScore is imported from the game itself, so the
// server recomputes every submission from (difficulty, timeSec, mistakes) and
// stores its own answer. That plus a per-tier floor on run time kills the
// obvious forgeries; it is not proof against a patient forger, and it isn't
// meant to be.

import { computeScore } from '../../src/score.js';
import { cleanName } from './names.js';

const DIFFS = ['easy', 'medium', 'hard'];
const DIALS = ['cocktail', 'waffle', 'field'];

// Floors: 15 / 22 / 31 hand placements, each with a tool pick and a camera
// move. Nobody beats these honestly.
const MIN_SEC = { easy: 40, medium: 65, hard: 95 };
const MAX_SEC = 7200;
const MAX_MISTAKES = 999;

const BOARD_LIMIT = 10;
const BOARD_LIMIT_MAX = 50;
const RL_WINDOW_SEC = 60;
const RL_MAX = 15;

// ---------------------------------------------------------------------------
// plumbing
// ---------------------------------------------------------------------------

function allowList(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

// An empty Origin is a non-browser caller (curl, a health check) — there are no
// cookies or auth here, so nothing is gained by blocking it.
function originAllowed(origin, env) {
  if (!origin) return true;
  const list = allowList(env);
  return list.length === 0 || list.includes(origin);
}

function corsHeaders(origin, env) {
  const list = allowList(env);
  const allow = !origin ? '*' : (list.length === 0 || list.includes(origin)) ? origin : list[0] || '*';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

function int(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : NaN;
}

function sanitizeId(v) {
  const s = String(v == null ? '' : v);
  return /^[A-Za-z0-9_-]{8,64}$/.test(s) ? s : '';
}

async function sha256(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// rate limit — fixed window, keyed by a salted hash of the IP
// ---------------------------------------------------------------------------

async function rateLimited(req, env) {
  const ip = req.headers.get('CF-Connecting-IP') || '';
  if (!ip) return false;
  const hash = await sha256(`${ip}:${env.IP_SALT || 'mechanical-way'}`);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % RL_WINDOW_SEC);

  const row = await env.DB.prepare(
    'SELECT count FROM rate WHERE ip_hash = ?1 AND window_start = ?2'
  ).bind(hash, windowStart).first();
  if (row && row.count >= RL_MAX) return true;

  await env.DB.prepare(
    `INSERT INTO rate (ip_hash, window_start, count) VALUES (?1, ?2, 1)
     ON CONFLICT(ip_hash) DO UPDATE SET
       count = CASE WHEN rate.window_start = ?2 THEN rate.count + 1 ELSE 1 END,
       window_start = ?2`
  ).bind(hash, windowStart).run();
  return false;
}

// ---------------------------------------------------------------------------
// queries
// ---------------------------------------------------------------------------

async function topRows(env, difficulty, limit, playerId) {
  const { results } = await env.DB.prepare(
    `SELECT player_id, name, score, time_sec, mistakes FROM scores
      WHERE difficulty = ?1 ORDER BY score DESC, time_sec ASC LIMIT ?2`
  ).bind(difficulty, limit).all();
  // player_id is stripped here and nowhere else — it must not leave the worker.
  return (results || []).map((r, i) => ({
    rank: i + 1,
    name: r.name,
    score: r.score,
    timeSec: r.time_sec,
    mistakes: r.mistakes,
    you: !!playerId && r.player_id === playerId,
  }));
}

async function countFor(env, difficulty) {
  const row = await env.DB.prepare(
    'SELECT COUNT(*) AS n FROM scores WHERE difficulty = ?1'
  ).bind(difficulty).first();
  return row ? row.n : 0;
}

// Rank counts everyone strictly ahead under the board's own ordering, so the
// number always agrees with the row the player can see.
async function rankFor(env, difficulty, playerId) {
  if (!playerId) return null;
  const mine = await env.DB.prepare(
    'SELECT name, score, time_sec, mistakes FROM scores WHERE difficulty = ?1 AND player_id = ?2'
  ).bind(difficulty, playerId).first();
  if (!mine) return null;
  const ahead = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM scores WHERE difficulty = ?1
       AND (score > ?2 OR (score = ?2 AND time_sec < ?3))`
  ).bind(difficulty, mine.score, mine.time_sec).first();
  return {
    rank: (ahead ? ahead.n : 0) + 1,
    name: mine.name,
    score: mine.score,
    timeSec: mine.time_sec,
    mistakes: mine.mistakes,
    you: true,
  };
}

// Where the run that was just submitted would sit — which is NOT the player's
// standing rank when an older, better run is holding their row. The card and
// Tessa quote this one, because they are describing this run's score.
async function rankForRun(env, difficulty, score, timeSec) {
  const ahead = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM scores WHERE difficulty = ?1
       AND (score > ?2 OR (score = ?2 AND time_sec < ?3))`
  ).bind(difficulty, score, timeSec).first();
  return (ahead ? ahead.n : 0) + 1;
}

async function boardPayload(env, difficulty, limit, playerId, extra) {
  const [board, total, you] = await Promise.all([
    topRows(env, difficulty, limit, playerId),
    countFor(env, difficulty),
    rankFor(env, difficulty, playerId),
  ]);
  return { difficulty, board, total, you, ...extra };
}

// ---------------------------------------------------------------------------
// routes
// ---------------------------------------------------------------------------

async function getBoard(url, env, headers) {
  const q = url.searchParams;
  const difficulty = DIFFS.includes(q.get('difficulty')) ? q.get('difficulty') : 'medium';
  const limit = Math.min(BOARD_LIMIT_MAX, Math.max(1, int(q.get('limit')) || BOARD_LIMIT));
  const playerId = sanitizeId(q.get('playerId'));
  return json(await boardPayload(env, difficulty, limit, playerId), 200, headers);
}

async function postScore(req, env, headers) {
  const body = await req.json().catch(() => null);
  if (!body) return json({ error: 'bad body' }, 400, headers);

  const playerId = sanitizeId(body.playerId);
  if (!playerId) return json({ error: 'bad player id' }, 400, headers);

  const difficulty = DIFFS.includes(body.difficulty) ? body.difficulty : '';
  if (!difficulty) return json({ error: 'bad difficulty' }, 400, headers);

  const timeSec = int(body.timeSec);
  const mistakes = int(body.mistakes);
  if (!(timeSec >= MIN_SEC[difficulty] && timeSec <= MAX_SEC)) {
    return json({ error: 'implausible time' }, 400, headers);
  }
  if (!(mistakes >= 0 && mistakes <= MAX_MISTAKES)) {
    return json({ error: 'bad mistakes' }, 400, headers);
  }

  // the submitted score is a claim; this is the score that gets stored
  const { score } = computeScore({ difficulty, timeSec, mistakes });
  if (int(body.score) !== score) return json({ error: 'score mismatch' }, 400, headers);

  if (await rateLimited(req, env)) return json({ error: 'slow down' }, 429, headers);

  const { name, adjusted } = cleanName(body.name);
  const dialStyle = DIALS.includes(body.dialStyle) ? body.dialStyle : null;
  const now = Math.floor(Date.now() / 1000);

  // Keep the best run per tier. A worse run leaves the row (and its name) alone.
  await env.DB.prepare(
    `INSERT INTO scores
       (player_id, name, difficulty, score, time_sec, mistakes, dial_style, created_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
     ON CONFLICT(player_id, difficulty) DO UPDATE SET
       name = excluded.name, score = excluded.score, time_sec = excluded.time_sec,
       mistakes = excluded.mistakes, dial_style = excluded.dial_style,
       created_at = excluded.created_at
     WHERE excluded.score > scores.score
        OR (excluded.score = scores.score AND excluded.time_sec < scores.time_sec)`
  ).bind(playerId, name, difficulty, score, timeSec, mistakes, dialStyle, now).run();

  const payload = await boardPayload(env, difficulty, BOARD_LIMIT, playerId, {
    nameAdjusted: adjusted,
    runRank: await rankForRun(env, difficulty, score, timeSec),
  });
  // did this run take over the player's row, or is an older best still holding it?
  payload.improved = !!payload.you && payload.you.score === score && payload.you.timeSec === timeSec;
  return json(payload, 200, headers);
}

// A player can take themselves off the board from the browser that put them
// there — the id in localStorage is the only proof of ownership there is.
async function deleteScore(req, env, headers) {
  const body = await req.json().catch(() => null);
  const playerId = sanitizeId(body && body.playerId);
  if (!playerId) return json({ error: 'bad player id' }, 400, headers);
  const difficulty = DIFFS.includes(body.difficulty) ? body.difficulty : '';
  if (difficulty) {
    await env.DB.prepare('DELETE FROM scores WHERE player_id = ?1 AND difficulty = ?2')
      .bind(playerId, difficulty).run();
  } else {
    await env.DB.prepare('DELETE FROM scores WHERE player_id = ?1').bind(playerId).run();
  }
  return json({ ok: true }, 200, headers);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get('Origin') || '';
    const headers = corsHeaders(origin, env);

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!originAllowed(origin, env)) return json({ error: 'origin not allowed' }, 403, headers);

    try {
      if (req.method === 'GET' && url.pathname === '/board') return await getBoard(url, env, headers);
      if (req.method === 'POST' && url.pathname === '/score') return await postScore(req, env, headers);
      if (req.method === 'DELETE' && url.pathname === '/score') return await deleteScore(req, env, headers);
    } catch (e) {
      return json({ error: 'server error' }, 500, headers);
    }
    return json({ error: 'not found' }, 404, headers);
  },
};
