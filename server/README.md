# Bench records board

A Cloudflare Worker + D1 behind the leaderboard. Free tier is far more than this
game will ever need.

One board: every run is the same 31-step build, so there is nothing to key a
tier on. The worker imports `computeScore` from `../src/score.js`, so the server
and the browser can't disagree about what a run is worth. Deploy from this directory,
but keep it inside the repo — wrangler bundles that relative import.

## One-time setup

```sh
npm i -g wrangler          # or npx wrangler ...
wrangler login

cd server
wrangler d1 create mechanical-way          # paste database_id into wrangler.toml
wrangler d1 execute mechanical-way --remote --file=./schema.sql
wrangler secret put IP_SALT                # any long random string
wrangler deploy
```

`wrangler deploy` prints the URL (`https://mechanical-way-board.<you>.workers.dev`).
Two places need it:

1. **GitHub Pages** — repo Settings → Secrets and variables → Actions →
   Variables → new variable `LEADERBOARD_API` with that URL. The deploy workflow
   passes it to the build.
2. **Local dev** — `echo 'VITE_LEADERBOARD_API=http://127.0.0.1:8787' > .env.local`
   in the repo root.

With no URL configured the game runs exactly as it does today: no board, no
requests, no errors. That's the intended fallback, not a broken state.

Then set `ALLOWED_ORIGINS` in `wrangler.toml` to your Pages origin so the board
can't be written from someone else's page.

## Testing it

Nothing to install and no Cloudflare account — `server/test/` runs the real
`src/worker.js` against SQLite through a D1-shaped shim (`d1-shim.mjs`, which
rewrites `?1`/`?2` to `?` because `node:sqlite` will not bind numbered params).
Node 22+ for `--experimental-sqlite`.

**The rules, on their own** — upserts, rank vs run-rank, forged payloads, name
inspection, rate limiting, CORS (47 assertions, a couple of seconds):

```sh
npm run test:board
```

**Play against a live board** — two terminals, then open http://localhost:5180.
Fourteen rivals are seeded — more than the top ten, so the records list has
something to scroll and the sticky "your row" has somewhere to stick — and the
data lives only as long as the process:

```sh
npm run board       # worker on :8787, in-memory
npm run dev:board   # the game on :5180, pointed at it
```

**End to end**, with both of the above already running — plays real runs and
checks what the player actually sees, including the panel's scroll and sticky
row (~15 min for four 31-step runs, needs system Chrome):

```sh
npm run test:board:e2e
```

`dev:board` pins 5180 with `--strictPort` on purpose: a drifting port serves a
build with no `VITE_LEADERBOARD_API`, and every board assertion then fails for a
reason that has nothing to do with the board.

Two things the suites cannot cover, worth a manual look: a **refused
submission** (a headless run clears the 95s floor easily, so the test starves
the clock instead), and the **board going down mid-run**, which the e2e fakes
by aborting requests.

## Local, with the real runtime

Closer to production — real D1, real Workers runtime:

```sh
cd server
wrangler d1 execute mechanical-way --local --file=./schema.sql
wrangler dev                                # http://127.0.0.1:8787
```

Then `echo 'VITE_LEADERBOARD_API=http://127.0.0.1:8787' > .env.local` in the
repo root and `npm run dev`.

## API

| | |
| --- | --- |
| `GET /board?limit=10&playerId=…` | top N + `total` + `you` (your row and rank, if any) |
| `POST /score` | `{playerId, name, score, timeSec, mistakes, dialStyle}` → same payload plus `nameAdjusted` |
| `DELETE /score` | `{playerId}` — take yourself off the board |

`player_id` never appears in a response. It is the only credential in the
system: whoever holds one owns that row, so leaking another player's id would
let anyone overwrite their score. Board rows carry a `you` boolean instead.

## What stops cheating

- Every submission is recomputed server-side from `(timeSec, mistakes)`; a
  mismatched `score` is rejected, and the stored value is always the server's.
- Run time must clear a 95s floor — 31 hand placements below that is a forged
  payload, not a speedrun.
- 15 writes per minute per IP, keyed by a salted hash. The raw address is never
  stored.

This stops the casual `score=999999`. It does not stop someone who reads
`score.js` and posts a plausible payload — the next step there would be
submitting a per-step run log and validating the timing, which is only worth
building if the board actually gets attacked.

## Names

`src/names.js` strips control characters, zero-width joiners and bidi overrides
(a board row that renders backwards is a defacement), then checks a blocklist.
A blocked name is stored as "Watchmaker" and the response sets `nameAdjusted` so
the game can explain itself — renaming someone silently reads as a bug.

The wordlist is a starting point, not a moderation system. Swap in a maintained
one if this ever sees real traffic.
