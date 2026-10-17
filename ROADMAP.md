# Sourdough Buddy — Roadmap

Working plan. Check items off as they ship. Anything marked **(decision)** waits on Dana.

## v1 — the core loop ✅ (Oct 17, 2026)
- [x] Notebook history pre-loaded (16 loaves, 7 recipes, 7 starter feeds)
- [x] Starter: log feed, one-tap height logging, "ready at" prediction with range
- [x] Start a bake with one test variable; scaled weights; water temp from DDT
- [x] Bake log: kitchen mode, timers, chime, screen awake, voice/photo/text notes
- [x] Bulk aliquot jar with predicted shaping time
- [x] Next-morning rating with tags + bulk-target suggestion
- [x] Loaves photo wall, loaf detail with compare-to-best
- [x] Recipes, calculator, kitchen setup, backup export/import
- [x] Offline support, Add to Home Screen

## v1.1 — polish and protect the data ✅ (Oct 17, 2026)
- [x] Log temperature with every starter and bulk reading (data the temperature model will need)
- [x] Versioned saved data + migration step, so future updates never break what's on the phone
- [x] "Update available — tap to reload" banner when a new version is pushed
- [x] Fix mistakes: edit a done step's time, delete bulk readings, edit loaf name/date/notes
- [x] Recipe card image (photo + numbers + rise chart) → iPhone share sheet
- [x] Wide-screen dashboard (`#/dashboard`): all rise curves, model comparison, loaf table, trends
- [ ] Add the Oct 17 starter readings (log them in the app, or send them to Claude to add)

## v2 — needs a decision or real data
- [ ] **(decision)** Reminders when the app is closed. iPhone web push needs a small server (e.g. a free Cloudflare Worker) to send them.
- [ ] **(decision)** Sync phone ↔ computer. Needs a cloud database and a login (e.g. Supabase free tier).
- [ ] Temperature term in the starter prediction (Ratkowsky square-root model). Needs ~8–12 logged feeds at different temps.
- [ ] Learn each recipe's bulk target from ratings automatically (today it's a suggested ±10% per rating).
- [ ] Bulk prediction trained on Dana's own past bulk jars instead of a generic curve.

## v3 — sharing
- [ ] Share to Instagram / Facebook / X / Reddit via the iPhone share sheet (tailored captions per platform)
- [ ] **(decision)** Direct posting through each platform's API (developer accounts; Instagram needs a business/creator account)
- [ ] Community: share recipes and rise curves with friends (needs accounts + a server)
