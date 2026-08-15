// Scoring and the shareable score card.
//
// computeScore is the single source of truth for what a run is worth: the
// leaderboard worker imports THIS function to recompute every submission, so
// keep it free of anything browser-only (the card builders below are not — they
// are simply never called there).

const BASE = { easy: 6000, medium: 9000, hard: 13000 };
const MISTAKE_PENALTY = 120;
const TIME_PENALTY_PER_SEC = 2;

export function computeScore({ difficulty, timeSec, mistakes }) {
  const base = BASE[difficulty] ?? BASE.medium;
  const score = Math.max(500, Math.round(base - mistakes * MISTAKE_PENALTY - timeSec * TIME_PENALTY_PER_SEC));
  let grade;
  const ratio = score / base;
  if (mistakes === 0 && ratio > 0.8) grade = 'Certified chronometer.';
  else if (ratio > 0.75) grade = 'A steady hand.';
  else if (ratio > 0.55) grade = 'Bench-worthy.';
  else if (ratio > 0.35) grade = 'The watch forgives.';
  else grade = 'It ticks. Eventually.';
  return { score, grade };
}

export function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

const PAGE_URL = 'https://yash-thakker.github.io/mechanical-way/';

// The shared link recreates the exact challenge: same level, the sender's
// score as the goal, the sender's name in Tessa's greeting.
export function buildChallengeUrl(entry) {
  return `${PAGE_URL}?level=${encodeURIComponent(entry.difficulty)}` +
    `&goal=${entry.score}&from=${encodeURIComponent(entry.name)}`;
}

export function makeShareText(entry) {
  const rank = entry.rank
    ? `Rank #${entry.rank.toLocaleString()}${entry.rankTotal ? ` of ${entry.rankTotal.toLocaleString()}` : ''} on the ${entry.difficulty} bench.\n`
    : '';
  return (
    `I hand-assembled a mechanical watch in The Mechanical Way.\n` +
    `${entry.name} · ${entry.score.toLocaleString()} pts (${entry.difficulty}) · ` +
    `${fmtTime(entry.timeSec)} · ${entry.mistakes} slip${entry.mistakes === 1 ? '' : 's'}\n` +
    rank +
    `Every wheel, jewel and spring placed by hand. Beat my score:\n` +
    buildChallengeUrl(entry)
  );
}

// ---------------------------------------------------------------------------
// Share card: a 1200x630 retro certificate PNG with the mascot on it.
// ---------------------------------------------------------------------------

function svgToImage(svgMarkup) {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
    img.src = url;
  });
}

function dataUrlToImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// The board rank, as a rubber stamp on the hallway wall. Drawn before the
// weathering pass so it ages with the rest of the supergraphic — and only when
// the board actually answered, since a missing rank must leave no gap.
function drawRankStamp(ctx, entry, { x, y, w, h, rot = -0.13 }) {
  if (!entry.rank) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.strokeStyle = '#6e2318';
  ctx.fillStyle = '#6e2318';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  ctx.lineWidth = Math.max(3, h * 0.055);
  roundRectPath(ctx, -w / 2, -h / 2, w, h, h * 0.18);
  ctx.stroke();
  ctx.lineWidth = Math.max(1.5, h * 0.022);
  const i = h * 0.1;
  roundRectPath(ctx, -w / 2 + i, -h / 2 + i, w - i * 2, h - i * 2, h * 0.12);
  ctx.stroke();

  ctx.font = `400 ${Math.round(h * 0.42)}px Righteous, Georgia, serif`;
  ctx.fillText(`RANK #${entry.rank.toLocaleString()}`, 0, -h * 0.1);
  ctx.font = `700 ${Math.round(h * 0.155)}px "IBM Plex Mono", monospace`;
  const of = entry.rankTotal ? ` OF ${entry.rankTotal.toLocaleString()}` : '';
  ctx.fillText(`${String(entry.difficulty || '').toUpperCase()} BENCH${of}`, 0, h * 0.27);
  ctx.restore();
}

// The card is a flat homage to the TVA hallway: disc ceiling, dot-matrix
// ticker, giant weathered supergraphic score, diagonal stripes, striped
// runner — and Tessa standing in the hall.
export async function makeShareCard(entry, mascotSvgMarkup) {
  const W = 1200, H = 630;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');

  const CEIL_H = 150, TICKER_Y = 150, TICKER_H = 66, FLOOR_Y = 512;

  // --- ceiling: chocolate with recessed cream light discs ------------------
  ctx.fillStyle = '#26150c';
  ctx.fillRect(0, 0, W, CEIL_H);
  for (let row = 0; row < 2; row++) {
    const y = 34 + row * 76, r = 33;
    for (let x = 46 + (row % 2) * 48; x < W + r; x += 96) {
      const disc = ctx.createRadialGradient(x - 8, y - 8, 4, x, y, r);
      disc.addColorStop(0, '#f4ead8');
      disc.addColorStop(0.8, '#ece0cb');
      disc.addColorStop(1, '#c2b18f');
      ctx.fillStyle = disc;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(20, 10, 5, 0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();
      const glow = ctx.createRadialGradient(x, y, 1, x, y, 13);
      glow.addColorStop(0, '#fffaf0');
      glow.addColorStop(1, 'rgba(255, 236, 200, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
    }
  }

  // --- amber dot-matrix ticker ---------------------------------------------
  ctx.fillStyle = '#0f0b08';
  ctx.fillRect(0, TICKER_Y, W, TICKER_H);
  ctx.fillStyle = '#ffb734';
  ctx.font = '700 30px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const tickerLine = `VARIANT: ${entry.name.toUpperCase()}   ·   ${entry.difficulty.toUpperCase()}   ·   TIME ${fmtTime(entry.timeSec)}   ·   SLIPS ${entry.mistakes}`;
  ctx.fillText(tickerLine, W / 2, TICKER_Y + TICKER_H / 2 + 2);
  // punch the LED grid through the glyphs
  ctx.globalCompositeOperation = 'destination-out';
  for (let x = 0; x < W; x += 5) ctx.fillRect(x, TICKER_Y, 1.6, TICKER_H);
  for (let y = TICKER_Y; y < TICKER_Y + TICKER_H; y += 5) ctx.fillRect(0, y, W, 1.6);
  ctx.globalCompositeOperation = 'source-over';
  // re-lay the panel behind the punched holes
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#0f0b08';
  ctx.fillRect(0, TICKER_Y, W, TICKER_H);
  ctx.globalCompositeOperation = 'source-over';

  // --- travertine wall -------------------------------------------------------
  const wall = ctx.createLinearGradient(0, TICKER_Y + TICKER_H, 0, FLOOR_Y);
  wall.addColorStop(0, '#cfc0a4');
  wall.addColorStop(1, '#a6957a');
  ctx.fillStyle = wall;
  ctx.fillRect(0, TICKER_Y + TICKER_H, W, FLOOR_Y - TICKER_Y - TICKER_H);

  // diagonal stripes: one graphic with the floor runner — they bend up the
  // wall exactly where the runner meets it (see the runner block below)
  const RUN_X = W * 0.6, RUN_HALF = 55;
  const lean = 0.62, sw = RUN_HALF * Math.cos(lean);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, TICKER_Y + TICKER_H, W, FLOOR_Y - TICKER_Y - TICKER_H);
  ctx.clip();
  ctx.translate(RUN_X - RUN_HALF, FLOOR_Y);
  ctx.rotate(lean);
  ctx.fillStyle = '#d96a1e';
  ctx.fillRect(0, 60, sw, -1400);
  ctx.fillStyle = '#d9a624';
  ctx.fillRect(sw, 60, sw, -1400);
  ctx.restore();

  // giant weathered burgundy score — the supergraphic
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#6e2318';
  ctx.font = '400 190px Righteous, Georgia, serif';
  ctx.fillText(entry.score.toLocaleString(), 64, FLOOR_Y - 82); // comma descender clears the points line
  ctx.font = '700 26px "IBM Plex Mono", monospace';
  const gradeLine = entry.grade
    ? `POINTS · ${String(entry.grade).replace(/\.$/, '').toUpperCase()}`
    : 'POINTS · THE MECHANICAL WAY';
  ctx.fillText(gradeLine, 70, FLOOR_Y - 24);
  // small dept. line up on the wall
  ctx.font = '500 20px "IBM Plex Mono", monospace';
  ctx.fillStyle = 'rgba(110, 35, 24, 0.75)';
  ctx.fillText('HOROLOGY DEPT. · CERTIFICATE OF ASSEMBLY', 64, TICKER_Y + TICKER_H + 46);
  // top-right wall, above where Tessa stands and clear of the watch mount
  drawRankStamp(ctx, entry, { x: 1044, y: 274, w: 252, h: 88 });

  // weathering: peel the paint back to plaster
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, TICKER_Y + TICKER_H, W, FLOOR_Y - TICKER_Y - TICKER_H);
  ctx.clip();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 260; i++) {
    ctx.globalAlpha = Math.random() * 0.4;
    ctx.beginPath();
    ctx.arc(Math.random() * W, TICKER_Y + TICKER_H + Math.random() * (FLOOR_Y - TICKER_Y - TICKER_H), Math.random() * 5, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#b3a385';
  ctx.fillRect(0, TICKER_Y + TICKER_H, W, FLOOR_Y - TICKER_Y - TICKER_H);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';

  // --- floor: concrete, terracotta sides, striped runner --------------------
  ctx.fillStyle = '#8d8272';
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  ctx.fillStyle = '#7d3f24';
  ctx.fillRect(0, FLOOR_Y, 250, H - FLOOR_Y);
  ctx.fillRect(W - 250, FLOOR_Y, 250, H - FLOOR_Y);
  // runner in fake perspective: meets the wall exactly where the stripes bend
  const cxr = RUN_X;
  ctx.fillStyle = '#d96a1e';
  ctx.beginPath();
  ctx.moveTo(cxr - RUN_HALF, FLOOR_Y); ctx.lineTo(cxr, FLOOR_Y);
  ctx.lineTo(cxr - 40, H); ctx.lineTo(cxr - 235, H);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d9a624';
  ctx.beginPath();
  ctx.moveTo(cxr, FLOOR_Y); ctx.lineTo(cxr + RUN_HALF, FLOOR_Y);
  ctx.lineTo(cxr + 155, H); ctx.lineTo(cxr - 40, H);
  ctx.closePath(); ctx.fill();

  // --- the watch the player built, mounted like a specimen photo ------------
  if (entry.watchImage) {
    try {
      const wimg = await dataUrlToImage(entry.watchImage);
      // sits below the ticker band so no stat gets covered
      const wx = 800, wy = 372, wr = 146;
      ctx.save();
      ctx.shadowColor = 'rgba(20, 10, 4, 0.45)';
      ctx.shadowBlur = 34;
      ctx.shadowOffsetY = 14;
      ctx.fillStyle = '#c9b998';
      ctx.beginPath();
      ctx.arc(wx, wy, wr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.arc(wx, wy, wr, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(wimg, wx - wr, wy - wr, wr * 2, wr * 2);
      ctx.restore();
      // burgundy bezel ring around the mount
      ctx.strokeStyle = '#6e2318';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(wx, wy, wr + 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(242, 227, 190, 0.6)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(wx, wy, wr - 4, 0, Math.PI * 2);
      ctx.stroke();
    } catch { /* card still works without the watch */ }
  }

  // --- Tessa, standing in the hallway ---------------------------------------
  try {
    const img = await svgToImage(mascotSvgMarkup);
    ctx.drawImage(img, W - 240, 330, 230, 230);
  } catch { /* card still works without her */ }

  // where to come beat it — the card carries its own way home
  ctx.font = '500 21px "IBM Plex Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(242, 227, 190, 0.85)';
  ctx.fillText(PAGE_URL.replace('https://', ''), 64, H - 26);

  // grain + vignette grade
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '20,12,6' : '240,228,205'}, ${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, W * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(24, 12, 4, 0.42)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  return new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
}

// Story-format card (1080x1920) for Instagram: same hallway, stacked tall —
// ceiling, ticker, supergraphic score, the watch as the centerpiece, Tessa
// on the runner, URL on the floor.
export async function makeStoryCard(entry, mascotSvgMarkup) {
  const W = 1080, H = 1920;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const CEIL_H = 270, TICKER_Y = 270, TICKER_H = 92, FLOOR_Y = 1620;

  // ceiling discs
  ctx.fillStyle = '#26150c';
  ctx.fillRect(0, 0, W, CEIL_H);
  for (let row = 0; row < 3; row++) {
    const y = 46 + row * 90, r = 36;
    for (let x = 50 + (row % 2) * 52, i = 0; x < W + r; x += 104, i++) {
      const disc = ctx.createRadialGradient(x - 9, y - 9, 4, x, y, r);
      disc.addColorStop(0, '#f4ead8');
      disc.addColorStop(0.8, '#ece0cb');
      disc.addColorStop(1, '#c2b18f');
      ctx.fillStyle = disc;
      ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.72, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(20, 10, 5, 0.5)';
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  // ticker
  ctx.fillStyle = '#0f0b08';
  ctx.fillRect(0, TICKER_Y, W, TICKER_H);
  ctx.fillStyle = '#ffb734';
  ctx.font = '700 38px "IBM Plex Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(
    `VARIANT: ${entry.name.toUpperCase()} · ${entry.difficulty.toUpperCase()} · ${fmtTime(entry.timeSec)} · SLIPS ${entry.mistakes}`,
    W / 2, TICKER_Y + TICKER_H / 2 + 2
  );
  ctx.globalCompositeOperation = 'destination-out';
  for (let x = 0; x < W; x += 6) ctx.fillRect(x, TICKER_Y, 2, TICKER_H);
  for (let y = TICKER_Y; y < TICKER_Y + TICKER_H; y += 6) ctx.fillRect(0, y, W, 2);
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#0f0b08';
  ctx.fillRect(0, TICKER_Y, W, TICKER_H);
  ctx.globalCompositeOperation = 'source-over';

  // travertine wall + the runner stripes bending up it
  const wallTop = TICKER_Y + TICKER_H;
  const wall = ctx.createLinearGradient(0, wallTop, 0, FLOOR_Y);
  wall.addColorStop(0, '#cfc0a4');
  wall.addColorStop(1, '#a6957a');
  ctx.fillStyle = wall;
  ctx.fillRect(0, wallTop, W, FLOOR_Y - wallTop);
  const RUN_X = W * 0.62, RUN_HALF = 72;
  const lean = 0.62, sw = RUN_HALF * Math.cos(lean);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, wallTop, W, FLOOR_Y - wallTop);
  ctx.clip();
  ctx.translate(RUN_X - RUN_HALF, FLOOR_Y);
  ctx.rotate(lean);
  ctx.fillStyle = '#d96a1e';
  ctx.fillRect(0, 80, sw, -2600);
  ctx.fillStyle = '#d9a624';
  ctx.fillRect(sw, 80, sw, -2600);
  ctx.restore();

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '500 26px "IBM Plex Mono", monospace';
  ctx.fillStyle = 'rgba(110, 35, 24, 0.8)';
  ctx.fillText('HOROLOGY DEPT. · CERTIFICATE OF ASSEMBLY', 70, wallTop + 66);

  // supergraphic score + grade
  ctx.fillStyle = '#6e2318';
  ctx.font = '400 230px Righteous, Georgia, serif';
  ctx.fillText(entry.score.toLocaleString(), 64, 700);
  ctx.font = '700 32px "IBM Plex Mono", monospace';
  const gradeLine = entry.grade
    ? `POINTS · ${String(entry.grade).replace(/\.$/, '').toUpperCase()}`
    : 'POINTS · THE MECHANICAL WAY';
  ctx.fillText(gradeLine, 72, 768);
  // low on the wall: under the watch mount, left of Tessa on the runner
  drawRankStamp(ctx, entry, { x: 300, y: 1545, w: 430, h: 112 });

  // weathering
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, wallTop, W, FLOOR_Y - wallTop);
  ctx.clip();
  ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 420; i++) {
    ctx.globalAlpha = Math.random() * 0.4;
    ctx.beginPath();
    ctx.arc(Math.random() * W, wallTop + Math.random() * (FLOOR_Y - wallTop), Math.random() * 6, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#b3a385';
  ctx.fillRect(0, wallTop, W, FLOOR_Y - wallTop);
  ctx.restore();
  ctx.globalCompositeOperation = 'source-over';

  // the watch — the centerpiece of the story
  if (entry.watchImage) {
    try {
      const wimg = await dataUrlToImage(entry.watchImage);
      const wx = W / 2, wy = 1150, wr = 315;
      ctx.save();
      ctx.shadowColor = 'rgba(20, 10, 4, 0.5)';
      ctx.shadowBlur = 50;
      ctx.shadowOffsetY = 22;
      ctx.fillStyle = '#c9b998';
      ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.beginPath(); ctx.arc(wx, wy, wr, 0, Math.PI * 2); ctx.clip();
      ctx.drawImage(wimg, wx - wr, wy - wr, wr * 2, wr * 2);
      ctx.restore();
      ctx.strokeStyle = '#6e2318';
      ctx.lineWidth = 10;
      ctx.beginPath(); ctx.arc(wx, wy, wr + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = 'rgba(242, 227, 190, 0.6)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(wx, wy, wr - 6, 0, Math.PI * 2); ctx.stroke();
    } catch { /* story still works without the watch */ }
  }

  // floor: concrete + terracotta + the runner, Tessa standing on it
  ctx.fillStyle = '#8d8272';
  ctx.fillRect(0, FLOOR_Y, W, H - FLOOR_Y);
  ctx.fillStyle = '#7d3f24';
  ctx.fillRect(0, FLOOR_Y, 200, H - FLOOR_Y);
  ctx.fillRect(W - 200, FLOOR_Y, 200, H - FLOOR_Y);
  ctx.fillStyle = '#d96a1e';
  ctx.beginPath();
  ctx.moveTo(RUN_X - RUN_HALF, FLOOR_Y); ctx.lineTo(RUN_X, FLOOR_Y);
  ctx.lineTo(RUN_X - 60, H); ctx.lineTo(RUN_X - 300, H);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#d9a624';
  ctx.beginPath();
  ctx.moveTo(RUN_X, FLOOR_Y); ctx.lineTo(RUN_X + RUN_HALF, FLOOR_Y);
  ctx.lineTo(RUN_X + 190, H); ctx.lineTo(RUN_X - 60, H);
  ctx.closePath(); ctx.fill();
  try {
    const img = await svgToImage(mascotSvgMarkup);
    ctx.drawImage(img, W - 400, 1520, 330, 330);
  } catch { /* fine */ }
  ctx.font = '500 30px "IBM Plex Mono", monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(242, 227, 190, 0.9)';
  ctx.fillText(PAGE_URL.replace('https://', ''), 64, H - 44);

  // grain + vignette
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '20,12,6' : '240,228,205'}, ${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  }
  const vig = ctx.createRadialGradient(W / 2, H / 2, H * 0.38, W / 2, H / 2, H * 0.72);
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(24, 12, 4, 0.42)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, W, H);

  return new Promise((resolve) => cv.toBlob(resolve, 'image/png'));
}

function downloadBlob(blob, name = 'mechanical-way-score.png') {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// A phone's share sheet is the ONLY way into the Instagram or WhatsApp app —
// neither has a web intent that can carry a picture. The same call on a desktop
// opens the macOS share sheet, which is not what anyone means by "share to
// Instagram", so it is never opened there.
const IS_TOUCH = typeof matchMedia !== 'undefined'
  && matchMedia('(pointer: coarse)').matches;

// A ClipboardItem may hold a PROMISE for its blob, and that matters here: the
// card takes a beat to draw, and awaiting it first spends the click's transient
// activation, after which the browser refuses the write and the image silently
// becomes a download instead. Handing the promise over keeps the write inside
// the gesture.
async function copyCard(cardPromise) {
  if (typeof ClipboardItem === 'undefined' || !navigator.clipboard || !navigator.clipboard.write) {
    return false;
  }
  try {
    const png = cardPromise.then((blob) => {
      if (!blob) throw new Error('no card');
      return blob;
    });
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
    return true;
  } catch {
    return false; // blocked, unfocused, or the card failed to draw
  }
}

// Share to a chosen target. The card PNG is the pitch, so every path leads with
// it. No web intent on any platform can attach media to a compose box, so the
// card goes to the clipboard and one paste puts it in the post; a download is
// the fallback when the clipboard is refused.
export async function share(entry, mascotSvgMarkup, platform = 'copy') {
  const text = makeShareText(entry);
  // Instagram is a Story: it only ever wants the tall frame. Everything else
  // takes the 1200x630 card, which reads fine in a chat or a post.
  const wantsStory = platform === 'instagram';
  const filename = wantsStory ? 'mechanical-way-story.png' : 'mechanical-way-score.png';
  const cardPromise = (wantsStory
    ? makeStoryCard(entry, mascotSvgMarkup)
    : makeShareCard(entry, mascotSvgMarkup)).catch(() => null);

  // phone only: hand the app the picture directly. WhatsApp gets the text too,
  // so the sheet can land in a chat OR on Status; Instagram takes the frame
  // alone, since Stories drop any caption that comes with it.
  if ((platform === 'whatsapp' || platform === 'instagram') && IS_TOUCH && navigator.canShare) {
    const blob = await cardPromise;
    if (blob) {
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share(wantsStory
            ? { files: [file], title: 'The Mechanical Way' }
            : { files: [file], text, title: 'The Mechanical Way' });
          return wantsStory ? 'Shared · Post it to your Story' : 'Shared!';
        } catch (e) {
          if (e && e.name === 'AbortError') return '';
          // anything else: fall through to the desktop path below
        }
      }
    }
  }

  // Instagram has no web intent at all — you cannot post to it from a browser.
  // Saving the story frame with a pointer to the app is the whole of what the
  // web can do here.
  if (platform === 'instagram') {
    const blob = await cardPromise;
    if (!blob) return 'Sharing unavailable';
    downloadBlob(blob, filename);
    return 'Story card saved · Add it in the Instagram app';
  }

  if (platform === 'x' || platform === 'whatsapp') {
    const copied = await copyCard(cardPromise);
    if (!copied) {
      const blob = await cardPromise;
      if (blob) downloadBlob(blob, filename);
    }
    window.open(platform === 'whatsapp'
      ? `https://wa.me/?text=${encodeURIComponent(text)}`
      : `https://x.com/intent/post?text=${encodeURIComponent(text)}`,
    '_blank', 'noopener');
    const where = platform === 'whatsapp' ? 'your chat or Status' : 'your post';
    return copied ? `Card copied · Paste it into ${where}` : `Card saved · Attach it to ${where}`;
  }

  if (platform === 'native' && IS_TOUCH && navigator.canShare) {
    const blob = await cardPromise;
    if (blob) {
      const file = new File([blob], filename, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'The Mechanical Way' });
          return 'Shared!';
        } catch (e) {
          if (e && e.name === 'AbortError') return '';
        }
      }
    }
  }

  if (platform === 'download' || platform === 'native') {
    const blob = await cardPromise;
    if (blob) {
      downloadBlob(blob, filename);
      return 'Card saved';
    }
    return 'Sharing unavailable';
  }

  // copy: the card as a single clipboard image, text if the image is blocked
  if (await copyCard(cardPromise)) return 'Card copied · Paste anywhere';
  try {
    await navigator.clipboard.writeText(text);
    return 'Copied to clipboard';
  } catch { /* clipboard may be blocked entirely */ }
  const blob = await cardPromise;
  if (blob) {
    downloadBlob(blob, filename);
    return 'Card saved';
  }
  return 'Sharing unavailable';
}
