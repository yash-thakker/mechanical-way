// Generates the off-branch 404 page. Tessa's SVG comes from the real
// mascotSVGMarkup() so the stray page can never drift from the mascot the game
// draws — the only thing this file owns is the hallway around her.
//
// The page is fully self-contained on purpose: a host serves 404.html for ANY
// unmatched path, so a relative asset reference would resolve against a
// different directory every time and break.
import { mascotSVGMarkup } from '../src/character.js';

const TICKER = 'BRANCH UNSTABLE  ·  INCURSION OCCURRING  ·  VARIANT: UNKNOWN  ·  SEQUENCE VIOLATION  ·  NO SUCH PAGE ON RECORD  ·  RESET ADVISED  ·  ';

export function render({ pageUrl = '' } = {}) {
  const mascot = mascotSVGMarkup(280);
  const home = pageUrl ? (pageUrl.endsWith('/') ? pageUrl : `${pageUrl}/`) : '';
  // The link home has to be absolute, because a 404 page is served at arbitrary
  // depths and cannot tell where the site root is from its own URL. The deploy
  // workflow feeds the real address in via VITE_PAGE_URL (from
  // actions/configure-pages), so CI builds never guess.
  //
  // Without it, one guess is still worth making: on github.io, TWO OR MORE path
  // segments means a project site rooted at /<repo>/, while exactly one means a
  // user site rooted at /. (Checking only `p.length` sent user sites to the
  // page they had just failed to find.) Everywhere else, assume the root and
  // let a subpath deploy set VITE_PAGE_URL.
  const homeScript = home
    ? `document.getElementById('home').href = ${JSON.stringify(home)};`
    : `(function () {
      var p = location.pathname.split('/').filter(Boolean);
      var root = /\\.github\\.io$/i.test(location.hostname) && p.length > 1 ? '/' + p[0] + '/' : '/';
      document.getElementById('home').href = root;
    })();`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Off Branch · The Mechanical Way</title>
<meta name="robots" content="noindex" />
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>⌚</text></svg>" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Righteous&family=IBM+Plex+Sans:wght@400;600&family=IBM+Plex+Mono:wght@400;500;700&display=swap" rel="stylesheet" />
<style>
  *, *::before, *::after { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    background: #1a0f08;
    color: #f2e3be;
    font-family: "IBM Plex Sans", system-ui, sans-serif;
    overflow: hidden;
    display: grid;
    place-items: center;
  }

  /* ---- the hallway, receding ---------------------------------------- */
  .hall { position: fixed; inset: 0; overflow: hidden; }

  /* back wall wash */
  .hall::before {
    content: "";
    position: absolute; inset: 0;
    background: radial-gradient(120% 85% at 50% 46%, #7a3c12 0%, #40200d 40%, #180e07 80%);
  }

  /* ceiling discs, drifting away down the hall */
  .ceiling {
    position: absolute; top: 7vh; left: -25%; right: -25%; height: 30vh;
    background-image: radial-gradient(circle, #ffdca6 0 26%, rgba(255,220,166,0) 27%);
    background-size: 8vh 8vh;
    transform: perspective(55vh) rotateX(64deg);
    transform-origin: 50% 0;
    opacity: 0.42;
    animation: drift 9s linear infinite;
    mask-image: linear-gradient(to bottom, #000 40%, transparent);
    -webkit-mask-image: linear-gradient(to bottom, #000 40%, transparent);
  }
  @keyframes drift { to { background-position: 0 8vh; } }

  /* the supergraphic number on the back wall */
  .super {
    position: absolute; top: 50%; left: 50%;
    transform: translate(-50%, -52%);
    font-family: Righteous, Georgia, serif;
    font-size: min(64vh, 52vw);
    line-height: 0.8;
    color: #c2610f;
    opacity: 0.3;
    letter-spacing: -0.04em;
    user-select: none;
    animation: breathe 6s ease-in-out infinite;
  }
  @keyframes breathe { 50% { opacity: 0.19; } }

  /* ---- the amber ticker overhead ------------------------------------ */
  .ticker {
    position: absolute; top: 0; left: 0; right: 0; height: 6.4vh;
    min-height: 40px;
    background: #0f0b08;
    border-bottom: 2px solid #050303;
    overflow: hidden;
    display: flex; align-items: center;
    box-shadow: 0 12px 44px rgba(0,0,0,0.6);
  }
  /* One span-width per cycle, so the duration IS the read speed: ~60px/s, about
     what a person reads a marquee at. 30s put it near 200px/s — legible only if
     you already knew what it said. */
  .ticker__tape { display: flex; flex: none; animation: crawl 105s linear infinite; }
  .ticker__tape span {
    flex: none;
    font-family: "IBM Plex Mono", monospace;
    font-weight: 700;
    font-size: clamp(14px, 2.4vh, 22px);
    letter-spacing: 0.11em;
    color: #ffb734;
    white-space: pre;
    -webkit-font-smoothing: antialiased;
  }
  @keyframes crawl { to { transform: translateX(-50%); } }
  /* The LED grid, laid OVER the glyphs rather than punched through them. At
     1.5px every 5px it removed roughly a third of a 21px letterform and the
     text turned to mush; a half-opacity 1px line every 7px reads as dot-matrix
     while leaving the strokes intact. */
  .ticker::after {
    content: ""; position: absolute; inset: 0; pointer-events: none;
    background-image:
      repeating-linear-gradient(to right, rgba(15,11,8,0.55) 0 1px, transparent 1px 7px),
      repeating-linear-gradient(to bottom, rgba(15,11,8,0.55) 0 1px, transparent 1px 7px);
  }

  /* ---- the timeline, splitting, along the floor ---------------------- */
  .branch { position: absolute; left: 0; right: 0; bottom: 0; height: 34vh; }
  .branch svg { width: 100%; height: 100%; }
  .sacred { stroke: #ffc86b; stroke-width: 2.5; fill: none; opacity: 0.5; }
  .stray {
    stroke: #ff3b1f; stroke-width: 3.5; fill: none;
    stroke-dasharray: 7 8;
    filter: drop-shadow(0 0 7px rgba(255,59,31,0.85));
    animation: crawlDash 1.1s linear infinite;
  }
  @keyframes crawlDash { to { stroke-dashoffset: -30; } }
  .pip { fill: #ff3b1f; animation: pulse 1.4s ease-in-out infinite; }
  @keyframes pulse { 50% { opacity: 0.3; } }

  /* ---- Tessa + her line --------------------------------------------- */
  .stage {
    position: relative;
    display: grid; place-items: center;
    gap: 1.1rem;
    text-align: center;
    padding: 0 1.2rem;
    animation: hover 5s ease-in-out infinite;
  }
  @keyframes hover { 50% { transform: translateY(-8px); } }
  .stage svg { display: block; filter: drop-shadow(0 18px 34px rgba(0,0,0,0.55)); }
  .bubble {
    position: relative;
    background: #f2e3be; color: #2b1d10;
    border: 2px solid #c89b3c; border-radius: 12px;
    padding: 0.75rem 1.1rem;
    max-width: 30rem;
    font-size: clamp(0.95rem, 2.2vh, 1.1rem);
    box-shadow: 0 10px 26px rgba(0,0,0,0.45);
  }
  .bubble::after {
    content: ""; position: absolute; top: -9px; left: 50%; margin-left: -8px;
    border-left: 8px solid transparent; border-right: 8px solid transparent;
    border-bottom: 9px solid #c89b3c;
  }
  .bubble b { color: #c85a08; }
  .home {
    display: inline-block;
    margin-top: 0.2rem;
    background: #ff7a1a; color: #2b1d10;
    font-family: Righteous, Georgia, serif;
    font-size: clamp(1rem, 2.4vh, 1.2rem);
    text-decoration: none;
    padding: 0.6rem 1.9rem;
    border-radius: 999px;
    border: 2px solid #8a3d05;
    box-shadow: 0 8px 0 #a94a06, 0 14px 26px rgba(0,0,0,0.45);
    transition: transform 120ms ease, box-shadow 120ms ease;
  }
  .home:hover, .home:focus-visible {
    transform: translateY(2px);
    box-shadow: 0 6px 0 #a94a06, 0 12px 22px rgba(0,0,0,0.45);
  }

  /* the case file stamp, bottom right */
  .stamp {
    position: absolute; right: 3vw; bottom: 4vh;
    font-family: "IBM Plex Mono", monospace;
    font-size: clamp(0.6rem, 1.4vh, 0.72rem);
    letter-spacing: 0.1em;
    color: #ff8a2a; opacity: 0.5;
    text-align: right; line-height: 1.5;
  }

  @media (prefers-reduced-motion: reduce) {
    .ceiling, .runner, .ticker__tape, .stray, .pip, .stage, .super {
      animation: none !important;
    }
  }
  @media (max-width: 560px), (max-height: 560px) {
    .stamp { display: none; }
  }
</style>
</head>
<body>
  <div class="hall" aria-hidden="true">
    <div class="ceiling"></div>
    <div class="super">404</div>
    <div class="branch">
      <svg viewBox="0 0 1000 300" preserveAspectRatio="xMidYMax slice">
        <path class="sacred" d="M0 210 H1000" />
        <path class="stray" d="M340 210 C520 210, 610 120, 1000 52" />
        <path class="stray" d="M340 210 C500 210, 570 268, 880 300" />
        <circle class="pip" cx="340" cy="210" r="7" />
      </svg>
    </div>
    <div class="ticker">
      <div class="ticker__tape">
        <span>${TICKER.repeat(4)}</span><span>${TICKER.repeat(4)}</span>
      </div>
    </div>
  </div>

  <main class="stage">
    ${mascot}
    <p class="bubble">You are on the <b>wrong branch</b>. Nothing on this timeline but dust. Come back to the bench before someone files a report.</p>
    <a class="home" id="home" href="/">Back to the bench</a>
  </main>

  <div class="stamp" aria-hidden="true">
    CASE FILE 404<br />STATUS: PRUNED<br />DISPOSITION: RETURN TO SEQUENCE
  </div>

<script>${homeScript}</script>
</body>
</html>
`;
}

// standalone preview: node scripts/build-404.mjs > 404.html
if (import.meta.url === `file://${process.argv[1]}`) {
  process.stdout.write(render({ pageUrl: process.env.VITE_PAGE_URL || '' }));
}
