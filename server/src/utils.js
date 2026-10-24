const { tz } = require('./config');
const pad = (n) => String(n).padStart(2, '0');

class HttpError extends Error {
  constructor(status, message, extra) { super(message); this.status = status; this.extra = extra; }
}
const h = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const need = (o, fields) => {
  const miss = fields.filter((f) => o[f] === undefined || o[f] === null || o[f] === '');
  if (miss.length) throw new HttpError(422, 'Missing: ' + miss.join(', '));
};
const pick = (o, keys) => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));

// ---- dates (all dates are 'YYYY-MM-DD' strings, times 'HH:MM' in company timezone)
const nowParts = (d = new Date()) => {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};
const today = () => nowParts().date;
const isISO = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T00:00:00Z'));
const toUTC = (s) => new Date(s + 'T00:00:00Z');
const addDays = (s, n) => new Date(toUTC(s).getTime() + n * 864e5).toISOString().slice(0, 10);
const eachDay = (a, b) => { const out = []; for (let d = a; d <= b; d = addDays(d, 1)) out.push(d); return out; };
const isWeekend = (s, weekend = [0, 6]) => weekend.includes(toUTC(s).getUTCDay());
const isWorking = (s, settings, hol) => !isWeekend(s, settings.weekend) && !hol.has(s);
const workingDays = (a, b, settings, hol) => (a > b ? 0 : eachDay(a, b).filter((d) => isWorking(d, settings, hol)).length);
const monthRange = (m) => { const [y, mo] = m.split('-').map(Number); return [`${m}-01`, `${m}-${pad(new Date(Date.UTC(y, mo, 0)).getUTCDate())}`]; };
const minutes = (t) => { const [h2, m] = t.split(':').map(Number); return h2 * 60 + m; };

// ---- business rules (pure functions, unit tested)
const lateAfter = (s) => { const t = minutes(s.officeStart) + s.graceMin; return `${pad(Math.floor(t / 60))}:${pad(t % 60)}`; };
const checkInStatus = (time, s) => (minutes(time) > minutes(lateAfter(s)) ? 'late' : 'present');
const hoursBetween = (a, b) => Math.max(0, (minutes(b) - minutes(a)) / 60);
const haversine = (lat1, lon1, lat2, lon2) => {
  const R = 6371000, r = (x) => (x * Math.PI) / 180;
  const dLat = r(lat2 - lat1), dLon = r(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(r(lat1)) * Math.cos(r(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
};
// Tax slab on annual gross: 0-600k:0; 5% to 1.2M; 30k+15% to 2.4M; 210k+25% to 3.6M; 510k+35% above
const annualTax = (a) => {
  if (a <= 600000) return 0;
  if (a <= 1200000) return (a - 600000) * 0.05;
  if (a <= 2400000) return 30000 + (a - 1200000) * 0.15;
  if (a <= 3600000) return 210000 + (a - 2400000) * 0.25;
  return 510000 + (a - 3600000) * 0.35;
};
const round = (n, d = 2) => (n == null || isNaN(n) ? null : Math.round(n * 10 ** d) / 10 ** d);

// ---- CSV
function parseCSV(text) {
  const rows = []; let row = [], cur = '', q = false;
  const push = () => { row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; push(); }
    else cur += c;
  }
  if (cur || row.length) push();
  return rows;
}
const toCSV = (rows) => rows.map((r) => r.map((v) => { v = v == null ? '' : String(v); return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }).join(',')).join('\n');

module.exports = { HttpError, h, need, pick, nowParts, today, isISO, addDays, eachDay, isWeekend, isWorking, workingDays, monthRange, minutes, lateAfter, checkInStatus, hoursBetween, haversine, annualTax, round, parseCSV, toCSV };
