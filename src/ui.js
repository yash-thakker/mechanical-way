// src/ui.js — owns #ui-root DOM + src/styles.css (see docs/DESIGN.md)
//
// Retro time-bureau paperwork meets watchmaker's bench.
// Exports: initUI, showTitle, hideTitle, setStep, setProgress,
//          showLegend, updateLegend, toast, showComplete, flashHint,
//          setTool, showNotes, hideNotes, setShareStatus

import * as audio from './audio.js';

let handlers = {};
let built = false;

// cached element refs (populated in build())
let els = {};

// local UI state
let soundOn = true;
let legendCollapsed = true;
// notes start folded on phones — the expanded card covers the play view there
let notesMin = typeof window !== 'undefined' && window.matchMedia
  ? window.matchMedia('(max-width: 700px)').matches
  : false;
let legendEverShown = false;
let stepPulseTimer = null;
let hintTimer = null;
let toolPulseTimer = null;
let toolShakeTimer = null;
let notesSlideTimer = null;
let shareStatusTimer = null;
const toastQueue = [];
const TOAST_MAX = 2;

const NAME_STORAGE_KEY = 'mw-name';

// ---------------------------------------------------------------------
// small helpers
// ---------------------------------------------------------------------

function pad2(n) {
  return String(Math.max(0, Math.floor(n))).padStart(2, '0');
}

function formatMMSS(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds || 0));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${pad2(mm)}:${pad2(ss)}`;
}

function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function formatScore(n) {
  const v = Math.max(0, Math.round(Number(n) || 0));
  try {
    return v.toLocaleString('en-US');
  } catch (e) {
    return String(v);
  }
}

function readSavedName() {
  try {
    if (typeof localStorage === 'undefined') return '';
    return localStorage.getItem(NAME_STORAGE_KEY) || '';
  } catch (e) {
    return '';
  }
}

function saveName(name) {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(NAME_STORAGE_KEY, name);
  } catch (e) {
    // ignore (private browsing / storage disabled)
  }
}

// ---------------------------------------------------------------------
// Prompt card — Tessa asks the player something mid-game (name, difficulty,
// dial). Sits just above her speech bubble, bottom-left.
// ---------------------------------------------------------------------

export function showPrompt({ eyebrow = 'Your name', mode = 'choices', placeholder = '', submitLabel = 'Go', choices = [], lines = [], center = false, onSubmit } = {}) {
  if (!build()) return;
  const card = els.prompt;
  if (!card) return;
  card.classList.toggle('mw-prompt--center', !!center);

  if (mode === 'name') {
    card.innerHTML = `
      <div class="mw-prompt__eyebrow">${escapeHtml(eyebrow)}</div>
      <div class="mw-prompt__row">
        <input type="text" class="mw-prompt__input" maxlength="16" autocomplete="off"
               spellcheck="false" placeholder="${escapeHtml(placeholder)}" aria-label="Your name" />
        <button type="button" class="mw-prompt__go" disabled>${escapeHtml(submitLabel)}</button>
      </div>`;
    const input = card.querySelector('.mw-prompt__input');
    const go = card.querySelector('.mw-prompt__go');
    input.value = readSavedName();
    go.disabled = false; // nothing gates the first run: empty = "Watchmaker"
    const sync = () => {};
    const submit = () => {
      const name = input.value.trim();
      if (name) saveName(name);
      hidePrompt();
      onSubmit && onSubmit(name);
    };
    input.addEventListener('input', sync);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    go.addEventListener('click', () => { audio.playUiTap(); submit(); });
    sync();
    setTimeout(() => input.focus(), 250);
  } else {
    const chips = choices.map((c) => `
      <button type="button" class="mw-diffchip mw-prompt__chip" data-value="${escapeHtml(c.value)}">
        ${c.swatch ? `<span class="mw-dialchip__swatch mw-dialchip__swatch--${escapeHtml(c.swatch)}"></span>` : ''}
        <span class="mw-diffchip__label">${escapeHtml(c.label)}</span>
        ${c.sub ? `<span class="mw-diffchip__sub">${escapeHtml(c.sub)}</span>` : ''}
      </button>`).join('');
    const lineRows = lines.map((l) => `
      <div class="mw-prompt__line"><span class="mw-prompt__bullet">▸</span><span>${escapeHtml(l)}</span></div>`).join('');
    card.innerHTML = `
      <div class="mw-prompt__eyebrow">${escapeHtml(eyebrow)}</div>
      ${lineRows ? `<div class="mw-prompt__lines">${lineRows}</div>` : ''}
      <div class="mw-prompt__chips">${chips}</div>`;
    card.querySelectorAll('.mw-prompt__chip').forEach((btn) => {
      btn.addEventListener('click', () => {
        audio.playUiTap();
        hidePrompt();
        onSubmit && onSubmit(btn.dataset.value);
      });
    });
  }
  card.classList.remove('mw-prompt--hidden');
}

// the SND/SPEC/Z chips only make sense once the bench work begins
export function setHudVisible(v) {
  if (!build()) return;
  if (els.buttons) els.buttons.classList.toggle('mw-buttons--hidden', !v);
}

// force the spec-sheet panel open/closed (the bench briefing shows it off)
export function setLegendOpen(open) {
  if (!build()) return;
  legendCollapsed = !open;
  applyLegendCollapsed();
}

export function hidePrompt() {
  if (els.prompt) els.prompt.classList.add('mw-prompt--hidden');
}

// Build an SVG path `d` string for a stylized gear (outer teeth ring + hub hole).
function gearPathD(cx, cy, rOuter, rInner, teeth) {
  const step = (Math.PI * 2) / (teeth * 2);
  let d = '';
  for (let i = 0; i < teeth * 2; i++) {
    const r = i % 2 === 0 ? rOuter : rInner;
    const angle = i * step;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ',' + y.toFixed(1) + ' ';
  }
  d += 'Z';
  return d;
}

function buildGearsMarkup() {
  const gears = [
    { cx: 880, cy: 120, rOuter: 340, rInner: 300, teeth: 22, hub: 90 },
    { cx: 60, cy: 620, rOuter: 190, rInner: 165, teeth: 16, hub: 50 },
    { cx: 720, cy: 560, rOuter: 90, rInner: 76, teeth: 12, hub: 24 },
  ];
  const parts = gears.map((g) => {
    const outer = gearPathD(g.cx, g.cy, g.rOuter, g.rInner, g.teeth);
    return (
      `<path d="${outer}" fill="none" stroke="currentColor" stroke-width="2"/>` +
      `<circle cx="${g.cx}" cy="${g.cy}" r="${g.hub}" fill="none" stroke="currentColor" stroke-width="2"/>`
    );
  });
  return (
    '<svg class="mw-title__gears" viewBox="0 0 960 720" preserveAspectRatio="xMidYMid slice" aria-hidden="true">' +
    parts.join('') +
    '</svg>'
  );
}

// Build a rotating sunburst SVG: `rayCount` alternating long/short rays
// fanning from center, rendered in `currentColor` (styled via CSS).
function buildSunburstMarkup(cls, size) {
  const s = size || 800;
  const cx = s / 2;
  const cy = s / 2;
  const rOuter = s / 2;
  const rayCount = 24;
  const rays = [];
  for (let i = 0; i < rayCount; i++) {
    const angle = (360 / rayCount) * i;
    const long = i % 2 === 0;
    const len = long ? rOuter : rOuter * 0.66;
    const width = long ? s * 0.014 : s * 0.009;
    const x = (cx - width / 2).toFixed(1);
    const y = (cy - len).toFixed(1);
    rays.push(
      `<rect x="${x}" y="${y}" width="${width.toFixed(1)}" height="${len.toFixed(1)}" fill="currentColor" transform="rotate(${angle.toFixed(2)} ${cx} ${cy})"/>`
    );
  }
  return (
    `<svg class="${cls}" viewBox="0 0 ${s} ${s}" aria-hidden="true" focusable="false">` +
    rays.join('') +
    '</svg>'
  );
}

// ---------------------------------------------------------------------
// build (idempotent)
// ---------------------------------------------------------------------

function getRoot() {
  if (typeof document === 'undefined') return null;
  return document.getElementById('ui-root');
}

function build() {
  const root = getRoot();
  if (!root) return false;
  if (built) return true;

  root.innerHTML = `
    <div class="mw-progress" data-el="progress"></div>

    <div class="mw-step" data-el="step">
      <span class="mw-step__index" data-el="stepIndex"></span><span class="mw-step__label" data-el="stepLabel"></span>
    </div><!-- tool chip sits on its own line below; keep their tops apart in CSS -->

    <div class="mw-tool" data-el="tool"></div>

    <div class="mw-slips mw-slips--hidden" data-el="slips"></div>

    <aside class="mw-notes mw-notes--hidden" data-el="notes">
      <div class="mw-notes__eyebrow">Field notes<span class="mw-notes__chev" aria-hidden="true"></span></div>
      <div class="mw-notes__title">
        <span class="mw-notes__swatch" data-el="notesSwatch"></span>
        <span data-el="notesTitle"></span>
      </div>
      <div class="mw-notes__lines" data-el="notesLines"></div>
    </aside>

    <div class="mw-hint" data-el="hint"></div>

    <div class="mw-buttons mw-buttons--hidden" data-el="buttons">
      <button type="button" class="mw-chip" data-el="legendChip">Spec</button>
      <button type="button" class="mw-chip mw-chip--active" data-el="muteChip">Sound on</button>
      ${typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches
        ? '<button type="button" class="mw-chip" data-el="loupeChip">Loupe</button>' : ''}
    </div>

    <aside class="mw-legend mw-legend--collapsed mw-legend--hidden" data-el="legend">
      <div class="mw-legend__header">Spec sheet</div>
      <div class="mw-legend__list" data-el="legendList"></div>
    </aside>

    <div class="mw-toasts" data-el="toasts"></div>

    <div class="mw-loupe" data-el="loupe" aria-hidden="true"></div>
    <div class="mw-flash" data-el="flash" aria-hidden="true"></div>

    <div class="mw-title mw-title--hidden" data-el="title">
      ${buildGearsMarkup()}
      ${buildSunburstMarkup('mw-sunburst mw-sunburst--title', 900)}
      <div class="mw-title__content">
        <div class="mw-title__eyebrow">Horology Dept. &middot; Training Division</div>
        <h1 class="mw-title__heading">The <em>Mechanical</em> Way</h1>
        <p class="mw-title__subtitle">A guided mechanical watch assembly</p>
        <p class="mw-title__mobileNote">Plays best on a desktop screen, but you can build right here. Landscape helps.</p>

        <button type="button" class="mw-title__start" data-el="startBtn">Start</button>
      </div>
      <div class="mw-title__credit">inspired by ciechanow.ski/mechanical-watch</div>
    </div>

    <div class="mw-prompt mw-prompt--hidden" data-el="prompt"></div>

    <div class="mw-complete" data-el="complete">
      ${buildSunburstMarkup('mw-sunburst mw-sunburst--complete', 700)}
      <div class="mw-complete__heading">It ticks.</div>
      <div class="mw-complete__card">
        <div class="mw-complete__challenge" data-el="completeChallenge"></div>
        <img class="mw-complete__cardImg" data-el="completeCardImg" alt="Your score card" hidden />
        <div class="mw-complete__score">
          <div class="mw-complete__scoreNum" data-el="completeScore"></div>
          <div class="mw-complete__grade" data-el="completeGrade"></div>

        </div>

        <div class="mw-complete__row"><span>Name</span><span data-el="completeName"></span></div>
        <div class="mw-complete__row"><span>Time</span><span data-el="completeTime"></span></div>
        <div class="mw-complete__row"><span>Slips</span><span data-el="completeMistakes"></span></div>
        <div class="mw-complete__row"><span>Level</span><span data-el="completeDifficulty"></span></div>

        <div class="mw-complete__shareRow" data-el="shareRow">
          <span class="mw-complete__shareLabel">Share</span>
          <button type="button" class="mw-share-btn mw-share-btn--main" data-share="x">X</button>
          <button type="button" class="mw-share-btn mw-share-btn--main" data-share="whatsapp">WhatsApp</button>
          <button type="button" class="mw-share-btn mw-share-btn--main" data-share="instagram">Instagram</button>
          <button type="button" class="mw-share-btn" data-share="download">Download</button>
        </div>
        <div class="mw-complete__actions">
          <button type="button" class="mw-complete__restart mw-complete__deeper" data-el="deeperBtn" hidden>Go deeper</button>
          <button type="button" class="mw-complete__restart" data-el="restartBtn">Build another</button>
        </div>
        <div class="mw-complete__shareStatus" data-el="shareStatus"></div>
      </div>
    </div>
  `;

  els = {
    progress: root.querySelector('[data-el="progress"]'),
    step: root.querySelector('[data-el="step"]'),
    stepIndex: root.querySelector('[data-el="stepIndex"]'),
    stepLabel: root.querySelector('[data-el="stepLabel"]'),
    tool: root.querySelector('[data-el="tool"]'),
    notes: root.querySelector('[data-el="notes"]'),
    notesSwatch: root.querySelector('[data-el="notesSwatch"]'),
    notesTitle: root.querySelector('[data-el="notesTitle"]'),
    notesLines: root.querySelector('[data-el="notesLines"]'),
    hint: root.querySelector('[data-el="hint"]'),
    slips: root.querySelector('[data-el="slips"]'),
    legendChip: root.querySelector('[data-el="legendChip"]'),
    muteChip: root.querySelector('[data-el="muteChip"]'),
    loupeChip: root.querySelector('[data-el="loupeChip"]'),
    legend: root.querySelector('[data-el="legend"]'),
    legendList: root.querySelector('[data-el="legendList"]'),
    toasts: root.querySelector('[data-el="toasts"]'),
    loupe: root.querySelector('[data-el="loupe"]'),
    flash: root.querySelector('[data-el="flash"]'),
    title: root.querySelector('[data-el="title"]'),
    prompt: root.querySelector('[data-el="prompt"]'),
    buttons: root.querySelector('[data-el="buttons"]'),
    startBtn: root.querySelector('[data-el="startBtn"]'),
    complete: root.querySelector('[data-el="complete"]'),
    completeScore: root.querySelector('[data-el="completeScore"]'),
    completeGrade: root.querySelector('[data-el="completeGrade"]'),
    completeName: root.querySelector('[data-el="completeName"]'),
    completeTime: root.querySelector('[data-el="completeTime"]'),
    completeMistakes: root.querySelector('[data-el="completeMistakes"]'),
    completeDifficulty: root.querySelector('[data-el="completeDifficulty"]'),
    shareRow: root.querySelector('[data-el="shareRow"]'),
    completeChallenge: root.querySelector('[data-el="completeChallenge"]'),
    completeCardImg: root.querySelector('[data-el="completeCardImg"]'),
    deeperBtn: root.querySelector('[data-el="deeperBtn"]'),
    shareStatus: root.querySelector('[data-el="shareStatus"]'),
    restartBtn: root.querySelector('[data-el="restartBtn"]'),
  };

  els.startBtn.addEventListener('click', () => {
    audio.playUiTap();
    handlers.onStart && handlers.onStart();
  });

  root.querySelectorAll('.mw-share-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      audio.playUiTap();
      handlers.onShare && handlers.onShare(btn.dataset.share);
    });
  });

  els.legendChip.addEventListener('click', () => { audio.playUiTap(); toggleLegend(); });
  if (els.muteChip) els.muteChip.addEventListener('click', () => { audio.playUiTap(); toggleMute(); });
  if (els.loupeChip) {
    els.loupeChip.addEventListener('click', () => {
      audio.playUiTap();
      const on = !els.loupeChip.classList.contains('mw-chip--active');
      els.loupeChip.classList.toggle('mw-chip--active', on);
      handlers.onMagnifier && handlers.onMagnifier(on);
    });
  }
  els.notes.addEventListener('click', () => {
    notesMin = !notesMin;
    els.notes.classList.toggle('mw-notes--min', notesMin);
  });

  els.restartBtn.addEventListener('click', () => {
    audio.playUiTap();
    if (handlers.onRestart) handlers.onRestart();
    else if (typeof window !== 'undefined') window.location.reload();
  });

  els.deeperBtn.addEventListener('click', () => {
    audio.playUiTap();
    const next = els.deeperBtn.dataset.next;
    if (next && handlers.onRestart) handlers.onRestart(next);
  });

  document.addEventListener('keydown', onKeydown);

  updateMuteChip();
  built = true;
  return true;
}

function onKeydown(e) {
  const t = e.target;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
  const key = (e.key || '').toLowerCase();
  if (key === 'm') {
    toggleMute();
  } else if (key === 'l') {
    toggleLegend();
  }
}

function updateMuteChip() {
  if (!els.muteChip) return;
  els.muteChip.textContent = soundOn ? 'Sound on' : 'Sound off';
  els.muteChip.classList.toggle('mw-chip--active', soundOn);
}

function toggleMute() {
  soundOn = !soundOn;
  updateMuteChip();
  handlers.onToggleMute && handlers.onToggleMute();
}

function applyLegendCollapsed() {
  if (!els.legend) return;
  els.legend.classList.toggle('mw-legend--collapsed', legendCollapsed);
  if (els.legendChip) els.legendChip.classList.toggle('mw-chip--active', !legendCollapsed);
}

function toggleLegend() {
  legendCollapsed = !legendCollapsed;
  applyLegendCollapsed();
  handlers.onToggleLegend && handlers.onToggleLegend();
}

function renderLegendRows(parts) {
  if (!els.legendList) return;
  const list = Array.isArray(parts) ? parts : [];
  els.legendList.innerHTML = list
    .map((p) => {
      const done = !!p.done;
      const color = escapeHtml(p.color || '#c89b3c');
      const name = escapeHtml(p.name || '');
      const blurb = escapeHtml(p.blurb || '');
      return `
        <div class="mw-legend__row${done ? ' mw-legend__row--done' : ''}">
          <span class="mw-legend__num">${String(list.indexOf(p) + 1).padStart(2, '0')}</span>
          <span class="mw-legend__swatch" style="background:${color}"></span>
          <span class="mw-legend__text">
            <span class="mw-legend__name">${name}${done ? '<span class="mw-legend__check">&#10003;</span>' : ''}</span>
            <span class="mw-legend__blurb">${blurb}</span>
          </span>
        </div>
      `;
    })
    .join('');
}

// ---------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------

export function initUI(handlersArg) {
  handlers = handlersArg || {};
  build();
}

export function showTitle() {
  if (!build()) return;
  els.title.classList.remove('mw-title--hidden');
}

export function hideTitle() {
  if (!built) return;
  if (!els.title) return;
  els.title.classList.add('mw-title--hidden');
}

export function setStep(index, total, label) {
  if (!build()) return;
  const idxStr = `Step ${pad2(index)} / ${pad2(total)}`;
  els.stepIndex.textContent = idxStr;
  els.stepLabel.textContent = label ? ` · ${String(label)}` : '';
  els.step.classList.add('mw-step--visible');

  els.step.classList.add('mw-step--pulse');
  if (stepPulseTimer) clearTimeout(stepPulseTimer);
  stepPulseTimer = setTimeout(() => {
    els.step.classList.remove('mw-step--pulse');
  }, 220);
}

export function setProgress(fraction) {
  if (!build()) return;
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  els.progress.style.width = `${(f * 100).toFixed(2)}%`;
}

export function showLegend(parts) {
  if (!build()) return;
  renderLegendRows(parts);
  els.legend.classList.remove('mw-legend--hidden');
  if (!legendEverShown) {
    legendEverShown = true;
    // start collapsed — the parts tray lives on that side of the bench
    legendCollapsed = true;
  }
  applyLegendCollapsed();
}

export function updateLegend(parts) {
  if (!build()) return;
  renderLegendRows(parts);
}

export function toast(text) {
  if (!build()) return;
  const node = document.createElement('div');
  node.className = 'mw-toast';
  node.textContent = String(text == null ? '' : text);
  els.toasts.appendChild(node);
  toastQueue.push(node);

  // enforce max stack of 2 — drop oldest immediately
  while (toastQueue.length > TOAST_MAX) {
    const old = toastQueue.shift();
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  requestAnimationFrame(() => {
    node.classList.add('mw-toast--visible');
  });

  setTimeout(() => {
    node.classList.remove('mw-toast--visible');
    setTimeout(() => {
      if (node.parentNode) node.parentNode.removeChild(node);
      const i = toastQueue.indexOf(node);
      if (i !== -1) toastQueue.splice(i, 1);
    }, 240);
  }, 2500);
}

export function flashHint(text) {
  if (!build()) return;
  els.hint.textContent = String(text == null ? '' : text);
  els.hint.classList.add('mw-hint--visible');
  if (hintTimer) clearTimeout(hintTimer);
  hintTimer = setTimeout(() => {
    els.hint.classList.remove('mw-hint--visible');
  }, 4000);
}

// Running slip tally (wrong tools / wrong parts). Hidden at zero, bumps on each
// increment so the player feels the mistake register.
export function setSlips(n) {
  if (!build()) return;
  if (!els.slips) return;
  const v = Math.max(0, Math.round(Number(n) || 0));
  els.slips.textContent = v === 1 ? 'Slip · 1' : `Slips · ${v}`;
  els.slips.classList.remove('mw-slips--hidden');
  if (v > 0) {
    els.slips.classList.remove('mw-slips--bump');
    void els.slips.offsetWidth; // restart the bump animation on repeat
    els.slips.classList.add('mw-slips--bump');
  }
}

// A short whole-screen shake for negative feedback (wrong tool / wrong part).
export function shake() {
  if (typeof document === 'undefined') return;
  const app = document.getElementById('app');
  if (!app) return;
  app.classList.remove('mw-shake');
  void app.offsetWidth; // restart the animation if it's already running
  app.classList.add('mw-shake');
  setTimeout(() => app.classList.remove('mw-shake'), 460);
}

export function showComplete(stats) {
  if (!build()) return;
  const s = stats || {};
  const mistakes = Math.max(0, Math.round(s.mistakes || 0));
  const name = String(s.name == null ? '' : s.name).trim();
  const difficulty = String(s.difficulty == null ? '' : s.difficulty);
  const score = Math.max(0, Math.round(Number(s.score) || 0));

  els.completeName.textContent = name || '·';
  els.completeTime.textContent = formatMMSS(s.timeSec);
  els.completeMistakes.textContent = String(mistakes);
  els.completeDifficulty.textContent = difficulty
    ? difficulty.charAt(0).toUpperCase() + difficulty.slice(1)
    : '·';
  els.completeScore.textContent = formatScore(score);

  let grade = s.grade ? String(s.grade) : '';
  if (!grade) {
    if (mistakes === 0) grade = 'Flawless benchwork.';
    else if (mistakes <= 3) grade = 'A steady hand.';
    else grade = 'The watch forgives.';
  }
  els.completeGrade.textContent = grade;

  // the score card itself is the centerpiece when we have one — it already
  // carries the score, the stats ticker and the watch
  const hasCard = !!s.cardUrl;
  if (els.completeCardImg) {
    els.completeCardImg.hidden = !hasCard;
    if (hasCard) els.completeCardImg.src = s.cardUrl;
  }
  els.complete.classList.toggle('mw-complete--hasCard', hasCard);

  if (els.completeChallenge) {
    els.completeChallenge.textContent = s.challengeLine || '';
    els.completeChallenge.classList.toggle('mw-complete__challenge--visible', !!s.challengeLine);
  }

  if (els.deeperBtn) {
    const next = s.nextTier;
    els.deeperBtn.hidden = !next;
    if (next) {
      els.deeperBtn.dataset.next = next;
      els.deeperBtn.textContent = `Go deeper · ${next.charAt(0).toUpperCase()}${next.slice(1)}`;
    }
  }

  els.complete.classList.add('mw-complete--visible');
}

// Showcase: every UI layer steps aside so the finished watch owns the screen.
export function setShowcase(v) {
  if (!build()) return;
  const root = getRoot();
  if (root) root.classList.toggle('mw-ui-showcase', !!v);
}

export function setShareStatus(text) {
  if (!build()) return;
  if (!els.shareStatus) return;
  els.shareStatus.textContent = String(text == null ? '' : text);
  els.shareStatus.classList.add('mw-complete__shareStatus--visible');
  if (shareStatusTimer) clearTimeout(shareStatusTimer);
  shareStatusTimer = setTimeout(() => {
    if (els.shareStatus) els.shareStatus.classList.remove('mw-complete__shareStatus--visible');
  }, 2500);
}

export function setTool(name, status) {
  if (!build()) return;
  const st = status === 'none' || status === 'wrong' ? status : 'ok';
  const label = `Tool: ${String(name == null ? '' : name)}`;
  els.tool.textContent = st === 'none' ? 'Tool: none · Pick one from the roll' : label;

  els.tool.classList.remove('mw-tool--ok', 'mw-tool--none', 'mw-tool--wrong');
  els.tool.classList.add(`mw-tool--${st}`);

  els.tool.classList.remove('mw-tool--pulse', 'mw-tool--shake');
  void els.tool.offsetWidth; // restart animation on repeat calls
  if (st === 'ok') {
    els.tool.classList.add('mw-tool--pulse');
    if (toolPulseTimer) clearTimeout(toolPulseTimer);
    toolPulseTimer = setTimeout(() => {
      if (els.tool) els.tool.classList.remove('mw-tool--pulse');
    }, 520);
  } else if (st === 'wrong') {
    els.tool.classList.add('mw-tool--shake');
    if (toolShakeTimer) clearTimeout(toolShakeTimer);
    toolShakeTimer = setTimeout(() => {
      if (els.tool) els.tool.classList.remove('mw-tool--shake');
    }, 420);
  }
}

export function showNotes(note) {
  if (!build()) return;
  const n = note || {};
  const color = String(n.color || '#c89b3c');
  const title = String(n.title == null ? '' : n.title);
  const lines = Array.isArray(n.lines) ? n.lines.slice(0, 4) : [];

  els.notesSwatch.style.background = color;
  els.notesTitle.textContent = title;
  els.notesLines.innerHTML = lines
    .map((l) => `<div class="mw-notes__line"><span class="mw-notes__bullet">▸</span><span>${escapeHtml(l)}</span></div>`)
    .join('');

  els.notes.classList.toggle('mw-notes--min', notesMin);
  els.notes.classList.remove('mw-notes--hidden');
  els.notes.classList.remove('mw-notes--slide');
  void els.notes.offsetWidth; // restart slide-in animation on repeat calls
  els.notes.classList.add('mw-notes--slide');
  if (notesSlideTimer) clearTimeout(notesSlideTimer);
  notesSlideTimer = setTimeout(() => {
    if (els.notes) els.notes.classList.remove('mw-notes--slide');
  }, 260);
}

// Loupe framing: a soft vignette + edge blur while the Z zoom is held.
let loupeOn = false;
export function setLoupe(v) {
  const on = !!v;
  if (on === loupeOn) return;
  loupeOn = on;
  if (!build()) return;
  if (els.loupe) els.loupe.classList.toggle('mw-loupe--on', on);
}

// One-frame white pop for the case landing.
export function flashWhite() {
  if (!build()) return;
  if (!els.flash) return;
  els.flash.classList.remove('mw-flash--on');
  void els.flash.offsetWidth;
  els.flash.classList.add('mw-flash--on');
}

// Cinematic beats hide the working chips (tool, hint) — stale state reads
// as noise while the game performs.
export function setCinematic(v) {
  if (!build()) return;
  const root = getRoot();
  if (root) root.classList.toggle('mw-cinematic', !!v);
}

export function hideNotes() {
  if (!built) return;
  if (!els.notes) return;
  els.notes.classList.add('mw-notes--hidden');
}
