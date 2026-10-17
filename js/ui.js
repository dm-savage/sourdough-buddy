// Small shared helpers: escaping, formatting, icons, and SVG charts.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const uid = (p = 'id') => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
export const nowISO = () => toLocalISO(new Date());
export function toLocalISO(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
export const ms = (iso) => new Date(iso).getTime();

export function fmtTime(d) {
  if (d == null) return '—';
  const x = d instanceof Date ? d : new Date(d);
  let h = x.getHours();
  const m = String(x.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ap}`;
}
export function fmtClock(d) { return fmtTime(d).replace(/ (AM|PM)$/, ''); }
export function fmtDate(d, opts = { month: 'short', day: 'numeric' }) {
  if (!d) return '—';
  return new Date(d.length === 10 ? d + 'T12:00' : d).toLocaleDateString('en-US', opts);
}
export function fmtDur(min) {
  if (min == null || !Number.isFinite(min)) return '—';
  const sign = min < 0 ? '−' : '';
  min = Math.abs(Math.round(min));
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${sign}${h} h ${String(m).padStart(2, '0')} m` : `${sign}${m} min`;
}
export function fmtCountdown(sec) {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`;
}
export const daysAgo = (iso) => Math.floor((Date.now() - ms(iso)) / 86400000);
export const r1 = (v) => (v == null || !Number.isFinite(v) ? '—' : (Math.round(v * 10) / 10).toString());

// ---------- icons (inline stroke SVG) ----------
const svg = (body, size = 22, extra = '') => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${body}</svg>`;
export const ICON = {
  today: (s) => svg('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>', s),
  jar: (s) => svg('<path d="M7 3h10M8 3v3l-2 2v11a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V8l-2-2V3"/><path d="M6 13h12"/>', s),
  timer: (s) => svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M10 2.5h4"/>', s),
  book: (s) => svg('<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19"/>', s),
  loaf: (s) => svg('<path d="M3 16.5C3 10.5 7.5 7 12 7s9 3.5 9 9.5c0 1.4-1 2-2.3 2H5.3C4 18.5 3 17.9 3 16.5z"/><path d="M7.5 12.8c2.8-2 6-2.4 9-1.6"/>', s),
  mic: (s) => svg('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>', s),
  camera: (s) => svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', s),
  note: (s) => svg('<path d="M5 4h14v16H5z"/><path d="M8 9h8M8 13h8M8 17h5"/>', s),
  check: (s) => svg('<path d="M4 12.5l5 5L20 6.5"/>', s, 'stroke-width="2.4"'),
  sliders: (s) => svg('<path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="17" r="2"/>', s),
  eye: (s) => svg('<circle cx="12" cy="12" r="3"/><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/>', s),
  pencil: (s) => svg('<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>', s),
  calc: (s) => svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 11h2M12 11h2M16 11h0M8 15h2M12 15h2M8 18h2M12 18h2M16 15v3"/>', s),
  back: (s) => svg('<path d="M15 5l-7 7 7 7"/>', s),
};

// ---------- charts ----------
// Generic time-series chart. xs in hours. All drawing coords computed here.
// opts: {w,h, xMax, yMin, yMax, yTicks:[{v,label}], xTicks:[{v,label}], points:[[x,y]], curve:fn, band:fn,
//        lines:[{fn,color,dash,width,label}], vlines:[{x,label,color}], hband:{y0,y1,label}, hline:{y,label}}
export function chart(o) {
  const W = o.w || 326, H = o.h || 190, ml = 40, mr = 12, mt = 12, mb = 26;
  const pw = W - ml - mr, ph = H - mt - mb;
  const X = (x) => ml + (x / o.xMax) * pw;
  const Y = (y) => mt + (1 - (y - o.yMin) / (o.yMax - o.yMin)) * ph;
  const cy = (y) => Math.max(mt - 2, Math.min(mt + ph, Y(y)));
  const path = (fn, x0 = 0, x1 = o.xMax) => {
    let d = '';
    for (let i = 0; i <= 60; i++) {
      const x = x0 + ((x1 - x0) * i) / 60;
      const y = fn(x);
      if (!Number.isFinite(y)) continue;
      d += `${d ? 'L' : 'M'}${X(x).toFixed(1)} ${cy(y).toFixed(1)} `;
    }
    return d;
  };
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${esc(o.label || 'chart')}">`;
  if (o.hband) s += `<rect x="${ml}" y="${cy(o.hband.y1)}" width="${pw}" height="${Math.max(0, cy(o.hband.y0) - cy(o.hband.y1))}" fill="var(--warm)" fill-opacity="0.22"/>` +
    (o.hband.label ? `<text class="ax" x="${W - mr - 2}" y="${cy(o.hband.y1) - 4}" text-anchor="end" style="fill:var(--warm-ink)">${esc(o.hband.label)}</text>` : '');
  for (const t of o.yTicks || []) s += `<line x1="${ml}" x2="${ml + pw}" y1="${Y(t.v)}" y2="${Y(t.v)}" stroke="var(--grid)"/><text class="ax" x="${ml - 6}" y="${Y(t.v) + 3.5}" text-anchor="end">${esc(t.label)}</text>`;
  s += `<line x1="${ml}" x2="${ml + pw}" y1="${mt + ph}" y2="${mt + ph}" stroke="var(--axis)"/>`;
  for (const t of o.xTicks || []) s += `<text class="ax" x="${X(t.v)}" y="${H - 8}" text-anchor="middle">${esc(t.label)}</text>`;
  if (o.hline) s += `<line x1="${ml}" x2="${ml + pw}" y1="${Y(o.hline.y)}" y2="${Y(o.hline.y)}" stroke="var(--warm-ink)" stroke-width="1.5" stroke-dasharray="4 3"/>`;
  if (o.band) {
    let up = '', lo = [];
    for (let i = 0; i <= 60; i++) {
      const x = (o.xMax * i) / 60;
      const [a, b] = o.band(x);
      up += `${up ? 'L' : 'M'}${X(x).toFixed(1)} ${cy(b).toFixed(1)} `;
      lo.push(`L${X(x).toFixed(1)} ${cy(a).toFixed(1)}`);
    }
    s += `<path d="${up}${lo.reverse().join(' ')} Z" fill="var(--series-1)" fill-opacity="0.13"/>`;
  }
  for (const l of o.lines || []) s += `<path d="${path(l.fn, l.x0, l.x1)}" fill="none" stroke="${l.color}" stroke-width="${l.width || 2}" ${l.dash ? `stroke-dasharray="${l.dash}"` : ''} stroke-linecap="round"/>`;
  if (o.curve) s += `<path d="${path(o.curve)}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linecap="round"/>`;
  for (const v of o.vlines || []) {
    if (v.x == null || v.x < 0 || v.x > o.xMax) continue;
    s += `<line x1="${X(v.x)}" x2="${X(v.x)}" y1="${mt + 6}" y2="${mt + ph}" stroke="${v.color || 'var(--muted)'}" stroke-dasharray="2 3"/>` +
      (v.label ? `<text class="ax" x="${X(v.x) + 4}" y="${mt + 12}" style="fill:${v.color || 'var(--muted)'}">${esc(v.label)}</text>` : '');
  }
  for (const g of o.pointGroups || []) for (const [x, y] of g.pts) s += `<circle cx="${X(x)}" cy="${cy(y)}" r="4.5" fill="${g.color}" stroke="var(--card)" stroke-width="2"/>`;
  for (const [x, y] of o.points || []) s += `<circle cx="${X(x)}" cy="${cy(y)}" r="5.5" fill="var(--ink)" stroke="var(--card)" stroke-width="2"/>`;
  for (const t of o.labels || []) s += `<text class="lbl-svg" x="${X(t.x)}" y="${cy(t.y)}">${esc(t.text)}</text>`;
  return s + '</svg>';
}

export function hourTicks(startISO, xMax) {
  const t0 = new Date(startISO);
  const step = xMax > 8 ? 4 : 2;
  const out = [];
  for (let h = 0; h <= xMax + 0.01; h += step) out.push({ v: h, label: fmtClock(new Date(t0.getTime() + h * 3.6e6)) });
  return out;
}
