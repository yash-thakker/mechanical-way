// End-to-end: play real runs against a live board and check what the player
// actually sees. Needs the board and the game already running —
//
//   npm run board          (terminal 1)
//   npm run dev:board      (terminal 2)
//   npm run test:board:e2e (terminal 3)
//
// Never pass --use-gl=swiftshader: it drops this scene to ~4fps and a run
// stretches past ten minutes (see CLAUDE.md > Testing).
import puppeteer from 'puppeteer-core';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// dev:board pins 5180 with --strictPort: a drifting port would silently
// serve a build with no VITE_LEADERBOARD_API, and every board assertion would
// fail for a reason that has nothing to do with the board.
const URL = process.env.MW_URL || 'http://localhost:5180/';
const BOARD = process.env.MW_BOARD || 'http://127.0.0.1:8787';
const SHOT = mkdtempSync(join(tmpdir(), 'mw-board-'));
const CHROME = process.env.MW_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

let pass = 0, fail = 0;
const check = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label} ${extra}`); }
};

// Chrome logs net::ERR_* for any fetch that fails — that is the browser, not
// the game. Everything else counts against us.
const isAppError = (m) => !/net::ERR_|Failed to load resource/.test(m);

// Same ids and rows serve.mjs seeds with, so running this against a board that
// is already seeded upserts those rows instead of stacking near-duplicate
// names. Kept here too so the suite still stands up its own rivals against a
// bare `wrangler dev`. Deliberately more than ten, so the top-ten cut, the
// scrolling list and the sticky "your row" all have something to act on.
const seeds = [
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
const { computeScore } = await import('../../src/score.js');
for (const [playerId, name, timeSec, mistakes] of seeds) {
  await fetch(`${BOARD}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, name, timeSec, mistakes, score: computeScore({ timeSec, mistakes }).score }),
  });
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--window-size=1440,900'], // real GPU: --use-gl=swiftshader drops this scene to 4fps
});

// Returns {errors, page}. `starve` keeps resetting the run clock so the finish
// time lands below the worker's floor — a forged-looking payload.
async function playRun(page, { name, inflateSec, starve }) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && isAppError(m.text())) errors.push(`console: ${m.text()}`); });

  await page.goto(URL, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate((cfg) => window.__mw.start(cfg), { name, dialStyle: 'cocktail' });
  if (inflateSec) {
    // a headless bot finishes faster than a human; back-date so the submission
    // clears the worker's floor
    await page.evaluate((s) => { window.__mw.state.startTime -= s * 1000; }, inflateSec);
  }

  const deadline = Date.now() + 420000; // 31 steps + wind/wake/flip cinematics
  while (Date.now() < deadline) {
    const done = await page.evaluate((reset) => {
      if (reset) window.__mw.state.startTime = performance.now();
      return !!document.querySelector('.mw-complete--visible');
    }, !!starve);
    if (done) break;
    await page.evaluate(() => { try { window.__mw.place(); } catch (e) { /* mid-cinematic */ } });
    await new Promise((r) => setTimeout(r, 700));
  }
  await new Promise((r) => setTimeout(r, 5000)); // submit + card build
  return errors;
}

const readComplete = (page) => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.mw-complete__boardRow')].map((r) => ({
    rank: r.querySelector('.mw-complete__boardRank')?.textContent,
    name: r.querySelector('.mw-complete__boardName')?.textContent,
    score: r.querySelector('.mw-complete__boardScore')?.textContent,
    me: r.classList.contains('mw-complete__boardRow--me'),
  }));
  return {
    complete: !!document.querySelector('.mw-complete--visible'),
    hasCard: !!document.querySelector('.mw-complete__cardImg:not([hidden])'),
    boardHidden: !!document.querySelector('.mw-complete__board--hidden'),
    rows,
    foot: document.querySelector('[data-el="completeBoardFoot"]')?.textContent || '',
    count: document.querySelector('[data-el="completeBoardCount"]')?.textContent || '',
    tabs: document.querySelectorAll('.mw-complete__boardTab').length,
    bubble: document.querySelector('.tessa-bubble')?.textContent || '',
    entryRank: window.__mw.state.lastEntry?.rank,
    entryScore: window.__mw.state.lastEntry?.score,
    time: document.querySelector('[data-el="completeTime"]')?.textContent,
  };
});

// Everything about the panel's geometry: what scrolls, what doesn't, and
// whether the player's own row is on screen while the list sits at the top.
const readBoardLayout = (page) => page.evaluate(() => {
  const list = document.querySelector('[data-el="completeBoardList"]');
  const me = document.querySelector('.mw-complete__boardRow--me');
  const panel = document.querySelector('[data-el="completeBoard"]');
  if (!list || !panel) return null;
  list.scrollTop = 0; // the list as the player first sees it
  const lr = list.getBoundingClientRect();
  const pr = panel.getBoundingClientRect();
  const head = document.querySelector('.mw-complete__boardHead').getBoundingClientRect();
  const foot = document.querySelector('[data-el="completeBoardFoot"]').getBoundingClientRect();
  const mr = me ? me.getBoundingClientRect() : null;
  return {
    scrolls: list.scrollHeight > list.clientHeight + 1,
    listOverflow: getComputedStyle(list).overflowY,
    mePosition: me ? getComputedStyle(me).position : null,
    // is the player's row inside the visible slice of the list, unscrolled?
    meVisible: !!mr && mr.bottom <= lr.bottom + 1 && mr.top >= lr.top - 1,
    // would it have been, without sticky? (its natural offset in the list)
    meNaturalBelow: !!me && me.offsetTop + me.offsetHeight > list.clientHeight + 1,
    headAbove: head.bottom <= lr.top + 1,
    footBelow: foot.top >= lr.bottom - 1,
    panelHeight: Math.round(pr.height),
  };
});

// ---------------------------------------------------------------------------
console.log('\n-- a run too fast to be real: refused, and nothing looks broken --');
{
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = await playRun(page, { name: 'Speedbot', starve: true });
  const s = await readComplete(page);
  const secs = (t) => { const [m, x] = String(t).split(':').map(Number); return m * 60 + x; };
  check('run completes', s.complete);
  check('finish time is under the floor', secs(s.time) < 95, s.time);
  check('score card still rendered', s.hasCard);
  check('board panel hidden when the submission is refused', s.boardHidden, JSON.stringify(s.rows));
  check('no rank stamped on the card', s.entryRank === undefined, String(s.entryRank));
  check('no app errors', errors.length === 0, errors.join(' | '));
  await page.screenshot({ path: `${SHOT}/shot-refused.png` });
  await page.close();
  await ctx.close();
}
// a fresh WebGL scene right on the heels of a torn-down one crashes the GPU process
await new Promise((r) => setTimeout(r, 3000));

// ---------------------------------------------------------------------------
// Runs A and B share a browser context, so they share the player id — which is
// exactly the case that used to stamp a rank the run had not earned.
const ctx = await browser.createBrowserContext();

console.log('\n-- run A: a good run lands on the board --');
let bestScore, bestRank;
{
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = await playRun(page, { name: 'Tessa', inflateSec: 60 });
  const s = await readComplete(page);
  bestScore = s.entryScore;
  bestRank = Number((s.foot.match(/#(\d+)/) || [])[1]);
  check('board panel visible', !s.boardHidden);
  check('rival rows rendered', s.rows.length >= 5, JSON.stringify(s.rows));
  check('exactly one row is mine', s.rows.filter((r) => r.me).length === 1, JSON.stringify(s.rows));
  check('my row carries my name', s.rows.find((r) => r.me)?.name === 'Tessa', JSON.stringify(s.rows.find((r) => r.me)));
  check('foot names it as the best', /Your best: #\d/.test(s.foot), s.foot);
  check('no tier tabs left on the panel', s.tabs === 0, String(s.tabs));
  check('head counts the field', /watchmaker/i.test(s.count), s.count);
  check('rank stamped on the entry', typeof s.entryRank === 'number', String(s.entryRank));
  check('Tessa read the rank aloud', /bench/i.test(s.bubble), s.bubble);
  check('no app errors', errors.length === 0, errors.join(' | '));
  console.log('   rows:', JSON.stringify(s.rows));
  console.log('   foot:', s.foot, '| tessa:', s.bubble.slice(0, 90));
  await page.screenshot({ path: `${SHOT}/shot-board.png` });
  await page.close();
}

console.log('\n-- run B: a WORSE run must not inherit the best run\'s rank --');
{
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = await playRun(page, { name: 'Tessa', inflateSec: 1500 });
  const s = await readComplete(page);
  check('this run scored worse than the best', s.entryScore < bestScore, `${s.entryScore} vs ${bestScore}`);
  check('the board still shows the better score', s.rows.find((r) => r.me)?.score === bestScore.toLocaleString('en-US'), JSON.stringify(s.rows.find((r) => r.me)));
  check('card rank describes THIS run, not the standing best', s.entryRank > 1, String(s.entryRank));
  check('foot still reports the standing best', Number((s.foot.match(/#(\d+)/) || [])[1]) === bestRank, `${s.foot} vs run A #${bestRank}`);
  check('this run ranks strictly behind that best', s.entryRank > bestRank, `${s.entryRank} vs ${bestRank}`);
  check('Tessa says the best still stands', /best still stands/i.test(s.bubble), s.bubble);
  const stamp = await page.evaluate(() => ({ rank: window.__mw.state.lastEntry?.rank, total: window.__mw.state.lastEntry?.rankTotal }));
  check('card denominator is never smaller than the rank', stamp.total >= stamp.rank, JSON.stringify(stamp));
  check('no app errors', errors.length === 0, errors.join(' | '));
  console.log('   runRank:', s.entryRank, '| foot:', s.foot, '| tessa:', s.bubble.slice(0, 110));
  await page.screenshot({ path: `${SHOT}/shot-worse-run.png` });

  console.log('\n-- the panel holds still; only the rows move --');
  const L = await readBoardLayout(page);
  check('the row list is the scroll container', L && L.listOverflow === 'auto', JSON.stringify(L));
  check('with a full board it actually scrolls', L && L.scrolls, JSON.stringify(L));
  check('the head sits above the scroll area', L && L.headAbove, JSON.stringify(L));
  check('the foot sits below it', L && L.footBelow, JSON.stringify(L));
  check('my row is sticky', L && L.mePosition === 'sticky', JSON.stringify(L));
  check('my row is on screen unscrolled', L && L.meVisible, JSON.stringify(L));
  check('and it had to be pinned to manage that', L && L.meNaturalBelow, JSON.stringify(L));
  console.log('   layout:', JSON.stringify(L));
  await page.screenshot({ path: `${SHOT}/shot-sticky.png` });

  // the panel must not grow with the board: scroll to the bottom, re-measure
  const grew = await page.evaluate(() => {
    const list = document.querySelector('[data-el="completeBoardList"]');
    const panel = document.querySelector('[data-el="completeBoard"]');
    const before = panel.getBoundingClientRect().height;
    list.scrollTop = list.scrollHeight;
    return panel.getBoundingClientRect().height - before;
  });
  check('the panel does not resize as you scroll', Math.abs(grew) < 1, String(grew));
  await page.screenshot({ path: `${SHOT}/shot-scrolled.png` });
  await page.close();
}
await ctx.close();
await new Promise((r) => setTimeout(r, 3000));

// ---------------------------------------------------------------------------
console.log('\n-- the board is unreachable --');
{
  const c = await browser.createBrowserContext();
  const page = await c.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await page.setRequestInterception(true);
  page.on('request', (r) => (r.url().includes('8787') ? r.abort() : r.continue()));
  const errors = await playRun(page, { name: 'Offline', inflateSec: 60 });
  const s = await readComplete(page);
  check('run still completes with the board dead', s.complete);
  check('card still rendered', s.hasCard);
  check('board panel stays out of the way', s.boardHidden);
  check('no app errors', errors.length === 0, errors.join(' | '));
  await page.close();
  await c.close();
}

await browser.close();
console.log(`\nscreenshots: ${SHOT}`);
console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
