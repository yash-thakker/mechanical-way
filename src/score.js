// Scoring and the shareable score card. Nothing is stored or transmitted —
// players keep their score by sharing the card.

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

export function makeShareText(entry) {
  return (
    `I hand-assembled a mechanical watch in The Mechanical Way.\n` +
    `${entry.name} · ${entry.score.toLocaleString()} pts (${entry.difficulty}) · ` +
    `${fmtTime(entry.timeSec)} · ${entry.mistakes} slip${entry.mistakes === 1 ? '' : 's'}\n` +
    `Every wheel, jewel and spring placed by hand. Can you beat my time?\n` +
    PAGE_URL
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
  ctx.fillText(entry.score.toLocaleString(), 64, FLOOR_Y - 66);
  ctx.font = '700 26px "IBM Plex Mono", monospace';
  ctx.fillText('POINTS · THE MECHANICAL WAY', 70, FLOOR_Y - 26);
  // small dept. line up on the wall
  ctx.font = '500 20px "IBM Plex Mono", monospace';
  ctx.fillStyle = 'rgba(110, 35, 24, 0.75)';
  ctx.fillText('HOROLOGY DEPT. · CERTIFICATE OF ASSEMBLY', 64, TICKER_Y + TICKER_H + 46);

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

  // --- Tessa, standing in the hallway ---------------------------------------
  try {
    const img = await svgToImage(mascotSvgMarkup);
    ctx.drawImage(img, W - 330, 268, 300, 300);
  } catch { /* card still works without her */ }

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

function downloadBlob(blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'mechanical-way-score.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Share to a chosen target. The score card PNG is the pitch, so every path
// leads with it: 'x'/'whatsapp' put the card on the clipboard (or download it
// when the clipboard is blocked) and THEN open the prefilled compose page —
// those intents can't carry an image themselves, but a paste can. 'copy' puts
// the card on the clipboard, 'download' saves it, and 'native' opens the
// system share sheet with the picture where the browser supports it.
export async function share(entry, mascotSvgMarkup, platform = 'copy') {
  const text = makeShareText(entry);
  let blob = null;
  try {
    blob = await makeShareCard(entry, mascotSvgMarkup);
  } catch { /* text fallbacks below */ }

  if (platform === 'x' || platform === 'whatsapp') {
    let copied = false;
    if (blob && typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        copied = true;
      } catch { /* clipboard image write blocked */ }
    }
    if (!copied && blob) downloadBlob(blob);
    const url = platform === 'x'
      ? `https://x.com/intent/post?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
    if (copied) return 'Card copied · Paste it into your post';
    return blob ? 'Card downloaded · Attach it to your post' : 'Opening...';
  }

  if (platform === 'native' && blob && navigator.canShare) {
    const file = new File([blob], 'mechanical-way-score.png', { type: 'image/png' });
    if (navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'The Mechanical Way' });
        return 'Shared!';
      } catch (e) {
        if (e && e.name === 'AbortError') return '';
        // otherwise fall through to the download path
      }
    }
  }

  if ((platform === 'download' || platform === 'native') && blob) {
    downloadBlob(blob);
    return 'Card saved';
  }

  // copy: the card as a single clipboard image, text if the image is blocked
  if (blob && typeof ClipboardItem !== 'undefined' && navigator.clipboard && navigator.clipboard.write) {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      return 'Card copied · Paste anywhere';
    } catch { /* clipboard image write blocked — fall through */ }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'Copied to clipboard';
  } catch { /* clipboard may be blocked */ }
  if (blob) {
    downloadBlob(blob);
    return 'Card saved';
  }
  return 'Sharing unavailable';
}
