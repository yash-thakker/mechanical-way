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
// bare `wrangler dev`.
const seeds = [
  ['seed-marguerite', 'Marguerite', 120, 0, 5760],
  ['seed-hferrand', 'H. Ferrand', 95, 1, 5690],
  ['seed-okonkwo', 'Okonkwo', 150, 0, 5700],
  ['seed-vasquez', 'Vasquez', 210, 3, 5220],
];
for (const [playerId, name, timeSec, mistakes, score] of seeds) {
  await fetch(`${BOARD}/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerId, name, difficulty: 'easy', timeSec, mistakes, score }),
  });
}

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ['--window-size=1440,900'], // real GPU: --use-gl=swiftshader drops this scene to 4fps
});

// Returns {errors, page}. `starve` keeps resetting the run clock so the finish
// time lands below the worker's floor — a forged-looking payload.
async function playRun(page, { name, difficulty, inflateSec, starve }) {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && isAppError(m.text())) errors.push(`console: ${m.text()}`); });

  await page.goto(URL, { waitUntil: 'networkidle2' });
  await new Promise((r) => setTimeout(r, 1500));
  await page.evaluate((cfg) => window.__mw.start(cfg), { name, difficulty, dialStyle: 'cocktail' });
  if (inflateSec) {
    // a headless bot finishes faster than a human; back-date so the submission
    // clears the worker's per-tier floor
    await page.evaluate((s) => { window.__mw.state.startTime -= s * 1000; }, inflateSec);
  }

  const deadline = Date.now() + 240000;
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
    activeTab: document.querySelector('.mw-complete__boardTab--active')?.dataset.tier,
    bubble: document.querySelector('.tessa-bubble')?.textContent || '',
    entryRank: window.__mw.state.lastEntry?.rank,
    entryScore: window.__mw.state.lastEntry?.score,
    time: document.querySelector('[data-el="completeTime"]')?.textContent,
  };
});

// ---------------------------------------------------------------------------
console.log('\n-- a run too fast to be real: refused, and nothing looks broken --');
{
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  const errors = await playRun(page, { name: 'Speedbot', difficulty: 'easy', starve: true });
  const s = await readComplete(page);
  check('run completes', s.complete);
  check('finish time is under the floor', s.time < '00:40', s.time);
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
  const errors = await playRun(page, { name: 'Tessa', difficulty: 'easy', inflateSec: 60 });
  const s = await readComplete(page);
  bestScore = s.entryScore;
  bestRank = Number((s.foot.match(/#(\d+)/) || [])[1]);
  check('board panel visible', !s.boardHidden);
  check('rival rows rendered', s.rows.length >= 5, JSON.stringify(s.rows));
  check('exactly one row is mine', s.rows.filter((r) => r.me).length === 1, JSON.stringify(s.rows));
  check('my row carries my name', s.rows.find((r) => r.me)?.name === 'Tessa', JSON.stringify(s.rows.find((r) => r.me)));
  check('foot names it as the best', /Your best: #\d/.test(s.foot), s.foot);
  check('active tab matches the tier played', s.activeTab === 'easy', s.activeTab);
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
  const errors = await playRun(page, { name: 'Tessa', difficulty: 'easy', inflateSec: 900 });
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

  console.log('\n-- switching tiers --');
  await page.evaluate(() => document.querySelector('.mw-complete__boardTab[data-tier="hard"]').scrollIntoView({ block: 'center' }));
  await page.click('.mw-complete__boardTab[data-tier="hard"]'); // real hit-tested click, not el.click()
  await new Promise((r) => setTimeout(r, 1500));
  const t = await page.evaluate(() => ({
    active: document.querySelector('.mw-complete__boardTab--active')?.dataset.tier,
    text: document.querySelector('[data-el="completeBoardList"]')?.textContent.trim(),
    mine: document.querySelectorAll('.mw-complete__boardRow--me').length,
  }));
  check('tab switches', t.active === 'hard', JSON.stringify(t));
  // The board is seeded on every tier, so what matters is that the switch
  // actually fetched THAT tier rather than re-rendering the one just played.
  check('the hard board replaced the easy one', /Brandt/.test(t.text) && !/Marguerite/.test(t.text), t.text.replace(/\s+/g, ' ').slice(0, 90));
  check('no phantom "me" row on a tier I never played', t.mine === 0);
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
  const errors = await playRun(page, { name: 'Offline', difficulty: 'easy', inflateSec: 60 });
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
