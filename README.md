# Sourdough Buddy

A phone app that replaces the sourdough notebook: starter rise predictions, bake timers, a bulk-fermentation jar tracker, loaf ratings, and a recipe calculator. Starts pre-loaded with every loaf and starter reading from the handwritten notebooks (Dec 2025 – Sep 2026).

**Open it:** https://dm-savage.github.io/sourdough-buddy/
On iPhone, open that link in Safari → Share → **Add to Home Screen**. It then runs full-screen and works offline.

## What it does

| Screen | What it's for |
|---|---|
| **Today** | Between bakes: rate your last loaf, starter status, start a bake. During a bake: a giant timer and one big Done button. |
| **Starter** | Log a feed, tap +/− to log jar height, see "ready at" with a likely range. Rise history compares three growth-curve models on your data. |
| **Start a bake** | Pick a recipe, pick the one thing you're changing, get water temp and a schedule. |
| **Bake log** | Dark kitchen mode, keeps the screen awake, chimes when a step is due. Voice notes, photos, typed notes. |
| **Bulk** | Small jar of dough (aliquot) → predicted time to shape. |
| **Rate** | Next-morning score, photos and quick tags. Suggests a bulk-target change when tags point to over/under-fermentation. |
| **Loaves** | Photo wall of every bake; each loaf compares against your best and can be shared as a recipe-card image. |
| **Dashboard** | Wide-screen view: every rise curve, model comparison, full loaf table. Open from Loaves. |
| **Recipes / Calculator** | Baker's percentages, desired-dough-temperature water calc. |
| **Kitchen** | Equipment, warm spots, backup export/import. |

## Where the data lives

Only on the phone (IndexedDB in Safari). Nothing is sent anywhere. Use **Kitchen → Export backup** now and then; the file includes photos and voice notes and can be re-imported.

## How the predictions work

Jar height is converted to rise ratio and fitted with three standard microbial growth models — Baranyi–Roberts (1994), and the modified Gompertz and logistic forms (Zwietering et al., 1990) — using a small Nelder–Mead optimizer in `js/fit.js`. On the four notebook runs, Baranyi has the lowest error (RSS 0.036 vs 0.052 and 0.063).

- **Starter:** past feeds at the same ratio give a typical curve; today's readings speed it up or slow it down; the likely range narrows as you log.
- **Bulk:** a generic dough-rise shape is scaled to your first three jar readings, then fully fitted from five.
- **Not yet:** a temperature term. It needs roughly 8–12 logged feeds at different temperatures.

## Working on it

No build step and no dependencies — plain HTML, CSS and JavaScript.

```
index.html          app shell + tab bar
css/app.css         all styling
js/app.js           routing, buttons, timers, wake lock, voice/photo capture
js/views.js         every screen (functions that return HTML)
js/state.js         app state + derived values (predictions, step times)
js/fit.js           curve fitting + prediction
js/calc.js          baker's math
js/seed.js          the notebook data
js/card.js          recipe-card image for the share sheet
js/db.js            on-phone storage
sw.js               offline cache (bump VERSION when files change)
tests/fit.test.mjs  checks for the fitting + math: node tests/fit.test.mjs
```

Run locally: `python3 -m http.server` in this folder, then open http://localhost:8000.
