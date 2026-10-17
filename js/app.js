// App shell: routing, rendering, and every button/input action.
import { S, save, saveNow, loadState, activeBake, activeFeed, feedById, recipeById, bakeById, bakesSorted, starterPrediction, trainingFeeds, feedSeries, makeSteps, currentStepIdx, stepDue } from './state.js';
import * as V from './views.js';
import { predictStarter } from './fit.js';
import { stats, scale, applyHydration, applyPff, fromTargets, waterTemp } from './calc.js';
import { uid, nowISO, toLocalISO, fmtTime, fmtCountdown, r1, ms } from './ui.js';
import { putBlob, getBlob, blobKeys, clearAll, askPersistent } from './db.js';
import { shareCard } from './card.js';

const main = document.getElementById('app');
const toastEl = document.getElementById('toast');
let route = '', args = [], query = {};

// ---------- routing ----------
function parseHash() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const q = Object.fromEntries(new URLSearchParams(qs || ''));
  return { r: parts[0] || 'today', a: parts.slice(1), q };
}

function onRoute() {
  const p = parseHash();
  const changed = p.r !== route || p.a.join('/') !== args.join('/') || JSON.stringify(p.q) !== JSON.stringify(query);
  route = p.r; args = p.a; query = p.q;
  if (changed) {
    S.ui.noteOpen = false; S.ui.confirmCancel = false; S.ui.confirmReset = false; S.ui.confirmDel = null;
    S.ui.mm = null; S.ui.bmm = null; S.ui.tempF = null; S.ui.btempF = null; S.ui.editStep = null; S.ui.editLoaf = false;
    if (route === 'new') initDraft(query);
    if (route === 'calc') initCalc(query);
    if (route === 'recipe' && args[0] === 'new') S.ui.newRecipe = { id: uid('r'), name: 'New recipe', source: 'Mine', private: false, loaves: 1, ing: {}, folds: [30, 30, 60, 60], bulkTarget: 60, notes: '' };
  }
  render();
  if (changed) window.scrollTo(0, 0);
}

const VIEWS = {
  today: () => V.today(),
  starter: () => (args[0] === 'history' ? V.starterHistory() : V.starter()),
  new: () => V.newBake(),
  bake: () => V.bake(),
  bulk: () => V.bulk(),
  rate: () => V.rate(args[0]),
  loaves: () => V.loaves(),
  loaf: () => V.loaf(args[0]),
  recipes: () => V.recipes(),
  recipe: () => V.recipe(args[0]),
  calc: () => V.calc(),
  kitchen: () => V.kitchen(),
  dashboard: () => V.dashboard(),
};
const TAB_FOR = { today: 'today', starter: 'starter', new: 'bake', bake: 'bake', bulk: 'bake', rate: 'loaves', loaves: 'loaves', loaf: 'loaves', recipes: 'recipes', recipe: 'recipes', calc: 'recipes', kitchen: 'today', dashboard: 'loaves' };

function render() {
  const view = VIEWS[route] || VIEWS.today;
  try {
    main.innerHTML = view();
  } catch (e) {
    console.error(e);
    main.innerHTML = `<section class="card"><b>Something broke on this screen.</b><pre class="small">${String(e && e.stack || e)}</pre><a class="btn" href="#/today">Back to Today</a></section>`;
  }
  document.body.classList.toggle('kitchen-mode', route === 'bake' && !!activeBake());
  document.body.classList.toggle('wide', route === 'dashboard');
  document.querySelectorAll('.tabbar a').forEach((a) => a.classList.toggle('on', a.dataset.tab === (TAB_FOR[route] || 'today')));
  hydrateBlobs();
  tick();
  syncWakeLock();
}

// ---------- photos / voice blobs ----------
const urlCache = new Map();
async function hydrateBlobs() {
  for (const el of main.querySelectorAll('[data-blob]')) {
    const id = el.dataset.blob;
    if (!id) continue;
    let url = urlCache.get(id);
    if (!url) {
      const b = await getBlob(id).catch(() => null);
      if (!b) continue;
      url = URL.createObjectURL(b);
      urlCache.set(id, url);
    }
    el.src = url;
  }
}

async function compressImage(file) {
  try {
    const bmp = await createImageBitmap(file);
    const max = 1600;
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    return await new Promise((res) => c.toBlob((b) => res(b || file), 'image/jpeg', 0.82));
  } catch (e) {
    return file;
  }
}
async function storeFile(file) {
  const blob = file.type.startsWith('image/') ? await compressImage(file) : file;
  const id = uid('blob');
  await putBlob(id, blob);
  return id;
}

let recorder = null, chunks = [];
async function toggleVoice() {
  const b = activeBake();
  if (!b) return;
  if (recorder) { recorder.stop(); return; }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    recorder = new MediaRecorder(stream);
    chunks = [];
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(chunks, { type: recorder.mimeType || 'audio/mp4' });
      recorder = null; S.ui.recording = false;
      const id = uid('blob');
      await putBlob(id, blob);
      b.notes.push({ id: uid('n'), t: nowISO(), kind: 'voice', blob: id });
      save(); render(); toast('Voice note saved');
    };
    recorder.start();
    S.ui.recording = true; render(); toast('Recording… tap Stop when done');
  } catch (e) {
    toast('Microphone not available — use “Type a note” (the keyboard mic works too)');
  }
}

// ---------- timers, chime, wake lock ----------
const chimed = new Set();
let audioCtx;
function chime() {
  if (!S.d.kitchen.chime) return;
  try {
    audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.35, 0.7].forEach((d) => {
      const o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.frequency.value = 880; o.connect(g); g.connect(audioCtx.destination);
      const t = audioCtx.currentTime + d;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.3, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.start(t); o.stop(t + 0.32);
    });
  } catch (e) { /* no audio */ }
}
function tick() {
  for (const el of document.querySelectorAll('[data-due]')) {
    const due = Number(el.dataset.due);
    const left = (due - Date.now()) / 1000;
    el.textContent = left > 0 ? fmtCountdown(left) : 'Now';
    el.classList.toggle('due', left <= 0);
    if (left <= 0 && left > -60 && !chimed.has(due)) { chimed.add(due); chime(); toast('Step due now'); }
  }
}
setInterval(tick, 1000);
setInterval(() => { if (['today', 'starter', 'bulk', 'bake'].includes(route) && !document.querySelector('input:focus,textarea:focus')) render(); }, 60000);

let wakeLock = null;
async function syncWakeLock() {
  const want = !!activeBake() && S.d.kitchen.keepAwake && document.visibilityState === 'visible';
  try {
    if (want && !wakeLock && 'wakeLock' in navigator) {
      wakeLock = await navigator.wakeLock.request('screen');
      S.ui.wakeOn = true;
      wakeLock.addEventListener('release', () => { wakeLock = null; S.ui.wakeOn = false; });
    } else if (!want && wakeLock) {
      await wakeLock.release(); wakeLock = null; S.ui.wakeOn = false;
    }
  } catch (e) { S.ui.wakeOn = false; }
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') render(); else syncWakeLock(); });

let toastT;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => toastEl.classList.remove('show'), 2600);
}

// ---------- Start-a-bake draft ----------
function initDraft(q) {
  const k = S.d.kitchen;
  const fromBake = q.from ? bakeById(q.from) : null;
  const lastRec = bakesSorted().find((b) => b.recipeId && recipeById(b.recipeId))?.recipeId;
  const recipeId = q.recipe || fromBake?.recipeId || lastRec || S.d.recipes[0].id;
  const rec = recipeById(recipeId);
  S.ui.draft = {
    recipeId, loaves: rec ? rec.loaves : 1, testVar: 'none', testFrom: '', testTo: '',
    roomF: k.roomF, flourF: k.roomF, ddtF: 78, levainRatio: '1:1:1', startMm: 30,
    fromIng: fromBake && !fromBake.recipeId ? fromBake.ing : null,
  };
  recomputeDraft();
}

function baseIng(d) {
  const rec = recipeById(d.recipeId);
  const ing = d.fromIng || rec.ing;
  return scale(ing, d.loaves / (rec.loaves || 1));
}
function testFromValue(d) {
  const rec = recipeById(d.recipeId);
  const s = stats(baseIng(d));
  const last = bakesSorted().find((b) => b.recipeId === d.recipeId);
  switch (d.testVar) {
    case 'hyd': return s ? r1(s.hydration) : '';
    case 'pff': return s ? r1(s.pff) : '';
    case 'yeast': return String(baseIng(d).yeast || 0);
    case 'water': return String(last?.conditions?.waterF ?? waterTemp({ ddt: d.ddtF, room: d.roomF, flour: d.flourF, levain: d.roomF + 4, friction: S.d.kitchen.friction }));
    case 'target': return String(rec.bulkTarget);
    default: return '';
  }
}
function recomputeDraft() {
  const d = S.ui.draft;
  let ing = baseIng(d);
  const to = parseFloat(d.testTo);
  if (Number.isFinite(to)) {
    if (d.testVar === 'hyd') ing = applyHydration(ing, to);
    if (d.testVar === 'pff' && to > 0 && to < 60) ing = applyPff(ing, to);
    if (d.testVar === 'yeast') ing = { ...ing, yeast: to };
  }
  d.ing = ing;
  const rec = recipeById(d.recipeId);
  const pred = predictStarter(trainingFeeds(d.levainRatio).map(feedSeries), { ts: [0], Rs: [0] });
  const now = Date.now();
  const rows = [{ label: 'Feed levain', time: fmtTime(now) }];
  let t = now;
  if (pred) {
    t = now + pred.peak * 3.6e6;
    rows.push({ label: 'Levain peak (predicted)', time: '≈ ' + fmtTime(t), pred: true });
  } else {
    t = now + 4 * 3.6e6;
    rows.push({ label: `Levain peak (no ${d.levainRatio} history — ~4 h guess)`, time: '≈ ' + fmtTime(t) });
  }
  rows.push({ label: 'Autolyse', time: fmtTime(t - 30 * 60000) });
  rows.push({ label: 'Mix · bulk starts', time: fmtTime(t) });
  let f = t;
  (rec.folds || []).forEach((m, i) => { f += m * 60000; rows.push({ label: `Fold ${i + 1}`, time: fmtTime(f) }); });
  rows.push({ label: `Shape at +${d.testVar === 'target' && Number.isFinite(to) ? to : rec.bulkTarget}% (bulk jar)`, time: 'from jar' });
  d.preview = rows;
}

// ---------- calculator ----------
function initCalc(q) {
  const k = S.d.kitchen;
  const c = { dough: 1800, hyd: 78, levPct: 20, saltPct: 2, blend: { bf: 70, ww: 20, rye: 10 }, ddt: 78, room: k.roomF, flourT: k.roomF, levT: k.roomF + 4 };
  const rec = q.recipe ? recipeById(q.recipe) : null;
  const s = rec ? stats(rec.ing) : null;
  if (s) {
    const i = rec.ing, Lf = s.pff * s.flour / 100;
    c.dough = Math.round(s.dough); c.hyd = Math.round(s.hydration); c.levPct = Math.round((i.levain || 0) / s.flour * 100); c.saltPct = Math.round(s.salt * 10) / 10;
    const bf = Math.round(((i.bf || 0) + Lf / 2) / s.flour * 100), ww = Math.round(((i.ww || 0) + Lf / 2) / s.flour * 100);
    c.blend = { bf, ww, rye: 100 - bf - ww };
    c.fromRecipe = rec.name;
  }
  S.ui.calc = c;
}

// ---------- actions (buttons) ----------
const get = (id) => recipeById(id) || (S.ui.newRecipe && S.ui.newRecipe.id === id ? S.ui.newRecipe : null);
const A = {
  // starter
  rename() { S.ui.renaming = true; },
  'rename-save'() { const v = document.getElementById('starter-name').value.trim(); if (v) S.d.starter.name = v; S.ui.renaming = false; save(); },
  nudge(ds) { S.d.starter.nudgeDays = Math.max(1, S.d.starter.nudgeDays + Number(ds.d)); save(); },
  'feed-draft'(ds) { S.ui.feedDraft[ds.key] = ds.v; },
  'feed-draft-num'(ds) { S.ui.feedDraft[ds.key] = Math.max(1, S.ui.feedDraft[ds.key] + Number(ds.d)); },
  'feed-start'() {
    const d = S.ui.feedDraft;
    const f = { id: uid('f'), start: nowISO(), ratio: d.ratio, flour: d.flour, startMm: d.startMm, purpose: d.purpose, readings: [], startTempF: d.tempF };
    S.d.feeds.push(f); S.d.activeFeedId = f.id; S.ui.mm = null; save(); toast('Feed started');
  },
  mm(ds) { const f = activeFeed(); const last = f.readings[f.readings.length - 1]; S.ui.mm = Math.max(1, (S.ui.mm ?? (last ? last.mm : f.startMm)) + Number(ds.d)); },
  temp(ds) { S.ui.tempF = Number(ds.cur) + Number(ds.d); },
  btemp(ds) { S.ui.btempF = Number(ds.cur) + Number(ds.d); },
  'reading-save'(ds) {
    const f = activeFeed(); const mm = Number(ds.mm); const tempF = Number(ds.temp);
    f.readings.push({ t: nowISO(), mm, tempF }); save(); toast(`Saved ${mm} mm at ${tempF}°F`);
  },
  'reading-del'(ds) { activeFeed().readings.splice(Number(ds.i), 1); save(); },
  doubled() { const f = activeFeed(); f.doubledAt = f.doubledAt ? null : nowISO(); save(); },
  'not-yet'() { toast('Noted — check again in 30–60 min'); },
  'feed-end'() { const f = activeFeed(); if (f) f.endedAt = nowISO(); S.d.activeFeedId = null; save(); },

  // start a bake
  'draft-num'(ds) { const d = S.ui.draft; d[ds.key] = Math.max(1, d[ds.key] + Number(ds.d)); if (ds.key === 'loaves') { d.testFrom = testFromValue(d); } recomputeDraft(); },
  'draft-test'(ds) { const d = S.ui.draft; d.testVar = ds.v; d.testFrom = testFromValue(d); d.testTo = d.testFrom; recomputeDraft(); },
  'draft-set'(ds) { S.ui.draft[ds.key] = ds.v; recomputeDraft(); },
  'bake-start'() {
    const d = S.ui.draft; const rec = recipeById(d.recipeId); const k = S.d.kitchen; const now = nowISO();
    const feed = { id: uid('f'), start: now, ratio: d.levainRatio, flour: '50/50 BF/WW', startMm: d.startMm, purpose: 'levain', readings: [], startTempF: d.roomF };
    S.d.feeds.push(feed); S.d.activeFeedId = feed.id;
    const pred = starterPrediction(feed);
    const oven = { tempF: 450, preheatMin: 60, lidOnMin: 20, lidOffMin: 20, pullAt: '208–210°F' };
    const steps = makeSteps({ autolyseWait: Math.max(0, Math.round((pred ? pred.peak : 4) * 60 - 30)), folds: rec.folds || [30, 30, 60, 60], oven });
    steps[0].doneAt = now;
    const tv = V.TEST_VARS.find((x) => x.v === d.testVar);
    const to = parseFloat(d.testTo);
    const wt = d.testVar === 'water' && Number.isFinite(to) ? to : waterTemp({ ddt: d.ddtF, room: d.roomF, flour: d.flourF, levain: d.roomF + 4, friction: k.friction });
    const b = {
      id: uid('b'), num: String(S.d.nextNum), date: now.slice(0, 10), recipeId: rec.id, name: rec.name, loaves: d.loaves, ing: d.ing,
      testing: d.testVar !== 'none' ? { label: tv.l, from: d.testFrom + tv.unit, to: d.testTo + tv.unit } : null,
      conditions: { roomF: d.roomF, flourF: d.flourF, ddtF: d.ddtF, waterF: wt }, feedId: feed.id, steps, notes: [],
      bulk: { target: d.testVar === 'target' && Number.isFinite(to) ? to : rec.bulkTarget, startMm: null, readings: [], tags: [] },
      oven, result: { score: null, tags: [], text: '', photos: [] }, status: 'active',
    };
    S.d.bakes.push(b); S.d.activeBakeId = b.id; S.d.nextNum += 1; save();
    location.hash = '#/today'; toast(`Loaf #${b.num} started — levain fed`);
    return 'nav';
  },

  // bake log
  'step-done'() {
    const b = activeBake(); const i = currentStepIdx(b); if (i < 0) return;
    b.steps[i].doneAt = nowISO();
    if (b.steps[i].key === 'mix') {
      const f = feedById(b.feedId); if (f && !f.endedAt) { f.endedAt = nowISO(); if (S.d.activeFeedId === f.id) S.d.activeFeedId = null; }
      toast('Bulk started — fill and mark the aliquot jar');
    }
    save();
  },
  'step-edit'(ds) { S.ui.editStep = S.ui.editStep === Number(ds.i) ? null : Number(ds.i); },
  'step-shift'(ds) {
    const s = activeBake().steps[S.ui.editStep]; if (!s || !s.doneAt) return;
    s.doneAt = ds.m === 'now' ? nowISO() : toLocalISO(new Date(ms(s.doneAt) + Number(ds.m) * 60000)); save();
  },
  async 'share-card'(ds) {
    toast('Making the card…');
    const r = await shareCard(bakeById(ds.id));
    if (r === 'downloaded') toast('Card saved');
    return 'skip';
  },
  'loaf-edit'() { S.ui.editLoaf = !S.ui.editLoaf; },
  'step-undo'() { const b = activeBake(); const done = b.steps.filter((s) => s.doneAt); if (done.length > 1) { done[done.length - 1].doneAt = null; save(); } },
  'note-open'() { S.ui.noteOpen = !S.ui.noteOpen; },
  'note-save'() { const t = document.getElementById('note-text').value.trim(); if (t) { activeBake().notes.push({ id: uid('n'), t: nowISO(), kind: 'text', text: t }); save(); } S.ui.noteOpen = false; },
  voice() { toggleVoice(); return 'skip'; },
  'finish-bake'() { const b = activeBake(); b.status = 'done'; S.d.activeBakeId = null; save(); location.hash = '#/today'; toast('Done. Rate it once you cut it.'); return 'nav'; },
  'cancel-bake'() { S.ui.confirmCancel = true; },
  'cancel-bake-yes'() {
    const b = activeBake(); S.d.bakes = S.d.bakes.filter((x) => x.id !== b.id); S.d.activeBakeId = null;
    if (String(S.d.nextNum - 1) === b.num) S.d.nextNum -= 1; save(); location.hash = '#/today'; return 'nav';
  },

  // bulk
  bmm(ds) { const b = activeBake(); const last = b.bulk.readings[b.bulk.readings.length - 1]; S.ui.bmm = Math.max(1, (S.ui.bmm ?? (last ? last.mm : b.bulk.startMm || 40)) + Number(ds.d)); },
  'bulk-start'() { const b = activeBake(); b.bulk.startMm = S.ui.bmm ?? 40; b.bulk.readings = []; S.ui.bmm = null; save(); toast('Start line set'); },
  'bulk-save'(ds) { const b = activeBake(); const mm = Number(ds.mm); const tempF = Number(ds.temp); b.bulk.readings.push({ t: nowISO(), mm, tempF }); save(); toast(`Saved ${mm} mm at ${tempF}°F`); },
  'bulk-del'(ds) { activeBake().bulk.readings.splice(Number(ds.i), 1); save(); },
  'bulk-tag'(ds) { const t = activeBake().bulk.tags; const i = t.indexOf(ds.v); i >= 0 ? t.splice(i, 1) : t.push(ds.v); save(); },
  'bulk-target'(ds) { const b = activeBake(); b.bulk.target = Math.max(10, Math.min(150, b.bulk.target + Number(ds.d))); save(); },

  // rate
  score(ds) { bakeById(ds.id).result.score = Number(ds.v); save(); },
  'rate-tag'(ds) { const t = bakeById(ds.key).result.tags; const i = t.indexOf(ds.v); i >= 0 ? t.splice(i, 1) : t.push(ds.v); save(); },
  'apply-hint'(ds) { const b = bakeById(ds.id); const h = V.rateHint(b); if (h) { h.rec.bulkTarget += h.delta; (S.d.appliedHints ||= []).push(b.id); save(); toast(`${h.rec.name}: bulk target now +${h.rec.bulkTarget}%`); } },
  'rate-save'(ds) { const b = bakeById(ds.id); b.status = 'done'; if (S.d.activeBakeId === b.id) S.d.activeBakeId = null; save(); location.hash = '#/loaf/' + b.id; toast('Saved'); return 'nav'; },

  // loaves
  'loaf-filter'(ds) { S.ui.loafFilter = ds.v; },
  'toggle-best'(ds) { const b = bakeById(ds.id); const was = b.best; S.d.bakes.forEach((x) => (x.best = false)); b.best = !was; save(); },

  // recipes
  'recipe-target'(ds) { const r = get(ds.id); r.bulkTarget = Math.max(10, r.bulkTarget + Number(ds.d)); save(); },
  'recipe-create'() { const r = S.ui.newRecipe; S.d.recipes.push(r); S.ui.newRecipe = null; save(); location.hash = '#/recipe/' + r.id; toast('Recipe saved'); return 'nav'; },
  'recipe-del'(ds) { S.ui.confirmDel = ds.id; },
  'recipe-del-yes'(ds) { S.d.recipes = S.d.recipes.filter((r) => r.id !== ds.id); save(); location.hash = '#/recipes'; return 'nav'; },

  // calculator
  calc(ds) { const c = S.ui.calc; const v = Math.round((c[ds.key] + Number(ds.d)) * 10) / 10; c[ds.key] = Math.max(0, v); },
  'calc-save'() {
    const c = S.ui.calc, f = fromTargets(c);
    const r = { id: uid('r'), name: `Calculator ${c.hyd}% · ${c.dough} g`, source: 'Mine', private: false, loaves: Math.max(1, Math.round(c.dough / 900)),
      ing: { bf: f.bf, ww: f.ww, rye: f.rye, water: f.water, levain: f.levain, salt: f.salt }, folds: [30, 30, 60, 60], bulkTarget: 60, notes: '' };
    S.d.recipes.push(r); save(); location.hash = '#/recipe/' + r.id; toast('Saved — rename it here'); return 'nav';
  },

  // kitchen / backup
  async export() {
    const blobs = {};
    for (const id of await blobKeys()) {
      const b = await getBlob(id);
      blobs[id] = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
    }
    const file = new Blob([JSON.stringify({ app: 'sourdough-buddy', v: 1, exportedAt: nowISO(), state: S.d, blobs })], { type: 'application/json' });
    const name = `sourdough-buddy-backup-${nowISO().slice(0, 10)}.json`;
    try {
      const f = new File([file], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: 'Sourdough Buddy backup' }); return 'skip'; }
    } catch (e) { /* fall through to download */ }
    const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; a.click();
    return 'skip';
  },
  reset() { S.ui.confirmReset = true; },
  async 'reset-yes'() { await clearAll(); location.hash = '#/today'; location.reload(); return 'skip'; },
};

// ---------- changes (inputs) ----------
const C = {
  'loaf-field'(el) {
    const b = bakeById(el.dataset.id); const k = el.dataset.key;
    if (k === 'text') b.result.text = el.value; else if (k === 'date') b.date = el.value || null; else if (el.value.trim()) b[k] = el.value.trim();
    save();
  },
  'starter-field'(el) { S.d.starter[el.dataset.key] = el.value; save(); },
  draft(el) {
    const d = S.ui.draft; const k = el.dataset.key;
    if (k === 'recipeId') { initDraft({ recipe: el.value }); return; }
    d[k] = k === 'testTo' ? el.value : Number(el.value) || d[k];
    if (k !== 'testTo' && d.testVar === 'water') d.testFrom = testFromValue(d);
    recomputeDraft();
  },
  async 'note-photo'(el) { const file = el.files[0]; if (!file) return; const id = await storeFile(file); activeBake().notes.push({ id: uid('n'), t: nowISO(), kind: 'photo', blob: id }); save(); render(); toast('Photo saved'); return 'skip'; },
  async 'rate-photo'(el) { const file = el.files[0]; if (!file) return; const id = await storeFile(file); const b = bakeById(el.dataset.id); b.result.photos[Number(el.dataset.i)] = id; save(); render(); return 'skip'; },
  'rate-text'(el) { bakeById(el.dataset.id).result.text = el.value; save(); return 'skip'; },
  'recipe-field'(el) {
    const r = get(el.dataset.id); const k = el.dataset.key;
    r[k] = el.type === 'checkbox' ? el.checked : k === 'loaves' ? Math.max(1, parseInt(el.value) || 1) : el.value;
    if (r.id !== S.ui.newRecipe?.id) save();
  },
  'recipe-ing'(el) { const r = get(el.dataset.id); const v = parseFloat(el.value); if (Number.isFinite(v) && v > 0) r.ing[el.dataset.key] = v; else delete r.ing[el.dataset.key]; save(); },
  'recipe-folds'(el) { const r = get(el.dataset.id); r.folds = el.value.split(/[,\s]+/).map(Number).filter((x) => x > 0); save(); },
  'calc-blend'(el) { S.ui.calc.blend[el.dataset.key] = Math.max(0, parseInt(el.value) || 0); },
  'calc-num'(el) { S.ui.calc[el.dataset.key] = Number(el.value) || S.ui.calc[el.dataset.key]; },
  kitchen(el) { S.d.kitchen[el.dataset.key] = el.value; save(); return 'skip'; },
  'kitchen-bool'(el) { S.d.kitchen[el.dataset.key] = el.checked; save(); },
  'kitchen-num'(el) { const v = Number(el.value); if (Number.isFinite(v)) S.d.kitchen[el.dataset.key] = v; save(); },
  async import(el) {
    const file = el.files[0]; if (!file) return 'skip';
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'sourdough-buddy' || !data.state) throw new Error('Not a Sourdough Buddy backup');
      await clearAll();
      for (const [id, url] of Object.entries(data.blobs || {})) await putBlob(id, await (await fetch(url)).blob());
      S.d = data.state; await saveNow(); toast('Backup restored'); render();
    } catch (e) { toast('Import failed: ' + e.message); }
    return 'skip';
  },
};

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = A[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  const r = await fn(el.dataset, el);
  if (r !== 'nav' && r !== 'skip') render();
});
document.addEventListener('change', async (e) => {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const fn = C[el.dataset.change];
  if (!fn) return;
  const r = await fn(el);
  if (r !== 'skip') render();
});

// ---------- boot ----------
(async function boot() {
  await loadState();
  askPersistent();
  window.addEventListener('hashchange', onRoute);
  onRoute();
  if ('serviceWorker' in navigator) {
    // Show a banner when a newer version takes over (not on the very first install).
    const hadController = !!navigator.serviceWorker.controller;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController) return;
      const u = document.getElementById('update');
      u.hidden = false;
      document.getElementById('update-btn').onclick = () => location.reload();
    });
    navigator.serviceWorker.register('./sw.js').then((reg) => {
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
    }).catch(() => {});
  }
})();
