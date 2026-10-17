// Baker's math. All weights in grams, temperatures in °F.

// Split a levain weight into its flour and water, given its hydration (%).
export function levainSplit(levain = 0, hyd = 100) {
  const flour = (levain * 100) / (100 + hyd);
  return { flour, water: levain - flour };
}

// Key numbers for a set of ingredients.
// ing = {bf, ww, rye, water, levain, levainHyd, levainWG, salt, yeast}
//   levainWG = share of the levain's flour that is whole grain (0-100), default 50
export function stats(ing = {}) {
  const { bf = 0, ww = 0, rye = 0, water = 0, levain = 0, levainHyd = 100, levainWG = 50, salt = 0, yeast = 0 } = ing;
  const L = levainSplit(levain, levainHyd);
  const flour = bf + ww + rye + L.flour;
  if (!flour || !water) return null;
  const totalWater = water + L.water;
  return {
    flour,
    water: totalWater,
    hydration: (totalWater / flour) * 100,
    pff: (L.flour / flour) * 100, // prefermented flour %
    salt: (salt / flour) * 100,
    wholeGrain: ((ww + rye + (L.flour * levainWG) / 100) / flour) * 100,
    yeast,
    dough: bf + ww + rye + water + levain + salt + yeast,
  };
}

// Water temperature to hit a desired dough temperature (DDT).
// Classic 4-factor rule: DDT × 4 − room − flour − levain − friction.
export function waterTemp({ ddt = 78, room = 72, flour = 72, levain = 76, friction = 4 }) {
  return Math.round(ddt * 4 - room - flour - levain - friction);
}

// Build a formula from targets (the calculator screen).
// blend = {bf, ww, rye} as percentages of total flour (sum 100); levain at 100% hydration,
// its flour assumed half BF / half WW.
export function fromTargets({ dough = 1800, hyd = 78, levPct = 20, saltPct = 2, blend = { bf: 70, ww: 20, rye: 10 } }) {
  const T = dough / (1 + hyd / 100 + saltPct / 100);
  const L = (T * levPct) / 100;
  const r = (v) => Math.max(0, Math.round(v));
  return {
    totalFlour: r(T),
    bf: r((T * blend.bf) / 100 - L / 4),
    ww: r((T * blend.ww) / 100 - L / 4),
    rye: r((T * blend.rye) / 100),
    water: r((hyd / 100) * T - L / 2),
    levain: r(L),
    salt: r((saltPct / 100) * T),
  };
}

// Change one variable while holding the others (used by "What are you testing?").
export function applyHydration(ing, target) {
  const L = levainSplit(ing.levain || 0, ing.levainHyd || 100);
  const F = (ing.bf || 0) + (ing.ww || 0) + (ing.rye || 0);
  return { ...ing, water: Math.round((target / 100) * (F + L.flour) - L.water) };
}

export function applyPff(ing, targetPct) {
  const s = stats(ing);
  const F = (ing.bf || 0) + (ing.ww || 0) + (ing.rye || 0);
  const p = targetPct / 100;
  const Lf = (p * F) / (1 - p); // levain flour needed
  const hyd = ing.levainHyd || 100;
  const levain = Math.round(Lf * (1 + hyd / 100));
  const out = { ...ing, levain };
  return s ? applyHydration(out, s.hydration) : out;
}

export function scale(ing, factor) {
  const out = { ...ing };
  for (const k of ['bf', 'ww', 'rye', 'water', 'levain', 'salt', 'yeast']) {
    if (out[k] != null) out[k] = Math.round(out[k] * factor * 10) / 10;
  }
  return out;
}
