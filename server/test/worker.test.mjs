// The bench-records worker, exercised against real SQLite. No Cloudflare
// account, no network — this imports the same src/worker.js that gets deployed.
//
//   npm run test:board
//
import worker from '../src/worker.js';
import { computeScore } from '../../src/score.js';
import { makeEnv } from './d1-shim.mjs';

let env = makeEnv().env;
// Sections that assert on totals start from an empty board rather than
// unpicking whatever the previous section left behind.
const reset = () => { env = makeEnv().env; };

let pass = 0, fail = 0;
function check(label, cond, extra = '') {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${extra}`); }
}

function req(method, path, { body, origin = 'http://localhost:5173', ip = '1.2.3.4' } = {}) {
  return worker.fetch(new Request(`https://board.test${path}`, {
    method,
    headers: {
      ...(origin ? { Origin: origin } : {}),
      'CF-Connecting-IP': ip,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }), env);
}

// A run the server will accept: the score is computed the same way it will be
// recomputed on arrival, so only the fields under test ever differ.
const run = (name, timeSec, mistakes, playerId) => ({
  playerId, name, timeSec, mistakes,
  score: computeScore({ timeSec, mistakes }).score,
});

console.log('\n-- submission + board --');
let r = await req('POST', '/score', { body: run('Tessa', 400, 2, 'player-aaaaaaaa') });
let j = await r.json();
check('first submission accepted', r.status === 200, JSON.stringify(j));
check('rank 1 on an empty board', j.you && j.you.rank === 1, JSON.stringify(j.you));
check('total counts the row', j.total === 1);
check('own row flagged', j.board[0] && j.board[0].you === true);
check('player_id never returned', !JSON.stringify(j).includes('player-aaaaaaaa'));

await req('POST', '/score', { body: run('Rival', 300, 0, 'player-bbbbbbbb'), ip: '5.6.7.8' });
r = await req('GET', '/board?playerId=player-aaaaaaaa');
j = await r.json();
check('faster cleaner run takes first', j.board[0].name === 'Rival', JSON.stringify(j.board));
check('demoted player now rank 2', j.you.rank === 2);
check('other rows not flagged as you', j.board[0].you === false && j.board[1].you === true);
check('the payload carries no tier', !('difficulty' in j), JSON.stringify(Object.keys(j)));

console.log('\n-- best-run-per-player --');
await req('POST', '/score', { body: run('Tessa', 900, 30, 'player-aaaaaaaa') });
j = await (await req('GET', '/board?playerId=player-aaaaaaaa')).json();
check('worse run does not replace the best', j.you.score === computeScore({ timeSec: 400, mistakes: 2 }).score, JSON.stringify(j.you));
check('still one row per player', j.total === 2);
await req('POST', '/score', { body: run('Tessa', 200, 0, 'player-aaaaaaaa') });
j = await (await req('GET', '/board?playerId=player-aaaaaaaa')).json();
check('better run does replace it', j.you.rank === 1, JSON.stringify(j.you));
check('and still one row', j.total === 2);

console.log('\n-- one board, whatever the client sends --');
// A stale client (or a forger) posting the old per-tier field must not create
// a second row: the tier is not part of the key any more.
await req('POST', '/score', { body: { ...run('Tessa', 150, 0, 'player-aaaaaaaa'), difficulty: 'easy' } });
j = await (await req('GET', '/board?difficulty=easy&playerId=player-aaaaaaaa')).json();
check('a stray difficulty field adds no row', j.total === 2, String(j.total));
check('and a stray difficulty query is ignored', j.you.rank === 1, JSON.stringify(j.you));

console.log('\n-- forged payloads --');
r = await req('POST', '/score', { body: { ...run('Cheat', 400, 0, 'player-cccccccc'), score: 999999 } });
check('inflated score rejected', r.status === 400, String(r.status));
r = await req('POST', '/score', { body: run('Speedy', 3, 0, 'player-cccccccc') });
check('sub-floor run time rejected', r.status === 400);
r = await req('POST', '/score', { body: run('Slowpoke', 99999, 0, 'player-cccccccc') });
check('absurd run time rejected', r.status === 400);
r = await req('POST', '/score', { body: { ...run('X', 400, 0, 'nope') } });
check('malformed player id rejected', r.status === 400);
r = await req('POST', '/score', { body: run('X', 400, -5, 'player-cccccccc') });
check('negative mistakes rejected', r.status === 400);
j = await (await req('GET', '/board')).json();
check('no forged row landed', j.total === 2, JSON.stringify(j));

console.log('\n-- names --');
r = await req('POST', '/score', { body: run('shit lord', 420, 1, 'player-dddddddd') });
j = await r.json();
check('blocked name adjusted', j.nameAdjusted === true, JSON.stringify(j));
check('stored as Watchmaker', j.you.name === 'Watchmaker', JSON.stringify(j.you));
r = await req('POST', '/score', { body: run('Cockburn', 430, 1, 'player-eeeeeeee') });
j = await r.json();
check('innocent name survives (substring false positive)', j.nameAdjusted === false && j.you.name === 'Cockburn', JSON.stringify(j.you));
r = await req('POST', '/score', { body: run('sh1t', 440, 1, 'player-ffffffff') });
j = await r.json();
check('leetspeak folded', j.nameAdjusted === true);
r = await req('POST', '/score', { body: run('A‮B', 450, 1, 'player-gggggggg') });
j = await r.json();
check('bidi override stripped', j.you.name === 'AB', JSON.stringify(j.you));
r = await req('POST', '/score', { body: run('a'.repeat(80), 460, 1, 'player-hhhhhhhh') });
j = await r.json();
check('name clamped to 16', j.you.name.length === 16, String(j.you.name.length));

console.log('\n-- outside the top ten --');
reset();
for (let i = 0; i < 12; i++) {
  await req('POST', '/score', {
    body: run(`Bench${i}`, 200 + i, 0, `player-m${String(i).padStart(7, '0')}`),
    ip: `9.9.9.${i}`,
  });
}
await req('POST', '/score', { body: run('Straggler', 1500, 40, 'player-zzzzzzzz'), ip: '9.9.8.1' });
j = await (await req('GET', '/board?playerId=player-zzzzzzzz')).json();
check('top ten capped at 10 rows', j.board.length === 10, String(j.board.length));
check('straggler not in the top ten', !j.board.some((b) => b.you));
check('but still gets a rank', j.you && j.you.rank === 13, JSON.stringify(j.you));
check('total is everyone', j.total === 13, String(j.total));

console.log('\n-- rate limit --');
let limited = false;
for (let i = 0; i < 20; i++) {
  const res = await req('POST', '/score', {
    body: run(`Spam${i}`, 500 + i, 0, `player-s${String(i).padStart(7, '0')}`),
    ip: '7.7.7.7',
  });
  if (res.status === 429) { limited = true; break; }
}
check('an IP flooding the board gets throttled', limited);
r = await req('POST', '/score', { body: run('Calm', 600, 0, 'player-calmmmmm'), ip: '4.4.4.4' });
check('a different IP is unaffected', r.status === 200, String(r.status));

console.log('\n-- origins + removal --');
r = await req('GET', '/board', { origin: 'https://evil.example' });
check('foreign origin blocked', r.status === 403, String(r.status));
r = await req('GET', '/board', { origin: '' });
check('non-browser caller allowed', r.status === 200);
r = await req('OPTIONS', '/board');
check('preflight answered', r.status === 204 && r.headers.get('Access-Control-Allow-Origin') === 'http://localhost:5173');
r = await req('DELETE', '/score', { body: { playerId: 'player-calmmmmm' } });
check('delete accepted', r.status === 200);
j = await (await req('GET', '/board?playerId=player-calmmmmm')).json();
check('row is gone', j.you === null, JSON.stringify(j.you));
r = await req('GET', '/nonsense');
check('unknown route 404s', r.status === 404);
r = await req('POST', '/score', { body: undefined });
check('empty body rejected, not thrown', r.status === 400);

console.log('\n-- this run vs your standing best --');
{
  reset();
  const pid = 'player-runrank';
  let res = await (await req('POST', '/score', { body: run('Ada', 200, 0, pid) })).json();
  check('a first run is its own rank', res.runRank === res.you.rank, JSON.stringify({ r: res.runRank, y: res.you.rank }));
  check('a first run counts as improved', res.improved === true);
  const best = res.you.score;
  res = await (await req('POST', '/score', { body: run('Ada', 1200, 25, pid) })).json();
  check('a worse run is not improved', res.improved === false, JSON.stringify(res.you));
  check('standing row keeps the better score', res.you.score === best);
  check('worse run ranks behind the standing best', res.runRank > res.you.rank, JSON.stringify({ run: res.runRank, best: res.you.rank }));
  res = await (await req('POST', '/score', { body: run('Ada', 150, 0, pid) })).json();
  check('a better run is improved', res.improved === true);
  check('and its run rank equals the new standing rank', res.runRank === res.you.rank);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
