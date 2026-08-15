# Bench records board

A Cloudflare Worker + D1 behind the leaderboard. Free tier is far more than this
game will ever need.

The worker imports `computeScore` from `../src/score.js`, so the server and the
browser can't disagree about what a run is worth. Deploy from this directory,
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

## Local

```sh
cd server
wrangler d1 execute mechanical-way --local --file=./schema.sql
wrangler dev                                # http://127.0.0.1:8787
```

## API

| | |
| --- | --- |
| `GET /board?difficulty=hard&limit=10&playerId=…` | top N + `total` + `you` (your row and rank, if any) |
| `POST /score` | `{playerId, name, difficulty, score, timeSec, mistakes, dialStyle}` → same payload plus `nameAdjusted` |
| `DELETE /score` | `{playerId, difficulty?}` — take yourself off the board |

`player_id` never appears in a response. It is the only credential in the
system: whoever holds one owns that row, so leaking another player's id would
let anyone overwrite their score. Board rows carry a `you` boolean instead.

## What stops cheating

- Every submission is recomputed server-side from `(difficulty, timeSec,
  mistakes)`; a mismatched `score` is rejected, and the stored value is always
  the server's.
- Run time must clear a per-tier floor (40 / 65 / 95s) — below that it's a
  forged payload, not a speedrun.
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
