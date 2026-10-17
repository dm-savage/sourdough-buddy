// App state + derived values shared by every screen.
import { getState, putState } from './db.js';
import { SEED } from './seed.js';
import { toSeries, predictStarter, predictBulk } from './fit.js';
import { ms } from './ui.js';

export const S = { d: null, ui: {} };

let timer;
export function save() {
  clearTimeout(timer);
  timer = setTimeout(() => putState(S.d), 120);
}
export async function saveNow() {
  clearTimeout(timer);
  await putState(S.d);
}

// Bump SCHEMA when the shape of saved data changes, and add a step to migrate()
// so data already on the phone is upgraded instead of lost.
export const SCHEMA = 2;
export function migrate(d) {
  if ((d.v || 1) < 2) {
    // v2: readings carry a temperature; bakes may have editable notes
    for (const f of d.feeds || []) for (const r of f.readings || []) if (!('tempF' in r)) r.tempF = null;
    for (const b of d.bakes || []) if (b.bulk) for (const r of b.bulk.readings || []) if (!('tempF' in r)) r.tempF = null;
    d.v = 2;
  }
  return d;
}

export async function loadState() {
  let d = await getState();
  if (!d) d = structuredClone(SEED);
  const before = d.v;
  d = migrate(d);
  if (before !== d.v || !(await getState())) await putState(d);
  S.d = d;
}

export const bakeById = (id) => S.d.bakes.find((b) => b.id === id);
export const recipeById = (id) => S.d.recipes.find((r) => r.id === id);
export const feedById = (id) => S.d.feeds.find((f) => f.id === id);
export const activeBake = () => (S.d.activeBakeId ? bakeById(S.d.activeBakeId) : null);

// A feed counts as "active" for 14 hours unless ended.
export function activeFeed() {
  const f = S.d.activeFeedId ? feedById(S.d.activeFeedId) : null;
  if (!f || f.endedAt) return null;
  if (Date.now() - ms(f.start) > 14 * 3.6e6) return null;
  return f;
}
export const lastFeed = () => S.d.feeds.slice().sort((a, b) => ms(b.start) - ms(a.start))[0];

export function feedSeries(f) {
  if (!f || !f.startMm) return null;
  return toSeries(f.start, f.startMm, f.readings || []);
}

// Past feeds that can teach the model: same ratio, a start height and 3+ readings.
export function trainingFeeds(ratio, excludeId) {
  return S.d.feeds.filter((x) => x.id !== excludeId && x.ratio === ratio && x.startMm && (x.readings || []).length >= 3);
}

export function starterPrediction(f) {
  const past = trainingFeeds(f.ratio, f.id).map(feedSeries);
  const cur = feedSeries(f) || { ts: [0], Rs: [0] };
  return predictStarter(past, cur);
}

export function bulkInfo(b) {
  const mix = (b.steps || []).find((s) => s.key === 'mix');
  if (!mix || !mix.doneAt) return { started: false };
  const start = mix.doneAt;
  if (!b.bulk.startMm) return { started: true, start, series: null, pred: null };
  const series = toSeries(start, b.bulk.startMm, b.bulk.readings);
  return { started: true, start, series, pred: predictBulk(series, b.bulk.target) };
}

// ---------- bake steps ----------
// waitMin = minutes after the previous completed step when this one is due (null = no timer).
export function makeSteps({ autolyseWait = 0, folds = [30, 30, 60, 60], oven }) {
  const s = [
    { key: 'levain', label: 'Feed levain', waitMin: null },
    { key: 'autolyse', label: 'Start autolyse', waitMin: autolyseWait },
    { key: 'mix', label: 'Mix in levain + salt', waitMin: 30, hint: 'Bulk starts now — fill the aliquot jar' },
  ];
  folds.forEach((m, i) => s.push({ key: `fold${i + 1}`, label: `Fold ${i + 1} of ${folds.length}`, waitMin: m }));
  s.push(
    { key: 'shape', label: 'Shape', waitMin: null, hint: 'When the bulk jar hits target' },
    { key: 'cold', label: 'Into the fridge (cold proof)', waitMin: 15 },
    { key: 'preheat', label: `Preheat oven ${oven.tempF}°F`, waitMin: null, hint: 'Next morning, or after the proof' },
    { key: 'lidon', label: 'Load · lid on', waitMin: oven.preheatMin },
    { key: 'lidoff', label: 'Lid off', waitMin: oven.lidOnMin },
    { key: 'out', label: `Out · check internal (${oven.pullAt})`, waitMin: oven.lidOffMin },
  );
  return s.map((x) => ({ ...x, doneAt: null }));
}

export const currentStepIdx = (b) => (b.steps || []).findIndex((s) => !s.doneAt);

// When is step i due (ms), or null if it has no timer yet.
export function stepDue(b, i) {
  const s = b.steps[i];
  if (!s) return null;
  if (s.key === 'shape') {
    const info = bulkInfo(b);
    if (info.pred && info.pred.ready && info.pred.tTarget != null) return ms(info.start) + info.pred.tTarget * 3.6e6;
    return null;
  }
  if (s.waitMin == null) return null;
  const prev = b.steps.slice(0, i).reverse().find((x) => x.doneAt);
  if (!prev) return null;
  return ms(prev.doneAt) + s.waitMin * 60000;
}

// Projected time (ms) for every step: done steps use their actual time, the rest chain
// forward from the last known time. null once a step has no timer (e.g. preheat).
export function projectedTimes(b) {
  const out = [];
  let t = null;
  b.steps.forEach((s, i) => {
    if (s.doneAt) { t = ms(s.doneAt); out.push(t); return; }
    let due = null;
    if (s.key === 'shape') due = stepDue(b, i);
    else if (t != null && s.waitMin != null) due = t + s.waitMin * 60000;
    out.push(due);
    t = due == null ? null : Math.max(due, Date.now());
  });
  return out;
}

// Loaf to compare against: the one you flagged best, else the highest score.
export function bestBake(excludeId) {
  const done = S.d.bakes.filter((b) => b.id !== excludeId && b.status === 'done');
  const flagged = done.find((b) => b.best);
  if (flagged) return flagged;
  const scored = done.filter((b) => b.result && b.result.score != null).sort((a, b) => b.result.score - a.result.score);
  return scored[0] || null;
}

export const bakesSorted = () => S.d.bakes.slice().sort((a, b) => parseInt(b.num) - parseInt(a.num));
