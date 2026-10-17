// Checks the curve-fit engine against the notebook's four jar-height tables.
// Run: node tests/fit.test.mjs   (no install needed)
import assert from 'node:assert/strict';
import { fitAll, predictStarter, predictBulk, timeToReach } from '../js/fit.js';
import { stats, applyPff } from '../js/calc.js';

const runs = {
  '12/28': [['10:53', 25], ['11:08', 30], ['12:08', 39], ['13:39', 63], ['14:45', 74], ['15:17', 83]],
  '1/2': [['14:30', 30], ['15:47', 36], ['17:03', 48], ['17:40', 60], ['18:34', 67], ['20:03', 67]],
  '1/9': [['10:30', 32], ['11:00', 32], ['12:00', 40], ['13:08', 59], ['15:21', 72]],
  '1/16': [['10:00', 47], ['11:00', 61], ['12:20', 93], ['13:20', 108]],
};
const h = (s) => { const [a, b] = s.split(':').map(Number); return a + b / 60; };
const series = Object.values(runs).map((r) => ({ ts: r.map((x) => h(x[0]) - h(r[0][0])), Rs: r.map((x) => x[1] / r[0][1] - 1) }));

// 1. Every model fits each run well, and Baranyi wins overall (matches the Python check).
const pooled = { baranyi: 0, gompertz: 0, logistic: 0 };
for (const s of series) for (const f of fitAll(s.ts, s.Rs)) { pooled[f.model] += f.rss; assert.ok(f.r2 > 0.97, `${f.model} R² ${f.r2}`); }
assert.ok(pooled.baranyi < pooled.gompertz && pooled.gompertz < pooled.logistic, JSON.stringify(pooled));
assert.ok(Math.abs(pooled.baranyi - 0.0358) < 0.002);

// 2. Starter prediction from history: doubles ~2.7 h, peaks ~4 h.
const p = predictStarter(series, { ts: [0], Rs: [0] });
assert.ok(p.t2x > 2.3 && p.t2x < 3.1, `t2x ${p.t2x}`);
assert.ok(p.peak > 3.5 && p.peak < 4.5, `peak ${p.peak}`);
assert.ok(p.peakRange[1] < 5, 'never-peaked run must not widen the range');

// 3. A fast reading pulls the prediction earlier; a reading at t≈0 is ignored.
const fast = predictStarter(series, { ts: [0, 1.5], Rs: [0, 0.6] });
assert.ok(fast.peak < p.peak, 'fast run predicts earlier');
const early = predictStarter(series, { ts: [0, 0.05], Rs: [0, 0.3] });
assert.ok(Math.abs(early.peak - p.peak) < 1e-9, 'readings under 15 min are ignored');

// 4. Bulk: needs 3 readings, then predicts the time to target.
assert.equal(predictBulk({ ts: [0, 1], Rs: [0, 0.05] }, 60).ready, false);
const b = predictBulk({ ts: [0, 1, 2, 3], Rs: [0, 0.08, 0.23, 0.43] }, 60);
assert.ok(b.ready && b.tTarget > 3 && b.tTarget < 5, `bulk tTarget ${b.tTarget}`);

// 5. Baker's math matches the hand numbers for loaf #15–16 and #5.
const s15 = stats({ bf: 540, ww: 160, rye: 100, water: 620, levain: 360, salt: 21, yeast: 2 });
assert.ok(Math.abs(s15.hydration - 81.6) < 0.1 && Math.abs(s15.pff - 18.4) < 0.1);
const s5 = stats({ bf: 300, ww: 130, water: 300, levain: 85, salt: 10 });
assert.ok(Math.abs(s5.hydration - 72.5) < 0.1);
const lower = stats(applyPff({ bf: 540, ww: 160, rye: 100, water: 620, levain: 360, salt: 21 }, 10));
assert.ok(Math.abs(lower.pff - 10) < 0.3 && Math.abs(lower.hydration - 81.6) < 0.3, 'levain change holds hydration');

console.log('all fit/calc checks passed', { pooled, t2x: p.t2x.toFixed(2), peak: p.peak.toFixed(2), bulk: b.tTarget.toFixed(2) });
