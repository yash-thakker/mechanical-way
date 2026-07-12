// src/ui.js — owns #ui-root DOM + src/styles.css (see docs/DESIGN.md)
//
// Retro time-bureau paperwork meets watchmaker's bench.
// Exports: initUI, showTitle, hideTitle, setStep, setProgress,
//          showLegend, updateLegend, toast, showComplete, flashHint,
//          setTool, showNotes, hideNotes, setShareStatus

let handlers = {};
let built = false;

// cached element refs (populated in build())
let els = {};

// local UI state
let soundOn = true;
let legendCollapsed = true;
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

export function showPrompt({ eyebrow = '// TESSA ASKS', mode = 'choices', placeholder = '', submitLabel = 'GO', choices = [], center = false, onSubmit } = {}) {
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
    const sync = () => { go.disabled = input.value.trim().length === 0; };
    const submit = () => {
      const name = input.value.trim();
      if (!name) return;
      saveName(name);
      hidePrompt();
      onSubmit && onSubmit(name);
    };
    input.addEventListener('input', sync);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    go.addEventListener('click', submit);
    sync();
    setTimeout(() => input.focus(), 250);
  } else {
    const chips = choices.map((c) => `
      <button type="button" class="mw-diffchip mw-prompt__chip" data-value="${escapeHtml(c.value)}">
        ${c.swatch ? `<span class="mw-dialchip__swatch mw-dialchip__swatch--${escapeHtml(c.swatch)}"></span>` : ''}
        <span class="mw-diffchip__label">${escapeHtml(c.label)}</span>
        ${c.sub ? `<span class="mw-diffchip__sub">${escapeHtml(c.sub)}</span>` : ''}
      </button>`).join('');
    card.innerHTML = `
      <div class="mw-prompt__eyebrow">${escapeHtml(eyebrow)}</div>
      <div class="mw-prompt__chips">${chips}</div>`;
    card.querySelectorAll('.mw-prompt__chip').forEach((btn) => {
      btn.addEventListener('click', () => {
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
    </div>

    <div class="mw-tool" data-el="tool"></div>

    <aside class="mw-notes mw-notes--hidden" data-el="notes">
      <div class="mw-notes__eyebrow">// FIELD NOTES</div>
      <div class="mw-notes__title">
        <span class="mw-notes__swatch" data-el="notesSwatch"></span>
        <span data-el="notesTitle"></span>
      </div>
      <div class="mw-notes__lines" data-el="notesLines"></div>
    </aside>

    <div class="mw-hint" data-el="hint"></div>

    <div class="mw-buttons mw-buttons--hidden" data-el="buttons">
      <button type="button" class="mw-chip mw-chip--active" data-el="muteChip"></button>
      <button type="button" class="mw-chip" data-el="legendChip">SPEC</button>
      <div class="mw-chip mw-chip--static" aria-hidden="true">Z &mdash; MAGNIFY</div>
    </div>

    <aside class="mw-legend mw-legend--collapsed mw-legend--hidden" data-el="legend">
      <button type="button" class="mw-legend__tab" data-el="legendTab">SPEC</button>
      <div class="mw-legend__header">// SPEC SHEET</div>
      <div class="mw-legend__list" data-el="legendList"></div>
    </aside>

    <div class="mw-toasts" data-el="toasts"></div>

    <div class="mw-title mw-title--hidden" data-el="title">
      ${buildGearsMarkup()}
      ${buildSunburstMarkup('mw-sunburst mw-sunburst--title', 900)}
      <div class="mw-title__content">
        <div class="mw-title__eyebrow">HOROLOGY DEPT. &mdash; TRAINING DIVISION</div>
        <h1 class="mw-title__heading">THE <em>MECHANICAL</em> WAY</h1>
        <p class="mw-title__subtitle">A guided mechanical watch assembly</p>

        <button type="button" class="mw-title__start" data-el="startBtn">START</button>
      </div>
      <div class="mw-title__credit">inspired by ciechanow.ski/mechanical-watch</div>
    </div>

    <div class="mw-prompt mw-prompt--hidden" data-el="prompt"></div>

    <div class="mw-complete" data-el="complete">
      ${buildSunburstMarkup('mw-sunburst mw-sunburst--complete', 700)}
      <div class="mw-complete__heading">IT TICKS.</div>
      <div class="mw-complete__card">
        <div class="mw-complete__score">
          <div class="mw-complete__scoreNum" data-el="completeScore"></div>
          <div class="mw-complete__grade" data-el="completeGrade"></div>
          <div class="mw-complete__stamp mw-complete__stamp--hidden" data-el="completeStamp">NEW BENCH RECORD!</div>
        </div>

        <div class="mw-complete__row"><span>NAME</span><span data-el="completeName"></span></div>
        <div class="mw-complete__row"><span>TIME</span><span data-el="completeTime"></span></div>
        <div class="mw-complete__row"><span>SLIPS</span><span data-el="completeMistakes"></span></div>
        <div class="mw-complete__row"><span>DIFFICULTY</span><span data-el="completeDifficulty"></span></div>

        <div class="mw-complete__board mw-complete__board--hidden" data-el="completeBoard">
          <div class="mw-complete__boardHeader">// BENCH RECORDS</div>
          <div class="mw-complete__boardList" data-el="completeBoardList"></div>
        </div>

        <div class="mw-complete__actions">
          <button type="button" class="mw-complete__share" data-el="shareBtn">SHARE SCORE</button>
          <button type="button" class="mw-complete__restart" data-el="restartBtn">BUILD ANOTHER</button>
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
    muteChip: root.querySelector('[data-el="muteChip"]'),
    legendChip: root.querySelector('[data-el="legendChip"]'),
    legend: root.querySelector('[data-el="legend"]'),
    legendTab: root.querySelector('[data-el="legendTab"]'),
    legendList: root.querySelector('[data-el="legendList"]'),
    toasts: root.querySelector('[data-el="toasts"]'),
    title: root.querySelector('[data-el="title"]'),
    prompt: root.querySelector('[data-el="prompt"]'),
    buttons: root.querySelector('[data-el="buttons"]'),
    startBtn: root.querySelector('[data-el="startBtn"]'),
    complete: root.querySelector('[data-el="complete"]'),
    completeScore: root.querySelector('[data-el="completeScore"]'),
    completeGrade: root.querySelector('[data-el="completeGrade"]'),
    completeStamp: root.querySelector('[data-el="completeStamp"]'),
    completeName: root.querySelector('[data-el="completeName"]'),
    completeTime: root.querySelector('[data-el="completeTime"]'),
    completeMistakes: root.querySelector('[data-el="completeMistakes"]'),
    completeDifficulty: root.querySelector('[data-el="completeDifficulty"]'),
    completeBoard: root.querySelector('[data-el="completeBoard"]'),
    completeBoardList: root.querySelector('[data-el="completeBoardList"]'),
    shareBtn: root.querySelector('[data-el="shareBtn"]'),
    shareStatus: root.querySelector('[data-el="shareStatus"]'),
    restartBtn: root.querySelector('[data-el="restartBtn"]'),
  };

  els.startBtn.addEventListener('click', () => {
    handlers.onStart && handlers.onStart();
  });

  if (els.shareBtn) {
    els.shareBtn.addEventListener('click', () => {
      handlers.onShare && handlers.onShare();
    });
  }

  els.muteChip.addEventListener('click', toggleMute);
  els.legendChip.addEventListener('click', toggleLegend);
  els.legendTab.addEventListener('click', toggleLegend);

  els.restartBtn.addEventListener('click', () => {
    if (typeof window !== 'undefined') window.location.reload();
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
  els.muteChip.textContent = soundOn ? 'SND ON' : 'SND OFF';
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
  const idxStr = `STEP ${pad2(index)} / ${pad2(total)}`;
  els.stepIndex.textContent = idxStr;
  els.stepLabel.textContent = label ? `— ${String(label).toUpperCase()}` : '';
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

export function showComplete(stats) {
  if (!build()) return;
  const s = stats || {};
  const mistakes = Math.max(0, Math.round(s.mistakes || 0));
  const name = String(s.name == null ? '' : s.name).trim();
  const difficulty = String(s.difficulty == null ? '' : s.difficulty);
  const score = Math.max(0, Math.round(Number(s.score) || 0));

  els.completeName.textContent = name || '—';
  els.completeTime.textContent = formatMMSS(s.timeSec);
  els.completeMistakes.textContent = String(mistakes);
  els.completeDifficulty.textContent = difficulty ? difficulty.toUpperCase() : '—';
  els.completeScore.textContent = formatScore(score);

  let grade = s.grade ? String(s.grade).toUpperCase() : '';
  if (!grade) {
    if (mistakes === 0) grade = 'FLAWLESS BENCHWORK.';
    else if (mistakes <= 3) grade = 'A STEADY HAND.';
    else grade = 'THE WATCH FORGIVES.';
  }
  els.completeGrade.textContent = grade;

  if (els.completeStamp) {
    els.completeStamp.classList.toggle('mw-complete__stamp--hidden', !s.isNewBest);
  }

  const board = Array.isArray(s.leaderboard) ? s.leaderboard : [];
  if (els.completeBoard && els.completeBoardList) {
    if (board.length) {
      els.completeBoardList.innerHTML = board
        .slice(0, 8)
        .map((entry, i) => {
          const e = entry || {};
          const eName = escapeHtml(e.name == null ? '—' : e.name);
          const eDiffLetter = String(e.difficulty || '').charAt(0).toUpperCase();
          const eScore = Math.max(0, Math.round(Number(e.score) || 0));
          const isMe = !!name && e.name === s.name && eScore === score;
          return `
            <div class="mw-complete__boardRow${isMe ? ' mw-complete__boardRow--me' : ''}">
              <span class="mw-complete__boardRank">${i + 1}</span>
              <span class="mw-complete__boardName">${eName}</span>
              <span class="mw-complete__boardBadge mw-complete__boardBadge--${(eDiffLetter || 'M').toLowerCase()}">${eDiffLetter || '—'}</span>
              <span class="mw-complete__boardScore">${formatScore(eScore)}</span>
            </div>
          `;
        })
        .join('');
      els.completeBoard.classList.remove('mw-complete__board--hidden');
    } else {
      els.completeBoardList.innerHTML = '';
      els.completeBoard.classList.add('mw-complete__board--hidden');
    }
  }

  els.complete.classList.add('mw-complete--visible');
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
  const label = `TOOL — ${String(name == null ? '' : name).toUpperCase()}`;
  els.tool.textContent = st === 'none' ? 'TOOL — NONE — pick from the roll' : label;

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

  els.notes.classList.remove('mw-notes--hidden');
  els.notes.classList.remove('mw-notes--slide');
  void els.notes.offsetWidth; // restart slide-in animation on repeat calls
  els.notes.classList.add('mw-notes--slide');
  if (notesSlideTimer) clearTimeout(notesSlideTimer);
  notesSlideTimer = setTimeout(() => {
    if (els.notes) els.notes.classList.remove('mw-notes--slide');
  }, 260);
}

export function hideNotes() {
  if (!built) return;
  if (!els.notes) return;
  els.notes.classList.add('mw-notes--hidden');
}
