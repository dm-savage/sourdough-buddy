// Growth-curve fitting for starter and bulk rise.
// All models work on R = h/h0 - 1 (fractional rise) versus t in hours.
//   A   = maximum rise (asymptote), e.g. 1.5 means the jar tops out at 2.5x
//   mu  = rate parameter (Gompertz/logistic: max slope of R; Baranyi: max specific rate of ln h)
//   lam = lag time in hours
// References: Zwietering et al. 1990 (modified Gompertz / logistic), Baranyi & Roberts 1994.

const E = Math.E;

export const MODELS = {
  baranyi(t, [A, mu, lam]) {
    const ymax = Math.log1p(A);
    const q = lam * mu;
    const At = t + Math.log(Math.exp(-mu * t) + Math.exp(-q) - Math.exp(-mu * t - q)) / mu;
    const y = mu * At - Math.log(1 + (Math.exp(mu * At) - 1) / Math.exp(ymax));
    return Math.exp(y) - 1;
  },
  gompertz(t, [A, mu, lam]) {
    return A * Math.exp(-Math.exp((mu * E) / A * (lam - t) + 1));
  },
  logistic(t, [A, mu, lam]) {
    return A / (1 + Math.exp((4 * mu) / A * (lam - t) + 2));
  },
};

export const MODEL_LABELS = { baranyi: 'Baranyi', gompertz: 'Gompertz', logistic: 'Logistic' };

const BOUNDS = { A: [0.05, 6], mu: [0.01, 5], lam: [0, 6] };
const clampP = ([A, mu, lam]) => [
  Math.min(BOUNDS.A[1], Math.max(BOUNDS.A[0], A)),
  Math.min(BOUNDS.mu[1], Math.max(BOUNDS.mu[0], mu)),
  Math.min(BOUNDS.lam[1], Math.max(BOUNDS.lam[0], lam)),
];

function sse(f, p, ts, Rs) {
  let s = 0;
  for (let i = 0; i < ts.length; i++) {
    const v = f(ts[i], p);
    if (!Number.isFinite(v)) return 1e9;
    s += (v - Rs[i]) ** 2;
  }
  return s;
}

// Nelder–Mead simplex minimizer.
function nelderMead(fn, x0, { iters = 600, step = 0.3 } = {}) {
  const n = x0.length;
  let simplex = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const x = x0.slice();
    x[i] = x[i] !== 0 ? x[i] * (1 + step) : step;
    simplex.push(x);
  }
  let vals = simplex.map(fn);
  for (let k = 0; k < iters; k++) {
    const order = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
    simplex = order.map((i) => simplex[i]);
    vals = order.map((i) => vals[i]);
    if (Math.abs(vals[n] - vals[0]) < 1e-12) break;
    const c = new Array(n).fill(0);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) c[j] += simplex[i][j] / n;
    const worst = simplex[n];
    const xr = c.map((cj, j) => cj + (cj - worst[j]));
    const fr = fn(xr);
    if (fr < vals[0]) {
      const xe = c.map((cj, j) => cj + 2 * (cj - worst[j]));
      const fe = fn(xe);
      if (fe < fr) { simplex[n] = xe; vals[n] = fe; } else { simplex[n] = xr; vals[n] = fr; }
    } else if (fr < vals[n - 1]) {
      simplex[n] = xr; vals[n] = fr;
    } else {
      const xc = c.map((cj, j) => cj + 0.5 * (worst[j] - cj));
      const fc = fn(xc);
      if (fc < vals[n]) { simplex[n] = xc; vals[n] = fc; } else {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[i].map((v, j) => simplex[0][j] + 0.5 * (v - simplex[0][j]));
          vals[i] = fn(simplex[i]);
        }
      }
    }
  }
  const best = vals.indexOf(Math.min(...vals));
  return { x: simplex[best], f: vals[best] };
}

// Fit one model to (ts, Rs). Tries several starting points and keeps the best.
export function fitModel(name, ts, Rs) {
  const f = MODELS[name];
  const Rmax = Math.max(...Rs, 0.2);
  const tmax = Math.max(...ts, 1);
  const starts = [];
  for (const a of [Rmax * 1.05, Rmax * 1.5, Rmax * 2.5]) {
    for (const m of [0.3, 0.8, 1.6]) {
      for (const l of [0, tmax * 0.15, tmax * 0.35]) starts.push([a, m, l]);
    }
  }
  let best = null;
  for (const s of starts) {
    const obj = (p) => {
      const q = clampP(p);
      const pen = Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]) + Math.abs(q[2] - p[2]);
      return sse(f, q, ts, Rs) + pen * 10;
    };
    const r = nelderMead(obj, s);
    if (!best || r.f < best.f) best = { p: clampP(r.x), f: r.f };
  }
  const p = best.p;
  const rss = sse(f, p, ts, Rs);
  const mean = Rs.reduce((a, b) => a + b, 0) / Rs.length;
  const tss = Rs.reduce((a, b) => a + (b - mean) ** 2, 0) || 1e-9;
  return { model: name, params: p, rss, r2: 1 - rss / tss, n: ts.length };
}

export function fitAll(ts, Rs) {
  return Object.keys(MODELS).map((m) => fitModel(m, ts, Rs));
}

// Time (hours) when the curve first reaches R = target. null if never within 24 h.
export function timeToReach(name, params, target) {
  const f = MODELS[name];
  for (let t = 0; t <= 24; t += 0.01) if (f(t, params) >= target) return t;
  return null;
}

export function timeToPeak(name, params, frac = 0.95) {
  return timeToReach(name, params, params[0] * frac);
}

// ---------- helpers for reading lists ----------
// readings: [{t: ISO string or ms, mm}] ; start: ISO/ms of feed ; h0 mm
export function toSeries(start, h0, readings) {
  const t0 = new Date(start).getTime();
  const ts = [0], Rs = [0];
  for (const r of readings) {
    const t = (new Date(r.t).getTime() - t0) / 3.6e6;
    if (t <= 0) continue;
    ts.push(t);
    Rs.push(r.mm / h0 - 1);
  }
  return { ts, Rs };
}

const median = (xs) => {
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// ---------- starter prediction ----------
// pastRuns: [{ts, Rs}] already-converted series from earlier feeds of similar ratio.
// current: {ts, Rs} for today's feed (may contain only the t=0 point).
// Returns hours-since-feed for doubling and peak, plus a likely range.
export function predictStarter(pastRuns, current) {
  const usable = pastRuns.filter((r) => r.ts.length >= 4);
  if (!usable.length) return null;
  const fits = usable.map((r) => fitModel('baranyi', r.ts, r.Rs));
  const t2 = fits.map((f) => timeToReach('baranyi', f.params, 1)).filter((x) => x != null);
  // Only count a run's peak if the jar was actually watched until near it.
  const tp = fits
    .map((f, i) => {
      const t = timeToPeak('baranyi', f.params);
      return t != null && t <= Math.max(...usable[i].ts) + 1 ? t : null;
    })
    .filter((x) => x != null);
  const typical = [median(fits.map((f) => f.params[0])), median(fits.map((f) => f.params[1])), median(fits.map((f) => f.params[2]))];

  let k = 1; // time-scale factor: >1 means today is running faster than typical
  // Readings in the first 15 min mostly reflect how the jar was filled, not fermentation.
  const keep = current.ts.map((t, i) => i === 0 || t >= 0.25);
  const cts = current.ts.filter((_, i) => keep[i]);
  const cRs = current.Rs.filter((_, i) => keep[i]);
  const nNew = cts.length - 1;
  if (nNew >= 1) {
    let lo = 0.6, hi = 1.8;
    const obj = (kk) => sse(MODELS.baranyi, typical, cts.map((t) => t * kk), cRs);
    for (let i = 0; i < 60; i++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (obj(m1) < obj(m2)) hi = m2; else lo = m1;
    }
    k = (lo + hi) / 2;
  }
  const t2typ = timeToReach('baranyi', typical, 1);
  const tptyp = timeToPeak('baranyi', typical);
  const shrink = 1 / (1 + nNew / 2);
  const spread = (xs, center) => {
    if (!xs.length || center == null) return [null, null];
    const lo = Math.min(...xs) / k, hi = Math.max(...xs) / k;
    return [center - (center - lo) * shrink, center + (hi - center) * shrink];
  };
  const t2x = t2typ != null ? t2typ / k : null;
  const peak = tptyp != null ? tptyp / k : null;
  return {
    typical, k, runs: usable.length, readingsToday: nNew,
    t2x, t2xRange: spread(t2, t2x),
    peak, peakRange: spread(tp, peak),
    peakRise: 1 + typical[0] * 0.95,
    curve: (t) => MODELS.baranyi(t * k, typical),
    band: (t) => {
      const vals = fits.map((f) => MODELS.baranyi(t * k, f.params));
      const c = MODELS.baranyi(t * k, typical);
      return [c - (c - Math.min(...vals)) * shrink, c + (Math.max(...vals) - c) * shrink];
    },
  };
}

// ---------- bulk (aliquot jar) prediction ----------
// No history needed: a default dough-rise shape is scaled to the readings.
const BULK_DEFAULT = [1.1, 0.35, 0.6]; // gompertz A, mu (/h), lam (h) - a generic starting shape
export function predictBulk(series, targetPct) {
  const target = targetPct / 100;
  const n = series.ts.length - 1;
  if (n < 2) return { ready: false, need: 3 - n };
  let params, model;
  if (n >= 5) {
    const f = fitModel('gompertz', series.ts, series.Rs);
    params = f.params; model = 'gompertz';
  } else {
    let lo = 0.3, hi = 3;
    const obj = (kk) => sse(MODELS.gompertz, BULK_DEFAULT, series.ts.map((t) => t * kk), series.Rs);
    for (let i = 0; i < 60; i++) {
      const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
      if (obj(m1) < obj(m2)) hi = m2; else lo = m1;
    }
    const k = (lo + hi) / 2;
    params = [BULK_DEFAULT[0], BULK_DEFAULT[1] * k, BULK_DEFAULT[2] / k];
    model = 'gompertz';
  }
  const tTarget = timeToReach(model, params, target);
  const unc = n >= 5 ? 0.15 : 0.3; // fractional uncertainty, shrinks with data
  return {
    ready: true, model, params,
    tTarget, range: tTarget != null ? [tTarget * (1 - unc), tTarget * (1 + unc)] : [null, null],
    curve: (t) => MODELS[model](t, params),
  };
}
