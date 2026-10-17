// Every screen is a function that returns HTML. Buttons carry data-act="..." and
// inputs carry data-change="..."; app.js wires those to actions.
import { S, activeBake, activeFeed, lastFeed, feedSeries, trainingFeeds, starterPrediction, bulkInfo, currentStepIdx, stepDue, projectedTimes, bestBake, bakesSorted, recipeById, bakeById, feedById } from './state.js';
import { esc, fmtTime, fmtDate, fmtDur, fmtClock, daysAgo, r1, ICON, chart, hourTicks, ms } from './ui.js';
import { fitAll, MODEL_LABELS, MODELS } from './fit.js';
import { stats, waterTemp, fromTargets } from './calc.js';

// ---------- shared bits ----------
const header = (eyebrow, title, right = '') => `
  <header class="hdr">
    <div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1></div>${right}
  </header>`;
const backLink = (href, label) => `<a class="back" href="${href}">${ICON.back(18)}${esc(label)}</a>`;
const stepper = (act, value, unit, sub = '', key = '') => `
  <div class="stepper">
    <button class="big" data-act="${act}" data-key="${key}" data-d="-1" aria-label="Decrease">−</button>
    <div class="stepper-val"><div class="num">${value}<span class="unit">${unit}</span></div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
    <button class="big" data-act="${act}" data-key="${key}" data-d="1" aria-label="Increase">+</button>
  </div>`;
const chips = (act, options, selected, key = '') => `<div class="chips">${options
  .map((o) => {
    const v = typeof o === 'string' ? o : o.v;
    const l = typeof o === 'string' ? o : o.l;
    const on = Array.isArray(selected) ? selected.includes(v) : selected === v;
    return `<button class="chip${on ? ' on' : ''}" data-act="${act}" data-key="${key}" data-v="${esc(v)}" aria-pressed="${on}">${esc(l)}</button>`;
  })
  .join('')}</div>`;
const photoTile = (id, label, cls = 'ph') => (id ? `<img class="${cls} img" data-blob="${id}" alt="${esc(label)}">` : `<div class="${cls}">${esc(label)}</div>`);
const statLine = (b) => {
  const s = stats(b.ing);
  return s ? `${r1(s.hydration)}% hyd · ${r1(s.pff)}% levain flour` : 'Ingredients incomplete';
};

// ======================================================================
// TODAY
// ======================================================================
export function today() {
  const b = activeBake();
  const date = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const right = `<a class="icon-btn" href="#/kitchen" aria-label="Kitchen setup">${ICON.sliders(20)}</a>`;
  if (b) return header(`${date} · Loaf #${esc(b.num)} baking`, 'Today', right) + bakingNow(b, false) + upNext(b) + `<a class="link-center" href="#/bake">Full bake log ›</a>`;

  let out = header(date, 'Today', right);
  const unrated = bakesSorted().find((x) => x.status === 'done' && x.result && x.result.score == null && !S.d.dismissRate?.includes(x.id));
  if (unrated) {
    out += `<a class="card row-card warm" href="#/rate/${unrated.id}">
      ${photoTile(unrated.result.photos?.[0], '#' + unrated.num, 'ph sq')}
      <div class="grow"><div class="t">Rate your last loaf</div><div class="s">#${esc(unrated.num)} · ${fmtDate(unrated.date)} · not rated yet</div></div><span class="chev">›</span></a>`;
  }
  const f = activeFeed();
  if (f) {
    const p = starterPrediction(f);
    out += `<a class="card" href="#/starter"><div class="row-between"><div class="lbl">Starter</div><span class="pill blue">Rising</span></div>
      <div class="big-line">${p ? `Ready ≈ <b class="mono">${fmtTime(ms(f.start) + p.peak * 3.6e6)}</b>` : 'Fed ' + fmtTime(f.start)}</div>
      <div class="muted">Fed ${fmtTime(f.start)} · ${esc(f.ratio)} · ${esc(f.flour)}</div></a>`;
  } else {
    const lf = lastFeed();
    const d = lf ? daysAgo(lf.start) : null;
    const due = d != null && d >= (S.d.starter.nudgeDays || 7);
    out += `<section class="card"><div class="row-between"><div class="lbl">Starter</div>${due ? '<span class="pill warm">Feed soon</span>' : ''}</div>
      <div class="big-line">${esc(S.d.starter.storage || '')}${lf ? ` · last fed ${d === 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'}` : ''}</div>
      <a class="btn primary" href="#/starter">Log a feed</a></section>`;
  }
  const last = bakesSorted()[0];
  const rec = last && last.recipeId ? recipeById(last.recipeId) : null;
  out += `<section class="card"><div class="lbl">Next bake</div>
    <div class="big-line">${rec ? esc(rec.name) : 'Pick a recipe'}</div>
    <div class="muted">Change one thing from last time and the app tracks whether it helped.</div>
    <a class="btn outline" href="#/new${rec ? '?recipe=' + rec.id : ''}">Start a bake</a></section>`;
  const strip = bakesSorted().slice(0, 4);
  out += `<a class="card" href="#/loaves"><div class="row-between"><div class="lbl">Your loaves</div><span class="link">${S.d.bakes.length} entries ›</span></div>
    <div class="grid4">${strip.map((x) => photoTile(x.result?.photos?.[0], '#' + x.num, 'ph thumb' + (x.best ? ' best' : ''))).join('')}</div></a>`;
  return out;
}

function bakingNow(b, dark) {
  const i = currentStepIdx(b);
  if (i < 0) {
    return `<section class="now ${dark ? 'on-dark' : ''}"><div class="now-step">All steps done</div>
      <button class="btn big-btn" data-act="finish-bake">Finish · rate tomorrow</button></section>`;
  }
  const s = b.steps[i];
  const due = stepDue(b, i);
  return `<section class="now ${dark ? 'on-dark' : ''}">
    <div class="row-between"><div class="now-lbl">Now</div>${S.ui.wakeOn ? `<span class="awake">${ICON.eye(14)} Awake</span>` : ''}</div>
    <div class="now-step">${esc(s.label)}</div>
    ${due ? `<div class="countdown mono" data-due="${due}">--:--</div><div class="now-sub">due ${fmtTime(due)}</div>`
      : `<div class="now-sub">${esc(s.hint || 'Tap Done when it’s done.')}</div>`}
    <button class="btn big-btn" data-act="step-done">Done</button>
    <div class="grid2">
      <button class="btn ghost" data-act="voice">${ICON.mic(18)} ${S.ui.recording ? 'Stop' : 'Voice note'}</button>
      <label class="btn ghost">${ICON.camera(18)} Photo<input type="file" accept="image/*" capture="environment" data-change="note-photo" hidden></label>
    </div>
    <button class="text-btn" data-act="note-open">${ICON.note(16)} Type a note</button>
    ${S.ui.noteOpen ? `<div class="note-box"><textarea id="note-text" rows="3" placeholder="What did you notice?"></textarea><button class="btn primary" data-act="note-save">Save note</button></div>` : ''}
  </section>`;
}

function upNext(b) {
  const i = currentStepIdx(b);
  if (i < 0) return '';
  const proj = projectedTimes(b);
  const rows = b.steps.slice(i + 1, i + 5).map((s, k) => {
    const due = proj[i + 1 + k];
    return `<div class="li"><span>${esc(s.label)}</span><span class="mono muted">${due ? fmtTime(due) : ''}</span></div>`;
  });
  const info = bulkInfo(b);
  let bulk = '';
  if (info.started) {
    const pct = info.series ? Math.round(info.series.Rs[info.series.Rs.length - 1] * 100) : null;
    const t = info.pred?.ready && info.pred.tTarget != null ? ms(info.start) + info.pred.tTarget * 3.6e6 : null;
    bulk = `<a class="card" href="#/bulk"><div class="row-between"><div class="lbl">Bulk · aliquot jar</div><span class="link">Log rise ›</span></div>
      <div class="row-between"><div class="huge mono">${pct != null ? '+' + pct + '%' : '—'}</div>
      <div class="right"><div class="muted">Shape at +${b.bulk.target}%</div><div class="mono accent">${t ? '≈ ' + fmtTime(t) : info.series ? 'need more readings' : 'mark the jar'}</div></div></div>
      <div class="bar"><div style="width:${Math.min(100, Math.max(0, ((pct || 0) / b.bulk.target) * 100))}%"></div></div></a>`;
  }
  return bulk + (rows.length ? `<section class="card list"><div class="lbl">Up next</div>${rows.join('')}</section>` : '');
}

// ======================================================================
// STARTER
// ======================================================================
export function starter() {
  const f = activeFeed();
  const name = S.ui.renaming
    ? `<span class="rename"><input id="starter-name" value="${esc(S.d.starter.name)}"><button class="text-btn" data-act="rename-save">Save</button></span>`
    : `${esc(S.d.starter.name)} <button class="icon-inline" data-act="rename" aria-label="Rename starter">${ICON.pencil(14)}</button>`;
  let out = header(name, 'Starter');
  out += f ? activeFeedView(f) : newFeedForm();
  const lf = lastFeed();
  out += `<section class="card list"><div class="lbl">Upkeep</div>
    <div class="li"><span>Between bakes</span><input class="inline-input" data-change="starter-field" data-key="storage" value="${esc(S.d.starter.storage)}"></div>
    <div class="li"><span>Last logged feed</span><span class="mono">${lf ? fmtDate(lf.start) : '—'}</span></div>
    <div class="li"><span>Nudge after</span><span class="mini-step"><button data-act="nudge" data-d="-1" aria-label="Fewer days">−</button><b class="mono">${S.d.starter.nudgeDays} d</b><button data-act="nudge" data-d="1" aria-label="More days">+</button></span></div>
    <a class="li" href="#/starter/history"><span>Past feeds &amp; model details</span><span class="link">${S.d.feeds.length} ›</span></a></section>`;
  return out;
}

function newFeedForm() {
  const dft = (S.ui.feedDraft ||= { ratio: '1:1:1', flour: '50/50 BF/WW', purpose: 'levain', startMm: 30, tempF: S.d.kitchen.roomF || 72 });
  const n = trainingFeeds(dft.ratio).length;
  return `<section class="card">
    <div class="lbl">Feed now</div>
    <div class="field-lbl">Ratio (starter : flour : water)</div>${chips('feed-draft', ['1:1:1', '1:2:2', '1:3:3', '1:5:5'], dft.ratio, 'ratio')}
    <div class="field-lbl">Flour</div>${chips('feed-draft', ['100% BF', '50/50 BF/WW', '100% WW', 'BF + rye'], dft.flour, 'flour')}
    <div class="field-lbl">For</div>${chips('feed-draft', [{ v: 'levain', l: 'A bake (levain)' }, { v: 'maintenance', l: 'Upkeep' }], dft.purpose, 'purpose')}
    <div class="field-lbl">Start line on the jar</div>${stepper('feed-draft-num', dft.startMm, ' mm', '', 'startMm')}
    <div class="field-lbl">Room temp</div>${stepper('feed-draft-num', dft.tempF, '°F', '', 'tempF')}
    <div class="muted small">${n ? `Prediction from ${n} past ${dft.ratio} feed${n > 1 ? 's' : ''}.` : `No past ${dft.ratio} feeds with readings yet — log this one and the next gets a prediction.`}</div>
    <button class="btn primary big-btn" data-act="feed-start">Fed it · start timer</button>
  </section>`;
}

function activeFeedView(f) {
  const p = starterPrediction(f);
  const t0 = ms(f.start);
  const series = feedSeries(f);
  const last = f.readings[f.readings.length - 1];
  const curMm = S.ui.mm ?? (last ? last.mm : f.startMm);
  let out = `<section class="hero">
    <div class="hero-sub">Fed ${fmtTime(f.start)} · ${esc(f.ratio)} · ${esc(f.flour)}${f.startTempF ? ' · ' + f.startTempF + '°F' : ''}</div>`;
  if (p) {
    out += `<div class="hero-lbl">Ready at</div><div class="hero-num mono">${fmtTime(t0 + p.peak * 3.6e6)}</div>
      <div class="hero-sub mono">likely ${fmtClock(t0 + p.peakRange[0] * 3.6e6)}–${fmtTime(t0 + p.peakRange[1] * 3.6e6)} · doubles ≈ ${fmtTime(t0 + p.t2x * 3.6e6)}</div>`;
  } else {
    out += `<div class="hero-lbl">Fed at</div><div class="hero-num mono">${fmtTime(f.start)}</div><div class="hero-sub">No past ${esc(f.ratio)} runs to predict from yet. Your readings today become the first.</div>`;
  }
  out += `</section>`;
  out += `<section class="card">
    <div class="row-between"><div class="lbl">Log jar height</div><span class="mono muted">start line ${f.startMm} mm</span></div>
    ${stepper('mm', curMm, ' mm', `${r1(curMm / f.startMm)}× rise`)}
    <button class="btn primary big-btn" data-act="reading-save">Save reading · ${fmtTime(new Date())}</button>
    <div class="muted small">No ruler handy?</div>
    <div class="grid2"><button class="btn outline" data-act="doubled">${f.doubledAt ? 'Doubled ✓ ' + fmtClock(f.doubledAt) : 'Doubled'}</button><button class="btn" data-act="not-yet">Not yet</button></div>
  </section>`;
  const xMax = Math.max(6, Math.ceil((series ? Math.max(...series.ts) : 0) + 1), p ? Math.ceil(p.peak + 1.5) : 0);
  const yMax = Math.max(2.5, ...(series ? series.Rs.map((r) => r + 1.2) : [0]));
  out += `<section class="card chart-card"><div class="row-between"><div class="lbl">Today’s rise</div><div class="legend"><span>● reading</span><span class="accent">— predicted</span></div></div>
    ${chart({
      label: 'Starter rise today with predicted curve',
      xMax, yMin: 1, yMax,
      yTicks: [1, 1.5, 2, 2.5, 3, 3.5, 4].filter((v) => v <= yMax).map((v) => ({ v, label: v + '×' })),
      xTicks: hourTicks(f.start, xMax),
      band: p ? (t) => p.band(t).map((v) => v + 1) : null,
      curve: p ? (t) => p.curve(t) + 1 : null,
      vlines: [{ x: (Date.now() - t0) / 3.6e6, label: 'now' }, p ? { x: p.peak, label: 'peak', color: 'var(--accent)' } : {}],
      points: series ? series.ts.map((t, i) => [t, series.Rs[i] + 1]) : [],
    })}
    <div class="muted small">${p ? `Shaded = likely range from ${p.runs} past ${esc(f.ratio)} feed${p.runs > 1 ? 's' : ''}. Each reading narrows it.` : 'Readings only — no prediction yet.'}</div></section>`;
  if (f.readings.length) {
    out += `<section class="card list"><div class="lbl">Readings</div>
      ${f.readings.map((r, i) => `<div class="li"><span class="mono">${fmtTime(r.t)}</span><span class="mono">${r.mm} mm · ${r1(r.mm / f.startMm)}×</span><button class="x" data-act="reading-del" data-i="${i}" aria-label="Delete reading">×</button></div>`).join('')}</section>`;
  }
  out += `<button class="btn outline" data-act="feed-end">Done with this feed</button>`;
  return out;
}

export function starterHistory() {
  const runs = S.d.feeds.filter((f) => f.startMm && f.readings.length >= 3);
  const colors = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)', 'var(--series-5)', 'var(--series-6)'];
  let pooled = { baranyi: 0, gompertz: 0, logistic: 0 };
  const rows = runs.map((f, i) => {
    const s = feedSeries(f);
    const fits = fitAll(s.ts, s.Rs);
    fits.forEach((x) => (pooled[x.model] += x.rss));
    return { f, s, fits, color: colors[i % colors.length] };
  });
  const xMax = Math.max(6, ...rows.map((r) => Math.ceil(Math.max(...r.s.ts) + 1)));
  const yMax = Math.max(2.5, ...rows.map((r) => Math.max(...r.s.Rs) + 1.3));
  const ranked = Object.entries(pooled).sort((a, b) => a[1] - b[1]);
  let out = backLink('#/starter', 'Starter') + header('Every feed with jar readings', 'Rise History');
  out += `<section class="card chart-card"><div class="legend wrap">${rows.map((r) => `<span><i style="background:${r.color}"></i>${fmtDate(r.f.start)} · ${esc(r.f.ratio)}</span>`).join('')}</div>
    ${chart({
      label: 'All fitted starter runs', xMax, yMin: 1, yMax,
      yTicks: [1, 2, 3, 4].filter((v) => v <= yMax).map((v) => ({ v, label: v + '×' })),
      xTicks: Array.from({ length: Math.floor(xMax / 2) + 1 }, (_, i) => ({ v: i * 2, label: i * 2 + ' h' })),
      lines: rows.map((r) => ({ fn: (t) => MODELS.baranyi(t, r.fits[0].params) + 1, color: r.color, width: 2, x1: Math.max(...r.s.ts) + 1 })),
      pointGroups: rows.map((r) => ({ color: r.color, pts: r.s.ts.map((t, i) => [t, r.s.Rs[i] + 1]) })),
    })}</section>`;
  if (rows.length) {
    out += `<section class="card"><div class="lbl">Which curve fits best</div>
      <div class="tbl">${ranked.map(([m, v], i) => `<div class="tr"><span>${MODEL_LABELS[m]}${i === 0 ? ' ★' : ''}</span><span class="mono">RSS ${v.toFixed(3)}</span></div>`).join('')}</div>
      <div class="muted small">Residual error summed over ${rows.length} runs. Same number of parameters each, so lower is better. Baranyi & Roberts (1994); modified Gompertz and logistic per Zwietering et al. (1990).</div></section>`;
  }
  out += S.d.feeds.slice().sort((a, b) => ms(b.start) - ms(a.start)).map((f) => {
    const r = rows.find((x) => x.f.id === f.id);
    return `<section class="card"><div class="row-between"><b>${fmtDate(f.start, { month: 'short', day: 'numeric', year: 'numeric' })} · ${fmtTime(f.start)}</b><span class="mono muted">${esc(f.ratio)}</span></div>
      <div class="muted">${esc(f.flour)}${f.purpose ? ' · ' + esc(f.purpose) : ''}</div>
      ${r ? `<div class="tbl small">${r.fits.map((x) => `<div class="tr"><span>${MODEL_LABELS[x.model]}</span><span class="mono">R² ${x.r2.toFixed(3)}</span></div>`).join('')}</div>` : ''}
      ${f.doubledAt ? `<div class="small">Doubled by ${fmtTime(f.doubledAt)}</div>` : ''}
      ${f.note ? `<div class="small muted">${esc(f.note)}</div>` : ''}</section>`;
  }).join('');
  return out;
}

// ======================================================================
// START A BAKE
// ======================================================================
export const TEST_VARS = [
  { v: 'hyd', l: 'Hydration', unit: '%' },
  { v: 'pff', l: 'Levain %', unit: '%' },
  { v: 'yeast', l: 'Yeast', unit: 'g' },
  { v: 'water', l: 'Water temp', unit: '°F' },
  { v: 'target', l: 'Bulk target', unit: '%' },
  { v: 'none', l: 'Repeat as-is', unit: '' },
];

export function newBake() {
  const d = S.ui.draft;
  const rec = recipeById(d.recipeId);
  let out = header(`Loaf #${S.d.nextNum}`, 'Start a Bake', `<a class="text-link" href="#/today">Cancel</a>`);
  out += `<section class="card"><div class="lbl">1 · Recipe</div>
    <select class="select" data-change="draft" data-key="recipeId">${S.d.recipes.map((r) => `<option value="${r.id}" ${r.id === d.recipeId ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}</select>
    ${rec ? `<div class="muted">${statLine(rec)} · base ${rec.loaves} ${rec.loaves > 1 ? 'loaves' : 'loaf'}</div>` : ''}
    <div class="row-between"><span>Loaves</span><span class="mini-step"><button data-act="draft-num" data-key="loaves" data-d="-1" aria-label="Fewer">−</button><b class="mono">${d.loaves}</b><button data-act="draft-num" data-key="loaves" data-d="1" aria-label="More">+</button></span></div>
  </section>`;
  const tv = TEST_VARS.find((x) => x.v === d.testVar);
  out += `<section class="card"><div class="lbl">2 · What are you testing?</div>
    ${chips('draft-test', TEST_VARS, d.testVar)}
    ${d.testVar !== 'none' ? `<div class="test-row"><span>${esc(tv.l)}</span><span class="mono"><s class="muted">${esc(d.testFrom)}</s> → <input class="num-input" inputmode="decimal" data-change="draft" data-key="testTo" value="${esc(d.testTo)}">${tv.unit}</span></div>` : ''}
    <div class="muted small">Everything else stays as last time, so the result traces back to this one change.</div></section>`;
  const wt = waterTemp({ ddt: d.ddtF, room: d.roomF, flour: d.flourF, levain: d.levainF, friction: S.d.kitchen.friction });
  out += `<section class="card"><div class="lbl">3 · Conditions</div>
    <div class="grid3">${[['roomF', 'Room'], ['flourF', 'Flour'], ['ddtF', 'Target dough']].map(([k, l]) => `<label class="field"><span>${l}</span><input class="num-input wide" inputmode="numeric" data-change="draft" data-key="${k}" value="${d[k]}"></label>`).join('')}</div>
    <div class="big-line">Mix water at <b class="mono accent">${d.testVar === 'water' && d.testTo ? esc(d.testTo) : wt}°F</b></div></section>`;
  const p = d.preview;
  out += `<section class="card"><div class="lbl">4 · Levain &amp; schedule</div>
    <div class="field-lbl">Levain feed</div>${chips('draft-set', ['1:1:1', '1:2:2'], d.levainRatio, 'levainRatio')}
    <div class="field-lbl">Start line on the levain jar</div>${stepper('draft-num', d.startMm, ' mm', '', 'startMm')}
    ${p ? `<div class="tbl">${p.map((x) => `<div class="tr"><span>${esc(x.label)}</span><span class="mono ${x.pred ? 'accent' : 'muted'}">${x.time}</span></div>`).join('')}</div>` : ''}
    <div class="muted small">Times update live once you start: levain from its rise curve, shaping from the bulk jar.</div></section>`;
  if (d.ing) {
    const s = stats(d.ing);
    out += `<section class="card"><div class="lbl">This bake weighs out</div><div class="tbl">
      ${[['Bread flour', 'bf'], ['Whole wheat', 'ww'], ['Rye', 'rye'], ['Water', 'water'], ['Levain', 'levain'], ['Salt', 'salt'], ['Instant yeast', 'yeast']]
        .filter(([, k]) => d.ing[k]).map(([l, k]) => `<div class="tr"><span>${l}</span><span class="mono">${r1(d.ing[k])} g</span></div>`).join('')}
      </div>${s ? `<div class="muted small">${r1(s.hydration)}% hydration · ${r1(s.pff)}% levain flour · ${r1(s.salt)}% salt</div>` : ''}</section>`;
  }
  out += `<div class="sticky-cta"><button class="btn primary big-btn" data-act="bake-start">Start bake · feed levain now</button></div>`;
  return out;
}

// ======================================================================
// BAKE LOG (kitchen mode)
// ======================================================================
export function bake() {
  const b = activeBake();
  if (!b) {
    return header('No bake running', 'Bake Log') + `<section class="card"><div class="big-line">Start one when the levain is fed.</div>
      <a class="btn primary big-btn" href="#/new">Start a bake</a></section>
      <section class="card list"><div class="lbl">Recent</div>${bakesSorted().slice(0, 5).map((x) => `<a class="li" href="#/loaf/${x.id}"><span>#${esc(x.num)} · ${esc(x.name)}</span><span class="chev">›</span></a>`).join('')}</section>`;
  }
  let out = header(`Loaf #${esc(b.num)} · ${esc(b.name)}`, 'Bake Log');
  out += bakingNow(b, true);
  const info = bulkInfo(b);
  const pct = info.series ? Math.round(info.series.Rs[info.series.Rs.length - 1] * 100) : null;
  out += `<div class="grid2">
    <a class="dcard" href="#/bulk"><div class="lbl">Bulk rise</div><div class="huge mono">${info.started ? (pct != null ? '+' + pct + '%' : '—') : 'not yet'}</div><div class="small accent">${info.started ? 'log jar ›' : 'starts at mix'}</div></a>
    <div class="dcard"><div class="lbl">Water / room</div><div class="huge mono">${b.conditions?.waterF ?? '—'}°</div><div class="small muted">room ${b.conditions?.roomF ?? '—'}°F</div></div></div>`;
  const prev = b.recipeId ? bakesSorted().find((x) => x.id !== b.id && x.recipeId === b.recipeId && x.result?.text) : null;
  if (prev) out += `<section class="lesson"><b>Last time (#${esc(prev.num)}):</b> ${esc(prev.result.text)}</section>`;
  if (b.testing) out += `<section class="dcard"><div class="lbl">Testing</div><div>${esc(b.testing.label)}: <s>${esc(b.testing.from)}</s> → <b>${esc(b.testing.to)}</b></div></section>`;
  // timeline: steps + notes merged by time
  const items = [];
  b.steps.forEach((s, i) => items.push({ t: s.doneAt ? ms(s.doneAt) : Infinity, i, s, kind: 'step' }));
  (b.notes || []).forEach((n) => items.push({ t: ms(n.t), n, kind: 'note' }));
  items.sort((a, c) => a.t - c.t || (a.i ?? 0) - (c.i ?? 0));
  const cur = currentStepIdx(b);
  const proj = projectedTimes(b);
  out += `<section class="dcard tl">${items.map((x) => {
    if (x.kind === 'note') {
      const n = x.n;
      const body = n.kind === 'photo' ? `<img class="tl-img" data-blob="${n.blob}" alt="Bake photo">` : n.kind === 'voice' ? `<audio controls data-blob="${n.blob}"></audio>` : `<i>“${esc(n.text)}”</i>`;
      return `<div class="tl-row note"><span>${n.kind === 'voice' ? ICON.mic(16) : n.kind === 'photo' ? ICON.camera(16) : ICON.note(16)}</span><span>${body}</span><span class="mono small">${fmtClock(n.t)}</span></div>`;
    }
    const s = x.s;
    const state = s.doneAt ? 'done' : x.i === cur ? 'cur' : 'todo';
    const due = !s.doneAt ? proj[x.i] : null;
    return `<div class="tl-row ${state}"><span class="dot">${state === 'done' ? ICON.check(18) : ''}</span><span>${esc(s.label)}</span><span class="mono small">${s.doneAt ? fmtClock(s.doneAt) : due ? '≈ ' + fmtClock(due) : ''}</span></div>`;
  }).join('')}</section>`;
  const k = S.d.kitchen, o = b.oven;
  out += `<section class="dcard list"><div class="row-between"><div class="lbl">Oven plan</div><a class="small" href="#/kitchen">Equipment ›</a></div>
    <div class="li"><span>Preheat Dutch oven</span><span class="mono">${o.tempF}°F · ${o.preheatMin} min</span></div>
    <div class="li"><span>Lid on · then off</span><span class="mono">${o.lidOnMin} + ${o.lidOffMin} min</span></div>
    <div class="li"><span>Steam</span><span>${esc(k.steam || '—')}</span></div>
    <div class="li"><span>Tray under Dutch oven</span><span>${k.trayUnder ? 'Yes' : 'No'}</span></div>
    <div class="li"><span>Pull at internal</span><span class="mono">${esc(o.pullAt)}</span></div></section>`;
  out += `<div class="grid2"><button class="btn ghost" data-act="step-undo">Undo last step</button><button class="btn ghost" data-act="finish-bake">Finish bake</button></div>
    ${S.ui.confirmCancel ? `<button class="btn danger" data-act="cancel-bake-yes">Tap again to discard this bake</button>` : `<button class="text-btn muted" data-act="cancel-bake">Discard bake</button>`}`;
  return out;
}

// ======================================================================
// BULK
// ======================================================================
export const BULK_TAGS = ['Domed top', 'Bubbles on the sides', 'Jiggles', 'Slack / sticky', 'Poke springs back slowly'];
export function bulk() {
  const b = activeBake();
  if (!b) return header('No bake running', 'Bulk Rise') + `<section class="card"><a class="btn primary" href="#/new">Start a bake</a></section>`;
  const info = bulkInfo(b);
  let out = header(`Loaf #${esc(b.num)}${info.started ? ' · bulk from ' + fmtTime(info.start) : ''}`, 'Bulk Rise', `<a class="text-link" href="#/bake">Log ›</a>`);
  if (!info.started) return out + `<section class="card"><div class="big-line">Bulk starts when you tap Done on “Mix”.</div><div class="muted">Right after mixing, put ~50 g of dough in a small straight-sided jar and mark the line.</div></section>`;
  const p = info.pred;
  const t0 = ms(info.start);
  const pct = info.series ? Math.round(info.series.Rs[info.series.Rs.length - 1] * 100) : 0;
  out += `<section class="hero"><div class="hero-sub">Aliquot jar · now <b class="mono">+${pct}%</b></div><div class="hero-lbl">Shape at +${b.bulk.target}%</div>`;
  if (p && p.ready && p.tTarget != null) out += `<div class="hero-num mono">≈ ${fmtTime(t0 + p.tTarget * 3.6e6)}</div><div class="hero-sub mono">likely ${fmtClock(t0 + p.range[0] * 3.6e6)}–${fmtTime(t0 + p.range[1] * 3.6e6)}</div>`;
  else out += `<div class="hero-num mono">—</div><div class="hero-sub">${!info.series ? 'Mark the start line first.' : `Log ${p.need} more reading${p.need > 1 ? 's' : ''} to predict.`}</div>`;
  out += `</section>`;
  const mmKey = b.bulk.startMm ? 'bulkMm' : 'bulkStart';
  const last = b.bulk.readings[b.bulk.readings.length - 1];
  const cur = S.ui.bmm ?? (last ? last.mm : b.bulk.startMm || 40);
  out += `<section class="card"><div class="row-between"><div class="lbl">${b.bulk.startMm ? 'Log aliquot height' : 'Mark the start line'}</div>${b.bulk.startMm ? `<span class="mono muted">start ${b.bulk.startMm} mm</span>` : ''}</div>
    ${stepper('bmm', cur, ' mm', b.bulk.startMm ? `+${Math.round((cur / b.bulk.startMm - 1) * 100)}%` : '')}
    <button class="btn primary big-btn" data-act="${mmKey === 'bulkStart' ? 'bulk-start' : 'bulk-save'}">${b.bulk.startMm ? 'Save reading' : 'Set start line'}</button>
    <div class="muted small">How does the main dough look?</div>${chips('bulk-tag', BULK_TAGS, b.bulk.tags)}</section>`;
  if (info.series) {
    const xMax = Math.max(5, Math.ceil((p?.ready && p.tTarget ? p.tTarget : 0) + 1), Math.ceil(Math.max(...info.series.ts) + 1));
    out += `<section class="card chart-card"><div class="lbl">Dough rise</div>${chart({
      label: 'Bulk rise percent over time', xMax, yMin: 0, yMax: 100,
      yTicks: [0, 25, 50, 75, 100].map((v) => ({ v, label: v + '%' })), xTicks: hourTicks(info.start, xMax),
      hband: { y0: b.bulk.target - 10, y1: b.bulk.target + 15, label: 'shape window' }, hline: { y: b.bulk.target },
      curve: p?.ready ? (t) => p.curve(t) * 100 : null,
      vlines: [{ x: (Date.now() - t0) / 3.6e6, label: 'now' }],
      points: info.series.ts.map((t, i) => [t, info.series.Rs[i] * 100]),
    })}</section>`;
  }
  out += `<section class="card"><div class="row-between"><div class="lbl">Target</div><span class="mini-step"><button data-act="bulk-target" data-d="-5" aria-label="Lower target">−</button><b class="mono warm-ink">+${b.bulk.target}%</b><button data-act="bulk-target" data-d="5" aria-label="Raise target">+</button></span></div>
    <div class="muted small">A starting point. Ratings nudge it per recipe: over-proofed results lower it, dense ones raise it.</div></section>`;
  return out;
}

// ======================================================================
// RATE
// ======================================================================
export const RATE_GROUPS = [
  ['Shape', ['Tall', 'Good oven spring', 'Flat', 'Spread', 'Good ear']],
  ['Crumb', ['Open', 'Even', 'Tight / uneven', 'Gummy']],
  ['Crust', ['Crisp', 'Thick', 'Pale', 'Bottom burnt']],
  ['Flavor', ['Mild', 'Good flavor', 'Too sour']],
  ['Dough felt', ['Sticky', 'Slack', 'Strong', 'Dry']],
];
export function rateHint(b) {
  const t = b.result.tags || [];
  const rec = b.recipeId ? recipeById(b.recipeId) : null;
  if (!rec) return null;
  if (t.includes('Flat') && (t.includes('Sticky') || t.includes('Slack') || t.includes('Spread'))) return { msg: 'Flat + sticky or slack dough usually points to over-fermentation.', delta: -10, rec };
  if ((t.includes('Gummy') || t.includes('Tight / uneven')) && !t.includes('Sticky') && !t.includes('Flat')) return { msg: 'Tight or gummy crumb with firm dough often means under-fermented.', delta: 10, rec };
  return null;
}
export function rate(id) {
  const b = bakeById(id);
  if (!b) return header('', 'Not found');
  const r = b.result;
  let out = header(`Loaf #${esc(b.num)} · ${b.date ? 'baked ' + fmtDate(b.date) : ''}`, 'How’d It Turn Out?', `<a class="text-link" href="#/today">Later</a>`);
  out += `<div class="grid2">${['Loaf', 'Crumb'].map((l, i) => `<label class="shot">${r.photos[i] ? `<img class="img" data-blob="${r.photos[i]}" alt="${l} photo">` : `${ICON.camera(24)}<span>${l} photo</span>`}<input type="file" accept="image/*" capture="environment" data-change="rate-photo" data-i="${i}" data-id="${b.id}" hidden></label>`).join('')}</div>`;
  out += `<section class="card"><div class="row-between"><div class="lbl">Overall</div><b class="mono big-num">${r.score ?? '—'} / 10</b></div>
    <div class="score-grid">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<button class="score${r.score === n ? ' on' : ''}" data-act="score" data-id="${b.id}" data-v="${n}" aria-label="Rate ${n} of 10">${n}</button>`).join('')}</div></section>`;
  out += `<section class="card"><div class="lbl">Quick tags</div>${RATE_GROUPS.map(([g, tags]) => `<div class="field-lbl">${g}</div>${chips('rate-tag', tags, r.tags, b.id)}`).join('')}</section>`;
  out += `<section class="card"><div class="lbl">Anything else?</div><textarea class="ta" data-change="rate-text" data-id="${b.id}" rows="3" placeholder="What would you change next time?">${esc(r.text || '')}</textarea></section>`;
  const h = rateHint(b);
  if (h) {
    const rec = h.rec;
    out += `<section class="tip"><div><b>${esc(h.msg)}</b> Next time ${esc(rec.name)}’s bulk target goes from <span class="mono">+${rec.bulkTarget}%</span> to <span class="mono accent">+${rec.bulkTarget + h.delta}%</span>.</div>
      ${S.d.appliedHints?.includes(b.id) ? '<div class="small">Applied ✓</div>' : `<button class="btn outline" data-act="apply-hint" data-id="${b.id}">Apply</button>`}</section>`;
  }
  out += `<div class="sticky-cta"><button class="btn primary big-btn" data-act="rate-save" data-id="${b.id}">Save to Loaves</button></div>`;
  return out;
}

// ======================================================================
// LOAVES
// ======================================================================
export function loaves() {
  const f = S.ui.loafFilter || 'All';
  let list = bakesSorted();
  if (f === 'Rated') list = list.filter((b) => b.result?.score != null);
  if (f === 'Needs rating') list = list.filter((b) => b.result?.score == null);
  if (f === 'Best') list = list.filter((b) => b.best || (b.result?.score ?? 0) >= 8);
  const rated = S.d.bakes.filter((b) => b.result?.score != null).length;
  let out = header(`${S.d.bakes.length} entries · ${rated} rated`, 'Loaves');
  out += chips('loaf-filter', ['All', 'Rated', 'Needs rating', 'Best'], f);
  out += `<div class="wall">${list.map((b) => {
    const badge = b.best ? ['★ Best', 'b-best'] : b.result?.score != null ? [b.result.score + '/10', 'b-dark'] : b.status === 'active' ? ['Baking', 'b-blue'] : ['Rate it', 'b-rate'];
    return `<a class="tile" href="#/loaf/${b.id}">
      <div class="tile-img${b.best ? ' best' : ''}">${b.result?.photos?.[0] ? `<img class="img" data-blob="${b.result.photos[0]}" alt="Loaf ${esc(b.num)}">` : '<span>[photo]</span>'}<span class="badge ${badge[1]}">${badge[0]}</span></div>
      <div class="tile-body"><div class="row-between"><b class="mono">#${esc(b.num)}</b><span class="mono small muted">${b.date ? fmtDate(b.date, { month: 'numeric', day: 'numeric' }) : '—'}</span></div><div class="small ellipsis">${esc(b.name)}</div></div></a>`;
  }).join('')}</div>`;
  return out;
}

export function loaf(id) {
  const b = bakeById(id);
  if (!b) return backLink('#/loaves', 'Loaves') + header('', 'Not found');
  const s = stats(b.ing);
  const best = bestBake(b.id);
  const bs = best ? stats(best.ing) : null;
  let out = backLink('#/loaves', 'Loaves') + header(`Loaf #${esc(b.num)} · ${b.date ? fmtDate(b.date, { month: 'short', day: 'numeric', year: 'numeric' }) : 'date not recorded'}`, esc(b.name));
  out += `<div class="grid2">${[0, 1].map((i) => photoTile(b.result?.photos?.[i], i ? '[Crumb photo]' : '[Loaf photo]', 'ph tall')).join('')}</div>`;
  const r = b.result || {};
  out += `<section class="card"><div class="row-between"><div class="lbl">Result</div><a class="btn small-btn" href="#/rate/${b.id}">${r.score != null ? r.score + ' / 10 · edit' : 'Rate it'}</a></div>
    ${b.testing ? `<div class="test-row"><span>Tested: ${esc(b.testing.label)}</span><span class="mono"><s class="muted">${esc(b.testing.from)}</s> → ${esc(b.testing.to)}</span></div>` : ''}
    ${r.tags?.length ? `<div class="chips static">${r.tags.map((t) => `<span class="chip">${esc(t)}</span>`).join('')}</div>` : ''}
    ${r.text ? `<p class="quote">${esc(r.text)}</p>` : ''}</section>`;
  if (s) {
    const row = (l, a, c, unit = '%', flag = false) => `<div class="tr3"><span>${l}</span><span class="mono${flag ? ' warm-ink b' : ''}">${a}</span>${best ? `<span class="mono">${c}</span>` : ''}</div>`;
    const diff = (a, c, tol) => bs && Math.abs(a - c) > tol;
    out += `<section class="card"><div class="row-between"><div class="lbl">${best ? 'Compare' : 'Numbers'}</div>${best ? `<span class="small">vs #${esc(best.num)} ${best.best ? '(best so far)' : ''}</span>` : ''}</div>
      <div class="tbl3"><div class="tr3 head"><span></span><span>#${esc(b.num)}</span>${best ? `<span>#${esc(best.num)}</span>` : ''}</div>
      ${row('Hydration', r1(s.hydration) + '%', bs ? r1(bs.hydration) + '%' : '', '%', diff(s.hydration, bs?.hydration, 3))}
      ${row('Levain flour', r1(s.pff) + '%', bs ? r1(bs.pff) + '%' : '', '%', diff(s.pff, bs?.pff, 3))}
      ${row('Whole grain', r1(s.wholeGrain) + '%', bs ? r1(bs.wholeGrain) + '%' : '')}
      ${row('Salt', r1(s.salt) + '%', bs ? r1(bs.salt) + '%' : '')}
      ${row('Instant yeast', s.yeast ? s.yeast + ' g' : 'none', bs ? (bs.yeast ? bs.yeast + ' g' : 'none') : '', '', bs && !!s.yeast !== !!bs.yeast)}
      ${row('Mix water', b.conditions?.waterF ? b.conditions.waterF + '°F' : '—', best?.conditions?.waterF ? best.conditions.waterF + '°F' : '—')}
      </div><div class="muted small">Levain counted at its hydration, so its flour and water are in the totals.</div></section>`;
  }
  if (b.process?.length) out += `<section class="card"><div class="lbl">Process (from notebook)</div><ol class="proc">${b.process.map((p) => `<li>${esc(p)}</li>`).join('')}</ol></section>`;
  if (b.steps?.length) {
    out += `<section class="card list"><div class="lbl">Log</div>${b.steps.filter((x) => x.doneAt).map((x) => `<div class="li"><span>${esc(x.label)}</span><span class="mono muted">${fmtTime(x.doneAt)}</span></div>`).join('')}
      ${(b.notes || []).map((n) => `<div class="li note-li"><span>${n.kind === 'photo' ? `<img class="tl-img" data-blob="${n.blob}" alt="Photo">` : n.kind === 'voice' ? `<audio controls data-blob="${n.blob}"></audio>` : '“' + esc(n.text) + '”'}</span><span class="mono muted">${fmtClock(n.t)}</span></div>`).join('')}</section>`;
  }
  if (b.ing && Object.keys(b.ing).length) {
    out += `<section class="card"><div class="lbl">Ingredients</div><div class="tbl">${[['Bread flour', 'bf'], ['Whole wheat', 'ww'], ['Rye', 'rye'], ['Water', 'water'], ['Levain', 'levain'], ['Salt', 'salt'], ['Instant yeast', 'yeast']]
      .filter(([, k]) => b.ing[k]).map(([l, k]) => `<div class="tr"><span>${l}</span><span class="mono">${b.ing[k]} g</span></div>`).join('')}</div></section>`;
  }
  out += `<a class="btn primary big-btn" href="#/new?${b.recipeId ? 'recipe=' + b.recipeId : 'from=' + b.id}">Bake again, change one thing</a>`;
  out += b.best ? `<button class="text-btn" data-act="toggle-best" data-id="${b.id}">Unmark as best</button>` : `<button class="text-btn" data-act="toggle-best" data-id="${b.id}">Mark as best loaf</button>`;
  return out;
}

// ======================================================================
// RECIPES + CALCULATOR
// ======================================================================
export function recipes() {
  let out = header(`${S.d.recipes.length} recipes`, 'Recipes', `<a class="btn small-btn primary" href="#/recipe/new">+ Add</a>`);
  out += `<a class="card row-card" href="#/calc">${ICON.calc(22)}<div class="grow"><div class="t">Calculator</div><div class="s">Baker’s percentages · water temp</div></div><span class="chev">›</span></a>`;
  out += S.d.recipes.map((r) => {
    const baked = S.d.bakes.filter((b) => b.recipeId === r.id);
    const lastB = baked.sort((a, b) => parseInt(b.num) - parseInt(a.num))[0];
    const s = stats(r.ing);
    return `<a class="card recipe" href="#/recipe/${r.id}"><div class="row-between"><b>${esc(r.name)}</b><span class="mono b">${s ? r1(s.hydration) + '%' : '—'}</span></div>
      <div class="small muted">${r.private ? 'Private · ' : ''}${esc(r.source)} · baked ${baked.length}×</div>
      ${lastB ? `<div class="small">#${esc(lastB.num)} — ${esc((lastB.result?.text || '').slice(0, 70))}${(lastB.result?.text || '').length > 70 ? '…' : ''}</div>` : ''}</a>`;
  }).join('');
  return out;
}

const ING_FIELDS = [['bf', 'Bread flour'], ['ww', 'Whole wheat'], ['rye', 'Rye'], ['water', 'Water'], ['levain', 'Levain'], ['levainHyd', 'Levain hydration %'], ['salt', 'Salt'], ['yeast', 'Instant yeast']];
export function recipe(id) {
  const r = id === 'new' ? S.ui.newRecipe : recipeById(id);
  if (!r) return backLink('#/recipes', 'Recipes') + header('', 'Not found');
  const s = stats(r.ing);
  let out = backLink('#/recipes', 'Recipes') + header(r.private ? 'Private recipe' : esc(r.source || ''), id === 'new' ? 'New Recipe' : esc(r.name));
  out += `<section class="card"><label class="field"><span>Name</span><input data-change="recipe-field" data-id="${r.id}" data-key="name" value="${esc(r.name)}"></label>
    <label class="field"><span>Source</span><input data-change="recipe-field" data-id="${r.id}" data-key="source" value="${esc(r.source || '')}"></label>
    <label class="toggle"><span>Private (from a book)</span><input type="checkbox" data-change="recipe-field" data-id="${r.id}" data-key="private" ${r.private ? 'checked' : ''}></label>
    <label class="field"><span>Base loaves</span><input class="num-input wide" inputmode="numeric" data-change="recipe-field" data-id="${r.id}" data-key="loaves" value="${r.loaves}"></label></section>`;
  out += `<section class="card"><div class="lbl">Ingredients (g)</div><div class="ing-grid">${ING_FIELDS.map(([k, l]) => `<label class="field"><span>${l}</span><input class="num-input wide" inputmode="decimal" data-change="recipe-ing" data-id="${r.id}" data-key="${k}" value="${r.ing[k] ?? ''}" placeholder="${k === 'levainHyd' ? '100' : '0'}"></label>`).join('')}</div>
    ${s ? `<div class="muted small">${r1(s.hydration)}% hydration · ${r1(s.pff)}% levain flour · ${r1(s.salt)}% salt · ${r1(s.dough)} g dough</div>` : ''}</section>`;
  out += `<section class="card"><div class="lbl">Process</div>
    <label class="field"><span>Fold intervals (min, comma-separated)</span><input data-change="recipe-folds" data-id="${r.id}" value="${(r.folds || []).join(', ')}"></label>
    <div class="row-between"><span>Bulk target</span><span class="mini-step"><button data-act="recipe-target" data-id="${r.id}" data-d="-5" aria-label="Lower">−</button><b class="mono">+${r.bulkTarget}%</b><button data-act="recipe-target" data-id="${r.id}" data-d="5" aria-label="Raise">+</button></span></div>
    <textarea class="ta" rows="4" data-change="recipe-field" data-id="${r.id}" data-key="notes" placeholder="Notes">${esc(r.notes || '')}</textarea></section>`;
  if (id === 'new') out += `<button class="btn primary big-btn" data-act="recipe-create">Save recipe</button>`;
  else out += `<a class="btn primary big-btn" href="#/new?recipe=${r.id}">Start a bake with this</a><a class="btn outline" href="#/calc?recipe=${r.id}">Open in calculator</a>
    ${S.ui.confirmDel === r.id ? `<button class="btn danger" data-act="recipe-del-yes" data-id="${r.id}">Tap again to delete</button>` : `<button class="text-btn muted" data-act="recipe-del" data-id="${r.id}">Delete recipe</button>`}`;
  return out;
}

export function calc() {
  const c = S.ui.calc;
  const f = fromTargets(c);
  const wt = waterTemp({ ddt: c.ddt, room: c.room, flour: c.flourT, levain: c.levT, friction: S.d.kitchen.friction });
  const row = (l, k, v, unit, step) => `<div class="li"><div><b>${l}</b>${v.sub ? `<div class="small muted">${v.sub}</div>` : ''}</div><span class="mini-step big"><button data-act="calc" data-key="${k}" data-d="${-step}" aria-label="Decrease ${l}">−</button><b class="mono">${v.val}${unit}</b><button data-act="calc" data-key="${k}" data-d="${step}" aria-label="Increase ${l}">+</button></span></div>`;
  let out = backLink('#/recipes', 'Recipes') + header('Baker’s percentages', 'Calculator');
  out += `<section class="card list">
    ${row('Total dough', 'dough', { val: c.dough, sub: `${c.loaves || Math.round(c.dough / 900)} loaves ≈ 900 g each` }, ' g', 100)}
    ${row('Hydration', 'hyd', { val: c.hyd, sub: 'incl. levain water' }, '%', 1)}
    ${row('Levain', 'levPct', { val: c.levPct, sub: '100% hydration' }, '%', 2)}
    ${row('Salt', 'saltPct', { val: c.saltPct }, '%', 0.1)}
    <div class="li"><div><b>Flour blend</b><div class="small muted">BF / WW / Rye %</div></div><span class="blend">${['bf', 'ww', 'rye'].map((k) => `<input class="num-input" inputmode="numeric" data-change="calc-blend" data-key="${k}" value="${c.blend[k]}" aria-label="${k} percent">`).join('/')}</span></div></section>`;
  const sum = c.blend.bf + c.blend.ww + c.blend.rye;
  out += `<section class="dark-card"><div class="lbl">Weigh out</div><div class="tbl">
    ${[['Bread flour', 'bf'], ['Whole wheat', 'ww'], ['Rye', 'rye'], ['Water', 'water'], ['Levain', 'levain'], ['Salt', 'salt']].map(([l, k]) => `<div class="tr"><span>${l}</span><span class="mono b">${f[k]} g</span></div>`).join('')}</div>
    <div class="small">Total flour ${f.totalFlour} g. Levain flour counted as 50/50 BF/WW and taken out of the final mix.${sum !== 100 ? ` <b class="warm-ink">Blend adds to ${sum}%, not 100%.</b>` : ''}</div></section>`;
  out += `<section class="card"><div class="lbl">Water temp for ${c.ddt}°F dough</div><div class="huge mono accent">${wt}°F</div>
    <div class="grid3">${[['ddt', 'Target'], ['room', 'Room'], ['flourT', 'Flour'], ['levT', 'Levain']].map(([k, l]) => `<label class="field"><span>${l}</span><input class="num-input wide" inputmode="numeric" data-change="calc-num" data-key="${k}" value="${c[k]}"></label>`).join('')}</div>
    <div class="muted small">4 × target − room − flour − levain − friction (${S.d.kitchen.friction}°F, set in Kitchen).</div></section>`;
  out += `<button class="btn outline" data-act="calc-save">Save as a recipe</button>`;
  return out;
}

// ======================================================================
// KITCHEN SETUP
// ======================================================================
export function kitchen() {
  const k = S.d.kitchen;
  const txt = (key, l) => `<label class="li"><span>${l}</span><input class="inline-input" data-change="kitchen" data-key="${key}" value="${esc(k[key] ?? '')}" placeholder="add"></label>`;
  const tog = (key, l) => `<label class="li"><span>${l}</span><input type="checkbox" class="ck" data-change="kitchen-bool" data-key="${key}" ${k[key] ? 'checked' : ''}></label>`;
  const num = (key, l, unit) => `<label class="li"><span>${l}</span><span><input class="num-input" inputmode="numeric" data-change="kitchen-num" data-key="${key}" value="${k[key]}">${unit}</span></label>`;
  let out = header('Set once · every bake inherits', 'Kitchen', `<a class="text-link" href="#/today">Done</a>`);
  out += `<section class="card list"><div class="lbl">Vessels</div>${txt('dutchOven', 'Dutch oven')}${txt('banneton', 'Banneton')}${txt('backupBowl', 'Backup bowl')}${txt('starterJar', 'Starter jar')}</section>`;
  out += `<section class="card list"><div class="lbl">Oven</div>${txt('ovenOffset', 'Thermostat offset')}${tog('trayUnder', 'Tray under Dutch oven')}${tog('heatShield', 'Bottom heat shield')}${txt('steam', 'Steam method')}</section>`;
  out += `<section class="card list"><div class="lbl">Warm spots</div>${txt('warmSpot', 'Use')}${txt('avoidSpot', 'Avoid')}${num('roomF', 'Usual room temp', '°F')}</section>`;
  out += `<section class="card list"><div class="lbl">Ingredients &amp; tools</div>${txt('breadFlour', 'Bread flour')}${txt('water', 'Water')}${tog('probe', 'Probe thermometer')}${tog('mixer', 'Stand mixer')}${num('friction', 'Mixing friction', '°F')}</section>`;
  out += `<section class="card list"><div class="lbl">App</div>${tog('keepAwake', 'Keep screen awake during bakes')}${tog('chime', 'Chime when a step is due')}</section>`;
  out += `<section class="card"><div class="lbl">Backup</div>
    <div class="muted small">Everything lives on this phone. Export a backup now and then (saves to Files) — it includes photos and voice notes.</div>
    <div class="grid2"><button class="btn outline" data-act="export">Export backup</button><label class="btn outline">Import backup<input type="file" accept="application/json,.json" data-change="import" hidden></label></div>
    ${S.ui.confirmReset ? `<button class="btn danger" data-act="reset-yes">Tap again: erase everything and reload notebook data</button>` : `<button class="text-btn muted" data-act="reset">Reset to notebook data</button>`}
  </section>`;
  out += `<div class="muted small center">Sourdough Buddy v1 · data stays on this phone</div>`;
  return out;
}
