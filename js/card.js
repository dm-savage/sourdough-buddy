// Recipe card image (1080×1350, Instagram's 4:5) for the iPhone share sheet.
import { stats } from './calc.js';
import { getBlob } from './db.js';
import { feedById, feedSeries } from './state.js';
import { fitModel, MODELS } from './fit.js';
import { fmtDate, r1 } from './ui.js';

const W = 1080, H = 1350, PAD = 72;
const CREAM = '#F3E6CF', TAN = '#E2C9A0', CRUST = '#3A2716', MUTED = '#CDB998';
const SANS = "'IBM Plex Sans', -apple-system, system-ui, sans-serif";
const MONO = "'IBM Plex Mono', ui-monospace, Menlo, monospace";

function drawLoaf(g, cx, cy, s) {
  g.save(); g.strokeStyle = CREAM; g.lineCap = 'round'; g.lineJoin = 'round'; g.lineWidth = 6 * s;
  g.beginPath(); g.moveTo(cx - 96 * s, cy + 38 * s); g.bezierCurveTo(cx - 96 * s, cy - 14 * s, cx - 42 * s, cy - 40 * s, cx, cy - 40 * s);
  g.bezierCurveTo(cx + 42 * s, cy - 40 * s, cx + 96 * s, cy - 14 * s, cx + 96 * s, cy + 38 * s);
  g.bezierCurveTo(cx + 96 * s, cy + 50 * s, cx + 85 * s, cy + 56 * s, cx + 70 * s, cy + 56 * s); g.lineTo(cx - 70 * s, cy + 56 * s);
  g.bezierCurveTo(cx - 85 * s, cy + 56 * s, cx - 96 * s, cy + 50 * s, cx - 96 * s, cy + 38 * s); g.stroke();
  g.beginPath(); g.moveTo(cx - 58 * s, cy + 12 * s); g.bezierCurveTo(cx - 24 * s, cy - 14 * s, cx + 20 * s, cy - 20 * s, cx + 60 * s, cy - 10 * s); g.stroke();
  g.restore();
}

async function drawPhoto(g, id, x, y, w, h) {
  const blob = id ? await getBlob(id).catch(() => null) : null;
  if (!blob) return false;
  const bmp = await createImageBitmap(blob);
  const k = Math.max(w / bmp.width, h / bmp.height);
  const sw = w / k, sh = h / k;
  g.drawImage(bmp, (bmp.width - sw) / 2, (bmp.height - sh) / 2, sw, sh, x, y, w, h);
  return true;
}

function drawRise(g, feed, x, y, w, h) {
  const s = feedSeries(feed);
  if (!s || s.ts.length < 3) return false;
  const fit = fitModel('baranyi', s.ts, s.Rs);
  const xMax = Math.max(...s.ts) + 0.5, yMax = Math.max(...s.Rs) + 0.4;
  const X = (t) => x + (t / xMax) * w, Y = (r) => y + h - (r / yMax) * h;
  g.strokeStyle = 'rgba(243,230,207,0.25)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y + h); g.lineTo(x + w, y + h); g.stroke();
  g.strokeStyle = TAN; g.lineWidth = 5; g.beginPath();
  for (let i = 0; i <= 60; i++) { const t = (xMax * i) / 60; const yy = Y(MODELS.baranyi(t, fit.params)); i ? g.lineTo(X(t), yy) : g.moveTo(X(t), yy); }
  g.stroke();
  g.fillStyle = CREAM;
  s.ts.forEach((t, i) => { g.beginPath(); g.arc(X(t), Y(s.Rs[i]), 9, 0, Math.PI * 2); g.fill(); });
  g.font = `400 26px ${MONO}`; g.fillStyle = MUTED;
  g.fillText(`starter ${r1(1 + Math.max(...s.Rs))}× in ${r1(Math.max(...s.ts))} h`, x, y - 14);
  return true;
}

export async function renderCard(b) {
  try { await document.fonts.ready; } catch (e) { /* ignore */ }
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = CRUST; g.fillRect(0, 0, W, H);

  const photoH = 720;
  const hasPhoto = await drawPhoto(g, b.result?.photos?.[0], 0, 0, W, photoH);
  if (!hasPhoto) {
    g.fillStyle = '#2E1F12'; g.fillRect(0, 0, W, photoH);
    drawLoaf(g, W / 2, photoH / 2, 2.6);
  }
  const grd = g.createLinearGradient(0, photoH - 120, 0, photoH);
  grd.addColorStop(0, 'rgba(58,39,22,0)'); grd.addColorStop(1, CRUST);
  g.fillStyle = grd; g.fillRect(0, photoH - 120, W, 120);

  let y = photoH + 70;
  g.fillStyle = TAN; g.font = `500 30px ${MONO}`;
  g.fillText(`LOAF #${b.num}${b.date ? ' · ' + fmtDate(b.date, { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase() : ''}`, PAD, y);
  y += 72;
  g.fillStyle = CREAM; g.font = `700 64px ${SANS}`;
  g.fillText(b.name.length > 26 ? b.name.slice(0, 25) + '…' : b.name, PAD, y);

  const s = stats(b.ing);
  y += 70;
  if (s) {
    const cells = [['Hydration', r1(s.hydration) + '%'], ['Levain flour', r1(s.pff) + '%'], ['Salt', r1(s.salt) + '%'], ['Whole grain', r1(s.wholeGrain) + '%']];
    const cw = (W - PAD * 2) / 4;
    cells.forEach(([l, v], i) => {
      g.fillStyle = CREAM; g.font = `600 52px ${MONO}`; g.fillText(v, PAD + i * cw, y + 52);
      g.fillStyle = MUTED; g.font = `400 26px ${SANS}`; g.fillText(l, PAD + i * cw, y + 92);
    });
  }
  y += 150;
  const feed = b.feedId ? feedById(b.feedId) : null;
  const drew = feed ? drawRise(g, feed, PAD + 470, y + 40, W - PAD * 2 - 470, 130) : false;
  const r = b.result || {};
  g.fillStyle = CREAM; g.font = `700 76px ${MONO}`;
  if (r.score != null) g.fillText(`${r.score}/10`, PAD, y + 90);
  g.font = `400 28px ${SANS}`; g.fillStyle = TAN;
  const tags = (r.tags || []).slice(0, 4).join(' · ');
  if (tags) g.fillText(tags.length > (drew ? 30 : 60) ? tags.slice(0, drew ? 29 : 59) + '…' : tags, PAD, y + (r.score != null ? 150 : 60));

  g.fillStyle = MUTED; g.font = `500 26px ${MONO}`;
  g.fillText('SOURDOUGH BUDDY', PAD, H - 56);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

export async function shareCard(b) {
  const blob = await renderCard(b);
  const file = new File([blob], `loaf-${b.num}.png`, { type: 'image/png' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: `Loaf #${b.num} · ${b.name}` }); return 'shared'; } catch (e) { if (e.name === 'AbortError') return 'cancelled'; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = file.name; a.click();
  return 'downloaded';
}
