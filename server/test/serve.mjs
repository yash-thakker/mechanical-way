// Serves the REAL worker over HTTP so a browser can talk to it, backed by an
// in-memory SQLite. Use this to play the game against a live board without
// deploying anything:
//
//   npm run board          # this server, on :8787
//   npm run dev:board      # vite pointed at it
//
// Data lives only as long as the process. `wrangler dev` in server/ is the
// higher-fidelity option (real D1, real Workers runtime) — this exists so the
// board can be tested with nothing installed but Node.
import { createServer } from 'node:http';
import worker from '../src/worker.js';
import { makeEnv } from './d1-shim.mjs';

const PORT = Number(process.env.PORT || 8787);
// Unset ALLOWED_ORIGINS = any origin, so this works from whatever port vite
// picked. The deployed worker should always pin it (see wrangler.toml).
const { env } = makeEnv({ origins: process.env.ALLOWED_ORIGINS || '' });

// Seed a few rivals so the board has something to rank you against. A real
// board is never empty, and an empty one hides every ordering bug.
// Enough names to overflow the top ten, so the board's scroll and the sticky
// "your row" both have something to do.
const SEED = [
  ['seed-marguerite', 'Marguerite', 120, 0],
  ['seed-hferrand', 'H. Ferrand', 95, 1],
  ['seed-okonkwo', 'Okonkwo', 150, 0],
  ['seed-vasquez', 'Vasquez', 210, 3],
  ['seed-tanaka', 'Tanaka', 180, 0],
  ['seed-oyelaran', 'Oyelaran', 240, 2],
  ['seed-brandt', 'Brandt', 300, 1],
  ['seed-ilyushin', 'Ilyushin', 165, 1],
  ['seed-abara', 'Abara', 205, 0],
  ['seed-novak', 'Novak', 260, 2],
  ['seed-kaur', 'Kaur', 135, 2],
  ['seed-mbeki', 'Mbeki', 320, 1],
  ['seed-lindqvist', 'Lindqvist', 400, 4],
  ['seed-otsuka', 'Otsuka', 280, 5],
];

async function seed() {
  const { computeScore } = await import('../../src/score.js');
  // one IP each: the worker rate-limits per address, and a seed run must never
  // spend the budget the player is about to need
  for (const [i, [playerId, name, timeSec, mistakes]] of SEED.entries()) {
    const { score } = computeScore({ timeSec, mistakes });
    await worker.fetch(new Request('https://board.test/score', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': `10.0.0.${i + 2}` },
      body: JSON.stringify({ playerId, name, timeSec, mistakes, score }),
    }), env);
  }
}

createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://127.0.0.1:${PORT}${req.url}`, {
    method: req.method,
    headers: req.headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : body,
  });
  const out = await worker.fetch(request, env);
  res.writeHead(out.status, Object.fromEntries(out.headers));
  res.end(Buffer.from(await out.arrayBuffer()));
}).listen(PORT, async () => {
  await seed();
  console.log(`bench records on http://127.0.0.1:${PORT}  (${SEED.length} rivals seeded, in memory)`);
});
