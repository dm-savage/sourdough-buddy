# Sourdough Buddy — notes for Claude

Dana's personal sourdough app. iPhone home-screen web app hosted on GitHub Pages from `main` (root).

## Ground rules
- No build step, no npm dependencies. Plain ES modules loaded by `index.html`. Keep it that way unless Dana asks.
- All paths relative (site is served from `/sourdough-buddy/`).
- Data lives only on the phone (IndexedDB via `js/db.js`). Never add network calls that send user data anywhere.
- When changing any file the app loads, bump `VERSION` in `sw.js` so installed phones pick up the update.
- Run `node tests/fit.test.mjs` after touching `js/fit.js` or `js/calc.js`.
- If the shape of saved state changes, migrate old state in `loadState()` (js/state.js) — Dana has real data on the phone.

## Structure
- `js/views.js`: each screen is a function returning an HTML string. Buttons use `data-act="name"`, inputs use `data-change="name"`; handlers live in the `A` and `C` objects in `js/app.js`.
- `js/state.js`: `S.d` is the saved state, `S.ui` is screen-only state. Call `save()` after changing `S.d`.
- `js/fit.js`: Baranyi / Gompertz / logistic fits; `predictStarter`, `predictBulk`.
- `js/seed.js`: notebook transcription. Uncertain reads are marked "(?)".

## Communicating with Dana
He's an MEP engineer learning to code through Claude Code. Explain changes in plain terms; avoid jargon he wouldn't use himself.
